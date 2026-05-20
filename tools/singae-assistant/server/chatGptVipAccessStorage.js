const fs = require("fs");
const path = require("path");

const CHAT_GPT_VIP_ACCESS_PRIVATE_ROOT = path.join(__dirname, "..", "database");
const CHAT_GPT_VIP_ACCESS_DATA_ROOT = CHAT_GPT_VIP_ACCESS_PRIVATE_ROOT;
const CHAT_GPT_VIP_ACCESS_CACHE_ROOT = path.join(CHAT_GPT_VIP_ACCESS_PRIVATE_ROOT, "cache");
const SSD_ROOT = path.join(__dirname, "..", "..", "windowsshell", "database", "SSD");
const DRIVE_NAMES = ["C", "D", "E"];

function ensureChatGptVipAccessDriveTree() {
  fs.mkdirSync(CHAT_GPT_VIP_ACCESS_DATA_ROOT, { recursive: true });
  fs.mkdirSync(CHAT_GPT_VIP_ACCESS_CACHE_ROOT, { recursive: true });
  fs.mkdirSync(SSD_ROOT, { recursive: true });
  DRIVE_NAMES.forEach((name) => {
    fs.mkdirSync(path.join(SSD_ROOT, name), { recursive: true });
  });
}

function getDriveRoot(driveName = "C") {
  const normalized = String(driveName || "C").trim().toUpperCase();
  const target = DRIVE_NAMES.includes(normalized) ? normalized : "C";
  return path.join(SSD_ROOT, target);
}

function getChatGptVipAccessHistoryFile() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "chat-gpt-vip-access-history.json");
}

function getChatGptVipAccessKnowledgeBaseFile() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "chat-gpt-vip-access-knowledge-base.json");
}

function getChatGptVipAccessUploadsDir() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "uploads");
}

function getChatGptVipAccessPromptNormalFile() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "chat-gpt-vip-access-prompt-normal.json");
}

function getChatGptVipAccessPromptDatabaseFile() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "chat-gpt-vip-access-prompt-database.json");
}

function getChatGptVipAccessPlainTextInstructionFile() {
  return path.join(CHAT_GPT_VIP_ACCESS_DATA_ROOT, "chat-gpt-vip-access-plain-text-instruction.json");
}

function migrateLegacyChatGptVipAccessFiles() {
  ensureChatGptVipAccessDriveTree();
  const legacyPrivateChatGptVipAccessRoot = path.join(__dirname, "..", "..", "chatGptVipAccess");
  const legacyPrivateChatGptVipAccessDataRoot = path.join(legacyPrivateChatGptVipAccessRoot, "data");
  const legacyPrivateChatGptVipAccessCacheRoot = path.join(legacyPrivateChatGptVipAccessRoot, "cache");
  const legacyProjectSsdRoot = path.join(__dirname, "..", "..", "..", "SSD");
  DRIVE_NAMES.forEach((drive) => {
    const oldDriveDir = path.join(legacyProjectSsdRoot, drive);
    const newDriveDir = getDriveRoot(drive);
    if (fs.existsSync(oldDriveDir)) {
      fs.mkdirSync(newDriveDir, { recursive: true });
      const entries = fs.readdirSync(oldDriveDir);
      entries.forEach((name) => {
        const src = path.join(oldDriveDir, name);
        const dst = path.join(newDriveDir, name);
        const stat = fs.statSync(src);
        if (stat.isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      });
    }
  });
  const oldDriveRoot = path.join(__dirname, "..", "..", "chatbot", "data", "chat-gpt-vip-access-drive");
  DRIVE_NAMES.forEach((drive) => {
    const oldDriveDir = path.join(oldDriveRoot, drive);
    const newDriveDir = getDriveRoot(drive);
    if (fs.existsSync(oldDriveDir)) {
      fs.mkdirSync(newDriveDir, { recursive: true });
      const entries = fs.readdirSync(oldDriveDir);
      entries.forEach((name) => {
        const src = path.join(oldDriveDir, name);
        const dst = path.join(newDriveDir, name);
        const stat = fs.statSync(src);
        if (stat.isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      });
    }
  });
  const legacyPrivateSsdRoot = path.join(__dirname, "..", "chatGptVipAccess", "SSD");
  DRIVE_NAMES.forEach((drive) => {
    const oldDriveDir = path.join(legacyPrivateSsdRoot, drive);
    const newDriveDir = getDriveRoot(drive);
    if (fs.existsSync(oldDriveDir)) {
      fs.mkdirSync(newDriveDir, { recursive: true });
      const entries = fs.readdirSync(oldDriveDir);
      entries.forEach((name) => {
        const src = path.join(oldDriveDir, name);
        const dst = path.join(newDriveDir, name);
        const stat = fs.statSync(src);
        if (stat.isFile() && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      });
    }
  });
  const legacyHistory = path.join(__dirname, "..", "..", "chatbot", "data", "chat-gpt-vip-access-history.json");
  const nextHistory = getChatGptVipAccessHistoryFile();
  if (fs.existsSync(legacyHistory) && !fs.existsSync(nextHistory)) {
    fs.copyFileSync(legacyHistory, nextHistory);
  }
  const legacyHistoryInPrivateSsd = path.join(__dirname, "..", "chatGptVipAccess", "SSD", "C", "chat-gpt-vip-access-history.json");
  if (fs.existsSync(legacyHistoryInPrivateSsd) && !fs.existsSync(nextHistory)) {
    fs.copyFileSync(legacyHistoryInPrivateSsd, nextHistory);
  }
  const legacyHistoryInPrivateChatGptVipAccess = path.join(legacyPrivateChatGptVipAccessDataRoot, "chat-gpt-vip-access-history.json");
  if (fs.existsSync(legacyHistoryInPrivateChatGptVipAccess) && !fs.existsSync(nextHistory)) {
    fs.copyFileSync(legacyHistoryInPrivateChatGptVipAccess, nextHistory);
  }
  const legacyKnowledgeInPrivateChatGptVipAccess = path.join(legacyPrivateChatGptVipAccessDataRoot, "chat-gpt-vip-access-knowledge-base.json");
  const nextKnowledge = getChatGptVipAccessKnowledgeBaseFile();
  if (fs.existsSync(legacyKnowledgeInPrivateChatGptVipAccess) && !fs.existsSync(nextKnowledge)) {
    fs.copyFileSync(legacyKnowledgeInPrivateChatGptVipAccess, nextKnowledge);
  }
  const legacyPromptNormalInPrivateChatGptVipAccess = path.join(legacyPrivateChatGptVipAccessDataRoot, "chat-gpt-vip-access-prompt-normal.json");
  const nextPromptNormal = getChatGptVipAccessPromptNormalFile();
  if (fs.existsSync(legacyPromptNormalInPrivateChatGptVipAccess) && !fs.existsSync(nextPromptNormal)) {
    fs.copyFileSync(legacyPromptNormalInPrivateChatGptVipAccess, nextPromptNormal);
  }
  const legacyPromptDatabaseInPrivateChatGptVipAccess = path.join(legacyPrivateChatGptVipAccessDataRoot, "chat-gpt-vip-access-prompt-database.json");
  const nextPromptDatabase = getChatGptVipAccessPromptDatabaseFile();
  if (fs.existsSync(legacyPromptDatabaseInPrivateChatGptVipAccess) && !fs.existsSync(nextPromptDatabase)) {
    fs.copyFileSync(legacyPromptDatabaseInPrivateChatGptVipAccess, nextPromptDatabase);
  }
  const legacyPlainTextInstructionInPrivateChatGptVipAccess = path.join(
    legacyPrivateChatGptVipAccessDataRoot,
    "chat-gpt-vip-access-plain-text-instruction.json"
  );
  const nextPlainTextInstruction = getChatGptVipAccessPlainTextInstructionFile();
  if (fs.existsSync(legacyPlainTextInstructionInPrivateChatGptVipAccess) && !fs.existsSync(nextPlainTextInstruction)) {
    fs.copyFileSync(legacyPlainTextInstructionInPrivateChatGptVipAccess, nextPlainTextInstruction);
  }

  const legacyUploadsDir = path.join(__dirname, "..", "..", "chatbot", "data", "uploads");
  const nextUploadsDir = getChatGptVipAccessUploadsDir();
  fs.mkdirSync(nextUploadsDir, { recursive: true });
  if (fs.existsSync(legacyUploadsDir)) {
    const names = fs.readdirSync(legacyUploadsDir);
    names.forEach((name) => {
      const src = path.join(legacyUploadsDir, name);
      const dst = path.join(nextUploadsDir, name);
      if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    });
  }
  const legacyUploadsInPrivateSsd = path.join(__dirname, "..", "chatGptVipAccess", "SSD", "C", "uploads");
  if (fs.existsSync(legacyUploadsInPrivateSsd)) {
    const names = fs.readdirSync(legacyUploadsInPrivateSsd);
    names.forEach((name) => {
      const src = path.join(legacyUploadsInPrivateSsd, name);
      const dst = path.join(nextUploadsDir, name);
      if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    });
  }
  const legacyUploadsInPrivateChatGptVipAccess = path.join(legacyPrivateChatGptVipAccessDataRoot, "uploads");
  if (fs.existsSync(legacyUploadsInPrivateChatGptVipAccess)) {
    const names = fs.readdirSync(legacyUploadsInPrivateChatGptVipAccess);
    names.forEach((name) => {
      const src = path.join(legacyUploadsInPrivateChatGptVipAccess, name);
      const dst = path.join(nextUploadsDir, name);
      if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    });
  }
  if (fs.existsSync(legacyPrivateChatGptVipAccessCacheRoot)) {
    const names = fs.readdirSync(legacyPrivateChatGptVipAccessCacheRoot);
    names.forEach((name) => {
      const src = path.join(legacyPrivateChatGptVipAccessCacheRoot, name);
      const dst = path.join(CHAT_GPT_VIP_ACCESS_CACHE_ROOT, name);
      if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    });
  }
}

module.exports = {
  SSD_ROOT,
  CHAT_GPT_VIP_ACCESS_PRIVATE_ROOT,
  CHAT_GPT_VIP_ACCESS_DATA_ROOT,
  CHAT_GPT_VIP_ACCESS_CACHE_ROOT,
  DRIVE_NAMES,
  ensureChatGptVipAccessDriveTree,
  getDriveRoot,
  getChatGptVipAccessHistoryFile,
  getChatGptVipAccessKnowledgeBaseFile,
  getChatGptVipAccessPromptNormalFile,
  getChatGptVipAccessPromptDatabaseFile,
  getChatGptVipAccessPlainTextInstructionFile,
  getChatGptVipAccessUploadsDir,
  migrateLegacyChatGptVipAccessFiles
};
