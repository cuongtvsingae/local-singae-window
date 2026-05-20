const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { kvDelete } = require("./sqliteStore");
const { OAUTH_RESULT_FILE } = require("./facebookOAuth");

const LOCAL_ENV_FILE = path.join(__dirname, "..", "..", "private", ".env");

dotenv.config({ path: LOCAL_ENV_FILE });
dotenv.config();

// Xóa key cũ trong SQLite (nếu có) — không còn dùng channel-config trong DB.
kvDelete("channel-config").catch(() => {});

/**
 * Đọc private/facebook-oauth.json — hỗ trợ legacy (một Page) và version 2 (nhiều Page, kiểu Pancake).
 * @returns {{ pages: Array<{ pageId: string, pageName: string, pageAccessToken: string }>, activePageId: string }}
 */
function readFacebookOauthRuntimeV2() {
  try {
    if (!fs.existsSync(OAUTH_RESULT_FILE)) return { pages: [], activePageId: "" };
    const raw = fs.readFileSync(OAUTH_RESULT_FILE, "utf8");
    const j = JSON.parse(raw);
    if (j && Number(j.version) === 2 && Array.isArray(j.pages)) {
      const pages = j.pages
        .map((row) => ({
          pageId: String(row?.pageId || "").trim(),
          pageName: String(row?.pageName || "").trim(),
          pageAccessToken: String(row?.pageAccessToken || "").trim()
        }))
        .filter((p) => p.pageId && p.pageAccessToken);
      return {
        pages,
        activePageId: String(j.activePageId || "").trim() || (pages[0]?.pageId || "")
      };
    }
    const pageId = String(j?.pageId || "").trim();
    const pageAccessToken = String(j?.pageAccessToken || "").trim();
    if (pageId && pageAccessToken) {
      return {
        pages: [
          {
            pageId,
            pageName: String(j?.pageName || "").trim(),
            pageAccessToken
          }
        ],
        activePageId: pageId
      };
    }
    return { pages: [], activePageId: "" };
  } catch (_) {
    return { pages: [], activePageId: "" };
  }
}

function readFacebookOauthRuntime() {
  const v2 = readFacebookOauthRuntimeV2();
  const first = v2.pages[0];
  if (!first) return null;
  return {
    pageId: first.pageId,
    pageName: first.pageName,
    pageAccessToken: first.pageAccessToken
  };
}

/**
 * Token gửi tin / Graph cho một Page cụ thể (webhook entry.id). Fallback env hoặc Page đầu trong file.
 */
function getFacebookPageAccessTokenForPage(pageId) {
  const pid = String(pageId || "").trim();
  const { pages, activePageId } = readFacebookOauthRuntimeV2();
  if (pid) {
    const hit = pages.find((p) => p.pageId === pid);
    if (hit?.pageAccessToken) return String(hit.pageAccessToken).trim();
    // Không fallback token env của Page khác — tránh gọi Graph sai token / không lấy được profile.
    return "";
  }
  const envTok = String(process.env.FB_PAGE_ACCESS_TOKEN || "").trim();
  if (envTok) return envTok;
  const fallbackId = String(activePageId || pages[0]?.pageId || "").trim();
  if (fallbackId) {
    const hit2 = pages.find((p) => p.pageId === fallbackId);
    if (hit2?.pageAccessToken) return String(hit2.pageAccessToken).trim();
  }
  return pages[0]?.pageAccessToken ? String(pages[0].pageAccessToken).trim() : "";
}

function getDefaultFacebookPageId() {
  const envActive = String(process.env.FB_ACTIVE_PAGE_ID || "").trim();
  if (envActive) return envActive;
  const envPid = String(process.env.FB_PAGE_ID || "").trim();
  if (envPid) return envPid;
  const { pages, activePageId } = readFacebookOauthRuntimeV2();
  const active = String(activePageId || "").trim();
  if (active) return active;
  return pages[0]?.pageId ? String(pages[0].pageId).trim() : "";
}

/** Tên Page để hiển thị nhãn hội thoại — theo `pageId` webhook hoặc env / default. */
function getFacebookPageLabelName(pageId) {
  const pid = String(pageId || "").trim();
  if (pid) {
    const { pages } = readFacebookOauthRuntimeV2();
    const hit = pages.find((p) => p.pageId === pid);
    if (hit?.pageName) return String(hit.pageName).trim();
    // Page chưa OAuth — không gán nhầm tên Page khác.
    return "";
  }
  return String(getFacebookMessengerConfig().pageName || "").trim();
}

/** AI — chỉ từ env. */
function aiConfigFromEnvOnly() {
  const envLlmProvider = String(process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const provider = envLlmProvider === "localai" || envLlmProvider === "openai" ? envLlmProvider : "";
  return {
    openai: {
      apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
      model: String(process.env.OPENAI_MODEL || "").trim(),
      embeddingModel: String(process.env.OPENAI_EMBEDDING_MODEL || "").trim(),
      provider
    },
    localai: {
      baseUrl: String(process.env.LOCALAI_BASE || process.env.OFFLINE_LLM_BASE || "").trim(),
      apiKey: String(process.env.LOCALAI_API_KEY || process.env.OFFLINE_LLM_API_KEY || "").trim(),
      model: String(process.env.LOCALAI_MODEL || process.env.OFFLINE_LLM_MODEL || "").trim(),
      embeddingModel: String(process.env.LOCALAI_EMBEDDING_MODEL || "").trim()
    }
  };
}

/** Chatbot (Messenger + KB + embed) chi dung OpenAI; bo qua LLM_PROVIDER=localai. */
function requireChatbotLlmProvider() {
  return "openai";
}

function normalizePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : Number(process.env.PORT || 3003);
}

/**
 * Page token / page name: ưu tiên biến môi trường, sau đó file OAuth (private/facebook-oauth.json).
 * Verify token chỉ từ env (webhook Meta phải khớp tay).
 */
function getFacebookMessengerConfig() {
  const envPageName = String(process.env.FB_PAGE_NAME || "").trim();
  const verifyToken = String(
    process.env.FB_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN || ""
  ).trim();
  const envTok = String(process.env.FB_PAGE_ACCESS_TOKEN || "").trim();
  const defaultPid = getDefaultFacebookPageId();
  const pageAccessToken = envTok || getFacebookPageAccessTokenForPage(defaultPid);
  let pageName = envPageName;
  if (!pageName && defaultPid) {
    const { pages } = readFacebookOauthRuntimeV2();
    pageName = pages.find((p) => p.pageId === defaultPid)?.pageName || pages[0]?.pageName || "";
  }
  return {
    pageName: pageName || "",
    verifyToken,
    pageAccessToken: pageAccessToken || "",
    defaultPageId: defaultPid || null
  };
}

/** Toàn bộ runtime config chỉ từ biến môi trường — không SQLite / file channel-config. */
function buildRuntimeConfigFromEnv() {
  const ai = aiConfigFromEnvOnly();
  const fb = getFacebookMessengerConfig();
  return {
    updatedAt: new Date().toISOString(),
    app: {
      port: normalizePort(Number(process.env.PORT || 3003))
    },
    openai: ai.openai,
    localai: ai.localai,
    channels: {
      facebookMessenger: {
        pageName: fb.pageName,
        verifyToken: fb.verifyToken,
        pageAccessToken: fb.pageAccessToken,
        defaultPageId: fb.defaultPageId || null
      }
    }
  };
}

function getRuntimeConfig() {
  return buildRuntimeConfigFromEnv();
}

/** Giữ chữ ký cho code cũ — không ghi DB / file. */
function updateRuntimeConfig() {
  return getRuntimeConfig();
}

function loadChannelConfig() {
  return getRuntimeConfig();
}

module.exports = {
  getFacebookMessengerConfig,
  getFacebookPageAccessTokenForPage,
  getFacebookPageLabelName,
  getDefaultFacebookPageId,
  readFacebookOauthRuntimeV2,
  getRuntimeConfig,
  loadChannelConfig,
  updateRuntimeConfig,
  requireChatbotLlmProvider
};
