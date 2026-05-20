const axios = require("axios");

const BRIDGE_SEND_URL = String(
  process.env.BRIDGE_SEND_URL ||
    process.env.VPS_FB_SEND_URL ||
    "https://singae.cloud/api/chatbot-bridge/facebook/send"
).trim();

const BRIDGE_SECRET = String(process.env.BRIDGE_SHARED_SECRET || "").trim();

function bridgeEnabled() {
  return String(process.env.USE_VPS_FB_BRIDGE || "1").trim() !== "0";
}

async function sendViaBridge(body) {
  const headers = { "Content-Type": "application/json" };
  if (BRIDGE_SECRET) headers["X-Bridge-Secret"] = BRIDGE_SECRET;
  const r = await axios.post(BRIDGE_SEND_URL, body, {
    headers,
    timeout: 45000,
    validateStatus: () => true
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(r.data?.error || `Bridge send failed: HTTP ${r.status}`);
  }
  return r.data;
}

module.exports = {
  bridgeEnabled,
  sendViaBridge,
  BRIDGE_SEND_URL
};
