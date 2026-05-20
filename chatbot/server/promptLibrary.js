const fs = require("fs");
const path = require("path");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const PROMPT_LIBRARY_KEY = "prompts";
const PROMPT_PROVIDER_KEYS = ["openai", "localai"];
const PROMPT_SCHEMA_VERSION = 2;
const {
  compileSystemPrompt,
  getPromptMode,
  CONVERSATION_SETUP_FILE,
  PROMPTS_DIR
} = require("./promptCompiler");
const COMPILED_PROMPT_CACHE_FILE = path.join(PROMPTS_DIR, ".compiled-prompt-cache.txt");

function readLegacySystemPrompt() {
  return compileSystemPrompt();
}

function buildPromptItem({ id, title, content, createdAt, updatedAt }) {
  return {
    id,
    title: String(title || "").trim() || "Prompt mac dinh",
    content: String(content || "").trim(),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString()
  };
}

function createDefaultPromptLibrary() {
  const now = new Date().toISOString();
  const defaultPrompt = buildPromptItem({
    id: "prompt-default",
    title: "Prompt mac dinh",
    content: readLegacySystemPrompt(),
    createdAt: now,
    updatedAt: now
  });

  return {
    updatedAt: now,
    activePromptId: defaultPrompt.id,
    prompts: [defaultPrompt]
  };
}

function normalizePromptProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!PROMPT_PROVIDER_KEYS.includes(provider)) {
    throw new Error("provider phai la openai hoac localai (query/body hoac LLM_PROVIDER trong private/.env).");
  }
  return provider;
}

function buildDefaultPromptLibraries() {
  const base = createDefaultPromptLibrary();
  const buildProfile = (provider) => ({
    provider,
    version: "1.0.0",
    updatedAt: base.updatedAt,
    schemaVersion: PROMPT_SCHEMA_VERSION
  });
  return {
    updatedAt: base.updatedAt,
    schemaVersion: PROMPT_SCHEMA_VERSION,
    providers: {
      openai: {
        ...base,
        profile: buildProfile("openai")
      },
      localai: {
        ...base,
        activePromptId: base.activePromptId,
        prompts: base.prompts.map((item) => ({
          ...item,
          id: `localai-${item.id}`,
          title: `${item.title} (Local AI)`
        })),
        profile: buildProfile("localai")
      }
    }
  };
}

function bumpPatchVersion(version) {
  const [a, b, c] = String(version || "1.0.0")
    .split(".")
    .map((x) => Number(x || 0));
  return `${Number(a || 1)}.${Number(b || 0)}.${Number(c || 0) + 1}`;
}

function syncActivePromptToSystemFile(promptLibrary) {
  const activePrompt = (promptLibrary.prompts || []).find((item) => item.id === promptLibrary.activePromptId);
  const content = activePrompt?.content || compileSystemPrompt();
  try {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    fs.writeFileSync(COMPILED_PROMPT_CACHE_FILE, content, "utf8");
  } catch (_) {
    /* file-only mode uses promptCompiler; DB sync is best-effort */
  }
}

async function ensurePromptLibrary() {
  await importAllLegacyOnce();
  const existing = await kvGetJson(PROMPT_LIBRARY_KEY, null);
  if (existing && typeof existing === "object") {
    if (existing.providers && typeof existing.providers === "object") return;
    if (Array.isArray(existing.prompts)) {
      const openaiLibrary = normalizePromptLibrary(existing);
      const localaiLibrary = normalizePromptLibrary(createDefaultPromptLibrary());
      localaiLibrary.profile.provider = "localai";
      const migrated = {
        updatedAt: existing.updatedAt || new Date().toISOString(),
        providers: {
          openai: openaiLibrary,
          localai: localaiLibrary
        }
      };
      await kvSetJson(PROMPT_LIBRARY_KEY, migrated);
      syncActivePromptToSystemFile(migrated.providers.openai);
      return;
    }
  }
  const payload = buildDefaultPromptLibraries();
  await kvSetJson(PROMPT_LIBRARY_KEY, payload);
  syncActivePromptToSystemFile(payload.providers.openai);
}

function normalizePromptLibrary(data) {
  const fallback = createDefaultPromptLibrary();
  const prompts = Array.isArray(data?.prompts) && data.prompts.length
    ? data.prompts.map((prompt, index) =>
        buildPromptItem({
          id: prompt?.id || `prompt-${index + 1}`,
          title: prompt?.title,
          content: prompt?.content,
          createdAt: prompt?.createdAt,
          updatedAt: prompt?.updatedAt
        })
      )
    : fallback.prompts;

  const activePromptId =
    prompts.find((prompt) => prompt.id === data?.activePromptId)?.id || prompts[0].id;

  return {
    updatedAt: data?.updatedAt || fallback.updatedAt,
    activePromptId,
    prompts,
    profile: {
      provider: normalizePromptProvider(data?.profile?.provider || "openai"),
      version: String(data?.profile?.version || "1.0.0"),
      updatedAt: data?.profile?.updatedAt || data?.updatedAt || fallback.updatedAt,
      schemaVersion: PROMPT_SCHEMA_VERSION
    }
  };
}

async function loadPromptLibrary(provider = "openai") {
  await ensurePromptLibrary();
  const raw = await kvGetJson(PROMPT_LIBRARY_KEY, buildDefaultPromptLibraries());
  const targetProvider = normalizePromptProvider(provider);
  const providerPayload = raw?.providers?.[targetProvider];
  if (!providerPayload || typeof providerPayload !== "object") {
    const fallback = normalizePromptLibrary(createDefaultPromptLibrary());
    fallback.profile.provider = targetProvider;
    return fallback;
  }
  const normalized = normalizePromptLibrary(providerPayload);
  normalized.profile.provider = targetProvider;
  return normalized;
}

async function savePromptLibrary(library, provider = "openai") {
  const targetProvider = normalizePromptProvider(provider);
  const normalized = normalizePromptLibrary(library);
  normalized.profile = {
    provider: targetProvider,
    version: bumpPatchVersion(normalized?.profile?.version || "1.0.0"),
    updatedAt: new Date().toISOString(),
    schemaVersion: PROMPT_SCHEMA_VERSION
  };
  const raw = await kvGetJson(PROMPT_LIBRARY_KEY, buildDefaultPromptLibraries());
  const payload = {
    updatedAt: new Date().toISOString(),
    schemaVersion: PROMPT_SCHEMA_VERSION,
    providers: {
      openai: normalizePromptLibrary(raw?.providers?.openai || createDefaultPromptLibrary()),
      localai: normalizePromptLibrary(raw?.providers?.localai || createDefaultPromptLibrary())
    }
  };
  payload.providers[targetProvider] = normalized;
  await kvSetJson(PROMPT_LIBRARY_KEY, payload);
  if (targetProvider === "openai") {
    syncActivePromptToSystemFile(normalized);
  }
  return normalized;
}

async function getActivePrompt(provider = "openai") {
  const library = await loadPromptLibrary(provider);
  return library.prompts.find((prompt) => prompt.id === library.activePromptId) || library.prompts[0];
}

async function getActivePromptContent(provider = "openai") {
  void provider;
  return compileSystemPrompt();
}

async function createPrompt({ title, content, provider = "openai" }) {
  const library = await loadPromptLibrary(provider);
  const now = new Date().toISOString();
  const prompt = buildPromptItem({
    id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    createdAt: now,
    updatedAt: now
  });

  const nextLibrary = {
    ...library,
    updatedAt: now,
    prompts: [prompt, ...library.prompts]
  };

  return await savePromptLibrary(nextLibrary, provider);
}

async function updatePrompt(promptId, { title, content, provider = "openai" }) {
  const library = await loadPromptLibrary(provider);
  const promptExists = library.prompts.some((prompt) => prompt.id === promptId);

  if (!promptExists) {
    throw new Error("Khong tim thay prompt.");
  }

  const nextLibrary = {
    ...library,
    updatedAt: new Date().toISOString(),
    prompts: library.prompts.map((prompt) =>
      prompt.id === promptId
        ? buildPromptItem({
            ...prompt,
            title,
            content,
            updatedAt: new Date().toISOString()
          })
        : prompt
    )
  };

  return await savePromptLibrary(nextLibrary, provider);
}

async function deletePrompt(promptId, provider = "openai") {
  const library = await loadPromptLibrary(provider);

  if (library.prompts.length <= 1) {
    throw new Error("Phai giu lai it nhat 1 prompt.");
  }

  const nextPrompts = library.prompts.filter((prompt) => prompt.id !== promptId);

  if (nextPrompts.length === library.prompts.length) {
    throw new Error("Khong tim thay prompt.");
  }

  const nextLibrary = {
    ...library,
    updatedAt: new Date().toISOString(),
    activePromptId:
      library.activePromptId === promptId ? nextPrompts[0].id : library.activePromptId,
    prompts: nextPrompts
  };

  return await savePromptLibrary(nextLibrary, provider);
}

async function setActivePrompt(promptId, provider = "openai") {
  const library = await loadPromptLibrary(provider);

  if (!library.prompts.some((prompt) => prompt.id === promptId)) {
    throw new Error("Khong tim thay prompt.");
  }

  return await savePromptLibrary({
    ...library,
    updatedAt: new Date().toISOString(),
    activePromptId: promptId
  }, provider);
}

// ---------------------------
// File-only prompt mode
// ---------------------------
const SINGLE_PROMPT_ID = "prompt-file-system";
const FILE_ONLY_MESSAGE =
  "Prompt DB da tat. Dung conversationSetup + rulesHub + cases.compact (+ monthlyPromotions) — promptCompiler.js tu dong noi khi load.";

function buildFileOnlyPrompt(provider = "openai") {
  const stat = fs.existsSync(CONVERSATION_SETUP_FILE) ? fs.statSync(CONVERSATION_SETUP_FILE) : null;
  const updatedAt = stat?.mtime ? stat.mtime.toISOString() : new Date().toISOString();
  return {
    id: SINGLE_PROMPT_ID,
    title: "System prompt (file-only)",
    content: readLegacySystemPrompt(),
    createdAt: updatedAt,
    updatedAt
  };
}

async function fileOnlyLoadPromptLibrary(provider = "openai") {
  const normalizedProvider = normalizePromptProvider(provider);
  const prompt = buildFileOnlyPrompt(normalizedProvider);
  return {
    updatedAt: prompt.updatedAt,
    activePromptId: prompt.id,
    prompts: [prompt],
    profile: {
      provider: normalizedProvider,
      version: "file-only",
      updatedAt: prompt.updatedAt,
      schemaVersion: PROMPT_SCHEMA_VERSION
    }
  };
}

async function fileOnlyGetActivePrompt(provider = "openai") {
  normalizePromptProvider(provider);
  return buildFileOnlyPrompt(provider);
}

async function fileOnlyGetActivePromptContent(_provider = "openai") {
  return readLegacySystemPrompt();
}

async function fileOnlyUpdatePrompt(_promptId, { content } = {}) {
  const next = String(content || "").trim();
  if (!next) {
    throw new Error("Noi dung prompt khong duoc de trong.");
  }
  throw new Error(
    `${FILE_ONLY_MESSAGE} Chinh sua truc tiep conversationSetup.txt, rulesHub.txt, cases.compact.xml trong thu muc prompts/.`
  );
}

async function fileOnlyCreatePrompt() {
  throw new Error(FILE_ONLY_MESSAGE);
}

async function fileOnlyDeletePrompt() {
  throw new Error(FILE_ONLY_MESSAGE);
}

async function fileOnlySetActivePrompt() {
  throw new Error(FILE_ONLY_MESSAGE);
}

module.exports = {
  createPrompt: fileOnlyCreatePrompt,
  deletePrompt: fileOnlyDeletePrompt,
  getActivePrompt: fileOnlyGetActivePrompt,
  getActivePromptContent: fileOnlyGetActivePromptContent,
  getPromptMode,
  loadPromptLibrary: fileOnlyLoadPromptLibrary,
  normalizePromptProvider,
  setActivePrompt: fileOnlySetActivePrompt,
  updatePrompt: fileOnlyUpdatePrompt,
  compileSystemPrompt
};





