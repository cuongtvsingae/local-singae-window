const { getRuntimeConfig, requireChatbotLlmProvider } = require("../../chatbot/server/channelConfig");
const { getActivePromptContent } = require("../../chatbot/server/promptLibrary");
const {
  BOT_JSON_RESPONSE_INSTRUCTION,
  parseBotStructuredAssistantText
} = require("../../chatbot/server/botStructuredOutput");
const { callEmbeddingsAPI, callChatAPI } = require("./openaiServer");

/** Một phần tử actions[] — một object cố định (không dùng oneOf) để API/schema ổn định. */
const BOT_ENVELOPE_ACTION_STEP = {
  type: "object",
  additionalProperties: false,
  description:
    "Moi phan tu bat buoc du kind+patch+appointment (schema strict). kind=none van phai du patch.patient 7 key + notes + appointment 5 key (co the \"\"). create_booking_request: patch.patient day du 7 field gia tri that khi co du lieu; appointment day du id,startAt,endAt,serviceName,status=booked.",
  required: ["kind", "patch", "appointment"],
  properties: {
    kind: {
      type: "string",
      enum: ["none", "merge_customer_intake", "create_booking_request"],
      description:
        "none: khong tac vu DB. merge_customer_intake: luu/bo sung intake. create_booking_request: tao yeu cau dat lich khi du dieu kien (phone hop le sau merge). Neu co create_booking_request trong luot thi booking_client_confirmed=true."
    },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["patient", "notes"],
      properties: {
        patient: {
          type: "object",
          additionalProperties: false,
          required: [
            "fullName",
            "phone",
            "regionLive",
            "preferredOfficeKey",
            "shuttlePickup",
            "preferredVisitDate",
            "preferredVisitTime"
          ],
          properties: {
            fullName: { type: "string" },
            phone: { type: "string" },
            regionLive: { type: "string" },
            preferredOfficeKey: { type: "string", enum: ["", "25VNP", "355LTT"] },
            shuttlePickup: { type: "string", enum: ["", "yes", "no"] },
            preferredVisitDate: { type: "string" },
            preferredVisitTime: { type: "string" }
          }
        },
        notes: { type: "string" }
      }
    },
    appointment: {
      type: "object",
      additionalProperties: false,
      required: ["id", "startAt", "endAt", "serviceName", "status"],
      properties: {
        id: { type: "string" },
        startAt: { type: "string" },
        endAt: { type: "string" },
        serviceName: { type: "string" },
        status: { type: "string" }
      }
    }
  }
};

const BOT_ENVELOPE_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "bot_envelope",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "conversation_phase",
      "inbox_hint",
      "booking_client_confirmed",
      "user_message",
      "collected",
      "actions"
    ],
    properties: {
      version: { type: "number", enum: [1] },
      conversation_phase: { type: "string", enum: ["idle", "collecting_info", "scheduling"] },
      inbox_hint: { type: "string", enum: ["keep", "needs_human"] },
      booking_client_confirmed: {
        type: "boolean",
        description:
          "false: gan nhu moi luot (tu van, merge intake khong tao lich). true: chi khi actions[] co ban ghi kind create_booking_request trong luot nay va intake da du dieu kien (VD phone hop le). Dong bo voi BOT_JSON_RESPONSE_INSTRUCTION — khong mau thuan true/false voi actions[]."
      },
      user_message: {
        type: "string",
        minLength: 1,
        description:
          "Bat buoc: string khac rong. Tin gui khach: tieng Viet day du dau. Tra loi PHAI la JSON hop json_schema — khong duoc bo key, khong fence markdown. Neu co block XUNG HO DA CHON thi phai dung dung cap trong block do; neu khong moi fallback cô/chú - con. Cam khong dau (ASCII). Tom tat lich: moi muc mot dong co nhan. Uu tien xu ly thang van de hien tai cua khach; neu thong tin chua du thi hoi them 1-2 thong tin chuyen mon can thiet truoc. Chi moi dat lich sau khi da tu van xong y chinh hoac khi KB khong du de xu ly sau hon."
      },
      collected: {
        type: "object",
        additionalProperties: false,
        required: ["patient", "notes"],
        properties: {
          patient: {
            type: "object",
            additionalProperties: false,
            required: [
              "fullName",
              "phone",
              "regionLive",
              "preferredOfficeKey",
              "shuttlePickup",
              "preferredVisitDate",
              "preferredVisitTime"
            ],
            properties: {
              fullName: { type: "string" },
              phone: { type: "string" },
              regionLive: { type: "string" },
              preferredOfficeKey: { type: "string", enum: ["", "25VNP", "355LTT"] },
              shuttlePickup: { type: "string", enum: ["", "yes", "no"] },
              preferredVisitDate: { type: "string" },
              preferredVisitTime: { type: "string" }
            }
          },
          notes: { type: "string" }
        }
      },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: BOT_ENVELOPE_ACTION_STEP
      }
    }
  }
};

async function embedTexts(texts, options = {}) {
  const optProv = String(options?.provider || "").trim().toLowerCase();
  const provider =
    optProv === "openai" || optProv === "localai" ? optProv : requireChatbotLlmProvider();
  const model =
    provider === "localai"
      ? String(
          process.env.LOCALAI_EMBEDDING_MODEL ||
            getRuntimeConfig().localai?.embeddingModel ||
            getRuntimeConfig().localai?.model ||
            process.env.LOCALAI_MODEL ||
            ""
        ).trim()
      : String(process.env.OPENAI_EMBEDDING_MODEL || getRuntimeConfig().openai.embeddingModel || "").trim();
  if (!model) {
    throw new Error(
      provider === "localai"
        ? "Thieu LOCALAI_EMBEDDING_MODEL hoac LOCALAI_MODEL trong private/.env."
        : "Thieu OPENAI_EMBEDDING_MODEL trong private/.env."
    );
  }
  const inputs = texts.map((text) => String(text || "").trim()).filter(Boolean);

  if (!inputs.length) {
    return {
      model,
      embeddings: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokens: 0,
        totalTokens: 0
      },
      request: {
        input: inputs
      },
      response: {
        itemCount: 0
      }
    };
  }

  const { response, usage } = await callEmbeddingsAPI({
    model,
    input: inputs,
    provider
  });

  const dataRows = Array.isArray(response?.data) ? response.data : [];
  const embeddings = dataRows.map((item) => (Array.isArray(item?.embedding) ? item.embedding : []));

  return {
    model,
    embeddings,
    usage,
    request: {
      input: inputs
    },
    response: {
      itemCount: dataRows.length
    },
    requestRaw: {
      model,
      input: inputs
    },
    responseRaw: response
  };
}

async function embedText(text, options = {}) {
  const result = await embedTexts([text], options);
  return {
    ...result,
    embedding: result.embeddings[0] || []
  };
}

const CHAT_CASE = {
  FIRST_TIME: "first_time",           // CASE 1: Láº§n Ä‘áº§u chat
  ONGOING_CONVERSATION: "ongoing",     // CASE 2: Äang trong cuá»™c há»™i thoáº¡i (< 7 ngÃ y)
  LONG_TIME_AGO: "long_time_ago"      // CASE 3: LÃ¢u rá»“i má»›i chat láº¡i (>= 7 ngÃ y)
};

async function askOpenAI({
  question,
  context,
  conversationHistory = [],
  chatCase,
  daysSinceLastChat = null,
  lastChatSummary = null,
  participantName = null,
  preferredAddress = null,
  mirrorProfile = null,
  gender = null,
  provider: forcedProvider = "",
  intakeContextMarkdown = "",
  intakeSnap = null
}) {
  const fp = String(forcedProvider || "").trim().toLowerCase();
  const provider = fp === "openai" || fp === "localai" ? fp : requireChatbotLlmProvider();
  const model =
    provider === "localai"
      ? String(process.env.LOCALAI_MODEL || getRuntimeConfig().localai?.model || "").trim()
      : String(process.env.OPENAI_MODEL || getRuntimeConfig().openai?.model || "").trim();
  if (!model) {
    throw new Error(
      provider === "localai"
        ? "Thieu LOCALAI_MODEL trong private/.env."
        : "Thieu OPENAI_MODEL trong private/.env."
    );
  }
  const systemPrompt = await getActivePromptContent(provider);
  
  let detectedCase = chatCase;
  if (!detectedCase) {
    if (conversationHistory.length === 0) {
      detectedCase = CHAT_CASE.FIRST_TIME;
    } else if (daysSinceLastChat !== null && daysSinceLastChat >= 7) {
      detectedCase = CHAT_CASE.LONG_TIME_AGO;
    } else {
      detectedCase = CHAT_CASE.ONGOING_CONVERSATION;
    }
  }
  
  const {
    resolveConversationHonorific,
    applyHonorificConsistency,
    sanitizeMirrorProfile
  } = require("../../chatbot/server/nameGenderDetector");

  const isUsableDisplayName = (name) => {
    const n = String(name || "").trim();
    if (!n) return false;
    const lower = n.toLowerCase();
    if (lower === "admin" || lower.includes("admin |")) return false;
    if (/^facebook user\s+\d+$/i.test(n)) return false;
    return true;
  };

  const resolvedHonorific = resolveConversationHonorific({
    currentMessage: question,
    preferredAddress,
    mirrorProfile: sanitizeMirrorProfile(mirrorProfile),
    gender
  });
  const parts = [];

  if (resolvedHonorific) {
    parts.push(
      `\n\n[XƯNG HÔ ĐÃ CHỌN] — bắt buộc, không đổi cặp]:\n` +
        `Gọi khách: **${resolvedHonorific.userHonorific}**\n` +
        `Bot tự xưng: **${resolvedHonorific.botSelfHonorific}**\n` +
        `Cả user_message: **một** cặp từ đầu đến cuối — **cấm** *con/em*, *bên con/em*, dấu /, hoặc đổi cách xưng giữa các câu.\n` +
        `**Cấm** bắt chước xưng hô trong [LỊCH SỬ CHAT] nếu khác block này — chỉ dùng cặp trên.\n` +
        `${resolvedHonorific.promptVI}`
    );
  }

  if (isUsableDisplayName(participantName)) {
    parts.push(
      `\n\n[THÔNG TIN KHÁCH HÀNG]: Quý danh ngắn có thể dùng khi cần: "${participantName}". Khong tu mo rong thanh full ten.`
    );
  }

  let caseBlock = "";
  switch (detectedCase) {
    case CHAT_CASE.FIRST_TIME:
      caseBlock =
        `\n\n[CASE 1 — LẦN ĐẦU]: Bám rulesHub \`mo_dau_dong_thoi_case\` + \`gioi_dien_va_do_dai\` — lễ phép, tự nhiên. ` +
        `2–6 câu; một câu khai thác nếu [INTAKE CÒN THIẾU].`;
      break;
    case CHAT_CASE.ONGOING_CONVERSATION:
      caseBlock =
        `\n\n[CASE 2 — ĐANG HỘI THOẠI]: Vào thẳng, 2–5 câu, giọng người thật (rulesHub). ` +
        `Cấm chào mở; một câu khai thác nếu thiếu field.`;
      if (lastChatSummary) {
        caseBlock += ` Tóm tắt lượt trước: ${lastChatSummary}`;
      }
      break;
    case CHAT_CASE.LONG_TIME_AGO:
      caseBlock =
        `\n\n[CASE 3 — LÂU MỚI CHAT LẠI]: 3–6 câu; chào ngắn lễ phép + trọng tâm.`;
      if (lastChatSummary) {
        const hasSpecificIssue = /đau|điều trị|kiểm tra|vấn đề|bệnh|sưng|nhức|viêm/i.test(lastChatSummary);
        if (hasSpecificIssue) {
          caseBlock += ` Nếu liên quan có thể tham chiếu vấn đề cũ ngắn.`;
        } else {
          caseBlock += ` Nếu không liên quan thì xử lý ý mới.`;
        }
      }
      break;
    default:
      if (conversationHistory.length > 0) {
        caseBlock = `\n\n[TIẾP TỤC HỘI THOẠI]: Dùng lịch sử; 2–5 câu, cấm mo_dau đầy đủ.`;
      }
  }

  if (conversationHistory.length > 0) {
    parts.push(
      `\n\n[LỊCH SỬ CHAT]: Chi tham chieu noi dung/ten dich vu — **khong** suy xung ho tu cau bot cu. Xung ho **chi** theo [XƯNG HÔ ĐÃ CHỌN].`
    );
    try {
      const { buildSessionSummaryMarkdown } = require("../../chatbot/server/runtimePromptBlocks");
      const sessionLine = buildSessionSummaryMarkdown({
        lastChatSummary,
        intakeSnap
      });
      if (sessionLine) parts.push(sessionLine);
    } catch (_) {
      /* optional */
    }
  } else {
    parts.push(`\n\n[CHÚ Ý]: Chua co lich su hoi thoai trong payload.`);
  }

  const timeContext = parts.join("") + caseBlock;

  const systemContent = `${systemPrompt}${timeContext}

[DU LIEU TU KHO DATABASE]:
${context || "Khong co du lieu nao duoc import."}

[RAG + NGON NGU]: Chi dung [KB-n] neu co. "user_message" va flow hoi dap phai tuan thu SYSTEM PROMPT o tren. actions[]: moi phan tu cung hinh { kind, patch, appointment } — xem [HUONG DAN JSON] ben duoi. Khong bia them.${String(intakeContextMarkdown || "").trim()}${BOT_JSON_RESPONSE_INSTRUCTION}`;

  const input = [{ role: "system", content: systemContent }];

  try {
    const { appendServerLog } = require("../../chatbot/server/serverLogs");
    const { getPromptMode } = require("../../chatbot/server/promptLibrary");
    appendServerLog({
      level: "info",
      source: "prompt-compiler",
      message: "LLM system prompt assembled",
      metadata: {
        promptMode: getPromptMode(),
        systemChars: systemContent.length,
        historyMessages: conversationHistory.length,
        chatCase: detectedCase
      }
    });
  } catch (_) {
    /* logging optional */
  }

  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    conversationHistory.forEach((msg) => {
      if (msg.role && msg.content) {
        input.push({
          role: msg.role,
          content: String(msg.content || "").trim()
        });
      }
    });
  }

  input.push({
    role: "user",
    content: question
  });

  const { completion, answer, usage } = await callChatAPI({
    model,
    input,
    provider,
    responseFormat: BOT_ENVELOPE_RESPONSE_FORMAT
  });

  const normalizeForEchoCheck = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isEchoOrParrot = (qNorm, aNorm) => {
    if (!qNorm || !aNorm) return false;
    if (qNorm === aNorm && qNorm.length <= 120) return true;
    if (qNorm.length >= 8 && qNorm.length <= 140 && aNorm.includes(qNorm)) return true;
    if (qNorm.length <= 80) {
      const qWords = qNorm.split(/\s+/).filter((w) => w.length > 2);
      if (qWords.length >= 3) {
        const matched = qWords.filter((w) => aNorm.includes(w)).length;
        if (matched / qWords.length >= 0.9 && aNorm.length <= qNorm.length * 2.8) return true;
      }
    }
    return false;
  };

  const buildAntiParrotFallback = (hon, userQuestion) => {
    const bot = String(hon?.botSelfHonorific || "con").trim() || "con";
    const user = String(hon?.userHonorific || "cô/chú").trim() || "cô/chú";
    const peerBot = bot === "em";
    const q = String(userQuestion || "").toLowerCase();
    let detailAsk = "một chi tiết cụ thể (số răng, vị trí, hoặc thời gian)";
    if (/gia|chi phi|bao nhieu|cost|price/.test(q)) {
      detailAsk = "hàm nào đang thiếu răng hoặc cần điều trị";
    } else if (/dia chi|co so|o dau|địa chỉ|cơ sở/.test(q)) {
      detailAsk = `khu vực ${user} đang ở`;
    } else if (/dau|nhuc|viem|đau|nhức|viêm/.test(q)) {
      detailAsk = "răng nào đang đau và khoảng bao lâu";
    }
    if (peerBot) {
      return applyHonorificConsistency(
        `Dạ, ${bot} đã nhận ý ${user} ạ.\n` +
          `${user} cho ${bot} xin thêm ${detailAsk} để bác sĩ tư vấn đúng hướng ạ?`,
        hon
      );
    }
    return applyHonorificConsistency(
      `Dạ, ${bot} rất mong nhận thêm ${detailAsk} để bác sĩ tư vấn đúng hướng cho ${user} ạ.`,
      hon
    );
  };

  const rawAnswer = String(answer || "").trim();
  const structured = parseBotStructuredAssistantText(rawAnswer);
  /** Lỗi parse/normalize: không gửi raw JSON hay tin lỗi cho khách — để rỗng. */
  let finalAnswer =
    structured.parseNote === "ok" ? String(structured.userMessage || "").trim() : "";

  const qNorm = normalizeForEchoCheck(question);
  const aNorm = normalizeForEchoCheck(finalAnswer);
  if (qNorm && aNorm && isEchoOrParrot(qNorm, aNorm)) {
    finalAnswer = buildAntiParrotFallback(resolvedHonorific, question);
  }

  if (finalAnswer && resolvedHonorific) {
    finalAnswer = applyHonorificConsistency(finalAnswer, resolvedHonorific);
  }

  return {
    model,
    answer: finalAnswer,
    botEnvelope: structured.envelope,
    botParseNote: structured.parseNote,
    rawAssistantText: rawAnswer,
    usage,
    request: {
      question,
      context,
      conversationHistoryLength: conversationHistory.length,
      chatCase: detectedCase,
      daysSinceLastChat,
      lastChatSummary
    },
    response: {
      answer: finalAnswer
    },
    requestRaw: {
      model,
      input
    },
    responseRaw: completion
  };
}

module.exports = {
  askOpenAI,
  embedText,
  embedTexts
};






