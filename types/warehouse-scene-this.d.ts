/**
 * WarehouseSceneThis 接口
 * 
 * 定义所有 mixin 混入后的完整类型，用于 ThisType<WarehouseSceneThis> 声明。
 * 解决 TS2339: Property does not exist 错误（1015个）。
 */

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
  SkillContext,
} from "./game"
import type {
  BidContext,
  BidDecision,
  Personality,
  AiPrivateIntel,
  AiItemKnowledge,
  IntelSummary,
  ToolEffect,
  ActionCandidate,
  CrossGameMemory,
  ReflectionResult,
  ConversationMessage,
  ConversationBucketEntry,
} from "./ai"
import type {
  LlmBridge,
  LlmBridgeMethods,
  LlmDecision,
  LlmPlan,
  LlmPlanResult,
  LlmSettings,
  LlmRoundPayload,
  LlmTelemetry,
  LlmErrorInfo,
  AiModelConfig,
  LlmChatResult,
} from "./llm"
import type {
  Room,
  LanPlayer,
  BidsPerPlayer,
  BidWinner,
  BidSubmitMessage,
  RoomMessage,
} from "./lan"
import type { AiWalletManager } from "../scripts/game/ai/wallet-manager"
import type { HistoryManager } from "../scripts/game/ui/history-manager"
import type { AiDecisionManager } from "../scripts/game/ai/decision-manager"
import type { SkillItemManager } from "../scripts/game/core/skill-item-manager-class"
import type { PanelsManager } from "../scripts/game/ui/panels-manager"
import type { CarouselManager } from "../scripts/game/lobby/carousel-manager"
import type { SettlementManager } from "../scripts/game/core/settlement-manager-class"
import type { CharacterSelectManager } from "../scripts/game/lobby/character-select-manager"
import type { AiReflectionManager } from "../scripts/game/ai/reflection-manager"
import type { AiMemoryManager } from "../scripts/game/ai/memory-manager"
import type { WarehouseManager } from "../scripts/game/warehouse/warehouse-manager"
import type { AiIntelManager } from "../scripts/game/ai/intel-manager"
import type { UiOverlayManager } from "../scripts/game/ui/overlay-manager"
import type { LobbyIndexManager } from "../scripts/game/lobby/lobby-index-manager"
import type { RoundManager } from "../scripts/game/core/round-manager-class"
import type { BiddingManager } from "../scripts/game/bidding/bidding-manager"
import type { LanIndexManager } from "../scripts/game/lan/lan-index-manager"
import type { AutoPlayManager } from "../scripts/game/ai/autoplay-manager"
import type { GameState } from "../scripts/game/core/state/index"

export interface WarehouseSceneThis {
  // Phaser Scene
  textures: Phaser.TextureManager
  load: Phaser.LoaderPlugin
  add: Phaser.Scene["add"]
  time: Phaser.TimePlugin
  tweens: Phaser.TweenManager
  input: Phaser.InputPlugin
  scene: Phaser.Scene["scene"]
  scale: Phaser.Scale.ScaleManager
  game: Phaser.Game

  /** 状态管理（GameState 实例，包含所有 slice） */
  state: GameState

  // 核心属性（来自 WarehouseCoreMixin）
  gridLayer: Phaser.GameObjects.Graphics | null
  revealCellLayer: Phaser.GameObjects.Graphics | null
  itemLayer: Phaser.GameObjects.Container | null
  items: Artifact[]
  revealedCells: boolean[][]
  warehouseCellIndex: Record<string, string>
  round: number
  actionsLeft: number
  roundTimeLeft: number
  currentBid: number
  bidLeader: string | null
  secondHighestBid: number
  settled: boolean
  isSettlementRevealMode: boolean
  settlementRevealRunning: boolean
  settlementRevealSkipRequested: boolean
  selectedItem: Artifact | null
  warehouseTrueValue: number
  playerMoney: number
  players: Player[]
  aiPrivateIntel: Record<string, AiPrivateIntelPool>
  /** AI LLM 错误记录（动态添加，用于存储各玩家的 LLM 错误信息） */
  _aiLlmErrors: Record<string, { message: string; brief: string; detail: string; level: string; timestamp: number }>
  dom: {
    hudRound: HTMLElement | null
    hudTimer: HTMLElement | null
    hudMoney: HTMLElement | null
    aiThinkingIndicator: HTMLElement | null
    actionLog: HTMLElement | null
    aiThoughtContent: HTMLElement | null
    openSettingsBtn: HTMLElement | null
    rerollBtn: HTMLElement | null
    nextRoundBtn: HTMLElement | null
    pauseRoundBtn: HTMLElement | null
    aiLogicBtn: HTMLElement | null
    aiLogicOverlay: HTMLElement | null
    aiLogicPanel: HTMLElement | null
    aiLogicCloseBtn: HTMLElement | null
    aiLogicContent: HTMLElement | null
    aiViewMessagesBtn: HTMLElement | null
    battleRecordOverlay: HTMLElement | null
    battleRecordPanel: HTMLElement | null
    battleRecordCloseBtn: HTMLElement | null
    battleRecordContent: HTMLElement | null
    itemOutlineBtn: HTMLElement | null
    itemQualityBtn: HTMLElement | null
    itemDrawerToggleBtn: HTMLElement | null
    itemDrawer: HTMLElement | null
    itemDrawerCloseBtn: HTMLElement | null
    itemDrawerList: HTMLElement | null
    skillBtn: HTMLElement | null
    bidInput: HTMLInputElement | null
    settleBtn: HTMLElement | null
    gameRoot: HTMLElement | null
    gameConfirmOverlay: HTMLElement | null
    gameConfirmMsg: HTMLElement | null
    gameConfirmCancelBtn: HTMLElement | null
    gameConfirmOkBtn: HTMLElement | null
    infoPopupOverlay: HTMLElement | null
    infoPopupTitle: HTMLElement | null
    infoPopupCloseBtn: HTMLElement | null
    infoPopupContent: HTMLElement | null
    revealHintUp: HTMLElement | null
    revealHintDown: HTMLElement | null
    previewPopover: HTMLElement | null
    previewTitle: HTMLElement | null
    previewCloseBtn: HTMLElement | null
    previewFilterRow: HTMLElement | null
    previewCategorySelect: HTMLElement | null
    previewHint: HTMLElement | null
    previewList: HTMLElement | null
    settleOverlay: HTMLElement | null
    settleCard: HTMLElement | null
    settlementPage: HTMLElement | null
    settleWinnerName: HTMLElement | null
    settleWinnerBid: HTMLElement | null
    settleRevealedValue: HTMLElement | null
    settleWinnerProfit: HTMLElement | null
    settleSelfProfitRow: HTMLElement | null
    settleSelfProfit: HTMLElement | null
    keypadDirectHint: HTMLElement | null
    settleProgressText: HTMLElement | null
    settleProgressTrack: HTMLElement | null
    settleProgressFill: HTMLElement | null
    settleBackBtn: HTMLElement | null
    settleReplayBtn: HTMLElement | null
    settleReflectionStatus: HTMLElement | null
    settingsOverlay: HTMLElement | null
    settingsPanel: HTMLElement | null
    settingsScroll: HTMLElement | null
    settingsCloseBtn: HTMLElement | null
    settingsResetBtn: HTMLElement | null
    settingsSaveBtn: HTMLElement | null
    settingsReturnLobbyBtn: HTMLElement | null
    settingsStatusText: HTMLElement | null
    settingLlmEnabled: HTMLElement | null
    settingLlmMultiGameMemoryEnabled: HTMLElement | null
    settingDeepseekApiKey: HTMLElement | null
    settingDeepseekModel: HTMLElement | null
    settingMaxTokens: HTMLElement | null
    settingsTestDeepSeekBtn: HTMLElement | null
    settingsLlmStatusText: HTMLElement | null
    clearAiMemoryBtn: HTMLElement | null
    clearAiContextBtn: HTMLElement | null
    aiMemoryStatusText: HTMLElement | null
    viewAiMemoryBtn: HTMLElement | null
    exportAiMemoryBtn: HTMLElement | null
    importAiMemoryBtn: HTMLElement | null
    resetAiWalletBtn: HTMLElement | null
    aiMemoryOverlay: HTMLElement | null
    aiMemoryPanel: HTMLElement | null
    aiMemoryCloseBtn: HTMLElement | null
    aiMemoryContent: HTMLElement | null
    settingLlmFeedbackEnabled: HTMLElement | null
    viewAiFeedbackBtn: HTMLElement | null
    aiFeedbackOverlay: HTMLElement | null
    aiFeedbackPanel: HTMLElement | null
    aiFeedbackCloseBtn: HTMLElement | null
    aiFeedbackClearBtn: HTMLElement | null
    aiFeedbackContent: HTMLElement | null
    settingLlmReflectionEnabled: HTMLElement | null
    settingLlmThinkingEnabled: HTMLElement | null
    settingLlmIndependentModelEnabled: HTMLElement | null
    independentModelConfig: HTMLElement | null
    configIndependentModelBtn: HTMLElement | null
    aiModelConfigOverlay: HTMLElement | null
    aiModelConfigCloseBtn: HTMLElement | null
    aiModelConfigSaveBtn: HTMLElement | null
    bidKeypad: HTMLElement | null
    keypadCloseBtn: HTMLElement | null
    keypadScreen: HTMLElement | null
    personalPanelScroll: HTMLElement | null
    publicInfoScroll: HTMLElement | null
    [key: string]: HTMLElement | null
  }
  pendingRevealHintTargets: Artifact[] | null
  pendingRevealHintText: string
  pendingRevealHintSeenIds: Set<string> | null
  artifactManager: {
    getCandidatesByRevealState(state: Record<string, unknown>): Artifact[]
    getLibraryStats(): { total: number }
    createRandomArtifactForSlot(options: Record<string, unknown>): Artifact
    getSignalPriceStats(signals: AiIntelSignal[]): { aggregate: AiSignalStats; latest: AiSignalStats }
  }
  _mapCategoryWeights: Record<string, number> | null
  _mapQualityWeights: Record<string, number> | null
  previewAnchor: { x: number; y: number }
  roundPaused: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  playerRoundBid: number
  aiMaxBid: number
  previewOpenTick: number
  roundTimerId: number | null
  settlementRunToken: number | string | null
  activeSettlementSpinner: Phaser.GameObjects.GameObject | null
  moneySettledRunToken: string | null
  _lastDisplayedMoney: number | null
  deepSeekTesting: boolean

  // 管理器属性
  skillManager: {
    getSkillState(): Record<string, unknown>
    activateSkill(skillId: string): void
    deactivateSkill(skillId: string): void
    onNewRound(round?: number): void
    resetForNewRun(): void
    use(id: string, ctx: unknown): { ok: boolean; message: string }
  }
  itemManager: {
    getItemState(): Record<string, unknown>
    useItem(itemId: string): void
    items: Array<{ id: string; count?: number }>
    use(id: string, ctx: unknown): { ok: boolean; message: string }
  }
  // Phase 2: Manager 实例（依赖注入，替代 Mixin 隐式 this 依赖）
  walletManager: AiWalletManager
  historyManager: HistoryManager
  aiDecisionManager: AiDecisionManager
  skillItemManager: SkillItemManager
  panelsManager: PanelsManager
  carouselManager: CarouselManager
  settlementManager: SettlementManager
  characterSelectManager: CharacterSelectManager
  aiReflectionManager: AiReflectionManager
  aiMemoryManager: AiMemoryManager
  warehouseManager: WarehouseManager
  aiIntelManager: AiIntelManager
  uiOverlayManager: UiOverlayManager
  lobbyIndexManager: LobbyIndexManager
  roundManager: RoundManager
  biddingManager: BiddingManager
  lanIndexManager: LanIndexManager
  autoplayManager: AutoPlayManager
  // AI 属性（来自 AiWalletMixin）
  aiWallets: Record<string, number>
  aiLlmPlayerEnabled: Record<string, boolean>
  aiFoldState: Record<string, boolean>
  aiConversationByPlayer: Record<string, ConversationBucketEntry[]>
  aiCrossGameMemory: Record<string, CrossGameMemory>
  runLogHistory: unknown[]
  lastAiDecisionTelemetry: { mode: string; round: number; entries?: Array<Record<string, unknown>> } | null
  llmEverUsedThisRun: boolean
  aiReflectionState: string
  aiReflectionStateDetail: string
  aiReflectionTotal: number
  aiReflectionCompleted: number
  _reflectionBeforeUnload: (() => void) | null
  aiCrossGameMessagesByPlayer: Record<string, ConversationMessage[][]>
  aiReflectionPending: Record<string, unknown>
  runSerial: number
  currentRunLog: {
    runNo: number
    startedAt: number
    actionLogs: string[]
    aiThoughtLogs: unknown[]
    roundLogsByRound: Record<string, string[]>
    roundPanelTexts: Record<string, string>
  }
  aiConversationCache: Record<string, unknown>
  pendingNextRunAiSummaryByPlayer: Record<string, unknown>
  aiEngine: AuctionAiEngine | null
  pendingSettlementSummary: string | null
  _aiMemoryTouchBound: boolean

  // AI 属性（来自 AiIntelMixin）
  aiResourceState: Record<string, { skills: Record<string, number>; items: Record<string, number> }>
  aiRoundEffects: Record<string, unknown>
  lastAiIntelActions: Array<{ playerId: string; playerName: string; actionType: string; actionId: string; revealed: number; detail: string; score: number; effectTag: string; signalStats: AiSignalStats | null }>
  aiLlmRoundPlans: Record<string, LlmPlanResult | null>
  aiRoundDecisionPromise: Promise<void> | null
  highValuePriceThreshold: number | null
  aiCharacterAssignments: Record<string, { characterId: string; skillId: string; skillName: string; passive: PassiveEffect | null; characterName?: string }>
  aiErrorCorrectionHistory: Record<string, Array<{ error: string; aiResponse: string; at: number }>>

  // 联机属性（来自 LanIndexMixin）
  isLanMode: boolean
  lanBridge: LanBridge | null
  lanStatusEl: HTMLElement | null
  lanIsHost: boolean
  lanMySlotId: string | null
  lanRoom: Room | null
  lanPlayers: LanPlayer[]
  lanAiPlayers: (LanPlayer & { llm?: boolean })[]
  lanAiLlmEnabled: boolean
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanReconnecting: boolean
  lanLastServerUrl: string | null
  lanLastRoomCode: string | null
  lanLastPlayerId: string | null
  lanReconnectAttempts: number
  lanMaxReconnectAttempts: number
  lanHostWallets: Record<string, number>
  lanHostBids: Record<string, number>
  _activeSkillId: string | null
  _gameConfirmCallback: (() => void) | null
  _gameCancelCallback: (() => void) | null

  // 战绩属性
  battleRecords: Array<{
    id: string
    timestamp?: number
    finishedAt?: string | number
    round?: number
    mode?: string
    winnerId?: string
    winner: string
    winnerName?: string
    winnerBid: number
    totalValue: number
    winnerProfit?: number
    playerProfit?: number
    playerWon?: boolean
    itemCount: number
    roundCount?: number
    players: string[]
    reasonText?: string
    warehouse?: {
      cols?: number
      rows?: number
      items: Array<{
        name: string
        category: string
        qualityKey: string
        x: number
        y: number
        w: number
        h: number
        trueValue: number
      }>
      itemCount?: number
    }
    logs?: {
      aiDecisionPanelText?: string
      runNo?: number | null
      aiThoughtLogs?: unknown[]
      roundLogsByRound?: Record<string, unknown>
      roundPanelTexts?: Record<string, string>
    } | null
    logsRound?: number
    dividendTicketInfo?: {
      mechanism?: string
      dividendPerPlayer: number
      ticketPerPlayer: number
    } | null
  }>
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: {
    round?: number
    bids?: Record<string, number>
    winner?: string
    winnerBid?: number
    page?: number
    recordId?: string
  } | null

  // 结算属性（来自 SettlementManagerMixin）
  settlementSession: {
    runToken?: number | string
    phase?: string
    winnerId?: string
    winnerName?: string
    winnerPlayer?: Player
    winnerBid?: number
    reasonText?: string
    revealedItems?: Artifact[]
    totalValue?: number
    winnerProfit?: number
    selfProfit?: number
  } | null

  // UI 属性
  privateIntelEntries: Array<{
    playerId: string
    intel: unknown
  }>
  publicInfoEntries: Array<{
    source: string
    text: string
  }>
  currentPublicEvent: {
    category: string
    id: string
    text: string
  } | null
  playerRoundHistory: Record<string, Array<{ round: number; bid: number }>>
  playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>
  currentRoundUsage: Record<string, string[]>
  playerHistoryPanels: Record<string, HTMLElement | null>
  aiThoughtLogs: Array<{
    playerId: string
    thought: string
    timestamp: number
  }>
  settlementPreRevealed: boolean

  // AI 决策属性
  _aiDecisionSummaryWaiting: boolean

  // Lobby 属性（来自 CharacterSelectMixin）
  _carryItems: CarryItem[]
  _MAX_CARRY_ITEMS: number
  _carryPickerEl: HTMLElement | null
  _autoReplenish: boolean
  _live2dVideoState: {
    running: boolean
    rafId: number | null
    loadTimeout: ReturnType<typeof setTimeout> | null
  } | null
  characterPageEl: HTMLElement | null
  selectedCharacter: Character | null
  keypadValue: string
  _pauseSnapshotTimeLeft: number | null
  _loadingLock: boolean
  _carryConfirmCleanup: (() => void) | null
  roundBidReadyState: Record<string, boolean>

  // HUD 属性
  _hudRoundText: HTMLElement | null
  _hudTimerText: HTMLElement | null
  _hudMoneyText: HTMLElement | null
  _timerSpan: HTMLElement | null
  _edgeFlashActive: boolean

  // 游戏设置
  _GAME_SETTINGS: GameSettings

  // 核心方法（来自 WarehouseCoreMixin）
  preloadArtifactImages(): void
  startNewRun(): void
  startRound(): void
  resolveRoundBids(reason?: string, forceSettle?: boolean): Promise<void>
  handleBidSubmit(): void
  settleCurrentRun(): void
  renderItemDrawer(): void
  closeItemDrawer(): void
  isSettlementPageActive(): boolean
  positionPreview(x: number, y: number): void
  repositionPreview(): void
  drawGridLines(): void

  // 仓库方法（来自 WarehouseCoreMixin）
  findFirstEmptySlot(occupancy: boolean[][]): { col: number; row: number } | null
  placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]): void
  renderItem(item: Artifact): void
  isInBoundsCell(x: number, y: number): boolean
  onArtifactClicked(item: Artifact, pointer: { x: number; y: number }): void
  renderSettlementItemPreview(item: Artifact): void
  getItemKnownText(item: Artifact): string

  // 揭示方法（来自 WarehouseRevealMixin）
  pickRevealTargets(opts: { mode: string; count: number; category: string | null; allowCategoryFallback: boolean; sortStrategy: string | null }): Artifact[]
  revealOutline(item: Artifact, options?: Record<string, unknown>): void
  showRevealScrollHintsForTargets(targets: Artifact[], message: string): void
  pickBottomCellFromTargets(targets: Artifact[]): { x: number; y: number; col: number; row: number } | null
  revealQualityCell(item: Artifact, options?: Record<string, unknown>): void
  revealCell(x: number, y: number): void
  renderQualityVisual(item: Artifact, options?: Record<string, unknown>): void
  playFullRevealEffect(item: Artifact): void
  revealArtifactFully(item: Artifact, options?: Record<string, unknown>): { ok: boolean; item?: Artifact; message: string }
  playOutlineRevealEffect(item: Artifact): void
  syncQualityMarkersForOutlinedItem(item: Artifact, options?: Record<string, unknown>): void
  playQualityRevealEffect(item: Artifact): void
  clearQualityVisual(item: Artifact, keepImage?: boolean): void

  // 预览方法（来自 WarehousePreviewMixin）
  applyPreviewPosition(): void

  // 音效方法
  playSfx(key: string): void
  playMusic(key: string): void
  stopMusic(): void

  // UI 方法
  updateHud(): void
  updateActionAvailability(): void
  updateSidePanels(skillState: Record<string, unknown>, itemState: Record<string, unknown>, clueCount: number, occupiedCells: number, capacity: number, bidState: string): void
  hidePreview(): void
  hideRevealScrollHints(): void
  hideSettleOverlay(): void
  refreshRevealScrollHints(): void
  hasAnyInfo(item: Artifact): boolean
  renderPreviewCandidates(item: Artifact): void
  setupPreviewTouchScroll(): void
  isPointOnSettlementLockedItem(x: number, y: number): boolean
  showGameConfirm(msg: string, onOk: () => void, onCancel?: () => void): void
  showItemDetailPopup(itemId: string, label: string, x: number, y: number): void
  showInfoPopup(title: string, scrollEl: HTMLElement | null): void
  openBidKeypad(): void
  closeBidKeypad(): void

  setAiWallet(id: string, value: number): void

  // AI 方法（来自 AiIntelMixin）
  updateAiIntel(playerId: string, intel: AiPrivateIntelPool): void
  getAiIntel(playerId: string): AiPrivateIntelPool | undefined
  summarizeIntel(playerId: string): IntelSummary
      revealOutlineBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null): unknown
  revealQualityBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null): unknown
  revealArtifactFullyBatch(options: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }): unknown
                        isWarehouseCellOccupied(x: number, y: number): boolean
      updatePlayerAvatar(playerId: string, avatarEl: HTMLElement): void
                        getActionDefById(actionId: string): ActionDef

  // AI 方法（来自 AiMemoryMixin）
  pushAiMemory(playerId: string, memory: CrossGameMemory): void
  getAiMemory(playerId: string): CrossGameMemory[]
                clearAiMemory(playerId: string): void

  // AI 方法（来自 AiDecisionMixin）
  makeAiDecision(playerId: string): BidDecision
  shouldAiFold(playerId: string): boolean

  // 出价方法（来自 BiddingMixin）
  submitBid(playerId: string, bid: number): void
  getHighestBid(): { playerId: string; bid: number } | null
  clearBids(): void

  // 联机方法（来自 LanIndexMixin）
  bindLanEvents(bridge: LanBridge, ctx: Record<string, unknown>): void
  lanStartGame(): void
  lanBroadcastBid(bid: number): void
  lanHandleBidSubmit(msg: BidSubmitMessage): void
  lanSyncState(): void
  setOnlineStatus(text: string, status: string): void
  setPlayerBidReady(slotId: string, ready: boolean): void
  updateLobbyMoneyDisplay(): void
  areAllPlayersBidReady(): boolean
  tryAutoReconnect(savedPlayerId: string | null, savedRoomCode: string | null, savedPlayerName: string | null, savedIsHost: boolean): void
  addPublicInfoEntry(entry: unknown): void
  refreshPlayerHistoryUI(): void
  syncPauseButton(): void
  hideLanPauseOverlay(): void
  showLanPauseOverlay(): void
  showLanRestartVoteDialog(hostName: string): void
  showLanRestartDeclinedDialog(declinerName: string): void
  removeLanRestartDialog(): void
  enterLanRoom(): void
  exitLanRoom(): void
  onLanForeground(): void
  lanBuildFullSyncData(targetPlayerId: string): unknown
  lanRestoreWarehouseFromSync(syncData: unknown): void
  lanResolveRound(reason: string): void
  lanComputeAiBids(): Record<string, number>
  lanOnRoundStart(msg: { round: number; currentBid?: number; ts?: number; roundSeconds?: number }): void
  lanBroadcastRoundStart(): void
  startLanRun(): void
  lanOnAllBidsIn(msg: unknown): Promise<void>
  lanOnRoundTimeout(): Promise<void>
  lanOnRoundResult(msg: { bids?: Array<{ playerId: string; bid: number }> }): void
  lanDoFinishAuction(winner: { playerId: string; bid: number }, mode: string): void
  lanOnSettle(msg: unknown): void
  lanOnSettleFinal(msg: unknown): void
  lanOnRestartGo(msg: RoomMessage): void
  lanOnFullSync(syncData: unknown): void
  lanAttemptReconnect(): void
  startLanLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement): void
  stopLanLive2dLoop(): void
  toggleLanPause(pause: boolean): void

  // 结算方法（来自 SettlementManagerMixin）
  enterSettlementPage(winnerPlayer: Player, winnerBid: number, reasonText: string): void
  exitSettlementPage(): void
  cancelSettlementReveal(): void
  setSettlementProgress(text: string, progress?: number): void
  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number): void
  showSelfProfit(selfProfit: number, label: string): void
  playSettlementFinalEffect(winnerProfit: number): void
  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean): void
  revealAllArtifactsForSettlement(): Promise<void>
  playSettlementRevealStep(item: Artifact): Promise<void>
  playSettlementSearchEffect(item: Artifact, runToken: unknown): Promise<void>

  // 回合管理方法（来自 RoundManagerMixin）
  startRoundTimer(): void
  stopRoundTimer(): void
  resumeRoundTimer(): void
  pauseRoundTimer(): void
  resetRoundTimer(): void
  resetRoundBidDisplay(): void
  resetRoundBidReadyState(): void
  clearCurrentRoundUsage(): void
    kickoffAiRoundDecisions(): void

  // 技能道具方法（来自 SkillItemManagerMixin）
  syncItemManagerFromShop(): void
  getSkillInfo(skillId: string): SkillDef | null
  getItemInfo(itemId: string): { label: string; tip: string }
  activateSkill(skillId: string): void
  deactivateSkill(skillId: string): void
  useItem(itemId: string): void
  useSkill(skillId: string): void
  processAiDecisions(): void
  consumeAction(actionType: string): boolean
      addPrivateIntelEntry(entry: { source: string; text: string }): void

  // LLM 方法（来自 LlmDecisionMixin）
  getLlmSettings(): LlmSettings
  canUseLlmDecisionForPlayer(playerId: string): boolean
    hasAppliedMoneyForRun(): boolean
  markMoneyAppliedForRun(): void

  // 战绩方法（来自 HistoryMixin）
  saveBattleRecord(record: unknown): void
  loadBattleRecords(): unknown[]
  clearBattleRecords(): void

  // 其他方法
  exitLobby(): void
  renderCollectionGrid(): void
  renderCarryItems(): void
  showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number): void
  positionPlayerInfoPopover(x: number, y: number): void
  hideInfoPopup(): void
  updateKeypadDirectHint(): void
  waitUntilResumed(): Promise<void>
  extractAiDecisionObject(response: string): { bid?: number | string; skill?: string; item?: string; thought?: string } | null
  finishAuction(winner: { playerId: string; bid: number }, mode: string): void
  recordPlayerUsage(playerId: string, actionId: string): void
    syncBidKeypadScreen(): void
  _stopLive2dLoop(): void
  closeSettingsOverlay(keepStatus?: boolean, keepInitial?: boolean): void
    _rebuildCustomSelect(el: HTMLSelectElement): void
  closeCarryItemPicker(): void
  recordRoundHistory(roundBids: Array<{ playerId: string; bid: number }>): void
  renderQualityVisual(item: Artifact, options?: Record<string, unknown>): void
  _handleCardKeydown(event: KeyboardEvent): void
  requestAiLlmFollowupBid(player: Player, currentPlan: LlmPlanResult | null, toolSummary: string): Promise<LlmPlanResult | null>
  revealRoundBidsSequential(bids?: unknown[]): Promise<void>
  
  // 联机同步方法（来自 LanSyncMixin）
  buildWarehouseSnapshotForSync(): unknown
  initPlayersUI(): void
  rebuildWarehouseCellIndex(): void
  refreshRevealScrollHints(): void
  renderPublicInfoPanel(): void

  // 游戏流程方法（来自 LanGameFlowMixin）
  captureAiDecisionTelemetry(bids: unknown[]): void
  renderAiLogicPanel(): void
  resetPlayerHistoryState(): void
  getLastRoundBidMap(): Record<string, number>
  resetForNewRun(): void
  applyCharacterToPlayer(): void
  spawnRandomItems(): void
  setupWarehouseAuction(): void
  drawUnknownWarehouse(): void
  guardWarehouseCapacity(): void
  cleanupGameScene(): void

  // AI 初始化方法
      buildAIBids(): unknown

  // AI 决策方法（来自 LlmDecision）
  renderAiLogicPanelForLlm(telemetry: unknown): string
  loadAiModelConfigs(): Record<string, string>
  saveAiModelConfigs(configs: unknown): void
  closeAiModelConfigOverlay(): void
  renderAiModelConfigContent(): void
  canUseLlmDecision(): boolean
  isAiLlmEnabledForPlayer(playerId: string): boolean
  getAiModelConfigForPlayer(playerId: string): AiModelConfig | null
  getAiIndexFromPlayerId(playerId: string): number
  buildAiLlmRoundPayload(player: unknown): unknown
  buildAiIncrementalPayload(player: unknown): unknown
  buildAiFollowupRoundPayload(player: unknown, plan: unknown, summary: string): unknown
  buildAiDecisionUserPrompt(payload: unknown, blocks?: string[], options?: { requestStage?: string; isFirstRound?: boolean }): string
  buildAiDecisionMessages(payload: unknown, options?: { requestStage?: string; isFirstRound?: boolean; systemPrompt?: string; historyMessages?: unknown[]; extraBlocks?: unknown[] }): unknown[]
  normalizeAiLlmPlan(playerId: string, decision: unknown, raw: string, options?: { allowAction?: boolean }): LlmPlanResult
  requestAiLlmPlan(player: unknown, options?: Record<string, unknown>): Promise<LlmPlanResult | null>
  buildAiToolResultSummary(result: unknown, actionType: string, actionId: string): string
  requestAiLlmFollowupBid(player: Player, plan: LlmPlan, summary: string): Promise<LlmPlanResult | null>
  requestAiLlmErrorCorrection(player: Player, plan: LlmPlan, error: string, history: Array<{ error: string; aiResponse: string; at: number }>, messages: ConversationMessage[]): Promise<LlmPlanResult | null>
  prepareAiLlmRoundPlans(): void
  processAiDecisions(): void
      buildBidHistorySnapshot(): Array<{ round: number; bids: Record<string, number>; highestBidder: string | null }>
  buildPublicEventSnapshot(opts: { compact: boolean; viewerId: string }): unknown[]
  buildOtherPlayersPublicInfo(id: string, opts: { compact: boolean }): unknown
  buildCatalogSummary(opts: { compact: boolean }): unknown
  buildRoundPublicStateTable(id: string): unknown
    resolveActionPick(text: string, type: string, ids: string[]): { actionId: string | null; target: string }
  requestChat(messages: unknown[], options?: unknown): Promise<unknown>
  getAiModelConfig(aiIndex?: number): AiModelConfig | null
        
  // AI 情报方法
    buildToolEffect(args: { playerId: string; actionType: string; actionId: string; roundProgress: number; intelSummary: IntelSummary; signalStats: AiSignalStats | null; planScore: number }): ToolEffect
    planIntelAction(args: { playerId: string; round: number; maxRounds: number; intelSummary: IntelSummary; resources: { skills: Record<string, number>; items: Record<string, number> } }): IntelActionPlan
    getItemInfo(itemId: string): unknown

  // AI 记忆方法
              updateReflectionStatusUI(): void

  // 大厅方法（来自 LobbyIndexMixin）
  showLobbyMain(skipAnimation?: boolean): void
  showLobbySubPage(page: string): void
  openSettingsOverlay(): void
  openCollectionOverlay(): void
  openBattleRecordPanel(): void
  openShopOverlay(): void
  goToCharacterSelect(): void
  showCharacterSelectPageWithMap(): void
  showCharacterSelectPage(mapProfile: { name?: string; params?: Record<string, unknown> } | null): void
  hideAllLobbySubPages(): void
  startSoloGame(): void
  carouselScroll(dir: number): void
  bindCarouselTouch(): void
  updateCarouselPosition(): void
  renderCarousel(): void
  renderMapDetail(): void
  initLanLobby(): void
  initPlayersUI(): void
  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement | null): void
  isAiLlmEnabledForPlayer(playerId: string): boolean
  refreshPlayerHistoryUI(): void
  updatePlayerCharNames(): void
  bindLobbyEvents(): void
  applyMapProfile(profileId?: string): void
  closeCollectionOverlay(): void
  initCollectionPanel(): void
  getCollectionCategories(): string[]
    hidePlayerInfoPopover(): void
  hideInfoPopup(): void
  _carouselOffset: number

  // 角色选择方法
  renderSelectedCharacterPreview(): void
  confirmCharacterSelection(): void
  initCharacterSelect(): void
  renderCharacterList(): void
  bindCharacterSelectEvents(): void
  selectCharacter(id: string): void
  _showCarryConfirm(message: string, onConfirm: (() => void) | null, confirmText?: string): void
  _saveCarryItems(): void
  _loadCarryItems(): void
  openCarryItemPicker(): void
  removeCarryItem(itemId: string): void
  executeReplenish(): { ok: boolean; message: string; newMoney?: number; need?: number; have?: number }
  calcReplenishCost(): ReplenishCostResult
  _bindAutoReplenishToggle(): void
  _saveAutoReplenish(): void
  _loadAutoReplenish(): void
  _destroyCustomSelect(el: HTMLSelectElement): void
  _cardGlowHandler(item: unknown): void
  bindCardGlowEffect(): void
  _startLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement): void
  _doStartSoloGame(): void
  _lastRevealedValue: number
  _lastDisplayProfit: number
  updateCharacterMoneyDisplay(): void
  updateKeypadDirectHint(): void

  // 战绩方法
  closeBattleRecordPanel(): void
  renderBattleRecordPanel(): void
  renderBattleRecordSummary(): void
  renderBattleRecordLogView(record?: unknown): void
  getLastDecisionLog(round: number): unknown
  restoreWarehouseFromBattleRecord(record: unknown): void
  buildWarehouseSnapshotForRecord(): unknown
  openBattleRecordPanel(): void

  // 商店方法
  _showCarryConfirm(message: string, onConfirm: (() => void) | null, confirmText?: string): void
  _saveCarryItems(): void
  _loadCarryItems(): void
  openCarryItemPicker(): void
  removeCarryItem(itemId: string): void
  executeReplenish(): { ok: boolean; message: string; newMoney?: number; need?: number; have?: number }
  calcReplenishCost(): ReplenishCostResult
  _bindAutoReplenishToggle(): void
  _saveAutoReplenish(): void
  _loadAutoReplenish(): void

  // 竞价方法（来自 BiddingMixin）
  markRoundRanking(bids: unknown[]): void
  buildRoundBids(): Array<{ playerId: string; bid: number }>
  setPlayerBidDisplay(playerId: string, bid: number, order?: number): void
  setPlayerBidReady(slotId: string, ready: boolean): void

  // 仓库方法（来自 WarehouseCoreMixin）
      cleanupGameScene(): void

  // 结算方法
  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number): void
  playSettlementFinalEffect(winnerProfit: number): void
  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean): void

  // 音频方法
  playSfx(key: string): void
  playMusic(key: string): void
  stopMusic(): void
  // 设置相关属性
  settingsInputId(field: string): string
  AI_MODEL_CONFIGS_STORAGE_KEY: string
  _settingsInitialValues: string | null

  // 设置相关方法
  fillSettingsForm(settings: Record<string, any>): void
  fillLlmSettingsForm(settings: Record<string, any>): void
  setSettingsStatus(text: string, saved: boolean): void
  readSettingsForm(): Record<string, any>
  readLlmSettingsForm(): Record<string, any>
  saveSettingsFromOverlay(): void
  setLlmSettingsStatus(text: string, state: string): void
    toggleRoundPause(): void
  renderAiThoughtLog(): void

  // 出价相关属性
  playerBid(): void

  // 场景初始化方法（来自 scene-init.ts）
  create(): void
  initAudio(): void
  cacheDom(): void
  initAnimations(): void
  bindDomEvents(): void
  initPreviewFilterOptions(): void

  // 场景工具方法（来自 scene-utils.ts）
  scrollElementByWheel(element: HTMLElement | null, deltaY: number): boolean
  toWorldPointFromRootEvent(event: MouseEvent): { x: number; y: number } | null
  markRoundRanking(sorted: BidsPerPlayer[]): void
  makeRunToken(): string
  getActionDefById(actionId: string): unknown
  buildBidHistorySnapshot(): Array<{ round: number; bids: Record<string, number>; highestBidder: string | null }>
  buildPublicEventSnapshot(options?: Record<string, unknown>): unknown
  buildRoundPublicStateTable(viewerId: string): unknown
  buildQualityPriceRangeTableCompact(): unknown
  buildCatalogSummary(options?: Record<string, unknown>): unknown
  buildQualityPriceGuide(options?: Record<string, unknown>): unknown
  buildOtherPlayersPublicInfo(viewerId: string, options?: Record<string, unknown>): unknown

  // 场景 AI 面板方法（来自 scene-ai-panel.ts）
  renderAiLogicPanel(): void
  renderAiLogicPanelForLlm(telemetry: { mode: string; round: number; entries: LlmTelemetry[] }): void
  showAiConversationMessages(): void
  buildAiLlmRoundPayload(player: Player): unknown
  buildAiFollowupRoundPayload(player: Player, currentPlan: LlmPlan, toolSummary: string): unknown
  buildAiIncrementalPayload(player: Player): unknown
  canUseLlmDecision(): boolean
  getAiModelConfigForPlayer(playerId: string): unknown
  getAiIndexFromPlayerId(playerId: string): number
  buildAiDecisionUserPrompt(payload: LlmRoundPayload, extraBlocks: string[], options: Record<string, unknown>): string
  resolveActionPick(rawText: string, type: "skill" | "item", availableIds: string[]): unknown
  normalizeAiLlmPlan(playerId: string, decision: LlmDecision, rawContent: string, options: Record<string, unknown>): LlmPlan
  buildAiDecisionMessages(payload: LlmRoundPayload, options: Record<string, unknown>): ConversationMessage[]
  requestAiLlmPlan(player: Player, options: Record<string, unknown>): Promise<LlmPlan | null>
  buildAiToolResultSummary(result: RevealResult, actionType: string, actionId: string): string
  requestAiLlmErrorCorrection(player: Player, currentPlan: LlmPlan, errorInfo: LlmErrorInfo, correctionHistory: LlmDecision[], previousMessages: ConversationMessage[]): Promise<LlmPlan | null>
  prepareAiLlmRoundPlans(): Promise<void>
  captureAiDecisionTelemetry(roundBids: BidsPerPlayer[]): void
  processAiDecisions(): void

  // 场景战绩记录方法（来自 scene-battle-record.ts）
  closeBattleRecordPanel(): void
  buildWarehouseSnapshotForRecord(): unknown
  saveBattleRecord(result: { won: boolean; profit: number; bidAmount: number; trueValue: number; round: number }): void
  renderBattleRecordPanel(): void
  openBattleRecordReplay(recordId: string): void
  openBattleRecordLogs(recordId: string, page?: number): void
  closeBattleRecordLogs(): void
  deleteBattleRecord(recordId: string): void

  // 场景结算方法（来自 scene-settlement.ts）
  revealAllArtifactsForSettlement(): Promise<void>
  playSettlementRevealStep(item: unknown): Promise<void>
  playSettlementSearchEffect(item: unknown, runToken: unknown): Promise<void>
  enterSettlementPage(winnerPlayer: unknown, winnerBid: number, reasonText: string): void
  exitSettlementPage(): void
  cancelSettlementReveal(): void
  setSettlementProgress(text: string, progress: number): void
  showSelfProfit(selfProfit: number, label: string): void

  // UI 方法（补充）
  enterLobby(): void
  enterLanRoom(): void
  onLanBackground(): void
  onLanForeground(): void
  openSettingsOverlay(): void
  isSettingsOverlayOpen(): boolean
  openShopOverlay(): void
  openAiLogicPanel(): void
  closeAiLogicPanel(): void
      openAiFeedbackPanel(): void
  closeAiFeedbackPanel(): void
  clearAllAiFeedbacks(): void
  removeAiFeedback(id: string): void
  openAiModelConfigOverlay(): void
  closeAiModelConfigOverlay(): void
  saveAiModelConfigFromForm(): void
  hideGameConfirm(): void
  showCharacterInfoPopup(playerId: string, x: number, y: number): void
  showLanRestartWaitingDialog(): void
  showReflectionPendingDialog(): void
  showReflectionPendingDialogForBack(): void
  toggleItemDrawer(): void
  handleBidKeyInput(key: string): void
  useItem(itemId: string): void
  useSkill(skillId: string): void
  stopRoundTimer(): void
  applyCharacterToPlayer(): void
  bindCharacterSkillButton(): void
  refreshSkillButtonLabel(): void

  // AI 记忆方法
      showAiMemoryExportDialog(): void
  removeAiMemoryExportDialog(): void
  showAiMemoryImportDialog(): void
  removeAiMemoryImportDialog(): void
  downloadAiMemoryFallback(jsonData: string, fileName: string): void

  // LLM Provider 方法
  getLlmProvider(): {
    id: string
    name: string
    apiKey?: string
    endpoint?: string
    model?: string
    requestChat?(options: unknown): Promise<LlmChatResult>
    saveSettings?(settings: Record<string, unknown>): void
    applySettings?(settings: Record<string, unknown>): void
    defaultSettings?(): Record<string, unknown>
  } | null

  // 仓库方法（补充）
  guardWarehouseCapacity(): void
  syncItemManagerFromShop(): void
  drawUnknownWarehouse(): void
  spawnRandomItems(): void
  setupWarehouseAuction(): void
    resetPlayerHistoryState(): void
      getItemInfo(itemId: string): ItemDef | null
}