const express = require('express');
const cors = require('cors');
const { ensureBootReady } = require('./src/db');
const { itSupportEvents } = require('./src/events');

const router = express.Router();

router.use(cors());
router.use(express.json({ limit: '2mb' }));
router.use((req, _res, next) => {
  // keep it lightweight; host server already has its own logging
  // eslint-disable-next-line no-console
  console.log(`[it-support] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

// Shared auth: require logged-in app user for all it-support APIs (except /health)
const { authRequired } = require('./src/auth');

// Block requests until boot is ready (Sheets/Embeddings). Avoid killing the whole host server.
router.use(async (req, res, next) => {
  try {
    await ensureBootReady();
    return next();
  } catch (e) {
    return res.status(503).json({
      status: 'error',
      message: 'IT Support boot not ready',
      detail: String(e?.message || e)
    });
  }
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'it-support', mounted: true });
});

// APIs (mounted under /api/it-support)
router.use(authRequired);

// SSE events (auth required)
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  const safeWrite = (chunk) => {
    if (closed) return;
    try {
      res.write(chunk);
    } catch (_) {
      closed = true;
    }
  };

  const onTaskCreated = (payload) => {
    safeWrite(`event: task_created\n`);
    safeWrite(`data: ${JSON.stringify(payload || {})}\n\n`);
  };

  const onAssistantEvent = (payload) => {
    safeWrite(`event: assistant_event\n`);
    safeWrite(`data: ${JSON.stringify(payload || {})}\n\n`);
  };

  const heartbeat = setInterval(() => {
    safeWrite(`event: ping\ndata: {"ok":true}\n\n`);
  }, 20000);

  itSupportEvents.on('task_created', onTaskCreated);
  itSupportEvents.on('assistant_event', onAssistantEvent);

  req.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    itSupportEvents.off('task_created', onTaskCreated);
    itSupportEvents.off('assistant_event', onAssistantEvent);
    try { res.end(); } catch (_) {}
  });
});

router.use('/tasks', require('./src/routes/tasks'));
router.use('/ai', require('./src/routes/ai'));
router.use('/chat', require('./src/routes/chat'));

module.exports = router;

