const ONLINE_WINDOW_MS = Number.parseInt(
  process.env.ONLINE_PRESENCE_WINDOW_MS || "120000",
  10
); // 2 phÃºt máº·c Ä‘á»‹nh

const MAX_IP_ENTRIES = Number.parseInt(process.env.ONLINE_PRESENCE_MAX_IPS || "2000", 10);
const MAX_EVENT_LOG = Number.parseInt(process.env.ONLINE_PRESENCE_MAX_EVENTS || "3000", 10);
const MAX_IP_HISTORY_PER_IP = Number.parseInt(process.env.ONLINE_PRESENCE_MAX_HISTORY_PER_IP || "50", 10);

const presenceByIp = new Map();
const eventLog = [];

function normalizeIpFromReq(req) {
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    return stripIPv6Prefix(first);
  }

  const ip = stripIPv6Prefix(req?.ip || req?.connection?.remoteAddress || "");
  return ip;
}

function stripIPv6Prefix(ip) {
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function registerOnlineRequest(req, endpointLabel) {
  try {
    const ip = normalizeIpFromReq(req);
    if (!ip) return;

    const nowMs = Date.now();

    const entry = presenceByIp.get(ip);
    if (!entry) {
      presenceByIp.set(ip, {
        ip,
        firstSeenAt: nowMs,
        lastSeenAt: nowMs,
        eventCount: 0,
        history: []
      });
    }

    const updated = presenceByIp.get(ip);
    updated.lastSeenAt = nowMs;
    updated.eventCount += 1;
    updated.history.push(nowMs);
    if (updated.history.length > MAX_IP_HISTORY_PER_IP) {
      updated.history.splice(0, updated.history.length - MAX_IP_HISTORY_PER_IP);
    }

    eventLog.push({
      at: new Date(nowMs).toISOString(),
      ip,
      endpoint: endpointLabel || "request"
    });
    if (eventLog.length > MAX_EVENT_LOG) {
      eventLog.splice(0, eventLog.length - MAX_EVENT_LOG);
    }

    if (presenceByIp.size > MAX_IP_ENTRIES) {
      const sorted = [...presenceByIp.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt);
      const toRemove = presenceByIp.size - MAX_IP_ENTRIES;
      for (let i = 0; i < toRemove; i++) {
        presenceByIp.delete(sorted[i].ip);
      }
    }
  } catch {
  }
}

function getOnlineSnapshot() {
  const nowMs = Date.now();

  let onlineCount = 0;
  const ips = [];

  for (const entry of presenceByIp.values()) {
    const online = nowMs - entry.lastSeenAt <= ONLINE_WINDOW_MS;
    if (online) onlineCount += 1;
    ips.push({
      ip: entry.ip,
      firstSeenAt: new Date(entry.firstSeenAt).toISOString(),
      lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
      online,
      eventCount: entry.eventCount
    });
  }

  ips.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));

  return {
    onlineCount,
    windowMs: ONLINE_WINDOW_MS,
    totalIpsSeen: presenceByIp.size,
    ips: ips.slice(0, 50)
  };
}

function getOnlineIpEventHistory({ limit } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 80), 500));
  const slice = eventLog.slice(Math.max(0, eventLog.length - safeLimit));
  return {
    totalEvents: eventLog.length,
    events: slice
  };
}

module.exports = {
  registerOnlineRequest,
  getOnlineSnapshot,
  getOnlineIpEventHistory
};






