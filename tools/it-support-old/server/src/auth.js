// Shared auth with tool.id.vn desktop shell:
// - Uses WindowShell session cookie `ws_session`
// - User/role comes from WindowShell auth DB (tools/windowsshell)
const { getUserBySessionToken } = require('../../../windowsshell/server/authStore');

const AUTH_COOKIE_NAME = 'ws_session';

function parseCookies(req) {
  const raw = String(req.headers?.cookie || '');
  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return String(cookies[AUTH_COOKIE_NAME] || '').trim();
}

async function authRequired(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ status: 'error', message: 'Not authenticated' });
    const user = await getUserBySessionToken(token);
    if (!user) return res.status(401).json({ status: 'error', message: 'Session expired' });
    req.authUser = user;
    return next();
  } catch (e) {
    return res.status(500).json({ status: 'error', message: 'Auth check failed' });
  }
}

module.exports = { authRequired };

