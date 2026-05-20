const express = require('express');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const { staticMounts } = require('./shared/server-base/toolRegistry');
const { ensureItSupportChild } = require('./tools/it-support/hostBridge');

const PRIVATE_ENV_PATH = path.join(__dirname, 'private', '.env');
dotenv.config({ path: PRIVATE_ENV_PATH, override: true });
dotenv.config({ override: true });

const app = express();
const PORT = Number.parseInt(String(process.env.PORT || 3000), 10) || 3000;
/** Bind all interfaces so Nginx on the same VPS can proxy to 127.0.0.1:PORT */
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const REVALIDATE_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.mjs']);

function setStaticCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (REVALIDATE_EXTENSIONS.has(ext)) {
    // Dev UX: ensure UI updates show up immediately without hard refresh
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
}

app.use(compression({
  filter: (req, res) => {
    if (
      req.path === '/api/server-logs/stream' ||
      req.path === '/api/chatbot/server-logs/stream'
    ) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
// Public API + browser clients: cho phép gọi từ mọi origin (không cookie/credentials).
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Type'],
    maxAge: 86400,
    optionsSuccessStatus: 204
  })
);

// BOT / crawler gửi path %c0%ae… có thể làm URIError trong Express static — không để làm đổ cả tiến trình.
app.use((req, res, next) => {
  try {
    decodeURIComponent(String(req.url || '').split('?')[0]);
  } catch {
    res.setHeader('X-Singae-Bad-Path', '1');
    return res.status(400).type('text/plain').send('Bad Request');
  }
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// VPS / reverse-proxy: lightweight health (never serves SPA index.html)
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    role: 'local',
    uptimeSec: Math.floor(process.uptime()),
    port: PORT,
    listenHost: LISTEN_HOST,
    simlyPublicBase: process.env.SIMLY_PUBLIC_BASE_URL || 'https://singae.cloud',
    chatbotManagerBase: process.env.CHATBOT_MANAGER_BASE_URL || 'https://singae.cloud/api/chatbot-manager'
  });
});

// Commission settings + admin APIs (Simly token refresh runs on VPS only).
try {
  const simlyTokenAdmin = require('./tools/user-admin/server/simlyTokenAdmin');
  app.use('/api', simlyTokenAdmin);
  console.log('✅ Local: /api/admin/* (commission-settings); Simly tokens via VPS public API');
} catch (error) {
  console.warn('⚠️  Admin/commission API not loaded:', error.message);
}

// Ensure cloned it-support app server is running (child process) so we can proxy API to it.
// This keeps a single host server entrypoint: `node server.js` -> both servers up.
(async () => {
  try {
    await ensureItSupportChild();
  } catch (e) {
    console.warn('⚠️  it-support child not started:', e?.message || e);
  }
})();

// Simple same-origin proxy to bypass browser CORS for external CRM APIs.
// Security: allowlist destination hosts only.
async function handleApiProxy(req, res) {
  const targetUrl = String(req.query?.url || '').trim();
  if (!targetUrl) return res.status(400).json({ error: 'Missing url' });

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const host = (urlObj.hostname || '').toLowerCase();
  const allowed =
    host === 'api.simlydent.vn' ||
    host.endsWith('.getflycrm.com') ||
    host === 'getflycrm.com';

  if (!allowed) {
    return res.status(403).json({ error: 'Host not allowed', host });
  }

  const method = String(req.method || 'GET').toUpperCase();
  const headers = { ...(req.headers || {}) };
  // Strip hop-by-hop / origin headers
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers.origin;
  delete headers.referer;

  // If body is empty for GET/HEAD, keep undefined.
  const data = (method === 'GET' || method === 'HEAD') ? undefined : req.body;

  try {
    const r = await axios.request({
      url: targetUrl,
      method,
      headers,
      data,
      timeout: 45000,
      validateStatus: () => true
    });

    // Return a safe subset of headers to client
    const passthroughHeaders = {};
    const allowHeaderKeys = ['content-type', 'content-disposition', 'cache-control'];
    Object.keys(r.headers || {}).forEach((k) => {
      if (allowHeaderKeys.includes(String(k).toLowerCase())) passthroughHeaders[k] = r.headers[k];
    });
    Object.entries(passthroughHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.status(r.status).send(r.data);
  } catch (e) {
    res.status(502).json({ error: 'Proxy failed', message: e?.message || String(e) });
  }
}

// CRM API Tester proxy (tool branch)
app.all('/api/crmtester/proxy', handleApiProxy);
// Separate "API test" branch URL (same server, isolated entrypoint)
app.all('/api-test/proxy', handleApiProxy);
app.get('/api-test', (req, res) => {
  res.redirect('/tools/default/crm-api-tester/index.html');
});
app.get('/api-test/', (req, res) => {
  res.redirect('/tools/default/crm-api-tester/index.html');
});

// Giftbag tool branch (same server)
app.get('/giftbag', (req, res) => {
  res.redirect('/tools/normal/giftbag/index.html');
});
app.get('/giftbag/', (req, res) => {
  res.redirect('/tools/normal/giftbag/index.html');
});
app.get('/commission', (req, res) => {
  res.redirect('/tools/normal/commission/index.html');
});
app.get('/commission/', (req, res) => {
  res.redirect('/tools/normal/commission/index.html');
});
app.get('/commission-settings', (req, res) => {
  res.redirect('/tools/normal/commission-settings/index.html');
});
app.get('/commission-settings/', (req, res) => {
  res.redirect('/tools/normal/commission-settings/index.html');
});
app.get('/it-support', (req, res) => {
  res.redirect('/tools/normal/it-support/index.html');
});
app.get('/it-support/', (req, res) => {
  res.redirect('/tools/normal/it-support/index.html');
});
app.get('/users', (req, res) => {
  res.redirect('/tools/normal/user-admin/index.html');
});
app.get('/users/', (req, res) => {
  res.redirect('/tools/normal/user-admin/index.html');
});
app.get('/token-admin', (req, res) => {
  res.redirect('/tools/normal/user-admin/index.html');
});
app.get('/token-admin/', (req, res) => {
  res.redirect('/tools/normal/user-admin/index.html');
});
app.get('/payroll-calculator', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/payroll-calculator/', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/bang-cham-cong', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/bang-cham-cong/', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/tinh-luong', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/tinh-luong/', (req, res) => {
  res.redirect('/tools/normal/payroll-calculator/index.html');
});
app.get('/tools/ai/ai-manager', (req, res) => {
  res.redirect('/tools/vip/ai-manager/index.html');
});
app.get('/tools/ai/ai-manager/', (req, res) => {
  res.redirect('/tools/vip/ai-manager/index.html');
});

try {
  const commissionRouter = require('./tools/commission/server/server');
  app.use('/api/commission', commissionRouter);
  console.log('✅ Commission API routes mounted at /api/commission');
} catch (error) {
  console.warn('⚠️  Commission routes not loaded:', error.message);
}

try {
  const windowsshellRouter = require('./tools/windowsshell/server/server');
  app.use('/api/windowsshell', windowsshellRouter);
  console.log('✅ WindowsShell API routes mounted at /api/windowsshell');
} catch (error) {
  console.warn('⚠️  WindowsShell routes not loaded:', error.message);
}

try {
  const userAdminApi = require('./tools/user-admin/server/userAdminApi');
  app.use('/api/user-admin', userAdminApi);
} catch (error) {
  console.warn('User Admin API not loaded:', error.message);
}

try {
  const payrollApi = require('./tools/payroll-calculator/server/payrollApi');
  app.use('/api/payroll', payrollApi);
  console.log('✅ Payroll / MISA timesheet API mounted at /api/payroll');
} catch (error) {
  console.warn('⚠️  Payroll API not loaded:', error.message);
}

try {
  const giftbagRouter = require('./tools/giftbag/server/server');
  app.use('/api/giftbag', giftbagRouter);
  console.log('✅ Giftbag API routes mounted at /api/giftbag');
} catch (error) {
  console.warn('⚠️  Giftbag routes not loaded:', error.message);
}

try {
  // Proxy /api/it-support/* -> cloned it-support child server (default :1104)
  app.use('/api/it-support', async (req, res) => {
    const port = Number(process.env.IT_SUPPORT_CHILD_PORT || 1104);
    const base = `http://127.0.0.1:${port}`;
    const targetUrl = `${base}${req.originalUrl.replace(/^\/api\/it-support/, '')}`;
    try {
      const method = String(req.method || 'GET').toUpperCase();
      const headers = { ...(req.headers || {}) };
      delete headers.host;
      delete headers.connection;
      delete headers['content-length'];
      // Preserve cookies/auth if any
      const data = (method === 'GET' || method === 'HEAD') ? undefined : req.body;
      const r = await axios.request({
        url: targetUrl,
        method,
        headers,
        data,
        timeout: 60000,
        validateStatus: () => true
      });
      res.status(r.status);
      Object.entries(r.headers || {}).forEach(([k, v]) => {
        const key = String(k || '').toLowerCase();
        if (key === 'transfer-encoding') return;
        if (key === 'content-encoding') return;
        if (key === 'content-length') return;
        try { res.setHeader(k, v); } catch (_) {}
      });
      return res.send(r.data);
    } catch (e) {
      return res.status(502).json({ error: 'it-support proxy failed', message: e?.message || String(e) });
    }
  });
  console.log('✅ IT Support (cloned) API proxy mounted at /api/it-support -> localhost:1104');
} catch (error) {
  console.warn('⚠️  IT Support routes not loaded:', error.message);
}

let chatbotRouterLoaded = false;
try {
  const { mountChatbotOnHub } = require('./lib/chatbotHubMount');
  mountChatbotOnHub(app);
  chatbotRouterLoaded = true;
} catch (error) {
  console.warn(error.message);
}

try {
  const dbViewerRouter = require('./tools/db-viewer/server/server');
  app.use('/api/db-viewer', dbViewerRouter);
  console.log('✅ DB Viewer API routes mounted at /api/db-viewer');
} catch (error) {
  console.warn('⚠️  DB Viewer routes not loaded:', error.message);
}

staticMounts.forEach(({ route, dir }) => {
  app.use(route, express.static(dir, {
    maxAge: '7d',
    setHeaders: setStaticCacheHeaders
  }));
});

// Shared tool theme assets (e.g. /tools/theme-singae.css)
app.use('/tools', express.static(path.join(__dirname, 'shared', 'public', 'theme'), {
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.use('/chatbot-app', express.static(path.join(__dirname, 'public', 'chatbot-app'), {
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));
app.use(express.static(path.join(__dirname, 'shared', 'public', 'ui'), {
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: setStaticCacheHeaders
}));

app.get('*', (req, res) => {
  const pathOnly = String(req.originalUrl || req.url || '').split('?')[0];
  const expressPath = String(req.path || '');
  // Tránh trả SPA index.html cho nhầm lẫn /api/* (deploy cũ / port khác thường thấy HTML).
  if (pathOnly.startsWith('/api/') || expressPath.startsWith('/api/')) {
    res.setHeader('X-Singae-Api-Fallback', 'not-found');
    return res.status(404).type('application/json').json({
      error: 'API route not found',
      path: pathOnly,
      pathExpress: expressPath
    });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  if (err instanceof URIError) {
    return res.status(400).type('text/plain').send('Bad Request');
  }
  if (err && err.status === 400 && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('[server]', err && err.message ? err.message : err);
  if (res.headersSent) return;
  const code = err && Number.isFinite(err.status) ? err.status : 500;
  res.status(code).json({ error: err && err.message ? err.message : 'Internal error' });
});

app.listen(PORT, LISTEN_HOST, () => {
  if (!fs.existsSync(PRIVATE_ENV_PATH)) {
    console.warn(`⚠️  Missing ${PRIVATE_ENV_PATH} — copy private/.env on the VPS or set env vars; some features may fail.`);
  }
  console.log(`[local] tools server http://${LISTEN_HOST}:${PORT}`);
  console.log('[local] Simly tokens: VPS. Facebook webhook: VPS. Run chatbot-local:server + worker + processor.');
});


