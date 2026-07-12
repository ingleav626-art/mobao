/**
 * @file scene/warehouse-scene.ts
 * @module scene/warehouse-scene
 * @description WarehouseScene 类定义——属性声明、构造函数初始化、Mixin 方法类型声明。
 *              注意：此文件为类型声明用途，实际运行的 WarehouseScene 类定义在 main.ts 中。
 *              main.ts 通过 Object.assign 将 16 个 Mixin 混入场景原型，
 *              此文件的 interface 声明确保 TypeScript 能识别混入后的方法。
 *
 * @requires types/game - Player, Artifact, GameSettings, ItemDef 等游戏类型
 * @requires types/ai - AiPrivateIntel, CrossGameMemory 等 AI 类型
 * @requires types/llm - LlmPlan, LlmTelemetry 等 LLM 类型
 * @requires types/lan - LanPlayer 联机类型
 * @requires core/settings - GAME_SETTINGS, loadPlayerMoney
 * @requires data/artifacts - ArtifactManager
 * @requires data/skills - SkillManager
 * @requires data/items - ItemManager
 * @requires ai/bidding - AuctionAiEngine
 * @requires core/deps - Deps 依赖注入容器
 */

/// <reference types="phaser" />
import type {
  Player,
  Artifact,
  GameSettings,
  ItemDef,
} from "../../../types/game"
import type {
  AiPrivateIntel,
  CrossGameMemory,
  ConversationMessage,
} from "../../../types/ai"
import type {
  LlmPlan,
  LlmTelemetry,
} from "../../../types/llm"
import type {
  LanPlayer,
} from "../../../types/lan"
import {
  GAME_SETTINGS as _GAME_SETTINGS,
  loadPlayerMoney,
} from "../core/settings"
import { ArtifactManager } from "../data/artifacts"
import { SkillManager } from "../data/skills"
import { ItemManager } from "../data/items"
import { AuctionAiEngine } from "../ai/bidding"
import { Deps } from "../core/deps"

// Mixin 方法声明：这些方法通过 Object.assign 从各 Mixin 混入 WarehouseScene.prototype
// 声明为 interface 让 TS 识别，运行时由 Mixin 提供
export interface WarehouseMixinMethods {
  // Warehouse Mixin
  syncItemManagerFromShop(): void
  guardWarehouseCapacity(): void
  drawUnknownWarehouse(): void
  spawnRandomItems(): void
  setupWarehouseAuction(): void
  rebuildWarehouseCellIndex(): void
  hidePreview(): void
  hideRevealScrollHints(): void
  hideSettleOverlay(): void
  refreshRevealScrollHints(): void
  hasAnyInfo(item: Artifact): boolean
  renderPreviewCandidates(item: Artifact): void
  setupPreviewTouchScroll(): void
  isPointOnSettlementLockedItem(x: number, y: number): boolean

  // AI Mixin
  initAiWallets(): void
  initAiIntelSystems(): void
  resetAiWallets(): void
  isAiMultiGameMemoryEnabled(): boolean
  resetAiConversations(): void
  pushRunStartContextToAi(): void
  restoreAiMemoryFromStorage(): void
  clearAiMemoryStorage(): void
  exportAiMemoryToJson(): string
  importAiMemoryFromJson(json: string): { ok: boolean; error?: string }
  showAiMemoryExportDialog(): void
  removeAiMemoryExportDialog(): void
  showAiMemoryImportDialog(): void
  removeAiMemoryImportDialog(): void
  downloadAiMemoryFallback(jsonData: string, fileName: string): void

  // Round Manager Mixin
  startRound(): void
  stopRoundTimer(): void
  toggleRoundPause(): void
  resolveRoundBids(reason: string): void
  beginRunTracking(): void

  // Skill/Item Manager Mixin
  useItem(itemId: string): void
  useSkill(skillId: string): void
  handleBidKeyInput(key: string): void
  openBidKeypad(): void
  closeBidKeypad(): void
  renderItemDrawer(): void
  toggleItemDrawer(): void
  closeItemDrawer(): void
  getItemInfo(itemId: string): ItemDef | null

  // Settlement Manager Mixin
  settleCurrentRun(): void
  proceedToNewRun(): void
  shouldShowReflectionUI(): boolean
  showReflectionPendingDialog(): void
  showReflectionPendingDialogForBack(): void

  // UI Mixin
  openSettingsOverlay(): void
  closeSettingsOverlay(restore: boolean): void
  isSettingsOverlayOpen(): boolean
  fillSettingsForm(settings: GameSettings): void
  saveSettingsFromOverlay(): void
  setSettingsStatus(text: string, state: "ok" | "error" | "loading" | ""): void
  openShopOverlay(): void
  openAiLogicPanel(): void
  closeAiLogicPanel(): void
  openAiMemoryPanel(): void
  closeAiMemoryPanel(): void
  openAiModelConfigOverlay(): void
  closeAiModelConfigOverlay(): void
  saveAiModelConfigFromForm(): void
  showGameConfirm(msg: string, onOk: () => void, onCancel?: () => void): void
  hideGameConfirm(): void
  showInfoPopup(title: string, scrollEl: HTMLElement | null): void
  hideInfoPopup(): void
  showItemDetailPopup(itemId: string, label: string, x: number, y: number): void
  showCharacterInfoPopup(playerId: string, x: number, y: number): void
  hidePlayerInfoPopover(): void
  updateSidePanels(skillState: Record<string, unknown>, itemState: Record<string, unknown>, clueCount: number, occupiedCells: number, capacity: number, bidState: string): void

  // Lobby Mixin
  enterLobby(): void
  enterLanRoom(): void
  bindLobbyEvents(): void
  initPlayersUI(): void
  initPreviewFilterOptions(): void
  showLanRestartWaitingDialog(): void

  // Lan Mixin
  onLanBackground(): void
  onLanForeground(): void

  // History
  resetPlayerHistoryState(): void
  writeLog(msg: string): void
}

// Phaser.Scene 类型桥接：extends 子句不支持 as，用中间类绕过
// 必须用 any：Phaser 的类型系统不支持 class extends (Phaser.Scene as any)
const _PhaserScene: any = (Phaser as any).Scene

class WarehouseScene extends _PhaserScene {
  gridLayer: Phaser.GameObjects.Graphics | null
  revealCellLayer: Phaser.GameObjects.Graphics | null
  itemLayer: Phaser.GameObjects.Container | null
  items: Artifact[]
  revealedCells: unknown[]
  artifactManager: ArtifactManager
  skillManager: SkillManager
  itemManager: ItemManager
  aiEngine: AuctionAiEngine
  deepSeekTesting: boolean
  round: number
  actionsLeft: number
  roundTimeLeft: number
  playerMoney: number
  selectedItem: Artifact | null
  currentBid: number
  bidLeader: string
  secondHighestBid: number
  aiMaxBid: number
  aiWallets: Record<string, number>
  warehouseTrueValue: number
  warehouseCellIndex: Record<string, Artifact | null>
  settled: boolean
  isLanMode: boolean
  lanBridge: unknown
  lanIsHost: boolean
  lanMySlotId: string
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanReconnecting: boolean
  lanLastServerUrl: string | null
  lanLastRoomCode: string | null
  lanLastPlayerId: string | null
  lanReconnectAttempts: number
  lanMaxReconnectAttempts: number
  previewOpenTick: number
  roundTimerId: ReturnType<typeof setInterval> | null
  roundPaused: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  playerRoundBid: number
  isSettlementRevealMode: boolean
  settlementRevealRunning: boolean
  settlementRevealSkipRequested: boolean
  settlementSession: { runToken: number | string; phase: string } | null
  settlementRunToken: number | string
  activeSettlementSpinner: Phaser.GameObjects.Arc | null
  moneySettledRunToken: string | null
  _edgeFlashActive: boolean
  _lastDisplayedMoney: number | null
  players: Player[]
  playerRoundHistory: Record<string, unknown>
  playerUsageHistory: Record<string, unknown>
  currentRoundUsage: Record<string, unknown>
  playerHistoryPanels: Record<string, unknown>
  aiPrivateIntel: Record<string, AiPrivateIntel>
  aiResourceState: Record<string, unknown>
  aiRoundEffects: Record<string, unknown>
  lastAiIntelActions: Array<{
    playerId: string
    playerName: string
    actionType: string
    actionId: string
    revealed: unknown
    detail: string
    score: number
    effectTag: string
    signalStats: unknown
  }>
  aiLlmRoundPlans: Record<string, LlmPlan | null>
  aiLlmPlayerEnabled: Record<string, boolean>
  aiFoldState: Record<string, unknown>
  lastAiDecisionTelemetry: { mode: string; round: number; entries: LlmTelemetry[] } | null
  llmEverUsedThisRun: boolean
  aiReflectionState: string
  aiReflectionTotal: number
  aiReflectionCompleted: number
  _reflectionBeforeUnload: ((e: BeforeUnloadEvent) => void) | null
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: Record<string, CrossGameMemory[]>
  aiCrossGameMessagesByPlayer: Record<string, Array<Array<Record<string, string>>>>
  aiReflectionPending: Record<string, unknown>
  runSerial: number
  runLogHistory: unknown[]
  currentRunLog: {
    runNo: number
    startedAt: number
    aiThoughtLogs: unknown[]
    actionLogs: string[]
    roundLogsByRound: Record<string, string[]>
    roundPanelTexts: Record<string, string>
  } | null
  highValuePriceThreshold: number | null
  battleRecords: unknown[]
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: { recordId: string; page: number } | null
  roundBidReadyState: Record<string, unknown>
  aiRoundDecisionPromise: Promise<unknown> | null
  pendingNextRunAiSummaryByPlayer: Record<string, string>
  pendingSettlementSummary: string
  privateIntelEntries: Array<{ source: string; text: string; round: number }>
  publicInfoEntries: Array<{ source: string; text: string }>
  currentPublicEvent: { id: string; text: string; category: string; priority?: number } | null
  dom: Record<string, HTMLElement | null>
  _hudRoundText: HTMLElement | null
  _hudTimerText: HTMLElement | null
  _hudMoneyText: HTMLElement | null
  _timerSpan: HTMLElement | null
  keypadValue: string
  _activeSkillId: string | null
  _gameConfirmCallback: (() => void) | null
  _gameCancelCallback: (() => void) | null
  lanAiPlayers: (LanPlayer & { llm?: boolean })[]
  lanAiLlmEnabled: boolean
  static instance: WarehouseScene & WarehouseMixinMethods

  constructor() {
    super("warehouse")
    this.gridLayer = null
    this.revealCellLayer = null
    this.itemLayer = null
    this.items = []
    this.revealedCells = []

    this.artifactManager = new ArtifactManager()
    this.skillManager = new SkillManager()
    this.itemManager = new ItemManager()
    this.syncItemManagerFromShop()
    this.aiEngine = new AuctionAiEngine()
    this.deepSeekTesting = false

    this.round = 1
    this.actionsLeft = _GAME_SETTINGS.actionsPerRound
    this.roundTimeLeft = _GAME_SETTINGS.roundSeconds

    this.playerMoney = loadPlayerMoney()
    this.selectedItem = null
    this.currentBid = 0
    this.bidLeader = "none"
    this.secondHighestBid = 0
    this.aiMaxBid = 0
    this.aiWallets = {}
    this.warehouseTrueValue = 0
    this.warehouseCellIndex = {}
    this.settled = false
    this.isLanMode = false
    this.lanBridge = null
    this.lanIsHost = false
    this.lanMySlotId = "p2"
    this.lanIdToSlotId = {}
    this.slotIdToLanId = {}
    this.lanReconnecting = false
    this.lanLastServerUrl = null
    this.lanLastRoomCode = null
    this.lanLastPlayerId = null
    this.lanReconnectAttempts = 0
    this.lanMaxReconnectAttempts = 5

    this._activeSkillId = null
    this._gameConfirmCallback = null
    this._gameCancelCallback = null
    this.lanAiPlayers = []
    this.lanAiLlmEnabled = false

    this.previewOpenTick = 0
    this.roundTimerId = null
    this.roundPaused = false
    this.roundResolving = false
    this.playerBidSubmitted = false
    this.playerRoundBid = 0
    this.isSettlementRevealMode = false
    this.settlementRevealRunning = false
    this.settlementRevealSkipRequested = false
    this.settlementSession = null
    this.settlementRunToken = 0
    this.activeSettlementSpinner = null
    this.moneySettledRunToken = null
    this._edgeFlashActive = false
    this._lastDisplayedMoney = null

    this.players = [
      { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
    ]

    this.playerRoundHistory = {}
    this.playerUsageHistory = {}
    this.currentRoundUsage = {}
    this.playerHistoryPanels = {}
    this.aiPrivateIntel = {}
    this.aiResourceState = {}
    this.aiRoundEffects = {}
    this.lastAiIntelActions = []
    this.aiLlmRoundPlans = {}
    this.aiLlmPlayerEnabled = Deps.LLM_BRIDGE ? Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players) : {}
    this.aiFoldState = {}
    this.lastAiDecisionTelemetry = null
    this.llmEverUsedThisRun = false
    this.aiReflectionState = "idle"
    this.aiReflectionTotal = 0
    this.aiReflectionCompleted = 0
    this._reflectionBeforeUnload = null
    this.aiConversationByPlayer = {}
    this.aiCrossGameMemory = {}
    this.aiCrossGameMessagesByPlayer = {}
    this.aiReflectionPending = {}
    this.runSerial = 0
    this.runLogHistory = []
    this.currentRunLog = null
    this.highValuePriceThreshold = null
    this.battleRecords = Deps.BATTLE_RECORD_BRIDGE
      ? Deps.BATTLE_RECORD_BRIDGE.loadBattleRecords()
      : []
    this.battleRecordReplayActive = false
    this.battleRecordReplayRecordId = null
    this.battleRecordLogView = null
    this.roundBidReadyState = {}
    this.aiRoundDecisionPromise = null
    this.pendingNextRunAiSummaryByPlayer = {}
    this.pendingSettlementSummary = ""
    this.restoreAiMemoryFromStorage()
    this.privateIntelEntries = []
    this.publicInfoEntries = []
    this.currentPublicEvent = null
    this.resetPlayerHistoryState()

    this.dom = {
      hudRound: null,
      hudTimer: null,
      hudMoney: null,
      aiThinkingIndicator: null,
      actionLog: null,
      aiThoughtContent: null,
      openSettingsBtn: null,
      rerollBtn: null,
      nextRoundBtn: null,
      pauseRoundBtn: null,
      aiLogicBtn: null,
      aiLogicOverlay: null,
      aiLogicPanel: null,
      aiLogicCloseBtn: null,
      aiLogicContent: null,
      aiViewMessagesBtn: null,
      battleRecordOverlay: null,
      battleRecordPanel: null,
      battleRecordCloseBtn: null,
      battleRecordContent: null,
      itemOutlineBtn: null,
      itemQualityBtn: null,
      itemDrawerToggleBtn: null,
      itemDrawer: null,
      itemDrawerCloseBtn: null,
      itemDrawerList: null,
      skillBtn: null,
      bidInput: null,
      settleBtn: null,
      gameRoot: null,
      gameConfirmOverlay: null,
      gameConfirmMsg: null,
      gameConfirmCancelBtn: null,
      gameConfirmOkBtn: null,
      infoPopupOverlay: null,
      infoPopupTitle: null,
      infoPopupCloseBtn: null,
      infoPopupContent: null,
      revealHintUp: null,
      revealHintDown: null,
      previewPopover: null,
      previewTitle: null,
      previewCloseBtn: null,
      previewFilterRow: null,
      previewCategorySelect: null,
      previewHint: null,
      previewList: null,
      settleOverlay: null,
      settleCard: null,
      settlementPage: null,
      settleWinnerName: null,
      settleWinnerBid: null,
      settleRevealedValue: null,
      settleWinnerProfit: null,
      settleSelfProfitRow: null,
      settleSelfProfit: null,
      keypadDirectHint: null,
      settleProgressText: null,
      settleProgressTrack: null,
      settleProgressFill: null,
      settleBackBtn: null,
      settleReplayBtn: null,
      settleReflectionStatus: null,
      settingsOverlay: null,
      settingsPanel: null,
      settingsScroll: null,
      settingsCloseBtn: null,
      settingsResetBtn: null,
      settingsSaveBtn: null,
      settingsReturnLobbyBtn: null,
      settingsStatusText: null,
      settingLlmEnabled: null,
      settingLlmMultiGameMemoryEnabled: null,
      settingDeepseekApiKey: null,
      settingDeepseekModel: null,
      settingMaxTokens: null,
      settingsTestDeepSeekBtn: null,
      settingsLlmStatusText: null,
      clearAiMemoryBtn: null,
      clearAiContextBtn: null,
      aiMemoryStatusText: null,
      viewAiMemoryBtn: null,
      exportAiMemoryBtn: null,
      importAiMemoryBtn: null,
      resetAiWalletBtn: null,
      importAiMemoryInput: null,
      aiMemoryOverlay: null,
      aiMemoryPanel: null,
      aiMemoryCloseBtn: null,
      aiMemoryContent: null,
      settingLlmReflectionEnabled: null,
      settingLlmThinkingEnabled: null,
      settingLlmIndependentModelEnabled: null,
      independentModelConfig: null,
      configIndependentModelBtn: null,
      aiModelConfigOverlay: null,
      aiModelConfigCloseBtn: null,
      aiModelConfigSaveBtn: null,
      bidKeypad: null,
      keypadCloseBtn: null,
      keypadScreen: null,
      personalPanelScroll: null,
      publicInfoScroll: null
    }

    this._hudRoundText = null
    this._hudTimerText = null
    this._hudMoneyText = null
    this._timerSpan = null

    this.keypadValue = "0"
  }

  create() {
    WarehouseScene.instance = this
    this.initAudio()
    this.cacheDom()
    this.bindDomEvents()
    this.bindLobbyEvents()
    this.initPlayersUI()
    this.initPreviewFilterOptions()
    this.initAnimations()
    this.enterLobby()
  }

  // Mixin 方法声明（运行时由 Object.assign 提供）
  syncItemManagerFromShop!: WarehouseMixinMethods["syncItemManagerFromShop"]
  guardWarehouseCapacity!: WarehouseMixinMethods["guardWarehouseCapacity"]
  drawUnknownWarehouse!: WarehouseMixinMethods["drawUnknownWarehouse"]
  spawnRandomItems!: WarehouseMixinMethods["spawnRandomItems"]
  setupWarehouseAuction!: WarehouseMixinMethods["setupWarehouseAuction"]
  rebuildWarehouseCellIndex!: WarehouseMixinMethods["rebuildWarehouseCellIndex"]
  hidePreview!: WarehouseMixinMethods["hidePreview"]
  hideRevealScrollHints!: WarehouseMixinMethods["hideRevealScrollHints"]
  hideSettleOverlay!: WarehouseMixinMethods["hideSettleOverlay"]
  refreshRevealScrollHints!: WarehouseMixinMethods["refreshRevealScrollHints"]
  hasAnyInfo!: WarehouseMixinMethods["hasAnyInfo"]
  renderPreviewCandidates!: WarehouseMixinMethods["renderPreviewCandidates"]
  setupPreviewTouchScroll!: WarehouseMixinMethods["setupPreviewTouchScroll"]
  isPointOnSettlementLockedItem!: WarehouseMixinMethods["isPointOnSettlementLockedItem"]
  initAiWallets!: WarehouseMixinMethods["initAiWallets"]
  initAiIntelSystems!: WarehouseMixinMethods["initAiIntelSystems"]
  resetAiWallets!: WarehouseMixinMethods["resetAiWallets"]
  isAiMultiGameMemoryEnabled!: WarehouseMixinMethods["isAiMultiGameMemoryEnabled"]
  resetAiConversations!: WarehouseMixinMethods["resetAiConversations"]
  pushRunStartContextToAi!: WarehouseMixinMethods["pushRunStartContextToAi"]
  restoreAiMemoryFromStorage!: WarehouseMixinMethods["restoreAiMemoryFromStorage"]
  clearAiMemoryStorage!: WarehouseMixinMethods["clearAiMemoryStorage"]
  exportAiMemoryToJson!: WarehouseMixinMethods["exportAiMemoryToJson"]
  importAiMemoryFromJson!: WarehouseMixinMethods["importAiMemoryFromJson"]
  showAiMemoryExportDialog!: WarehouseMixinMethods["showAiMemoryExportDialog"]
  removeAiMemoryExportDialog!: WarehouseMixinMethods["removeAiMemoryExportDialog"]
  showAiMemoryImportDialog!: WarehouseMixinMethods["showAiMemoryImportDialog"]
  removeAiMemoryImportDialog!: WarehouseMixinMethods["removeAiMemoryImportDialog"]
  downloadAiMemoryFallback!: WarehouseMixinMethods["downloadAiMemoryFallback"]
  startRound!: WarehouseMixinMethods["startRound"]
  stopRoundTimer!: WarehouseMixinMethods["stopRoundTimer"]
  toggleRoundPause!: WarehouseMixinMethods["toggleRoundPause"]
  resolveRoundBids!: WarehouseMixinMethods["resolveRoundBids"]
  beginRunTracking!: WarehouseMixinMethods["beginRunTracking"]
  useItem!: WarehouseMixinMethods["useItem"]
  useSkill!: WarehouseMixinMethods["useSkill"]
  handleBidKeyInput!: WarehouseMixinMethods["handleBidKeyInput"]
  openBidKeypad!: WarehouseMixinMethods["openBidKeypad"]
  closeBidKeypad!: WarehouseMixinMethods["closeBidKeypad"]
  renderItemDrawer!: WarehouseMixinMethods["renderItemDrawer"]
  toggleItemDrawer!: WarehouseMixinMethods["toggleItemDrawer"]
  closeItemDrawer!: WarehouseMixinMethods["closeItemDrawer"]
  getItemInfo!: WarehouseMixinMethods["getItemInfo"]
  settleCurrentRun!: WarehouseMixinMethods["settleCurrentRun"]
  proceedToNewRun!: WarehouseMixinMethods["proceedToNewRun"]
  shouldShowReflectionUI!: WarehouseMixinMethods["shouldShowReflectionUI"]
  showReflectionPendingDialog!: WarehouseMixinMethods["showReflectionPendingDialog"]
  showReflectionPendingDialogForBack!: WarehouseMixinMethods["showReflectionPendingDialogForBack"]
  openSettingsOverlay!: WarehouseMixinMethods["openSettingsOverlay"]
  closeSettingsOverlay!: WarehouseMixinMethods["closeSettingsOverlay"]
  isSettingsOverlayOpen!: WarehouseMixinMethods["isSettingsOverlayOpen"]
  fillSettingsForm!: WarehouseMixinMethods["fillSettingsForm"]
  saveSettingsFromOverlay!: WarehouseMixinMethods["saveSettingsFromOverlay"]
  setSettingsStatus!: WarehouseMixinMethods["setSettingsStatus"]
  openShopOverlay!: WarehouseMixinMethods["openShopOverlay"]
  openAiLogicPanel!: WarehouseMixinMethods["openAiLogicPanel"]
  closeAiLogicPanel!: WarehouseMixinMethods["closeAiLogicPanel"]
  openAiMemoryPanel!: WarehouseMixinMethods["openAiMemoryPanel"]
  closeAiMemoryPanel!: WarehouseMixinMethods["closeAiMemoryPanel"]
  openAiModelConfigOverlay!: WarehouseMixinMethods["openAiModelConfigOverlay"]
  closeAiModelConfigOverlay!: WarehouseMixinMethods["closeAiModelConfigOverlay"]
  saveAiModelConfigFromForm!: WarehouseMixinMethods["saveAiModelConfigFromForm"]
  showGameConfirm!: WarehouseMixinMethods["showGameConfirm"]
  hideGameConfirm!: WarehouseMixinMethods["hideGameConfirm"]
  showInfoPopup!: WarehouseMixinMethods["showInfoPopup"]
  hideInfoPopup!: WarehouseMixinMethods["hideInfoPopup"]
  showItemDetailPopup!: WarehouseMixinMethods["showItemDetailPopup"]
  showCharacterInfoPopup!: WarehouseMixinMethods["showCharacterInfoPopup"]
  hidePlayerInfoPopover!: WarehouseMixinMethods["hidePlayerInfoPopover"]
  updateSidePanels!: WarehouseMixinMethods["updateSidePanels"]
  enterLobby!: WarehouseMixinMethods["enterLobby"]
  enterLanRoom!: WarehouseMixinMethods["enterLanRoom"]
  bindLobbyEvents!: WarehouseMixinMethods["bindLobbyEvents"]
  initPlayersUI!: WarehouseMixinMethods["initPlayersUI"]
  initPreviewFilterOptions!: WarehouseMixinMethods["initPreviewFilterOptions"]
  showLanRestartWaitingDialog!: WarehouseMixinMethods["showLanRestartWaitingDialog"]
  onLanBackground!: WarehouseMixinMethods["onLanBackground"]
  onLanForeground!: WarehouseMixinMethods["onLanForeground"]
  resetPlayerHistoryState!: WarehouseMixinMethods["resetPlayerHistoryState"]
  writeLog!: WarehouseMixinMethods["writeLog"]
}

export { WarehouseScene }
