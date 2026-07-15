/**
 * @file llm/providers/kimi-provider.ts
 * @module llm/providers/kimi-provider
 * @description Moonshot Kimi Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * @requires llm/core/llm-manager - LLM 管理器
 * @exports KimiProvider - Kimi Provider
 */
"use strict"

import { LlmManager, createNormalizeSettings } from "../core/llm-manager"
import type { ChatRequestOptions, ChatResult } from "../core/provider-factory"

const { createOpenAICompatibleProvider } = LlmManager

const KIMI_STORAGE_KEY = "mobao_kimi_settings_v1"
const KIMI_API_KEY_STORAGE_KEY = "mobao_kimi_api_key_v1"

function defaultKimiSettings(): Record<string, unknown> {
  return {
    provider: "kimi",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    contextLength: 5,
    autoSummarizeEnabled: true,
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

const normalizeKimiSettings = createNormalizeSettings({
  providerId: "kimi",
  defaultSettings: defaultKimiSettings,
  temperatureMax: 1
})

const kimiProvider = createOpenAICompatibleProvider({
  id: "kimi",
  name: "Kimi",
  description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型",
  storageKey: KIMI_STORAGE_KEY,
  apiKeyStorageKey: KIMI_API_KEY_STORAGE_KEY,
  defaultSettings: defaultKimiSettings,
  normalizeSettings: normalizeKimiSettings,
  isThinkingModel: function (_model: string): boolean {
    return false
  },
  buildRequestBody: function (
    settings: Record<string, unknown>,
    context: { isThinking: boolean; temperature: number }
  ): Record<string, unknown> {
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
LlmManager.registerProvider(provider)

export const KimiProvider = {
  id: "kimi",
  name: "Kimi",
  KIMI_STORAGE_KEY,
  KIMI_API_KEY_STORAGE_KEY,
  defaultKimiSettings,
  normalizeKimiSettings,
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
