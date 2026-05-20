const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.resolve(__dirname, '..', '..', 'database', 'it_support.sqlite');

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDirExists(DB_FILE);

const db = new sqlite3.Database(DB_FILE);

// UI v2 (HTML) does not depend on any external boot (Sheets/Embeddings).
async function ensureBootReady() {
  return true;
}

function tableInfo(table) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureTaskColumns() {
  const cols = new Set((await tableInfo('tasks')).map((r) => r.name));
  const add = async (name, ddl) => {
    if (cols.has(name)) return;
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE tasks ADD COLUMN ${ddl}`, (err) => (err ? reject(err) : resolve()));
    });
  };
  await add('created_by', "created_by TEXT NOT NULL DEFAULT 'user'");
  await add('created_by_user_id', 'created_by_user_id TEXT');
  await add('created_by_username', "created_by_username TEXT NOT NULL DEFAULT ''");

  // AI fields (optional): store last triage/suggestion for each task.
  await add('ai_summary', "ai_summary TEXT NOT NULL DEFAULT ''");
  await add('ai_category', "ai_category TEXT NOT NULL DEFAULT ''");
  await add('ai_priority', "ai_priority TEXT NOT NULL DEFAULT ''");
  await add('ai_steps_json', "ai_steps_json TEXT NOT NULL DEFAULT '[]'");
  await add('ai_needed_info_json', "ai_needed_info_json TEXT NOT NULL DEFAULT '[]'");
  await add('ai_last_model', "ai_last_model TEXT NOT NULL DEFAULT ''");
  await add('ai_last_run_at', 'ai_last_run_at DATETIME');
  await add('ai_last_run_by', "ai_last_run_by TEXT NOT NULL DEFAULT ''");
}

db.serialize(() => {
  // Minimal tasks table for UI v2
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Internal IT Support chat history (for internal use only)
  db.run(`
    CREATE TABLE IF NOT EXISTS it_chat_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT,
      created_by_username TEXT NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS it_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- user|assistant|system
      text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES it_chat_conversations(id) ON DELETE CASCADE
    )
  `);
});

(async () => {
  try {
    await ensureTaskColumns();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[it-support] DB migration error:', e?.message || e);
  }
})();

module.exports = { db, ensureBootReady };

