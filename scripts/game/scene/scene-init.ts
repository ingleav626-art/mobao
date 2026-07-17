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
import { WarehouseScene } from "./warehouse-scene"
import type { WarehouseMixinMethods } from "./warehouse-scene"
import { bindSettingsEvents } from "./events-settings"
import { bindAiPanelEvents } from "./events-ai-panel"
import { bindBattleRecordEvents } from "./events-battle-record"
import { bindItemDrawerEvents } from "./events-item-drawer"
import { bindSettlementEvents } from "./events-settlement"
import { bindAiMemoryEvents } from "./events-ai-memory"
import { bindOverlayEvents } from "./events-overlay"

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
  this.dom.autoPlayToggle = document.getElementById("autoPlayToggle")
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
      ;(btn as HTMLElement).dataset.rippleInited = "1"
    }
  })

  const extraBtns = document.querySelectorAll('[data-btn-effect="ripple"]')
  extraBtns.forEach(function (btn: Element) {
    if (btn && !(btn as HTMLElement).dataset.rippleInited) {
      MobaoAnimations.bindRipple(btn as HTMLElement)
      MobaoAnimations.bindPressScale(btn as HTMLElement)
      ;(btn as HTMLElement).dataset.rippleInited = "1"
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
 * 已按功能域拆分到 events-*.ts 文件：
 * - events-settings.ts: 设置、音量、回合秒数等
 * - events-ai-panel.ts: AI逻辑面板
 * - events-battle-record.ts: 战绩面板
 * - events-item-drawer.ts: 道具抽屉
 * - events-settlement.ts: 结算、预览
 * - events-ai-memory.ts: AI记忆、模型配置
 * - events-overlay.ts: 浮层、键盘、全局点击
 */
export function bindDomEvents(this: WarehouseSceneThis): void {
  bindSettingsEvents.call(this)
  bindAiPanelEvents.call(this)
  bindBattleRecordEvents.call(this)
  bindItemDrawerEvents.call(this)
  bindSettlementEvents.call(this)
  bindAiMemoryEvents.call(this)
  bindOverlayEvents.call(this)
}
