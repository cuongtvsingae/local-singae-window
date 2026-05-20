const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");
const {
  buildFacebookMessengerParticipantId,
  parseFacebookMessengerParticipantId
} = require("./facebookMessengerParticipantId");
const { isFacebookFallbackParticipantLabel } = require("./facebookSenderProfile");
const { normalizeCollected } = require("./botStructuredOutput");
const CHAT_HISTORY_SCHEMA_VERSION = 4;
const CHAT_HISTORY_KEY = "chat-history";

const INBOX_STATUS = {
  BOT_ONLY: "bot_only",
  NEEDS_HUMAN: "needs_human",
  ASSIGNED: "assigned",
  RESOLVED: "resolved"
};

const CARE_STATUS = {
  BOT_CARE: "bot_care",
  BOOKED: "booked",
  TREATING: "treating",
  TREATMENT_DONE: "treatment_done"
};

function defaultInboxFields() {
  return {
    inboxStatus: INBOX_STATUS.BOT_ONLY,
    assignee: null,
    priority: 0,
    labels: [],
    internalNote: ""
  };
}

function normalizeConversationCareStatus(value) {
  const allowed = new Set(Object.values(CARE_STATUS));
  const s = String(value || "").trim();
  return allowed.has(s) ? s : CARE_STATUS.BOT_CARE;
}

/**
 * Thu thập từ hội thoại (SQLite / API chat-history):
 * `patient` — BN + `preferredVisitDate` / `preferredVisitTime` (tách key để bot hỏi từng bước; UI có thể gộn hiển thị);
 * `notes` — mô tả tình trạng răng + mục đích đến khám (không thay cho ngày/giờ hẹn khi đã dùng 2 key trên);
 * `appointments` — mảng lịch/draft (JSON; schema mở rộng sau).
 */
function defaultCustomerIntake() {
  return {
    schemaVersion: 1,
    patient: {
      fullName: "",
      phone: "",
      regionLive: "",
      preferredOfficeKey: "",
      shuttlePickup: "",
      preferredVisitDate: "",
      preferredVisitTime: ""
    },
    appointments: [],
    notes: "",
    updatedAt: null
  };
}

function trimVisitDate(raw) {
  const s = String(raw ?? "")
    .trim()
    .slice(0, 32);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function trimVisitTime(raw) {
  return String(raw ?? "")
    .trim()
    .slice(0, 32);
}

/**
 * Họ tên từ profile cuộc hội thoại (`participantProfile`), được merge từ metadata tin đến
 * trong `appendChatMessage` (incomingProfile: displayName, givenName + familyName, name, v.v.).
 * Server gọi trước mỗi lượt LLM để điền `patient.fullName` khi intake còn trống — mọi kênh.
 */
function deriveMessengerProfileFullName(participantProfile) {
  const p = participantProfile && typeof participantProfile === "object" ? participantProfile : {};
  const displayName = String(p.displayName || "").trim();
  if (displayName) return displayName;
  const given = String(p.givenName || "").trim();
  const family = String(p.familyName || "").trim();
  const combined = [given, family].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return String(p.name || "").trim();
}

function normalizeCustomerIntake(raw) {
  const base = defaultCustomerIntake();
  const x = raw && typeof raw === "object" ? raw : {};
  const p = x.patient && typeof x.patient === "object" ? x.patient : {};
  return {
    schemaVersion: Number(x.schemaVersion) || base.schemaVersion,
    patient: {
      fullName: String(p.fullName ?? "").trim(),
      phone: String(p.phone ?? "").trim(),
      regionLive: String(p.regionLive ?? "").trim(),
      preferredOfficeKey: (() => {
        const pok = String(p.preferredOfficeKey ?? "")
          .trim()
          .toUpperCase();
        return pok === "25VNP" || pok === "355LTT" ? pok : "";
      })(),
      shuttlePickup: (() => {
        const s = String(p.shuttlePickup ?? "")
          .trim()
          .toLowerCase();
        return s === "yes" || s === "no" ? s : "";
      })(),
      preferredVisitDate: trimVisitDate(p.preferredVisitDate),
      preferredVisitTime: trimVisitTime(p.preferredVisitTime)
    },
    notes: String(x.notes ?? "").trim(),
    appointments: Array.isArray(x.appointments)
      ? x.appointments
          .map((a) => ({
            id: String(a?.id || "").trim() || `appt-${Date.now()}`,
            externalRef: String(a?.externalRef || "").trim(),
            startAt: String(a?.startAt || "").trim(),
            endAt: String(a?.endAt || "").trim(),
            status: String(a?.status || "draft").trim(),
            serviceName: String(a?.serviceName || "").trim(),
            providerName: String(a?.providerName || "").trim(),
            locationName: String(a?.locationName || "").trim(),
            source: String(a?.source || "messenger").trim(),
            cancellationReason: String(a?.cancellationReason || "").trim(),
            cancelledAt: String(a?.cancelledAt || "").trim() || null,
            cancelledBy: String(a?.cancelledBy || "").trim() || null
          }))
          .filter((a) => a.startAt || a.externalRef || a.serviceName)
      : [],
    updatedAt: x.updatedAt != null ? String(x.updatedAt).trim() || null : null
  };
}

const COLLECTED_PATIENT_STRING_KEYS = [
  "fullName",
  "phone",
  "regionLive",
  "preferredOfficeKey",
  "shuttlePickup",
  "preferredVisitDate",
  "preferredVisitTime"
];

/**
 * Gộp một snapshot collected (bot) vào intake: chỉ ghi đè trường patient có chuỗi khác rỗng;
 * notes (tình trạng/mục đích + có thể kèm hẹn) chỉ khi khác rỗng.
 */
function mergePartialCollectedIntoIntake(storedIntake, collectedRaw) {
  const base = normalizeCustomerIntake(storedIntake);
  const collected = normalizeCollected(collectedRaw != null ? collectedRaw : {});
  const p = collected.patient || {};
  const next = {
    ...base,
    patient: { ...base.patient },
    appointments: Array.isArray(base.appointments) ? [...base.appointments] : []
  };
  for (const k of COLLECTED_PATIENT_STRING_KEYS) {
    let v = String(p[k] ?? "").trim();
    if (k === "preferredOfficeKey") {
      v = v.toUpperCase();
      if (v && v !== "25VNP" && v !== "355LTT") continue;
    }
    if (k === "shuttlePickup") {
      const low = v.toLowerCase();
      if (low !== "yes" && low !== "no") continue;
      v = low;
    }
    if (k === "preferredVisitDate") v = trimVisitDate(v);
    if (k === "preferredVisitTime") v = trimVisitTime(v);
    if (v) next.patient[k] = v;
  }
  const n = String(collected.notes ?? "").trim();
  if (n) next.notes = n;
  return normalizeCustomerIntake(next);
}

/**
 * Intake hiển thị = intake đã lưu + lần lượt áp snapshot metadata.customerIntakeCollected trên từng tin outgoing (bot).
 */
function deriveCustomerIntakeFromMessages(storedIntake, rawMessages) {
  let acc = normalizeCustomerIntake(storedIntake);
  const list = Array.isArray(rawMessages) ? [...rawMessages] : [];
  list.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
  for (const msg of list) {
    if (String(msg.direction || "").trim() !== "outgoing") continue;
    const meta = msg.metadata && typeof msg.metadata === "object" ? msg.metadata : {};
    const snap = meta.customerIntakeCollected;
    if (snap == null || typeof snap !== "object") continue;
    acc = mergePartialCollectedIntoIntake(acc, snap);
  }
  return acc;
}

function normalizeConversationInbox(conv) {
  const base = defaultInboxFields();
  if (!conv || typeof conv !== "object") return { ...base };
  const allowed = new Set(Object.values(INBOX_STATUS));
  const status = String(conv.inboxStatus || "").trim();
  return {
    inboxStatus: allowed.has(status) ? status : base.inboxStatus,
    assignee: conv.assignee != null && String(conv.assignee).trim() ? String(conv.assignee).trim() : null,
    priority: Number.isFinite(Number(conv.priority)) ? Math.max(0, Math.min(3, Number(conv.priority))) : 0,
    labels: Array.isArray(conv.labels)
      ? conv.labels.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20)
      : [],
    internalNote: conv.internalNote != null ? String(conv.internalNote) : ""
  };
}

function normalizeConversationRecord(conv) {
  const x = conv && typeof conv === "object" ? conv : {};
  return {
    ...x,
    ...normalizeConversationInbox(x),
    careStatus: normalizeConversationCareStatus(x.careStatus),
    customerIntake: normalizeCustomerIntake(x.customerIntake)
  };
}

function createEmptyChatHistory() {
  return {
    schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
    updatedAt: null,
    summary: {
      totalMessages: 0,
      totalConversations: 0,
      channels: {}
    },
    users: {},
    conversations: []
  };
}

/** Chỉ lưu metadata tin nhắn cần thiết — bỏ mọi raw/webhook/request lớn. */
const MESSAGE_METADATA_PURGED_KEYS = new Set([
  "raw",
  "rawEvent",
  "rawBody",
  "webhookBody",
  "webhook",
  "fullEvent",
  "originalEvent",
  "request",
  "response",
  "debug",
  "_debug",
  "graphql",
  "errorStack",
  "attachments",
  "profile",
  "headers",
  "cookies",
  "stack",
  "stackTrace"
]);

function sanitizeMessageMetadataForPersistence(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  for (const [key, val] of Object.entries(meta)) {
    if (MESSAGE_METADATA_PURGED_KEYS.has(key)) continue;
    out[key] = val;
  }
  if (out.media && typeof out.media === "object" && !Array.isArray(out.media)) {
    const m = out.media;
    const slim = {};
    const kind = m.kind ?? m.type;
    if (kind != null && String(kind).trim()) slim.kind = String(kind).trim();
    const url =
      typeof m.mediaUrl === "string" && m.mediaUrl.trim()
        ? m.mediaUrl.trim()
        : typeof m.url === "string" && m.url.trim()
          ? m.url.trim()
          : typeof m.publicUrl === "string" && m.publicUrl.trim()
            ? m.publicUrl.trim()
            : "";
    if (url) slim.mediaUrl = url;
    const mid = m.mediaId != null ? String(m.mediaId).trim() : "";
    if (mid) slim.mediaId = mid;
    const mime = m.mimeType != null ? String(m.mimeType).trim() : "";
    if (mime) slim.mimeType = mime;
    const fn = m.fileName != null ? String(m.fileName).trim() : "";
    if (fn) slim.fileName = fn;
    if (Object.keys(slim).length) out.media = slim;
    else delete out.media;
  }
  if (
    out.providerMessageId &&
    out.messageId &&
    String(out.providerMessageId).trim() === String(out.messageId).trim()
  ) {
    delete out.messageId;
  }
  return out;
}

function sanitizeConversationsMessageMetadata(conversations) {
  if (!Array.isArray(conversations)) return;
  for (const c of conversations) {
    const msgs = c?.messages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      if (!m || typeof m !== "object") continue;
      m.metadata = sanitizeMessageMetadataForPersistence(m.metadata);
    }
  }
}

async function loadChatHistory() {
  await importAllLegacyOnce();
  const data = await kvGetJson(CHAT_HISTORY_KEY, createEmptyChatHistory());
  if (!Array.isArray(data?.conversations)) {
    const cleared = createEmptyChatHistory();
    await saveChatHistory(cleared);
    return cleared;
  }
  const sv = Number(data?.schemaVersion || 0);
  if (sv !== 2 && sv !== 3 && sv !== 4) {
    const cleared = createEmptyChatHistory();
    await saveChatHistory(cleared);
    return cleared;
  }
  if (sv === 2 || sv === 3) {
    const inbox = defaultInboxFields();
    const conversations = data.conversations.map((c) =>
      normalizeConversationRecord({
        ...inbox,
        ...c,
        careStatus: c?.careStatus || CARE_STATUS.BOT_CARE
      })
    );
    sanitizeConversationsMessageMetadata(conversations);
    const payload = {
      schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      summary: buildSummary(conversations),
      users: data.users || {},
      conversations
    };
    await saveChatHistory(payload);
    return {
      schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
      updatedAt: payload.updatedAt,
      summary: payload.summary,
      users: payload.users,
      conversations: payload.conversations
    };
  }
  const conversations = data.conversations.map((c) => normalizeConversationRecord(c));
  sanitizeConversationsMessageMetadata(conversations);
  return {
    schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
    updatedAt: data.updatedAt || null,
    summary: data.summary || createEmptyChatHistory().summary,
    users: data.users && typeof data.users === "object" ? data.users : {},
    conversations
  };
}

function normalizePlatformFromChannel(channel) {
  const normalizedChannel = String(channel || "").trim().toLowerCase();
  if (normalizedChannel.includes("facebook") || normalizedChannel.includes("messenger")) return "facebook";
  if (normalizedChannel.includes("instagram")) return "instagram";
  return normalizedChannel || "unknown";
}

function normalizeProfile(profile, fallbackName = "") {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    name: String(p.name || fallbackName || "").trim(),
    avatarUrl: String(p.avatarUrl || "").trim() || null,
    avatarSourceUrl: String(p.avatarSourceUrl || "").trim() || null,
    avatarCachedUrl: String(p.avatarCachedUrl || "").trim() || null,
    avatar: String(p.avatar || "").trim() || null,
    bgavatar: String(p.bgavatar || "").trim() || null,
    cover: String(p.cover || "").trim() || null,
    username: String(p.username || "").trim() || null,
    displayName: String(p.displayName || "").trim() || null,
    statusText: String(p.statusText || "").trim() || null,
    globalId: String(p.globalId || "").trim() || null,
    userId: String(p.userId || "").trim() || null,
    userKey: String(p.userKey || "").trim() || null,
    accountStatus: p.accountStatus == null ? null : Number(p.accountStatus),
    isFr: p.isFr == null ? null : Number(p.isFr),
    isBlocked: p.isBlocked == null ? null : Number(p.isBlocked),
    isActive: p.isActive == null ? null : Number(p.isActive),
    isActivePC: p.isActivePC == null ? null : Number(p.isActivePC),
    isActiveWeb: p.isActiveWeb == null ? null : Number(p.isActiveWeb),
    isValid: p.isValid == null ? null : Number(p.isValid),
    user_mode: p.user_mode == null ? null : Number(p.user_mode),
    type: p.type == null ? null : Number(p.type),
    key: p.key == null ? null : Number(p.key),
    lastActionTime: p.lastActionTime == null ? null : Number(p.lastActionTime),
    lastUpdateTime: p.lastUpdateTime == null ? null : Number(p.lastUpdateTime),
    createdTs: p.createdTs == null ? null : Number(p.createdTs),
    dob: p.dob == null ? null : Number(p.dob),
    sdob: String(p.sdob || "").trim() || null,
    threadType: p.threadType == null ? null : Number(p.threadType),
    totalMember: p.totalMember == null ? null : Number(p.totalMember),
    birthDate: String(p.birthDate || p.birthday || p.dateOfBirth || "").trim() || null,
    gender: String(p.gender || "").trim().toLowerCase() || null,
    /** Meta Messenger User Profile API (khi có quyền). */
    facebookLocale: String(p.facebookLocale || "").trim() || null,
    facebookTimezone:
      p.facebookTimezone == null || p.facebookTimezone === ""
        ? null
        : Number.isFinite(Number(p.facebookTimezone))
          ? Number(p.facebookTimezone)
          : null,
    givenName: String(p.givenName || "").trim() || null,
    familyName: String(p.familyName || "").trim() || null,
    dentalStatus: String(p.dentalStatus || "").trim() || null,
    lastConsultedAt: String(p.lastConsultedAt || "").trim() || null,
    phone: String(p.phone || "").trim() || null,
    note: String(p.note || "").trim() || null
  };
}

async function ensureConversationExists({ channel, participantId, participantLabel }) {
  const normalizedChannel = String(channel || "").trim() || "unknown";
  const platform = normalizePlatformFromChannel(normalizedChannel);
  const normalizedParticipantId = String(participantId || "").trim();

  if (!normalizedParticipantId) {
    throw new Error("participantId is required.");
  }

  const data = await loadChatHistory();
  const conversationId = `${normalizedChannel}:${normalizedParticipantId}`;
  const existing = data.conversations.find((conversation) => conversation.id === conversationId);

  if (existing) {
    return existing;
  }

  const timestamp = new Date().toISOString();
  const normalizedLabel = String(participantLabel || normalizedParticipantId).trim();
  const userKey = `${platform}:${normalizedParticipantId}`;
  const user = data.users[userKey] || {
    id: userKey,
    platform,
    externalUserId: normalizedParticipantId,
    profile: normalizeProfile({}, normalizedLabel),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  data.users[userKey] = user;

  const conversation = {
    id: conversationId,
    channel: normalizedChannel,
    platform,
    userId: userKey,
    participantId: normalizedParticipantId,
    participantLabel: normalizedLabel,
    participantProfile: normalizeProfile(user.profile, normalizedLabel),
    preferredAddress: null,
    gender: null,
    mirrorProfile: null, // { userHonorific, botSelfHonorific, updatedAt } | null
    careStatus: CARE_STATUS.BOT_CARE,
    ...defaultInboxFields(),
    customerIntake: defaultCustomerIntake(),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: null,
    messages: []
  };

  data.conversations.push(conversation);
  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);

  return conversation;
}

async function saveChatHistory(data) {
  const payload = {
    schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
    updatedAt: data.updatedAt || null,
    summary: data.summary || createEmptyChatHistory().summary,
    users: data.users && typeof data.users === "object" ? data.users : {},
    conversations: Array.isArray(data.conversations) ? data.conversations : []
  };
  await kvSetJson(CHAT_HISTORY_KEY, payload);
}

function conversationAllowsBotReply(conversation) {
  if (!conversation) return true;
  /** Chỉ khi care = bot_care bot mới được trả lời tự động; inbox không chặn LLM. */
  return normalizeConversationCareStatus(conversation.careStatus) === CARE_STATUS.BOT_CARE;
}

async function updateConversationInbox(conversationId, patch = {}) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return null;
  const data = await loadChatHistory();
  const conversation = data.conversations.find((c) => c.id === normalizedConversationId);
  if (!conversation) return null;
  const timestamp = new Date().toISOString();
  const allowed = new Set(Object.values(INBOX_STATUS));
  if (patch.inboxStatus != null) {
    const s = String(patch.inboxStatus).trim();
    if (allowed.has(s)) conversation.inboxStatus = s;
  }
  if (patch.assignee !== undefined) {
    conversation.assignee = patch.assignee ? String(patch.assignee).trim() : null;
  }
  if (patch.priority !== undefined) {
    const p = Number(patch.priority);
    if (Number.isFinite(p)) conversation.priority = Math.max(0, Math.min(3, p));
  }
  if (Array.isArray(patch.labels)) {
    conversation.labels = patch.labels.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20);
  }
  if (patch.internalNote !== undefined) {
    conversation.internalNote = String(patch.internalNote || "");
  }
  Object.assign(conversation, normalizeConversationInbox(conversation));
  conversation.updatedAt = timestamp;
  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);
  return conversation;
}

async function updateConversationCareStatus(conversationId, careStatus) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return null;
  const data = await loadChatHistory();
  const conversation = data.conversations.find((c) => c.id === normalizedConversationId);
  if (!conversation) return null;
  const nextStatus = normalizeConversationCareStatus(careStatus);
  if (conversation.careStatus === nextStatus) return conversation;
  const timestamp = new Date().toISOString();
  conversation.careStatus = nextStatus;
  conversation.updatedAt = timestamp;
  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);
  return conversation;
}

async function appendSystemChatMessage({ channel, participantId, participantLabel, text, metadata }) {
  return appendChatMessage({
    channel,
    participantId,
    participantLabel,
    direction: "system",
    text,
    metadata: { ...(metadata || {}), kind: "system" }
  });
}

/**
 * Một dòng trong lịch sử chat (cùng DB messages[]) khi đổi careStatus — type riêng để UI render khác tin system thường.
 * Không gửi ra Facebook.
 */
async function appendCareStatusChangeMessage({
  channel,
  participantId,
  participantLabel,
  previousCareStatus,
  nextCareStatus,
  source = "operator",
  text
}) {
  const prev = normalizeConversationCareStatus(previousCareStatus);
  const next = normalizeConversationCareStatus(nextCareStatus);
  if (prev === next) return null;
  const displayText = String(text || "").trim();
  if (!displayText) {
    throw new Error("appendCareStatusChangeMessage: text is required.");
  }
  return appendChatMessage({
    channel,
    participantId,
    participantLabel,
    direction: "system",
    text: displayText,
    metadata: {
      kind: "system",
      messageType: "care_status_change",
      careStatusChange: {
        previousCareStatus: prev,
        nextCareStatus: next,
        source: String(source || "operator").trim()
      }
    }
  });
}

function buildSummary(conversations) {
  const summary = {
    totalMessages: 0,
    totalConversations: conversations.length,
    channels: {}
  };

  conversations.forEach((conversation) => {
    const channel = conversation.channel || "unknown";
    const channelSummary = summary.channels[channel] || {
      conversationCount: 0,
      messageCount: 0,
      lastMessageAt: null
    };

    const messageCount = Array.isArray(conversation.messages) ? conversation.messages.length : 0;

    channelSummary.conversationCount += 1;
    channelSummary.messageCount += messageCount;

    if (!channelSummary.lastMessageAt || conversation.lastMessageAt > channelSummary.lastMessageAt) {
      channelSummary.lastMessageAt = conversation.lastMessageAt || null;
    }

    summary.channels[channel] = channelSummary;
    summary.totalMessages += messageCount;
  });

  return summary;
}

async function appendChatMessage({
  channel,
  participantId,
  participantLabel,
  direction,
  text,
  createdAt,
  metadata
}) {
  const normalizedChannel = String(channel || "").trim() || "unknown";
  const platform = normalizePlatformFromChannel(normalizedChannel);
  const normalizedParticipantId = String(participantId || "").trim();
  const normalizedText = String(text || "").trim();
  const isSystem = String(direction || "").trim().toLowerCase() === "system";

  if (!normalizedParticipantId) {
    throw new Error("participantId is required.");
  }

  const hasMedia =
    Boolean(metadata?.media) ||
    (Array.isArray(metadata?.attachments) && metadata.attachments.length > 0);
  if (!normalizedText && !hasMedia && !isSystem) {
    throw new Error("text is required (or provide media in metadata).");
  }
  if (isSystem && !normalizedText) {
    throw new Error("system message requires text.");
  }

  const data = await loadChatHistory();
  const conversationId = `${normalizedChannel}:${normalizedParticipantId}`;
  const timestamp = createdAt || new Date().toISOString();
  const senderIdForLabel = String(metadata?.senderId || parseFacebookMessengerParticipantId(normalizedParticipantId).psid || "").trim();
  let conversation = data.conversations.find((item) => item.id === conversationId);
  const existingLabel = String(conversation?.participantLabel || "").trim();
  const incomingLabel = String(participantLabel || normalizedParticipantId).trim();
  const normalizedLabel = (() => {
    if (!incomingLabel) return existingLabel || normalizedParticipantId;
    if (!existingLabel) return incomingLabel;
    const incomingIsFallback = isFacebookFallbackParticipantLabel(incomingLabel, senderIdForLabel);
    const existingIsFallback = isFacebookFallbackParticipantLabel(existingLabel, senderIdForLabel);
    if (incomingIsFallback && !existingIsFallback) return existingLabel;
    if (!incomingIsFallback && existingIsFallback) return incomingLabel;
    return incomingLabel;
  })();
  const profileNameSeed = isFacebookFallbackParticipantLabel(normalizedLabel, senderIdForLabel)
    ? String(existingLabel || normalizedParticipantId).trim()
    : normalizedLabel;
  const userKey = `${platform}:${normalizedParticipantId}`;
  const incomingProfile = normalizeProfile(
    {
      name: metadata?.senderName || profileNameSeed,
      avatarUrl: metadata?.avatarUrl || null,
      username: metadata?.username || null,
      displayName: metadata?.displayName || null,
      statusText: metadata?.statusText || null,
      globalId: metadata?.globalId || null,
      userId: metadata?.userId || null,
      threadType: metadata?.threadType ?? null,
      totalMember: metadata?.totalMember ?? null,
      gender: metadata?.gender || null,
      facebookLocale: metadata?.facebookLocale || null,
      facebookTimezone: metadata?.facebookTimezone ?? null,
      givenName: metadata?.givenName || null,
      familyName: metadata?.familyName || null,
      birthDate: metadata?.birthDate || metadata?.birthday || null,
      dentalStatus: metadata?.dentalStatus || null,
      lastConsultedAt: metadata?.lastConsultedAt || null,
      phone: metadata?.phone || null,
      note: metadata?.note || null,
      ...(metadata?.profile && typeof metadata.profile === "object" ? metadata.profile : {})
    },
    normalizedLabel
  );
  const existingUser = data.users[userKey] || null;
  const nextUser = {
    id: userKey,
    platform,
    externalUserId: normalizedParticipantId,
    profile: {
      ...(existingUser?.profile || normalizeProfile({}, normalizedLabel)),
      ...Object.fromEntries(Object.entries(incomingProfile).filter(([, value]) => value != null && value !== ""))
    },
    createdAt: existingUser?.createdAt || timestamp,
    updatedAt: timestamp
  };
  data.users[userKey] = nextUser;
  if (!conversation) {
    conversation = {
      id: conversationId,
      channel: normalizedChannel,
      platform,
      userId: userKey,
      participantId: normalizedParticipantId,
      participantLabel: normalizedLabel,
      participantProfile: normalizeProfile(nextUser.profile, normalizedLabel),
      preferredAddress: null, // "co", "chu", "anh", "chi", hoáº·c null
      gender: null, // "male", "female", hoáº·c null
      mirrorProfile: null, // { userHonorific, botSelfHonorific, updatedAt } | null
      careStatus: CARE_STATUS.BOT_CARE,
      ...defaultInboxFields(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      messages: []
    };
    data.conversations.push(conversation);
  }

  conversation.platform = platform;
  conversation.userId = userKey;
  conversation.participantLabel = normalizedLabel || conversation.participantLabel || normalizedParticipantId;
  conversation.participantProfile = {
    ...(conversation.participantProfile || normalizeProfile({}, conversation.participantLabel)),
    ...nextUser.profile
  };
  conversation.gender = conversation.participantProfile?.gender || conversation.gender || null;
  conversation.careStatus = normalizeConversationCareStatus(conversation.careStatus);
  const fbPageFromMeta = String(metadata?.facebookPageId || "").trim();
  const fbPageNameFromMeta = String(metadata?.facebookPageName || "").trim();
  if (fbPageFromMeta && /facebook|messenger/i.test(normalizedChannel)) {
    conversation.facebookMessengerPageId = fbPageFromMeta;
  }
  if (fbPageNameFromMeta && /facebook|messenger/i.test(normalizedChannel)) {
    conversation.facebookMessengerPageName = fbPageNameFromMeta;
  }
  conversation.updatedAt = timestamp;
  conversation.lastMessageAt = timestamp;
  const dirNorm = isSystem ? "system" : direction === "outgoing" ? "outgoing" : "incoming";
  const roleNorm = isSystem ? "system" : dirNorm === "outgoing" ? "assistant" : "user";
  const providerMessageId =
    metadata?.providerMessageId || metadata?.messageId || metadata?.mid || null;
  conversation.messages.push({
    id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: dirNorm,
    role: roleNorm,
    text: normalizedText,
    createdAt: timestamp,
    seenAt: null, // Timestamp when message was seen
    readAt: null, // Timestamp when message was read
    providerMessageId: providerMessageId ? String(providerMessageId).trim() : null,
    metadata: sanitizeMessageMetadataForPersistence(metadata || {})
  });

  data.conversations.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);

  return data;
}

async function upsertConversationProfile(conversationId, profilePatch) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return null;
  const data = await loadChatHistory();
  const conversation = data.conversations.find((item) => item.id === normalizedConversationId);
  if (!conversation) return null;
  const timestamp = new Date().toISOString();
  const normalizedPatch = normalizeProfile(profilePatch, conversation.participantLabel || conversation.participantId || "");
  const nextProfile = {
    ...(conversation.participantProfile || normalizeProfile({}, conversation.participantLabel || "")),
    ...normalizedPatch
  };
  conversation.participantProfile = nextProfile;
  conversation.participantLabel = String(nextProfile.name || conversation.participantLabel || conversation.participantId || "").trim();
  conversation.gender = nextProfile.gender || conversation.gender || null;
  conversation.updatedAt = timestamp;

  if (conversation.userId) {
    const user = data.users[conversation.userId] || {
      id: conversation.userId,
      platform: conversation.platform || normalizePlatformFromChannel(conversation.channel),
      externalUserId: conversation.participantId,
      profile: normalizeProfile({}, conversation.participantLabel),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    user.profile = { ...(user.profile || {}), ...nextProfile };
    user.updatedAt = timestamp;
    data.users[conversation.userId] = user;
  }

  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);
  return conversation;
}

async function getConversationById(conversationId) {
  const data = await loadChatHistory();
  return data.conversations.find((conversation) => conversation.id === conversationId) || null;
}

async function clearConversationById(conversationId) {
  const normalizedConversationId = String(conversationId || "").trim();
  const data = await loadChatHistory();
  const nextConversations = data.conversations.filter((conversation) => conversation.id !== normalizedConversationId);

  const payload = {
    schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    summary: buildSummary(nextConversations),
    users: data.users || {},
    conversations: nextConversations
  };

  await saveChatHistory(payload);
  return payload;
}

async function clearChatHistory(channel) {
  const data = await loadChatHistory();
  const normalizedChannel = String(channel || "").trim();
  const nextConversations = normalizedChannel
    ? data.conversations.filter((conversation) => conversation.channel !== normalizedChannel)
    : [];

  const payload = {
    schemaVersion: CHAT_HISTORY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    summary: buildSummary(nextConversations),
    users: data.users || {},
    conversations: nextConversations
  };

  await saveChatHistory(payload);
  return payload;
}

async function updateConversationCustomerIntake(conversationId, patch = {}, opts = {}) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) return null;
  const data = await loadChatHistory();
  const conversation = data.conversations.find((c) => c.id === normalizedConversationId);
  if (!conversation) return null;
  const timestamp = new Date().toISOString();
  const current = normalizeCustomerIntake(conversation.customerIntake);
  const next = { ...current };
  const patientPartial = Boolean(opts.patientPartialMerge);
  const notesPartial = Boolean(opts.notesPartialMerge);
  if (patch.patient && typeof patch.patient === "object") {
    const pp = patch.patient;
    if (patientPartial) {
      next.patient = { ...current.patient };
      for (const k of [
        "fullName",
        "phone",
        "regionLive",
        "preferredOfficeKey",
        "shuttlePickup",
        "preferredVisitDate",
        "preferredVisitTime"
      ]) {
        if (!Object.prototype.hasOwnProperty.call(pp, k)) continue;
        let v = String(pp[k] ?? "").trim();
        if (k === "preferredOfficeKey") {
          v = v.toUpperCase();
          if (v && v !== "25VNP" && v !== "355LTT") continue;
        }
        if (k === "shuttlePickup") {
          const low = v.toLowerCase();
          if (low !== "yes" && low !== "no") continue;
          v = low;
        }
        if (k === "preferredVisitDate") v = trimVisitDate(v);
        if (k === "preferredVisitTime") v = trimVisitTime(v);
        if (!v) continue;
        next.patient[k] = v;
      }
    } else {
      next.patient = {
        fullName: String(pp.fullName ?? current.patient.fullName ?? "").trim(),
        phone: String(pp.phone ?? current.patient.phone ?? "").trim(),
        regionLive: String(pp.regionLive ?? current.patient.regionLive ?? "").trim(),
        preferredOfficeKey: String(pp.preferredOfficeKey ?? current.patient.preferredOfficeKey ?? "")
          .trim()
          .toUpperCase(),
        shuttlePickup: String(pp.shuttlePickup ?? current.patient.shuttlePickup ?? "")
          .trim()
          .toLowerCase(),
        preferredVisitDate: trimVisitDate(pp.preferredVisitDate ?? current.patient.preferredVisitDate ?? ""),
        preferredVisitTime: trimVisitTime(pp.preferredVisitTime ?? current.patient.preferredVisitTime ?? "")
      };
    }
    next.patient.fullName = String(next.patient.fullName ?? "").trim();
    next.patient.phone = String(next.patient.phone ?? "").trim();
    next.patient.regionLive = String(next.patient.regionLive ?? "").trim();
    let pok = String(next.patient.preferredOfficeKey ?? "")
      .trim()
      .toUpperCase();
    if (pok && pok !== "25VNP" && pok !== "355LTT") pok = "";
    next.patient.preferredOfficeKey = pok;
    let sh = String(next.patient.shuttlePickup ?? "")
      .trim()
      .toLowerCase();
    if (sh !== "yes" && sh !== "no") sh = "";
    next.patient.shuttlePickup = sh;
    next.patient.preferredVisitDate = trimVisitDate(next.patient.preferredVisitDate);
    next.patient.preferredVisitTime = trimVisitTime(next.patient.preferredVisitTime);
  }
  if (patch.notes !== undefined) {
    if (notesPartial) {
      const n = String(patch.notes ?? "").trim();
      if (n) next.notes = n;
    } else {
      next.notes = String(patch.notes || "");
    }
  }
  if (Array.isArray(patch.appointments)) {
    next.appointments = normalizeCustomerIntake({ appointments: patch.appointments }).appointments;
  }
  next.updatedAt = timestamp;
  conversation.customerIntake = next;
  conversation.updatedAt = timestamp;
  data.updatedAt = timestamp;
  data.summary = buildSummary(data.conversations);
  await saveChatHistory(data);
  return conversation;
}

async function updateConversationPreferredAddress(conversationId, preferredAddress) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  
  if (!conversation) {
    return null;
  }

  if (preferredAddress && !["co", "chu", "anh", "chi"].includes(preferredAddress)) {
    return null;
  }

  conversation.preferredAddress = preferredAddress || null;
  conversation.updatedAt = new Date().toISOString();
  data.updatedAt = conversation.updatedAt;
  
  await saveChatHistory(data);
  return conversation;
}

async function updateConversationGender(conversationId, gender) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  
  if (!conversation) {
    return null;
  }

  if (gender && !["male", "female"].includes(gender)) {
    return null;
  }

  conversation.gender = gender || null;
  conversation.updatedAt = new Date().toISOString();
  data.updatedAt = conversation.updatedAt;
  
  await saveChatHistory(data);
  return conversation;
}

async function updateConversationMirrorProfile(conversationId, mirrorProfile = null) {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  if (!conversation) {
    return null;
  }

  if (!mirrorProfile || typeof mirrorProfile !== "object") {
    conversation.mirrorProfile = null;
  } else {
    const userHonorific = String(mirrorProfile.userHonorific || "").trim();
    const botSelfHonorific = String(mirrorProfile.botSelfHonorific || "").trim();
    if (!userHonorific || !botSelfHonorific) {
      return null;
    }
    conversation.mirrorProfile = {
      userHonorific,
      botSelfHonorific,
      updatedAt: new Date().toISOString()
    };
  }
  conversation.updatedAt = new Date().toISOString();
  data.updatedAt = conversation.updatedAt;

  await saveChatHistory(data);
  return conversation;
}

async function markMessageAsSeen(conversationId, messageId) {
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();
  
  if (!normalizedConversationId || !normalizedMessageId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  
  if (!conversation) {
    return null;
  }

  const message = conversation.messages.find((msg) => msg.id === normalizedMessageId);
  if (!message) {
    return null;
  }

  if (message.direction === "incoming" && !message.seenAt) {
    message.seenAt = new Date().toISOString();
    conversation.updatedAt = new Date().toISOString();
    data.updatedAt = conversation.updatedAt;
    await saveChatHistory(data);
  }

  return conversation;
}

async function markMessageAsRead(conversationId, messageId) {
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();
  
  if (!normalizedConversationId || !normalizedMessageId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  
  if (!conversation) {
    return null;
  }

  const message = conversation.messages.find((msg) => msg.id === normalizedMessageId);
  if (!message) {
    return null;
  }

  if (message.direction === "incoming" && !message.readAt) {
    message.readAt = new Date().toISOString();
    if (!message.seenAt) {
      message.seenAt = message.readAt;
    }
    conversation.updatedAt = new Date().toISOString();
    data.updatedAt = conversation.updatedAt;
    await saveChatHistory(data);
  }

  return conversation;
}

async function markConversationAsRead(conversationId) {
  const normalizedConversationId = String(conversationId || "").trim();
  
  if (!normalizedConversationId) {
    return null;
  }

  const data = await loadChatHistory();
  const conversation = data.conversations.find((conv) => conv.id === normalizedConversationId);
  
  if (!conversation) {
    return null;
  }

  const now = new Date().toISOString();
  let hasChanges = false;

  conversation.messages.forEach((message) => {
    if (message.direction === "incoming" && !message.readAt) {
      message.readAt = now;
      if (!message.seenAt) {
        message.seenAt = now;
      }
      hasChanges = true;
    }
  });

  if (hasChanges) {
    conversation.updatedAt = now;
    data.updatedAt = now;
    await saveChatHistory(data);
  }

  return conversation;
}


module.exports = {
  CARE_STATUS,
  INBOX_STATUS,
  buildFacebookMessengerParticipantId,
  parseFacebookMessengerParticipantId,
  appendChatMessage,
  appendSystemChatMessage,
  appendCareStatusChangeMessage,
  clearChatHistory,
  clearConversationById,
  conversationAllowsBotReply,
  getConversationById,
  ensureConversationExists,
  loadChatHistory,
  buildSummary,
  saveChatHistory,
  upsertConversationProfile,
  updateConversationPreferredAddress,
  updateConversationMirrorProfile,
  updateConversationGender,
  updateConversationInbox,
  updateConversationCareStatus,
  updateConversationCustomerIntake,
  normalizeConversationCareStatus,
  normalizeCustomerIntake,
  defaultCustomerIntake,
  deriveCustomerIntakeFromMessages,
  deriveMessengerProfileFullName,
  mergePartialCollectedIntoIntake,
  markMessageAsSeen,
  markMessageAsRead,
  markConversationAsRead
};





