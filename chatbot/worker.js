const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "private", ".env") });
dotenv.config();

const DEFAULT_MANAGER_BASE_URL =
  process.env.CHATBOT_MANAGER_BASE_URL || "https://singae.cloud/api/chatbot-manager";
const DEFAULT_LOCAL_PROCESS_URL =
  process.env.CHATBOT_LOCAL_PROCESS_URL || "http://127.0.0.1:13000/process";
const RETRY_DELAY_MS = Math.max(1000, Number(process.env.CHATBOT_LOCAL_RETRY_MS) || 3000);

function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) throw new Error("CHATBOT_MANAGER_BASE_URL is required.");
  return s;
}

function normalizeProcessUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) throw new Error("CHATBOT_LOCAL_PROCESS_URL is required.");
  return s;
}

const managerBase = normalizeBaseUrl(DEFAULT_MANAGER_BASE_URL);
const localProcessUrl = normalizeProcessUrl(DEFAULT_LOCAL_PROCESS_URL);
const { scheduleFacebookOauthSync } = require("../lib/facebookOauthSync");

let stopped = false;
const handlingEventIds = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `${response.status} ${response.statusText}`.trim());
  }
  return data;
}

async function handleEvent(eventPayload) {
  const id = String(eventPayload?.id || "").trim();
  if (!id) return;
  if (handlingEventIds.has(id)) return;
  handlingEventIds.add(id);
  try {
    await postJson(`${managerBase}/events/${encodeURIComponent(id)}/ack`, {});
    await postJson(localProcessUrl, { event: eventPayload });
    await postJson(`${managerBase}/events/${encodeURIComponent(id)}/resolved`, { answered: true });
    console.log(`[chatbot-local-worker] answered ${id}`);
  } catch (error) {
    const reason = String(error?.message || error || "processing failed");
    try {
      await postJson(`${managerBase}/events/${encodeURIComponent(id)}/requeue`, { reason });
    } catch (_) {}
    console.error(`[chatbot-local-worker] failed ${id}:`, reason);
  } finally {
    handlingEventIds.delete(id);
  }
}

async function pollPendingOnce() {
  const url = `${managerBase}/events/pending`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  const items = Array.isArray(data.items) ? data.items : [];
  for (const ev of items) {
    await handleEvent(ev);
  }
}

function connectSse() {
  const EventSource = require("eventsource");
  const streamUrl = `${managerBase}/events/stream`;
  console.log(`[chatbot-local-worker] SSE ${streamUrl}`);
  const es = new EventSource(streamUrl);

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data || "{}");
      if (data.type === "event" && data.event) {
        handleEvent(data.event).catch((e) => console.error(e.message));
      }
    } catch (_) {}
  };

  es.onerror = () => {
    console.warn("[chatbot-local-worker] SSE disconnected, retrying…");
    es.close();
    if (!stopped) setTimeout(connectSse, RETRY_DELAY_MS);
  };
}

async function main() {
  console.log(`[chatbot-local-worker] manager=${managerBase} processor=${localProcessUrl}`);
  scheduleFacebookOauthSync("worker-start");
  await pollPendingOnce().catch(() => {});
  connectSse();
  while (!stopped) {
    await sleep(30000);
    await pollPendingOnce().catch(() => {});
  }
}

process.once("SIGINT", () => {
  stopped = true;
  process.exit(0);
});
process.once("SIGTERM", () => {
  stopped = true;
  process.exit(0);
});

main().catch((e) => {
  console.error("[chatbot-local-worker] fatal:", e.message);
  process.exit(1);
});
