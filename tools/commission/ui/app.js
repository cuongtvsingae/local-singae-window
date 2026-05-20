const elTableHeader = document.getElementById('tableHeader');
const elTableBody = document.getElementById('tableBody');
const elDataTable = document.getElementById('dataTable');

const elLoading = document.getElementById('loading');
const elToastStack = document.getElementById('commissionToastStack');

const fetchCommissionFreshBtn = document.getElementById('fetchCommissionFreshBtn');
// cache button removed: cache auto-loads on init, and "Update mới nhất" refreshes cache.
const dateRangeSelect = document.getElementById('dateRangeSelect');

const exportBtn = document.getElementById('exportBtn');
const facilityTabsEl = document.getElementById('facilityTabs');

const STT_COLUMN_INDEX = 0;
const HO_TEN_COLUMN_INDEX = 1;
const KHOAN_COLUMN_INDEX = 2;
const THUC_THU_COLUMN_INDEX = 3;
const PHAN_TRAM_HOA_HONG_INDEX = 4; // % HOA HỒNG ĐƯỢC TÍNH
const DOANH_SO_TINH_HOA_HONG_INDEX = 5; // Doanh số tính hoa hồng
const PHAN_TRAM_DAT_KHOAN_INDEX = 6;
const PHAN_TRAM_HOA_HONG_CA_NHAN_INDEX = 7;
const PHAN_TRAM_HOA_HONG_PHONG_KHAM_INDEX = 8;
const HOA_HONG_FINAL_INDEX = 9;

const state = {
  templateHeaders: [],
  toasts: [],
  toastOffsetY: 0,
  nextToastId: 1,
  fetchCommissionInFlight: false,
  commissionByCategory: {},
  categoryOrder: ['BÁC SĨ', 'TLBS', 'NV KINH DOANH', 'KT KHÁCH CŨ', 'Lễ tân/CSKH'],
  activeCategory: 'NV KINH DOANH',
  schemaKeys: buildCommissionSchemaHeaders('NV KINH DOANH'),
  commissionConfig: {
    khoan: 250000000,
    clinicPct: 100,
    // NOTE: groups are routed by employeeTypes from Commission Settings. No auto TLBS list from cache.
    khoanOverridesV2: {}, // normalized employeeName -> { khoan, khoanMkt, khoanAg, khoanUpsale, khoanSeeding }
    employeeTypes: {}, // normalized employeeName -> type label
    groupDefs: [] // list of groups (tab order)
  }
};

function showLoading(isLoading) {
  if (!elLoading) return;
  elLoading.style.display = isLoading ? 'block' : 'none';
}

function showMessage(type, text) {
  if (!elToastStack) return;

  const id = state.nextToastId++;

  const slot = document.createElement('div');
  slot.className = 'commission-toast-slot';
  slot.dataset.toastId = String(id);

  const item = document.createElement('div');
  const toastTypeClass = type === 'error' ? 'status-error' : type === 'info' ? 'status-info' : 'status-ok';
  item.className = `commission-toast-item ${toastTypeClass}`;
  item.textContent = text;
  slot.appendChild(item);

  elToastStack.appendChild(slot);

  const measureOffset = () => {
    if (!state.toastOffsetY) {
      const h = item.offsetHeight || 46;
      // Reduce gap between 2 toasts (when stacking) while keeping layout stable.
      state.toastOffsetY = h + 6;
    }
  };

  const renderPositions = () => {
    if (!state.toastOffsetY) measureOffset();
    const n = state.toasts.length || 1;
    state.toasts.forEach((t, idx) => {
      // Toast hiển thị trước (idx nhỏ hơn) phải nằm phía dưới => đảo translate theo n.
      const y = (n - 1 - idx) * state.toastOffsetY;
      t.slot.style.transform = `translate3d(0, ${y}px, 0)`;
    });
  };

  const removeToastDom = (toast) => {
    try {
      if (toast.slot && toast.slot.parentNode) toast.slot.parentNode.removeChild(toast.slot);
    } catch (_) {}
  };

  const hideToast = (toast, shiftNow) => {
    if (!toast || toast.isExiting) return;
    toast.isExiting = true;
    if (toast.timer) clearTimeout(toast.timer);

    if (shiftNow) {
      // Remove from our queue first so others slide immediately.
      state.toasts = state.toasts.filter((t) => t.id !== toast.id);
      renderPositions();
    }

    toast.item.classList.remove('is-in');
    toast.item.classList.add('is-out');

    setTimeout(() => {
      removeToastDom(toast);

      // If this toast wasn't removed from array earlier, remove it now.
      if (!shiftNow) {
        state.toasts = state.toasts.filter((t) => t.id !== toast.id);
        renderPositions();
      }
    }, 230);
  };

  const toast = { id, slot, item, timer: null, isExiting: false };
  state.toasts.push(toast);

  // Enter from above (CSS handles transform/opacity starting state).
  requestAnimationFrame(() => {
    item.classList.add('is-in');
    measureOffset();
    toast.timer = setTimeout(() => hideToast(toast, false), 2000);

    // Max 2 toasts: if this is the 3rd, shift/animate all within the same frame.
    if (state.toasts.length > 2) {
      const oldest = state.toasts[0];
      hideToast(oldest, true);
    }

    renderPositions();
  });
}

function logStatus(type, text) {
  // All user-visible statuses go through showMessage so UI stays consistent.
  showMessage(type, text);
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return 0;
  // Remove thousand separators and non-numeric symbols.
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parsePercent(value) {
  // Accept: "1.8%", "1.8", "110%"...
  return parseNumber(value);
}

function calculateCommissionPercent(revenue) {
  return revenue < 400000000 ? 1.8 : 2.3;
}

function calculateTargetAchievementPercent(revenue, khoan) {
  const r = Number(revenue || 0);
  const k = Number(khoan || 0);
  if (!k || k === 0) return 0;
  const percent = (r / k) * 100;
  return Math.round(percent * 100) / 100; // 2 chữ số
}

function calculatePersonalCommissionPercent(targetAchievementPercent) {
  const t = Number(targetAchievementPercent || 0);
  if (t < 70) return 70;
  if (t >= 70 && t < 80) return 80;
  if (t >= 80 && t < 90) return 90;
  if (t >= 90 && t <= 100) return 100;
  if (t > 100 && t <= 110) return 110;
  return 120;
}

function isYTTOrGDCS(hoTenText) {
  const t = String(hoTenText || '').trim().toUpperCase();
  return t.includes('YTT') || t.includes('GDCS');
}

function normalizeName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getValidHeaders(headers) {
  const validHeaders = [];
  const headerIndexMap = [];

  headers.forEach((header, index) => {
    const headerText = String(header || '').trim();
    if (!headerText) return;
    if (headerText.match(/^Cột [A-Z]$/i)) return;
    // Hide "TYPE / NHÓM" columns (not needed in any tab)
    const hNorm = normalizeHeaderText(headerText);
    if (
      hNorm === 'type' ||
      hNorm === 'nhom' ||
      hNorm === 'nhóm' ||
      hNorm.includes('usergroupname') ||
      hNorm.includes('nhom ') ||
      hNorm.includes('nhóm ')
    ) {
      return;
    }
    validHeaders.push(headerText);
    headerIndexMap.push(index);
  });

  return { validHeaders, headerIndexMap };
}

function normalizeHeaderText(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findHeaderIndexByKeywords(keywords = [], fallbackIndex = -1) {
  const headers = Array.isArray(state.templateHeaders) ? state.templateHeaders : [];
  if (!headers.length) return fallbackIndex;
  const normalizedKeywords = (Array.isArray(keywords) ? keywords : [])
    .map((k) => normalizeHeaderText(k))
    .filter(Boolean);
  if (!normalizedKeywords.length) return fallbackIndex;

  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeaderText(headers[i]);
    if (!h) continue;
    if (normalizedKeywords.some((k) => h.includes(k))) return i;
  }
  return fallbackIndex;
}

function getCommissionColumnIndexes() {
  // Prefer matching by header names to avoid index drift when template changes.
  return {
    stt: findHeaderIndexByKeywords(['stt', 'số thứ tự', 'so thu tu'], 0),
    employeeName: findHeaderIndexByKeywords(['tên', 'ten', 'employeeName'], 1),
    userGroupName: findHeaderIndexByKeywords(['nhóm', 'nhom', 'userGroupName'], 2),
    allocationAmount: findHeaderIndexByKeywords(['thực thu', 'thuc thu', 'allocationAmount'], 3),
    totalCommission: findHeaderIndexByKeywords(['doanh số hoa hồng', 'doanh so hoa hong', 'totalCommission'], 4),
    totalAmount: findHeaderIndexByKeywords(['tổng tiền', 'tong tien', 'totalAmount'], 5),
    amountCalcCommission: findHeaderIndexByKeywords(['doanh số tính hh', 'doanh so tinh hh', 'amountCalcCommission'], 6),
    percent: findHeaderIndexByKeywords(['%', 'percent'], 7),
    mainPoint: findHeaderIndexByKeywords(['main point', 'mainPoint'], 8),
    supportPoint: findHeaderIndexByKeywords(['support point', 'supportPoint'], 9)
  };
}

function isDoctorName(employeeName) {
  const t = String(employeeName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  // Rule: employeeName bắt đầu bằng "bs" (vd: "BS A", "bs. B", "bsNguyen Van C")
  return t.startsWith('bs') || t.startsWith('bs.');
}

function createDisplayTable(headers, sampleRows) {
  if (!elTableHeader || !elTableBody) return;

  elTableHeader.innerHTML = '';
  elTableBody.innerHTML = '';

  const { validHeaders, headerIndexMap } = getValidHeaders(headers);
  state.templateHeaders = validHeaders;

  const trHead = document.createElement('tr');
  validHeaders.forEach((h) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (trHead.children.length === HO_TEN_COLUMN_INDEX) th.classList.add('name-col');
    trHead.appendChild(th);
  });
  elTableHeader.appendChild(trHead);

  (Array.isArray(sampleRows) ? sampleRows : []).forEach((rowData) => {
    const tr = document.createElement('tr');
    const cellsLen = validHeaders.length;

    for (let newIndex = 0; newIndex < cellsLen; newIndex++) {
      const oldIndex = headerIndexMap[newIndex];
      const value = Array.isArray(rowData) && oldIndex !== undefined ? rowData[oldIndex] : '';

      const td = document.createElement('td');
      td.textContent = value === null || value === undefined ? '' : String(value);

      if (newIndex === HO_TEN_COLUMN_INDEX) td.classList.add('assistant-cell', 'name-col');
      if (newIndex === THUC_THU_COLUMN_INDEX) td.classList.add('revenue-cell');
      if (newIndex === PHAN_TRAM_HOA_HONG_INDEX) td.classList.add('commission-cell');
      if (newIndex === PHAN_TRAM_DAT_KHOAN_INDEX) td.classList.add('target-achievement-cell');
      if (newIndex === PHAN_TRAM_HOA_HONG_CA_NHAN_INDEX) td.classList.add('personal-commission-cell');
      if (newIndex === PHAN_TRAM_HOA_HONG_PHONG_KHAM_INDEX) td.classList.add('clinic-commission-cell');
      if (newIndex === HOA_HONG_FINAL_INDEX) td.classList.add('final-commission-cell');

      tr.appendChild(td);
    }

    elTableBody.appendChild(tr);
  });
}

function buildCommissionSchemaHeaders(activeCategoryName) {
  const cat = String(activeCategoryName || '').trim();
  const isDoctor = cat.toUpperCase() === 'BÁC SĨ';
  const isTlbs = cat.toUpperCase() === 'TLBS';
  const isReception = cat.toUpperCase() === 'LỄ TÂN/CSKH';

  // Tab BÁC SĨ: chỉ giữ các cột cần xem
  if (isDoctor) {
    return ['employeeName', 'amountCalcCommission', 'totalAmount', 'totalCommission'];
  }

  // Tab Lễ tân/CSKH: không cần KHOÁN và % ĐẠT KHOÁN
  if (isReception) {
    return [
      'employeeName',
      'allocationAmount',
      'pctHoaHongDuocTinh',
      'pctHoaHongPhongKham',
      'pctHoaHongCaNhan',
      'amountCalcCommission',
      'totalAmount',
      'totalCommission'
    ];
  }

  // Tab NV Kinh doanh: đúng thứ tự yêu cầu
  const nvKeys = [
    'employeeName',
    'khoan',
    'allocationAmount',
    'pctDatKhoan',
    'pctHoaHongDuocTinh',
    'pctHoaHongPhongKham',
    'pctHoaHongCaNhan',
    'amountCalcCommission',
    'totalAmount',
    'hhSanPhamNvkd',
    'totalCommission'
  ];

  // Tab TLBS: tách Thực thu thành 2 cột con (25VNP + 355LTT)
  if (isTlbs) {
    return [
      'employeeName',
      // TLBS detailed columns (fill what we can from current API/cache)
      'tlbsTongKhoanCaNhan',
      'tlbsDoanhThuCaNhanHN',
      'tlbsDoanhThuCaNhanHCM',
      'tlbsPctDatKhoanCaNhan',
      'tlbsPctDatKhoanTeam',
      'tlbsKhoanNguonMktAg',
      'tlbsDoanhThuNguonMktAgency',
      'tlbsPctDatKhoanDthuNguonMkt',
      'tlbsDsoTinhHhNguonMkt',
      'tlbsPctHoaHongNguonMkt',
      'tlbsUpsaleTele',
      'tlbsPctHoaHongSdTele',
      'tlbsPctHoaHongKemDanhRang',
      'tlbsPctHoaHongMayTamNuoc',
      'tlbsPctHoaHongNuocSucMieng',
      'tlbsPctHoaHongGoiBac',
      'tlbsHhKdcTroLyBs',
      'tlbsThuongKhacHhSeedingCu',
      'tlbsPctHhHoanThanhKhoanTeamXCaNhan',
      'tlbsHhDoanhSoThucNhan',
      'tlbsHhSanPham',
      'tlbsTongHhThucNhan',
      'tlbsDoanhThuNguonUpsale',
      'tlbsDoanhThuNguonSeeding',
      'tlbsKhop'
    ];
  }

  return nvKeys;
}

function labelForSchemaKey(key) {
  const k = String(key || '').trim();
  const map = {
    employeeName: 'TÊN',
    khoan: 'KHOÁN',
    allocationAmount: 'THỰC THU',
    allocationAmount25VNP: '25VNP',
    allocationAmount355LTT: '355LTT',
    pctHoaHongDuocTinh: '% HH\nĐƯỢC TÍNH',
    pctHoaHongPhongKham: '%HH\nPHÒNG KHÁM',
    amountCalcCommission: 'DOANH SỐ\nTÍNH HH',
    pctDatKhoan: '% ĐẠT\nKHOÁN',
    pctHoaHongCaNhan: '% HOA HỒNG\nCÁ NHÂN',
    totalAmount: 'TỔNG TIỀN',
    totalCommission: 'HOA HỒNG\nĐƯỢC HƯỞNG',
    hhSanPhamNvkd: 'HH SẢN PHẨM\n(NVKD)',

    // TLBS detailed labels
    tlbsTongKhoanCaNhan: 'TỔNG KHOÁN CÁ NHÂN',
    tlbsDoanhThuCaNhanHN: 'DOANH THU CÁ NHÂN\nTẠI CƠ SỞ HN',
    tlbsDoanhThuCaNhanHCM: 'DOANH THU CÁ NHÂN\nTẠI CƠ SỞ HCM',
    tlbsPctDatKhoanCaNhan: '% ĐẠT KHOÁN\nCÁ NHÂN',
    tlbsPctDatKhoanTeam: '% ĐẠT KHOÁN\nTEAM',
    tlbsKhoanNguonMktAg: 'KHOÁN NGUỒN\nMKT, AG',
    tlbsDoanhThuNguonMktAgency: 'DOANH THU NGUỒN\nMKT, AGENCY',
    tlbsPctDatKhoanDthuNguonMkt: '%ĐẠT KHOÁN\nDTHU NGUỒN MKT',
    tlbsDsoTinhHhNguonMkt: 'DSO TÍNH HH\nNGUỒN MKT',
    tlbsPctHoaHongNguonMkt: '% HOA HỒNG',
    tlbsUpsaleTele: 'UPSALE-TELE',
    tlbsPctHoaHongSdTele: '% HOA HỒNG\nSD - TELE',
    tlbsPctHoaHongKemDanhRang: '% HOA HỒNG\nKEM ĐÁNH RĂNG\nCHLORHEXI 0.12%',
    tlbsPctHoaHongMayTamNuoc: '% HOA HỒNG\nMÁY TĂM NƯỚC\nPROCARE KHD13',
    tlbsPctHoaHongNuocSucMieng: '% HOA HỒNG\nNƯỚC SÚC MIỆNG',
    tlbsPctHoaHongGoiBac: '% HOA HỒNG\nGÓI BẠC',
    tlbsHhKdcTroLyBs: 'HH KĐC\n(TRỢ LÝ BÁC SĨ)',
    tlbsThuongKhacHhSeedingCu: 'THƯỞNG KHÁC/\nHH SEEDING\nCƠ CHẾ CŨ',
    tlbsPctHhHoanThanhKhoanTeamXCaNhan: '% HH\nHOÀN THÀNH\nKHOÁN TEAM (CƠ SỞ)\nX HOÀN THÀNH\nKHOÁN CÁ NHÂN',
    tlbsHhDoanhSoThucNhan: 'HH DOANH SỐ\nTHỰC NHẬN',
    tlbsHhSanPham: 'HH SẢN PHẨM',
    tlbsTongHhThucNhan: 'TỔNG HH\nTHỰC NHẬN',
    tlbsDoanhThuNguonUpsale: 'DOANH THU NGUỒN\nUPSALE',
    tlbsDoanhThuNguonSeeding: 'DOANH THU NGUỒN\nSEEDING',
    tlbsKhop: 'KHỚP'
  };
  return map[k] || k;
}

function calculateCommissionPercentByThucThu(thucThu) {
  // Rule: if user.thucThu < 230,000,000 => 1.8% else 2.3%
  return Number(thucThu || 0) < 230000000 ? 1.8 : 2.3;
}

function calculateTargetAchievementPercent(thucThu, khoan) {
  const r = Number(thucThu || 0);
  const k = Number(khoan || 0);
  if (!k || k <= 0) return 0;
  return (r / k) * 100;
}

function calculatePersonalCommissionPercent(targetAchievementPercent) {
  // Excel rule (I101 is % đạt khoán):
  // <70% => 70
  // [70,80) => 80
  // [80,90) => 90
  // [90,100) => 100
  // [100,110) => 110
  // else => 120
  const t = Number(targetAchievementPercent || 0);
  if (t < 70) return 70;
  if (t >= 70 && t < 80) return 80;
  if (t >= 80 && t < 90) return 90;
  if (t >= 90 && t < 100) return 100;
  if (t >= 100 && t < 110) return 110;
  return 120;
}

function createSchemaTable(schemaKeys, { category } = {}) {
  const keys = Array.isArray(schemaKeys) ? schemaKeys : [];
  state.schemaKeys = keys;
  const cat = String(category || state.activeCategory || '').trim().toUpperCase();
  if (elDataTable) elDataTable.setAttribute('data-category', cat);

  if (!elTableHeader || !elTableBody) return;
  elTableHeader.innerHTML = '';
  elTableBody.innerHTML = '';

  const tooltipForKey = (k) => {
    const kk = String(k || '').trim();
    const tips = {
      employeeName: 'Nguồn: user.employeeName',
      allocationAmount: 'Nguồn: user.allocationAmount',
      allocationAmount25VNP: 'Nguồn: tổng allocationAmount tại cơ sở 25VNP',
      allocationAmount355LTT: 'Nguồn: tổng allocationAmount tại cơ sở 355LTT',
      khoan: 'Nguồn: Commission Settings (khoán override) / khoán mặc định',
      pctDatKhoan: 'Công thức: % ĐẠT KHOÁN = THỰC THU / KHOÁN',
      pctHoaHongDuocTinh: 'Công thức: THỰC THU < 230.000.000 => 1.8% ; ngược lại 2.3%',
      pctHoaHongCaNhan: 'Công thức theo Excel: <70=>70; [70,80)=>80; [80,90)=>90; [90,100)=>100; [100,110)=>110; else 120',
      pctHoaHongPhongKham: 'Nguồn: Commission Settings (%HH phòng khám)',
      amountCalcCommission: 'Nguồn: user.amountCalcCommission',
      totalAmount: 'Nguồn: user.totalAmount',
      totalCommission: 'BS: user.totalCommission; nhóm khác: tính lại từ công thức',

      // TLBS: based on your Excel mapping (D/E/F/...)
      tlbsTongKhoanCaNhan: 'Excel cột D. Nguồn: khoán TLBS (khoan + khoanMktAg).',
      tlbsDoanhThuCaNhanHN: 'Excel cột E. Nguồn: allocationAmount25VNP (HN).',
      tlbsDoanhThuCaNhanHCM: 'Excel cột F. Nguồn: allocationAmount355LTT (HCM).',
      tlbsPctDatKhoanCaNhan: 'Excel cột G/H tuỳ file. Công thức: (E+F)/D.',
      tlbsPctDatKhoanTeam: 'Công thức: % ĐẠT KHOÁN TEAM = (E+F)/D (theo bạn gửi).',
      tlbsKhoanNguonMktAg: 'Nguồn: Commission Settings (khoanMktAg hoặc khoanMkt+khoanAg legacy).',
      tlbsDoanhThuNguonMktAgency: 'Công thức: E+F - (DOANH THU UPSALE) - (DOANH THU SEEDING). Thiếu AJ/AK thì hiển thị -.',
      tlbsPctDatKhoanDthuNguonMkt: 'Công thức: IF(I=0;0;J/I).',
      tlbsDsoTinhHhNguonMkt: "Công thức SUMIFS theo sheet 'T12.25. HN'... (chưa có data sheet trong API).",
      tlbsPctHoaHongNguonMkt: 'Công thức: if(K<50%;0.1%; K<70%;0.8%; K<90%;1.2%; else 1.5%).',
      tlbsUpsaleTele: "Công thức SUMIFS theo sheet 'T12.25. HN'... (chưa có data sheet trong API).",
      tlbsPctHoaHongSdTele: 'Theo Excel: -',
      tlbsPctHoaHongKemDanhRang: 'Theo Excel: 10% (doanh thu sản phẩm hiện chưa có).',
      tlbsPctHoaHongMayTamNuoc: 'Theo Excel: 10% (doanh thu sản phẩm hiện chưa có).',
      tlbsPctHoaHongNuocSucMieng: 'Theo Excel: bậc thang 15%/17%/20% theo doanh thu (chưa có).',
      tlbsPctHoaHongGoiBac: 'Theo Excel: 7% (chưa có).',
      tlbsHhKdcTroLyBs: 'Theo Excel: cố định 554.000.',
      tlbsThuongKhacHhSeedingCu: 'Theo Excel: phụ thuộc sheet PHỤ TÁ - HN / R37... (chưa có).',
      tlbsPctHhHoanThanhKhoanTeamXCaNhan: 'Theo Excel: phụ thuộc % đạt khoán team (H...).',
      tlbsHhDoanhSoThucNhan: 'Theo Excel: (L*M+N*O+P*T)*AB (thiếu dữ liệu).',
      tlbsHhSanPham: 'Theo Excel: R*S+T*U+V*W+X*Y (thiếu dữ liệu).',
      tlbsTongHhThucNhan: 'Theo Excel: SUM(Z:AA;AC:AD) (thiếu dữ liệu).',
      tlbsDoanhThuNguonUpsale: 'Excel cột AJ (chưa có từ API hiện tại).',
      tlbsDoanhThuNguonSeeding: 'Excel cột AK (chưa có từ API hiện tại).',
      tlbsKhop: 'Cột kiểm tra khớp (chưa có từ API hiện tại).'
    };
    return tips[kk] || '';
  };

  // Build header row with tooltips (for ALL schema-based views)
  const tr = document.createElement('tr');
  const thStt = document.createElement('th');
  thStt.textContent = 'STT';
  thStt.title = 'Số thứ tự';
  tr.appendChild(thStt);

  keys.forEach((k) => {
    const th = document.createElement('th');
    th.textContent = labelForSchemaKey(k);
    const tip = tooltipForKey(k);
    if (tip) th.title = tip;
    if (k === 'employeeName') th.classList.add('name-col');
    tr.appendChild(th);
  });
  elTableHeader.appendChild(tr);

  // template headers used by row render (export alignment)
  state.templateHeaders = ['STT', ...keys.map(labelForSchemaKey)];
}

function normalizeUserFromRole(role) {
  const u = role?.user && typeof role.user === 'object' ? role.user : role;
  if (!u) return null;
  const employeeName = String(u.employeeName || u.userName || u.user || '').trim();
  if (!employeeName) return null;
  return {
    employeeId: String(u.employeeId || '').trim(),
    employeeName,
    userGroupName: String(u.userGroupName || '').trim(),
    allocationAmount: parseNumber(u.allocationAmount),
    totalCommission: parseNumber(u.totalCommission),
    totalAmount: parseNumber(u.totalAmount),
    amountCalcCommission: parseNumber(u.amountCalcCommission),
    percent: parseNumber(u.percent),
    mainPoint: parseNumber(u.mainPoint),
    supportPoint: parseNumber(u.supportPoint)
  };
}

function formatVnNumber(n) {
  const num = parseNumber(n);
  return new Intl.NumberFormat('vi-VN').format(num);
}

function tryFindCommissionAssistant(map, normalizedAssistant) {
  // Exact
  if (map[normalizedAssistant] !== undefined) return map[normalizedAssistant];

  // With "pt " prefix
  const withPT = `pt ${normalizedAssistant}`;
  if (map[withPT] !== undefined) return map[withPT];

  // Without "pt " prefix
  const withoutPT = normalizedAssistant.replace(/^pt\s+/, '');
  if (map[withoutPT] !== undefined) return map[withoutPT];

  // Partial fallback
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key.includes(normalizedAssistant) || normalizedAssistant.includes(key)) return map[key];
  }
  return undefined;
}

function addNewAssistantRow({ assistant, totalRevenue }) {
  if (!elTableBody || !Array.isArray(state.templateHeaders) || !state.templateHeaders.length) return;

  const tr = document.createElement('tr');
  const rowCount = (elTableBody.querySelectorAll('tr') || []).length;
  const stt = String(rowCount + 1);

  for (let colIdx = 0; colIdx < state.templateHeaders.length; colIdx++) {
    const td = document.createElement('td');
    let value = '';

    if (colIdx === STT_COLUMN_INDEX) value = stt;
    if (colIdx === HO_TEN_COLUMN_INDEX) value = assistant;
    if (colIdx === THUC_THU_COLUMN_INDEX) value = formatVnNumber(totalRevenue);
    if (colIdx === PHAN_TRAM_HOA_HONG_INDEX) {
      const pct = calculateCommissionPercent(parseNumber(totalRevenue));
      value = `${pct.toFixed(1)}%`;
    }

    td.textContent = value;

    if (colIdx === HO_TEN_COLUMN_INDEX) td.classList.add('assistant-cell', 'name-col');
    if (colIdx === THUC_THU_COLUMN_INDEX) td.classList.add('revenue-cell');
    if (colIdx === PHAN_TRAM_HOA_HONG_INDEX) td.classList.add('commission-cell');
    if (colIdx === PHAN_TRAM_DAT_KHOAN_INDEX) td.classList.add('target-achievement-cell');
    if (colIdx === PHAN_TRAM_HOA_HONG_CA_NHAN_INDEX) td.classList.add('personal-commission-cell');
    if (colIdx === PHAN_TRAM_HOA_HONG_PHONG_KHAM_INDEX) td.classList.add('clinic-commission-cell');
    if (colIdx === HOA_HONG_FINAL_INDEX) td.classList.add('final-commission-cell');

    tr.appendChild(td);
  }

  elTableBody.appendChild(tr);
}

function addNewEmployeeRowFromCommission({ employeeName, thucThu, doanhSo }) {
  // Legacy function kept for compatibility; new schema-based table uses renderRowFromUserAgg instead.
  if (!elTableBody) return;
  addNewSchemaRow({
    employeeName,
    userGroupName: '',
    allocationAmount: thucThu,
    totalCommission: doanhSo,
    totalAmount: 0,
    amountCalcCommission: 0,
    percent: 0,
    mainPoint: 0,
    supportPoint: 0
  });
}

function fillRevenueToDisplayTable(calculatedData) {
  const rows = Array.from(elTableBody?.querySelectorAll('tr') || []);
  if (!rows.length) return;

  const assistantDataMap = {};
  (Array.isArray(calculatedData) ? calculatedData : []).forEach((item) => {
    if (!item?.assistant) return;
    const normalized = String(item.assistant).trim().toLowerCase();
    assistantDataMap[normalized] = {
      assistant: item.assistant,
      totalRevenue: item.totalRevenue || 0
    };
  });

  const existingAssistants = new Set();
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const hoTenCell = cells[HO_TEN_COLUMN_INDEX];
    if (!hoTenCell) return;
    const normalized = String(hoTenCell.textContent || '').trim().toLowerCase();
    if (normalized) existingAssistants.add(normalized);
  });

  // Fill existing rows
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;

    const assistantCell = cells[HO_TEN_COLUMN_INDEX];
    const assistantName = assistantCell ? String(assistantCell.textContent || '').trim() : '';
    if (!assistantName) return;

    const normalizedAssistant = assistantName.toLowerCase();
    const found = tryFindCommissionAssistant(assistantDataMap, normalizedAssistant);

    const khoanCell = cells[KHOAN_COLUMN_INDEX];
    const revenueCell = cells[THUC_THU_COLUMN_INDEX];
    const commissionPercentCell = cells[PHAN_TRAM_HOA_HONG_INDEX];
    const targetCell = cells[PHAN_TRAM_DAT_KHOAN_INDEX];
    const personalCell = cells[PHAN_TRAM_HOA_HONG_CA_NHAN_INDEX];

    if (!found) {
      if (revenueCell) revenueCell.textContent = '';
      if (commissionPercentCell) commissionPercentCell.textContent = '';
      if (targetCell) targetCell.textContent = '';
      if (personalCell) personalCell.textContent = '';
      return;
    }

    const totalRevenue = parseNumber(found.totalRevenue);
    if (revenueCell) {
      revenueCell.textContent = totalRevenue > 0 ? formatVnNumber(totalRevenue) : '';
      revenueCell.classList.add('revenue-cell');
    }

    const commissionPercent = calculateCommissionPercent(totalRevenue);
    if (commissionPercentCell) {
      commissionPercentCell.textContent = totalRevenue > 0 ? `${commissionPercent.toFixed(1)}%` : '';
      commissionPercentCell.classList.add('commission-cell');
    }

    // Tính % đạt khoán + % hoa hồng cá nhân dựa trên Khoán (khoanCell)
    const khoan = khoanCell ? parseNumber(khoanCell.textContent) : 0;
    if (khoan > 0) {
      const targetAchPct = calculateTargetAchievementPercent(totalRevenue, khoan);
      if (targetCell) {
        targetCell.textContent = `${targetAchPct.toFixed(2)}%`;
        targetCell.classList.add('target-achievement-cell');
      }
      const personalPct = calculatePersonalCommissionPercent(targetAchPct);
      if (personalCell) {
        personalCell.textContent = `${personalPct}%`;
        personalCell.classList.add('personal-commission-cell');
      }
    } else {
      if (targetCell) targetCell.textContent = '';
      if (personalCell) personalCell.textContent = '';
    }
  });

  // Add rows for assistants that are not in the existing table
  Object.keys(assistantDataMap).forEach((normalizedAssistant) => {
    if (existingAssistants.has(normalizedAssistant)) return;
    const v = assistantDataMap[normalizedAssistant];
    addNewAssistantRow({ assistant: v.assistant, totalRevenue: v.totalRevenue });
  });

  // Clinic commission UI removed.
}

// calculateAndFillFinalCommission removed (clinic commission UI removed)

function clearTableBody() {
  if (!elTableBody) return;
  elTableBody.innerHTML = '';
}

function formatMaybeNumber(v) {
  const n = parseNumber(v);
  if (!(n > 0) && n !== 0) return '';
  // show 0 as 0 for percent/points, but for amounts we will format anyway in specific mapping
  return String(n);
}

function formatSchemaCellValue(key, value) {
  const k = String(key || '').trim();
  if (value === null || value === undefined) return '';
  if (k === 'pctHoaHongDuocTinh') {
    const thucThu = parseNumber(value);
    if (!(thucThu > 0)) return '';
    const pct = calculateCommissionPercentByThucThu(thucThu);
    return `${pct.toFixed(1)}%`;
  }
  if (k === 'pctHoaHongPhongKham') {
    const pct = parseNumber(value);
    if (!(pct > 0)) return '';
    return `${pct.toFixed(0)}%`;
  }
  if (k === 'pctDatKhoan') {
    const pct = Number(value || 0);
    if (!(pct > 0)) return '';
    return `${pct.toFixed(2)}%`;
  }
  if (k === 'pctHoaHongCaNhan') {
    const pct = Number(value || 0);
    if (!(pct > 0)) return '';
    return `${Math.round(pct)}%`;
  }
  // numeric-like keys
  if (['khoan', 'allocationAmount', 'allocationAmount25VNP', 'allocationAmount355LTT', 'totalCommission', 'totalAmount', 'amountCalcCommission', 'mainPoint', 'supportPoint'].includes(k)) {
    return new Intl.NumberFormat('vi-VN').format(parseNumber(value));
  }
  if (k === 'percent') {
    // % not displayed in UI per user request
    return '';
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch (_) { return ''; }
  }
  return String(value);
}

function normalizeNamePrefix(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isKnownPrefix(nameNormalized) {
  const t = String(nameNormalized || '');
  return (
    t.startsWith('bs') ||
    t.startsWith('bs.') ||
    t.startsWith('pt') ||
    t.startsWith('tele') ||
    t.startsWith('cskh') ||
    t.startsWith('tlbs')
  );
}

// TLBS routing is driven by employeeTypes persisted in Commission Settings.

function getKhoanForUser(userObj) {
  const normalized = normalizeNamePrefix(userObj?.employeeName);
  const type = String(getCategoryForUser(userObj) || '').trim().toUpperCase();
  // These groups do not use khoán
  if (type === 'BÁC SĨ' || type === 'LỄ TÂN/CSKH') return 0;

  const v2 = state.commissionConfig?.khoanOverridesV2 && typeof state.commissionConfig.khoanOverridesV2 === 'object'
    ? state.commissionConfig.khoanOverridesV2
    : {};
  const row = (v2?.[normalized] && typeof v2[normalized] === 'object' && !Array.isArray(v2[normalized])) ? v2[normalized] : {};

  // NV KINH DOANH: default khoán applies
  if (type === 'NV KINH DOANH') {
    const defaultKhoan = parseNumber(state.commissionConfig?.khoan) || 250000000;
    if (row.khoan !== undefined) {
      const v = parseNumber(row.khoan);
      return Number.isFinite(v) && v >= 0 ? v : defaultKhoan;
    }
    return defaultKhoan;
  }

  // TLBS: KHOÁN + (MKT/AG gộp 1 loại). Backward compatible with legacy khoanMkt/khoanAg.
  if (type === 'TLBS') {
    const base = parseNumber(row.khoan);
    const mktAg = parseNumber(row.khoanMktAg);
    const mkt = parseNumber(row.khoanMkt);
    const ag = parseNumber(row.khoanAg);
    const extra = (Number.isFinite(mktAg) && mktAg > 0)
      ? mktAg
      : ((Number.isFinite(mkt) ? mkt : 0) + (Number.isFinite(ag) ? ag : 0));
    const sum = (Number.isFinite(base) ? base : 0) + extra;
    return sum;
  }

  // KT KHÁCH CŨ: UPSALE + SEEDING (no default)
  if (type === 'KT KHÁCH CŨ') {
    const up = parseNumber(row.khoanUpsale);
    const se = parseNumber(row.khoanSeeding);
    const sum = (Number.isFinite(up) ? up : 0) + (Number.isFinite(se) ? se : 0);
    return sum;
  }

  // Any other types: temporarily follow NV KINH DOANH logic
  const defaultKhoan = parseNumber(state.commissionConfig?.khoan) || 250000000;
  if (row.khoan !== undefined) {
    const v = parseNumber(row.khoan);
    return Number.isFinite(v) && v >= 0 ? v : defaultKhoan;
  }
  return defaultKhoan;
}

// Removed: warnMissingKhoanOverridesForTlbs (khoán config is managed in Commission Settings now)

function getUserSortRankByPrefix(employeeName) {
  const t = normalizeNamePrefix(employeeName);
  // BS / Bác sĩ
  if (t.startsWith('bs') || t.startsWith('bs.')) return 0;
  // TELE
  if (t.startsWith('tele')) return 1;
  // CSKH
  if (t.startsWith('cskh')) return 2;
  // PT goes last
  if (t.startsWith('pt')) return 4;
  // no known prefix
  return 3;
}

function isDoctorUser(u) {
  const name = normalizeNamePrefix(u?.employeeName);
  const group = String(u?.userGroupName || '').trim().toLowerCase();
  return name.startsWith('bs') || name.startsWith('bs.') || group === 'bác sĩ';
}

function getAssignedTypeForUser(u) {
  const normalized = normalizeNamePrefix(u?.employeeName);
  const map = state.commissionConfig?.employeeTypes && typeof state.commissionConfig.employeeTypes === 'object'
    ? state.commissionConfig.employeeTypes
    : {};
  const t = map?.[normalized];
  return typeof t === 'string' ? String(t || '').trim() : '';
}

function getCategoryForUser(u) {
  const assigned = getAssignedTypeForUser(u);
  if (assigned) return assigned;
  if (isDoctorUser(u)) return 'BÁC SĨ';
  // PT is treated as NV KINH DOANH
  const nameNorm = normalizeNamePrefix(u?.employeeName);
  if (nameNorm.startsWith('pt')) return 'NV KINH DOANH';
  return 'NV KINH DOANH';
}

function addNewSchemaRow(userObj) {
  if (!elTableBody || !Array.isArray(state.templateHeaders) || !state.templateHeaders.length) return;
  const tr = document.createElement('tr');
  const rowCount = (elTableBody.querySelectorAll('tr') || []).length;
  const stt = String(rowCount + 1);

  const keys = Array.isArray(state.schemaKeys) ? state.schemaKeys : [];
  const cells = [];
  const isDoctor = isDoctorUser(userObj);
  // Doctor rule: chỉ quan tâm các chỉ số chính
  const doctorAllowed = new Set(['employeeName', 'amountCalcCommission', 'totalAmount', 'totalCommission']);

  // STT
  cells.push(stt);
  // Precompute derived values
  const khoan = getKhoanForUser(userObj);
  const thucThu25 = parseNumber(userObj?.allocationAmount25VNP);
  const thucThu355 = parseNumber(userObj?.allocationAmount355LTT);
  const thucThu = keys.includes('allocationAmount25VNP') || keys.includes('allocationAmount355LTT')
    ? (thucThu25 + thucThu355)
    : parseNumber(userObj?.allocationAmount);
  const clinicPct = parseNumber(state.commissionConfig?.clinicPct) || 100;
  const pctDatKhoan = calculateTargetAchievementPercent(thucThu, khoan);
  const pctHoaHongCaNhan = calculatePersonalCommissionPercent(pctDatKhoan);
  const pctHoaHongDuocTinh = calculateCommissionPercentByThucThu(thucThu);
  const doanhSoTinhHH = parseNumber(userObj?.amountCalcCommission);
  const isNvkd = String(getCategoryForUser(userObj) || '').trim().toUpperCase() === 'NV KINH DOANH';
  // NVKD: HH SẢN PHẨM từ productSalesV1
  let hhSanPhamNvkd = 0;
  if (isNvkd) {
    const n = normalizeNamePrefix(userObj?.employeeName);
    const salesNode = state.commissionConfig?.productSalesByUser?.[n] || {};
    const mapped = salesNode?.mapped || {};
    const mouthwashAmount = parseNumber(mapped?.mouthwash?.amount);
    const tamNuocAmount = parseNumber(mapped?.waterflosser?.amount);
    const kemAmount = parseNumber((state.commissionConfig?.productSalesV1?.totalsByUser?.[n]?.products || {})['KEM ĐÁNH RĂNG CHLORHEXI 0.12%']); // backward
    const dentalCareAmount = parseNumber(mapped?.dentalCare?.amount);
    const UNIT_MOUTHWASH = 120000; // 120k/chai theo dữ liệu thực tế
    const mouthwashQty = UNIT_MOUTHWASH > 0 ? Math.round(mouthwashAmount / UNIT_MOUTHWASH) : 0;
    let mouthwashPct = 0;
    if (mouthwashQty > 0 && mouthwashQty <= 40) mouthwashPct = 0.15;
    else if (mouthwashQty <= 80) mouthwashPct = 0.17;
    else if (mouthwashQty > 80) mouthwashPct = 0.20;
    const tamNuocPct = 0.10;
    const kemPct = 0.10;
    const dentalPct = 0.03; // tạm thời Gói 1 = 3% nếu chưa phân loại gói
    hhSanPhamNvkd = Math.round(mouthwashAmount * mouthwashPct + tamNuocAmount * tamNuocPct + kemAmount * kemPct + dentalCareAmount * dentalPct);
  }
  const doanhSoHoaHongTinhLai = Math.round(
    doanhSoTinhHH *
      (pctHoaHongDuocTinh / 100) *
      (pctHoaHongCaNhan / 100) *
        (clinicPct / 100)
    );

  const tooltips = {
    khoan: `KHOÁN = ${new Intl.NumberFormat('vi-VN').format(khoan)} (config trong Commission Settings)`,
    allocationAmount: 'Thực thu = user.allocationAmount',
    allocationAmount25VNP: 'Thực thu 25VNP = sum(user.allocationAmount) của 25VNP',
    allocationAmount355LTT: 'Thực thu 355LTT = sum(user.allocationAmount) của 355LTT',
    pctHoaHongDuocTinh: 'Công thức: nếu Thực thu < 230.000.000 => 1.8% ; ngược lại 2.3%',
    pctHoaHongPhongKham: '%HH PHÒNG KHÁM (config trong User Admin)',
    amountCalcCommission: 'Doanh số tính HH = user.amountCalcCommission',
    pctDatKhoan: 'Công thức: % ĐẠT KHOÁN = (Tổng Thực thu) / KHOÁN',
    pctHoaHongCaNhan:
      'Công thức (theo Excel):\n<70%=>70%; [70,80)=>80%; [80,90)=>90%; [90,100)=>100%; [100,110)=>110%; else 120%',
    totalCommission: isDoctor
      ? 'Doanh số hoa hồng = user.amountCalcCommission'
      : 'Doanh số hoa hồng = Doanh số tính HH * %HH ĐƯỢC TÍNH * %HH CÁ NHÂN * %HH PHÒNG KHÁM'
  };

  keys.forEach((k) => {
    // Doctor rule:
    // - BS chỉ quan tâm: Doanh số tính HH, Tổng tiền, Doanh số hoa hồng (và Tên + Nhóm để nhận diện)
    // - Các cột còn lại hiển thị "-"
    if (isDoctor && !doctorAllowed.has(k)) {
      cells.push({ text: '-', title: tooltips[k] || '' });
      return;
    }

    // TLBS detailed columns: fill what we can; leave others blank for review
    if (k === 'tlbsTongKhoanCaNhan') {
      cells.push({ text: khoan > 0 ? new Intl.NumberFormat('vi-VN').format(khoan) : '', title: 'TỔNG KHOÁN CÁ NHÂN (từ config)' });
      return;
    }
    if (k === 'tlbsDoanhThuCaNhanHN') {
      const v = thucThu25;
      cells.push({ text: v > 0 ? new Intl.NumberFormat('vi-VN').format(v) : '', title: 'DOANH THU CÁ NHÂN TẠI CƠ SỞ HN (25VNP)' });
      return;
    }
    if (k === 'tlbsDoanhThuCaNhanHCM') {
      const v = thucThu355;
      cells.push({ text: v > 0 ? new Intl.NumberFormat('vi-VN').format(v) : '', title: 'DOANH THU CÁ NHÂN TẠI CƠ SỞ HCM (355LTT)' });
      return;
    }
    if (k === 'tlbsPctDatKhoanCaNhan') {
      const pct = (khoan > 0) ? calculateTargetAchievementPercent(thucThu25 + thucThu355, khoan) : 0;
      cells.push({
        text: (khoan > 0) ? `${Math.round(pct)}%` : '-',
        title: (khoan > 0)
          ? '% ĐẠT KHOÁN CÁ NHÂN = (E+F)/D'
          : 'Thiếu D (TỔNG KHOÁN CÁ NHÂN) để tính'
      });
      return;
    }
    if (k === 'tlbsPctDatKhoanTeam') {
      const pct = (khoan > 0) ? calculateTargetAchievementPercent(thucThu25 + thucThu355, khoan) : 0;
      cells.push({
        text: (khoan > 0) ? `${Math.round(pct)}%` : '-',
        title: (khoan > 0) ? '% ĐẠT KHOÁN TEAM = SUM(E:F)/D' : 'Thiếu D (TỔNG KHOÁN CÁ NHÂN) để tính'
      });
      return;
    }
    if (k === 'tlbsKhoanNguonMktAg') {
      const n = normalizeNamePrefix(userObj?.employeeName);
      const row = state.commissionConfig?.khoanOverridesV2?.[n] || {};
      const mktAg = parseNumber(row?.khoanMktAg);
      const legacy = parseNumber(row?.khoanMkt) + parseNumber(row?.khoanAg);
      const v = (Number.isFinite(mktAg) && mktAg > 0) ? mktAg : legacy;
      cells.push({
        text: v > 0 ? new Intl.NumberFormat('vi-VN').format(v) : '-',
        title: v > 0 ? 'Nguồn: Commission Settings (khoanMktAg hoặc legacy MKT+AG)' : 'Thiếu khoán nguồn MKT/AG trong Commission Settings'
      });
      return;
    }
    if (k === 'tlbsDoanhThuNguonUpsale') {
      cells.push({ text: '-', title: 'Thiếu field DOANH THU NGUỒN UPSALE (AJ) từ API hiện tại' });
      return;
    }
    if (k === 'tlbsDoanhThuNguonSeeding') {
      cells.push({ text: '-', title: 'Thiếu field DOANH THU NGUỒN SEEDING (AK) từ API hiện tại' });
      return;
    }
    if (k === 'tlbsDoanhThuNguonMktAgency') {
      // J = E+F - AJ - AK (AJ/AK not available yet)
      cells.push({
        text: '-',
        title: 'Công thức: DOANH THU NGUỒN MKT, AGENCY = E+F-AJ-AK. Thiếu AJ/AK nên chưa tính được.'
      });
      return;
    }
    if (k === 'tlbsPctDatKhoanDthuNguonMkt') {
      cells.push({
        text: '-',
        title: 'Công thức: IF(I=0;0;J/I). Thiếu J (DOANH THU NGUỒN MKT, AGENCY) hoặc I (KHOÁN NGUỒN MKT/AG) nên chưa tính.'
      });
      return;
    }
    if (k === 'tlbsPctHoaHongNguonMkt') {
      cells.push({
        text: '-',
        title: 'Công thức: if(K<50%;0.1%;K<70%;0.8%;K<90%;1.2%;else 1.5%). Thiếu K (%ĐẠT KHOÁN DTHU NGUỒN MKT) nên chưa tính.'
      });
      return;
    }
    if (k === 'tlbsDsoTinhHhNguonMkt') {
      cells.push({
        text: '-',
        title: "Công thức SUMIFS theo sheet 'T12.25. HN'... Hiện API chưa cung cấp dữ liệu dòng sản phẩm/sheet nên chưa tính."
      });
      return;
    }
    if (k === 'tlbsUpsaleTele') {
      cells.push({
        text: '-',
        title: "Công thức SUMIFS theo sheet 'T12.25. HN' (AF = TELE...). Hiện API chưa có sheet nên chưa tính."
      });
      return;
    }
    if (k === 'tlbsPctHoaHongSdTele') {
      cells.push({ text: '-', title: 'Theo Excel: % HOA HỒNG SD - TELE = -' });
      return;
    }
    if (k === 'tlbsPctHoaHongKemDanhRang') {
      // Fill doanh thu sản phẩm từ productSalesV1 (nếu có)
      const n = normalizeNamePrefix(userObj?.employeeName);
      const node = state.commissionConfig?.productSalesByUser?.[n] || {};
      const sales = node?.products || (state.commissionConfig?.productSalesV1?.totalsByUser?.[n]?.products || {});
      const counts = node?.counts || {};
      const amount = parseNumber(sales['KEM ĐÁNH RĂNG CHLORHEXI 0.12%']);
      const qty = Number(counts['KEM ĐÁNH RĂNG CHLORHEXI 0.12%'] || 0);
      cells.push({
        text: amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(amount)} (${qty || 0})` : '-',
        title: 'Doanh thu + số lượng dòng: KEM ĐÁNH RĂNG CHLORHEXI 0.12% (GSheet)'
      });
      return;
    }
    if (k === 'tlbsPctHoaHongMayTamNuoc') {
      const n = normalizeNamePrefix(userObj?.employeeName);
      const node = state.commissionConfig?.productSalesByUser?.[n] || {};
      const sales = node?.products || (state.commissionConfig?.productSalesV1?.totalsByUser?.[n]?.products || {});
      const counts = node?.counts || {};
      const amount = parseNumber(sales['MÁY TĂM NƯỚC PROCARE KHD13']);
      cells.push({
        text: amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(amount)} (${Number(counts['MÁY TĂM NƯỚC PROCARE KHD13'] || 0)})` : '-',
        title: 'Doanh thu + số lượng dòng: MÁY TĂM NƯỚC PROCARE KHD13 (GSheet)'
      });
      return;
    }
    if (k === 'tlbsPctHoaHongNuocSucMieng') {
      const n = normalizeNamePrefix(userObj?.employeeName);
      const node = state.commissionConfig?.productSalesByUser?.[n] || {};
      const sales = node?.products || (state.commissionConfig?.productSalesV1?.totalsByUser?.[n]?.products || {});
      const counts = node?.counts || {};
      const amount = parseNumber(sales['NƯỚC SÚC MIỆNG SINGAE']) + parseNumber(sales['NƯỚC SÚC MIỆNG']);
      const qty = Number(counts['NƯỚC SÚC MIỆNG SINGAE'] || 0) + Number(counts['NƯỚC SÚC MIỆNG'] || 0);
      cells.push({
        text: amount > 0 ? `${new Intl.NumberFormat('vi-VN').format(amount)} (${qty || 0})` : '-',
        title: 'Doanh thu + số lượng dòng: NƯỚC SÚC MIỆNG (GSheet)'
      });
      return;
    }
    if (k === 'tlbsPctHoaHongGoiBac') {
      cells.push({ text: '7%', title: 'Theo Excel: % HOA HỒNG GÓI BẠC = 7% (doanh thu hiện chưa có)' });
      return;
    }
    if (k === 'tlbsHhKdcTroLyBs') {
      cells.push({ text: new Intl.NumberFormat('vi-VN').format(554000), title: 'Theo Excel: HH KĐC (TRỢ LÝ BÁC SĨ) = 554.000' });
      return;
    }
    if (k === 'tlbsThuongKhacHhSeedingCu') {
      cells.push({ text: '-', title: 'Theo Excel: 231.000 + PHỤ TÁ - HN!M84/2 + R37/2 (thiếu sheet/field)' });
      return;
    }
    if (k === 'tlbsPctHhHoanThanhKhoanTeamXCaNhan') {
      // Based on H (% đạt khoán team). Use your rule buckets.
      const h = (khoan > 0) ? calculateTargetAchievementPercent(thucThu25 + thucThu355, khoan) : 0;
      let out = '-';
      if (khoan > 0) {
        if (h < 70) out = '80%';
        else if (h > 70 && h < 85) out = '90%';
        else if (h > 85 && h < 100) out = '100%';
        else out = '105%';
      }
      cells.push({ text: out, title: 'Theo Excel: if(H<70%;80%; if(70%<H<85%;90%; if(85%<H<100%;100%;105%)))' });
      return;
    }
    if (k === 'tlbsHhDoanhSoThucNhan') {
      cells.push({ text: '-', title: 'Theo Excel: (L*M + N*O + P*T) * AB (thiếu doanh thu nguồn + % tương ứng)' });
      return;
    }
    if (k === 'tlbsHhSanPham') {
      cells.push({ text: '-', title: 'Theo Excel: R*S + T*U + V*W + X*Y (thiếu doanh thu sản phẩm + %)' });
      return;
    }
    if (k === 'tlbsTongHhThucNhan') {
      cells.push({ text: '-', title: 'Theo Excel: SUM(Z:AA;AC:AD) (thiếu các HH thành phần)' });
      return;
    }
    if (k === 'tlbsKhop') {
      cells.push({ text: '-', title: 'Cột kiểm tra khớp: cần mapping theo file Excel (chưa có)' });
      return;
    }
    if (k.startsWith('tlbs')) {
      // Unknown/not available in current API response
      cells.push({ text: '-', title: 'Chưa có field từ API hiện tại' });
      return;
    }

    if (k === 'khoan') {
      cells.push({ text: formatSchemaCellValue(k, khoan), title: tooltips.khoan });
      return;
    }
    if (k === 'hhSanPhamNvkd') {
      const title = 'HH SẢN PHẨM:\n- Nước súc miệng: 01–40 chai 15%, 41–80 chai 17%, ≥81 chai 20% (ước lượng 120k/chai)\n- Tăm nước: 10%\n- Kem đánh răng: 10%\n- Family Dental Care: 3%';
      cells.push({ text: isNvkd && hhSanPhamNvkd > 0 ? new Intl.NumberFormat('vi-VN').format(hhSanPhamNvkd) : (isNvkd ? '-' : ''), title });
      return;
    }
    if (k === 'pctHoaHongDuocTinh') {
      cells.push({ text: isDoctor ? '-' : formatSchemaCellValue(k, thucThu), title: tooltips.pctHoaHongDuocTinh });
      return;
    }
    if (k === 'pctHoaHongPhongKham') {
      cells.push({ text: isDoctor ? '-' : formatSchemaCellValue(k, clinicPct), title: tooltips.pctHoaHongPhongKham });
      return;
    }
    if (k === 'pctDatKhoan') {
      cells.push({ text: isDoctor ? '-' : formatSchemaCellValue(k, pctDatKhoan), title: tooltips.pctDatKhoan });
      return;
    }
    if (k === 'pctHoaHongCaNhan') {
      cells.push({ text: isDoctor ? '-' : formatSchemaCellValue(k, pctHoaHongCaNhan), title: tooltips.pctHoaHongCaNhan });
      return;
    }
    if (k === 'totalCommission') {
      const value = isDoctor ? parseNumber(userObj?.totalCommission) : doanhSoHoaHongTinhLai;
      const text = value > 0 ? new Intl.NumberFormat('vi-VN').format(value) : '';
      cells.push({ text: isDoctor ? (text || '-') : (text || ''), title: tooltips.totalCommission });
      return;
    }

    const text = formatSchemaCellValue(k, userObj?.[k]);
    cells.push({ text, title: tooltips[k] || '' });
  });

  cells.forEach((cell, i) => {
    const td = document.createElement('td');
    const text = typeof cell === 'object' && cell !== null ? cell.text : cell;
    const title = typeof cell === 'object' && cell !== null ? cell.title : '';
    td.textContent = text === null || text === undefined ? '' : String(text);
    if (title) td.title = title;
    // styling highlights
    const colKey = i === 0 ? 'stt' : keys[i - 1];
    if (colKey === 'employeeName') td.classList.add('assistant-cell', 'name-col');
    if (colKey === 'allocationAmount') td.classList.add('revenue-cell');
    if (colKey === 'totalCommission') td.classList.add('commission-cell');
    // Center align: "-", "{}%", any "%", "0", and STT
    const raw = String(td.textContent || '').trim();
    if (
      colKey === 'stt' ||
      raw === '-' ||
      raw === '0' ||
      raw === '{}%' ||
      raw.endsWith('%')
    ) {
      td.classList.add('cell-center');
    }
    // Additional rule: if text is exactly "Bác sĩ" or "Phụ tá" => center (only these texts)
    if (raw === 'Bác sĩ' || raw === 'Phụ tá') td.classList.add('cell-center');
    tr.appendChild(td);
  });

  elTableBody.appendChild(tr);
}

async function loadCommissionConfig() {
  try {
    const res = await fetch('/api/admin/commission-settings', { method: 'GET', cache: 'no-store' });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) return;
    const khoan = parseNumber(payload?.settings?.khoan);
    const clinicPct = parseNumber(payload?.settings?.clinicPct);
    if (khoan > 0) state.commissionConfig.khoan = khoan;
    if (clinicPct > 0) state.commissionConfig.clinicPct = clinicPct;

    const khoanOverridesV2 = payload?.settings?.khoanOverridesV2 && typeof payload.settings.khoanOverridesV2 === 'object'
      ? payload.settings.khoanOverridesV2
      : {};
    const normalizedV2 = {};
    Object.keys(khoanOverridesV2).forEach((k) => {
      const nk = normalizeNamePrefix(k);
      const row = khoanOverridesV2[k];
      if (!nk || !row || typeof row !== 'object' || Array.isArray(row)) return;
      const out = {};
      ['khoan', 'khoanMktAg', 'khoanUpsale', 'khoanSeeding', 'khoanMkt', 'khoanAg'].forEach((f) => {
        if (row[f] === undefined) return;
        const v = parseNumber(row[f]);
        if (Number.isFinite(v) && v >= 0) out[f] = v;
      });
      normalizedV2[nk] = out;
    });
    state.commissionConfig.khoanOverridesV2 = normalizedV2;

    // Product sales (from settings)
    const productSalesV1 = payload?.settings?.productSalesV1 && typeof payload.settings.productSalesV1 === 'object'
      ? payload.settings.productSalesV1
      : {};
    state.commissionConfig.productSalesV1 = productSalesV1;
    // Fast lookup
    state.commissionConfig.productSalesByUser = productSalesV1?.byUser || productSalesV1?.totalsByUser || {};

    const employeeTypes = payload?.settings?.employeeTypes && typeof payload.settings.employeeTypes === 'object'
      ? payload.settings.employeeTypes
      : {};
    const normalizedTypes = {};
    Object.keys(employeeTypes).forEach((k) => {
      const nk = normalizeNamePrefix(k);
      const v = String(employeeTypes[k] || '').trim();
      if (nk && v) normalizedTypes[nk] = v;
    });
    state.commissionConfig.employeeTypes = normalizedTypes;

    const groupDefs = Array.isArray(payload?.settings?.groupDefs) ? payload.settings.groupDefs : [];
    state.commissionConfig.groupDefs = groupDefs;
  } catch (_) {}
}

function normalizeFacilityName(name) {
  const raw = String(name || '').trim();
  return raw || 'Tất cả';
}

function getFacilityNameFromItem(item) {
  const candidates = [
    item?.facilityName,
    item?.facility,
    item?.branchName,
    item?.branch,
    item?.clinicName,
    item?.clinic,
    item?.companyName,
    item?.company,
    item?.locationName,
    item?.location,
    item?.baseName,
    item?.base
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = String(candidates[i] || '').trim();
    if (v) return v;
  }
  return 'Tất cả';
}

function groupCommissionByCategory(commissionData) {
  const defs = Array.isArray(state.commissionConfig?.groupDefs) && state.commissionConfig.groupDefs.length
    ? state.commissionConfig.groupDefs
    : ['BÁC SĨ', 'TLBS', 'NV KINH DOANH', 'KT KHÁCH CŨ', 'Lễ tân/CSKH'];
  const grouped = {};
  defs.forEach((k) => { grouped[k] = []; });
  (Array.isArray(commissionData) ? commissionData : []).forEach((item) => {
    const u = item && typeof item === 'object' ? (item.user || null) : null;
    if (!u || typeof u !== 'object') return;
    const cat = getCategoryForUser(u);
    grouped[cat] = grouped[cat] || [];
    grouped[cat].push(item);
  });
  return grouped;
}

function renderCategoryTabs() {
  if (!facilityTabsEl) return;
  // Only show tabs that actually have users (avoid empty tabs on first load).
  const order = Array.isArray(state.categoryOrder) ? state.categoryOrder : [];
  const facilities = order.filter((name) => Array.isArray(state.commissionByCategory?.[name]) && state.commissionByCategory[name].length > 0);
  facilityTabsEl.innerHTML = '';
  if (!facilities.length) return;

  facilities.forEach((name) => {
    const count = Array.isArray(state.commissionByCategory?.[name]) ? state.commissionByCategory[name].length : 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `facility-tab ${name === state.activeCategory ? 'is-active' : ''}`;
    btn.textContent = `${name} (${count})`;
    btn.dataset.facility = name;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', name === state.activeCategory ? 'true' : 'false');
    facilityTabsEl.appendChild(btn);
  });
}

function setActiveCategory(name) {
  const cat = String(name || '').trim();
  if (!state.commissionByCategory || !state.commissionByCategory[cat]) return;
  state.activeCategory = cat;
  renderCategoryTabs();
  clearTableBody();
  fillCommissionToTable(state.commissionByCategory[cat], { category: cat });
}

function aggregateUsersAcrossFacilities(list, { splitAllocation } = {}) {
  const map = new Map(); // normalizedName -> aggUser
  (Array.isArray(list) ? list : []).forEach((item) => {
    const u = item && typeof item === 'object' ? (item.user || null) : null;
    if (!u || typeof u !== 'object') return;
    const name = String(u.employeeName || '').trim();
    if (!name) return;
    const key = normalizeNamePrefix(name);
    const facility = String(item.facilityName || item.facility || getFacilityNameFromItem(item) || '').trim();
    const existing = map.get(key);
    const base = existing || {
      ...u,
      allocationAmount25VNP: 0,
      allocationAmount355LTT: 0,
      allocationAmount: 0,
      amountCalcCommission: 0,
      totalAmount: 0,
      totalCommission: 0
    };
    const alloc = parseNumber(u.allocationAmount);
    if (splitAllocation) {
      if (facility === '25VNP') base.allocationAmount25VNP = parseNumber(base.allocationAmount25VNP) + alloc;
      if (facility === '355LTT') base.allocationAmount355LTT = parseNumber(base.allocationAmount355LTT) + alloc;
    }
    base.allocationAmount = parseNumber(base.allocationAmount) + alloc;
    base.amountCalcCommission = parseNumber(base.amountCalcCommission) + parseNumber(u.amountCalcCommission);
    base.totalAmount = parseNumber(base.totalAmount) + parseNumber(u.totalAmount);
    base.totalCommission = parseNumber(base.totalCommission) + parseNumber(u.totalCommission);
    map.set(key, base);
  });
  return Array.from(map.values());
}

function fillCommissionToTable(commissionData, { category } = {}) {
  // Requirement: lấy tất cả theo user (hiển thị full user object), không theo roleSummaries.
  const list = Array.isArray(commissionData) ? commissionData : [];
  const cat = String(category || state.activeCategory || '').trim();
  const isTlbs = cat === 'TLBS';
  const users = aggregateUsersAcrossFacilities(list, { splitAllocation: isTlbs });

  // Fixed columns (remove extra columns)
  createSchemaTable(buildCommissionSchemaHeaders(cat), { category: cat });
  clearTableBody();

  const sorted = [...users].sort((a, b) => {
    const ra = getUserSortRankByPrefix(a?.employeeName);
    const rb = getUserSortRankByPrefix(b?.employeeName);
    if (ra !== rb) return ra - rb;
    return String(a?.employeeName || '').localeCompare(String(b?.employeeName || ''), 'vi');
  });

  sorted.forEach((u) => addNewSchemaRow(u));
}

async function loadTemplate() {
  showLoading(true);
  try {
    // Auto-sync product sales from GSheet on app open (non-blocking if it fails)
    try {
      await fetch('/api/admin/commission-settings/product-sales-sync-from-gsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({})
      }).catch(() => {});
    } catch (_) {}
    await loadCommissionConfig();
    // No template dependency; schema-driven table based on API user keys.
    document.title = 'Tính Hoa Hồng';
    const elHiddenTitle = document.getElementById('title');
    if (elHiddenTitle) elHiddenTitle.textContent = 'Tính Hoa Hồng';

    createSchemaTable(buildCommissionSchemaHeaders());
    document.getElementById('tableDisplay').style.display = 'block';
    logStatus('ok', 'Bảng đã sẵn sàng.');
    // Auto-load cache with priority:
    // 1) last-month cache (if exists)
    // 2) current-month cache (fallback)
    const tryLast = await fetchCommission({ useCache: true, setDateSelectValue: 'last-month' });
    if (!tryLast) {
      await fetchCommission({ useCache: true, setDateSelectValue: 'current-month' });
    }
  } catch (error) {
    logStatus('error', error.message || 'Không thể khởi tạo bảng');
  } finally {
    showLoading(false);
  }
}

function getDateRange() {
  const now = new Date();
  if (!dateRangeSelect) {
    const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];
    return { fromDate, toDate };
  }

  if (dateRangeSelect.value === 'last-month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fromDate = lastMonth.toISOString().split('T')[0];

    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const toDate = lastDayOfLastMonth.toISOString().split('T')[0];

    return { fromDate, toDate };
  }

  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromDate = firstDayOfCurrentMonth.toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];
  return { fromDate, toDate };
}

function getLastMonthDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    fromDate: from.toISOString().split('T')[0],
    toDate: to.toISOString().split('T')[0]
  };
}

async function fetchCommission({ useCache, fromDate, toDate, setDateSelectValue } = {}) {
  if (state.fetchCommissionInFlight) return false;
  const freshBtn = document.getElementById('fetchCommissionFreshBtn');
  if (freshBtn) freshBtn.disabled = true;
  const oldFreshText = freshBtn ? freshBtn.textContent : '';
  if (freshBtn) freshBtn.textContent = '⏳ Đang lấy...';

  try {
    state.fetchCommissionInFlight = true;
    const shouldUseCache = Boolean(useCache);
    // Auto-load cache silently; only show "update" toast when user clicks Update.
    if (!shouldUseCache) {
      logStatus('info', 'Đang lấy dữ liệu mới nhất...');
      // Auto-sync product sales from GSheet (if URL is configured on server)
      try {
        await fetch('/api/admin/commission-settings/product-sales-sync-from-gsheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({})
        }).catch(() => {});
      } catch (_) {}
    }
    const range = (fromDate && toDate) ? { fromDate, toDate } : getDateRange();
    if (dateRangeSelect && setDateSelectValue) dateRangeSelect.value = String(setDateSelectValue);
    const res = await fetch('/api/commission/get-commission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(
        { fromDate: range.fromDate, toDate: range.toDate, useCache: shouldUseCache }
      )
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.success) {
      throw new Error(payload?.error || payload?.message || 'Lỗi lấy dữ liệu hoa hồng');
    }

    const commissionData = Array.isArray(payload.data) ? payload.data : [];
    if (shouldUseCache && (!payload.cacheHit || !commissionData.length)) {
      logStatus('info', 'Chưa có cache. Hãy bấm "Update mới nhất" để lấy dữ liệu.');
      // Still render empty state (tabs may still show)
    }
    const grouped = groupCommissionByCategory(commissionData);
    state.commissionByCategory = grouped;
    // No auto warning: khoán config is managed in Commission Settings only.
    // Only show tabs that have users.
    renderCategoryTabs();
    if (!state.activeCategory || !Array.isArray(state.commissionByCategory?.[state.activeCategory]) || state.commissionByCategory[state.activeCategory].length === 0) {
      // pick first available category
      const order = Array.isArray(state.categoryOrder) ? state.categoryOrder : [];
      const first = order.find((n) => Array.isArray(state.commissionByCategory?.[n]) && state.commissionByCategory[n].length > 0);
      if (first) state.activeCategory = first;
    }
    clearTableBody();
    fillCommissionToTable(state.commissionByCategory[state.activeCategory] || [], { category: state.activeCategory });
    if (!shouldUseCache) {
      logStatus('ok', 'Đã update mới nhất và fill thành công!');
    }
    return Boolean(payload.cacheHit && commissionData.length);
  } catch (error) {
    logStatus('error', error.message || 'Lỗi lấy doanh số hoa hồng');
    return false;
  } finally {
    state.fetchCommissionInFlight = false;
    if (freshBtn) {
      freshBtn.disabled = false;
      freshBtn.textContent = oldFreshText;
    }
  }
}

// autoLoadCachePreferLastMonth removed: now we auto-load any cache regardless of month/range.

async function exportExcel() {
  const btn = document.getElementById('exportBtn');
  if (btn) btn.disabled = true;
  const oldText = btn ? btn.textContent : '';
  if (btn) btn.textContent = '⏳ Đang export...';

  try {
    logStatus('info', 'Đang export Excel...');
    const rows = Array.from(elTableBody?.querySelectorAll('tr') || []);
    const data = rows.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => String(td.textContent || '').trim())
    );

    if (!state.templateHeaders.length) {
      throw new Error('Chưa tải template.');
    }

    const today = new Date().toISOString().split('T')[0];
    const response = await fetch('/api/commission/create-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        headers: state.templateHeaders,
        fileName: `BaoCao_${today}`,
        revenueColumnIndex: THUC_THU_COLUMN_INDEX,
        commissionColumnIndex: PHAN_TRAM_HOA_HONG_INDEX
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || payload?.message || 'Lỗi export Excel');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BaoCao_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    logStatus('ok', 'Đã export Excel thành công!');
  } catch (error) {
    logStatus('error', error.message || 'Lỗi export Excel');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

// Fallback: event delegation ensures click works even if the button constant is null due to load timing.
document.addEventListener('click', (e) => {
  const freshTarget = e.target && e.target.closest ? e.target.closest('#fetchCommissionFreshBtn') : null;
  if (freshTarget) fetchCommission({ useCache: false });
  const facilityTab = e.target && e.target.closest ? e.target.closest('.facility-tab') : null;
  if (facilityTab && facilityTab.dataset && facilityTab.dataset.facility) {
    setActiveCategory(facilityTab.dataset.facility);
  }
  const exportTarget = e.target && e.target.closest ? e.target.closest('#exportBtn') : null;
  if (exportTarget) exportExcel();
});

// Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTemplate);
} else {
  loadTemplate();
}

