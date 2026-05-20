const crypto = require("crypto");
const { fetchSimlyAppointmentsJson, todayYyyyMmDd } = require("../../lib/simlyPublicClient");
const { sqlRun, sqlAll, kvGetJson, kvSetJson, ensureInit } = require("./sqliteStore");
const { loadChatHistory, normalizeCustomerIntake } = require("./chatHistory");

const SYNC_META_KEY = "clinic-simly-appointments-sync-meta";

/** Giờ nhận khách (VN) — dùng cho UI / bước sau tính slot trống. */
const CLINIC_RECEPTION_HOURS = { startHour: 8, endHour: 19, label: "08:00–19:00 hằng ngày" };

/** Mặc định API xem / đồng bộ: hôm nay → đủ 7 ngày (hôm nay + 6). */
const DEFAULT_RANGE_DAYS = 7;

const DEFAULT_OFFICES = ["25VNP", "355LTT"];

function yyyyMmDd(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function addDaysYmd(ymd, deltaDays) {
  const base = yyyyMmDd(ymd) || todayYyyyMmDd();
  const [y, m, d] = base.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(deltaDays) || 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function defaultRangeFromToday() {
  const from = todayYyyyMmDd();
  const to = addDaysYmd(from, DEFAULT_RANGE_DAYS - 1);
  return { fromDate: from, toDate: to };
}

function extractAppointmentRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((x) => x && typeof x === "object");
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  if (payload.data && Array.isArray(payload.data.records)) return payload.data.records;
  if (payload.result && Array.isArray(payload.result)) return payload.result;
  return [];
}

function pickStr(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** Lấy yyyy-mm-dd từ một dòng Simly (hoặc null). */
function pickApptDateYmd(row) {
  const keys = [
    "appointmentDate",
    "ngayHen",
    "bookDate",
    "bookingDate",
    "scheduleDate",
    "date",
    "ngay",
    "apptDate",
    "appointment_date"
  ];
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const st = pickStr(row, ["startAt", "start_at", "dateTime", "appointmentTime", "fromTime", "beginTime"]);
  if (st) {
    const m = st.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const t = Date.parse(st);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

function pickPatientPhone(row) {
  return pickStr(row, [
    "phone",
    "mobile",
    "telephone",
    "soDienThoai",
    "phoneNumber",
    "patientPhone",
    "customerPhone",
    "dienThoai",
    "sdt"
  ]);
}

function pickExternalId(row, officeKey, apptDate, index) {
  const id =
    row.id ??
    row.appointmentId ??
    row.appointment_id ??
    row.scheduleId ??
    row.schedule_id ??
    row.maLichHen ??
    row.code ??
    row.Code;
  if (id != null && String(id).trim()) return String(id).trim().slice(0, 200);
  const h = crypto.createHash("sha256").update(`${officeKey}|${apptDate}|${index}|${JSON.stringify(row)}`).digest("hex").slice(0, 24);
  return `gen-${h}`;
}

function normalizeAppointmentRow(officeKey, apptDate, row, index) {
  const externalId = pickExternalId(row, officeKey, apptDate, index);
  const startAt = pickStr(row, [
    "startAt",
    "start_at",
    "fromTime",
    "startTime",
    "beginTime",
    "gioBatDau",
    "timeStart",
    "appointmentTime",
    "dateTime"
  ]);
  const endAt = pickStr(row, ["endAt", "end_at", "endTime", "toTime", "gioKetThuc", "timeEnd"]);
  const patientName = pickStr(row, [
    "patientName",
    "customerName",
    "patient_name",
    "tenBenhNhan",
    "fullName",
    "patientFullName",
    "name"
  ]);
  const serviceName = pickStr(row, ["serviceName", "service_name", "service", "tenDichVu", "serviceTitle"]);
  const status = pickStr(row, ["status", "state", "trangThai", "appointmentStatus"]);
  const patientPhoneSimly = pickPatientPhone(row) || null;
  return {
    externalId,
    startAt: startAt || null,
    endAt: endAt || null,
    status: status || null,
    patientName: patientName || null,
    patientPhoneSimly,
    serviceName: serviceName || null,
    rawJson: JSON.stringify(row)
  };
}

function normalizeDigitsPhone(s) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeNameKey(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildFacebookConversationIndex() {
  return loadChatHistory().then((data) => {
    const list = (data.conversations || []).filter(
      (c) => String(c.channel || "").toLowerCase().includes("facebook") || String(c.channel || "").includes("messenger")
    );
    return list.map((c) => {
      const ci = c.customerIntake && typeof c.customerIntake === "object" ? c.customerIntake : {};
      const norm = normalizeCustomerIntake(ci);
      const fbName =
        String(c.participantLabel || "").trim() ||
        String(c.participantProfile?.name || "").trim() ||
        String(c.participantProfile?.displayName || "").trim() ||
        "";
      return {
        conversationId: c.id,
        participantId: c.participantId,
        participantLabel: c.participantLabel || null,
        facebookDisplayName: fbName || null,
        customerIntake: {
          schemaVersion: norm.schemaVersion,
          patient: norm.patient,
          notes: norm.notes || null,
          appointments: norm.appointments,
          updatedAt: norm.updatedAt
        }
      };
    });
  });
}

function scoreMatch({ patientName, patientPhoneSimly }, conv) {
  const nameSim = normalizeNameKey(patientName);
  const phoneSim = normalizeDigitsPhone(patientPhoneSimly);
  const nameFb = normalizeNameKey(conv.customerIntake?.patient?.fullName || "");
  const phoneFb = normalizeDigitsPhone(conv.customerIntake?.patient?.phone || "");
  let score = 0;
  const reasons = [];
  if (phoneSim.length >= 8 && phoneFb.length >= 8 && phoneSim === phoneFb) {
    score += 100;
    reasons.push("SĐT trùng");
  } else if (phoneSim.length >= 8 && phoneFb.length >= 8 && (phoneSim.endsWith(phoneFb.slice(-9)) || phoneFb.endsWith(phoneSim.slice(-9)))) {
    score += 70;
    reasons.push("SĐT gần khớp (đuôi)");
  }
  if (nameSim && nameFb) {
    if (nameSim === nameFb) {
      score += 80;
      reasons.push("Họ tên trùng");
    } else if (nameSim.includes(nameFb) || nameFb.includes(nameSim)) {
      score += 45;
      reasons.push("Họ tên tương tự");
    }
  }
  if (!score && patientName && conv.facebookDisplayName) {
    const fbn = normalizeNameKey(conv.facebookDisplayName);
    if (fbn && (nameSim.includes(fbn) || fbn.includes(nameSim))) {
      score += 25;
      reasons.push("Tên Facebook gần giống tên BN Simly");
    }
  }
  return { score, reasons: reasons.join(", ") || "match yếu" };
}

function matchConversationsForAppointment(apt, indexList) {
  const out = [];
  for (const conv of indexList) {
    const { score, reasons } = scoreMatch(apt, conv);
    if (score <= 0) continue;
    out.push({
      conversationId: conv.conversationId,
      participantId: conv.participantId,
      participantLabel: conv.participantLabel,
      facebookDisplayName: conv.facebookDisplayName,
      customerIntake: conv.customerIntake,
      score,
      matchNote: reasons
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 5);
}

/**
 * Lấy tất cả trang Simly cho một office + khoảng ngày (fromDate–toDate).
 */
async function fetchAllPagesForOfficeRange(officeKey, fromDate, toDate, pageSize = 200) {
  const merged = [];
  let page = 1;
  const maxPages = 60;
  for (;;) {
    const payload = await fetchSimlyAppointmentsJson({
      officeKey,
      fromDate,
      toDate,
      page,
      pageSize
    });
    const chunk = extractAppointmentRows(payload);
    merged.push(...chunk);
    if (chunk.length < pageSize) break;
    page += 1;
    if (page > maxPages) break;
  }
  return merged;
}

async function syncClinicAppointmentsForRange(fromDateYmd, toDateYmd, offices = DEFAULT_OFFICES) {
  await ensureInit();
  const fromDate = yyyyMmDd(fromDateYmd) || defaultRangeFromToday().fromDate;
  const toDate = yyyyMmDd(toDateYmd) || defaultRangeFromToday().toDate;
  if (fromDate > toDate) {
    throw new Error("fromDate must be <= toDate");
  }
  const batchId = new Date().toISOString();
  const list = Array.isArray(offices) && offices.length ? offices.map((o) => String(o).trim().toUpperCase()) : DEFAULT_OFFICES;

  const meta = {
    lastSyncAt: batchId,
    fromDate,
    toDate,
    clinicHours: CLINIC_RECEPTION_HOURS,
    offices: {}
  };

  for (const officeKey of list) {
    try {
      const rawRows = await fetchAllPagesForOfficeRange(officeKey, fromDate, toDate, 200);
      await sqlRun("BEGIN");
      try {
        await sqlRun(
          `DELETE FROM clinic_simly_appointment WHERE office_key = ? AND appt_date >= ? AND appt_date <= ?`,
          [officeKey, fromDate, toDate]
        );
        let i = 0;
        for (const row of rawRows) {
          if (!row || typeof row !== "object") continue;
          let apptDate = pickApptDateYmd(row);
          if (!apptDate || apptDate < fromDate || apptDate > toDate) {
            apptDate = fromDate;
          }
          const n = normalizeAppointmentRow(officeKey, apptDate, row, i);
          i += 1;
          await sqlRun(
            `INSERT OR REPLACE INTO clinic_simly_appointment (
              external_id, office_key, appt_date, start_at, end_at, status, patient_name, service_name, raw_json, synced_at, sync_batch_id
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [
              n.externalId,
              officeKey,
              apptDate,
              n.startAt,
              n.endAt,
              n.status,
              n.patientName,
              n.serviceName,
              n.rawJson,
              batchId,
              batchId
            ]
          );
        }
        await sqlRun("COMMIT");
      } catch (e) {
        await sqlRun("ROLLBACK").catch(() => {});
        throw e;
      }
      meta.offices[officeKey] = { ok: true, count: rawRows.length };
    } catch (e) {
      meta.offices[officeKey] = { ok: false, error: e?.message || String(e) };
    }
  }

  await kvSetJson(SYNC_META_KEY, meta);
  return meta;
}

/** Giữ tương thích: đồng bộ đúng một ngày. */
async function syncClinicAppointmentsForDate(dateYmd, offices) {
  const d = yyyyMmDd(dateYmd) || todayYyyyMmDd();
  return syncClinicAppointmentsForRange(d, d, offices);
}

async function listClinicAppointmentsRangeRaw({ fromDate, toDate, officeKey = "" }) {
  await ensureInit();
  const from = yyyyMmDd(fromDate) || defaultRangeFromToday().fromDate;
  const to = yyyyMmDd(toDate) || defaultRangeFromToday().toDate;
  const lim = 4000;
  const off = String(officeKey || "").trim().toUpperCase();
  let rows;
  if (off) {
    rows = await sqlAll(
      `SELECT id, external_id, office_key, appt_date, start_at, end_at, status, patient_name, service_name, raw_json, synced_at, sync_batch_id
       FROM clinic_simly_appointment
       WHERE appt_date >= ? AND appt_date <= ? AND office_key = ?
       ORDER BY appt_date, office_key, start_at, id
       LIMIT ?`,
      [from, to, off, lim]
    );
  } else {
    rows = await sqlAll(
      `SELECT id, external_id, office_key, appt_date, start_at, end_at, status, patient_name, service_name, raw_json, synced_at, sync_batch_id
       FROM clinic_simly_appointment
       WHERE appt_date >= ? AND appt_date <= ?
       ORDER BY appt_date, office_key, start_at, id
       LIMIT ?`,
      [from, to, lim]
    );
  }
  return { rows, fromDate: from, toDate: to, officeKey: off || null };
}

function enrichRowsWithPatientPhone(rows) {
  return rows.map((r) => {
    let patientPhoneSimly = null;
    try {
      const raw = r.raw_json ? JSON.parse(r.raw_json) : null;
      if (raw && typeof raw === "object") patientPhoneSimly = pickPatientPhone(raw) || null;
    } catch (_) {}
    return { ...r, patient_phone_simly: patientPhoneSimly };
  });
}

async function listClinicAppointmentsForRangeGrouped({ fromDate, toDate, officeKey = "", enrichMatches = true }) {
  const { rows, fromDate: from, toDate: to, officeKey: off } = await listClinicAppointmentsRangeRaw({
    fromDate,
    toDate,
    officeKey
  });
  let convIndex = [];
  if (enrichMatches) {
    convIndex = await buildFacebookConversationIndex();
  }
  const withPhone = enrichRowsWithPatientPhone(rows);
  const enriched = withPhone.map((r) => {
    const apt = {
      patientName: r.patient_name,
      patientPhoneSimly: r.patient_phone_simly
    };
    const matches = enrichMatches ? matchConversationsForAppointment(apt, convIndex) : [];
    return { ...r, matches };
  });

  const dayList = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) {
    const items = enriched.filter((x) => x.appt_date === d);
    dayList.push({ date: d, appointments: items });
  }

  return {
    fromDate: from,
    toDate: to,
    officeKey: off,
    days: dayList,
    flat: enriched
  };
}

async function listClinicAppointments({ date, officeKey = "", limit = 500 }) {
  const d = yyyyMmDd(date);
  if (!d) return { rows: [], error: "Invalid date (use yyyy-mm-dd)." };
  const out = await listClinicAppointmentsRangeRaw({ fromDate: d, toDate: d, officeKey });
  const lim = Math.min(2000, Math.max(1, Number(limit) || 500));
  return { rows: out.rows.slice(0, lim), date: d, officeKey: out.officeKey };
}

async function getClinicAppointmentSyncMeta() {
  const meta = await kvGetJson(SYNC_META_KEY, null);
  return {
    clinicHours: CLINIC_RECEPTION_HOURS,
    defaultRangeDays: DEFAULT_RANGE_DAYS,
    lastSync: meta && typeof meta === "object" ? meta : null
  };
}

/**
 * Markdown cho prompt: lịch đã có trong cache SQLite (Simly), theo office 7 ngày mặc định.
 * Không phải danh sách slot trống — chỉ giúp bot tránh đề xuất trùng giờ đã bận.
 */
async function buildOccupiedSlotsMarkdownForOffice(officeKey) {
  const off = String(officeKey || "").trim().toUpperCase();
  if (!off || (off !== "25VNP" && off !== "355LTT")) return "";
  const { fromDate, toDate } = defaultRangeFromToday();
  const { rows } = await listClinicAppointmentsRangeRaw({ fromDate, toDate, officeKey: off });
  const header =
    `\n\n[LICH_SIMLY_7_NGAY — office_key=\`${off}\` — các khung đã có lịch trong cache DB (Refresh/sync cập nhật)]\n` +
    `Khoảng: **${fromDate}** → **${toDate}**. **Giờ nhận khách:** ${CLINIC_RECEPTION_HOURS.label}.\n`;
  const today = todayYyyyMmDd();
  const howToUse =
    `\n[CACH_DUNG_GOI_Y_GIO_TRONG — office_key=\`${off}\`]\n` +
    `- **[THAM_CHIEU_NGAY]** (đồng hồ server, thường TZ Việt Nam): **${today}** — dùng để hiểu "hôm nay", "chiều nay", "mai" = cộng trừ ngày rồi chuẩn hóa **yyyy-mm-dd**.\n` +
    `- Dữ liệu Simly trong block = **lịch đã đặt** (bận), **không** phải danh sách slot trống đầy đủ.\n` +
    `- **Giờ làm việc cơ sở:** ${CLINIC_RECEPTION_HOURS.label} — chỉ gợi ý giờ hẹn trong khung này.\n` +
    `- **KH chỉ cho ngày:** lọc đúng dòng **yyyy-mm-dd** trong list (nếu có); từ các khung **bận** của ngày đó, **tự suy** vài khung **còn trống hợp lý** (ví dụ cách mốc bận ≥45–60 phút, tránh sát giờ đóng cửa nếu tư vấn dài). Trả lời **luôn** với gợi ý cụ thể trong 8–19h, **không** chỉ nói "để con kiểm tra" rồi không đưa khung giờ khi đã có đủ ngày + dữ liệu cache.\n` +
    `- **KH cho đủ ngày + giờ:** quy đổi sang **yyyy-mm-dd** + mốc giờ; nếu **trùng hoặc chồng lấn** với khung bận → xin lỗi, **giờ đó đã có lịch / đã có khách đặt tư vấn**, rồi gợi ý **2–3 khung còn trống** trong **cùng ngày**.\n` +
    `- Ngày KH chọn **ngoài** **${fromDate}** → **${toDate}** → **không** bịa Simly; nói cần đồng bộ / hotline theo prompt.\n` +
    `- **Cache không có dòng nào** hoặc thiếu **end**: vẫn gợi ý khung trong 8–19h nhưng nói rõ **chưa thấy lịch bận trong cache** (có thể rỗng hoặc sync trễ); coi **start** là mốc cần tránh nếu có; không khẳng định tuyệt đối nếu dữ liệu mơ hồ.`;

  if (!rows.length) {
    return (
      header +
      `- *(Không có bản ghi lịch trong khoảng này trong cache — có thể rỗng hoặc chưa đồng bộ.)*\n` +
      howToUse
    );
  }
  const byDay = new Map();
  for (const r of rows) {
    const d = String(r.appt_date || "").trim();
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }
  const lines = [];
  for (const d of [...byDay.keys()].sort()) {
    const list = byDay.get(d) || [];
    const bits = list.map((x) => {
      const st = x.start_at != null && String(x.start_at).trim() ? String(x.start_at).trim() : "?";
      const en = x.end_at != null && String(x.end_at).trim() ? String(x.end_at).trim() : "?";
      const svc = x.service_name != null && String(x.service_name).trim() ? String(x.service_name).trim() : "";
      return `${st}–${en}${svc ? ` (${svc})` : ""}`;
    });
    lines.push(`- **${d}:** ${bits.join("; ")}`);
  }

  return header + `${lines.join("\n")}\n` + howToUse;
}

module.exports = {
  CLINIC_RECEPTION_HOURS,
  DEFAULT_RANGE_DAYS,
  SYNC_META_KEY,
  defaultRangeFromToday,
  addDaysYmd,
  syncClinicAppointmentsForRange,
  syncClinicAppointmentsForDate,
  listClinicAppointmentsForRangeGrouped,
  listClinicAppointments,
  getClinicAppointmentSyncMeta,
  buildOccupiedSlotsMarkdownForOffice,
  extractAppointmentRows,
  normalizeAppointmentRow
};
