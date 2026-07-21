/**
 * @file scripts/llm/core/decision/request.ts
 * @module llm/core/decision/request
 * @description LLM 决策请求方法。发起 LLM 请求、构建 prompt/messages、
 *              解析响应为动作计划、处理请求错误和降级到规则 AI。
 *
 * @requires ../prompts - LLM_DECISION_SYSTEM_PROMPT
 * @requires ../llm-error - parseLlmError, showAiErrorToast, setPlayerLlmError
 * @requires ./pure - canUseLlmDecisionCore, isValidAiModelConfig, getAiIndexFromPlayerId
 * @requires ./types - LlmDecisionDeps
 * @exports createLlmRequestMethods - 工厂函数，返回请求相关方法
 */
import { LLM_DECISION_SYSTEM_PROMPT } from "../prompts.js"
import { parseLlmError, showAiErrorToast, setPlayerLlmError } from "../llm-error.js"
import type { Player } from "../../../../types/game"
import type { AiModelConfig, LlmPlanResult } from "../../../../types/llm"
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { LlmDecisionDeps } from "./types"
import { canUseLlmDecisionCore, isValidAiModelConfig, getAiIndexFromPlayerId } from "./pure"

export function createLlmRequestMethods(deps: LlmDecisionDeps) {
  const { GAME_SETTINGS, LLM_SETTINGS } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    canUseLlmDecision(): boolean {
      const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      const nativeBridge =
        (window as unknown as Record<string, { getServerUrl?: () => string } | undefined>).NativeBridge || null
      const result = canUseLlmDecisionCore(settings, provider, nativeBridge)
      if (!result) {
        console.log(
          "[canUseLlmDecision] false: settings=",
          settings ? { enabled: settings.enabled } : "null",
          "provider=",
          provider ? provider.id : "null"
        )
      }
      return result
    },

    isAiLlmEnabledForPlayer(playerId: string): boolean {
      if (!this.aiLlmPlayerEnabled || typeof this.aiLlmPlayerEnabled !== "object") {
        console.log(`[isAiLlmEnabledForPlayer] ${playerId} false: aiLlmPlayerEnabled is null or not object`)
        return false
      }
      const enabled = Boolean(this.aiLlmPlayerEnabled[playerId])
      console.log(`[isAiLlmEnabledForPlayer] ${playerId} = ${enabled}, allEnabled:`, this.aiLlmPlayerEnabled)
      return enabled
    },

    canUseLlmDecisionForPlayer(playerId: string): boolean {
      const isHumanPlayer = this.players.some((p) => p.id === playerId && p.isHuman)
      if (isHumanPlayer && this.autoplayManager?.isActive()) return this.canUseLlmDecision()
      return this.canUseLlmDecision() && this.isAiLlmEnabledForPlayer(playerId)
    },

    getAiModelConfigForPlayer(playerId: string): AiModelConfig | null {
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      console.log(
        "[getAiModelConfigForPlayer] playerId:",
        playerId,
        "settings.independentModelEnabled:",
        settings ? settings.independentModelEnabled : "no settings"
      )
      if (!settings || !settings.independentModelEnabled) {
        console.log("[getAiModelConfigForPlayer] independentModelEnabled is false, returning null")
        return null
      }
      const aiIndex = this.getAiIndexFromPlayerId(playerId)
      if (aiIndex < 0 || aiIndex > 2) {
        console.log("[getAiModelConfigForPlayer] invalid aiIndex:", aiIndex, "returning null")
        return null
      }
      if (typeof this.getAiModelConfig === "function") {
        const config = this.getAiModelConfig(aiIndex)
        console.log(
          "[getAiModelConfigForPlayer] got config for aiIndex",
          aiIndex,
          ":",
          config
            ? { apiKey: config.apiKey ? "(已设置)" : "(空)", endpoint: config.endpoint, model: config.model }
            : null
        )
        if (!isValidAiModelConfig(config)) {
          console.log("[getAiModelConfigForPlayer] config is invalid (missing apiKey or model), returning null")
          return null
        }
        return config
      }
      console.log("[getAiModelConfigForPlayer] getAiModelConfig not available, returning null")
      return null
    },

    getAiIndexFromPlayerId(playerId: string): number {
      return getAiIndexFromPlayerId(playerId)
    },

    async requestAiLlmPlan(player: Player, options: Record<string, unknown> = {}): Promise<LlmPlanResult | null> {
      const requestStartTime = Date.now()
      const batchId = String(options.batchId || "solo")
      const batchStartTime = Number(options.batchStartTime || requestStartTime)
      const requestId = `${player.id}-${requestStartTime}`
      console.log(
        `[requestAiLlmPlan] ${requestId} START, player: ${player.id}, batchId: ${batchId}, delay from batch start: ${requestStartTime - batchStartTime}ms`
      )

      const requestStage = String(options.requestStage || "initial")
      const isFirstRound = requestStage === "initial" && Number(this.round) === 1

      let payload: Record<string, unknown>
      if (requestStage === "followup-after-tool") {
        payload = this.buildAiFollowupRoundPayload(
          player,
          (options.followupContext || {}) as Record<string, unknown>,
          String(options.followupToolSummary || "")
        ) as Record<string, unknown>
      } else if (isFirstRound) {
        payload = this.buildAiLlmRoundPayload(player) as Record<string, unknown>
      } else {
        payload = this.buildAiIncrementalPayload(player) as Record<string, unknown>
      }

      const firstRoundBlocks =
        isFirstRound && typeof this.aiMemoryManager.getAiFirstRoundExtraBlocks === "function"
          ? this.aiMemoryManager.getAiFirstRoundExtraBlocks(player.id)
          : []
      const mergedExtraBlocks = [
        ...(Array.isArray(firstRoundBlocks) ? firstRoundBlocks : []),
        ...(Array.isArray(options.extraBlocks) ? options.extraBlocks : [])
      ]

      const userPrompt = this.buildAiDecisionUserPrompt(payload, mergedExtraBlocks, {
        requestStage,
        isFirstRound
      })
      const systemPrompt = LLM_DECISION_SYSTEM_PROMPT
      const useMultiGameMemory =
        typeof this.aiMemoryManager.isAiMultiGameMemoryEnabled === "function" ? this.aiMemoryManager.isAiMultiGameMemoryEnabled() : false
      const historyMessages: Array<Record<string, unknown>> =
        useMultiGameMemory && typeof this.aiMemoryManager.getAiConversationMessages === "function"
          ? (this.aiMemoryManager.getAiConversationMessages(player.id) as unknown as Array<Record<string, unknown>>)
          : []
      let crossGameMemoryCount = 0
      let inGameHistoryCount = 0
      if (useMultiGameMemory) {
        if (typeof this.aiMemoryManager.getAiCrossGameMemoryCount === "function") {
          crossGameMemoryCount = this.aiMemoryManager.getAiCrossGameMemoryCount(player.id)
        }
        if (typeof this.aiMemoryManager.getAiInGameHistoryCount === "function") {
          inGameHistoryCount = this.aiMemoryManager.getAiInGameHistoryCount(player.id)
        }
      }

      if (!this.aiConversationCache) {
        this.aiConversationCache = {}
      }
      const isNewGame = requestStage === "initial" && Number(this.round) === 1
      if (isNewGame) {
        this.aiConversationCache[player.id] = null
      }
      const playerCache = this.aiConversationCache[player.id]
      let messages: Array<Record<string, unknown>>
      if (playerCache) {
        const incrementalMessages: Array<Record<string, unknown>> = []
        if (payload && payload.lastRoundResult) {
          incrementalMessages.push({
            role: "user",
            content: "【上一轮结算】\n" + JSON.stringify(payload.lastRoundResult, null, 2)
          })
        }
        if (payload && payload.round) {
          incrementalMessages.push({
            role: "user",
            content: "【轮次信息】\n" + JSON.stringify(payload.round, null, 2)
          })
        }
        const gameState: Record<string, unknown> =
          payload && payload.gameState
            ? (payload.gameState as Record<string, unknown>)
            : {
              currentWallet: payload && payload.currentWallet,
              currentLeader: payload && payload.currentLeader,
              currentBid: payload && payload.currentBid
            }
        if (
          gameState &&
          (gameState.currentWallet !== undefined ||
            gameState.currentLeader !== undefined ||
            gameState.currentBid !== undefined)
        ) {
          incrementalMessages.push({
            role: "user",
            content: "【游戏状态】\n" + JSON.stringify(gameState, null, 2)
          })
        }
        if (payload && payload.selfAvailableTools) {
          incrementalMessages.push({
            role: "user",
            content: "【可用工具】\n" + JSON.stringify(payload.selfAvailableTools, null, 2)
          })
        }
        if (payload && payload.privateIntel) {
          incrementalMessages.push({
            role: "user",
            content: "【私人情报】\n" + JSON.stringify(payload.privateIntel, null, 2)
          })
        }
        if (payload && payload.actionConstraints) {
          incrementalMessages.push({
            role: "user",
            content: "【行动约束】\n" + JSON.stringify(payload.actionConstraints, null, 2)
          })
        }
        const gs = gameState as Record<string, unknown>
        const roundInfo = (gs.round || payload.round) as Record<string, unknown> | undefined
        const roundNoRaw = roundInfo && roundInfo.current ? roundInfo.current : this.round
        const totalRoundRaw = roundInfo && roundInfo.total ? roundInfo.total : GAME_SETTINGS.maxRounds
        const roundNo = Number.isFinite(Number(roundNoRaw))
          ? Math.max(1, Math.round(Number(roundNoRaw)))
          : Math.max(1, this.round)
        const totalRounds = Number.isFinite(Number(totalRoundRaw))
          ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
          : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
        const isFinalRound = roundNo >= totalRounds
        const roundStateText = isFinalRound ? "最终轮" : "后续轮"
        const finalRoundHint = isFinalRound
          ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
          : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"
        const taskContent = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint
        ].join("\n")
        incrementalMessages.push({ role: "user", content: taskContent })
        if (Array.isArray(options.extraBlocks) && options.extraBlocks.length > 0) {
          options.extraBlocks.forEach((block: Record<string, unknown>) => {
            incrementalMessages.push({
              role: "user",
              content: String(block || "")
            })
          })
        }
        messages = [
          ...(Array.isArray(playerCache) ? (playerCache as Array<Record<string, unknown>>) : []),
          ...incrementalMessages
        ]
      } else {
        messages = this.buildAiDecisionMessages(payload, {
          requestStage,
          isFirstRound,
          systemPrompt,
          historyMessages,
          extraBlocks: Array.isArray(options.extraBlocks) ? options.extraBlocks : []
        }) as Array<Record<string, unknown>>
      }

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        console.log("[requestAiLlmPlan] provider:", provider ? provider.id : null)
        if (!provider) {
          console.log("[requestAiLlmPlan] ERROR: provider is null")
          return {
            source: "llm",
            bid: 0,
            folded: false,
            hasBidDecision: false,
            target: "",
            thought: "",
            rawSkill: "",
            rawItem: "",
            rawContent: "",
            failed: true,
            error: "LLM Provider 未初始化",
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: ""
          }
        }
        let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
        console.log("[requestAiLlmPlan] base settings:", {
          enabled: settings.enabled,
          apiKey: settings.apiKey ? "(已设置)" : "(空)",
          endpoint: settings.endpoint,
          model: settings.model
        })
        console.log("[requestAiLlmPlan] about to call getAiModelConfigForPlayer, player.id:", player.id)
        try {
          const aiModelConfig = this.getAiModelConfigForPlayer(player.id)
          console.log(
            "[requestAiLlmPlan] aiModelConfig:",
            aiModelConfig
              ? {
                apiKey: aiModelConfig.apiKey ? "(已设置)" : "(空)",
                endpoint: aiModelConfig.endpoint,
                model: aiModelConfig.model
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
            console.log("[requestAiLlmPlan] merged settings:", {
              apiKey: settings.apiKey ? "(已设置)" : "(空)",
              endpoint: settings.endpoint,
              model: settings.model
            })
          }
        } catch (e) {
          console.error("[requestAiLlmPlan] getAiModelConfigForPlayer error:", e)
        }
        const requestTimeoutMs = Math.max(3000, Math.round((Number(GAME_SETTINGS.roundSeconds) || 40) * 1000))
        const isNativeEnv = !!(
          (window as unknown as Record<string, { llmProxyAsync?: (...args: unknown[]) => Promise<unknown> }>)
            .NativeBridge &&
          (window as unknown as Record<string, { llmProxyAsync?: (...args: unknown[]) => Promise<unknown> }>)
            .NativeBridge.llmProxyAsync
        )
        const isFlashModel = /deepseek.*flash|qwen.*turbo|glm.*flash|gpt-3\.5|gpt-4o-mini/i.test(settings.model || "")
        let baseTokens = Number(settings.maxTokens) || 600
        if (isNativeEnv && isFlashModel && baseTokens < 1500) {
          baseTokens = 1500
        }
        const requestMaxTokens = Math.max(300, baseTokens)
        const chatStartTime = Date.now()
        console.log(
          `[requestAiLlmPlan] ${requestId} CALLING requestChat, model: ${settings.model}, elapsed so far: ${chatStartTime - requestStartTime}ms`
        )
        console.log(
          `[requestAiLlmPlan] ${requestId} messages count: ${messages.length}, historyMessages count: ${historyMessages.length}, crossGameMemoryCount: ${crossGameMemoryCount}`
        )
        if (!provider.requestChat) {
          console.log("[requestAiLlmPlan] ERROR: provider.requestChat is undefined")
          return {
            source: "llm",
            bid: 0,
            folded: false,
            hasBidDecision: false,
            target: "",
            thought: "",
            rawSkill: "",
            rawItem: "",
            rawContent: "",
            failed: true,
            error: "LLM Provider requestChat 方法未初始化",
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: ""
          }
        }
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: requestMaxTokens,
          timeoutMs: requestTimeoutMs,
          messages,
          settings,
          isThinking: settings.thinkingEnabled || false,
          _playerId: player.id,
          _playerName: player.name
        })
        const chatEndTime = Date.now()
        const chatElapsed = chatEndTime - chatStartTime
        console.log(
          `[requestAiLlmPlan] ${requestId} requestChat DONE, ok: ${result.ok}, elapsed: ${chatElapsed}ms, total: ${chatEndTime - requestStartTime}ms`
        )

        const usage = result && result.usage ? result.usage : undefined
        const cacheHitTokens = usage && usage.prompt_cache_hit_tokens ? usage.prompt_cache_hit_tokens : 0
        const cacheMissTokens = usage && usage.prompt_cache_miss_tokens ? usage.prompt_cache_miss_tokens : 0
        const totalPromptTokens = cacheHitTokens + cacheMissTokens
        const cacheHitRate = totalPromptTokens > 0 ? Math.round((cacheHitTokens / totalPromptTokens) * 100) : 0
        if (cacheHitTokens > 0 || cacheMissTokens > 0) {
          console.log(
            `[requestAiLlmPlan] ${requestId} cache: hit=${cacheHitTokens}, miss=${cacheMissTokens}, rate=${cacheHitRate}%`
          )
        }

        if (!result.ok) {
          const detail = result && result.meta ? result.meta : {}
          const errorPieces = [
            result.error || "请求失败",
            result.code ? `code=${result.code}` : "",
            result.stage ? `stage=${result.stage}` : "",
            detail.endpoint ? `endpoint=${detail.endpoint}` : "",
            detail.model ? `model=${detail.model}` : "",
            detail.timeoutMs ? `timeout=${detail.timeoutMs}ms` : "",
            result.requestId ? `req=${result.requestId}` : "",
            detail.hint ? `hint=${detail.hint}` : ""
          ].filter(Boolean)
          const errorMessage = errorPieces.join(" | ")
          setPlayerLlmError(this, player.id, errorMessage, result.code || "")
          showAiErrorToast(player.name, parseLlmError(errorMessage, result.code || "").brief)
          return {
            source: "llm",
            bid: 0,
            folded: false,
            hasBidDecision: false,
            target: "",
            thought: "",
            rawSkill: "",
            rawItem: "",
            rawContent: "",
            failed: true,
            error: errorMessage,
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: String(result.error || ""),
            cacheHitTokens: 0,
            cacheMissTokens: 0,
            cacheHitRate: 0,
            usage: undefined
          }
        }

        const responseText = String(result.content || "")
        const reasoningContent = String(result.reasoningContent || "")
        const rawFinish =
          result.raw && result.raw.choices && result.raw.choices[0] ? result.raw.choices[0].finish_reason : ""
        if (!responseText.trim() && !reasoningContent.trim()) {
          const isEmpty =
            rawFinish === "length"
              ? "模型输出被截断，未生成有效内容。请增大最大输出Token数。"
              : "模型返回为空，未生成有效内容。请检查模型配置和Token限制。"
          setPlayerLlmError(this, player.id, isEmpty, "EMPTY_RESPONSE")
          showAiErrorToast(player.name, parseLlmError(isEmpty, "EMPTY_RESPONSE").brief)
          return {
            source: "llm",
            bid: 0,
            folded: false,
            hasBidDecision: false,
            target: "",
            thought: "",
            rawSkill: "",
            rawItem: "",
            rawContent: "",
            failed: true,
            error: isEmpty,
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: "",
            cacheHitTokens: 0,
            cacheMissTokens: 0,
            cacheHitRate: 0,
            usage: undefined
          }
        }
        if (!responseText.trim() && reasoningContent.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出Token不足，请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.aiDecisionManager.writeLog(`${player.name}：输出Token不足，已尝试从思维链提取决策。`)
        }
        let decision = this.extractAiDecisionObject(responseText)
        const hasValidBid = decision && Number.isFinite(Number(decision.bid)) && Number(decision.bid) > 0
        const hasValidAction =
          (decision &&
            decision.skill &&
            String(decision.skill).trim() !== "无" &&
            String(decision.skill).trim() !== "") ||
          (decision && decision.item && String(decision.item).trim() !== "无" && String(decision.item).trim() !== "")
        if (!hasValidBid && !hasValidAction && reasoningContent) {
          const fallbackDecision = this.extractAiDecisionObject(reasoningContent)
          if (fallbackDecision && Number.isFinite(Number(fallbackDecision.bid)) && Number(fallbackDecision.bid) > 0) {
            decision = fallbackDecision
            if (typeof this.aiDecisionManager.writeLog === "function") {
              this.aiDecisionManager.writeLog(`${player.name}：从思维链中提取到决策，出价${fallbackDecision.bid}`)
            }
          }
        }
        const plan: LlmPlanResult = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: options.allowAction !== false
        }) as LlmPlanResult
        if (rawFinish === "length" && responseText.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出被截断，请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.aiDecisionManager.writeLog(`${player.name}：输出被截断，决策可能不完整。`)
        }
        if (useMultiGameMemory && requestStage === "initial" && typeof this.aiMemoryManager.pushAiRoundSummary === "function") {
          this.aiMemoryManager.pushAiRoundSummary(player.id, plan as unknown as Record<string, unknown>)
        }
        plan.elapsedMs = result.elapsedMs
        plan.model = result.model || ""
        plan.configuredModel = settings.model || ""
        plan.systemPrompt = playerCache ? "" : systemPrompt
        plan.userPrompt = userPrompt
        plan.modelResponse = responseText
        plan.reasoningContent = reasoningContent
        plan.requestStage = requestStage
        plan.historyMessagesCount = historyMessages.length
        plan.crossGameMemoryCount = crossGameMemoryCount
        plan.inGameHistoryCount = inGameHistoryCount
        plan.historyMessagesPreview = historyMessages
          .map((m: Record<string, unknown>) => String(m.content || "").slice(0, 80))
          .join(" | ")
        plan.crossGameMemoryText =
          !playerCache && useMultiGameMemory && crossGameMemoryCount > 0
            ? String(historyMessages[0]?.content || "")
            : ""
        plan.cacheHitTokens = cacheHitTokens
        plan.cacheMissTokens = cacheMissTokens
        plan.cacheHitRate = cacheHitRate
        plan.usage = usage as typeof plan.usage

        if (
          plan.model &&
          plan.configuredModel &&
          plan.configuredModel.toLowerCase() !== "auto" &&
          plan.model !== plan.configuredModel
        ) {
          setPlayerLlmError(
            this,
            player.id,
            `模型不一致：请求"${plan.configuredModel}"，实际"${plan.model}"。服务端可能已替换模型。`,
            "MODEL_MISMATCH",
            "warning"
          )
          this.aiDecisionManager.writeLog(`${player.name}：模型不一致，请求=${plan.configuredModel} 实际=${plan.model}`)
        }

        this.aiConversationCache[player.id] = [...messages, { role: "assistant", content: responseText }]
        return plan
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : "LLM请求异常"
        setPlayerLlmError(this, player.id, message, "EXCEPTION")
        showAiErrorToast(player.name, parseLlmError(message, "EXCEPTION").brief)
        return {
          source: "llm",
          bid: 0,
          folded: false,
          hasBidDecision: false,
          target: "",
          thought: "",
          rawSkill: "",
          rawItem: "",
          rawContent: "",
          failed: true,
          error: message,
          actionType: "none",
          actionId: "none",
          systemPrompt,
          userPrompt,
          modelResponse: "",
          cacheHitTokens: 0,
          cacheMissTokens: 0,
          cacheHitRate: 0,
          usage: undefined
        }
      }
    },

    async requestAiLlmFollowupBid(
      player: Player,
      currentPlan: LlmPlanResult | null,
      toolSummary: string
    ): Promise<LlmPlanResult | null> {
      const { isNoneActionText, compactOneLine } = deps
      const trackHint = String(toolSummary || "").includes("tracks=")
        ? "若 tracks=none，代表本次探查未直接命中高价值追踪目标，不要把它写成已确认。"
        : ""
      const followupBlock = `你刚执行的探查结果如下，请在保留合法动作约束下重新给出最终出价：${toolSummary}${trackHint ? ` | ${trackHint}` : ""}`
      const followupPlan = await this.requestAiLlmPlan(player, {
        requestStage: "followup-after-tool",
        allowAction: false,
        followupToolSummary: toolSummary,
        followupContext: {
          toolActionType:
            currentPlan && currentPlan.toolActionType
              ? currentPlan.toolActionType
              : currentPlan && currentPlan.actionType
                ? currentPlan.actionType
                : "none",
          toolActionId:
            currentPlan && currentPlan.toolActionId
              ? currentPlan.toolActionId
              : currentPlan && currentPlan.actionId
                ? currentPlan.actionId
                : "none",
          bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
          actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
          actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none",
          thought: currentPlan && currentPlan.thought ? currentPlan.thought : "",
          modelResponse: currentPlan && currentPlan.modelResponse ? currentPlan.modelResponse : ""
        },
        extraBlocks: [followupBlock]
      })

      if (followupPlan && (followupPlan.rawSkill || followupPlan.rawItem)) {
        const illegalSkill = !isNoneActionText(followupPlan.rawSkill || "") && followupPlan.rawSkill
        const illegalItem = !isNoneActionText(followupPlan.rawItem || "") && followupPlan.rawItem
        if (illegalSkill || illegalItem) {
          followupPlan.followupActionRejected = compactOneLine(
            `二次调用声明了额外动作，已按规则忽略：skill=${illegalSkill || "无"}, item=${illegalItem || "无"}`,
            160
          )
        }
      }

      return followupPlan as LlmPlanResult | null
    }
  }

  return methods
}
