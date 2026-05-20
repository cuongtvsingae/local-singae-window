const crypto = require("crypto");
const { sqlRun, sqlGet, sqlAll, ensureInit } = require("./sqliteStore");
const { CARE_STATUS, normalizeConversationCareStatus, normalizeCustomerIntake } = require("./chatHistory");

const BOOKING_STATUS = {
  BOOKED: CARE_STATUS.BOOKED,
  TREATING: CARE_STATUS.TREATING,
  TREATMENT_DONE: CARE_STATUS.TREATMENT_DONE,
  CANCELLED: "cancelled"
};

function normalizeBookingStatus(value) {
  const allowed = new Set(Object.values(BOOKING_STATUS));
  const s = String(value || "").trim();
  return allowed.has(s) ? s : BOOKING_STATUS.BOOKED;
}

function normalizeOfficeKey(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  return s === "25VNP" || s === "355LTT" ? s : "";
}

function normalizeShuttle(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  return s === "yes" || s === "no" ? s : "";
}

function trimText(value, max = 255) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizeAppointmentPayload(appointment, patient = {}) {
  const ap = appointment && typeof appointment === "object" ? appointment : {};
  const startAt = trimText(ap.startAt, 64);
  const endAt = trimText(ap.endAt, 64);
  const visitDate = trimText(patient.preferredVisitDate || "", 32);
  const visitTime = trimText(patient.preferredVisitTime || "", 32);
  return {
    id: trimText(ap.id, 120),
    startAt,
    endAt,
    serviceName: trimText(ap.serviceName, 255),
    status: normalizeBookingStatus(ap.status),
    visitDate,
    visitTime
  };
}

async function buildAvailableBookingId(preferredId) {
  let candidate = String(preferredId || "").trim() || `booking-${crypto.randomBytes(6).toString("hex")}`;
  let row = await sqlGet(`SELECT id FROM booking_request WHERE id = ?`, [candidate]);
  while (row) {
    candidate = `booking-${crypto.randomBytes(6).toString("hex")}`;
    // eslint-disable-next-line no-await-in-loop
    row = await sqlGet(`SELECT id FROM booking_request WHERE id = ?`, [candidate]);
  }
  return candidate;
}

function hydrateBookingRow(row) {
  if (!row) return null;
  let patientSnapshot = {};
  let appointmentPayload = {};
  try {
    patientSnapshot = row.patient_snapshot_json ? JSON.parse(row.patient_snapshot_json) : {};
  } catch (_) {
    patientSnapshot = {};
  }
  try {
    appointmentPayload = row.appointment_payload_json ? JSON.parse(row.appointment_payload_json) : {};
  } catch (_) {
    appointmentPayload = {};
  }
  return {
    id: String(row.id || "").trim(),
    conversationId: String(row.conversation_id || "").trim(),
    channel: String(row.channel || "").trim(),
    participantId: row.participant_id != null ? String(row.participant_id).trim() || null : null,
    participantLabel: row.participant_label != null ? String(row.participant_label).trim() || null : null,
    careStatusAtCreate: normalizeConversationCareStatus(row.care_status_at_create),
    status: normalizeBookingStatus(row.status),
    officeKey: normalizeOfficeKey(row.office_key),
    visitDate: trimText(row.visit_date, 32),
    visitTime: trimText(row.visit_time, 32),
    shuttlePickup: normalizeShuttle(row.shuttle_pickup),
    notesSnapshot: row.notes_snapshot != null ? String(row.notes_snapshot) : "",
    patientSnapshot,
    appointment: appointmentPayload,
    source: trimText(row.source, 80) || "chatbot",
    summaryMessageId: row.summary_message_id != null ? String(row.summary_message_id).trim() || null : null,
    confirmationMessageId: row.confirmation_message_id != null ? String(row.confirmation_message_id).trim() || null : null,
    createdAt: String(row.created_at || "").trim() || null,
    updatedAt: String(row.updated_at || "").trim() || null,
    confirmedAt: row.confirmed_at != null ? String(row.confirmed_at).trim() || null : null,
    zaloNotifiedAt: row.zalo_notified_at != null ? String(row.zalo_notified_at).trim() || null : null,
    errorMessage: row.error_message != null ? String(row.error_message) : ""
  };
}

async function createBookingRequest({
  conversation,
  patient,
  notes,
  appointment,
  confirmation = {},
  source = "chatbot"
}) {
  await ensureInit();
  const conv = conversation && typeof conversation === "object" ? conversation : {};
  const normalizedPatient = normalizeCustomerIntake({ patient, notes }).patient;
  const normalizedNotes = String(notes || "").trim();
  const bookingId = await buildAvailableBookingId(appointment?.id);
  const normalizedAppointment = normalizeAppointmentPayload(
    {
      ...(appointment && typeof appointment === "object" ? appointment : {}),
      id: bookingId
    },
    normalizedPatient
  );
  const now = new Date().toISOString();
  const record = {
    id: bookingId,
    conversationId: String(conv.id || "").trim(),
    channel: String(conv.channel || "").trim() || "unknown",
    participantId: String(conv.participantId || "").trim() || null,
    participantLabel: String(conv.participantLabel || "").trim() || null,
    careStatusAtCreate: normalizeConversationCareStatus(conv.careStatus),
    status: normalizeBookingStatus(appointment?.status || BOOKING_STATUS.BOOKED),
    officeKey: normalizeOfficeKey(normalizedPatient.preferredOfficeKey),
    visitDate: trimText(normalizedPatient.preferredVisitDate, 32),
    visitTime: trimText(normalizedPatient.preferredVisitTime, 32),
    shuttlePickup: normalizeShuttle(normalizedPatient.shuttlePickup),
    notesSnapshot: normalizedNotes,
    patientSnapshot: normalizedPatient,
    appointment: normalizedAppointment,
    source: trimText(source, 80) || "chatbot",
    summaryMessageId: confirmation?.summaryMessageId ? String(confirmation.summaryMessageId).trim() : null,
    confirmationMessageId: confirmation?.confirmationMessageId ? String(confirmation.confirmationMessageId).trim() : null,
    confirmedAt: now,
    createdAt: now,
    updatedAt: now,
    zaloNotifiedAt: null,
    errorMessage: ""
  };
  await sqlRun(
    `INSERT INTO booking_request(
      id, conversation_id, channel, participant_id, participant_label, care_status_at_create, status,
      office_key, visit_date, visit_time, shuttle_pickup, notes_snapshot, patient_snapshot_json,
      appointment_payload_json, source, summary_message_id, confirmation_message_id, created_at,
      updated_at, confirmed_at, zalo_notified_at, error_message
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      record.id,
      record.conversationId,
      record.channel,
      record.participantId,
      record.participantLabel,
      record.careStatusAtCreate,
      record.status,
      record.officeKey,
      record.visitDate,
      record.visitTime,
      record.shuttlePickup,
      record.notesSnapshot,
      JSON.stringify(record.patientSnapshot),
      JSON.stringify(record.appointment),
      record.source,
      record.summaryMessageId,
      record.confirmationMessageId,
      record.createdAt,
      record.updatedAt,
      record.confirmedAt,
      record.zaloNotifiedAt,
      record.errorMessage
    ]
  );
  return record;
}

async function getBookingRequestById(id) {
  await ensureInit();
  const row = await sqlGet(`SELECT * FROM booking_request WHERE id = ?`, [String(id || "").trim()]);
  return hydrateBookingRow(row);
}

async function listBookingRequests({ conversationId = "", status = "", limit = 100 } = {}) {
  await ensureInit();
  const lim = Math.max(1, Math.min(500, Number(limit) || 100));
  const cid = String(conversationId || "").trim();
  const st = String(status || "").trim();
  let rows = [];
  if (cid && st) {
    rows = await sqlAll(
      `SELECT * FROM booking_request WHERE conversation_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`,
      [cid, st, lim]
    );
  } else if (cid) {
    rows = await sqlAll(`SELECT * FROM booking_request WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`, [cid, lim]);
  } else if (st) {
    rows = await sqlAll(`SELECT * FROM booking_request WHERE status = ? ORDER BY created_at DESC LIMIT ?`, [st, lim]);
  } else {
    rows = await sqlAll(`SELECT * FROM booking_request ORDER BY created_at DESC LIMIT ?`, [lim]);
  }
  return rows.map(hydrateBookingRow).filter(Boolean);
}

async function listLatestBookingsByConversationIds(conversationIds = []) {
  await ensureInit();
  const ids = Array.from(new Set((conversationIds || []).map((x) => String(x || "").trim()).filter(Boolean)));
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await sqlAll(
    `SELECT * FROM booking_request WHERE conversation_id IN (${placeholders}) ORDER BY created_at DESC`,
    ids
  );
  const map = new Map();
  for (const row of rows) {
    const hydrated = hydrateBookingRow(row);
    if (!hydrated) continue;
    if (!map.has(hydrated.conversationId)) map.set(hydrated.conversationId, hydrated);
  }
  return map;
}

async function updateBookingRequestStatus(id, status, extras = {}) {
  await ensureInit();
  const existing = await getBookingRequestById(id);
  if (!existing) return null;
  const nextStatus = normalizeBookingStatus(status);
  const updatedAt = new Date().toISOString();
  const errorMessage =
    extras.errorMessage !== undefined ? String(extras.errorMessage || "") : String(existing.errorMessage || "");
  await sqlRun(
    `UPDATE booking_request
       SET status = ?, updated_at = ?, error_message = ?
     WHERE id = ?`,
    [nextStatus, updatedAt, errorMessage, existing.id]
  );
  return getBookingRequestById(existing.id);
}

async function markBookingRequestZaloNotified(id) {
  await ensureInit();
  const ts = new Date().toISOString();
  await sqlRun(`UPDATE booking_request SET zalo_notified_at = ?, updated_at = ? WHERE id = ?`, [ts, ts, String(id || "").trim()]);
  return getBookingRequestById(id);
}

async function buildBookingContextMarkdownForConversation(conversationId) {
  const rows = await listBookingRequests({ conversationId, limit: 3 });
  if (!rows.length) return "";
  const compact = rows.map((item) => ({
    id: item.id,
    status: item.status,
    officeKey: item.officeKey,
    visitDate: item.visitDate,
    visitTime: item.visitTime,
    shuttlePickup: item.shuttlePickup,
    createdAt: item.createdAt
  }));
  return `\n\n[BOOKING NOI BO CUA PHIEN CHAT]:\n${JSON.stringify(compact, null, 0)}`;
}

module.exports = {
  BOOKING_STATUS,
  normalizeBookingStatus,
  createBookingRequest,
  getBookingRequestById,
  listBookingRequests,
  listLatestBookingsByConversationIds,
  updateBookingRequestStatus,
  markBookingRequestZaloNotified,
  buildBookingContextMarkdownForConversation
};
