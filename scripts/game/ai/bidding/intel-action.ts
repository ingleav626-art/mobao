/**
 * @file scripts/game/ai/bidding/intel-action.ts
 * @module ai/bidding/intel-action
 * @description AI 情报动作规划纯函数。从原 bidding.ts 的 planIntelAction 方法提取，
 *              基于信息缺口、信心需求、资源存量评分选择最优动作（技能/道具/不操作）。
 *              原方法仅只读访问 this.personalityMap，提取后改为通过参数接收。
 *
 * @requires core/utils - 工具函数（clamp, randomBetween）
 * @requires ./pure - defaultPersona 默认人格
 * @exports planIntelAction
 */
import { clamp, randomBetween } from "../../core/utils"
import { defaultPersona } from "./pure"
import type { Personality, IntelActionCandidate, IntelActionResult, PlanIntelActionArgs } from "./types"

/**
 * 规划AI情报动作。根据当前情报状态和可用资源，选择最优的技能/道具使用策略。
 * @param args - 情报规划参数
 * @param personalityMap - 人格参数映射，按 playerId 查找
 * @returns 情报动作结果
 */
export function planIntelAction(
  args: PlanIntelActionArgs,
  personalityMap: Record<string, Personality>
): IntelActionResult {
  const { playerId, round, maxRounds, intelSummary = {}, resources = {} } = args

  const persona = personalityMap[playerId] || defaultPersona()
  const roundProgress = maxRounds <= 1 ? 1 : (round - 1) / (maxRounds - 1)
  const clueRate = clamp(Number(intelSummary.clueRate) || 0, 0, 1)
  const qualityRate = clamp(Number(intelSummary.qualityRate) || 0, 0, 1)
  const uncertainty = clamp(Number(intelSummary.uncertainty) || 1, 0, 1)
  const spreadRatio = clamp(Number(intelSummary.spreadRatio) || 0, 0, 1.5)
  const signalCount = Math.max(0, Number(intelSummary.signalCount) || 0)
  const infoGap = 1 - clueRate
  const qualityGap = 1 - qualityRate
  const earlyNeed = 1 - roundProgress
  const confidenceNeed = clamp(
    0.78 - clueRate * 0.44 - qualityRate * 0.2 + uncertainty * 0.26 + spreadRatio * 0.2,
    0,
    1.2
  )
  const skillPool: Record<string, number> = (resources.skills as Record<string, number>) || {}
  const itemPool: Record<string, number> = (resources.items as Record<string, number>) || {}
  const itemTotal = (Object.values(itemPool) as number[]).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const itemPenaltyBase = itemTotal <= 1 ? 0.1 : itemTotal <= 2 ? 0.06 : 0.03
  const itemUseBoost = clamp(0.05 + earlyNeed * 0.04 + confidenceNeed * 0.03, 0, 0.14)
  const fatiguePenalty = signalCount > 12 ? 0.05 : 0

  const candidates: IntelActionCandidate[] = []
  candidates.push({
    actionType: "none",
    actionId: "none",
    expectedReveal: 0,
    score:
      0.2 +
      roundProgress * 0.2 +
      (1 - confidenceNeed) * 0.12 +
      persona.discipline * 0.06 -
      spreadRatio * 0.04 +
      randomBetween(-0.04, 0.04)
  })

  if ((skillPool["skill-outline-scan"] || 0) > 0) {
    candidates.push({
      actionType: "skill",
      actionId: "skill-outline-scan",
      expectedReveal: 3,
      score:
        confidenceNeed * 0.42 +
        infoGap * 0.24 +
        earlyNeed * 0.18 +
        persona.discipline * 0.07 -
        fatiguePenalty +
        randomBetween(-0.05, 0.05)
    })
  }

  if ((skillPool["skill-quality-jade"] || 0) > 0) {
    candidates.push({
      actionType: "skill",
      actionId: "skill-quality-jade",
      expectedReveal: 2,
      score:
        qualityGap * 0.46 +
        confidenceNeed * 0.18 +
        spreadRatio * 0.2 +
        (1 - Math.abs(roundProgress - 0.58)) * 0.1 +
        persona.discipline * 0.09 -
        fatiguePenalty * 0.8 +
        randomBetween(-0.05, 0.05)
    })
  }

  if ((itemPool["item-outline-lamp"] || 0) > 0) {
    candidates.push({
      actionType: "item",
      actionId: "item-outline-lamp",
      expectedReveal: 4,
      score:
        confidenceNeed * 0.34 +
        infoGap * 0.26 +
        earlyNeed * 0.14 +
        persona.aggression * 0.08 +
        itemUseBoost -
        itemPenaltyBase -
        fatiguePenalty +
        randomBetween(-0.06, 0.06)
    })
  }

  if ((itemPool["item-quality-needle"] || 0) > 0) {
    candidates.push({
      actionType: "item",
      actionId: "item-quality-needle",
      expectedReveal: 3,
      score:
        qualityGap * 0.5 +
        confidenceNeed * 0.16 +
        spreadRatio * 0.22 +
        persona.aggression * 0.07 +
        itemUseBoost -
        (itemPenaltyBase + 0.03) -
        fatiguePenalty +
        randomBetween(-0.06, 0.06)
    })
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const best = sorted[0] || {
    actionType: "none",
    actionId: "none",
    expectedReveal: 0,
    score: 0
  }

  const threshold = clamp(0.2 + roundProgress * 0.1 - confidenceNeed * 0.08 + spreadRatio * 0.06, 0.14, 0.38)
  if (best.actionType === "none" || best.score < threshold) {
    return {
      actionType: "none",
      actionId: "none",
      expectedReveal: 0,
      score: best.score,
      candidates: sorted.slice(0, 4)
    }
  }

  return {
    ...best,
    candidates: sorted.slice(0, 4)
  }
}
