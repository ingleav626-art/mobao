(function attachDeepSeekProvider(window) {
  "use strict";

  if (!window.LlmManager) {
    console.error("LlmManager not loaded. Please load llm-manager.js first.");
    return;
  }

  const { createOpenAICompatibleProvider, utils } = window.LlmManager;
  const { clamp, toFiniteNumber, normalizeObject } = utils;

  const DEEPSEEK_STORAGE_KEY = "mobao_deepseek_settings_v2";
  const DEEPSEEK_API_KEY_STORAGE_KEY = "mobao_deepseek_api_key_v1";

  function defaultDeepSeekSettings() {
    return {
      provider: "deepseek",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      thinkingParams: "",
      endpoint: "/api/deepseek/chat/completions",
      model: "deepseek-v4-flash",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
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
      thinkingEnabled: Boolean(input.thinkingEnabled),
      thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
      endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1.5),
      maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
    };
  }

  function isDeepSeekThinkingModel(model) {
    return /deepseek-(v4|reasoner)/i.test(model);
  }

  function isThinkingModel(model) {
    return /deepseek-(v4|reasoner)|qwen.*think|glm.*z1|o1-|o3-/i.test(model);
  }

  function buildRequestBody(settings, context) {
    const { isThinking, temperature } = context;
    const isV4OrReasoner = isDeepSeekThinkingModel(settings.model);
    const body = {};

    if (isV4OrReasoner) {
      if (isThinking) {
        body.thinking = { type: "enabled" };
        body.reasoning_effort = "high";
      } else {
        body.thinking = { type: "disabled" };
        body.temperature = temperature;
      }
    } else {
      body.temperature = temperature;
    }

    if (isV4OrReasoner && isThinking && settings.thinkingParams) {
      try {
        const customParams = JSON.parse(settings.thinkingParams);
        if (customParams && typeof customParams === "object") {
          Object.assign(body, customParams);
        }
      } catch (_e) {
      }
    }

    return body;
  }

  const deepSeekProvider = createOpenAICompatibleProvider({
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型",
    storageKey: DEEPSEEK_STORAGE_KEY,
    apiKeyStorageKey: DEEPSEEK_API_KEY_STORAGE_KEY,
    defaultSettings: defaultDeepSeekSettings,
    normalizeSettings: normalizeDeepSeekSettings,
    isThinkingModel: isThinkingModel,
    buildRequestBody: buildRequestBody,
    supportsFeature: function (feature) {
      const supportedFeatures = ["thinking", "reasoning", "streaming"];
      return supportedFeatures.indexOf(feature) !== -1;
    }
  });

  const provider = {
    ...deepSeekProvider,
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型"
  };

  window.LlmManager.registerProvider(provider);

  window.DeepSeekProvider = {
    id: "deepseek",
    name: "DeepSeek",
    DEEPSEEK_STORAGE_KEY,
    DEEPSEEK_API_KEY_STORAGE_KEY,
    defaultDeepSeekSettings,
    normalizeDeepSeekSettings,
    isDeepSeekThinkingModel,
    isThinkingModel,
    getSettings: function () {
      return provider.loadSettings();
    },
    applySettings: function (settings) {
      return provider.saveSettings(settings);
    },
    getLogs: function () {
      return provider.getLogs();
    },
    clearLogs: function () {
      provider.clearLogs();
    },
    requestChat: function (options) {
      return provider.requestChat(options);
    },
    testConnection: function (overrideSettings) {
      return provider.testConnection(overrideSettings);
    }
  };
})(window);
