import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import type { AiMemoryStorage, CrossGameMemory, CrossGameStats, ConversationMessage, ConversationBucketEntry } from '../../../types/ai'

/**
 * @file memory.ts
 * @module ai/memory
 * @description AI跨局记忆系统。管理AI玩家的对局内对话历史和跨局经验本，
 *              支持持久化存储（localStorage）、导入导出、以及为LLM构建记忆上下文。
 *
 * @exports DEFAULT_CROSS_GAME_STATS - 默认跨局统计数据
 * @exports getAiMemoryStorageKey / loadAiMemoryFromStorage / saveAiMemoryToStorage
 * @exports getQualityCounts / getTotalOccupiedCells / ensureCrossGameMemory
 * @exports AiMemoryMixin - 向后兼容的 Mixin 薄包装
 */
import { AI_MEMORY_STORAGE_KEY } from "../core/constants"
import { MobaoGameHistory } from "./game-history"

// ─── 独立函数 / 常量（可独立测试）───

export const DEFAULT_CROSS_GAME_STATS: CrossGameStats = {
  totalGames: 0,
  warehouseValueMax: 0, warehouseValueMin: 0, warehouseValueAvg: 0,
  winRate: 0, avgProfit: 0,
  totalCellsMax: 0, totalCellsMin: 0, totalCellsAvg: 0,
  totalItemsMax: 0, totalItemsMin: 0, totalItemsAvg: 0,
  legendaryMax: 0, legendaryMin: 0, legendaryAvg: 0,
  rareMax: 0, rareMin: 0, rareAvg: 0
}

export function getAiMemoryStorageKey(isLanMode: boolean): string {
  return isLanMode ? AI_MEMORY_STORAGE_KEY + "_lan" : AI_MEMORY_STORAGE_KEY
}

export function loadAiMemoryFromStorage(storageKey: string): AiMemoryStorage | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as AiMemoryStorage
  } catch (_error) {
    return null
  }
}

export function getQualityCounts(items: Array<{ qualityKey: string }>): Record<string, number> {
  const counts: Record<string, number> = { poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 }
  items.forEach((item) => {
    const qk = item.qualityKey
    if (typeof counts[qk] === "number") {
      counts[qk] += 1
    }
  })
  return counts
}

export function getTotalOccupiedCells(items: Array<{ w: number; h: number }>): number {
  return items.reduce((sum, item) => sum + item.w * item.h, 0)
}

export function ensureCrossGameMemory(
  crossGameMemory: Record<string, CrossGameMemory>,
  playerId: string
): CrossGameMemory {
  if (!crossGameMemory[playerId]) {
    crossGameMemory[playerId] = {
      stats: { ...DEFAULT_CROSS_GAME_STATS, warehouseValueMax: 679100, warehouseValueMin: 170400, warehouseValueAvg: 412000 },
      lessons: [],
      strategies: [],
      praises: []
    }
  }
  return crossGameMemory[playerId]
}

// ─── Mixin 薄包装（向后兼容）───

export const AiMemoryMixin: ThisType<WarehouseSceneThis> = {
  getAiMemoryStorageKey(): string {
    return getAiMemoryStorageKey(this.isLanMode)
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

  loadAiMemoryFromStorage(): AiMemoryStorage | null {
    return loadAiMemoryFromStorage(this.getAiMemoryStorageKey())
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
          const storedStats = data.stats || {}
          const mergedStats = { ...DEFAULT_CROSS_GAME_STATS, ...storedStats }
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

  ensureAiConversationBucket(playerId: string): ConversationBucketEntry[] {
    if (!this.aiConversationByPlayer[playerId]) {
      this.aiConversationByPlayer[playerId] = []
    }
    return this.aiConversationByPlayer[playerId]
  },

  ensureAiCrossGameMemory(playerId: string): CrossGameMemory {
    return ensureCrossGameMemory(this.aiCrossGameMemory, playerId)
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
    return getQualityCounts(this.items)
  },

  getTotalOccupiedCells(): number {
    return getTotalOccupiedCells(this.items)
  },

  getAiConversationMessages(playerId: string): ConversationMessage[] {
    const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
    const useMultiGame = Boolean(settings && settings.multiGameMemoryEnabled)

    if (!useMultiGame) return []

    const result: ConversationMessage[] = []

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
    const entry: ConversationBucketEntry = {
      run: this.runSerial || 0,
      round: this.round || 0,
      bid: plan && plan.bid != null ? plan.bid as number : null,
      skill: String(plan && plan.actionType === "skill" && plan.actionId ? plan.actionId : "无"),
      item: String(plan && plan.actionType === "item" && plan.actionId ? plan.actionId : "无"),
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
            const storedStats = data.stats || {}
            const mergedStats = { ...DEFAULT_CROSS_GAME_STATS, ...storedStats }
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
      return { ok: false, error: "JSON解析失败: " + ((error instanceof Error ? error.message : String(error)) || "未知错误") }
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
    const mechanism: string = dtInfo?.mechanism ?? "none"
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
        const gameMessages = cached.slice(2) as ConversationMessage[]
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
    const mechanism: string = dtInfo?.mechanism ?? "none"
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0
    const qualityCounts = this.getQualityCounts()
    const totalItems = this.items.length
    const totalCells = this.getTotalOccupiedCells()
    const roundBids: Array<{ round: number; playerId: string; playerName: string; bid: number }> = []
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
      blocks.push(String(playerSummary))
    }

    if (this.currentPublicEvent) {
      blocks.push(`【公共事件】${this.currentPublicEvent.category}：${this.currentPublicEvent.text}`)
    }

    return blocks
  }
}
