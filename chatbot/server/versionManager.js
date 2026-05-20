const fs = require("fs");
const path = require("path");
const { kvGetJson, kvSetJson, importAllLegacyOnce } = require("./sqliteStore");

const VERSION_KEY = "version";
const PACKAGE_FILE = path.join(__dirname, "..", "..", "..", "package.json");

async function ensureVersionInDb() {
  await importAllLegacyOnce();
  const existing = await kvGetJson(VERSION_KEY, null);
  if (existing && typeof existing === "object") return existing;

  let initialVersion = "1.0.0";
  if (fs.existsSync(PACKAGE_FILE)) {
    try {
      const packageData = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
      initialVersion = packageData.version || "1.0.0";
    } catch (error) {}
  }
  const versionData = {
    version: initialVersion,
    lastUpdated: new Date().toISOString(),
    startCount: 0
  };
  await kvSetJson(VERSION_KEY, versionData);
  return versionData;
}

function parseVersion(versionString) {
  const parts = versionString.split(".").map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

function formatVersion(versionObj) {
  return `${versionObj.major}.${versionObj.minor}.${versionObj.patch}`;
}

function incrementVersion(currentVersion) {
  const parsed = parseVersion(currentVersion);
  
  parsed.patch += 1;
  
  if (parsed.patch > 9) {
    parsed.patch = 0;
    parsed.minor += 1;
    
    if (parsed.minor > 9) {
      parsed.minor = 0;
      parsed.major += 1;
    }
  }
  
  return formatVersion(parsed);
}

async function loadVersion() {
  const data = await ensureVersionInDb();
  return {
    version: data?.version || "1.0.0",
    lastUpdated: data?.lastUpdated || null,
    startCount: data?.startCount || 0
  };
}

async function saveVersion(versionData) {
  await kvSetJson(VERSION_KEY, versionData);
}

async function getCurrentVersion() {
  const versionData = await loadVersion();
  return versionData.version;
}

async function incrementAndSaveVersion() {
  const currentData = await loadVersion();
  const newVersion = incrementVersion(currentData.version);
  
  const updatedData = {
    version: newVersion,
    lastUpdated: new Date().toISOString(),
    startCount: (currentData.startCount || 0) + 1
  };
  
  await saveVersion(updatedData);
  
  if (fs.existsSync(PACKAGE_FILE)) {
    try {
      const packageData = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
      packageData.version = newVersion;
      fs.writeFileSync(PACKAGE_FILE, JSON.stringify(packageData, null, 2), "utf8");
    } catch (error) {
    }
  }
  
  return updatedData;
}

module.exports = {
  getCurrentVersion,
  incrementAndSaveVersion,
  loadVersion,
  parseVersion,
  formatVersion,
  incrementVersion
};





