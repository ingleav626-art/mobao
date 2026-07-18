/**
 * @file intel-manager.ts
 * @module ai/intel-manager
 * @description AiIntelManager -- 薄协调器（~140 行），37 个方法全部委托给 intel-manager/ 下
 *              5 个函数模块。依赖注入、状态容器、类型定义保留在此。
 */
import type { Player, Artifact, PassiveEffect, RevealResult } from "../../../types/game"
import type {
  AiPrivateIntelPool,
  AiIntelSignal,
  AiItemKnowledge,
  AiSignalStats,
  IntelSummary,
  IntelActionPlan,
  ToolEffect,
  ActionDef,
  ConversationMessage
} from "../../../types/ai"
import type { LlmPlan, LlmPlanResult } from "../../../types/llm"
import type { RunLog } from "./decision"

import {
  initAiIntelSystems,
  refreshAllPlayerAvatars,
  resetAiRoundResources,
  ensureAiPrivateIntel,
  getHighValuePriceThreshold,
  isHighValueArtifact
} from "./intel-manager/init-fns"
import {
  getAiIntelSummary,
  buildAiIntelSnapshot,
  getAiResourceSnapshot,
  getAiAvailableActionState,
  buildAiActionConstraintBlock
} from "./intel-manager/snapshot-fns"
import {
  buildSkillContext,
  buildAiPrivateRevealContext,
  markAiKnownCellState,
  scanNeighborIntelAroundCell,
  markAllItemCellsAsOccupied,
  scanItemBoundaryNeighbors,
  buildAiPrivateSignal,
  ensureAiItemKnowledge,
  ensureAiHighValueTrack,
  updateAiItemKnowledge,
  revealPrivateIntelBatch,
  revealPrivateIntelFully,
  pickPrivateRevealTargets
} from "./intel-manager/reveal-fns"
import {
  getPlayerById,
  getAiNeighborStateLabel,
  buildNeighborSnapshot,
  buildAiAggregateIntelBlock,
  buildTrackCandidatePreview,
  buildAiHighValueTrackBlock,
  buildAiPrivateIntelBlock
} from "./intel-manager/panel-fns"
import {
  executeAiIntelAction,
  processAiIntelActions,
  processSingleAiIntelAction,
  formatAiIntelActionPublicLine,
  canUseIntelActions
} from "./intel-manager/action-fns"
import { pickRandomItemCell } from "./intel/pure"

// ─── 类型定义 ───

/** AI 情报动作记录（lastAiIntelActions 数组元素类型） */
export interface LastAiIntelAction {
  playerId: string
  playerName: string
  actionType: string
  actionId: string
  revealed: number
  detail: string
  score: number
  effectTag: string
  signalStats: AiSignalStats | null
}

/** AI 角色分配（aiCharacterAssignments 值类型） */
export interface AiCharacterAssignment {
  characterId: string
  characterName?: string
  skillId: string
  skillName: string
  passive: PassiveEffect | null
}

/** AI 情报可变状态容器（Manager 直接读写） */
export interface AiIntelState {
  aiPrivateIntel: Record<string, AiPrivateIntelPool>
  aiResourceState: Record<string, { skills: Record<string, number>; items: Record<string, number> }>
  aiRoundEffects: Record<string, unknown>
  lastAiIntelActions: LastAiIntelAction[]
  aiLlmRoundPlans: Record<string, unknown>
  aiFoldState: Record<string, boolean>
  aiCharacterAssignments: Record<string, AiCharacterAssignment>
  aiErrorCorrectionHistory: Record<string, Array<{ error: string; aiResponse: string; at: number }>>
  highValuePriceThreshold: number | null
  llmEverUsedThisRun: boolean
  currentRunLog: RunLog | null
}

/** ArtifactManager 子集（情报系统所需） */
export interface ArtifactManagerDep {
  getSignalPriceStats(signals: AiIntelSignal[]): { aggregate: AiSignalStats; latest: AiSignalStats }
  getCandidatesByRevealState(state: {
    qualityKey: string | null
    category: string | null
    sizeTag: string | null
  }): Array<{
    name: string
    basePrice: number
    w: number
    h: number
    expectedPrice: number
    previewSizeTag: string
    qualityKey: string
  }>
}

/** AiEngine 子集（情报系统所需） */
export interface AiEngineDep {
  planIntelAction(args: {
    playerId: string
    round: number
    maxRounds: number
    intelSummary: IntelSummary
    resources: { skills: Record<string, number>; items: Record<string, number> }
  }): IntelActionPlan
  buildToolEffect(args: {
    playerId: string
    actionType: string
    actionId: string
    roundProgress: number
    intelSummary: IntelSummary
    signalStats: AiSignalStats | null
    planScore: number
  }): ToolEffect
}

/** LanBridge 子集（情报系统所需） */
export interface LanBridgeDep {
  send(msg: unknown): void
}

/** AiIntelManager 依赖接口 */
export interface AiIntelManagerDeps {
  // ── 可变状态容器 ──
  state: AiIntelState

  // ── 只读引用 ──
  players: Player[]
  items: Artifact[]
  currentRoundUsage: Record<string, string[]>
  roundBidReadyState: Record<string, boolean>

  // ── 动态值 getter ──
  getRound: () => number
  isLanMode: () => boolean
  isLanHost: () => boolean
  getLanBridge: () => LanBridgeDep | null
  getLanAiPlayers: () => Array<{ id: string }>
  isRoundResolving: () => boolean
  isSettled: () => boolean
  isRoundPaused: () => boolean
  getRoundTimeLeft: () => number
  isPlayerBidSubmitted: () => boolean

  // ── 外部对象 ──
  artifactManager: ArtifactManagerDep
  aiEngine: AiEngineDep

  // ── 外部场景方法 ──
  updatePlayerAvatar: (playerId: string, avatarEl: HTMLElement) => void
  isInBoundsCell: (x: number, y: number) => boolean
  isWarehouseCellOccupied: (x: number, y: number) => boolean
  pickBottomCellFromTargets: (targets: Artifact[]) => { x: number; y: number; col: number; row: number } | null
  revealOutlineBatch: (
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ) => unknown
  revealQualityBatch: (
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ) => unknown
  revealArtifactFullyBatch: (options: {
    count: number
    sortStrategy: string
    category: string | null
    allowCategoryFallback: boolean
  }) => unknown
  revealAllByQuality?: (qualityKey: string) => { ok: boolean; revealed: number; message: string }
  revealAllByCategory?: (category: string) => { ok: boolean; revealed: number; message: string }
  canUseLlmDecisionForPlayer: (playerId: string) => boolean
  writeLog: (text: string) => void
  requestAiLlmErrorCorrection: (
    player: Player,
    plan: LlmPlan,
    error: string,
    history: Array<{ error: string; aiResponse: string; at: number }>,
    messages: ConversationMessage[]
  ) => Promise<LlmPlanResult | null>
  getAiConversationMessages: (playerId: string) => ConversationMessage[]
  recordPlayerUsage: (playerId: string, actionId: string) => void
  buildAiToolResultSummary: (result: unknown, actionType: string, actionId: string) => string
  getActionDefById: (actionId: string) => ActionDef
  addPublicInfoEntry: (entry: { source: string; text: string }) => void
  addPrivateIntelEntry?: (entry: { source: string; text: string }) => void
  requestAiLlmFollowupBid: (
    player: Player,
    plan: LlmPlanResult | null,
    toolSummary: string
  ) => Promise<LlmPlanResult | null>
  setPlayerBidReady: (playerId: string, ready: boolean) => void
  updateHud: () => void
  areAllPlayersBidReady: () => boolean
  resolveRoundBids: (reason: string) => Promise<void>
  getItemInfo: (itemId: string) => { label?: string } | null
  waitUntilResumed: () => Promise<void>
  isAutoPlaying?: () => boolean
  getShopInventory?: () => Record<string, number>
  consumeShopItem?: (itemId: string) => void
  applyBonus?: (id: string, scope: string, condition: string, value: number) => { ok: boolean; revealed: number; message: string }
}

/**
 * AI 情报系统管理器（薄协调器）。
 *
 * 37 个方法全部委托给 intel-manager/ 下 5 个函数模块。
 * 类型定义、依赖接口、状态容器保留在此。
 */
export class AiIntelManager {
  constructor(private readonly deps: AiIntelManagerDeps) { }

  // ═════════════ 初始化方法（init-fns.ts） ═════════════

  initAiIntelSystems(): void {
    return initAiIntelSystems(this.deps)
  }
  refreshAllPlayerAvatars(): void {
    return refreshAllPlayerAvatars(this.deps)
  }
  resetAiRoundResources(): void {
    return resetAiRoundResources(this.deps)
  }
  ensureAiPrivateIntel(playerId: string): AiPrivateIntelPool {
    return ensureAiPrivateIntel(this.deps.state, playerId)
  }

  // ═════════════ 摘要快照方法（snapshot-fns.ts） ═════════════

  getAiIntelSummary(playerId: string): IntelSummary & {
    clueCount: number
    outlineCount: number
    qualityCount: number
    signalCount: number
    meanEstimate: number
    std: number
    iqr: number
  } {
    return getAiIntelSummary(this.deps, playerId)
  }

  buildAiIntelSnapshot(): Record<string, IntelSummary> {
    return buildAiIntelSnapshot(this.deps)
  }

  getAiResourceSnapshot(playerId: string): { skills: Record<string, number>; items: Record<string, number> } {
    return getAiResourceSnapshot(this.deps, playerId)
  }

  getAiAvailableActionState(playerId: string): {
    availableSkillIds: string[]
    availableItemIds: string[]
    availableSkillNames: string[]
    availableItemNames: string[]
  } {
    return getAiAvailableActionState(this.deps, playerId)
  }

  buildAiActionConstraintBlock(playerId: string): {
    canBid: boolean
    canFold: boolean
    availableSkills: string[]
    availableItems: string[]
    notes: string[]
    _internal: {
      availableSkillIds: string[]
      availableItemIds: string[]
      availableSkillNames: string[]
      availableItemNames: string[]
    }
  } {
    return buildAiActionConstraintBlock(this.deps, playerId)
  }

  // ═════════════ 揭示执行方法（reveal-fns.ts） ═════════════

  buildSkillContext(): ReturnType<typeof buildSkillContext> {
    return buildSkillContext(this.deps)
  }

  buildAiPrivateRevealContext(playerId: string): ReturnType<typeof buildAiPrivateRevealContext> {
    return buildAiPrivateRevealContext(this.deps, this.deps.state, playerId)
  }

  pickRandomItemCell(item: Artifact): { x: number; y: number } | null {
    return pickRandomItemCell(item)
  }

  markAiKnownCellState(playerId: string, x: number, y: number, state: string): void {
    return markAiKnownCellState(this.deps.state, playerId, x, y, state)
  }

  scanNeighborIntelAroundCell(playerId: string, x: number, y: number): void {
    return scanNeighborIntelAroundCell(this.deps, this.deps.state, playerId, x, y)
  }

  markAllItemCellsAsOccupied(playerId: string, item: Artifact): void {
    return markAllItemCellsAsOccupied(this.deps, this.deps.state, playerId, item)
  }

  scanItemBoundaryNeighbors(playerId: string, item: Artifact): void {
    return scanItemBoundaryNeighbors(this.deps, this.deps.state, playerId, item)
  }

  buildAiPrivateSignal(playerId: string, item: Artifact, mode: string): AiIntelSignal {
    return buildAiPrivateSignal(this.deps, this.deps.state, playerId, item, mode)
  }

  ensureAiItemKnowledge(playerId: string, itemId: string): AiItemKnowledge {
    return ensureAiItemKnowledge(this.deps.state, playerId, itemId)
  }

  getHighValuePriceThreshold(): number {
    return getHighValuePriceThreshold(this.deps)
  }

  isHighValueArtifact(item: Artifact): boolean {
    return isHighValueArtifact(this.deps, item)
  }

  ensureAiHighValueTrack(playerId: string, item: Artifact): { trackId: string; created: boolean } | null {
    return ensureAiHighValueTrack(this.deps, this.deps.state, playerId, item)
  }

  updateAiItemKnowledge(
    playerId: string,
    item: Artifact,
    signal: { sampleCell?: { x: number; y: number } } | null,
    mode: string
  ): AiItemKnowledge & {
    trackUpdate?: {
      trackId: string
      revealLevel: string
      confirmed: { quality: string; category: string; exactArtifact: string | null }
      candidates: { total: number; truncated: boolean }
    }
  } {
    return updateAiItemKnowledge(this.deps, this.deps.state, playerId, item, signal, mode)
  }

  revealPrivateIntelBatch(
    playerId: string,
    mode: string,
    count: number,
    category: string | null,
    allowCategoryFallback = false,
    sortStrategy: string | null
  ): ReturnType<typeof revealPrivateIntelBatch> {
    return revealPrivateIntelBatch(
      this.deps,
      this.deps.state,
      playerId,
      mode,
      count,
      category,
      allowCategoryFallback,
      sortStrategy
    )
  }

  revealPrivateIntelFully(
    playerId: string,
    opts: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }
  ): ReturnType<typeof revealPrivateIntelFully> {
    return revealPrivateIntelFully(this.deps, this.deps.state, playerId, opts)
  }

  pickPrivateRevealTargets(opts: {
    playerId: string
    mode: string
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }): Artifact[] {
    return pickPrivateRevealTargets(this.deps, this.deps.state, opts)
  }

  // ═════════════ 面板渲染方法（panel-fns.ts） ═════════════

  getPlayerById(playerId: number | string): Player | null {
    return getPlayerById(this.deps, playerId)
  }

  getAiNeighborStateLabel(playerId: string | number, x: number, y: number): string {
    return getAiNeighborStateLabel(this.deps, this.deps.state, playerId, x, y)
  }

  buildNeighborSnapshot(playerId: string, cell: { x: number; y: number } | null): Record<string, string> | null {
    return buildNeighborSnapshot(this.deps, this.deps.state, playerId, cell)
  }

  buildAiAggregateIntelBlock(playerId: string): ReturnType<typeof buildAiAggregateIntelBlock> {
    return buildAiAggregateIntelBlock(this.deps, this.deps.state, playerId)
  }

  buildTrackCandidatePreview(revealState: {
    qualityKey: string | null
    category: string | null
    sizeTag: string | null
  }): ReturnType<typeof buildTrackCandidatePreview> {
    return buildTrackCandidatePreview(this.deps, revealState)
  }

  buildAiHighValueTrackBlock(playerId: string): ReturnType<typeof buildAiHighValueTrackBlock> {
    return buildAiHighValueTrackBlock(this.deps, this.deps.state, playerId)
  }

  buildAiPrivateIntelBlock(playerId: string): ReturnType<typeof buildAiPrivateIntelBlock> {
    return buildAiPrivateIntelBlock(this.deps, this.deps.state, playerId)
  }

  // ═════════════ 动作执行方法（action-fns.ts） ═════════════

  executeAiIntelAction(
    playerId: string,
    plan: IntelActionPlan
  ): RevealResult & {
    signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats }
  } {
    return executeAiIntelAction(this.deps, playerId, plan)
  }

  processAiIntelActions(): Promise<void> {
    return processAiIntelActions(this.deps)
  }

  processSingleAiIntelAction(
    player: Player,
    plan?: IntelActionPlan,
    llmPlan?: LlmPlanResult | null,
    roundProgress?: number,
    batchId?: string,
    batchStartTime?: number
  ): Promise<void> {
    return processSingleAiIntelAction(this.deps, player, plan, llmPlan, roundProgress, batchId, batchStartTime)
  }

  formatAiIntelActionPublicLine(entry: LastAiIntelAction): string {
    return formatAiIntelActionPublicLine(this.deps, entry)
  }

  canUseIntelActions(): boolean {
    return canUseIntelActions(this.deps)
  }
}
