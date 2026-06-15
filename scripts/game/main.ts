import type {
  Player,
  Artifact,
  QualityLevel,
  QualityConfig,
  GameSettings,
  SkillDef,
  ItemDef,
  ArtifactRevealState,
  RevealContext,
  RevealResult,
  PassiveEffect,
  DepsContainer,
} from "../../types/game"
import type {
  BidContext,
  BidDecision,
  Personality,
  AiPrivateIntel,
  IntelSummary,
  ToolEffect,
  ActionCandidate,
  CrossGameMemory,
  ReflectionResult,
  ConversationMessage,
} from "../../types/ai"
import type {
  LlmBridge,
  LlmBridgeMethods,
  LlmDecision,
  LlmPlan,
  LlmSettings,
  LlmRoundPayload,
  LlmTelemetry,
  LlmErrorInfo,
} from "../../types/llm"
import type {
  Room,
  LanPlayer,
  BidsPerPlayer,
  BidWinner,
  BidSubmitMessage,
  RoomMessage,
} from "../../types/lan"

/**
 * @file main.ts
 * @module main
 * @description 游戏入口与主场景。创建 Phaser.Game 实例，定义 WarehouseScene 主场景类，
 *              并通过 Object.assign 将所有 Mixin 混入场景原型。是整个游戏的核心组装文件。
 *
 * 加载顺序与依赖检查（L1-L177）：
 *   严格检查所有全局模块是否存在，缺失则抛出 Error 阻止启动：
 *   MobaoConstants → MobaoUtils → MobaoSettings → MobaoWarehouse →
 *   ArtifactData → SkillSystem → ItemSystem → AuctionAI →
 *   DeepSeekLLM → MobaoSceneLlm → MobaoBattleRecordBridge →
 *   MobaoSettlementBridge → MobaoUi → MobaoBidding
 *
 * 桥接层初始化（L136-L176）：
 *   - LLM_BRIDGE: 场景LLM桥接（AI对话/工具调用/上下文管理）
 *   - BATTLE_RECORD_BRIDGE: 战绩记录桥接（持久化/面板渲染/日志查看）
 *   - SETTLEMENT_BRIDGE: 结算桥接（藏品揭示/特效/利润动画）
 *   - MobaoLlm: 全局LLM设置对象
 *
 * WarehouseScene 类（L178-L2883）：
 *   构造函数初始化 60+ 实例属性，按功能分组：
 *   - Phaser 图层: gridLayer, revealCellLayer, itemLayer
 *   - 管理器: artifactManager, skillManager, itemManager, aiEngine
 *   - 回合状态: round, actionsLeft, roundTimeLeft, roundPaused, roundResolving
 *   - 出价状态: currentBid, bidLeader, playerBidSubmitted, playerRoundBid
 *   - 联机状态: isLanMode, lanBridge, lanIsHost, lanMySlotId, 重连相关
 *   - 结算状态: settled, isSettlementRevealMode, settlementSession
 *   - 玩家数组: players[{ id, name, avatar, isHuman, isAI, isSelf }]
 *   - AI 状态: aiPrivateIntel, aiResourceState, aiLlmPlayerEnabled, aiFoldState
 *   - AI 记忆: aiConversationByPlayer, aiCrossGameMemory, runLogHistory
 *   - UI 状态: privateIntelEntries, publicInfoEntries, currentPublicEvent
 *   - DOM 引用: dom{ hudRound, hudTimer, hudMoney, ... }
 *
 *   核心方法（直接定义在类中）：
 *   - create(): 场景创建，初始化DOM引用、事件绑定、HUD、音效
 *   - update(): 每帧更新（计时器、AI思考指示器）
 *   - startNewRun() / startNewRound(): 新局/新回合
 *   - resolveRound(): 回合结算
 *   - handleBidSubmit(): 玩家出价提交
 *   - syncItemManagerFromShop(): 从商店同步道具到游戏内管理器
 *   - 音效: playSfx(), playMusic(), stopMusic()
 *   - 联机: bindLanEvents(), lanStartGame(), lanBroadcastBid()
 *   - AI记忆导入导出: exportAiMemoryToJson(), importAiMemoryFromJson()
 *
 * Mixin 混入（L2884-L2901）：
 *   16个 Mixin 按顺序混入 WarehouseScene.prototype：
 *   Warehouse: CoreMixin → RevealMixin → PreviewMixin
 *   AI: WalletMixin → IntelMixin → MemoryMixin → ReflectionMixin → DecisionMixin
 *   Bidding: BiddingMixin
 *   UI: OverlayMixin → PanelsMixin → HistoryMixin
 *   Lobby: IndexMixin → CarouselMixin → CharacterSelectMixin
 *   Lan: IndexMixin
 *
 * Phaser 配置（L2903-L2922）：
 *   画布尺寸: MARGIN*2 + _GRID_COLS*CELL_SIZE × MARGIN*2 + _GRID_ROWS*CELL_SIZE
 *   透明背景, 分辨率上限 devicePixelRatio 2, 场景: [WarehouseScene]
 *
 * @requires Phaser                - 游戏引擎
 * @requires MobaoConstants        - 全局常量
 * @requires MobaoUtils            - 工具函数
 * @requires MobaoSettings         - 游戏设置
 * @requires MobaoWarehouse        - 仓库 Mixin 集合
 * @requires ArtifactData          - 藏品数据
 * @requires SkillSystem           - 技能系统
 * @requires ItemSystem            - 道具系统
 * @requires AuctionAI             - AI出价引擎
 * @requires DeepSeekLLM           - LLM 客户端
 * @requires MobaoSceneLlm         - 场景LLM桥接
 * @requires MobaoBattleRecordBridge - 战绩记录桥接
 * @requires MobaoSettlementBridge   - 结算桥接
 * @requires MobaoUi               - UI Mixin 集合
 * @requires MobaoBidding          - 出价 Mixin
 * @requires MobaoLobby            - 大厅 Mixin 集合
 * @requires MobaoLan              - 联机 Mixin
 *
 * @exports WarehouseScene  - Phaser 主场景类（通过 new Phaser.Game(config) 自动启动）
 */
if (!window.MobaoConstants) {
  throw new Error("MobaoConstants not found: 请先加载 scripts/game/constants.js")
}

if (!window.MobaoUtils) {
  throw new Error("MobaoUtils not found: 请先加载 scripts/game/utils.js")
}

if (!window.MobaoSettings) {
  throw new Error("MobaoSettings not found: 请先加载 scripts/game/settings.js")
}

if (!window.MobaoWarehouse) {
  throw new Error("MobaoWarehouse not found: 请先加载 scripts/game/warehouse/index.js")
}

const {
  GRID_COLS: _GRID_COLS,
  GRID_ROWS: _GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  CANVAS_NATIVE_HEIGHT,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE,
  SETTINGS_STORAGE_KEY,
  PLAYER_MONEY_STORAGE_KEY,
  AI_LLM_SWITCH_STORAGE_KEY,
  BATTLE_RECORD_STORAGE_KEY,
  AI_MEMORY_STORAGE_KEY,
  DEFAULT_START_MONEY,
  SETTINGS_FIELDS,
  QUALITY_COLORS,
  QUALITY_ORDER,
  QUALITY_LABELS
}: any = window.MobaoConstants

const {
  shuffle,
  delay,
  tweenToPromise,
  clamp,
  roundToStep,
  toCellKey,
  fromCellKey,
  sizeTagToCellCount,
  formatTrackIndex,
  rgbHex,
  trimTrailingZero,
  formatCompactNumber,
  formatBidRevealNumber,
  escapeHtml,
  compactOneLine,
  compactPanelText,
  indentMultiline,
  normalizeActionToken,
  isNoneActionText,
  safeParseJson,
  tryExtractDecisionJson,
  pickFirstDefined,
  createEmptyAiPrivateIntelPool,
  qualityPulseDuration,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
}: any = window.MobaoUtils

const {
  defaultGameSettings,
  normalizeSettingsSource,
  normalizeGameSettings,
  loadGameSettings,
  saveGameSettings,
  loadPlayerMoney,
  savePlayerMoney,
  GAME_SETTINGS: _GAME_SETTINGS
}: any = window.MobaoSettings

if (!window.ArtifactData) {
  throw new Error("ArtifactData not found: 请先加载 scripts/game/artifacts.js")
}

if (!window.SkillSystem) {
  throw new Error("SkillSystem not found: 请先加载 scripts/game/skills.js")
}

if (!window.ItemSystem) {
  throw new Error("ItemSystem not found: 请先加载 scripts/game/items.js")
}

if (!window.AuctionAI) {
  throw new Error("AuctionAI not found: 请先加载 scripts/game/ai-bidding.js")
}

if (!window.DeepSeekLLM) {
  throw new Error("DeepSeekLLM not found: 请先加载 scripts/llm/providers/deepseek-llm.js")
}

if (!window.MobaoSceneLlm) {
  throw new Error("MobaoSceneLlm not found: 请先加载 scene-llm.js")
}

if (!window.MobaoBattleRecordBridge) {
  throw new Error("MobaoBattleRecordBridge not found: 请先加载 battle-record-bridge.js")
}

if (!window.MobaoSettlementBridge) {
  throw new Error("MobaoSettlementBridge not found: 请先加载 settlement-bridge.js")
}

if (!window.MobaoUi) {
  throw new Error("MobaoUi not found: 请先加载 scripts/game/ui/overlay.js")
}

if (!window.MobaoBidding) {
  throw new Error("MobaoBidding not found: 请先加载 scripts/game/bidding/index.js")
}

const { ArtifactManager, ARTIFACT_LIBRARY: _ARTIFACT_LIBRARY, QUALITY_CONFIG: _QUALITY_CONFIG, toSizeTag, estimatePriceByQuality }: any = window.ArtifactData
const { SkillManager, SKILL_DEFS: _SKILL_DEFS }: any = window.SkillSystem
const { ItemManager, ITEM_DEFS: _ITEM_DEFS }: any = window.ItemSystem
const { AuctionAiEngine }: any = window.AuctionAI
const {
  DeepSeekClient,
  defaultDeepSeekSettings,
  loadDeepSeekSettings,
  saveDeepSeekSettings,
  normalizeDeepSeekSettings,
  maskApiKey
}: any = window.DeepSeekLLM || {}
const LLM_SETTINGS = loadDeepSeekSettings ? loadDeepSeekSettings() : {}
window.MobaoLlm = {
  LLM_SETTINGS,
  saveDeepSeekSettings,
  maskApiKey,
  defaultDeepSeekSettings,
  loadDeepSeekSettings
}
const LLM_BRIDGE: LlmBridge = window.MobaoSceneLlm.createSceneLlmBridge({
  AI_LLM_SWITCH_STORAGE_KEY,
  LLM_SETTINGS,
  GAME_SETTINGS: _GAME_SETTINGS,
  SKILL_DEFS: _SKILL_DEFS,
  ITEM_DEFS: _ITEM_DEFS,
  normalizeDeepSeekSettings,
  maskApiKey,
  saveDeepSeekSettings,
  pickFirstDefined,
  compactOneLine,
  normalizeActionToken,
  isNoneActionText,
  compactPanelText,
  indentMultiline,
  formatBidRevealNumber
})
window.LLM_BRIDGE = LLM_BRIDGE
const BATTLE_RECORD_BRIDGE: { methods: Record<string, (...args: unknown[]) => unknown>; loadBattleRecords: () => unknown[] } = window.MobaoBattleRecordBridge.createBattleRecordBridge({
  BATTLE_RECORD_STORAGE_KEY,
  GRID_COLS: _GRID_COLS,
  GRID_ROWS: _GRID_ROWS,
  clamp,
  escapeHtml,
  formatBidRevealNumber
})
const SETTLEMENT_BRIDGE: { methods: Record<string, (...args: unknown[]) => unknown> } = window.MobaoSettlementBridge.createSettlementBridge({
  MARGIN,
  CELL_SIZE,
  delay,
  tweenToPromise,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
})

// 注册到 Deps 容器，其他模块通过 import { Deps } from '../core/deps.js' 获取
window.initDeps({ LLM_BRIDGE, BATTLE_RECORD_BRIDGE, SETTLEMENT_BRIDGE })

// Mixin 方法声明：这些方法通过 Object.assign 从各 Mixin 混入 WarehouseScene.prototype
// 声明为 interface 让 TS 识别，运行时由 Mixin 提供
interface WarehouseMixinMethods {
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
const _PhaserScene: any = (Phaser as any).Scene
class WarehouseScene extends _PhaserScene {
  gridLayer: any
  revealCellLayer: any
  itemLayer: any
  items: Artifact[]
  revealedCells: any[]
  artifactManager: any
  skillManager: any
  itemManager: any
  aiEngine: any
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
  lanBridge: any
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
  roundTimerId: any
  roundPaused: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  playerRoundBid: number
  isSettlementRevealMode: boolean
  settlementRevealRunning: boolean
  settlementRevealSkipRequested: boolean
  settlementSession: { runToken: number | string; phase: string } | null
  settlementRunToken: number | string
  activeSettlementSpinner: any
  moneySettledRunToken: string | null
  _edgeFlashActive: boolean
  _lastDisplayedMoney: number | null
  players: Player[]
  playerRoundHistory: Record<string, any>
  playerUsageHistory: Record<string, any>
  currentRoundUsage: Record<string, any>
  playerHistoryPanels: Record<string, any>
  aiPrivateIntel: Record<string, AiPrivateIntel>
  aiResourceState: Record<string, any>
  aiRoundEffects: Record<string, any>
  lastAiIntelActions: any[]
  aiLlmRoundPlans: Record<string, LlmPlan | null>
  aiLlmPlayerEnabled: Record<string, boolean>
  aiFoldState: Record<string, any>
  lastAiDecisionTelemetry: { mode: string; round: number; entries: LlmTelemetry[] } | null
  llmEverUsedThisRun: boolean
  aiReflectionState: string
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: Record<string, CrossGameMemory[]>
  aiCrossGameMessagesByPlayer: Record<string, Array<Array<Record<string, string>>>>
  aiReflectionPending: Record<string, any>
  runSerial: number
  runLogHistory: any[]
  currentRunLog: any
  highValuePriceThreshold: number | null
  battleRecords: any[]
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: any
  roundBidReadyState: Record<string, any>
  aiRoundDecisionPromise: Promise<any> | null
  pendingNextRunAiSummaryByPlayer: Record<string, string>
  pendingSettlementSummary: string
  privateIntelEntries: any[]
  publicInfoEntries: any[]
  currentPublicEvent: any
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
    this.aiLlmPlayerEnabled = LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players)
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
    this.battleRecords = BATTLE_RECORD_BRIDGE.loadBattleRecords()
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
      settleBackBtn: null,
      settleReplayBtn: null,
      settleReflectionStatus: null,
      settingsOverlay: null,
      settingsPanel: null,
      settingsScroll: null,
      settingsCloseBtn: null,
      settingsResetBtn: null,
      settingsSaveBtn: null,
      settingsStatusText: null,
      settingLlmEnabled: null,
      settingLlmMultiGameMemoryEnabled: null,
      settingDeepseekApiKey: null,
      settingDeepseekModel: null,
      settingsTestDeepSeekBtn: null,
      settingsLlmStatusText: null,
      clearAiMemoryBtn: null,
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
    window.WarehouseScene = WarehouseScene
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

  initAudio() {
    if (window.AudioManager) {
      AudioManager.init().then(() => {
        AudioManager.preload("ui", ["click"])
        AudioManager.preload("game", ["reveal", "coinsReveal", "search", "countdown"])
        AudioManager.preload("bgm", ["lobby", "game"])
        if (window.AudioUI) {
          AudioUI.init()
        }
      })
    }
  }

  cacheDom() {
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
    this.dom.bidInput = document.getElementById("bidInput")
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

  /* ---- 动效初始化 ---- */
  initAnimations() {
    if (!window.MobaoAnimations) return

    // 1. 为所有交互按钮绑定涟漪 + 按下缩放效果
    const selector =
      ".hud button, .bottom-bid-bar button, .settle-actions button, .keypad-grid button, .keypad-actions button, .item-drawer-btn, .shop-item-buy, .lobby-nav-btn, .lobby-start-btn, .overlay button, .settings-content button, .collection-item-btn, .ai-panel button, .info-popup-content button, .bid-keypad-button"
    MobaoAnimations.bindAllButtonEffects(selector)

    // 2. 标记已初始化的按钮避免重复绑定
    document.querySelectorAll(selector).forEach(function (btn: Element) {
      if (btn && !(btn as HTMLElement).dataset.rippleInited) {
        (btn as HTMLElement).dataset.rippleInited = "1"
      }
    })

    // 3. 单独处理未在通用选择器中的元素
    const extraBtns = document.querySelectorAll('[data-btn-effect="ripple"]')
    extraBtns.forEach(function (btn: Element) {
      if (btn && !(btn as HTMLElement).dataset.rippleInited) {
        MobaoAnimations.bindRipple(btn)
        MobaoAnimations.bindPressScale(btn)
          ; (btn as HTMLElement).dataset.rippleInited = "1"
      }
    })

    // 4. 脉冲效果：给「结算」按钮添加脉冲吸引注意
    const settleBtn = this.dom.settleBtn
    if (settleBtn) {
      MobaoAnimations.pulse(settleBtn, "soft", { duration: 2000 })
    }
  }

  bindDomEvents() {
    const updateVolumeIcon = (value, imgEl) => {
      if (!imgEl) return
      const isMuted = Number(value) === 0
      imgEl.src = isMuted ? "./assets/images/icons/ui/mute-fill.svg" : "./assets/images/icons/ui/sound-on.svg"
      imgEl.classList.toggle("muted", isMuted)
    }

    this.dom.rerollBtn.addEventListener("click", () => {
      if (this.isLanMode) return
      this.startNewRun()
    })
    this.dom.openSettingsBtn.addEventListener("click", () => {
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
    const musicVolumeValue = document.getElementById("musicVolumeValue") as HTMLElement | null
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
    const sfxVolumeValue = document.getElementById("sfxVolumeValue") as HTMLElement | null
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
    this.dom.nextRoundBtn.addEventListener("click", () => this.resolveRoundBids("manual"))
    if (this.dom.pauseRoundBtn) {
      this.dom.pauseRoundBtn.addEventListener("click", () => this.toggleRoundPause())
    }

    this.dom.aiLogicBtn.addEventListener("click", () => this.openAiLogicPanel())
    if (this.dom.aiLogicCloseBtn) {
      this.dom.aiLogicCloseBtn.addEventListener("click", () => this.closeAiLogicPanel())
    }
    if (this.dom.aiLogicOverlay) {
      this.dom.aiLogicOverlay.addEventListener("click", (event) => {
        if (event.target === this.dom.aiLogicOverlay) {
          this.closeAiLogicPanel()
        }
      })
    }
    if (this.dom.aiViewMessagesBtn) {
      this.dom.aiViewMessagesBtn.addEventListener("click", () => this.showAiConversationMessages())
    }
    if (this.dom.battleRecordCloseBtn) {
      this.dom.battleRecordCloseBtn.addEventListener("click", () => this.closeBattleRecordPanel())
    }
    if (this.dom.battleRecordOverlay) {
      this.dom.battleRecordOverlay.addEventListener("click", (event) => {
        if (event.target === this.dom.battleRecordOverlay) {
          this.closeBattleRecordPanel()
        }
      })
    }
    if (this.dom.battleRecordContent) {
      this.dom.battleRecordContent.addEventListener("click", (event) => {
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
      this.dom.itemOutlineBtn.addEventListener("click", () => this.useItem("item-outline-lamp"))
    }
    if (this.dom.itemQualityBtn) {
      this.dom.itemQualityBtn.addEventListener("click", () => this.useItem("item-quality-needle"))
    }
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.addEventListener("click", () => this.toggleItemDrawer())
    }
    if (this.dom.itemDrawerCloseBtn) {
      this.dom.itemDrawerCloseBtn.addEventListener("click", () => this.closeItemDrawer())
    }
    if (this.dom.itemDrawerList) {
      this.dom.itemDrawerList.addEventListener("click", (event) => {
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
    this.dom.settleBtn.addEventListener("click", () => this.settleCurrentRun())
    this.dom.settleBackBtn.addEventListener("click", () => {
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
    this.dom.settleReplayBtn.addEventListener("click", () => {
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
          this.lanBridge.send({ type: "game:restart-request", aiCount, aiLlmEnabled: this.lanAiLlmEnabled, aiPlayers })
          this.showLanRestartWaitingDialog()
        } else {
          this.writeLog("等待主机发起重开请求...")
        }
      } else {
        this.proceedToNewRun()
      }
    })

    if (this.dom.previewCloseBtn) {
      this.dom.previewCloseBtn.addEventListener("click", () => this.hidePreview())
    }
    this.setupPreviewTouchScroll()
    this.dom.previewCategorySelect.addEventListener("change", () => {
      if (this.selectedItem) {
        this.renderPreviewCandidates(this.selectedItem)
      }
    })
    // 注意：不再在 mousedown 时修改 overflow，因为这会破坏滚动功能
    // 如果下拉框选项被裁切，应该通过 CSS 解决（如使用 position: fixed 的下拉列表）

    this.dom.settingsCloseBtn.addEventListener("click", () => this.closeSettingsOverlay(false))
    this.dom.settingsResetBtn.addEventListener("click", () => {
      this.fillSettingsForm(defaultGameSettings())
      this.fillLlmSettingsForm(
        this.getLlmProvider() && typeof this.getLlmProvider().defaultSettings === "function"
          ? this.getLlmProvider().defaultSettings()
          : defaultDeepSeekSettings()
      )
      this.setSettingsStatus("已恢复默认，点击保存后生效。", false)
    })
    this.dom.settingsSaveBtn.addEventListener("click", () => this.saveSettingsFromOverlay())
    if (this.dom.settingsReturnLobbyBtn) {
      this.dom.settingsReturnLobbyBtn.addEventListener("click", () => {
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
      this.dom.clearAiMemoryBtn.addEventListener("click", () => {
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
      this.dom.clearAiContextBtn.addEventListener("click", () => {
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
      this.dom.viewAiMemoryBtn.addEventListener("click", () => {
        this.openAiMemoryPanel()
      })
    }
    if (this.dom.exportAiMemoryBtn) {
      this.dom.exportAiMemoryBtn.addEventListener("click", () => {
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
      document.getElementById("exportDialogCloseBtn").addEventListener("click", () => {
        this.removeAiMemoryExportDialog()
      })
      document.getElementById("exportShareBtn").addEventListener("click", () => {
        if (window.NativeBridge && window.NativeBridge.shareFile) {
          const base64Data = btoa(unescape(encodeURIComponent(jsonData)))
          const success = (window as unknown as Record<string, { shareFile?: (...args: unknown[]) => unknown }>).NativeBridge?.shareFile?.(base64Data, fileName, "AI记忆导出")
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
      document.getElementById("exportCopyBtn").addEventListener("click", () => {
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
      this.dom.importAiMemoryBtn.addEventListener("click", () => {
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
      } catch (e) {
        if (statusEl) {
          statusEl.textContent = "文件解析失败: " + e.message
          statusEl.className = "ai-import-status error"
        }
        this.writeLog("文件解析失败: " + e.message)
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
      const hasNativeImport = !!(window.NativeBridge && window.NativeBridge.openFileImport)
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

      const showStatus = (msg, type) => {
        if (!statusEl) return
        statusEl.textContent = msg
        statusEl.className = "ai-import-status " + (type || "")
      }

      // 原生文件导入
      if (hasNativeImport && fileBtn) {
        fileBtn.addEventListener("click", () => {
          showStatus("正在打开文件选择器...", "loading")
          window.NativeBridge.openFileImport()
        })
      }

      // HTML file input 导入
      if (fileInput) {
        fileInput.addEventListener("change", (e) => {
          const file = (e.target as any).files && (e.target as any).files[0]
          if (!file) return
          showStatus("正在读取文件...", "loading")
          const reader = new FileReader()
          reader.onload = (ev) => {
            try {
              const jsonText = ev.target.result
              const result = this.importAiMemoryFromJson(jsonText)
              if (result.ok) {
                showStatus("导入成功！", "success")
                if (this.dom.aiMemoryStatusText) this.dom.aiMemoryStatusText.textContent = "已导入"
                this.writeLog("AI记忆已从文件导入。")
                setTimeout(() => this.removeAiMemoryImportDialog(), 800)
              } else {
                showStatus("导入失败: " + result.error, "error")
              }
            } catch (err) {
              showStatus("文件解析失败: " + err.message, "error")
            }
          }
          reader.onerror = () => showStatus("文件读取失败", "error")
          reader.readAsText(file)
        })
      }

      // 粘贴模式
      if (pasteBtn) {
        pasteBtn.addEventListener("click", () => {
          if (pasteArea) pasteArea.style.display = "block"
          if (textarea) textarea.focus()
          if (confirmBtn) confirmBtn.style.display = "inline-block"
          if (fileBtn) fileBtn.style.display = "none"
          if (pasteBtn) pasteBtn.style.display = "none"
        })
      }

      document.getElementById("importDialogCloseBtn").addEventListener("click", () => {
        this.removeAiMemoryImportDialog()
      })
      document.getElementById("importPasteConfirmBtn").addEventListener("click", () => {
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
    this.downloadAiMemoryFallback = (jsonData, fileName) => {
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
      this.dom.resetAiWalletBtn.addEventListener("click", () => {
        // 临时修改确认按钮文本
        const okBtn = document.getElementById("gameConfirmOkBtn")
        const cancelBtn = document.getElementById("gameConfirmCancelBtn")
        const originalOkText = okBtn ? okBtn.textContent : ""
        const originalCancelText = cancelBtn ? cancelBtn.textContent : ""
        if (okBtn) okBtn.textContent = "确认重置"
        if (cancelBtn) cancelBtn.textContent = "取消"

        this.showGameConfirm(
          "确定要重置所有AI钱包到初始100万吗？此操作不可撤销。",
          () => {
            // 恢复按钮文本
            if (okBtn) okBtn.textContent = originalOkText
            if (cancelBtn) cancelBtn.textContent = originalCancelText

            this.resetAiWallets()
            if (this.dom.aiMemoryStatusText) {
              this.dom.aiMemoryStatusText.textContent = "已重置AI钱包"
            }
            this.writeLog("AI钱包已重置为100万。")
          },
          () => {
            // 恢复按钮文本
            if (okBtn) okBtn.textContent = originalOkText
            if (cancelBtn) cancelBtn.textContent = originalCancelText
          }
        )
      })
    }
    if (this.dom.aiMemoryCloseBtn) {
      this.dom.aiMemoryCloseBtn.addEventListener("click", (event) => {
        event.stopPropagation()
        this.closeAiMemoryPanel()
      })
    }
    if (this.dom.settingLlmIndependentModelEnabled) {
      this.dom.settingLlmIndependentModelEnabled.addEventListener("change", () => {
        const checked = (this.dom.settingLlmIndependentModelEnabled as HTMLInputElement).checked
        if (this.dom.independentModelConfig) {
          this.dom.independentModelConfig.classList.toggle("hidden", !checked)
        }
      })
    }
    if (this.dom.configIndependentModelBtn) {
      this.dom.configIndependentModelBtn.addEventListener("click", () => {
        this.openAiModelConfigOverlay()
      })
    }
    if (this.dom.aiModelConfigCloseBtn) {
      this.dom.aiModelConfigCloseBtn.addEventListener("click", (event) => {
        event.stopPropagation()
        this.closeAiModelConfigOverlay()
      })
    }
    if (this.dom.aiModelConfigSaveBtn) {
      this.dom.aiModelConfigSaveBtn.addEventListener("click", (event) => {
        event.stopPropagation()
        this.saveAiModelConfigFromForm()
      })
    }
    if (this.dom.aiModelConfigOverlay) {
      this.dom.aiModelConfigOverlay.addEventListener("click", (event) => {
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
      this.dom.aiMemoryOverlay.addEventListener("click", (event) => {
        event.stopPropagation()
        if (event.target === this.dom.aiMemoryOverlay) {
          this.closeAiMemoryPanel()
        }
      })
    }
    if (this.dom.aiMemoryPanel) {
      this.dom.aiMemoryPanel.addEventListener("click", (event) => {
        event.stopPropagation()
      })
      this.dom.aiMemoryPanel.addEventListener(
        "touchstart",
        (event) => {
          event.stopPropagation()
        },
        { passive: true }
      )
      this.dom.aiMemoryPanel.addEventListener(
        "touchmove",
        (event) => {
          event.stopPropagation()
        },
        { passive: true }
      )
    }
    this.dom.settingsOverlay.addEventListener("click", (event) => {
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

    this.dom.gameRoot.addEventListener(
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
          this.dom.previewPopover.contains(event.target) &&
          !this.dom.previewPopover.classList.contains("hidden")
        ) {
          this.scrollElementByWheel(this.dom.previewPopover, event.deltaY)
          event.preventDefault()
          return
        }

        if (
          !this.dom.previewPopover.classList.contains("hidden") &&
          event.target instanceof HTMLElement &&
          this.dom.gameRoot.contains(event.target) &&
          !this.dom.previewPopover.contains(event.target)
        ) {
          this.hidePreview()
        }

        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          if (this.scrollElementByWheel(this.dom.gameRoot, event.deltaY)) {
            event.preventDefault()
          }
        }
      },
      { passive: false }
    )

    this.dom.gameRoot.addEventListener(
      "scroll",
      () => {
        this.refreshRevealScrollHints()
      },
      { passive: true }
    )

    let touchStartY = 0
    let touchStartScrollTop = 0
    let touchInPreview = false
    this.dom.gameRoot.addEventListener(
      "touchstart",
      (e) => {
        touchInPreview =
          e.target instanceof HTMLElement &&
          this.dom.previewPopover.contains(e.target) &&
          !this.dom.previewPopover.classList.contains("hidden")
        if (touchInPreview) return
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY
          touchStartScrollTop = this.dom.gameRoot.scrollTop
        }
      },
      { passive: true }
    )

    this.dom.gameRoot.addEventListener(
      "touchmove",
      (e) => {
        if (touchInPreview) return
        if (e.touches.length !== 1) return
        const dy = touchStartY - e.touches[0].clientY
        const maxScroll = this.dom.gameRoot.scrollHeight - this.dom.gameRoot.clientHeight
        if (maxScroll <= 0) return
        this.dom.gameRoot.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
      },
      { passive: true }
    )

    this.dom.gameRoot.addEventListener("pointerdown", (event) => {
      if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
        return
      }

      const target = event.target
      if (target instanceof HTMLElement && this.dom.previewPopover.contains(target)) {
        return
      }

      const point = this.toWorldPointFromRootEvent(event)
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
    this.dom.bidInput.addEventListener("keydown", (event) => event.preventDefault())
    this.dom.bidInput.addEventListener("click", () => this.openBidKeypad())
    this.dom.bidInput.addEventListener("focus", () => this.openBidKeypad())

    this.dom.keypadCloseBtn.addEventListener("click", () => this.closeBidKeypad())
    this.dom.bidKeypad.addEventListener("pointerdown", (event) => {
      event.stopPropagation()
    })
    this.dom.bidKeypad.addEventListener("click", (event) => {
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

      ; (this.input as any).keyboard.on("keydown-R", () => {
        if (this.isLanMode) return
        this.startNewRun()
      })
      ; (this.input as any).keyboard.on("keydown-N", () => {
        if (this.isLanMode && !this.lanIsHost) return
        this.resolveRoundBids("manual")
      })
      ; (this.input as any).keyboard.on("keydown-B", () => this.openBidKeypad())
      ; (this.input as any).keyboard.on("keydown-P", () => {
        if (this.isLanMode && !this.lanIsHost) return
        this.toggleRoundPause()
      })

    this.dom.gameConfirmCancelBtn.addEventListener("click", (event) => {
      event.stopPropagation()
      const cb = this._gameCancelCallback
      this.hideGameConfirm()
      if (cb) {
        cb()
      }
    })
    this.dom.gameConfirmOkBtn.addEventListener("click", (event) => {
      event.stopPropagation()
      const cb = this._gameConfirmCallback
      this.hideGameConfirm()
      if (cb) {
        cb()
      }
    })

    // 游戏确认弹窗点击事件处理，阻止事件冒泡
    this.dom.gameConfirmOverlay.addEventListener("click", (event) => {
      event.stopPropagation()
    })
    const gameConfirmBox = document.querySelector(".game-confirm-box")
    if (gameConfirmBox) {
      gameConfirmBox.addEventListener("click", (event) => {
        event.stopPropagation()
      })
    }

    this.dom.infoPopupCloseBtn.addEventListener("click", () => this.hideInfoPopup())
    this.dom.infoPopupOverlay.addEventListener("click", (event) => {
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

    ; (this.input as any).on("pointerdown", (pointer: any) => {
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
        !(targetEl && this.dom.previewPopover.contains(targetEl)) &&
        !(targetEl && this.dom.gameRoot.contains(targetEl))
      ) {
        this.settlementRevealSkipRequested = true
      }

      if (
        targetEl &&
        this.isSettingsOverlayOpen() &&
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

      if (!this.dom.previewPopover.classList.contains("hidden") && Date.now() - this.previewOpenTick >= 140) {
        if (targetEl && !this.dom.previewPopover.contains(targetEl)) {
          this.hidePreview()
        }
      }

      if (
        targetEl &&
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

  applyCharacterToPlayer() {
    if (!window.CharacterSystem) return
    const char = CharacterSystem.getActiveCharacter()
    if (!char) return
    const self = this.players.find((p) => p.isSelf)
    if (!self) return
    self.characterId = char.id
    self.characterName = char.name
    self.name = CharacterSystem.getDisplayName()
    self.avatar = CharacterSystem.getAvatarLabel()
    // 同步更新 DOM 中的角色名字
    const nameEl = document.getElementById(`name-${self.id}`)
    if (nameEl) nameEl.textContent = char.name
    this._activeSkillId = CharacterSystem.getActiveSkillId()
    this.refreshSkillButtonLabel()
  }

  bindCharacterSkillButton() {
    if (!this.dom.skillBtn) return
    this.dom.skillBtn.onclick = () => {
      const skillId =
        this._activeSkillId || (window.CharacterSystem && CharacterSystem.getActiveSkillId()) || "skill-outline-scan"
      this.useSkill(skillId)
    }
    this.refreshSkillButtonLabel()
  }

  refreshSkillButtonLabel() {
    if (!this.dom.skillBtn || !window.CharacterSystem) return
    const char = CharacterSystem.getActiveCharacter()
    if (!char || !char.skillName) return
    this.dom.skillBtn.textContent = char.skillName
  }

  startNewRun() {
    this.beginRunTracking()
    this.battleRecordReplayActive = false
    this.battleRecordReplayRecordId = null
    this.cancelSettlementReveal()
    this.stopRoundTimer()
    this.exitSettlementPage()
    this.guardWarehouseCapacity()

    if (window.CharacterSystem) {
      CharacterSystem.resetForNewGame()
      this.applyCharacterToPlayer()
    }

    this.round = 1
    this.actionsLeft = _GAME_SETTINGS.actionsPerRound
    this.roundTimeLeft = _GAME_SETTINGS.roundSeconds
    this.roundResolving = false
    this.playerBidSubmitted = false
    this.playerRoundBid = 0
    this.selectedItem = null
    this.currentBid = 1000
    this.bidLeader = "none"
    this.aiMaxBid = 0
    this.warehouseTrueValue = 0
    this.settled = false
    this.moneySettledRunToken = this.makeRunToken()
    this.resetPlayerHistoryState()

    this.privateIntelEntries = []
    this.publicInfoEntries = []
    this.currentPublicEvent = null

    this.skillManager.resetForNewRun()
    this.skillManager.onNewRound()
    this.syncItemManagerFromShop()

    this.hidePreview()
    this.closeBidKeypad()
    this.closeItemDrawer()
    this.hideSettleOverlay()
    this.hideRevealScrollHints()
    this.drawUnknownWarehouse()
    this.spawnRandomItems()

    if (window.PublicEventSystem && this.items.length > 0) {
      this.currentPublicEvent = window.PublicEventSystem.pickRandomPublicEvent(this.items, _GRID_COLS, _GRID_ROWS)
      this.publicInfoEntries.push({
        source: this.currentPublicEvent.category,
        text: this.currentPublicEvent.text
      })
    }

    this.setupWarehouseAuction()
    this.rebuildWarehouseCellIndex()
    this.initAiWallets()
    this.initAiIntelSystems()
    this.aiEngine.resetForNewRun({
      startingBid: this.currentBid,
      itemCount: this.items.length
    })
    this.lastAiDecisionTelemetry = null
    this.llmEverUsedThisRun = false
    this.aiReflectionState = "idle"
    if (!this.isAiMultiGameMemoryEnabled()) {
      this.resetAiConversations()
    } else {
      this.aiConversationByPlayer = {}
    }
    this.pushRunStartContextToAi()
    this.startRound()
    this.updateHud()
    this.writeLog("新仓库已生成：回合限时开始，可先用道具/技能再提交整仓出价。")
  }

  openBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordPanel.call(this)
  }

  closeBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.closeBattleRecordPanel.call(this)
  }

  buildWarehouseSnapshotForSync() {
    return this.buildWarehouseSnapshotForRecord()
  }

  buildWarehouseSnapshotForRecord() {
    return BATTLE_RECORD_BRIDGE.methods.buildWarehouseSnapshotForRecord.call(this)
  }

  saveBattleRecord(result: { won: boolean; profit: number; bidAmount: number; trueValue: number; round: number }) {
    return BATTLE_RECORD_BRIDGE.methods.saveBattleRecord.call(this, result)
  }

  renderBattleRecordPanel() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordPanel.call(this)
  }

  openBattleRecordReplay(recordId: string) {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordReplay.call(this, recordId)
  }

  openBattleRecordLogs(recordId: string, page: number = 1) {
    return BATTLE_RECORD_BRIDGE.methods.openBattleRecordLogs.call(this, recordId, page)
  }

  closeBattleRecordLogs() {
    return BATTLE_RECORD_BRIDGE.methods.closeBattleRecordLogs.call(this)
  }

  deleteBattleRecord(recordId: string) {
    return BATTLE_RECORD_BRIDGE.methods.deleteBattleRecord.call(this, recordId)
  }

  restoreWarehouseFromBattleRecord(record: { id: string; data: Record<string, unknown> }) {
    return BATTLE_RECORD_BRIDGE.methods.restoreWarehouseFromBattleRecord.call(this, record)
  }

  renderBattleRecordLogView() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordLogView.call(this)
  }

  renderBattleRecordSummary() {
    return BATTLE_RECORD_BRIDGE.methods.renderBattleRecordSummary.call(this)
  }

  renderAiLogicPanel() {
    if (!this.dom.aiLogicContent || !this.aiEngine || typeof this.aiEngine.getLastDecisionLog !== "function") {
      return
    }

    if (this.lastAiDecisionTelemetry && this.lastAiDecisionTelemetry.mode === "llm") {
      this.renderAiLogicPanelForLlm(this.lastAiDecisionTelemetry)
      return
    }

    const payload = this.aiEngine.getLastDecisionLog()
    if (!payload || !payload.entries || payload.entries.length === 0) {
      this.dom.aiLogicContent.textContent = "暂无AI出价决策。\n请至少完成一轮出价揭示后查看。"
      return
    }

    const lines = []
    const roundText = Number.isFinite(payload.round) ? payload.round : this.round
    lines.push(`回合 ${roundText} | 当前价 ${formatBidRevealNumber(payload.currentBid || this.currentBid)}`)
    lines.push(
      `参考盘 ${formatBidRevealNumber(payload.marketReference || this.currentBid)} | 线索率 ${Math.round((payload.clueRate || 0) * 100)}%`
    )
    lines.push("信心影响：信心越高，AI越愿意贴近心理预期和上限；信心越低，AI越可能观望或回撤。\n")
    lines.push("-")

    payload.entries.forEach((entry) => {
      const parts = entry.confidenceParts || {}
      const overheat = Math.round((entry.overheatRatio || 0) * 100)
      const threshold = Math.round((entry.overheatThreshold || 0) * 100)
      lines.push(`${entry.name || entry.playerId}（${entry.archetype || "未知人格"}）`)
      lines.push(
        `  最终出价: ${formatBidRevealNumber(entry.finalBid || 0)} | 信心 ${Math.round((entry.confidence || 0) * 100)}%`
      )
      lines.push(
        `  私有线索: 线索率 ${Math.round((entry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((entry.intelQualityRate || 0) * 100)}% | 不确定 ${(entry.intelUncertainty || 0).toFixed(2)} | 波动 ${(entry.intelSpreadRatio || 0).toFixed(2)}`
      )
      lines.push(
        `  分布边缘: 上沿 ${(entry.intelUpperEdge || 0).toFixed(2)} | 下沿 ${(entry.intelLowerEdge || 0).toFixed(2)}`
      )
      lines.push(
        `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
      )
      lines.push(
        `  估值: ${formatBidRevealNumber(entry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(entry.hardCap || 0)}`
      )
      lines.push(
        `  心理预期: ${formatBidRevealNumber(entry.psychExpectedBid || 0)}（目标 ${formatBidRevealNumber(entry.targetPsychExpected || 0)}）`
      )
      lines.push(
        `  超预期: ${overheat}% | 回撤阈值 ${threshold}% | 低信息调整 ${formatBidRevealNumber(entry.floorAdjustAmount || 0)}`
      )
      lines.push(`  工具影响: ${entry.toolTag || "无"} | 决策加分 ${(entry.toolScoreBoost || 0).toFixed(2)}`)
      lines.push(
        `  行为: ${entry.actionTag || "常规"}${entry.mistakeTag ? ` | 失误:${entry.mistakeTag}` : ""}${entry.diversifyTag ? ` | 去同质:${entry.diversifyTag}` : ""}`
      )
      lines.push("-")
    })

    this.dom.aiLogicContent.textContent = lines.join("\n")
  }

  renderAiLogicPanelForLlm(telemetry: { mode: string; round: number; entries: LlmTelemetry[] }) {
    return LLM_BRIDGE.methods.renderAiLogicPanelForLlm.call(this, telemetry)
  }

  showAiConversationMessages() {
    return LLM_BRIDGE.methods.showAiConversationMessages.call(this)
  }

  fillLlmSettingsForm(values: LlmSettings) {
    return LLM_BRIDGE.methods.fillLlmSettingsForm.call(this, values)
  }

  readLlmSettingsForm() {
    return LLM_BRIDGE.methods.readLlmSettingsForm.call(this)
  }

  setLlmSettingsStatus(text: string, state: "ok" | "error" | "loading" | "") {
    return LLM_BRIDGE.methods.setLlmSettingsStatus.call(this, text, state)
  }

  async testDeepSeekConnectionFromOverlay() {
    return LLM_BRIDGE.methods.testDeepSeekConnectionFromOverlay.call(this)
  }

  scrollElementByWheel(element: HTMLElement | null, deltaY: number) {
    if (!element) {
      return false
    }

    const maxScroll = element.scrollHeight - element.clientHeight
    if (maxScroll <= 0) {
      return false
    }

    const before = element.scrollTop
    element.scrollTop = clamp(element.scrollTop + deltaY, 0, maxScroll)
    return before !== element.scrollTop
  }

  buildBidHistorySnapshot() {
    return window.MobaoContextBuilder.buildBidHistorySnapshot(this.round, this.players, this.playerRoundHistory)
  }

  buildPublicEventSnapshot(options: Record<string, unknown> = {}) {
    return window.MobaoContextBuilder.buildPublicEventSnapshot(
      this.players, this.playerUsageHistory, this.currentRoundUsage, this.round,
      this.getActionDefById.bind(this), this.currentPublicEvent, options
    )
  }

  buildRoundPublicStateTable(viewerId: string) {
    return window.MobaoContextBuilder.buildRoundPublicStateTable(
      this.round, this.players, this.playerRoundHistory,
      this.currentRoundUsage, this.playerUsageHistory, viewerId
    )
  }

  buildQualityPriceRangeTableCompact() {
    return window.MobaoContextBuilder.buildQualityPriceRangeTableCompact()
  }

  buildCatalogSummary(options: Record<string, unknown> = {}) {
    return window.MobaoContextBuilder.buildCatalogSummary(options)
  }

  buildQualityPriceGuide(options: Record<string, unknown> = {}) {
    return window.MobaoContextBuilder.buildQualityPriceGuide(options)
  }

  getActionDefById(actionId: string) {
    return window.MobaoContextBuilder.getActionDefById(actionId)
  }

  buildOtherPlayersPublicInfo(viewerId: string, options: Record<string, unknown> = {}) {
    return window.MobaoContextBuilder.buildOtherPlayersPublicInfo(
      this.players, this.aiEngine, this.playerUsageHistory,
      this.getActionDefById.bind(this), viewerId, options
    )
  }

  buildAiLlmRoundPayload(player: Player) {
    return LLM_BRIDGE.methods.buildAiLlmRoundPayload.call(this, player)
  }

  buildAiFollowupRoundPayload(player: Player, currentPlan: LlmPlan, toolSummary: string) {
    return LLM_BRIDGE.methods.buildAiFollowupRoundPayload.call(this, player, currentPlan, toolSummary)
  }

  buildAiIncrementalPayload(player: Player) {
    return LLM_BRIDGE.methods.buildAiIncrementalPayload.call(this, player)
  }

  canUseLlmDecision() {
    return LLM_BRIDGE.methods.canUseLlmDecision.call(this)
  }

  isAiLlmEnabledForPlayer(playerId: string) {
    return LLM_BRIDGE.methods.isAiLlmEnabledForPlayer.call(this, playerId)
  }

  canUseLlmDecisionForPlayer(playerId: string) {
    return LLM_BRIDGE.methods.canUseLlmDecisionForPlayer.call(this, playerId)
  }

  getAiModelConfigForPlayer(playerId: string) {
    return LLM_BRIDGE.methods.getAiModelConfigForPlayer.call(this, playerId)
  }

  getAiIndexFromPlayerId(playerId: string) {
    return LLM_BRIDGE.methods.getAiIndexFromPlayerId.call(this, playerId)
  }

  buildAiDecisionUserPrompt(payload: LlmRoundPayload, extraBlocks: string[] = [], options: Record<string, unknown> = {}) {
    return LLM_BRIDGE.methods.buildAiDecisionUserPrompt.call(this, payload, extraBlocks, options)
  }

  extractAiDecisionObject(content: string) {
    return LLM_BRIDGE.methods.extractAiDecisionObject.call(this, content)
  }

  resolveActionPick(rawText: string, type: string, availableIds: string[]) {
    return LLM_BRIDGE.methods.resolveActionPick.call(this, rawText, type, availableIds)
  }

  normalizeAiLlmPlan(playerId: string, decision: LlmDecision, rawContent: string, options: Record<string, unknown> = {}) {
    return LLM_BRIDGE.methods.normalizeAiLlmPlan.call(this, playerId, decision, rawContent, options)
  }

  buildAiDecisionMessages(payload: LlmRoundPayload, options: Record<string, unknown> = {}) {
    return LLM_BRIDGE.methods.buildAiDecisionMessages.call(this, payload, options)
  }

  async requestAiLlmPlan(player: Player, options: Record<string, unknown> = {}) {
    return LLM_BRIDGE.methods.requestAiLlmPlan.call(this, player, options)
  }

  buildAiToolResultSummary(result: RevealResult, actionType: string, actionId: string) {
    return LLM_BRIDGE.methods.buildAiToolResultSummary.call(this, result, actionType, actionId)
  }

  async requestAiLlmFollowupBid(player: Player, currentPlan: LlmPlan, toolSummary: string) {
    return LLM_BRIDGE.methods.requestAiLlmFollowupBid.call(this, player, currentPlan, toolSummary)
  }

  async requestAiLlmErrorCorrection(player: Player, currentPlan: LlmPlan, errorInfo: LlmErrorInfo, correctionHistory: LlmDecision[], previousMessages: ConversationMessage[]) {
    return LLM_BRIDGE.methods.requestAiLlmErrorCorrection.call(
      this,
      player,
      currentPlan,
      errorInfo,
      correctionHistory,
      previousMessages
    )
  }

  async prepareAiLlmRoundPlans() {
    return LLM_BRIDGE.methods.prepareAiLlmRoundPlans.call(this)
  }

  captureAiDecisionTelemetry(roundBids: BidsPerPlayer[]) {
    return LLM_BRIDGE.methods.captureAiDecisionTelemetry.call(this, roundBids)
  }

  processAiDecisions() {
    return LLM_BRIDGE.methods.processAiDecisions.call(this)
  }

  toWorldPointFromRootEvent(event: MouseEvent): { x: number; y: number } | null {
    if (!this.dom.gameRoot) {
      return null
    }

    const rect = this.dom.gameRoot.getBoundingClientRect()
    const x = this.dom.gameRoot.scrollLeft + (event.clientX - rect.left)
    const y = this.dom.gameRoot.scrollTop + (event.clientY - rect.top)
    return { x, y }
  }

  markRoundRanking(sorted: BidsPerPlayer[]) {
    const firstId = sorted[0]?.playerId
    const secondId = sorted[1]?.playerId

    this.players.forEach((player) => {
      const cardEl = document.getElementById(`playerCard-${player.id}`)
      if (!cardEl) {
        return
      }

      cardEl.classList.remove("winner", "runner")
      if (player.id === firstId) {
        cardEl.classList.add("winner")
      } else if (player.id === secondId) {
        cardEl.classList.add("runner")
      }
    })
  }

  updateActionAvailability() {
    const lockedIntel =
      this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted || this.roundTimeLeft <= 0
    if (this.dom.itemOutlineBtn) {
      ; (this.dom.itemOutlineBtn as HTMLButtonElement).disabled = lockedIntel
    }
    if (this.dom.itemQualityBtn) {
      ; (this.dom.itemQualityBtn as HTMLButtonElement).disabled = lockedIntel
    }
    if (this.dom.itemDrawerToggleBtn) {
      ; (this.dom.itemDrawerToggleBtn as HTMLButtonElement).disabled = lockedIntel
      if (lockedIntel) {
        this.closeItemDrawer()
      }
    }

    const lockedBid = this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted
      ; (this.dom.skillBtn as HTMLButtonElement).disabled = lockedIntel
      ; (this.dom.bidInput as HTMLInputElement).disabled = lockedBid
    if (lockedBid) {
      this.closeBidKeypad()
    }

    ; (this.dom.nextRoundBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving || this.roundPaused
      ; (this.dom.settleBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving || this.roundPaused
    if (this.dom.pauseRoundBtn) {
      ; (this.dom.pauseRoundBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving
      if (this.isLanMode && !this.lanIsHost) {
        this.dom.pauseRoundBtn.style.display = "none"
      } else {
        this.dom.pauseRoundBtn.style.display = ""
      }
    }
    if (this.isLanMode) {
      this.dom.nextRoundBtn.style.display = "none"
      this.dom.settleBtn.style.display = "none"
    } else {
      this.dom.nextRoundBtn.style.display = ""
      this.dom.settleBtn.style.display = ""
    }
  }

  async revealAllArtifactsForSettlement() {
    return SETTLEMENT_BRIDGE.methods.revealAllArtifactsForSettlement.call(this)
  }

  isSettlementPageActive() {
    return SETTLEMENT_BRIDGE.methods.isSettlementPageActive.call(this)
  }

  async playSettlementRevealStep(item: any) {
    return SETTLEMENT_BRIDGE.methods.playSettlementRevealStep.call(this, item)
  }

  async playSettlementSearchEffect(item: any, runToken: any) {
    return SETTLEMENT_BRIDGE.methods.playSettlementSearchEffect.call(this, item, runToken)
  }

  enterSettlementPage(winnerPlayer: any, winnerBid: number, reasonText: string) {
    return SETTLEMENT_BRIDGE.methods.enterSettlementPage.call(this, winnerPlayer, winnerBid, reasonText)
  }

  exitSettlementPage() {
    return SETTLEMENT_BRIDGE.methods.exitSettlementPage.call(this)
  }

  cancelSettlementReveal() {
    return SETTLEMENT_BRIDGE.methods.cancelSettlementReveal.call(this)
  }

  setSettlementProgress(text: string, progress: number) {
    return SETTLEMENT_BRIDGE.methods.setSettlementProgress.call(this, text, progress)
  }

  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number) {
    return SETTLEMENT_BRIDGE.methods.updateSettlementPanelMetrics.call(this, revealedValue, winnerProfit)
  }

  showSelfProfit(selfProfit: number, label: string) {
    return SETTLEMENT_BRIDGE.methods.showSelfProfit.call(this, selfProfit, label)
  }

  playSettlementFinalEffect(winnerProfit: number) {
    return SETTLEMENT_BRIDGE.methods.playSettlementFinalEffect.call(this, winnerProfit)
  }

  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean) {
    return SETTLEMENT_BRIDGE.methods.triggerSettlementFinalAnimation.call(this, winnerProfit, isSelfWinner)
  }

  updateHud() {
    const skillState = this.skillManager.getSkillState()
    const itemState = this.itemManager.getItemState()

    const clueCount = this.items.filter((item) => this.hasAnyInfo(item)).length
    const occupiedCells = this.items.reduce((sum, item) => sum + item.w * item.h, 0)
    const capacity = _GRID_COLS * _GRID_ROWS
    const bidState = this.playerBidSubmitted ? `玩家本轮已出价: ${this.playerRoundBid}` : "玩家本轮未出价"
    const timerText = this.roundPaused ? `已暂停 ${this.roundTimeLeft}s` : `倒计时 ${this.roundTimeLeft}s`

    const hudRoundText = this._hudRoundText
    const hudTimerText = this._hudTimerText
    const hudMoneyText = this._hudMoneyText

    if (hudRoundText) hudRoundText.textContent = `第 ${this.round}/${_GAME_SETTINGS.maxRounds} 回合`
    if (hudTimerText) {
      if (!this._timerSpan) {
        this._timerSpan = document.createElement("span")
        this._timerSpan.className = "round-timer-hot"
        hudTimerText.appendChild(this._timerSpan)
      }
      this._timerSpan.textContent = timerText
      this._timerSpan.classList.toggle("is-danger", !this.roundPaused && this.roundTimeLeft <= 5)
    }

    // 倒计时 <= 5 秒时对计时器元素附加脉冲心跳效果
    if (window.MobaoAnimations && this._timerSpan) {
      const isDangerState = !this.roundPaused && this.roundTimeLeft <= 5
      if (isDangerState && !this._timerSpan.dataset.pulseActive) {
        this._timerSpan.dataset.pulseActive = "1"
        window.MobaoAnimations.pulse(this._timerSpan, "heart", { duration: 900 })
      } else if (!isDangerState && this._timerSpan.dataset.pulseActive) {
        delete this._timerSpan.dataset.pulseActive
        window.MobaoAnimations.stopPulse(this._timerSpan)
      }
    }

    // 倒计时 <= 5 秒且非暂停时，屏幕两侧边缘闪烁
    const isDanger = !this.roundPaused && this.roundTimeLeft <= 5
    const gameAreaEl = document.getElementById("gameArea")
    if (gameAreaEl) {
      if (isDanger && !this._edgeFlashActive) {
        gameAreaEl.classList.add("timer-edges-flash")
        this._edgeFlashActive = true
      } else if (!isDanger && this._edgeFlashActive) {
        gameAreaEl.classList.remove("timer-edges-flash")
        this._edgeFlashActive = false
      }
    }

    // 金钱数字滚动动画（仅在金额真正变化时触发，避免每秒重播）
    if (hudMoneyText && window.MobaoAnimations) {
      if (this._lastDisplayedMoney !== this.playerMoney) {
        this._lastDisplayedMoney = this.playerMoney
        window.MobaoAnimations.scrollToNumber(hudMoneyText, this.playerMoney, { duration: 350 })
      }
    } else if (hudMoneyText) {
      hudMoneyText.textContent = this.playerMoney.toLocaleString()
    }

    this.renderItemDrawer()
    this.updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState)
    this.updateActionAvailability()
  }

  makeRunToken() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`
  }

  hasAppliedMoneyForRun() {
    if (!this.moneySettledRunToken) {
      return false
    }
    const raw = window.localStorage.getItem("mobao_money_settled_run")
    return raw === this.moneySettledRunToken
  }

  markMoneyAppliedForRun() {
    if (!this.moneySettledRunToken) {
      return
    }
    window.localStorage.setItem("mobao_money_settled_run", this.moneySettledRunToken)
  }

  getLlmSettings() {
    const LLM_GLOBAL_SETTINGS_KEY = "mobao_llm_global_settings_v1"
    let globalSettings: Record<string, unknown> = {}
    try {
      const raw = window.localStorage.getItem(LLM_GLOBAL_SETTINGS_KEY)
      if (raw) {
        globalSettings = JSON.parse(raw)
      }
    } catch (_e) { }

    if (window.LlmManager) {
      const provider = window.LlmManager.getProvider()
      if (provider) {
        const providerSettings = provider.loadSettings()
        return { ...providerSettings, ...globalSettings }
      }
    }
    return { ...LLM_SETTINGS, ...globalSettings }
  }

  getLlmProvider() {
    if (window.LlmManager) {
      const provider = window.LlmManager.getProvider()
      if (provider) {
        console.log("[getLlmProvider] using LlmManager provider:", provider.id)
        return provider
      }
    }
    if (window.DeepSeekLLM) {
      console.log("[getLlmProvider] using DeepSeekProvider (fallback)")
      return {
        requestChat: (options) => window.DeepSeekProvider.requestChat(options),
        applySettings: (settings) => window.DeepSeekProvider.applySettings(settings)
      }
    }
    console.log("[getLlmProvider] NO provider available")
    return null
  }
}

Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseCoreMixin)
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehouseRevealMixin)
Object.assign(WarehouseScene.prototype, window.MobaoWarehouse.WarehousePreviewMixin)
Object.assign(WarehouseScene.prototype, window.MobaoAi.WalletMixin)
Object.assign(WarehouseScene.prototype, window.MobaoAi.IntelMixin)
Object.assign(WarehouseScene.prototype, window.MobaoAi.MemoryMixin)
Object.assign(WarehouseScene.prototype, window.MobaoAi.ReflectionMixin)
Object.assign(WarehouseScene.prototype, window.MobaoAi.DecisionMixin)
Object.assign(WarehouseScene.prototype, window.MobaoBidding.BiddingMixin)
Object.assign(WarehouseScene.prototype, window.MobaoUi.OverlayMixin)
Object.assign(WarehouseScene.prototype, window.MobaoUi.PanelsMixin)
Object.assign(WarehouseScene.prototype, window.MobaoUi.HistoryMixin)
Object.assign(WarehouseScene.prototype, window.MobaoLobby.IndexMixin)
Object.assign(WarehouseScene.prototype, window.MobaoLobby.CarouselMixin)
if (window.MobaoLobby && window.MobaoLobby.CharacterSelectMixin) {
  Object.assign(WarehouseScene.prototype, window.MobaoLobby.CharacterSelectMixin)
}
Object.assign(WarehouseScene.prototype, window.MobaoLan.IndexMixin)
Object.assign(WarehouseScene.prototype, window.MobaoRoundManager)
Object.assign(WarehouseScene.prototype, window.MobaoSkillItemManager)
Object.assign(WarehouseScene.prototype, window.MobaoSettlementManager)

const config = {
  type: (Phaser as any).AUTO,
  parent: "game-root",
  width: MARGIN * 2 + _GRID_COLS * CELL_SIZE,
  height: MARGIN * 2 + _GRID_ROWS * CELL_SIZE,
  backgroundColor: "transparent",
  transparent: true,
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  input: {
    touch: {
      capture: false
    }
  },
  scene: [WarehouseScene]
}

new (Phaser as any).Game(config)