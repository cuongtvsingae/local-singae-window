async function routeAiDecision({ ai, authedUserId }) {
	// Always show ai.message to user; action/step are internal orchestration.
	if (!ai || ai.status !== 'ok') return { didCreateTask: false };

	// New contract: create task ONLY when action="CREATE_TASK"
	if (ai.action === 'CREATE_TASK') return { didCreateTask: true };
	return { didCreateTask: false };
}

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db, getDefaultUserId } = require('../db');
const config = require('../config');
const axios = require('axios');
const { decide, buildSystemPrompt } = require('../aiService');
const { optionalAuth, authRequired, requireRole } = require('../auth');
const { fetchSheetValuesByName, postRowsViaAppsScript, appendLogs, ensureChatSamplesGrowth, appendLearning } = require('../sheets');

const router = express.Router();

router.use(optionalAuth);

// In-memory cache for Sheets reads to avoid intermittent gviz failures causing missing context on later turns.
// Note: prompt is NOT loaded from Sheets. The app uses a single prompt from buildSystemPrompt() (src/aiService.js).
const sheetsCache = {
	samples: [],
	knowlege: [],
	updatedAt: 0,
	lastError: { samples: '', knowlege: '' },
};

// Current user profile (requires Bearer token)
router.get('/me', authRequired, async (req, res) => {
	const u = getAuthedUser(req);
	if (!u?.id) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
	db.get(`SELECT id, username, full_name, gender, role FROM users WHERE id = ?`, [u.id], (err, row) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		return res.json({ status: 'ok', data: row || null });
	});
});

// Admin: quick probe to verify AI upstream is reachable (separate from /health which only checks this app)
router.get('/admin/ai/health', authRequired, requireRole('admin'), async (_req, res) => {
	const url = String(config.ai.url || '').trim();
	const model = String(config.ai.model || '').trim();
	if (!url || !model) {
		return res.status(400).json({ status: 'error', message: 'AI_API_URL hoặc AI_MODEL chưa cấu hình' });
	}
	const headers = { 'Content-Type': 'application/json' };
	if (config.ai.apiKey) headers['Authorization'] = config.ai.apiKey;
	try {
		const started = Date.now();
		const payload = {
			model,
			messages: [{ role: 'user', content: 'ping' }],
			stream: false,
		};
		await axios.post(url, payload, { headers, timeout: 8000 });
		return res.json({ status: 'ok', ms: Date.now() - started });
	} catch (e) {
		return res.status(503).json({
			status: 'error',
			message: String(e?.message || e),
			code: String(e?.code || ''),
		});
	}
});

// Meta: rooms/types for order form
router.get('/meta/rooms', (_req, res) => {
	db.all(
		`SELECT id, name, sort_order, active FROM task_rooms WHERE active = 1 ORDER BY sort_order ASC, name ASC`,
		[],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});
router.get('/meta/types', (_req, res) => {
	db.all(
		`SELECT id, name, sort_order, active FROM task_types WHERE active = 1 ORDER BY sort_order ASC, name ASC`,
		[],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});

// Admin: manage rooms/types
router.get('/admin/meta/rooms', authRequired, requireRole('admin'), (_req, res) => {
	db.all(`SELECT id, name, sort_order, active FROM task_rooms ORDER BY sort_order ASC, name ASC`, [], (err, rows) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		return res.json({ status: 'ok', data: rows || [] });
	});
});
router.post(
	'/admin/meta/rooms',
	authRequired,
	requireRole('admin'),
	[body('name').isString().isLength({ min: 1, max: 200 }), body('sort_order').optional().isInt({ min: 0, max: 9999 }), body('active').optional().isBoolean()],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { name, sort_order = 0, active = true } = req.body;
		db.run(`INSERT INTO task_rooms (name, sort_order, active) VALUES (?, ?, ?)`, [name, Number(sort_order), active ? 1 : 0], function (err) {
			if (err) return res.status(400).json({ status: 'error', message: err.message });
			return res.status(201).json({ status: 'ok', id: this.lastID });
		});
	}
);
router.patch(
	'/admin/meta/rooms/:id',
	authRequired,
	requireRole('admin'),
	[param('id').isInt({ min: 1 }), body('name').optional().isString().isLength({ min: 1, max: 200 }), body('sort_order').optional().isInt({ min: 0, max: 9999 }), body('active').optional().isBoolean()],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const patch = req.body || {};
		db.get(`SELECT id, name, sort_order, active FROM task_rooms WHERE id = ?`, [id], (err, row) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });
			const next = {
				name: patch.name ?? row.name,
				sort_order: patch.sort_order ?? row.sort_order,
				active: patch.active === undefined ? row.active : patch.active ? 1 : 0,
			};
			db.run(`UPDATE task_rooms SET name = ?, sort_order = ?, active = ? WHERE id = ?`, [next.name, Number(next.sort_order), Number(next.active), id], function (e2) {
				if (e2) return res.status(400).json({ status: 'error', message: e2.message });
				return res.json({ status: 'ok' });
			});
		});
	}
);

router.get('/admin/meta/types', authRequired, requireRole('admin'), (_req, res) => {
	db.all(`SELECT id, name, sort_order, active FROM task_types ORDER BY sort_order ASC, name ASC`, [], (err, rows) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		return res.json({ status: 'ok', data: rows || [] });
	});
});
router.post(
	'/admin/meta/types',
	authRequired,
	requireRole('admin'),
	[body('name').isString().isLength({ min: 1, max: 200 }), body('sort_order').optional().isInt({ min: 0, max: 9999 }), body('active').optional().isBoolean()],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { name, sort_order = 0, active = true } = req.body;
		db.run(`INSERT INTO task_types (name, sort_order, active) VALUES (?, ?, ?)`, [name, Number(sort_order), active ? 1 : 0], function (err) {
			if (err) return res.status(400).json({ status: 'error', message: err.message });
			return res.status(201).json({ status: 'ok', id: this.lastID });
		});
	}
);
router.patch(
	'/admin/meta/types/:id',
	authRequired,
	requireRole('admin'),
	[param('id').isInt({ min: 1 }), body('name').optional().isString().isLength({ min: 1, max: 200 }), body('sort_order').optional().isInt({ min: 0, max: 9999 }), body('active').optional().isBoolean()],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const patch = req.body || {};
		db.get(`SELECT id, name, sort_order, active FROM task_types WHERE id = ?`, [id], (err, row) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });
			const next = {
				name: patch.name ?? row.name,
				sort_order: patch.sort_order ?? row.sort_order,
				active: patch.active === undefined ? row.active : patch.active ? 1 : 0,
			};
			db.run(`UPDATE task_types SET name = ?, sort_order = ?, active = ? WHERE id = ?`, [next.name, Number(next.sort_order), Number(next.active), id], function (e2) {
				if (e2) return res.status(400).json({ status: 'error', message: e2.message });
				return res.json({ status: 'ok' });
			});
		});
	}
);

// Admin maintenance: clear all chat history
router.delete('/admin/clear-chat', authRequired, requireRole('admin'), (_req, res) => {
	db.run(`DELETE FROM chat_messages`, [], (err) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['clear_chat', JSON.stringify({})]);
		return res.json({ status: 'ok' });
	});
});

// Admin maintenance: clear all tasks
router.delete('/admin/clear-tasks', authRequired, requireRole('admin'), (_req, res) => {
	db.run(`DELETE FROM tasks`, [], (err) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['clear_tasks', JSON.stringify({})]);
		return res.json({ status: 'ok' });
	});
});

// (Removed old DB-based prompt admin endpoints; prompt now reads from Google Sheet 'promt' A1)
// Admin: create user with mandatory gender
router.post(
	'/admin/users',
	authRequired,
	requireRole('admin'),
	[
		body('username').isString().isLength({ min: 3, max: 64 }),
		body('gender').isIn(['male', 'female']),
		body('full_name').optional().isString().isLength({ max: 200 }),
		body('password').optional().isString().isLength({ min: 3, max: 200 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { username, full_name = '', gender, password = '' } = req.body;
		try {
			const bcrypt = require('bcrypt');
			let password_hash = null;
			if (password) {
				password_hash = await bcrypt.hash(password, 10);
			}
			db.run(
				`INSERT INTO users (username, full_name, gender, role, password_hash, created_at, updated_at)
				 VALUES (?, ?, ?, 'employee', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				[username, full_name, gender, password_hash],
				function (err) {
					if (err) return res.status(400).json({ status: 'error', message: err.message });
					db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['create_user', JSON.stringify({ id: this.lastID, username, gender })]);
					return res.status(201).json({ id: this.lastID, username, gender });
				}
			);
		} catch (err) {
			return res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

// Admin: update user gender by id
router.patch(
	'/admin/users/:id/gender',
	authRequired,
	requireRole('admin'),
	[param('id').isInt({ min: 1 }), body('gender').isIn(['male', 'female'])],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const { gender } = req.body;
		db.run(`UPDATE users SET gender = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [gender, id], function (err) {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (this.changes === 0) return res.status(404).json({ status: 'error', message: 'User not found' });
			db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['update_gender', JSON.stringify({ id: Number(id), gender })]);
			return res.json({ id: Number(id), gender });
		});
	}
);

// Admin: update user gender by username
router.patch(
	'/admin/users/by-username/gender',
	authRequired,
	requireRole('admin'),
	[body('username').isString().isLength({ min: 3, max: 64 }), body('gender').isIn(['male', 'female'])],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { username, gender } = req.body;
		db.run(`UPDATE users SET gender = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?`, [gender, username], function (err) {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (this.changes === 0) return res.status(404).json({ status: 'error', message: 'User not found' });
			db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['update_gender', JSON.stringify({ username, gender })]);
			return res.json({ username, gender });
		});
	}
);

// Admin: search users (lightweight)
router.get(
	'/admin/users',
	authRequired,
	requireRole('admin'),
	(req, res) => {
		const q = String(req.query.q || '').trim();
		const sql = q
			? `SELECT id, username, full_name, role, gender FROM users WHERE username LIKE ? OR full_name LIKE ? ORDER BY id DESC LIMIT 50`
			: `SELECT id, username, full_name, role, gender FROM users ORDER BY id DESC LIMIT 50`;
		const params = q ? [`%${q}%`, `%${q}%`] : [];
		db.all(sql, params, (err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		});
	}
);

// Admin: log a restart server action (for auditing); actual restart handled externally (e.g., nodemon/PM2)
router.post('/admin/restart', authRequired, requireRole('admin'), (req, res) => {
	db.run(`INSERT INTO admin_actions (action, meta_json) VALUES (?, ?)`, ['restart_server', JSON.stringify({ by: 'admin' })], (err) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		return res.json({ status: 'ok' });
	});
});

// (removed) Admin prompt endpoint: app uses a single prompt in src/aiService.js (buildSystemPrompt)

// Admin: generate sample rows for 'chat_messages' and 'knowlege' and optionally push via Apps Script
router.post('/admin/sheets/generate-samples', authRequired, requireRole('admin'), async (req, res) => {
	const chatSamples = [
		{ topic: 'printer', user: 'Máy in không in được', assistant: 'Anh/chị đang ở phòng nào? Có cần gấp không?\n- Tôi sẽ kiểm tra queue và kết nối.\n- Sẽ tạo ticket nếu cần.' },
		{ topic: 'network', user: 'Không vào được web công việc', assistant: 'Anh/chị ở phòng nào? Có báo lỗi cụ thể không?\n- Kiểm tra mạng LAN/WiFi.\n- Tạo ticket nếu ảnh hưởng công việc.' },
		{ topic: 'office-excel', user: 'Excel mở file chậm', assistant: 'Anh/chị dùng username nào trên máy? Chậm với mọi file hay 1 file?\n- Kiểm tra add-in/phiên bản Office.' },
	];
	const knowlege = [
		{ key: 'CRM_GETFLY_URL', value: 'https://app.getflycrm.com', notes: 'CRM chính', link: 'https://app.getflycrm.com' },
		{ key: 'SIMLY_URL', value: 'https://simly.vn', notes: 'CRM SIMLY', link: 'https://simly.vn' },
		{ key: 'OMICALL_DASHBOARD', value: 'https://my.omicall.com', notes: 'Tổng đài', link: 'https://my.omicall.com' },
		{ key: 'LAN_PRINTER_IP_201', value: '192.168.1.201', notes: 'Máy in tầng 2', link: '' },
	];

	const wantWrite = String(req.query.write || '').toLowerCase() === 'true';
	if (wantWrite) {
		const r1 = await postRowsViaAppsScript('chat_messages', [Object.keys(chatSamples[0]), ...chatSamples.map((r) => Object.values(r))]);
		const r2 = await postRowsViaAppsScript('knowlege', [Object.keys(knowlege[0]), ...knowlege.map((r) => Object.values(r))]);
		return res.json({ status: (r1.ok && r2.ok) ? 'ok' : 'error', write: { chat_messages: r1, knowlege: r2 }, preview: { chatSamples, knowlege } });
	}
	return res.json({ status: 'ok', preview: { chatSamples, knowlege } });
});

// Central task field config: add new fields here once.
// - required: included in missing_fields computation
// - includeInPrompt: injected into AI system prompt so model knows what we track
const TASK_FIELD_DEFS = [
	{ key: 'title', required: true, includeInPrompt: true },
	{ key: 'description', required: false, includeInPrompt: true },
	{ key: 'level', required: true, includeInPrompt: true }, // high|medium|low
	{ key: 'room', required: true, includeInPrompt: true }, // phòng/khu vực
	{ key: 'type', required: true, includeInPrompt: true }, // loại sự cố/yêu cầu
	{ key: 'deadline', required: false, includeInPrompt: true }, // hạn xử lý (nếu có)
];

function normalizeValue(v) {
	if (v === null || v === undefined) return '';
	const s = String(v).trim();
	return s;
}

function extractKeywords(text, max = 6) {
	const t = String(text || '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.split(/\s+/)
		.filter((w) => w.length >= 3);
	const uniq = [];
	for (const w of t) {
		if (!uniq.includes(w)) uniq.push(w);
		if (uniq.length >= max) break;
	}
	return uniq.join(', ');
}

function withTimeout(promise, ms, label) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(label || 'TIMEOUT')), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function detectCreateTaskIntent(prompt) {
	const p = String(prompt || '').toLowerCase();
	// lightweight heuristic; primary signal is previous AI state (see below)
	return (
		p.includes('tạo task') ||
		p.includes('tạo yêu cầu') ||
		p.includes('nhờ it') ||
		p.includes('bị lỗi') ||
		p.includes('không vào được') ||
		p.includes('máy') ||
		p.includes('mạng') ||
		p.includes('printer') ||
		p.includes('máy in')
	);
}

function kbSearch(query, limit = 4) {
	const q = String(query || '').trim();
	if (!q) return Promise.resolve([]);
	// basic sanitize for FTS query
	const safe = q.replace(/["']/g, ' ').replace(/\s+/g, ' ').trim();
	return new Promise((resolve) => {
		db.all(
			`SELECT d.id, d.title, d.content, d.tags
			 FROM kb_fts f
			 JOIN kb_docs d ON d.id = f.rowid
			 WHERE kb_fts MATCH ?
			 LIMIT ?`,
			[safe, Math.min(Number(limit) || 4, 8)],
			(err, rows) => {
				if (err || !rows) return resolve([]);
				resolve(rows);
			}
		);
	});
}

function normalizeActionForLock(action) {
	const a = String(action || '').trim();
	if (a === 'CREATE_TASK') return 'TASK';
	if (a === 'ANSWER_FAQ') return 'FAQ';
	return a;
}

function handleValidation(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ status: 'error', errors: errors.array() });
	}
}

function getAuthedUser(req) {
	const u = req.user;
	if (!u || u.id == null) return null;
	return { id: u.id, username: u.username || null, role: u.role || 'employee' };
}

// Dashboard summary for UI cards
router.get('/dashboard/summary', (_req, res) => {
	const sql = `
		SELECT
			COUNT(*) as total,
			SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
			SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
			SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
		FROM tasks
	`;
	db.get(sql, [], (err, row) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		res.json({
			total_tasks: row?.total || 0,
			open_tasks: row?.open || 0,
			in_progress_tasks: row?.in_progress || 0,
			done_tasks: row?.done || 0,
		});
	});
});

// Expose RAG status for frontend first-load spinner/cache
router.get('/rag/status', (_req, res) => {
	try {
		const { loadIndex } = require('../embeddings');
		const idx = loadIndex();
		if (!idx) return res.status(503).json({ status: 'error', message: 'Embeddings not ready' });
		return res.json({ status: 'ok', built_at: idx.built_at, doc_count: idx.doc_count });
	} catch (e) {
		return res.status(500).json({ status: 'error', message: String(e?.message || e) });
	}
});

// List tasks (UI expects array)
router.get('/tasks', (_req, res) => {
	db.all(
		`
		SELECT
			t.id,
			t.title,
			t.description,
			t.room,
			t.type,
			t.deadline,
			t.status,
			t.level,
			t.created_at,
			t.created_by,
			t.created_by_user_id,
			u.username as created_by_username,
			u.full_name as created_by_full_name
		FROM tasks t
		LEFT JOIN users u ON u.id = t.created_by_user_id
		ORDER BY t.created_at DESC
		`,
		[],
		(err, rows) => {
		if (err) return res.status(500).json({ status: 'error', message: err.message });
		res.json(rows || []);
		}
	);
});

// Create task (UI posts {title, description})
router.post(
	'/tasks',
	[
		body('title').isString().isLength({ min: 1, max: 200 }),
		body('description').optional().isString().isLength({ max: 5000 }),
		body('room').optional().isString().isLength({ max: 200 }),
		body('type').optional().isString().isLength({ max: 200 }),
		body('deadline').optional().isString().isLength({ max: 64 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { title, description = '', level = 'medium', room = '', type = '', deadline = null } = req.body;
		try {
			const userId = await getDefaultUserId();
			const authedUser = getAuthedUser(req);
			const authedUserId = authedUser?.id || null;
			db.run(
				`INSERT INTO tasks (title, description, room, type, deadline, level, status, user_id, created_by, created_by_user_id)
				 VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'user', ?)`,
				[title, description, String(room || ''), String(type || ''), deadline ? String(deadline) : null, level, userId, authedUserId],
				function (err) {
					if (err) return res.status(500).json({ status: 'error', message: err.message });
					res.status(201).json({ id: this.lastID });
				}
			);
		} catch (err) {
			res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

// Update task status (UI calls PATCH /tasks/:id/status)
router.patch(
	'/tasks/:id/status',
	[param('id').isInt({ min: 1 }), body('status').isString().isLength({ min: 2, max: 32 })],
	authRequired,
	requireRole('admin'),
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const { status } = req.body;
		db.run(
			`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			[status, id],
			function (err) {
				if (err) return res.status(500).json({ status: 'error', message: err.message });
				if (this.changes === 0) return res.status(404).json({ status: 'error', message: 'Task not found' });
				res.json({ id: Number(id), status });
			}
		);
	}
);

// AI decision (UI calls POST /ai/decide and expects strict JSON keys)
router.post(
	'/ai/decide',
	[body('prompt').isString().isLength({ min: 1 })],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { prompt } = req.body;

		const authedUser = getAuthedUser(req);
		const authedUserId = authedUser?.id || null;

		// Growth: opportunistically add 1-2 chat samples based on current prompt (non-blocking)
		ensureChatSamplesGrowth(prompt).catch(() => {});

		if (authedUserId) {
			// store user chat message; mark OPEN at the start of a new session (after END or no history)
			const lastAiAction = await new Promise((resolve) => {
				db.get(
					`SELECT ai_action FROM chat_messages
					 WHERE user_id = ? AND kind = 'ai_response'
					 ORDER BY id DESC LIMIT 1`,
					[authedUserId],
					(_err, row) => resolve(String(row?.ai_action || ''))
				);
			});
			const userAction = !lastAiAction || lastAiAction === 'END' ? 'OPEN' : '';
			db.run(
				`INSERT INTO chat_messages (user_id, role, text, kind, meta_json, user_action)
				 VALUES (?, 'user', ?, 'userreponse', ?, ?)`,
				[authedUserId, prompt, JSON.stringify({ type: 'USER_PROMPT' }), userAction]
			);
		}

		let context = [];
		if (authedUserId) {
			// send history only from the most recent OPEN (oldest -> newest)
			const lastOpenId = await new Promise((resolve) => {
				db.get(
					`SELECT id FROM chat_messages
					 WHERE user_id = ?
					   AND kind = 'userreponse'
					   AND user_action = 'OPEN'
					 ORDER BY id DESC
					 LIMIT 1`,
					[authedUserId],
					(_err, row) => resolve(Number(row?.id || 0))
				);
			});
			context = await new Promise((resolve) => {
				db.all(
					`SELECT role, text, created_at, meta_json, kind, user_action, ai_action
					 FROM chat_messages
					 WHERE user_id = ?
					   AND (? = 0 OR id >= ?)
					 ORDER BY id DESC
					 LIMIT 120`,
					[authedUserId, lastOpenId, lastOpenId],
					(err, rows) => {
						if (err || !rows) return resolve([]);
						const rawRows = rows.slice().reverse();
						const meta = rawRows.map((r) => ({
							at: r.created_at,
							role: r.role === 'assistant' ? 'assistant' : 'user',
							kind: String(r.kind || ''),
							action: String((r.role === 'assistant' ? r.ai_action : r.user_action) || ''),
						}));
						const msgs = rawRows
							.slice()
							.map((r) => ({
								role: r.role === 'assistant' ? 'assistant' : 'user',
								// Important: do NOT prefix the content with log-like tags; it makes the model mimic that format.
								// Metadata is sent separately via a system JSON block below.
								content: String(r.text || ''),
							}));
						resolve([{ role: 'system', content: `HISTORY_META_JSON:\n${JSON.stringify(meta)}` }, ...msgs]);
					}
				);
			});
		}

		// Add role-aware system context so AI can distinguish employee vs admin
		let nameContext = [];
		if (authedUserId) {
			nameContext = await new Promise((resolve) => {
				db.get(`SELECT full_name, gender FROM users WHERE id = ?`, [authedUserId], (_err, row) => {
					const fullName = String(row?.full_name || '').trim();
					const lastName = fullName ? fullName.split(/\s+/).slice(-1)[0] : '';
					const gender = String(row?.gender || '').trim(); // may be empty
					resolve([
						{ role: 'system', content: `Người hỏi: full_name=${fullName || '(empty)'}, call_name=${lastName || '(empty)'}, gender=${gender || 'unknown'}.` },
					]);
				});
			});
		}

		const roleContext = authedUser
			? [
					{ role: 'system', content: `Người hỏi: username=${authedUser.username || authedUserId}, role=${authedUser.role}.` },
					...nameContext,
			  ]
			: [{ role: 'system', content: 'Người hỏi: anonymous (chưa đăng nhập).' }];

		// Derive current action + collected task fields from last ai_response.
		// This lets the AI reason with the current state instead of backend forcing decisions.
		let actionContext = [];
		let taskStateContext = [];
		let lockState = { lastAction: 'END' };
		if (authedUserId) {
			const state = await new Promise((resolve) => {
				db.get(
					`SELECT ai_action, meta_json
					 FROM chat_messages
					 WHERE user_id = ? AND kind = 'ai_response'
					 ORDER BY id DESC LIMIT 1`,
					[authedUserId],
					(_err, row) => {
						try {
							const meta = row?.meta_json ? JSON.parse(row.meta_json) : null;
							const resp = meta?.response || {};
							const lastAction = row?.ai_action || resp?.action || 'OPEN';
							const lastTask = resp?.data?.task && typeof resp.data.task === 'object' ? resp.data.task : {};
							resolve({ lastAction, lastTask });
						} catch {
							resolve({ lastAction: 'OPEN', lastTask: {} });
						}
					}
				);
			});
			actionContext = [{ role: 'system', content: `Last action (server): ${String(state.lastAction || '')}` }];
			lockState = { lastAction: String(state.lastAction || 'OPEN') };

			// Determine if we are in a task-creation session (prefer previous AI state, fallback to heuristic)
			const inTaskFlow =
				['ASK', 'COLLECT_INFOMATION', 'CONFIRM', 'CREATE_TASK'].includes(String(state.lastAction || '')) || detectCreateTaskIntent(prompt);

			if (inTaskFlow) {
				const fieldKeysToCollect = TASK_FIELD_DEFS.filter((f) => f.includeInPrompt).map((f) => f.key);
				const requiredKeys = TASK_FIELD_DEFS.filter((f) => f.required).map((f) => f.key);

				// collected: only from the last AI task object (simple + predictable)
				const collected = {};
				for (const k of fieldKeysToCollect) {
					const v = normalizeValue(state.lastTask?.[k]);
					if (v) collected[k] = v;
				}

				const missing = [];
				for (const k of requiredKeys) {
					const v = normalizeValue(collected[k] ?? state.lastTask?.[k]);
					if (!v) missing.push(k);
				}

				taskStateContext = [
					{ role: 'system', content: `Intent (server): TASK_SESSION` },
					{ role: 'system', content: `Task fields to collect: ${fieldKeysToCollect.join(', ')}` },
					{ role: 'system', content: `Task fields collected so far (JSON): ${JSON.stringify(collected)}` },
					{ role: 'system', content: `Task fields missing (required): ${missing.join(', ') || '(none)'}` },
				];
			} else {
				taskStateContext = [{ role: 'system', content: `Intent (server): NOT_TASK_SESSION` }];
			}
		}

		// KNOWLEDGE via embeddings topK -> context
		let ragContext = [{ role: 'system', content: 'KB (RAG): không có tài liệu liên quan.' }];
		try {
			const { loadIndex, searchTopK } = require('../embeddings');
			const idx = loadIndex();
			if (idx) {
				const hits = searchTopK(idx, prompt, 6);
				if (hits.length > 0) {
					const content =
						'KB (RAG) - thông tin liên quan (chỉ dùng để trả lời chính xác hơn, không bịa):\n' +
						hits.map((h, i) => `#${i + 1}\n${h.text}`).join('\n\n');
					ragContext = [{ role: 'system', content }];
				}
			}
		} catch {
			// ignore
		}

		// DB rooms/types options for AI (send every turn)
		let roomTypeContext = [];
		try {
			const rooms = await new Promise((resolve) => {
				db.all(
					`SELECT name FROM task_rooms WHERE active = 1 ORDER BY sort_order ASC, name ASC LIMIT 200`,
					[],
					(_e, rows) => resolve((rows || []).map((r) => String(r.name || '')).filter(Boolean))
				);
			});
			const types = await new Promise((resolve) => {
				db.all(
					`SELECT name FROM task_types WHERE active = 1 ORDER BY sort_order ASC, name ASC LIMIT 50`,
					[],
					(_e, rows) => resolve((rows || []).map((r) => String(r.name || '')).filter(Boolean))
				);
			});
			roomTypeContext = [
				{
					role: 'system',
					content:
						`DB_OPTIONS_JSON:\n` +
						JSON.stringify(
							{
								rooms,
								types,
								levels: ['high', 'medium', 'low'],
								room_rule:
									'If user gives a room outside rooms list, you must action=COLLECT_INFOMATION, data.missing_fields=["room"], and ask to confirm/select a valid room from the list.',
							},
							null,
							2
						),
				},
			];
		} catch {
			// ignore
		}

		// Flow lock: a session is only finished when last_action="END"
		const lockContext = [
			{
				role: 'system',
				content:
					`FLOW_LOCK: last_action=${lockState.lastAction}. ` +
					`Rule: Phiên chỉ kết thúc khi last_action="END". ` +
					`Nếu last_action!="END" thì bạn KHÔNG được reset lại OPEN cho phiên mới, chỉ được tiếp tục phiên hiện tại.`,
			},
		];

		// Bỏ lưu cache request nội bộ trong DB; chỉ log lên Google Sheet

		// Prepare sheet samples/knowledge to append after user's prompt
		let sheetSamples = [];
		let sheetKnow = [];
		let learningKb = [];
		let kbHits = [];
		const qText = String(prompt || '').toLowerCase();
		try {
			const sm = await fetchSheetValuesByName('chat_messages');
			const header = sm?.[0] || ['topic','user','assistant'];
			const body = (sm || []).slice(1).filter((r) => r && r.length >= 2);
			for (let i = 0; i < Math.min(6, body.length); i++) {
				const r = body[i];
				const obj = Object.fromEntries(r.map((v, idx) => [header[idx] || `c${idx}`, v]));
				sheetSamples.push({ topic: obj.topic || '', user: obj.user || '', assistant: obj.assistant || '' });
			}
			if (sheetSamples.length > 0) sheetsCache.samples = sheetSamples;
			sheetsCache.lastError.samples = '';
		} catch {}
		try {
			const kn = await fetchSheetValuesByName('knowlege');
			const header = kn?.[0] || ['key','value','notes','link'];
			const body = (kn || []).slice(1);
			const rows = [];
			for (let i = 0; i < body.length; i++) {
				const r = body[i];
				const obj = Object.fromEntries(r.map((v, idx) => [header[idx] || `k${idx}`, v]));
				rows.push({ key: obj.key || '', value: obj.value || '', notes: obj.notes || '', link: obj.link || '' });
			}
			const scoreRow = (it) => {
				let s = 0;
				const parts = [it.key, it.value, it.notes, it.link].map((x) => String(x || '').toLowerCase());
				for (const p of parts) {
					if (!p) continue;
					if (qText.includes(p)) s += 2;
					const tokens = p.split(/[^a-z0-9\u00C0-\u1EF9]+/i).filter((t) => t.length >= 3);
					for (const t of tokens) if (qText.includes(t)) s += 1;
				}
				return s;
			};
			sheetKnow = rows
				.map((it) => ({ it, s: scoreRow(it) }))
				.filter((x) => x.s > 0)
				.sort((a, b) => b.s - a.s)
				.slice(0, 10)
				.map((x) => x.it);
			if (sheetKnow.length > 0) sheetsCache.knowlege = sheetKnow;
			sheetsCache.lastError.knowlege = '';
		} catch {}
		try {
			const lr = await fetchSheetValuesByName('learning');
			if (lr && lr.length > 1) {
				const header = (lr[0] || []).map((h) => String(h || '').trim().toLowerCase());
				const idx = (name, fallback) => {
					const i = header.indexOf(name);
					return i >= 0 ? i : fallback;
				};
				const iId = idx('id', 0);
				const iTopic = idx('topic', 1);
				const iKeywords = idx('keywords', 2);
				const iDesc = idx('desc', 3);
				const iSolution = idx('solution', 4);

				const rows = (lr || [])
					.slice(1)
					.map((r) => ({
						id: String(r?.[iId] || '').trim(),
						topic: String(r?.[iTopic] || '').trim(),
						keywords: String(r?.[iKeywords] || '').trim(),
						desc: String(r?.[iDesc] || '').trim(),
						solution: String(r?.[iSolution] || '').trim(),
					}))
					.filter((it) => it.id || it.topic || it.keywords || it.desc || it.solution);

				const scoreRow = (it) => {
					let s = 0;
					const keys = String(it.keywords || '')
						.split(',')
						.map((x) => x.trim().toLowerCase())
						.filter(Boolean);
					for (const k of keys) if (k && qText.includes(k)) s += 2;
					if (it.topic && qText.includes(String(it.topic).toLowerCase())) s += 1;
					return s;
				};

				learningKb = rows
					.map((it) => ({ it, s: scoreRow(it) }))
					.sort((a, b) => b.s - a.s)
					.slice(0, 12)
					.map((x) => x.it);
			}
		} catch {}
		try {
			kbHits = await kbSearch(prompt, 4);
		} catch {}
		// Fallback to last good cache if current read failed / returned empty
		if (sheetSamples.length === 0 && (sheetsCache.samples || []).length > 0) sheetSamples = sheetsCache.samples;
		if (sheetKnow.length === 0 && (sheetsCache.knowlege || []).length > 0) sheetKnow = sheetsCache.knowlege;
		sheetsCache.updatedAt = Date.now();

		// Build augmented prompt: user question + sample chats + knowledge (as lightweight text)
		let augmentedPrompt = String(prompt || '');
		if (sheetSamples.length > 0) {
			const lines = sheetSamples.map((s, i) => `- [${s.topic}] User: ${s.user}\n  Assistant: ${s.assistant}`).join('\n');
			augmentedPrompt += `\n\n[SAMPLE CHATS]\n${lines}`;
		}
		if (sheetKnow.length > 0) {
			const lines = sheetKnow.map((k) => `- ${k.key}: ${k.value}${k.notes ? ' — ' + k.notes : ''}${k.link ? ' — ' + k.link : ''}`).join('\n');
			augmentedPrompt += `\n\n[KNOWLEDGE]\n${lines}`;
		}
		let ragPreview = [];
		try {
			const { loadIndex, searchTopK } = require('../embeddings');
			const idx = loadIndex();
			if (idx) ragPreview = searchTopK(idx, prompt, 6);
		} catch {}
		// Build the exact AI request messages for logging (full body) so we can debug prompt/context per turn.
		let systemPrompt = [];
		try {
			systemPrompt = await buildSystemPrompt();
		} catch {
			systemPrompt = [];
		}
		const learningContext = [
			{
				role: 'system',
				content: `LEARNING_KB_JSON:\n${JSON.stringify({ items: learningKb || [] }, null, 2)}`,
			},
		];
		const kbContext = [
			{
				role: 'system',
				content: `KB_SEARCH_JSON:\n${JSON.stringify({ items: kbHits || [] }, null, 2)}`,
			},
		];

		const aiMessages = [
			...systemPrompt,
			...roleContext,
			...roomTypeContext,
			...lockContext,
			...actionContext,
			...taskStateContext,
			...learningContext,
			...kbContext,
			...ragContext,
			...context,
			{ role: 'user', content: augmentedPrompt },
		];
		const requestLog = {
			model: String(process.env.AI_MODEL || ''),
			userPrompt: String(prompt || ''),
			augmentedPrompt, // prompt + SAMPLE CHATS + KNOWLEDGE
			context_meta: {
				historyCount: (context || []).length,
				sampleCount: sheetSamples.length,
				knowlegeCount: sheetKnow.length,
				kbSearchCount: (kbHits || []).length,
				sheetsCacheUpdatedAt: sheetsCache.updatedAt ? new Date(sheetsCache.updatedAt).toISOString() : null,
				ragContextPreview: ragPreview,
			},
			ai_request_body: {
				// This mirrors what aiService will send (system prompt + contexts + user content)
				messages: aiMessages,
			},
		};
		appendLogs([{ when: new Date().toISOString(), type: 'REQUEST', value: JSON.stringify(requestLog).slice(0, 45000) }]).catch(() => {});

		let ai;
		try {
			const timeoutMs = Math.max(30000, Number(process.env.AI_REQUEST_TIMEOUT_MS || config.ai.timeoutMs + 5000));
			ai = await withTimeout(
				decide(augmentedPrompt, [...roleContext, ...roomTypeContext, ...lockContext, ...actionContext, ...taskStateContext, ...learningContext, ...kbContext, ...ragContext, ...context]),
				timeoutMs,
				'AI_REQUEST_TIMEOUT'
			);
		} catch (e) {
			if (String(e?.message || '') === 'AI_REQUEST_TIMEOUT') {
				appendLogs([
					{ when: new Date().toISOString(), type: 'RESPONSE', value: JSON.stringify({ status: 'error', message: 'AI request timeout' }) },
				]).catch(() => {});
				return res.status(504).json({
					status: 'error',
					action: 'ASK',
					message: 'AI xử lý quá lâu. Vui lòng thử lại sau ít phút.',
				});
			}
			// Log hard failures too (so you can see the exact request body + error)
			appendLogs([
				{
					when: new Date().toISOString(),
					type: 'RESPONSE',
					value: JSON.stringify({ status: 'error', message: String(e?.message || e), stack: String(e?.stack || '') }).slice(0, 45000),
				},
			]).catch(() => {});
			throw e;
		}

		// Enforce flow lock silently (do not block message). Only allow OPEN if previous action END.
		try {
			const lastAction = String(lockState.lastAction || 'UNKNOWN');
			const nextAction = String(ai?.action || '');
			if (lastAction !== 'END' && nextAction === 'OPEN') ai.action = lastAction;
		} catch {
			// ignore
		}

		// Persist new learning rows (best-effort)
		try {
			const list = ai?.data?.learning;
			if (Array.isArray(list) && list.length) {
				const cleaned = list
					.map((x) => ({
						id: normalizeValue(x?.id) || `L-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
						topic: normalizeValue(x?.topic),
						keywords: normalizeValue(x?.keywords),
						desc: normalizeValue(x?.desc),
						solution: normalizeValue(x?.solution),
					}))
					.filter((x) => x.topic || x.keywords || x.desc || x.solution);
				if (cleaned.length) await appendLearning(cleaned);
			}
			const hasKnowledge =
				(learningKb || []).length > 0 ||
				(kbHits || []).length > 0 ||
				(sheetKnow || []).length > 0 ||
				(ragPreview || []).length > 0;
			const hasLearning = Array.isArray(list) && list.length > 0;
			if (!hasLearning && !hasKnowledge) {
				const placeholder = {
					id: `Q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
					topic: normalizeValue(prompt),
					keywords: extractKeywords(prompt, 6),
					desc: normalizeValue(prompt),
					solution: '',
				};
				await appendLearning([placeholder]);
				ai.data = ai.data || {};
				ai.data.learning = [placeholder];
			}
		} catch {}

		// Log RESPONSE to sheet (non-blocking)
		appendLogs([{ when: new Date().toISOString(), type: 'RESPONSE', value: JSON.stringify(ai).slice(0, 45000) }]).catch(() => {});

		if (authedUserId) {
			// store assistant message and full AI response meta_json
			const compact = typeof ai?.message === 'string' ? ai.message : '';
			// If AI returned invalid format (after retries), do NOT store it to history.
			if (!ai?._invalid_format) {
				db.run(
					`INSERT INTO chat_messages (user_id, role, text, kind, meta_json, ai_action)
					 VALUES (?, 'assistant', ?, 'ai_response', ?, ?)`,
					[
						authedUserId,
						compact,
						JSON.stringify({ type: 'AI_RESPONSE', response: ai }),
						String(ai?.action || ''),
					]
				);
			}
		}

		// Orchestrate by action+step (AI decides); only CREATE_TASK + EXECUTE creates tasks
		const routing = await routeAiDecision({ ai, authedUserId });
		if (routing.didCreateTask) {
			const task = ai?.data?.task || {};
			const title = task?.title ? String(task.title) : '';
			const description = task?.description ? String(task.description) : '';
			const level = task?.level ? String(task.level) : 'medium';
			const room = task?.room ? String(task.room) : '';
			const type = task?.type ? String(task.type) : '';
			const deadline = task?.deadline ? String(task.deadline) : null;
			if (title) {
				const userId = await getDefaultUserId();
				await new Promise((resolve) => {
					db.run(
						`INSERT INTO tasks (title, description, room, type, deadline, level, status, user_id, created_by, created_by_user_id)
						 VALUES (?, ?, ?, ?, ?, ?, 'open', ?, 'assistant', ?)`,
						[title, description, room, type, deadline, level, userId, authedUserId],
						function () {
							ai.data.task = ai.data.task || {};
							ai.data.task.id = this?.lastID;
							resolve();
						}
					);
				});
			}
		}

		return res.json(ai);
	}
);

// Current user's chat history (requires Bearer token)
router.get('/chat/history', async (req, res) => {
	const authedUserId = getAuthedUser(req)?.id || null;
	if (!authedUserId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
	db.all(
		`SELECT id, role, text, created_at, kind, user_action, ai_action
		 FROM chat_messages
		 WHERE user_id = ?
		   AND role IN ('user','assistant')
		   AND kind IN ('userreponse','ai_response')
		   AND LENGTH(COALESCE(text,'')) > 0
		 ORDER BY id ASC
		 LIMIT 300`,
		[authedUserId],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});

module.exports = router;

