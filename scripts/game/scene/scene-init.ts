/**
 * @file scene/scene-init.ts
 * @module scene/init
 * @description 场景初始化方法。包含 create、initAudio、cacheDom、initAnimations、bindDomEvents。
 *
 * 拆分说明：
 *   - create(): 生命周期入口，调用各初始化方法
 *   - initAudio(): 音频系统初始化
 *   - cacheDom(): DOM 元素缓存
 *   - initAnimations(): 动效初始化
 *   - bindDomEvents(): DOM 事件绑定（约 1170 行，包含所有 UI 交互逻辑）
 *
 * 二次迁移建议：
 *   - bindDomEvents 可按功能域拆分到 ui/ 目录（settings-events.ts、ai-panel-events.ts 等）
 *   - cacheDom 可迁移到 ui/dom-cache.ts
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { AudioManager } from "../../audio/audio-manager"
import { AudioUI } from "../../audio/audio-ui"
import { MobaoAnimations } from "../animations"
import { defaultGameSettings } from "../core/settings"
import { defaultDeepSeekSettings } from "../../llm/providers/deepseek-llm"
import { WarehouseScene } from "./warehouse-scene"
import type { WarehouseMixinMethods } from "./warehouse-scene"

/**
 * Phaser create 生命周期：初始化游戏场景
 */
export function create(this: WarehouseSceneThis): void {
  WarehouseScene.instance = this as unknown as WarehouseScene & WarehouseMixinMethods
  this.initAudio()
  this.cacheDom()
  this.bindDomEvents()
  this.bindLobbyEvents()
  this.initPlayersUI()
  this.initPreviewFilterOptions()
  this.initAnimations()
  this.enterLobby()
}

/**
 * 初始化音频系统
 */
export function initAudio(this: WarehouseSceneThis): void {
  if (AudioManager) {
    AudioManager.init().then(() => {
      AudioManager.preload("ui", ["click"])
      AudioManager.preload("game", ["reveal", "coinsReveal", "search", "countdown"])
      AudioManager.preload("bgm", ["lobby", "game"])
      if (AudioUI) {
        AudioUI.init()
      }
    })
  }
}

/**
 * 缓存常用 DOM 元素引用到 this.dom
 */
export function cacheDom(this: WarehouseSceneThis): void {
  this.dom.hudRound = document.getElementById("hudRound")
  this.dom.hudTimer = document.getElementById("hudTimer")
  this.dom.hudMoney = document.getElementById("hudMoney")
  this._hudRoundText = this.dom.hudRound ? this.dom.hudRound.querySelector(".hud-text") : null
  this._hudTimerText = this.dom.hudTimer ? this.dom.hudTimer.querySelector(".hud-text") : null
  this._hudMoneyText = this.dom.hudMoney ? this.dom.hudMoney.querySelector(".hud-text") : null
  this.dom.aiThinkingIndicator = document.getElementById("aiThinkingIndicator")
  this.dom.actionLog = document.getElementById("actionLog")
  this.dom.aiThoughtContent = document.getElementById("aiThoughtContent")
  this.dom.openSettingsBtn = document.getElementById("openSettingsBtn")
  this.dom.rerollBtn = document.getElementById("rerollBtn")
  this.dom.nextRoundBtn = document.getElementById("nextRoundBtn")
  this.dom.pauseRoundBtn = document.getElementById("pauseRoundBtn")
  this.dom.aiLogicBtn = document.getElementById("aiLogicBtn")
  this.dom.aiLogicOverlay = document.getElementById("aiLogicOverlay")
  this.dom.aiLogicPanel = document.getElementById("aiLogicPanel")
  this.dom.aiLogicCloseBtn = document.getElementById("aiLogicCloseBtn")
  this.dom.aiLogicContent = document.getElementById("aiLogicContent")
  this.dom.aiViewMessagesBtn = document.getElementById("aiViewMessagesBtn")
  this.dom.battleRecordOverlay = document.getElementById("battleRecordOverlay")
  this.dom.battleRecordPanel = document.getElementById("battleRecordPanel")
  this.dom.battleRecordCloseBtn = document.getElementById("battleRecordCloseBtn")
  this.dom.battleRecordContent = document.getElementById("battleRecordContent")
  this.dom.itemOutlineBtn = document.getElementById("itemOutlineBtn")
  this.dom.itemQualityBtn = document.getElementById("itemQualityBtn")
  this.dom.itemDrawerToggleBtn = document.getElementById("itemDrawerToggleBtn")
  this.dom.itemDrawer = document.getElementById("itemDrawer")
  this.dom.itemDrawerCloseBtn = document.getElementById("itemDrawerCloseBtn")
  this.dom.itemDrawerList = document.getElementById("itemDrawerList")
  this.dom.skillBtn = document.getElementById("skillBtn")
  this.dom.bidInput = document.getElementById("bidInput") as HTMLInputElement | null
  this.dom.settleBtn = document.getElementById("settleBtn")
  this.dom.gameRoot = document.getElementById("game-root")
  this.dom.gameConfirmOverlay = document.getElementById("gameConfirmOverlay")
  this.dom.gameConfirmMsg = document.getElementById("gameConfirmMsg")
  this.dom.gameConfirmCancelBtn = document.getElementById("gameConfirmCancelBtn")
  this.dom.gameConfirmOkBtn = document.getElementById("gameConfirmOkBtn")
  this.dom.infoPopupOverlay = document.getElementById("infoPopupOverlay")
  this.dom.infoPopupTitle = document.getElementById("infoPopupTitle")
  this.dom.infoPopupCloseBtn = document.getElementById("infoPopupCloseBtn")
  this.dom.infoPopupContent = document.getElementById("infoPopupContent")
  this.dom.revealHintUp = document.getElementById("revealHintUp")
  this.dom.revealHintDown = document.getElementById("revealHintDown")

  this.dom.previewPopover = document.getElementById("previewPopover")
  this.dom.previewTitle = document.getElementById("previewTitle")
  this.dom.previewCloseBtn = document.getElementById("previewCloseBtn")
  this.dom.previewFilterRow = document.getElementById("previewFilterRow")
  this.dom.previewCategorySelect = document.getElementById("previewCategorySelect")
  this.dom.previewHint = document.getElementById("previewHint")
  this.dom.previewList = document.getElementById("previewList")

  this.dom.settleOverlay = document.getElementById("settleOverlay")
  this.dom.settleCard = document.getElementById("settleCard")
  this.dom.settlementPage = document.getElementById("settlementPage")
  this.dom.settleWinnerName = document.getElementById("settleWinnerName")
  this.dom.settleWinnerBid = document.getElementById("settleWinnerBid")
  this.dom.settleRevealedValue = document.getElementById("settleRevealedValue")
  this.dom.settleWinnerProfit = document.getElementById("settleWinnerProfit")
  this.dom.settleSelfProfitRow = document.getElementById("settleSelfProfitRow")
  this.dom.settleSelfProfit = document.getElementById("settleSelfProfit")
  this.dom.keypadDirectHint = document.getElementById("keypadDirectHint")
  this.dom.settleProgressText = document.getElementById("settleProgressText")
  this.dom.settleProgressTrack = document.getElementById("settleProgressTrack")
  this.dom.settleProgressFill = document.getElementById("settleProgressFill")
  this.dom.settleBackBtn = document.getElementById("settleBackBtn")
  this.dom.settleReplayBtn = document.getElementById("settleReplayBtn")
  this.dom.settleReflectionStatus = document.getElementById("settleReflectionStatus")

  this.dom.settingsOverlay = document.getElementById("settingsOverlay")
  this.dom.settingsPanel = document.getElementById("settingsPanel")
  this.dom.settingsScroll = document.getElementById("settingsScroll")
  this.dom.settingsCloseBtn = document.getElementById("settingsCloseBtn")
  this.dom.settingsResetBtn = document.getElementById("settingsResetBtn")
  this.dom.settingsSaveBtn = document.getElementById("settingsSaveBtn")
  this.dom.settingsReturnLobbyBtn = document.getElementById("settingsReturnLobbyBtn")
  this.dom.settingsStatusText = document.getElementById("settingsStatusText")
  this.dom.settingLlmEnabled = document.getElementById("setting-llmEnabled")
  this.dom.settingLlmMultiGameMemoryEnabled = document.getElementById("setting-llmMultiGameMemoryEnabled")
  this.dom.settingDeepseekApiKey =
    document.getElementById("setting-deepseekApiKey") || document.getElementById("setting-llmApiKey")
  this.dom.settingDeepseekModel =
    document.getElementById("setting-deepseekModel") || document.getElementById("setting-llmModel")
  this.dom.settingMaxTokens = document.getElementById("setting-maxTokens")
  this.dom.settingsTestDeepSeekBtn =
    document.getElementById("settingsTestDeepSeekBtn") || document.getElementById("settingsTestLlmBtn")
  this.dom.settingsLlmStatusText = document.getElementById("settingsLlmStatusText")
  this.dom.clearAiMemoryBtn = document.getElementById("clearAiMemoryBtn")
  this.dom.clearAiContextBtn = document.getElementById("clearAiContextBtn")
  this.dom.aiMemoryStatusText = document.getElementById("aiMemoryStatusText")
  this.dom.viewAiMemoryBtn = document.getElementById("viewAiMemoryBtn")
  this.dom.exportAiMemoryBtn = document.getElementById("exportAiMemoryBtn")
  this.dom.importAiMemoryBtn = document.getElementById("importAiMemoryBtn")
  this.dom.resetAiWalletBtn = document.getElementById("resetAiWalletBtn")
  this.dom.aiMemoryOverlay = document.getElementById("aiMemoryOverlay")
  this.dom.aiMemoryPanel = document.getElementById("aiMemoryPanel")
  this.dom.aiMemoryCloseBtn = document.getElementById("aiMemoryCloseBtn")
  this.dom.aiMemoryContent = document.getElementById("aiMemoryContent")
  this.dom.settingLlmReflectionEnabled = document.getElementById("setting-llmReflectionEnabled")
  this.dom.settingLlmThinkingEnabled = document.getElementById("setting-llmThinkingEnabled")
  this.dom.settingLlmIndependentModelEnabled = document.getElementById("setting-llmIndependentModelEnabled")
  this.dom.independentModelConfig = document.getElementById("independentModelConfig")
  this.dom.configIndependentModelBtn = document.getElementById("configIndependentModelBtn")
  this.dom.aiModelConfigOverlay = document.getElementById("aiModelConfigOverlay")
  this.dom.aiModelConfigCloseBtn = document.getElementById("aiModelConfigCloseBtn")
  this.dom.aiModelConfigSaveBtn = document.getElementById("aiModelConfigSaveBtn")

  this.dom.bidKeypad = document.getElementById("bidKeypad")
  this.dom.keypadCloseBtn = document.getElementById("keypadCloseBtn")
  this.dom.keypadScreen = document.getElementById("keypadScreen")

  this.dom.personalPanelScroll = document.getElementById("personalPanelScroll")
  this.dom.publicInfoScroll = document.getElementById("publicInfoScroll")
}

/**
 * 动效初始化
 */
export function initAnimations(this: WarehouseSceneThis): void {
  if (!MobaoAnimations) return

  const selector =
    ".hud button, .bottom-bid-bar button, .settle-actions button, .keypad-grid button, .keypad-actions button, .item-drawer-btn, .shop-item-buy, .lobby-nav-btn, .lobby-start-btn, .overlay button, .settings-content button, .collection-item-btn, .ai-panel button, .info-popup-content button, .bid-keypad-button"
  MobaoAnimations.bindAllButtonEffects(selector)

  document.querySelectorAll(selector).forEach(function (btn: Element) {
    if (btn && !(btn as HTMLElement).dataset.rippleInited) {
      ; (btn as HTMLElement).dataset.rippleInited = "1"
    }
  })

  const extraBtns = document.querySelectorAll('[data-btn-effect="ripple"]')
  extraBtns.forEach(function (btn: Element) {
    if (btn && !(btn as HTMLElement).dataset.rippleInited) {
      MobaoAnimations.bindRipple(btn as HTMLElement)
      MobaoAnimations.bindPressScale(btn as HTMLElement)
        ; (btn as HTMLElement).dataset.rippleInited = "1"
    }
  })

  const settleBtn = this.dom.settleBtn
  if (settleBtn) {
    MobaoAnimations.pulse(settleBtn, "soft", { duration: 2000 })
  }
}

/**
 * 绑定 DOM 事件
 *
 * 注意：此方法非常庞大（约 1170 行），包含所有 UI 交互逻辑。
 * 建议二次迁移时按功能域拆分到 ui/ 目录。
 */
export function bindDomEvents(this: WarehouseSceneThis): void {
  const updateVolumeIcon = (value: string | number, imgEl: HTMLImageElement | null) => {
    if (!imgEl) return
    const isMuted = Number(value) === 0
    imgEl.src = isMuted ? "./assets/images/icons/ui/mute-fill.svg" : "./assets/images/icons/ui/sound-on.svg"
    imgEl.classList.toggle("muted", isMuted)
  }

  this.dom.rerollBtn?.addEventListener("click", () => {
    if (this.isLanMode) return
    this.startNewRun()
  })
  this.dom.openSettingsBtn?.addEventListener("click", () => {
    this.openSettingsOverlay()
  })
  const roundSecondsInput = document.getElementById("setting-roundSeconds") as HTMLInputElement | null
  const roundSecondsDecrease = document.getElementById("roundSecondsDecrease") as HTMLButtonElement | null
  const roundSecondsIncrease = document.getElementById("roundSecondsIncrease") as HTMLButtonElement | null
  function updateRoundSecondsUI(value: number) {
    if (roundSecondsInput) {
      roundSecondsInput.value = String(value)
    }
    if (roundSecondsDecrease) {
      roundSecondsDecrease.disabled = value <= 10
    }
    if (roundSecondsIncrease) {
      roundSecondsIncrease.disabled = value >= 180
    }
  }
  if (roundSecondsDecrease && roundSecondsInput) {
    roundSecondsDecrease.addEventListener("click", () => {
      let value = Number(roundSecondsInput.value) || 60
      value = Math.max(10, value - 5)
      updateRoundSecondsUI(value)
    })
  }
  if (roundSecondsIncrease && roundSecondsInput) {
    roundSecondsIncrease.addEventListener("click", () => {
      let value = Number(roundSecondsInput.value) || 60
      value = Math.min(180, value + 5)
      updateRoundSecondsUI(value)
    })
  }
  const settlementSpeedInput = document.getElementById("setting-settlementSpeedMultiplier") as HTMLInputElement | null
  const settlementSpeedDecrease = document.getElementById("settlementSpeedDecrease") as HTMLButtonElement | null
  const settlementSpeedIncrease = document.getElementById("settlementSpeedIncrease") as HTMLButtonElement | null
  function updateSettlementSpeedUI(value: number) {
    if (settlementSpeedInput) {
      settlementSpeedInput.value = String(value)
    }
    if (settlementSpeedDecrease) {
      settlementSpeedDecrease.disabled = value <= 0.5
    }
    if (settlementSpeedIncrease) {
      settlementSpeedIncrease.disabled = value >= 3
    }
  }
  if (settlementSpeedDecrease && settlementSpeedInput) {
    settlementSpeedDecrease.addEventListener("click", () => {
      let value = Number(settlementSpeedInput.value) || 1
      value = Math.max(0.5, value - 0.5)
      updateSettlementSpeedUI(value)
    })
  }
  if (settlementSpeedIncrease && settlementSpeedInput) {
    settlementSpeedIncrease.addEventListener("click", () => {
      let value = Number(settlementSpeedInput.value) || 1
      value = Math.min(3, value + 0.5)
      updateSettlementSpeedUI(value)
    })
  }
  const contextLengthInput = document.getElementById("setting-contextLength") as HTMLInputElement | null
  const contextLengthDecrease = document.getElementById("contextLengthDecrease") as HTMLButtonElement | null
  const contextLengthIncrease = document.getElementById("contextLengthIncrease") as HTMLButtonElement | null
  const contextLengthConfig = document.getElementById("contextLengthConfig") as HTMLElement | null
  function updateContextLengthUI(value: number) {
    if (contextLengthInput) contextLengthInput.value = String(value)
    if (contextLengthDecrease) contextLengthDecrease.disabled = value <= 2
    if (contextLengthIncrease) contextLengthIncrease.disabled = value >= 20
  }
  if (contextLengthDecrease && contextLengthInput) {
    contextLengthDecrease.addEventListener("click", () => {
      let value = Number(contextLengthInput.value) || 5
      value = Math.max(2, value - 1)
      updateContextLengthUI(value)
    })
  }
  if (contextLengthIncrease && contextLengthInput) {
    contextLengthIncrease.addEventListener("click", () => {
      let value = Number(contextLengthInput.value) || 5
      value = Math.min(20, value + 1)
      updateContextLengthUI(value)
    })
  }
  const summaryConfig = document.getElementById("summaryConfig") as HTMLElement | null
  const multiGameMemoryCb = document.getElementById("setting-llmMultiGameMemoryEnabled") as HTMLInputElement | null
  const contextLengthInline = document.getElementById("contextLengthInline") as HTMLElement | null
  if (multiGameMemoryCb) {
    multiGameMemoryCb.addEventListener("change", () => {
      if (contextLengthInline) contextLengthInline.classList.toggle("hidden", !multiGameMemoryCb.checked)
      if (summaryConfig) summaryConfig.classList.toggle("hidden", !multiGameMemoryCb.checked)
    })
  }
  const reflectionCb = document.getElementById("setting-llmReflectionEnabled") as HTMLInputElement | null
  const reflectionScopeConfig = document.getElementById("reflectionScopeConfig") as HTMLElement | null
  if (reflectionCb && reflectionScopeConfig) {
    reflectionCb.addEventListener("change", () => {
      reflectionScopeConfig.classList.toggle("hidden", !reflectionCb.checked)
    })
  }
  const musicVolumeSlider = document.getElementById("setting-musicVolume") as HTMLInputElement | null
  const musicVolumeValue = document.getElementById("musicVolumeValue") as HTMLElement
  const musicVolumeIcon = document.getElementById("musicVolumeIcon") as HTMLElement | null
  const musicVolumeIconImg = document.getElementById("musicVolumeIconImg") as HTMLImageElement | null
  let musicVolumeBeforeMute = 70
  if (musicVolumeSlider && musicVolumeValue) {
    musicVolumeSlider.addEventListener("input", () => {
      const vol = Number(musicVolumeSlider.value)
      musicVolumeValue.textContent = `${vol}%`
      if (typeof AudioManager !== "undefined") {
        AudioManager.setBgmVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), musicVolumeIconImg)
    })
  }
  if (musicVolumeIcon && musicVolumeSlider && musicVolumeIconImg) {
    musicVolumeIcon.addEventListener("click", () => {
      if (Number(musicVolumeSlider.value) > 0) {
        musicVolumeBeforeMute = Number(musicVolumeSlider.value)
        musicVolumeSlider.value = "0"
      } else {
        musicVolumeSlider.value = String(musicVolumeBeforeMute)
      }
      const vol = Number(musicVolumeSlider.value)
      musicVolumeValue.textContent = `${vol}%`
      if (typeof AudioManager !== "undefined") {
        AudioManager.setBgmVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), musicVolumeIconImg)
    })
  }
  const sfxVolumeSlider = document.getElementById("setting-sfxVolume") as HTMLInputElement | null
  const sfxVolumeValue = document.getElementById("sfxVolumeValue") as HTMLElement
  const sfxVolumeIcon = document.getElementById("sfxVolumeIcon") as HTMLElement | null
  const sfxVolumeIconImg = document.getElementById("sfxVolumeIconImg") as HTMLImageElement | null
  let sfxVolumeBeforeMute = 80
  if (sfxVolumeSlider && sfxVolumeValue) {
    sfxVolumeSlider.addEventListener("input", () => {
      const vol = Number(sfxVolumeSlider.value)
      sfxVolumeValue.textContent = `${vol}%`
      if (typeof AudioManager !== "undefined") {
        AudioManager.setSfxVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), sfxVolumeIconImg)
    })
  }
  if (sfxVolumeIcon && sfxVolumeSlider && sfxVolumeIconImg) {
    sfxVolumeIcon.addEventListener("click", () => {
      if (Number(sfxVolumeSlider.value) > 0) {
        sfxVolumeBeforeMute = Number(sfxVolumeSlider.value)
        sfxVolumeSlider.value = "0"
      } else {
        sfxVolumeSlider.value = String(sfxVolumeBeforeMute)
      }
      const vol = Number(sfxVolumeSlider.value)
      sfxVolumeValue.textContent = `${vol}%`
      if (typeof AudioManager !== "undefined") {
        AudioManager.setSfxVolume(vol / 100)
      }
      updateVolumeIcon(String(vol), sfxVolumeIconImg)
    })
  }
  const gameShopBtn = document.getElementById("gameShopBtn")
  if (gameShopBtn) {
    gameShopBtn.addEventListener("click", () => this.openShopOverlay())
  }
  const backToLobbyBtn = document.getElementById("backToLobbyBtn")
  if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener("click", () => {
      this.stopRoundTimer()
      this.enterLobby()
    })
  }
  this.dom.nextRoundBtn?.addEventListener("click", () => this.resolveRoundBids("manual"))
  if (this.dom.pauseRoundBtn) {
    this.dom.pauseRoundBtn?.addEventListener("click", () => this.toggleRoundPause())
  }

  this.dom.aiLogicBtn?.addEventListener("click", () => this.openAiLogicPanel())
  if (this.dom.aiLogicCloseBtn) {
    this.dom.aiLogicCloseBtn?.addEventListener("click", () => this.closeAiLogicPanel())
  }
  if (this.dom.aiLogicOverlay) {
    this.dom.aiLogicOverlay?.addEventListener("click", (event) => {
      if (event.target === this.dom.aiLogicOverlay) {
        this.closeAiLogicPanel()
      }
    })
  }
  if (this.dom.aiViewMessagesBtn) {
    this.dom.aiViewMessagesBtn?.addEventListener("click", () => this.showAiConversationMessages())
  }
  if (this.dom.battleRecordCloseBtn) {
    this.dom.battleRecordCloseBtn?.addEventListener("click", () => this.closeBattleRecordPanel())
  }
  if (this.dom.battleRecordOverlay) {
    this.dom.battleRecordOverlay?.addEventListener("click", (event) => {
      if (event.target === this.dom.battleRecordOverlay) {
        this.closeBattleRecordPanel()
      }
    })
  }
  if (this.dom.battleRecordContent) {
    this.dom.battleRecordContent?.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const replayButton = target.closest("button[data-record-id]")
      if (replayButton instanceof HTMLButtonElement) {
        const recordId = replayButton.dataset.recordId
        if (recordId) {
          this.openBattleRecordReplay(recordId)
        }
        return
      }

      const logButton = target.closest("button[data-record-log-id]")
      if (logButton instanceof HTMLButtonElement) {
        const recordId = logButton.dataset.recordLogId
        if (recordId) {
          this.openBattleRecordLogs(recordId, 1)
        }
        return
      }

      if (target.closest("button[data-log-close]")) {
        this.closeBattleRecordLogs()
        return
      }

      if (target.closest("button[data-log-prev]")) {
        const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId
        const page = Math.max(
          1,
          Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) - 1
        )
        if (recordId) {
          this.openBattleRecordLogs(recordId, page)
        }
        return
      }

      if (target.closest("button[data-log-next]")) {
        const recordId = this.battleRecordLogView && this.battleRecordLogView.recordId
        const page = Math.max(
          1,
          Math.round(Number((this.battleRecordLogView && this.battleRecordLogView.page) || 1)) + 1
        )
        if (recordId) {
          this.openBattleRecordLogs(recordId, page)
        }
        return
      }

      const deleteButton = target.closest("button[data-delete-record-id]")
      if (deleteButton instanceof HTMLButtonElement) {
        const recordId = deleteButton.dataset.deleteRecordId
        if (recordId) {
          this.deleteBattleRecord(recordId)
        }
      }
    })
  }
  if (this.dom.itemOutlineBtn) {
    this.dom.itemOutlineBtn?.addEventListener("click", () => this.useItem("item-outline-lamp"))
  }
  if (this.dom.itemQualityBtn) {
    this.dom.itemQualityBtn?.addEventListener("click", () => this.useItem("item-quality-needle"))
  }
  if (this.dom.itemDrawerToggleBtn) {
    this.dom.itemDrawerToggleBtn?.addEventListener("click", () => this.toggleItemDrawer())
  }
  if (this.dom.itemDrawerCloseBtn) {
    this.dom.itemDrawerCloseBtn?.addEventListener("click", () => this.closeItemDrawer())
  }
  if (this.dom.itemDrawerList) {
    this.dom.itemDrawerList?.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const button = target.closest("button[data-item-id]")
      if (!(button instanceof HTMLElement)) {
        return
      }
      const itemId = button.dataset.itemId
      if (!itemId) {
        return
      }
      this.useItem(itemId)
      this.closeItemDrawer()
    })
  }

  this.bindCharacterSkillButton()
  this.dom.settleBtn?.addEventListener("click", () => this.settleCurrentRun())
  this.dom.settleBackBtn?.addEventListener("click", () => {
    if (this.shouldShowReflectionUI() && this.aiReflectionState === "pending") {
      this.showReflectionPendingDialogForBack()
      return
    }
    this.exitSettlementPage()
    if (this.battleRecordReplayActive) {
      this.battleRecordReplayActive = false
      this.battleRecordReplayRecordId = null
      this.enterLobby()
      setTimeout(() => {
        this.openBattleRecordPanel()
        this.writeLog("已返回战绩列表，可继续选择其他战绩回放。")
      }, 100)
      return
    }
    if (this.isLanMode) {
      this.enterLanRoom()
    } else {
      this.enterLobby()
    }
  })
  this.dom.settleReplayBtn?.addEventListener("click", () => {
    if (this.shouldShowReflectionUI() && this.aiReflectionState === "pending") {
      this.showReflectionPendingDialog()
      return
    }
    if (this.isLanMode) {
      if (this.lanIsHost) {
        const aiCount = this.lanAiPlayers ? this.lanAiPlayers.length : 0
        const aiPlayers = (this.lanAiPlayers || []).map((ai) => ({
          id: ai.id,
          name: ai.name,
          isAI: true,
          isHost: false,
          llm: !!ai.llm
        }))
        this.lanBridge?.send({ type: "game:restart-request", aiCount, aiLlmEnabled: this.lanAiLlmEnabled, aiPlayers })
        this.showLanRestartWaitingDialog()
      } else {
        this.writeLog("等待主机发起重开请求...")
      }
    } else {
      this.proceedToNewRun()
    }
  })

  if (this.dom.previewCloseBtn) {
    this.dom.previewCloseBtn?.addEventListener("click", () => this.hidePreview())
  }
  this.setupPreviewTouchScroll()
  this.dom.previewCategorySelect?.addEventListener("change", () => {
    if (this.selectedItem) {
      this.renderPreviewCandidates(this.selectedItem)
    }
  })

  this.dom.settingsCloseBtn?.addEventListener("click", () => this.closeSettingsOverlay(false))
  this.dom.settingsResetBtn?.addEventListener("click", () => {
    this.fillSettingsForm(defaultGameSettings())
    const provider = this.getLlmProvider()
    this.fillLlmSettingsForm(
      provider && typeof provider.defaultSettings === "function"
        ? provider.defaultSettings()
        : defaultDeepSeekSettings()
    )
    this.setSettingsStatus("已恢复默认，点击保存后生效。", false)
  })
  this.dom.settingsSaveBtn?.addEventListener("click", () => this.saveSettingsFromOverlay())
  if (this.dom.settingsReturnLobbyBtn) {
    this.dom.settingsReturnLobbyBtn?.addEventListener("click", () => {
      if (this.isLanMode) {
        this.showGameConfirm("确定要返回房间吗？当前游戏进度将丢失。", () => {
          this.closeSettingsOverlay(false)
          this.enterLanRoom()
        })
      } else {
        this.showGameConfirm("确定要返回大厅吗？当前游戏进度将丢失。", () => {
          this.closeSettingsOverlay(false)
          this.enterLobby()
        })
      }
    })
  }
  if (this.dom.clearAiMemoryBtn) {
    this.dom.clearAiMemoryBtn?.addEventListener("click", () => {
      this.showGameConfirm("确定要清空所有AI的持久化记忆吗？此操作不可恢复。", () => {
        this.clearAiMemoryStorage()
        if (this.dom.aiMemoryStatusText) {
          this.dom.aiMemoryStatusText.textContent = "已清空"
        }
        this.writeLog("AI持久化记忆已清空。")
      })
    })
  }
  if (this.dom.clearAiContextBtn) {
    this.dom.clearAiContextBtn?.addEventListener("click", () => {
      this.showGameConfirm("确定要清空AI跨局上下文吗？这将清除所有AI的跨局记忆和对话缓存。", () => {
        if (this.aiCrossGameMessagesByPlayer) {
          Object.keys(this.aiCrossGameMessagesByPlayer).forEach((pid) => {
            this.aiCrossGameMessagesByPlayer[pid] = []
          })
        }
        if (this.pendingNextRunAiSummaryByPlayer) {
          Object.keys(this.pendingNextRunAiSummaryByPlayer).forEach((pid) => {
            this.pendingNextRunAiSummaryByPlayer[pid] = ""
          })
        }
        if (this.aiConversationCache) {
          Object.keys(this.aiConversationCache).forEach((pid) => {
            this.aiConversationCache[pid] = null
          })
        }
        this.pendingSettlementSummary = ""
        this.saveAiMemoryToStorage()
        this.writeLog("AI跨局上下文已清空。")
      })
    })
  }
  if (this.dom.viewAiMemoryBtn) {
    this.dom.viewAiMemoryBtn?.addEventListener("click", () => {
      this.openAiMemoryPanel()
    })
  }
  if (this.dom.exportAiMemoryBtn) {
    this.dom.exportAiMemoryBtn?.addEventListener("click", () => {
      this.showAiMemoryExportDialog()
    })
  }
  this.showAiMemoryExportDialog = () => {
    this.removeAiMemoryExportDialog()
    const jsonData = this.exportAiMemoryToJson()
    const overlay = document.createElement("div")
    overlay.id = "aiMemoryExportDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:20px;text-align:center;color:#e0d0b0;font-size:16px;max-width:400px;width:90%;"
    box.innerHTML =
      '<div style="margin-bottom:16px;font-size:18px;font-weight:bold;">导出AI记忆</div>' +
      '<div style="color:#a09070;margin-bottom:12px;font-size:14px;">选择导出方式：</div>' +
      '<div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;">' +
      '<button id="exportShareBtn" style="padding:12px 24px;border-radius:8px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:15px;">分享</button>' +
      '<button id="exportCopyBtn" style="padding:12px 24px;border-radius:8px;border:1px solid #5a7ebd;background:rgba(90,126,189,0.15);color:#5a7ebd;cursor:pointer;font-size:15px;">复制JSON</button>' +
      "</div>" +
      '<button id="exportDialogCloseBtn" style="padding:10px 24px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">关闭</button>'
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const fileName = `mobao-ai-memory-${new Date().toISOString().slice(0, 10)}.json`
    const closeBtn = document.getElementById("exportDialogCloseBtn")
    if (closeBtn) closeBtn.addEventListener("click", () => {
      this.removeAiMemoryExportDialog()
    })
    const shareBtn = document.getElementById("exportShareBtn")
    if (shareBtn) shareBtn.addEventListener("click", () => {
      if (window.NativeBridge?.shareFile) {
        const base64Data = btoa(unescape(encodeURIComponent(jsonData)))
        const success = window.NativeBridge.shareFile(base64Data, fileName, "AI记忆导出")
        if (success) {
          if (this.dom.aiMemoryStatusText) {
            this.dom.aiMemoryStatusText.textContent = "已导出"
          }
          this.writeLog("AI记忆已通过分享导出。")
          this.removeAiMemoryExportDialog()
        } else {
          this.writeLog("分享导出失败。")
        }
      } else {
        const blob = new Blob([jsonData], { type: "application/json" })
        const file = new File([blob], fileName, { type: "application/json" })
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator
            .share({
              files: [file],
              title: "AI记忆导出",
              text: "导出AI跨局记忆数据"
            })
            .then(() => {
              if (this.dom.aiMemoryStatusText) {
                this.dom.aiMemoryStatusText.textContent = "已导出"
              }
              this.writeLog("AI记忆已通过分享导出。")
              this.removeAiMemoryExportDialog()
            })
            .catch((err) => {
              this.writeLog("分享导出失败: " + (err.message || "未知错误"))
            })
        } else {
          this.writeLog("当前环境不支持分享文件功能。")
        }
      }
    })
    const copyBtn = document.getElementById("exportCopyBtn")
    if (copyBtn) copyBtn.addEventListener("click", () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(jsonData)
          .then(() => {
            if (this.dom.aiMemoryStatusText) {
              this.dom.aiMemoryStatusText.textContent = "已复制"
            }
            this.writeLog("AI记忆JSON已复制到剪贴板。")
            this.removeAiMemoryExportDialog()
          })
          .catch((err) => {
            this.writeLog("复制失败: " + (err.message || "未知错误"))
          })
      } else {
        this.writeLog("当前环境不支持剪贴板功能。")
      }
    })
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.removeAiMemoryExportDialog()
      }
    })
  }
  this.removeAiMemoryExportDialog = () => {
    const el = document.getElementById("aiMemoryExportDialog")
    if (el) el.remove()
  }
  if (this.dom.importAiMemoryBtn) {
    this.dom.importAiMemoryBtn?.addEventListener("click", () => {
      this.showAiMemoryImportDialog()
    })
  }
  window.__onFileImportResult = (base64Data) => {
    const statusEl = document.getElementById("importStatus")
    try {
      const jsonText = decodeURIComponent(escape(atob(base64Data)))
      const result = this.importAiMemoryFromJson(jsonText)
      if (result.ok) {
        if (statusEl) {
          statusEl.textContent = "导入成功！"
          statusEl.className = "ai-import-status success"
        }
        if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
        this.writeLog("AI记忆已从文件导入。")
        setTimeout(() => this.removeAiMemoryImportDialog(), 800)
      } else {
        if (statusEl) {
          statusEl.textContent = "导入失败: " + result.error
          statusEl.className = "ai-import-status error"
        }
        this.writeLog("导入失败: " + result.error)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (statusEl) {
        statusEl.textContent = "文件解析失败: " + msg
        statusEl.className = "ai-import-status error"
      }
      this.writeLog("文件解析失败: " + msg)
    }
  }
  window.__onFileImportError = (errorMsg) => {
    const statusEl = document.getElementById("importStatus")
    if (statusEl) {
      statusEl.textContent = "导入错误: " + errorMsg
      statusEl.className = "ai-import-status error"
    }
    this.writeLog("文件导入错误: " + errorMsg)
  }
  this.showAiMemoryImportDialog = () => {
    this.removeAiMemoryImportDialog()
    const overlay = document.createElement("div")
    overlay.id = "aiMemoryImportDialog"
    overlay.className = "ai-import-overlay"
    const hasNativeImport = !!window.NativeBridge?.openFileImport
    const box = document.createElement("div")
    box.className = "ai-import-box"
    box.innerHTML =
      '<div class="ai-import-title">导入AI记忆</div>' +
      '<div class="ai-import-actions">' +
      (hasNativeImport
        ? '<button id="importFileBtn" class="ai-import-btn">从文件导入</button>'
        : '<label id="importFileBtn" class="ai-import-btn" style="cursor:pointer;display:inline-block;">从文件导入<input type="file" id="importFileInput" accept=".json,application/json" style="display:none;"></label>') +
      '<button id="importPasteBtn" class="ai-import-btn secondary">粘贴JSON</button>' +
      "</div>" +
      '<div id="importPasteArea" style="display:none;">' +
      '<textarea id="importJsonTextarea" class="ai-import-textarea" placeholder="在此粘贴JSON数据..."></textarea>' +
      "</div>" +
      '<div id="importStatus" class="ai-import-status"></div>' +
      '<div class="ai-import-footer">' +
      '<button id="importPasteConfirmBtn" class="ai-import-btn" style="display:none;">确认导入</button>' +
      '<button id="importDialogCloseBtn" class="ai-import-close">关闭</button>' +
      "</div>"
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    const textarea = document.getElementById("importJsonTextarea") as HTMLTextAreaElement | null
    const pasteArea = document.getElementById("importPasteArea")
    const confirmBtn = document.getElementById("importPasteConfirmBtn")
    const fileBtn = document.getElementById("importFileBtn")
    const pasteBtn = document.getElementById("importPasteBtn")
    const statusEl = document.getElementById("importStatus")
    const fileInput = document.getElementById("importFileInput")

    const showStatus = (msg: string, type?: string | null) => {
      if (!statusEl) return
      statusEl.textContent = msg
      statusEl.className = "ai-import-status " + (type || "")
    }

    if (hasNativeImport && fileBtn) {
      fileBtn.addEventListener("click", () => {
        showStatus("正在打开文件选择器...", "loading")
        window.NativeBridge?.openFileImport?.()
      })
    }

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        showStatus("正在读取文件...", "loading")
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const jsonText = (ev.target as FileReader).result as string
            const result = this.importAiMemoryFromJson(jsonText)
            if (result.ok) {
              showStatus("导入成功！", "success")
              if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
              this.writeLog("AI记忆已从文件导入。")
              setTimeout(() => this.removeAiMemoryImportDialog(), 800)
            } else {
              showStatus("导入失败: " + result.error, "error")
            }
          } catch (err: unknown) {
            showStatus("文件解析失败: " + (err instanceof Error ? err.message : String(err)), "error")
          }
        }
        reader.onerror = () => showStatus("文件读取失败", "error")
        reader.readAsText(file)
      })
    }

    if (pasteBtn) {
      pasteBtn.addEventListener("click", () => {
        if (pasteArea) pasteArea.style.display = "block"
        if (textarea) textarea.focus()
        if (confirmBtn) confirmBtn.style.display = "inline-block"
        if (fileBtn) fileBtn.style.display = "none"
        if (pasteBtn) pasteBtn.style.display = "none"
      })
    }

    const importCloseBtn = document.getElementById("importDialogCloseBtn")
    if (importCloseBtn) importCloseBtn.addEventListener("click", () => {
      this.removeAiMemoryImportDialog()
    })
    const importPasteBtn = document.getElementById("importPasteConfirmBtn")
    if (importPasteBtn) importPasteBtn.addEventListener("click", () => {
      if (!textarea) return
      const jsonText = textarea.value.trim()
      if (!jsonText) {
        showStatus("请粘贴JSON数据。", "error")
        return
      }
      showStatus("正在导入...", "loading")
      const result = this.importAiMemoryFromJson(jsonText)
      if (result.ok) {
        showStatus("导入成功！", "success")
        if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
        this.writeLog("AI记忆已成功导入。")
        setTimeout(() => this.removeAiMemoryImportDialog(), 800)
      } else {
        showStatus("导入失败: " + result.error, "error")
      }
    })
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.removeAiMemoryImportDialog()
      }
    })
  }
  this.removeAiMemoryImportDialog = () => {
    const el = document.getElementById("aiMemoryImportDialog")
    if (el) el.remove()
  }
  this.downloadAiMemoryFallback = (jsonData: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([jsonData], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (this.dom.aiMemoryStatusText) {
      this.dom.aiMemoryStatusText.textContent = "已导出"
    }
    this.writeLog("AI记忆已导出到文件。")
  }
  if (this.dom.resetAiWalletBtn) {
    this.dom.resetAiWalletBtn?.addEventListener("click", () => {
      const okBtn = document.getElementById("gameConfirmOkBtn")
      const cancelBtn = document.getElementById("gameConfirmCancelBtn")
      const originalOkText = okBtn ? okBtn.textContent : ""
      const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
      if (okBtn) okBtn.textContent = "确认重置"
      if (cancelBtn) cancelBtn.textContent = "取消"

      this.showGameConfirm(
        "确定要重置所有AI钱包到初始100万吗？此操作不可撤销。",
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText

          this.resetAiWallets()
          if (this.dom.aiMemoryStatusText) {
            this.dom.aiMemoryStatusText.textContent = "已重置AI钱包"
          }
          this.writeLog("AI钱包已重置为100万。")
        },
        () => {
          if (okBtn) okBtn.textContent = originalOkText
          if (cancelBtn) cancelBtn.textContent = originalCancelText
        }
      )
    })
  }
  if (this.dom.aiMemoryCloseBtn) {
    this.dom.aiMemoryCloseBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.closeAiMemoryPanel()
    })
  }
  if (this.dom.settingLlmIndependentModelEnabled) {
    this.dom.settingLlmIndependentModelEnabled?.addEventListener("change", () => {
      const checked = (this.dom.settingLlmIndependentModelEnabled as HTMLInputElement).checked
      if (this.dom.independentModelConfig) {
        this.dom.independentModelConfig.classList.toggle("hidden", !checked)
      }
    })
  }
  if (this.dom.configIndependentModelBtn) {
    this.dom.configIndependentModelBtn?.addEventListener("click", () => {
      this.openAiModelConfigOverlay()
    })
  }
  if (this.dom.aiModelConfigCloseBtn) {
    this.dom.aiModelConfigCloseBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.closeAiModelConfigOverlay()
    })
  }
  if (this.dom.aiModelConfigSaveBtn) {
    this.dom.aiModelConfigSaveBtn?.addEventListener("click", (event) => {
      event.stopPropagation()
      this.saveAiModelConfigFromForm()
    })
  }
  if (this.dom.aiModelConfigOverlay) {
    this.dom.aiModelConfigOverlay?.addEventListener("click", (event) => {
      event.stopPropagation()
      if (event.target === this.dom.aiModelConfigOverlay) {
        this.closeAiModelConfigOverlay()
      }
    })
  }
  const aiModelConfigPanel = document.getElementById("aiModelConfigPanel")
  if (aiModelConfigPanel) {
    aiModelConfigPanel.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  }
  if (this.dom.aiMemoryOverlay) {
    this.dom.aiMemoryOverlay?.addEventListener("click", (event) => {
      event.stopPropagation()
      if (event.target === this.dom.aiMemoryOverlay) {
        this.closeAiMemoryPanel()
      }
    })
  }
  if (this.dom.aiMemoryPanel) {
    this.dom.aiMemoryPanel?.addEventListener("click", (event) => {
      event.stopPropagation()
    })
    this.dom.aiMemoryPanel?.addEventListener(
      "touchstart",
      (event) => {
        event.stopPropagation()
      },
      { passive: true }
    )
    this.dom.aiMemoryPanel?.addEventListener(
      "touchmove",
      (event) => {
        event.stopPropagation()
      },
      { passive: true }
    )
  }
  this.dom.settingsOverlay?.addEventListener("click", (event) => {
    if (this.dom.aiMemoryOverlay && !this.dom.aiMemoryOverlay.classList.contains("hidden")) {
      return
    }
    if (this.dom.aiModelConfigOverlay && !this.dom.aiModelConfigOverlay.classList.contains("hidden")) {
      return
    }
    const customProviderModal = document.getElementById("customProviderModal")
    if (customProviderModal && !customProviderModal.classList.contains("hidden")) {
      return
    }
    const gameConfirmOverlay = document.getElementById("gameConfirmOverlay")
    if (gameConfirmOverlay && !gameConfirmOverlay.classList.contains("hidden")) {
      return
    }
    if (event.target === this.dom.settingsOverlay) {
      this.closeSettingsOverlay(false)
    }
  })

  this.dom.gameRoot?.addEventListener(
    "wheel",
    (event) => {
      if (!this.dom.gameRoot) {
        return
      }

      if (this.isSettingsOverlayOpen()) {
        if (this.scrollElementByWheel(this.dom.settingsScroll, event.deltaY)) {
          event.preventDefault()
        } else {
          event.preventDefault()
        }
        return
      }

      if (
        event.target instanceof HTMLElement &&
        this.dom.previewPopover &&
        this.dom.previewPopover.contains(event.target) &&
        !this.dom.previewPopover.classList.contains("hidden")
      ) {
        this.scrollElementByWheel(this.dom.previewPopover, event.deltaY)
        event.preventDefault()
        return
      }

      if (
        this.dom.previewPopover &&
        !this.dom.previewPopover.classList.contains("hidden") &&
        event.target instanceof HTMLElement &&
        this.dom.gameRoot &&
        this.dom.gameRoot.contains(event.target) &&
        !this.dom.previewPopover.contains(event.target)
      ) {
        this.hidePreview()
      }

      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        if (this.dom.gameRoot && this.scrollElementByWheel(this.dom.gameRoot, event.deltaY)) {
          event.preventDefault()
        }
      }
    },
    { passive: false }
  )

  this.dom.gameRoot?.addEventListener(
    "scroll",
    () => {
      this.refreshRevealScrollHints()
    },
    { passive: true }
  )

  let touchStartY = 0
  let touchStartScrollTop = 0
  let touchInPreview = false
  this.dom.gameRoot?.addEventListener(
    "touchstart",
    (e) => {
      touchInPreview =
        e.target instanceof HTMLElement &&
        !!this.dom.previewPopover &&
        this.dom.previewPopover.contains(e.target) &&
        !this.dom.previewPopover.classList.contains("hidden")
      if (touchInPreview) return
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY
        if (this.dom.gameRoot) touchStartScrollTop = this.dom.gameRoot.scrollTop
      }
    },
    { passive: true }
  )

  this.dom.gameRoot?.addEventListener(
    "touchmove",
    (e) => {
      if (touchInPreview) return
      if (e.touches.length !== 1) return
      if (!this.dom.gameRoot) return
      const dy = touchStartY - e.touches[0].clientY
      const maxScroll = this.dom.gameRoot.scrollHeight - this.dom.gameRoot.clientHeight
      if (maxScroll <= 0) return
      this.dom.gameRoot.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
    },
    { passive: true }
  )

  this.dom.gameRoot?.addEventListener("pointerdown", (event) => {
    if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
      return
    }

    const target = event.target
    if (target instanceof HTMLElement && this.dom.previewPopover && this.dom.previewPopover.contains(target)) {
      return
    }

    const point = this.toWorldPointFromRootEvent(event as MouseEvent)
    if (!point) {
      return
    }

    if (this.isPointOnSettlementLockedItem(point.x, point.y)) {
      return
    }

    this.settlementRevealSkipRequested = true
    event.preventDefault()
  })

    ; (this.dom.bidInput as HTMLInputElement).readOnly = true
  this.dom.bidInput?.addEventListener("keydown", (event) => event.preventDefault())
  this.dom.bidInput?.addEventListener("click", () => this.openBidKeypad())
  this.dom.bidInput?.addEventListener("focus", () => this.openBidKeypad())

  this.dom.keypadCloseBtn?.addEventListener("click", () => this.closeBidKeypad())
  this.dom.bidKeypad?.addEventListener("pointerdown", (event) => {
    event.stopPropagation()
  })
  this.dom.bidKeypad?.addEventListener("click", (event) => {
    event.stopPropagation()
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const key = target.dataset.key
    if (!key) {
      return
    }

    this.handleBidKeyInput(key)
  })

    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on("keydown-R", () => {
      if (this.isLanMode) return
      this.startNewRun()
    })
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on("keydown-N", () => {
      if (this.isLanMode && !this.lanIsHost) return
      this.resolveRoundBids("manual")
    })
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on("keydown-B", () => this.openBidKeypad())
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on("keydown-P", () => {
      if (this.isLanMode && !this.lanIsHost) return
      this.toggleRoundPause()
    })

  this.dom.gameConfirmCancelBtn?.addEventListener("click", (event) => {
    event.stopPropagation()
    const cb = this._gameCancelCallback
    this.hideGameConfirm()
    if (cb) {
      cb()
    }
  })
  this.dom.gameConfirmOkBtn?.addEventListener("click", (event) => {
    event.stopPropagation()
    const cb = this._gameConfirmCallback
    this.hideGameConfirm()
    if (cb) {
      cb()
    }
  })

  this.dom.gameConfirmOverlay?.addEventListener("click", (event) => {
    event.stopPropagation()
  })
  const gameConfirmBox = document.querySelector(".game-confirm-box")
  if (gameConfirmBox) {
    gameConfirmBox.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  }

  this.dom.infoPopupCloseBtn?.addEventListener("click", () => this.hideInfoPopup())
  this.dom.infoPopupOverlay?.addEventListener("click", (event) => {
    if (event.target === this.dom.infoPopupOverlay) {
      this.hideInfoPopup()
    }
  })

  const playerInfoPopover = document.getElementById("playerInfoPopover")
  const playerInfoPopoverCloseBtn = document.getElementById("playerInfoPopoverCloseBtn")
  if (playerInfoPopoverCloseBtn) {
    playerInfoPopoverCloseBtn.addEventListener("click", () => this.hidePlayerInfoPopover())
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    if (playerInfoPopover && playerInfoPopover.contains(target)) {
      return
    }

    if (
      target.closest(".llm-player-switch") ||
      target.closest(".llm-error-badge") ||
      target.closest("input") ||
      target.closest("button")
    ) {
      return
    }

    const historyChip = target.closest(".history-chip")
    if (historyChip) {
      event.preventDefault()
      event.stopPropagation()
      const itemId = historyChip.getAttribute("data-item-id")
      if (itemId) {
        const info = this.getItemInfo(itemId)
        this.showItemDetailPopup(itemId, info.label, event.clientX, event.clientY)
      }
      return
    }

    const playerCard = target.closest(".player-card")
    if (playerCard) {
      const playerId = playerCard.id.replace("playerCard-", "")
      if (playerId) {
        this.showCharacterInfoPopup(playerId, event.clientX, event.clientY)
      }
    } else {
      this.hidePlayerInfoPopover()
    }
  })

  const personalPanel = document.getElementById("personalPanel")
  if (personalPanel) {
    personalPanel.style.cursor = "pointer"
    personalPanel.addEventListener("click", () => this.showInfoPopup("个人情报区", this.dom.personalPanelScroll))
  }
  const publicPanel = document.getElementById("publicPanel")
  if (publicPanel) {
    publicPanel.style.cursor = "pointer"
    publicPanel.addEventListener("click", () => this.showInfoPopup("公共信息区", this.dom.publicInfoScroll))
  }

  ; (this.input as Phaser.Input.InputPlugin & { on: (event: string, cb: (pointer: { x: number; y: number }) => void) => void }).on("pointerdown", (pointer: { x: number; y: number }) => {
    if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
      return
    }

    if (this.isPointOnSettlementLockedItem(pointer.x, pointer.y)) {
      return
    }

    this.settlementRevealSkipRequested = true
  })

  document.addEventListener("pointerdown", (event) => {
    const target = event.target
    const targetEl = target instanceof HTMLElement ? target : null

    if (
      this.settlementRevealRunning &&
      this.isSettlementPageActive() &&
      !(targetEl && this.dom.previewPopover && this.dom.previewPopover.contains(targetEl)) &&
      !(targetEl && this.dom.gameRoot && this.dom.gameRoot.contains(targetEl))
    ) {
      this.settlementRevealSkipRequested = true
    }

    if (
      targetEl &&
      this.isSettingsOverlayOpen() &&
      this.dom.settingsPanel &&
      !this.dom.settingsPanel.contains(targetEl) &&
      targetEl !== this.dom.openSettingsBtn
    ) {
      const isAiMemoryOpen = this.dom.aiMemoryOverlay && !this.dom.aiMemoryOverlay.classList.contains("hidden")
      const isAiModelConfigOpen =
        this.dom.aiModelConfigOverlay && !this.dom.aiModelConfigOverlay.classList.contains("hidden")
      const customProviderModal = document.getElementById("customProviderModal")
      const isCustomProviderOpen = customProviderModal && !customProviderModal.classList.contains("hidden")
      const gameConfirmOverlay = document.getElementById("gameConfirmOverlay")
      const isGameConfirmOpen = gameConfirmOverlay && !gameConfirmOverlay.classList.contains("hidden")
      const fixedInputOverlay = document.getElementById("fixedInputOverlay")
      const isFixedInputOpen = fixedInputOverlay && fixedInputOverlay.classList.contains("show")
      const aiMemoryImportDialog = document.getElementById("aiMemoryImportDialog")
      const isAiMemoryImportOpen = aiMemoryImportDialog && !aiMemoryImportDialog.classList.contains("hidden")
      const aiMemoryExportDialog = document.getElementById("aiMemoryExportDialog")
      const isAiMemoryExportOpen = aiMemoryExportDialog && !aiMemoryExportDialog.classList.contains("hidden")
      const aiMemoryCopyFallback = document.getElementById("aiMemoryCopyFallback")
      const isAiMemoryCopyOpen = aiMemoryCopyFallback && !aiMemoryCopyFallback.classList.contains("hidden")
      if (
        !isAiMemoryOpen &&
        !isAiModelConfigOpen &&
        !isCustomProviderOpen &&
        !isGameConfirmOpen &&
        !isFixedInputOpen &&
        !isAiMemoryImportOpen &&
        !isAiMemoryExportOpen &&
        !isAiMemoryCopyOpen
      ) {
        this.closeSettingsOverlay(false)
      }
    }

    if (this.dom.previewPopover && !this.dom.previewPopover.classList.contains("hidden") && Date.now() - this.previewOpenTick >= 140) {
      if (targetEl && this.dom.previewPopover && !this.dom.previewPopover.contains(targetEl)) {
        this.hidePreview()
      }
    }

    if (
      targetEl &&
      this.dom.bidKeypad &&
      !this.dom.bidKeypad.classList.contains("hidden") &&
      !this.dom.bidKeypad.contains(targetEl) &&
      targetEl !== this.dom.bidInput
    ) {
      this.closeBidKeypad()
    }

    if (
      targetEl &&
      this.dom.itemDrawer &&
      !this.dom.itemDrawer.classList.contains("hidden") &&
      !this.dom.itemDrawer.contains(targetEl) &&
      targetEl !== this.dom.itemDrawerToggleBtn
    ) {
      this.closeItemDrawer()
    }
  })

  document.addEventListener("visibilitychange", () => {
    if (!this.isLanMode) return
    if (document.hidden) {
      this.onLanBackground()
    } else {
      this.onLanForeground()
    }
  })
}
