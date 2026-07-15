/**
 * @file memory-manager.ts
 * @module ai/memory-manager
 * @description AiMemoryManager -- AI 记忆管理器（Phase 2 依赖注入）。
 *              包装 memory.ts 的纯函数与 Mixin 逻辑，通过构造函数注入依赖
 *              （players、AiMemoryData、dom 等），替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { Player } from "../../../types/game"
import type {
  AiMemoryStorage,
  CrossGameMemory,
  CrossGameStats,
  ConversationMessage,
  ConversationBucketEntry
} from "../../../types/ai"
import type { LlmSettings } from "../../../types/llm"
import { AI_MEMORY_STORAGE_KEY } from "../core/constants"
import { MobaoGameHistory } from "./game-history"
import {
  DEFAULT_CROSS_GAME_STATS,
  getAiMemoryStorageKey,
  loadAiMemoryFromStorage,
  getQualityCounts,
  getTotalOccupiedCells,
  ensureCrossGameMemory
} from "./memory"

/** AI 记忆可变状态（引用共享：Manager 内部读写均作用于同一对象） */
export interface AiMemoryData {
  aiConversationByPlayer: Record<string, ConversationBucketEntry[]>
  aiCrossGameMemory: Record<string, CrossGameMemory>
  aiCrossGameMessagesByPlayer: Record<string, ConversationMessage[][]>
  pendingNextRunAiSummaryByPlayer: Record<string, unknown>
  aiReflectionPending: Record<string, unknown>
  aiConversationCache: Record<string, unknown>
  pendingSettlementSummary: string | null
  runSerial: number
}

/** localStorage 中 AI 记忆的运行时 shape（crossGameMemory 为对象而非数组，与 AiMemoryStorage 类型声明不同） */
interface RuntimeAiMemoryStorage {
  conversations?: Record<string, ConversationBucketEntry[]>
  crossGameMemory?: Record<string, unknown>
  crossGameMessages?: Record<string, ConversationMessage[][]>
  pendingSummaryByPlayer?: Record<string, unknown>
  pendingSummary?: string
  runSerial?: number
  savedAt?: number
}

/** AiMemoryManager 依赖接口 */
export interface AiMemoryManagerDeps {
  /** 玩家列表（引用，用于遍历 AI 玩家） */
  players: Player[]
  /** 记忆可变状态（引用共享） */
  data: AiMemoryData
  /** DOM 元素映射（引用，面板渲染用） */
  dom: Record<string, HTMLElement | null>
  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 是否联机模式（动态值） */
  getIsLanMode: () => boolean
  /** 获取当前仓库藏品列表（动态值，品质/格数统计用） */
  getItems: () => Array<{ qualityKey: string; w: number; h: number }>
  /** 获取 LLM 设置（动态值，可能返回 null） */
  getLlmSettings: () => LlmSettings | null
  /** AI 反思是否启用（动态值） */
  isAiReflectionEnabled: () => boolean
  /** 获取当前公共事件（动态值，可能返回 null） */
  getCurrentPublicEvent: () => { category: string; text: string } | null
  /** 获取玩家回合历史（动态值，创建跨局记录用） */
  getPlayerRoundHistory: () => Record<string, Array<{ round: number; bid: number }>>
}

/**
 * AI 记忆管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * touchBound 由 Manager 内部持有（原 Mixin 挂在场景的 _aiMemoryTouchBound 上）。
 */
export class AiMemoryManager {
  /** 触摸滚动已绑定标记（避免重复注册事件监听） */
  private touchBound = false

  constructor(private readonly deps: AiMemoryManagerDeps) {}

  /** 获取 AI 记忆存储 key（联机模式带 _lan 后缀） */
  getAiMemoryStorageKey(): string {
    return getAiMemoryStorageKey(this.deps.getIsLanMode())
  }

  /** 是否启用跨局记忆 */
  isAiMultiGameMemoryEnabled(): boolean {
    const settings = this.deps.getLlmSettings()
    return Boolean(settings && settings.multiGameMemoryEnabled)
  }

  /** 是否应该生成对局总结（达到上下文长度阈值） */
  shouldGenerateSummary(): boolean {
    const settings = this.deps.getLlmSettings()
    if (!settings || !settings.autoSummarizeEnabled || !settings.multiGameMemoryEnabled) return false
    const contextLength = (settings.contextLength as number) || 5
    if (!MobaoGameHistory) return false
    const aiPlayers = this.deps.players.filter((p) => !p.isHuman)
    if (aiPlayers.length === 0) return false
    const count = MobaoGameHistory.getCount(aiPlayers[0].id, this.deps.getIsLanMode())
    return count > 0 && count >= contextLength
  }

  /** 清除指定玩家的对局历史 */
  clearGameHistoryForPlayer(playerId: string): void {
    if (MobaoGameHistory) {
      MobaoGameHistory.clear(playerId, this.deps.getIsLanMode())
    }
  }

  /** 从 localStorage 加载 AI 记忆 */
  loadAiMemoryFromStorage(): AiMemoryStorage | null {
    return loadAiMemoryFromStorage(this.getAiMemoryStorageKey())
  }

  /** 保存 AI 记忆到 localStorage */
  saveAiMemoryToStorage(): void {
    try {
      const storageKey = this.getAiMemoryStorageKey()
      const data = this.deps.data
      const payload = {
        conversations: data.aiConversationByPlayer,
        crossGameMemory: data.aiCrossGameMemory,
        crossGameMessages: data.aiCrossGameMessagesByPlayer || {},
        pendingSummaryByPlayer: data.pendingNextRunAiSummaryByPlayer || {},
        runSerial: data.runSerial || 0,
        savedAt: Date.now()
      }
      window.localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch (_error) {}
  }

  /** 从 localStorage 恢复 AI 记忆 */
  restoreAiMemoryFromStorage(): void {
    const stored = this.loadAiMemoryFromStorage() as unknown as RuntimeAiMemoryStorage | null
    if (!stored) return
    const data = this.deps.data
    if (stored.conversations && typeof stored.conversations === "object") {
      const conversations = stored.conversations
      data.aiConversationByPlayer = {}
      Object.keys(conversations).forEach((playerId) => {
        const arr = conversations[playerId]
        if (Array.isArray(arr)) {
          const filtered = arr.filter((entry) => entry && typeof entry.round === "number")
          data.aiConversationByPlayer[playerId] = filtered.slice(-30)
        }
      })
    }
    if (stored.crossGameMemory && typeof stored.crossGameMemory === "object") {
      const crossGameMemory = stored.crossGameMemory
      data.aiCrossGameMemory = {}
      Object.keys(crossGameMemory).forEach((playerId) => {
        const memData = crossGameMemory[playerId]
        if (memData && typeof memData === "object") {
          const memObj = memData as {
            stats?: Partial<CrossGameStats>
            lessons?: unknown[]
            strategies?: unknown[]
            praises?: unknown[]
          }
          if (memObj.stats || memObj.lessons || memObj.strategies || memObj.praises) {
            const storedStats = memObj.stats || {}
            const mergedStats = { ...DEFAULT_CROSS_GAME_STATS, ...storedStats }
            data.aiCrossGameMemory[playerId] = {
              stats: mergedStats,
              lessons: Array.isArray(memObj.lessons) ? (memObj.lessons as string[]).slice(-10) : [],
              strategies: Array.isArray(memObj.strategies) ? (memObj.strategies as string[]).slice(-10) : [],
              praises: Array.isArray(memObj.praises) ? (memObj.praises as string[]).slice(-10) : []
            }
          } else if (Array.isArray(memData)) {
            data.aiCrossGameMemory[playerId] = {
              stats: { ...DEFAULT_CROSS_GAME_STATS },
              lessons: [],
              strategies: [],
              praises: []
            }
          }
        }
      })
    }
    if (stored.pendingSummaryByPlayer && typeof stored.pendingSummaryByPlayer === "object") {
      data.pendingNextRunAiSummaryByPlayer = stored.pendingSummaryByPlayer
    } else if (typeof stored.pendingSummary === "string" && stored.pendingSummary) {
      const summary = stored.pendingSummary
      this.deps.players
        .filter((p) => !p.isHuman)
        .forEach((p) => {
          data.pendingNextRunAiSummaryByPlayer[p.id] = summary
        })
    }
    if (stored.crossGameMessages && typeof stored.crossGameMessages === "object") {
      const crossGameMessages = stored.crossGameMessages
      data.aiCrossGameMessagesByPlayer = {}
      Object.keys(crossGameMessages).forEach((playerId) => {
        const arr = crossGameMessages[playerId]
        if (Array.isArray(arr)) {
          data.aiCrossGameMessagesByPlayer[playerId] = arr.slice(-5)
        }
      })
    }
    if (typeof stored.runSerial === "number" && stored.runSerial > 0) {
      data.runSerial = stored.runSerial
    }
  }

  /** 确保对话桶存在并返回 */
  ensureAiConversationBucket(playerId: string): ConversationBucketEntry[] {
    if (!this.deps.data.aiConversationByPlayer[playerId]) {
      this.deps.data.aiConversationByPlayer[playerId] = []
    }
    return this.deps.data.aiConversationByPlayer[playerId]
  }

  /** 确保跨局记忆存在并返回 */
  ensureAiCrossGameMemory(playerId: string): CrossGameMemory {
    return ensureCrossGameMemory(this.deps.data.aiCrossGameMemory, playerId)
  }

  /** 获取 AI 跨局历史记录数 */
  getAiCrossGameMemoryCount(playerId: string): number {
    if (!MobaoGameHistory) return 0
    return MobaoGameHistory.load(playerId, this.deps.getIsLanMode()).length
  }

  /** 获取 AI 对局内对话历史数 */
  getAiInGameHistoryCount(playerId: string): number {
    const bucket = this.deps.data.aiConversationByPlayer[playerId]
    return Array.isArray(bucket) ? bucket.length : 0
  }

  /** 统计当前仓库各品质数量 */
  getQualityCounts(): Record<string, number> {
    return getQualityCounts(this.deps.getItems())
  }

  /** 计算当前仓库总占用格数 */
  getTotalOccupiedCells(): number {
    return getTotalOccupiedCells(this.deps.getItems())
  }

  /** 获取 AI 对话消息（含上期总结 + 跨局消息） */
  getAiConversationMessages(playerId: string): ConversationMessage[] {
    const settings = this.deps.getLlmSettings()
    const useMultiGame = Boolean(settings && settings.multiGameMemoryEnabled)

    if (!useMultiGame) return []

    const result: ConversationMessage[] = []

    const playerSummary = this.deps.data.pendingNextRunAiSummaryByPlayer?.[playerId]
    if (playerSummary) {
      result.push({ role: "user", content: `【上期总结】${playerSummary}` })
    }

    const crossGameMessages = this.deps.data.aiCrossGameMessagesByPlayer?.[playerId]
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
  }

  /** 推送 AI 回合总结到对话桶 */
  pushAiRoundSummary(playerId: string, plan: Record<string, unknown>): void {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return
    }
    const bucket = this.ensureAiConversationBucket(playerId)
    const entry: ConversationBucketEntry = {
      run: this.deps.data.runSerial || 0,
      round: this.deps.getRound() || 0,
      bid: plan && plan.bid != null ? (plan.bid as number) : null,
      skill: String(plan && plan.actionType === "skill" && plan.actionId ? plan.actionId : "无"),
      item: String(plan && plan.actionType === "item" && plan.actionId ? plan.actionId : "无"),
      thought: plan && plan.thought ? String(plan.thought).slice(0, 120) : "",
      result: ""
    }
    bucket.push(entry)
    if (bucket.length > 30) {
      this.deps.data.aiConversationByPlayer[playerId] = bucket.slice(-30)
    }
    this.saveAiMemoryToStorage()
  }

  /** 更新最近一条对话桶条目的结果 */
  updateLastAiRoundResult(playerId: string, resultText: string): void {
    if (!this.isAiMultiGameMemoryEnabled()) {
      return
    }
    const bucket = this.ensureAiConversationBucket(playerId)
    if (bucket.length > 0) {
      bucket[bucket.length - 1].result = String(resultText || "").slice(0, 60)
      this.saveAiMemoryToStorage()
    }
  }

  /** 重置所有 AI 对话与跨局记忆（不清理 localStorage） */
  resetAiConversations(): void {
    const data = this.deps.data
    data.aiConversationByPlayer = {}
    data.aiCrossGameMemory = {}
    data.aiCrossGameMessagesByPlayer = {}
    data.aiReflectionPending = {}
    data.pendingNextRunAiSummaryByPlayer = {}
  }

  /** 清除 AI 记忆存储（内存 + localStorage） */
  clearAiMemoryStorage(): void {
    const data = this.deps.data
    data.aiConversationByPlayer = {}
    data.aiCrossGameMemory = {}
    data.aiCrossGameMessagesByPlayer = {}
    data.aiReflectionPending = {}
    data.pendingNextRunAiSummaryByPlayer = {}
    data.runSerial = 0
    try {
      window.localStorage.removeItem(AI_MEMORY_STORAGE_KEY)
    } catch (_error) {}
  }

  /** 导出 AI 记忆为 JSON 字符串 */
  exportAiMemoryToJson(): string {
    const data = this.deps.data
    const payload = {
      conversations: data.aiConversationByPlayer || {},
      crossGameMemory: data.aiCrossGameMemory || {},
      pendingSummaryByPlayer: data.pendingNextRunAiSummaryByPlayer || {},
      runSerial: data.runSerial || 0,
      exportedAt: Date.now(),
      version: "v1"
    }
    return JSON.stringify(payload, null, 2)
  }

  /** 从 JSON 字符串导入 AI 记忆 */
  importAiMemoryFromJson(jsonString: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonString)
      if (!parsed || typeof parsed !== "object") {
        return { ok: false, error: "无效的JSON格式" }
      }
      if (parsed.version && parsed.version !== "v1") {
        return { ok: false, error: "不支持的版本格式" }
      }

      const data = this.deps.data

      let crossGameSource: Record<string, unknown> | null = null
      if (parsed.crossGameMemory && typeof parsed.crossGameMemory === "object") {
        crossGameSource = parsed.crossGameMemory
      } else if (parsed.stats || parsed.lessons || parsed.praises || parsed.strategies) {
        crossGameSource = { player: parsed }
      } else {
        const firstKey = Object.keys(parsed)[0]
        if (
          firstKey &&
          parsed[firstKey] &&
          typeof parsed[firstKey] === "object" &&
          (parsed[firstKey].stats || parsed[firstKey].lessons || parsed[firstKey].praises)
        ) {
          crossGameSource = parsed
        }
      }

      if (parsed.conversations && typeof parsed.conversations === "object") {
        data.aiConversationByPlayer = {}
        Object.keys(parsed.conversations).forEach((playerId) => {
          const arr = parsed.conversations[playerId]
          if (Array.isArray(arr)) {
            const filtered = arr.filter((entry) => entry && typeof entry.round === "number")
            data.aiConversationByPlayer[playerId] = filtered.slice(-30)
          }
        })
      }
      if (crossGameSource) {
        data.aiCrossGameMemory = {}
        Object.keys(crossGameSource).forEach((playerId) => {
          const memData = crossGameSource![playerId]
          if (Array.isArray(memData)) {
            data.aiCrossGameMemory[playerId] = {
              stats: { ...DEFAULT_CROSS_GAME_STATS },
              lessons: [],
              strategies: [],
              praises: []
            }
          } else if (memData && typeof memData === "object") {
            const storedStats = (memData as { stats?: Partial<CrossGameStats> }).stats || {}
            const mergedStats = { ...DEFAULT_CROSS_GAME_STATS, ...storedStats }
            data.aiCrossGameMemory[playerId] = {
              stats: mergedStats,
              lessons: Array.isArray((memData as { lessons?: unknown[] }).lessons)
                ? ((memData as { lessons: unknown[] }).lessons.slice(-10) as string[])
                : [],
              strategies: Array.isArray((memData as { strategies?: unknown[] }).strategies)
                ? ((memData as { strategies: unknown[] }).strategies.slice(-10) as string[])
                : [],
              praises: Array.isArray((memData as { praises?: unknown[] }).praises)
                ? ((memData as { praises: unknown[] }).praises.slice(-10) as string[])
                : []
            }
          }
        })
      }
      if (parsed.pendingSummaryByPlayer && typeof parsed.pendingSummaryByPlayer === "object") {
        data.pendingNextRunAiSummaryByPlayer = parsed.pendingSummaryByPlayer
      } else if (typeof parsed.pendingSummary === "string" && parsed.pendingSummary) {
        this.deps.players
          .filter((p) => !p.isHuman)
          .forEach((p) => {
            data.pendingNextRunAiSummaryByPlayer[p.id] = parsed.pendingSummary
          })
      }
      if (typeof parsed.runSerial === "number" && parsed.runSerial >= 0) {
        data.runSerial = parsed.runSerial
      }
      this.saveAiMemoryToStorage()
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: "JSON解析失败: " + ((error instanceof Error ? error.message : String(error)) || "未知错误")
      }
    }
  }

  /** 推送局开始上下文（空占位，保留接口） */
  pushRunStartContextToAi(): void {}

  /** 推送结算上下文到 AI 记忆 */
  pushRunSettlementContextToAi(result: Record<string, unknown>): void {
    const data = this.deps.data
    const winnerId = result && result.winnerId ? String(result.winnerId) : null
    const winnerName = result && result.winnerName ? String(result.winnerName) : "未知"
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0)
    const totalValue = Math.round(Number(result && result.totalValue) || 0)
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0)
    const reasonText = result && result.reasonText ? String(result.reasonText) : "结算"
    const dtInfo =
      result && result.dividendTicketInfo
        ? (result.dividendTicketInfo as { mechanism?: string; dividendPerPlayer?: number; ticketPerPlayer?: number })
        : null
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
      `【系统事件】第 ${data.runSerial} 局已结算：${winnerName} 以 ${winnerBid} 拿下整仓（${reasonText}）。`,
      `本局揭示总值 ${totalValue}，拍下者利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`,
      mechanismText,
      `第 ${data.runSerial + 1} 局已经开始。`
    ]
      .filter(Boolean)
      .join(" ")

    this.deps.players
      .filter((p) => !p.isHuman)
      .forEach((p) => {
        data.pendingNextRunAiSummaryByPlayer[p.id] = summaryText
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
      const settings = this.deps.getLlmSettings()
      const maxRecords = (settings && (settings.contextLength as number)) || 5
      this.deps.players
        .filter((p) => !p.isHuman)
        .forEach((p) => {
          const playerDecisions = (data.aiConversationByPlayer[p.id] || []).map((entry) => ({
            round: entry.round || 0,
            bid: entry.bid,
            skill: entry.skill || "无",
            item: entry.item || "无",
            thought: entry.thought || "",
            result: entry.result || ""
          }))
          const record = {
            run: data.runSerial || 0,
            winnerId,
            winnerName,
            winnerBid,
            totalValue,
            winnerProfit,
            reasonText,
            dividendTicket:
              mechanism !== "none" ? { mechanism, dividendPerPlayer: dividendAmt, ticketPerPlayer: ticketAmt } : null,
            qualityCounts,
            totalItems: this.deps.getItems().length,
            totalCells: this.getTotalOccupiedCells(),
            roundBids: [],
            reflection: null,
            aiDecisions: playerDecisions,
            timestamp: Date.now()
          }
          MobaoGameHistory.append(p.id, record, maxRecords, this.deps.getIsLanMode())
        })
    }

    if (!data.aiCrossGameMessagesByPlayer) {
      data.aiCrossGameMessagesByPlayer = {}
    }
    this.deps.players
      .filter((p) => !p.isHuman)
      .forEach((p) => {
        const cached = data.aiConversationCache && data.aiConversationCache[p.id]
        if (Array.isArray(cached) && cached.length > 2) {
          const gameMessages = cached.slice(2) as ConversationMessage[]
          if (!data.aiCrossGameMessagesByPlayer[p.id]) {
            data.aiCrossGameMessagesByPlayer[p.id] = []
          }
          data.aiCrossGameMessagesByPlayer[p.id].push(gameMessages)
          if (data.aiCrossGameMessagesByPlayer[p.id].length > 5) {
            data.aiCrossGameMessagesByPlayer[p.id] = data.aiCrossGameMessagesByPlayer[p.id].slice(-5)
          }
        }
      })
    data.pendingSettlementSummary = summaryText

    this.saveAiMemoryToStorage()
  }

  /** 创建跨局记录对象 */
  createCrossGameRecord(result: Record<string, unknown>): Record<string, unknown> {
    const data = this.deps.data
    const winnerId = result && result.winnerId ? result.winnerId : null
    const winnerName = result && result.winnerName ? result.winnerName : "未知"
    const winnerBid = Math.round(Number(result && result.winnerBid) || 0)
    const totalValue = Math.round(Number(result && result.totalValue) || 0)
    const winnerProfit = Math.round(Number(result && result.winnerProfit) || 0)
    const reasonText = result && result.reasonText ? result.reasonText : "结算"
    const dtInfo =
      result && result.dividendTicketInfo
        ? (result.dividendTicketInfo as { mechanism?: string; dividendPerPlayer?: number; ticketPerPlayer?: number })
        : null
    const mechanism: string = dtInfo?.mechanism ?? "none"
    const dividendAmt = dtInfo ? Math.round(Number(dtInfo.dividendPerPlayer) || 0) : 0
    const ticketAmt = dtInfo ? Math.round(Number(dtInfo.ticketPerPlayer) || 0) : 0
    const qualityCounts = this.getQualityCounts()
    const totalItems = this.deps.getItems().length
    const totalCells = this.getTotalOccupiedCells()
    const roundBids: Array<{ round: number; playerId: string; playerName: string; bid: number }> = []
    const playerRoundHistory = this.deps.getPlayerRoundHistory()
    this.deps.players.forEach((player) => {
      const history = playerRoundHistory[player.id] || []
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
      run: data.runSerial || 0,
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
      reflectionEnabled: this.deps.isAiReflectionEnabled()
    }
    return record
  }

  /** 获取 AI 第一回合额外上下文块 */
  getAiFirstRoundExtraBlocks(playerId?: string): string[] {
    if (!this.isAiMultiGameMemoryEnabled() || this.deps.getRound() !== 1) {
      return []
    }

    const blocks = [`【系统事件】第 ${this.deps.data.runSerial} 局开始。本局仓库随机生成，技能与道具已重置。`]

    const targetId = playerId || this.deps.players.find((p) => !p.isHuman)?.id || ""
    const playerSummary = this.deps.data.pendingNextRunAiSummaryByPlayer?.[targetId]
    if (playerSummary) {
      blocks.push(String(playerSummary))
    }

    const publicEvent = this.deps.getCurrentPublicEvent()
    if (publicEvent) {
      blocks.push(`【公共事件】${publicEvent.category}：${publicEvent.text}`)
    }

    return blocks
  }

  /** 打开 AI 记忆面板 */
  openAiMemoryPanel(): void {
    const dom = this.deps.dom
    if (!dom.aiMemoryOverlay) return
    const aiPlayers = this.deps.players.filter((p) => !p.isHuman)
    if (aiPlayers.length === 0) {
      if (dom.aiMemoryContent) {
        dom.aiMemoryContent.innerHTML = '<div class="ai-memory-empty">暂无AI玩家</div>'
      }
      dom.aiMemoryOverlay.classList.remove("hidden")
      return
    }
    const sections = aiPlayers
      .map((player, idx) => {
        const memory = this.ensureAiCrossGameMemory(player.id)
        const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"]
        const color = colors[idx % colors.length]
        let inner = ""

        const stats: CrossGameStats = memory.stats || { ...DEFAULT_CROSS_GAME_STATS }
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

    if (dom.aiMemoryContent) {
      dom.aiMemoryContent.innerHTML = sections || '<div class="ai-memory-empty">暂无记忆数据</div>'
    }
    if (!this.touchBound) {
      this.touchBound = true
      this.setupAiMemoryTouchScroll()
    }
    dom.aiMemoryOverlay.classList.remove("hidden")
  }

  /** 设置 AI 记忆面板触摸滚动 */
  setupAiMemoryTouchScroll(): void {
    const content = this.deps.dom.aiMemoryContent
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
  }

  /** 关闭 AI 记忆面板 */
  closeAiMemoryPanel(): void {
    if (this.deps.dom.aiMemoryOverlay) {
      this.deps.dom.aiMemoryOverlay.classList.add("hidden")
    }
  }
}
