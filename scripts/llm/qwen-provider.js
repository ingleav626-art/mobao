(function attachQwenProvider(window) {
  "use strict";

  if (!window.LlmManager) {
    console.error("LlmManager not loaded. Please load llm-manager.js first.");
    return;
  }

  const { createOpenAICompatibleProvider, utils } = window.LlmManager;
  const { clamp, toFiniteNumber, normalizeObject } = utils;

  const QWEN_STORAGE_KEY = "mobao_qwen_settings_v1";
  const QWEN_API_KEY_STORAGE_KEY = "mobao_qwen_api_key_v1";

  function defaultQwenSettings() {
    return {
      provider: "qwen",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      thinkingParams: "",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: "qwen-turbo",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
  }

  function normalizeQwenSettings(source, fallback) {
    const defaults = {
      ...defaultQwenSettings(),
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

    return {
      provider: "qwen",
      enabled: Boolean(input.enabled),
      multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
      reflectionEnabled: Boolean(input.reflectionEnabled),
      thinkingEnabled: Boolean(input.thinkingEnabled),
      thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
      endpoint: endpointRaw || defaults.endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 2),
      maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
    };
  }

  function isQwenThinkingModel(model) {
    return /qwen.*think|qwen.*reasoning/i.test(model);
  }

  function buildRequestBody(settings, context) {
    const { isThinking, temperature } = context;
    const isQwenThinkingModelName = isQwenThinkingModel(settings.model);
    const body = {};

    if (isThinking && isQwenThinkingModelName) {
      body.enable_thinking = true;
    } else {
      body.temperature = temperature;
    }

    if (isThinking && settings.thinkingParams) {
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
    supportsFeature: function (feature) {
      const supportedFeatures = ["streaming", "thinking"];
      return supportedFeatures.indexOf(feature) !== -1;
    }
  });

  const provider = {
    ...qwenProvider,
    id: "qwen",
    name: "通义千问",
    description: "阿里云通义千问，支持 qwen-turbo、qwen-plus、qwen-max 等模型"
  };

  window.LlmManager.registerProvider(provider);

  window.QwenProvider = {
    id: "qwen",
    name: "通义千问",
    QWEN_STORAGE_KEY,
    QWEN_API_KEY_STORAGE_KEY,
    defaultQwenSettings,
    normalizeQwenSettings,
    isQwenThinkingModel,
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
