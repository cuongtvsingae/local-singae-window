const fs = require("fs");
const { callChatAPI } = require("../../../shared/openai/openaiServer");
const { getRuntimeConfig, requireChatbotLlmProvider } = require("../../../chatbot/server/channelConfig");
const {
  ensureChatGptVipAccessDriveTree,
  getChatGptVipAccessPromptNormalFile,
  getChatGptVipAccessPromptDatabaseFile,
  getChatGptVipAccessPlainTextInstructionFile
} = require("./chatGptVipAccessStorage");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

function getChatGptVipAccessModel() {
  const p = requireChatbotLlmProvider();
  const m =
    p === "localai"
      ? String(getRuntimeConfig()?.localai?.model || "").trim()
      : String(getRuntimeConfig()?.openai?.model || "").trim();
  if (!m) {
    throw new Error(
      p === "localai" ? "Thieu LOCALAI_MODEL trong private/.env." : "Thieu OPENAI_MODEL trong private/.env."
    );
  }
  return m;
}

function getChatGptVipAccessProvider() {
  return requireChatbotLlmProvider();
}

function buildDefaultPromptPayload(mode) {
  const description = "Prompt mac dinh cho Trợ lý SINGAE AI.";
  const systemPrompt = [
    "Ban la Trợ lý SINGAE AI.",
    "Tra loi ro rang, ngan gon, dung trong tam.",
    "Neu thieu thong tin, hay hoi lai nguoi dung."
  ];
  if (String(mode || "").trim().toLowerCase() === "database") {
    systemPrompt.push("Uu tien su dung ngu canh kho tri thuc neu co.");
  }
  return createPromptPayload("Trợ lý SINGAE AI", description, systemPrompt);
}

function createPromptPayload(name, description, systemPromptLines) {
  return {
    name,
    description,
    systemPrompt: Array.isArray(systemPromptLines) ? systemPromptLines : []
  };
}

function normalizePromptLines(input) {
  if (Array.isArray(input)) {
    const lines = input.map((line) => String(line || "").trim()).filter(Boolean);
    return lines;
  }
  const text = String(input || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
}

function resolvePromptFileByMode(mode) {
  const key = String(mode || "").trim().toLowerCase();
  if (key === "database") return getChatGptVipAccessPromptDatabaseFile();
  if (key === "normal") return getChatGptVipAccessPromptNormalFile();
  throw new Error("Mode khong hop le. Chi ho tro normal|database.");
}

function kvKeyForMode(mode) {
  const key = String(mode || "").trim().toLowerCase();
  if (key === "database") return "chat-gpt-vip-access-prompt-database";
  if (key === "normal") return "chat-gpt-vip-access-prompt-normal";
  throw new Error("Mode khong hop le. Chi ho tro normal|database.");
}

async function getChatGptVipAccessPromptFiles() {
  await importAllLegacyOnce();
  ensureChatGptVipAccessPromptFiles();
  const normal = await loadPromptFromDbOrFile("normal");
  const database = await loadPromptFromDbOrFile("database");
  return { normal, database };
}

async function loadPromptFromDbOrFile(mode) {
  await importAllLegacyOnce();
  ensureChatGptVipAccessPromptFiles();
  const key = kvKeyForMode(mode);
  const dbPrompt = await kvGetJson(key, null);
  if (dbPrompt && typeof dbPrompt === "object" && Array.isArray(dbPrompt.systemPrompt)) {
    return normalizePromptFromDb(dbPrompt, mode);
  }
  // fallback legacy file read (should be migrated already by sqliteStore)
  const filePath = resolvePromptFileByMode(mode);
  if (fs.existsSync(filePath)) {
    return readPromptFile(filePath);
  }
  const defaults = buildDefaultPromptPayload(mode);
  await kvSetJson(key, defaults);
  return normalizePromptFromDb(defaults, mode);
}

function normalizePromptFromDb(parsed, mode) {
  const lines = Array.isArray(parsed?.systemPrompt)
    ? parsed.systemPrompt.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  return {
    filePath: resolvePromptFileByMode(mode),
    fileName: resolvePromptFileByMode(mode).split(/[/\\]/).pop() || "",
    name: String(parsed?.name || ""),
    description: String(parsed?.description || ""),
    systemPromptLines: lines
  };
}

async function updateChatGptVipAccessPromptFile(mode, payload = {}) {
  await importAllLegacyOnce();
  ensureChatGptVipAccessPromptFiles();
  const current = await loadPromptFromDbOrFile(mode);
  const name = String(payload?.name || current.name || "").trim();
  const description = String(payload?.description || current.description || "").trim();
  const systemPromptLines = normalizePromptLines(payload?.systemPrompt || current.systemPromptLines);

  if (!name) {
    throw new Error("Prompt name khong duoc de trong.");
  }
  if (!systemPromptLines.length) {
    throw new Error("Prompt content khong duoc de trong.");
  }

  const updated = createPromptPayload(name, description, systemPromptLines);
  await kvSetJson(kvKeyForMode(mode), updated);
  return normalizePromptFromDb(updated, mode);
}

async function resetChatGptVipAccessPromptFile(mode) {
  await importAllLegacyOnce();
  const targetFile = resolvePromptFileByMode(mode);
  if (fs.existsSync(targetFile)) {
    try { fs.unlinkSync(targetFile); } catch (_) {}
  }
  // Delete from DB so it falls back to file defaults on next ensure
  const defaults = readPromptFile(targetFile);
  await kvSetJson(kvKeyForMode(mode), createPromptPayload(defaults.name, defaults.description, defaults.systemPromptLines));
  return await loadPromptFromDbOrFile(mode);
}

function ensureChatGptVipAccessPromptFiles() {
  ensureChatGptVipAccessDriveTree();
}

function readPromptFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Khong tim thay prompt file: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const lines = Array.isArray(parsed?.systemPrompt)
    ? parsed.systemPrompt.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (!lines.length) {
    throw new Error(`Prompt file khong co systemPrompt hop le: ${filePath}`);
  }
  return {
    filePath,
    fileName: filePath.split(/[/\\]/).pop() || "",
    name: String(parsed?.name || ""),
    description: String(parsed?.description || ""),
    systemPromptLines: lines
  };
}

async function getChatGptVipAccessPromptBundle(useKnowledgeBase = false) {
  await importAllLegacyOnce();
  ensureChatGptVipAccessPromptFiles();
  const normal = await loadPromptFromDbOrFile("normal");
  const database = await loadPromptFromDbOrFile("database");
  const active = useKnowledgeBase ? database : normal;
  return { normal, database, active };
}

async function getChatGptVipAccessSystemPrompt(useKnowledgeBase) {
  const bundle = await getChatGptVipAccessPromptBundle(useKnowledgeBase);
  return bundle.active.systemPromptLines.join(" ");
}

function getChatGptVipAccessLanguageInstruction(useKnowledgeBase = false) {
  if (useKnowledgeBase) return "";
  return "Bat buoc tra loi bang tieng Viet co dau. Chi dung ngon ngu khac neu nguoi dung yeu cau ro rang.";
}

async function getChatGptVipAccessPlainTextInstruction() {
  const lines = await loadChatGptVipAccessPlainTextInstruction();
  return lines.join(" ");
}

async function loadChatGptVipAccessPlainTextInstruction() {
  await importAllLegacyOnce();
  ensureChatGptVipAccessDriveTree();
  const key = "chat-gpt-vip-access-plain-text-instruction";
  const filePath = getChatGptVipAccessPlainTextInstructionFile();

  const existing = await kvGetJson(key, null);
  if (existing && Array.isArray(existing?.lines)) {
    return existing.lines.map((line) => String(line || "").trim()).filter(Boolean);
  }

  if (!fs.existsSync(filePath)) {
    const defaults = [
      "Giu doan van ro rang, moi y mot dong/1 doan ngan.",
      "OUTPUT: Trinh bay ro rang de hieu, co the them icon de giai thich, va lay thien cam, khong co cac ki tuc dac biet nhu *#."
    ];
    await kvSetJson(key, { lines: defaults });
    return defaults;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const lines = Array.isArray(parsed?.lines)
    ? parsed.lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  await kvSetJson(key, { lines });
  return lines;
}

async function updateChatGptVipAccessPlainTextInstruction(lines) {
  await importAllLegacyOnce();
  ensureChatGptVipAccessDriveTree();
  const normalized = Array.isArray(lines)
    ? lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  if (!normalized.length) {
    throw new Error("Instruction khong duoc de trong.");
  }
  await kvSetJson("chat-gpt-vip-access-plain-text-instruction", { lines: normalized });
  return normalized;
}

async function resetChatGptVipAccessPlainTextInstruction() {
  await importAllLegacyOnce();
  const defaults = [
    "Giu doan van ro rang, moi y mot dong/1 doan ngan.",
    "OUTPUT: Trinh bay ro rang de hieu, co the them icon de giai thich, va lay thien cam, khong co cac ki tuc dac biet nhu *#."
  ];
  await kvSetJson("chat-gpt-vip-access-plain-text-instruction", { lines: defaults });
  return defaults;
}

function compactHistory(history = []) {
  const safeHistory = Array.isArray(history)
    ? history
        .filter((item) => (item?.role === "user" || item?.role === "assistant") && String(item?.content || "").trim())
        .map((item) => ({
          role: item.role,
          content: String(item.content).trim()
        }))
    : [];
  return safeHistory;
}

async function getChatGptVipAccessPromptConfig(useKnowledgeBase = false) {
  const enabled = Boolean(useKnowledgeBase);
  const bundle = await getChatGptVipAccessPromptBundle(enabled);
  return {
    mode: enabled ? "database" : "normal",
    model: getChatGptVipAccessModel(),
    useKnowledgeBase: enabled,
    activeFileName: bundle.active.fileName,
    activeSystemPrompt: bundle.active.systemPromptLines.join(" "),
    prompts: {
      normal: bundle.normal.systemPromptLines.join(" "),
      database: bundle.database.systemPromptLines.join(" ")
    }
  };
}

async function getChatGptVipAccessActivePromptFile(useKnowledgeBase = false) {
  const enabled = Boolean(useKnowledgeBase);
  const bundle = await getChatGptVipAccessPromptBundle(enabled);
  return {
    mode: enabled ? "database" : "normal",
    useKnowledgeBase: enabled,
    fileName: bundle.active.fileName,
    filePath: bundle.active.filePath,
    prompt: {
      name: bundle.active.name,
      description: bundle.active.description,
      systemPrompt: bundle.active.systemPromptLines
    }
  };
}

async function buildChatGptVipAccessInput(question, history = [], knowledgeContext = "", useKnowledgeBase = false) {
  const safeHistory = compactHistory(history);
  const safeQuestion = String(question || "").trim();
  const safeKnowledgeContext = useKnowledgeBase ? String(knowledgeContext || "").trim() : "";

  return [
    {
      role: "system",
      content: await getChatGptVipAccessSystemPrompt(useKnowledgeBase)
    },
    {
      role: "system",
      content: await getChatGptVipAccessPlainTextInstruction()
    },
    ...(getChatGptVipAccessLanguageInstruction(useKnowledgeBase)
      ? [{ role: "system", content: getChatGptVipAccessLanguageInstruction(useKnowledgeBase) }]
      : []),
    ...safeHistory,
    {
      role: "user",
      content: [
        safeQuestion,
        safeKnowledgeContext ? `Ngu canh kho tri thuc ChatGptVipAccess:\n${safeKnowledgeContext}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
}

async function buildChatGptVipAccessRichInput({
  question,
  history = [],
  images = [],
  attachmentsText = "",
  knowledgeContext = "",
  useKnowledgeBase = false
}) {
  const safeHistory = compactHistory(history);

  const userContent = [];
  const userTextParts = [String(question || "").trim()].filter(Boolean);
  const knowledgeBlock = useKnowledgeBase ? String(knowledgeContext || "").trim() : "";
  if (knowledgeBlock) {
    userTextParts.push(`Ngu canh kho tri thuc ChatGptVipAccess:\n${knowledgeBlock}`);
  }
  const attachmentBlock = String(attachmentsText || "").trim();
  if (attachmentBlock) {
    userTextParts.push(`Tai lieu dinh kem (trich xuat):\n${attachmentBlock}`);
  }
  userContent.push({
    type: "input_text",
    text: userTextParts.join("\n\n")
  });

  (Array.isArray(images) ? images : [])
    .filter((it) => typeof it === "string" && it.startsWith("data:image/"))
    .slice(0, 5)
    .forEach((dataUrl) => {
      userContent.push({
        type: "input_image",
        image_url: dataUrl
      });
    });

  return [
    {
      role: "system",
      content: await getChatGptVipAccessSystemPrompt(useKnowledgeBase)
    },
    {
      role: "system",
      content: await getChatGptVipAccessPlainTextInstruction()
    },
    ...(getChatGptVipAccessLanguageInstruction(useKnowledgeBase)
      ? [{ role: "system", content: getChatGptVipAccessLanguageInstruction(useKnowledgeBase) }]
      : []),
    ...safeHistory,
    {
      role: "user",
      content: userContent
    }
  ];
}

async function askChatGptVipAccess({ question, history, knowledgeContext = "", useKnowledgeBase = false }) {
  const provider = getChatGptVipAccessProvider();
  if (provider !== "localai") {
    const apiKey = String(getRuntimeConfig()?.openai?.apiKey || "").trim();
    if (!apiKey) {
      throw new Error("Chua cau hinh OPENAI_API_KEY.");
    }
  }

  const input = await buildChatGptVipAccessInput(question, history, knowledgeContext, useKnowledgeBase);
  const model = getChatGptVipAccessModel();
  const { answer, usage, completion } = await callChatAPI({
    model,
    input
  });

  return {
    model: completion?.model || model,
    answer,
    usage,
    request: {
      question: String(question || "").trim(),
      historyLength: Array.isArray(history) ? history.length : 0,
      useKnowledgeBase: Boolean(useKnowledgeBase),
      knowledgeContextLength: String(knowledgeContext || "").trim().length
    },
    response: {
      answer
    },
    requestRaw: {
      model,
      input
    },
    responseRaw: completion
  };
}

async function askChatGptVipAccessRich({
  question,
  history,
  images,
  attachmentsText,
  knowledgeContext = "",
  useKnowledgeBase = false
}) {
  const provider = getChatGptVipAccessProvider();
  if (provider !== "localai") {
    const apiKey = String(getRuntimeConfig()?.openai?.apiKey || "").trim();
    if (!apiKey) {
      throw new Error("Chua cau hinh OPENAI_API_KEY.");
    }
  }

  const input = await buildChatGptVipAccessRichInput({
    question,
    history,
    images,
    attachmentsText,
    knowledgeContext,
    useKnowledgeBase
  });
  const model = getChatGptVipAccessModel();
  const { answer, usage, completion } = await callChatAPI({
    model,
    input
  });

  return {
    model: completion?.model || model,
    answer,
    usage,
    request: {
      question: String(question || "").trim(),
      historyLength: Array.isArray(history) ? history.length : 0,
      imageCount: Array.isArray(images) ? images.length : 0,
      attachmentsTextLength: String(attachmentsText || "").trim().length,
      useKnowledgeBase: Boolean(useKnowledgeBase),
      knowledgeContextLength: String(knowledgeContext || "").trim().length
    },
    response: {
      answer
    },
    requestRaw: {
      model,
      input
    },
    responseRaw: completion
  };
}

module.exports = {
  askChatGptVipAccess,
  askChatGptVipAccessRich,
  getChatGptVipAccessPromptFiles,
  getChatGptVipAccessPromptConfig,
  getChatGptVipAccessActivePromptFile,
  resetChatGptVipAccessPromptFile,
  updateChatGptVipAccessPromptFile,
  loadChatGptVipAccessPlainTextInstruction,
  updateChatGptVipAccessPlainTextInstruction,
  resetChatGptVipAccessPlainTextInstruction
};






