(() => {
  const $ = (id) => document.getElementById(id);
  const API_BASE = '/api/giftbag';
  const state = {
    ctvs: [],
    selectedCtv: null,
    selectedWallet: null,
    selectedPayVoucher: null,
    getflyCtvDraft: null,
    currentUser: null,
    managerData: { logs: [], vouchers: [], usages: [], payments: [], wallets: [] }
  };
  // render sequence tokens to cancel previous async chunked renders
  let walletRenderSeq = 0;
  const MODAL_STATE_KEY = 'giftbag_modal_state_v1';
  let apiLoadingCount = 0;

  function setApiLoading(visible) {
    const el = $('gbApiLoadingIndicator');
    if (!el) return;
    el.classList.toggle('is-active', Boolean(visible));
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function beginApiLoading() {
    apiLoadingCount += 1;
    setApiLoading(apiLoadingCount > 0);
  }

  function endApiLoading() {
    apiLoadingCount = Math.max(0, apiLoadingCount - 1);
    setApiLoading(apiLoadingCount > 0);
  }

  function log(line) {
    const el = $('gbLog');
    if (!el) return;
    const next = `[${new Date().toISOString()}] ${line}\n`;
    el.textContent = next + el.textContent;
  }

  function logGdv25(line) {
    const el = $('gbGdv25Log');
    if (!el) return;
    const next = `[${new Date().toISOString()}] ${line}\n`;
    el.textContent = next + el.textContent;
  }

  function setPing(text, ok = true) {
    showNotice({
      title: ok ? 'Thành công' : 'Có lỗi',
      subtitle: ok ? 'Giftbag' : 'Giftbag',
      message: String(text || ''),
      kind: ok ? 'ok' : 'error',
      actions: [{ label: 'Đóng', variant: ok ? 'primary' : 'ghost' }]
    });
  }

  function showNotice({ title = 'Thông báo', subtitle = '', message = '', kind = 'ok', actions = [] } = {}) {
    const t = $('gbNoticeTitle');
    const st = $('gbNoticeSubtitle');
    const body = $('gbNoticeBody');
    const actionWrap = $('gbNoticeActions');
    if (t) t.textContent = String(title || 'Thông báo');
    if (st) st.textContent = String(subtitle || '');
    if (body) body.textContent = String(message || '');
    if (actionWrap) {
      actionWrap.innerHTML = '';
      (actions || []).forEach((a, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn gb-btn ${a.variant === 'primary' ? 'btn-primary' : a.variant === 'ghost' ? 'btn-ghost' : ''}`.trim();
        btn.textContent = a.label || (idx === 0 ? 'Đóng' : `Action ${idx + 1}`);
        btn.addEventListener('click', async () => {
          try { if (typeof a.onClick === 'function') await a.onClick(); } catch (_) {}
          closeOverlay('gbNoticeOverlay');
        });
        actionWrap.appendChild(btn);
      });
      if (!actions || !actions.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary gb-btn';
        btn.textContent = 'Đóng';
        btn.addEventListener('click', () => closeOverlay('gbNoticeOverlay'));
        actionWrap.appendChild(btn);
      }
    }
    // tint avatar by kind
    const avatar = document.querySelector('#gbNoticeOverlay .gb-title-avatar');
    if (avatar) {
      avatar.className = `gb-title-avatar gb-h-avatar ${kind === 'error' ? 'gb-h-avatar-female' : kind === 'warn' ? 'gb-h-avatar-male' : 'gb-h-avatar-sg'}`;
    }
    openOverlay('gbNoticeOverlay');
  }

  function isOverlayOpen(id) {
    const el = $(id);
    return Boolean(el && el.classList.contains('is-open'));
  }

  async function api(path, opts = {}) {
    beginApiLoading();
    try {
      const url = `${API_BASE}${path}`;
      const res = await fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) ? (json.error || json.message) : text;
        throw new Error(`${res.status} ${res.statusText}: ${msg}`);
      }
      return json ?? text;
    } finally {
      endApiLoading();
    }
  }

  async function apiForm(path, formData, opts = {}) {
    beginApiLoading();
    try {
      const url = `${API_BASE}${path}`;
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        ...(opts || {})
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      if (!res.ok) {
        const msg = (json && (json.error || json.message)) ? (json.error || json.message) : text;
        throw new Error(`${res.status} ${res.statusText}: ${msg}`);
      }
      return json ?? text;
    } finally {
      endApiLoading();
    }
  }

  async function ensureGetflyKeyIfMissing(err) {
    const msg = String(err?.message || '');
    if (!msg.includes('Missing Getfly API key')) return false;
    const key = window.prompt('Thiếu Getfly API key. Dán API key vào đây để lưu trên máy này:');
    if (!key) return false;
    await api('/settings/getfly', {
      method: 'PUT',
      body: JSON.stringify({ api_key: String(key).trim() })
    });
    return true;
  }

  async function loadCurrentUser() {
    beginApiLoading();
    try {
      const res = await fetch('/api/windowsshell/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const payload = await res.json().catch(() => ({}));
      state.currentUser = payload?.user || null;
    } catch (_) {
    } finally {
      endApiLoading();
    }
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseMoneyInput(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return Number(digits || 0);
  }

  function formatMoneyVi(value) {
    return Math.round(Number(value || 0)).toLocaleString('vi-VN');
  }

  function formatDateVi(isoLike) {
    const raw = String(isoLike || '').slice(0, 10);
    const [y, m, d] = raw.split('-');
    if (!y || !m || !d) return '';
    return `${d}/${m}/${y}`;
  }

  function formatServiceCategory(category) {
    const key = String(category || '').trim().toLowerCase();
    if (key === 'implant') return 'Implant';
    if (key === 'porcelain') return 'Sứ (trên răng thật)';
    if (key === 'general') return 'Nha khoa tổng quát';
    if (key === 'orthodontic') return 'Niềng răng';
    return key ? key : '-';
  }

  function formatGetflyPreviewValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (Array.isArray(value) || typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  function toDateInputValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      const d = new Date(n > 1e12 ? n : n * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function includesQuery(query, ...parts) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    const hay = parts.map((x) => String(x || "").toLowerCase()).join(" ");
    return tokens.every((t) => hay.includes(t));
  }

  // Debounce helper for smoother search typing
  function debounce(fn, wait = 220) {
    let t = null;
    return (...args) => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => fn(...args), wait);
    };
  }

  // Lightweight cache to reduce UI jank and network churn in Manager modal
  const managerCache = {
    fetchedAt: 0,
    vouchers: null,
    usages: null,
    payments: null,
    wallets: null
  };

  // Cache removed: always fetch fresh data

  function iconGiftBox() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10h18v11H3z"></path>
        <path d="M2 7h20v4H2z"></path>
        <path d="M12 7v14"></path>
        <path d="M12 7c-1.8 0-3.6-0.9-3.6-2.5S10 2 12 7z"></path>
        <path d="M12 7c1.8 0 3.6-0.9 3.6-2.5S14 2 12 7z"></path>
      </svg>
    `;
  }

  function iconMoney() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7v10"></path>
        <path d="M15.2 9.4c-.7-1-2-1.5-3.4-1.2-1.4.3-2.4 1.3-2.3 2.5.1 1.3 1.3 1.8 2.9 2.1 1.6.3 2.8.8 2.8 2.1 0 1.2-1.1 2.1-2.7 2.3-1.5.2-2.9-.3-3.8-1.4"></path>
      </svg>
    `;
  }

  function renderGetflyPreview(payload) {
    const box = $("gbGetflyPreview");
    const rows = $("gbGetflyPreviewRows");
    if (!box || !rows) return;
    if (!payload || typeof payload !== "object") {
      box.hidden = true;
      rows.innerHTML = "";
      return;
    }
    const contacts = Array.isArray(payload.contacts) ? payload.contacts.slice(0, 3) : [];
    const importantCustomFields = {};
    if (payload.custom_fields && typeof payload.custom_fields === "object") {
      Object.entries(payload.custom_fields).forEach(([k, v]) => {
        const key = String(k || "").toLowerCase();
        const important = /name|phone|mobile|email|address|birthday|birth|gender|zalo|facebook|source|type|manager/.test(key);
        const hasValue = v !== null && v !== undefined && String(v).trim() !== "";
        if (important && hasValue) importantCustomFields[k] = v;
      });
    }
    const fields = [
      ["id", payload.id],
      ["account_code", payload.account_code],
      ["account_name", payload.account_name],
      ["description", payload.description],
      ["billing_address_street", payload.billing_address_street],
      ["phone_office", payload.phone_office],
      ["email", payload.email],
      ["mgr_email", payload.mgr_email],
      ["mgr_display_name", payload.mgr_display_name],
      ["website", payload.website],
      ["logo", payload.logo],
      ["birthday", payload.birthday],
      ["sic_code", payload.sic_code],
      ["created_at", payload.created_at],
      ["account_type", payload.account_type],
      ["account_source", payload.account_source],
      ["relation_id", payload.relation_id],
      ["relation_name", payload.relation_name],
      ["gender", payload.gender],
      ["total_revenue", payload.total_revenue],
      ["account_manager", payload.account_manager],
      ["accessible_user_ids", payload.accessible_user_ids],
      ["contacts (important)", contacts.map((c) => ({
        name: c?.name || c?.contact_name || c?.first_name || "",
        phone: c?.phone || c?.phone_office || c?.mobile || "",
        email: c?.email || ""
      }))],
      ["custom_fields (important)", importantCustomFields]
    ];
    rows.innerHTML = fields.map(([label, value]) => (
      `<div class="gb-getfly-item"><span class="gb-getfly-key">${escapeHtml(label)}</span><pre class="gb-getfly-val">${escapeHtml(formatGetflyPreviewValue(value))}</pre></div>`
    )).join("");
    box.hidden = false;
    box.classList.remove("is-in");
    void box.offsetWidth;
    box.classList.add("is-in");
  }

  function parsePercentInput(value) {
    const n = Number(String(value || '').replace(',', '.'));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function getServiceRemainingForSelectedWallet() {
    const wallet = state.selectedWallet || {};
    const category = String($('gbUseServiceCategory')?.value || 'implant');
    if (category === 'implant') return Number(wallet.remaining_implant_amount || 0);
    if (category === 'porcelain') return Number(wallet.remaining_porcelain_amount || 0);
    if (category === 'general') return Number(wallet.remaining_general_amount || 0);
    return Number(wallet.remaining_orthodontic_amount || 0);
  }

  function syncUseWalletMoneyInputs({ clampGift = false } = {}) {
    const giftEl = $('gbUseGiftAmount');
    if (!giftEl) return;
    const serviceRemaining = getServiceRemainingForSelectedWallet();
    const totalRemaining = Number(state.selectedWallet?.remaining_total || 0);
    const giftMax = Math.max(0, Math.min(serviceRemaining, totalRemaining));
    let gift = parseMoneyInput(giftEl.value);
    if (clampGift && gift > giftMax) gift = giftMax;
    giftEl.value = formatMoneyVi(gift);
  }

  function syncCreateWalletCalcs() {
    const total = parseMoneyInput($('gbCreateWalletTotal')?.value);
    const annualPct = parsePercentInput($('gbCreateWalletAnnualPercent')?.value);
    if ($('gbCreateWalletTotal')) $('gbCreateWalletTotal').value = formatMoneyVi(total);
    if ($('gbCreateWalletAnnualPercent')) $('gbCreateWalletAnnualPercent').value = String(annualPct);
    if ($('gbCreateWalletAnnualMoney')) $('gbCreateWalletAnnualMoney').textContent = formatMoneyVi((total * annualPct) / 100);

    const binds = [
      ['gbDistImplantPct', 'gbDistImplantMoney'],
      ['gbDistPorcelainPct', 'gbDistPorcelainMoney'],
      ['gbDistGeneralPct', 'gbDistGeneralMoney'],
      ['gbDistOrthoPct', 'gbDistOrthoMoney']
    ];
    binds.forEach(([pctId, moneyId]) => {
      const pct = parsePercentInput($(pctId)?.value);
      if ($(pctId)) $(pctId).value = String(pct);
      if ($(moneyId)) $(moneyId).textContent = formatMoneyVi((total * pct) / 100);
    });
  }

  function renderReferrerOptions() {
    const select = $('gbReferrerSelect');
    if (!select) return;
    const options = [
      '<option value="">None</option>',
      ...state.ctvs.map((ctv) => `<option value="${ctv.id}">${escapeHtml(ctv.code)} - ${escapeHtml(ctv.name)}</option>`)
    ];
    select.innerHTML = options.join('');
  }

  function renderCtvTable() {
    const tbody = $('gbCtvTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    const q = String($('gbSearchCtvInput')?.value || '').trim();
    (state.ctvs || []).filter((ctv) => includesQuery(
      q,
      ctv.code,
      ctv.name,
      ctv.phone,
      ctv.address,
      ctv.customer_code,
      ctv.referrer_name
    )).forEach((ctv) => {
      const tr = document.createElement('tr');
      const walletCount = Number(ctv.wallet_count || 0);
      const voucherCount = Number(ctv.voucher_count || 0);
      const walletChipClass = walletCount > 0 ? 'gb-wallet-chip gb-wallet-chip-hot' : 'gb-wallet-chip';
      const voucherChipClass = voucherCount > 0 ? 'gb-voucher-chip gb-voucher-chip-money' : 'gb-voucher-chip';
      const dob = String(ctv.date_of_birth || '').slice(0, 10);
      const [yyyy, mm, dd] = dob.split('-');
      const dobDisplay = (yyyy && mm && dd) ? `${dd}/${mm}/${yyyy}` : '';
      const genderDisplay = ctv.gender === 'male' ? 'Nam' : ctv.gender === 'female' ? 'Nữ' : 'Khác';
      tr.innerHTML = `
        <td><b>${escapeHtml(ctv.code || '')}</b></td>
        <td>${escapeHtml(ctv.name || '')}</td>
        <td>${escapeHtml(dobDisplay)}</td>
        <td>${escapeHtml(genderDisplay)}</td>
        <td><div class="gb-ctv-address">${escapeHtml(ctv.address || '')}</div></td>
        <td>${escapeHtml(ctv.referrer_name || 'None')}</td>
        <td>
          <button type="button" class="${walletChipClass}" data-wallet-open="${ctv.id}" title="Xem túi quà">
            <span class="gb-wallet-icon gb-tool-icon">${iconGiftBox()}</span>
            <span class="gb-chip-count">${walletCount}</span>
          </button>
          <button type="button" class="gb-wallet-chip gb-wallet-create-chip" data-wallet-create="${ctv.id}" title="Tạo túi quà">
            <span class="gb-wallet-create-plus" aria-hidden="true">+</span>
            <span class="gb-wallet-icon gb-tool-icon">${iconGiftBox()}</span>
          </button>
        </td>
        <td>
          <button type="button" class="${voucherChipClass}" data-voucher-open="${ctv.id}">
            <span class="gb-voucher-icon gb-tool-icon">${iconMoney()}</span>
            <span class="gb-chip-count">${voucherCount}</span>
          </button>
        </td>
      `;
      tr.classList.add('gb-ctv-row');
      tr.addEventListener('click', (event) => {
        if (event.target.closest('.gb-wallet-chip') || event.target.closest('.gb-voucher-chip')) return;
        openCtvDetailModal(ctv);
      });
      tr.querySelector('.gb-wallet-chip')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openWalletModal(ctv);
      });
      tr.querySelector('.gb-voucher-chip')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openVoucherModal(ctv);
      });
      tr.querySelector('.gb-wallet-create-chip')?.addEventListener('click', (event) => {
        event.stopPropagation();
        openCreateWalletModal(ctv);
      });
      tbody.appendChild(tr);
    });
  }

  function openCtvDetailModal(ctv) {
    state.selectedCtv = ctv;
    $('gbDetailHeaderName').textContent = ctv.name || 'Cộng tác viên';
    $('gbDetailHeaderAvatar').className = `gb-title-avatar gb-h-avatar ${avatarClassFromGender(ctv.gender)}`;
    $('gbDetailCode').value = ctv.code || '';
    $('gbDetailName').value = ctv.name || '';
    $('gbDetailPhone').value = ctv.phone || '';
    $('gbDetailDob').value = String(ctv.date_of_birth || '').slice(0, 10);
    $('gbDetailGender').value = ctv.gender === 'male' ? 'male' : ctv.gender === 'female' ? 'female' : 'other';
    $('gbDetailCitizenId').value = ctv.citizen_id || '';
    $('gbDetailAddress').value = ctv.address || '';
    $('gbDetailActivatedAt').value = String(ctv.activated_at || '').slice(0, 10);
    $('gbDetailNote').value = ctv.note || '';
    renderDownlineHierarchy(ctv);
    // Load ticket sections similar to Manager
    loadCtvWalletTickets().catch(() => {});
    loadCtvVoucherTickets().catch(() => {});
    // Load usage/commission tables if needed
    loadCommissionRows().catch(() => {});
    activateTab('gbTabInfo');
    openOverlay('gbCtvDetailOverlay');
  }

  async function saveCtvDetail() {
    const ctvId = Number(state.selectedCtv?.id || 0);
    if (!ctvId) {
      setPing('Chưa chọn CTV để cập nhật', false);
      return;
    }
    const name = String($('gbDetailName')?.value || '').trim();
    if (!name) {
      setPing('Họ tên không được để trống', false);
      $('gbDetailName')?.focus();
      return;
    }
    const payload = {
      name,
      phone: String($('gbDetailPhone')?.value || '').trim() || null,
      date_of_birth: String($('gbDetailDob')?.value || '').trim() || null,
      gender: String($('gbDetailGender')?.value || 'other').trim() || 'other',
      citizen_id: String($('gbDetailCitizenId')?.value || '').trim() || null,
      address: String($('gbDetailAddress')?.value || '').trim() || null,
      note: String($('gbDetailNote')?.value || '').trim() || null
    };
    const saveBtn = $('gbSaveDetailBtn');
    const prevText = saveBtn?.textContent || 'Lưu thông tin CTV';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu...';
    }
    try {
      await api(`/ctv/${ctvId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setPing('Đã cập nhật thông tin CTV', true);
      await loadCtvs();
      closeOverlay('gbCtvDetailOverlay');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = prevText;
      }
    }
  }

  async function openWalletModal(ctv) {
    state.selectedCtv = ctv;
    $('gbWalletHeaderName').textContent = ctv.name || 'Cộng tác viên';
    $('gbWalletHeaderAvatar').className = `gb-title-avatar gb-h-avatar ${avatarClassFromGender(ctv.gender)}`;
    openOverlay('gbWalletOverlay');
    await loadWalletRows();
  }

  function openCreateWalletModal(ctv) {
    state.selectedCtv = ctv;
    $('gbCreateWalletHeaderName').textContent = ctv.name || 'Cộng tác viên';
    $('gbCreateWalletHeaderAvatar').className = `gb-title-avatar gb-h-avatar ${avatarClassFromGender(ctv.gender)}`;
    if ($('gbCreateWalletTotal')) $('gbCreateWalletTotal').value = '500.000.000';
    if ($('gbCreateWalletAnnualPercent')) $('gbCreateWalletAnnualPercent').value = '10';
    if ($('gbDistImplantPct')) $('gbDistImplantPct').value = '40';
    if ($('gbDistPorcelainPct')) $('gbDistPorcelainPct').value = '30';
    if ($('gbDistGeneralPct')) $('gbDistGeneralPct').value = '20';
    if ($('gbDistOrthoPct')) $('gbDistOrthoPct').value = '10';
    syncCreateWalletCalcs();
    openOverlay('gbCreateWalletOverlay');
  }

  async function openVoucherModal(ctv) {
    state.selectedCtv = ctv;
    $('gbVoucherHeaderName').textContent = ctv.name || 'Cộng tác viên';
    $('gbVoucherHeaderAvatar').className = `gb-title-avatar gb-h-avatar ${avatarClassFromGender(ctv.gender)}`;
    openOverlay('gbVoucherOverlay');
    await loadVoucherRows();
  }

  async function openWalletForCtvId(ctvId) {
    let ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === Number(ctvId || 0));
    if (!ctv) {
      await loadCtvs();
      ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === Number(ctvId || 0));
    }
    if (!ctv) throw new Error('Không tìm thấy CTV để mở túi quà');
    await openWalletModal(ctv);
  }

  function renderDownlineHierarchy(ctv) {
    const rootId = Number(ctv.id || 0);
    const treeRoot = $('gbDownlineTree');
    if (!treeRoot || !rootId) return;
    const byParent = new Map();
    state.ctvs.forEach((x) => {
      const pid = Number(x.referrer_ctv_id || 0);
      if (!pid) return;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(x);
    });
    const visited = new Set();
    const buildTree = (node) => {
      const id = Number(node.id || 0);
      if (!id) return { ...node, children: [] };
      if (visited.has(id)) return { ...node, children: [] };
      visited.add(id);
      const kids = (byParent.get(id) || []);
      return {
        ...node,
        children: kids.map((child) => buildTree(child))
      };
    };
    const currentId = Number(ctv.id || 0);
    const renderNode = (node, isRoot = false) => {
      const isCurrent = Number(node?.id || 0) === currentId;
      const avatarClass = `${avatarClassFromGender(node?.gender)} ${isCurrent ? 'gb-h-avatar-sg gb-h-avatar-self' : ''}`;
      const title = `${node?.code || ''} - ${node?.name || ''}`.trim();
      return `
        <div class="gb-dl-node ${isRoot ? 'is-root' : ''}" title="${escapeHtml(title)}">
          <div class="gb-h-avatar ${avatarClass}"></div>
          <div class="gb-h-name">${escapeHtml(node?.name || '( None )')}</div>
        </div>
      `;
    };
    const renderBranch = (node, isRoot = false) => {
      const childHtml = (node.children && node.children.length)
        ? `<ul class="gb-tree-children">${node.children.map((child) => renderBranch(child)).join('')}</ul>`
        : '';
      return `<li>${renderNode(node, isRoot)}${childHtml}</li>`;
    };
    // Build ancestor chain (upwards)
    const byId = new Map((state.ctvs || []).map((x) => [Number(x.id || 0), x]));
    const ancestors = [];
    let cur = ctv;
    const upVisited = new Set();
    while (cur?.referrer_ctv_id) {
      const pid = Number(cur.referrer_ctv_id || 0);
      if (!pid || upVisited.has(pid)) break;
      upVisited.add(pid);
      const parent = byId.get(pid);
      if (!parent) break;
      ancestors.push(parent);
      cur = parent;
    }
    // Build unified tree: top-most ancestor -> ... -> current CTV -> downline children
    const chain = ancestors.reverse(); // top -> ... -> immediate parent
    let unifiedRoot = null;
    if (chain.length) {
      unifiedRoot = { ...chain[0], children: [] };
      let ptr = unifiedRoot;
      for (let i = 1; i < chain.length; i += 1) {
        const node = { ...chain[i], children: [] };
        ptr.children = [node];
        ptr = node;
      }
      // attach current CTV with its real children
      const downChildren = (byParent.get(Number(ctv.id || 0)) || []).map((child) => buildTree(child));
      const currentNode = { ...ctv, children: downChildren };
      ptr.children = [currentNode];
    } else {
      unifiedRoot = buildTree(ctv); // root is current CTV
    }

    treeRoot.innerHTML = `
      <div class="gb-tree-wrap">
        <ul class="gb-tree-root">
          ${renderBranch(unifiedRoot, false)}
        </ul>
      </div>
    `;
  }

  function avatarClassFromGender(gender) {
    if (gender === 'female') return 'gb-h-avatar-female';
    if (gender === 'male') return 'gb-h-avatar-male';
    return 'gb-h-avatar-neutral';
  }

  async function loadWalletRows() {
    if (!state.selectedCtv?.id) return;
    const rows = await api(`/ctv/${state.selectedCtv.id}/wallets`);
    const q = String($('gbSearchWalletInput')?.value || '').trim();
    const wrap = $('gbWalletTickets');
    if (!wrap) return;
    wrap.innerHTML = rows.filter((w) => includesQuery(q, w.wallet_code, w.id, w.valid_to)).map((w) => {
      const perService = [
        `Implant: ${formatMoneyVi(w.remaining_implant_amount || 0)}`,
        `Sứ: ${formatMoneyVi(w.remaining_porcelain_amount || 0)}`,
        `Tổng quát: ${formatMoneyVi(w.remaining_general_amount || 0)}`,
        `Niềng: ${formatMoneyVi(w.remaining_orthodontic_amount || 0)}`
      ].join('\n');
      const tooltip = [
        `Mã túi quà: ${w.wallet_code || `WALLET_${w.id}`}`,
        `Tổng: ${formatMoneyVi(w.total_value || 0)}`,
        `Đã dùng: ${formatMoneyVi(w.used_total || 0)}`,
        `Còn lại theo dịch vụ (năm nay):`,
        perService,
        `Hết hiệu lực: ${formatDateVi(w.valid_to)}`
      ].join('\n');
      return `
        <button class="gb-ticket" type="button" data-use-wallet="${w.id}" title="${escapeHtml(tooltip)}">
          <div class="gb-ticket-left" aria-hidden="true">
            <div class="gb-ticket-icon">${iconGiftBox()}</div>
          </div>
          <div class="gb-ticket-body">
            <div class="gb-ticket-code">${escapeHtml(state.selectedCtv?.name || 'CTV')}</div>
            <div class="gb-ticket-sub">${escapeHtml(w.wallet_code || `WALLET_${w.id}`)}</div>
            <div class="gb-ticket-meta">
              <div><span class="gb-ticket-k">Tổng</span> <span class="gb-ticket-v">${formatMoneyVi(w.total_value || 0)}</span></div>
              <div><span class="gb-ticket-k">Đã dùng</span> <span class="gb-ticket-v">${formatMoneyVi(w.used_total || 0)}</span></div>
              <div><span class="gb-ticket-k">HSD</span> <span class="gb-ticket-v">${escapeHtml(formatDateVi(w.valid_to))}</span></div>
            </div>
            <div class="gb-ticket-remain">
              <div class="gb-ticket-remain-title">Còn lại theo dịch vụ (năm nay)</div>
              <div class="gb-ticket-remain-grid">
                <div>Implant: <b>${formatMoneyVi(w.remaining_implant_amount || 0)}</b></div>
                <div>Sứ: <b>${formatMoneyVi(w.remaining_porcelain_amount || 0)}</b></div>
                <div>Tổng quát: <b>${formatMoneyVi(w.remaining_general_amount || 0)}</b></div>
                <div>Niềng: <b>${formatMoneyVi(w.remaining_orthodontic_amount || 0)}</b></div>
              </div>
            </div>
          </div>
        </button>
      `;
    }).join('');
    wrap.querySelectorAll('[data-use-wallet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = Number(btn.getAttribute('data-use-wallet') || 0);
        const wallet = rows.find((x) => Number(x.id || 0) === targetId);
        if (wallet) openUseWalletModal(wallet);
      });
    });
  }

  function openUseWalletModal(wallet) {
    state.selectedWallet = wallet;
    $('gbUseWalletHeaderName').textContent = state.selectedCtv?.name || 'Cộng tác viên';
    $('gbUseWalletHeaderAvatar').className = `gb-title-avatar gb-h-avatar ${avatarClassFromGender(state.selectedCtv?.gender)}`;
    $('gbUseWalletCode').value = wallet.wallet_code || `WALLET_${wallet.id}`;
    $('gbUseServiceCategory').value = 'implant';
    $('gbUseCustomerName').value = state.selectedCtv?.name || '';
    $('gbUseCustomerPhone').value = state.selectedCtv?.phone || '';
    $('gbUseCustomerCode').value = String(state.selectedCtv?.customer_code || '').trim();
    $('gbUseGiftAmount').value = '0';
    $('gbUseNote').value = '';
    syncUseWalletMoneyInputs({ clampGift: true });
    openOverlay('gbUseWalletOverlay');
  }

  async function submitUseWallet() {
    if (!state.selectedWallet?.id || !state.selectedCtv?.id) {
      setPing('Chưa chọn ví gói quà', false);
      return;
    }
    const service_category = String($('gbUseServiceCategory').value || '').trim();
    const customerName = String($('gbUseCustomerName').value || '').trim();
    const customerPhone = String($('gbUseCustomerPhone').value || '').trim();
    const customer_code = String($('gbUseCustomerCode').value || '').trim();
    syncUseWalletMoneyInputs({ clampGift: true });
    const gift_used = parseMoneyInput($('gbUseGiftAmount').value || 0);
    const invoice_amount = gift_used;
    const note = String($('gbUseNote').value || '').trim();
    if (!customerName) {
      setPing('Vui lòng nhập tên khách hàng', false);
      return;
    }
    if (!customer_code) {
      setPing('Vui lòng nhập mã KH từ CRM', false);
      $('gbUseCustomerCode')?.focus();
      return;
    }
    if (!(gift_used > 0)) {
      setPing('Vui lòng nhập số tiền dùng từ gói quà lớn hơn 0', false);
      $('gbUseGiftAmount')?.focus();
      return;
    }
    if (!note) {
      setPing('Vui lòng nhập ghi chú mục đích sử dụng (ai dùng / mục đích / mã KH)', false);
      $('gbUseNote')?.focus();
      return;
    }
    const customer = await api('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: customerName,
        phone: customerPhone,
        referrer_ctv_id: Number(state.selectedCtv.id)
      })
    });
    const order_code = `ORD_${Date.now()}`;
    const orderResult = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: Number(customer.id),
        wallet_id: Number(state.selectedWallet.id),
        order_code,
        service_category,
        invoice_amount,
        gift_used,
        customer_code,
        note: `${note}`,
        operator: {
          id: state.currentUser?.id || null,
          username: state.currentUser?.username || null,
          role: state.currentUser?.role || null
        }
      })
    });
    setPing('Sử dụng gói quà thành công', true);
    closeOverlay('gbUseWalletOverlay');
    // Update cache to avoid re-fetch
    await Promise.all([loadWalletRows(), loadCtvWalletTickets(), loadGiftbagUsageForSelectedCtv(), loadCommissionRows()]);
  }

  async function loadCommissionRows() {
    if (!state.selectedCtv?.id) return;
    const rows = await api(`/ctv/${state.selectedCtv.id}/commissions`);
    const tbody = $('gbCommissionRows');
    if (!tbody) return;
    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.order_code || '')}</td>
        <td>${formatMoneyVi(
          Number(row.commission_amount || 0) > 0
            ? Number(row.commission_amount || 0)
            : Number((Number(row.invoice_amount || 0) * Number(row.commission_rate || 0.1)).toFixed(0))
        )}</td>
        <td>${row.status === 'unpaid' ? 'Chưa thanh toán' : row.status === 'paid' ? 'Đã thanh toán' : escapeHtml(row.status || 'pending')}</td>
      </tr>
    `).join('');
  }

  async function loadGiftbagUsageForSelectedCtv() {
    if (!state.selectedCtv?.id) return;
    const year = new Date().getUTCFullYear();
    const payload = await api(`/ctv/${state.selectedCtv.id}/giftbag-usage?year=${year}`);
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    const tbody = $('gbGiftbagUsageRows');
    if (!tbody) return;
    tbody.innerHTML = rows.map((row) => {
      const remain = row.remain || {};
      const tooltip = [
        `Thời gian: ${String(row.used_at || '').slice(0, 19).replace('T', ' ')}`,
        `User thao tác: ${row.by || '-'}`,
        `Mục đích: ${row.purpose || '-'}`,
        `Mã KH: ${row.customer_code || '-'}`,
        `Dịch vụ: ${formatServiceCategory(row.service_category)}`,
        `Đã dùng: ${formatMoneyVi(row.gift_used || 0)}`
      ].join('\n');
      const remainHtml = remain
        ? [
          `Implant: ${formatMoneyVi(remain.remaining_implant_amount || 0)}`,
          `Sứ: ${formatMoneyVi(remain.remaining_porcelain_amount || 0)}`,
          `Tổng quát: ${formatMoneyVi(remain.remaining_general_amount || 0)}`,
          `Niềng: ${formatMoneyVi(remain.remaining_orthodontic_amount || 0)}`
        ].join('<br/>')
        : '-';
      return `
        <tr>
          <td>${escapeHtml(String(row.used_at || '').slice(0, 19).replace('T', ' '))}</td>
          <td>${escapeHtml(row.by || '-')}</td>
          <td class="gb-usage-purpose" title="${escapeHtml(tooltip)}">${escapeHtml(row.purpose || '-')}</td>
          <td>${escapeHtml(row.customer_code || '-')}</td>
          <td>${escapeHtml(formatServiceCategory(row.service_category))}</td>
          <td title="${escapeHtml(tooltip)}">${formatMoneyVi(row.gift_used || 0)}</td>
          <td title="${escapeHtml(tooltip)}">${remainHtml}</td>
        </tr>
      `;
    }).join('');
  }

  function openPayVoucherModal(voucher) {
    state.selectedPayVoucher = voucher;
    if ($('gbPayVoucherCode')) $('gbPayVoucherCode').value = voucher.voucher_code || `VOUCHER_${voucher.id}`;
    if ($('gbPayVoucherHeaderName')) $('gbPayVoucherHeaderName').textContent = voucher.recipient_name || 'CTV';
    if ($('gbPayVoucherCustomerCode')) {
      $('gbPayVoucherCustomerCode').value = String(voucher.source_customer_code || voucher.payment_customer_code || state.selectedCtv?.customer_code || '').trim();
    }
    const amount = Number(voucher.commission_amount || 0);
    if ($('gbPayVoucherPaidAmount')) $('gbPayVoucherPaidAmount').value = formatMoneyVi(amount);
    if ($('gbPayVoucherNote')) $('gbPayVoucherNote').value = '';
    const isPaid = voucher.status === 'paid';
    const submitBtn = $('gbPayVoucherSubmitBtn');
    if (submitBtn) submitBtn.disabled = isPaid;
    if ($('gbPayVoucherNote')) $('gbPayVoucherNote').readOnly = isPaid;
    openOverlay('gbPayVoucherOverlay');
  }

  async function submitPayVoucher() {
    const v = state.selectedPayVoucher;
    if (!v?.id) {
      setPing('Chưa chọn phiếu hoa hồng để thanh toán', false);
      return;
    }
    const customer_code = String($('gbPayVoucherCustomerCode')?.value || '').trim();
    const note = String($('gbPayVoucherNote')?.value || '').trim() || null;

    if (!customer_code) {
      setPing('Mã KH chưa có để tự điền. Vui lòng kiểm tra dữ liệu CTV nguồn.', false);
      $('gbPayVoucherCustomerCode')?.focus();
      return;
    }

    await api(`/commission-vouchers/${v.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({
        customer_code,
        note,
        operator: {
          id: state.currentUser?.id || null,
          username: state.currentUser?.username || null,
          role: state.currentUser?.role || null
        }
      })
    });

    setPing('Đã thanh toán phiếu hoa hồng', true);
    closeOverlay('gbPayVoucherOverlay');
    // Update caches to avoid extra API calls
    await Promise.all([
      loadCtvVoucherTickets(),
      loadVoucherRows()
    ]);
  }

  function renderManagerData() {
    const vouchers = state.managerData.vouchers || [];
    const usages = state.managerData.usages || [];
    const payments = state.managerData.payments || [];
    const wallets = state.managerData.wallets || [];
    const qWallet = String($('gbSearchManagerWalletInput')?.value || '').trim();
    const qVoucher = String($('gbSearchManagerVoucherInput')?.value || '').trim();
    const qUsage = String($('gbSearchManagerUsageInput')?.value || '').trim();
    const qPayment = String($('gbSearchManagerPaymentInput')?.value || '').trim();
    const voucherRows = $('gbManagerVoucherRows');
    const usageRows = $('gbManagerUsageRows');
    const paymentRows = $('gbManagerPaymentRows');
    const walletRows = $('gbManagerWalletRows');
    if (voucherRows) { voucherRows.innerHTML = ''; }
    // Render vouchers as tickets
    const iconCheck = () => `<svg viewBox="0 0 24 24"><path d="M20 7l-9 9-4-4" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
    const iconClock = () => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" stroke-width="2"/><path d="M12 7v6l4 2" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
    const vouchersGrid = document.createElement('div');
    vouchersGrid.className = 'gb-ticket-grid';
    vouchersGrid.innerHTML = vouchers
      .filter((row) => includesQuery(qVoucher, row.recipient_name, row.voucher_code, row.source_name, row.status, row.recipient_code, row.source_code))
      .map((row) => {
        const amount = Number(row.commission_amount || 0) > 0
          ? Number(row.commission_amount || 0)
          : Number((Number(row.base_amount || 0) * Number(row.commission_rate || 0.1)).toFixed(0));
        const tooltip = [
          `Mã phiếu: ${row.voucher_code || `VOUCHER_${row.id}`}`,
          `Người nhận: ${row.recipient_name || ''} (${row.recipient_code || ''})`,
          `Nguồn: ${row.source_name || ''} (${row.source_code || ''})`,
          `Số tiền: ${formatMoneyVi(amount)}`,
          `Trạng thái: ${row.status}`,
          `${row.status === 'paid' ? `Đã TT: ${String(row.paid_at || '').slice(0,19).replace('T',' ')}` : ''}`
        ].join('\n');
        const statusIcon = row.status === 'paid' ? iconCheck() : iconClock();
        return `
          <div class="gb-ticket" title="${escapeHtml(tooltip)}" data-pay-voucher="${row.id}">
            <div class="gb-ticket-left" aria-hidden="true"><div class="gb-ticket-icon">${statusIcon}</div></div>
            <div class="gb-ticket-body">
              <div class="gb-ticket-code">${escapeHtml(row.recipient_name || 'CTV')}</div>
              <div class="gb-ticket-sub">${escapeHtml(row.voucher_code || `VOUCHER_${row.id}`)}</div>
              <div class="gb-ticket-meta">
                <div><span class="gb-ticket-k">Mã phiếu</span> <span class="gb-ticket-v">${escapeHtml(row.voucher_code || `VOUCHER_${row.id}`)}</span></div>
                <div><span class="gb-ticket-k">Số tiền</span> <span class="gb-ticket-v">${formatMoneyVi(amount)}</span></div>
                <div><span class="gb-ticket-k">TT</span> <span class="gb-ticket-v">${row.status === 'paid' ? 'Đã TT' : 'Chưa TT'}</span></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    const voucherPanel = document.getElementById('gbManagerPanelVoucher');
    if (voucherPanel) {
      const wrap = voucherPanel.querySelector('.gb-table-wrap');
      if (wrap) wrap.replaceWith(vouchersGrid);
      else {
        voucherPanel.querySelectorAll('.gb-ticket-grid').forEach((el) => el.remove());
        voucherPanel.appendChild(vouchersGrid);
      }
    }
    vouchersGrid.querySelectorAll('[data-pay-voucher]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          const id = Number(el.getAttribute('data-pay-voucher') || 0);
          const voucher = vouchers.find((x) => Number(x.id || 0) === id);
          if (!voucher) throw new Error('Không tìm thấy phiếu hoa hồng');
          openPayVoucherModal(voucher);
        } catch (e) {
          setPing(String(e.message || e), false);
        }
      });
    });
    if (walletRows) { walletRows.innerHTML = ''; }
    const walletTickets = document.createElement('div');
    walletTickets.className = 'gb-ticket-grid';

    // chunked rendering to avoid blocking main thread when many wallets
    const filteredWallets = wallets.filter((row) => includesQuery(qWallet, row.ctv_name, row.wallet_code, row.ctv_code, row.valid_to));
    const seq = ++walletRenderSeq;
    walletTickets.innerHTML = '';
    const chunkSize = 80;
    let index = 0;
    const renderNext = () => {
      if (seq !== walletRenderSeq) return; // cancelled by new render
      if (index >= filteredWallets.length) {
        // attach events after final DOM present
        walletTickets.querySelectorAll('[data-manager-use-wallet]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              const walletId = Number(btn.getAttribute('data-manager-use-wallet') || 0);
              const wallet = (wallets || []).find((x) => Number(x.id || 0) === walletId);
              if (!wallet) throw new Error('Không tìm thấy túi quà');
              const ctvId = Number(wallet.ctv_id || 0);
              let ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === ctvId);
              if (!ctv) {
                await loadCtvs();
                ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === ctvId);
              }
              if (!ctv) throw new Error('Không tìm thấy CTV của túi quà');
              state.selectedCtv = ctv;
              openUseWalletModal(wallet);
            } catch (e) {
              setPing(String(e.message || e), false);
            }
          });
        });
        return;
      }
      const end = Math.min(index + chunkSize, filteredWallets.length);
      const slice = filteredWallets.slice(index, end);
      const html = slice.map((row) => {
        const tooltip = [
          `Mã túi quà: ${row.wallet_code || `WALLET_${row.id}`}`,
          `CTV: ${row.ctv_name || ''} (${row.ctv_code || ''})`,
          `Tổng: ${formatMoneyVi(row.total_value || 0)}`,
          `Đã dùng: ${formatMoneyVi(row.used_total || 0)}`,
          `HSD: ${escapeHtml(formatDateVi(row.valid_to))}`
        ].join('\n');
        return `
          <div class="gb-ticket" title="${escapeHtml(tooltip)}" data-manager-use-wallet="${row.id}">
            <div class="gb-ticket-left" aria-hidden="true"><div class="gb-ticket-icon">${iconGiftBox()}</div></div>
            <div class="gb-ticket-body">
              <div class="gb-ticket-code">${escapeHtml(row.ctv_name || 'CTV')}</div>
              <div class="gb-ticket-sub">${escapeHtml(row.wallet_code || `WALLET_${row.id}`)}</div>
              <div class="gb-ticket-meta">
                <div><span class="gb-ticket-k">Tổng</span> <span class="gb-ticket-v">${formatMoneyVi(row.total_value || 0)}</span></div>
                <div><span class="gb-ticket-k">Đã dùng</span> <span class="gb-ticket-v">${formatMoneyVi(row.used_total || 0)}</span></div>
                <div><span class="gb-ticket-k">HSD (năm nay)</span> <span class="gb-ticket-v">${escapeHtml(formatDateVi(row.valid_to))}</span></div>
              </div>
              <div class="gb-ticket-remain">
                <div class="gb-ticket-remain-title">Còn lại theo dịch vụ (năm nay)</div>
                <div class="gb-ticket-remain-grid">
                  <div>Implant: <b>${formatMoneyVi(row.remaining_implant_amount || 0)}</b></div>
                  <div>Sứ: <b>${formatMoneyVi(row.remaining_porcelain_amount || 0)}</b></div>
                  <div>Tổng quát: <b>${formatMoneyVi(row.remaining_general_amount || 0)}</b></div>
                  <div>Niềng: <b>${formatMoneyVi(row.remaining_orthodontic_amount || 0)}</b></div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
      const temp = document.createElement('div');
      temp.innerHTML = html;
      while (temp.firstChild) walletTickets.appendChild(temp.firstChild);
      index = end;
      window.requestAnimationFrame(renderNext);
    };
    window.requestAnimationFrame(renderNext);
    const walletPanel = document.getElementById('gbManagerPanelWallet');
    if (walletPanel) {
      const wrap = walletPanel.querySelector('.gb-table-wrap');
      if (wrap) wrap.replaceWith(walletTickets);
      else {
        walletPanel.querySelectorAll('.gb-ticket-grid').forEach((el) => el.remove());
        walletPanel.appendChild(walletTickets);
      }
    }
    // events bound after chunked render completes
    if (usageRows) {
      const parseNotePurpose = (noteRaw) => {
        const raw = String(noteRaw || '');
        const m = raw.match(/\[purpose:([^\]]*)\]/i);
        return m ? String(m[1] || '').trim() : '';
      };
      const parseNoteBy = (noteRaw) => {
        const raw = String(noteRaw || '');
        const m = raw.match(/\[by:([^\]]*)\]/i);
        return m ? String(m[1] || '').trim() : '';
      };
      usageRows.innerHTML = usages
        .filter((row) => includesQuery(qUsage, row.wallet_code, row.customer_code, row.customer_name, row.ctv_code, row.ctv_name, row.service_category, row.used_at))
        .map((row) => {
          const by = parseNoteBy(row.note) || '-';
          const purpose = parseNotePurpose(row.note) || '-';
          const tooltip = [
            `Thời gian: ${String(row.used_at || '').slice(0, 19).replace('T', ' ')}`,
            `Ai dùng: ${by}`,
            `Mục đích: ${purpose}`,
            `Mã KH: ${row.customer_code || '-'}`,
            `Đã dùng: ${formatMoneyVi(row.gift_used || 0)}`
          ].join('\n');
          return `
        <tr>
          <td>${escapeHtml(row.wallet_code || '-')}</td>
          <td>${escapeHtml(row.customer_code || '-')}</td>
          <td>${escapeHtml(row.customer_name || '')}</td>
          <td>${escapeHtml(row.ctv_code || '')} - ${escapeHtml(row.ctv_name || '')}</td>
          <td>${escapeHtml(formatServiceCategory(row.service_category))}</td>
          <td title="${escapeHtml(tooltip)}">${formatMoneyVi(row.gift_used || 0)}</td>
          <td>${escapeHtml(String(row.used_at || '').slice(0, 19).replace('T', ' '))}</td>
        </tr>
      `;
        }).join('');
    }
    if (paymentRows) {
      const seen = new Set();
      const uniqPayments = [];
      payments.forEach((row) => {
        const key = String(row.id || row.voucher_code || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        uniqPayments.push(row);
      });
      paymentRows.innerHTML = uniqPayments
        .filter((row) => includesQuery(qPayment, row.recipient_name, row.voucher_code, row.paid_at, row.note, row.recipient_code))
        .map((row) => {
          const purpose = String(row.note || '').trim();
          return `
        <tr>
          <td>${escapeHtml(row.recipient_name || '')}</td>
          <td>${escapeHtml(row.voucher_code || `VOUCHER_${row.id}`)}</td>
          <td>${formatMoneyVi(row.commission_amount || 0)}</td>
          <td>${escapeHtml(String(row.paid_at || '').slice(0, 19).replace('T', ' '))}</td>
          <td>${escapeHtml(purpose)}</td>
        </tr>
      `;
        }).join('');
    }
  }

  function refreshManagerViewIfOpen() {
    if (isOverlayOpen('gbManagerOverlay')) {
      renderManagerData();
    }
  }

  function updateCtvWalletCount(ctvId, delta) {
    const ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === Number(ctvId || 0));
    if (!ctv) return;
    ctv.wallet_count = Math.max(0, Number(ctv.wallet_count || 0) + Number(delta || 0));
    renderCtvTable();
  }

  function updateCtvVoucherCount(ctvId, delta) {
    const ctv = (state.ctvs || []).find((x) => Number(x.id || 0) === Number(ctvId || 0));
    if (!ctv) return;
    ctv.voucher_count = Math.max(0, Number(ctv.voucher_count || 0) + Number(delta || 0));
    renderCtvTable();
  }

  function handleGiftbagEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    const type = String(evt.type || '').trim();
    const payload = evt.payload || {};
    if (type === 'wallet_created') {
      const walletId = Number(payload.wallet_id || 0);
      if (walletId && Array.isArray(state.managerData.wallets)) {
        const exists = state.managerData.wallets.find((w) => Number(w.id || 0) === walletId);
        if (!exists) {
          const total = Number(payload.total_value || 0);
          const yearlyCap = Number(payload.annual_cap || 0) > 0
            ? Number(payload.annual_cap || 0)
            : Number((total * 0.1).toFixed(0));
          const allocImplantYear = Number((yearlyCap * Number(payload.alloc_implant_pct || 0) / 100).toFixed(0));
          const allocPorcelainYear = Number((yearlyCap * Number(payload.alloc_porcelain_pct || 0) / 100).toFixed(0));
          const allocGeneralYear = Number((yearlyCap * Number(payload.alloc_general_pct || 0) / 100).toFixed(0));
          const allocOrthoYear = Number((yearlyCap * Number(payload.alloc_orthodontic_pct || 0) / 100).toFixed(0));
          state.managerData.wallets.unshift({
            id: walletId,
            wallet_code: payload.wallet_code,
            ctv_id: Number(payload.ctv_id || 0),
            ctv_code: payload.ctv_code || '',
            ctv_name: payload.ctv_name || '',
            total_value: total,
            valid_from: payload.valid_from || '',
            valid_to: payload.valid_to || '',
            used_total: 0,
            remaining_implant_amount: allocImplantYear,
            remaining_porcelain_amount: allocPorcelainYear,
            remaining_general_amount: allocGeneralYear,
            remaining_orthodontic_amount: allocOrthoYear
          });
        }
      }
      updateCtvWalletCount(payload.ctv_id, 1);
      refreshManagerViewIfOpen();
      if (Number(state.selectedCtv?.id || 0) === Number(payload.ctv_id || 0)) {
        loadWalletRows().catch(() => {});
        loadCtvWalletTickets().catch(() => {});
      }
      return;
    }
    if (type === 'voucher_paid') {
      const voucherId = Number(payload.voucher_id || 0);
      if (voucherId && Array.isArray(state.managerData.vouchers)) {
        const v = state.managerData.vouchers.find((x) => Number(x.id || 0) === voucherId);
        if (v) {
          v.status = 'paid';
          v.paid_at = payload.paid_at || new Date().toISOString();
        }
      }
      if (Array.isArray(state.managerData.payments)) {
        const exists = state.managerData.payments.find((x) => Number(x.id || 0) === voucherId);
        if (!exists) {
          state.managerData.payments.unshift({
            id: voucherId,
            voucher_code: payload.voucher_code || '',
            recipient_name: payload.recipient_name || '',
            recipient_code: payload.recipient_code || '',
            commission_amount: Number(payload.commission_amount || 0),
            paid_at: payload.paid_at || new Date().toISOString(),
            note: payload.payment_note || ''
          });
        }
      }
      updateCtvVoucherCount(payload.recipient_ctv_id, -1);
      refreshManagerViewIfOpen();
      if (Number(state.selectedCtv?.id || 0) === Number(payload.recipient_ctv_id || 0)) {
        loadCtvVoucherTickets().catch(() => {});
        loadVoucherRows().catch(() => {});
      }
      return;
    }
    if (type === 'voucher_created') {
      const voucherId = Number(payload.voucher_id || 0);
      if (voucherId && Array.isArray(state.managerData.vouchers)) {
        const exists = state.managerData.vouchers.find((x) => Number(x.id || 0) === voucherId);
        if (!exists) {
          state.managerData.vouchers.unshift({
            id: voucherId,
            voucher_code: payload.voucher_code || '',
            recipient_code: payload.recipient_code || '',
            recipient_name: payload.recipient_name || '',
            source_code: payload.source_code || '',
            source_name: payload.source_name || '',
            commission_amount: Number(payload.commission_amount || 0),
            status: payload.status || 'unpaid',
            created_at: payload.created_at || new Date().toISOString()
          });
        }
      }
      updateCtvVoucherCount(payload.recipient_ctv_id, 1);
      refreshManagerViewIfOpen();
      return;
    }
    if (type === 'wallet_used') {
      if (Array.isArray(state.managerData.usages)) {
        state.managerData.usages.unshift({
          wallet_code: payload.wallet_code || '',
          customer_code: payload.customer_code || '',
          customer_name: payload.customer_name || '',
          ctv_code: payload.ctv_code || '',
          ctv_name: payload.ctv_name || '',
          service_category: payload.service_category || '',
          gift_used: Number(payload.gift_used || 0),
          used_at: payload.used_at || new Date().toISOString(),
          note: payload.purpose || ''
        });
      }
      if (Array.isArray(state.managerData.wallets)) {
        const w = state.managerData.wallets.find((x) => Number(x.id || 0) === Number(payload.wallet_id || 0));
        if (w) {
          const used = Number(payload.gift_used || 0);
          w.used_total = Number(w.used_total || 0) + used;
          if (payload.service_category === 'implant') w.remaining_implant_amount = Math.max(0, Number(w.remaining_implant_amount || 0) - used);
          if (payload.service_category === 'porcelain') w.remaining_porcelain_amount = Math.max(0, Number(w.remaining_porcelain_amount || 0) - used);
          if (payload.service_category === 'general') w.remaining_general_amount = Math.max(0, Number(w.remaining_general_amount || 0) - used);
          if (payload.service_category === 'orthodontic') w.remaining_orthodontic_amount = Math.max(0, Number(w.remaining_orthodontic_amount || 0) - used);
        }
      }
      refreshManagerViewIfOpen();
      if (Number(state.selectedCtv?.id || 0) === Number(payload.ctv_id || 0)) {
        loadWalletRows().catch(() => {});
        loadCtvWalletTickets().catch(() => {});
        loadGiftbagUsageForSelectedCtv().catch(() => {});
      }
    }
  }

  async function loadManagerData(options = {}) {
    let vouchers;
    let usages;
    let payments;
    let wallets;
    let commissionSettings;

    [vouchers, usages, payments, wallets, commissionSettings] = await Promise.all([
      api('/commission-vouchers'),
      api('/history/usage'),
      api('/history/voucher-payments'),
      api('/wallets'),
      api('/settings/commission-voucher')
    ]);

    state.managerData = { vouchers, usages, payments, wallets };
    if ($('gbCommissionLevel1Percent')) $('gbCommissionLevel1Percent').value = String(Number(commissionSettings?.level1_percent ?? 10));
    if ($('gbCommissionLevel2Percent')) $('gbCommissionLevel2Percent').value = String(Number(commissionSettings?.level2_percent ?? 10));
    renderManagerData();
  }

  async function saveCommissionVoucherSettings() {
    const level1_percent = parsePercentInput($('gbCommissionLevel1Percent')?.value || 10);
    const level2_percent = parsePercentInput($('gbCommissionLevel2Percent')?.value || 10);
    await api('/settings/commission-voucher', {
      method: 'PUT',
      body: JSON.stringify({ level1_percent, level2_percent })
    });
    setPing('Đã lưu cấu hình hoa hồng cấp trên', true);
    await loadManagerData({ force: true });
  }

  function switchManagerPanel(panelName) {
    const allowed = new Set(['wallet', 'voucher', 'history', 'sync-gdv25']);
    const key = allowed.has(panelName) ? panelName : 'wallet';
    document.querySelectorAll('[data-manager-panel]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-manager-panel') === key);
    });
    $('gbManagerPanelWallet')?.classList.toggle('is-active', key === 'wallet');
    $('gbManagerPanelVoucher')?.classList.toggle('is-active', key === 'voucher');
    $('gbManagerPanelHistory')?.classList.toggle('is-active', key === 'history');
    $('gbManagerPanelSyncGdv25')?.classList.toggle('is-active', key === 'sync-gdv25');
    // Defer render to next frame to avoid blocking tab transition
    window.requestAnimationFrame(() => {
      renderManagerData();
    });
  }

  async function syncGdv25({ dryRun = false } = {}) {
    const fileInput = $('gbGdv25File');
    const f = fileInput?.files?.[0];
    if (!f) {
      setPing('Chưa chọn file Excel', false);
      return;
    }
    const form = new FormData();
    form.append('file', f);
    form.append('dry_run', dryRun ? '1' : '0');
    logGdv25(`Bắt đầu ${dryRun ? 'dry-run' : 'sync'}: ${f.name} (${Math.round(f.size / 1024)} KB)`);
    const result = await apiForm('/sync/gdv25vnp', form);
    logGdv25(`Hoàn tất: rows=${result?.summary?.rows_total ?? '-'}, ok=${result?.summary?.rows_ok ?? '-'}, wallets_created=${result?.summary?.wallets_created ?? '-'}`);
    if (Array.isArray(result?.errors) && result.errors.length) {
      logGdv25(`Lỗi (${result.errors.length}):`);
      result.errors.slice(0, 40).forEach((e) => {
        logGdv25(`- row ${e.row_number}: ${e.customer_code || '-'} :: ${e.message}`);
      });
    }
    setPing(dryRun ? 'Dry-run xong. Xem log trong tab Sync GDV 25.' : 'Sync GDV 25 xong. Xem log trong tab Sync GDV 25.', true);
  }

  async function loadVoucherRows() {
    if (!state.selectedCtv?.id) return;
    const rows = await api(`/ctv/${state.selectedCtv.id}/commission-vouchers`);
    const q = String($('gbSearchVoucherInput')?.value || '').trim();
    const tbody = $('gbVoucherRows');
    if (!tbody) return;
    tbody.innerHTML = rows.filter((row) => includesQuery(q, row.voucher_code, row.source_code, row.source_name, row.status)).map((row) => `
      <tr data-voucher-pay-inline="${row.id}">
        <td>${escapeHtml(row.voucher_code || `VOUCHER_${state.selectedCtv?.code || ""}_${row.id}`)}</td>
        <td>${escapeHtml(row.source_code || '')} - ${escapeHtml(row.source_name || '')}</td>
        <td>${formatMoneyVi(
          Number(row.commission_amount || 0) > 0
            ? Number(row.commission_amount || 0)
            : Number((Number(row.base_amount || 0) * Number(row.commission_rate || 0.1)).toFixed(0))
        )}</td>
        <td>${escapeHtml(String(row.created_at || '').slice(0, 19).replace('T', ' '))}</td>
        <td><span class="gb-status ${row.status === 'paid' ? 'is-paid' : 'is-unpaid'}">${row.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}</span></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('[data-voucher-pay-inline]').forEach((rowEl) => {
      rowEl.addEventListener('click', () => {
        const id = Number(rowEl.getAttribute('data-voucher-pay-inline') || 0);
        const voucher = rows.find((x) => Number(x.id || 0) === id);
        if (!voucher) return;
        openPayVoucherModal({
          ...voucher,
          recipient_name: state.selectedCtv?.name,
          recipient_ctv_id: state.selectedCtv?.id,
          recipient_code: state.selectedCtv?.code
        });
      });
    });
  }

  async function loadCtvWalletTickets() {
    if (!state.selectedCtv?.id) return;
    const rows = await api(`/ctv/${state.selectedCtv.id}/wallets`);
    const q = String($('gbSearchCtvWalletInput')?.value || '').trim();
    const grid = $('gbCtvWalletTickets');
    if (!grid) return;
    const filtered = rows.filter((row) => includesQuery(q, row.ctv_name, row.wallet_code, row.ctv_code, row.valid_to));
    grid.innerHTML = filtered.map((row) => {
      const tooltip = [
        `Mã túi quà: ${row.wallet_code || `WALLET_${row.id}`}`,
        `CTV: ${row.ctv_name || ''} (${row.ctv_code || ''})`,
        `Tổng: ${formatMoneyVi(row.total_value || 0)}`,
        `Đã dùng: ${formatMoneyVi(row.used_total || 0)}`,
        `HSD: ${escapeHtml(formatDateVi(row.valid_to))}`
      ].join('\n');
      return `
        <div class="gb-ticket" title="${escapeHtml(tooltip)}" data-ctv-use-wallet="${row.id}">
          <div class="gb-ticket-left" aria-hidden="true"><div class="gb-ticket-icon">${iconGiftBox()}</div></div>
          <div class="gb-ticket-body">
            <div class="gb-ticket-code">${escapeHtml(row.ctv_name || 'CTV')}</div>
            <div class="gb-ticket-sub">${escapeHtml(row.wallet_code || `WALLET_${row.id}`)}</div>
            <div class="gb-ticket-meta">
              <div><span class="gb-ticket-k">Tổng</span> <span class="gb-ticket-v">${formatMoneyVi(row.total_value || 0)}</span></div>
              <div><span class="gb-ticket-k">Đã dùng</span> <span class="gb-ticket-v">${formatMoneyVi(row.used_total || 0)}</span></div>
              <div><span class="gb-ticket-k">HSD (năm nay)</span> <span class="gb-ticket-v">${escapeHtml(formatDateVi(row.valid_to))}</span></div>
            </div>
            <div class="gb-ticket-remain">
              <div class="gb-ticket-remain-title">Còn lại theo dịch vụ (năm nay)</div>
              <div class="gb-ticket-remain-grid">
                <div>Implant: <b>${formatMoneyVi(row.remaining_implant_amount || 0)}</b></div>
                <div>Sứ: <b>${formatMoneyVi(row.remaining_porcelain_amount || 0)}</b></div>
                <div>Tổng quát: <b>${formatMoneyVi(row.remaining_general_amount || 0)}</b></div>
                <div>Niềng: <b>${formatMoneyVi(row.remaining_orthodontic_amount || 0)}</b></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    grid.querySelectorAll('[data-ctv-use-wallet]').forEach((el) => {
      el.addEventListener('click', () => {
        const walletId = Number(el.getAttribute('data-ctv-use-wallet') || 0);
        const wallet = rows.find((x) => Number(x.id || 0) === walletId);
        if (!wallet) return;
        openUseWalletModal(wallet);
      });
    });
  }

  async function loadCtvVoucherTickets() {
    if (!state.selectedCtv?.id) return;
    const rows = await api(`/ctv/${state.selectedCtv.id}/commission-vouchers`);
    const q = String($('gbSearchCtvVoucherInput')?.value || '').trim();
    const grid = $('gbCtvVoucherTickets');
    if (!grid) return;
    const iconCheck = () => `<svg viewBox="0 0 24 24"><path d="M20 7l-9 9-4-4" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
    const iconClock = () => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" stroke-width="2"/><path d="M12 7v6l4 2" stroke="currentColor" fill="none" stroke-width="2"/></svg>`;
    const filtered = rows.filter((row) => includesQuery(q, row.voucher_code, row.source_name, row.status, row.source_code));
    grid.innerHTML = filtered.map((row) => {
      const amount = Number(row.commission_amount || 0) > 0
        ? Number(row.commission_amount || 0)
        : Number((Number(row.base_amount || 0) * Number(row.commission_rate || 0.1)).toFixed(0));
      const tooltip = [
        `Mã phiếu: ${row.voucher_code || `VOUCHER_${row.id}`}`,
        `Nguồn: ${row.source_name || ''} (${row.source_code || ''})`,
        `Số tiền: ${formatMoneyVi(amount)}`,
        `Trạng thái: ${row.status}`
      ].join('\n');
      const statusIcon = row.status === 'paid' ? iconCheck() : iconClock();
      return `
        <div class="gb-ticket" title="${escapeHtml(tooltip)}" data-ctv-pay-voucher="${row.id}">
          <div class="gb-ticket-left" aria-hidden="true"><div class="gb-ticket-icon">${statusIcon}</div></div>
          <div class="gb-ticket-body">
            <div class="gb-ticket-code">${escapeHtml(state.selectedCtv?.name || 'CTV')}</div>
            <div class="gb-ticket-sub">${escapeHtml(row.voucher_code || `VOUCHER_${row.id}`)}</div>
            <div class="gb-ticket-meta">
              <div><span class="gb-ticket-k">Mã phiếu</span> <span class="gb-ticket-v">${escapeHtml(row.voucher_code || `VOUCHER_${row.id}`)}</span></div>
              <div><span class="gb-ticket-k">Số tiền</span> <span class="gb-ticket-v">${formatMoneyVi(amount)}</span></div>
              <div><span class="gb-ticket-k">TT</span> <span class="gb-ticket-v">${row.status === 'paid' ? 'Đã TT' : 'Chưa TT'}</span></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    grid.querySelectorAll('[data-ctv-pay-voucher]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = Number(el.getAttribute('data-ctv-pay-voucher') || 0);
        const voucher = rows.find((x) => Number(x.id || 0) === id);
        if (!voucher) return;
        openPayVoucherModal({
          ...voucher,
          recipient_name: state.selectedCtv?.name,
          recipient_ctv_id: state.selectedCtv?.id,
          recipient_code: state.selectedCtv?.code
        });
      });
    });
  }

  async function loadCtvs() {
    state.ctvs = await api('/ctv');
    renderCtvTable();
    renderReferrerOptions();
    log(`Loaded CTV list: ${state.ctvs.length}`);
  }

  async function createCtv() {
    const customer_code = String($('gbCtvCustomerCode')?.value || '').trim().toUpperCase() || null;
    const referrer_ctv_id = Number($('gbReferrerSelect').value || 0) || null;
    const activated = new Date().toISOString().slice(0, 10);
    if (!customer_code) {
      setPing('Vui lòng nhập Mã KH Getfly', false);
      $('gbCtvCustomerCode')?.focus();
      return;
    }
    if (!state.getflyCtvDraft || String(state.getflyCtvDraft.account_code || "") !== customer_code) {
      setPing('Vui lòng bấm "Lấy từ Getfly" thành công trước khi lưu CTV', false);
      return;
    }
    const ctv = await api('/ctv', {
      method: 'POST',
      body: JSON.stringify({
        customer_code,
        profile: {
          name: String($("gbCtvName")?.value || "").trim() || null,
          phone: String($("gbCtvPhone")?.value || "").trim() || null,
          email: String($("gbCtvEmail")?.value || "").trim() || null,
          birthday: String($("gbCtvDob")?.value || "").trim() || null,
          gender: String($("gbCtvGender")?.value || "").trim() || null,
          address: String($("gbCtvAddress")?.value || "").trim() || null,
          relation_name: String($("gbCtvRelationName")?.value || "").trim() || null,
          description: String($("gbCtvDescription")?.value || "").trim() || null,
          note: String($("gbCtvNote")?.value || "").trim() || null
        },
        referrer_ctv_id,
        activated_at: activated
      })
    });
    log(`Created CTV: ${ctv.code}`);
    await loadCtvs();
    closeOverlay('gbCtvOverlay');
    $('gbCtvForm').reset();
    state.getflyCtvDraft = null;
  }

  async function fetchCustomerFromGetfly() {
    const customerCode = String($('gbSearchCustomerCode')?.value || '').trim().toUpperCase();
    if (!customerCode) {
      setPing('Vui lòng nhập Mã KH trước khi tra cứu', false);
      $('gbCtvCustomerCode')?.focus();
      return;
    }
    let payload;
    try {
      payload = await api(`/ctv/getfly/${encodeURIComponent(customerCode)}`);
    } catch (e) {
      if (String(e.message || '').includes('409')) {
        // Existing in DB: stop Getfly flow and guide user to add wallet
        showNotice({
          title: 'Mã KH đã tồn tại',
          subtitle: 'Giftbag',
          message: `Mã KH ${customerCode} đã tồn tại trong database.\nBạn có muốn mở CTV và thêm gói quà ngay không?`,
          kind: 'warn',
          actions: [
            {
              label: 'Mở CTV',
              variant: 'ghost',
              onClick: async () => {
                await loadCtvs();
                const found = (state.ctvs || []).find((x) => String(x.customer_code || '').trim().toUpperCase() === customerCode);
                if (found) openCtvDetailModal(found);
              }
            },
            {
              label: 'Thêm gói quà',
              variant: 'primary',
              onClick: async () => {
                await loadCtvs();
                const found = (state.ctvs || []).find((x) => String(x.customer_code || '').trim().toUpperCase() === customerCode);
                if (found) {
                  state.selectedCtv = found;
                  openCreateWalletModal(found);
                }
              }
            }
          ]
        });
        return;
      }
      const didSave = await ensureGetflyKeyIfMissing(e);
      if (!didSave) throw e;
      payload = await api(`/ctv/getfly/${encodeURIComponent(customerCode)}`);
    }
    const account = payload?.account || {};
    state.getflyCtvDraft = account;
    if ($("gbCtvCustomerCode")) $("gbCtvCustomerCode").value = customerCode;
    if ($("gbCtvName")) $("gbCtvName").value = String(account.account_name || account.relation_name || "").trim();
    if ($("gbCtvPhone")) $("gbCtvPhone").value = String(account.phone_office || "").trim();
    if ($("gbCtvEmail")) $("gbCtvEmail").value = String(account.email || "").trim();
    if ($("gbCtvDob")) $("gbCtvDob").value = toDateInputValue(account.birthday);
    if ($("gbCtvGender")) $("gbCtvGender").value = /male|nam/i.test(String(account.gender || "")) ? "male" : /female|nu|nữ/i.test(String(account.gender || "")) ? "female" : "other";
    if ($("gbCtvAddress")) $("gbCtvAddress").value = String(account.billing_address_street || account.address || "").trim();
    if ($("gbCtvRelationName")) $("gbCtvRelationName").value = String(account.relation_name || "").trim();
    if ($("gbCtvDescription")) $("gbCtvDescription").value = String(account.description || "").trim();
    closeOverlay("gbGetflySearchOverlay");
    openOverlay("gbCtvOverlay");
    setPing(`Đã lấy thông tin KH ${customerCode} từ Getfly`, true);
  }

  function openGetflySearchOverlayFromEvent(event) {
    const overlayId = "gbGetflySearchOverlay";
    openOverlay(overlayId);
    const searchInput = $("gbSearchCustomerCode");
    if (searchInput) {
      searchInput.value = String(state.selectedCtv?.customer_code || "").trim();
      searchInput.focus();
    }
  }

  async function createWalletForSelectedCtv() {
    if (!state.selectedCtv?.id) {
      setPing('Chưa chọn CTV', false);
      return;
    }
    const total_value = parseMoneyInput($('gbCreateWalletTotal').value || 0);
    const years = 10;
    const annualPercent = parsePercentInput($('gbCreateWalletAnnualPercent').value || 10);
    const annual_cap = Number(((total_value * annualPercent) / 100).toFixed(0));
    const alloc_implant_pct = parsePercentInput($('gbDistImplantPct').value || 40);
    const alloc_porcelain_pct = parsePercentInput($('gbDistPorcelainPct').value || 30);
    const alloc_general_pct = parsePercentInput($('gbDistGeneralPct').value || 20);
    const alloc_orthodontic_pct = parsePercentInput($('gbDistOrthoPct').value || 10);
    const allocTotal = alloc_implant_pct + alloc_porcelain_pct + alloc_general_pct + alloc_orthodontic_pct;
    if (Math.abs(allocTotal - 100) > 0.01) {
      setPing('Tổng % phân bổ dịch vụ phải bằng 100%', false);
      return;
    }
    const wallet = await api(`/ctv/${state.selectedCtv.id}/wallets`, {
      method: 'POST',
      body: JSON.stringify({
        total_value,
        years,
        annual_cap,
        alloc_implant_pct,
        alloc_porcelain_pct,
        alloc_general_pct,
        alloc_orthodontic_pct
      })
    });
    log(`Created wallet ${wallet.wallet_code || wallet.id} for CTV ${state.selectedCtv.code}`);
    setPing('Tạo túi quà thành công', true);
    closeOverlay('gbCreateWalletOverlay');
    await Promise.all([loadWalletRows(), loadCtvWalletTickets(), loadCtvs()]);
  }

  function openOverlay(overlayId) {
    const overlay = $(overlayId);
    if (!overlay) return;
    if (overlay.parentElement === document.body) {
      // Move to the end of body so this overlay is always on top layer.
      document.body.appendChild(overlay);
    }
    restoreModalState(overlayId);
    overlay.classList.remove('is-closing');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeOverlay(overlayId) {
    const overlay = $(overlayId);
    if (!overlay || !overlay.classList.contains('is-open')) return;
    saveModalState(overlayId);
    overlay.classList.add('is-closing');
    window.setTimeout(() => {
      overlay.classList.remove('is-open', 'is-closing');
      overlay.setAttribute('aria-hidden', 'true');
    }, 170);
  }

  function bindOverlayOutsideTapClose(overlayId, closeButtonId) {
    const overlay = $(overlayId);
    if (!overlay) return;
    const closeBtn = closeButtonId ? $(closeButtonId) : null;
    if (closeBtn) closeBtn.addEventListener('click', () => closeOverlay(overlayId));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeOverlay(overlayId);
    });
  }

  function activateTab(tabId) {
    const tabs = Array.from(document.querySelectorAll('#gbDetailTabs .gb-tab'));
    const panels = Array.from(document.querySelectorAll('.gb-tab-panel'));
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tabTarget === tabId));
    panels.forEach((panel) => panel.classList.toggle('is-active', panel.id === tabId));
    if (tabId === 'gbTabGiftbag') {
      loadGiftbagUsageForSelectedCtv().catch((e) => setPing(String(e.message || e), false));
    }
  }

  function readModalState() {
    try {
      const raw = localStorage.getItem(MODAL_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function getBodyOrigin() {
    const rect = document.body.getBoundingClientRect();
    return {
      left: Number(rect.left || 0),
      top: Number(rect.top || 0)
    };
  }

  function writeModalState(next) {
    try {
      localStorage.setItem(MODAL_STATE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function clampModalRect(rect, modal) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const style = getComputedStyle(modal.parentElement || modal);
    const inset = Number.parseFloat(style.paddingLeft || '0') || 0;
    const maxLeft = Math.max(8, vw - (rect.width || modal.offsetWidth || 0) - 8 - inset);
    const maxTop = Math.max(8, vh - (rect.height || modal.offsetHeight || 0) - 8 - inset);
    return {
      left: Math.min(maxLeft, Math.max(8, rect.left)),
      top: Math.min(maxTop, Math.max(8, rect.top)),
      width: rect.width,
      height: rect.height
    };
  }

  function saveModalState(overlayId) {
    const overlay = $(overlayId);
    const modal = overlay?.querySelector('.gb-modal');
    if (!overlay || !modal) return;
    const rect = modal.getBoundingClientRect();
    const bodyOrigin = getBodyOrigin();
    const safe = clampModalRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }, modal);
    const all = readModalState();
    all[overlayId] = {
      left: Math.round(safe.left - bodyOrigin.left),
      top: Math.round(safe.top - bodyOrigin.top),
      width: Math.round(safe.width),
      height: Math.round(safe.height)
    };
    writeModalState(all);
  }

  function centerModal(overlayId) {
    const overlay = $(overlayId);
    const modal = overlay?.querySelector('.gb-modal');
    if (!overlay || !modal) return;
    const width = modal.offsetWidth;
    const height = modal.offsetHeight;
    const bodyOrigin = getBodyOrigin();
    const left = Math.max(8, Math.round((window.innerWidth - width) / 2));
    const top = Math.max(8, Math.round((window.innerHeight - height) / 2));
    modal.style.left = `${left + bodyOrigin.left}px`;
    modal.style.top = `${top + bodyOrigin.top}px`;
    modal.style.transform = 'translate(0, 0)';
  }

  function restoreModalState(overlayId) {
    const overlay = $(overlayId);
    const modal = overlay?.querySelector('.gb-modal');
    if (!overlay || !modal) return;
    const all = readModalState();
    const saved = all[overlayId];
    if (!saved) {
      centerModal(overlayId);
      return;
    }
    const bodyOrigin = getBodyOrigin();
    if (saved.width) modal.style.width = `${saved.width}px`;
    if (saved.height) modal.style.height = `${saved.height}px`;
    const safe = clampModalRect({
      left: Number(saved.left || 0) + bodyOrigin.left,
      top: Number(saved.top || 0) + bodyOrigin.top,
      width: Number(saved.width || modal.offsetWidth),
      height: Number(saved.height || modal.offsetHeight)
    }, modal);
    modal.style.left = `${safe.left}px`;
    modal.style.top = `${safe.top}px`;
    modal.style.transform = 'translate(0, 0)';
  }

  function makeOverlayModalDraggable(overlayId) {
    const overlay = $(overlayId);
    const modal = overlay?.querySelector('.gb-modal');
    const titlebar = overlay?.querySelector('.gb-modal-titlebar');
    if (!overlay || !modal || !titlebar) return;
    let dragging = false;
    let pointerOffsetX = 0;
    let pointerOffsetY = 0;
    titlebar.style.cursor = 'move';
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const rect = modal.getBoundingClientRect();
      const currentLeft = Number.parseFloat(modal.style.left);
      const currentTop = Number.parseFloat(modal.style.top);
      const baseLeft = Number.isFinite(currentLeft) ? currentLeft : rect.left;
      const baseTop = Number.isFinite(currentTop) ? currentTop : rect.top;
      modal.style.left = `${Math.round(baseLeft)}px`;
      modal.style.top = `${Math.round(baseTop)}px`;
      modal.style.transform = 'translate(0, 0)';
      pointerOffsetX = e.clientX - baseLeft;
      pointerOffsetY = e.clientY - baseTop;
      dragging = true;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const next = clampModalRect({
        left: e.clientX - pointerOffsetX,
        top: e.clientY - pointerOffsetY,
        width: modal.offsetWidth,
        height: modal.offsetHeight
      }, modal);
      modal.style.left = `${Math.round(next.left)}px`;
      modal.style.top = `${Math.round(next.top)}px`;
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      saveModalState(overlayId);
    });
    modal.addEventListener('mouseup', () => saveModalState(overlayId));
    modal.addEventListener('mouseleave', () => saveModalState(overlayId));
    modal.addEventListener('transitionend', () => saveModalState(overlayId));
    window.addEventListener('resize', () => {
      if (!overlay.classList.contains('is-open')) return;
      restoreModalState(overlayId);
      saveModalState(overlayId);
    });
  }

  function ensureResizeHandles(modal) {
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach((dir) => {
      if (modal.querySelector(`.gb-r-${dir}`)) return;
      const handle = document.createElement('div');
      handle.className = `gb-resize-handle gb-r-${dir}`;
      handle.dataset.dir = dir;
      modal.appendChild(handle);
    });
  }

  function makeOverlayModalResizable(overlayId) {
    const overlay = $(overlayId);
    const modal = overlay?.querySelector('.gb-modal');
    if (!overlay || !modal) return;
    ensureResizeHandles(modal);

    let resizing = false;
    let resizeDir = '';
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startWidth = 0;
    let startHeight = 0;

    const getMinWidth = () => Number.parseInt(getComputedStyle(modal).minWidth, 10) || 420;
    const getMinHeight = () => Number.parseInt(getComputedStyle(modal).minHeight, 10) || 280;

    modal.querySelectorAll('.gb-resize-handle').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        const rect = modal.getBoundingClientRect();
        resizing = true;
        resizeDir = String(handle.dataset.dir || '');
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        startWidth = rect.width;
        startHeight = rect.height;
        modal.style.left = `${Math.round(rect.left)}px`;
        modal.style.top = `${Math.round(rect.top)}px`;
        modal.style.width = `${Math.round(rect.width)}px`;
        modal.style.height = `${Math.round(rect.height)}px`;
        modal.style.transform = 'translate(0, 0)';
        e.preventDefault();
        e.stopPropagation();
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const minW = getMinWidth();
      const minH = getMinHeight();
      let left = startLeft;
      let top = startTop;
      let width = startWidth;
      let height = startHeight;

      if (resizeDir.includes('e')) width = Math.max(minW, startWidth + dx);
      if (resizeDir.includes('s')) height = Math.max(minH, startHeight + dy);
      if (resizeDir.includes('w')) {
        width = Math.max(minW, startWidth - dx);
        left = startLeft + (startWidth - width);
      }
      if (resizeDir.includes('n')) {
        height = Math.max(minH, startHeight - dy);
        top = startTop + (startHeight - height);
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      left = Math.max(8, Math.min(left, vw - width - 8));
      top = Math.max(8, Math.min(top, vh - height - 8));
      width = Math.min(width, vw - left - 8);
      height = Math.min(height, vh - top - 8);

      modal.style.left = `${Math.round(left)}px`;
      modal.style.top = `${Math.round(top)}px`;
      modal.style.width = `${Math.round(width)}px`;
      modal.style.height = `${Math.round(height)}px`;
    });

    window.addEventListener('mouseup', () => {
      if (!resizing) return;
      resizing = false;
      saveModalState(overlayId);
    });
  }

  function attachOverlaysToBody() {
    ['gbCtvOverlay', 'gbGetflySearchOverlay', 'gbCtvDetailOverlay', 'gbWalletOverlay', 'gbVoucherOverlay', 'gbCreateWalletOverlay', 'gbUseWalletOverlay', 'gbManagerOverlay', 'gbPayVoucherOverlay', 'gbNoticeOverlay'].forEach((overlayId) => {
      const el = $(overlayId);
      if (!el || el.parentElement === document.body) return;
      document.body.appendChild(el);
    });
  }

  function boot() {
    if (localStorage.getItem('GB_LOW_PERF') === '1') {
      document.body.classList.add('gb-low-perf');
    }
    $('gbCreateCtvHeaderAvatar').className = 'gb-title-avatar gb-h-avatar gb-h-avatar-neutral';
    $('gbCreateCtvHeaderName').textContent = 'CTV mới';
    $('gbManagerHeaderAvatar').className = 'gb-title-avatar gb-h-avatar gb-h-avatar-neutral';
    $('gbManagerHeaderName').textContent = 'Hệ thống';
    $('gbOpenManagerBtn')?.addEventListener('click', async () => {
      openOverlay('gbManagerOverlay');
      switchManagerPanel('wallet');
      try { await loadManagerData(); } catch (e) { setPing(String(e.message || e), false); }
    });
    attachOverlaysToBody();
    $('gbAddCtvBtn').addEventListener('click', (event) => {
      state.getflyCtvDraft = null;
      $('gbCtvForm')?.reset();
      closeOverlay('gbCtvOverlay');
      openGetflySearchOverlayFromEvent(event);
    });
    bindOverlayOutsideTapClose('gbGetflySearchOverlay', 'gbCloseSearchDialogBtn');
    $('gbCloseSearchDialogFooterBtn')?.addEventListener('click', () => closeOverlay('gbGetflySearchOverlay'));
    bindOverlayOutsideTapClose('gbCtvOverlay', 'gbCloseDialogBtn');
    bindOverlayOutsideTapClose('gbCtvDetailOverlay', 'gbCloseDetailDialogBtn');
    bindOverlayOutsideTapClose('gbWalletOverlay', 'gbCloseWalletDialogBtn');
    bindOverlayOutsideTapClose('gbVoucherOverlay', 'gbCloseVoucherDialogBtn');
    bindOverlayOutsideTapClose('gbCreateWalletOverlay', 'gbCloseCreateWalletDialogBtn');
    bindOverlayOutsideTapClose('gbUseWalletOverlay', 'gbCloseUseWalletDialogBtn');
    bindOverlayOutsideTapClose('gbManagerOverlay', 'gbCloseManagerDialogBtn');
    bindOverlayOutsideTapClose('gbPayVoucherOverlay', 'gbClosePayVoucherDialogBtn');
    bindOverlayOutsideTapClose('gbNoticeOverlay', 'gbNoticeCloseBtn');

    $('gbReferrerSelect').addEventListener('change', () => {
      // referrer id is auto-generated from selected CTV id
    });
    [
      'gbCreateWalletTotal',
      'gbCreateWalletAnnualPercent',
      'gbDistImplantPct',
      'gbDistPorcelainPct',
      'gbDistGeneralPct',
      'gbDistOrthoPct'
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', syncCreateWalletCalcs);
      el.addEventListener('blur', syncCreateWalletCalcs);
    });
    ['gbUseGiftAmount'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => syncUseWalletMoneyInputs({ clampGift: true }));
      el.addEventListener('blur', () => syncUseWalletMoneyInputs({ clampGift: true }));
    });
    $('gbUseServiceCategory')?.addEventListener('change', () => syncUseWalletMoneyInputs({ clampGift: true }));
    const debouncedRenderCtv = debounce(() => renderCtvTable(), 200);
    const debouncedLoadWalletRows = debounce(() => { loadWalletRows().catch(() => {}); }, 220);
    const debouncedLoadVoucherRows = debounce(() => { loadVoucherRows().catch(() => {}); }, 220);
    const debouncedRenderManager = debounce(() => renderManagerData(), 180);
    $('gbSearchCtvInput')?.addEventListener('input', debouncedRenderCtv);
    $('gbSearchWalletInput')?.addEventListener('input', debouncedLoadWalletRows);
    $('gbSearchVoucherInput')?.addEventListener('input', debouncedLoadVoucherRows);
    ['gbSearchManagerWalletInput', 'gbSearchManagerVoucherInput', 'gbSearchManagerUsageInput', 'gbSearchManagerPaymentInput']
      .forEach((id) => $(id)?.addEventListener('input', debouncedRenderManager));
    // Debounced search for CTV detail tickets
    $('gbSearchCtvWalletInput')?.addEventListener('input', debounce(() => { loadCtvWalletTickets().catch(() => {}); }, 220));
    $('gbSearchCtvVoucherInput')?.addEventListener('input', debounce(() => { loadCtvVoucherTickets().catch(() => {}); }, 220));
    document.querySelectorAll('#gbDetailTabs .gb-tab').forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tabTarget));
    });
    $('gbSaveDetailBtn')?.addEventListener('click', async () => {
      try { await saveCtvDetail(); } catch (e) { setPing(String(e.message || e), false); }
    });
    $('gbDeleteCtvBtn')?.addEventListener('click', async () => {
      try {
        const ctv = state.selectedCtv;
        if (!ctv?.id) return;
        showNotice({
          title: 'Xóa CTV',
          subtitle: 'Giftbag',
          kind: 'warn',
          message: `Bạn chắc chắn muốn xóa CTV: ${ctv.code || ''} - ${ctv.name || ''}?\n(Hành động này sẽ ẩn CTV khỏi danh sách nhưng giữ lịch sử.)`,
          actions: [
            { label: 'Hủy', variant: 'ghost' },
            {
              label: 'Xóa',
              variant: 'primary',
              onClick: async () => {
                await api(`/ctv/${ctv.id}`, { method: 'DELETE' });
                await loadCtvs();
                closeOverlay('gbCtvDetailOverlay');
                setPing('Đã xóa CTV (ẩn khỏi danh sách)', true);
              }
            }
          ]
        });
      } catch (e) {
        setPing(String(e.message || e), false);
      }
    });
    makeOverlayModalDraggable('gbCtvOverlay');
    makeOverlayModalDraggable('gbGetflySearchOverlay');
    makeOverlayModalDraggable('gbCtvDetailOverlay');
    makeOverlayModalDraggable('gbWalletOverlay');
    makeOverlayModalDraggable('gbVoucherOverlay');
    makeOverlayModalDraggable('gbCreateWalletOverlay');
    makeOverlayModalDraggable('gbUseWalletOverlay');
    makeOverlayModalDraggable('gbManagerOverlay');
    makeOverlayModalDraggable('gbPayVoucherOverlay');
    makeOverlayModalResizable('gbCtvOverlay');
    makeOverlayModalResizable('gbCtvDetailOverlay');
    makeOverlayModalResizable('gbWalletOverlay');
    makeOverlayModalResizable('gbVoucherOverlay');
    makeOverlayModalResizable('gbCreateWalletOverlay');
    makeOverlayModalResizable('gbUseWalletOverlay');
    makeOverlayModalResizable('gbManagerOverlay');
    makeOverlayModalResizable('gbPayVoucherOverlay');

    $('gbCtvForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await createCtv(); } catch (e) { setPing(String(e.message || e), false); }
    });
    $('gbFetchCustomerBtn')?.addEventListener('click', async () => {
      try { await fetchCustomerFromGetfly(); } catch (e) { setPing(String(e.message || e), false); }
    });
    $('gbCreateWalletForCtvBtn').addEventListener('click', async () => {
      try { await createWalletForSelectedCtv(); } catch (e) { setPing(String(e.message || e), false); }
    });
    $('gbUseWalletSubmitBtn').addEventListener('click', async () => {
      try { await submitUseWallet(); } catch (e) { setPing(String(e.message || e), false); }
    });
    $('gbPayVoucherSubmitBtn')?.addEventListener('click', async () => {
      try { await submitPayVoucher(); } catch (e) { setPing(String(e.message || e), false); }
    });
    document.querySelectorAll('[data-manager-panel]').forEach((btn) => {
      btn.addEventListener('click', () => switchManagerPanel(btn.getAttribute('data-manager-panel') || 'wallet'));
    });
  $('gbSaveCommissionSettingsBtn')?.addEventListener('click', async () => {
    try {
      await saveCommissionVoucherSettings();
    } catch (e) {
      setPing(`Lỗi lưu cấu hình hoa hồng: ${e.message}`, false);
    }
  });

    $('gbGdv25DryRunBtn')?.addEventListener('click', async () => {
      try {
        await syncGdv25({ dryRun: true });
      } catch (e) {
        logGdv25(String(e.message || e));
        setPing(String(e.message || e), false);
      }
    });

    $('gbGdv25SyncBtn')?.addEventListener('click', async () => {
      try {
        const ok = window.confirm('Sync sẽ tạo gói quà vào database. Bạn chắc chắn muốn chạy?');
        if (!ok) return;
        await syncGdv25({ dryRun: false });
      } catch (e) {
        logGdv25(String(e.message || e));
        setPing(String(e.message || e), false);
      }
    });

    // Preload core datasets once on app open (cached in RAM)
    (async () => {
      beginApiLoading();
      try {
        await Promise.all([loadCurrentUser(), loadCtvs(), loadManagerData({ force: true })]);
      } finally {
        endApiLoading();
      }
    })().catch(() => {});

    // SSE: update UI by id without full reload
    try {
      const source = new EventSource('/api/giftbag/events');
      source.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data || '{}');
          handleGiftbagEvent(evt);
        } catch (_) {}
      };
      source.onerror = () => {};
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

