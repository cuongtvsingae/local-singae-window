const driveListEl = document.getElementById("drive-list");
const folderListEl = document.getElementById("folder-list");
const pathViewEl = document.getElementById("path-view");
const upBtnEl = document.getElementById("btn-up");
const newFolderBtnEl = document.getElementById("btn-new-folder");
const previewTitleEl = document.getElementById("preview-title");
const previewMetaEl = document.getElementById("preview-meta");

const state = {
  drive: "C",
  relPath: "",
  drives: ["C", "D", "E"],
  selectedName: "",
  rootMode: "explorer"
};
const FS_API_BASE = "/api/windowsshell/fs";

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 80);
}

function joinPath(base, name) {
  const left = String(base || "").replace(/\/+$/g, "");
  const right = String(name || "").replace(/^\/+/g, "");
  return [left, right].filter(Boolean).join("/");
}

function parentPath(rel) {
  const parts = String(rel || "").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function renderDrives() {
  driveListEl.innerHTML = "";
  state.drives.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `drive-btn ${state.drive === d ? "is-active" : ""}`;
    btn.textContent = `${d}:`;
    btn.addEventListener("click", () => {
      state.drive = d;
      state.relPath = "";
      loadFolders();
      renderDrives();
    });
    driveListEl.appendChild(btn);
  });
}

function renderFolders(items) {
  folderListEl.classList.add("is-transitioning");
  setTimeout(() => folderListEl.classList.remove("is-transitioning"), 170);
  folderListEl.innerHTML = "";
  state.selectedName = "";
  renderPreview();
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "xp-row";
    empty.style.opacity = "0.68";
    empty.innerHTML = `<div class="xp-name"><span class="xp-folder-icon">□</span><span class="xp-text-clip">This folder is empty</span></div><div>-</div><div>-</div><div>-</div>`;
    folderListEl.appendChild(empty);
    return;
  }
  items.forEach((it) => {
    const isFolder = it.type === "folder";
    const icon = isFolder ? "▣" : "▤";
    const typeLabel = isFolder ? "File folder" : "File";
    const modified = it.modifiedAt ? new Date(it.modifiedAt).toLocaleDateString() : "Today";
    const sizeLabel = isFolder ? "-" : `${Math.max(1, Math.round((Number(it.size || 0) / 1024) * 10) / 10)} KB`;
    const row = document.createElement("div");
    row.className = "xp-row";
    row.innerHTML = `
      <div class="xp-name">
        <span class="xp-folder-icon">${icon}</span>
        <span class="xp-text-clip" title="${it.name}">${it.name}</span>
      </div>
      <div>${modified}</div>
      <div>${typeLabel}</div>
      <div>${isFolder ? '<button type="button" class="xp-delete" title="Delete folder">×</button>' : sizeLabel}</div>
    `;
    const nameWrap = row.querySelector(".xp-name");
    const deleteBtn = row.querySelector(".xp-delete");
    if (isFolder) {
      nameWrap.addEventListener("dblclick", () => {
        state.relPath = joinPath(state.relPath, it.name);
        loadFolders();
      });
    }
    row.addEventListener("click", () => {
      state.selectedName = it.name;
      folderListEl.querySelectorAll(".xp-row").forEach((el) => el.classList.remove("is-selected"));
      row.classList.add("is-selected");
      renderPreview();
    });
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete folder "${it.name}"?`)) return;
        await api(`${FS_API_BASE}/folder`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ drive: state.drive, path: joinPath(state.relPath, it.name) })
        });
        loadFolders();
      });
    }
    folderListEl.appendChild(row);
  });
}

function driveStats(name) {
  if (name === "C") return { total: "256 GB", free: "162 GB free", usedPct: 37 };
  if (name === "D") return { total: "512 GB", free: "421 GB free", usedPct: 18 };
  return { total: "1 TB", free: "918 GB free", usedPct: 10 };
}

function renderDrivesAsMain() {
  folderListEl.classList.add("is-transitioning");
  setTimeout(() => folderListEl.classList.remove("is-transitioning"), 170);
  folderListEl.innerHTML = `<div class="xp-drive-group-title">Devices and drives</div>`;
  state.drives.forEach((d) => {
    const stat = driveStats(d);
    const row = document.createElement("div");
    row.className = "xp-drive-card";
    row.innerHTML = `
      <div class="xp-drive-name">${d}:</div>
      <div class="xp-drive-bar"><span style="width:${Math.max(6, 100 - stat.usedPct)}%"></span></div>
      <div class="xp-drive-meta">${stat.free} of ${stat.total}</div>
    `;
    row.addEventListener("click", () => {
      state.selectedName = `${d}:`;
      state.drive = d;
      folderListEl.querySelectorAll(".xp-drive-card").forEach((el) => el.classList.remove("is-selected"));
      row.classList.add("is-selected");
      renderPreview();
    });
    row.addEventListener("dblclick", () => {
      state.drive = d;
      state.relPath = "";
      loadFolders();
      renderDrives();
    });
    folderListEl.appendChild(row);
  });
}

function renderPreview() {
  if (!state.selectedName) {
    previewTitleEl.textContent = state.rootMode === "mycomputer" && !state.relPath ? "This PC" : "No item selected";
    previewMetaEl.textContent = state.rootMode === "mycomputer" && !state.relPath
      ? "Select a drive to view details."
      : "Select a folder to view details.";
    return;
  }
  previewTitleEl.textContent = state.selectedName;
  if (state.selectedName.endsWith(":")) {
    const stat = driveStats(state.selectedName[0]);
    previewMetaEl.textContent = `Type: Local Disk\nFree space: ${stat.free}\nTotal size: ${stat.total}`;
    return;
  }
  previewMetaEl.textContent = `Location: ${state.drive}:/${state.relPath || ""}\nType: File folder`;
}

async function loadFolders() {
  if (state.rootMode === "mycomputer" && !state.relPath) {
    pathViewEl.textContent = "This PC";
    renderDrivesAsMain();
    upBtnEl.disabled = true;
    return;
  }
  const query = new URLSearchParams({
    drive: state.drive,
    path: state.relPath
  });
  const data = await api(`${FS_API_BASE}/list?${query.toString()}`);
  pathViewEl.textContent = `This PC > ${state.drive}: ${data.path ? `> ${data.path}` : ""}`;
  upBtnEl.disabled = false;
  renderFolders(data.items || []);
}

upBtnEl.addEventListener("click", () => {
  state.relPath = parentPath(state.relPath);
  loadFolders();
});

newFolderBtnEl.addEventListener("click", async () => {
  const next = sanitizeName(window.prompt("Folder name"));
  if (!next) return;
  await api(`${FS_API_BASE}/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drive: state.drive, path: state.relPath, name: next })
  });
  loadFolders();
});

(async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const root = String(window.EXPLORER_ROOT || params.get("root") || "").toLowerCase();
    if (root === "mycomputer") {
      state.rootMode = "mycomputer";
      state.relPath = "";
    }
    const drives = await api(`${FS_API_BASE}/drives`);
    state.drives = (drives.drives || []).map((d) => d.name);
    renderDrives();
    await loadFolders();
  } catch (error) {
    folderListEl.innerHTML = `<div style="color:#fca5a5">${error.message}</div>`;
  }
})();
