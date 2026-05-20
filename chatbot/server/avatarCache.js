const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const { CHATBOT_DB_DIR } = require("./dbPaths");

const AVATAR_CACHE_DIR = path.join(CHATBOT_DB_DIR, "avatar-cache");
fs.mkdirSync(AVATAR_CACHE_DIR, { recursive: true });

const sourceToCache = new Map();

function sanitizeExt(value) {
  const ext = String(value || "").trim().toLowerCase();
  if (!ext) return ".jpg";
  if (ext.startsWith(".")) return ext;
  return `.${ext}`;
}

function extFromContentType(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/png")) return ".png";
  if (type.includes("image/webp")) return ".webp";
  if (type.includes("image/gif")) return ".gif";
  if (type.includes("image/jpeg")) return ".jpg";
  if (type.includes("image/bmp")) return ".bmp";
  return ".jpg";
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname || "";
    return sanitizeExt(path.extname(pathname));
  } catch (_) {
    return ".jpg";
  }
}

async function cacheAvatarFromUrl(sourceUrl) {
  const normalized = String(sourceUrl || "").trim();
  if (!/^https?:\/\//i.test(normalized)) return null;
  const existed = sourceToCache.get(normalized);
  if (existed && fs.existsSync(path.join(AVATAR_CACHE_DIR, existed.fileName))) {
    return existed;
  }

  const response = await axios.get(normalized, {
    responseType: "arraybuffer",
    timeout: 12000,
    validateStatus: (status) => status >= 200 && status < 300
  });
  const contentType = String(response?.headers?.["content-type"] || "");
  const ext = extFromContentType(contentType) || extFromUrl(normalized);
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 20);
  const fileName = `avt-${hash}${ext}`;
  const filePath = path.join(AVATAR_CACHE_DIR, fileName);
  fs.writeFileSync(filePath, Buffer.from(response.data));

  const payload = {
    sourceUrl: normalized,
    fileName,
    cachedUrl: `/api/chatbot/avatar-cache/${encodeURIComponent(fileName)}`
  };
  sourceToCache.set(normalized, payload);
  return payload;
}

function resolveAvatarCacheFile(fileName) {
  const normalized = String(fileName || "").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) return null;
  const fullPath = path.resolve(path.join(AVATAR_CACHE_DIR, normalized));
  const root = path.resolve(AVATAR_CACHE_DIR) + path.sep;
  if (!fullPath.startsWith(root)) return null;
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
  return fullPath;
}

module.exports = {
  cacheAvatarFromUrl,
  resolveAvatarCacheFile
};

