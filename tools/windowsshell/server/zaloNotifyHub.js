/**
 * Tổng đài Zalo cá nhân (cùng cấu hình zca-js / credentials với chatbot) — dùng chung cho toàn bộ hệ thống.
 * Chatbot nên require module này thay vì gọi thẳng `chatbot/server/zaloPersonalClient.js`.
 */
module.exports = require("../../../chatbot/server/zaloPersonalClient");
