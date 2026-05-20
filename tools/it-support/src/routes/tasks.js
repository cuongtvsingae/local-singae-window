const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db, getDefaultUserId } = require('../db');
const { appendLearning } = require('../sheets');

const router = express.Router();

function handleValidation(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ status: 'error', errors: errors.array() });
	}
}

router.get(
	'/',
	[query('status').optional().isString().isLength({ min: 2, max: 32 })],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { status } = req.query;
		const sql = status
			? `SELECT t.*, u.username FROM tasks t LEFT JOIN users u ON u.id = t.user_id WHERE t.status = ? ORDER BY t.created_at DESC`
			: `SELECT t.*, u.username FROM tasks t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC`;
		const params = status ? [status] : [];
		db.all(sql, params, (err, rows) => {
			if (err) return res.status(500).json({ status: 'error', message: err.message });
			res.json({ status: 'ok', data: rows });
		});
	}
);

router.get(
	'/:id',
	[param('id').isInt({ min: 1 })],
	(req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		db.get(
			`SELECT t.*, u.username FROM tasks t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
			[id],
			(err, row) => {
				if (err) return res.status(500).json({ status: 'error', message: err.message });
				if (!row) return res.status(404).json({ status: 'error', message: 'Task not found' });
				res.json({ status: 'ok', data: row });
			}
		);
	}
);

router.post(
	'/',
	[
		body('title').isString().isLength({ min: 1, max: 200 }),
		body('description').optional().isString().isLength({ max: 5000 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { title, description = '' } = req.body;
		try {
			const userId = await getDefaultUserId();
			db.run(
				`INSERT INTO tasks (title, description, status, user_id) VALUES (?, ?, 'open', ?)`,
				[title, description, userId],
				function (err) {
					if (err) return res.status(500).json({ status: 'error', message: err.message });
					res.status(201).json({ status: 'ok', data: { id: this.lastID } });
				}
			);
		} catch (err) {
			res.status(500).json({ status: 'error', message: err.message });
		}
	}
);

router.patch(
	'/:id/status',
	[
		param('id').isInt({ min: 1 }),
		body('status').isString().isLength({ min: 2, max: 32 }),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { id } = req.params;
		const { status } = req.body;
		const nextStatus = String(status || '').trim();
		const learning = req.body?.learning;

		if (nextStatus.toLowerCase() === 'done') {
			const required = ['id', 'topic', 'keywords', 'desc', 'solution'];
			const missing = required.filter((k) => !String(learning?.[k] || '').trim());
			if (missing.length > 0) {
				return res.status(400).json({
					status: 'error',
					message: `Missing learning fields: ${missing.join(', ')}`,
				});
			}
		}

		try {
			await new Promise((resolve, reject) => {
				db.run(
					`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
					[nextStatus, id],
					function (err) {
						if (err) return reject(err);
						if (this.changes === 0) return reject(new Error('Task not found'));
						resolve();
					}
				);
			});
		} catch (err) {
			const msg = String(err?.message || err);
			if (msg === 'Task not found') {
				return res.status(404).json({ status: 'error', message: msg });
			}
			return res.status(500).json({ status: 'error', message: msg });
		}

		if (nextStatus.toLowerCase() === 'done') {
			const cleaned = {
				id: String(learning?.id || '').trim(),
				topic: String(learning?.topic || '').trim(),
				keywords: String(learning?.keywords || '').trim(),
				desc: String(learning?.desc || '').trim(),
				solution: String(learning?.solution || '').trim(),
			};
			const result = await appendLearning([cleaned]);
			if (!result?.ok) {
				return res.status(500).json({
					status: 'error',
					message: result?.message || 'Failed to append learning',
				});
			}
		}

		return res.json({ status: 'ok', data: { id: Number(id), status: nextStatus } });
	}
);

module.exports = router;

