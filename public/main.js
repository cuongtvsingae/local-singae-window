const tools = [
  { id: 'crmtester', href: 'tools/default/crm-api-tester/index.html', title: 'CRM API Tester' },
  { id: 'mycomputer', href: 'tools/default/my-computer/index.html', title: 'My Computer' },
  { id: 'fileexplorer', href: 'tools/default/file-explorer/index.html', title: 'File Explorer' },
  { id: 'commission', href: 'tools/normal/commission/index.html', title: 'Tính Hoa Hồng' },
  { id: 'commission-settings', href: 'tools/normal/commission-settings/index.html', title: 'Commission Settings' },
  { id: 'giftbag', href: 'tools/normal/giftbag/index.html', title: 'CTV SINGAE MANAGER' },
  { id: 'itsupport', href: 'tools/normal/it-support/index.html', title: 'IT Support' },
  { id: 'json', href: 'tools/code/json-formatter.html', title: 'JSON Formatter' },
  { id: 'base64', href: 'tools/code/base64.html', title: 'Base64' },
  { id: 'hash', href: 'tools/code/hash.html', title: 'Hash Generator' },
  { id: 'regex', href: 'tools/code/regex.html', title: 'Regex Tester' },
  { id: 'qr', href: 'tools/code/qr-code.html', title: 'QR Code Generator' },
  { id: 'gradient', href: 'tools/code/gradient.html', title: 'Gradient Generator' },
  { id: 'uuid', href: 'tools/code/uuid-generator.html', title: 'UUID Generator' },
  { id: 'jsonmodel', href: 'tools/code/json-to-model.html', title: 'JSON to Model' },
  { id: 'date', href: 'tools/code/date-formatter.html', title: 'Date Formatter' },
  { id: 'color', href: 'tools/image/color-contrast.html', title: 'Color Contrast' },
  { id: 'tinypng', href: 'tools/image/tiny-png.html', title: 'Tiny PNG' },
  { id: 'palette', href: 'tools/image/color-palette.html', title: 'Color Palette' },
  { id: 'resizer', href: 'tools/image/image-resizer.html', title: 'Image Resizer' },
  { id: 'base64img', href: 'tools/image/image-base64.html', title: 'Image Base64' },
  { id: 'singaelookup', href: 'tools/ai/singae-lookup/index.html', title: 'SINGAE Lookup' },
  { id: 'useradmin', href: 'tools/normal/user-admin/index.html', title: 'User Admin' },
  { id: 'payrollcalculator', href: 'tools/normal/payroll-calculator/index.html', title: 'Bảng chấm công' },
  { id: 'chatbot', href: 'tools/ai/chatbot/index.html', title: 'Chatbot' },
  { id: 'dbviewer', href: 'tools/vip/db-viewer/index.html', title: 'Database Viewer' },
  { id: 'ai-manager', href: 'tools/vip/ai-manager/index.html', title: 'AI Manager' },
  { id: 'chatbot-manager', href: 'tools/vip/chatbot-manager/index.html', title: 'Chatbot Manager' }
];

const ICON = {
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
  singaelookup: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M5.2 15.8c1.4-3.8 4.8-6.5 9.2-7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M26.8 16.2c-1.4 3.8-4.8 6.5-9.2 7.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.1 17.8c.2-2.7 2.4-4.9 5.2-4.9 1.6 0 3 .7 4 1.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14.9 14.9h4.2M14.9 17.1h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><text x="16" y="28.4" text-anchor="middle" font-size="6.2" font-weight="900" letter-spacing=".35" font-family="Arial, Helvetica, sans-serif" fill="currentColor">GETFLY</text></svg>',
  useradmin: '<svg viewBox="0 0 32 32" class="tool-svg"><circle cx="12" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.8 23.5c.8-3.1 3.5-5.3 6.8-5.3 3.3 0 6 2.2 6.8 5.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="20.2" y="16.7" width="6.8" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M23.6 14.6v2.1M23.6 23.5v2.1M19.9 20.1h2.1M25.2 20.1h2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  payrollcalculator: '<svg viewBox="0 0 32 32" class="tool-svg" aria-hidden="true"><rect x="5.5" y="7" width="21" height="18.5" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M10.5 5.8v4M21.5 5.8v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 12.2h17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="19.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 17.2v2.6l1.6 0.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9.5 16h3M9.5 19h2.5M19.5 22h3" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/></svg>',
  chatbot: '<svg viewBox="0 0 32 32" class="tool-svg"><path d="M5.6 16.9 25.9 8.5c.9-.4 1.8.5 1.5 1.4l-5.3 15.7c-.3.9-1.5 1.2-2.2.6l-5.6-4.8-3.6 3c-.7.6-1.8.1-1.7-.9l.5-5.1-3.8-1c-1-.2-1.1-1.6-.1-2.1Z" fill="currentColor"/><path d="M10.8 18.4 24.4 10.7M14.2 21.3l2.3 2" stroke="#06080d" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/></svg>',
  dbviewer: '<svg viewBox="0 0 32 32" class="tool-svg"><ellipse cx="16" cy="8.5" rx="8.5" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 8.5v9.8c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 13.2c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".85"/><path d="M10.2 24.5h11.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".75"/></svg>',
  'ai-manager': '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.5" y="6.2" width="23" height="19.6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 12h13.6M9.2 17h9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="21.8" cy="17" r="2.4" fill="currentColor"/><path d="M21.8 13.8v6.4" stroke="#06080d" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/><path d="M18.6 17h6.4" stroke="#06080d" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/></svg>',
  'chatbot-manager': '<svg viewBox="0 0 32 32" class="tool-svg"><rect x="4.8" y="6.3" width="22.4" height="18.6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.2 11.2h9.8M9.2 15.4h7.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="22.3" cy="15.5" r="3.1" fill="none" stroke="currentColor" stroke-width="1.55"/><path d="M22.3 13.8v3.4M20.6 15.5H24" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>'
};

const state = {
  desktop: null,
  layer: null,
  topLayer: null,
  iconList: null,
  taskbar: null,
  iconPositions: new Map(),
  pinnedToolIds: new Set(),
  customTitles: new Map(),
  windowsById: new Map(),
  openOrder: [],
  windowLayerOrder: [],
  zIndex: 20,
  persistedWindows: new Map(),
  selectedToolId: null,
  contextMenuEl: null,
  contextMenuType: 'desktop',
  contextTaskbarToolId: null,
  taskbarReorderGuardUntil: 0,
  renamingToolId: null,
  sortMode: 'name',
  dividerOffset: 8,
  clockEl: null,
  startPanelEl: null,
  startBtnEl: null,
  startPanelCloseTimer: null,
  startPanelTransitionHandler: null,
  renderedToolIds: [],
  navColumns: [],
  navIndexMap: new Map(),
  iconSize: 'large',
  showDesktopIcons: true,
  autoArrangeIcons: false,
  alignIconsToGrid: true
};

const selectionState = {
  currentToolId: null,
  version: 0
};
const AUTH_API_BASE = '/api/windowsshell/auth';
const authState = {
  user: null,
  lockReady: false,
  allowedToolIds: new Set()
};

const DESKTOP_SHELL_CACHE_API = '/api/windowsshell/desktop-shell/cache';
const SHELL_CACHE_SCHEMA_VERSION = 4;
const WALLPAPER_LOCAL_CACHE_KEY = 'desktop_shell_wallpaper_cache_v1';

const DEFAULT_SHELL_CACHE = {
  schemaVersion: SHELL_CACHE_SCHEMA_VERSION,
  iconPositions: {},
  windowStates: {},
  customTitles: {},
  pinnedToolIds: ['crmtester'],
  sortMode: 'name',
  dividerOffset: 8,
  wallpaper: null,
  desktopView: {
    iconSize: 'large',
    showDesktopIcons: true,
    autoArrangeIcons: false,
    alignIconsToGrid: true
  }
};

const shellCacheState = {
  data: { ...DEFAULT_SHELL_CACHE },
  saveTimer: null
};

const DEFAULT_WALLPAPER = {
  type: 'image',
  value: 'asset/desktop-bg-black-ai.svg'
};

const WALLPAPER_PRESETS = [
  { id: 'default', label: 'Wallpaper: Black AI default', type: 'image', value: 'asset/desktop-bg-black-ai.svg' },
  { id: 'blue', label: 'Wallpaper: Blue gradient', type: 'gradient', value: 'radial-gradient(circle at 20% 0%, rgba(30,58,138,.55), transparent 45%), radial-gradient(circle at 80% 100%, rgba(37,99,235,.35), transparent 52%), #06080d' },
  { id: 'purple', label: 'Wallpaper: Purple gradient', type: 'gradient', value: 'radial-gradient(circle at 10% 10%, rgba(168,85,247,.45), transparent 42%), radial-gradient(circle at 90% 90%, rgba(59,130,246,.3), transparent 50%), #05070c' },
  { id: 'midnight', label: 'Wallpaper: Midnight', type: 'gradient', value: 'radial-gradient(circle at 50% 0%, rgba(51,65,85,.45), transparent 46%), radial-gradient(circle at 0% 100%, rgba(15,23,42,.55), transparent 52%), #04060b' }
];

const TOOL_GROUPS = {
  crmtester: 'AI',
  mycomputer: 'AI',
  fileexplorer: 'AI',
  commission: 'AI',
  'commission-settings': 'AI',
  giftbag: 'AI',
  itsupport: 'AI',
  json: 'Code',
  base64: 'Code',
  hash: 'Code',
  regex: 'Code',
  qr: 'Code',
  gradient: 'Code',
  uuid: 'Code',
  jsonmodel: 'Code',
  date: 'Code',
  color: 'Image',
  tinypng: 'Image',
  palette: 'Image',
  resizer: 'Image',
  base64img: 'Image',
  singaelookup: 'AI',
  useradmin: 'AI',
  payrollcalculator: 'AI',
  chatbot: 'AI',
  dbviewer: 'AI',
  'ai-manager': 'AI',
  'chatbot-manager': 'AI'
};

// Show ALL tools on Desktop, except Code tools and Image tools (per latest request).
const DESKTOP_PRIMARY_TOOL_IDS = new Set([]);
const FORCE_HIDDEN_TOOL_IDS = new Set([
  // Code
  'json',
  'base64',
  'hash',
  'regex',
  'qr',
  'gradient',
  'uuid',
  'jsonmodel',
  'date',
  // Image
  'color',
  'tinypng',
  'palette',
  'resizer',
  'base64img'
]);
const TASKBAR_ONLY_TOOL_IDS = new Set([]);

function getVisibleTools() {
  return tools.filter((tool) => !FORCE_HIDDEN_TOOL_IDS.has(tool.id));
}

function getPermittedTools() {
  const visibleTools = getVisibleTools();
  if (!authState.allowedToolIds || !authState.allowedToolIds.size) return [];
  return visibleTools.filter((tool) => authState.allowedToolIds.has(tool.id));
}

function isAiTool(toolId) {
  return TOOL_GROUPS[toolId] === 'AI';
}

function getDesktopTools() {
  return getPermittedTools().filter((tool) => !TASKBAR_ONLY_TOOL_IDS.has(tool.id));
}

function getStartMenuTools() {
  return getPermittedTools().filter((tool) => !TASKBAR_ONLY_TOOL_IDS.has(tool.id) && (!DESKTOP_PRIMARY_TOOL_IDS.has(tool.id) || isAiTool(tool.id)));
}

const ICON_HOLD_PREVIEW_MS = 240;
const GLOBAL_MOBILE_MIN_WIDTH = 980;
const GLOBAL_MOBILE_MIN_HEIGHT = 620;
let desktopShellBootstrapped = false;

function formatLockDate(now) {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

function updateLockClock() {
  const timeEl = document.getElementById('win11LockTime');
  const dateEl = document.getElementById('win11LockDate');
  if (!timeEl || !dateEl) return;
  const now = new Date();
  const hh = `${now.getHours()}`.padStart(2, '0');
  const mm = `${now.getMinutes()}`.padStart(2, '0');
  timeEl.textContent = `${hh}:${mm}`;
  dateEl.textContent = formatLockDate(now);
}

function showLoginCard() {
  const lockView = document.getElementById('win11LockView');
  const loginView = document.getElementById('win11LoginView');
  const loadingView = document.getElementById('win11LoginLoadingView');
  if (!lockView || !loginView) return;
  lockView.classList.remove('is-visible');
  if (loadingView) loadingView.classList.remove('is-visible');
  loginView.classList.remove('is-hiding');
  loginView.classList.add('is-visible');
}

function hideAuthShell() {
  const shell = document.getElementById('win11AuthShell');
  if (!shell) return;
  shell.classList.add('is-fading-out');
  window.setTimeout(() => {
    shell.classList.remove('is-visible');
    shell.classList.remove('is-fading-out');
    shell.setAttribute('aria-hidden', 'true');
    syncGlobalMobileGate();
  }, 520);
}

function showAuthShell() {
  const shell = document.getElementById('win11AuthShell');
  const lockView = document.getElementById('win11LockView');
  const loginView = document.getElementById('win11LoginView');
  const loadingView = document.getElementById('win11LoginLoadingView');
  if (!shell || !lockView || !loginView) return;
  shell.classList.remove('is-fading-out');
  shell.classList.add('is-visible');
  shell.setAttribute('aria-hidden', 'false');
  lockView.classList.add('is-visible');
  loginView.classList.remove('is-hiding');
  loginView.classList.remove('is-visible');
  if (loadingView) loadingView.classList.remove('is-visible');
  syncGlobalMobileGate();
}

async function playLoginSuccessTransition() {
  const loginView = document.getElementById('win11LoginView');
  const loadingView = document.getElementById('win11LoginLoadingView');
  if (!loginView || !loadingView) return;
  loginView.classList.add('is-hiding');
  await new Promise((resolve) => setTimeout(resolve, 180));
  loginView.classList.remove('is-visible');
  loadingView.classList.add('is-visible');
  await new Promise((resolve) => setTimeout(resolve, 780));
}

async function fetchCurrentUser() {
  const res = await fetch(`${AUTH_API_BASE}/me`, { credentials: 'include' });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => ({}));
  return payload?.user || null;
}

async function login(username, password) {
  const res = await fetch(`${AUTH_API_BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || 'Login failed');
  }
  const payload = await res.json().catch(() => ({}));
  return payload?.user || null;
}

async function logout() {
  try {
    await fetch(`${AUTH_API_BASE}/logout`, { method: 'POST', credentials: 'include' });
  } catch (_) {}
  authState.user = null;
  authState.allowedToolIds = new Set();
  showAuthShell();
}

function bindAuthUi() {
  if (authState.lockReady) return;
  authState.lockReady = true;
  updateLockClock();
  setInterval(updateLockClock, 1000);
  const shell = document.getElementById('win11AuthShell');
  const lockView = document.getElementById('win11LockView');
  const form = document.getElementById('win11LoginForm');
  const usernameEl = document.getElementById('win11Username');
  const passwordEl = document.getElementById('win11Password');
  const titleEl = document.getElementById('win11LoginTitle');
  const avatarEl = document.getElementById('win11LoginAvatar');
  const errorEl = document.getElementById('win11LoginError');
  const reveal = () => {
    if (!shell || !shell.classList.contains('is-visible')) return;
    if (!lockView || !lockView.classList.contains('is-visible')) return;
    showLoginCard();
    if (usernameEl) usernameEl.focus();
  };
  document.addEventListener('keydown', reveal);
  if (shell) shell.addEventListener('click', reveal);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!usernameEl || !passwordEl || !errorEl) return;
    errorEl.textContent = '';
    form.classList.add('is-loading');
    try {
      const user = await login(usernameEl.value, passwordEl.value);
      authState.user = user;
      authState.allowedToolIds = new Set(Array.isArray(user?.allowedToolIds) ? user.allowedToolIds : []);
      if (titleEl) titleEl.textContent = 'Welcome to SINGAE WINDOWshell';
      if (avatarEl && user?.avatarUrl) {
        avatarEl.style.background = `center / cover no-repeat url("${user.avatarUrl}")`;
      }
      await playLoginSuccessTransition();
      hideAuthShell();
      if (!desktopShellBootstrapped) bootstrapDesktopShell();
    } catch (error) {
      errorEl.textContent = error?.message || 'Login failed';
    } finally {
      form.classList.remove('is-loading');
    }
  });
}

function readLocalWallpaperCache() {
  try {
    const raw = localStorage.getItem(WALLPAPER_LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      (parsed.type === 'image' || parsed.type === 'gradient') &&
      typeof parsed.value === 'string' &&
      parsed.value.trim()
    ) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function writeLocalWallpaperCache(config) {
  if (!config) return;
  try {
    if (
      (config.type === 'image' || config.type === 'gradient') &&
      typeof config.value === 'string' &&
      config.value.trim()
    ) {
      localStorage.setItem(WALLPAPER_LOCAL_CACHE_KEY, JSON.stringify(config));
    }
  } catch (_) {}
}


async function loadPersistedState() {
  const localWallpaper = readLocalWallpaperCache();
  let cache = {
    ...DEFAULT_SHELL_CACHE,
    wallpaper: localWallpaper || DEFAULT_SHELL_CACHE.wallpaper
  };
  try {
    const res = await fetch(DESKTOP_SHELL_CACHE_API);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data && data.cache && typeof data.cache === 'object') {
        const remoteCache = data.cache;
        const sameSchema = Number(remoteCache.schemaVersion || 0) === SHELL_CACHE_SCHEMA_VERSION;
        cache = {
          ...DEFAULT_SHELL_CACHE,
          ...(sameSchema ? remoteCache : {}),
          wallpaper: sameSchema
            ? (remoteCache.wallpaper || localWallpaper || DEFAULT_SHELL_CACHE.wallpaper)
            : (localWallpaper || DEFAULT_SHELL_CACHE.wallpaper),
          desktopView: {
            ...DEFAULT_SHELL_CACHE.desktopView,
            ...((sameSchema ? remoteCache.desktopView : null) || {})
          }
        };
      }
    }
  } catch (_) {}
  shellCacheState.data = cache;
  if (cache.wallpaper) writeLocalWallpaperCache(cache.wallpaper);

  const icons = cache.iconPositions || {};
  Object.keys(icons).forEach((id) => {
    const pos = icons[id];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      state.iconPositions.set(id, { x: pos.x, y: pos.y });
    }
  });

  const windows = cache.windowStates || {};
  Object.keys(windows).forEach((id) => {
    const win = windows[id];
    if (win) state.persistedWindows.set(id, win);
  });

  const titles = cache.customTitles || {};
  Object.keys(titles).forEach((id) => {
    if (typeof titles[id] === 'string' && titles[id].trim()) state.customTitles.set(id, titles[id].trim());
  });

  if (Array.isArray(cache.pinnedToolIds)) {
    const validToolIds = new Set(getPermittedTools().map((tool) => tool.id));
    cache.pinnedToolIds
      .filter((id) => typeof id === 'string' && validToolIds.has(id))
      .slice(0, tools.length)
      .forEach((id) => {
        state.pinnedToolIds.add(id);
      });
  }
  if (cache.sortMode === 'name' || cache.sortMode === 'group') {
    state.sortMode = cache.sortMode;
  }
  if (Number.isFinite(Number(cache.dividerOffset))) {
    state.dividerOffset = Math.max(8, Math.min(Number(cache.dividerOffset), 360));
  }

  const view = cache.desktopView || {};
  if (view.iconSize === 'large' || view.iconSize === 'medium' || view.iconSize === 'small') state.iconSize = view.iconSize;
  // Force show desktop icons (user request: always show icons on desktop).
  state.showDesktopIcons = true;
  if (typeof view.autoArrangeIcons === 'boolean') state.autoArrangeIcons = view.autoArrangeIcons;
  if (typeof view.alignIconsToGrid === 'boolean') state.alignIconsToGrid = view.alignIconsToGrid;
}

function buildDesktopShellCachePayload() {
  const iconPositions = {};
  state.iconPositions.forEach((value, key) => { iconPositions[key] = value; });
  const windowStates = {};
  state.windowsById.forEach((win, id) => {
    windowStates[id] = {
      rect: win.rect,
      restoreRect: win.restoreRect || null,
      minimized: !!win.minimized,
      maximized: !!win.maximized
    };
  });
  state.persistedWindows.forEach((cached, id) => {
    if (!windowStates[id]) windowStates[id] = cached;
  });
  const customTitles = {};
  state.customTitles.forEach((value, key) => { customTitles[key] = value; });
  return {
    schemaVersion: SHELL_CACHE_SCHEMA_VERSION,
    iconPositions,
    windowStates,
    customTitles,
    pinnedToolIds: Array.from(state.pinnedToolIds),
    sortMode: state.sortMode,
    dividerOffset: state.dividerOffset,
    wallpaper: loadWallpaperConfig(),
    desktopView: {
      iconSize: state.iconSize,
      showDesktopIcons: state.showDesktopIcons,
      autoArrangeIcons: state.autoArrangeIcons,
      alignIconsToGrid: state.alignIconsToGrid
    }
  };
}

function scheduleShellCacheSave() {
  if (shellCacheState.saveTimer) clearTimeout(shellCacheState.saveTimer);
  shellCacheState.saveTimer = setTimeout(async () => {
    shellCacheState.saveTimer = null;
    try {
      await fetch(DESKTOP_SHELL_CACHE_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cache: buildDesktopShellCachePayload() })
      });
    } catch (_) {}
  }, 140);
}

function flushShellCacheNow() {
  if (shellCacheState.saveTimer) {
    clearTimeout(shellCacheState.saveTimer);
    shellCacheState.saveTimer = null;
  }
  try {
    fetch(DESKTOP_SHELL_CACHE_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cache: buildDesktopShellCachePayload() }),
      keepalive: true
    });
  } catch (_) {}
}

function saveIconPositions() {
  scheduleShellCacheSave();
}

function saveWindowStates() {
  scheduleShellCacheSave();
}

function persistWindowState(win) {
  state.persistedWindows.set(win.tool.id, {
    rect: win.rect,
    restoreRect: win.restoreRect || null,
    minimized: !!win.minimized,
    maximized: !!win.maximized
  });
}

function saveCustomTitles() {
  scheduleShellCacheSave();
}

function savePinnedTools() {
  scheduleShellCacheSave();
}

function saveSortMode() {
  scheduleShellCacheSave();
}

function saveDesktopViewSettings() {
  scheduleShellCacheSave();
}

function applyDesktopViewSettings() {
  if (!state.desktop || !state.iconList) return;
  state.desktop.setAttribute('data-icon-size', state.iconSize);
  state.iconList.classList.toggle('is-hidden', !state.showDesktopIcons);
}

function getWallpaperEl() {
  return document.getElementById('desktopWallpaper');
}

function applyWallpaperConfig(config) {
  const el = getWallpaperEl();
  if (!el || !config) return;
  if (config.type === 'image') {
    el.style.background = `#06080d url("${config.value}") center / cover no-repeat`;
    return;
  }
  if (config.type === 'gradient') {
    // Use shorthand to fully replace previous image background.
    el.style.background = config.value;
  }
}

function saveWallpaperConfig(config) {
  shellCacheState.data.wallpaper = config;
  writeLocalWallpaperCache(config);
  scheduleShellCacheSave();
}

function loadWallpaperConfig() {
  const parsed = shellCacheState.data?.wallpaper;
  if (
    parsed &&
    (parsed.type === 'image' || parsed.type === 'gradient') &&
    typeof parsed.value === 'string' &&
    parsed.value.trim()
  ) return parsed;
  return DEFAULT_WALLPAPER;
}

function setWallpaper(config) {
  applyWallpaperConfig(config);
  saveWallpaperConfig(config);
}

function handleWallpaperUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setWallpaper({ type: 'image', value: dataUrl });
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

function applySortLayout(mode) {
  const cellW = 108;
  const cellH = 108;
  const pad = 10;
  const autoGapX = 18;
  const autoGapY = 12;
  const usableHeight = Math.max(120, state.desktop.clientHeight - pad * 2);
  const maxRows = Math.max(1, Math.floor(usableHeight / (cellH + autoGapY)));

  const sorted = [...getDesktopTools()];
  if (mode === 'name') {
    sorted.sort((a, b) => getToolTitle(a).localeCompare(getToolTitle(b)));
    sorted.forEach((tool, idx) => {
      const col = Math.floor(idx / maxRows);
      const row = idx % maxRows;
      state.iconPositions.set(tool.id, { x: pad + col * (cellW + autoGapX), y: pad + row * (cellH + autoGapY) });
    });
  } else if (mode === 'group') {
    sorted.sort((a, b) => {
      const g = (TOOL_GROUPS[a.id] || '').localeCompare(TOOL_GROUPS[b.id] || '');
      if (g !== 0) return g;
      return getToolTitle(a).localeCompare(getToolTitle(b));
    });
    const groups = ['Code', 'Image', 'AI'];
    sorted.forEach((tool) => {
      const group = TOOL_GROUPS[tool.id] || 'Code';
      const groupTools = sorted.filter((t) => (TOOL_GROUPS[t.id] || 'Code') === group);
      const groupIdx = groupTools.findIndex((t) => t.id === tool.id);
      const baseCol = groups
        .slice(0, Math.max(0, groups.indexOf(group)))
        .reduce((sum, g) => {
          const count = sorted.filter((t) => (TOOL_GROUPS[t.id] || 'Code') === g).length;
          return sum + Math.max(1, Math.ceil(count / maxRows));
        }, 0);
      const localCol = Math.floor(groupIdx / maxRows);
      const row = groupIdx % maxRows;
      const col = baseCol + localCol;
      state.iconPositions.set(tool.id, { x: pad + col * (cellW + autoGapX), y: pad + row * (cellH + autoGapY) });
    });
  }
  state.sortMode = mode;
  saveSortMode();
  saveIconPositions();
}

function snapIconToGrid(pos) {
  const cellW = 108;
  const cellH = 108;
  const pad = 10;
  const maxX = Math.max(pad, state.desktop.clientWidth - 86);
  const maxY = Math.max(pad, state.desktop.clientHeight - 86);
  const x = pad + Math.round((pos.x - pad) / cellW) * cellW;
  const y = pad + Math.round((pos.y - pad) / cellH) * cellH;
  return {
    x: Math.max(pad, Math.min(maxX, x)),
    y: Math.max(pad, Math.min(maxY, y))
  };
}

function saveDividerOffset() {
  scheduleShellCacheSave();
}

function getToolTitle(tool) {
  const custom = state.customTitles.get(tool.id);
  if (custom) return custom;
  return tool.title || tool.id;
}

function getToolById(id) {
  return getPermittedTools().find((t) => t.id === id) || null;
}

function bounds() {
  return {
    left: 0,
    top: 0,
    right: state.desktop.clientWidth,
    bottom: state.desktop.clientHeight
  };
}

function getToolMinSize(toolId) {
  void toolId;
  return { minW: 480, minH: 280 };
}

function getToolMaxSize(toolId) {
  void toolId;
  return { maxW: Number.POSITIVE_INFINITY, maxH: Number.POSITIVE_INFINITY };
}

function clampRect(rect, toolId = '') {
  const b = bounds();
  const { minW, minH } = getToolMinSize(toolId);
  const { maxW, maxH } = getToolMaxSize(toolId);
  const width = Math.max(minW, Math.min(rect.width, Math.min(b.right, maxW)));
  const height = Math.max(minH, Math.min(rect.height, Math.min(b.bottom, maxH)));
  const left = Math.max(b.left, Math.min(rect.left, b.right - width));
  const top = Math.max(b.top, Math.min(rect.top, b.bottom - height));
  return { left, top, width, height };
}

function applyRect(win, rect) {
  win.rect = clampRect(rect, win.tool?.id || '');
  win.el.style.left = `${win.rect.left}px`;
  win.el.style.top = `${win.rect.top}px`;
  win.el.style.width = `${win.rect.width}px`;
  win.el.style.height = `${win.rect.height}px`;
}

function bringToFront(win) {
  state.windowLayerOrder = state.windowLayerOrder.filter((id) => id !== win.tool.id);
  state.windowLayerOrder.push(win.tool.id);
  state.windowLayerOrder.forEach((id, idx) => {
    const target = state.windowsById.get(id) || (id === win.tool.id ? win : null);
    if (!target) return;
    target.el.style.zIndex = String(30 + idx);
  });
}

function renderTaskbar() {
  state.taskbar.innerHTML = '';
  const currentOrder = [
    ...state.pinnedToolIds,
    ...state.openOrder.filter((id) => !state.pinnedToolIds.has(id))
  ];
  const SLOT_W = 54; // 48px icon + 6px visual gap
  const btnById = new Map();

  const applyPositions = (activeId = null, activeLeft = null) => {
    currentOrder.forEach((id, idx) => {
      const b = btnById.get(id);
      if (!b) return;
      if (activeId === id && typeof activeLeft === 'number') {
        b.style.left = `${activeLeft}px`;
      } else {
        b.style.left = `${idx * SLOT_W}px`;
      }
    });
  };

  currentOrder.forEach((id) => {
    const win = state.windowsById.get(id);
    const tool = getToolById(id) || (win ? win.tool : null);
    if (!tool) return;
    const isOpen = !!win;
    const isMin = !!(win && win.minimized);
    const btn = document.createElement('button');
    btn.className = `taskbar-tool ${isOpen ? 'is-open' : ''} ${isMin ? 'is-min' : ''}`;
    btn.innerHTML = `
      <span class="taskbar-tool-icon">${ICON[id] || ''}</span>
      <span class="taskbar-open-dot"></span>
      ${id === 'ai-manager' ? '<span class="taskbar-tool-badge" hidden></span>' : ''}
    `;
    btn.setAttribute('data-taskbar-id', id);
    btn.title = getToolTitle(tool);
    btnById.set(id, btn);
    let dragging = null;
    let blockClick = false;
    let holdPreviewTimer = null;
    const endTaskbarDrag = (e, isCancel = false) => {
      if (!dragging) return;
      const wasMoved = dragging.moved;
      const lastLeft = dragging.currentLeftPx;
      dragging = null;
      btn.classList.remove('is-reordering');
      document.body.classList.remove('taskbar-dragging');
      if (!isCancel) {
        btn.style.transition = '';
        applyPositions();
        const finalIdx = currentOrder.indexOf(id);
        const finalLeft = Math.max(0, finalIdx * SLOT_W);
        const dxSnap = finalLeft - lastLeft;
        btn.style.transform = `translateX(${dxSnap}px)`;
        requestAnimationFrame(() => { btn.style.transform = ''; });
      } else {
        btn.style.transition = '';
        applyPositions();
      }
      if (wasMoved && !isCancel) {
        const orderedIds = [...currentOrder];
        const pinned = orderedIds.filter((taskbarId) => state.pinnedToolIds.has(taskbarId));
        const opened = orderedIds.filter((taskbarId) => !state.pinnedToolIds.has(taskbarId) && state.windowsById.has(taskbarId));
        state.pinnedToolIds = new Set(pinned);
        state.openOrder = opened;
        savePinnedTools();
        state.taskbarReorderGuardUntil = Date.now() + 260;
        if (e) {
        e.preventDefault();
          e.stopPropagation();
        }
        setTimeout(() => { blockClick = false; }, 120);
      } else {
        blockClick = false;
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (holdPreviewTimer) clearTimeout(holdPreviewTimer);
      holdPreviewTimer = setTimeout(() => {
        if (!dragging) return;
        btn.classList.add('is-hold-preview');
      }, ICON_HOLD_PREVIEW_MS);
      const idx = currentOrder.indexOf(id);
      dragging = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeftPx: Math.max(0, idx * SLOT_W),
        currentLeftPx: Math.max(0, idx * SLOT_W),
        moved: false
      };
      document.body.classList.add('taskbar-dragging');
      btn.classList.add('is-reordering');
      btn.style.transition = 'none';
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!dragging || dragging.id !== e.pointerId) return;
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (!dragging.moved && Math.abs(dx) <= 6 && Math.abs(dy) <= 6) return;
      if (!dragging.moved) {
        dragging.moved = true;
        blockClick = true;
      }
      const maxLeft = Math.max(0, state.taskbar.clientWidth - 48);
      const liveLeft = Math.max(0, Math.min(maxLeft, dragging.startLeftPx + dx));
      dragging.currentLeftPx = liveLeft;
      btn.style.left = `${liveLeft}px`;

      const curIdx = currentOrder.indexOf(id);
      const desiredIdx = Math.max(0, Math.min(currentOrder.length - 1, Math.round(liveLeft / SLOT_W)));
      if (desiredIdx !== curIdx) {
        const [movedId] = currentOrder.splice(curIdx, 1);
        currentOrder.splice(desiredIdx, 0, movedId);
        applyPositions(id, liveLeft);
      }
    });
    btn.addEventListener('pointerup', (e) => {
      if (!dragging || dragging.id !== e.pointerId) return;
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      endTaskbarDrag(e, false);
    });
    btn.addEventListener('pointercancel', () => {
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      btn.style.transition = '';
      endTaskbarDrag(null, true);
    });
    btn.addEventListener('lostpointercapture', () => {
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      btn.style.transition = '';
      endTaskbarDrag(null, true);
    });
    btn.addEventListener('click', (e) => {
      if (blockClick || Date.now() < state.taskbarReorderGuardUntil) return;
      btn.classList.add('suppress-hover', 'tap-animate');
      setTimeout(() => btn.classList.remove('suppress-hover', 'tap-animate'), 280);
      if (win) {
        toggleMinimize(win);
      } else {
        openTool(tool, btn, { x: e.clientX, y: e.clientY });
      }
    });
    btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      e.stopPropagation();
      state.contextTaskbarToolId = id;
      hideContextMenu();
      showContextMenu(e.clientX, e.clientY, 'taskbar-tool');
    });
    state.taskbar.appendChild(btn);
  });
  applyPositions();
}

function updateTaskbarClock() {
  if (!state.clockEl) return;
  const now = new Date();
  const rawH = now.getHours();
  const ampm = rawH >= 12 ? 'PM' : 'AM';
  const hh = `${((rawH + 11) % 12) + 1}`.padStart(2, '0');
  const mm = `${now.getMinutes()}`.padStart(2, '0');
  const dd = `${now.getDate()}`.padStart(2, '0');
  const mo = `${now.getMonth() + 1}`.padStart(2, '0');
  state.clockEl.innerHTML = `<div>${hh}:${mm} ${ampm}</div><div>${dd}/${mo}/${now.getFullYear()}</div>`;
}

function closeWindow(win, withAnim = true) {
  const finalize = () => {
    win.el.remove();
    state.windowsById.delete(win.tool.id);
    state.windowLayerOrder = state.windowLayerOrder.filter((id) => id !== win.tool.id);
    state.openOrder = state.openOrder.filter((id) => id !== win.tool.id);
    renderTaskbar();
  };
  persistWindowState(win);
  saveWindowStates();
  if (!withAnim) {
    finalize();
        return;
      }
  win.el.animate(
    [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(14px) scale(0.97)' }
    ],
    { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
  ).finished.finally(finalize);
}

function playWindowOpenAnimation(win) {
  win.el.animate(
    [
      { opacity: 0.2, transform: 'translateY(18px) scale(0.97)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ],
    { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
  );
}

function animateWindowMinimize(win, toMinimized) {
  if (win.animatingMin) return;
  win.animatingMin = true;
  const animation = toMinimized
    ? win.el.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(20px) scale(0.97)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
    )
    : win.el.animate(
      [
        { opacity: 0, transform: 'translateY(20px) scale(0.97)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
    );
  return animation.finished.finally(() => {
    if (toMinimized) {
      win.minimized = true;
      win.el.classList.add('is-min');
    } else {
      win.minimized = false;
      win.el.classList.remove('is-min');
    }
    win.animatingMin = false;
    persistWindowState(win);
    saveWindowStates();
    renderTaskbar();
  });
}

function setMaximized(win, value) {
  if (value) {
    if (!win.maximized) win.restoreRect = { ...win.rect };
    win.maximized = true;
    win.minimized = false;
    win.el.classList.add('is-max');
    applyRect(win, { left: 0, top: 0, width: state.desktop.clientWidth, height: state.desktop.clientHeight });
  } else {
    win.maximized = false;
    win.el.classList.remove('is-max');
    applyRect(win, win.restoreRect || { left: 60, top: 40, width: 900, height: 560 });
  }
  persistWindowState(win);
  saveWindowStates();
  renderTaskbar();
}

function toggleMinimize(win) {
  if (win.animatingMin) return;
  if (win.minimized) {
    bringToFront(win);
    win.el.classList.remove('is-min');
    animateWindowMinimize(win, false);
  } else {
    animateWindowMinimize(win, true);
  }
}

function attachDragAndResize(win) {
  const title = win.el.querySelector('.window-titlebar');
  const handles = win.el.querySelectorAll('[data-rz]');
  let drag = null;
  let resize = null;
  let activePointerId = null;
  let interactionWatchdog = 0;
  const refreshInteractionWatchdog = () => {
    if (interactionWatchdog) clearTimeout(interactionWatchdog);
    interactionWatchdog = setTimeout(() => {
      clearInteraction(false);
    }, 2200);
  };
  const clearInteractionWatchdog = () => {
    if (!interactionWatchdog) return;
    clearTimeout(interactionWatchdog);
    interactionWatchdog = 0;
  };
  const beginInteraction = () => {
    win.el.classList.add('is-interacting');
    document.body.classList.add('is-window-interacting');
    refreshInteractionWatchdog();
  };
  const endInteraction = () => {
    win.el.classList.remove('is-interacting');
    document.body.classList.remove('is-window-interacting');
    clearInteractionWatchdog();
  };
  const clearInteraction = (persist = true) => {
    drag = null;
    resize = null;
    activePointerId = null;
    endInteraction();
    if (persist) {
      persistWindowState(win);
      saveWindowStates();
    }
  };

  title.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.window-controls') || win.maximized) return;
    e.preventDefault();
    beginInteraction();
    activePointerId = e.pointerId;
    drag = { x: e.clientX, y: e.clientY, left: win.rect.left, top: win.rect.top };
    title.setPointerCapture(e.pointerId);
    bringToFront(win);
  });
  handles.forEach((h) => h.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || win.maximized) return;
    e.preventDefault();
    beginInteraction();
    activePointerId = e.pointerId;
    resize = {
      dir: h.dataset.rz,
      x: e.clientX,
      y: e.clientY,
      rect: { ...win.rect }
    };
    h.setPointerCapture(e.pointerId);
    bringToFront(win);
  }));
  title.addEventListener('lostpointercapture', () => clearInteraction(true));
  handles.forEach((h) => h.addEventListener('lostpointercapture', () => clearInteraction(true)));
  document.addEventListener('pointermove', (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (drag) {
      refreshInteractionWatchdog();
      applyRect(win, {
        left: drag.left + (e.clientX - drag.x),
        top: drag.top + (e.clientY - drag.y),
        width: win.rect.width,
        height: win.rect.height
      });
        return;
      }
    if (!resize) return;
    refreshInteractionWatchdog();
    let { left, top, width, height } = resize.rect;
    const dx = e.clientX - resize.x;
    const dy = e.clientY - resize.y;
    if (resize.dir.includes('r')) width += dx;
    if (resize.dir.includes('l')) { width -= dx; left += dx; }
    if (resize.dir.includes('b')) height += dy;
    if (resize.dir.includes('t')) { height -= dy; top += dy; }
    applyRect(win, { left, top, width, height });
  });
  document.addEventListener('pointerup', (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    clearInteraction(true);
  });
  document.addEventListener('pointercancel', (e) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    clearInteraction(false);
  });
  window.addEventListener('blur', () => clearInteraction(true));
}

function createWindow(tool, anchorPoint = null) {
  const el = document.createElement('section');
  el.className = 'desktop-window';
  el.setAttribute('data-tool-id', tool.id);
  const titleIconHtml = ICON[tool.id] || '';
  el.innerHTML = `
    <header class="window-titlebar">
      <div class="window-title">
        <span class="window-title-main">
          <span class="window-title-icon">${titleIconHtml}</span>
          <span class="window-title-text">${getToolTitle(tool)}</span>
        </span>
      </div>
      <div class="window-controls">
        <button class="ctl min" aria-label="Minimize"><span class="ctl-icon ctl-icon-min" aria-hidden="true"></span></button>
        <button class="ctl max" aria-label="Maximize"><span class="ctl-icon ctl-icon-max" aria-hidden="true"></span></button>
        <button class="ctl close" aria-label="Close"><span class="ctl-icon ctl-icon-close" aria-hidden="true"></span></button>
      </div>
    </header>
    <iframe class="window-frame" loading="eager" title="${getToolTitle(tool)}"></iframe>
    <span class="rz t" data-rz="t"></span><span class="rz r" data-rz="r"></span><span class="rz b" data-rz="b"></span><span class="rz l" data-rz="l"></span>
    <span class="rz tl" data-rz="tl"></span><span class="rz tr" data-rz="tr"></span><span class="rz bl" data-rz="bl"></span><span class="rz br" data-rz="br"></span>
  `;
  state.layer.appendChild(el);
  const win = {
    tool,
    el,
    rect: { left: 16, top: 42 + state.openOrder.length * 16, width: 980, height: 620 },
    restoreRect: null,
    minimized: false,
    maximized: false
  };
  void anchorPoint;
  const cached = state.persistedWindows.get(tool.id);
  if (cached && cached.rect) {
    win.rect = cached.rect;
    win.restoreRect = cached.restoreRect || null;
    win.minimized = !!cached.minimized;
    win.maximized = !!cached.maximized;
  }
  applyRect(win, win.rect);
  if (win.minimized) win.el.classList.add('is-min');
  if (win.maximized) {
    win.el.classList.add('is-max');
    applyRect(win, { left: 0, top: 0, width: state.desktop.clientWidth, height: state.desktop.clientHeight });
  }
  const frame = el.querySelector('.window-frame');
  frame.src = tool.href;
  frame.addEventListener('load', () => {
    if (tool.id === 'chatbot') return;
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const head = doc.head || doc.getElementsByTagName('head')[0];
      if (head && !head.querySelector('meta[name="viewport"]')) {
        const vp = doc.createElement('meta');
        vp.setAttribute('name', 'viewport');
        vp.setAttribute('content', 'width=device-width, initial-scale=1');
        head.appendChild(vp);
      }
      if (!doc.getElementById('embedded-window-style')) {
        const style = doc.createElement('style');
        style.id = 'embedded-window-style';
        const isDefaultExplorerTool = tool.id === 'mycomputer' || tool.id === 'fileexplorer';
        style.textContent = isDefaultExplorerTool ? `
          /* Keep default explorer tools bound to iframe window size */
          html, body {
            width: 100% !important;
            height: 100% !important;
            min-height: 100% !important;
            max-width: none !important;
            overflow: hidden !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          .win-explorer,
          .xp-body {
            width: 100% !important;
          }
          .win-explorer {
            height: 100% !important;
          }
        ` : `
          /* Reset desktop-shell side effects from shared style.css when tool pages run inside iframe */
          html, body {
            width: auto !important;
            height: auto !important;
            min-height: 100% !important;
            max-width: none !important;
            overflow: auto !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          #app, .app-root, .desktop-view, .desktop-window-layer, .desktop-taskbar-shell {
            position: static !important;
            inset: auto !important;
            transform: none !important;
            width: auto !important;
            height: auto !important;
          }
          main, .main, .content, .container, .wrapper {
            margin-top: 0 !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            width: 100% !important;
            max-width: none !important;
          }
          .tool-shell {
            margin-left: auto !important;
            margin-right: auto !important;
            width: 100% !important;
          }
          #tool-meta-hidden {
            margin-left: auto !important;
            margin-right: auto !important;
            width: min(100%, 1140px) !important;
            max-width: 1140px !important;
          }
        `;
        if (head) head.appendChild(style);
      }
    } catch (_) {}
  });
  const animateCtlTap = (button, cb) => {
    button.classList.add('ctl-tap');
    setTimeout(() => {
      button.classList.remove('ctl-tap');
      cb();
    }, 75);
  };
  const ctlMin = el.querySelector('.ctl.min');
  const ctlMax = el.querySelector('.ctl.max');
  const ctlClose = el.querySelector('.ctl.close');
  ctlMin.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    animateCtlTap(ctlMin, () => toggleMinimize(win));
  });
  ctlMax.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    animateCtlTap(ctlMax, () => setMaximized(win, !win.maximized));
  });
  ctlClose.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    animateCtlTap(ctlClose, () => closeWindow(win, true));
  });
  el.addEventListener('pointerdown', () => bringToFront(win));
  attachDragAndResize(win);
  bringToFront(win);
  persistWindowState(win);
  saveWindowStates();
  return win;
}

function openTool(tool, sourceEl = null, anchorPoint = null) {
  void sourceEl;
  void anchorPoint;
  let deferRender = false;
  let win = state.windowsById.get(tool.id);
  if (!win) {
    win = createWindow(tool, anchorPoint);
    state.windowsById.set(tool.id, win);
    state.windowLayerOrder.push(tool.id);
    state.openOrder.push(tool.id);
    playWindowOpenAnimation(win);
  } else if (win.minimized) {
    bringToFront(win);
    win.el.classList.remove('is-min');
    animateWindowMinimize(win, false);
    deferRender = true;
  } else {
    bringToFront(win);
    playWindowOpenAnimation(win);
  }
  if (!deferRender) renderTaskbar();
}

function ensureContextMenu() {
  if (state.contextMenuEl) return state.contextMenuEl;
  const menu = document.createElement('div');
  menu.className = 'desktop-context-menu';
  menu.innerHTML = '';
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    const action = item.getAttribute('data-action');
    if (action === 'rename') {
      triggerRenameSelectedTool();
    } else if (action === 'pin-taskbar') {
      if (selectionState.currentToolId) {
        if (state.pinnedToolIds.has(selectionState.currentToolId)) {
          state.pinnedToolIds.delete(selectionState.currentToolId);
        } else {
          state.pinnedToolIds.add(selectionState.currentToolId);
        }
        savePinnedTools();
        renderTaskbar();
      }
    } else if (action === 'unpin-taskbar') {
      if (state.contextTaskbarToolId && state.pinnedToolIds.has(state.contextTaskbarToolId)) {
        state.pinnedToolIds.delete(state.contextTaskbarToolId);
        savePinnedTools();
        renderTaskbar();
      }
    } else if (action === 'refresh') {
      refreshDesktopAndClearCache();
    } else if (action === 'view-size-large' || action === 'view-size-medium' || action === 'view-size-small') {
      state.iconSize = action.replace('view-size-', '');
      applyDesktopViewSettings();
      saveDesktopViewSettings();
    } else if (action === 'view-toggle-icons') {
      state.showDesktopIcons = !state.showDesktopIcons;
      applyDesktopViewSettings();
      saveDesktopViewSettings();
    } else if (action === 'view-auto-arrange') {
      state.autoArrangeIcons = !state.autoArrangeIcons;
      if (state.autoArrangeIcons) {
        state.alignIconsToGrid = true;
        applySortLayout(state.sortMode || 'name');
        renderDesktopIcons();
      }
      saveDesktopViewSettings();
    } else if (action === 'view-align-grid') {
      state.alignIconsToGrid = !state.alignIconsToGrid;
      if (state.alignIconsToGrid && !state.autoArrangeIcons) {
        getDesktopTools().forEach((tool) => {
          const pos = state.iconPositions.get(tool.id);
          if (!pos) return;
          state.iconPositions.set(tool.id, snapIconToGrid(pos));
        });
        saveIconPositions();
        renderDesktopIcons();
      }
      saveDesktopViewSettings();
    } else if (action === 'sort-name' || action === 'sort-group') {
      applySortLayout(action.replace('sort-', ''));
      renderDesktopIcons();
    } else if (action === 'wallpaper-upload') {
      handleWallpaperUpload();
    } else if (action && action.startsWith('wallpaper-preset:')) {
      const id = action.slice('wallpaper-preset:'.length);
      const preset = WALLPAPER_PRESETS.find((item) => item.id === id);
      if (preset) setWallpaper({ type: preset.type, value: preset.value });
    }
    hideContextMenu();
  });
  document.body.appendChild(menu);
  state.contextMenuEl = menu;
  return menu;
}

function hideContextMenu() {
  if (!state.contextMenuEl) return;
  state.contextMenuEl.classList.remove('is-visible');
  state.contextTaskbarToolId = null;
}

function toggleStartPanel(force) {
  if (!state.startPanelEl) return;
  const panel = state.startPanelEl;
  const isOpen = panel.classList.contains('is-open');
  const isClosing = panel.classList.contains('is-closing');
  const next = typeof force === 'boolean' ? force : !isOpen;
  if (state.startPanelTransitionHandler) {
    panel.removeEventListener('transitionend', state.startPanelTransitionHandler);
    state.startPanelTransitionHandler = null;
  }
  if (state.startPanelCloseTimer) {
    clearTimeout(state.startPanelCloseTimer);
    state.startPanelCloseTimer = null;
  }
  if (next) {
    renderStartPanelTools();
    panel.hidden = false;
    panel.classList.remove('is-closing');
    panel.setAttribute('aria-hidden', 'false');
    panel.getBoundingClientRect();
    requestAnimationFrame(() => {
      panel.classList.add('is-open');
    });
    return;
  }
  if (!isOpen && !isClosing) return;
  panel.classList.remove('is-open');
  panel.classList.add('is-closing');
  panel.setAttribute('aria-hidden', 'true');
  state.startPanelCloseTimer = setTimeout(() => {
    panel.classList.remove('is-closing');
    panel.hidden = true;
    state.startPanelCloseTimer = null;
  }, 280);
  const onEnd = (e) => {
    if (e.propertyName !== 'transform') return;
    if (state.startPanelCloseTimer) {
      clearTimeout(state.startPanelCloseTimer);
      state.startPanelCloseTimer = null;
    }
    panel.classList.remove('is-closing');
    panel.hidden = true;
    panel.removeEventListener('transitionend', onEnd);
    state.startPanelTransitionHandler = null;
  };
  state.startPanelTransitionHandler = onEnd;
  panel.addEventListener('transitionend', onEnd);
}

function contextIcon(kind = 'dot') {
  const map = {
    view: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/></svg>',
    sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v14M8 18l-3-3M8 18l3-3M16 20V6M16 6l-3 3M16 6l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.2-10.2a2.2 2.2 0 0 0-3.1-3.1L4.9 16.9 4 20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l-1.8 5 3.8 3.8H6l3.8-3.8L8 4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 12.8V20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    unpin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l-1.8 5 3.8 3.8H6l3.8-3.8L8 4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 5l14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    wallpaper: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 16.5 10.2 12.8l2.7 2.5 3.5-4.1 1.1 1.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="9.2" r="1.1"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8.5 7.5 12 4l3.5 3.5M5 16.5v1A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    setup: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.2 12a7.2 7.2 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.2 7.2 0 0 0-.1 1c0 .3 0 .7.1 1l-2 1.5 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.2"/></svg>'
  };
  return `<span class="desktop-context-icon">${map[kind] || map.dot}</span>`;
}

function contextLabel(kind, text, checked = false) {
  return `<span class="desktop-context-check" aria-hidden="true">${checked ? '✓' : ''}</span>${contextIcon(kind)}<span class="desktop-context-label">${text}</span>`;
}

function showContextMenu(x, y, type = 'desktop') {
  const menu = ensureContextMenu();
  state.contextMenuType = type;
  menu.setAttribute('data-menu-type', type);
  if (type === 'icon') {
    const pinLabel = selectionState.currentToolId && state.pinnedToolIds.has(selectionState.currentToolId)
      ? 'Unpin from taskbar'
      : 'Pin to taskbar';
    menu.innerHTML = `
      <button type="button" class="desktop-context-item" data-action="rename">${contextLabel('rename', 'Rename')}</button>
      <button type="button" class="desktop-context-item" data-action="pin-taskbar">${contextLabel('pin', pinLabel)}</button>
    `;
  } else if (type === 'desktop') {
    const wallpaperPresetItems = WALLPAPER_PRESETS
      .map((item) => `<button type="button" class="desktop-context-item" data-action="wallpaper-preset:${item.id}">${contextLabel('wallpaper', item.label.replace('Wallpaper: ', ''))}</button>`)
      .join('');
    menu.innerHTML = `
      <div class="desktop-context-parent">
        <button type="button" class="desktop-context-item has-submenu" aria-haspopup="true">
          <span class="desktop-context-main">${contextLabel('view', 'View')}</span><span class="desktop-context-arrow">›</span>
        </button>
        <div class="desktop-context-submenu">
          <button type="button" class="desktop-context-item ${state.iconSize === 'large' ? 'is-checked' : ''}" data-action="view-size-large">${contextLabel('view', 'Large icons', state.iconSize === 'large')}</button>
          <button type="button" class="desktop-context-item ${state.iconSize === 'medium' ? 'is-checked' : ''}" data-action="view-size-medium">${contextLabel('view', 'Medium icons', state.iconSize === 'medium')}</button>
          <button type="button" class="desktop-context-item ${state.iconSize === 'small' ? 'is-checked' : ''}" data-action="view-size-small">${contextLabel('view', 'Small icons', state.iconSize === 'small')}</button>
          <div class="desktop-context-sep"></div>
          <button type="button" class="desktop-context-item ${state.autoArrangeIcons ? 'is-checked' : ''}" data-action="view-auto-arrange">${contextLabel('dot', 'Auto arrange icons', state.autoArrangeIcons)}</button>
          <button type="button" class="desktop-context-item ${state.alignIconsToGrid ? 'is-checked' : ''}" data-action="view-align-grid">${contextLabel('dot', 'Align icons to grid', state.alignIconsToGrid)}</button>
          <button type="button" class="desktop-context-item ${state.showDesktopIcons ? 'is-checked' : ''}" data-action="view-toggle-icons">${contextLabel('dot', 'Show desktop icons', state.showDesktopIcons)}</button>
        </div>
      </div>
      <div class="desktop-context-parent">
        <button type="button" class="desktop-context-item has-submenu" aria-haspopup="true">
          <span class="desktop-context-main">${contextLabel('sort', 'Sort by')}</span><span class="desktop-context-arrow">›</span>
        </button>
        <div class="desktop-context-submenu">
          <button type="button" class="desktop-context-item ${state.sortMode === 'name' ? 'is-checked' : ''}" data-action="sort-name">${contextLabel('sort', 'Name', state.sortMode === 'name')}</button>
          <button type="button" class="desktop-context-item ${state.sortMode === 'group' ? 'is-checked' : ''}" data-action="sort-group">${contextLabel('sort', 'Group', state.sortMode === 'group')}</button>
          <button type="button" class="desktop-context-item is-disabled" disabled>${contextLabel('sort', 'Date modified')}</button>
        </div>
      </div>
      <button type="button" class="desktop-context-item" data-action="refresh">${contextLabel('refresh', 'Refresh')}</button>
      <div class="desktop-context-sep"></div>
      <div class="desktop-context-parent">
        <button type="button" class="desktop-context-item has-submenu" aria-haspopup="true">
          <span class="desktop-context-main">${contextLabel('wallpaper', 'Change desktop background')}</span><span class="desktop-context-arrow">›</span>
        </button>
        <div class="desktop-context-submenu">
          ${wallpaperPresetItems}
          <div class="desktop-context-sep"></div>
          <button type="button" class="desktop-context-item" data-action="wallpaper-upload">${contextLabel('upload', 'Upload image...')}</button>
        </div>
      </div>
    `;
  } else if (type === 'taskbar') {
    menu.innerHTML = `
      <button type="button" class="desktop-context-item is-disabled" data-action="setup-taskbar" disabled>${contextLabel('setup', 'Setup taskbar (Developing)')}</button>
    `;
  } else if (type === 'taskbar-tool') {
    const canUnpin = !!(state.contextTaskbarToolId && state.pinnedToolIds.has(state.contextTaskbarToolId));
    menu.innerHTML = canUnpin
      ? `<button type="button" class="desktop-context-item is-destructive" data-action="unpin-taskbar">${contextLabel('unpin', 'Unpin from taskbar')}</button>`
      : `<button type="button" class="desktop-context-item is-disabled" data-action="unpin-taskbar" disabled>${contextLabel('unpin', 'Unpin from taskbar')}</button>`;
  }
  const margin = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const rect = menu.getBoundingClientRect();
  let finalX = x;
  let finalY = y;
  if (type === 'taskbar') {
    finalY = y - rect.height - 10;
  }
  if (finalX + rect.width > viewportW - margin) finalX = viewportW - rect.width - margin;
  if (finalY + rect.height > viewportH - margin) finalY = viewportH - rect.height - margin;
  if (finalX < margin) finalX = margin;
  if (finalY < margin) finalY = margin;
  menu.style.left = `${finalX}px`;
  menu.style.top = `${finalY}px`;
  menu.querySelectorAll('.desktop-context-submenu').forEach((sub) => {
    sub.classList.remove('open-left');
    const subRect = sub.getBoundingClientRect();
    if (subRect.right > viewportW - margin) sub.classList.add('open-left');
  });
  menu.classList.add('is-visible');
}

async function refreshDesktopAndClearCache() {
  window.location.reload();
}

function triggerOpenFromSelection(targetToolId = null) {
  const toolId = targetToolId || selectionState.currentToolId;
  if (!toolId || state.renamingToolId) return;
  const tool = getToolById(toolId);
  const btn = state.iconList.querySelector(`[data-tool-id="${toolId}"]`);
  if (!tool || !btn) return;
  btn.classList.add('suppress-hover', 'tap-animate');
  setTimeout(() => btn.classList.remove('suppress-hover', 'tap-animate'), 280);
  setTimeout(() => openTool(tool, btn), 120);
}

function moveSelectionByKeyboard(direction) {
  if (!state.renderedToolIds.length) return;
  if (!selectionState.currentToolId) {
    setSelectedTool(state.renderedToolIds[0], true);
    return;
  }
  const currentInfo = state.navIndexMap.get(selectionState.currentToolId);
  if (!currentInfo || !state.navColumns.length) return;

  if (direction === 'down' || direction === 'up') {
    let col = currentInfo.col;
    let row = currentInfo.row + (direction === 'down' ? 1 : -1);
    if (row >= state.navColumns[col].length || row < 0) {
      col += direction === 'down' ? 1 : -1;
      if (col >= state.navColumns.length) col = 0;
      if (col < 0) col = state.navColumns.length - 1;
      row = direction === 'down' ? 0 : state.navColumns[col].length - 1;
    }
    const nextId = state.navColumns[col][row];
    if (nextId) setSelectedTool(nextId, true);
        return;
      }

  const currentBtn = state.iconList.querySelector(`[data-tool-id="${selectionState.currentToolId}"]`);
  if (!currentBtn) return;
  const currentRect = currentBtn.getBoundingClientRect();
  const currentCx = currentRect.left + currentRect.width / 2;
  const currentCy = currentRect.top + currentRect.height / 2;
  let bestId = null;
  let bestScore = Number.POSITIVE_INFINITY;
  state.renderedToolIds.forEach((id) => {
    if (id === selectionState.currentToolId) return;
    const btn = state.iconList.querySelector(`[data-tool-id="${id}"]`);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - currentCx;
    const dy = cy - currentCy;
    if (direction === 'left' && dx >= -2) return;
    if (direction === 'right' && dx <= 2) return;
    const score = Math.abs(dx) * 10 + Math.abs(dy);
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  });
  if (bestId) setSelectedTool(bestId, true);
}

function syncSelectionVisual(animate = true, version = selectionState.version) {
  const id = selectionState.currentToolId;
  document.querySelectorAll('.desktop-tool').forEach((el) => {
    el.classList.remove('is-selected', 'select-pulse', 'suppress-hover');
    const isActive = el.getAttribute('data-tool-id') === id;
    if (!isActive) return;
    el.classList.add('is-selected');
    if (isActive && animate) {
      el.classList.add('suppress-hover');
  setTimeout(() => {
        if (version !== selectionState.version) return;
        el.classList.remove('suppress-hover');
      }, 120);
    }
  });
}

function suppressOldSelectedVisual(el, duration = 420) {
  if (!el) return;
  el.classList.remove('is-selected', 'select-pulse');
  el.classList.add('force-hide-hover', 'suppress-hover');
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    el.classList.remove('force-hide-hover', 'suppress-hover');
    el.removeEventListener('pointerleave', cleanup);
  };
  el.addEventListener('pointerleave', cleanup);
  setTimeout(cleanup, duration);
}

function runSelectionTransition(prevEl, nextEl, animate = true) {
  if (!animate) return;
  suppressOldSelectedVisual(prevEl, 320);
  if (nextEl) {
    nextEl.classList.add('suppress-hover');
    setTimeout(() => nextEl.classList.remove('suppress-hover'), 120);
  }
}

function setSelectedTool(id, animate = true) {
  const prevId = selectionState.currentToolId;
  const prevEl = prevId ? state.iconList.querySelector(`[data-tool-id="${prevId}"]`) : null;
  const nextEl = id ? state.iconList.querySelector(`[data-tool-id="${id}"]`) : null;
  if (prevId !== id) {
    runSelectionTransition(prevEl, nextEl, animate);
  }
  selectionState.currentToolId = id || null;
  selectionState.version += 1;
  state.selectedToolId = selectionState.currentToolId;
  syncSelectionVisual(animate, selectionState.version);
}

function clearSelection() {
  setSelectedTool(null, false);
}

function triggerRenameSelectedTool() {
  if (!selectionState.currentToolId) return;
  beginInlineRename(selectionState.currentToolId);
}

function beginInlineRename(toolId) {
  const tool = getToolById(toolId);
  if (!tool) return;
  const restoreSelectedToolId = toolId;
  clearSelection();
  state.renamingToolId = toolId;
  const btn = state.iconList.querySelector(`[data-tool-id="${toolId}"]`);
  if (!btn) return;
  btn.classList.add('is-renaming');
  const labelEl = btn.querySelector('.desktop-tool-label');
  if (!labelEl) return;
  labelEl.classList.add('is-renaming');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'desktop-rename-input';
  input.value = getToolTitle(tool);
  btn.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (commit && next) {
      state.customTitles.set(toolId, next);
      saveCustomTitles();
    }
    state.renamingToolId = null;
    renderDesktopIcons();
    renderTaskbar();
    setSelectedTool(restoreSelectedToolId, false);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

function renderDesktopIcons() {
  state.iconList.innerHTML = '';
  const cellW = 108;
  const cellH = 108;
  const pad = 10;
  const desktopTools = getDesktopTools();
  state.renderedToolIds = desktopTools.map((t) => t.id);

  const navPoints = [];
  desktopTools.forEach((tool) => {
    const btn = document.createElement('button');
    btn.className = 'desktop-tool';
    btn.setAttribute('data-tool-id', tool.id);
    btn.innerHTML = `
      <span class="desktop-tool-spotlight" aria-hidden="true"></span>
      <span class="desktop-tool-icon">${ICON[tool.id] || ''}</span>
      <span class="desktop-tool-label">${getToolTitle(tool)}</span>
      ${tool.id === 'ai-manager' ? '<span class="desktop-tool-badge" hidden></span>' : ''}
    `;
    let pos = state.iconPositions.get(tool.id);
    if (!pos) {
      const idx = desktopTools.findIndex((t) => t.id === tool.id);
      const maxCols = Math.max(1, Math.floor((state.desktop.clientWidth - pad * 2) / cellW));
      const col = idx % maxCols;
      const row = Math.floor(idx / maxCols);
      pos = { x: pad + col * cellW, y: pad + row * cellH };
      state.iconPositions.set(tool.id, pos);
    }
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;
    navPoints.push({ id: tool.id, x: pos.x, y: pos.y });

    const updateSpotlight = () => {
      const iconEl = btn.querySelector('.desktop-tool-icon');
      const labelEl = btn.querySelector('.desktop-tool-label');
      const lightEl = btn.querySelector('.desktop-tool-spotlight');
      if (!iconEl || !labelEl || !lightEl) return;
      const btnRect = btn.getBoundingClientRect();
      const iconRect = iconEl.getBoundingClientRect();
      const labelRect = labelEl.getBoundingClientRect();
      const left = Math.min(iconRect.left, labelRect.left) - btnRect.left - 8;
      const top = Math.min(iconRect.top, labelRect.top) - btnRect.top - 6;
      const right = Math.max(iconRect.right, labelRect.right) - btnRect.left + 8;
      const bottom = Math.max(iconRect.bottom, labelRect.bottom) - btnRect.top + 6;
      lightEl.style.left = `${left}px`;
      lightEl.style.top = `${top}px`;
      lightEl.style.width = `${Math.max(20, right - left)}px`;
      lightEl.style.height = `${Math.max(20, bottom - top)}px`;
    };

    requestAnimationFrame(updateSpotlight);
    btn.addEventListener('pointerenter', updateSpotlight);
    btn.addEventListener('focus', updateSpotlight);

    let drag = null;
    let renameClickTimer = null;
    let holdPreviewTimer = null;
    btn.addEventListener('pointerdown', (e) => {
      if (state.renamingToolId) return;
      if (holdPreviewTimer) clearTimeout(holdPreviewTimer);
      holdPreviewTimer = setTimeout(() => {
        if (!drag) return;
        btn.classList.add('is-hold-preview');
      }, ICON_HOLD_PREVIEW_MS);
      if (renameClickTimer) {
        clearTimeout(renameClickTimer);
        renameClickTimer = null;
      }
      hideContextMenu();
      drag = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: pos.x,
        baseY: pos.y,
        moved: false
      };
      btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
      if (state.renamingToolId) return;
      if (!drag || drag.id !== e.pointerId) return;
      if (state.autoArrangeIcons) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      const maxX = Math.max(pad, state.desktop.clientWidth - 86);
      const maxY = Math.max(pad, state.desktop.clientHeight - 86);
      pos = {
        x: Math.max(pad, Math.min(maxX, drag.baseX + dx)),
        y: Math.max(pad, Math.min(maxY, drag.baseY + dy))
      };
      state.iconPositions.set(tool.id, pos);
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
    });
    btn.addEventListener('pointerup', (e) => {
      if (state.renamingToolId) return;
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      if (drag && drag.id === e.pointerId) {
        const wasMoved = drag.moved;
        drag = null;
        if (wasMoved) {
          if (state.alignIconsToGrid && !state.autoArrangeIcons) {
            pos = snapIconToGrid(pos);
            state.iconPositions.set(tool.id, pos);
            btn.style.left = `${pos.x}px`;
            btn.style.top = `${pos.y}px`;
          }
          saveIconPositions();
    return;
  }
      }
      const wasSelected = selectionState.currentToolId === tool.id;
      const tappedLabel = !!e.target.closest('.desktop-tool-label');
      setSelectedTool(tool.id);
      if (wasSelected && tappedLabel) {
        renameClickTimer = setTimeout(() => {
          renameClickTimer = null;
          if (selectionState.currentToolId === tool.id && !state.renamingToolId) {
            beginInlineRename(tool.id);
          }
        }, 260);
      }
    });
    btn.addEventListener('dblclick', () => {
      if (state.renamingToolId) return;
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      if (renameClickTimer) {
        clearTimeout(renameClickTimer);
        renameClickTimer = null;
      }
      setSelectedTool(tool.id, false);
       btn.classList.add('suppress-hover', 'tap-animate');
       let opened = false;
       const openAfterAnim = () => {
         if (opened) return;
         opened = true;
         btn.classList.remove('suppress-hover', 'tap-animate');
         openTool(tool, btn);
       };
       const onAnimEnd = () => {
         btn.removeEventListener('animationend', onAnimEnd);
         openAfterAnim();
       };
       btn.addEventListener('animationend', onAnimEnd);
       setTimeout(() => {
         btn.removeEventListener('animationend', onAnimEnd);
         openAfterAnim();
       }, 320);
    });
    btn.addEventListener('contextmenu', (e) => {
      if (state.renamingToolId) return;
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
      e.preventDefault();
      setSelectedTool(tool.id, false);
      showContextMenu(e.clientX, e.clientY, 'icon');
    });
    btn.addEventListener('pointercancel', () => {
      if (holdPreviewTimer) {
        clearTimeout(holdPreviewTimer);
        holdPreviewTimer = null;
      }
      btn.classList.remove('is-hold-preview');
    });

    state.iconList.appendChild(btn);
  });

  const grouped = new Map();
  navPoints.forEach((p) => {
    const key = Math.round(p.x / 10) * 10;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  });
  const sortedX = Array.from(grouped.keys()).sort((a, b) => a - b);
  state.navColumns = sortedX.map((xKey) => grouped.get(xKey).sort((a, b) => a.y - b.y).map((p) => p.id));
  state.navIndexMap = new Map();
  state.navColumns.forEach((colItems, colIdx) => {
    colItems.forEach((id, rowIdx) => {
      state.navIndexMap.set(id, { col: colIdx, row: rowIdx });
    });
  });

  if (selectionState.currentToolId) setSelectedTool(selectionState.currentToolId, false);
}

function updateAiManagerBadges() {
  const total = Number(localStorage.getItem('ai_manager_unread_total') || 0);
  const text = total > 99 ? '99+' : String(total);
  document.querySelectorAll('.desktop-tool-badge, .taskbar-tool-badge').forEach((el) => {
    if (!el) return;
    el.textContent = text;
    el.hidden = total <= 0;
  });
}

function renderStartPanelTools() {
  const listEl = document.getElementById('startToolList');
  if (!listEl) return;
  listEl.innerHTML = '';
  const allStartTools = getStartMenuTools();
  const groups = ['AI', 'Code', 'Image'];

  groups.forEach((groupName) => {
    const groupTools = allStartTools.filter((tool) => (TOOL_GROUPS[tool.id] || 'Code') === groupName);
    if (!groupTools.length) return;

    const section = document.createElement('section');
    section.className = 'start-tool-group';
    section.innerHTML = `<div class="start-tool-group-title">${groupName}</div>`;

    const grid = document.createElement('div');
    grid.className = 'start-tool-grid';
    groupTools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'start-tool-item';
      btn.setAttribute('data-tool-id', tool.id);
      btn.innerHTML = `
        <span class="start-tool-item-icon">${ICON[tool.id] || ''}</span>
        <span class="start-tool-item-label">${getToolTitle(tool)}</span>
      `;
      btn.addEventListener('click', () => {
        openTool(tool, btn);
        toggleStartPanel(false);
      });
      grid.appendChild(btn);
    });

    section.appendChild(grid);
    listEl.appendChild(section);
  });
}

function isGlobalMobileBlocked() {
  return window.innerWidth < GLOBAL_MOBILE_MIN_WIDTH || window.innerHeight < GLOBAL_MOBILE_MIN_HEIGHT;
}

function isWin11AuthShellVisible() {
  const shell = document.getElementById('win11AuthShell');
  return Boolean(shell && shell.classList.contains('is-visible'));
}

function syncGlobalMobileGate() {
  const gateEl = document.getElementById('global-mobile-gate');
  // Khi đang đăng nhập: không bật gate — mở DevTools / F11 làm innerHeight nhỏ nhưng vẫn cần thấy form login.
  const blocked = isGlobalMobileBlocked() && !isWin11AuthShellVisible();
  if (gateEl) {
    gateEl.hidden = !blocked;
    gateEl.setAttribute('aria-hidden', blocked ? 'false' : 'true');
  }
  document.body.classList.toggle('mobile-mode-blocked', blocked);
  return blocked;
}

async function initDesktopShell() {
  await loadPersistedState();
  applyWallpaperConfig(loadWallpaperConfig());
  state.desktop = document.getElementById('desktopView');
  state.layer = document.getElementById('desktopWindowLayer');
  state.topLayer = document.getElementById('desktopTopLayer');
  state.iconList = document.getElementById('desktopIcons');
  state.taskbar = document.getElementById('desktopTaskbarApps');
  state.clockEl = document.getElementById('taskbarClock');
  state.startPanelEl = document.getElementById('desktopStartPanel');
  state.startBtnEl = document.getElementById('taskbarStart');
  const startLogoutBtn = document.getElementById('startLogoutBtn');
  if (!state.desktop || !state.layer || !state.iconList || !state.taskbar || !state.clockEl) {
    console.error('Desktop shell init aborted: missing required DOM nodes.', {
      desktop: !!state.desktop,
      layer: !!state.layer,
      iconList: !!state.iconList,
      taskbar: !!state.taskbar,
      clock: !!state.clockEl
    });
    return;
  }
  if (!state.topLayer) {
    const topLayer = document.createElement('div');
    topLayer.id = 'desktopTopLayer';
    topLayer.className = 'desktop-top-layer';
    document.body.appendChild(topLayer);
    state.topLayer = topLayer;
  }
  if (state.startBtnEl) {
    state.startBtnEl.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        toggleStartPanel();
      },
      true
    );
  }
  if (startLogoutBtn) {
    startLogoutBtn.addEventListener('click', async () => {
      toggleStartPanel(false);
      await logout();
      desktopShellBootstrapped = false;
      clearSelection();
    });
  }
  if (state.startPanelEl) {
    state.startPanelEl.hidden = true;
    state.startPanelEl.classList.remove('is-open', 'is-closing');
    state.startPanelEl.setAttribute('aria-hidden', 'true');
  }
  renderStartPanelTools();
  const divider = document.getElementById('taskbarDivider');
  if (divider) {
    let startX = 0;
    let base = state.dividerOffset;
    const apply = (v) => {
      state.dividerOffset = Math.max(8, Math.min(v, 360));
      state.taskbar.style.paddingLeft = `${state.dividerOffset}px`;
    };
    apply(state.dividerOffset);
    divider.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      base = state.dividerOffset;
      divider.setPointerCapture(e.pointerId);
    });
    divider.addEventListener('pointermove', (e) => {
      if (!(e.buttons & 1)) return;
      apply(base + (e.clientX - startX));
    });
    divider.addEventListener('pointerup', () => saveDividerOffset());
  }
  if (!state.iconPositions.size) {
    applySortLayout(state.sortMode || 'name');
  }
  renderDesktopIcons();
  applyDesktopViewSettings();
  renderTaskbar();
  updateAiManagerBadges();
  updateTaskbarClock();
  // removed test push button
  setInterval(updateTaskbarClock, 1000);
  setInterval(updateAiManagerBadges, 3000);
  window.addEventListener('storage', (event) => {
    if (event.key === 'ai_manager_unread_total') {
      updateAiManagerBadges();
    }
  });
  state.desktop.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.desktop-tool')) {
      clearSelection();
      hideContextMenu();
    }
  });
  state.desktop.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desktop-tool') || e.target.closest('.desktop-window')) return;
    e.preventDefault();
    clearSelection();
    showContextMenu(e.clientX, e.clientY, 'desktop');
  });
  const taskbarShell = document.getElementById('desktopTaskbar');
  if (taskbarShell) {
    taskbarShell.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.taskbar-tool')) return;
      e.preventDefault();
      hideContextMenu();
      showContextMenu(e.clientX, e.clientY, 'taskbar');
    });
  }
  document.addEventListener('keydown', (e) => {
    if (state.renamingToolId) return;
    if (e.key === 'F2') {
      e.preventDefault();
      triggerRenameSelectedTool();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      moveSelectionByKeyboard('left');
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      moveSelectionByKeyboard('right');
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelectionByKeyboard('up');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelectionByKeyboard('down');
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerOpenFromSelection();
    }
    if (e.key === 'Escape') {
      hideContextMenu();
      toggleStartPanel(false);
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (
      state.startPanelEl &&
      state.startPanelEl.classList.contains('is-open') &&
      !e.target.closest('#desktopStartPanel') &&
      !e.target.closest('#taskbarStart')
    ) {
      toggleStartPanel(false);
    }
    if (!e.target.closest('.desktop-context-menu')) {
      hideContextMenu();
    }
  });
  window.addEventListener('resize', () => {
    const blocked = syncGlobalMobileGate();
    if (blocked) return;
    renderDesktopIcons();
    state.windowsById.forEach((win) => {
      if (win.maximized) {
        applyRect(win, { left: 0, top: 0, width: state.desktop.clientWidth, height: state.desktop.clientHeight });
} else {
        applyRect(win, win.rect);
      }
    });
  });
  window.addEventListener('beforeunload', () => {
    state.windowsById.forEach((win) => persistWindowState(win));
    saveWindowStates();
    flushShellCacheNow();
  });
}

async function bootstrapDesktopShell() {
  bindAuthUi();
  const blocked = syncGlobalMobileGate();
  if (blocked || desktopShellBootstrapped) return;
  const currentUser = await fetchCurrentUser();
  if (!currentUser) {
    showAuthShell();
    return;
  }
  authState.user = currentUser;
  authState.allowedToolIds = new Set(Array.isArray(currentUser?.allowedToolIds) ? currentUser.allowedToolIds : []);
  hideAuthShell();
  desktopShellBootstrapped = true;
  await initDesktopShell();
  // Default tool in menu: auto-open CRM API Tester on first load (only once per browser)
  try {
    const key = 'desktop_shell_autostart_crmtester_v1';
    const already = localStorage.getItem(key) === '1';
    if (!already && !state.windowsById.size) {
      const tool = getToolById('crmtester');
      if (tool) openTool(tool, null);
      localStorage.setItem(key, '1');
    }
  } catch (_) {}
}

window.addEventListener('resize', () => {
  const blocked = syncGlobalMobileGate();
  if (!blocked && !desktopShellBootstrapped) {
    bootstrapDesktopShell();
  }
}, { passive: true });

window.desktopShellLogout = logout;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapDesktopShell);
} else {
  bootstrapDesktopShell();
}



