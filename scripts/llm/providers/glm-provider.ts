/**
 * @file llm/providers/glm-provider.ts
 * @module llm/providers/glm-provider
 * @description 智谱 GLM Provider 插件。基于 LlmManager 的 createOpenAICompatibleProvider 工厂
 *              创建，注册到 LlmManager 的 provider 体系中。
 *
 * @requires llm/core/llm-manager - LLM 管理器
 * @exports GlmProvider - 智谱 GLM Provider
 */
"use strict"

import { LlmManager, createNormalizeSettings } from "../core/llm-manager"
import type { ChatRequestOptions, ChatResult } from "../core/provider-factory"

const { createOpenAICompatibleProvider } = LlmManager

const GLM_STORAGE_KEY = "mobao_glm_settings_v1"
const GLM_API_KEY_STORAGE_KEY = "mobao_glm_api_key_v1"

function defaultGlmSettings(): Record<string, unknown> {
  return {
    provider: "glm",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    contextLength: 5,
    autoSummarizeEnabled: true,
    reflectionScope: "current",
    thinkingEnabled: false,
    thinkingParams: "",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048
  }
}

const normalizeGlmSettings = createNormalizeSettings({
  providerId: "glm",
  defaultSettings: defaultGlmSettings,
  temperatureMax: 1
})

function isGlmThinkingModel(model: string): boolean {
  return /glm.*z1|glm.*think/i.test(model)
}

function buildRequestBody(
  settings: Record<string, unknown>,
  context: { isThinking: boolean; temperature: number }
): Record<string, unknown> {
  const { isThinking, temperature } = context
  const isGlmThinkingModelName = isGlmThinkingModel(settings.model as string)
  const body: Record<string, unknown> = {}

  if (isThinking && isGlmThinkingModelName) {
    body.enable_thinking = true
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

const glmProvider = createOpenAICompatibleProvider({
  id: "glm",
  name: "智谱GLM",
  description: "智谱AI GLM系列，支持 glm-4、glm-4-flash、glm-z1 等模型",
  storageKey: GLM_STORAGE_KEY,
  apiKeyStorageKey: GLM_API_KEY_STORAGE_KEY,
  defaultSettings: defaultGlmSettings,
  normalizeSettings: normalizeGlmSettings,
  isThinkingModel: isGlmThinkingModel,
  buildRequestBody: buildRequestBody,
  supportsFeature: function (feature: string): boolean {
    const supportedFeatures = ["streaming"]
    return supportedFeatures.indexOf(feature) !== -1
  }
})

var provider = {
  ...glmProvider,
  id: "glm",
  name: "智谱GLM",
  description: "智谱AI GLM系列，支持 glm-4、glm-4-flash、glm-z1 等模型"
}
LlmManager.registerProvider(provider)

export const GlmProvider = {
  id: "glm",
  name: "智谱GLM",
  GLM_STORAGE_KEY,
  GLM_API_KEY_STORAGE_KEY,
  defaultGlmSettings,
  normalizeGlmSettings,
  isGlmThinkingModel,
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
