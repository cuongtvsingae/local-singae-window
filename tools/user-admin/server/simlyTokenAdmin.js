const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const xlsx = require('xlsx');
const multer = require('multer');
const { openSqliteDatabase } = require('../../../shared/server-base/openSqlite');
const { mountProductSalesGsheetSyncRoute } = require('../../commission/server/productSalesGsheetSync');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

const DB_DIR = path.resolve(__dirname, '..', 'database');
const DB_FILE = path.join(DB_DIR, 'simly-token.sqlite');
const SIMLY_API_BASE = (process.env.SIMLY_API_BASE || 'https://api.simlydent.vn').replace(/\/$/, '');
const SIMLY_TOKEN_URL = process.env.SIMLY_TOKEN_URL || 'https://api.simlydent.vn/oauth/token';
const REFRESH_BUFFER_SECONDS = Number.parseInt(process.env.SIMLY_REFRESH_BUFFER_SECONDS || '300', 10);
const RETRY_DELAY_SECONDS = Number.parseInt(process.env.SIMLY_RETRY_DELAY_SECONDS || '60', 10);
const API_KEYS = {
  '25VNP': process.env.SIMLY_API_KEY_25VNP || '',
  '355LTT': process.env.SIMLY_API_KEY_355LTT || ''
};

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = openSqliteDatabase(DB_FILE);
const tokenCache = {
  simly: {
    token: {
      '25VNP': null,
      '355LTT': null
    }
  }
};
const tokenMeta = {
  '25VNP': { expiresIn: null, fetchedAt: null, expiresAt: null },
  '355LTT': { expiresIn: null, fetchedAt: null, expiresAt: null }
};
let lastRefreshTime = null;
let refreshInProgress = false;
let refreshTimeout = null;
let isShuttingDown = false;
let refreshLoopStarted = false;
let tokenServiceEnabled = true;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function formatDateTime(date) {
  if (!date) return null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/** yyyy-mm-dd — dùng đồng hồ máy chủ (đặt TZ=Asia/Ho_Chi_Minh trên VPS nếu cần “hôm nay” theo VN). */
function todayYyyyMmDd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeOfficeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function isKnownOffice(officeKey) {
  return Object.prototype.hasOwnProperty.call(API_KEYS, officeKey);
}

function getOfficeState(officeKey) {
  const meta = tokenMeta[officeKey] || {};
  const now = Date.now();
  const ttlSeconds = meta.expiresAt ? Math.max(0, Math.floor((meta.expiresAt - now) / 1000)) : null;
  return {
    officeKey,
    token: tokenCache.simly.token[officeKey],
    hasToken: Boolean(tokenCache.simly.token[officeKey]),
    expiresIn: meta.expiresIn ?? null,
    fetchedAt: meta.fetchedAt ?? null,
    expiresAt: meta.expiresAt ? new Date(meta.expiresAt).toISOString() : null,
    ttlSeconds
  };
}

async function initSchema() {
  await run('PRAGMA journal_mode=WAL;');
  await run(`
    CREATE TABLE IF NOT EXISTS simly_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      office_key TEXT NOT NULL,
      access_token TEXT NOT NULL,
      expires_in INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'refresh_loop'
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_simly_tokens_office_fetched
    ON simly_tokens (office_key, fetched_at DESC)
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS service_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['token_service_enabled', '1', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_khoan', '250000000', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_clinic_pct', '100', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_tlbs_users', '[]', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_khoan_overrides', '{}', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_employee_types', '{}', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_group_defs', '["BÁC SĨ","TLBS","NV KINH DOANH"]', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_seen_names', '[]', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_employee_names', '{}', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_khoan_overrides_v2', '{}', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_product_sales_v1', '{}', new Date().toISOString()]
  );
  await run(
    `INSERT OR IGNORE INTO service_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?)`,
    ['commission_product_sales_gsheet_url', '', new Date().toISOString()]
  );
}

async function loadServiceSettings() {
  const row = await get(`SELECT setting_value FROM service_settings WHERE setting_key = ?`, ['token_service_enabled']);
  tokenServiceEnabled = String(row?.setting_value || '1') === '1';
}

async function getSetting(key, fallback) {
  const row = await get(`SELECT setting_value FROM service_settings WHERE setting_key = ?`, [String(key || '')]);
  if (!row) return fallback;
  return row.setting_value;
}

async function setSetting(key, value) {
  await run(
    `INSERT INTO service_settings(setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [String(key || ''), String(value ?? ''), new Date().toISOString()]
  );
}

async function saveServiceEnabled(nextEnabled) {
  tokenServiceEnabled = Boolean(nextEnabled);
  await run(
    `INSERT INTO service_settings(setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    ['token_service_enabled', tokenServiceEnabled ? '1' : '0', new Date().toISOString()]
  );
}

async function fetchToken(officeKey, source = 'refresh_loop') {
  const apiKey = API_KEYS[officeKey];
  if (!apiKey) {
    throw new Error(`Missing API key for office ${officeKey}`);
  }

  const response = await axios.post(
    SIMLY_TOKEN_URL,
    {
      grant_type: 'api_key',
      api_key: apiKey
    },
    {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  if (response.status !== 200) {
    throw new Error(`Token API returned status ${response.status}`);
  }

  const data = response.data || {};
  const accessToken = data.access_token;
  const expiresIn = Number.parseInt(String(data.expires_in || 7200), 10);
  if (!accessToken) {
    throw new Error(`Token API missing access_token for ${officeKey}`);
  }

  tokenCache.simly.token[officeKey] = accessToken;
  const fetchedAtMs = Date.now();
  const expiresInSafe = Number.isFinite(expiresIn) ? expiresIn : 7200;
  tokenMeta[officeKey] = {
    expiresIn: expiresInSafe,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    expiresAt: fetchedAtMs + (expiresInSafe * 1000)
  };

  const fetchedAt = new Date(fetchedAtMs).toISOString();
  await run(
    `INSERT INTO simly_tokens (office_key, access_token, expires_in, fetched_at, source) VALUES (?, ?, ?, ?, ?)`,
    [officeKey, accessToken, expiresInSafe, fetchedAt, source]
  );

  return { accessToken, expiresIn: expiresInSafe };
}

async function refreshOfficeToken(officeKey, source = 'manual_admin_refresh_office') {
  if (refreshInProgress) {
    throw new Error('Refresh already in progress');
  }
  refreshInProgress = true;
  try {
    const result = await fetchToken(officeKey, source);
    lastRefreshTime = new Date();
    return result;
  } finally {
    refreshInProgress = false;
  }
}

async function refreshBothTokens(source = 'refresh_loop') {
  if (refreshInProgress) return null;
  refreshInProgress = true;
  try {
    const result25 = await fetchToken('25VNP', source);
    await fetchToken('355LTT', source);
    const refreshInterval = Math.max(60, result25.expiresIn - REFRESH_BUFFER_SECONDS);
    lastRefreshTime = new Date();
    return refreshInterval;
  } finally {
    refreshInProgress = false;
  }
}

async function refreshLoop() {
  while (!isShuttingDown) {
    try {
      if (!tokenServiceEnabled) {
        await new Promise((resolve) => {
          refreshTimeout = setTimeout(resolve, 2000);
        });
        continue;
      }
      const refreshInterval = await refreshBothTokens();
      if (isShuttingDown) break;
      const waitSeconds = refreshInterval === null ? 10 : refreshInterval;
      await new Promise((resolve) => {
        refreshTimeout = setTimeout(resolve, waitSeconds * 1000);
      });
    } catch (error) {
      await new Promise((resolve) => {
        refreshTimeout = setTimeout(resolve, RETRY_DELAY_SECONDS * 1000);
      });
    }
  }
}

async function warmFromDb() {
  for (const office of ['25VNP', '355LTT']) {
    const row = await get(
      `SELECT access_token, expires_in, fetched_at FROM simly_tokens WHERE office_key = ? ORDER BY fetched_at DESC LIMIT 1`,
      [office]
    );
    if (row?.access_token) {
      tokenCache.simly.token[office] = row.access_token;
      const fetchedAtMs = Date.parse(String(row.fetched_at || ''));
      const expiresInSafe = Number.parseInt(String(row.expires_in || 7200), 10);
      if (Number.isFinite(fetchedAtMs)) {
        tokenMeta[office] = {
          expiresIn: Number.isFinite(expiresInSafe) ? expiresInSafe : 7200,
          fetchedAt: new Date(fetchedAtMs).toISOString(),
          expiresAt: fetchedAtMs + ((Number.isFinite(expiresInSafe) ? expiresInSafe : 7200) * 1000)
        };
      }
    }
  }
}

async function start() {
  await initSchema();
  await loadServiceSettings();
  await warmFromDb();
  if (String(process.env.SKIP_SIMLY_TOKEN_REFRESH || "").trim() === "1") {
    console.log("[simly-token-admin] refresh loop skipped (tokens on VPS)");
    return;
  }
  if (!refreshLoopStarted) {
    refreshLoopStarted = true;
    refreshLoop().catch(() => {});
  }
}

function stop() {
  isShuttingDown = true;
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
}

start().catch((error) => {
  console.error('[simly-token-admin] startup failed:', error.message);
});

process.once('SIGTERM', stop);
process.once('SIGINT', stop);

function handlePublicTokens(req, res) {
  res.setHeader('X-Singae-Public-Api', 'simly-tokens');
  return res.json({
    simly: {
      token: {
        '25VNP': tokenCache.simly.token['25VNP'],
        '355LTT': tokenCache.simly.token['355LTT'],
        lastTimeRefresh: formatDateTime(lastRefreshTime)
      },
      offices: {
        '25VNP': getOfficeState('25VNP'),
        '355LTT': getOfficeState('355LTT')
      }
    }
  });
}

function sanitizeSimlyAppointmentDetail(data) {
  if (data == null) return null;
  if (Buffer.isBuffer(data)) {
    data = data.toString('utf8');
  }
  if (typeof data === 'string') {
    if (/<html[\s>]/i.test(data)) {
      return 'Upstream returned HTML (often login/error page) — không trả HTML ra client.';
    }
    return data.length > 1500 ? `${data.slice(0, 1500)}…` : data;
  }
  if (typeof data === 'object') return data;
  return String(data);
}

/**
 * Gọi Simly GET /api/v1/appointment (Bearer theo office). Dùng chung cho /api/public/appointment và chatbot sync.
 * @param {{ officeKey?: string, office?: string, fromDate?: string, toDate?: string, search?: string, page?: number|string, pageSize?: number|string }} params
 * @returns {Promise<object|string>}
 */
async function fetchSimlyAppointmentsJson(params = {}) {
  const officeKey = normalizeOfficeKey(params.officeKey ?? params.office ?? params.facility ?? '');
  if (!officeKey || !isKnownOffice(officeKey)) {
    const err = new Error('Missing or invalid office. Use office=25VNP or office=355LTT');
    err.statusCode = 400;
    throw err;
  }
  const token = tokenCache.simly.token[officeKey];
  if (!token) {
    const err = new Error(
      `No cached token for ${officeKey}. Ensure SIMLY_API_KEY_* is set and token service has refreshed.`
    );
    err.statusCode = 503;
    throw err;
  }
  const today = todayYyyyMmDd();
  const fromDate = String(params.fromDate || '').trim() || today;
  const toDate = String(params.toDate || '').trim() || fromDate;
  const search = String(params.search ?? '').trim();
  const page = Math.max(1, Number.parseInt(String(params.page || '1'), 10) || 1);
  const rawPageSize = Number.parseInt(String(params.pageSize || '100'), 10);
  const pageSize = Math.min(500, Math.max(1, Number.isFinite(rawPageSize) ? rawPageSize : 100));

  const url = `${SIMLY_API_BASE}/api/v1/appointment`;
  const r = await axios.get(url, {
    params: {
      search,
      page,
      pageSize,
      fromDate,
      toDate
    },
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    timeout: 60000,
    validateStatus: () => true
  });

  const status = r.status;
  const data = r.data;
  const okHttp = status >= 200 && status < 300;

  if (!okHttp) {
    const err = new Error('Simly appointment API returned a non-success status.');
    err.statusCode = status >= 400 && status < 600 ? status : 502;
    err.upstreamStatus = status;
    err.detail = sanitizeSimlyAppointmentDetail(data);
    throw err;
  }

  if (typeof data === 'string' && /<html[\s>]/i.test(data)) {
    const err = new Error('Upstream returned HTML while HTTP was 2xx — token/API có thể sai.');
    err.statusCode = 502;
    err.upstreamStatus = status;
    throw err;
  }

  if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'ok') && data.ok === false) {
    const err = new Error(String(data.message || data.error || 'Upstream báo lỗi trong JSON.'));
    err.statusCode = 502;
    err.upstreamStatus = status;
    err.detail = data;
    throw err;
  }

  if (typeof data === 'object' && data !== null) {
    return data;
  }

  if (typeof data === 'string') {
    return { ok: true, data };
  }

  return { ok: true, data: data ?? null };
}

/**
 * Luôn await hết call Simly mới trả response.
 * Thành công: chỉ khi HTTP 2xx và body không phải HTML; trả JSON data từ Simly.
 * Lỗi (mạng, timeout, HTTP không 2xx, HTML, { ok: false }): luôn JSON { ok: false, ... } — không forward HTML.
 */
async function handlePublicAppointment(req, res) {
  res.setHeader('X-Singae-Public-Api', 'simly-appointment');
  try {
    const data = await fetchSimlyAppointmentsJson({
      officeKey: req.query.office ?? req.query.facility ?? '',
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      search: req.query.search,
      page: req.query.page,
      pageSize: req.query.pageSize
    });
    return res.status(200).json(data);
  } catch (e) {
    const statusCode = Number.isFinite(Number(e.statusCode)) ? Number(e.statusCode) : 502;
    const body = {
      ok: false,
      error: e?.code === 'ECONNABORTED' ? 'Request timeout (60s)' : e.message || String(e),
      code: e?.code || null,
      upstreamStatus: e.upstreamStatus,
      detail: e.detail
    };
    if (body.detail === undefined) delete body.detail;
    if (body.upstreamStatus === undefined) delete body.upstreamStatus;
    if (body.code === undefined) delete body.code;
    return res.status(statusCode).json(body);
  }
}

// Fallback khi chỉ mount app.use('/api', router) (không có app.use('/api/public', ...) trong server.js).
['/public/tokens', '/public/tokens/', '/public/token', '/public/token/'].forEach((p) => {
  router.get(p, handlePublicTokens);
});
['/public/appointment', '/public/appointment/'].forEach((p) => {
  router.get(p, handlePublicAppointment);
});

// Admin API: kiểm tra trạng thái loop/cache.
router.get('/admin/status', (req, res) => {
  return res.json({
    ok: true,
    tokenServiceEnabled,
    refreshInProgress,
    loopStarted: refreshLoopStarted,
    lastTimeRefresh: formatDateTime(lastRefreshTime),
    hasToken25VNP: Boolean(tokenCache.simly.token['25VNP']),
    hasToken355LTT: Boolean(tokenCache.simly.token['355LTT']),
    offices: {
      '25VNP': getOfficeState('25VNP'),
      '355LTT': getOfficeState('355LTT')
    }
  });
});

router.get('/admin/commission-settings', async (req, res) => {
  try {
    const khoanRaw = await getSetting('commission_khoan', '250000000');
    const clinicRaw = await getSetting('commission_clinic_pct', '100');
    const khoanOverridesRaw = await getSetting('commission_khoan_overrides', '{}');
    const khoanOverridesV2Raw = await getSetting('commission_khoan_overrides_v2', '{}');
    const employeeTypesRaw = await getSetting('commission_employee_types', '{}');
    const groupDefsRaw = await getSetting('commission_group_defs', '["BÁC SĨ","TLBS","NV KINH DOANH","KT KHÁCH CŨ","Lễ tân/CSKH"]');
    const seenNamesRaw = await getSetting('commission_seen_names', '[]');
    const employeeNamesRaw = await getSetting('commission_employee_names', '{}');
    const productSalesV1Raw = await getSetting('commission_product_sales_v1', '{}');
    const productSalesGsheetUrlRaw = await getSetting('commission_product_sales_gsheet_url', '');
    const khoan = Number(khoanRaw);
    const clinicPct = Number(clinicRaw);
    let khoanOverrides = JSON.parse(String(khoanOverridesRaw || '{}'));
    let khoanOverridesV2 = JSON.parse(String(khoanOverridesV2Raw || '{}'));
    let employeeTypes = JSON.parse(String(employeeTypesRaw || '{}'));
    let groupDefs = JSON.parse(String(groupDefsRaw || '["BÁC SĨ","TLBS","NV KINH DOANH","KT KHÁCH CŨ","Lễ tân/CSKH"]'));
    let seenNames = JSON.parse(String(seenNamesRaw || '[]'));
    let employeeNames = JSON.parse(String(employeeNamesRaw || '{}'));
    let productSalesV1 = JSON.parse(String(productSalesV1Raw || '{}'));
    const productSalesGsheetUrl = String(productSalesGsheetUrlRaw || '');

    // Seed defaults if empty (based on latest user request)
    const defaultTlbsUsers = [
      'TELE Yến HCM',
      'TELE Ánh HN',
      'TELE Hương Mai',
      'TELE Phương Thảo',
      'CSKH Tú',
      'Mai Thị Dịu',
      'Nguyễn Thành Đạt',
      'LT Kiều'
    ];
    const defaultKhoanOverrides = {
      'CSKH Tú': 700000000,
      'TELE Phương Thảo': 100000000,
      'TELE Hương Mai': 100000000,
      'TELE Ánh HN': 350000000,
      'TELE Yến HCM': 700000000,
      'Nguyễn Thành Đạt': 500000000,
      'Mai Thị Dịu': 0,
      'LT Kiều': 0
    };
    if (!khoanOverrides || typeof khoanOverrides !== 'object' || Array.isArray(khoanOverrides) || Object.keys(khoanOverrides).length === 0) {
      khoanOverrides = defaultKhoanOverrides;
    }
    if (!khoanOverridesV2 || typeof khoanOverridesV2 !== 'object' || Array.isArray(khoanOverridesV2)) khoanOverridesV2 = {};
    // Migrate legacy overrides -> v2 (as base khoan)
    if (Object.keys(khoanOverridesV2).length === 0 && khoanOverrides && typeof khoanOverrides === 'object' && !Array.isArray(khoanOverrides)) {
      Object.keys(khoanOverrides).forEach((k) => {
        const n = String(k || '').trim();
        const v = Number(khoanOverrides[k]);
        if (!n || !Number.isFinite(v) || v < 0) return;
        khoanOverridesV2[n] = { khoan: Math.round(v) };
      });
    }
    if (!employeeTypes || typeof employeeTypes !== 'object' || Array.isArray(employeeTypes)) employeeTypes = {};
    if (!Array.isArray(groupDefs) || groupDefs.length === 0) groupDefs = ["BÁC SĨ", "TLBS", "NV KINH DOANH"];
    if (!Array.isArray(seenNames)) seenNames = [];
    if (!employeeNames || typeof employeeNames !== 'object' || Array.isArray(employeeNames)) employeeNames = {};
    if (!productSalesV1 || typeof productSalesV1 !== 'object' || Array.isArray(productSalesV1)) productSalesV1 = {};
    return res.json({
      ok: true,
      settings: {
        khoan: Number.isFinite(khoan) ? khoan : 250000000,
        clinicPct: Number.isFinite(clinicPct) ? clinicPct : 100,
        // NOTE: TLBS list is no longer auto-derived/auto-updated from cache.
        // Routing is driven by employeeTypes persisted via Commission Settings.
        khoanOverridesV2,
        employeeTypes,
        groupDefs,
        seenNames,
        employeeNames,
        productSalesV1,
        productSalesGsheetUrl
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

function normalizeNameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMoneyLike(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const raw = String(v ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[.,]/g, '').replace(/[^0-9\-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Sync doanh thu SP từ GSheet: code trong tools/commission/server/productSalesGsheetSync.js
mountProductSalesGsheetSyncRoute(router, { getSetting, setSetting });

router.post('/admin/commission-settings/product-sales-upload', async (req, res) => {
  try {
    const b64 = String(req.body?.fileBase64 || '').trim();
    if (!b64) return res.status(400).json({ ok: false, error: 'Missing fileBase64' });
    const buf = Buffer.from(b64, 'base64');
    const wb = xlsx.read(buf, { type: 'buffer' });
    const firstSheetName = wb.SheetNames?.[0];
    if (!firstSheetName) return res.status(400).json({ ok: false, error: 'No sheet found' });
    const ws = wb.Sheets[firstSheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'Empty sheet' });

    const header = (rows[0] || []).map((x) => String(x || '').trim());
    const normH = header.map((h) => normalizeNameKey(h));
    const findCol = (keywords) => {
      const ks = (keywords || []).map((k) => normalizeNameKey(k));
      for (let i = 0; i < normH.length; i++) {
        const h = normH[i];
        if (!h) continue;
        if (ks.some((k) => h === k || h.includes(k))) return i;
      }
      return -1;
    };

    const colProduct = findCol(['thu xuất/ dv', 'thu xuất/dv', 'thu xuất', 'thu xuat/dv', 'thu xuat/ dv']);
    const colSeller = findCol(['kinh doanh', 'sale', 'sales']);
    const colAmount = findCol(['thu đợt này', 'thu dot nay', 'thu', 'thanh toan', 'thanh toán']);
    if (colProduct < 0 || colSeller < 0 || colAmount < 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required columns',
        details: { colProduct, colSeller, colAmount, header }
      });
    }

    const totalsByUser = {}; // normName -> { displayName, products: {productName: sum} }
    const totalsByProduct = {}; // productName -> sum
    let parsedRows = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const product = String(row[colProduct] || '').trim();
      const seller = String(row[colSeller] || '').trim();
      const amount = parseMoneyLike(row[colAmount]);
      if (!product || !seller) continue;
      if (!(amount > 0)) continue;
      parsedRows++;
      const nk = normalizeNameKey(seller);
      const pk = String(product).trim();
      if (!totalsByUser[nk]) totalsByUser[nk] = { displayName: seller, products: {} };
      totalsByUser[nk].products[pk] = Math.round((totalsByUser[nk].products[pk] || 0) + amount);
      totalsByProduct[pk] = Math.round((totalsByProduct[pk] || 0) + amount);
    }

    const payload = {
      uploadedAt: new Date().toISOString(),
      sheetName: firstSheetName,
      parsedRows,
      columns: { product: header[colProduct], seller: header[colSeller], amount: header[colAmount] },
      totalsByUser,
      totalsByProduct
    };

    await setSetting('commission_product_sales_v1', JSON.stringify(payload));
    return res.json({ ok: true, summary: { parsedRows, users: Object.keys(totalsByUser).length, products: Object.keys(totalsByProduct).length } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Preferred: multipart upload (avoids base64 + JSON size limits)
router.post('/admin/commission-settings/product-sales-upload-file', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f || !f.buffer) return res.status(400).json({ ok: false, error: 'Missing file' });
    const wb = xlsx.read(f.buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames?.[0];
    if (!firstSheetName) return res.status(400).json({ ok: false, error: 'No sheet found' });
    const ws = wb.Sheets[firstSheetName];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'Empty sheet' });

    const header = (rows[0] || []).map((x) => String(x || '').trim());
    const normH = header.map((h) => normalizeNameKey(h));
    const findCol = (keywords) => {
      const ks = (keywords || []).map((k) => normalizeNameKey(k));
      for (let i = 0; i < normH.length; i++) {
        const h = normH[i];
        if (!h) continue;
        if (ks.some((k) => h === k || h.includes(k))) return i;
      }
      return -1;
    };

    const colProduct = findCol(['thu xuất/ dv', 'thu xuất/dv', 'thu xuất', 'thu xuat/dv', 'thu xuat/ dv']);
    const colSeller = findCol(['kinh doanh', 'sale', 'sales']);
    const colAmount = findCol(['thu đợt này', 'thu dot nay', 'thu', 'thanh toan', 'thanh toán']);
    if (colProduct < 0 || colSeller < 0 || colAmount < 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required columns',
        details: { colProduct, colSeller, colAmount, header }
      });
    }

    const totalsByUser = {};
    const totalsByProduct = {};
    let parsedRows = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const product = String(row[colProduct] || '').trim();
      const seller = String(row[colSeller] || '').trim();
      const amount = parseMoneyLike(row[colAmount]);
      if (!product || !seller) continue;
      if (!(amount > 0)) continue;
      parsedRows++;
      const nk = normalizeNameKey(seller);
      const pk = String(product).trim();
      if (!totalsByUser[nk]) totalsByUser[nk] = { displayName: seller, products: {} };
      totalsByUser[nk].products[pk] = Math.round((totalsByUser[nk].products[pk] || 0) + amount);
      totalsByProduct[pk] = Math.round((totalsByProduct[pk] || 0) + amount);
    }

    const payload = {
      uploadedAt: new Date().toISOString(),
      sheetName: firstSheetName,
      originalFileName: String(f.originalname || ''),
      parsedRows,
      columns: { product: header[colProduct], seller: header[colSeller], amount: header[colAmount] },
      totalsByUser,
      totalsByProduct
    };
    await setSetting('commission_product_sales_v1', JSON.stringify(payload));
    return res.json({ ok: true, summary: { parsedRows, users: Object.keys(totalsByUser).length, products: Object.keys(totalsByProduct).length } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.put('/admin/commission-settings', async (req, res) => {
  try {
    const khoan = Number(req.body?.khoan);
    const clinicPct = Number(req.body?.clinicPct);
    const khoanOverridesV2 = req.body?.khoanOverridesV2;
    const employeeTypes = req.body?.employeeTypes;
    const groupDefs = req.body?.groupDefs;
    const seenNames = req.body?.seenNames;
    const employeeNames = req.body?.employeeNames;
    const productSalesGsheetUrl = req.body?.productSalesGsheetUrl;
    if (!(khoan > 0)) return res.status(400).json({ ok: false, error: 'khoan must be > 0' });
    if (!(clinicPct > 0) || clinicPct > 100) return res.status(400).json({ ok: false, error: 'clinicPct must be in (0,100]' });
    await setSetting('commission_khoan', String(Math.round(khoan)));
    await setSetting('commission_clinic_pct', String(Math.round(clinicPct)));
    if (khoanOverridesV2 !== undefined) {
      if (!khoanOverridesV2 || typeof khoanOverridesV2 !== 'object' || Array.isArray(khoanOverridesV2)) {
        return res.status(400).json({ ok: false, error: 'khoanOverridesV2 must be object' });
      }
      await setSetting('commission_khoan_overrides_v2', JSON.stringify(khoanOverridesV2));
    }
    if (employeeTypes !== undefined) {
      if (!employeeTypes || typeof employeeTypes !== 'object' || Array.isArray(employeeTypes)) {
        return res.status(400).json({ ok: false, error: 'employeeTypes must be object' });
      }
      await setSetting('commission_employee_types', JSON.stringify(employeeTypes));
    }
    if (groupDefs !== undefined) {
      if (!Array.isArray(groupDefs)) return res.status(400).json({ ok: false, error: 'groupDefs must be array' });
      await setSetting('commission_group_defs', JSON.stringify(groupDefs));
    }
    if (seenNames !== undefined) {
      if (!Array.isArray(seenNames)) return res.status(400).json({ ok: false, error: 'seenNames must be array' });
      await setSetting('commission_seen_names', JSON.stringify(seenNames));
    }
    if (employeeNames !== undefined) {
      if (!employeeNames || typeof employeeNames !== 'object' || Array.isArray(employeeNames)) {
        return res.status(400).json({ ok: false, error: 'employeeNames must be object' });
      }
      await setSetting('commission_employee_names', JSON.stringify(employeeNames));
    }
    if (productSalesGsheetUrl !== undefined) {
      const url = String(productSalesGsheetUrl || '').trim();
      if (url && !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ ok: false, error: 'productSalesGsheetUrl must be http(s) url' });
      }
      await setSetting('commission_product_sales_gsheet_url', url);
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Admin API: force refresh ngay lập tức.
router.post('/admin/refresh', async (req, res) => {
  try {
    if (!tokenServiceEnabled) {
      return res.status(409).json({ ok: false, error: 'Token service is stopped. Please start it first.' });
    }
    const refreshInterval = await refreshBothTokens('manual_admin_refresh');
    return res.json({ ok: true, refreshInterval });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/admin/refresh/:officeKey', async (req, res) => {
  try {
    if (!tokenServiceEnabled) {
      return res.status(409).json({ ok: false, error: 'Token service is stopped. Please start it first.' });
    }
    const officeKey = normalizeOfficeKey(req.params.officeKey);
    if (!isKnownOffice(officeKey)) {
      return res.status(400).json({ ok: false, error: `Unknown office key: ${officeKey}` });
    }
    await refreshOfficeToken(officeKey);
    return res.json({ ok: true, office: getOfficeState(officeKey) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/admin/offices', (req, res) => {
  return res.json({
    ok: true,
    tokenServiceEnabled,
    items: [getOfficeState('25VNP'), getOfficeState('355LTT')]
  });
});

router.post('/admin/service-state', async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    await saveServiceEnabled(enabled);
    return res.json({ ok: true, tokenServiceEnabled });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Admin API: xem lịch sử token mới nhất đã lưu SQL.
router.get('/admin/history', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || 50), 10)));
    const rows = await all(
      `SELECT id, office_key, expires_in, fetched_at, source
       FROM simly_tokens
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    return res.json({ ok: true, items: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
module.exports.handlePublicTokens = handlePublicTokens;
module.exports.handlePublicAppointment = handlePublicAppointment;
module.exports.fetchSimlyAppointmentsJson = fetchSimlyAppointmentsJson;
module.exports.todayYyyyMmDd = todayYyyyMmDd;
module.exports.normalizeOfficeKey = normalizeOfficeKey;
module.exports.isKnownOffice = isKnownOffice;
