const { ensureChatGptVipAccessDriveTree, migrateLegacyChatGptVipAccessFiles } = require("./chatGptVipAccessStorage");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const CHAT_GPT_VIP_ACCESS_HISTORY_KEY = "chat-gpt-vip-access-history";
migrateLegacyChatGptVipAccessFiles();

function createEmptyChatGptVipAccessHistory() {
  return {
    updatedAt: null,
    conversations: {}
  };
}

async function loadChatGptVipAccessHistory() {
  ensureChatGptVipAccessDriveTree();
  await importAllLegacyOnce();

  try {
    const data = await kvGetJson(CHAT_GPT_VIP_ACCESS_HISTORY_KEY, createEmptyChatGptVipAccessHistory());
    const legacyMessages = Array.isArray(data?.messages) ? data.messages : [];
    const rawConversations = data?.conversations && typeof data.conversations === "object"
      ? data.conversations
      : {};
    const conversations = {};
    Object.entries(rawConversations).forEach(([username, conv]) => {
      const key = String(username || "").trim().toLowerCase();
      if (!key) return;
      conversations[key] = {
        updatedAt: conv?.updatedAt || data?.updatedAt || null,
        messages: Array.isArray(conv?.messages) ? conv.messages : []
      };
    });
    if (legacyMessages.length && !conversations.default) {
      conversations.default = {
        updatedAt: data?.updatedAt || null,
        messages: legacyMessages
      };
    }
    return {
      updatedAt: data?.updatedAt || null,
      conversations
    };
  } catch (error) {
    return createEmptyChatGptVipAccessHistory();
  }
}

async function saveChatGptVipAccessHistory(data) {
  ensureChatGptVipAccessDriveTree();
  await kvSetJson(CHAT_GPT_VIP_ACCESS_HISTORY_KEY, data || createEmptyChatGptVipAccessHistory());
}

async function clearChatGptVipAccessHistory() {
  const data = createEmptyChatGptVipAccessHistory();
  data.updatedAt = new Date().toISOString();
  await saveChatGptVipAccessHistory(data);
  return data;
}

function normalizeChatGptVipAccessUsername(username) {
  return String(username || "").trim().toLowerCase() || "default";
}

async function getChatGptVipAccessConversationByUsername(username) {
  const data = await loadChatGptVipAccessHistory();
  const key = normalizeChatGptVipAccessUsername(username);
  const conv = data.conversations?.[key];
  if (conv && Array.isArray(conv.messages)) {
    return {
      updatedAt: conv.updatedAt || data.updatedAt || null,
      messages: conv.messages
    };
  }
  return {
    updatedAt: data.updatedAt || null,
    messages: []
  };
}

async function getAllChatGptVipAccessConversations() {
  const data = await loadChatGptVipAccessHistory();
  const conversations = data.conversations && typeof data.conversations === "object"
    ? data.conversations
    : {};
  const out = {};
  Object.entries(conversations).forEach(([username, conv]) => {
    const key = normalizeChatGptVipAccessUsername(username);
    out[key] = {
      updatedAt: conv?.updatedAt || data.updatedAt || null,
      messages: Array.isArray(conv?.messages) ? conv.messages : []
    };
  });
  return out;
}

async function clearChatGptVipAccessConversationByUsername(username) {
  const data = await loadChatGptVipAccessHistory();
  const key = normalizeChatGptVipAccessUsername(username);
  const timestamp = new Date().toISOString();
  data.conversations = data.conversations || {};
  data.conversations[key] = {
    updatedAt: timestamp,
    messages: []
  };
  data.updatedAt = timestamp;
  await saveChatGptVipAccessHistory(data);
  return {
    updatedAt: timestamp,
    messages: []
  };
}

async function appendChatGptVipAccessMessage({ role, text, createdAt, metadata, username }) {
  const normalizedRole = role === "assistant" ? "assistant" : "user";
  const normalizedText = String(text || "").trim();

  if (!normalizedText) {
    throw new Error("text is required.");
  }

  const data = await loadChatGptVipAccessHistory();
  const timestamp = createdAt || new Date().toISOString();
  const direction = normalizedRole === "assistant" ? "outgoing" : "incoming";
  const key = normalizeChatGptVipAccessUsername(username);
  data.conversations = data.conversations || {};
  if (!data.conversations[key] || !Array.isArray(data.conversations[key].messages)) {
    data.conversations[key] = { updatedAt: null, messages: [] };
  }

  data.conversations[key].messages.push({
    id: `chat-gpt-vip-access-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: normalizedRole,
    direction,
    text: normalizedText,
    createdAt: timestamp,
    seenAt: null,
    readAt: null,
    metadata: metadata || {}
  });

  data.conversations[key].updatedAt = timestamp;
  data.updatedAt = timestamp;
  await saveChatGptVipAccessHistory(data);
  return data.conversations[key];
}

module.exports = {
  appendChatGptVipAccessMessage,
  loadChatGptVipAccessHistory,
  clearChatGptVipAccessHistory,
  getChatGptVipAccessConversationByUsername,
  clearChatGptVipAccessConversationByUsername,
  getAllChatGptVipAccessConversations
};






