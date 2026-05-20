const { db } = require('./db');
const { getUserBySessionToken } = require('../../windowsshell/server/authStore');

const AUTH_COOKIE_NAME = 'ws_session';

function parseCookies(req) {
	const raw = String(req.headers?.cookie || '');
	return raw.split(';').reduce((acc, part) => {
		const idx = part.indexOf('=');
		if (idx < 0) return acc;
		const key = part.slice(0, idx).trim();
		const value = part.slice(idx + 1).trim();
		if (!key) return acc;
		acc[key] = decodeURIComponent(value);
		return acc;
	}, {});
}

function getShellSessionToken(req) {
	return String(parseCookies(req)[AUTH_COOKIE_NAME] || '').trim();
}

function mapShellRoleToItSupport(shellRole) {
	const r = String(shellRole || 'member').toLowerCase();
	if (r === 'admin') return 'admin';
	return 'employee';
}

/**
 * Liên kết user WindowShell → bản ghi users trong SQLite IT Support (id số cho tasks/chat).
 */
function ensureItSupportUserFromShell(wsUser) {
	return new Promise((resolve, reject) => {
		const username = String(wsUser?.username || '').trim();
		if (!username) return reject(new Error('empty username'));
		const role = mapShellRoleToItSupport(wsUser.role);
		const fullName = String(wsUser.fullName || username).trim() || username;

		db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
			if (err) return reject(err);
			if (row) {
				if (row.role !== role || (fullName && row.full_name !== fullName)) {
					db.run(
						`UPDATE users SET role = ?, full_name = CASE WHEN ? != '' THEN ? ELSE full_name END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
						[role, fullName, fullName, row.id],
						() => {
							db.get(`SELECT * FROM users WHERE id = ?`, [row.id], (e2, r2) => {
								if (e2) return reject(e2);
								resolve(r2 || row);
							});
						}
					);
					return;
				}
				return resolve(row);
			}
			db.run(
				`INSERT INTO users (username, role, full_name, company_level, department, work_schedule, updated_at)
				 VALUES (?, ?, ?, '', '', '', CURRENT_TIMESTAMP)`,
				[username, role, fullName],
				function (insErr) {
					if (insErr) return reject(insErr);
					db.get(`SELECT * FROM users WHERE id = ?`, [this.lastID], (e2, r2) => {
						if (e2) return reject(e2);
						resolve(r2);
					});
				}
			);
		});
	});
}

async function resolveUserFromShellSession(req) {
	const token = getShellSessionToken(req);
	if (!token) return null;
	const wsUser = await getUserBySessionToken(token);
	if (!wsUser) return null;
	const local = await ensureItSupportUserFromShell(wsUser);
	return {
		id: local.id,
		username: local.username,
		role: local.role || 'employee',
		wsUser,
	};
}

module.exports = {
	parseCookies,
	getShellSessionToken,
	ensureItSupportUserFromShell,
	resolveUserFromShellSession,
	getUserBySessionToken,
	AUTH_COOKIE_NAME,
};
