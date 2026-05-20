/**
 * Bot assistant must return a single JSON object (UTF-8).
 * user_message = text shown to the customer on Messenger.
 * actions = server-side side effects (merge intake, create booking request, etc.).
 *
 * Format API (OpenAI json_schema): moi phan tu actions[] co CUNG hinh —
 * { kind, patch, appointment } — khong dung oneOf (de API/code on dinh).
 * normalizeEnvelope() chuyen ve dang legacy { type, patch?, appointment? } cho server.js.
 */

const BOT_JSON_RESPONSE_INSTRUCTION = `

[MUC TIEU] Mot lan goi API = **mot** object JSON thuan (khong markdown). OpenAI da ep **json_schema strict** — neu sai key/thieu key API se tu sua hoac loi; van ban duoi day la **huong dan nghiep vu + vi du**, khong duoc copy nguyen du lieu mau vao tin that.

[QUY TAC BAT BUOC — VI PHAM LA LOI FORMAT]
1. Sau khi trim(), **toan bo** phan hoi chi la **mot** object JSON: ky tu dau la "{" , ky tu cuoi la "}" — khong \`\`\`json , khong tien to "JSON:", khong van ban sau "}" .
2. Root **dung 7 key** (khong them/bot): version, conversation_phase, inbox_hint, booking_client_confirmed, user_message, collected, actions .
3. **user_message**: string **khac rong** — la noi dung khach nhin thay tren Messenger.
4. **actions**: array **>= 1** phan tu, **toi da 8**. Moi phan tu **bat buoc** { kind, patch, appointment } — **khong** bo bot patch hay appointment du kind la gi.

[Y NGHIA TUNG KEY ROOT]
- **version** (number): luon **1** .
- **conversation_phase** (string): **idle** | **collecting_info** | **scheduling** — giai doan hoi thoai; dat **scheduling** khi dang xu ly / vua xu ly dat lich.
- **inbox_hint** (string): **keep** (bot tiep) | **needs_human** (can nguoi that).
- **booking_client_confirmed** (boolean): dat **true** **chi** khi trong **actions[]** cua **luot nay** co it nhat mot phan tu **kind** = **create_booking_request** , va da du dieu kien tao lich (intake / phone hop le theo quy tac duoi). Moi luot khac: **false** .
- **user_message**: tin tieng Viet day du dau gui khach — **khong** de "" .
- **collected**: snapshot intake sau luot ( **patient** du 7 key + **notes** ); gia tri chua biet thi "" .
- **actions**: mang tac vu server (merge intake / tao booking); **moi phan tu cung hinh** .

[Y NGHIA patch / appointment TRONG MOI ACTION]
- **patch.patient**: object du 7 key string: fullName, phone, regionLive, preferredOfficeKey (**""** | **25VNP** | **355LTT**), shuttlePickup (**""** | **yes** | **no**), preferredVisitDate, preferredVisitTime .
- **patch.notes**: string.
- **appointment** (luon day du 5 key): id, startAt, endAt, serviceName, status — voi kind **none** hoac merge chua tao lich co the toan "" ; voi **create_booking_request** thi **id** va **serviceName** va **status** (vd **booked** ) can hop le nghiep vu.

[Y NGHIA kind]
- **none**: khong ghi DB intake / khong tao booking trong tac vu do (van dien du patch + appointment, co the rong).
- **merge_customer_intake**: ghi / bo sung intake tu tin khach (patch + **collected** phai thong nhat). **user_message** khong dung kieu "da ghi nhan / da luu" noi bo.
- **create_booking_request**: tao yeu cau dat lich — thuong sau khi da co SĐT hop le trong intake (co **merge_customer_intake** truoc trong cung payload neu can). **booking_client_confirmed** = **true** , **conversation_phase** thuong **scheduling** .

[MAP NHANH — KHONG NHAI SO DIEN THOAI MAU]
| Yeu cau nghiep vu | phase | inbox_hint | booking_client_confirmed | actions (thu tu) |
| Tu van, chua luu DB | collecting_info hoac idle | keep | false | [ none ] |
| Luu intake | collecting_info | keep | false | [ merge_customer_intake ] |
| Merge + tao booking cung luot | scheduling | keep | true | [ merge_customer_intake , create_booking_request ] |
| Chi tao booking (intake da co san) | scheduling | keep | true | [ create_booking_request ] |
| Chuyen nguoi | collecting_info | needs_human | false (neu khong tao lich) | [ none ] hoac merge |
| SĐT sai | collecting_info | keep | false | merge nhung **phone** = "" trong patch/collected |

[LOI THUONG GAP]
- Them key root hoac key trong patient khong thuoc schema.
- **preferredOfficeKey** khac **25VNP** / **355LTT** / "" .
- **shuttlePickup** khac yes/no/"" .
- Thieu **mot** trong 7 key **patient** hoac thieu **notes** / thieu field trong **appointment** .
- **user_message** rong hoac chi la JSON/string ky thuat.

[SĐT — TRUNG KHOI SERVER]
- Hop le theo regex server (di dong VN); +84 / 84 -> doi ve dau 0 ; bo khoang trang truoc khi validate.

[user_message — nghiep vu]
- Giong, do dai, xung ho, khai thac: **rulesHub.txt** + runtime [CASE], [XƯNG HÔ ĐÃ CHỌN], [INTAKE CÒN THIẾU] — **khong** lap lai trong block JSON nay.

[Nguon noi dung: conversationSetup.txt + rulesHub.txt + cases.compact.xml + monthlyPromotionsByOffice.txt (promptCompiler)]

[VI DU A — TOI THIEU kind:none — COPY KHUNG, DOI user_message]
{"version":1,"conversation_phase":"collecting_info","inbox_hint":"keep","booking_client_confirmed":false,"user_message":"Dạ, xin thêm một chi tiết để bác sĩ tư vấn đúng hướng ạ.","collected":{"patient":{"fullName":"","phone":"","regionLive":"","preferredOfficeKey":"","shuttlePickup":"","preferredVisitDate":"","preferredVisitTime":""},"notes":""},"actions":[{"kind":"none","patch":{"patient":{"fullName":"","phone":"","regionLive":"","preferredOfficeKey":"","shuttlePickup":"","preferredVisitDate":"","preferredVisitTime":""},"notes":""},"appointment":{"id":"","startAt":"","endAt":"","serviceName":"","status":""}}]}

[VI DU B — merge roi create_booking — **mot dong**, chi minh hoa cau truc; dien ten/sdt/ngay that tu hoi thoai]
{"version":1,"conversation_phase":"scheduling","inbox_hint":"keep","booking_client_confirmed":true,"user_message":"Dạ, đã tiếp nhận chốt lịch và chuyển yêu cầu ạ.","collected":{"patient":{"fullName":"","phone":"0912345678","regionLive":"","preferredOfficeKey":"355LTT","shuttlePickup":"","preferredVisitDate":"","preferredVisitTime":""},"notes":""},"actions":[{"kind":"merge_customer_intake","patch":{"patient":{"fullName":"","phone":"0912345678","regionLive":"","preferredOfficeKey":"355LTT","shuttlePickup":"","preferredVisitDate":"","preferredVisitTime":""},"notes":""},"appointment":{"id":"","startAt":"","endAt":"","serviceName":"","status":""}},{"kind":"create_booking_request","patch":{"patient":{"fullName":"","phone":"0912345678","regionLive":"","preferredOfficeKey":"355LTT","shuttlePickup":"","preferredVisitDate":"","preferredVisitTime":""},"notes":""},"appointment":{"id":"bk-example-id","startAt":"","endAt":"","serviceName":"Thăm khám","status":"booked"}}]}

[CHECKLIST TRUOC KHI GUI]
1. Phan hoi chi co JSON, khong fence.
2. Du 7 key root; **user_message** khac rong.
3. **actions**.length >= 1 ; moi phan tu du kind + patch + appointment .
4. **booking_client_confirmed** === true **neu va chi neu** co **create_booking_request** trong actions .
5. **preferredOfficeKey** / **shuttlePickup** chi gia tri cho phep o tren.
`;

function stripCodeFence(text) {
  let s = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z0-9]*\s*/, "");
    const idx = s.lastIndexOf("```");
    if (idx !== -1) s = s.slice(0, idx).trim();
  }
  return s.trim();
}

/** Gộp mọi chuỗi xuống dòng liên tiếp thành một \\n (không dòng trống). */
function collapseConsecutiveNewlines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const USER_MESSAGE_SOFT_MAX_CHARS = 520;
const USER_MESSAGE_SOFT_MAX_SENTENCES = 10;

function sanitizeOutgoingUserMessage(text) {
  return collapseConsecutiveNewlines(String(text || "").replace(/\*/g, ""));
}

/** Log-only: canh bao khi user_message qua dai (khong cat cung). */
function warnIfUserMessageVerbose(userMessage, meta = {}) {
  const msg = String(userMessage || "").trim();
  if (!msg) return;
  const sentences = msg.split(/[.!?…]+/).filter((s) => String(s).trim().length > 2);
  if (msg.length > USER_MESSAGE_SOFT_MAX_CHARS || sentences.length > USER_MESSAGE_SOFT_MAX_SENTENCES) {
    const { appendServerLog } = require("./serverLogs");
    appendServerLog({
      level: "info",
      source: "bot-structured-output",
      message: "user_message longer than soft guideline",
      metadata: {
        length: msg.length,
        sentenceCount: sentences.length,
        ...meta
      }
    });
  }
}

function tryParseJsonObject(raw) {
  const s0 = stripCodeFence(raw);
  try {
    const j = JSON.parse(s0);
    if (j && typeof j === "object" && !Array.isArray(j)) return { ok: true, value: j };
  } catch (_) {
    /* fallthrough */
  }
  const start = s0.indexOf("{");
  const end = s0.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = s0.slice(start, end + 1);
    try {
      const j = JSON.parse(slice);
      if (j && typeof j === "object" && !Array.isArray(j)) return { ok: true, value: j };
    } catch (_) {
      return { ok: false, value: null };
    }
  }
  return { ok: false, value: null };
}

const PHASES = new Set(["idle", "collecting_info", "scheduling"]);
const INBOX_HINTS = new Set(["keep", "needs_human"]);
const VN_PHONE_REGEX = /^(0?)(3[2-9]|5[6|8|9]|7[0|6-9]|8[0-6|8|9]|9[0-4|6-9])[0-9]{7}$/;

function normalizePhoneForValidation(phoneRaw) {
  const compact = String(phoneRaw || "").replace(/\s+/g, "").trim();
  if (!compact) return "";
  if (compact.startsWith("+84")) return `0${compact.slice(3)}`;
  if (compact.startsWith("84")) return `0${compact.slice(2)}`;
  return compact;
}

function isValidVietnamPhone(phoneRaw) {
  const normalized = normalizePhoneForValidation(phoneRaw);
  return VN_PHONE_REGEX.test(normalized);
}

/** True if the customer's message contains at least one valid VN mobile (for booking gate / confirmation heuristics). */
function textContainsValidVietnamPhone(text) {
  const digits = String(text || "").replace(/\D/g, "");
  if (digits.length < 9) return false;
  for (let len = 9; len <= 12 && len <= digits.length; len++) {
    for (let i = 0; i + len <= digits.length; i++) {
      if (isValidVietnamPhone(digits.slice(i, i + len))) return true;
    }
  }
  return false;
}

function normalizePatientPatch(p) {
  const x = p && typeof p === "object" ? p : {};
  let preferredOfficeKey = String(x.preferredOfficeKey ?? "")
    .trim()
    .toUpperCase();
  if (preferredOfficeKey !== "25VNP" && preferredOfficeKey !== "355LTT") preferredOfficeKey = "";
  let shuttlePickup = String(x.shuttlePickup ?? "")
    .trim()
    .toLowerCase();
  if (shuttlePickup !== "yes" && shuttlePickup !== "no") shuttlePickup = "";
  const preferredVisitDate = String(x.preferredVisitDate ?? "")
    .trim()
    .slice(0, 32);
  const preferredVisitTime = String(x.preferredVisitTime ?? "")
    .trim()
    .slice(0, 32);
  const phoneRaw = String(x.phone ?? "").trim();
  const phone = isValidVietnamPhone(phoneRaw) ? normalizePhoneForValidation(phoneRaw) : "";
  return {
    fullName: String(x.fullName ?? "").trim(),
    phone,
    regionLive: String(x.regionLive ?? "").trim(),
    preferredOfficeKey,
    shuttlePickup,
    preferredVisitDate,
    preferredVisitTime
  };
}

function normalizeAppointmentShape(ap) {
  const x = ap && typeof ap === "object" ? ap : {};
  return {
    id: String(x.id ?? "").trim(),
    startAt: String(x.startAt ?? "").trim(),
    endAt: String(x.endAt ?? "").trim(),
    serviceName: String(x.serviceName ?? "").trim(),
    status: String(x.status ?? "").trim() || "booked"
  };
}

/**
 * Chuan hoa 1 phan tu actions[] -> dang server dung: { type, patch?, appointment? }.
 * Ho tro format moi { kind, patch, appointment } va format cu { type, patch?, appointment? }.
 */
function normalizeActionItem(raw) {
  if (!raw || typeof raw !== "object") return { type: "none" };
  if (raw.kind != null && String(raw.kind).trim() !== "") {
    const kind = String(raw.kind || "").trim().toLowerCase();
    const patchRaw = raw.patch && typeof raw.patch === "object" ? raw.patch : {};
    const patient = normalizePatientPatch(patchRaw.patient);
    const notes = collapseConsecutiveNewlines(String(patchRaw.notes ?? ""));
    const appointment = normalizeAppointmentShape(raw.appointment);
    if (kind === "merge_customer_intake") {
      return { type: "merge_customer_intake", patch: { patient, notes } };
    }
    if (kind === "create_booking_request" || kind === "append_appointment_draft") {
      return { type: "create_booking_request", patch: { patient, notes }, appointment };
    }
    return { type: "none" };
  }
  const t = String(raw.type || "").trim().toLowerCase();
  if (t === "merge_customer_intake") {
    const patchRaw = raw.patch && typeof raw.patch === "object" ? raw.patch : {};
    const patient = normalizePatientPatch(patchRaw.patient);
    const notes = collapseConsecutiveNewlines(String(patchRaw.notes ?? ""));
    return { type: "merge_customer_intake", patch: { patient, notes } };
  }
  if (t === "create_booking_request" || t === "append_appointment_draft") {
    const patchRaw = raw.patch && typeof raw.patch === "object" ? raw.patch : {};
    const patient = normalizePatientPatch(patchRaw.patient);
    const notes = collapseConsecutiveNewlines(String(patchRaw.notes ?? ""));
    return {
      type: "create_booking_request",
      patch: { patient, notes },
      appointment: normalizeAppointmentShape(raw.appointment)
    };
  }
  return { type: "none" };
}

function normalizeCollected(c) {
  const p = c?.patient && typeof c.patient === "object" ? c.patient : {};
  let preferredOfficeKey = String(p.preferredOfficeKey ?? "")
    .trim()
    .toUpperCase();
  if (preferredOfficeKey !== "25VNP" && preferredOfficeKey !== "355LTT") preferredOfficeKey = "";
  let shuttlePickup = String(p.shuttlePickup ?? "")
    .trim()
    .toLowerCase();
  if (shuttlePickup !== "yes" && shuttlePickup !== "no") shuttlePickup = "";
  const preferredVisitDate = String(p.preferredVisitDate ?? "")
    .trim()
    .slice(0, 32);
  const preferredVisitTime = String(p.preferredVisitTime ?? "")
    .trim()
    .slice(0, 32);
  const phoneRaw = String(p.phone ?? "").trim();
  const phone = isValidVietnamPhone(phoneRaw) ? normalizePhoneForValidation(phoneRaw) : "";
  return {
    patient: {
      fullName: String(p.fullName ?? "").trim(),
      phone,
      regionLive: String(p.regionLive ?? "").trim(),
      preferredOfficeKey,
      shuttlePickup,
      preferredVisitDate,
      preferredVisitTime
    },
    notes: collapseConsecutiveNewlines(String(c?.notes ?? ""))
  };
}

function normalizeEnvelope(obj) {
  const version = Number(obj.version) === 1 ? 1 : 1;
  const phase = PHASES.has(String(obj.conversation_phase || "").trim())
    ? String(obj.conversation_phase).trim()
    : "idle";
  const inbox_hint = INBOX_HINTS.has(String(obj.inbox_hint || "").trim())
    ? String(obj.inbox_hint).trim()
    : "keep";
  const booking_client_confirmed = obj.booking_client_confirmed === true;
  const user_message = sanitizeOutgoingUserMessage(obj.user_message != null ? obj.user_message : "");
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  let actions = rawActions.map(normalizeActionItem).filter((a) => a && typeof a === "object");
  if (!actions.length) actions = [{ type: "none" }];
  const collected = normalizeCollected(obj.collected != null ? obj.collected : {});
  return {
    version,
    conversation_phase: phase,
    inbox_hint,
    booking_client_confirmed,
    user_message,
    collected,
    actions
  };
}

/**
 * @param {string} rawAnswer
 * @returns {{ userMessage: string, envelope: object|null, parseNote: string }}
 */
function parseBotStructuredAssistantText(rawAnswer) {
  const raw = String(rawAnswer || "").trim();
  if (!raw) {
    return {
      userMessage: "",
      envelope: null,
      parseNote: "empty"
    };
  }
  const { ok, value } = tryParseJsonObject(raw);
  if (!ok || !value) {
    return {
      userMessage: "",
      envelope: null,
      parseNote: "hardfail_invalid_json"
    };
  }
  try {
    const envelope = normalizeEnvelope(value);
    const um = sanitizeOutgoingUserMessage(envelope.user_message != null ? envelope.user_message : "");
    if (!String(um || "").trim()) {
      return {
        userMessage: "",
        envelope,
        parseNote: "hardfail_empty_user_message"
      };
    }
    warnIfUserMessageVerbose(um);
    return { userMessage: um, envelope, parseNote: "ok" };
  } catch (_) {
    return {
      userMessage: "",
      envelope: null,
      parseNote: "hardfail_normalize_failed"
    };
  }
}

module.exports = {
  BOT_JSON_RESPONSE_INSTRUCTION,
  parseBotStructuredAssistantText,
  normalizeCollected,
  textContainsValidVietnamPhone,
  isValidVietnamPhone
};
