export interface RecordSlice {
  highValuePriceThreshold: number | null
  battleRecords: unknown[]
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  battleRecordLogView: { recordId: string; page: number } | null
  pendingNextRunAiSummaryByPlayer: Record<string, string>
  pendingSettlementSummary: string
  privateIntelEntries: Array<{ source: string; text: string; round: number }>
  publicInfoEntries: Array<{ source: string; text: string }>
}

export function createRecordSlice(): RecordSlice {
  return {
    highValuePriceThreshold: null,
    battleRecords: [],
    battleRecordReplayActive: false,
    battleRecordReplayRecordId: null,
    battleRecordLogView: null,
    pendingNextRunAiSummaryByPlayer: {},
    pendingSettlementSummary: "",
    privateIntelEntries: [],
    publicInfoEntries: []
  }
}

export function reset(s: RecordSlice): void {
  // 重置瞬态（本局记录状态），保留持久化字段：
  // - battleRecords（localStorage mobao_battle_records_v1，跨局保留的战绩历史）
  // - pendingNextRunAiSummaryByPlayer（AI 记忆系统跨局摘要，saveAiMemoryToStorage 持久化）
  s.highValuePriceThreshold = null
  s.battleRecordReplayActive = false
  s.battleRecordReplayRecordId = null
  s.battleRecordLogView = null
  s.pendingSettlementSummary = ""
  s.privateIntelEntries = []
  s.publicInfoEntries = []
}