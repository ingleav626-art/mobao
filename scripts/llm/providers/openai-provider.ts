/**
 * @file llm/providers/openai-provider.ts
 * @module llm/providers/openai-provider
 * @description OpenAI Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * @requires llm/core/llm-manager - LLM 管理器
 * @exports OpenAIProvider - OpenAI Provider
 */
"use strict"

import { LlmManager, createNormalizeSettings } from "../core/llm-manager"
import type { ChatRequestOptions, ChatResult } from "../core/provider-factory"

const { createOpenAICompatibleProvider } = LlmManager

const OPENAI_STORAGE_KEY = "mobao_openai_settings_v1"
const OPENAI_API_KEY_STORAGE_KEY = "mobao_openai_api_key_v1"

function defaultOpenAISettings(): Record<string, unknown> {
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

const normalizeOpenAISettings = createNormalizeSettings({
  providerId: "openai",
  defaultSettings: defaultOpenAISettings,
  temperatureMax: 2,
  includeIndependentReflection: true
})

function isOpenAIThinkingModel(model: string): boolean {
  return /o1-|o3-/i.test(model)
}

function buildRequestBody(
  settings: Record<string, unknown>,
  context: { isThinking: boolean; temperature: number }
): Record<string, unknown> {
  const { isThinking, temperature } = context
  const isOpenAIThinkingModelName = isOpenAIThinkingModel(settings.model as string)
  const body: Record<string, unknown> = {}

  if (isThinking && isOpenAIThinkingModelName) {
    body.reasoning_effort = "medium"
  } else {
    body.temperature = temperature
  }

  if (isThinking && (settings.thinkingParams as string)) {
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
LlmManager.registerProvider(provider)

export const OpenAIProvider = {
  id: "openai",
  name: "OpenAI",
  OPENAI_STORAGE_KEY,
  OPENAI_API_KEY_STORAGE_KEY,
  defaultOpenAISettings,
  normalizeOpenAISettings,
  isOpenAIThinkingModel,
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
