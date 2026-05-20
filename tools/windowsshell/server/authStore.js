const crypto = require("crypto");
const { openSqliteDatabase } = require("../../../shared/server-base/openSqlite");
const { DB_FILE } = require("./dbPaths");

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const ROLES = ["user", "member", "leader", "manager", "admin"];
const TOOL_CATALOG = [
  { id: "crmtester", title: "CRM API Tester" },
  { id: "mycomputer", title: "My Computer" },
  { id: "fileexplorer", title: "File Explorer" },
  { id: "commission", title: "Commission" },
  { id: "commission-settings", title: "Commission Settings" },
  { id: "giftbag", title: "Giftbag" },
  { id: "itsupport", title: "IT Support" },
  { id: "json", title: "JSON Formatter" },
  { id: "base64", title: "Base64" },
  { id: "hash", title: "Hash" },
  { id: "regex", title: "Regex" },
  { id: "qr", title: "QR Code" },
  { id: "gradient", title: "Gradient" },
  { id: "uuid", title: "UUID" },
  { id: "jsonmodel", title: "JSON to Model" },
  { id: "date", title: "Date Formatter" },
  { id: "color", title: "Color Contrast" },
  { id: "tinypng", title: "Tiny PNG" },
  { id: "palette", title: "Color Palette" },
  { id: "resizer", title: "Image Resizer" },
  { id: "base64img", title: "Image Base64" },
  { id: "singaelookup", title: "SINGAE Lookup" },
  { id: "useradmin", title: "User Admin" },
  { id: "chatbot", title: "Chatbot" },
  { id: "dbviewer", title: "Database Viewer" },
  { id: "ai-manager", title: "AI Manager" },
  { id: "chatbot-manager", title: "Chatbot Manager" },
  { id: "payrollcalculator", title: "Bảng chấm công" }
];

const TOOL_CATALOG_IDS = new Set(TOOL_CATALOG.map((t) => t.id));

const db = openSqliteDatabase(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return ROLES.includes(value) ? value : "member";
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, encoded) {
  const raw = String(encoded || "");
  const [algo, salt, hashHex] = raw.split(":");
  if (algo !== "scrypt" || !salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(password || ""), salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function parseOptionalInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function monthKeyFromDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function nextMonthKey(key) {
  const [yRaw, mRaw] = String(key || "").split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return monthKeyFromDate();
  const next = new Date(y, m, 1);
  return monthKeyFromDate(next);
}

function parseOtLateMonthlyJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_) {
    return {};
  }
}

function normalizeOtLateMonthEntry(entry, openingFallback = 0) {
  const openingBalanceMinutes = parseOptionalNumber(entry?.openingBalanceMinutes) ?? openingFallback;
  const overtimeMinutesThisMonth = parseOptionalNumber(entry?.overtimeMinutesThisMonth) ?? 0;
  const lateEarlyMinutesThisMonth = parseOptionalNumber(entry?.lateEarlyMinutesThisMonth) ?? 0;
  return {
    openingBalanceMinutes,
    overtimeMinutesThisMonth,
    lateEarlyMinutesThisMonth
  };
}

async function applyOtLateMonthlyRollover() {
  const rows = await all(
    `SELECT id, manual_overtime_minutes_remaining, manual_late_early_minutes_last_month, ot_late_monthly_json, ot_late_rollover_month_key
     FROM users`
  );
  if (!rows.length) return;
  const now = nowIso();
  const currentMonthKey = monthKeyFromDate();
  for (const row of rows) {
    let changed = false;
    let balance = parseOptionalNumber(row.manual_overtime_minutes_remaining) ?? 0;
    const history = parseOtLateMonthlyJson(row.ot_late_monthly_json);
    let activeMonthKey = String(row.ot_late_rollover_month_key || "").trim();
    if (!activeMonthKey) {
      activeMonthKey = currentMonthKey;
      changed = true;
    }
    history[activeMonthKey] = normalizeOtLateMonthEntry(history[activeMonthKey], balance);
    if (activeMonthKey !== currentMonthKey) {
      changed = true;
      while (activeMonthKey < currentMonthKey) {
        const active = normalizeOtLateMonthEntry(history[activeMonthKey], balance);
        const closing = active.openingBalanceMinutes + active.overtimeMinutesThisMonth - active.lateEarlyMinutesThisMonth;
        balance = closing;
        const nextKey = nextMonthKey(activeMonthKey);
        history[nextKey] = normalizeOtLateMonthEntry(history[nextKey], balance);
        activeMonthKey = nextKey;
      }
    }
    if (!changed) continue;
    const currentEntry = normalizeOtLateMonthEntry(history[currentMonthKey], balance);
    await run(
      `UPDATE users
       SET manual_overtime_minutes_remaining = ?,
           manual_late_early_minutes_last_month = ?,
           ot_late_monthly_json = ?,
           ot_late_rollover_month_key = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        balance,
        currentEntry.lateEarlyMinutesThisMonth,
        JSON.stringify(history),
        currentMonthKey,
        now,
        row.id
      ]
    );
  }
}

function getLeaveAccrualThreshold() {
  const n = Number(String(process.env.LEAVE_BONUS_CONG_THRESHOLD || "15").trim());
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function ymdDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tự động: gọi MISA, cập nhật tổng công tháng hiện tại (đầu tháng → hôm nay) theo từng mã NV. */
async function refreshMisaCôngThángNàyForAllUsers() {
  const nowD = new Date();
  const y = nowD.getFullYear();
  const m = nowD.getMonth();
  const fromDate = ymdDate(new Date(y, m, 1));
  const toDate = ymdDate(nowD);
  const monthKey = monthKeyFromDate(nowD);
  let payroll;
  try {
    // eslint-disable-next-line global-require
    payroll = require("../../payroll-calculator/server/payrollApi");
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  if (typeof payroll.buildEmployeeAggregate !== "function") {
    return { ok: false, error: "buildEmployeeAggregate missing" };
  }
  const payload = await payroll.buildEmployeeAggregate(fromDate, toDate);
  const pageData = Array.isArray(payload?.Data?.PageData) ? payload.Data.PageData : [];
  const map = new Map();
  pageData.forEach((row) => {
    const c = String(row.EmployeeCode || "").trim();
    if (c) map.set(c.toUpperCase(), Number(row.TotalWorking || 0));
  });
  const ts = nowIso();
  const usersL = await all(`SELECT id, employee_code FROM users WHERE is_active = 1`);
  for (const u of usersL) {
    const code = String(u.employee_code || "").trim();
    const w = code ? (Number(map.get(code.toUpperCase()) ?? 0) || 0) : null;
    // eslint-disable-next-line no-await-in-loop
    await run(`UPDATE users SET misa_cong_month_key = ?, misa_cong_value = ?, updated_at = ? WHERE id = ?`, [
      monthKey,
      w,
      ts,
      u.id
    ]);
  }
  return { ok: true, monthKey, fromDate, toDate, users: usersL.length, employeesMisa: pageData.length };
}

/**
 * Mùng 1: lấy tổng công tháng lịch vừa rồi; nếu ≥ ngưỡng → cộng 1 vào `manual_leave_remaining` (phép còn lại) và gửi Zalo.
 */
async function accrueLeaveForPreviousWorkMonthOnDayFirst() {
  const nowD = new Date();
  if (nowD.getDate() !== 1) return { ok: true, skipped: "not_first_day" };
  const d0 = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const d1 = new Date(nowD.getFullYear(), nowD.getMonth(), 0);
  const workMonthKey = monthKeyFromDate(d0);
  const fromDate = ymdDate(d0);
  const toDate = ymdDate(d1);
  const thr = getLeaveAccrualThreshold();
  let payroll;
  try {
    // eslint-disable-next-line global-require
    payroll = require("../../payroll-calculator/server/payrollApi");
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
  const payload = await payroll.buildEmployeeAggregate(fromDate, toDate);
  const pageData = Array.isArray(payload?.Data?.PageData) ? payload.Data.PageData : [];
  const congMap = new Map();
  pageData.forEach((row) => {
    const c = String(row.EmployeeCode || "").trim();
    if (c) congMap.set(c.toUpperCase(), Number(row.TotalWorking || 0));
  });
  const workers = await all(
    `SELECT id, employee_code, full_name, username, manual_leave_remaining, last_leave_accrual_work_month, zalo_user_id
     FROM users WHERE is_active = 1`
  );
  let added = 0;
  for (const u of workers) {
    const accrualDone = String(u.last_leave_accrual_work_month || "").trim();
    if (accrualDone === workMonthKey) continue;
    const code = String(u.employee_code || "").trim();
    if (!code) {
      // eslint-disable-next-line no-await-in-loop
      await run(`UPDATE users SET last_leave_accrual_work_month = ?, updated_at = ? WHERE id = ?`, [
        workMonthKey,
        nowIso(),
        u.id
      ]);
      continue;
    }
    const w = Number(congMap.get(code.toUpperCase()) ?? 0) || 0;
    if (w < thr) {
      // eslint-disable-next-line no-await-in-loop
      await run(`UPDATE users SET last_leave_accrual_work_month = ?, updated_at = ? WHERE id = ?`, [
        workMonthKey,
        nowIso(),
        u.id
      ]);
      continue;
    }
    const prev =
      u.manual_leave_remaining != null && u.manual_leave_remaining !== "" ? Number(u.manual_leave_remaining) : 0;
    const next = prev + 1;
    // eslint-disable-next-line no-await-in-loop
    await run(
      `UPDATE users
       SET manual_leave_remaining = ?,
           last_leave_accrual_work_month = ?,
           updated_at = ?
       WHERE id = ?`,
      [next, workMonthKey, nowIso(), u.id]
    );
    added += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendZaloAccrualPlusOne(
        u.zalo_user_id,
        String(u.full_name || u.username || "").trim(),
        next
      );
    } catch (_) {
      /* Zalo tùy chọn */
    }
  }
  return { ok: true, workMonthKey, fromDate, toDate, added };
}

function startLeaveMisaAccrualSchedulers() {
  if (String(process.env.SINGAE_DISABLE_LEAVE_MISA_JOBS || "").trim() === "1") return;
  const h6 = 6 * 60 * 60 * 1000;
  const h3 = 3 * 60 * 60 * 1000;
  setTimeout(() => {
    Promise.allSettled([refreshMisaCôngThángNàyForAllUsers(), accrueLeaveForPreviousWorkMonthOnDayFirst()]).then(
      () => {}
    );
  }, 90_000);
  setInterval(() => {
    refreshMisaCôngThángNàyForAllUsers().catch(() => {});
  }, h6);
  setInterval(() => {
    accrueLeaveForPreviousWorkMonthOnDayFirst().catch(() => {});
  }, h3);
}

async function sendZaloAccrualPlusOne(zaloUserId, fullName, newLeave) {
  const uid = String(zaloUserId || "").trim();
  if (!uid) return;
  const text = `Singae thông báo nhân viên: ${fullName} được cộng 1 phép năm (phép còn lại: ${newLeave})`;
  // eslint-disable-next-line global-require
  const hub = require("./zaloNotifyHub");
  if (typeof hub.sendZaloPersonalToUserByUid === "function") {
    await hub.sendZaloPersonalToUserByUid(uid, text);
  }
}

async function sendZaloLeaveRemainingChangedIfNeeded(zaloUserId, fullName, oldL, newL) {
  const uid = String(zaloUserId || "").trim();
  if (!uid) return;
  // eslint-disable-next-line global-require
  const hub = require("./zaloNotifyHub");
  if (typeof hub.sendZaloPersonalToUserByUid !== "function") return;
  const o = oldL != null && oldL !== "" ? Number(oldL) : 0;
  const n = newL != null && newL !== "" ? Number(newL) : 0;
  const d = n - o;
  let text;
  if (d === 1) {
    text = `Singae thông báo nhân viên: ${fullName} được cộng 1 phép năm (phép còn lại: ${n})`;
  } else {
    text = `Singae thông báo nhân viên: ${fullName} cập nhật phép còn lại: ${n} (trước: ${o})`;
  }
  await hub.sendZaloPersonalToUserByUid(uid, text);
}

function sanitizeUser(row) {
  if (!row) return null;
  const currentMonthKey = monthKeyFromDate();
  const history = parseOtLateMonthlyJson(row.ot_late_monthly_json);
  const currentEntry = normalizeOtLateMonthEntry(
    history[currentMonthKey],
    parseOptionalNumber(row.manual_overtime_minutes_remaining) ?? 0
  );
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    fullName: row.full_name || "",
    avatarUrl: row.avatar_url || "",
    gender: row.gender || "",
    companyLevel: row.company_level || "",
    department: row.department || "",
    workSchedule: row.work_schedule || "",
    strengths: row.strengths || "",
    weaknesses: row.weaknesses || "",
    hobbies: row.hobbies || "",
    address: row.address || "",
    phone: row.phone || "",
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || null,
    employeeCode: row.employee_code || "",
    organizationUnitId: row.organization_unit_id != null ? row.organization_unit_id : null,
    organizationUnitName: row.organization_unit_name || "",
    jobPositionId: row.job_position_id || "",
    jobPositionName: row.job_position_name || "",
    shiftCode: row.shift_code || "",
    employeeStatusId: row.employee_status_id != null ? row.employee_status_id : null,
    misaSyncedAt: row.misa_synced_at || null,
    leaveRemaining: row.manual_leave_remaining != null ? Number(row.manual_leave_remaining) : null,
    overtimeMinutesRemaining:
      row.manual_overtime_minutes_remaining != null ? Number(row.manual_overtime_minutes_remaining) : null,
    lateEarlyMinutesLastMonth:
      row.manual_late_early_minutes_last_month != null ? Number(row.manual_late_early_minutes_last_month) : null,
    otLateCurrentMonthKey: currentMonthKey,
    overtimeMinutesThisMonth: currentEntry.overtimeMinutesThisMonth,
    lateEarlyMinutesThisMonth: currentEntry.lateEarlyMinutesThisMonth,
    otLateMonthlyStats: history,
    facebookId: String(row.facebook_id || "").trim(),
    zaloUserId: String(row.zalo_user_id || "").trim(),
    misaCongMonthKey: String(row.misa_cong_month_key || "").trim() || null,
    misaCongValue: row.misa_cong_value != null && row.misa_cong_value !== "" ? Number(row.misa_cong_value) : null,
    lastLeaveAccrualWorkMonth: String(row.last_leave_accrual_work_month || "").trim() || null,
    /** Tổng công tháng hiện tại (MISA) khi bản ghi cùng tháng lịch — cập nhật tự động, không cần bấm sync. */
    leaveBonusWorkdaysInMonth: (() => {
      const k = String(row.misa_cong_month_key || "").trim();
      if (k !== currentMonthKey) return null;
      if (row.misa_cong_value == null || row.misa_cong_value === "") return null;
      return Number(row.misa_cong_value);
    })(),
    /** 0/1: công tháng này (MISA) ≥ ngưỡng — điều kiện cộng phép khi mùng 1 (từ công tháng trước). */
    leaveBonusThisMonth: (() => {
      const k = String(row.misa_cong_month_key || "").trim();
      if (k !== currentMonthKey) return 0;
      if (row.misa_cong_value == null || row.misa_cong_value === "") return 0;
      return Number(row.misa_cong_value) >= getLeaveAccrualThreshold() ? 1 : 0;
    })()
  };
}

async function initAuthSchema() {
  await run(`PRAGMA journal_mode=WAL;`);
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT,
      avatar_url TEXT,
      gender TEXT,
      company_level TEXT,
      department TEXT,
      work_schedule TEXT,
      tool_meta_json TEXT,
      strengths TEXT,
      weaknesses TEXT,
      hobbies TEXT,
      address TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );
  `);
  // Backward-compatible migration: add columns if the table already existed
  try { await run(`ALTER TABLE users ADD COLUMN gender TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN company_level TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN department TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN work_schedule TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN tool_meta_json TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN employee_code TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN organization_unit_id INTEGER`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN organization_unit_name TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN job_position_id TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN job_position_name TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN shift_code TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN employee_status_id INTEGER`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN misa_synced_at TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN manual_leave_remaining REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN manual_overtime_minutes_remaining REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN manual_late_early_minutes_last_month REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN ot_late_monthly_json TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN ot_late_rollover_month_key TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN leave_bonus_month_key TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN leave_bonus_month_workdays REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN leave_bonus_month_amount REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN misa_cong_month_key TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN misa_cong_value REAL`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN last_leave_accrual_work_month TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN facebook_id TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN zalo_user_id TEXT`); } catch (_) {}
  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS role_tool_access (
      role TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      can_access INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(role, tool_id)
    );
  `);
  await seedRoleToolAccessIfMissing();
  await pruneStaleRoleToolAccessRows();
  await seedManualLeaveRemainingFromMap();
  await applyOtLateMonthlyRollover();
}

/** Xóa các dòng role_tool_access trỏ tới tool_id không còn trong TOOL_CATALOG (tool đã gỡ). */
async function pruneStaleRoleToolAccessRows() {
  const ids = Array.from(TOOL_CATALOG_IDS);
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await run(`DELETE FROM role_tool_access WHERE tool_id NOT IN (${placeholders})`, ids);
}

function defaultRoleToolAccess(role, toolId) {
  // Latest request: allow ALL tools for ALL roles (so every tool icon shows up).
  return true;
}

async function seedRoleToolAccessIfMissing() {
  const now = nowIso();
  for (const role of ROLES) {
    for (const tool of TOOL_CATALOG) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await get(
        `SELECT role, tool_id FROM role_tool_access WHERE role = ? AND tool_id = ?`,
        [role, tool.id]
      );
      if (existing) continue;
      // eslint-disable-next-line no-await-in-loop
      await run(
        `INSERT INTO role_tool_access(role, tool_id, can_access, updated_at) VALUES (?,?,?,?)`,
        [role, tool.id, defaultRoleToolAccess(role, tool.id) ? 1 : 0, now]
      );
    }
  }
}

async function seedManualLeaveRemainingFromMap() {
  const now = nowIso();
  const map = {
    SG1: 2,
    NV301: 0,
    NV5: 2,
    NV199: 1,
    NV326: 0,
    NV255: 2,
    NV309: 0,
    NV361: 0,
    NV335: 0,
    NV261: 0,
    NV275: 2,
    NV363: 0,
    NV27: 6,
    NV264: 2,
    NV359: 0,
    NV360: 0,
    NV9: 2,
    NV356: 0,
    NV236: 3,
    NV20: 2,
    NV14: 0,
    NV22: 2.5,
    NV353: 0,
    NV358: 0,
    NV34: 2,
    NV37: 2,
    NV36: 1,
    NV40: 0,
    NV44: 0,
    NV215: 0,
    NV47: 2,
    NV50: 1,
    NV48: 1,
    NV232: 2,
    NV52: 1,
    NV55: 0,
    NV56: 0,
    NV57: 1,
    NV59: 0,
    NV65: 0,
    NV53: 1,
    NV54: 0,
    NV69: 2,
    NV66: 0,
    NV296: 2,
    NV302: 3,
    NV312: 0,
    NV253: 2,
    NV366: 0,
    NV318: 2,
    NV92: 5,
    NV346: 2,
    NV119: 0,
    NV117: 0,
    NV290: 1,
    NV88: 1,
    NV265: 6,
    NV267: 2,
    NV268: 1,
    NV328: 2,
    NV364: 0,
    NV343: 0,
    NV104: 0,
    NV100: 1,
    NV105: 3,
    NV107: 2,
    NV111: 0,
    NV130: 0,
    NV168: 0,
    NV192: 2,
    NV310: 3,
    NV331: 1,
    NV101: 3,
    NV327: 2
  };
  const codes = Object.keys(map);
  if (!codes.length) return;
  for (const code of codes) {
    const value = Number(map[code] || 0);
    // eslint-disable-next-line no-await-in-loop
    await run(
      `UPDATE users SET manual_leave_remaining = ?, updated_at = ? WHERE employee_code = ?`,
      [value, now, code]
    );
  }
}

function parseSmartdogAccounts() {
  const raw = String(process.env.SMARTDOG_ACCOUNTS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [username, password] = part.split(":");
      return {
        username: String(username || "").trim(),
        password: String(password || "").trim()
      };
    })
    .filter((item) => item.username && item.password);
}

async function createUserIfMissing(payload) {
  const existing = await get(`SELECT id FROM users WHERE username = ?`, [payload.username]);
  if (existing) return;
  const timestamp = nowIso();
  await run(
    `INSERT INTO users(
       id, username, password_hash, role, full_name, avatar_url,
       gender, company_level, department, work_schedule,
       tool_meta_json,
       strengths, weaknesses, hobbies, address, phone,
       is_active, created_at, updated_at,
       employee_code, organization_unit_id, organization_unit_name,
       job_position_id, job_position_name, shift_code, employee_status_id, misa_synced_at
     )
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.id,
      payload.username,
      hashPassword(payload.password),
      normalizeRole(payload.role),
      payload.fullName || payload.username,
      payload.avatarUrl || "",
      payload.gender || "",
      payload.companyLevel || "",
      payload.department || "",
      payload.workSchedule || "",
      "{}",
      payload.strengths || "",
      payload.weaknesses || "",
      payload.hobbies || "",
      payload.address || "",
      payload.phone || "",
      1,
      timestamp,
      timestamp,
      payload.employeeCode || "",
      parseOptionalInt(payload.organizationUnitId),
      payload.organizationUnitName || "",
      payload.jobPositionId || "",
      payload.jobPositionName || "",
      payload.shiftCode || "",
      parseOptionalInt(payload.employeeStatusId),
      payload.misaSyncedAt || null
    ]
  );
}

async function seedDefaultUsers() {
  const adminUsername = String(process.env.SMARTDOG_ADMIN_USERNAME || "admin").trim() || "admin";
  const adminPassword = String(process.env.SMARTDOG_ADMIN_PASSWORD || process.env.CHATBOT_UNLOCK_PASSWORD || "123123aA@").trim();
  await createUserIfMissing({
    id: crypto.randomUUID(),
    username: adminUsername,
    password: adminPassword,
    role: "admin",
    fullName: "System Administrator"
  });

  const accountSeeds = parseSmartdogAccounts();
  // Seed existing known accounts as member users.
  for (const item of accountSeeds) {
    // eslint-disable-next-line no-await-in-loop
    await createUserIfMissing({
      id: crypto.randomUUID(),
      username: item.username,
      password: item.password,
      role: "member",
      fullName: item.username
    });
  }
}

async function authenticate(username, password) {
  const row = await get(
    `SELECT * FROM users WHERE username = ? AND is_active = 1`,
    [String(username || "").trim()]
  );
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return row;
}

async function createSession(user, meta = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await run(
    `INSERT INTO sessions(token_hash, user_id, created_at, expires_at, ip, user_agent)
     VALUES (?,?,?,?,?,?)`,
    [
      tokenHash,
      user.id,
      createdAt,
      expiresAt,
      String(meta.ip || ""),
      String(meta.userAgent || "")
    ]
  );
  await run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, [createdAt, createdAt, user.id]);
  return token;
}

async function getUserBySessionToken(token) {
  const tokenHash = hashSessionToken(token);
  const row = await get(
    `SELECT u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND u.is_active = 1`,
    [tokenHash, nowIso()]
  );
  return sanitizeUser(row);
}

async function revokeSession(token) {
  const tokenHash = hashSessionToken(token);
  await run(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ?`, [nowIso(), tokenHash]);
}

async function listUsers() {
  await applyOtLateMonthlyRollover();
  const rows = await all(`SELECT * FROM users ORDER BY created_at DESC`);
  return rows.map(sanitizeUser);
}

function validateNewUserPayload(payload) {
  const username = String(payload?.username || "").trim();
  const password = String(payload?.password || "").trim();
  const role = normalizeRole(payload?.role);
  if (!username) throw new Error("username is required");
  if (username.length < 3) throw new Error("username must be at least 3 chars");
  if (!password || password.length < 8) throw new Error("password must be at least 8 chars");
  return {
    id: String(payload?.id || "").trim() || crypto.randomUUID(),
    username,
    password,
    role,
    fullName: String(payload?.fullName || "").trim(),
    avatarUrl: String(payload?.avatarUrl || "").trim(),
    gender: String(payload?.gender || "").trim(),
    companyLevel: String(payload?.companyLevel || "").trim(),
    department: String(payload?.department || "").trim(),
    workSchedule: String(payload?.workSchedule || "").trim(),
    strengths: String(payload?.strengths || "").trim(),
    weaknesses: String(payload?.weaknesses || "").trim(),
    hobbies: String(payload?.hobbies || "").trim(),
    address: String(payload?.address || "").trim(),
    phone: String(payload?.phone || "").trim(),
    employeeCode: String(payload?.employeeCode || "").trim(),
    organizationUnitId: payload?.organizationUnitId,
    organizationUnitName: String(payload?.organizationUnitName || "").trim(),
    jobPositionId: String(payload?.jobPositionId || "").trim(),
    jobPositionName: String(payload?.jobPositionName || "").trim(),
    shiftCode: String(payload?.shiftCode || "").trim(),
    employeeStatusId: payload?.employeeStatusId,
    misaSyncedAt: String(payload?.misaSyncedAt || "").trim() || null
  };
}

async function createUser(payload) {
  const next = validateNewUserPayload(payload);
  await createUserIfMissing(next);
  const row = await get(`SELECT * FROM users WHERE username = ?`, [next.username]);
  return sanitizeUser(row);
}

function numOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function updateUser(userId, payload = {}) {
  await applyOtLateMonthlyRollover();
  const user = await get(`SELECT * FROM users WHERE id = ?`, [String(userId || "")]);
  if (!user) throw new Error("User not found");
  const now = nowIso();
  const role = payload.role ? normalizeRole(payload.role) : user.role;
  const currentMonthKey = monthKeyFromDate();
  const monthlyHistory = parseOtLateMonthlyJson(user.ot_late_monthly_json);
  const currentMonthlyEntry = normalizeOtLateMonthEntry(
    monthlyHistory[currentMonthKey],
    parseOptionalNumber(user.manual_overtime_minutes_remaining) ?? 0
  );
  if (payload.overtimeMinutesThisMonth !== undefined) {
    const n = parseOptionalNumber(payload.overtimeMinutesThisMonth);
    currentMonthlyEntry.overtimeMinutesThisMonth = n ?? 0;
  }
  if (payload.lateEarlyMinutesThisMonth !== undefined) {
    const n = parseOptionalNumber(payload.lateEarlyMinutesThisMonth);
    currentMonthlyEntry.lateEarlyMinutesThisMonth = n ?? 0;
  }
  monthlyHistory[currentMonthKey] = currentMonthlyEntry;
  const updates = {
    role,
    full_name: payload.fullName !== undefined ? String(payload.fullName || "").trim() : user.full_name,
    avatar_url: payload.avatarUrl !== undefined ? String(payload.avatarUrl || "").trim() : user.avatar_url,
    gender: payload.gender !== undefined ? String(payload.gender || "").trim() : user.gender,
    company_level: payload.companyLevel !== undefined ? String(payload.companyLevel || "").trim() : user.company_level,
    department: payload.department !== undefined ? String(payload.department || "").trim() : user.department,
    work_schedule: payload.workSchedule !== undefined ? String(payload.workSchedule || "").trim() : user.work_schedule,
    tool_meta_json: user.tool_meta_json || "{}",
    strengths: payload.strengths !== undefined ? String(payload.strengths || "").trim() : user.strengths,
    weaknesses: payload.weaknesses !== undefined ? String(payload.weaknesses || "").trim() : user.weaknesses,
    hobbies: payload.hobbies !== undefined ? String(payload.hobbies || "").trim() : user.hobbies,
    address: payload.address !== undefined ? String(payload.address || "").trim() : user.address,
    phone: payload.phone !== undefined ? String(payload.phone || "").trim() : user.phone,
    employee_code: payload.employeeCode !== undefined ? String(payload.employeeCode || "").trim() : user.employee_code,
    organization_unit_id:
      payload.organizationUnitId !== undefined ? numOrNull(payload.organizationUnitId) : user.organization_unit_id,
    organization_unit_name:
      payload.organizationUnitName !== undefined
        ? String(payload.organizationUnitName || "").trim()
        : user.organization_unit_name,
    job_position_id: payload.jobPositionId !== undefined ? String(payload.jobPositionId || "").trim() : user.job_position_id,
    job_position_name:
      payload.jobPositionName !== undefined ? String(payload.jobPositionName || "").trim() : user.job_position_name,
    shift_code: payload.shiftCode !== undefined ? String(payload.shiftCode || "").trim() : user.shift_code,
    employee_status_id:
      payload.employeeStatusId !== undefined ? numOrNull(payload.employeeStatusId) : user.employee_status_id,
    manual_leave_remaining:
      payload.leaveRemaining !== undefined && payload.leaveRemaining !== null && payload.leaveRemaining !== ""
        ? Number(payload.leaveRemaining)
        : user.manual_leave_remaining,
    manual_overtime_minutes_remaining:
      payload.overtimeMinutesRemaining !== undefined &&
      payload.overtimeMinutesRemaining !== null &&
      payload.overtimeMinutesRemaining !== ""
        ? Number(payload.overtimeMinutesRemaining)
        : user.manual_overtime_minutes_remaining,
    manual_late_early_minutes_last_month:
      payload.lateEarlyMinutesLastMonth !== undefined &&
      payload.lateEarlyMinutesLastMonth !== null &&
      payload.lateEarlyMinutesLastMonth !== ""
        ? Number(payload.lateEarlyMinutesLastMonth)
        : user.manual_late_early_minutes_last_month,
    ot_late_monthly_json: JSON.stringify(monthlyHistory),
    ot_late_rollover_month_key: currentMonthKey,
    misa_synced_at: payload.misaSyncedAt !== undefined ? String(payload.misaSyncedAt || "").trim() : user.misa_synced_at,
    facebook_id: payload.facebookId !== undefined ? String(payload.facebookId || "").trim() : user.facebook_id,
    zalo_user_id: payload.zaloUserId !== undefined ? String(payload.zaloUserId || "").trim() : user.zalo_user_id,
    is_active: payload.isActive === undefined ? user.is_active : payload.isActive ? 1 : 0,
    updated_at: now
  };
  let passwordHash = user.password_hash;
  if (payload.password !== undefined) {
    const rawPassword = String(payload.password || "").trim();
    if (rawPassword.length < 8) throw new Error("password must be at least 8 chars");
    passwordHash = hashPassword(rawPassword);
  }
  await run(
    `UPDATE users
     SET role = ?, full_name = ?, avatar_url = ?,
         gender = ?, company_level = ?, department = ?, work_schedule = ?,
         strengths = ?, weaknesses = ?, hobbies = ?, address = ?, phone = ?,
         employee_code = ?, organization_unit_id = ?, organization_unit_name = ?,
         job_position_id = ?, job_position_name = ?, shift_code = ?, employee_status_id = ?,
         misa_synced_at = ?, manual_leave_remaining = ?, manual_overtime_minutes_remaining = ?, manual_late_early_minutes_last_month = ?,
         ot_late_monthly_json = ?, ot_late_rollover_month_key = ?,
         facebook_id = ?, zalo_user_id = ?,
         is_active = ?, updated_at = ?, password_hash = ?
     WHERE id = ?`,
    [
      updates.role,
      updates.full_name,
      updates.avatar_url,
      updates.gender,
      updates.company_level,
      updates.department,
      updates.work_schedule,
      updates.strengths,
      updates.weaknesses,
      updates.hobbies,
      updates.address,
      updates.phone,
      updates.employee_code,
      updates.organization_unit_id,
      updates.organization_unit_name,
      updates.job_position_id,
      updates.job_position_name,
      updates.shift_code,
      updates.employee_status_id,
      updates.misa_synced_at,
      updates.manual_leave_remaining,
      updates.manual_overtime_minutes_remaining,
      updates.manual_late_early_minutes_last_month,
      updates.ot_late_monthly_json,
      updates.ot_late_rollover_month_key,
      updates.facebook_id,
      updates.zalo_user_id,
      updates.is_active,
      updates.updated_at,
      passwordHash,
      user.id
    ]
  );
  const updated = await get(`SELECT * FROM users WHERE id = ?`, [user.id]);
  if (payload.leaveRemaining !== undefined && String(updated.zalo_user_id || "").trim()) {
    const o = user.manual_leave_remaining != null && user.manual_leave_remaining !== "" ? Number(user.manual_leave_remaining) : 0;
    const n = updated.manual_leave_remaining != null && updated.manual_leave_remaining !== "" ? Number(updated.manual_leave_remaining) : 0;
    if (o !== n) {
      setImmediate(() => {
        sendZaloLeaveRemainingChangedIfNeeded(
          updated.zalo_user_id,
          String(updated.full_name || updated.username || "").trim(),
          user.manual_leave_remaining,
          updated.manual_leave_remaining
        ).catch(() => {});
      });
    }
  }
  return sanitizeUser(updated);
}

function safeParseJsonObject(raw, fallback = {}) {
  try {
    const obj = JSON.parse(String(raw || "{}"));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return fallback;
    return obj;
  } catch (_) {
    return fallback;
  }
}

async function getUserToolMeta(userId) {
  const row = await get(`SELECT tool_meta_json FROM users WHERE id = ?`, [String(userId || "")]);
  return safeParseJsonObject(row?.tool_meta_json, {});
}

async function setUserToolMeta(userId, nextMetaObj) {
  const meta = nextMetaObj && typeof nextMetaObj === "object" && !Array.isArray(nextMetaObj) ? nextMetaObj : {};
  await run(`UPDATE users SET tool_meta_json = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(meta), nowIso(), String(userId || "")]);
  return meta;
}

async function setToolMetaForUser(userId, toolId, value) {
  const toolKey = String(toolId || "").trim();
  if (!toolKey) throw new Error("toolId is required");
  const meta = await getUserToolMeta(userId);
  meta[toolKey] = value ?? null;
  await setUserToolMeta(userId, meta);
  return meta[toolKey];
}

async function deleteUser(userId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("User id is required");
  const user = await get(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!user) throw new Error("User not found");
  // Không xóa bản ghi user trong DB — chỉ hủy session và vô hiệu hóa tài khoản (giữ tool_meta_json).
  await run(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  await run(`UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?`, [nowIso(), id]);
}

async function getAllowedToolIdsForRole(role) {
  const rows = await all(
    `SELECT tool_id FROM role_tool_access WHERE role = ? AND can_access = 1 ORDER BY tool_id ASC`,
    [normalizeRole(role)]
  );
  return rows.map((r) => r.tool_id).filter((id) => TOOL_CATALOG_IDS.has(id));
}

const { createMisaSync } = require("../../user-admin/server/misaEmployeeSync");
const syncEmployeesFromMisa = createMisaSync({ run, get, hashPassword, nowIso });

async function listRoleToolAccess() {
  const rows = await all(
    `SELECT role, tool_id, can_access FROM role_tool_access ORDER BY role ASC, tool_id ASC`
  );
  const out = {};
  ROLES.forEach((r) => {
    out[r] = {};
  });
  rows.forEach((row) => {
    if (!out[row.role]) out[row.role] = {};
    out[row.role][row.tool_id] = Boolean(row.can_access);
  });
  return out;
}

async function setRoleToolAccess(role, toolIds = []) {
  const nextRole = normalizeRole(role);
  const normalizedSet = new Set((Array.isArray(toolIds) ? toolIds : []).map((x) => String(x || "").trim()));
  const now = nowIso();
  for (const tool of TOOL_CATALOG) {
    // eslint-disable-next-line no-await-in-loop
    await run(
      `UPDATE role_tool_access SET can_access = ?, updated_at = ? WHERE role = ? AND tool_id = ?`,
      [normalizedSet.has(tool.id) ? 1 : 0, now, nextRole, tool.id]
    );
  }
}

module.exports = {
  ROLES,
  TOOL_CATALOG,
  initAuthSchema,
  seedDefaultUsers,
  authenticate,
  createSession,
  getUserBySessionToken,
  revokeSession,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllowedToolIdsForRole,
  listRoleToolAccess,
  setRoleToolAccess,
  getUserToolMeta,
  setUserToolMeta,
  setToolMetaForUser,
  syncEmployeesFromMisa,
  startLeaveMisaAccrualSchedulers
};
