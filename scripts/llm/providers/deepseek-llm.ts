/**
 * @file llm/providers/deepseek-llm.ts
 * @module llm/providers/deepseek-llm
 * @description DeepSeek LLM 客户端（旧版独立实现）。采用 IIFE 模式，挂载到 window.DeepSeekLLM。
 *              提供完整的 DeepSeek API 调用、设置管理、Token 监控和日志功能。
 */
"use strict"

const LLM_STORAGE_KEY = "mobao_deepseek_settings_v2"
const LLM_API_KEY_STORAGE_KEY = "mobao_deepseek_api_key_v1"
const MAX_LOG_ENTRIES = 120

const llmProxyResolvers: Map<string, { resolve: (value: string) => void }> = (window as any).__llmProxyResolvers || new Map()
  ; (window as any).__llmProxyResolvers = llmProxyResolvers

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
    const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || usage.cached_tokens || 0
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
  const callSource = options && options._playerId ? `player:${options._playerId}` : "unknown"
  console.log(
    `[TokenMonitor-DeepSeek] broadcast called from ${callSource}, ok:${result.ok}, elapsed:${result.elapsedMs}ms`
  )
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
        playerId: (options && options._playerId) || null,
        playerName: (options && options._playerName) || null,
        source: "deepseek-llm"
      }
    }
    if ((window as any).BroadcastChannel) {
      const channel = new BroadcastChannel("llm-token-monitor")
      channel.postMessage(payload)
      channel.close()
    }
    localStorage.setItem("llm-token-monitor-live", JSON.stringify(payload))
    console.log(`[TokenMonitor-DeepSeek] data sent, requestId:${result.requestId}`)
  } catch (e) {
    console.error("[TokenMonitor-DeepSeek] broadcast error:", e)
  }
}

if (!(window as any).__llmProxyCallback) {
  ; (window as any).__llmProxyCallback = function (requestId: string, b64Result: string): void {
    const entry = llmProxyResolvers.get(requestId)
    if (entry) {
      llmProxyResolvers.delete(requestId)
      try {
        var decoded = atob(b64Result)
        if (typeof TextDecoder !== "undefined") {
          var bytes = new Uint8Array(decoded.length)
          for (var i = 0; i < decoded.length; i++) {
            bytes[i] = decoded.charCodeAt(i)
          }
          entry.resolve(new TextDecoder("utf-8", { fatal: false }).decode(bytes))
        } else {
          var resultJson = unescape(
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

function llmProxyAsync(requestId: string, bodyJson: string): Promise<string> {
  return new Promise(function (resolve) {
    llmProxyResolvers.set(requestId, { resolve: resolve })
      ; (window as any).NativeBridge.llmProxyAsync(requestId, bodyJson)
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function defaultDeepSeekSettings(): any {
  return {
    provider: "deepseek",
    enabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    contextLength: 5,
    autoSummarizeEnabled: true,
    reflectionScope: "current",
    endpoint: "/api/deepseek/chat/completions",
    model: "deepseek-v4-flash",
    apiKey: "",
    timeoutMs: 40000,
    temperature: 0.2,
    maxTokens: 2048,
    independentModelEnabled: false
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function toFiniteNumber(value: any, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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

function loadStoredApiKey(): string {
  try {
    const value = window.localStorage.getItem(LLM_API_KEY_STORAGE_KEY)
    return typeof value === "string" ? value.trim() : ""
  } catch (_error) {
    return ""
  }
}

function saveStoredApiKey(value: string): void {
  const normalized = typeof value === "string" ? value.trim() : ""
  try {
    if (normalized) {
      window.localStorage.setItem(LLM_API_KEY_STORAGE_KEY, normalized)
    } else {
      window.localStorage.removeItem(LLM_API_KEY_STORAGE_KEY)
    }
  } catch (_error) {
    // ignore storage errors in restricted browser contexts
  }
}

function isProxyEndpoint(endpoint: string): boolean {
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

function makeRequestId(): string {
  return `ds-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export function normalizeDeepSeekSettings(source: any, fallback?: any): any {
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
    contextLength: clamp(Math.round(toFiniteNumber(input.contextLength, defaults.contextLength)), 2, 20),
    autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
    reflectionScope: input.reflectionScope === "full" ? "full" : "current",
    endpoint,
    model: modelRaw.length > 0 ? modelRaw : defaults.model,
    apiKey: apiKeyRaw,
    timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
    temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1.5),
    maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens))),
    independentModelEnabled: Boolean(input.independentModelEnabled)
  }
}

export function loadDeepSeekSettings(): any {
  const defaults = defaultDeepSeekSettings()
  const raw = window.localStorage.getItem(LLM_STORAGE_KEY)
  const storedApiKey = loadStoredApiKey()
  if (!raw) {
    return {
      ...defaults,
      apiKey: storedApiKey
    }
  }

  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeDeepSeekSettings(parsed, defaults)
    const keyFromLocal = typeof normalized.apiKey === "string" ? normalized.apiKey.trim() : ""
    const apiKey = storedApiKey || keyFromLocal
    if (apiKey) {
      saveStoredApiKey(apiKey)
    }
    const safeForLocalStorage = {
      ...normalized,
      apiKey: ""
    }
    window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(safeForLocalStorage))
    return {
      ...safeForLocalStorage,
      apiKey
    }
  } catch (_error) {
    return {
      ...defaults,
      apiKey: storedApiKey
    }
  }
}

export function saveDeepSeekSettings(settings: any): any {
  const normalized = normalizeDeepSeekSettings(settings, defaultDeepSeekSettings())
  saveStoredApiKey(normalized.apiKey)
  const safeForLocalStorage = {
    ...normalized,
    apiKey: ""
  }
  window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(safeForLocalStorage))
  return {
    ...safeForLocalStorage,
    apiKey: loadStoredApiKey()
  }
}

export function maskApiKey(value: string): string {
  const key = typeof value === "string" ? value.trim() : ""
  if (!key) {
    return "(empty)"
  }
  if (key.length <= 8) {
    return "*".repeat(key.length)
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function parseJsonSafely(text: string): any {
  if (typeof text !== "string" || text.length === 0) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

function compactText(value: string, maxLength: number): string {
  const input = typeof value === "string" ? value.trim() : ""
  if (input.length <= maxLength) {
    return input
  }
  return `${input.slice(0, maxLength)}...`
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

export class DeepSeekClient {
  settings: Record<string, unknown>
  logs: Array<Record<string, unknown>>

  constructor(initialSettings?: Record<string, unknown>) {
    this.settings = normalizeDeepSeekSettings(initialSettings, defaultDeepSeekSettings())
    this.logs = []
  }

  applySettings(nextSettings: Record<string, unknown>): Record<string, unknown> {
    this.settings = normalizeDeepSeekSettings(nextSettings, this.settings)
    this.log("info", "settings.updated", {
      enabled: this.settings.enabled,
      model: this.settings.model,
      endpoint: this.settings.endpoint,
      apiKey: maskApiKey(String(this.settings.apiKey || ""))
    })
    return this.getSettings()
  }

  getSettings(): Record<string, unknown> {
    return { ...this.settings }
  }

  getLogs(): Array<Record<string, unknown>> {
    return this.logs.slice()
  }

  clearLogs(): void {
    this.logs = []
  }

  log(level: string, event: string, detail?: unknown): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      event,
      detail: normalizeObject(detail)
    })
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES)
    }
  }

  async requestChat(options: any): Promise<any> {
    const input = normalizeObject(options)
    const mergedSettings = normalizeDeepSeekSettings(input.settings, this.settings)
    const useProxyEndpoint = isProxyEndpoint(mergedSettings.endpoint)
    var isNativeEnv = !!((window as any).NativeBridge && (window as any).NativeBridge.getServerUrl)
    var useNativeProxy = isNativeEnv && (window as any).NativeBridge.llmProxyAsync
    if (!mergedSettings.apiKey && !(useProxyEndpoint && !useNativeProxy)) {
      this.log("warn", "request.blocked", { reason: "missing_api_key" })
      return {
        ok: false,
        error: "请先在设置中填写 DeepSeek API Key。",
        code: "MISSING_API_KEY",
        stage: "validate"
      }
    }

    const messages: Array<Record<string, unknown>> =
      Array.isArray(input.messages) && input.messages.length > 0
        ? input.messages
        : [{ role: "user", content: "请回复：连接成功" }]
    const timeoutMs = clamp(Math.round(toFiniteNumber(input.timeoutMs, mergedSettings.timeoutMs)), 3000, 120000)
    const temperature = clamp(toFiniteNumber(input.temperature, mergedSettings.temperature), 0, 1.5)
    const maxTokens = Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, mergedSettings.maxTokens)))

    const isV4OrReasoner = /deepseek-(v4|reasoner)/i.test(mergedSettings.model)
    const userEnabledThinking = input.isThinking === true
    const requestBody: any = {
      model: mergedSettings.model,
      messages,
      max_tokens: maxTokens,
      stream: false
    }

    if (isV4OrReasoner) {
      if (userEnabledThinking) {
        requestBody.thinking = { type: "enabled" }
        requestBody.reasoning_effort = "high"
      } else {
        requestBody.thinking = { type: "disabled" }
        requestBody.temperature = temperature
      }
    } else {
      requestBody.temperature = temperature
    }

    if (userEnabledThinking && mergedSettings.thinkingParams) {
      try {
        const customParams = JSON.parse(mergedSettings.thinkingParams)
        if (customParams && typeof customParams === "object") {
          Object.assign(requestBody, customParams)
        }
      } catch (_e) {
        this.log("warn", "thinkingParams.parse.error", { thinkingParams: mergedSettings.thinkingParams })
      }
    }

    const startedAt = Date.now()
    const requestId = makeRequestId()
    const messageChars = messages.reduce((sum: number, msg: Record<string, unknown>) => sum + String(msg && msg.content ? msg.content : "").length, 0)
    this.log("info", "request.start", {
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
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      var fetchEndpoint: string = mergedSettings.endpoint

      if (fetchEndpoint && !fetchEndpoint.includes("/chat/completions")) {
        fetchEndpoint = fetchEndpoint.replace(/\/+$/, "") + "/chat/completions"
      }

      var fetchBody: any = Object.assign({}, requestBody)
      var response: { ok: boolean; status: number }
      var rawText: string

      if (isNativeEnv && (window as any).NativeBridge.llmProxyAsync) {
        if (mergedSettings.apiKey) {
          fetchBody.apiKey = mergedSettings.apiKey
        }
        if (fetchEndpoint && !isProxyEndpoint(fetchEndpoint)) {
          try {
            var u = new URL(fetchEndpoint)
            fetchBody.proxyTarget = u.origin + u.pathname
          } catch (_) { /* ignore */ }
        }

        var proxyResultJson = await Promise.race([
          llmProxyAsync(requestId, JSON.stringify(fetchBody)),
          new Promise<string>((_, reject) => {
            setTimeout(function () {
              reject(new DOMException("The user aborted a request.", "AbortError"))
            }, timeoutMs)
          })
        ])

        var proxyJson = parseJsonSafely(proxyResultJson)
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
        var proxyStatus = (proxyJson && proxyJson.status) || 200
        rawText = (proxyJson && proxyJson.body) || "{}"
        response = { ok: proxyStatus >= 200 && proxyStatus < 300, status: proxyStatus }
      } else {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        }
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

      if (!response.ok) {
        const message = extractErrorMessage(payload, response.status)
        this.log("error", "request.http_error", {
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

      let reasoningContent = ""
      if (message && typeof message.reasoning_content === "string") {
        reasoningContent = message.reasoning_content
      } else if (message && typeof message.reasoning === "string") {
        reasoningContent = message.reasoning
      }

      this.log("info", "request.success", {
        requestId,
        status: response.status,
        elapsedMs,
        usage: payload && payload.usage ? payload.usage : null,
        contentPreview: compactText(content, 100)
      })

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
      llmProxyResolvers.delete(requestId)
      const endpointLooksLegacy = /api\.deepseek\.com\/chat\/completions/i.test(mergedSettings.endpoint)
      const message = timeoutError
        ? `请求超时（>${timeoutMs}ms）`
        : `网络错误：${error && (error as Error).message ? (error as Error).message : "未知错误"}`
      const hint = timeoutError
        ? "可能是并发请求偏多、网络抖动或上游处理较慢。"
        : "可能是网络不可达、浏览器拦截、DNS/TLS异常，或 endpoint 不可用。"

      this.log("error", "request.exception", {
        requestId,
        elapsedMs,
        timeout: timeoutError,
        message,
        errorName: error && (error as Error).name ? (error as Error).name : "",
        errorMessage: error && (error as Error).message ? (error as Error).message : "",
        endpoint: mergedSettings.endpoint,
        model: mergedSettings.model,
        timeoutMs,
        hint,
        endpointLooksLegacy
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
          errorMessage: error && (error as Error).message ? (error as Error).message : "",
          hint,
          endpointLooksLegacy
        }
      }
      broadcastToTokenMonitor(errorResult, input)
      return errorResult
    } finally {
      window.clearTimeout(timeoutId)
      llmProxyResolvers.delete(requestId)
    }
  }

  async testConnection(overrideSettings?: any): Promise<any> {
    const settings = normalizeDeepSeekSettings(overrideSettings, this.settings)
    const result = await this.requestChat({
      settings,
      temperature: 0,
      maxTokens: 64,
      messages: [
        {
          role: "system",
          content: "你是接口连通性测试助手。收到请求后请只回复四个字：连接成功。"
        },
        {
          role: "user",
          content: "请仅回复：连接成功"
        }
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
}

export const DeepSeekLLM = {
  LLM_STORAGE_KEY,
  defaultDeepSeekSettings,
  normalizeDeepSeekSettings,
  loadDeepSeekSettings,
  saveDeepSeekSettings,
  maskApiKey,
  DeepSeekClient
}
