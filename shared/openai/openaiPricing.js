const PRICING_PER_MILLION_TOKENS = {
  "gpt-4.1": {
    input: 2.0,
    output: 8.0
  },
  "gpt-4.1-mini": {
    input: 0.4,
    output: 1.6
  },
  "gpt-4.1-nano": {
    input: 0.1,
    output: 0.4
  },
  "gpt-4o": {
    input: 2.5,
    output: 10.0
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6
  },
  "gpt-4o-2024-05-13": {
    input: 5.0,
    output: 15.0
  },
  "gpt-5": {
    input: 1.25,
    output: 10.0
  },
  "gpt-5-pro": {
    input: 15.0,
    output: 120.0
  },
  "gpt-5.2-pro": {
    input: 21.0,
    output: 168.0
  },
  "gpt-5.1-codex": {
    input: 1.25,
    output: 10.0
  },
  "gpt-5.1-codex-max": {
    input: 1.25,
    output: 10.0
  },
  "gpt-5.2-codex": {
    input: 1.75,
    output: 14.0
  },
  "gpt-realtime": {
    input: 4.0,
    output: 16.0
  },
  "gpt-realtime-1.5": {
    input: 4.0,
    output: 16.0
  },
  "gpt-realtime-mini": {
    input: 0.6,
    output: 2.4
  },
  "text-embedding-3-small": {
    input: 0.02,
    output: 0
  },
  "text-embedding-3-large": {
    input: 0.13,
    output: 0
  },
  "text-embedding-ada-002": {
    input: 0.1,
    output: 0
  }
};

function getModelPricing(model) {
  return PRICING_PER_MILLION_TOKENS[model] || {
    input: 0,
    output: 0
  };
}

function calculateUsageCost({ model, inputTokens = 0, outputTokens = 0 }) {
  const pricing = getModelPricing(model);
  const inputCostUsd = (inputTokens / 1000000) * pricing.input;
  const outputCostUsd = (outputTokens / 1000000) * pricing.output;

  return {
    pricing,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd
  };
}

module.exports = {
  calculateUsageCost
};






