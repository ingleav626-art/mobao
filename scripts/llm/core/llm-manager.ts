/**
 * @file llm/core/llm-manager.ts
 * @module llm/core/llm-manager
 * @description LLM 多 Provider 管理器（薄入口）。负责 Provider 注册表管理和自定义 Provider 持久化。
 *              从 llm-manager.ts 拆分而来，工具函数在 manager-utils.ts，工厂函数在 provider-factory.ts。
 *
 * @exports LlmManager - LLM 管理器对象（对象字面量单例）
 */
import type { CustomProvider } from "../../../types/llm"
import {
  LLM_MANAGER_STORAGE_KEY,
  CUSTOM_PROVIDERS_STORAGE_KEY,
  normalizeObject,
  parseJsonSafely,
  compactText,
  clamp,
  toFiniteNumber,
  maskApiKey,
  isProxyEndpoint,
  extractErrorMessage,
  loadStoredApiKey,
  saveStoredApiKey
} from "./manager-utils"
import { createBaseProvider, createOpenAICompatibleProvider, createNormalizeSettings } from "./provider-factory"

// re-export 工具函数和工厂（保持向后兼容）
export {
  clamp,
  toFiniteNumber,
  normalizeObject,
  parseJsonSafely,
  compactText,
  maskApiKey,
  isProxyEndpoint,
  extractErrorMessage,
  normalizeUsage,
  broadcastToTokenMonitor,
  loadStoredApiKey,
  saveStoredApiKey,
  LLM_MANAGER_STORAGE_KEY,
  CUSTOM_PROVIDERS_STORAGE_KEY,
  MAX_LOG_ENTRIES
} from "./manager-utils"

export { createBaseProvider, createOpenAICompatibleProvider, createNormalizeSettings } from "./provider-factory"
export type { NormalizeSettingsConfig } from "./provider-factory"

export type { UsageInput, NormalizedUsage } from "./manager-utils"

const providers: Map<string, any> = new Map()
let activeProviderId: string | null = null

function loadManagerSettings(): any {
  try {
    const raw = window.localStorage.getItem(LLM_MANAGER_STORAGE_KEY)
    if (!raw) {
      return { activeProviderId: null }
    }
    const parsed = parseJsonSafely(raw)
    return parsed && typeof parsed === "object" ? parsed : { activeProviderId: null }
  } catch (_error) {
    return { activeProviderId: null }
  }
}

function saveManagerSettings(settings: any): void {
  try {
    window.localStorage.setItem(LLM_MANAGER_STORAGE_KEY, JSON.stringify(settings))
  } catch (_error) {}
}

/** 自定义 Provider 的 endpoint 归一化：验证 URL 协议，无效协议回退到默认值 */
function normalizeCustomEndpoint(raw: string, fallback: string): string {
  const input = typeof raw === "string" ? raw.trim() : ""
  if (!input) {
    return fallback
  }
  if (input.startsWith("/")) {
    return input.replace(/\/$/, "") || "/"
  }
  if (/^https?:\/\//i.test(input)) {
    return input.replace(/\/$/, "")
  }
  // 无效协议（如缺少 ://），回退到默认
  return fallback || input
}

function loadCustomProviders(): CustomProvider[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = parseJsonSafely(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_error) {
    return []
  }
}

function saveCustomProviders(list: CustomProvider[]): void {
  try {
    window.localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(list))
  } catch (_error) {}
}

function registerProvider(provider: any): void {
  if (!provider || typeof provider !== "object") {
    throw new Error("Provider must be an object")
  }
  if (!provider.id || typeof provider.id !== "string") {
    throw new Error("Provider must have a string id")
  }
  if (typeof provider.requestChat !== "function") {
    throw new Error("Provider must implement requestChat method")
  }

  providers.set(provider.id, {
    id: provider.id,
    name: provider.name || provider.id,
    description: provider.description || "",
    defaultSettings:
      provider.defaultSettings ||
      function () {
        return {}
      },
    normalizeSettings:
      provider.normalizeSettings ||
      function (s: unknown) {
        return (s as Record<string, unknown>) || {}
      },
    loadSettings:
      provider.loadSettings ||
      (() => {
        return provider.defaultSettings ? provider.defaultSettings() : {}
      }),
    saveSettings: provider.saveSettings || function () {},
    requestChat: provider.requestChat,
    testConnection: provider.testConnection || defaultTestConnection,
    getSettings:
      provider.getSettings ||
      function () {
        return {}
      },
    applySettings:
      provider.applySettings ||
      function (s: any) {
        return s
      },
    getLogs:
      provider.getLogs ||
      function () {
        return []
      },
    clearLogs: provider.clearLogs || function () {},
    isThinkingModel:
      provider.isThinkingModel ||
      function (_model: string) {
        return false
      },
    supportsFeature:
      provider.supportsFeature ||
      function (_feature: string) {
        return false
      }
  })

  if (activeProviderId === null) {
    const managerSettings = loadManagerSettings()
    if (managerSettings.activeProviderId && providers.has(managerSettings.activeProviderId)) {
      activeProviderId = managerSettings.activeProviderId
    } else if (providers.size === 1) {
      activeProviderId = provider.id
    }
  }
}

function unregisterProvider(providerId: string): boolean {
  if (!providers.has(providerId)) {
    return false
  }
  providers.delete(providerId)
  if (activeProviderId === providerId) {
    activeProviderId = providers.size > 0 ? (providers.keys().next().value as string | undefined) || null : null
  }
  return true
}

function getProvider(providerId?: string): any {
  if (providerId) {
    const p = providers.get(providerId) || null
    console.log("[LlmManager.getProvider] by id:", providerId, "result:", p ? p.id : null)
    return p
  }
  const p = providers.get(activeProviderId!) || null
  console.log("[LlmManager.getProvider] activeProviderId:", activeProviderId, "result:", p ? p.id : null)
  return p
}

function getActiveProviderId(): string | null {
  return activeProviderId
}

function setActiveProvider(providerId: string): boolean {
  console.log("[LlmManager.setActiveProvider] providerId:", providerId, "exists:", providers.has(providerId))
  if (!providers.has(providerId)) {
    return false
  }
  activeProviderId = providerId
  saveManagerSettings({ activeProviderId })
  console.log("[LlmManager.setActiveProvider] success, activeProviderId:", activeProviderId)
  return true
}

function listProviders(): Array<{ id: string; name: string; description: string }> {
  return Array.from(providers.values()).map(function (p) {
    return {
      id: p.id,
      name: p.name,
      description: p.description
    }
  })
}

async function defaultTestConnection(overrideSettings?: any): Promise<any> {
  const provider = getProvider()
  if (!provider) {
    return {
      ok: false,
      error: "没有可用的LLM Provider",
      code: "NO_PROVIDER"
    }
  }
  const result = await provider.requestChat({
    settings: overrideSettings,
    temperature: 0,
    maxTokens: 64,
    messages: [
      { role: "system", content: "你是接口连通性测试助手。收到请求后请只回复四个字：连接成功。" },
      { role: "user", content: "请仅回复：连接成功" }
    ]
  })
  if (!result.ok) {
    return result
  }
  return {
    ...result,
    message: compactText(result.content || "连接成功", 80)
  }
}

async function requestChat(options: any): Promise<any> {
  const provider = getProvider()
  if (!provider) {
    return {
      ok: false,
      error: "没有可用的LLM Provider，请先注册Provider。",
      code: "NO_PROVIDER",
      stage: "validate"
    }
  }
  return provider.requestChat(options)
}

async function testConnection(providerId: string, overrideSettings?: any): Promise<any> {
  const provider = getProvider(providerId)
  if (!provider) {
    return {
      ok: false,
      error: "指定的Provider不存在",
      code: "PROVIDER_NOT_FOUND"
    }
  }
  return provider.testConnection(overrideSettings)
}

export const LlmManager = {
  registerProvider,
  unregisterProvider,
  getProvider,
  getActiveProviderId,
  setActiveProvider,
  listProviders,
  requestChat,
  testConnection,
  createBaseProvider,
  createOpenAICompatibleProvider,
  loadCustomProviders,
  saveCustomProviders,
  createDynamicProvider: function (config: any): any {
    console.log("[createDynamicProvider] config:", config)
    const providerId = config.id || `custom_${Date.now()}`
    console.log("[createDynamicProvider] providerId:", providerId)

    function defaultSettingsFn() {
      return {
        provider: providerId,
        enabled: false,
        multiGameMemoryEnabled: false,
        reflectionEnabled: false,
        contextLength: 5,
        autoSummarizeEnabled: true,
        reflectionScope: "current",
        thinkingEnabled: false,
        thinkingParams: "",
        endpoint: config.endpoint || "",
        model: config.model || "",
        apiKey: "",
        timeoutMs: 40000,
        temperature: 0.2,
        maxTokens: 2048
      }
    }

    const provider = createOpenAICompatibleProvider({
      id: providerId,
      name: config.name || providerId,
      description: config.description || "用户自定义模型",
      storageKey: `mobao_${providerId}_settings_v1`,
      apiKeyStorageKey: `mobao_${providerId}_api_key_v1`,
      defaultSettings: defaultSettingsFn,
      normalizeSettings: createNormalizeSettings({
        providerId: providerId,
        defaultSettings: defaultSettingsFn,
        temperatureMax: 2,
        includeIndependentReflection: true,
        normalizeEndpoint: normalizeCustomEndpoint
      }),
      isThinkingModel: function (_model: string) {
        return false
      },
      buildRequestBody: function (settings: any, context: any) {
        return { temperature: context.temperature }
      },
      supportsFeature: function (_feature: string) {
        return false
      }
    })

    registerProvider(provider)

    const customList = loadCustomProviders()
    const existingIndex = customList.findIndex(function (p: CustomProvider) {
      return p.id === providerId
    })
    const providerInfo: CustomProvider = {
      id: providerId,
      name: config.name || providerId,
      description: config.description || ""
    }
    if (existingIndex >= 0) {
      customList[existingIndex] = providerInfo
    } else {
      customList.push(providerInfo)
    }
    saveCustomProviders(customList)

    return provider
  },
  deleteDynamicProvider: function (providerId: string): boolean {
    if (providers.has(providerId)) {
      providers.delete(providerId)
    }
    const customList = loadCustomProviders()
    const filtered = customList.filter(function (p: CustomProvider) {
      return p.id !== providerId
    })
    saveCustomProviders(filtered)
    if (activeProviderId === providerId) {
      activeProviderId = providers.size > 0 ? (providers.keys().next().value as string | undefined) || null : null
      saveManagerSettings({ activeProviderId })
    }
    try {
      window.localStorage.removeItem(`mobao_${providerId}_settings_v1`)
      window.localStorage.removeItem(`mobao_${providerId}_api_key_v1`)
    } catch (_error) {}
    return true
  },
  initializeCustomProviders: function (): void {
    const customList = loadCustomProviders()
    customList.forEach(function (cfg: CustomProvider) {
      if (!providers.has(String(cfg.id))) {
        function defaultSettingsFn() {
          return {
            provider: cfg.id,
            enabled: false,
            multiGameMemoryEnabled: false,
            reflectionEnabled: false,
            contextLength: 5,
            autoSummarizeEnabled: true,
            reflectionScope: "current",
            thinkingEnabled: false,
            thinkingParams: "",
            endpoint: "",
            model: "",
            apiKey: "",
            timeoutMs: 40000,
            temperature: 0.2,
            maxTokens: 2048
          }
        }

        const provider = createOpenAICompatibleProvider({
          id: cfg.id,
          name: cfg.name,
          description: cfg.description || "",
          storageKey: `mobao_${cfg.id}_settings_v1`,
          apiKeyStorageKey: `mobao_${cfg.id}_api_key_v1`,
          defaultSettings: defaultSettingsFn,
          normalizeSettings: createNormalizeSettings({
            providerId: cfg.id,
            defaultSettings: defaultSettingsFn,
            temperatureMax: 2,
            includeIndependentReflection: true,
            normalizeEndpoint: normalizeCustomEndpoint
          }),
          isThinkingModel: function (_model: string) {
            return false
          },
          buildRequestBody: function (settings: any, context: any) {
            return { temperature: context.temperature }
          },
          supportsFeature: function (_feature: string) {
            return false
          }
        })
        registerProvider(provider)
      }
    })

    const managerSettings = loadManagerSettings()
    console.log("[LlmManager.init] managerSettings:", managerSettings)
    console.log("[LlmManager.init] available providers:", Array.from(providers.keys()))
    if (managerSettings.activeProviderId && providers.has(managerSettings.activeProviderId)) {
      activeProviderId = managerSettings.activeProviderId
      console.log("[LlmManager.init] set activeProviderId from storage:", activeProviderId)
    } else if (providers.size > 0) {
      activeProviderId = (providers.keys().next().value as string | undefined) || null
      console.log("[LlmManager.init] set activeProviderId to first provider:", activeProviderId)
    } else {
      console.log("[LlmManager.init] no providers available")
    }
  },
  utils: {
    clamp,
    toFiniteNumber,
    normalizeObject,
    parseJsonSafely,
    compactText,
    maskApiKey,
    isProxyEndpoint,
    extractErrorMessage,
    loadStoredApiKey,
    saveStoredApiKey
  }
}
