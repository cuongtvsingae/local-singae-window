const statusText = document.getElementById("statusText");
const defaultKhoanInput = document.getElementById("defaultKhoanInput");
const clinicPctInput = document.getElementById("clinicPctInput");
const btnReloadCache = document.getElementById("btnReloadCache");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnAddGroup = document.getElementById("btnAddGroup"); // legacy (no longer used as modal launcher)
const btnApplyDefaultKhoan = document.getElementById("btnApplyDefaultKhoan");
const defaultKhoanApplyMode = document.getElementById("defaultKhoanApplyMode");
const categoryTabsEl = document.getElementById("categoryTabs");
const tableBody = document.getElementById("tableBody");
const khoanCol1 = document.getElementById("khoanCol1");
const khoanCol2 = document.getElementById("khoanCol2");
const khoanCol3 = document.getElementById("khoanCol3");

const newUserNameInput = document.getElementById("newUserNameInput");
const newUserTypeSelect = document.getElementById("newUserTypeSelect");
const newUserKhoanFields = document.getElementById("newUserKhoanFields");
const btnAddUser = document.getElementById("btnAddUser");

const btnOpenDefaultKhoanModal = document.getElementById('btnOpenDefaultKhoanModal');
const btnOpenClinicPctModal = document.getElementById('btnOpenClinicPctModal');
const btnOpenAddUserModal = document.getElementById('btnOpenAddUserModal');
const btnOpenAddGroupModal = document.getElementById('btnOpenAddGroupModal');
const btnOpenUploadProductModal = document.getElementById('btnOpenUploadProductModal');
const btnOpenSyncGsheetModal = document.getElementById('btnOpenSyncGsheetModal');

const csModal = document.getElementById('csModal');
const csModalBody = document.getElementById('csModalBody');
const csModalTitle = document.getElementById('csModalTitle');
const csModalClose = document.getElementById('csModalClose');

const state = {
  activeTab: "CHƯA GÁN NHÓM",
  settings: {
    khoan: 250000000,
    clinicPct: 100,
    khoanOverridesV2: {}, // normalizedName -> { khoan, khoanMktAg, khoanUpsale, khoanSeeding, ...legacyFields }
    employeeTypes: {}, // normalizedName -> group label (TYPE)
    employeeNames: {}, // normalizedName -> display name
    groupDefs: ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"],
    seenNames: [] // normalized names already seen (so "Chưa gán" shows only truly new)
  },
  // from cache
  cacheItems: [],
  cacheUsersByTab: {} // tab -> [{ name, groupName, khoan, type, suggestedType }]
};

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  // Treat both "." and "," as thousands separators for our money/percent inputs.
  // Example: "250.000.000" -> 250000000, "1,234,567" -> 1234567
  const cleaned = raw
    .replace(/[.,]/g, "")
    .replace(/[^0-9\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  const v = Math.round(parseNumber(n));
  return new Intl.NumberFormat("vi-VN").format(v);
}

function normalizeDisplayName(name) {
  // Keep name consistent (trim + collapse spaces)
  return String(name || "").trim().replace(/\s+/g, " ");
}

function isDoctorUser(u) {
  const name = normalizeName(u?.employeeName);
  const group = String(u?.userGroupName || "").trim().toLowerCase();
  return name.startsWith("bs") || name.startsWith("bs.") || group === "bác sĩ";
}

function getAssignedType(name) {
  const map = state.settings?.employeeTypes && typeof state.settings.employeeTypes === "object"
    ? state.settings.employeeTypes
    : {};
  const n = normalizeName(name);
  if (!n) return "";
  const v = map[n];
  return typeof v === "string" ? v : "";
}

function getDisplayName(name) {
  const map = state.settings?.employeeNames && typeof state.settings.employeeNames === "object"
    ? state.settings.employeeNames
    : {};
  const n = normalizeName(name);
  return map[n] ? String(map[n] || "").trim() : "";
}

function setDisplayName(name) {
  const map = state.settings?.employeeNames && typeof state.settings.employeeNames === "object"
    ? state.settings.employeeNames
    : {};
  const n = normalizeName(name);
  if (!n) return;
  map[n] = normalizeDisplayName(name);
  state.settings.employeeNames = map;
}

function setAssignedType(name, type) {
  const map = state.settings?.employeeTypes && typeof state.settings.employeeTypes === "object"
    ? state.settings.employeeTypes
    : {};
  const n = normalizeName(name);
  if (!n) return;
  const t = String(type || "").trim();
  if (!t) return;
  map[n] = t;
  state.settings.employeeTypes = map;
  setDisplayName(name);
}

function deleteAssignedType(name) {
  const map = state.settings?.employeeTypes && typeof state.settings.employeeTypes === "object"
    ? state.settings.employeeTypes
    : {};
  const n = normalizeName(name);
  if (!n) return;
  if (Object.prototype.hasOwnProperty.call(map, n)) delete map[n];
  state.settings.employeeTypes = map;
  const nm = state.settings?.employeeNames && typeof state.settings.employeeNames === "object" ? state.settings.employeeNames : {};
  if (Object.prototype.hasOwnProperty.call(nm, n)) delete nm[n];
  state.settings.employeeNames = nm;
}

function moveKeyInMap(obj, fromName, toName) {
  if (!obj || typeof obj !== "object") return;
  const from = normalizeName(fromName);
  const to = normalizeName(toName);
  if (!from || !to || from === to) return;
  if (!Object.prototype.hasOwnProperty.call(obj, from)) return;
  obj[to] = obj[from];
  delete obj[from];
}

function renameEmployeeEverywhere(oldName, newName) {
  // Disabled by design: user names are keys in settings maps.
  // Use "Add user" + assign to type instead of renaming in-place.
  return;
}

function getKhoanV2ForName(name) {
  const map = state.settings?.khoanOverridesV2 && typeof state.settings.khoanOverridesV2 === "object"
    ? state.settings.khoanOverridesV2
    : {};
  const n = normalizeName(name);
  if (!n) return {};
  const v = map[n];
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function setKhoanV2Field(name, field, value) {
  const map = state.settings?.khoanOverridesV2 && typeof state.settings.khoanOverridesV2 === "object"
    ? state.settings.khoanOverridesV2
    : {};
  const n = normalizeName(name);
  if (!n) return;
  const row = (map[n] && typeof map[n] === "object" && !Array.isArray(map[n])) ? map[n] : {};
  const v = String(value || "").trim() === "" ? null : Math.round(parseNumber(value));
  if (v === null) {
    if (Object.prototype.hasOwnProperty.call(row, field)) delete row[field];
  } else {
    if (!Number.isFinite(v) || v < 0) return;
    row[field] = v;
  }
  map[n] = row;
  state.settings.khoanOverridesV2 = map;
}

function renderKhoanColumnsForTab(tabName) {
  if (!khoanCol1 || !khoanCol2 || !khoanCol3) return;
  const t = String(tabName || "").trim().toUpperCase();

  // reset
  khoanCol1.style.display = "";
  khoanCol2.style.display = "none";
  khoanCol3.style.display = "none";
  khoanCol1.textContent = "KHOÁN";

  // Unassigned: only STT + TÊN (hide all khoán columns)
  if (t === "CHƯA GÁN NHÓM") {
    khoanCol1.style.display = "none";
    return;
  }

  // BÁC SĨ: no khoán
  if (t === "BÁC SĨ") {
    khoanCol1.style.display = "none";
    return;
  }

  // LỄ TÂN/CSKH: no khoán
  if (t === "LỄ TÂN/CSKH") {
    khoanCol1.style.display = "none";
    return;
  }

  if (t === "TLBS") {
    khoanCol1.textContent = "KHOÁN";
    khoanCol2.textContent = "KHOÁN NGUỒN MKT/AG";
    khoanCol2.style.display = "";
    khoanCol3.style.display = "none";
    return;
  }
  if (t === "KT KHÁCH CŨ") {
    khoanCol1.textContent = "KHOÁN NGUỒN UPSALE";
    khoanCol2.textContent = "KHOÁN NGUỒN SEEDING";
    khoanCol2.style.display = "";
    khoanCol3.style.display = "none";
    return;
  }
}

function getTabForUser(u) {
  const name = String(u?.employeeName || "").trim();
  const assigned = getAssignedType(name);
  if (assigned) return assigned;
  // Unassigned is for names found in cache but not yet assigned in DB
  return "CHƯA GÁN NHÓM";
}

function getSuggestedTypeForUser(u) {
  // suggestion derived from real cache data (NOT persisted)
  if (isDoctorUser(u)) return "BÁC SĨ";
  const nameNorm = normalizeName(u?.employeeName);
  if (nameNorm.startsWith("pt")) return "NV KINH DOANH";
  const gn = String(u?.userGroupName || "").trim();
  if (normalizeName(gn) === "nv kinh doanh") return "NV KINH DOANH";
  return gn ? `KHÁC: ${gn}` : "KHÁC";
}

function rebuildTabsFromCache() {
  const byTab = {};
  // 1) Always render "history" from DB (assigned users), regardless of cache.
  const types = state.settings?.employeeTypes && typeof state.settings.employeeTypes === "object" ? state.settings.employeeTypes : {};
  Object.keys(types).forEach((normalizedKey) => {
    const type = String(types[normalizedKey] || "").trim();
    if (!type) return;
    byTab[type] = byTab[type] || new Map();
    const displayName = getDisplayName(normalizedKey) || normalizedKey;
    const v2 = getKhoanV2ForName(displayName);
    byTab[type].set(normalizedKey, {
      name: displayName,
      khoan: (v2 && v2.khoan !== undefined) ? parseNumber(v2.khoan) : null,
      type,
      suggestedType: "",
      groupName: ""
    });
  });

  // 2) Merge cache: only add truly new names to "CHƯA GÁN NHÓM", and enrich assigned rows.
  const items = Array.isArray(state.cacheItems) ? state.cacheItems : [];
  items.forEach((it) => {
    const u = it && typeof it === "object" ? it.user : null;
    if (!u || typeof u !== "object") return;
    const name = String(u.employeeName || "").trim();
    if (!name) return;
    const key = normalizeName(name);
    const assigned = getAssignedType(name);
    if (assigned) {
      byTab[assigned] = byTab[assigned] || new Map();
      const existing = byTab[assigned].get(key) || byTab[assigned].get(key) || {
        name: getDisplayName(name) || normalizeDisplayName(name),
        khoan: null,
        type: assigned,
        suggestedType: "",
        groupName: ""
      };
      existing.groupName = String(u.userGroupName || "").trim();
      // keep display name fresh
      existing.name = getDisplayName(name) || normalizeDisplayName(name);
      const override = getKhoanOverrideForName(existing.name);
      existing.khoan = override !== null ? override : null;
      byTab[assigned].set(key, existing);
      return;
    }
    // Unassigned: only if not already in DB (employeeTypes) AND appears in cache now
    byTab["CHƯA GÁN NHÓM"] = byTab["CHƯA GÁN NHÓM"] || new Map();
    if (Object.prototype.hasOwnProperty.call(types, key)) return;
    const existing = byTab["CHƯA GÁN NHÓM"].get(key) || {
      name: normalizeDisplayName(name),
      groupName: String(u.userGroupName || "").trim(),
      khoan: null,
      type: "CHƯA GÁN NHÓM",
      suggestedType: getSuggestedTypeForUser(u)
    };
    byTab["CHƯA GÁN NHÓM"].set(key, existing);
  });

  // Ensure tabs exist (from config) + unassigned
  const defs = Array.isArray(state.settings?.groupDefs) ? state.settings.groupDefs : ["BÁC SĨ", "TLBS", "NV KINH DOANH"];
  // Unassigned must be last
  [...defs, "CHƯA GÁN NHÓM"].forEach((t) => {
    if (!byTab[t]) byTab[t] = new Map();
  });

  const out = {};
  Object.keys(byTab).forEach((k) => {
    out[k] = Array.from(byTab[k].values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  });
  state.cacheUsersByTab = out;

  // Keep activeTab valid
  if (!state.cacheUsersByTab[state.activeTab]) state.activeTab = "CHƯA GÁN NHÓM";
}

function renderTabs() {
  if (!categoryTabsEl) return;
  categoryTabsEl.innerHTML = "";
  const tabs = Object.keys(state.cacheUsersByTab || {});
  const priority = ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"];
  tabs.sort((a, b) => {
    const isUa = a === "CHƯA GÁN NHÓM";
    const isUb = b === "CHƯA GÁN NHÓM";
    if (isUa && !isUb) return 1;
    if (!isUa && isUb) return -1;
    const pa = priority.includes(a) ? priority.indexOf(a) : 99;
    const pb = priority.includes(b) ? priority.indexOf(b) : 99;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, "vi");
  });

  tabs.forEach((t) => {
    const count = Array.isArray(state.cacheUsersByTab?.[t]) ? state.cacheUsersByTab[t].length : 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cs-tab ${t === state.activeTab ? "is-active" : ""}`;
    btn.textContent = `${t} (${count})`;
    btn.dataset.tab = t;
    categoryTabsEl.appendChild(btn);
  });
}

function getTypeDefsList() {
  const defs = Array.isArray(state.settings?.groupDefs) ? state.settings.groupDefs : ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"];
  return defs.filter(Boolean);
}

function renderNewUserTypeSelect() {
  if (!newUserTypeSelect) return;
  const defs = getTypeDefsList();
  newUserTypeSelect.innerHTML = '';
  defs.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    newUserTypeSelect.appendChild(opt);
  });
}

function buildNewUserKhoanFields(typeName) {
  const t = String(typeName || '').trim().toUpperCase();
  if (t === 'BÁC SĨ' || t === 'LỄ TÂN/CSKH') return [];
  if (t === 'TLBS') return [
    { field: 'khoan', label: 'KHOÁN' },
    { field: 'khoanMktAg', label: 'KHOÁN NGUỒN MKT/AG' }
  ];
  if (t === 'KT KHÁCH CŨ') return [
    { field: 'khoanUpsale', label: 'KHOÁN NGUỒN UPSALE' },
    { field: 'khoanSeeding', label: 'KHOÁN NGUỒN SEEDING' }
  ];
  // Default: NV KINH DOANH logic
  return [{ field: 'khoan', label: 'KHOÁN' }];
}

function renderNewUserKhoanFields() {
  if (!newUserKhoanFields) return;
  const typeName = String(newUserTypeSelect?.value || '').trim();
  const fields = buildNewUserKhoanFields(typeName);
  newUserKhoanFields.innerHTML = '';
  if (!fields.length) return;
  fields.forEach((f) => {
    const wrap = document.createElement('label');
    wrap.className = 'cs-field';
    wrap.style.minWidth = '220px';
    wrap.innerHTML = `<span>${f.label}</span><input class="cs-khoan cs-newuser-khoan" data-field="${f.field}" type="text" inputmode="numeric" placeholder="0" />`;
    newUserKhoanFields.appendChild(wrap);
  });
}

function openModal(title, html) {
  if (!csModal || !csModalBody) return;
  if (csModalTitle) csModalTitle.textContent = String(title || 'Thao tác');
  csModalBody.innerHTML = html || '';
  csModal.classList.add('is-open');
  csModal.setAttribute('aria-hidden', 'false');
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function closeModal() {
  if (!csModal || !csModalBody) return;
  csModal.classList.remove('is-open');
  csModal.setAttribute('aria-hidden', 'true');
  csModalBody.innerHTML = '';
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = "";
  const rows = Array.isArray(state.cacheUsersByTab?.[state.activeTab]) ? state.cacheUsersByTab[state.activeTab] : [];
  const groupDefs = Array.isArray(state.settings?.groupDefs) ? state.settings.groupDefs : ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"];
  renderKhoanColumnsForTab(state.activeTab);
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const defaultKhoan = parseNumber(state.settings?.khoan);
    const typeValue = String(r.type || state.activeTab || "");
    const usesDefaultKhoan = typeValue.toUpperCase() === "NV KINH DOANH";
    const khoanVal = r.khoan !== null ? r.khoan : "";
    const khoanPlaceholder = usesDefaultKhoan ? `Mặc định: ${formatMoney(defaultKhoan)}` : "0";
    const isUnassigned = state.activeTab === "CHƯA GÁN NHÓM";
    const canEditRow = true;
    const actionBtn = isUnassigned
      ? `<div style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
           <select class="cs-type" data-idx="${idx}" style="min-width: 180px;">
             <option value="">(chọn nhóm)</option>
             ${groupDefs.map((g) => `<option value="${g}">${g}</option>`).join("")}
           </select>
           <button class="btn btn-primary cs-assign" data-idx="${idx}" type="button">Gán</button>
         </div>`
      : `<div style="display:flex; gap:8px; justify-content:flex-end;">
           <button class="btn btn-ghost cs-unassign" data-name="${encodeURIComponent(r.name)}" type="button">Bỏ gán</button>
           <button class="btn btn-ghost cs-delete" data-name="${encodeURIComponent(r.name)}" type="button">Xoá</button>
         </div>`;

    const tabUpper = String(state.activeTab || "").trim().toUpperCase();
    const noKhoan = tabUpper === "BÁC SĨ" || tabUpper === "LỄ TÂN/CSKH" || tabUpper === "CHƯA GÁN NHÓM";
    const isTLBS = tabUpper === "TLBS";
    const isKT = tabUpper === "KT KHÁCH CŨ";
    const v2 = getKhoanV2ForName(r.name);
    const val1Field = isKT ? "khoanUpsale" : "khoan";
    const val1 = v2?.[val1Field] ?? (r.khoan !== null ? r.khoan : "");

    const cell1 = noKhoan
      ? `<span style="color: rgba(226,236,255,0.55);">-</span>`
      : `<input class="cs-khoan cs-khoan1" data-idx="${idx}" data-field="${val1Field}" type="text" inputmode="numeric"
          value="${String(val1) !== "" ? formatMoney(val1) : ""}"
          placeholder="${isKT ? "0" : khoanPlaceholder}" ${canEditRow ? "" : "disabled"} />`;
    const cell2 = (isTLBS || isKT)
      ? `<input class="cs-khoan cs-khoan2" data-idx="${idx}" data-field="${isTLBS ? "khoanMktAg" : "khoanSeeding"}" type="text" inputmode="numeric"
          value="${v2?.[isTLBS ? "khoanMktAg" : "khoanSeeding"] !== undefined ? formatMoney(v2?.[isTLBS ? "khoanMktAg" : "khoanSeeding"]) : ""}"
          placeholder="0" ${canEditRow ? "" : "disabled"} />`
      : "";
    const cell3 = ""; // TLBS uses combined MKT/AG field in UI now
    tr.innerHTML = `
      <td style="text-align:center;">${idx + 1}</td>
      <td class="name-col"><input class="cs-name" data-idx="${idx}" value="${r.name}" disabled /></td>
      <td style="${noKhoan ? "display:none;" : ""}">${cell1}</td>
      <td style="${(noKhoan || !(isTLBS || isKT)) ? "display:none;" : ""}">${cell2 || ""}</td>
      <td style="display:none;">${cell3 || ""}</td>
      <td style="text-align:right;">${actionBtn}</td>
    `;
    tableBody.appendChild(tr);
  });
}

async function loadSettings() {
  const res = await fetch("/api/admin/commission-settings", { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Cannot load settings");
  const s = payload.settings || {};
  state.settings.khoan = parseNumber(s.khoan);
  state.settings.clinicPct = parseNumber(s.clinicPct);
  state.settings.groupDefs = Array.isArray(s.groupDefs) ? s.groupDefs : ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"];
  const rawTypes = s.employeeTypes && typeof s.employeeTypes === "object" ? s.employeeTypes : {};
  const types = {};
  Object.keys(rawTypes).forEach((k) => {
    const nk = normalizeName(k);
    const v = String(rawTypes[k] || "").trim();
    if (nk && v) types[nk] = v;
  });
  state.settings.employeeTypes = types;
  const rawNames = s.employeeNames && typeof s.employeeNames === "object" ? s.employeeNames : {};
  const names = {};
  Object.keys(rawNames).forEach((k) => {
    const nk = normalizeName(k);
    const v = String(rawNames[k] || "").trim();
    if (nk && v) names[nk] = v;
  });
  state.settings.employeeNames = names;
  state.settings.seenNames = Array.isArray(s.seenNames) ? s.seenNames : [];
  const rawV2 = s.khoanOverridesV2 && typeof s.khoanOverridesV2 === "object" ? s.khoanOverridesV2 : {};
  const ov2 = {};
  Object.keys(rawV2).forEach((k) => {
    const nk = normalizeName(k);
    const row = rawV2[k];
    if (!nk || !row || typeof row !== "object" || Array.isArray(row)) return;
    const out = {};
    ["khoan", "khoanMktAg", "khoanUpsale", "khoanSeeding", "khoanMkt", "khoanAg"].forEach((f) => {
      if (row[f] === undefined) return;
      const v = parseNumber(row[f]);
      if (Number.isFinite(v) && v >= 0) out[f] = Math.round(v);
    });
    ov2[nk] = out;
  });
  state.settings.khoanOverridesV2 = ov2;

  if (defaultKhoanInput) defaultKhoanInput.value = state.settings.khoan ? formatMoney(state.settings.khoan) : "";
  if (clinicPctInput) clinicPctInput.value = state.settings.clinicPct ? String(Math.round(state.settings.clinicPct)) : "";

  renderNewUserTypeSelect();
  renderNewUserKhoanFields();
}

async function loadCacheAnyRange() {
  const res = await fetch("/api/commission/get-commission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ useCache: true })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.success) throw new Error(payload?.error || payload?.message || "Cannot load cache");
  state.cacheItems = Array.isArray(payload.data) ? payload.data : [];
}

async function saveSettings() {
  const khoan = parseNumber(defaultKhoanInput?.value);
  const clinicPct = parseNumber(clinicPctInput?.value);
  if (!(khoan > 0)) throw new Error("KHOÁN mặc định phải > 0");
  if (!(clinicPct > 0) || clinicPct > 100) throw new Error("%HH PHÒNG KHÁM phải trong (0,100]");

  // TLBS list is derived from employeeTypes (only persist names that are assigned to TLBS)
  const khoanOverridesV2 = state.settings.khoanOverridesV2 || {};

  await fetch("/api/admin/commission-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      khoan,
      clinicPct,
      khoanOverridesV2,
      employeeTypes: state.settings.employeeTypes || {},
      employeeNames: state.settings.employeeNames || {},
      groupDefs: state.settings.groupDefs || ["BÁC SĨ", "TLBS", "NV KINH DOANH", "KT KHÁCH CŨ", "Lễ tân/CSKH"],
      seenNames: state.settings.seenNames || []
    })
  }).then(async (r) => {
    const p = await r.json().catch(() => ({}));
    if (!r.ok || !p?.ok) throw new Error(p?.error || "Save failed");
  });
}

function applyDefaultKhoanToMissingNvkd() {
  const defaultKhoan = Math.round(parseNumber(defaultKhoanInput?.value));
  if (!Number.isFinite(defaultKhoan) || defaultKhoan < 0) return 0;
  const types = state.settings?.employeeTypes && typeof state.settings.employeeTypes === 'object' ? state.settings.employeeTypes : {};
  const names = Object.keys(types);
  let updated = 0;
  names.forEach((nk) => {
    const t = String(types[nk] || '').trim().toUpperCase();
    if (t !== 'NV KINH DOANH') return;
    const displayName = getDisplayName(nk) || nk;
    const row = getKhoanV2ForName(displayName);
    const hasOwn = row && Object.prototype.hasOwnProperty.call(row, 'khoan');
    const current = parseNumber(row?.khoan);
    if (!hasOwn || !(Number.isFinite(current) && current > 0)) {
      setKhoanV2Field(displayName, 'khoan', String(defaultKhoan));
      updated++;
    }
  });
  return updated;
}

function addUserFromForm() {
  const name = String(newUserNameInput?.value || '').trim();
  const type = String(newUserTypeSelect?.value || '').trim();
  if (!name) {
    setStatus('Nhập tên user.');
    return;
  }
  if (!type) {
    setStatus('Chọn type.');
    return;
  }
  // Persist display name and type
  setDisplayName(name);
  setAssignedType(name, type);

  // Persist khoán fields per type definition
  const fields = buildNewUserKhoanFields(type);
  const inputs = Array.from(newUserKhoanFields?.querySelectorAll?.('input.cs-newuser-khoan') || []);
  fields.forEach((f) => {
    const el = inputs.find((x) => String(x.dataset.field || '') === f.field);
    const val = el ? String(el.value || '').trim() : '';
    if (val !== '') setKhoanV2Field(name, f.field, val);
  });

  // Reset UI
  if (newUserNameInput) newUserNameInput.value = '';
  renderNewUserKhoanFields();
  rebuildTabsFromCache();
  renderTabs();
  state.activeTab = type;
  renderTabs();
  renderTable();
  setStatus(`Đã thêm user: ${name} → ${type} (nhớ bấm Save)`);
}

document.addEventListener('click', (e) => {
  if (btnOpenUploadProductModal && (e.target === btnOpenUploadProductModal || (e.target.closest && e.target.closest('#btnOpenUploadProductModal')))) {
    openModal('Upload XLSX sản phẩm', `
      <div class="cs-modal-section">
        <div class="cs-tip" style="margin-bottom:10px;">
          File cần có cột: <strong>Thu xuất/DV</strong>, <strong>Kinh doanh</strong>, <strong>Thu đợt này</strong>.
        </div>
        <div class="cs-modal-row">
          <input id="productSalesFileInput" type="file" accept=".xlsx,.xls" />
          <button id="btnUploadProductSales" class="btn btn-primary btn-icon-only" type="button" title="Upload">
            <img class="btn-icon" alt="" src="../../../asset/icon-upload.svg" />
          </button>
        </div>
        <div id="productSalesUploadStatus" class="cs-status" style="justify-self:start; margin-top:10px;">Chưa upload</div>
      </div>
    `);
    return;
  }
  if (btnOpenSyncGsheetModal && (e.target === btnOpenSyncGsheetModal || (e.target.closest && e.target.closest('#btnOpenSyncGsheetModal')))) {
    openModal('Sync Google Sheet', `
      <div class="cs-modal-section">
        <div class="cs-tip" style="margin-bottom:10px;">
          Dán link Web App (GET JSON) từ Google Apps Script.
        </div>
        <div class="cs-modal-row">
          <input id="gsheetUrlInput" type="text" placeholder="https://script.google.com/macros/s/..." />
          <button id="btnSyncGsheet" class="btn btn-primary btn-icon-only" type="button" title="Sync">
            <img class="btn-icon" alt="" src="../../../asset/icon-refresh.svg" />
          </button>
        </div>
      </div>
    `);
    // prefill if known
    const el = document.getElementById('gsheetUrlInput');
    if (el) el.value = String(state.settings?.productSalesV1?.lastUrl || '');
    return;
  }
  // Modal close
  if (csModal && (e.target === csModalClose || (e.target && e.target.closest && e.target.closest('#csModalClose')))) {
    closeModal();
    return;
  }
  if (csModal && e.target && e.target.dataset && e.target.dataset.close) {
    closeModal();
    return;
  }

  // Modal launchers (separate modals)
  if (btnOpenDefaultKhoanModal && (e.target === btnOpenDefaultKhoanModal || (e.target.closest && e.target.closest('#btnOpenDefaultKhoanModal')))) {
    openModal('Khoán mặc định', `
      <div class="cs-modal-section">
        <div class="cs-field">
          <span>KHOÁN mặc định</span>
          <div class="cs-modal-row">
            <input id="defaultKhoanInput" type="text" inputmode="numeric" placeholder="250.000.000" value="${state.settings?.khoan ? formatMoney(state.settings.khoan) : ''}" />
            <select id="defaultKhoanApplyMode" class="cs-inline-select">
              <option value="save-only" selected>Lưu</option>
              <option value="apply-missing-nvkd">Set cho tất cả NV KINH DOANH (chưa có khoán riêng)</option>
            </select>
          </div>
          <div class="cs-modal-actions">
            <button id="btnApplyDefaultKhoan" class="btn btn-primary btn-icon-only" type="button" title="Apply">
              <img class="btn-icon" alt="" src="../../../asset/icon-plus.svg" />
            </button>
          </div>
        </div>
      </div>
    `);
    return;
  }

  if (btnOpenClinicPctModal && (e.target === btnOpenClinicPctModal || (e.target.closest && e.target.closest('#btnOpenClinicPctModal')))) {
    openModal('%HH Phòng khám', `
      <div class="cs-modal-section">
        <div class="cs-field">
          <span>%HH PHÒNG KHÁM</span>
          <div class="cs-modal-row">
            <input id="clinicPctInput" type="text" inputmode="numeric" placeholder="100" value="${state.settings?.clinicPct ? String(Math.round(state.settings.clinicPct)) : ''}" />
          </div>
          <div class="cs-modal-actions">
            <button id="btnApplyClinicPct" class="btn btn-primary btn-icon-only" type="button" title="Apply">
              <img class="btn-icon" alt="" src="../../../asset/icon-plus.svg" />
            </button>
          </div>
        </div>
      </div>
    `);
    return;
  }

  if (btnOpenAddUserModal && (e.target === btnOpenAddUserModal || (e.target.closest && e.target.closest('#btnOpenAddUserModal')))) {
    openModal('Add user', `
      <div class="cs-modal-section">
        <div class="cs-add-user-title">Thông tin</div>
        <div class="cs-modal-row">
          <input id="newUserNameInput" type="text" placeholder="Nhập tên user..." />
          <select id="newUserTypeSelect" class="cs-inline-select"></select>
        </div>
      </div>
      <div class="cs-modal-section">
        <div class="cs-add-user-title">Khoán</div>
        <div id="newUserKhoanFields" class="cs-modal-row"></div>
        <div class="cs-modal-actions">
          <button id="btnAddUser" class="btn btn-primary btn-icon-only" type="button" title="Add user">
            <img class="btn-icon" alt="" src="../../../asset/icon-user-plus.svg" />
          </button>
        </div>
      </div>
    `);
    // fill options + khoán fields
    renderNewUserTypeSelect();
    renderNewUserKhoanFields();
    return;
  }

  if (btnOpenAddGroupModal && (e.target === btnOpenAddGroupModal || (e.target.closest && e.target.closest('#btnOpenAddGroupModal')))) {
    openModal('Add group', `
      <div class="cs-modal-section">
        <div class="cs-field">
          <span>Tên group</span>
          <div class="cs-modal-row">
            <input id="newGroupNameInput" type="text" placeholder="VD: NHÓM A" />
          </div>
          <div class="cs-modal-actions">
            <button id="btnAddGroupConfirm" class="btn btn-primary btn-icon-only" type="button" title="Add group">
              <img class="btn-icon" alt="" src="../../../asset/icon-plus.svg" />
            </button>
          </div>
        </div>
      </div>
    `);
    return;
  }

  if (btnAddUser && (e.target === btnAddUser || (e.target.closest && e.target.closest('#btnAddUser')))) {
    addUserFromForm();
    return;
  }
  if (btnApplyDefaultKhoan && (e.target === btnApplyDefaultKhoan || (e.target.closest && e.target.closest('#btnApplyDefaultKhoan')))) {
    const mode = String(defaultKhoanApplyMode?.value || 'save-only');
    // Always update state.settings.khoan (saved on Save)
    const v = Math.round(parseNumber(defaultKhoanInput?.value));
    if (Number.isFinite(v) && v >= 0) state.settings.khoan = v;
    if (mode === 'apply-missing-nvkd') {
      const n = applyDefaultKhoanToMissingNvkd();
      rebuildTabsFromCache();
      renderTabs();
      renderTable();
      setStatus(`Đã set khoán mặc định cho ${n} NV KINH DOANH (chưa có khoán riêng). Nhớ bấm Save.`);
    } else {
      setStatus('Đã cập nhật khoán mặc định (nhớ bấm Save).');
    }
    return;
  }

  const btnApplyClinicPct = e.target && e.target.closest ? e.target.closest('#btnApplyClinicPct') : null;
  if (btnApplyClinicPct) {
    const v = Math.round(parseNumber(document.getElementById('clinicPctInput')?.value));
    if (Number.isFinite(v) && v >= 0) {
      state.settings.clinicPct = v;
      setStatus('Đã cập nhật %HH phòng khám (nhớ bấm Save).');
      closeModal();
    } else {
      setStatus('Giá trị %HH không hợp lệ.');
    }
    return;
  }

  const btnAddGroupConfirm = e.target && e.target.closest ? e.target.closest('#btnAddGroupConfirm') : null;
  if (btnAddGroupConfirm) {
    const v = String(document.getElementById('newGroupNameInput')?.value || '').trim();
    const g = v.toUpperCase();
    if (!g) {
      setStatus('Nhập tên group.');
      return;
    }
    const defs = Array.isArray(state.settings.groupDefs) ? state.settings.groupDefs : [];
    if (defs.map((x) => String(x).toUpperCase()).includes(g)) {
      setStatus('Group đã tồn tại.');
      return;
    }
    state.settings.groupDefs = [...defs, g];
    rebuildTabsFromCache();
    renderTabs();
    renderTable();
    renderNewUserTypeSelect();
    setStatus(`Đã thêm group: ${g} (nhớ bấm Save)`);
    closeModal();
    return;
  }

  const btnUploadProductSales = e.target && e.target.closest ? e.target.closest('#btnUploadProductSales') : null;
  if (btnUploadProductSales) {
    (async () => {
      try {
        const fileEl = document.getElementById('productSalesFileInput');
        const statusEl = document.getElementById('productSalesUploadStatus');
        const f = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;
        if (!f) {
          setStatus('Chọn file trước khi upload.');
          return;
        }
        if (statusEl) statusEl.textContent = 'Đang upload...';
        const form = new FormData();
        form.append('file', f);
        const res = await fetch('/api/admin/commission-settings/product-sales-upload-file', {
          method: 'POST',
          cache: 'no-store',
          body: form
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Upload failed');
        const s = payload?.summary || {};
        if (statusEl) statusEl.textContent = `OK • rows: ${s.parsedRows || 0} • users: ${s.users || 0} • products: ${s.products || 0}`;
        setStatus('Đã upload & lưu DB (productSalesV1).');
        // refresh local settings snapshot
        await loadSettings();
        closeModal();
      } catch (err) {
        setStatus(err?.message || String(err));
      }
    })();
    return;
  }

  const btnSyncGsheet = e.target && e.target.closest ? e.target.closest('#btnSyncGsheet') : null;
  if (btnSyncGsheet) {
    (async () => {
      try {
        const urlEl = document.getElementById('gsheetUrlInput');
        const url = String(urlEl?.value || '').trim();
        if (!url) {
          setStatus('Nhập URL Google Web App trước khi sync.');
          return;
        }
        const res = await fetch('/api/admin/commission-settings/product-sales-sync-from-gsheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ url })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || 'Sync failed');
        setStatus(`Đã sync Google Sheet • rows: ${payload?.summary?.parsedRows || 0}`);
        await loadSettings();
        closeModal();
      } catch (err) {
        setStatus(err?.message || String(err));
      }
    })();
    return;
  }
});

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

async function boot() {
  try {
    setStatus("Loading settings...");
    await loadSettings();
    // History view is DB-first. Cache is only used when user clicks "Reload cache"
    state.cacheItems = [];
    rebuildTabsFromCache();
    renderTabs();
    renderTable();
    setStatus("Ready • lịch sử từ Database");
  } catch (e) {
    setStatus(e?.message || String(e));
  }
}

document.addEventListener("click", (e) => {
  const tab = e.target && e.target.closest ? e.target.closest(".cs-tab") : null;
  if (tab && tab.dataset && tab.dataset.tab) {
    state.activeTab = String(tab.dataset.tab);
    renderTabs();
    renderTable();
  }
  if (btnReloadCache && (e.target === btnReloadCache || (e.target.closest && e.target.closest("#btnReloadCache")))) {
    (async () => {
      try {
        setStatus("Loading cache...");
        await loadCacheAnyRange();
        rebuildTabsFromCache();
        renderTabs();
        renderTable();
        setStatus(`Cache loaded • items: ${state.cacheItems.length}`);
      } catch (err) {
        setStatus(err?.message || String(err));
      }
    })();
  }
  if (btnSaveSettings && (e.target === btnSaveSettings || (e.target.closest && e.target.closest("#btnSaveSettings")))) {
    (async () => {
      try {
        setStatus("Saving...");
        await saveSettings();
        await loadSettings();
        rebuildTabsFromCache();
        renderTabs();
        renderTable();
        setStatus("Saved.");
      } catch (err) {
        setStatus(err?.message || String(err));
      }
    })();
  }
  const assignBtn = e.target && e.target.closest ? e.target.closest(".cs-assign") : null;
  if (assignBtn && assignBtn.dataset && assignBtn.dataset.idx !== undefined) {
    const idx = Number(assignBtn.dataset.idx);
    const rows = Array.isArray(state.cacheUsersByTab?.[state.activeTab]) ? state.cacheUsersByTab[state.activeTab] : [];
    if (!Number.isFinite(idx) || !rows[idx]) return;
    const row = rows[idx];
    const selected = row._pendingType || "";
    if (!selected) {
      setStatus("Chọn nhóm trước khi gán.");
      return;
    }
    setAssignedType(row.name, selected);
    // When assigned, name is now persisted (via employeeTypes map). Rebuild UI.
    rebuildTabsFromCache();
    renderTabs();
    state.activeTab = selected;
    renderTabs();
    renderTable();
    setStatus(`Đã gán: ${row.name} → ${selected} (nhớ bấm Save)`);
    return;
  }

  const unassignBtn = e.target && e.target.closest ? e.target.closest(".cs-unassign") : null;
  if (unassignBtn && unassignBtn.dataset && unassignBtn.dataset.name) {
    const name = decodeURIComponent(String(unassignBtn.dataset.name));
    deleteAssignedType(name);
    rebuildTabsFromCache();
    renderTabs();
    state.activeTab = "CHƯA GÁN NHÓM";
    renderTabs();
    renderTable();
    setStatus(`Đã bỏ gán: ${name} (nhớ bấm Save)`);
    return;
  }

  const delBtn = e.target && e.target.closest ? e.target.closest(".cs-delete") : null;
  if (delBtn && delBtn.dataset && delBtn.dataset.name) {
    const name = decodeURIComponent(String(delBtn.dataset.name));
    // Remove persisted assignment + override, keep it in cache as unassigned.
    deleteAssignedType(name);
    // v2 only
    setKhoanV2Field(name, 'khoan', '');
    setKhoanV2Field(name, 'khoanMktAg', '');
    setKhoanV2Field(name, 'khoanUpsale', '');
    setKhoanV2Field(name, 'khoanSeeding', '');
    rebuildTabsFromCache();
    renderTabs();
    state.activeTab = "CHƯA GÁN NHÓM";
    renderTabs();
    renderTable();
    setStatus(`Đã xoá khỏi danh sách đã lưu: ${name} (nhớ bấm Save)`);
    return;
  }

  // Legacy prompt-based add group removed (now uses modal)
});

document.addEventListener("input", (e) => {
  const nameEl = e.target && e.target.classList && e.target.classList.contains("cs-name") ? e.target : null;
  if (nameEl) {
    // Disabled: no in-place name edits.
  }
  const khoanEl = e.target && e.target.classList && e.target.classList.contains("cs-khoan") ? e.target : null;
  if (khoanEl) {
    const idx = Number(khoanEl.dataset.idx);
    const rows = Array.isArray(state.cacheUsersByTab?.[state.activeTab]) ? state.cacheUsersByTab[state.activeTab] : [];
    if (!Number.isFinite(idx) || !rows[idx]) return;
    const name = String(rows[idx].name || "").trim();
    const field = String(khoanEl.dataset.field || "khoan");
    if (name) setKhoanV2Field(name, field, khoanEl.value);
  }

  const typeSel = e.target && e.target.classList && e.target.classList.contains("cs-type") ? e.target : null;
  if (typeSel) {
    const idx = Number(typeSel.dataset.idx);
    const rows = Array.isArray(state.cacheUsersByTab?.[state.activeTab]) ? state.cacheUsersByTab[state.activeTab] : [];
    if (!Number.isFinite(idx) || !rows[idx]) return;
    rows[idx]._pendingType = String(typeSel.value || "").trim();
  }

  if (e.target === newUserTypeSelect) {
    renderNewUserKhoanFields();
  }
});

// Currency-like formatting for money inputs + normalize names.
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!el) return;
  if (el.id === "defaultKhoanInput") {
    el.value = String(parseNumber(el.value || "") || "");
  }
  if (el.classList && (el.classList.contains("cs-khoan") || el.classList.contains("cs-newuser-khoan"))) {
    el.value = String(parseNumber(el.value || "") || "");
  }
});

document.addEventListener("focusout", (e) => {
  const el = e.target;
  if (!el) return;
  if (el.id === "defaultKhoanInput") {
    const v = parseNumber(el.value || "");
    el.value = v ? formatMoney(v) : "";
  }
  if (el.id === "clinicPctInput") {
    const v = parseNumber(el.value || "");
    el.value = v ? String(Math.round(v)) : "";
  }
  if (el.classList && (el.classList.contains("cs-khoan") || el.classList.contains("cs-newuser-khoan"))) {
    const v = parseNumber(el.value || "");
    el.value = String(el.value || "").trim() === "" ? "" : formatMoney(v);
  }
  // Name edits are disabled
});

boot();

