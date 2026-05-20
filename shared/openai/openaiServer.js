const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const dotenv = require("dotenv");
const { requireChatbotLlmProvider } = require("../../chatbot/server/channelConfig");
const { appendServerLog } = require("../../chatbot/server/serverLogs");
const { appendUsageLog } = require("../../chatbot/server/usageLogger");
const { calculateUsageCost } = require("./openaiPricing");
const { logOpenAICall, logCost } = require("../../chatbot/server/fileLogger");

const LOCAL_ENV_FILE = path.join(__dirname, "..", "..", "private", ".env");
dotenv.config({ path: LOCAL_ENV_FILE });
dotenv.config();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** responses.create với vài lần thử khi OpenAI trả 429/502/503 (tạm thời). */
async function responsesCreateWithRetry(client, payload, { label = "responses.create" } = {}) {
  let lastErr;
  const max = 3;
  for (let attempt = 0; attempt < max; attempt += 1) {
    try {
      return await client.responses.create(payload);
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status || err?.response?.status || err?.code || 0);
      const retriable = status === 429 || status === 502 || status === 503;
      if (retriable && attempt < max - 1) {
        const wait = 900 * (attempt + 1);
        appendServerLog({
          level: "warn",
          source: "openai-api",
          message: `${label}: HTTP ${status}, retry ${attempt + 2}/${max} sau ${wait}ms`,
          endpoint: "POST /v1/responses",
          request: { attempt: attempt + 1, status }
        });
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function getActiveLlmProvider(forcedProvider = "") {
  const override = String(forcedProvider || "").trim().toLowerCase();
  if (override === "openai" || override === "localai") return override;
  return requireChatbotLlmProvider();
}

function resolveOpenAiConfig() {
  return {
    apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
    model: String(process.env.OPENAI_MODEL || "").trim(),
    embeddingModel: String(process.env.OPENAI_EMBEDDING_MODEL || "").trim()
  };
}

function resolveLocalAiConfig() {
  return {
    baseUrl: String(process.env.LOCALAI_BASE || process.env.OFFLINE_LLM_BASE || "").trim(),
    apiKey: String(process.env.LOCALAI_API_KEY || process.env.OFFLINE_LLM_API_KEY || "").trim(),
    model: String(process.env.LOCALAI_MODEL || process.env.OFFLINE_LLM_MODEL || "").trim(),
    embeddingModel: String(process.env.LOCALAI_EMBEDDING_MODEL || "").trim()
  };
}

/** Normalize /v1/embeddings JSON from LocalAI / Ollama-compatible servers. */
function normalizeLocalAiEmbeddingsPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.data)) {
    return payload.data.map((item) => ({
      embedding: Array.isArray(item?.embedding)
        ? item.embedding
        : Array.isArray(item?.embeddings)
          ? item.embeddings
          : []
    }));
  }
  if (Array.isArray(payload.embeddings)) {
    return payload.embeddings.map((row) => ({
      embedding: Array.isArray(row) ? row : Array.isArray(row?.embedding) ? row.embedding : []
    }));
  }
  if (Array.isArray(payload.embedding)) {
    return [{ embedding: payload.embedding }];
  }
  return [];
}

function flattenMessageContent(content) {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Responses API style: [{type:'input_text', text:'...'}, ...]
    return content
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (item.type === "input_text" && item.text) return String(item.text);
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch (_) {
    return String(content);
  }
}

function toChatCompletionsMessages(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((m) => ({
      role: String(m?.role || "").trim() || "user",
      content: flattenMessageContent(m?.content)
    }))
    .filter((m) => m.role && typeof m.content === "string");
}

async function callLocalAiChatCompletions({ model, input }) {
  const resolved = resolveLocalAiConfig();
  const baseUrl = resolved.baseUrl;
  const apiKey = resolved.apiKey;
  const localAiModel = resolved.model;

  if (!baseUrl) throw new Error("Chua cau hinh LOCALAI_BASE.");
  if (baseUrl.endsWith("/")) throw new Error("LOCALAI_BASE khong duoc co dau / cuoi.");
  if (!apiKey) throw new Error("Chua cau hinh LOCALAI_API_KEY.");

  const messages = toChatCompletionsMessages(input);
  const chosenModel = String(model || "").trim() || localAiModel;
  if (!String(chosenModel || "").trim()) {
    throw new Error("Thieu LOCALAI_MODEL trong private/.env.");
  }
  const body = {
    ...(chosenModel ? { model: chosenModel } : {}),
    messages,
    stream: false
  };

  const startedAt = Date.now();
  appendServerLog({
    level: "info",
    source: "localai",
    message: `LocalAI ChatCompletions: ${chosenModel || "(default)"} (${baseUrl})`,
    endpoint: "POST /v1/chat/completions",
    method: "POST",
    model: chosenModel || "",
    request: {
      baseUrl,
      model: chosenModel || "",
      messageCount: messages.length
    }
  });

  const r = await axios.post(`${baseUrl}/v1/chat/completions`, body, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 60000,
    validateStatus: () => true
  });

  const duration = Date.now() - startedAt;
  if (r.status < 200 || r.status >= 300) {
    const errText = typeof r.data === "string" ? r.data : JSON.stringify(r.data || {});
    if (r.status === 401) throw new Error("LocalAI 401: Sai/thiếu Bearer (API key).");
    if (r.status === 503) throw new Error("LocalAI 503: NO_WORKER / lỗi phía worker.");
    if (r.status === 504) throw new Error("LocalAI 504: Timeout chờ phản hồi.");
    throw new Error(`LocalAI HTTP ${r.status}: ${errText.slice(0, 300)}`);
  }

  const answer =
    r?.data?.choices?.[0]?.message?.content ||
    r?.data?.choices?.[0]?.text ||
    "";

  return {
    answer: String(answer || "").trim() || "Xin loi, toi chua tao duoc cau tra loi.",
    raw: r.data,
    duration
  };
}

function createClient() {
  const apiKey = resolveOpenAiConfig().apiKey;
  if (!apiKey) {
    throw new Error("Thieu OPENAI_API_KEY trong private/.env.");
  }

  const baseURL = String(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || "").trim();
  return baseURL ? new OpenAI({ apiKey, baseURL }) : new OpenAI({ apiKey });
}

async function callEmbeddingsAPI({ model, input, provider: forcedProvider }) {
  const provider = getActiveLlmProvider(forcedProvider);
  if (provider === "localai") {
    const resolved = resolveLocalAiConfig();
    const baseUrl = resolved.baseUrl;
    const apiKey = resolved.apiKey;
    const chosenModel = String(model || "").trim() || resolved.embeddingModel || resolved.model || "";
    if (!baseUrl) throw new Error("Thieu LOCALAI_BASE trong private/.env.");
    if (!apiKey) throw new Error("Thieu LOCALAI_API_KEY trong private/.env.");
    if (!chosenModel) {
      throw new Error(
        "Thieu model embedding LocalAI: dat LOCALAI_EMBEDDING_MODEL hoac LOCALAI_MODEL trong private/.env."
      );
    }
    const resp = await axios.post(
      `${baseUrl}/v1/embeddings`,
      { model: chosenModel, input },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        timeout: 60000,
        validateStatus: () => true
      }
    );
    if (resp.status < 200 || resp.status >= 300) {
      const errText =
        typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data || {}).slice(0, 500);
      throw new Error(`LocalAI embeddings HTTP ${resp.status}: ${errText}`);
    }
    const normalized = normalizeLocalAiEmbeddingsPayload(resp.data);
    const usage = {
      inputTokens: Number(resp.data?.usage?.prompt_tokens || 0),
      outputTokens: 0,
      embeddingTokens: Number(resp.data?.usage?.total_tokens || resp.data?.usage?.prompt_tokens || 0),
      totalTokens: Number(resp.data?.usage?.total_tokens || resp.data?.usage?.prompt_tokens || 0)
    };
    return {
      response: {
        data: normalized.length ? normalized : []
      },
      usage,
      duration: 0
    };
  }
  if (!String(model || "").trim()) {
    throw new Error("Thieu OPENAI_EMBEDDING_MODEL trong private/.env.");
  }
  const startedAt = Date.now();
  const requestPayload = {
    model,
    input: Array.isArray(input) ? input : [input],
    inputCount: Array.isArray(input) ? input.length : 1
  };

  appendServerLog({
    level: "info",
    source: "openai-api",
    message: `OpenAI Embeddings API: ${model}`,
    endpoint: "POST /v1/embeddings",
    method: "POST",
    model,
    request: requestPayload
  });

  try {
    const client = createClient();
    const response = await client.embeddings.create({
      model,
      input
    });

    const duration = Date.now() - startedAt;
    const inputTokens = Number(response.usage?.prompt_tokens || response.usage?.total_tokens || 0);
    const usage = {
      inputTokens,
      outputTokens: 0,
      embeddingTokens: inputTokens,
      totalTokens: inputTokens
    };

    let costInfo = null;
    try {
      const costResult = calculateUsageCost({
        model,
        inputTokens,
        outputTokens: 0
      });
      if (costResult.pricing.input > 0 || costResult.pricing.output > 0) {
        const costVnd = costResult.totalCostUsd * 25000; // 1 USD = 25,000 VNÄ
        costInfo = {
          costVnd: costVnd,
          costUsd: costResult.totalCostUsd,
          pricing: costResult.pricing,
          calculated: true
        };
      } else {
        costInfo = {
          costVnd: null,
          costUsd: null,
          pricing: null,
          calculated: false,
          note: "ChÆ°a tÃ­nh Ä‘Æ°á»£c (model chÆ°a cÃ³ trong báº£ng giÃ¡)"
        };
      }
    } catch (error) {
      costInfo = {
        costVnd: null,
        costUsd: null,
        pricing: null,
        calculated: false,
        note: `ChÆ°a tÃ­nh Ä‘Æ°á»£c: ${error.message || String(error)}`
      };
    }

    const responsePayload = {
      itemCount: response.data.length,
      usage,
      duration: `${duration}ms`,
      cost: costInfo
    };

    appendServerLog({
      level: "info",
      source: "openai-api",
      message: `OpenAI Embeddings API: ${model} -> ${response.data.length} embeddings (${duration}ms)${costInfo.calculated ? ` - ~${formatCostVnd(costInfo.costVnd)}` : " - " + costInfo.note}`,
      endpoint: "POST /v1/embeddings",
      method: "POST",
      status: "success",
      model,
      usage,
      cost: costInfo.calculated ? costInfo.costVnd : null,
      costInfo: costInfo,
      request: requestPayload,
      response: {
        ...responsePayload,
        rawResponse: {
          data: response.data.map((item) => ({
            embedding: item.embedding ? `[${item.embedding.length} dimensions]` : null,
            index: item.index,
            object: item.object
          })),
          model: response.model,
          object: response.object,
          usage: response.usage
        }
      }
    });

    appendUsageLog({
      id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "embedding",
      model,
      endpoint: "POST /v1/embeddings",
      status: "success",
      createdAt: new Date().toISOString(),
      usage,
      cost: {
        totalCostUsd: costInfo.costUsd || 0,
        totalCostVnd: costInfo.costVnd || 0,
        pricing: costInfo.pricing,
        calculated: costInfo.calculated
      },
      request: requestPayload,
      response: responsePayload,
      requestRaw: requestPayload,
      responseRaw: response
    });

    return {
      response,
      usage,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startedAt;

    appendServerLog({
      level: "error",
      source: "openai-api",
      message: `OpenAI Embeddings API error: ${error.message || String(error)}`,
      endpoint: "POST /v1/embeddings",
      method: "POST",
      status: "error",
      model,
      request: requestPayload,
      response: {
        error: error.message || String(error),
        duration: `${duration}ms`
      }
    });

    logOpenAICall({
      type: "embedding",
      model,
      endpoint: "POST /v1/embeddings",
      duration,
      tokens: null,
      cost: null,
      request: requestPayload,
      response: null,
      error
    });

    throw error;
  }
}

async function callChatAPI({ model, input, provider: forcedProvider, responseFormat = null }) {
  const startedAt = Date.now();
  const requestPayload = {
    model,
    input,
    inputLength: JSON.stringify(input).length,
    responseFormat: responseFormat || null
  };

  appendServerLog({
    level: "info",
    source: "openai-api",
    message: `OpenAI Chat API: ${model}`,
    endpoint: "POST /v1/responses",
    method: "POST",
    model,
    request: requestPayload
  });

  try {
    if (getActiveLlmProvider(forcedProvider) === "localai") {
      const offlineResult = await callLocalAiChatCompletions({ model, input });
      const usage = { inputTokens: 0, outputTokens: 0, embeddingTokens: 0, totalTokens: 0 };

      appendUsageLog({
        id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "chat",
        model: String(model || "").trim() || String(resolveLocalAiConfig().model || "").trim() || "localai",
        endpoint: "POST /v1/chat/completions",
        status: "success",
        createdAt: new Date().toISOString(),
        usage,
        cost: {
          totalCostUsd: 0,
          totalCostVnd: 0,
          pricing: null,
          calculated: false
        },
        request: {
          model: requestPayload.model,
          provider: "localai"
        },
        response: {
          answer: offlineResult.answer,
          duration: `${offlineResult.duration}ms`
        },
        requestRaw: {
          model: requestPayload.model,
          messages: toChatCompletionsMessages(input),
          stream: false
        },
        responseRaw: offlineResult.raw
      });

      return {
        completion: offlineResult.raw,
        answer: offlineResult.answer,
        usage,
        duration: offlineResult.duration
      };
    }

    if (!String(model || "").trim()) {
      throw new Error("Thieu OPENAI_MODEL trong private/.env.");
    }
    const client = createClient();
    /** Prefer json_schema; if the API rejects it (model/schema), fall back to json_object — prompt already mandates JSON. */
    const payloads = [];
    if (responseFormat && typeof responseFormat === "object" && responseFormat.type === "json_schema") {
      payloads.push({ model, input, text: { format: responseFormat } });
      payloads.push({ model, input, text: { format: { type: "json_object" } } });
    } else if (responseFormat && typeof responseFormat === "object") {
      payloads.push({ model, input, text: { format: responseFormat } });
    } else {
      payloads.push({ model, input });
    }
    let completion = null;
    for (let i = 0; i < payloads.length; i += 1) {
      try {
        completion = await responsesCreateWithRetry(client, payloads[i], {
          label: `OpenAI Chat API format#${i + 1}`
        });
        if (i > 0) {
          appendServerLog({
            level: "warn",
            source: "openai-api",
            message: `OpenAI Chat API: succeeded with json_object fallback (${model})`,
            endpoint: "POST /v1/responses",
            model,
            request: { ...requestPayload, fallbackAttempt: i + 1 }
          });
        }
        break;
      } catch (firstErr) {
        if (i < payloads.length - 1) {
          appendServerLog({
            level: "warn",
            source: "openai-api",
            message: `OpenAI Chat API: format attempt ${i + 1} failed, retrying: ${firstErr?.message || String(firstErr)}`,
            endpoint: "POST /v1/responses",
            model,
            request: requestPayload
          });
        }
        if (i === payloads.length - 1) {
          throw firstErr;
        }
      }
    }
    if (!completion) {
      throw new Error("OpenAI responses.create returned no completion.");
    }

    const duration = Date.now() - startedAt;
    const inputTokens = Number(completion.usage?.input_tokens || 0);
    const outputTokens = Number(completion.usage?.output_tokens || 0);
    const answer = completion.output_text || "Xin loi, toi chua tao duoc cau tra loi.";

    const usage = {
      inputTokens,
      outputTokens,
      embeddingTokens: 0,
      totalTokens: inputTokens + outputTokens
    };

    let costInfo = null;
    try {
      const costResult = calculateUsageCost({
        model,
        inputTokens,
        outputTokens
      });
      if (costResult.pricing.input > 0 || costResult.pricing.output > 0) {
        const costVnd = costResult.totalCostUsd * 25000; // 1 USD = 25,000 VNÄ
        costInfo = {
          costVnd: costVnd,
          costUsd: costResult.totalCostUsd,
          pricing: costResult.pricing,
          calculated: true
        };
      } else {
        costInfo = {
          costVnd: null,
          costUsd: null,
          pricing: null,
          calculated: false,
          note: "ChÆ°a tÃ­nh Ä‘Æ°á»£c (model chÆ°a cÃ³ trong báº£ng giÃ¡)"
        };
      }
    } catch (error) {
      costInfo = {
        costVnd: null,
        costUsd: null,
        pricing: null,
        calculated: false,
        note: `ChÆ°a tÃ­nh Ä‘Æ°á»£c: ${error.message || String(error)}`
      };
    }

    const responsePayload = {
      answer,
      usage,
      duration: `${duration}ms`,
      cost: costInfo
    };

    appendServerLog({
      level: "info",
      source: "openai-api",
      message: `OpenAI Chat API: ${model} -> ${inputTokens + outputTokens} tokens (${duration}ms)${costInfo.calculated ? ` - ~${formatCostVnd(costInfo.costVnd)}` : " - " + costInfo.note}`,
      endpoint: "POST /v1/responses",
      method: "POST",
      status: "success",
      model,
      usage,
      cost: costInfo.calculated ? costInfo.costVnd : null,
      costInfo: costInfo,
      request: requestPayload,
      response: {
        ...responsePayload,
        rawResponse: {
          output_text: completion.output_text,
          model: completion.model,
          object: completion.object,
          usage: completion.usage,
          id: completion.id
        }
      }
    });

    appendUsageLog({
      id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "chat",
      model,
      endpoint: "POST /v1/responses",
      status: "success",
      createdAt: new Date().toISOString(),
      usage,
      cost: {
        totalCostUsd: costInfo.costUsd || 0,
        totalCostVnd: costInfo.costVnd || 0,
        pricing: costInfo.pricing,
        calculated: costInfo.calculated
      },
      request: requestPayload,
      response: responsePayload,
      requestRaw: requestPayload,
      responseRaw: completion
    });

    logOpenAICall({
      type: "chat",
      model,
      endpoint: "POST /v1/responses",
      duration,
      tokens: usage,
      cost: costInfo.calculated ? { usd: costInfo.costUsd, vnd: costInfo.costVnd } : null,
      request: { model, inputLength: requestPayload.inputLength },
      response: { answer: answer.substring(0, 200), tokens: usage }
    });

    if (costInfo.calculated && costInfo.costUsd) {
      logCost({
        type: "chat",
        model,
        tokens: usage,
        costUsd: costInfo.costUsd,
        costVnd: costInfo.costVnd,
        metadata: { endpoint: "POST /v1/responses" }
      });
    }

    return {
      completion,
      answer,
      usage,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startedAt;

    appendServerLog({
      level: "error",
      source: "openai-api",
      message: `OpenAI Chat API error: ${error.message || String(error)}`,
      endpoint: "POST /v1/responses",
      method: "POST",
      status: "error",
      model,
      request: requestPayload,
      response: {
        error: error.message || String(error),
        duration: `${duration}ms`
      }
    });

    logOpenAICall({
      type: "chat",
      model,
      endpoint: "POST /v1/responses",
      duration,
      tokens: null,
      cost: null,
      request: requestPayload,
      response: null,
      error
    });

    throw error;
  }
}

function formatCostVnd(costVnd) {
  if (!costVnd || costVnd === 0) {
    return "0 VNÄ";
  }
  if (costVnd < 1000) {
    return `${Math.round(costVnd)} VNÄ`;
  }
  if (costVnd < 1000000) {
    return `${(costVnd / 1000).toFixed(1)}k VNÄ`;
  }
  return `${(costVnd / 1000000).toFixed(2)}M VNÄ`;
}

module.exports = {
  callEmbeddingsAPI,
  callChatAPI
};





