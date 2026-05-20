const fs = require("fs");
const path = require("path");
const { CHATBOT_DB_DIR } = require("./dbPaths");

const LOG_DIR = path.join(CHATBOT_DB_DIR, "logs");
const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_LOG_FILES = 10; // Keep last 10 files

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogFilePath() {
  ensureLogDir();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(LOG_DIR, `app-${today}.jsonl`);
}

function rotateLogIfNeeded(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const stats = fs.statSync(filePath);
  if (stats.size < MAX_LOG_FILE_SIZE) {
    return filePath;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotatedPath = filePath.replace(".jsonl", `-${timestamp}.jsonl`);
  fs.renameSync(filePath, rotatedPath);

  cleanupOldLogs();

  return filePath;
}

function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith("app-") && f.endsWith(".jsonl"))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    if (files.length > MAX_LOG_FILES) {
      files.slice(MAX_LOG_FILES).forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
        }
      });
    }
  } catch (error) {
  }
}

function writeLogEntry(entry) {
  try {
    const filePath = getLogFilePath();
    const rotatedPath = rotateLogIfNeeded(filePath);
    
    const logLine = JSON.stringify(entry) + "\n";
    fs.appendFileSync(rotatedPath, logLine, "utf8");
  } catch (error) {
    console.error("Failed to write log entry:", error);
  }
}

function createLogEntry({
  type, // 'api_call', 'chat', 'error', 'performance', 'cost', 'config', etc.
  level = "info", // 'info', 'warn', 'error', 'debug'
  source = "server",
  message = "",
  metadata = {},
  cost = null,
  timing = null,
  request = null,
  response = null,
  error = null
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    level,
    source,
    message: String(message || ""),
    ...metadata,
    ...(cost !== null && { cost }),
    ...(timing !== null && { timing }),
    ...(request && { request }),
    ...(response && { response }),
    ...(error && { 
      error: {
        message: error.message || String(error),
        stack: error.stack || null,
        code: error.code || null
      }
    })
  };

  writeLogEntry(entry);
  return entry;
}

function logApiCall({ endpoint, method, status, duration, request, response, cost, tokens }) {
  createLogEntry({
    type: "api_call",
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    source: "http",
    message: `${method} ${endpoint} -> ${status}`,
    metadata: {
      endpoint,
      method,
      status,
      duration,
      tokens,
      cost
    },
    timing: { duration },
    request: request ? (typeof request === "string" ? request : JSON.stringify(request)) : null,
    response: response ? (typeof response === "string" ? response : JSON.stringify(response)) : null
  });
}

function logOpenAICall({ type, model, endpoint, duration, tokens, cost, request, response, error }) {
  createLogEntry({
    type: "openai_api",
    level: error ? "error" : "info",
    source: "openai",
    message: `OpenAI ${type}: ${model}${error ? ` - Error: ${error.message}` : ""}`,
    metadata: {
      apiType: type, // 'chat', 'embedding'
      model,
      endpoint,
      tokens: tokens || {},
      cost
    },
    timing: { duration },
    request,
    response,
    error
  });
}

function logChatInteraction({ channel, participantId, question, answer, chatCase, historyLength, tokens, cost, duration, metadata }) {
  createLogEntry({
    type: "chat",
    level: "info",
    source: "chat",
    message: `Chat ${channel}: ${question.substring(0, 50)}...`,
    metadata: {
      channel,
      participantId,
      chatCase,
      historyLength,
      tokens,
      cost,
      questionLength: question.length,
      answerLength: answer?.length || 0,
      ...metadata
    },
    timing: { duration },
    request: { question },
    response: { answer }
  });
}

function logCost({ type, model, tokens, costUsd, costVnd, metadata }) {
  createLogEntry({
    type: "cost",
    level: "info",
    source: "cost",
    message: `${type} cost: ${costUsd} USD (${costVnd} VND)`,
    metadata: {
      costType: type,
      model,
      tokens,
      costUsd,
      costVnd,
      ...metadata
    },
    cost: { usd: costUsd, vnd: costVnd }
  });
}

function logError({ source, message, error, metadata }) {
  createLogEntry({
    type: "error",
    level: "error",
    source,
    message: message || (error?.message || String(error)),
    metadata,
    error
  });
}

function logPerformance({ operation, duration, metadata }) {
  createLogEntry({
    type: "performance",
    level: duration > 5000 ? "warn" : "info", // Warn if > 5s
    source: "performance",
    message: `${operation} took ${duration}ms`,
    metadata: {
      operation,
      ...metadata
    },
    timing: { duration }
  });
}

function logConfigChange({ action, config, metadata }) {
  createLogEntry({
    type: "config",
    level: "info",
    source: "config",
    message: `Config ${action}`,
    metadata: {
      action,
      ...metadata
    },
    request: config
  });
}

function getLogFiles() {
  ensureLogDir();
  try {
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith("app-") && f.endsWith(".jsonl"))
      .map(f => ({
        name: f,
        path: path.join(LOG_DIR, f),
        size: fs.statSync(path.join(LOG_DIR, f)).size,
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch (error) {
    return [];
  }
}

function readLogFile(fileName, limit = 1000) {
  const filePath = path.join(LOG_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines
      .slice(-limit) // Get last N entries
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return entries;
  } catch (error) {
    return [];
  }
}

module.exports = {
  createLogEntry,
  logApiCall,
  logOpenAICall,
  logChatInteraction,
  logCost,
  logError,
  logPerformance,
  logConfigChange,
  getLogFiles,
  readLogFile,
  ensureLogDir
};





