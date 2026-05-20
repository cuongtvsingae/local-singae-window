const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "private", ".env") });
dotenv.config();

const PORT = Number(process.env.CHATBOT_LOCAL_PROCESS_PORT || 13000);
const FORWARD_URL =
  process.env.CHATBOT_LOCAL_FORWARD_URL || "http://127.0.0.1:13001/webhooks/chatbot/facebook";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "chatbot-local-processor", forwardUrl: FORWARD_URL });
});

app.post("/process", async (req, res) => {
  const event = req.body?.event || req.body;
  const payload = event?.payload || event;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "Missing webhook payload in event" });
  }
  try {
    const r = await fetch(FORWARD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chatbot-Wait": "1"
      },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: "Forward to chatbot engine failed", status: r.status, data });
    }
    return res.json({ ok: true, forwarded: true, status: r.status, data });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[chatbot-local-processor] http://127.0.0.1:${PORT}/process → ${FORWARD_URL}`);
});
