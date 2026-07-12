/**
 * @file bridge/battle-record/types
 * @module bridge/battle-record/types
 * @description 战绩记录系统共享类型声明。从 battle-record.ts 提取，供薄入口与各子模块 import。
 */

export interface BattleRecordDeps {
  BATTLE_RECORD_STORAGE_KEY: string
  GRID_COLS: number
  GRID_ROWS: number
  clamp(v: number, min: number, max: number): number
  escapeHtml(s: string): string
  formatBidRevealNumber(v: number): string
  [key: string]: unknown
}

export interface BattleRecordSaveResult {
  mode?: string
  winnerId?: string
  winnerName?: string
  winnerBid?: number | string
  totalValue?: number | string
  winnerProfit?: number | string
  playerProfit?: number | string
  playerWon?: boolean
  dividendTicketInfo?: {
    mechanism?: string
    dividendPerPlayer: number
    ticketPerPlayer: number
  } | null
  reasonText?: string
}

export interface WarehouseSnapshotItem {
  id?: string
  key?: string
  name?: string
  category?: string
  qualityKey?: string
  w?: number | string
  h?: number | string
  x?: number | string
  y?: number | string
  trueValue?: number | string
}

export interface AiThoughtLogEntry {
  round?: number
  controlMode?: string
  playerName?: string
  finalBid?: number
  decisionSource?: string
  cacheHitTokens?: number
  cacheMissTokens?: number
  cacheHitRate?: number
  llmActionName?: string
  actionExecuted?: boolean
  ruleActionName?: string
  error?: string
  thought?: string
  [key: string]: unknown
}

export interface BattleRecordLogs {
  aiDecisionPanelText?: string | null
  runNo?: number | null
  aiThoughtLogs?: AiThoughtLogEntry[]
  roundLogsByRound?: Record<string, string[]>
  roundPanelTexts?: Record<string, string>
  [key: string]: unknown
}

export interface BattleRecord {
  id?: string
  finishedAt?: string | number
  round?: number
  mode?: string
  winnerId?: string
  winner: string
  winnerName?: string
  winnerBid: number
  totalValue: number
  winnerProfit?: number
  playerProfit?: number
  playerWon?: boolean
  itemCount?: number
  roundCount?: number
  players?: string[]
  reasonText?: string
  warehouse?: {
    cols?: number
    rows?: number
    items: WarehouseSnapshotItem[]
    itemCount?: number
  }
  logs?: BattleRecordLogs | null
  logsRound?: number
  dividendTicketInfo?: {
    mechanism?: string
    dividendPerPlayer: number
    ticketPerPlayer: number
  } | null
  [key: string]: unknown
}
