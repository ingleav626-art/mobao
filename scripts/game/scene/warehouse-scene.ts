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
  SkillContext,
} from "../../../types/game"
import type {
  AiPrivateIntel,
  CrossGameMemory,
  ConversationMessage,
  ConversationBucketEntry,
} from "../../../types/ai"
import type {
  LlmPlan,
  LlmTelemetry,
  LlmSettings,
} from "../../../types/llm"
import type {
  LanPlayer,
} from "../../../types/lan"
import { GAME_SETTINGS as _GAME_SETTINGS } from "../core/settings"
import { loadPlayerMoney } from "../core/player-money"
import { ArtifactManager } from "../data/artifacts"
import { SkillManager } from "../data/skills"
import { ItemManager } from "../data/items"
import { AuctionAiEngine } from "../ai/bidding"
import { Deps } from "../core/deps"
import { AiWalletManager } from "../ai/wallet-manager"
import { AiDecisionManager } from "../ai/decision-manager"
import { HistoryManager } from "../ui/history-manager"
import { SkillItemManager } from "../core/skill-item-manager-class"
import type { LanBridgeLike as SkillItemLanBridge } from "../core/skill-item-manager-class"
import { PanelsManager } from "../ui/panels-manager"
import type { PanelsLanBridge } from "../ui/panels-manager"
import { CarouselManager } from "../lobby/carousel-manager"
import { SettlementManager } from "../core/settlement-manager-class"
import { CharacterSelectManager } from "../lobby/character-select-manager"
import type { ShopBridge } from "../lobby/character-select-manager"
import { AiReflectionManager } from "../ai/reflection-manager"
import type { ReflectionStatus } from "../ai/reflection-manager"
import type { CrossGameMemory as ReflectionCrossGameMemory } from "../ai/reflection"
import { AiMemoryManager } from "../ai/memory-manager"
import type { AiMemoryData } from "../ai/memory-manager"
import { WarehouseManager } from "../warehouse/warehouse-manager"
import type { WarehouseManagerState } from "../warehouse/warehouse-manager"
import { AiIntelManager } from "../ai/intel-manager"
import type { AiIntelState } from "../ai/intel-manager"
import { UiOverlayManager } from "../ui/overlay-manager"
import { LobbyIndexManager } from "../lobby/lobby-index-manager"
import type { LobbyIndexState } from "../lobby/lobby-index-manager"
import { RoundManager } from "../core/round-manager-class"
import { BiddingManager } from "../bidding/bidding-manager"
import { LanIndexManager } from "../lan/lan-index-manager"
import type { LanIndexState, LanBridgeLike } from "../lan/lan-index-manager"
import { getOutlineBonus, getQualityBonus, getOutlineSortStrategy } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"
import type { IntelEntry } from "../ui/panels"
import type { RunLog } from "../ai/decision"

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
  lanHostWallets: Record<string, number>
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
  aiReflectionStateDetail: string
  _reflectionBeforeUnload: ((e: BeforeUnloadEvent) => void) | null
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: Record<string, CrossGameMemory[]>
  aiCrossGameMessagesByPlayer: Record<string, Array<Array<Record<string, string>>>>
  aiReflectionPending: Record<string, unknown>
  aiConversationCache: Record<string, unknown>
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
  // Phase 2: Manager 实例（依赖注入）
  walletManager!: AiWalletManager
  historyManager!: HistoryManager
  aiDecisionManager!: AiDecisionManager
  skillItemManager!: SkillItemManager
  panelsManager!: PanelsManager
  carouselManager!: CarouselManager
  settlementManager!: SettlementManager
  characterSelectManager!: CharacterSelectManager
  aiReflectionManager!: AiReflectionManager
  aiMemoryManager!: AiMemoryManager
  warehouseManager!: WarehouseManager
  aiIntelManager!: AiIntelManager
  uiOverlayManager!: UiOverlayManager
  lobbyIndexManager!: LobbyIndexManager
  roundManager!: RoundManager
  biddingManager!: BiddingManager
  lanIndexManager!: LanIndexManager
  // Phase 2: Manager 依赖的跨 Mixin 方法（运行时由 Object.assign 提供）
  isSettlementPageActive!: () => boolean
  saveAiMemoryToStorage!: () => void
  renderAiThoughtLog!: () => void
  renderAiLogicPanelForLlm!: (telemetry: { round: number; entries?: Array<Record<string, unknown>> }) => void
  canUseIntelActions!: () => boolean
  buildSkillContext!: () => SkillContext
  updateHud!: () => void
  recordPlayerUsage!: (playerId: string, actionId: string) => void
  addPrivateIntelEntry!: (entry: { source: string; text: string }) => void
  enterSettlementPage!: (player: { isSelf: boolean; name: string }, bid: number, reason: string) => void
  exitSettlementPage!: () => void
  setSettlementProgress!: (step: string, progress: number) => void
  updateSettlementPanelMetrics!: (totalValue: number, winnerProfit: number) => void
  showSelfProfit!: (profit: number, label: string) => void
  triggerSettlementFinalAnimation!: (profit: number, isSelf: boolean) => void
  revealAllArtifactsForSettlement!: () => Promise<void>
  saveBattleRecord!: (record: unknown) => void
  hasAppliedMoneyForRun!: () => boolean
  markMoneyAppliedForRun!: () => void
  getLlmSettings!: () => LlmSettings
  canUseLlmDecision!: () => boolean
  canUseLlmDecisionForPlayer!: (playerId: string) => boolean
  getLlmProvider!: () => { id: string; requestChat: (options: Record<string, unknown>) => Promise<Record<string, unknown>> } | null
  getAiModelConfigForPlayer!: (playerId: string) => Record<string, unknown> | null
  startNewRun!: () => void
  openBattleRecordPanel!: () => void
  updateReflectionStatusUI!: () => void
  showLobbySubPage!: (page: string) => void
  updatePlayerAvatar!: (playerId: string, avatarEl: HTMLElement) => void
  startSoloGame!: () => void

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
    this.lanHostWallets = {}
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
    this.aiReflectionStateDetail = ""
    this._reflectionBeforeUnload = null
    this.aiConversationByPlayer = {}
    this.aiCrossGameMemory = {}
    this.aiCrossGameMessagesByPlayer = {}
    this.aiReflectionPending = {}
    this.aiConversationCache = {}
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
    this.privateIntelEntries = []
    this.publicInfoEntries = []
    this.currentPublicEvent = null

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

    // Phase 2: Manager 实例化（依赖注入）
    this.walletManager = new AiWalletManager(this.players, this.aiWallets, () => ({
      currentBid: this.currentBid,
      aiMaxBid: this.aiMaxBid,
      aiWallets: this.aiWallets,
      isLanMode: this.isLanMode,
      slotIdToLanId: this.slotIdToLanId,
      lanHostWallets: this.lanHostWallets,
    }))
    this.historyManager = new HistoryManager({
      players: this.players,
      data: {
        playerRoundHistory: this.playerRoundHistory as Record<string, Array<{ round: number; bid: number }>>,
        playerUsageHistory: this.playerUsageHistory as Record<string, Array<{ round: number; actions: string[] }>>,
        currentRoundUsage: this.currentRoundUsage as Record<string, string[]>,
        playerHistoryPanels: this.playerHistoryPanels as Record<string, HTMLElement | null>,
      },
      dom: this.dom,
      itemManager: this.itemManager,
      getRound: () => this.round,
      getDrawerState: () => ({
        settled: this.settled,
        roundResolving: this.roundResolving,
        playerBidSubmitted: this.playerBidSubmitted,
        roundTimeLeft: this.roundTimeLeft,
      }),
      closeBidKeypad: () => this.closeBidKeypad(),
      isSettingsOverlayOpen: () => this.isSettingsOverlayOpen(),
      isSettlementPageActive: () => this.isSettlementPageActive(),
      getItemInfo: (itemId: string) => this.getItemInfo(itemId)!,
    })
    this.aiDecisionManager = new AiDecisionManager({
      runLogHistory: this.runLogHistory as RunLog[],
      dom: this.dom,
      aiEngine: this.aiEngine,
      getRound: () => this.round,
      getCurrentRunLog: () => this.currentRunLog as RunLog | null,
      setCurrentRunLog: (log: RunLog) => {
        this.currentRunLog = log
      },
      setRunSerial: (n: number) => {
        this.runSerial = n
      },
      saveAiMemoryToStorage: () => this.saveAiMemoryToStorage(),
      renderAiThoughtLog: () => this.renderAiThoughtLog(),
      renderAiLogicPanelForLlm: (t) => this.renderAiLogicPanelForLlm(t),
    })
    this.skillItemManager = new SkillItemManager({
      getRound: () => this.round,
      getActionsLeft: () => this.actionsLeft,
      setActionsLeft: (n: number) => {
        this.actionsLeft = n
      },
      skillManager: this.skillManager,
      itemManager: this.itemManager,
      canUseIntelActions: () => this.canUseIntelActions(),
      closeItemDrawer: () => this.closeItemDrawer(),
      writeLog: (msg: string) => this.writeLog(msg),
      buildSkillContext: () => this.buildSkillContext(),
      updateHud: () => this.updateHud(),
      recordPlayerUsage: (playerId: string, actionId: string) => this.recordPlayerUsage(playerId, actionId),
      addPrivateIntelEntry: (entry: { source: string; text: string }) => this.addPrivateIntelEntry(entry),
      getOutlineBonus: () => getOutlineBonus(),
      getQualityBonus: () => getQualityBonus(),
      getOutlineSortStrategy: () => getOutlineSortStrategy(),
      isLanMode: () => this.isLanMode,
      lanMySlotId: () => this.lanMySlotId,
      lanBridge: () => this.lanBridge as SkillItemLanBridge | null,
      getPlayers: () => this.players,
      consumeItem: (itemId: string) => {
        if (MobaoShopBridge) {
          MobaoShopBridge.consumeItem(itemId)
        }
      },
    })
    this.panelsManager = new PanelsManager({
      privateIntelEntries: this.privateIntelEntries,
      publicInfoEntries: this.publicInfoEntries as unknown as IntelEntry[],
      dom: this.dom,
      getRound: () => this.round,
      getLanBridge: () => this.lanBridge as PanelsLanBridge,
      getIsLanMode: () => this.isLanMode,
      getLanIsHost: () => this.lanIsHost,
    })
    this.carouselManager = new CarouselManager()

    // Phase 2: 新增 4 个 Manager 实例化（依赖注入）
    const scene = this

    // AiMemoryManager 依赖的 data 对象（getter/setter 同步场景属性，避免 reassign 后脱节）
    const aiMemoryData: AiMemoryData = {
      get aiConversationByPlayer() {
        return scene.aiConversationByPlayer as unknown as Record<string, ConversationBucketEntry[]>
      },
      set aiConversationByPlayer(v) {
        scene.aiConversationByPlayer = v as unknown as Record<string, ConversationMessage[]>
      },
      get aiCrossGameMemory() {
        return scene.aiCrossGameMemory as unknown as Record<string, CrossGameMemory>
      },
      set aiCrossGameMemory(v) {
        scene.aiCrossGameMemory = v as unknown as Record<string, CrossGameMemory[]>
      },
      get aiCrossGameMessagesByPlayer() {
        return scene.aiCrossGameMessagesByPlayer as unknown as Record<string, ConversationMessage[][]>
      },
      set aiCrossGameMessagesByPlayer(v) {
        scene.aiCrossGameMessagesByPlayer = v as unknown as Record<string, Array<Array<Record<string, string>>>>
      },
      get pendingNextRunAiSummaryByPlayer() {
        return scene.pendingNextRunAiSummaryByPlayer as unknown as Record<string, unknown>
      },
      set pendingNextRunAiSummaryByPlayer(v) {
        scene.pendingNextRunAiSummaryByPlayer = v as unknown as Record<string, string>
      },
      get aiReflectionPending() {
        return scene.aiReflectionPending
      },
      set aiReflectionPending(v) {
        scene.aiReflectionPending = v
      },
      get aiConversationCache() {
        return scene.aiConversationCache
      },
      set aiConversationCache(v) {
        scene.aiConversationCache = v
      },
      get pendingSettlementSummary() {
        return scene.pendingSettlementSummary
      },
      set pendingSettlementSummary(v) {
        scene.pendingSettlementSummary = v ?? ""
      },
      get runSerial() {
        return scene.runSerial
      },
      set runSerial(v) {
        scene.runSerial = v
      },
    }

    this.aiMemoryManager = new AiMemoryManager({
      get players() {
        return scene.players
      },
      data: aiMemoryData,
      dom: this.dom,
      getRound: () => this.round,
      getIsLanMode: () => this.isLanMode,
      getItems: () => this.items,
      getLlmSettings: () => this.getLlmSettings(),
      isAiReflectionEnabled: () => this.aiReflectionManager.isAiReflectionEnabled(),
      getCurrentPublicEvent: () => this.currentPublicEvent,
      getPlayerRoundHistory: () =>
        this.playerRoundHistory as Record<string, Array<{ round: number; bid: number }>>,
    })

    const reflectionStatus: ReflectionStatus = {
      state: "idle",
      detail: "",
      completed: 0,
      total: 0,
      beforeUnloadHandler: null,
    }

    this.aiReflectionManager = new AiReflectionManager({
      getLlmSettings: () => this.getLlmSettings(),
      canUseLlmDecision: () => this.canUseLlmDecision(),
      canUseLlmDecisionForPlayer: (playerId: string) => this.canUseLlmDecisionForPlayer(playerId),
      getLlmProvider: () =>
        this.getLlmProvider() as {
          id: string
          requestChat: (options: Record<string, unknown>) => Promise<Record<string, unknown>>
        } | null,
      getAiModelConfigForPlayer: (playerId: string) => this.getAiModelConfigForPlayer(playerId),
      llmEverUsedThisRun: () => this.llmEverUsedThisRun,
      isLanMode: () => this.isLanMode,
      getCurrentRunLog: () => this.currentRunLog as RunLog | null,
      getAiCrossGameMemory: () =>
        aiMemoryData.aiCrossGameMemory as unknown as Record<string, ReflectionCrossGameMemory>,
      getAiCrossGameMessagesByPlayer: () => aiMemoryData.aiCrossGameMessagesByPlayer,
      getAiConversationCache: () =>
        aiMemoryData.aiConversationCache as unknown as Record<string, unknown[]> | null,
      getPendingNextRunAiSummaryByPlayer: () =>
        aiMemoryData.pendingNextRunAiSummaryByPlayer as unknown as Record<string, string>,
      getPendingSettlementSummary: () => aiMemoryData.pendingSettlementSummary ?? "",
      getBattleRecordReplayActive: () => this.battleRecordReplayActive,
      getBattleRecordReplayRecordId: () => this.battleRecordReplayRecordId,
      setPendingSettlementSummary: (value: string) => {
        aiMemoryData.pendingSettlementSummary = value
      },
      setBattleRecordReplayActive: (value: boolean) => {
        this.battleRecordReplayActive = value
      },
      setBattleRecordReplayRecordId: (value: string | null) => {
        this.battleRecordReplayRecordId = value
      },
      get players() {
        return scene.players
      },
      reflectionStatus,
      ensureAiCrossGameMemory: (playerId: string) =>
        this.aiMemoryManager.ensureAiCrossGameMemory(playerId) as unknown as ReflectionCrossGameMemory,
      saveAiMemoryToStorage: () => this.aiMemoryManager.saveAiMemoryToStorage(),
      updateReflectionStatusUI: () => {
        scene.aiReflectionState = reflectionStatus.state
        scene.aiReflectionStateDetail = reflectionStatus.detail
        scene.aiReflectionTotal = reflectionStatus.total
        scene.aiReflectionCompleted = reflectionStatus.completed
        scene.updateReflectionStatusUI()
      },
      renderAiThoughtLog: () => this.renderAiThoughtLog(),
      isAiMultiGameMemoryEnabled: () => this.aiMemoryManager.isAiMultiGameMemoryEnabled(),
      shouldGenerateSummary: () => this.aiMemoryManager.shouldGenerateSummary(),
      clearGameHistoryForPlayer: (playerId: string) => this.aiMemoryManager.clearGameHistoryForPlayer(playerId),
      exitSettlementPage: () => this.exitSettlementPage(),
      startNewRun: () => this.startNewRun(),
      enterLobby: () => this.enterLobby(),
      enterLanRoom: () => this.enterLanRoom(),
      openBattleRecordPanel: () => this.openBattleRecordPanel(),
      writeLog: (text: string) => this.writeLog(text),
    })

    this.settlementManager = new SettlementManager({
      getPlayers: () => this.players,
      getPlayerMoney: () => this.playerMoney,
      setPlayerMoney: (n: number) => {
        this.playerMoney = n
      },
      getAiWallets: () => this.aiWallets,
      getLanHostWallets: () => this.lanHostWallets,
      getWarehouseTrueValue: () => this.warehouseTrueValue,
      getIsLanMode: () => this.isLanMode,
      getLanIsHost: () => this.lanIsHost,
      setCurrentBid: (bid: number) => {
        this.currentBid = bid
      },
      setBidLeader: (id: string) => {
        this.bidLeader = id
      },
      setSettled: (b: boolean) => {
        this.settled = b
      },
      stopRoundTimer: () => this.stopRoundTimer(),
      enterSettlementPage: (player, bid, reason) => this.enterSettlementPage(player, bid, reason),
      updateSettlementPanelMetrics: (totalValue, winnerProfit) =>
        this.updateSettlementPanelMetrics(totalValue, winnerProfit),
      showSelfProfit: (profit, label) => this.showSelfProfit(profit, label),
      setSettlementProgress: (step, progress) => this.setSettlementProgress(step, progress),
      triggerSettlementFinalAnimation: (profit, isSelf) => this.triggerSettlementFinalAnimation(profit, isSelf),
      revealAllArtifactsForSettlement: () => this.revealAllArtifactsForSettlement(),
      saveBattleRecord: (record) => this.saveBattleRecord(record),
      saveAiWalletsToStorage: () => this.walletManager.saveAiWalletsToStorage(),
      pushRunSettlementContextToAi: (context) =>
        this.aiMemoryManager.pushRunSettlementContextToAi(context as unknown as Record<string, unknown>),
      createCrossGameRecord: (result) =>
        this.aiMemoryManager.createCrossGameRecord(result as unknown as Record<string, unknown>),
      triggerAiReflection: (record) =>
        this.aiReflectionManager.triggerAiReflection(record as Record<string, unknown>),
      hasAppliedMoneyForRun: () => this.hasAppliedMoneyForRun(),
      markMoneyAppliedForRun: () => this.markMoneyAppliedForRun(),
      writeLog: (msg) => this.writeLog(msg),
      updateHud: () => this.updateHud(),
      getAiWallet: (id) => this.walletManager.getAiWallet(id),
    })

    this.characterSelectManager = new CharacterSelectManager({
      get players() {
        return scene.players
      },
      shop: MobaoShopBridge as unknown as ShopBridge | null,
      showLobbySubPage: (page: string) => this.showLobbySubPage(page),
      updatePlayerAvatar: (playerId: string, avatarEl: HTMLElement) => this.updatePlayerAvatar(playerId, avatarEl),
      startSoloGame: () => this.startSoloGame(),
    })

    // Phase 2 step 2: 新增 4 个 Manager 实例化
    const warehouseManagerState: WarehouseManagerState = {
      get gridLayer() { return scene.gridLayer },
      set gridLayer(v) { scene.gridLayer = v },
      get revealCellLayer() { return scene.revealCellLayer },
      set revealCellLayer(v) { scene.revealCellLayer = v },
      get itemLayer() { return scene.itemLayer },
      set itemLayer(v) { scene.itemLayer = v },
      get items() { return scene.items },
      set items(v) { scene.items = v },
      get revealedCells() { return scene.revealedCells as boolean[][] },
      set revealedCells(v) { scene.revealedCells = v },
      get warehouseCellIndex() { return scene.warehouseCellIndex as unknown as Record<string, string> },
      set warehouseCellIndex(v) { scene.warehouseCellIndex = v as unknown as Record<string, Artifact | null> },
      get selectedItem() { return scene.selectedItem },
      set selectedItem(v) { scene.selectedItem = v },
      get previewAnchor() { return (scene as any).previewAnchor },
      set previewAnchor(v) { (scene as any).previewAnchor = v },
      get previewOpenTick() { return scene.previewOpenTick },
      set previewOpenTick(v) { scene.previewOpenTick = v },
      get pendingRevealHintTargets() { return (scene as any).pendingRevealHintTargets },
      set pendingRevealHintTargets(v) { (scene as any).pendingRevealHintTargets = v },
      get pendingRevealHintText() { return (scene as any).pendingRevealHintText },
      set pendingRevealHintText(v) { (scene as any).pendingRevealHintText = v },
      get pendingRevealHintSeenIds() { return (scene as any).pendingRevealHintSeenIds },
      set pendingRevealHintSeenIds(v) { (scene as any).pendingRevealHintSeenIds = v },
      get warehouseTrueValue() { return scene.warehouseTrueValue },
      set warehouseTrueValue(v) { scene.warehouseTrueValue = v },
      get aiMaxBid() { return scene.aiMaxBid },
      set aiMaxBid(v) { scene.aiMaxBid = v },
      get currentBid() { return scene.currentBid },
      set currentBid(v) { scene.currentBid = v },
    }

    this.warehouseManager = new WarehouseManager({
      getTextures: () => (this as any).textures,
      getLoad: () => (this as any).load,
      getAdd: () => (this as any).add,
      getTime: () => (this as any).time,
      getTweens: () => (this as any).tweens,
      getInput: () => (this as any).input,
      state: warehouseManagerState,
      dom: this.dom,
      artifactManager: this.artifactManager as any,
      getRound: () => this.round,
      getSettled: () => this.settled,
      getRoundResolving: () => this.roundResolving,
      getIsSettlementRevealMode: () => this.isSettlementRevealMode,
      getMapCategoryWeights: () => (scene as any)._mapCategoryWeights,
      getMapQualityWeights: () => (scene as any)._mapQualityWeights,
      isSettlementPageActive: () => this.isSettlementPageActive(),
      writeLog: (msg: string) => this.writeLog(msg),
      updateHud: () => this.updateHud(),
    })

    const aiIntelState: AiIntelState = {
      get aiPrivateIntel() { return scene.aiPrivateIntel as any },
      set aiPrivateIntel(v) { scene.aiPrivateIntel = v as any },
      get aiResourceState() { return scene.aiResourceState as any },
      set aiResourceState(v) { scene.aiResourceState = v as any },
      get aiRoundEffects() { return scene.aiRoundEffects as any },
      set aiRoundEffects(v) { scene.aiRoundEffects = v as any },
      get lastAiIntelActions() { return scene.lastAiIntelActions as any },
      set lastAiIntelActions(v) { scene.lastAiIntelActions = v as any },
      get aiLlmRoundPlans() { return scene.aiLlmRoundPlans as any },
      set aiLlmRoundPlans(v) { scene.aiLlmRoundPlans = v as any },
      get aiFoldState() { return scene.aiFoldState as any },
      set aiFoldState(v) { scene.aiFoldState = v as any },
      get aiCharacterAssignments() { return (scene as any).aiCharacterAssignments },
      set aiCharacterAssignments(v) { (scene as any).aiCharacterAssignments = v },
      get aiErrorCorrectionHistory() { return (scene as any).aiErrorCorrectionHistory },
      set aiErrorCorrectionHistory(v) { (scene as any).aiErrorCorrectionHistory = v },
      get highValuePriceThreshold() { return scene.highValuePriceThreshold },
      set highValuePriceThreshold(v) { scene.highValuePriceThreshold = v },
      get llmEverUsedThisRun() { return scene.llmEverUsedThisRun },
      set llmEverUsedThisRun(v) { scene.llmEverUsedThisRun = v },
      get currentRunLog() { return scene.currentRunLog as any },
      set currentRunLog(v) { scene.currentRunLog = v as any },
    }

    this.aiIntelManager = new AiIntelManager({
      state: aiIntelState,
      get players() { return scene.players },
      get items() { return scene.items },
      get currentRoundUsage() { return scene.currentRoundUsage as Record<string, string[]> },
      get roundBidReadyState() { return scene.roundBidReadyState as Record<string, boolean> },
      getRound: () => this.round,
      isLanMode: () => this.isLanMode,
      isLanHost: () => this.lanIsHost,
      getLanBridge: () => this.lanBridge as any,
      getLanAiPlayers: () => this.lanAiPlayers as Array<{ id: string }>,
      isRoundResolving: () => this.roundResolving,
      isSettled: () => this.settled,
      isRoundPaused: () => this.roundPaused,
      getRoundTimeLeft: () => this.roundTimeLeft,
      isPlayerBidSubmitted: () => this.playerBidSubmitted,
      artifactManager: this.artifactManager as any,
      aiEngine: this.aiEngine as any,
      updatePlayerAvatar: (playerId: string, avatarEl: HTMLElement) => this.updatePlayerAvatar(playerId, avatarEl),
      isInBoundsCell: (x: number, y: number) => (this as any).isInBoundsCell(x, y),
      isWarehouseCellOccupied: (x: number, y: number) => (this as any).isWarehouseCellOccupied(x, y),
      pickBottomCellFromTargets: (targets: Artifact[]) => (this as any).pickBottomCellFromTargets(targets),
      revealOutlineBatch: (count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) =>
        (this as any).revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy),
      revealQualityBatch: (count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) =>
        (this as any).revealQualityBatch(count, category, allowCategoryFallback, sortStrategy),
      revealArtifactFullyBatch: (options: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }) =>
        (this as any).revealArtifactFullyBatch(options),
      canUseLlmDecisionForPlayer: (playerId: string) => this.canUseLlmDecisionForPlayer(playerId),
      writeLog: (text: string) => this.writeLog(text),
      requestAiLlmErrorCorrection: (player: any, plan: any, error: string, history: any, messages: any) =>
        (this as any).requestAiLlmErrorCorrection(player, plan, error, history, messages),
      getAiConversationMessages: (playerId: string) => (this as any).getAiConversationMessages(playerId),
      recordPlayerUsage: (playerId: string, actionId: string) => this.recordPlayerUsage(playerId, actionId),
      buildAiToolResultSummary: (result: unknown, actionType: string, actionId: string) =>
        (this as any).buildAiToolResultSummary(result, actionType, actionId),
      getActionDefById: (actionId: string) => (this as any).getActionDefById(actionId),
      addPublicInfoEntry: (entry: { source: string; text: string }) => this.addPublicInfoEntry(entry),
      requestAiLlmFollowupBid: (player: any, plan: any, toolSummary: string) =>
        (this as any).requestAiLlmFollowupBid(player, plan, toolSummary),
      setPlayerBidReady: (playerId: string, ready: boolean) => (this as any).setPlayerBidReady(playerId, ready),
      updateHud: () => this.updateHud(),
      areAllPlayersBidReady: () => (this as any).areAllPlayersBidReady(),
      resolveRoundBids: ((reason: string) => this.resolveRoundBids(reason)) as any,
      getItemInfo: (itemId: string) => this.getItemInfo(itemId) as { label?: string } | null,
      waitUntilResumed: () => (this as any).waitUntilResumed(),
    })

    this.uiOverlayManager = new UiOverlayManager({
      dom: this.dom,
      get players() { return scene.players as any },
      getIsLanMode: () => this.isLanMode,
      getLanIsHost: () => this.lanIsHost,
      getLanBridge: () => this.lanBridge as any,
      getSettled: () => this.settled,
      getRound: () => this.round,
      getRoundTimeLeft: () => this.roundTimeLeft,
      getActionsLeft: () => this.actionsLeft,
      getRunLogHistory: () => this.runLogHistory as RunLog[],
      getAiCharacterAssignments: () => (scene as any).aiCharacterAssignments,
      getAiReflectionState: () => this.aiReflectionState,
      getAiReflectionStateDetail: () => this.aiReflectionStateDetail,
      getAiReflectionTotal: () => this.aiReflectionTotal,
      getAiReflectionCompleted: () => this.aiReflectionCompleted,
      getTweens: () => this.tweens as any,
      setRound: (v: number) => { this.round = v },
      setRoundTimeLeft: (v: number) => { this.roundTimeLeft = v },
      setActionsLeft: (v: number) => { this.actionsLeft = v },
      renderAiLogicPanel: () => (this as any).renderAiLogicPanel(),
      updateLobbyMoneyDisplay: () => (this as any).updateLobbyMoneyDisplay(),
      updateHud: () => this.updateHud(),
      closeBidKeypad: () => this.closeBidKeypad(),
      closeItemDrawer: () => this.closeItemDrawer(),
      fillLlmSettingsForm: (settings: Record<string, unknown>) => (this as any).fillLlmSettingsForm(settings),
      getLlmSettings: () => this.getLlmSettings() as any,
      readLlmSettingsForm: () => (this as any).readLlmSettingsForm(),
      setLlmSettingsStatus: (text: string, state: string) => (this as any).setLlmSettingsStatus(text, state),
      getLlmProvider: () => this.getLlmProvider() as any,
      writeLog: (msg: string) => this.writeLog(msg),
      pushRunStartContextToAi: () => this.pushRunStartContextToAi(),
      toggleRoundPause: () => this.toggleRoundPause(),
      ensureAiCrossGameMemory: (playerId: string) => this.aiMemoryManager.ensureAiCrossGameMemory(playerId) as any,
      shouldShowReflectionUI: () => this.shouldShowReflectionUI(),
      shouldGenerateSummary: () => this.aiMemoryManager.shouldGenerateSummary(),
      isAiMultiGameMemoryEnabled: () => this.isAiMultiGameMemoryEnabled(),
      proceedToNewRun: () => this.proceedToNewRun(),
      proceedToBack: () => (this as any).proceedToBack(),
    })

    const lobbyIndexState: LobbyIndexState = {
      get isLanMode() { return scene.isLanMode },
      set isLanMode(v) { scene.isLanMode = v },
      get lanIsHost() { return scene.lanIsHost },
      set lanIsHost(v) { scene.lanIsHost = v },
      get lanPlayers() { return (scene as any).lanPlayers },
      set lanPlayers(v) { (scene as any).lanPlayers = v },
      get lanAiPlayers() { return scene.lanAiPlayers as any },
      set lanAiPlayers(v) { scene.lanAiPlayers = v as any },
      get lanHostWallets() { return scene.lanHostWallets as any },
      set lanHostWallets(v) { scene.lanHostWallets = v as any },
      get lanHostBids() { return (scene as any).lanHostBids },
      set lanHostBids(v) { (scene as any).lanHostBids = v },
      get lanAiLlmEnabled() { return scene.lanAiLlmEnabled },
      set lanAiLlmEnabled(v) { scene.lanAiLlmEnabled = v },
      get lanIdToSlotId() { return scene.lanIdToSlotId },
      set lanIdToSlotId(v) { scene.lanIdToSlotId = v },
      get slotIdToLanId() { return scene.slotIdToLanId },
      set slotIdToLanId(v) { scene.slotIdToLanId = v },
      get lanMySlotId() { return scene.lanMySlotId as string | null },
      set lanMySlotId(v) { scene.lanMySlotId = v as string },
      get aiLlmPlayerEnabled() { return scene.aiLlmPlayerEnabled },
      set aiLlmPlayerEnabled(v) { scene.aiLlmPlayerEnabled = v },
      get players() { return scene.players },
      set players(v) { scene.players = v },
      get playerMoney() { return scene.playerMoney },
      set playerMoney(v) { scene.playerMoney = v },
      get items() { return scene.items as any },
      set items(v) { scene.items = v as any },
      get itemLayer() { return scene.itemLayer as any },
      set itemLayer(v) { scene.itemLayer = v as any },
      get gridLayer() { return scene.gridLayer as any },
      set gridLayer(v) { scene.gridLayer = v as any },
      get revealCellLayer() { return scene.revealCellLayer as any },
      set revealCellLayer(v) { scene.revealCellLayer = v as any },
      get activeSettlementSpinner() { return scene.activeSettlementSpinner as any },
      set activeSettlementSpinner(v) { scene.activeSettlementSpinner = v as any },
      get carouselOffset() { return (scene as any)._carouselOffset },
      set carouselOffset(v) { (scene as any)._carouselOffset = v },
      get mapQualityWeights() { return (scene as any)._mapQualityWeights },
      set mapQualityWeights(v) { (scene as any)._mapQualityWeights = v },
      get mapCategoryWeights() { return (scene as any)._mapCategoryWeights },
      set mapCategoryWeights(v) { (scene as any)._mapCategoryWeights = v },
      get aiCharacterAssignments() { return (scene as any).aiCharacterAssignments },
      set aiCharacterAssignments(v) { (scene as any).aiCharacterAssignments = v },
      get playerHistoryPanels() { return scene.playerHistoryPanels as Record<string, HTMLElement | null> },
      set playerHistoryPanels(v) { scene.playerHistoryPanels = v as any },
    }

    this.lobbyIndexManager = new LobbyIndexManager({
      state: lobbyIndexState,
      dom: this.dom,
      lanBridge: this.lanBridge as any,
      game: (scene as any).game,
      getTweens: () => (this as any).tweens,
      getTime: () => (this as any).time,
      itemManager: this.itemManager as any,
      openSettingsOverlay: () => this.openSettingsOverlay(),
      openCollectionOverlay: () => (this as any).openCollectionOverlay(),
      openBattleRecordPanel: () => this.openBattleRecordPanel(),
      openShopOverlay: () => this.openShopOverlay(),
      showGameConfirm: (msg: string, onConfirm: () => void) => this.showGameConfirm(msg, onConfirm),
      carouselScroll: (dir: number) => (this as any).carouselScroll(dir),
      renderCarousel: () => (this as any).renderCarousel(),
      renderMapDetail: () => (this as any).renderMapDetail(),
      initLanLobby: () => (this as any).initLanLobby(),
      showCharacterSelectPage: (mapProfile: { name?: string; params?: Record<string, unknown> } | null) =>
        (this as any).showCharacterSelectPage(mapProfile),
      stopRoundTimer: () => this.stopRoundTimer(),
      exitSettlementPage: () => this.exitSettlementPage(),
      startNewRun: () => this.startNewRun(),
      stopLive2dLoop: () => (this as any)._stopLive2dLoop(),
      writeLog: (msg: string) => this.writeLog(msg),
      refreshPlayerHistoryUI: () => (this as any).refreshPlayerHistoryUI(),
    })

    // Phase 2: 新增 3 个 Manager 实例化（RoundManager / BiddingManager / LanIndexManager）

    this.roundManager = new RoundManager({
      get roundResolving() { return scene.roundResolving },
      set roundResolving(v) { scene.roundResolving = v },
      get roundPaused() { return scene.roundPaused },
      set roundPaused(v) { scene.roundPaused = v },
      get actionsLeft() { return scene.actionsLeft },
      set actionsLeft(v) { scene.actionsLeft = v },
      get roundTimeLeft() { return scene.roundTimeLeft },
      set roundTimeLeft(v) { scene.roundTimeLeft = v },
      get playerBidSubmitted() { return scene.playerBidSubmitted },
      set playerBidSubmitted(v) { scene.playerBidSubmitted = v },
      get playerRoundBid() { return scene.playerRoundBid },
      set playerRoundBid(v) { scene.playerRoundBid = v },
      privateIntelEntries: scene.privateIntelEntries,
      publicInfoEntries: scene.publicInfoEntries,
      get aiLlmRoundPlans() { return scene.aiLlmRoundPlans as unknown as Record<string, unknown> },
      set aiLlmRoundPlans(v) { scene.aiLlmRoundPlans = v as unknown as Record<string, LlmPlan | null> },
      get aiRoundDecisionPromise() { return scene.aiRoundDecisionPromise as Promise<void> | null },
      set aiRoundDecisionPromise(v) { scene.aiRoundDecisionPromise = v as Promise<unknown> | null },
      get roundTimerId() { return scene.roundTimerId },
      set roundTimerId(v) { scene.roundTimerId = v },
      get _pauseSnapshotTimeLeft() { return scene._pauseSnapshotTimeLeft },
      set _pauseSnapshotTimeLeft(v) { scene._pauseSnapshotTimeLeft = v },
      get roundBidReadyState() { return scene.roundBidReadyState as unknown as Record<string, boolean> },
      set roundBidReadyState(v) { scene.roundBidReadyState = v as unknown as Record<string, unknown> },
      players: scene.players as Array<{ id: string }>,
      dom: scene.dom as { bidInput: HTMLInputElement | null; pauseRoundBtn: HTMLElement | null },
      getRound: () => scene.round,
      getIsLanMode: () => scene.isLanMode,
      getLanIsHost: () => scene.lanIsHost,
      getSettled: () => scene.settled,
      getLanBridge: () => scene.lanBridge as { togglePause: (paused: boolean, timeLeft: number) => void } | null,
      getTimerSpan: () => scene._timerSpan,
      clearCurrentRoundUsage: () => scene.clearCurrentRoundUsage(),
      resetAiRoundResources: () => (scene as unknown as Record<string, Function>).resetAiRoundResources(),
      closeBidKeypad: () => scene.closeBidKeypad(),
      kickoffAiRoundDecisions: () => scene.kickoffAiRoundDecisions(),
      updateHud: () => scene.updateHud(),
      writeLog: (msg: string) => scene.writeLog(msg),
      resolveRoundBids: (reason: string) => scene.resolveRoundBids(reason),
      showLanPauseOverlay: () => scene.showLanPauseOverlay(),
      hideLanPauseOverlay: () => scene.hideLanPauseOverlay(),
      setPlayerBidReady: (slotId: string, ready: boolean) => scene.setPlayerBidReady(slotId, ready),
    })

    this.biddingManager = new BiddingManager({
      dom: scene.dom as Record<string, HTMLElement | null>,
      players: scene.players,
      get input() { return scene.input as unknown as { enabled: boolean } | null },
      skillManager: scene.skillManager,
      getIsLanMode: () => scene.isLanMode,
      getSettled: () => scene.settled,
      getRoundPaused: () => scene.roundPaused,
      getPlayerMoney: () => scene.playerMoney,
      getLanMySlotId: () => scene.lanMySlotId,
      getLanIsHost: () => scene.lanIsHost,
      getLanHostBids: () => scene.lanHostBids as Record<string, number>,
      getPlayerRoundHistory: () => scene.playerRoundHistory as Record<string, Array<{ round: number; bid: number }>>,
      getItems: () => scene.items,
      getAiEngine: () => scene.aiEngine as unknown as { buildAIBids: (ctx: Record<string, unknown>) => Record<string, number> } | null,
      getAiLlmRoundPlans: () => scene.aiLlmRoundPlans as unknown as Record<string, { failed?: boolean; hasBidDecision?: boolean; bid?: number } | null>,
      getAiRoundEffects: () => scene.aiRoundEffects as Record<string, unknown>,
      getLanBridge: () => scene.lanBridge as unknown as { submitBid: (bid: number) => void } | null,
      getLastAiDecisionTelemetry: () => scene.lastAiDecisionTelemetry as { mode: string; round: number; entries?: Array<Record<string, unknown>> } | null,
      resolveRoundBids: async (reason?: string, forceSettle?: boolean) => {
  // 场景的 resolveRoundBids 声明为 void，实际是 BiddingMixin 代理（async Promise<void>）
  await (scene as unknown as Record<string, Function>).resolveRoundBids(reason, forceSettle)
},
      closeItemDrawer: () => scene.closeItemDrawer(),
      hideInfoPopup: () => scene.hideInfoPopup(),
      showGameConfirm: (msg: string, onOk: () => void, onCancel?: () => void) => scene.showGameConfirm(msg, onOk, onCancel),
      updateHud: () => scene.updateHud(),
      writeLog: (msg: string) => scene.writeLog(msg),
      stopRoundTimer: () => scene.stopRoundTimer(),
      captureAiDecisionTelemetry: (bids: unknown[]) => scene.captureAiDecisionTelemetry(bids),
      recordAiThoughtLogs: (telemetry: unknown) => scene.recordAiThoughtLogs(telemetry),
      renderAiLogicPanel: () => scene.renderAiLogicPanel(),
      recordRoundHistory: (roundBids: Array<{ playerId: string; bid: number }>) => scene.recordRoundHistory(roundBids),
      markRoundRanking: (sorted: Array<{ playerId: string; bid: number }>) => scene.markRoundRanking(sorted),
      finishAuction: (winner: { playerId: string; bid: number }, mode: string) => scene.finishAuction(winner, mode),
      startRound: () => scene.startRound(),
      processAiDecisions: () => scene.processAiDecisions() as Promise<void>,
      hasAnyInfo: (item: Artifact) => scene.hasAnyInfo(item),
      buildAiIntelSnapshot: () => scene.buildAiIntelSnapshot(),
      canUseLlmDecisionForPlayer: (playerId: string) => scene.canUseLlmDecisionForPlayer(playerId),
      getAiWallet: (id: string) => scene.getAiWallet(id),
      normalizeAiBidValue: (playerId: string, bid: number, wallet?: number | null) => scene.normalizeAiBidValue(playerId, bid, wallet),
    })

    // LanIndexManager 状态容器（getter/setter 同步场景属性）
    const lanIndexState: LanIndexState = {
      get isLanMode() { return scene.isLanMode },
      set isLanMode(v) { scene.isLanMode = v },
      get lanIsHost() { return scene.lanIsHost },
      set lanIsHost(v) { scene.lanIsHost = v },
      get lanPlayers() { return (scene as unknown as Record<string, unknown>).lanPlayers as LanPlayer[] },
      set lanPlayers(v) { (scene as unknown as Record<string, unknown>).lanPlayers = v },
      get lanAiPlayers() { return scene.lanAiPlayers as unknown as LanIndexState["lanAiPlayers"] },
      set lanAiPlayers(v) { scene.lanAiPlayers = v as unknown as (LanPlayer & { llm?: boolean })[] },
      get lanHostWallets() { return scene.lanHostWallets },
      set lanHostWallets(v) { scene.lanHostWallets = v },
      get lanHostBids() { return (scene as unknown as Record<string, unknown>).lanHostBids as Record<string, number> },
      set lanHostBids(v) { (scene as unknown as Record<string, unknown>).lanHostBids = v },
      get lanAiLlmEnabled() { return scene.lanAiLlmEnabled },
      set lanAiLlmEnabled(v) { scene.lanAiLlmEnabled = v },
      get lanIdToSlotId() { return scene.lanIdToSlotId },
      set lanIdToSlotId(v) { scene.lanIdToSlotId = v },
      get slotIdToLanId() { return scene.slotIdToLanId },
      set slotIdToLanId(v) { scene.slotIdToLanId = v },
      get lanMySlotId() { return scene.lanMySlotId as string | null },
      set lanMySlotId(v) { scene.lanMySlotId = v as string },
      get lanReconnecting() { return scene.lanReconnecting },
      set lanReconnecting(v) { scene.lanReconnecting = v },
      get lanReconnectAttempts() { return scene.lanReconnectAttempts },
      set lanReconnectAttempts(v) { scene.lanReconnectAttempts = v },
      get lanMaxReconnectAttempts() { return scene.lanMaxReconnectAttempts },
      set lanMaxReconnectAttempts(v) { scene.lanMaxReconnectAttempts = v },
      get lanLastServerUrl() { return scene.lanLastServerUrl },
      set lanLastServerUrl(v) { scene.lanLastServerUrl = v },
      get lanLastRoomCode() { return scene.lanLastRoomCode },
      set lanLastRoomCode(v) { scene.lanLastRoomCode = v },
      get lanLastPlayerId() { return scene.lanLastPlayerId },
      set lanLastPlayerId(v) { scene.lanLastPlayerId = v },
      get lanStatusEl() { return (scene as unknown as Record<string, unknown>).lanStatusEl as HTMLElement | null },
      set lanStatusEl(v) { (scene as unknown as Record<string, unknown>).lanStatusEl = v },
      get _pauseSnapshotTimeLeft() { return scene._pauseSnapshotTimeLeft },
      set _pauseSnapshotTimeLeft(v) { scene._pauseSnapshotTimeLeft = v },
      get round() { return scene.round },
      set round(v) { scene.round = v },
      get roundResolving() { return scene.roundResolving },
      set roundResolving(v) { scene.roundResolving = v },
      get settled() { return scene.settled },
      set settled(v) { scene.settled = v },
      get roundPaused() { return scene.roundPaused },
      set roundPaused(v) { scene.roundPaused = v },
      get roundTimeLeft() { return scene.roundTimeLeft },
      set roundTimeLeft(v) { scene.roundTimeLeft = v },
      get currentBid() { return scene.currentBid },
      set currentBid(v) { scene.currentBid = v },
      get bidLeader() { return scene.bidLeader as string | null },
      set bidLeader(v) { scene.bidLeader = v as string },
      get secondHighestBid() { return scene.secondHighestBid },
      set secondHighestBid(v) { scene.secondHighestBid = v },
      get playerBidSubmitted() { return scene.playerBidSubmitted },
      set playerBidSubmitted(v) { scene.playerBidSubmitted = v },
      get playerRoundBid() { return scene.playerRoundBid },
      set playerRoundBid(v) { scene.playerRoundBid = v },
      get playerMoney() { return scene.playerMoney },
      set playerMoney(v) { scene.playerMoney = v },
      get actionsLeft() { return scene.actionsLeft },
      set actionsLeft(v) { scene.actionsLeft = v },
      get selectedItem() { return scene.selectedItem },
      set selectedItem(v) { scene.selectedItem = v as Artifact | null },
      get warehouseTrueValue() { return scene.warehouseTrueValue },
      set warehouseTrueValue(v) { scene.warehouseTrueValue = v },
      get aiMaxBid() { return scene.aiMaxBid },
      set aiMaxBid(v) { scene.aiMaxBid = v },
      get moneySettledRunToken() { return scene.moneySettledRunToken },
      set moneySettledRunToken(v) { scene.moneySettledRunToken = v as string | null },
      get settlementRevealRunning() { return scene.settlementRevealRunning },
      set settlementRevealRunning(v) { scene.settlementRevealRunning = v },
      get aiRoundDecisionPromise() { return scene.aiRoundDecisionPromise as Promise<void> | null },
      set aiRoundDecisionPromise(v) { scene.aiRoundDecisionPromise = v as Promise<unknown> | null },
      get currentPublicEvent() { return scene.currentPublicEvent as unknown as { category: string; text: string } | null },
      set currentPublicEvent(v) { scene.currentPublicEvent = v as unknown as { id: string; text: string; category: string } | null },
      get privateIntelEntries() { return scene.privateIntelEntries as unknown[] },
      set privateIntelEntries(v) { scene.privateIntelEntries = v as Array<{ source: string; text: string; round: number }> },
      get publicInfoEntries() { return scene.publicInfoEntries as Array<{ source: string; text: string }> },
      set publicInfoEntries(v) { scene.publicInfoEntries = v },
      get battleRecordReplayActive() { return scene.battleRecordReplayActive },
      set battleRecordReplayActive(v) { scene.battleRecordReplayActive = v },
      get battleRecordReplayRecordId() { return scene.battleRecordReplayRecordId },
      set battleRecordReplayRecordId(v) { scene.battleRecordReplayRecordId = v },
      get _mapQualityWeights() { return (scene as unknown as Record<string, unknown>)._mapQualityWeights as Record<string, number> | null },
      set _mapQualityWeights(v) { (scene as unknown as Record<string, unknown>)._mapQualityWeights = v },
      get _mapCategoryWeights() { return (scene as unknown as Record<string, unknown>)._mapCategoryWeights as Record<string, number> | null },
      set _mapCategoryWeights(v) { (scene as unknown as Record<string, unknown>)._mapCategoryWeights = v },
      get players() { return scene.players },
      set players(v) { scene.players = v },
      get items() { return scene.items as Artifact[] },
      set items(v) { scene.items = v },
      get aiLlmPlayerEnabled() { return scene.aiLlmPlayerEnabled },
      set aiLlmPlayerEnabled(v) { scene.aiLlmPlayerEnabled = v },
      get aiWallets() { return scene.aiWallets },
      set aiWallets(v) { scene.aiWallets = v },
      get aiRoundEffects() { return scene.aiRoundEffects },
      set aiRoundEffects(v) { scene.aiRoundEffects = v },
      get aiLlmRoundPlans() { return scene.aiLlmRoundPlans as unknown as Record<string, unknown> },
      set aiLlmRoundPlans(v) { scene.aiLlmRoundPlans = v as unknown as Record<string, LlmPlan | null> },
      get lastAiDecisionTelemetry() { return scene.lastAiDecisionTelemetry },
      set lastAiDecisionTelemetry(v) { scene.lastAiDecisionTelemetry = v as { mode: string; round: number; entries: LlmTelemetry[] } | null },
      get playerUsageHistory() { return scene.playerUsageHistory as Record<string, Array<{ round: number; actions: string[] }>> },
      set playerUsageHistory(v) { scene.playerUsageHistory = v as unknown as Record<string, unknown> },
      get playerHistoryPanels() { return scene.playerHistoryPanels as Record<string, HTMLElement | null> },
      set playerHistoryPanels(v) { scene.playerHistoryPanels = v as unknown as Record<string, unknown> },
      get revealedCells() { return scene.revealedCells as boolean[][] },
      set revealedCells(v) { scene.revealedCells = v },
      get itemLayer() { return scene.itemLayer as unknown as { destroy: (b: boolean) => void } | null },
      set itemLayer(v) { scene.itemLayer = v as typeof scene.itemLayer },
      get gridLayer() { return scene.gridLayer as unknown as { destroy: (b: boolean) => void } | null },
      set gridLayer(v) { scene.gridLayer = v as typeof scene.gridLayer },
      get revealCellLayer() { return scene.revealCellLayer as unknown as { destroy: (b: boolean) => void } | null },
      set revealCellLayer(v) { scene.revealCellLayer = v as typeof scene.revealCellLayer },
      get warehouseCellIndex() { return scene.warehouseCellIndex as unknown as Record<string, string> },
      set warehouseCellIndex(v) { scene.warehouseCellIndex = v as unknown as Record<string, Artifact | null> },
    }

    this.lanIndexManager = new LanIndexManager({
      state: lanIndexState,
      getLanBridge: () => scene.lanBridge as unknown as LanBridgeLike | null,
      createLanBridge: () => {
        // LanBridge 是全局类（types/globals.d.ts 声明），运行时由 lan/client/lan-bridge.ts 提供
        const LB = LanBridge as unknown as new () => LanBridgeLike
        return new LB()
      },
      writeLog: (text: string) => scene.writeLog(text),
      setOnlineStatus: (text: string, cls: string) => (scene as unknown as Record<string, Function>).setOnlineStatus(text, cls),
      showGameConfirm: (msg: string, onConfirm: () => void) => scene.showGameConfirm(msg, onConfirm),
      stopRoundTimer: () => scene.stopRoundTimer(),
      startRound: () => scene.startRound(),
      updateHud: () => scene.updateHud(),
      beginRunTracking: () => scene.beginRunTracking(),
      cancelSettlementReveal: () => scene.cancelSettlementReveal(),
      exitSettlementPage: () => scene.exitSettlementPage(),
      guardWarehouseCapacity: () => scene.guardWarehouseCapacity(),
      resetPlayerHistoryState: () => scene.resetPlayerHistoryState(),
      hidePreview: () => scene.hidePreview(),
      closeBidKeypad: () => scene.closeBidKeypad(),
      closeItemDrawer: () => scene.closeItemDrawer(),
      hideSettleOverlay: () => scene.hideSettleOverlay(),
      hideRevealScrollHints: () => scene.hideRevealScrollHints(),
      drawUnknownWarehouse: () => scene.drawUnknownWarehouse(),
      spawnRandomItems: () => scene.spawnRandomItems(),
      setupWarehouseAuction: () => scene.setupWarehouseAuction(),
      rebuildWarehouseCellIndex: () => scene.rebuildWarehouseCellIndex(),
      buildWarehouseSnapshotForSync: () => scene.buildWarehouseSnapshotForSync(),
      initPlayersUI: () => scene.initPlayersUI(),
      applyCharacterToPlayer: () => scene.applyCharacterToPlayer(),
      initAiWallets: () => scene.initAiWallets(),
      initAiIntelSystems: () => scene.initAiIntelSystems(),
      makeRunToken: () => scene.makeRunToken(),
      syncItemManagerFromShop: () => scene.syncItemManagerFromShop(),
      revealRoundBidsSequential: (bids: Array<{ playerId: string; bid: number }>) => scene.revealRoundBidsSequential(bids),
      recordRoundHistory: (bids: Array<{ playerId: string; bid: number }>) => scene.recordRoundHistory(bids),
      finishAuction: (winner: { playerId: string; bid: number }, mode: string) => scene.finishAuction(winner, mode),
      captureAiDecisionTelemetry: (slotBids: Array<{ playerId: string; bid: number }>) => scene.captureAiDecisionTelemetry(slotBids),
      recordAiThoughtLogs: (telemetry: unknown) => scene.recordAiThoughtLogs(telemetry),
      renderAiLogicPanel: () => scene.renderAiLogicPanel(),
      waitUntilResumed: () => scene.waitUntilResumed() as Promise<void>,
      setPlayerBidReady: (playerId: string, ready: boolean) => scene.setPlayerBidReady(playerId, ready),
      syncPauseButton: () => scene.syncPauseButton(),
      showLanPauseOverlay: () => (scene as unknown as Record<string, Function>).showLanPauseOverlay(),
      hideLanPauseOverlay: () => (scene as unknown as Record<string, Function>).hideLanPauseOverlay(),
      enterLanRoom: () => scene.enterLanRoom(),
      exitLanRoom: () => scene.exitLanRoom(),
      exitLobby: () => scene.exitLobby(),
      showLanRestartVoteDialog: (hostName: string) => (scene as unknown as Record<string, Function>).showLanRestartVoteDialog(hostName),
      removeLanRestartDialog: () => (scene as unknown as Record<string, Function>).removeLanRestartDialog(),
      showLanRestartDeclinedDialog: (decliner: string) => (scene as unknown as Record<string, Function>).showLanRestartDeclinedDialog(decliner),
      refreshRevealScrollHints: () => scene.refreshRevealScrollHints(),
      refreshPlayerHistoryUI: () => (scene as unknown as Record<string, Function>).refreshPlayerHistoryUI(),
      renderPublicInfoPanel: () => scene.renderPublicInfoPanel(),
      addPublicInfoEntry: (entry: { source: string; text: string }) => scene.addPublicInfoEntry(entry),
      recordPlayerUsage: (playerId: string, actionId: string) => scene.recordPlayerUsage(playerId, actionId),
      isAiLlmEnabledForPlayer: (playerId: string) => scene.isAiLlmEnabledForPlayer(playerId),
      canUseLlmDecisionForPlayer: (playerId: string) => scene.canUseLlmDecisionForPlayer(playerId),
      normalizeAiBidValue: (playerId: string, bid: number, wallet: number) => scene.normalizeAiBidValue(playerId, bid, wallet),
      updateLobbyMoneyDisplay: () => (scene as unknown as Record<string, Function>).updateLobbyMoneyDisplay(),
      getLastRoundBidMap: () => scene.getLastRoundBidMap(),
      buildAiIntelSnapshot: () => scene.buildAiIntelSnapshot(),
      hasAnyInfo: (item: Artifact) => scene.hasAnyInfo(item),
      aiEngine: scene.aiEngine as unknown as { buildAIBids: (args: Record<string, unknown>) => Record<string, number>; resetForNewRun: (args: Record<string, unknown>) => void },
      skillManager: scene.skillManager as unknown as { onNewRound: () => void; resetForNewRun: () => void },
      getProfile: null,
      getSelectedProfileId: null,
    })

    this.syncItemManagerFromShop()
    this.restoreAiMemoryFromStorage()
    this.resetPlayerHistoryState()
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
