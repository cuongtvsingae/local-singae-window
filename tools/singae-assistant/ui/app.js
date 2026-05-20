const mainEl = document.getElementById('sd-main');
const introHeadEl = document.getElementById('intro-head');
const emptyStateEl = document.getElementById('empty-state');
const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const promptEl = document.getElementById('prompt');
const fileInputEl = document.getElementById('file-input');
const attachBtnEl = document.getElementById('btn-attach');
const attachmentListEl = document.getElementById('attachment-list');
const lightboxEl = document.getElementById('image-lightbox');
const lightboxImageEl = document.getElementById('lightbox-image');
const lightboxCloseEl = document.getElementById('lightbox-close');
const newChatEl = document.getElementById('sd-new-chat');
const uploadDbEl = document.getElementById('sd-upload-db');
const dbUploadInputEl = document.getElementById('sd-db-upload-input');
const dbSwitchEl = document.getElementById('sd-db-switch');
const viewDbEl = document.getElementById('sd-view-db');
const viewPromptEl = document.getElementById('sd-view-prompt');
const manageAccountsEl = document.getElementById('sd-manage-accounts');
const logoutEl = document.getElementById('sd-logout');
if (uploadDbEl) uploadDbEl.hidden = true;
if (viewDbEl) viewDbEl.hidden = true;
if (viewPromptEl) viewPromptEl.hidden = true;
if (manageAccountsEl) manageAccountsEl.hidden = true;
const chatListEl = document.getElementById('sd-chat-list');
const yourChatsGroupEl = document.getElementById('sd-your-chats-group');
const adminUsersGroupEl = document.getElementById('sd-admin-users-group');
const adminUserListEl = document.getElementById('sd-admin-user-list');
const userBadgeEl = document.getElementById('sd-user-badge');
const menuUserTitleEl = document.getElementById('sd-menu-user-title');
const loginViewEl = document.getElementById('sd-login-view');
const loginFormEl = document.getElementById('sd-login-form');
const loginUsernameEl = document.getElementById('sd-login-username');
const loginPasswordEl = document.getElementById('sd-login-password');
const loginAutoLoginEl = document.getElementById('sd-login-autologin');
const loginAutoLoginWrapEl = loginAutoLoginEl?.closest('.sd-login-autologin');
const loginSubmitEl = document.getElementById('sd-login-submit');
const loginErrorEl = document.getElementById('sd-login-error');
const loginLoadingEl = document.getElementById('sd-login-loading');

const CHAT_GPT_VIP_ACCESS_DB_SWITCH_KEY = 'chat_gpt_vip_access_use_database';
const CHAT_GPT_VIP_ACCESS_AUTH_KEY = 'chat_gpt_vip_access_auth';
const CHAT_GPT_VIP_ACCESS_AUTOLOGIN_PREF_KEY = 'chat_gpt_vip_access_autologin_pref';
const CHAT_GPT_VIP_ACCESS_AUTH_DAY_KEY = 'chat_gpt_vip_access_auth_day';
const CHAT_GPT_VIP_ACCESS_ADMIN_USERNAME = 'admin';
const CHAT_GPT_VIP_ACCESS_FAKE_PASSWORD = '**************';
const CHAT_GPT_VIP_ACCESS_AUTOLOGIN_DELAY_MS = 6000;
const LOOKUP_ACCOUNT_CODE_REGEX = /\bKH\d+\b/i;

const attachedFiles = [];
let isChatMode = false;
let stickToBottom = true;
let smoothScrollRaf = 0;
let messageJumpScrollRaf = 0;
let queuedAutoScrollRaf = 0;
let queuedAutoScrollForce = false;
let lightboxOpen = false;
let lastMessagesScrollTop = 0;
let composerHiddenByScroll = false;
let composerToggleRaf = 0;
let titleExitTimer = 0;
let useChatGptVipAccessDatabase = true;
let chatGptVipAccessAuth = null;
let activeConversationUsername = '';
let adminEventsSource = null;
let adminSseReconnectMs = 4000;
let currentConversationCache = { messages: [] };
let autoLoginTimer = 0;
let autoLoginCountdownTimer = 0;
let autoLoginPending = false;
const chatGptVipAccessLocalEvents = new EventTarget();
const adminPendingUsers = new Set();

function isAdminUser() {
  return String(chatGptVipAccessAuth?.role || '').trim().toLowerCase() === 'admin';
}

function isAdminViewingOtherConversation() {
  if (!isAdminUser()) return false;
  const own = String(chatGptVipAccessAuth?.username || '').toLowerCase();
  const active = String(activeConversationUsername || own).toLowerCase();
  return Boolean(active) && active !== own;
}

function applyConversationPermissionState() {
  const readonly = isAdminViewingOtherConversation();
  if (promptEl) {
    promptEl.readOnly = readonly;
    if (readonly) {
      promptEl.placeholder = 'Admin view mode: read-only for other users conversation';
    } else {
      promptEl.placeholder = 'Trợ lý SINGAE AI';
    }
  }
  if (attachBtnEl) attachBtnEl.disabled = readonly;
  if (fileInputEl) fileInputEl.disabled = readonly;
  if (newChatEl) newChatEl.disabled = readonly;
}

function syncAdminMenuVisibility() {
  const isAdmin = isAdminUser();
  if (uploadDbEl) uploadDbEl.hidden = true;
  if (viewDbEl) viewDbEl.hidden = !isAdmin;
  if (viewPromptEl) viewPromptEl.hidden = !isAdmin;
  if (manageAccountsEl) manageAccountsEl.hidden = !isAdmin;
}
syncAdminMenuVisibility();

function emitLocalMessageEvent(eventType, payload = {}) {
  chatGptVipAccessLocalEvents.dispatchEvent(
    new CustomEvent('chat_gpt_vip_access_message', {
      detail: { eventType, ...payload }
    })
  );
}

function installLocalMessageEventHandlers() {
  chatGptVipAccessLocalEvents.addEventListener('chat_gpt_vip_access_message', () => {
    if (!isAdminUser()) {
      renderYourChats(currentConversationCache);
      return;
    }
    loadAdminUsersBlock();
  });
}

function stopAdminGlobalEvents() {
  if (adminEventsSource) {
    try { adminEventsSource.close(); } catch (_) {}
    adminEventsSource = null;
  }
}

function installAdminGlobalEvents() {
  stopAdminGlobalEvents();
  const uname = encodeURIComponent(chatGptVipAccessAuth?.username || '');
  if (!uname) return;
  const source = new EventSource(`/api/singae-assistant/events?username=${uname}`);
  source.addEventListener('open', () => {
    adminSseReconnectMs = 4000;
  });
  source.addEventListener('chat_gpt_vip_access_message', (event) => {
    const ownUsername = String(chatGptVipAccessAuth?.username || '').toLowerCase();
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      const unameFromEvent = String(payload?.username || '').toLowerCase();
      if (isAdminUser()) {
        if (unameFromEvent && unameFromEvent !== String(activeConversationUsername || '').toLowerCase()) {
          adminPendingUsers.add(unameFromEvent);
        }
        loadAdminUsersBlock();
        return;
      }
      if (!unameFromEvent || unameFromEvent !== ownUsername) return;
      if (String(payload?.phase || '').toLowerCase() === 'assistant_sent') {
        loadConversation();
      }
    } catch (_) {}
  });
  source.onerror = () => {
    try { source.close(); } catch (_) {}
    adminEventsSource = null;
    const delay = adminSseReconnectMs;
    adminSseReconnectMs = Math.min(60000, Math.floor(adminSseReconnectMs * 1.6));
    window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      installAdminGlobalEvents();
    }, delay);
  };
  adminEventsSource = source;
}

function isHostWindowMaximized() {
  try {
    const hostWindowEl = window.frameElement?.closest?.('.desktop-window');
    if (!hostWindowEl) return true;
    return hostWindowEl.classList.contains('is-max');
  } catch (_) {
    return true;
  }
}

function getStoredDbSwitch() {
  // Singae assistant always uses database mode.
  return true;
}

function setDbSwitchState(enabled, persist = true) {
  useChatGptVipAccessDatabase = true;
  if (dbSwitchEl) {
    dbSwitchEl.classList.add('is-on');
    dbSwitchEl.classList.remove('is-off');
    dbSwitchEl.setAttribute('aria-pressed', 'true');
  }
}

function setComposerHiddenByScroll(hidden) {
  const nextHidden = Boolean(hidden);
  if (composerHiddenByScroll === nextHidden) return;
  composerHiddenByScroll = nextHidden;
  if (composerToggleRaf) cancelAnimationFrame(composerToggleRaf);
  composerToggleRaf = requestAnimationFrame(() => {
    mainEl.classList.toggle('input-hidden-by-scroll', composerHiddenByScroll);
    composerToggleRaf = 0;
  });
}

function getChatRowCount() {
  return messagesEl.querySelectorAll('.sd-row').length;
}

function shouldShowTopTitle() {
  const rowCount = getChatRowCount();
  if (rowCount === 0) return true;
  const threshold = Math.max(120, mainEl.clientHeight * 0.75);
  return messagesEl.scrollHeight <= threshold;
}

function updateTopTitleVisibility(forceHide = false) {
  const show = !forceHide && shouldShowTopTitle();
  mainEl.classList.toggle('has-top-title', show);
  if (!show) mainEl.classList.remove('is-title-exit');
}

function animateHideTopTitle() {
  if (!mainEl.classList.contains('has-top-title')) return;
  mainEl.classList.add('is-title-exit');
  if (titleExitTimer) clearTimeout(titleExitTimer);
  titleExitTimer = setTimeout(() => {
    mainEl.classList.remove('has-top-title');
    mainEl.classList.remove('is-title-exit');
    titleExitTimer = 0;
  }, 320);
}

function enterChatMode() {
  if (isChatMode) return;
  isChatMode = true;
  mainEl.classList.remove('is-intro');
  mainEl.classList.add('is-chat');
  if (emptyStateEl) emptyStateEl.hidden = true;
  updateTopTitleVisibility();
}

function enterIntroMode() {
  isChatMode = false;
  composerHiddenByScroll = false;
  mainEl.classList.remove('is-chat');
  mainEl.classList.remove('input-hidden-by-scroll');
  mainEl.classList.add('is-intro');
  if (emptyStateEl) emptyStateEl.hidden = false;
  updateTopTitleVisibility();
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.+?)__/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

const BOT_HTML_TAG_PATTERN = /<\s*\/?\s*(h[1-6]|p|br|ul|ol|li|strong|em|b|i|code|blockquote|div|section|article|span)\b/i;
const BOT_ALLOWED_HTML_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'code', 'blockquote',
  'div', 'section', 'article', 'span'
]);

function isLikelyBotHtml(text) {
  return BOT_HTML_TAG_PATTERN.test(String(text || ''));
}

function sanitizeBotHtmlNode(node, ownerDocument) {
  if (!ownerDocument) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    return ownerDocument.createTextNode(String(node.nodeValue || ''));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = String(node.tagName || '').toLowerCase();
  const children = Array.from(node.childNodes || []);

  if (!BOT_ALLOWED_HTML_TAGS.has(tag)) {
    const fragment = ownerDocument.createDocumentFragment();
    children.forEach((child) => {
      const safeChild = sanitizeBotHtmlNode(child, ownerDocument);
      if (safeChild) fragment.appendChild(safeChild);
    });
    return fragment;
  }

  if (tag === 'br') return ownerDocument.createElement('br');

  const safeEl = (() => {
    const el = ownerDocument.createElement(tag);
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      el.classList.add('sd-rich-title');
      el.classList.add(`sd-rich-title-l${tag.slice(1)}`);
    }
    if (tag === 'ul' || tag === 'ol') {
      el.classList.add('sd-rich-list');
    }
    return el;
  })();

  children.forEach((child) => {
    const safeChild = sanitizeBotHtmlNode(child, ownerDocument);
    if (safeChild) safeEl.appendChild(safeChild);
  });
  return safeEl;
}

function validateAndSanitizeBotHtml(text) {
  const source = String(text || '').trim();
  if (!source || !isLikelyBotHtml(source)) return '';
  const template = document.createElement('template');
  template.innerHTML = source;
  const container = document.createElement('div');
  Array.from(template.content.childNodes).forEach((node) => {
    const safeNode = sanitizeBotHtmlNode(node, document);
    if (safeNode) container.appendChild(safeNode);
  });
  return container.innerHTML.trim();
}

function formatBotText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inList = false;

  const closeList = () => {
    if (!inList) return;
    html.push('</ul>');
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      html.push('<div class="sd-break"></div>');
      continue;
    }

    const centerTextMatch = line.match(/^\s*---\s*(.+?)\s*---\s*$/);
    if (centerTextMatch) {
      closeList();
      html.push(`<p class="sd-rich-center">${inlineFormat(centerTextMatch[1])}</p>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      closeList();
      html.push('<div class="sd-rich-divider" aria-hidden="true"></div>');
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const content = inlineFormat(headingMatch[2]);
      closeList();
      if (level === 3) {
        html.push(`<h3 class="sd-rich-title sd-rich-title-center">${content}</h3>`);
      } else if (level === 4) {
        html.push(`<p class="sd-rich-subtitle">${content}</p>`);
      } else {
        html.push(`<h3 class="sd-rich-title sd-rich-title-l${level}">${content}</h3>`);
      }
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*•]\s+|\d+\.\s+)(.+)$/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul class="sd-rich-list">');
        inList = true;
      }
      html.push(`<li>${inlineFormat(listMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  return html.join('');
}

function validateBotContentBeforeRender(fullText) {
  const formatted = formatChatGptVipAccessText(fullText);
  return { mode: 'text', value: formatted };
}

function renderRichBotContent(fullText) {
  const validated = validateBotContentBeforeRender(fullText);
  return formatBotText(String(validated.value || ''));
}

function distanceToBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
}

function queueAutoScrollToBottom(force = false) {
  queuedAutoScrollForce = queuedAutoScrollForce || Boolean(force);
  if (queuedAutoScrollRaf) return;
  queuedAutoScrollRaf = requestAnimationFrame(() => {
    queuedAutoScrollRaf = 0;
    const shouldForce = queuedAutoScrollForce;
    queuedAutoScrollForce = false;
    smoothScrollToBottom(shouldForce);
  });
}

function smoothScrollToBottom(force = false) {
  if (!force && !stickToBottom) return;
  const start = messagesEl.scrollTop;
  const target = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
  if (Math.abs(target - start) < 2) {
    messagesEl.scrollTop = target;
    return;
  }

  if (smoothScrollRaf) cancelAnimationFrame(smoothScrollRaf);
  const startAt = performance.now();
  const duration = 220;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (now) => {
    const p = Math.min(1, (now - startAt) / duration);
    messagesEl.scrollTop = start + (target - start) * easeOut(p);
    if (p < 1) {
      smoothScrollRaf = requestAnimationFrame(tick);
    } else {
      smoothScrollRaf = 0;
    }
  };

  smoothScrollRaf = requestAnimationFrame(tick);
}

function smoothScrollMessagesTo(targetTop) {
  const start = messagesEl.scrollTop;
  const maxTop = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
  const nextTop = Math.min(maxTop, Math.max(0, Number(targetTop) || 0));
  if (Math.abs(nextTop - start) < 2) {
    messagesEl.scrollTop = nextTop;
    return;
  }
  if (messageJumpScrollRaf) cancelAnimationFrame(messageJumpScrollRaf);
  const startAt = performance.now();
  const duration = 360;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tick = (now) => {
    const p = Math.min(1, (now - startAt) / duration);
    messagesEl.scrollTop = start + (nextTop - start) * easeInOut(p);
    if (p < 1) {
      messageJumpScrollRaf = requestAnimationFrame(tick);
    } else {
      messageJumpScrollRaf = 0;
    }
  };
  messageJumpScrollRaf = requestAnimationFrame(tick);
}

function installAutoScrollObservers() {
  messagesEl.addEventListener(
    'scroll',
    () => {
      const nowTop = messagesEl.scrollTop;
      const delta = nowTop - lastMessagesScrollTop;
      lastMessagesScrollTop = nowTop;
      const dist = distanceToBottom();
      const nearBottom = dist < 36;
      stickToBottom = nearBottom;

      if (nearBottom) {
        setComposerHiddenByScroll(false);
        return;
      }
      // User scrolls up through history -> hide composer by sliding it down.
      if (delta < -3 && dist > 54) {
        setComposerHiddenByScroll(true);
        return;
      }
      // When scrolling back down near latest messages, show composer sooner.
      if (delta > 3 && dist < 132) {
        setComposerHiddenByScroll(false);
      }
      updateTopTitleVisibility();
    },
    { passive: true }
  );

  const resizeObserver = new ResizeObserver(() => {
    if (stickToBottom) queueAutoScrollToBottom();
    updateTopTitleVisibility();
  });
  resizeObserver.observe(messagesEl);

  const mutationObserver = new MutationObserver(() => {
    if (stickToBottom) queueAutoScrollToBottom();
    updateTopTitleVisibility();
  });
  mutationObserver.observe(messagesEl, { childList: true });
}

function openLightbox(src) {
  if (!lightboxEl || !lightboxImageEl || !src) return;
  lightboxOpen = true;
  lightboxImageEl.src = src;
  lightboxEl.hidden = false;
  lightboxEl.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => lightboxEl.classList.add('is-open'));
}

function closeLightbox() {
  if (!lightboxEl || !lightboxOpen) return;
  lightboxOpen = false;
  lightboxEl.classList.remove('is-open');
  lightboxEl.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    if (!lightboxOpen) {
      lightboxEl.hidden = true;
      if (lightboxImageEl) lightboxImageEl.src = '';
    }
  }, 240);
}

function decodeLatin1ToUtf8(value) {
  try {
    return new TextDecoder('utf-8').decode(Uint8Array.from(value, (c) => c.charCodeAt(0)));
  } catch (_) {
    return value;
  }
}

function countMatches(value, regex) {
  const matches = value.match(regex);
  return matches ? matches.length : 0;
}

function shouldUseDecoded(original, decoded) {
  if (!decoded || decoded === original) return false;
  if (decoded.includes('�')) return false;
  const mojibakeRegex = /Ã|Â|Ä|Ì|Æ|áº|á»/g;
  const viCharsRegex = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g;
  const originalMojibake = countMatches(original, mojibakeRegex);
  const decodedMojibake = countMatches(decoded, mojibakeRegex);
  const originalVi = countMatches(original, viCharsRegex);
  const decodedVi = countMatches(decoded, viCharsRegex);
  return decodedMojibake < originalMojibake || decodedVi > originalVi;
}

function fixMojibakeText(text) {
  const source = String(text || '');
  if (!source) return '';
  const normalized = source.normalize('NFC');
  const decoded = decodeLatin1ToUtf8(normalized);
  return shouldUseDecoded(normalized, decoded) ? decoded : normalized;
}

function formatChatGptVipAccessText(text) {
  const source = typeof text === 'string'
    ? text
    : (text === null || text === undefined ? '' : String(text));
  return applyBoldLabelBeforeTyping(source);
}

function addMessage(role, text, options = {}) {
  const row = document.createElement('div');
  row.className = `sd-row ${role}`;

  const bubble = document.createElement('div');
  bubble.className = `sd-msg ${role}`;
  const textValue = formatChatGptVipAccessText(text || '');
  const hasImages = Array.isArray(options.images) && options.images.length > 0;
  const hasFiles = Array.isArray(options.files) && options.files.length > 0;

  if (!hasImages) {
    bubble.textContent = textValue;
  }

  if (hasImages) {
    if (role === 'user') bubble.classList.add('is-media-post');
    if (role === 'user') row.classList.add('has-media');
    const imageBox = document.createElement('div');
    imageBox.className = 'sd-msg-images';
    options.images.forEach((src) => {
      const img = document.createElement('img');
      img.className = 'sd-msg-image';
      img.src = src;
      img.alt = 'attachment';
      img.addEventListener('click', () => openLightbox(src));
      imageBox.appendChild(img);
    });
    if (role === 'user') {
      bubble.prepend(imageBox);
      if (textValue && textValue !== '[attachment]') {
        const textEl = document.createElement('div');
        textEl.className = 'sd-msg-text';
        textEl.textContent = textValue;
        bubble.appendChild(textEl);
      }
    } else {
      bubble.appendChild(imageBox);
    }
  }

  if (hasFiles) {
    const fileBox = document.createElement('div');
    fileBox.className = 'sd-msg-files';
    options.files.forEach((fileItem) => {
      const normalized = normalizeMessageFileItem(fileItem);
      const chip = normalized.url ? document.createElement('a') : document.createElement('span');
      chip.className = 'sd-msg-file';
      chip.textContent = normalized.name;
      if (normalized.url && chip instanceof HTMLAnchorElement) {
        chip.href = normalized.url;
        chip.target = '_blank';
        chip.rel = 'noopener noreferrer';
        chip.classList.add('is-clickable');
      }
      fileBox.appendChild(chip);
    });
    bubble.appendChild(fileBox);
  }

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  if (options.autoScroll !== false) queueAutoScrollToBottom(Boolean(options.forceScroll));
  return row;
}

function formatTimeLabel(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const timeAmPm = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const now = new Date();
  const isToday = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  if (isToday) return `${timeAmPm} Today`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${timeAmPm} ${dd}/${mm}/${yyyy}`;
}

function addQuestionTimeLabel(value) {
  const labelText = formatTimeLabel(value);
  if (!labelText) return;
  const last = messagesEl.lastElementChild;
  if (last?.classList?.contains('sd-time-label') && last.textContent === labelText) return;
  const label = document.createElement('div');
  label.className = 'sd-time-label';
  label.textContent = labelText;
  messagesEl.appendChild(label);
}

function isLikelyImageAttachment(attachment) {
  if (!attachment || typeof attachment !== 'object') return false;
  const kind = String(attachment.kind || '').toLowerCase();
  const mime = String(attachment.mimeType || attachment.mime || '').toLowerCase();
  const name = String(attachment.name || '').toLowerCase();
  if (kind === 'image') return true;
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/.test(name);
}

function getAttachmentImageSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';
  const candidates = [
    attachment.previewDataUrl,
    attachment.previewUrl,
    attachment.mediaUrl,
    attachment.imageDataUrl,
    attachment.dataUrl,
    attachment.imageUrl,
    attachment.url,
    attachment.src
  ];
  for (const value of candidates) {
    const src = typeof value === 'string' ? value.trim() : '';
    if (src) return src;
  }
  return '';
}

function collectHistoryImages(message, attachments) {
  const imageSources = [];

  if (Array.isArray(message?.metadata?.images)) {
    message.metadata.images.forEach((value) => {
      const src = typeof value === 'string' ? value.trim() : '';
      if (src) imageSources.push(src);
    });
  }

  attachments.forEach((attachment) => {
    if (!isLikelyImageAttachment(attachment)) return;
    const src = getAttachmentImageSrc(attachment);
    if (src) imageSources.push(src);
  });

  return Array.from(new Set(imageSources));
}

function getAttachmentFileSrc(attachment) {
  if (!attachment || typeof attachment !== 'object') return '';
  const candidates = [
    attachment.mediaUrl,
    attachment.fileUrl,
    attachment.documentUrl,
    attachment.url,
    attachment.src
  ];
  for (const value of candidates) {
    const src = typeof value === 'string' ? value.trim() : '';
    if (src) return src;
  }
  return '';
}

function normalizeMessageFileItem(fileItem) {
  if (fileItem && typeof fileItem === 'object') {
    const name = fixMojibakeText(String(fileItem.name || fileItem.fileName || '')).trim() || 'attachment';
    const url = typeof fileItem.url === 'string' ? fileItem.url.trim() : '';
    return { name, url };
  }
  return { name: fixMojibakeText(String(fileItem || '')).trim() || 'attachment', url: '' };
}

function getChatTitleFromText(text) {
  const normalized = fixMojibakeText(String(text || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized === '[attachment]') return 'Attachment chat';
  const title = normalized.length > 44 ? `${normalized.slice(0, 44)}...` : normalized;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function capitalizeFirst(text) {
  const value = fixMojibakeText(String(text || '')).trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDisplayUsername(username) {
  const raw = fixMojibakeText(String(username || '')).trim();
  if (!raw) return '@unknown';
  const withoutLeadingAt = raw.replace(/^@+/, '');
  const withoutDomain = withoutLeadingAt.replace(/@singae\.vn$/i, '');
  const base = withoutDomain || withoutLeadingAt || raw;
  return `@${base}`;
}

function renderYourChats(conversation) {
  if (!chatListEl) return;
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const userMessages = messages.filter((m) => (m?.role || '').toLowerCase() === 'user');
  const latest = userMessages.slice(-18).reverse();
  chatListEl.innerHTML = '';
  if (latest.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sd-chat-empty';
    empty.textContent = 'No chats yet';
    chatListEl.appendChild(empty);
    return;
  }
  latest.forEach((message) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'sd-chat-item';
    item.innerHTML = `<span class="sd-chat-item-text">${escapeHtml(getChatTitleFromText(message?.text))}</span>`;
    if (message?.id) item.dataset.messageId = message.id;
    item.addEventListener('click', () => {
      const id = item.dataset.messageId;
      if (!id) return;
      const targetRow = messagesEl.querySelector(`.sd-row[data-message-id="${id}"]`);
      if (targetRow) {
        stickToBottom = false;
        const targetTop = targetRow.offsetTop - (messagesEl.clientHeight * 0.35);
        smoothScrollMessagesTo(targetTop);
      }
    });
    chatListEl.appendChild(item);
  });
}

function addTypingBubble() {
  const row = addMessage('bot', '');
  const bubble = row.querySelector('.sd-msg');
  bubble.classList.add('typing');
  bubble.innerHTML = '<div class="sd-typing-dots"><span></span><span></span><span></span></div>';
  return row;
}

function ensureTypingCaret(bubble) {
  if (!bubble) return;
  const existingCaret = bubble.querySelector('.sd-stream-caret');
  if (existingCaret) return;
  const caret = document.createElement('span');
  caret.className = 'sd-stream-caret';
  caret.setAttribute('aria-hidden', 'true');
  bubble.appendChild(caret);
}

function clearTypingCaret(bubble) {
  if (!bubble) return;
  const caret = bubble.querySelector('.sd-stream-caret');
  if (caret) caret.remove();
}

function extractTypingTextFromHtml(htmlText) {
  const source = String(htmlText || '').trim();
  if (!source) return '';
  const temp = document.createElement('div');
  temp.innerHTML = source;
  const text = String(temp.textContent || temp.innerText || '')
    .replace(/\r\n/g, '\n');
  return text;
}

function renderTypingPlainTextHtml(text) {
  const safe = escapeHtml(String(text || ''))
    .replace(/\n/g, '<br>');
  return `<p>${safe}</p>`;
}

function applyBoldLabelBeforeTyping(text) {
  const source = String(text || '');
  if (!source) return '';
  return source
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (line.includes('**')) return line;
      if (/^\*\*[^*]+?\*\*:\s*/.test(trimmed)) return line;
      if (/^\*\*[^*]+?:\*\*\s*/.test(trimmed)) return line;
      const listPrefix = /^\s*(?:[-*•]\s+|\d+\.\s+)?/;
      if (new RegExp(`${listPrefix.source}\\*\\*[^*]+?\\*\\*:`).test(line)) return line;
      if (new RegExp(`${listPrefix.source}\\*\\*[^*]+?:\\*\\*`).test(line)) return line;
      return line.replace(
        /^(\s*(?:[-*•]\s+|\d+\.\s+)?)([A-Za-zÀ-ỹ0-9][A-Za-zÀ-ỹ0-9\s/._-]{1,70}:)/,
        '$1**$2**'
      );
    })
    .join('\n');
}

async function animateBotText(bubble, fullText) {
  bubble.classList.add('is-typing-stream');
  try {
    const rawText = formatChatGptVipAccessText(
      typeof fullText === 'string'
        ? fullText
        : (fullText === null || fullText === undefined ? '' : String(fullText))
    );
    if (!rawText.trim()) {
      bubble.textContent = '';
      return;
    }
    const total = rawText.length;
    let index = 0;
    const minDuration = 900;
    const maxDuration = 4200;
    const targetDuration = Math.min(maxDuration, Math.max(minDuration, total * 24));
    const frameDelay = 22;
    const frameCount = Math.max(1, Math.ceil(targetDuration / frameDelay));
    const charsPerFrame = Math.max(1, Math.ceil(total / frameCount));

    while (index < total) {
      index = Math.min(total, index + charsPerFrame);
      bubble.textContent = rawText.slice(0, index);
      queueAutoScrollToBottom();
      await new Promise((resolve) => setTimeout(resolve, frameDelay));
    }

    bubble.textContent = rawText;
    queueAutoScrollToBottom(true);
  } finally {
    bubble.classList.remove('is-typing-stream');
  }
}

async function api(method, url, payload) {
  const bodyPayload = payload && typeof payload === 'object'
    ? { ...payload, username: payload.username || chatGptVipAccessAuth?.username }
    : payload;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: bodyPayload ? JSON.stringify(bodyPayload) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiMultipart(url, formData) {
  if (chatGptVipAccessAuth?.username && formData) {
    const hasMethod = typeof formData.has === 'function';
    const appendMethod = typeof formData.append === 'function';
    if (hasMethod && appendMethod) {
      if (!formData.has('username')) formData.append('username', chatGptVipAccessAuth.username);
    } else if (appendMethod) {
      formData.append('username', chatGptVipAccessAuth.username);
    }
  }
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function searchChatGptVipAccessDatabaseContext(question) {
  const query = String(question || '').trim();
  if (!useChatGptVipAccessDatabase || !query) return '';
  try {
    const result = await api('POST', '/api/singae-assistant/knowledge-search', {
      question: query,
      useKnowledgeBase: true
    });
    return String(result?.context || '').trim();
  } catch (error) {
    console.warn('ChatGptVipAccess knowledge search failed:', error?.message || error);
    return '';
  }
}

function extractLookupAccountCode(question) {
  const input = String(question || '').trim();
  if (!input) return '';
  const normalized = input.replace(/[\s_-]+/g, '');
  const match = normalized.match(LOOKUP_ACCOUNT_CODE_REGEX);
  if (!match) return '';
  return String(match[0] || '').toUpperCase();
}

function formatLookupJsonAnswer(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const formatted = {
    success: Boolean(source?.success),
    cached: Boolean(source?.cached),
    response: source?.response ?? {},
    quota: source?.quota ?? {}
  };
  if (!formatted.success) {
    formatted.error = String(source?.error || source?.message || 'Lookup failed.');
    if (source?.accountCode) formatted.accountCode = String(source.accountCode);
  }
  try {
    return `\`\`\`json\n${JSON.stringify(formatted, null, 2)}\n\`\`\``;
  } catch (_) {
    return `\`\`\`json\n${String(formatted || "{}")}\n\`\`\``;
  }
}

function sanitizeLookupPhone(input) {
  return String(input || '').trim().replace(/[^\d+]/g, '');
}

function addLookupPhone(value, targetSet) {
  if (!targetSet) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => addLookupPhone(entry, targetSet));
    return;
  }
  if (!value) return;
  const cleaned = sanitizeLookupPhone(value);
  if (cleaned) targetSet.add(cleaned);
}

function collectLookupPhonesDeep(node, targetSet, seen = new WeakSet()) {
  if (!node || !targetSet || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  for (const [key, value] of Object.entries(node)) {
    if (typeof key === 'string' && /phone|mobile|tel|zalo/i.test(key)) {
      addLookupPhone(value, targetSet);
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectLookupPhonesDeep(entry, targetSet, seen));
    } else if (value && typeof value === 'object') {
      collectLookupPhonesDeep(value, targetSet, seen);
    }
  }
}

function pickLookupBestAccount(responsePayload) {
  const root = responsePayload?.response || responsePayload || {};
  const list = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(root?.accounts)
      ? root.accounts
      : Array.isArray(root)
        ? root
        : [];
  if (list.length > 0 && list[0] && typeof list[0] === 'object') return list[0];
  if (root && typeof root === 'object') return root;
  return {};
}

function extractLookupSummary(responsePayload, fallbackCode = '') {
  const root = responsePayload?.response || responsePayload || {};
  const account = pickLookupBestAccount(responsePayload);
  const accountCode = String(
    account?.account_code ||
      account?.code ||
      root?.account_code ||
      root?.accountCode ||
      fallbackCode ||
      ''
  ).trim().toUpperCase();
  const accountName = String(
    account?.account_name ||
      account?.name ||
      account?.full_name ||
      account?.first_name ||
      root?.account_name ||
      root?.name ||
      ''
  ).trim();
  const phones = new Set();
  addLookupPhone(account?.phone_office, phones);
  if (Array.isArray(account?.contacts)) {
    account.contacts.forEach((contact) => {
      addLookupPhone(contact?.phone_home, phones);
      collectLookupPhonesDeep(contact, phones);
    });
  }
  collectLookupPhonesDeep(account, phones);
  collectLookupPhonesDeep(root, phones);
  return {
    accountCode,
    accountName,
    phones: Array.from(phones)
  };
}

async function queryLookupAccount(accountCode) {
  const response = await fetch('/api/singae-assistant/lookup/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: activeConversationUsername || chatGptVipAccessAuth?.username || '',
      accountCode
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
  }
  return body;
}

function clearAttachedFiles() {
  attachedFiles.forEach((item) => {
    if (item.localUrl) URL.revokeObjectURL(item.localUrl);
  });
  attachedFiles.length = 0;
  refreshAttachmentList();
  if (fileInputEl) fileInputEl.value = '';
}

function refreshAttachmentList() {
  attachmentListEl.innerHTML = '';
  attachedFiles.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'sd-attachment-chip';

    if (item.previewUrl) {
      const thumb = document.createElement('img');
      thumb.src = item.previewUrl;
      thumb.alt = fixMojibakeText(item.file.name);
      chip.appendChild(thumb);
    }

    const label = document.createElement('span');
    label.textContent = `${fixMojibakeText(item.file.name)} (${Math.max(1, Math.round(item.file.size / 1024))}KB)`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', () => {
      if (item.localUrl) URL.revokeObjectURL(item.localUrl);
      attachedFiles.splice(index, 1);
      refreshAttachmentList();
    });

    chip.appendChild(label);
    chip.appendChild(removeBtn);
    attachmentListEl.appendChild(chip);
  });
}

function pushFiles(fileList) {
  const next = Array.from(fileList || []);
  next.forEach((file) => {
    if (attachedFiles.length >= 8) return;
    const isImage = String(file.type || '').startsWith('image/');
    const localUrl = URL.createObjectURL(file);
    attachedFiles.push({
      file,
      isImage,
      localUrl,
      previewUrl: isImage ? localUrl : ''
    });
  });
  refreshAttachmentList();
}

function autoResizePrompt() {
  promptEl.style.height = '0px';
  promptEl.style.height = `${Math.min(170, Math.max(40, promptEl.scrollHeight))}px`;
}

function renderConversation(conversation) {
  currentConversationCache = {
    ...(conversation || {}),
    messages: Array.isArray(conversation?.messages) ? [...conversation.messages] : []
  };
  messagesEl.innerHTML = '';
  if (emptyStateEl) messagesEl.appendChild(emptyStateEl);

  const msgs = currentConversationCache.messages || [];
  if (msgs.length > 0) enterChatMode();
  else enterIntroMode();

  msgs.forEach((m) => {
    const role = (m.role || (m.direction === 'outgoing' ? 'assistant' : 'user')) === 'assistant' ? 'bot' : 'user';
    if (role === 'user') addQuestionTimeLabel(m?.createdAt);
    const attachments = Array.isArray(m?.metadata?.attachments) ? m.metadata.attachments : [];
    const images = collectHistoryImages(m, attachments);
    const files = attachments
      .filter((a) => {
        if (!a || !a.name) return false;
        if (!isLikelyImageAttachment(a)) return true;
        if (images.length === 0) return true;
        const src = getAttachmentImageSrc(a);
        if (!src) return true;
        if (images.includes(src)) return false;
        return true;
      })
      .map((a) => ({
        name: a.name,
        url: getAttachmentFileSrc(a)
      }));
    const row = addMessage(role, m.text || '', { richText: false, images, files, autoScroll: false });
    if (row && m?.id) row.dataset.messageId = String(m.id);
  });

  renderYourChats(conversation);
  queueAutoScrollToBottom(true);
  updateTopTitleVisibility();
}

function buildChatGptVipAccessRequestHistory(limit = 18) {
  const messages = Array.isArray(currentConversationCache?.messages) ? currentConversationCache.messages : [];
  const normalized = messages
    .map((item) => {
      const roleRaw = String(item?.role || '').trim().toLowerCase();
      const role = roleRaw === 'assistant' ? 'assistant' : roleRaw === 'user' ? 'user' : '';
      const content = String(item?.text || '').trim();
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean);
  if (normalized.length <= limit) return normalized;
  return normalized.slice(-limit);
}

async function loadConversation() {
  try {
    const uname = encodeURIComponent(activeConversationUsername || chatGptVipAccessAuth?.username || '');
    const data = await api('GET', `/api/singae-assistant/conversation?username=${uname}`);
    renderConversation(data.conversation);
  } catch (error) {
    console.error(error);
  }
  lastMessagesScrollTop = messagesEl.scrollTop;
}

async function startNewChat() {
  if (!newChatEl) return;
  if (isAdminViewingOtherConversation()) return;
  newChatEl.disabled = true;
  try {
    const uname = encodeURIComponent(activeConversationUsername || chatGptVipAccessAuth?.username || '');
    const data = await api('DELETE', `/api/singae-assistant/messages?username=${uname}`);
    renderConversation(data?.conversation || { messages: [] });
  } catch (error) {
    console.error(error);
    addMessage('bot', `Error: ${error.message}`);
  } finally {
    newChatEl.disabled = false;
  }
}

function getStoredAuth() {
  try {
    const raw = localStorage.getItem(CHAT_GPT_VIP_ACCESS_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = String(parsed?.username || '').trim().toLowerCase();
    const token = String(parsed?.token || '').trim();
    const role = String(parsed?.role || 'user').trim().toLowerCase();
    const autoLogin = Boolean(parsed?.autoLogin);
    const savedDay = String(parsed?.dayKey || localStorage.getItem(CHAT_GPT_VIP_ACCESS_AUTH_DAY_KEY) || '').trim();
    const todayDay = getLocalDateKey();
    if (!username || !token || !autoLogin) return null;
    if (!savedDay || savedDay !== todayDay) {
      setStoredAuth(null);
      return null;
    }
    return { username, token, role, autoLogin };
  } catch (_) {
    return null;
  }
}

function setStoredAuth(auth) {
  try {
    if (!auth) {
      localStorage.removeItem(CHAT_GPT_VIP_ACCESS_AUTH_KEY);
      localStorage.removeItem(CHAT_GPT_VIP_ACCESS_AUTH_DAY_KEY);
    } else {
      localStorage.setItem(CHAT_GPT_VIP_ACCESS_AUTH_KEY, JSON.stringify({ ...auth, dayKey: getLocalDateKey() }));
      localStorage.setItem(CHAT_GPT_VIP_ACCESS_AUTH_DAY_KEY, getLocalDateKey());
    }
  } catch (_) {}
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAutoLoginPref() {
  try {
    return String(localStorage.getItem(CHAT_GPT_VIP_ACCESS_AUTOLOGIN_PREF_KEY) || '').trim().toLowerCase() === 'true';
  } catch (_) {
    return false;
  }
}

function setAutoLoginPref(enabled) {
  try {
    localStorage.setItem(CHAT_GPT_VIP_ACCESS_AUTOLOGIN_PREF_KEY, enabled ? 'true' : 'false');
  } catch (_) {}
}

function setAutoLoginChecked(enabled, persist = true) {
  const checked = Boolean(enabled);
  if (loginAutoLoginEl) loginAutoLoginEl.checked = checked;
  if (loginAutoLoginWrapEl) loginAutoLoginWrapEl.classList.toggle('is-checked', checked);
  if (persist) setAutoLoginPref(checked);
}

function showLoginError(message) {
  if (!loginErrorEl) return;
  loginErrorEl.hidden = false;
  loginErrorEl.classList.remove('is-visible');
  void loginErrorEl.offsetWidth;
  loginErrorEl.classList.add('is-visible');
  loginErrorEl.textContent = String(message || 'Login failed.');
}

function setLoginLoading(loading, options = {}) {
  const disableSubmit = options.disableSubmit !== false;
  const message = String(options.message || 'Loading Trợ lý SINGAE data...');
  if (loginLoadingEl) {
    loginLoadingEl.hidden = !loading;
    if (loading) loginLoadingEl.textContent = message;
  }
  if (loginSubmitEl) loginSubmitEl.disabled = loading && disableSubmit;
}

function updateUserBadge() {
  if (!userBadgeEl && !menuUserTitleEl) return;
  const username = String(chatGptVipAccessAuth?.username || '').trim().toLowerCase();
  if (!username) {
    if (userBadgeEl) {
      userBadgeEl.hidden = true;
      userBadgeEl.textContent = '';
    }
    if (menuUserTitleEl) {
      menuUserTitleEl.hidden = true;
      menuUserTitleEl.textContent = '';
    }
    return;
  }
  const displayName = formatDisplayUsername(username);
  const showFloatingBadge = isHostWindowMaximized();
  if (userBadgeEl) {
    userBadgeEl.textContent = displayName;
    userBadgeEl.hidden = !showFloatingBadge;
  }
  if (menuUserTitleEl) {
    menuUserTitleEl.textContent = displayName;
    menuUserTitleEl.hidden = false;
  }
}

function renderAdminUserList(users = []) {
  if (!adminUserListEl) return;
  adminUserListEl.innerHTML = '';
  if (!Array.isArray(users) || users.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sd-chat-empty';
    empty.textContent = 'No user chats';
    adminUserListEl.appendChild(empty);
    return;
  }
  const ownUser = String(chatGptVipAccessAuth?.username || '').toLowerCase();
  const ownData = users.find((u) => String(u?.username || '').toLowerCase() === ownUser) || { username: ownUser, messageCount: 0 };
  const mergedUsers = [ownData, ...users.filter((u) => String(u?.username || '').toLowerCase() !== ownUser)];
  if (!activeConversationUsername) activeConversationUsername = ownUser;
  const existsActive = mergedUsers.some((u) => String(u?.username || '').toLowerCase() === String(activeConversationUsername || '').toLowerCase());
  if (!existsActive) activeConversationUsername = ownUser;
  mergedUsers.forEach((user) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sd-chat-item sd-all-chat-item';
    const uname = String(user?.username || '').toLowerCase();
    if (uname === String(activeConversationUsername || '').toLowerCase()) {
      btn.classList.add('is-active');
    }
    btn.innerHTML = `
      <span class="sd-chat-item-text">${escapeHtml(capitalizeFirst(uname || 'unknown'))}</span>
      <span class="sd-all-chat-meta">
        <span class="sd-all-chat-count">${Number(user?.messageCount || 0)}</span>
        ${adminPendingUsers.has(uname) && uname !== String(activeConversationUsername || '').toLowerCase()
          ? '<span class="sd-all-chat-new" aria-label="New message"></span>'
          : ''}
      </span>
    `;
    btn.addEventListener('click', async () => {
      activeConversationUsername = uname;
      adminPendingUsers.delete(uname);
      renderAdminUserList(users);
      await loadConversation();
      applyConversationPermissionState();
    });
    adminUserListEl.appendChild(btn);
  });
}

async function loadAdminUsersBlock() {
  if (!adminUsersGroupEl || !adminUserListEl) return;
  const isAdmin = isAdminUser();
  if (yourChatsGroupEl) yourChatsGroupEl.hidden = isAdmin;
  syncAdminMenuVisibility();
  adminUsersGroupEl.hidden = !isAdmin;
  if (!isAdmin) return;
  try {
    const data = await api('GET', `/api/singae-assistant/conversations-all?username=${encodeURIComponent(chatGptVipAccessAuth?.username || '')}`);
    renderAdminUserList(Array.isArray(data?.users) ? data.users : []);
  } catch (error) {
    console.error(error);
  }
}

async function bootChatGptVipAccessAfterLogin() {
  updateUserBadge();
  setLoginLoading(true);
  activeConversationUsername = String(chatGptVipAccessAuth?.username || '').toLowerCase();
  await loadConversation();
  await loadAdminUsersBlock();
  installAdminGlobalEvents();
  applyConversationPermissionState();
  setDbSwitchState(getStoredDbSwitch(), false);
  if (loginViewEl) {
    loginViewEl.classList.add('is-hiding');
    setTimeout(() => {
      loginViewEl.classList.remove('is-visible');
      loginViewEl.setAttribute('aria-hidden', 'true');
      loginViewEl.classList.remove('is-hiding');
      setLoginLoading(false);
    }, 440);
  } else {
    setLoginLoading(false);
  }
}

async function bootChatGptVipAccessAfterLoginWithOptions(options = {}) {
  const skipLoginTransition = Boolean(options.skipLoginTransition);
  updateUserBadge();
  setLoginLoading(true);
  activeConversationUsername = String(chatGptVipAccessAuth?.username || '').toLowerCase();
  await loadConversation();
  await loadAdminUsersBlock();
  installAdminGlobalEvents();
  applyConversationPermissionState();
  setDbSwitchState(getStoredDbSwitch(), false);
  if (skipLoginTransition) {
    if (loginViewEl) {
      loginViewEl.classList.remove('is-visible');
      loginViewEl.classList.remove('is-hiding');
      loginViewEl.setAttribute('aria-hidden', 'true');
    }
    setLoginLoading(false);
    return;
  }
  await bootChatGptVipAccessAfterLogin();
}

function logoutChatGptVipAccess() {
  // ChatGptVipAccess no longer owns auth. Use main desktop session logout.
  try {
    if (window.parent && window.parent !== window && typeof window.parent.desktopShellLogout === 'function') {
      window.parent.desktopShellLogout();
      return;
    }
  } catch (_) {}
  window.location.href = '/';
}

async function callAdminAccountsApi(endpoint, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

async function openAdminAccountManager() {
  if (!isAdminUser()) return;
  const adminUsername = String(chatGptVipAccessAuth?.username || '').trim().toLowerCase();
  const adminPassword = String(window.prompt('Nhap mat khau admin de quan ly tai khoan:') || '').trim();
  if (!adminPassword) return;
  try {
    const listResult = await callAdminAccountsApi('/api/singae-assistant/admin/accounts/list', {
      adminUsername,
      adminPassword
    });
    const userLines = Array.isArray(listResult?.users)
      ? listResult.users.map((u) => `- ${formatDisplayUsername(String(u?.username || ''))}`).join('\n')
      : '(khong co)';
    const action = String(
      window.prompt(
        `Tai khoan hien co:\n${userLines}\n\nChon thao tac:\n1 = Them/doi mat khau user\n2 = Doi mat khau admin`
      ) || ''
    ).trim();
    if (action === '1') {
      const username = String(window.prompt('Nhap username can them/doi mat khau:') || '').trim().toLowerCase();
      if (!username) return;
      const password = String(window.prompt(`Nhap mat khau moi cho ${formatDisplayUsername(username)}:`) || '').trim();
      if (!password) return;
      await callAdminAccountsApi('/api/singae-assistant/admin/accounts/upsert', {
        adminUsername,
        adminPassword,
        username,
        password
      });
      alert(`Da luu tai khoan: ${formatDisplayUsername(username)}`);
      return;
    }
    if (action === '2') {
      const newPassword = String(window.prompt('Nhap mat khau admin moi:') || '').trim();
      if (!newPassword) return;
      await callAdminAccountsApi('/api/singae-assistant/admin/accounts/change-admin-password', {
        adminUsername,
        adminPassword,
        newPassword
      });
      alert('Da doi mat khau admin thanh cong.');
      return;
    }
    alert('Da huy thao tac.');
  } catch (error) {
    alert(`Khong the quan ly tai khoan: ${error?.message || error}`);
  }
}

async function verifyChatGptVipAccessAccount(username, password) {
  const data = await fetch('/api/singae-assistant/verify-account', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  });
  return {
    username: String(data?.username || username || '').trim().toLowerCase(),
    token: String(data?.token || '').trim(),
    role: String(data?.role || 'user').trim().toLowerCase()
  };
}

const WIN_SHELL_ME_API = '/api/windowsshell/auth/me';
async function bootstrapWithWindowsShellAuth() {
  // Tools no longer have their own login screens.
  // They reuse the main desktop session cookie from windowsshell.
  try {
    const res = await fetch(WIN_SHELL_ME_API, { credentials: 'include' });
    if (!res.ok) throw new Error('NOT_AUTHENTICATED');
    const payload = await res.json().catch(() => ({}));
    const user = payload?.user || null;
    if (!user?.username) throw new Error('NOT_AUTHENTICATED');
    chatGptVipAccessAuth = {
      username: String(user.username || '').trim().toLowerCase(),
      token: '',
      role: String(user.role || 'member').trim().toLowerCase(),
      autoLogin: false
    };
    try { setStoredAuth(null); } catch (_) {}
    try { setAutoLoginPref(false); } catch (_) {}
    try {
      if (loginViewEl) {
        loginViewEl.classList.remove('is-visible', 'is-hiding');
        loginViewEl.setAttribute('aria-hidden', 'true');
      }
    } catch (_) {}
    await bootChatGptVipAccessAfterLoginWithOptions({ skipLoginTransition: true });
  } catch (_) {
    window.location.href = '/';
  }
}

function installLoginFlow() {
  if (!loginViewEl || !loginFormEl) return;
  const stored = getStoredAuth();
  const preferredAutoLogin = getAutoLoginPref();
  if (stored && (preferredAutoLogin || stored?.autoLogin)) {
    chatGptVipAccessAuth = stored;
    setAutoLoginChecked(true, false);
    bootChatGptVipAccessAfterLoginWithOptions({ skipLoginTransition: true }).catch((error) => {
      chatGptVipAccessAuth = null;
      showLoginError(error?.message || 'Auto login failed.');
      setLoginLoading(false, { disableSubmit: false });
      loginViewEl.classList.add('is-visible');
      loginViewEl.setAttribute('aria-hidden', 'false');
    });
    return;
  }

  const stopAutoLoginCountdown = () => {
    if (autoLoginCountdownTimer) {
      clearInterval(autoLoginCountdownTimer);
      autoLoginCountdownTimer = 0;
    }
  };

  const startAutoLoginCountdown = (delayMs) => {
    stopAutoLoginCountdown();
    const startedAt = Date.now();
    const render = () => {
      const elapsed = Date.now() - startedAt;
      const leftMs = Math.max(0, delayMs - elapsed);
      const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
      setLoginLoading(true, {
        disableSubmit: false,
        message: `Auto login in ${leftSec}s - click Login or edit credentials to cancel.`
      });
    };
    render();
    autoLoginCountdownTimer = setInterval(() => {
      if (!autoLoginPending) {
        stopAutoLoginCountdown();
        return;
      }
      render();
    }, 250);
  };

  const clearAutoLoginPending = () => {
    if (!autoLoginPending) return;
    autoLoginPending = false;
    if (autoLoginTimer) {
      clearTimeout(autoLoginTimer);
      autoLoginTimer = 0;
    }
    stopAutoLoginCountdown();
    setLoginLoading(false, { disableSubmit: false });
  };

  loginViewEl.classList.add('is-visible');
  loginViewEl.setAttribute('aria-hidden', 'false');
  setAutoLoginChecked(Boolean(preferredAutoLogin || stored?.autoLogin), false);

  const interruptAutoLogin = () => {
    clearAutoLoginPending();
  };
  loginUsernameEl?.addEventListener('input', interruptAutoLogin);
  loginPasswordEl?.addEventListener('input', () => {
    if (String(loginPasswordEl?.value || '') !== CHAT_GPT_VIP_ACCESS_FAKE_PASSWORD) interruptAutoLogin();
  });
  loginUsernameEl?.addEventListener('focus', interruptAutoLogin);
  loginPasswordEl?.addEventListener('focus', interruptAutoLogin);
  loginAutoLoginEl?.addEventListener('change', () => {
    setAutoLoginChecked(Boolean(loginAutoLoginEl?.checked), true);
    if (!loginAutoLoginEl.checked) interruptAutoLogin();
  });

  loginFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAutoLoginPending();
    if (loginErrorEl) {
      loginErrorEl.hidden = true;
      loginErrorEl.classList.remove('is-visible');
    }
    const username = String(loginUsernameEl?.value || '').trim().toLowerCase();
    const password = String(loginPasswordEl?.value || '');
    const autoLogin = Boolean(loginAutoLoginEl?.checked);
    setAutoLoginChecked(autoLogin, true);
    if (!username || !password) {
      showLoginError('Please enter username and password.');
      return;
    }
    try {
      setLoginLoading(true);
      const auth = await verifyChatGptVipAccessAccount(username, password);
      chatGptVipAccessAuth = auth;
      if (autoLogin) setStoredAuth({ ...auth, autoLogin: true });
      else setStoredAuth(null);
      await bootChatGptVipAccessAfterLogin();
      if (loginPasswordEl) loginPasswordEl.value = '';
    } catch (error) {
      showLoginError(error.message || 'Login failed.');
      setLoginLoading(false);
    }
  });

  if (loginUsernameEl) loginUsernameEl.value = '';
  if (loginPasswordEl) loginPasswordEl.value = '';
}

async function uploadChatGptVipAccessDatabaseFromXlsx(file) {
  if (!file) return;
  const name = String(file.name || "").toLowerCase();
  if (!(name.endsWith(".xlsx") || name.endsWith(".xls"))) {
    alert("Vui long chon file XLSX/XLS.");
    return;
  }

  if (uploadDbEl) uploadDbEl.disabled = true;
  try {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const data = await apiMultipart("/api/singae-assistant/import/xlsx", formData);
    const sheetCount = Array.isArray(data?.sheetTopics) ? data.sheetTopics.length : 0;
    const entryCount = Number(data?.entries || 0);
    alert(`Import database thanh cong.\nSheets: ${sheetCount}\nEntries: ${entryCount}`);
  } catch (error) {
    alert(`Import database that bai: ${error.message}`);
  } finally {
    if (uploadDbEl) uploadDbEl.disabled = false;
    if (dbUploadInputEl) dbUploadInputEl.value = "";
  }
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isAdminViewingOtherConversation()) return;
  const question = promptEl.value.trim();
  if (!question && attachedFiles.length === 0) return;

  enterChatMode();
  animateHideTopTitle();
  setComposerHiddenByScroll(false);

  const imagePreviewUrls = attachedFiles.filter((item) => item.isImage).map((item) => item.previewUrl);
  const fileNames = attachedFiles.filter((item) => !item.isImage).map((item) => ({
    name: item.file.name,
    url: item.localUrl || ''
  }));

  promptEl.value = '';
  autoResizePrompt();
  addQuestionTimeLabel(new Date());
  addMessage('user', question || '[attachment]', { images: imagePreviewUrls, files: fileNames });
  stickToBottom = true;
  queueAutoScrollToBottom(true);

  const typingRow = addTypingBubble();
  stickToBottom = true;
  queueAutoScrollToBottom(true);
  currentConversationCache.messages.push({
    id: `local-user-${Date.now()}`,
    role: 'user',
    direction: 'incoming',
    text: question || '[attachment]',
    createdAt: new Date().toISOString(),
    metadata: {}
  });
  emitLocalMessageEvent('user_sent', { username: activeConversationUsername || chatGptVipAccessAuth?.username || '' });
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    const lookupAccountCode = extractLookupAccountCode(question);
    let answerText = '';
    if (lookupAccountCode) {
      try {
        const lookupPayload = await queryLookupAccount(lookupAccountCode);
        answerText = formatLookupJsonAnswer(lookupPayload);
      } catch (lookupError) {
        answerText = formatLookupJsonAnswer({
          success: false,
          accountCode: lookupAccountCode,
          error: String(lookupError?.message || lookupError || 'Lookup failed.')
        });
      }
      await api('POST', '/api/singae-assistant/local-json-reply', {
        question: question || '[lookup]',
        answer: answerText
      });
    } else {
      const requestHistory = buildChatGptVipAccessRequestHistory();
      // currentConversationCache already contains the local user message just pushed above.
      const historyWithoutCurrentQuestion = requestHistory.length > 0 ? requestHistory.slice(0, -1) : [];
      const knowledgeContext = await searchChatGptVipAccessDatabaseContext(question);
      let data;
      if (attachedFiles.length > 0) {
        const formData = new FormData();
        formData.append('question', question || 'Please analyze attached files.');
        formData.append('useKnowledgeBase', 'true');
        if (knowledgeContext) {
          formData.append('knowledgeContext', knowledgeContext);
        }
        if (historyWithoutCurrentQuestion.length > 0) {
          formData.append('history', JSON.stringify(historyWithoutCurrentQuestion));
        }
        attachedFiles.forEach((item) => formData.append('files', item.file, item.file.name));
        data = await apiMultipart('/api/singae-assistant/chat-with-files', formData);
        clearAttachedFiles();
      } else {
        data = await api('POST', '/api/singae-assistant/chat', {
          question,
          username: chatGptVipAccessAuth?.username || activeConversationUsername || '',
          useKnowledgeBase: true,
          knowledgeContext,
          history: historyWithoutCurrentQuestion
        });
      }
      answerText = formatChatGptVipAccessText(String(data?.answer || ''));
    }
    if (lookupAccountCode && attachedFiles.length > 0) clearAttachedFiles();

    typingRow.remove();
    await loadConversation();
    emitLocalMessageEvent('assistant_sent', { username: activeConversationUsername || chatGptVipAccessAuth?.username || '' });
  } catch (err) {
    typingRow.remove();
    addMessage('bot', `Error: ${err.message}`);
  }
});

attachBtnEl.addEventListener('click', () => fileInputEl.click());
fileInputEl.addEventListener('change', () => pushFiles(fileInputEl.files));

promptEl.addEventListener('paste', (event) => {
  if (document.activeElement !== promptEl) return;
  const dt = event.clipboardData;
  if (!dt?.items?.length) return;
  const files = [];
  for (const item of dt.items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    event.preventDefault();
    pushFiles(files);
  }
});

if (lightboxEl) {
  lightboxEl.addEventListener('click', (event) => {
    if (event.target === lightboxEl || event.target === lightboxImageEl) {
      closeLightbox();
    }
  });
}
if (lightboxCloseEl) {
  lightboxCloseEl.addEventListener('click', closeLightbox);
}
if (newChatEl) {
  newChatEl.addEventListener('click', startNewChat);
}
if (uploadDbEl && dbUploadInputEl) {
  uploadDbEl.addEventListener('click', () => dbUploadInputEl.click());
  dbUploadInputEl.addEventListener('change', async () => {
    const file = dbUploadInputEl.files?.[0];
    await uploadChatGptVipAccessDatabaseFromXlsx(file);
  });
}
if (dbSwitchEl) {
  dbSwitchEl.addEventListener('click', () => setDbSwitchState(true, false));
}
if (viewDbEl) {
  viewDbEl.addEventListener('click', () => {
    window.open('/api/singae-assistant/knowledge-base', '_blank', 'noopener,noreferrer');
  });
}
if (viewPromptEl) {
  viewPromptEl.addEventListener('click', () => {
    const query = useChatGptVipAccessDatabase ? '1' : '0';
    window.open(`/api/singae-assistant/prompt-file?useKnowledgeBase=${query}`, '_blank', 'noopener,noreferrer');
  });
}
if (manageAccountsEl) {
  manageAccountsEl.addEventListener('click', openAdminAccountManager);
}
if (logoutEl) {
  logoutEl.addEventListener('click', logoutChatGptVipAccess);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeLightbox();
  }
});

promptEl.addEventListener('input', autoResizePrompt);
promptEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    formEl.requestSubmit();
  }
});

installAutoScrollObservers();
autoResizePrompt();
updateTopTitleVisibility();
installLocalMessageEventHandlers();
window.addEventListener('beforeunload', stopAdminGlobalEvents);
bootstrapWithWindowsShellAuth();