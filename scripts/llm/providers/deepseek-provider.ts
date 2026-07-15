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

import { LlmManager, createNormalizeSettings } from "../core/llm-manager"
import type { ChatRequestOptions, ChatResult } from "../core/provider-factory"

const { createOpenAICompatibleProvider } = LlmManager

const DEEPSEEK_STORAGE_KEY = "mobao_deepseek_settings_v2"
const DEEPSEEK_API_KEY_STORAGE_KEY = "mobao_deepseek_api_key_v1"

function defaultDeepSeekSettings(): Record<string, unknown> {
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

const normalizeDeepSeekSettings = createNormalizeSettings({
  providerId: "deepseek",
  defaultSettings: defaultDeepSeekSettings,
  temperatureMax: 1.5,
  includeIndependentReflection: true,
  normalizeEndpoint: normalizeEndpoint
})

function isDeepSeekThinkingModel(model: string): boolean {
  return /deepseek-(v4|reasoner)/i.test(model)
}

function isThinkingModel(model: string): boolean {
  return /deepseek-(v4|reasoner)|qwen.*think|glm.*z1|o1-|o3-/i.test(model)
}

function buildRequestBody(
  settings: Record<string, unknown>,
  context: { isThinking: boolean; temperature: number }
): Record<string, unknown> {
  const { isThinking, temperature } = context
  const isV4OrReasoner = isDeepSeekThinkingModel(settings.model as string)
  const body: Record<string, unknown> = {}

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

  if (isV4OrReasoner && isThinking && (settings.thinkingParams as string)) {
    try {
      const customParams = JSON.parse(settings.thinkingParams as string)
      if (customParams && typeof customParams === "object") {
        Object.assign(body, customParams)
      }
    } catch (_e) {
      /* ignore */
    }
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
  getSettings: function (): Record<string, unknown> {
    return provider.loadSettings()
  },
  applySettings: function (settings: Record<string, unknown>): Record<string, unknown> {
    return provider.saveSettings(settings)
  },
  getLogs: function (): Array<Record<string, unknown>> {
    return provider.getLogs()
  },
  clearLogs: function (): void {
    provider.clearLogs()
  },
  requestChat: function (options: ChatRequestOptions): Promise<ChatResult> {
    return provider.requestChat(options)
  },
  testConnection: function (overrideSettings?: Record<string, unknown>): Promise<ChatResult> {
    return provider.testConnection(overrideSettings)
  }
}
