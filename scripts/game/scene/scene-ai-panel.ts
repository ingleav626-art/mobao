/**
 * @file scene/scene-ai-panel.ts
 * @module scene/ai-panel
 * @description AI 逻辑面板渲染与 LLM 代理方法。
 *
 * 拆分说明：
 *   - renderAiLogicPanel(): 包含实现逻辑（渲染决策日志文本），需二次迁移到 ui/panels.ts
 *   - 其余方法为 LLM_BRIDGE 代理方法，仅做转发，无需二次迁移
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { LlmTelemetry, LlmSettings, LlmPlan, LlmRoundPayload, LlmDecision, LlmErrorInfo } from "../../../types/llm"
import type { Player, RevealResult } from "../../../types/game"
import type { ConversationMessage } from "../../../types/ai"
import type { BidsPerPlayer } from "../../../types/lan"
import { Deps } from "../core/deps"
import { formatBidRevealNumber } from "../core/utils"

type LlmBridge = {
  methods: {
    renderAiLogicPanelForLlm: (this: WarehouseSceneThis, telemetry: { mode: string; round: number; entries: LlmTelemetry[] }) => void
    showAiConversationMessages: (this: WarehouseSceneThis) => void
    fillLlmSettingsForm: (this: WarehouseSceneThis, values: LlmSettings) => void
    readLlmSettingsForm: (this: WarehouseSceneThis) => LlmSettings
    setLlmSettingsStatus: (this: WarehouseSceneThis, text: string, state: "ok" | "error" | "loading" | "") => void
    testDeepSeekConnectionFromOverlay: (this: WarehouseSceneThis) => Promise<void>
    buildAiLlmRoundPayload: (this: WarehouseSceneThis, player: Player) => unknown
    buildAiFollowupRoundPayload: (this: WarehouseSceneThis, player: Player, currentPlan: LlmPlan, toolSummary: string) => unknown
    buildAiIncrementalPayload: (this: WarehouseSceneThis, player: Player) => unknown
    canUseLlmDecision: (this: WarehouseSceneThis) => boolean
    isAiLlmEnabledForPlayer: (this: WarehouseSceneThis, playerId: string) => boolean
    canUseLlmDecisionForPlayer: (this: WarehouseSceneThis, playerId: string) => boolean
    getAiModelConfigForPlayer: (this: WarehouseSceneThis, playerId: string) => unknown
    getAiIndexFromPlayerId: (this: WarehouseSceneThis, playerId: string) => number
    buildAiDecisionUserPrompt: (this: WarehouseSceneThis, payload: LlmRoundPayload, extraBlocks: string[], options: Record<string, unknown>) => string
    extractAiDecisionObject: (this: WarehouseSceneThis, content: string) => unknown
    resolveActionPick: (this: WarehouseSceneThis, rawText: string, type: "skill" | "item", availableIds: string[]) => unknown
    normalizeAiLlmPlan: (this: WarehouseSceneThis, playerId: string, decision: LlmDecision, rawContent: string, options: Record<string, unknown>) => LlmPlan
    buildAiDecisionMessages: (this: WarehouseSceneThis, payload: LlmRoundPayload, options: Record<string, unknown>) => ConversationMessage[]
    requestAiLlmPlan: (this: WarehouseSceneThis, player: Player, options: Record<string, unknown>) => Promise<LlmPlan | null>
    buildAiToolResultSummary: (this: WarehouseSceneThis, result: RevealResult, actionType: string, actionId: string) => string
    requestAiLlmFollowupBid: (this: WarehouseSceneThis, player: Player, currentPlan: LlmPlan, toolSummary: string) => Promise<LlmPlan | null>
    requestAiLlmErrorCorrection: (this: WarehouseSceneThis, player: Player, currentPlan: LlmPlan, errorInfo: LlmErrorInfo, correctionHistory: LlmDecision[], previousMessages: ConversationMessage[]) => Promise<LlmPlan | null>
    prepareAiLlmRoundPlans: (this: WarehouseSceneThis) => Promise<void>
    captureAiDecisionTelemetry: (this: WarehouseSceneThis, roundBids: BidsPerPlayer[]) => void
    processAiDecisions: (this: WarehouseSceneThis) => void
  }
}

function getBridge(): LlmBridge {
  return Deps.LLM_BRIDGE as unknown as LlmBridge
}

/**
 * 渲染 AI 逻辑面板（非 LLM 模式）
 *
 * 注意：此方法包含实现逻辑（渲染决策日志文本），需二次迁移到 ui/panels.ts
 */
export function renderAiLogicPanel(this: WarehouseSceneThis): void {
  if (!this.dom.aiLogicContent || !this.aiEngine || typeof this.aiEngine.getLastDecisionLog !== "function") {
    return
  }

  if (this.lastAiDecisionTelemetry && this.lastAiDecisionTelemetry.mode === "llm") {
    this.renderAiLogicPanelForLlm(this.lastAiDecisionTelemetry)
    return
  }

  const payload = this.aiEngine.getLastDecisionLog() as {
    round?: number
    currentBid?: number
    marketReference?: number
    clueRate?: number
    entries: Array<Record<string, unknown>>
  } | null

  if (!payload || !payload.entries || payload.entries.length === 0) {
    this.dom.aiLogicContent.textContent = "暂无AI出价决策。\n请至少完成一轮出价揭示后查看。"
    return
  }

  const lines: string[] = []
  const roundText = Number.isFinite(payload.round as number) ? payload.round : this.round
  lines.push(`回合 ${roundText} | 当前价 ${formatBidRevealNumber((payload.currentBid as number) || this.currentBid)}`)
  lines.push(
    `参考盘 ${formatBidRevealNumber((payload.marketReference as number) || this.currentBid)} | 线索率 ${Math.round(((payload.clueRate as number) || 0) * 100)}%`
  )
  lines.push("信心影响：信心越高，AI越愿意贴近心理预期和上限；信心越低，AI越可能观望或回撤。\n")
  lines.push("-")

  payload.entries.forEach((entry: Record<string, unknown>) => {
    const parts = (entry.confidenceParts as Record<string, number>) || {}
    const overheat = Math.round(((entry.overheatRatio as number) || 0) * 100)
    const threshold = Math.round(((entry.overheatThreshold as number) || 0) * 100)
    lines.push(`${entry.name || entry.playerId}（${entry.archetype || "未知人格"}）`)
    lines.push(
      `  最终出价: ${formatBidRevealNumber((entry.finalBid as number) || 0)} | 信心 ${Math.round(((entry.confidence as number) || 0) * 100)}%`
    )
    lines.push(
      `  私有线索: 线索率 ${Math.round(((entry.intelClueRate as number) || 0) * 100)}% | 品质率 ${Math.round(((entry.intelQualityRate as number) || 0) * 100)}% | 不确定 ${((entry.intelUncertainty as number) || 0).toFixed(2)} | 波动 ${((entry.intelSpreadRatio as number) || 0).toFixed(2)}`
    )
    lines.push(
      `  分布边缘: 上沿 ${((entry.intelUpperEdge as number) || 0).toFixed(2)} | 下沿 ${((entry.intelLowerEdge as number) || 0).toFixed(2)}`
    )
    lines.push(
      `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
    )
    lines.push(
      `  估值: ${formatBidRevealNumber((entry.perceivedValue as number) || 0)} | 上限 ${formatBidRevealNumber((entry.hardCap as number) || 0)}`
    )
    lines.push(
      `  心理预期: ${formatBidRevealNumber((entry.psychExpectedBid as number) || 0)}（目标 ${formatBidRevealNumber((entry.targetPsychExpected as number) || 0)}）`
    )
    lines.push(
      `  超预期: ${overheat}% | 回撤阈值 ${threshold}% | 低信息调整 ${formatBidRevealNumber((entry.floorAdjustAmount as number) || 0)}`
    )
    lines.push(`  工具影响: ${entry.toolTag || "无"} | 决策加分 ${((entry.toolScoreBoost as number) || 0).toFixed(2)}`)
    lines.push(
      `  行为: ${entry.actionTag || "常规"}${entry.mistakeTag ? ` | 失误:${entry.mistakeTag}` : ""}${entry.diversifyTag ? ` | 去同质:${entry.diversifyTag}` : ""}`
    )
    lines.push("-")
  })

  this.dom.aiLogicContent.textContent = lines.join("\n")
}

// === LLM 代理方法（仅做转发，无需二次迁移）===

export function renderAiLogicPanelForLlm(
  this: WarehouseSceneThis,
  telemetry: { mode: string; round: number; entries: LlmTelemetry[] }
): void {
  return getBridge().methods.renderAiLogicPanelForLlm.call(this, telemetry)
}

export function showAiConversationMessages(this: WarehouseSceneThis): void {
  return getBridge().methods.showAiConversationMessages.call(this)
}

export function fillLlmSettingsForm(this: WarehouseSceneThis, values: LlmSettings): void {
  return getBridge().methods.fillLlmSettingsForm.call(this, values)
}

export function readLlmSettingsForm(this: WarehouseSceneThis): LlmSettings {
  return getBridge().methods.readLlmSettingsForm.call(this)
}

export function setLlmSettingsStatus(
  this: WarehouseSceneThis,
  text: string,
  state: "ok" | "error" | "loading" | ""
): void {
  return getBridge().methods.setLlmSettingsStatus.call(this, text, state)
}

export async function testDeepSeekConnectionFromOverlay(this: WarehouseSceneThis): Promise<void> {
  return getBridge().methods.testDeepSeekConnectionFromOverlay.call(this)
}

export function buildAiLlmRoundPayload(this: WarehouseSceneThis, player: Player): unknown {
  return getBridge().methods.buildAiLlmRoundPayload.call(this, player)
}

export function buildAiFollowupRoundPayload(
  this: WarehouseSceneThis,
  player: Player,
  currentPlan: LlmPlan,
  toolSummary: string
): unknown {
  return getBridge().methods.buildAiFollowupRoundPayload.call(this, player, currentPlan, toolSummary)
}

export function buildAiIncrementalPayload(this: WarehouseSceneThis, player: Player): unknown {
  return getBridge().methods.buildAiIncrementalPayload.call(this, player)
}

export function canUseLlmDecision(this: WarehouseSceneThis): boolean {
  return getBridge().methods.canUseLlmDecision.call(this)
}

export function isAiLlmEnabledForPlayer(this: WarehouseSceneThis, playerId: string): boolean {
  return getBridge().methods.isAiLlmEnabledForPlayer.call(this, playerId)
}

export function canUseLlmDecisionForPlayer(this: WarehouseSceneThis, playerId: string): boolean {
  return getBridge().methods.canUseLlmDecisionForPlayer.call(this, playerId)
}

export function getAiModelConfigForPlayer(this: WarehouseSceneThis, playerId: string): unknown {
  return getBridge().methods.getAiModelConfigForPlayer.call(this, playerId)
}

export function getAiIndexFromPlayerId(this: WarehouseSceneThis, playerId: string): number {
  return getBridge().methods.getAiIndexFromPlayerId.call(this, playerId)
}

export function buildAiDecisionUserPrompt(
  this: WarehouseSceneThis,
  payload: LlmRoundPayload,
  extraBlocks: string[] = [],
  options: Record<string, unknown> = {}
): string {
  return getBridge().methods.buildAiDecisionUserPrompt.call(this, payload, extraBlocks, options)
}

export function extractAiDecisionObject(this: WarehouseSceneThis, content: string): unknown {
  return getBridge().methods.extractAiDecisionObject.call(this, content)
}

export function resolveActionPick(
  this: WarehouseSceneThis,
  rawText: string,
  type: "skill" | "item",
  availableIds: string[]
): unknown {
  return getBridge().methods.resolveActionPick.call(this, rawText, type, availableIds)
}

export function normalizeAiLlmPlan(
  this: WarehouseSceneThis,
  playerId: string,
  decision: LlmDecision,
  rawContent: string,
  options: Record<string, unknown> = {}
): LlmPlan {
  return getBridge().methods.normalizeAiLlmPlan.call(this, playerId, decision, rawContent, options)
}

export function buildAiDecisionMessages(
  this: WarehouseSceneThis,
  payload: LlmRoundPayload,
  options: Record<string, unknown> = {}
): ConversationMessage[] {
  return getBridge().methods.buildAiDecisionMessages.call(this, payload, options)
}

export async function requestAiLlmPlan(
  this: WarehouseSceneThis,
  player: Player,
  options: Record<string, unknown> = {}
): Promise<LlmPlan | null> {
  return getBridge().methods.requestAiLlmPlan.call(this, player, options)
}

export function buildAiToolResultSummary(
  this: WarehouseSceneThis,
  result: RevealResult,
  actionType: string,
  actionId: string
): string {
  return getBridge().methods.buildAiToolResultSummary.call(this, result, actionType, actionId)
}

export async function requestAiLlmFollowupBid(
  this: WarehouseSceneThis,
  player: Player,
  currentPlan: LlmPlan,
  toolSummary: string
): Promise<LlmPlan | null> {
  return getBridge().methods.requestAiLlmFollowupBid.call(this, player, currentPlan, toolSummary)
}

export async function requestAiLlmErrorCorrection(
  this: WarehouseSceneThis,
  player: Player,
  currentPlan: LlmPlan,
  errorInfo: LlmErrorInfo,
  correctionHistory: LlmDecision[],
  previousMessages: ConversationMessage[]
): Promise<LlmPlan | null> {
  return getBridge().methods.requestAiLlmErrorCorrection.call(
    this,
    player,
    currentPlan,
    errorInfo,
    correctionHistory,
    previousMessages
  )
}

export async function prepareAiLlmRoundPlans(this: WarehouseSceneThis): Promise<void> {
  return getBridge().methods.prepareAiLlmRoundPlans.call(this)
}

export function captureAiDecisionTelemetry(this: WarehouseSceneThis, roundBids: BidsPerPlayer[]): void {
  return getBridge().methods.captureAiDecisionTelemetry.call(this, roundBids)
}

export function processAiDecisions(this: WarehouseSceneThis): void {
  return getBridge().methods.processAiDecisions.call(this)
}
