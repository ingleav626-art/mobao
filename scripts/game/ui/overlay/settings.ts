/**
 * @file scripts/game/ui/overlay/settings.ts
 * @module ui/overlay/settings
 * @description 设置面板 Mixin。负责游戏参数与 LLM 配置的表单填充/读取/保存，
 *              覆盖层开闭与未保存保护。含越界方法 saveSettingsFromOverlay
 *              （直接修改游戏状态与 LLM 全局配置），本次仅搬移不修复。
 *
 * @requires core/utils - clamp
 * @requires core/settings - GAME_SETTINGS, saveGameSettings, normalizeGameSettings
 * @requires core/constants - SETTINGS_FIELDS
 * @requires llm/providers/deepseek-provider - DeepSeekProvider
 * @requires llm/core/llm-manager - LlmManager
 * @requires animations - MobaoAnimations
 * @exports SettingsMixin - 设置面板子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { clamp } from "../../core/utils"
import { GAME_SETTINGS, saveGameSettings, normalizeGameSettings } from "../../core/settings"
import { SETTINGS_FIELDS } from "../../core/constants"
import { DeepSeekProvider } from "../../../llm/providers/deepseek-provider"
import { LlmManager } from "../../../llm/core/llm-manager"
import { LLM_GLOBAL_SETTINGS_KEY } from "../../../llm/core/llm-ui-bridge"
import { MobaoAnimations } from "../../animations"

// DeepSeek settings 函数从旧版 deepseek-llm.ts 迁移到新 Provider 体系
const loadDeepSeekSettings = DeepSeekProvider.getSettings
const saveDeepSeekSettings = DeepSeekProvider.applySettings
const maskApiKey = LlmManager.utils.maskApiKey

export const SettingsMixin: ThisType<WarehouseSceneThis> = {
  openSettingsOverlay() {
    // 保存初始设置值，用于离开保护（使用表单读取的值，确保一致性）
    this.closeBidKeypad()
    this.closeItemDrawer()
    this.hideInfoPopup()
    this.fillSettingsForm(GAME_SETTINGS)
    this.fillLlmSettingsForm(this.getLlmSettings())
    this.setSettingsStatus("设置保存在本地浏览器中。", false)
    this._settingsInitialValues = JSON.stringify({
      game: this.readSettingsForm(),
      llm: this.readLlmSettingsForm()
    })

    const llmGroup = document.getElementById("llmSettingsGroup")
    if (llmGroup) {
      if (this.isLanMode) {
        llmGroup.classList.add("settings-group-disabled")
        const inputs = llmGroup.querySelectorAll("input, button")
        inputs.forEach((el: any) => {
          el.disabled = true
        })
      } else {
        llmGroup.classList.remove("settings-group-disabled")
        const inputs = llmGroup.querySelectorAll("input, button")
        inputs.forEach((el: any) => {
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
        if (this.isLanMode) {
          if (this.lanIsHost) {
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
      MobaoAnimations.animateOverlayOpen(this.dom.settingsOverlay!, this.dom.settingsPanel!)
    } else {
      this.dom.settingsOverlay!.classList.remove("hidden")
    }
  },

  closeSettingsOverlay(keepStatus: boolean = false, forceClose: boolean = false) {
    // 检查是否有未保存的设置
    if (!forceClose && this._settingsInitialValues) {
      const currentValues = JSON.stringify({
        game: this.readSettingsForm(),
        llm: this.readLlmSettingsForm()
      })

      if (currentValues !== this._settingsInitialValues) {
        const okBtn = document.getElementById("gameConfirmOkBtn")
        const cancelBtn = document.getElementById("gameConfirmCancelBtn")
        const originalOkText = okBtn ? okBtn.textContent : ""
        const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
        if (okBtn) okBtn.textContent = "保存"
        if (cancelBtn) cancelBtn.textContent = "不保存"
        // 临时修改确认按钮文本
        this.showGameConfirm(
          "设置已修改，是否保存？",
          () => {
            // 恢复按钮文本
            if (okBtn) okBtn.textContent = originalOkText
            if (cancelBtn) cancelBtn.textContent = originalCancelText
            this.saveSettingsFromOverlay()
            this._settingsInitialValues = null
            this.closeSettingsOverlay(keepStatus, true)
          },
          () => {
            // 恢复按钮文本
            if (okBtn) okBtn.textContent = originalOkText
            if (cancelBtn) cancelBtn.textContent = originalCancelText
            this._settingsInitialValues = null
            this.closeSettingsOverlay(keepStatus, true)
          }
        )
        return
      }
    }

    // 清除初始值记录，避免关闭时再次弹窗
    this._settingsInitialValues = null

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(this.dom.settingsOverlay!, this.dom.settingsPanel!, () => {
        if (!keepStatus) {
          this.setSettingsStatus("设置保存在本地浏览器中。", false)
        }
      })
    } else {
      this.dom.settingsOverlay!.classList.add("hidden")
      if (!keepStatus) {
        this.setSettingsStatus("设置保存在本地浏览器中。", false)
      }
    }
  },

  isSettingsOverlayOpen(): boolean {
    return !this.dom.settingsOverlay!.classList.contains("hidden")
  },

  settingsInputId(field: string): string {
    return `setting-${field}`
  },

  fillSettingsForm(values: Record<string, any>) {
    SETTINGS_FIELDS.forEach((field: string) => {
      const input = document.getElementById(this.settingsInputId(field))
      if (!input) {
        return
      }
      ; (input as HTMLInputElement).value = String(values[field])
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
    const settlementSpeedInput = document.getElementById("setting-settlementSpeedMultiplier") as HTMLInputElement | null
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
  },

  readSettingsForm(): Record<string, any> {
    const draft: Record<string, number> = {}
    SETTINGS_FIELDS.forEach((field: string) => {
      const input = document.getElementById(this.settingsInputId(field))
      draft[field] = input
        ? Number((input as HTMLInputElement).value)
        : (GAME_SETTINGS as unknown as Record<string, number>)[field]
    })
    return normalizeGameSettings(draft, GAME_SETTINGS)
  },

  setSettingsStatus(text: string, saved: boolean) {
    this.dom.settingsStatusText!.textContent = text
    this.dom.settingsStatusText!.classList.toggle("settings-note-saved", Boolean(saved))
  },

  saveSettingsFromOverlay() {
    const LLM_SETTINGS = loadDeepSeekSettings()
    const next = this.readSettingsForm()
    Object.assign(GAME_SETTINGS, next)
    saveGameSettings(GAME_SETTINGS)

    if (!this.isLanMode) {
      const oldMultiGameMemoryEnabled = Boolean(LLM_SETTINGS.multiGameMemoryEnabled)
      const llmNext = this.readLlmSettingsForm()
      console.log("[saveSettingsFromOverlay] llmNext:", {
        independentModelEnabled: llmNext.independentModelEnabled,
        enabled: llmNext.enabled,
        apiKey: llmNext.apiKey ? "(已设置)" : "(空)"
      })

      const globalSettings = {
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
      } catch (_e) { }

      const llmProvider = this.getLlmProvider()
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
        this.writeLog("已关闭多局AI上下文：仅停止发送，不删除记忆。")
      }
      if (!oldMultiGameMemoryEnabled && LLM_SETTINGS.multiGameMemoryEnabled) {
        this.pushRunStartContextToAi()
        this.writeLog("已启用多局AI上下文：后续会在同一会话中连续学习。")
      }
    }

    this._settingsInitialValues = null

    const bidInput = this.dom.bidInput as HTMLInputElement
    bidInput.step = "1"
    bidInput.min = "0"
    const normalizedBid = Math.max(0, Math.round(Number(bidInput.value) || 0))
    bidInput.value = String(normalizedBid)
    this.round = clamp(this.round, 1, GAME_SETTINGS.maxRounds)
    this.roundTimeLeft = Math.min(this.roundTimeLeft, GAME_SETTINGS.roundSeconds)
    this.actionsLeft = Math.min(this.actionsLeft, GAME_SETTINGS.actionsPerRound)
    this.updateHud()
    this.setSettingsStatus("设置已保存并立即生效。", true)
    const modelName = (LLM_SETTINGS && LLM_SETTINGS.model) || "大模型"
    this.setLlmSettingsStatus(
      LLM_SETTINGS.apiKey
        ? `${modelName}配置已保存：${maskApiKey(LLM_SETTINGS.apiKey)}`
        : `${modelName}配置已保存，但尚未填写 API Key。`,
      LLM_SETTINGS.apiKey ? "success" : "normal"
    )
    this.writeLog(`设置已应用：对局参数生效；${modelName} ${LLM_SETTINGS.enabled ? "已启用" : "未启用"}。`)
    this.closeSettingsOverlay(true)
  }
}
