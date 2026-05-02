(function attachKimiProvider(window) {
  "use strict";

  if (!window.LlmManager) {
    console.error("LlmManager not loaded. Please load llm-manager.js first.");
    return;
  }

  const { createOpenAICompatibleProvider, utils } = window.LlmManager;
  const { clamp, toFiniteNumber, normalizeObject } = utils;

  const KIMI_STORAGE_KEY = "mobao_kimi_settings_v1";
  const KIMI_API_KEY_STORAGE_KEY = "mobao_kimi_api_key_v1";

  function defaultKimiSettings() {
    return {
      provider: "kimi",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      thinkingParams: "",
      endpoint: "https://api.moonshot.cn/v1/chat/completions",
      model: "moonshot-v1-8k",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
  }

  function normalizeKimiSettings(source, fallback) {
    const defaults = {
      ...defaultKimiSettings(),
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
      provider: "kimi",
      enabled: Boolean(input.enabled),
      multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
      reflectionEnabled: Boolean(input.reflectionEnabled),
      thinkingEnabled: Boolean(input.thinkingEnabled),
      thinkingParams: typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
      endpoint: endpointRaw || defaults.endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, 1),
      maxTokens: clamp(Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)), 32, 4096)
    };
  }

  const kimiProvider = createOpenAICompatibleProvider({
    id: "kimi",
    name: "Kimi",
    description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型",
    storageKey: KIMI_STORAGE_KEY,
    apiKeyStorageKey: KIMI_API_KEY_STORAGE_KEY,
    defaultSettings: defaultKimiSettings,
    normalizeSettings: normalizeKimiSettings,
    isThinkingModel: function (model) { return false; },
    buildRequestBody: function (settings, context) {
      return { temperature: context.temperature };
    },
    supportsFeature: function (feature) {
      const supportedFeatures = ["streaming"];
      return supportedFeatures.indexOf(feature) !== -1;
    }
  });

  const provider = {
    ...kimiProvider,
    id: "kimi",
    name: "Kimi",
    description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型"
  };

  window.LlmManager.registerProvider(provider);

  window.KimiProvider = {
    id: "kimi",
    name: "Kimi",
    KIMI_STORAGE_KEY,
    KIMI_API_KEY_STORAGE_KEY,
    defaultKimiSettings,
    normalizeKimiSettings,
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
