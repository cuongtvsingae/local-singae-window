const crypto = require("crypto");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const KNOWLEDGE_KEY_PREFIX = "knowledge-base";
const KNOWLEDGE_SCHEMA_VERSION = 3;
const MAX_CONTEXT_CHARS = 12000;
const DEFAULT_TOP_K = 8;

function emptyKb() {
  return {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    updatedAt: null,
    sources: [],
    embeddingModel: null,
    retrieval: {
      strategy: "hybrid-v1",
      vectorWeight: 0.78,
      keywordWeight: 0.22,
      minRerankScore: 0.12,
      minVectorSimilarity: 0.18
    },
    entries: []
  };
}

function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function normalizeRecord(record) {
  const normalizedRecord = {};
  for (const [key, value] of Object.entries(record || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = normalizeValue(value);
    if (normalizedKey && normalizedValue) normalizedRecord[normalizedKey] = normalizedValue;
  }
  return normalizedRecord;
}

function buildEntryText(row) {
  const preferred = ["question", "answer", "category", "keywords", "conditions", "channel_scope", "status"];
  const preferredSegments = preferred
    .map((key) => {
      const value = normalizeValue(row?.[key]);
      return value ? `${key}: ${value}` : "";
    })
    .filter(Boolean);
  if (preferredSegments.length) return preferredSegments.join(" | ");
  return Object.entries(row)
    .map(([key, value]) => {
      const normalized = normalizeValue(value);
      return normalized ? `${key}: ${normalized}` : "";
    })
    .filter(Boolean)
    .join(" | ");
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[;,|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || ""), "utf8").digest("hex");
}

function normalizeEntry(entry, index = 0) {
  const record = normalizeRecord(entry?.record || {});
  const text = String(entry?.text || buildEntryText(record)).trim();
  const status = String(entry?.status || record?.status || "active").trim().toLowerCase() || "active";
  const priority = Number(entry?.priority || record?.priority || 3);
  return {
    id: String(entry?.id || `entry-${index + 1}`).trim(),
    source: String(entry?.source || "unknown").trim() || "unknown",
    sourceType: String(entry?.sourceType || "unknown").trim() || "unknown",
    rowNumber: Number.isInteger(entry?.rowNumber) ? entry.rowNumber : index + 1,
    record,
    text,
    embedding: Array.isArray(entry?.embedding) ? entry.embedding : [],
    keywords: normalizeKeywords(entry?.keywords || record?.keywords || ""),
    category: String(entry?.category || record?.category || "").trim() || null,
    channelScope: String(entry?.channelScope || record?.channel_scope || record?.channelScope || "all").trim() || "all",
    status,
    priority: Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3,
    effectiveFrom: String(entry?.effectiveFrom || record?.effective_from || "").trim() || null,
    effectiveTo: String(entry?.effectiveTo || record?.effective_to || "").trim() || null,
    chunkType: String(entry?.chunkType || "row").trim() || "row",
    contentHash: String(entry?.contentHash || hashText(text)).trim()
  };
}

async function loadKnowledgeBase() {
  let namespace = "openai";
  if (arguments[0] && typeof arguments[0] === "object" && arguments[0].namespace) {
    namespace = String(arguments[0].namespace || "openai").trim().toLowerCase() || "openai";
  }
  const KNOWLEDGE_KEY = `${KNOWLEDGE_KEY_PREFIX}:${namespace}`;
  await importAllLegacyOnce();
  const parsed = await kvGetJson(KNOWLEDGE_KEY, emptyKb());
  const defaults = emptyKb().retrieval;
  return {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    embeddingModel: parsed?.embeddingModel || null,
    updatedAt: parsed?.updatedAt || null,
    retrieval: {
      strategy: String(parsed?.retrieval?.strategy || defaults.strategy),
      vectorWeight: Number(parsed?.retrieval?.vectorWeight ?? defaults.vectorWeight),
      keywordWeight: Number(parsed?.retrieval?.keywordWeight ?? defaults.keywordWeight),
      minRerankScore: Number(parsed?.retrieval?.minRerankScore ?? defaults.minRerankScore),
      minVectorSimilarity: Number(parsed?.retrieval?.minVectorSimilarity ?? defaults.minVectorSimilarity)
    },
    sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
    entries: Array.isArray(parsed?.entries) ? parsed.entries.map((entry, index) => normalizeEntry(entry, index)) : []
  };
}

async function saveKnowledgeBase(data) {
  let namespace = "openai";
  if (arguments[1] && typeof arguments[1] === "object" && arguments[1].namespace) {
    namespace = String(arguments[1].namespace || "openai").trim().toLowerCase() || "openai";
  }
  const KNOWLEDGE_KEY = `${KNOWLEDGE_KEY_PREFIX}:${namespace}`;
  await kvSetJson(KNOWLEDGE_KEY, data || emptyKb());
}

function buildSources(entries) {
  const sourceMap = new Map();
  for (const entry of entries) {
    const key = `${entry.sourceType || "unknown"}::${entry.source}`;
    const current = sourceMap.get(key) || {
      type: entry.sourceType || "unknown",
      name: entry.source,
      rows: 0,
      activeRows: 0
    };
    current.rows += 1;
    if (String(entry?.status || "active").toLowerCase() === "active") current.activeRows += 1;
    sourceMap.set(key, current);
  }
  return Array.from(sourceMap.values());
}

function createKnowledgeBaseData({ embeddingModel, entries, retrieval: previousRetrieval }) {
  const base = emptyKb().retrieval;
  return {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    retrieval: {
      ...base,
      ...(previousRetrieval && typeof previousRetrieval === "object" ? previousRetrieval : {})
    },
    sources: buildSources(entries),
    embeddingModel: embeddingModel || null,
    entries
  };
}

function dotProduct(vectorA, vectorB) {
  let total = 0;
  for (let index = 0; index < vectorA.length; index += 1) total += vectorA[index] * vectorB[index];
  return total;
}

function vectorMagnitude(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || !vectorA.length || !vectorB.length) return 0;
  const magnitudeA = vectorMagnitude(vectorA);
  const magnitudeB = vectorMagnitude(vectorB);
  if (!magnitudeA || !magnitudeB) return 0;
  return dotProduct(vectorA, vectorB) / (magnitudeA * magnitudeB);
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-zA-ZÀ-ỹ_]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeToken(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function keywordScore(query, entry) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const haystack = [
    entry?.text || "",
    entry?.record?.question || "",
    entry?.record?.answer || "",
    entry?.category || "",
    ...(Array.isArray(entry?.keywords) ? entry.keywords : [])
  ]
    .join(" ")
    .toLowerCase();
  let matched = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) matched += 1;
  }
  return matched / queryTokens.length;
}

function isEntryEffective(entry, now = new Date()) {
  const status = String(entry?.status || "active").toLowerCase();
  if (status !== "active") return false;
  const from = entry?.effectiveFrom ? new Date(entry.effectiveFrom) : null;
  const to = entry?.effectiveTo ? new Date(entry.effectiveTo) : null;
  if (from && !Number.isNaN(from.getTime()) && from > now) return false;
  if (to && !Number.isNaN(to.getTime()) && to < now) return false;
  return true;
}

function rankEntriesByEmbedding(questionEmbedding, entries, topK = DEFAULT_TOP_K) {
  return entries
    .map((entry) => ({
      ...entry,
      similarity: cosineSimilarity(questionEmbedding, entry.embedding)
    }))
    .filter((entry) => entry.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

function rankEntriesHybrid({
  query,
  questionEmbedding,
  entries,
  topK = DEFAULT_TOP_K,
  vectorWeight = 0.78,
  keywordWeight = 0.22
}) {
  const now = new Date();
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => isEntryEffective(entry, now))
    .map((entry) => {
      const vectorSimilarity = cosineSimilarity(questionEmbedding, entry.embedding);
      const lexicalSimilarity = keywordScore(query, entry);
      const priorityBoost = Number(entry?.priority || 3) * 0.01;
      const rerankScore = vectorSimilarity * vectorWeight + lexicalSimilarity * keywordWeight + priorityBoost;
      return {
        ...entry,
        similarity: vectorSimilarity,
        lexicalSimilarity,
        rerankScore
      };
    })
    .filter((entry) => entry.rerankScore > 0)
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);
}

function getRetrievalThresholds(retrieval = {}) {
  const base = emptyKb().retrieval;
  return {
    minRerankScore: Number.isFinite(Number(retrieval.minRerankScore))
      ? Number(retrieval.minRerankScore)
      : base.minRerankScore,
    minVectorSimilarity: Number.isFinite(Number(retrieval.minVectorSimilarity))
      ? Number(retrieval.minVectorSimilarity)
      : base.minVectorSimilarity
  };
}

/**
 * Lọc kết quả hybrid: bỏ chunk điểm quá thấp để giảm trả lời sai khi RAG không khớp.
 */
function filterRetrievalMatches(matches, retrieval = {}) {
  const { minRerankScore, minVectorSimilarity } = getRetrievalThresholds(retrieval);
  const list = Array.isArray(matches) ? matches : [];
  return list.filter((entry) => {
    const rr = Number(entry.rerankScore || 0);
    const sim = Number(entry.similarity || 0);
    return rr >= minRerankScore && sim >= minVectorSimilarity;
  });
}

/**
 * Lọc kết quả chỉ embedding (VIP KB / rankEntriesByEmbedding).
 */
function filterEmbeddingMatches(matches, retrieval = {}) {
  const { minVectorSimilarity } = getRetrievalThresholds(retrieval);
  const list = Array.isArray(matches) ? matches : [];
  return list.filter((entry) => Number(entry.similarity || 0) >= minVectorSimilarity);
}

function scoreLabel(entry) {
  if (Number.isFinite(Number(entry.rerankScore))) return Number(entry.rerankScore);
  if (Number.isFinite(Number(entry.similarity))) return Number(entry.similarity);
  return 0;
}

function buildContextFromEntries(entries, options = {}) {
  const numbered = Boolean(options.numbered);
  const lines = [];
  let totalChars = 0;
  const list = Array.isArray(entries) ? entries : [];
  let index = 0;
  for (const entry of list) {
    index += 1;
    const cat = entry.category ? ` | muc: ${entry.category}` : "";
    const score = scoreLabel(entry);
    const head = numbered
      ? `[KB-${index}] nguon: ${entry.source} | id: ${entry.id}${cat} | diem: ${score.toFixed(3)}`
      : `- [${entry.source}] ${entry.text}`;
    const body = numbered ? String(entry.text || "").trim() : "";
    const block = numbered ? `${head}\n${body}` : head;
    if (totalChars + block.length + 2 > MAX_CONTEXT_CHARS) break;
    lines.push(block);
    totalChars += block.length + 2;
    if (!numbered) continue;
  }
  if (!numbered) {
    return lines.join("\n");
  }
  return lines.join("\n\n");
}

async function replaceKnowledgeBase({ sourceName, sourceType, rows, embedTexts, embeddingModel }) {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const preparedEntries = rows
    .map((row, index) => {
      const record = normalizeRecord(row);
      const text = buildEntryText(record);
      if (!text) return null;
      return normalizeEntry(
        {
          id: `${sourceType}-${index + 1}`,
          source: sourceName,
          sourceType,
          rowNumber: index + 1,
          record,
          text,
          embedding: [],
          keywords: normalizeKeywords(record?.keywords || ""),
          category: record?.category || null,
          channelScope: record?.channel_scope || record?.channelScope || "all",
          status: record?.status || "active",
          priority: record?.priority || 3,
          effectiveFrom: record?.effective_from || null,
          effectiveTo: record?.effective_to || null
        },
        index
      );
    })
    .filter(Boolean);

  const embeddingResult = await embedTexts(preparedEntries.map((entry) => entry.text));
  const embeddings = embeddingResult.embeddings || [];
  const entries = preparedEntries.map((entry, index) => ({
    ...entry,
    embedding: embeddings[index] || [],
    contentHash: hashText(entry.text)
  }));

  const existingKb = await loadKnowledgeBase({ namespace });
  const data = createKnowledgeBaseData({
    embeddingModel,
    entries,
    retrieval: existingKb.retrieval
  });
  await saveKnowledgeBase(data, { namespace });
  return { knowledgeBase: data, embeddingResult };
}

async function updateKnowledgeBaseEntry({ entryId, record, embedText }) {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const knowledgeBase = await loadKnowledgeBase({ namespace });
  const entryIndex = knowledgeBase.entries.findIndex((entry) => entry.id === entryId);
  if (entryIndex === -1) throw new Error("Khong tim thay ban ghi can sua.");
  const normalizedRecord = normalizeRecord(record);
  const text = buildEntryText(normalizedRecord);
  if (!text) throw new Error("Ban ghi phai co it nhat mot truong co gia tri.");
  const embeddingResult = await embedText(text);
  const updatedEntry = normalizeEntry(
    {
      ...knowledgeBase.entries[entryIndex],
      record: normalizedRecord,
      text,
      embedding: embeddingResult.embedding,
      contentHash: hashText(text)
    },
    entryIndex
  );
  const entries = knowledgeBase.entries.map((entry, index) => (index === entryIndex ? updatedEntry : entry));
  const data = createKnowledgeBaseData({
    embeddingModel: knowledgeBase.embeddingModel,
    entries,
    retrieval: knowledgeBase.retrieval
  });
  await saveKnowledgeBase(data, { namespace });
  return { knowledgeBase: data, embeddingResult };
}

async function addKnowledgeBaseEntry({ record, source = "manual", sourceType = "manual", embedText }) {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const knowledgeBase = await loadKnowledgeBase({ namespace });
  const normalizedRecord = normalizeRecord(record);
  const text = buildEntryText(normalizedRecord);
  if (!text) throw new Error("Ban ghi phai co it nhat mot truong co gia tri.");
  const embeddingResult = await embedText(text);
  const nextId = `manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const entry = normalizeEntry(
    {
      id: nextId,
      source,
      sourceType,
      rowNumber: knowledgeBase.entries.length + 1,
      record: normalizedRecord,
      text,
      embedding: embeddingResult.embedding,
      contentHash: hashText(text)
    },
    knowledgeBase.entries.length
  );
  const entries = [entry, ...knowledgeBase.entries];
  const data = createKnowledgeBaseData({
    embeddingModel: embeddingResult.model || knowledgeBase.embeddingModel,
    entries,
    retrieval: knowledgeBase.retrieval
  });
  await saveKnowledgeBase(data, { namespace });
  return { knowledgeBase: data, embeddingResult };
}

async function deleteKnowledgeBaseEntry(entryId) {
  const namespace =
    String(arguments[1]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const knowledgeBase = await loadKnowledgeBase({ namespace });
  const entries = knowledgeBase.entries.filter((entry) => entry.id !== entryId);
  if (entries.length === knowledgeBase.entries.length) throw new Error("Khong tim thay ban ghi can xoa.");
  const data = createKnowledgeBaseData({
    embeddingModel: knowledgeBase.embeddingModel,
    entries,
    retrieval: knowledgeBase.retrieval
  });
  await saveKnowledgeBase(data, { namespace });
  return data;
}

async function clearKnowledgeBase() {
  const namespace =
    String(arguments[0]?.namespace || "openai")
      .trim()
      .toLowerCase() || "openai";
  const data = createKnowledgeBaseData({ embeddingModel: null, entries: [] });
  await saveKnowledgeBase(data, { namespace });
  return data;
}

module.exports = {
  addKnowledgeBaseEntry,
  buildContextFromEntries,
  clearKnowledgeBase,
  deleteKnowledgeBaseEntry,
  filterEmbeddingMatches,
  filterRetrievalMatches,
  getRetrievalThresholds,
  loadKnowledgeBase,
  rankEntriesHybrid,
  rankEntriesByEmbedding,
  replaceKnowledgeBase,
  saveKnowledgeBase,
  updateKnowledgeBaseEntry
};

