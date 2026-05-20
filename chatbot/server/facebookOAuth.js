const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const axios = require("axios");

/** `local/private` — cùng thư mục với `lib/facebookOauthSync.js` (không phải repo root). */
const PRIVATE_DIR = path.join(__dirname, "..", "..", "private");
const OAUTH_RESULT_FILE = path.join(PRIVATE_DIR, "facebook-oauth.json");
const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/** Field đăng ký webhook Messenger cho Page (Cách B: sau OAuth gắn app vào Page). */
const MESSENGER_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_deliveries",
  "message_reads",
  "messaging_referrals",
  "message_echoes"
].join(",");

const oauthStates = new Map();
const pendingPicks = new Map();

function readAppCredentials() {
  return {
    appId: String(process.env.FB_APP_ID || "").trim(),
    appSecret: String(process.env.FB_APP_SECRET || "").trim()
  };
}

function getRedirectUri(req) {
  const fixed = String(process.env.FB_OAUTH_REDIRECT_URI || "").trim();
  if (fixed) return fixed;
  const host = String(req.get("host") || "").trim() || `127.0.0.1:${process.env.PORT || 3000}`;
  const xfProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const proto =
    xfProto === "https" || xfProto === "http"
      ? xfProto
      : req.secure
        ? "https"
        : String(process.env.PUBLIC_HTTP_PROTO || "http").trim() || "http";
  return `${proto}://${host}/api/chatbot/facebook-oauth/callback`;
}

function cleanupMaps() {
  const now = Date.now();
  for (const [k, exp] of oauthStates) {
    if (exp < now) oauthStates.delete(k);
  }
  for (const [k, v] of pendingPicks) {
    if (v.expires < now) pendingPicks.delete(k);
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function successCloseHtml(message) {
  const msg = escapeHtml(message || "Da ket noi Facebook.");
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Facebook OAuth</title></head><body style="font-family:system-ui,sans-serif;padding:24px;">
<p>${msg}</p>
<p style="color:#666;font-size:14px;">Dong cua so nay de quay lai ung dung.</p>
<script>
(function(){
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'singae-facebook-oauth', ok: true }, '*');
    }
  } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch (e2) {} }, 400);
})();
</script>
</body></html>`;
}

function errorHtml(message) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Facebook OAuth</title></head><body style="font-family:system-ui,sans-serif;padding:24px;">
<p style="color:#b91c1c;">${escapeHtml(message || "Loi OAuth.")}</p>
</body></html>`;
}

async function exchangeCodeForUserToken({ code, redirectUri, appId, appSecret }) {
  const url = `${GRAPH_BASE}/oauth/access_token`;
  const { data } = await axios.get(url, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code
    },
    timeout: 25000
  });
  const token = String(data?.access_token || "").trim();
  if (!token) throw new Error("Meta khong tra access_token.");
  return token;
}

async function exchangeForLongLivedUserToken({ shortLivedUserToken, appId, appSecret }) {
  const url = `${GRAPH_BASE}/oauth/access_token`;
  const { data } = await axios.get(url, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedUserToken
    },
    timeout: 25000
  });
  const token = String(data?.access_token || "").trim();
  return token || shortLivedUserToken;
}

async function fetchManagedPages(userAccessToken) {
  const url = `${GRAPH_BASE}/me/accounts`;
  const { data } = await axios.get(url, {
    params: {
      fields: "id,name,access_token",
      access_token: userAccessToken
    },
    timeout: 25000
  });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((row) => ({
      id: String(row?.id || "").trim(),
      name: String(row?.name || "").trim(),
      accessToken: String(row?.access_token || "").trim()
    }))
    .filter((p) => p.id && p.accessToken);
}

/**
 * Lấy tên + ảnh Page qua Graph (dùng page token trong file, không gửi token ra client).
 */
async function fetchFacebookPageDisplay(pageId, pageAccessToken) {
  const pid = String(pageId || "").trim();
  const tok = String(pageAccessToken || "").trim();
  if (!pid || !tok) return { pageName: "", pictureUrl: "" };
  const parsePicture = (data) => {
    const pic = data?.picture;
    if (!pic) return "";
    if (pic && typeof pic === "object") {
      return String(pic.data?.url || pic.url || "").trim();
    }
    if (typeof pic === "string") return pic.trim();
    return "";
  };
  try {
    const graphUrl = `${GRAPH_BASE}/${encodeURIComponent(pid)}`;
    let { data } = await axios.get(graphUrl, {
      params: {
        fields: "name,picture{url}",
        access_token: tok
      },
      timeout: 15000
    });
    let pageName = String(data?.name || "").trim();
    let pictureUrl = parsePicture(data);
    if (!pictureUrl) {
      try {
        const r2 = await axios.get(graphUrl, {
          params: {
            fields: "name,picture.type(large)",
            access_token: tok
          },
          timeout: 12000
        });
        data = r2.data;
        pageName = pageName || String(data?.name || "").trim();
        pictureUrl = parsePicture(data);
      } catch (_) {
        /* ignore */
      }
    }
    return { pageName, pictureUrl };
  } catch (_) {
    return { pageName: "", pictureUrl: "" };
  }
}

function readOauthPagesWithTokensFromDisk() {
  const raw = readOauthDiskRaw();
  let pages = [];
  let activePageId = "";
  if (raw && Number(raw.version) === 2 && Array.isArray(raw.pages)) {
    pages = raw.pages
      .map((row) => ({
        pageId: String(row?.pageId || "").trim(),
        pageName: String(row?.pageName || "").trim(),
        pageAccessToken: String(row?.pageAccessToken || "").trim()
      }))
      .filter((p) => p.pageId && p.pageAccessToken);
    activePageId = String(raw.activePageId || "").trim();
  } else if (raw && String(raw.pageId || "").trim() && String(raw.pageAccessToken || "").trim()) {
    pages = [
      {
        pageId: String(raw.pageId).trim(),
        pageName: String(raw.pageName || "").trim(),
        pageAccessToken: String(raw.pageAccessToken).trim()
      }
    ];
    activePageId = pages[0].pageId;
  }
  return { pages, activePageId: activePageId || pages[0]?.pageId || "" };
}

function readOauthDiskRaw() {
  try {
    if (!fs.existsSync(OAUTH_RESULT_FILE)) return null;
    const raw = fs.readFileSync(OAUTH_RESULT_FILE, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Gộp Page vào `facebook-oauth.json` (nhiều Page như Pancake). Legacy 1 Page được nâng lên `version: 2`.
 */
function mergePageIntoOauthFile({ pageId, pageName, pageAccessToken, makeActive = true }) {
  try {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  } catch (_) {}
  const pid = String(pageId || "").trim();
  const tok = String(pageAccessToken || "").trim();
  if (!pid || !tok) throw new Error("Thieu pageId hoac pageAccessToken.");
  const prev = readOauthDiskRaw();
  let pages = [];
  let prevActive = "";
  if (prev && Number(prev.version) === 2 && Array.isArray(prev.pages)) {
    pages = prev.pages.map((row) => ({
      pageId: String(row?.pageId || "").trim(),
      pageName: String(row?.pageName || "").trim(),
      pageAccessToken: String(row?.pageAccessToken || "").trim()
    }));
    prevActive = String(prev.activePageId || "").trim();
  } else if (prev && String(prev.pageAccessToken || "").trim() && String(prev.pageId || "").trim()) {
    pages = [
      {
        pageId: String(prev.pageId).trim(),
        pageName: String(prev.pageName || "").trim(),
        pageAccessToken: String(prev.pageAccessToken).trim()
      }
    ];
    prevActive = pages[0].pageId;
  }
  const idx = pages.findIndex((p) => p.pageId === pid);
  const prevEnabled = idx >= 0 ? pages[idx].botReplyEnabled : undefined;
  const row = {
    pageId: pid,
    pageName: String(pageName || "").trim(),
    pageAccessToken: tok,
    botReplyEnabled: prevEnabled !== undefined ? prevEnabled !== false : true
  };
  if (idx >= 0) pages[idx] = row;
  else pages.push(row);
  const activePageId =
    makeActive || !prevActive ? pid : prevActive || pid || pages[0]?.pageId || "";
  const payload = {
    version: 2,
    updatedAt: new Date().toISOString(),
    pages,
    activePageId: activePageId || pid
  };
  fs.writeFileSync(OAUTH_RESULT_FILE, JSON.stringify(payload, null, 2), "utf8");
}

async function subscribeMessengerWebhooksForPage(pageId, pageAccessToken) {
  const pid = String(pageId || "").trim();
  const tok = String(pageAccessToken || "").trim();
  if (!pid || !tok) return { ok: false, skipped: true, detail: "missing id/token" };
  try {
    const url = `${GRAPH_BASE}/${encodeURIComponent(pid)}/subscribed_apps`;
    await axios.post(url, null, {
      params: {
        access_token: tok,
        subscribed_fields: MESSENGER_WEBHOOK_FIELDS
      },
      timeout: 25000
    });
    return { ok: true };
  } catch (e) {
    const meta = e?.response?.data?.error || null;
    const code = meta?.code;
    const sub = String(meta?.error_subcode || "");
    const msg = meta?.message || e?.message || "subscribe failed";
    /** Đã đăng ký hoặc trùng — coi là ổn khi Meta báo lỗi “đã subscribe”. */
    if (
      code === 100 &&
      /already|subscribed|duplicate/i.test(String(msg))
    ) {
      return { ok: true, detail: msg };
    }
    return { ok: false, detail: String(msg) };
  }
}

function pickPageFormHtml(pickToken, pages) {
  const options = pages
    .map(
      (p, i) =>
        `<label style="display:block;margin:10px 0;"><input type="radio" name="pageId" value="${escapeHtml(p.id)}" ${i === 0 ? "checked" : ""}/> ${escapeHtml(p.name || p.id)}</label>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Chọn Page</title></head><body style="font-family:system-ui,sans-serif;padding:24px;">
<h2 style="font-size:18px;">Chọn Fanpage kết nối Messenger</h2>
<p style="color:#555;font-size:14px;">Muốn <strong>thêm Page khác</strong> sau này: mở lại «Đăng nhập Meta (OAuth)» trong Chatbot Manager.</p>
<form method="POST" action="/api/chatbot/facebook-oauth/pick">
<input type="hidden" name="pickToken" value="${escapeHtml(pickToken)}"/>
${options}
<button type="submit" style="margin-top:16px;padding:10px 18px;font-weight:600;cursor:pointer;">Lưu Page</button>
</form>
</body></html>`;
}

/** Luu Page (gop nhieu Page), dang ky webhook Messenger qua Graph, bao UI dong cua so. */
async function finishOauthPageConnection(emit, { pageId, pageName, pageAccessToken }) {
  mergePageIntoOauthFile({
    pageId,
    pageName,
    pageAccessToken,
    makeActive: true
  });
  const sub = await subscribeMessengerWebhooksForPage(pageId, pageAccessToken);
  emit("facebook-oauth-saved");
  let msg = `Da luu Page "${pageName || pageId}" vao ung dung (co the nhieu Page trong private/facebook-oauth.json).`;
  if (!sub.ok && sub.detail && !sub.skipped) {
    msg += ` Luu y Graph subscribed_apps: ${sub.detail}. Ban van co the gan webhook trong Meta App > Messenger > Webhooks.`;
  } else {
    msg +=
      " Da goi dang ky webhook fields Messenger cho Page. Dat FB_VERIFY_TOKEN trong private/.env va cung URL webhook trong App.";
  }
  return msg;
}

/**
 * @param {import("express").Router} router
 * @param {{ emitChannelConnectionsEvent?: (reason?: string) => void }} hooks
 */
function registerFacebookOAuthRoutes(router, hooks = {}) {
  const emit = typeof hooks.emitChannelConnectionsEvent === "function" ? hooks.emitChannelConnectionsEvent : () => {};

  router.get("/facebook-oauth/status", (_req, res) => {
    const { appId, appSecret } = readAppCredentials();
    let oauthRuntimeFile = false;
    let oauthPageCount = 0;
    try {
      oauthRuntimeFile = fs.existsSync(OAUTH_RESULT_FILE);
      const raw = readOauthDiskRaw();
      if (raw && Number(raw.version) === 2 && Array.isArray(raw.pages)) {
        oauthPageCount = raw.pages.filter((p) => String(p?.pageAccessToken || "").trim()).length;
      } else if (raw && String(raw.pageAccessToken || "").trim()) {
        oauthPageCount = 1;
      }
    } catch (_) {}
    return res.json({
      oauthAppConfigured: Boolean(appId && appSecret),
      oauthRuntimeFile,
      oauthPageCount
    });
  });

  router.get("/facebook-oauth/pages", async (_req, res) => {
    try {
      const { listFacebookPagesManagerSettings } = require("./facebookPageSettings");
      const data = await listFacebookPagesManagerSettings();
      return res.json({
        pages: data.pages.map((p) => ({
          pageId: p.pageId,
          pageName: p.pageName,
          pictureUrl: p.pictureUrl
        })),
        activePageId: data.activePageId
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Cannot read oauth pages." });
    }
  });

  router.get("/facebook-pages/settings", async (_req, res) => {
    try {
      const { listFacebookPagesManagerSettings } = require("./facebookPageSettings");
      const data = await listFacebookPagesManagerSettings();
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Cannot read page settings." });
    }
  });

  router.post("/facebook-oauth/sync-from-vps", async (_req, res) => {
    try {
      const { syncFacebookOauthFromVps, canSyncFromVps } = require("../../lib/facebookOauthSync");
      if (!canSyncFromVps()) {
        return res.status(503).json({
          ok: false,
          error: "Thiếu BRIDGE_SHARED_SECRET hoặc FB_VERIFY_TOKEN để đồng bộ từ VPS."
        });
      }
      const r = await syncFacebookOauthFromVps({ force: true });
      if (!r.ok) {
        return res.status(502).json({ ok: false, ...r });
      }
      const { listFacebookPagesManagerSettings } = require("./facebookPageSettings");
      const data = await listFacebookPagesManagerSettings();
      return res.json({ ok: true, sync: r, ...data });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "Sync failed" });
    }
  });

  router.patch("/facebook-pages/:pageId/bot-reply", (req, res) => {
    const pageId = String(req.params.pageId || "").trim();
    const enabled = req.body?.enabled;
    if (!pageId) {
      return res.status(400).json({ ok: false, error: "pageId required" });
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ ok: false, error: "body.enabled must be boolean" });
    }
    try {
      const { setFacebookPageBotReplyEnabled } = require("./facebookPageSettings");
      const page = setFacebookPageBotReplyEnabled(pageId, enabled);
      emit("facebook-page-settings");
      return res.json({ ok: true, page });
    } catch (e) {
      return res.status(404).json({ ok: false, error: e?.message || "Update failed" });
    }
  });

  router.get("/facebook-oauth/start", (req, res) => {
    cleanupMaps();
    const { appId, appSecret } = readAppCredentials();
    if (!appId || !appSecret) {
      return res
        .status(503)
        .send(
          "<p>Thieu <code>FB_APP_ID</code> / <code>FB_APP_SECRET</code> trong <code>private/.env</code>.</p>"
        );
    }
    const redirectUri = getRedirectUri(req);
    const state = crypto.randomBytes(18).toString("hex");
    oauthStates.set(state, Date.now() + 12 * 60 * 1000);

    const configId = String(process.env.FB_LOGIN_CONFIG_ID || "").trim();
    const params = new URLSearchParams();
    params.set("client_id", appId);
    params.set("redirect_uri", redirectUri);
    params.set("state", state);
    params.set("response_type", "code");

    if (configId) {
      params.set("config_id", configId);
      params.set("override_default_response_type", "true");
    } else {
      const scopes = String(
        process.env.FB_OAUTH_SCOPES || "pages_messaging,pages_show_list,pages_manage_metadata"
      ).trim();
      params.set("scope", scopes);
    }

    res.redirect(`${DIALOG_BASE}?${params.toString()}`);
  });

  router.get("/facebook-oauth/callback", async (req, res) => {
    cleanupMaps();
    const err = String(req.query.error || "").trim();
    if (err) {
      const desc = String(req.query.error_description || req.query.error_reason || err).trim();
      return res.status(400).send(errorHtml(desc || err));
    }
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    if (!code || !state || !oauthStates.has(state)) {
      return res.status(400).send(errorHtml("Thieu code/state hoac state het han. Thu lai tu dau."));
    }
    oauthStates.delete(state);

    const { appId, appSecret } = readAppCredentials();
    if (!appId || !appSecret) {
      return res.status(503).send(errorHtml("Thieu FB_APP_ID / FB_APP_SECRET."));
    }
    const redirectUri = getRedirectUri(req);

    try {
      let userToken = await exchangeCodeForUserToken({ code, redirectUri, appId, appSecret });
      try {
        userToken = await exchangeForLongLivedUserToken({
          shortLivedUserToken: userToken,
          appId,
          appSecret
        });
      } catch (_) {
        /* giu short-lived neu exchange that bai */
      }

      const pages = await fetchManagedPages(userToken);
      if (!pages.length) {
        return res
          .status(400)
          .send(
            errorHtml(
              "Khong tim thay Page nao (me/accounts rong). Kiem tra quyen app va tai khoan quan ly Page."
            )
          );
      }

      if (pages.length === 1) {
        const p = pages[0];
        try {
          const closeMsg = await finishOauthPageConnection(emit, {
            pageId: p.id,
            pageName: p.name,
            pageAccessToken: p.accessToken
          });
          return res.status(200).send(successCloseHtml(closeMsg));
        } catch (err) {
          return res.status(500).send(errorHtml(err?.message || "Loi luu Page."));
        }
      }

      const pickToken = crypto.randomBytes(20).toString("hex");
      pendingPicks.set(pickToken, { pages, expires: Date.now() + 15 * 60 * 1000 });
      return res.status(200).send(pickPageFormHtml(pickToken, pages));
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || "OAuth that bai.";
      return res.status(500).send(errorHtml(String(msg)));
    }
  });

  router.post("/facebook-oauth/pick", express.urlencoded({ extended: true }), async (req, res) => {
    cleanupMaps();
    const pickToken = String(req.body?.pickToken || "").trim();
    const pageId = String(req.body?.pageId || "").trim();
    const pending = pendingPicks.get(pickToken);
    if (!pending || !pageId) {
      return res.status(400).send(errorHtml("Token chon Page khong hop le hoac het han."));
    }
    pendingPicks.delete(pickToken);
    const page = pending.pages.find((p) => p.id === pageId);
    if (!page) {
      return res.status(400).send(errorHtml("Page khong nam trong danh sach da cap quyen."));
    }
    try {
      const msg = await finishOauthPageConnection(emit, {
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.accessToken
      });
      return res.status(200).send(successCloseHtml(msg));
    } catch (e) {
      return res.status(500).send(errorHtml(e?.message || "Khong ghi duoc file."));
    }
  });
}

module.exports = {
  registerFacebookOAuthRoutes,
  OAUTH_RESULT_FILE,
  readOauthDiskRaw,
  readOauthPagesWithTokensFromDisk,
  fetchFacebookPageDisplay
};
