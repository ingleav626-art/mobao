/**
 * @file reflection-manager.ts
 * @module ai/reflection-manager
 * @description AiReflectionManager -- AI 局后反思管理器（Phase 2 依赖注入）。
 *              包装 reflection.ts 的纯函数与流程方法，通过构造函数注入依赖，
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { Player } from "../../../types/game"
import type { RunLog } from "./decision"
import { AudioManager } from "../../audio/audio-manager"
import { MobaoGameHistory } from "./game-history"
import { applyMemoryOperations, updateCrossGameMemory, type CrossGameMemory } from "./reflection"

// ─── 类型定义 ───

/** 反思状态容器（可变引用，Manager 直接读写） */
export interface ReflectionStatus {
  state: string
  detail: string
  completed: number
  total: number
  beforeUnloadHandler: (() => void) | null
}

/** LLM 设置（反思相关字段子集） */
export interface ReflectionLlmSettings {
  reflectionEnabled?: boolean
  reflectionScope?: string
  independentReflectionEnabled?: boolean
  apiKey?: string
  endpoint?: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
  thinkingEnabled?: boolean
  [key: string]: unknown
}

/** AI 独立模型配置 */
export interface ReflectionAiModelConfig {
  apiKey?: string
  endpoint?: string
  model?: string
  maxTokens?: number
  timeoutMs?: number
  thinkingEnabled?: boolean
  [key: string]: unknown
}

/** LLM requestChat 返回结果 */
export interface ReflectionChatResult {
  ok?: boolean
  content?: string
  reasoningContent?: string
  error?: string
  code?: string
  status?: string | number
  usage?: {
    prompt_cache_hit_tokens?: number
    prompt_cache_miss_tokens?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** LLM Provider 接口（反思所需最小子集） */
export interface ReflectionLlmProvider {
  id: string
  requestChat: (options: Record<string, unknown>) => Promise<ReflectionChatResult>
}

/** 局结算记录（反思所需字段子集） */
export interface ReflectionRecord {
  winnerId?: string
  result?: string
  warehouseValue?: number
  totalCells?: number
  totalItems?: number
  qualityCounts?: Record<string, number>
  winnerProfit?: number
  dividendTicket?: {
    mechanism?: string
    dividendPerPlayer?: number
    ticketPerPlayer?: number
  }
  [key: string]: unknown
}

/** 失败玩家信息 */
interface FailedPlayerInfo {
  playerId: string
  playerName: string
  reason: string
  code?: string
  thinkingEnabled?: boolean
  exception?: boolean
  status?: string
}

/** 超时玩家信息 */
interface TimeoutPlayerInfo {
  playerId: string
  playerName: string
  reason: string
  code?: string
  thinkingEnabled?: boolean
}

/** AiReflectionManager 依赖接口 */
export interface AiReflectionManagerDeps {
  // ── LLM 能力与设置 ──
  getLlmSettings: () => ReflectionLlmSettings | null
  canUseLlmDecision: () => boolean
  canUseLlmDecisionForPlayer: (playerId: string) => boolean
  getLlmProvider: () => ReflectionLlmProvider | null
  getAiModelConfigForPlayer?: (playerId: string) => ReflectionAiModelConfig | null

  // ── 动态状态读取 ──
  llmEverUsedThisRun: () => boolean
  isLanMode: () => boolean
  getCurrentRunLog: () => RunLog | null
  getAiCrossGameMemory: () => Record<string, CrossGameMemory>
  getAiCrossGameMessagesByPlayer: () => Record<string, unknown[][]> | null
  getAiConversationCache: () => Record<string, unknown[]> | null
  getPendingNextRunAiSummaryByPlayer: () => Record<string, string>
  getPendingSettlementSummary: () => string
  getBattleRecordReplayActive: () => boolean
  getBattleRecordReplayRecordId: () => string | null

  // ── 动态状态写入 ──
  setPendingSettlementSummary: (value: string) => void
  setBattleRecordReplayActive: (value: boolean) => void
  setBattleRecordReplayRecordId: (value: string | null) => void

  // ── 可变容器 ──
  players: Player[]
  reflectionStatus: ReflectionStatus

  // ── 回调 ──
  ensureAiCrossGameMemory: (playerId: string) => CrossGameMemory
  saveAiMemoryToStorage: () => void
  updateReflectionStatusUI: () => void
  renderAiThoughtLog: () => void
  isAiMultiGameMemoryEnabled: () => boolean
  shouldGenerateSummary?: () => boolean
  clearGameHistoryForPlayer?: (playerId: string) => void

  // ── proceedTo* 流程回调 ──
  exitSettlementPage: () => void
  startNewRun: () => void
  enterLobby: () => void
  enterLanRoom: () => void
  openBattleRecordPanel: () => void
  writeLog: (text: string) => void
}

/**
 * AI 局后反思管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * 反思状态通过 reflectionStatus 容器读写，跨局记忆/消息通过 getter 动态读取。
 * proceedToNewRun / proceedToBack 为流程编排方法，按设计保留在反思管理器中。
 */
export class AiReflectionManager {
  constructor(private readonly deps: AiReflectionManagerDeps) {}

  /** 检查反思功能是否启用 */
  isAiReflectionEnabled(): boolean {
    const settings = this.deps.getLlmSettings()
    return Boolean(settings && settings.reflectionEnabled)
  }

  /** 检查是否应显示反思 UI */
  shouldShowReflectionUI(): boolean {
    return this.isAiReflectionEnabled() && this.deps.canUseLlmDecision() && this.deps.llmEverUsedThisRun()
  }

  /** 对经验本数组执行增删改操作 */
  applyMemoryOperations(array: string[], operations: Record<string, unknown>, maxLength: number): void {
    applyMemoryOperations(array, operations, maxLength)
  }

  /** 更新跨局记忆（统计 + 经验本操作） */
  updateCrossGameMemory(
    playerId: string,
    record: Record<string, unknown>,
    parsedReflection: Record<string, unknown>
  ): void {
    const memory = this.deps.ensureAiCrossGameMemory(playerId)
    if (!memory) return
    updateCrossGameMemory(memory, playerId, record, parsedReflection)
    this.deps.saveAiMemoryToStorage()
  }

  /** 返回大厅（从结算页返回，处理战绩回放/联机等分支） */
  proceedToBack(): void {
    this.deps.exitSettlementPage()
    if (this.deps.getBattleRecordReplayActive()) {
      this.deps.setBattleRecordReplayActive(false)
      this.deps.setBattleRecordReplayRecordId(null)
      this.deps.enterLobby()
      setTimeout(() => {
        this.deps.openBattleRecordPanel()
        this.deps.writeLog("已返回战绩列表，可继续选择其他战绩回放。")
      }, 100)
      return
    }
    if (this.deps.isLanMode()) {
      this.deps.enterLanRoom()
    } else {
      this.deps.enterLobby()
    }
  }

  /** 开始新局（从结算页进入下一局） */
  proceedToNewRun(): void {
    this.deps.exitSettlementPage()
    this.deps.startNewRun()
    if (typeof AudioManager !== "undefined") {
      AudioManager.resumeBgm()
    }
  }

  /** 局结算后触发所有 AI 玩家的反思 */
  async triggerAiReflection(record: ReflectionRecord): Promise<void> {
    const status = this.deps.reflectionStatus
    console.log("[triggerAiReflection] called, checking conditions...")
    console.log(
      "[triggerAiReflection] isAiReflectionEnabled:",
      this.isAiReflectionEnabled(),
      "canUseLlmDecision:",
      this.deps.canUseLlmDecision(),
      "llmEverUsedThisRun:",
      this.deps.llmEverUsedThisRun()
    )
    if (!this.isAiReflectionEnabled() || !this.deps.canUseLlmDecision() || !this.deps.llmEverUsedThisRun()) {
      console.log("[triggerAiReflection] EARLY RETURN: conditions not met")
      return
    }
    status.state = "pending"
    status.detail = ""
    status.completed = 0
    this.deps.updateReflectionStatusUI()

    status.beforeUnloadHandler = () => {
      this.deps.saveAiMemoryToStorage()
    }
    window.addEventListener("beforeunload", status.beforeUnloadHandler)
    const originalCrossGameMemory = this.deps.getAiCrossGameMemory()
    const aiPlayers = this.deps.players.filter((p: Player) => !p.isHuman && this.deps.canUseLlmDecisionForPlayer(p.id))
    status.total = aiPlayers.length
    this.deps.updateReflectionStatusUI()
    console.log("[triggerAiReflection] aiPlayers count:", aiPlayers.length)
    if (aiPlayers.length === 0) {
      status.state = "done"
      this.deps.updateReflectionStatusUI()
      return
    }
    const failedPlayers: FailedPlayerInfo[] = []
    const timeoutPlayers: TimeoutPlayerInfo[] = []
    const reflectionPromises = aiPlayers.map(async (player: Player) => {
      const playerName = player.name
      const playerId = player.id
      console.log("[triggerAiReflection] starting reflection for player:", playerId, playerName)
      const isWinner = record.winnerId === player.id
      let dividendTicketText = "无分红/门票"
      if (record.dividendTicket) {
        if (isWinner) {
          dividendTicketText = "你是拍下者，无分红/门票"
        } else if (record.dividendTicket.mechanism === "dividend") {
          dividendTicketText = `分红触发：拍下者亏损，你获得+${record.dividendTicket.dividendPerPlayer || 0}分红`
        } else if (record.dividendTicket.mechanism === "ticket") {
          dividendTicketText = `门票触发：拍下者盈利，你被扣除${record.dividendTicket.ticketPerPlayer || 0}门票`
        }
      }
      const crossMemory = this.deps.ensureAiCrossGameMemory(player.id)
      const stats = (crossMemory.stats || {}) as CrossGameMemory["stats"]
      const lessons = crossMemory.lessons || []
      const strategies = crossMemory.strategies || []
      const praises = crossMemory.praises || []
      const MAX_ENTRIES = 10

      const praiseList = praises.map((p: string, i: number) => `${i}. ${p}`).join("; ")
      const strategyList = strategies.map((s: string, i: number) => `${i}. ${s}`).join("; ")
      const lessonList = lessons.map((l: string, i: number) => `${i}. ${l}`).join("; ")

      let statsInfo = ""
      if (stats.totalGames > 0) {
        statsInfo = [
          `历史统计(${stats.totalGames}局):`,
          `- 胜率${Math.round((stats.winRate || 0) * 100)}%, 平均盈亏${Math.round(stats.avgProfit || 0)}`,
          stats.warehouseValueMax > 0
            ? `- 仓库价值: ${stats.warehouseValueMin}~${stats.warehouseValueMax}, 平均${Math.round(stats.warehouseValueAvg || 0)}`
            : "",
          stats.totalCellsMax > 0
            ? `- 格数: ${stats.totalCellsMin}~${stats.totalCellsMax}, 平均${Math.round(stats.totalCellsAvg || 0)}`
            : "",
          stats.totalItemsMax > 0
            ? `- 藏品件数: ${stats.totalItemsMin}~${stats.totalItemsMax}, 平均${Math.round(stats.totalItemsAvg || 0)}`
            : "",
          stats.legendaryMax > 0
            ? `- 绝品件数: ${stats.legendaryMin}~${stats.legendaryMax}, 平均${(stats.legendaryAvg || 0).toFixed(1)}`
            : "",
          stats.rareMax > 0
            ? `- 珍品件数: ${stats.rareMin}~${stats.rareMax}, 平均${(stats.rareAvg || 0).toFixed(1)}`
            : ""
        ]
          .filter(Boolean)
          .join("\n")
      }

      const needsSummary =
        this.deps.isAiMultiGameMemoryEnabled() && this.deps.shouldGenerateSummary && this.deps.shouldGenerateSummary()

      const reflectionPrompt = [
        "请根据本局表现更新经验本，返回JSON格式：",
        "{",
        '  "praises": { "add": ["新内容"], "delete": [索引号], "modify": [[索引号, "新内容"]] },',
        '  "strategies": { "add": [...], "delete": [...], "modify": [...] },',
        '  "lessons": { "add": [...], "delete": [...], "modify": [...] },',
        needsSummary ? '  "summary": "将最近几局的关键经验压缩为一段50字以内的摘要"' : "",
        "}",
        "",
        "要求：",
        "- 尽量用最少的字给自己留下最有用的内容",
        "- 如果条数已满，但又必须增加条目时思考如何优化现有经验书",
        "- 不要写本局，本次等一些很限定的词，同时不要写违反游戏规定的条例",
        "- 每一个条目的字数限制在50字",
        needsSummary ? "- summary：将最近几局的胜率、关键教训、出价规律压缩为一段话，用于下局开局时快速回忆" : "",
        "操作说明：",
        "- add: 添加新条目，数组形式",
        "- delete: 删除条目，索引号数组（如 [0, 2] 删除第0和第2条）",
        '- modify: 修改条目，二维数组（如 [[1, "新内容"]] 修改第1条）',
        "- 如果某类无需操作，返回空对象 {}",
        "- 只返回JSON，不要其他文字",
        "【本局结束，请总结经验】",
        `结果：${record.result}`,
        `${dividendTicketText}。`,
        `品质分布：粗${record.qualityCounts?.poor || 0} 良${record.qualityCounts?.normal || 0} 精${record.qualityCounts?.fine || 0} 珍${record.qualityCounts?.rare || 0} 绝${record.qualityCounts?.legendary || 0} | 总藏品${record.totalItems || 0}格数${record.totalCells || 0}`,
        "",
        `当前经验书（每类最多${MAX_ENTRIES}条）：`,
        `- 成功经验(${praises.length}/${MAX_ENTRIES}): ${praiseList || "无"}`,
        `- 策略建议(${strategies.length}/${MAX_ENTRIES}): ${strategyList || "无"}`,
        `- 经验教训(${lessons.length}/${MAX_ENTRIES}): ${lessonList || "无"}`,
        statsInfo ? `\n${statsInfo}` : ""
      ]

      try {
        const llmProvider = this.deps.getLlmProvider()
        console.log("[triggerAiReflection] llmProvider:", llmProvider ? llmProvider.id : "null")
        if (!llmProvider) {
          failedPlayers.push({ playerId: player.id, playerName: player.name, reason: "无LLM Provider" })
          console.log("[triggerAiReflection] FAILED: no llmProvider for player:", player.id)
          return { playerId: player.id, reflection: null, error: "无LLM Provider" }
        }
        let settings: ReflectionLlmSettings | null = this.deps.getLlmSettings()
        const reflectionScope = (settings && settings.reflectionScope) || "current"
        if (reflectionScope === "full" && MobaoGameHistory) {
          const historyContext = MobaoGameHistory.buildReflectionContext(player.id, "full", null, this.deps.isLanMode())
          if (historyContext) {
            reflectionPrompt.push("", historyContext)
          }
        }
        if (needsSummary && reflectionScope !== "full" && MobaoGameHistory) {
          const historyContext = MobaoGameHistory.buildReflectionContext(player.id, "full", null, this.deps.isLanMode())
          if (historyContext) {
            reflectionPrompt.push("", "【多局历史（用于总结）】", historyContext)
          }
        }
        const reflectionPromptText = reflectionPrompt.join("\n")
        const independentReflectionEnabled =
          settings && settings.independentReflectionEnabled !== undefined ? settings.independentReflectionEnabled : true
        console.log("[triggerAiReflection] independentReflectionEnabled:", independentReflectionEnabled)
        if (independentReflectionEnabled && this.deps.getAiModelConfigForPlayer) {
          const aiModelConfig = this.deps.getAiModelConfigForPlayer(player.id)
          console.log(
            "[triggerAiReflection] aiModelConfig for player:",
            player.id,
            aiModelConfig
              ? {
                  apiKey: aiModelConfig.apiKey ? "(已设置)" : "(空)",
                  endpoint: aiModelConfig.endpoint,
                  model: aiModelConfig.model,
                  thinkingEnabled: aiModelConfig.thinkingEnabled
                }
              : null
          )
          if (aiModelConfig) {
            settings = {
              ...settings,
              apiKey: aiModelConfig.apiKey || settings?.apiKey,
              endpoint: aiModelConfig.endpoint || settings?.endpoint,
              model: aiModelConfig.model || settings?.model,
              maxTokens: aiModelConfig.maxTokens || settings?.maxTokens,
              timeoutMs: aiModelConfig.timeoutMs || settings?.timeoutMs,
              thinkingEnabled:
                aiModelConfig.thinkingEnabled !== undefined ? aiModelConfig.thinkingEnabled : settings?.thinkingEnabled
            }
            console.log("[triggerAiReflection] merged settings for player:", player.id, {
              apiKey: settings.apiKey ? "(已设置)" : "(空)",
              endpoint: settings.endpoint,
              model: settings.model,
              thinkingEnabled: settings.thinkingEnabled,
              timeoutMs: settings.timeoutMs
            })
          }
        }
        const thinkingEnabled = settings && settings.thinkingEnabled
        const userTimeoutMs = settings && settings.timeoutMs ? settings.timeoutMs : 40000
        const maxTokens = settings && settings.maxTokens ? settings.maxTokens : thinkingEnabled ? 4000 : 800
        const timeoutMs = thinkingEnabled ? Math.max(userTimeoutMs, 90000) : userTimeoutMs

        const aiConversationCache = this.deps.getAiConversationCache()
        const playerCache = aiConversationCache && aiConversationCache[player.id]
        let messages: unknown[]
        if (playerCache && Array.isArray(playerCache) && playerCache.length > 0) {
          messages = [...playerCache, { role: "user", content: reflectionPromptText }]
          console.log("[triggerAiReflection] using cached conversation, messages count:", messages.length)
        } else {
          messages = [
            {
              role: "system",
              content: `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在对本局自己的表现进行反思总结。只反思你自己的出价和决策，不要混淆其他玩家的行为。`
            },
            { role: "user", content: reflectionPromptText }
          ]
          console.log("[triggerAiReflection] no cache, using simple prompt")
        }

        console.log(
          "[triggerAiReflection] requesting chat for player:",
          player.id,
          "thinkingEnabled:",
          thinkingEnabled,
          "maxTokens:",
          maxTokens,
          "timeoutMs:",
          timeoutMs
        )
        const result = await llmProvider.requestChat({
          temperature: 0.3,
          maxTokens,
          timeoutMs,
          isThinking: thinkingEnabled,
          messages,
          settings
        })
        console.log(
          "[triggerAiReflection] result for player:",
          player.id,
          "ok:",
          result.ok,
          "code:",
          result.code,
          "error:",
          result.error,
          "contentLength:",
          result.content ? result.content.length : 0,
          "reasoningContentLength:",
          result.reasoningContent ? result.reasoningContent.length : 0
        )
        if (result.ok && (result.content || result.reasoningContent)) {
          const rawContent = result.content || result.reasoningContent || ""
          const reflectionText = String(rawContent).trim()
          console.log(
            "[triggerAiReflection] SUCCESS for player:",
            player.id,
            "reflection length:",
            reflectionText.length
          )

          const usage = result && result.usage ? result.usage : null
          const cacheHitTokens = usage && usage.prompt_cache_hit_tokens ? usage.prompt_cache_hit_tokens : 0
          const cacheMissTokens = usage && usage.prompt_cache_miss_tokens ? usage.prompt_cache_miss_tokens : 0
          const totalPromptTokens = cacheHitTokens + cacheMissTokens
          const cacheHitRate = totalPromptTokens > 0 ? Math.round((cacheHitTokens / totalPromptTokens) * 100) : 0
          console.log(
            `[triggerAiReflection] ${player.id} cache: hit=${cacheHitTokens}, miss=${cacheMissTokens}, rate=${cacheHitRate}%`
          )

          let parsedReflection: { lessons: unknown[]; strategies: unknown[]; summary?: string } = {
            lessons: [],
            strategies: []
          }
          try {
            const jsonMatch = reflectionText.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              parsedReflection = JSON.parse(jsonMatch[0])
            }
          } catch (e) {
            console.warn("[triggerAiReflection] failed to parse reflection JSON:", e)
          }

          if (this.deps.isAiMultiGameMemoryEnabled()) {
            this.updateCrossGameMemory(player.id, record, parsedReflection)
            if (needsSummary && parsedReflection.summary) {
              const pendingNextRunAiSummaryByPlayer = this.deps.getPendingNextRunAiSummaryByPlayer()
              pendingNextRunAiSummaryByPlayer[player.id] = parsedReflection.summary
              if (this.deps.clearGameHistoryForPlayer) {
                this.deps.clearGameHistoryForPlayer(player.id)
              }
              const aiCrossGameMessagesByPlayer = this.deps.getAiCrossGameMessagesByPlayer()
              if (aiCrossGameMessagesByPlayer) {
                aiCrossGameMessagesByPlayer[player.id] = []
              }
            }
            const aiCrossGameMemory = this.deps.getAiCrossGameMemory()
            if (aiCrossGameMemory !== originalCrossGameMemory) {
              Object.keys(originalCrossGameMemory).forEach((pid) => {
                if (!aiCrossGameMemory[pid]) {
                  aiCrossGameMemory[pid] = originalCrossGameMemory[pid]
                }
              })
              aiCrossGameMemory[player.id] = originalCrossGameMemory[player.id] || aiCrossGameMemory[player.id]
            }
            this.deps.saveAiMemoryToStorage()
          } else {
            const pendingNextRunAiSummaryByPlayer = this.deps.getPendingNextRunAiSummaryByPlayer()
            const existing = pendingNextRunAiSummaryByPlayer[player.id] || ""
            pendingNextRunAiSummaryByPlayer[player.id] =
              existing + ` 【${player.name}反思】${reflectionText.slice(0, 200)}`
            this.deps.saveAiMemoryToStorage()
          }

          const currentRunLog = this.deps.getCurrentRunLog()
          if (currentRunLog && Array.isArray(currentRunLog.aiThoughtLogs)) {
            currentRunLog.aiThoughtLogs.push({
              round: "结算",
              playerName: player.name,
              thought: `[局后反思] ${reflectionText.slice(0, 300)}`,
              reasoningContent: reflectionText,
              crossGameMemoryCount: 0,
              controlMode: "llm",
              finalBid: 0,
              decisionSource: "reflection",
              llmActionName: "反思",
              ruleActionName: "",
              actionExecuted: true,
              error: "",
              correctionAttempt: 0,
              originalError: "",
              cacheHitTokens: cacheHitTokens,
              cacheMissTokens: cacheMissTokens,
              cacheHitRate: cacheHitRate,
              at: Date.now()
            })
            if (currentRunLog.aiThoughtLogs.length > 80) {
              currentRunLog.aiThoughtLogs = currentRunLog.aiThoughtLogs.slice(-80)
            }
            this.deps.renderAiThoughtLog()
          }

          return {
            playerId: player.id,
            reflection: reflectionText,
            cacheHitTokens,
            cacheMissTokens,
            cacheHitRate
          }
        }
        status.completed++
        this.deps.updateReflectionStatusUI()
        if (result.code === "TIMEOUT") {
          timeoutPlayers.push({
            playerId: player.id,
            playerName: player.name,
            reason: `超时(${timeoutMs}ms)`,
            thinkingEnabled: thinkingEnabled || undefined
          })
          console.log(
            "[triggerAiReflection] TIMEOUT for player:",
            player.id,
            "timeoutMs:",
            timeoutMs,
            "thinkingEnabled:",
            thinkingEnabled
          )
        } else {
          const errorDetail = result.error || result.code || "未知错误"
          const statusCode = result.status != null ? String(result.status) : ""
          failedPlayers.push({
            playerId: player.id,
            playerName: player.name,
            reason: errorDetail,
            code: result.code,
            status: statusCode,
            thinkingEnabled: thinkingEnabled || undefined
          })
          console.log(
            "[triggerAiReflection] FAILED for player:",
            player.id,
            "code:",
            result.code,
            "error:",
            result.error,
            "status:",
            statusCode,
            "thinkingEnabled:",
            thinkingEnabled
          )
        }
        status.completed++
        this.deps.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: result.error || result.code }
      } catch (err) {
        const errMsg = err && (err as Error).message ? (err as Error).message : "异常"
        failedPlayers.push({ playerId: player.id, playerName: player.name, reason: errMsg, exception: true })
        console.log("[triggerAiReflection] EXCEPTION for player:", player.id, "error:", errMsg)
        status.completed++
        this.deps.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: errMsg }
      }
    })
    const pendingSummary = this.deps.getPendingSettlementSummary()
    const aiCrossGameMessagesByPlayer = this.deps.getAiCrossGameMessagesByPlayer()
    if (pendingSummary && aiCrossGameMessagesByPlayer) {
      this.deps.players
        .filter((p: Player) => !p.isHuman)
        .forEach((p: Player) => {
          const messages = aiCrossGameMessagesByPlayer[p.id]
          if (Array.isArray(messages) && messages.length > 0) {
            const lastGame = messages[messages.length - 1]
            if (Array.isArray(lastGame)) {
              lastGame.push({ role: "user", content: pendingSummary })
            }
          }
        })
      this.deps.setPendingSettlementSummary("")
      this.deps.saveAiMemoryToStorage()
    }
    await Promise.all(reflectionPromises)
    if (timeoutPlayers.length > 0) {
      status.state = "timeout"
      const timeoutInfo = timeoutPlayers
        .map((p) => `${p.playerName}(${p.reason}${p.thinkingEnabled ? ",思考模式" : ""})`)
        .join("; ")
      status.detail = timeoutInfo
      console.log("[triggerAiReflection] TIMEOUT players:", timeoutInfo)
    } else if (failedPlayers.length > 0) {
      status.state = "error"
      const failedInfo = failedPlayers
        .map((p) => `${p.playerName}(${p.reason}${p.code ? `,${p.code}` : ""}${p.thinkingEnabled ? ",思考模式" : ""})`)
        .join("; ")
      status.detail = failedInfo
      console.log("[triggerAiReflection] FAILED players:", failedInfo)
    } else {
      status.state = "done"
      status.detail = ""
    }
    if (status.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", status.beforeUnloadHandler)
      status.beforeUnloadHandler = null
    }
    this.deps.updateReflectionStatusUI()
  }
}
