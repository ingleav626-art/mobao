/**
 * @file scripts/game/ai/intel.ts
 * @module ai/intel
 * @description AI 情报系统薄入口（代理层）。AiIntelMixin 方法体委托到 AiIntelManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 *              原 5 个子 Mixin（Init/Snapshot/Reveal/Panel/Action）已合并到 Manager。
 *
 * @exports AiIntelMixin - AI 情报系统 Mixin（薄代理），混入 Phaser Scene
 * @exports 纯函数 - pickRandomItemCell, calcHighValuePriceThreshold 等
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact, Player } from "../../../types/game"
import type { IntelActionPlan } from "../../../types/ai"
import type { LlmPlanResult } from "../../../types/llm"
import type { LastAiIntelAction } from "./intel-manager"

export {
  pickRandomItemCell,
  calcHighValuePriceThreshold,
  checkHighValueArtifact,
  determineRevealLevel,
  truncateCandidateList,
  formatIntelActionPublicLine,
  buildNeighborStateLabel,
  getNeighborOffsets,
  calcUncertainty,
  calcAvailableActionState
} from "./intel/pure"

export const AiIntelMixin: ThisType<WarehouseSceneThis> = {
  // ─── Init ───
  initAiIntelSystems() {
    return this.aiIntelManager.initAiIntelSystems()
  },
  refreshAllPlayerAvatars() {
    return this.aiIntelManager.refreshAllPlayerAvatars()
  },
  resetAiRoundResources() {
    return this.aiIntelManager.resetAiRoundResources()
  },
  ensureAiPrivateIntel(playerId: string) {
    return this.aiIntelManager.ensureAiPrivateIntel(playerId)
  },

  // ─── Snapshot ───
  getAiIntelSummary(playerId: string) {
    return this.aiIntelManager.getAiIntelSummary(playerId)
  },
  buildAiIntelSnapshot() {
    return this.aiIntelManager.buildAiIntelSnapshot()
  },
  getAiResourceSnapshot(playerId: string) {
    return this.aiIntelManager.getAiResourceSnapshot(playerId)
  },
  getAiAvailableActionState(playerId: string) {
    return this.aiIntelManager.getAiAvailableActionState(playerId)
  },
  buildAiActionConstraintBlock(playerId: string) {
    return this.aiIntelManager.buildAiActionConstraintBlock(playerId)
  },

  // ─── Reveal ───
  buildSkillContext() {
    return this.aiIntelManager.buildSkillContext()
  },
  buildAiPrivateRevealContext(playerId: string) {
    return this.aiIntelManager.buildAiPrivateRevealContext(playerId)
  },
  pickRandomItemCell(item: Artifact) {
    return this.aiIntelManager.pickRandomItemCell(item)
  },
  markAiKnownCellState(playerId: string, x: number, y: number, state: string) {
    return this.aiIntelManager.markAiKnownCellState(playerId, x, y, state)
  },
  scanNeighborIntelAroundCell(playerId: string, x: number, y: number) {
    return this.aiIntelManager.scanNeighborIntelAroundCell(playerId, x, y)
  },
  markAllItemCellsAsOccupied(playerId: string, item: Artifact) {
    return this.aiIntelManager.markAllItemCellsAsOccupied(playerId, item)
  },
  scanItemBoundaryNeighbors(playerId: string, item: Artifact) {
    return this.aiIntelManager.scanItemBoundaryNeighbors(playerId, item)
  },
  buildAiPrivateSignal(playerId: string, item: Artifact, mode: string) {
    return this.aiIntelManager.buildAiPrivateSignal(playerId, item, mode)
  },
  ensureAiItemKnowledge(playerId: string, itemId: string) {
    return this.aiIntelManager.ensureAiItemKnowledge(playerId, itemId)
  },
  getHighValuePriceThreshold() {
    return this.aiIntelManager.getHighValuePriceThreshold()
  },
  isHighValueArtifact(item: Artifact) {
    return this.aiIntelManager.isHighValueArtifact(item)
  },
  ensureAiHighValueTrack(playerId: string, item: Artifact) {
    return this.aiIntelManager.ensureAiHighValueTrack(playerId, item)
  },
  updateAiItemKnowledge(playerId: string, item: Artifact, signal: { sampleCell?: { x: number; y: number } } | null, mode: string) {
    return this.aiIntelManager.updateAiItemKnowledge(playerId, item, signal, mode)
  },
  revealPrivateIntelBatch(
    playerId: string,
    mode: string,
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string
  ) {
    return this.aiIntelManager.revealPrivateIntelBatch(
      playerId,
      mode,
      count,
      category,
      allowCategoryFallback,
      sortStrategy
    )
  },
  revealPrivateIntelFully(
    playerId: string,
    options: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }
  ) {
    return this.aiIntelManager.revealPrivateIntelFully(playerId, options)
  },
  pickPrivateRevealTargets(options: {
    playerId: string
    mode: string
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }) {
    return this.aiIntelManager.pickPrivateRevealTargets(options)
  },

  // ─── Panel ───
  getPlayerById(playerId: string | number) {
    return this.aiIntelManager.getPlayerById(playerId)
  },
  getAiNeighborStateLabel(playerId: string | number, x: number, y: number) {
    return this.aiIntelManager.getAiNeighborStateLabel(playerId, x, y)
  },
  buildNeighborSnapshot(playerId: string, cell: { x: number; y: number } | null) {
    return this.aiIntelManager.buildNeighborSnapshot(playerId, cell)
  },
  buildAiAggregateIntelBlock(playerId: string) {
    return this.aiIntelManager.buildAiAggregateIntelBlock(playerId)
  },
  buildTrackCandidatePreview(revealState: {
    qualityKey: string | null
    category: string | null
    sizeTag: string | null
  }) {
    return this.aiIntelManager.buildTrackCandidatePreview(revealState)
  },
  buildAiHighValueTrackBlock(playerId: string) {
    return this.aiIntelManager.buildAiHighValueTrackBlock(playerId)
  },
  buildAiPrivateIntelBlock(playerId: string) {
    return this.aiIntelManager.buildAiPrivateIntelBlock(playerId)
  },

  // ─── Action ───
  executeAiIntelAction(playerId: string, plan: IntelActionPlan) {
    return this.aiIntelManager.executeAiIntelAction(playerId, plan)
  },
  async processAiIntelActions() {
    return this.aiIntelManager.processAiIntelActions()
  },
  async processSingleAiIntelAction(
    player: Player,
    plan?: IntelActionPlan,
    llmPlan?: LlmPlanResult | null,
    roundProgress?: number,
    batchId?: string,
    batchStartTime?: number
  ) {
    return this.aiIntelManager.processSingleAiIntelAction(player, plan, llmPlan, roundProgress, batchId, batchStartTime)
  },
  formatAiIntelActionPublicLine(entry: LastAiIntelAction) {
    return this.aiIntelManager.formatAiIntelActionPublicLine(entry)
  },
  canUseIntelActions() {
    return this.aiIntelManager.canUseIntelActions()
  }
}
