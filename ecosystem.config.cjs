const path = require("path");

const ROOT = __dirname;

// Scripts load private/.env via dotenv — avoid env_file (unstable on Windows PM2).
/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: "singae-local-hub",
    script: "server.js",
    cwd: ROOT,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000
  },
  {
    name: "singae-chatbot-engine",
    script: "chatbot/chatbot-server.js",
    cwd: ROOT,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000
  },
  {
    name: "singae-chatbot-processor",
    script: "chatbot/local-processor.js",
    cwd: ROOT,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    kill_timeout: 5000
  },
  {
    name: "singae-chatbot-worker",
    script: "chatbot/worker.js",
    cwd: ROOT,
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    kill_timeout: 5000
  }
];

module.exports = { apps };
