/**
 * @file llm/providers/openai-provider.ts
 * @module llm/providers/openai-provider
 * @description OpenAI Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 */
"use strict"

if (!(window as any).LlmManager) {
  console.error("LlmManager not loaded. Please load llm-manager.js first.")
}

const { createOpenAICompatibleProvider, utils } = (window as any).LlmManager
const { clamp, toFiniteNumber, normalizeObject } = utils

const OPENAI_STORAGE_KEY = "mobao_openai_settings_v1"
const OPENAI_API_KEY_STORAGE_KEY = "mobao_openai_api_key_v1"

function defaultOpenAISettings(): any {
  return {
    provider: "openai",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    contextLength: 5,
    autoSummarizeEnabled: true,
    reflectionScope: "current",
    thinkingEnabled: false,
    thinkingParams: "",
    independentModelEnabled: false,
    independentReflectionEnabled: true,
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

function normalizeOpenAISettings(source: any, fallback?: any): any {
  const defaults = {
    ...defaultOpenAISettings(),
    ...normalizeObject(fallback)
  }
  const input = normalizeObject(source)

  const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
  const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
  const apiKeyRaw =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : String(defaults.apiKey || "")

  return {
    provider: "openai",
    enabled: Boolean(input.enabled),
    multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
    reflectionEnabled: Boolean(input.reflectionEnabled),
    contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
    autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
    reflectionScope: input.reflectionScope === "full" ? "full" : "current",
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
    maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
  }
}

function isOpenAIThinkingModel(model: string): boolean {
  return /o1-|o3-/i.test(model)
}

function buildRequestBody(settings: any, context: any): any {
  const { isThinking, temperature } = context
  const isOpenAIThinkingModelName = isOpenAIThinkingModel(settings.model)
  const body: any = {}

  if (isThinking && isOpenAIThinkingModelName) {
    body.reasoning_effort = "medium"
  } else {
    body.temperature = temperature
  }

  if (isThinking && settings.thinkingParams) {
    try {
      const customParams = JSON.parse(settings.thinkingParams)
      if (customParams && typeof customParams === "object") {
        Object.assign(body, customParams)
      }
    } catch (_e) { /* ignore */ }
  }

  return body
}

const openAIProvider = createOpenAICompatibleProvider({
  id: "openai",
  name: "OpenAI",
  description: "OpenAI GPT 系列模型，支持 GPT-4o、GPT-3.5 等",
  storageKey: OPENAI_STORAGE_KEY,
  apiKeyStorageKey: OPENAI_API_KEY_STORAGE_KEY,
  defaultSettings: defaultOpenAISettings,
  normalizeSettings: normalizeOpenAISettings,
  isThinkingModel: isOpenAIThinkingModel,
  buildRequestBody: buildRequestBody,
  supportsFeature: function (feature: string): boolean {
    const supportedFeatures = ["streaming", "vision"]
    return supportedFeatures.indexOf(feature) !== -1
  }
})

var provider = {
  ...openAIProvider,
  id: "openai",
  name: "OpenAI",
  description: "OpenAI GPT 系列模型，支持 GPT-4o、GPT-3.5 等"
}
  ; (window as any).LlmManager.registerProvider(provider)

export const OpenAIProvider = {
  id: "openai",
  name: "OpenAI",
  OPENAI_STORAGE_KEY,
  OPENAI_API_KEY_STORAGE_KEY,
  defaultOpenAISettings,
  normalizeOpenAISettings,
  isOpenAIThinkingModel,
  getSettings: function (): any {
    return provider.loadSettings()
  },
  applySettings: function (settings: any): any {
    return provider.saveSettings(settings)
  },
  getLogs: function (): any[] {
    return provider.getLogs()
  },
  clearLogs: function (): void {
    provider.clearLogs()
  },
  requestChat: function (options: any): Promise<any> {
    return provider.requestChat(options)
  },
  testConnection: function (overrideSettings?: any): Promise<any> {
    return provider.testConnection(overrideSettings)
  }
}
