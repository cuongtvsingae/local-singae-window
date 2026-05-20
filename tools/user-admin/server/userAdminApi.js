const express = require("express");
const { getUserBySessionToken, syncEmployeesFromMisa } = require("../../windowsshell/server/authStore");

const AUTH_COOKIE_NAME = "ws_session";

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSessionToken(req) {
  return String(parseCookies(req)[AUTH_COOKIE_NAME] || "").trim();
}

async function requireAdmin(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    const user = await getUserBySessionToken(token);
    if (!user) return res.status(401).json({ error: "Session expired" });
    if (String(user.role || "") !== "admin") return res.status(403).json({ error: "Admin only" });
    req.authUser = user;
    next();
  } catch (e) {
    res.status(500).json({ error: e?.message || "Auth failed" });
  }
}

const router = express.Router();

/** Đồng bộ nhân viên MISA → bảng users (role `user`) — chỉ admin */
router.post("/misa/sync-employees", requireAdmin, async (req, res) => {
  try {
    const result = await syncEmployeesFromMisa();
    return res.json({ ok: true, ...result });
  } catch (error) {
    const code = error?.code === "MISA_CONFIG" ? 400 : 502;
    return res.status(code).json({ error: error?.message || "MISA sync failed" });
  }
});

module.exports = router;
