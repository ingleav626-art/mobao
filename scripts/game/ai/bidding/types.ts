/**
 * @file scripts/game/ai/bidding/types.ts
 * @module ai/bidding/types
 * @description AI 出价引擎（AuctionAiEngine）所用的类型定义。从原 bidding.ts 提取，
 *              包含人格参数、工具效果、信心组成、决策结果、情报动作等接口。
 *
 * @exports Personality, AiStateEntry, ToolEffect, ConfidenceParts, DecisionResult,
 *          IntelActionCandidate, IntelActionResult, ResetContext, BuildAIBidsContext,
 *          IntelSummaryInput, ComputeSingleDecisionArgs, ComputeConfidencePartsArgs,
 *          PlanIntelActionArgs, ApplyCrowdDiversityArgs
 */

export interface Personality {
  name: string
  archetype: string
  aggression: number
  discipline: number
  followRate: number
  bluffRate: number
  errorRate: number
  anchorMin: number
  anchorMax: number
  openRaiseRatio: number
  crowdBias: number
  expectationElasticity: number
  retreatFactor: number
  noInfoAdjustMin: number
  noInfoAdjustMax: number
}

export interface AiStateEntry {
  anchorBid: number
  psychExpectedBid: number
  lastBid: number
}

export interface ToolEffect {
  tag: string
  confidenceBoost: number
  capBoost: number
  followBoost: number
  aggressionBoost: number
  uncertaintyReduction: number
  strategyScoreBoost: number
  planScore: number
}

export interface ConfidenceParts {
  base: number
  clue: number
  quality: number
  progress: number
  market: number
  tool: number
  edgeBonus: number
  spreadPenalty: number
  uncertaintyPenalty: number
  mood: number
  total: number
}

export interface DecisionResult {
  playerId: string
  name: string
  archetype: string
  confidence: number
  confidenceParts: ConfidenceParts
  intelClueRate: number
  intelQualityRate: number
  intelUncertainty: number
  intelSpreadRatio: number
  intelUpperEdge: number
  intelLowerEdge: number
  marketRef: number
  perceivedValue: number
  hardCap: number
  targetPsychExpected: number
  psychExpectedBid: number
  overheatThreshold: number
  overheatRatio: number
  floorAdjustAmount: number
  toolTag: string
  toolScoreBoost: number
  actionTag: string
  mistakeTag: string
  diversifyTag: string
  finalBid: number
}

export interface IntelActionCandidate {
  actionType: string
  actionId: string
  expectedReveal: number
  score: number
}

export interface IntelActionResult extends IntelActionCandidate {
  candidates: IntelActionCandidate[]
}

export interface ResetContext {
  startingBid?: number
  itemCount?: number
  [key: string]: unknown
}

export interface BuildAIBidsContext {
  aiPlayers: Array<{ id: string; [key: string]: unknown }>
  clueRate: number
  round: number
  maxRounds: number
  currentBid: number
  lastRoundBids?: Record<string, number>
  bidStep?: number
  aiIntelMap?: Record<string, IntelSummaryInput>
  aiToolEffectMap?: Record<string, ToolEffect>
  [key: string]: unknown
}

export interface IntelSummaryInput {
  clueRate?: number
  qualityRate?: number
  uncertainty?: number
  spreadRatio?: number
  upperEdge?: number
  lowerEdge?: number
  [key: string]: unknown
}

export interface ComputeSingleDecisionArgs {
  playerId: string
  clueRate: number
  qualityRate: number
  uncertainty: number
  spreadRatio?: number
  upperEdge?: number
  lowerEdge?: number
  roundProgress: number
  currentBid: number
  marketRef: number
  persona: Personality
  lastRoundBids?: Record<string, number>
  bidStep: number
  toolEffect: ToolEffect
  [key: string]: unknown
}

export interface ComputeConfidencePartsArgs {
  clueRate: number
  qualityRate: number
  uncertainty: number
  spreadRatio: number
  upperEdge: number
  lowerEdge: number
  roundProgress: number
  marketRef: number
  currentBid: number
  persona: Personality
  toolEffect: ToolEffect
  [key: string]: unknown
}

export interface PlanIntelActionArgs {
  playerId: string
  round: number
  maxRounds: number
  persona: Personality
  pool: Record<string, unknown>
  roundProgress: number
  currentBid: number
  marketRef: number
  toolEffect: ToolEffect
  intelSummary?: Record<string, unknown>
  resources?: Record<string, unknown>
  [key: string]: unknown
}

export interface ApplyCrowdDiversityArgs {
  aiPlayers: Array<{ id: string; [key: string]: unknown }>
  decisionMap: Record<string, DecisionResult>
  bidMap: Record<string, number>
  currentBid: number
  bidStep: number
  [key: string]: unknown
}
