const https = require("https");
const path = require("path");
const fs = require("fs");
const { getFacebookMessengerConfig, getFacebookPageAccessTokenForPage } = require("./channelConfig");
const { appendServerLog } = require("./serverLogs");
const { bridgeEnabled, sendViaBridge } = require("../../lib/facebookBridgeClient");

const GRAPH_API_HOST = "graph.facebook.com";
const GRAPH_API_VERSION = "v22.0";
const MESSENGER_TEXT_LIMIT = 1900;

function getFacebookConfig() {
  return getFacebookMessengerConfig();
}

function isFacebookConfigured() {
  const config = getFacebookConfig();
  if (config.verifyToken && config.pageAccessToken) return true;
  if (!config.verifyToken) return false;
  try {
    const oauthFile = path.join(__dirname, "..", "..", "private", "facebook-oauth.json");
    if (!fs.existsSync(oauthFile)) return false;
    const raw = JSON.parse(fs.readFileSync(oauthFile, "utf8"));
    if (raw && Number(raw.version) === 2 && Array.isArray(raw.pages)) {
      return raw.pages.some((p) => String(p?.pageAccessToken || "").trim());
    }
    return Boolean(String(raw?.pageAccessToken || "").trim());
  } catch (_) {
    return false;
  }
}

function verifyFacebookWebhook(req, res) {
  const { verifyToken } = getFacebookConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!verifyToken) {
    return res.status(500).send("FB_VERIFY_TOKEN is not configured.");
  }

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

function splitTextMessage(text) {
  const value = String(text || "").trim();
  if (!value) {
    return [];
  }

  if (value.length <= MESSENGER_TEXT_LIMIT) {
    return [value];
  }

  const parts = [];
  let remaining = value;

  while (remaining.length > MESSENGER_TEXT_LIMIT) {
    const windowEnd = MESSENGER_TEXT_LIMIT;
    const head = remaining.slice(0, windowEnd);
    // Ưu tiên cắt tại xuống dòng (địa chỉ / danh sách dễ đọc), rồi mới tại khoảng trắng.
    let index = Math.max(head.lastIndexOf("\n"), head.lastIndexOf("\r"));
    if (index < 80) {
      index = head.lastIndexOf(" ", windowEnd);
      if (index < 80) {
        index = windowEnd;
      }
    }

    const chunk = remaining.slice(0, index).trim();
    if (!chunk) {
      index = windowEnd;
      parts.push(remaining.slice(0, index).trim());
      remaining = remaining.slice(index).trim();
      continue;
    }
    parts.push(chunk);
    remaining = remaining.slice(index).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

function sendGraphApiRequest(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const request = https.request(
      {
        hostname: GRAPH_API_HOST,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          const statusCode = Number(response.statusCode || 500);
          let parsed = null;

          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            parsed = raw;
          }

          if (statusCode >= 200 && statusCode < 300) {
            resolve(parsed);
            return;
          }

          reject(
            new Error(
              `Facebook Graph API error ${statusCode}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`
            )
          );
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

/**
 * @param {string} recipientId
 * @param {string} text
 * @param {{ pageAccessToken?: string }} [options] — token Page cụ thể (đa Page / OAuth)
 */
async function sendFacebookMessage(recipientId, text, options = {}) {
  if (bridgeEnabled()) {
    await sendViaBridge({
      recipientId,
      text,
      pageId: options.pageId,
      pageAccessToken: options.pageAccessToken
    });
    return;
  }

  const pageAccessToken =
    String(options?.pageAccessToken || "").trim() || getFacebookConfig().pageAccessToken;

  if (!pageAccessToken) {
    throw new Error("FB_PAGE_ACCESS_TOKEN is not configured.");
  }

  const parts = splitTextMessage(text);

  for (const part of parts) {
    await sendGraphApiRequest(`/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
      messaging_type: "RESPONSE",
      recipient: {
        id: recipientId
      },
      message: {
        text: part
      }
    });
  }
}

async function sendFacebookMediaMessage(recipientId, media, options = {}) {
  if (bridgeEnabled()) {
    await sendViaBridge({
      recipientId,
      media,
      pageId: options.pageId,
      pageAccessToken: options.pageAccessToken
    });
    return;
  }

  const pageAccessToken =
    String(options?.pageAccessToken || "").trim() || getFacebookConfig().pageAccessToken;

  if (!pageAccessToken) {
    throw new Error("FB_PAGE_ACCESS_TOKEN is not configured.");
  }

  const kind = String(media?.kind || media?.type || '').trim().toLowerCase();
  const url = media?.url || media?.mediaUrl;
  if (!recipientId || !url) {
    throw new Error("recipientId and media url are required.");
  }

  const normalizedKind = kind === "video" ? "video" : "image";
  await sendGraphApiRequest(`/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    messaging_type: "RESPONSE",
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: normalizedKind,
        payload: { url: String(url) }
      }
    }
  });
}

function resolveFacebookWebhookPageId({ pageId, rawEvent } = {}) {
  const fromEntry = String(pageId || "").trim();
  if (fromEntry) return fromEntry;
  return String(rawEvent?.recipient?.id || "").trim();
}

function extractIncomingMessages(body) {
  const results = [];

  for (const entry of body?.entry || []) {
    const pageId = entry?.id != null ? String(entry.id).trim() : "";
    for (const event of entry.messaging || []) {
      if (event.message?.is_echo) {
        continue;
      }

      const senderId = event.sender?.id;
      const text =
        event.message?.text ||
        event.postback?.title ||
        event.postback?.payload ||
        "";

      const attachments = Array.isArray(event.message?.attachments) ? event.message.attachments : [];

      if (!senderId || (!String(text).trim() && attachments.length === 0)) {
        continue;
      }

      results.push({
        senderId,
        text: String(text).trim(),
        attachments,
        providerMessageId: event.message?.mid || event.standby?.message?.mid || null,
        pageId,
        rawEvent: event
      });
    }
  }

  return results;
}

async function runIncomingMessages(incomingMessages, onMessage) {
  const errors = [];
  await Promise.all(
    incomingMessages.map(async (message) => {
      const pageAccessToken = getFacebookPageAccessTokenForPage(message.pageId);
      try {
        const reply = await onMessage(message);
        if (reply) {
          await sendFacebookMessage(message.senderId, reply, { pageAccessToken });
        }
      } catch (error) {
        const msg = error?.message || String(error);
        errors.push(msg);
        console.error("Facebook webhook processing failed:", msg);
        appendServerLog({
          level: "error",
          source: "facebook-webhook",
          message: `Facebook webhook onMessage failed: ${msg}`,
          metadata: {
            senderId: message.senderId,
            pageId: message.pageId || null,
            stack: typeof error?.stack === "string" ? error.stack.slice(0, 1200) : null
          }
        });
      }
    })
  );
  if (errors.length) {
    throw new Error(errors[0]);
  }
}

function processFacebookWebhook(req, res, onMessage) {
  if (req.body?.object !== "page") {
    return res.sendStatus(404);
  }

  const incomingMessages = extractIncomingMessages(req.body);
  const waitForCompletion =
    String(req.headers["x-chatbot-wait"] || req.headers["x-chatbot-sync"] || "").trim() === "1";

  if (waitForCompletion) {
    return runIncomingMessages(incomingMessages, onMessage)
      .then(() => res.status(200).send("EVENT_RECEIVED"))
      .catch((error) => {
        const msg = error?.message || String(error);
        return res.status(500).json({ ok: false, error: msg });
      });
  }

  res.status(200).send("EVENT_RECEIVED");
  runIncomingMessages(incomingMessages, onMessage).catch((error) => {
    console.error("Facebook webhook batch processing failed:", error.message);
  });

  return undefined;
}

function sendGraphApiGet(pathname) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: GRAPH_API_HOST,
        path: pathname,
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          const statusCode = Number(response.statusCode || 500);
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            parsed = raw;
          }
          if (statusCode >= 200 && statusCode < 300) {
            resolve(parsed);
            return;
          }
          reject(
            new Error(
              `Facebook Graph API error ${statusCode}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`
            )
          );
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

/** @see https://developers.facebook.com/docs/messenger-platform/identity/user-profile */
const MESSENGER_USER_PROFILE_FIELDS_FULL =
  "id,first_name,last_name,name,profile_pic,locale,timezone,gender";
const MESSENGER_USER_PROFILE_FIELDS_BASIC = "id,first_name,last_name,name,profile_pic";

function normalizeMessengerGender(value) {
  const g = String(value || "")
    .trim()
    .toLowerCase();
  if (g === "male" || g === "female") return g;
  return null;
}

/**
 * Chuẩn hoá JSON User Profile API → dùng lưu participant + gender cho bot.
 * @param {Record<string, unknown>|null|undefined} graph
 */
function normalizeMessengerUserProfile(graph) {
  if (!graph || typeof graph !== "object") return null;
  const first = String(graph.first_name || "").trim();
  const last = String(graph.last_name || "").trim();
  const name =
    String(graph.name || "")
      .trim()
      .replace(/\s+/g, " ") ||
    [first, last].filter(Boolean).join(" ").trim() ||
    null;
  const avatarUrl = String(graph.profile_pic || "").trim() || null;
  const id = graph.id != null ? String(graph.id).trim() || null : null;
  const locale = String(graph.locale || "").trim() || null;
  const tzRaw = graph.timezone;
  const timezone =
    tzRaw == null || tzRaw === ""
      ? null
      : Number.isFinite(Number(tzRaw))
        ? Number(tzRaw)
        : null;

  return {
    id,
    firstName: first || null,
    lastName: last || null,
    name,
    displayName: name,
    avatarUrl,
    gender: normalizeMessengerGender(graph.gender),
    locale,
    timezone
  };
}

async function fetchMessengerUserProfileGraph(senderId, fields, pageAccessTokenOverride) {
  const pageAccessToken =
    String(pageAccessTokenOverride || "").trim() || getFacebookConfig().pageAccessToken;
  if (!pageAccessToken || !senderId) return null;
  const path = `/${GRAPH_API_VERSION}/${encodeURIComponent(senderId)}?fields=${encodeURIComponent(
    fields
  )}&access_token=${encodeURIComponent(pageAccessToken)}`;
  const result = await sendGraphApiGet(path);
  if (!result || typeof result !== "object" || !Object.keys(result).length) {
    return null;
  }
  return result;
}

/**
 * Lấy hồ sơ Messenger (PSID + Page access token). Thử đủ trường; nếu thất bại hoặc rỗng thì thử tập tối thiểu.
 * @returns {Promise<ReturnType<typeof normalizeMessengerUserProfile>|null>}
 */
/**
 * @param {string} senderId
 * @param {string} [pageAccessTokenOverride] — PSID profile API cần đúng Page token (đa Page).
 */
async function getFacebookUserProfile(senderId, pageAccessTokenOverride) {
  const pageAccessToken =
    String(pageAccessTokenOverride || "").trim() || getFacebookConfig().pageAccessToken;
  if (!pageAccessToken || !senderId) return null;

  const attempts = [MESSENGER_USER_PROFILE_FIELDS_FULL, MESSENGER_USER_PROFILE_FIELDS_BASIC];
  for (const fields of attempts) {
    try {
      const raw = await fetchMessengerUserProfileGraph(senderId, fields, pageAccessToken);
      const normalized = normalizeMessengerUserProfile(raw);
      if (normalized && (normalized.name || normalized.avatarUrl || normalized.gender)) {
        return normalized;
      }
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

module.exports = {
  isFacebookConfigured,
  processFacebookWebhook,
  verifyFacebookWebhook,
  resolveFacebookWebhookPageId,
  getFacebookUserProfile,
  sendFacebookMessage,
  sendFacebookMediaMessage
};





