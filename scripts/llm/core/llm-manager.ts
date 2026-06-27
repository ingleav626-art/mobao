/**
 * @file llm/core/llm-manager.ts
 * @module llm/core/llm-manager
 * @description LLM 多 Provider 管理器。采用 IIFE 模式，挂载到 window.LlmManager。
 *              统一管理多个 LLM Provider（DeepSeek/OpenAI/Qwen/GLM/Kimi/自定义），
 *              提供注册、切换、请求转发、Token 监控和自定义 Provider 持久化。
 *
 * 核心架构：
 *   - Provider 注册表（providers: Map<string, Provider>）
 *   - 活跃 Provider 切换（activeProviderId）
 *   - 统一请求接口（requestChat → 活跃 Provider.chat）
 *   - 连接测试（testConnection → 活跃 Provider.testConnection）
 *
 * 工厂函数：
 *   - createBaseProvider(config): 创建基础 Provider（含 chat/testConnection/设置管理）
 *   - createOpenAICompatibleProvider(config): 创建 OpenAI 兼容 Provider
 *     所有内置 Provider 均基于此工厂创建，只需提供 id/name/endpoint/model/storageKey 等
 *   - createDynamicProvider(config): 运行时创建自定义 Provider
 *
 * 工具函数（utils）：
 *   - clamp, toFiniteNumber, normalizeObject: 值规范化
 *   - normalizeUsage: Token 用量标准化（兼容各厂商格式差异）
 *   - broadcastToTokenMonitor: Token 监控广播（CustomEvent）
 *
 * 自定义 Provider 持久化：
 *   - loadCustomProviders() / saveCustomProviders(): localStorage 持久化
 *   - 存储键: mobao_custom_providers_v1
 *
 * 日志系统：
 *   - MAX_LOG_ENTRIES=120，循环覆盖
 *
 * @requires localStorage - 设置持久化
 *
 * @exports window.LlmManager
 *   {
 *     registerProvider, unregisterProvider, getProvider, getActiveProviderId,
 *     setActiveProvider, listProviders, requestChat, testConnection,
 *     createBaseProvider, createOpenAICompatibleProvider,
 *   }
 * @exports LlmManager - LLM 管理器对象
 */
"use strict"

import type { CustomProvider } from '../../../types/llm'

const LLM_MANAGER_STORAGE_KEY = "mobao_llm_manager_v1"
const CUSTOM_PROVIDERS_STORAGE_KEY = "mobao_custom_providers_v1"
const MAX_LOG_ENTRIES = 120

const providers: Map<string, any> = new Map()
let activeProviderId: string | null = null

interface UsageInput {
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  cached_tokens?: number
  prompt_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

interface NormalizedUsage {
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cached_tokens: number
}

function normalizeUsage(usage: UsageInput | null | undefined): NormalizedUsage | null {
  if (!usage || typeof usage !== "object") return null
  const result: NormalizedUsage = {
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    reasoning_tokens: 0,
    cached_tokens: 0
  }
  result.completion_tokens = usage.completion_tokens || 0
  result.total_tokens = usage.total_tokens || 0
  if (typeof usage.prompt_cache_hit_tokens === "number") {
    result.prompt_cache_hit_tokens = usage.prompt_cache_hit_tokens
  }
  if (typeof usage.prompt_cache_miss_tokens === "number") {
    result.prompt_cache_miss_tokens = usage.prompt_cache_miss_tokens
  }
  if (typeof usage.prompt_tokens === "number") {
    const cached = usage.prompt_tokens_details?.cached_tokens || usage.cached_tokens || 0
    result.prompt_cache_hit_tokens = cached
    result.prompt_cache_miss_tokens = usage.prompt_tokens - cached
  }
  if (typeof usage.reasoning_tokens === "number") {
    result.reasoning_tokens = usage.reasoning_tokens
  }
  if (typeof usage.cached_tokens === "number" && result.prompt_cache_hit_tokens === 0) {
    result.prompt_cache_hit_tokens = usage.cached_tokens
  }
  return result
}

function broadcastToTokenMonitor(result: any, options: any): void {
  const callSource = options?._playerId ? `player:${options._playerId}` : "unknown"
  console.log(`[TokenMonitor] broadcast called from ${callSource}, ok:${result.ok}, elapsed:${result.elapsedMs}ms`)
  try {
    const normalizedUsage = normalizeUsage(result.usage)
    const payload = {
      type: "llm-request",
      payload: {
        ok: result.ok,
        model: result.model || "",
        elapsedMs: result.elapsedMs || 0,
        usage: normalizedUsage,
        rawUsage: result.usage,
        code: result.code || null,
        requestId: result.requestId || null,
        promptTokens: normalizedUsage
          ? normalizedUsage.prompt_cache_hit_tokens + normalizedUsage.prompt_cache_miss_tokens
          : 0,
        timestamp: Date.now(),
        playerId: options?._playerId || null,
        playerName: options?._playerName || null,
        source: "llm-manager"
      }
    }
    if ((window as any).BroadcastChannel) {
      const channel = new BroadcastChannel("llm-token-monitor")
      channel.postMessage(payload)
      channel.close()
    }
    localStorage.setItem("llm-token-monitor-live", JSON.stringify(payload))
    console.log(`[TokenMonitor] data sent, requestId:${result.requestId}`)
  } catch (e) {
    console.error("[TokenMonitor] broadcast error:", e)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toFiniteNumber(value: any, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function parseJsonSafely(text: any): any {
  if (typeof text !== "string" || text.length === 0) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

function compactText(value: any, maxLength: number): string {
  const input = typeof value === "string" ? value.trim() : ""
  if (input.length <= maxLength) {
    return input
  }
  return `${input.slice(0, maxLength)}...`
}

function maskApiKey(value: any): string {
  const key = typeof value === "string" ? value.trim() : ""
  if (!key) {
    return "(empty)"
  }
  if (key.length <= 8) {
    return "*".repeat(key.length)
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function isProxyEndpoint(endpoint: any): boolean {
  const value = typeof endpoint === "string" ? endpoint.trim() : ""
  if (!value) {
    return false
  }
  if (value.startsWith("/")) {
    return true
  }
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin
  } catch (_error) {
    return false
  }
}

function extractErrorMessage(payload: any, fallbackStatus: number): string {
  if (payload && typeof payload === "object") {
    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message
    }
    if (typeof payload.message === "string") {
      return payload.message
    }
  }
  return `请求失败（HTTP ${fallbackStatus}）`
}

function loadStoredApiKey(providerId: string): string {
  try {
    const value = window.localStorage.getItem(`mobao_${providerId}_api_key_v1`)
    return typeof value === "string" ? value.trim() : ""
  } catch (_error) {
    return ""
  }
}

function saveStoredApiKey(providerId: string, value: any): void {
  const normalized = typeof value === "string" ? value.trim() : ""
  try {
    if (normalized) {
      window.localStorage.setItem(`mobao_${providerId}_api_key_v1`, normalized)
    } else {
      window.localStorage.removeItem(`mobao_${providerId}_api_key_v1`)
    }
  } catch (_error) { }
}

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
  } catch (_error) { }
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
  } catch (_error) { }
}

/**
 * 注册LLM Provider到管理器
 * @param {Object} provider - Provider实例，必须包含id和requestChat方法
 * @returns {void}
 * @throws {Error} Provider格式不正确时抛出异常
 */
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
    saveSettings: provider.saveSettings || function () { },
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
    clearLogs: provider.clearLogs || function () { },
    isThinkingModel:
      provider.isThinkingModel ||
      function (model: string) {
        return false
      },
    supportsFeature:
      provider.supportsFeature ||
      function (feature: string) {
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

/**
 * 注销LLM Provider
 * @param {string} providerId - Provider ID
 * @returns {boolean} 注销成功返回true，Provider不存在返回false
 */
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

/**
 * 获取LLM Provider实例
 * @param {string} [providerId] - Provider ID（不传则返回当前活跃的Provider）
 * @returns {Object|null} Provider实例，不存在返回null
 */
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

/**
 * 设置当前活跃的LLM Provider
 * @param {string} providerId - Provider ID
 * @returns {boolean} 设置成功返回true，Provider不存在返回false
 */
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

/**
 * 测试指定LLM Provider的连接
 * @param {string} providerId - Provider ID
 * @param {Object} [overrideSettings] - 覆盖的设置参数
 * @returns {Promise<Object>} 测试结果 { ok, message?, error? }
 */
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

/**
 * 创建基础LLM Provider（含chat/testConnection/设置管理）
 * @param {Object} config - Provider配置
 * @param {string} config.id - Provider唯一ID
 * @param {string} config.name - 显示名称
 * @param {string} [config.description] - 描述
 * @param {string} [config.storageKey] - 设置存储键
 * @param {Function} [config.defaultSettings] - 默认设置工厂函数
 * @returns {Object} Provider实例
 */
function createBaseProvider(config: any): any {
  const id = config.id
  const name = config.name || id
  const description = config.description || ""
  const storageKey = config.storageKey || `mobao_${id}_settings_v1`
  const apiKeyStorageKey = config.apiKeyStorageKey || `mobao_${id}_api_key_v1`

  const logs: Array<Record<string, unknown>> = []

  function log(level: string, event: string, detail: unknown): void {
    logs.push({
      timestamp: new Date().toISOString(),
      level,
      event,
      detail: normalizeObject(detail)
    })
    if (logs.length > MAX_LOG_ENTRIES) {
      logs.splice(0, logs.length - MAX_LOG_ENTRIES)
    }
  }

  function getLogs(): Array<Record<string, unknown>> {
    return logs.slice()
  }

  function clearLogs(): void {
    logs.length = 0
  }

  function loadProviderApiKey(): string {
    try {
      const value = window.localStorage.getItem(apiKeyStorageKey)
      return typeof value === "string" ? value.trim() : ""
    } catch (_error) {
      return ""
    }
  }

  function saveProviderApiKey(value: any): void {
    const normalized = typeof value === "string" ? value.trim() : ""
    try {
      if (normalized) {
        window.localStorage.setItem(apiKeyStorageKey, normalized)
      } else {
        window.localStorage.removeItem(apiKeyStorageKey)
      }
    } catch (_error) { }
  }

  function loadSettings(): any {
    const defaults = config.defaultSettings()
    try {
      const raw = window.localStorage.getItem(storageKey)
      console.log("[loadSettings] storageKey:", storageKey, "raw:", raw)
      const storedApiKey = loadProviderApiKey()
      console.log(
        "[loadSettings] apiKeyStorageKey:",
        apiKeyStorageKey,
        "storedApiKey:",
        storedApiKey ? "(已设置)" : "(空)"
      )
      if (!raw) {
        console.log("[loadSettings] no raw data, returning defaults")
        return { ...defaults, apiKey: storedApiKey }
      }
      const parsed = parseJsonSafely(raw)
      console.log("[loadSettings] parsed:", parsed)
      if (storedApiKey) {
        defaults.apiKey = storedApiKey
      }
      const normalized = config.normalizeSettings(parsed, defaults)
      console.log(
        "[loadSettings] normalized thinkingEnabled:",
        normalized.thinkingEnabled,
        "independentModelEnabled:",
        normalized.independentModelEnabled,
        "apiKey:",
        normalized.apiKey ? "(已设置)" : "(空)"
      )
      if (parsed.independentModelEnabled !== undefined && normalized.independentModelEnabled === undefined) {
        normalized.independentModelEnabled = Boolean(parsed.independentModelEnabled)
        console.log("[loadSettings] force set independentModelEnabled to:", normalized.independentModelEnabled)
      }
      if (
        parsed.independentReflectionEnabled !== undefined &&
        normalized.independentReflectionEnabled === undefined
      ) {
        normalized.independentReflectionEnabled = Boolean(parsed.independentReflectionEnabled)
        console.log(
          "[loadSettings] force set independentReflectionEnabled to:",
          normalized.independentReflectionEnabled
        )
      }
      const keyFromLocal = typeof normalized.apiKey === "string" ? normalized.apiKey.trim() : ""
      const apiKey = storedApiKey || keyFromLocal
      console.log("[loadSettings] final apiKey:", apiKey ? "(已设置)" : "(空)")
      if (apiKey) {
        saveProviderApiKey(apiKey)
      }
      const safeForLocalStorage = { ...normalized, apiKey: "" }
      window.localStorage.setItem(storageKey, JSON.stringify(safeForLocalStorage))
      return { ...safeForLocalStorage, apiKey }
    } catch (_error) {
      console.log("[loadSettings] error:", _error)
      return { ...defaults, apiKey: loadProviderApiKey() }
    }
  }

  function saveSettings(settings: any): any {
    console.log("[saveSettings] input settings:", settings)
    const normalized = config.normalizeSettings(settings, config.defaultSettings())
    console.log(
      "[saveSettings] normalized thinkingEnabled:",
      normalized.thinkingEnabled,
      "independentModelEnabled:",
      normalized.independentModelEnabled,
      "apiKey:",
      normalized.apiKey ? "(已设置)" : "(空)"
    )
    if (settings.independentModelEnabled !== undefined && normalized.independentModelEnabled === undefined) {
      normalized.independentModelEnabled = Boolean(settings.independentModelEnabled)
      console.log("[saveSettings] force set independentModelEnabled to:", normalized.independentModelEnabled)
    }
    if (
      settings.independentReflectionEnabled !== undefined &&
      normalized.independentReflectionEnabled === undefined
    ) {
      normalized.independentReflectionEnabled = Boolean(settings.independentReflectionEnabled)
      console.log(
        "[saveSettings] force set independentReflectionEnabled to:",
        normalized.independentReflectionEnabled
      )
    }
    saveProviderApiKey(normalized.apiKey)
    const safeForLocalStorage = { ...normalized, apiKey: "" }
    window.localStorage.setItem(storageKey, JSON.stringify(safeForLocalStorage))
    console.log("[saveSettings] saved to localStorage, apiKeyStorageKey:", apiKeyStorageKey)
    return { ...safeForLocalStorage, apiKey: loadProviderApiKey() }
  }

  return {
    id,
    name,
    description,
    defaultSettings: config.defaultSettings,
    normalizeSettings: config.normalizeSettings,
    loadSettings,
    saveSettings,
    log,
    getLogs,
    clearLogs,
    isThinkingModel:
      config.isThinkingModel ||
      function (model: string) {
        return false
      },
    supportsFeature:
      config.supportsFeature ||
      function (feature: string) {
        return false
      },
    storageKey,
    apiKeyStorageKey
  }
}

function createOpenAICompatibleProvider(config: any): any {
  const base = createBaseProvider(config)

  /**
   * 向当前活跃的LLM Provider发送聊天请求
   * @param {Object} options - 请求选项
   * @param {Array} options.messages - 消息数组 [{role, content}]
   * @param {number} [options.temperature] - 温度参数
   * @param {number} [options.max_tokens] - 最大token数
   * @returns {Promise<Object>} 响应结果 { ok, content, usage?, error? }
   */
  async function requestChat(options: any): Promise<any> {
    const callStartTime = Date.now()
    const callId = `${base.id}-${callStartTime}-${Math.random().toString(16).slice(2, 6)}`
    console.log(`[requestChat] ${callId} START, provider: ${base.id}, model: ${options.settings?.model || "unknown"}`)
    const input = normalizeObject(options)
    const loadedSettings = base.loadSettings()
    const mergedSettings = config.normalizeSettings(input.settings, loadedSettings)
    console.log(
      `[requestChat] ${callId} settings merged, model: ${mergedSettings.model}, endpoint: ${mergedSettings.endpoint}, elapsed: ${Date.now() - callStartTime}ms`
    )
    const useProxyEndpoint = isProxyEndpoint(mergedSettings.endpoint)
    const isNativeEnv = !!((window as any).NativeBridge && (window as any).NativeBridge.getServerUrl)
    const useNativeProxy = isNativeEnv && (window as any).NativeBridge.llmProxyAsync
    const isLocalEndpoint = /^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?\//i.test(
      mergedSettings.endpoint || ""
    )

    if (!mergedSettings.apiKey && !(useProxyEndpoint && !useNativeProxy) && !isLocalEndpoint) {
      console.log("[requestChat] BLOCKED: missing_api_key")
      base.log("warn", "request.blocked", { reason: "missing_api_key" })
      return {
        ok: false,
        error: `请先在设置中填写 ${base.name} API Key。`,
        code: "MISSING_API_KEY",
        stage: "validate"
      }
    }

    const messages =
      Array.isArray(input.messages) && input.messages.length > 0
        ? input.messages
        : [{ role: "user", content: "请回复：连接成功" }]

    const timeoutMs = clamp(Math.round(toFiniteNumber(input.timeoutMs, mergedSettings.timeoutMs)), 3000, 120000)
    const temperature = clamp(toFiniteNumber(input.temperature, mergedSettings.temperature), 0, 2)
    const maxTokens = Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, mergedSettings.maxTokens)))

    const isThinking = input.isThinking === true
    const requestBody: any = {
      model: mergedSettings.model,
      messages,
      max_tokens: maxTokens,
      stream: false
    }

    if (config.buildRequestBody) {
      Object.assign(requestBody, config.buildRequestBody(mergedSettings, { isThinking, temperature }))
    } else if (!isThinking) {
      requestBody.temperature = temperature
    }

    if (isThinking && mergedSettings.thinkingParams) {
      try {
        const customParams = JSON.parse(mergedSettings.thinkingParams)
        if (customParams && typeof customParams === "object") {
          Object.assign(requestBody, customParams)
        }
      } catch (_e) {
        base.log("warn", "thinkingParams.parse.error", { thinkingParams: mergedSettings.thinkingParams })
      }
    }

    const startedAt = Date.now()
    const requestId = `${base.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const messageChars = messages.reduce(function (sum: number, msg: Record<string, unknown>) {
      return sum + String(msg && msg.content ? msg.content : "").length
    }, 0)

    base.log("info", "request.start", {
      requestId,
      endpoint: mergedSettings.endpoint,
      proxyMode: useProxyEndpoint,
      model: mergedSettings.model,
      messageCount: messages.length,
      messageChars,
      maxTokens,
      temperature,
      timeoutMs
    })

    const controller = new AbortController()
    const timeoutId = window.setTimeout(function () {
      controller.abort()
    }, timeoutMs)

    try {
      let fetchEndpoint = mergedSettings.endpoint

      if (fetchEndpoint && !fetchEndpoint.includes("/chat/completions")) {
        fetchEndpoint = fetchEndpoint.replace(/\/+$/, "") + "/chat/completions"
      }

      let fetchBody = Object.assign({}, requestBody)
      let response: any, rawText: string

      if (isNativeEnv && (window as any).NativeBridge.llmProxyAsync) {
        if (mergedSettings.apiKey) {
          fetchBody.apiKey = mergedSettings.apiKey
        }
        if (fetchEndpoint && !isProxyEndpoint(fetchEndpoint)) {
          try {
            const u = new URL(fetchEndpoint)
            fetchBody.proxyTarget = u.origin + u.pathname
          } catch (_) { }
        }
        console.log(
          `[requestChat] ${callId} native proxy path, proxyTarget: ${fetchBody.proxyTarget || "(proxy endpoint)"}, model: ${fetchBody.model}, timeout: ${timeoutMs}ms`
        )

        const llmProxyResolvers: Map<string, any> = (window as any).__llmProxyResolvers || new Map()
          ; (window as any).__llmProxyResolvers = llmProxyResolvers

        if (!(window as any).__llmProxyCallback) {
          ; (window as any).__llmProxyCallback = function (requestId: string, b64Result: string) {
            const entry = llmProxyResolvers.get(requestId)
            if (entry) {
              llmProxyResolvers.delete(requestId)
              try {
                let decoded = atob(b64Result)
                if (typeof TextDecoder !== "undefined") {
                  const bytes = new Uint8Array(decoded.length)
                  for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i)
                  }
                  entry.resolve(new TextDecoder("utf-8", { fatal: false }).decode(bytes))
                } else {
                  const resultJson = unescape(
                    decoded
                      .split("")
                      .map(function (c: string) {
                        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
                      })
                      .join("")
                  )
                  entry.resolve(resultJson)
                }
              } catch (e) {
                entry.resolve(b64Result)
              }
            }
          }
        }

        const proxyResultJson = await Promise.race([
          new Promise<string>(function (resolve) {
            llmProxyResolvers.set(requestId, { resolve: resolve })
              ; (window as any).NativeBridge.llmProxyAsync(requestId, JSON.stringify(fetchBody))
          }),
          new Promise<never>(function (_, reject) {
            setTimeout(function () {
              reject(new DOMException("The user aborted a request.", "AbortError"))
            }, timeoutMs)
          })
        ])

        const proxyJson = parseJsonSafely(proxyResultJson)
        if (proxyJson && proxyJson.error) {
          return {
            ok: false,
            requestId,
            status: proxyJson.status || 502,
            elapsedMs: Date.now() - startedAt,
            error: proxyJson.error,
            code: "PROXY_ERROR",
            stage: "request"
          }
        }
        const proxyStatus = (proxyJson && proxyJson.status) || 200
        rawText = (proxyJson && proxyJson.body) || "{}"
        response = { ok: proxyStatus >= 200 && proxyStatus < 300, status: proxyStatus }
        console.log(
          `[requestChat] ${callId} native proxy response, status: ${proxyStatus}, ok: ${response.ok}, bodyLength: ${rawText.length}`
        )
        if (!response.ok) {
          console.log(`[requestChat] ${callId} ERROR body: ${rawText.slice(0, 500)}`)
        }
      } else {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (!useProxyEndpoint && mergedSettings.apiKey) {
          headers.Authorization = `Bearer ${mergedSettings.apiKey}`
        }

        const fetchResponse = await window.fetch(fetchEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(fetchBody),
          signal: controller.signal
        })
        response = fetchResponse
        rawText = await fetchResponse.text()
      }

      const elapsedMs = Date.now() - startedAt
      const payload = parseJsonSafely(rawText)

      base.log("info", "response.raw", {
        requestId,
        status: response.status,
        elapsedMs,
        rawPreview: compactText(rawText, 500),
        hasChoices: payload && Array.isArray(payload.choices),
        choicesLength: payload && payload.choices ? payload.choices.length : 0
      })

      if (!response.ok) {
        const message = extractErrorMessage(payload, response.status)
        base.log("error", "request.http_error", {
          requestId,
          status: response.status,
          elapsedMs,
          message,
          payloadPreview: compactText(rawText, 160)
        })
        return {
          ok: false,
          requestId,
          status: response.status,
          elapsedMs,
          error: message,
          code: "HTTP_ERROR",
          stage: "http",
          meta: {
            endpoint: mergedSettings.endpoint,
            model: mergedSettings.model,
            timeoutMs,
            messageCount: messages.length,
            messageChars,
            status: response.status
          },
          raw: payload || rawText
        }
      }

      const message =
        payload && payload.choices && payload.choices[0] && payload.choices[0].message
          ? payload.choices[0].message
          : null

      const content = message && typeof message.content === "string" ? message.content : ""

      base.log("info", "response.parsed", {
        requestId,
        hasMessage: message !== null,
        messageKeys: message ? Object.keys(message) : [],
        contentType: message && message.content ? typeof message.content : "none",
        contentLength: content.length,
        contentPreview: compactText(content, 200)
      })

      let reasoningContent = ""
      if (message && typeof message.reasoning_content === "string") {
        reasoningContent = message.reasoning_content
      } else if (message && typeof message.reasoning === "string") {
        reasoningContent = message.reasoning
      }

      base.log("info", "request.success", {
        requestId,
        status: response.status,
        elapsedMs,
        usage: payload && payload.usage ? payload.usage : null,
        contentPreview: compactText(content, 100)
      })

      console.log(`[requestChat] ${callId} SUCCESS, elapsed: ${Date.now() - callStartTime}ms, http: ${elapsedMs}ms`)
      const successResult = {
        ok: true,
        requestId,
        status: response.status,
        elapsedMs,
        content,
        reasoningContent,
        model: (payload && payload.model) || "",
        usage: payload && payload.usage ? payload.usage : null,
        raw: payload
      }
      broadcastToTokenMonitor(successResult, input)
      return successResult
    } catch (error) {
      const elapsedMs = Date.now() - startedAt
      const timeoutError = error && (error as Error).name === "AbortError"
      if (timeoutError && isNativeEnv && (window as any).NativeBridge && (window as any).NativeBridge.llmProxyCancel) {
        ; (window as any).NativeBridge.llmProxyCancel(requestId)
      }
      if ((window as any).__llmProxyResolvers) {
        ; (window as any).__llmProxyResolvers.delete(requestId)
      }
      const message = timeoutError
        ? `请求超时（>${timeoutMs}ms）`
        : `网络错误：${error && (error as Error).message ? (error as Error).message : "未知错误"}`

      base.log("error", "request.exception", {
        requestId,
        elapsedMs,
        timeout: timeoutError,
        message,
        errorName: error && (error as Error).name ? (error as Error).name : "",
        errorMessage: error && (error as Error).message ? (error as Error).message : ""
      })

      const errorResult = {
        ok: false,
        requestId,
        elapsedMs,
        error: message,
        code: timeoutError ? "TIMEOUT" : "NETWORK_ERROR",
        stage: "network",
        meta: {
          endpoint: mergedSettings.endpoint,
          model: mergedSettings.model,
          timeoutMs,
          timeout: timeoutError,
          messageCount: messages.length,
          messageChars,
          errorName: error && (error as Error).name ? (error as Error).name : "",
          errorMessage: error && (error as Error).message ? (error as Error).message : ""
        }
      }
      broadcastToTokenMonitor(errorResult, input)
      return errorResult
    } finally {
      window.clearTimeout(timeoutId)
      if ((window as any).__llmProxyResolvers) {
        ; (window as any).__llmProxyResolvers.delete(requestId)
      }
    }
  }

  async function testConnection(overrideSettings?: any): Promise<any> {
    const settings = config.normalizeSettings(overrideSettings, base.loadSettings())
    const result = await requestChat({
      settings,
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

  return {
    ...base,
    requestChat,
    testConnection
  }
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

    const provider = createOpenAICompatibleProvider({
      id: providerId,
      name: config.name || providerId,
      description: config.description || "用户自定义模型",
      storageKey: `mobao_${providerId}_settings_v1`,
      apiKeyStorageKey: `mobao_${providerId}_api_key_v1`,
      defaultSettings: function () {
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
      },
      normalizeSettings: function (source: any, fallback?: any) {
        const defaults = fallback || {
          provider: providerId,
          enabled: false,
          multiGameMemoryEnabled: false,
          reflectionEnabled: false,
          contextLength: 5,
          autoSummarizeEnabled: true,
          reflectionScope: "current",
          thinkingEnabled: false,
          independentModelEnabled: false,
          thinkingParams: "",
          endpoint: config.endpoint || "",
          model: config.model || "",
          apiKey: "",
          timeoutMs: 40000,
          temperature: 0.2,
          maxTokens: 2048
        }
        const input = normalizeObject(source)
        const resultApiKey =
          typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : defaults.apiKey || ""
        console.log(
          "[normalizeSettings] input.apiKey:",
          typeof input.apiKey === "string" ? (input.apiKey ? "(已设置)" : "(空字符串)") : "(非字符串)",
          "defaults.apiKey:",
          defaults.apiKey ? "(已设置)" : "(空)",
          "result:",
          resultApiKey ? "(已设置)" : "(空)"
        )
        return {
          provider: providerId,
          enabled: Boolean(input.enabled),
          multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
          reflectionEnabled: Boolean(input.reflectionEnabled),
          contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
          autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
          reflectionScope: input.reflectionScope === "full" ? "full" : "current",
          thinkingEnabled: Boolean(input.thinkingEnabled),
          independentModelEnabled: Boolean(input.independentModelEnabled),
          thinkingParams:
            typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
          endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : defaults.endpoint,
          model: typeof input.model === "string" ? input.model.trim() : defaults.model,
          apiKey: resultApiKey,
          timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
          temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
          maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
        }
      },
      isThinkingModel: function (model: string) {
        return false
      },
      buildRequestBody: function (settings: any, context: any) {
        return { temperature: context.temperature }
      },
      supportsFeature: function (feature: string) {
        return false
      }
    })

    registerProvider(provider)

    const customList = loadCustomProviders()
    const existingIndex = customList.findIndex(function (p: CustomProvider) {
      return p.id === providerId
    })
    const providerInfo: CustomProvider = { id: providerId, name: config.name || providerId, description: config.description || "" }
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
    } catch (_error) { }
    return true
  },
  initializeCustomProviders: function (): void {
    const customList = loadCustomProviders()
    customList.forEach(function (cfg: CustomProvider) {
      if (!providers.has(String(cfg.id))) {
        const provider = createOpenAICompatibleProvider({
          id: cfg.id,
          name: cfg.name,
          description: cfg.description || "",
          storageKey: `mobao_${cfg.id}_settings_v1`,
          apiKeyStorageKey: `mobao_${cfg.id}_api_key_v1`,
          defaultSettings: function () {
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
          },
          normalizeSettings: function (source: any, fallback?: any) {
            const defaults = fallback || {
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
            const input = normalizeObject(source)
            const resultApiKey =
              typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : defaults.apiKey || ""
            console.log(
              "[normalizeSettings-init] input.apiKey:",
              typeof input.apiKey === "string" ? (input.apiKey ? "(已设置)" : "(空字符串)") : "(非字符串)",
              "defaults.apiKey:",
              defaults.apiKey ? "(已设置)" : "(空)",
              "result:",
              resultApiKey ? "(已设置)" : "(空)"
            )
            return {
              provider: cfg.id,
              enabled: Boolean(input.enabled),
              multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
              reflectionEnabled: Boolean(input.reflectionEnabled),
              contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
              autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
              reflectionScope: input.reflectionScope === "full" ? "full" : "current",
              thinkingEnabled: Boolean(input.thinkingEnabled),
              thinkingParams:
                typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
              endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : defaults.endpoint,
              model: typeof input.model === "string" ? input.model.trim() : defaults.model,
              apiKey: resultApiKey,
              timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
              temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
              maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
            }
          },
          isThinkingModel: function (model: string) {
            return false
          },
          buildRequestBody: function (settings: any, context: any) {
            return { temperature: context.temperature }
          },
          supportsFeature: function (feature: string) {
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
