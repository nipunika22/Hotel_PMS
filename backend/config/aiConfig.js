// backend/config/aiConfig.js
/**
 * Configuration for AI Hotel Concierge LLM Integration
 */

const aiConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  timeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 15000,
  maxTokens: parseInt(process.env.AI_MAX_TOKENS, 10) || 800,
  temperature: 0.2,
  maxHistoryMessages: 10,
  maxUserMessageLength: 1000,

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && !this.apiKey.includes("placeholder"));
  }
};

module.exports = aiConfig;
