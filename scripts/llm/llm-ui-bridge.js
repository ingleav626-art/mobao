(function attachLlmUiBridge(window) {
  "use strict";

  const BUILTIN_PROVIDERS = {
    deepseek: {
      name: "DeepSeek",
      description: "DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型",
      defaultEndpoint: "/api/deepseek/chat/completions",
      defaultModel: "deepseek-v4-flash",
      placeholder: "sk-...",
      endpointPlaceholder: "/api/deepseek/chat/completions 或 https://api.deepseek.com/v1/chat/completions",
      builtin: true
    },
    openai: {
      name: "OpenAI",
      description: "OpenAI GPT 系列模型，支持 GPT-4o、GPT-3.5 等",
      defaultEndpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
      placeholder: "sk-...",
      endpointPlaceholder: "https://api.openai.com/v1/chat/completions",
      builtin: true
    },
    qwen: {
      name: "通义千问",
      description: "阿里云通义千问，支持 qwen-turbo、qwen-plus、qwen-max 等模型",
      defaultEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      defaultModel: "qwen-turbo",
      placeholder: "sk-...",
      endpointPlaceholder: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      builtin: true
    },
    glm: {
      name: "智谱GLM",
      description: "智谱AI GLM系列，支持 glm-4、glm-4-flash、glm-z1 等模型",
      defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      defaultModel: "glm-4-flash",
      placeholder: "...",
      endpointPlaceholder: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      builtin: true
    },
    kimi: {
      name: "Kimi",
      description: "Moonshot Kimi，支持 moonshot-v1-8k、moonshot-v1-32k 等模型",
      defaultEndpoint: "https://api.moonshot.cn/v1/chat/completions",
      defaultModel: "moonshot-v1-8k",
      placeholder: "sk-...",
      endpointPlaceholder: "https://api.moonshot.cn/v1/chat/completions",
      builtin: true
    }
  };

  function getElements() {
    return {
      providerSelect: document.getElementById("setting-llmProvider"),
      providerDesc: document.getElementById("llmProviderDesc"),
      apiKeyInput: document.getElementById("setting-llmApiKey"),
      apiKeyLabel: document.getElementById("llmApiKeyLabel"),
      endpointInput: document.getElementById("setting-llmEndpoint"),
      endpointLabel: document.getElementById("llmEndpointLabel"),
      modelInput: document.getElementById("setting-llmModel"),
      maxTokensInput: document.getElementById("setting-maxTokens"),
      timeoutMsInput: document.getElementById("setting-timeoutMs"),
      thinkingParamsInput: document.getElementById("setting-thinkingParams"),
      thinkingParamsDiv: document.getElementById("thinkingModeParams"),
      enabledCheckbox: document.getElementById("setting-llmEnabled"),
      multiGameMemoryCheckbox: document.getElementById("setting-llmMultiGameMemoryEnabled"),
      reflectionCheckbox: document.getElementById("setting-llmReflectionEnabled"),
      thinkingCheckbox: document.getElementById("setting-llmThinkingEnabled"),
      testBtn: document.getElementById("settingsTestLlmBtn"),
      statusText: document.getElementById("settingsLlmStatusText"),
      addProviderBtn: document.getElementById("addCustomProviderBtn"),
      deleteProviderBtn: document.getElementById("deleteProviderBtn"),
      customProviderModal: document.getElementById("customProviderModal"),
      customProviderName: document.getElementById("customProviderName"),
      customProviderEndpoint: document.getElementById("customProviderEndpoint"),
      customProviderModel: document.getElementById("customProviderModel"),
      customProviderConfirm: document.getElementById("customProviderConfirm"),
      customProviderCancel: document.getElementById("customProviderCancel")
    };
  }

  function getCurrentProviderId() {
    const els = getElements();
    return els.providerSelect ? els.providerSelect.value : "deepseek";
  }

  function getProviderConfig(providerId) {
    if (BUILTIN_PROVIDERS[providerId]) {
      return BUILTIN_PROVIDERS[providerId];
    }
    if (window.LlmManager) {
      const customList = window.LlmManager.loadCustomProviders();
      const found = customList.find(function (p) { return p.id === providerId; });
      if (found) {
        return {
          name: found.name,
          description: found.description || "用户自定义模型",
          defaultEndpoint: "",
          defaultModel: "",
          placeholder: "your-api-key",
          endpointPlaceholder: "https://your-api.com/v1/chat/completions",
          builtin: false
        };
      }
    }
    return {
      name: providerId,
      description: "自定义模型",
      defaultEndpoint: "",
      defaultModel: "",
      placeholder: "your-api-key",
      endpointPlaceholder: "https://your-api.com/v1/chat/completions",
      builtin: false
    };
  }

  function updateUiForProvider(providerId) {
    const config = getProviderConfig(providerId);
    const els = getElements();

    if (els.providerDesc) {
      els.providerDesc.textContent = config.description;
    }

    if (els.apiKeyInput) {
      els.apiKeyInput.placeholder = config.placeholder;
    }

    if (els.endpointInput) {
      els.endpointInput.placeholder = config.endpointPlaceholder;
    }

    if (els.modelInput && !els.modelInput.value) {
      els.modelInput.placeholder = config.defaultModel || "model-name";
    }

    if (els.deleteProviderBtn) {
      els.deleteProviderBtn.style.display = config.builtin ? "none" : "";
    }

    if (els.testBtn) {
      els.testBtn.textContent = `测试 ${config.name} 连接`;
    }
  }

  function refreshProviderSelect(selectValue) {
    const els = getElements();
    if (!els.providerSelect) return;

    els.providerSelect.innerHTML = "";

    const optgroup1 = document.createElement("optgroup");
    optgroup1.label = "预定义模型";

    Object.keys(BUILTIN_PROVIDERS).forEach(function (id) {
      const config = BUILTIN_PROVIDERS[id];
      const option = document.createElement("option");
      option.value = id;
      option.textContent = config.name;
      optgroup1.appendChild(option);
    });

    els.providerSelect.appendChild(optgroup1);

    if (window.LlmManager) {
      const customList = window.LlmManager.loadCustomProviders();
      if (customList.length > 0) {
        const optgroup2 = document.createElement("optgroup");
        optgroup2.label = "自定义模型";

        customList.forEach(function (p) {
          const option = document.createElement("option");
          option.value = p.id;
          option.textContent = p.name;
          optgroup2.appendChild(option);
        });

        els.providerSelect.appendChild(optgroup2);
      }
    }

    if (selectValue && els.providerSelect.querySelector('option[value="' + selectValue + '"]')) {
      els.providerSelect.value = selectValue;
    }
  }

  function loadProviderSettings(providerId) {
    console.log("[loadProviderSettings] providerId:", providerId);
    const provider = window.LlmManager ? window.LlmManager.getProvider(providerId) : null;
    const els = getElements();
    console.log("[loadProviderSettings] provider:", provider ? provider.id : null);

    if (provider) {
      const settings = provider.loadSettings();
      console.log("[loadProviderSettings] settings:", settings);
      if (els.apiKeyInput) els.apiKeyInput.value = settings.apiKey || "";
      if (els.endpointInput) els.endpointInput.value = settings.endpoint || "";
      if (els.modelInput) els.modelInput.value = settings.model || "";
      if (els.maxTokensInput) els.maxTokensInput.value = settings.maxTokens || 2048;
      if (els.timeoutMsInput) els.timeoutMsInput.value = settings.timeoutMs || 40000;
      if (els.thinkingParamsInput) els.thinkingParamsInput.value = settings.thinkingParams || "";
      if (els.enabledCheckbox) els.enabledCheckbox.checked = settings.enabled || false;
      if (els.multiGameMemoryCheckbox) els.multiGameMemoryCheckbox.checked = settings.multiGameMemoryEnabled || false;
      if (els.reflectionCheckbox) els.reflectionCheckbox.checked = settings.reflectionEnabled || false;
      if (els.thinkingCheckbox) els.thinkingCheckbox.checked = settings.thinkingEnabled || false;
    } else {
      console.log("[loadProviderSettings] provider not found, using defaults");
      const config = getProviderConfig(providerId);
      if (els.apiKeyInput) els.apiKeyInput.value = "";
      if (els.endpointInput) els.endpointInput.value = config.defaultEndpoint || "";
      if (els.modelInput) els.modelInput.value = config.defaultModel || "";
      if (els.maxTokensInput) els.maxTokensInput.value = 2048;
      if (els.timeoutMsInput) els.timeoutMsInput.value = 40000;
      if (els.thinkingParamsInput) els.thinkingParamsInput.value = "";
    }

    updateThinkingParamsVisibility(els);
    updateUiForProvider(providerId);
  }

  function updateThinkingParamsVisibility(els) {
    if (els.thinkingParamsDiv && els.thinkingCheckbox) {
      if (els.thinkingCheckbox.checked) {
        els.thinkingParamsDiv.classList.remove("hidden");
      } else {
        els.thinkingParamsDiv.classList.add("hidden");
      }
    }
  }

  function saveProviderSettings(providerId) {
    console.log("[saveProviderSettings] providerId:", providerId);
    const els = getElements();
    console.log("[saveProviderSettings] thinkingCheckbox element:", els.thinkingCheckbox, "checked:", els.thinkingCheckbox ? els.thinkingCheckbox.checked : "N/A");
    const settings = {
      enabled: els.enabledCheckbox ? els.enabledCheckbox.checked : false,
      multiGameMemoryEnabled: els.multiGameMemoryCheckbox ? els.multiGameMemoryCheckbox.checked : false,
      reflectionEnabled: els.reflectionCheckbox ? els.reflectionCheckbox.checked : false,
      thinkingEnabled: els.thinkingCheckbox ? els.thinkingCheckbox.checked : false,
      apiKey: els.apiKeyInput ? els.apiKeyInput.value.trim() : "",
      endpoint: els.endpointInput ? els.endpointInput.value.trim() : "",
      model: els.modelInput ? els.modelInput.value.trim() : "",
      maxTokens: els.maxTokensInput ? parseInt(els.maxTokensInput.value, 10) || 2048 : 2048,
      timeoutMs: els.timeoutMsInput ? parseInt(els.timeoutMsInput.value, 10) || 40000 : 40000,
      thinkingParams: els.thinkingParamsInput ? els.thinkingParamsInput.value.trim() : ""
    };
    console.log("[saveProviderSettings] settings.thinkingEnabled:", settings.thinkingEnabled, "timeoutMs:", settings.timeoutMs);

    if (window.LlmManager) {
      const provider = window.LlmManager.getProvider(providerId);
      if (provider) {
        provider.saveSettings(settings);
      }
      window.LlmManager.setActiveProvider(providerId);
    }

    return settings;
  }

  async function testConnection(providerId) {
    const els = getElements();
    const settings = saveProviderSettings(providerId);
    const config = getProviderConfig(providerId);
    const providerName = config.name || providerId;

    if (!settings.apiKey && settings.endpoint && !settings.endpoint.startsWith("/")) {
      if (els.statusText) {
        els.statusText.textContent = `${providerName}：请先填写 API Key`;
        els.statusText.className = "settings-inline-hint is-error";
      }
      return { ok: false, error: "请先填写 API Key" };
    }

    if (els.testBtn) els.testBtn.disabled = true;
    if (els.statusText) {
      els.statusText.textContent = `正在连接 ${providerName}...`;
      els.statusText.className = "settings-inline-hint is-pending";
    }

    try {
      let result;
      if (window.LlmManager) {
        result = await window.LlmManager.testConnection(providerId, settings);
      } else {
        result = { ok: false, error: "LlmManager 未加载" };
      }

      if (result.ok) {
        if (els.statusText) {
          els.statusText.textContent = `${providerName} 连接成功${result.message ? `：${result.message}` : ""}`;
          els.statusText.className = "settings-inline-hint is-success";
        }
      } else {
        const errorDetail = result.error || result.code || "未知错误";
        if (els.statusText) {
          els.statusText.textContent = `${providerName} 连接失败：${errorDetail}`;
          els.statusText.className = "settings-inline-hint is-error";
        }
      }
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : "未知异常";
      const stack = error && error.stack ? error.stack : "";
      console.error("[LlmUiBridge] testConnection exception", error);
      if (els.statusText) {
        els.statusText.textContent = `${providerName} 连接异常：${message}`;
        els.statusText.className = "settings-inline-hint is-error";
      }
      return { ok: false, error: message, stack };
    } finally {
      if (els.testBtn) els.testBtn.disabled = false;
    }
  }

  function showAddProviderModal() {
    const els = getElements();
    if (els.customProviderModal) {
      els.customProviderModal.classList.remove("hidden");
      els.customProviderModal.removeAttribute("hidden");
      if (els.customProviderName) els.customProviderName.value = "";
      if (els.customProviderEndpoint) els.customProviderEndpoint.value = "";
      if (els.customProviderModel) els.customProviderModel.value = "";
    }
  }

  function hideAddProviderModal() {
    const els = getElements();
    if (els.customProviderModal) {
      els.customProviderModal.classList.add("hidden");
      els.customProviderModal.setAttribute("hidden", "");
    }
  }

  function addCustomProvider() {
    const els = getElements();
    const name = els.customProviderName ? els.customProviderName.value.trim() : "";
    const endpoint = els.customProviderEndpoint ? els.customProviderEndpoint.value.trim() : "";
    const model = els.customProviderModel ? els.customProviderModel.value.trim() : "";

    if (!name) {
      alert("请输入模型名称");
      return;
    }

    if (window.LlmManager) {
      try {
        const provider = window.LlmManager.createDynamicProvider({
          name: name,
          endpoint: endpoint,
          model: model,
          description: `自定义模型：${name}`
        });

        if (!provider || !provider.id) {
          alert("创建模型失败：无法获取 provider ID");
          return;
        }

        const newProviderId = provider.id;

        // 先清除 UI 中的旧数据，避免保存错误的数据
        if (els.apiKeyInput) els.apiKeyInput.value = "";
        if (els.endpointInput) els.endpointInput.value = endpoint;
        if (els.modelInput) els.modelInput.value = model;
        if (els.maxTokensInput) els.maxTokensInput.value = 2048;
        if (els.enabledCheckbox) els.enabledCheckbox.checked = false;
        if (els.multiGameMemoryCheckbox) els.multiGameMemoryCheckbox.checked = false;
        if (els.reflectionCheckbox) els.reflectionCheckbox.checked = false;

        // 保存用户输入的初始设置
        provider.saveSettings({
          enabled: false,
          multiGameMemoryEnabled: false,
          reflectionEnabled: false,
          apiKey: "",
          endpoint: endpoint,
          model: model,
          maxTokens: 2048
        });

        refreshProviderSelect(newProviderId);
        loadProviderSettings(newProviderId);
        window.LlmManager.setActiveProvider(newProviderId);

        hideAddProviderModal();
      } catch (error) {
        console.error("[LlmUiBridge] addCustomProvider error", error);
        alert(`添加模型失败：${error.message || error}`);
      }
    }
  }

  function deleteCurrentProvider() {
    const providerId = getCurrentProviderId();
    const config = getProviderConfig(providerId);
    const els = getElements();

    if (config.builtin) {
      alert("预定义模型不能删除");
      return;
    }

    if (!confirm(`确定要删除模型 "${config.name}" 吗？此操作不可恢复。`)) {
      return;
    }

    if (window.LlmManager) {
      window.LlmManager.deleteDynamicProvider(providerId);
      refreshProviderSelect("deepseek");

      if (els.providerSelect) {
        els.providerSelect.value = "deepseek";
        loadProviderSettings("deepseek");
      }
    }
  }

  function initialize() {
    var els = getElements();

    if (window.LlmManager && window.LlmManager.initializeCustomProviders) {
      window.LlmManager.initializeCustomProviders();
    }

    const managerSettings = window.LlmManager ? window.LlmManager.getActiveProviderId() : null;
    const initialProviderId = managerSettings || "deepseek";

    let isInitializing = true;

    if (els.providerSelect) {
      els.providerSelect.addEventListener("change", function () {
        if (isInitializing) {
          return;
        }

        const previousProviderId = window.LlmManager ? window.LlmManager.getActiveProviderId() : null;
        if (previousProviderId && previousProviderId !== this.value) {
          saveProviderSettings(previousProviderId);
        }

        const providerId = this.value;
        loadProviderSettings(providerId);
        if (window.LlmManager) {
          window.LlmManager.setActiveProvider(providerId);
        }
      });
    }

    refreshProviderSelect(initialProviderId);
    loadProviderSettings(initialProviderId);

    isInitializing = false;

    function autoSaveSettings() {
      const providerId = getCurrentProviderId();
      saveProviderSettings(providerId);
    }

    var autoSaveElements = [
      els.enabledCheckbox,
      els.multiGameMemoryCheckbox,
      els.reflectionCheckbox,
      els.thinkingCheckbox,
      els.apiKeyInput,
      els.endpointInput,
      els.modelInput,
      els.maxTokensInput,
      els.timeoutMsInput,
      els.thinkingParamsInput
    ];
    autoSaveElements.forEach(function (el) {
      if (el) {
        el.addEventListener("change", autoSaveSettings);
      }
    });

    if (els.thinkingCheckbox) {
      els.thinkingCheckbox.addEventListener("change", function () {
        updateThinkingParamsVisibility(getElements());
      });
    }

    if (els.testBtn) {
      els.testBtn.addEventListener("click", function () {
        const providerId = getCurrentProviderId();
        testConnection(providerId);
      });
    }

    if (els.addProviderBtn) {
      els.addProviderBtn.addEventListener("click", showAddProviderModal);
    }

    if (els.deleteProviderBtn) {
      els.deleteProviderBtn.addEventListener("click", deleteCurrentProvider);
    }

    if (els.customProviderConfirm) {
      els.customProviderConfirm.addEventListener("click", addCustomProvider);
    }

    if (els.customProviderCancel) {
      els.customProviderCancel.addEventListener("click", hideAddProviderModal);
    }

    var customProviderCancel2 = document.getElementById("customProviderCancel2");
    if (customProviderCancel2) {
      customProviderCancel2.addEventListener("click", hideAddProviderModal);
    }

    if (els.customProviderModal) {
      els.customProviderModal.addEventListener("click", function (e) {
        if (e.target === els.customProviderModal) {
          hideAddProviderModal();
        }
      });
    }
  }

  function getActiveProviderSettings() {
    const providerId = getCurrentProviderId();
    const provider = window.LlmManager ? window.LlmManager.getProvider(providerId) : null;

    if (provider) {
      return provider.loadSettings();
    }

    return {
      provider: providerId,
      enabled: false,
      apiKey: "",
      endpoint: "",
      model: "",
      maxTokens: 2048
    };
  }

  window.LlmUiBridge = {
    initialize,
    getCurrentProviderId,
    updateUiForProvider,
    loadProviderSettings,
    saveProviderSettings,
    testConnection,
    getActiveProviderSettings,
    refreshProviderSelect,
    showAddProviderModal,
    hideAddProviderModal,
    addCustomProvider,
    deleteCurrentProvider,
    BUILTIN_PROVIDERS
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    setTimeout(initialize, 0);
  }
})(window);
