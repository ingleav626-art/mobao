/**
 * @file settings-fns.ts
 * @module ui/overlay-manager/settings-fns
 * @description 设置面板操作函数（打开/关闭/填充/读取/保存）
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import type { UiOverlayManagerState } from "../overlay-manager"
import { MobaoAnimations } from "../../animations"
import { SETTINGS_FIELDS } from "../../core/constants"
import { GAME_SETTINGS, saveGameSettings, normalizeGameSettings } from "../../core/settings"
import { clamp } from "../../core/utils"
import { DeepSeekProvider } from "../../../llm/providers/deepseek-provider"
import { LlmManager } from "../../../llm/core/llm-manager"
import { LLM_GLOBAL_SETTINGS_KEY } from "../../../llm/core/llm-ui-bridge"
import { hideInfoPopup } from "./info-popup-fns"
import { showGameConfirm } from "./confirm-dialog-fns"

const loadDeepSeekSettings = DeepSeekProvider.getSettings
const saveDeepSeekSettings = DeepSeekProvider.applySettings
const maskApiKey = LlmManager.utils.maskApiKey

export function openSettingsOverlay(deps: UiOverlayManagerDeps, state: UiOverlayManagerState): void {
  deps.closeBidKeypad()
  deps.closeItemDrawer()
  hideInfoPopup(deps)
  fillSettingsForm(GAME_SETTINGS as unknown as Record<string, unknown>)
  deps.fillLlmSettingsForm(deps.getLlmSettings())
  setSettingsStatus(deps, "设置保存在本地浏览器中。", false)
  state.settingsInitialValues = JSON.stringify({
    game: readSettingsForm(),
    llm: deps.readLlmSettingsForm()
  })

  const llmGroup = document.getElementById("llmSettingsGroup")
  if (llmGroup) {
    if (deps.getIsLanMode()) {
      llmGroup.classList.add("settings-group-disabled")
      const inputs = llmGroup.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")
      inputs.forEach((el) => {
        el.disabled = true
      })
    } else {
      llmGroup.classList.remove("settings-group-disabled")
      const inputs = llmGroup.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")
      inputs.forEach((el) => {
        el.disabled = false
      })
    }
  }
  const returnLobbyBtn = document.getElementById("settingsReturnLobbyBtn")
  if (returnLobbyBtn) {
    const lobbyPage = document.getElementById("lobbyPage")
    const isLobbyVisible = lobbyPage && !lobbyPage.classList.contains("hidden")
    if (isLobbyVisible) {
      returnLobbyBtn.classList.add("hidden")
    } else {
      if (deps.getIsLanMode()) {
        if (deps.getLanIsHost()) {
          returnLobbyBtn.textContent = "返回房间"
          returnLobbyBtn.classList.remove("hidden")
        } else {
          returnLobbyBtn.classList.add("hidden")
        }
      } else {
        returnLobbyBtn.textContent = "返回大厅"
        returnLobbyBtn.classList.remove("hidden")
      }
    }
  }
  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayOpen(deps.dom.settingsOverlay!, deps.dom.settingsPanel!)
  } else {
    deps.dom.settingsOverlay!.classList.remove("hidden")
  }
}

export function closeSettingsOverlay(
  deps: UiOverlayManagerDeps,
  state: UiOverlayManagerState,
  keepStatus: boolean = false,
  forceClose: boolean = false
): void {
  if (!forceClose && state.settingsInitialValues) {
    const currentValues = JSON.stringify({
      game: readSettingsForm(),
      llm: deps.readLlmSettingsForm()
    })

    if (currentValues !== state.settingsInitialValues) {
      const okBtn = document.getElementById("gameConfirmOkBtn")
      const cancelBtn = document.getElementById("gameConfirmCancelBtn")
      const originalOkText = okBtn ? okBtn.textContent : ""
      const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
      if (okBtn) okBtn.textContent = "保存"
      if (cancelBtn) cancelBtn.textContent = "不保存"
      showGameConfirm(
        deps,
        state,
        "设置已修改，是否保存？",
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText
          saveSettingsFromOverlay(deps, state)
          state.settingsInitialValues = null
          closeSettingsOverlay(deps, state, keepStatus, true)
        },
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText
          state.settingsInitialValues = null
          closeSettingsOverlay(deps, state, keepStatus, true)
        }
      )
      return
    }
  }

  state.settingsInitialValues = null

  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayClose(deps.dom.settingsOverlay!, deps.dom.settingsPanel!, () => {
      if (!keepStatus) {
        setSettingsStatus(deps, "设置保存在本地浏览器中。", false)
      }
    })
  } else {
    deps.dom.settingsOverlay!.classList.add("hidden")
    if (!keepStatus) {
      setSettingsStatus(deps, "设置保存在本地浏览器中。", false)
    }
  }
}

export function isSettingsOverlayOpen(deps: UiOverlayManagerDeps): boolean {
  return !deps.dom.settingsOverlay!.classList.contains("hidden")
}

export function settingsInputId(field: string): string {
  return `setting-${field}`
}

export function fillSettingsForm(values: Record<string, unknown>): void {
  SETTINGS_FIELDS.forEach((field: string) => {
    const input = document.getElementById(settingsInputId(field))
    if (!input) {
      return
    }
    ;(input as HTMLInputElement).value = String(values[field])
  })
  const roundSecondsInput = document.getElementById("setting-roundSeconds") as HTMLInputElement | null
  const roundSecondsDecrease = document.getElementById("roundSecondsDecrease") as HTMLButtonElement | null
  const roundSecondsIncrease = document.getElementById("roundSecondsIncrease") as HTMLButtonElement | null
  if (roundSecondsInput) {
    const value = Number(roundSecondsInput.value) || 60
    if (roundSecondsDecrease) {
      roundSecondsDecrease.disabled = value <= 10
    }
    if (roundSecondsIncrease) {
      roundSecondsIncrease.disabled = value >= 180
    }
  }
  const settlementSpeedInput = document.getElementById(
    "setting-settlementSpeedMultiplier"
  ) as HTMLInputElement | null
  const settlementSpeedDecrease = document.getElementById("settlementSpeedDecrease") as HTMLButtonElement | null
  const settlementSpeedIncrease = document.getElementById("settlementSpeedIncrease") as HTMLButtonElement | null
  if (settlementSpeedInput) {
    const value = Number(settlementSpeedInput.value) || 1
    if (settlementSpeedDecrease) {
      settlementSpeedDecrease.disabled = value <= 0.5
    }
    if (settlementSpeedIncrease) {
      settlementSpeedIncrease.disabled = value >= 3
    }
  }
  const musicVolumeInput = document.getElementById("setting-musicVolume") as HTMLInputElement | null
  const musicVolumeValue = document.getElementById("musicVolumeValue")
  const musicVolumeIconImg = document.getElementById("musicVolumeIconImg") as HTMLImageElement | null
  if (musicVolumeInput && musicVolumeValue) {
    musicVolumeValue.textContent = `${musicVolumeInput.value}%`
    if (musicVolumeIconImg) {
      const isMuted = Number(musicVolumeInput.value) === 0
      musicVolumeIconImg.src = isMuted
        ? "./assets/images/icons/ui/mute-fill.svg"
        : "./assets/images/icons/ui/sound-on.svg"
      musicVolumeIconImg.classList.toggle("muted", isMuted)
    }
  }
  const sfxVolumeInput = document.getElementById("setting-sfxVolume") as HTMLInputElement | null
  const sfxVolumeValue = document.getElementById("sfxVolumeValue")
  const sfxVolumeIconImg = document.getElementById("sfxVolumeIconImg") as HTMLImageElement | null
  if (sfxVolumeInput && sfxVolumeValue) {
    sfxVolumeValue.textContent = `${sfxVolumeInput.value}%`
    if (sfxVolumeIconImg) {
      const isMuted = Number(sfxVolumeInput.value) === 0
      sfxVolumeIconImg.src = isMuted
        ? "./assets/images/icons/ui/mute-fill.svg"
        : "./assets/images/icons/ui/sound-on.svg"
      sfxVolumeIconImg.classList.toggle("muted", isMuted)
    }
  }
}

export function readSettingsForm(): Record<string, unknown> {
  const draft: Record<string, number> = {}
  SETTINGS_FIELDS.forEach((field: string) => {
    const input = document.getElementById(settingsInputId(field))
    draft[field] = input
      ? Number((input as HTMLInputElement).value)
      : (GAME_SETTINGS as unknown as Record<string, number>)[field]
  })
  return normalizeGameSettings(draft, GAME_SETTINGS) as unknown as Record<string, unknown>
}

export function setSettingsStatus(deps: UiOverlayManagerDeps, text: string, saved: boolean): void {
  deps.dom.settingsStatusText!.textContent = text
  deps.dom.settingsStatusText!.classList.toggle("settings-note-saved", Boolean(saved))
}

export function saveSettingsFromOverlay(deps: UiOverlayManagerDeps, state: UiOverlayManagerState): void {
  const LLM_SETTINGS: Record<string, unknown> = loadDeepSeekSettings()
  const next = readSettingsForm()
  Object.assign(GAME_SETTINGS, next)
  saveGameSettings(GAME_SETTINGS)

  if (!deps.getIsLanMode()) {
    const oldMultiGameMemoryEnabled = Boolean(LLM_SETTINGS.multiGameMemoryEnabled)
    const llmNext = deps.readLlmSettingsForm()
    console.log("[saveSettingsFromOverlay] llmNext:", {
      independentModelEnabled: llmNext.independentModelEnabled,
      enabled: llmNext.enabled,
      apiKey: llmNext.apiKey ? "(已设置)" : "(空)"
    })

    const globalSettings: Record<string, unknown> = {
      enabled: llmNext.enabled,
      multiGameMemoryEnabled: llmNext.multiGameMemoryEnabled,
      reflectionEnabled: llmNext.reflectionEnabled,
      thinkingEnabled: llmNext.thinkingEnabled,
      independentModelEnabled: llmNext.independentModelEnabled,
      independentReflectionEnabled: llmNext.independentReflectionEnabled,
      contextLength: llmNext.contextLength,
      autoSummarizeEnabled: llmNext.autoSummarizeEnabled,
      reflectionScope: llmNext.reflectionScope
    }
    try {
      window.localStorage.setItem(LLM_GLOBAL_SETTINGS_KEY, JSON.stringify(globalSettings))
    } catch (_e) {
      // 忽略 localStorage 写入失败
    }

    const llmProvider = deps.getLlmProvider()
    console.log("[saveSettingsFromOverlay] llmProvider:", llmProvider ? llmProvider.id : null)
    if (llmProvider && llmProvider.saveSettings) {
      llmProvider.saveSettings({
        apiKey: llmNext.apiKey,
        endpoint: llmNext.endpoint,
        model: llmNext.model,
        maxTokens: llmNext.maxTokens,
        timeoutMs: llmNext.timeoutMs,
        thinkingParams: llmNext.thinkingParams
      })
    } else if (saveDeepSeekSettings) {
      saveDeepSeekSettings({
        apiKey: llmNext.apiKey,
        endpoint: llmNext.endpoint,
        model: llmNext.model,
        maxTokens: llmNext.maxTokens,
        timeoutMs: llmNext.timeoutMs,
        thinkingParams: llmNext.thinkingParams
      })
    }
    if (llmProvider && llmProvider.applySettings) {
      llmProvider.applySettings(llmNext)
    }
    Object.assign(LLM_SETTINGS, llmNext)
    console.log(
      "[saveSettingsFromOverlay] LLM_SETTINGS.independentModelEnabled:",
      LLM_SETTINGS.independentModelEnabled
    )
    if (oldMultiGameMemoryEnabled && !LLM_SETTINGS.multiGameMemoryEnabled) {
      deps.writeLog("已关闭多局AI上下文：仅停止发送，不删除记忆。")
    }
    if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
      deps.pushRunStartContextToAi()
      deps.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。")
    }
  }

  state.settingsInitialValues = null

  const bidInput = deps.dom.bidInput as HTMLInputElement
  bidInput.step = "1"
  bidInput.min = "0"
  const normalizedBid = Math.max(0, Math.round(Number(bidInput.value) || 0))
  bidInput.value = String(normalizedBid)
  deps.setRound(clamp(deps.getRound(), 1, GAME_SETTINGS.maxRounds))
  deps.setRoundTimeLeft(Math.min(deps.getRoundTimeLeft(), GAME_SETTINGS.roundSeconds))
  deps.setActionsLeft(Math.min(deps.getActionsLeft(), GAME_SETTINGS.actionsPerRound))
  deps.updateHud()
  setSettingsStatus(deps, "设置已保存并立即生效。", true)
  const modelName = (LLM_SETTINGS && LLM_SETTINGS.model) || "大模型"
  deps.setLlmSettingsStatus(
    LLM_SETTINGS.apiKey
      ? `${modelName}配置已保存：${maskApiKey(LLM_SETTINGS.apiKey as string)}`
      : `${modelName}配置已保存，但尚未填写 API Key。`,
    LLM_SETTINGS.apiKey ? "success" : "normal"
  )
  deps.writeLog(`设置已应用：对局参数生效；${modelName} ${LLM_SETTINGS.enabled ? "已启用" : "未启用"}。`)
  closeSettingsOverlay(deps, state, true)
}