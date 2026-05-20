const fs = require("fs");
const path = require("path");

const DATABASE_ROOT = path.resolve(__dirname, "..", "..");
const CHATBOT_DB_DIR = path.resolve(__dirname, "..", "database");

try {
  fs.mkdirSync(CHATBOT_DB_DIR, { recursive: true });
} catch (e) {
  console.error("[chatbot/dbPaths] mkdir failed:", CHATBOT_DB_DIR, e && e.message ? e.message : e);
}

function chatbotDbFile(name) {
  return path.join(CHATBOT_DB_DIR, name);
}

module.exports = {
  DATABASE_ROOT,
  CHATBOT_DB_DIR,
  chatbotDbFile
};
