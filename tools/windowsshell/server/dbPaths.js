const fs = require("fs");
const path = require("path");

const DATABASE_ROOT = path.resolve(__dirname, "..", "database");
const DB_FILE = path.join(DATABASE_ROOT, "windowsshell.sqlite");

try {
  fs.mkdirSync(DATABASE_ROOT, { recursive: true });
} catch (e) {
  console.error("[windowsshell/dbPaths] mkdir failed:", DATABASE_ROOT, e && e.message ? e.message : e);
}

module.exports = {
  DATABASE_ROOT,
  DB_FILE
};
