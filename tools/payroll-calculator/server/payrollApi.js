const express = require("express");
const {
  postMisaOpenApi,
  defaultTimesheetSummaryUrl,
  defaultTimesheetSummaryDetailUrl,
  defaultTimesheetApplicationUrl,
  defaultTimesheetDetailUrl
} = require("../../windowsshell/server/misaClient");
const { getUserBySessionToken, listUsers } = require("../../windowsshell/server/authStore");

const AUTH_COOKIE_NAME = "ws_session";

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSessionToken(req) {
  return String(parseCookies(req)[AUTH_COOKIE_NAME] || "").trim();
}

const PAYROLL_ROLES = new Set(["admin", "manager", "leader"]);

async function requirePayrollRole(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const user = await getUserBySessionToken(token);
    if (!user) return res.status(401).json({ error: "Session expired" });
    const role = String(user.role || "").trim().toLowerCase();
    if (!PAYROLL_ROLES.has(role)) {
      return res.status(403).json({ error: "Permission denied (admin / manager / leader)" });
    }
    req.authUser = user;
    return next();
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Auth failed" });
  }
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseNoCacheFlag(req) {
  const raw = String(req.query?.noCache || req.query?.nocache || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Cùng quy tắc với `authStore.getLeaveAccrualThreshold` (misa công / phép thêm). */
function getLeaveAccrualThreshold() {
  const n = Number(String(process.env.LEAVE_BONUS_CONG_THRESHOLD || "15").trim());
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function toNonNegNumber(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Tổng số phút trên *một* đơn Đi muộn / vế sớm.
 * (MISA 2026): cộng phút từ `CheckInLateStartTime`, `CheckOutEarlyEndTimeint`, nghỉ giữa ca tương ứng.
 * Không dùng cột tổng từ API (có bản tên trùng, dễ lệch số) — tránh cộng nhầm 1/đơn thay vì phút.
 */
function lateEarlyMinutesFromMisaRow(row) {
  if (!row || typeof row !== "object") return 0;
  return (
    toNonNegNumber(row.CheckInLateStartTime) +
    toNonNegNumber(
      row.CheckOutEarlyEndTimeint ?? row.CheckOutEarlyEndTimeInt ?? row.CheckOutEarlyEndTime
    ) +
    toNonNegNumber(row.CheckInLateEndBreakTime) +
    toNonNegNumber(row.CheckOutEarlyStartBreakTime)
  );
}

/**
 * Tổng phút từ đơn Làm thêm. Tenant hiện tại chưa có bản ghi OverTime (API trả rỗng) —
 * bộ key dưới đây gom từ tài liệu/phiên bản thường gặp; cần chạy `GET /misa/application-inspect` khi có dữ liệu thật.
 */
function overtimeMinutesFromMisaRow(row) {
  if (!row || typeof row !== "object") return 0;
  const minuteKeys = [
    "OvertimeMinutes",
    "OverTimeMinutes",
    "TotalOvertimeMinutes",
    "TotalOverTimeMinutes",
    "OvertimeMinute",
    "RegisterOvertimeMinutes",
    "NumberOfOvertimeMinutes",
    "NumberOfMinutes",
    "NumberOfMinute",
    "TotalMinute",
    "MinuteOT",
    "OverTimeInMinute",
    "WorkingOvertimeMinutes",
    "OvertimeInMinutes",
    "SoPhutThem",
    "SoPhutDangKy"
  ];
  for (const k of minuteKeys) {
    if (row[k] != null && row[k] !== "" && Number.isFinite(Number(row[k]))) {
      return toNonNegNumber(row[k]);
    }
  }
  if (row.Minutes != null && row.Minutes !== "" && Number.isFinite(Number(row.Minutes))) {
    if (row.SubSystemCode === "OverTime" || (row.OverTimeTypeName != null && row.OverTimeTypeName !== "")) {
      return toNonNegNumber(row.Minutes);
    }
  }
  const hourKeys = [
    "NumberOfHourOverTime",
    "OverTimeHours",
    "HourOverTime",
    "NumberOfHours",
    "NumberOfHour",
    "RegisterHour",
    "OvertimeHours",
    "OvertimeHour",
    "SoGioDangKy",
    "SoGioLamThem"
  ];
  for (const k of hourKeys) {
    if (row[k] != null && row[k] !== "" && Number.isFinite(Number(row[k]))) {
      return Math.round(toNonNegNumber(row[k]) * 60);
    }
  }
  return 0;
}

function findEmployeeApplicationsByCode(apps, codeRaw) {
  if (!apps || !codeRaw) return null;
  const code = String(codeRaw).trim();
  if (!code) return null;
  if (apps[code]) return apps[code];
  const up = code.toUpperCase();
  for (const k of Object.keys(apps)) {
    if (String(k).trim().toUpperCase() === up) return apps[k];
  }
  return null;
}

/**
 * Gán lại TotalLateInEarlyOut / TotalOverTime trên từng dòng từ danh sách đơn trong EmployeeApplications
 * (tổng phút, không dùng số tích lũy từ vòng bump — tránh lệch khi cập nhật công thức phút/đọc key MISA).
 */
function recomputeMinuteColumnsFromApplicationLists(payload) {
  if (!payload || !payload.Data || !Array.isArray(payload.Data.PageData)) return payload;
  const apps = payload.EmployeeApplications;
  for (const row of payload.Data.PageData) {
    const code = String(row.EmployeeCode || "").trim();
    const a = findEmployeeApplicationsByCode(apps, code);
    if (!a) {
      row.TotalLateInEarlyOut = 0;
      row.TotalOverTime = 0;
      continue;
    }
    const late = Array.isArray(a.LateInEarlyOut) ? a.LateInEarlyOut : [];
    const ot = Array.isArray(a.OverTime) ? a.OverTime : [];
    let mL = 0;
    for (const r of late) mL += lateEarlyMinutesFromMisaRow(r);
    let mO = 0;
    for (const r of ot) mO += overtimeMinutesFromMisaRow(r);
    row.TotalLateInEarlyOut = mL;
    row.TotalOverTime = mO;
  }
  return payload;
}

/** key -> { dayKey, payload } */
const summaryCache = new Map();
const detailCache = new Map();
const applicationCache = new Map();
const employeeAggregateCache = new Map();

const MAX_SUMMARY_PAGES = 50;
const MAX_DETAIL_PAGES = 100;
const MAX_APPLICATION_PAGES = 50;
const MAX_TIMESHEET_DETAIL_PAGES = 20;

/**
 * Bỏ dấu, đ/Đ → d — để gom pattern (dữ liệu thực tế: users.company_level, job_position_name).
 */
function stripViet(s) {
  return String(s || "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * 0 = Ban lãnh đạo, 1 = Trợ lý/Trợ ký/Thư ký, 2 = Trưởng phòng/Trưởng khối, 3 = Thành viên.
 * *Không* gộp "PHỤ TÁ" (nha khoa) với "Trợ lý".
 */
function payrollListSortRank(companyLevel, jobPositionName) {
  const t = ` ${stripViet(companyLevel)} ${stripViet(jobPositionName)} `;

  if (
    /(tong giam doc|pho[\s-]*tong|pho[\s-]*giam|giam doc co so|pho tong giam doc|pho giam doc)/.test(
      t
    ) ||
    (/\btgd\b/.test(t) && !/\btro ly\b/.test(t) && !/\btro ky\b/.test(t))
  ) {
    return 0;
  }
  if (/\b(tro ly|tro ky|thu ky)\b/.test(t) && !/\bphu ta\b/.test(t)) {
    return 1;
  }
  if (
    /(truong phong|ke toan truong|bac si truong|y ta truong|le tan truong|truong nhom|giam \s*doc \s*phong)/.test(
      t
    ) ||
    /\bleader\b/.test(t)
  ) {
    return 2;
  }
  return 3;
}

function sortEmployeeAggregatePageData(pageData, userByCode) {
  const getRank = (row) => {
    const key = String(row.EmployeeCode || "")
      .trim()
      .toUpperCase();
    const u = key ? userByCode.get(key) : null;
    if (u) {
      return payrollListSortRank(u.companyLevel, u.jobPositionName);
    }
    return 3;
  };
  return [...pageData].sort((a, b) => {
    const ra = getRank(a);
    const rb = getRank(b);
    if (ra !== rb) return ra - rb;
    const na = String(a.FullName || a.EmployeeCode || "").trim();
    const nb = String(b.FullName || b.EmployeeCode || "").trim();
    return na.localeCompare(nb, "vi", { sensitivity: "base" });
  });
}

function buildSummaryBody(fromDate, toDate, pageIndex, pageSize) {
  return {
    PageSize: pageSize,
    PageIndex: pageIndex,
    Filter: null,
    CustomFilter: null,
    QuickSearch: {},
    CustomParam: {
      FromDate: fromDate,
      ToDate: toDate
    }
  };
}

function buildDetailBody(timeSheetSummaryId, pageIndex, pageSize) {
  return {
    PageSize: pageSize,
    PageIndex: pageIndex,
    Filter: null,
    CustomFilter: null,
    QuickSearch: {},
    CustomParam: {
      TimeSheetSummaryID: Number(timeSheetSummaryId)
    }
  };
}

function buildApplicationBody(subSystemCode, fromDate, toDate, pageIndex, pageSize) {
  return {
    PageSize: pageSize,
    PageIndex: pageIndex,
    Filter: null,
    CustomFilter: null,
    QuickSearch: {},
    CustomParam: {
      SubSystemCode: subSystemCode,
      FromDate: fromDate,
      ToDate: toDate
    }
  };
}

async function fetchAllSummaryPages(fromDate, toDate) {
  const url = defaultTimesheetSummaryUrl();
  const pageSize = 50;
  let pageIndex = 1;
  const all = [];
  let total = 0;
  let lastRaw = null;

  for (let p = 0; p < MAX_SUMMARY_PAGES; p += 1) {
    const body = buildSummaryBody(fromDate, toDate, pageIndex, pageSize);
    const { status, data } = await postMisaOpenApi(url, body);
    lastRaw = data;
    if (status !== 200) {
      const err = new Error(`MISA timesheet-summary HTTP ${status}`);
      err.code = "MISA_HTTP";
      err.misa = data;
      throw err;
    }
    if (!data || data.Success !== true) {
      const msg = data?.UserMessage || data?.SystemMessage || "MISA timesheet-summary failed";
      const err = new Error(msg);
      err.code = "MISA_API";
      err.misa = data;
      throw err;
    }
    const pd = Array.isArray(data.Data?.PageData) ? data.Data.PageData : [];
    total = Number(data.Data?.Total ?? pd.length);
    all.push(...pd);
    if (pd.length < pageSize || all.length >= total) break;
    pageIndex += 1;
  }

  return {
    Success: true,
    Data: { Total: total, PageData: all },
    ServerTime: lastRaw?.ServerTime,
    cached: false
  };
}

async function fetchAllDetailPages(timeSheetSummaryId) {
  const url = defaultTimesheetSummaryDetailUrl();
  const pageSize = 100;
  let pageIndex = 1;
  const all = [];
  let total = 0;
  let lastRaw = null;

  for (let p = 0; p < MAX_DETAIL_PAGES; p += 1) {
    const body = buildDetailBody(timeSheetSummaryId, pageIndex, pageSize);
    const { status, data } = await postMisaOpenApi(url, body);
    lastRaw = data;
    if (status !== 200) {
      const err = new Error(`MISA timesheet-detail HTTP ${status}`);
      err.code = "MISA_HTTP";
      err.misa = data;
      throw err;
    }
    if (!data || data.Success !== true) {
      const msg = data?.UserMessage || data?.SystemMessage || "MISA timesheet-detail failed";
      const err = new Error(msg);
      err.code = "MISA_API";
      err.misa = data;
      throw err;
    }
    const pd = Array.isArray(data.Data?.PageData) ? data.Data.PageData : [];
    total = Number(data.Data?.Total ?? pd.length);
    all.push(...pd);
    if (pd.length < pageSize || all.length >= total) break;
    pageIndex += 1;
  }

  return {
    Success: true,
    Data: { Total: total, PageData: all },
    ServerTime: lastRaw?.ServerTime,
    cached: false
  };
}

async function fetchAllApplicationPages(subSystemCode, fromDate, toDate) {
  const url = defaultTimesheetApplicationUrl();
  const pageSize = 50;
  let pageIndex = 1;
  const all = [];
  let total = 0;
  let lastRaw = null;

  for (let p = 0; p < MAX_APPLICATION_PAGES; p += 1) {
    const body = buildApplicationBody(subSystemCode, fromDate, toDate, pageIndex, pageSize);
    const { status, data } = await postMisaOpenApi(url, body);
    lastRaw = data;
    if (status !== 200) {
      const err = new Error(`MISA application HTTP ${status}`);
      err.code = "MISA_HTTP";
      err.misa = data;
      throw err;
    }
    if (!data || data.Success !== true) {
      const msg = data?.UserMessage || data?.SystemMessage || "MISA application failed";
      const err = new Error(msg);
      err.code = "MISA_API";
      err.misa = data;
      throw err;
    }
    const pd = Array.isArray(data.Data?.PageData) ? data.Data.PageData : [];
    total = Number(data.Data?.Total ?? pd.length);
    all.push(...pd);
    if (pd.length < pageSize || all.length >= total) break;
    pageIndex += 1;
  }

  return {
    Success: true,
    Data: { Total: total, PageData: all },
    ServerTime: lastRaw?.ServerTime,
    cached: false
  };
}

async function fetchAllTimesheetDetailPages(timeSheetId) {
  const url = defaultTimesheetDetailUrl();
  const pageSize = 50;
  let pageIndex = 1;
  const all = [];
  let total = 0;
  let lastRaw = null;

  for (let p = 0; p < MAX_TIMESHEET_DETAIL_PAGES; p += 1) {
    const body = {
      PageSize: pageSize,
      PageIndex: pageIndex,
      Filter: null,
      CustomFilter: null,
      QuickSearch: {},
      CustomParam: {
        TimeSheetID: Number(timeSheetId)
      }
    };
    const { status, data } = await postMisaOpenApi(url, body);
    lastRaw = data;
    if (status !== 200) {
      const err = new Error(`MISA timesheet-detail HTTP ${status}`);
      err.code = "MISA_HTTP";
      err.misa = data;
      throw err;
    }
    if (!data || data.Success !== true) {
      const msg = data?.UserMessage || data?.SystemMessage || "MISA timesheet-detail failed";
      const err = new Error(msg);
      err.code = "MISA_API";
      err.misa = data;
      throw err;
    }
    const pd = Array.isArray(data.Data?.PageData) ? data.Data.PageData : [];
    total = Number(data.Data?.Total ?? pd.length);
    all.push(...pd);
    if (pd.length < pageSize || all.length >= total) break;
    pageIndex += 1;
  }

  return {
    Success: true,
    Data: { Total: total, PageData: all },
    ServerTime: lastRaw?.ServerTime,
    cached: false
  };
}

async function buildEmployeeAggregate(fromDate, toDate) {
  const users = await listUsers();
  const leaveByEmployeeCode = new Map();
  users.forEach((u) => {
    if (u.employeeCode) {
      leaveByEmployeeCode.set(String(u.employeeCode), u.leaveRemaining != null ? Number(u.leaveRemaining) : null);
    }
  });

  const summary = await fetchAllSummaryPages(fromDate, toDate);
  const employeeMap = new Map();

  // Aggregate working days and paid days from all timesheet details
  const summaries = Array.isArray(summary.Data?.PageData) ? summary.Data.PageData : [];
  for (const s of summaries) {
    const id = s.TimeSheetsSummaryID;
    if (!id) continue;
    // eslint-disable-next-line no-await-in-loop
    const details = await fetchAllDetailPages(id);
    const rows = Array.isArray(details.Data?.PageData) ? details.Data.PageData : [];
    rows.forEach((row) => {
      const code = row.EmployeeCode || "";
      if (!code) return;
      let agg = employeeMap.get(code);
      if (!agg) {
        agg = {
          EmployeeCode: code,
          FullName: row.FullName || "",
          OrganizationUnitName: row.OrganizationUnitName || "",
          TotalWorkingActual: 0,
          TotalWorking: 0,
          TotalLateInEarlyOut: 0,
          TotalOverTime: 0,
          TotalUpdateTimekeeper: 0,
          TotalLeave: 0,
          LeaveRemaining: leaveByEmployeeCode.get(code) ?? null,
          LeaveRequestsThisMonth: 0,
          LeaveUsedThisMonth: 0
        };
        employeeMap.set(code, agg);
      }
      agg.TotalWorkingActual += Number(row.TotalWorkingActual || 0);
      agg.TotalWorking += Number(row.TotalWorking || 0);
    });
  }

  /**
   * Đơn (MISA get-data-application) cùng khoảng fromDate–toDate với báo cáo.
   * TotalLateInEarlyOut / TotalOverTime: tổng phút từ **mọi đơn** Đi muộn–Vế sớm / Làm thêm **của đúng nhân viên**
   * (theo EmployeeCode từng dòng đơn), không lấy từ nguồn khác.
   */
  const applications = {
    Attendance: await fetchAllApplicationPages("Attendance", fromDate, toDate),
    LateInEarlyOut: await fetchAllApplicationPages("LateInEarlyOut", fromDate, toDate),
    OverTime: await fetchAllApplicationPages("OverTime", fromDate, toDate),
    UpdateTimekeeper: await fetchAllApplicationPages("UpdateTimekeeper", fromDate, toDate)
  };

  const employeeApplications = {};

  function ensureAggFromRow(row) {
    const code = row.EmployeeCode || "";
    if (!code) return null;
    let agg = employeeMap.get(code);
    if (!agg) {
      agg = {
        EmployeeCode: code,
        FullName: row.FullName || "",
        OrganizationUnitName: row.OrganizationUnitName || "",
        TotalWorkingActual: 0,
        TotalWorking: 0,
        TotalLateInEarlyOut: 0,
        TotalOverTime: 0,
        TotalUpdateTimekeeper: 0,
        TotalLeave: 0,
        LeaveRemaining: leaveByEmployeeCode.get(code) ?? null,
        LeaveRequestsThisMonth: 0,
        LeaveUsedThisMonth: 0
      };
      employeeMap.set(code, agg);
    }
    if (!employeeApplications[code]) {
      employeeApplications[code] = {
        Attendance: [],
        LateInEarlyOut: [],
        OverTime: [],
        UpdateTimekeeper: []
      };
    }
    return { code, agg };
  }

  function bumpFrom(list, kind, fieldName) {
    const rows = Array.isArray(list.Data?.PageData) ? list.Data.PageData : [];
    rows.forEach((row) => {
      const ctx = ensureAggFromRow(row);
      if (!ctx) return;
      ctx.agg[fieldName] += 1;
      if (kind === "Attendance") {
        ctx.agg.LeaveRequestsThisMonth += 1;
        ctx.agg.LeaveUsedThisMonth += Number(row.LeaveDay || 0);
      }
      employeeApplications[ctx.code][kind].push(row);
    });
  }

  function bumpLateEarlyMinutesFrom(list) {
    const rows = Array.isArray(list.Data?.PageData) ? list.Data.PageData : [];
    rows.forEach((row) => {
      const ctx = ensureAggFromRow(row);
      if (!ctx) return;
      ctx.agg.TotalLateInEarlyOut += lateEarlyMinutesFromMisaRow(row);
      employeeApplications[ctx.code].LateInEarlyOut.push(row);
    });
  }

  function bumpOvertimeMinutesFrom(list) {
    const rows = Array.isArray(list.Data?.PageData) ? list.Data.PageData : [];
    rows.forEach((row) => {
      const ctx = ensureAggFromRow(row);
      if (!ctx) return;
      ctx.agg.TotalOverTime += overtimeMinutesFromMisaRow(row);
      employeeApplications[ctx.code].OverTime.push(row);
    });
  }

  bumpLateEarlyMinutesFrom(applications.LateInEarlyOut);
  bumpOvertimeMinutesFrom(applications.OverTime);
  bumpFrom(applications.UpdateTimekeeper, "UpdateTimekeeper", "TotalUpdateTimekeeper");
  bumpFrom(applications.Attendance, "Attendance", "TotalLeave");

  const userByCode = new Map();
  users.forEach((u) => {
    const c = String(u.employeeCode || "")
      .trim()
      .toUpperCase();
    if (c) {
      userByCode.set(c, { companyLevel: u.companyLevel, jobPositionName: u.jobPositionName });
    }
  });
  const rows = sortEmployeeAggregatePageData(Array.from(employeeMap.values()), userByCode);

  return recomputeMinuteColumnsFromApplicationLists({
    Success: true,
    Data: { Total: rows.length, PageData: rows },
    EmployeeApplications: employeeApplications
  });
}

/**
 * Cột « Phép thêm tháng này »: luôn tính tại mỗi lần trả API (kể cả khi tổng hợp MISA dùng cache),
 * từ Tổng công hưởng lương (TotalWorking) đã cộng trong khoảng from–to của báo cáo, so với ngưỡng.
 * Không dùng bản sao từ users.leaveBonusThisMonth (một tháng lịch, có thể lệch với tháng đang xem).
 */
function attachLeaveExtraThisMonth(payload) {
  const thr = getLeaveAccrualThreshold();
  const pageData = Array.isArray(payload?.Data?.PageData) ? payload.Data.PageData : [];
  const nextRows = pageData.map((row) => {
    const cong = Number(row.TotalWorking || 0);
    const extra = cong >= thr ? 1 : 0;
    return { ...row, LeaveExtraThisMonth: extra };
  });
  return {
    ...payload,
    Data: {
      ...payload.Data,
      Total: nextRows.length,
      PageData: nextRows
    }
  };
}

function monthKeyFromYMDParts(y, m0) {
  return `${y}-${String(m0 + 1).padStart(2, "0")}`;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const router = express.Router();
router.buildEmployeeAggregate = buildEmployeeAggregate;

/**
 * GET ?preset=lastMonth|thisMonth
 * hoặc ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Cache theo ngày (server): cùng from/to + cùng calendar day → trả cache.
 */
router.get("/misa/timesheet-summary", requirePayrollRole, async (req, res) => {
  try {
    const noCache = parseNoCacheFlag(req);
    const preset = String(req.query?.preset || "").trim().toLowerCase();
    let fromDate;
    let toDate;

    const now = new Date();
    if (preset === "lastmonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(last);
    } else if (preset === "thismonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(now);
    } else {
      fromDate = String(req.query?.from || "").trim();
      toDate = String(req.query?.to || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res.status(400).json({ error: "Use preset=lastMonth|thisMonth or from & to (YYYY-MM-DD)" });
      }
    }

    const cacheKey = `summary:${fromDate}:${toDate}`;
    const dk = dayKey();
    const hit = summaryCache.get(cacheKey);
    if (!noCache && hit && hit.dayKey === dk) {
      return res.json({ ...hit.payload, fromDate, toDate, cached: true });
    }

    const payload = await fetchAllSummaryPages(fromDate, toDate);
    summaryCache.set(cacheKey, { dayKey: dk, payload });
    return res.json({ ...payload, fromDate, toDate, cached: false });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "Timesheet summary failed" });
  }
});

/**
 * GET ?id=TimeSheetsSummaryID
 */
router.get("/misa/timesheet-summary-detail", requirePayrollRole, async (req, res) => {
  try {
    const noCache = parseNoCacheFlag(req);
    const id = Number(req.query?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "id (TimeSheetSummaryID) is required" });
    }

    const cacheKey = `detail:${id}`;
    const dk = dayKey();
    const hit = detailCache.get(cacheKey);
    if (!noCache && hit && hit.dayKey === dk) {
      return res.json({ ...hit.payload, timeSheetSummaryId: id, cached: true });
    }

    const payload = await fetchAllDetailPages(id);
    detailCache.set(cacheKey, { dayKey: dk, payload });
    return res.json({ ...payload, timeSheetSummaryId: id, cached: false });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "Timesheet detail failed" });
  }
});

/**
 * GET /misa/applications?subSystemCode=Attendance|LateInEarlyOut|OverTime|MissionAllowance|UpdateTimekeeper|ChangeShift&preset=lastMonth|thisMonth
 * hoặc ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get("/misa/applications", requirePayrollRole, async (req, res) => {
  try {
    const noCache = parseNoCacheFlag(req);
    const rawSub = String(req.query?.subSystemCode || "").trim();
    const subSystemCode = rawSub || "Attendance";
    const allowed = new Set([
      "Attendance",
      "LateInEarlyOut",
      "OverTime",
      "MissionAllowance",
      "UpdateTimekeeper",
      "ChangeShift"
    ]);
    if (!allowed.has(subSystemCode)) {
      return res.status(400).json({ error: "Invalid subSystemCode" });
    }

    const preset = String(req.query?.preset || "").trim().toLowerCase();
    let fromDate;
    let toDate;

    const now = new Date();
    if (preset === "lastmonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(last);
    } else if (preset === "thismonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(now);
    } else {
      fromDate = String(req.query?.from || "").trim();
      toDate = String(req.query?.to || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res
          .status(400)
          .json({ error: "Use preset=lastMonth|thisMonth or from & to (YYYY-MM-DD)" });
      }
    }

    const cacheKey = `app:${subSystemCode}:${fromDate}:${toDate}`;
    const dk = dayKey();
    const hit = applicationCache.get(cacheKey);
    if (!noCache && hit && hit.dayKey === dk) {
      return res.json({ ...hit.payload, subSystemCode, fromDate, toDate, cached: true });
    }

    const payload = await fetchAllApplicationPages(subSystemCode, fromDate, toDate);
    applicationCache.set(cacheKey, { dayKey: dk, payload });
    return res.json({ ...payload, subSystemCode, fromDate, toDate, cached: false });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "Applications fetch failed" });
  }
});

const APPLICATION_SUB_CODES = new Set([
  "Attendance",
  "LateInEarlyOut",
  "OverTime",
  "MissionAllowance",
  "UpdateTimekeeper",
  "ChangeShift"
]);

/**
 * GET /misa/application-inspect?subSystemCode=LateInEarlyOut|OverTime&preset=thisMonth|lastMonth&noCache=1
 * Trả 1 bản ghi mẫu từ MISA để xem tên cột thực tế (phút, giờ, …) — cùng quyền với bảng chấm công.
 * Không dùng cache ứng dụng: luôn gọi MISA mới (có thể tốn rate).
 */
router.get("/misa/application-inspect", requirePayrollRole, async (req, res) => {
  try {
    const rawSub = String(req.query?.subSystemCode || "").trim();
    if (!rawSub || !APPLICATION_SUB_CODES.has(rawSub)) {
      return res.status(400).json({ error: "subSystemCode is required and must be a valid MISA type" });
    }
    const preset = String(req.query?.preset || "thismonth").trim().toLowerCase();
    let fromDate;
    let toDate;
    const now = new Date();
    if (preset === "lastmonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(last);
    } else if (preset === "thismonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(now);
    } else {
      fromDate = String(req.query?.from || "").trim();
      toDate = String(req.query?.to || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res.status(400).json({ error: "Use preset=lastMonth|thisMonth or from & to (YYYY-MM-DD)" });
      }
    }

    const payload = await fetchAllApplicationPages(rawSub, fromDate, toDate);
    const pageData = Array.isArray(payload?.Data?.PageData) ? payload.Data.PageData : [];
    const first = pageData[0] || null;
    const reInteresting = /minute|phut|Minute|Hour|Time|Check|Late|Early|Over|OT|Overtime|Register|Gio|Phut|So|Value|Total|In|Out|Int$/i;
    const allKeys = first ? Object.keys(first).sort() : [];
    const interestingFields = {};
    if (first) {
      allKeys.forEach((k) => {
        if (reInteresting.test(k)) {
          interestingFields[k] = first[k];
        }
      });
    }
    return res.json({
      Success: true,
      subSystemCode: rawSub,
      fromDate,
      toDate,
      total: payload.Data?.Total ?? pageData.length,
      count: pageData.length,
      allKeys,
      interestingFields,
      sampleRow0: first
    });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "application-inspect failed" });
  }
});

/**
 * GET /misa/employee-aggregate?preset=lastMonth|thisMonth or from/to
 * Tổng hợp theo nhân viên: công + số đơn theo loại.
 */
router.get("/misa/employee-aggregate", requirePayrollRole, async (req, res) => {
  try {
    const noCache = parseNoCacheFlag(req);
    const preset = String(req.query?.preset || "").trim().toLowerCase();
    let fromDate;
    let toDate;

    const now = new Date();
    if (preset === "lastmonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(last);
    } else if (preset === "thismonth") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      fromDate = fmt(first);
      toDate = fmt(now);
    } else {
      fromDate = String(req.query?.from || "").trim();
      toDate = String(req.query?.to || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        return res
          .status(400)
          .json({ error: "Use preset=lastMonth|thisMonth or from & to (YYYY-MM-DD)" });
      }
    }

    const cacheKey = `agg:v2:${fromDate}:${toDate}`;
    const dk = dayKey();
    const hit = employeeAggregateCache.get(cacheKey);
    if (!noCache && hit && hit.dayKey === dk) {
      recomputeMinuteColumnsFromApplicationLists(hit.payload);
      const merged = attachLeaveExtraThisMonth(hit.payload);
      return res.json({ ...merged, fromDate, toDate, cached: true });
    }

    const base = await buildEmployeeAggregate(fromDate, toDate);
    employeeAggregateCache.set(cacheKey, { dayKey: dk, payload: base });
    const payload = attachLeaveExtraThisMonth(base);
    return res.json({ ...payload, fromDate, toDate, cached: false });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "Employee aggregate failed" });
  }
});

/**
 * GET /misa/timesheet-detail?timeSheetId=...&employeeCode=...
 * Trả về toàn bộ bản ghi detail (từ Open API get-data-timesheet-detail).
 */
router.get("/misa/timesheet-detail", requirePayrollRole, async (req, res) => {
  try {
    const timeSheetId = Number(req.query?.timeSheetId);
    const employeeCode = String(req.query?.employeeCode || "").trim();
    if (!Number.isFinite(timeSheetId) || timeSheetId <= 0) {
      return res.status(400).json({ error: "timeSheetId is required" });
    }

    const payload = await fetchAllTimesheetDetailPages(timeSheetId);
    // Không cache riêng vì đã cache ở tầng Open API; nếu muốn, có thể thêm sau.
    return res.json({
      ...payload,
      timeSheetId,
      employeeCode
    });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "Timesheet detail failed" });
  }
});

module.exports = router;
