const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { db } = require('../db');
const { decide } = require('../assistant/itAssistant');
const { emitTaskCreated, emitAssistantEvent } = require('../events');

const router = express.Router();

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'error', errors: errors.array() });
  }
}

function isAdminUser(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === 'admin';
}

function safeJsonStringify(obj, fallback = '{}') {
  try {
    return JSON.stringify(obj ?? {});
  } catch (_) {
    return fallback;
  }
}

function isOwnerOrAdmin({ authed, canViewAll, conv }) {
  if (canViewAll) return true;
  const userId = String(authed?.id || '').trim();
  const username = String(authed?.username || '').trim();
  return (
    (String(conv?.created_by_user_id || '') && String(conv.created_by_user_id || '') === userId) ||
    (String(conv?.created_by_username || '') && String(conv.created_by_username || '') === username)
  );
}

function toChatContext(rows) {
  // Convert DB messages -> OpenAI-ish messages for context
  return (rows || [])
    .map((m) => {
      const r = String(m?.role || 'user').trim().toLowerCase();
      const role = r === 'assistant' || r === 'system' ? r : 'user';
      const content = String(m?.text || '').trim();
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function buildTaskDescriptionFromDecision({ decision, conversationId, conv, createdByUsername }) {
  const t = decision?.data?.task || {};
  const parts = [
    String(t.description || '').trim(),
    '',
    `Conversation ID: ${conversationId}`,
    conv?.subject ? `Subject: ${String(conv.subject || '').trim()}` : '',
    createdByUsername ? `Requested by: ${createdByUsername}` : '',
    '',
    t.type ? `Type: ${String(t.type || '').trim()}` : '',
    t.room ? `Room: ${String(t.room || '').trim()}` : '',
    t.level ? `Level: ${String(t.level || '').trim()}` : '',
    t.deadline ? `Deadline: ${String(t.deadline || '').trim()}` : ''
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.join('\n');
}

function detectUserWantsTicket(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('tạo ticket') ||
    t.includes('tao ticket') ||
    t.includes('tạo yêu cầu') ||
    t.includes('tao yeu cau') ||
    t.includes('tạo phiếu') ||
    t.includes('tao phieu') ||
    t.includes('tạo task') ||
    t.includes('tao task') ||
    t.includes('nhờ it') ||
    t.includes('nho it') ||
    t.includes('qua hỗ trợ') ||
    t.includes('qua ho tro')
  );
}

function hasPriorTroubleshootingAttempt(messages) {
  // We treat "assistant asked user to try steps" as at least one attempt.
  // This is conservative: if we can't parse metadata, we assume no attempt.
  const arr = Array.isArray(messages) ? messages : [];
  for (const m of arr) {
    if (String(m?.role || '').toLowerCase() !== 'assistant') continue;
    const meta = m?._meta || null;
    const action = String(meta?.decision?.action || '').toUpperCase();
    if (action === 'ASK' || action === 'COLLECT_INFOMATION') return true;
  }
  return false;
}

function safeParseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  return null;
}

router.get('/conversations', async (req, res) => {
  const authed = req.authUser || null;
  const userId = String(authed?.id || '').trim();
  const username = String(authed?.username || '').trim();

  const canViewAll = isAdminUser(authed);
  const sql = canViewAll
    ? `SELECT c.*,
         (SELECT COUNT(1) FROM it_chat_messages m WHERE m.conversation_id = c.id) AS message_count,
         (SELECT MAX(m.created_at) FROM it_chat_messages m WHERE m.conversation_id = c.id) AS last_message_at
       FROM it_chat_conversations c
       ORDER BY (last_message_at IS NULL) ASC, last_message_at DESC, c.updated_at DESC`
    : `SELECT c.*,
         (SELECT COUNT(1) FROM it_chat_messages m WHERE m.conversation_id = c.id) AS message_count,
         (SELECT MAX(m.created_at) FROM it_chat_messages m WHERE m.conversation_id = c.id) AS last_message_at
       FROM it_chat_conversations c
       WHERE c.created_by_user_id = ? OR c.created_by_username = ?
       ORDER BY (last_message_at IS NULL) ASC, last_message_at DESC, c.updated_at DESC`;
  const params = canViewAll ? [] : [userId || null, username || ''];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ status: 'error', message: err.message });
    return res.json({ status: 'ok', data: rows || [] });
  });
});

router.post(
  '/conversations',
  [body('subject').optional().isString().isLength({ max: 200 })],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const authed = req.authUser || null;
    const createdByUserId = String(authed?.id || '').trim();
    const createdByUsername = String(authed?.username || '').trim();
    const subject = String(req.body?.subject || '').trim();

    db.run(
      `INSERT INTO it_chat_conversations (subject, created_by_user_id, created_by_username)
       VALUES (?, ?, ?)`,
      [subject, createdByUserId || null, createdByUsername || ''],
      function (err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        return res.status(201).json({ status: 'ok', data: { id: this.lastID } });
      }
    );
  }
);

router.get(
  '/conversations/:id/messages',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const authed = req.authUser || null;
    const userId = String(authed?.id || '').trim();
    const username = String(authed?.username || '').trim();
    const canViewAll = isAdminUser(authed);

    const conversationId = String(req.params?.id || '').trim();

    const convSql = `SELECT * FROM it_chat_conversations WHERE id = ?`;
    db.get(convSql, [conversationId], (err, conv) => {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      if (!conv) return res.status(404).json({ status: 'error', message: 'Conversation not found' });

      if (!canViewAll) {
        const ownerOk =
          (String(conv.created_by_user_id || '') && String(conv.created_by_user_id || '') === userId) ||
          (String(conv.created_by_username || '') && String(conv.created_by_username || '') === username);
        if (!ownerOk) return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }

      db.all(
        `SELECT m.* FROM it_chat_messages m WHERE m.conversation_id = ? ORDER BY m.created_at ASC, m.id ASC`,
        [conversationId],
        (err2, rows) => {
          if (err2) return res.status(500).json({ status: 'error', message: err2.message });
          return res.json({ status: 'ok', data: rows || [], conversation: conv });
        }
      );
    });
  }
);

router.post(
  '/conversations/:id/messages',
  [
    param('id').isInt({ min: 1 }),
    body('role').optional().isString().isLength({ min: 3, max: 20 }),
    body('text').isString().isLength({ min: 1, max: 12000 }),
    body('metadata').optional().isObject()
  ],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const authed = req.authUser || null;
    const userId = String(authed?.id || '').trim();
    const username = String(authed?.username || '').trim();
    const canViewAll = isAdminUser(authed);

    const conversationId = String(req.params?.id || '').trim();
    const roleRaw = String(req.body?.role || 'user').trim().toLowerCase();
    const role = roleRaw === 'assistant' || roleRaw === 'system' ? roleRaw : 'user';
    const text = String(req.body?.text || '').trim();
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};

    db.get(`SELECT * FROM it_chat_conversations WHERE id = ?`, [conversationId], (err, conv) => {
      if (err) return res.status(500).json({ status: 'error', message: err.message });
      if (!conv) return res.status(404).json({ status: 'error', message: 'Conversation not found' });

      if (!canViewAll) {
        const ownerOk =
          (String(conv.created_by_user_id || '') && String(conv.created_by_user_id || '') === userId) ||
          (String(conv.created_by_username || '') && String(conv.created_by_username || '') === username);
        if (!ownerOk) return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }

      db.run(
        `INSERT INTO it_chat_messages (conversation_id, role, text, metadata_json)
         VALUES (?, ?, ?, ?)`,
        [conversationId, role, text, safeJsonStringify(metadata)],
        function (err2) {
          if (err2) return res.status(500).json({ status: 'error', message: err2.message });
          db.run(
            `UPDATE it_chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [conversationId],
            () => {}
          );
          return res.status(201).json({ status: 'ok', data: { id: this.lastID } });
        }
      );
    });
  }
);

// Assistant-driven chat turn: store user message, call AI, store assistant reply, and (optionally) create task.
router.post(
  '/conversations/:id/assistant',
  [
    param('id').isInt({ min: 1 }),
    body('text').isString().isLength({ min: 1, max: 12000 }),
    body('metadata').optional().isObject(),
    body('maxContextMessages').optional().isInt({ min: 5, max: 120 }),
    body('userConfirmed').optional().isBoolean()
  ],
  async (req, res) => {
    const e = handleValidation(req, res);
    if (e) return;

    const authed = req.authUser || null;
    const canViewAll = isAdminUser(authed);

    const conversationId = Number(req.params?.id);
    const text = String(req.body?.text || '').trim();
    const metadata =
      req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
        ? req.body.metadata
        : {};
    const maxContextMessages = Number(req.body?.maxContextMessages || 60);
    const userConfirmed = Boolean(req.body?.userConfirmed);

    try {
      const conv = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM it_chat_conversations WHERE id = ?`, [conversationId], (err2, row) => {
          if (err2) return reject(err2);
          resolve(row || null);
        });
      });
      if (!conv) return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      if (!isOwnerOrAdmin({ authed, canViewAll, conv })) return res.status(403).json({ status: 'error', message: 'Forbidden' });

      // 1) Store user message
      const userMsgId = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO it_chat_messages (conversation_id, role, text, metadata_json) VALUES (?, 'user', ?, ?)`,
          [conversationId, text, safeJsonStringify(metadata)],
          function (err2) {
            if (err2) return reject(err2);
            resolve(this.lastID);
          }
        );
      });
      db.run(`UPDATE it_chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [conversationId], () => {});

      // 2) Load context (last N messages, ordered ASC)
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT role, text, created_at
           , metadata_json
           FROM it_chat_messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
          [conversationId, maxContextMessages],
          (err2, items) => {
            if (err2) return reject(err2);
            resolve(items || []);
          }
        );
      });
      const ordered = [...rows].reverse();
      const context = toChatContext(ordered);

      // Parse assistant metadata (decision) for policy gating
      const withMeta = ordered.map((m) => {
        const metaObj = safeParseJson(m?.metadata_json) || null;
        return { ...m, _meta: metaObj };
      });
      const didTryOnlineBefore = hasPriorTroubleshootingAttempt(withMeta);
      const userAskedTicket = detectUserWantsTicket(text);

      // 3) Decide
      let decision = await decide(text, context);

      // 3.1) Policy: "online first"
      // If AI jumps to CONFIRM/CREATE_TASK too early, force back to ASK unless user explicitly wants a ticket.
      {
        const a = String(decision?.action || '').toUpperCase();
        const tooEarlyForTicket = (a === 'CONFIRM' || a === 'CREATE_TASK') && !didTryOnlineBefore && !userAskedTicket;
        if (tooEarlyForTicket) {
          decision = {
            ...decision,
            action: 'ASK',
            message:
              String(decision?.message || '').trim() +
              '\n\n' +
              '🧯 **Em xin ưu tiên hướng dẫn anh/chị xử lý online trước** để tiết kiệm thời gian. Anh/chị làm thử các bước em gợi ý rồi báo lại kết quả giúp em nha!',
            _policy_forced_online_first: true
          };
        }
      }

      // 4) Server-side guard: MUST confirm before creating a ticket.
      // If client hasn't confirmed, we do NOT execute CREATE_TASK even if AI asks for it.
      const wantsCreate = decision?.action === 'CREATE_TASK';
      const canCreateNow = wantsCreate && userConfirmed === true;

      let createdTaskId = null;
      if (canCreateNow) {
        const title = String(decision?.data?.task?.title || '').trim() || 'IT Support request';
        const createdByUserId = String(authed?.id || '').trim();
        const createdByUsername = String(authed?.username || '').trim();
        const description = buildTaskDescriptionFromDecision({
          decision,
          conversationId,
          conv,
          createdByUsername
        });

        createdTaskId = await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO tasks (title, description, status, user_id, created_by, created_by_user_id, created_by_username)
             VALUES (?, ?, 'open', NULL, 'ai', ?, ?)`,
            [title, description, createdByUserId || null, createdByUsername || ''],
            function (err2) {
              if (err2) return reject(err2);
              resolve(this.lastID);
            }
          );
        });

        emitTaskCreated({
          taskId: createdTaskId,
          createdBy: String(authed?.username || '').trim(),
          source: 'it-support-old',
          conversationId,
          title
        });
      } else if (wantsCreate && !userConfirmed) {
        // Downgrade action to CONFIRM (do not mutate message too much; keep AI intent)
        decision = {
          ...decision,
          action: 'CONFIRM',
          _create_task_blocked: true
        };
      }

      // 5) Store assistant message (always)
      const assistantMetadata = {
        decision,
        createdTaskId,
        userConfirmed: userConfirmed === true,
        _assistant: true
      };
      const assistantMsgId = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO it_chat_messages (conversation_id, role, text, metadata_json) VALUES (?, 'assistant', ?, ?)`,
          [conversationId, String(decision?.message || ''), safeJsonStringify(assistantMetadata)],
          function (err2) {
            if (err2) return reject(err2);
            resolve(this.lastID);
          }
        );
      });
      db.run(`UPDATE it_chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [conversationId], () => {});

      // 6) Emit SSE event so UI/desktop client can show toast/notification
      emitAssistantEvent({
        conversationId,
        userMessageId: userMsgId,
        assistantMessageId: assistantMsgId,
        action: decision?.action,
        createdTaskId
      });

      return res.json({
        status: 'ok',
        data: {
          conversationId,
          userMessageId: userMsgId,
          assistantMessageId: assistantMsgId,
          decision,
          createdTaskId
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err?.message || String(err) });
    }
  }
);

module.exports = router;

