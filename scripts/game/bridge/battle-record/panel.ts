/**
 * @file bridge/battle-record/panel
 * @module bridge/battle-record/panel
 * @description 战绩面板 slice。面板开关 + 摘要 + 列表渲染。
 *              从 battle-record.ts 工厂闭包提取，接收 deps 注入。
 *
 * @exports createPanelSlice - 面板 slice 工厂，返回 { methods }
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { BattleRecordDeps, WarehouseSnapshotItem } from "./types"
import { load as loadAppState } from "../../core/app-state"
import { formatRecordTime } from "./pure"

export function createPanelSlice(deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
} {
  const { escapeHtml, formatBidRevealNumber } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    /**
     * 打开战绩记录面板
     * @returns {void}
     */
    openBattleRecordPanel() {
      if (!this.dom.battleRecordOverlay) {
        return
      }
      this.battleRecordLogView = null
      this.renderBattleRecordPanel()
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.animateOverlayOpen(this.dom.battleRecordOverlay)
      } else {
        this.dom.battleRecordOverlay.classList.remove("hidden")
      }
    },

    closeBattleRecordPanel() {
      if (!this.dom.battleRecordOverlay) {
        return
      }
      this.battleRecordLogView = null
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.animateOverlayClose(this.dom.battleRecordOverlay)
      } else {
        this.dom.battleRecordOverlay.classList.add("hidden")
      }
    },

    renderBattleRecordSummary() {
      const summaryEl = document.getElementById("battleRecordSummary")
      if (!summaryEl) {
        return
      }

      const appState = loadAppState()
      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      const totalGames = appState.totalGamesPlayed || 0
      const totalWins = appState.totalWins || 0
      const totalProfit = appState.totalProfit || 0
      const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0

      let bestProfit = 0
      let worstProfit = 0
      records.forEach((r) => {
        const p = Math.round(Number(r.playerProfit != null ? r.playerProfit : r.winnerProfit) || 0)
        if (p > bestProfit) {
          bestProfit = p
        }
        if (p < worstProfit) {
          worstProfit = p
        }
      })

      summaryEl.innerHTML = [
        '<div class="summary-grid">',
        `<div class="summary-item"><span class="summary-value">${totalGames}</span><span class="summary-label">总局数</span></div>`,
        `<div class="summary-item"><span class="summary-value">${totalWins}</span><span class="summary-label">胜场</span></div>`,
        `<div class="summary-item"><span class="summary-value">${winRate}%</span><span class="summary-label">胜率</span></div>`,
        `<div class="summary-item"><span class="summary-value">${totalProfit >= 0 ? "+" : ""}${formatBidRevealNumber(totalProfit)}</span><span class="summary-label">累计利润</span></div>`,
        `<div class="summary-item"><span class="summary-value">${bestProfit > 0 ? "+" : ""}${formatBidRevealNumber(bestProfit)}</span><span class="summary-label">最高单局</span></div>`,
        `<div class="summary-item"><span class="summary-value">${formatBidRevealNumber(worstProfit)}</span><span class="summary-label">最低单局</span></div>`,
        "</div>"
      ].join("")
    },

    /**
     * 渲染战绩记录面板内容
     * @returns {void}
     */
    renderBattleRecordPanel() {
      if (!this.dom.battleRecordContent) {
        return
      }

      if (this.battleRecordLogView && this.battleRecordLogView.recordId) {
        this.renderBattleRecordLogView(this.battleRecordLogView.recordId)
        return
      }

      this.renderBattleRecordSummary()

      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      if (records.length === 0) {
        this.dom.battleRecordContent.innerHTML = '<p class="battle-record-meta">暂无战绩，完成一局后会自动记录。</p>'
        return
      }

      const html = records
        .map((record, idx) => {
          const timeText = formatRecordTime(String(record.finishedAt || ""))
          const warehouseLines = (
            record.warehouse && Array.isArray(record.warehouse.items) ? record.warehouse.items : []
          )
            .map((item: WarehouseSnapshotItem) => {
              return `${item.name || "未知"} | 品类:${item.category || "未知"} | 品质:${item.qualityKey || "未知"} | 位置(${Number(item.x || 0) + 1},${Number(item.y || 0) + 1}) | 尺寸${item.w || 0}x${item.h || 0} | 价值${item.trueValue || 0}`
            })
            .join("\n")
          const hasAiDecisionPanel =
            record.logs &&
            typeof record.logs.aiDecisionPanelText === "string" &&
            record.logs.aiDecisionPanelText.length > 0

          const playerProfit = record.playerProfit != null ? record.playerProfit : record.winnerProfit
          const dtInfo = record.dividendTicketInfo
          let dtText = ""
          if (dtInfo) {
            if (dtInfo.mechanism === "dividend") {
              dtText = ` | 分红+${dtInfo.dividendPerPlayer || 0}`
            } else if (dtInfo.mechanism === "ticket") {
              dtText = ` | 门票-${dtInfo.ticketPerPlayer || 0}`
            }
          }

          return [
            '<article class="battle-record-entry">',
            `<h4>第 ${records.length - idx} 条 | ${escapeHtml(timeText)}</h4>`,
            `<p class="battle-record-meta">拍下者：${escapeHtml(record.winnerName || "-")}（${escapeHtml(record.reasonText || "结算")}）</p>`,
            `<p class="battle-record-meta">成交价：${formatBidRevealNumber(record.winnerBid)} | 仓库总值：${formatBidRevealNumber(record.totalValue)} | 拍下者利润：${(record.winnerProfit ?? 0) >= 0 ? "+" : ""}${formatBidRevealNumber(record.winnerProfit ?? 0)}</p>`,
            `<p class="battle-record-meta">自身利润：${(playerProfit ?? 0) >= 0 ? "+" : ""}${formatBidRevealNumber(playerProfit ?? 0)}${dtText}</p>`,
            `<p class="battle-record-meta">回合：${record.round} | 藏品数：${record.warehouse && record.warehouse.itemCount ? record.warehouse.itemCount : 0}</p>`,
            `<div class="battle-record-actions">`,
            `<button class="battle-record-replay-btn" type="button" data-record-id="${escapeHtml(record.id || "")}">复现该局结算页</button>`,
            hasAiDecisionPanel
              ? `<button class="battle-record-log-btn" type="button" data-record-log-id="${escapeHtml(record.id || "")}">查看AI决策日志</button>`
              : "",
            `<button class="battle-record-delete-btn" type="button" data-delete-record-id="${escapeHtml(record.id || "")}">删除</button>`,
            `</div>`,
            `<details><summary>查看该局真实仓库（揭晓后）</summary><pre class="battle-record-warehouse">${escapeHtml(warehouseLines || "无数据")}</pre></details>`,
            "</article>"
          ].join("")
        })
        .join("")

      this.dom.battleRecordContent.innerHTML = html
    }
  }

  return { methods }
}
