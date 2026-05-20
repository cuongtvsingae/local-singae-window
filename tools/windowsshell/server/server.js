const express = require("express");
const fs = require("fs");
const path = require("path");

const { getDesktopShellCache, setDesktopShellCache } = require("./windowsShellStorage");
const {
  ROLES,
  TOOL_CATALOG,
  initAuthSchema,
  seedDefaultUsers,
  authenticate,
  createSession,
  getUserBySessionToken,
  revokeSession,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getAllowedToolIdsForRole,
  listRoleToolAccess,
  setRoleToolAccess,
  getUserToolMeta,
  setToolMetaForUser
} = require("./authStore");

const router = express.Router();
const AUTH_COOKIE_NAME = "ws_session";

initAuthSchema()
  .then(() => seedDefaultUsers())
  .catch(() => {});

const DEV_AUTO_GUEST = process.env.WS_DEV_AUTO_GUEST !== "0" && process.env.NODE_ENV !== "production";
const GUEST_USER = {
  username: String(process.env.WS_GUEST_USERNAME || "guest").trim() || "guest",
  password: String(process.env.WS_GUEST_PASSWORD || "guest-123123aA@"),
  role: "member",
  fullName: "Guest"
};

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
  const cookies = parseCookies(req);
  return String(cookies[AUTH_COOKIE_NAME] || "").trim();
}

function setSessionCookie(res, token) {
  const isSecure = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
}

async function ensureDevGuestSession(req, res) {
  if (!DEV_AUTO_GUEST) return null;
  try {
    const guest = await createUser({
      username: GUEST_USER.username,
      password: GUEST_USER.password,
      role: GUEST_USER.role,
      fullName: GUEST_USER.fullName
    });
    const token = await createSession(guest, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || ""
    });
    setSessionCookie(res, token);
    const allowedToolIds = await getAllowedToolIdsForRole(guest.role);
    return { user: guest, allowedToolIds };
  } catch (_) {
    return null;
  }
}

async function authMiddleware(req, res, next) {
  try {
    const token = getSessionToken(req);
    if (!token) {
      const boot = await ensureDevGuestSession(req, res);
      if (!boot?.user) return res.status(401).json({ error: "Not authenticated" });
      req.authUser = boot.user;
      return next();
    }
    const user = await getUserBySessionToken(token);
    if (!user) {
      const boot = await ensureDevGuestSession(req, res);
      if (!boot?.user) return res.status(401).json({ error: "Session expired" });
      req.authUser = boot.user;
      return next();
    }
    req.authUser = user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Auth check failed" });
  }
}

function requireRoles(roles = []) {
  const allowed = Array.isArray(roles) ? roles : [];
  return (req, res, next) => {
    const currentRole = String(req.authUser?.role || "");
    if (!allowed.includes(currentRole)) {
      return res.status(403).json({ error: "Permission denied" });
    }
    return next();
  };
}

function roleRank(role) {
  return { user: 1, member: 2, leader: 3, manager: 4, admin: 5 }[String(role || "member")] || 0;
}

function canManageTarget(actorRole, targetRole) {
  return roleRank(actorRole) > roleRank(targetRole);
}

function canAssignRole(actorRole, nextRole) {
  const actor = String(actorRole || "");
  const target = String(nextRole || "member");
  if (actor === "admin") return true;
  if (actor === "manager") return roleRank(target) <= roleRank("leader");
  return false;
}

router.post("/auth/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const user = await authenticate(username, password);
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    const token = await createSession(user, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || ""
    });
    const allowedToolIds = await getAllowedToolIdsForRole(user.role);
    setSessionCookie(res, token);
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name || user.username,
        avatarUrl: user.avatar_url || "",
        allowedToolIds
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Login failed" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const token = getSessionToken(req);
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    return res.json({ message: "Logged out" });
  } catch (error) {
    return res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = getSessionToken(req);
    if (!token) {
      const boot = await ensureDevGuestSession(req, res);
      if (!boot?.user) return res.status(401).json({ error: "Not authenticated" });
      return res.json({ user: { ...boot.user, allowedToolIds: boot.allowedToolIds } });
    }
    const user = await getUserBySessionToken(token);
    if (!user) {
      // Stale or forged cookie: do not silently downgrade to dev guest (role member).
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }
    const allowedToolIds = await getAllowedToolIdsForRole(user.role);
    return res.json({ user: { ...user, allowedToolIds } });
  } catch (error) {
    return res.status(500).json({ error: "Cannot get current user" });
  }
});

// Per-tool user metadata (single shared user DB; each tool stores under its own key)
router.get("/auth/user-meta/:toolId", authMiddleware, async (req, res) => {
  try {
    const toolId = String(req.params.toolId || "").trim();
    if (!toolId) return res.status(400).json({ error: "toolId is required" });
    const meta = await getUserToolMeta(req.authUser?.id);
    return res.json({ toolId, value: meta?.[toolId] ?? null });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Cannot get tool meta" });
  }
});

router.put("/auth/user-meta/:toolId", authMiddleware, async (req, res) => {
  try {
    const toolId = String(req.params.toolId || "").trim();
    if (!toolId) return res.status(400).json({ error: "toolId is required" });
    const value = req.body?.value;
    const saved = await setToolMetaForUser(req.authUser?.id, toolId, value);
    return res.json({ toolId, value: saved });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Cannot save tool meta" });
  }
});

router.get("/auth/roles", authMiddleware, (req, res) => {
  return res.json({ roles: ROLES });
});

router.get("/auth/users", authMiddleware, requireRoles(["admin", "manager", "leader"]), async (req, res) => {
  try {
    return res.json({ users: await listUsers() });
  } catch (error) {
    return res.status(500).json({ error: "Cannot list users" });
  }
});

router.post("/auth/users", authMiddleware, requireRoles(["admin", "manager"]), async (req, res) => {
  try {
    const actorRole = String(req.authUser?.role || "");
    const nextRole = String(req.body?.role || "member").trim().toLowerCase();
    if (!canAssignRole(actorRole, nextRole)) {
      return res.status(403).json({ error: "Permission denied for target role" });
    }
    const created = await createUser(req.body || {});
    return res.json({ user: created });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Cannot create user" });
  }
});

router.put("/auth/users/:id", authMiddleware, requireRoles(["admin", "manager"]), async (req, res) => {
  try {
    const targetId = String(req.params.id || "").trim();
    const actorRole = String(req.authUser?.role || "");
    const allUsers = await listUsers();
    const target = allUsers.find((u) => u.id === targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageTarget(actorRole, target.role) && target.id !== req.authUser.id) {
      return res.status(403).json({ error: "Permission denied" });
    }
    if (req.body?.role) {
      const nextRole = String(req.body.role || "").trim().toLowerCase();
      if (!canAssignRole(actorRole, nextRole)) {
        return res.status(403).json({ error: "Permission denied for target role" });
      }
    }
    const updated = await updateUser(targetId, req.body || {});
    return res.json({ user: updated });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Cannot update user" });
  }
});

router.delete("/auth/users/:id", authMiddleware, requireRoles(["admin", "manager"]), async (req, res) => {
  try {
    const targetId = String(req.params.id || "").trim();
    const actorRole = String(req.authUser?.role || "");
    if (targetId && targetId === String(req.authUser?.id || "").trim()) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }
    const allUsers = await listUsers();
    const target = allUsers.find((u) => u.id === targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!canManageTarget(actorRole, target.role)) {
      return res.status(403).json({ error: "Permission denied" });
    }
    await deleteUser(targetId);
    return res.json({ message: "User deactivated (soft delete)" });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Cannot delete user" });
  }
});

router.get("/auth/tool-access", authMiddleware, requireRoles(["admin", "manager", "leader"]), async (req, res) => {
  try {
    const permissions = await listRoleToolAccess();
    return res.json({ roles: ROLES, tools: TOOL_CATALOG, permissions });
  } catch (error) {
    return res.status(500).json({ error: "Cannot load tool access map" });
  }
});

router.put("/auth/tool-access/:role", authMiddleware, requireRoles(["admin"]), async (req, res) => {
  try {
    const role = String(req.params.role || "").trim().toLowerCase();
    const toolIds = Array.isArray(req.body?.toolIds) ? req.body.toolIds : [];
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    await setRoleToolAccess(role, toolIds);
    const permissions = await listRoleToolAccess();
    return res.json({ message: "Tool access updated", permissions });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Cannot update tool access" });
  }
});

router.use(authMiddleware);

// Desktop shell cache
router.get("/desktop-shell/cache", async (req, res) => {
  try {
    return res.json({ cache: await getDesktopShellCache(req.authUser?.username), user: req.authUser });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot load desktop shell cache." });
  }
});

router.put("/desktop-shell/cache", async (req, res) => {
  try {
    const cache = req.body?.cache;
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
      return res.status(400).json({ error: "cache must be an object." });
    }
    await setDesktopShellCache(cache, req.authUser?.username);
    return res.json({ message: "Desktop shell cache saved." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Cannot save desktop shell cache." });
  }
});

// Minimal file-system routes for WindowShell "drives" under tools/windowsshell/database/SSD
const DATABASE_ROOT = path.join(__dirname, "..", "database");
const SSD_ROOT = path.join(DATABASE_ROOT, "SSD");

function safeShellPath(drive = "C", relativePath = "") {
  const driveRoot = path.join(SSD_ROOT, drive.toUpperCase());
  const target = path.resolve(driveRoot, "." + path.sep + String(relativePath || ""));
  if (!target.startsWith(path.resolve(driveRoot))) throw new Error("Invalid path");
  return target;
}

router.get("/fs/list", (req, res) => {
  try {
    const drive = String(req.query?.drive || "C").toUpperCase();
    const rel = String(req.query?.path || "");
    const abs = safeShellPath(drive, rel);
    fs.mkdirSync(abs, { recursive: true });
    const items = fs.readdirSync(abs, { withFileTypes: true }).map((it) => {
      const stat = fs.statSync(path.join(abs, it.name));
      return {
        name: it.name,
        type: it.isDirectory() ? "folder" : "file",
        size: it.isDirectory() ? null : stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    });
    return res.json({ items });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Cannot list" });
  }
});

try {
  require("./leaveMisaAndAccrual").start();
} catch (e) {
  console.warn("⚠️  leaveMisaAndAccrual not started:", e && e.message ? e.message : e);
}

module.exports = router;

