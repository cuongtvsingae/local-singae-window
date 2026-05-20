const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { db } = require('../db');

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
			? `SELECT t.* FROM tasks t WHERE t.status = ? ORDER BY t.created_at DESC`
			: `SELECT t.* FROM tasks t ORDER BY t.created_at DESC`;
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
			`SELECT t.* FROM tasks t WHERE t.id = ?`,
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
			const authed = req.authUser || null;
			const createdByUserId = String(authed?.id || '').trim();
			const createdByUsername = String(authed?.username || '').trim();
			db.run(
				`INSERT INTO tasks (title, description, status, user_id, created_by, created_by_user_id, created_by_username)
				 VALUES (?, ?, 'open', NULL, 'user', ?, ?)`,
				[title, description, createdByUserId || null, createdByUsername || ''],
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
		// Legacy behavior removed: no Sheets learning append in the embedded + HTML UI version.

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

		return res.json({ status: 'ok', data: { id: Number(id), status: nextStatus } });
	}
);

router.patch(
	'/:id/ai',
	[
		param('id').isInt({ min: 1 }),
		body('aiSummary').optional().isString().isLength({ max: 3000 }),
		body('aiCategory').optional().isString().isLength({ max: 120 }),
		body('aiPriority').optional().isString().isLength({ max: 12 }),
		body('aiSteps').optional().isArray({ max: 30 }),
		body('aiNeededInfo').optional().isArray({ max: 30 }),
		body('aiModel').optional().isString().isLength({ max: 120 })
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;

		const { id } = req.params;
		const aiSummary = String(req.body?.aiSummary || '').trim();
		const aiCategory = String(req.body?.aiCategory || '').trim();
		const aiPriority = String(req.body?.aiPriority || '').trim();
		const aiSteps = Array.isArray(req.body?.aiSteps)
			? req.body.aiSteps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 30)
			: [];
		const aiNeededInfo = Array.isArray(req.body?.aiNeededInfo)
			? req.body.aiNeededInfo.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 30)
			: [];
		const aiModel = String(req.body?.aiModel || '').trim();
		const authed = req.authUser || null;
		const aiLastRunBy = String(authed?.username || '').trim();

		try {
			await new Promise((resolve, reject) => {
				db.run(
					`UPDATE tasks
           SET ai_summary = ?,
               ai_category = ?,
               ai_priority = ?,
               ai_steps_json = ?,
               ai_needed_info_json = ?,
               ai_last_model = ?,
               ai_last_run_at = CURRENT_TIMESTAMP,
               ai_last_run_by = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
					[
						aiSummary,
						aiCategory,
						aiPriority,
						JSON.stringify(aiSteps),
						JSON.stringify(aiNeededInfo),
						aiModel,
						aiLastRunBy,
						id
					],
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

		return res.json({
			status: 'ok',
			data: {
				id: Number(id),
				aiSummary,
				aiCategory,
				aiPriority,
				aiSteps,
				aiNeededInfo,
				aiModel,
				aiLastRunBy
			}
		});
	}
);

module.exports = router;

