import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file memory.js
 * @module ai/memory
 * @description AI跨局记忆系统 Mixin。管理AI玩家的对局内对话历史和跨局经验本，
 *              支持持久化存储（localStorage）、导入导出、以及为LLM构建记忆上下文。
 *
 * 核心职责：
 *   - 对局内对话管理（aiConversationByPlayer）：每轮决策记录，最多保留30条
 *   - 跨局经验本（aiCrossGameMemory）：包含统计、成功经验、策略建议、经验教训
 *   - 持久化存储：自动保存/恢复到 localStorage（联机模式使用独立key）
 *   - 上下文构建（getAiConversationMessages）：为LLM构建包含跨局记忆和本局历史的消息
 *   - 局结算推送（pushRunSettlementContextToAi）：记录结算结果到记忆
 *   - 导入导出（exportAiMemoryToJson / importAiMemoryFromJson）
 *
 * 数据结构：
 *   aiConversationByPlayer[playerId] = [
 *     { run, round, bid, skill, item, thought, result }
 *   ]
 *   aiCrossGameMemory[playerId] = {
 *     stats: { totalGames, winRate, avgProfit, warehouseValueMax/Min/Avg, ... },
 *     praises: [string],    // 成功经验，最多10条
 *     strategies: [string], // 策略建议，最多10条
 *     lessons: [string]     // 经验教训，最多10条
 *   }
 *
 * @exports MemoryMixin - AI记忆系统 Mixin，混入 Phaser Scene
 *
 * 混入方式：Object.assign(scene, MobaoAi.MemoryMixin)
 * 混入后 scene 将获得：aiConversationByPlayer, aiCrossGameMemory,
 *   pendingNextRunAiSummary, runSerial,
 *   loadAiMemoryFromStorage, saveAiMemoryToStorage, restoreAiMemoryFromStorage,
 *   getAiConversationMessages, pushAiRoundSummary, updateLastAiRoundResult, 等
 *
 * @requires core/constants - 常量定义
 * @requires core/utils - 工具函数
 */
import { AI_MEMORY_STORAGE_KEY } from "../core/constants"
import { formatBidRevealNumber } from "../core/utils"
import { MobaoGameHistory, GameRecord } from "./game-history"

export const AiMemoryMixin: ThisType<WarehouseSceneThis> = {
  getAiMemoryStorageKey(): string {
    if (this.isLanMode) {
      return AI_MEMORY_STORAGE_KEY + "_lan"
    }
    return AI_MEMORY_STORAGE_KEY
  },

  isAiMultiGameMemoryEnabled(): boolean {
    const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
    return Boolean(settings && settings.multiGameMemoryEnabled)
  },

  shouldGenerateSummary(): boolean {
    const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
    if (!settings || !settings.autoSummarizeEnabled || !settings.multiGameMemoryEnabled) return false
    const contextLength = settings.contextLength || 5
    if (!MobaoGameHistory) return false
    const aiPlayers = this.players.filter((p) => !p.isHuman)
    if (aiPlayers.length === 0) return false
    const count = MobaoGameHistory.getCount(aiPlayers[0].id, this.isLanMode)
    return count > 0 && count >= contextLength
  },

  clearGameHistoryForPlayer(playerId: string): void {
    if (MobaoGameHistory) {
      MobaoGameHistory.clear(playerId, this.isLanMode)
    }
  },

  loadAiMemoryFromStorage(): Record<string, unknown> | null {
    try {
      const storageKey = this.getAiMemoryStorageKey()
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") return null
      return parsed
    } catch (_error) {
      return null
    }
  },

  saveAiMemoryToStorage(): void {
    try {
      const storageKey = this.getAiMemoryStorageKey()
      const data = {
        conversations: this.aiConversationByPlayer,
        crossGameMemory: this.aiCrossGameMemory,
        crossGameMessages: this.aiCrossGameMessagesByPlayer || {},
        pendingSummaryByPlayer: this.pendingNextRunAiSummaryByPlayer || {},
        runSerial: this.runSerial || 0,
        savedAt: Date.now()
      }
      window.localStorage.setItem(storageKey, JSON.stringify(data))
    } catch (_error) { }
  },

  restoreAiMemoryFromStorage(): void {
    const stored = this.loadAiMemoryFromStorage()
    if (!stored) return
    if (stored.conversations && typeof stored.conversations === "object") {
      this.aiConversationByPlayer = {}
      Object.keys(stored.conversations).forEach((playerId) => {
        const arr = stored.conversations[playerId]
        if (Array.isArray(arr)) {
          const filtered = arr.filter((entry) => entry && typeof entry.round === "number")
          this.aiConversationByPlayer[playerId] = filtered.slice(-30)
        }
      })
    }
    if (stored.crossGameMemory && typeof stored.crossGameMemory === "object") {
      this.aiCrossGameMemory = {}
      Object.keys(stored.crossGameMemory).forEach((playerId) => {
        const data = stored.crossGameMemory[playerId]
        if (data && typeof data === "object" && (data.stats || data.lessons || data.strategies || data.praises)) {
          const defaultStats = {
            totalGames: 0,
            warehouseValueMax: 0,
            warehouseValueMin: 0,
            warehouseValueAvg: 0,
            winRate: 0,
            avgProfit: 0,
            totalCellsMax: 0,
            totalCellsMin: 0,
            totalCellsAvg: 0,
            totalItemsMax: 0,
            totalItemsMin: 0,
            totalItemsAvg: 0,
            legendaryMax: 0,
            legendaryMin: 0,
            legendaryAvg: 0,
            rareMax: 0,
            rareMin: 0,
            rareAvg: 0
          }
          const storedStats = data.stats || {}
          const mergedStats = { ...defaultStats, ...storedStats }
          this.aiCrossGameMemory[playerId] = {
            stats: mergedStats,
            lessons: Array.isArray(data.lessons) ? data.lessons.slice(-10) : [],
            strategies: Array.isArray(data.strategies) ? data.strategies.slice(-10) : [],
            praises: Array.isArray(data.praises) ? data.praises.slice(-10) : []
          }
        } else if (Array.isArray(data)) {
          this.aiCrossGameMemory[playerId] = {
            stats: {
              totalGames: 0,
              warehouseValueMax: 0,
              warehouseValueMin: 0,
              warehouseValueAvg: 0,
              winRate: 0,
              avgProfit: 0,
              totalCellsMax: 0,
              totalCellsMin: 0,
              totalCellsAvg: 0,
              totalItemsMax: 0,
              totalItemsMin: 0,
              totalItemsAvg: 0,
              legendaryMax: 0,
              legendaryMin: 0,
              legendaryAvg: 0,
              rareMax: 0,
              rareMin: 0,
              rareAvg: 0
            },
            lessons: [],
            strategies: [],
            praises: []
          }
        }
      })
    }
    if (stored.pendingSummaryByPlayer && typeof stored.pendingSummaryByPlayer === "object") {
      this.pendingNextRunAiSummaryByPlayer = stored.pendingSummaryByPlayer
    } else if (typeof stored.pendingSummary === "string" && stored.pendingSummary) {
      this.players.filter((p) => !p.isHuman).forEach((p) => {
        this.pendingNextRunAiSummaryByPlayer[p.id] = stored.pendingSummary
      })
    }
    if (stored.crossGameMessages && typeof stored.crossGameMessages === "object") {
      this.aiCrossGameMessagesByPlayer = {}
      Object.keys(stored.crossGameMessages).forEach((playerId) => {
        const arr = stored.crossGameMessages[playerId]
        if (Array.isArray(arr)) {
          this.aiCrossGameMessagesByPlayer[playerId] = arr.slice(-5)
        }
      })
    }
    if (typeof stored.runSerial === "number" && stored.runSerial > 0) {
      this.runSerial = stored.runSerial
    }
  },

  ensureAiConversationBucket(playerId: string): unknown[] {
    if (!this.aiConversationByPlayer[playerId]) {
      this.aiConversationByPlayer[playerId] = []
    }
    return this.aiConversationByPlayer[playerId]
  },

  ensureAiCrossGameMemory(playerId: string): Record<string, unknown> {
    if (!this.aiCrossGameMemory[playerId]) {
      this.aiCrossGameMemory[playerId] = {
        stats: {
          totalGames: 0,
          warehouseValueMax: 679100,
          warehouseValueMin: 170400,
          warehouseValueAvg: 412000,
          winRate: 0,
          avgProfit: 0,
          totalCellsMax: 0,
          totalCellsMin: 0,
          totalCellsAvg: 0,
          totalItemsMax: 0,
          totalItemsMin: 0,
          totalItemsAvg: 0,
          legendaryMax: 0,
          legendaryMin: 0,
          legendaryAvg: 0,
          rareMax: 0,
          rareMin: 0,
          rareAvg: 0
        },
        lessons: [],
        strategies: [],
        praises: []
      }
    }
    return this.aiCrossGameMemory[playerId]
  },

  getAiCrossGameMemoryCount(playerId: string): number {
    if (!MobaoGameHistory) return 0
    return MobaoGameHistory.load(playerId, this.isLanMode).length
  },

  getAiInGameHistoryCount(playerId: string): number {
    const bucket = this.aiConversationByPlayer[playerId]
    return Array.isArray(bucket) ? bucket.length : 0
  },

  getQualityCounts(): Record<string, number> {
    const counts = { poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 }
    this.items.forEach((item) => {
      const qk = item.qualityKey
      if (typeof counts[qk] === "number") {
        counts[qk] += 1
      }
    })
    return counts
  },

  getTotalOccupiedCells(): number {
    return this.items.reduce((sum, item) => sum + item.w * item.h, 0)
  },

  getAiConversationMessages(playerId: string): Array<Record<string, string>> {
    const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
    const useMultiGame = Boolean(settings && settings.multiGameMemoryEnabled)

    if (!useMultiGame) return []

    const result: Array<Record<string, string>> = []

    const playerSummary = this.pendingNextRunAiSummaryByPlayer?.[playerId]
    if (playerSummary) {
      result.push({ role: "user", content: `【上期总结】${playerSummary}` })
    }

    const crossGameMessages = this.aiCrossGameMessagesByPlayer?.[playerId]
    if (Array.isArray(crossGameMessages) && crossGameMessages.length > 0) {
      crossGameMessages.forEach((gameMessages) => {
        gameMessages.forEach((msg) => {
          if (msg && msg.role && msg.content) {
            result.push({ role: msg.role, content: msg.content })
          }
        })
      })
    }

    return result
  },

  pushAiRoundSummary(playerId: string, plan: Record<string, unknown>): void {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return
    }
    const bucket = this.ensureAiConversationBucket(playerId)
    const entry = {
      run: this.runSerial || 0,
      round: this.round || 0,
      bid: plan && plan.bid != null ? plan.bid : null,
      skill: plan && plan.actionType === "skill" && plan.actionId ? plan.actionId : "无",
      item: plan && plan.actionType === "item" && plan.actionId ? plan.actionId : "无",
      thought: plan && plan.thought ? String(plan.thought).slice(0, 120) : "",
      result: ""
    }
    bucket.push(entry)
    if (bucket.length > 30) {
      this.aiConversationByPlayer[playerId] = bucket.slice(-30)
    }
    this.saveAiMemoryToStorage()
  },

  updateLastAiRoundResult(playerId: string, resultText: string): void {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return
    }
    const bucket = this.ensureAiConversationBucket(playerId)
    if (bucket.length > 0) {
      bucket[bucket.length - 1].result = String(resultText || "").slice(0, 60)
      this.saveAiMemoryToStorage()
    }
  },

  resetAiConversations(): void {
    this.aiConversationByPlayer = {}
    this.aiCrossGameMemory = {}
    this.aiCrossGameMessagesByPlayer = {}
    this.aiReflectionPending = {}
    this.pendingNextRunAiSummaryByPlayer = {}
  },

  clearAiMemoryStorage(): void {
    this.aiConversationByPlayer = {}
    this.aiCrossGameMemory = {}
    this.aiCrossGameMessagesByPlayer = {}
    this.aiReflectionPending = {}
    this.pendingNextRunAiSummaryByPlayer = {}
    this.runSerial = 0
    try {
      window.localStorage.removeItem(AI_MEMORY_STORAGE_KEY)
    } catch (_error) { }
  },

  exportAiMemoryToJson(): string {
    const data = {
      conversations: this.aiConversationByPlayer || {},
      crossGameMemory: this.aiCrossGameMemory || {},
      pendingSummaryByPlayer: this.pendingNextRunAiSummaryByPlayer || {},
      runSerial: this.runSerial || 0,
      exportedAt: Date.now(),
      version: "v1"
    }
    return JSON.stringify(data, null, 2)
  },

  importAiMemoryFromJson(jsonString: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonString)
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, error: "无效的JSON格式" }
      }
      if (parsed.version && parsed.version !== "v1") {
        return { ok: false, error: "不支持的版本格式" }
      }

      let crossGameSource = null
      if (parsed.crossGameMemory && typeof parsed.crossGameMemory === "object") {
        crossGameSource = parsed.crossGameMemory
      } else if (parsed.stats || parsed.lessons || parsed.praises || parsed.strategies) {
        crossGameSource = { player: parsed }
      } else {
        const firstKey = Object.keys(parsed)[0]
        if (firstKey && parsed[firstKey] && typeof parsed[firstKey] === "object" &&
          (parsed[firstKey].stats || parsed[firstKey].lessons || parsed[firstKey].praises)) {
          crossGameSource = parsed
        }
      }

      if (parsed.conversations && typeof parsed.conversations === "object") {
        this.aiConversationByPlayer = {}
        Object.keys(parsed.conversations).forEach((playerId) => {
          const arr = parsed.conversations[playerId]
          if (Array.isArray(arr)) {
            const filtered = arr.filter((entry) => entry && typeof entry.round === "number")
            this.aiConversationByPlayer[playerId] = filtered.slice(-30)
          }
        })
      }
      if (crossGameSource) {
        this.aiCrossGameMemory = {}
        Object.keys(crossGameSource).forEach((playerId) => {
          const data = crossGameSource[playerId]
          if (Array.isArray(data)) {
            this.aiCrossGameMemory[playerId] = {
              stats: {
                totalGames: 0,
                warehouseValueMax: 0,
                warehouseValueMin: 0,
                warehouseValueAvg: 0,
                winRate: 0,
                avgProfit: 0,
                totalCellsMax: 0,
                totalCellsMin: 0,
                totalCellsAvg: 0,
                totalItemsMax: 0,
                totalItemsMin: 0,
                totalItemsAvg: 0,
                legendaryMax: 0,
                legendaryMin: 0,
                legendaryAvg: 0,
                rareMax: 0,
                rareMin: 0,
                rareAvg: 0
              },
              lessons: [],
              strategies: [],
              praises: []
            }
          } else if (data && typeof data === "object") {
            const defaultStats = {
              totalGames: 0,
              warehouseValueMax: 0,
              warehouseValueMin: 0,
              warehouseValueAvg: 0,
              winRate: 0,
              avgProfit: 0,
              totalCellsMax: 0,
              totalCellsMin: 0,
              totalCellsAvg: 0,
              totalItemsMax: 0,
              totalItemsMin: 0,
              totalItemsAvg: 0,
              legendaryMax: 0,
              legendaryMin: 0,
              legendaryAvg: 0,
              rareMax: 0,
              rareMin: 0,
              rareAvg: 0
            }
            const storedStats = data.stats || {}
            const mergedStats = { ...defaultStats, ...storedStats }
            this.aiCrossGameMemory[playerId] = {
              stats: mergedStats,
              lessons: Array.isArray(data.lessons) ? data.lessons.slice(-10) : [],
              strategies: Array.isArray(data.strategies) ? data.strategies.slice(-10) : [],
              praises: Array.isArray(data.praises) ? data.praises.slice(-10) : []
            }
          }
        })
      }
      if (parsed.pendingSummaryByPlayer && typeof parsed.pendingSummaryByPlayer === "object") {
        this.pendingNextRunAiSummaryByPlayer = parsed.pendingSummaryByPlayer
      } else if (typeof parsed.pendingSummary === "string" && parsed.pendingSummary) {
        this.players.filter((p) => !p.isHuman).forEach((p) => {
          this.pendingNextRunAiSummaryByPlayer[p.id] = parsed.pendingSummary
        })
      }
      if (typeof parsed.runSerial === "number" && parsed.runSerial >= 0) {
        this.runSerial = parsed.runSerial
      }
      this.saveAiMemoryToStorage()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: "JSON解析失败: " + (error.message || "未知错误") }
    }
  },

  pushRunStartContextToAi(): void { },

  pushRunSettlementContextToAi(result: Record<string, unknown>): void {
    const winnerId = result && result.winnerId ? String(result.winnerId) : null
    const winnerName = result && result.winnerName ? String(result.winnerName) : "未知"
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0)
    const totalValue = Math.round(Number(result && result.totalValue) || 0)
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0)
    const reasonText = result && result.reasonText ? String(result.reasonText) : "结算"
    const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo as { mechanism?: string; dividendPerPlayer?: number; ticketPerPlayer?: number } : null
    const mechanism = dtInfo ? dtInfo.mechanism : "none"
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0

    let mechanismText = ""
    if (mechanism === "dividend") {
      mechanismText = `分红触发：拍下者亏损，非拍下者各获得亏损额的15%（+${dividendAmt}）。`
    } else if (mechanism === "ticket") {
      mechanismText = `门票触发：拍下者盈利，非拍下者各被扣除盈利额的5%（-${ticketAmt}）。`
    }

    const summaryText = [
      `【系统事件】第 ${this.runSerial} 局已结算：${winnerName} 以 ${winnerBid} 拿下整仓（${reasonText}）。`,
      `本局揭示总值 ${totalValue}，拍下者利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`,
      mechanismText,
      `第 ${this.runSerial + 1} 局已经开始。`
    ]
      .filter(Boolean)
      .join(" ")

    this.players
      .filter((p) => !p.isHuman)
      .forEach((p) => {
        this.pendingNextRunAiSummaryByPlayer[p.id] = summaryText
        const isWinner = p.id === winnerId
        let resultText = `${winnerName}以${winnerBid}中标,总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`
        if (!isWinner && mechanism === "dividend") {
          resultText += `,分红+${dividendAmt}`
        } else if (!isWinner && mechanism === "ticket") {
          resultText += `,门票-${ticketAmt}`
        }
        this.updateLastAiRoundResult(p.id, resultText)
      })

    if (MobaoGameHistory) {
      const qualityCounts = this.getQualityCounts()
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
      const maxRecords = (settings && settings.contextLength) || 5
      this.players.filter((p) => !p.isHuman).forEach((p) => {
        const playerDecisions = (this.aiConversationByPlayer[p.id] || []).map((entry) => ({
          round: entry.round || 0,
          bid: entry.bid,
          skill: entry.skill || "无",
          item: entry.item || "无",
          thought: entry.thought || "",
          result: entry.result || ""
        }))
        const record = {
          run: this.runSerial || 0,
          winnerId,
          winnerName,
          winnerBid,
          totalValue,
          winnerProfit,
          reasonText,
          dividendTicket: mechanism !== "none" ? { mechanism, dividendPerPlayer: dividendAmt, ticketPerPlayer: ticketAmt } : null,
          qualityCounts,
          totalItems: this.items.length,
          totalCells: this.getTotalOccupiedCells(),
          roundBids: [],
          reflection: null,
          aiDecisions: playerDecisions,
          timestamp: Date.now()
        }
        MobaoGameHistory.append(p.id, record, maxRecords, this.isLanMode)
      })
    }

    if (!this.aiCrossGameMessagesByPlayer) {
      this.aiCrossGameMessagesByPlayer = {}
    }
    this.players.filter((p) => !p.isHuman).forEach((p) => {
      const cached = this.aiConversationCache && this.aiConversationCache[p.id]
      if (Array.isArray(cached) && cached.length > 2) {
        const gameMessages = cached.slice(2)
        if (!this.aiCrossGameMessagesByPlayer[p.id]) {
          this.aiCrossGameMessagesByPlayer[p.id] = []
        }
        this.aiCrossGameMessagesByPlayer[p.id].push(gameMessages)
        if (this.aiCrossGameMessagesByPlayer[p.id].length > 5) {
          this.aiCrossGameMessagesByPlayer[p.id] = this.aiCrossGameMessagesByPlayer[p.id].slice(-5)
        }
      }
    })
    this.pendingSettlementSummary = summaryText

    this.saveAiMemoryToStorage()
  },

  createCrossGameRecord(result: Record<string, unknown>): Record<string, unknown> {
    const winnerId = result && result.winnerId ? result.winnerId : null
    const winnerName = result && result.winnerName ? result.winnerName : "未知"
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0)
    const totalValue = Math.round(Number(result && result.totalValue) || 0)
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0)
    const reasonText = result && result.reasonText ? result.reasonText : "结算"
    const dtInfo = result && result.dividendTicketInfo ? result.dividendTicketInfo as { mechanism?: string; dividendPerPlayer?: number; ticketPerPlayer?: number } : null
    const mechanism = dtInfo ? dtInfo.mechanism : "none"
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0
    const qualityCounts = this.getQualityCounts()
    const totalItems = this.items.length
    const totalCells = this.getTotalOccupiedCells()
    const roundBids = []
    this.players.forEach((player) => {
      const history = this.playerRoundHistory[player.id] || []
      history.forEach((entry) => {
        roundBids.push({
          round: entry.round,
          playerId: player.id,
          playerName: player.name,
          bid: entry.bid
        })
      })
    })
    const resultStr = `${winnerName}以${winnerBid}中标(${reasonText}),总值${totalValue},利润${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`
    const record = {
      run: this.runSerial || 0,
      winnerId,
      result: resultStr,
      warehouseValue: totalValue,
      winnerProfit,
      dividendTicket:
        mechanism !== "none" ? { mechanism, dividendPerPlayer: dividendAmt, ticketPerPlayer: ticketAmt } : null,
      qualityCounts,
      totalItems,
      totalCells,
      roundBids,
      reflection: null,
      reflectionEnabled: this.isAiReflectionEnabled()
    }
    return record
  },

  getAiFirstRoundExtraBlocks(playerId?: string): string[] {
    if (!this.isAiMultiGameMemoryEnabled() || this.round !== 1) {
      return []
    }

    const blocks = [`【系统事件】第 ${this.runSerial} 局开始。本局仓库随机生成，技能与道具已重置。`]

    const targetId = playerId || this.players.find((p) => !p.isHuman)?.id || ""
    const playerSummary = this.pendingNextRunAiSummaryByPlayer?.[targetId]
    if (playerSummary) {
      blocks.push(playerSummary)
    }

    if (this.currentPublicEvent) {
      blocks.push(`【公共事件】${this.currentPublicEvent.category}：${this.currentPublicEvent.text}`)
    }

    return blocks
  },

  openAiMemoryPanel() {
    if (!this.dom.aiMemoryOverlay) return
    const aiPlayers = this.players.filter((p) => !p.isHuman)
    if (aiPlayers.length === 0) {
      if (this.dom.aiMemoryContent) {
        this.dom.aiMemoryContent.innerHTML = '<div class="ai-memory-empty">暂无AI玩家</div>'
      }
      this.dom.aiMemoryOverlay.classList.remove("hidden")
      return
    }
    const sections = aiPlayers
      .map((player, idx) => {
        const memory = this.ensureAiCrossGameMemory(player.id)
        const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"]
        const color = colors[idx % colors.length]
        let inner = ""

        const stats = memory.stats || {}
        const praises = memory.praises || []
        const strategies = memory.strategies || []
        const lessons = memory.lessons || []

        if (stats.totalGames === 0 && praises.length === 0 && strategies.length === 0 && lessons.length === 0) {
          inner = '<div class="ai-memory-empty">暂无跨局记忆</div>'
        } else {
          inner = '<div class="ai-memory-entry">'

          if (stats.totalGames > 0) {
            inner += `<div class="ai-memory-entry-title">历史统计</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">总局数</span>${stats.totalGames}局</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">胜率</span>${Math.round((stats.winRate || 0) * 100)}%</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">平均盈亏</span>${Math.round(stats.avgProfit || 0)}</div>`
            if (stats.warehouseValueMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">仓库价值</span>${stats.warehouseValueMin}~${stats.warehouseValueMax}，平均${Math.round(stats.warehouseValueAvg || 0)}</div>`
            }
            if (stats.totalCellsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">格数范围</span>${stats.totalCellsMin}~${stats.totalCellsMax}，平均${Math.round(stats.totalCellsAvg || 0)}</div>`
            }
            if (stats.totalItemsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">藏品件数</span>${stats.totalItemsMin}~${stats.totalItemsMax}，平均${Math.round(stats.totalItemsAvg || 0)}</div>`
            }
            if (stats.legendaryMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">绝品件数</span>${stats.legendaryMin}~${stats.legendaryMax}，平均${(stats.legendaryAvg || 0).toFixed(1)}</div>`
            }
            if (stats.rareMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">珍品件数</span>${stats.rareMin}~${stats.rareMax}，平均${(stats.rareAvg || 0).toFixed(1)}</div>`
            }
          }

          if (praises.length > 0) {
            inner += `<div class="ai-memory-entry-title">成功经验 (${praises.length}/10)</div>`
            praises.forEach((p, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${p}</div>`
            })
          }

          if (strategies.length > 0) {
            inner += `<div class="ai-memory-entry-title">策略建议 (${strategies.length}/10)</div>`
            strategies.forEach((s, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${s}</div>`
            })
          }

          if (lessons.length > 0) {
            inner += `<div class="ai-memory-entry-title">经验教训 (${lessons.length}/10)</div>`
            lessons.forEach((l, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${l}</div>`
            })
          }

          inner += "</div>"
        }

        return (
          `<div class="ai-memory-section" style="--section-color:${color}">` +
          `<div class="ai-memory-section-header">${player.name}</div>` +
          `<div class="ai-memory-section-body">${inner}</div>` +
          `</div>`
        )
      })
      .join("")

    if (this.dom.aiMemoryContent) {
      this.dom.aiMemoryContent.innerHTML = sections || '<div class="ai-memory-empty">暂无记忆数据</div>'
    }
    if (!this._aiMemoryTouchBound) {
      this._aiMemoryTouchBound = true
      this.setupAiMemoryTouchScroll()
    }
    this.dom.aiMemoryOverlay.classList.remove("hidden")
  },

  setupAiMemoryTouchScroll() {
    const content = this.dom.aiMemoryContent
    if (!content) return
    let touchStartY = 0
    let touchStartScrollTop = 0
    content.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY
          touchStartScrollTop = content.scrollTop
        }
      },
      { passive: true }
    )
    content.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return
        const dy = touchStartY - e.touches[0].clientY
        const maxScroll = content.scrollHeight - content.clientHeight
        if (maxScroll <= 0) return
        content.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
      },
      { passive: true }
    )
  },

  closeAiMemoryPanel() {
    if (this.dom.aiMemoryOverlay) {
      this.dom.aiMemoryOverlay.classList.add("hidden")
    }
  }
}
