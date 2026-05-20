const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { getUserBySessionToken } = require("../../windowsshell/server/authStore");

const router = express.Router();
const AUTH_COOKIE_NAME = "ws_session";
const ROOT_DIR = path.join(__dirname, "..", "..", "..");
const TOOLS_DIR = path.join(ROOT_DIR, "tools");
const MAX_PREVIEW_BYTES = 128 * 1024;
const SQLITE_EXTENSIONS = new Set([".sqlite", ".sqlite3", ".db"]);

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function normalizeRelative(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function toAbsoluteFromRoot(relativePath) {
  const safeRelative = normalizeRelative(relativePath).replace(/^\/+/, "");
  const target = path.resolve(ROOT_DIR, safeRelative);
  if (!target.startsWith(ROOT_DIR)) {
    throw new Error("Invalid path");
  }
  return target;
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return String(cookies[AUTH_COOKIE_NAME] || "").trim();
}

async function authMiddleware(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const user = await getUserBySessionToken(token);
    if (!user) return res.status(401).json({ error: "Session expired" });
    if (!["admin", "manager"].includes(String(user.role || ""))) {
      return res.status(403).json({ error: "Permission denied" });
    }
    req.authUser = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Auth check failed" });
  }
}

async function walkDatabaseFiles(startDir) {
  const out = [];
  async function visit(dirPath) {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = normalizeRelative(path.relative(ROOT_DIR, abs));
      out.push(rel);
    }
  }
  await visit(startDir);
  return out;
}

async function listAllDatabaseFiles() {
  const toolNames = await fs.promises.readdir(TOOLS_DIR, { withFileTypes: true });
  const dbRoots = toolNames
    .filter((item) => item.isDirectory())
    .map((item) => path.join(TOOLS_DIR, item.name, "database"));
  const results = [];
  for (const dbRoot of dbRoots) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await fs.promises
      .access(dbRoot, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);
    if (!exists) continue;
    // eslint-disable-next-line no-await-in-loop
    const files = await walkDatabaseFiles(dbRoot);
    results.push(...files);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function detectBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let nonPrintable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13) continue;
    if (b >= 32 && b <= 126) continue;
    nonPrintable += 1;
  }
  return sample.length > 0 && nonPrintable / sample.length > 0.2;
}

function openSqliteReadOnly(filePath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      return resolve(db);
    });
  });
}

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows || []);
    });
  });
}

function sqliteGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row || null);
    });
  });
}

function closeSqlite(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

router.use(authMiddleware);

router.get("/files", async (req, res) => {
  try {
    const files = await listAllDatabaseFiles();
    return res.json({ files });
  } catch (error) {
    return res.status(500).json({ error: "Cannot list database files" });
  }
});

router.get("/file/meta", async (req, res) => {
  try {
    const file = String(req.query.file || "");
    if (!file) return res.status(400).json({ error: "file is required" });
    const absPath = toAbsoluteFromRoot(file);
    const stats = await fs.promises.stat(absPath);
    if (!stats.isFile()) return res.status(400).json({ error: "Not a file" });
    return res.json({
      file: normalizeRelative(path.relative(ROOT_DIR, absPath)),
      size: stats.size,
      ext: path.extname(absPath).toLowerCase(),
      modifiedAt: stats.mtime.toISOString()
    });
  } catch (error) {
    return res.status(400).json({ error: "Cannot read file metadata" });
  }
});

router.get("/file/preview", async (req, res) => {
  try {
    const file = String(req.query.file || "");
    if (!file) return res.status(400).json({ error: "file is required" });
    const absPath = toAbsoluteFromRoot(file);
    const buffer = await fs.promises.readFile(absPath);
    const binary = detectBinary(buffer);
    const previewBuffer = buffer.subarray(0, MAX_PREVIEW_BYTES);
    const preview = binary ? previewBuffer.toString("hex") : previewBuffer.toString("utf8");
    return res.json({
      file: normalizeRelative(path.relative(ROOT_DIR, absPath)),
      type: binary ? "binary" : "text",
      truncated: buffer.length > MAX_PREVIEW_BYTES,
      preview
    });
  } catch (error) {
    return res.status(400).json({ error: "Cannot preview file" });
  }
});

router.get("/sqlite/tables", async (req, res) => {
  const file = String(req.query.file || "");
  if (!file) return res.status(400).json({ error: "file is required" });
  let db;
  try {
    const absPath = toAbsoluteFromRoot(file);
    const ext = path.extname(absPath).toLowerCase();
    if (!SQLITE_EXTENSIONS.has(ext)) return res.status(400).json({ error: "Not a sqlite file" });
    db = await openSqliteReadOnly(absPath);
    const tables = await sqliteAll(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    );
    const tableInfos = [];
    for (const row of tables) {
      // eslint-disable-next-line no-await-in-loop
      const countRow = await sqliteGet(db, `SELECT COUNT(*) AS count FROM "${String(row.name).replace(/"/g, "\"\"")}"`);
      tableInfos.push({ name: row.name, count: Number(countRow?.count || 0) });
    }
    return res.json({ tables: tableInfos });
  } catch (error) {
    return res.status(400).json({ error: "Cannot inspect sqlite file" });
  } finally {
    if (db) await closeSqlite(db);
  }
});

router.get("/sqlite/table", async (req, res) => {
  const file = String(req.query.file || "");
  const table = String(req.query.table || "");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  if (!file || !table) return res.status(400).json({ error: "file and table are required" });
  let db;
  try {
    const absPath = toAbsoluteFromRoot(file);
    const ext = path.extname(absPath).toLowerCase();
    if (!SQLITE_EXTENSIONS.has(ext)) return res.status(400).json({ error: "Not a sqlite file" });
    db = await openSqliteReadOnly(absPath);
    const safeTable = String(table).replace(/"/g, "\"\"");
    const rows = await sqliteAll(db, `SELECT * FROM "${safeTable}" LIMIT ? OFFSET ?`, [limit, offset]);
    return res.json({ rows });
  } catch (error) {
    return res.status(400).json({ error: "Cannot read sqlite table" });
  } finally {
    if (db) await closeSqlite(db);
  }
});

module.exports = router;
