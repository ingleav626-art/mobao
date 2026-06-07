/**
 * @file llm/qwen-provider.js
 * @module llm/qwen-provider
 * @description 通义千问 Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * 默认配置：
 *   - endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
 *   - model: qwen-turbo
 *   - timeoutMs: 40000, temperature: 0.2, maxTokens: 2048
 *   - 支持 thinking 模式、独立模型、跨局记忆、反思
 *
 * 存储键：
 *   - 设置: mobao_qwen_settings_v1
 *   - API Key: mobao_qwen_api_key_v1
 *
 * @requires LlmManager - LLM 管理器（scripts/llm/llm-manager.js）
 *
 * @exports QwenProvider - 通义千问 Provider 对象
 */
"use strict"

if (!window.LlmManager) {
  console.error("LlmManager not loaded. Please load llm-manager.js first.")
}

const { createOpenAICompatibleProvider, utils } = window.LlmManager
const { clamp, toFiniteNumber, normalizeObject } = utils

const QWEN_STORAGE_KEY = "mobao_qwen_settings_v1"
const QWEN_API_KEY_STORAGE_KEY = "mobao_qwen_api_key_v1"

function defaultQwenSettings() {
  return {
    provider: "qwen",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    thinkingEnabled: false,
    thinkingParams: "",
    independentModelEnabled: false,
    independentReflectionEnabled: true,
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-turbo",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

function normalizeQwenSettings(source, fallback) {
  const defaults = {
    ...defaultQwenSettings(),
    ...normalizeObject(fallback)
  }
  const input = normalizeObject(source)

  const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
  const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
  const apiKeyRaw =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : String(defaults.apiKey || "")

  return {
    provider: "qwen",
    enabled: Boolean(input.enabled),
    multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
    reflectionEnabled: Boolean(input.reflectionEnabled),
    thinkingEnabled: Boolean(input.thinkingEnabled),
    independentModelEnabled: Boolean(input.independentModelEnabled),
    independentReflectionEnabled:
      input.independentReflectionEnabled !== undefined ? Boolean(input.independentReflectionEnabled) : true,
    thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
    endpoint: endpointRaw || defaults.endpoint,
    model: modelRaw.length > 0 ? modelRaw : defaults.model,
    apiKey: apiKeyRaw,
    timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
    temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
    maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 102400)
  }
}

function isQwenThinkingModel(model) {
  return /qwen.*think|qwen.*reasoning/i.test(model)
}

function buildRequestBody(settings, context) {
  const { isThinking, temperature } = context
  const isQwenThinkingModelName = isQwenThinkingModel(settings.model)
  const body = {}

  if (isThinking && isQwenThinkingModelName) {
    body.enable_thinking = true
  } else {
    body.temperature = temperature
  }

  if (isThinking && settings.thinkingParams) {
    try {
      const customParams = JSON.parse(settings.thinkingParams)
      if (customParams && typeof customParams === "object") {
        Object.assign(body, customParams)
      }
    } catch (_e) { }
  }

  return body
}

const qwenProvider = createOpenAICompatibleProvider({
  id: "qwen",
  name: "通义千问",
  description: "阿里云通义千问，支持 qwen-turbo、qwen-plus、qwen-max 等模型",
  storageKey: QWEN_STORAGE_KEY,
  apiKeyStorageKey: QWEN_API_KEY_STORAGE_KEY,
  defaultSettings: defaultQwenSettings,
  normalizeSettings: normalizeQwenSettings,
  isThinkingModel: isQwenThinkingModel,
  buildRequestBody: buildRequestBody,
  supportsFeature: function (feature) {
    const supportedFeatures = ["streaming", "thinking"]
    return supportedFeatures.indexOf(feature) !== -1
  }
})

const provider = {
  ...qwenProvider,
  id: "qwen",
  name: "通义千问",
  description: "阿里云通义千问，支持 qwen-turbo、qwen-plus、qwen-max 等模型"
}

export const QwenProvider = {
  id: "qwen",
  name: "通义千问",
  QWEN_STORAGE_KEY,
  QWEN_API_KEY_STORAGE_KEY,
  defaultQwenSettings,
  normalizeQwenSettings,
  isQwenThinkingModel,
  getSettings: function () {
    return provider.loadSettings()
  },
  applySettings: function (settings) {
    return provider.saveSettings(settings)
  },
  getLogs: function () {
    return provider.getLogs()
  },
  clearLogs: function () {
    provider.clearLogs()
  },
  requestChat: function (options) {
    return provider.requestChat(options)
  },
  testConnection: function (overrideSettings) {
    return provider.testConnection(overrideSettings)
  }
}

// 兼容层：保持 window.QwenProvider 全局变量可用
window.QwenProvider = QwenProvider
