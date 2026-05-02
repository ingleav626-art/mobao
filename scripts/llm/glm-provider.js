(function attachGlmProvider(window) {
  "use strict";

  if (!window.LlmManager) {
    console.error("LlmManager not loaded. Please load llm-manager.js first.");
    return;
  }

  const { createOpenAICompatibleProvider, utils } = window.LlmManager;
  const { clamp, toFiniteNumber, normalizeObject } = utils;

  const GLM_STORAGE_KEY = "mobao_glm_settings_v1";
  const GLM_API_KEY_STORAGE_KEY = "mobao_glm_api_key_v1";

  function defaultGlmSettings() {
    return {
      provider: "glm",
      enabled: false,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      thinkingParams: "",
      endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-flash",
      apiKey: "",
      timeoutMs: 40000,
      temperature: 0.2,
      maxTokens: 2048
    };
  }

  function normalizeGlmSettings(source, fallback) {
    const defaults = {
      ...defaultGlmSettings(),
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
      provider: "glm",
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

  function isGlmThinkingModel(model) {
    return /glm.*z1|glm.*think/i.test(model);
  }

  function buildRequestBody(settings, context) {
    const { isThinking, temperature } = context;
    const isGlmThinkingModelName = isGlmThinkingModel(settings.model);
    const body = {};

    if (isThinking && isGlmThinkingModelName) {
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

  const glmProvider = createOpenAICompatibleProvider({
    id: "glm",
    name: "智谱GLM",
    description: "智谱AI GLM系列，支持 glm-4、glm-4-flash、glm-z1 等模型",
    storageKey: GLM_STORAGE_KEY,
    apiKeyStorageKey: GLM_API_KEY_STORAGE_KEY,
    defaultSettings: defaultGlmSettings,
    normalizeSettings: normalizeGlmSettings,
    isThinkingModel: isGlmThinkingModel,
    buildRequestBody: buildRequestBody,
    supportsFeature: function (feature) {
      const supportedFeatures = ["streaming"];
      return supportedFeatures.indexOf(feature) !== -1;
    }
  });

  const provider = {
    ...glmProvider,
    id: "glm",
    name: "智谱GLM",
    description: "智谱AI GLM系列，支持 glm-4、glm-4-flash、glm-z1 等模型"
  };

  window.LlmManager.registerProvider(provider);

  window.GlmProvider = {
    id: "glm",
    name: "智谱GLM",
    GLM_STORAGE_KEY,
    GLM_API_KEY_STORAGE_KEY,
    defaultGlmSettings,
    normalizeGlmSettings,
    isGlmThinkingModel,
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
