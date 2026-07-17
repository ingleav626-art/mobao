/**
 * @file bridge/battle-record/replay
 * @module bridge/battle-record/replay
 * @description 回放流程控制 slice。从战绩记录恢复结算页展示。
 *              从 battle-record.ts 工厂闭包提取，接收 deps 注入。
 *
 * @exports createReplaySlice - 回放 slice 工厂，返回 { methods }
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { BattleRecordDeps } from "./types"
import type { Player } from "../../../../types/game"

export function createReplaySlice(_deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
} {
  const methods: ThisType<WarehouseSceneThis> = {
    openBattleRecordReplay(recordId: string) {
      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      const record = records.find((entry) => entry && entry.id === recordId)
      if (!record) {
        this.writeLog("未找到该条战绩，可能已被清理。请刷新后重试。")
        return
      }

      const replayItems = record.warehouse && Array.isArray(record.warehouse.items) ? record.warehouse.items : []
      if (replayItems.length === 0) {
        this.writeLog("该条战绩缺少仓库快照，暂时无法复现结算页。")
        return
      }

      const lobbyPage = document.getElementById("lobbyPage")
      const isLobbyVisible = lobbyPage && !lobbyPage.classList.contains("hidden")
      if (isLobbyVisible && typeof this.exitLobby === "function") {
        this.exitLobby()
      }

      this.battleRecordReplayActive = true
      this.battleRecordReplayRecordId = record.id || null
      this.isSettlementRevealMode = true
      this.closeBattleRecordPanel()
      this.roundManager.stopRoundTimer()
      this.roundResolving = false
      this.roundPaused = false
      this.playerBidSubmitted = true
      this.settled = true

      this.restoreWarehouseFromBattleRecord(record)

      const replayWinner: Player = {
        id: record.winnerId || "record-replay-winner",
        name: record.winnerName || "未知玩家",
        avatar: "replay",
        isHuman: false,
        isAI: true,
        isSelf: false
      }
      const winnerBid = Math.max(0, Math.round(Number(record.winnerBid) || 0))
      const totalValue = Math.max(0, Math.round(Number(record.totalValue) || 0))
      const winnerProfit = Math.round(Number(record.winnerProfit) || totalValue - winnerBid)
      const reasonText = record.reasonText || "结算"

      this.enterSettlementPage(replayWinner, winnerBid, `${reasonText} · 战绩回放`)
      this.updateSettlementPanelMetrics(totalValue, winnerProfit)

      const replayPlayerProfit = record.playerProfit != null ? record.playerProfit : winnerProfit
      const replayDtInfo = record.dividendTicketInfo
      const humanPlayer = this.players ? this.players.find((p) => p.isSelf) : null
      if (humanPlayer && replayWinner.id !== humanPlayer.id) {
        let replaySelfLabel = "自身利润"
        if (replayDtInfo) {
          if (replayDtInfo.mechanism === "dividend") {
            replaySelfLabel = "自身利润（分红）"
          } else if (replayDtInfo.mechanism === "ticket") {
            replaySelfLabel = "自身利润（门票）"
          }
        }
        this.showSelfProfit(replayPlayerProfit, replaySelfLabel)
      }

      this.setSettlementProgress(`战绩回放：${replayWinner.name} 利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`)
      this.writeLog(`已加载战绩回放：${replayWinner.name} 以 ${winnerBid} 拿下整仓。`)
      this.updateHud()
    }
  }

  return { methods }
}
