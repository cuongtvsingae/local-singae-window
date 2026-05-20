const sqlite3 = require("sqlite3").verbose();

/**
 * Open SQLite with CREATE if missing, log open/runtime errors (avoids unhandled 'error' on Database).
 */
function openSqliteDatabase(filePath) {
  const db = new sqlite3.Database(
    filePath,
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    (err) => {
      if (err) {
        console.error(`[sqlite] OPEN failed: ${filePath}`);
        console.error(err);
      }
    }
  );
  db.on("error", (err) => {
    console.error(`[sqlite] ${filePath}:`, err && err.message ? err.message : err);
  });
  return db;
}

module.exports = { openSqliteDatabase };
