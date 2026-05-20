const util = require("util");
const { logApiCall } = require("./fileLogger");

/** @returns {"normal"|"minimal"|"off"} — đọc mỗi lần để dotenv (server.js) load trước khi gọi được. Mặc định minimal để server yếu không cần sửa env. */
function getChatbotLogMode() {
  const raw = String(process.env.CHATBOT_LOG_MODE || process.env.CHATBOT_LOGGING || "minimal")
    .trim()
    .toLowerCase();
  if (raw === "off" || raw === "none" || raw === "0" || raw === "false") return "off";
  if (raw === "normal" || raw === "full" || raw === "verbose" || raw === "debug") return "normal";
  return "minimal";
}

const MAX_LOG_ENTRIES = 500;
const logBuffer = [];
const streamClients = new Set();
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

let consoleCaptureInstalled = false;

function createLogId() {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function redactBodyForLogs(value) {
  if (value == null) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(redactBodyForLogs);
  if (typeof value !== "object") return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const keyLower = String(k || "").toLowerCase();
    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("apikey") ||
      keyLower.includes("api_key") ||
      keyLower.includes("secret")
    ) {
      out[k] = "***";
    } else {
      out[k] = redactBodyForLogs(v);
    }
  }
  return out;
}

function formatLogArg(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return util.inspect(value, {
    depth: 4,
    breakLength: 120,
    maxArrayLength: 40,
    compact: false
  });
}

/** Payload nhỏ gửi SSE khi minimal — chỉ đủ cho UI bắt conversation_* và channel_* */
function slimEntryForSse(entry) {
  const out = {
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level,
    source: entry.source,
    message: String(entry.message || "").slice(0, 200),
    endpoint: entry.endpoint || null,
    response: entry.response ? { ...entry.response } : null,
    metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : null
  };
  if (!out.metadata) delete out.metadata;
  // channel_connection_status: không cần full snapshot object sâu
  if (
    out.response &&
    typeof out.response === "object" &&
    out.response.type === "channel_connection_status" &&
    out.response.channels &&
    typeof out.response.channels === "object"
  ) {
    const fb = out.response.channels.facebookMessenger || {};
    out.response = {
      type: "channel_connection_status",
      conversationId: out.response.conversationId,
      reason: out.response.reason,
      channels: {
        facebookMessenger: {
          configured: Boolean(fb.configured),
          connected: Boolean(fb.connected),
          state: fb.state || null,
          lastEventAt: fb.lastEventAt || null
        }
      }
    };
  }
  return out;
}

function broadcastToSseClients(payloadObject) {
  const payload = `event: log\ndata: ${JSON.stringify(payloadObject)}\n\n`;
  streamClients.forEach((client) => {
    if (!client.writableEnded) {
      try {
        client.write(payload);
      } catch (_) {
        /* socket đầy / client disconnect */
      }
    }
  });
}

function appendServerLog({
  level = "info",
  source = "server",
  message = "",
  cost = null,
  costInfo = null,
  request = null,
  response = null,
  usage = null,
  endpoint = null,
  method = null,
  status = null,
  model = null,
  metadata = null
}) {
  const mode = getChatbotLogMode();
  if (mode === "off") {
    return null;
  }

  const entry = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    level,
    source,
    message: String(message || ""),
    cost: typeof cost === "number" ? cost : null,
    costInfo: costInfo || null,
    request: request || null,
    response: response || null,
    usage: usage || null,
    endpoint: endpoint || null,
    method: method || null,
    status: status || null,
    model: model || null,
    ...(metadata != null ? { metadata } : {})
  };

  if (mode === "minimal") {
    if (source !== "chat-history-event") {
      return null;
    }
    const slim = slimEntryForSse(entry);
    broadcastToSseClients(slim);
    return slim;
  }

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
  }

  broadcastToSseClients(entry);

  return entry;
}

function installConsoleCapture() {
  if (consoleCaptureInstalled) {
    return;
  }

  const mode = getChatbotLogMode();
  if (mode !== "normal") {
    return;
  }

  [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"]
  ].forEach(([methodName, level]) => {
    console[methodName] = (...args) => {
      appendServerLog({
        level,
        source: "console",
        message: args.map(formatLogArg).join(" ")
      });
      originalConsole[methodName](...args);
    };
  });

  consoleCaptureInstalled = true;
}

function createRequestLoggerMiddleware() {
  return (req, res, next) => {
    if (
      !req.path.startsWith("/api") &&
      req.path !== "/ask" &&
      !req.path.startsWith("/webhooks")
    ) {
      return next();
    }
    if (
      req.path.startsWith("/server-logs") ||
      req.path.startsWith("/singae-assistant/events")
    ) {
      return next();
    }

    const startedAt = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startedAt;
      const mode = getChatbotLogMode();
      if (mode === "normal") {
        appendServerLog({
          level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
          source: "http",
          message: `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`
        });
      }

      if (mode === "normal") {
        try {
          logApiCall({
            endpoint: req.originalUrl,
            method: req.method,
            status: res.statusCode,
            duration,
            request: {
              path: req.path,
              query: req.query,
              body: req.body
                ? typeof req.body === "string"
                  ? req.body.substring(0, 500)
                  : JSON.stringify(redactBodyForLogs(req.body)).substring(0, 500)
                : null
            },
            response: {
              status: res.statusCode
            }
          });
        } catch (err) {
          /* swallow */
        }
      }
    });

    next();
  };
}

function getServerLogs() {
  if (getChatbotLogMode() !== "normal") {
    return { updatedAt: null, total: 0, logs: [] };
  }
  return {
    updatedAt: logBuffer.length ? logBuffer[logBuffer.length - 1].timestamp : null,
    total: logBuffer.length,
    logs: [...logBuffer]
  };
}

function clearServerLogs() {
  logBuffer.splice(0, logBuffer.length);
  return {
    updatedAt: null,
    total: 0,
    logs: []
  };
}

function openServerLogStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write("retry: 2000\n\n");

  streamClients.add(res);

  const heartbeatMs =
    getChatbotLogMode() === "normal" ? 15000 : Math.max(20000, Number(process.env.CHATBOT_SSE_HEARTBEAT_MS || 45000));

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keep-alive\n\n");
    }
  }, heartbeatMs);

  req.on("close", () => {
    clearInterval(heartbeat);
    streamClients.delete(res);
    res.end();
  });
}

module.exports = {
  appendServerLog,
  clearServerLogs,
  createRequestLoggerMiddleware,
  getServerLogs,
  getChatbotLogMode,
  installConsoleCapture,
  openServerLogStream
};
