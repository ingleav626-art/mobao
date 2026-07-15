import { defineStore } from "pinia"

// ─── 类型定义 ───

export interface AiThoughtLogEntry {
  round?: number
  playerName?: string
  thought?: string
  reasoningContent?: string
  crossGameMemoryCount?: number
  controlMode?: string
  finalBid?: number
  decisionSource?: string
  llmActionName?: string
  ruleActionName?: string
  actionExecuted?: boolean
  error?: string
  correctionAttempt?: number
  originalError?: string
  cacheHitTokens?: number
  cacheMissTokens?: number
  cacheHitRate?: number
  at?: number
}

export interface ConfidenceParts {
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
}

export interface AiDecisionResult {
  playerId: string
  playerName: string
  finalBid: number
  controlMode: string
  decisionSource: string
  correctionAttempt: number
  originalError?: string
  historyMessagesCount: number
  crossGameMemoryCount: number
  inGameHistoryCount: number
  thought?: string
  reasoningContent?: string
  error?: string
  fallbackRuleBid?: number | null
  systemPrompt?: string
  userPrompt?: string
  modelResponse?: string
  toolResultSummary?: string
  errorCorrectionPrompt?: string
  errorCorrectionResponse?: string
  followupPrompt?: string
  followupResponse?: string
  followupError?: string
  followupActionRejected?: string
  llmActionName?: string
  ruleActionName?: string
  actionExecuted?: boolean
  cacheHitTokens?: number
  cacheMissTokens?: number
  cacheHitRate?: number
  confidence?: number
  archetype?: string
  perceivedValue?: number
  hardCap?: number
  psychExpectedBid?: number
  intelClueRate?: number
  intelQualityRate?: number
  intelUncertainty?: number
  intelSpreadRatio?: number
  overheatRatio?: number
  overheatThreshold?: number
  toolTag?: string
  toolScoreBoost?: number
  actionTag?: string
  mistakeTag?: string
  diversifyTag?: string
  confidenceParts?: ConfidenceParts
}

export interface RoundTelemetry {
  round: number
  mode?: string
  entries?: AiDecisionResult[]
}

export const useAiPanelStore = defineStore("aiPanel", {
  state: () => ({
    /** 面板是否打开 */
    isOpen: false,
    /** AI 思考日志列表（跨局累积） */
    thoughtLogs: [] as AiThoughtLogEntry[],
    /** 决策结果列表（按玩家） */
    decisionResults: [] as AiDecisionResult[],
    /** 当前回合决策条目 */
    currentRoundEntries: [] as AiDecisionResult[],
    /** 原始遥测数据 */
    telemetry: null as RoundTelemetry | null
  }),

  actions: {
    /** 打开面板 */
    openPanel(): void {
      this.isOpen = true
    },

    /** 关闭面板 */
    closePanel(): void {
      this.isOpen = false
    },

    /** 同步整个思考日志数组 */
    syncThoughtLogs(logs: AiThoughtLogEntry[]): void {
      this.thoughtLogs = logs
    },

    /** 追加思考日志条目 */
    addThoughtLogs(logs: AiThoughtLogEntry[]): void {
      this.thoughtLogs.push(...logs)
      if (this.thoughtLogs.length > 200) {
        this.thoughtLogs = this.thoughtLogs.slice(-200)
      }
    },

    /** 更新决策结果列表 */
    updateDecisions(results: AiDecisionResult[]): void {
      this.decisionResults = results
    },

    /** 更新当前回合条目 */
    updateCurrentRoundEntries(entries: AiDecisionResult[]): void {
      this.currentRoundEntries = entries
    },

    /** 更新遥测数据 */
    updateTelemetry(telemetry: RoundTelemetry | null): void {
      this.telemetry = telemetry
    },

    /** 清空当前回合数据 */
    clearRound(): void {
      this.currentRoundEntries = []
      this.telemetry = null
    }
  }
})
