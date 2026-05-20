const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "private", ".env") });
dotenv.config();

const PORT = Number(process.env.CHATBOT_LOCAL_SERVER_PORT || 13001);
const { scheduleFacebookOauthSync } = require("../lib/facebookOauthSync");
const LISTEN_HOST = String(process.env.CHATBOT_LOCAL_SERVER_HOST || "0.0.0.0").trim() || "0.0.0.0";

function createApp() {
  const app = express();
  const chatbotRouter = require("./server/server");

  app.use(
    cors({
      origin: "*",
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"]
    })
  );
  app.use(
    compression({
      filter: (req, res) => {
        if (req.path === "/api/chatbot/server-logs/stream") return false;
        return compression.filter(req, res);
      }
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "chatbot-local-server", port: PORT });
  });

  app.use("/api/chatbot", chatbotRouter);
  app.use("/webhooks/chatbot", chatbotRouter);
  app.use("/chatbot", chatbotRouter);

  app.get("*", (_req, res) => {
    res.status(404).json({ error: "Route not found on chatbot-local-server." });
  });

  return app;
}

const app = createApp();
app.listen(PORT, LISTEN_HOST, () => {
  console.log(`[chatbot-local-server] http://${LISTEN_HOST}:${PORT}`);
  console.log("[chatbot-local-server] /api/chatbot, /webhooks/chatbot (internal forward from processor)");
  scheduleFacebookOauthSync("engine-start");
});
