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
import { MobaoSummarizer } from "./summarizer"
import { createLogger } from "../core/logger"
const log = createLogger("AI.Reflection")

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
  getAiConversationByPlayer?: () => Record<string, unknown[]> | null
  getPendingNextRunAiSummaryByPlayer: () => Record<string, string>
  getPendingSettlementSummary: () => string
  getBattleRecordReplayActive: () => boolean
  getBattleRecordReplayRecordId: () => string | null

  // ── 动态状态写入 ──
  setPendingSettlementSummary: (value: string) => void
  setBattleRecordReplayActive: (value: boolean) => void
  setBattleRecordReplayRecordId: (value: string | null) => void
  setAiReflectionState: (v: string) => void
  setAiReflectionStateDetail: (v: string) => void
  setAiReflectionTotal: (v: number) => void
  setAiReflectionCompleted: (v: number) => void
  getAiReflectionState: () => string
  getAiReflectionStateDetail: () => string
  getAiReflectionTotal: () => number
  getAiReflectionCompleted: () => number

  // ── 可变容器 ──
  players: Player[]

  // ── 回调 ──
  ensureAiCrossGameMemory: (playerId: string) => CrossGameMemory
  saveAiMemoryToStorage: () => void
  updateReflectionStatusUI: () => void
  renderAiThoughtLog: () => void
  isAiMultiGameMemoryEnabled: () => boolean
  shouldGenerateSummary?: () => boolean
  isAtContextLimit?: () => boolean
  clearGameHistoryForPlayer?: (playerId: string) => void
  refreshAiExperienceBookInContext?: (playerId: string) => void

  // ── proceedTo* 流程回调 ──
  exitSettlementPage: () => void
  startNewRun: () => void
  enterLobby: () => void
  enterLanRoom: () => void
  openBattleRecordPanel: () => void
  writeLog: (text: string) => void
  isAutoPlaying?: () => boolean

  // ── AI 反馈收集（局后反思时触发，由 AiMemoryManager 实现） ──
  isFeedbackEnabled?: () => boolean
  getRunSerial?: () => number
  addAiFeedback?: (entry: {
    playerId: string
    playerName: string
    runSerial: number
    content: string
  }) => void
}

/**
 * AI 局后反思管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * 反思状态通过 reflectionStatus 容器读写，跨局记忆/消息通过 getter 动态读取。
 * proceedToNewRun / proceedToBack 为流程编排方法，按设计保留在反思管理器中。
 */
export class AiReflectionManager {
  constructor(private readonly deps: AiReflectionManagerDeps) { }

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
    let _beforeUnloadHandler: (() => void) | null = null
    // 反思与总结独立判定：同在结算节点调用，但不一定同时需要。
    const reflectionNeeded =
      this.isAiReflectionEnabled() && this.deps.canUseLlmDecision() && this.deps.llmEverUsedThisRun()
    const multiGame = this.deps.isAiMultiGameMemoryEnabled()
    const summaryNeeded =
      Boolean(this.deps.shouldGenerateSummary && this.deps.shouldGenerateSummary()) && this.deps.canUseLlmDecision()
    const atLimit = Boolean(this.deps.isAtContextLimit && this.deps.isAtContextLimit())
    // 清空时机：多局关每局清；多局开达 contextLength 清。不依赖总结是否成功。
    const clearNeeded = !multiGame || atLimit
    const llmNeeded = reflectionNeeded || summaryNeeded

    log.debug(
      "triggerSettlement: reflectionNeeded=",
      reflectionNeeded,
      "summaryNeeded=",
      summaryNeeded,
      "clearNeeded=",
      clearNeeded
    )
    if (!reflectionNeeded && !summaryNeeded && !clearNeeded) {
      log.debug("EARLY RETURN: nothing to do")
      return
    }
    if (llmNeeded) {
      this.deps.setAiReflectionState("pending")
      this.deps.setAiReflectionStateDetail("")
      this.deps.setAiReflectionCompleted(0)
      this.deps.updateReflectionStatusUI()
    }

    _beforeUnloadHandler = () => {
      this.deps.saveAiMemoryToStorage()
    }
    window.addEventListener("beforeunload", _beforeUnloadHandler)
    const originalCrossGameMemory = this.deps.getAiCrossGameMemory()
    const aiPlayers = llmNeeded
      ? this.deps.players.filter((p: Player) =>
        (!p.isHuman || (p.isHuman && this.deps.isAutoPlaying?.())) && this.deps.canUseLlmDecisionForPlayer(p.id)
      )
      : []
    if (llmNeeded) {
      this.deps.setAiReflectionTotal(aiPlayers.length)
      this.deps.updateReflectionStatusUI()
      log.debug("aiPlayers count:", aiPlayers.length)
    }
    const failedPlayers: FailedPlayerInfo[] = []
    const timeoutPlayers: TimeoutPlayerInfo[] = []
    const reflectionPromises = aiPlayers.map(async (player: Player) => {
      const playerName = player.name
      const playerId = player.id
      // 本玩家走反思(A)/总结(B)/A+B 哪种
      const doReflection = reflectionNeeded
      const doSummary = summaryNeeded
      const standaloneSummary = !doReflection && doSummary
      log.debug("starting settlement ai for player:", playerId, playerName, { doReflection, doSummary, standaloneSummary })
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

      const feedbackEnabled = Boolean(
        doReflection &&
          this.deps.isFeedbackEnabled &&
          this.deps.isFeedbackEnabled() &&
          this.deps.getRunSerial &&
          this.deps.addAiFeedback
      )

      try {
        const llmProvider = this.deps.getLlmProvider()
        if (!llmProvider) {
          failedPlayers.push({ playerId: player.id, playerName: player.name, reason: "无LLM Provider" })
          log.warn("FAILED: no llmProvider for player:", player.id)
          return { playerId: player.id, reflection: null, error: "无LLM Provider" }
        }
        let settings: ReflectionLlmSettings | null = this.deps.getLlmSettings()

        // ── 构建提示词：A（反思）/ B（总结）/ A+B 合并 ──
        let promptText: string
        let systemContent: string
        if (standaloneSummary) {
          // B standalone：只产上期总结文本，不更新经验本
          const settingsNow = this.deps.getLlmSettings()
          const contextLength = (settingsNow && (settingsNow.contextLength as number)) || 5
          const recentRecords = MobaoGameHistory
            ? MobaoGameHistory.load(player.id, this.deps.isLanMode())
              .slice(-contextLength)
              .map((r) => {
                const rr = r as unknown as Record<string, unknown>
                return {
                  run: Number(rr.run) || 0,
                  result: String(rr.result || rr.reasonText || ""),
                  winnerProfit: Number(rr.winnerProfit) || 0,
                  qualityCounts: (rr.qualityCounts as Record<string, number>) || {},
                  reflection: (rr.reflection as string | null) || null
                }
              })
            : []
          promptText = MobaoSummarizer.buildSummaryPrompt(
            recentRecords,
            { praises: praises as string[], strategies: strategies as string[], lessons: lessons as string[] },
            stats.totalGames
          )
          systemContent = `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在生成跨局上期总结。`
        } else {
          // A 或 A+B：反思更新经验本；若 doSummary 则顺带要 summary 字段（piggyback）
          const reflectionPrompt = [
            "请根据本局表现更新经验本，返回JSON格式：",
            "{",
            '  "praises": { "add": ["新内容"], "delete": [索引号], "modify": [[索引号, "新内容"]] },',
            '  "strategies": { "add": [...], "delete": [...], "modify": [...] },',
            '  "lessons": { "add": [...], "delete": [...], "modify": [...] },',
            doSummary ? '  "summary": "将最近几局的关键经验压缩为一段500字以内的摘要"' : "",
            feedbackEnabled ? '  "feedback": "你对本次游戏体验的反馈或建议（≤500字，没意见则返回空字符串）"' : "",
            "}",
            "",
            "要求：",
            "- 尽量用最少的字给自己留下最有用的内容",
            "- 如果条数已满，但又必须增加条目时思考如何优化现有经验书",
            "- 不要写本局，本次等一些很限定的词，同时不要写违反游戏规定的条例",
            "- 每一个条目的字数限制在50字",
            doSummary ? "- summary：将最近几局的胜率、关键教训、出价规律压缩为一段话，用于下局开局时快速回忆" : "",
            feedbackEnabled
              ? "- feedback：亲爱的测试AI玩家，开发者想知道你作为AI玩家在游玩过程中的疑惑或对游戏的不满甚至是批评。请具体指出：哪一条规则描述让你困惑？哪个字段的含义你不确定？哪个道具的效果你理解不了？哪个数值你觉得不合理？请引用原文或描述具体场景。目前已知：不能扩充不属于道具效果的功能，如：单格均价仪设计上就是不返回单格藏品的件数。后续会出类似功能的道具"
              : "",
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
          const reflectionScope = (settings && settings.reflectionScope) || "current"
          if (reflectionScope === "full" && MobaoGameHistory) {
            const historyContext = MobaoGameHistory.buildReflectionContext(player.id, "full", null, this.deps.isLanMode())
            if (historyContext) reflectionPrompt.push("", historyContext)
          }
          if (doSummary && reflectionScope !== "full" && MobaoGameHistory) {
            const historyContext = MobaoGameHistory.buildReflectionContext(player.id, "full", null, this.deps.isLanMode())
            if (historyContext) reflectionPrompt.push("", "【多局历史（用于总结）】", historyContext)
          }
          promptText = reflectionPrompt.join("\n")
          systemContent = `你是仓库摸宝竞拍AI玩家${player.name}(${player.id})，正在对本局自己的表现进行反思总结。只反思你自己的出价和决策，不要混淆其他玩家的行为。`
        }

        const independentReflectionEnabled =
          settings && settings.independentReflectionEnabled !== undefined ? settings.independentReflectionEnabled : true
        if (independentReflectionEnabled && this.deps.getAiModelConfigForPlayer) {
          const aiModelConfig = this.deps.getAiModelConfigForPlayer(player.id)
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
          }
        }
        const thinkingEnabled = settings && settings.thinkingEnabled
        const userTimeoutMs = settings && settings.timeoutMs ? settings.timeoutMs : 40000
        const maxTokens = settings && settings.maxTokens ? settings.maxTokens : thinkingEnabled ? 4000 : 800
        const timeoutMs = thinkingEnabled ? Math.max(userTimeoutMs, 90000) : userTimeoutMs

        // 反思复用决策对话缓存（A/A+B）；B standalone 用独立消息，不动决策缓存
        let messages: unknown[]
        if (!standaloneSummary) {
          const aiConversationCache = this.deps.getAiConversationCache()
          const playerCache = aiConversationCache && aiConversationCache[player.id]
          if (playerCache && Array.isArray(playerCache) && playerCache.length > 0) {
            messages = [...playerCache, { role: "user", content: promptText }]
          } else {
            messages = [
              { role: "system", content: systemContent },
              { role: "user", content: promptText }
            ]
          }
        } else {
          messages = [
            { role: "system", content: systemContent },
            { role: "user", content: promptText }
          ]
        }

        const result = await llmProvider.requestChat({
          temperature: 0.3,
          maxTokens,
          timeoutMs,
          isThinking: thinkingEnabled,
          messages,
          settings
        })
        if (result.ok && (result.content || result.reasoningContent)) {
          const rawContent = result.content || result.reasoningContent || ""
          const responseText = String(rawContent).trim()
          const usage = result && result.usage ? result.usage : null
          const cacheHitTokens = usage && usage.prompt_cache_hit_tokens ? usage.prompt_cache_hit_tokens : 0
          const cacheMissTokens = usage && usage.prompt_cache_miss_tokens ? usage.prompt_cache_miss_tokens : 0
          const totalPromptTokens = cacheHitTokens + cacheMissTokens
          const cacheHitRate = totalPromptTokens > 0 ? Math.round((cacheHitTokens / totalPromptTokens) * 100) : 0

          let parsed: { praises?: unknown; strategies?: unknown; lessons?: unknown; summary?: string; feedback?: string } = {}
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/)
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
          } catch (e) {
            log.warn("failed to parse response JSON:", e)
          }

          // A：反思更新经验本 B-copy（反思开就更新，不再受多局开关门控）
          if (doReflection) {
            this.updateCrossGameMemory(player.id, record, parsed as Record<string, unknown>)
            if (feedbackEnabled && this.deps.addAiFeedback && this.deps.getRunSerial) {
              const feedbackText = typeof parsed.feedback === "string" ? parsed.feedback.trim() : ""
              if (feedbackText.length > 0) {
                try {
                  this.deps.addAiFeedback({
                    playerId: player.id,
                    playerName: player.name,
                    runSerial: this.deps.getRunSerial(),
                    content: feedbackText
                  })
                  log.info(`[AI Feedback] saved: playerId=${player.id}, runSerial=${this.deps.getRunSerial()}, len=${feedbackText.length}`)
                } catch (e) {
                  log.warn("[AI Feedback] failed to save:", e)
                }
              }
            }
          }

          // B：总结产出上期总结文本（A+B 取 summary 字段；B standalone 用 parseSummaryResponse）
          if (doSummary) {
            const summary = standaloneSummary
              ? MobaoSummarizer.parseSummaryResponse(responseText)?.summary
              : typeof parsed.summary === "string"
                ? parsed.summary.trim()
                : ""
            if (summary) {
              const pendingNextRunAiSummaryByPlayer = this.deps.getPendingNextRunAiSummaryByPlayer()
              pendingNextRunAiSummaryByPlayer[player.id] = summary
            } else {
              log.warn("summary needed but not extracted for player:", player.id)
            }
          }

          // originalCrossGameMemory 引用保护
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

          const currentRunLog = this.deps.getCurrentRunLog()
          if (currentRunLog && Array.isArray(currentRunLog.aiThoughtLogs)) {
            const tag = standaloneSummary ? "[局后总结]" : "[局后反思]"
            currentRunLog.aiThoughtLogs.push({
              round: "结算",
              playerName: player.name,
              thought: `${tag} ${responseText.slice(0, 300)}`,
              reasoningContent: responseText,
              crossGameMemoryCount: 0,
              controlMode: "llm",
              finalBid: 0,
              decisionSource: standaloneSummary ? "summary" : "reflection",
              llmActionName: standaloneSummary ? "总结" : "反思",
              ruleActionName: "",
              actionExecuted: true,
              error: "",
              correctionAttempt: 0,
              originalError: "",
              cacheHitTokens,
              cacheMissTokens,
              cacheHitRate,
              at: Date.now()
            })
            if (currentRunLog.aiThoughtLogs.length > 80) {
              currentRunLog.aiThoughtLogs = currentRunLog.aiThoughtLogs.slice(-80)
            }
            this.deps.renderAiThoughtLog()
          }

          this.deps.setAiReflectionCompleted(this.deps.getAiReflectionCompleted() + 1)
          this.deps.updateReflectionStatusUI()
          return { playerId: player.id, reflection: responseText, cacheHitTokens, cacheMissTokens, cacheHitRate }
        }
        if (result.code === "TIMEOUT") {
          timeoutPlayers.push({
            playerId: player.id,
            playerName: player.name,
            reason: `超时(${timeoutMs}ms)`,
            thinkingEnabled: thinkingEnabled || undefined
          })
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
        }
        this.deps.setAiReflectionCompleted(this.deps.getAiReflectionCompleted() + 1)
        this.deps.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: result.error || result.code }
      } catch (err) {
        const errMsg = err && (err as Error).message ? (err as Error).message : "异常"
        failedPlayers.push({ playerId: player.id, playerName: player.name, reason: errMsg, exception: true })
        log.error("EXCEPTION for player:", player.id, "error:", errMsg)
        this.deps.setAiReflectionCompleted(this.deps.getAiReflectionCompleted() + 1)
        this.deps.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: errMsg }
      }
    })

    await Promise.all(reflectionPromises)

    // ── 清空（独立于总结/反思是否成功）──
    // 多局关每局清；多局开达 contextLength 清。清空时刷新经验本 A<-B，清动态部分。
    if (clearNeeded) {
      this.deps.players
        .filter((p: Player) => !p.isHuman || (p.isHuman && this.deps.isAutoPlaying?.()))
        .forEach((p: Player) => {
          this.deps.refreshAiExperienceBookInContext?.(p.id)
          const aiCrossGameMessagesByPlayer = this.deps.getAiCrossGameMessagesByPlayer()
          if (aiCrossGameMessagesByPlayer) {
            aiCrossGameMessagesByPlayer[p.id] = []
          }
          const aiConversationByPlayer = this.deps.getAiConversationByPlayer?.()
          if (aiConversationByPlayer) {
            aiConversationByPlayer[p.id] = []
          }
          const aiConversationCache = this.deps.getAiConversationCache()
          if (aiConversationCache?.[p.id]) {
            delete aiConversationCache[p.id]
          }
          if (multiGame && this.deps.clearGameHistoryForPlayer) {
            this.deps.clearGameHistoryForPlayer(p.id)
          }
        })
      this.deps.saveAiMemoryToStorage()
      log.debug("clear done: A refreshed, dynamic wiped")
    }

    if (llmNeeded) {
      if (timeoutPlayers.length > 0) {
        this.deps.setAiReflectionState("timeout")
        const timeoutInfo = timeoutPlayers
          .map((p) => `${p.playerName}(${p.reason}${p.thinkingEnabled ? ",思考模式" : ""})`)
          .join("; ")
        this.deps.setAiReflectionStateDetail(timeoutInfo)
        log.warn("TIMEOUT players:", timeoutInfo)
      } else if (failedPlayers.length > 0) {
        this.deps.setAiReflectionState("error")
        const failedInfo = failedPlayers
          .map((p) => `${p.playerName}(${p.reason}${p.code ? `,${p.code}` : ""}${p.thinkingEnabled ? ",思考模式" : ""})`)
          .join("; ")
        this.deps.setAiReflectionStateDetail(failedInfo)
        log.warn("FAILED players:", failedInfo)
      } else {
        this.deps.setAiReflectionState("done")
        this.deps.setAiReflectionStateDetail("")
      }
    }
    if (_beforeUnloadHandler) {
      window.removeEventListener("beforeunload", _beforeUnloadHandler)
    }
    this.deps.updateReflectionStatusUI()
  }
}
