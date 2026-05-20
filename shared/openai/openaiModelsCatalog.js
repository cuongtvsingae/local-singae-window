const { calculateUsageCost } = require("./openaiPricing");


const USD_TO_VND_DISPLAY = 26000;


const EST_INPUT_TOKENS = 520;
const EST_OUTPUT_TOKENS = 380;

const CHAT_MODELS = [
  {
    id: "gpt-4o",
    label: "GPT-4o",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: cÃ¢n báº±ng trÃ­ tuá»‡/tá»‘c Ä‘á»™; há»— trá»£ vision; phÃ¹ há»£p CSKH Ä‘a dáº¡ng."
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: ráº» vÃ  nhanh; Ä‘á»§ tá»‘t cho FAQ, bot Ä‘Æ¡n giáº£n, khá»‘i lÆ°á»£ng lá»›n."
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: suy luáº­n vÃ  ngá»¯ cáº£nh dÃ i tá»‘t; phÃ¹ há»£p tÃ¡c vá»¥ phá»©c táº¡p."
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: chi phÃ­ tháº¥p hÆ¡n 4.1, váº«n thÃ´ng minh cho Ä‘a sá»‘ há»™i thoáº¡i."
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: cá»±c ráº», pháº£n há»“i nhanh; phÃ¢n loáº¡i, trÃ­ch xuáº¥t Ä‘Æ¡n giáº£n."
  },
  {
    id: "gpt-4o-2024-05-13",
    label: "GPT-4o (2024-05-13)",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: snapshot 4o theo má»‘c giÃ¡ riÃªng; dÃ¹ng khi cáº§n khá»›p billing cÅ©."
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: tháº¿ há»‡ má»›i, cháº¥t lÆ°á»£ng cao; kiá»ƒm tra kháº£ dá»¥ng trÃªn API key cá»§a báº¡n."
  },
  {
    id: "gpt-5-pro",
    label: "GPT-5 Pro",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: cháº¥t lÆ°á»£ng tá»‘i Ä‘a; chi phÃ­ cao â€” chá»‰ khi tháº­t cáº§n."
  },
  {
    id: "gpt-5.2-pro",
    label: "GPT-5.2 Pro",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: flagship trong catalog; Ä‘áº¯t, cho use-case Ä‘áº·c biá»‡t."
  },
  {
    id: "gpt-5.1-codex",
    label: "GPT-5.1 Codex",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: tá»‘i Æ°u code & ká»¹ thuáº­t; debug, script, refactor."
  },
  {
    id: "gpt-5.1-codex-max",
    label: "GPT-5.1 Codex Max",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: context/code lá»›n hÆ¡n Codex thÆ°á»ng; repo to."
  },
  {
    id: "gpt-5.2-codex",
    label: "GPT-5.2 Codex",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: tháº¿ há»‡ Codex má»›i; dev náº·ng â€” cÃ¢n nháº¯c chi phÃ­."
  },
  {
    id: "gpt-realtime",
    label: "GPT Realtime",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: há»™i thoáº¡i/giá»ng realtime (API riÃªng); khÃ´ng pháº£i chat HTTP thÆ°á»ng."
  },
  {
    id: "gpt-realtime-1.5",
    label: "GPT Realtime 1.5",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: realtime nÃ¢ng cáº¥p; giÃ¡ theo báº£ng voice cá»§a OpenAI."
  },
  {
    id: "gpt-realtime-mini",
    label: "GPT Realtime Mini",
    highlight:
      "Æ¯u Ä‘iá»ƒm máº¡nh nháº¥t: realtime tiáº¿t kiá»‡m hÆ¡n; thá»­ nghiá»‡m giá»ng/gá»i tá»± Ä‘á»™ng."
  }
];

function listChatModelsWithEstimates() {
  return CHAT_MODELS.map((m) => {
    const { totalCostUsd } = calculateUsageCost({
      model: m.id,
      inputTokens: EST_INPUT_TOKENS,
      outputTokens: EST_OUTPUT_TOKENS
    });
    const approxVndPerMessage = Math.round(totalCostUsd * USD_TO_VND_DISPLAY);
    return {
      id: m.id,
      label: m.label,
      highlight: m.highlight,
      assumptionTokens: { input: EST_INPUT_TOKENS, output: EST_OUTPUT_TOKENS },
      approxUsdPerMessage: Math.round(totalCostUsd * 1e6) / 1e6,
      approxVndPerMessage,
      pricingNote: `Æ¯á»›c lÆ°á»£ng theo báº£ng giÃ¡ OpenAI (USD), quy VNÄ @~${USD_TO_VND_DISPLAY}; giáº£ Ä‘á»‹nh ~${EST_INPUT_TOKENS} token nháº­p + ~${EST_OUTPUT_TOKENS} token tráº£ lá»i má»—i lÆ°á»£t.`
    };
  });
}

function isKnownChatModelId(modelId) {
  return CHAT_MODELS.some((m) => m.id === modelId);
}

module.exports = {
  CHAT_MODELS,
  listChatModelsWithEstimates,
  isKnownChatModelId,
  USD_TO_VND_DISPLAY,
  EST_INPUT_TOKENS,
  EST_OUTPUT_TOKENS
};





