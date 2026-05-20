const axios = require("axios");
const { getVpsPublicBaseUrl } = require("./vpsPublicBase");

const BRIDGE_SECRET = String(process.env.BRIDGE_SHARED_SECRET || "").trim();
const VERIFY_TOKEN = String(
  process.env.FB_VERIFY_TOKEN || process.env.FACEBOOK_VERIFY_TOKEN || ""
).trim();

function internalHeaders() {
  const headers = {};
  if (BRIDGE_SECRET) headers["X-Bridge-Secret"] = BRIDGE_SECRET;
  if (VERIFY_TOKEN) headers["X-Oauth-Sync-Token"] = VERIFY_TOKEN;
  return headers;
}

function canFetchFromVps() {
  return Boolean(BRIDGE_SECRET || VERIFY_TOKEN);
}

/**
 * Lấy hồ sơ Messenger qua VPS (đúng Page token trong facebook-oauth.json trên server).
 */
async function fetchMessengerProfileFromVps(pageId, senderId) {
  if (!canFetchFromVps()) return null;
  const pid = String(pageId || "").trim();
  const psid = String(senderId || "").trim();
  if (!pid || !psid) return null;

  const base = getVpsPublicBaseUrl();
  const url = `${base}/api/chatbot-bridge/facebook/user-profile`;
  const { data, status } = await axios.get(url, {
    params: { pageId: pid, senderId: psid },
    headers: internalHeaders(),
    timeout: 20000,
    validateStatus: () => true
  });
  if (status < 200 || status >= 300) return null;
  return data?.profile && typeof data.profile === "object" ? data.profile : null;
}

function readEnrichedSenderProfile(rawEvent) {
  const p = rawEvent?._singaeSenderProfile;
  if (!p || typeof p !== "object") return null;
  const first = String(p.firstName || p.first_name || "").trim();
  const last = String(p.lastName || p.last_name || "").trim();
  const name =
    String(p.name || p.displayName || "")
      .trim()
      .replace(/\s+/g, " ") ||
    [first, last].filter(Boolean).join(" ").trim() ||
    null;
  const avatarUrl = String(p.avatarUrl || p.profile_pic || "").trim() || null;
  if (!name && !avatarUrl && !first && !last) return null;
  return {
    ...p,
    name: name || p.name || null,
    displayName: name || p.displayName || null,
    firstName: first || p.firstName || null,
    lastName: last || p.lastName || null,
    avatarUrl: avatarUrl || p.avatarUrl || null
  };
}

module.exports = {
  canFetchFromVps,
  fetchMessengerProfileFromVps,
  readEnrichedSenderProfile
};
