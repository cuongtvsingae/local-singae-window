const express = require('express');
const { body, param, validationResult } = require('express-validator');
const axios = require('axios');
const { db } = require('../db');
const { authRequired, requireRole } = require('../auth');
const config = require('../config');

const router = express.Router();

function handleValidation(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ status: 'error', errors: errors.array() });
	}
}

router.use(authRequired);
router.use(requireRole('admin'));

router.get('/users', (_req, res) => {
	db.all(
		`SELECT id, username, role, full_name, company_level, department, work_schedule, created_at, updated_at FROM users ORDER BY id DESC`,
		[],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});

router.patch(
	'/users/:id',
	[
		param('id').isInt({ min: 1 }),
		body('full_name').optional().isString().isLength({ max: 200 }),
		body('company_level').optional().isString().isLength({ max: 200 }),
		body('department').optional().isString().isLength({ max: 200 }),
		body('work_schedule').optional().isString().isLength({ max: 5000 }),
		body('role').optional().isIn(['employee', 'admin']),
	],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const fields = ['full_name', 'company_level', 'department', 'work_schedule', 'role'];
		const updates = [];
		const params = [];
		for (const f of fields) {
			if (f in req.body) {
				updates.push(`${f} = ?`);
				params.push(req.body[f]);
			}
		}
		if (updates.length === 0) return res.json({ status: 'ok', data: { id: Number(id) } });
		params.push(id);
		db.run(
			`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
			params,
			function (err) {
				if (err) return res.status(500).json({ status: 'error', message: err.message });
				if (this.changes === 0) return res.status(404).json({ status: 'error', message: 'User not found' });
				return res.json({ status: 'ok', data: { id: Number(id) } });
			}
		);
	}
);

router.get('/chat/:userId', [param('userId').isInt({ min: 1 })], (req, res) => {
	const e = handleValidation(req, res);
	if (e) return;
	const { userId } = req.params;
	db.all(
		`SELECT id, user_id, role, text, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 300`,
		[userId],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});

function listTables() {
	return new Promise((resolve, reject) => {
		db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`, [], (err, rows) => {
			if (err) return reject(err);
			resolve((rows || []).map((r) => r.name));
		});
	});
}

function tableColumns(table) {
	return new Promise((resolve, reject) => {
		db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
			if (err) return reject(err);
			resolve((rows || []).map((r) => r.name));
		});
	});
}

const EDITABLE_TABLES = new Set(['users', 'tasks', 'attendance_daily', 'chat_messages']);

router.get('/db/tables', async (_req, res) => {
	try {
		const tables = await listTables();
		return res.json({ status: 'ok', data: tables });
	} catch (err) {
		return res.status(500).json({ status: 'error', message: err.message });
	}
});

router.get('/db/table/:name', [param('name').isString().isLength({ min: 1, max: 64 })], async (req, res) => {
	const e = handleValidation(req, res);
	if (e) return;
	const name = req.params.name;
	const limit = Math.min(Number(req.query.limit || 50), 200);
	const offset = Math.max(Number(req.query.offset || 0), 0);
	try {
		const tables = await listTables();
		if (!tables.includes(name)) return res.status(404).json({ status: 'error', message: 'Table not found' });
		db.all(`SELECT * FROM ${name} ORDER BY rowid DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		});
	} catch (err) {
		return res.status(500).json({ status: 'error', message: err.message });
	}
});

router.delete(
	'/db/table/:name/:id',
	[param('name').isString().isLength({ min: 1, max: 64 }), param('id').isInt({ min: 1 })],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const name = req.params.name;
		const id = Number(req.params.id);
		if (!EDITABLE_TABLES.has(name)) return res.status(403).json({ status: 'error', message: 'Table not editable' });
		try {
			const tables = await listTables();
			if (!tables.includes(name)) return res.status(404).json({ status: 'error', message: 'Table not found' });
			db.run(`DELETE FROM ${name} WHERE id = ?`, [id], function (err) {
				if (err) return res.status(500).json({ status: 'error', message: err.message });
				return res.json({ status: 'ok', data: { deleted: this.changes } });
			});
		} catch (err) {
			return res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

router.patch(
	'/db/table/:name/:id',
	[param('name').isString().isLength({ min: 1, max: 64 }), param('id').isInt({ min: 1 }), body('patch').isObject()],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const name = req.params.name;
		const id = Number(req.params.id);
		if (!EDITABLE_TABLES.has(name)) return res.status(403).json({ status: 'error', message: 'Table not editable' });
		try {
			const tables = await listTables();
			if (!tables.includes(name)) return res.status(404).json({ status: 'error', message: 'Table not found' });
			const cols = await tableColumns(name);
			const patch = req.body.patch || {};
			const updates = [];
			const params = [];
			for (const [k, v] of Object.entries(patch)) {
				if (k === 'id') continue;
				if (!cols.includes(k)) continue;
				updates.push(`${k} = ?`);
				params.push(v);
			}
			if (updates.length === 0) return res.json({ status: 'ok', data: { id } });
			params.push(id);
			db.run(`UPDATE ${name} SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
				if (err) return res.status(500).json({ status: 'error', message: err.message });
				return res.json({ status: 'ok', data: { updated: this.changes, id } });
			});
		} catch (err) {
			return res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

// Server logs (full request/response)
router.get('/logs', (_req, res) => {
	db.all(
		`SELECT id, method, path, status, duration_ms, ip, user_id, created_at
		 FROM http_logs
		 ORDER BY id DESC
		 LIMIT 200`,
		[],
		(err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			return res.json({ status: 'ok', data: rows || [] });
		}
	);
});

router.get('/logs/:id', [param('id').isInt({ min: 1 })], (req, res) => {
	const e = handleValidation(req, res);
	if (e) return;
	const id = Number(req.params.id);
	db.get(
		`SELECT *
		 FROM http_logs
		 WHERE id = ?`,
		[id],
		(err, row) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!row) return res.status(404).json({ status: 'error', message: 'Log not found' });
			return res.json({ status: 'ok', data: row });
		}
	);
});

const ZALO_APIS = [
	{
		id: 'connected-account-list',
		name: 'Danh sách tài khoản Zalo đã liên kết',
		method: 'GET',
		path: '/api/open/zalo/v1/connected-account/list',
		requiredPathParams: [],
		defaultQuery: {},
	},
	{
		id: 'conversation-list',
		name: 'Danh sách hội thoại',
		method: 'GET',
		path: '/api/open/zalo/v1/conversation/list',
		requiredPathParams: [],
		defaultQuery: { limit: 20 },
	},
	{
		id: 'conversation-detail',
		name: 'Nội dung hội thoại',
		method: 'GET',
		path: '/api/open/zalo/v1/conversation/{conversationId}',
		requiredPathParams: ['conversationId'],
		defaultQuery: { limit: 20 },
	},
	{
		id: 'contact-profile',
		name: 'Thông tin liên hệ',
		method: 'GET',
		path: '/api/open/zalo/v1/contact/profile',
		requiredPathParams: [],
		defaultQuery: {},
	},
];

function resolvePathTemplate(pathTemplate, params) {
	let out = String(pathTemplate || '');
	for (const [k, v] of Object.entries(params || {})) {
		out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(String(v)));
	}
	return out;
}

router.get('/zalo/apis', (_req, res) => {
	return res.json({ status: 'ok', data: ZALO_APIS });
});

router.post('/zalo/test', [body('apiId').isString().isLength({ min: 1, max: 100 })], async (req, res) => {
	const e = handleValidation(req, res);
	if (e) return;
	const { apiId, query = {}, pathParams = {}, clientId = '', token = '' } = req.body || {};
	const api = ZALO_APIS.find((x) => x.id === apiId);
	if (!api) return res.status(404).json({ status: 'error', message: 'Zalo API not found' });
	for (const k of api.requiredPathParams) {
		if (!pathParams || pathParams[k] === undefined || pathParams[k] === null || String(pathParams[k]).trim() === '') {
			return res.status(400).json({ status: 'error', message: `Missing path param: ${k}` });
		}
	}
	const finalClientId = String(clientId || config.zalo.clientId || '').trim();
	const finalToken = String(token || config.zalo.token || '').trim();
	if (!finalClientId || !finalToken) {
		return res.status(400).json({ status: 'error', message: 'Missing Zalo credentials: client-id/token' });
	}
	try {
		const finalPath = resolvePathTemplate(api.path, pathParams);
		const url = `${String(config.zalo.baseUrl || '').replace(/\/+$/, '')}${finalPath}`;
		const response = await axios.request({
			method: api.method,
			url,
			headers: {
				'client-id': finalClientId,
				token: finalToken,
			},
			params: query || {},
			timeout: Number(config.zalo.timeoutMs || 20000),
			validateStatus: () => true,
		});
		return res.status(200).json({
			status: 'ok',
			data: {
				request: { method: api.method, url, query, pathParams },
				response: {
					status: response.status,
					headers: response.headers || {},
					data: response.data,
				},
			},
		});
	} catch (err) {
		return res.status(500).json({
			status: 'error',
			message: err.message || 'Zalo test failed',
		});
	}
});

module.exports = router;

