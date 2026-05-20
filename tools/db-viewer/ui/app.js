const API = "/api/db-viewer";

const fileListEl = document.getElementById("fileList");
const searchInput = document.getElementById("searchInput");
const btnReload = document.getElementById("btnReload");
const metaBox = document.getElementById("metaBox");
const previewBox = document.getElementById("previewBox");
const sqliteTools = document.getElementById("sqliteTools");
const tableSelect = document.getElementById("tableSelect");
const btnLoadTable = document.getElementById("btnLoadTable");
const tableWrap = document.getElementById("tableWrap");
const tableView = document.getElementById("tableView");

let allFiles = [];
let selectedFile = "";

async function api(path) {
  const response = await fetch(`${API}${path}`, { credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderFiles() {
  const keyword = String(searchInput.value || "").trim().toLowerCase();
  const files = allFiles.filter((file) => file.toLowerCase().includes(keyword));
  fileListEl.innerHTML = files
    .map((file) => {
      const activeClass = file === selectedFile ? "is-active" : "";
      return `<button type="button" class="dbv-file-item ${activeClass}" data-file="${escapeHtml(file)}">${escapeHtml(file)}</button>`;
    })
    .join("");
}

async function loadFileMetaAndPreview(file) {
  selectedFile = file;
  renderFiles();
  tableWrap.hidden = true;
  tableView.innerHTML = "";

  const [meta, preview] = await Promise.all([
    api(`/file/meta?file=${encodeURIComponent(file)}`),
    api(`/file/preview?file=${encodeURIComponent(file)}`)
  ]);

  metaBox.textContent = `File: ${meta.file} | Size: ${formatBytes(meta.size)} | Ext: ${meta.ext} | Updated: ${meta.modifiedAt}`;
  previewBox.textContent = preview.type === "binary"
    ? `[Binary file - hex preview]\n${preview.preview}`
    : preview.preview;

  const isSqlite = [".sqlite", ".sqlite3", ".db"].includes(String(meta.ext || "").toLowerCase());
  sqliteTools.hidden = !isSqlite;
  if (!isSqlite) return;

  const tablePayload = await api(`/sqlite/tables?file=${encodeURIComponent(file)}`);
  tableSelect.innerHTML = tablePayload.tables
    .map((table) => `<option value="${escapeHtml(table.name)}">${escapeHtml(table.name)} (${table.count})</option>`)
    .join("");
}

function renderTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    tableView.innerHTML = "<tbody><tr><td>Khong co du lieu.</td></tr></tbody>";
    tableWrap.hidden = false;
    return;
  }
  const columns = Object.keys(rows[0]);
  const thead = `<thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join("")}</tr>`).join("")}</tbody>`;
  tableView.innerHTML = `${thead}${tbody}`;
  tableWrap.hidden = false;
}

async function loadSelectedTable() {
  if (!selectedFile) return;
  const tableName = String(tableSelect.value || "");
  if (!tableName) return;
  const payload = await api(
    `/sqlite/table?file=${encodeURIComponent(selectedFile)}&table=${encodeURIComponent(tableName)}&limit=50`
  );
  renderTable(payload.rows || []);
}

async function bootstrap() {
  try {
    const payload = await api("/files");
    allFiles = payload.files || [];
    renderFiles();
    if (allFiles[0]) {
      await loadFileMetaAndPreview(allFiles[0]);
    } else {
      metaBox.textContent = "Khong tim thay file database.";
      previewBox.textContent = "";
    }
  } catch (error) {
    metaBox.textContent = error.message || "Khong the tai danh sach database.";
  }
}

fileListEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".dbv-file-item");
  if (!button) return;
  const file = String(button.getAttribute("data-file") || "");
  if (!file) return;
  await loadFileMetaAndPreview(file);
});

searchInput.addEventListener("input", renderFiles);
btnReload.addEventListener("click", bootstrap);
btnLoadTable.addEventListener("click", loadSelectedTable);

bootstrap();
