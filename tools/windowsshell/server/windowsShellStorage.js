const fs = require("fs");
const path = require("path");
const { openSqliteDatabase } = require("../../../shared/server-base/openSqlite");
const { DATABASE_ROOT, DB_FILE } = require("./dbPaths");

const DB_DIR = DATABASE_ROOT;

function ensureDirs() {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

ensureDirs();
let db = openSqliteDatabase(DB_FILE);

function isSqliteCorruptError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "").toUpperCase() === "SQLITE_CORRUPT" || msg.includes("database disk image is malformed");
}

let recoveringPromise = null;

function closeDbSafe() {
  return new Promise((resolve) => {
    if (!db) return resolve();
    try {
      db.close(() => resolve());
    } catch (_) {
      resolve();
    }
  });
}

async function recoverCorruptDatabase() {
  if (recoveringPromise) return recoveringPromise;
  recoveringPromise = (async () => {
    await closeDbSafe();
    const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const backup = DB_FILE.replace(/\.sqlite$/i, "") + `.corrupt-backup-${ts}.sqlite`;
    try {
      if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, backup);
    } catch (_) {}
    try {
      if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
    } catch (_) {}
    try {
      if (fs.existsSync(`${DB_FILE}-wal`)) fs.unlinkSync(`${DB_FILE}-wal`);
    } catch (_) {}
    try {
      if (fs.existsSync(`${DB_FILE}-shm`)) fs.unlinkSync(`${DB_FILE}-shm`);
    } catch (_) {}
    db = openSqliteDatabase(DB_FILE);
    await initSchema();
  })();
  try {
    await recoveringPromise;
  } finally {
    recoveringPromise = null;
  }
}

function runInternal(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getInternal(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function run(sql, params = []) {
  return runInternal(sql, params).catch(async (error) => {
    if (!isSqliteCorruptError(error)) throw error;
    await recoverCorruptDatabase();
    return runInternal(sql, params);
  });
}

function get(sql, params = []) {
  return getInternal(sql, params).catch(async (error) => {
    if (!isSqliteCorruptError(error)) throw error;
    await recoverCorruptDatabase();
    return getInternal(sql, params);
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
  // Drop legacy shared cache key; new logic stores per-user cache keys.
  await run(`DELETE FROM kv WHERE key = ?`, ["desktop-shell-cache"]);
}

initSchema().catch(() => {});

function normalizeCacheUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  return normalized || "anonymous";
}

async function getDesktopShellCache(username) {
  const key = `desktop-shell-cache:${normalizeCacheUsername(username)}`;
  const row = await get(`SELECT value_json FROM kv WHERE key = ?`, [key]);
  if (!row || !row.value_json) return {};
  try {
    const parsed = JSON.parse(row.value_json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function setDesktopShellCache(cache, username) {
  const value = cache && typeof cache === "object" ? cache : {};
  const key = `desktop-shell-cache:${normalizeCacheUsername(username)}`;
  await run(
    `INSERT INTO kv(key, value_json, updated_at) VALUES (?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
    [key, JSON.stringify(value)]
  );
}

module.exports = {
  getDesktopShellCache,
  setDesktopShellCache
};
