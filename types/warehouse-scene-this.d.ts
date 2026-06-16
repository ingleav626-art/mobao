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
} from "./game"
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
} from "./ai"
import type {
  LlmBridge,
  LlmBridgeMethods,
  LlmDecision,
  LlmPlan,
  LlmSettings,
  LlmRoundPayload,
  LlmTelemetry,
  LlmErrorInfo,
} from "./llm"
import type {
  Room,
  LanPlayer,
  BidsPerPlayer,
  BidWinner,
  BidSubmitMessage,
  RoomMessage,
} from "./lan"

export interface WarehouseSceneThis {
  // Phaser Scene
  textures: Phaser.TextureManager
  load: Phaser.LoaderPlugin
  add: Phaser.Scene["add"]
  time: Phaser.TimePlugin
  tweens: Phaser.TweenManager
  input: Phaser.InputPlugin
  scene: Phaser.Scene["scene"]

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
  aiPrivateIntel: Record<string, AiPrivateIntel>
  dom: Record<string, HTMLElement | null>
  pendingRevealHintTargets: Artifact[] | null
  pendingRevealHintText: string
  pendingRevealHintSeenIds: Set<string> | null
  artifactManager: {
    getCandidatesByRevealState(state: Record<string, unknown>): Artifact[]
    getLibraryStats(): { total: number }
    createRandomArtifactForSlot(options: Record<string, unknown>): Artifact
    getSignalPriceStats(signals: unknown[]): { aggregate: unknown; latest: unknown }
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
  settlementRunToken: number
  activeSettlementSpinner: unknown
  moneySettledRunToken: number | null
  _lastDisplayedMoney: number | null
  playerRoundHistory: Record<string, unknown>
  playerUsageHistory: Record<string, unknown>
  currentRoundUsage: Record<string, unknown>
  playerHistoryPanels: Record<string, unknown>
  deepSeekTesting: boolean

  // 管理器属性
  skillManager: {
    getSkillState(): Record<string, unknown>
    activateSkill(skillId: string): void
    deactivateSkill(skillId: string): void
  }
  itemManager: {
    getItemState(): Record<string, unknown>
    useItem(itemId: string): void
  }
  aiEngine: {
    think(): void
    decide(): void
  }

  // AI 属性（来自 AiWalletMixin）
  aiWallets: Record<string, number>
  aiLlmPlayerEnabled: boolean
  aiFoldState: Record<string, boolean>
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: CrossGameMemory[]
  runLogHistory: unknown[]
  lastAiDecisionTelemetry: unknown
  llmEverUsedThisRun: boolean
  aiReflectionState: string
  aiReflectionTotal: number
  aiReflectionCompleted: number
  _reflectionBeforeUnload: (() => void) | null
  aiCrossGameMessagesByPlayer: Record<string, ConversationMessage[]>
  aiReflectionPending: Record<string, unknown>
  runSerial: number
  currentRunLog: unknown
  aiConversationCache: Record<string, unknown>
  pendingNextRunAiSummaryByPlayer: Record<string, unknown>
  aiEngine: AuctionAiEngine | null
  aiLlmRoundPlans: Record<string, LlmPlan | null>
  aiRoundDecisionPromise: Promise<void> | null
  lastAiIntelActions: Record<string, unknown>
  isAiMultiGameMemoryEnabled: boolean

  // AI 属性（来自 AiIntelMixin）
  aiResourceState: Record<string, { skills: Record<string, number>; items: Record<string, number> }>
  aiRoundEffects: unknown
  lastAiIntelActions: unknown[]
  aiLlmRoundPlans: unknown
  highValuePriceThreshold: number | null
  aiCharacterAssignments: Record<string, { characterId: string; skillId: string; skillName: string; passive: boolean; characterName?: string }>
  aiErrorCorrectionHistory: unknown[]

  // 联机属性（来自 LanIndexMixin）
  isLanMode: boolean
  lanBridge: LanBridge | null
  lanIsHost: boolean
  lanMySlotId: string | null
  lanRoom: Room | null
  lanPlayers: LanPlayer[]
  lanAiPlayers: unknown[]
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
  battleRecords: unknown[]
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: unknown

  // 结算属性（来自 SettlementManagerMixin）
  settlementSession: {
    runToken: number | string
    phase: string
    winnerPlayer?: Player
    winnerBid?: number
    reasonText?: string
    revealedItems?: Artifact[]
    totalValue?: number
    winnerProfit?: number
    selfProfit?: number
  } | null
  settlementRunToken: number | string | null
  activeSettlementSpinner: HTMLElement | null
  isSettlementRevealMode: boolean
  settlementRevealSkipRequested: boolean
  settlementRevealRunning: boolean

  // UI 属性
  privateIntelEntries: unknown[]
  publicInfoEntries: unknown[]
  currentPublicEvent: unknown

  // Lobby 属性（来自 CharacterSelectMixin）
  _carryItems: CarryItem[]
  _MAX_CARRY_ITEMS: number
  _carryPickerEl: HTMLElement | null
  _autoReplenish: boolean
  _live2dVideoState: boolean
  characterPageEl: HTMLElement | null
  selectedCharacter: string | null
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
  resolveRoundBids(reason: string): void
  handleBidSubmit(): void
  settleCurrentRun(): void
  renderItemDrawer(): void
  closeItemDrawer(): void
  isSettlementPageActive(): boolean
  positionPreview(x: number, y: number): void
  repositionPreview(): void
  drawGridLines(): void

  // 仓库方法（来自 WarehouseCoreMixin）
  findFirstEmptySlot(w: number, h: number): { x: number; y: number } | null
  placeItem(item: Artifact, x: number, y: number): void
  renderItem(item: Artifact): void
  isInBoundsCell(x: number, y: number): boolean
  onArtifactClicked(item: Artifact): void
  renderSettlementItemPreview(item: Artifact): void
  getItemKnownText(item: Artifact): string

  // 揭示方法（来自 WarehouseRevealMixin）
  pickRevealTargets(item: Artifact, count: number): Artifact[]
  revealOutline(item: Artifact): void
  showRevealScrollHintsForTargets(targets: Artifact[]): void
  pickBottomCellFromTargets(targets: Artifact[]): { x: number; y: number } | null
  revealQualityCell(item: Artifact, cell: { x: number; y: number }): void
  revealCell(x: number, y: number): void
  renderQualityVisual(item: Artifact): void
  playFullRevealEffect(item: Artifact): void
  revealArtifactFully(item: Artifact): void
  playOutlineRevealEffect(item: Artifact): void
  syncQualityMarkersForOutlinedItem(item: Artifact): void
  playQualityRevealEffect(item: Artifact): void
  clearQualityVisual(item: Artifact): void

  // 预览方法（来自 WarehousePreviewMixin）
  applyPreviewPosition(): void

  // 音效方法
  playSfx(key: string): void
  playMusic(key: string): void
  stopMusic(): void

  // UI 方法
  writeLog(msg: string): void
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

  // AI 方法（来自 AiWalletMixin）
  getAiWallet(id: string): number
  setAiWallet(id: string, value: number): void
  saveAiWalletsToStorage(): void
  loadAiWalletsFromStorage(): void

  // AI 方法（来自 AiIntelMixin）
  updateAiIntel(playerId: string, intel: AiPrivateIntel): void
  getAiIntel(playerId: string): AiPrivateIntel | undefined
  summarizeIntel(playerId: string): IntelSummary
  getAiIntelSummary(playerId: string): IntelSummary
  ensureAiPrivateIntel(playerId: string): AiPrivateIntel
  revealOutlineBatch(count: number, category: string, allowCategoryFallback: boolean, sortStrategy: string): unknown
  revealQualityBatch(count: number, category: string, allowCategoryFallback: boolean, sortStrategy: string): unknown
  revealArtifactFullyBatch(options: { count: number; sortStrategy: string; category: string; allowCategoryFallback: boolean }): unknown
  revealPrivateIntelBatch(playerId: string, mode: string, count: number, category: string, allowCategoryFallback: boolean, sortStrategy: string): unknown
  revealPrivateIntelFully(playerId: string, options: { count: number; sortStrategy: string; category: string; allowCategoryFallback: boolean }): unknown
  buildAiPrivateSignal(playerId: string, item: Artifact, mode: string): unknown
  ensureAiHighValueTrack(playerId: string, item: Artifact): { trackId: string; created: boolean } | null
  updateAiItemKnowledge(playerId: string, item: Artifact, signal: unknown, mode: string): unknown
  buildTrackCandidatePreview(revealState: unknown): unknown
  pickPrivateRevealTargets(options: { playerId: string; mode: string; count: number; category: string; allowCategoryFallback: boolean; sortStrategy: string }): Artifact[]
  getHighValuePriceThreshold(): number
  isHighValueArtifact(item: Artifact): boolean
  ensureAiItemKnowledge(playerId: string, itemId: string): unknown
  getAiNeighborStateLabel(playerId: string, x: number, y: number): string
  isWarehouseCellOccupied(x: number, y: number): boolean
  markAiKnownCellState(playerId: string, x: number, y: number, state: string): void
  pickRandomItemCell(item: Artifact): { x: number; y: number } | null
  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement): void
  refreshAllPlayerAvatars(): void
  getPlayerById(playerId: string): Player | null
  buildNeighborSnapshot(playerId: string, cell: unknown): unknown
  scanNeighborIntelAroundCell(playerId: string, x: number, y: number): void
  markAllItemCellsAsOccupied(playerId: string, item: Artifact): void
  scanItemBoundaryNeighbors(playerId: string, item: Artifact): void
  buildAiAggregateIntelBlock(playerId: string): unknown
  buildAiHighValueTrackBlock(playerId: string): unknown
  getAiResourceSnapshot(playerId: string): unknown
  getAiAvailableActionState(playerId: string): unknown
  buildAiPrivateRevealContext(playerId: string, item: Artifact, mode: string): unknown
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
  bindLanEvents(): void
  lanStartGame(): void
  lanBroadcastBid(bid: number): void
  lanHandleBidSubmit(msg: BidSubmitMessage): void
  lanSyncState(): void
  setOnlineStatus(text: string, status: string): void
  setPlayerBidReady(slotId: string, ready: boolean): void
  updateLobbyMoneyDisplay(): void

  // 结算方法（来自 SettlementManagerMixin）
  enterSettlementPage(winnerPlayer: Player, winnerBid: number, reasonText: string): void
  exitSettlementPage(): void
  cancelSettlementReveal(): void
  setSettlementProgress(text: string, progress: number): void
  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number): void
  showSelfProfit(selfProfit: number, label: string): void
  playSettlementFinalEffect(winnerProfit: number): void
  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean): void
  revealAllArtifactsForSettlement(): Promise<void>
  playSettlementRevealStep(item: Artifact): Promise<void>
  playSettlementSearchEffect(item: Artifact, runToken: unknown): Promise<void>

  // 回合管理方法（来自 RoundManagerMixin）
  stopRoundTimer(): void
  resumeRoundTimer(): void
  pauseRoundTimer(): void
  resetRoundTimer(): void

  // 技能道具方法（来自 SkillItemManagerMixin）
  syncItemManagerFromShop(): void
  activateSkill(skillId: string): void
  deactivateSkill(skillId: string): void
  useItem(itemId: string): void

  // LLM 方法（来自 LlmDecisionMixin）
  getLlmSettings(): Record<string, unknown>
  getLlmProvider(): string | null
  canUseLlmDecisionForPlayer(playerId: string): boolean
  pushRunSettlementContextToAi(context: unknown): void
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
  waitUntilResumed(): Promise<void>
  extractAiDecisionObject(response: string): unknown
  finishAuction(): void
  recordPlayerUsage(playerId: string, actionId: string): void
  hideLanPauseOverlay(): void
  saveAiMemoryToStorage(): void
  syncBidKeypadScreen(): void
  _stopLive2dLoop(): void
  showLanPauseOverlay(): void
  onNewRound(): void
  closeSettingsOverlay(): void
  formatAiIntelActionPublicLine(playerId: string, action: unknown): string
  _rebuildCustomSelect(el: HTMLElement): void
  closeCarryItemPicker(): void
  recordRoundHistory(): void
  renderQualityVisual(item: Artifact): void
  _handleCardKeydown(event: KeyboardEvent): void
  requestAiLlmFollowupBid(playerId: string): void
  enterLanRoom(): void
  revealRoundBidsSequential(): void
  removeLanRestartDialog(): void
  normalizeAiBidValue(bid: number): number
  exportAiMemoryToJson(): string
  importAiMemoryFromJson(json: string): void
}