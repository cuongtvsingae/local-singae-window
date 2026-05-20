const sqlite3 = require("sqlite3").verbose();

const DEFAULT_BUSY_TIMEOUT_MS = 30000;

/**
 * Open SQLite with CREATE if missing, log open/runtime errors (avoids unhandled 'error' on Database).
 * Sets busy_timeout + WAL for multi-process / Docker PM2 access to the same file.
 */
function openSqliteDatabase(filePath, options = {}) {
  const busyTimeoutMs = Number(options.busyTimeoutMs) || DEFAULT_BUSY_TIMEOUT_MS;
  const db = new sqlite3.Database(
    filePath,
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    (err) => {
      if (err) {
        console.error(`[sqlite] OPEN failed: ${filePath}`);
        console.error(err);
        return;
      }
      db.serialize(() => {
        db.run(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
        db.run("PRAGMA journal_mode = WAL");
      });
    }
  );
  db.on("error", (err) => {
    console.error(`[sqlite] ${filePath}:`, err && err.message ? err.message : err);
  });
  return db;
}

module.exports = { openSqliteDatabase };
