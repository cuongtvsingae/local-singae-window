const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getVpsPublicBaseUrl } = require("./vpsPublicBase");

const OAUTH_FILE = path.join(__dirname, "..", "private", "facebook-oauth.json");
const BRIDGE_SECRET = String(process.env.BRIDGE_SHARED_SECRET || "").trim();
const VERIFY_TOKEN = String(
  process.env.FB_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN || ""
).trim();

let lastSyncAt = 0;
let syncInFlight = null;
const MIN_SYNC_INTERVAL_MS = Math.max(5000, Number(process.env.FB_OAUTH_SYNC_MIN_MS) || 15000);

function oauthSyncHeaders() {
  const headers = {};
  if (BRIDGE_SECRET) headers["X-Bridge-Secret"] = BRIDGE_SECRET;
  if (VERIFY_TOKEN) headers["X-Oauth-Sync-Token"] = VERIFY_TOKEN;
  return headers;
}

function canSyncFromVps() {
  return Boolean(BRIDGE_SECRET || VERIFY_TOKEN);
}

/**
 * Tải `facebook-oauth.json` từ VPS (OAuth lưu trên singae.cloud) về local/private/.
 * Cần BRIDGE_SHARED_SECRET hoặc cùng FB_VERIFY_TOKEN trên VPS + local.
 */
async function syncFacebookOauthFromVps({ force = false } = {}) {
  if (!canSyncFromVps()) {
    return { ok: false, reason: "no_sync_credentials" };
  }
  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    return { ok: true, skipped: true, reason: "throttled" };
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const url = `${getVpsPublicBaseUrl()}/api/chatbot/facebook-oauth/export`;
    const { data, status } = await axios.get(url, {
      headers: oauthSyncHeaders(),
      timeout: 25000,
      validateStatus: () => true
    });
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        reason: `http_${status}`,
        detail: data?.error || data?.message || null
      };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, reason: "empty_payload" };
    }
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const hasLegacy = String(data.pageAccessToken || "").trim() && String(data.pageId || "").trim();
    if (!pages.length && !hasLegacy) {
      return { ok: false, reason: "no_pages_in_export" };
    }
    let payload = data;
    try {
      const { mergeBotReplyFlagsFromLocal } = require("../chatbot/server/facebookPageSettings");
      payload = mergeBotReplyFlagsFromLocal(data);
    } catch (_) {}
    fs.mkdirSync(path.dirname(OAUTH_FILE), { recursive: true });
    fs.writeFileSync(OAUTH_FILE, JSON.stringify(payload, null, 2), "utf8");
    lastSyncAt = Date.now();
    const pageCount =
      pages.filter((p) => String(p?.pageAccessToken || "").trim()).length || (hasLegacy ? 1 : 0);
    return { ok: true, pageCount, path: OAUTH_FILE };
  })()
    .catch((e) => ({ ok: false, reason: e?.message || "sync_failed" }))
    .finally(() => {
      syncInFlight = null;
    });

  return syncInFlight;
}

function scheduleFacebookOauthSync(reason = "") {
  if (!canSyncFromVps()) return;
  syncFacebookOauthFromVps().then((r) => {
    if (r?.ok && !r.skipped) {
      console.log(
        `[facebook-oauth-sync] ok pages=${r.pageCount || 0}${reason ? ` (${reason})` : ""}`
      );
    } else if (r && !r.ok && r.reason !== "throttled") {
      console.warn(`[facebook-oauth-sync] ${r.reason}${reason ? ` (${reason})` : ""}`);
    }
  });
}

module.exports = {
  OAUTH_FILE,
  canSyncFromVps,
  syncFacebookOauthFromVps,
  scheduleFacebookOauthSync
};
