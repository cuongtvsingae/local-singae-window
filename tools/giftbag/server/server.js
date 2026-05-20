const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const { openSqliteDatabase } = require('../../../shared/server-base/openSqlite');
const { EventEmitter } = require('events');

const router = express.Router();
const giftbagEvents = new EventEmitter();
giftbagEvents.setMaxListeners(1000);

function emitGiftbagEvent(type, payload = {}) {
  giftbagEvents.emit('event', {
    type: String(type || 'unknown'),
    payload: payload || {},
    at: nowIso()
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

const DB_DIR = path.resolve(__dirname, '..', 'database');
const DB_FILE = path.join(DB_DIR, 'giftbag.sqlite');
const SINGAE_LOOKUP_GETFLY_API_URL =
  process.env.SINGAE_LOOKUP_GETFLY_API_URL || "https://sas9.getflycrm.com/api/v6/accounts";
const SINGAE_LOOKUP_GETFLY_API_KEY =
  process.env.SINGAE_LOOKUP_GETFLY_API_KEY || "";
const GIFTBAG_WEBHOOK_URL =
  process.env.GIFTBAG_WEBHOOK_URL || process.env.SINGAE_LOOKUP_WEBHOOK_URL || "";

function ensureDbDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

ensureDbDir();
const db = openSqliteDatabase(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
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

async function getSetting(key, fallback = null) {
  const row = await get(
    `SELECT setting_value FROM system_settings WHERE setting_key = ?`,
    [String(key || '')]
  );
  if (!row) return fallback;
  return row.setting_value;
}

async function setSetting(key, value) {
  await run(
    `INSERT INTO system_settings(setting_key, setting_value, updated_at)
     VALUES (?,?,?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [String(key || ''), String(value ?? ''), nowIso()]
  );
}

async function initSchema() {
  await run(`PRAGMA journal_mode=WAL;`);
  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS collaborators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      date_of_birth TEXT,
      gender TEXT,
      address TEXT,
      citizen_id TEXT,
      note TEXT,
      referrer_ctv_id INTEGER,
      activated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (referrer_ctv_id) REFERENCES collaborators(id)
    );
  `);
  const collaboratorColumns = await all(`PRAGMA table_info(collaborators)`);
  const colSet = new Set(collaboratorColumns.map((c) => String(c.name || "")));
  if (!colSet.has("date_of_birth")) await run(`ALTER TABLE collaborators ADD COLUMN date_of_birth TEXT`);
  if (!colSet.has("gender")) await run(`ALTER TABLE collaborators ADD COLUMN gender TEXT`);
  if (!colSet.has("address")) await run(`ALTER TABLE collaborators ADD COLUMN address TEXT`);
  if (!colSet.has("phone")) await run(`ALTER TABLE collaborators ADD COLUMN phone TEXT`);
  if (!colSet.has("citizen_id")) await run(`ALTER TABLE collaborators ADD COLUMN citizen_id TEXT`);
  if (!colSet.has("note")) await run(`ALTER TABLE collaborators ADD COLUMN note TEXT`);
  if (!colSet.has("referrer_ctv_id")) await run(`ALTER TABLE collaborators ADD COLUMN referrer_ctv_id INTEGER`);
  if (!colSet.has("customer_code")) await run(`ALTER TABLE collaborators ADD COLUMN customer_code TEXT`);
  if (!colSet.has("getfly_account_id")) await run(`ALTER TABLE collaborators ADD COLUMN getfly_account_id INTEGER`);
  if (!colSet.has("getfly_raw_json")) await run(`ALTER TABLE collaborators ADD COLUMN getfly_raw_json TEXT`);
  await run(`
    CREATE TABLE IF NOT EXISTS gift_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_code TEXT,
      collaborator_id INTEGER NOT NULL,
      total_value REAL NOT NULL,
      annual_cap REAL,
      alloc_implant_pct REAL NOT NULL DEFAULT 40,
      alloc_porcelain_pct REAL NOT NULL DEFAULT 30,
      alloc_general_pct REAL NOT NULL DEFAULT 20,
      alloc_orthodontic_pct REAL NOT NULL DEFAULT 10,
      alloc_implant_amount REAL NOT NULL DEFAULT 0,
      alloc_porcelain_amount REAL NOT NULL DEFAULT 0,
      alloc_general_amount REAL NOT NULL DEFAULT 0,
      alloc_orthodontic_amount REAL NOT NULL DEFAULT 0,
      used_total_amount REAL NOT NULL DEFAULT 0,
      used_implant_amount REAL NOT NULL DEFAULT 0,
      used_porcelain_amount REAL NOT NULL DEFAULT 0,
      used_general_amount REAL NOT NULL DEFAULT 0,
      used_orthodontic_amount REAL NOT NULL DEFAULT 0,
      years INTEGER NOT NULL,
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (collaborator_id) REFERENCES collaborators(id)
    );
  `);
  const walletColumns = await all(`PRAGMA table_info(gift_wallets)`);
  const walletColSet = new Set(walletColumns.map((c) => String(c.name || "")));
  if (!walletColSet.has("wallet_code")) await run(`ALTER TABLE gift_wallets ADD COLUMN wallet_code TEXT`);
  if (!walletColSet.has("alloc_implant_pct")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_implant_pct REAL NOT NULL DEFAULT 40`);
  if (!walletColSet.has("alloc_porcelain_pct")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_porcelain_pct REAL NOT NULL DEFAULT 30`);
  if (!walletColSet.has("alloc_general_pct")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_general_pct REAL NOT NULL DEFAULT 20`);
  if (!walletColSet.has("alloc_orthodontic_pct")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_orthodontic_pct REAL NOT NULL DEFAULT 10`);
  if (!walletColSet.has("alloc_implant_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_implant_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("alloc_porcelain_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_porcelain_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("alloc_general_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_general_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("alloc_orthodontic_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN alloc_orthodontic_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("used_total_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN used_total_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("used_implant_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN used_implant_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("used_porcelain_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN used_porcelain_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("used_general_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN used_general_amount REAL NOT NULL DEFAULT 0`);
  if (!walletColSet.has("used_orthodontic_amount")) await run(`ALTER TABLE gift_wallets ADD COLUMN used_orthodontic_amount REAL NOT NULL DEFAULT 0`);
  // Backfill old wallets from initial % distribution so remaining-by-service reflects original allocation.
  await run(`
    UPDATE gift_wallets
    SET alloc_implant_amount = ROUND(total_value * COALESCE(alloc_implant_pct, 0) / 100.0, 0)
    WHERE COALESCE(alloc_implant_amount, 0) <= 0 AND COALESCE(total_value, 0) > 0
  `);
  await run(`
    UPDATE gift_wallets
    SET alloc_porcelain_amount = ROUND(total_value * COALESCE(alloc_porcelain_pct, 0) / 100.0, 0)
    WHERE COALESCE(alloc_porcelain_amount, 0) <= 0 AND COALESCE(total_value, 0) > 0
  `);
  await run(`
    UPDATE gift_wallets
    SET alloc_general_amount = ROUND(total_value * COALESCE(alloc_general_pct, 0) / 100.0, 0)
    WHERE COALESCE(alloc_general_amount, 0) <= 0 AND COALESCE(total_value, 0) > 0
  `);
  await run(`
    UPDATE gift_wallets
    SET alloc_orthodontic_amount = ROUND(total_value * COALESCE(alloc_orthodontic_pct, 0) / 100.0, 0)
    WHERE COALESCE(alloc_orthodontic_amount, 0) <= 0 AND COALESCE(total_value, 0) > 0
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      getfly_account_id INTEGER,
      referrer_ctv_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (referrer_ctv_id) REFERENCES collaborators(id)
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS wallet_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      collaborator_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      customer_code TEXT,
      receipt_code TEXT,
      order_code TEXT NOT NULL UNIQUE,
      service_category TEXT NOT NULL,
      invoice_amount REAL NOT NULL,
      gift_used REAL NOT NULL,
      net_amount REAL NOT NULL,
      used_at TEXT NOT NULL,
      purpose TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (wallet_id) REFERENCES gift_wallets(id),
      FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);
  const walletUsageColumns = await all(`PRAGMA table_info(wallet_usage)`);
  const usageColSet = new Set(walletUsageColumns.map((c) => String(c.name || "")));
  if (!usageColSet.has("customer_code")) await run(`ALTER TABLE wallet_usage ADD COLUMN customer_code TEXT`);
  if (!usageColSet.has("receipt_code")) await run(`ALTER TABLE wallet_usage ADD COLUMN receipt_code TEXT`);
  if (!usageColSet.has("purpose")) await run(`ALTER TABLE wallet_usage ADD COLUMN purpose TEXT`);
  await run(`
    CREATE TABLE IF NOT EXISTS commission_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collaborator_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      wallet_usage_id INTEGER NOT NULL UNIQUE,
      order_code TEXT NOT NULL UNIQUE,
      commission_rate REAL NOT NULL,
      invoice_amount REAL NOT NULL,
      gift_used REAL NOT NULL,
      commission_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (collaborator_id) REFERENCES collaborators(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (wallet_usage_id) REFERENCES wallet_usage(id)
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS commission_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_code TEXT,
      recipient_ctv_id INTEGER NOT NULL,
      source_ctv_id INTEGER NOT NULL,
      wallet_id INTEGER NOT NULL,
      commission_rate REAL NOT NULL DEFAULT 0.1,
      base_amount REAL NOT NULL DEFAULT 0,
      commission_amount REAL NOT NULL DEFAULT 0,
      formula_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      paid_at TEXT,
      payment_customer_code TEXT,
      payment_receipt_code TEXT,
      paid_amount REAL,
      payment_note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (recipient_ctv_id) REFERENCES collaborators(id),
      FOREIGN KEY (source_ctv_id) REFERENCES collaborators(id),
      FOREIGN KEY (wallet_id) REFERENCES gift_wallets(id)
    );
  `);
  const voucherColumns = await all(`PRAGMA table_info(commission_vouchers)`);
  const voucherColSet = new Set(voucherColumns.map((c) => String(c.name || "")));
  if (!voucherColSet.has("voucher_code")) await run(`ALTER TABLE commission_vouchers ADD COLUMN voucher_code TEXT`);
  if (!voucherColSet.has("base_amount")) await run(`ALTER TABLE commission_vouchers ADD COLUMN base_amount REAL NOT NULL DEFAULT 0`);
  if (!voucherColSet.has("commission_amount")) await run(`ALTER TABLE commission_vouchers ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0`);
  if (!voucherColSet.has("paid_at")) await run(`ALTER TABLE commission_vouchers ADD COLUMN paid_at TEXT`);
  if (!voucherColSet.has("payment_customer_code")) await run(`ALTER TABLE commission_vouchers ADD COLUMN payment_customer_code TEXT`);
  if (!voucherColSet.has("payment_receipt_code")) await run(`ALTER TABLE commission_vouchers ADD COLUMN payment_receipt_code TEXT`);
  if (!voucherColSet.has("paid_amount")) await run(`ALTER TABLE commission_vouchers ADD COLUMN paid_amount REAL`);
  if (!voucherColSet.has("payment_note")) await run(`ALTER TABLE commission_vouchers ADD COLUMN payment_note TEXT`);
  await run(`
    UPDATE commission_vouchers
    SET base_amount = (
      SELECT COALESCE(gw.total_value, 0)
      FROM gift_wallets gw
      WHERE gw.id = commission_vouchers.wallet_id
    )
    WHERE COALESCE(base_amount, 0) <= 0
  `);
  await run(`
    UPDATE commission_vouchers
    SET commission_amount = ROUND(COALESCE(base_amount, 0) * COALESCE(commission_rate, 0.1), 0)
    WHERE COALESCE(commission_amount, 0) <= 0 AND COALESCE(base_amount, 0) > 0
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS getfly_account_cache (
      customer_code TEXT PRIMARY KEY,
      account_id INTEGER,
      account_name TEXT,
      phone_office TEXT,
      relation_name TEXT,
      email TEXT,
      birthday TEXT,
      billing_address_street TEXT,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);

  // GDV 25 Vũ Ngọc Phan: KH + gói quà (sync từ sheet)
  await run(`
    CREATE TABLE IF NOT EXISTS gdv25vnp_customers (
      customer_code TEXT PRIMARY KEY,
      getfly_account_id INTEGER,
      account_name TEXT,
      phone TEXT,
      payload_json TEXT,
      synced_at TEXT NOT NULL
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS gdv25vnp_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT NOT NULL,
      amount REAL NOT NULL,
      valid_to TEXT,
      created_at TEXT NOT NULL,
      source_row INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY(customer_code) REFERENCES gdv25vnp_customers(customer_code)
    );
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_gdv25vnp_wallets_customer ON gdv25vnp_wallets(customer_code);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_gdv25vnp_wallets_created ON gdv25vnp_wallets(created_at DESC);`);

  await ensureDefaultSettings();
}

initSchema().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[giftbag] init schema failed:', e);
});

function nowIso() {
  return new Date().toISOString();
}

function formatMoneyVnd(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("vi-VN")} VND`;
}

async function sendGiftbagWebhook(message) {
  if (!GIFTBAG_WEBHOOK_URL) return;
  try {
    await fetch(GIFTBAG_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(message || "") })
    });
  } catch (_) {}
}

function normalizeGender(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "male" || raw === "nam") return "male";
  if (raw === "female" || raw === "nu" || raw === "nữ") return "female";
  return "other";
}

async function generateCtvCode() {
  for (let i = 0; i < 24; i += 1) {
    const code = `CTV_${Math.floor(1000 + Math.random() * 9000)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await get(`SELECT id FROM collaborators WHERE code = ?`, [code]);
    if (!exists) return code;
  }
  return `CTV_${Date.now().toString().slice(-6)}`;
}

function compactStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const i = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${i}${s}`;
}

async function generateWalletCode(ctvCode) {
  for (let i = 0; i < 24; i += 1) {
    const code = `WALLET_${ctvCode}_${compactStamp()}_${Math.floor(10 + Math.random() * 90)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await get(`SELECT id FROM gift_wallets WHERE wallet_code = ?`, [code]);
    if (!exists) return code;
  }
  return `WALLET_${ctvCode}_${Date.now()}`;
}

async function generateVoucherCode(ctvCode) {
  for (let i = 0; i < 24; i += 1) {
    const code = `${ctvCode}_VOUCHER_${compactStamp()}_${Math.floor(10 + Math.random() * 90)}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await get(`SELECT id FROM commission_vouchers WHERE voucher_code = ?`, [code]);
    if (!exists) return code;
  }
  return `VOUCHER_${ctvCode}_${Date.now()}`;
}

const SERVICE_CATEGORY_RULES = {
  implant: 0.4,
  porcelain: 0.3,
  general: 0.2,
  orthodontic: 0.1
};
const DEFAULT_COMMISSION_RATE_LEVEL_1 = 0.1;
const DEFAULT_COMMISSION_RATE_LEVEL_2 = 0.1;

function commissionFormulaByRate(rate, level) {
  const pct = Number((Number(rate || 0) * 100).toFixed(2));
  return `${pct}% (cấp ${level}) x (Hóa đơn khách mới)`;
}

function normalizeCategory(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!SERVICE_CATEGORY_RULES[key]) return null;
  return key;
}

function getWalletYearlyCap(wallet) {
  return Number((Number(wallet.total_value || 0) * 0.1).toFixed(0));
}

async function getWalletUsageMapByYear(walletIds, year) {
  if (!Array.isArray(walletIds) || walletIds.length === 0) return new Map();
  const ids = walletIds.map((id) => Number(id || 0)).filter((id) => id > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT wallet_id, service_category, SUM(gift_used) AS used_total
     FROM wallet_usage
     WHERE wallet_id IN (${placeholders})
       AND strftime('%Y', used_at) = ?
     GROUP BY wallet_id, service_category`,
    [...ids, String(year)]
  );
  const map = new Map();
  rows.forEach((row) => {
    const wid = Number(row.wallet_id || 0);
    if (!wid) return;
    const entry = map.get(wid) || {
      total: 0,
      implant: 0,
      porcelain: 0,
      general: 0,
      orthodontic: 0
    };
    const used = Number(row.used_total || 0);
    const cat = String(row.service_category || '').trim().toLowerCase();
    entry.total += used;
    if (cat === 'implant') entry.implant += used;
    else if (cat === 'porcelain') entry.porcelain += used;
    else if (cat === 'general') entry.general += used;
    else if (cat === 'orthodontic') entry.orthodontic += used;
    map.set(wid, entry);
  });
  return map;
}

async function getWalletUsageInYearByCategory(walletId, year, category) {
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const row = await get(
    `SELECT COALESCE(SUM(gift_used), 0) AS used
     FROM wallet_usage
     WHERE wallet_id = ? AND used_at >= ? AND used_at < ? AND service_category = ?`,
    [walletId, start, end, category]
  );
  return Number(row?.used || 0);
}

async function getWalletUsageInYear(walletId, year) {
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;
  const row = await get(
    `SELECT COALESCE(SUM(gift_used), 0) AS used
     FROM wallet_usage
     WHERE wallet_id = ? AND used_at >= ? AND used_at < ?`,
    [walletId, start, end]
  );
  return Number(row?.used || 0);
}

async function audit(action, entityType, entityId, before, after) {
  await run(
    `INSERT INTO audit_logs(at, action, entity_type, entity_id, before_json, after_json) VALUES (?,?,?,?,?,?)`,
    [
      nowIso(),
      action,
      entityType,
      String(entityId),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null
    ]
  );
}

function clampCommissionRate(value, fallback = DEFAULT_COMMISSION_RATE_LEVEL_1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

async function ensureDefaultSettings() {
  const defaults = [
    ['commission_rate_level_1', String(DEFAULT_COMMISSION_RATE_LEVEL_1)],
    ['commission_rate_level_2', String(DEFAULT_COMMISSION_RATE_LEVEL_2)]
  ];
  for (const [key, value] of defaults) {
    // eslint-disable-next-line no-await-in-loop
    await run(
      `INSERT OR IGNORE INTO system_settings(setting_key, setting_value, updated_at) VALUES (?,?,?)`,
      [key, value, nowIso()]
    );
  }
}

async function getCommissionVoucherSettings() {
  const rows = await all(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?)`,
    ['commission_rate_level_1', 'commission_rate_level_2']
  );
  const map = {};
  rows.forEach((row) => {
    map[String(row.setting_key || '')] = String(row.setting_value || '');
  });
  const level1Rate = clampCommissionRate(map.commission_rate_level_1, DEFAULT_COMMISSION_RATE_LEVEL_1);
  const level2Rate = clampCommissionRate(map.commission_rate_level_2, DEFAULT_COMMISSION_RATE_LEVEL_2);
  return {
    level1Rate,
    level2Rate
  };
}

function normalizeCustomerCode(value) {
  return String(value || '').trim().toUpperCase();
}

function toIsoDateOnly(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    // Support timestamp in seconds or milliseconds.
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeMoneyLike(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[.,\s]/g, '').replace(/[^0-9\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function excelDateToIsoDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  // If already ISO date
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Excel serial date (days since 1899-12-30)
  const n = typeof value === 'number' ? value : Number(s);
  if (Number.isFinite(n) && n > 0 && n < 60000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // Fallback to existing parser
  return toIsoDateOnly(value);
}

async function fetchGetflyAccountByCode(customerCode, apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error('Missing Getfly API key');
  }
  const endpoint =
    `${SINGAE_LOOKUP_GETFLY_API_URL}?filtering[account_code:eq]=${encodeURIComponent(customerCode)}` +
    '&fields=id,account_code,account_name,description,billing_address_street,phone_office,email,mgr_email,mgr_display_name,website,logo,birthday,sic_code,created_at,account_type,account_source,relation_id,relation_name,gender,total_revenue,contacts,account_manager,accessible_user_ids,custom_fields&limit=4';
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { 'X-API-KEY': key }
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch (_) {
    const err = new Error(`Getfly parse error (${response.status})`);
    err.upstreamStatus = response.status;
    err.upstreamBody = { raw };
    throw err;
  }
  if (!response.ok) {
    const err = new Error(`Getfly API error (${response.status})`);
    err.upstreamStatus = response.status;
    err.upstreamBody = body;
    throw err;
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  const account = list[0] || null;
  if (!account) {
    const err = new Error('Customer not found in Getfly response');
    err.upstreamStatus = response.status;
    err.upstreamBody = body;
    throw err;
  }
  const fetchedAt = nowIso();
  await run(
    `INSERT INTO getfly_account_cache(
      customer_code, account_id, account_name, phone_office, relation_name, email, birthday, billing_address_street, payload_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_code) DO UPDATE SET
      account_id = excluded.account_id,
      account_name = excluded.account_name,
      phone_office = excluded.phone_office,
      relation_name = excluded.relation_name,
      email = excluded.email,
      birthday = excluded.birthday,
      billing_address_street = excluded.billing_address_street,
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at`,
    [
      String(account.account_code || customerCode),
      Number(account.id || 0) || null,
      String(account.account_name || ''),
      String(account.phone_office || ''),
      String(account.relation_name || ''),
      String(account.email || ''),
      String(account.birthday || ''),
      String(account.billing_address_street || ''),
      JSON.stringify(body || {}),
      fetchedAt
    ]
  );
  return { account, raw: body, fetchedAt };
}

async function upsertGdv25CustomerFromGetfly(customerCode, looked) {
  const account = looked?.account || null;
  const raw = looked?.raw || null;
  const syncedAt = nowIso();
  await run(
    `INSERT INTO gdv25vnp_customers(customer_code, getfly_account_id, account_name, phone, payload_json, synced_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(customer_code) DO UPDATE SET
       getfly_account_id = excluded.getfly_account_id,
       account_name = excluded.account_name,
       phone = excluded.phone,
       payload_json = excluded.payload_json,
       synced_at = excluded.synced_at`,
    [
      String(customerCode || '').trim().toUpperCase(),
      account ? (Number(account.id || 0) || null) : null,
      String(account?.account_name || account?.relation_name || ''),
      String(account?.phone_office || ''),
      raw ? JSON.stringify(raw) : null,
      syncedAt
    ]
  );
  return { customer_code: customerCode, getfly_account_id: Number(account?.id || 0) || null, account_name: account?.account_name || null, phone: account?.phone_office || null, synced_at: syncedAt };
}

async function upsertFirstCtvFromGetfly(customerCode, looked, overrideName = null) {
  const account = looked?.account || null;
  const raw = looked?.raw || null;
  const code = `CTV_${String(customerCode || '').trim().toUpperCase()}`;
  const name = String(overrideName || account?.account_name || account?.relation_name || customerCode || '').trim();
  const phone = String(account?.phone_office || account?.mobile || '').trim() || null;
  const address = String(account?.billing_address_street || account?.address || '').trim() || null;
  const date_of_birth = toIsoDateOnly(account?.birthday);
  const gender = normalizeGender(account?.gender);
  const activated_at = nowIso().slice(0, 10);
  const created_at = nowIso();
  const getfly_account_id = account ? (Number(account.id || 0) || null) : null;
  const getfly_raw_json = raw ? JSON.stringify(raw) : null;

  const existing = await get(`SELECT id FROM collaborators WHERE customer_code = ? OR code = ? LIMIT 1`, [customerCode, code]);
  if (existing?.id) {
    await run(
      `UPDATE collaborators
       SET name = ?, phone = ?, date_of_birth = ?, gender = ?, address = ?,
           customer_code = ?, getfly_account_id = ?, getfly_raw_json = ?
       WHERE id = ?`,
      [name || customerCode, phone, date_of_birth, gender, address, customerCode, getfly_account_id, getfly_raw_json, existing.id]
    );
    const row = await get(`SELECT * FROM collaborators WHERE id = ?`, [existing.id]);
    return row;
  }

  const r = await run(
    `INSERT INTO collaborators(
      code, name, date_of_birth, gender, address, phone, citizen_id, note, referrer_ctv_id, activated_at, status, created_at,
      customer_code, getfly_account_id, getfly_raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      code,
      name || customerCode,
      date_of_birth,
      gender,
      address,
      phone,
      null,
      'seed_from_gdv25vnp_sync',
      null,
      activated_at,
      'active',
      created_at,
      customerCode,
      getfly_account_id,
      getfly_raw_json
    ]
  );
  const row = await get(`SELECT * FROM collaborators WHERE id = ?`, [r.lastID]);
  return row;
}

function computeYearsFromDates(validFrom, validTo, fallback = 10) {
  try {
    const a = new Date(String(validFrom || ''));
    const b = new Date(String(validTo || ''));
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return fallback;
    const years = Math.max(1, Math.round((b.getTime() - a.getTime()) / (365 * 24 * 60 * 60 * 1000)));
    return Number.isFinite(years) ? years : fallback;
  } catch (_) {
    return fallback;
  }
}

router.get('/health', (req, res) => {
  res.json({ name: 'giftbag', time: nowIso() });
});

router.get('/settings/getfly', async (req, res) => {
  try {
    const fromEnv = String(SINGAE_LOOKUP_GETFLY_API_KEY || '').trim();
    const fromDb = String(await getSetting('getfly_api_key', '') || '').trim();
    const key = fromEnv || fromDb;
    return res.json({
      has_key: Boolean(key),
      source: fromEnv ? 'env' : (fromDb ? 'db' : 'none')
    });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.put('/settings/getfly', async (req, res) => {
  try {
    const key = String(req.body?.api_key || '').trim();
    if (!key) return res.status(400).json({ error: 'api_key is required' });
    const before = { has_key: Boolean(String(await getSetting('getfly_api_key', '') || '').trim()) };
    await setSetting('getfly_api_key', key);
    const after = { has_key: true, source: 'db' };
    await audit('update', 'getfly_api_key', 'global', before, after);
    return res.json({ ok: true, ...after });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/settings/commission-voucher', async (req, res) => {
  try {
    const settings = await getCommissionVoucherSettings();
    res.json({
      level1_percent: Number((settings.level1Rate * 100).toFixed(2)),
      level2_percent: Number((settings.level2Rate * 100).toFixed(2))
    });
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.put('/settings/commission-voucher', async (req, res) => {
  try {
    const level1Percent = Number(req.body?.level1_percent);
    const level2Percent = Number(req.body?.level2_percent);
    if (!Number.isFinite(level1Percent) || level1Percent < 0 || level1Percent > 100) {
      return res.status(400).json({ error: 'Invalid level1_percent (0..100)' });
    }
    if (!Number.isFinite(level2Percent) || level2Percent < 0 || level2Percent > 100) {
      return res.status(400).json({ error: 'Invalid level2_percent (0..100)' });
    }
    const updatedAt = nowIso();
    await run(
      `INSERT INTO system_settings(setting_key, setting_value, updated_at)
       VALUES (?,?,?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
      ['commission_rate_level_1', String(level1Percent / 100), updatedAt]
    );
    await run(
      `INSERT INTO system_settings(setting_key, setting_value, updated_at)
       VALUES (?,?,?)
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
      ['commission_rate_level_2', String(level2Percent / 100), updatedAt]
    );
    await audit('update', 'commission_voucher_settings', 'global', null, {
      level1_percent: level1Percent,
      level2_percent: level2Percent
    });
    return res.json({ ok: true, level1_percent: level1Percent, level2_percent: level2Percent });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

// CTV
router.get('/ctv', async (req, res) => {
  try {
    const rows = await all(
      `SELECT c.id, c.code, c.name, c.date_of_birth, c.gender, c.address, c.citizen_id, c.note,
              c.phone, c.customer_code, c.getfly_account_id, c.getfly_raw_json,
              c.referrer_ctv_id, r.code AS referrer_code, r.name AS referrer_name,
              (SELECT COUNT(1)
                 FROM gift_wallets w
                WHERE w.collaborator_id = c.id
                  AND date('now') BETWEEN date(w.valid_from) AND date(w.valid_to)
                  AND (
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_implant_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'implant' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_porcelain_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'porcelain' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_general_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'general' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_orthodontic_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'orthodontic' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                  )
              ) AS wallet_count,
              (SELECT COUNT(1) FROM commission_vouchers cv WHERE cv.recipient_ctv_id = c.id AND cv.status = 'unpaid') AS voucher_count,
              c.activated_at, c.status, c.created_at
       FROM collaborators c
       LEFT JOIN collaborators r ON r.id = c.referrer_ctv_id
       WHERE COALESCE(c.status, 'active') = 'active'
       ORDER BY c.id DESC`
    );
    const normalized = rows.map((row) => {
      let getfly = null;
      try {
        const parsed = row?.getfly_raw_json ? JSON.parse(row.getfly_raw_json) : null;
        getfly = parsed?.data?.[0] || parsed || null;
      } catch (_) {
        getfly = null;
      }
      return {
        ...row,
        getfly
      };
    });
    res.json(normalized);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.delete('/ctv/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid CTV id' });
    const before = await get(`SELECT * FROM collaborators WHERE id = ?`, [id]);
    if (!before) return res.status(404).json({ error: 'CTV not found' });
    // Remove all wallets (and their usage) owned by this CTV
    const walletIdsRows = await all(`SELECT id FROM gift_wallets WHERE collaborator_id = ?`, [id]);
    const walletIds = walletIdsRows.map((r) => Number(r.id || 0)).filter(Boolean);
    if (walletIds.length) {
      const placeholders = walletIds.map(() => '?').join(',');
      await run(`DELETE FROM wallet_usage WHERE wallet_id IN (${placeholders})`, walletIds);
      await run(`DELETE FROM gift_wallets WHERE id IN (${placeholders})`, walletIds);
    }
    // Remove commission vouchers where this CTV is recipient (giữ phiếu mà CTV là nguồn)
    await run(`DELETE FROM commission_vouchers WHERE recipient_ctv_id = ?`, [id]);
    // Soft-delete CTV to preserve references elsewhere if any
    await run(`UPDATE collaborators SET status = 'inactive' WHERE id = ?`, [id]);
    const after = await get(`SELECT * FROM collaborators WHERE id = ?`, [id]);
    await audit('delete_soft', 'ctv', id, before, after);
    return res.json({ ok: true, id, status: 'inactive' });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.put('/ctv/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid CTV id' });
    const before = await get(`SELECT * FROM collaborators WHERE id = ?`, [id]);
    if (!before) return res.status(404).json({ error: 'CTV not found' });

    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim() || null;
    const date_of_birth = toIsoDateOnly(req.body?.date_of_birth || req.body?.birthday);
    const gender = normalizeGender(req.body?.gender);
    const citizen_id = String(req.body?.citizen_id || '').trim() || null;
    const address = String(req.body?.address || '').trim() || null;
    const note = String(req.body?.note || '').trim() || null;

    if (!name) return res.status(400).json({ error: 'name is required' });

    await run(
      `UPDATE collaborators
       SET name = ?, phone = ?, date_of_birth = ?, gender = ?, citizen_id = ?, address = ?, note = ?
       WHERE id = ?`,
      [name, phone, date_of_birth, gender, citizen_id, address, note, id]
    );

    const after = await get(
      `SELECT c.id, c.code, c.name, c.date_of_birth, c.gender, c.address, c.citizen_id, c.note,
              c.phone, c.customer_code, c.getfly_account_id, c.getfly_raw_json,
              c.referrer_ctv_id, r.code AS referrer_code, r.name AS referrer_name,
              (SELECT COUNT(1)
                 FROM gift_wallets w
                WHERE w.collaborator_id = c.id
                  AND date('now') BETWEEN date(w.valid_from) AND date(w.valid_to)
                  AND (
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_implant_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'implant' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_porcelain_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'porcelain' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_general_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'general' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                    OR
                    (ROUND((COALESCE(w.annual_cap, ROUND(COALESCE(w.total_value, 0) * 0.1, 0)) * COALESCE(w.alloc_orthodontic_pct, 0)) / 100.0, 0)
                      - COALESCE((SELECT SUM(wu.gift_used) FROM wallet_usage wu WHERE wu.wallet_id = w.id AND wu.service_category = 'orthodontic' AND strftime('%Y', wu.used_at) = strftime('%Y', 'now')), 0)) > 0
                  )
              ) AS wallet_count,
              (SELECT COUNT(1) FROM commission_vouchers cv WHERE cv.recipient_ctv_id = c.id AND cv.status = 'unpaid') AS voucher_count,
              c.activated_at, c.status, c.created_at
       FROM collaborators c
       LEFT JOIN collaborators r ON r.id = c.referrer_ctv_id
       WHERE c.id = ?`,
      [id]
    );
    await audit('update', 'ctv', id, before, after);
    res.json(after);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/ctv/getfly/:customerCode', async (req, res) => {
  try {
    const customerCode = normalizeCustomerCode(req.params.customerCode);
    if (!customerCode) return res.status(400).json({ error: 'customer_code is required' });
    const existing = await get(`SELECT id, code, name, customer_code FROM collaborators WHERE customer_code = ? LIMIT 1`, [customerCode]);
    if (existing?.id) {
      return res.status(409).json({
        error: 'CUSTOMER_CODE_EXISTS',
        message: `Mã KH ${customerCode} đã tồn tại trong database`,
        ctv: existing
      });
    }
    const headerKey = String(req.headers['x-api-key'] || '').trim();
    const dbKey = String(await getSetting('getfly_api_key', '') || '').trim();
    const apiKey = headerKey || String(SINGAE_LOOKUP_GETFLY_API_KEY || '').trim() || dbKey;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Missing Getfly API key',
        hint: 'Set env SINGAE_LOOKUP_GETFLY_API_KEY or PUT /api/giftbag/settings/getfly { api_key }'
      });
    }
    const result = await fetchGetflyAccountByCode(customerCode, apiKey);
    if (!result.account) {
      return res.status(404).json({ error: 'Customer not found in Getfly' });
    }
    return res.json({
      customer_code: customerCode,
      account: result.account,
      raw: result.raw
    });
  } catch (e) {
    const upstreamStatus = Number(e?.upstreamStatus || 0);
    const status = upstreamStatus >= 400 ? 502 : 500;
    return res.status(status).json({
      error: 'Getfly lookup failed',
      message: e.message,
      upstream_status: upstreamStatus || null,
      upstream_message: e?.upstreamBody?.message || e?.upstreamBody?.error || null
    });
  }
});

router.post('/ctv', async (req, res) => {
  try {
    const actor = String(
      req.user?.username
      || req.body?.operator?.username
      || 'User'
    ).trim() || 'User';
    const inputCode = String(req.body?.code || '').trim();
    const code = inputCode || await generateCtvCode();
    const customer_code = normalizeCustomerCode(req.body?.customer_code || '');
    if (!customer_code) return res.status(400).json({ error: 'customer_code is required' });
    const exists = await get(`SELECT id, code, name, customer_code FROM collaborators WHERE customer_code = ? LIMIT 1`, [customer_code]);
    if (exists?.id) {
      return res.status(409).json({
        error: 'CUSTOMER_CODE_EXISTS',
        message: `Mã KH ${customer_code} đã tồn tại trong database`,
        ctv: exists
      });
    }
    let getfly_account_id = null;
    let getfly_raw_json = null;
    const dbKey = String(await getSetting('getfly_api_key', '') || '').trim();
    const apiKey = String(SINGAE_LOOKUP_GETFLY_API_KEY || '').trim() || dbKey;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Missing Getfly API key',
        hint: 'Set env SINGAE_LOOKUP_GETFLY_API_KEY or PUT /api/giftbag/settings/getfly { api_key }'
      });
    }
    const looked = await fetchGetflyAccountByCode(customer_code, apiKey);
    if (!looked.account) return res.status(404).json({ error: `Không tìm thấy KH ${customer_code} trên Getfly` });
    const getflyAccount = looked.account;
    getfly_account_id = Number(getflyAccount?.id || getflyAccount?.account_id || 0) || null;
    getfly_raw_json = JSON.stringify(looked.raw || {});

    const profile = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : {};
    const name = String(profile?.name || getflyAccount?.account_name || getflyAccount?.relation_name || customer_code).trim();
    const date_of_birth = toIsoDateOnly(profile?.birthday || profile?.date_of_birth || getflyAccount?.birthday);
    const gender = normalizeGender(profile?.gender || getflyAccount?.gender);
    const address = String(profile?.address || getflyAccount?.billing_address_street || getflyAccount?.address || '').trim() || null;
    const phone = String(profile?.phone || getflyAccount?.phone_office || getflyAccount?.mobile || '').trim();
    const citizen_id = null;
    const note = String(profile?.note || req.body?.note || '').trim() || null;
    const referrer_ctv_id = req.body?.referrer_ctv_id ? Number(req.body.referrer_ctv_id) : null;
    const activated_at = String(req.body?.activated_at || '').trim() || nowIso().slice(0, 10);
    if (!name) return res.status(400).json({ error: 'Missing full name from Getfly' });
    if (!activated_at) return res.status(400).json({ error: 'activated_at is required' });
    if (referrer_ctv_id && !Number.isFinite(referrer_ctv_id)) {
      return res.status(400).json({ error: 'Invalid referrer_ctv_id' });
    }
    if (referrer_ctv_id) {
      const referrer = await get(`SELECT id FROM collaborators WHERE id = ?`, [referrer_ctv_id]);
      if (!referrer) return res.status(400).json({ error: 'Referrer CTV not found' });
    }
    const created_at = nowIso();
    const r = await run(
      `INSERT INTO collaborators(
        code, name, date_of_birth, gender, address, phone, citizen_id, note, referrer_ctv_id, activated_at, status, created_at,
        customer_code, getfly_account_id, getfly_raw_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [code, name, date_of_birth, gender, address, phone, citizen_id, note, referrer_ctv_id, activated_at, 'active', created_at, customer_code || null, getfly_account_id, getfly_raw_json]
    );
    const ctv = await get(
      `SELECT c.id, c.code, c.name, c.date_of_birth, c.gender, c.address, c.phone, c.citizen_id, c.note, c.customer_code, c.getfly_account_id, c.getfly_raw_json,
              c.referrer_ctv_id, r.code AS referrer_code, r.name AS referrer_name,
              c.activated_at, c.status, c.created_at
       FROM collaborators c
       LEFT JOIN collaborators r ON r.id = c.referrer_ctv_id
       WHERE c.id = ?`,
      [r.lastID]
    );
    const response = {
      ...ctv,
      getfly: looked.raw?.data?.[0] || null
    };
    await audit('create', 'ctv', r.lastID, null, response);
    await sendGiftbagWebhook(`${actor} đã tạo thành công CTV: ${response.name || response.code || "-"}`);
    if (response.referrer_ctv_id && response.referrer_name) {
      await sendGiftbagWebhook(`${actor} đã set cộng tác viên cấp trên: ${response.referrer_name} cho CTV ${response.name || response.code || "-"}`);
    }
    res.json(response);
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(400).json({ error: 'CTV code already exists' });
    }
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

// Wallets
router.get('/ctv/:ctvId/wallets', async (req, res) => {
  try {
    const ctvId = Number(req.params.ctvId);
    const rows = await all(
      `SELECT id, wallet_code, collaborator_id as ctv_id, total_value, annual_cap,
              alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
              alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
              used_total_amount, used_implant_amount, used_porcelain_amount, used_general_amount, used_orthodontic_amount,
              years, valid_from, valid_to, created_at
       FROM gift_wallets WHERE collaborator_id = ? ORDER BY id DESC`,
      [ctvId]
    );
    const year = new Date().getUTCFullYear();
    const usageMap = await getWalletUsageMapByYear(rows.map((r) => r.id), year);
    const enriched = [];
    for (const wallet of rows) {
      const usedTotal = Number(wallet.used_total_amount || 0);
      const usage = usageMap.get(Number(wallet.id)) || {};
      const usedYear = Number(usage.total || 0);
      const usedImplant = Number(wallet.used_implant_amount || 0);
      const usedPorcelain = Number(wallet.used_porcelain_amount || 0);
      const usedGeneral = Number(wallet.used_general_amount || 0);
      const usedOrtho = Number(wallet.used_orthodontic_amount || 0);
      const yearlyCap = getWalletYearlyCap(wallet);
      const allocImplantYear = Number((yearlyCap * Number(wallet.alloc_implant_pct || 0) / 100).toFixed(0));
      const allocPorcelainYear = Number((yearlyCap * Number(wallet.alloc_porcelain_pct || 0) / 100).toFixed(0));
      const allocGeneralYear = Number((yearlyCap * Number(wallet.alloc_general_pct || 0) / 100).toFixed(0));
      const allocOrthoYear = Number((yearlyCap * Number(wallet.alloc_orthodontic_pct || 0) / 100).toFixed(0));
      const usedImplantYear = Number(usage.implant || 0);
      const usedPorcelainYear = Number(usage.porcelain || 0);
      const usedGeneralYear = Number(usage.general || 0);
      const usedOrthoYear = Number(usage.orthodontic || 0);
      enriched.push({
        ...wallet,
        yearly_cap: yearlyCap,
        used_total: usedTotal,
        remaining_total: Math.max(0, Number(wallet.total_value) - usedTotal),
        used_year: usedYear,
        remaining_year: Math.max(0, yearlyCap - usedYear),
        used_implant_amount: usedImplantYear,
        used_porcelain_amount: usedPorcelainYear,
        used_general_amount: usedGeneralYear,
        used_orthodontic_amount: usedOrthoYear,
        remaining_implant_amount: Math.max(0, allocImplantYear - usedImplantYear),
        remaining_porcelain_amount: Math.max(0, allocPorcelainYear - usedPorcelainYear),
        remaining_general_amount: Math.max(0, allocGeneralYear - usedGeneralYear),
        remaining_orthodontic_amount: Math.max(0, allocOrthoYear - usedOrthoYear)
      });
    }
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/wallets', async (req, res) => {
  try {
    const rows = await all(
      `SELECT w.id, w.wallet_code, w.collaborator_id as ctv_id, w.total_value,
              w.alloc_implant_pct, w.alloc_porcelain_pct, w.alloc_general_pct, w.alloc_orthodontic_pct,
              w.years, w.valid_from, w.valid_to, w.created_at,
              c.code AS ctv_code, c.name AS ctv_name
       FROM gift_wallets w
       JOIN collaborators c ON c.id = w.collaborator_id
       ORDER BY w.id DESC`
    );
    const year = new Date().getUTCFullYear();
    const usageMap = await getWalletUsageMapByYear(rows.map((r) => r.id), year);
    const enriched = [];
    for (const wallet of rows) {
      const usage = usageMap.get(Number(wallet.id)) || {};
      const usedYear = Number(usage.total || 0);
      const yearlyCap = getWalletYearlyCap(wallet);
      const allocImplantYear = Number((yearlyCap * Number(wallet.alloc_implant_pct || 0) / 100).toFixed(0));
      const allocPorcelainYear = Number((yearlyCap * Number(wallet.alloc_porcelain_pct || 0) / 100).toFixed(0));
      const allocGeneralYear = Number((yearlyCap * Number(wallet.alloc_general_pct || 0) / 100).toFixed(0));
      const allocOrthoYear = Number((yearlyCap * Number(wallet.alloc_orthodontic_pct || 0) / 100).toFixed(0));
      const usedImplantYear = Number(usage.implant || 0);
      const usedPorcelainYear = Number(usage.porcelain || 0);
      const usedGeneralYear = Number(usage.general || 0);
      const usedOrthoYear = Number(usage.orthodontic || 0);
      enriched.push({
        ...wallet,
        used_total: usedYear,
        remaining_implant_amount: Math.max(0, allocImplantYear - usedImplantYear),
        remaining_porcelain_amount: Math.max(0, allocPorcelainYear - usedPorcelainYear),
        remaining_general_amount: Math.max(0, allocGeneralYear - usedGeneralYear),
        remaining_orthodontic_amount: Math.max(0, allocOrthoYear - usedOrthoYear)
      });
    }
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.post('/ctv/:ctvId/wallets', async (req, res) => {
  try {
    const ctvId = Number(req.params.ctvId);
    const ctv = await get(`SELECT id, code, activated_at, referrer_ctv_id FROM collaborators WHERE id = ?`, [ctvId]);
    if (!ctv) return res.status(404).json({ error: 'CTV not found' });
    const total_value = Number(req.body?.total_value || 0);
    const years = Math.max(1, Number(req.body?.years || 10));
    const annual_cap = Number((total_value * 0.1).toFixed(0));
    const alloc_implant_pct = Number(req.body?.alloc_implant_pct ?? 40);
    const alloc_porcelain_pct = Number(req.body?.alloc_porcelain_pct ?? 30);
    const alloc_general_pct = Number(req.body?.alloc_general_pct ?? 20);
    const alloc_orthodontic_pct = Number(req.body?.alloc_orthodontic_pct ?? 10);
    if (!Number.isFinite(total_value) || total_value <= 0) return res.status(400).json({ error: 'Invalid total_value' });
    if (![alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct].every((x) => Number.isFinite(x) && x >= 0)) {
      return res.status(400).json({ error: 'Invalid allocation percentages' });
    }
    const allocTotalPct = alloc_implant_pct + alloc_porcelain_pct + alloc_general_pct + alloc_orthodontic_pct;
    if (Math.abs(allocTotalPct - 100) > 0.01) {
      return res.status(400).json({ error: 'Allocation percentages must total 100%' });
    }
    const alloc_implant_amount = Number(((total_value * alloc_implant_pct) / 100).toFixed(0));
    const alloc_porcelain_amount = Number(((total_value * alloc_porcelain_pct) / 100).toFixed(0));
    const alloc_general_amount = Number(((total_value * alloc_general_pct) / 100).toFixed(0));
    const alloc_orthodontic_amount = Number(((total_value * alloc_orthodontic_pct) / 100).toFixed(0));
    const valid_from = String(ctv.activated_at || nowIso().slice(0, 10));
    const endDate = new Date(valid_from);
    endDate.setFullYear(endDate.getFullYear() + years);
    const valid_to = endDate.toISOString().slice(0, 10);
    const created_at = nowIso();
    const wallet_code = await generateWalletCode(String(ctv.code || `CTV_${ctv.id}`));
    const r = await run(
      `INSERT INTO gift_wallets(
        wallet_code, collaborator_id, total_value, annual_cap,
        alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
        alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
        years, valid_from, valid_to, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        wallet_code, ctvId, total_value, annual_cap,
        alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
        alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
        years, valid_from, valid_to, created_at
      ]
    );
    const wallet = await get(
      `SELECT id, wallet_code, collaborator_id as ctv_id, total_value, annual_cap,
              alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
              alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
              used_total_amount, used_implant_amount, used_porcelain_amount, used_general_amount, used_orthodontic_amount,
              years, valid_from, valid_to, created_at
       FROM gift_wallets WHERE id = ?`,
      [r.lastID]
    );
    await audit('create', 'wallet', r.lastID, null, wallet);
    const ctvInfo = await get(`SELECT id, code, name FROM collaborators WHERE id = ?`, [ctvId]);
    await sendGiftbagWebhook(
      `User đã tạo tạo thành công 1 gói quà cho ctv: ${ctvInfo?.name || ctvInfo?.code || `CTV_${ctvId}`} trị giá: ${formatMoneyVnd(wallet.total_value)} có giá trị đến ${wallet.valid_to}`
    );
    const settings = await getCommissionVoucherSettings();
    const upstreamRecipients = [];
    const level1Id = Number(ctv.referrer_ctv_id || 0);
    if (level1Id > 0) {
      upstreamRecipients.push({ recipientId: level1Id, level: 1, rate: settings.level1Rate });
      const level1 = await get(`SELECT referrer_ctv_id FROM collaborators WHERE id = ?`, [level1Id]);
      const level2Id = Number(level1?.referrer_ctv_id || 0);
      if (level2Id > 0 && level2Id !== level1Id && level2Id !== Number(ctv.id)) {
        upstreamRecipients.push({ recipientId: level2Id, level: 2, rate: settings.level2Rate });
      }
    }

    for (const upstream of upstreamRecipients) {
      // eslint-disable-next-line no-await-in-loop
      const voucher_code = await generateVoucherCode(String(ctv.code || `CTV_${ctv.id}`));
      const base_amount = Number(total_value || 0);
      const commission_amount = Number((base_amount * Number(upstream.rate || 0)).toFixed(0));
      // eslint-disable-next-line no-await-in-loop
      const voucherResult = await run(
        `INSERT INTO commission_vouchers(voucher_code, recipient_ctv_id, source_ctv_id, wallet_id, commission_rate, base_amount, commission_amount, formula_text, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          voucher_code,
          Number(upstream.recipientId),
          Number(ctv.id),
          Number(wallet.id),
          Number(upstream.rate),
          base_amount,
          commission_amount,
          commissionFormulaByRate(upstream.rate, upstream.level),
          'unpaid',
          created_at
        ]
      );
      // eslint-disable-next-line no-await-in-loop
      const voucher = await get(`SELECT * FROM commission_vouchers WHERE id = ?`, [voucherResult.lastID]);
      // eslint-disable-next-line no-await-in-loop
      await audit(`create_level_${upstream.level}`, 'commission_voucher', voucherResult.lastID, null, voucher);
      // eslint-disable-next-line no-await-in-loop
      const recipient = await get(`SELECT code, name FROM collaborators WHERE id = ?`, [Number(upstream.recipientId)]);
      emitGiftbagEvent('voucher_created', {
        voucher_id: Number(voucherResult.lastID),
        voucher_code,
        recipient_ctv_id: Number(upstream.recipientId),
        recipient_code: String(recipient?.code || ''),
        recipient_name: String(recipient?.name || ''),
        source_ctv_id: Number(ctv.id),
        source_code: String(ctvInfo?.code || ''),
        source_name: String(ctvInfo?.name || ''),
        commission_amount,
        status: 'unpaid',
        created_at
      });
      // eslint-disable-next-line no-await-in-loop
      await sendGiftbagWebhook(
        `CTV ${recipient?.name || recipient?.code || "-"} đã được hưởng ${formatMoneyVnd(commission_amount)} (${(Number(upstream.rate || 0) * 100).toFixed(0)}% hóa đơn của khách hàng: ${ctvInfo?.name || ctvInfo?.code || "-"})`
      );
    }
    emitGiftbagEvent('wallet_created', {
      wallet_id: Number(wallet.id),
      wallet_code: String(wallet.wallet_code || ''),
      ctv_id: Number(ctv.id),
      ctv_code: String(ctv.code || ''),
      ctv_name: String(ctvInfo?.name || ctvInfo?.code || ''),
      total_value: Number(wallet.total_value || 0),
      annual_cap: Number(wallet.annual_cap || 0),
      alloc_implant_pct: Number(wallet.alloc_implant_pct || 0),
      alloc_porcelain_pct: Number(wallet.alloc_porcelain_pct || 0),
      alloc_general_pct: Number(wallet.alloc_general_pct || 0),
      alloc_orthodontic_pct: Number(wallet.alloc_orthodontic_pct || 0),
      valid_from: wallet.valid_from,
      valid_to: wallet.valid_to
    });
    res.json(wallet);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/ctv/:ctvId/commission-vouchers', async (req, res) => {
  try {
    const ctvId = Number(req.params.ctvId || 0);
    if (!ctvId) return res.status(400).json({ error: 'Invalid ctvId' });
    const rows = await all(
      `SELECT cv.id, cv.voucher_code, cv.recipient_ctv_id, cv.source_ctv_id, cv.wallet_id, cv.commission_rate,
              COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) AS base_amount,
              COALESCE(NULLIF(cv.commission_amount, 0), ROUND(COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) * COALESCE(cv.commission_rate, 0.1), 0)) AS commission_amount,
              cv.formula_text, cv.status, cv.created_at, cv.paid_at, cv.payment_customer_code,
              src.code AS source_code, src.name AS source_name, src.customer_code AS source_customer_code, w.wallet_code
       FROM commission_vouchers cv
       JOIN collaborators src ON src.id = cv.source_ctv_id
       LEFT JOIN gift_wallets w ON w.id = cv.wallet_id
       WHERE cv.recipient_ctv_id = ?
       ORDER BY cv.id DESC`,
      [ctvId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/commission-vouchers', async (req, res) => {
  try {
    const status = String(req.query?.status || '').trim().toLowerCase();
    const rows = await all(
      `SELECT cv.id, cv.voucher_code, cv.recipient_ctv_id, cv.source_ctv_id, cv.wallet_id, cv.commission_rate,
              COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) AS base_amount,
              COALESCE(NULLIF(cv.commission_amount, 0), ROUND(COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) * COALESCE(cv.commission_rate, 0.1), 0)) AS commission_amount,
              cv.formula_text, cv.status, cv.created_at, cv.paid_at, cv.payment_customer_code,
              src.code AS source_code, src.name AS source_name, src.customer_code AS source_customer_code, rc.code AS recipient_code, rc.name AS recipient_name, w.wallet_code
       FROM commission_vouchers cv
       JOIN collaborators src ON src.id = cv.source_ctv_id
       JOIN collaborators rc ON rc.id = cv.recipient_ctv_id
       LEFT JOIN gift_wallets w ON w.id = cv.wallet_id
       ${status ? "WHERE cv.status = ?" : ""}
       ORDER BY cv.id DESC`,
      status ? [status] : []
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

// Customers (create + attach 1-level referrer)
router.get('/customers', async (req, res) => {
  try {
    const ctvId = Number(req.query?.ctv_id || 0);
    const rows = await all(
      `SELECT c.id, c.name, c.phone, c.getfly_account_id, c.referrer_ctv_id, c.created_at, co.code as referrer_code
       FROM customers c
       JOIN collaborators co ON co.id = c.referrer_ctv_id
       ${ctvId > 0 ? "WHERE c.referrer_ctv_id = ?" : ""}
       ORDER BY c.id DESC`,
      ctvId > 0 ? [ctvId] : []
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const customerId = Number(req.body?.customer_id || 0);
    const walletId = Number(req.body?.wallet_id || 0);
    const orderCode = String(req.body?.order_code || '').trim();
    const serviceCategory = normalizeCategory(req.body?.service_category);
    const invoiceAmount = Number(req.body?.invoice_amount || 0);
    const giftUsed = Number(req.body?.gift_used || 0);
    const customerCode = String(req.body?.customer_code || '').trim() || null;
    const note = String(req.body?.note || '').trim();
    const operator = req.body?.operator && typeof req.body.operator === 'object' ? req.body.operator : {};
    const operatorLabel = String(operator?.username || '').trim()
      ? `${String(operator.username).trim()}${operator?.role ? ` (${operator.role})` : ''}`
      : 'unknown';
    if (!customerId || !walletId || !orderCode) {
      return res.status(400).json({ error: 'Missing customer_id, wallet_id or order_code' });
    }
    if (!serviceCategory) return res.status(400).json({ error: 'Invalid service_category' });
    if (!customerCode) return res.status(400).json({ error: 'customer_code is required (CRM)' });
    if (!note) return res.status(400).json({ error: 'note is required (ai dùng / mục đích / mã KH)' });
    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      return res.status(400).json({ error: 'Invalid invoice_amount' });
    }
    if (!Number.isFinite(giftUsed) || giftUsed < 0) {
      return res.status(400).json({ error: 'Invalid gift_used' });
    }
    if (giftUsed > invoiceAmount) {
      return res.status(400).json({ error: 'gift_used cannot exceed invoice_amount' });
    }

    const customer = await get(`SELECT * FROM customers WHERE id = ?`, [customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const wallet = await get(`SELECT * FROM gift_wallets WHERE id = ?`, [walletId]);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    if (Number(wallet.collaborator_id) !== Number(customer.referrer_ctv_id)) {
      return res.status(400).json({ error: 'Wallet does not belong to customer referrer CTV' });
    }
    const today = nowIso().slice(0, 10);
    if (today < String(wallet.valid_from) || today > String(wallet.valid_to)) {
      return res.status(400).json({ error: 'Wallet is out of validity period' });
    }

    const existingOrder = await get(`SELECT id FROM wallet_usage WHERE order_code = ?`, [orderCode]);
    if (existingOrder) return res.status(400).json({ error: 'order_code already exists' });

    const usedTotal = Number(wallet.used_total_amount || 0);
    const remainingTotal = Math.max(0, Number(wallet.total_value) - usedTotal);
    if (giftUsed > remainingTotal) return res.status(400).json({ error: 'gift_used exceeds wallet remaining total' });

    const year = new Date().getUTCFullYear();
    const yearUsed = await getWalletUsageInYear(wallet.id, year);
    const yearlyCap = getWalletYearlyCap(wallet);
    const remainingYear = Math.max(0, yearlyCap - yearUsed);
    if (giftUsed > remainingYear) return res.status(400).json({ error: 'gift_used exceeds annual cap' });

    const allocPctField = {
      implant: "alloc_implant_pct",
      porcelain: "alloc_porcelain_pct",
      general: "alloc_general_pct",
      orthodontic: "alloc_orthodontic_pct"
    }[serviceCategory];
    const categoryCap = Number((yearlyCap * Number(wallet?.[allocPctField] || 0) / 100).toFixed(0));
    const categoryUsed = await getWalletUsageInYearByCategory(wallet.id, year, serviceCategory);
    const remainingCategory = Math.max(0, categoryCap - categoryUsed);
    if (giftUsed > remainingCategory) return res.status(400).json({ error: 'gift_used exceeds allocated amount for this service' });

    const netAmount = Math.max(0, invoiceAmount);
    const createdAt = nowIso();
    const noteDetailed = `[by:${operatorLabel}] [customer_code:${customerCode}] [purpose:${note}] [service:${serviceCategory}]`;

    const usageResult = await run(
      `INSERT INTO wallet_usage(
        wallet_id, collaborator_id, customer_id, customer_code, receipt_code, order_code, service_category, invoice_amount, gift_used, net_amount, used_at, purpose, note, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        wallet.id,
        wallet.collaborator_id,
        customer.id,
        customerCode,
        null,
        orderCode,
        serviceCategory,
        invoiceAmount,
        giftUsed,
        netAmount,
        createdAt,
        note,
        noteDetailed,
        createdAt
      ]
    );

    const usage = await get(`SELECT * FROM wallet_usage WHERE id = ?`, [usageResult.lastID]);
    const commission = null;
    await run(
      `UPDATE gift_wallets
       SET used_total_amount = COALESCE(used_total_amount, 0) + ?,
           used_implant_amount = used_implant_amount + CASE WHEN ? = 'implant' THEN ? ELSE 0 END,
           used_porcelain_amount = used_porcelain_amount + CASE WHEN ? = 'porcelain' THEN ? ELSE 0 END,
           used_general_amount = used_general_amount + CASE WHEN ? = 'general' THEN ? ELSE 0 END,
           used_orthodontic_amount = used_orthodontic_amount + CASE WHEN ? = 'orthodontic' THEN ? ELSE 0 END
       WHERE id = ?`,
      [
        giftUsed,
        serviceCategory, giftUsed,
        serviceCategory, giftUsed,
        serviceCategory, giftUsed,
        serviceCategory, giftUsed,
        wallet.id
      ]
    );
    await audit('create', 'order', usageResult.lastID, null, { usage, commission });
    await sendGiftbagWebhook(
      `User đã sử dụng gói quà cho khách hàng: ${customer?.name || customerCode || "-"}`
    );
    emitGiftbagEvent('wallet_used', {
      wallet_id: Number(wallet.id),
      wallet_code: String(wallet.wallet_code || ''),
      ctv_id: Number(wallet.collaborator_id),
      ctv_code: String((await get(`SELECT code FROM collaborators WHERE id = ?`, [wallet.collaborator_id]))?.code || ''),
      ctv_name: String((await get(`SELECT name FROM collaborators WHERE id = ?`, [wallet.collaborator_id]))?.name || ''),
      customer_code: customerCode,
      customer_name: customer?.name || '',
      gift_used: giftUsed,
      service_category: serviceCategory,
      used_at: createdAt,
      purpose: note
    });
    return res.json({
      usage,
      commission,
      formula: 'No commission on wallet usage; commission only created when wallet is created'
    });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/ctv/:ctvId/commissions', async (req, res) => {
  try {
    const ctvId = Number(req.params.ctvId);
    const status = String(req.query?.status || '').trim();
    const voucherRows = await all(
      `SELECT cv.id, cv.voucher_code, cv.commission_rate,
              COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) AS base_amount,
              COALESCE(NULLIF(cv.commission_amount, 0), ROUND(COALESCE(NULLIF(cv.base_amount, 0), COALESCE(w.total_value, 0)) * COALESCE(cv.commission_rate, 0.1), 0)) AS commission_amount,
              cv.status, cv.created_at,
              src.name as source_name
       FROM commission_vouchers cv
       JOIN collaborators src ON src.id = cv.source_ctv_id
       LEFT JOIN gift_wallets w ON w.id = cv.wallet_id
       WHERE cv.recipient_ctv_id = ?
       ${status ? "AND cv.status = ?" : ""}
       ORDER BY cv.id DESC`,
      status ? [ctvId, status] : [ctvId]
    );
    const rows = voucherRows.map((v) => ({
      id: v.id,
      order_code: v.voucher_code || `VOUCHER_${v.id}`,
      commission_rate: v.commission_rate,
      invoice_amount: v.base_amount,
      gift_used: 0,
      commission_amount: v.commission_amount,
      status: v.status,
      created_at: v.created_at,
      updated_at: v.created_at,
      customer_name: `Phiếu tự động từ túi quà (${v.source_name || "CTV"})`,
      customer_phone: ""
    }));
    rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.put('/commission-vouchers/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!['unpaid', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use unpaid|paid' });
    }
    const before = await get(`SELECT * FROM commission_vouchers WHERE id = ?`, [id]);
    if (!before) return res.status(404).json({ error: 'Commission voucher not found' });
    const paidAt = status === 'paid' ? nowIso() : null;
    await run(`UPDATE commission_vouchers SET status = ?, paid_at = ? WHERE id = ?`, [status, paidAt, id]);
    const after = await get(`SELECT * FROM commission_vouchers WHERE id = ?`, [id]);
    await audit('update', 'commission_voucher_status', id, before, after);
    res.json(after);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.post('/commission-vouchers/:id/pay', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid voucher id' });
    const customer_code = String(req.body?.customer_code || '').trim();
    const note = String(req.body?.note || '').trim() || null;
    const operator = req.body?.operator && typeof req.body.operator === 'object' ? req.body.operator : {};
    const operatorLabel = String(operator?.username || '').trim()
      ? `${String(operator.username).trim()}${operator?.role ? ` (${operator.role})` : ''}`
      : 'unknown';

    if (!customer_code) return res.status(400).json({ error: 'customer_code is required' });

    const before = await get(`SELECT * FROM commission_vouchers WHERE id = ?`, [id]);
    if (!before) return res.status(404).json({ error: 'Commission voucher not found' });
    const fullPaymentAmount = Number(
      Number(before?.commission_amount || 0) > 0
        ? Number(before.commission_amount)
        : Number((Number(before?.base_amount || 0) * Number(before?.commission_rate || 0.1)).toFixed(0))
    );
    if (!Number.isFinite(fullPaymentAmount) || fullPaymentAmount <= 0) {
      return res.status(400).json({ error: 'commission amount is invalid for full payment' });
    }

    const afterStatus = 'paid';
    const paidAt = nowIso();

    await run(
      `UPDATE commission_vouchers
       SET status = ?,
           paid_at = ?,
           paid_amount = ?,
           payment_customer_code = ?,
           payment_receipt_code = ?,
           payment_note = ?
       WHERE id = ?`,
      [afterStatus, paidAt, fullPaymentAmount, customer_code, null, note, id]
    );

    const after = await get(`SELECT * FROM commission_vouchers WHERE id = ?`, [id]);
    await audit('pay', 'commission_voucher', id, before, after);
    const voucherInfo = await get(
      `SELECT cv.voucher_code, cv.commission_rate, cv.commission_amount, cv.base_amount, cv.formula_text,
              src.code AS source_code, src.name AS source_name,
              rc.code AS recipient_code, rc.name AS recipient_name
       FROM commission_vouchers cv
       JOIN collaborators src ON src.id = cv.source_ctv_id
       JOIN collaborators rc ON rc.id = cv.recipient_ctv_id
       WHERE cv.id = ?`,
      [id]
    );
    await sendGiftbagWebhook(
      `${operatorLabel} đã thanh toán hoa hồng ${formatMoneyVnd(fullPaymentAmount)} cho CTV ${voucherInfo?.recipient_name || voucherInfo?.recipient_code || "-"}`
    );
    emitGiftbagEvent('voucher_paid', {
      voucher_id: Number(id),
      voucher_code: String(voucherInfo?.voucher_code || after?.voucher_code || ''),
      recipient_ctv_id: Number(after?.recipient_ctv_id || 0),
      recipient_code: String(voucherInfo?.recipient_code || ''),
      recipient_name: String(voucherInfo?.recipient_name || ''),
      commission_amount: Number(after?.commission_amount || fullPaymentAmount || 0),
      paid_at: after?.paid_at || paidAt,
      payment_note: note || ''
    });
    res.json(after);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/history/usage', async (req, res) => {
  try {
    const rows = await all(
      `SELECT wu.id, wu.customer_code, wu.receipt_code, wu.order_code, wu.service_category, wu.invoice_amount, wu.gift_used, wu.used_at, wu.note,
              w.wallet_code, c.code AS ctv_code, c.name AS ctv_name, cu.name AS customer_name, cu.phone AS customer_phone
       FROM wallet_usage wu
       JOIN gift_wallets w ON w.id = wu.wallet_id
       JOIN collaborators c ON c.id = wu.collaborator_id
       JOIN customers cu ON cu.id = wu.customer_id
       ORDER BY wu.id DESC
       LIMIT 300`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/history/voucher-payments', async (req, res) => {
  try {
    const rows = await all(
      `SELECT cv.id, cv.voucher_code, cv.commission_amount, cv.status, cv.created_at, cv.paid_at, cv.payment_note AS note,
              src.code AS source_code, src.name AS source_name, rc.code AS recipient_code, rc.name AS recipient_name
       FROM commission_vouchers cv
       JOIN collaborators src ON src.id = cv.source_ctv_id
       JOIN collaborators rc ON rc.id = cv.recipient_ctv_id
       WHERE cv.status = 'paid'
       ORDER BY cv.paid_at DESC, cv.id DESC
       LIMIT 300`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const onEvent = (evt) => {
    try {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    } catch (_) {}
  };
  giftbagEvents.on('event', onEvent);
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 20000);
  req.on('close', () => {
    clearInterval(ping);
    giftbagEvents.off('event', onEvent);
  });
});

router.post('/sync/gdv25vnp', upload.single('file'), async (req, res) => {
  try {
    const dryRun = String(req.body?.dry_run || '').trim() === '1';
    const f = req.file;
    if (!f || !f.buffer) return res.status(400).json({ error: 'Missing file' });

    const wb = xlsx.read(f.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return res.status(400).json({ error: 'No sheet found' });
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' }) || [];

    // Start from row 4 => index 3 (0-based)
    const startIndex = 3;
    const errors = [];
    let rowsTotal = 0;
    let rowsOk = 0;
    let walletsCreated = 0;

    // Need Getfly API key for lookup/create flow
    const dbKey = String(await getSetting('getfly_api_key', '') || '').trim();
    const apiKey = String(SINGAE_LOOKUP_GETFLY_API_KEY || '').trim() || dbKey;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Missing Getfly API key',
        hint: 'Set env SINGAE_LOOKUP_GETFLY_API_KEY or PUT /api/giftbag/settings/getfly { api_key }'
      });
    }

    if (!dryRun) {
      await run('BEGIN');
      // Wipe DB (preserve Getfly API key) before syncing fresh data
      const savedKey = String(await getSetting('getfly_api_key', '') || '');
      // Drop all non-internal tables
      const tables = await all(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name DESC`
      );
      for (const row of tables) {
        const tableName = String(row?.name || '').trim();
        if (!tableName) continue;
        // eslint-disable-next-line no-await-in-loop
        await run(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}"`);
      }
      await initSchema();
      if (savedKey) {
        await setSetting('getfly_api_key', savedKey);
      }
      // End pre-clean section
    }

    for (let i = startIndex; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const rowNumber = i + 1;
      // Mapping: B: Tên KH (1) | C: Mã KH (2) | E: Số lượng gói (4) | H: Giá trị mỗi gói (7) | I: Hạn dùng (8)
      const displayName = String(r[1] ?? '').trim();
      const customerCode = normalizeCustomerCode(r[2]);
      const qtyRaw = r[4];
      const amountRaw = r[7];
      const validToRaw = r[8];
      rowsTotal += 1;

      if (!customerCode) continue;
      const qty = Number(qtyRaw ?? 0);
      const amount = normalizeMoneyLike(amountRaw);
      const validTo = excelDateToIsoDateOnly(validToRaw);

      try {
        // Lookup Getfly for freshest profile data
        const looked = await fetchGetflyAccountByCode(customerCode, apiKey);
        if (!looked?.account) throw new Error(`Getfly not found for ${customerCode}`);

        if (!dryRun) {
          await run(`SAVEPOINT gdv25_row_${rowNumber}`);
          try {
            // Upsert collaborator: create/update from Getfly then override name from sheet
            const expectedCode = `CTV_${customerCode}`;
            const existing = await get(`SELECT * FROM collaborators WHERE customer_code = ? OR code = ? LIMIT 1`, [customerCode, expectedCode]);
            let ctv = null;
            if (existing?.id) {
              const account = looked.account || {};
              const name = String(displayName || account.account_name || account.relation_name || customerCode).trim();
              const phone = String(account.phone_office || account.mobile || '').trim() || null;
              const address = String(account.billing_address_street || account.address || '').trim() || null;
              const date_of_birth = toIsoDateOnly(account.birthday);
              const gender = normalizeGender(account.gender);
              const getfly_account_id = Number(account.id || account.account_id || 0) || null;
              const getfly_raw_json = JSON.stringify(looked.raw || {});
              await run(
                `UPDATE collaborators
                 SET name = ?, phone = ?, date_of_birth = ?, gender = ?, address = ?,
                     customer_code = ?, getfly_account_id = ?, getfly_raw_json = ?
                 WHERE id = ?`,
                [name, phone, date_of_birth, gender, address, customerCode, getfly_account_id, getfly_raw_json, existing.id]
              );
              ctv = await get(`SELECT * FROM collaborators WHERE id = ?`, [existing.id]);
            } else {
              ctv = await upsertFirstCtvFromGetfly(customerCode, looked, displayName || null);
            }

            // Create wallets per E/H/I
            const validFrom = String(ctv?.activated_at || nowIso().slice(0, 10));
            const safeValidTo = validTo || (() => {
              const d = new Date(validFrom);
              d.setFullYear(d.getFullYear() + 10);
              return d.toISOString().slice(0, 10);
            })();
            const totalWallets = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
            if (totalWallets > 0 && Number(amount) > 0) {
              const years = computeYearsFromDates(validFrom, safeValidTo, 10);
              const annual_cap = Number(((Number(amount) || 0) * 0.1).toFixed(0));
              const alloc_implant_pct = 40;
              const alloc_porcelain_pct = 30;
              const alloc_general_pct = 20;
              const alloc_orthodontic_pct = 10;
              const alloc_implant_amount = Number(((Number(amount) * alloc_implant_pct) / 100).toFixed(0));
              const alloc_porcelain_amount = Number(((Number(amount) * alloc_porcelain_pct) / 100).toFixed(0));
              const alloc_general_amount = Number(((Number(amount) * alloc_general_pct) / 100).toFixed(0));
              const alloc_orthodontic_amount = Number(((Number(amount) * alloc_orthodontic_pct) / 100).toFixed(0));
              const createdAt = nowIso();
              for (let k = 0; k < totalWallets; k += 1) {
                // eslint-disable-next-line no-await-in-loop
                const wallet_code = await generateWalletCode(String(ctv?.code || `CTV_${ctv?.id || customerCode}`));
                // eslint-disable-next-line no-await-in-loop
                const ins = await run(
                  `INSERT INTO gift_wallets(
                    wallet_code, collaborator_id, total_value, annual_cap,
                    alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
                    alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
                    years, valid_from, valid_to, created_at
                  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                  [
                    wallet_code,
                    Number(ctv.id),
                    Number(amount),
                    annual_cap,
                    alloc_implant_pct, alloc_porcelain_pct, alloc_general_pct, alloc_orthodontic_pct,
                    alloc_implant_amount, alloc_porcelain_amount, alloc_general_amount, alloc_orthodontic_amount,
                    years,
                    validFrom,
                    safeValidTo,
                    createdAt
                  ]
                );
                // eslint-disable-next-line no-await-in-loop
                await audit('create_from_excel_sync', 'wallet', ins.lastID, null, {
                  customer_code: customerCode,
                  collaborator_id: Number(ctv.id),
                  wallet_code,
                  total_value: Number(amount),
                  valid_from: validFrom,
                  valid_to: safeValidTo,
                  source_row: rowNumber
                });
                walletsCreated += 1;
              }
            }
            await run(`RELEASE SAVEPOINT gdv25_row_${rowNumber}`);
          } catch (e) {
            await run(`ROLLBACK TO SAVEPOINT gdv25_row_${rowNumber}`);
            await run(`RELEASE SAVEPOINT gdv25_row_${rowNumber}`);
            throw e;
          }
        }
        rowsOk += 1;
      } catch (e) {
        errors.push({ row_number: rowNumber, customer_code: customerCode, message: e?.message || String(e) });
      }
    }

    if (!dryRun) await run('COMMIT');

    return res.json({
      ok: true,
      summary: {
        dry_run: dryRun,
        sheet: sheetName,
        rows_total: rowsTotal,
        rows_ok: rowsOk,
        wallets_created: dryRun ? 0 : walletsCreated
      },
      errors
    });
  } catch (e) {
    try { await run('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ error: 'Sync failed', message: e?.message || String(e) });
  }
});

router.get('/gdv25vnp/customers', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query?.limit || 200)));
    const rows = await all(
      `SELECT customer_code, getfly_account_id, account_name, phone, synced_at
       FROM gdv25vnp_customers
       ORDER BY synced_at DESC
       LIMIT ?`,
      [limit]
    );
    return res.json({ ok: true, items: rows });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/gdv25vnp/wallets', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query?.limit || 200)));
    const customerCode = String(req.query?.customer_code || '').trim().toUpperCase();
    const rows = await all(
      `SELECT id, customer_code, amount, valid_to, created_at, source_row, status
       FROM gdv25vnp_wallets
       ${customerCode ? 'WHERE customer_code = ?' : ''}
       ORDER BY id DESC
       LIMIT ?`,
      customerCode ? [customerCode, limit] : [limit]
    );
    return res.json({ ok: true, items: rows });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.post('/admin/reset-db', async (req, res) => {
  try {
    const tables = await all(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name DESC`
    );
    for (const row of tables) {
      const tableName = String(row?.name || '').trim();
      if (!tableName) continue;
      // eslint-disable-next-line no-await-in-loop
      await run(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}"`);
    }
    await initSchema();
    await audit('reset_fresh', 'database', 'giftbag', null, { at: nowIso(), droppedTables: tables.map((x) => x.name) });
    res.json({ ok: true, mode: 'fresh_schema_recreated', droppedTables: tables.map((x) => x.name) });
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/wallets/:walletId/usage', async (req, res) => {
  try {
    const walletId = Number(req.params.walletId);
    const rows = await all(
      `SELECT wu.id, wu.customer_code, wu.receipt_code, wu.order_code, wu.service_category, wu.invoice_amount, wu.gift_used, wu.net_amount, wu.used_at, wu.note,
              c.name as customer_name, c.phone as customer_phone
       FROM wallet_usage wu
       JOIN customers c ON c.id = wu.customer_id
       WHERE wu.wallet_id = ?
       ORDER BY wu.id DESC`,
      [walletId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

function parseNoteDetailed(note) {
  const raw = String(note || '');
  const pick = (key) => {
    const m = raw.match(new RegExp(`\\[${key}:([^\\]]*)\\]`, 'i'));
    return m ? String(m[1] || '').trim() : '';
  };
  return {
    by: pick('by') || null,
    customer_code: pick('customer_code') || null,
    purpose: pick('purpose') || null,
    service: pick('service') || null
  };
}

router.get('/ctv/:ctvId/giftbag-usage', async (req, res) => {
  try {
    const ctvId = Number(req.params.ctvId || 0);
    if (!ctvId) return res.status(400).json({ error: 'Invalid ctvId' });
    const year = Number(req.query?.year || new Date().getUTCFullYear());
    const start = `${year}-01-01T00:00:00.000Z`;
    const end = `${year + 1}-01-01T00:00:00.000Z`;

    const usageRows = await all(
      `SELECT wu.id, wu.wallet_id, wu.customer_code, wu.order_code, wu.service_category, wu.gift_used, wu.used_at, wu.note,
              w.wallet_code, w.total_value, w.alloc_implant_pct, w.alloc_porcelain_pct, w.alloc_general_pct, w.alloc_orthodontic_pct
       FROM wallet_usage wu
       JOIN gift_wallets w ON w.id = wu.wallet_id
       WHERE wu.collaborator_id = ?
         AND wu.used_at >= ? AND wu.used_at < ?
       ORDER BY wu.id DESC
       LIMIT 500`,
      [ctvId, start, end]
    );

    // Precompute per-wallet remaining-by-service for the selected year
    const walletIds = Array.from(new Set(usageRows.map((r) => Number(r.wallet_id || 0)).filter(Boolean)));
    const walletRemainMap = new Map();
    for (const wid of walletIds) {
      // eslint-disable-next-line no-await-in-loop
      const wallet = await get(`SELECT * FROM gift_wallets WHERE id = ?`, [wid]);
      if (!wallet) continue;
      const yearlyCap = getWalletYearlyCap(wallet);
      const allocImplantYear = Number((yearlyCap * Number(wallet.alloc_implant_pct || 0) / 100).toFixed(0));
      const allocPorcelainYear = Number((yearlyCap * Number(wallet.alloc_porcelain_pct || 0) / 100).toFixed(0));
      const allocGeneralYear = Number((yearlyCap * Number(wallet.alloc_general_pct || 0) / 100).toFixed(0));
      const allocOrthoYear = Number((yearlyCap * Number(wallet.alloc_orthodontic_pct || 0) / 100).toFixed(0));
      // eslint-disable-next-line no-await-in-loop
      const usedImplantYear = await getWalletUsageInYearByCategory(wallet.id, year, 'implant');
      // eslint-disable-next-line no-await-in-loop
      const usedPorcelainYear = await getWalletUsageInYearByCategory(wallet.id, year, 'porcelain');
      // eslint-disable-next-line no-await-in-loop
      const usedGeneralYear = await getWalletUsageInYearByCategory(wallet.id, year, 'general');
      // eslint-disable-next-line no-await-in-loop
      const usedOrthoYear = await getWalletUsageInYearByCategory(wallet.id, year, 'orthodontic');
      walletRemainMap.set(wid, {
        remaining_implant_amount: Math.max(0, allocImplantYear - usedImplantYear),
        remaining_porcelain_amount: Math.max(0, allocPorcelainYear - usedPorcelainYear),
        remaining_general_amount: Math.max(0, allocGeneralYear - usedGeneralYear),
        remaining_orthodontic_amount: Math.max(0, allocOrthoYear - usedOrthoYear)
      });
    }

    const out = usageRows.map((r) => {
      const parsed = parseNoteDetailed(r.note);
      const remain = walletRemainMap.get(Number(r.wallet_id || 0)) || null;
      return {
        id: r.id,
        used_at: r.used_at,
        wallet_code: r.wallet_code || null,
        service_category: r.service_category,
        gift_used: r.gift_used,
        customer_code: parsed.customer_code || r.customer_code || null,
        by: parsed.by,
        purpose: parsed.purpose,
        remain
      };
    });
    return res.json({ ok: true, year, items: out });
  } catch (e) {
    return res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 100)));
    const rows = await all(
      `SELECT id, at, action, entity_type, entity_id, before_json, after_json
       FROM audit_logs
       ORDER BY id DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const getfly_account_id = req.body?.getfly_account_id === null || req.body?.getfly_account_id === undefined
      ? null
      : Number(req.body.getfly_account_id);
    const referrer_ctv_id = Number(req.body?.referrer_ctv_id || 0);
    const ctv = await get(`SELECT id FROM collaborators WHERE id = ?`, [referrer_ctv_id]);
    if (!name) return res.status(400).json({ error: 'Missing customer name' });
    if (!ctv) return res.status(400).json({ error: 'Invalid referrer_ctv_id' });
    const created_at = nowIso();
    const r = await run(
      `INSERT INTO customers(name, phone, getfly_account_id, referrer_ctv_id, created_at) VALUES (?,?,?,?,?)`,
      [
        name,
        phone,
        Number.isFinite(getfly_account_id) ? getfly_account_id : null,
        referrer_ctv_id,
        created_at
      ]
    );
    const customer = await get(
      `SELECT id, name, phone, getfly_account_id, referrer_ctv_id, created_at FROM customers WHERE id = ?`,
      [r.lastID]
    );
    await audit('create', 'customer', r.lastID, null, customer);
    res.json(customer);
  } catch (e) {
    res.status(500).json({ error: 'DB error', message: e.message });
  }
});

module.exports = router;

