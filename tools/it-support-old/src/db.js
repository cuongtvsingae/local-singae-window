const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const config = require('./config');

function ensureDirExists(filePath) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

ensureDirExists(config.db.file);

const db = new sqlite3.Database(config.db.file);
// Hard bootstrap: ensure Sheets data and embeddings exist before server fully starts
(async () => {
	try {
		const { ensureEmbeddingsReadyOrFail } = require('./embeddings');
		await ensureEmbeddingsReadyOrFail();
		// eslint-disable-next-line no-console
		console.log('[BOOT] Embeddings ready');
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('[BOOT] FAILED to prepare Sheets/Embeddings:', e?.message || e);
		// Hard fail to prevent server from starting with incomplete data
		process.exit(1);
	}
})();

function tableColumns(table) {
	return new Promise((resolve, reject) => {
		db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
			if (err) return reject(err);
			resolve((rows || []).map((r) => r.name));
		});
	});
}

async function ensureUserColumns() {
	const cols = await tableColumns('users');
	const add = async (name, ddl) => {
		if (!cols.includes(name)) {
			await new Promise((resolve, reject) => {
				db.run(`ALTER TABLE users ADD COLUMN ${ddl}`, (err) => (err ? reject(err) : resolve()));
			});
		}
	};
	// Auth
	await add('password_hash', 'password_hash TEXT');
	await add('role', "role TEXT NOT NULL DEFAULT 'employee'");
	// Profile fields
	await add('full_name', 'full_name TEXT');
	// gender: 'male' | 'female' (bắt buộc khi tạo user mới ở tầng API; DB giữ default rỗng để tương thích dữ liệu cũ)
	await add('gender', "gender TEXT NOT NULL DEFAULT ''");
	await add('company_level', 'company_level TEXT'); // level trong công ty
	await add('department', 'department TEXT'); // phòng ban
	await add('work_schedule', 'work_schedule TEXT'); // lịch làm việc (text/json)
	// SQLite limitation: ALTER TABLE ADD COLUMN does not allow non-constant defaults like CURRENT_TIMESTAMP.
	// Add nullable columns and backfill.
	await add('created_at', 'created_at DATETIME');
	await add('updated_at', 'updated_at DATETIME');
	await new Promise((resolve) => {
		db.run(
			`UPDATE users
			 SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
			     updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP),
			     department = COALESCE(department, ''),
			     gender = COALESCE(gender, '')`,
			() => resolve()
		);
	});
}

async function ensureTaskColumns() {
	const cols = await tableColumns('tasks');
	const add = async (name, ddl) => {
		if (!cols.includes(name)) {
			await new Promise((resolve, reject) => {
				db.run(`ALTER TABLE tasks ADD COLUMN ${ddl}`, (err) => (err ? reject(err) : resolve()));
			});
		}
	};
	await add('created_by', "created_by TEXT NOT NULL DEFAULT 'user'"); // 'user' | 'assistant'
	await add('created_by_user_id', 'created_by_user_id INTEGER'); // nullable
	await add('level', "level TEXT NOT NULL DEFAULT 'medium'"); // high | medium | low
	await add('room', "room TEXT NOT NULL DEFAULT ''");
	await add('type', "type TEXT NOT NULL DEFAULT ''");
	await add('deadline', 'deadline DATETIME'); // nullable
}

async function ensureTaskMetaTables() {
	// Rooms and Types are "fixed lists" stored in DB so admin can edit.
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS task_rooms (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT UNIQUE NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				active INTEGER NOT NULL DEFAULT 1
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS task_types (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT UNIQUE NOT NULL,
				sort_order INTEGER NOT NULL DEFAULT 0,
				active INTEGER NOT NULL DEFAULT 1
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});

	// Seed defaults once
	const roomsCount = await new Promise((resolve) => db.get(`SELECT COUNT(*) as c FROM task_rooms`, [], (_e, r) => resolve(Number(r?.c || 0))));
	if (roomsCount === 0) {
		const rooms = [
			{ name: 'Tầng 1 - Quầy lễ tân', sort: 10 },
			{ name: 'Tầng 1 - Phòng chờ khách', sort: 11 },
			{ name: 'Tầng 2 - Phòng 201', sort: 201 },
			{ name: 'Tầng 2 - Phòng 202', sort: 202 },
			{ name: 'Tầng 2 - Phòng 203', sort: 203 },
			{ name: 'Tầng 2 - Phòng 204', sort: 204 },
			{ name: 'Tầng 2 - Phòng 205', sort: 205 },
			{ name: 'Tầng 2 - Phòng 206', sort: 206 },
			{ name: 'Tầng 3 - Phòng 301', sort: 301 },
			{ name: 'Tầng 3 - Phòng 302', sort: 302 },
			{ name: 'Tầng 3 - Phòng 303', sort: 303 },
			{ name: 'Tầng 3 - Phòng 304', sort: 304 },
			{ name: 'Tầng 3 - Phòng 305', sort: 305 },
			{ name: 'Tầng 3 - Phòng 306', sort: 306 },
			{ name: 'Tầng 3 - Phòng nhân sự', sort: 399 },
			{ name: 'Tầng 4 - Phòng tele', sort: 401 },
			{ name: 'Tầng 4 - Phòng kế toán', sort: 402 },
			{ name: 'Tầng 4 - Phòng marketing', sort: 403 },
			{ name: 'Tầng 4 - Phòng GDCS', sort: 404 },
			{ name: 'Tầng 5 - Phòng 501', sort: 501 },
			{ name: 'Tầng 5 - Phòng 502', sort: 502 },
			{ name: 'Tầng 5 - Phòng 503', sort: 503 },
			{ name: 'Tầng 5 - Phòng 504', sort: 504 },
			{ name: 'Tầng 5 - Phòng 505', sort: 505 },
			{ name: 'Tầng 5 - Phòng 506', sort: 506 },
			{ name: 'Tầng 5 - Phòng chụp Xquang', sort: 599 },
			{ name: 'Tầng 6 - Phòng hội trường', sort: 601 },
		];
		for (const r of rooms) {
			await new Promise((resolve) => db.run(`INSERT OR IGNORE INTO task_rooms (name, sort_order, active) VALUES (?, ?, 1)`, [r.name, r.sort], () => resolve()));
		}
	}
	const typesCount = await new Promise((resolve) => db.get(`SELECT COUNT(*) as c FROM task_types`, [], (_e, r) => resolve(Number(r?.c || 0))));
	if (typesCount === 0) {
		const types = [
			{ name: 'Tài khoản / Phần mềm', sort: 10 },
			{ name: 'Lỗi mạng / Lỗi kết nối', sort: 20 },
			{ name: 'Phim Xquang', sort: 30 },
			{ name: 'Máy in', sort: 40 },
			{ name: 'Tivi', sort: 50 },
			{ name: 'Máy tính', sort: 60 },
			{ name: 'Request thiết bị', sort: 70 },
		];
		for (const t of types) {
			await new Promise((resolve) => db.run(`INSERT OR IGNORE INTO task_types (name, sort_order, active) VALUES (?, ?, 1)`, [t.name, t.sort], () => resolve()));
		}
	}
}

async function ensureChatColumns() {
	const cols = await tableColumns('chat_messages');
	const add = async (name, ddl) => {
		if (!cols.includes(name)) {
			await new Promise((resolve, reject) => {
				db.run(`ALTER TABLE chat_messages ADD COLUMN ${ddl}`, (err) => (err ? reject(err) : resolve()));
			});
		}
	};
	await add('kind', "kind TEXT NOT NULL DEFAULT 'chat'"); // chat | userreponse | ai_response | system
	await add('meta_json', 'meta_json TEXT'); // JSON string (request/response payload)
	await add('ai_action', 'ai_action TEXT'); // for ai_response rows
	await add('user_action', 'user_action TEXT'); // for user rows (session marker)
	// (removed) ai_endconversation: conversation is action-only now (assistant action="END")
}

async function ensureHttpLogsTable() {
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS http_logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				method TEXT NOT NULL,
				path TEXT NOT NULL,
				status INTEGER,
				duration_ms INTEGER,
				ip TEXT,
				user_id INTEGER,
				req_headers_json TEXT,
				req_body_json TEXT,
				res_headers_json TEXT,
				res_body_text TEXT,
				created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});
}

async function ensureAdminActionsTable() {
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS admin_actions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				action TEXT NOT NULL,
				meta_json TEXT,
				created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});
}

async function ensureKnowledgeBase() {
	// Base table
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS kb_docs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				content TEXT NOT NULL,
				tags TEXT,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});

	// FTS index (SQLite FTS5)
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
				title,
				content,
				tags,
				content='kb_docs',
				content_rowid='id'
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});

	// Triggers to keep FTS in sync
	await new Promise((resolve) => {
		db.run(
			`CREATE TRIGGER IF NOT EXISTS kb_docs_ai AFTER INSERT ON kb_docs BEGIN
				INSERT INTO kb_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, COALESCE(new.tags,''));
			END;`,
			() => resolve()
		);
	});
	await new Promise((resolve) => {
		db.run(
			`CREATE TRIGGER IF NOT EXISTS kb_docs_ad AFTER DELETE ON kb_docs BEGIN
				INSERT INTO kb_fts(kb_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, COALESCE(old.tags,''));
			END;`,
			() => resolve()
		);
	});
	await new Promise((resolve) => {
		db.run(
			`CREATE TRIGGER IF NOT EXISTS kb_docs_au AFTER UPDATE ON kb_docs BEGIN
				INSERT INTO kb_fts(kb_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, COALESCE(old.tags,''));
				INSERT INTO kb_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, COALESCE(new.tags,''));
			END;`,
			() => resolve()
		);
	});

	// Seed minimal docs once
	await new Promise((resolve) => {
		db.get(`SELECT COUNT(*) as c FROM kb_docs`, [], (_err, row) => resolve(Number(row?.c || 0)));
	}).then(async (count) => {
		if (count > 0) return;
		const seeds = [
			{
				title: 'Socket hang up (ECONNRESET) là gì?',
				tags: 'network,node,http,axios',
				content:
					'Socket hang up thường là ECONNRESET: kết nối bị đóng đột ngột bởi server/upstream.\n' +
					'Nguyên nhân hay gặp: timeout, server restart, proxy/LB cắt kết nối, request body quá lớn, TLS mismatch.\n' +
					'Checklist: thử lại, kiểm tra mạng, xem log server, tăng timeout, kiểm tra upstream AI worker.',
			},
			{
				title: 'Không vào được web lấy số điện thoại khách hàng',
				tags: 'web,login,network',
				content:
					'Thu thập: đang ở phòng nào (room), mức độ gấp (level), URL/website, thông báo lỗi cụ thể.\n' +
					'Chẩn đoán nhanh: kiểm tra mạng LAN/WiFi, DNS, thử máy khác, thử 4G, kiểm tra tài khoản đăng nhập, cache/cookie.\n' +
					'Nếu ảnh hưởng nhiều người hoặc hệ thống chính: level=high.',
			},
			{
				title: 'Máy in không in được',
				tags: 'printer,hardware',
				content:
					'Hỏi: phòng nào, máy in nào, kết nối USB/LAN, lỗi hiển thị.\n' +
					'Check: giấy/mực, queue, restart spooler, ping printer IP, driver.\n' +
					'Nếu lễ tân cần in gấp: level=high.',
			},
		];
		for (const s of seeds) {
			// eslint-disable-next-line no-await-in-loop
			await new Promise((resolve) => {
				db.run(`INSERT INTO kb_docs (title, content, tags) VALUES (?, ?, ?)`, [s.title, s.content, s.tags], () => resolve());
			});
		}
	});
}

async function ensureAiPromptTable() {
	await new Promise((resolve, reject) => {
		db.run(
			`CREATE TABLE IF NOT EXISTS ai_prompts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				content TEXT NOT NULL,
				is_active INTEGER NOT NULL DEFAULT 1,
				updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
			)`,
			(err) => (err ? reject(err) : resolve())
		);
	});
	// Ensure at least one row exists (inactive) so admin UI can start from empty
	await new Promise((resolve) => {
		db.get(`SELECT COUNT(*) as c FROM ai_prompts`, [], (_err, row) => resolve(Number(row?.c || 0)));
	}).then(async (count) => {
		if (count > 0) return;
		await new Promise((resolve) => {
			db.run(`INSERT INTO ai_prompts (content, is_active) VALUES (?, 1)`, [''], () => resolve());
		});
	});
}

db.serialize(() => {
	db.run(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL
		)
	`);
	db.run(`
		CREATE TABLE IF NOT EXISTS tasks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			description TEXT,
			room TEXT NOT NULL DEFAULT '',
			type TEXT NOT NULL DEFAULT '',
			deadline DATETIME,
			status TEXT NOT NULL DEFAULT 'open',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			user_id INTEGER,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)
	`);
	db.run(`
		CREATE TABLE IF NOT EXISTS attendance_daily (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			day DATE NOT NULL,
			checkin_time DATETIME,
			checkin_image TEXT,
			demeanor TEXT,
			today_notes TEXT,
			week_review TEXT,
			month_review TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, day),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)
	`);
	db.run(`
		CREATE TABLE IF NOT EXISTS chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL,
			text TEXT NOT NULL,
			kind TEXT NOT NULL DEFAULT 'chat',
			meta_json TEXT,
			ai_action TEXT,
			user_action TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)
	`);
	// seed default user if not exists
	const username = config.defaultUser;
	db.run(
		`INSERT OR IGNORE INTO users (username) VALUES (?)`,
		[username]
	);
});

// Run migrations after base tables exist
(async () => {
	try {
		await ensureUserColumns();
		await ensureTaskColumns();
		await ensureTaskMetaTables();
		await ensureChatColumns();
		await ensureHttpLogsTable();
		await ensureAdminActionsTable();
		await ensureKnowledgeBase();
		await ensureAiPromptTable();
		// open test: default user is admin
		db.run(`UPDATE users SET role = 'admin' WHERE username = ?`, [config.defaultUser]);

		// Seed a dedicated admin account: admin / 123123
		const adminUsername = 'admin';
		db.get(`SELECT id, password_hash FROM users WHERE username = ?`, [adminUsername], async (err, row) => {
			if (err) return;
			if (!row) {
				const password_hash = await bcrypt.hash('123123', 10);
				db.run(
					`INSERT INTO users (username, password_hash, role, full_name, company_level, department, work_schedule, created_at, updated_at)
					 VALUES (?, ?, 'admin', 'Admin', 'Admin', 'IT', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
					[adminUsername, password_hash]
				);
			} else if (!row.password_hash) {
				const password_hash = await bcrypt.hash('123123', 10);
				db.run(`UPDATE users SET password_hash = ?, role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [password_hash, row.id]);
			}
		});
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error('DB migration error:', e?.message || e);
	}
})();

function getDefaultUserId() {
	return new Promise((resolve, reject) => {
		db.get(`SELECT id FROM users WHERE username = ?`, [config.defaultUser], (err, row) => {
			if (err) return reject(err);
			if (!row) return resolve(null);
			resolve(row.id);
		});
	});
}

module.exports = {
	db,
	getDefaultUserId,
};

