const fs = require("fs");
const {
  OAUTH_RESULT_FILE,
  readOauthDiskRaw,
  readOauthPagesWithTokensFromDisk,
  fetchFacebookPageDisplay
} = require("./facebookOAuth");

function normalizeFacebookPageId(pageId) {
  return String(pageId || "").trim();
}

function isBotReplyEnabledOnRow(row) {
  return row?.botReplyEnabled !== false;
}

function findOauthDiskPageRow(pageId) {
  const pid = normalizeFacebookPageId(pageId);
  if (!pid) return null;
  const raw = readOauthDiskRaw();
  if (!raw) return null;
  if (Number(raw.version) === 2 && Array.isArray(raw.pages)) {
    return raw.pages.find((p) => normalizeFacebookPageId(p?.pageId) === pid) || null;
  }
  if (normalizeFacebookPageId(raw.pageId) === pid) return raw;
  return null;
}

function writeOauthDiskRaw(payload) {
  fs.mkdirSync(require("path").dirname(OAUTH_RESULT_FILE), { recursive: true });
  fs.writeFileSync(OAUTH_RESULT_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function listAuthorizedOauthPages() {
  const { pages } = readOauthPagesWithTokensFromDisk();
  return pages
    .map((p) => {
      const diskRow = findOauthDiskPageRow(p.pageId);
      return {
        ...p,
        botReplyEnabled: isBotReplyEnabledOnRow(diskRow || p)
      };
    })
    .filter((p) => normalizeFacebookPageId(p.pageId) && String(p.pageAccessToken || "").trim());
}

/**
 * Chỉ Page có trong facebook-oauth.json (đã OAuth) mới được bot trả lời.
 * Trong list: botReplyEnabled === false → không rep.
 * So khớp theo entry.id webhook (Facebook Page ID).
 */
function getFacebookPageBotReplyPolicy(pageId) {
  const pid = normalizeFacebookPageId(pageId);
  if (!pid) {
    return { allow: false, reason: "missing_page_id", pageId: "" };
  }
  const authorized = listAuthorizedOauthPages();
  if (!authorized.length) {
    return { allow: false, reason: "no_oauth_pages", pageId: pid };
  }
  const hit = authorized.find((p) => normalizeFacebookPageId(p.pageId) === pid);
  if (!hit) {
    return {
      allow: false,
      reason: "page_not_in_oauth_list",
      pageId: pid,
      authorizedPageIds: authorized.map((p) => p.pageId)
    };
  }
  if (!isBotReplyEnabledOnRow(hit)) {
    return {
      allow: false,
      reason: "bot_reply_disabled",
      pageId: pid,
      pageName: hit.pageName || ""
    };
  }
  return { allow: true, reason: "ok", pageId: pid, pageName: hit.pageName || "" };
}

function isFacebookPageBotReplyEnabled(pageId) {
  return getFacebookPageBotReplyPolicy(pageId).allow;
}

/** Giữ cờ tắt/bật local khi sync token từ VPS. */
function mergeBotReplyFlagsFromLocal(incoming) {
  if (!incoming || typeof incoming !== "object") return incoming;
  const prev = readOauthDiskRaw();
  const prevPages = Array.isArray(prev?.pages) ? prev.pages : [];
  const disabled = new Set(
    prevPages
      .filter((p) => String(p?.pageId || "").trim() && p.botReplyEnabled === false)
      .map((p) => String(p.pageId).trim())
  );
  const out = { ...incoming };
  if (!Array.isArray(out.pages)) return out;
  out.pages = out.pages.map((row) => {
    const id = String(row?.pageId || "").trim();
    const botReplyEnabled = disabled.has(id) ? false : row?.botReplyEnabled !== false;
    return { ...row, botReplyEnabled };
  });
  return out;
}

function setFacebookPageBotReplyEnabled(pageId, enabled) {
  const pid = normalizeFacebookPageId(pageId);
  if (!pid) throw new Error("pageId is required.");
  const raw = readOauthDiskRaw();
  if (!raw || Number(raw.version) !== 2 || !Array.isArray(raw.pages)) {
    throw new Error("Chưa có Page OAuth (facebook-oauth.json).");
  }
  const idx = raw.pages.findIndex((p) => normalizeFacebookPageId(p?.pageId) === pid);
  if (idx < 0) throw new Error(`Page ${pid} chưa được kết nối OAuth.`);
  raw.pages[idx] = {
    ...raw.pages[idx],
    botReplyEnabled: Boolean(enabled)
  };
  raw.updatedAt = new Date().toISOString();
  writeOauthDiskRaw(raw);
  const row = raw.pages[idx];
  return {
    pageId: pid,
    pageName: String(row?.pageName || "").trim() || pid,
    botReplyEnabled: isBotReplyEnabledOnRow(row)
  };
}

async function listFacebookPagesManagerSettings() {
  const raw = readOauthDiskRaw();
  const { pages, activePageId } = readOauthPagesWithTokensFromDisk();
  const rawById = new Map(
    (Array.isArray(raw?.pages) ? raw.pages : []).map((p) => [
      String(p?.pageId || "").trim(),
      p
    ])
  );
  const enriched = await Promise.all(
    pages.map(async (row) => {
      const fromGraph = await fetchFacebookPageDisplay(row.pageId, row.pageAccessToken);
      const diskRow = rawById.get(row.pageId) || row;
      return {
        pageId: row.pageId,
        pageName: fromGraph.pageName || row.pageName || row.pageId,
        pictureUrl: fromGraph.pictureUrl || "",
        botReplyEnabled: isBotReplyEnabledOnRow(diskRow),
        isActive: row.pageId === activePageId
      };
    })
  );
  return {
    pages: enriched,
    activePageId: activePageId || enriched[0]?.pageId || "",
    updatedAt: raw?.updatedAt || null
  };
}

const POLICY_SKIP_MESSAGES = {
  missing_page_id: "Skip auto-reply: missing Facebook Page id",
  no_oauth_pages: "Skip auto-reply: chưa có Page OAuth (facebook-oauth.json)",
  page_not_in_oauth_list: "Skip auto-reply: Page chưa có trong danh sách OAuth",
  bot_reply_disabled: "Skip auto-reply: bot reply disabled for this Page"
};

/**
 * @param {import("express").Router} router
 * @param {{ emitChannelConnectionsEvent?: (reason?: string) => void }} hooks
 */
function registerFacebookPageSettingsRoutes(router, hooks = {}) {
  const emit =
    typeof hooks.emitChannelConnectionsEvent === "function"
      ? hooks.emitChannelConnectionsEvent
      : () => {};

  router.get("/facebook-pages/settings", async (_req, res) => {
    try {
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
      const page = setFacebookPageBotReplyEnabled(pageId, enabled);
      emit("facebook-page-settings");
      return res.json({ ok: true, page });
    } catch (e) {
      return res.status(404).json({ ok: false, error: e?.message || "Update failed" });
    }
  });
}

module.exports = {
  normalizeFacebookPageId,
  isFacebookPageBotReplyEnabled,
  getFacebookPageBotReplyPolicy,
  POLICY_SKIP_MESSAGES,
  registerFacebookPageSettingsRoutes,
  mergeBotReplyFlagsFromLocal,
  setFacebookPageBotReplyEnabled,
  listFacebookPagesManagerSettings,
  listAuthorizedOauthPages,
  isBotReplyEnabledOnRow
};
