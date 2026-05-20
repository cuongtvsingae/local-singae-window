/**
 * Import tools/chatbot/data/knowledge-rang-su-faq.json vao SQLite KB (namespace openai).
 * JSON: moi phan tu phai co du 11 key (nhu XLSX); neu file cu chi co answer gop,
 * script tach "[Tu van / ban hang]" thanh answer + conditions.
 *
 * Chay tu repo root (can OPENAI_API_KEY + embedding trong private/.env):
 *   node tools/chatbot/scripts/import-knowledge-rang-su-faq.cjs
 *   npm run kb:import-faq-json
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const LOCAL_ENV = path.join(__dirname, "../../private/.env");
dotenv.config({ path: LOCAL_ENV });
dotenv.config();

const { replaceKnowledgeBase } = require("../server/knowledgeBaseV2");
const { embedTexts } = require("../../shared/openai/openaiClient");
const { getRuntimeConfig, requireChatbotLlmProvider } = require("../server/channelConfig");

const jsonPath = path.join(__dirname, "../data/knowledge-rang-su-faq.json");

const SALES_SPLITTERS = [
  "\n\n[Tư vấn / bán hàng]\n",
  "\n\n[Tư vấn / bán hàng]",
  "[Tư vấn / bán hàng]\n",
  "[Tư vấn / bán hàng]"
];

function splitAnswerAndConditions(combined) {
  const s = String(combined || "");
  for (const m of SALES_SPLITTERS) {
    const i = s.indexOf(m);
    if (i !== -1) {
      return {
        answer: s.slice(0, i).trim(),
        conditions: s.slice(i + m.length).trim()
      };
    }
  }
  return { answer: s.trim(), conditions: "" };
}

function clampPriority(n) {
  const p = Number(n);
  if (!Number.isFinite(p)) return 4;
  return Math.max(1, Math.min(5, Math.round(p)));
}

function faqJsonToRows(arr) {
  return arr.map((r, index) => {
    const stt = index + 1;
    const id = String(r.id || `FAQ-${String(stt).padStart(3, "0")}`).trim();
    let answer = String(r.answer ?? "").trim();
    let conditions = String(r.conditions ?? "").trim();
    if (!conditions && answer) {
      const sp = splitAnswerAndConditions(answer);
      answer = sp.answer;
      conditions = sp.conditions;
    }
    return {
      id,
      category: String(r.category || "Răng sứ").trim() || "Răng sứ",
      question: String(r.question || "").trim(),
      answer,
      keywords: String(r.keywords || "").trim(),
      conditions,
      channel_scope: String(r.channel_scope || "all").trim().toLowerCase() || "all",
      priority: clampPriority(r.priority),
      effective_from: String(r.effective_from || "2026-01-01").trim(),
      effective_to: String(r.effective_to || "").trim(),
      status: String(r.status || "active").trim().toLowerCase() || "active"
    };
  });
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("File JSON phai la mang khac rong: " + jsonPath);
  }
  const rows = faqJsonToRows(raw);
  const provider = requireChatbotLlmProvider();
  const embeddingModel =
    provider === "localai"
      ? String(
          getRuntimeConfig().localai?.embeddingModel || getRuntimeConfig().localai?.model || ""
        ).trim()
      : String(getRuntimeConfig().openai.embeddingModel || "").trim();

  const { knowledgeBase } = await replaceKnowledgeBase({
    sourceName: "knowledge-rang-su-faq.json",
    sourceType: "json",
    rows,
    embedTexts: (texts) => embedTexts(texts, { provider }),
    embeddingModel,
    namespace: provider
  });

  console.log("Imported KB:", knowledgeBase.entries.length, "entries | model:", embeddingModel || "(default)");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
