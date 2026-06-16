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
  AiItemKnowledge,
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
  AiModelConfig,
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
  // AI 属性（来自 AiWalletMixin）
  aiWallets: Record<string, number>
  aiLlmPlayerEnabled: boolean
  aiFoldState: Record<string, boolean>
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: Record<string, CrossGameMemory>
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
  pendingSettlementSummary: Record<string, unknown> | null
  _aiMemoryTouchBound: boolean

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
  battleRecords: Array<{
    id: string
    timestamp: number
    winner: string
    winnerBid: number
    totalValue: number
    itemCount: number
    roundCount: number
    players: string[]
    logs: Array<{
      round: number
      bids: Record<string, number>
      winner: string
      winnerBid: number
    }>
    finishedAt?: number
    winnerProfit?: number
    playerProfit?: number
    dividendTicketInfo?: {
      dividendPerPlayer: number
      ticketPerPlayer: number
    }
  }>
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: {
    round: number
    bids: Record<string, number>
    winner: string
    winnerBid: number
    page?: number
  } | null

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
  privateIntelEntries: Array<{
    playerId: string
    intel: unknown
  }>
  publicInfoEntries: Array<{
    playerId: string
    info: unknown
  }>
  currentPublicEvent: {
    category: string
    id: string
    text: string
  } | null
  playerRoundHistory: Record<string, Array<{ round: number; bid: number }>>
  playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>
  currentRoundUsage: Record<string, string[]>
  playerHistoryPanels: Record<string, HTMLElement>
  aiThoughtLogs: Array<{
    playerId: string
    thought: string
    timestamp: number
  }>
  aiThoughtLogs: Array<{
    playerId: string
    thought: string
    timestamp: number
  }>
  settlementPreRevealed: boolean

  // AI 决策属性
  _aiDecisionSummaryWaiting: boolean
  aiConversationCache: Record<string, unknown[]>
  aiRoundDecisionPromise: Promise<void> | null

  // LLM 属性
  lastAiIntelActions: Record<string, unknown>
  aiLlmRoundPlans: Record<string, LlmPlan | null>
  aiRoundEffects: Record<string, unknown>

  // 联机属性
  lanHostBids: Record<string, number>
  lanHostWallets: Record<string, number>
  _pauseSnapshotTimeLeft: number

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
  ensureAiPrivateIntel(playerId: string): AiPrivateIntelPool
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
  ensureAiItemKnowledge(playerId: string, itemId: string): AiItemKnowledge
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
  getAiMemoryStorageKey(): string
  loadAiMemoryFromStorage(): void
  ensureAiConversationBucket(playerId: string): unknown[]
  updateLastAiRoundResult(playerId: string, result: unknown): void
  getQualityCounts(): Record<string, number>
  getTotalOccupiedCells(): number
  isAiReflectionEnabled(): boolean
  setupAiMemoryTouchScroll(): void
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
  areAllPlayersBidReady(): boolean
  addPublicInfoEntry(entry: unknown): void
  refreshPlayerHistoryUI(): void
  syncPauseButton(): void
  hideLanPauseOverlay(): void
  showLanPauseOverlay(): void
  showLanRestartVoteDialog(): void
  showLanRestartDeclinedDialog(): void
  removeLanRestartDialog(): void
  enterLanRoom(): void
  exitLanRoom(): void
  onLanForeground(): void
  lanBuildFullSyncData(targetPlayerId: string): unknown
  lanRestoreWarehouseFromSync(syncData: unknown): void
  lanResolveRound(reason: string): void
  lanComputeAiBids(): unknown
  lanOnRoundStart(msg: unknown): void
  lanBroadcastRoundStart(): void
  startLanRun(): void
  lanOnAllBidsIn(msg: unknown): Promise<void>
  lanOnRoundTimeout(): Promise<void>
  lanOnRoundResult(msg: unknown): void
  lanDoFinishAuction(winner: unknown, mode: string): void
  lanOnSettle(msg: unknown): void
  lanOnSettleFinal(msg: unknown): void
  lanOnRestartGo(): void
  lanOnFullSync(syncData: unknown): void
  lanAttemptReconnect(playerId: string, roomCode: string, playerName: string, isHost: boolean): void
  startLanLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement): void
  stopLanLive2dLoop(): void
  toggleLanPause(): void

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
  getSkillInfo(skillId: string): SkillDef | null
  getItemInfo(itemId: string): ItemDef | null
  activateSkill(skillId: string): void
  deactivateSkill(skillId: string): void
  useItem(itemId: string): void
  processAiDecisions(): void

  // LLM 方法（来自 LlmDecisionMixin）
  getLlmSettings(): LlmSettings
  getLlmProvider(): { id: string; name: string; apiKey?: string; endpoint?: string; model?: string } | null
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
  hideInfoPopup(): void
  updateKeypadDirectHint(): void
  waitUntilResumed(): Promise<void>
  extractAiDecisionObject(response: string): unknown
  finishAuction(): void
  recordPlayerUsage(playerId: string, actionId: string): void
  saveAiMemoryToStorage(): void
  syncBidKeypadScreen(): void
  _stopLive2dLoop(): void
  closeSettingsOverlay(): void
  formatAiIntelActionPublicLine(playerId: string, action: unknown): string
  _rebuildCustomSelect(el: HTMLElement): void
  closeCarryItemPicker(): void
  recordRoundHistory(): void
  renderQualityVisual(item: Artifact): void
  _handleCardKeydown(event: KeyboardEvent): void
  requestAiLlmFollowupBid(playerId: string, currentPlan: LlmPlan, toolSummary: string): Promise<LlmPlan | null>
  revealRoundBidsSequential(bids?: unknown[]): Promise<void>
  normalizeAiBidValue(bid: number): number
  exportAiMemoryToJson(): string
  importAiMemoryFromJson(json: string): void

  // 联机同步方法（来自 LanSyncMixin）
  buildWarehouseSnapshotForSync(): unknown
  initPlayersUI(): void
  rebuildWarehouseCellIndex(): void
  refreshRevealScrollHints(): void
  renderPublicInfoPanel(): void

  // 游戏流程方法（来自 LanGameFlowMixin）
  captureAiDecisionTelemetry(bids: unknown[]): void
  recordAiThoughtLogs(telemetry: unknown): void
  renderAiLogicPanel(): void
  resetPlayerHistoryState(): void
  getLastRoundBidMap(): Record<string, number>
  beginRunTracking(): void
  resetForNewRun(): void
  applyCharacterToPlayer(playerId: string, character: unknown): void
  spawnRandomItems(): void
  setupWarehouseAuction(): void
  drawUnknownWarehouse(): void
  guardWarehouseCapacity(): void
  makeRunToken(): number
  cleanupGameScene(): void

  // AI 初始化方法
  initAiWallets(): void
  initAiIntelSystems(): void
  buildAiIntelSnapshot(playerId: string): unknown
  buildAIBids(): unknown

  // AI 决策方法（来自 LlmDecision）
  buildAiDecisionPanelSnapshot(): unknown
  renderAiLogicPanelForLlm(telemetry: unknown): string
  loadAiModelConfigs(): void
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
  buildAiDecisionUserPrompt(payload: unknown, blocks?: string[]): string
  buildAiDecisionMessages(payload: unknown): unknown[]
  normalizeAiLlmPlan(playerId: string, decision: unknown, raw: string): unknown
  requestAiLlmPlan(player: unknown): Promise<unknown>
  buildAiToolResultSummary(result: unknown, actionType: string, actionId: string): string
  requestAiLlmErrorCorrection(player: unknown, plan: unknown, error: unknown, history: unknown[], messages: unknown[]): Promise<unknown>
  prepareAiLlmRoundPlans(): void
  processAiDecisions(): void
  pushAiRoundSummary(summary: unknown): void
  buildAiActionConstraintBlock(playerId: string): unknown
  requestChat(messages: unknown[], options?: unknown): Promise<unknown>
  getAiModelConfig(): AiModelConfig | null
  isAiMultiGameMemoryEnabled(): boolean
  getAiCrossGameMemoryCount(): number
  getAiInGameHistoryCount(): number
  getAiFirstRoundExtraBlocks(playerId: string): string[]

  // AI 情报方法
  processSingleAiIntelAction(playerId: string, plan: unknown, llmPlan: unknown, roundProgress: number, batchId: string, batchStartTime: number): unknown
  buildToolEffect(playerId: string, actionType: string, actionId: string): unknown
  executeAiIntelAction(playerId: string, plan: unknown): unknown
  planIntelAction(playerId: string, available: unknown): unknown
  getAiConversationMessages(playerId: string): unknown[]
  ensureAiConversationBucket(playerId: string): void
  getItemInfo(itemId: string): unknown

  // AI 记忆方法
  loadAiMemoryFromStorage(): void
  setupAiMemoryTouchScroll(): void
  getAiMemoryStorageKey(playerId: string): string
  ensureAiCrossGameMemory(): void
  isAiReflectionEnabled(): boolean
  updateLastAiRoundResult(playerId: string, result: unknown): void
  updateReflectionStatusUI(): void

  // 大厅方法（来自 LobbyIndexMixin）
  showLobbyMain(): void
  applyMapProfile(profileId: string): void
  closeCollectionOverlay(): void
  initCollectionPanel(): void
  getCollectionCategories(): unknown[]
  getQualityCounts(): unknown
  hidePlayerInfoPopover(): void
  hideInfoPopup(): void

  // 角色选择方法
  renderSelectedCharacterPreview(characterId: string): void
  confirmCharacterSelection(): void
  initCharacterSelect(): void
  renderCharacterList(): void
  bindCharacterSelectEvents(): void
  selectCharacter(id: string): void
  _showCarryConfirm(): void
  _saveCarryItems(): void
  _loadCarryItems(): void
  openCarryItemPicker(): void
  removeCarryItem(itemId: string): void
  executeReplenish(): void
  calcReplenishCost(): number
  _bindAutoReplenishToggle(): void
  _saveAutoReplenish(): void
  _loadAutoReplenish(): void
  _destroyCustomSelect(): void
  _cardGlowHandler(item: unknown): void
  bindCardGlowEffect(): void
  _startLive2dLoop(characterId: string): void
  _doStartSoloGame(): void
  _lastRevealedValue: number
  _lastDisplayProfit: number
  _aiMemoryTouchBound: boolean
  _aiDecisionSummaryWaiting: boolean
  updateCharacterMoneyDisplay(): void
  updateKeypadDirectHint(): void

  // 战绩方法
  closeBattleRecordPanel(): void
  renderBattleRecordPanel(): void
  renderBattleRecordSummary(): void
  renderBattleRecordLogView(record: unknown): void
  getLastDecisionLog(round: number): unknown
  restoreWarehouseFromBattleRecord(record: unknown): void
  buildWarehouseSnapshotForRecord(): unknown
  openBattleRecordPanel(): void

  // 商店方法
  _showCarryConfirm(): void
  _saveCarryItems(): void
  _loadCarryItems(): void
  openCarryItemPicker(): void
  removeCarryItem(itemId: string): void
  executeReplenish(): void
  calcReplenishCost(): number
  _bindAutoReplenishToggle(): void
  _saveAutoReplenish(): void
  _loadAutoReplenish(): void

  // 竞价方法（来自 BiddingMixin）
  markRoundRanking(bids: unknown[]): void
  buildRoundBids(): unknown
  setPlayerBidDisplay(playerId: string, bid: number): void
  setPlayerBidReady(slotId: string, ready: boolean): void

  // 仓库方法（来自 WarehouseCoreMixin）
  getTotalOccupiedCells(): number
  getQualityCounts(): unknown
  cleanupGameScene(): void

  // 结算方法
  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number): void
  playSettlementFinalEffect(winnerProfit: number): void
  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean): void

  // 音频方法
  playSfx(key: string): void
  playMusic(key: string): void
  stopMusic(): void
}