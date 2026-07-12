/**
 * @file llm/providers/qwen-provider.ts
 * @module llm/providers/qwen-provider
 * @description 通义千问 Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * @requires llm/core/llm-manager - LLM 管理器
 * @exports QwenProvider - 通义千问 Provider
 */
"use strict"

import { LlmManager, createNormalizeSettings } from "../core/llm-manager"

const { createOpenAICompatibleProvider } = LlmManager

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

const normalizeQwenSettings = createNormalizeSettings({
  providerId: "qwen",
  defaultSettings: defaultQwenSettings,
  temperatureMax: 2,
  includeIndependentReflection: true
})

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
    } catch (_e) {
      /* ignore */
    }
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
LlmManager.registerProvider(provider)

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
