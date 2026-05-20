const API = "/api/windowsshell/auth";
const USER_ADMIN_API = "/api/user-admin";
const TOKEN_API = "/api/admin";
/** Public Simly proxy (tokens, appointment) — không qua /api/admin */
const PUBLIC_SIMLY_API = "/api/public";
const UA_PUBLIC_API_BASE_KEY = "ua_public_api_base";

const userRowsEl = document.getElementById("userRows");
const dialog = document.getElementById("userDialog");
const form = document.getElementById("userForm");
const dialogTitle = document.getElementById("dialogTitle");
const btnRefresh = document.getElementById("btnRefresh");
const btnMisaSync = document.getElementById("btnMisaSync");
const btnAdd = document.getElementById("btnAdd");
const userDetailDialog = document.getElementById("userDetailDialog");
const userDetailPre = document.getElementById("userDetailPre");
const btnDetailClose = document.getElementById("btnDetailClose");
const btnCancel = document.getElementById("btnCancel");
const searchInput = document.getElementById("searchInput");
const tabButtons = Array.from(document.querySelectorAll(".ua-tab"));
const tabPanels = Array.from(document.querySelectorAll(".ua-tab-panel"));
const roleAccessRole = document.getElementById("roleAccessRole");
const roleToolGrid = document.getElementById("roleToolGrid");
const btnSaveRoleTools = document.getElementById("btnSaveRoleTools");
const roleToolSearch = document.getElementById("roleToolSearch");
const roleToolSummary = document.getElementById("roleToolSummary");
const btnRoleToolsSelectAll = document.getElementById("btnRoleToolsSelectAll");
const btnRoleToolsClearAll = document.getElementById("btnRoleToolsClearAll");
const btnTokenRefreshAll = document.getElementById("btnTokenRefreshAll");
const btnTokenReload = document.getElementById("btnTokenReload");
const btnTokenServiceToggle = document.getElementById("btnTokenServiceToggle");
const tokenStatusText = document.getElementById("tokenStatusText");
const tokenOfficeGrid = document.getElementById("tokenOfficeGrid");
// Commission Settings UI has been moved to a dedicated tool: /commission-settings

const fields = {
  id: document.getElementById("userId"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  role: document.getElementById("role"),
  fullName: document.getElementById("fullName"),
  companyLevel: document.getElementById("companyLevel"),
  department: document.getElementById("department"),
  workSchedule: document.getElementById("workSchedule"),
  avatarUrl: document.getElementById("avatarUrl"),
  gender: document.getElementById("gender"),
  phone: document.getElementById("phone"),
  address: document.getElementById("address"),
  strengths: document.getElementById("strengths"),
  weaknesses: document.getElementById("weaknesses"),
  hobbies: document.getElementById("hobbies"),
  employeeCode: document.getElementById("employeeCode"),
  organizationUnitId: document.getElementById("organizationUnitId"),
  organizationUnitName: document.getElementById("organizationUnitName"),
  jobPositionId: document.getElementById("jobPositionId"),
  jobPositionName: document.getElementById("jobPositionName"),
  shiftCode: document.getElementById("shiftCode"),
  employeeStatusId: document.getElementById("employeeStatusId"),
  misaSyncedAt: document.getElementById("misaSyncedAt"),
  leaveRemaining: document.getElementById("leaveRemaining"),
  overtimeMinutesRemaining: document.getElementById("overtimeMinutesRemaining"),
  lateEarlyMinutesLastMonth: document.getElementById("lateEarlyMinutesLastMonth"),
  overtimeMinutesThisMonth: document.getElementById("overtimeMinutesThisMonth"),
  lateEarlyMinutesThisMonth: document.getElementById("lateEarlyMinutesThisMonth"),
  isActive: document.getElementById("isActive"),
  facebookId: document.getElementById("facebookId"),
  zaloUserId: document.getElementById("zaloUserId")
};

let users = [];
let currentMe = null;
let roleToolAccessPayload = {
  roles: [],
  tools: [],
  permissions: {}
};
let tokenOfficeItems = [];
let tokenCountdownTimer = null;
let tokenServiceEnabled = true;
const leaveRowsEl = document.getElementById("leaveRows");
const btnTestPublicTokens = document.getElementById("btnTestPublicTokens");
const publicTokensResult = document.getElementById("publicTokensResult");
const btnTestPublicAppointment = document.getElementById("btnTestPublicAppointment");
const publicAppointmentResult = document.getElementById("publicAppointmentResult");

/** Giống `ICON` trong `public/main.js` — để bảng Role Tool hiển thị icon trùng desktop. */
const ROLE_TOOL_ICON_SVG = {
  crmtester: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5.2" y="6" width="21.6" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 11h13.6M9.2 15.2h9.2M9.2 19.4h11.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="23.8" cy="19.3" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M25.6 21.1 28 23.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  giftbag: '<svg viewBox="0 0 32 32" class="tool-svg"><circle cx="12.4" cy="8.5" r="3.2" fill="currentColor"/><path d="M6.9 25.8c.5-4.2 2.8-7 5.8-7 3.1 0 5.4 2.8 5.8 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M18.4 16.4 23.8 13l2.5 4.2-4.8 2.9 2 3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21.5 24.9h4.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  mycomputer: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5" y="6" width="22" height="15" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="11.5" y="22.3" width="9" height="2.2" rx="1.1" fill="currentColor"/><path d="M15.5 9.8h3M10.2 13.3h11.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  fileexplorer: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M4.8 9.2a2.2 2.2 0 0 1 2.2-2.2h6l1.8 2.1h10.2a2.2 2.2 0 0 1 2.2 2.2v10.6a2.2 2.2 0 0 1-2.2 2.2H7a2.2 2.2 0 0 1-2.2-2.2V9.2Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.8 13.1h20.4" stroke="currentColor" stroke-width="1.3" opacity="0.8"/></svg>',
  commission: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="8" width="20" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 21l10-10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><text x="16" y="19.7" text-anchor="middle" font-size="9" font-weight="900" font-family="Arial, Helvetica, sans-serif" fill="currentColor">%</text></svg>',
  'commission-settings': '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5.5" y="6.4" width="21" height="19.2" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 12h12M10 16h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20.2 18.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20.2 19.6v4M18.6 21.6h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  itsupport: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="6" width="20" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 10.8h10M11 15.2h6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M19.4 19.2 22 16.6l3.2 3.2-2.6 2.6-3.2-3.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M18.6 20l-2.9 2.9c-.6.6-1.6.6-2.2 0l-2.5-2.5c-.6-.6-.6-1.6 0-2.2L13.9 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  json: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="4.8" width="20" height="22.4" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M10.2 10.2c-1.6 1.2-2.4 2.8-2.4 4.7 0 1.9.8 3.5 2.4 4.7M21.8 10.2c1.6 1.2 2.4 2.8 2.4 4.7 0 1.9-.8 3.5-2.4 4.7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M13 10.7h6M13 14.8h6M13 18.9h4.2" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><circle cx="20.9" cy="22.1" r="1.4" fill="currentColor"/><circle cx="16" cy="22.1" r="1" fill="currentColor" opacity="0.7"/></svg>',
  color: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M16 5c-5.8 0-10.5 4.3-10.5 9.7 0 4 2.9 7.3 6.9 8.6 1.4.5 2.1-.2 2.1-1.2v-1.3c0-1 .7-1.8 1.7-1.8h2.2c4.4 0 8.1-3.2 8.1-7.7C26.5 8.2 21.8 5 16 5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="11" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="10.5" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="20" cy="12.5" r="1.3" fill="currentColor" opacity="0.7"/></svg>',
  base64: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.8" y="6.5" width="9.8" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="17.4" y="6.5" width="9.8" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.3 12h4.8M7.3 16h4.8M7.3 20h4.8" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M20 12.2h4.6M20 16h4.6M20 19.8h4.6" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M14.8 16h2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15.8 14.8 17.4 16l-1.6 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  qr: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4" y="4" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="7" width="3" height="3" fill="currentColor"/><rect x="19" y="4" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="22" y="7" width="3" height="3" fill="currentColor"/><rect x="4" y="19" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="22" width="3" height="3" fill="currentColor"/><rect x="19" y="19" width="3" height="3" fill="currentColor"/><rect x="24" y="19" width="4" height="4" fill="currentColor"/><rect x="21" y="24" width="7" height="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  gradient: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="6" width="20" height="20" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 21.5 13 16l4 3.5 7.5-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="16" r="1.4" fill="currentColor"/><circle cx="17" cy="19.5" r="1.2" fill="currentColor" opacity="0.75"/><circle cx="24.5" cy="11.5" r="1.2" fill="currentColor" opacity="0.55"/></svg>',
  hash: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M12 6 9 26M23 6l-3 20M6 12h20M5 20h20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  regex: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M8 9l6 7-6 7M18 9h6M18 16h6M18 23h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="16" r="1.6" fill="currentColor"/></svg>',
  tinypng: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5.5" y="4.8" width="21" height="22.4" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.85"/><path d="M9.2 21.2 13.4 16l3.3 3.5 4-5.1 2.1 2.8" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.1" cy="11.3" r="1.4" fill="currentColor"/><path d="M18.8 8.8h5.5M18.8 11.5h5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/><path d="M7.8 25.2h16.4" stroke="currentColor" stroke-width="1.25" opacity="0.45" stroke-linecap="round"/></svg>',
  uuid: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.5" y="9" width="23" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 13h2M14 13h2M20 13h3M9 17h4M16 17h2M21 17h2M9 21h3M14 21h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  jsonmodel: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.8" y="7" width="10.4" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><rect x="16.8" y="7" width="10.4" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M7.5 12.2h5M7.5 16h5M7.5 19.8h3.7" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M19.8 12.3h4.3M19.8 15.9h4.3M19.8 19.5h4.3" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M14.8 16h2.2M16.2 14.8 17.6 16l-1.4 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  date: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="8" width="20" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><line x1="6" y1="13.5" x2="26" y2="13.5" stroke="currentColor" stroke-width="2"/><line x1="11" y1="6" x2="11" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="6" x2="21" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="11.5" cy="18.5" r="1.1" fill="currentColor"/><circle cx="16" cy="18.5" r="1.1" fill="currentColor"/><circle cx="20.5" cy="18.5" r="1.1" fill="currentColor"/><circle cx="11.5" cy="22.5" r="1.1" fill="currentColor"/><circle cx="16" cy="22.5" r="1.1" fill="currentColor"/></svg>',
  palette: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="6" width="8" height="8" rx="2" fill="currentColor"/><rect x="18" y="6" width="8" height="8" rx="2" fill="currentColor" opacity="0.75"/><rect x="6" y="18" width="8" height="8" rx="2" fill="currentColor" opacity="0.6"/><rect x="18" y="18" width="8" height="8" rx="2" fill="currentColor" opacity="0.9"/><path d="M4.5 16h23" stroke="currentColor" stroke-width="1.2" opacity="0.35"/></svg>',
  resizer: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.8" y="8.2" width="10.8" height="15.6" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="17.2" y="6.4" width="10.2" height="19.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14.8 16h2.6M15.8 14.8 17.4 16l-1.6 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  base64img: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.7" y="6.3" width="10.2" height="19.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M6.8 20.6 9.6 17l2.2 2.3 1.8-2.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="12.3" r="1.1" fill="currentColor"/><rect x="17.2" y="6.3" width="10.2" height="19.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M19.5 12.2h5.8M19.5 16h5.8M19.5 19.8h5.8" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/><path d="M14.9 16h2.3M16.2 14.8 17.6 16l-1.4 1.2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  singaeassistant: '<span class="singae-lottie-icon" data-singae-lottie="1"><div data-singae-lottie-canvas="1"></div></span>',
  chatgptvipaccess: '<svg viewBox="0 0 24 24" class="tool-svg"><path d="M22 12.1a4.7 4.7 0 0 0-6.4-4.4A4.7 4.7 0 0 0 7.5 4 4.7 4.7 0 0 0 2.7 8.7a4.7 4.7 0 0 0 1.7 9A4.7 4.7 0 0 0 8.4 22a4.7 4.7 0 0 0 7.9-1.7A4.7 4.7 0 0 0 22 12.1Z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><path d="m8 7.9 4-2.3 4 2.3v4.5l-4 2.3-4-2.3Zm0 8.2 4 2.3 4-2.3" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  singaelookup: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M5.2 15.8c1.4-3.8 4.8-6.5 9.2-7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M26.8 16.2c-1.4 3.8-4.8 6.5-9.2 7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.1 17.8c.2-2.7 2.4-4.9 5.2-4.9 1.6 0 3 .7 4 1.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14.9 14.9h4.2M14.9 17.1h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><text x="16" y="28.4" text-anchor="middle" font-size="6.2" font-weight="900" letter-spacing=".35" font-family="Arial, Helvetica, sans-serif" fill="currentColor">GETFLY</text></svg>',
  realtimeconsole: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5.5" y="6" width="21" height="20" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.8 12.3 13.7 16l-3.9 3.8M17.2 19.8h5.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  getflydownloader: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="6" y="6.2" width="20" height="19.6" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 9.8v10.2M12.2 16.4 16 20.2l3.8-3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.2 23.6h11.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  crmadmin: '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="5.2" y="6" width="21.6" height="20" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="11.2" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.4 18.6c.4-1.8 1.7-3 3.2-3 1.6 0 2.9 1.2 3.2 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M18 11h8M18 15h8M18 19h5.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  useradmin: '<svg viewBox="0 0 32 32" class="tool-svg"><circle cx="12" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.8 23.5c.8-3.1 3.5-5.3 6.8-5.3 3.3 0 6 2.2 6.8 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="20.2" y="16.7" width="6.8" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M23.6 14.6v2.1M23.6 23.5v2.1M19.9 20.1h2.1M25.2 20.1h2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  payrollcalculator: '<svg viewBox="0 0 32 32" class="tool-svg" aria-hidden="true"><rect x="5.5" y="7" width="21" height="18.5" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M10.5 5.8v4M21.5 5.8v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 12.2h17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="19.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 17.2v2.6l1.6 0.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.5 16h3M9.5 19h2.5M19.5 22h3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/></svg>',
  chatbot: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M5.6 16.9 25.9 8.5c.9-.4 1.8.5 1.5 1.4l-5.3 15.7c-.3.9-1.5 1.2-2.2.6l-5.6-4.8-3.6 3c-.7.6-1.8.1-1.7-.9l.5-5.1-3.8-1c-1-.2-1.1-1.6-.1-2.1Z" fill="currentColor"/><path d="M10.8 18.4 24.4 10.7M14.2 21.3l2.3 2" stroke="#06080d" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/></svg>',
  dbviewer: '<svg viewBox="0 0 32 32" class="tool-svg"><ellipse cx="16" cy="8.5" rx="8.5" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 8.5v9.8c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 13.2c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".85"/><path d="M10.2 24.5h11.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".75"/></svg>',
  'ai-manager': '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.5" y="6.2" width="23" height="19.6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 12h13.6M9.2 17h9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="21.8" cy="17" r="2.4" fill="currentColor"/><path d="M21.8 13.8v6.4" stroke="#06080d" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/><path d="M18.6 17h6.4" stroke="#06080d" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/></svg>'
};

function getRoleToolIconHtml(toolId) {
  const id = String(toolId || "");
  if (ROLE_TOOL_ICON_SVG[id]) return ROLE_TOOL_ICON_SVG[id];
  const letter = (id.slice(0, 1) || "?").toUpperCase();
  return `<span class="ua-role-tool-fallback" aria-hidden="true">${letter}</span>`;
}

function getRoleToolSearchQuery() {
  return String(roleToolSearch?.value || "").trim().toLowerCase();
}

function roleToolMatchesSearch(tool, q) {
  if (!q) return true;
  const title = String(tool.title || "").toLowerCase();
  const id = String(tool.id || "").toLowerCase();
  return title.includes(q) || id.includes(q);
}

function updateRoleToolSummary(selectedRole, roleMap) {
  if (!roleToolSummary) return;
  const total = roleToolAccessPayload.tools?.length || 0;
  let checked = 0;
  const base =
    selectedRole && roleToolAccessPayload.permissions?.[selectedRole]
      ? roleToolAccessPayload.permissions[selectedRole]
      : {};
  const merged =
    roleMap && typeof roleMap === "object" ? { ...base, ...roleMap } : { ...base };
  if (roleMap && typeof roleMap === "object") {
    roleToolAccessPayload.tools.forEach((tool) => {
      const toolId = String(tool.id || "");
      if (toolId && merged[toolId]) checked += 1;
    });
  } else if (roleToolGrid) {
    checked = roleToolGrid.querySelectorAll("input[type='checkbox']:checked").length;
  }
  const roleLabel = selectedRole ? ` (${selectedRole})` : "";
  roleToolSummary.textContent = total ? `${checked} / ${total} tool được bật${roleLabel}` : "";
}

function setAllRoleToolCheckboxes(checked) {
  roleToolGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    if (!input.disabled) input.checked = checked;
  });
  const selectedRole = String(roleAccessRole.value || roleToolAccessPayload.roles[0] || "");
  updateRoleToolSummary(selectedRole, buildRolePermissionMapFromGrid());
}

function buildRolePermissionMapFromGrid() {
  const map = {};
  roleToolGrid.querySelectorAll("input[type='checkbox'][data-tool-id]").forEach((input) => {
    const id = String(input.dataset.toolId || "").trim();
    if (!id) return;
    map[id] = Boolean(input.checked);
  });
  return map;
}

async function api(path, opts = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function tokenApi(path, opts = {}) {
  const response = await fetch(`${TOKEN_API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Token API request failed");
  return payload;
}

function buildPublicSimlyUrl(pathWithQuery) {
  const raw = String(document.getElementById("publicApiBaseUrl")?.value || "")
    .trim()
    .replace(/\/$/, "");
  const pq = String(pathWithQuery || "").replace(/^\//, "");
  if (!raw) return `${PUBLIC_SIMLY_API}/${pq}`;
  return `${raw}/api/public/${pq}`;
}

async function fetchPublicSimlyDisplay(url) {
  let sameOrigin = true;
  try {
    sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
  } catch (_) {
    sameOrigin = true;
  }
  const res = await fetch(url, {
    credentials: sameOrigin ? "include" : "omit",
    mode: "cors"
  });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch (_) {
    /* giữ nguyên text */
  }
  return `HTTP ${res.status} ${res.statusText}\n\n${body}`;
}

async function testPublicTokens() {
  if (!publicTokensResult) return;
  publicTokensResult.textContent = "Đang gọi…";
  try {
    publicTokensResult.textContent = await fetchPublicSimlyDisplay(buildPublicSimlyUrl("tokens"));
  } catch (e) {
    publicTokensResult.textContent = String(e?.message || e);
  }
}

async function testPublicAppointment() {
  if (!publicAppointmentResult) return;
  const office = String(document.getElementById("publicApptOffice")?.value || "25VNP").trim();
  const search = String(document.getElementById("publicApptSearch")?.value || "").trim();
  const page = String(document.getElementById("publicApptPage")?.value || "1").trim();
  const pageSize = String(document.getElementById("publicApptPageSize")?.value || "100").trim();
  const q = new URLSearchParams({ office, search, page, pageSize });
  publicAppointmentResult.textContent = "Đang gọi…";
  try {
    publicAppointmentResult.textContent = await fetchPublicSimlyDisplay(buildPublicSimlyUrl(`appointment?${q.toString()}`));
  } catch (e) {
    publicAppointmentResult.textContent = String(e?.message || e);
  }
}

function initPublicApiBaseField() {
  const el = document.getElementById("publicApiBaseUrl");
  if (!el) return;
  try {
    const v = localStorage.getItem(UA_PUBLIC_API_BASE_KEY);
    if (v) el.value = v;
    else if (!String(el.value || "").trim()) el.value = "https://singae.cloud";
  } catch (_) {
    if (!String(el.value || "").trim()) el.value = "https://singae.cloud";
  }
  el.addEventListener("change", () => {
    try {
      localStorage.setItem(UA_PUBLIC_API_BASE_KEY, String(el.value || "").trim());
    } catch (_) {}
  });
}

function normalizeRole(role) {
  const order = ["user", "member", "leader", "manager", "admin"];
  const r = String(role || "member");
  const current = order.indexOf(r);
  return { order, current: current === -1 ? order.indexOf("member") : current };
}

function roleRank(role) {
  return { user: 1, member: 2, leader: 3, manager: 4, admin: 5 }[String(role || "member")] || 0;
}

function getUiPolicy(role) {
  const r = String(role || "member");
  return {
    canCreate: r === "admin" || r === "manager",
    canEdit: r === "admin" || r === "manager",
    canDelete: r === "admin" || r === "manager",
    canChangeRole: r === "admin" || r === "manager",
    // manager cannot create/promote to admin
    roleMax: r === "admin" ? "admin" : "leader",
    readOnly: r === "leader"
  };
}

function canManageTarget(currentRole, targetRole) {
  return roleRank(currentRole) > roleRank(targetRole);
}

function openTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabId);
  });
  if (tabId === "token-admin") {
    loadTokenOffices().catch((error) => {
      tokenStatusText.textContent = error.message;
    });
  }
}

function formatTtl(ttlSeconds) {
  if (ttlSeconds == null) return "N/A";
  if (ttlSeconds <= 0) return "Expired";
  const s = Number(ttlSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function renderTokenGrid() {
  if (!tokenOfficeGrid) return;
  tokenOfficeGrid.innerHTML = "";
  if (!Array.isArray(tokenOfficeItems) || !tokenOfficeItems.length) {
    tokenOfficeGrid.innerHTML = `<div class="ua-token-empty">No office token data.</div>`;
    return;
  }
  tokenOfficeItems.forEach((office) => {
    const key = String(office.officeKey || "");
    const token = String(office.token || "");
    const maskedToken = token ? `${token.slice(0, 16)}...${token.slice(-8)}` : "(empty)";
    const ttl = Number.isFinite(Number(office.ttlSeconds)) ? Number(office.ttlSeconds) : null;
    const card = document.createElement("article");
    card.className = "ua-token-card";
    card.innerHTML = `
      <div class="ua-token-card-head">
        <h3>${key}</h3>
        <button class="btn btn-primary btn-token-refresh" data-office="${key}" type="button" ${tokenServiceEnabled ? "" : "disabled"}>Refresh now</button>
      </div>
      <div class="ua-token-row"><span>Status</span><strong>${office.hasToken ? "Ready" : "No token"}</strong></div>
      <div class="ua-token-row"><span>TTL</span><strong class="${ttl !== null && ttl < 180 ? "is-warning" : ""}">${formatTtl(ttl)}</strong></div>
      <div class="ua-token-row"><span>Expires At</span><code>${office.expiresAt || "N/A"}</code></div>
      <div class="ua-token-row"><span>Token</span><code title="${token ? token : ""}">${maskedToken}</code></div>
    `;
    tokenOfficeGrid.appendChild(card);
  });
}

function updateTokenToolbarState() {
  if (btnTokenServiceToggle) {
    btnTokenServiceToggle.textContent = tokenServiceEnabled ? "Stop service" : "Start service";
    btnTokenServiceToggle.classList.toggle("btn-primary", !tokenServiceEnabled);
  }
  if (btnTokenRefreshAll) btnTokenRefreshAll.disabled = !tokenServiceEnabled;
}

function startTokenCountdown() {
  if (tokenCountdownTimer) {
    window.clearInterval(tokenCountdownTimer);
    tokenCountdownTimer = null;
  }
  tokenCountdownTimer = window.setInterval(() => {
    tokenOfficeItems = tokenOfficeItems.map((office) => {
      const nextTtl = Number.isFinite(Number(office.ttlSeconds)) ? Math.max(0, Number(office.ttlSeconds) - 1) : office.ttlSeconds;
      return { ...office, ttlSeconds: nextTtl };
    });
    renderTokenGrid();
  }, 1000);
}

async function loadTokenOffices() {
  tokenStatusText.textContent = "Loading token status...";
  const payload = await tokenApi("/offices");
  tokenServiceEnabled = Boolean(payload.tokenServiceEnabled);
  tokenOfficeItems = Array.isArray(payload.items) ? payload.items : [];
  renderTokenGrid();
  updateTokenToolbarState();
  if (tokenServiceEnabled) {
    startTokenCountdown();
  } else if (tokenCountdownTimer) {
    window.clearInterval(tokenCountdownTimer);
    tokenCountdownTimer = null;
  }
  tokenStatusText.textContent = tokenServiceEnabled
    ? `Updated at ${new Date().toLocaleTimeString()}`
    : "Token service is stopped";
}

async function refreshOfficeToken(officeKey) {
  if (!officeKey) return;
  tokenStatusText.textContent = `Refreshing ${officeKey}...`;
  await tokenApi(`/refresh/${encodeURIComponent(officeKey)}`, { method: "POST" });
  await loadTokenOffices();
}

async function refreshAllOfficeTokens() {
  tokenStatusText.textContent = "Refreshing all offices...";
  await tokenApi("/refresh", { method: "POST" });
  await loadTokenOffices();
}

async function toggleTokenService() {
  tokenStatusText.textContent = tokenServiceEnabled ? "Stopping token service..." : "Starting token service...";
  await tokenApi("/service-state", {
    method: "POST",
    body: JSON.stringify({ enabled: !tokenServiceEnabled })
  });
  await loadTokenOffices();
}

function filterUsers(list, keyword) {
  const q = String(keyword || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((u) =>
    [
      u.username,
      u.fullName,
      u.phone,
      u.address,
      u.role,
      u.department,
      u.companyLevel,
      u.employeeCode,
      u.shiftCode,
      u.organizationUnitName,
      u.jobPositionName
    ]
      .map((v) => String(v || "").toLowerCase())
      .some((v) => v.includes(q))
  );
}

function renderRows() {
  const policy = getUiPolicy(currentMe?.role);
  const visibleUsers = filterUsers(users, searchInput?.value || "");
  userRowsEl.innerHTML = "";
  visibleUsers.forEach((u) => {
    const tr = document.createElement("tr");
    const roleMeta = normalizeRole(u.role);
    const canManage = canManageTarget(currentMe?.role, u.role) && currentMe?.id !== u.id;
    const canPromote =
      policy.canChangeRole &&
      canManage &&
      roleMeta.current < roleMeta.order.length - 1 &&
      roleRank(roleMeta.order[roleMeta.current + 1]) <= roleRank(policy.roleMax);
    const canDemote = policy.canChangeRole && canManage && roleMeta.current > 0;
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${u.fullName || ""}</td>
      <td title="${u.organizationUnitName || ""}">${u.department || ""}</td>
      <td>${u.companyLevel || ""}</td>
      <td>${u.shiftCode || ""}</td>
      <td>${u.phone || ""}</td>
      <td>${u.address || ""}</td>
      <td>
        <button type="button" class="btn btn-db" data-action="detail" data-id="${u.id}">DB</button>
        <button class="btn btn-edit" data-id="${u.id}" ${policy.canEdit && (canManage || currentMe?.id === u.id) ? "" : "disabled"}>Edit</button>
        <button class="btn btn-promote" data-id="${u.id}" ${canPromote ? "" : "disabled"}>Role +</button>
        <button class="btn btn-demote" data-id="${u.id}" ${canDemote ? "" : "disabled"}>Role -</button>
        <button class="btn btn-reset-pass" data-id="${u.id}" ${policy.canEdit && canManage ? "" : "disabled"}>Reset pass</button>
        <button class="btn btn-del" data-id="${u.id}" ${policy.canDelete && canManage ? "" : "disabled"}>Deactivate</button>
      </td>
    `;
    userRowsEl.appendChild(tr);
  });
  btnAdd.disabled = !policy.canCreate;
}

function fillForm(user = null) {
  const editing = Boolean(user);
  const policy = getUiPolicy(currentMe?.role);
  dialogTitle.textContent = editing ? `Edit ${user.username}` : "Add user";
  fields.id.value = user?.id || "";
  fields.username.value = user?.username || "";
  fields.password.value = "";
  fields.role.value = user?.role || "member";
  fields.fullName.value = user?.fullName || "";
  if (fields.companyLevel) fields.companyLevel.value = user?.companyLevel || "";
  if (fields.department) fields.department.value = user?.department || "";
  if (fields.workSchedule) fields.workSchedule.value = user?.workSchedule || "";
  fields.avatarUrl.value = user?.avatarUrl || "";
  fields.gender.value = user?.gender || "";
  fields.phone.value = user?.phone || "";
  fields.address.value = user?.address || "";
  fields.strengths.value = user?.strengths || "";
  fields.weaknesses.value = user?.weaknesses || "";
  fields.hobbies.value = user?.hobbies || "";
  if (fields.employeeCode) fields.employeeCode.value = user?.employeeCode || "";
  if (fields.organizationUnitId)
    fields.organizationUnitId.value =
      user?.organizationUnitId != null && user.organizationUnitId !== "" ? String(user.organizationUnitId) : "";
  if (fields.organizationUnitName) fields.organizationUnitName.value = user?.organizationUnitName || "";
  if (fields.jobPositionId) fields.jobPositionId.value = user?.jobPositionId || "";
  if (fields.jobPositionName) fields.jobPositionName.value = user?.jobPositionName || "";
  if (fields.shiftCode) fields.shiftCode.value = user?.shiftCode || "";
  if (fields.employeeStatusId)
    fields.employeeStatusId.value =
      user?.employeeStatusId != null && user.employeeStatusId !== "" ? String(user.employeeStatusId) : "";
  if (fields.misaSyncedAt) fields.misaSyncedAt.value = user?.misaSyncedAt ? String(user.misaSyncedAt) : "";
  if (fields.facebookId) fields.facebookId.value = user?.facebookId || "";
  if (fields.zaloUserId) fields.zaloUserId.value = user?.zaloUserId || "";
  if (fields.leaveRemaining)
    fields.leaveRemaining.value =
      user?.leaveRemaining != null && user.leaveRemaining !== "" ? String(user.leaveRemaining) : "";
  if (fields.overtimeMinutesRemaining)
    fields.overtimeMinutesRemaining.value =
      user?.overtimeMinutesRemaining != null && user.overtimeMinutesRemaining !== ""
        ? String(user.overtimeMinutesRemaining)
        : "";
  if (fields.lateEarlyMinutesLastMonth)
    fields.lateEarlyMinutesLastMonth.value =
      user?.lateEarlyMinutesLastMonth != null && user.lateEarlyMinutesLastMonth !== ""
        ? String(user.lateEarlyMinutesLastMonth)
        : "";
  if (fields.overtimeMinutesThisMonth)
    fields.overtimeMinutesThisMonth.value =
      user?.overtimeMinutesThisMonth != null && user.overtimeMinutesThisMonth !== ""
        ? String(user.overtimeMinutesThisMonth)
        : "";
  if (fields.lateEarlyMinutesThisMonth)
    fields.lateEarlyMinutesThisMonth.value =
      user?.lateEarlyMinutesThisMonth != null && user.lateEarlyMinutesThisMonth !== ""
        ? String(user.lateEarlyMinutesThisMonth)
        : "";
  fields.isActive.value = String(user?.isActive !== false);
  fields.username.disabled = editing;
  fields.role.disabled = policy.readOnly || !policy.canChangeRole;
}

async function loadUsers() {
  const mePayload = await api("/me");
  currentMe = mePayload.user || null;
  const payload = await api("/users");
  users = Array.isArray(payload.users) ? payload.users : [];
  if (btnMisaSync) {
    const isAdmin = String(currentMe?.role || "") === "admin";
    btnMisaSync.style.display = isAdmin ? "" : "none";
    btnMisaSync.disabled = !isAdmin;
  }
  renderRows();
  renderLeaveRows();
}

function renderLeaveRows() {
  if (!leaveRowsEl) return;
  leaveRowsEl.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.employeeCode || ""}</td>
      <td>${u.fullName || ""}</td>
      <td>${u.department || ""}</td>
      <td><input type="number" step="0.5" class="ua-input-leave" data-id="${u.id}" value="${u.leaveRemaining ?? 0}" /></td>
      <td title="Kỳ ${
        u.leaveBonusMonthKey || "—"
      } — tổng công (TotalWorking) từ MISA trong kỳ đó">${
        u.leaveBonusWorkdaysInMonth != null && u.leaveBonusWorkdaysInMonth !== ""
          ? u.leaveBonusWorkdaysInMonth
          : "—"
      }</td>
      <td title="Kỳ ${
        u.leaveBonusMonthKey || "—"
      } — 1 nếu công &ge; ngưỡng (mặc định 15), 0 nếu không">${
        u.leaveBonusThisMonth != null && u.leaveBonusThisMonth !== "" ? u.leaveBonusThisMonth : 0
      }</td>
      <td><input type="number" step="1" class="ua-input-ot" data-id="${u.id}" value="${u.overtimeMinutesRemaining ?? 0}" /></td>
      <td><input type="number" step="1" class="ua-input-late-early" data-id="${u.id}" value="${u.lateEarlyMinutesLastMonth ?? 0}" /></td>
      <td><input type="number" step="1" class="ua-input-ot-month" data-id="${u.id}" value="${u.overtimeMinutesThisMonth ?? 0}" /></td>
      <td><input type="number" step="1" class="ua-input-late-early-month" data-id="${u.id}" value="${u.lateEarlyMinutesThisMonth ?? 0}" /></td>
      <td><button type="button" class="btn btn-primary ua-btn-leave-save" data-id="${u.id}">Lưu</button></td>
    `;
    leaveRowsEl.appendChild(tr);
  });
}

async function syncMisaEmployees() {
  if (String(currentMe?.role || "") !== "admin") return;
  if (!window.confirm("Lấy danh sách nhân viên từ MISA và ghi vào database user (WindowShell)?")) return;
  try {
    const res = await fetch(`${USER_ADMIN_API}/misa/sync-employees`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "MISA sync failed");
    const { inserted, updated, totalFromApi, skippedCount, errorCount } = payload;
    window.alert(
      `Đồng bộ xong.\nAPI: ${totalFromApi ?? "?"} bản ghi\nThêm: ${inserted ?? 0}, Cập nhật: ${updated ?? 0}\nBỏ qua: ${skippedCount ?? 0}, Lỗi: ${errorCount ?? 0}`
    );
    await loadUsers();
  } catch (e) {
    window.alert((e && e.message) || String(e));
  }
}

function openUserDetail(userId) {
  const u = users.find((x) => x.id === userId);
  if (!u || !userDetailPre || !userDetailDialog) return;
  userDetailPre.textContent = JSON.stringify(u, null, 2);
  userDetailDialog.showModal();
}

async function loadRoleToolAccess() {
  const payload = await api("/tool-access");
  roleToolAccessPayload = {
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    tools: Array.isArray(payload.tools) ? payload.tools : [],
    permissions: payload.permissions || {}
  };
  if (roleToolSearch) roleToolSearch.value = "";
  renderRoleSelector();
  renderRoleToolGrid();
}

function renderRoleSelector() {
  roleAccessRole.innerHTML = "";
  roleToolAccessPayload.roles.forEach((role) => {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = role;
    roleAccessRole.appendChild(option);
  });
}

function renderRoleToolGrid() {
  const selectedRole = String(roleAccessRole.value || roleToolAccessPayload.roles[0] || "");
  const roleMap = roleToolAccessPayload.permissions?.[selectedRole] || {};
  const canEdit = String(currentMe?.role || "") === "admin";
  const q = getRoleToolSearchQuery();
  roleToolGrid.innerHTML = "";
  roleToolAccessPayload.tools.forEach((tool) => {
    const toolId = String(tool.id || "");
    if (!roleToolMatchesSearch(tool, q)) return;
    const checked = Boolean(roleMap[toolId]);
    const row = document.createElement("label");
    row.className = "ua-role-tool-item";
    row.innerHTML = `
      <input type="checkbox" data-tool-id="${toolId}" ${checked ? "checked" : ""} ${canEdit ? "" : "disabled"} />
      <span class="ua-role-tool-icon" aria-hidden="true">${getRoleToolIconHtml(toolId)}</span>
      <span class="ua-role-tool-text">
        <span class="ua-role-tool-title">${tool.title || toolId}</span>
        <code class="ua-role-tool-id">${toolId}</code>
      </span>
    `;
    roleToolGrid.appendChild(row);
  });
  btnSaveRoleTools.disabled = !canEdit;
  if (btnRoleToolsSelectAll) btnRoleToolsSelectAll.disabled = !canEdit;
  if (btnRoleToolsClearAll) btnRoleToolsClearAll.disabled = !canEdit;
  if (roleToolSearch) roleToolSearch.disabled = !canEdit;
  roleToolGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => updateRoleToolSummary(selectedRole, buildRolePermissionMapFromGrid()));
  });
  updateRoleToolSummary(selectedRole, { ...roleMap });
}

async function saveRoleToolAccess() {
  const role = String(roleAccessRole.value || "").trim();
  if (!role) return;
  const baseMap = roleToolAccessPayload.permissions?.[role] || {};
  const merged = { ...baseMap, ...buildRolePermissionMapFromGrid() };
  const toolIds = Object.keys(merged).filter((id) => merged[id]);
  await api(`/tool-access/${encodeURIComponent(role)}`, {
    method: "PUT",
    body: JSON.stringify({ toolIds })
  });
  await loadRoleToolAccess();
}

function readOptionalIntField(el) {
  const v = String(el?.value ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function saveUser(e) {
  e.preventDefault();
  const id = fields.id.value.trim();
  const misaAt = fields.misaSyncedAt ? String(fields.misaSyncedAt.value || "").trim() : "";
  const body = {
    role: fields.role.value,
    fullName: fields.fullName.value.trim(),
    companyLevel: fields.companyLevel ? fields.companyLevel.value.trim() : "",
    department: fields.department ? fields.department.value.trim() : "",
    workSchedule: fields.workSchedule ? fields.workSchedule.value.trim() : "",
    avatarUrl: fields.avatarUrl.value.trim(),
    gender: fields.gender.value,
    strengths: fields.strengths.value.trim(),
    weaknesses: fields.weaknesses.value.trim(),
    hobbies: fields.hobbies.value.trim(),
    address: fields.address.value.trim(),
    phone: fields.phone.value.trim(),
    employeeCode: fields.employeeCode ? fields.employeeCode.value.trim() : "",
    organizationUnitId: readOptionalIntField(fields.organizationUnitId),
    organizationUnitName: fields.organizationUnitName ? fields.organizationUnitName.value.trim() : "",
    jobPositionId: fields.jobPositionId ? fields.jobPositionId.value.trim() : "",
    jobPositionName: fields.jobPositionName ? fields.jobPositionName.value.trim() : "",
    shiftCode: fields.shiftCode ? fields.shiftCode.value.trim() : "",
    employeeStatusId: readOptionalIntField(fields.employeeStatusId),
    misaSyncedAt: misaAt || null,
    facebookId: fields.facebookId ? fields.facebookId.value.trim() : "",
    zaloUserId: fields.zaloUserId ? fields.zaloUserId.value.trim() : "",
    isActive: fields.isActive.value === "true",
    leaveRemaining: readOptionalIntField(fields.leaveRemaining),
    overtimeMinutesRemaining: readOptionalIntField(fields.overtimeMinutesRemaining),
    lateEarlyMinutesLastMonth: readOptionalIntField(fields.lateEarlyMinutesLastMonth),
    overtimeMinutesThisMonth: readOptionalIntField(fields.overtimeMinutesThisMonth),
    lateEarlyMinutesThisMonth: readOptionalIntField(fields.lateEarlyMinutesThisMonth)
  };
  if (!id) {
    body.username = fields.username.value.trim();
    body.password = fields.password.value;
    await api("/users", { method: "POST", body: JSON.stringify(body) });
  } else {
    if (fields.password.value.trim()) body.password = fields.password.value;
    await api(`/users/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
  }
  dialog.close();
  await loadUsers();
}

async function updateRole(userId, delta) {
  const target = users.find((u) => u.id === userId);
  if (!target) return;
  const meta = normalizeRole(target.role);
  const nextIndex = Math.max(0, Math.min(meta.order.length - 1, meta.current + delta));
  const nextRole = meta.order[nextIndex];
  if (nextRole === target.role) return;
  await api(`/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ role: nextRole })
  });
  await loadUsers();
}

async function resetPassword(userId) {
  const pwd = window.prompt("New password (>= 8 chars):");
  if (!pwd) return;
  if (String(pwd).trim().length < 8) {
    window.alert("Password must be at least 8 chars.");
    return;
  }
  await api(`/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ password: String(pwd).trim() })
  });
  window.alert("Password updated.");
}

async function deleteUser(userId) {
  if (!window.confirm("Delete this user?")) return;
  await api(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  await loadUsers();
}

userRowsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const userId = String(btn.dataset.id || "");
  if (!userId) return;
  if (btn.dataset.action === "detail" || btn.classList.contains("btn-db")) {
    openUserDetail(userId);
    return;
  }
  if (btn.classList.contains("btn-edit")) {
    const target = users.find((u) => u.id === userId);
    fillForm(target || null);
    dialog.showModal();
    return;
  }
  if (btn.classList.contains("btn-promote")) return updateRole(userId, +1);
  if (btn.classList.contains("btn-demote")) return updateRole(userId, -1);
  if (btn.classList.contains("btn-reset-pass")) return resetPassword(userId);
  if (btn.classList.contains("btn-del")) return deleteUser(userId);
});

btnAdd.addEventListener("click", () => {
  fillForm(null);
  dialog.showModal();
});

btnRefresh.addEventListener("click", loadUsers);
if (btnMisaSync) btnMisaSync.addEventListener("click", () => syncMisaEmployees());
if (btnDetailClose) btnDetailClose.addEventListener("click", () => userDetailDialog.close());
if (userDetailDialog) {
  userDetailDialog.addEventListener("click", (e) => {
    if (e.target === userDetailDialog) userDetailDialog.close();
  });
}
btnCancel.addEventListener("click", () => dialog.close());
form.addEventListener("submit", saveUser);
if (searchInput) searchInput.addEventListener("input", renderRows);
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => openTab(String(btn.dataset.tab || "users")));
});
if (roleAccessRole) roleAccessRole.addEventListener("change", renderRoleToolGrid);
if (roleToolSearch) {
  let searchTimer = 0;
  roleToolSearch.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => renderRoleToolGrid(), 120);
  });
}
if (btnRoleToolsSelectAll) {
  btnRoleToolsSelectAll.addEventListener("click", () => {
    if (String(currentMe?.role || "") !== "admin") return;
    setAllRoleToolCheckboxes(true);
  });
}
if (btnRoleToolsClearAll) {
  btnRoleToolsClearAll.addEventListener("click", () => {
    if (String(currentMe?.role || "") !== "admin") return;
    setAllRoleToolCheckboxes(false);
  });
}
if (btnSaveRoleTools) btnSaveRoleTools.addEventListener("click", saveRoleToolAccess);

if (leaveRowsEl) {
  leaveRowsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest(".ua-btn-leave-save");
    if (!btn) return;
    const id = String(btn.dataset.id || "");
    if (!id) return;
    const input = leaveRowsEl.querySelector(`.ua-input-leave[data-id="${id}"]`);
    const raw = input ? input.value.trim() : "";
    const leaveRemaining = raw === "" ? null : Number(raw);
    const otInput = leaveRowsEl.querySelector(`.ua-input-ot[data-id="${id}"]`);
    const rawOt = otInput ? otInput.value.trim() : "";
    const overtimeMinutesRemaining = rawOt === "" ? null : Number(rawOt);
    const lateEarlyInput = leaveRowsEl.querySelector(`.ua-input-late-early[data-id="${id}"]`);
    const rawLateEarly = lateEarlyInput ? lateEarlyInput.value.trim() : "";
    const lateEarlyMinutesLastMonth = rawLateEarly === "" ? null : Number(rawLateEarly);
    const otMonthInput = leaveRowsEl.querySelector(`.ua-input-ot-month[data-id="${id}"]`);
    const rawOtMonth = otMonthInput ? otMonthInput.value.trim() : "";
    const overtimeMinutesThisMonth = rawOtMonth === "" ? null : Number(rawOtMonth);
    const lateEarlyMonthInput = leaveRowsEl.querySelector(`.ua-input-late-early-month[data-id="${id}"]`);
    const rawLateEarlyMonth = lateEarlyMonthInput ? lateEarlyMonthInput.value.trim() : "";
    const lateEarlyMinutesThisMonth = rawLateEarlyMonth === "" ? null : Number(rawLateEarlyMonth);
    try {
      await api(`/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
          leaveRemaining,
          overtimeMinutesRemaining,
          lateEarlyMinutesLastMonth,
          overtimeMinutesThisMonth,
          lateEarlyMinutesThisMonth
        })
      });
      await loadUsers();
    } catch (err) {
      window.alert(err?.message || "Cannot update leave balance");
    }
  });
}
if (btnTokenReload) btnTokenReload.addEventListener("click", () => loadTokenOffices().catch((error) => {
  tokenStatusText.textContent = error.message;
}));
if (btnTokenRefreshAll) btnTokenRefreshAll.addEventListener("click", () => refreshAllOfficeTokens().catch((error) => {
  tokenStatusText.textContent = error.message;
}));
if (btnTokenServiceToggle) btnTokenServiceToggle.addEventListener("click", () => toggleTokenService().catch((error) => {
  tokenStatusText.textContent = error.message;
}));
if (tokenOfficeGrid) tokenOfficeGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-token-refresh");
  if (!btn) return;
  const officeKey = String(btn.dataset.office || "");
  refreshOfficeToken(officeKey).catch((error) => {
    tokenStatusText.textContent = error.message;
  });
});

if (btnTestPublicTokens) {
  btnTestPublicTokens.addEventListener("click", () => testPublicTokens());
}
if (btnTestPublicAppointment) {
  btnTestPublicAppointment.addEventListener("click", () => testPublicAppointment());
}

// Commission Settings listeners removed (moved to /commission-settings)

initPublicApiBaseField();

Promise.all([loadUsers(), loadRoleToolAccess()])
  .catch((error) => {
    userRowsEl.innerHTML = `<tr><td colspan="9">${error.message}</td></tr>`;
  });
