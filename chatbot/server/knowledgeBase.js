const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const KNOWLEDGE_KEY = "knowledge-base";
const MAX_CONTEXT_CHARS = 12000;
const DEFAULT_TOP_K = 8;

function emptyKb() {
  return {
    updatedAt: null,
    sources: [],
    embeddingModel: null,
    entries: []
  };
}

async function loadKnowledgeBase() {
  await importAllLegacyOnce();
  const parsed = await kvGetJson(KNOWLEDGE_KEY, emptyKb());
  return {
    embeddingModel: parsed?.embeddingModel || null,
    updatedAt: parsed?.updatedAt || null,
    sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
    entries: Array.isArray(parsed?.entries)
      ? parsed.entries.map((entry) => ({
          ...entry,
          embedding: Array.isArray(entry.embedding) ? entry.embedding : []
        }))
      : []
  };
}

async function saveKnowledgeBase(data) {
  await kvSetJson(KNOWLEDGE_KEY, data || emptyKb());
}

function buildSources(entries) {
  const sourceMap = new Map();

  for (const entry of entries) {
    const key = `${entry.sourceType || "unknown"}::${entry.source}`;
    const current = sourceMap.get(key) || {
      type: entry.sourceType || "unknown",
      name: entry.source,
      rows: 0
    };

    current.rows += 1;
    sourceMap.set(key, current);
  }

  return Array.from(sourceMap.values());
}

function createKnowledgeBaseData({ embeddingModel, entries }) {
  return {
    updatedAt: new Date().toISOString(),
    sources: buildSources(entries),
    embeddingModel: embeddingModel || null,
    entries
  };
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value).trim();
}

function buildEntryText(row) {
  const segments = Object.entries(row)
    .map(([key, value]) => {
      const normalized = normalizeValue(value);
      return normalized ? `${key}: ${normalized}` : "";
    })
    .filter(Boolean);

  return segments.join(" | ");
}

function normalizeRecord(record) {
  const normalizedRecord = {};

  for (const [key, value] of Object.entries(record || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = normalizeValue(value);

    if (normalizedKey && normalizedValue) {
      normalizedRecord[normalizedKey] = normalizedValue;
    }
  }

  return normalizedRecord;
}

function dotProduct(vectorA, vectorB) {
  let total = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    total += vectorA[index] * vectorB[index];
  }

  return total;
}

function vectorMagnitude(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || !vectorA.length || !vectorB.length) {
    return 0;
  }

  const magnitudeA = vectorMagnitude(vectorA);
  const magnitudeB = vectorMagnitude(vectorB);

  if (!magnitudeA || !magnitudeB) {
    return 0;
  }

  return dotProduct(vectorA, vectorB) / (magnitudeA * magnitudeB);
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

function buildContextFromEntries(entries) {
  const lines = [];
  let totalChars = 0;

  for (const entry of entries) {
    const line = `- [${entry.source}] ${entry.text}`;
    if (totalChars + line.length > MAX_CONTEXT_CHARS) {
      break;
    }

    lines.push(line);
    totalChars += line.length;
  }

  return lines.join("\n");
}

async function replaceKnowledgeBase({ sourceName, sourceType, rows, embedTexts, embeddingModel }) {
  const preparedEntries = rows
    .map((row, index) => {
      const record = normalizeRecord(row);

      const text = buildEntryText(record);
      if (!text) {
        return null;
      }

      return {
        id: `${sourceType}-${index + 1}`,
        source: sourceName,
        sourceType,
        rowNumber: index + 1,
        record,
        text,
        embedding: []
      };
    })
    .filter(Boolean);

  const embeddingResult = await embedTexts(preparedEntries.map((entry) => entry.text));
  const embeddings = embeddingResult.embeddings || [];
  const entries = preparedEntries.map((entry, index) => ({
    ...entry,
    embedding: embeddings[index] || []
  }));

  const data = createKnowledgeBaseData({ embeddingModel, entries });

  await saveKnowledgeBase(data);
  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function updateKnowledgeBaseEntry({ entryId, record, embedText }) {
  const knowledgeBase = await loadKnowledgeBase();
  const entryIndex = knowledgeBase.entries.findIndex((entry) => entry.id === entryId);

  if (entryIndex === -1) {
    throw new Error("Khong tim thay ban ghi can sua.");
  }

  const normalizedRecord = normalizeRecord(record);
  const text = buildEntryText(normalizedRecord);

  if (!text) {
    throw new Error("Ban ghi phai co it nhat mot truong co gia tri.");
  }

  const embeddingResult = await embedText(text);

  const updatedEntry = {
    ...knowledgeBase.entries[entryIndex],
    record: normalizedRecord,
    text,
    embedding: embeddingResult.embedding
  };

  const entries = knowledgeBase.entries.map((entry, index) =>
    index === entryIndex ? updatedEntry : entry
  );

  const data = createKnowledgeBaseData({
    embeddingModel: knowledgeBase.embeddingModel,
    entries
  });

  await saveKnowledgeBase(data);
  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function addKnowledgeBaseEntry({ record, source = "manual", sourceType = "manual", embedText }) {
  const knowledgeBase = await loadKnowledgeBase();
  const normalizedRecord = normalizeRecord(record);
  const text = buildEntryText(normalizedRecord);

  if (!text) {
    throw new Error("Ban ghi phai co it nhat mot truong co gia tri.");
  }

  const embeddingResult = await embedText(text);
  const nextId = `manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const entry = {
    id: nextId,
    source,
    sourceType,
    rowNumber: knowledgeBase.entries.length + 1,
    record: normalizedRecord,
    text,
    embedding: embeddingResult.embedding
  };

  const entries = [entry, ...knowledgeBase.entries];
  const data = createKnowledgeBaseData({
    embeddingModel: embeddingResult.model || knowledgeBase.embeddingModel,
    entries
  });

  await saveKnowledgeBase(data);
  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function deleteKnowledgeBaseEntry(entryId) {
  const knowledgeBase = await loadKnowledgeBase();
  const entries = knowledgeBase.entries.filter((entry) => entry.id !== entryId);

  if (entries.length === knowledgeBase.entries.length) {
    throw new Error("Khong tim thay ban ghi can xoa.");
  }

  const data = createKnowledgeBaseData({
    embeddingModel: knowledgeBase.embeddingModel,
    entries
  });

  await saveKnowledgeBase(data);
  return data;
}

async function clearKnowledgeBase() {
  const data = {
    updatedAt: new Date().toISOString(),
    sources: [],
    embeddingModel: null,
    entries: []
  };

  await saveKnowledgeBase(data);
  return data;
}

module.exports = {
  addKnowledgeBaseEntry,
  buildContextFromEntries,
  clearKnowledgeBase,
  deleteKnowledgeBaseEntry,
  loadKnowledgeBase,
  rankEntriesByEmbedding,
  replaceKnowledgeBase,
  saveKnowledgeBase,
  updateKnowledgeBaseEntry
};






