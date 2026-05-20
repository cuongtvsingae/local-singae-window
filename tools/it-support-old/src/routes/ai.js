const express = require('express');
const { body, validationResult } = require('express-validator');
const { decide } = require('../aiService');
const { db } = require('../db');

const router = express.Router();

function handleValidation(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ status: 'error', errors: errors.array() });
	}
}

router.post(
	'/decide',
	[
		body('prompt').isString().isLength({ min: 1 }),
		body('context').optional().isArray(),
	],
	async (req, res) => {
		const e = handleValidation(req, res);
		if (e) return;
		const { prompt, context = [] } = req.body;
		const contextMsgs = Array.isArray(context) ? context : [];
		const ai = await decide(prompt, contextMsgs);

		// Optionally, auto-execute some actions when safe
		if (ai.status === 'ok') {
			if (ai.action === 'CREATE_TASK') {
				const { title, description = '' } = ai.data || {};
				if (title) {
					await new Promise((resolve) => {
						db.run(
							`INSERT INTO tasks (title, description, status) VALUES (?, ?, 'open')`,
							[title, description],
							function () {
								ai.data.id = this?.lastID;
								resolve();
							}
						);
					});
				}
			}
		}
		return res.json(ai);
	}
);

module.exports = router;

