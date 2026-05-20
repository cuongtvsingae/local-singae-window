const promptsListEl = document.getElementById("prompts-list");
const promptProfileMetaEl = document.getElementById("prompt-profile-meta");
const kbListEl = document.getElementById("kb-list");
const kbFilterCategoryEl = document.getElementById("kb-filter-category");
const kbPagePrevEl = document.getElementById("kb-page-prev");
const kbPageNextEl = document.getElementById("kb-page-next");
const kbPageLabelEl = document.getElementById("kb-page-label");
const debugListEl = document.getElementById("debug-list");
const debugSummaryEl = document.getElementById("debug-summary");
const modalEl = document.getElementById("cm-modal");
const modalTitleEl = document.getElementById("cm-modal-title");
const modalBodyEl = document.getElementById("cm-modal-body");
const modalSubmitEl = document.getElementById("cm-modal-submit");
const modalCancelEl = document.getElementById("cm-modal-cancel");
const modalCloseEl = document.getElementById("cm-modal-close");
const modalCardEl = modalEl?.querySelector(".cm-modal-card");
const imageLightboxEl = document.getElementById("cm-image-lightbox");
const imageLightboxImgEl = document.getElementById("cm-image-lightbox-img");
const imageLightboxCaptionEl = document.getElementById("cm-image-lightbox-caption");
const imageLightboxCloseEl = document.getElementById("cm-image-lightbox-close");
const toastEl = document.getElementById("cm-toast");

const OPENAI_CHATBOT_BASE = "/api/openai-chatbot";
/** Cuộc chat Facebook theo id (mở modal JSON intake). */
const intakeConversationById = new Map();
const bookingById = new Map();
const bugTaskById = new Map();
let promptState = { prompts: [], activePromptId: null, profile: null };
let kbEntries = [];
let kbPage = 1;
const KB_PAGE_SIZE = 12;
let modalSubmitHandler = null;
let kbFilterCategory = "";
let bugBoardMeta = null;
let botStatusPollTimer = null;

const bugBoardStatusOrder = ["new", "reopen", "in_progress", "ready_qa", "done"];
const bugBoardStatusLabels = {
  new: "New",
  reopen: "Reopen",
  in_progress: "In Progress",
  ready_qa: "Ready QA",
  done: "Done"
};
const bugBoardPriorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};
const bugBoardSeverityLabels = {
  minor: "Minor",
  major: "Major",
  critical: "Critical",
  blocker: "Blocker"
};

async function apiFetch(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data;
}

async function apiUpload(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    body: formData
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || res.statusText);
  return data;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateText(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleString("vi-VN");
}

/** Gộn hiển thị ngày + giờ hẹn (DB lưu 2 key `preferredVisitDate` / `preferredVisitTime`). */
function formatIntakeVisitDisplay(p) {
  const dateStr = String(p?.preferredVisitDate || "").trim();
  const timeStr = String(p?.preferredVisitTime || "").trim();
  if (!dateStr && !timeStr) return "—";
  let datePart = dateStr || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const dt = new Date(`${dateStr}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      datePart = dt.toLocaleDateString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    }
  }
  if (datePart && timeStr) return `${datePart} · ${timeStr}`;
  if (datePart) return datePart;
  return timeStr;
}

function formatCareStatusLabel(status) {
  const s = String(status || "").trim();
  if (s === "booked") return "booked";
  if (s === "treating") return "treating";
  if (s === "treatment_done") return "treatment_done";
  return "bot_care";
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = String(message || "");
  toastEl.classList.add("is-visible");
  setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

function hideModal() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden", "true");
  modalSubmitHandler = null;
  if (modalCardEl) modalCardEl.className = "cm-modal-card";
}

function openImageLightbox(url, caption = "") {
  const safeUrl = String(url || "").trim();
  if (!safeUrl || !imageLightboxEl || !imageLightboxImgEl) return;
  imageLightboxImgEl.src = safeUrl;
  imageLightboxCaptionEl.textContent = String(caption || "").trim();
  imageLightboxEl.classList.remove("hidden");
  imageLightboxEl.setAttribute("aria-hidden", "false");
}

function closeImageLightbox() {
  if (!imageLightboxEl || !imageLightboxImgEl) return;
  imageLightboxEl.classList.add("hidden");
  imageLightboxEl.setAttribute("aria-hidden", "true");
  imageLightboxImgEl.src = "";
  if (imageLightboxCaptionEl) imageLightboxCaptionEl.textContent = "";
}

function openModal({ title, bodyHtml, submitLabel = "Save", onSubmit, modalClass = "" }) {
  modalTitleEl.textContent = title || "Modal";
  modalBodyEl.innerHTML = bodyHtml || "";
  modalSubmitEl.textContent = submitLabel;
  modalSubmitHandler = onSubmit || null;
  if (modalCardEl) {
    modalCardEl.className = `cm-modal-card ${String(modalClass || "").trim()}`.trim();
  }
  modalEl.classList.add("is-open");
  modalEl.setAttribute("aria-hidden", "false");
}

modalSubmitEl?.addEventListener("click", async () => {
  if (!modalSubmitHandler) return hideModal();
  try {
    await modalSubmitHandler();
    hideModal();
  } catch (error) {
    showToast(error.message || "Action failed.");
  }
});
modalCancelEl?.addEventListener("click", hideModal);
modalCloseEl?.addEventListener("click", hideModal);
modalEl?.addEventListener("click", (event) => {
  if (event.target?.dataset?.close === "1") hideModal();
});
imageLightboxCloseEl?.addEventListener("click", closeImageLightbox);
imageLightboxEl?.addEventListener("click", (event) => {
  if (event.target?.dataset?.lightboxClose === "1") closeImageLightbox();
});

function isImageAttachment(attachment) {
  const mime = String(attachment?.mimeType || "").trim().toLowerCase();
  const fileName = String(attachment?.fileName || attachment?.url || "").trim().toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
}

function renderBugAttachmentSection(attachments) {
  const items = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (!items.length) return "";
  const imageItems = items.filter(isImageAttachment);
  const fileItems = items.filter((item) => !isImageAttachment(item));
  const imageHtml = imageItems.length
    ? `<div class="cm-bug-attachment-preview-grid">${imageItems
        .map(
          (att) => `
            <button
              type="button"
              class="cm-bug-attachment-preview"
              data-bug-image-url="${escapeHtml(att.url)}"
              data-bug-image-name="${escapeHtml(att.fileName || "image")}"
            >
              <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.fileName || "attachment image")}" />
            </button>
          `
        )
        .join("")}</div>`
    : "";
  const fileHtml = fileItems.length
    ? `<div class="cm-bug-attachments">${fileItems
        .map(
          (att) =>
            `<a class="cm-bug-attachment-chip" href="${escapeHtml(att.url)}" target="_blank" rel="noreferrer">${escapeHtml(
              att.fileName || "attachment"
            )}</a>`
        )
        .join("")}</div>`
    : "";
  return `${imageHtml}${fileHtml}`;
}

function renderPrompts() {
  const prompts = Array.isArray(promptState?.prompts) ? promptState.prompts : [];
  const profile = promptState?.profile || null;
  promptProfileMetaEl.textContent = profile
    ? `provider: ${profile.provider} | version: ${profile.version} | updatedAt: ${profile.updatedAt || "-"}`
    : "No profile";
  if (!prompts.length) {
    promptsListEl.innerHTML = `<div class="cm-item">No prompts found.</div>`;
    return;
  }
  promptsListEl.innerHTML = prompts
    .map((item) => {
      const active = item.id === promptState.activePromptId;
      return `
        <div class="cm-item">
          <div class="cm-item-title">${escapeHtml(item.title)} ${active ? "(Active)" : ""}</div>
          <div>${escapeHtml(String(item.content || "").slice(0, 240))}</div>
          <div class="cm-row" style="margin-top:8px;">
            <button class="btn btn-ghost" data-action="edit" data-id="${item.id}">Edit</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderChipGroup(targetEl, options, activeValue, onSelect) {
  if (!targetEl) return;
  targetEl.innerHTML = options
    .map((option) => {
      const isActive = String(activeValue || "") === String(option.value || "");
      return `<button type="button" class="cm-chip ${isActive ? "is-active" : ""}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`;
    })
    .join("");
  targetEl.querySelectorAll("button.cm-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      onSelect(String(btn.dataset.value || ""));
    });
  });
}

modalBodyEl?.addEventListener("click", (event) => {
  const imageButton = event.target.closest("[data-bug-image-url]");
  if (imageButton) {
    openImageLightbox(imageButton.dataset.bugImageUrl, imageButton.dataset.bugImageName || "");
  }
});

function getFilteredKbEntries() {
  const category = String(kbFilterCategory || "").trim().toLowerCase();
  return kbEntries.filter((entry) => {
    const entryCategory = String(entry?.category || entry?.record?.category || "").trim().toLowerCase();
    if (category && entryCategory !== category) return false;
    return true;
  });
}

function renderKb() {
  const filtered = getFilteredKbEntries();
  const totalPages = Math.max(1, Math.ceil(filtered.length / KB_PAGE_SIZE));
  kbPage = Math.max(1, Math.min(kbPage, totalPages));
  const start = (kbPage - 1) * KB_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + KB_PAGE_SIZE);
  kbPageLabelEl.textContent = `Page ${kbPage}/${totalPages} (${filtered.length} rows)`;
  kbPagePrevEl.disabled = kbPage <= 1;
  kbPageNextEl.disabled = kbPage >= totalPages;
  if (!pageItems.length) {
    kbListEl.innerHTML = `<div class="cm-item">No knowledge entries.</div>`;
    return;
  }
  kbListEl.innerHTML = pageItems
    .map((entry) => {
      const category = escapeHtml(String(entry?.category || entry?.record?.category || "General"));
      return `
      <div class="cm-item">
        <div class="cm-item-title">${escapeHtml(entry?.record?.question || entry?.id || "Entry")}</div>
        <div>${escapeHtml(String(entry?.record?.answer || entry?.text || "").slice(0, 320))}</div>
        <div class="cm-meta">category=${category}</div>
      </div>
    `;
    })
    .join("");
}

function refreshKbCategoryFilter() {
  const categories = Array.from(
    new Set(
      kbEntries
        .map((entry) => String(entry?.category || entry?.record?.category || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  if (kbFilterCategory && !categories.includes(kbFilterCategory)) kbFilterCategory = "";
  renderChipGroup(
    kbFilterCategoryEl,
    [{ label: "All", value: "" }, ...categories.map((item) => ({ label: item, value: item }))],
    kbFilterCategory,
    (value) => {
      kbFilterCategory = value;
      kbPage = 1;
      renderKb();
    }
  );
}

async function loadPrompts() {
  const data = await apiFetch(`${OPENAI_CHATBOT_BASE}/prompts`);
  promptState = {
    prompts: data.prompts || [],
    activePromptId: data.activePromptId || null,
    profile: data.profile || null
  };
  renderPrompts();
}

async function loadKb() {
  const data = await apiFetch(`${OPENAI_CHATBOT_BASE}/knowledge-base`);
  kbEntries = data.entries || [];
  kbPage = 1;
  refreshKbCategoryFilter();
  renderKb();
}

async function refreshManagerStatic() {
  await Promise.all([loadPrompts(), loadKb(), loadFacebookPagesPanel()]);
}

async function loadFacebookPagesPanel() {
  const meta = document.getElementById("cm-fb-pages-meta");
  const list = document.getElementById("cm-fb-pages-list");
  if (!meta || !list) return;
  try {
    const data = await apiFetch("/api/chatbot/facebook-pages/settings");
    const pages = Array.isArray(data.pages) ? data.pages : [];
    meta.textContent = pages.length
      ? `${pages.length} Page đã kết nối OAuth · cập nhật ${data.updatedAt ? new Date(data.updatedAt).toLocaleString("vi-VN") : "—"}`
      : "Chưa có Page nào. Đăng nhập Meta OAuth trên Chatbot UI hoặc bấm «Đồng bộ OAuth».";
    if (!pages.length) {
      list.innerHTML = '<div class="cm-item cm-meta">—</div>';
      return;
    }
    list.innerHTML = pages
      .map((p) => {
        const on = p.botReplyEnabled !== false;
        const name = escapeHtml(p.pageName || p.pageId);
        const pid = escapeHtml(p.pageId);
        const pic = p.pictureUrl
          ? `<img class="cm-fb-page-avatar" src="${escapeHtml(p.pictureUrl)}" alt="" loading="lazy" />`
          : `<span class="cm-fb-page-avatar cm-fb-page-avatar--placeholder" aria-hidden="true">${escapeHtml((p.pageName || "P").slice(0, 1))}</span>`;
        return `
        <div class="cm-fb-page-row" data-page-id="${pid}">
          ${pic}
          <div class="cm-fb-page-info">
            <div class="cm-fb-page-title">${name}${p.isActive ? ' <span class="cm-fb-page-badge">OAuth mặc định</span>' : ""}</div>
            <div class="cm-meta cm-fb-page-id">Page ID: <code>${pid}</code></div>
            <div class="cm-meta cm-fb-page-status">${on ? "Bot đang trả lời tự động" : "Bot tắt — chỉ lưu tin, không rep"}</div>
          </div>
          <label class="cm-switch" title="${on ? "Tắt bot cho Page này" : "Bật bot cho Page này"}">
            <input type="checkbox" class="cm-fb-page-toggle" data-page-id="${pid}" ${on ? "checked" : ""} />
            <span class="cm-switch-slider" aria-hidden="true"></span>
            <span class="cm-switch-label">${on ? "Bật" : "Tắt"}</span>
          </label>
        </div>`;
      })
      .join("");
  } catch (e) {
    meta.textContent = `Lỗi tải danh sách Page: ${e.message || e}`;
    list.innerHTML = "";
  }
}

async function setFacebookPageBotReply(pageId, enabled) {
  await apiFetch(`/api/chatbot/facebook-pages/${encodeURIComponent(pageId)}/bot-reply`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled })
  });
  await loadFacebookPagesPanel();
  showToast(enabled ? "Đã bật bot cho Page." : "Đã tắt bot — Page này sẽ không tự trả lời.");
}

/** Refresh manager: reset DB + rebuild KB từ file JSON nguồn, rồi đồng bộ cache Simly nền. */
async function refreshAll() {
  await apiFetch("/api/chatbot/database/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await refreshManagerStatic();
  let syncMessage = "Đã reset DB và rebuild knowledge base từ file JSON.";
  try {
    await apiFetch("/api/chatbot/clinic-appointments/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    syncMessage = "Đã reset DB, rebuild knowledge base và đồng bộ cache lịch.";
  } catch (e) {
    syncMessage = `Đã reset DB và rebuild knowledge base. Simly sync: ${e.message || e}`;
  }
  showToast(syncMessage);
}

document.getElementById("btn-refresh-all")?.addEventListener("click", () => {
  refreshAll().catch((err) => showToast(err.message));
});

document.getElementById("btn-fb-pages-refresh")?.addEventListener("click", () => {
  loadFacebookPagesPanel().catch((e) => showToast(e.message || "Không tải được danh sách Page."));
});
document.getElementById("btn-fb-pages-sync")?.addEventListener("click", async () => {
  try {
    await apiFetch("/api/chatbot/facebook-oauth/sync-from-vps", { method: "POST" });
    await loadFacebookPagesPanel();
    showToast("Đã đồng bộ OAuth từ VPS.");
  } catch (e) {
    showToast(e.message || "Đồng bộ OAuth thất bại.");
  }
});
document.getElementById("cm-fb-pages-list")?.addEventListener("change", async (ev) => {
  const input = ev.target.closest(".cm-fb-page-toggle");
  if (!input) return;
  const pageId = String(input.dataset.pageId || "").trim();
  if (!pageId) return;
  const enabled = Boolean(input.checked);
  try {
    await setFacebookPageBotReply(pageId, enabled);
  } catch (e) {
    showToast(e.message || "Không cập nhật được trạng thái Page.");
    input.checked = !enabled;
  }
});

document.getElementById("btn-add-prompt")?.addEventListener("click", () => {
  showToast("Prompt DB da tat. Sua file: tools/chatbot/server/prompts/conversationSetup.txt (+ chatCases.txt, monthlyPromotionsByOffice.txt)");
});

promptsListEl?.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  try {
    if (action === "edit") {
      const item = (promptState.prompts || []).find((p) => p.id === id);
      openModal({
        title: "Edit Prompt",
        bodyHtml: `
          <input id="cm-prompt-title" class="cm-input" value="${escapeHtml(item?.title || "")}" />
          <textarea id="cm-prompt-content" class="cm-input cm-textarea">${escapeHtml(item?.content || "")}</textarea>
        `,
        submitLabel: "Save",
        onSubmit: async () => {
          const title = document.getElementById("cm-prompt-title")?.value?.trim();
          const content = document.getElementById("cm-prompt-content")?.value?.trim();
          if (!title || !content) throw new Error("Title va content khong duoc rong.");
          await apiFetch(`${OPENAI_CHATBOT_BASE}/prompts/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, prompt: content })
          });
          await loadPrompts();
          showToast("Prompt updated.");
        }
      });
      return;
    }
    if (action === "active" || action === "delete") {
      showToast("Prompt DB da tat. Sua file: tools/chatbot/server/prompts/conversationSetup.txt (+ chatCases.txt, monthlyPromotionsByOffice.txt)");
    }
  } catch (error) {
    showToast(error.message);
  }
});

kbPagePrevEl?.addEventListener("click", () => {
  kbPage -= 1;
  renderKb();
});
kbPageNextEl?.addEventListener("click", () => {
  kbPage += 1;
  renderKb();
});

document.getElementById("btn-debug-retrieval")?.addEventListener("click", async () => {
  try {
    const query = document.getElementById("debug-query")?.value?.trim();
    const topK = Number(document.getElementById("debug-topk")?.value || 10);
    const conversationId = document.getElementById("debug-conversation")?.value?.trim() || "";
    if (!query) throw new Error("Nhap query.");
    const data = await apiFetch(`${OPENAI_CHATBOT_BASE}/knowledge-base/debug-retrieval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK, conversationId })
    });
    debugSummaryEl.textContent = `strategy=${data?.retrieval?.strategy || "-"} vectorWeight=${data?.retrieval?.vectorWeight ?? "-"} keywordWeight=${data?.retrieval?.keywordWeight ?? "-"}`;
    const rows = (data.matches || []).map(
      (item, idx) => `
        <div class="cm-item">
          <div class="cm-item-title">#${idx + 1} ${escapeHtml(item.id)} | rerank=${item.rerankScore} | vector=${item.similarity} | lexical=${item.lexicalSimilarity}</div>
          <div>${escapeHtml(String(item.text || "").slice(0, 360))}</div>
        </div>
      `
    );
    const memoryRows = (data.memoryMatches || []).map(
      (item) => `
        <div class="cm-item">
          <div class="cm-item-title">[memory] ${escapeHtml(item.id)} | sim=${item.similarity}</div>
          <div>${escapeHtml(String(item.text || "").slice(0, 280))}</div>
        </div>
      `
    );
    debugListEl.innerHTML = [...rows, ...memoryRows].join("") || `<div class="cm-item">No match.</div>`;
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("btn-clear-chat-facebook")?.addEventListener("click", async () => {
  if (
    !confirm(
      "Xóa tất cả cuộc hội thoại kênh Facebook Messenger (facebook-messenger)? Cache BN/intake của các cuộc đó cũng mất."
    )
  ) {
    return;
  }
  try {
    const data = await apiFetch("/api/chatbot/chat-history?channel=facebook-messenger", { method: "DELETE" });
    showToast(data.message || "Đã xóa hội thoại Facebook.");
    await loadIntakePanel();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("btn-clear-chat-all")?.addEventListener("click", async () => {
  if (
    !confirm(
      "Xóa TOÀN BỘ lịch sử chat mọi kênh? Mọi cuộc trò chuyện và tin nhắn sẽ bị xóa vĩnh viễn. Không hoàn tác."
    )
  ) {
    return;
  }
  try {
    const data = await apiFetch("/api/chatbot/chat-history", { method: "DELETE" });
    showToast(data.message || "Đã xóa toàn bộ.");
    await loadIntakePanel();
  } catch (error) {
    showToast(error.message);
  }
});

const CM_TAB_KEY = "chatbot_manager_active_tab";

const CM_TAB_PANELS = {
  ops: "cm-ops-stack",
  processing: "cm-processing-stack",
  intake: "cm-panel-intake",
  booking: "cm-panel-booking",
  bug: "cm-panel-bug",
  zalo: "cm-panel-zalo"
};

const CM_TAB_BUTTONS = {
  ops: "cm-tab-ops",
  processing: "cm-tab-processing",
  intake: "cm-tab-intake",
  booking: "cm-tab-booking",
  bug: "cm-tab-bug",
  zalo: "cm-tab-zalo"
};

function stopBotStatusPolling() {
  if (botStatusPollTimer != null) {
    clearInterval(botStatusPollTimer);
    botStatusPollTimer = null;
  }
}

async function loadBotReplyStatusPanel() {
  const meta = document.getElementById("cm-bot-status-meta");
  const banner = document.getElementById("cm-bot-status-banner");
  const body = document.getElementById("cm-bot-status-body");
  if (!banner || !body) return;
  try {
    const res = await fetch(`${OPENAI_CHATBOT_BASE}/bot-reply-status`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const base = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
      const hint502 =
        res.status === 502 || res.status === 503 || res.status === 504
          ? " — Backend Node/proxy không phản hồi (tiến trình có thể sập, overload hoặc reverse proxy không nối được upstream)."
          : "";
      const apiMsg = String(data.error || data.message || "").trim();
      throw new Error(`${apiMsg ? `${apiMsg} · ` : ""}${base}${hint502}`);
    }
    if (meta) {
      meta.textContent = `Cập nhật ${new Date().toLocaleTimeString("vi-VN")} — tự làm mới ~3 giây khi tab này đang mở.`;
    }
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const busy = Boolean(data.busy) && sessions.length > 0;
    if (busy) {
      banner.className = "cm-bot-status-banner is-busy";
      banner.innerHTML = `
        <div class="cm-bot-status-indicator"><span class="cm-bot-status-dot" aria-hidden="true"></span> Đang trả lời</div>
        <div class="cm-bot-status-banner-text">${sessions.length} cuộc đang được bot xử lý.</div>`;
    } else {
      banner.className = "cm-bot-status-banner is-idle";
      banner.innerHTML = `
        <div class="cm-bot-status-indicator cm-bot-status-indicator--idle">Rảnh</div>
        <div class="cm-bot-status-banner-text">Không có phiên trả lời tự động Facebook nào đang chạy.</div>`;
    }
    if (!sessions.length) {
      body.innerHTML = '<div class="cm-item cm-bot-status-empty">—</div>';
      return;
    }
    body.innerHTML = `
      <div class="cm-table-wrap">
        <table class="cm-table cm-table-bot-status">
          <thead>
            <tr>
              <th>Khách · cuộc hội thoại</th>
              <th>Trang FB</th>
              <th>Bắt đầu xử lý</th>
              <th>Tin khách gửi (rút gọn)</th>
            </tr>
          </thead>
          <tbody>
            ${sessions
              .map(
                (s) => `
              <tr>
                <td>
                  <div class="cm-bot-status-strong">${escapeHtml(String(s.participantLabel || "").trim() || "—")}</div>
                  <div class="cm-meta cm-bot-status-mono">${escapeHtml(String(s.conversationId || "").trim() || "—")}</div>
                </td>
                <td>${escapeHtml(String(s.facebookPageName || "").trim() || "—")}</td>
                <td>${escapeHtml(formatTime(s.startedAtIso))}</td>
                <td>${escapeHtml(truncateText(s.incomingPreview, 220))}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  } catch (error) {
    const raw = String(error?.message || "").trim();
    const msg =
      raw ||
      (error && error.name === "TypeError" ? "Mất kết nối HTTP tới máy chủ." : "") ||
      "Lỗi không xác định.";
    if (meta) meta.textContent = `Lỗi tải trạng thái: ${msg}`;
    banner.className = "cm-bot-status-banner is-error";
    banner.innerHTML = `<div class="cm-bot-status-banner-text">${escapeHtml(msg)}</div>`;
    body.innerHTML = "";
  }
}

function startBotStatusPolling() {
  stopBotStatusPolling();
  loadBotReplyStatusPanel();
  botStatusPollTimer = window.setInterval(() => loadBotReplyStatusPanel(), 3500);
}

function setCmTab(tab) {
  if (tab === "bot-status") tab = "processing";
  if (!CM_TAB_PANELS[tab]) tab = "ops";

  document.querySelectorAll(".cm-tab").forEach((el) => el.classList.remove("is-active"));
  document.getElementById(CM_TAB_BUTTONS[tab])?.classList.add("is-active");

  document.querySelectorAll(".cm-tab-panel").forEach((panel) => {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  });

  const activePanel = document.getElementById(CM_TAB_PANELS[tab]);
  activePanel?.classList.remove("hidden");
  activePanel?.setAttribute("aria-hidden", "false");

  if (tab === "processing") startBotStatusPolling();
  else stopBotStatusPolling();

  if (tab === "intake") loadIntakePanel();
  else if (tab === "booking") loadBookingPanel();
  else if (tab === "bug") loadBugBoardPanel();
  else if (tab === "zalo") loadZaloPanel();

  try {
    localStorage.setItem(CM_TAB_KEY, tab);
  } catch (_) {}
}

function buildIntakeBotJsonShape(ci) {
  const p = (ci && ci.patient) || {};
  const appts = Array.isArray(ci?.appointments) ? ci.appointments : [];
  return {
    careStatus: String(ci?.careStatus || "bot_care"),
    schemaVersion: Number(ci?.schemaVersion) || 1,
    collected: {
      patient: {
        fullName: p.fullName != null ? String(p.fullName) : "",
        phone: p.phone != null ? String(p.phone) : "",
        regionLive: p.regionLive != null ? String(p.regionLive) : "",
        preferredOfficeKey: p.preferredOfficeKey != null ? String(p.preferredOfficeKey) : "",
        shuttlePickup: p.shuttlePickup != null ? String(p.shuttlePickup) : "",
        preferredVisitDate: p.preferredVisitDate != null ? String(p.preferredVisitDate) : "",
        preferredVisitTime: p.preferredVisitTime != null ? String(p.preferredVisitTime) : ""
      },
      notes: ci.notes != null ? String(ci.notes) : ""
    },
    appointments: appts
  };
}

function openIntakeJsonModal(conv) {
  const ci = conv?.customerIntake || {};
  const botLike = buildIntakeBotJsonShape({ ...ci, careStatus: conv?.careStatus || "bot_care" });
  const bodyHtml = `
    <p class="cm-meta"><strong>careStatus</strong> = lifecycle phiên chat. <strong>notes</strong> = tình trạng + mục đích. <strong>preferredVisitDate</strong> / <strong>preferredVisitTime</strong> = hẹn tách key.</p>
    <p class="cm-meta">Booking mới đã chuyển sang API <code>/api/chatbot/bookings</code>; <code>appointments[]</code> chỉ còn để đọc tương thích cũ.</p>
    <pre class="cm-clinic-json">${escapeHtml(JSON.stringify(botLike, null, 2))}</pre>
    <h4 style="margin:14px 0 6px;font-size:14px;">Raw <code>customerIntake</code> (SQLite)</h4>
    <pre class="cm-clinic-json">${escapeHtml(JSON.stringify(ci, null, 2))}</pre>
  `;
  openModal({
    title: `Intake / JSON — ${escapeHtml(String(conv?.id || ""))}`,
    bodyHtml,
    submitLabel: "Đóng",
    onSubmit: async () => {}
  });
}

async function loadIntakePanel() {
  const meta = document.getElementById("cm-intake-meta");
  const tbody = document.getElementById("cm-intake-tbody");
  if (!tbody) return;
  meta.textContent = "Đang tải...";
  intakeConversationById.clear();
  try {
    const data = await apiFetch("/api/chatbot/chat-history");
    const rows = Array.isArray(data.conversations) ? data.conversations : [];
    const fbRows = rows.filter((c) => String(c.channel || "").toLowerCase().includes("facebook"));
    meta.textContent = `${fbRows.length} cuộc hội thoại Facebook (cache BN / intake nếu đã nhập).`;
    fbRows.forEach((c) => {
      if (c?.id) intakeConversationById.set(String(c.id), c);
    });
    tbody.innerHTML = fbRows
      .map((c) => {
        const ci = c.customerIntake || {};
        const p = ci.patient || {};
        const notePreview = escapeHtml(truncateText(ci.notes, 40));
        const visitLabel = formatIntakeVisitDisplay(p);
        const visitTitle = escapeHtml(
          `preferredVisitDate=${String(p.preferredVisitDate || "").trim()}; preferredVisitTime=${String(p.preferredVisitTime || "").trim()}`
        );
        const apptsRaw = JSON.stringify(Array.isArray(ci.appointments) ? ci.appointments : []);
        const apptsPreview = escapeHtml(truncateText(apptsRaw, 44));
        const upd = ci.updatedAt ? new Date(ci.updatedAt).toLocaleString("vi-VN") : "—";
        const convId = escapeHtml(String(c.id || ""));
        const careStatus = escapeHtml(formatCareStatusLabel(c.careStatus || "bot_care"));
        const sv = Number(ci.schemaVersion);
        return `<tr>
          <td><code>${convId}</code></td>
          <td><code>${careStatus}</code></td>
          <td>${Number.isFinite(sv) ? escapeHtml(String(sv)) : "—"}</td>
          <td>${escapeHtml(p.fullName || "—")}</td>
          <td>${escapeHtml(p.phone || "—")}</td>
          <td title="${escapeHtml(String(p.regionLive || "").trim())}">${escapeHtml(truncateText(p.regionLive, 22))}</td>
          <td><code>${escapeHtml(p.preferredOfficeKey || "—")}</code></td>
          <td><code>${escapeHtml(p.shuttlePickup || "—")}</code></td>
          <td class="cm-intake-visit" title="${visitTitle}">${escapeHtml(visitLabel)}</td>
          <td class="cm-intake-note" title="${escapeHtml(String(ci.notes || "").trim())}">${notePreview}</td>
          <td class="cm-intake-appts" title="${escapeHtml(apptsRaw)}"><code>${apptsPreview}</code></td>
          <td>${escapeHtml(upd)}</td>
          <td><button type="button" class="btn btn-ghost cm-intake-json-btn" data-intake-json="${convId}">JSON</button></td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    meta.textContent = e.message || "Lỗi tải";
    tbody.innerHTML = "";
  }
}

function openBookingJsonModal(booking, careStatus) {
  const bodyHtml = `
    <p class="cm-meta"><strong>careStatus hiện tại</strong>: <code>${escapeHtml(formatCareStatusLabel(careStatus || "bot_care"))}</code></p>
    <pre class="cm-clinic-json">${escapeHtml(JSON.stringify(booking, null, 2))}</pre>
  `;
  openModal({
    title: `Booking / JSON — ${escapeHtml(String(booking?.id || ""))}`,
    bodyHtml,
    submitLabel: "Đóng",
    onSubmit: async () => {}
  });
}

async function loadBookingPanel() {
  const meta = document.getElementById("cm-booking-meta");
  const tbody = document.getElementById("cm-booking-tbody");
  if (!meta || !tbody) return;
  meta.textContent = "Đang tải...";
  bookingById.clear();
  try {
    const [bookingData, chatData] = await Promise.all([
      apiFetch("/api/chatbot/bookings"),
      apiFetch("/api/chatbot/chat-history")
    ]);
    const bookings = Array.isArray(bookingData?.bookings) ? bookingData.bookings : [];
    const convMap = new Map(
      (Array.isArray(chatData?.conversations) ? chatData.conversations : []).map((item) => [String(item.id || ""), item])
    );
    meta.textContent = `${bookings.length} booking nội bộ.`;
    bookings.forEach((b) => {
      if (b?.id) bookingById.set(String(b.id), b);
    });
    tbody.innerHTML = bookings
      .map((b) => {
        const conv = convMap.get(String(b.conversationId || "")) || null;
        const careStatus = formatCareStatusLabel(conv?.careStatus || "bot_care");
        const patientName = String(b?.patientSnapshot?.fullName || "").trim();
        const phone = String(b?.patientSnapshot?.phone || "").trim();
        const visit = formatIntakeVisitDisplay({
          preferredVisitDate: b?.visitDate || "",
          preferredVisitTime: b?.visitTime || ""
        });
        const zalo = b?.zaloNotifiedAt ? "đã gửi" : "chưa";
        const createdAt = b?.createdAt ? new Date(b.createdAt).toLocaleString("vi-VN") : "—";
        return `<tr>
          <td><code>${escapeHtml(String(b.id || ""))}</code></td>
          <td><code>${escapeHtml(String(b.conversationId || ""))}</code></td>
          <td><code>${escapeHtml(careStatus)}</code></td>
          <td><code>${escapeHtml(String(b.status || ""))}</code></td>
          <td title="${escapeHtml(`${patientName} ${phone}`.trim())}">${escapeHtml(truncateText(`${patientName || "—"} · ${phone || "—"}`, 32))}</td>
          <td><code>${escapeHtml(String(b.officeKey || "—"))}</code></td>
          <td class="cm-intake-visit">${escapeHtml(visit)}</td>
          <td><code>${escapeHtml(String(b.shuttlePickup || "—"))}</code></td>
          <td>${escapeHtml(zalo)}</td>
          <td>${escapeHtml(createdAt)}</td>
          <td><button type="button" class="btn btn-ghost cm-intake-json-btn" data-booking-json="${escapeHtml(String(b.id || ""))}" data-care-status="${escapeHtml(careStatus)}">JSON</button></td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    meta.textContent = e.message || "Lỗi tải";
    tbody.innerHTML = "";
  }
}

function renderBugBadge(kind, value) {
  const safeValue = String(value || "").trim().toLowerCase();
  const map = kind === "priority" ? bugBoardPriorityLabels : bugBoardSeverityLabels;
  const label = map[safeValue] || safeValue || "-";
  return `<span class="cm-bug-badge cm-bug-badge-${kind}-${escapeHtml(safeValue)}">${escapeHtml(label)}</span>`;
}

function renderBugTaskCard(task) {
  return `
    <article class="cm-bug-card" data-bug-task-id="${escapeHtml(task.id)}">
      <div class="cm-bug-card-code">${escapeHtml(task.code || "")}</div>
      <div class="cm-bug-card-title">${escapeHtml(task.title || "")}</div>
      <div class="cm-bug-card-summary">${escapeHtml(task.summary || "")}</div>
      <div class="cm-bug-card-meta">
        ${renderBugBadge("priority", task.priority)}
        ${renderBugBadge("severity", task.severity)}
      </div>
    </article>
  `;
}

async function ensureBugBoardMeta() {
  if (bugBoardMeta) return bugBoardMeta;
  bugBoardMeta = await apiFetch("/api/chatbot/bug-board/meta");
  return bugBoardMeta;
}

async function uploadBugAttachments(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  const uploaded = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const data = await apiUpload("/api/chatbot/bug-board/attachments", form);
    if (data?.attachment) uploaded.push(data.attachment);
  }
  return uploaded;
}

async function openBugTaskModal(taskId) {
  await ensureBugBoardMeta();
  const data = await apiFetch(`/api/chatbot/bug-board/tasks/${encodeURIComponent(taskId)}`);
  const task = data?.task;
  if (!task) throw new Error("Không tìm thấy task.");

  const statusOptions = bugBoardStatusOrder
    .map(
      (status) =>
        `<option value="${escapeHtml(status)}" ${task.status === status ? "selected" : ""}>${escapeHtml(
          bugBoardStatusLabels[status] || status
        )}</option>`
    )
    .join("");
  const priorityOptions = Object.keys(bugBoardPriorityLabels)
    .map(
      (key) =>
        `<option value="${escapeHtml(key)}" ${task.priority === key ? "selected" : ""}>${escapeHtml(
          bugBoardPriorityLabels[key]
        )}</option>`
    )
    .join("");
  const severityOptions = Object.keys(bugBoardSeverityLabels)
    .map(
      (key) =>
        `<option value="${escapeHtml(key)}" ${task.severity === key ? "selected" : ""}>${escapeHtml(
          bugBoardSeverityLabels[key]
        )}</option>`
    )
    .join("");
  const updatesHtml = Array.isArray(task.updates) && task.updates.length
    ? task.updates
        .map((item) => {
          const attachments = renderBugAttachmentSection(item.attachments);
          return `
            <div class="cm-bug-update-item">
              <div class="cm-bug-update-head">
                <span class="cm-bug-update-type">${escapeHtml(item.type || "comment")}</span>
                <span>${escapeHtml(item.author || "-")} • ${escapeHtml(formatTime(item.createdAt))}</span>
              </div>
              <div class="cm-bug-update-text">${escapeHtml(item.text || "")}</div>
              ${attachments}
            </div>
          `;
        })
        .join("")
    : `<div class="cm-bug-empty">Chưa có cập nhật nào.</div>`;

  openModal({
    title: `Bug Task ${task.code || ""}`,
    modalClass: "cm-modal-card-wide",
    submitLabel: "Lưu thay đổi",
    bodyHtml: `
      <div class="cm-bug-task-modal">
        <div class="cm-bug-task-layout">
          <section class="cm-bug-task-panel">
            <div class="cm-bug-task-panel-title">Timeline</div>
            <div class="cm-bug-update-list">${updatesHtml}</div>
          </section>
          <aside class="cm-bug-task-panel">
            <div class="cm-bug-task-panel-title">Task Info</div>
            <div class="cm-bug-detail-block">
              <div class="cm-bug-detail-label">Task</div>
              <div class="cm-bug-detail-value">${escapeHtml(task.code || "")} • ${escapeHtml(task.title || "")}</div>
            </div>
            <div class="cm-bug-detail-block">
              <div class="cm-bug-detail-label">Summary</div>
              <div class="cm-bug-detail-value">${escapeHtml(task.summary || "")}</div>
            </div>
            <div class="cm-bug-detail-block">
              <div class="cm-bug-detail-label">Expected Result</div>
              <div class="cm-bug-detail-value">${escapeHtml(task.expectedResult || "")}</div>
            </div>
            <div class="cm-bug-detail-block">
              <div class="cm-bug-detail-label">Actual Result</div>
              <div class="cm-bug-detail-value">${escapeHtml(task.actualResult || "")}</div>
            </div>
            <div class="cm-bug-form-grid">
              <label class="cm-label">
                Status
                <select id="cm-bug-task-status" class="cm-input cm-select">${statusOptions}</select>
              </label>
              <label class="cm-label">
                Priority
                <select id="cm-bug-task-priority" class="cm-input cm-select">${priorityOptions}</select>
              </label>
              <label class="cm-label">
                Severity
                <select id="cm-bug-task-severity" class="cm-input cm-select">${severityOptions}</select>
              </label>
              <label class="cm-label">
                Assignee
                <input id="cm-bug-task-assignee" class="cm-input" value="${escapeHtml(task.assignee || "")}" />
              </label>
              <label class="cm-label cm-bug-field-full">
                Update comment
                <textarea id="cm-bug-task-update-comment" class="cm-input cm-textarea" placeholder="Ghi chú thay đổi trạng thái / người xử lý..."></textarea>
              </label>
              <label class="cm-label cm-bug-field-full">
                Attachments
                <input id="cm-bug-task-comment-files" class="cm-input" type="file" multiple accept="image/*,.txt,.log,.json,.csv,.pdf,.doc,.docx,.xlsx,.zip" />
              </label>
            </div>
          </aside>
        </div>
      </div>
    `,
    onSubmit: async () => {
      const updateComment = document.getElementById("cm-bug-task-update-comment")?.value || "";
      await apiFetch(`/api/chatbot/bug-board/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: document.getElementById("cm-bug-task-status")?.value || task.status,
          priority: document.getElementById("cm-bug-task-priority")?.value || task.priority,
          severity: document.getElementById("cm-bug-task-severity")?.value || task.severity,
          assignee: document.getElementById("cm-bug-task-assignee")?.value || "",
          updateComment
        })
      });

      const files = document.getElementById("cm-bug-task-comment-files")?.files;
      const attachments = files && files.length ? await uploadBugAttachments(files) : [];
      if (attachments.length) {
        await apiFetch(`/api/chatbot/bug-board/tasks/${encodeURIComponent(task.id)}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: updateComment, attachments })
        });
      }
      await loadBugBoardPanel();
      showToast("Đã cập nhật bug task.");
    }
  });
}

async function openCreateBugTaskModal() {
  await ensureBugBoardMeta();
  openModal({
    title: "Tạo bug task",
    modalClass: "",
    submitLabel: "Tạo task",
    bodyHtml: `
      <div class="cm-bug-form-grid">
        <label class="cm-label cm-bug-field-full">
          Title
          <input id="cm-bug-create-title" class="cm-input" placeholder="VD: Chatbot trả lời sai giá implant Dentium" />
        </label>
        <label class="cm-label">
          Expected Result
          <textarea id="cm-bug-create-expected" class="cm-input cm-textarea"></textarea>
        </label>
        <label class="cm-label">
          Actual Result
          <textarea id="cm-bug-create-actual" class="cm-input cm-textarea"></textarea>
        </label>
        <label class="cm-label">
          Priority
          <select id="cm-bug-create-priority" class="cm-input cm-select">
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label class="cm-label">
          Severity
          <select id="cm-bug-create-severity" class="cm-input cm-select">
            <option value="major">Major</option>
            <option value="minor">Minor</option>
            <option value="critical">Critical</option>
            <option value="blocker">Blocker</option>
          </select>
        </label>
        <label class="cm-label">
          Reporter
          <input id="cm-bug-create-reporter" class="cm-input" />
        </label>
        <label class="cm-label cm-bug-field-full">
          Images
          <input id="cm-bug-create-files" class="cm-input" type="file" multiple accept="image/*" />
        </label>
      </div>
    `,
    onSubmit: async () => {
      const title = document.getElementById("cm-bug-create-title")?.value || "";
      if (!String(title).trim()) throw new Error("Title không được để trống.");
      const expectedResult = document.getElementById("cm-bug-create-expected")?.value || "";
      const actualResult = document.getElementById("cm-bug-create-actual")?.value || "";
      const reporter = document.getElementById("cm-bug-create-reporter")?.value || "";
      const priority = document.getElementById("cm-bug-create-priority")?.value || "medium";
      const files = document.getElementById("cm-bug-create-files")?.files;
      const attachments = files && files.length ? await uploadBugAttachments(files) : [];
      const summary =
        [actualResult, expectedResult].map((item) => String(item || "").trim()).filter(Boolean).join("\n\n") ||
        String(title).trim();
      await apiFetch("/api/chatbot/bug-board/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary,
          expectedResult,
          actualResult,
          priority,
          reporter,
          attachments
        })
      });
      await loadBugBoardPanel();
      showToast("Đã tạo bug task.");
    }
  });
  const reporterInput = document.getElementById("cm-bug-create-reporter");
  if (reporterInput && !reporterInput.value) reporterInput.value = "tester";
}

async function loadBugBoardPanel() {
  const meta = document.getElementById("cm-bug-meta");
  const boardEl = document.getElementById("cm-bug-board");
  if (!meta || !boardEl) return;
  meta.textContent = "Đang tải...";
  bugTaskById.clear();
  try {
    await ensureBugBoardMeta();
    const data = await apiFetch("/api/chatbot/bug-board/tasks");
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    tasks.forEach((task) => {
      if (task?.id) bugTaskById.set(String(task.id), task);
    });
    meta.textContent = `${tasks.length} bug task.`;
    boardEl.innerHTML = bugBoardStatusOrder
      .map((status) => {
        const items = tasks.filter((task) => task.status === status);
        return `
          <section class="cm-bug-column" data-bug-status="${escapeHtml(status)}">
            <div class="cm-bug-column-header">
              <div class="cm-bug-column-title">${escapeHtml(bugBoardStatusLabels[status] || status)}</div>
              <div class="cm-bug-column-count">${items.length}</div>
            </div>
            <div class="cm-bug-column-body">
              ${items.length ? items.map(renderBugTaskCard).join("") : `<div class="cm-bug-empty">Chưa có task</div>`}
            </div>
          </section>
        `;
      })
      .join("");
  } catch (e) {
    meta.textContent = e.message || "Lỗi tải";
    boardEl.innerHTML = "";
  }
}

let zaloPollTimer = null;
let zaloSessionId = null;

function formatZaloRecipientLines(recipients) {
  const rows = Array.isArray(recipients) ? recipients : [];
  return rows
    .map((item) => {
      const uid = String(item?.uid || "").trim();
      const label = String(item?.label || "").trim();
      if (!uid) return "";
      return label ? `${uid} | ${label}` : uid;
    })
    .filter(Boolean)
    .join("\n");
}

function parseZaloRecipientLines(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      const [uidPart, ...labelParts] = line.split("|");
      return {
        uid: String(uidPart || "").trim(),
        label: labelParts.join("|").trim()
      };
    })
    .filter((item) => item.uid);
}

function stopZaloQrPoll() {
  if (zaloPollTimer) {
    clearInterval(zaloPollTimer);
    zaloPollTimer = null;
  }
}

function zaloQrImageSrc(image) {
  const s = String(image || "").trim();
  if (!s) return "";
  if (s.startsWith("data:image")) return s;
  return `data:image/png;base64,${s}`;
}

async function loadZaloPanel() {
  const meta = document.getElementById("cm-zalo-meta");
  const recipientEl = document.getElementById("cm-zalo-recipient-list");
  if (!meta) return;
  try {
    const s = await apiFetch("/api/chatbot/zalo-personal/status");
    const parts = [
      `File credentials: ${s.credentialsFileExists ? "có" : "chưa"}`,
      `API/cache: ${s.connected ? "sẵn sàng" : "chưa"}`,
      `Người nhận: ${Array.isArray(s.notifyRecipients) ? s.notifyRecipients.length : 0}`,
      `Nguồn danh sách: ${escapeHtml(String(s.notifyRecipientsSource || ""))}`,
      `UID mặc định: ${escapeHtml(String(s.notifyUid || ""))}`
    ];
    if (s.savedAt) parts.push(`Lưu lúc: ${escapeHtml(String(s.savedAt))}`);
    if (s.notifyRecipientsUpdatedAt) parts.push(`DS cập nhật: ${escapeHtml(String(s.notifyRecipientsUpdatedAt))}`);
    if (s.accountHint) parts.push(`Tài khoản (QR): ${escapeHtml(String(s.accountHint))}`);
    meta.textContent = parts.join(" · ");
    if (recipientEl) recipientEl.value = formatZaloRecipientLines(s.notifyRecipients);
  } catch (e) {
    meta.textContent = e.message || "Lỗi tải trạng thái Zalo.";
  }
}

async function pollZaloLoginSessionOnce() {
  if (!zaloSessionId) return;
  const qrWrap = document.getElementById("cm-zalo-qr-wrap");
  const qrEl = document.getElementById("cm-zalo-qr");
  const hint = document.getElementById("cm-zalo-qr-hint");
  try {
    const s = await apiFetch(`/api/chatbot/zalo-personal/login/session/${encodeURIComponent(zaloSessionId)}`);
    const src = zaloQrImageSrc(s.image);
    if (src && qrEl) {
      qrEl.innerHTML = `<img alt="QR Zalo" src="${src}" />`;
    }
    if (hint) {
      if (s.phase === "scanned" && s.scannedName) {
        hint.textContent = `Đã quét: ${s.scannedName} — đang đăng nhập...`;
      } else if (s.done || s.phase === "done") {
        hint.textContent = "Đăng nhập xong.";
      } else if (s.error) {
        hint.textContent = String(s.error);
      } else {
        hint.textContent = "Quét QR bằng Zalo trên điện thoại (tài khoản cá nhân).";
      }
    }
    if (s.done || s.status === "done" || s.phase === "done") {
      stopZaloQrPoll();
      zaloSessionId = null;
      qrWrap?.classList.add("hidden");
      await loadZaloPanel();
      showToast("Đã kết nối Zalo cá nhân.");
    }
    if (s.status === "error" || s.phase === "error") {
      stopZaloQrPoll();
      showToast(s.error || "Đăng nhập Zalo lỗi.");
    }
  } catch (e) {
    stopZaloQrPoll();
    showToast(e.message || "Phiên QR không hợp lệ.");
  }
}

document.getElementById("cm-tab-ops")?.addEventListener("click", () => setCmTab("ops"));
document.getElementById("cm-tab-intake")?.addEventListener("click", () => setCmTab("intake"));
document.getElementById("cm-tab-booking")?.addEventListener("click", () => setCmTab("booking"));
document.getElementById("cm-tab-bug")?.addEventListener("click", () => setCmTab("bug"));
document.getElementById("cm-tab-zalo")?.addEventListener("click", () => setCmTab("zalo"));
document.getElementById("cm-tab-processing")?.addEventListener("click", () => setCmTab("processing"));
document.getElementById("btn-bot-status-refresh")?.addEventListener("click", () => loadBotReplyStatusPanel());
document.getElementById("btn-intake-refresh")?.addEventListener("click", () => loadIntakePanel());
document.getElementById("btn-booking-refresh")?.addEventListener("click", () => loadBookingPanel());
document.getElementById("btn-bug-refresh")?.addEventListener("click", () => loadBugBoardPanel());
document.getElementById("btn-bug-create")?.addEventListener("click", () => {
  openCreateBugTaskModal().catch((e) => showToast(e.message || "Không mở được form bug."));
});

document.getElementById("cm-panel-intake")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-intake-json]");
  if (!btn) return;
  const id = String(btn.dataset.intakeJson || "").trim();
  const conv = intakeConversationById.get(id);
  if (conv) openIntakeJsonModal(conv);
});
document.getElementById("cm-panel-booking")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-booking-json]");
  if (!btn) return;
  const id = String(btn.dataset.bookingJson || "").trim();
  const booking = bookingById.get(id);
  if (booking) openBookingJsonModal(booking, btn.dataset.careStatus || "bot_care");
});
document.getElementById("cm-panel-bug")?.addEventListener("click", (ev) => {
  const card = ev.target.closest("[data-bug-task-id]");
  if (!card) return;
  const taskId = String(card.dataset.bugTaskId || "").trim();
  if (!taskId) return;
  openBugTaskModal(taskId).catch((e) => showToast(e.message || "Không mở được task."));
});

document.getElementById("btn-zalo-refresh-status")?.addEventListener("click", () => loadZaloPanel().catch((e) => showToast(e.message)));
document.getElementById("btn-zalo-save-recipients")?.addEventListener("click", async () => {
  try {
    const recipients = parseZaloRecipientLines(document.getElementById("cm-zalo-recipient-list")?.value || "");
    await apiFetch("/api/chatbot/zalo-personal/notify-recipients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyRecipients: recipients })
    });
    await loadZaloPanel();
    showToast(`Đã lưu ${recipients.length} người nhận.`);
  } catch (e) {
    showToast(e.message || "Lưu danh sách thất bại.");
  }
});
document.getElementById("btn-zalo-start-qr")?.addEventListener("click", async () => {
  const qrWrap = document.getElementById("cm-zalo-qr-wrap");
  const qrEl = document.getElementById("cm-zalo-qr");
  const hint = document.getElementById("cm-zalo-qr-hint");
  stopZaloQrPoll();
  zaloSessionId = null;
  if (qrEl) qrEl.innerHTML = "";
  if (hint) hint.textContent = "Đang tạo mã QR...";
  qrWrap?.classList.remove("hidden");
  try {
    const res = await apiFetch("/api/chatbot/zalo-personal/login/start", { method: "POST" });
    zaloSessionId = String(res.sessionId || "").trim();
    if (!zaloSessionId) throw new Error("Không nhận được sessionId.");
    await pollZaloLoginSessionOnce();
    zaloPollTimer = setInterval(() => pollZaloLoginSessionOnce().catch(() => {}), 1500);
  } catch (e) {
    showToast(e.message || "Không bắt đầu được QR.");
    qrWrap?.classList.add("hidden");
  }
});
document.getElementById("btn-zalo-abort-qr")?.addEventListener("click", async () => {
  stopZaloQrPoll();
  if (zaloSessionId) {
    try {
      await apiFetch("/api/chatbot/zalo-personal/login/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: zaloSessionId })
      });
    } catch (_) {}
  }
  zaloSessionId = null;
  document.getElementById("cm-zalo-qr-wrap")?.classList.add("hidden");
});
document.getElementById("btn-zalo-disconnect")?.addEventListener("click", async () => {
  if (!window.confirm("Xóa file đăng nhập Zalo trên server và ngắt kết nối?")) return;
  stopZaloQrPoll();
  zaloSessionId = null;
  try {
    await apiFetch("/api/chatbot/zalo-personal/disconnect", { method: "POST" });
    showToast("Đã ngắt Zalo.");
    await loadZaloPanel();
    document.getElementById("cm-zalo-qr-wrap")?.classList.add("hidden");
  } catch (e) {
    showToast(e.message || "Lỗi ngắt.");
  }
});
document.getElementById("btn-zalo-test-send")?.addEventListener("click", async () => {
  try {
    const res = await apiFetch("/api/chatbot/zalo-personal/test-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Test Chatbot Manager → Zalo cá nhân." })
    });
    showToast(`Đã gửi tin thử tới ${Number(res?.count || 0)} người nhận.`);
  } catch (e) {
    showToast(e.message || "Gửi thử thất bại.");
  }
});

async function bootstrap() {
  await refreshManagerStatic();
  let initialTab = "ops";
  try {
    const s = String(localStorage.getItem(CM_TAB_KEY) || "").trim();
    if (s === "clinic") initialTab = "ops";
    else if (s === "bot-status") initialTab = "processing";
    else if (s === "intake" || s === "booking" || s === "bug" || s === "ops" || s === "zalo" || s === "processing") initialTab = s;
  } catch (_) {}
  setCmTab(initialTab);
}

bootstrap().catch((error) => {
  showToast(error.message);
});

