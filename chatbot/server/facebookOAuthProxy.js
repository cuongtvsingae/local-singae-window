const axios = require("axios");
const { getVpsPublicBaseUrl } = require("../../lib/vpsPublicBase");
const { scheduleFacebookOauthSync } = require("../../lib/facebookOauthSync");

const VPS_BASE = getVpsPublicBaseUrl();
const OAUTH_PREFIX = `${VPS_BASE}/api/chatbot/facebook-oauth`;

function clientOrigin(req) {
  const proto =
    String(req.get("x-forwarded-proto") || "").split(",")[0].trim() ||
    (req.secure ? "https" : "http");
  const host = String(req.get("host") || "").trim() || "localhost:3000";
  return `${proto}://${host}`;
}

async function proxyJsonGet(path, res, { syncOauth = false } = {}) {
  try {
    const url = `${OAUTH_PREFIX}${path}`;
    const { data, status } = await axios.get(url, {
      timeout: 25000,
      validateStatus: () => true
    });
    if (syncOauth && status >= 200 && status < 300) {
      scheduleFacebookOauthSync(`proxy${path}`);
    }
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: e?.message || "Khong ket noi duoc VPS Facebook OAuth.",
      vpsBase: VPS_BASE
    });
  }
}

/**
 * OAuth Meta (callback HTTPS) chay tren VPS; local chi proxy UI.
 */
function registerFacebookOAuthProxyRoutes(router) {
  router.get("/facebook-oauth/status", (req, res) =>
    proxyJsonGet("/status", res, { syncOauth: true })
  );

  router.get("/facebook-oauth/pages", (req, res) =>
    proxyJsonGet("/pages", res, { syncOauth: true })
  );

  router.get("/facebook-oauth/start", (req, res) => {
    const returnOrigin = encodeURIComponent(
      String(req.query.returnOrigin || "").trim() || clientOrigin(req)
    );
    const url = `${OAUTH_PREFIX}/start?returnOrigin=${returnOrigin}`;
    return res.redirect(url);
  });
}

async function fetchVpsFacebookOauthStatus() {
  const { data, status } = await axios.get(`${OAUTH_PREFIX}/status`, {
    timeout: 15000,
    validateStatus: () => true
  });
  if (status < 200 || status >= 300) {
    throw new Error(`VPS oauth status HTTP ${status}`);
  }
  return data;
}

module.exports = {
  registerFacebookOAuthProxyRoutes,
  fetchVpsFacebookOauthStatus,
  VPS_OAUTH_START: `${OAUTH_PREFIX}/start`
};
