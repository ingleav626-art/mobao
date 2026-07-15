/**
 * @file ai-config-fns.ts
 * @module ui/overlay-manager/ai-config-fns
 * @description AI 模型配置覆盖层操作函数
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import { LlmManager } from "../../../llm/core/llm-manager"

const AI_MODEL_CONFIGS_STORAGE_KEY = "mobao_ai_model_configs_v1"

export function loadAiModelConfigs(): Record<string, string | null> {
  try {
    const stored = localStorage.getItem(AI_MODEL_CONFIGS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error("Failed to load AI model configs:", e)
  }
  return { ai1: null, ai2: null, ai3: null }
}

export function saveAiModelConfigs(configs: Record<string, string | null>): void {
  try {
    localStorage.setItem(AI_MODEL_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
  } catch (e) {
    console.error("Failed to save AI model configs:", e)
  }
}

export function openAiModelConfigOverlay(deps: UiOverlayManagerDeps): void {
  const overlay = document.getElementById("aiModelConfigOverlay")
  if (!overlay) return
  renderAiModelConfigContent(deps)
  overlay.classList.remove("hidden")
}

export function closeAiModelConfigOverlay(): void {
  const overlay = document.getElementById("aiModelConfigOverlay")
  if (overlay) overlay.classList.add("hidden")
}

export function renderAiModelConfigContent(deps: UiOverlayManagerDeps): void {
  const htmlContentEl = document.getElementById("aiModelConfigContent")
  if (!htmlContentEl) return
  const aiModelConfigs = loadAiModelConfigs()
  const providers = LlmManager ? LlmManager.listProviders() : []
  const activeProviderId = LlmManager ? LlmManager.getActiveProviderId() : "deepseek"
  const currentSettings: Record<string, unknown> = deps.getLlmSettings()
  const currentModel = (currentSettings.model as string) || "未配置"
  const currentEndpoint = (currentSettings.endpoint as string) || "未配置"
  const hasCurrentApiKey = !!(currentSettings.apiKey && String(currentSettings.apiKey).trim())
  const activeProvider = providers.find((p: { id: string }) => p.id === activeProviderId)
  const activeProviderName = activeProvider ? activeProvider.name : activeProviderId
  let html = `
      <div style="margin-bottom:12px;padding:8px;background:#fff9f0;border:1px solid #d6ba8d;border-radius:6px;">
        <div style="font-weight:bold;color:#402f1c;margin-bottom:4px;">当前默认配置：${activeProviderName}</div>
        <div style="font-size:11px;color:#6a5a4a;">模型: ${currentModel}</div>
        <div style="font-size:11px;color:#6a5a4a;">Endpoint: ${currentEndpoint.slice(0, 50)}${currentEndpoint.length > 50 ? "..." : ""}</div>
        <div style="font-size:11px;color:${hasCurrentApiKey ? "#2a7a2a" : "#a04040"};">API Key: ${hasCurrentApiKey ? "已配置" : "未配置"}</div>
      </div>
    `
  const providerIds = new Set(providers.map((p: { id: string }) => p.id))
  const providerOptions = providers
    .map((p: { id: string; name: string }) => `<option value="${p.id}">${p.name}</option>`)
    .join("")
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
}

export function saveAiModelConfigFromForm(deps: UiOverlayManagerDeps): void {
  const configs: Record<string, string> = {}
  ;["ai1", "ai2", "ai3"].forEach((aiId) => {
    const select = document.getElementById(`aiModelProvider-${aiId}`) as HTMLSelectElement | null
    if (select) {
      configs[aiId] = select.value || ""
    }
  })
  saveAiModelConfigs(configs as Record<string, string | null>)
  closeAiModelConfigOverlay()
  deps.writeLog("AI模型配置已保存。")
}

export function getAiModelConfig(aiIndex: number): Record<string, unknown> | null {
  const aiId = `ai${aiIndex + 1}`
  const aiModelConfigs = loadAiModelConfigs()
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
        apiKey: (settings.apiKey as string) || "",
        endpoint: (settings.endpoint as string) || "",
        model: (settings.model as string) || "",
        maxTokens: settings.maxTokens,
        timeoutMs: settings.timeoutMs,
        thinkingEnabled: settings.thinkingEnabled
      }
    }
  }
  console.log("[getAiModelConfig] LlmManager not available or provider not found")
  return null
}
