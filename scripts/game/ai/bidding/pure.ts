/**
 * @file scripts/game/ai/bidding/pure.ts
 * @module ai/bidding/pure
 * @description AI 出价引擎的可独立测试纯函数。从原 bidding.ts 提取，
 *              包含默认人格、工具效果规范化、市场参考价、工具效果评估、
 *              信心计算、群体多样性调整。所有函数均无实例状态依赖，
 *              需要人格参数的函数通过参数接收。
 *
 * @requires core/utils - 工具函数（clamp, roundToStep, randomBetween）
 * @exports defaultPersona, normalizeToolEffect, marketReference, buildToolEffect,
 *          computeConfidenceParts, applyCrowdDiversity
 */
import { clamp, roundToStep, randomBetween } from "../../core/utils"
import type {
  Personality,
  ToolEffect,
  ConfidenceParts,
  ComputeConfidencePartsArgs,
  ApplyCrowdDiversityArgs,
  IntelSummaryInput
} from "./types"

/** 返回默认人格参数，用于未在 personalityMap 中配置的玩家。 */
export function defaultPersona(): Personality {
  return {
    name: "AI",
    archetype: "规则型",
    aggression: 0.64,
    discipline: 0.72,
    followRate: 0.35,
    bluffRate: 0.2,
    errorRate: 0.05,
    anchorMin: 1.3,
    anchorMax: 1.9,
    openRaiseRatio: 0.06,
    crowdBias: 0,
    expectationElasticity: 0.56,
    retreatFactor: 0.56,
    noInfoAdjustMin: -0.04,
    noInfoAdjustMax: 0.05
  }
}

/** 规范化工具效果数值范围，确保各字段在合法区间内。 */
export function normalizeToolEffect(effect: ToolEffect | { [key: string]: unknown } = {}): ToolEffect {
  return {
    tag: String(effect.tag || ""),
    confidenceBoost: clamp(Number(effect.confidenceBoost) || 0, -0.2, 0.45),
    capBoost: clamp(Number(effect.capBoost) || 0, -0.2, 0.25),
    followBoost: clamp(Number(effect.followBoost) || 0, -0.2, 0.3),
    aggressionBoost: clamp(Number(effect.aggressionBoost) || 0, -0.2, 0.3),
    uncertaintyReduction: clamp(Number(effect.uncertaintyReduction) || 0, 0, 0.45),
    strategyScoreBoost: clamp(Number(effect.strategyScoreBoost) || 0, -0.4, 1.6),
    planScore: Number(effect.planScore) || 0
  }
}

/**
 * 计算市场参考价。基于当前出价和上轮出价的加权均值（avg*0.62 + top*0.38），
 * 无上轮出价时回退到 fallback。
 */
export function marketReference(currentBid: number, lastRoundBids: Record<string, number>, fallback: number): number {
  const values = Object.values(lastRoundBids || {})
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0)

  if (values.length === 0) {
    return Math.max(currentBid, fallback || currentBid)
  }

  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const top = Math.max(...values)
  return Math.max(currentBid, avg * 0.62 + top * 0.38)
}

/**
 * 计算工具（技能/道具）使用后的效果评估
 * @param args - 工具效果参数
 * @returns 工具效果评估结果
 */
export function buildToolEffect(
  args: {
    actionType?: string
    actionId?: string
    roundProgress?: number
    intelSummary?: IntelSummaryInput
    signalStats?: {
      aggregate?: IntelSummaryInput
      qualitySignalRate?: number
      outlineSignalRate?: number
      signalCount?: number
      spreadRatio?: number
      upperEdge?: number
      lowerEdge?: number
      [key: string]: unknown
    } | null
    planScore?: number
    [key: string]: unknown
  } = {}
): ToolEffect {
  const {
    actionType = "none",
    actionId = "none",
    roundProgress = 0,
    intelSummary = {},
    signalStats = null,
    planScore = 0
  } = args

  if (actionType === "none" || actionId === "none") {
    return normalizeToolEffect({
      tag: "无工具",
      confidenceBoost: 0,
      capBoost: 0,
      followBoost: 0,
      aggressionBoost: 0,
      uncertaintyReduction: 0,
      strategyScoreBoost: 0,
      planScore: 0
    })
  }

  const aggregate = signalStats && signalStats.aggregate ? signalStats.aggregate : signalStats || null
  const qualitySignalRate = clamp(Number(signalStats?.qualitySignalRate) || 0, 0, 1)
  const outlineSignalRate = clamp(Number(signalStats?.outlineSignalRate) || 0, 0, 1)
  const qualityRate = clamp(Number(intelSummary.qualityRate) || 0, 0, 1)

  const statCount = Math.max(0, Number(aggregate?.count) || 0)
  const spread = clamp(Number(aggregate?.spreadRatio) || Number(intelSummary.spreadRatio) || 0, 0, 1.5)
  const upperEdge = clamp(Number(aggregate?.upperEdge) || Number(intelSummary.upperEdge) || 0, -0.4, 0.6)
  const lowerEdge = clamp(Number(aggregate?.lowerEdge) || Number(intelSummary.lowerEdge) || 0, -0.4, 0.6)
  const edgeSignal = clamp(upperEdge - lowerEdge, -0.4, 0.6)
  const signalCount = Math.max(0, Number(signalStats?.signalCount) || 0)
  const stageFactor = clamp(0.94 - roundProgress * 0.14, 0.7, 1)
  const countFactor = clamp(signalCount * 0.24 + statCount / 40, 0, 1.2)
  const stability = clamp(1 - spread * 1.2, 0, 1)

  const effect: Record<string, unknown> = {
    tag: actionId.includes("quality") ? "候选鉴质" : "候选拓影",
    confidenceBoost: clamp(
      (stability * 0.12 + countFactor * 0.06 + edgeSignal * 0.1 + qualitySignalRate * 0.03) * stageFactor,
      -0.05,
      0.24
    ),
    capBoost: clamp(
      (Math.max(0, edgeSignal) * 0.22 + qualitySignalRate * 0.06 + qualityRate * 0.04 - spread * 0.05) * stageFactor,
      -0.08,
      0.18
    ),
    followBoost: clamp(outlineSignalRate * 0.07 + stability * 0.04 - roundProgress * 0.02, -0.05, 0.12),
    aggressionBoost: clamp(
      (Math.max(0, edgeSignal) * 0.11 + (Number(planScore) || 0) * 0.03 - spread * 0.04) * (1 - roundProgress * 0.35),
      -0.08,
      0.12
    ),
    uncertaintyReduction: clamp(stability * 0.18 + countFactor * 0.08 + qualitySignalRate * 0.05, 0, 0.32),
    strategyScoreBoost: clamp((Number(planScore) || 0) * 0.62 + edgeSignal * 0.22 - spread * 0.12, -0.25, 0.9),
    planScore: Number(planScore) || 0
  }

  return normalizeToolEffect(effect)
}

/**
 * 信心计算。基于线索率、质量率、不确定性、轮次进度、市场偏差、工具效果等
 * 加权得到各部分信心组成及总信心（0-1）。
 */
export function computeConfidenceParts(args: ComputeConfidencePartsArgs): ConfidenceParts {
  const {
    clueRate,
    qualityRate,
    uncertainty,
    spreadRatio,
    upperEdge,
    lowerEdge,
    roundProgress,
    currentBid,
    marketRef,
    persona,
    toolEffect
  } = args

  //基础值
  const base = 0.8

  //数值计算
  const clue = clueRate * (0.3 + persona.discipline * 0.1)

  //质量计算：AI对质量信息的敏感度，尤其是当线索率较高时，质量信息能显著提升AI的信心。
  const quality = qualityRate * (0.2 + persona.discipline * 0.08)

  //进度相关：AI在拍卖初期可能更谨慎，随着拍卖的推进逐渐增加信心，尤其是当线索和质量信息逐渐揭示时。
  const progress = roundProgress * (0.16 + persona.aggression * 0.1)

  //市场相关：参考价越有利，信心越高；跟风倾向强的AI对市场参考价更敏感。
  const marketDelta = Math.abs((marketRef - currentBid) / Math.max(currentBid, 1))

  const market = clamp(marketDelta * (0.12 + persona.followRate * 0.08), 0, 0.16)
  const tool = clamp((toolEffect.confidenceBoost || 0) * 0.8 + (toolEffect.strategyScoreBoost || 0) * 0.1, -0.06, 0.16)
  const edgeBonus = clamp(((upperEdge || 0) - (lowerEdge || 0)) * 0.22, -0.08, 0.14)
  const spreadPenalty = (spreadRatio || 0) * (0.18 - persona.discipline * 0.05)
  const uncertaintyPenalty = uncertainty * (0.2 - persona.discipline * 0.06)
  const mood = randomBetween(-0.08, 0.08) * (1 - persona.discipline * 0.6)
  const total = clamp(
    base + clue + quality + progress + market + tool + edgeBonus - spreadPenalty - uncertaintyPenalty + mood,
    0,
    1
  )

  return {
    base,
    clue,
    quality,
    progress,
    market,
    tool,
    edgeBonus,
    spreadPenalty,
    uncertaintyPenalty,
    mood,
    total
  }
}

/**
 * 群体多样性调整。确保 AI 出价不扎堆，根据人格的 crowdBias 倾向调整相邻出价间距。
 * 修改传入的 bidMap 和 decisionMap（副作用，通过参数传递）。
 */
export function applyCrowdDiversity(args: ApplyCrowdDiversityArgs, personalityMap: Record<string, Personality>): void {
  const { aiPlayers, decisionMap, bidMap, currentBid, bidStep } = args

  const step = Math.max(10, Math.round(Number(bidStep) || 100))
  const spacing = Math.max(step * 5, currentBid * 0.015)

  const sorted = aiPlayers
    .map((player) => ({ id: player.id, bid: bidMap[player.id] || 0 }))
    .sort((a, b) => a.bid - b.bid)

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const diff = curr.bid - prev.bid

    if (diff >= spacing) {
      continue
    }

    const need = spacing - diff
    const prevPersona = personalityMap[prev.id] || defaultPersona()
    const currPersona = personalityMap[curr.id] || defaultPersona()
    const bias = (currPersona.crowdBias || 0) - (prevPersona.crowdBias || 0)

    let pullDown = need * 0.5
    let pushUp = need * 0.5
    if (bias > 0.18) {
      pushUp = need * 0.58
      pullDown = need * 0.42
    } else if (bias < -0.18) {
      pushUp = need * 0.42
      pullDown = need * 0.58
    }

    bidMap[prev.id] = roundToStep(Math.max(0, bidMap[prev.id] - pullDown), step)
    bidMap[curr.id] = roundToStep(Math.max(0, bidMap[curr.id] + pushUp), step)

    if (decisionMap[prev.id]) {
      decisionMap[prev.id].diversifyTag = "差异化下修"
      decisionMap[prev.id].finalBid = bidMap[prev.id]
    }
    if (decisionMap[curr.id]) {
      decisionMap[curr.id].diversifyTag = "差异化上调"
      decisionMap[curr.id].finalBid = bidMap[curr.id]
    }
  }

  const used = new Set()
  aiPlayers.forEach((player, idx) => {
    const id = player.id
    let bid = roundToStep(Math.max(0, bidMap[id] || 0), step)
    while (used.has(bid)) {
      const offset = step * (idx + 1)
      const lower = Math.max(0, bid - offset)
      if (!used.has(lower)) {
        bid = lower
        break
      }
      bid += offset
    }
    used.add(bid)
    bidMap[id] = bid
    if (decisionMap[id]) {
      decisionMap[id].finalBid = bid
    }
  })
}

// ─── computeSingleDecision 子计算纯函数（Phase 2 提取，确定性公式，可独立测试）───

/** 基础估值：锚点出价 × (0.82 + 信心×0.52 + 质量率×0.18 + 边缘信号×0.12)。 */
export function calcBaseEstimate(
  anchorBid: number,
  confidence: number,
  qualityRate: number,
  edgeSignal: number
): number {
  return anchorBid * (0.82 + confidence * 0.52 + qualityRate * 0.18 + edgeSignal * 0.12)
}

/** 噪声带宽：纪律/失误/不确定性/工具/信息分布决定，clamp 到 [0.025, 0.26]。 */
export function calcNoiseBand(persona: Personality, uncertainty: number, tool: ToolEffect, spread: number): number {
  return clamp(
    ((1 - persona.discipline) * 0.18 + persona.errorRate * 0.72) *
      (1 + uncertainty * 0.28) *
      (1 - tool.uncertaintyReduction * 0.84) *
      (1 + spread * 0.22),
    0.025,
    0.26
  )
}

/** 目标心理预期出价：锚点/市场参考/当前出价加权组合，不低于步长。 */
export function calcTargetPsychExpected(
  step: number,
  anchorBid: number,
  marketRef: number,
  currentBid: number,
  persona: Personality,
  tool: ToolEffect,
  clueRate: number,
  qualityRate: number,
  roundProgress: number
): number {
  return Math.max(
    step,
    anchorBid * (0.64 + persona.discipline * 0.22) +
      marketRef * (0.2 + persona.followRate * 0.17 + tool.followBoost * 0.15) +
      currentBid *
        (0.02 + clueRate * 0.07 + qualityRate * 0.08 + roundProgress * 0.05 + tool.strategyScoreBoost * 0.025)
  )
}

/** 适应率：心理预期调整速度，clamp 到 [0.1, 0.72]。 */
export function calcAdaptRate(confidence: number, persona: Personality, tool: ToolEffect, spread: number): number {
  return clamp(
    0.12 + confidence * 0.24 + persona.expectationElasticity * 0.18 + tool.confidenceBoost * 0.25 - spread * 0.08,
    0.1,
    0.72
  )
}

/** 过热阈值：触发回撤的过热程度门槛，clamp 到 [0.04, 0.26]。 */
export function calcOverheatThreshold(
  confidence: number,
  uncertainty: number,
  spread: number,
  persona: Personality,
  tool: ToolEffect
): number {
  return clamp(
    0.04 +
      (1 - confidence) * 0.1 +
      uncertainty * 0.1 +
      spread * 0.06 -
      persona.aggression * 0.03 +
      persona.discipline * 0.02 -
      tool.uncertaintyReduction * 0.09,
    0.04,
    0.26
  )
}

/** 过热程度：当前出价相对心理预期的超出比例；心理预期 ≤ 步长时为 0。 */
export function calcOverheatRatio(currentBid: number, psychExpectedBid: number, step: number): number {
  return psychExpectedBid <= step ? 0 : (currentBid - psychExpectedBid) / psychExpectedBid
}

/** 价格上限 hardCap：四上限（感知/锚点/心理/市场）组合最小值 × 工具加成，不低于步长。 */
export function calcHardCap(
  step: number,
  perceivedValue: number,
  anchorBid: number,
  psychExpectedBid: number,
  marketRef: number,
  persona: Personality,
  qualityRate: number,
  confidence: number,
  edgeSignal: number,
  roundProgress: number,
  tool: ToolEffect
): number {
  const perceivedCap = perceivedValue * clamp(0.82 + persona.discipline * 0.1 + qualityRate * 0.08, 0.78, 1.05)
  const anchorCap = anchorBid * clamp(0.92 + confidence * 0.18 + edgeSignal * 0.1, 0.82, 1.18)
  const psychCap = psychExpectedBid * clamp(0.9 + confidence * 0.16, 0.82, 1.2)
  const marketCap = marketRef * clamp(0.78 + persona.followRate * 0.12 + roundProgress * 0.05, 0.72, 1.08)
  let hardCap = Math.max(step, Math.min(perceivedCap, Math.max(anchorCap, psychCap, marketCap)))
  hardCap *= clamp(1 + tool.capBoost * 0.2, 0.88, 1.1)
  return Math.max(step, hardCap)
}

/** 恐高概率：接近心理预期时触发恐高减价的概率，clamp 到 [0.05, 0.3]。 */
export function calcFearChance(
  persona: Personality,
  uncertainty: number,
  spread: number,
  roundProgress: number
): number {
  return clamp(
    0.08 + (1 - persona.aggression) * 0.14 + uncertainty * 0.1 + spread * 0.08 - roundProgress * 0.06,
    0.05,
    0.3
  )
}
