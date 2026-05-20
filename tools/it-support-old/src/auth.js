const jwt = require('jsonwebtoken');
const config = require('./config');

function getJwtSecret() {
	return config.jwtSecret || 'dev-insecure-secret-change-me';
}

function signToken(payload) {
	return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

function authRequired(req, res, next) {
	const header = req.headers.authorization || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : null;
	if (!token) {
		return res.status(401).json({ status: 'error', message: 'Missing Bearer token' });
	}
	try {
		const decoded = jwt.verify(token, getJwtSecret());
		req.user = decoded;
		return next();
	} catch {
		return res.status(401).json({ status: 'error', message: 'Invalid token' });
	}
}

function requireRole(role) {
	return (req, res, next) => {
		const user = req.user;
		if (!user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
		if (user.role !== role) return res.status(403).json({ status: 'error', message: 'Forbidden' });
		return next();
	};
}

module.exports = {
	signToken,
	authRequired,
	requireRole,
	getJwtSecret,
};

