const API = "/api/payroll";
const ME = "/api/windowsshell/auth/me";

const rangeLabel = document.getElementById("rangeLabel");
const cacheHint = document.getElementById("cacheHint");
const detailHint = document.getElementById("detailHint");
const detailMeta = document.getElementById("detailMeta");
const detailTableWrap = document.getElementById("detailTableWrap");
const detailRows = document.getElementById("detailRows");
const pcUser = document.getElementById("pcUser");

const appOvertimeRows = document.getElementById("appOvertimeRows");
const appOvertimeEmpty = document.getElementById("appOvertimeEmpty");
const appOvertimeDetailHint = document.getElementById("appOvertimeDetailHint");
const appOvertimeMeta = document.getElementById("appOvertimeMeta");
const appOvertimeJson = document.getElementById("appOvertimeJson");

const appLeaveRows = document.getElementById("appLeaveRows");
const appLeaveEmpty = document.getElementById("appLeaveEmpty");
const appLeaveDetailHint = document.getElementById("appLeaveDetailHint");
const appLeaveMeta = document.getElementById("appLeaveMeta");
const appLeaveJson = document.getElementById("appLeaveJson");

const btnCreateApplication = document.getElementById("btnCreateApplication");
const useCacheToggle = document.getElementById("useCacheToggle");

const aggEmployeeRows = document.getElementById("aggEmployeeRows");
const aggEmployeeEmpty = document.getElementById("aggEmployeeEmpty");
const aggEmployeeTitle = document.getElementById("aggEmployeeTitle");
let selectedOvertimeIndex = null;
let selectedLeaveIndex = null;
let currentPreset = "thisMonth";
let useCache = true;
let employeeAggregatePayload = null;

const detailModal = document.getElementById("pcDetailModal");
const detailModalTitle = document.getElementById("pcDetailModalTitle");
const detailModalBody = document.getElementById("pcDetailModalBody");
const detailModalClose = document.getElementById("pcDetailModalClose");

function getActivePanelId() {
  const active = document.querySelector(".pc-panel.is-active");
  return active?.dataset.panel || "timesheet";
}

function openTab(id) {
  document.querySelectorAll(".pc-tab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.tab === id);
  });
  document.querySelectorAll(".pc-panel").forEach((p) => {
    p.classList.toggle("is-active", p.dataset.panel === id);
  });
  // Tự reload theo preset hiện tại khi đổi tab
  if (id === "timesheet") {
    loadEmployeeAggregate(currentPreset);
  } else if (id === "applications-leave") {
    loadLeaveApplications(currentPreset);
  } else if (id === "applications-other") {
    loadOvertimeApplications(currentPreset);
  }
}

document.querySelectorAll(".pc-tab").forEach((b) => {
  b.addEventListener("click", () => openTab(b.dataset.tab || "timesheet"));
});

function openDetailModal(title, html) {
  if (!detailModal || !detailModalTitle || !detailModalBody) return;
  detailModalTitle.textContent = title || "";
  detailModalBody.innerHTML = html || "";
  if (typeof detailModal.showModal === "function") {
    detailModal.showModal();
  } else {
    detailModal.setAttribute("open", "true");
  }
}

function closeDetailModal() {
  if (!detailModal) return;
  if (typeof detailModal.close === "function") {
    detailModal.close();
  } else {
    detailModal.removeAttribute("open");
  }
}

if (detailModalClose) {
  detailModalClose.addEventListener("click", () => closeDetailModal());
}
if (detailModal) {
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeDetailModal();
  });
}

async function ensureAuth() {
  const r = await fetch(ME, { credentials: "include" });
  if (!r.ok) {
    window.location.href = "/";
    throw new Error("auth");
  }
  const j = await r.json().catch(() => ({}));
  const u = j.user;
  if (pcUser) {
    pcUser.textContent = u ? `${u.username} (${u.role})` : "";
  }
}

function fmtStatus(status) {
  const n = Number(status);
  if (n === 1) return "Chờ duyệt";
  if (n === 2) return "Đã duyệt";
  if (n === 3) return "Từ chối";
  if (n === 4) return "Nháp";
  return String(status ?? "");
}

/** Màu trạng thái: MISA 1=chờ, 2=duyệt, 3=từ chối, 4=nháp. */
function statusPillClass(status) {
  const n = Number(status);
  if (n === 1) return "pc-status pc-status--pending";
  if (n === 2) return "pc-status pc-status--approved";
  if (n === 3) return "pc-status pc-status--rejected";
  if (n === 4) return "pc-status pc-status--draft";
  return "pc-status pc-status--unknown";
}

function statusPillHtml(status) {
  return `<span class="${statusPillClass(status)}">${escapeHtml(fmtStatus(status))}</span>`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatDateTime(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  if (hh !== "00" || mi !== "00" || ss !== "00") {
    return `${hh}:${mi}:${ss} - ${dd}/${mm}/${yyyy}`;
  }
  return `${dd}/${mm}/${yyyy}`;
}

function fmtNum(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("vi-VN", { maximumFractionDigits: 5 }) : String(v);
}

function fmtIntMinutes(v) {
  if (v == null || v === "") return "0";
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "0";
}

const OTHER_APP_SUB_CODES = [
  "LateInEarlyOut",
  "OverTime",
  "MissionAllowance",
  "UpdateTimekeeper",
  "ChangeShift"
];

function otherAppKindLabel(sub) {
  const map = {
    LateInEarlyOut: "Đi muộn / về sớm",
    OverTime: "Làm thêm giờ",
    MissionAllowance: "Công tác",
    UpdateTimekeeper: "Cập nhật công",
    ChangeShift: "Đổi ca"
  };
  return map[sub] || sub || "";
}

/** Hậu tố CSS: mỗi loại đơn 1 màu (tab Đơn khác) */
function otherAppKindKey(sub) {
  if (sub === "LateInEarlyOut") return "late";
  if (sub === "OverTime") return "ot";
  if (sub === "MissionAllowance") return "mission";
  if (sub === "UpdateTimekeeper") return "timekeeper";
  if (sub === "ChangeShift") return "shift";
  return "unknown";
}

function otherAppSortKey(row) {
  return String(
    row.ApplyDate ||
      row.RequestDate ||
      row.FromDate ||
      row.ExplanationDate ||
      row.WorkingDate ||
      row.ChangeDate ||
      ""
  );
}

async function loadOvertimeApplications(preset) {
  currentPreset = preset;
  if (appOvertimeEmpty) {
    appOvertimeEmpty.classList.remove("hidden");
    appOvertimeEmpty.textContent = "Đang tải…";
  }
  if (appOvertimeDetailHint) {
    appOvertimeDetailHint.classList.remove("hidden");
    appOvertimeDetailHint.textContent = "Chọn một dòng trong danh sách.";
  }
  if (appOvertimeMeta) appOvertimeMeta.hidden = true;
  if (appOvertimeJson) {
    appOvertimeJson.hidden = true;
    appOvertimeJson.textContent = "";
  }
  appOvertimeRows.innerHTML = "";
  const noCacheParam = useCache ? "0" : "1";
  try {
    const responses = await Promise.all(
      OTHER_APP_SUB_CODES.map((sub) =>
        fetch(
          `${API}/misa/applications?subSystemCode=${encodeURIComponent(
            sub
          )}&preset=${encodeURIComponent(preset)}&noCache=${noCacheParam}`,
          { credentials: "include" }
        )
      )
    );
    const list = [];
    let fromD = "";
    let toD = "";
    const cachedFlags = [];
    for (let i = 0; i < responses.length; i += 1) {
      const r = responses[i];
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.error || r.statusText;
        throw new Error(msg || "Lỗi tải đơn");
      }
      if (!fromD && j.fromDate) fromD = j.fromDate;
      if (!toD && j.toDate) toD = j.toDate;
      cachedFlags.push(Boolean(j.cached));
      const sub = OTHER_APP_SUB_CODES[i];
      const pageData = Array.isArray(j.Data?.PageData) ? j.Data.PageData : [];
      pageData.forEach((row) => {
        list.push({ ...row, _PayrollSubCode: sub });
      });
    }
    rangeLabel.textContent = fromD && toD ? `Từ ${fromD} đến ${toD}` : "";
    const allCached = cachedFlags.length > 0 && cachedFlags.every(Boolean);
    const anyCached = cachedFlags.some(Boolean);
    if (allCached) {
      cacheHint.textContent = "Cache: đã dùng kết quả trong ngày (server)";
    } else if (anyCached) {
      cacheHint.textContent = "Một số loại đơn từ cache trong ngày, một số gọi MISA mới";
    } else {
      cacheHint.textContent = "Cache: vừa gọi MISA";
    }
    list.sort((a, b) => otherAppSortKey(b).localeCompare(otherAppSortKey(a)));
    renderOvertimeRows(list);
  } catch (e) {
    if (appOvertimeEmpty) {
      appOvertimeEmpty.classList.remove("hidden");
      appOvertimeEmpty.textContent = e.message || "Lỗi tải danh sách đơn";
    }
  }
}

function renderOvertimeRows(list) {
  appOvertimeRows.innerHTML = "";
  if (!list || !list.length) {
    if (appOvertimeEmpty) {
      appOvertimeEmpty.classList.remove("hidden");
      appOvertimeEmpty.textContent = "Không có bản ghi.";
    }
    return;
  }
  if (appOvertimeEmpty) appOvertimeEmpty.classList.add("hidden");
  selectedOvertimeIndex = null;
  list.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(idx);
    const sub = row._PayrollSubCode || "";
    const kindK = otherAppKindKey(sub);
    tr.className = `pc-app-row pc-app-row--${kindK}`;
    const fromDate = row.FromDate || row.ExplanationDate || row.WorkingDate || "";
    const toDate = row.ToDate || row.ChangeDate || row.WorkingDate || "";
    tr.innerHTML = `
      <td>${escapeHtml(String(row.EmployeeCode || ""))}</td>
      <td>${escapeHtml(String(row.FullName || row.OrganizationUnitName || ""))}</td>
      <td class="pc-app-kind-cell"><span class="pc-app-kind pc-app-kind--${kindK}">${escapeHtml(
        otherAppKindLabel(sub)
      )}</span></td>
      <td>${escapeHtml(formatDateTime(fromDate))}</td>
      <td>${escapeHtml(formatDateTime(toDate))}</td>
      <td class="pc-status-cell">${statusPillHtml(row.Status)}</td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#appOvertimeRows tr").forEach((x) => x.classList.remove("is-selected"));
      tr.classList.add("is-selected");
      selectedOvertimeIndex = idx;
      showOvertimeDetail(row, sub);
    });
    appOvertimeRows.appendChild(tr);
  });
}

function showOvertimeDetail(row, subSystemCode) {
  const sub = subSystemCode || row._PayrollSubCode || "";
  const subLabel = otherAppKindLabel(sub);
  const title = `${row.EmployeeCode || ""} - ${row.FullName || ""} — ${subLabel || sub}`;
  let html = '<table class="pc-table pc-table-sm"><tbody>';
  const addRow = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    html += `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`;
  };
  const addRowHtml = (label, valueHtml) => {
    if (valueHtml === undefined || valueHtml === null || valueHtml === "") return;
    html += `<tr><th>${escapeHtml(label)}</th><td class="pc-status-cell">${valueHtml}</td></tr>`;
  };

  addRow("Mã nhân viên", row.EmployeeCode);
  addRow("Họ tên", row.FullName);
  addRow("Đơn vị", row.OrganizationUnitName);
  addRow("Vị trí", row.JobPositionName);
  addRow("Ngày nộp đơn", row.ApplyDate || row.RequestDate);
  addRow("Từ ngày", row.FromDate);
  addRow("Đến ngày", row.ToDate);
  if (sub === "LateInEarlyOut") {
    addRow("Ca làm việc", row.WorkingShiftNames);
    addRow("Đi muộn đầu ca (phút)", row.CheckInLateStartTime);
    addRow("Về sớm cuối ca (phút)", row.CheckOutEarlyEndTimeint);
  }
  if (sub === "OverTime") {
    addRow("Ca làm việc", row.WorkingShiftName || row.WorkingShiftCode);
    addRow("Thời điểm làm thêm", row.OverTimeInWorkingShiftName);
    addRow("Loại làm thêm", row.OvertimeTypeName);
  }
  if (sub === "MissionAllowance") {
    addRow("Địa điểm công tác", row.Location);
    addRow("Mục đích", row.Purpose);
  }
  if (sub === "UpdateTimekeeper") {
    addRow("Ngày làm việc", row.ExplanationDate);
    addRow("Giờ vào đầu ca", row.CheckInStartTime);
    addRow("Giờ ra cuối ca", row.CheckOutEndTime);
    addRow("Ca làm việc", row.WorkingShiftName);
  }
  if (sub === "ChangeShift") {
    addRow("Ngày / ca áp dụng", row.ExplanationDate || row.WorkingDate || row.FromDate);
    addRow("Ca", row.WorkingShiftName || row.WorkingShiftNames);
    addRow("Ca đổi sang", row.ChangeToWorkingShiftName || row.ToWorkingShiftName);
  }
  addRow("Lý do", row.Reason);
  addRow("Người duyệt", row.ApprovalName);
  addRowHtml("Trạng thái", statusPillHtml(row.Status));
  html += "</tbody></table>";
  openDetailModal(title, html);
}

async function loadLeaveApplications(preset) {
  currentPreset = preset;
  if (appLeaveEmpty) {
    appLeaveEmpty.classList.remove("hidden");
    appLeaveEmpty.textContent = "Đang tải…";
  }
  if (appLeaveDetailHint) {
    appLeaveDetailHint.classList.remove("hidden");
    appLeaveDetailHint.textContent = "Chọn một dòng trong danh sách.";
  }
  if (appLeaveMeta) appLeaveMeta.hidden = true;
  if (appLeaveJson) {
    appLeaveJson.hidden = true;
    appLeaveJson.textContent = "";
  }
  appLeaveRows.innerHTML = "";
  const noCacheParam = useCache ? "0" : "1";
  try {
    const r = await fetch(
      `${API}/misa/applications?subSystemCode=Attendance&preset=${encodeURIComponent(
        preset
      )}&noCache=${noCacheParam}`,
      { credentials: "include" }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    const list = Array.isArray(j.Data?.PageData) ? j.Data.PageData : [];
    const from = j.fromDate;
    const to = j.toDate;
    rangeLabel.textContent = `Từ ${from} đến ${to}`;
    cacheHint.textContent = j.cached ? "Cache: đã dùng kết quả trong ngày (server)" : "Cache: vừa gọi MISA";
    renderLeaveRows(list);
  } catch (e) {
    if (appLeaveEmpty) {
      appLeaveEmpty.classList.remove("hidden");
      appLeaveEmpty.textContent = e.message || "Lỗi tải danh sách đơn xin nghỉ";
    }
  }
}

function renderLeaveRows(list) {
  appLeaveRows.innerHTML = "";
  if (!list || !list.length) {
    if (appLeaveEmpty) {
      appLeaveEmpty.classList.remove("hidden");
      appLeaveEmpty.textContent = "Không có bản ghi.";
    }
    return;
  }
  if (appLeaveEmpty) appLeaveEmpty.classList.add("hidden");
  selectedLeaveIndex = null;
  list.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(idx);
    tr.innerHTML = `
      <td>${escapeHtml(String(row.EmployeeCode || ""))}</td>
      <td>${escapeHtml(String(row.FullName || row.OrganizationUnitName || ""))}</td>
      <td>${escapeHtml(String(row.AttendanceTypeName || ""))}</td>
      <td>${escapeHtml(formatDateTime(row.FromDate || ""))}</td>
      <td>${escapeHtml(formatDateTime(row.ToDate || ""))}</td>
      <td>${escapeHtml(fmtNum(row.LeaveDay))}</td>
      <td class="pc-status-cell">${statusPillHtml(row.Status)}</td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#appLeaveRows tr").forEach((x) => x.classList.remove("is-selected"));
      tr.classList.add("is-selected");
      selectedLeaveIndex = idx;
      showLeaveDetail(row);
    });
    appLeaveRows.appendChild(tr);
  });
}

function showLeaveDetail(row) {
  const typeName = row.AttendanceTypeName || "";
  const remain = row.NumRemain;
  const used = row.TotalLeaved;
  const maxLeave = row.NumLeave;
  const title = `${row.EmployeeCode || ""} - ${row.FullName || ""} — ${typeName}`;
  let html = '<table class="pc-table pc-table-sm"><tbody>';
  const addRow = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    html += `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`;
  };
  const addRowHtml = (label, valueHtml) => {
    if (valueHtml === undefined || valueHtml === null || valueHtml === "") return;
    html += `<tr><th>${escapeHtml(label)}</th><td class="pc-status-cell">${valueHtml}</td></tr>`;
  };
  addRow("Mã nhân viên", row.EmployeeCode);
  addRow("Họ tên", row.FullName);
  addRow("Đơn vị", row.OrganizationUnitName);
  addRow("Vị trí", row.JobPositionName);
  addRow("Ngày nộp đơn", row.RequestDate);
  addRow("Thời gian nghỉ từ", row.FromDate);
  addRow("Thời gian nghỉ đến", row.ToDate);
  addRow("Số ngày nghỉ", row.LeaveDay);
  addRow("Số giờ nghỉ", row.NumberOfHourLeave);
  addRow("Tổng đã nghỉ", used);
  addRow("Tối đa", maxLeave);
  addRow("Còn lại", remain);
  addRow("Lý do", row.Reason);
  addRow("Người duyệt", row.ApprovalName);
  addRowHtml("Trạng thái", statusPillHtml(row.Status));
  html += "</tbody></table>";
  openDetailModal(title, html);
}

function handlePreset(preset) {
  const panel = getActivePanelId();
  if (panel === "timesheet") {
    loadEmployeeAggregate(preset);
  } else if (panel === "applications-leave") {
    loadLeaveApplications(preset);
  } else if (panel === "applications-other") {
    loadOvertimeApplications(preset);
  }
}

document.getElementById("btnLastMonth").addEventListener("click", () => handlePreset("lastMonth"));
document.getElementById("btnThisMonth").addEventListener("click", () => handlePreset("thisMonth"));

if (btnCreateApplication) {
  btnCreateApplication.addEventListener("click", () => {
    const misaUrl =
      window.PAYROLL_MISA_APP_URL ||
      "https://amisapp.misa.vn/timesheet"; // Placeholder: mở trang MISA, user sẽ tạo đơn trực tiếp.
    window.open(misaUrl, "_blank", "noopener");
  });
}

if (useCacheToggle) {
  useCache = useCacheToggle.checked;
  useCacheToggle.addEventListener("change", () => {
    useCache = useCacheToggle.checked;
    handlePreset(currentPreset);
  });
}

async function loadEmployeeAggregate(preset) {
  currentPreset = preset;
  if (aggEmployeeEmpty) {
    aggEmployeeEmpty.classList.remove("hidden");
    aggEmployeeEmpty.textContent = "Đang tải…";
  }
  aggEmployeeRows.innerHTML = "";
  employeeAggregatePayload = null;

  const noCacheParam = useCache ? "0" : "1";
  try {
    const r = await fetch(
      `${API}/misa/employee-aggregate?preset=${encodeURIComponent(preset)}&noCache=${noCacheParam}`,
      { credentials: "include" }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    employeeAggregatePayload = j;
    const list = Array.isArray(j.Data?.PageData) ? j.Data.PageData : [];
    const from = j.fromDate;
    const to = j.toDate;
    rangeLabel.textContent = `Từ ${from} đến ${to}`;
    cacheHint.textContent = j.cached ? "Cache: đã dùng kết quả trong ngày (server)" : "Cache: vừa gọi MISA";
    renderEmployeeAggregateRows(list);
  } catch (e) {
    if (aggEmployeeEmpty) {
      aggEmployeeEmpty.classList.remove("hidden");
      aggEmployeeEmpty.textContent = e.message || "Lỗi tải tổng hợp nhân viên";
    }
    if (cacheHint) cacheHint.textContent = "";
    if (rangeLabel) rangeLabel.textContent = "";
  }
}

function renderEmployeeAggregateRows(list) {
  aggEmployeeRows.innerHTML = "";
  if (!list || !list.length) {
    if (aggEmployeeEmpty) {
      aggEmployeeEmpty.classList.remove("hidden");
      aggEmployeeEmpty.textContent = "Không có bản ghi.";
    }
    return;
  }
  aggEmployeeEmpty.classList.add("hidden");
  list.forEach((row) => {
    const tr = document.createElement("tr");
    const code = String(row.EmployeeCode || "");
    tr.dataset.code = code;
    tr.innerHTML = `
      <td>${escapeHtml(code)}</td>
      <td>${escapeHtml(String(row.FullName || ""))}</td>
      <td>${escapeHtml(fmtNum(row.TotalWorkingActual))}</td>
      <td>${escapeHtml(fmtNum(row.TotalWorking))}</td>
      <td>${escapeHtml(row.LeaveRemaining != null ? String(row.LeaveRemaining) : "")}</td>
      <td title="1 nếu tổng công hưởng lương (MISA) trong khoảng ngày đang chọn ≥ ngưỡng cấu hình hệ thống—luôn tính theo công tháng đó">${escapeHtml(
        String(row.LeaveExtraThisMonth != null ? row.LeaveExtraThisMonth : 0)
      )}</td>
      <td title="Cộng phút từ từng đơn đi muộn / về sớm của nhân viên này trên MISA, trong khoảng ngày trên toolbar">${escapeHtml(
        fmtIntMinutes(row.TotalLateInEarlyOut)
      )}</td>
      <td title="Cộng phút từ từng đơn làm thêm giờ của nhân viên này trên MISA, trong khoảng ngày trên toolbar">${escapeHtml(
        fmtIntMinutes(row.TotalOverTime)
      )}</td>
      <td>${escapeHtml(String(row.TotalUpdateTimekeeper || 0))}</td>
      <td>${escapeHtml(String(row.TotalLeave || 0))}</td>
    `;
    tr.addEventListener("click", () => showEmployeeAggregateDetail(code));
    aggEmployeeRows.appendChild(tr);
  });
}

function showEmployeeAggregateDetail(code) {
  if (!employeeAggregatePayload?.EmployeeApplications) return;
  const apps = employeeAggregatePayload.EmployeeApplications[code] || {};
  const rows = Array.isArray(employeeAggregatePayload.Data?.PageData)
    ? employeeAggregatePayload.Data.PageData
    : [];
  const row = rows.find((r) => String(r.EmployeeCode || "") === String(code));
  if (aggEmployeeTitle) {
    aggEmployeeTitle.textContent = row
      ? `${row.EmployeeCode} - ${row.FullName || ""}`
      : String(code || "");
  }

  const renderAppTable = (items, kindLabel) => {
    if (!items || !items.length) {
      return `<p class="pc-muted">Không có ${escapeHtml(kindLabel)}.</p>`;
    }
    let html = `<table class="pc-table pc-table-sm"><thead><tr>
      <th>Ngày nộp</th>
      <th>Từ</th>
      <th>Đến</th>
      <th>Loại / Ca</th>
      <th>Trạng thái</th>
    </tr></thead><tbody>`;
    items.forEach((item) => {
      const applyDate = item.ApplyDate || item.RequestDate;
      const from = item.FromDate || item.ExplanationDate || item.WorkingDate;
      const to = item.ToDate || item.ChangeDate || item.WorkingDate;
      const type =
        item.AttendanceTypeName ||
        item.WorkingShiftName ||
        item.WorkingShiftNames ||
        item.OvertimeTypeName ||
        item.OverTimeInWorkingShiftName ||
        "";
      html += `<tr>
        <td>${escapeHtml(formatDateTime(applyDate))}</td>
        <td>${escapeHtml(formatDateTime(from))}</td>
        <td>${escapeHtml(formatDateTime(to))}</td>
        <td>${escapeHtml(String(type || ""))}</td>
        <td class="pc-status-cell">${statusPillHtml(item.Status)}</td>
      </tr>`;
    });
    html += "</tbody></table>";
    return html;
  };

  const content = `
    <h3>${escapeHtml(aggEmployeeTitle?.textContent || "")}</h3>
    <div class="pc-subtabs pc-subtabs-inline">
      <button type="button" class="pc-subtab is-active" data-subtab="Attendance">Đơn xin nghỉ</button>
      <button type="button" class="pc-subtab" data-subtab="LateInEarlyOut">Đi muộn/về sớm</button>
      <button type="button" class="pc-subtab" data-subtab="OverTime">Làm thêm giờ</button>
      <button type="button" class="pc-subtab" data-subtab="UpdateTimekeeper">Cập nhật công</button>
    </div>
    <div class="pc-subpanels">
      <div class="pc-subpanel is-active" data-subpanel="Attendance">
        ${renderAppTable(apps.Attendance || [], "đơn xin nghỉ")}
      </div>
      <div class="pc-subpanel" data-subpanel="LateInEarlyOut">
        ${renderAppTable(apps.LateInEarlyOut || [], "đơn đi muộn/về sớm")}
      </div>
      <div class="pc-subpanel" data-subpanel="OverTime">
        ${renderAppTable(apps.OverTime || [], "đơn làm thêm giờ")}
      </div>
      <div class="pc-subpanel" data-subpanel="UpdateTimekeeper">
        ${renderAppTable(apps.UpdateTimekeeper || [], "đơn cập nhật công")}
      </div>
    </div>
  `;

  openDetailModal(`Chi tiết đơn của ${row?.FullName || code}`, content);

  const modalBody = detailModalBody;
  if (!modalBody) return;
  const setSubtabActive = (id) => {
    modalBody.querySelectorAll(".pc-subtab").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.subtab === id);
    });
    modalBody.querySelectorAll(".pc-subpanel").forEach((p) => {
      p.classList.toggle("is-active", p.dataset.subpanel === id);
    });
  };
  modalBody.querySelectorAll(".pc-subtab").forEach((btn) => {
    btn.addEventListener("click", () => setSubtabActive(btn.dataset.subtab || "Attendance"));
  });
}

(async () => {
  try {
    await ensureAuth();
    await loadEmployeeAggregate("thisMonth");
  } catch (_) {}
})();
