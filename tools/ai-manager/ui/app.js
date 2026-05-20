const navItems = document.querySelectorAll('.ai-tab');
const panels = document.querySelectorAll('.ai-panel');
const modalEl = document.getElementById('ai-modal');
const modalTitleEl = document.getElementById('ai-modal-title');
const modalBodyEl = document.getElementById('ai-modal-body');
const modalConfirmBtn = document.getElementById('ai-modal-confirm');
const toastEl = document.getElementById('ai-toast');
const modalCardEl = document.querySelector('.ai-modal-card');

const chatbotPromptsListEl = document.getElementById('chatbot-prompts-list');
const singaePromptsListEl = document.getElementById('singae-prompts-list');
const chatbotKbListEl = document.getElementById('chatbot-kb-list');
const singaeKbListEl = document.getElementById('singae-kb-list');
const chatbotKbSearchEl = document.getElementById('chatbot-kb-search');
const singaeKbSearchEl = document.getElementById('singae-kb-search');

const btnRefreshAll = document.getElementById('btn-refresh-all');
const btnAddChatbotPrompt = document.getElementById('btn-add-chatbot-prompt');
const btnAddChatbotKb = document.getElementById('btn-add-chatbot-kb');
const btnChangeChatModel = document.getElementById('btn-change-chat-model');
const btnChangeLlmProvider = document.getElementById('btn-change-llm-provider');
const btnAddSingaeKb = document.getElementById('btn-add-singae-kb');
const btnAddSingaeInstruction = document.getElementById('btn-add-singae-instruction');
const btnSaveSingaeInstruction = document.getElementById('btn-save-singae-instruction');
const btnResetSingaeInstruction = document.getElementById('btn-reset-singae-instruction');
const btnRefreshSingaeUserHistories = document.getElementById('btn-refresh-singae-user-histories');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logsListEl = document.getElementById('logs-list');
const logsSearchEl = document.getElementById('logs-search');
const lookupListEl = document.getElementById('lookup-list');
const lookupSearchEl = document.getElementById('lookup-search');
const btnRefreshLookup = document.getElementById('btn-refresh-lookup');
const messengerListEl = document.getElementById('messenger-list');
const messengerSearchEl = document.getElementById('messenger-search');
const btnRefreshMessenger = document.getElementById('btn-refresh-messenger');
const btnRefreshCost = document.getElementById('btn-refresh-cost');
const costSummaryEl = document.getElementById('cost-summary');
const costBreakdownEl = document.getElementById('cost-breakdown');
const singaeInstructionEditorEl = document.getElementById('singae-instruction-editor');
const singaeUserHistoryListEl = document.getElementById('singae-user-history-list');
const authMaskEl = document.getElementById('ai-auth-mask');
const authFormEl = document.getElementById('ai-auth-form');
const authUsernameEl = document.getElementById('ai-auth-username');
const authPasswordEl = document.getElementById('ai-auth-password');
const authAutoLoginEl = document.getElementById('ai-auth-autologin');
const authSubmitEl = document.getElementById('ai-auth-submit');
const authErrorEl = document.getElementById('ai-auth-error');

const MODEL_PRICING_PER_MILLION = {
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-2024-05-13': { input: 5.0, output: 15.0 },
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-pro': { input: 15.0, output: 120.0 },
  'gpt-5.2-pro': { input: 21.0, output: 168.0 },
  'gpt-5.1-codex': { input: 1.25, output: 10.0 },
  'gpt-5.1-codex-max': { input: 1.25, output: 10.0 },
  'gpt-5.2-codex': { input: 1.75, output: 14.0 },
  'gpt-realtime': { input: 4.0, output: 16.0 },
  'gpt-realtime-1.5': { input: 4.0, output: 16.0 },
  'gpt-realtime-mini': { input: 0.6, output: 2.4 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  'text-embedding-ada-002': { input: 0.1, output: 0 }
};

let state = {
  chatbotPrompts: [],
  chatbotActivePromptId: null,
  singaePrompts: null,
  chatbotKb: [],
  singaeKb: [],
  singaeInstructionLines: [],
  singaeUserConversations: [],
  usageLogs: [],
  serverLogs: [],
  modalAction: null,
  lastUsageTimestamp: '',
  lastLookupTimestamp: '',
  lastMessengerTimestamp: ''
};
const SINGAE_FEATURE_ENABLED = false;
const CHATBOT_FEATURE_ENABLED = false;
let currentAdminUsername = 'admin';

const AI_MANAGER_UNLOCK_KEY = 'ai_manager_unlocked';
const AI_MANAGER_AUTOLOGIN_KEY = 'ai_manager_autologin_pref';
const AI_MANAGER_ADMIN_USERNAME = 'admin';
const AI_MANAGER_AUTH_KEY = 'ai_manager_auth';
const AI_MANAGER_LAST_SEEN_USAGE_KEY = 'ai_manager_last_seen_usage';
const AI_MANAGER_LAST_SEEN_LOOKUP_KEY = 'ai_manager_last_seen_lookup';
const AI_MANAGER_LAST_SEEN_MESSENGER_KEY = 'ai_manager_last_seen_messenger';
const AI_MANAGER_UNREAD_KEY = 'ai_manager_unread_counts';
if (!SINGAE_FEATURE_ENABLED) {
  document.querySelectorAll('[data-section="singae"]').forEach((el) => { el.style.display = 'none'; });
  const singaePanel = document.getElementById('singae');
  if (singaePanel) singaePanel.style.display = 'none';
}
if (!CHATBOT_FEATURE_ENABLED) {
  document.querySelectorAll('[data-section="chatbot"]').forEach((el) => { el.style.display = 'none'; });
  const chatbotPanel = document.getElementById('chatbot');
  if (chatbotPanel) chatbotPanel.style.display = 'none';
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
}

function getUnreadState() {
  try {
    return JSON.parse(localStorage.getItem(AI_MANAGER_UNREAD_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function setUnreadState(next) {
  try {
    localStorage.setItem(AI_MANAGER_UNREAD_KEY, JSON.stringify(next));
  } catch (_) {}
}

function updateTabBadge(key, count) {
  const badge = document.querySelector(`.ai-tab-badge[data-badge="${key}"]`);
  if (!badge) return;
  const value = Number(count || 0);
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.hidden = value <= 0;
}

function updateUnreadBadges() {
  const unread = getUnreadState();
  const logsCount = Number(unread.logs || 0);
  const lookupCount = Number(unread.lookup || 0);
  const messengerCount = Number(unread.messenger || 0);
  updateTabBadge('logs', logsCount);
  updateTabBadge('lookup', lookupCount);
  updateTabBadge('messenger', messengerCount);
  const total = logsCount + lookupCount + messengerCount;
  try {
    localStorage.setItem('ai_manager_unread_total', String(total));
  } catch (_) {}
}

function incrementUnread(key, amount = 1) {
  const unread = getUnreadState();
  unread[key] = Number(unread[key] || 0) + Number(amount || 0);
  setUnreadState(unread);
  updateUnreadBadges();
}

async function apiFetch(url, options) {
  const normalizedUrl = (() => {
    const raw = String(url || '');
    if (!raw.startsWith('/api/')) return raw;
    if (raw.startsWith('/api/windowsshell/')) return raw;
    if (raw.startsWith('/api/chatbot/')) return raw;
    return `/api/chatbot${raw.slice('/api'.length)}`;
  })();
  const response = await fetch(normalizedUrl, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }
  return data;
}

const WIN_SHELL_ME_API = '/api/windowsshell/auth/me';
async function assertWindowsShellAdmin() {
  const res = await fetch(WIN_SHELL_ME_API, { credentials: 'include' });
  if (!res.ok) throw new Error('NOT_AUTHENTICATED');
  const payload = await res.json().catch(() => ({}));
  const user = payload?.user || null;
  const role = String(user?.role || '').trim().toLowerCase();
  if (!user?.username) throw new Error('NOT_AUTHENTICATED');
  if (role !== 'admin') throw new Error('FORBIDDEN');
  return user;
}

function setAuthLocked(isLocked) {
  if (!authMaskEl) return;
  authMaskEl.classList.toggle('is-visible', isLocked);
  document.body.classList.toggle('ai-auth-lock', isLocked);
  authMaskEl.setAttribute('aria-hidden', isLocked ? 'false' : 'true');
  if (isLocked && authPasswordEl) {
    if (authUsernameEl && !authUsernameEl.value) authUsernameEl.value = AI_MANAGER_ADMIN_USERNAME;
    authPasswordEl.focus();
  }
}

async function attemptAdminLogin() {
  const username = authUsernameEl ? authUsernameEl.value.trim().toLowerCase() : '';
  const password = authPasswordEl ? authPasswordEl.value.trim() : '';
  if (!username) {
    if (authErrorEl) authErrorEl.textContent = 'Vui lòng nhập username.';
    return;
  }
  if (username !== AI_MANAGER_ADMIN_USERNAME) {
    if (authErrorEl) authErrorEl.textContent = 'Chỉ tài khoản admin mới được sử dụng.';
    return;
  }
  if (!password) {
    if (authErrorEl) authErrorEl.textContent = 'Vui lòng nhập mật khẩu.';
    return;
  }
  try {
    const result = await apiFetch('/api/chatbot/verify-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (String(result?.role || '').toLowerCase() !== 'admin') {
      if (authErrorEl) authErrorEl.textContent = 'Chỉ tài khoản admin mới được sử dụng.';
      return;
    }
    localStorage.setItem(AI_MANAGER_UNLOCK_KEY, 'true');
    if (authAutoLoginEl) {
      localStorage.setItem(AI_MANAGER_AUTOLOGIN_KEY, authAutoLoginEl.checked ? 'true' : 'false');
    }
    localStorage.setItem(AI_MANAGER_AUTH_KEY, JSON.stringify({
      username: result?.username || username,
      role: result?.role || 'admin',
      token: result?.token || ''
    }));
    if (authPasswordEl) authPasswordEl.value = '';
    if (authErrorEl) authErrorEl.textContent = '';
    setAuthLocked(false);
  } catch (error) {
    if (authErrorEl) authErrorEl.textContent = 'Sai tài khoản hoặc mật khẩu.';
  }
}

function setActivePanel(id) {
  panels.forEach((panel) => {
    panel.classList.toggle('is-visible', panel.id === id);
  });
  navItems.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.section === id);
  });
  const unread = getUnreadState();
  if (id === 'ai-logs') {
    unread.logs = 0;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_USAGE_KEY, getLatestTimestamp(state.usageLogs, 'createdAt'));
  }
  if (id === 'ai-lookup') {
    unread.lookup = 0;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_LOOKUP_KEY, getLatestTimestamp(getLookupLogs(), 'timestamp'));
  }
  if (id === 'ai-messenger') {
    unread.messenger = 0;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_MESSENGER_KEY, getLatestTimestamp(getMessengerLogs(), 'timestamp'));
  }
  setUnreadState(unread);
  updateUnreadBadges();
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => setActivePanel(btn.dataset.section));
});

function openModal({ title, bodyHtml, onConfirm, wide = false }) {
  if (!modalEl) return;
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = bodyHtml;
  if (modalCardEl) {
    modalCardEl.classList.toggle('is-wide', Boolean(wide));
  }
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
  state.modalAction = onConfirm || null;
}

function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
  modalBodyEl.innerHTML = '';
  if (modalCardEl) modalCardEl.classList.remove('is-wide');
  state.modalAction = null;
}

if (modalEl) {
  modalEl.addEventListener('click', (event) => {
    if (event.target?.dataset?.modalClose === 'true') {
      closeModal();
    }
  });
}

if (modalConfirmBtn) {
  modalConfirmBtn.addEventListener('click', async () => {
    if (!state.modalAction) return;
    await state.modalAction();
  });
}

function renderChatbotPrompts() {
  if (!chatbotPromptsListEl) return;
  if (!state.chatbotPrompts.length) {
    chatbotPromptsListEl.innerHTML = '<div class="ai-card">No prompts found.</div>';
    return;
  }

  chatbotPromptsListEl.innerHTML = state.chatbotPrompts
    .map((prompt) => {
      const isActive = prompt.id === state.chatbotActivePromptId;
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(prompt.title || 'Untitled')}
            ${isActive ? '<span class="ai-card-meta">· Active</span>' : ''}
          </div>
          <div class="ai-card-meta">${escapeHtml((prompt.content || '').slice(0, 160))}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="edit" data-id="${prompt.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 16.5 16.8 5.7a2 2 0 0 1 2.8 2.8L8.8 19.3 5 20l.7-3.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14.8 7.7 17.9 10.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Edit</span>
            </button>
            ${!isActive ? `<button class="btn" data-action="activate" data-id="${prompt.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5.5 12.5 10 17l8.5-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="btn-text">Set active</span>
            </button>` : ''}
            <button class="btn btn-danger" data-action="delete" data-id="${prompt.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6.5 7.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 7.5v-.8a1.7 1.7 0 0 1 1.7-1.7h2.6A1.7 1.7 0 0 1 15 6.7v.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 10v6M12 10v6M15 10v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="7.5" y="7.5" width="9" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
              </span>
              <span class="btn-text">Delete</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  chatbotPromptsListEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'edit') {
        const prompt = state.chatbotPrompts.find((p) => p.id === id);
        if (!prompt) return;
        openModal({
          title: 'Edit Chatbot Prompt',
          bodyHtml: `
            <div class="ai-field">
              <label>Title</label>
              <input id="prompt-title" value="${escapeHtml(prompt.title || '')}" />
            </div>
            <div class="ai-field">
              <label>Content</label>
              <textarea id="prompt-content" class="is-tall">${escapeHtml(prompt.content || '')}</textarea>
            </div>
          `,
          wide: true,
          onConfirm: async () => {
            const title = document.getElementById('prompt-title').value.trim();
            const content = document.getElementById('prompt-content').value.trim();
            if (!title || !content) {
              showToast('Title & content required.');
              return;
            }
            await apiFetch(`/api/prompts/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, prompt: content })
            });
            closeModal();
            await loadChatbotPrompts();
            showToast('Prompt updated.');
          }
        });
      } else if (action === 'activate') {
        await apiFetch(`/api/prompts/active/${id}`, { method: 'PUT' });
        await loadChatbotPrompts();
        showToast('Prompt activated.');
      } else if (action === 'delete') {
        if (!confirm('Delete this prompt?')) return;
        await apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
        await loadChatbotPrompts();
        showToast('Prompt deleted.');
      }
    });
  });
}

function renderSingaePrompts() {
  if (!singaePromptsListEl) return;
  const prompts = state.singaePrompts;
  if (!prompts) {
    singaePromptsListEl.innerHTML = '<div class="ai-card">Loading...</div>';
    return;
  }

  const items = [
    { mode: 'normal', data: prompts.normal },
    { mode: 'database', data: prompts.database }
  ];

  singaePromptsListEl.innerHTML = items
    .map((item) => {
      const lineCount = item.data?.systemPromptLines?.length || 0;
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(item.data?.name || item.mode)}</div>
          <div class="ai-card-meta">${escapeHtml(item.data?.description || '')}</div>
          <div class="ai-card-meta">${lineCount} lines · ${escapeHtml(item.mode)}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="edit" data-mode="${item.mode}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 16.5 16.8 5.7a2 2 0 0 1 2.8 2.8L8.8 19.3 5 20l.7-3.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14.8 7.7 17.9 10.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Edit</span>
            </button>
            <button class="btn btn-danger" data-action="reset" data-mode="${item.mode}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 8.5h7M6 8.5l2.5-2.5M6 8.5l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 6a7 7 0 1 1-2.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Reset</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  singaePromptsListEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const mode = btn.dataset.mode;
      const prompt = state.singaePrompts?.[mode];
      if (!prompt) return;
      if (action === 'edit') {
        openModal({
          title: `Edit singae Prompt (${mode})`,
          bodyHtml: `
            <div class="ai-field">
              <label>Name</label>
              <input id="sd-prompt-name" value="${escapeHtml(prompt.name || '')}" />
            </div>
            <div class="ai-field">
              <label>Description</label>
              <input id="sd-prompt-desc" value="${escapeHtml(prompt.description || '')}" />
            </div>
            <div class="ai-field">
              <label>System prompt (one line per row)</label>
              <textarea id="sd-prompt-content" class="is-tall">${escapeHtml((prompt.systemPromptLines || []).join('\n'))}</textarea>
            </div>
          `,
          wide: true,
          onConfirm: async () => {
            const name = document.getElementById('sd-prompt-name').value.trim();
            const description = document.getElementById('sd-prompt-desc').value.trim();
            const content = document.getElementById('sd-prompt-content').value.trim();
            if (!name || !content) {
              showToast('Name & content required.');
              return;
            }
            await apiFetch(`/api/ai-manager/prompts/${mode}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, description, systemPrompt: content })
            });
            closeModal();
            await loadSingaePrompts();
            showToast('Prompt updated.');
          }
        });
      } else if (action === 'reset') {
        if (!confirm('Reset prompt to default?')) return;
        await apiFetch(`/api/ai-manager/prompts/${mode}`, { method: 'DELETE' });
        await loadSingaePrompts();
        showToast('Prompt reset.');
      }
    });
  });
}

function renderKnowledgeBase(listEl, entries, filterValue) {
  if (!listEl) return;
  const keyword = String(filterValue || '').trim().toLowerCase();
  const filtered = keyword
    ? entries.filter((entry) => {
        const text = String(entry.text || '').toLowerCase();
        return text.includes(keyword);
      })
    : entries;

  if (!filtered.length) {
    listEl.innerHTML = '<div class="ai-card">No entries found.</div>';
    return;
  }

  listEl.innerHTML = filtered
    .slice(0, 120)
    .map((entry) => {
      const recordPreview = Object.entries(entry.record || {})
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(entry.topic || entry.source || 'Entry')}</div>
          <div class="ai-card-meta">${escapeHtml(recordPreview)}</div>
          <div class="ai-card-meta">${escapeHtml(String(entry.text || '').slice(0, 200))}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="edit" data-id="${entry.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 16.5 16.8 5.7a2 2 0 0 1 2.8 2.8L8.8 19.3 5 20l.7-3.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14.8 7.7 17.9 10.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Edit</span>
            </button>
            <button class="btn btn-danger" data-action="delete" data-id="${entry.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6.5 7.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 7.5v-.8a1.7 1.7 0 0 1 1.7-1.7h2.6A1.7 1.7 0 0 1 15 6.7v.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 10v6M12 10v6M15 10v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="7.5" y="7.5" width="9" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
              </span>
              <span class="btn-text">Delete</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function attachKbActions(listEl, source) {
  listEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const entries = source === 'chatbot' ? state.chatbotKb : state.singaeKb;
      const entry = entries.find((item) => item.id === id);
      if (!entry) return;
      if (action === 'edit') {
        openModal({
          title: `Edit ${source === 'chatbot' ? 'Chatbot' : 'singae'} Entry`,
          bodyHtml: `
            ${source === 'singae'
              ? `<div class="ai-field"><label>Topic</label><input id="kb-topic" value="${escapeHtml(entry.topic || '')}" /></div>`
              : ''}
            <div class="ai-field">
              <label>Record (JSON)</label>
              <textarea id="kb-record">${escapeHtml(JSON.stringify(entry.record || {}, null, 2))}</textarea>
            </div>
          `,
          onConfirm: async () => {
            let record;
            try {
              record = JSON.parse(document.getElementById('kb-record').value || '{}');
            } catch (_) {
              showToast('Record must be JSON.');
              return;
            }
            const payload = { record };
            if (source === 'singae') {
              payload.topic = document.getElementById('kb-topic').value.trim();
            }
            const url = source === 'chatbot'
              ? `/api/knowledge-base/${id}`
              : `/api/ai-manager/knowledge-base/entry/${id}`;
            await apiFetch(url, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            closeModal();
            await refreshKnowledgeBases();
            showToast('Entry updated.');
          }
        });
      } else if (action === 'delete') {
        if (!confirm('Delete this entry?')) return;
        const url = source === 'chatbot'
          ? `/api/knowledge-base/${id}`
          : `/api/ai-manager/knowledge-base/entry/${id}`;
        await apiFetch(url, { method: 'DELETE' });
        await refreshKnowledgeBases();
        showToast('Entry deleted.');
      }
    });
  });
}

function renderLogs() {
  if (!logsListEl) return;
  const keyword = String(logsSearchEl?.value || '').trim().toLowerCase();
  const filtered = keyword
    ? state.usageLogs.filter((log) => {
        const text = JSON.stringify(log || {}).toLowerCase();
        return text.includes(keyword);
      })
    : state.usageLogs;

  if (!filtered.length) {
    logsListEl.innerHTML = '<div class="ai-card">No logs found.</div>';
    return;
  }

  logsListEl.innerHTML = filtered
    .slice(0, 200)
    .map((log) => {
      const title = `${log.type || 'chat'} · ${log.model || 'unknown'}`;
      const time = log.createdAt || '';
      const endpoint = log.endpoint || '';
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(title)}</div>
          <div class="ai-card-meta">${escapeHtml(time)} · ${escapeHtml(endpoint)}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="view" data-id="${log.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16.2 16.2 3.3 3.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Details</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  logsListEl.querySelectorAll('button[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const log = state.usageLogs.find((item) => item.id === btn.dataset.id);
      if (!log) return;
      const requestPayload = log.requestRaw || log.request || {};
      const responsePayload = log.responseRaw || log.response || {};
      openModal({
        title: 'GPT Log Details',
        wide: true,
        bodyHtml: `
          <div class="ai-field">
            <label>Request</label>
            <textarea class="is-tall" readonly>${escapeHtml(JSON.stringify(requestPayload, null, 2))}</textarea>
          </div>
          <div class="ai-field">
            <label>Response</label>
            <textarea class="is-tall" readonly>${escapeHtml(JSON.stringify(responsePayload, null, 2))}</textarea>
          </div>
        `
      });
    });
  });
}

function getLookupLogs() {
  return state.serverLogs.filter((log) => String(log?.source || '').includes('singae-lookup'));
}

function getMessengerLogs() {
  return state.serverLogs.filter((log) => String(log?.source || '').includes('facebook-webhook'));
}

function isMessengerMessageLog(log) {
  const sourceName = String(log?.source || '');
  if (sourceName.includes('facebook-webhook-message')) return true;
  const request = log?.request || {};
  return Boolean(
    (typeof request?.message?.text === 'string' && request.message.text.trim()) ||
    (typeof request?.postback?.payload === 'string' && request.postback.payload.trim()) ||
    (typeof request?.postback?.title === 'string' && request.postback.title.trim())
  );
}

function getMessengerMessageLogs() {
  return getMessengerLogs().filter((log) => isMessengerMessageLog(log));
}

function renderLookupLogs() {
  if (!lookupListEl) return;
  const keyword = String(lookupSearchEl?.value || '').trim().toLowerCase();
  const lookupLogs = getLookupLogs();
  const filtered = keyword
    ? lookupLogs.filter((log) => JSON.stringify(log || {}).toLowerCase().includes(keyword))
    : lookupLogs;

  if (!filtered.length) {
    lookupListEl.innerHTML = '<div class="ai-card">No lookup logs found.</div>';
    return;
  }

  lookupListEl.innerHTML = filtered
    .slice(0, 200)
    .map((log) => {
      const title = `${log.source || 'lookup'} · ${log.status || ''}`.trim();
      const time = log.timestamp || '';
      const endpoint = log.endpoint || '';
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(title)}</div>
          <div class="ai-card-meta">${escapeHtml(time)} · ${escapeHtml(endpoint)}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="view" data-id="${log.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16.2 16.2 3.3 3.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Details</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  lookupListEl.querySelectorAll('button[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const log = state.serverLogs.find((item) => item.id === btn.dataset.id);
      if (!log) return;
      openModal({
        title: 'Lookup Log Details',
        wide: true,
        bodyHtml: `
          <div class="ai-field">
            <label>Request</label>
            <textarea class="is-tall" readonly>${escapeHtml(JSON.stringify(log.request || {}, null, 2))}</textarea>
          </div>
          <div class="ai-field">
            <label>Response</label>
            <textarea class="is-tall" readonly>${escapeHtml(JSON.stringify(log.response || {}, null, 2))}</textarea>
          </div>
        `
      });
    });
  });
}

function renderMessengerLogs() {
  if (!messengerListEl) return;
  const keyword = String(messengerSearchEl?.value || '').trim().toLowerCase();
  const logs = getMessengerLogs();
  const filtered = keyword
    ? logs.filter((log) => JSON.stringify(log || {}).toLowerCase().includes(keyword))
    : logs;

  if (!filtered.length) {
    messengerListEl.innerHTML = '<div class="ai-card">No messenger logs found.</div>';
    return;
  }

  messengerListEl.innerHTML = filtered
    .slice(0, 200)
    .map((log) => {
      const title = `${log.source || 'facebook-webhook'} · ${log.status || ''}`.trim();
      const time = log.timestamp || '';
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(title)}</div>
          <div class="ai-card-meta">${escapeHtml(time)}</div>
          <div class="ai-card-actions">
            <button class="btn" data-action="view" data-id="${log.id}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16.2 16.2 3.3 3.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              </span>
              <span class="btn-text">Details</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  messengerListEl.querySelectorAll('button[data-action="view"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const log = state.serverLogs.find((item) => item.id === btn.dataset.id);
      if (!log) return;
      openModal({
        title: 'Messenger Event (Raw)',
        wide: true,
        bodyHtml: `
          <div class="ai-field">
            <label>Raw Event</label>
            <textarea class="is-tall" readonly>${escapeHtml(JSON.stringify(log.request || {}, null, 2))}</textarea>
          </div>
        `
      });
    });
  });
}

function renderSingaeInstructionLines() {
  if (!singaeInstructionEditorEl) return;
  singaeInstructionEditorEl.value = state.singaeInstructionLines.join('\n');
}

function renderSingaeUserHistories() {
  if (!singaeUserHistoryListEl) return;
  const users = Array.isArray(state.singaeUserConversations) ? state.singaeUserConversations : [];
  if (!users.length) {
    singaeUserHistoryListEl.innerHTML = '<div class="ai-card">No user conversations found.</div>';
    return;
  }
  singaeUserHistoryListEl.innerHTML = users
    .map((item) => {
      const username = String(item?.username || '').trim().toLowerCase();
      const messageCount = Number(item?.messageCount || 0);
      const lastMessageAt = String(item?.lastMessageAt || item?.updatedAt || '').trim();
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(username || 'unknown')}</div>
          <div class="ai-card-meta">Messages: ${messageCount}</div>
          <div class="ai-card-meta">${escapeHtml(lastMessageAt || 'No activity')}</div>
          <div class="ai-card-actions">
            <button class="btn btn-danger" data-action="delete-user-history" data-username="${escapeHtml(username)}">
              <span class="btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6.5 7.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 7.5v-.8a1.7 1.7 0 0 1 1.7-1.7h2.6A1.7 1.7 0 0 1 15 6.7v.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 10v6M12 10v6M15 10v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="7.5" y="7.5" width="9" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
              </span>
              <span class="btn-text">Xóa lịch sử chat</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  singaeUserHistoryListEl.querySelectorAll('button[data-action="delete-user-history"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = String(btn.dataset.username || '').trim().toLowerCase();
      if (!username) return;
      if (!confirm(`Xóa toàn bộ lịch sử chat của user "${username}"?`)) return;
      await apiFetch(`/api/ai-manager/messages?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
      showToast(`Đã xóa lịch sử chat: ${username}`);
      await loadSingaeUserHistories();
    });
  });
}

function formatVnd(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('vi-VN') + ' đ';
}

function estimateTokensFromText(text) {
  const str = String(text || '');
  if (!str) return 0;
  return Math.ceil(str.length / 4);
}

function getLatestTimestamp(list, field = 'timestamp') {
  if (!Array.isArray(list) || list.length === 0) return '';
  const sorted = [...list].sort((a, b) => String(a?.[field] || '').localeCompare(String(b?.[field] || '')));
  return String(sorted[sorted.length - 1]?.[field] || '');
}

function updateUnreadFromLogs() {
  const unread = getUnreadState();
  let lastUsageSeen = localStorage.getItem(AI_MANAGER_LAST_SEEN_USAGE_KEY) || '';
  let lastLookupSeen = localStorage.getItem(AI_MANAGER_LAST_SEEN_LOOKUP_KEY) || '';
  let lastMessengerSeen = localStorage.getItem(AI_MANAGER_LAST_SEEN_MESSENGER_KEY) || '';
  const latestUsage = getLatestTimestamp(state.usageLogs, 'createdAt');
  const latestLookup = getLatestTimestamp(getLookupLogs(), 'timestamp');
  const latestMessenger = getLatestTimestamp(getMessengerMessageLogs(), 'timestamp');
  if (!lastUsageSeen && latestUsage) {
    lastUsageSeen = latestUsage;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_USAGE_KEY, latestUsage);
  }
  if (!lastLookupSeen && latestLookup) {
    lastLookupSeen = latestLookup;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_LOOKUP_KEY, latestLookup);
  }
  if (!lastMessengerSeen && latestMessenger) {
    lastMessengerSeen = latestMessenger;
    localStorage.setItem(AI_MANAGER_LAST_SEEN_MESSENGER_KEY, latestMessenger);
  }
  const usageUnread = state.usageLogs.filter((log) => String(log?.createdAt || '') > lastUsageSeen).length;
  const lookupUnread = getLookupLogs().filter((log) => String(log?.timestamp || '') > lastLookupSeen).length;
  const messengerUnread = getMessengerMessageLogs().filter((log) => String(log?.timestamp || '') > lastMessengerSeen).length;
  unread.logs = usageUnread;
  unread.lookup = lookupUnread;
  unread.messenger = messengerUnread;
  setUnreadState(unread);
  updateUnreadBadges();
}

function collectTextFromMessageContent(content, bucket) {
  if (!content) return;
  if (typeof content === 'string') {
    bucket.push(content);
    return;
  }
  if (Array.isArray(content)) {
    content.forEach((item) => {
      if (item?.type === 'input_text' && item?.text) {
        bucket.push(item.text);
      }
    });
  }
}

function extractInputText(log) {
  const raw = log?.requestRaw || log?.request || {};
  if (!Array.isArray(raw.input)) return '';
  if (raw.input.length === 0) return '';
  if (raw.input.every((item) => typeof item === 'string')) {
    return raw.input.join('\n');
  }
  const parts = [];
  raw.input.forEach((msg) => {
    if (typeof msg?.content === 'string') {
      parts.push(msg.content);
    } else {
      collectTextFromMessageContent(msg?.content, parts);
    }
  });
  return parts.join('\n');
}

function extractOutputText(log) {
  const raw = log?.responseRaw || log?.response || {};
  if (typeof raw?.output_text === 'string') return raw.output_text;
  if (typeof raw?.answer === 'string') return raw.answer;
  if (typeof log?.response?.answer === 'string') return log.response.answer;
  return '';
}

function getPricingForLog(log) {
  const cost = log?.cost || {};
  if (cost?.pricing?.input || cost?.pricing?.output) return cost.pricing;
  return MODEL_PRICING_PER_MILLION[log.model] || { input: 0, output: 0 };
}

function estimateLogCostVnd(log) {
  const pricing = getPricingForLog(log);
  const inputText = extractInputText(log);
  const outputText = log?.type === 'embedding' ? '' : extractOutputText(log);
  const inputTokens = estimateTokensFromText(inputText);
  const outputTokens = estimateTokensFromText(outputText);
  const usd =
    (inputTokens / 1000000) * (pricing.input || 0) +
    (outputTokens / 1000000) * (pricing.output || 0);
  return {
    inputTokens,
    outputTokens,
    costVnd: usd * 25000
  };
}

function renderCostPanel() {
  if (!costSummaryEl || !costBreakdownEl) return;
  const logs = state.usageLogs || [];
  const totals = {
    total: 0,
    chat: 0,
    embedding: 0
  };
  const modelMap = new Map();

  logs.forEach((log) => {
    const estimate = estimateLogCostVnd(log);
    const costVnd = estimate.costVnd;
    totals.total += costVnd;
    if (log.type === 'chat') totals.chat += costVnd;
    if (log.type === 'embedding') totals.embedding += costVnd;

    const key = `${log.model || 'unknown'}|${log.type || 'unknown'}`;
    const current = modelMap.get(key) || {
      model: log.model || 'unknown',
      type: log.type || 'unknown',
      total: 0,
      count: 0,
      inputTokens: 0,
      outputTokens: 0
    };
    current.total += costVnd;
    current.count += 1;
    current.inputTokens += estimate.inputTokens;
    current.outputTokens += estimate.outputTokens;
    modelMap.set(key, current);
  });

  costSummaryEl.innerHTML = `
    <div class="ai-cost-card">
      <span>Total (all logs)</span>
      <strong>${formatVnd(totals.total)}</strong>
    </div>
    <div class="ai-cost-card">
      <span>Chat cost</span>
      <strong>${formatVnd(totals.chat)}</strong>
    </div>
    <div class="ai-cost-card">
      <span>Embedding cost</span>
      <strong>${formatVnd(totals.embedding)}</strong>
    </div>
    <div class="ai-cost-card">
      <span>Requests</span>
      <strong>${logs.length}</strong>
    </div>
  `;

  const breakdown = Array.from(modelMap.values())
    .sort((a, b) => b.total - a.total)
    .map((item) => {
      const avg = item.count ? item.total / item.count : 0;
      return `
        <div class="ai-card">
          <div class="ai-card-title">${escapeHtml(item.model)} · ${escapeHtml(item.type)}</div>
          <div class="ai-card-meta">Total: ${formatVnd(item.total)}</div>
          <div class="ai-card-meta">Tokens: ${item.inputTokens.toLocaleString('vi-VN')} in · ${item.outputTokens.toLocaleString('vi-VN')} out</div>
          <div class="ai-card-meta">Count: ${item.count} · Avg: ${formatVnd(avg)}</div>
        </div>
      `;
    })
    .join('');

  costBreakdownEl.innerHTML = breakdown || '<div class="ai-card">No logs found.</div>';
}

async function loadChatbotPrompts() {
  if (!CHATBOT_FEATURE_ENABLED) return;
  const result = await apiFetch('/api/prompts');
  state.chatbotPrompts = result.prompts || [];
  state.chatbotActivePromptId = result.activePromptId || null;
  renderChatbotPrompts();
}

async function loadSingaePrompts() {
  if (!SINGAE_FEATURE_ENABLED) {
    state.singaePrompts = null;
    renderSingaePrompts();
    return;
  }
  const result = await apiFetch('/api/ai-manager/prompts');
  state.singaePrompts = result.prompts || null;
  renderSingaePrompts();
}

async function loadChatbotKnowledgeBase() {
  if (!CHATBOT_FEATURE_ENABLED) return;
  const result = await apiFetch('/api/knowledge-base');
  state.chatbotKb = result.entries || [];
  renderKnowledgeBase(chatbotKbListEl, state.chatbotKb, chatbotKbSearchEl?.value);
  attachKbActions(chatbotKbListEl, 'chatbot');
}

async function loadSingaeKnowledgeBase() {
  if (!SINGAE_FEATURE_ENABLED) {
    state.singaeKb = [];
    renderKnowledgeBase(singaeKbListEl, state.singaeKb, singaeKbSearchEl?.value);
    return;
  }
  const result = await apiFetch('/api/ai-manager/knowledge-base');
  state.singaeKb = result.entries || [];
  renderKnowledgeBase(singaeKbListEl, state.singaeKb, singaeKbSearchEl?.value);
  attachKbActions(singaeKbListEl, 'singae');
}

async function loadSingaePlainTextInstruction() {
  if (!SINGAE_FEATURE_ENABLED) {
    state.singaeInstructionLines = [];
    renderSingaeInstruction();
    return;
  }
  const result = await apiFetch('/api/ai-manager/plaintext-instruction');
  state.singaeInstructionLines = Array.isArray(result.lines) ? result.lines : [];
  renderSingaeInstructionLines();
}

async function loadSingaeUserHistories() {
  if (!SINGAE_FEATURE_ENABLED) {
    state.singaeUserConversations = [];
    renderSingaeUserHistories();
    return;
  }
  const adminUsername = String(currentAdminUsername || 'admin').trim().toLowerCase() || 'admin';
  const result = await apiFetch(`/api/ai-manager/conversations-all?username=${encodeURIComponent(adminUsername)}`);
  state.singaeUserConversations = Array.isArray(result?.users) ? result.users : [];
  renderSingaeUserHistories();
}

async function loadUsageLogs() {
  const result = await apiFetch('/api/usage-logs');
  state.usageLogs = result.logs || [];
  renderLogs();
  renderCostPanel();
  const latest = getLatestTimestamp(state.usageLogs, 'createdAt');
  if (state.lastUsageTimestamp && latest && latest > state.lastUsageTimestamp) {
    incrementUnread('logs', state.usageLogs.filter((log) => String(log?.createdAt || '') > state.lastUsageTimestamp).length);
    showToast('Có log GPT mới.');
  }
  state.lastUsageTimestamp = latest;
  updateUnreadFromLogs();
}

async function loadServerLogs() {
  const result = await apiFetch('/api/server-logs');
  state.serverLogs = Array.isArray(result?.logs) ? result.logs : [];
  renderLookupLogs();
  renderMessengerLogs();
  const lookupLogs = getLookupLogs();
  const latest = getLatestTimestamp(lookupLogs, 'timestamp');
  if (state.lastLookupTimestamp && latest && latest > state.lastLookupTimestamp) {
    incrementUnread('lookup', lookupLogs.filter((log) => String(log?.timestamp || '') > state.lastLookupTimestamp).length);
    showToast('Có log Lookup mới.');
  }
  state.lastLookupTimestamp = latest;
  const messengerLogs = getMessengerMessageLogs();
  const latestMessenger = getLatestTimestamp(messengerLogs, 'timestamp');
  if (state.lastMessengerTimestamp && latestMessenger && latestMessenger > state.lastMessengerTimestamp) {
    incrementUnread('messenger', messengerLogs.filter((log) => String(log?.timestamp || '') > state.lastMessengerTimestamp).length);
    showToast('Có event Messenger mới.');
  }
  state.lastMessengerTimestamp = latestMessenger;
  updateUnreadFromLogs();
}

async function refreshKnowledgeBases() {
  if (CHATBOT_FEATURE_ENABLED && SINGAE_FEATURE_ENABLED) {
    await Promise.all([loadChatbotKnowledgeBase(), loadSingaeKnowledgeBase()]);
    return;
  }
  if (CHATBOT_FEATURE_ENABLED) await loadChatbotKnowledgeBase();
  if (SINGAE_FEATURE_ENABLED) await loadSingaeKnowledgeBase();
}

if (btnAddChatbotPrompt) {
  btnAddChatbotPrompt.addEventListener('click', () => {
    openModal({
      title: 'Add Chatbot Prompt',
      bodyHtml: `
        <div class="ai-field">
          <label>Title</label>
          <input id="prompt-title" placeholder="Prompt title" />
        </div>
        <div class="ai-field">
          <label>Content</label>
          <textarea id="prompt-content" class="is-tall" placeholder="Prompt content"></textarea>
        </div>
      `,
      wide: true,
      onConfirm: async () => {
        const title = document.getElementById('prompt-title').value.trim();
        const content = document.getElementById('prompt-content').value.trim();
        if (!title || !content) {
          showToast('Title & content required.');
          return;
        }
        await apiFetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, prompt: content })
        });
        closeModal();
        await loadChatbotPrompts();
        showToast('Prompt added.');
      }
    });
  });
}

if (btnAddChatbotKb) {
  btnAddChatbotKb.addEventListener('click', () => {
    openModal({
      title: 'Add Chatbot Entry',
      bodyHtml: `
        <div class="ai-field">
          <label>Source</label>
          <input id="kb-source" placeholder="manual" value="manual" />
        </div>
        <div class="ai-field">
          <label>Source type</label>
          <input id="kb-source-type" placeholder="manual" value="manual" />
        </div>
        <div class="ai-field">
          <label>Record (JSON)</label>
          <textarea id="kb-record" placeholder='{"field":"value"}'></textarea>
        </div>
      `,
      onConfirm: async () => {
        let record;
        try {
          record = JSON.parse(document.getElementById('kb-record').value || '{}');
        } catch (_) {
          showToast('Record must be JSON.');
          return;
        }
        const source = document.getElementById('kb-source').value.trim() || 'manual';
        const sourceType = document.getElementById('kb-source-type').value.trim() || 'manual';
        await apiFetch('/api/knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record, source, sourceType })
        });
        closeModal();
        await loadChatbotKnowledgeBase();
        showToast('Entry added.');
      }
    });
  });
}

if (btnAddSingaeKb) {
  btnAddSingaeKb.addEventListener('click', () => {
    openModal({
      title: 'Add Trợ lý SINGAE Entry',
      bodyHtml: `
        <div class="ai-field">
          <label>Topic</label>
          <input id="kb-topic" placeholder="Manual" value="Manual" />
        </div>
        <div class="ai-field">
          <label>Record (JSON)</label>
          <textarea id="kb-record" placeholder='{"field":"value"}'></textarea>
        </div>
      `,
      onConfirm: async () => {
        let record;
        try {
          record = JSON.parse(document.getElementById('kb-record').value || '{}');
        } catch (_) {
          showToast('Record must be JSON.');
          return;
        }
        const topic = document.getElementById('kb-topic').value.trim() || 'Manual';
        await apiFetch('/api/ai-manager/knowledge-base/entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record, topic })
        });
        closeModal();
        await loadSingaeKnowledgeBase();
        showToast('Entry added.');
      }
    });
  });
}

if (btnAddSingaeInstruction) {
  btnAddSingaeInstruction.addEventListener('click', () => {
    state.singaeInstructionLines.push('New instruction line');
    renderSingaeInstructionLines();
  });
}

if (btnSaveSingaeInstruction) {
  btnSaveSingaeInstruction.addEventListener('click', async () => {
    const raw = singaeInstructionEditorEl ? singaeInstructionEditorEl.value : '';
    const cleaned = String(raw || '')
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (!cleaned.length) {
      showToast('Instruction cannot be empty.');
      return;
    }
    await apiFetch('/api/ai-manager/plaintext-instruction', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: cleaned })
    });
    state.singaeInstructionLines = cleaned;
    renderSingaeInstructionLines();
    showToast('Instruction saved.');
  });
}

if (btnResetSingaeInstruction) {
  btnResetSingaeInstruction.addEventListener('click', async () => {
    await apiFetch('/api/ai-manager/plaintext-instruction', { method: 'DELETE' });
    await loadSingaePlainTextInstruction();
    showToast('Instruction reset.');
  });
}

if (btnRefreshSingaeUserHistories) {
  btnRefreshSingaeUserHistories.addEventListener('click', async () => {
    await loadSingaeUserHistories();
    showToast('User histories refreshed.');
  });
}

if (chatbotKbSearchEl) {
  chatbotKbSearchEl.addEventListener('input', () => {
    renderKnowledgeBase(chatbotKbListEl, state.chatbotKb, chatbotKbSearchEl.value);
    attachKbActions(chatbotKbListEl, 'chatbot');
  });
}

if (singaeKbSearchEl) {
  singaeKbSearchEl.addEventListener('input', () => {
    renderKnowledgeBase(singaeKbListEl, state.singaeKb, singaeKbSearchEl.value);
    attachKbActions(singaeKbListEl, 'singae');
  });
}

if (logsSearchEl) {
  logsSearchEl.addEventListener('input', () => renderLogs());
}

if (lookupSearchEl) {
  lookupSearchEl.addEventListener('input', () => renderLookupLogs());
}

if (messengerSearchEl) {
  messengerSearchEl.addEventListener('input', () => renderMessengerLogs());
}

if (btnRefreshAll) {
  btnRefreshAll.addEventListener('click', async () => {
    await loadAll();
    showToast('Refreshed.');
  });
}

if (btnChangeChatModel) {
  btnChangeChatModel.addEventListener('click', async () => {
    try {
      const [modelsData, configData] = await Promise.all([
        apiFetch('/api/chatbot/openai-models'),
        apiFetch('/api/chatbot/runtime-config')
      ]);
      const models = Array.isArray(modelsData?.models) ? modelsData.models : [];
      const currentModel = String(configData?.openai?.model || 'gpt-4o');
      const optionsHtml = models
        .map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === currentModel ? 'selected' : ''}>${escapeHtml(m.label || m.id)} (${escapeHtml(m.id)})</option>`)
        .join('');
      openModal({
        title: 'Đổi model chat',
        bodyHtml: `
          <div class="ai-field">
            <label>Model</label>
            <select id="chat-model-select">${optionsHtml}</select>
          </div>
        `,
        onConfirm: async () => {
          const model = String(document.getElementById('chat-model-select')?.value || '').trim();
          if (!model) {
            showToast('Model không hợp lệ.');
            return;
          }
          await apiFetch('/api/chatbot/runtime-config/openai-model', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model })
          });
          closeModal();
          showToast(`Đã đổi model: ${model}`);
        }
      });
    } catch (error) {
      showToast(error.message || 'Không thể tải danh sách model.');
    }
  });
}

if (btnChangeLlmProvider) {
  btnChangeLlmProvider.addEventListener('click', async () => {
    try {
      const configData = await apiFetch('/api/chatbot/runtime-config');
      const currentProvider = String(configData?.openai?.provider || 'openai');
      const optionsHtml = ['openai', 'localai']
        .map((p) => `<option value="${escapeHtml(p)}" ${p === currentProvider ? 'selected' : ''}>${escapeHtml(p)}</option>`)
        .join('');
      openModal({
        title: 'Switch LLM server',
        wide: true,
        bodyHtml: `
          <div class="ai-field">
            <label>Provider</label>
            <select id="llm-provider-select">${optionsHtml}</select>
            <div class="ai-help">Tự động lấy cấu hình từ ENV trên server (VPS). Chỉ cần chọn provider.</div>
          </div>
        `,
        onConfirm: async () => {
          const provider = String(document.getElementById('llm-provider-select')?.value || '').trim();

          if (!provider) {
            showToast('Provider không hợp lệ.');
            return;
          }

          await apiFetch('/api/chatbot/runtime-config/llm-provider', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider })
          });

          closeModal();
          showToast(`Đã switch provider: ${provider}`);
        }
      });
    } catch (error) {
      showToast(error.message || 'Không thể switch LLM server.');
    }
  });
}

if (btnRefreshLogs) {
  btnRefreshLogs.addEventListener('click', async () => {
    await loadUsageLogs();
    showToast('Logs refreshed.');
  });
}

if (btnRefreshLookup) {
  btnRefreshLookup.addEventListener('click', async () => {
    await loadServerLogs();
    showToast('Lookup logs refreshed.');
  });
}

if (btnRefreshMessenger) {
  btnRefreshMessenger.addEventListener('click', async () => {
    await loadServerLogs();
    showToast('Messenger logs refreshed.');
  });
}
if (btnClearLogs) {
  btnClearLogs.addEventListener('click', async () => {
    if (!confirm('Reset database + clear usage logs + clear server logs?')) return;
    await apiFetch('/api/database/reset', { method: 'POST' });
    await apiFetch('/api/server-logs', { method: 'DELETE' });
    await loadUsageLogs();
    await loadServerLogs();
    showToast('Logs cleared.');
  });
}

if (btnRefreshCost) {
  btnRefreshCost.addEventListener('click', async () => {
    await loadUsageLogs();
    showToast('Cost refreshed.');
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadAll() {
  const tasks = [loadUsageLogs(), loadServerLogs()];
  if (CHATBOT_FEATURE_ENABLED) {
    tasks.push(loadChatbotPrompts(), loadChatbotKnowledgeBase());
  }
  if (SINGAE_FEATURE_ENABLED) {
    tasks.push(loadSingaePrompts(), loadSingaeKnowledgeBase(), loadSingaePlainTextInstruction(), loadSingaeUserHistories());
  }
  await Promise.all(tasks);
}

let usageLogsRefreshTimer = 0;
let knowledgeRefreshTimer = 0;
let promptsRefreshTimer = 0;

function scheduleUsageLogsRefresh(delay = 700) {
  if (usageLogsRefreshTimer) clearTimeout(usageLogsRefreshTimer);
  usageLogsRefreshTimer = setTimeout(() => {
    usageLogsRefreshTimer = 0;
    loadUsageLogs().catch(() => {});
  }, delay);
}

function scheduleKnowledgeRefresh(delay = 900) {
  if (knowledgeRefreshTimer) clearTimeout(knowledgeRefreshTimer);
  knowledgeRefreshTimer = setTimeout(() => {
    knowledgeRefreshTimer = 0;
    refreshKnowledgeBases().catch(() => {});
  }, delay);
}

function schedulePromptsRefresh(delay = 900) {
  if (promptsRefreshTimer) clearTimeout(promptsRefreshTimer);
  promptsRefreshTimer = setTimeout(() => {
    promptsRefreshTimer = 0;
    if (CHATBOT_FEATURE_ENABLED && SINGAE_FEATURE_ENABLED) {
      Promise.all([loadChatbotPrompts(), loadSingaePrompts()]).catch(() => {});
      return;
    }
    if (CHATBOT_FEATURE_ENABLED) loadChatbotPrompts().catch(() => {});
    if (SINGAE_FEATURE_ENABLED) loadSingaePrompts().catch(() => {});
  }, delay);
}

function startServerLogStream() {
  const source = new EventSource('/api/chatbot/server-logs/stream');
  source.addEventListener('log', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      if (!payload?.id) return;
      state.serverLogs.push(payload);
      const sourceName = String(payload?.source || '');
      const isLookup = sourceName.includes('singae-lookup');
      const isMessenger = sourceName.includes('facebook-webhook');
      if (isLookup) {
        renderLookupLogs();
        incrementUnread('lookup', 1);
        showToast('Có log Lookup mới.');
      }
      if (isMessenger) {
        renderMessengerLogs();
        if (isMessengerMessageLog(payload)) {
          incrementUnread('messenger', 1);
          showToast('Có tin nhắn Messenger mới.');
        }
      }
      // Event-driven refresh (debounced): only reload affected datasets
      if (
        sourceName.includes('usage') ||
        sourceName.includes('openai') ||
        sourceName.includes('chat') ||
        sourceName.includes('performance')
      ) {
        scheduleUsageLogsRefresh(700);
      }
      if (
        sourceName.includes('knowledge') ||
        sourceName.includes('import')
      ) {
        scheduleKnowledgeRefresh(900);
      }
      if (
        sourceName.includes('prompt') ||
        sourceName.includes('config')
      ) {
        schedulePromptsRefresh(900);
      }
    } catch (_) {}
  });
  source.onerror = () => {
    try { source.close(); } catch (_) {}
    setTimeout(startServerLogStream, 3000);
  };
}

startServerLogStream();

async function initAiManager() {
  // AI Manager no longer has its own login screen. It reuses desktop session.
  try {
    const user = await assertWindowsShellAdmin();
    currentAdminUsername = String(user?.username || 'admin').trim().toLowerCase() || 'admin';
  } catch (_) {
    try {
      // Avoid redirecting "/" inside iframe (desktop gets loaded in the tool frame).
      if (window.parent && window.parent !== window && typeof window.parent.desktopShellLogout === 'function') {
        window.parent.desktopShellLogout();
        return;
      }
      if (window.top && window.top !== window) {
        window.top.location.href = '/';
        return;
      }
    } catch (_) {}
    window.location.href = '/';
    return;
  }
  setAuthLocked(false);
  if (!CHATBOT_FEATURE_ENABLED) {
    setActivePanel('ai-logs');
  }
  loadAll().finally(() => {
    document.body.classList.add('is-ready');
  });
}

initAiManager();


