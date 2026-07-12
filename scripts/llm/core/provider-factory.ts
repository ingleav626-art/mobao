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

export function createBaseProvider(config: any): any {
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

export function createOpenAICompatibleProvider(config: any): any {
  const base = createBaseProvider(config)

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
          } catch (_) {}
        }
        console.log(
          `[requestChat] ${callId} native proxy path, proxyTarget: ${fetchBody.proxyTarget || "(proxy endpoint)"}, model: ${fetchBody.model}, timeout: ${timeoutMs}ms`
        )

        const llmProxyResolvers: Map<string, any> = (window as any).__llmProxyResolvers || new Map()
        ;(window as any).__llmProxyResolvers = llmProxyResolvers

        if (!(window as any).__llmProxyCallback) {
          ;(window as any).__llmProxyCallback = function (requestId: string, b64Result: string) {
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
            ;(window as any).NativeBridge.llmProxyAsync(requestId, JSON.stringify(fetchBody))
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
        ;(window as any).NativeBridge.llmProxyCancel(requestId)
      }
      if ((window as any).__llmProxyResolvers) {
        ;(window as any).__llmProxyResolvers.delete(requestId)
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
        ;(window as any).__llmProxyResolvers.delete(requestId)
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
