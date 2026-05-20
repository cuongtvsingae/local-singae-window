/**
 * Zalo cá nhân qua thư viện không chính thức **zca-js** (đăng nhập QR, gửi tin nhắn).
 * Session lưu tại `private/zalo-personal-credentials.json` — có thể giữ file này để copy lên server (tránh commit repo công khai).
 * Thông báo Zalo: **chỉ** khi bot tạo booking nội bộ thành công (`notifyZaloBookingRequestCreated`), không gửi khi đồng bộ Simly.
 * Cảnh báo: có thể bị khóa tài khoản — chỉ dùng khi chấp nhận rủi ro.
 * @see https://github.com/RFS-ADRENO/zca-js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const CREDENTIALS_FILE = path.join(REPO_ROOT, "private", "zalo-personal-credentials.json");
const CONFIG_FILE = path.join(REPO_ROOT, "private", "zalo-personal-config.json");

const DEFAULT_NOTIFY_UID = "9146322263245159407";

/** @type {any | null} */
let cachedApi = null;

const loginSessions = new Map();
const LOGIN_SESSION_TTL_MS = 12 * 60 * 1000;

function normalizeNotifyRecipient(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const uid = String(input || "").trim();
    return uid ? { uid, label: "" } : null;
  }
  if (typeof input !== "object") return null;
  const uid = String(input.uid || input.id || "").trim();
  if (!uid) return null;
  return {
    uid,
    label: String(input.label || input.name || "").trim()
  };
}

function normalizeNotifyRecipients(inputs) {
  const rows = Array.isArray(inputs) ? inputs : [];
  const out = [];
  const seen = new Set();
  for (const item of rows) {
    const normalized = normalizeNotifyRecipient(item);
    if (!normalized || seen.has(normalized.uid)) continue;
    seen.add(normalized.uid);
    out.push(normalized);
  }
  return out;
}

function parseNotifyRecipientsFromText(raw) {
  const lines = String(raw || "")
    .split(/\r?\n|,/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalizeNotifyRecipients(
    lines.map((line) => {
      const [uidPart, ...labelParts] = line.split("|");
      return {
        uid: String(uidPart || "").trim(),
        label: labelParts.join("|").trim()
      };
    })
  );
}

function loadConfigJson() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : null;
  } catch (_) {
    return null;
  }
}

function saveConfigJson(payload) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function getConfiguredNotifyRecipients() {
  const cfg = loadConfigJson();
  return normalizeNotifyRecipients(cfg?.notifyRecipients);
}

function getEnvNotifyRecipients() {
  const rawList = String(process.env.ZALO_PERSONAL_NOTIFY_UIDS || "").trim();
  if (rawList) return parseNotifyRecipientsFromText(rawList);
  const single = String(process.env.ZALO_PERSONAL_NOTIFY_UID || "").trim();
  if (single) return [{ uid: single, label: "" }];
  return [{ uid: DEFAULT_NOTIFY_UID, label: "default" }];
}

function getNotifyRecipients() {
  const configured = getConfiguredNotifyRecipients();
  if (configured.length) return configured;
  return getEnvNotifyRecipients();
}

function getNotifyRecipientsSource() {
  if (getConfiguredNotifyRecipients().length) return "config";
  if (String(process.env.ZALO_PERSONAL_NOTIFY_UIDS || "").trim()) return "env_list";
  if (String(process.env.ZALO_PERSONAL_NOTIFY_UID || "").trim()) return "env_single";
  return "default";
}

function saveNotifyRecipients(recipients) {
  const normalized = normalizeNotifyRecipients(recipients);
  saveConfigJson({
    notifyRecipients: normalized,
    updatedAt: new Date().toISOString()
  });
  return {
    ok: true,
    notifyRecipients: normalized,
    source: normalized.length ? "config" : getNotifyRecipientsSource()
  };
}

function getNotifyUid() {
  return String(getNotifyRecipients()?.[0]?.uid || "").trim() || DEFAULT_NOTIFY_UID;
}

function credentialsFileExists() {
  try {
    return fs.existsSync(CREDENTIALS_FILE);
  } catch (_) {
    return false;
  }
}

function loadCredentialsJson() {
  if (!credentialsFileExists()) return null;
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    if (!j.imei || !j.cookie || !j.userAgent) return null;
    return j;
  } catch (_) {
    return null;
  }
}

function saveCredentialsJson(payload) {
  fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function clearCachedApi() {
  cachedApi = null;
}

function getZaloPersonalStatus() {
  const cred = loadCredentialsJson();
  const cfg = loadConfigJson();
  const notifyRecipients = getNotifyRecipients();
  return {
    ok: true,
    module: true,
    connected: Boolean(cachedApi) || Boolean(cred),
    credentialsPath: CREDENTIALS_FILE,
    configPath: CONFIG_FILE,
    credentialsFileExists: credentialsFileExists(),
    configFileExists: Boolean(cfg),
    notifyUid: getNotifyUid(),
    notifyRecipients,
    notifyRecipientsSource: getNotifyRecipientsSource(),
    notifyRecipientsUpdatedAt: cfg?.updatedAt || null,
    accountHint: cred?.accountHint || null,
    savedAt: cred?.savedAt || null
  };
}

async function ensureApiFromDisk() {
  if (cachedApi) return cachedApi;
  const cred = loadCredentialsJson();
  if (!cred) return null;
  const { Zalo } = require("zca-js");
  const zalo = new Zalo();
  cachedApi = await zalo.login({
    imei: cred.imei,
    cookie: cred.cookie,
    userAgent: cred.userAgent,
    language: cred.language || "vi"
  });
  return cachedApi;
}

/**
 * @param {string} text
 */
async function sendZaloPersonalToNotifyRecipients(text, recipientsOverride) {
  const api = await ensureApiFromDisk();
  if (!api) {
    const err = new Error("Chưa đăng nhập Zalo cá nhân (thiếu credentials hoặc đăng nhập thất bại).");
    err.code = "ZALO_NOT_CONNECTED";
    throw err;
  }
  const { ThreadType } = require("zca-js");
  const recipients = normalizeNotifyRecipients(recipientsOverride?.length ? recipientsOverride : getNotifyRecipients());
  if (!recipients.length) {
    const err = new Error("Chưa cấu hình người nhận thông báo Zalo.");
    err.code = "ZALO_NOTIFY_RECIPIENTS_EMPTY";
    throw err;
  }
  const results = [];
  const failures = [];
  for (const recipient of recipients) {
    try {
      await api.sendMessage({ msg: String(text || "").trim() || "(empty)" }, recipient.uid, ThreadType.User);
      results.push(recipient);
    } catch (error) {
      failures.push({
        uid: recipient.uid,
        label: recipient.label || "",
        error: error?.message || String(error)
      });
    }
  }
  if (failures.length) {
    const err = new Error(
      `Gửi Zalo thất bại ${failures.length}/${recipients.length} người nhận: ${failures
        .map((item) => `${item.uid}${item.label ? ` (${item.label})` : ""}`)
        .join(", ")}`
    );
    err.code = "ZALO_NOTIFY_SEND_PARTIAL_FAILED";
    err.results = results;
    err.failures = failures;
    throw err;
  }
  return { ok: true, recipients: results, count: results.length };
}

async function sendZaloPersonalToNotifyUid(text) {
  const out = await sendZaloPersonalToNotifyRecipients(text);
  return { ok: true, uid: String(out?.recipients?.[0]?.uid || "").trim(), recipients: out.recipients, count: out.count };
}

/**
 * Gửi tin 1-1 tới user Zalo theo user id (Zalo, không phải SĐT). Dùng tổng đài cá nhân (zca-js).
 * @param {string} zaloUserId
 * @param {string} text
 */
async function sendZaloPersonalToUserByUid(zaloUserId, text) {
  const uid = String(zaloUserId || "").trim();
  if (!uid) {
    const err = new Error("Zalo user id is required");
    err.code = "ZALO_UID_EMPTY";
    throw err;
  }
  const api = await ensureApiFromDisk();
  if (!api) {
    const err = new Error("Chưa đăng nhập Zalo cá nhân (thiếu credentials hoặc đăng nhập thất bại).");
    err.code = "ZALO_NOT_CONNECTED";
    throw err;
  }
  const { ThreadType } = require("zca-js");
  await api.sendMessage({ msg: String(text || "").trim() || "(empty)" }, uid, ThreadType.User);
  return { ok: true, uid };
}

function officeLabel(key) {
  const k = String(key || "").trim().toUpperCase();
  if (k === "25VNP") return "Hà Nội (25VNP)";
  if (k === "355LTT") return "TP.HCM (355LTT)";
  return k || "—";
}

function formatPreferredVisitLine(pt) {
  const d = String(pt?.preferredVisitDate || "").trim();
  const t = String(pt?.preferredVisitTime || "").trim();
  if (!d && !t) return "";
  if (d && t) return `Hẹn (ngày/giờ khách chọn): ${d} · ${t}`;
  if (d) return `Ngày hẹn (khách chọn): ${d}`;
  return `Giờ hẹn (khách chọn): ${t}`;
}

/**
 * Tin Zalo khi bot tạo booking nội bộ thành công.
 * @param {{ booking: object, careStatus?: string }} p
 */
function formatBookingRequestCreatedMessage(p) {
  const booking = p?.booking && typeof p.booking === "object" ? p.booking : {};
  const convId = String(booking.conversationId || "").trim();
  const ch = String(booking.channel || "").trim();
  const label = String(booking.participantLabel || "").trim();
  const pt = booking.patientSnapshot && typeof booking.patientSnapshot === "object" ? booking.patientSnapshot : {};
  const a = booking.appointment && typeof booking.appointment === "object" ? booking.appointment : {};
  const shuttle = String(pt.shuttlePickup || "").toLowerCase();
  const shuttleTxt = shuttle === "yes" ? "Có" : shuttle === "no" ? "Không" : "—";
  return [
    "✅ Bot đã tạo booking nội bộ thành công",
    booking.id ? `Booking ID: ${booking.id}` : "",
    convId ? `Cuộc chat: ${convId}` : "",
    ch ? `Kênh: ${ch}` : "",
    label ? `Tên hiển thị: ${label}` : "",
    `BN: ${String(pt.fullName || "").trim() || "—"} · SĐT: ${String(pt.phone || "").trim() || "—"}`,
    `Khu vực sinh sống: ${String(pt.regionLive || "").trim() || "—"}`,
    `Cơ sở: ${officeLabel(pt.preferredOfficeKey)}`,
    `Xe đưa đón: ${shuttleTxt}`,
    formatPreferredVisitLine(pt),
    p?.careStatus ? `Care status: ${String(p.careStatus).trim()}` : "",
    "--- Chi tiết booking ---",
    `Bắt đầu: ${String(a.startAt || "").trim() || "—"}`,
    `Kết thúc: ${String(a.endAt || "").trim() || "—"}`,
    `Dịch vụ: ${String(a.serviceName || "").trim() || "—"}`,
    `Trạng thái: ${String(booking.status || a.status || "").trim() || "booked"}`,
    `Mã payload: ${String(a.id || "").trim() || "—"}`
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyZaloBookingRequestCreated(payload) {
  const text = formatBookingRequestCreatedMessage(payload);
  return sendZaloPersonalToNotifyRecipients(text);
}

function pruneLoginSessions() {
  const now = Date.now();
  for (const [id, s] of loginSessions) {
    if (now - s.createdAt > LOGIN_SESSION_TTL_MS) loginSessions.delete(id);
  }
}

function getLoginSession(sessionId) {
  pruneLoginSessions();
  const s = loginSessions.get(String(sessionId || "").trim());
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    phase: s.phase,
    image: s.image,
    scannedName: s.scannedName,
    error: s.error,
    done: s.done
  };
}

function abortLoginSession(sessionId) {
  const s = loginSessions.get(String(sessionId || "").trim());
  if (s) s.aborted = true;
}

/**
 * @returns {{ sessionId: string }}
 */
function startLoginQrSession() {
  pruneLoginSessions();
  const id = crypto.randomBytes(12).toString("hex");
  const session = {
    id,
    createdAt: Date.now(),
    status: "pending",
    phase: "pending",
    image: null,
    scannedName: null,
    error: null,
    done: false,
    aborted: false
  };
  loginSessions.set(id, session);

  (async () => {
    try {
      const mod = require("zca-js");
      const { Zalo, LoginQRCallbackEventType } = mod;
      const zalo = new Zalo();
      const api = await zalo.loginQR(
        {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
          language: "vi"
        },
        (event) => {
          if (!event || session.aborted) return;
          const t = event.type;
          if (t === LoginQRCallbackEventType.QRCodeGenerated) {
            session.status = "qr";
            session.phase = "qr";
            session.image = event.data?.image || null;
          } else if (t === LoginQRCallbackEventType.QRCodeScanned) {
            session.phase = "scanned";
            session.scannedName = event.data?.display_name || null;
          } else if (t === LoginQRCallbackEventType.QRCodeExpired) {
            session.phase = "expired";
          } else if (t === LoginQRCallbackEventType.QRCodeDeclined) {
            session.phase = "declined";
            session.error = "QR bị từ chối trên điện thoại.";
          } else if (t === LoginQRCallbackEventType.GotLoginInfo && event.data) {
            session.phase = "logging_in";
            try {
              saveCredentialsJson({
                imei: event.data.imei,
                cookie: event.data.cookie,
                userAgent: event.data.userAgent,
                language: "vi",
                accountHint: session.scannedName || null,
                savedAt: new Date().toISOString()
              });
            } catch (writeErr) {
              session.error = writeErr?.message || String(writeErr);
            }
          }
        }
      );
      if (session.aborted) {
        clearCachedApi();
        return;
      }
      cachedApi = api;
      session.done = true;
      session.status = "done";
      session.phase = "done";
    } catch (e) {
      if (!session.aborted) {
        session.error = e?.message || String(e);
        session.status = "error";
        session.phase = "error";
      }
    }
  })();

  return { sessionId: id };
}

function disconnectZaloPersonal() {
  for (const s of loginSessions.values()) {
    s.aborted = true;
  }
  loginSessions.clear();
  clearCachedApi();
  try {
    if (credentialsFileExists()) fs.unlinkSync(CREDENTIALS_FILE);
  } catch (_) {
    /* ignore */
  }
  return { ok: true };
}

module.exports = {
  getNotifyUid,
  getNotifyRecipients,
  saveNotifyRecipients,
  getZaloPersonalStatus,
  startLoginQrSession,
  getLoginSession,
  abortLoginSession,
  sendZaloPersonalToNotifyRecipients,
  sendZaloPersonalToNotifyUid,
  sendZaloPersonalToUserByUid,
  notifyZaloBookingRequestCreated,
  formatBookingRequestCreatedMessage,
  disconnectZaloPersonal,
  clearCachedApi,
  ensureApiFromDisk,
  CREDENTIALS_FILE
};
