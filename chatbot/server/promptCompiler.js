const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "prompts");
const CONVERSATION_SETUP_FILE = path.join(PROMPTS_DIR, "conversationSetup.txt");
const RULES_HUB_FILE = path.join(PROMPTS_DIR, "rulesHub.txt");
const CASES_COMPACT_FILE = path.join(PROMPTS_DIR, "cases.compact.xml");
const CHAT_CASES_LEGACY_FILE = path.join(PROMPTS_DIR, "chatCases.txt");
const CHAT_CASES_LEGACY_BACKUP = path.join(PROMPTS_DIR, "chatCases.legacy.txt");
const MONTHLY_PROMOTIONS_FILE = path.join(PROMPTS_DIR, "monthlyPromotionsByOffice.txt");

let cached = { key: "", content: "" };

function useCompactPrompt() {
  const v = String(process.env.USE_COMPACT_PROMPT ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

function fileMtimeKey(files) {
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => `${f}:${fs.statSync(f).mtimeMs}`)
    .join("|");
}

function readTrimmed(filePath, fallback = "") {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8").trim();
}

function readLegacyConcatPrompt() {
  const fallback = "Ban la chatbot ho tro doanh nghiep.";
  let out = readTrimmed(CONVERSATION_SETUP_FILE, fallback);
  const legacyCases = fs.existsSync(CHAT_CASES_LEGACY_FILE)
    ? readTrimmed(CHAT_CASES_LEGACY_FILE)
    : readTrimmed(CHAT_CASES_LEGACY_BACKUP);
  if (legacyCases) out = `${out}\n\n${legacyCases}`;
  const monthly = readTrimmed(MONTHLY_PROMOTIONS_FILE);
  if (monthly) out = `${out}\n\n${monthly}`;
  return out;
}

function readCompactPrompt() {
  const fallback = "Ban la chatbot ho tro doanh nghiep.";
  const parts = [];
  const setup = readTrimmed(CONVERSATION_SETUP_FILE);
  if (setup) parts.push(setup);
  const hub = readTrimmed(RULES_HUB_FILE);
  if (hub) parts.push(hub);
  const cases = readTrimmed(CASES_COMPACT_FILE);
  if (cases) parts.push(cases);
  const monthly = readTrimmed(MONTHLY_PROMOTIONS_FILE);
  if (monthly) parts.push(monthly);
  return parts.length ? parts.join("\n\n") : fallback;
}

/**
 * System prompt for LLM: compact (default) or legacy monolithic chatCases.
 */
function compileSystemPrompt() {
  const compact = useCompactPrompt();
  const files = compact
    ? [CONVERSATION_SETUP_FILE, RULES_HUB_FILE, CASES_COMPACT_FILE, MONTHLY_PROMOTIONS_FILE]
    : [CONVERSATION_SETUP_FILE, CHAT_CASES_LEGACY_FILE, MONTHLY_PROMOTIONS_FILE];
  const key = `${compact ? "compact" : "legacy"}:${fileMtimeKey(files)}`;
  if (cached.key === key && cached.content) return cached.content;

  let content;
  if (compact && fs.existsSync(RULES_HUB_FILE) && fs.existsSync(CASES_COMPACT_FILE)) {
    content = readCompactPrompt();
  } else {
    content = readLegacyConcatPrompt();
  }
  cached = { key, content };
  return content;
}

function getPromptMode() {
  return useCompactPrompt() &&
    fs.existsSync(RULES_HUB_FILE) &&
    fs.existsSync(CASES_COMPACT_FILE)
    ? "compact"
    : "legacy";
}

module.exports = {
  compileSystemPrompt,
  getPromptMode,
  useCompactPrompt,
  PROMPTS_DIR,
  CONVERSATION_SETUP_FILE,
  MONTHLY_PROMOTIONS_FILE
};
