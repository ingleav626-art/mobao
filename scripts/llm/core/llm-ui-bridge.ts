/**
 * @file llm/core/llm-ui-bridge.ts
 * @module llm/core/llm-ui-bridge
 * @description LLM 设置 UI 桥接层。采用 IIFE 模式，挂载到 window.LlmUiBridge。
 *              连接 LlmManager 后端与设置面板 DOM，处理 Provider 切换、表单读写、
 *              连接测试、自定义 Provider 增删等 UI 交互。
 *
 * 内置 Provider 定义（BUILTIN_PROVIDERS）：
 *   - deepseek: DeepSeek V4/Reasoner，默认代理端点
 *   - openai: GPT-4o/3.5，OpenAI 官方端点
 *   - qwen: 通义千问，阿里云 DashScope 端点
 *   - glm: 智谱 GLM-4/Flash，智谱 API 端点
 *   - kimi: Moonshot，Moonshot API 端点
 *   每个定义含 name/description/defaultEndpoint/defaultModel/placeholder
 *
 *
*
 * 核心功能：
 * - initialize(): 初始化（DOM 就绪后自动调用），绑定事件、加载活跃 Provider
  * - updateUiForProvider(providerId): 切换 Provider 时更新 UI（描述 / 占位符 / 端点 / 模型）
 * - loadProviderSettings() / saveProviderSettings(): 从 / 向 DOM 表单读写设置
  * - testConnection(): 测试当前 Provider 连接（按钮禁用 + 状态反馈）
 * - getActiveProviderSettings(): 获取活跃 Provider 的完整设置
  * - refreshProviderSelect(): 刷新 Provider 下拉列表（含自定义 Provider）
 *
 * 自定义 Provider 管理：
 * - showAddProviderModal() / hideAddProviderModal(): 添加弹窗
  * - addCustomProvider(config): 添加自定义 Provider（通过 LlmManager.createDynamicProvider）
 * - deleteCurrentProvider(): 删除当前自定义 Provider（内置不可删）
 *
 * DOM 依赖（setting - llm * 系列 ID）：
 * setting - llmProvider, setting - llmApiKey, setting - llmEndpoint,
 * setting - llmModel, setting - llmTimeout, setting - llmTemperature, 等
  *
 * @requires LlmManager - LLM 管理器（scripts / llm / core / llm - manager.js）
 * @requires DOM - 设置面板表单元素
  *
 * @exports window.LlmUiBridge
  * {
  initialize, getCurrentProviderId, updateUiForProvider, loadProviderSettings,
  *     saveProviderSettings, testConnection, getActiveProviderSettings,
  *     refreshProviderSelect, showAddProviderModal, hideAddProviderModal,
  * @exports LlmUiBridge - LLM UI 桥接模块对象
    */
"use strict"
import { LlmManager } from "./llm-manager"
import type { CustomProvider } from '../../../types/llm'

const LLM_GLOBAL_SETTINGS_KEY = "mobao_llm_global_settings_v1"

interface LlmGlobalSettings {
  enabled: boolean
  multiGameMemoryEnabled: boolean
  reflectionEnabled: boolean
  thinkingEnabled: boolean
  independentModelEnabled: boolean
  independentReflectionEnabled: boolean
  contextLength: number
  autoSummarizeEnabled: boolean
  reflectionScope: string
}

const DEFAULT_GLOBAL_SETTINGS: LlmGlobalSettings = {
  enabled: false,
  multiGameMemoryEnabled: false,
  reflectionEnabled: false,
  thinkingEnabled: false,
  independentModelEnabled: false,
  independentReflectionEnabled: true,
  contextLength: 5,
  autoSummarizeEnabled: true,
  reflectionScope: "current"
}

function loadGlobalSettings(): LlmGlobalSettings {
  try {
    const raw = window.localStorage.getItem(LLM_GLOBAL_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_GLOBAL_SETTINGS, ...parsed }
    }
  } catch (_e) { }
  return { ...DEFAULT_GLOBAL_SETTINGS }
}

function saveGlobalSettings(settings: Partial<LlmGlobalSettings>): void {
  try {
    const current = loadGlobalSettings()
    const merged = { ...current, ...settings }
    window.localStorage.setItem(LLM_GLOBAL_SETTINGS_KEY, JSON.stringify(merged))
  } catch (_e) { }
}

interface ProviderConfig {
  name: string
  description: string
  defaultEndpoint: string
  defaultModel: string
  placeholder: string
  endpointPlaceholder: string
  builtin: boolean
}

const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
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
}

interface UiElements {
  providerSelect: HTMLElement | null
  providerDesc: HTMLElement | null
  apiKeyInput: HTMLElement | null
  apiKeyLabel: HTMLElement | null
  endpointInput: HTMLElement | null
  endpointLabel: HTMLElement | null
  modelInput: HTMLElement | null
  maxTokensInput: HTMLElement | null
  timeoutMsInput: HTMLElement | null
  thinkingParamsInput: HTMLElement | null
  thinkingParamsDiv: HTMLElement | null
  enabledCheckbox: HTMLElement | null
  multiGameMemoryCheckbox: HTMLElement | null
  reflectionCheckbox: HTMLElement | null
  thinkingCheckbox: HTMLElement | null
  independentModelCheckbox: HTMLElement | null
  contextLengthInline: HTMLElement | null
  contextLengthInput: HTMLInputElement | null
  summaryConfig: HTMLElement | null
  autoSummarizeCheckbox: HTMLInputElement | null
  reflectionScopeConfig: HTMLElement | null
  testBtn: HTMLElement | null
  statusText: HTMLElement | null
  addProviderBtn: HTMLElement | null
  deleteProviderBtn: HTMLElement | null
  customProviderModal: HTMLElement | null
  customProviderName: HTMLElement | null
  customProviderEndpoint: HTMLElement | null
  customProviderModel: HTMLElement | null
  customProviderConfirm: HTMLElement | null
  customProviderCancel: HTMLElement | null
}

function getElements(): UiElements {
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
    independentModelCheckbox: document.getElementById("setting-llmIndependentModelEnabled"),
    contextLengthInline: document.getElementById("contextLengthInline"),
    contextLengthInput: document.getElementById("setting-contextLength") as HTMLInputElement | null,
    summaryConfig: document.getElementById("summaryConfig"),
    autoSummarizeCheckbox: document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null,
    reflectionScopeConfig: document.getElementById("reflectionScopeConfig"),
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
  }
}

function getCurrentProviderId(): string {
  const els = getElements()
  return (els.providerSelect as HTMLSelectElement | null) ? (els.providerSelect as HTMLSelectElement).value : "deepseek"
}

function getProviderConfig(providerId: string): ProviderConfig {
  if (BUILTIN_PROVIDERS[providerId]) {
    return BUILTIN_PROVIDERS[providerId]
  }
  if (LlmManager) {
    const customList = LlmManager.loadCustomProviders()
    const found = customList.find(function (p: CustomProvider) {
      return p.id === providerId
    })
    if (found) {
      return {
        name: found.name,
        description: found.description || "用户自定义模型",
        defaultEndpoint: "",
        defaultModel: "",
        placeholder: "your-api-key",
        endpointPlaceholder: "https://your-api.com/v1/chat/completions",
        builtin: false
      }
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
  }
}

function updateUiForProvider(providerId: string): void {
  const config = getProviderConfig(providerId)
  const els = getElements()

  if (els.providerDesc) {
    els.providerDesc.textContent = config.description
  }

  if (els.apiKeyInput) {
    (els.apiKeyInput as HTMLInputElement).placeholder = config.placeholder
  }

  if (els.endpointInput) {
    (els.endpointInput as HTMLInputElement).placeholder = config.endpointPlaceholder
  }

  if (els.modelInput && !(els.modelInput as HTMLInputElement).value) {
    (els.modelInput as HTMLInputElement).placeholder = config.defaultModel || "model-name"
  }

  if (els.deleteProviderBtn) {
    els.deleteProviderBtn.style.display = config.builtin ? "none" : ""
  }

  if (els.testBtn) {
    els.testBtn.textContent = `测试 ${config.name} 连接`
  }
}

function refreshProviderSelect(selectValue?: string): void {
  console.log("[LlmUiBridge] refreshProviderSelect() 被调用, selectValue:", selectValue)
  const els = getElements()
  if (!els.providerSelect) {
    console.warn("[LlmUiBridge] refreshProviderSelect - providerSelect 元素未找到！")
    return
  }

  console.log("[LlmUiBridge] refreshProviderSelect - 清空并重建下拉选项")
  const selectElement = els.providerSelect as HTMLSelectElement
  selectElement.innerHTML = ""

  const optgroup1 = document.createElement("optgroup")
  optgroup1.label = "预定义模型"

  Object.keys(BUILTIN_PROVIDERS).forEach(function (id) {
    const config = BUILTIN_PROVIDERS[id]
    const option = document.createElement("option")
    option.value = id
    option.textContent = config.name
    optgroup1.appendChild(option)
  })

  els.providerSelect.appendChild(optgroup1)
  console.log("[LlmUiBridge] refreshProviderSelect - 已添加预定义模型选项")

  if (LlmManager) {
    const customList = LlmManager.loadCustomProviders()
    console.log("[LlmUiBridge] refreshProviderSelect - 自定义模型数量:", customList.length)
    if (customList.length > 0) {
      const optgroup2 = document.createElement("optgroup")
      optgroup2.label = "自定义模型"

      customList.forEach(function (p: CustomProvider) {
        const option = document.createElement("option")
        option.value = p.id
        option.textContent = p.name
        optgroup2.appendChild(option)
      })

      els.providerSelect!.appendChild(optgroup2)
      console.log("[LlmUiBridge] refreshProviderSelect - 已添加自定义模型选项")
    }
  }

  if (selectValue && els.providerSelect.querySelector('option[value="' + selectValue + '"]')) {
    const select = els.providerSelect as HTMLSelectElement
    console.log("[LlmUiBridge] refreshProviderSelect - 设置选中值为:", selectValue)
    select.value = ""
    select.value = selectValue
    select.dispatchEvent(new Event("change", { bubbles: false }))
  }
  console.log("[LlmUiBridge] refreshProviderSelect - 完成")
}

function loadProviderSettings(providerId: string): void {
  console.log("[loadProviderSettings] providerId:", providerId)
  const provider = LlmManager ? LlmManager.getProvider(providerId) : null
  const els = getElements()
  console.log("[loadProviderSettings] provider:", provider ? provider.id : null)

  const globalSettings = loadGlobalSettings()

  if (provider) {
    const settings = provider.loadSettings()
    console.log("[loadProviderSettings] settings:", settings)
    if (els.apiKeyInput) (els.apiKeyInput as HTMLInputElement).value = settings.apiKey || ""
    if (els.endpointInput) (els.endpointInput as HTMLInputElement).value = settings.endpoint || ""
    if (els.modelInput) (els.modelInput as HTMLInputElement).value = settings.model || ""
    if (els.maxTokensInput) (els.maxTokensInput as HTMLInputElement).value = settings.maxTokens || 2048
    if (els.timeoutMsInput) (els.timeoutMsInput as HTMLInputElement).value = settings.timeoutMs || 40000
    if (els.thinkingParamsInput) (els.thinkingParamsInput as HTMLInputElement).value = settings.thinkingParams || ""
    if (els.enabledCheckbox) (els.enabledCheckbox as HTMLInputElement).checked = globalSettings.enabled
    if (els.multiGameMemoryCheckbox) (els.multiGameMemoryCheckbox as HTMLInputElement).checked = globalSettings.multiGameMemoryEnabled
    if (els.reflectionCheckbox) (els.reflectionCheckbox as HTMLInputElement).checked = globalSettings.reflectionEnabled
    if (els.thinkingCheckbox) (els.thinkingCheckbox as HTMLInputElement).checked = globalSettings.thinkingEnabled
    if (els.independentModelCheckbox) (els.independentModelCheckbox as HTMLInputElement).checked = globalSettings.independentModelEnabled
  } else {
    console.log("[loadProviderSettings] provider not found, using defaults")
    const config = getProviderConfig(providerId)
    if (els.apiKeyInput) (els.apiKeyInput as HTMLInputElement).value = ""
    if (els.endpointInput) (els.endpointInput as HTMLInputElement).value = config.defaultEndpoint || ""
    if (els.modelInput) (els.modelInput as HTMLInputElement).value = config.defaultModel || ""
    if (els.maxTokensInput) (els.maxTokensInput as HTMLInputElement).value = String(2048)
    if (els.timeoutMsInput) (els.timeoutMsInput as HTMLInputElement).value = String(40000)
    if (els.thinkingParamsInput) (els.thinkingParamsInput as HTMLInputElement).value = ""
    if (els.enabledCheckbox) (els.enabledCheckbox as HTMLInputElement).checked = globalSettings.enabled
    if (els.multiGameMemoryCheckbox) (els.multiGameMemoryCheckbox as HTMLInputElement).checked = globalSettings.multiGameMemoryEnabled
    if (els.reflectionCheckbox) (els.reflectionCheckbox as HTMLInputElement).checked = globalSettings.reflectionEnabled
    if (els.thinkingCheckbox) (els.thinkingCheckbox as HTMLInputElement).checked = globalSettings.thinkingEnabled
    if (els.independentModelCheckbox) (els.independentModelCheckbox as HTMLInputElement).checked = globalSettings.independentModelEnabled
  }

  updateThinkingParamsVisibility(els)
  updateIndependentModelVisibility(els)
  updateMultiGameVisibility(els)
  updateUiForProvider(providerId)
}

function updateIndependentModelVisibility(els: UiElements): void {
  const independentModelConfig = document.getElementById("independentModelConfig")
  if (independentModelConfig && els.independentModelCheckbox) {
    if ((els.independentModelCheckbox as HTMLInputElement).checked) {
      independentModelConfig.classList.remove("hidden")
    } else {
      independentModelConfig.classList.add("hidden")
    }
  }
}

function updateMultiGameVisibility(els: UiElements): void {
  const contextLengthInline = document.getElementById("contextLengthInline")
  const summaryConfig = document.getElementById("summaryConfig")
  const checked = els.multiGameMemoryCheckbox ? (els.multiGameMemoryCheckbox as HTMLInputElement).checked : false
  if (contextLengthInline) {
    contextLengthInline.classList.toggle("hidden", !checked)
  }
  if (summaryConfig) {
    summaryConfig.classList.toggle("hidden", !checked)
  }
}

function updateThinkingParamsVisibility(els: UiElements): void {
  if (els.thinkingParamsDiv && els.thinkingCheckbox) {
    if ((els.thinkingCheckbox as HTMLInputElement).checked) {
      els.thinkingParamsDiv.classList.remove("hidden")
    } else {
      els.thinkingParamsDiv.classList.add("hidden")
    }
  }
}

function saveProviderSettings(providerId: string): {
  apiKey: string
  endpoint: string
  model: string
  maxTokens: number
  timeoutMs: number
  thinkingParams: string
} {
  console.log("[saveProviderSettings] providerId:", providerId)
  const els = getElements()
  console.log(
    "[saveProviderSettings] thinkingCheckbox element:",
    els.thinkingCheckbox,
    "checked:",
    els.thinkingCheckbox ? (els.thinkingCheckbox as HTMLInputElement).checked : "N/A"
  )

  saveGlobalSettings({
    enabled: els.enabledCheckbox ? (els.enabledCheckbox as HTMLInputElement).checked : false,
    multiGameMemoryEnabled: els.multiGameMemoryCheckbox ? (els.multiGameMemoryCheckbox as HTMLInputElement).checked : false,
    reflectionEnabled: els.reflectionCheckbox ? (els.reflectionCheckbox as HTMLInputElement).checked : false,
    thinkingEnabled: els.thinkingCheckbox ? (els.thinkingCheckbox as HTMLInputElement).checked : false,
    independentModelEnabled: els.independentModelCheckbox ? (els.independentModelCheckbox as HTMLInputElement).checked : false
  })

  const providerSettings = {
    apiKey: els.apiKeyInput ? (els.apiKeyInput as HTMLInputElement).value.trim() : "",
    endpoint: els.endpointInput ? (els.endpointInput as HTMLInputElement).value.trim() : "",
    model: els.modelInput ? (els.modelInput as HTMLInputElement).value.trim() : "",
    maxTokens: els.maxTokensInput ? parseInt((els.maxTokensInput as HTMLInputElement).value, 10) || 2048 : 2048,
    timeoutMs: els.timeoutMsInput ? parseInt((els.timeoutMsInput as HTMLInputElement).value, 10) || 40000 : 40000,
    thinkingParams: els.thinkingParamsInput ? (els.thinkingParamsInput as HTMLInputElement).value.trim() : ""
  }
  console.log(
    "[saveProviderSettings] providerSettings:",
    providerSettings
  )

  if (LlmManager) {
    const provider = LlmManager.getProvider(providerId)
    if (provider) {
      provider.saveSettings(providerSettings)
    }
    LlmManager.setActiveProvider(providerId)
  }

  return providerSettings
}

async function testConnection(providerId: string): Promise<any> {
  const els = getElements()
  const settings = saveProviderSettings(providerId)
  const config = getProviderConfig(providerId)
  const providerName = config.name || providerId

  if (!settings.apiKey && settings.endpoint && !settings.endpoint.startsWith("/")) {
    if (els.statusText) {
      els.statusText.textContent = `${providerName}：请先填写 API Key`
      els.statusText.className = "settings-inline-hint is-error"
    }
    return { ok: false, error: "请先填写 API Key" }
  }

  if (els.testBtn) (els.testBtn as HTMLButtonElement).disabled = true
  if (els.statusText) {
    els.statusText.textContent = `正在连接 ${providerName}...`
    els.statusText.className = "settings-inline-hint is-pending"
  }

  try {
    let result: { ok: boolean; error?: string; message?: string; code?: string }
    if (LlmManager) {
      result = await LlmManager.testConnection(providerId, settings)
    } else {
      result = { ok: false, error: "LlmManager 未加载" }
    }

    if (result.ok) {
      if (els.statusText) {
        els.statusText.textContent = `${providerName} 连接成功${result.message ? `：${result.message}` : ""}`
        els.statusText.className = "settings-inline-hint is-success"
      }
    } else {
      const errorDetail = result.error || result.code || "未知错误"
      if (els.statusText) {
        els.statusText.textContent = `${providerName} 连接失败：${errorDetail}`
        els.statusText.className = "settings-inline-hint is-error"
      }
    }
    return result
  } catch (error) {
    const message = error && (error as Error).message ? (error as Error).message : "未知异常"
    const stack = error && (error as Error).stack ? (error as Error).stack : ""
    console.error("[LlmUiBridge] testConnection exception", error)
    if (els.statusText) {
      els.statusText.textContent = `${providerName} 连接异常：${message}`
      els.statusText.className = "settings-inline-hint is-error"
    }
    return { ok: false, error: message, stack }
  } finally {
    if (els.testBtn) (els.testBtn as HTMLButtonElement).disabled = false
  }
}

function showAddProviderModal(): void {
  console.log("[LlmUiBridge] showAddProviderModal() 被调用")
  const els = getElements()
  console.log("[LlmUiBridge] showAddProviderModal - customProviderModal:", els.customProviderModal ? "找到" : "未找到")
  if (els.customProviderModal) {
    console.log("[LlmUiBridge] 显示自定义 Provider 弹窗")
    els.customProviderModal.classList.remove("hidden")
    els.customProviderModal.removeAttribute("hidden")
    if (els.customProviderName) (els.customProviderName as HTMLInputElement).value = ""
    if (els.customProviderEndpoint) (els.customProviderEndpoint as HTMLInputElement).value = ""
    if (els.customProviderModel) (els.customProviderModel as HTMLInputElement).value = ""
  } else {
    console.error("[LlmUiBridge] customProviderModal 元素未找到，无法显示弹窗！")
  }
}

function hasCustomProviderInput(): boolean {
  const els = getElements()
  const name = els.customProviderName ? (els.customProviderName as HTMLInputElement).value.trim() : ""
  const endpoint = els.customProviderEndpoint ? (els.customProviderEndpoint as HTMLInputElement).value.trim() : ""
  const model = els.customProviderModel ? (els.customProviderModel as HTMLInputElement).value.trim() : ""
  return name !== "" || endpoint !== "" || model !== ""
}

function hideAddProviderModal(forceClose = false): void {
  const els = getElements()

  if (!forceClose && hasCustomProviderInput()) {
    const okBtn = document.getElementById("gameConfirmOkBtn")
    const cancelBtn = document.getElementById("gameConfirmCancelBtn")
    const originalOkText = okBtn ? okBtn.textContent : ""
    const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
    if (okBtn) okBtn.textContent = "确认离开"
    if (cancelBtn) cancelBtn.textContent = "继续填写"

    if ((window as any).WarehouseScene && (window as any).WarehouseScene.instance) {
      (window as any).WarehouseScene.instance.showGameConfirm(
        "离开后不会保存已填写的内容，是否离开？",
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText

          hideAddProviderModal(true)
        },
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText
        }
      )
    } else {
      if (confirm("离开后不会保存已填写的内容，是否离开？")) {
        hideAddProviderModal(true)
      }
    }
    return
  }

  if (els.customProviderModal) {
    els.customProviderModal.classList.add("hidden")
    els.customProviderModal.setAttribute("hidden", "")
  }
}

function addCustomProvider(): void {
  const els = getElements()
  const name = els.customProviderName ? (els.customProviderName as HTMLInputElement).value.trim() : ""
  const endpoint = els.customProviderEndpoint ? (els.customProviderEndpoint as HTMLInputElement).value.trim() : ""
  const model = els.customProviderModel ? (els.customProviderModel as HTMLInputElement).value.trim() : ""

  if (!name) {
    alert("请输入模型名称")
    return
  }

  if (LlmManager) {
    try {
      const provider = LlmManager.createDynamicProvider({
        name: name,
        endpoint: endpoint,
        model: model,
        description: `自定义模型：${name}`
      })

      if (!provider || !provider.id) {
        alert("创建模型失败：无法获取 provider ID")
        return
      }

      const newProviderId = provider.id

      if (els.apiKeyInput) (els.apiKeyInput as HTMLInputElement).value = ""
      if (els.endpointInput) (els.endpointInput as HTMLInputElement).value = endpoint
      if (els.modelInput) (els.modelInput as HTMLInputElement).value = model
      if (els.maxTokensInput) (els.maxTokensInput as HTMLInputElement).value = String(2048)
      if (els.enabledCheckbox) (els.enabledCheckbox as HTMLInputElement).checked = false
      if (els.multiGameMemoryCheckbox) (els.multiGameMemoryCheckbox as HTMLInputElement).checked = false
      if (els.reflectionCheckbox) (els.reflectionCheckbox as HTMLInputElement).checked = false

      provider.saveSettings({
        enabled: false,
        multiGameMemoryEnabled: false,
        reflectionEnabled: false,
        apiKey: "",
        endpoint: endpoint,
        model: model,
        maxTokens: 2048
      })

      refreshProviderSelect(newProviderId)
      loadProviderSettings(newProviderId)
        ; LlmManager.setActiveProvider(newProviderId)

      hideAddProviderModal(true)

      const aiModelConfigOverlay = document.getElementById("aiModelConfigOverlay")
      if (aiModelConfigOverlay && !aiModelConfigOverlay.classList.contains("hidden")) {
        if (
          (window as any).WarehouseScene &&
          (window as any).WarehouseScene.instance &&
          typeof (window as any).WarehouseScene.instance.renderAiModelConfigContent === "function"
        ) {
          (window as any).WarehouseScene.instance.renderAiModelConfigContent()
        }
      }
    } catch (error) {
      console.error("[LlmUiBridge] addCustomProvider error", error)
      alert(`添加模型失败：${(error as Error).message || error}`)
    }
  }
}

function deleteCurrentProvider(): void {
  const providerId = getCurrentProviderId()
  const config = getProviderConfig(providerId)
  const els = getElements()

  if (config.builtin) {
    if ((window as any).WarehouseScene && (window as any).WarehouseScene.instance) {
      (window as any).WarehouseScene.instance.showGameConfirm("预定义模型不能删除", null, null)
      const cancelBtn = document.getElementById("gameConfirmCancelBtn")
      if (cancelBtn) cancelBtn.classList.add("hidden")
      const okBtn = document.getElementById("gameConfirmOkBtn")
      if (okBtn) okBtn.textContent = "知道了"
    } else {
      alert("预定义模型不能删除")
    }
    return
  }

  if ((window as any).WarehouseScene && (window as any).WarehouseScene.instance) {
    (window as any).WarehouseScene.instance.showGameConfirm(
      `确定要删除模型 "${config.name}" 吗？此操作不可恢复。`,
      () => {
        if (LlmManager) {
          LlmManager.deleteDynamicProvider(providerId)
          refreshProviderSelect("deepseek")

          if (els.providerSelect) {
            (els.providerSelect as HTMLSelectElement).value = "deepseek"
            loadProviderSettings("deepseek")
          }

          const aiModelConfigOverlay = document.getElementById("aiModelConfigOverlay")
          if (aiModelConfigOverlay && !aiModelConfigOverlay.classList.contains("hidden")) {
            if (
              (window as any).WarehouseScene &&
              (window as any).WarehouseScene.instance &&
              typeof (window as any).WarehouseScene.instance.renderAiModelConfigContent === "function"
            ) {
              (window as any).WarehouseScene.instance.renderAiModelConfigContent()
            }
          }
        }
      },
      null
    )
    const okBtn = document.getElementById("gameConfirmOkBtn")
    const cancelBtn = document.getElementById("gameConfirmCancelBtn")
    if (okBtn) okBtn.textContent = "确认"
    if (cancelBtn) {
      cancelBtn.textContent = "取消"
      cancelBtn.classList.remove("hidden")
    }
  } else {
    if (!confirm(`确定要删除模型 "${config.name}" 吗？此操作不可恢复。`)) {
      return
    }
    if (LlmManager) {
      LlmManager.deleteDynamicProvider(providerId)
      refreshProviderSelect("deepseek")

      if (els.providerSelect) {
        (els.providerSelect as HTMLSelectElement).value = "deepseek"
        loadProviderSettings("deepseek")
      }
    }
  }
}

function initialize(): void {
  console.log("[LlmUiBridge] initialize() 开始执行")
  const els = getElements()
  console.log("[LlmUiBridge] getElements() 结果:", {
    providerSelect: els.providerSelect ? "找到" : "未找到",
    addProviderBtn: els.addProviderBtn ? "找到" : "未找到",
    deleteProviderBtn: els.deleteProviderBtn ? "找到" : "未找到",
    testBtn: els.testBtn ? "找到" : "未找到",
    customProviderModal: els.customProviderModal ? "找到" : "未找到",
    customProviderConfirm: els.customProviderConfirm ? "找到" : "未找到",
    customProviderCancel: els.customProviderCancel ? "找到" : "未找到"
  })

  if (LlmManager && LlmManager.initializeCustomProviders) {
    LlmManager.initializeCustomProviders()
  }

  const managerSettings = LlmManager ? LlmManager.getActiveProviderId() : null
  const initialProviderId = managerSettings || "deepseek"
  console.log("[LlmUiBridge] initialProviderId:", initialProviderId)

  let isInitializing = true

  if (els.providerSelect) {
    console.log("[LlmUiBridge] 为 providerSelect 绑定 change 事件")
    els.providerSelect.addEventListener("change", function () {
      console.log("[LlmUiBridge] providerSelect change 事件触发, isInitializing:", isInitializing)
      if (isInitializing) {
        console.log("[LlmUiBridge] 初始化中，跳过 change 处理")
        return
      }

      const previousProviderId = LlmManager ? LlmManager.getActiveProviderId() : null
      if (previousProviderId && previousProviderId !== (this as HTMLSelectElement).value) {
        saveProviderSettings(previousProviderId)
      }

      const providerId = (this as HTMLSelectElement).value
      console.log("[LlmUiBridge] 切换到 provider:", providerId)
      loadProviderSettings(providerId)
      if (LlmManager) {
        LlmManager.setActiveProvider(providerId)
      }
    })
  } else {
    console.warn("[LlmUiBridge] providerSelect 元素未找到！")
  }

  refreshProviderSelect(initialProviderId)
  loadProviderSettings(initialProviderId)

  isInitializing = false

  function autoSaveSettings() {
    const providerId = getCurrentProviderId()
    saveProviderSettings(providerId)
  }

  const autoSaveElements = [
    els.enabledCheckbox,
    els.multiGameMemoryCheckbox,
    els.reflectionCheckbox,
    els.thinkingCheckbox,
    els.independentModelCheckbox,
    els.apiKeyInput,
    els.endpointInput,
    els.modelInput,
    els.maxTokensInput,
    els.timeoutMsInput,
    els.thinkingParamsInput
  ]
  autoSaveElements.forEach(function (el) {
    if (el) {
      el.addEventListener("change", autoSaveSettings)
    }
  })

  if (els.thinkingCheckbox) {
    els.thinkingCheckbox.addEventListener("change", function () {
      updateThinkingParamsVisibility(getElements())
    })
  }

  if (els.independentModelCheckbox) {
    els.independentModelCheckbox.addEventListener("change", function () {
      updateIndependentModelVisibility(getElements())
    })
  }

  if (els.multiGameMemoryCheckbox) {
    els.multiGameMemoryCheckbox.addEventListener("change", function () {
      updateMultiGameVisibility(getElements())
    })
  }

  if (els.testBtn) {
    console.log("[LlmUiBridge] 为 testBtn 绑定 click 事件")
    els.testBtn.addEventListener("click", function (e) {
      console.log("[LlmUiBridge] testBtn click 事件触发", e)
      const providerId = getCurrentProviderId()
      console.log("[LlmUiBridge] 测试连接 providerId:", providerId)
      testConnection(providerId)
    })
  } else {
    console.warn("[LlmUiBridge] testBtn 元素未找到！")
  }

  if (els.addProviderBtn) {
    console.log("[LlmUiBridge] 为 addProviderBtn 绑定 click 事件")
    els.addProviderBtn.addEventListener("click", function (e) {
      console.log("[LlmUiBridge] addProviderBtn click 事件触发", e)
      showAddProviderModal()
    })
  } else {
    console.warn("[LlmUiBridge] addProviderBtn 元素未找到！")
  }

  if (els.deleteProviderBtn) {
    console.log("[LlmUiBridge] 为 deleteProviderBtn 绑定 click 事件")
    els.deleteProviderBtn.addEventListener("click", function (e) {
      console.log("[LlmUiBridge] deleteProviderBtn click 事件触发", e)
      deleteCurrentProvider()
    })
  } else {
    console.warn("[LlmUiBridge] deleteProviderBtn 元素未找到！")
  }

  if (els.customProviderConfirm) {
    console.log("[LlmUiBridge] 为 customProviderConfirm 绑定 click 事件")
    els.customProviderConfirm.addEventListener("click", function (e) {
      console.log("[LlmUiBridge] customProviderConfirm click 事件触发", e)
      e.stopPropagation()
      addCustomProvider()
    })
  } else {
    console.warn("[LlmUiBridge] customProviderConfirm 元素未找到！")
  }

  if (els.customProviderCancel) {
    console.log("[LlmUiBridge] 为 customProviderCancel 绑定 click 事件")
    els.customProviderCancel.addEventListener("click", function (e) {
      console.log("[LlmUiBridge] customProviderCancel click 事件触发", e)
      e.stopPropagation()
      hideAddProviderModal()
    })
  } else {
    console.warn("[LlmUiBridge] customProviderCancel 元素未找到！")
  }

  const customProviderCancel2 = document.getElementById("customProviderCancel2")
  if (customProviderCancel2) {
    customProviderCancel2.addEventListener("click", function (e) {
      e.stopPropagation()
      hideAddProviderModal()
    })
  }

  if (els.customProviderModal) {
    els.customProviderModal.addEventListener("click", function (e) {
      e.stopPropagation()
      if (e.target === els.customProviderModal) {
        hideAddProviderModal()
      }
    })
  }
  const customProviderBox = document.querySelector(".custom-provider-box")
  if (customProviderBox) {
    customProviderBox.addEventListener("click", function (e) {
      e.stopPropagation()
    })
  }
}

/**
 * 获取当前活跃提供商的设置
 * @returns 提供商设置对象（结构因提供商不同而异，包含 apiKey、endpoint、model 等字段）
 *          使用 unknown 强制调用者做类型检查后再使用
 */
function getActiveProviderSettings(): unknown {
  const providerId = getCurrentProviderId()
  const provider = LlmManager ? LlmManager.getProvider(providerId) : null

  if (provider) {
    return provider.loadSettings()
  }

  return {
    provider: providerId,
    enabled: false,
    apiKey: "",
    endpoint: "",
    model: "",
    maxTokens: 2048
  }
}

export const LlmUiBridge = {
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize)
} else {
  setTimeout(initialize, 0)
}
