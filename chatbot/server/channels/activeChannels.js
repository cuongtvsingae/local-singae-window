/**
 * Chatbot chỉ Facebook Messenger (channel id `facebook-messenger`).
 * Mở rộng sau: thêm id vào ACTIVE_CHANNEL_IDS và adapter tương ứng.
 */
const ACTIVE_CHANNEL_IDS = ["facebook-messenger"];

function isActiveChatbotChannel(channel) {
  const c = String(channel || "").trim().toLowerCase();
  if (!c) return false;
  if (c.includes("facebook") || c.includes("messenger")) return true;
  return ACTIVE_CHANNEL_IDS.some((id) => c === id || c.includes(id.replace(/-/g, "")));
}

module.exports = {
  ACTIVE_CHANNEL_IDS,
  isActiveChatbotChannel
};
