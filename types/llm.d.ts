/**
 * @file types/llm.d.ts
 * @description LLM 桥接层类型定义。涵盖 LLM 决策载荷、响应解析、遥测记录等核心数据结构。
 *              这些类型是 scene-llm.js 和 main.js 之间的数据契约。
 */

import type { Personality, ConversationMessage } from './ai'

// ==================== LLM 设置 ====================

/** LLM 全局设置 */
export interface LlmSettings {
  enabled: boolean
  provider: string                    // "deepseek" | "openai" | "qwen" | "glm" | "kimi"
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeout: number
  aiLlmEnabled: boolean               // AI LLM 总开关
  [key: string]: any
}

// ==================== 决策载荷 ====================

/** LLM 回合计费载荷（传给 buildAiLlmRoundPayload） */
export interface LlmRoundPayload {
  gameState: {
    round: { current: number; total: number }
    selfId: string
    selfName: string
    wallet: number
    directWinRatio: number
    folded: boolean
    Previousbid: number | null
    currentLeader: string
  }
  selfRoleAndTools: {
    character: object | null
    roleName: string
    passive: string
    activeSkills: LlmSkillInfo[]
    items: LlmItemInfo[]
  }
  otherPlayersPublic: object
  catalogSummary: string
  roundPublicStateTable?: object
  bidHistory?: object
  publicEvents?: object
  privateIntel: object
  actionConstraints: LlmActionConstraints
}

/** LLM 追问回合计费载荷 */
export interface LlmFollowupPayload extends LlmRoundPayload {
  followupContext: {
    toolResult: string
    currentPlan: object
  }
}

/** LLM 增量载荷（后续轮简化版） */
export interface LlmIncrementalPayload {
  roundNo: number
  totalRounds: number
  lastRoundResult: object
  updatedIntel: object
  roundTrend: object
}

// ==================== 技能/道具信息 ====================

/** LLM 可见的技能信息 */
export interface LlmSkillInfo {
  id: string
  name: string
  description: string
  remaining: number
  timing: string
  resultPublic: boolean
}

/** LLM 可见的道具信息 */
export interface LlmItemInfo {
  id: string
  name: string
  description: string
  remaining: number
  timing: string
  resultPublic: boolean
}

// ==================== 行动约束 ====================

/** LLM 行动约束 */
export interface LlmActionConstraints {
  canBid: boolean
  canFold: boolean
  availableSkills: string[]     // 可用技能ID列表
  availableItems: string[]      // 可用道具ID列表
  notes: string[]               // 约束说明
}

// ==================== LLM 决策 ====================

/** LLM 原始决策输出（从 JSON 解析得到） */
export interface LlmDecision {
  bid: number | string
  skill: string
  item: string
  thought: string
}

/** LLM 规范化计划（经 normalizeAiLlmPlan 处理后的结果） */
export interface LlmPlan {
  playerId: string
  bid: number
  skill: string | null           // 技能ID，或 null
  item: string | null            // 道具ID，或 null
  thought: string                // 决策思路
  rawContent: string             // LLM 原始响应文本
  stage: 'initial' | 'followup_after_tool' | 'error_correction'
  toolUsed: boolean              // 本阶段是否使用了工具
  failed?: boolean               // 是否失败
  hasBidDecision?: boolean       // 是否有出价决策
  actionType?: string            // 动作类型 "skill" | "item" | "none"
  actionId?: string              // 动作ID
  correctionAttempt?: number     // 纠错尝试次数
  userPrompt?: string            // 用户提示
  modelResponse?: string         // 模型响应
  elapsedMs?: number             // 耗时（毫秒）
  followupActionRejected?: boolean // 后续动作是否被拒绝
  error?: string                 // 错误信息
}

// ==================== LLM 请求/响应 ====================

/** LLM 请求选项 */
export interface LlmRequestOptions {
  temperature?: number
  maxTokens?: number
  timeout?: number
  responseFormat?: { type: 'json_object' }
  extraSystemPrompt?: string
}

/** LLM 响应结果 */
export interface LlmResponse {
  ok: boolean
  content: string
  code?: string                   // 错误码
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_cache_hit_tokens?: number
    prompt_cache_miss_tokens?: number
  }
  model?: string
  latency?: number                // 响应延迟（ms）
}

// ==================== LLM 错误 ====================

/** LLM 错误码 */
export type LlmErrorCode =
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'MISSING_API_KEY'
  | 'EMPTY_RESPONSE'
  | 'JSON_PARSE_ERROR'
  | 'INVALID_DECISION'
  | 'MODEL_MISMATCH'
  | 'PROXY_ERROR'
  | 'EXCEPTION'

/** LLM 错误信息（解析后的用户友好格式） */
export interface LlmErrorInfo {
  brief: string                   // 简短描述 "API密钥缺失"
  detail: string                  // 详细说明
  level?: 'error' | 'warning'     // 严重级别
  timestamp?: number
}

// ==================== 遥测 ====================

/** AI 决策遥测记录（单次 LLM 调用的完整记录） */
export interface LlmTelemetry {
  round: number
  playerId: string
  playerName: string
  model: string
  stage: 'initial' | 'followup_after_tool' | 'error_correction'
  latency: number                 // 响应延迟（ms）
  inputTokens: number
  outputTokens: number
  cacheHitTokens: number
  cacheMissTokens: number
  systemPrompt: string
  userPrompt: string
  response: string
  decision: LlmDecision | null
  error?: string
  errorCode?: LlmErrorCode
  corrections?: number            // 纠错次数
  toolResult?: string             // 工具执行结果
  timestamp: number
}

/** 回合遥测汇总（同回合所有AI决策的聚合） */
export interface RoundTelemetry {
  round: number
  entries: LlmTelemetry[]
  totalLatency: number
  totalTokens: number
  cacheHitRate: number
}

// ==================== LLM Bridge 方法签名 ====================

/** LLM 桥接器方法接口（scene-llm.js 返回的 methods 对象） */
export interface LlmBridgeMethods {
  renderAiLogicPanelForLlm(telemetry: object): string
  showAiConversationMessages(): void
  fillLlmSettingsForm(values: LlmSettings): void
  readLlmSettingsForm(): LlmSettings
  setLlmSettingsStatus(text: string, state: string): void
  testDeepSeekConnectionFromOverlay(): Promise<void>

  buildAiLlmRoundPayload(player: object): LlmRoundPayload
  buildAiIncrementalPayload(player: object): LlmIncrementalPayload
  buildAiFollowupRoundPayload(player: object, currentPlan: object, toolSummary: string): LlmFollowupPayload

  canUseLlmDecision(): boolean
  isAiLlmEnabledForPlayer(playerId: string): boolean
  canUseLlmDecisionForPlayer(playerId: string): boolean
  getAiModelConfigForPlayer(playerId: string): object
  getAiIndexFromPlayerId(playerId: string): number

  buildAiDecisionUserPrompt(payload: LlmRoundPayload, extraBlocks?: string[], options?: LlmRequestOptions): string
  buildAiDecisionMessages(payload: LlmRoundPayload, options?: LlmRequestOptions): ConversationMessage[]

  extractAiDecisionObject(content: string): LlmDecision | null
  resolveActionPick(rawText: string, type: 'skill' | 'item', availableIds: string[]): string | null
  normalizeAiLlmPlan(playerId: string, decision: LlmDecision, rawContent: string, options?: object): LlmPlan

  requestAiLlmPlan(player: object, options?: LlmRequestOptions): Promise<LlmPlan | null>
  buildAiToolResultSummary(result: object, actionType: string, actionId: string): string
  requestAiLlmFollowupBid(player: object, currentPlan: object, toolSummary: string): Promise<LlmPlan | null>
  requestAiLlmErrorCorrection(player: object, currentPlan: object, errorInfo: object, correctionHistory: object[], previousMessages: object[]): Promise<LlmPlan | null>
  prepareAiLlmRoundPlans(): void
  processAiDecisions(): void

  captureAiDecisionTelemetry(roundBids: object[]): void
}

/** LLM 桥接器完整接口（createSceneLlmBridge 返回值） */
export interface LlmBridge {
  methods: LlmBridgeMethods
  loadAiLlmPlayerSwitches(players: object[]): Record<string, boolean>
  saveAiLlmPlayerSwitches(switches: Record<string, boolean>): void
}