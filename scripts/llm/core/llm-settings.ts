/**
 * @file llm/core/llm-settings.js
 * @module llm/core/llm-settings
 * @description LLM 设置 UI 模块。提供设置表单读写、连接测试、开关管理。
 *              从 scene-llm.js 拆分而来。
 */
export function createLlmSettingsModule(deps: any) {
  const { AI_LLM_SWITCH_STORAGE_KEY, LLM_SETTINGS, maskApiKey } = deps

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
      const source = values || (typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS)
      if (this.dom.settingLlmEnabled) {
        this.dom.settingLlmEnabled.checked = Boolean(source.enabled)
      }
      if (this.dom.settingLlmMultiGameMemoryEnabled) {
        this.dom.settingLlmMultiGameMemoryEnabled.checked = Boolean(source.multiGameMemoryEnabled)
      }
      if (this.dom.settingLlmReflectionEnabled) {
        this.dom.settingLlmReflectionEnabled.checked = Boolean(source.reflectionEnabled)
      }
      if (this.dom.settingLlmThinkingEnabled) {
        this.dom.settingLlmThinkingEnabled.checked = Boolean(source.thinkingEnabled || false)
      }
      const thinkingParamsInput = document.getElementById("setting-thinkingParams") as HTMLInputElement | null
      if (thinkingParamsInput) {
        thinkingParamsInput.value = source.thinkingParams || ""
      }
      const thinkingModeParams = document.getElementById("thinkingModeParams")
      if (thinkingModeParams && this.dom.settingLlmThinkingEnabled) {
        if (this.dom.settingLlmThinkingEnabled.checked) {
          thinkingModeParams.classList.remove("hidden")
        } else {
          thinkingModeParams.classList.add("hidden")
        }
      }
      const contextLengthInline = document.getElementById("contextLengthInline")
      if (contextLengthInline) {
        if (this.dom.settingLlmMultiGameMemoryEnabled && this.dom.settingLlmMultiGameMemoryEnabled.checked) {
          contextLengthInline.classList.remove("hidden")
        } else {
          contextLengthInline.classList.add("hidden")
        }
      }
      const summaryConfig = document.getElementById("summaryConfig")
      if (summaryConfig) {
        if (this.dom.settingLlmMultiGameMemoryEnabled && this.dom.settingLlmMultiGameMemoryEnabled.checked) {
          summaryConfig.classList.remove("hidden")
        } else {
          summaryConfig.classList.add("hidden")
        }
      }
      const autoSummarizeCheckbox = document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null
      if (autoSummarizeCheckbox) {
        autoSummarizeCheckbox.checked = source.autoSummarizeEnabled !== false
      }
      const contextLengthInput = document.getElementById("setting-contextLength") as HTMLInputElement | null
      if (contextLengthInput) {
        contextLengthInput.value = String(source.contextLength || 5)
      }
      const reflectionScopeConfig = document.getElementById("reflectionScopeConfig")
      if (reflectionScopeConfig) {
        if (this.dom.settingLlmReflectionEnabled && this.dom.settingLlmReflectionEnabled.checked) {
          reflectionScopeConfig.classList.remove("hidden")
        } else {
          reflectionScopeConfig.classList.add("hidden")
        }
      }
      const reflectionScope = source.reflectionScope || "current"
      const scopeRadios = document.querySelectorAll('input[name="reflectionScope"]') as NodeListOf<HTMLInputElement>
      scopeRadios.forEach((radio) => {
        radio.checked = radio.value === reflectionScope
      })
      const independentModelCheckbox =
        this.dom.settingLlmIndependentModelEnabled || document.getElementById("setting-llmIndependentModelEnabled") as HTMLInputElement | null
      console.log("[fillLlmSettingsForm] independentModelCheckbox:", independentModelCheckbox ? "found" : "not found")
      if (independentModelCheckbox) {
        independentModelCheckbox.checked = Boolean(source.independentModelEnabled)
        console.log(
          "[fillLlmSettingsForm] set independentModelCheckbox.checked to:",
          independentModelCheckbox.checked
        )
      }
      if (this.dom.independentModelConfig) {
        if (source.independentModelEnabled) {
          this.dom.independentModelConfig.classList.remove("hidden")
        } else {
          this.dom.independentModelConfig.classList.add("hidden")
        }
      }
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled") as HTMLInputElement | null
      if (independentReflectionCheckbox) {
        independentReflectionCheckbox.checked =
          source.independentReflectionEnabled !== undefined ? Boolean(source.independentReflectionEnabled) : true
      }
      const apiKeyInput = this.dom.settingDeepseekApiKey || document.getElementById("setting-llmApiKey") as HTMLInputElement | null
      if (apiKeyInput) {
        apiKeyInput.value = source.apiKey || ""
      }
      const modelInput = this.dom.settingDeepseekModel || document.getElementById("setting-llmModel") as HTMLInputElement | null
      if (modelInput) {
        modelInput.value = source.model || ""
      }
      const endpointInput = document.getElementById("setting-llmEndpoint") as HTMLInputElement | null
      if (endpointInput) {
        endpointInput.value = source.endpoint || ""
      }
      if (this.dom.settingMaxTokens) {
        this.dom.settingMaxTokens.value = Number(source.maxTokens) || 2048
      }

      if (!source.apiKey) {
        this.setLlmSettingsStatus("尚未填写 API Key。", "normal")
        return
      }
      this.setLlmSettingsStatus(`已读取本地密钥：${maskApiKey(source.apiKey)}`, "normal")
    },

    readLlmSettingsForm() {
      const currentSettings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      const apiKeyInput = this.dom.settingDeepseekApiKey || document.getElementById("setting-llmApiKey") as HTMLInputElement | null
      const modelInput = this.dom.settingDeepseekModel || document.getElementById("setting-llmModel") as HTMLInputElement | null
      const endpointInput = document.getElementById("setting-llmEndpoint") as HTMLInputElement | null
      const independentModelCheckbox =
        this.dom.settingLlmIndependentModelEnabled || document.getElementById("setting-llmIndependentModelEnabled") as HTMLInputElement | null
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled") as HTMLInputElement | null
      const contextLengthInput = document.getElementById("setting-contextLength") as HTMLInputElement | null
      const autoSummarizeCheckbox = document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null
      const scopeRadio = document.querySelector('input[name="reflectionScope"]:checked') as HTMLInputElement | null

      return {
        enabled: this.dom.settingLlmEnabled ? this.dom.settingLlmEnabled.checked : currentSettings.enabled,
        multiGameMemoryEnabled: this.dom.settingLlmMultiGameMemoryEnabled
          ? this.dom.settingLlmMultiGameMemoryEnabled.checked
          : currentSettings.multiGameMemoryEnabled,
        reflectionEnabled: this.dom.settingLlmReflectionEnabled
          ? this.dom.settingLlmReflectionEnabled.checked
          : currentSettings.reflectionEnabled,
        thinkingEnabled: this.dom.settingLlmThinkingEnabled
          ? this.dom.settingLlmThinkingEnabled.checked
          : currentSettings.thinkingEnabled || false,
        thinkingParams: (function () {
          const el = document.getElementById("setting-thinkingParams") as HTMLInputElement | null
          return el ? el.value.trim() : currentSettings.thinkingParams || ""
        })(),
        apiKey: apiKeyInput ? apiKeyInput.value : currentSettings.apiKey,
        model: modelInput ? modelInput.value : currentSettings.model,
        endpoint: endpointInput ? endpointInput.value || currentSettings.endpoint : currentSettings.endpoint,
        timeoutMs: currentSettings.timeoutMs,
        temperature: currentSettings.temperature,
        maxTokens: this.dom.settingMaxTokens
          ? Math.max(1000, Number(this.dom.settingMaxTokens.value) || 2048)
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
      }
    },

    setLlmSettingsStatus(text: string, state: string) {
      if (!this.dom.settingsLlmStatusText) {
        return
      }
      this.dom.settingsLlmStatusText.textContent = text
      this.dom.settingsLlmStatusText.classList.remove("is-success", "is-error", "is-pending")
      if (state === "success") {
        this.dom.settingsLlmStatusText.classList.add("is-success")
      } else if (state === "error") {
        this.dom.settingsLlmStatusText.classList.add("is-error")
      } else if (state === "pending") {
        this.dom.settingsLlmStatusText.classList.add("is-pending")
      }
    },

    async testDeepSeekConnectionFromOverlay() {
      if (this.deepSeekTesting) {
        return
      }

      const input = this.readLlmSettingsForm()
      const modelName = (input && input.model) || "大模型"
      if (!input.apiKey) {
        this.setLlmSettingsStatus("请先填写 API Key，再进行连接测试。", "error")
        this.writeLog(`${modelName}连接测试取消：未填写 API Key。`)
        return
      }

      this.deepSeekTesting = true
      if (this.dom.settingsTestDeepSeekBtn) {
        this.dom.settingsTestDeepSeekBtn.disabled = true
      }
      this.setLlmSettingsStatus(`正在连接 ${modelName}，请稍候...`, "pending")

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        if (!provider) {
          this.setLlmSettingsStatus("LLM Provider 未初始化", "error")
          return
        }
        const result = await provider.testConnection(input)
        if (result.ok) {
          this.setLlmSettingsStatus(`${modelName}连接成功${result.message ? `：${result.message}` : ""}`, "success")
          this.writeLog(`${modelName}连接成功，耗时 ${result.elapsedMs}ms。`)
        } else {
          this.setLlmSettingsStatus(`${modelName}连接失败：${result.error || "未知错误"}`, "error")
          this.writeLog(`${modelName}连接失败：${result.error || "未知错误"}`)
        }
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : "未知异常"
        this.setLlmSettingsStatus(`${modelName}连接异常：${message}`, "error")
        this.writeLog(`${modelName}连接异常：${message}`)
      } finally {
        this.deepSeekTesting = false
        if (this.dom.settingsTestDeepSeekBtn) {
          this.dom.settingsTestDeepSeekBtn.disabled = false
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
