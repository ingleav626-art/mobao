/**
 * @file llm/core/llm-settings.js
 * @module llm/core/llm-settings
 * @description LLM 设置 UI 模块。提供设置表单读写、连接测试、开关管理。
 *              从 scene-llm.js 拆分而来。
 *
 * @exports createLlmSettingsModule - 设置模块工厂函数
 */

interface LlmSettingsModuleThis {
  dom: Record<string, HTMLInputElement | HTMLElement | null>;
  getLlmSettings(): any;
  setLlmSettingsStatus(text: string, state: string): void;
  writeLog(message: string): void;
  deepSeekTesting: boolean;
  getLlmProvider(): any;
  readLlmSettingsForm(): any;
}

export function createLlmSettingsModule(deps: any) {
  const { AI_LLM_SWITCH_STORAGE_KEY, LLM_SETTINGS, maskApiKey } = deps;

  function loadAiLlmPlayerSwitches(players: any[]): Record<string, boolean> {
    const defaults: Record<string, boolean> = {}
      ; (players || []).forEach((player) => {
        if (!player.isHuman) {
          defaults[player.id] = true
        }
      })

    const raw = window.localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY)
    if (!raw) {
      return defaults
    }

    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") {
        return defaults
      }

      const merged = { ...defaults }
      Object.keys(defaults).forEach((playerId) => {
        if (Object.prototype.hasOwnProperty.call(parsed, playerId)) {
          const rawValue = parsed[playerId]
          if (typeof rawValue === "boolean") {
            merged[playerId] = rawValue
          } else if (typeof rawValue === "string") {
            const normalized = rawValue.trim().toLowerCase()
            if (normalized === "true" || normalized === "1") {
              merged[playerId] = true
            } else if (normalized === "false" || normalized === "0") {
              merged[playerId] = false
            }
          } else if (typeof rawValue === "number") {
            merged[playerId] = rawValue !== 0
          }
        }
      })
      return merged
    } catch (_error) {
      return defaults
    }
  }

  function saveAiLlmPlayerSwitches(value: any): void {
    if (!value || typeof value !== "object") {
      return
    }
    window.localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify(value))
  }

  const methods = {
    fillLlmSettingsForm(values?: any) {
      const self = this as unknown as LlmSettingsModuleThis;
      const source = values || (typeof self.getLlmSettings === "function" ? self.getLlmSettings() : LLM_SETTINGS);
      if (self.dom.settingLlmEnabled) {
        (self.dom.settingLlmEnabled as HTMLInputElement).checked = Boolean(source.enabled);
      }
      if (self.dom.settingLlmMultiGameMemoryEnabled) {
        (self.dom.settingLlmMultiGameMemoryEnabled as HTMLInputElement).checked = Boolean(source.multiGameMemoryEnabled);
      }
      if (self.dom.settingLlmReflectionEnabled) {
        (self.dom.settingLlmReflectionEnabled as HTMLInputElement).checked = Boolean(source.reflectionEnabled);
      }
      if (self.dom.settingLlmThinkingEnabled) {
        (self.dom.settingLlmThinkingEnabled as HTMLInputElement).checked = Boolean(source.thinkingEnabled || false);
      }
      const thinkingParamsInput = document.getElementById("setting-thinkingParams") as HTMLInputElement | null;
      if (thinkingParamsInput) {
        thinkingParamsInput.value = source.thinkingParams || "";
      }
      const thinkingModeParams = document.getElementById("thinkingModeParams");
      if (thinkingModeParams && self.dom.settingLlmThinkingEnabled) {
        if ((self.dom.settingLlmThinkingEnabled as HTMLInputElement).checked) {
          thinkingModeParams.classList.remove("hidden");
        } else {
          thinkingModeParams.classList.add("hidden");
        }
      }
      const contextLengthInline = document.getElementById("contextLengthInline");
      if (contextLengthInline) {
        if (self.dom.settingLlmMultiGameMemoryEnabled && (self.dom.settingLlmMultiGameMemoryEnabled as HTMLInputElement).checked) {
          contextLengthInline.classList.remove("hidden");
        } else {
          contextLengthInline.classList.add("hidden");
        }
      }
      const summaryConfig = document.getElementById("summaryConfig");
      if (summaryConfig) {
        if (self.dom.settingLlmMultiGameMemoryEnabled && (self.dom.settingLlmMultiGameMemoryEnabled as HTMLInputElement).checked) {
          summaryConfig.classList.remove("hidden");
        } else {
          summaryConfig.classList.add("hidden");
        }
      }
      const autoSummarizeCheckbox = document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null;
      if (autoSummarizeCheckbox) {
        autoSummarizeCheckbox.checked = source.autoSummarizeEnabled !== false;
      }
      const contextLengthInput = document.getElementById("setting-contextLength") as HTMLInputElement | null;
      if (contextLengthInput) {
        contextLengthInput.value = String(source.contextLength || 5);
      }
      const reflectionScopeConfig = document.getElementById("reflectionScopeConfig");
      if (reflectionScopeConfig) {
        if (self.dom.settingLlmReflectionEnabled && (self.dom.settingLlmReflectionEnabled as HTMLInputElement).checked) {
          reflectionScopeConfig.classList.remove("hidden");
        } else {
          reflectionScopeConfig.classList.add("hidden");
        }
      }
      const reflectionScope = source.reflectionScope || "current";
      const scopeRadios = document.querySelectorAll('input[name="reflectionScope"]') as NodeListOf<HTMLInputElement>;
      scopeRadios.forEach((radio) => {
        radio.checked = radio.value === reflectionScope;
      });
      const independentModelCheckbox =
        (self.dom.settingLlmIndependentModelEnabled as HTMLInputElement | null) || document.getElementById("setting-llmIndependentModelEnabled") as HTMLInputElement | null;
      console.log("[fillLlmSettingsForm] independentModelCheckbox:", independentModelCheckbox ? "found" : "not found");
      if (independentModelCheckbox) {
        independentModelCheckbox.checked = Boolean(source.independentModelEnabled);
        console.log(
          "[fillLlmSettingsForm] set independentModelCheckbox.checked to:",
          independentModelCheckbox.checked
        );
      }
      if (self.dom.independentModelConfig) {
        if (source.independentModelEnabled) {
          self.dom.independentModelConfig.classList.remove("hidden");
        } else {
          self.dom.independentModelConfig.classList.add("hidden");
        }
      }
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled") as HTMLInputElement | null;
      if (independentReflectionCheckbox) {
        independentReflectionCheckbox.checked =
          source.independentReflectionEnabled !== undefined ? Boolean(source.independentReflectionEnabled) : true;
      }
      const apiKeyInput = (self.dom.settingDeepseekApiKey as HTMLInputElement | null) || document.getElementById("setting-llmApiKey") as HTMLInputElement | null;
      if (apiKeyInput) {
        apiKeyInput.value = source.apiKey || "";
      }
      const modelInput = (self.dom.settingDeepseekModel as HTMLInputElement | null) || document.getElementById("setting-llmModel") as HTMLInputElement | null;
      if (modelInput) {
        modelInput.value = source.model || "";
      }
      const endpointInput = document.getElementById("setting-llmEndpoint") as HTMLInputElement | null;
      if (endpointInput) {
        endpointInput.value = source.endpoint || "";
      }
      if (self.dom.settingMaxTokens) {
        (self.dom.settingMaxTokens as HTMLInputElement).value = String(Number(source.maxTokens) || 2048);
      }

      if (!source.apiKey) {
        self.setLlmSettingsStatus("尚未填写 API Key。", "normal");
        return;
      }
      self.setLlmSettingsStatus(`已读取本地密钥：${maskApiKey(source.apiKey)}`, "normal");
    },

    readLlmSettingsForm() {
      const self = this as unknown as LlmSettingsModuleThis;
      const currentSettings = typeof self.getLlmSettings === "function" ? self.getLlmSettings() : LLM_SETTINGS;
      const apiKeyInput = (self.dom.settingDeepseekApiKey as HTMLInputElement | null) || document.getElementById("setting-llmApiKey") as HTMLInputElement | null;
      const modelInput = (self.dom.settingDeepseekModel as HTMLInputElement | null) || document.getElementById("setting-llmModel") as HTMLInputElement | null;
      const endpointInput = document.getElementById("setting-llmEndpoint") as HTMLInputElement | null;
      const independentModelCheckbox =
        (self.dom.settingLlmIndependentModelEnabled as HTMLInputElement | null) || document.getElementById("setting-llmIndependentModelEnabled") as HTMLInputElement | null;
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled") as HTMLInputElement | null;
      const contextLengthInput = document.getElementById("setting-contextLength") as HTMLInputElement | null;
      const autoSummarizeCheckbox = document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null;
      const scopeRadio = document.querySelector('input[name="reflectionScope"]:checked') as HTMLInputElement | null;

      return {
        enabled: self.dom.settingLlmEnabled ? (self.dom.settingLlmEnabled as HTMLInputElement).checked : currentSettings.enabled,
        multiGameMemoryEnabled: self.dom.settingLlmMultiGameMemoryEnabled
          ? (self.dom.settingLlmMultiGameMemoryEnabled as HTMLInputElement).checked
          : currentSettings.multiGameMemoryEnabled,
        reflectionEnabled: self.dom.settingLlmReflectionEnabled
          ? (self.dom.settingLlmReflectionEnabled as HTMLInputElement).checked
          : currentSettings.reflectionEnabled,
        thinkingEnabled: self.dom.settingLlmThinkingEnabled
          ? (self.dom.settingLlmThinkingEnabled as HTMLInputElement).checked
          : currentSettings.thinkingEnabled || false,
        thinkingParams: (function () {
          const el = document.getElementById("setting-thinkingParams") as HTMLInputElement | null;
          return el ? el.value.trim() : currentSettings.thinkingParams || "";
        })(),
        apiKey: apiKeyInput ? apiKeyInput.value : currentSettings.apiKey,
        model: modelInput ? modelInput.value : currentSettings.model,
        endpoint: endpointInput ? endpointInput.value || currentSettings.endpoint : currentSettings.endpoint,
        timeoutMs: currentSettings.timeoutMs,
        temperature: currentSettings.temperature,
        maxTokens: self.dom.settingMaxTokens
          ? Math.max(1000, Number((self.dom.settingMaxTokens as HTMLInputElement).value) || 2048)
          : currentSettings.maxTokens,
        independentModelEnabled: independentModelCheckbox
          ? independentModelCheckbox.checked
          : currentSettings.independentModelEnabled || false,
        independentReflectionEnabled: independentReflectionCheckbox
          ? independentReflectionCheckbox.checked
          : currentSettings.independentReflectionEnabled !== undefined
            ? currentSettings.independentReflectionEnabled
            : true,
        contextLength: contextLengthInput
          ? Math.max(2, Math.min(20, Math.round(Number(contextLengthInput.value) || 5)))
          : currentSettings.contextLength || 5,
        autoSummarizeEnabled: autoSummarizeCheckbox
          ? autoSummarizeCheckbox.checked
          : currentSettings.autoSummarizeEnabled !== false,
        reflectionScope: scopeRadio ? scopeRadio.value : currentSettings.reflectionScope || "current"
      };
    },

    setLlmSettingsStatus(text: string, state: string) {
      const self = this as unknown as LlmSettingsModuleThis;
      if (!self.dom.settingsLlmStatusText) {
        return;
      }
      self.dom.settingsLlmStatusText.textContent = text;
      self.dom.settingsLlmStatusText.classList.remove("is-success", "is-error", "is-pending");
      if (state === "success") {
        self.dom.settingsLlmStatusText.classList.add("is-success");
      } else if (state === "error") {
        self.dom.settingsLlmStatusText.classList.add("is-error");
      } else if (state === "pending") {
        self.dom.settingsLlmStatusText.classList.add("is-pending");
      }
    },

    async testDeepSeekConnectionFromOverlay() {
      const self = this as unknown as LlmSettingsModuleThis;
      if (self.deepSeekTesting) {
        return;
      }

      const input = self.readLlmSettingsForm();
      const modelName = (input && input.model) || "大模型";
      if (!input.apiKey) {
        self.setLlmSettingsStatus("请先填写 API Key，再进行连接测试。", "error");
        self.writeLog(`${modelName}连接测试取消：未填写 API Key。`);
        return;
      }

      self.deepSeekTesting = true;
      if (self.dom.settingsTestDeepSeekBtn) {
        (self.dom.settingsTestDeepSeekBtn as HTMLInputElement).disabled = true;
      }
      self.setLlmSettingsStatus(`正在连接 ${modelName}，请稍候...`, "pending");

      try {
        const provider = typeof self.getLlmProvider === "function" ? self.getLlmProvider() : null;
        if (!provider) {
          self.setLlmSettingsStatus("LLM Provider 未初始化", "error");
          return;
        }
        const result = await provider.testConnection(input);
        if (result.ok) {
          self.setLlmSettingsStatus(`${modelName}连接成功${result.message ? `：${result.message}` : ""}`, "success");
          self.writeLog(`${modelName}连接成功，耗时 ${result.elapsedMs}ms。`);
        } else {
          self.setLlmSettingsStatus(`${modelName}连接失败：${result.error || "未知错误"}`, "error");
          self.writeLog(`${modelName}连接失败：${result.error || "未知错误"}`);
        }
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : "未知异常";
        self.setLlmSettingsStatus(`${modelName}连接异常：${message}`, "error");
        self.writeLog(`${modelName}连接异常：${message}`);
      } finally {
        self.deepSeekTesting = false;
        if (self.dom.settingsTestDeepSeekBtn) {
          (self.dom.settingsTestDeepSeekBtn as HTMLInputElement).disabled = false;
        }
      }
    }
  }

  return {
    methods,
    loadAiLlmPlayerSwitches,
    saveAiLlmPlayerSwitches
  }
}
