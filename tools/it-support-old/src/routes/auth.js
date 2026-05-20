const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db } = require('../db');
const { signToken, authRequired } = require('../auth');
const config = require('../config');

const router = express.Router();

function handleValidation(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ status: 'error', errors: errors.array() });
	}
}

function getUserByUsername(username) {
	return new Promise((resolve, reject) => {
		db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
			if (err) return reject(err);
			resolve(row || null);
		});
	});
}

router.post(
	'/register',
	[
		body('username').isString().isLength({ min: 3, max: 64 }),
		body('password').isString().isLength({ min: 6, max: 200 }),
		body('full_name').isString().isLength({ min: 1, max: 200 }),
		body('company_level').isString().isLength({ min: 1, max: 200 }),
		body('department').isString().isLength({ min: 1, max: 200 }),
		body('work_schedule').optional().isString().isLength({ max: 5000 }),
		body('role').optional().isIn(['employee', 'admin']),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;

		const { username, password, full_name, company_level, department, work_schedule = '', role } = req.body;
		try {
			const existing = await getUserByUsername(username);
			if (existing) {
				return res.status(409).json({ status: 'error', message: 'Username already exists' });
			}

			// only admin can create admin; in opentest, default to employee
			let finalRole = 'employee';
			if (role === 'admin') finalRole = 'employee';

			const password_hash = await bcrypt.hash(password, 10);
			db.run(
				`INSERT INTO users (username, password_hash, role, full_name, company_level, department, work_schedule, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
				[username, password_hash, finalRole, full_name, company_level, department, work_schedule],
				function (err) {
					if (err) return res.status(500).json({ status: 'error', message: err.message });
					return res.status(201).json({ status: 'ok', data: { id: this.lastID, username, role: finalRole } });
				}
			);
		} catch (err) {
			return res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

router.post(
	'/login',
	[
		body('username').isString().isLength({ min: 3, max: 64 }),
		body('password').isString().isLength({ min: 1, max: 200 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;

		const { username, password } = req.body;
		try {
			const user = await getUserByUsername(username);
			if (!user || !user.password_hash) {
				return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
			}
			const ok = await bcrypt.compare(password, user.password_hash);
			if (!ok) return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
			const token = signToken({ id: user.id, username: user.username, role: user.role || 'employee' });
			return res.json({
				status: 'ok',
				data: {
					token,
					user: { id: user.id, username: user.username, role: user.role || 'employee', full_name: user.full_name || '' },
				},
			});
		} catch (err) {
			return res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

router.post(
	'/change-password',
	[
		body('old_password').isString().isLength({ min: 1, max: 200 }),
		body('new_password').isString().isLength({ min: 6, max: 200 }),
	],
	authRequired,
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;

		const { old_password, new_password } = req.body;
		const userId = req.user.id;
		db.get(`SELECT * FROM users WHERE id = ?`, [userId], async (err, user) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!user || !user.password_hash) return res.status(400).json({ status: 'error', message: 'No password set' });
			const ok = await bcrypt.compare(old_password, user.password_hash);
			if (!ok) return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
			const password_hash = await bcrypt.hash(new_password, 10);
			db.run(
				`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
				[password_hash, userId],
				(err2) => {
					if (err2) return res.status(500).json({ status: 'error', message: err2.message });
					return res.json({ status: 'ok' });
				}
			);
		});
	}
);

// One-time bootstrap: set password for an admin user that has no password_hash yet.
// Protect with BOOTSTRAP_KEY (open test default is 'it-support-bootstrap' - change in .env on VPS).
router.post(
	'/bootstrap-set-password',
	[
		body('bootstrap_key').isString().isLength({ min: 1 }),
		body('username').isString().isLength({ min: 3, max: 64 }),
		body('new_password').isString().isLength({ min: 6, max: 200 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { bootstrap_key, username, new_password } = req.body;
		if (bootstrap_key !== config.bootstrapKey) {
			return res.status(401).json({ status: 'error', message: 'Invalid bootstrap key' });
		}
		db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });
			if ((user.role || 'employee') !== 'admin') return res.status(403).json({ status: 'error', message: 'Not admin' });
			if (user.password_hash) return res.status(409).json({ status: 'error', message: 'Password already set' });
			const password_hash = await bcrypt.hash(new_password, 10);
			db.run(
				`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
				[password_hash, user.id],
				(err2) => {
					if (err2) return res.status(500).json({ status: 'error', message: err2.message });
					return res.json({ status: 'ok' });
				}
			);
		});
	}
);

router.get('/me', authRequired, (req, res) => {
	const userId = req.user?.id;
	if (!userId) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
	db.get(
		`SELECT id, username, role, full_name, company_level, department, work_schedule, created_at, updated_at
		 FROM users
		 WHERE id = ?`,
		[userId],
		(err, row) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			if (!row) return res.status(404).json({ status: 'error', message: 'User not found' });
			return res.json({ status: 'ok', data: row });
		}
	);
});

module.exports = router;

