const state = {
  user: null,
  tasks: [],
  aiModal: {
    isOpen: false,
    taskId: null,
    triage: null,
    model: ''
  },
  events: {
    source: null,
    lastEventAt: ''
  }
};

const TOOL_ID = 'itsupport';

function $(id) {
  return document.getElementById(id);
}

function isPrivileged(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'manager' || r === 'leader';
}

function mapWindowShellUserToLegacyKeys(user) {
  const u = user || {};
  // legacy-style keys (compat with old it-support concepts)
  return {
    id: u.id || '',
    username: u.username || '',
    role: u.role || '',
    full_name: u.fullName || u.full_name || u.username || '',
    avatar_url: u.avatarUrl || u.avatar_url || '',
    gender: u.gender || '',
    company_level: u.companyLevel || u.company_level || '',
    department: u.department || '',
    work_schedule: u.workSchedule || u.work_schedule || '',
    address: u.address || '',
    phone: u.phone || '',
    is_active: u.isActive !== undefined ? !!u.isActive : true
  };
}

async function apiGet(url) {
  const r = await fetch(url, { cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || data?.message || 'Request failed');
  return data;
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || data?.message || 'Request failed');
  return data;
}

async function apiPatch(url, body) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || data?.message || 'Request failed');
  return data;
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(String(text || ''));
  } catch (_) {
    return fallback;
  }
}

function render() {
  const open = state.tasks.filter((t) => String(t.status || '').toLowerCase() === 'open');
  const prog = state.tasks.filter((t) => String(t.status || '').toLowerCase() === 'in_progress');
  const done = state.tasks.filter((t) => String(t.status || '').toLowerCase() === 'done');

  $('countOpen').textContent = String(open.length);
  $('countProgress').textContent = String(prog.length);
  $('countDone').textContent = String(done.length);

  $('listOpen').innerHTML = open.map(taskCard).join('');
  $('listProgress').innerHTML = prog.map(taskCard).join('');
  $('listDone').innerHTML = done.map(taskCard).join('');

  document.querySelectorAll('[data-action="status"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const next = btn.getAttribute('data-next');
      if (!id || !next) return;
      try {
        await apiPatch(`/api/it-support/tasks/${encodeURIComponent(id)}/status`, { status: next });
        await loadAll();
      } catch (e) {
        alert(e.message || String(e));
      }
    });
  });

  document.querySelectorAll('[data-action="ai"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const task = state.tasks.find((t) => String(t.id) === String(id));
      if (!task) return;
      try {
        await runAiTriageForTask(task);
      } catch (e) {
        alert(e.message || String(e));
      }
    });
  });
}

function taskCard(t) {
  const title = escapeHtml(String(t.title || ''));
  const desc = escapeHtml(String(t.description || ''));
  const createdBy = escapeHtml(String(t.created_by_username || ''));
  const createdAt = escapeHtml(String(t.created_at || ''));

  const id = String(t.id);
  const status = String(t.status || '').toLowerCase();

  const actions = [];
  if (status === 'open') actions.push(actionBtn(id, 'in_progress', '▶', 'Start'));
  if (status === 'in_progress') actions.push(actionBtn(id, 'done', '✓', 'Done'));
  if (status === 'done') actions.push(actionBtn(id, 'open', '↺', 'Reopen'));
  actions.push(aiBtn(id));

  const aiSummary = String(t.ai_summary || '').trim();
  const aiCategory = String(t.ai_category || '').trim();
  const aiPriority = String(t.ai_priority || '').trim();
  const aiSteps = safeJsonParse(t.ai_steps_json, []);
  const hasAi = Boolean(aiSummary || aiCategory || aiPriority || (Array.isArray(aiSteps) && aiSteps.length));
  const aiBlock = hasAi
    ? `
      <div class="task-ai">
        <div class="task-ai-title">AI Suggest</div>
        <div class="task-ai-meta tagline">
          ${aiCategory ? `<span class="tag"><strong>Cat</strong>: ${escapeHtml(aiCategory)}</span>` : ''}
          ${aiPriority ? `<span class="tag"><strong>Pri</strong>: ${escapeHtml(aiPriority)}</span>` : ''}
        </div>
        ${aiSummary ? `<div class="task-ai-steps">${escapeHtml(aiSummary)}</div>` : ''}
        ${(Array.isArray(aiSteps) && aiSteps.length)
          ? `<div class="task-ai-steps">${aiSteps.slice(0, 6).map((s) => `- ${escapeHtml(String(s || ''))}`).join('\n')}</div>`
          : ''}
      </div>
    `
    : '';

  return `
    <div class="task">
      <div class="task-title">${title}</div>
      <div class="task-meta">${createdBy ? `by ${createdBy}` : ''}${createdAt ? ` • ${createdAt}` : ''}</div>
      ${desc ? `<div class="task-desc">${desc}</div>` : ''}
      <div class="task-actions">${actions.join('')}</div>
      ${aiBlock}
    </div>
  `;
}

function actionBtn(id, next, icon, label) {
  return `
    <button class="btn secondary" data-action="status" data-id="${escapeAttr(id)}" data-next="${escapeAttr(next)}">
      <span class="i">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function aiBtn(id) {
  return `
    <button class="btn secondary" data-action="ai" data-id="${escapeAttr(id)}" title="AI suggest steps">
      <span class="i">✨</span>
      <span>AI</span>
    </button>
  `;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#096;');
}

async function loadUser() {
  const me = await apiGet('/api/windowsshell/auth/me');
  const user = me?.user || null;
  if (!user) throw new Error('Not authenticated');
  state.user = user;

  // Store per-tool user cache in the single shared user DB (WindowShell), under tool key
  try {
    await fetch(`/api/windowsshell/auth/user-meta/${encodeURIComponent(TOOL_ID)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          userCacheV1: mapWindowShellUserToLegacyKeys(user),
          updatedAt: new Date().toISOString()
        }
      })
    });
  } catch (_) {}

  $('subtitle').textContent = `${user.fullName || user.username} • ${user.role || 'member'}`;
  $('btnAdmin').style.display = isPrivileged(user.role) ? '' : 'none';
}

async function loadTasks() {
  const res = await apiGet('/api/it-support/tasks');
  state.tasks = Array.isArray(res?.data) ? res.data : [];
}

async function loadAll() {
  await loadUser();
  await loadTasks();
  render();
}

function subscribeEvents() {
  if (state.events.source) return;
  try {
    const es = new EventSource('/api/it-support/events');
    state.events.source = es;

    es.addEventListener('task_created', async (event) => {
      try {
        const payload = JSON.parse(String(event?.data || '{}'));
        const ts = String(payload?.timestamp || '').trim();
        if (ts && ts <= (state.events.lastEventAt || '')) return;
        if (ts) state.events.lastEventAt = ts;
        // Refresh tasks list so admin sees it immediately.
        await loadTasks();
        render();
        // Subtle UI hint
        const base = state.user ? `${state.user.fullName || state.user.username} • ${state.user.role || 'member'}` : 'IT Support';
        $('subtitle').textContent = `${base} • New task received`;
        setTimeout(() => {
          try {
            if (state.user) $('subtitle').textContent = `${state.user.fullName || state.user.username} • ${state.user.role || 'member'}`;
          } catch (_) {}
        }, 1800);
      } catch (_) {}
    });

    es.addEventListener('ping', () => {});
    es.onerror = () => {
      try { es.close(); } catch (_) {}
      state.events.source = null;
      setTimeout(subscribeEvents, 2500);
    };
  } catch (_) {}
}

function openModal() {
  $('modal').setAttribute('data-open', '1');
  $('modalError').style.display = 'none';
  $('modalError').textContent = '';
  $('taskTitle').value = '';
  $('taskDesc').value = '';
  setTimeout(() => $('taskTitle').focus(), 0);
}

function closeModal() {
  $('modal').setAttribute('data-open', '0');
}

function openAiModal({ title, bodyHtml, taskId, triage, model }) {
  $('aiModalTitle').textContent = title || 'AI Suggest';
  $('aiModalBody').innerHTML = bodyHtml || '';
  $('aiModalError').style.display = 'none';
  $('aiModalError').textContent = '';
  $('aiModal').setAttribute('data-open', '1');
  state.aiModal = {
    isOpen: true,
    taskId: String(taskId || ''),
    triage: triage || null,
    model: String(model || '')
  };
}

function closeAiModal() {
  $('aiModal').setAttribute('data-open', '0');
  state.aiModal = { isOpen: false, taskId: null, triage: null, model: '' };
}

function renderAiBody(triage) {
  const t = triage || {};
  const steps = Array.isArray(t.steps) ? t.steps : [];
  const need = Array.isArray(t.neededInfo) ? t.neededInfo : [];
  return `
    <div class="field">
      <div class="label">Summary</div>
      <div class="task-desc">${escapeHtml(String(t.summary || ''))}</div>
    </div>
    <div class="row" style="gap:8px;margin-top:8px">
      ${t.category ? `<span class="tag"><strong>Category</strong>: ${escapeHtml(String(t.category))}</span>` : ''}
      ${t.priority ? `<span class="tag"><strong>Priority</strong>: ${escapeHtml(String(t.priority))}</span>` : ''}
    </div>
    <div class="field" style="margin-top:12px">
      <div class="label">Steps</div>
      <div class="task-desc">${steps.length ? steps.map((s) => `- ${escapeHtml(String(s || ''))}`).join('\n') : '—'}</div>
    </div>
    <div class="field" style="margin-top:12px">
      <div class="label">Needed info (if missing)</div>
      <div class="task-desc">${need.length ? need.map((s) => `- ${escapeHtml(String(s || ''))}`).join('\n') : '—'}</div>
    </div>
  `;
}

async function runAiTriageForTask(task) {
  const title = String(task?.title || '').trim();
  const description = String(task?.description || '').trim();
  if (!title) throw new Error('Task title is empty.');

  openAiModal({
    title: 'AI Suggest (đang xử lý...)',
    bodyHtml: `<div class="task-desc">⏳ Đang gọi AI…</div>`,
    taskId: task.id,
    triage: null,
    model: ''
  });

  const res = await apiPost('/api/it-support/ai/triage', { title, description });
  const triage = res?.data?.triage || null;
  const model = String(res?.data?.model || '').trim();
  if (!triage) throw new Error('AI không trả về dữ liệu hợp lệ.');

  openAiModal({
    title: `AI Suggest${model ? ` • ${model}` : ''}`,
    bodyHtml: renderAiBody(triage),
    taskId: task.id,
    triage,
    model
  });
}

async function applyAiToTask() {
  const taskId = String(state.aiModal?.taskId || '').trim();
  const triage = state.aiModal?.triage || null;
  if (!taskId || !triage) return;

  try {
    $('aiBtnApply').disabled = true;
    await apiPatch(`/api/it-support/tasks/${encodeURIComponent(taskId)}/ai`, {
      aiSummary: String(triage.summary || '').trim(),
      aiCategory: String(triage.category || '').trim(),
      aiPriority: String(triage.priority || '').trim(),
      aiSteps: Array.isArray(triage.steps) ? triage.steps : [],
      aiNeededInfo: Array.isArray(triage.neededInfo) ? triage.neededInfo : [],
      aiModel: String(state.aiModal?.model || '').trim()
    });
    closeAiModal();
    await loadAll();
  } catch (e) {
    $('aiModalError').style.display = '';
    $('aiModalError').textContent = e.message || String(e);
  } finally {
    $('aiBtnApply').disabled = false;
  }
}

async function saveTask() {
  const title = String($('taskTitle').value || '').trim();
  const description = String($('taskDesc').value || '').trim();
  if (!title) {
    $('modalError').style.display = '';
    $('modalError').textContent = 'Title is required';
    return;
  }
  try {
    await apiPost('/api/it-support/tasks', { title, description });
    closeModal();
    await loadAll();
  } catch (e) {
    $('modalError').style.display = '';
    $('modalError').textContent = e.message || String(e);
  }
}

function wire() {
  $('btnRefresh').addEventListener('click', () => loadAll().catch((e) => alert(e.message || String(e))));
  $('btnNew').addEventListener('click', openModal);
  $('btnClose').addEventListener('click', closeModal);
  $('btnCancel').addEventListener('click', closeModal);
  $('btnSave').addEventListener('click', saveTask);
  $('aiBtnClose').addEventListener('click', closeAiModal);
  $('aiBtnCancel').addEventListener('click', closeAiModal);
  $('aiBtnApply').addEventListener('click', applyAiToTask);
  $('btnAdmin').addEventListener('click', () => {
    // open admin modal in shell wrapper (if embedded)
    try {
      window.parent.postMessage({ type: 'it-support:navigate', url: '/tools/normal/it-support/index.html#admin' }, '*');
    } catch (_) {}
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeAiModal();
    }
  });
}

wire();
loadAll().catch((e) => {
  $('subtitle').textContent = 'Please login in Desktop (WindowShell) to use this tool.';
  console.warn(e);
});
subscribeEvents();

