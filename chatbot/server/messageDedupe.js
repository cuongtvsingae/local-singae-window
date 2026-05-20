const { kvSetRawIfAbsent } = require("./sqliteStore");

/**
 * Đánh dấu tin nhắn provider (Facebook mid, v.v.) là lần xử lý đầu tiên.
 * @returns {Promise<boolean>} true nếu chưa xử lý (nên tiếp tục), false nếu trùng (bỏ qua).
 */
async function claimProviderMessageId(provider, messageId) {
  const mid = String(messageId || "").trim();
  if (!mid) return true;
  const key = `dedupe-msg:${String(provider || "unknown").toLowerCase()}:${mid}`;
  const payload = JSON.stringify({ at: new Date().toISOString() });
  return kvSetRawIfAbsent(key, payload);
}

module.exports = {
  claimProviderMessageId
};
