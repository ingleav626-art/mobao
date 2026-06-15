/**
 * @file llm/providers/qwen-provider.ts
 * @module llm/providers/qwen-provider
 * @description 通义千问 Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 */
"use strict"

import { LlmManager } from "../core/llm-manager"

const { createOpenAICompatibleProvider, utils } = LlmManager
const { clamp, toFiniteNumber, normalizeObject } = utils

const QWEN_STORAGE_KEY = "mobao_qwen_settings_v1"
const QWEN_API_KEY_STORAGE_KEY = "mobao_qwen_api_key_v1"

function defaultQwenSettings(): any {
  return {
    provider: "qwen",
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
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-turbo",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

function normalizeQwenSettings(source: any, fallback?: any): any {
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

function isQwenThinkingModel(model: string): boolean {
  return /qwen.*think|qwen.*reasoning/i.test(model)
}

function buildRequestBody(settings: any, context: any): any {
  const { isThinking, temperature } = context
  const isQwenThinkingModelName = isQwenThinkingModel(settings.model)
  const body: any = {}

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
    } catch (_e) { /* ignore */ }
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
  supportsFeature: function (feature: string): boolean {
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
