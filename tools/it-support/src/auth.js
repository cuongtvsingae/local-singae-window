const config = require('./config');
const { resolveUserFromShellSession } = require('./shellUser');

/** Gắn req.user nếu có session; không trả 401 (dùng cho route v1 không bắt buộc đăng nhập). */
function optionalAuth(req, res, next) {
	(async () => {
		try {
			const u = await resolveUserFromShellSession(req);
			if (u) req.user = { id: u.id, username: u.username, role: u.role };
		} catch (_) {
			// ignore
		}
		next();
	})().catch(next);
}

/**
 * Chỉ dùng session WindowShell (cookie ws_session) — không còn JWT riêng.
 */
function authRequired(req, res, next) {
	(async () => {
		const u = await resolveUserFromShellSession(req);
		if (!u) {
			return res.status(401).json({ status: 'error', message: 'Not authenticated (sign in via app / WindowShell)' });
		}
		req.user = { id: u.id, username: u.username, role: u.role };
		next();
	})().catch((e) => res.status(500).json({ status: 'error', message: e?.message || 'auth failed' }));
}

function requireRole(role) {
	return (req, res, next) => {
		const user = req.user;
		if (!user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
		if (user.role !== role) return res.status(403).json({ status: 'error', message: 'Forbidden' });
		return next();
	};
}

/** Giữ export để route bootstrap / tương thích; không dùng cho login nữa */
function signToken() {
	throw new Error('JWT disabled: use WindowShell session');
}

function getJwtSecret() {
	return config.jwtSecret || 'dev-insecure-secret-change-me';
}

module.exports = {
	signToken,
	optionalAuth,
	authRequired,
	requireRole,
	getJwtSecret,
};
