const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { callChatAPI } = require('../../../../../shared/openai/openaiServer');
const { getRuntimeConfig } = require('../../../../../chatbot/server/channelConfig');
const { db } = require('../db');
const { emitTaskCreated } = require('../events');

const router = express.Router();

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }
}

function safeParseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  // Try to extract a JSON object inside a fenced/verbose response.
  const m = raw.match(/\{[\s\S]*\}/);
  if (m && m[0]) {
    try {
      return JSON.parse(m[0]);
    } catch (_) {}
  }
  return null;
}

function normalizeTriage(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const summary = String(o.summary || '').trim();
  const category = String(o.category || '').trim();
  const priority = String(o.priority || '').trim();
  const steps = Array.isArray(o.steps) ? o.steps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12) : [];
  const neededInfo = Array.isArray(o.neededInfo)
    ? o.neededInfo.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    summary,
    category,
    priority,
    steps,
    neededInfo
  };
}

function getModel() {
  return String(getRuntimeConfig()?.openai?.model || '').trim() || 'gpt-4o';
}

function normalizeCreateTask(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const title = String(o.title || '').trim();
  const description = String(o.description || '').trim();
  const category = String(o.category || '').trim();
  const priority = String(o.priority || '').trim();
  return { title, description, category, priority };
}

router.post(
  '/triage',
  [
    body('title').isString().isLength({ min: 1, max: 200 }),
    body('description').optional().isString().isLength({ max: 5000 }),
    body('context').optional().isString().isLength({ max: 20000 })
  ],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const extraContext = String(req.body?.context || '').trim();

    const model = getModel();
    const system = [
      'You are an IT support triage assistant.',
      'Return ONLY valid JSON (no markdown, no extra text).',
      'Language: Vietnamese (có dấu).',
      'Be concise and actionable.'
    ].join(' ');

    const userText = [
      `Tiêu đề: ${title}`,
      description ? `Mô tả: ${description}` : '',
      extraContext ? `Ngữ cảnh thêm: ${extraContext}` : '',
      '',
      'Hãy phân loại và gợi ý cách xử lý.',
      'Schema JSON:',
      '{',
      '  "summary": "1-2 câu tóm tắt issue",',
      '  "category": "VD: Network | Printer | Windows | Software | Account | Hardware | Security | Other",',
      '  "priority": "P1|P2|P3|P4",',
      '  "steps": ["Bước 1", "Bước 2"],',
      '  "neededInfo": ["Thông tin cần hỏi thêm (nếu thiếu)"]',
      '}'
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const input = [
        { role: 'system', content: system },
        { role: 'user', content: userText }
      ];

      const { answer, usage, completion, duration } = await callChatAPI({ model, input });
      const parsed = safeParseJson(answer);
      const triage = normalizeTriage(parsed || {});

      return res.json({
        status: 'ok',
        data: {
          triage,
          model: completion?.model || model,
          usage: usage || null,
          duration: typeof duration === 'number' ? `${duration}ms` : null,
          raw: {
            answer: String(answer || '').trim()
          }
        }
      });
    } catch (err) {
      return res.status(500).json({
        status: 'error',
        message: err?.message || String(err)
      });
    }
  }
);

router.post(
  '/create-task-from-chat',
  [
    body('conversationId').isInt({ min: 1 }),
    body('maxMessages').optional().isInt({ min: 5, max: 120 }),
    body('instruction').optional().isString().isLength({ max: 2000 })
  ],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const authed = req.authUser || null;
    const userId = String(authed?.id || '').trim();
    const username = String(authed?.username || '').trim();
    const role = String(authed?.role || '').trim().toLowerCase();
    const isAdmin = role === 'admin';

    const conversationId = Number(req.body?.conversationId);
    const maxMessages = Number(req.body?.maxMessages || 60);
    const instruction = String(req.body?.instruction || '').trim();

    // Ensure user owns this conversation unless admin
    const conv = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM it_chat_conversations WHERE id = ?`, [conversationId], (err2, row) => {
        if (err2) return reject(err2);
        resolve(row || null);
      });
    }).catch((err2) => {
      throw err2;
    });

    if (!conv) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }
    if (!isAdmin) {
      const ownerOk =
        (String(conv.created_by_user_id || '') && String(conv.created_by_user_id || '') === userId) ||
        (String(conv.created_by_username || '') && String(conv.created_by_username || '') === username);
      if (!ownerOk) {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }
    }

    const messages = await new Promise((resolve, reject) => {
      db.all(
        `SELECT role, text, created_at
         FROM it_chat_messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
        [conversationId, maxMessages],
        (err2, rows) => {
          if (err2) return reject(err2);
          resolve(rows || []);
        }
      );
    });

    const ordered = [...messages].reverse();
    const contextText = ordered
      .map((m) => {
        const r = String(m.role || 'user').trim().toLowerCase();
        const who = r === 'assistant' ? 'ASSISTANT' : r === 'system' ? 'SYSTEM' : 'USER';
        const t = String(m.text || '').trim();
        return t ? `${who}: ${t}` : '';
      })
      .filter(Boolean)
      .join('\n');

    const model = getModel();
    const system = [
      'You are an internal IT Support assistant for a company.',
      'Your job is to read internal chat logs and create ONE actionable IT support task.',
      'Return ONLY valid JSON (no markdown).',
      'Language: Vietnamese (có dấu).'
    ].join(' ');

    const userText = [
      `Conversation subject: ${String(conv.subject || '').trim()}`,
      `Creator: ${String(conv.created_by_username || '').trim()}`,
      '',
      instruction ? `Instruction: ${instruction}` : '',
      '',
      'Chat history:',
      contextText || '(empty)',
      '',
      'Create a task JSON using this schema:',
      '{',
      '  "title": "ngắn gọn, rõ issue",',
      '  "description": "mô tả + bối cảnh + yêu cầu + điều kiện done",',
      '  "category": "Network|Printer|Windows|Software|Account|Hardware|Security|Other",',
      '  "priority": "P1|P2|P3|P4"',
      '}'
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const input = [
        { role: 'system', content: system },
        { role: 'user', content: userText }
      ];

      const { answer, usage, completion, duration } = await callChatAPI({ model, input });
      const parsed = safeParseJson(answer);
      const task = normalizeCreateTask(parsed || {});

      if (!task.title) {
        return res.status(500).json({ status: 'error', message: 'AI did not return a valid title' });
      }

      const createdByUserId = userId;
      const createdByUsername = username;
      const finalDesc = [
        task.description || '',
        '',
        task.category ? `AI Category: ${task.category}` : '',
        task.priority ? `AI Priority: ${task.priority}` : '',
        completion?.model || model ? `AI Model: ${completion?.model || model}` : ''
      ]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join('\n');

      const inserted = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO tasks (title, description, status, user_id, created_by, created_by_user_id, created_by_username, ai_category, ai_priority, ai_last_model, ai_last_run_at, ai_last_run_by)
           VALUES (?, ?, 'open', NULL, 'ai', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            task.title,
            finalDesc,
            createdByUserId || null,
            createdByUsername || '',
            task.category,
            task.priority,
            completion?.model || model,
            createdByUsername || ''
          ],
          function (err2) {
            if (err2) return reject(err2);
            resolve({ id: this.lastID });
          }
        );
      });

      emitTaskCreated({
        taskId: inserted.id,
        createdBy: username || '',
        source: 'it-support-old',
        conversationId: conversationId,
        title: task.title,
        category: task.category,
        priority: task.priority
      });

      return res.json({
        status: 'ok',
        data: {
          taskId: inserted.id,
          task: { ...task, id: inserted.id },
          model: completion?.model || model,
          usage: usage || null,
          duration: typeof duration === 'number' ? `${duration}ms` : null,
          raw: { answer: String(answer || '').trim() }
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err?.message || String(err) });
    }
  }
);

module.exports = router;

