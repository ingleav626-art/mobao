/**
 * @file bridge/battle-record/log-view
 * @module bridge/battle-record/log-view
 * @description AI 决策日志视图 slice。日志视图开关 + 渲染（含 parsePanelTextToHtml 调用）。
 *              从 battle-record.ts 工厂闭包提取，接收 deps 注入。
 *
 * @exports createLogViewSlice - 日志视图 slice 工厂，返回 { methods }
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { AiThoughtLogEntry, BattleRecordDeps } from "./types"
import { parsePanelTextToHtml, formatRecordTime } from "./pure"

export function createLogViewSlice(deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
} {
  const { escapeHtml, formatBidRevealNumber } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    openBattleRecordLogs(recordId: string, page = 1) {
      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      const record = records.find((entry) => entry && entry.id === recordId)
      if (!record) {
        this.writeLog("未找到该条战绩日志。请刷新后重试。")
        return
      }

      this.battleRecordLogView = {
        recordId,
        page: Math.max(1, Math.round(Number(page) || 1))
      }
      this.renderBattleRecordLogView(recordId)
    },

    closeBattleRecordLogs() {
      this.battleRecordLogView = null
      this.renderBattleRecordPanel()
    },

    renderBattleRecordLogView(recordId?: string) {
      if (!this.dom.battleRecordContent || !this.battleRecordLogView || !this.battleRecordLogView.recordId) {
        return
      }

      const records = Array.isArray(this.battleRecords) ? this.battleRecords : []
      const record = records.find((entry) => entry && entry.id === (recordId || this.battleRecordLogView?.recordId))
      if (!record) {
        this.battleRecordLogView = null
        this.renderBattleRecordPanel()
        return
      }

      const panelText =
        record && record.logs && typeof record.logs.aiDecisionPanelText === "string"
          ? record.logs.aiDecisionPanelText
          : ""

      if (!panelText) {
        const winnerName = record.winnerName || "未知玩家"
        const html = [
          '<article class="battle-record-log-view">',
          '<div class="battle-record-log-head">',
          `<h4>${escapeHtml(winnerName)} | ${escapeHtml(formatRecordTime(String(record.finishedAt || "")))}</h4>`,
          '<button class="battle-record-log-close-btn" type="button" data-log-close="1" aria-label="关闭日志页">×</button>',
          "</div>",
          `<p class="battle-record-meta">该局无AI决策日志（未使用大模型AI）。</p>`,
          "</article>"
        ].join("")
        this.dom.battleRecordContent.innerHTML = html
        return
      }

      const winnerName = record.winnerName || "未知玩家"
      const runNo =
        record.logs && Number.isFinite(Number(record.logs.runNo)) ? Math.round(Number(record.logs.runNo)) : null
      const aiThoughtLogs: AiThoughtLogEntry[] = record.logs && Array.isArray(record.logs.aiThoughtLogs) ? record.logs.aiThoughtLogs as AiThoughtLogEntry[] : []
      const roundLogsByRound: Record<string, string[]> = record.logs && record.logs.roundLogsByRound ? record.logs.roundLogsByRound as Record<string, string[]> : {}
      const roundPanelTexts: Record<string, string> = record.logs && record.logs.roundPanelTexts ? record.logs.roundPanelTexts : {}

      const roundSet = new Set<number>()
      aiThoughtLogs.forEach((e) => {
        if (e.round) roundSet.add(e.round)
      })
      Object.keys(roundLogsByRound).forEach((k) => {
        const n = Number(k)
        if (Number.isFinite(n) && n > 0) roundSet.add(n)
      })
      Object.keys(roundPanelTexts).forEach((k) => {
        const n = Number(k)
        if (Number.isFinite(n) && n > 0) roundSet.add(n)
      })
      const allRounds = Array.from(roundSet).sort((a, b) => a - b)
      const maxRound = allRounds.length > 0 ? allRounds[allRounds.length - 1] : 0
      console.log(
        `[renderBattleRecordLogView] roundPanelTexts keys=${Object.keys(roundPanelTexts)}, roundLogsByRound keys=${Object.keys(roundLogsByRound)}, allRounds=${allRounds}, maxRound=${maxRound}`
      )

      const currentPage = Math.max(
        1,
        Math.min(Math.round(Number(this.battleRecordLogView.page) || 1), maxRound > 0 ? maxRound : 1)
      )

      let bodyContent = ""
      if (maxRound > 0) {
        const roundPanelText = roundPanelTexts[String(currentPage)]
        const roundThoughts = aiThoughtLogs.filter((e) => e.round === currentPage)
        const roundActionLogs: string[] = Array.isArray(roundLogsByRound[String(currentPage)]) ? roundLogsByRound[String(currentPage)] as string[] : []

        const lines: string[] = []
        lines.push(`<div class="ai-round-header">第 ${currentPage} 轮 / 共 ${maxRound} 轮</div>`)

        if (roundPanelText) {
          lines.push(roundPanelText)
        } else if (panelText && Object.keys(roundPanelTexts).length === 0) {
          const isLegacy = currentPage === 1 ? "（该局在旧版本中运行，此为最终轮快照）" : ""
          lines.push(`<div class="ai-round-section-header">完整AI决策详情 ${isLegacy}</div>`)
          lines.push(parsePanelTextToHtml(panelText, escapeHtml))
        }

        if (roundThoughts.length > 0) {
          lines.push(`<div class="ai-round-section-header">AI决策摘要</div>`)
          roundThoughts.forEach((entry) => {
            const isLlm = entry.controlMode === "llm"
            const badgeClass = isLlm ? "badge-llm" : "badge-rule"
            const badgeText = isLlm ? "大模型" : "规则AI"
            lines.push(`<div class="ai-player-card" style="margin:6px 0;">`)
            lines.push(`<div class="ai-player-card-header"><span class="player-name">${escapeHtml(entry.playerName || "AI")}</span><span class="control-badge ${badgeClass}">${badgeText}</span></div>`)
            lines.push(`<div class="ai-player-card-body">`)
            lines.push(`<div class="ai-decision-summary"><span class="label">出价</span><span class="value bid-value">${formatBidRevealNumber(entry.finalBid ?? 0)}</span><span class="label">来源</span><span class="value">${escapeHtml(entry.decisionSource || "?")}</span></div>`)
            if (isLlm) {
              const cacheHit = entry.cacheHitTokens || 0
              const cacheMiss = entry.cacheMissTokens || 0
              const cacheRate = entry.cacheHitRate || 0
              lines.push(`  缓存命中: ${cacheHit} tokens | 未命中: ${cacheMiss} tokens | 命中率: ${cacheRate}%`)
            }
            if (entry.llmActionName) {
              lines.push(
                `  动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}${entry.ruleActionName ? ` | 规则动作: ${entry.ruleActionName}` : ""}`
              )
            }
            if (entry.error) {
              lines.push(`<div class="ai-error-box">错误: ${escapeHtml(entry.error)}</div>`)
            }
            if (entry.thought) {
              lines.push(`<div class="ai-thought-box"><div class="thought-label">思考</div>${escapeHtml(entry.thought)}</div>`)
            }
            lines.push(`</div></div>`)
          })
        }

        if (roundActionLogs.length > 0) {
          lines.push(`<div class="ai-round-section-header">行动日志</div>`)
          lines.push(`<div class="ai-action-log">`)
          roundActionLogs.forEach((line) => lines.push(`<div class="ai-action-log-line">${escapeHtml(line)}</div>`))
          lines.push(`</div>`)
        }

        bodyContent = lines.join("")
      } else {
        bodyContent = panelText ? parsePanelTextToHtml(panelText, escapeHtml) : ""
      }

      const paginationHtml =
        maxRound > 1
          ? `<div class="battle-record-log-pagination">
              <button class="battle-record-log-page-btn" type="button" data-log-prev="1"${currentPage <= 1 ? " disabled" : ""}>◀ 上一轮</button>
              <span class="battle-record-log-page-info">第 ${currentPage} 轮 / 共 ${maxRound} 轮</span>
              <button class="battle-record-log-page-btn" type="button" data-log-next="1"${currentPage >= maxRound ? " disabled" : ""}>下一轮 ▶</button>
            </div>`
          : ""

      const html = [
        '<article class="battle-record-log-view">',
        '<div class="battle-record-log-head">',
        `<h4>${escapeHtml(winnerName)} | ${escapeHtml(formatRecordTime(String(record.finishedAt || "")))}${runNo ? ` | 第 ${runNo} 局` : ""}</h4>`,
        '<button class="battle-record-log-close-btn" type="button" data-log-close="1" aria-label="关闭日志页">×</button>',
        "</div>",
        `<p class="battle-record-meta">成交价：${formatBidRevealNumber(record.winnerBid)} | 仓库总值：${formatBidRevealNumber(record.totalValue)} | 拍下者利润：${(record.winnerProfit ?? 0) >= 0 ? "+" : ""}${formatBidRevealNumber(record.winnerProfit ?? 0)}</p>`,
        (() => {
          const pp: number = record.playerProfit != null ? record.playerProfit : (record.winnerProfit ?? 0)
          const dt = record.dividendTicketInfo
          let dtSuffix = ""
          if (dt) {
            if (dt.mechanism === "dividend") dtSuffix = `（分红+${dt.dividendPerPlayer || 0}）`
            else if (dt.mechanism === "ticket") dtSuffix = `（门票-${dt.ticketPerPlayer || 0}）`
          }
          return `<p class="battle-record-meta">自身利润：${pp >= 0 ? "+" : ""}${formatBidRevealNumber(pp)}${dtSuffix}</p>`
        })(),
        paginationHtml,
        `<div class="battle-record-log-body">${bodyContent}</div>`,
        paginationHtml,
        "</article>"
      ].join("")

      this.dom.battleRecordContent.innerHTML = html
    }
  }

  return { methods }
}
