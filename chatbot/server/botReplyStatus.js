const { randomBytes } = require("node:crypto");

/** Nếu worker treo / crash, bỏ session sau khoảng thời gian này để UI không kẹt “đang trả lời” mãi. */
const STALE_AFTER_MS = 15 * 60 * 1000;

const sessions = new Map();

function beginBotReply(fields) {
  const id = randomBytes(10).toString("hex");
  const startedAtIso = new Date().toISOString();
  sessions.set(id, {
    id,
    ...fields,
    startedAtIso
  });
  return id;
}

function endBotReply(id) {
  if (id == null || id === "") return;
  sessions.delete(String(id));
}

function pruneStale() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    const t = Date.parse(s.startedAtIso);
    if (!Number.isFinite(t) || now - t > STALE_AFTER_MS) {
      sessions.delete(id);
    }
  }
}

function getBotReplyStatus() {
  pruneStale();
  const list = Array.from(sessions.values());
  return {
    busy: list.length > 0,
    count: list.length,
    sessions: list
  };
}

module.exports = {
  beginBotReply,
  endBotReply,
  getBotReplyStatus
};
