/**
 * @file types/ai.d.ts
 * @description AI 系统类型定义。涵盖 AI 人格、出价决策、情报分析、记忆、反思等核心数据结构。
 *              这些类型是 AI 引擎和 LLM 决策系统之间的数据契约。
 */

import type { Player, QualityLevel } from './game'

// ==================== 人格系统 ====================

/** AI 人格参数（控制AI行为风格） */
export interface Personality {
  name: string                     // 人格名称 "激进型"
  archetype: string                // 原型 "aggressive" | "balanced" | "cautious"
  aggression: number               // 激进程度 (0~1)
  discipline: number               // 纪律性 (0~1)
  followRate: number               // 跟风倾向 (0~1)
  bluffRate: number                // 欺诈概率 (0~1)
  errorRate: number                // 错误率 (0~1)
  anchorMin: number                // 锚点最小值 (0.5~0.9)
  anchorMax: number                // 锚点最大值 (1.1~1.5)
  openRaiseRatio: number           // 开局加价比例
  crowdBias: number                // 群体偏见
  expectationElasticity: number    // 预期弹性
  retreatFactor: number            // 退却因子
}

/** AI 心理状态（运行时动态，随轮次更新） */
export interface AiState {
  anchorBid: number        // 锚点出价（心理参考价）
  psychExpectedBid: number // 心理预期出价
  lastBid: number          // 上次出价
}

/** 本轮元信息 */
export interface RunMeta {
  startingBid: number  // 首轮起始出价
  itemCount: number    // 藏品数量
}

// ==================== 出价决策 ====================

/** 出价上下文（AI 决策入口参数） */
export interface BidContext {
  playerId: string                // AI 玩家ID
  clueRate: number                // 线索率 (0~1)
  qualityRate: number             // 品质率 (0~1)
  uncertainty: number             // 不确定性 (0~1)
  spreadRatio: number             // 价格离散度 (0~1.5)
  upperEdge: number               // 上边缘信号 (-0.4~0.6)
  lowerEdge: number               // 下边缘信号 (-0.4~0.6)
  roundProgress: number           // 轮次进度 (0~1)
  currentBid: number              // 当前最高出价
  marketRef: number               // 市场参考价
  persona: Personality            // 人格参数
  bidStep: number                 // 出价步长
  toolEffect: ToolEffect          // 工具使用效果
}

/** 单次出价决策结果 */
export interface BidDecision {
  playerId: string
  name: string                    // 人格名称
  archetype: string               // 原型
  confidence: number              // 信心值
  confidenceParts: ConfidenceParts
  intelClueRate: number
  intelQualityRate: number
  intelUncertainty: number
  intelSpreadRatio: number
  intelUpperEdge: number
  intelLowerEdge: number
  marketRef: number
  perceivedValue: number          // 感知价值
  hardCap: number                 // 出价上限
  targetPsychExpected: number
  psychExpectedBid: number
  overheatThreshold: number       // 过热阈值
  overheatRatio: number           // 过热比例
  floorAdjustAmount: number       // 底线调整
  toolTag: string                 // 工具标签
  toolScoreBoost: number          // 工具加成
  actionTag: string               // 行为标签
  mistakeTag: string              // 失误标签
  diversifyTag: string            // 多样性标签
  finalBid: number                // 最终出价
}

/** 信心分解（各部分对最终信心的贡献） */
export interface ConfidenceParts {
  total: number           // 总信心
  base: number            // 基础信心
  clue: number            // 线索贡献
  quality: number         // 品质贡献
  edge: number            // 边缘信号贡献
  spread: number          // 离散度贡献
  tool: number            // 工具贡献
  roundPhase: number      // 轮次阶段贡献
  [key: string]: number   // 允许扩展
}

/** 工具使用效果（技能/道具转换后的数值影响） */
export interface ToolEffect {
  tag: string                     // 工具标签 "none" | "outline" | "quality" | "full"
  strategyScoreBoost: number      // 策略加成
  confidenceBoost: number         // 信心提升
  upperCapBoost: number           // 上限加成
  followBoost: number             // 跟风加成
  uncertaintyReduction: number    // 不确定性降低
  actionType?: string             // 原始动作类型 "skill" | "item" | "none"
  actionId?: string               // 原始动作ID
}

// ==================== 情报分析 ====================

/** AI 私有情报（每个AI玩家的探查结果汇总） */
export interface AiPrivateIntel {
  outlineSignals: AiIntelSignal[]
  qualitySignals: AiIntelSignal[]
  signalHistory: AiIntelSignal[]
  aggregateStats: IntelAggregate | null
  latestSignalStats: IntelAggregate | null
  knownCellStates: Record<string, string>
  itemKnowledge: Record<string, AiItemKnowledge>
  highValueTrackByItemId: Record<string, string>
  highValueTracks: HighValueTrack[]
  nextTrackIndex: number
  knownOutlineIds: Set<string>
  knownQualityIds: Set<string>
}

/** 情报汇总指标 */
export interface IntelAggregate {
  clueRate: number        // 线索率
  qualityRate: number     // 品质率
  uncertainty: number     // 不确定性
  spreadRatio: number     // 离散度
  upperEdge: number       // 上边缘
  lowerEdge: number       // 下边缘
  mean?: number           // 平均值
  std?: number            // 标准差
  iqr?: number            // 四分位距
  count?: number          // 数量
}

/** 高价值藏品追踪 */
export interface HighValueTrack {
  trackId: string
  itemId: string
  createdRound: number
  lastSeenRound: number
}

/** AI 情报总结（传给 AI 决策引擎的简化版） */
export interface IntelSummary {
  clueRate: number
  qualityRate: number
  uncertainty: number
  spreadRatio: number
  upperEdge: number
  lowerEdge: number
}

// ==================== 行动规划 ====================

/** 行动候选（技能/道具评分结果） */
export interface ActionCandidate {
  actionType: 'skill' | 'item' | 'none'
  actionId: string
  expectedReveal: number   // 预期揭示数
  score: number            // 综合评分
}

/** AI 行动计划 */
export interface IntelActionPlan {
  actionType: 'skill' | 'item' | 'none'
  actionId: string
  expectedReveal: number
  score: number
  decisionSource?: string
  lockedByLlm?: boolean
  candidates?: unknown[]
}

// ==================== AI 记忆 ====================

/** 跨局记忆条目 */
export interface CrossGameMemory {
  runId?: number               // 局号
  result?: string              // 结果 "win" | "lose" | "fold"
  profit?: number              // 盈亏
  bidAmount?: number           // 最终出价
  trueValue?: number           // 真实总价
  keyObservation?: string      // 关键观察
  lesson?: string              // 教训
  timestamp?: number           // 时间戳
  stats?: CrossGameStats       // 统计数据
  lessons?: string[]           // 教训列表
  strategies?: string[]        // 策略列表
  praises?: string[]           // 赞扬列表
}

/** 跨局统计数据 */
export interface CrossGameStats {
  totalGames: number
  warehouseValueMax: number
  warehouseValueMin: number
  warehouseValueAvg: number
  winRate: number
  avgProfit: number
  totalCellsMax: number
  totalCellsMin: number
  totalCellsAvg: number
  totalItemsMax: number
  totalItemsMin: number
  totalItemsAvg: number
  legendaryMax: number
  legendaryMin: number
  legendaryAvg: number
  rareMax: number
  rareMin: number
  rareAvg: number
}

/** 多轮对话消息 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  round?: number
  bid?: number | null
  skill?: string
  item?: string
  thought?: string
  result?: string
  run?: number
}

/** AI 对话桶条目（回合级决策记录） */
export interface ConversationBucketEntry {
  run: number
  round: number
  bid: number | null
  skill: string
  item: string
  thought: string
  result: string
}

// ==================== AI 记忆存储 ====================

/** AI 私有情报池 */
export interface AiPrivateIntelPool {
  knownOutlineIds: Set<string>
  knownQualityIds: Set<string>
  outlineSignals: AiIntelSignal[]
  qualitySignals: AiIntelSignal[]
  signalHistory: AiIntelSignal[]
  latestSignalStats: { aggregate: AiSignalStats; latest: AiSignalStats } | null
  aggregateStats: AiSignalStats | null
  knownCellStates: Record<string, string>
  itemKnowledge: Record<string, AiItemKnowledge>
  highValueTrackByItemId: Record<string, string>
  highValueTracks: HighValueTrack[]
  nextTrackIndex: number
}

/** AI 情报信号 */
export interface AiIntelSignal {
  qualityKey?: string
  itemId?: string
  sampleCell?: { x: number; y: number }
  category?: string
  timestamp?: number
  revealed?: number
  signalStats?: AiSignalStats
}

/** AI 信号统计 */
export interface AiSignalStats {
  mean: number
  spreadRatio: number
  upperEdge: number
  lowerEdge: number
  std: number
  iqr: number
  count: number
}

/** AI 物品知识 */
export interface AiItemKnowledge {
  revealCount: number
  lastSeenRound: number
  category: string | null
  qualityKey: QualityLevel | null
  sizeTag: string | null
  knownCells: Set<string>
  estimatedValue?: number
  confidence?: number
}

/** AI 记忆存储 */
export interface AiMemoryStorage {
  conversations: Record<string, ConversationMessage[]>
  crossGameMemory: CrossGameMemory[]
  crossGameMessages: Record<string, ConversationMessage[]>
  pendingSummaryByPlayer: Record<string, unknown>
  pendingSummary?: unknown
  runSerial: number
  savedAt: number
}

// ==================== 反思系统 ====================

/** 反思结果 */
export interface ReflectionResult {
  summary: string              // 反思摘要
  adjustments: ReflectionAdjustment[]  // 调整项
  confidence: number           // 反思置信度
}

/** 反思调整项 */
export interface ReflectionAdjustment {
  target: string      // 调整目标 "anchorBid" | "aggression" | "followRate"
  delta: number       // 调整幅度
  reason: string      // 调整原因
}

/** 动作定义（技能/道具） */
export interface ActionDef {
  id: string          // 动作ID "skill-outline-scan"
  type: string        // 动作类型 "skill" | "item"
  name: string        // 动作名称 "技能-拓影侦测"
  description: string // 动作描述
}

/** AI 出价引擎 */
export interface AuctionAiEngine {
  // 属性
  personalityMap: Record<string, Personality>
  aiState: Map<string, AiState>
  runMeta: { startingBid: number; itemCount: number }
  lastDecisionLog: Record<string, unknown> | null

  // 方法
  resetForNewRun(context: { startingBid?: number; itemCount?: number }): void
  buildAIBids(context: {
    aiPlayers: Array<{ id: string }>
    clueRate: number
    round: number
    maxRounds: number
    currentBid: number
    lastRoundBids?: Record<string, number>
    bidStep?: number
    aiIntelMap?: Record<string, unknown>
    aiToolEffectMap?: Record<string, unknown>
  }): Record<string, number>
  computeSingleDecision(args: {
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
    toolEffect: unknown
  }): unknown
  planIntelAction(args: {
    playerId: string
    round: number
    maxRounds: number
    persona: Personality
    pool: unknown
    roundProgress: number
    currentBid: number
    marketRef: number
  }): unknown
  buildToolEffect(args: { actionType: string; actionId?: string }): unknown
  getLastDecisionLog(): Record<string, unknown> | null
}