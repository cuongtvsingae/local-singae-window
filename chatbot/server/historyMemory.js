const crypto = require("crypto");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const HISTORY_MEMORY_KEY_PREFIX = "history-memory";
const HISTORY_MEMORY_SCHEMA_VERSION = 1;

function emptyHistoryMemory() {
  return {
    schemaVersion: HISTORY_MEMORY_SCHEMA_VERSION,
    updatedAt: null,
    conversations: {}
  };
}

function hashContent(value) {
  return crypto.createHash("sha1").update(String(value || ""), "utf8").digest("hex");
}

function pickMemorySnippets(messages) {
  const rows = Array.isArray(messages) ? messages : [];
  const normalized = rows
    .filter((msg) => String(msg?.text || "").trim())
    .map((msg) => ({
      role: msg?.direction === "outgoing" ? "assistant" : "user",
      text: String(msg?.text || "").trim(),
      createdAt: String(msg?.createdAt || "").trim()
    }));
  const result = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const a = normalized[i];
    const b = normalized[i + 1];
    const text = b
      ? `[user] ${a.role === "user" ? a.text : ""}\n[assistant] ${b.role === "assistant" ? b.text : b.text}`.trim()
      : `[${a.role}] ${a.text}`;
    if (text) {
      result.push({
        id: `mem-${i + 1}`,
        text,
        createdAt: b?.createdAt || a.createdAt || new Date().toISOString(),
        embedding: []
      });
    }
  }
  return result.slice(-18);
}

async function loadHistoryMemory() {
  let namespace = "openai";
  if (arguments[0] && typeof arguments[0] === "object" && arguments[0].namespace) {
    namespace = String(arguments[0].namespace || "openai").trim().toLowerCase() || "openai";
  }
  const HISTORY_MEMORY_KEY = `${HISTORY_MEMORY_KEY_PREFIX}:${namespace}`;
  await importAllLegacyOnce();
  const payload = await kvGetJson(HISTORY_MEMORY_KEY, emptyHistoryMemory());
  return {
    schemaVersion: HISTORY_MEMORY_SCHEMA_VERSION,
    updatedAt: payload?.updatedAt || null,
    conversations: payload?.conversations && typeof payload.conversations === "object" ? payload.conversations : {}
  };
}

async function saveHistoryMemory(data) {
  let namespace = "openai";
  if (arguments[1] && typeof arguments[1] === "object" && arguments[1].namespace) {
    namespace = String(arguments[1].namespace || "openai").trim().toLowerCase() || "openai";
  }
  const HISTORY_MEMORY_KEY = `${HISTORY_MEMORY_KEY_PREFIX}:${namespace}`;
  await kvSetJson(HISTORY_MEMORY_KEY, data || emptyHistoryMemory());
}

async function clearHistoryMemory() {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const payload = emptyHistoryMemory();
  payload.updatedAt = new Date().toISOString();
  await saveHistoryMemory(payload, { namespace });
  return payload;
}

async function clearConversationMemoryById(conversationId, opts = {}) {
  const namespace = String(opts.namespace || "openai")
    .trim()
    .toLowerCase() || "openai";
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return false;
  const store = await loadHistoryMemory({ namespace });
  if (!store.conversations[normalizedConversationId]) return false;
  delete store.conversations[normalizedConversationId];
  store.updatedAt = new Date().toISOString();
  await saveHistoryMemory(store, { namespace });
  return true;
}

async function upsertConversationMemory({ conversationId, messages, embedTexts }) {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return null;
  const snippets = pickMemorySnippets(messages);
  const textSignature = hashContent(snippets.map((item) => item.text).join("\n"));
  const store = await loadHistoryMemory({ namespace });
  const existing = store.conversations[normalizedConversationId];
  if (existing?.signature === textSignature) return existing;
  const embeddingsResult = await embedTexts(snippets.map((item) => item.text));
  const embeddings = Array.isArray(embeddingsResult?.embeddings) ? embeddingsResult.embeddings : [];
  const next = {
    signature: textSignature,
    embeddingModel: embeddingsResult?.model || null,
    updatedAt: new Date().toISOString(),
    memory: snippets.map((item, index) => ({
      ...item,
      embedding: Array.isArray(embeddings[index]) ? embeddings[index] : []
    }))
  };
  store.conversations[normalizedConversationId] = next;
  store.updatedAt = next.updatedAt;
  await saveHistoryMemory(store, { namespace });
  return next;
}

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || !vectorA.length || !vectorB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vectorA.length; i += 1) {
    dot += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function retrieveConversationMemory({ conversationId, queryEmbedding, topK = 5 }) {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return [];
  const store = await loadHistoryMemory({ namespace });
  const existing = store.conversations[normalizedConversationId];
  if (!existing || !Array.isArray(existing.memory)) return [];
  return existing.memory
    .map((item) => ({
      ...item,
      similarity: cosineSimilarity(queryEmbedding, item.embedding)
    }))
    .filter((item) => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

module.exports = {
  clearHistoryMemory,
  clearConversationMemoryById,
  retrieveConversationMemory,
  upsertConversationMemory
};

