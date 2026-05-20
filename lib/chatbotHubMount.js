const axios = require("axios");
const { URL } = require("url");

/** Hub mount prefix -> path on chatbot-local-server (engine). Longest prefix first. */
const PROXY_MOUNTS = [
  { prefix: "/api/singae-lookup/verify-account", target: "/api/chatbot/verify-account" },
  { prefix: "/api/singae-lookup", target: "/api/chatbot/singae-lookup" },
  { prefix: "/api/openai-chatbot", target: "/api/chatbot/openai" },
  { prefix: "/api/localai-chatbot", target: "/api/chatbot/localai" },
  { prefix: "/api/runtime-config", target: "/api/chatbot/runtime-config" },
  { prefix: "/api/openai-models", target: "/api/chatbot/openai-models" },
  { prefix: "/api/knowledge-base", target: "/api/chatbot/knowledge-base" },
  { prefix: "/api/usage-logs", target: "/api/chatbot/usage-logs" },
  { prefix: "/api/server-logs", target: "/api/chatbot/server-logs" },
  { prefix: "/api/database", target: "/api/chatbot/database" },
  { prefix: "/api/prompts", target: "/api/chatbot/prompts" },
  { prefix: "/api/prompt", target: "/api/chatbot/prompt" },
  { prefix: "/api/chatbot", target: "/api/chatbot" },
  { prefix: "/chatbot", target: "/chatbot" }
];

function resolveEnginePath(originalUrl) {
  const [pathOnly, query = ""] = String(originalUrl || "").split("?");
  const q = query ? `?${query}` : "";
  for (const { prefix, target } of PROXY_MOUNTS) {
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) {
      const rest = pathOnly.slice(prefix.length);
      return `${target}${rest}${q}`;
    }
  }
  return null;
}

function proxyToChatbotEngine(engineBase) {
  const base = String(engineBase || "http://127.0.0.1:13001").replace(/\/$/, "");

  return async (req, res) => {
    const enginePath = resolveEnginePath(req.originalUrl);
    if (!enginePath) {
      return res.status(404).json({ error: "Chatbot route not found on hub proxy" });
    }

    let targetUrl;
    try {
      targetUrl = new URL(enginePath, `${base}/`).href;
    } catch (e) {
      return res.status(500).json({ error: "Invalid chatbot engine URL", message: e.message });
    }

    const method = String(req.method || "GET").toUpperCase();
    const headers = { ...(req.headers || {}) };
    delete headers.host;
    delete headers.connection;
    delete headers["content-length"];

    const wantsStream =
      String(req.path || "").includes("/stream") ||
      String(req.headers.accept || "").includes("text/event-stream");

    try {
      const r = await axios.request({
        url: targetUrl,
        method,
        headers,
        data: method === "GET" || method === "HEAD" ? undefined : req.body,
        responseType: wantsStream ? "stream" : undefined,
        timeout: wantsStream ? 0 : 120000,
        validateStatus: () => true
      });

      res.status(r.status);
      Object.entries(r.headers || {}).forEach(([k, v]) => {
        const key = String(k || "").toLowerCase();
        if (key === "transfer-encoding" || key === "content-encoding") return;
        try {
          res.setHeader(k, v);
        } catch (_) {}
      });

      if (wantsStream && r.data && typeof r.data.pipe === "function") {
        return r.data.pipe(res);
      }
      return res.send(r.data);
    } catch (err) {
      return res.status(502).json({
        error: "Chatbot engine proxy failed",
        message: err?.message || String(err)
      });
    }
  };
}

function mountChatbotProxy(app, engineBase) {
  for (const { prefix } of PROXY_MOUNTS) {
    app.use(prefix, proxyToChatbotEngine(engineBase));
  }
  console.log(`✅ Chatbot API proxied to ${engineBase} (single SQLite writer — Docker/PM2)`);
}

function mountChatbotRouter(app) {
  const chatbotRouter = require("../chatbot/server/server");
  app.use("/api/chatbot", chatbotRouter);
  app.use("/api/openai-chatbot", (req, res, next) => {
    req.url = `/openai${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/localai-chatbot", (req, res, next) => {
    req.url = `/localai${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/runtime-config", (req, res, next) => {
    req.url = `/runtime-config${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/openai-models", (req, res, next) => {
    req.url = `/openai-models${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/prompts", (req, res, next) => {
    req.url = `/prompts${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/prompt", (req, res, next) => {
    req.url = `/prompt${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/knowledge-base", (req, res, next) => {
    req.url = `/knowledge-base${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/usage-logs", (req, res, next) => {
    req.url = `/usage-logs${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/server-logs", (req, res, next) => {
    req.url = `/server-logs${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/database", (req, res, next) => {
    req.url = `/database${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/singae-lookup/verify-account", (req, res, next) => {
    req.url = `/verify-account${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/api/singae-lookup", (req, res, next) => {
    req.url = `/singae-lookup${req.url}`;
    chatbotRouter(req, res, next);
  });
  app.use("/chatbot", chatbotRouter);
  console.log("✅ Chatbot API at /api/chatbot (Facebook webhook on VPS; use chatbot-local:worker)");
}

function mountChatbotOnHub(app) {
  const useProxy = ["1", "true", "yes"].includes(
    String(process.env.HUB_CHATBOT_PROXY || "").trim().toLowerCase()
  );
  if (useProxy) {
    const engineBase = process.env.CHATBOT_ENGINE_URL || "http://127.0.0.1:13001";
    mountChatbotProxy(app, engineBase);
    return true;
  }
  mountChatbotRouter(app);
  return true;
}

module.exports = {
  mountChatbotOnHub,
  mountChatbotProxy,
  mountChatbotRouter,
  resolveEnginePath
};
