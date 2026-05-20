/**
 * Ghép / tách Facebook Page ID và PSID (không phụ thuộc chatHistory hay SQLite).
 * Tách riêng để tránh lỗi load/module khi webhook chạy sớm.
 */

const FACEBOOK_MESSENGER_PARTICIPANT_SEP = ":";

function buildFacebookMessengerParticipantId(pageId, psid) {
  const p = String(pageId || "").trim();
  const s = String(psid || "").trim();
  if (!s) return "";
  if (!p) return s;
  return `${p}${FACEBOOK_MESSENGER_PARTICIPANT_SEP}${s}`;
}

/**
 * @returns {{ pageId: string, psid: string }} `pageId` rỗng nếu `participantId` là legacy (chỉ PSID).
 */
function parseFacebookMessengerParticipantId(participantId) {
  const raw = String(participantId || "").trim();
  if (!raw) return { pageId: "", psid: "" };
  const sep = FACEBOOK_MESSENGER_PARTICIPANT_SEP;
  const idx = raw.indexOf(sep);
  if (idx === -1) {
    return { pageId: "", psid: raw };
  }
  return {
    pageId: raw.slice(0, idx).trim(),
    psid: raw.slice(idx + sep.length).trim()
  };
}

module.exports = {
  FACEBOOK_MESSENGER_PARTICIPANT_SEP,
  buildFacebookMessengerParticipantId,
  parseFacebookMessengerParticipantId
};
