(function attachOpenAIProvider(window) {
  "use strict";

  if (!window.LlmManager) {
    console.error("LlmManager not loaded. Please load llm-manager.js first.");
    return;
  }

  const { createOpenAICompatibleProvider, utils } = window.LlmManager;
  const { clamp, toFiniteNumber, normalizeObject } = utils;

  const OPENAI_STORAGE_KEY = "mobao_openai_settings_v1";
  const OPENAI_API_KEY_STORAGE_KEY = "mobao_openai_api_key_v1";

  function defaultOpenAISettings() {
    return {
      provider: "openai",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      thinkingParams: "",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
  }

  function normalizeOpenAISettings(source, fallback) {
    const defaults = {
      ...defaultOpenAISettings(),
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
      provider: "openai",
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

  function isOpenAIThinkingModel(model) {
    return /o1-|o3-/i.test(model);
  }

  function buildRequestBody(settings, context) {
    const { isThinking, temperature } = context;
    const isOpenAIThinkingModelName = isOpenAIThinkingModel(settings.model);
    const body = {};

    if (isThinking && isOpenAIThinkingModelName) {
      body.reasoning_effort = "medium";
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

  const openAIProvider = createOpenAICompatibleProvider({
    id: "openai",
    name: "OpenAI",
    description: "OpenAI GPT 系列模型，支持 GPT-4o、GPT-3.5 等",
    storageKey: OPENAI_STORAGE_KEY,
    apiKeyStorageKey: OPENAI_API_KEY_STORAGE_KEY,
    defaultSettings: defaultOpenAISettings,
    normalizeSettings: normalizeOpenAISettings,
    isThinkingModel: isOpenAIThinkingModel,
    buildRequestBody: buildRequestBody,
    supportsFeature: function (feature) {
      const supportedFeatures = ["streaming", "vision"];
      return supportedFeatures.indexOf(feature) !== -1;
    }
  });

  const provider = {
    ...openAIProvider,
    id: "openai",
    name: "OpenAI",
    description: "OpenAI GPT 系列模型，支持 GPT-4o、GPT-3.5 等"
  };

  window.LlmManager.registerProvider(provider);

  window.OpenAIProvider = {
    id: "openai",
    name: "OpenAI",
    OPENAI_STORAGE_KEY,
    OPENAI_API_KEY_STORAGE_KEY,
    defaultOpenAISettings,
    normalizeOpenAISettings,
    isOpenAIThinkingModel,
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
