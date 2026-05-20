const path = require("path");
const fs = require("fs");
const { openSqliteDatabase } = require("../../shared/server-base/openSqlite");

const { CHATBOT_DB_DIR, chatbotDbFile } = require("./dbPaths");

const DB_FILE = path.join(CHATBOT_DB_DIR, "chatbot.sqlite");

try {
  fs.mkdirSync(CHATBOT_DB_DIR, { recursive: true });
} catch (_) {}

let db = openSqliteDatabase(DB_FILE);

function isSqliteCorruptError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "").toUpperCase() === "SQLITE_CORRUPT" || msg.includes("database disk image is malformed");
}

function isSqliteBusyError(error) {
  const code = String(error?.code || "").toUpperCase();
  return code === "SQLITE_BUSY" || error?.errno === 5;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSqliteBusyRetry(fn, maxAttempts = 10) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isSqliteBusyError(error)) throw error;
      lastError = error;
      await sleep(Math.min(50 * 2 ** attempt, 2000));
    }
  }
  throw lastError;
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

/** Tao bang kv — chi dung sau khi mo file DB (runCore, khong trigger recover vong). */
function runCore(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getCore(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function allCore(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function applyKvSchema() {
  await runCore(`PRAGMA journal_mode=WAL;`);
  await runCore(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await runCore(`
    CREATE TABLE IF NOT EXISTS clinic_simly_appointment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL,
      office_key TEXT NOT NULL,
      appt_date TEXT NOT NULL,
      start_at TEXT,
      end_at TEXT,
      status TEXT,
      patient_name TEXT,
      service_name TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      sync_batch_id TEXT NOT NULL
    );
  `);
  await runCore(
    `CREATE INDEX IF NOT EXISTS idx_clinic_appt_office_date ON clinic_simly_appointment(office_key, appt_date);`
  );
  await runCore(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_appt_uid ON clinic_simly_appointment(office_key, appt_date, external_id);`
  );
  await runCore(`
    CREATE TABLE IF NOT EXISTS singae_clinic_facility (
      office_key TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      city_label TEXT NOT NULL,
      address TEXT NOT NULL,
      license_text TEXT NOT NULL,
      map_url TEXT NOT NULL,
      hours_label TEXT NOT NULL,
      hotline TEXT NOT NULL,
      messaging_contact TEXT NOT NULL
    );
  `);
  await runCore(`
    CREATE TABLE IF NOT EXISTS booking_request (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      participant_id TEXT,
      participant_label TEXT,
      care_status_at_create TEXT NOT NULL,
      status TEXT NOT NULL,
      office_key TEXT NOT NULL,
      visit_date TEXT,
      visit_time TEXT,
      shuttle_pickup TEXT,
      notes_snapshot TEXT,
      patient_snapshot_json TEXT NOT NULL,
      appointment_payload_json TEXT NOT NULL,
      source TEXT NOT NULL,
      summary_message_id TEXT,
      confirmation_message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      confirmed_at TEXT,
      zalo_notified_at TEXT,
      error_message TEXT
    );
  `);
  await runCore(
    `CREATE INDEX IF NOT EXISTS idx_booking_request_conversation ON booking_request(conversation_id, created_at DESC);`
  );
  await runCore(`CREATE INDEX IF NOT EXISTS idx_booking_request_status ON booking_request(status, created_at DESC);`);
  await runCore(`
    CREATE TABLE IF NOT EXISTS bug_board_task (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT,
      steps_to_reproduce TEXT,
      expected_result TEXT,
      actual_result TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      severity TEXT NOT NULL,
      reporter TEXT,
      assignee TEXT,
      environment TEXT,
      channel TEXT,
      conversation_id TEXT,
      labels_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await runCore(`
    CREATE TABLE IF NOT EXISTS bug_board_update (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT,
      attachments_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      author TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await runCore(`CREATE INDEX IF NOT EXISTS idx_bug_board_task_status ON bug_board_task(status, updated_at DESC);`);
  await runCore(`CREATE INDEX IF NOT EXISTS idx_bug_board_task_updated_at ON bug_board_task(updated_at DESC);`);
  await runCore(`CREATE INDEX IF NOT EXISTS idx_bug_board_update_task ON bug_board_update(task_id, created_at DESC);`);
}

async function recoverCorruptDatabase() {
  if (recoveringPromise) return recoveringPromise;
  recoveringPromise = (async () => {
    console.warn("[chatbot/sqliteStore] SQLITE_CORRUPT — backup, xoa file DB va tao lai (chatbot.sqlite)");
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
    await applyKvSchema();
  })();
  try {
    await recoveringPromise;
  } finally {
    recoveringPromise = null;
  }
}

function run(sql, params = []) {
  return withSqliteBusyRetry(() =>
    runCore(sql, params).catch(async (error) => {
      if (!isSqliteCorruptError(error)) throw error;
      await recoverCorruptDatabase();
      return runCore(sql, params);
    })
  );
}

function get(sql, params = []) {
  return withSqliteBusyRetry(() =>
    getCore(sql, params).catch(async (error) => {
      if (!isSqliteCorruptError(error)) throw error;
      await recoverCorruptDatabase();
      return getCore(sql, params);
    })
  );
}

function all(sql, params = []) {
  return withSqliteBusyRetry(() =>
    allCore(sql, params).catch(async (error) => {
      if (!isSqliteCorruptError(error)) throw error;
      await recoverCorruptDatabase();
      return allCore(sql, params);
    })
  );
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
  await run(`
    CREATE TABLE IF NOT EXISTS clinic_simly_appointment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL,
      office_key TEXT NOT NULL,
      appt_date TEXT NOT NULL,
      start_at TEXT,
      end_at TEXT,
      status TEXT,
      patient_name TEXT,
      service_name TEXT,
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      sync_batch_id TEXT NOT NULL
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_clinic_appt_office_date ON clinic_simly_appointment(office_key, appt_date);`
  );
  await run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_appt_uid ON clinic_simly_appointment(office_key, appt_date, external_id);`
  );
  await run(`
    CREATE TABLE IF NOT EXISTS singae_clinic_facility (
      office_key TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      city_label TEXT NOT NULL,
      address TEXT NOT NULL,
      license_text TEXT NOT NULL,
      map_url TEXT NOT NULL,
      hours_label TEXT NOT NULL,
      hotline TEXT NOT NULL,
      messaging_contact TEXT NOT NULL
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS booking_request (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      participant_id TEXT,
      participant_label TEXT,
      care_status_at_create TEXT NOT NULL,
      status TEXT NOT NULL,
      office_key TEXT NOT NULL,
      visit_date TEXT,
      visit_time TEXT,
      shuttle_pickup TEXT,
      notes_snapshot TEXT,
      patient_snapshot_json TEXT NOT NULL,
      appointment_payload_json TEXT NOT NULL,
      source TEXT NOT NULL,
      summary_message_id TEXT,
      confirmation_message_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      confirmed_at TEXT,
      zalo_notified_at TEXT,
      error_message TEXT
    );
  `);
  await run(
    `CREATE INDEX IF NOT EXISTS idx_booking_request_conversation ON booking_request(conversation_id, created_at DESC);`
  );
  await run(`CREATE INDEX IF NOT EXISTS idx_booking_request_status ON booking_request(status, created_at DESC);`);
  await run(`
    CREATE TABLE IF NOT EXISTS bug_board_task (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT,
      steps_to_reproduce TEXT,
      expected_result TEXT,
      actual_result TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      severity TEXT NOT NULL,
      reporter TEXT,
      assignee TEXT,
      environment TEXT,
      channel TEXT,
      conversation_id TEXT,
      labels_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS bug_board_update (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT,
      attachments_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      author TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_bug_board_task_status ON bug_board_task(status, updated_at DESC);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_bug_board_task_updated_at ON bug_board_task(updated_at DESC);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_bug_board_update_task ON bug_board_update(task_id, created_at DESC);`);
}

let initPromise = null;

async function ensureInit() {
  if (!initPromise) {
    initPromise = initSchema().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
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

/** Ghi key nếu chưa tồn tại. Trả về true nếu ghi mới (idempotency / dedupe). */
async function kvSetRawIfAbsent(key, raw) {
  await ensureInit();
  const k = String(key);
  const existing = await get(`SELECT key FROM kv WHERE key = ?`, [k]);
  if (existing) return false;
  const value = String(raw ?? "");
  await run(`INSERT INTO kv(key, value_json, updated_at) VALUES (?,?,datetime('now'))`, [k, value]);
  return true;
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

async function kvDelete(key) {
  await ensureInit();
  await run(`DELETE FROM kv WHERE key = ?`, [String(key)]);
}

async function importLegacyJsonIfMissing(key, legacyFile) {
  await ensureInit();
  if (await kvHas(key)) return { imported: false };
  const filePath = String(legacyFile || "").trim();
  if (!filePath || !fs.existsSync(filePath)) return { imported: false };
  const raw = fs.readFileSync(filePath, "utf8");
  await kvSetRaw(key, raw);
  try {
    fs.unlinkSync(filePath);
  } catch (_) {}
  return { imported: true };
}

async function importAllLegacyOnce() {
  await ensureInit();
  const legacyMap = [
    ["chat-history", chatbotDbFile("chat-history.json")],
    ["knowledge-base", chatbotDbFile("knowledge-base.json")],
    ["usage-log", chatbotDbFile("usage-log.json")],
    ["prompts", chatbotDbFile("prompts.json")],
    ["version", chatbotDbFile("version.json")],
    ["singae-lookup-store", chatbotDbFile("singae-lookup-store.json")]
  ];
  for (const [key, file] of legacyMap) {
    // eslint-disable-next-line no-await-in-loop
    await importLegacyJsonIfMissing(key, file);
  }
}

// Fire-and-forget import so first request still triggers import if needed.
importAllLegacyOnce().catch(() => {});

module.exports = {
  DB_FILE,
  ensureInit,
  kvGetJson,
  kvSetJson,
  kvGetRaw,
  kvSetRaw,
  kvSetRawIfAbsent,
  kvDelete,
  importAllLegacyOnce,
  sqlRun: run,
  sqlGet: get,
  sqlAll: all
};
