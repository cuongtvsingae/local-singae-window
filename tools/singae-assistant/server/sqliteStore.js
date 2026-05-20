const fs = require("fs");
const path = require("path");
const { openSqliteDatabase } = require("../../../shared/server-base/openSqlite");

const SINGAE_ASSISTANT_DB_DIR = path.resolve(__dirname, "..", "database");
const DB_FILE = path.join(SINGAE_ASSISTANT_DB_DIR, "singae-assistant.sqlite");

try {
  fs.mkdirSync(SINGAE_ASSISTANT_DB_DIR, { recursive: true });
} catch (e) {
  console.error("[singae-assistant] mkdir failed:", SINGAE_ASSISTANT_DB_DIR, e && e.message ? e.message : e);
}

const db = openSqliteDatabase(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
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

async function initSchema() {
  await run(`PRAGMA journal_mode=WAL;`);
  await run(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

let initPromise = null;
async function ensureInit() {
  if (!initPromise) initPromise = initSchema();
  await initPromise;
}

async function kvHas(key) {
  await ensureInit();
  const row = await get(`SELECT key FROM kv WHERE key = ?`, [key]);
  return Boolean(row);
}

async function kvGetRaw(key) {
  await ensureInit();
  const row = await get(`SELECT value_json FROM kv WHERE key = ?`, [key]);
  return row?.value_json || null;
}

async function kvSetRaw(key, raw) {
  await ensureInit();
  const value = String(raw ?? "");
  await run(
    `INSERT INTO kv(key, value_json, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
    [String(key), value]
  );
}

async function kvGetJson(key, fallback) {
  const raw = await kvGetRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

async function kvSetJson(key, obj) {
  await kvSetRaw(key, JSON.stringify(obj ?? null));
}

// Legacy import removed: clean start only.
async function importAllLegacyOnce() {
  return false;
}

module.exports = {
  DB_FILE,
  kvGetJson,
  kvSetJson,
  kvGetRaw,
  kvSetRaw,
  importAllLegacyOnce
};

