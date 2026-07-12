/**
 * @file scripts/llm/core/decision/types.ts
 * @module llm/core/decision/types
 * @description LLM 决策子模块的类型定义。包含规则决策条目、遥测条目、
 *              依赖容器接口，是 decision 子模块的数据契约。
 *
 * @requires types/game - Player
 * @requires types/llm - LlmSettings, AiModelConfig, LlmPlanResult
 * @exports RuleDecisionEntry, RoundBidEntry, TelemetryEntry, LlmDecisionDeps
 */
import type { LlmSettings } from "../../../../types/llm"

export interface RuleDecisionEntry {
  playerId: string
  finalBid: number
  confidence?: number
  archetype?: string
  confidenceParts?: {
    base?: number
    clue?: number
    quality?: number
    progress?: number
    market?: number
    tool?: number
    edgeBonus?: number
    spreadPenalty?: number
    uncertaintyPenalty?: number
    mood?: number
    [key: string]: number | undefined
  }
  perceivedValue?: number
  hardCap?: number
  psychExpectedBid?: number
  overheatRatio?: number
  overheatThreshold?: number
  intelClueRate?: number
  intelQualityRate?: number
  intelUncertainty?: number
  intelSpreadRatio?: number
  toolTag?: string
  toolScoreBoost?: number
  actionTag?: string
  mistakeTag?: string
  diversifyTag?: string
  [key: string]: unknown
}

export interface RoundBidEntry {
  playerId: string
  bid: number
  [key: string]: unknown
}

export interface TelemetryEntry {
  playerId: string
  playerName: string
  finalBid: number
  folded: boolean
  decisionSource: string
  llmActionName: string
  ruleActionName: string
  actionExecuted: boolean
  controlMode: string
  thought: string
  reasoningContent: string
  error: string
  fallbackRuleBid: number | null
  systemPrompt: string
  userPrompt: string
  modelResponse: string
  toolResultSummary: string
  followupPrompt: string
  followupResponse: string
  followupError: string
  followupActionRejected: string
  correctionAttempt: number
  originalError: string
  errorCorrectionPrompt: string
  errorCorrectionResponse: string
  historyMessagesCount: number
  crossGameMemoryCount: number
  inGameHistoryCount: number
  historyMessagesPreview: string
  crossGameMemoryText: string
  cacheHitTokens: number
  cacheMissTokens: number
  cacheHitRate: number
  usage: { prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number } | null | undefined
  [key: string]: unknown
}

export interface LlmDecisionDeps {
  GAME_SETTINGS: { maxRounds: number; bidStep: number; directTakeRatio: number; roundSeconds: number;[key: string]: unknown }
  LLM_SETTINGS: LlmSettings
  isNoneActionText: (text: string) => boolean
  compactOneLine: (text: string, maxLen?: number) => string
  formatBidRevealNumber: (v: number) => string
  indentMultiline: (text: string, indent?: string) => string
  compactPanelText: (text: string, maxLen?: number) => string
  [key: string]: unknown
}
