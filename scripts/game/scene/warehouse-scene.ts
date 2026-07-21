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
import type { Player, Artifact, GameSettings, ItemDef, SkillContext } from "../../../types/game"
import type { AiPrivateIntel, CrossGameMemory, ConversationMessage, ConversationBucketEntry } from "../../../types/ai"
import type { BonusEffect } from "../core/bonus"
import type { LlmPlan, LlmPlanResult, LlmTelemetry, LlmSettings } from "../../../types/llm"
import type { LanPlayer } from "../../../types/lan"
import { GameState } from "../core/state"
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
import type { CrossGameMemory as ReflectionCrossGameMemory } from "../ai/reflection"
import { AiMemoryManager } from "../ai/memory-manager"
import { AutoPlayManager } from "../ai/autoplay-manager"
import type { AiMemoryData } from "../ai/memory-manager"
import type { AiFeedbackEntry } from "../../../types/ai"
import { WarehouseManager } from "../warehouse/warehouse-manager"
import type { WarehouseManagerState } from "../warehouse/warehouse-manager"
import { AiIntelManager } from "../ai/intel-manager"
import type { AiIntelState, ArtifactManagerDep, AiEngineDep, LanBridgeDep } from "../ai/intel-manager"
import { UiOverlayManager } from "../ui/overlay-manager"
import type { OverlayPlayer, OverlayLanBridge, OverlayLlmProvider, OverlayTweens } from "../ui/overlay-manager"
import { LobbyIndexManager } from "../lobby/lobby-index-manager"
import type { LobbyIndexState, PhaserGameLike, LanBridgeLike as LobbyLanBridgeLike } from "../lobby/lobby-index-manager"
import { RoundManager } from "../core/round-manager-class"
import { BiddingManager } from "../bidding/bidding-manager"
import { LanIndexManager } from "../lan/lan-index-manager"
import type { LanIndexState, LanBridgeLike } from "../lan/lan-index-manager"
import { getOutlineBonus, getQualityBonus, getOutlineSortStrategy } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"
import type { IntelEntry } from "../ui/panels"
import type { RunLog } from "../ai/decision"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

// Mixin 方法声明：这些方法通过 Object.assign 从各 Mixin 混入 WarehouseScene.prototype
// 声明为 interface 让 TS 识别，运行时由 Mixin 提供
export interface WarehouseMixinMethods {
  // Warehouse Mixin
  syncItemManagerFromShop(): void
  guardWarehouseCapacity(): void
  drawUnknownWarehouse(): void
  renderItem(item: Artifact): void
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

  // Skill/Item Manager Mixin
  useItem(itemId: string): void
  useSkill(skillId: string): void
  handleBidKeyInput(key: string): void
  openBidKeypad(): void
  closeBidKeypad(): void
  renderItem(item: Artifact): void
  renderItemDrawer(): void
  toggleItemDrawer(): void
  closeItemDrawer(): void
  getItemInfo(itemId: string): ItemDef | null

  // Settlement Manager Mixin
  settleCurrentRun(): void
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
  openAiFeedbackPanel(): void
  closeAiFeedbackPanel(): void
  refreshAiFeedbackList(): void
  removeAiFeedback(id: string): void
  clearAllAiFeedbacks(): void
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
  updateSidePanels(
    skillState: Record<string, unknown>,
    itemState: Record<string, unknown>,
    clueCount: number,
    occupiedCells: number,
    capacity: number,
    bidState: string
  ): void

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
}

// Phaser.Scene 类型桥接：extends 子句不支持 as，用中间类绕过
// 必须用 any：Phaser 的类型系统不支持 class extends (Phaser.Scene as any)
const _PhaserScene: typeof Phaser.Scene = (Phaser as any).Scene

class WarehouseScene extends _PhaserScene {
  private state: GameState
  gridLayer: Phaser.GameObjects.Graphics | null
  revealCellLayer: Phaser.GameObjects.Graphics | null
  itemLayer: Phaser.GameObjects.Container | null
  get items(): Artifact[] { return this.state.warehouse.items }
  set items(v: Artifact[]) { this.state.warehouse.items = v }
  get revealedCells(): unknown[] { return this.state.warehouse.revealedCells }
  set revealedCells(v: unknown[]) { this.state.warehouse.revealedCells = v }
  artifactManager: ArtifactManager
  skillManager: SkillManager
  itemManager: ItemManager
  aiEngine: AuctionAiEngine
  get deepSeekTesting(): boolean { return this.state.warehouse.deepSeekTesting }
  set deepSeekTesting(v: boolean) { this.state.warehouse.deepSeekTesting = v }
  get round(): number { return this.state.game.round }
  set round(v: number) { this.state.game.round = v }
  get actionsLeft(): number { return this.state.game.actionsLeft }
  set actionsLeft(v: number) { this.state.game.actionsLeft = v }
  get roundTimeLeft(): number { return this.state.game.roundTimeLeft }
  set roundTimeLeft(v: number) { this.state.game.roundTimeLeft = v }
  get playerMoney(): number { return this.state.game.playerMoney }
  set playerMoney(v: number) { this.state.game.playerMoney = v }
  get selectedItem(): Artifact | null { return this.state.game.selectedItem }
  set selectedItem(v: Artifact | null) { this.state.game.selectedItem = v }
  get currentBid(): number { return this.state.game.currentBid }
  set currentBid(v: number) { this.state.game.currentBid = v }
  get bidLeader(): string { return this.state.game.bidLeader }
  set bidLeader(v: string) { this.state.game.bidLeader = v }
  get secondHighestBid(): number { return this.state.game.secondHighestBid }
  set secondHighestBid(v: number) { this.state.game.secondHighestBid = v }
  get aiMaxBid(): number { return this.state.game.aiMaxBid }
  set aiMaxBid(v: number) { this.state.game.aiMaxBid = v }
  get aiWallets(): Record<string, number> { return this.state.game.aiWallets }
  set aiWallets(v: Record<string, number>) { this.state.game.aiWallets = v }
  get warehouseTrueValue(): number { return this.state.game.warehouseTrueValue }
  set warehouseTrueValue(v: number) { this.state.game.warehouseTrueValue = v }
  get warehouseCellIndex(): Record<string, Artifact | null> { return this.state.game.warehouseCellIndex }
  set warehouseCellIndex(v: Record<string, Artifact | null>) { this.state.game.warehouseCellIndex = v }
  get settled(): boolean { return this.state.game.settled }
  set settled(v: boolean) { this.state.game.settled = v }
  get isLanMode(): boolean { return this.state.lan.isLanMode }
  set isLanMode(v: boolean) { this.state.lan.isLanMode = v }
  get lanBridge(): unknown { return this.state.lan.lanBridge }
  set lanBridge(v: unknown) { this.state.lan.lanBridge = v }
  get lanIsHost(): boolean { return this.state.lan.lanIsHost }
  set lanIsHost(v: boolean) { this.state.lan.lanIsHost = v }
  get lanMySlotId(): string | null { return this.state.lan.lanMySlotId }
  set lanMySlotId(v: string | null) { this.state.lan.lanMySlotId = v }
  get lanIdToSlotId(): Record<string, string> { return this.state.lan.lanIdToSlotId }
  set lanIdToSlotId(v: Record<string, string>) { this.state.lan.lanIdToSlotId = v }
  get slotIdToLanId(): Record<string, string> { return this.state.lan.slotIdToLanId }
  set slotIdToLanId(v: Record<string, string>) { this.state.lan.slotIdToLanId = v }
  get lanHostWallets(): Record<string, number> { return this.state.lan.lanHostWallets }
  set lanHostWallets(v: Record<string, number>) { this.state.lan.lanHostWallets = v }
  get lanReconnecting(): boolean { return this.state.lan.lanReconnecting }
  set lanReconnecting(v: boolean) { this.state.lan.lanReconnecting = v }
  get lanLastServerUrl(): string | null { return this.state.lan.lanLastServerUrl }
  set lanLastServerUrl(v: string | null) { this.state.lan.lanLastServerUrl = v }
  get lanLastRoomCode(): string | null { return this.state.lan.lanLastRoomCode }
  set lanLastRoomCode(v: string | null) { this.state.lan.lanLastRoomCode = v }
  get lanLastPlayerId(): string | null { return this.state.lan.lanLastPlayerId }
  set lanLastPlayerId(v: string | null) { this.state.lan.lanLastPlayerId = v }
  get lanReconnectAttempts(): number { return this.state.lan.lanReconnectAttempts }
  set lanReconnectAttempts(v: number) { this.state.lan.lanReconnectAttempts = v }
  get lanMaxReconnectAttempts(): number { return this.state.lan.lanMaxReconnectAttempts }
  set lanMaxReconnectAttempts(v: number) { this.state.lan.lanMaxReconnectAttempts = v }
  get lanPlayers(): LanPlayer[] { return this.state.lan.lanPlayers }
  set lanPlayers(v: LanPlayer[]) { this.state.lan.lanPlayers = v }
  get lanHostBids(): Record<string, number> { return this.state.lan.lanHostBids }
  set lanHostBids(v: Record<string, number>) { this.state.lan.lanHostBids = v }
  get previewOpenTick(): number { return this.state.game.previewOpenTick }
  set previewOpenTick(v: number) { this.state.game.previewOpenTick = v }
  get roundTimerId(): ReturnType<typeof setInterval> | null { return this.state.game.roundTimerId }
  set roundTimerId(v: ReturnType<typeof setInterval> | null) { this.state.game.roundTimerId = v }
  get roundPaused(): boolean { return this.state.game.roundPaused }
  set roundPaused(v: boolean) { this.state.game.roundPaused = v }
  get roundResolving(): boolean { return this.state.game.roundResolving }
  set roundResolving(v: boolean) { this.state.game.roundResolving = v }
  get playerBidSubmitted(): boolean { return this.state.game.playerBidSubmitted }
  set playerBidSubmitted(v: boolean) { this.state.game.playerBidSubmitted = v }
  get playerRoundBid(): number { return this.state.game.playerRoundBid }
  set playerRoundBid(v: number) { this.state.game.playerRoundBid = v }
  get isSettlementRevealMode(): boolean { return this.state.game.isSettlementRevealMode }
  set isSettlementRevealMode(v: boolean) { this.state.game.isSettlementRevealMode = v }
  get settlementRevealRunning(): boolean { return this.state.game.settlementRevealRunning }
  set settlementRevealRunning(v: boolean) { this.state.game.settlementRevealRunning = v }
  get settlementRevealSkipRequested(): boolean { return this.state.game.settlementRevealSkipRequested }
  set settlementRevealSkipRequested(v: boolean) { this.state.game.settlementRevealSkipRequested = v }
  get settlementSession(): { runToken: number | string; phase: string } | null { return this.state.game.settlementSession }
  set settlementSession(v: { runToken: number | string; phase: string } | null) { this.state.game.settlementSession = v }
  get settlementRunToken(): number | string { return this.state.game.settlementRunToken }
  set settlementRunToken(v: number | string) { this.state.game.settlementRunToken = v }
  activeSettlementSpinner: Phaser.GameObjects.Arc | null
  get moneySettledRunToken(): string | null { return this.state.game.moneySettledRunToken }
  set moneySettledRunToken(v: string | null) { this.state.game.moneySettledRunToken = v }
  get _edgeFlashActive(): boolean { return this.state.game._edgeFlashActive }
  set _edgeFlashActive(v: boolean) { this.state.game._edgeFlashActive = v }
  get _lastDisplayedMoney(): number | null { return this.state.game._lastDisplayedMoney }
  set _lastDisplayedMoney(v: number | null) { this.state.game._lastDisplayedMoney = v }
  get players(): Player[] { return this.state.game.players }
  set players(v: Player[]) { this.state.game.players = v }
  get playerRoundHistory(): Record<string, unknown> { return this.state.game.playerRoundHistory }
  set playerRoundHistory(v: Record<string, unknown>) { this.state.game.playerRoundHistory = v }
  get playerUsageHistory(): Record<string, unknown> { return this.state.game.playerUsageHistory }
  set playerUsageHistory(v: Record<string, unknown>) { this.state.game.playerUsageHistory = v }
  get currentRoundUsage(): Record<string, unknown> { return this.state.game.currentRoundUsage }
  set currentRoundUsage(v: Record<string, unknown>) { this.state.game.currentRoundUsage = v }
  get playerHistoryPanels(): Record<string, unknown> { return this.state.game.playerHistoryPanels }
  set playerHistoryPanels(v: Record<string, unknown>) { this.state.game.playerHistoryPanels = v }
  get aiPrivateIntel(): Record<string, AiPrivateIntel> { return this.state.ai.aiPrivateIntel }
  set aiPrivateIntel(v: Record<string, AiPrivateIntel>) { this.state.ai.aiPrivateIntel = v }
  get aiResourceState(): Record<string, unknown> { return this.state.ai.aiResourceState }
  set aiResourceState(v: Record<string, unknown>) { this.state.ai.aiResourceState = v }
  get aiRoundEffects(): Record<string, unknown> { return this.state.ai.aiRoundEffects }
  set aiRoundEffects(v: Record<string, unknown>) { this.state.ai.aiRoundEffects = v }
  get lastAiIntelActions(): Array<{
    playerId: string
    playerName: string
    actionType: string
    actionId: string
    revealed: unknown
    detail: string
    score: number
    effectTag: string
    signalStats: unknown
  }> { return this.state.ai.lastAiIntelActions }
  set lastAiIntelActions(v: Array<{
    playerId: string
    playerName: string
    actionType: string
    actionId: string
    revealed: unknown
    detail: string
    score: number
    effectTag: string
    signalStats: unknown
  }>) { this.state.ai.lastAiIntelActions = v }
  get aiLlmRoundPlans(): Record<string, LlmPlan | null> { return this.state.ai.aiLlmRoundPlans }
  set aiLlmRoundPlans(v: Record<string, LlmPlan | null>) { this.state.ai.aiLlmRoundPlans = v }
  get aiLlmPlayerEnabled(): Record<string, boolean> { return this.state.ai.aiLlmPlayerEnabled }
  set aiLlmPlayerEnabled(v: Record<string, boolean>) { this.state.ai.aiLlmPlayerEnabled = v }
  get aiFoldState(): Record<string, unknown> { return this.state.ai.aiFoldState }
  set aiFoldState(v: Record<string, unknown>) { this.state.ai.aiFoldState = v }
  get lastAiDecisionTelemetry(): { mode: string; round: number; entries: LlmTelemetry[] } | null { return this.state.ai.lastAiDecisionTelemetry }
  set lastAiDecisionTelemetry(v: { mode: string; round: number; entries: LlmTelemetry[] } | null) { this.state.ai.lastAiDecisionTelemetry = v }
  get llmEverUsedThisRun(): boolean { return this.state.ai.llmEverUsedThisRun }
  set llmEverUsedThisRun(v: boolean) { this.state.ai.llmEverUsedThisRun = v }
  get aiReflectionState(): string { return this.state.ai.aiReflectionState }
  set aiReflectionState(v: string) { this.state.ai.aiReflectionState = v }
  get aiReflectionTotal(): number { return this.state.ai.aiReflectionTotal }
  set aiReflectionTotal(v: number) { this.state.ai.aiReflectionTotal = v }
  get aiReflectionCompleted(): number { return this.state.ai.aiReflectionCompleted }
  set aiReflectionCompleted(v: number) { this.state.ai.aiReflectionCompleted = v }
  get aiReflectionStateDetail(): string { return this.state.ai.aiReflectionStateDetail }
  set aiReflectionStateDetail(v: string) { this.state.ai.aiReflectionStateDetail = v }
  get _reflectionBeforeUnload(): ((e: BeforeUnloadEvent) => void) | null { return this.state.ai._reflectionBeforeUnload }
  set _reflectionBeforeUnload(v: ((e: BeforeUnloadEvent) => void) | null) { this.state.ai._reflectionBeforeUnload = v }
  get aiConversationByPlayer(): Record<string, ConversationMessage[]> { return this.state.ai.aiConversationByPlayer }
  set aiConversationByPlayer(v: Record<string, ConversationMessage[]>) { this.state.ai.aiConversationByPlayer = v }
  get aiCrossGameMemory(): Record<string, CrossGameMemory[]> { return this.state.ai.aiCrossGameMemory }
  set aiCrossGameMemory(v: Record<string, CrossGameMemory[]>) { this.state.ai.aiCrossGameMemory = v }
  get aiCrossGameMessagesByPlayer(): Record<string, Array<Array<Record<string, string>>>> { return this.state.ai.aiCrossGameMessagesByPlayer }
  set aiCrossGameMessagesByPlayer(v: Record<string, Array<Array<Record<string, string>>>>) { this.state.ai.aiCrossGameMessagesByPlayer = v }
  get aiReflectionPending(): Record<string, unknown> { return this.state.ai.aiReflectionPending }
  set aiReflectionPending(v: Record<string, unknown>) { this.state.ai.aiReflectionPending = v }
  get aiConversationCache(): Record<string, unknown> { return this.state.ai.aiConversationCache }
  set aiConversationCache(v: Record<string, unknown>) { this.state.ai.aiConversationCache = v }
  get runSerial(): number { return this.state.game.runSerial }
  set runSerial(v: number) { this.state.game.runSerial = v }
  get aiFeedbacks(): AiFeedbackEntry[] { return this.state.ai.aiFeedbacks }
  set aiFeedbacks(v: AiFeedbackEntry[]) { this.state.ai.aiFeedbacks = v }
  get aiExperienceBookInContext(): Record<string, { lessons: string[]; strategies: string[]; praises: string[] }> { return this.state.ai.aiExperienceBookInContext }
  set aiExperienceBookInContext(v: Record<string, { lessons: string[]; strategies: string[]; praises: string[] }>) { this.state.ai.aiExperienceBookInContext = v }
  get runLogHistory(): unknown[] { return this.state.game.runLogHistory }
  set runLogHistory(v: unknown[]) { this.state.game.runLogHistory = v }
  get currentRunLog(): {
    runNo: number
    startedAt: number
    aiThoughtLogs: unknown[]
    actionLogs: string[]
    roundLogsByRound: Record<string, string[]>
    roundPanelTexts: Record<string, string>
  } | null { return this.state.game.currentRunLog }
  set currentRunLog(v: {
    runNo: number
    startedAt: number
    aiThoughtLogs: unknown[]
    actionLogs: string[]
    roundLogsByRound: Record<string, string[]>
    roundPanelTexts: Record<string, string>
  } | null) { this.state.game.currentRunLog = v }
  get highValuePriceThreshold(): number | null { return this.state.record.highValuePriceThreshold }
  set highValuePriceThreshold(v: number | null) { this.state.record.highValuePriceThreshold = v }
  get battleRecords(): unknown[] { return this.state.record.battleRecords }
  set battleRecords(v: unknown[]) { this.state.record.battleRecords = v }
  get battleRecordReplayActive(): boolean { return this.state.record.battleRecordReplayActive }
  set battleRecordReplayActive(v: boolean) { this.state.record.battleRecordReplayActive = v }
  get battleRecordReplayRecordId(): string | null { return this.state.record.battleRecordReplayRecordId }
  set battleRecordReplayRecordId(v: string | null) { this.state.record.battleRecordReplayRecordId = v }
  get battleRecordLogView(): { recordId: string; page: number } | null { return this.state.record.battleRecordLogView }
  set battleRecordLogView(v: { recordId: string; page: number } | null) { this.state.record.battleRecordLogView = v }
  get roundBidReadyState(): Record<string, unknown> { return this.state.game.roundBidReadyState }
  set roundBidReadyState(v: Record<string, unknown>) { this.state.game.roundBidReadyState = v }
  get aiRoundDecisionPromise(): Promise<unknown> | null { return this.state.game.aiRoundDecisionPromise }
  set aiRoundDecisionPromise(v: Promise<unknown> | null) { this.state.game.aiRoundDecisionPromise = v }
  get pendingNextRunAiSummaryByPlayer(): Record<string, string> { return this.state.record.pendingNextRunAiSummaryByPlayer }
  set pendingNextRunAiSummaryByPlayer(v: Record<string, string>) { this.state.record.pendingNextRunAiSummaryByPlayer = v }
  get pendingSettlementSummary(): string { return this.state.record.pendingSettlementSummary }
  set pendingSettlementSummary(v: string) { this.state.record.pendingSettlementSummary = v }
  get privateIntelEntries(): Array<{ source: string; text: string; round: number }> { return this.state.record.privateIntelEntries }
  set privateIntelEntries(v: Array<{ source: string; text: string; round: number }>) { this.state.record.privateIntelEntries = v }
  get publicInfoEntries(): Array<{ source: string; text: string }> { return this.state.record.publicInfoEntries }
  set publicInfoEntries(v: Array<{ source: string; text: string }>) { this.state.record.publicInfoEntries = v }
  get currentPublicEvent(): { id: string; text: string; category: string; priority?: number } | null { return this.state.game.currentPublicEvent }
  set currentPublicEvent(v: { id: string; text: string; category: string; priority?: number } | null) { this.state.game.currentPublicEvent = v }
  get dom(): Record<string, HTMLElement | null> { return this.state.ui.dom }
  set dom(v: Record<string, HTMLElement | null>) { this.state.ui.dom = v }
  get _hudRoundText(): HTMLElement | null { return this.state.ui._hudRoundText }
  set _hudRoundText(v: HTMLElement | null) { this.state.ui._hudRoundText = v }
  get _hudTimerText(): HTMLElement | null { return this.state.ui._hudTimerText }
  set _hudTimerText(v: HTMLElement | null) { this.state.ui._hudTimerText = v }
  get _hudMoneyText(): HTMLElement | null { return this.state.ui._hudMoneyText }
  set _hudMoneyText(v: HTMLElement | null) { this.state.ui._hudMoneyText = v }
  get _timerSpan(): HTMLElement | null { return this.state.ui._timerSpan }
  set _timerSpan(v: HTMLElement | null) { this.state.ui._timerSpan = v }
  get keypadValue(): string { return this.state.game.keypadValue }
  set keypadValue(v: string) { this.state.game.keypadValue = v }
  get _activeSkillId(): string | null { return this.state.game._activeSkillId }
  set _activeSkillId(v: string | null) { this.state.game._activeSkillId = v }
  get _gameConfirmCallback(): (() => void) | null { return this.state.game._gameConfirmCallback }
  set _gameConfirmCallback(v: (() => void) | null) { this.state.game._gameConfirmCallback = v }
  get _gameCancelCallback(): (() => void) | null { return this.state.game._gameCancelCallback }
  set _gameCancelCallback(v: (() => void) | null) { this.state.game._gameCancelCallback = v }
  get lanAiPlayers(): (LanPlayer & { llm?: boolean })[] { return this.state.lan.lanAiPlayers }
  set lanAiPlayers(v: (LanPlayer & { llm?: boolean })[]) { this.state.lan.lanAiPlayers = v }
  get lanAiLlmEnabled(): boolean { return this.state.lan.lanAiLlmEnabled }
  set lanAiLlmEnabled(v: boolean) { this.state.lan.lanAiLlmEnabled = v }
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
  autoplayManager!: AutoPlayManager
  // Phase 2: Manager 依赖的跨 Mixin 方法（运行时由 Object.assign 提供）
  isSettlementPageActive!: () => boolean
  renderAiThoughtLog!: () => void
  renderAiLogicPanelForLlm!: (telemetry: { round: number; entries?: Array<Record<string, unknown>> }) => void
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
  getLlmProvider!: () => {
    id: string
    requestChat: (options: Record<string, unknown>) => Promise<Record<string, unknown>>
  } | null
  getAiModelConfigForPlayer!: (playerId: string) => Record<string, unknown> | null
  startNewRun!: () => void
  openBattleRecordPanel!: () => void
  updateReflectionStatusUI!: () => void
  showLobbySubPage!: (page: string) => void
  updatePlayerAvatar!: (playerId: string, avatarEl: HTMLElement) => void
  startSoloGame!: () => void

  // ===== Mixin 方法声明（运行时由 Object.assign 混入，! 断言避免 TS 报错）=====
  addPublicInfoEntry!: (...args: any[]) => any
  clearCurrentRoundUsage!: (...args: any[]) => any
  kickoffAiRoundDecisions!: (...args: any[]) => any
  showLanPauseOverlay!: (...args: any[]) => any
  hideLanPauseOverlay!: (...args: any[]) => any
  captureAiDecisionTelemetry!: (...args: any[]) => any
  renderAiLogicPanel!: (...args: any[]) => any
  recordRoundHistory!: (...args: any[]) => any
  markRoundRanking!: (...args: any[]) => any
  finishAuction!: (...args: any[]) => any
  processAiDecisions!: (...args: any[]) => any
  cancelSettlementReveal!: (...args: any[]) => any
  buildWarehouseSnapshotForSync!: (...args: any[]) => any
  applyCharacterToPlayer!: (...args: any[]) => any
  makeRunToken!: (...args: any[]) => any
  revealRoundBidsSequential!: (...args: any[]) => any
  waitUntilResumed!: (...args: any[]) => any
  syncPauseButton!: (...args: any[]) => any
  exitLanRoom!: (...args: any[]) => any
  exitLobby!: (...args: any[]) => any
  renderPublicInfoPanel!: (...args: any[]) => any
  isAiLlmEnabledForPlayer!: (...args: any[]) => any
  getLastRoundBidMap!: (...args: any[]) => any
  initAudio!: (...args: any[]) => any
  cacheDom!: (...args: any[]) => any
  bindDomEvents!: (...args: any[]) => any
  initAnimations!: (...args: any[]) => any
  // ===== Mixin 状态属性声明 =====
  get _pauseSnapshotTimeLeft(): number | null { return this.state.game._pauseSnapshotTimeLeft }
  set _pauseSnapshotTimeLeft(v: number | null) { this.state.game._pauseSnapshotTimeLeft = v }

  constructor() {
    super("warehouse")
    this.state = new GameState()
    this.lanMySlotId = "p2"
    this.gridLayer = null
    this.revealCellLayer = null
    this.itemLayer = null

    this.artifactManager = new ArtifactManager()
    this.skillManager = new SkillManager()
    this.itemManager = new ItemManager()
    this.aiEngine = new AuctionAiEngine()

    // game 非默认初始值（覆盖 slice 默认值，读自 settings/storage）
    this.actionsLeft = _GAME_SETTINGS.actionsPerRound
    this.roundTimeLeft = _GAME_SETTINGS.roundSeconds
    this.playerMoney = loadPlayerMoney()
    this.activeSettlementSpinner = null

    this.aiLlmPlayerEnabled = Deps.LLM_BRIDGE ? Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players) : {}
    this.battleRecords = Deps.BATTLE_RECORD_BRIDGE ? Deps.BATTLE_RECORD_BRIDGE.loadBattleRecords() : []
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

    // Phase 2: Manager 实例化（依赖注入）
    const scene = this
    this.walletManager = new AiWalletManager(
      () => this.players,
      () => this.aiWallets,
      () => ({
        currentBid: this.currentBid,
        aiMaxBid: this.aiMaxBid,
        aiWallets: this.aiWallets,
        isLanMode: this.isLanMode,
        slotIdToLanId: this.slotIdToLanId,
        lanHostWallets: this.lanHostWallets
      }))
    this.historyManager = new HistoryManager({
      get players() {
        return scene.players
      },
      // 必须用 getter 而非构造时值：resetForNewRun 会替换 state.game.playerRoundHistory 等对象引用，
      // 构造时捕获的旧引用会导致 HistoryManager 写入旧对象而场景读取新对象（数据分叉）。
      get data() {
        return {
          playerRoundHistory: scene.playerRoundHistory as Record<string, Array<{ round: number; bid: number }>>,
          playerUsageHistory: scene.playerUsageHistory as Record<string, Array<{ round: number; actions: string[] }>>,
          currentRoundUsage: scene.currentRoundUsage as Record<string, string[]>,
          playerHistoryPanels: scene.playerHistoryPanels as Record<string, HTMLElement | null>
        }
      },
      dom: this.dom,
      itemManager: this.itemManager,
      getRound: () => this.round,
      getDrawerState: () => ({
        settled: this.settled,
        roundResolving: this.roundResolving,
        playerBidSubmitted: this.playerBidSubmitted,
        roundTimeLeft: this.roundTimeLeft
      }),
      closeBidKeypad: () => this.closeBidKeypad(),
      isSettingsOverlayOpen: () => this.isSettingsOverlayOpen(),
      isSettlementPageActive: () => this.isSettlementPageActive(),
      getItemInfo: (itemId: string) => this.getItemInfo(itemId)!
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
      getRunSerial: () => this.runSerial,
      saveAiMemoryToStorage: () => this.aiMemoryManager.saveAiMemoryToStorage(),
      renderAiThoughtLog: () => this.renderAiThoughtLog(),
      renderAiLogicPanelForLlm: (t) => this.renderAiLogicPanelForLlm(t)
    })
    this.skillItemManager = new SkillItemManager({
      getRound: () => this.round,
      getActionsLeft: () => this.actionsLeft,
      setActionsLeft: (n: number) => {
        this.actionsLeft = n
      },
      skillManager: this.skillManager,
      itemManager: this.itemManager,
      canUseIntelActions: () => this.aiIntelManager.canUseIntelActions(),
      closeItemDrawer: () => this.closeItemDrawer(),
      writeLog: (msg: string) => this.aiDecisionManager.writeLog(msg),
      showGameConfirm: (msg: string, onOk: () => void) => this.showGameConfirm(msg, onOk),
      buildSkillContext: () => this.aiIntelManager.buildSkillContext(),
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
      recordPlayerSkill: (actionId: string, isItem: boolean) => scene.autoplayManager.recordPlayerSkill(actionId, isItem),
      isAutoPlaying: () => scene.autoplayManager.isActive(),
    })
    this.panelsManager = new PanelsManager({
      get privateIntelEntries() {
        return scene.privateIntelEntries
      },
      get publicInfoEntries() {
        return scene.publicInfoEntries as unknown as IntelEntry[]
      },
      dom: this.dom,
      getRound: () => this.round,
      getLanBridge: () => this.lanBridge as PanelsLanBridge,
      getIsLanMode: () => this.isLanMode,
      getLanIsHost: () => this.lanIsHost
    })
    this.carouselManager = new CarouselManager()

    // Phase 2: 新增 4 个 Manager 实例化（依赖注入）

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
      get aiFeedbacks() {
        return scene.aiFeedbacks
      },
      set aiFeedbacks(v) {
        scene.aiFeedbacks = v
      },
      get aiExperienceBookInContext() {
        return scene.aiExperienceBookInContext
      },
      set aiExperienceBookInContext(v) {
        scene.aiExperienceBookInContext = v
      }
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
      getPlayerRoundHistory: () => this.playerRoundHistory as Record<string, Array<{ round: number; bid: number }>>,
      isAutoPlaying: () => scene.autoplayManager.isActive(),
    })

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
      getAiConversationCache: () => aiMemoryData.aiConversationCache as unknown as Record<string, unknown[]> | null,
      getAiConversationByPlayer: () => aiMemoryData.aiConversationByPlayer as unknown as Record<string, unknown[]> | null,
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
      setAiReflectionState: (v: string) => {
        scene.aiReflectionState = v
      },
      setAiReflectionStateDetail: (v: string) => {
        scene.aiReflectionStateDetail = v
      },
      setAiReflectionTotal: (v: number) => {
        scene.aiReflectionTotal = v
      },
      setAiReflectionCompleted: (v: number) => {
        scene.aiReflectionCompleted = v
      },
      getAiReflectionState: () => scene.aiReflectionState,
      getAiReflectionStateDetail: () => scene.aiReflectionStateDetail,
      getAiReflectionTotal: () => scene.aiReflectionTotal,
      getAiReflectionCompleted: () => scene.aiReflectionCompleted,
      get players() {
        return scene.players
      },
      ensureAiCrossGameMemory: (playerId: string) =>
        this.aiMemoryManager.ensureAiCrossGameMemory(playerId) as unknown as ReflectionCrossGameMemory,
      saveAiMemoryToStorage: () => this.aiMemoryManager.saveAiMemoryToStorage(),
      updateReflectionStatusUI: () => {
        scene.updateReflectionStatusUI()
      },
      renderAiThoughtLog: () => this.renderAiThoughtLog(),
      isAiMultiGameMemoryEnabled: () => this.aiMemoryManager.isAiMultiGameMemoryEnabled(),
      shouldGenerateSummary: () => this.aiMemoryManager.shouldGenerateSummary(),
      isAtContextLimit: () => this.aiMemoryManager.isAtContextLimit(),
      clearGameHistoryForPlayer: (playerId: string) => this.aiMemoryManager.clearGameHistoryForPlayer(playerId),
      refreshAiExperienceBookInContext: (playerId: string) => this.aiMemoryManager.refreshAiExperienceBookInContext(playerId),
      exitSettlementPage: () => this.exitSettlementPage(),
      startNewRun: () => this.startNewRun(),
      enterLobby: () => this.enterLobby(),
      enterLanRoom: () => this.enterLanRoom(),
      openBattleRecordPanel: () => this.openBattleRecordPanel(),
      writeLog: (text: string) => this.aiDecisionManager.writeLog(text),
      isAutoPlaying: () => scene.autoplayManager.isActive(),
      isFeedbackEnabled: () => {
        const settings = this.getLlmSettings() as { feedbackEnabled?: boolean } | null
        return Boolean(settings && settings.feedbackEnabled)
      },
      getRunSerial: () => scene.runSerial,
      addAiFeedback: (entry) => {
        scene.aiMemoryManager.addAiFeedback({
          playerId: entry.playerId,
          playerName: entry.playerName,
          runSerial: entry.runSerial,
          content: entry.content
        })
      }
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
      stopRoundTimer: () => this.roundManager.stopRoundTimer(),
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
      triggerAiReflection: (record) => this.aiReflectionManager.triggerAiReflection(record as Record<string, unknown>),
      hasAppliedMoneyForRun: () => this.hasAppliedMoneyForRun(),
      markMoneyAppliedForRun: () => this.markMoneyAppliedForRun(),
      writeLog: (msg) => this.aiDecisionManager.writeLog(msg),
      updateHud: () => this.updateHud(),
      getAiWallet: (id) => this.walletManager.getAiWallet(id),
      getBonusEffects: () => this.state.game.bonusEffects
    })

    this.characterSelectManager = new CharacterSelectManager({
      get players() {
        return scene.players
      },
      shop: MobaoShopBridge as unknown as ShopBridge | null,
      showLobbySubPage: (page: string) => this.showLobbySubPage(page),
      updatePlayerAvatar: (playerId: string, avatarEl: HTMLElement) => this.updatePlayerAvatar(playerId, avatarEl),
      startSoloGame: () => this.startSoloGame()
    })

    // Phase 2 step 2: 新增 4 个 Manager 实例化
    const warehouseManagerState: WarehouseManagerState = {
      get gridLayer() {
        return scene.gridLayer
      },
      set gridLayer(v) {
        scene.gridLayer = v
      },
      get revealCellLayer() {
        return scene.revealCellLayer
      },
      set revealCellLayer(v) {
        scene.revealCellLayer = v
      },
      get itemLayer() {
        return scene.itemLayer
      },
      set itemLayer(v) {
        scene.itemLayer = v
      },
      get items() {
        return scene.items
      },
      set items(v) {
        scene.items = v
      },
      get revealedCells() {
        return scene.revealedCells as boolean[][]
      },
      set revealedCells(v) {
        scene.revealedCells = v
      },
      get warehouseCellIndex() {
        return scene.warehouseCellIndex as unknown as Record<string, string>
      },
      set warehouseCellIndex(v) {
        scene.warehouseCellIndex = v as unknown as Record<string, Artifact | null>
      },
      get selectedItem() {
        return scene.selectedItem
      },
      set selectedItem(v) {
        scene.selectedItem = v
      },
      get previewAnchor() {
        return (scene as unknown as WarehouseSceneThis).previewAnchor
      },
      set previewAnchor(v) {
        ; (scene as unknown as WarehouseSceneThis).previewAnchor = v
      },
      get previewOpenTick() {
        return scene.previewOpenTick
      },
      set previewOpenTick(v) {
        scene.previewOpenTick = v
      },
      get pendingRevealHintTargets() {
        return (scene as unknown as WarehouseSceneThis).pendingRevealHintTargets
      },
      set pendingRevealHintTargets(v) {
        ; (scene as unknown as WarehouseSceneThis).pendingRevealHintTargets = v
      },
      get pendingRevealHintText() {
        return (scene as unknown as WarehouseSceneThis).pendingRevealHintText
      },
      set pendingRevealHintText(v) {
        ; (scene as unknown as WarehouseSceneThis).pendingRevealHintText = v
      },
      get pendingRevealHintSeenIds() {
        return (scene as unknown as WarehouseSceneThis).pendingRevealHintSeenIds
      },
      set pendingRevealHintSeenIds(v) {
        ; (scene as unknown as WarehouseSceneThis).pendingRevealHintSeenIds = v
      },
      get warehouseTrueValue() {
        return scene.warehouseTrueValue
      },
      set warehouseTrueValue(v) {
        scene.warehouseTrueValue = v
      },
      get aiMaxBid() {
        return scene.aiMaxBid
      },
      set aiMaxBid(v) {
        scene.aiMaxBid = v
      },
      get currentBid() {
        return scene.currentBid
      },
      set currentBid(v) {
        scene.currentBid = v
      }
    }

    this.warehouseManager = new WarehouseManager({
      getTextures: () => (this as unknown as WarehouseSceneThis).textures,
      getLoad: () => (this as unknown as WarehouseSceneThis).load,
      getAdd: () => (this as unknown as WarehouseSceneThis).add,
      getTime: () => (this as unknown as WarehouseSceneThis).time,
      getTweens: () => (this as unknown as WarehouseSceneThis).tweens,
      getInput: () => (this as unknown as WarehouseSceneThis).input,
      state: warehouseManagerState,
      dom: this.dom,
      artifactManager: this.artifactManager as unknown as {
        getCandidatesByRevealState(state: Record<string, unknown>): Artifact[]
        getLibraryStats(): { total: number }
        createRandomArtifactForSlot(options: Record<string, unknown>): Artifact
      },
      getRound: () => this.round,
      getSettled: () => this.settled,
      getRoundResolving: () => this.roundResolving,
      getIsSettlementRevealMode: () => this.isSettlementRevealMode,
      getMapCategoryWeights: () => (scene as unknown as WarehouseSceneThis)._mapCategoryWeights,
      getMapQualityWeights: () => (scene as unknown as WarehouseSceneThis)._mapQualityWeights,
      isSettlementPageActive: () => this.isSettlementPageActive(),
      writeLog: (msg: string) => this.aiDecisionManager.writeLog(msg),
      updateHud: () => this.updateHud()
    })

    const aiIntelState: AiIntelState = {
      get aiPrivateIntel() {
        return scene.aiPrivateIntel as unknown as AiIntelState["aiPrivateIntel"]
      },
      set aiPrivateIntel(v) {
        scene.aiPrivateIntel = v as unknown as Record<string, AiPrivateIntel>
      },
      get aiResourceState() {
        return scene.aiResourceState as unknown as AiIntelState["aiResourceState"]
      },
      set aiResourceState(v) {
        scene.aiResourceState = v as unknown as Record<string, unknown>
      },
      get aiRoundEffects() {
        return scene.aiRoundEffects as AiIntelState["aiRoundEffects"]
      },
      set aiRoundEffects(v) {
        scene.aiRoundEffects = v as unknown as Record<string, unknown>
      },
      get lastAiIntelActions() {
        return scene.lastAiIntelActions as unknown as AiIntelState["lastAiIntelActions"]
      },
      set lastAiIntelActions(v) {
        scene.lastAiIntelActions = v as unknown as typeof scene.lastAiIntelActions
      },
      get aiLlmRoundPlans() {
        return scene.aiLlmRoundPlans as unknown as AiIntelState["aiLlmRoundPlans"]
      },
      set aiLlmRoundPlans(v) {
        scene.aiLlmRoundPlans = v as unknown as Record<string, LlmPlan | null>
      },
      get aiFoldState() {
        return scene.aiFoldState as unknown as AiIntelState["aiFoldState"]
      },
      set aiFoldState(v) {
        scene.aiFoldState = v as unknown as Record<string, unknown>
      },
      get aiCharacterAssignments() {
        return (scene as unknown as WarehouseSceneThis).aiCharacterAssignments
      },
      set aiCharacterAssignments(v) {
        ; (scene as unknown as WarehouseSceneThis).aiCharacterAssignments = v
      },
      get aiErrorCorrectionHistory() {
        return (scene as unknown as WarehouseSceneThis).aiErrorCorrectionHistory
      },
      set aiErrorCorrectionHistory(v) {
        ; (scene as unknown as WarehouseSceneThis).aiErrorCorrectionHistory = v
      },
      get highValuePriceThreshold() {
        return scene.highValuePriceThreshold
      },
      set highValuePriceThreshold(v) {
        scene.highValuePriceThreshold = v
      },
      get llmEverUsedThisRun() {
        return scene.llmEverUsedThisRun
      },
      set llmEverUsedThisRun(v) {
        scene.llmEverUsedThisRun = v
      },
      get currentRunLog() {
        return scene.currentRunLog as unknown as AiIntelState["currentRunLog"]
      },
      set currentRunLog(v) {
        scene.currentRunLog = v as unknown as typeof scene.currentRunLog
      }
    }

    this.aiIntelManager = new AiIntelManager({
      state: aiIntelState,
      get players() {
        return scene.players
      },
      get items() {
        return scene.items
      },
      get currentRoundUsage() {
        return scene.currentRoundUsage as Record<string, string[]>
      },
      get roundBidReadyState() {
        return scene.roundBidReadyState as Record<string, boolean>
      },
      getRound: () => this.round,
      isLanMode: () => this.isLanMode,
      isLanHost: () => this.lanIsHost,
      getLanBridge: () => this.lanBridge as unknown as LanBridgeDep | null,
      getLanAiPlayers: () => this.lanAiPlayers as Array<{ id: string }>,
      isRoundResolving: () => this.roundResolving,
      isSettled: () => this.settled,
      isRoundPaused: () => this.roundPaused,
      getRoundTimeLeft: () => this.roundTimeLeft,
      isPlayerBidSubmitted: () => this.playerBidSubmitted,
      artifactManager: this.artifactManager as unknown as ArtifactManagerDep,
      aiEngine: this.aiEngine as unknown as AiEngineDep,
      updatePlayerAvatar: (playerId: string, avatarEl: HTMLElement) => this.updatePlayerAvatar(playerId, avatarEl),
      isInBoundsCell: (x: number, y: number) => (this as unknown as WarehouseSceneThis).isInBoundsCell(x, y),
      isWarehouseCellOccupied: (x: number, y: number) =>
        (this as unknown as WarehouseSceneThis).isWarehouseCellOccupied(x, y),
      pickBottomCellFromTargets: (targets: Artifact[]) =>
        (this as unknown as WarehouseSceneThis).pickBottomCellFromTargets(targets),
      revealOutlineBatch: (
        count: number,
        category: string | null,
        allowCategoryFallback: boolean,
        sortStrategy: string | null
      ) =>
        (this as unknown as WarehouseSceneThis).revealOutlineBatch(
          count,
          category,
          allowCategoryFallback,
          sortStrategy
        ),
      revealQualityBatch: (
        count: number,
        category: string | null,
        allowCategoryFallback: boolean,
        sortStrategy: string | null
      ) =>
        (this as unknown as WarehouseSceneThis).revealQualityBatch(
          count,
          category,
          allowCategoryFallback,
          sortStrategy
        ),
      revealArtifactFullyBatch: (options: {
        count: number
        sortStrategy: string
        category: string | null
        allowCategoryFallback: boolean
      }) => (this as unknown as WarehouseSceneThis).revealArtifactFullyBatch(options),
      revealAllByQuality: (qualityKey: string) => this.warehouseManager.revealAllByQuality(qualityKey),
      revealAllByCategory: (category: string) => this.warehouseManager.revealAllByCategory(category),
      canUseLlmDecisionForPlayer: (playerId: string) => this.canUseLlmDecisionForPlayer(playerId),
      writeLog: (text: string) => this.aiDecisionManager.writeLog(text),
      requestAiLlmErrorCorrection: (
        player: Player,
        plan: LlmPlan,
        error: string,
        history: Array<{ error: string; aiResponse: string; at: number }>,
        messages: ConversationMessage[]
      ) => (this as unknown as WarehouseSceneThis).requestAiLlmErrorCorrection(player, plan, error, history, messages),
      getAiConversationMessages: (playerId: string) =>
        this.aiMemoryManager.getAiConversationMessages(playerId),
      recordPlayerUsage: (playerId: string, actionId: string) => this.recordPlayerUsage(playerId, actionId),
      buildAiToolResultSummary: (result: unknown, actionType: string, actionId: string) =>
        (this as unknown as WarehouseSceneThis).buildAiToolResultSummary(result, actionType, actionId),
      getActionDefById: (actionId: string) => (this as unknown as WarehouseSceneThis).getActionDefById(actionId),
      addPublicInfoEntry: (entry: { source: string; text: string }) => this.addPublicInfoEntry(entry),
      addPrivateIntelEntry: (entry: { source: string; text: string }) => this.addPrivateIntelEntry(entry),
      requestAiLlmFollowupBid: (player: Player, plan: LlmPlanResult | null, toolSummary: string) =>
        (this as unknown as WarehouseSceneThis).requestAiLlmFollowupBid(player, plan, toolSummary),
      setPlayerBidReady: (playerId: string, ready: boolean) =>
        (this as unknown as WarehouseSceneThis).biddingManager.setPlayerBidReady(playerId, ready),
      updateHud: () => this.updateHud(),
      areAllPlayersBidReady: () => (this as unknown as WarehouseSceneThis).areAllPlayersBidReady(),
      resolveRoundBids: (reason: string) => this.resolveRoundBids(reason) as unknown as Promise<void>,
      getItemInfo: (itemId: string) => this.getItemInfo(itemId) as { label?: string } | null,
      waitUntilResumed: () => (this as unknown as WarehouseSceneThis).waitUntilResumed(),
      isAutoPlaying: () => scene.autoplayManager.isActive(),
      getShopInventory: () =>
        (MobaoShopBridge as unknown as { getFullInventory?: () => Record<string, number> }).getFullInventory?.() ?? {},
      consumeShopItem: (itemId: string) => MobaoShopBridge.consumeItem(itemId),
      applyBonus: (id: string, scope: string, condition: string, value: number) => {
        const effects = scene.state.game.bonusEffects
        const existing = effects.find((e) => e.id === id)
        if (existing) {
          existing.scope = scope as BonusEffect["scope"]
          existing.condition = condition as BonusEffect["condition"]
          existing.value = value
        } else {
          effects.push({ id, scope: scope as BonusEffect["scope"], condition: condition as BonusEffect["condition"], value })
        }
        const dir = value >= 0 ? "+" : ""
        return {
          ok: true,
          revealed: 0,
          message: `已应用加成（${scope} ${dir}${(value * 100).toFixed(0)}%）。`,
          actionType: "bonus" as const,
          bonusApplied: true
        }
      },
    })

    this.uiOverlayManager = new UiOverlayManager({
      dom: this.dom,
      get players() {
        return scene.players as unknown as OverlayPlayer[]
      },
      getIsLanMode: () => this.isLanMode,
      getLanIsHost: () => this.lanIsHost,
      getLanBridge: () => this.lanBridge as unknown as OverlayLanBridge,
      getSettled: () => this.settled,
      getRound: () => this.round,
      getRoundTimeLeft: () => this.roundTimeLeft,
      getActionsLeft: () => this.actionsLeft,
      getRunLogHistory: () => this.runLogHistory as RunLog[],
      getAiCharacterAssignments: () => (scene as unknown as WarehouseSceneThis).aiCharacterAssignments,
      getAiReflectionState: () => this.aiReflectionState,
      getAiReflectionStateDetail: () => this.aiReflectionStateDetail,
      getAiReflectionTotal: () => this.aiReflectionTotal,
      getAiReflectionCompleted: () => this.aiReflectionCompleted,
      getTweens: () => (this as unknown as WarehouseSceneThis).tweens as unknown as OverlayTweens,
      setRound: (v: number) => {
        this.round = v
      },
      setRoundTimeLeft: (v: number) => {
        this.roundTimeLeft = v
      },
      setActionsLeft: (v: number) => {
        this.actionsLeft = v
      },
      renderAiLogicPanel: () => (this as unknown as WarehouseSceneThis).renderAiLogicPanel(),
      updateLobbyMoneyDisplay: () => (this as unknown as WarehouseSceneThis).updateLobbyMoneyDisplay(),
      updateHud: () => this.updateHud(),
      closeBidKeypad: () => this.closeBidKeypad(),
      closeItemDrawer: () => this.closeItemDrawer(),
      fillLlmSettingsForm: (settings: Record<string, unknown>) =>
        (this as unknown as WarehouseSceneThis).fillLlmSettingsForm(settings),
      getLlmSettings: () => this.getLlmSettings() as unknown as Record<string, unknown>,
      readLlmSettingsForm: () => (this as unknown as WarehouseSceneThis).readLlmSettingsForm(),
      setLlmSettingsStatus: (text: string, state: string) =>
        (this as unknown as WarehouseSceneThis).setLlmSettingsStatus(text, state),
      getLlmProvider: () => this.getLlmProvider() as unknown as OverlayLlmProvider | null,
      writeLog: (msg: string) => this.aiDecisionManager.writeLog(msg),
      pushRunStartContextToAi: () => this.aiMemoryManager.pushRunStartContextToAi(),
      toggleRoundPause: () => this.roundManager.toggleRoundPause(),
      ensureAiCrossGameMemory: (playerId: string) =>
        this.aiMemoryManager.ensureAiCrossGameMemory(playerId) as unknown as CrossGameMemory,
      shouldShowReflectionUI: () => this.aiReflectionManager.shouldShowReflectionUI(),
      shouldGenerateSummary: () => this.aiMemoryManager.shouldGenerateSummary(),
      isAiMultiGameMemoryEnabled: () => this.aiMemoryManager.isAiMultiGameMemoryEnabled(),
      proceedToNewRun: () => this.aiReflectionManager.proceedToNewRun(),
      proceedToBack: () => this.aiReflectionManager.proceedToBack(),
      setGameConfirmCallback: (v: (() => void) | null) => {
        (scene as unknown as WarehouseSceneThis)._gameConfirmCallback = v
      },
      setGameCancelCallback: (v: (() => void) | null) => {
        (scene as unknown as WarehouseSceneThis)._gameCancelCallback = v
      },
      loadAiFeedbacks: () => scene.aiMemoryManager.loadAiFeedbacks(),
      getAiFeedbacks: () => scene.aiMemoryManager.getAiFeedbacks(),
      deleteAiFeedback: (id: string) => scene.aiMemoryManager.deleteAiFeedback(id),
      clearAiFeedbacks: () => scene.aiMemoryManager.clearAiFeedbacks()
    })

    const lobbyIndexState: LobbyIndexState = {
      get isLanMode() {
        return scene.isLanMode
      },
      set isLanMode(v) {
        scene.isLanMode = v
      },
      get lanIsHost() {
        return scene.lanIsHost
      },
      set lanIsHost(v) {
        scene.lanIsHost = v
      },
      get lanPlayers() {
        return (scene as unknown as WarehouseSceneThis).lanPlayers as unknown as LobbyIndexState["lanPlayers"]
      },
      set lanPlayers(v) {
        ; (scene as unknown as WarehouseSceneThis).lanPlayers = v as unknown as typeof scene.lanPlayers
      },
      get lanAiPlayers() {
        return scene.lanAiPlayers as unknown as LobbyIndexState["lanAiPlayers"]
      },
      set lanAiPlayers(v) {
        scene.lanAiPlayers = v as unknown as (LanPlayer & { llm?: boolean })[]
      },
      get lanHostWallets() {
        return scene.lanHostWallets as unknown as LobbyIndexState["lanHostWallets"]
      },
      set lanHostWallets(v) {
        scene.lanHostWallets = v as unknown as Record<string, number>
      },
      get lanHostBids() {
        return (scene as unknown as WarehouseSceneThis).lanHostBids as unknown as LobbyIndexState["lanHostBids"]
      },
      set lanHostBids(v) {
        ; (scene as unknown as WarehouseSceneThis).lanHostBids = v as unknown as Record<string, number>
      },
      get lanAiLlmEnabled() {
        return scene.lanAiLlmEnabled
      },
      set lanAiLlmEnabled(v) {
        scene.lanAiLlmEnabled = v
      },
      get lanIdToSlotId() {
        return scene.lanIdToSlotId
      },
      set lanIdToSlotId(v) {
        scene.lanIdToSlotId = v
      },
      get slotIdToLanId() {
        return scene.slotIdToLanId
      },
      set slotIdToLanId(v) {
        scene.slotIdToLanId = v
      },
      get lanMySlotId() {
        return scene.lanMySlotId as string | null
      },
      set lanMySlotId(v) {
        scene.lanMySlotId = v as string
      },
      get aiLlmPlayerEnabled() {
        return scene.aiLlmPlayerEnabled
      },
      set aiLlmPlayerEnabled(v) {
        scene.aiLlmPlayerEnabled = v
      },
      get players() {
        return scene.players
      },
      set players(v) {
        scene.players = v
      },
      get playerMoney() {
        return scene.playerMoney
      },
      set playerMoney(v) {
        scene.playerMoney = v
      },
      get items() {
        return scene.items as unknown as LobbyIndexState["items"]
      },
      set items(v) {
        scene.items = v as unknown as Artifact[]
      },
      get itemLayer() {
        return scene.itemLayer as unknown as LobbyIndexState["itemLayer"]
      },
      set itemLayer(v) {
        scene.itemLayer = v as unknown as Phaser.GameObjects.Container | null
      },
      get gridLayer() {
        return scene.gridLayer as unknown as LobbyIndexState["gridLayer"]
      },
      set gridLayer(v) {
        scene.gridLayer = v as unknown as Phaser.GameObjects.Graphics | null
      },
      get revealCellLayer() {
        return scene.revealCellLayer as unknown as LobbyIndexState["revealCellLayer"]
      },
      set revealCellLayer(v) {
        scene.revealCellLayer = v as unknown as Phaser.GameObjects.Graphics | null
      },
      get activeSettlementSpinner() {
        return scene.activeSettlementSpinner as unknown as LobbyIndexState["activeSettlementSpinner"]
      },
      set activeSettlementSpinner(v) {
        scene.activeSettlementSpinner = v as unknown as Phaser.GameObjects.Arc | null
      },
      get carouselOffset() {
        return (scene as unknown as WarehouseSceneThis)._carouselOffset
      },
      set carouselOffset(v) {
        ; (scene as unknown as WarehouseSceneThis)._carouselOffset = v
      },
      get mapQualityWeights() {
        return (scene as unknown as WarehouseSceneThis)._mapQualityWeights
      },
      set mapQualityWeights(v) {
        ; (scene as unknown as WarehouseSceneThis)._mapQualityWeights = v
      },
      get mapCategoryWeights() {
        return (scene as unknown as WarehouseSceneThis)._mapCategoryWeights
      },
      set mapCategoryWeights(v) {
        ; (scene as unknown as WarehouseSceneThis)._mapCategoryWeights = v
      },
      get aiCharacterAssignments() {
        return (scene as unknown as WarehouseSceneThis)
          .aiCharacterAssignments as unknown as LobbyIndexState["aiCharacterAssignments"]
      },
      set aiCharacterAssignments(v) {
        ; (scene as unknown as WarehouseSceneThis).aiCharacterAssignments =
          v as unknown as WarehouseSceneThis["aiCharacterAssignments"]
      },
      get playerHistoryPanels() {
        return scene.playerHistoryPanels as Record<string, HTMLElement | null>
      },
      set playerHistoryPanels(v) {
        scene.playerHistoryPanels = v as unknown as Record<string, unknown>
      }
    }

    this.lobbyIndexManager = new LobbyIndexManager({
      state: lobbyIndexState,
      dom: this.dom,
      getState: () => this.state,
      get lanBridge() { return scene.lanBridge as unknown as LobbyLanBridgeLike | null },
      get game() {
        return (scene as unknown as WarehouseSceneThis).game as unknown as PhaserGameLike | null
      },
      getTweens: () => (this as unknown as WarehouseSceneThis).tweens as unknown as { killAll(): void },
      getTime: () => (this as unknown as WarehouseSceneThis).time as unknown as { removeAllEvents(): void },
      itemManager: this.itemManager as unknown as { items: Array<{ id: string; count?: number }> },
      openSettingsOverlay: () => this.openSettingsOverlay(),
      openCollectionOverlay: () => (this as unknown as WarehouseSceneThis).openCollectionOverlay(),
      openBattleRecordPanel: () => this.openBattleRecordPanel(),
      openShopOverlay: () => this.openShopOverlay(),
      showGameConfirm: (msg: string, onConfirm: () => void) => this.showGameConfirm(msg, onConfirm),
      carouselScroll: (dir: number) => (this as unknown as WarehouseSceneThis).carouselScroll(dir),
      renderCarousel: () => (this as unknown as WarehouseSceneThis).renderCarousel(),
      renderMapDetail: () => (this as unknown as WarehouseSceneThis).renderMapDetail(),
      initLanLobby: () => (this as unknown as WarehouseSceneThis).initLanLobby(),
      showCharacterSelectPage: (mapProfile: { name?: string; params?: Record<string, unknown> } | null) =>
        (this as unknown as WarehouseSceneThis).showCharacterSelectPage(mapProfile),
      stopRoundTimer: () => this.roundManager.stopRoundTimer(),
      exitSettlementPage: () => this.exitSettlementPage(),
      startNewRun: () => this.startNewRun(),
      stopLive2dLoop: () => (this as unknown as WarehouseSceneThis)._stopLive2dLoop(),
      writeLog: (msg: string) => this.aiDecisionManager.writeLog(msg),
      refreshPlayerHistoryUI: () => (this as unknown as WarehouseSceneThis).refreshPlayerHistoryUI()
    })

    // Phase 2: 新增 3 个 Manager 实例化（RoundManager / BiddingManager / LanIndexManager）

    this.roundManager = new RoundManager({
      get roundResolving() {
        return scene.roundResolving
      },
      set roundResolving(v) {
        scene.roundResolving = v
      },
      get roundPaused() {
        return scene.roundPaused
      },
      set roundPaused(v) {
        scene.roundPaused = v
      },
      get actionsLeft() {
        return scene.actionsLeft
      },
      set actionsLeft(v) {
        scene.actionsLeft = v
      },
      get roundTimeLeft() {
        return scene.roundTimeLeft
      },
      set roundTimeLeft(v) {
        scene.roundTimeLeft = v
      },
      get playerBidSubmitted() {
        return scene.playerBidSubmitted
      },
      set playerBidSubmitted(v) {
        scene.playerBidSubmitted = v
      },
      get playerRoundBid() {
        return scene.playerRoundBid
      },
      set playerRoundBid(v) {
        scene.playerRoundBid = v
      },
      get privateIntelEntries() {
        return scene.privateIntelEntries
      },
      get publicInfoEntries() {
        return scene.publicInfoEntries
      },
      get aiLlmRoundPlans() {
        return scene.aiLlmRoundPlans as unknown as Record<string, unknown>
      },
      set aiLlmRoundPlans(v) {
        scene.aiLlmRoundPlans = v as unknown as Record<string, LlmPlan | null>
      },
      get aiRoundDecisionPromise() {
        return scene.aiRoundDecisionPromise as Promise<void> | null
      },
      set aiRoundDecisionPromise(v) {
        scene.aiRoundDecisionPromise = v as Promise<unknown> | null
      },
      get roundTimerId() {
        return scene.roundTimerId
      },
      set roundTimerId(v) {
        scene.roundTimerId = v
      },
      get _pauseSnapshotTimeLeft() {
        return scene._pauseSnapshotTimeLeft
      },
      set _pauseSnapshotTimeLeft(v) {
        scene._pauseSnapshotTimeLeft = v
      },
      get roundBidReadyState() {
        return scene.roundBidReadyState as unknown as Record<string, boolean>
      },
      set roundBidReadyState(v) {
        scene.roundBidReadyState = v as unknown as Record<string, unknown>
      },
      get players() {
        return scene.players as Array<{ id: string }>
      },
      dom: scene.dom as { bidInput: HTMLInputElement | null; pauseRoundBtn: HTMLElement | null },
      getRound: () => scene.round,
      getIsLanMode: () => scene.isLanMode,
      getLanIsHost: () => scene.lanIsHost,
      getSettled: () => scene.settled,
      getLanBridge: () => scene.lanBridge as { togglePause: (paused: boolean, timeLeft: number) => void } | null,
      getTimerSpan: () => scene._timerSpan,
      clearCurrentRoundUsage: () => scene.historyManager.clearCurrentRoundUsage(),
      resetAiRoundResources: () => scene.aiIntelManager.resetAiRoundResources(),
      closeBidKeypad: () => scene.biddingManager.closeBidKeypad(),
      kickoffAiRoundDecisions: () => scene.biddingManager.kickoffAiRoundDecisions(),
      updateHud: () => scene.updateHud(),
      writeLog: (msg: string) => scene.aiDecisionManager.writeLog(msg),
      resolveRoundBids: (reason: string) => scene.resolveRoundBids(reason),
      showLanPauseOverlay: () => scene.showLanPauseOverlay(),
      hideLanPauseOverlay: () => scene.hideLanPauseOverlay(),
      setPlayerBidReady: (slotId: string, ready: boolean) => scene.biddingManager.setPlayerBidReady(slotId, ready)
    })

    this.biddingManager = new BiddingManager({
      dom: scene.dom as Record<string, HTMLElement | null>,
      get players() {
        return scene.players
      },
      get input() {
        return scene.input as unknown as { enabled: boolean } | null
      },
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
      getAiEngine: () =>
        scene.aiEngine as unknown as { buildAIBids: (ctx: Record<string, unknown>) => Record<string, number> } | null,
      getAiLlmRoundPlans: () =>
        scene.aiLlmRoundPlans as unknown as Record<
          string,
          { failed?: boolean; hasBidDecision?: boolean; bid?: number } | null
        >,
      getAiRoundEffects: () => scene.aiRoundEffects as Record<string, unknown>,
      getLanBridge: () => scene.lanBridge as unknown as { submitBid: (bid: number) => void } | null,
      getLastAiDecisionTelemetry: () =>
        scene.lastAiDecisionTelemetry as {
          mode: string
          round: number
          entries?: Array<Record<string, unknown>>
        } | null,
      getRound: () => scene.round,
      getCurrentBid: () => scene.currentBid,
      getBidLeader: () => scene.bidLeader,
      getSecondHighestBid: () => scene.secondHighestBid,
      getPlayerBidSubmitted: () => scene.playerBidSubmitted,
      getPlayerRoundBid: () => scene.playerRoundBid,
      getRoundResolving: () => scene.roundResolving,
      getKeypadValue: () => scene.keypadValue,
      resolveRoundBids: async (reason?: string, forceSettle?: boolean) => {
        // 场景的 resolveRoundBids 声明为 void，实际是 BiddingMixin 代理（async Promise<void>）
        await (scene as unknown as Record<string, (...args: unknown[]) => unknown>).resolveRoundBids(reason, forceSettle)
      },
      closeItemDrawer: () => scene.closeItemDrawer(),
      hideInfoPopup: () => scene.hideInfoPopup(),
      showGameConfirm: (msg: string, onOk: () => void, onCancel?: () => void) =>
        scene.showGameConfirm(msg, onOk, onCancel),
      updateHud: () => scene.updateHud(),
      writeLog: (msg: string) => scene.aiDecisionManager.writeLog(msg),
      setPlayerBidSubmitted: (v: boolean) => {
        scene.playerBidSubmitted = v
      },
      setPlayerRoundBid: (v: number) => {
        scene.playerRoundBid = v
      },
      setCurrentBid: (v: number) => {
        scene.currentBid = v
      },
      setBidLeader: (v: string) => {
        scene.bidLeader = v
      },
      setSecondHighestBid: (v: number) => {
        scene.secondHighestBid = v
      },
      setRound: (v: number) => {
        scene.round = v
      },
      setRoundResolving: (v: boolean) => {
        scene.roundResolving = v
      },
      setKeypadValue: (v: string) => {
        scene.keypadValue = v
      },
      stopRoundTimer: () => scene.roundManager.stopRoundTimer(),
      captureAiDecisionTelemetry: (bids: unknown[]) => scene.captureAiDecisionTelemetry(bids),
      recordAiThoughtLogs: (telemetry: unknown) => scene.aiDecisionManager.recordAiThoughtLogs(telemetry as Record<string, unknown>),
      renderAiLogicPanel: () => scene.renderAiLogicPanel(),
      recordRoundHistory: (roundBids: Array<{ playerId: string; bid: number }>) => scene.recordRoundHistory(roundBids),
      markRoundRanking: (sorted: Array<{ playerId: string; bid: number }>) => scene.markRoundRanking(sorted),
      finishAuction: (winner: { playerId: string; bid: number }, mode: string) => scene.finishAuction(winner, mode),
      startRound: () => scene.roundManager.startRound(),
      processAiDecisions: () => scene.processAiDecisions() as Promise<void>,
      hasAnyInfo: (item: Artifact) => scene.hasAnyInfo(item),
      buildAiIntelSnapshot: () => scene.aiIntelManager.buildAiIntelSnapshot(),
      canUseLlmDecisionForPlayer: (playerId: string) => scene.canUseLlmDecisionForPlayer(playerId),
      getAiWallet: (id: string) => scene.walletManager.getAiWallet(id),
      normalizeAiBidValue: (playerId: string, bid: number, wallet?: number | null) =>
        scene.walletManager.normalizeAiBidValue(playerId, bid, wallet),
      recordPlayerBid: (bid: number) => scene.autoplayManager.recordPlayerBid(bid),
      isAutoPlaying: () => scene.autoplayManager.isActive(),
    })

    // LanIndexManager 状态容器（getter/setter 同步场景属性）
    const lanIndexState: LanIndexState = {
      get isLanMode() {
        return scene.isLanMode
      },
      set isLanMode(v) {
        scene.isLanMode = v
      },
      get lanIsHost() {
        return scene.lanIsHost
      },
      set lanIsHost(v) {
        scene.lanIsHost = v
      },
      get lanPlayers() {
        return (scene as unknown as Record<string, unknown>).lanPlayers as LanPlayer[]
      },
      set lanPlayers(v) {
        ; (scene as unknown as Record<string, unknown>).lanPlayers = v
      },
      get lanAiPlayers() {
        return scene.lanAiPlayers as unknown as LanIndexState["lanAiPlayers"]
      },
      set lanAiPlayers(v) {
        scene.lanAiPlayers = v as unknown as (LanPlayer & { llm?: boolean })[]
      },
      get lanHostWallets() {
        return scene.lanHostWallets
      },
      set lanHostWallets(v) {
        scene.lanHostWallets = v
      },
      get lanHostBids() {
        return (scene as unknown as Record<string, unknown>).lanHostBids as Record<string, number>
      },
      set lanHostBids(v) {
        ; (scene as unknown as Record<string, unknown>).lanHostBids = v
      },
      get lanAiLlmEnabled() {
        return scene.lanAiLlmEnabled
      },
      set lanAiLlmEnabled(v) {
        scene.lanAiLlmEnabled = v
      },
      get lanIdToSlotId() {
        return scene.lanIdToSlotId
      },
      set lanIdToSlotId(v) {
        scene.lanIdToSlotId = v
      },
      get slotIdToLanId() {
        return scene.slotIdToLanId
      },
      set slotIdToLanId(v) {
        scene.slotIdToLanId = v
      },
      get lanMySlotId() {
        return scene.lanMySlotId as string | null
      },
      set lanMySlotId(v) {
        scene.lanMySlotId = v as string
      },
      get lanReconnecting() {
        return scene.lanReconnecting
      },
      set lanReconnecting(v) {
        scene.lanReconnecting = v
      },
      get lanReconnectAttempts() {
        return scene.lanReconnectAttempts
      },
      set lanReconnectAttempts(v) {
        scene.lanReconnectAttempts = v
      },
      get lanMaxReconnectAttempts() {
        return scene.lanMaxReconnectAttempts
      },
      set lanMaxReconnectAttempts(v) {
        scene.lanMaxReconnectAttempts = v
      },
      get lanLastServerUrl() {
        return scene.lanLastServerUrl
      },
      set lanLastServerUrl(v) {
        scene.lanLastServerUrl = v
      },
      get lanLastRoomCode() {
        return scene.lanLastRoomCode
      },
      set lanLastRoomCode(v) {
        scene.lanLastRoomCode = v
      },
      get lanLastPlayerId() {
        return scene.lanLastPlayerId
      },
      set lanLastPlayerId(v) {
        scene.lanLastPlayerId = v
      },
      get lanStatusEl() {
        return (scene as unknown as Record<string, unknown>).lanStatusEl as HTMLElement | null
      },
      set lanStatusEl(v) {
        ; (scene as unknown as Record<string, unknown>).lanStatusEl = v
      },
      get _pauseSnapshotTimeLeft() {
        return scene._pauseSnapshotTimeLeft
      },
      set _pauseSnapshotTimeLeft(v) {
        scene._pauseSnapshotTimeLeft = v
      },
      get round() {
        return scene.round
      },
      set round(v) {
        scene.round = v
      },
      get roundResolving() {
        return scene.roundResolving
      },
      set roundResolving(v) {
        scene.roundResolving = v
      },
      get settled() {
        return scene.settled
      },
      set settled(v) {
        scene.settled = v
      },
      get roundPaused() {
        return scene.roundPaused
      },
      set roundPaused(v) {
        scene.roundPaused = v
      },
      get roundTimeLeft() {
        return scene.roundTimeLeft
      },
      set roundTimeLeft(v) {
        scene.roundTimeLeft = v
      },
      get currentBid() {
        return scene.currentBid
      },
      set currentBid(v) {
        scene.currentBid = v
      },
      get bidLeader() {
        return scene.bidLeader as string | null
      },
      set bidLeader(v) {
        scene.bidLeader = v as string
      },
      get secondHighestBid() {
        return scene.secondHighestBid
      },
      set secondHighestBid(v) {
        scene.secondHighestBid = v
      },
      get playerBidSubmitted() {
        return scene.playerBidSubmitted
      },
      set playerBidSubmitted(v) {
        scene.playerBidSubmitted = v
      },
      get playerRoundBid() {
        return scene.playerRoundBid
      },
      set playerRoundBid(v) {
        scene.playerRoundBid = v
      },
      get playerMoney() {
        return scene.playerMoney
      },
      set playerMoney(v) {
        scene.playerMoney = v
      },
      get actionsLeft() {
        return scene.actionsLeft
      },
      set actionsLeft(v) {
        scene.actionsLeft = v
      },
      get selectedItem() {
        return scene.selectedItem
      },
      set selectedItem(v) {
        scene.selectedItem = v as Artifact | null
      },
      get warehouseTrueValue() {
        return scene.warehouseTrueValue
      },
      set warehouseTrueValue(v) {
        scene.warehouseTrueValue = v
      },
      get aiMaxBid() {
        return scene.aiMaxBid
      },
      set aiMaxBid(v) {
        scene.aiMaxBid = v
      },
      get moneySettledRunToken() {
        return scene.moneySettledRunToken
      },
      set moneySettledRunToken(v) {
        scene.moneySettledRunToken = v as string | null
      },
      get settlementRevealRunning() {
        return scene.settlementRevealRunning
      },
      set settlementRevealRunning(v) {
        scene.settlementRevealRunning = v
      },
      get aiRoundDecisionPromise() {
        return scene.aiRoundDecisionPromise as Promise<void> | null
      },
      set aiRoundDecisionPromise(v) {
        scene.aiRoundDecisionPromise = v as Promise<unknown> | null
      },
      get currentPublicEvent() {
        return scene.currentPublicEvent as unknown as { category: string; text: string } | null
      },
      set currentPublicEvent(v) {
        scene.currentPublicEvent = v as unknown as { id: string; text: string; category: string } | null
      },
      get privateIntelEntries() {
        return scene.privateIntelEntries as unknown[]
      },
      set privateIntelEntries(v) {
        scene.privateIntelEntries = v as Array<{ source: string; text: string; round: number }>
      },
      get publicInfoEntries() {
        return scene.publicInfoEntries as Array<{ source: string; text: string }>
      },
      set publicInfoEntries(v) {
        scene.publicInfoEntries = v
      },
      get battleRecordReplayActive() {
        return scene.battleRecordReplayActive
      },
      set battleRecordReplayActive(v) {
        scene.battleRecordReplayActive = v
      },
      get battleRecordReplayRecordId() {
        return scene.battleRecordReplayRecordId
      },
      set battleRecordReplayRecordId(v) {
        scene.battleRecordReplayRecordId = v
      },
      get _mapQualityWeights() {
        return (scene as unknown as Record<string, unknown>)._mapQualityWeights as Record<string, number> | null
      },
      set _mapQualityWeights(v) {
        ; (scene as unknown as Record<string, unknown>)._mapQualityWeights = v
      },
      get _mapCategoryWeights() {
        return (scene as unknown as Record<string, unknown>)._mapCategoryWeights as Record<string, number> | null
      },
      set _mapCategoryWeights(v) {
        ; (scene as unknown as Record<string, unknown>)._mapCategoryWeights = v
      },
      get players() {
        return scene.players
      },
      set players(v) {
        scene.players = v
      },
      get items() {
        return scene.items as Artifact[]
      },
      set items(v) {
        scene.items = v
      },
      get aiLlmPlayerEnabled() {
        return scene.aiLlmPlayerEnabled
      },
      set aiLlmPlayerEnabled(v) {
        scene.aiLlmPlayerEnabled = v
      },
      get aiWallets() {
        return scene.aiWallets
      },
      set aiWallets(v) {
        scene.aiWallets = v
      },
      get aiRoundEffects() {
        return scene.aiRoundEffects
      },
      set aiRoundEffects(v) {
        scene.aiRoundEffects = v
      },
      get aiLlmRoundPlans() {
        return scene.aiLlmRoundPlans as unknown as Record<string, unknown>
      },
      set aiLlmRoundPlans(v) {
        scene.aiLlmRoundPlans = v as unknown as Record<string, LlmPlan | null>
      },
      get lastAiDecisionTelemetry() {
        return scene.lastAiDecisionTelemetry
      },
      set lastAiDecisionTelemetry(v) {
        scene.lastAiDecisionTelemetry = v as { mode: string; round: number; entries: LlmTelemetry[] } | null
      },
      get playerUsageHistory() {
        return scene.playerUsageHistory as Record<string, Array<{ round: number; actions: string[] }>>
      },
      set playerUsageHistory(v) {
        scene.playerUsageHistory = v as unknown as Record<string, unknown>
      },
      get playerHistoryPanels() {
        return scene.playerHistoryPanels as Record<string, HTMLElement | null>
      },
      set playerHistoryPanels(v) {
        scene.playerHistoryPanels = v as unknown as Record<string, unknown>
      },
      get revealedCells() {
        return scene.revealedCells as boolean[][]
      },
      set revealedCells(v) {
        scene.revealedCells = v
      },
      get itemLayer() {
        return scene.itemLayer as unknown as { destroy: (b: boolean) => void } | null
      },
      set itemLayer(v) {
        scene.itemLayer = v as typeof scene.itemLayer
      },
      get gridLayer() {
        return scene.gridLayer as unknown as { destroy: (b: boolean) => void } | null
      },
      set gridLayer(v) {
        scene.gridLayer = v as typeof scene.gridLayer
      },
      get revealCellLayer() {
        return scene.revealCellLayer as unknown as { destroy: (b: boolean) => void } | null
      },
      set revealCellLayer(v) {
        scene.revealCellLayer = v as typeof scene.revealCellLayer
      },
      get warehouseCellIndex() {
        return scene.warehouseCellIndex as unknown as Record<string, string>
      },
      set warehouseCellIndex(v) {
        scene.warehouseCellIndex = v as unknown as Record<string, Artifact | null>
      }
    }

    this.lanIndexManager = new LanIndexManager({
      state: lanIndexState,
      getLanBridge: () => scene.lanBridge as unknown as LanBridgeLike | null,
      createLanBridge: () => {
        // LanBridge 是全局类（types/globals.d.ts 声明），运行时由 lan/client/lan-bridge.ts 提供
        const LB = LanBridge as unknown as new () => LanBridgeLike
        return new LB()
      },
      setLanBridge: (bridge) => {
        scene.lanBridge = bridge as unknown as typeof scene.lanBridge
      },
      writeLog: (text: string) => scene.aiDecisionManager.writeLog(text),
      setOnlineStatus: (text: string, cls: string) =>
        (scene as unknown as Record<string, (...args: unknown[]) => unknown>).setOnlineStatus(text, cls),
      showGameConfirm: (msg: string, onConfirm: () => void) => scene.showGameConfirm(msg, onConfirm),
      stopRoundTimer: () => scene.roundManager.stopRoundTimer(),
      startRound: () => scene.roundManager.startRound(),
      updateHud: () => scene.updateHud(),
      beginRunTracking: () => scene.aiDecisionManager.beginRunTracking(),
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
      initAiWallets: () => scene.walletManager.initAiWallets(),
      initAiIntelSystems: () => scene.aiIntelManager.initAiIntelSystems(),
      makeRunToken: () => scene.makeRunToken(),
      syncItemManagerFromShop: () => scene.syncItemManagerFromShop(),
      revealRoundBidsSequential: (bids: Array<{ playerId: string; bid: number }>) =>
        scene.revealRoundBidsSequential(bids),
      recordRoundHistory: (bids: Array<{ playerId: string; bid: number }>) => scene.recordRoundHistory(bids),
      finishAuction: (winner: { playerId: string; bid: number }, mode: string) => scene.finishAuction(winner, mode),
      captureAiDecisionTelemetry: (slotBids: Array<{ playerId: string; bid: number }>) =>
        scene.captureAiDecisionTelemetry(slotBids),
      recordAiThoughtLogs: (telemetry: unknown) => scene.aiDecisionManager.recordAiThoughtLogs(telemetry as Record<string, unknown>),
      renderAiLogicPanel: () => scene.renderAiLogicPanel(),
      waitUntilResumed: () => scene.waitUntilResumed() as Promise<void>,
      setPlayerBidReady: (playerId: string, ready: boolean) => scene.biddingManager.setPlayerBidReady(playerId, ready),
      syncPauseButton: () => scene.roundManager.syncPauseButton(),
      showLanPauseOverlay: () => (scene as unknown as Record<string, (...args: unknown[]) => unknown>).showLanPauseOverlay(),
      hideLanPauseOverlay: () => (scene as unknown as Record<string, (...args: unknown[]) => unknown>).hideLanPauseOverlay(),
      enterLanRoom: () => scene.enterLanRoom(),
      exitLanRoom: () => scene.exitLanRoom(),
      exitLobby: () => scene.exitLobby(),
      showLanRestartVoteDialog: (hostName: string) =>
        (scene as unknown as Record<string, (...args: unknown[]) => unknown>).showLanRestartVoteDialog(hostName),
      removeLanRestartDialog: () => (scene as unknown as Record<string, (...args: unknown[]) => unknown>).removeLanRestartDialog(),
      showLanRestartDeclinedDialog: (decliner: string) =>
        (scene as unknown as Record<string, (...args: unknown[]) => unknown>).showLanRestartDeclinedDialog(decliner),
      refreshRevealScrollHints: () => scene.refreshRevealScrollHints(),
      refreshPlayerHistoryUI: () => (scene as unknown as Record<string, (...args: unknown[]) => unknown>).refreshPlayerHistoryUI(),
      renderPublicInfoPanel: () => scene.renderPublicInfoPanel(),
      addPublicInfoEntry: (entry: { source: string; text: string }) => scene.addPublicInfoEntry(entry),
      recordPlayerUsage: (playerId: string, actionId: string) => scene.recordPlayerUsage(playerId, actionId),
      isAiLlmEnabledForPlayer: (playerId: string) => scene.isAiLlmEnabledForPlayer(playerId),
      canUseLlmDecisionForPlayer: (playerId: string) => scene.canUseLlmDecisionForPlayer(playerId),
      normalizeAiBidValue: (playerId: string, bid: number, wallet: number) =>
        scene.walletManager.normalizeAiBidValue(playerId, bid, wallet),
      updateLobbyMoneyDisplay: () => (scene as unknown as Record<string, (...args: unknown[]) => unknown>).updateLobbyMoneyDisplay(),
      getLastRoundBidMap: () => scene.getLastRoundBidMap(),
      buildAiIntelSnapshot: () => scene.aiIntelManager.buildAiIntelSnapshot(),
      hasAnyInfo: (item: Artifact) => scene.hasAnyInfo(item),
      renderItem: (item: Artifact) => scene.renderItem(item),
      addContainer: () => scene.add.container(0, 0),
      aiEngine: scene.aiEngine as unknown as {
        buildAIBids: (args: Record<string, unknown>) => Record<string, number>
        resetForNewRun: (args: Record<string, unknown>) => void
      },
      skillManager: scene.skillManager as unknown as { onNewRound: () => void; resetForNewRun: () => void },
      getProfile: null,
      getSelectedProfileId: null,
      getSettingsMaxRounds: () => scene.state.settings.maxRounds,
      getSettingsDirectTakeRatio: () => scene.state.settings.directTakeRatio,
      setSettingsMaxRounds: (v: number) => {
        scene.state.settings.maxRounds = v
      },
      setSettingsDirectTakeRatio: (v: number) => {
        scene.state.settings.directTakeRatio = v
      }
    })

    this.autoplayManager = new AutoPlayManager({
      isLanMode: () => scene.isLanMode,
      updateHud: () => scene.updateHud(),
      getRound: () => scene.round,
      canUseLlmDecision: () => scene.canUseLlmDecision(),
      getP2Conversation: () => (scene.state.ai.aiConversationByPlayer["p2"] || []) as { round: number; bid: number; skill: string; item: string; thought: string; result: string }[],
      setP2Conversation: (v) => {
        scene.state.ai.aiConversationByPlayer["p2"] = v as unknown as ConversationMessage[]
      },
    })

    this.syncItemManagerFromShop()
    this.aiMemoryManager.restoreAiMemoryFromStorage()
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
  hideSettleOverlay!: WarehouseMixinMethods["hideSettleOverlay"]

  // ===== Warehouse 方法（原 Mixin 代理，现为类方法）=====

  // 预览方法 (preview.ts)
  positionPreview(canvasX: number, canvasY: number): void {
    return this.warehouseManager.positionPreview(canvasX, canvasY)
  }

  applyPreviewPosition(): void {
    return this.warehouseManager.applyPreviewPosition()
  }

  repositionPreview(): void {
    return this.warehouseManager.repositionPreview()
  }

  hidePreview(): void {
    return this.warehouseManager.hidePreview()
  }

  setupPreviewTouchScroll(): void {
    return this.warehouseManager.setupPreviewTouchScroll()
  }

  isPointOnSettlementLockedItem(x: number, y: number): boolean {
    return this.warehouseManager.isPointOnSettlementLockedItem(x, y)
  }

  renderPreviewCandidates(item: Artifact): void {
    return this.warehouseManager.renderPreviewCandidates(item)
  }

  renderSettlementItemPreview(item: Artifact): void {
    return this.warehouseManager.renderSettlementItemPreview(item)
  }

  // 核心方法 (core.ts)
  preloadArtifactImages(): void {
    return this.warehouseManager.preloadArtifactImages()
  }

  drawUnknownWarehouse(): void {
    return this.warehouseManager.drawUnknownWarehouse()
  }

  drawGridLines(): void {
    return this.warehouseManager.drawGridLines()
  }

  guardWarehouseCapacity(): void {
    return this.warehouseManager.guardWarehouseCapacity()
  }

  spawnRandomItems(): void {
    return this.warehouseManager.spawnRandomItems()
  }

  setupWarehouseAuction(): void {
    return this.warehouseManager.setupWarehouseAuction()
  }

  findFirstEmptySlot(occupancy: boolean[][]): { col: number; row: number } | null {
    return this.warehouseManager.findFirstEmptySlot(occupancy)
  }

  placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]): void {
    return this.warehouseManager.placeItem(item, slot, occupancy)
  }

  rebuildWarehouseCellIndex(): void {
    return this.warehouseManager.rebuildWarehouseCellIndex()
  }

  isInBoundsCell(x: number, y: number): boolean {
    return this.warehouseManager.isInBoundsCell(x, y)
  }

  isWarehouseCellOccupied(x: number, y: number): boolean {
    return this.warehouseManager.isWarehouseCellOccupied(x, y)
  }

  renderItem(item: Artifact): void {
    return this.warehouseManager.renderItem(item)
  }

  onArtifactClicked(item: Artifact, pointer: { x: number; y: number }): void {
    return this.warehouseManager.onArtifactClicked(item, pointer)
  }

  hasAnyInfo(item: Artifact): boolean {
    return this.warehouseManager.hasAnyInfo(item)
  }

  getItemKnownText(item: Artifact): string {
    return this.warehouseManager.getItemKnownText(item)
  }

  // 揭示方法 (reveal.ts)
  revealOutlineBatch(
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ): { ok: boolean; revealed: number; message?: string; bottomCell?: { x: number; y: number; col: number; row: number } | null } {
    return this.warehouseManager.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy)
  }

  revealQualityBatch(
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ): { ok: boolean; revealed: number; message?: string } {
    return this.warehouseManager.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy)
  }

  revealArtifactFully(item: Artifact, options: Record<string, unknown> = {}): { ok: boolean; item?: Artifact; message: string } {
    return this.warehouseManager.revealArtifactFully(item, options)
  }

  revealArtifactFullyBatch({
    count,
    sortStrategy,
    category,
    allowCategoryFallback
  }: {
    count: number
    sortStrategy: string | null
    category: string | null
    allowCategoryFallback: boolean
  }): { ok: boolean; revealed: number; message?: string; items?: Artifact[]; bottomCell?: { x: number; y: number; col: number; row: number } | null } {
    return this.warehouseManager.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback })
  }

  playFullRevealEffect(item: Artifact): void {
    return this.warehouseManager.playFullRevealEffect(item)
  }

  pickBottomCellFromTargets(targets: Artifact[]): { x: number; y: number; col: number; row: number } | null {
    return this.warehouseManager.pickBottomCellFromTargets(targets)
  }

  hideRevealScrollHints(): void {
    return this.warehouseManager.hideRevealScrollHints()
  }

  showRevealScrollHintsForTargets(targets: Artifact[], message: string): void {
    return this.warehouseManager.showRevealScrollHintsForTargets(targets, message)
  }

  refreshRevealScrollHints(): void {
    return this.warehouseManager.refreshRevealScrollHints()
  }

  pickRevealTargets({
    mode,
    count,
    category,
    allowCategoryFallback,
    sortStrategy
  }: {
    mode: string
    count: number
    category: string | null
    allowCategoryFallback: boolean
    sortStrategy: string | null
  }): Artifact[] {
    return this.warehouseManager.pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy })
  }

  revealOutline(item: Artifact, options: Record<string, unknown> = {}): void {
    return this.warehouseManager.revealOutline(item, options)
  }

  revealQualityCell(item: Artifact, options: Record<string, unknown> = {}): void {
    return this.warehouseManager.revealQualityCell(item, options)
  }

  playOutlineRevealEffect(item: Artifact): void {
    return this.warehouseManager.playOutlineRevealEffect(item)
  }

  playQualityRevealEffect(item: Artifact): void {
    return this.warehouseManager.playQualityRevealEffect(item)
  }

  clearQualityVisual(item: Artifact, keepImage: boolean = false): void {
    return this.warehouseManager.clearQualityVisual(item, keepImage)
  }

  renderQualityVisual(item: Artifact, options: Record<string, unknown> = {}): void {
    return this.warehouseManager.renderQualityVisual(item, options)
  }

  syncQualityMarkersForOutlinedItem(item: Artifact, options: Record<string, unknown> = {}): void {
    return this.warehouseManager.syncQualityMarkersForOutlinedItem(item, options)
  }

  revealCell(col: number, row: number): void {
    return this.warehouseManager.revealCell(col, row)
  }
  showAiMemoryExportDialog!: WarehouseMixinMethods["showAiMemoryExportDialog"]
  removeAiMemoryExportDialog!: WarehouseMixinMethods["removeAiMemoryExportDialog"]
  showAiMemoryImportDialog!: WarehouseMixinMethods["showAiMemoryImportDialog"]
  removeAiMemoryImportDialog!: WarehouseMixinMethods["removeAiMemoryImportDialog"]
  downloadAiMemoryFallback!: WarehouseMixinMethods["downloadAiMemoryFallback"]
  startRound!: WarehouseMixinMethods["startRound"]
  stopRoundTimer!: WarehouseMixinMethods["stopRoundTimer"]
  toggleRoundPause!: WarehouseMixinMethods["toggleRoundPause"]
  resolveRoundBids!: WarehouseMixinMethods["resolveRoundBids"]
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
  openAiFeedbackPanel!: WarehouseMixinMethods["openAiFeedbackPanel"]
  closeAiFeedbackPanel!: WarehouseMixinMethods["closeAiFeedbackPanel"]
  refreshAiFeedbackList!: WarehouseMixinMethods["refreshAiFeedbackList"]
  removeAiFeedback!: WarehouseMixinMethods["removeAiFeedback"]
  clearAllAiFeedbacks!: WarehouseMixinMethods["clearAllAiFeedbacks"]
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
}

export { WarehouseScene }
