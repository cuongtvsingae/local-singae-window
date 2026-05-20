// ===== Global State =====
let conversations = [];
let selectedConversationId = null;
/** Cache nội dung cuộc trò chuyện (GET) — hiển thị tức thì khi mở lại, API chỉ đồng bộ nền */
const conversationBodyCache = new Map();
const pendingConversations = new Set(); // conversations đang chờ SINGAE trả lời
const SINGAE_CONVERSATION_ID = 'singae:singae';
const SINGAE_CONVERSATION_NAME = 'SINGAE';
const CARE_TEAM_DISPLAY_NAME = 'SINGAE Care';

let conversationContextMenuBound = false;

// ===== DOM Elements =====
const conversationList = document.getElementById('conversation-list');
let conversationSearchFilter = '';
let conversationCareFilter = '';
const lastKnownCareStatusById = {};
/** Trạng thái care đã chọn trên header nhưng chỉ PATCH sau khi gửi tin thành công (tin nhân viên đứng trước dòng audit trong timeline). */
const pendingCareStatusByConversationId = Object.create(null);
const conversationDetail = document.getElementById('conversation-detail');
const conversationEmpty = document.getElementById('conversation-empty');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const btnAttachMedia = document.getElementById('btn-attach-media');
const chatMediaInput = document.getElementById('chat-media-input');
const mediaPreviewEl = document.getElementById('media-preview');
const modalOverlay = document.getElementById('modal-overlay');
const modalConfirmBackdrop = document.getElementById('modal-confirm-backdrop');
const THEME_STORAGE_KEY = 'singae_theme';
const SINGAE_AUTH_KEY = 'singae_auth';
const SINGAE_AUTOLOGIN_PREF_KEY = 'singae_autologin_pref';
const SINGAE_AUTH_DAY_KEY = 'singae_auth_day';
const WIN_SHELL_ME_API = '/api/windowsshell/auth/me';
let singaeAuth = null;
let chatbotAppBootstrapped = false;
const conversationDrafts = {}; // Lưu draft theo conversationId
let tapReadInFlight = false;
let lastTapReadAt = 0;
let customerIntakeActiveConversationId = null;
/** Fingerprint intake lần cuối render vào sheet — để SSE/refresh chỉ cập nhật khi server đổi */
let customerIntakeSheetRenderedFingerprint = '';
let customerIntakeSheetEscHandler = null;

function buildCustomerIntakeFingerprint(customerIntake) {
  const ci = customerIntake || {};
  const patient = ci.patient && typeof ci.patient === 'object' ? ci.patient : {};
  return JSON.stringify({
    schemaVersion: Number(ci.schemaVersion) || 1,
    fullName: String(patient.fullName || '').trim(),
    phone: String(patient.phone || '').trim(),
    regionLive: String(patient.regionLive || '').trim(),
    preferredOfficeKey: String(patient.preferredOfficeKey || '').trim(),
    shuttlePickup: String(patient.shuttlePickup || '').trim(),
    preferredVisitDate: String(patient.preferredVisitDate || '').trim(),
    preferredVisitTime: String(patient.preferredVisitTime || '').trim(),
    careStatus: String(ci.careStatus || '').trim(),
    notes: String(ci.notes || '').trim(),
    legacyApptsJson: JSON.stringify(Array.isArray(ci.appointments) ? ci.appointments : [])
  });
}

/** Một dòng hiển thị (UI); DB vẫn là 2 key `preferredVisitDate` + `preferredVisitTime`. */
function formatPatientVisitPreview(dateStr, timeStr) {
  const dateRaw = String(dateStr || '').trim();
  const timeRaw = String(timeStr || '').trim();
  if (!dateRaw && !timeRaw) return '—';
  let datePart = dateRaw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const dt = new Date(`${dateRaw}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      datePart = dt.toLocaleDateString('vi-VN', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  }
  if (datePart && timeRaw) return `${datePart} · ${timeRaw}`;
  if (datePart) return datePart;
  return timeRaw;
}

function formatCareStatusLabel(status) {
  const s = String(status || '').trim();
  if (s === 'booked') return 'Bot đã đặt lịch';
  if (s === 'treating') return 'Đang điều trị';
  if (s === 'treatment_done') return 'Điều trị xong';
  return 'Bot đang care';
}

// Pending outgoing media (paste/attach) for current send action
let pendingOutgoingMedia = null; // { file, previewUrl, kind, mimeType }

const newConversationPanel = document.getElementById('new-conversation-panel');
const newConversationBackdrop = document.getElementById('new-conversation-backdrop');
const newConvNameInput = document.getElementById('new-conv-name-inline');
const newConvCreateBtn = document.getElementById('new-conv-create');
const newConvCancelBtn = document.getElementById('new-conv-cancel');
const sendBtn = document.querySelector('.send-btn');

// ===== Log System =====
// Log system đã được chuyển sang logs.html

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeCssUrl(url) {
  return String(url || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveAvatarUrlFromProfile(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const candidates = [
    source.avatarCachedUrl,
    source.avatarUrl,
    source.avatar,
    source.bgavatar
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return null;
}

function resolveConversationAvatarUrl(conversation) {
  return (
    resolveAvatarUrlFromProfile(conversation?.participantProfile || null) ||
    String(conversation?.avatarUrl || '').trim() ||
    null
  );
}

function getStoredSingaeAuth() {
  try {
    const raw = localStorage.getItem(SINGAE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = String(parsed?.username || '').trim().toLowerCase();
    const token = String(parsed?.token || '').trim();
    const role = String(parsed?.role || 'user').trim().toLowerCase();
    const autoLogin = Boolean(parsed?.autoLogin);
    const savedDay = String(parsed?.dayKey || localStorage.getItem(SINGAE_AUTH_DAY_KEY) || '').trim();
    const todayDay = getLocalDateKey();
    if (!username || !token) return null;
    if (!savedDay || savedDay !== todayDay) {
      saveStoredSingaeAuth(null);
      return null;
    }
    return { username, token, role, autoLogin };
  } catch (_) {
    return null;
  }
}

function saveStoredSingaeAuth(auth) {
  try {
    if (!auth) {
      localStorage.removeItem(SINGAE_AUTH_KEY);
      localStorage.removeItem(SINGAE_AUTH_DAY_KEY);
      return;
    }
    localStorage.setItem(SINGAE_AUTH_KEY, JSON.stringify({ ...auth, dayKey: getLocalDateKey() }));
    localStorage.setItem(SINGAE_AUTH_DAY_KEY, getLocalDateKey());
  } catch (_) {}
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSingaeAutoLoginPref() {
  try {
    return String(localStorage.getItem(SINGAE_AUTOLOGIN_PREF_KEY) || '').trim().toLowerCase() === 'true';
  } catch (_) {
    return false;
  }
}

function setSingaeAutoLoginPref(enabled) {
  try {
    localStorage.setItem(SINGAE_AUTOLOGIN_PREF_KEY, enabled ? 'true' : 'false');
  } catch (_) {}
}

function installConversationListToolbarListeners() {
  const searchEl = document.getElementById('conversation-search');
  const filterEl = document.getElementById('conversation-care-filter');
  const careStatusEl = document.getElementById('conversation-care-status');
  if (searchEl && !searchEl.dataset.bound) {
    searchEl.dataset.bound = '1';
    let t = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        conversationSearchFilter = searchEl.value || '';
        renderConversationList();
      }, 200);
    });
  }
  if (filterEl && !filterEl.dataset.bound) {
    filterEl.dataset.bound = '1';
    filterEl.addEventListener('change', () => {
      conversationCareFilter = filterEl.value || '';
      renderConversationList();
      const careF = String(conversationCareFilter || '').trim();
      if (careF && selectedConversationId) {
        const row = conversations.find((c) => c.id === selectedConversationId);
        if (!row || String(row.careStatus || 'bot_care') !== careF) {
          selectedConversationId = null;
          if (conversationDetail) conversationDetail.classList.add('hidden');
          if (conversationEmpty) conversationEmpty.classList.remove('hidden');
          updateDetailActionButtons();
        }
      }
    });
  }
  if (careStatusEl && !careStatusEl.dataset.bound) {
    careStatusEl.dataset.bound = '1';
    careStatusEl.title =
      'Trạng thái care được lưu sau khi gửi tin nhắn thành công (tin nhân viên hiển thị trước dòng “Trạng thái care” trong chat).';
    careStatusEl.addEventListener('change', () => {
      const id = selectedConversationId;
      if (!id || isSINGAEConversation(id)) return;
      const v = careStatusEl.value;
      const serverSt = String(
        lastKnownCareStatusById[id] ?? conversations.find((c) => c.id === id)?.careStatus ?? 'bot_care'
      ).trim();
      if (v === serverSt) {
        delete pendingCareStatusByConversationId[id];
      } else {
        pendingCareStatusByConversationId[id] = v;
      }
      applyComposerUiForSelection();
    });
  }
}

function syncCareStatusControlFromConversation(conversation) {
  const careStatusEl = document.getElementById('conversation-care-status');
  const careField = document.getElementById('care-status-field');
  const intakeBtn = document.getElementById('btn-customer-intake');
  const refreshProfileBtn = document.getElementById('btn-refresh-profile');
  const autoReplyBtn = document.getElementById('btn-auto-reply');
  if (!careStatusEl) return;
  if (!conversation || isSINGAEConversation(conversation.id)) {
    if (careField) careField.hidden = true;
    if (intakeBtn) intakeBtn.hidden = true;
    if (refreshProfileBtn) refreshProfileBtn.hidden = true;
    if (autoReplyBtn) autoReplyBtn.hidden = true;
    return;
  }
  if (careField) careField.hidden = false;
  if (intakeBtn) intakeBtn.hidden = false;
  const isFacebook = detectConversationChannelType(conversation.channel) === 'facebook';
  if (refreshProfileBtn) refreshProfileBtn.hidden = !isFacebook;
  if (autoReplyBtn) autoReplyBtn.hidden = !isFacebook;
  const serverSt = conversation.careStatus || 'bot_care';
  lastKnownCareStatusById[conversation.id] = serverSt;
  const pend = pendingCareStatusByConversationId[conversation.id];
  careStatusEl.value = pend !== undefined && pend !== null ? pend : serverSt;
}

/** Khóa ô soạn khi care = bot_care (bot tự trả lời); mở khi trạng thái khác để nhân viên gửi tay. */
function applyComposerUiForSelection() {
  const detailVisible = conversationDetail && !conversationDetail.classList.contains('hidden');
  const cid = selectedConversationId;
  let staffMaySend = false;
  let placeholderWhenLocked = 'Chọn một cuộc trò chuyện…';

  if (detailVisible && cid) {
    if (isSINGAEConversation(cid)) {
      staffMaySend = true;
    } else {
      const row = conversations.find((c) => c.id === cid);
      const serverSt = String((row && row.careStatus) || lastKnownCareStatusById[cid] || 'bot_care').trim();
      if (row) lastKnownCareStatusById[cid] = serverSt;
      const pend = pendingCareStatusByConversationId[cid];
      const effectiveCare =
        pend !== undefined && pend !== null ? String(pend).trim() : serverSt;
      staffMaySend = effectiveCare !== 'bot_care';
      if (!staffMaySend) {
        placeholderWhenLocked = 'Trạng thái Bot đang care — bot tự trả lời, không gửi tay từ đây…';
      }
    }
  }

  const locked = !staffMaySend;
  if (messageInput) {
    messageInput.disabled = locked;
    messageInput.placeholder = locked ? placeholderWhenLocked : 'Nhập tin nhắn…';
  }
  if (sendBtn) {
    sendBtn.disabled = locked;
    sendBtn.title = locked ? 'Đổi trạng thái care (không phải Bot đang care) để gửi tay' : 'Gửi';
  }
  if (btnAttachMedia) {
    btnAttachMedia.disabled = locked;
    btnAttachMedia.title = locked ? 'Đổi trạng thái care để đính kèm' : 'Đính ảnh / video';
  }
}

function bootstrapChatbotAppOnce() {
  if (chatbotAppBootstrapped) return;
  chatbotAppBootstrapped = true;
  installFacebookOAuthMessageHandlerOnce();
  installConversationListToolbarListeners();
  installConversationListContextMenuOnce();
  initTheme();
  connectEventStream();
  startRealtimeSync();
  loadConversations().then(async () => {
    try {
      await fetchFacebookOauthPages();
      renderConversationList();
    } catch (_) {}
    if (!selectedConversationId && conversations.length > 0) {
      selectConversation(conversations[0].id).catch((error) => {
        console.error('Failed to open first conversation:', error);
      });
    }
  });
}

async function bootstrapWithWindowsShellAuth() {
  // Single auth: WindowShell session cookie (ws_session). No chatbot-specific password.
  try {
    const res = await fetch(WIN_SHELL_ME_API, { credentials: 'include' });
    if (!res.ok) throw new Error('NOT_AUTHENTICATED');
    const payload = await res.json().catch(() => ({}));
    const user = payload?.user || null;
    if (!user?.username) throw new Error('NOT_AUTHENTICATED');
    const allowed = user.allowedToolIds;
    singaeAuth = {
      username: String(user.username || '').trim().toLowerCase(),
      token: '',
      role: String(user.role || 'member').trim().toLowerCase(),
      autoLogin: false,
      allowedToolIds: Array.isArray(allowed) ? allowed : []
    };
    try { saveStoredSingaeAuth(null); } catch (_) {}
    try { setSingaeAutoLoginPref(false); } catch (_) {}
    bootstrapChatbotAppOnce();
    updateMenuVisibility();
  } catch (_) {
    window.location.href = '/';
  }
}

// ===== Avatar System =====
function getAvatarColor(name) {
  // Generate consistent color based on name
  const colors = [
    '#4CAF50', // Green
    '#F44336', // Red
    '#2196F3', // Blue
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#00BCD4', // Cyan
    '#E91E63', // Pink
    '#795548', // Brown
    '#607D8B', // Blue Grey
    '#FF5722', // Deep Orange
  ];
  
  if (!name) return colors[0];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  if (!name) return '?';
  
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
}

function getUiRoleFromMessage(msg) {
  // Social support view:
  // - incoming = customer side
  // - outgoing = care team side (human + chatbot)
  // - system = tin vận hành / handoff (Chatwoot-style)
  if (msg?.direction === 'system' || msg?.role === 'system') return 'system';
  if (msg?.direction === 'incoming') return 'user';
  if (msg?.direction === 'outgoing') return 'assistant';

  if (msg?.role === 'assistant' || msg?.role === 'user') {
    return msg.role;
  }

  return 'user';
}

function getMessageMediaItems(msg) {
  const raw = msg?.metadata?.media;
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];

  return items
    .map((item) => {
      const kind = String(item?.kind || item?.type || '').trim().toLowerCase();
      const normalizedKind = kind === 'image' || kind === 'video' ? kind : null;
      const mediaUrl = item?.mediaUrl || item?.url || null;
      if (!normalizedKind || !mediaUrl) return null;

      return {
        kind: normalizedKind,
        mediaId: item?.mediaId || null,
        mediaUrl: String(mediaUrl),
        mimeType: item?.mimeType || item?.mime_type || null,
        fileName: item?.fileName || item?.filename || null
      };
    })
    .filter(Boolean);
}

function hasRenderableContent(msg) {
  const hasText = Boolean(String(msg?.text || '').trim());
  const hasMedia = getMessageMediaItems(msg).length > 0;
  return hasText || hasMedia;
}

function getLastMessagePreviewText(lastMessage) {
  const text = String(lastMessage?.text || '').trim();
  if (text) return text;

  const mediaItems = getMessageMediaItems(lastMessage);
  if (mediaItems.length === 0) return '';
  const first = mediaItems[0];
  return first.kind === 'image' ? '[Ảnh]' : '[Video]';
}

function getConversationDisplayName(conversationName = null) {
  if (conversationName && String(conversationName).trim()) {
    return String(conversationName).trim();
  }

  const conversation = conversations.find((item) => item.id === selectedConversationId);
  return conversation?.name || 'User';
}

function getLastCustomerMessageAt(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.direction === 'incoming' && messages[i]?.createdAt) {
      return messages[i].createdAt;
    }
  }
  return conversation?.lastCustomerMessageAt
    || conversation?.lastMessageAt
    || conversation?.updatedAt
    || conversation?.createdAt
    || null;
}

function isSINGAEConversation(conversationId) {
  return conversationId === SINGAE_CONVERSATION_ID;
}

function createSINGAEConversationFallback() {
  return {
    id: SINGAE_CONVERSATION_ID,
    channel: 'singae',
    participantId: 'singae',
    name: SINGAE_CONVERSATION_NAME,
    lastMessageText: '',
    lastMessageAt: null,
    createdAt: null,
    unreadCount: 0,
    avatarUrl: null,
    isSystem: true
  };
}

function resolveMessagePresentation(msg, conversationName = null) {
  const role = getUiRoleFromMessage(msg);
  if (role === 'system') {
    return {
      role: 'system',
      isBot: false,
      displayName: 'Hệ thống',
      avatarUrl: null,
      avatarSize: 32
    };
  }
  const activeConversation = conversations.find((item) => item.id === selectedConversationId) || null;
  const fbIncomingCustomer =
    role === 'user' &&
    msg?.direction === 'incoming' &&
    activeConversation?.channel &&
    detectConversationChannelType(activeConversation.channel) === 'facebook';
  const mdName = String(msg?.metadata?.senderName || '').trim();
  const mdAvatar = String(msg?.metadata?.avatarUrl || '').trim();

  const displayName =
    role === 'assistant'
      ? CARE_TEAM_DISPLAY_NAME
      : fbIncomingCustomer && mdName
        ? mdName
        : getConversationDisplayName(conversationName);

  const avatarUrl =
    role === 'assistant'
      ? null
      : fbIncomingCustomer && /^https?:\/\//i.test(mdAvatar)
        ? mdAvatar
        : resolveConversationAvatarUrl(activeConversation);

  return {
    role,
    isBot: role === 'assistant',
    displayName,
    avatarUrl,
    avatarSize: 32
  };
}

function createUserAvatarElement(name, avatarUrl = null, size = 48) {
  const avatar = document.createElement('div');
  avatar.className = 'conversation-avatar';
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;
  avatar.style.borderRadius = '50%';
  avatar.style.display = 'flex';
  avatar.style.alignItems = 'center';
  avatar.style.justifyContent = 'center';
  avatar.style.flexShrink = '0';
  avatar.style.fontWeight = '600';
  avatar.style.fontSize = `${size * 0.4}px`;
  avatar.style.color = '#ffffff';
  
  if (avatarUrl) {
    avatar.style.backgroundImage = `url("${escapeCssUrl(avatarUrl)}")`;
    avatar.style.backgroundSize = 'cover';
    avatar.style.backgroundPosition = 'center';
  } else if (name && name.toLowerCase() === 'singae') {
    return createSINGAEStaffSgAvatarElement(size);
  } else {
    avatar.style.backgroundColor = getAvatarColor(name);
    avatar.textContent = getInitials(name);
  }
  
  return avatar;
}

/** Avatar người hỏi (nhân viên) trong cuộc SINGAE: chữ SG + màu #F48AA1 */
function createSINGAEStaffSgAvatarElement(size = 48) {
  const avatar = document.createElement('div');
  avatar.className = 'conversation-avatar message-avatar singae-staff-avatar';
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;
  avatar.style.borderRadius = '50%';
  avatar.style.display = 'flex';
  avatar.style.alignItems = 'center';
  avatar.style.justifyContent = 'center';
  avatar.style.flexShrink = '0';
  avatar.style.position = 'relative';
  avatar.style.overflow = 'hidden';
  avatar.style.backgroundColor = '#F48AA1';
  avatar.style.color = '#ffffff';
  avatar.style.boxShadow = '0 8px 18px rgba(244, 138, 161, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.16)';
  avatar.setAttribute('aria-label', 'Nhân viên');
  const sgFontSize = Math.max(12, Math.round(size * 0.42));
  avatar.style.fontWeight = '900';
  avatar.style.fontSize = `${sgFontSize}px`;
  avatar.style.letterSpacing = '0.2px';
  avatar.textContent = 'SG';
  return avatar;
}

/** @deprecated Dùng createSINGAEStaffSgAvatarElement — bot dùng avatar SG */
function createSINGAEAvatarElement(size = 48) {
  return createSINGAEStaffSgAvatarElement(size);
}

function createAvatarElement(name, avatarUrl = null, size = 48) {
  if (String(name || '').trim().toLowerCase() === 'singae') {
    return createSINGAEStaffSgAvatarElement(size);
  }

  return createUserAvatarElement(name, avatarUrl, size);
}

// ===== Modal System =====
function showModal(title, body, actions = []) {
  console.log('showModal called with title:', title);
  if (!modalOverlay) {
    console.error('modalOverlay not found!');
    return;
  }
  
  const modalContainer = document.getElementById('modal-container-root');

  // Reset kiểu popover (nếu có từ lần trước)
  modalOverlay.classList.remove('popover-overlay');
  if (modalContainer) {
    modalContainer.classList.remove('popover-modal');
  }

  // Reset header và title về trạng thái hiển thị
  const modalTitle = document.getElementById('modal-title');
  const modalHeader = modalTitle ? modalTitle.closest('.modal-header') : null;
  if (modalTitle) {
    modalTitle.textContent = title;
    modalTitle.style.display = '';
  }
  if (modalHeader) {
    modalHeader.style.display = '';
  }
  
  document.getElementById('modal-body').innerHTML = body;
  
  const actionsContainer = document.getElementById('modal-actions');
  actionsContainer.innerHTML = '';
  
  // Hai nút không nhãn: confirm gọn (× / ✓). Có nhãn: hàng nút chữ (dropdown / form).
  const compactIconConfirm =
    actions.length === 2 &&
    !String(actions[0].label || '').trim() &&
    !String(actions[1].label || '').trim();
  if (compactIconConfirm) {
    actionsContainer.className = 'modal-actions confirm-menu-expand';
    actionsContainer.style.display = 'flex';
    actionsContainer.style.flexDirection = 'row';
    actionsContainer.style.gap = '8px';
    actionsContainer.style.padding = '4px 8px 8px';
    actionsContainer.style.borderTop = '1px solid rgba(148, 163, 184, 0.4)';
    actionsContainer.style.justifyContent = 'space-between';
    actionsContainer.style.width = '100%';
    
    // Button đầu tiên = Cancel (×)
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-menu-btn confirm-menu-btn-cancel';
    cancelBtn.innerHTML = '×';
    cancelBtn.onclick = actions[0].onClick;
    actionsContainer.appendChild(cancelBtn);
    
    // Button thứ hai = OK/Apply (✓)
    const okBtn = document.createElement('button');
    okBtn.className = 'confirm-menu-btn confirm-menu-btn-ok';
    okBtn.innerHTML = '✓';
    okBtn.onclick = actions[1].onClick;
    actionsContainer.appendChild(okBtn);
  } else {
    // Nếu không phải 2 actions, dùng style cũ
    actionsContainer.className = 'modal-actions';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = `modal-btn ${action.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
      btn.textContent = action.label;
      btn.onclick = action.onClick;
      actionsContainer.appendChild(btn);
    });
  }

  modalOverlay.classList.remove('hidden');
  // Thêm class để hỗ trợ animation hiển thị modal (được định nghĩa trong CSS)
  modalOverlay.classList.add('modal-open');
  console.log('Modal overlay classes:', modalOverlay.className);
  console.log('Modal should be visible now');
}

function hideModal() {
  // Hide backdrop
  if (modalConfirmBackdrop) {
    modalConfirmBackdrop.classList.add('hidden');
  }
  
  modalOverlay.classList.add('hidden');
  modalOverlay.classList.remove('modal-open');

  // Reset inline styles modified by profile modal (avoid breaking other modals).
  const modalBody = document.getElementById('modal-body');
  if (modalBody) {
    modalBody.style.padding = '';
    modalBody.style.overflowY = '';
  }
  const actionsContainer = document.getElementById('modal-actions');
  if (actionsContainer) {
    actionsContainer.style.display = '';
  }
  const modalTitle = document.getElementById('modal-title');
  if (modalTitle) {
    modalTitle.style.display = '';
  }
  const modalHeader = modalTitle ? modalTitle.closest('.modal-header') : null;
  if (modalHeader) {
    modalHeader.style.display = '';
  }

  // Reset container class used by telegram-copy modal.
  const modalContainer = document.getElementById('modal-container-root');
  if (modalContainer) {
    modalContainer.classList.remove('telegram-copy-container');
    modalContainer.classList.remove('popover-modal');
  }
}

function getConversationSourceLabel(conversation = {}) {
  const channelType = detectConversationChannelType(conversation.channel);
  if (channelType === 'facebook') return 'FB';
  return '';
}

function detectConversationChannelType(channel) {
  const value = String(channel || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (value.includes('facebook') || value.includes('messenger')) return 'facebook';
  return 'unknown';
}

function formatGenderLabel(gender) {
  if (gender === 'male') return 'Nam';
  if (gender === 'female') return 'Nữ';
  return '';
}

function toProfileModel(conversation) {
  const profile = conversation?.participantProfile || {};
  return {
    name: String(profile.name || conversation?.participantLabel || conversation?.participantId || '').trim(),
    avatarUrl: String(resolveAvatarUrlFromProfile(profile) || '').trim(),
    birthDate: String(profile.birthDate || '').trim(),
    gender: String(profile.gender || conversation?.gender || '').trim(),
    dentalStatus: String(profile.dentalStatus || '').trim(),
    lastConsultedAt: String(profile.lastConsultedAt || '').trim(),
    phone: String(profile.phone || '').trim(),
    note: String(profile.note || '').trim()
  };
}

function formatBirthDateLabel(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatLastSeenLabel(updatedAt) {
  if (!updatedAt) return '';
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Recently => show online
  if (diffMs >= 0 && diffMs <= 3 * 60 * 1000) {
    return 'online';
  }

  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeText = `${displayHours}:${minutes} ${ampm}`;

  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `last seen today at ${timeText}`;
  }

  // Fallback date label
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `last seen ${dd}/${mm}/${yyyy} at ${timeText}`;
}

function formatUserTestLastSeenLabel(lastMessageAt, includePrefix = true) {
  if (!lastMessageAt) return '';
  const d = new Date(lastMessageAt);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return includePrefix ? 'last seen just now' : 'just now';
  }

  if (diffMs < hourMs) {
    const mins = Math.max(1, Math.floor(diffMs / minuteMs));
    return includePrefix
      ? `last seen ${mins} minute${mins > 1 ? 's' : ''} ago`
      : `${mins} minute${mins > 1 ? 's' : ''} ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return includePrefix
      ? `last seen ${hours} hour${hours > 1 ? 's' : ''} ago`
      : `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  if (diffMs <= 2 * dayMs) {
    const days = Math.max(1, Math.floor(diffMs / dayMs));
    return includePrefix
      ? `last seen ${days} day${days > 1 ? 's' : ''} ago`
      : `${days} day${days > 1 ? 's' : ''} ago`;
  }

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return includePrefix ? `last seen ${dd}/${mm}/${yyyy}` : `${dd}/${mm}/${yyyy}`;
}

function formatMobileLabel(participantId) {
  const s = String(participantId || '').trim();
  if (!s) return '';
  // Common phone format like +849xx...
  if (/^\+\d{6,}$/.test(s)) return s;
  return '';
}

function formatUsernameLabel(participantLabel, participantId) {
  const a = String(participantLabel || '').trim();
  if (a.startsWith('@')) return a;
  const id = String(participantId || '').trim();
  if (id.startsWith('@')) return id;
  return '';
}

function hideInfoModal() {
  const infoModalOverlay = document.getElementById('info-modal-overlay');
  const infoModalContainer = document.getElementById('info-modal-container');

  if (!infoModalOverlay || !infoModalContainer) return;
  if (infoModalOverlay.classList.contains('hidden')) return;

  // Smooth close animation.
  infoModalOverlay.style.transition = 'opacity 0.22s ease';
  infoModalContainer.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
  infoModalOverlay.style.opacity = '0';
  infoModalContainer.style.opacity = '0';
  infoModalContainer.style.transform = 'translateY(8px) scale(0.97)';

  setTimeout(() => {
    infoModalOverlay.classList.add('hidden');
    infoModalOverlay.classList.remove('modal-open');
    infoModalOverlay.style.opacity = '';
    infoModalContainer.style.opacity = '';
    infoModalContainer.style.transform = '';
    infoModalContainer.style.transition = '';
    infoModalContainer.innerHTML = '';
  }, 230);
}

async function openUserInfoModal(conversationId) {
  if (!conversationId) return;

  const infoModalOverlay = document.getElementById('info-modal-overlay');
  const infoModalContainer = document.getElementById('info-modal-container');
  if (!infoModalOverlay || !infoModalContainer) return;

  if (!infoModalOverlay.dataset.boundOutsideClose) {
    infoModalOverlay.dataset.boundOutsideClose = '1';
    infoModalOverlay.addEventListener('click', (e) => {
      if (e.target === infoModalOverlay) hideInfoModal();
    });
  }

  // SINGAE profile
  if (isSINGAEConversation(conversationId)) {
    infoModalContainer.innerHTML = `
      <div class="telegram-contact-modal" data-mode="singae">
        <div class="telegram-profile-modal">
          <div class="telegram-profile-top-block">
            <div class="telegram-profile-header">
              <div class="telegram-profile-avatar" id="telegram-profile-avatar"></div>
              <div class="telegram-profile-name">${escapeHtml(SINGAE_CONVERSATION_NAME)}</div>
              <div class="telegram-profile-lastseen is-online">online</div>
            </div>
          </div>

          <div class="telegram-profile-bottom-block">
            <div class="telegram-contact-section">
              <div class="telegram-contact-section-title">Giới thiệu</div>
              <div class="telegram-contact-about">
                SINGAE là trợ lý AI giúp trả lời và hỗ trợ tư vấn nhanh theo nội dung bạn gửi trong cuộc trò chuyện này.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const mount = document.getElementById('telegram-profile-avatar');
    if (mount) mount.appendChild(createSINGAEStaffSgAvatarElement(84));

    infoModalOverlay.classList.remove('hidden');
    infoModalOverlay.classList.add('modal-open');
    infoModalOverlay.style.transition = 'opacity 0.22s ease';
    infoModalContainer.style.transition = 'opacity 0.24s ease, transform 0.24s ease';
    infoModalOverlay.style.opacity = '0';
    infoModalContainer.style.opacity = '0';
    infoModalContainer.style.transform = 'translateY(8px) scale(0.97)';
    setTimeout(() => {
      infoModalOverlay.style.opacity = '1';
      infoModalContainer.style.opacity = '1';
      infoModalContainer.style.transform = 'translateY(0) scale(1)';
    }, 10);
    return;
  }

  // Regular user profile
  let res;
  try {
    res = await apiCall('GET', `/api/chatbot/chat-history/${conversationId}`);
  } catch (err) {
    showModal('Lỗi', `<p>${escapeHtml(err.message || 'Không tải được thông tin người dùng.')}</p>`, [
      { label: 'OK', primary: true, onClick: hideModal }
    ]);
    return;
  }

  const conversation = res?.conversation;
  if (!conversation) {
    showModal('Not found', '<p>Không tìm thấy thông tin người dùng.</p>', [
      { label: 'OK', primary: true, onClick: hideModal }
    ]);
    return;
  }

  // Minimal fields per requirement
  const rawProfile = (conversation?.participantProfile && typeof conversation.participantProfile === 'object')
    ? conversation.participantProfile
    : {};
  const name = String(rawProfile?.name || conversation.participantLabel || conversation.participantId || 'User');
  const username = String(conversation.participantLabel || '').trim();
  const gender = String(rawProfile?.gender || conversation.gender || '').trim();
  const channel = String(conversation.channel || '').trim();
  const lastAction =
    getLastCustomerMessageAt(conversation) ||
    conversation.updatedAt ||
    conversation.lastMessageAt ||
    null;
  const lastActionLabel = lastAction ? new Date(lastAction).toLocaleString('vi-VN') : '';
  const avatarUrl = String(resolveAvatarUrlFromProfile(rawProfile) || '').trim();

  infoModalContainer.innerHTML = `
    <div class="telegram-contact-modal" data-mode="user">
      <div class="telegram-profile-modal">
        <div class="telegram-profile-top-block">
          <div class="telegram-profile-header">
            <div class="telegram-profile-avatar" id="telegram-profile-avatar"></div>
            <div class="telegram-profile-name">${escapeHtml(name)}</div>
            <div class="telegram-profile-lastseen">${escapeHtml(channel || '')}</div>
          </div>
        </div>

        <div class="telegram-profile-bottom-block">
          <div class="telegram-profile-info-list">
            <div class="telegram-profile-info-item">
              <div class="telegram-profile-info-value telegram-profile-id-value">${escapeHtml(conversation.participantId || '')}</div>
              <div class="telegram-profile-info-label">id</div>
            </div>
            <div class="telegram-profile-info-item">
              <div class="telegram-profile-info-value">${escapeHtml(username || '')}</div>
              <div class="telegram-profile-info-label">username</div>
            </div>
            <div class="telegram-profile-info-item">
              <div class="telegram-profile-info-value">${escapeHtml(channel || '')}</div>
              <div class="telegram-profile-info-label">channel</div>
            </div>
            <div class="telegram-profile-info-item">
              <div class="telegram-profile-info-value">${escapeHtml(gender || '')}</div>
              <div class="telegram-profile-info-label">gender</div>
            </div>
            <div class="telegram-profile-info-item">
              <div class="telegram-profile-info-value">${escapeHtml(lastActionLabel || '')}</div>
              <div class="telegram-profile-info-label">lastActionTime</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const mount = document.getElementById('telegram-profile-avatar');
  if (mount) {
    mount.appendChild(createUserAvatarElement(name, avatarUrl || null, 84));
  }

  // Edit controls removed for minimal view

  infoModalOverlay.classList.remove('hidden');
  infoModalOverlay.classList.add('modal-open');
  infoModalOverlay.style.transition = 'opacity 0.22s ease';
  infoModalContainer.style.transition = 'opacity 0.24s ease, transform 0.24s ease';
  infoModalOverlay.style.opacity = '0';
  infoModalContainer.style.opacity = '0';
  infoModalContainer.style.transform = 'translateY(8px) scale(0.97)';
  setTimeout(() => {
    infoModalOverlay.style.opacity = '1';
    infoModalContainer.style.opacity = '1';
    infoModalContainer.style.transform = 'translateY(0) scale(1)';
  }, 10);
}

async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (err) {
    // Fallback for environments without clipboard permissions.
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const ok = document.execCommand('copy'); // eslint-disable-line deprecation/deprecation
      document.body.removeChild(textarea);
      return Boolean(ok);
    } catch (e) {
      document.body.removeChild(textarea);
      return false;
    }
  }
}

function openTelegramCopyModal(text, clickEvent) {
  if (!text) return;

  const copyModalOverlay = document.getElementById('copy-modal-overlay');
  const copyModalContainer = document.getElementById('copy-modal-container');
  if (!copyModalOverlay || !copyModalContainer) return;

  const modalWidthDesired = 240;
  const modalHeight = 110;
  const leftPad = 10;
  const topPad = 10;

  const hideCopyModal = () => {
    copyModalOverlay.style.transition = 'opacity 0.2s ease';
    copyModalContainer.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    copyModalOverlay.style.opacity = '0';
    copyModalContainer.style.opacity = '0';
    copyModalContainer.style.transform = 'scale(0.95)';

    setTimeout(() => {
      copyModalOverlay.classList.add('hidden');
      copyModalOverlay.classList.remove('modal-open');
      copyModalOverlay.style.opacity = '';
      copyModalContainer.style.opacity = '';
      copyModalContainer.style.transform = '';
      copyModalContainer.style.transition = '';
      copyModalContainer.innerHTML = '';
    }, 210);
  };

  // Close when clicking outside the copy menu.
  if (!copyModalOverlay.dataset.boundOutsideClose) {
    copyModalOverlay.dataset.boundOutsideClose = '1';
    copyModalOverlay.addEventListener('click', (e) => {
      if (e.target === copyModalOverlay) hideCopyModal();
    });
  }

  // Render menu
  copyModalContainer.innerHTML = `
    <div class="telegram-copy-modal" role="menu" aria-label="Copy menu">
      <button type="button" id="telegram-copy-btn" class="telegram-copy-item telegram-copy-item-primary">
        <span class="telegram-copy-item-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </span>
        <span class="telegram-copy-item-text">Copy Text</span>
      </button>
    </div>
  `;

  const menuEl = copyModalContainer.querySelector('.telegram-copy-modal');
  const copyBtn = document.getElementById('telegram-copy-btn');

  // Copy click
  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      copyBtn.disabled = true;

      try {
        await copyTextToClipboard(text);
      } catch (err) {
        // Ignore - still hide with Telegram-like animation.
      }

      copyModalContainer.style.transition = 'opacity 0.12s ease-out, transform 0.12s ease-out';
      copyModalContainer.style.opacity = '0';
      copyModalContainer.style.transform = 'scale(0.92)';

      setTimeout(() => hideCopyModal(), 170);
    });
  }

  // Position based on right-click coordinates.
  if (clickEvent && typeof clickEvent.clientX === 'number' && typeof clickEvent.clientY === 'number') {
    const x = clickEvent.clientX;
    const y = clickEvent.clientY;

    const maxWidth = Math.max(120, Math.min(modalWidthDesired, window.innerWidth - 24));
    const maxLeft = Math.max(leftPad, window.innerWidth - maxWidth - leftPad);
    const maxTop = Math.max(topPad, window.innerHeight - modalHeight - topPad);

    const left = Math.max(leftPad, Math.min(x, maxLeft));
    const top = Math.max(topPad, Math.min(y, maxTop));

    if (menuEl) menuEl.style.width = `${maxWidth}px`;

    copyModalContainer.style.left = `${left}px`;
    copyModalContainer.style.top = `${top}px`;

    copyModalContainer.style.opacity = '0';
    copyModalContainer.style.transform = 'scale(0.92)';
    copyModalOverlay.classList.remove('hidden');
    copyModalOverlay.classList.add('modal-open');

    setTimeout(() => {
      copyModalContainer.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
      copyModalContainer.style.opacity = '1';
      copyModalContainer.style.transform = 'scale(1)';
    }, 10);
  } else {
    // Fallback: show at top-left
    copyModalContainer.style.left = `${leftPad}px`;
    copyModalContainer.style.top = `${topPad}px`;
    copyModalOverlay.classList.remove('hidden');
    copyModalOverlay.classList.add('modal-open');
  }
}

// Right click message => copy modal (Telegram-like)
if (chatMessages) {
  let lastHoveredTextEl = null;

  // Track hover on the message TEXT only.
  chatMessages.addEventListener('mouseover', (e) => {
    const textEl = e.target?.closest?.('.message-text');
    lastHoveredTextEl = textEl && chatMessages.contains(textEl) ? textEl : null;
  });

  chatMessages.addEventListener('contextmenu', (e) => {
    const clickedTextEl = e.target?.closest?.('.message-text');
    // Only copy if right-click happens on the hovered text region.
    if (!clickedTextEl || clickedTextEl !== lastHoveredTextEl) return;

    const text = clickedTextEl?.textContent?.trim();
    if (!text) return;
    e.preventDefault();
    openTelegramCopyModal(text, e);
  });
}

function showConfirm(action, onConfirm, triggerButton = null, clickEvent = null, tooltipText = null) {
  // UI mới: Chỉ 2 button xổ ra dạng menu expand, không có title
  const modalContainer = document.getElementById('modal-container-root');
  
  // Reset kiểu popover (nếu có từ lần trước)
  modalOverlay.classList.remove('popover-overlay');
  if (modalContainer) {
    modalContainer.classList.remove('popover-modal');
    modalContainer.style.left = '';
    modalContainer.style.top = '';
    modalContainer.style.right = '';
    modalContainer.style.bottom = '';
    modalContainer.style.transform = '';
  }
  
  // Ẩn title và header
  const modalTitle = document.getElementById('modal-title');
  const modalHeader = modalTitle ? modalTitle.closest('.modal-header') : null;
  if (modalTitle) {
    modalTitle.textContent = '';
    modalTitle.style.display = 'none';
  }
  if (modalHeader) {
    modalHeader.style.display = 'none';
  }
  
  // Body: thêm title "Confirm delete conversation?"
  const modalBody = document.getElementById('modal-body');
  const questionText =
    action === 'delete this conversation'
      ? 'Xóa toàn bộ dữ liệu cuộc trò chuyện này trong database (SQLite)? Không thể hoàn tác.'
      : `Confirm ${action}?`;
  modalBody.innerHTML = `<div class="confirm-title">${questionText}</div>`;
  modalBody.style.padding = '16px 16px 12px';
  modalBody.style.fontSize = '15px';
  modalBody.style.color = '#ffffff';
  modalBody.style.textAlign = 'left';
  
  // Actions: 2 button text màu trắng
  const actionsContainer = document.getElementById('modal-actions');
  actionsContainer.innerHTML = '';
  actionsContainer.className = 'modal-actions confirm-menu-expand';
  actionsContainer.style.display = 'flex';
  actionsContainer.style.flexDirection = 'row';
  actionsContainer.style.gap = '16px';
  actionsContainer.style.padding = '0 16px 16px';
  actionsContainer.style.borderTop = 'none';
  actionsContainer.style.justifyContent = 'center';
  actionsContainer.style.width = '100%';
  
  // Button Cancel - text màu trắng
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-menu-btn confirm-menu-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = hideModal;
  actionsContainer.appendChild(cancelBtn);
  
  // Button Delete/Confirm - text màu trắng
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-menu-btn confirm-menu-btn-ok';
  confirmBtn.textContent = action.includes('delete') ? 'Delete' : 'Confirm';
  confirmBtn.onclick = () => { onConfirm(); hideModal(); };
  actionsContainer.appendChild(confirmBtn);

  // Show backdrop
    // Show backdrop
  if (modalConfirmBackdrop) {
    modalConfirmBackdrop.classList.remove('hidden');
  }

  modalOverlay.classList.remove('hidden');
  modalOverlay.classList.add('modal-open');
  modalOverlay.classList.add('popover-overlay');
  
  if (modalContainer) {
    modalContainer.classList.add('popover-modal');
    
    // Tính toán vị trí từ click event - logic giống newConversation panel, ưu tiên bên trái
    if (clickEvent) {
      const x = clickEvent.clientX;
      const y = clickEvent.clientY;
      const overlayRect = modalOverlay.getBoundingClientRect();
      const modalWidth = 280; // Width của modal
      const modalHeight = 120; // Ước tính chiều cao modal
      
      // Tính toán vị trí tương đối với overlay
      const relativeX = x - overlayRect.left;
      const relativeY = y - overlayRect.top;
      
      // LUÔN đặt bên trái button
      const gap = 8; // Khoảng cách giữa button và modal
      let left = relativeX - modalWidth - gap;
      let top = relativeY - 40; // Căn giữa theo chiều dọc với button
      
      // Kiểm tra và điều chỉnh vị trí theo chiều dọc
      if (top < 10) top = 10;
      if (top + modalHeight > overlayRect.height - 10) {
        top = overlayRect.height - modalHeight - 10;
      }
      
      // Luôn dùng góc nhọn bên phải (modal ở bên trái button)
      modalContainer.setAttribute('data-caret-side', 'right');
      
      modalContainer.style.left = `${left}px`;
      modalContainer.style.top = `${top}px`;
      modalContainer.style.right = 'auto';
      modalContainer.style.bottom = 'auto';
      modalContainer.style.transform = 'scale(0.9) translateY(-6px)';
      modalContainer.style.opacity = '0';
      
      // Trigger animation giống newConversation panel
      setTimeout(() => {
        modalContainer.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
        modalContainer.style.transform = 'scale(1) translateY(0)';
        modalContainer.style.opacity = '1';
      }, 10);
      
      // Tính góc nhọn chỉ vào vị trí click
      const caretOffset = relativeY - top;
      modalContainer.style.setProperty('--caret-top', `${Math.max(12, Math.min(caretOffset, modalHeight - 12))}px`);
    } else if (triggerButton) {
      // Fallback: dùng vị trí button nếu không có click event (giống newConversation panel)
      const rect = triggerButton.getBoundingClientRect();
      const overlayRect = modalOverlay.getBoundingClientRect();
      const modalWidth = 100; // 2 button căn đều width + gap + padding
      const modalHeight = 60; // title + button + padding
      
      const buttonCenterX = rect.left + rect.width / 2 - overlayRect.left;
      const buttonCenterY = rect.top + rect.height / 2 - overlayRect.top;
      
      // Ưu tiên đặt bên trái button
      let left = buttonCenterX - modalWidth - 8;
      let top = buttonCenterY - 20;
      let caretSide = 'right';
      
      // Nếu không đủ chỗ bên trái, đặt bên phải
      if (left < 0) {
        left = buttonCenterX + 8;
        caretSide = 'left';
      }
      
      if (top < 0) top = 10;
      if (top + modalHeight > overlayRect.height) {
        top = overlayRect.height - modalHeight - 10;
      }
      
      modalContainer.setAttribute('data-caret-side', caretSide);
      modalContainer.style.left = `${left}px`;
      modalContainer.style.top = `${top}px`;
      modalContainer.style.right = 'auto';
      modalContainer.style.bottom = 'auto';
      modalContainer.style.transform = 'scale(0.9) translateY(-6px)';
      modalContainer.style.opacity = '0';
      
      // Trigger animation
      setTimeout(() => {
        modalContainer.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
        modalContainer.style.transform = 'scale(1) translateY(0)';
        modalContainer.style.opacity = '1';
      }, 10);
      
      // Tính góc nhọn chỉ vào giữa button
      const caretOffset = buttonCenterY - top;
      modalContainer.style.setProperty('--caret-top', `${Math.max(12, Math.min(caretOffset, modalHeight - 12))}px`);
    }
  }
}

// ===== API Calls =====
async function apiCall(method, endpoint, data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(endpoint, options);
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (_) {
      result = {};
    }
    
    if (response.ok) {
      return result;
    } else {
      throw new Error(result.error || result.message || `HTTP ${response.status} ${response.statusText}` || 'Request failed');
    }
  } catch (error) {
    throw error;
  }
}

async function apiUploadForm(endpoint, formData) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (_) {
      result = {};
    }

    if (response.ok) return result;
    throw new Error(result.error || result.message || `HTTP ${response.status} ${response.statusText}` || 'Upload failed');
  } catch (error) {
    throw error;
  }
}

async function sendConversationMessage(conversationId, text) {
  const cid = encodeURIComponent(String(conversationId || '').trim());
  const payload = {
    conversationId: String(conversationId || '').trim(),
    text: String(text || '')
  };
  try {
    // Prefer stable body-based endpoint
    return await apiCall('POST', '/api/chatbot/chat-history/send', payload);
  } catch (error) {
    // Fallbacks for legacy deployments
    if (String(error?.message || '').includes('HTTP 404')) {
      try {
        return await apiCall('POST', '/api/chatbot/chat-history/send', payload);
      } catch (error2) {
        if (String(error2?.message || '').includes('HTTP 404')) {
          try {
            return await apiCall('POST', `/api/chatbot/chat-history/${cid}/send`, payload);
          } catch (error3) {
            if (String(error3?.message || '').includes('HTTP 404')) {
              return apiCall('POST', `/api/chatbot/chat-history/${cid}/send`, payload);
            }
            throw error3;
          }
        }
        throw error2;
      }
    }
    throw error;
  }
}

async function sendConversationMediaMessage(conversationId, file, captionText = '') {
  if (!file) throw new Error('file is required.');
  const fd = new FormData();
  fd.append('conversationId', String(conversationId || '').trim());
  fd.append('text', String(captionText || ''));
  fd.append('media', file, file.name || 'media');

  // Stable endpoint for media uploads
  return apiUploadForm('/api/chatbot/chat-history/send-media', fd);
}

// ===== Conversation Management =====
function compareInboxConversationRows(a, b) {
  const unreadA = a.unreadCount || 0;
  const unreadB = b.unreadCount || 0;
  if (unreadA !== unreadB) return unreadB - unreadA;
  const timeA = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
  const timeB = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
  return timeB - timeA;
}

/** Nhãn Page để nhóm inbox (ưu tiên tên lưu trên cuộc hội thoại, sau đó OAuth cache). */
function resolveConversationPageSectionLabel(conv) {
  const stored = String(conv?.facebookMessengerPageName || '').trim();
  if (stored) return stored;
  const pageId = String(conv?.facebookMessengerPageId || '').trim();
  if (!pageId) return 'Messenger · chưa gắn Page';
  const fromOauth = (facebookOauthPagesCache?.pages || []).find((p) => p.pageId === pageId);
  const oauthName = String(fromOauth?.pageName || '').trim();
  if (oauthName) return oauthName;
  return `Page ${pageId}`;
}

async function loadConversations() {
  try {
    const data = await apiCall('GET', '/api/chatbot/chat-history');

    // Transform chatbot API response to match SINGAE format
    const items = (data.conversations || [])
      // Chỉ Facebook Messenger (webhook).
      .filter((conv) => {
        if (conv.id === SINGAE_CONVERSATION_ID) return false;
        const channelType = detectConversationChannelType(conv.channel);
        return channelType === 'facebook';
      })
      .map(conv => {
      // Dùng unreadCount từ backend (đã được tính sẵn)
      const unreadCount = conv.unreadCount || 0;
      
      // Lấy tin nhắn cuối cùng từ lastMessage hoặc từ messages array
      const lastMsg =
        conv.lastMessage ||
        (Array.isArray(conv.messages) && conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null);
      const lastMessageText = getLastMessagePreviewText(lastMsg);
      
      return {
        id: conv.id,
        channel: conv.channel || '',
        participantId: conv.participantId || '',
        facebookMessengerPageId: String(conv.facebookMessengerPageId || '').trim(),
        facebookMessengerPageName: String(conv.facebookMessengerPageName || '').trim(),
        name: conv.participantLabel || 'Untitled',
        lastMessageText: lastMessageText,
        lastMessageAt: conv.lastMessageAt || conv.updatedAt,
        lastCustomerMessageAt: conv.lastCustomerMessageAt || null,
        createdAt: conv.createdAt,
        unreadCount: unreadCount, // Dùng từ backend
        avatarUrl: resolveAvatarUrlFromProfile(conv.participantProfile || null),
        inboxStatus: conv.inboxStatus || 'bot_only',
        careStatus: conv.careStatus || 'bot_care',
        labels: Array.isArray(conv.labels) ? conv.labels : []
      };
      });

    items.sort(compareInboxConversationRows);

    conversations = items;
    for (const c of conversations) {
      const st = String(c.careStatus || 'bot_care').trim();
      lastKnownCareStatusById[c.id] = st;
      const pend = pendingCareStatusByConversationId[c.id];
      if (pend !== undefined && pend !== null && String(pend).trim() === st) {
        delete pendingCareStatusByConversationId[c.id];
      }
    }
    if (selectedConversationId && !conversations.some((c) => c.id === selectedConversationId)) {
      selectedConversationId = null;
    }
    renderConversationList();
    
    // Nếu không có conversation nào được chọn, hiển thị empty state
    if (!selectedConversationId) {
      conversationEmpty.classList.remove('hidden');
      conversationDetail.classList.add('hidden');
    }

    updateDetailActionButtons();
    
    // Tự động chọn conversation đầu tiên nếu chưa có conversation nào được chọn
    // (Đã bỏ tự động chọn để user tự chọn)
  } catch (error) {
    console.error(`Failed to load conversations: ${error.message}`);
  }
}

/** Cuộc có thể xóa khỏi SQLite (chuột phải → Xóa). */
function conversationSupportsContextDelete(id) {
  if (!id) return false;
  if (isSINGAEConversation(id)) return false;
  return true;
}

function closeConversationContextMenu() {
  const menu = document.getElementById('conversation-list-context-menu');
  if (!menu) return;
  menu.classList.add('hidden');
  menu.setAttribute('aria-hidden', 'true');
  menu.innerHTML = '';
  menu.style.visibility = '';
}

function positionConversationContextMenu(el, clientX, clientY) {
  el.style.position = 'fixed';
  el.style.zIndex = '12050';
  el.style.visibility = 'hidden';
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY}px`;
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) {
      left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = window.innerHeight - rect.height - pad;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = '';
  });
}

function openConversationContextMenu(conversationId, e) {
  e.preventDefault();
  const menu = document.getElementById('conversation-list-context-menu');
  if (!menu) return;
  menu.innerHTML = `
    <button type="button" class="conversation-context-menu-item conversation-context-menu-item--danger" data-action="delete" role="menuitem">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Xóa cuộc trò chuyện</span>
    </button>
  `;
  const btn = menu.querySelector('[data-action="delete"]');
  if (btn) {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeConversationContextMenu();
      wireDeleteConversationConfirm(conversationId, btn, ev);
    });
  }
  positionConversationContextMenu(menu, e.clientX, e.clientY);
}

function installConversationListContextMenuOnce() {
  if (conversationContextMenuBound || !conversationList) return;
  conversationContextMenuBound = true;
  conversationList.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.conversation-item');
    if (!item || !conversationList.contains(item)) return;
    const id = item.dataset.conversationId;
    if (!id) return;
    if (!conversationSupportsContextDelete(id)) {
      closeConversationContextMenu();
      return;
    }
    openConversationContextMenu(id, e);
  });
  document.addEventListener(
    'click',
    (e) => {
      const menu = document.getElementById('conversation-list-context-menu');
      if (!menu || menu.classList.contains('hidden')) return;
      if (menu.contains(e.target)) return;
      closeConversationContextMenu();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeConversationContextMenu();
  });
  window.addEventListener('resize', closeConversationContextMenu);
  conversationList.addEventListener('scroll', closeConversationContextMenu, true);
}

function renderConversationList() {
  conversationList.innerHTML = '';

  const q = String(conversationSearchFilter || '')
    .trim()
    .toLowerCase();
  const careF = String(conversationCareFilter || '').trim();

  let rows = conversations.slice();
  if (careF) {
    rows = rows.filter((c) => String(c.careStatus || 'bot_care') === careF);
  }
  if (q) {
    rows = rows.filter((c) => {
      const name = String(c.name || '').toLowerCase();
      const last = String(c.lastMessageText || '').toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }

  if (conversations.length === 0) {
    conversationList.innerHTML =
      '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Chưa có hội thoại</div>';
    return;
  }

  if (rows.length === 0) {
    conversationList.innerHTML =
      '<div class="conversation-list-empty">Không có hội thoại khớp bộ lọc.</div>';
    return;
  }

  const pageKey = (conv) => {
    const id = String(conv.facebookMessengerPageId || '').trim();
    return id || '__no_page__';
  };
  const byPage = new Map();
  for (const conv of rows) {
    const k = pageKey(conv);
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k).push(conv);
  }
  for (const [, list] of byPage) {
    list.sort(compareInboxConversationRows);
  }

  const pageOrder = [...byPage.keys()].sort((ka, kb) => {
    const maxIn = (pk) =>
      Math.max(
        ...(byPage.get(pk) || []).map((c) =>
          new Date(c.lastMessageAt || c.createdAt || 0).getTime()
        ),
        0
      );
    return maxIn(kb) - maxIn(ka);
  });

  let isFirstSection = true;
  for (const pk of pageOrder) {
    const list = byPage.get(pk) || [];
    const sample = list[0];
    const headingEl = document.createElement('div');
    headingEl.className = 'conversation-list-page-heading';
    headingEl.textContent = resolveConversationPageSectionLabel(sample);
    if (isFirstSection) {
      headingEl.classList.add('is-first-section');
      isFirstSection = false;
    }
    conversationList.appendChild(headingEl);

    list.forEach((conv) => {
    const item = document.createElement('div');
    const unread = conv.unreadCount || 0;
    const hasUnread = unread > 0;
    item.className = `conversation-item ${conv.id === selectedConversationId ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}`;
    item.dataset.conversationId = conv.id;
    item.onclick = () => {
      try { closeNewConversationPanel(); } catch (_) {}
      try { hideInfoModal(); } catch (_) {}
      selectConversation(conv.id);
    };

    const avatar = createAvatarElement(conv.name || 'Untitled', conv.avatarUrl, 48);

    const careBadge = `<span class="inbox-status-badge" title="Trạng thái care">${escapeHtml(formatCareStatusLabel(conv.careStatus || 'bot_care'))}</span>`;

    item.innerHTML = `
      <div class="conversation-item-avatar-wrapper"></div>
      <div class="conversation-item-content">
        <div class="conversation-item-header" style="align-items:center;">
          <div class="conversation-item-main" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="conversation-item-title">${escapeHtml(conv.name || 'Untitled')}</div>
            ${careBadge}
          </div>
        </div>
      </div>
    `;

    const avatarWrapper = item.querySelector('.conversation-item-avatar-wrapper');
    avatarWrapper.appendChild(avatar);

    conversationList.appendChild(item);
    });
  }
}

function invalidateConversationBodyCache(conversationId) {
  if (conversationId == null || conversationId === '') return;
  conversationBodyCache.delete(String(conversationId));
}

function cacheConversationBodySnapshot(conversationId, conversation) {
  if (!conversationId || !conversation) return;
  conversationBodyCache.set(String(conversationId), {
    snapshotKey: buildConversationSnapshotKey(conversation),
    conversation
  });
}

function getConversationBodyCacheEntry(conversationId) {
  return conversationBodyCache.get(String(conversationId)) || null;
}

/** Ghép DOM sau layout — tránh block một frame, cảm giác mượt hơn khi data từ API về */
function scheduleDomUpdate(callback) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

/** Skeleton tải tin nhắn kiểu Telegram (shimmer + bubble giả) */
function showTelegramStyleChatLoading() {
  const row = (incoming) => {
    if (incoming) {
      return `
      <div class="telegram-skel-row telegram-skel-incoming">
        <div class="telegram-skel-avatar telegram-skel-shimmer"></div>
        <div class="telegram-skel-col">
          <div class="telegram-skel-line telegram-skel-shimmer w-75"></div>
          <div class="telegram-skel-line telegram-skel-shimmer w-45"></div>
        </div>
      </div>`;
    }
    return `
      <div class="telegram-skel-row telegram-skel-outgoing">
        <div class="telegram-skel-col telegram-skel-col-out">
          <div class="telegram-skel-line telegram-skel-shimmer w-70"></div>
          <div class="telegram-skel-line telegram-skel-shimmer w-40"></div>
        </div>
      </div>`;
  };

  chatMessages.innerHTML = `
    <div class="telegram-chat-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Đang tải tin nhắn</span>
      ${row(true)}
      ${row(false)}
      ${row(true)}
      ${row(false)}
      ${row(true)}
    </div>
  `;
}

function scheduleBackgroundConversationListSync() {
  queueMicrotask(() => {
    loadConversations().catch(() => {
      /* đồng bộ nền, không chặn UI */
    });
  });
}

/** SINGAE: chỉ nút xóa toàn bộ tin. Chat Messenger: xóa cuộc qua chuột phải trên item trong danh sách. */
function updateDetailActionButtons() {
  const delBtn = document.getElementById('btn-delete-conversation');
  const clearBtn = document.getElementById('btn-clear-singae-messages');
  const intakeBtn = document.getElementById('btn-customer-intake');
  const refreshProfileBtn = document.getElementById('btn-refresh-profile');
  const autoReplyBtn = document.getElementById('btn-auto-reply');
  if (!delBtn || !clearBtn) return;

  if (!selectedConversationId || conversationDetail.classList.contains('hidden')) {
    delBtn.hidden = true;
    clearBtn.hidden = true;
    if (intakeBtn) intakeBtn.hidden = true;
    if (refreshProfileBtn) refreshProfileBtn.hidden = true;
    if (autoReplyBtn) autoReplyBtn.hidden = true;
    return;
  }

  if (isSINGAEConversation(selectedConversationId)) {
    delBtn.hidden = true;
    clearBtn.hidden = false;
    if (intakeBtn) intakeBtn.hidden = true;
    if (refreshProfileBtn) refreshProfileBtn.hidden = true;
    if (autoReplyBtn) autoReplyBtn.hidden = true;
  } else {
    delBtn.hidden = true;
    clearBtn.hidden = true;
    if (intakeBtn) intakeBtn.hidden = false;
    const row = conversations.find((c) => c.id === selectedConversationId);
    const isFacebook = detectConversationChannelType(row?.channel) === 'facebook';
    if (refreshProfileBtn) refreshProfileBtn.hidden = !isFacebook;
    if (autoReplyBtn) autoReplyBtn.hidden = !isFacebook;
  }
  applyComposerUiForSelection();
}

/**
 * Chọn cuộc trò chuyện: luồng click chỉ lên lịch UI (rAF); fetch chạy nền (async), cập nhật DOM qua scheduleDomUpdate.
 * Trả về Promise để code khác có thể await (vd. tạo cuộc mới).
 */
function selectConversation(id) {
  if (selectedConversationId && messageInput) {
    const draftValue = messageInput.value.trim();
    if (draftValue) {
      conversationDrafts[selectedConversationId] = draftValue;
    } else {
      delete conversationDrafts[selectedConversationId];
    }
    renderConversationList();
  }

  selectedConversationId = id;
  // Prevent accidentally sending an attachment to a different conversation
  clearPendingOutgoingMedia();
  const selectionToken = id;

  scheduleDomUpdate(() => {
    if (selectedConversationId !== selectionToken) return;

    if (isSINGAEConversation(id)) {
      document.getElementById('conversation-title').textContent = SINGAE_CONVERSATION_NAME;
      const cid = document.getElementById('conversation-id');
      if (cid) {
        cid.textContent = 'online';
        cid.classList.add('is-online');
      }
    } else {
      const row = conversations.find((c) => c.id === id);
      document.getElementById('conversation-title').textContent = row?.name || 'Chat';
      const customerLastMessageAt = getLastCustomerMessageAt(row);
      const label = formatLastSeenLabel(customerLastMessageAt);
      const cid = document.getElementById('conversation-id');
      if (cid) {
        cid.textContent = label || '';
        cid.classList.toggle('is-online', label === 'online');
      }
    }

    conversationEmpty.classList.add('hidden');
    conversationDetail.classList.remove('hidden');
    renderConversationList();

    const cached = getConversationBodyCacheEntry(id);
    if (cached?.conversation) {
      const conv = cached.conversation;
      if (isSINGAEConversation(id)) {
        renderMessages(conv.messages || [], SINGAE_CONVERSATION_NAME, { scrollToFirstUnread: false });
      } else {
        renderMessages(conv.messages || [], conv.participantLabel, { scrollToFirstUnread: Number(conv.unreadCount || 0) > 0 });
      }
      syncCareStatusControlFromConversation(conv);
    } else {
      const row = conversations.find((c) => c.id === id);
      syncCareStatusControlFromConversation(
        row ? { id, careStatus: row.careStatus, channel: row.channel } : { id }
      );
      showTelegramStyleChatLoading();
    }

    if (messageInput) {
      messageInput.value = conversationDrafts[id] || '';
      messageInput.focus();
    }

    updateDetailActionButtons();
  });

  return loadConversationInBackground(id, selectionToken);
}

async function loadConversationInBackground(id, selectionToken) {
  try {
    apiCall('POST', `/api/chatbot/chat-history/${id}/read`).catch((e) => {
      console.warn('Failed to mark as read:', e);
    });

    const data = await apiCall('GET', `/api/chatbot/chat-history/${id}`);
    if (selectedConversationId !== selectionToken) return;

    const conversation = data.conversation;
    if (!conversation) {
      throw new Error('Không tải được cuộc trò chuyện.');
    }

    const nextKey = buildConversationSnapshotKey(conversation);
    const prevEntry = getConversationBodyCacheEntry(id);

    scheduleDomUpdate(() => {
      if (selectedConversationId !== selectionToken) return;

      const existingIndex = conversations.findIndex((c) => c.id === id);
      const conversationDisplayName =
        conversation.participantLabel || conversations[existingIndex]?.name || 'Untitled';

      if (existingIndex >= 0) {
        conversations[existingIndex] = {
          ...conversations[existingIndex],
          name: conversationDisplayName,
          channel: conversation.channel || conversations[existingIndex].channel,
          lastMessageText: conversation.lastMessage?.text || '',
          lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
          lastCustomerMessageAt: conversation.lastCustomerMessageAt || null,
          unreadCount: Number(conversation.unreadCount || 0),
          avatarUrl: resolveConversationAvatarUrl(conversation) || conversations[existingIndex]?.avatarUrl || null,
          inboxStatus: conversation.inboxStatus || conversations[existingIndex].inboxStatus || 'bot_only',
          careStatus: conversation.careStatus || conversations[existingIndex].careStatus || 'bot_care',
          labels: Array.isArray(conversation.labels) ? conversation.labels : conversations[existingIndex].labels || []
        };
      } else {
        conversations.push({
          id,
          channel: conversation.channel || '',
          name: conversationDisplayName,
          lastMessageText: conversation.lastMessage?.text || '',
          lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
          lastCustomerMessageAt: conversation.lastCustomerMessageAt || null,
          createdAt: conversation.createdAt,
          unreadCount: Number(conversation.unreadCount || 0),
          avatarUrl: resolveConversationAvatarUrl(conversation),
          inboxStatus: conversation.inboxStatus || 'bot_only',
          careStatus: conversation.careStatus || 'bot_care',
          labels: Array.isArray(conversation.labels) ? conversation.labels : []
        });
      }

      document.getElementById('conversation-title').textContent = conversationDisplayName;
      const customerLastMessageAt = getLastCustomerMessageAt(conversation);
      const label = formatLastSeenLabel(customerLastMessageAt);
      const cid = document.getElementById('conversation-id');
      if (cid) {
        cid.textContent = label || '';
        cid.classList.toggle('is-online', label === 'online');
      }

      if (!prevEntry || prevEntry.snapshotKey !== nextKey) {
        renderMessages(conversation.messages || [], conversation.participantLabel, {
          scrollToFirstUnread: Number(conversation.unreadCount || 0) > 0
        });
      }
      syncCareStatusControlFromConversation(conversation);
      selectedConversationSnapshotKey = nextKey;
      cacheConversationBodySnapshot(id, conversation);
      renderConversationList();

      if (messageInput) {
        messageInput.value = conversationDrafts[id] || '';
        messageInput.focus();
      }
      updateDetailActionButtons();
    });

    scheduleBackgroundConversationListSync();
  } catch (error) {
    console.error(`Failed to load conversation: ${error.message}`);
    scheduleDomUpdate(() => {
      if (selectedConversationId !== selectionToken) return;
      chatMessages.innerHTML = `<div class="chat-messages-loading chat-messages-loading-error" role="alert">${escapeHtml(
        error.message || 'Không tải được cuộc trò chuyện.'
      )}</div>`;
      updateDetailActionButtons();
    });
  }
}

function renderMessages(messages, conversationName = null, options = {}) {
  chatMessages.innerHTML = '';
  
  const transformedMessages = (messages || []).map(msg => ({
    id: msg.id,
    role: getUiRoleFromMessage(msg),
    direction: msg.direction,
    text: msg.text,
    metadata: msg.metadata || {},
    timestamp: msg.createdAt,
    seenAt: msg.seenAt,
    readAt: msg.readAt
  }));

  const shouldScrollToUnread = options?.scrollToFirstUnread === true;
  const firstUnreadIndex = transformedMessages.findIndex(
    (msg) => msg?.direction === 'incoming' && !msg?.readAt && hasRenderableContent(msg)
  );
  let unreadMarkerEl = null;
  let prevDateKey = '';
  let prevRole = null;
  transformedMessages.forEach((msg, idx) => {
    if (!hasRenderableContent(msg)) return;

    if (msg.role === 'system') {
      const isCareStatusMessage =
        msg.metadata?.messageType === 'care_status_change' ||
        (msg.metadata?.careStatusChange &&
          (msg.metadata.careStatusChange.previousCareStatus != null ||
            msg.metadata.careStatusChange.nextCareStatus != null));
      const sys = document.createElement('div');
      sys.className = isCareStatusMessage
        ? 'message message-system message-care-status-change'
        : 'message message-system';
      const inner = document.createElement('div');
      inner.className = isCareStatusMessage
        ? 'message-care-status-inner'
        : 'message-system-inner';
      if (isCareStatusMessage) {
        const label = document.createElement('div');
        label.className = 'message-care-status-label';
        label.textContent = 'Trạng thái care';
        inner.appendChild(label);
      }
      const span = document.createElement('span');
      span.className = isCareStatusMessage ? 'message-care-status-text' : 'message-system-text';
      span.textContent = String(msg.text || '').trim();
      inner.appendChild(span);
      sys.appendChild(inner);
      chatMessages.appendChild(sys);
      prevRole = 'system';
      return;
    }

    const msgDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const msgDateKey = getDateKey(msgDate);

    if (msgDateKey && msgDateKey !== prevDateKey) {
      const dateSeparator = document.createElement('div');
      dateSeparator.className = 'chat-date-separator';
      dateSeparator.innerHTML = `<span>${escapeHtml(formatChatDateLabel(msgDate))}</span>`;
      chatMessages.appendChild(dateSeparator);
      prevDateKey = msgDateKey;
    }

    if (idx === firstUnreadIndex) {
      const unreadSeparator = document.createElement('div');
      unreadSeparator.className = 'chat-unread-separator';
      unreadSeparator.innerHTML = '<span>Tin chưa đọc</span>';
      chatMessages.appendChild(unreadSeparator);
      unreadMarkerEl = unreadSeparator;
    }
    
    const presentation = resolveMessagePresentation(msg, conversationName);
    const messageDiv = document.createElement('div');
    const currentRoleClass = presentation.role === 'assistant' ? 'bot' : 'user';
    const isGrouped = prevRole != null && currentRoleClass === prevRole;
    messageDiv.className = `message ${currentRoleClass}${isGrouped ? ' is-grouped' : ''}`;
    const inSINGAEChat = isSINGAEConversation(selectedConversationId);
    const avatar = presentation.isBot
      ? createSINGAEStaffSgAvatarElement(presentation.avatarSize)
      : inSINGAEChat
        ? createSINGAEStaffSgAvatarElement(presentation.avatarSize)
        : createUserAvatarElement(presentation.displayName, presentation.avatarUrl, presentation.avatarSize);
    avatar.classList.add('message-avatar');

    // Tap avatar => show user details modal (Telegram-like)
    // New rule: disable tapping avatar in SINGAE chat.
    const shouldOpenProfile = !isSINGAEConversation(selectedConversationId) && msg.role === 'user';
    if (shouldOpenProfile) {
      avatar.classList.add('avatar-profile-clickable');
      avatar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openUserInfoModal(selectedConversationId).catch((err) => {
          console.error('Failed to open user info modal:', err);
        });
      });
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';

    const mediaItems = getMessageMediaItems(msg);
    if (mediaItems.length > 0) {
      const mediaDiv = document.createElement('div');
      mediaDiv.className = 'message-media';

      mediaItems.slice(0, 4).forEach((m) => {
        if (m.kind === 'image') {
          const img = document.createElement('img');
          img.className = 'message-media-image';
          img.src = m.mediaUrl;
          img.alt = m.fileName || 'image';
          mediaDiv.appendChild(img);
        } else if (m.kind === 'video') {
          const video = document.createElement('video');
          video.className = 'message-media-video';
          video.src = m.mediaUrl;
          video.controls = true;
          video.playsInline = true;
          mediaDiv.appendChild(video);
        }
      });

      content.appendChild(mediaDiv);
    }

    if (String(msg?.text || '').trim()) {
      const textDiv = document.createElement('div');
      textDiv.className = 'message-text';
      textDiv.textContent = msg.text;
      content.appendChild(textDiv);
    }
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const hours = msgDate.getHours();
    const minutes = msgDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const timeText = document.createTextNode(`${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`);
    timeDiv.appendChild(timeText);
    
    if (!presentation.isBot) {
      const statusDiv = document.createElement('div');
      statusDiv.className = 'message-status';
      if (msg.readAt) {
        statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="currentColor"/></svg>';
        statusDiv.title = 'Read';
      } else if (msg.seenAt) {
        statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="currentColor" opacity="0.5"/></svg>';
        statusDiv.title = 'Seen';
      } else {
        statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51z" fill="currentColor" opacity="0.3"/></svg>';
        statusDiv.title = 'Sent';
      }
      timeDiv.appendChild(statusDiv);
    }

    content.appendChild(timeDiv);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    prevRole = currentRoleClass;
  });
  
  // Không tự thêm typing sau khi render; typing chỉ xuất hiện theo SSE inbound
  if (shouldScrollToUnread && unreadMarkerEl) {
    const markerTop = unreadMarkerEl.offsetTop;
    const target = Math.max(0, markerTop - Math.floor(chatMessages.clientHeight * 0.28));
    chatMessages.scrollTop = target;
  } else {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function addTypingBubbleForConversation(conversationId) {
  // Chỉ render typing cho cuộc hội thoại đang được xem
  if (conversationId !== selectedConversationId) return;

  // Xoá typing cũ nếu có
  chatMessages.querySelectorAll('.pending-typing').forEach(el => el.remove());

  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot pending-typing';
  
  // Tạo avatar cho typing indicator
  const avatar = createSINGAEStaffSgAvatarElement(32);
  avatar.classList.add('message-avatar');
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  
  typingDiv.appendChild(avatar);
  typingDiv.appendChild(content);
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/** Một bubble typing (bot) — tránh đôi bubble khi gửi tin (web / mô phỏng khách). */
function showBotTypingIndicator(conversationId) {
  if (conversationId !== selectedConversationId) return;
  chatMessages.querySelectorAll('.pending-typing').forEach((el) => el.remove());
  const botTyping = document.createElement('div');
  botTyping.className = 'message bot pending-typing pending-typing-bot';
  const botAvatar = createSINGAEStaffSgAvatarElement(32);
  botAvatar.classList.add('message-avatar');
  const botContent = document.createElement('div');
  botContent.className = 'message-content';
  botContent.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  botTyping.appendChild(botAvatar);
  botTyping.appendChild(botContent);
  chatMessages.appendChild(botTyping);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function inferMediaKindFromMimeType(mimeType) {
  const mt = String(mimeType || '').trim().toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  return null;
}

function clearPendingOutgoingMedia() {
  if (pendingOutgoingMedia?.previewUrl) {
    try {
      URL.revokeObjectURL(pendingOutgoingMedia.previewUrl);
    } catch (_) {}
  }
  pendingOutgoingMedia = null;
  if (mediaPreviewEl) {
    mediaPreviewEl.innerHTML = '';
    mediaPreviewEl.hidden = true;
  }
}

function setPendingOutgoingMedia(file) {
  if (!file) return;
  const kind = inferMediaKindFromMimeType(file.type);
  if (!kind) {
    console.warn('Unsupported media format:', file.type);
    return;
  }

  // Replace previous preview (if any)
  clearPendingOutgoingMedia();

  const previewUrl = URL.createObjectURL(file);
  pendingOutgoingMedia = {
    file,
    previewUrl,
    kind,
    mimeType: file.type || null
  };

  if (mediaPreviewEl) {
    mediaPreviewEl.hidden = false;
    const thumbHtml =
      kind === 'image'
        ? `<img src="${previewUrl}" alt="attachment" />`
        : `<video src="${previewUrl}" controls playsinline></video>`;

    mediaPreviewEl.innerHTML = `
      <div class="chat-media-preview-thumb">
        <button type="button" class="chat-media-preview-remove" aria-label="Remove attachment">×</button>
        ${thumbHtml}
      </div>
    `;
    const removeBtn = mediaPreviewEl.querySelector('.chat-media-preview-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearPendingOutgoingMedia();
        messageInput?.focus?.();
      });
    }
  }
}

function autoSubmitIfOnlyMediaPastedOrSelected() {
  // Telegram thường gửi ngay khi chỉ paste/attach media và không có caption
  const captionText = messageInput ? messageInput.value.trim() : '';
  if (captionText) return;
  if (!selectedConversationId) return;
  if (!pendingOutgoingMedia?.file) return;

  setTimeout(() => {
    try {
      if (chatForm && typeof chatForm.requestSubmit === 'function') {
        chatForm.requestSubmit();
      } else if (chatForm) {
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    } catch (_) {}
  }, 0);
}

// ===== Media Upload (paste / attach) =====
if (btnAttachMedia) {
  btnAttachMedia.addEventListener('click', () => chatMediaInput?.click?.());
}

if (chatMediaInput) {
  chatMediaInput.addEventListener('change', () => {
    const file = chatMediaInput.files && chatMediaInput.files[0] ? chatMediaInput.files[0] : null;
    // Allow selecting the same file again
    try {
      chatMediaInput.value = '';
    } catch (_) {}
    if (!file) return;
    setPendingOutgoingMedia(file);
    autoSubmitIfOnlyMediaPastedOrSelected();
  });
}

if (chatForm) {
  chatForm.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  chatForm.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || null;
    if (!file) return;
    setPendingOutgoingMedia(file);
    autoSubmitIfOnlyMediaPastedOrSelected();
  });
}

if (messageInput) {
  messageInput.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt?.items?.length) return;

    let fileToSend = null;
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (!file) continue;
      const kind = inferMediaKindFromMimeType(file.type);
      if (!kind) continue;
      fileToSend = file;
      break;
    }

    if (!fileToSend) return;
    e.preventDefault();
    setPendingOutgoingMedia(fileToSend);
    autoSubmitIfOnlyMediaPastedOrSelected();
  });
}

// ===== Chat =====
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!selectedConversationId) {
    showModal('No Conversation', '<p>Please select or create a conversation first.</p>', [
      { label: 'OK', onClick: hideModal }
    ]);
    return;
  }
  // Nếu cuộc hội thoại này đang chờ SINGAE trả lời, không cho gửi thêm
  if (pendingConversations.has(selectedConversationId)) {
    // Conversation is waiting for SINGAE response
    return;
  }
  
  const captionText = messageInput ? messageInput.value.trim() : '';
  const mediaFile = pendingOutgoingMedia?.file || null;
  if (!captionText && !mediaFile) return;

  invalidateConversationBodyCache(selectedConversationId);

  messageInput.value = '';
  // Xóa draft của cuộc hội thoại hiện tại vì đã gửi
  if (selectedConversationId) {
    delete conversationDrafts[selectedConversationId];
    saveDrafts(); // Lưu vào localStorage
    // Cập nhật conversation list để xóa "Draft:" text
    renderConversationList();
  }
  if (messageInput) {
    messageInput.focus();
  }
  
  // Lưu conversationId hiện tại để tránh race condition
  const currentConversationId = selectedConversationId;
  pendingConversations.add(currentConversationId);

  try {
    if (mediaFile) {
      await sendConversationMediaMessage(currentConversationId, mediaFile, captionText);
    } else {
      await sendConversationMessage(currentConversationId, captionText);
    }

    const pendCare = pendingCareStatusByConversationId[currentConversationId];
    if (pendCare !== undefined && pendCare !== null) {
      const serverSt = String(
        conversations.find((c) => c.id === currentConversationId)?.careStatus ||
          lastKnownCareStatusById[currentConversationId] ||
          'bot_care'
      ).trim();
      const nextCare = String(pendCare).trim();
      if (nextCare === serverSt) {
        delete pendingCareStatusByConversationId[currentConversationId];
      } else {
        try {
          await apiCall('PATCH', `/api/chatbot/chat-history/${encodeURIComponent(currentConversationId)}/care-status`, {
            careStatus: nextCare
          });
          lastKnownCareStatusById[currentConversationId] = nextCare;
          const toolbarFilter = document.getElementById('conversation-care-filter');
          if (toolbarFilter) toolbarFilter.value = nextCare;
          conversationCareFilter = nextCare;
          delete pendingCareStatusByConversationId[currentConversationId];
          const careStatusEl = document.getElementById('conversation-care-status');
          if (careStatusEl && selectedConversationId === currentConversationId) {
            careStatusEl.value = nextCare;
          }
          invalidateConversationBodyCache(currentConversationId);
        } catch (careErr) {
          console.error(careErr);
          alert(careErr?.message || 'Đã gửi tin nhưng không cập nhật được trạng thái care.');
        }
      }
    }

    // Double check: đảm bảo vẫn đang xem conversation này
    if (currentConversationId !== selectedConversationId) {
      // User đã chuyển sang conversation khác, không render message vào đây
      pendingConversations.delete(currentConversationId);
      return;
    }

    // Single source of truth: always re-render from backend conversation snapshot
    const latest = await apiCall('GET', `/api/chatbot/chat-history/${encodeURIComponent(currentConversationId)}`);
    const conversation = latest?.conversation || null;
    if (conversation) {
      renderMessages(conversation.messages || [], conversation.participantLabel);
      cacheConversationBodySnapshot(currentConversationId, conversation);
      selectedConversationSnapshotKey = buildConversationSnapshotKey(conversation);
    }

    if (mediaFile) {
      clearPendingOutgoingMedia();
    }

    pendingConversations.delete(currentConversationId);
    await loadConversations();
    markRealtimeDirty();
    scheduleRealtimeRefresh(80);
  } catch (error) {
    // Double check: chỉ xử lý error nếu vẫn đang xem conversation này
    if (currentConversationId !== selectedConversationId) {
      pendingConversations.delete(currentConversationId);
      return;
    }

    pendingConversations.delete(currentConversationId);
    console.error(`Send message error: ${error.message}`);
    const errorMsg = { role: 'assistant', text: `⚠️ Không thể gửi tin nhắn: ${error.message}`, timestamp: new Date().toISOString() };
    appendMessageToChatWithDateLabel(errorMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Luôn đảm bảo ô nhập lại được focus để user gửi tiếp nếu muốn
    if (messageInput) {
      if (captionText) messageInput.value = captionText;
      messageInput.focus();
    }

    // Khôi phục draft/caption nếu đã thất bại
    if (captionText && selectedConversationId) {
      conversationDrafts[selectedConversationId] = captionText;
      saveDrafts();
      renderConversationList();
    }
  }
});

// Enter to send, Shift+Enter for newline
if (messageInput) {
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // allow newline
        return;
      }
      e.preventDefault();
      if (chatForm && typeof chatForm.requestSubmit === 'function') {
        chatForm.requestSubmit();
      } else {
        chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    }
  });
}
function scrollChatToBottom() {
  if (!chatMessages) return;

  const doScroll = () => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  // Scroll ngay lập tức
  doScroll();
  // Scroll lại sau khi layout/animation cập nhật
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(doScroll);
  }
  setTimeout(doScroll, 50);
}

function createMessageElement(msg, options = {}) {
  const presentation = resolveMessagePresentation(msg);
  const uiRole = presentation.role;
  const div = document.createElement('div');
  div.className = `message ${uiRole === 'assistant' ? 'bot' : 'user'}`;
  if (options.extraMessageClass) {
    div.classList.add(String(options.extraMessageClass).trim());
  }
  div.dataset.timestamp = msg.timestamp ? String(msg.timestamp) : new Date().toISOString();
  
  const inSINGAEChat = isSINGAEConversation(selectedConversationId);
  const avatar = presentation.isBot
    ? createSINGAEStaffSgAvatarElement(presentation.avatarSize)
    : inSINGAEChat
      ? createSINGAEStaffSgAvatarElement(presentation.avatarSize)
      : createUserAvatarElement(presentation.displayName, presentation.avatarUrl, presentation.avatarSize);
  avatar.classList.add('message-avatar');

  // Tap avatar => show user details modal (Telegram-like)
  // New rule: disable tapping avatar in SINGAE chat.
  const shouldOpenProfile = !isSINGAEConversation(selectedConversationId) && uiRole === 'user';
  if (shouldOpenProfile) {
    avatar.classList.add('avatar-profile-clickable');
    avatar.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openUserInfoModal(selectedConversationId).catch((err) => {
        console.error('Failed to open user info modal:', err);
      });
    });
  }
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  const textDiv = document.createElement('div');
  textDiv.className = 'message-text';
  
  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  const msgDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
  const hours = msgDate.getHours();
  const minutes = msgDate.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const timeText = document.createTextNode(`${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`);
  timeDiv.appendChild(timeText);
  
  // Add read/seen status for user messages
  if (uiRole === 'user') {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    if (msg.readAt) {
      statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="currentColor"/></svg>';
      statusDiv.title = 'Read';
    } else if (msg.seenAt) {
      statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" fill="currentColor" opacity="0.5"/></svg>';
      statusDiv.title = 'Seen';
    } else {
      statusDiv.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 15" fill="none"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.51z" fill="currentColor" opacity="0.3"/></svg>';
      statusDiv.title = 'Sent';
    }
    timeDiv.appendChild(statusDiv);
  }
  
  // If typing animation is requested
  if (options.typing && msg.text) {
    textDiv.classList.add('typing-text');
    typeText(textDiv, msg.text, () => {
      textDiv.classList.add('typing-done');
      setTimeout(() => {
        textDiv.classList.remove('typing-text');
        textDiv.classList.remove('typing-done');
        // Sau khi typing xong, đảm bảo scroll xuống cuối
        scrollChatToBottom();
      }, 120);
    });
  } else {
    textDiv.textContent = msg.text;
  }
  
  content.appendChild(textDiv);
  content.appendChild(timeDiv);
  
  div.appendChild(avatar);
  div.appendChild(content);
  
  // Luôn scroll xuống cuối khi vừa tạo message mới
  setTimeout(scrollChatToBottom, 0);

  return div;
}

function appendMessageToChatWithDateLabel(msg, options = {}) {
  if (!chatMessages || !msg) return null;

  const currentDate = msg.timestamp ? new Date(msg.timestamp) : new Date();
  const currentDateKey = getDateKey(currentDate);
  let prevDateKey = '';

  const messageNodes = chatMessages.querySelectorAll('.message');
  if (messageNodes.length > 0) {
    const lastMessageNode = messageNodes[messageNodes.length - 1];
    const lastTs = lastMessageNode?.dataset?.timestamp;
    if (lastTs) {
      prevDateKey = getDateKey(lastTs);
    }
  }

  if (currentDateKey && currentDateKey !== prevDateKey) {
    const dateSeparator = document.createElement('div');
    dateSeparator.className = 'chat-date-separator';
    dateSeparator.innerHTML = `<span>${escapeHtml(formatChatDateLabel(currentDate))}</span>`;
    chatMessages.appendChild(dateSeparator);
  }

  const messageEl = createMessageElement(msg, options);
  chatMessages.appendChild(messageEl);
  return messageEl;
}

function typeText(element, text, onComplete) {
  let index = 0;
  const baseSpeed = 12;
  const scrollInterval = 4;
  let scrollCounter = 0;
  
  function getCharSpeed(char) {
    // Space và punctuation nhanh hơn
    if (char === ' ' || char === '.' || char === ',' || char === '!' || char === '?') {
      return baseSpeed * 0.5;
    }
    // Chữ số và chữ cái bình thường
    return baseSpeed;
  }
  
  function type() {
    if (index < text.length) {
      const char = text[index];
      const charSpeed = getCharSpeed(char);
      
      // Batch characters cho đoạn dài (sau 50 ký tự, hiển thị 2-3 ký tự cùng lúc)
      let batchSize = 1;
      if (index > 50 && index < text.length - 10) {
        // Hiển thị 2-3 ký tự cùng lúc cho đoạn giữa
        batchSize = Math.random() > 0.7 ? 2 : 1;
      }
      
      // Đảm bảo không vượt quá độ dài text
      batchSize = Math.min(batchSize, text.length - index);
      
      element.textContent = text.substring(0, index + batchSize);
      index += batchSize;
      
      // Scroll mỗi vài ký tự thay vì mỗi ký tự để tối ưu performance
      scrollCounter += batchSize;
      if (scrollCounter >= scrollInterval) {
        scrollChatToBottom();
        scrollCounter = 0;
      }
      
      // Sử dụng requestAnimationFrame để animation mượt mà hơn
      requestAnimationFrame(() => {
        setTimeout(type, charSpeed);
      });
    } else {
      // Scroll lần cuối khi hoàn thành
      scrollChatToBottom();
      if (onComplete) onComplete();
    }
  }
  
  type();
}

// ===== Conversation CRUD =====
function openNewConversationPanel(clickEvent = null) {
  if (!newConversationPanel) return;
  
  // Luôn tính toán vị trí dựa trên button "+" để đảm bảo modal luôn xuất hiện bên phải
  const btn = document.getElementById('btn-new-conversation');
  if (!btn) return;
  
  const rightPanel = document.querySelector('.right-panel');
  if (!rightPanel) return;
  
  const btnRect = btn.getBoundingClientRect();
  const rightPanelRect = rightPanel.getBoundingClientRect();
  
  // Tính toán vị trí: modal luôn xuất hiện bên phải button
  const panelWidth = 280;
  const gap = 8; // Khoảng cách giữa button và modal
  const left = btnRect.right - rightPanelRect.left + gap; // Bên phải button
  
  // Căn chỉnh theo chiều dọc: căn giữa button
  const buttonCenterY = btnRect.top + btnRect.height / 2;
  const top = buttonCenterY - rightPanelRect.top - 60; // 60px = một nửa chiều cao modal (ước tính)
  
  // Đảm bảo modal không vượt ra ngoài viewport
  const panelHeight = 180; // Ước tính chiều cao modal
  let finalTop = top;
  if (finalTop < 10) finalTop = 10;
  if (finalTop + panelHeight > rightPanelRect.height - 10) {
    finalTop = rightPanelRect.height - panelHeight - 10;
  }
  
  // Đặt vị trí modal
  newConversationPanel.style.left = `${left}px`;
  newConversationPanel.style.top = `${finalTop}px`;
  newConversationPanel.style.right = 'auto';
  
  // Tính góc nhọn chỉ vào button (căn giữa button)
  const caretOffset = buttonCenterY - rightPanelRect.top - finalTop;
  newConversationPanel.style.setProperty('--caret-top', `${Math.max(12, Math.min(caretOffset, 80))}px`);
  
  // Show backdrop
  if (newConversationBackdrop) {
    newConversationBackdrop.classList.remove('hidden');
  }
  
  // Set initial state (ẩn) trước khi trigger animation
  newConversationPanel.style.display = 'block';
  newConversationPanel.style.transform = 'scale(0.9) translateY(-6px)';
  newConversationPanel.style.opacity = '0';
  newConversationPanel.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
  
  // Trigger animation giống bubble confirm
  setTimeout(() => {
    newConversationPanel.style.transform = 'scale(1) translateY(0)';
    newConversationPanel.style.opacity = '1';
    newConversationPanel.classList.add('open');
  }, 10);
  
  if (newConvNameInput) {
    newConvNameInput.value = '';
    setTimeout(() => newConvNameInput.focus(), 50);
  }
}

function closeNewConversationPanel() {
  if (!newConversationPanel) return;
  
  // Animation ẩn giống bubble confirm
  newConversationPanel.style.transform = 'scale(0.9) translateY(-6px)';
  newConversationPanel.style.opacity = '0';
  newConversationPanel.classList.remove('open');
  
  // Hide backdrop
  if (newConversationBackdrop) {
    newConversationBackdrop.classList.add('hidden');
  }
  
  // Ẩn hoàn toàn sau khi animation kết thúc
  setTimeout(() => {
    newConversationPanel.style.display = 'none';
  }, 300); // 300ms = thời gian animation backdrop
}

async function handleCreateConversationInline() {
  if (!newConvNameInput) return;
  const name = newConvNameInput.value.trim();
  if (!name) return;

  try {
    // Use chatbot API format: POST /api/chat-history with participantLabel
    const res = await apiCall('POST', '/api/chatbot/chat-history', { participantLabel: name });
    const conversation = res.conversation || res;
    await loadConversations();
    closeNewConversationPanel();

    // Tự động chọn cuộc hội thoại mới tạo nếu có id
    if (conversation && conversation.id) {
      await selectConversation(conversation.id);
    }
  } catch (error) {
    console.error(`Failed to create conversation: ${error.message}`);
  }
}

document.getElementById('btn-new-conversation').addEventListener('click', (e) => {
  e.stopPropagation(); // Ngăn event bubble
  showAddConnectionModal();
});

let channelConnectionsSnapshot = null;
let facebookOauthAppConfigured = false;
let facebookOauthPageCount = 0;
/** @type {{ pages: Array<{ pageId: string, pageName: string, pictureUrl: string }>, activePageId: string } | null} */
let facebookOauthPagesCache = null;

async function fetchFacebookOauthStatus() {
  try {
    const r = await apiCall('GET', '/api/chatbot/facebook-oauth/status');
    facebookOauthAppConfigured = Boolean(r?.oauthAppConfigured);
    facebookOauthPageCount = Number(r?.oauthPageCount || 0);
  } catch (_) {
    facebookOauthAppConfigured = false;
    facebookOauthPageCount = 0;
  }
}

async function fetchFacebookOauthPages() {
  try {
    const r = await apiCall('GET', '/api/chatbot/facebook-oauth/pages');
    const pages = Array.isArray(r?.pages) ? r.pages : [];
    facebookOauthPagesCache = {
      pages: pages.map((p) => ({
        pageId: String(p?.pageId || '').trim(),
        pageName: String(p?.pageName || '').trim(),
        pictureUrl: String(p?.pictureUrl || '').trim()
      })),
      activePageId: String(r?.activePageId || '').trim()
    };
    facebookOauthPageCount = facebookOauthPagesCache.pages.length;
  } catch (_) {
    facebookOauthPagesCache = { pages: [], activePageId: '' };
  }
}

function renderFacebookOauthPagesList() {
  const wrap = document.getElementById('fb-oauth-pages-wrap');
  if (!wrap) return;
  const cache = facebookOauthPagesCache || { pages: [], activePageId: '' };
  const { pages, activePageId } = cache;
  if (!pages.length) {
    wrap.innerHTML =
      '<div class="fb-oauth-pages-empty">Chưa có Page OAuth trên VPS. Bấm «Đăng nhập Meta (OAuth)» (callback HTTPS singae.cloud).</div>';
    wrap.classList.remove('has-pages');
    return;
  }
  wrap.classList.add('has-pages');
  const items = pages
    .map((p) => {
      const isActive = activePageId && p.pageId === activePageId;
      const name = p.pageName || p.pageId;
      const initial = String(name).trim().charAt(0).toUpperCase() || '?';
      const pic = p.pictureUrl
        ? `<img src="${escapeHtml(p.pictureUrl)}" alt="" class="fb-oauth-page-avatar-img" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="fb-oauth-page-avatar-fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
      const activePill = isActive
        ? '<span class="fb-oauth-page-active-pill">Đang dùng</span>'
        : '';
      return `<li class="fb-oauth-page-item">
  <div class="fb-oauth-page-avatar-wrap">${pic}</div>
  <div class="fb-oauth-page-text">
    <div class="fb-oauth-page-name">${escapeHtml(name)}</div>
    <div class="fb-oauth-page-id">ID: ${escapeHtml(p.pageId)}</div>
  </div>
  ${activePill}
</li>`;
    })
    .join('');
  wrap.innerHTML = `<div class="fb-oauth-pages-section-title">Page đã kết nối (OAuth)</div><ul class="fb-oauth-pages-list">${items}</ul>`;
}

function installFacebookOAuthMessageHandlerOnce() {
  if (installFacebookOAuthMessageHandlerOnce._installed) return;
  installFacebookOAuthMessageHandlerOnce._installed = true;
  window.addEventListener('message', (event) => {
    if (!event?.data || event.data.type !== 'singae-facebook-oauth' || !event.data.ok) return;
    (async () => {
      await fetchChannelConnections();
      renderChannelConnectionBadges();
      await fetchFacebookOauthPages();
      renderFacebookOauthPagesList();
      renderFacebookReconnectActions();
      renderConversationList();
    })();
  });
}

function startFacebookOAuthFromModal() {
  const statusEl = document.getElementById('fb-reconnect-status');
  if (statusEl) {
    const extra =
      facebookOauthPageCount > 0
        ? ` Đã có <strong>${facebookOauthPageCount}</strong> Page trong file OAuth — đăng nhập lại để <strong>thêm hoặc cập nhật</strong> Page.`
        : '';
    statusEl.innerHTML =
      `<div class="fb-conn-status-line">Đang mở đăng nhập Meta qua singae.cloud (HTTPS)… Đóng cửa sổ sau khi hoàn tất.${extra} Webhook Meta: <code>https://singae.cloud/webhooks/chatbot/facebook</code></div>`;
  }
  const url = '/api/chatbot/facebook-oauth/start';
  window.open(url, 'singae_fb_oauth', 'width=520,height=720');
}

function getChannelConnection(channelKey) {
  const channels = channelConnectionsSnapshot?.channels || channelConnectionsSnapshot || {};
  return channels?.[channelKey] || {};
}

function getConnectionBadgeHtml(channelKey) {
  const connection = getChannelConnection(channelKey);
  const connected = Boolean(connection?.connected);
  const label = connected ? 'Connected' : 'Disconnected';
  return `<span class="connection-badge ${connected ? 'is-connected' : 'is-disconnected'}">${label}</span>`;
}

async function fetchChannelConnections() {
  try {
    const result = await apiCall('GET', '/api/chatbot/channel-connections');
    channelConnectionsSnapshot = result || null;
    return channelConnectionsSnapshot;
  } catch (_) {
    channelConnectionsSnapshot = null;
    return null;
  }
}

function renderChannelConnectionBadges() {
  const fbBadge = document.getElementById('connection-badge-facebook');
  if (fbBadge) fbBadge.innerHTML = getConnectionBadgeHtml('facebookMessenger');
}

/** Chỉ khi modal "Thêm kết nối" đang mở và Facebook chưa Connected. */
function renderFacebookReconnectActions() {
  const wrap = document.getElementById('fb-reconnect-actions-wrap');
  if (!wrap) return;
  const fb = getChannelConnection('facebookMessenger');
  const disconnected = !Boolean(fb?.connected);
  if (!disconnected) {
    wrap.innerHTML = '';
    return;
  }
  const parts = [];
  if (facebookOauthAppConfigured) {
    parts.push(
      '<button type="button" id="btn-fb-oauth" class="modal-btn modal-btn-secondary add-connection-action-btn">Đăng nhập Meta (OAuth)</button>'
    );
  }
  parts.push(
    '<button type="button" id="btn-fb-reconnect" class="modal-btn modal-btn-secondary add-connection-action-btn">Kết nối lại Facebook</button>'
  );
  wrap.innerHTML = parts.join('');
  document.getElementById('btn-fb-oauth')?.addEventListener('click', () => {
    startFacebookOAuthFromModal();
  });
  document.getElementById('btn-fb-reconnect')?.addEventListener('click', () => {
    refreshFacebookConnectionFromModal();
  });
}

async function refreshFacebookConnectionFromModal() {
  const btn = document.getElementById('btn-fb-reconnect');
  const statusEl = document.getElementById('fb-reconnect-status');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang kiểm tra...';
  }
  try {
    await fetchChannelConnections();
    renderChannelConnectionBadges();
    await fetchFacebookOauthPages();
    renderFacebookOauthPagesList();
    renderFacebookReconnectActions();
    renderConversationList();
    if (statusEl) {
      const fb = getChannelConnection('facebookMessenger');
      if (fb?.connected) {
        statusEl.innerHTML =
          '<div class="fb-conn-status-success">Facebook đã nhận hoạt động gần đây (Connected).</div>';
      } else if (fb?.configured) {
        statusEl.innerHTML =
          '<div class="fb-conn-status-line">Đã cấu hình webhook; chưa có tin vào trong vài phút. Gửi thử một tin tới Page hoặc kiểm tra webhook Meta.</div>';
      } else {
        statusEl.innerHTML =
          '<div class="fb-conn-status-line">Chưa đủ: <code>FB_VERIFY_TOKEN</code>, page token trên VPS (OAuth), hoặc bấm <strong>Đăng nhập Meta (OAuth)</strong> (app id/secret trên VPS).</div>';
      }
    }
  } catch (error) {
    if (statusEl) {
      statusEl.innerHTML = `<div class="fb-conn-error">${escapeHtml(error.message || 'Không làm mới được trạng thái.')}</div>`;
    }
  } finally {
    const b = document.getElementById('btn-fb-reconnect');
    if (b) {
      b.disabled = false;
      b.textContent = 'Kết nối lại Facebook';
    }
  }
}

async function showAddConnectionModal() {
  await fetchChannelConnections();
  await fetchFacebookOauthStatus();
  await fetchFacebookOauthPages();
  const body = `
    <div class="add-connection-modal">
      <div class="add-connection-card">
        <div class="add-connection-card-head">
          <div class="add-connection-badge add-connection-badge-facebook">f</div>
          <div>
            <div class="add-connection-title">Facebook Messenger</div>
            <div class="add-connection-subtitle">
              <span id="connection-badge-facebook">${getConnectionBadgeHtml('facebookMessenger')}</span>
            </div>
          </div>
        </div>
        <div id="fb-oauth-pages-wrap" class="fb-oauth-pages-wrap"></div>
        <div id="fb-reconnect-actions-wrap" class="add-connection-actions"></div>
        <div id="fb-reconnect-status" class="fb-conn-status"></div>
      </div>
    </div>
  `;

  showModal('Thêm kết nối', body, [
    {
      label: 'Đóng',
      primary: true,
      onClick: () => {
        hideModal();
      }
    }
  ]);

  renderFacebookOauthPagesList();
  renderFacebookReconnectActions();
  renderConversationList();
}

// Ẩn newConversationPanel khi click ra ngoài hoặc click vào backdrop
if (newConversationBackdrop) {
  newConversationBackdrop.addEventListener('click', () => {
    closeNewConversationPanel();
  });
}

document.addEventListener('click', (e) => {
  if (newConversationPanel && newConversationPanel.classList.contains('open')) {
    // Kiểm tra xem click có nằm trong panel hoặc button không
    const btn = document.getElementById('btn-new-conversation');
    const isClickInsidePanel = newConversationPanel.contains(e.target);
    const isClickOnButton = btn && btn.contains(e.target);
    const isClickOnBackdrop = newConversationBackdrop && newConversationBackdrop.contains(e.target);
    
    if (!isClickInsidePanel && !isClickOnButton && !isClickOnBackdrop) {
      closeNewConversationPanel();
    }
  }
});

if (newConvCancelBtn) {
  newConvCancelBtn.addEventListener('click', () => {
    closeNewConversationPanel();
  });
}

if (newConvCreateBtn) {
  newConvCreateBtn.addEventListener('click', () => {
    handleCreateConversationInline();
  });
}

if (newConvNameInput) {
  newConvNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateConversationInline();
    } else if (e.key === 'Escape') {
      closeNewConversationPanel();
    }
  });
}

/** Xóa hoàn toàn một cuộc trò chuyện trên server (SQLite `chat-history`). */
async function performDeleteSelectedConversation(idToDelete) {
  const enc = encodeURIComponent(String(idToDelete || '').trim());
  await apiCall('DELETE', `/api/chatbot/chat-history/${enc}`);
  invalidateConversationBodyCache(idToDelete);

  if (selectedConversationId === idToDelete) {
    delete conversationDrafts[idToDelete];
    selectedConversationId = null;
    selectedConversationSnapshotKey = '';
    chatMessages.innerHTML = '';
    conversationDetail.classList.add('hidden');
    conversationEmpty.classList.remove('hidden');
    const cid = document.getElementById('conversation-id');
    if (cid) {
      cid.textContent = '';
      cid.classList.remove('is-online');
    }
    updateDetailActionButtons();
  }

  await loadConversations();
  markRealtimeDirty();
  scheduleRealtimeRefresh(80);
}

function wireDeleteConversationConfirm(conversationIdToDelete, triggerEl, clickEvent) {
  const idToDelete = String(conversationIdToDelete || '').trim();
  if (!idToDelete) return;
  showConfirm(
    'delete this conversation',
    async () => {
      try {
        await performDeleteSelectedConversation(idToDelete);
      } catch (error) {
        console.error(`Failed to delete conversation: ${error.message}`);
        alert(error?.message || 'Không xóa được cuộc trò chuyện.');
      }
    },
    triggerEl,
    clickEvent,
    'Xóa cuộc trò chuyện'
  );
}

document.getElementById('btn-delete-conversation').addEventListener('click', (e) => {
  if (!selectedConversationId || !conversationSupportsContextDelete(selectedConversationId)) return;
  wireDeleteConversationConfirm(selectedConversationId, e.currentTarget, e);
});

const btnClearSINGAE = document.getElementById('btn-clear-singae-messages');
if (btnClearSINGAE) {
  btnClearSINGAE.addEventListener('click', (e) => {
    if (!selectedConversationId || !isSINGAEConversation(selectedConversationId)) return;

    const clearBtn = e.currentTarget;
    showConfirm(
      'xóa toàn bộ tin nhắn trong SINGAE (giữ cuộc trò chuyện)',
      async () => {
        try {
          const res = await apiCall('DELETE', '/api/singae-assistant/messages');
          const conv = res.conversation;
          invalidateConversationBodyCache(SINGAE_CONVERSATION_ID);
          pendingConversations.delete(SINGAE_CONVERSATION_ID);
          const pendingTyping = chatMessages.querySelector('.pending-typing');
          if (pendingTyping) pendingTyping.remove();

          if (selectedConversationId === SINGAE_CONVERSATION_ID && conv) {
            const nextKey = buildConversationSnapshotKey(conv);
            singaeSnapshotKey = nextKey;
            selectedConversationSnapshotKey = nextKey;
            cacheConversationBodySnapshot(SINGAE_CONVERSATION_ID, conv);
            renderMessages(conv.messages || [], SINGAE_CONVERSATION_NAME);
          }

          await loadConversations();
          updateDetailActionButtons();
        } catch (error) {
          console.error(`Failed to clear SINGAE messages: ${error.message}`);
        }
      },
      clearBtn,
      e,
      'Xóa tin nhắn SINGAE'
    );
  });
}

// Chỉ vùng tiêu đề (trái) mở modal hồ sơ — không ảnh hưởng dropdown / nút công cụ bên phải
const detailProfileZone = document.getElementById('detail-header-profile-zone');
if (detailProfileZone) {
  detailProfileZone.style.cursor = 'pointer';
  const openProfile = (e) => {
    e.stopPropagation();
    if (!selectedConversationId) return;
    if (conversationDetail?.classList?.contains('hidden')) return;
    openUserInfoModal(selectedConversationId).catch((err) => {
      console.error('Failed to open user info modal:', err);
    });
  };
  detailProfileZone.addEventListener('click', openProfile);
  detailProfileZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProfile(e);
    }
  });
}

document.getElementById('btn-customer-intake')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedConversationId || isSINGAEConversation(selectedConversationId)) return;
  openCustomerIntakeModal(selectedConversationId).catch((err) => {
    console.error('customer intake sheet:', err);
  });
});

async function refreshSelectedConversationProfile() {
  const conversationId = selectedConversationId;
  if (!conversationId || isSINGAEConversation(conversationId)) return;
  const btn = document.getElementById('btn-refresh-profile');
  if (btn) btn.disabled = true;
  try {
    const res = await apiCall(
      'POST',
      `/api/chatbot/chat-history/${encodeURIComponent(conversationId)}/refresh-profile`
    );
    invalidateConversationBodyCache(conversationId);
    await loadConversations();
    await loadConversationInBackground(conversationId, conversationId);
    const label = res?.conversation?.participantLabel;
    alert(label ? `Đã cập nhật profile: ${label}` : String(res?.message || 'Đã cập nhật profile.'));
  } catch (err) {
    alert(err?.message || 'Không cập nhật được profile Facebook.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.getElementById('btn-refresh-profile')?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshSelectedConversationProfile().catch((err) => console.error(err));
});

async function autoReplySelectedConversationOnce() {
  const conversationId = selectedConversationId;
  if (!conversationId || isSINGAEConversation(conversationId)) return;
  const btn = document.getElementById('btn-auto-reply');
  if (btn) btn.disabled = true;
  try {
    const res = await apiCall(
      'POST',
      `/api/chatbot/chat-history/${encodeURIComponent(conversationId)}/auto-reply`
    );
    invalidateConversationBodyCache(conversationId);
    await loadConversations();
    await loadConversationInBackground(conversationId, conversationId);
    const preview = String(res?.answerPreview || res?.message || '').trim();
    alert(preview ? `Bot đã trả lời:\n${preview.slice(0, 400)}` : 'Bot đã trả lời một lần.');
  } catch (err) {
    alert(err?.message || 'Không gửi được auto-reply.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.getElementById('btn-auto-reply')?.addEventListener('click', (e) => {
  e.stopPropagation();
  autoReplySelectedConversationOnce().catch((err) => console.error(err));
});

function closeCustomerIntakeSheet() {
  const sheet = document.getElementById('customer-intake-sheet');
  const bodyEl = document.getElementById('customer-intake-sheet-body');
  if (!sheet?.classList.contains('is-open')) return;
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('customer-intake-sheet-open');
  customerIntakeActiveConversationId = null;
  customerIntakeSheetRenderedFingerprint = '';
  window.setTimeout(() => {
    if (bodyEl && !sheet.classList.contains('is-open')) bodyEl.innerHTML = '';
  }, 420);
}

function installCustomerIntakeSheetEscOnce() {
  if (customerIntakeSheetEscHandler) return;
  customerIntakeSheetEscHandler = (e) => {
    const sheet = document.getElementById('customer-intake-sheet');
    if (e.key !== 'Escape' || !sheet?.classList.contains('is-open')) return;
    e.preventDefault();
    closeCustomerIntakeSheet();
  };
  document.addEventListener('keydown', customerIntakeSheetEscHandler);
}

async function saveCustomerIntakeFromSheet() {
  const conversationId = customerIntakeActiveConversationId;
  if (!conversationId) return;
  const saveBtn = document.getElementById('customer-intake-sheet-save');
  const patient = {
    fullName: document.getElementById('ci-fullName')?.value ?? '',
    phone: document.getElementById('ci-phone')?.value ?? '',
    regionLive: document.getElementById('ci-regionLive')?.value ?? '',
    preferredOfficeKey: document.getElementById('ci-preferredOfficeKey')?.value ?? '',
    shuttlePickup: document.getElementById('ci-shuttlePickup')?.value ?? '',
    preferredVisitDate: document.getElementById('ci-preferredVisitDate')?.value ?? '',
    preferredVisitTime: document.getElementById('ci-preferredVisitTime')?.value ?? ''
  };
  const notes = document.getElementById('ci-notes')?.value ?? '';
  const careStatus = document.getElementById('ci-careStatus')?.value ?? 'bot_care';
  if (saveBtn) saveBtn.disabled = true;
  try {
    await apiCall('PATCH', `/api/chatbot/chat-history/${encodeURIComponent(conversationId)}/customer-intake`, {
      patient,
      notes
    });
    await apiCall('PATCH', `/api/chatbot/chat-history/${encodeURIComponent(conversationId)}/care-status`, {
      careStatus
    });
    closeCustomerIntakeSheet();
    invalidateConversationBodyCache(conversationId);
    await loadConversations();
    await loadConversationInBackground(conversationId, conversationId);
  } catch (err) {
    alert(err?.message || 'Không lưu được.');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/** Đổ nội dung form intake từ object conversation (đã có customerIntake). Dùng khi mở sheet và khi SSE/refresh cập nhật intake. */
function renderCustomerIntakeSheetBody(conversationId, conv, bookings = []) {
  const sheet = document.getElementById('customer-intake-sheet');
  const bodyEl = document.getElementById('customer-intake-sheet-body');
  if (!sheet || !bodyEl || !conv) return false;
  const ci = conv.customerIntake || {};
  const p = ci.patient || {};
  const pok = String(p.preferredOfficeKey || '').trim().toUpperCase();
  const sh = String(p.shuttlePickup || '').trim().toLowerCase();
  const visitPreview = formatPatientVisitPreview(p.preferredVisitDate, p.preferredVisitTime);
  const careStatus = String(conv.careStatus || 'bot_care').trim();
  const bookingItems = Array.isArray(bookings) ? bookings : [];
  const bookingHtml = bookingItems.length
    ? bookingItems
        .map((item) => {
          const visit = formatPatientVisitPreview(item.visitDate, item.visitTime);
          return `
            <div class="customer-booking-item">
              <div class="customer-booking-item-title">${escapeHtml(item.id || 'booking')} · ${escapeHtml(formatCareStatusLabel(item.status || 'booked'))}</div>
              <div class="customer-booking-item-meta">Cơ sở: ${escapeHtml(item.officeKey || '—')} · Hẹn: ${escapeHtml(visit)}</div>
            </div>
          `;
        })
        .join('')
    : `<div class="customer-booking-empty">Chưa có booking nội bộ cho phiên này.</div>`;
  const body = `
    <div class="customer-intake-modal">
      <p class="customer-intake-hint"><strong>schemaVersion</strong> (DB): ${escapeHtml(String(Number(ci.schemaVersion) || 1))}</p>
      <div class="customer-intake-visit-block">
        <div class="customer-intake-grid">
          <label class="customer-intake-label">careStatus phiên chat
            <select id="ci-careStatus" class="customer-intake-input">
              <option value="bot_care" ${careStatus === 'bot_care' ? 'selected' : ''}>Bot đang care</option>
              <option value="booked" ${careStatus === 'booked' ? 'selected' : ''}>Bot đã đặt lịch</option>
              <option value="treating" ${careStatus === 'treating' ? 'selected' : ''}>Đang điều trị</option>
              <option value="treatment_done" ${careStatus === 'treatment_done' ? 'selected' : ''}>Điều trị xong</option>
            </select>
          </label>
        </div>
      </div>
      <div class="customer-intake-grid">
        <label class="customer-intake-label">patient.fullName
          <input id="ci-fullName" class="customer-intake-input" type="text" value="${escapeHtml(p.fullName || '')}" autocomplete="name" />
        </label>
        <label class="customer-intake-label">patient.phone
          <input id="ci-phone" class="customer-intake-input" type="tel" value="${escapeHtml(p.phone || '')}" autocomplete="tel" />
        </label>
        <label class="customer-intake-label">patient.regionLive
          <input id="ci-regionLive" class="customer-intake-input" type="text" value="${escapeHtml(p.regionLive || '')}" autocomplete="off" />
        </label>
        <label class="customer-intake-label">patient.preferredOfficeKey
          <select id="ci-preferredOfficeKey" class="customer-intake-input">
            <option value="" ${!pok ? 'selected' : ''}>—</option>
            <option value="25VNP" ${pok === '25VNP' ? 'selected' : ''}>25VNP (Hà Nội)</option>
            <option value="355LTT" ${pok === '355LTT' ? 'selected' : ''}>355LTT (TP.HCM)</option>
          </select>
        </label>
        <label class="customer-intake-label">patient.shuttlePickup
          <select id="ci-shuttlePickup" class="customer-intake-input">
            <option value="" ${sh !== 'yes' && sh !== 'no' ? 'selected' : ''}>—</option>
            <option value="yes" ${sh === 'yes' ? 'selected' : ''}>yes</option>
            <option value="no" ${sh === 'no' ? 'selected' : ''}>no</option>
          </select>
        </label>
      </div>
      <div class="customer-intake-visit-block">
        <p class="customer-intake-hint" id="ci-visit-preview"><strong>Hẹn (xem nhanh):</strong> ${escapeHtml(visitPreview)}</p>
        <div class="customer-intake-grid">
          <label class="customer-intake-label">patient.preferredVisitDate (YYYY-MM-DD)
            <input id="ci-preferredVisitDate" class="customer-intake-input" type="text" inputmode="numeric" autocomplete="off" placeholder="2026-04-15" value="${escapeHtml(String(p.preferredVisitDate || '').trim())}" />
          </label>
          <label class="customer-intake-label">patient.preferredVisitTime (HH:mm)
            <input id="ci-preferredVisitTime" class="customer-intake-input" type="text" autocomplete="off" placeholder="10:00" value="${escapeHtml(String(p.preferredVisitTime || '').trim())}" />
          </label>
        </div>
      </div>
      <label class="customer-intake-label">notes — mô tả tình trạng răng &amp; mục đích đến khám (không thay cho ngày/giờ ở trên)
        <textarea id="ci-notes" class="customer-intake-textarea" rows="3">${escapeHtml(ci.notes || '')}</textarea>
      </label>
      <div class="customer-intake-visit-block">
        <p class="customer-intake-hint"><strong>Booking nội bộ của phiên chat</strong> — quản lý riêng, không lưu chung trong <code>customerIntake</code>.</p>
        <div class="customer-booking-list">${bookingHtml}</div>
      </div>
    </div>
  `;
  customerIntakeActiveConversationId = conversationId;
  bodyEl.innerHTML = body;
  const pv = document.getElementById('ci-visit-preview');
  const vd = document.getElementById('ci-preferredVisitDate');
  const vt = document.getElementById('ci-preferredVisitTime');
  const updateCiVisitPreview = () => {
    if (!pv) return;
    const d = vd?.value ?? '';
    const t = vt?.value ?? '';
    pv.innerHTML = `<strong>Hẹn (xem nhanh):</strong> ${escapeHtml(formatPatientVisitPreview(d, t))}`;
  };
  vd?.addEventListener('input', updateCiVisitPreview);
  vt?.addEventListener('input', updateCiVisitPreview);
  customerIntakeSheetRenderedFingerprint = buildCustomerIntakeFingerprint({ ...ci, careStatus });
  return true;
}

async function openCustomerIntakeModal(conversationId) {
  let res;
  let bookingsRes = null;
  try {
    [res, bookingsRes] = await Promise.all([
      apiCall('GET', `/api/chatbot/chat-history/${encodeURIComponent(conversationId)}`),
      apiCall('GET', `/api/chatbot/bookings?conversationId=${encodeURIComponent(conversationId)}`)
    ]);
  } catch (err) {
    showModal('Lỗi', `<p>${escapeHtml(err.message || 'Không tải được dữ liệu.')}</p>`, [
      { label: 'OK', primary: true, onClick: hideModal }
    ]);
    return;
  }
  const conv = res?.conversation;
  if (!conv) {
    showModal('Lỗi', '<p>Không tìm thấy cuộc trò chuyện.</p>', [{ label: 'OK', primary: true, onClick: hideModal }]);
    return;
  }
  const sheet = document.getElementById('customer-intake-sheet');
  const bodyEl = document.getElementById('customer-intake-sheet-body');
  if (!sheet || !bodyEl) {
    showModal('Lỗi', '<p>Thiếu UI slide panel (customer-intake-sheet).</p>', [{ label: 'OK', primary: true, onClick: hideModal }]);
    return;
  }
  renderCustomerIntakeSheetBody(conversationId, conv, bookingsRes?.bookings || []);
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('customer-intake-sheet-open');
  installCustomerIntakeSheetEscOnce();
  if (!sheet.classList.contains('is-open')) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sheet.classList.add('is-open');
      });
    });
  }
}

document.getElementById('customer-intake-sheet-close')?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeCustomerIntakeSheet();
});
document.getElementById('customer-intake-sheet-backdrop')?.addEventListener('click', () => {
  closeCustomerIntakeSheet();
});
document.getElementById('customer-intake-sheet-save')?.addEventListener('click', () => {
  saveCustomerIntakeFromSheet().catch((err) => console.error(err));
});
document.getElementById('customer-intake-sheet-panel')?.addEventListener('click', (e) => {
  e.stopPropagation();
});

// ===== Test Ollama API =====
// Event listeners sẽ được attach trong attachLeftPanelEventListeners()

// ===== SSE Stream for Realtime Updates =====
let serverLogStream = null;
let eventStreamHandler = null;
let logStreamHandler = null;
let realtimeSyncTimer = null;
let realtimeSyncInProgress = false;
let realtimeDirty = true;
let realtimeRefreshDebounceTimer = null;
let selectedConversationSnapshotKey = '';
let singaeSnapshotKey = '';
const REALTIME_SYNC_INTERVAL_MS = 8000;

function getServerLogStream() {
  if (serverLogStream && serverLogStream.readyState !== EventSource.CLOSED) {
    return serverLogStream;
  }
  serverLogStream = new EventSource('/api/chatbot/server-logs/stream');
  serverLogStream.onerror = () => {
    setTimeout(() => {
      if (serverLogStream?.readyState === EventSource.CLOSED) {
        serverLogStream = null;
        getServerLogStream();
      }
    }, 3000);
  };
  return serverLogStream;
}

function markRealtimeDirty() {
  realtimeDirty = true;
}

function scheduleRealtimeRefresh(delayMs = 220) {
  if (realtimeRefreshDebounceTimer) {
    clearTimeout(realtimeRefreshDebounceTimer);
  }
  realtimeRefreshDebounceTimer = setTimeout(() => {
    refreshRealtimeData();
  }, delayMs);
}

function buildConversationSnapshotKey(conversation) {
  if (!conversation) return '';
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1] || {};
  const intakeFingerprint = buildCustomerIntakeFingerprint({
    ...(conversation.customerIntake || {}),
    careStatus: conversation.careStatus || 'bot_care'
  });
  const lastProvId = String(lastMessage.providerMessageId || lastMessage.metadata?.providerMessageId || '').trim();
  return [
    conversation.id || '',
    conversation.unreadCount || 0,
    conversation.lastMessageAt || conversation.updatedAt || '',
    messages.length,
    lastMessage.id || '',
    lastProvId,
    lastMessage.role || '',
    lastMessage.direction || '',
    lastMessage.createdAt || '',
    String(lastMessage.text || ''),
    String(lastMessage.metadata?.media?.mediaUrl || ''),
    String(lastMessage.metadata?.media?.kind || ''),
    intakeFingerprint
  ].join('|');
}

async function refreshRealtimeData() {
  // Tab ẩn: không polling nặng; giữ realtimeDirty — visibility/focus sẽ gọi lại.
  if (realtimeSyncInProgress || document.hidden) {
    return;
  }

  // Không skip theo trạng thái EventSource: stream log là per-process — load balancer có thể cho webhook và SSE vào hai instance ⇒ SSE chập chờn.
  // Chỉ skip khi chưa dirty (nhịp định kỳ / SSE / focus đều phải markRealtimeDirty trước).
  if (!realtimeDirty) {
    return;
  }

  realtimeSyncInProgress = true;
  try {
    if (!selectedConversationId) {
      await loadConversations();
      realtimeDirty = false;
      return;
    }
    // Không skip refresh body khi pendingConversations: tin Facebook có thể tới giữa lúc staff đang POST gửi tay.

    await loadConversations();
    const activeConversationId = selectedConversationId;
    const res = await apiCall('GET', `/api/chatbot/chat-history/${activeConversationId}`);
    if (activeConversationId !== selectedConversationId) {
      return;
    }

    const conversation = res?.conversation;
    if (!conversation || !Array.isArray(conversation.messages)) {
      return;
    }

    const nextIntakeFp = buildCustomerIntakeFingerprint({
      ...(conversation.customerIntake || {}),
      careStatus: conversation.careStatus || 'bot_care'
    });
    const intakePanelFocused = (() => {
      const panel = document.getElementById('customer-intake-sheet-panel');
      const a = document.activeElement;
      if (!panel || !a || !panel.contains(a)) return false;
      return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA';
    })();
    if (
      document.body.classList.contains('customer-intake-sheet-open') &&
      customerIntakeActiveConversationId === activeConversationId &&
      nextIntakeFp !== customerIntakeSheetRenderedFingerprint &&
      !intakePanelFocused
    ) {
      renderCustomerIntakeSheetBody(activeConversationId, conversation);
    }

    const nextSnapshotKey = buildConversationSnapshotKey(conversation);
    if (nextSnapshotKey !== selectedConversationSnapshotKey) {
      selectedConversationSnapshotKey = nextSnapshotKey;
      renderMessages(conversation.messages, conversation.participantLabel);
      cacheConversationBodySnapshot(activeConversationId, conversation);
      renderConversationList();
    }
    realtimeDirty = false;
  } catch (error) {
    // Ignore background sync errors to avoid noisy UI
  } finally {
    realtimeSyncInProgress = false;
  }
}

function startRealtimeSync() {
  if (realtimeSyncTimer) {
    clearInterval(realtimeSyncTimer);
    realtimeSyncTimer = null;
  }
  // Luôn đánh dấu dirty theo chu kỳ khi tab đang xem: bù EventSource/proxy đứt hoặc nhiều instance không fan-out SSE.
  realtimeSyncTimer = setInterval(() => {
    if (!chatbotAppBootstrapped || document.hidden) return;
    markRealtimeDirty();
    scheduleRealtimeRefresh(200);
  }, REALTIME_SYNC_INTERVAL_MS);
  refreshRealtimeData();
}

function isConversationFocused(conversationId) {
  return Boolean(
    conversationId &&
    selectedConversationId === conversationId &&
    conversationDetail &&
    !conversationDetail.classList.contains('hidden') &&
    !document.hidden
  );
}

async function markCurrentConversationReadByTap() {
  if (!selectedConversationId || tapReadInFlight) return;
  if (conversationDetail?.classList?.contains('hidden')) return;
  const now = Date.now();
  if (now - lastTapReadAt < 400) return;
  const conversation = conversations.find((c) => c.id === selectedConversationId);
  const unread = Number(conversation?.unreadCount || 0);
  if (unread <= 0) return;

  tapReadInFlight = true;
  lastTapReadAt = now;
  try {
    await apiCall('POST', `/api/chatbot/chat-history/${encodeURIComponent(selectedConversationId)}/read`);
    if (conversation) {
      conversation.unreadCount = 0;
    }
    renderConversationList();
  } catch (e) {
    // best effort; unread will be synced by next realtime refresh
  } finally {
    tapReadInFlight = false;
  }
}

function installTapToMarkReadHandler() {
  const onTap = () => {
    markCurrentConversationReadByTap();
  };
  if (chatMessages) {
    chatMessages.addEventListener('pointerdown', onTap, { passive: true });
  }
  if (conversationDetail) {
    conversationDetail.addEventListener('pointerdown', onTap, { passive: true });
  }
}

/** conversationId nằm trong entry.response (appendServerLog), không phải root. */
function getSsePayloadConversationId(data) {
  return String(data?.response?.conversationId || data?.conversationId || '').trim();
}

function hasDomTypingIndicators() {
  return Boolean(
    chatMessages?.querySelector('.pending-typing') ||
    chatMessages?.querySelector('.message-text.typing-text')
  );
}

function connectEventStream() {
  const stream = getServerLogStream();
  if (eventStreamHandler) {
    stream.removeEventListener('log', eventStreamHandler);
  }

  eventStreamHandler = (event) => {
    try {
      const data = JSON.parse(event.data);
      const eventType = data?.response?.type || data.type;
      if (eventType === 'channel_connection_status' && data?.response?.channels) {
        channelConnectionsSnapshot = { channels: data.response.channels };
        renderChannelConnectionBadges();
        renderFacebookReconnectActions();
      }
      if (
        eventType === 'conversation_message' ||
        eventType === 'conversation_message_assistant' ||
        eventType === 'conversation_profile_updated' ||
        eventType === 'conversation_inbox_updated' ||
        eventType === 'conversation_customer_intake_updated' ||
        eventType === 'conversation_cleared' ||
        eventType === 'conversation_read' ||
        eventType === 'conversation_deleted'
      ) {
        // Có thay đổi mới => đánh dấu dirty, debounce refresh để tránh gọi API liên tục.
        markRealtimeDirty();
        scheduleRealtimeRefresh(220);

        const sseConversationId = getSsePayloadConversationId(data);
        const isFocusedConversation = isConversationFocused(sseConversationId);

        // Nếu event liên quan đến cuộc hội thoại đang mở, xử lý theo trạng thái focus/typing
        if (isFocusedConversation) {
          if (eventType === 'conversation_deleted') {
            // Nếu cuộc hội thoại hiện tại bị xóa, clear UI
            delete conversationDrafts[selectedConversationId];
            saveDrafts();
            selectedConversationId = null;
            selectedConversationSnapshotKey = '';
            chatMessages.innerHTML = '';
            conversationDetail.classList.add('hidden');
            conversationEmpty.classList.remove('hidden');
            const cid = document.getElementById('conversation-id');
            if (cid) {
              cid.textContent = '';
              cid.classList.remove('is-online');
            }
          } else if (eventType === 'conversation_message_assistant') {
            chatMessages?.querySelectorAll('.pending-typing')?.forEach((el) => el.remove());
          } else if (eventType === 'conversation_message') {
            if (hasDomTypingIndicators()) {
              return;
            }
            showBotTypingIndicator(sseConversationId);
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  };

  // Server đang phát custom event: "log"
  stream.addEventListener('log', eventStreamHandler);
}

// ===== Modal Close =====
document.getElementById('modal-close').addEventListener('click', hideModal);

// Backdrop click để đóng modal confirm
if (modalConfirmBackdrop) {
  modalConfirmBackdrop.addEventListener('click', () => {
    hideModal();
  });
}

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    hideModal();
  }
});

// ===== Import Knowledge Database from UI =====
// Event listeners sẽ được attach trong attachLeftPanelEventListeners()

// ===== View Knowledge Database (modal) =====
async function openKnowledgeModal() {
  try {
    // Loading knowledge base
    const response = await fetch('/api/chatbot/knowledge-base');
    const result = await response.json();

    if (!response.ok) {
      console.error(`Failed to load knowledge base: ${result.error || response.statusText}`);
      return;
    }

    // Chatbot API returns entries directly
    const entries = Array.isArray(result.entries) ? result.entries : [];

    const body = `
      <div class="knowledge-modal">
        <div class="import-section" style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
          <h4 style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary);">Import Knowledge Base</h4>
          
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label">Import from Google Sheet</label>
            <input
              type="text"
              id="google-sheet-url"
              class="form-input"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              autocomplete="off"
            />
            <input
              type="text"
              id="google-sheet-name"
              class="form-input"
              style="margin-top: 8px;"
              placeholder="Sheet name (optional, leave empty for first sheet)"
              autocomplete="off"
            />
            <button id="btn-import-google-sheet" class="modal-btn modal-btn-primary" style="margin-top: 8px; width: 100%;">
              Import from Google Sheet
            </button>
            <p class="form-help">
              Paste Google Sheet URL (must be publicly accessible). The sheet should have columns: question, answer.
            </p>
          </div>
          
          <div class="form-group">
            <label class="form-label">Import from XLSX File</label>
            <input
              type="file"
              id="xlsx-file-input"
              accept=".xlsx,.xls"
              style="display: none;"
            />
            <button id="btn-select-xlsx" class="modal-btn modal-btn-secondary" style="width: 100%; margin-bottom: 8px;">
              Choose XLSX File
            </button>
            <button id="btn-import-xlsx" class="modal-btn modal-btn-primary" style="width: 100%; display: none;">
              Import XLSX File
            </button>
            <p id="xlsx-file-name" style="font-size: 12px; color: var(--text-muted); margin-top: 4px; display: none;"></p>
            <p class="form-help">
              Upload an XLSX file with columns: question, answer. The file will be processed and embedded automatically.
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">Update Embedding Database</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button id="btn-reembed-openai" class="modal-btn modal-btn-secondary" style="flex:1; min-width:180px;">
                Re-embed (OpenAI)
              </button>
            </div>
            <p class="form-help">
              Rebuild embeddings for all current records with selected provider.
            </p>
          </div>
          
          <div id="import-status" style="display: none; margin-top: 12px; padding: 12px; border-radius: 8px; background: var(--bg-primary);">
            <div id="import-status-text" style="font-size: 14px; color: var(--text-primary);"></div>
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Search knowledge base</label>
          <input
            type="text"
            id="knowledge-search-input"
            class="form-input"
            placeholder="Enter keywords (by question or answer)..."
            autocomplete="off"
          />
          <p class="form-help">
            SINGAE uses embeddings to automatically filter the most relevant knowledge for your question.
            This search box helps you <strong>preview</strong> and
            check imported data.
          </p>
        </div>
        <div id="knowledge-list" class="knowledge-list">
          ${entries.length === 0
            ? '<div class="empty-state">No knowledge in database. Please import file first.</div>'
            : entries
                .map(
                  (entry) => `
              <div class="knowledge-item">
                <div class="knowledge-question">${escapeHtml(entry.record?.question || entry.text || '')}</div>
                <div class="knowledge-answer">${escapeHtml((entry.record?.answer || entry.text || '').substring(0, 400))}${(entry.record?.answer || entry.text || '').length > 400 ? '...' : ''}</div>
              </div>
            `
                )
                .join('')}
        </div>
      </div>
    `;

    showModal('Knowledge Base Database', body, [
      { label: 'Close', onClick: hideModal }
    ]);

    // Setup import handlers
    setupImportHandlers();
    
    // Gắn filter client-side sau khi modal đã render
    const searchInput = document.getElementById('knowledge-search-input');
    const listContainer = document.getElementById('knowledge-list');
    if (searchInput && listContainer && entries.length > 0) {
      searchInput.addEventListener('input', () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = !keyword
          ? entries
          : entries.filter((e) => {
              const q = String(e.record?.question || e.text || '').toLowerCase();
              const a = String(e.record?.answer || e.text || '').toLowerCase();
              return q.includes(keyword) || a.includes(keyword);
            });

        listContainer.innerHTML =
          filtered.length === 0
            ? '<div class="empty-state">Không tìm thấy dòng kiến thức nào khớp từ khóa.</div>'
            : filtered
                .map(
                  (entry) => `
              <div class="knowledge-item">
                <div class="knowledge-question">${escapeHtml(entry.record?.question || entry.text || '')}</div>
                <div class="knowledge-answer">${escapeHtml((entry.record?.answer || entry.text || '').substring(0, 400))}${(entry.record?.answer || entry.text || '').length > 400 ? '...' : ''}</div>
              </div>
            `
                )
                .join('');
      });
    }
  } catch (error) {
    console.error(`Error loading knowledge base: ${error.message}`);
  }
}

// Setup import handlers for knowledge base
function setupImportHandlers() {
  // Google Sheet import
  const btnImportGoogleSheet = document.getElementById('btn-import-google-sheet');
  const googleSheetUrl = document.getElementById('google-sheet-url');
  const googleSheetName = document.getElementById('google-sheet-name');
  
  if (btnImportGoogleSheet) {
    btnImportGoogleSheet.addEventListener('click', async () => {
      const sheetUrl = googleSheetUrl?.value.trim();
      if (!sheetUrl) {
        showImportStatus('Please enter Google Sheet URL', 'error');
        return;
      }
      
      const sheetName = googleSheetName?.value.trim() || '';
      
      try {
        btnImportGoogleSheet.disabled = true;
        btnImportGoogleSheet.textContent = 'Importing...';
        showImportStatus('Importing from Google Sheet and generating embeddings...', 'loading');
        
        const response = await fetch('/api/chatbot/import/google-sheet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sheetUrl, sheetName })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || result.message || 'Import failed');
        }
        
        showImportStatus(`Import successful! ${result.entries || 0} entries imported and embedded.`, 'success');
        
        // Reload knowledge base after successful import
        setTimeout(() => {
          openKnowledgeModal();
        }, 1500);
      } catch (error) {
        console.error('Import Google Sheet error:', error);
        showImportStatus(`Import failed: ${error.message}`, 'error');
      } finally {
        btnImportGoogleSheet.disabled = false;
        btnImportGoogleSheet.textContent = 'Import from Google Sheet';
      }
    });
  }
  
  // XLSX file import
  const xlsxFileInput = document.getElementById('xlsx-file-input');
  const btnSelectXlsx = document.getElementById('btn-select-xlsx');
  const btnImportXlsx = document.getElementById('btn-import-xlsx');
  const xlsxFileName = document.getElementById('xlsx-file-name');
  
  if (btnSelectXlsx && xlsxFileInput) {
    btnSelectXlsx.addEventListener('click', () => {
      xlsxFileInput.click();
    });
  }
  
  if (xlsxFileInput) {
    xlsxFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        xlsxFileName.textContent = `Selected: ${file.name}`;
        xlsxFileName.style.display = 'block';
        btnImportXlsx.style.display = 'block';
        btnSelectXlsx.textContent = 'Change File';
      }
    });
  }
  
  if (btnImportXlsx && xlsxFileInput) {
    btnImportXlsx.addEventListener('click', async () => {
      const file = xlsxFileInput.files[0];
      if (!file) {
        showImportStatus('Please select an XLSX file', 'error');
        return;
      }
      if (String(file.name || '').startsWith('~$')) {
        showImportStatus('Ban dang chon file tam cua Excel (~$...). Vui long chon file XLSX goc.', 'error');
        return;
      }
      
      try {
        btnImportXlsx.disabled = true;
        btnImportXlsx.textContent = 'Importing...';
        showImportStatus('Uploading file and generating embeddings...', 'loading');
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/chatbot/import/xlsx', {
          method: 'POST',
          body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || result.message || 'Import failed');
        }
        
        showImportStatus(`Import successful! ${result.entries || 0} entries imported and embedded.`, 'success');
        
        // Reload knowledge base after successful import
        setTimeout(() => {
          openKnowledgeModal();
        }, 1500);
      } catch (error) {
        console.error('Import XLSX error:', error);
        showImportStatus(`Import failed: ${error.message}`, 'error');
      } finally {
        btnImportXlsx.disabled = false;
        btnImportXlsx.textContent = 'Import XLSX File';
      }
    });
  }

  const btnReembedOpenAi = document.getElementById('btn-reembed-openai');
  const bindReembed = (btn, provider, label) => {
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        showImportStatus(`Re-embedding with ${label}...`, 'loading');
        const response = await fetch('/api/chatbot/knowledge-base/re-embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || result.message || 'Re-embed failed');
        showImportStatus(`${label} re-embed successful (${result.entries || 0} entries).`, 'success');
        setTimeout(() => openKnowledgeModal(), 1200);
      } catch (error) {
        showImportStatus(`Re-embed failed: ${error.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  };
  bindReembed(btnReembedOpenAi, 'openai', 'OpenAI');
}

// Show import status
function showImportStatus(message, type = 'info') {
  const statusDiv = document.getElementById('import-status');
  const statusText = document.getElementById('import-status-text');
  
  if (!statusDiv || !statusText) return;
  
  statusDiv.style.display = 'block';
  
  // Remove previous type classes
  statusDiv.classList.remove('import-status-loading', 'import-status-success', 'import-status-error');
  
  // Add type class
  if (type === 'loading') {
    statusDiv.classList.add('import-status-loading');
    statusText.innerHTML = `⏳ ${message}`;
  } else if (type === 'success') {
    statusDiv.classList.add('import-status-success');
    statusText.innerHTML = `✅ ${message}`;
  } else if (type === 'error') {
    statusDiv.classList.add('import-status-error');
    statusText.innerHTML = `❌ ${message}`;
  } else {
    statusText.textContent = message;
  }
}

// View knowledge event listener sẽ được attach trong attachLeftPanelEventListeners()

// ===== Theme Selector =====
function applyTheme(theme) {
  const body = document.body;
  const themes = ['default', 'singae', 'midnight'];
  themes.forEach((t) => {
    body.classList.remove(`theme-${t}`);
  });

  const normalized = themes.includes(theme) ? theme : 'default';
  if (normalized !== 'default') {
    body.classList.add(`theme-${normalized}`);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch (e) {
    // ignore storage error
  }

  // Theme applied
}

function initTheme() {
  let saved = 'default';
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY) || 'default';
  } catch (e) {
    saved = 'default';
  }
  applyTheme(saved);
}

// Theme button đã được chuyển sang logs.html

// ===== Side Menu =====
const sideMenu = document.getElementById('side-menu');
const sideMenuBackdrop = document.getElementById('side-menu-backdrop');
const btnToggleLogs = document.getElementById('btn-toggle-logs');

function openSideMenu() {
  if (!sideMenu || !sideMenuBackdrop) return;
  sideMenuBackdrop.classList.remove('hidden');
  sideMenu.classList.add('open');
}

function closeSideMenu() {
  if (!sideMenu || !sideMenuBackdrop) return;
  sideMenu.classList.remove('open');
  setTimeout(() => {
    sideMenuBackdrop.classList.add('hidden');
  }, 300); // Match transition duration
}

// Toggle menu khi click button
if (btnToggleLogs) {
  btnToggleLogs.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sideMenu && sideMenu.classList.contains('open')) {
      closeSideMenu();
    } else {
      openSideMenu();
    }
  });
}

// Đóng menu khi click backdrop
if (sideMenuBackdrop) {
  sideMenuBackdrop.addEventListener('click', (e) => {
    if (e.target === sideMenuBackdrop) {
      closeSideMenu();
    }
  });
}

// Đóng menu khi click ra ngoài
document.addEventListener('click', (e) => {
  if (sideMenu && sideMenu.classList.contains('open')) {
    if (!sideMenu.contains(e.target) && !btnToggleLogs.contains(e.target)) {
      closeSideMenu();
    }
  }
});

// Menu items
const menuItemLogs = document.getElementById('menu-item-logs');
const menuItemPrompts = document.getElementById('menu-item-prompts');
const menuItemDatabase = document.getElementById('menu-item-database');
const menuItemChangeModel = document.getElementById('menu-item-change-model');
const menuItemProfile = document.getElementById('menu-item-profile');
const menuItemContacts = document.getElementById('menu-item-contacts');

/** Đã đăng nhập WindowShell → hiển thị đủ menu (không còn mật khẩu chatbot riêng). */
function canUseChatbotAdminUi() {
  return Boolean(String(singaeAuth?.username || '').trim());
}

function updateMenuVisibility() {
  const showAll = canUseChatbotAdminUi();
  if (menuItemLogs) {
    menuItemLogs.classList.remove('locked');
    menuItemLogs.style.display = showAll ? '' : 'none';
  }
  if (menuItemProfile) {
    menuItemProfile.style.display = '';
  }
  if (menuItemContacts) {
    menuItemContacts.style.display = '';
  }
  if (menuItemChangeModel) {
    menuItemChangeModel.style.display = 'none';
  }
  if (menuItemDatabase) {
    menuItemDatabase.style.display = 'none';
  }
  if (menuItemPrompts) {
    menuItemPrompts.style.display = 'none';
  }
}

updateMenuVisibility();

if (menuItemDatabase) {
  menuItemDatabase.addEventListener('click', () => {
    closeSideMenu();
    // Giảm delay để modal hiển thị nhanh hơn
    setTimeout(() => {
      console.log('Opening knowledge modal...');
      openKnowledgeModal();
    }, 100);
  });
}

async function openChangeModelModal() {
  try {
    const [modelsRes, cfgResPrimary] = await Promise.all([
      fetch('/api/chatbot/openai-models'),
      fetch('/api/chatbot/runtime-config')
    ]);
    if (!modelsRes.ok) {
      throw new Error('Không tải được danh sách model.');
    }
    let cfgRes = cfgResPrimary;
    if (!cfgRes.ok) {
      // Back-compat fallback for deployments using root API mapping.
      cfgRes = await fetch('/api/runtime-config');
    }
    if (!cfgRes.ok) {
      throw new Error('Không tải được cấu hình runtime.');
    }
    const modelsData = await modelsRes.json();
    const cfg = await cfgRes.json();
    const currentModel = (cfg.openai && cfg.openai.model) || 'gpt-4o';
    const models = modelsData.models || [];

    const rowsHtml = models
      .map(
        (m) => `
      <div class="model-picker-row" data-model="${escapeHtml(m.id)}" tabindex="0" role="option">
        <div class="model-picker-row-title">${escapeHtml(m.label)}</div>
        <div class="model-picker-row-id">${escapeHtml(m.id)}</div>
      </div>`
      )
      .join('');

    const body = `
      <div class="model-picker">
        <p class="form-help model-picker-intro">Di chuột (hoặc focus) vào model để xem <strong>ưu điểm mạnh nhất</strong> và <strong>chi phí ~ 1 tin</strong> (VNĐ).</p>
        <div class="model-picker-split">
          <div class="model-picker-list">${rowsHtml}</div>
          <div class="model-picker-detail" id="model-picker-detail">
            <span class="model-picker-placeholder">Chọn hoặc di chuột vào một model…</span>
          </div>
        </div>
      </div>
    `;

    let selectedModel = currentModel;
    const mapById = {};
    models.forEach((m) => {
      mapById[m.id] = m;
    });

    showModal('Đổi model chat', body, [
      { label: 'Đóng', onClick: hideModal },
      {
        label: 'Lưu model',
        primary: true,
        onClick: async () => {
          try {
            const r = await fetch('/api/chatbot/runtime-config/openai-model', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: selectedModel })
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
              throw new Error(d.error || r.statusText || 'Lưu thất bại');
            }
            if (d.message) {
              alert(d.message);
            }
            window.ollamaModel = selectedModel;
            await loadConfig();
            hideModal();
          } catch (e) {
            alert(e.message || String(e));
          }
        }
      }
    ]);

    const detailEl = document.getElementById('model-picker-detail');
    function showDetail(m) {
      if (!detailEl) return;
      if (!m) {
        detailEl.innerHTML =
          '<span class="model-picker-placeholder">Chọn hoặc di chuột vào một model…</span>';
        return;
      }
      detailEl.innerHTML = `
        <div class="model-picker-detail-title">${escapeHtml(m.label)}</div>
        <p class="model-picker-highlight">${escapeHtml(m.highlight)}</p>
        <p class="model-picker-cost">Chi phí ~ 1 lượt hỏi–đáp: <strong>${Number(
          m.approxVndPerMessage
        ).toLocaleString('vi-VN')}₫</strong> <span class="model-picker-usd">(~$${Number(
        m.approxUsdPerMessage
      ).toFixed(4)} USD)</span></p>
        <p class="form-help model-picker-note">${escapeHtml(m.pricingNote || '')}</p>
      `;
    }

    document.querySelectorAll('.model-picker-row').forEach((row) => {
      const id = row.getAttribute('data-model');
      const m = mapById[id];
      row.addEventListener('mouseenter', () => showDetail(m));
      row.addEventListener('focus', () => showDetail(m));
      row.addEventListener('click', () => {
        document.querySelectorAll('.model-picker-row').forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
        selectedModel = id;
        showDetail(m);
      });
    });

    const initial = mapById[currentModel];
    if (initial) {
      const safeAttr = currentModel.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const rowEl = document.querySelector(`.model-picker-row[data-model="${safeAttr}"]`);
      if (rowEl) {
        rowEl.classList.add('selected');
        showDetail(initial);
      }
    }
  } catch (e) {
    console.error(e);
    showModal('Lỗi', `<p>${escapeHtml(e.message || 'Không tải được danh sách model.')}</p>`, [
      { label: 'Đóng', onClick: hideModal }
    ]);
  }
}

if (menuItemChangeModel) {
  menuItemChangeModel.addEventListener('click', () => {
    closeSideMenu();
    setTimeout(() => {
      showModal('Đổi model', '<p>Tính năng đổi model đã chuyển sang AI Manager.</p>', [
        { label: 'OK', primary: true, onClick: hideModal }
      ]);
    }, 150);
  });
}

if (menuItemProfile) {
  menuItemProfile.addEventListener('click', () => {
    closeSideMenu();
    const username = String(singaeAuth?.username || '').trim();
    const role = String(singaeAuth?.role || 'user').trim();
    const autoLogin = Boolean(getSingaeAutoLoginPref());
    const body = `
      <div class="ai-field"><label>Username</label><input value="${escapeHtml(username)}" readonly /></div>
      <div class="ai-field"><label>Role</label><input value="${escapeHtml(role)}" readonly /></div>
      <div class="ai-field"><label>Auto Login</label><input value="${autoLogin ? 'ON' : 'OFF'}" readonly /></div>
    `;
    showModal('My Profile', body, [{ label: 'Close', primary: true, onClick: hideModal }]);
  });
}

if (menuItemContacts) {
  menuItemContacts.addEventListener('click', async (evt) => {
    // Prevent the initial click from bubbling to overlay handlers in the same tick
    if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
    closeSideMenu();
    try {
      const data = await apiCall('GET', '/api/chatbot/chat-history');
      const contacts = Array.isArray(data?.conversations) ? data.conversations : [];
      const sourceIconHtml = (sourceValue) => {
        const src = String(sourceValue || '').toLowerCase();
        if (src.includes('facebook') || src.includes('messenger')) {
          return '<span class="contacts-source-icon source-facebook">f</span>';
        }
        return '<span class="contacts-source-icon source-generic">#</span>';
      };

      const toContact = (conv) => {
        const p = conv?.participantProfile || {};
        return {
          id: conv?.id || '',
          name: p?.name || conv?.participantLabel || conv?.participantId || '',
          avatarUrl: p?.avatarUrl || p?.avatar || '',
          source: conv?.platform || conv?.channel || '-'
        };
      };

      const items = contacts.map((conv) => {
        const c = toContact(conv);
        const avatarHtml = c.avatarUrl
          ? `<img class="contacts-avatar" src="${escapeHtml(c.avatarUrl)}" alt="${escapeHtml(c.name)}" />`
          : `<div class="contacts-avatar contacts-avatar-fallback">${escapeHtml((c.name || '?').charAt(0).toUpperCase())}</div>`;
        return `
          <button class="conversation-item contact-select" data-conv-id="${escapeHtml(c.id)}" style="width:100%; text-align:left; border-radius:12px; margin:4px 6px; padding:6px 8px;">
            <div class="conversation-item-avatar-wrapper">${avatarHtml}</div>
            <div class="conversation-item-content">
              <div class="conversation-item-header" style="align-items:center;">
                <div class="conversation-item-main" style="display:flex; align-items:center; gap:8px;">
                  <div class="conversation-item-title">${escapeHtml(c.name)}</div>
                </div>
                <div class="conversation-item-meta">${sourceIconHtml(c.source)}</div>
              </div>
            </div>
          </button>
        `;
      }).join('');

      const body = items ? `<div class="conversation-list contact-list" style="max-height:60vh;overflow:auto; padding:6px;">${items}</div>` : '<p>Chưa có liên hệ.</p>';

      // Open on next frame and swallow the very first overlay click to avoid instant close.
      requestAnimationFrame(() => {
        showModal('Contacts', body, []);
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
          const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
          overlay.addEventListener('click', swallow, { once: true, capture: true });
          overlay.addEventListener('pointerup', swallow, { once: true, capture: true });
        }
        // Do not keep any selected/focused state across opens
        const modalContainer = document.querySelector('.modal-container');
        if (modalContainer) {
          modalContainer.setAttribute('tabindex', '-1');
          try { modalContainer.focus({ preventScroll: true }); } catch (_) {}
        }
      });

      // Bind tap-to-select: hide modal with a quick fade, then open detail modal
      document.querySelectorAll('.conversation-item[data-conv-id]').forEach((el) => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          const id = el.getAttribute('data-conv-id');
          try {
            const overlay = document.querySelector('.modal-overlay');
            const container = document.querySelector('.modal-container');
            if (overlay && container) {
              // Animate close, then open detail modal
              overlay.style.transition = 'opacity 0.16s ease';
              container.style.transition = 'opacity 0.16s ease, transform 0.16s ease';
              overlay.style.opacity = '0';
              container.style.opacity = '0';
              container.style.transform = 'translateY(6px) scale(0.98)';
              setTimeout(() => {
                hideModal();
                if (id) openUserInfoModal(id);
              }, 180);
            } else {
              hideModal();
              if (id) openUserInfoModal(id);
            }
          } catch (_) {
            hideModal();
          } finally {
            // No conversation selection or send action here
          }
        });
      });
    } catch (error) {
      showModal('Lỗi', `<p>${escapeHtml(error.message || 'Không tải được contacts.')}</p>`, [
        { label: 'OK', primary: true, onClick: hideModal }
      ]);
    }
  });
}

if (menuItemLogs) {
  menuItemLogs.addEventListener('click', () => {
    closeSideMenu();
    if (!canUseChatbotAdminUi()) return;
    setTimeout(() => {
      openLogsModal();
    }, 300);
  });
}

if (menuItemPrompts) {
  menuItemPrompts.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSideMenu();
    setTimeout(() => {
      console.log('Opening prompts modal...');
      openPromptsModal();
    }, 300);
  });
} else {
  console.error('menu-item-prompts not found');
}

// ===== Logs Modal =====
let logsPaused = false;
const logsModalOverlay = document.getElementById('logs-modal-overlay');
const logsModalContainer = document.getElementById('logs-modal-container');
const logsModalClose = document.getElementById('logs-modal-close');
const logTerminal = document.getElementById('log-terminal');

function addLogToModal(message, type = 'info', fullData = null) {
  if (logsPaused) return;
  if (!logTerminal) return;
  
  const time = new Date().toLocaleTimeString('vi-VN');
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type} ${fullData ? 'log-clickable' : ''}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span>${escapeHtml(message)}`;
  
  if (fullData) {
    entry.dataset.fullData = JSON.stringify(fullData);
    entry.title = 'Click to view full data';
    entry.style.cursor = 'pointer';
    entry.addEventListener('click', () => {
      alert(JSON.stringify(fullData, null, 2));
    });
  }
  
  logTerminal.appendChild(entry);
  logTerminal.scrollTop = logTerminal.scrollHeight;
  
  if (logTerminal.children.length > 1000) {
    logTerminal.removeChild(logTerminal.firstChild);
  }
}

function connectLogStream() {
  const stream = getServerLogStream();
  if (logStreamHandler) {
    stream.removeEventListener('log', logStreamHandler);
  }

  logStreamHandler = (event) => {
    try {
      const data = JSON.parse(event.data);
      const level = data.level || 'info';
      const message = data.message || JSON.stringify(data);
      const displayMessage = `[${level}] ${message}`;
      addLogToModal(displayMessage, level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'success' ? 'success' : 'info', data);
    } catch (e) {
      addLogToModal(event.data, 'info');
    }
  };

  stream.addEventListener('log', logStreamHandler);
}

function openLogsModal() {
  if (!logsModalOverlay) return;
  
  // Clear logs terminal
  if (logTerminal) {
    logTerminal.innerHTML = '';
  }
  
  // Show modal
  logsModalOverlay.classList.remove('hidden');
  
  // Connect log stream
  connectLogStream();
  addLogToModal('Logs viewer initialized', 'success');
}

function closeLogsModal() {
  if (!logsModalOverlay) return;
  
  // Detach log listener but keep stream for realtime sync.
  if (logStreamHandler) {
    const stream = getServerLogStream();
    stream.removeEventListener('log', logStreamHandler);
    logStreamHandler = null;
  }
  
  // Hide modal
  logsModalOverlay.classList.add('hidden');
}

if (logsModalClose) {
  logsModalClose.addEventListener('click', closeLogsModal);
}

if (logsModalOverlay) {
  logsModalOverlay.addEventListener('click', (e) => {
    if (e.target === logsModalOverlay) {
      closeLogsModal();
    }
  });
}

// ===== Utils =====
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getDateKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatChatDateLabel(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const todayKey = getDateKey(now);
  const messageKey = getDateKey(d);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);

  if (messageKey === todayKey) return 'Hôm nay';
  if (messageKey === yesterdayKey) return 'Hôm qua';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ===== Draft Update Handler =====
const DRAFT_STORAGE_KEY = 'chatbot_drafts';
let draftUpdateTimeout = null;

// Load drafts from localStorage
function loadDrafts() {
  try {
    const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (stored) {
      const drafts = JSON.parse(stored);
      Object.assign(conversationDrafts, drafts);
    }
  } catch (e) {
    console.warn('Failed to load drafts:', e);
  }
}

// Save drafts to localStorage
function saveDrafts() {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(conversationDrafts));
  } catch (e) {
    console.warn('Failed to save drafts:', e);
  }
}

// Load drafts on init
loadDrafts();

if (messageInput) {
  messageInput.addEventListener('input', () => {
    if (selectedConversationId) {
      const draftValue = messageInput.value; // Lưu cả khi chưa trim để giữ nguyên text
      if (draftValue) {
        conversationDrafts[selectedConversationId] = draftValue;
        saveDrafts(); // Auto-save to localStorage
      } else {
        delete conversationDrafts[selectedConversationId];
        saveDrafts();
      }
      
      // Debounce: chỉ render lại sau 300ms ngừng gõ
      if (draftUpdateTimeout) {
        clearTimeout(draftUpdateTimeout);
      }
      draftUpdateTimeout = setTimeout(() => {
        renderConversationList();
      }, 300);
    }
  });
}

// ===== Prompts Modal =====
async function openPromptsModal() {
  console.log('openPromptsModal called');
  try {
    console.log('Fetching prompts from /api/chatbot/prompts...');
    const response = await fetch(`/api/chatbot/prompts?provider=${encodeURIComponent('openai')}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch prompts:', response.status, errorText);
      showModal('Error', `<p>Failed to load prompts: ${response.status} ${response.statusText}</p>`, [
        { label: 'Close', onClick: hideModal }
      ]);
      return;
    }
    
    const result = await response.json();
    console.log('Prompts response:', result);

    if (!response.ok) {
      console.error(`Failed to load prompts: ${result.error || response.statusText}`);
      showModal('Error', `<p>Failed to load prompts: ${result.error || response.statusText}</p>`, [
        { label: 'Close', onClick: hideModal }
      ]);
      return;
    }

    const prompts = result.prompts || [];
    const activePromptId = result.activePromptId || null;

    const body = `
      <div class="prompts-modal">
        <div class="form-group">
          <button id="btn-create-prompt" class="modal-btn modal-btn-primary" style="width: 100%; margin-bottom: 16px;">
            + Create New Prompt
          </button>
        </div>
        <div id="prompts-list" class="prompts-list" style="max-height: 400px; overflow-y: auto;">
          ${prompts.length === 0
            ? '<div class="empty-state" style="text-align: center; padding: 20px; color: var(--text-muted);">No prompts found. Create your first prompt!</div>'
            : prompts
                .map(
                  (prompt) => `
              <div class="prompt-item" data-prompt-id="${prompt.id}" style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; background: var(--bg-primary);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                  <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                      ${escapeHtml(prompt.title || 'Untitled')}
                      ${prompt.id === activePromptId ? '<span style="color: var(--success); font-size: 12px; margin-left: 8px;">(Active)</span>' : ''}
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted); max-height: 60px; overflow: hidden; text-overflow: ellipsis;">
                      ${escapeHtml((prompt.content || '').substring(0, 150))}${(prompt.content || '').length > 150 ? '...' : ''}
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button class="prompt-action-btn" data-action="edit" data-prompt-id="${prompt.id}" style="flex: 1; padding: 6px 12px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Edit</button>
                  ${prompt.id !== activePromptId ? `<button class="prompt-action-btn" data-action="set-active" data-prompt-id="${prompt.id}" style="flex: 1; padding: 6px 12px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Set Active</button>` : ''}
                  <button class="prompt-action-btn" data-action="delete" data-prompt-id="${prompt.id}" style="flex: 1; padding: 6px 12px; background: var(--error); border: 1px solid var(--error); border-radius: 6px; color: white; cursor: pointer; font-size: 13px;">Delete</button>
                </div>
              </div>
            `
                )
                .join('')}
        </div>
      </div>
    `;

    console.log('Calling showModal with title: Manage Prompts');
    showModal('Manage Prompts', body, [
      { label: 'Close', onClick: hideModal }
    ]);
    console.log('showModal called, checking if modal is visible...');

    // Event listeners
    const createBtn = document.getElementById('btn-create-prompt');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        openCreatePromptModal();
      });
    }

    // Attach event listeners to action buttons
    document.querySelectorAll('.prompt-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        const promptId = e.target.dataset.promptId;
        
        if (action === 'edit') {
          await openEditPromptModal(promptId);
        } else if (action === 'set-active') {
          await setActivePrompt(promptId);
        } else if (action === 'delete') {
          await deletePrompt(promptId);
        }
      });
    });
  } catch (error) {
    console.error(`Error loading prompts: ${error.message}`);
    showModal('Error', `<p>Error loading prompts: ${error.message}</p>`, [
      { label: 'Close', onClick: hideModal }
    ]);
  }
}

async function openCreatePromptModal() {
  const body = `
    <div class="prompt-form-modal">
      <div class="form-group">
        <label class="form-label">Prompt Title</label>
        <input type="text" id="prompt-title-input" class="form-input" placeholder="Enter prompt title..." autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Prompt Content</label>
        <textarea id="prompt-content-input" class="form-input" rows="10" placeholder="Enter prompt content..." style="resize: vertical; font-family: monospace; font-size: 13px;"></textarea>
      </div>
    </div>
  `;

  showModal('Create New Prompt', body, [
    { label: 'Cancel', onClick: hideModal },
    {
      label: 'Create',
      primary: true,
      onClick: async () => {
        const title = document.getElementById('prompt-title-input').value.trim();
        const content = document.getElementById('prompt-content-input').value.trim();

        if (!title) {
          alert('Please enter a prompt title.');
          return;
        }

        if (!content) {
          alert('Please enter prompt content.');
          return;
        }

        try {
          const response = await fetch('/api/chatbot/prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, prompt: content, provider: 'openai' })
          });

          const result = await response.json();

          if (!response.ok) {
            alert(`Failed to create prompt: ${result.error || response.statusText}`);
            return;
          }

          hideModal();
          openPromptsModal(); // Reload prompts list
        } catch (error) {
          alert(`Error creating prompt: ${error.message}`);
        }
      }
    }
  ]);
}

async function openEditPromptModal(promptId) {
  try {
    // Get all prompts to find the one we want to edit
    const response = await fetch(`/api/chatbot/prompts?provider=${encodeURIComponent('openai')}`);
    const result = await response.json();

    if (!response.ok) {
      alert(`Failed to load prompt: ${result.error || response.statusText}`);
      return;
    }

    const prompts = result.prompts || [];
    const prompt = prompts.find(p => p.id === promptId);

    if (!prompt) {
      alert('Prompt not found.');
      return;
    }

    const body = `
      <div class="prompt-form-modal">
        <div class="form-group">
          <label class="form-label">Prompt Title</label>
          <input type="text" id="prompt-title-input" class="form-input" value="${escapeHtml(prompt.title || '')}" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">Prompt Content</label>
          <textarea id="prompt-content-input" class="form-input" rows="10" style="resize: vertical; font-family: monospace; font-size: 13px;">${escapeHtml(prompt.content || '')}</textarea>
        </div>
      </div>
    `;

    showModal('Edit Prompt', body, [
      { label: 'Cancel', onClick: hideModal },
      {
        label: 'Save',
        primary: true,
        onClick: async () => {
          const title = document.getElementById('prompt-title-input').value.trim();
          const content = document.getElementById('prompt-content-input').value.trim();

          if (!title) {
            alert('Please enter a prompt title.');
            return;
          }

          if (!content) {
            alert('Please enter prompt content.');
            return;
          }

          try {
            const response = await fetch(`/api/chatbot/prompts/${promptId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, prompt: content, provider: 'openai' })
            });

            const result = await response.json();

            if (!response.ok) {
              alert(`Failed to update prompt: ${result.error || response.statusText}`);
              return;
            }

            hideModal();
            openPromptsModal(); // Reload prompts list
          } catch (error) {
            alert(`Error updating prompt: ${error.message}`);
          }
        }
      }
    ]);
  } catch (error) {
    alert(`Error loading prompt: ${error.message}`);
  }
}

async function setActivePrompt(promptId) {
  try {
    const response = await fetch(`/api/chatbot/prompts/active/${promptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai' })
    });

    const result = await response.json();

    if (!response.ok) {
      alert(`Failed to set active prompt: ${result.error || response.statusText}`);
      return;
    }

    openPromptsModal(); // Reload prompts list
  } catch (error) {
    alert(`Error setting active prompt: ${error.message}`);
  }
}

async function deletePrompt(promptId) {
  if (!confirm('Are you sure you want to delete this prompt?')) {
    return;
  }

  try {
    const response = await fetch(`/api/chatbot/prompts/${promptId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai' })
    });

    const result = await response.json();

    if (!response.ok) {
      alert(`Failed to delete prompt: ${result.error || response.statusText}`);
      return;
    }

    openPromptsModal(); // Reload prompts list
  } catch (error) {
    alert(`Error deleting prompt: ${error.message}`);
  }
}

// ===== Initialize =====
bootstrapWithWindowsShellAuth();
installTapToMarkReadHandler();
document.addEventListener('visibilitychange', () => {
  if (!chatbotAppBootstrapped) return;
  if (!document.hidden) {
    connectEventStream();
    markRealtimeDirty();
    refreshRealtimeData();
  }
});
window.addEventListener('focus', () => {
  if (!chatbotAppBootstrapped) return;
  connectEventStream();
  markRealtimeDirty();
  refreshRealtimeData();
});


