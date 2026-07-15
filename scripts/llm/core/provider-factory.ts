/**
 * @file llm/core/provider-factory.ts
 * @module llm/core/provider-factory
 * @description LLM Provider 工厂函数。从 llm-manager.ts 提取而来。
 *              包含 createBaseProvider 和 createOpenAICompatibleProvider。
 */
import {
  MAX_LOG_ENTRIES,
  normalizeObject,
  parseJsonSafely,
  compactText,
  isProxyEndpoint,
  extractErrorMessage,
  broadcastToTokenMonitor,
  clamp,
  toFiniteNumber
} from "./manager-utils"

export interface NormalizeSettingsConfig {
  providerId: string
  defaultSettings: () => Record<string, unknown>
  temperatureMax: number
  includeIndependentReflection?: boolean
  normalizeEndpoint?: (raw: string, fallback: string) => string
}

/** 提供商标识接口 */
export interface ProviderIdentity {
  id: string
  name: string
  description: string
}

/** Provider 配置（createBaseProvider 参数） */
export interface BaseProviderConfig extends ProviderIdentity {
  storageKey: string
  apiKeyStorageKey: string
  defaultSettings: () => any
  normalizeSettings: (source: any, fallback?: any) => any
  isThinkingModel?: (model: string) => boolean
  supportsFeature?: (feature: string) => boolean
}

/** Provider 对象（createBaseProvider 返回值） */
export interface BaseProvider extends ProviderIdentity {
  defaultSettings: () => any
  normalizeSettings: (source: any, fallback?: any) => any
  loadSettings: () => any
  saveSettings: (settings: any) => any
  log: (level: string, event: string, detail: unknown) => void
  getLogs: () => Array<Record<string, unknown>>
  clearLogs: () => void
  isThinkingModel: (model: string) => boolean
  supportsFeature: (feature: string) => boolean
  storageKey: string
  apiKeyStorageKey: string
}

/** OpenAI 兼容 Provider 配置（createOpenAICompatibleProvider 参数） */
export interface OpenAICompatibleProviderConfig extends BaseProviderConfig {
  buildRequestBody?: (settings: any, context: { isThinking: boolean; temperature: number }) => any
}

/** Chat 请求选项 */
export interface ChatRequestOptions {
  settings?: any
  messages?: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  isThinking?: boolean
  _playerId?: string
  _playerName?: string
}

/** Chat 响应结果 */
export interface ChatResult {
  ok: boolean
  requestId?: string
  status?: number
  elapsedMs?: number
  content?: string
  reasoningContent?: string
  model?: string
  error?: string
  code?: string
  stage?: string
  usage?: any
  meta?: any
  raw?: any
  message?: string
}

/** OpenAI 兼容 Provider（createOpenAICompatibleProvider 返回值） */
export interface OpenAICompatibleProvider extends BaseProvider {
  requestChat: (options: ChatRequestOptions) => Promise<ChatResult>
  testConnection: (overrideSettings?: any) => Promise<ChatResult>
}

/** 默认 endpoint 归一化：验证 URL 协议，无效协议回退到默认值 */
function defaultNormalizeEndpoint(raw: string, fallback: string): string {
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
  // 无效协议（如缺少 :// 或格式错误），回退到默认
  return fallback || input
}

export function createNormalizeSettings(config: NormalizeSettingsConfig) {
  const doNormalizeEndpoint = config.normalizeEndpoint || defaultNormalizeEndpoint

  return function normalizeSettings(source: any, fallback?: any): any {
    const defaults: any = { ...config.defaultSettings(), ...normalizeObject(fallback) }
    const input = normalizeObject(source)

    const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
    const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
    const apiKeyRaw =
      typeof input.apiKey === "string" && (input.apiKey as string).trim()
        ? (input.apiKey as string).trim()
        : String(defaults.apiKey || "")

    const endpoint = doNormalizeEndpoint(endpointRaw, String(defaults.endpoint))

    return {
      provider: config.providerId,
      enabled: Boolean(input.enabled),
      multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
      reflectionEnabled: Boolean(input.reflectionEnabled),
      contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
      autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
      reflectionScope: input.reflectionScope === "full" ? "full" : "current",
      thinkingEnabled: Boolean(input.thinkingEnabled),
      independentModelEnabled: Boolean(input.independentModelEnabled),
      ...(config.includeIndependentReflection
        ? {
            independentReflectionEnabled:
              input.independentReflectionEnabled !== undefined ? Boolean(input.independentReflectionEnabled) : true
          }
        : {}),
      thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
      endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, config.temperatureMax),
      maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
    }
  }
}

export function createBaseProvider(config: BaseProviderConfig): BaseProvider {
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

  function saveProviderApiKey(value: string): void {
    const normalized = typeof value === "string" ? value.trim() : ""
    try {
      if (normalized) {
        window.localStorage.setItem(apiKeyStorageKey, normalized)
      } else {
        window.localStorage.removeItem(apiKeyStorageKey)
      }
    } catch (_error) {}
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
      if (parsed.independentReflectionEnabled !== undefined && normalized.independentReflectionEnabled === undefined) {
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
    if (settings.independentReflectionEnabled !== undefined && normalized.independentReflectionEnabled === undefined) {
      normalized.independentReflectionEnabled = Boolean(settings.independentReflectionEnabled)
      console.log("[saveSettings] force set independentReflectionEnabled to:", normalized.independentReflectionEnabled)
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
      function (_model: string) {
        return false
      },
    supportsFeature:
      config.supportsFeature ||
      function (_feature: string) {
        return false
      },
    storageKey,
    apiKeyStorageKey
  }
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleProviderConfig): OpenAICompatibleProvider {
  const base = createBaseProvider(config)

  async function requestChat(options: ChatRequestOptions): Promise<ChatResult> {
    const callStartTime = Date.now()
    const callId = `${base.id}-${callStartTime}-${Math.random().toString(16).slice(2, 6)}`
    console.log(`[requestChat] ${callId} START, provider: ${base.id}, model: ${options.settings?.model || "unknown"}`)
    const input = normalizeObject(options)
    const loadedSettings = base.loadSettings()
    console.log(
      "[API DEBUG] loadedSettings.endpoint:", JSON.stringify(loadedSettings?.endpoint),
      "type:", typeof loadedSettings?.endpoint
    )
    const inputSettings = input.settings as Record<string, unknown> | undefined
    console.log(
      "[API DEBUG] input.settings?.endpoint:", JSON.stringify(inputSettings?.endpoint),
      "type:", typeof inputSettings?.endpoint
    )
    const mergedSettings = config.normalizeSettings(input.settings, loadedSettings)
    console.log(
      "[API DEBUG] mergedSettings.endpoint:", JSON.stringify(mergedSettings?.endpoint),
      "type:", typeof mergedSettings?.endpoint
    )
    console.log(
      `[requestChat] ${callId} settings merged, model: ${mergedSettings.model}, endpoint: ${mergedSettings.endpoint}, elapsed: ${Date.now() - callStartTime}ms`
    )
    const useProxyEndpoint = isProxyEndpoint(mergedSettings.endpoint)
    const isNativeEnv = !!(window.NativeBridge && window.NativeBridge.getServerUrl)
    const useNativeProxy = isNativeEnv && window.NativeBridge?.llmProxyAsync
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
    const requestBody: Record<string, unknown> = {
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

      // dev 环境自动通过 Vite 代理转发外部 API 请求，避免浏览器 CORS 拦截
      // 生产环境（Android WebView）无 CORS 限制，直接请求
      if (!useProxyEndpoint && !useNativeProxy && !isLocalEndpoint && fetchEndpoint.startsWith("http")) {
        const isDev = typeof location !== "undefined" && location.hostname === "localhost"
        if (isDev) {
          fetchEndpoint = "/llm-cors-proxy/" + fetchEndpoint
        }
      }

      let fetchBody = Object.assign({}, requestBody)
      let response: { ok: boolean; status: number }, rawText: string

      if (isNativeEnv && window.NativeBridge?.llmProxyAsync) {
        if (mergedSettings.apiKey) {
          fetchBody.apiKey = mergedSettings.apiKey as string
        }
        if (fetchEndpoint && !isProxyEndpoint(fetchEndpoint)) {
          try {
            const u = new URL(fetchEndpoint)
            fetchBody.proxyTarget = u.origin + u.pathname
          } catch (_) {}
        }
        console.log(
          `[requestChat] ${callId} native proxy path, proxyTarget: ${String(fetchBody.proxyTarget) || "(proxy endpoint)"}, model: ${String(fetchBody.model)}, timeout: ${timeoutMs}ms`
        )

        const llmProxyResolvers: Map<string, { resolve: (value: string) => void }> =
          window.__llmProxyResolvers || new Map()
        window.__llmProxyResolvers = llmProxyResolvers

        if (!window.__llmProxyCallback) {
          window.__llmProxyCallback = function (requestId: string, b64Result: string) {
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
              } catch (_e) {
                entry.resolve(b64Result)
              }
            }
          }
        }

        const proxyResultJson = await Promise.race([
          new Promise<string>(function (resolve) {
            llmProxyResolvers.set(requestId, { resolve: resolve })
            window.NativeBridge!.llmProxyAsync!(requestId, JSON.stringify(fetchBody))
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

        console.log(
          "[requestChat] fetchEndpoint:",
          fetchEndpoint,
          "type:",
          typeof fetchEndpoint,
          "startsWith https:",
          typeof fetchEndpoint === "string" && fetchEndpoint.startsWith("https://")
        )
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
      if (timeoutError && isNativeEnv && window.NativeBridge?.llmProxyCancel) {
        window.NativeBridge.llmProxyCancel!(requestId)
      }
      if (window.__llmProxyResolvers) {
        window.__llmProxyResolvers.delete(requestId)
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
      if (window.__llmProxyResolvers) {
        window.__llmProxyResolvers.delete(requestId)
      }
    }
  }

  async function testConnection(overrideSettings?: Record<string, unknown>): Promise<ChatResult> {
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
