/**
 * @file scripts/game/ui/overlay/ai-model-config.ts
 * @module ui/overlay/ai-model-config
 * @description AI 模型配置面板 Mixin。负责 AI 专属模型配置的 localStorage 读写、
 *              配置面板渲染与保存，支持为每个 AI 玩家指定独立 Provider。
 *
 * @requires llm/core/llm-manager - LlmManager
 * @exports AiModelConfigMixin - AI 模型配置子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { LlmManager } from "../../../llm/core/llm-manager"

export const AiModelConfigMixin: ThisType<WarehouseSceneThis> = {
  AI_MODEL_CONFIGS_STORAGE_KEY: "mobao_ai_model_configs_v1",

  loadAiModelConfigs(): Record<string, string | null> {
    try {
      const stored = localStorage.getItem(this.AI_MODEL_CONFIGS_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (e) {
      console.error("Failed to load AI model configs:", e)
    }
    return { ai1: null, ai2: null, ai3: null }
  },

  saveAiModelConfigs(configs: Record<string, string | null>) {
    try {
      localStorage.setItem(this.AI_MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
    } catch (e) {
      console.error("Failed to save AI model configs:", e)
    }
  },

  openAiModelConfigOverlay() {
    const overlay = document.getElementById("aiModelConfigOverlay")
    if (!overlay) return
    this.renderAiModelConfigContent()
    overlay.classList.remove("hidden")
  },

  closeAiModelConfigOverlay() {
    const overlay = document.getElementById("aiModelConfigOverlay")
    if (overlay) overlay.classList.add("hidden")
  },

  renderAiModelConfigContent() {
    const htmlContentEl = document.getElementById("aiModelConfigContent")
    if (!htmlContentEl) return
    const aiModelConfigs = this.loadAiModelConfigs()
    const providers = LlmManager ? LlmManager.listProviders() : []
    const activeProviderId = LlmManager ? LlmManager.getActiveProviderId() : "deepseek"
    const currentSettings: Record<string, any> =
      typeof this.getLlmSettings === "function" ? this.getLlmSettings() : ({} as Record<string, any>)
    const currentModel = currentSettings.model || "未配置"
    const currentEndpoint = currentSettings.endpoint || "未配置"
    const hasCurrentApiKey = !!(currentSettings.apiKey && currentSettings.apiKey.trim())
    const activeProvider = providers.find((p: any) => p.id === activeProviderId)
    const activeProviderName = activeProvider ? activeProvider.name : activeProviderId
    let html = `
        <div style="margin-bottom:12px;padding:8px;background:#fff9f0;border:1px solid #d6ba8d;border-radius:6px;">
          <div style="font-weight:bold;color:#402f1c;margin-bottom:4px;">当前默认配置：${activeProviderName}</div>
          <div style="font-size:11px;color:#6a5a4a;">模型: ${currentModel}</div>
          <div style="font-size:11px;color:#6a5a4a;">Endpoint: ${currentEndpoint.slice(0, 50)}${currentEndpoint.length > 50 ? "..." : ""}</div>
          <div style="font-size:11px;color:${hasCurrentApiKey ? "#2a7a2a" : "#a04040"};">API Key: ${hasCurrentApiKey ? "已配置" : "未配置"}</div>
        </div>
      `
    const providerIds = new Set(providers.map((p: any) => p.id))
    const providerOptions = providers.map((p: any) => `<option value="${p.id}">${p.name}</option>`).join("")
    ;["ai1", "ai2", "ai3"].forEach((aiId, i) => {
      const savedProviderId = aiModelConfigs[aiId] || ""
      const isSavedValid = !savedProviderId || providerIds.has(savedProviderId)
      let extraOption = ""
      if (savedProviderId && !isSavedValid) {
        extraOption = `<option value="${savedProviderId}" selected>[已失效] ${savedProviderId}</option>`
      }
      html += `
          <div class="ai-model-config-section" style="margin-bottom:12px;padding:10px;background:#fff;border:1px solid #d6ba8d;border-radius:6px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:bold;color:#402f1c;">
              <span style="width:60px;">AI${i + 1}：</span>
              <select id="aiModelProvider-${aiId}" style="flex:1;padding:6px 8px;border:1px solid #b79d77;border-radius:4px;font-size:13px;background:#fff;">
                <option value="" ${!savedProviderId ? "selected" : ""}>使用默认配置</option>
                ${extraOption}
                ${providerOptions}
              </select>
            </label>
          </div>
        `
    })
    htmlContentEl.innerHTML = html
  },

  saveAiModelConfigFromForm() {
    const configs: Record<string, string> = {}
    ;["ai1", "ai2", "ai3"].forEach((aiId) => {
      const select = document.getElementById(`aiModelProvider-${aiId}`) as HTMLSelectElement | null
      if (select) {
        configs[aiId] = select.value || ""
      }
    })
    this.saveAiModelConfigs(configs as any)
    this.closeAiModelConfigOverlay()
    this.writeLog("AI模型配置已保存。")
  },

  getAiModelConfig(aiIndex: number): Record<string, any> | null {
    const aiId = `ai${aiIndex + 1}`
    const aiModelConfigs = this.loadAiModelConfigs()
    const providerId = aiModelConfigs[aiId]
    console.log("[getAiModelConfig] aiIndex:", aiIndex, "aiId:", aiId, "providerId:", providerId)
    if (!providerId) {
      console.log("[getAiModelConfig] no providerId for aiId:", aiId)
      return null
    }
    if (LlmManager) {
      const provider = LlmManager.getProvider(providerId)
      console.log("[getAiModelConfig] provider:", provider ? provider.id : null)
      if (provider && typeof provider.loadSettings === "function") {
        const settings = provider.loadSettings()
        console.log("[getAiModelConfig] settings:", {
          apiKey: settings.apiKey ? "(已设置)" : "(空)",
          endpoint: settings.endpoint,
          model: settings.model
        })
        return {
          apiKey: settings.apiKey || "",
          endpoint: settings.endpoint || "",
          model: settings.model || "",
          maxTokens: settings.maxTokens,
          timeoutMs: settings.timeoutMs,
          thinkingEnabled: settings.thinkingEnabled
        }
      }
    }
    console.log("[getAiModelConfig] LlmManager not available or provider not found")
    return null
  }
}
