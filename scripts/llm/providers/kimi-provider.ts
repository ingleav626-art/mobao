/**
 * @file llm/providers/kimi-provider.ts
 * @module llm/providers/kimi-provider
 * @description Moonshot Kimi Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 */
"use strict"

if (!(window as any).LlmManager) {
  console.error("LlmManager not loaded. Please load llm-manager.js first.")
}

const { createOpenAICompatibleProvider, utils } = (window as any).LlmManager
const { clamp, toFiniteNumber, normalizeObject } = utils

const KIMI_STORAGE_KEY = "mobao_kimi_settings_v1"
const KIMI_API_KEY_STORAGE_KEY = "mobao_kimi_api_key_v1"

function defaultKimiSettings(): any {
  return {
    provider: "kimi",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    contextLength: 5,
    summaryInterval: 0,
    reflectionScope: "current",
    thinkingEnabled: false,
    thinkingParams: "",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

function normalizeKimiSettings(source: any, fallback?: any): any {
  const defaults = {
    ...defaultKimiSettings(),
    ...normalizeObject(fallback)
  }
  const input = normalizeObject(source)

  const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
  const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
  const apiKeyRaw =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : String(defaults.apiKey || "")

  return {
    provider: "kimi",
    enabled: Boolean(input.enabled),
    multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
    reflectionEnabled: Boolean(input.reflectionEnabled),
    contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
    summaryInterval: Math.max(0, Math.min(50, Math.round(Number(input.summaryInterval) || 0))),
    reflectionScope: input.reflectionScope === "full" ? "full" : "current",
    thinkingEnabled: Boolean(input.thinkingEnabled),
    independentModelEnabled: Boolean(input.independentModelEnabled),
    thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
    endpoint: endpointRaw || defaults.endpoint,
    model: modelRaw.length > 0 ? modelRaw : defaults.model,
    apiKey: apiKeyRaw,
    timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
    temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1),
    maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 102400)
  }
}

const kimiProvider = createOpenAICompatibleProvider({
  id: "kimi",
  name: "Kimi",
  description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型",
  storageKey: KIMI_STORAGE_KEY,
  apiKeyStorageKey: KIMI_API_KEY_STORAGE_KEY,
  defaultSettings: defaultKimiSettings,
  normalizeSettings: normalizeKimiSettings,
  isThinkingModel: function (model: string): boolean {
    return false
  },
  buildRequestBody: function (settings: any, context: any): any {
    return { temperature: context.temperature }
  },
  supportsFeature: function (feature: string): boolean {
    const supportedFeatures = ["streaming"]
    return supportedFeatures.indexOf(feature) !== -1
  }
})

var provider = {
  ...kimiProvider,
  id: "kimi",
  name: "Kimi",
  description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型"
}
  ; (window as any).LlmManager.registerProvider(provider)

export const KimiProvider = {
  id: "kimi",
  name: "Kimi",
  KIMI_STORAGE_KEY,
  KIMI_API_KEY_STORAGE_KEY,
  defaultKimiSettings,
  normalizeKimiSettings,
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
  ; (window as any).KimiProvider = KimiProvider
