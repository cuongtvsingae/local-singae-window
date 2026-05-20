const { isValidVietnamPhone } = require("./botStructuredOutput");

function intakeNotesSufficient(notes) {
  return String(notes || "").trim().length >= 4;
}

function maskPhoneForSummary(phone) {
  const p = String(phone || "").trim();
  if (!p || p.length < 6) return "";
  return `${p.slice(0, 3)}***${p.slice(-2)}`;
}

/**
 * One-line human-readable intake for LLM (replaces verbose JSON by default).
 */
function buildIntakeSummaryLine(intakeSnap) {
  if (!intakeSnap) return "";
  const parts = [];
  const notes = String(intakeSnap.notes || "").trim();
  if (notes) {
    const short = notes.length > 48 ? `${notes.slice(0, 45)}…` : notes;
    parts.push(`notes=${short}`);
  } else {
    parts.push("notes=—");
  }
  const region = String(intakeSnap.patient?.regionLive || "").trim();
  parts.push(region ? `regionLive=${region}` : "regionLive=—");
  const phone = String(intakeSnap.patient?.phone || "").trim();
  if (isValidVietnamPhone(phone)) {
    parts.push(`phone=${maskPhoneForSummary(phone)}`);
  } else {
    parts.push("phone=—");
  }
  const name = String(intakeSnap.patient?.fullName || "").trim();
  if (name) parts.push(`fullName=${name.length > 24 ? `${name.slice(0, 21)}…` : name}`);
  return `[INTAKE TÓM TẮT]: ${parts.join("; ")}.`;
}

function buildIntakeMissingMarkdown(intakeSnap, conversationHistory = []) {
  if (!intakeSnap) return "";
  const missing = [];
  if (!intakeNotesSufficient(intakeSnap.notes)) {
    missing.push("notes (tình trạng/mục đích)");
  }
  if (!String(intakeSnap.patient?.regionLive || "").trim()) {
    missing.push("regionLive (khu vực đang ở)");
  }
  if (!isValidVietnamPhone(intakeSnap.patient?.phone)) {
    missing.push("phone (SĐT hợp lệ)");
  }
  if (!missing.length) return "";

  let priorityField = "phone";
  if (!intakeNotesSufficient(intakeSnap.notes)) priorityField = "notes";
  else if (!String(intakeSnap.patient?.regionLive || "").trim()) priorityField = "regionLive";
  else if (!isValidVietnamPhone(intakeSnap.patient?.phone)) priorityField = "phone";

  let prevHint = "";
  const lastAssistant = [...(conversationHistory || [])]
    .reverse()
    .find((m) => m && m.role === "assistant" && String(m.content || "").trim());
  if (lastAssistant) {
    const t = String(lastAssistant.content || "").toLowerCase();
    const prev = [];
    if (/sđt|so dien thoai|liên hệ|lien he|091|098|090|zalo/.test(t)) {
      prev.push("lượt trước bot đã mời SĐT");
    }
    if (/khu vực|khu vuc|tỉnh|thành|đang ở|dang o/.test(t)) {
      prev.push("lượt trước bot đã hỏi khu vực");
    }
    if (/tình trạng|tinh trang|răng|ham|đau|dau|vị trí|vi tri|số răng/.test(t)) {
      prev.push("lượt trước bot đã hỏi tình trạng/notes");
    }
    if (prev.length) {
      prevHint = `\n\n[GỢI Ý LƯỢT TRƯỚC]: ${prev.join("; ")} — đổi cách nói, không lặp nguyên văn câu khai thác cũ.`;
    }
  }

  return (
    `\n\n[INTAKE CÒN THIẾU]: ${missing.join("; ")}.` +
    `\nLượt này ưu tiên hỏi/đề nghị **một** field: **${priorityField}** (thứ tự: notes → regionLive → phone).` +
    prevHint
  );
}

function buildSessionSummaryMarkdown({ lastChatSummary, intakeSnap }) {
  const topics = String(lastChatSummary || "").trim();
  const missing = [];
  if (intakeSnap) {
    if (!intakeNotesSufficient(intakeSnap.notes)) missing.push("notes");
    if (!String(intakeSnap.patient?.regionLive || "").trim()) missing.push("khu vực");
    if (!isValidVietnamPhone(intakeSnap.patient?.phone)) missing.push("SĐT");
  }
  const parts = [];
  if (topics) parts.push(`Đã trao đổi: ${topics.slice(0, 200)}`);
  if (missing.length) parts.push(`Còn thiếu: ${missing.join(", ")}`);
  if (!parts.length) return "";
  return `\n\n[TÓM TẮT PHIÊN]: ${parts.join("; ")}.`;
}

function shouldIncludeFullIntakeJson() {
  const v = String(process.env.DEBUG_INTAKE_JSON ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * @param {object} opts
 * @param {object|null} opts.intakeSnap
 * @param {string} opts.fullIntakeJsonMarkdown - prebuilt [INTAKE ĐÃ LƯU] block
 * @param {Array} opts.conversationHistory
 */
function buildIntakeRuntimeMarkdown({ intakeSnap, fullIntakeJsonMarkdown = "", conversationHistory = [] }) {
  if (!intakeSnap) return "";
  let out = "";
  const summary = buildIntakeSummaryLine(intakeSnap);
  if (summary) out += `\n\n${summary}`;
  out += buildIntakeMissingMarkdown(intakeSnap, conversationHistory);
  if (shouldIncludeFullIntakeJson() && String(fullIntakeJsonMarkdown || "").trim()) {
    out += fullIntakeJsonMarkdown;
  } else if (String(fullIntakeJsonMarkdown || "").trim()) {
    out +=
      "\n\n[INTAKE JSON — merge vào collected khi khách cung cấp thêm; không ghi đè field đã có nếu khách không đổi — chi tiết server-side.]";
  }
  return out;
}

module.exports = {
  buildIntakeSummaryLine,
  buildIntakeMissingMarkdown,
  buildSessionSummaryMarkdown,
  buildIntakeRuntimeMarkdown,
  shouldIncludeFullIntakeJson,
  intakeNotesSufficient
};
