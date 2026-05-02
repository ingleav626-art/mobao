(function attachLlmManager(window) {
  "use strict";

  const LLM_MANAGER_STORAGE_KEY = "mobao_llm_manager_v1";
  const CUSTOM_PROVIDERS_STORAGE_KEY = "mobao_custom_providers_v1";
  const MAX_LOG_ENTRIES = 120;

  const providers = new Map();
  let activeProviderId = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeObject(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    return value;
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

  function loadStoredApiKey(providerId) {
    try {
      const value = window.localStorage.getItem(`mobao_${providerId}_api_key_v1`);
      return typeof value === "string" ? value.trim() : "";
    } catch (_error) {
      return "";
    }
  }

  function saveStoredApiKey(providerId, value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    try {
      if (normalized) {
        window.localStorage.setItem(`mobao_${providerId}_api_key_v1`, normalized);
      } else {
        window.localStorage.removeItem(`mobao_${providerId}_api_key_v1`);
      }
    } catch (_error) {
    }
  }

  function loadManagerSettings() {
    try {
      const raw = window.localStorage.getItem(LLM_MANAGER_STORAGE_KEY);
      if (!raw) {
        return { activeProviderId: null };
      }
      const parsed = parseJsonSafely(raw);
      return parsed && typeof parsed === "object" ? parsed : { activeProviderId: null };
    } catch (_error) {
      return { activeProviderId: null };
    }
  }

  function saveManagerSettings(settings) {
    try {
      window.localStorage.setItem(LLM_MANAGER_STORAGE_KEY, JSON.stringify(settings));
    } catch (_error) {
    }
  }

  function loadCustomProviders() {
    try {
      const raw = window.localStorage.getItem(CUSTOM_PROVIDERS_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = parseJsonSafely(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function saveCustomProviders(list) {
    try {
      window.localStorage.setItem(CUSTOM_PROVIDERS_STORAGE_KEY, JSON.stringify(list));
    } catch (_error) {
    }
  }

  function registerProvider(provider) {
    if (!provider || typeof provider !== "object") {
      throw new Error("Provider must be an object");
    }
    if (!provider.id || typeof provider.id !== "string") {
      throw new Error("Provider must have a string id");
    }
    if (typeof provider.requestChat !== "function") {
      throw new Error("Provider must implement requestChat method");
    }

    providers.set(provider.id, {
      id: provider.id,
      name: provider.name || provider.id,
      description: provider.description || "",
      defaultSettings: provider.defaultSettings || function () { return {}; },
      normalizeSettings: provider.normalizeSettings || function (s) { return s || {}; },
      loadSettings: provider.loadSettings || function () { return this.defaultSettings(); },
      saveSettings: provider.saveSettings || function () { },
      requestChat: provider.requestChat,
      testConnection: provider.testConnection || defaultTestConnection,
      getSettings: provider.getSettings || function () { return {}; },
      applySettings: provider.applySettings || function (s) { return s; },
      getLogs: provider.getLogs || function () { return []; },
      clearLogs: provider.clearLogs || function () { },
      isThinkingModel: provider.isThinkingModel || function (model) { return false; },
      supportsFeature: provider.supportsFeature || function (feature) { return false; }
    });

    if (activeProviderId === null) {
      const managerSettings = loadManagerSettings();
      if (managerSettings.activeProviderId && providers.has(managerSettings.activeProviderId)) {
        activeProviderId = managerSettings.activeProviderId;
      } else if (providers.size === 1) {
        activeProviderId = provider.id;
      }
    }
  }

  function unregisterProvider(providerId) {
    if (!providers.has(providerId)) {
      return false;
    }
    providers.delete(providerId);
    if (activeProviderId === providerId) {
      activeProviderId = providers.size > 0 ? providers.keys().next().value : null;
    }
    return true;
  }

  function getProvider(providerId) {
    if (providerId) {
      const p = providers.get(providerId) || null;
      console.log("[LlmManager.getProvider] by id:", providerId, "result:", p ? p.id : null);
      return p;
    }
    const p = providers.get(activeProviderId) || null;
    console.log("[LlmManager.getProvider] activeProviderId:", activeProviderId, "result:", p ? p.id : null);
    return p;
  }

  function getActiveProviderId() {
    return activeProviderId;
  }

  function setActiveProvider(providerId) {
    console.log("[LlmManager.setActiveProvider] providerId:", providerId, "exists:", providers.has(providerId));
    if (!providers.has(providerId)) {
      return false;
    }
    activeProviderId = providerId;
    saveManagerSettings({ activeProviderId });
    console.log("[LlmManager.setActiveProvider] success, activeProviderId:", activeProviderId);
    return true;
  }

  function listProviders() {
    return Array.from(providers.values()).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description
      };
    });
  }

  async function defaultTestConnection(overrideSettings) {
    const provider = getProvider();
    if (!provider) {
      return {
        ok: false,
        error: "没有可用的LLM Provider",
        code: "NO_PROVIDER"
      };
    }
    const result = await provider.requestChat({
      settings: overrideSettings,
      temperature: 0,
      maxTokens: 64,
      messages: [
        { role: "system", content: "你是接口连通性测试助手。收到请求后请只回复四个字：连接成功。" },
        { role: "user", content: "请仅回复：连接成功" }
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

  async function requestChat(options) {
    const provider = getProvider();
    if (!provider) {
      return {
        ok: false,
        error: "没有可用的LLM Provider，请先注册Provider。",
        code: "NO_PROVIDER",
        stage: "validate"
      };
    }
    return provider.requestChat(options);
  }

  async function testConnection(providerId, overrideSettings) {
    const provider = getProvider(providerId);
    if (!provider) {
      return {
        ok: false,
        error: "指定的Provider不存在",
        code: "PROVIDER_NOT_FOUND"
      };
    }
    return provider.testConnection(overrideSettings);
  }

  function createBaseProvider(config) {
    const id = config.id;
    const name = config.name || id;
    const description = config.description || "";
    const storageKey = config.storageKey || `mobao_${id}_settings_v1`;
    const apiKeyStorageKey = config.apiKeyStorageKey || `mobao_${id}_api_key_v1`;

    const logs = [];

    function log(level, event, detail) {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        event,
        detail: normalizeObject(detail)
      });
      if (logs.length > MAX_LOG_ENTRIES) {
        logs.splice(0, logs.length - MAX_LOG_ENTRIES);
      }
    }

    function getLogs() {
      return logs.slice();
    }

    function clearLogs() {
      logs.length = 0;
    }

    function loadProviderApiKey() {
      try {
        const value = window.localStorage.getItem(apiKeyStorageKey);
        return typeof value === "string" ? value.trim() : "";
      } catch (_error) {
        return "";
      }
    }

    function saveProviderApiKey(value) {
      const normalized = typeof value === "string" ? value.trim() : "";
      try {
        if (normalized) {
          window.localStorage.setItem(apiKeyStorageKey, normalized);
        } else {
          window.localStorage.removeItem(apiKeyStorageKey);
        }
      } catch (_error) {
      }
    }

    function loadSettings() {
      const defaults = config.defaultSettings();
      try {
        const raw = window.localStorage.getItem(storageKey);
        console.log("[loadSettings] storageKey:", storageKey, "raw:", raw);
        const storedApiKey = loadProviderApiKey();
        if (!raw) {
          console.log("[loadSettings] no raw data, returning defaults");
          return { ...defaults, apiKey: storedApiKey };
        }
        const parsed = parseJsonSafely(raw);
        console.log("[loadSettings] parsed:", parsed);
        const normalized = config.normalizeSettings(parsed, defaults);
        console.log("[loadSettings] normalized thinkingEnabled:", normalized.thinkingEnabled);
        const keyFromLocal = typeof normalized.apiKey === "string" ? normalized.apiKey.trim() : "";
        const apiKey = storedApiKey || keyFromLocal;
        if (apiKey) {
          saveProviderApiKey(apiKey);
        }
        const safeForLocalStorage = { ...normalized, apiKey: "" };
        window.localStorage.setItem(storageKey, JSON.stringify(safeForLocalStorage));
        return { ...safeForLocalStorage, apiKey };
      } catch (_error) {
        console.log("[loadSettings] error:", _error);
        return { ...defaults, apiKey: loadProviderApiKey() };
      }
    }

    function saveSettings(settings) {
      console.log("[saveSettings] input settings:", settings);
      const normalized = config.normalizeSettings(settings, config.defaultSettings());
      console.log("[saveSettings] normalized thinkingEnabled:", normalized.thinkingEnabled);
      saveProviderApiKey(normalized.apiKey);
      const safeForLocalStorage = { ...normalized, apiKey: "" };
      window.localStorage.setItem(storageKey, JSON.stringify(safeForLocalStorage));
      return { ...safeForLocalStorage, apiKey: loadProviderApiKey() };
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
      isThinkingModel: config.isThinkingModel || function (model) { return false; },
      supportsFeature: config.supportsFeature || function (feature) { return false; },
      storageKey,
      apiKeyStorageKey
    };
  }

  function createOpenAICompatibleProvider(config) {
    const base = createBaseProvider(config);

    async function requestChat(options) {
      console.log("[requestChat] provider:", base.id, "options:", options);
      const input = normalizeObject(options);
      const mergedSettings = config.normalizeSettings(input.settings, base.loadSettings());
      console.log("[requestChat] mergedSettings:", { model: mergedSettings.model, endpoint: mergedSettings.endpoint, apiKey: mergedSettings.apiKey ? "(已设置)" : "(未设置)" });
      const useProxyEndpoint = isProxyEndpoint(mergedSettings.endpoint);
      const isNativeEnv = !!(window.NativeBridge && window.NativeBridge.getServerUrl);
      const useNativeProxy = isNativeEnv && window.NativeBridge.llmProxyAsync;

      if (!mergedSettings.apiKey && !(useProxyEndpoint && !useNativeProxy)) {
        console.log("[requestChat] BLOCKED: missing_api_key");
        base.log("warn", "request.blocked", { reason: "missing_api_key" });
        return {
          ok: false,
          error: `请先在设置中填写 ${base.name} API Key。`,
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
      const temperature = clamp(toFiniteNumber(input.temperature, mergedSettings.temperature), 0, 2);
      const maxTokens = clamp(
        Math.round(toFiniteNumber(input.maxTokens, mergedSettings.maxTokens)),
        32,
        8192
      );

      const isThinking = input.isThinking === true;
      const requestBody = {
        model: mergedSettings.model,
        messages,
        max_tokens: maxTokens,
        stream: false
      };

      if (config.buildRequestBody) {
        Object.assign(requestBody, config.buildRequestBody(mergedSettings, { isThinking, temperature }));
      } else if (!isThinking) {
        requestBody.temperature = temperature;
      }

      if (isThinking && mergedSettings.thinkingParams) {
        try {
          const customParams = JSON.parse(mergedSettings.thinkingParams);
          if (customParams && typeof customParams === "object") {
            Object.assign(requestBody, customParams);
          }
        } catch (_e) {
          base.log("warn", "thinkingParams.parse.error", { thinkingParams: mergedSettings.thinkingParams });
        }
      }

      const startedAt = Date.now();
      const requestId = `${base.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const messageChars = messages.reduce(function (sum, msg) {
        return sum + String(msg && msg.content ? msg.content : "").length;
      }, 0);

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
      });

      const controller = new AbortController();
      const timeoutId = window.setTimeout(function () {
        controller.abort();
      }, timeoutMs);

      try {
        let fetchEndpoint = mergedSettings.endpoint;

        if (fetchEndpoint && !fetchEndpoint.includes('/chat/completions')) {
          fetchEndpoint = fetchEndpoint.replace(/\/+$/, '') + '/chat/completions';
        }

        let fetchBody = Object.assign({}, requestBody);
        let response, rawText;

        if (isNativeEnv && window.NativeBridge.llmProxyAsync) {
          if (mergedSettings.apiKey) {
            fetchBody.apiKey = mergedSettings.apiKey;
          }
          if (mergedSettings.endpoint && !isProxyEndpoint(mergedSettings.endpoint)) {
            try {
              const u = new URL(mergedSettings.endpoint);
              fetchBody.proxyTarget = u.origin + u.pathname;
            } catch (_) { }
          }

          const llmProxyResolvers = window.__llmProxyResolvers || new Map();
          window.__llmProxyResolvers = llmProxyResolvers;

          if (!window.__llmProxyCallback) {
            window.__llmProxyCallback = function (requestId, b64Result) {
              const entry = llmProxyResolvers.get(requestId);
              if (entry) {
                llmProxyResolvers.delete(requestId);
                try {
                  let decoded = atob(b64Result);
                  if (typeof TextDecoder !== "undefined") {
                    const bytes = new Uint8Array(decoded.length);
                    for (let i = 0; i < decoded.length; i++) {
                      bytes[i] = decoded.charCodeAt(i);
                    }
                    entry.resolve(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
                  } else {
                    const resultJson = unescape(decoded.split("").map(function (c) {
                      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
                    }).join(""));
                    entry.resolve(resultJson);
                  }
                } catch (e) {
                  entry.resolve(b64Result);
                }
              }
            };
          }

          const proxyResultJson = await Promise.race([
            new Promise(function (resolve) {
              llmProxyResolvers.set(requestId, { resolve: resolve });
              window.NativeBridge.llmProxyAsync(requestId, JSON.stringify(fetchBody));
            }),
            new Promise(function (_, reject) {
              setTimeout(function () {
                reject(new DOMException("The user aborted a request.", "AbortError"));
              }, timeoutMs);
            })
          ]);

          const proxyJson = parseJsonSafely(proxyResultJson);
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
          const proxyStatus = (proxyJson && proxyJson.status) || 200;
          rawText = (proxyJson && proxyJson.body) || "{}";
          response = { ok: proxyStatus >= 200 && proxyStatus < 300, status: proxyStatus };
        } else {
          const headers = { "Content-Type": "application/json" };
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

        base.log("info", "response.raw", {
          requestId,
          status: response.status,
          elapsedMs,
          rawPreview: compactText(rawText, 500),
          hasChoices: payload && Array.isArray(payload.choices),
          choicesLength: payload && payload.choices ? payload.choices.length : 0
        });

        if (!response.ok) {
          const message = extractErrorMessage(payload, response.status);
          base.log("error", "request.http_error", {
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

        base.log("info", "response.parsed", {
          requestId,
          hasMessage: message !== null,
          messageKeys: message ? Object.keys(message) : [],
          contentType: message && message.content ? typeof message.content : "none",
          contentLength: content.length,
          contentPreview: compactText(content, 200)
        });

        let reasoningContent = "";
        if (message && typeof message.reasoning_content === "string") {
          reasoningContent = message.reasoning_content;
        } else if (message && typeof message.reasoning === "string") {
          reasoningContent = message.reasoning;
        }

        base.log("info", "request.success", {
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
        if (window.__llmProxyResolvers) {
          window.__llmProxyResolvers.delete(requestId);
        }
        const message = timeoutError
          ? `请求超时（>${timeoutMs}ms）`
          : `网络错误：${error && error.message ? error.message : "未知错误"}`;

        base.log("error", "request.exception", {
          requestId,
          elapsedMs,
          timeout: timeoutError,
          message,
          errorName: error && error.name ? error.name : "",
          errorMessage: error && error.message ? error.message : ""
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
            errorMessage: error && error.message ? error.message : ""
          }
        };
      } finally {
        window.clearTimeout(timeoutId);
        if (window.__llmProxyResolvers) {
          window.__llmProxyResolvers.delete(requestId);
        }
      }
    }

    async function testConnection(overrideSettings) {
      const settings = config.normalizeSettings(overrideSettings, base.loadSettings());
      const result = await requestChat({
        settings,
        temperature: 0,
        maxTokens: 64,
        messages: [
          { role: "system", content: "你是接口连通性测试助手。收到请求后请只回复四个字：连接成功。" },
          { role: "user", content: "请仅回复：连接成功" }
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

    return {
      ...base,
      requestChat,
      testConnection
    };
  }

  window.LlmManager = {
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
    createDynamicProvider: function (config) {
      console.log("[createDynamicProvider] config:", config);
      const providerId = config.id || `custom_${Date.now()}`;
      console.log("[createDynamicProvider] providerId:", providerId);

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
            thinkingEnabled: false,
            thinkingParams: "",
            endpoint: config.endpoint || "",
            model: config.model || "",
            apiKey: "",
            timeoutMs: 40000,
            temperature: 0.2,
            maxTokens: 2048
          };
        },
        normalizeSettings: function (source, fallback) {
          const defaults = fallback || {
            provider: providerId,
            enabled: false,
            multiGameMemoryEnabled: false,
            reflectionEnabled: false,
            thinkingEnabled: false,
            thinkingParams: "",
            endpoint: config.endpoint || "",
            model: config.model || "",
            apiKey: "",
            timeoutMs: 40000,
            temperature: 0.2,
            maxTokens: 2048
          };
          const input = normalizeObject(source);
          return {
            provider: providerId,
            enabled: Boolean(input.enabled),
            multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
            reflectionEnabled: Boolean(input.reflectionEnabled),
            thinkingEnabled: Boolean(input.thinkingEnabled),
            thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
            endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : defaults.endpoint,
            model: typeof input.model === "string" ? input.model.trim() : defaults.model,
            apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : (defaults.apiKey || ""),
            timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
            temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
            maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
          };
        },
        isThinkingModel: function (model) { return false; },
        buildRequestBody: function (settings, context) {
          return { temperature: context.temperature };
        },
        supportsFeature: function (feature) { return false; }
      });

      registerProvider(provider);

      const customList = loadCustomProviders();
      const existingIndex = customList.findIndex(function (p) { return p.id === providerId; });
      const providerInfo = { id: providerId, name: config.name || providerId, description: config.description || "" };
      if (existingIndex >= 0) {
        customList[existingIndex] = providerInfo;
      } else {
        customList.push(providerInfo);
      }
      saveCustomProviders(customList);

      return provider;
    },
    deleteDynamicProvider: function (providerId) {
      if (providers.has(providerId)) {
        providers.delete(providerId);
      }
      const customList = loadCustomProviders();
      const filtered = customList.filter(function (p) { return p.id !== providerId; });
      saveCustomProviders(filtered);
      if (activeProviderId === providerId) {
        activeProviderId = providers.size > 0 ? providers.keys().next().value : null;
        saveManagerSettings({ activeProviderId });
      }
      try {
        window.localStorage.removeItem(`mobao_${providerId}_settings_v1`);
        window.localStorage.removeItem(`mobao_${providerId}_api_key_v1`);
      } catch (_error) { }
      return true;
    },
    initializeCustomProviders: function () {
      const customList = loadCustomProviders();
      customList.forEach(function (cfg) {
        if (!providers.has(cfg.id)) {
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
                thinkingEnabled: false,
                thinkingParams: "",
                endpoint: "",
                model: "",
                apiKey: "",
                timeoutMs: 40000,
                temperature: 0.2,
                maxTokens: 2048
              };
            },
            normalizeSettings: function (source, fallback) {
              const defaults = fallback || {
                provider: cfg.id,
                enabled: false,
                multiGameMemoryEnabled: false,
                reflectionEnabled: false,
                thinkingEnabled: false,
                thinkingParams: "",
                endpoint: "",
                model: "",
                apiKey: "",
                timeoutMs: 40000,
                temperature: 0.2,
                maxTokens: 2048
              };
              const input = normalizeObject(source);
              return {
                provider: cfg.id,
                enabled: Boolean(input.enabled),
                multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
                reflectionEnabled: Boolean(input.reflectionEnabled),
                thinkingEnabled: Boolean(input.thinkingEnabled),
                thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
                endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : defaults.endpoint,
                model: typeof input.model === "string" ? input.model.trim() : defaults.model,
                apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : (defaults.apiKey || ""),
                timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
                temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
                maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
              };
            },
            isThinkingModel: function (model) { return false; },
            buildRequestBody: function (settings, context) {
              return { temperature: context.temperature };
            },
            supportsFeature: function (feature) { return false; }
          });
          registerProvider(provider);
        }
      });

      const managerSettings = loadManagerSettings();
      console.log("[LlmManager.init] managerSettings:", managerSettings);
      console.log("[LlmManager.init] available providers:", Array.from(providers.keys()));
      if (managerSettings.activeProviderId && providers.has(managerSettings.activeProviderId)) {
        activeProviderId = managerSettings.activeProviderId;
        console.log("[LlmManager.init] set activeProviderId from storage:", activeProviderId);
      } else if (providers.size > 0) {
        activeProviderId = providers.keys().next().value;
        console.log("[LlmManager.init] set activeProviderId to first provider:", activeProviderId);
      } else {
        console.log("[LlmManager.init] no providers available");
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
  };
})(window);
