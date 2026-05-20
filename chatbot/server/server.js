const fs = require("fs");
const path = require("path");
const { randomBytes } = require("node:crypto");
const { chatbotDbFile, DATABASE_ROOT } = require("./dbPaths");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const ExcelJS = require("exceljs");
const dotenv = require("dotenv");
const { EventEmitter } = require("events");

const {
  importAllSheetsFromXlsx,
  importFromGoogleSheet,
  importFromXlsx
} = require("./importers");
const {
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
} = require("./knowledgeBaseV2");
const {
  askOpenAI,
  embedText,
  embedTexts
} = require("../../shared/openai/openaiClient");
const { loadUsageLog, clearUsageLog } = require("./usageLogger");
const {
  buildFacebookMessengerParticipantId,
  parseFacebookMessengerParticipantId
} = require("./facebookMessengerParticipantId");
const {
  CARE_STATUS,
  appendChatMessage,
  appendSystemChatMessage,
  appendCareStatusChangeMessage,
  clearChatHistory,
  clearConversationById,
  conversationAllowsBotReply,
  deriveCustomerIntakeFromMessages,
  deriveMessengerProfileFullName,
  getConversationById,
  loadChatHistory,
  saveChatHistory,
  markConversationAsRead,
  normalizeConversationCareStatus,
  updateConversationInbox,
  updateConversationCareStatus,
  updateConversationCustomerIntake,
  updateConversationMirrorProfile,
  normalizeCustomerIntake,
  upsertConversationProfile
} = require("./chatHistory");
const { normalizeCollected, isValidVietnamPhone } = require("./botStructuredOutput");
const {
  buildIntakeRuntimeMarkdown,
  buildSessionSummaryMarkdown
} = require("./runtimePromptBlocks");
const { getPromptMode } = require("./promptLibrary");

function historyParticipantIdFromExtra(extraRequestData) {
  const ch = String(extraRequestData?.channel || "").trim();
  const raw = String(extraRequestData?.senderId || extraRequestData?.testChatId || "").trim();
  if (!raw) return "";
  if (ch === "facebook-messenger") {
    const pageId = String(extraRequestData?.facebookPageId || "").trim();
    if (pageId) return buildFacebookMessengerParticipantId(pageId, raw);
  }
  return raw;
}

function collectedSnapshotHasData(c) {
  if (!c || typeof c !== "object") return false;
  if (String(c.notes || "").trim()) return true;
  const p = c.patient || {};
  return [
    "fullName",
    "phone",
    "regionLive",
    "preferredOfficeKey",
    "shuttlePickup",
    "preferredVisitDate",
    "preferredVisitTime"
  ].some((k) => String(p[k] || "").trim());
}
const {
  syncClinicAppointmentsForRange,
  listClinicAppointments,
  listClinicAppointmentsForRangeGrouped,
  getClinicAppointmentSyncMeta,
  buildOccupiedSlotsMarkdownForOffice,
  CLINIC_RECEPTION_HOURS,
  DEFAULT_RANGE_DAYS,
  defaultRangeFromToday,
  addDaysYmd
} = require("./clinicAppointmentsStore");
const { listClinicFacilities, buildFacilitiesMarkdownBlock } = require("./clinicFacilities");
const {
  BOOKING_STATUS,
  buildBookingContextMarkdownForConversation,
  createBookingRequest,
  getBookingRequestById,
  listBookingRequests,
  markBookingRequestZaloNotified,
  updateBookingRequestStatus
} = require("./bookingStore");
const {
  BUG_TASK_PRIORITY,
  BUG_TASK_SEVERITY,
  BUG_TASK_STATUS,
  addBugTaskComment,
  createBugTask,
  getBugTaskById,
  listBugTasks,
  normalizeAttachments,
  updateBugTask
} = require("./bugBoardStore");
const zaloPersonalClient = require("../../tools/windowsshell/server/zaloNotifyHub");
const { claimProviderMessageId } = require("./messageDedupe");
const { listChatModelsWithEstimates, isKnownChatModelId } = require("../../shared/openai/openaiModelsCatalog");
const { beginBotReply, endBotReply, getBotReplyStatus } = require("./botReplyStatus");
const {
  askChatGptVipAccess,
  askChatGptVipAccessRich,
  getChatGptVipAccessPromptConfig,
  getChatGptVipAccessActivePromptFile,
  getChatGptVipAccessPromptFiles,
  resetChatGptVipAccessPromptFile,
  updateChatGptVipAccessPromptFile,
  loadChatGptVipAccessPlainTextInstruction,
  updateChatGptVipAccessPlainTextInstruction,
  resetChatGptVipAccessPlainTextInstruction
} = require("../../tools/singae-assistant/server/chatGptVipAccessClient");
const {
  appendChatGptVipAccessMessage,
  clearChatGptVipAccessHistory,
  getChatGptVipAccessConversationByUsername,
  clearChatGptVipAccessConversationByUsername,
  getAllChatGptVipAccessConversations
} = require("../../tools/singae-assistant/server/chatGptVipAccessHistory");
const {
  addChatGptVipAccessKnowledgeEntry,
  clearChatGptVipAccessKnowledgeBase,
  deleteChatGptVipAccessKnowledgeEntry,
  loadChatGptVipAccessKnowledgeBase,
  replaceChatGptVipAccessKnowledgeBaseBySheets,
  updateChatGptVipAccessKnowledgeEntry
} = require("../../tools/singae-assistant/server/chatGptVipAccessKnowledgeBase");
const {
  DRIVE_NAMES,
  ensureChatGptVipAccessDriveTree,
  getDriveRoot,
  getChatGptVipAccessUploadsDir,
  migrateLegacyChatGptVipAccessFiles
} = require("../../tools/singae-assistant/server/chatGptVipAccessStorage");
const { getDesktopShellCache, setDesktopShellCache } = require("../../tools/windowsshell/server/windowsShellStorage");
const {
  getFacebookMessengerConfig,
  getFacebookPageAccessTokenForPage,
  getFacebookPageLabelName,
  readFacebookOauthRuntimeV2,
  getRuntimeConfig,
  requireChatbotLlmProvider
} = require("./channelConfig");
const {
  getFacebookPageBotReplyPolicy,
  POLICY_SKIP_MESSAGES
} = require("./facebookPageSettings");
const {
  createPrompt,
  deletePrompt,
  getActivePrompt,
  loadPromptLibrary,
  normalizePromptProvider,
  setActivePrompt,
  updatePrompt
} = require("./promptLibrary");
const {
  isFacebookConfigured,
  processFacebookWebhook,
  verifyFacebookWebhook,
  resolveFacebookWebhookPageId,
  sendFacebookMessage,
  sendFacebookMediaMessage
} = require("./facebookMessenger");
const { getFacebookUserProfile } = require("./facebookMessenger");
const { registerFacebookOAuthProxyRoutes } = require("./facebookOAuthProxy");
const { fetchVpsFacebookOauthStatus } = require("./facebookOAuthProxy");
const {
  syncFacebookOauthFromVps,
  canSyncFromVps
} = require("../../lib/facebookOauthSync");
const {
  isFacebookFallbackParticipantLabel,
  resolveFacebookSenderProfile
} = require("./facebookSenderProfile");
const { isActiveChatbotChannel } = require("./channels/activeChannels");
const {
  appendServerLog,
  clearServerLogs,
  createRequestLoggerMiddleware,
  getServerLogs,
  getChatbotLogMode,
  installConsoleCapture,
  openServerLogStream
} = require("./serverLogs");
const { resolveAvatarCacheFile } = require("./avatarCache");
const {
  registerOnlineRequest,
  getOnlineSnapshot,
  getOnlineIpEventHistory
} = require("./onlinePresence");
const {
  getUserBySessionToken
} = require("../../tools/windowsshell/server/authStore");
const {
  clearHistoryMemory,
  retrieveConversationMemory,
  upsertConversationMemory
} = require("./historyMemory");
const { getCurrentVersion, incrementAndSaveVersion } = require("./versionManager");
const {
  logApiCall,
  logOpenAICall,
  logChatInteraction,
  logCost,
  logError,
  logPerformance,
  logConfigChange
} = require("./fileLogger");

const CHATBOT_KB_SOURCE_FILE = path.join(__dirname, "..", "data", "knowledge-rang-su-faq.json");

const LOCAL_ENV_FILE = path.join(__dirname, "..", "..", "..", "private", ".env");
dotenv.config({ path: LOCAL_ENV_FILE });
dotenv.config();
installConsoleCapture();

const DEFAULT_CHAT_GPT_VIP_ACCESS_USERNAMES = Array.from({ length: 10 }, (_, index) => `singae11${String(index).padStart(2, "0")}`);
const DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD = "";
const DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME = "admin";
const DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD = "";
const CHAT_GPT_VIP_ACCESS_ACCOUNTS_ENV_KEY = "CHAT_GPT_VIP_ACCESS_ACCOUNTS";
const CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD_ENV_KEY = "CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD";
const CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME_ENV_KEY = "CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME";
const CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD_ENV_KEY = "CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD";

function buildDefaultChatGptVipAccessAccountsValue() {
  return DEFAULT_CHAT_GPT_VIP_ACCESS_USERNAMES.map((username) => `${username}:${DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD}`).join(",");
}

function normalizeChatGptVipAccessUsername(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const noLeadingAt = raw.replace(/^@+/, "");
  const noDomain = noLeadingAt.replace(/@singae\.vn$/i, "");
  return noDomain || noLeadingAt || raw;
}

function parseChatGptVipAccessAccountsRaw(accountRaw, sharedPassword) {
  const parsedUsers = [];
  const userPasswords = {};
  const pieces = String(accountRaw || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  pieces.forEach((entry) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) {
      const usernameOnly = normalizeChatGptVipAccessUsername(entry);
      if (!usernameOnly) return;
      if (!parsedUsers.includes(usernameOnly)) parsedUsers.push(usernameOnly);
      userPasswords[usernameOnly] = userPasswords[usernameOnly] || String(sharedPassword || "").trim();
      return;
    }
    const username = normalizeChatGptVipAccessUsername(entry.slice(0, separatorIndex));
    const password = String(entry.slice(separatorIndex + 1) || "").trim();
    if (!username) return;
    if (!parsedUsers.includes(username)) parsedUsers.push(username);
    userPasswords[username] = password || String(sharedPassword || "").trim();
  });

  if (parsedUsers.length === 0) {
    DEFAULT_CHAT_GPT_VIP_ACCESS_USERNAMES.forEach((defaultUsername) => {
      const username = normalizeChatGptVipAccessUsername(defaultUsername);
      if (!username) return;
      parsedUsers.push(username);
      userPasswords[username] = String(sharedPassword || DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD).trim();
    });
  }

  return { users: parsedUsers, userPasswords };
}

function buildChatGptVipAccessAccountsEnvValue(users = [], userPasswords = {}, fallbackPassword = DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD) {
  const fallback = String(fallbackPassword || DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD).trim() || DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD;
  return users
    .map((usernameRaw) => normalizeChatGptVipAccessUsername(usernameRaw))
    .filter(Boolean)
    .map((username) => `${username}:${String(userPasswords?.[username] || fallback).trim() || fallback}`)
    .join(",");
}

function escapeRegExp(source) {
  return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertLocalEnvValue(key, value) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("env key is required.");
  const safeValue = String(value ?? "");
  let raw = "";
  try {
    if (fs.existsSync(LOCAL_ENV_FILE)) {
      raw = fs.readFileSync(LOCAL_ENV_FILE, "utf8");
    }
  } catch (_) {
    raw = "";
  }
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(safeKey)}\\s*=.*$`, "m");
  const nextLine = `${safeKey}=${safeValue}`;
  const nextRaw = keyPattern.test(raw)
    ? raw.replace(keyPattern, nextLine)
    : `${raw}${raw.endsWith("\n") || !raw ? "" : "\n"}${nextLine}\n`;
  fs.mkdirSync(path.dirname(LOCAL_ENV_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_ENV_FILE, nextRaw, "utf8");
  process.env[safeKey] = safeValue;
}

function ensureLocalEnvDefaults() {
  const defaults = {
    [CHAT_GPT_VIP_ACCESS_ACCOUNTS_ENV_KEY]: buildDefaultChatGptVipAccessAccountsValue(),
    [CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD_ENV_KEY]: DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD,
    [CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME_ENV_KEY]: DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME,
    [CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD_ENV_KEY]: DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD
  };
  let raw = "";
  try {
    if (fs.existsSync(LOCAL_ENV_FILE)) {
      raw = fs.readFileSync(LOCAL_ENV_FILE, "utf8");
    } else {
      fs.mkdirSync(path.dirname(LOCAL_ENV_FILE), { recursive: true });
    }
  } catch (_) {
    raw = "";
  }

  let output = raw;
  Object.entries(defaults).forEach(([key, value]) => {
    if (process.env[key] && String(process.env[key]).trim()) return;
    const hasKey = new RegExp(`^\\s*${key}\\s*=`, "m").test(output);
    if (!hasKey) {
      output = `${output}${output.endsWith("\n") || !output ? "" : "\n"}${key}=${value}\n`;
    }
    process.env[key] = value;
  });

  if (output !== raw) {
    fs.writeFileSync(LOCAL_ENV_FILE, output, "utf8");
  }
}

function getChatGptVipAccessAccountsConfig() {
  let envFromFile = {};
  try {
    if (fs.existsSync(LOCAL_ENV_FILE)) {
      envFromFile = dotenv.parse(fs.readFileSync(LOCAL_ENV_FILE, "utf8"));
    }
  } catch (_) {
    envFromFile = {};
  }
  const pick = (key, fallback = "") => {
    const fileValue = String(envFromFile?.[key] || "").trim();
    if (fileValue) return fileValue;
    const processValue = String(process.env?.[key] || "").trim();
    return processValue || fallback;
  };
  const accountRaw = pick(CHAT_GPT_VIP_ACCESS_ACCOUNTS_ENV_KEY, buildDefaultChatGptVipAccessAccountsValue());
  const sharedPassword = pick(CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD_ENV_KEY, DEFAULT_CHAT_GPT_VIP_ACCESS_SHARED_PASSWORD);
  const adminUsername = pick(CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME_ENV_KEY, DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME);
  const adminPassword = pick(CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD_ENV_KEY, DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD);
  const parsedAccounts = parseChatGptVipAccessAccountsRaw(accountRaw, sharedPassword);
  return {
    users: parsedAccounts.users,
    userPasswords: parsedAccounts.userPasswords,
    sharedPassword,
    adminUsername: String(adminUsername || DEFAULT_CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME).trim().toLowerCase(),
    adminPassword
  };
}

ensureLocalEnvDefaults();

function resolveChatGptVipAccessUsername(req) {
  const actorUsername = normalizeChatGptVipAccessUsername(req.authUser?.username);
  if (!actorUsername) throw new Error("Username is required.");
  return actorUsername;
}

function isChatGptVipAccessUsernameError(error) {
  const message = String(error?.message || "");
  return message === "Username is required." || message === "Permission denied for target username.";
}

const WS_AUTH_COOKIE_NAME = "ws_session";
function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = String(part.slice(0, idx) || "").trim();
    const value = String(part.slice(idx + 1) || "").trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

async function requireWindowsShellUser(req, res, next) {
  try {
    const token = String(parseCookies(req)[WS_AUTH_COOKIE_NAME] || "").trim();
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    const user = await getUserBySessionToken(token);
    if (!user?.username) return res.status(401).json({ error: "Session expired." });
    req.authUser = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Auth check failed." });
  }
}

function requireWindowsShellRoles(roles = []) {
  const allowed = new Set((Array.isArray(roles) ? roles : []).map((x) => String(x || "").trim().toLowerCase()));
  return (req, res, next) => {
    const role = String(req.authUser?.role || "").trim().toLowerCase();
    if (!allowed.has(role)) return res.status(403).json({ error: "Permission denied." });
    return next();
  };
}

function emitChatGptVipAccessMessageEvent(username, phase = "updated") {
  const user = String(username || "").trim().toLowerCase();
  if (!user) return;
  const payload = {
    type: "chat_gpt_vip_access_message",
    username: user,
    phase,
    at: new Date().toISOString()
  };
  chatGptVipAccessEvents.emit("message", payload);
  chatGptVipAccessEvents.emit(`message:${user}`, payload);
}

function emitChatHistoryEvent(eventType, conversationId, extra = {}) {
  appendServerLog({
    level: "info",
    source: "chat-history-event",
    message: eventType,
    response: {
      type: eventType,
      conversationId: String(conversationId || ""),
      ...extra
    }
  });
}

const CHANNEL_CONNECTED_WINDOW_MS = 5 * 60 * 1000;
const channelRealtimeState = {
  facebookMessenger: {
    lastEventAt: null
  }
};

async function resolveFacebookConfigured() {
  if (isFacebookConfigured()) return true;
  try {
    const st = await fetchVpsFacebookOauthStatus();
    const hasPages = Number(st?.oauthPageCount || 0) > 0;
    const fb = getFacebookMessengerConfig();
    return Boolean(hasPages && fb.verifyToken);
  } catch (_) {
    return false;
  }
}

async function buildChannelConnectionsSnapshot() {
  const facebookConfigured = await resolveFacebookConfigured();
  const fbLastEventAt = channelRealtimeState.facebookMessenger.lastEventAt;
  const fbConnected =
    facebookConfigured &&
    Boolean(fbLastEventAt && Date.now() - new Date(fbLastEventAt).getTime() <= CHANNEL_CONNECTED_WINDOW_MS);
  return {
    facebookMessenger: {
      configured: facebookConfigured,
      connected: fbConnected,
      state: fbConnected ? "connected" : facebookConfigured ? "configured" : "disconnected",
      lastEventAt: fbLastEventAt
    }
  };
}

function emitChannelConnectionsEvent(reason = "updated") {
  buildChannelConnectionsSnapshot()
    .then((channels) => {
      emitChatHistoryEvent("channel_connection_status", "channels", {
        reason,
        channels
      });
    })
    .catch(() => {});
}

let versionInfo = { version: "unknown", lastUpdated: null, startCount: 0 };
const { createLogEntry } = require("./fileLogger");

(async () => {
  try {
    versionInfo = await incrementAndSaveVersion();
    appendServerLog({
      level: "info",
      source: "version-manager",
      message: `Chatbot router loaded with version ${versionInfo.version} (start count: ${versionInfo.startCount})`,
      metadata: versionInfo
    });
    createLogEntry({
      type: "server",
      level: "info",
      source: "server",
      message: `Chatbot router loaded with version ${versionInfo.version}`,
      metadata: versionInfo
    });
    await ensureChatbotKnowledgeBasesFromSourceIfMissing();
  } catch (error) {
    appendServerLog({
      level: "warn",
      source: "version-manager",
      message: `Version init failed: ${error.message || String(error)}`
    });
  }
})();

const router = express.Router();
const chatGptVipAccessEvents = new EventEmitter();
chatGptVipAccessEvents.setMaxListeners(200);

ensureChatGptVipAccessDriveTree();
migrateLegacyChatGptVipAccessFiles();
const uploadsDir = getChatGptVipAccessUploadsDir();
const CHAT_GPT_VIP_ACCESS_CHANNEL = "singae-assistant";
const CHAT_GPT_VIP_ACCESS_PARTICIPANT_ID = "singae-assistant";
const CHAT_GPT_VIP_ACCESS_CONVERSATION_ID = `${CHAT_GPT_VIP_ACCESS_CHANNEL}:${CHAT_GPT_VIP_ACCESS_PARTICIPANT_ID}`;
const CHAT_GPT_VIP_ACCESS_DISPLAY_NAME = "Trợ lý SINGAE";
const SINGAE_LOOKUP_STORE_FILE = chatbotDbFile("singae-lookup-store.json");
const SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT = 40;
const SINGAE_LOOKUP_GETFLY_API_URL =
  process.env.SINGAE_LOOKUP_GETFLY_API_URL || "https://sas9.getflycrm.com/api/v6/accounts";
const SINGAE_LOOKUP_GETFLY_API_KEY =
  process.env.SINGAE_LOOKUP_GETFLY_API_KEY || "";
const SINGAE_LOOKUP_WEBHOOK_URL =
  process.env.SINGAE_LOOKUP_WEBHOOK_URL || "";
const SINGAE_LOOKUP_TIMEOUT_MS = 10000;

function getSingaeLookupConfigIssues() {
  const issues = [];
  const apiUrl = String(SINGAE_LOOKUP_GETFLY_API_URL || "").trim();
  const apiKey = String(SINGAE_LOOKUP_GETFLY_API_KEY || "").trim();
  const webhookUrl = String(SINGAE_LOOKUP_WEBHOOK_URL || "").trim();

  if (!apiUrl) {
    issues.push("SINGAE_LOOKUP_GETFLY_API_URL is missing.");
  } else if (!/^https?:\/\//i.test(apiUrl)) {
    issues.push("SINGAE_LOOKUP_GETFLY_API_URL must be a valid http/https URL.");
  }

  if (!apiKey) {
    issues.push("SINGAE_LOOKUP_GETFLY_API_KEY is missing.");
  } else if (/^https?:\/\//i.test(apiKey)) {
    issues.push("SINGAE_LOOKUP_GETFLY_API_KEY looks like a URL. Put only Getfly API key value.");
  }

  if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
    issues.push("SINGAE_LOOKUP_WEBHOOK_URL must be a valid http/https URL.");
  }

  return issues;
}

if (!SINGAE_LOOKUP_GETFLY_API_KEY) {
  appendServerLog({
    level: "warn",
    source: "env",
    message: "SINGAE_LOOKUP_GETFLY_API_KEY is missing in env."
  });
}

if (!SINGAE_LOOKUP_WEBHOOK_URL) {
  appendServerLog({
    level: "warn",
    source: "env",
    message: "SINGAE_LOOKUP_WEBHOOK_URL is missing in env."
  });
}

const lookupConfigIssues = getSingaeLookupConfigIssues();
if (lookupConfigIssues.length > 0) {
  appendServerLog({
    level: "warn",
    source: "env",
    message: `Singae Lookup config issues: ${lookupConfigIssues.join(" | ")}`
  });
}

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });
const uploadChatGptVipAccess = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 8,
    fileSize: 12 * 1024 * 1024
  }
});

const uploadChatbotMedia = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 25 * 1024 * 1024 // ?nh/video t?i da ~25MB (t�y c?u h�nh)
  }
});
const uploadBugBoardAttachment = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 15 * 1024 * 1024
  }
});
const SUPPORTED_CHAT_GPT_VIP_ACCESS_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

function uploadChatGptVipAccessFiles(req, res, next) {
  uploadChatGptVipAccess.array("files", 8)(req, res, (error) => {
    if (!error) return next();

    const isMulterError = error instanceof multer.MulterError;
    logError({
      source: "chat-gpt-vip-access-upload",
      message: `Upload ChatGptVipAccess files failed: ${error.message}`,
      error,
      metadata: {
        endpoint: "POST /api/singae-assistant/chat-with-files",
        code: error?.code || null
      }
    });

    if (isMulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Kich thuoc tep toi da 12MB." });
      }
      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({ error: "Chi duoc gui toi da 8 tep moi lan." });
      }
      return res.status(400).json({ error: error.message || "Upload tep khong hop le." });
    }
    return res.status(500).json({ error: "Khong the xu ly tep tai len." });
  });
}

function uploadBugBoardAttachmentFile(req, res, next) {
  uploadBugBoardAttachment.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Kich thuoc file toi da 15MB." });
    }
    return res.status(400).json({ error: error.message || "Upload bug attachment failed." });
  });
}

function loadSingaeLookupStore() {
  const file = SINGAE_LOOKUP_STORE_FILE;
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    return { quotas: {}, cache: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      quotas: parsed?.quotas && typeof parsed.quotas === "object" ? parsed.quotas : {},
      cache: parsed?.cache && typeof parsed.cache === "object" ? parsed.cache : {}
    };
  } catch (_) {
    return { quotas: {}, cache: {} };
  }
}

function saveSingaeLookupStore(store) {
  const file = SINGAE_LOOKUP_STORE_FILE;
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store || { quotas: {}, cache: {} }, null, 2), "utf8");
}

function getGmt7DateKey(value = new Date()) {
  const source = value instanceof Date ? value : new Date(value);
  const utcMs = source.getTime() + source.getTimezoneOffset() * 60000;
  const gmt7 = new Date(utcMs + 7 * 60 * 60000);
  return gmt7.toISOString().slice(0, 10);
}

function normalizeLookupUsername(value) {
  return normalizeChatGptVipAccessUsername(value);
}

function normalizeAccountCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isLookupUserAllowed(username) {
  return true;
}

function getLookupQuotaUsage(store, username, dateKey) {
  return Number(store?.quotas?.[dateKey]?.[username] || 0) || 0;
}

function setLookupQuotaUsage(store, username, dateKey, count) {
  if (!store.quotas[dateKey] || typeof store.quotas[dateKey] !== "object") {
    store.quotas[dateKey] = {};
  }
  store.quotas[dateKey][username] = Math.max(0, Number(count) || 0);
}

function getLookupUserCacheBucket(store, username) {
  if (!store.cache[username] || typeof store.cache[username] !== "object") {
    store.cache[username] = {};
  }
  return store.cache[username];
}

function maskPhone(phone) {
  const value = String(phone || "").trim();
  if (!value || value.length < 6) return value;
  return `${value.slice(0, 3)}*****${value.slice(-2)}`;
}

async function sendSingaeLookupWebhook(message) {
  if (!SINGAE_LOOKUP_WEBHOOK_URL) return;
  try {
    await fetch(SINGAE_LOOKUP_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(message || "") })
    });
  } catch (_) {}
}

async function callGetflyAccounts(accountCode, username = "") {
  const endpoint =
    `${SINGAE_LOOKUP_GETFLY_API_URL}?filtering[account_code:eq]=${encodeURIComponent(accountCode)}` +
    "&fields=account_name,account_code,phone_office,relation_name,contacts&limit=4";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SINGAE_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "X-API-KEY": SINGAE_LOOKUP_GETFLY_API_KEY },
      signal: controller.signal
    });
    const text = await response.text();
    appendServerLog({
      level: response.ok ? "info" : "warn",
      source: "singae-lookup",
      message: `Getfly API ${response.status} (${response.ok ? "OK" : "FAILED"})`,
      endpoint,
      method: "GET",
      status: response.status,
      request: { accountCode, username },
      response: { raw: text }
    });
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      return { ok: false, status: response.status, parseError: true, raw: text, endpoint };
    }
    return { ok: response.ok, status: response.status, body, raw: text, endpoint };
  } finally {
    clearTimeout(timer);
  }
}

function removeUploadedFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  fs.unlinkSync(filePath);
}

function toDataUrlFromMulterFile(file) {
  const mimeType = String(file?.mimetype || "").trim();
  if (!mimeType.startsWith("image/")) return null;
  let buffer = null;
  if (file?.buffer && Buffer.isBuffer(file.buffer)) {
    buffer = file.buffer;
  } else if (file?.path && fs.existsSync(file.path)) {
    try {
      buffer = fs.readFileSync(file.path);
    } catch {
      buffer = null;
    }
  }
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function toBufferFromMulterFile(file) {
  if (file?.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer;
  }
  if (file?.path && fs.existsSync(file.path)) {
    try {
      const buffer = fs.readFileSync(file.path);
      if (Buffer.isBuffer(buffer)) return buffer;
    } catch {
      return null;
    }
  }
  return null;
}

function extensionFromMimeType(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (!mime) return "";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/bmp") return ".bmp";
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/ogg") return ".ogg";
  if (mime === "video/ogv") return ".ogv";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "text/plain") return ".txt";
  if (mime === "application/msword") return ".doc";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mime === "application/vnd.ms-excel") return ".xls";
  if (mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
  return "";
}

function cacheChatGptVipAccessAttachment(file) {
  const buffer = toBufferFromMulterFile(file);
  if (!buffer) return null;

  const extByName = path.extname(String(file?.originalname || "")).toLowerCase();
  const ext = extByName || extensionFromMimeType(file?.mimetype);
  const mediaId = `sdm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const cachePath = path.join(uploadsDir, mediaId);
  fs.writeFileSync(cachePath, buffer);
  return {
    mediaId,
    mediaUrl: `/api/singae-assistant/media/${encodeURIComponent(mediaId)}`
  };
}

async function extractTextFromPdfBuffer(buffer) {
  try {
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buffer);
    return String(result?.text || "").trim();
  } catch {
    return "";
  }
}

async function extractTextFromDocxBuffer(buffer) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return String(result?.value || "").trim();
  } catch {
    return "";
  }
}

async function extractTextFromSpreadsheetBuffer(buffer) {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const lines = [];
    wb.worksheets.forEach((sheet) => {
      lines.push(`Sheet: ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
        lines.push(rowValues.map((v) => String(v ?? "")).join(" | "));
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  } catch {
    return "";
  }
}

async function extractAttachmentText(file) {
  const name = String(file?.originalname || "unknown").trim();
  const mimeType = String(file?.mimetype || "").trim().toLowerCase();
  const lowerName = name.toLowerCase();
  const buf = file?.buffer;
  if (!buf || !Buffer.isBuffer(buf)) return "";

  if (mimeType.startsWith("text/") || /\.(txt|md|csv|json|xml|html?)$/i.test(lowerName)) {
    return `File: ${name}\n${buf.toString("utf8").slice(0, 20000)}`;
  }
  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const text = await extractTextFromPdfBuffer(buf);
    return text ? `File: ${name}\n${text.slice(0, 20000)}` : `File: ${name}\n(Khong trich xuat duoc text tu PDF)`;
  }
  if (lowerName.endsWith(".docx")) {
    const text = await extractTextFromDocxBuffer(buf);
    return text ? `File: ${name}\n${text.slice(0, 20000)}` : `File: ${name}\n(Khong trich xuat duoc text tu DOCX)`;
  }
  if (lowerName.endsWith(".doc")) {
    return `File: ${name}\n(Dinh dang .doc cu khong duoc ho tro trich xuat truc tiep, vui long luu thanh .docx)`;
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const text = await extractTextFromSpreadsheetBuffer(buf);
    return text ? `File: ${name}\n${text.slice(0, 25000)}` : `File: ${name}\n(Khong trich xuat duoc text tu Excel)`;
  }
  return `File: ${name}\n(Dinh dang tep chua ho tro trich xuat)`;
}

function sanitizeFolderName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 120);
}

function safeChatGptVipAccessPath(drive = "C", relativePath = "") {
  const driveRoot = getDriveRoot(drive);
  const normalized = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const target = path.resolve(driveRoot, normalized || ".");
  if (!target.startsWith(path.resolve(driveRoot))) {
    throw new Error("Invalid path");
  }
  return target;
}

function listFoldersAtPath(drive = "C", relativePath = "") {
  const currentAbs = safeChatGptVipAccessPath(drive, relativePath);
  fs.mkdirSync(currentAbs, { recursive: true });
  const items = fs.readdirSync(currentAbs, { withFileTypes: true });
  return items
    .map((it) => {
      const abs = path.join(currentAbs, it.name);
      const stat = fs.statSync(abs);
      return {
        name: it.name,
        type: it.isDirectory() ? "folder" : "file",
        size: it.isDirectory() ? null : stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

async function loadDesktopShellCache(username) {
  return await getDesktopShellCache(username);
}

async function saveDesktopShellCache(data, username) {
  await setDesktopShellCache(data || {}, username);
}

function escapeHtmlForAdmin(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminFormResultPage(title, messagePlain, error = false) {
  const color = error ? "#f97373" : "#4ade80";
  const safeTitle = escapeHtmlForAdmin(title);
  const safeMsg = escapeHtmlForAdmin(messagePlain);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} — Quản trị chatbot</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #020617; color: #e5e7eb; padding: 24px; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 640px; margin: 0 auto; background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; padding: 20px; }
    .msg { margin: 0 0 16px; color: ${color}; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="msg">${safeMsg}</p>
    <p><a href="/chatbot-admin-offline.html">← Quản trị</a> · <a href="/">Trang chủ</a></p>
  </div>
</body>
</html>`;
}

function serializeKnowledgeBaseForClient(kb) {
  return {
    schemaVersion: kb.schemaVersion || null,
    embeddingModel: kb.embeddingModel,
    updatedAt: kb.updatedAt,
    retrieval: kb.retrieval || null,
    sources: kb.sources,
    entries: kb.entries.map((entry) => ({
      id: entry.id,
      source: entry.source,
      sourceType: entry.sourceType || "unknown",
      rowNumber: entry.rowNumber,
      record: entry.record,
      text: entry.text
    }))
  };
}

function getProviderEmbeddingModel(provider) {
  const runtimeConfig = getRuntimeConfig();
  if (provider === "localai") {
    return String(runtimeConfig.localai?.embeddingModel || runtimeConfig.localai?.model || "").trim();
  }
  return String(runtimeConfig.openai?.embeddingModel || "").trim();
}

function loadChatbotKnowledgeRowsFromJsonFile() {
  const raw = fs.readFileSync(CHATBOT_KB_SOURCE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("knowledge-rang-su-faq.json phai la mot array.");
  }
  return parsed
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...row }));
}

async function rebuildKnowledgeBaseFromSourceFile({ provider }) {
  const safeProvider = resolveFlowProvider(provider || requireChatbotLlmProvider());
  const rows = loadChatbotKnowledgeRowsFromJsonFile();
  const { knowledgeBase } = await replaceKnowledgeBase({
    sourceName: CHATBOT_KB_SOURCE_FILE,
    sourceType: "json-file",
    rows,
    embedTexts: (texts) => embedTexts(texts, { provider: safeProvider }),
    embeddingModel: getProviderEmbeddingModel(safeProvider),
    namespace: safeProvider
  });
  appendServerLog({
    level: "info",
    source: "knowledge-base",
    message: `Knowledge base rebuilt from source JSON for provider ${safeProvider}.`,
    metadata: {
      provider: safeProvider,
      entries: Array.isArray(knowledgeBase?.entries) ? knowledgeBase.entries.length : 0,
      sourceFile: CHATBOT_KB_SOURCE_FILE
    }
  });
  return knowledgeBase;
}

async function rebuildAllChatbotKnowledgeBasesFromSourceFile() {
  const results = [];
  for (const provider of ["openai", "localai"]) {
    const kb = await rebuildKnowledgeBaseFromSourceFile({ provider });
    results.push({
      provider,
      entries: Array.isArray(kb?.entries) ? kb.entries.length : 0,
      embeddingModel: kb?.embeddingModel || null
    });
  }
  return results;
}

/**
 * Sau pm2 restart: không ép rebuild + embedding toàn bộ KB (dễ block/gây 502).
 * Chỉ import từ JSON nguồn khi namespace đó chưa có entry trong SQLite.
 * Reset tay vẫn dùng POST /database/reset → rebuildAllChatbotKnowledgeBasesFromSourceFile().
 */
async function ensureChatbotKnowledgeBasesFromSourceIfMissing() {
  const results = [];
  for (const provider of ["openai", "localai"]) {
    const kb = await loadKnowledgeBase({ namespace: provider });
    const n = Array.isArray(kb?.entries) ? kb.entries.length : 0;
    if (n === 0) {
      const rebuilt = await rebuildKnowledgeBaseFromSourceFile({ provider });
      const count = Array.isArray(rebuilt?.entries) ? rebuilt.entries.length : 0;
      appendServerLog({
        level: "info",
        source: "knowledge-base",
        message: `Startup KB: namespace ${provider} was empty — rebuilt from source (${count} entries).`,
        metadata: { provider, entries: count, sourceFile: CHATBOT_KB_SOURCE_FILE }
      });
      results.push({ provider, rebuilt: true, entries: count, embeddingModel: rebuilt?.embeddingModel || null });
    } else {
      appendServerLog({
        level: "info",
        source: "knowledge-base",
        message: `Startup KB: namespace ${provider} has ${n} entries — skip rebuild.`,
        metadata: { provider, entries: n }
      });
      results.push({ provider, rebuilt: false, entries: n, embeddingModel: kb?.embeddingModel || null });
    }
  }
  return results;
}

function serializeChatGptVipAccessKnowledgeBaseForClient(kb) {
  return {
    embeddingModel: kb.embeddingModel || null,
    updatedAt: kb.updatedAt || null,
    sources: Array.isArray(kb.sources) ? kb.sources : [],
    entries: (kb.entries || []).map((entry) => ({
      id: entry.id,
      source: entry.source,
      sourceType: entry.sourceType || "unknown",
      topic: entry.topic || "General",
      rowNumber: entry.rowNumber,
      record: entry.record,
      text: entry.text
    }))
  };
}

function parseBooleanFlag(value, defaultValue = true) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

async function buildChatGptVipAccessKnowledgeContext(question, enabled) {
  if (!enabled) return "";
  const kb = await loadChatGptVipAccessKnowledgeBase();
  const entries = Array.isArray(kb?.entries) ? kb.entries : [];
  if (!entries.length) return "";
  const questionEmbeddingResult = await embedText(question);
  const matches = rankEntriesByEmbedding(questionEmbeddingResult.embedding, entries, 10);
  if (!matches.length) return "";
  const filtered = filterEmbeddingMatches(matches, kb?.retrieval || {});
  if (!filtered.length) return "";
  return buildContextFromEntries(filtered, { numbered: true });
}

async function searchChatGptVipAccessKnowledgeEntries(question, enabled, limit = 10) {
  if (!enabled) return [];
  const query = String(question || "").trim();
  if (!query) return [];
  const kb = await loadChatGptVipAccessKnowledgeBase();
  const entries = Array.isArray(kb?.entries) ? kb.entries : [];
  if (!entries.length) return [];
  const questionEmbeddingResult = await embedText(query);
  return rankEntriesByEmbedding(questionEmbeddingResult.embedding, entries, limit).filter(
    (entry) => Number(entry?.similarity || 0) > 0
  );
}

function truncateText(value, maxLength = 800) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function summarizeRequestPayload(payload) {
  if (Array.isArray(payload?.input)) {
    return {
      itemCount: payload.input.length,
      preview: payload.input.slice(0, 3).map((item) => truncateText(item, 300))
    };
  }

  return {
    ...payload,
    context: payload?.context ? truncateText(payload.context, 1500) : payload?.context,
    question: payload?.question ? truncateText(payload.question, 500) : payload?.question
  };
}

function summarizeResponsePayload(payload) {
  return {
    ...payload,
    answer: payload?.answer ? truncateText(payload.answer, 1500) : payload?.answer
  };
}


function serializeUsageLogForClient(data) {
  return {
    summary: data.summary,
    logs: (data.logs || []).map((log) => ({
      id: log.id,
      type: log.type,
      model: log.model,
      createdAt: log.createdAt,
      endpoint: log.endpoint,
      status: log.status,
      usage: log.usage,
      cost: log.cost,
      request: log.request,
      response: log.response,
      requestRaw: log.requestRaw,
      responseRaw: log.responseRaw
    }))
  };
}

function pickAvatarSourceUrl(profile = {}) {
  const candidates = [
    profile.avatarSourceUrl,
    profile.avatarUrl,
    profile.avatar,
    profile.bgavatar
  ];
  for (const candidate of candidates) {
    const url = String(candidate || "").trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

function isLocalAvatarCacheUrl(value) {
  return String(value || "").trim().startsWith("/api/chatbot/avatar-cache/");
}

async function ensureConversationAvatarCached(conversation) {
  if (!conversation || typeof conversation !== "object") return { changed: false, conversation };
  const profile =
    conversation.participantProfile && typeof conversation.participantProfile === "object"
      ? conversation.participantProfile
      : null;
  if (!profile) return { changed: false, conversation };

  const currentCachedUrl = String(profile.avatarCachedUrl || "").trim();
  if (currentCachedUrl) {
    let changed = false;
    const currentAvatarUrl = String(profile.avatarUrl || "").trim();
    const currentSourceUrl = String(profile.avatarSourceUrl || "").trim();
    const currentLegacyAvatar = String(profile.avatar || "").trim();
    if (
      !currentAvatarUrl ||
      currentAvatarUrl === currentSourceUrl ||
      isLocalAvatarCacheUrl(currentAvatarUrl)
    ) {
      if (profile.avatarUrl !== currentCachedUrl) {
        profile.avatarUrl = currentCachedUrl;
        changed = true;
      }
    }
    if (
      !currentLegacyAvatar ||
      currentLegacyAvatar === currentSourceUrl ||
      isLocalAvatarCacheUrl(currentLegacyAvatar)
    ) {
      if (profile.avatar !== currentCachedUrl) {
        profile.avatar = currentCachedUrl;
        changed = true;
      }
    }
    return { changed, conversation };
  }

  const sourceUrl = pickAvatarSourceUrl(profile);
  if (!sourceUrl) return { changed: false, conversation };

  try {
    const cached = await cacheAvatarFromUrl(sourceUrl);
    if (!cached?.cachedUrl) return { changed: false, conversation };
    const nextAvatarUrl = String(profile.avatarUrl || "").trim();
    const nextLegacyAvatar = String(profile.avatar || "").trim();
    profile.avatarSourceUrl = String(profile.avatarSourceUrl || "").trim() || sourceUrl;
    profile.avatarCachedUrl = cached.cachedUrl;
    if (!nextAvatarUrl || nextAvatarUrl === sourceUrl || isLocalAvatarCacheUrl(nextAvatarUrl)) {
      profile.avatarUrl = cached.cachedUrl;
    }
    if (!nextLegacyAvatar || nextLegacyAvatar === sourceUrl || isLocalAvatarCacheUrl(nextLegacyAvatar)) {
      profile.avatar = cached.cachedUrl;
    }
    conversation.participantProfile = profile;
    return { changed: true, conversation };
  } catch (_) {
    return { changed: false, conversation };
  }
}

async function prepareChatHistoryForClient(_data, channel, facebookPageId = "") {
  const payload = await loadChatHistory();
  const normalizedChannel = String(channel || "").trim();
  const pageFilter = String(facebookPageId || "").trim();
  const activeConversations = (payload.conversations || []).filter((conversation) => {
    if (normalizedChannel) return conversation.channel === normalizedChannel;
    return isActiveChatbotChannel(conversation.channel);
  }).filter((conversation) => {
    if (!pageFilter) return true;
    if (conversation.channel !== "facebook-messenger") return false;
    const convPage = String(conversation.facebookMessengerPageId || "").trim();
    const fromParticipant = parseFacebookMessengerParticipantId(conversation.participantId).pageId;
    const effectivePage = convPage || fromParticipant || "";
    return effectivePage === pageFilter;
  });

  let hasChanges = false;
  await Promise.all(
    activeConversations.map(async (conversation) => {
      const result = await ensureConversationAvatarCached(conversation);
      if (result.changed) hasChanges = true;
    })
  );

  if (hasChanges && Array.isArray(payload.conversations)) {
    payload.updatedAt = new Date().toISOString();
    await saveChatHistory(payload);
  }

  return serializeChatHistoryForClient(payload, channel, facebookPageId);
}

function serializeChatHistoryForClient(data, channel, facebookPageId = "") {
  const normalizedChannel = String(channel || "").trim();
  const pageFilter = String(facebookPageId || "").trim();
  const conversations = (data.conversations || [])
    .filter((conversation) => {
      if (normalizedChannel) return conversation.channel === normalizedChannel;
      return isActiveChatbotChannel(conversation.channel);
    })
    .filter((conversation) => {
      if (!pageFilter) return true;
      if (conversation.channel !== "facebook-messenger") return false;
      const convPage = String(conversation.facebookMessengerPageId || "").trim();
      const fromParticipant = parseFacebookMessengerParticipantId(conversation.participantId).pageId;
      const effectivePage = convPage || fromParticipant || "";
      return effectivePage === pageFilter;
    })
    .map((conversation) => {
      const messages = (conversation.messages || []).map((message) => ({
        id: message.id,
        direction: message.direction,
        role:
          message.role ||
          (message.direction === "incoming"
            ? "user"
            : message.direction === "system"
              ? "system"
              : "assistant"),
        text: message.text,
        createdAt: message.createdAt,
        seenAt: message.seenAt || null,
        readAt: message.readAt || null,
        providerMessageId: message.providerMessageId || null,
        metadata: message.metadata || {}
      }));
      
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      const lastCustomerMessage = [...messages].reverse().find((msg) => msg?.direction === "incoming") || null;
      
      const unreadCount = Array.isArray(messages) 
        ? messages.filter(msg => 
            msg && msg.direction === "incoming" && !msg.readAt
          ).length
        : 0;
      
      return {
        id: conversation.id,
        channel: conversation.channel,
        platform:
          conversation.platform ||
          (isActiveChatbotChannel(conversation.channel) ? "facebook" : "unknown"),
        participantId: conversation.participantId,
        facebookMessengerPageId: conversation.facebookMessengerPageId || null,
        facebookMessengerPageName: conversation.facebookMessengerPageName || null,
        participantLabel: conversation.participantLabel,
        participantProfile: conversation.participantProfile || {
          name: conversation.participantLabel || conversation.participantId || "",
          avatarUrl: null,
          avatarSourceUrl: null,
          avatarCachedUrl: null,
          avatar: null,
          bgavatar: null,
          cover: null,
          username: null,
          displayName: null,
          statusText: null,
          globalId: null,
          userId: null,
          userKey: null,
          accountStatus: null,
          isFr: null,
          isBlocked: null,
          isActive: null,
          isActivePC: null,
          isActiveWeb: null,
          isValid: null,
          user_mode: null,
          type: null,
          key: null,
          lastActionTime: null,
          lastUpdateTime: null,
          createdTs: null,
          dob: null,
          sdob: null,
          threadType: null,
          totalMember: null,
          birthDate: null,
          gender: conversation.gender ?? null,
          dentalStatus: null,
          lastConsultedAt: null,
          phone: null,
          note: null
        },
        preferredAddress: conversation.preferredAddress ?? null, // "co"|"chu"|"anh"|"chi"|null
        gender: conversation.gender ?? null, // "male"|"female"|null
        careStatus: normalizeConversationCareStatus(conversation.careStatus),
        inboxStatus: conversation.inboxStatus || "bot_only",
        assignee: conversation.assignee ?? null,
        priority: Number.isFinite(Number(conversation.priority)) ? Number(conversation.priority) : 0,
        labels: Array.isArray(conversation.labels) ? conversation.labels : [],
        internalNote: conversation.internalNote != null ? String(conversation.internalNote) : "",
        customerIntake: deriveCustomerIntakeFromMessages(conversation.customerIntake, conversation.messages || []),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
        lastCustomerMessageAt: lastCustomerMessage?.createdAt || null,
        messageCount: messages.length,
        unreadCount: unreadCount, // Backend tính unreadCount
        lastMessage: lastMessage, // Thêm lastMessage field
        messages: messages
      };
    });

  return {
    updatedAt: data.updatedAt,
    summary: normalizedChannel
      ? {
          totalMessages: data.summary?.channels?.[normalizedChannel]?.messageCount || 0,
          totalConversations: data.summary?.channels?.[normalizedChannel]?.conversationCount || 0,
          channels: normalizedChannel
            ? {
                [normalizedChannel]: data.summary?.channels?.[normalizedChannel] || {
                  conversationCount: 0,
                  messageCount: 0,
                  lastMessageAt: null
                }
              }
            : data.summary?.channels || {}
        }
      : data.summary,
    conversations
  };
}

function serializeChannelConfigForClient(config) {
  const appConfig = config.app || {};
  const openaiConfig = config.openai || {};
  const localAiConfig = config.localai || config.offlineLlm || {};
  const facebookConfig = config.channels?.facebookMessenger || {};

  return {
    updatedAt: config.updatedAt || null,
    aiConfigSource: "environment",
    aiConfigReadOnly: true,
    app: {
      port: appConfig.port || 3003
    },
    openai: {
      // Never send secrets to browser UI. Use `configured` as indicator.
      apiKey: "",
      model: openaiConfig.model || "",
      embeddingModel: openaiConfig.embeddingModel || "",
      provider: String(openaiConfig.provider || "").trim().toLowerCase(),
      configured: Boolean(openaiConfig.apiKey)
    },
    localai: {
      baseUrl: localAiConfig.baseUrl || "",
      apiKey: "",
      model: localAiConfig.model || "",
      configured: Boolean(localAiConfig.baseUrl && localAiConfig.apiKey)
    },
    channels: {
      facebookMessenger: {
        pageName: facebookConfig.pageName || "",
        defaultPageId: facebookConfig.defaultPageId || null,
        verifyToken: "",
        pageAccessToken: "",
        configured: Boolean(facebookConfig.verifyToken && facebookConfig.pageAccessToken)
      }
    }
  };
}

function serializePromptLibraryForClient(library) {
  return {
    updatedAt: library.updatedAt || null,
    activePromptId: library.activePromptId || null,
    profile: library.profile || null,
    prompts: (library.prompts || []).map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      isActive: prompt.id === library.activePromptId
    }))
  };
}

function resolvePromptProvider(req) {
  const raw = req?.query?.provider || req?.body?.provider;
  return normalizePromptProvider(raw || requireChatbotLlmProvider());
}

function resolveFlowProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider === "localai") return "localai";
  if (provider === "openai") return "openai";
  throw new Error("Provider phai la openai hoac localai.");
}

function getActiveFlowProvider() {
  return resolveFlowProvider(requireChatbotLlmProvider());
}

function officeLabelForUser(key) {
  const k = String(key || "").trim().toUpperCase();
  if (k === "25VNP") return "Singae Hà Nội";
  if (k === "355LTT") return "Singae TP.HCM";
  return "Singae";
}

function formatVisitForUser(dateValue, timeValue) {
  const dateStr = String(dateValue || "").trim();
  const timeStr = String(timeValue || "").trim();
  if (!dateStr && !timeStr) return "chưa rõ";
  let dateDisplay = dateStr;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (ymd) {
    dateDisplay = `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  if (dateDisplay && timeStr) {
    return `ngày ${dateDisplay}, lúc ${timeStr}`;
  }
  return dateDisplay || timeStr || "chưa rõ";
}

/** Gộp patch create_booking với intake đã lưu: trường patch rỗng không ghi đè. */
function mergeBookingPatientAndNotesFromIntake(storedIntake, patchRaw) {
  const stored = normalizeCustomerIntake(storedIntake);
  const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : {};
  const pp = patch.patient && typeof patch.patient === "object" ? patch.patient : {};
  const keys = [
    "fullName",
    "phone",
    "regionLive",
    "preferredOfficeKey",
    "shuttlePickup",
    "preferredVisitDate",
    "preferredVisitTime"
  ];
  const patient = { ...stored.patient };
  for (const k of keys) {
    const v = String(pp[k] ?? "").trim();
    if (!v) continue;
    if (k === "phone" && !isValidVietnamPhone(v)) continue;
    patient[k] = v;
  }
  const patchNotes = patch.notes != null ? String(patch.notes).trim() : "";
  const notes = patchNotes || String(stored.notes || "").trim();
  return normalizeCustomerIntake({ patient, notes });
}

function careStatusLabelVi(v) {
  const n = normalizeConversationCareStatus(v);
  const map = {
    [CARE_STATUS.BOT_CARE]: "Bot đang care",
    [CARE_STATUS.BOOKED]: "Đã đặt lịch",
    [CARE_STATUS.TREATING]: "Đang điều trị",
    [CARE_STATUS.TREATMENT_DONE]: "Điều trị xong"
  };
  return map[n] || n;
}

/** Một dòng trong messages[] khi đổi care — type `care_status_change` để UI render riêng; không gửi Facebook. */
async function appendCareStatusAuditMessage(prevConv, nextCareRaw, source) {
  const prev = normalizeConversationCareStatus(prevConv.careStatus);
  const next = normalizeConversationCareStatus(nextCareRaw);
  if (prev === next) return;
  let text = "";
  if (source === "booking") {
    text = `[${careStatusLabelVi(next)}] Trạng thái care đã cập nhật sau khi ghi nhận lịch hẹn (chỉ hiển thị nội bộ, không gửi cho khách).`;
  } else if (source === "booking_status") {
    text = `[${careStatusLabelVi(prev)} → ${careStatusLabelVi(next)}] Trạng thái care đổi theo cập nhật booking (nội bộ, không gửi cho khách).`;
  } else {
    text = `[${careStatusLabelVi(prev)} → ${careStatusLabelVi(next)}] Trạng thái care đổi trên web (nội bộ, không gửi cho khách).`;
  }
  await appendCareStatusChangeMessage({
    channel: prevConv.channel,
    participantId: prevConv.participantId,
    participantLabel: prevConv.participantLabel,
    previousCareStatus: prev,
    nextCareStatus: next,
    source,
    text
  });
}

async function applyBotEnvelopeSideEffects(conversationId, envelope) {
  const applied = [];
  if (!conversationId || !envelope || typeof envelope !== "object") return applied;
  const hint = String(envelope.inbox_hint || "").trim().toLowerCase();
  if (hint === "needs_human") {
    await updateConversationInbox(conversationId, { inboxStatus: "needs_human" });
    applied.push("inbox:needs_human");
    const afterInbox = await getConversationById(conversationId);
    if (afterInbox?.channel) {
      emitChatHistoryEvent("conversation_inbox_updated", conversationId, { channel: afterInbox.channel });
    }
  }
  const actions = Array.isArray(envelope.actions) ? envelope.actions : [];
  const prioritizedActions = [
    ...actions.filter((action) => String(action?.type || "").trim().toLowerCase() === "merge_customer_intake"),
    ...actions.filter((action) => String(action?.type || "").trim().toLowerCase() !== "merge_customer_intake")
  ];
  for (const action of prioritizedActions) {
    const t = String(action?.type || "").trim().toLowerCase();
    if (!t || t === "none") continue;
    if (t === "merge_customer_intake") {
      await updateConversationCustomerIntake(conversationId, action.patch || {}, {
        patientPartialMerge: true,
        notesPartialMerge: true
      });
      applied.push("merge_customer_intake");
      const fresh = await getConversationById(conversationId);
      if (fresh?.channel) {
        emitChatHistoryEvent("conversation_customer_intake_updated", conversationId, { channel: fresh.channel });
      }
    } else if (t === "create_booking_request") {
      const conv = await getConversationById(conversationId);
      const careBeforeBooking = normalizeConversationCareStatus(conv.careStatus);
      const patchRaw = action.patch && typeof action.patch === "object" ? action.patch : {};
      const bookingInput = mergeBookingPatientAndNotesFromIntake(conv.customerIntake, patchRaw);
      if (!isValidVietnamPhone(bookingInput.patient.phone)) {
        applied.push("create_booking_request_skipped:needs_valid_phone");
        appendServerLog({
          level: "info",
          source: "booking-gate",
          message: "Skipped create_booking_request: merged intake has no valid VN phone",
          metadata: { conversationId }
        });
        continue;
      }
      const ap = action.appointment && typeof action.appointment === "object" ? action.appointment : {};
      const nextAppt = {
        ...ap,
        id: String(ap.id || "").trim() || `booking-${Date.now()}`,
        status: String(ap.status || BOOKING_STATUS.BOOKED).trim() || BOOKING_STATUS.BOOKED
      };
      try {
        const booking = await createBookingRequest({
          conversation: conv,
          patient: bookingInput.patient,
          notes: bookingInput.notes,
          appointment: nextAppt,
          source: "chatbot"
        });
        await updateConversationCareStatus(conversationId, CARE_STATUS.BOOKED);
        if (careBeforeBooking === CARE_STATUS.BOT_CARE) {
          try {
            await appendCareStatusAuditMessage(conv, CARE_STATUS.BOOKED, "booking");
          } catch (auditErr) {
            appendServerLog({
              level: "warn",
              source: "care-status-audit",
              message: String(auditErr?.message || auditErr),
              metadata: { conversationId }
            });
          }
        }
        applied.push("create_booking_request");
        applied.push(`booking_id:${booking.id}`);
        const fresh = await getConversationById(conversationId);
        if (fresh?.channel) {
          emitChatHistoryEvent("conversation_booking_created", conversationId, { channel: fresh.channel, bookingId: booking.id });
        }
        try {
          await zaloPersonalClient.notifyZaloBookingRequestCreated({
            booking,
            careStatus: CARE_STATUS.BOOKED
          });
          await markBookingRequestZaloNotified(booking.id);
          applied.push("zalo_notify:booking_request");
        } catch (zErr) {
          applied.push(`zalo_notify_failed:${zErr?.code || "error"}`);
          appendServerLog({
            level: "warn",
            source: "zalo-personal-notify",
            message: `Zalo thông báo booking bot thất bại: ${zErr?.message || zErr}`,
            metadata: { conversationId, bookingId: booking.id }
          });
        }
      } catch (bookingErr) {
        applied.push(`create_booking_request_failed:${bookingErr?.message || bookingErr}`);
        appendServerLog({
          level: "warn",
          source: "booking-request",
          message: `Create booking request failed: ${bookingErr?.message || bookingErr}`,
          metadata: { conversationId }
        });
      }
    }
  }

  const coll = envelope.collected;
  if (coll && typeof coll === "object") {
    const did = await mergeEnvelopeCollectedIntoIntake(conversationId, coll);
    if (did) applied.push("collected_to_intake");
  }
  return applied;
}

/** Gop truong collected tu JSON bot vao customer intake (chi ghi DB khi co thay doi). */
async function mergeEnvelopeCollectedIntoIntake(conversationId, collected) {
  if (!conversationId || !collected || typeof collected !== "object") return false;
  const p = collected.patient && typeof collected.patient === "object" ? collected.patient : {};
  const patch = { patient: {} };
  for (const k of [
    "fullName",
    "phone",
    "regionLive",
    "preferredOfficeKey",
    "shuttlePickup",
    "preferredVisitDate",
    "preferredVisitTime"
  ]) {
    let v = String(p[k] ?? "").trim();
    if (k === "preferredOfficeKey") {
      v = v.toUpperCase();
      if (!v || (v !== "25VNP" && v !== "355LTT")) continue;
    }
    if (k === "shuttlePickup") {
      const low = v.toLowerCase();
      if (low !== "yes" && low !== "no") continue;
      v = low;
    }
    if (k === "preferredVisitDate" || k === "preferredVisitTime") v = v.slice(0, 32);
    if (v) patch.patient[k] = v;
  }
  if (!Object.keys(patch.patient).length) delete patch.patient;
  if (collected.notes !== undefined && collected.notes !== null) {
    const n = String(collected.notes).trim();
    if (n) patch.notes = n;
  }
  const hasPatient = patch.patient && Object.keys(patch.patient).length > 0;
  const hasNotes = patch.notes !== undefined && String(patch.notes).trim() !== "";
  if (!hasPatient && !hasNotes) return false;

  const fingerprintIntakeCore = (raw) => {
    const n = normalizeCustomerIntake(raw);
    return JSON.stringify({
      patient: n.patient,
      notes: n.notes,
      appointments: n.appointments
    });
  };
  const beforeConv = await getConversationById(conversationId);
  const beforeCore = beforeConv ? fingerprintIntakeCore(beforeConv.customerIntake) : "";
  await updateConversationCustomerIntake(conversationId, patch, {
    patientPartialMerge: true,
    notesPartialMerge: true
  });
  const afterConv = await getConversationById(conversationId);
  const afterCore = afterConv ? fingerprintIntakeCore(afterConv.customerIntake) : "";
  if (beforeCore !== afterCore && afterConv?.channel) {
    emitChatHistoryEvent("conversation_customer_intake_updated", conversationId, { channel: afterConv.channel });
    return true;
  }
  return false;
}

function isUsableParticipantName(value) {
  const name = String(value || "").trim();
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower === "admin" || lower.includes("admin |")) return false;
  if (/^facebook user\s+\d+$/i.test(name)) return false;
  return true;
}

/** Tên đầy đủ hiển thị (để suy luận giới tính từ tên, v.v.). */
function pickParticipantFullDisplayName(conversation) {
  if (!conversation || typeof conversation !== "object") return null;
  const prof = conversation.participantProfile;
  const full =
    String(prof?.displayName || "").trim() ||
    String(prof?.name || "").trim() ||
    String(conversation.participantLabel || "").trim() ||
    "";
  if (isUsableParticipantName(full)) return full;
  return null;
}

/**
 * Tên gọi trong hội thoại: ưu tiên họ / last_name (Facebook `familyName`), không ghép full name.
 */
function pickParticipantAddressingName(conversation) {
  if (!conversation || typeof conversation !== "object") return null;
  const prof = conversation.participantProfile;
  const family = String(prof?.familyName || "").trim();
  if (isUsableParticipantName(family)) return family;
  return pickParticipantFullDisplayName(conversation);
}

function normalizeAddressPreferenceToken(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "chị" || s === "chi") return "chi";
  if (s === "chú" || s === "chu") return "chu";
  if (s === "cô" || s === "co") return "co";
  if (s === "anh") return "anh";
  return null;
}

async function answerQuestion(question, endpoint, extraRequestData = {}) {
  const chatStartTime = Date.now();
  const provider = "openai";
  const activePrompt = await getActivePrompt(provider);
  const channel = String(extraRequestData?.channel || "").trim();
  const participantId = historyParticipantIdFromExtra(extraRequestData);
  const channelEarly = channel;
  const participantEarly = participantId;
  if (channelEarly && participantEarly) {
    const conversationIdEarly = `${String(channelEarly).trim()}:${String(participantEarly).trim()}`;
    const convSkip = await getConversationById(conversationIdEarly);
    if (
      !extraRequestData?.forceBotReply &&
      convSkip &&
      !conversationAllowsBotReply(convSkip)
    ) {
      appendServerLog({
        level: "info",
        source: "care-status",
        message: "Skip LLM: careStatus is not bot_care",
        endpoint,
        metadata: { conversationId: conversationIdEarly, careStatus: convSkip.careStatus }
      });
      logChatInteraction({
        channel: extraRequestData?.channel || "unknown",
        participantId: participantId || extraRequestData?.senderId || extraRequestData?.testChatId || "unknown",
        question,
        answer: "",
        chatCase: "skipped_care",
        historyLength: 0,
        tokens: { embedding: {}, chat: {}, total: 0 },
        cost: null,
        duration: Date.now() - chatStartTime,
        metadata: {
          endpoint,
          skippedLlm: true,
          careStatus: convSkip.careStatus,
          activePromptId: activePrompt.id
        }
      });
      return {
        answer: "",
        skippedLlm: true,
        metadata: {
          activePromptId: activePrompt.id,
          activePromptTitle: activePrompt.title,
          skippedLlm: true,
          careStatus: convSkip.careStatus,
          entriesUsed: 0,
          retrievalCandidates: 0,
          matchedEntries: [],
          updatedAt: null,
          usage: null
        }
      };
    }
  }
  const namespace = provider;
  const kb = await loadKnowledgeBase({ namespace });
  const questionEmbeddingResult = await embedText(question, { provider: "openai" });
  const matches = rankEntriesHybrid({
    query: question,
    questionEmbedding: questionEmbeddingResult.embedding,
    entries: kb.entries,
    topK: 10,
    vectorWeight: Number(kb?.retrieval?.vectorWeight || 0.78),
    keywordWeight: Number(kb?.retrieval?.keywordWeight || 0.22)
  });
  const qualifiedKb = filterRetrievalMatches(matches, kb.retrieval);
  let context = buildContextFromEntries(qualifiedKb, { numbered: true });
  
  const CHAT_CASE = {
    FIRST_TIME: "first_time",           // CASE 1: Lần đầu chat
    ONGOING_CONVERSATION: "ongoing",     // CASE 2: Đang trong cuộc hội thoại (< 7 ngày)
    LONG_TIME_AGO: "long_time_ago"      // CASE 3: Lâu rồi mới chat lại (>= 7 ngày)
  };
  
  let conversationHistory = [];
  let daysSinceLastChat = null;
  let lastChatSummary = null;
  let chatCase = CHAT_CASE.FIRST_TIME; // Mặc định là lần đầu chat
  
  if (channel && participantId) {
    const conversationId = `${channel}:${participantId}`;
    const conversation = await getConversationById(conversationId);
    if (conversation && Array.isArray(conversation.messages) && conversation.messages.length > 0) {
      const sortedMessages = [...conversation.messages].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });
      
      const allPreviousMessages = sortedMessages.slice(0, -1);
      
      if (allPreviousMessages.length > 0) {
        const lastMessage = allPreviousMessages[allPreviousMessages.length - 1];
        const lastMessageTime = new Date(lastMessage.createdAt);
        const now = new Date();
        const diffMs = now - lastMessageTime;
        daysSinceLastChat = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastChat >= 7) {
          chatCase = CHAT_CASE.LONG_TIME_AGO; // CASE 3: Lâu rồi mới chat lại
        } else {
          chatCase = CHAT_CASE.ONGOING_CONVERSATION; // CASE 2: Đang trong cuộc hội thoại
        }
        
        const recentMessages = allPreviousMessages.slice(-10);
        const discussedTopics = recentMessages
          .filter(msg => msg.direction === "incoming")
          .map(msg => msg.text)
          .slice(-3); // Lấy 3 câu hỏi gần nhất của user
        
        if (discussedTopics.length > 0) {
          lastChatSummary = discussedTopics.join("; ");
        }
      } else {
        chatCase = CHAT_CASE.FIRST_TIME;
      }
      
      const previousMessages = allPreviousMessages.slice(-20); // Lấy 20 messages gần nhất (giữ nguyên thứ tự từ cũ đến mới)
      
      conversationHistory = previousMessages.map((msg) => ({
        role: msg.direction === "incoming" ? "user" : "assistant",
        content: msg.text
      }));
      await upsertConversationMemory({
        conversationId,
        messages: allPreviousMessages,
        embedTexts: (texts) => embedTexts(texts, { provider: "openai" }),
        namespace
      });
      const memoryMatches = await retrieveConversationMemory({
        conversationId,
        queryEmbedding: questionEmbeddingResult.embedding,
        topK: 4,
        namespace
      });
      if (memoryMatches.length) {
        const memoryContext = memoryMatches
          .map((item) => `- [memory] ${String(item.text || "").trim()}`)
          .join("\n");
        context = `${context}\n\n[LICH SU HOI THOAI LIEN QUAN]\n${memoryContext}`.trim();
      }
      
      const { appendServerLog } = require("./serverLogs");
      appendServerLog({
        level: "info",
        source: "chat-history",
        message: `Chat case detected: ${chatCase} for ${conversationId}${daysSinceLastChat !== null ? ` (${daysSinceLastChat} days ago)` : " (first time)"}`,
        endpoint,
        metadata: {
          conversationId,
          chatCase,
          totalMessages: conversation.messages.length,
          historyLength: conversationHistory.length,
          daysSinceLastChat,
          lastChatSummary
        }
      });
    } else {
      chatCase = CHAT_CASE.FIRST_TIME;
    }
  } else {
    chatCase = CHAT_CASE.FIRST_TIME;
  }
  
  let participantName = String(extraRequestData?.participantName || "").trim() || null;
  
  let conversationGender = null;
  let preferredAddress = null;
  let mirrorProfile = null;
  if (channel && participantId) {
    const conversationId = `${channel}:${participantId}`;
    const conversation = await getConversationById(conversationId);
    
    conversationGender = conversation?.gender || null;
    if (!isUsableParticipantName(participantName)) {
      participantName = pickParticipantAddressingName(conversation);
    }

    const fullNameForGender = pickParticipantFullDisplayName(conversation);
    if (!conversationGender && (fullNameForGender || participantName)) {
      const { detectGenderFromName } = require("./nameGenderDetector");
      const detectedGender = detectGenderFromName(fullNameForGender || participantName);
      if (detectedGender) {
        const { updateConversationGender } = require("./chatHistory");
        await updateConversationGender(conversationId, detectedGender);
        conversationGender = detectedGender;
      }
    }
    
    preferredAddress = conversation?.preferredAddress || null;
    mirrorProfile = conversation?.mirrorProfile || null;
    
    if (question) {
      const {
        resolveConversationHonorific,
        resolveHonorificPairToPersist,
        sanitizeMirrorProfile
      } = require("./nameGenderDetector");
      const sanitizedMirror = sanitizeMirrorProfile(mirrorProfile);
      const resolvedHonorific = resolveConversationHonorific({
        currentMessage: question,
        preferredAddress,
        mirrorProfile: sanitizedMirror,
        gender: conversationGender
      });
      const nextMirrorProfile = resolveHonorificPairToPersist(
        resolvedHonorific,
        sanitizedMirror,
        conversationGender
      );

      if (nextMirrorProfile) {
        const cur = sanitizeMirrorProfile(mirrorProfile);
        if (
          String(nextMirrorProfile.userHonorific) !== String(cur?.userHonorific || "") ||
          String(nextMirrorProfile.botSelfHonorific) !== String(cur?.botSelfHonorific || "")
        ) {
          await updateConversationMirrorProfile(conversationId, nextMirrorProfile);
          mirrorProfile = nextMirrorProfile;
        }
      }

      const nextPreferredAddress = normalizeAddressPreferenceToken(resolvedHonorific?.preferredAddress);
      if (nextPreferredAddress && nextPreferredAddress !== preferredAddress) {
        const { updateConversationPreferredAddress } = require("./chatHistory");
        await updateConversationPreferredAddress(conversationId, nextPreferredAddress);
        preferredAddress = nextPreferredAddress;
      }
    }
  }
  
  if (!String(context || "").trim() && Array.isArray(kb.entries) && kb.entries.length > 0) {
    context =
      "Khong co doan tri thuc nao dat nguong do phu hop voi cau hoi. Tra loi theo format chua co trong kho du lieu trong prompt.";
  }

  let intakeContextMarkdown = "";
  let intakeSnapForRuntime = null;
  if (channel && participantId) {
    const cidInt = `${String(channel).trim()}:${String(participantId).trim()}`;
    const convInt = await getConversationById(cidInt);
    let intakeSnap = null;
    if (convInt) {
      intakeSnap = normalizeCustomerIntake(convInt.customerIntake);
      if (!String(intakeSnap.patient.fullName || "").trim()) {
        const profileName = deriveMessengerProfileFullName(convInt.participantProfile);
        if (profileName) {
          await updateConversationCustomerIntake(
            cidInt,
            { patient: { fullName: profileName } },
            { patientPartialMerge: true }
          );
          const reloaded = await getConversationById(cidInt);
          if (reloaded) {
            intakeSnap = normalizeCustomerIntake(reloaded.customerIntake);
          }
        }
      }
      intakeSnapForRuntime = intakeSnap;
      const fullIntakeJson = `\n\n[INTAKE DA LUU TREN SERVER — merge vao JSON "collected", khong ghi de field cu neu khach khong doi]:\n${JSON.stringify(
        {
          careStatus: normalizeConversationCareStatus(convInt.careStatus),
          schemaVersion: intakeSnap.schemaVersion,
          patient: intakeSnap.patient,
          notes: intakeSnap.notes,
          appointments: intakeSnap.appointments,
          updatedAt: intakeSnap.updatedAt
        },
        null,
        0
      )}`;
      intakeContextMarkdown = buildIntakeRuntimeMarkdown({
        intakeSnap,
        fullIntakeJsonMarkdown: fullIntakeJson,
        conversationHistory
      });
    }
    try {
      const facRows = await listClinicFacilities();
      intakeContextMarkdown += buildFacilitiesMarkdownBlock(facRows);
      intakeContextMarkdown += await buildBookingContextMarkdownForConversation(cidInt);
      if (intakeSnap) {
        const po = String(intakeSnap.patient?.preferredOfficeKey || "")
          .trim()
          .toUpperCase();
        if (po === "25VNP" || po === "355LTT") {
          intakeContextMarkdown += await buildOccupiedSlotsMarkdownForOffice(po);
        }
      }
    } catch (err) {
      appendServerLog({
        level: "warn",
        source: "intake-context",
        message: `Facilities/occupancy markdown failed: ${err?.message || err}`,
        metadata: { conversationId: cidInt }
      });
    }
  }

  const completionResult = await askOpenAI({
    question,
    context,
    conversationHistory,
    chatCase,
    daysSinceLastChat,
    lastChatSummary,
    participantName,
    preferredAddress,
    mirrorProfile,
    gender: conversationGender,
    provider: "openai",
    intakeContextMarkdown,
    intakeSnap: intakeSnapForRuntime
  });

  const conversationIdForEffects =
    channel && participantId ? `${String(channel).trim()}:${String(participantId).trim()}` : null;
  let botStructuredApplied = [];
  if (conversationIdForEffects && completionResult.botEnvelope) {
    try {
      botStructuredApplied = await applyBotEnvelopeSideEffects(conversationIdForEffects, completionResult.botEnvelope);
    } catch (err) {
      appendServerLog({
        level: "warn",
        source: "bot-structured",
        message: `applyBotEnvelopeSideEffects failed: ${err?.message || err}`,
        metadata: { conversationId: conversationIdForEffects }
      });
    }
  }

  const totalDuration = Date.now() - chatStartTime;
  const totalTokens = (questionEmbeddingResult.usage?.totalTokens || 0) + (completionResult.usage?.totalTokens || 0);

  logChatInteraction({
    channel: extraRequestData?.channel || "unknown",
    participantId: participantId || extraRequestData?.senderId || extraRequestData?.testChatId || "unknown",
    question,
    answer: completionResult.answer,
    chatCase,
    historyLength: conversationHistory.length,
    tokens: {
      embedding: questionEmbeddingResult.usage,
      chat: completionResult.usage,
      total: totalTokens
    },
    cost: null, // Will be calculated separately
    duration: totalDuration,
    metadata: {
      endpoint,
      entriesUsed: qualifiedKb.length,
      retrievalCandidates: matches.length,
      retrievalStrategy: kb?.retrieval?.strategy || "hybrid-v1",
      activePromptId: activePrompt.id,
      daysSinceLastChat,
      botParseNote: completionResult.botParseNote || null,
      botStructuredApplied
    }
  });

  return {
    answer: completionResult.answer,
    metadata: {
      activePromptId: activePrompt.id,
      activePromptTitle: activePrompt.title,
      entriesUsed: qualifiedKb.length,
      retrievalCandidates: matches.length,
      embeddingModel:
        kb.embeddingModel ||
        getRuntimeConfig().openai.embeddingModel ||
        getRuntimeConfig().localai.embeddingModel ||
        null,
      chatCase: completionResult.request?.chatCase || chatCase,
      conversationHistoryLength: conversationHistory.length,
      daysSinceLastChat,
      botEnvelope: completionResult.botEnvelope || null,
      botParseNote: completionResult.botParseNote || null,
      botStructuredApplied,
      usage: {
        embedding: {
          model: questionEmbeddingResult.model,
          usage: questionEmbeddingResult.usage
        },
        chat: {
          model: completionResult.model,
          usage: completionResult.usage
        }
      },
      matchedEntries: qualifiedKb.map((entry) => ({
        id: entry.id,
        similarity: Number((entry.similarity || 0).toFixed(4)),
        rerankScore: Number((entry.rerankScore || 0).toFixed(4)),
        lexicalSimilarity: Number((entry.lexicalSimilarity || 0).toFixed(4)),
        text: entry.text
      })),
      updatedAt: kb.updatedAt
    }
  };
}

router.use(createRequestLoggerMiddleware());

router.get("/health", async (req, res) => {
  const lite =
    String(process.env.CHATBOT_HEALTH_LITE || "").trim() === "1" ||
    String(req.query?.lite || "").trim() === "1";
  const kb = await loadKnowledgeBase();
  const usageLog = await loadUsageLog();
  let chatHistorySummary;
  try {
    if (lite) {
      chatHistorySummary = {
        lite: true,
        note: "Skipped loading full chat history (OOM / SQLITE_CORRUPT safe probe). Omit ?lite=1 for full summary."
      };
    } else {
      const chatHistory = await loadChatHistory();
      chatHistorySummary = chatHistory.summary;
    }
  } catch (e) {
    chatHistorySummary = { error: String(e.message || e) };
  }
  const runtimeConfig = getRuntimeConfig();
  const facebookConfig = getFacebookMessengerConfig();
  const version = await getCurrentVersion();
  res.json({
    ok: true,
    version,
    hasOpenAIKey: Boolean(runtimeConfig.openai?.apiKey),
    singaeLookupConfigured: getSingaeLookupConfigIssues().length === 0,
    singaeLookupConfigIssues: getSingaeLookupConfigIssues(),
    facebookWebhookConfigured: isFacebookConfigured(),
    facebookPageName: facebookConfig.pageName || null,
    embeddingModel:
      kb.embeddingModel ||
      runtimeConfig.openai?.embeddingModel ||
      runtimeConfig.localai?.embeddingModel ||
      null,
    port: runtimeConfig.app?.port || process.env.PORT || 3000,
    sources: kb.sources,
    entries: kb.entries.length,
    updatedAt: kb.updatedAt,
    usageSummary: usageLog.summary,
    chatHistorySummary
  });
});

router.get("/version", async (req, res) => {
  const { loadVersion } = require("./versionManager");
  const versionData = await loadVersion();
  res.json(versionData);
});

router.get("/file-logs", (req, res) => {
  try {
    const { getLogFiles, readLogFile } = require("./fileLogger");
    const fileName = req.query.file;
    const limit = Number(req.query.limit || 1000);

    if (fileName) {
      const entries = readLogFile(fileName, limit);
      return res.json({
        fileName,
        entries,
        count: entries.length
      });
    } else {
      const files = getLogFiles();
      return res.json({
        files: files.map(f => ({
          name: f.name,
          size: f.size,
          mtime: f.mtime,
          sizeFormatted: `${(f.size / 1024).toFixed(2)} KB`
        })),
        count: files.length
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the doc file logs." });
  }
});

router.get("/server-logs", (req, res) => {
  res.json(getServerLogs());
});

router.delete("/server-logs", (req, res) => {
  return res.json(clearServerLogs());
});

router.get("/server-logs/stream", (req, res) => {
  openServerLogStream(req, res);
});

router.get("/avatar-cache/:fileName", (req, res) => {
  try {
    const filePath = resolveAvatarCacheFile(req.params?.fileName);
    if (!filePath) {
      return res.status(404).json({ error: "Avatar not found." });
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot load avatar cache." });
  }
});

router.get("/bug-board/meta", requireWindowsShellUser, (_req, res) => {
  return res.json({
    statuses: Object.values(BUG_TASK_STATUS),
    priorities: Object.values(BUG_TASK_PRIORITY),
    severities: Object.values(BUG_TASK_SEVERITY)
  });
});

router.get("/bug-board/tasks", requireWindowsShellUser, async (req, res) => {
  try {
    const status = String(req.query?.status || "").trim();
    const tasks = await listBugTasks({ status, limit: 500 });
    return res.json({ tasks });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tai bug board." });
  }
});

router.get("/bug-board/tasks/:taskId", requireWindowsShellUser, async (req, res) => {
  try {
    const task = await getBugTaskById(req.params?.taskId);
    if (!task) return res.status(404).json({ error: "Khong tim thay task." });
    return res.json({ task });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tai task." });
  }
});

router.post("/bug-board/tasks", requireWindowsShellUser, async (req, res) => {
  try {
    const reporter =
      String(req.body?.reporter || "").trim() ||
      String(req.authUser?.fullName || req.authUser?.username || "").trim();
    const task = await createBugTask({
      ...req.body,
      reporter
    });
    return res.json({ task });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the tao task." });
  }
});

router.patch("/bug-board/tasks/:taskId", requireWindowsShellUser, async (req, res) => {
  try {
    const updatedBy = String(req.authUser?.fullName || req.authUser?.username || "").trim();
    const task = await updateBugTask(req.params?.taskId, {
      ...req.body,
      updatedBy
    });
    if (!task) return res.status(404).json({ error: "Khong tim thay task." });
    return res.json({ task });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the cap nhat task." });
  }
});

router.post("/bug-board/tasks/:taskId/comments", requireWindowsShellUser, async (req, res) => {
  try {
    const author = String(req.authUser?.fullName || req.authUser?.username || "").trim();
    const update = await addBugTaskComment(req.params?.taskId, {
      ...req.body,
      author
    });
    if (!update) return res.status(404).json({ error: "Khong tim thay task." });
    return res.json({ update });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the them cap nhat." });
  }
});

router.post("/bug-board/attachments", requireWindowsShellUser, uploadBugBoardAttachmentFile, async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "File is required." });
    const ext = path.extname(String(file.originalname || "").trim()) || "";
    const id = `bugatt-${randomBytes(8).toString("hex")}`;
    const fileName = `${id}${ext}`;
    const abs = path.join(uploadsDir, fileName);
    fs.writeFileSync(abs, file.buffer);
    const attachment = normalizeAttachments([
      {
        id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/api/chatbot/uploads/${encodeURIComponent(fileName)}`
      }
    ])[0] || null;
    if (!attachment) return res.status(400).json({ error: "Khong the luu attachment." });
    return res.json({ attachment });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Upload attachment failed." });
  }
});

router.get("/uploads/:fileName", requireWindowsShellUser, (req, res) => {
  try {
    const fileName = String(req.params?.fileName || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      return res.status(400).json({ error: "Invalid file name." });
    }
    const filePath = path.resolve(path.join(uploadsDir, fileName));
    const uploadsRoot = path.resolve(uploadsDir) + path.sep;
    if (!filePath.startsWith(uploadsRoot)) {
      return res.status(400).json({ error: "Invalid file path." });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: "File not found." });
    }
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot load file." });
  }
});


router.get("/admin/ping", (req, res) => {
  return res.json({
    ok: true,
    time: new Date().toISOString(),
    adminPostBase: "/api/admin/form/",
    note: "Trang offline: dat <base href> la origin server, form action bat dau bang /api/..."
  });
});


router.post("/admin/form/clear-chatGptVipAccess", (req, res) => {
  try {
    clearChatGptVipAccessHistory();
    return res.type("html").send(adminFormResultPage("OK", "Đã xóa toàn bộ tin nhắn ChatGptVipAccess."));
  } catch (error) {
    logError({
      source: "admin-form",
      message: `clear-chatGptVipAccess failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/admin/form/clear-chatGptVipAccess" }
    });
    return res.status(500).type("html").send(adminFormResultPage("Lỗi", error.message || "Không thực hiện được.", true));
  }
});

router.post("/admin/form/delete-conversation", async (req, res) => {
  try {
    const id = String(req.body?.conversationId ?? "").trim();
    if (!id) {
      return res.status(400).type("html").send(adminFormResultPage("Lỗi", "Thiếu conversationId.", true));
    }
    if (id === CHAT_GPT_VIP_ACCESS_CONVERSATION_ID) {
      return res
        .status(400)
        .type("html")
        .send(
          adminFormResultPage(
            "Lỗi",
            "Cuộc ChatGptVipAccess: dùng mục “Xóa tin ChatGptVipAccess”, không xóa cuộc theo ID này.",
            true
          )
        );
    }
    const conversation = await getConversationById(id);
    if (!conversation) {
      return res.status(404).type("html").send(adminFormResultPage("Lỗi", "Không tìm thấy cuộc trò chuyện.", true));
    }
    await clearConversationById(id);
    return res.type("html").send(adminFormResultPage("OK", `Đã xóa cuộc: ${id}`));
  } catch (error) {
    logError({
      source: "admin-form",
      message: `delete-conversation failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/admin/form/delete-conversation" }
    });
    return res.status(500).type("html").send(adminFormResultPage("Lỗi", error.message || "Không thực hiện được.", true));
  }
});

router.post("/admin/form/set-model", (req, res) => {
  try {
    const model = String(req.body?.model ?? "").trim();
    if (!model) {
      return res.status(400).type("html").send(adminFormResultPage("Lỗi", "Model không được để trống.", true));
    }
    if (!isKnownChatModelId(model)) {
      return res
        .status(400)
        .type("html")
        .send(adminFormResultPage("Lỗi", "Model không nằm trong danh sách hỗ trợ (xem liên kết /api/openai-models).", true));
    }
    logConfigChange({
      action: "update-openai-model-skipped",
      config: { openai: { modelRequested: model, fromEnv: true } },
      metadata: { endpoint: "POST /api/admin/form/set-model" }
    });
    return res
      .type("html")
      .send(
        adminFormResultPage(
          "Không lưu database",
          `Model chat chỉ cấu hình qua biến OPENAI_MODEL trong private/.env (hiện tại server đọc từ env, không ghi SQLite). Bạn chọn: ${model}.`,
          true
        )
      );
  } catch (error) {
    logError({
      source: "admin-form",
      message: `set-model failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/admin/form/set-model" }
    });
    return res.status(500).type("html").send(adminFormResultPage("Lỗi", error.message || "Không thực hiện được.", true));
  }
});

router.post("/admin/form/view-online", (req, res) => {
  try {
    const limit = Number(req.body?.limit || 80);
    const snapshot = getOnlineSnapshot();
    const history = getOnlineIpEventHistory({ limit });

    const ipsRows = (snapshot.ips || [])
      .map((it) => {
        const onlineLabel = it.online ? "ONLINE" : "OFFLINE";
        const onlineColor = it.online ? "#4ade80" : "rgba(148,163,184,0.7)";
        return `<tr>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15); font-family: ui-monospace, monospace;">${escapeHtmlForAdmin(it.ip)}</td>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15); color: ${onlineColor}; font-weight:700;">${onlineLabel}</td>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15);">${escapeHtmlForAdmin(it.lastSeenAt)}</td>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15);">${escapeHtmlForAdmin(String(it.eventCount ?? 0))}</td>
</tr>`;
      })
      .join("\n");

    const eventsRows = (history.events || [])
      .map((e) => {
        return `<tr>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15); white-space:nowrap;">${escapeHtmlForAdmin(e.at)}</td>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15); font-family: ui-monospace, monospace;">${escapeHtmlForAdmin(e.ip)}</td>
  <td style="padding:8px 10px; border-bottom:1px solid rgba(148,163,184,0.15);">${escapeHtmlForAdmin(e.endpoint || "")}</td>
</tr>`;
      })
      .join("\n");

    const windowSec = Math.round(snapshot.windowMs / 1000);

    return res.type("html").send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Online presence — Quản trị chatbot</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #020617; color: #e5e7eb; padding: 24px; }
    a { color: #60a5fa; text-decoration: none; font-family: system-ui, sans-serif; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 980px; margin: 0 auto; }
    .nav { margin-bottom: 16px; }
    h1 { margin: 0 0 6px; font-size: 1.2rem; }
    .sub { margin: 0 0 18px; color: rgba(229,231,235,0.72); line-height: 1.5; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
    .card { background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; padding: 14px; }
    table { width: 100%; border-collapse: collapse; border-spacing: 0; }
    th { text-align:left; font-size: 12px; color: rgba(229,231,235,0.7); font-weight:700; padding: 8px 10px; border-bottom:1px solid rgba(148,163,184,0.15); }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-weight: 800; font-size: 12px; border: 1px solid rgba(148,163,184,0.35); background: rgba(2,6,23,0.35); }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="nav"><a href="/chatbot-admin-offline.html">← Quản trị</a> · <a href="/">Trang chủ</a></p>
    <h1>Online/IP presence</h1>
    <p class="sub">
      Online = các IP có request mới trong <strong>${escapeHtmlForAdmin(String(windowSec))} giây</strong>.
    </p>

    <div class="grid">
      <div class="card">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 10px;">
          <span class="pill">ONLINE: ${escapeHtmlForAdmin(String(snapshot.onlineCount))}</span>
          <span style="color: rgba(229,231,235,0.72); font-size: 13px;">Tổng IP từng thấy: ${escapeHtmlForAdmin(String(snapshot.totalIpsSeen || 0))}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>IP</th>
              <th>Trạng thái</th>
              <th>Last seen</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            ${ipsRows || `<tr><td colspan="4" style="padding:10px; color: rgba(229,231,235,0.6);">Chưa có dữ liệu.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom: 10px;">
          <span style="font-weight:800;">Lịch sử IP (latest ${escapeHtmlForAdmin(String(history.events?.length || 0))} / ${escapeHtmlForAdmin(String(history.totalEvents || 0))} events)</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>IP</th>
              <th>Endpoint</th>
            </tr>
          </thead>
          <tbody>
            ${eventsRows || `<tr><td colspan="3" style="padding:10px; color: rgba(229,231,235,0.6);">Chưa có event.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`);
  } catch (error) {
    logError({
      source: "admin-form",
      message: `view-online failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/admin/form/view-online" }
    });
    return res.status(500).type("html").send(adminFormResultPage("Lỗi", error.message || "Không đọc được dữ liệu online.", true));
  }
});

router.post("/admin/logs-view", (req, res) => {
  try {
    const data = getServerLogs();
    const lines = (data.logs || []).map((e) => {
      const bits = [e.timestamp, e.level, e.message];
      if (e.endpoint) bits.push(String(e.endpoint));
      if (e.method) bits.push(String(e.method));
      if (e.status != null) bits.push(String(e.status));
      return bits.join(" | ");
    });
    const raw = lines.length ? lines.join("\n") : "(Chưa có log trong bộ nhớ.)";
    const esc = escapeHtmlForAdmin(raw);
    return res.type("html").send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Server logs — Quản trị chatbot</title>
  <style>
    body { font-family: ui-monospace, monospace; margin: 0; background: #020617; color: #e5e7eb; padding: 24px; }
    a { color: #60a5fa; text-decoration: none; font-family: system-ui, sans-serif; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 960px; margin: 0 auto; }
    pre { background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; padding: 16px; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.45; }
    .nav { margin-bottom: 16px; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="nav"><a href="/chatbot-admin-offline.html">← Quản trị</a> · <a href="/">Trang chủ</a></p>
    <pre>${esc}</pre>
  </div>
</body>
</html>`);
  } catch (error) {
    logError({
      source: "admin-form",
      message: `logs-view failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/admin/logs-view" }
    });
    return res.status(500).type("html").send(adminFormResultPage("Lỗi", error.message || "Không đọc được log.", true));
  }
});

router.get("/usage-logs", async (req, res) => {
  res.json(serializeUsageLogForClient(await loadUsageLog()));
});

router.delete("/usage-logs", async (req, res) => {
  const usageLog = await clearUsageLog();
  res.json({
    message: "Da xoa toan bo usage log.",
    usageLog: serializeUsageLogForClient(usageLog)
  });
});

router.get("/chat-history", async (req, res) => {
  try {
    const channel = req.query.channel;
    const facebookPageId = String(req.query.pageId || req.query.facebookPageId || "").trim();
    const chatHistory = await loadChatHistory();
    res.json(await prepareChatHistoryForClient(chatHistory, channel, facebookPageId));
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Get chat history failed: ${error.message}`,
      error,
      metadata: { endpoint: "GET /api/chat-history", channel: req.query.channel, pageId: req.query.pageId }
    });
    return res.status(500).json({ error: error.message || "Khong the tai lich su chat." });
  }
});

router.post("/chat-history", (req, res) => {
  try {
    return res.status(403).json({
      error: "DISABLED",
      message: "Da tat chuc nang tao user chat thu cong. He thong chi hien thi hoi thoai tu kenh MXH."
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Create conversation failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/chat-history" }
    });
    return res.status(500).json({ error: error.message || "Khong the tao cuoc tro chuyen moi." });
  }
});

router.delete("/chat-history", async (req, res) => {
  const channel = req.query.channel;
  const chatHistory = await clearChatHistory(channel);
  emitChatHistoryEvent("conversation_cleared", channel || "all", { channel: channel || null });
  res.json({
    message: channel ? `Da xoa lich su chat cua kenh ${channel}.` : "Da xoa toan bo lich su chat.",
    chatHistory: serializeChatHistoryForClient(chatHistory, channel)
  });
});

/** Lịch Simly đã đặt (cache SQLite) — đồng bộ từ cùng API user-admin /api/public/appointment. */
router.get("/clinic-appointments/meta", async (_req, res) => {
  try {
    const meta = await getClinicAppointmentSyncMeta();
    return res.json({ ok: true, ...meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "meta failed" });
  }
});

/** Hai cơ sở (SQLite) — địa chỉ, giấy phép, map; office_key khớp Simly. */
router.get("/clinic-facilities", async (_req, res) => {
  try {
    const facilities = await listClinicFacilities();
    return res.json({ ok: true, facilities });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "list failed" });
  }
});

/** Zalo cá nhân (zca-js): trạng thái + đăng nhập QR — cảnh báo TOS / rủi ro khóa tài khoản. */
router.get("/zalo-personal/status", (_req, res) => {
  try {
    return res.json({ ok: true, ...zaloPersonalClient.getZaloPersonalStatus() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "status failed" });
  }
});

router.patch("/zalo-personal/notify-recipients", (req, res) => {
  try {
    const raw = Array.isArray(req.body?.notifyRecipients) ? req.body.notifyRecipients : [];
    const saved = zaloPersonalClient.saveNotifyRecipients(raw);
    return res.json({
      ok: true,
      ...saved,
      status: zaloPersonalClient.getZaloPersonalStatus()
    });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "save notify recipients failed" });
  }
});

router.post("/zalo-personal/login/start", (_req, res) => {
  try {
    const { sessionId } = zaloPersonalClient.startLoginQrSession();
    return res.json({ ok: true, sessionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "login start failed" });
  }
});

router.get("/zalo-personal/login/session/:id", (req, res) => {
  const s = zaloPersonalClient.getLoginSession(req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: "session_not_found" });
  return res.json({ ok: true, ...s });
});

router.post("/zalo-personal/login/abort", (req, res) => {
  const id = String(req.body?.sessionId || req.query?.sessionId || "").trim();
  zaloPersonalClient.abortLoginSession(id);
  return res.json({ ok: true });
});

router.post("/zalo-personal/disconnect", (_req, res) => {
  try {
    zaloPersonalClient.disconnectZaloPersonal();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "disconnect failed" });
  }
});

router.post("/zalo-personal/test-send", async (req, res) => {
  const text = String(req.body?.text || "").trim() || "Test tin từ Chatbot Manager (Zalo cá nhân).";
  try {
    const out = await zaloPersonalClient.sendZaloPersonalToNotifyRecipients(text);
    return res.json({ ok: true, ...out });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error: error.message || "send failed",
      code: error.code || null,
      failures: Array.isArray(error.failures) ? error.failures : []
    });
  }
});

router.get("/clinic-appointments", async (req, res) => {
  try {
    const officeKey = String(req.query.office || "").trim();
    const single = String(req.query.date || "").trim();
    let fromDate = String(req.query.fromDate || "").trim();
    let toDate = String(req.query.toDate || "").trim();
    if (single) {
      fromDate = single;
      toDate = single;
    }
    if (!fromDate && !toDate) {
      const dr = defaultRangeFromToday();
      fromDate = dr.fromDate;
      toDate = dr.toDate;
    } else if (fromDate && !toDate) {
      toDate = addDaysYmd(fromDate, DEFAULT_RANGE_DAYS - 1);
    } else if (!fromDate && toDate) {
      fromDate = addDaysYmd(toDate, -(DEFAULT_RANGE_DAYS - 1));
    }
    const grouped = String(req.query.grouped || "1").trim() !== "0";
    if (grouped) {
      const enrich = String(req.query.enrich || "1").trim() !== "0";
      const out = await listClinicAppointmentsForRangeGrouped({
        fromDate,
        toDate,
        officeKey,
        enrichMatches: enrich
      });
      return res.json({
        ok: true,
        clinicHours: CLINIC_RECEPTION_HOURS,
        defaultRangeDays: DEFAULT_RANGE_DAYS,
        fromDate: out.fromDate,
        toDate: out.toDate,
        officeKey: out.officeKey,
        days: out.days
      });
    }
    const limit = Number.parseInt(String(req.query.limit || "500"), 10);
    const out = await listClinicAppointments({ date: fromDate, officeKey, limit });
    if (out.error) return res.status(400).json({ ok: false, error: out.error });
    return res.json({
      ok: true,
      clinicHours: CLINIC_RECEPTION_HOURS,
      defaultRangeDays: DEFAULT_RANGE_DAYS,
      date: out.date,
      officeKey: out.officeKey,
      rows: out.rows
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "list failed" });
  }
});

router.post("/clinic-appointments/sync", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const officesRaw = body.offices;
    const offices = Array.isArray(officesRaw)
      ? officesRaw.map((x) => String(x || "").trim()).filter(Boolean)
      : null;
    let fromDate = String(body.fromDate || req.query.fromDate || "").trim();
    let toDate = String(body.toDate || req.query.toDate || "").trim();
    const oneDay = String(body.date || req.query.date || "").trim();
    if (oneDay && !fromDate) {
      fromDate = oneDay;
      toDate = oneDay;
    }
    if (!fromDate && !toDate) {
      const dr = defaultRangeFromToday();
      fromDate = dr.fromDate;
      toDate = dr.toDate;
    } else if (fromDate && !toDate) {
      toDate = addDaysYmd(fromDate, DEFAULT_RANGE_DAYS - 1);
    } else if (!fromDate && toDate) {
      fromDate = addDaysYmd(toDate, -(DEFAULT_RANGE_DAYS - 1));
    }
    const meta = await syncClinicAppointmentsForRange(fromDate, toDate, offices || undefined);
    return res.json({ ok: true, meta });
  } catch (error) {
    logError({
      source: "clinic-appointments",
      message: `sync failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /clinic-appointments/sync" }
    });
    return res.status(502).json({ ok: false, error: error.message || "sync failed" });
  }
});

router.get("/runtime-config", (req, res) => {
  res.json(serializeChannelConfigForClient(getRuntimeConfig()));
});

/** Facebook app tokens: status for Chatbot Manager (secrets are not returned). */
router.get("/facebook-config", (req, res) => {
  try {
    const fb = getFacebookMessengerConfig();
    const envVerify = String(process.env.FB_VERIFY_TOKEN || "").trim();
    const envPage = String(process.env.FB_PAGE_ACCESS_TOKEN || "").trim();
    const envPageName = String(process.env.FB_PAGE_NAME || "").trim();
    let oauthRuntimeFile = false;
    let oauthPageCount = 0;
    try {
      oauthRuntimeFile = fs.existsSync(OAUTH_RESULT_FILE);
      if (oauthRuntimeFile) {
        const v2 = readFacebookOauthRuntimeV2();
        oauthPageCount = Array.isArray(v2?.pages) ? v2.pages.length : 0;
      }
    } catch (_) {}
    return res.json({
      pageName: String(fb.pageName || "").trim(),
      defaultPageId: fb.defaultPageId || null,
      env: {
        hasPageName: Boolean(envPageName),
        hasVerifyToken: Boolean(envVerify),
        hasPageAccessToken: Boolean(envPage)
      },
      oauthRuntimeFile,
      oauthPageCount,
      effective: {
        configured: isFacebookConfigured()
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot load Facebook config." });
  }
});

router.patch("/runtime-config/facebook-messenger", (req, res) => {
  try {
    const body = req.body || {};
    if (!("pageName" in body) && !("verifyToken" in body) && !("pageAccessToken" in body)) {
      return res.status(400).json({ error: "Can nhat it nhat mot truong: pageName, verifyToken, pageAccessToken." });
    }
    logConfigChange({
      action: "update-facebook-messenger-skipped",
      config: {
        facebook: {
          fromEnvOnly: true,
          hasPageName: "pageName" in body,
          hasVerifyToken: "verifyToken" in body,
          hasPageAccessToken: "pageAccessToken" in body
        }
      },
      metadata: { endpoint: "PATCH /api/chatbot/runtime-config/facebook-messenger" }
    });
    emitChannelConnectionsEvent("runtime-config-updated");
    return res.json({
      message:
        "Khong luu SQLite. Dat FB_PAGE_NAME, FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN trong private/.env va khoi dong lai server.",
      config: serializeChannelConfigForClient(getRuntimeConfig())
    });
  } catch (error) {
    logError({
      source: "config",
      message: `Facebook Messenger update failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/chatbot/runtime-config/facebook-messenger" }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat Facebook Messenger." });
  }
});

router.get("/channel-connections", async (_req, res) => {
  try {
    const channels = await buildChannelConnectionsSnapshot();
    return res.json({ channels });
  } catch (error) {
    return res.status(500).json({ error: error.message || "channel-connections failed" });
  }
});

/** Trạng thái bot đang xử lý / trả lời khách (LLM + gửi Messenger), phục vụ Chatbot Manager. */
router.get("/bot-reply-status", (_req, res) => {
  try {
    return res.json(getBotReplyStatus());
  } catch (error) {
    return res.status(500).json({ error: error.message || "bot-reply-status failed" });
  }
});

router.get("/openai-models", (req, res) => {
  try {
    res.json({
      models: listChatModelsWithEstimates()
    });
  } catch (error) {
    logError({
      source: "openai-models",
      message: `List models failed: ${error.message}`,
      error,
      metadata: { endpoint: "GET /api/openai-models" }
    });
    return res.status(500).json({ error: error.message || "Khong the tai danh sach model." });
  }
});

router.patch("/runtime-config/openai-model", (req, res) => {
  try {
    const model = String(req.body?.model || "").trim();
    if (!model) {
      return res.status(400).json({ error: "Model khong duoc de trong." });
    }
    if (!isKnownChatModelId(model)) {
      return res.status(400).json({ error: "Model khong nam trong danh sach ho tro." });
    }
    const config = getRuntimeConfig();
    logConfigChange({
      action: "update-openai-model-skipped",
      config: { openai: { modelRequested: model, fromEnv: true } },
      metadata: { endpoint: "PATCH /api/runtime-config/openai-model" }
    });
    return res.json({
      message: "Model chat lay tu bien moi truong OPENAI_MODEL trong private/.env (khong luu database).",
      aiConfigReadOnly: true,
      config: serializeChannelConfigForClient(config)
    });
  } catch (error) {
    logError({
      source: "config",
      message: `OpenAI model update failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/runtime-config/openai-model" }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat model." });
  }
});

router.patch("/runtime-config/llm-provider", (req, res) => {
  try {
    const provider = String(req.body?.provider || "").trim().toLowerCase();
    if (!provider) return res.status(400).json({ error: "provider khong duoc de trong." });
    if (!["openai", "localai"].includes(provider)) {
      return res.status(400).json({ error: "provider chi ho tro: openai | localai" });
    }
    const config = getRuntimeConfig();
    logConfigChange({
      action: "update-llm-provider-skipped",
      config: { openai: { providerRequested: provider, fromEnv: true } },
      metadata: { endpoint: "PATCH /api/runtime-config/llm-provider" }
    });
    return res.json({
      message:
        "Chatbot Messenger luon dung OpenAI (embed + chat). LLM_PROVIDER trong private/.env khong con tac dong luong nay; khong luu database.",
      aiConfigReadOnly: true,
      config: serializeChannelConfigForClient(config)
    });
  } catch (error) {
    logError({
      source: "config",
      message: `LLM provider update failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/runtime-config/llm-provider" }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat provider." });
  }
});

router.patch("/runtime-config/localai", (req, res) => {
  try {
    const baseUrl = String(req.body?.baseUrl || "").trim();
    const apiKey = String(req.body?.apiKey || "").trim();
    const model = String(req.body?.model || "").trim();
    if (!baseUrl) return res.status(400).json({ error: "LOCALAI_BASE khong duoc de trong." });
    if (baseUrl.endsWith("/")) return res.status(400).json({ error: "LOCALAI_BASE khong duoc co dau / cuoi." });
    if (!apiKey) return res.status(400).json({ error: "LOCALAI_API_KEY khong duoc de trong." });
    const config = getRuntimeConfig();
    logConfigChange({
      action: "update-localai-skipped",
      config: { localai: { baseUrl, hasApiKey: !!apiKey, model, fromEnv: true } },
      metadata: { endpoint: "PATCH /api/runtime-config/localai" }
    });
    return res.json({
      message:
        "LocalAI lay tu LOCALAI_BASE, LOCALAI_API_KEY, LOCALAI_MODEL trong private/.env (khong luu database).",
      aiConfigReadOnly: true,
      config: serializeChannelConfigForClient(config)
    });
  } catch (error) {
    logError({
      source: "config",
      message: `LocalAI update failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/runtime-config/localai" }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat LocalAI." });
  }
});

router.put("/runtime-config", (req, res) => {
  try {
    const body = req.body || {};
    const patchSummary = {
      facebookMessenger: Boolean(body.channels?.facebookMessenger && typeof body.channels.facebookMessenger === "object"),
      appPort: Boolean(body.app && body.app.port != null)
    };
    logConfigChange({
      action: "update-runtime-config-skipped",
      config: { ...patchSummary, fromEnvOnly: true },
      metadata: { endpoint: "PUT /api/runtime-config" }
    });
    emitChannelConnectionsEvent("runtime-config-updated");

    return res.json({
      message:
        "Khong luu SQLite. PORT, FB_*, OPENAI_* dat trong private/.env; chatbot dung OpenAI. Khoi dong lai server sau khi sua.",
      aiConfigReadOnly: true,
      config: serializeChannelConfigForClient(getRuntimeConfig())
    });
  } catch (error) {
    logError({
      source: "config",
      message: `Config update failed: ${error.message}`,
      error,
      metadata: { endpoint: "PUT /api/runtime-config" }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat cau hinh he thong." });
  }
});

router.get("/prompt", async (req, res) => {
  const provider = resolvePromptProvider(req);
  const activePrompt = await getActivePrompt(provider);
  res.json({
    prompt: activePrompt.content,
    promptId: activePrompt.id,
    title: activePrompt.title,
    provider
  });
});

router.get("/prompts", async (req, res) => {
  const provider = resolvePromptProvider(req);
  const library = await loadPromptLibrary(provider);
  res.json({
    provider,
    ...serializePromptLibraryForClient(library)
  });
});

router.get("/openai/prompts", async (req, res) => {
  req.query = { ...(req.query || {}), provider: "openai" };
  const library = await loadPromptLibrary("openai");
  return res.json({
    provider: "openai",
    ...serializePromptLibraryForClient(library)
  });
});

router.get("/localai/prompts", async (req, res) => {
  req.query = { ...(req.query || {}), provider: "localai" };
  const library = await loadPromptLibrary("localai");
  return res.json({
    provider: "localai",
    ...serializePromptLibraryForClient(library)
  });
});

router.post("/prompts", async (req, res) => {
  return res.status(400).json({
    error: "PROMPT_FILE_ONLY",
    message:
        "Prompt DB da tat. Dung chatbot/server/prompts/conversationSetup.txt + chatCases.txt (+ monthlyPromotionsByOffice.txt) — promptLibrary.js tu dong noi khi load."
  });
});

router.post("/openai/prompts", async (req, res) => {
  return res.status(400).json({
    error: "PROMPT_FILE_ONLY",
    message:
        "Prompt DB da tat. Dung chatbot/server/prompts/conversationSetup.txt + chatCases.txt (+ monthlyPromotionsByOffice.txt) — promptLibrary.js tu dong noi khi load."
  });
});

router.post("/localai/prompts", async (req, res) => {
  return res.status(400).json({
    error: "PROMPT_FILE_ONLY",
    message:
        "Prompt DB da tat. Dung chatbot/server/prompts/conversationSetup.txt + chatCases.txt (+ monthlyPromotionsByOffice.txt) — promptLibrary.js tu dong noi khi load."
  });
});

router.put("/prompts/:promptId", async (req, res) => {
  try {
    const provider = resolvePromptProvider(req);
    const title = String(req.body?.title || "").trim();
    const prompt = String(req.body?.prompt || "").trim();

    if (!title) {
      return res.status(400).json({ error: "Ten prompt khong duoc de trong." });
    }

    if (!prompt) {
      return res.status(400).json({ error: "Prompt khong duoc de trong." });
    }

    return res.json({
      message: "Da cap nhat prompt.",
      provider,
      ...serializePromptLibraryForClient(
        await updatePrompt(req.params.promptId, {
          title,
          content: prompt,
          provider
        })
      )
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the cap nhat prompt." });
  }
});

router.put("/prompts/active/:promptId", async (req, res) => {
  return res.status(400).json({
    error: "PROMPT_FILE_ONLY",
    message:
        "Prompt DB da tat. Dung chatbot/server/prompts/conversationSetup.txt + chatCases.txt (+ monthlyPromotionsByOffice.txt) — promptLibrary.js tu dong noi khi load."
  });
});

router.delete("/prompts/:promptId", async (req, res) => {
  return res.status(400).json({
    error: "PROMPT_FILE_ONLY",
    message:
        "Prompt DB da tat. Dung chatbot/server/prompts/conversationSetup.txt + chatCases.txt (+ monthlyPromotionsByOffice.txt) — promptLibrary.js tu dong noi khi load."
  });
});

router.get("/knowledge-base", async (req, res) => {
  const provider = resolveFlowProvider(req.query?.provider || requireChatbotLlmProvider());
  const kb = await loadKnowledgeBase({ namespace: provider });
  res.json(serializeKnowledgeBaseForClient(kb));
});

router.get("/openai/knowledge-base", async (_req, res) => {
  const kb = await loadKnowledgeBase({ namespace: "openai" });
  return res.json(serializeKnowledgeBaseForClient(kb));
});

router.get("/localai/knowledge-base", async (_req, res) => {
  const kb = await loadKnowledgeBase({ namespace: "localai" });
  return res.json(serializeKnowledgeBaseForClient(kb));
});

router.get("/knowledge-base/template", async (req, res) => {
  try {
    const format = String(req.query?.format || "xlsx").trim().toLowerCase();
    const sampleRows = [
      {
        id: "RANGSU-001",
        category: "Dich vu",
        question: "Nho rang su duoc bao hanh bao lau?",
        answer: "Thong thuong bao hanh 12 thang tuy tinh trang rang.",
        keywords: "bao hanh;rang su",
        conditions: "Ap dung sau khi tai kham dinh ky",
        channel_scope: "all",
        priority: 5,
        effective_from: "2026-01-01",
        effective_to: "",
        status: "active",
        source_url: "https://example.com/policy/warranty"
      },
      {
        id: "RANGSU-002",
        category: "Gia",
        question: "Nieng rang trong suot co tra gop khong?",
        answer: "Co ho tro tra gop theo tung goi dieu tri.",
        keywords: "nieng rang;tra gop",
        conditions: "Can tham kham de chot phac do",
        channel_scope: "all",
        priority: 4,
        effective_from: "2026-01-01",
        effective_to: "",
        status: "active",
        source_url: "https://example.com/pricing/installment"
      },
      {
        id: "RANGSU-003",
        category: "Lich hen",
        question: "Phong kham lam viec den may gio?",
        answer: "Phong kham lam viec 8:00 - 20:00 tat ca cac ngay.",
        keywords: "gio lam viec;lich hen",
        conditions: "",
        channel_scope: "all",
        priority: 3,
        effective_from: "2026-01-01",
        effective_to: "",
        status: "active",
        source_url: "https://example.com/clinic-hours"
      }
    ];
    const headers = [
      "id",
      "category",
      "question",
      "answer",
      "keywords",
      "conditions",
      "channel_scope",
      "priority",
      "effective_from",
      "effective_to",
      "status",
      "source_url"
    ];
    if (format === "csv") {
      const escapeCsv = (value) => {
        const text = String(value ?? "");
        if (text.includes(",") || text.includes('"') || text.includes("\n")) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };
      const lines = [headers.join(",")];
      for (const row of sampleRows) {
        lines.push(headers.map((key) => escapeCsv(row[key])).join(","));
      }
      const csv = `${lines.join("\n")}\n`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"knowledge-base-template.csv\"");
      return res.send(csv);
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("knowledge_template");
    sheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(14, header.length + 4)
    }));
    sampleRows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=\"knowledge-base-template.xlsx\"");
    const buffer = await workbook.xlsx.writeBuffer();
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tao file template." });
  }
});

router.post("/knowledge-base", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    const record = req.body?.record;
    const source = String(req.body?.source || "manual").trim() || "manual";
    const sourceType = String(req.body?.sourceType || "manual").trim() || "manual";

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return res.status(400).json({ error: "record phai la mot object hop le." });
    }

    const { knowledgeBase, embeddingResult } = await addKnowledgeBaseEntry({
      record,
      source,
      sourceType,
      embedText: (text) => embedText(text, { provider }),
      namespace: provider
    });

    return res.json({
      message: "Da them ban ghi.",
      knowledgeBase: serializeKnowledgeBaseForClient(knowledgeBase)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the them ban ghi." });
  }
});

router.put("/knowledge-base/:entryId", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    const { entryId } = req.params;
    const record = req.body?.record;

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return res.status(400).json({ error: "record phai la mot object hop le." });
    }

    const { knowledgeBase, embeddingResult } = await updateKnowledgeBaseEntry({
      entryId,
      record,
      embedText: (text) => embedText(text, { provider }),
      namespace: provider
    });

    return res.json({
      message: "Cap nhat ban ghi thanh cong.",
      knowledgeBase: serializeKnowledgeBaseForClient(knowledgeBase)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the cap nhat ban ghi." });
  }
});

router.delete("/knowledge-base/:entryId", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    const { entryId } = req.params;
    const kb = await deleteKnowledgeBaseEntry(entryId, { namespace: provider });

    return res.json({
      message: "Da xoa ban ghi.",
      knowledgeBase: serializeKnowledgeBaseForClient(kb)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the xoa ban ghi." });
  }
});

router.delete("/knowledge-base", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    const kb = await clearKnowledgeBase({ namespace: provider });

    return res.json({
      message: "Da xoa toan bo du lieu da import.",
      knowledgeBase: serializeKnowledgeBaseForClient(kb)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the xoa toan bo du lieu." });
  }
});

router.post("/knowledge-base/re-embed", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || requireChatbotLlmProvider());
    const kb = await loadKnowledgeBase({ namespace: provider });
    const texts = (kb.entries || []).map((entry) => String(entry?.text || "").trim()).filter(Boolean);
    if (!texts.length) {
      return res.json({ message: "Khong co du lieu de embedding.", provider, entries: 0 });
    }
    const embeddingResult = await embedTexts(texts, { provider });
    const embeddings = Array.isArray(embeddingResult?.embeddings) ? embeddingResult.embeddings : [];
    const entries = kb.entries.map((entry, index) => ({
      ...entry,
      embedding: Array.isArray(embeddings[index]) ? embeddings[index] : []
    }));
    const nextKb = {
      ...kb,
      updatedAt: new Date().toISOString(),
      embeddingModel: embeddingResult?.model || kb.embeddingModel || null,
      entries
    };
    await saveKnowledgeBase(nextKb, { namespace: provider });
    return res.json({
      message: "Da cap nhat embedding database.",
      provider,
      entries: entries.length,
      embeddingModel: nextKb.embeddingModel
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the cap nhat embedding." });
  }
});

router.post("/knowledge-base/debug-retrieval", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    const topK = Math.max(1, Math.min(30, Number(req.body?.topK || 10)));
    const conversationId = String(req.body?.conversationId || "").trim();
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    if (!query) return res.status(400).json({ error: "query khong duoc de trong." });
    const kb = await loadKnowledgeBase({ namespace: provider });
    const embedding = await embedText(query, { provider });
    const matches = rankEntriesHybrid({
      query,
      questionEmbedding: embedding.embedding,
      entries: kb.entries,
      topK,
      vectorWeight: Number(kb?.retrieval?.vectorWeight || 0.78),
      keywordWeight: Number(kb?.retrieval?.keywordWeight || 0.22)
    });
    const qualified = filterRetrievalMatches(matches, kb.retrieval);
    let memoryMatches = [];
    if (conversationId) {
      memoryMatches = await retrieveConversationMemory({
        conversationId,
        queryEmbedding: embedding.embedding,
        topK: Math.min(8, topK),
        namespace: provider
      });
    }
    return res.json({
      query,
      topK,
      provider,
      retrieval: kb?.retrieval || null,
      thresholds: getRetrievalThresholds(kb?.retrieval),
      matches: matches.map((item) => ({
        id: item.id,
        source: item.source,
        category: item.category || null,
        status: item.status || null,
        priority: item.priority || 3,
        similarity: Number((item.similarity || 0).toFixed(4)),
        lexicalSimilarity: Number((item.lexicalSimilarity || 0).toFixed(4)),
        rerankScore: Number((item.rerankScore || 0).toFixed(4)),
        text: item.text
      })),
      qualifiedMatches: qualified.map((item) => ({
        id: item.id,
        source: item.source,
        similarity: Number((item.similarity || 0).toFixed(4)),
        lexicalSimilarity: Number((item.lexicalSimilarity || 0).toFixed(4)),
        rerankScore: Number((item.rerankScore || 0).toFixed(4)),
        text: item.text
      })),
      memoryMatches: memoryMatches.map((item) => ({
        id: item.id,
        similarity: Number((item.similarity || 0).toFixed(4)),
        text: item.text
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the debug retrieval." });
  }
});

router.post("/database/reset", async (_req, res) => {
  try {
    await clearUsageLog();
    clearServerLogs();
    await clearKnowledgeBase({ namespace: "openai" });
    await clearKnowledgeBase({ namespace: "localai" });
    await clearHistoryMemory({ namespace: "openai" });
    await clearHistoryMemory({ namespace: "localai" });
    await clearChatHistory();
    const rebuildResults = await rebuildAllChatbotKnowledgeBasesFromSourceFile();
    // Prompt DB disabled (file-only mode), so no prompt reset in SQLite.
    const versionData = await incrementAndSaveVersion();
    return res.json({
      message: "Da tao moi database va rebuild knowledge base tu file JSON nguon.",
      version: versionData?.version || null,
      rebuiltKnowledgeBases: rebuildResults
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the reset database." });
  }
});

router.post("/import/xlsx", upload.single("file"), async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    if (!req.file) {
      return res.status(400).json({ error: "Vui long tai len file XLSX." });
    }
    if (String(req.file.originalname || "").startsWith("~$")) {
      return res.status(400).json({
        error: "Ban dang chon file tam cua Excel (~$...). Vui long dong Excel va chon file XLSX goc."
      });
    }

    const rows = await importFromXlsx(req.file.path);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        error: "File XLSX khong co du lieu hop le sau dong header. Kiem tra lai cot/question/answer."
      });
    }
    const { knowledgeBase, embeddingResult } = await replaceKnowledgeBase({
      sourceName: req.file.originalname,
      sourceType: "xlsx",
      rows,
      embedTexts: (texts) => embedTexts(texts, { provider }),
      embeddingModel:
        provider === "localai"
          ? String(
              getRuntimeConfig().localai?.embeddingModel || getRuntimeConfig().localai?.model || ""
            ).trim()
          : String(getRuntimeConfig().openai.embeddingModel || "").trim(),
      namespace: provider
    });

    return res.json({
      message: "Import XLSX thanh cong.",
      sources: knowledgeBase.sources,
      entries: knowledgeBase.entries.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Import XLSX that bai." });
  } finally {
    removeUploadedFile(req.file?.path);
  }
});

router.post("/import/google-sheet", async (req, res) => {
  try {
    const provider = resolveFlowProvider(req.body?.provider || req.query?.provider || requireChatbotLlmProvider());
    const { sheetUrl, sheetName } = req.body || {};
    if (!sheetUrl) {
      return res.status(400).json({ error: "Vui long cung cap sheetUrl." });
    }

    const rows = await importFromGoogleSheet(sheetUrl, sheetName);
    const { knowledgeBase, embeddingResult } = await replaceKnowledgeBase({
      sourceName: sheetUrl,
      sourceType: "google-sheet",
      rows,
      embedTexts: (texts) => embedTexts(texts, { provider }),
      embeddingModel:
        provider === "localai"
          ? String(
              getRuntimeConfig().localai?.embeddingModel || getRuntimeConfig().localai?.model || ""
            ).trim()
          : String(getRuntimeConfig().openai.embeddingModel || "").trim(),
      namespace: provider
    });

    return res.json({
      message: "Import Google Sheet thanh cong.",
      sources: knowledgeBase.sources,
      entries: knowledgeBase.entries.length
    });
  } catch (error) {
    logError({
      source: "import",
      message: `Import Google Sheet failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/import/google-sheet" }
    });
    return res.status(500).json({ error: error.message || "Import Google Sheet that bai." });
  }
});

router.get("/facebook", verifyFacebookWebhook);

/** Payload nhẹ cho appendServerLog + fanout SSE — tránh stringify event đầy ảnh/URL làm webhook chậm hoặc nginx chờ upstream. */
function summarizeFacebookWebhookMessagingEvent(event) {
  if (!event || typeof event !== "object") return {};
  const msg = event.message && typeof event.message === "object" ? event.message : {};
  const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
  const snippet = typeof msg.text === "string" ? msg.text.slice(0, 240) : null;
  return {
    senderId: event.sender?.id ?? null,
    recipientId: event.recipient?.id ?? null,
    timestamp: event.timestamp ?? null,
    mid: msg.mid ?? null,
    textSnippet: snippet,
    isEcho: Boolean(msg.is_echo),
    attachmentCount: atts.length,
    attachmentKinds: atts.map((a) => String(a?.type || "").trim()).filter(Boolean).slice(0, 8),
    hasPostback: Boolean(event.postback),
    deliveryWatermark: event.delivery?.watermark ?? null,
    readWatermark: event.read?.watermark ?? null
  };
}

/** Hiển thị hội thoại + bubble tin đến: luôn dùng tên người gửi, không nhét tên Page vào nhãn khách. */
function resolveMessengerCustomerParticipantLabel(senderId, displayName) {
  const name = String(displayName || "").trim();
  if (name) return name;
  const sid = String(senderId || "").trim();
  return sid ? `Facebook User ${sid}` : "Facebook User";
}

function findLastIncomingUserMessageText(conversation) {
  const msgs = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const sorted = [...msgs].sort((a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime();
    const tb = new Date(b?.createdAt || 0).getTime();
    return ta - tb;
  });
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const m = sorted[i];
    if (String(m?.direction || "") !== "incoming") continue;
    const text = String(m?.text || "").trim();
    if (text) return text;
  }
  return "";
}

async function sendFacebookReplyAndPersist({
  senderId,
  facebookPageId = null,
  text,
  participantLabel,
  metadata = {},
  source = "facebook-webhook",
  media = null,
  publicMediaUrl = null,
  customerIntakeCollected = null,
  pageAccessToken = null
}) {
  const psid = String(senderId || "").trim();
  const pageIdForDb = String(facebookPageId || "").trim();
  const dbParticipantId = buildFacebookMessengerParticipantId(pageIdForDb, psid) || psid;
  const replyText = String(text || "").trim();
  const hasText = Boolean(replyText);
  const hasMedia = Boolean(media && (publicMediaUrl || media?.publicUrl || media?.url || media?.mediaUrl));
  const tokenOpts = {
    ...(pageIdForDb ? { pageId: pageIdForDb } : {}),
    ...(String(pageAccessToken || "").trim() ? { pageAccessToken: String(pageAccessToken).trim() } : {})
  };

  if (!hasText && !hasMedia) {
    throw new Error("Reply text is empty and media is missing.");
  }

  // Lưu DB trước khi gọi Graph API: nếu gửi FB thành công mà append sau đó lỗi, khách đã nhận tin
  // nhưng dashboard/SQLite không có — tránh lệch trạng thái đó.
  await appendChatMessage({
    channel: "facebook-messenger",
    participantId: dbParticipantId,
    participantLabel,
    direction: "outgoing",
    text: replyText,
    metadata: {
      source,
      platform: "facebook",
      senderId: psid,
      ...(pageIdForDb
        ? {
            facebookPageId: pageIdForDb,
            facebookPageName:
              String(getFacebookPageLabelName(pageIdForDb) || getFacebookMessengerConfig().pageName || "").trim() ||
              null
          }
        : {}),
      ...metadata,
      ...(customerIntakeCollected != null && typeof customerIntakeCollected === "object"
        ? { customerIntakeCollected }
        : {}),
      ...(media
        ? {
            media: {
              kind: media?.kind || media?.type || null,
              mediaId: media?.mediaId || null,
              mediaUrl: media?.mediaUrl || media?.url || null,
              mimeType: media?.mimeType || null,
              fileName: media?.fileName || null
            }
          }
        : {})
    }
  });
  emitChatHistoryEvent("conversation_message_assistant", `facebook-messenger:${dbParticipantId}`, {
    channel: "facebook-messenger"
  });

  if (hasText) {
    await sendFacebookMessage(psid, replyText, tokenOpts);
  }

  if (hasMedia) {
    const url = publicMediaUrl || media?.publicUrl || media?.url || media?.mediaUrl;
    await sendFacebookMediaMessage(
      psid,
      {
        kind: media?.kind || media?.type || "image",
        url
      },
      tokenOpts
    );
  }
}

router.post("/facebook", (req, res) => {
  registerOnlineRequest(req, "webhook/facebook");
  channelRealtimeState.facebookMessenger.lastEventAt = new Date().toISOString();
  const webhookBodySnapshot = req.body;

  processFacebookWebhook(req, res, async ({
    senderId,
    text,
    attachments,
    rawEvent,
    providerMessageId,
    pageId
  }) => {
    const resolvedPageId = resolveFacebookWebhookPageId({ pageId, rawEvent });
    const fbMid = providerMessageId || rawEvent?.message?.mid || null;
    let pageAccessToken = getFacebookPageAccessTokenForPage(resolvedPageId);
    const pageLabelName = getFacebookPageLabelName(resolvedPageId);
    const pidForToken = String(resolvedPageId || "").trim();
    if (pidForToken && canSyncFromVps()) {
      const { pages } = readFacebookOauthRuntimeV2();
      const hasPageToken = pages.some((p) => p.pageId === pidForToken && p.pageAccessToken);
      if (!hasPageToken) {
        await syncFacebookOauthFromVps({ force: true }).catch(() => {});
        pageAccessToken = getFacebookPageAccessTokenForPage(resolvedPageId);
      }
    }
    const scopedMessengerParticipant = buildFacebookMessengerParticipantId(resolvedPageId, senderId);
    if (fbMid) {
      const claimed = await claimProviderMessageId("facebook", fbMid);
      if (!claimed) {
        appendServerLog({
          level: "info",
          source: "facebook-webhook",
          message: "Duplicate Facebook message id (mid) skipped",
          metadata: { mid: fbMid, senderId }
        });
        return null;
      }
    }

    const conversationIdForProfile = `facebook-messenger:${scopedMessengerParticipant}`;
    const existingConv = await getConversationById(conversationIdForProfile);
    const senderProfile = await resolveFacebookSenderProfile({
      senderId,
      pageId: resolvedPageId,
      pageAccessToken,
      rawEvent,
      existingProfile: existingConv?.participantProfile || null,
      existingLabel: existingConv?.participantLabel || ""
    });
    const displayName = senderProfile.displayName;
    const fbProfile = senderProfile.patch;

    appendServerLog({
      level: "info",
      source: "facebook-webhook-message",
      message: "Facebook Messenger event received",
      request: summarizeFacebookWebhookMessagingEvent(rawEvent)
    });

    const incomingMedia = Array.isArray(attachments)
      ? (() => {
          for (const att of attachments) {
            const attType = String(att?.type || '').trim().toLowerCase();
            const kind = attType === 'image' ? 'image' : attType === 'video' ? 'video' : null;
            const mediaUrl = att?.payload?.url || att?.payload?.media_url || null;
            if (!kind || !mediaUrl) continue;
            return {
              kind,
              mediaUrl: String(mediaUrl),
              mediaId: null,
              mimeType: att?.payload?.mime_type || null,
              fileName: att?.payload?.filename || null
            };
          }
          return null;
        })()
      : null;

    const resolvedPageName =
      String(pageLabelName || getFacebookMessengerConfig().pageName || "").trim() || null;

    await appendChatMessage({
      channel: "facebook-messenger",
      participantId: scopedMessengerParticipant,
      participantLabel: resolveMessengerCustomerParticipantLabel(senderId, displayName),
      direction: "incoming",
      text,
      createdAt: rawEvent?.timestamp ? new Date(rawEvent.timestamp).toISOString() : new Date().toISOString(),
      metadata: {
        source: "facebook-webhook",
        platform: "facebook",
        senderId,
        facebookPageId: resolvedPageId || null,
        facebookPageName: resolvedPageName,
        recipientId: rawEvent?.recipient?.id || null,
        messageId: rawEvent?.message?.mid || null,
        providerMessageId: fbMid,
        postbackPayload: rawEvent?.postback?.payload || null,
        senderName: senderProfile.senderName || displayName,
        gender: senderProfile.gender || fbProfile?.gender || null,
        avatarUrl: senderProfile.avatarUrl || fbProfile?.avatarUrl || null,
        givenName: senderProfile.givenName || fbProfile?.givenName || null,
        familyName: senderProfile.familyName || fbProfile?.familyName || null,
        facebookLocale: senderProfile.facebookLocale || fbProfile?.facebookLocale || null,
        facebookTimezone:
          senderProfile.facebookTimezone != null
            ? senderProfile.facebookTimezone
            : fbProfile?.facebookTimezone != null
              ? fbProfile.facebookTimezone
              : null,
        media: incomingMedia
      }
    });
    emitChatHistoryEvent("conversation_message", `facebook-messenger:${scopedMessengerParticipant}`, {
      channel: "facebook-messenger"
    });

    // Skip auto-reply when there's no caption/text (we still persist the media in chat history)
    if (!String(text || '').trim()) {
      return null;
    }

    const botPagePolicy = getFacebookPageBotReplyPolicy(resolvedPageId);
    if (!botPagePolicy.allow) {
      appendServerLog({
        level: "info",
        source: "facebook-page-settings",
        message: POLICY_SKIP_MESSAGES[botPagePolicy.reason] || "Skip auto-reply: page policy",
        metadata: {
          pageId: botPagePolicy.pageId || resolvedPageId,
          pageName: botPagePolicy.pageName || pageLabelName || null,
          senderId,
          policyReason: botPagePolicy.reason,
          authorizedPageIds: botPagePolicy.authorizedPageIds || undefined
        }
      });
      return null;
    }

    let botReplyTraceId = null;
    try {
      const activeProvider = getActiveFlowProvider();
      const conversationIdForStatus = `facebook-messenger:${scopedMessengerParticipant}`;
      botReplyTraceId = beginBotReply({
        conversationId: conversationIdForStatus,
        participantId: scopedMessengerParticipant,
        participantLabel: resolveMessengerCustomerParticipantLabel(senderId, displayName),
        channel: "facebook-messenger",
        endpoint: "POST /webhooks/facebook",
        facebookPageId: resolvedPageId || null,
        facebookPageName: resolvedPageName,
        incomingPreview: String(text || "")
          .trim()
          .slice(0, 200)
      });
      const result = await answerQuestion(text, "POST /webhooks/facebook", {
        channel: "facebook-messenger",
        senderId,
        facebookPageId: resolvedPageId || null,
        provider: activeProvider
      });

      if (result?.skippedLlm || result?.metadata?.skippedLlm) {
        appendServerLog({
          level: "info",
          source: "care-status",
          message: "Facebook: skipped auto-reply (careStatus not bot_care)",
          metadata: { senderId, careStatus: result?.metadata?.careStatus }
        });
        return null;
      }

      const replyBody = String(result.answer || "").trim();
      if (!replyBody) {
        appendServerLog({
          level: "warn",
          source: "facebook-webhook",
          message: "Facebook: empty bot reply, skip Messenger send",
          metadata: {
            senderId,
            botParseNote: result.metadata?.botParseNote || null
          }
        });
        return null;
      }

      const intakeSnapRaw =
        result.metadata?.botEnvelope?.collected != null
          ? normalizeCollected(result.metadata.botEnvelope.collected)
          : null;
      const intakeSnap = collectedSnapshotHasData(intakeSnapRaw) ? intakeSnapRaw : null;
      await sendFacebookReplyAndPersist({
        senderId,
        facebookPageId: resolvedPageId || null,
        text: result.answer,
        participantLabel: resolveMessengerCustomerParticipantLabel(senderId, displayName),
        source: "facebook-webhook",
        customerIntakeCollected: intakeSnap,
        pageAccessToken,
        metadata: {
          senderName: displayName,
          matchedEntries: result.metadata?.entriesUsed || 0,
          botPhase: result.metadata?.botEnvelope?.conversation_phase || null,
          botActionsApplied: result.metadata?.botStructuredApplied || null,
          botParseNote: result.metadata?.botParseNote || null
        }
      });

      // Reply already sent manually above; do not let webhook helper send again.
      return null;
    } catch (flowErr) {
      throw flowErr;
    } finally {
      endBotReply(botReplyTraceId);
    }
  });

  // Đặt SAU processFacebookWebhook (đã gửi 200): emitter + SSE fanout từng event gốc có thể nặng.
  queueMicrotask(() => {
    try {
      emitChannelConnectionsEvent("facebook-webhook-received");
      if (getChatbotLogMode() !== "normal") return;
      const entries = Array.isArray(webhookBodySnapshot?.entry) ? webhookBodySnapshot.entry : [];
      entries.forEach((entry) => {
        const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];
        messagingEvents.forEach((eventItem) => {
          appendServerLog({
            level: "info",
            source: "facebook-webhook-raw",
            message: "Facebook webhook raw event received",
            request: summarizeFacebookWebhookMessagingEvent(eventItem)
          });
        });
      });
    } catch (_) {
      /* best-effort */
    }
  });
});

async function handleAskRequest(_req, res) {
  return res.status(410).json({
    error: "REMOVED",
    message: "Phien ban nay chi ho tro chatbot qua Facebook Messenger. Endpoint test-chat da ngung."
  });
}

router.post("/ask", async (req, res) => handleAskRequest(req, res));
router.post("/openai/ask", async (req, res) => handleAskRequest(req, res, "openai"));
router.post("/localai/ask", async (req, res) => handleAskRequest(req, res, "localai"));

async function handleManualConversationSend(req, res, conversationIdFromParam = "") {
  try {
    const conversationId = String(conversationIdFromParam || req.params?.conversationId || req.body?.conversationId || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!conversationId) return res.status(400).json({ error: "conversationId is required." });
    if (!text) return res.status(400).json({ error: "Vui long nhap noi dung." });

    const conversation = await getConversationById(conversationId);
    if (!conversation) return res.status(404).json({ error: "Khong tim thay cuoc hoi thoai." });

    if (!isActiveChatbotChannel(conversation.channel)) {
      return res.status(400).json({ error: "Chi ho tro gui tin qua Facebook Messenger." });
    }
    if (!isFacebookConfigured()) {
      return res.status(400).json({ error: "Facebook Messenger chua duoc cau hinh." });
    }
    const parsedManual = parseFacebookMessengerParticipantId(conversation.participantId);
    const recipientPsid = parsedManual.psid || conversation.participantId;
    const pageForToken = String(conversation.facebookMessengerPageId || parsedManual.pageId || "").trim();
    const manualPageToken = getFacebookPageAccessTokenForPage(pageForToken);
    await sendFacebookReplyAndPersist({
      senderId: recipientPsid,
      facebookPageId: pageForToken || null,
      text,
      participantLabel: conversation.participantLabel,
      source: "manual-operator-send",
      pageAccessToken: manualPageToken,
      metadata: {
        editable: true
      }
    });
    return res.json({ ok: true, conversationId, text });
  } catch (error) {
    logError({
      source: "manual-send",
      message: `Manual send failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/chat-history/:conversationId/send", conversationId: req.params?.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the gui tin nhan luc nay." });
  }
}

async function handleManualConversationSendMedia(req, res, conversationIdFromParam = "") {
  try {
    const conversationId = String(
      conversationIdFromParam || req.params?.conversationId || req.body?.conversationId || ""
    ).trim();
    const caption = String(req.body?.text || req.body?.caption || "").trim();

    if (!conversationId) return res.status(400).json({ error: "conversationId is required." });
    if (!req.file) return res.status(400).json({ error: "Vui l�ng t?i l�n ?nh/video." });

    const mimeType = String(req.file?.mimetype || "").trim().toLowerCase();
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
      return res.status(400).json({ error: "Ch? h? tr? image/* ho?c video/*." });
    }

    const kind = mimeType.startsWith("video/") ? "video" : "image";
    const cached = cacheChatGptVipAccessAttachment(req.file);
    if (!cached) {
      return res.status(500).json({ error: "Kh�ng th? cache ?nh/video." });
    }

    const conversation = await getConversationById(conversationId);
    if (!conversation) return res.status(404).json({ error: "Khong tim thay cuoc hoi thoai." });

    const media = {
      kind,
      mediaId: cached.mediaId,
      mediaUrl: cached.mediaUrl,
      mimeType,
      fileName: req.file?.originalname || null
    };

    const proto = String(req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http")).trim();
    const host = String(req.headers["host"] || "").trim();
    const origin = host ? `${proto}://${host}` : "";
    const publicMediaUrl = cached.mediaUrl?.startsWith("http")
      ? cached.mediaUrl
      : origin
        ? `${origin}${cached.mediaUrl}`
        : cached.mediaUrl;

    if (!isActiveChatbotChannel(conversation.channel)) {
      return res.status(400).json({ error: "Chi ho tro gui media qua Facebook Messenger." });
    }
    if (!isFacebookConfigured()) {
      return res.status(400).json({ error: "Facebook Messenger chua duoc cau hinh." });
    }

    const parsedMedia = parseFacebookMessengerParticipantId(conversation.participantId);
    const recipientPsidMedia = parsedMedia.psid || conversation.participantId;
    const pageForTokenMedia = String(conversation.facebookMessengerPageId || parsedMedia.pageId || "").trim();
    const manualMediaPageToken = getFacebookPageAccessTokenForPage(pageForTokenMedia);
    await sendFacebookReplyAndPersist({
      senderId: recipientPsidMedia,
      facebookPageId: pageForTokenMedia || null,
      text: caption,
      participantLabel: conversation.participantLabel,
      source: "manual-operator-send-media",
      pageAccessToken: manualMediaPageToken,
      metadata: {
        editable: true,
        kind
      },
      media,
      publicMediaUrl
    });

    return res.json({ ok: true, conversationId });
  } catch (error) {
    logError({
      source: "manual-send-media",
      message: `Manual send media failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/chat-history/send-media" }
    });
    return res.status(500).json({ error: error.message || "Khong the gui anh/video luc nay." });
  }
}

router.post("/chat-history/:conversationId/send", async (req, res) => {
  return handleManualConversationSend(req, res, req.params?.conversationId || "");
});

// Stable body-based endpoint to avoid proxy/path encoding 404 issues
router.post("/chat-history/send", async (req, res) => {
  return handleManualConversationSend(req, res, req.body?.conversationId || "");
});

router.post(
  "/chat-history/:conversationId/send-media",
  uploadChatbotMedia.single("media"),
  async (req, res) => {
    return handleManualConversationSendMedia(req, res, req.params?.conversationId || "");
  }
);

// Stable body-based endpoint for media uploads
router.post(
  "/chat-history/send-media",
  uploadChatbotMedia.single("media"),
  async (req, res) => {
    return handleManualConversationSendMedia(req, res, req.body?.conversationId || "");
  }
);

async function serializeChatGptVipAccessConversation(username) {
  const chatGptVipAccess = await getChatGptVipAccessConversationByUsername(username);
  const messages = (chatGptVipAccess.messages || []).map((message) => ({
    id: message.id,
    role: message.role || (message.direction === "incoming" ? "user" : "assistant"),
    direction: message.direction || (message.role === "assistant" ? "outgoing" : "incoming"),
    text: message.text,
    createdAt: message.createdAt,
    seenAt: message.seenAt || null,
    readAt: message.readAt || null,
    metadata: message.metadata || {}
  }));

  const lastMessage = messages.length ? messages[messages.length - 1] : null;

  return {
    id: `${CHAT_GPT_VIP_ACCESS_CONVERSATION_ID}:${String(username || "default").trim().toLowerCase() || "default"}`,
    channel: CHAT_GPT_VIP_ACCESS_CHANNEL,
    participantId: CHAT_GPT_VIP_ACCESS_PARTICIPANT_ID,
    participantLabel: CHAT_GPT_VIP_ACCESS_DISPLAY_NAME,
    createdAt: chatGptVipAccess.updatedAt || new Date().toISOString(),
    updatedAt: chatGptVipAccess.updatedAt || null,
    lastMessageAt: lastMessage?.createdAt || null,
    messageCount: messages.length,
    unreadCount: 0,
    lastMessage,
    messages
  };
}

async function serializeChatGptVipAccessConversationForUser(username) {
  return await serializeChatGptVipAccessConversation(username);
}

function registerWindowsShellFsRoutes(prefix) {
  router.get(`${prefix}/drives`, (req, res) => {
    return res.json({
      drives: DRIVE_NAMES.map((name) => ({ name, label: `${name}:` }))
    });
  });

  router.get(`${prefix}/list`, (req, res) => {
    try {
      const drive = String(req.query.drive || "C").toUpperCase();
      const relativePath = String(req.query.path || "");
      const currentAbs = safeChatGptVipAccessPath(drive, relativePath);
      const driveRoot = getDriveRoot(drive);
      const normalizedPath = path.relative(driveRoot, currentAbs).replace(/\\/g, "/");
      const items = listFoldersAtPath(drive, normalizedPath);
      return res.json({
        drive,
        path: normalizedPath === "." ? "" : normalizedPath,
        items
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Khong the doc thu muc." });
    }
  });

  router.post(`${prefix}/folder`, (req, res) => {
    try {
      const drive = String(req.body?.drive || "C").toUpperCase();
      const basePath = String(req.body?.path || "");
      const folderName = sanitizeFolderName(req.body?.name);
      if (!folderName) return res.status(400).json({ error: "Ten thu muc khong hop le." });
      const targetPath = path.posix.join(basePath.replace(/\\/g, "/"), folderName);
      const targetAbs = safeChatGptVipAccessPath(drive, targetPath);
      if (fs.existsSync(targetAbs)) {
        return res.status(400).json({ error: "Thu muc da ton tai." });
      }
      fs.mkdirSync(targetAbs, { recursive: true });
      return res.json({
        message: "Da tao thu muc.",
        folder: { name: folderName, type: "folder" }
      });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Khong the tao thu muc." });
    }
  });

  router.delete(`${prefix}/folder`, (req, res) => {
    try {
      const drive = String(req.body?.drive || req.query?.drive || "C").toUpperCase();
      const relativePath = String(req.body?.path || req.query?.path || "");
      if (!relativePath.trim()) {
        return res.status(400).json({ error: "Path khong hop le." });
      }
      const targetAbs = safeChatGptVipAccessPath(drive, relativePath);
      const stat = fs.existsSync(targetAbs) ? fs.statSync(targetAbs) : null;
      if (!stat || !stat.isDirectory()) {
        return res.status(404).json({ error: "Khong tim thay thu muc." });
      }
      fs.rmSync(targetAbs, { recursive: true, force: true });
      return res.json({ message: "Da xoa thu muc." });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Khong the xoa thu muc." });
    }
  });
}

registerWindowsShellFsRoutes("/windowsshell/fs");

// Unified auth standard: trust WindowsShell verified session for SINGAE assistant routes.
router.use("/desktop-shell/cache", requireWindowsShellUser);
router.use("/singae-assistant", requireWindowsShellUser);
router.use("/admin/accounts", requireWindowsShellUser, requireWindowsShellRoles(["admin"]));
router.use("/verify-account", requireWindowsShellUser);

router.get("/desktop-shell/cache", async (req, res) => {
  return res.json({
    cache: await loadDesktopShellCache(req.authUser?.username)
  });
});

router.put("/desktop-shell/cache", async (req, res) => {
  try {
    const cache = req.body?.cache;
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
      return res.status(400).json({ error: "cache must be an object." });
    }
    await saveDesktopShellCache(cache, req.authUser?.username);
    return res.json({ message: "Desktop shell cache saved." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot save desktop shell cache." });
  }
});

router.use("/singae-assistant", (_req, res) => {
  return res.status(410).json({ error: "singae-assistant da duoc go bo." });
});

router.get("/singae-assistant/conversation", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    return res.json({
      conversation: await serializeChatGptVipAccessConversation(username)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Username is required." });
  }
});

// Back-compat for very old clients that call `/api/singae-assistant-rs/?username=...`
// and expect conversation payload on the root route.
router.get("/singae-assistant", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const conversation = await serializeChatGptVipAccessConversation(username);
    return res.json({
      conversation,
      messages: Array.isArray(conversation?.messages) ? conversation.messages : [],
      messageCount: Number(conversation?.messageCount || 0)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Username is required." });
  }
});

// Back-compat for legacy profile endpoint:
// `/api/singae-assistant-rs/userProfile?username=...`
router.get("/singae-assistant/userProfile", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const role = String(req.authUser?.role || "member").trim().toLowerCase();
    const fullName = String(req.authUser?.full_name || req.authUser?.fullName || username).trim();
    return res.json({
      userProfile: {
        username,
        role,
        fullName
      },
      username,
      role,
      fullName
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Username is required." });
  }
});

router.get("/singae-assistant/events", (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const adminUsername = normalizeChatGptVipAccessUsername(getChatGptVipAccessAccountsConfig().adminUsername || "admin");
    const isAdminSubscriber = username === adminUsername;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    let closed = false;
    const safeWrite = (chunk) => {
      if (closed) return;
      try {
        res.write(chunk);
      } catch (_) {
        closed = true;
      }
    };

    const onMessage = (payload) => {
      safeWrite(`event: chat_gpt_vip_access_message\n`);
      safeWrite(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      safeWrite(`event: ping\ndata: {"ok":true}\n\n`);
    }, 20000);

    const eventName = isAdminSubscriber ? "message" : `message:${username}`;
    chatGptVipAccessEvents.on(eventName, onMessage);
    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      chatGptVipAccessEvents.off(eventName, onMessage);
    });
  } catch (error) {
    const statusCode = isChatGptVipAccessUsernameError(error) ? 400 : 500;
    return res.status(statusCode).json({ error: error.message || "Cannot subscribe events." });
  }
});

// (removed) POST /singae-assistant/test-broadcast-message

router.get("/singae-assistant/conversations-all", async (req, res) => {
  try {
    if (String(req.authUser?.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ error: "Only admin can view all users conversations." });
    }
    const all = await getAllChatGptVipAccessConversations();
    const users = await Promise.all(Object.keys(all)
      .sort((a, b) => a.localeCompare(b))
      .map(async (user) => {
        const conversation = await serializeChatGptVipAccessConversationForUser(user);
        return {
          username: user,
          updatedAt: conversation.updatedAt || null,
          messageCount: conversation.messageCount || 0,
          lastMessageAt: conversation.lastMessageAt || null,
          lastMessageText: conversation.lastMessage?.text || ""
        };
      }));
    return res.json({ users });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Cannot load all conversations." });
  }
});

router.get("/singae-assistant/knowledge-base", async (req, res) => {
  const kb = await loadChatGptVipAccessKnowledgeBase();
  return res.json(serializeChatGptVipAccessKnowledgeBaseForClient(kb));
});

router.post("/singae-assistant/knowledge-base/entry", async (req, res) => {
  try {
    const record = req.body?.record;
    const topic = String(req.body?.topic || "Manual").trim() || "Manual";

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return res.status(400).json({ error: "record phai la mot object hop le." });
    }

    const { knowledgeBase, embeddingResult } = await addChatGptVipAccessKnowledgeEntry({
      record,
      topic,
      embedText
    });

    return res.json({
      message: "Da them ban ghi ChatGptVipAccess.",
      knowledgeBase: serializeChatGptVipAccessKnowledgeBaseForClient(knowledgeBase)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the them ban ghi ChatGptVipAccess." });
  }
});

router.put("/singae-assistant/knowledge-base/entry/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    const record = req.body?.record;
    const topic = req.body?.topic;

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return res.status(400).json({ error: "record phai la mot object hop le." });
    }

    const { knowledgeBase, embeddingResult } = await updateChatGptVipAccessKnowledgeEntry({
      entryId,
      record,
      topic,
      embedText
    });

    return res.json({
      message: "Cap nhat ban ghi ChatGptVipAccess thanh cong.",
      knowledgeBase: serializeChatGptVipAccessKnowledgeBaseForClient(knowledgeBase)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the cap nhat ban ghi ChatGptVipAccess." });
  }
});

router.delete("/singae-assistant/knowledge-base/entry/:entryId", async (req, res) => {
  try {
    const { entryId } = req.params;
    const kb = await deleteChatGptVipAccessKnowledgeEntry(entryId);
    return res.json({
      message: "Da xoa ban ghi ChatGptVipAccess.",
      knowledgeBase: serializeChatGptVipAccessKnowledgeBaseForClient(kb)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the xoa ban ghi ChatGptVipAccess." });
  }
});

router.get("/singae-assistant/prompt-config", async (req, res) => {
  const useKnowledgeBase = parseBooleanFlag(req.query?.useKnowledgeBase, true);
  return res.json(await getChatGptVipAccessPromptConfig(useKnowledgeBase));
});

router.get("/singae-assistant/prompt-file", async (req, res) => {
  const useKnowledgeBase = parseBooleanFlag(req.query?.useKnowledgeBase, true);
  const active = await getChatGptVipAccessActivePromptFile(useKnowledgeBase);
  return res.json(active.prompt || {});
});

router.get("/singae-assistant/prompts", async (req, res) => {
  try {
    const prompts = await getChatGptVipAccessPromptFiles();
    return res.json({ prompts });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tai prompt ChatGptVipAccess." });
  }
});

router.put("/singae-assistant/prompts/:mode", async (req, res) => {
  try {
    const mode = req.params.mode;
    const updated = await updateChatGptVipAccessPromptFile(mode, {
      name: req.body?.name,
      description: req.body?.description,
      systemPrompt: req.body?.systemPrompt
    });
    return res.json({
      message: "Da cap nhat prompt ChatGptVipAccess.",
      prompt: updated
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the cap nhat prompt ChatGptVipAccess." });
  }
});

router.delete("/singae-assistant/prompts/:mode", async (req, res) => {
  try {
    const mode = req.params.mode;
    const updated = await resetChatGptVipAccessPromptFile(mode);
    return res.json({
      message: "Da reset prompt ChatGptVipAccess.",
      prompt: updated
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the reset prompt ChatGptVipAccess." });
  }
});

router.get("/singae-assistant/plaintext-instruction", async (req, res) => {
  try {
    const lines = await loadChatGptVipAccessPlainTextInstruction();
    return res.json({ lines });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tai instruction." });
  }
});

router.put("/singae-assistant/plaintext-instruction", async (req, res) => {
  try {
    const lines = req.body?.lines;
    const updated = await updateChatGptVipAccessPlainTextInstruction(lines);
    return res.json({
      message: "Da cap nhat instruction.",
      lines: updated
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Khong the cap nhat instruction." });
  }
});

router.delete("/singae-assistant/plaintext-instruction", async (req, res) => {
  try {
    const lines = await resetChatGptVipAccessPlainTextInstruction();
    return res.json({
      message: "Da reset instruction.",
      lines
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the reset instruction." });
  }
});

router.post("/singae-assistant/knowledge-search", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const useKnowledgeBase = parseBooleanFlag(req.body?.useKnowledgeBase, true);
    if (!question) {
      return res.status(400).json({ error: "Vui long nhap cau hoi de tim trong database." });
    }
    const matches = await searchChatGptVipAccessKnowledgeEntries(question, useKnowledgeBase, 10);
    const context = matches.length ? buildChatGptVipAccessContextFromMatches(matches, question) : "";
    return res.json({
      question,
      enabled: useKnowledgeBase,
      context,
      matches: matches.map((entry) => ({
        id: entry.id,
        topic: entry.topic || "General",
        source: entry.source || "",
        rowNumber: entry.rowNumber || null,
        similarity: Number((entry.similarity || 0).toFixed(4)),
        text: entry.text || "",
        record: entry.record || {}
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the tim database ChatGptVipAccess." });
  }
});

router.delete("/singae-assistant/knowledge-base", (req, res) => {
  try {
    const kb = clearChatGptVipAccessKnowledgeBase();
    return res.json({
      message: "Da xoa kho tri thuc ChatGptVipAccess.",
      knowledgeBase: serializeChatGptVipAccessKnowledgeBaseForClient(kb)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the xoa kho tri thuc ChatGptVipAccess." });
  }
});

router.post("/singae-assistant/import/xlsx", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Vui long tai len file XLSX." });
    }

    const sheets = await importAllSheetsFromXlsx(req.file.path);
    if (!sheets.length) {
      return res.status(400).json({ error: "File XLSX khong co du lieu hop le trong cac sheets." });
    }

    const { knowledgeBase, embeddingResult } = await replaceChatGptVipAccessKnowledgeBaseBySheets({
      sourceName: req.file.originalname,
      sheets,
      embedTexts,
      embeddingModel: String(getRuntimeConfig().openai.embeddingModel || "").trim()
    });

    return res.json({
      message: "Import ChatGptVipAccess XLSX (all sheets) thanh cong.",
      sheetTopics: sheets.map((sheet) => sheet.sheetName),
      sources: knowledgeBase.sources,
      entries: knowledgeBase.entries.length
    });
  } catch (error) {
    logError({
      source: "chat-gpt-vip-access-import",
      message: `Import ChatGptVipAccess XLSX failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/singae-assistant/import/xlsx" }
    });
    return res.status(500).json({ error: error.message || "Import ChatGptVipAccess XLSX that bai." });
  } finally {
    removeUploadedFile(req.file?.path);
  }
});

router.get("/singae-assistant/media/:mediaId", (req, res) => {
  try {
    const mediaId = String(req.params?.mediaId || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(mediaId)) {
      return res.status(400).json({ error: "Invalid media id." });
    }
    const filePath = path.resolve(path.join(uploadsDir, mediaId));
    const uploadsRoot = path.resolve(uploadsDir) + path.sep;
    if (!filePath.startsWith(uploadsRoot)) {
      return res.status(400).json({ error: "Invalid media path." });
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: "Media not found." });
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot load media." });
  }
});

router.delete("/singae-assistant/messages", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    await clearChatGptVipAccessConversationByUsername(username);
    appendServerLog({
      level: "info",
      source: "chatGptVipAccess",
      message: `Da xoa tat ca tin nhan ChatGptVipAccess cua user ${username}.`
    });
    return res.json({
      message: "Da xoa tat ca tin nhan ChatGptVipAccess.",
      conversation: await serializeChatGptVipAccessConversation(username)
    });
  } catch (error) {
    logError({
      source: "chatGptVipAccess",
      message: `Clear ChatGptVipAccess messages failed: ${error.message}`,
      error,
      metadata: { endpoint: "DELETE /api/singae-assistant/messages" }
    });
    return res.status(500).json({ error: error.message || "Khong the xoa tin nhan ChatGptVipAccess." });
  }
});

// Persist user + assistant messages without sending to OpenAI.
router.post("/singae-assistant/local-json-reply", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const question = String(req.body?.question || "").trim();
    const answer = String(req.body?.answer || "").trim();
    if (!question || !answer) {
      return res.status(400).json({ error: "question and answer are required." });
    }

    await appendChatGptVipAccessMessage({
      role: "user",
      text: question,
      username,
      metadata: {
        source: "singae-assistant-local-json",
        editable: false
      }
    });
    emitChatGptVipAccessMessageEvent(username, "user_sent");

    await appendChatGptVipAccessMessage({
      role: "assistant",
      text: answer,
      username,
      metadata: {
        source: "singae-assistant-local-json",
        editable: false,
        isLookupJson: true
      }
    });
    emitChatGptVipAccessMessageEvent(username, "assistant_sent");

    return res.json({
      ok: true,
      conversation: await serializeChatGptVipAccessConversation(username)
    });
  } catch (error) {
    if (isChatGptVipAccessUsernameError(error)) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "Cannot save local json reply." });
  }
});

function normalizeSingaeAssistantHistory(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const role = String(item?.role || "").trim().toLowerCase();
      const content = String(item?.content || "").trim();
      if (!content || (role !== "user" && role !== "assistant")) return null;
      return { role, content };
    })
    .filter(Boolean);
}

function parseSingaeAssistantHistory(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeSingaeAssistantHistory(raw);
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeSingaeAssistantHistory(parsed);
    } catch (_) {
      return [];
    }
  }
  return [];
}

router.post("/singae-assistant/chat", async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const question = String(req.body?.question || "").trim();
    const useKnowledgeBase = parseBooleanFlag(req.body?.useKnowledgeBase, true);
    const providedKnowledgeContext = String(req.body?.knowledgeContext || "").trim();
    const clientHistory = parseSingaeAssistantHistory(req.body?.history);

    if (!question) {
      return res.status(400).json({ error: "Vui long nhap cau hoi." });
    }

    await appendChatGptVipAccessMessage({
      role: "user",
      text: question,
      username,
      metadata: {
        source: "chat-gpt-vip-access-ui",
        editable: false,
        useKnowledgeBase
      }
    });
    emitChatGptVipAccessMessageEvent(username, "user_sent");

    const currentConversation = await serializeChatGptVipAccessConversation(username);
    const historyFromDb = (currentConversation.messages || []).slice(0, -1).map((message) => ({
      role: message.role,
      content: message.text
    }));
    const history = clientHistory.length ? clientHistory : historyFromDb;
    const knowledgeContext = providedKnowledgeContext
      || (await buildChatGptVipAccessKnowledgeContext(question, useKnowledgeBase));
    const result = await askChatGptVipAccess({
      question,
      history,
      knowledgeContext,
      useKnowledgeBase
    });

    await appendChatGptVipAccessMessage({
      role: "assistant",
      text: result.answer,
      username,
      metadata: {
        source: "chat-gpt-vip-access-ui",
        editable: false,
        useKnowledgeBase
      }
    });
    emitChatGptVipAccessMessageEvent(username, "assistant_sent");

    return res.json({
      ...result,
      conversationId: CHAT_GPT_VIP_ACCESS_CONVERSATION_ID
    });
  } catch (error) {
    if (isChatGptVipAccessUsernameError(error)) {
      return res.status(400).json({ error: error.message });
    }
    logError({
      source: "chat-gpt-vip-access-chat",
      message: `ChatGptVipAccess chat failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/singae-assistant/chat" }
    });
    return res.status(500).json({ error: error.message || "Khong the tra loi luc nay." });
  }
});

router.post("/singae-assistant/chat-with-files", uploadChatGptVipAccessFiles, async (req, res) => {
  try {
    const username = resolveChatGptVipAccessUsername(req);
    const question = String(req.body?.question || "").trim();
    const useKnowledgeBase = parseBooleanFlag(req.body?.useKnowledgeBase, true);
    const providedKnowledgeContext = String(req.body?.knowledgeContext || "").trim();
    const clientHistory = parseSingaeAssistantHistory(req.body?.history);
    if (!question) {
      return res.status(400).json({ error: "Vui long nhap cau hoi." });
    }

    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const unsupportedImage = uploadedFiles.find((file) => {
      const mime = String(file?.mimetype || "").trim().toLowerCase();
      return mime.startsWith("image/") && !SUPPORTED_CHAT_GPT_VIP_ACCESS_IMAGE_MIME_TYPES.has(mime);
    });
    if (unsupportedImage) {
      return res.status(400).json({
        error: `Dinh dang anh ${unsupportedImage.mimetype || "(khong ro)"} chua duoc ho tro. Vui long dung JPG, PNG, WEBP hoac GIF.`
      });
    }
    const cachedMediaByName = new Map();
    uploadedFiles.forEach((file) => {
      const cached = cacheChatGptVipAccessAttachment(file);
      if (cached) {
        cachedMediaByName.set(`${file.originalname}|${file.size}`, cached);
      }
    });
    const imageDataUrls = uploadedFiles
      .map((file) => toDataUrlFromMulterFile(file))
      .filter(Boolean);
    const imagePreviewByName = new Map();
    uploadedFiles.forEach((file) => {
      const preview = toDataUrlFromMulterFile(file);
      if (preview) imagePreviewByName.set(`${file.originalname}|${file.size}`, preview);
    });
    const nonImageFiles = uploadedFiles.filter((file) => !String(file?.mimetype || "").startsWith("image/"));
    const extractedBlocks = await Promise.all(nonImageFiles.map((file) => extractAttachmentText(file)));
    const attachmentsText = extractedBlocks.filter(Boolean).join("\n\n---\n\n");

    await appendChatGptVipAccessMessage({
      role: "user",
      text: question,
      username,
      metadata: {
        source: "chat-gpt-vip-access-ui",
        editable: false,
        useKnowledgeBase,
        attachments: uploadedFiles.map((f) => ({
          kind: String(f?.mimetype || "").startsWith("image/") ? "image" : "file",
          name: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          previewDataUrl: imagePreviewByName.get(`${f.originalname}|${f.size}`) || null,
          mediaId: cachedMediaByName.get(`${f.originalname}|${f.size}`)?.mediaId || null,
          mediaUrl: cachedMediaByName.get(`${f.originalname}|${f.size}`)?.mediaUrl || null
        }))
      }
    });
    emitChatGptVipAccessMessageEvent(username, "user_sent");

    const currentConversation = await serializeChatGptVipAccessConversation(username);
    const historyFromDb = (currentConversation.messages || []).slice(0, -1).map((message) => ({
      role: message.role,
      content: message.text
    }));
    const history = clientHistory.length ? clientHistory : historyFromDb;

    const knowledgeContext = providedKnowledgeContext
      || (await buildChatGptVipAccessKnowledgeContext(question, useKnowledgeBase));
    const result = await askChatGptVipAccessRich({
      question,
      history,
      images: imageDataUrls,
      attachmentsText,
      knowledgeContext,
      useKnowledgeBase
    });

    await appendChatGptVipAccessMessage({
      role: "assistant",
      text: result.answer,
      username,
      metadata: {
        source: "chat-gpt-vip-access-ui",
        editable: false,
        useKnowledgeBase
      }
    });
    emitChatGptVipAccessMessageEvent(username, "assistant_sent");

    return res.json({
      ...result,
      conversationId: CHAT_GPT_VIP_ACCESS_CONVERSATION_ID
    });
  } catch (error) {
    if (isChatGptVipAccessUsernameError(error)) {
      return res.status(400).json({ error: error.message });
    }
    logError({
      source: "chat-gpt-vip-access-chat",
      message: `ChatGptVipAccess chat with files failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/singae-assistant/chat-with-files" }
    });
    return res.status(500).json({ error: error.message || "Khong the tra loi luc nay." });
  }
});

router.get("/chat-history/:conversationId", async (req, res) => {
  const chatHistory = await loadChatHistory();
  const conversation = (chatHistory?.conversations || []).find((item) => item.id === req.params.conversationId);

  if (!conversation) {
    return res.status(404).json({ error: "Khong tim thay hoi thoai." });
  }
  if (!isActiveChatbotChannel(conversation.channel)) {
    return res.status(404).json({ error: "Khong tim thay hoi thoai." });
  }

  const prepared = await prepareChatHistoryForClient(chatHistory, conversation.channel);
  return res.json({
    conversation: (prepared.conversations || []).find((item) => item.id === conversation.id) || null
  });
});

router.delete("/chat-history/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    
    if (!conversationId || !String(conversationId).trim()) {
      return res.status(400).json({ error: "Conversation ID khong hop le." });
    }

    const conversation = await getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }
    if (!isActiveChatbotChannel(conversation.channel)) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }

    const chatHistory = await clearConversationById(conversationId);
    emitChatHistoryEvent("conversation_deleted", conversationId, { channel: conversation.channel || null });
    return res.json({
      message: `Da xoa hoi thoai thanh cong.`,
      chatHistory: serializeChatHistoryForClient(chatHistory)
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Delete conversation failed: ${error.message}`,
      error,
      metadata: { endpoint: "DELETE /api/chat-history/:conversationId", conversationId: req.params.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the xoa hoi thoai." });
  }
});

router.post("/chat-history/:conversationId/read", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    
    if (!conversationId || !String(conversationId).trim()) {
      return res.status(400).json({ error: "Conversation ID khong hop le." });
    }

    const conversation = await markConversationAsRead(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }
    if (!isActiveChatbotChannel(conversation.channel)) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }

    emitChatHistoryEvent("conversation_read", conversationId, { channel: conversation.channel || null });
    return res.json({
      message: "Da danh dau da doc.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: conversation.updatedAt,
          summary: {
            totalMessages: conversation.messages.length,
            totalConversations: 1,
            channels: {
              [conversation.channel]: {
                conversationCount: 1,
                messageCount: conversation.messages.length,
                lastMessageAt: conversation.lastMessageAt
              }
            }
          },
          conversations: [conversation]
        },
        conversation.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Mark as read failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/chat-history/:conversationId/read", conversationId: req.params.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the danh dau da doc." });
  }
});

router.post("/chat-history/:conversationId/auto-reply", async (req, res) => {
  let botReplyTraceId = null;
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID không hợp lệ." });
    }
    const conversation = await getConversationById(conversationId);
    if (!conversation || !isActiveChatbotChannel(conversation.channel)) {
      return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    }
    const channel = String(conversation.channel || "").trim();
    if (!channel.includes("facebook") && !channel.includes("messenger")) {
      return res.status(400).json({ error: "Chỉ hỗ trợ auto-reply cho Facebook Messenger." });
    }

    const question = findLastIncomingUserMessageText(conversation);
    if (!question) {
      return res.status(400).json({
        error: "Không có tin nhắn khách (incoming) để bot trả lời."
      });
    }

    const parsed = parseFacebookMessengerParticipantId(conversation.participantId);
    const pageId =
      String(conversation.facebookMessengerPageId || "").trim() || parsed.pageId || "";
    const senderId = parsed.psid || String(conversation.participantId || "").trim();
    if (!senderId) {
      return res.status(400).json({ error: "Không xác định được PSID khách." });
    }

    const pageAccessToken = getFacebookPageAccessTokenForPage(pageId);
    const displayName = String(conversation.participantLabel || "").trim();

    botReplyTraceId = beginBotReply({
      conversationId,
      participantId: conversation.participantId,
      participantLabel: displayName,
      channel,
      endpoint: "POST /chat-history/:conversationId/auto-reply",
      facebookPageId: pageId || null,
      facebookPageName: pageId ? getFacebookPageLabelName(pageId) : null,
      incomingPreview: question.slice(0, 200)
    });

    const result = await answerQuestion(question, "POST /chat-history/:conversationId/auto-reply", {
      channel,
      senderId,
      facebookPageId: pageId || null,
      provider: getActiveFlowProvider(),
      forceBotReply: true
    });

    if (result?.skippedLlm || result?.metadata?.skippedLlm) {
      return res.status(409).json({
        error: "Bot không trả lời (careStatus hoặc chính sách chặn LLM).",
        skippedLlm: true,
        careStatus: result?.metadata?.careStatus || null
      });
    }

    const replyBody = String(result.answer || "").trim();
    if (!replyBody) {
      return res.status(502).json({
        error: "Bot không tạo được nội dung trả lời.",
        botParseNote: result.metadata?.botParseNote || null
      });
    }

    const intakeSnapRaw =
      result.metadata?.botEnvelope?.collected != null
        ? normalizeCollected(result.metadata.botEnvelope.collected)
        : null;
    const intakeSnap = collectedSnapshotHasData(intakeSnapRaw) ? intakeSnapRaw : null;

    await sendFacebookReplyAndPersist({
      senderId,
      facebookPageId: pageId || null,
      text: replyBody,
      participantLabel: resolveMessengerCustomerParticipantLabel(senderId, displayName),
      source: "manual-auto-reply",
      customerIntakeCollected: intakeSnap,
      pageAccessToken,
      metadata: {
        senderName: displayName,
        manualAutoReply: true,
        repliedToPreview: question.slice(0, 240),
        matchedEntries: result.metadata?.entriesUsed || 0,
        botPhase: result.metadata?.botEnvelope?.conversation_phase || null,
        botActionsApplied: result.metadata?.botStructuredApplied || null,
        botParseNote: result.metadata?.botParseNote || null
      }
    });

    const updated = await getConversationById(conversationId);
    appendServerLog({
      level: "info",
      source: "chatbot-auto-reply",
      message: "Manual one-shot bot reply sent",
      metadata: {
        conversationId,
        pageId,
        senderId,
        questionPreview: question.slice(0, 120),
        replyPreview: replyBody.slice(0, 120)
      }
    });

    return res.json({
      message: "Bot đã trả lời một lần.",
      repliedTo: question.slice(0, 500),
      answerPreview: replyBody.slice(0, 500),
      conversation: updated
        ? serializeChatHistoryForClient(
            {
              updatedAt: updated.updatedAt,
              summary: {
                totalMessages: updated.messages.length,
                totalConversations: 1,
                channels: {
                  [updated.channel]: {
                    conversationCount: 1,
                    messageCount: updated.messages.length,
                    lastMessageAt: updated.lastMessageAt
                  }
                }
              },
              conversations: [updated]
            },
            updated.channel
          ).conversations[0]
        : null
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Auto-reply failed: ${error.message}`,
      error,
      metadata: {
        endpoint: "POST /api/chatbot/chat-history/:conversationId/auto-reply",
        conversationId: req.params.conversationId
      }
    });
    return res.status(500).json({ error: error.message || "Không thể auto-reply." });
  } finally {
    endBotReply(botReplyTraceId);
  }
});

router.post("/chat-history/:conversationId/refresh-profile", async (req, res) => {
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID không hợp lệ." });
    }
    const conversation = await getConversationById(conversationId);
    if (!conversation || !isActiveChatbotChannel(conversation.channel)) {
      return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    }
    const channel = String(conversation.channel || "").toLowerCase();
    if (!channel.includes("facebook") && !channel.includes("messenger")) {
      return res.status(400).json({ error: "Chỉ hỗ trợ refresh profile cho Facebook Messenger." });
    }

    const parsed = parseFacebookMessengerParticipantId(conversation.participantId);
    const pageId =
      String(conversation.facebookMessengerPageId || "").trim() || parsed.pageId || "";
    const senderId = parsed.psid || String(conversation.participantId || "").trim();
    if (!senderId) {
      return res.status(400).json({ error: "Không xác định được PSID khách." });
    }

    let pageAccessToken = getFacebookPageAccessTokenForPage(pageId);
    if (pageId && canSyncFromVps()) {
      const { pages } = readFacebookOauthRuntimeV2();
      const hasPageToken = pages.some((p) => p.pageId === pageId && p.pageAccessToken);
      if (!hasPageToken) {
        await syncFacebookOauthFromVps({ force: true }).catch(() => {});
        pageAccessToken = getFacebookPageAccessTokenForPage(pageId);
      }
    }

    const senderProfile = await resolveFacebookSenderProfile({
      senderId,
      pageId,
      pageAccessToken,
      rawEvent: null,
      existingProfile: conversation.participantProfile || null,
      existingLabel: conversation.participantLabel || ""
    });

    const hasRealName =
      senderProfile.patch?.name &&
      !isFacebookFallbackParticipantLabel(senderProfile.displayName, senderId);
    const hasAvatar = Boolean(senderProfile.patch?.avatarUrl || senderProfile.avatarUrl);
    if (!hasRealName && !hasAvatar) {
      return res.status(502).json({
        error:
          "Meta không trả tên/ảnh cho PSID này (user chặn profile hoặc Page thiếu token).",
        displayName: senderProfile.displayName
      });
    }

    const profilePatch = {
      ...(senderProfile.patch || {}),
      name: senderProfile.displayName,
      displayName: senderProfile.displayName,
      avatarUrl: senderProfile.avatarUrl || senderProfile.patch?.avatarUrl || null,
      gender: senderProfile.gender || senderProfile.patch?.gender || null,
      givenName: senderProfile.givenName || senderProfile.patch?.givenName || null,
      familyName: senderProfile.familyName || senderProfile.patch?.familyName || null,
      facebookLocale: senderProfile.facebookLocale || senderProfile.patch?.facebookLocale || null,
      facebookTimezone:
        senderProfile.facebookTimezone != null
          ? senderProfile.facebookTimezone
          : senderProfile.patch?.facebookTimezone ?? null
    };

    let updated = await upsertConversationProfile(conversationId, profilePatch);
    if (!updated) {
      return res.status(404).json({ error: "Không cập nhật được profile." });
    }

    const avatarResult = await ensureConversationAvatarCached(updated);
    if (avatarResult.changed) {
      const data = await loadChatHistory();
      const idx = data.conversations.findIndex((c) => c.id === conversationId);
      if (idx >= 0) {
        data.conversations[idx].participantProfile = avatarResult.conversation.participantProfile;
        data.updatedAt = new Date().toISOString();
        await saveChatHistory(data);
        updated = data.conversations[idx];
      }
    }

    appendServerLog({
      level: "info",
      source: "chatbot-profile",
      message: "Conversation profile refreshed from Messenger Graph",
      metadata: {
        conversationId,
        pageId,
        senderId,
        participantLabel: updated.participantLabel
      }
    });
    emitChatHistoryEvent("conversation_profile_updated", conversationId, {
      channel: updated.channel || null
    });

    return res.json({
      message: "Đã cập nhật profile từ Facebook.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: updated.updatedAt,
          summary: {
            totalMessages: updated.messages.length,
            totalConversations: 1,
            channels: {
              [updated.channel]: {
                conversationCount: 1,
                messageCount: updated.messages.length,
                lastMessageAt: updated.lastMessageAt
              }
            }
          },
          conversations: [updated]
        },
        updated.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Refresh profile failed: ${error.message}`,
      error,
      metadata: {
        endpoint: "POST /api/chatbot/chat-history/:conversationId/refresh-profile",
        conversationId: req.params.conversationId
      }
    });
    return res.status(500).json({ error: error.message || "Không thể refresh profile." });
  }
});

router.put("/chat-history/:conversationId/profile", (req, res) => {
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID khong hop le." });
    }
    const profilePatch = req.body?.profile || req.body || {};
    const conversation = upsertConversationProfile(conversationId, profilePatch);
    if (!conversation) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }
    if (!isActiveChatbotChannel(conversation.channel)) {
      return res.status(404).json({ error: "Khong tim thay hoi thoai." });
    }
    appendServerLog({
      level: "info",
      source: "chatbot-profile",
      message: "Conversation profile updated",
      request: {
        conversationId,
        profile: profilePatch
      },
      response: {
        id: conversation.id,
        participantLabel: conversation.participantLabel
      }
    });
    emitChatHistoryEvent("conversation_profile_updated", conversationId, {
      channel: conversation.channel || null
    });
    return res.json({
      message: "Da cap nhat thong tin user.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: conversation.updatedAt,
          summary: {
            totalMessages: conversation.messages.length,
            totalConversations: 1,
            channels: {
              [conversation.channel]: {
                conversationCount: 1,
                messageCount: conversation.messages.length,
                lastMessageAt: conversation.lastMessageAt
              }
            }
          },
          conversations: [conversation]
        },
        conversation.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chatbot-profile",
      message: `Update profile failed: ${error.message}`,
      error,
      metadata: { endpoint: "PUT /api/chat-history/:conversationId/profile", conversationId: req.params?.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat thong tin user." });
  }
});

router.patch("/chat-history/:conversationId/inbox", async (req, res) => {
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID khong hop le." });
    }
    const prev = await getConversationById(conversationId);
    if (!prev) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    if (!isActiveChatbotChannel(prev.channel)) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    const body = req.body || {};
    await updateConversationInbox(conversationId, {
      inboxStatus: body.inboxStatus,
      assignee: body.assignee,
      priority: body.priority,
      labels: body.labels,
      internalNote: body.internalNote
    });
    if (body.appendSystemMessage && String(body.appendSystemMessage).trim()) {
      await appendSystemChatMessage({
        channel: prev.channel,
        participantId: prev.participantId,
        participantLabel: prev.participantLabel,
        text: String(body.appendSystemMessage).trim(),
        metadata: { source: "inbox-patch" }
      });
    }
    const fresh = await getConversationById(conversationId);
    emitChatHistoryEvent("conversation_inbox_updated", conversationId, { channel: fresh.channel });
    appendServerLog({
      level: "info",
      source: "chat-history",
      message: "Conversation inbox updated",
      metadata: { endpoint: "PATCH /api/chat-history/:conversationId/inbox", conversationId },
      request: body
    });
    return res.json({
      message: "Da cap nhat inbox.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: fresh.updatedAt,
          summary: {
            totalMessages: fresh.messages.length,
            totalConversations: 1,
            channels: {
              [fresh.channel]: {
                conversationCount: 1,
                messageCount: fresh.messages.length,
                lastMessageAt: fresh.lastMessageAt
              }
            }
          },
          conversations: [fresh]
        },
        fresh.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Update inbox failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/chat-history/:conversationId/inbox", conversationId: req.params?.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat inbox." });
  }
});

router.patch("/chat-history/:conversationId/customer-intake", async (req, res) => {
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) {
      return res.status(400).json({ error: "Conversation ID khong hop le." });
    }
    const prev = await getConversationById(conversationId);
    if (!prev) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    if (!isActiveChatbotChannel(prev.channel)) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    const body = req.body || {};
    await updateConversationCustomerIntake(conversationId, {
      patient: body.patient,
      notes: body.notes,
      appointments: body.appointments
    });
    const fresh = await getConversationById(conversationId);
    emitChatHistoryEvent("conversation_customer_intake_updated", conversationId, { channel: fresh.channel });
    return res.json({
      message: "Da cap nhat thong tin KH.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: fresh.updatedAt,
          summary: {
            totalMessages: fresh.messages.length,
            totalConversations: 1,
            channels: {
              [fresh.channel]: {
                conversationCount: 1,
                messageCount: fresh.messages.length,
                lastMessageAt: fresh.lastMessageAt
              }
            }
          },
          conversations: [fresh]
        },
        fresh.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Update customer intake failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/chat-history/:conversationId/customer-intake", conversationId: req.params?.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat thong tin KH." });
  }
});

router.patch("/chat-history/:conversationId/care-status", async (req, res) => {
  try {
    const conversationId = String(req.params?.conversationId || "").trim();
    if (!conversationId) return res.status(400).json({ error: "Conversation ID khong hop le." });
    const prev = await getConversationById(conversationId);
    if (!prev || !isActiveChatbotChannel(prev.channel)) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const prevCare = normalizeConversationCareStatus(prev.careStatus);
    const nextConv = await updateConversationCareStatus(conversationId, body.careStatus);
    if (!nextConv) {
      return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    }
    const nextCare = normalizeConversationCareStatus(nextConv.careStatus);
    if (prevCare !== nextCare) {
      const custom = body.appendSystemMessage && String(body.appendSystemMessage).trim();
      if (custom) {
        await appendCareStatusChangeMessage({
          channel: prev.channel,
          participantId: prev.participantId,
          participantLabel: prev.participantLabel,
          previousCareStatus: prevCare,
          nextCareStatus: nextCare,
          source: "operator",
          text: custom
        });
      } else {
        await appendCareStatusAuditMessage(prev, nextCare, "operator");
      }
    }
    const fresh = await getConversationById(conversationId);
    emitChatHistoryEvent("conversation_care_status_updated", conversationId, { channel: fresh?.channel || prev.channel });
    return res.json({
      message: "Da cap nhat care status.",
      conversation: serializeChatHistoryForClient(
        {
          updatedAt: fresh.updatedAt,
          summary: {
            totalMessages: fresh.messages.length,
            totalConversations: 1,
            channels: {
              [fresh.channel]: {
                conversationCount: 1,
                messageCount: fresh.messages.length,
                lastMessageAt: fresh.lastMessageAt
              }
            }
          },
          conversations: [fresh]
        },
        fresh.channel
      ).conversations[0]
    });
  } catch (error) {
    logError({
      source: "chat-history",
      message: `Update care status failed: ${error.message}`,
      error,
      metadata: { endpoint: "PATCH /api/chat-history/:conversationId/care-status", conversationId: req.params?.conversationId }
    });
    return res.status(500).json({ error: error.message || "Khong the cap nhat care status." });
  }
});

router.post("/bookings", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const conversationId = String(body.conversationId || "").trim();
    if (!conversationId) return res.status(400).json({ error: "conversationId la bat buoc." });
    const conv = await getConversationById(conversationId);
    if (!conv) return res.status(404).json({ error: "Khong tim thay cuoc tro chuyen." });
    const intake = normalizeCustomerIntake(conv.customerIntake);
    const patient = normalizeCustomerIntake({ patient: body.patient || intake.patient }).patient;
    const notes = body.notes !== undefined ? String(body.notes || "") : intake.notes;
    if (!patient.fullName || !patient.phone || !patient.regionLive || !patient.preferredOfficeKey || !patient.shuttlePickup) {
      return res.status(400).json({ error: "Thieu thong tin BN/co so/xe dua don de tao booking." });
    }
    if (!patient.preferredVisitDate || !patient.preferredVisitTime) {
      return res.status(400).json({ error: "Thieu ngay/gio hen de tao booking." });
    }
    const appointment = body.appointment && typeof body.appointment === "object" ? body.appointment : {};
    const careBeforeManual = normalizeConversationCareStatus(conv.careStatus);
    const booking = await createBookingRequest({
      conversation: conv,
      patient,
      notes,
      appointment: { ...appointment, status: appointment.status || BOOKING_STATUS.BOOKED },
      confirmation: {
        summaryMessageId: body.summaryMessageId || null,
        confirmationMessageId: body.confirmationMessageId || null
      },
      source: "manual-api"
    });
    await updateConversationCareStatus(conversationId, CARE_STATUS.BOOKED);
    if (careBeforeManual === CARE_STATUS.BOT_CARE) {
      try {
        await appendCareStatusAuditMessage(conv, CARE_STATUS.BOOKED, "booking");
      } catch (_) {}
    }
    try {
      await zaloPersonalClient.notifyZaloBookingRequestCreated({ booking, careStatus: CARE_STATUS.BOOKED });
      await markBookingRequestZaloNotified(booking.id);
    } catch (zErr) {
      appendServerLog({
        level: "warn",
        source: "zalo-personal-notify",
        message: `Zalo notify manual booking failed: ${zErr?.message || zErr}`,
        metadata: { conversationId, bookingId: booking.id }
      });
    }
    emitChatHistoryEvent("conversation_booking_created", conversationId, { channel: conv.channel, bookingId: booking.id });
    return res.json({ ok: true, booking: await getBookingRequestById(booking.id) });
  } catch (error) {
    logError({
      source: "booking-request",
      message: `Create booking failed: ${error.message}`,
      error,
      metadata: { endpoint: "POST /api/bookings" }
    });
    return res.status(500).json({ error: error.message || "Khong the tao booking." });
  }
});

router.get("/bookings", async (req, res) => {
  try {
    const items = await listBookingRequests({
      conversationId: req.query?.conversationId || "",
      status: req.query?.status || "",
      limit: req.query?.limit || 100
    });
    return res.json({ ok: true, bookings: items });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the doc bookings." });
  }
});

router.get("/bookings/:id", async (req, res) => {
  try {
    const booking = await getBookingRequestById(req.params?.id || "");
    if (!booking) return res.status(404).json({ error: "Khong tim thay booking." });
    return res.json({ ok: true, booking });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the doc booking." });
  }
});

router.patch("/bookings/:id/status", async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ error: "Booking ID khong hop le." });
    const status = String(req.body?.status || "").trim();
    const updated = await updateBookingRequestStatus(id, status, { errorMessage: req.body?.errorMessage });
    if (!updated) return res.status(404).json({ error: "Khong tim thay booking." });
    let nextCareStatus = null;
    if (updated.status === BOOKING_STATUS.BOOKED) nextCareStatus = CARE_STATUS.BOOKED;
    else if (updated.status === BOOKING_STATUS.TREATING) nextCareStatus = CARE_STATUS.TREATING;
    else if (updated.status === BOOKING_STATUS.TREATMENT_DONE) nextCareStatus = CARE_STATUS.TREATMENT_DONE;
    else if (updated.status === BOOKING_STATUS.CANCELLED) nextCareStatus = CARE_STATUS.BOT_CARE;
    if (nextCareStatus && updated.conversationId) {
      const convBefore = await getConversationById(updated.conversationId);
      const prevCareB = convBefore ? normalizeConversationCareStatus(convBefore.careStatus) : null;
      const conv = await updateConversationCareStatus(updated.conversationId, nextCareStatus);
      if (prevCareB != null && conv && normalizeConversationCareStatus(conv.careStatus) !== prevCareB) {
        try {
          await appendCareStatusAuditMessage(convBefore, nextCareStatus, "booking_status");
        } catch (_) {}
      }
      if (conv?.channel) {
        emitChatHistoryEvent("conversation_care_status_updated", updated.conversationId, { channel: conv.channel });
      }
    }
    return res.json({ ok: true, booking: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Khong the cap nhat status booking." });
  }
});

router.post("/admin/accounts/list", (req, res) => {
  try {
    const config = getChatGptVipAccessAccountsConfig();
    const users = config.users.map((username) => ({
      username,
      hasPassword: Boolean(String(config.userPasswords?.[username] || config.sharedPassword || "").trim())
    }));
    return res.json({
      success: true,
      adminUsername: config.adminUsername,
      users
    });
  } catch (error) {
    const status = String(error?.message || "").includes("Invalid admin credentials.") ? 401 : 400;
    return res.status(status).json({ error: error.message || "Cannot list accounts." });
  }
});

router.post("/admin/accounts/upsert", (req, res) => {
  try {
    const config = getChatGptVipAccessAccountsConfig();
    const username = normalizeChatGptVipAccessUsername(req.body?.username);
    const password = String(req.body?.password || "").trim();
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required." });
    }
    if (username === config.adminUsername) {
      return res.status(400).json({ error: "Use admin password endpoint for admin account." });
    }
    const users = Array.from(new Set([...config.users, username]));
    const userPasswords = { ...(config.userPasswords || {}) };
    userPasswords[username] = password;
    const nextAccountsValue = buildChatGptVipAccessAccountsEnvValue(users, userPasswords, config.sharedPassword);
    upsertLocalEnvValue(CHAT_GPT_VIP_ACCESS_ACCOUNTS_ENV_KEY, nextAccountsValue);
    return res.json({
      success: true,
      message: "Account saved.",
      username
    });
  } catch (error) {
    const status = String(error?.message || "").includes("Invalid admin credentials.") ? 401 : 400;
    return res.status(status).json({ error: error.message || "Cannot save account." });
  }
});

router.post("/admin/accounts/change-admin-password", (req, res) => {
  try {
    const config = getChatGptVipAccessAccountsConfig();
    const newPassword = String(req.body?.newPassword || "").trim();
    if (!newPassword) {
      return res.status(400).json({ error: "newPassword is required." });
    }
    upsertLocalEnvValue(CHAT_GPT_VIP_ACCESS_ADMIN_PASSWORD_ENV_KEY, newPassword);
    return res.json({
      success: true,
      message: "Admin password updated.",
      adminUsername: config.adminUsername
    });
  } catch (error) {
    const status = String(error?.message || "").includes("Invalid admin credentials.") ? 401 : 400;
    return res.status(status).json({ error: error.message || "Cannot update admin password." });
  }
});

router.post("/verify-account", (req, res) => {
  try {
    const username = normalizeChatGptVipAccessUsername(req.authUser?.username);
    if (!username) {
      return res.status(401).json({ error: "Not authenticated." });
    }
    return res.json({
      success: true,
      token: "",
      role: String(req.authUser?.role || "user").trim().toLowerCase(),
      username,
      expiresIn: 30 * 60 * 1000
    });
  } catch (error) {
    logError({
      source: "chatbot-account-verify",
      message: `Account verification failed: ${error.message}`,
      error
    });
    return res.status(500).json({ error: "Cannot verify account." });
  }
});

router.get("/singae-lookup/quota", (req, res) => {
  try {
    const username = normalizeLookupUsername(req.query?.username);
    if (!username) {
      return res.status(400).json({ error: "AUTH_ERROR", message: "Username is required." });
    }
    const store = loadSingaeLookupStore();
    const dateKey = getGmt7DateKey();
    const used = getLookupQuotaUsage(store, username, dateKey);
    const remaining = Math.max(0, SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT - used);
    return res.json({
      success: true,
      quota: {
        date: dateKey,
        used,
        limit: SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT,
        remaining
      }
    });
  } catch (error) {
    logError({
      source: "singae-lookup",
      message: `Quota check failed: ${error.message}`,
      error
    });
    return res.status(500).json({ error: "SYSTEM_ERROR", message: "Khong the lay thong tin quota." });
  }
});

router.post("/singae-lookup/query", async (req, res) => {
  const username = normalizeLookupUsername(req.body?.username);
  const accountCode = normalizeAccountCode(req.body?.accountCode);
  if (!username) {
    return res.status(400).json({ error: "AUTH_ERROR", message: "Username is required." });
  }
  if (!accountCode) {
    return res.status(400).json({ error: "INPUT_ERROR", message: "Vui long nhap ma KH." });
  }

  const configIssues = getSingaeLookupConfigIssues();
  if (configIssues.length > 0) {
    return res.status(500).json({
      error: "CONFIG_ERROR",
      message: "Singae Lookup chua cau hinh dung env.",
      issues: configIssues
    });
  }

  try {
    const store = loadSingaeLookupStore();
    const dateKey = getGmt7DateKey();
    const used = getLookupQuotaUsage(store, username, dateKey);
    const userCache = getLookupUserCacheBucket(store, username);
    const cached = userCache[accountCode];
    if (cached && cached.response) {
      const nextUsed = used + 1;
      setLookupQuotaUsage(store, username, dateKey, nextUsed);
      saveSingaeLookupStore(store);
      await sendSingaeLookupWebhook(`? ${username} truy van KH ${accountCode} thanh cong (CACHE)`);
      return res.json({
        success: true,
        cached: true,
        response: cached.response,
        quota: {
          date: dateKey,
          used: nextUsed,
          limit: SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT,
          remaining: Math.max(0, SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT - nextUsed)
        }
      });
    }

    const getfly = await callGetflyAccounts(accountCode, username);
    if (!getfly.ok) {
      logError({
        source: "singae-lookup",
        message: `Getfly API failed (${getfly.status})`,
        metadata: {
          endpoint: getfly.endpoint,
          username,
          accountCode,
          status: getfly.status,
          response: getfly.raw
        }
      });
      return res.status(502).json({
        error: getfly.parseError ? "PARSE_ERROR" : "API_ERROR",
        message: getfly.parseError ? "Loi parse du lieu API Getfly." : `Loi API Getfly (${getfly.status}).`
      });
    }

    const result = getfly.body || {};
    if (!Array.isArray(result.data) || result.data.length === 0) {
      logError({
        source: "singae-lookup",
        message: "Getfly account not found",
        metadata: { username, accountCode, endpoint: getfly.endpoint, response: result }
      });
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Khong tim thay thong tin KH."
      });
    }

    const account = result.data[0] || {};
    userCache[accountCode] = {
      updatedAt: new Date().toISOString(),
      response: result
    };
    const nextUsed = used + 1;
    setLookupQuotaUsage(store, username, dateKey, nextUsed);
    saveSingaeLookupStore(store);

    await sendSingaeLookupWebhook(
      `? ${username} truy van KH ${account.account_code || accountCode} thanh cong`
    );

    return res.json({
      success: true,
      cached: false,
      normalizedAccount: {
        accountCode: String(account.account_code || accountCode || ""),
        accountName: String(account.account_name || "-"),
        phone: maskPhone(account.phone_office || ""),
        relationName: String(account.relation_name || "-")
      },
      response: result,
      quota: {
        date: dateKey,
        used: nextUsed,
        limit: SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT,
        remaining: Math.max(0, SINGAE_LOOKUP_DAILY_SUCCESS_LIMIT - nextUsed)
      }
    });
  } catch (error) {
    logError({
      source: "singae-lookup",
      message: `Lookup system error: ${error.message}`,
      metadata: { username, accountCode },
      error
    });
    return res.status(500).json({
      error: "SYSTEM_ERROR",
      message: "Loi he thong, vui long thu lai."
    });
  }
});

// Namespaced dual-flow aliases for strict separated paths.
router.use("/openai", (req, res, next) => {
  req.query = { ...(req.query || {}), provider: "openai" };
  if (req.body && typeof req.body === "object") {
    req.body = { ...req.body, provider: "openai" };
  }
  req.url = req.url.replace(/^\/openai/, "") || "/";
  return router(req, res, next);
});

router.use("/localai", (req, res, next) => {
  req.query = { ...(req.query || {}), provider: "localai" };
  if (req.body && typeof req.body === "object") {
    req.body = { ...req.body, provider: "localai" };
  }
  req.url = req.url.replace(/^\/localai/, "") || "/";
  return router(req, res, next);
});

const { registerFacebookPageSettingsRoutes } = require("./facebookPageSettings");
registerFacebookPageSettingsRoutes(router, { emitChannelConnectionsEvent });
registerFacebookOAuthProxyRoutes(router);

module.exports = router;









