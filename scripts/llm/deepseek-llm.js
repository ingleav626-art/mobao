(function attachDeepSeekLLM(window) {
  "use strict";

  const LLM_STORAGE_KEY = "mobao_deepseek_settings_v2";
  const LLM_API_KEY_STORAGE_KEY = "mobao_deepseek_api_key_v1";
  const MAX_LOG_ENTRIES = 120;

  const llmProxyResolvers = new Map();
  window.__llmProxyCallback = function (requestId, b64Result) {
    const entry = llmProxyResolvers.get(requestId);
    if (entry) {
      llmProxyResolvers.delete(requestId);
      try {
        var decoded = atob(b64Result);
        var resultJson = decodeURIComponent(decoded.split("").map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(""));
        entry.resolve(resultJson);
      } catch (e) {
        entry.resolve(b64Result);
      }
    }
  };

  function llmProxyAsync(requestId, bodyJson) {
    return new Promise(function (resolve) {
      llmProxyResolvers.set(requestId, { resolve: resolve });
      window.NativeBridge.llmProxyAsync(requestId, bodyJson);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function defaultDeepSeekSettings() {
    return {
      provider: "deepseek",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      endpoint: "/api/deepseek/chat/completions",
      model: "deepseek-v4-flash",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
  }

  function normalizeObject(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    return value;
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeEndpoint(raw, fallback) {
    const input = typeof raw === "string" ? raw.trim() : "";
    if (!input) {
      return fallback;
    }

    if (input.startsWith("/")) {
      return input.replace(/\/$/, "") || "/";
    }

    if (!/^https?:\/\//i.test(input)) {
      return fallback;
    }

    try {
      const url = new URL(input);
      if (url.hostname === "api.deepseek.com" && url.pathname === "/chat/completions") {
        url.pathname = "/v1/chat/completions";
      }
      return url.toString().replace(/\/$/, "");
    } catch (_error) {
      return fallback;
    }
  }

  function loadStoredApiKey() {
    try {
      const value = window.localStorage.getItem(LLM_API_KEY_STORAGE_KEY);
      return typeof value === "string" ? value.trim() : "";
    } catch (_error) {
      return "";
    }
  }

  function saveStoredApiKey(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    try {
      if (normalized) {
        window.localStorage.setItem(LLM_API_KEY_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(LLM_API_KEY_STORAGE_KEY);
      }
    } catch (_error) {
      // ignore storage errors in restricted browser contexts
    }
  }

  function isProxyEndpoint(endpoint) {
    const value = typeof endpoint === "string" ? endpoint.trim() : "";
    if (!value) {
      return false;
    }

    if (value.startsWith("/")) {
      return true;
    }

    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin;
    } catch (_error) {
      return false;
    }
  }

  function makeRequestId() {
    return `ds-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizeDeepSeekSettings(source, fallback) {
    const defaults = {
      ...defaultDeepSeekSettings(),
      ...normalizeObject(fallback)
    };
    const input = normalizeObject(source);

    const endpointRaw = typeof input.endpoint === "string"
      ? input.endpoint.trim()
      : String(defaults.endpoint);
    const modelRaw = typeof input.model === "string"
      ? input.model.trim()
      : String(defaults.model);
    const apiKeyRaw = typeof input.apiKey === "string"
      ? input.apiKey.trim()
      : String(defaults.apiKey || "");

    const endpoint = normalizeEndpoint(endpointRaw, defaults.endpoint);

    return {
      provider: "deepseek",
      enabled: Boolean(input.enabled),
      multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
      reflectionEnabled: Boolean(input.reflectionEnabled),
      endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1.5),
      maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
    };
  }

  function loadDeepSeekSettings() {
    const defaults = defaultDeepSeekSettings();
    const raw = window.localStorage.getItem(LLM_STORAGE_KEY);
    const storedApiKey = loadStoredApiKey();
    if (!raw) {
      return {
        ...defaults,
        apiKey: storedApiKey
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeDeepSeekSettings(parsed, defaults);
      const keyFromLocal = typeof normalized.apiKey === "string" ? normalized.apiKey.trim() : "";
      const apiKey = storedApiKey || keyFromLocal;
      if (apiKey) {
        saveStoredApiKey(apiKey);
      }
      const safeForLocalStorage = {
        ...normalized,
        apiKey: ""
      };
      window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(safeForLocalStorage));
      return {
        ...safeForLocalStorage,
        apiKey
      };
    } catch (_error) {
      return {
        ...defaults,
        apiKey: storedApiKey
      };
    }
  }

  function saveDeepSeekSettings(settings) {
    const normalized = normalizeDeepSeekSettings(settings, defaultDeepSeekSettings());
    saveStoredApiKey(normalized.apiKey);
    const safeForLocalStorage = {
      ...normalized,
      apiKey: ""
    };
    window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(safeForLocalStorage));
    return {
      ...safeForLocalStorage,
      apiKey: loadStoredApiKey()
    };
  }

  function maskApiKey(value) {
    const key = typeof value === "string" ? value.trim() : "";
    if (!key) {
      return "(empty)";
    }
    if (key.length <= 8) {
      return "*".repeat(key.length);
    }
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  function parseJsonSafely(text) {
    if (typeof text !== "string" || text.length === 0) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function compactText(value, maxLength) {
    const input = typeof value === "string" ? value.trim() : "";
    if (input.length <= maxLength) {
      return input;
    }
    return `${input.slice(0, maxLength)}...`;
  }

  function extractErrorMessage(payload, fallbackStatus) {
    if (payload && typeof payload === "object") {
      if (payload.error && typeof payload.error.message === "string") {
        return payload.error.message;
      }
      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
    return `请求失败（HTTP ${fallbackStatus}）`;
  }

  class DeepSeekClient {
    constructor(initialSettings) {
      this.settings = normalizeDeepSeekSettings(initialSettings, defaultDeepSeekSettings());
      this.logs = [];
    }

    applySettings(nextSettings) {
      this.settings = normalizeDeepSeekSettings(nextSettings, this.settings);
      this.log("info", "settings.updated", {
        enabled: this.settings.enabled,
        model: this.settings.model,
        endpoint: this.settings.endpoint,
        apiKey: maskApiKey(this.settings.apiKey)
      });
      return this.getSettings();
    }

    getSettings() {
      return { ...this.settings };
    }

    getLogs() {
      return this.logs.slice();
    }

    clearLogs() {
      this.logs = [];
    }

    log(level, event, detail) {
      this.logs.push({
        timestamp: new Date().toISOString(),
        level,
        event,
        detail: normalizeObject(detail)
      });
      if (this.logs.length > MAX_LOG_ENTRIES) {
        this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
      }
    }

    async requestChat(options) {
      const input = normalizeObject(options);
      const mergedSettings = normalizeDeepSeekSettings(input.settings, this.settings);
      const useProxyEndpoint = isProxyEndpoint(mergedSettings.endpoint);
      var isNativeEnv = !!(window.NativeBridge && window.NativeBridge.getServerUrl);
      var useNativeProxy = isNativeEnv && window.NativeBridge.llmProxyAsync;
      if (!mergedSettings.apiKey && !(useProxyEndpoint && !useNativeProxy)) {
        this.log("warn", "request.blocked", { reason: "missing_api_key" });
        return {
          ok: false,
          error: "请先在设置中填写 DeepSeek API Key。",
          code: "MISSING_API_KEY",
          stage: "validate"
        };
      }

      const messages = Array.isArray(input.messages) && input.messages.length > 0
        ? input.messages
        : [{ role: "user", content: "请回复：连接成功" }];
      const timeoutMs = clamp(
        Math.round(toFiniteNumber(input.timeoutMs, mergedSettings.timeoutMs)),
        3000,
        120000
      );
      const temperature = clamp(toFiniteNumber(input.temperature, mergedSettings.temperature), 0, 1.5);
      const maxTokens = clamp(
        Math.round(toFiniteNumber(input.maxTokens, mergedSettings.maxTokens)),
        32,
        8192
      );

      const isThinkingModel = /deepseek-v4-pro|deepseek-reasoner/i.test(mergedSettings.model);
      const requestBody = {
        model: mergedSettings.model,
        messages,
        max_tokens: maxTokens,
        stream: false
      };

      if (isThinkingModel) {
        requestBody.thinking = { type: "enabled" };
        requestBody.reasoning_effort = "high";
      } else {
        requestBody.temperature = temperature;
      }

      const startedAt = Date.now();
      const requestId = makeRequestId();
      const messageChars = messages.reduce((sum, msg) => sum + String(msg && msg.content ? msg.content : "").length, 0);
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
      });

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        var fetchEndpoint = mergedSettings.endpoint;
        var fetchBody = Object.assign({}, requestBody);
        var response, rawText;

        if (isNativeEnv && window.NativeBridge.llmProxyAsync) {
          if (mergedSettings.apiKey) {
            fetchBody.apiKey = mergedSettings.apiKey;
          }
          if (mergedSettings.endpoint && !isProxyEndpoint(mergedSettings.endpoint)) {
            try {
              var u = new URL(mergedSettings.endpoint);
              fetchBody.proxyTarget = u.origin + u.pathname;
            } catch (_) { }
          }

          var proxyResultJson = await Promise.race([
            llmProxyAsync(requestId, JSON.stringify(fetchBody)),
            new Promise(function (_, reject) {
              setTimeout(function () { reject(new DOMException("The user aborted a request.", "AbortError")); }, timeoutMs);
            })
          ]);

          var proxyJson = parseJsonSafely(proxyResultJson);
          if (proxyJson && proxyJson.error) {
            return {
              ok: false,
              requestId,
              status: proxyJson.status || 502,
              elapsedMs: Date.now() - startedAt,
              error: proxyJson.error,
              code: "PROXY_ERROR",
              stage: "request"
            };
          }
          var proxyStatus = (proxyJson && proxyJson.status) || 200;
          rawText = (proxyJson && proxyJson.body) || "{}";
          response = { ok: proxyStatus >= 200 && proxyStatus < 300, status: proxyStatus };
        } else {
          const headers = {
            "Content-Type": "application/json"
          };
          if (!useProxyEndpoint && mergedSettings.apiKey) {
            headers.Authorization = `Bearer ${mergedSettings.apiKey}`;
          }

          const fetchResponse = await window.fetch(fetchEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(fetchBody),
            signal: controller.signal
          });
          response = fetchResponse;
          rawText = await fetchResponse.text();
        }

        const elapsedMs = Date.now() - startedAt;
        const payload = parseJsonSafely(rawText);

        if (!response.ok) {
          const message = extractErrorMessage(payload, response.status);
          this.log("error", "request.http_error", {
            requestId,
            status: response.status,
            elapsedMs,
            message,
            payloadPreview: compactText(rawText, 160)
          });
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
          };
        }

        const message = payload
          && payload.choices
          && payload.choices[0]
          && payload.choices[0].message
          ? payload.choices[0].message
          : null;

        const content = message && typeof message.content === "string"
          ? message.content
          : "";

        const reasoningContent = message && typeof message.reasoning_content === "string"
          ? message.reasoning_content
          : (message && typeof message.reasoning === "string" ? message.reasoning : "");

        this.log("info", "request.success", {
          requestId,
          status: response.status,
          elapsedMs,
          usage: payload && payload.usage ? payload.usage : null,
          contentPreview: compactText(content, 100)
        });

        return {
          ok: true,
          requestId,
          status: response.status,
          elapsedMs,
          content,
          reasoningContent,
          usage: payload && payload.usage ? payload.usage : null,
          raw: payload
        };
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        const timeoutError = error && error.name === "AbortError";
        if (timeoutError && isNativeEnv && window.NativeBridge && window.NativeBridge.llmProxyCancel) {
          window.NativeBridge.llmProxyCancel(requestId);
        }
        llmProxyResolvers.delete(requestId);
        const endpointLooksLegacy = /api\.deepseek\.com\/chat\/completions/i.test(mergedSettings.endpoint);
        const message = timeoutError
          ? `请求超时（>${timeoutMs}ms）`
          : `网络错误：${error && error.message ? error.message : "未知错误"}`;
        const hint = timeoutError
          ? "可能是并发请求偏多、网络抖动或上游处理较慢。"
          : "可能是网络不可达、浏览器拦截、DNS/TLS异常，或 endpoint 不可用。";

        this.log("error", "request.exception", {
          requestId,
          elapsedMs,
          timeout: timeoutError,
          message,
          errorName: error && error.name ? error.name : "",
          errorMessage: error && error.message ? error.message : "",
          endpoint: mergedSettings.endpoint,
          model: mergedSettings.model,
          timeoutMs,
          hint,
          endpointLooksLegacy
        });

        return {
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
            errorName: error && error.name ? error.name : "",
            errorMessage: error && error.message ? error.message : "",
            hint,
            endpointLooksLegacy
          }
        };
      } finally {
        window.clearTimeout(timeoutId);
        llmProxyResolvers.delete(requestId);
      }
    }

    async testConnection(overrideSettings) {
      const settings = normalizeDeepSeekSettings(overrideSettings, this.settings);
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
      });

      if (!result.ok) {
        return result;
      }

      return {
        ...result,
        message: compactText(result.content || "连接成功", 80)
      };
    }
  }

  window.DeepSeekLLM = {
    LLM_STORAGE_KEY,
    defaultDeepSeekSettings,
    normalizeDeepSeekSettings,
    loadDeepSeekSettings,
    saveDeepSeekSettings,
    maskApiKey,
    DeepSeekClient
  };
})(window);
