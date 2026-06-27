import type { Player } from '../../../types/game'

/**
 * @file reflection.ts
 * @module ai/reflection
 * @description AI局后反思系统。每局结算后，通过LLM让AI对自己的表现进行反思总结，
 *              更新跨局经验本（成功经验、策略建议、经验教训）。
 *
 * 核心职责：
 *   - triggerAiReflection: 局结算后触发所有AI玩家的反思
 *   - applyMemoryOperations: 对经验本数组执行增删改操作
 *   - updateCrossGameMemory: 更新跨局统计（胜率、盈亏、仓库价值范围等）
 *   - updateReflectionStatusUI: 更新反思状态UI
 *
 * @exports CrossGameMemory - 跨局记忆结构接口
 * @exports applyMemoryOperations / updateCrossGameMemory
 * @exports AiReflectionMixin - 向后兼容的 Mixin 薄包装
 */

import { AudioManager } from "../../audio/audio-manager"
import { MobaoGameHistory } from "./game-history"

// ─── 类型定义 ───

export interface CrossGameMemoryStats {
  totalGames: number
  warehouseValueMax: number
  warehouseValueMin: number
  warehouseValueAvg: number
  winRate: number
  avgProfit: number
  totalCellsMax: number
  totalCellsMin: number
  totalCellsAvg: number
  totalItemsMax: number
  totalItemsMin: number
  totalItemsAvg: number
  legendaryMax: number
  legendaryMin: number
  legendaryAvg: number
  rareMax: number
  rareMin: number
  rareAvg: number
}

export interface CrossGameMemory {
  stats: CrossGameMemoryStats
  lessons: string[]
  strategies: string[]
  praises: string[]
  [key: string]: unknown
}

// ─── 独立函数（可独立测试）───

export function applyMemoryOperations(array: string[], operations: Record<string, unknown>, maxLength: number): void {
  if (!operations || typeof operations !== "object") return

  if (Array.isArray(operations.delete)) {
    const deleteIndices = (operations.delete as number[])
      .filter((idx) => typeof idx === "number" && idx >= 0 && idx < array.length)
      .sort((a, b) => b - a)
    deleteIndices.forEach((idx) => {
      array.splice(idx, 1)
    })
  }

  if (Array.isArray(operations.modify)) {
    (operations.modify as unknown[][]).forEach((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        const idx = item[0] as number
        const newContent = item[1] as string
        if (typeof idx === "number" && idx >= 0 && idx < array.length && typeof newContent === "string") {
          array[idx] = newContent.trim()
        }
      }
    })
  }

  if (Array.isArray(operations.add)) {
    (operations.add as string[]).forEach((content) => {
      if (typeof content === "string" && content.trim() && !array.includes(content.trim())) {
        array.push(content.trim())
      }
    })
  }

  while (array.length > maxLength) {
    array.shift()
  }
}

export function updateCrossGameMemory(
  memory: CrossGameMemory,
  playerId: string,
  record: Record<string, unknown>,
  parsedReflection: Record<string, unknown>
): void {
  if (!memory) return

  if (!memory.stats) {
    memory.stats = {
      totalGames: 0,
      warehouseValueMax: 0, warehouseValueMin: 0, warehouseValueAvg: 0,
      winRate: 0, avgProfit: 0,
      totalCellsMax: 0, totalCellsMin: 0, totalCellsAvg: 0,
      totalItemsMax: 0, totalItemsMin: 0, totalItemsAvg: 0,
      legendaryMax: 0, legendaryMin: 0, legendaryAvg: 0,
      rareMax: 0, rareMin: 0, rareAvg: 0
    }
  }
  if (!memory.lessons) memory.lessons = []
  if (!memory.strategies) memory.strategies = []
  if (!memory.praises) memory.praises = []

  const stats = memory.stats
  const totalGames = stats.totalGames + 1
  const isWinner = record.winnerId === playerId
  const warehouseValue = (record.warehouseValue as number) || 0
  const totalCells = (record.totalCells as number) || 0
  const totalItems = (record.totalItems as number) || 0
  const qualityCounts = (record.qualityCounts as Record<string, number>) || {}
  const legendaryCount = qualityCounts.legendary || 0
  const rareCount = qualityCounts.rare || 0

  let profit = 0
  if (isWinner) {
    profit = (record.winnerProfit as number) || 0
  } else if (record.dividendTicket) {
    const dt = record.dividendTicket as Record<string, unknown>
    if (dt.mechanism === "dividend") {
      profit = (dt.dividendPerPlayer as number) || 0
    } else if (dt.mechanism === "ticket") {
      profit = -((dt.ticketPerPlayer as number) || 0)
    }
  }

  stats.totalGames = totalGames
  stats.winRate = (stats.winRate * (totalGames - 1) + (isWinner ? 1 : 0)) / totalGames
  stats.avgProfit = (stats.avgProfit * (totalGames - 1) + profit) / totalGames

  if (warehouseValue > 0) {
    if (stats.warehouseValueMax === 0 || warehouseValue > stats.warehouseValueMax) stats.warehouseValueMax = warehouseValue
    if (stats.warehouseValueMin === 0 || warehouseValue < stats.warehouseValueMin) stats.warehouseValueMin = warehouseValue
    stats.warehouseValueAvg = (stats.warehouseValueAvg * (totalGames - 1) + warehouseValue) / totalGames
  }

  if (totalCells > 0) {
    if (stats.totalCellsMax === 0 || totalCells > stats.totalCellsMax) stats.totalCellsMax = totalCells
    if (stats.totalCellsMin === 0 || totalCells < stats.totalCellsMin) stats.totalCellsMin = totalCells
    stats.totalCellsAvg = (stats.totalCellsAvg * (totalGames - 1) + totalCells) / totalGames
  }

  if (totalItems > 0) {
    if (stats.totalItemsMax === 0 || totalItems > stats.totalItemsMax) stats.totalItemsMax = totalItems
    if (stats.totalItemsMin === 0 || totalItems < stats.totalItemsMin) stats.totalItemsMin = totalItems
    stats.totalItemsAvg = (stats.totalItemsAvg * (totalGames - 1) + totalItems) / totalGames
  }

  stats.legendaryAvg = (stats.legendaryAvg * (totalGames - 1) + legendaryCount) / totalGames
  if (stats.legendaryMax === 0 || legendaryCount > stats.legendaryMax) stats.legendaryMax = legendaryCount
  if (stats.legendaryMin === 0 || legendaryCount < stats.legendaryMin) stats.legendaryMin = legendaryCount

  stats.rareAvg = (stats.rareAvg * (totalGames - 1) + rareCount) / totalGames
  if (stats.rareMax === 0 || rareCount > stats.rareMax) stats.rareMax = rareCount
  if (stats.rareMin === 0 || rareCount < stats.rareMin) stats.rareMin = rareCount

  applyMemoryOperations(memory.praises, parsedReflection.praises as Record<string, unknown>, 10)
  applyMemoryOperations(memory.strategies, parsedReflection.strategies as Record<string, unknown>, 10)
  applyMemoryOperations(memory.lessons, parsedReflection.lessons as Record<string, unknown>, 10)

  console.log(
    `[updateCrossGameMemory] ${playerId} updated: games=${totalGames}, winRate=${Math.round(stats.winRate * 100)}%, avgProfit=${Math.round(stats.avgProfit)}, praises=${memory.praises.length}, strategies=${memory.strategies.length}, lessons=${memory.lessons.length}`
  )
}

// ─── Mixin 薄包装（向后兼容）───

export const AiReflectionMixin: Record<string, any> = {
  isAiReflectionEnabled(): boolean {
    const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
    return Boolean(settings && settings.reflectionEnabled)
  },

  async triggerAiReflection(record: Record<string, any>): Promise<void> {
    console.log("[triggerAiReflection] called, checking conditions...")
    console.log(
      "[triggerAiReflection] isAiReflectionEnabled:",
      this.isAiReflectionEnabled(),
      "canUseLlmDecision:",
      this.canUseLlmDecision(),
      "llmEverUsedThisRun:",
      this.llmEverUsedThisRun
    )
    if (!this.isAiReflectionEnabled() || !this.canUseLlmDecision() || !this.llmEverUsedThisRun) {
      console.log("[triggerAiReflection] EARLY RETURN: conditions not met")
      return
    }
    this.aiReflectionState = "pending"
    this.aiReflectionStateDetail = ""
    this.aiReflectionCompleted = 0
    this.updateReflectionStatusUI()

    this._reflectionBeforeUnload = () => {
      this.saveAiMemoryToStorage()
    }
    window.addEventListener("beforeunload", this._reflectionBeforeUnload)
    const originalCrossGameMemory = this.aiCrossGameMemory
    const aiPlayers = this.players.filter((p: Player) => !p.isHuman && this.canUseLlmDecisionForPlayer(p.id))
    this.aiReflectionTotal = aiPlayers.length
    this.updateReflectionStatusUI()
    console.log("[triggerAiReflection] aiPlayers count:", aiPlayers.length)
    if (aiPlayers.length === 0) {
      this.aiReflectionState = "done"
      this.updateReflectionStatusUI()
      return
    }
    const failedPlayers: Array<{ playerId: string; playerName: string; reason: string; code?: string; thinkingEnabled?: boolean; exception?: boolean; status?: string }> = []
    const timeoutPlayers: Array<{ playerId: string; playerName: string; reason: string; code?: string; thinkingEnabled?: boolean }> = []
    const reflectionPromises = aiPlayers.map(async (player: { id: string; name: string }) => {
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
      const crossMemory = this.ensureAiCrossGameMemory(player.id)
      const stats = crossMemory.stats || {}
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

      const needsSummary = this.isAiMultiGameMemoryEnabled() &&
        typeof this.shouldGenerateSummary === "function" && this.shouldGenerateSummary()

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
        `品质分布：粗${record.qualityCounts.poor || 0} 良${record.qualityCounts.normal || 0} 精${record.qualityCounts.fine || 0} 珍${record.qualityCounts.rare || 0} 绝${record.qualityCounts.legendary || 0} | 总藏品${record.totalItems || 0}格数${record.totalCells || 0}`,
        "",
        `当前经验书（每类最多${MAX_ENTRIES}条）：`,
        `- 成功经验(${praises.length}/${MAX_ENTRIES}): ${praiseList || "无"}`,
        `- 策略建议(${strategies.length}/${MAX_ENTRIES}): ${strategyList || "无"}`,
        `- 经验教训(${lessons.length}/${MAX_ENTRIES}): ${lessonList || "无"}`,
        statsInfo ? `\n${statsInfo}` : ""
      ]

      try {
        const llmProvider = this.getLlmProvider()
        console.log("[triggerAiReflection] llmProvider:", llmProvider ? llmProvider.id : "null")
        if (!llmProvider) {
          failedPlayers.push({ playerId: player.id, playerName: player.name, reason: "无LLM Provider" })
          console.log("[triggerAiReflection] FAILED: no llmProvider for player:", player.id)
          return { playerId: player.id, reflection: null, error: "无LLM Provider" }
        }
        let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : null
        const reflectionScope = (settings && settings.reflectionScope) || "current"
        if (reflectionScope === "full" && MobaoGameHistory) {
          const historyContext = MobaoGameHistory.buildReflectionContext(
            player.id, "full", null, this.isLanMode
          )
          if (historyContext) {
            reflectionPrompt.push("", historyContext)
          }
        }
        if (needsSummary && reflectionScope !== "full" && MobaoGameHistory) {
          const historyContext = MobaoGameHistory.buildReflectionContext(
            player.id, "full", null, this.isLanMode
          )
          if (historyContext) {
            reflectionPrompt.push("", "【多局历史（用于总结）】", historyContext)
          }
        }
        const reflectionPromptText = reflectionPrompt.join("\n")
        const independentReflectionEnabled =
          settings && settings.independentReflectionEnabled !== undefined
            ? settings.independentReflectionEnabled
            : true
        console.log("[triggerAiReflection] independentReflectionEnabled:", independentReflectionEnabled)
        if (independentReflectionEnabled && typeof this.getAiModelConfigForPlayer === "function") {
          const aiModelConfig = this.getAiModelConfigForPlayer(player.id)
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
              apiKey: aiModelConfig.apiKey || settings.apiKey,
              endpoint: aiModelConfig.endpoint || settings.endpoint,
              model: aiModelConfig.model || settings.model,
              maxTokens: aiModelConfig.maxTokens || settings.maxTokens,
              timeoutMs: aiModelConfig.timeoutMs || settings.timeoutMs,
              thinkingEnabled:
                aiModelConfig.thinkingEnabled !== undefined ? aiModelConfig.thinkingEnabled : settings.thinkingEnabled
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

        const playerCache = this.aiConversationCache && this.aiConversationCache[player.id]
        let messages
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

          // LLM 响应结构不确定，lessons/strategies 内容因模型输出而异
          // 使用 unknown[] 强制调用者做类型检查后再使用
          let parsedReflection: { lessons: unknown[]; strategies: unknown[]; summary?: string } = { lessons: [], strategies: [] }
          try {
            const jsonMatch = reflectionText.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              parsedReflection = JSON.parse(jsonMatch[0])
            }
          } catch (e) {
            console.warn("[triggerAiReflection] failed to parse reflection JSON:", e)
          }

          if (this.isAiMultiGameMemoryEnabled()) {
            this.updateCrossGameMemory(player.id, record, parsedReflection)
            if (needsSummary && parsedReflection.summary) {
              this.pendingNextRunAiSummaryByPlayer[player.id] = parsedReflection.summary
              if (typeof this.clearGameHistoryForPlayer === "function") {
                this.clearGameHistoryForPlayer(player.id)
              }
              if (this.aiCrossGameMessagesByPlayer) {
                this.aiCrossGameMessagesByPlayer[player.id] = []
              }
            }
            if (this.aiCrossGameMemory !== originalCrossGameMemory) {
              Object.keys(originalCrossGameMemory).forEach((pid) => {
                if (!this.aiCrossGameMemory[pid]) {
                  this.aiCrossGameMemory[pid] = originalCrossGameMemory[pid]
                }
              })
              this.aiCrossGameMemory[player.id] = originalCrossGameMemory[player.id] || this.aiCrossGameMemory[player.id]
            }
            this.saveAiMemoryToStorage()
          } else {
            const existing = this.pendingNextRunAiSummaryByPlayer[player.id] || ""
            this.pendingNextRunAiSummaryByPlayer[player.id] = existing + ` 【${player.name}反思】${reflectionText.slice(0, 200)}`
            this.saveAiMemoryToStorage()
          }

          if (this.currentRunLog && Array.isArray(this.currentRunLog.aiThoughtLogs)) {
            this.currentRunLog.aiThoughtLogs.push({
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
            if (this.currentRunLog.aiThoughtLogs.length > 80) {
              this.currentRunLog.aiThoughtLogs = this.currentRunLog.aiThoughtLogs.slice(-80)
            }
            this.renderAiThoughtLog()
          }

          return { playerId: player.id, reflection: reflectionText, cacheHitTokens, cacheMissTokens, cacheHitRate }
        }
        this.aiReflectionCompleted++
        this.updateReflectionStatusUI()
        if (result.code === "TIMEOUT") {
          timeoutPlayers.push({
            playerId: player.id,
            playerName: player.name,
            reason: `超时(${timeoutMs}ms)`,
            thinkingEnabled
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
          const statusCode = result.status || ""
          failedPlayers.push({
            playerId: player.id,
            playerName: player.name,
            reason: errorDetail,
            code: result.code,
            status: statusCode,
            thinkingEnabled
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
        this.aiReflectionCompleted++
        this.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: result.error || result.code }
      } catch (err) {
        const errMsg = err && (err as Error).message ? (err as Error).message : "异常"
        failedPlayers.push({ playerId: player.id, playerName: player.name, reason: errMsg, exception: true })
        console.log("[triggerAiReflection] EXCEPTION for player:", player.id, "error:", errMsg)
        this.aiReflectionCompleted++
        this.updateReflectionStatusUI()
        return { playerId: player.id, reflection: null, error: errMsg }
      }
    })
    if (this.pendingSettlementSummary && this.aiCrossGameMessagesByPlayer) {
      this.players.filter((p: Player) => !p.isHuman).forEach((p: Player) => {
        const messages = this.aiCrossGameMessagesByPlayer[p.id]
        if (Array.isArray(messages) && messages.length > 0) {
          const lastGame = messages[messages.length - 1]
          if (Array.isArray(lastGame)) {
            lastGame.push({ role: "user", content: this.pendingSettlementSummary })
          }
        }
      })
      this.pendingSettlementSummary = ""
      this.saveAiMemoryToStorage()
    }
    await Promise.all(reflectionPromises)
    if (timeoutPlayers.length > 0) {
      this.aiReflectionState = "timeout"
      const timeoutInfo = timeoutPlayers
        .map((p) => `${p.playerName}(${p.reason}${p.thinkingEnabled ? ",思考模式" : ""})`)
        .join("; ")
      this.aiReflectionStateDetail = timeoutInfo
      console.log("[triggerAiReflection] TIMEOUT players:", timeoutInfo)
    } else if (failedPlayers.length > 0) {
      this.aiReflectionState = "error"
      const failedInfo = failedPlayers
        .map(
          (p) => `${p.playerName}(${p.reason}${p.code ? `,${p.code}` : ""}${p.thinkingEnabled ? ",思考模式" : ""})`
        )
        .join("; ")
      this.aiReflectionStateDetail = failedInfo
      console.log("[triggerAiReflection] FAILED players:", failedInfo)
    } else {
      this.aiReflectionState = "done"
      this.aiReflectionStateDetail = ""
    }
    if (this._reflectionBeforeUnload) {
      window.removeEventListener("beforeunload", this._reflectionBeforeUnload)
      this._reflectionBeforeUnload = null
    }
    this.updateReflectionStatusUI()
  },

  applyMemoryOperations(array: string[], operations: Record<string, unknown>, maxLength: number): void {
    applyMemoryOperations(array, operations, maxLength)
  },

  updateCrossGameMemory(playerId: string, record: Record<string, unknown>, parsedReflection: Record<string, unknown>): void {
    const memory = this.ensureAiCrossGameMemory(playerId)
    if (!memory) return
    updateCrossGameMemory(memory, playerId, record, parsedReflection)
    this.saveAiMemoryToStorage()
  },

  shouldShowReflectionUI(): boolean {
    return this.isAiReflectionEnabled() && this.canUseLlmDecision() && this.llmEverUsedThisRun
  },

  updateReflectionStatusUI(): void {
    const el = this.dom.settleReflectionStatus
    if (!el) return
    if (!this.shouldShowReflectionUI()) {
      el.classList.add("hidden")
      el.textContent = ""
      el.className = "settle-reflection-status hidden"
      return
    }
    el.classList.remove("hidden", "is-pending", "is-done", "is-timeout", "is-error")
    const detail = this.aiReflectionStateDetail || ""
    const needsSummary = this.isAiMultiGameMemoryEnabled() &&
      typeof this.shouldGenerateSummary === "function" && this.shouldGenerateSummary()
    const summaryLabel = needsSummary ? "并总结" : ""
    const progress = this.aiReflectionTotal > 1 ? ` ${this.aiReflectionCompleted}/${this.aiReflectionTotal}` : ""
    switch (this.aiReflectionState) {
      case "pending":
        el.classList.add("is-pending")
        el.textContent = `反思${summaryLabel}中${progress}...`
        break
      case "done":
        el.classList.add("is-done")
        el.textContent = `反思${summaryLabel}完成`
        break
      case "timeout":
        el.classList.add("is-timeout")
        el.textContent = `反思${summaryLabel}超时: ${detail}`
        break
      case "error":
        el.classList.add("is-error")
        el.textContent = `反思${summaryLabel}失败: ${detail}`
        break
      default:
        el.classList.add("hidden")
        break
    }
  },

  showReflectionPendingDialog() {
    this.removeReflectionPendingDialog()
    const needsSummary = this.isAiMultiGameMemoryEnabled() &&
      typeof this.shouldGenerateSummary === "function" && this.shouldGenerateSummary()
    const actionLabel = needsSummary ? "反思并总结" : "反思"
    const overlay = document.createElement("div")
    overlay.id = "reflectionPendingDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;"
    box.innerHTML =
      `<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI${actionLabel}尚未完成</div>` +
      `<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行${actionLabel}，已完成的结果已保存，未完成的将丢失。</div>` +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
      '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">继续游戏</button>' +
      "</div>"
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const waitBtn = document.getElementById("reflectionDialogWait")
    if (waitBtn) {
      waitBtn.addEventListener("click", () => {
        this.removeReflectionPendingDialog()
      })
    }
    const skipBtn = document.getElementById("reflectionDialogSkip")
    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        this.removeReflectionPendingDialog()
        this.proceedToNewRun()
      })
    }
  },

  showReflectionPendingDialogForBack() {
    this.removeReflectionPendingDialog()
    const needsSummary = this.isAiMultiGameMemoryEnabled() &&
      typeof this.shouldGenerateSummary === "function" && this.shouldGenerateSummary()
    const actionLabel = needsSummary ? "反思并总结" : "反思"
    const overlay = document.createElement("div")
    overlay.id = "reflectionPendingDialog"
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;"
    const box = document.createElement("div")
    box.style.cssText =
      "background:#2a2218;border:2px solid #d4a843;border-radius:12px;padding:24px 32px;text-align:center;color:#e0d0b0;font-size:16px;max-width:380px;"
    box.innerHTML =
      `<div style="margin-bottom:12px;font-size:18px;font-weight:bold;">AI${actionLabel}尚未完成</div>` +
      `<div style="color:#a09070;margin-bottom:16px;">AI正在对本局表现进行${actionLabel}，已完成的结果已保存，未完成的将丢失。</div>` +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button id="reflectionDialogWait" style="padding:8px 20px;border-radius:6px;border:1px solid #d4a843;background:rgba(212,168,67,0.15);color:#d4a843;cursor:pointer;font-size:14px;">等待完成</button>' +
      '<button id="reflectionDialogSkip" style="padding:8px 20px;border-radius:6px;border:1px solid #8a6a4a;background:rgba(138,106,74,0.15);color:#a09070;cursor:pointer;font-size:14px;">直接离开</button>' +
      "</div>"
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const waitBtn = document.getElementById("reflectionDialogWait")
    if (waitBtn) {
      waitBtn.addEventListener("click", () => {
        this.removeReflectionPendingDialog()
      })
    }
    const skipBtn = document.getElementById("reflectionDialogSkip")
    if (skipBtn) {
      skipBtn.addEventListener("click", () => {
        this.removeReflectionPendingDialog()
        this.proceedToBack()
      })
    }
  },

  proceedToBack() {
    this.exitSettlementPage()
    if (this.battleRecordReplayActive) {
      this.battleRecordReplayActive = false
      this.battleRecordReplayRecordId = null
      this.enterLobby()
      setTimeout(() => {
        this.openBattleRecordPanel()
        this.writeLog("已返回战绩列表，可继续选择其他战绩回放。")
      }, 100)
      return
    }
    if (this.isLanMode) {
      this.enterLanRoom()
    } else {
      this.enterLobby()
    }
  },

  removeReflectionPendingDialog() {
    const el = document.getElementById("reflectionPendingDialog")
    if (el) el.remove()
  },

  proceedToNewRun(): void {
    this.exitSettlementPage()
    this.startNewRun()
    if (typeof AudioManager !== "undefined") {
      AudioManager.resumeBgm()
    }
  }
}
