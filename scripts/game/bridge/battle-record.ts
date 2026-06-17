/**
 * @file bridge/battle-record.js
 * @module bridge/battle-record
 * @description 战绩记录系统 Bridge。采用工厂函数模式（createBattleRecordBridge），
 *              通过依赖注入获取常量和工具函数，返回 Mixin 对象。
 *              负责对局结果的持久化存储、战绩面板渲染、AI决策日志查看、以及对局复现。
 *
 * 核心职责：
 *   - 战绩持久化：saveBattleRecord / loadBattleRecords
 *     每局结算后保存完整对局数据（成交价、利润、仓库快照、AI决策日志）到 localStorage
 *     最多保留20条记录，自动清理旧数据
 *   - 战绩面板：openBattleRecordPanel / renderBattleRecordPanel
 *     渲染战绩摘要（总局数、胜率、累计利润、最高/最低单局）和详细列表
 *   - AI决策日志：openBattleRecordLogs / renderBattleRecordLogView
 *     按轮次分页查看AI决策详情（规则AI信心拆解、LLM prompt/response、缓存命中率）
 *   - 对局复现：openBattleRecordReplay
 *     从战绩记录恢复仓库状态，重新展示结算页面
 *   - 仓库快照：buildWarehouseSnapshotForRecord
 *     序列化当前仓库布局（位置、品质、真实价值）用于复现
 *
 * 数据结构（单条战绩）：
 *   {
 *     id, finishedAt, round, mode, winnerId, winnerName, winnerBid,
 *     totalValue, winnerProfit, playerProfit, playerWon,
 *     dividendTicketInfo, reasonText,
 *     warehouse: { cols, rows, itemCount, items[] },
 *     logs: { aiDecisionPanelText, runNo, aiThoughtLogs[], roundLogsByRound, roundPanelTexts },
 *     logsRound
 *   }
 *
 * @requires MobaoConstants - 常量（BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS）
 * @requires MobaoUtils     - 工具函数（clamp, escapeHtml, formatBidRevealNumber）
 * @requires MobaoAppState  - 全局统计（totalGamesPlayed, totalWins, totalProfit）
 * @requires MobaoAnimations - 动画系统（animateOverlayOpen/Close）
 *
 * @exports MobaoBattleRecord.createBattleRecordBridge - 工厂函数，返回战绩 Mixin
 *
 * 使用方式：
 *   const bridge = createBattleRecordBridge({ BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS, clamp, escapeHtml, formatBidRevealNumber });
 *   Object.assign(scene, bridge);
 */
import { load as loadAppState } from "../core/app-state"
import { QUALITY_CONFIG } from "../data/artifacts"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"

interface BattleRecordDeps {
  BATTLE_RECORD_STORAGE_KEY: string
  GRID_COLS: number
  GRID_ROWS: number
  clamp(v: number, min: number, max: number): number
  escapeHtml(s: string): string
  formatBidRevealNumber(v: number): string
  [key: string]: unknown
}

interface BattleRecordSaveResult {
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

interface WarehouseSnapshotItem {
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

interface AiThoughtLogEntry {
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

interface BattleRecordLogs {
  aiDecisionPanelText?: string | null
  runNo?: number | null
  aiThoughtLogs?: AiThoughtLogEntry[]
  roundLogsByRound?: Record<string, string[]>
  roundPanelTexts?: Record<string, string>
  [key: string]: unknown
}

interface BattleRecord {
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

/**
 * 创建战绩记录桥接器。管理最近20局的战绩记录，支持详情查看和日志渲染
 * @param {BattleRecordDeps} deps - 依赖注入对象
 * @returns {Record<string, unknown>} 战绩记录方法集合
 */
export function createBattleRecordBridge(deps: BattleRecordDeps) {
  const { BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS, clamp, escapeHtml, formatBidRevealNumber } = deps

  function parsePanelTextToHtml(text: string): string {
    if (!text) return ""
    const lines = text.split("\n")
    const htmlParts: string[] = []
    let currentEntry: string[] = []
    let inPromptBlock = false
    let promptTitle = ""

    const flushEntry = () => {
      if (currentEntry.length === 0) return
      const entryText = currentEntry.join("\n")
      if (entryText.includes("接管状态: 大模型") || entryText.includes("接管状态: 规则AI")) {
        const isLlm = entryText.includes("接管状态: 大模型")
        const isFallback = entryText.includes("⚠️")
        const nameMatch = entryText.match(/^(.+?)（(.+?)）/)
        const playerName = nameMatch ? nameMatch[1] : "AI"
        const playerId = nameMatch ? nameMatch[2] : ""
        const bidMatch = entryText.match(/最终出价:\s*(.+?)\s*\|/)
        const bid = bidMatch ? bidMatch[1] : "?"
        const sourceMatch = entryText.match(/决策来源:\s*(.+)/)
        const source = sourceMatch ? sourceMatch[1].trim() : "?"
        const thoughtMatch = entryText.match(/思考:\s*(.+)/)
        const thought = thoughtMatch ? thoughtMatch[1] : ""
        const errorMatch = entryText.match(/错误:\s*(.+)/)
        const error = errorMatch ? errorMatch[1] : ""
        const cacheMatch = entryText.match(/缓存命中:\s*(.+)/)
        const cacheInfo = cacheMatch ? cacheMatch[1] : ""
        const memoryMatch = entryText.match(/跨局记忆注入:\s*(.+)/)
        const memoryInfo = memoryMatch ? memoryMatch[1] : ""
        const actionMatch = entryText.match(/大模型动作:\s*(.+)/)
        const actionInfo = actionMatch ? actionMatch[1] : ""
        const fallbackBidMatch = entryText.match(/回退规则出价参考:\s*(.+)/)
        const fallbackBid = fallbackBidMatch ? fallbackBidMatch[1] : ""

        const badgeClass = isFallback ? "badge-fallback" : isLlm ? "badge-llm" : "badge-rule"
        const badgeText = isFallback ? "回退" : isLlm ? "大模型" : "规则AI"

        htmlParts.push(`<div class="ai-player-card"><div class="ai-player-card-header"><span class="player-name">${escapeHtml(playerName)}（${escapeHtml(playerId)}）</span><span class="control-badge ${badgeClass}">${badgeText}</span></div><div class="ai-player-card-body">`)
        htmlParts.push(`<div class="ai-decision-summary"><span class="label">出价</span><span class="value bid-value">${escapeHtml(bid)}</span><span class="label">来源</span><span class="value">${escapeHtml(source)}</span></div>`)
        if (isFallback) htmlParts.push(`<div class="ai-error-box">⚠️ ${escapeHtml(entryText.match(/⚠️\s*(.+)/)?.[1] || "回退")}</div>`)
        if (cacheInfo) htmlParts.push(`<div class="ai-cache-info">缓存: ${escapeHtml(cacheInfo)}</div>`)
        if (memoryInfo) htmlParts.push(`<div class="ai-memory-inject-info">跨局记忆注入: ${escapeHtml(memoryInfo)}</div>`)
        if (actionInfo) htmlParts.push(`<div class="ai-decision-summary"><span class="label">动作</span><span class="value">${escapeHtml(actionInfo)}</span></div>`)
        if (fallbackBid) htmlParts.push(`<div class="ai-decision-summary"><span class="label">回退参考</span><span class="value">${escapeHtml(fallbackBid)}</span></div>`)
        if (thought) htmlParts.push(`<div class="ai-thought-box"><div class="thought-label">思考</div>${escapeHtml(thought)}</div>`)
        if (error) htmlParts.push(`<div class="ai-error-box">错误: ${escapeHtml(error)}</div>`)
        htmlParts.push("</div></div>")
      } else if (entryText.match(/信心\s*\d+%.*人格/)) {
        const ruleMatch = entryText.match(/信心\s*(\d+)%\s*\|\s*人格\s*(.+)/)
        const confidence = ruleMatch ? ruleMatch[1] : "?"
        const archetype = ruleMatch ? ruleMatch[2] : "?"
        const valueMatch = entryText.match(/估值:\s*(.+?)\s*\|\s*上限\s*(.+)/)
        const perceivedValue = valueMatch ? valueMatch[1] : "?"
        const hardCap = valueMatch ? valueMatch[2] : "?"
        const psychMatch = entryText.match(/心理预期:\s*(.+)/)
        const psychExpected = psychMatch ? psychMatch[1] : "?"
        const overheatMatch = entryText.match(/超预期:\s*(.+?)%\s*\|\s*回撤阈值\s*(.+?)%/)
        const overheat = overheatMatch ? overheatMatch[1] : "?"
        const threshold = overheatMatch ? overheatMatch[2] : "?"
        const behaviorMatch = entryText.match(/行为:\s*(.+)/)
        const behavior = behaviorMatch ? behaviorMatch[1] : ""

        htmlParts.push(`<div class="ai-player-card"><div class="ai-player-card-header"><span class="player-name">规则AI</span><span class="control-badge badge-rule">规则AI</span></div><div class="ai-player-card-body">`)
        htmlParts.push(`<div class="ai-decision-summary"><span class="label">信心</span><span class="value">${escapeHtml(confidence)}% | 人格 ${escapeHtml(archetype)}</span><span class="label">估值</span><span class="value">${escapeHtml(perceivedValue)} | 上限 ${escapeHtml(hardCap)}</span><span class="label">心理预期</span><span class="value">${escapeHtml(psychExpected)}</span><span class="label">超预期</span><span class="value">${escapeHtml(overheat)}% | 回撤阈值 ${escapeHtml(threshold)}%</span></div>`)
        if (behavior) htmlParts.push(`<div class="ai-decision-summary"><span class="label">行为</span><span class="value">${escapeHtml(behavior)}</span></div>`)
        htmlParts.push("</div></div>")
      } else {
        htmlParts.push(`<div style="font-size:12px;color:#6b5a48;padding:4px 0;">${escapeHtml(entryText)}</div>`)
      }
      currentEntry = []
    }

    for (const line of lines) {
      if (line.match(/^\[.+\]$/)) {
        flushEntry()
        inPromptBlock = true
        promptTitle = line.slice(1, -1)
        continue
      }
      if (inPromptBlock) {
        if (line === "" && currentEntry.length > 0) {
          htmlParts.push(`<details class="ai-prompt-block"><summary class="ai-prompt-block-header">${escapeHtml(promptTitle)}</summary><pre>${escapeHtml(currentEntry.join("\n"))}</pre></details>`)
          currentEntry = []
          inPromptBlock = false
        } else {
          currentEntry.push(line)
        }
        continue
      }
      if (line === "-") {
        flushEntry()
        continue
      }
      if (line.startsWith("回合 ") || line.startsWith("说明：")) {
        continue
      }
      currentEntry.push(line)
    }
    flushEntry()
    if (inPromptBlock && currentEntry.length > 0) {
      htmlParts.push(`<details class="ai-prompt-block"><summary class="ai-prompt-block-header">${escapeHtml(promptTitle)}</summary><pre>${escapeHtml(currentEntry.join("\n"))}</pre></details>`)
    }

    return htmlParts.join("")
  }

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

  function formatRecordTime(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      return "未知时间"
    }
    return date.toLocaleString("zh-CN", { hour12: false })
  }

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
    },

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
          lines.push(parsePanelTextToHtml(panelText))
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
        bodyContent = panelText ? parsePanelTextToHtml(panelText) : ""
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
    },

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
      this.stopRoundTimer()
      this.roundResolving = false
      this.roundPaused = false
      this.playerBidSubmitted = true
      this.settled = true

      this.restoreWarehouseFromBattleRecord(record)

      const replayWinner: import("../../../types/game").Player = {
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
    },

    restoreWarehouseFromBattleRecord(record: BattleRecord) {
      this.drawUnknownWarehouse()

      if (this.itemLayer) {
        this.itemLayer.destroy(true)
      }
      this.itemLayer = this.add.container(0, 0)
      this.items = []
      this.warehouseTrueValue = 0

      const qualityConfig = QUALITY_CONFIG
      const snapshotItems: WarehouseSnapshotItem[] =
        record && record.warehouse && Array.isArray(record.warehouse.items) ? record.warehouse.items : []

      const imagesToLoad: string[] = []
      snapshotItems.forEach((saved: WarehouseSnapshotItem) => {
        if (saved.key) {
          const textureKey = `artifact-${saved.key}`
          if (!this.textures.exists(textureKey)) {
            imagesToLoad.push(saved.key)
          }
        }
      })

      const renderItems = () => {
        snapshotItems.forEach((saved: WarehouseSnapshotItem, idx: number) => {
          const qualityKey = saved.qualityKey && qualityConfig[saved.qualityKey] ? saved.qualityKey : "normal"
          const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 1 }
          const safeW = clamp(Math.max(1, Math.round(Number(saved.w) || 1)), 1, GRID_COLS)
          const safeH = clamp(Math.max(1, Math.round(Number(saved.h) || 1)), 1, GRID_ROWS)
          const maxX = Math.max(0, GRID_COLS - safeW)
          const maxY = Math.max(0, GRID_ROWS - safeH)
          const safeX = clamp(Math.max(0, Math.round(Number(saved.x) || 0)), 0, maxX)
          const safeY = clamp(Math.max(0, Math.round(Number(saved.y) || 0)), 0, maxY)
          const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0))

          const item: Artifact = {
            id: String(saved.id || `record-item-${idx}`),
            key: saved.key || "record-snapshot",
            majorCategory: saved.category || "未知",
            category: saved.category || "未知",
            name: saved.name || `藏品${idx + 1}`,
            basePrice: trueValue,
            qualityKey: qualityKey as import("../../../types/game").QualityLevel,
            trueValue,
            quality: quality as import("../../../types/game").QualityConfig,
            expectedPrice: trueValue,
            previewSizeTag: "normal",
            w: safeW,
            h: safeH,
            x: safeX,
            y: safeY,
            revealed: {
              outline: false,
              qualityCell: null,
              exact: true,
              settlementPreRevealed: true
            },
            view: {
              silhouette: null as unknown as Phaser.GameObjects.Rectangle,
              border: null as unknown as Phaser.GameObjects.Rectangle,
              qualityMarkers: null as unknown as Phaser.GameObjects.Container,
              clickZone: null as unknown as Phaser.GameObjects.Rectangle,
              artifactImage: null,
              borderPulseStarted: false,
              qualitySynced: false,
              qualityGlowTween: null
            }
          } as Artifact

          this.renderItem(item)
          this.revealOutline(item, { settlementShowName: true, skipEffects: true })
          item.revealed.qualityCell = { x: item.x, y: item.y }
          item.revealed.exact = true
          this.renderQualityVisual(item, { showName: true })
          this.items.push(item)
          this.warehouseTrueValue += item.trueValue
        })

        this.rebuildWarehouseCellIndex()
        this.drawGridLines()
      }

      if (imagesToLoad.length > 0) {
        console.log(`[战绩复现] 需要加载 ${imagesToLoad.length} 张图片:`, imagesToLoad)
        imagesToLoad.forEach((key) => {
          const textureKey = `artifact-${key}`
          this.load.image(textureKey, `assets/images/artifacts/thumbs/${key}.png`)
        })
        const onComplete = () => {
          console.log("[战绩复现] 图片加载完成")
          ;(this.load as unknown as Phaser.Events.EventEmitter).off("complete", onComplete)
          renderItems()
        }
        this.load.on("complete", onComplete)
        this.load.start()
      } else {
        renderItems()
      }
    }
  }

  return {
    methods,
    loadBattleRecords,
    saveBattleRecords,
    formatRecordTime
  }
}
