/**
 * @file llm/providers/deepseek-provider.ts
 * @module llm/providers/deepseek-provider
 * @description DeepSeek Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * @requires llm/core/llm-manager - LLM 管理器
 * @exports DeepSeekProvider - DeepSeek Provider
 */
"use strict"

import { LlmManager } from "../core/llm-manager"

const { createOpenAICompatibleProvider, utils } = LlmManager
const { clamp, toFiniteNumber, normalizeObject } = utils

const DEEPSEEK_STORAGE_KEY = "mobao_deepseek_settings_v2"
const DEEPSEEK_API_KEY_STORAGE_KEY = "mobao_deepseek_api_key_v1"

function defaultDeepSeekSettings(): any {
  return {
    provider: "deepseek",
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
    endpoint: "/api/deepseek/chat/completions",
    model: "deepseek-v4-flash",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

function normalizeEndpoint(raw: string, fallback: string): string {
  const input = typeof raw === "string" ? raw.trim() : ""
  if (!input) {
    return fallback
  }

  if (input.startsWith("/")) {
    return input.replace(/\/$/, "") || "/"
  }

  if (!/^https?:\/\//i.test(input)) {
    return fallback
  }

  try {
    const url = new URL(input)
    if (url.hostname === "api.deepseek.com" && url.pathname === "/chat/completions") {
      url.pathname = "/v1/chat/completions"
    }
    return url.toString().replace(/\/$/, "")
  } catch (_error) {
    return fallback
  }
}

function normalizeDeepSeekSettings(source: any, fallback?: any): any {
  const defaults = {
    ...defaultDeepSeekSettings(),
    ...normalizeObject(fallback)
  }
  const input = normalizeObject(source)

  const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
  const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
  const apiKeyRaw =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : String(defaults.apiKey || "")

  const endpoint = normalizeEndpoint(endpointRaw, defaults.endpoint)

  return {
    provider: "deepseek",
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
    endpoint,
    model: modelRaw.length > 0 ? modelRaw : defaults.model,
    apiKey: apiKeyRaw,
    timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
    temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1.5),
    maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
  }
}

function isDeepSeekThinkingModel(model: string): boolean {
  return /deepseek-(v4|reasoner)/i.test(model)
}

function isThinkingModel(model: string): boolean {
  return /deepseek-(v4|reasoner)|qwen.*think|glm.*z1|o1-|o3-/i.test(model)
}

function buildRequestBody(settings: any, context: any): any {
  const { isThinking, temperature } = context
  const isV4OrReasoner = isDeepSeekThinkingModel(settings.model)
  const body: any = {}

  if (isV4OrReasoner) {
    if (isThinking) {
      body.thinking = { type: "enabled" }
      body.reasoning_effort = "high"
    } else {
      body.thinking = { type: "disabled" }
      body.temperature = temperature
    }
  } else {
    body.temperature = temperature
  }

  if (isV4OrReasoner && isThinking && settings.thinkingParams) {
    try {
      const customParams = JSON.parse(settings.thinkingParams)
      if (customParams && typeof customParams === "object") {
        Object.assign(body, customParams)
      }
    } catch (_e) { /* ignore */ }
  }

  return body
}

const deepSeekProvider = createOpenAICompatibleProvider({
  id: "deepseek",
  name: "DeepSeek",
  description: "DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型",
  storageKey: DEEPSEEK_STORAGE_KEY,
  apiKeyStorageKey: DEEPSEEK_API_KEY_STORAGE_KEY,
  defaultSettings: defaultDeepSeekSettings,
  normalizeSettings: normalizeDeepSeekSettings,
  isThinkingModel: isThinkingModel,
  buildRequestBody: buildRequestBody,
  supportsFeature: function (feature: string): boolean {
    const supportedFeatures = ["thinking", "reasoning", "streaming"]
    return supportedFeatures.indexOf(feature) !== -1
  }
})

var provider = {
  ...deepSeekProvider,
  id: "deepseek",
  name: "DeepSeek",
  description: "DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型"
}
LlmManager.registerProvider(provider)

export const DeepSeekProvider = {
  id: "deepseek",
  name: "DeepSeek",
  DEEPSEEK_STORAGE_KEY,
  DEEPSEEK_API_KEY_STORAGE_KEY,
  defaultDeepSeekSettings,
  normalizeDeepSeekSettings,
  isDeepSeekThinkingModel,
  isThinkingModel,
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
