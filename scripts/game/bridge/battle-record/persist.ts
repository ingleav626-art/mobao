/**
 * @file bridge/battle-record/persist
 * @module bridge/battle-record/persist
 * @description 战绩持久化 slice。localStorage 读写 + 保存/删除/快照方法。
 *              从 battle-record.ts 工厂闭包提取，接收 deps 注入。
 *
 * @exports createPersistSlice - 持久化 slice 工厂，返回 { methods, loadBattleRecords, saveBattleRecords }
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type {
  AiThoughtLogEntry,
  BattleRecord,
  BattleRecordDeps,
  BattleRecordLogs,
  BattleRecordSaveResult,
  WarehouseSnapshotItem
} from "./types"
import { formatRecordTime } from "./pure"

export function createPersistSlice(deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
  loadBattleRecords: () => BattleRecord[]
  saveBattleRecords: (records: BattleRecord[]) => void
} {
  const { BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS, formatBidRevealNumber } = deps

  function loadBattleRecords(): BattleRecord[] {
    const raw = window.localStorage.getItem(BATTLE_RECORD_STORAGE_KEY)
    if (!raw) {
      return []
    }

    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed
        .filter((record): record is Record<string, unknown> => record != null && typeof record === "object")
        .map((record, idx) => {
          if (record.id) {
            return record as unknown as BattleRecord
          }
          return {
            ...record,
            id: `legacy-rec-${idx}`,
            winner: String(record.winnerName || "未知"),
            winnerBid: Number(record.winnerBid) || 0,
            totalValue: Number(record.totalValue) || 0
          } as BattleRecord
        })
        .slice(0, 20)
    } catch (_error) {
      return []
    }
  }

  function saveBattleRecords(records: BattleRecord[]): void {
    const list = Array.isArray(records) ? records.slice(0, 20) : []
    window.localStorage.setItem(BATTLE_RECORD_STORAGE_KEY, JSON.stringify(list))
  }

  const methods: ThisType<WarehouseSceneThis> = {
    buildWarehouseSnapshotForRecord() {
      return this.items
        .map((item) => ({
          id: item.id,
          key: item.key,
          name: item.name,
          category: item.category,
          qualityKey: item.qualityKey,
          w: item.w,
          h: item.h,
          x: item.x,
          y: item.y,
          trueValue: item.trueValue
        }))
        .sort((a, b) => {
          if (a.y !== b.y) {
            return a.y - b.y
          }
          if (a.x !== b.x) {
            return a.x - b.x
          }
          return String(a.id).localeCompare(String(b.id))
        })
    },

    /**
     * 保存对局战绩记录
     * @param {Object} result - 对局结果 { mode, winnerId, profit, ... }
     * @returns {void}
     */
    saveBattleRecord(result: BattleRecordSaveResult) {
      const hasLlm = typeof this.canUseLlmDecision === "function" && this.canUseLlmDecision()
      const runLog = this.currentRunLog
      let aiDecisionPanelText: string | null = null
      if (hasLlm && this.lastAiDecisionTelemetry && (this.lastAiDecisionTelemetry as unknown as Record<string, unknown>).mode === "llm") {
        aiDecisionPanelText = this.buildAiDecisionPanelSnapshot(this.lastAiDecisionTelemetry as unknown as Record<string, unknown>) as string | null
      }
      const record: BattleRecord = {
        id: `rec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        finishedAt: new Date().toISOString(),
        round: this.round,
        mode: result.mode,
        winnerId: result.winnerId,
        winnerName: result.winnerName,
        winner: result.winnerName || "未知",
        winnerBid: Math.round(Number(result.winnerBid) || 0),
        totalValue: Math.round(Number(result.totalValue) || 0),
        winnerProfit: Math.round(Number(result.winnerProfit) || 0),
        playerProfit: Math.round(Number(result.playerProfit) || 0),
        playerWon: Boolean(result.playerWon),
        dividendTicketInfo: result.dividendTicketInfo || null,
        reasonText: result.reasonText || "结算",
        warehouse: {
          cols: GRID_COLS,
          rows: GRID_ROWS,
          itemCount: this.items.length,
          items: this.buildWarehouseSnapshotForRecord() as WarehouseSnapshotItem[]
        },
        logs:
          hasLlm && aiDecisionPanelText
            ? ({
              aiDecisionPanelText,
              runNo: runLog && Number.isFinite(Number(runLog.runNo)) ? Math.round(Number(runLog.runNo)) : null,
              aiThoughtLogs: (runLog && Array.isArray(runLog.aiThoughtLogs) ? runLog.aiThoughtLogs : []) as AiThoughtLogEntry[],
              roundLogsByRound: (runLog && runLog.roundLogsByRound ? runLog.roundLogsByRound : {}) as Record<string, string[]>,
              roundPanelTexts: (runLog && runLog.roundPanelTexts ? runLog.roundPanelTexts : {}) as Record<string, string>
            } as BattleRecordLogs)
            : null,
        logsRound: this.round || 0
      }
      console.log(
        `[saveBattleRecord] hasLlm=${hasLlm}, aiDecisionPanelText=${aiDecisionPanelText?.length || 0}, roundPanelTexts keys=${runLog?.roundPanelTexts ? Object.keys(runLog.roundPanelTexts as Record<string, unknown>) : "none"}, roundLogsByRound keys=${runLog?.roundLogsByRound ? Object.keys(runLog.roundLogsByRound as Record<string, unknown>) : "none"}`
      )

      this.battleRecords = [record, ...(this.battleRecords || [])].slice(0, 20) as typeof this.battleRecords
      saveBattleRecords(this.battleRecords as unknown as BattleRecord[])

      if (this.dom.battleRecordOverlay && !this.dom.battleRecordOverlay.classList.contains("hidden")) {
        this.renderBattleRecordPanel()
      }
    },

    deleteBattleRecord(recordId: string) {
      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      const record = records.find((entry) => entry && entry.id === recordId)
      if (!record) {
        this.writeLog("未找到可删除的战绩。")
        return
      }

      const label = `${record.winnerName || "未知玩家"} / ${formatBidRevealNumber(record.winnerBid)} / ${formatRecordTime(String(record.finishedAt || ""))}`
      const confirmed = window.confirm(`确定删除这条战绩吗？\n${label}`)
      if (!confirmed) {
        return
      }

      this.battleRecords = records.filter((entry) => entry && entry.id !== recordId).slice(0, 20)
      saveBattleRecords(this.battleRecords as unknown as BattleRecord[])

      if (this.battleRecordReplayRecordId === recordId) {
        this.battleRecordReplayActive = false
        this.battleRecordReplayRecordId = null
        this.exitSettlementPage()
      }

      if (this.dom.battleRecordOverlay && !this.dom.battleRecordOverlay.classList.contains("hidden")) {
        this.renderBattleRecordPanel()
      }

      this.writeLog("战绩已删除。")
    }
  }

  return { methods, loadBattleRecords, saveBattleRecords }
}
