const { ensureChatGptVipAccessDriveTree } = require("./chatGptVipAccessStorage");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const CHAT_GPT_VIP_ACCESS_KNOWLEDGE_KEY = "chat-gpt-vip-access-knowledge-base";

function createEmptyKnowledgeBase() {
  return {
    updatedAt: null,
    embeddingModel: null,
    sources: [],
    entries: []
  };
}

async function loadChatGptVipAccessKnowledgeBase() {
  ensureChatGptVipAccessDriveTree();
  await importAllLegacyOnce();
  try {
    const parsed = await kvGetJson(CHAT_GPT_VIP_ACCESS_KNOWLEDGE_KEY, createEmptyKnowledgeBase());
    return {
      updatedAt: parsed?.updatedAt || null,
      embeddingModel: parsed?.embeddingModel || null,
      sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
      entries: Array.isArray(parsed?.entries)
        ? parsed.entries.map((entry) => ({
            ...entry,
            embedding: Array.isArray(entry.embedding) ? entry.embedding : []
          }))
        : []
    };
  } catch {
    return createEmptyKnowledgeBase();
  }
}

async function saveChatGptVipAccessKnowledgeBase(data) {
  ensureChatGptVipAccessDriveTree();
  await kvSetJson(CHAT_GPT_VIP_ACCESS_KNOWLEDGE_KEY, data || createEmptyKnowledgeBase());
}

function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function normalizeRecord(record) {
  const out = {};
  for (const [key, value] of Object.entries(record || {})) {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = normalizeValue(value);
    if (normalizedKey && normalizedValue) out[normalizedKey] = normalizedValue;
  }
  return out;
}

function buildEntryText(record) {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .filter(Boolean)
    .join(" | ");
}

function buildSources(entries) {
  const byTopic = new Map();
  entries.forEach((entry) => {
    const key = entry.topic || "General";
    const current = byTopic.get(key) || {
      type: "sheet-topic",
      name: key,
      rows: 0
    };
    current.rows += 1;
    byTopic.set(key, current);
  });
  return Array.from(byTopic.values());
}

async function replaceChatGptVipAccessKnowledgeBaseBySheets({
  sourceName,
  sheets,
  embedTexts,
  embeddingModel
}) {
  const preparedEntries = [];
  (sheets || []).forEach((sheet, sheetIndex) => {
    const topic = String(sheet?.sheetName || `Sheet ${sheetIndex + 1}`).trim() || `Sheet ${sheetIndex + 1}`;
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    rows.forEach((row, rowIndex) => {
      const record = normalizeRecord(row);
      const text = buildEntryText(record);
      if (!text) return;
      preparedEntries.push({
        id: `chat-gpt-vip-access-sheet-${sheetIndex + 1}-row-${rowIndex + 1}`,
        source: sourceName,
        sourceType: "xlsx-all-sheets",
        topic,
        rowNumber: rowIndex + 1,
        record,
        text,
        embedding: []
      });
    });
  });

  const embeddingResult = await embedTexts(preparedEntries.map((entry) => entry.text));
  const embeddings = embeddingResult.embeddings || [];
  const entries = preparedEntries.map((entry, index) => ({
    ...entry,
    embedding: embeddings[index] || []
  }));

  const data = {
    updatedAt: new Date().toISOString(),
    embeddingModel: embeddingModel || null,
    sources: buildSources(entries),
    entries
  };
  await saveChatGptVipAccessKnowledgeBase(data);

  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function clearChatGptVipAccessKnowledgeBase() {
  const data = {
    updatedAt: new Date().toISOString(),
    embeddingModel: null,
    sources: [],
    entries: []
  };
  await saveChatGptVipAccessKnowledgeBase(data);
  return data;
}

async function addChatGptVipAccessKnowledgeEntry({ record, topic = "Manual", source = "manual", sourceType = "manual", embedText }) {
  const knowledgeBase = await loadChatGptVipAccessKnowledgeBase();
  const normalizedRecord = normalizeRecord(record);
  const text = buildEntryText(normalizedRecord);

  if (!text) {
    throw new Error("Ban ghi phai co it nhat mot truong co gia tri.");
  }

  const embeddingResult = await embedText(text);
  const nextId = `chat-gpt-vip-access-manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const entry = {
    id: nextId,
    source,
    sourceType,
    topic: String(topic || "Manual").trim() || "Manual",
    rowNumber: knowledgeBase.entries.length + 1,
    record: normalizedRecord,
    text,
    embedding: embeddingResult.embedding
  };

  const entries = [entry, ...knowledgeBase.entries];
  const data = {
    updatedAt: new Date().toISOString(),
    embeddingModel: embeddingResult.model || knowledgeBase.embeddingModel,
    sources: buildSources(entries),
    entries
  };
  await saveChatGptVipAccessKnowledgeBase(data);

  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function updateChatGptVipAccessKnowledgeEntry({ entryId, record, topic, embedText }) {
  const knowledgeBase = await loadChatGptVipAccessKnowledgeBase();
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
    embedding: embeddingResult.embedding,
    topic: String(topic || knowledgeBase.entries[entryIndex]?.topic || "Manual").trim() || "Manual"
  };

  const entries = knowledgeBase.entries.map((entry, idx) =>
    idx === entryIndex ? updatedEntry : entry
  );
  const data = {
    updatedAt: new Date().toISOString(),
    embeddingModel: embeddingResult.model || knowledgeBase.embeddingModel,
    sources: buildSources(entries),
    entries
  };
  await saveChatGptVipAccessKnowledgeBase(data);

  return {
    knowledgeBase: data,
    embeddingResult
  };
}

async function deleteChatGptVipAccessKnowledgeEntry(entryId) {
  const knowledgeBase = await loadChatGptVipAccessKnowledgeBase();
  const entries = knowledgeBase.entries.filter((entry) => entry.id !== entryId);
  if (entries.length === knowledgeBase.entries.length) {
    throw new Error("Khong tim thay ban ghi can xoa.");
  }
  const data = {
    updatedAt: new Date().toISOString(),
    embeddingModel: knowledgeBase.embeddingModel,
    sources: buildSources(entries),
    entries
  };
  await saveChatGptVipAccessKnowledgeBase(data);
  return data;
}

module.exports = {
  addChatGptVipAccessKnowledgeEntry,
  clearChatGptVipAccessKnowledgeBase,
  deleteChatGptVipAccessKnowledgeEntry,
  loadChatGptVipAccessKnowledgeBase,
  replaceChatGptVipAccessKnowledgeBaseBySheets,
  updateChatGptVipAccessKnowledgeEntry
};


