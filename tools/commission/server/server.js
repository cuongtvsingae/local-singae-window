const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const router = express.Router();

// --- External API throttling & caching (prevents request storms) ---
const SIMLY_COMMISSION_URL = 'https://api.simlydent.vn/api/v1/treatment/commission';
/** User-admin public Simly tokens (same shape as handlePublicTokens in simlyTokenAdmin.js). */
const LISTEN_PORT = Number.parseInt(String(process.env.PORT || '3000'), 10) || 3000;
const SIMLY_PUBLIC_TOKENS_URL =
  String(process.env.SIMLY_PUBLIC_TOKENS_URL || process.env.USER_ADMIN_PUBLIC_TOKENS_URL || process.env.SIMLY_PUBLIC_BASE_URL || '').trim() ||
  'https://singae.cloud/api/public/tokens';
const SIMLY_PUBLIC_TOKENS_URL_RESOLVED = SIMLY_PUBLIC_TOKENS_URL.includes('/api/public/tokens')
  ? SIMLY_PUBLIC_TOKENS_URL
  : `${SIMLY_PUBLIC_TOKENS_URL.replace(/\/$/, '')}/api/public/tokens`;
const TOKEN_FETCH_TIMEOUT_MS = Number.parseInt(String(process.env.SIMLY_TOKEN_FETCH_TIMEOUT_MS || '20000'), 10) || 20000;

function normalizeOfficeKey(value) {
  return String(value || '').trim().toUpperCase();
}

/** Danh sách office Simly (khớp user-admin API_KEYS / commission). Có thể set COMMISSION_SIMLY_OFFICES=25VNP,355LTT */
const FACILITY_KEYS = (() => {
  const raw = String(process.env.COMMISSION_SIMLY_OFFICES || process.env.COMMISSION_OFFICE_KEYS || '25VNP,355LTT')
    .split(',')
    .map((s) => normalizeOfficeKey(s))
    .filter(Boolean);
  return raw.length ? raw : ['25VNP', '355LTT'];
})();
const TOKEN_TTL_MS = 1000 * 60 * 4; // 4 minutes (token source may rotate)
// Cache per (facility, fromDate,toDate). Long enough so "load cache" actually works across refreshes.
// Fresh data is only fetched when user clicks "Update mới nhất" (useCache=false).
const COMMISSION_TTL_MS = 1000 * 60 * 60 * 24; // 1 day

let tokenMapCache = { map: null, expiresAt: 0 };
let tokenMapInFlightPromise = null;
const commissionCache = new Map(); // key -> { data, expiresAt }
const commissionInFlight = new Map(); // key -> Promise
const lastCommissionCacheKeyByFacility = new Map(); // facilityKey -> cacheKey

function nowMs() {
  return Date.now();
}

function isValidIsoDate(value) {
  // accept yyyy-mm-dd only
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function tokenMapLooksUsable(map) {
  if (!map || typeof map !== 'object') return false;
  return FACILITY_KEYS.every((k) => typeof map[k] === 'string' && map[k].length > 0);
}

/** Lấy block office từ simly.offices (key không phân biệt hoa thường). */
function getOfficeBlock(offices, officeKey) {
  if (!offices || typeof offices !== 'object') return null;
  const want = normalizeOfficeKey(officeKey);
  for (const [key, val] of Object.entries(offices)) {
    if (normalizeOfficeKey(key) === want) return val;
  }
  return null;
}

/**
 * Format user-admin GET /api/public/tokens:
 * - Mới (ưu tiên): data.simly.offices[office].token
 * - Cũ / bổ sung: data.simly.token[office] (bỏ qua lastTimeRefresh và field không phải bearer)
 */
function buildTokenMapFromPublicTokensPayload(data) {
  const simly = data?.simly;
  if (!simly || typeof simly !== 'object') return null;
  const offices = simly.offices;
  const legacyFlat = simly.token;
  const map = {};
  for (const k of FACILITY_KEYS) {
    let t = null;
    const block = getOfficeBlock(offices, k);
    if (block && typeof block === 'object' && typeof block.token === 'string' && block.token.length > 0) {
      t = block.token;
    }
    if (
      !t &&
      legacyFlat &&
      typeof legacyFlat === 'object' &&
      typeof legacyFlat[k] === 'string' &&
      legacyFlat[k].length > 0
    ) {
      t = legacyFlat[k];
    }
    if (t) map[k] = t;
  }
  return Object.keys(map).length ? map : null;
}

async function getSimlyTokenMap() {
  if (tokenMapCache.map && tokenMapCache.expiresAt > nowMs()) return tokenMapCache.map;
  if (tokenMapInFlightPromise) return await tokenMapInFlightPromise;

  tokenMapInFlightPromise = (async () => {
    const url = SIMLY_PUBLIC_TOKENS_URL_RESOLVED;
    let r;
    try {
      r = await axios.get(url, { timeout: TOKEN_FETCH_TIMEOUT_MS, validateStatus: () => true });
    } catch (e) {
      throw new Error(`Không lấy được token Simly (${url} → ${e?.message || String(e)})`);
    }
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`Không lấy được token Simly (${url} → HTTP ${r.status})`);
    }
    const map = buildTokenMapFromPublicTokensPayload(r.data);
    if (!tokenMapLooksUsable(map)) {
      throw new Error(
        `Token Simly từ user-admin không đủ chi nhánh (${url}). Kiểm tra SIMLY_API_KEY_* và trạng thái refresh token.`
      );
    }
    tokenMapCache = { map, expiresAt: nowMs() + TOKEN_TTL_MS };
    return map;
  })();

  try {
    return await tokenMapInFlightPromise;
  } finally {
    tokenMapInFlightPromise = null;
  }
}

async function getSimlyTokenByFacility(facilityKey) {
  const key = normalizeOfficeKey(facilityKey);
  const map = await getSimlyTokenMap();
  const token = map?.[key];
  if (!token) {
    throw new Error(`Token ${key} không tìm thấy trong response`);
  }
  return token;
}

async function getCommissionData({ facilityKey, fromDate, toDate, useCache }) {
  const cacheKey = `${facilityKey}|${fromDate}|${toDate}`;
  const cached = commissionCache.get(cacheKey);
  if (Boolean(useCache) && cached && cached.expiresAt > nowMs()) return cached.data;

  if (commissionInFlight.has(cacheKey)) {
    return await commissionInFlight.get(cacheKey);
  }

  const p = (async () => {
    const token = await getSimlyTokenByFacility(facilityKey);
    const r = await axios.get(SIMLY_COMMISSION_URL, {
      params: { fromDate, toDate },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 45000,
      validateStatus: () => true
    });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`Commission API HTTP ${r.status}`);
    }
    if (!r?.data?.ok) {
      const msg = r?.data?.message || r?.data?.error || 'API trả về lỗi';
      const err = new Error(String(msg));
      err.details = r?.data;
      throw err;
    }
    const data = r.data.data || [];
    // Always refresh cache on successful upstream call so "Lấy theo cache" can reuse it.
    commissionCache.set(cacheKey, { data, expiresAt: nowMs() + COMMISSION_TTL_MS });
    lastCommissionCacheKeyByFacility.set(String(facilityKey || '').trim(), cacheKey);
    return data;
  })();

  commissionInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    commissionInFlight.delete(cacheKey);
  }
}

function clearCommissionCache({ facilityKey, fromDate, toDate }) {
  const cacheKey = `${facilityKey}|${fromDate}|${toDate}`;
  commissionCache.delete(cacheKey);
  commissionInFlight.delete(cacheKey);
}

// Local server-side folders (scoped to this module)
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const TEMPLATE_PATH = path.join(__dirname, 'default data', 'PT355.xlsx');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  // Handle "1,234,567", "1234.56%", "1.234.567đ" (keep digits, dot, minus)
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function calculateCommissionPercent(revenue) {
  return revenue < 400000000 ? 1.8 : 2.3;
}

function getColumnLetter(colIndex) {
  // 0-based colIndex -> Excel column letters (A, B, ..., Z, AA, AB, ...)
  let result = '';
  let n = colIndex + 1;
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

ensureDir(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      ensureDir(UPLOAD_DIR);
      cb(null, UPLOAD_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = String(path.extname(file.originalname || '') || '').toLowerCase();
    if (
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel' ||
      ext === '.xlsx' ||
      ext === '.xls'
    ) {
      cb(null, true);
      return;
    }
    cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'));
  }
});

// POST /api/upload
// Upload file Excel và tính tổng thực thu + commission theo phụ tá.
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn file để upload' });
    }

    if (!fs.existsSync(TEMPLATE_PATH)) {
      // Not fatal for upload, but helps debug.
      console.warn(`[commission] Missing template: ${TEMPLATE_PATH}`);
    }

    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const headers = data[0] || [];

    // Xử lý dữ liệu: Cột J (index 9) = Phụ tá, Cột L (index 11) = Thực thu
    const results = {};
    const details = {};

    const startRow = 1; // skip header row
    for (let i = startRow; i < data.length; i++) {
      const row = data[i] || [];
      const assistant = row[9] ? String(row[9]).trim() : '';
      const revenue = parseNumber(row[11]);

      if (!assistant || revenue <= 0) continue;

      const commissionPercent = calculateCommissionPercent(revenue);

      if (!results[assistant]) {
        results[assistant] = 0;
        details[assistant] = [];
      }

      results[assistant] += revenue;

      const orderDetail = {
        row: i + 1,
        revenue,
        commissionPercent,
        columns: {},
        rowData: row
      };

      headers.forEach((header, colIndex) => {
        const columnLetter = getColumnLetter(colIndex);
        orderDetail.columns[columnLetter] = {
          header: header || `Cột ${columnLetter}`,
          value: row[colIndex] !== undefined ? row[colIndex] : '',
          index: colIndex
        };
      });

      details[assistant].push(orderDetail);
    }

    // Xóa file sau khi xử lý
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}

    const summary = Object.keys(results).map((assistant) => ({
      assistant,
      totalRevenue: results[assistant],
      orderCount: details[assistant].length,
      orders: details[assistant]
    }));

    summary.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return res.json({
      success: true,
      data: summary,
      headers,
      message: `Đã xử lý thành công ${summary.length} phụ tá`
    });
  } catch (error) {
    console.error('[commission] upload error:', error);
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (_) {}
    return res.status(500).json({ error: 'Lỗi xử lý file Excel', message: error.message });
  }
});

// GET /api/template
// Trả về metadata + headers từ template PT355.xlsx
router.get('/template', (req, res) => {
  try {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return res.status(404).json({ error: 'File template không tìm thấy (PT355.xlsx).' });
    }

    const workbook = xlsx.readFile(TEMPLATE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const headers = data[0] || [];

    return res.json({
      success: true,
      templateName: path.basename(TEMPLATE_PATH),
      sheetName,
      headers,
      // Keep for backward compatibility, but UI no longer uses it.
      sampleRows: [],
      totalRows: Math.max(0, data.length - 1)
    });
  } catch (error) {
    console.error('[commission] template error:', error);
    return res.status(500).json({ error: 'Lỗi đọc file template', message: error.message });
  }
});

// POST /api/create-table
// Export lại file Excel dựa trên dữ liệu client (headers + rows).
router.post('/create-table', (req, res) => {
  try {
    const { data, headers, fileName, revenueColumnIndex = 11, commissionColumnIndex = 12 } = req.body || {};

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    // Use client headers (visible columns) as the output sheet structure.
    // This matches how the UI exports its table.
    let headerRow = Array.isArray(headers) && headers.length ? headers : null;

    if (!headerRow && fs.existsSync(TEMPLATE_PATH)) {
      const workbook = xlsx.readFile(TEMPLATE_PATH);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const templateData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      headerRow = templateData[0] || [];
    }

    headerRow = Array.isArray(headerRow) ? headerRow : [];

    const newData = [headerRow];

    data.forEach((rowArr) => {
      const row = Array.isArray(rowArr) ? rowArr : [];
      const newRow = [];

      headerRow.forEach((_, index) => {
        let value = row[index] !== undefined ? row[index] : '';

        // Auto-fill commission % cell if it targets that column.
        if (index === commissionColumnIndex) {
          const revenue = parseNumber(row[revenueColumnIndex]);
          if (revenue > 0) {
            value = `${calculateCommissionPercent(revenue).toFixed(1)}%`;
          }
        }

        newRow[index] = value;
      });

      newData.push(newRow);
    });

    const newWorksheet = xlsx.utils.aoa_to_sheet(newData);
    const newWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, 'Sheet1');

    const outputPath = path.join(UPLOAD_DIR, `${fileName || 'output'}-${Date.now()}.xlsx`);
    xlsx.writeFile(newWorkbook, outputPath);

    res.download(outputPath, `${fileName || 'output'}.xlsx`, (err) => {
      if (err) {
        console.error('[commission] download error:', err);
      }
      setTimeout(() => {
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (_) {}
      }, 1200);
    });
  } catch (error) {
    console.error('[commission] create-table error:', error);
    return res.status(500).json({ error: 'Lỗi tạo file Excel', message: error.message });
  }
});

// GET /api/get-token — đọc cache token từ user-admin GET /api/public/tokens
router.get('/get-token', async (req, res) => {
  try {
    const map = await getSimlyTokenMap();
    const facilities = Object.keys(map || {});
    return res.json({ success: true, facilities, tokens: map });
  } catch (error) {
    console.error('[commission] get-token error:', error);
    return res.status(500).json({ error: 'Lỗi lấy token', message: error.message });
  }
});

// POST /api/get-commission
// Lấy doanh số tính hoa hồng từ Simlydent API.
router.post('/get-commission', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const { fromDate, toDate } = req.body || {};
    const rawCache = req.body?.useCache;
    const cacheMode =
      rawCache === true ||
      rawCache === 1 ||
      (typeof rawCache === 'string' && ['1', 'true', 'yes', 'on'].includes(rawCache.trim().toLowerCase()));
    const hasDates = Boolean(fromDate) && Boolean(toDate);
    if (!hasDates) {
      // Allow "load any cache" mode: useCache=true without dates will return last cached data per facility (no upstream calls).
      if (!cacheMode) return res.status(400).json({ error: 'Thiếu fromDate hoặc toDate' });
    } else {
      if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
        return res.status(400).json({ error: 'fromDate/toDate phải theo định dạng YYYY-MM-DD' });
      }
    }

    // Fetch for all known facilities (each facility uses its own token)
    const facilities = FACILITY_KEYS;
    const settled = await Promise.allSettled(
      facilities.map(async (facilityKey) => {
        const cacheKey = hasDates
          ? `${facilityKey}|${fromDate}|${toDate}`
          : lastCommissionCacheKeyByFacility.get(String(facilityKey || '').trim());
        const cached = cacheKey ? commissionCache.get(cacheKey) : null;
        let data;
        if (cacheMode) {
          // Cache mode: no upstream calls. Only return cache if still within TTL (1 day).
          data = cached && cached.expiresAt > nowMs() && Array.isArray(cached.data) ? cached.data : [];
        } else {
          // Fresh update mode: clear old cache then fetch new and repopulate cache.
          clearCommissionCache({ facilityKey, fromDate, toDate });
          data = await getCommissionData({ facilityKey, fromDate, toDate, useCache: false });
        }
        // Attach facility marker so UI can create tabs reliably.
        const normalized = (Array.isArray(data) ? data : []).map((item) => ({
          ...(item || {}),
          facilityName: facilityKey
        }));
        return { facilityKey, data: normalized };
      })
    );

    const combined = [];
    const facilityErrors = [];
    settled.forEach((s, idx) => {
      const facilityKey = facilities[idx];
      if (s.status === 'fulfilled') {
        combined.push(...(s.value?.data || []));
      } else {
        const reason = s.reason || {};
        facilityErrors.push({
          facilityKey,
          message: reason?.message || String(reason),
          details: reason?.details || reason?.response?.data || null
        });
      }
    });

    if (facilityErrors.length === facilities.length) {
      return res.status(502).json({
        success: false,
        error: 'Không lấy được dữ liệu doanh số cho tất cả chi nhánh',
        facilityErrors
      });
    }

    const cacheHit = cacheMode && combined.length > 0;
    return res.json({
      success: true,
      facilities,
      data: combined,
      cacheHit,
      cacheMode,
      cacheAnyRange: cacheMode && !hasDates,
      partial: facilityErrors.length > 0,
      facilityErrors
    });
  } catch (error) {
    console.error('[commission] get-commission error:', error?.message, error?.response?.data || '');
    return res.status(500).json({
      error: 'Lỗi lấy doanh số tính hoa hồng',
      message: error.message,
      details: error?.details || error?.response?.data || 'Không có chi tiết lỗi'
    });
  }
});

// Compatibility placeholder with the cloned project.
router.post('/analyze', async (req, res) => {
  try {
    const { data } = req.body || {};
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
    return res.json({ success: true, message: 'Phân tích bằng AI (chưa triển khai ở bản tool hub)', data });
  } catch (error) {
    return res.status(500).json({ error: 'Lỗi phân tích dữ liệu', message: error.message });
  }
});

module.exports = router;

