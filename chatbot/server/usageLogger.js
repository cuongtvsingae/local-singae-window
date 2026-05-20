const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const USAGE_LOG_KEY = "usage-log";
const MAX_LOG_ITEMS = 100;

function isValidIsoDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function isValidUsageLog(log) {
  if (!log || typeof log !== "object") return false;
  if (!log.type || !log.model || !log.endpoint || !log.createdAt) return false;
  if (!isValidIsoDate(log.createdAt)) return false;
  const hasRaw = log.requestRaw && log.responseRaw;
  return Boolean(hasRaw);
}

function rebuildSummary(logs) {
  return logs.reduce(
    (acc, log) => {
      acc.totalCostUsd += log.cost?.totalCostUsd || 0;
      if (log.type === "chat") acc.totalChatCostUsd += log.cost?.totalCostUsd || 0;
      if (log.type === "embedding") acc.totalEmbeddingCostUsd += log.cost?.totalCostUsd || 0;
      acc.totalInputTokens += log.usage?.inputTokens || 0;
      acc.totalOutputTokens += log.usage?.outputTokens || 0;
      acc.totalEmbeddingTokens += log.usage?.embeddingTokens || 0;
      acc.requestCount += 1;
      return acc;
    },
    {
      totalCostUsd: 0,
      totalChatCostUsd: 0,
      totalEmbeddingCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEmbeddingTokens: 0,
      requestCount: 0
    }
  );
}

function sanitizeUsageLogPayload(payload) {
  const logs = Array.isArray(payload?.logs) ? payload.logs : [];
  const validLogs = logs.filter((log) => isValidUsageLog(log)).slice(0, MAX_LOG_ITEMS);
  const summary = rebuildSummary(validLogs);
  return { summary, logs: validLogs };
}

function emptyUsageLog() {
  return {
    summary: {
      totalCostUsd: 0,
      totalChatCostUsd: 0,
      totalEmbeddingCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEmbeddingTokens: 0,
      requestCount: 0
    },
    logs: []
  };
}

async function loadUsageLog() {
  await importAllLegacyOnce();
  const parsed = await kvGetJson(USAGE_LOG_KEY, emptyUsageLog());
  const sanitized = sanitizeUsageLogPayload(parsed);
  if (sanitized.logs.length !== (parsed?.logs || []).length) {
    await saveUsageLog(sanitized);
  }
  return sanitized;
}

async function saveUsageLog(data) {
  await kvSetJson(USAGE_LOG_KEY, data || emptyUsageLog());
}

function roundUsd(value) {
  return Number((value || 0).toFixed(8));
}

async function appendUsageLog(log) {
  const existing = await loadUsageLog();
  const normalizedLog = {
    ...log,
    requestRaw: log?.requestRaw ?? log?.request ?? null,
    responseRaw: log?.responseRaw ?? log?.response ?? null
  };
  const logs = [normalizedLog, ...(existing.logs || [])]
    .filter((item) => isValidUsageLog(item))
    .slice(0, MAX_LOG_ITEMS);

  const summary = {
    totalCostUsd: roundUsd(
      (existing.summary?.totalCostUsd || 0) + (normalizedLog.cost?.totalCostUsd || 0)
    ),
    totalChatCostUsd: roundUsd(
      (existing.summary?.totalChatCostUsd || 0) +
        (normalizedLog.type === "chat" ? normalizedLog.cost?.totalCostUsd || 0 : 0)
    ),
    totalEmbeddingCostUsd: roundUsd(
      (existing.summary?.totalEmbeddingCostUsd || 0) +
        (normalizedLog.type === "embedding" ? normalizedLog.cost?.totalCostUsd || 0 : 0)
    ),
    totalInputTokens: (existing.summary?.totalInputTokens || 0) + (normalizedLog.usage?.inputTokens || 0),
    totalOutputTokens: (existing.summary?.totalOutputTokens || 0) + (normalizedLog.usage?.outputTokens || 0),
    totalEmbeddingTokens:
      (existing.summary?.totalEmbeddingTokens || 0) + (normalizedLog.usage?.embeddingTokens || 0),
    requestCount: (existing.summary?.requestCount || 0) + 1
  };

  const payload = {
    summary,
    logs
  };

  await saveUsageLog(payload);
  return payload;
}

async function clearUsageLog() {
  const payload = {
    summary: {
      totalCostUsd: 0,
      totalChatCostUsd: 0,
      totalEmbeddingCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEmbeddingTokens: 0,
      requestCount: 0
    },
    logs: []
  };

  await saveUsageLog(payload);
  return payload;
}

module.exports = {
  appendUsageLog,
  clearUsageLog,
  loadUsageLog
};






