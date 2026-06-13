/**
 * @file llm/core/llm-decision.js
 * @module llm/core/llm-decision
 * @description LLM 决策流程模块。负责 LLM 请求、追问、纠错、批量决策、遥测、面板渲染。
 *              从 scene-llm.js 拆分而来。
 */
import { LLM_DECISION_SYSTEM_PROMPT } from './prompts.js'
import { parseLlmError, showAiErrorToast, setPlayerLlmError, clearPlayerLlmErrors } from './llm-error.js'

export function createLlmDecisionModule(deps: any) {
  const {
    GAME_SETTINGS,
    LLM_SETTINGS,
    isNoneActionText,
    compactOneLine,
    formatBidRevealNumber,
    indentMultiline,
    compactPanelText
  } = deps

  const methods = {
    canUseLlmDecision(): boolean {
      const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      if (!settings || !settings.enabled || !provider) {
        console.log(
          "[canUseLlmDecision] false: settings=",
          settings ? { enabled: settings.enabled } : "null",
          "provider=",
          provider ? provider.id : "null"
        )
        return false
      }
      const hasApiKey = typeof settings.apiKey === "string" && settings.apiKey.trim().length > 0
      if (hasApiKey) {
        return true
      }
      const endpoint = typeof settings.endpoint === "string" ? settings.endpoint.trim() : ""
      const isProxyEndpoint = endpoint.length > 0 && endpoint.startsWith("/")
      const isNative = !!((window as any).NativeBridge && (window as any).NativeBridge.getServerUrl)
      if (isProxyEndpoint && !isNative) {
        return true
      }
      console.log(
        "[canUseLlmDecision] false: no apiKey and not proxy endpoint on desktop, endpoint:",
        endpoint,
        "isNative:",
        isNative
      )
      return false
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
      return this.canUseLlmDecision() && this.isAiLlmEnabledForPlayer(playerId)
    },

    getAiModelConfigForPlayer(playerId: string): any {
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
        if (!config || !config.apiKey || !config.model) {
          console.log("[getAiModelConfigForPlayer] config is invalid (missing apiKey or model), returning null")
          return null
        }
        return config
      }
      console.log("[getAiModelConfigForPlayer] getAiModelConfig not available, returning null")
      return null
    },

    getAiIndexFromPlayerId(playerId: string): number {
      if (typeof playerId !== "string") return -1
      const match = playerId.match(/^ai(\d+)$/i)
      if (match) {
        return parseInt(match[1], 10) - 1
      }
      return -1
    },

    async requestAiLlmPlan(player: any, options: any = {}): Promise<any> {
      const requestStartTime = Date.now()
      const batchId = options.batchId || "solo"
      const batchStartTime = options.batchStartTime || requestStartTime
      const requestId = `${player.id}-${requestStartTime}`
      console.log(
        `[requestAiLlmPlan] ${requestId} START, player: ${player.id}, batchId: ${batchId}, delay from batch start: ${requestStartTime - batchStartTime}ms`
      )

      const requestStage = options.requestStage || "initial"
      const isFirstRound = requestStage === "initial" && Number(this.round) === 1

      let payload: any
      if (options.requestStage === "followup-after-tool") {
        payload = this.buildAiFollowupRoundPayload(
          player,
          options.followupContext || {},
          options.followupToolSummary || ""
        )
      } else if (isFirstRound) {
        payload = this.buildAiLlmRoundPayload(player)
      } else {
        payload = this.buildAiIncrementalPayload(player)
      }

      const firstRoundBlocks =
        isFirstRound && typeof this.getAiFirstRoundExtraBlocks === "function" ? this.getAiFirstRoundExtraBlocks() : []
      const mergedExtraBlocks = [
        ...(Array.isArray(firstRoundBlocks) ? firstRoundBlocks : []),
        ...(options.extraBlocks || [])
      ]

      const userPrompt = this.buildAiDecisionUserPrompt(payload, mergedExtraBlocks, {
        requestStage,
        isFirstRound
      })
      const systemPrompt = LLM_DECISION_SYSTEM_PROMPT
      const useMultiGameMemory =
        typeof this.isAiMultiGameMemoryEnabled === "function" ? this.isAiMultiGameMemoryEnabled() : false
      const historyMessages: any[] =
        useMultiGameMemory && typeof this.getAiConversationMessages === "function"
          ? this.getAiConversationMessages(player.id)
          : []
      let crossGameMemoryCount = 0
      let inGameHistoryCount = 0
      if (useMultiGameMemory) {
        if (typeof this.getAiCrossGameMemoryCount === "function") {
          crossGameMemoryCount = this.getAiCrossGameMemoryCount(player.id)
        }
        if (typeof this.getAiInGameHistoryCount === "function") {
          inGameHistoryCount = this.getAiInGameHistoryCount(player.id)
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
      let messages: any[]
      if (playerCache) {
        const incrementalMessages: any[] = []
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
        const gameState =
          payload && payload.gameState
            ? payload.gameState
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
        const roundNoRaw =
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.current
            ? payload.gameState.round.current
            : payload && payload.round && payload.round.current
              ? payload.round.current
              : this.round
        const totalRoundRaw =
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.total
            ? payload.gameState.round.total
            : GAME_SETTINGS.maxRounds
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
          options.extraBlocks.forEach((block: any) => {
            incrementalMessages.push({
              role: "user",
              content: String(block || "")
            })
          })
        }
        messages = [...playerCache, ...incrementalMessages]
      } else {
        messages = this.buildAiDecisionMessages(payload, {
          requestStage,
          isFirstRound,
          systemPrompt,
          historyMessages,
          extraBlocks: options.extraBlocks || []
        })
      }

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        console.log("[requestAiLlmPlan] provider:", provider ? provider.id : null)
        if (!provider) {
          console.log("[requestAiLlmPlan] ERROR: provider is null")
          return {
            source: "llm",
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
        const isNativeEnv = !!((window as any).NativeBridge && (window as any).NativeBridge.llmProxyAsync)
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

        const usage = result && result.usage ? result.usage : null
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
          if (requestStage === "initial") {
            this.aiConversationCache[player.id] = [
              ...messages,
              { role: "assistant", content: `[LLM请求失败] ${errorMessage}` }
            ]
          }
          setPlayerLlmError(this, player.id, errorMessage, result.code)
          showAiErrorToast(player.name, parseLlmError(errorMessage, result.code).brief)
          return {
            source: "llm",
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
            usage: null
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
            usage: null
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
          this.writeLog(`${player.name}：输出Token不足，已尝试从思维链提取决策。`)
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
            if (typeof this.writeLog === "function") {
              this.writeLog(`${player.name}：从思维链中提取到决策，出价${fallbackDecision.bid}`)
            }
          }
        }
        const plan = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: options.allowAction !== false
        })
        if (rawFinish === "length" && responseText.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出被截断，请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出被截断，决策可能不完整。`)
        }
        if (useMultiGameMemory && requestStage === "initial" && typeof this.pushAiRoundSummary === "function") {
          this.pushAiRoundSummary(player.id, plan)
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
        plan.historyMessagesPreview = historyMessages.map((m: any) => String(m.content || "").slice(0, 80)).join(" | ")
        plan.crossGameMemoryText =
          !playerCache && useMultiGameMemory && crossGameMemoryCount > 0
            ? String(historyMessages[0]?.content || "")
            : ""
        plan.cacheHitTokens = cacheHitTokens
        plan.cacheMissTokens = cacheMissTokens
        plan.cacheHitRate = cacheHitRate
        plan.usage = usage

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
          this.writeLog(`${player.name}：模型不一致，请求=${plan.configuredModel} 实际=${plan.model}`)
        }

        if (requestStage === "initial") {
          this.aiConversationCache[player.id] = [...messages, { role: "assistant", content: responseText }]
        }
        return plan
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : "LLM请求异常"
        if (requestStage === "initial") {
          this.aiConversationCache[player.id] = [
            ...messages,
            { role: "assistant", content: `[LLM请求异常] ${message}` }
          ]
        }
        setPlayerLlmError(this, player.id, message, "EXCEPTION")
        showAiErrorToast(player.name, parseLlmError(message, "EXCEPTION").brief)
        return {
          source: "llm",
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
          usage: null
        }
      }
    },

    async requestAiLlmFollowupBid(player: any, currentPlan: any, toolSummary: string): Promise<any> {
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

      return followupPlan
    },

    async requestAiLlmErrorCorrection(player: any, currentPlan: any, errorInfo: string, correctionHistory: any[], previousMessages: any[] = []): Promise<any> {
      const correctionCount = correctionHistory ? correctionHistory.length : 0
      const maxCorrections = 2

      if (correctionCount >= maxCorrections) {
        return {
          source: "llm",
          failed: true,
          error: `已达最大纠错次数(${maxCorrections})，不再回调`,
          correctionSkipped: true,
          actionType: "none",
          actionId: "none"
        }
      }

      const errorDetail = errorInfo || "未知错误"
      const previousCorrections =
        correctionHistory && correctionHistory.length > 0
          ? correctionHistory
            .map((entry: any, idx: number) => `第${idx + 1}次纠错: ${entry.error} -> AI回复: ${entry.aiResponse || "无"}`)
            .join("\n")
          : ""

      const errorCorrectionBlock = [
        "【工具执行报错回调】",
        `你的上次决策执行失败，错误原因：${errorDetail}`,
        `当前纠错次数：${correctionCount + 1}/${maxCorrections}`,
        "",
        "【原始决策】",
        JSON.stringify(
          {
            bid: currentPlan && currentPlan.bid ? currentPlan.bid : 0,
            skill:
              currentPlan && currentPlan.actionType === "skill"
                ? currentPlan.rawSkill || currentPlan.actionId || "无"
                : "无",
            item:
              currentPlan && currentPlan.actionType === "item"
                ? currentPlan.rawItem || currentPlan.actionId || "无"
                : "无",
            thought: currentPlan && currentPlan.thought ? currentPlan.thought : ""
          },
          null,
          2
        ),
        "",
        "【硬约束】",
        "- skill/item 必须来自 availableSkills/availableItems 列表",
        '- 如果不确定可用选项，使用"无"',
        "- 只返回 JSON 对象，包含 bid、skill、item、thought 四个字段",
        "- thought 中说明你对错误的理解和修正策略"
      ]

      if (previousCorrections) {
        errorCorrectionBlock.push("", "【过往纠错记录】", previousCorrections)
      }

      const payload = {
        gameState: {
          round: {
            current: this.round,
            total: GAME_SETTINGS.maxRounds
          },
          selfId: player.id,
          selfName: player.name,
          wallet: this.getAiWallet(player.id),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          folded: false,
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        selfRoleAndTools: {
          roleName: currentPlan && currentPlan.roleName ? currentPlan.roleName : "规则型",
          passive: currentPlan && currentPlan.passive ? currentPlan.passive : "默认规则人格",
          activeSkills: this.getAiResourceSnapshot(player.id).skills
            ? Object.entries(this.getAiResourceSnapshot(player.id).skills).map(([id, remain]) => {
              const def = this.getActionDefById(id)
              return {
                name: def ? def.name : id,
                description: def ? def.description : "",
                remaining: Number(remain) || 0
              }
            })
            : [],
          items: this.getAiResourceSnapshot(player.id).items
            ? Object.entries(this.getAiResourceSnapshot(player.id).items).map(([id, remain]) => {
              const def = this.getActionDefById(id)
              return {
                name: def ? def.name : id,
                description: def ? def.description : "",
                remaining: Number(remain) || 0
              }
            })
            : []
        },
        actionConstraints: this.buildAiActionConstraintBlock(player.id)
      }

      const userPrompt = this.buildAiDecisionUserPrompt(payload, errorCorrectionBlock)
      const systemPrompt = LLM_DECISION_SYSTEM_PROMPT

      const requestTimeoutMs = Math.max(3000, Math.round((Number(GAME_SETTINGS.roundSeconds) || 40) * 1000))
      const isNativeEnv = !!((window as any).NativeBridge && (window as any).NativeBridge.llmProxyAsync)
      let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      const aiModelConfig = this.getAiModelConfigForPlayer(player.id)
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
      }
      const isFlashModel = /deepseek.*flash|qwen.*turbo|glm.*flash|gpt-3\.5|gpt-4o-mini/i.test(settings.model || "")
      let baseTokens = Number(settings.maxTokens) || 600
      if (isNativeEnv && isFlashModel && baseTokens < 1500) {
        baseTokens = 1500
      }
      const requestMaxTokens = Math.max(300, baseTokens)

      const messages = [
        { role: "system", content: systemPrompt },
        ...(Array.isArray(previousMessages) ? previousMessages : []),
        { role: "user", content: userPrompt }
      ]

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        if (!provider) {
          return {
            source: "llm",
            failed: true,
            error: "LLM Provider 未初始化",
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
          isThinking: settings.thinkingEnabled || false
        })

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
          return {
            source: "llm",
            failed: true,
            error: errorPieces.join(" | "),
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: String(result.error || ""),
            correctionAttempt: correctionCount + 1
          }
        }

        const responseText = String(result.content || "")
        const reasoningContent = String(result.reasoningContent || "")
        const rawFinish2 =
          result.raw && result.raw.choices && result.raw.choices[0] ? result.raw.choices[0].finish_reason : ""
        if (!responseText.trim() && !reasoningContent.trim()) {
          const isEmpty =
            rawFinish2 === "length"
              ? "模型输出被截断（纠错），未生成有效内容。请增大最大输出Token数。"
              : "模型返回为空（纠错），未生成有效内容。请检查模型配置和Token限制。"
          setPlayerLlmError(this, player.id, isEmpty, "EMPTY_RESPONSE")
          showAiErrorToast(player.name, parseLlmError(isEmpty, "EMPTY_RESPONSE").brief)
          return {
            source: "llm",
            failed: true,
            error: isEmpty,
            actionType: "none",
            actionId: "none",
            correctionSkipped: true,
            correctionAttempt: correctionCount + 1
          }
        }
        if (!responseText.trim() && reasoningContent.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出Token不足（纠错），请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出Token不足（纠错），已尝试从思维链提取。`)
        }
        let decision = this.extractAiDecisionObject(responseText)
        const hasValidBid = decision && Number.isFinite(Number(decision.bid)) && Number(decision.bid) > 0

        if (!hasValidBid && reasoningContent) {
          const fallbackDecision = this.extractAiDecisionObject(reasoningContent)
          if (fallbackDecision && Number.isFinite(Number(fallbackDecision.bid)) && Number(fallbackDecision.bid) > 0) {
            decision = fallbackDecision
            if (typeof this.writeLog === "function") {
              this.writeLog(`${player.name}：从思维链中提取到纠错决策，出价${fallbackDecision.bid}`)
            }
          }
        }

        const plan = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: true
        })
        if (rawFinish2 === "length" && responseText.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出被截断（纠错），请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出被截断（纠错），决策可能不完整。`)
        }

        plan.elapsedMs = result.elapsedMs
        plan.systemPrompt = systemPrompt
        plan.userPrompt = userPrompt
        plan.modelResponse = responseText
        plan.reasoningContent = reasoningContent
        plan.requestStage = "error-correction"
        plan.correctionAttempt = correctionCount + 1
        plan.originalError = errorDetail

        return plan
      } catch (error) {
        const message = error && (error as Error).message ? (error as Error).message : "LLM请求异常"
        return {
          source: "llm",
          failed: true,
          error: message,
          actionType: "none",
          actionId: "none",
          systemPrompt,
          userPrompt,
          modelResponse: "",
          correctionAttempt: correctionCount + 1
        }
      }
    },

    async prepareAiLlmRoundPlans(): Promise<void> {
      this.aiLlmRoundPlans = {}
      if (!this.canUseLlmDecision()) {
        return
      }

      const aiPlayers = this.players.filter((player: any) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player: any) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player: any) => !this.canUseLlmDecisionForPlayer(player.id))
      if (activePlayers.length === 0) {
        this.writeLog("大模型总开关已开，但所有AI位开关均关闭，使用规则AI。")
        return
      }

      const batchStartTime = Date.now()
      const batchId = `batch-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} START, activePlayers: ${activePlayers.length}, players: ${activePlayers.map((p: any) => p.id).join(",")}`
      )

      const plans = await Promise.all(
        activePlayers.map((player: any) => this.requestAiLlmPlan(player, { batchId, batchStartTime }))
      )

      const batchEndTime = Date.now()
      const batchElapsed = batchEndTime - batchStartTime
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} END, total elapsed: ${batchElapsed}ms, avg per player: ${Math.round(batchElapsed / activePlayers.length)}ms`
      )

      const summary: string[] = []

      activePlayers.forEach((player: any, index: number) => {
        const plan = plans[index]
        if (!plan) {
          return
        }
        this.aiLlmRoundPlans[player.id] = plan

        if (plan.failed) {
          summary.push(`${player.name}:失败(${plan.error || "未知"})`)
          return
        }

        if (!plan.hasBidDecision) {
          summary.push(
            `${player.name}:出价无效(hasBidDecision=false), 模型回复预览:${(plan.modelResponse || "").slice(0, 120)}`
          )
          return
        }

        const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player: any) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        let actualModel = ""
        activePlayers.forEach((player: any) => {
          const p = this.aiLlmRoundPlans[player.id]
          if (p && p.model && !actualModel) actualModel = p.model
        })
        const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
        const modelName = actualModel || (settings && settings.model) || "大模型"
        this.writeLog(`${modelName}决策：${summary.join("；")}`)
      }
    },

    async processAiDecisions(): Promise<void> {
      console.log("[processAiDecisions] >>> ENTERED function")
      this.aiLlmRoundPlans = {}
      this.aiRoundEffects = {}
      this.lastAiIntelActions = []
      clearPlayerLlmErrors(this)

      if (!this.aiErrorCorrectionHistory) {
        this.aiErrorCorrectionHistory = {}
      }

      const aiPlayers = this.players.filter((player: any) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player: any) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player: any) => !this.canUseLlmDecisionForPlayer(player.id))

      console.log(
        "[processAiDecisions] aiPlayers:",
        aiPlayers.map((p: any) => p.id)
      )
      console.log(
        "[processAiDecisions] activePlayers:",
        activePlayers.map((p: any) => p.id)
      )
      console.log(
        "[processAiDecisions] disabledPlayers:",
        disabledPlayers.map((p: any) => p.id)
      )
      aiPlayers.forEach((p: any) => {
        const canUse = this.canUseLlmDecisionForPlayer(p.id)
        const isEnabled = this.isAiLlmEnabledForPlayer(p.id)
        const globalEnabled = this.canUseLlmDecision()
        console.log(
          `[processAiDecisions] ${p.id} canUseLlmDecisionForPlayer=${canUse}, isAiLlmEnabledForPlayer=${isEnabled}, globalEnabled=${globalEnabled}`
        )
      })

      if (activePlayers.length === 0 && disabledPlayers.length === 0) {
        console.log("[processAiDecisions] NO ai players, returning early")
        return
      }

      const batchStartTime = Date.now()
      const batchId = `decision-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
      console.log(
        `[processAiDecisions] ${batchId} START, activePlayers: ${activePlayers.length}, disabledPlayers: ${disabledPlayers.length}`
      )

      const roundProgress = GAME_SETTINGS.maxRounds <= 1 ? 1 : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1)
      const independentPromises: Promise<void>[] = []
      aiPlayers.forEach((player: any) => {
        const startTime = Date.now()
        console.log(
          `[processAiDecision] ${player.id}-${startTime} START, delay from batch start: ${startTime - batchStartTime}ms`
        )

        const taskPromise = (async () => {
          try {
            let plan = null
            let llmPlan = null

            if (activePlayers.includes(player)) {
              llmPlan = await this.requestAiLlmPlan(player, { batchId, batchStartTime })
              this.aiLlmRoundPlans[player.id] = llmPlan

              if (llmPlan && !llmPlan.failed && llmPlan.hasBidDecision) {
                this.llmEverUsedThisRun = true
                plan = {
                  actionType: llmPlan.actionType,
                  actionId: llmPlan.actionId,
                  expectedReveal: 0,
                  score: 1,
                  candidates: [],
                  decisionSource: "llm",
                  lockedByLlm: true
                }
              }
            }

            await this.processSingleAiIntelAction(player, plan, llmPlan, roundProgress, batchId, startTime)

            const endTime = Date.now()
            console.log(`[processAiDecision] ${player.id}-${startTime} END, elapsed: ${endTime - startTime}ms`)
          } catch (error) {
            console.error(`[processAiDecision] ${player.id}-${startTime} error:`, error)
            const errorMsg = error && (error as Error).message ? (error as Error).message : "未知异常"
            setPlayerLlmError(this, player.id, errorMsg, "EXCEPTION")
            showAiErrorToast(player.name, parseLlmError(errorMsg, "EXCEPTION").brief)
          } finally {
            this.setPlayerBidReady(player.id, true)
            this.updateHud()

            if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused) {
              const allReady = this.areAllPlayersBidReady()
              console.log(
                `[processAiDecision] ${player.id} finally: areAllPlayersBidReady=${allReady}, roundResolving=${this.roundResolving}, settled=${this.settled}`
              )
              if (allReady) {
                console.log("[processAiDecision] ALL PLAYERS READY, calling resolveRoundBids")
                this.resolveRoundBids("all-ready")
              }
            }

            if (this.isLanMode && this.lanIsHost && this.lanBridge) {
              const readyAiPlayers = aiPlayers.filter((p: any) => this.roundBidReadyState[p.id])
              if (readyAiPlayers.length === aiPlayers.length) {
                this.lanBridge.send({
                  type: "lan:ai-bids-ready",
                  aiPlayerIds: this.lanAiPlayers.map((ai: any) => ai.id)
                })
              }
            }
          }
        })()
        independentPromises.push(taskPromise)
      })

      this.aiRoundDecisionPromise = Promise.all(independentPromises).then(() => {
        const indicator = this.dom && this.dom.aiThinkingIndicator
        if (indicator) {
          indicator.classList.add("hidden")
          delete indicator.dataset.aiThinking
        }
        if (this.lastAiIntelActions.length > 0) {
          const text = this.lastAiIntelActions.map((entry: any) => this.formatAiIntelActionPublicLine(entry)).join("；")
          this.writeLog(`他人情报行动：${text}`)
        }

        const summary: string[] = []
        let actualModel2 = ""
        activePlayers.forEach((player: any) => {
          const plan = this.aiLlmRoundPlans[player.id]
          if (!plan) {
            summary.push(`${player.name}:失败(无计划)`)
            return
          }
          if (plan.model && !actualModel2) actualModel2 = plan.model
          if (plan.failed) {
            summary.push(`${player.name}:失败(${plan.error || "未知"})`)
            return
          }
          if (!plan.hasBidDecision) {
            summary.push(`${player.name}:出价无效(hasBidDecision=false)`)
            return
          }
          const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
          summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
        })

        disabledPlayers.forEach((player: any) => {
          summary.push(`${player.name}:规则AI(开关关闭)`)
        })

        if (summary.length > 0) {
          const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
          const modelName = actualModel2 || (settings && settings.model) || "大模型"
          this.writeLog(`${modelName}决策：${summary.join("；")}`)
        }
      })
    },

    _flushAiDecisionSummary(activePlayers: any[], disabledPlayers: any[]): void {
      if (!this._aiDecisionSummaryWaiting) return
      this._aiDecisionSummaryWaiting = false

      if (this.lastAiIntelActions.length > 0) {
        const text = this.lastAiIntelActions.map((entry: any) => this.formatAiIntelActionPublicLine(entry)).join("；")
        this.writeLog(`他人情报行动：${text}`)
      }

      const summary: string[] = []
      activePlayers.forEach((player: any) => {
        const plan = this.aiLlmRoundPlans[player.id]
        if (!plan) {
          summary.push(`${player.name}:失败(无计划)`)
          return
        }
        if (plan.failed) {
          summary.push(`${player.name}:失败(${plan.error || "未知"})`)
          return
        }
        if (!plan.hasBidDecision) {
          summary.push(`${player.name}:出价无效(hasBidDecision=false)`)
          return
        }
        const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player: any) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        const actualModels = new Set<string>()
        activePlayers.forEach((player: any) => {
          const plan = this.aiLlmRoundPlans[player.id]
          if (plan && !plan.failed && plan.model) {
            actualModels.add(plan.model)
          }
        })
        const modelName = actualModels.size > 0 ? [...actualModels].join("/") : "大模型"
        this.writeLog(`${modelName}决策：${summary.join("；")}`)
      }
    },

    captureAiDecisionTelemetry(roundBids: any[]): void {
      const aiPlayers = this.players.filter((player: any) => !player.isHuman)
      const hasLlm = aiPlayers.some((player: any) => Boolean(this.aiLlmRoundPlans[player.id]))

      if (!hasLlm) {
        this.lastAiDecisionTelemetry = {
          mode: "rule",
          round: this.round
        }
        return
      }

      const rulePayload = this.aiEngine.getLastDecisionLog()
      const ruleEntryById = new Map<string, any>(
        ((rulePayload && rulePayload.entries) || []).map((entry: any) => [entry.playerId, entry])
      )

      const bidByPlayerId = new Map<string, number>((roundBids || []).map((entry: any) => [entry.playerId, Number(entry.bid) || 0]))
      const entries = aiPlayers.map((player: any) => {
        const plan = this.aiLlmRoundPlans[player.id] || null
        const llmSeatEnabled = this.canUseLlmDecisionForPlayer(player.id)
        const ruleEntry = ruleEntryById.get(player.id)
        const finalBid = bidByPlayerId.has(player.id)
          ? bidByPlayerId.get(player.id)
          : ruleEntry
            ? ruleEntry.finalBid
            : 0
        const executedActions = this.currentRoundUsage[player.id] || []
        const llmExecutedActionId = plan && plan.actionExecuted ? plan.toolActionId || plan.actionId || "" : ""
        const hasLlmExecutedAction = Boolean(llmExecutedActionId) && executedActions.includes(llmExecutedActionId)
        const llmActionName = hasLlmExecutedAction ? this.getActionDefById(llmExecutedActionId).name : ""
        const ruleActionIds = executedActions.filter((actionId: string) => actionId !== llmExecutedActionId)
        const ruleActionName =
          ruleActionIds.length > 0
            ? ruleActionIds.map((actionId: string) => this.getActionDefById(actionId).name).join("、")
            : ""
        const actualModel = plan && plan.model ? plan.model : ""
        const decisionSource =
          !plan || !llmSeatEnabled ? "规则AI" : plan.failed ? "规则AI回退" : actualModel || "大模型"

        return {
          playerId: player.id,
          playerName: player.name,
          finalBid,
          folded: Boolean(plan && plan.folded),
          decisionSource,
          llmActionName,
          ruleActionName,
          actionExecuted: hasLlmExecutedAction,
          controlMode:
            plan && plan.controlMode
              ? plan.controlMode
              : plan && !plan.failed && plan.hasBidDecision && llmSeatEnabled
                ? "llm"
                : "rule",
          thought: plan && plan.thought ? plan.thought : "",
          reasoningContent: plan && plan.reasoningContent ? plan.reasoningContent : "",
          error: plan && plan.failed ? plan.error || "未知错误" : "",
          fallbackRuleBid: plan && !plan.failed && plan.hasBidDecision ? null : ruleEntry ? ruleEntry.finalBid : null,
          systemPrompt: plan && plan.systemPrompt ? plan.systemPrompt : "",
          userPrompt: plan && plan.userPrompt ? plan.userPrompt : "",
          modelResponse: plan && plan.modelResponse ? plan.modelResponse : "",
          toolResultSummary: plan && plan.actionExecuted && plan.toolResultSummary ? plan.toolResultSummary : "",
          followupPrompt: plan && plan.followupPrompt ? plan.followupPrompt : "",
          followupResponse: plan && plan.followupResponse ? plan.followupResponse : "",
          followupError: plan && plan.followupError ? plan.followupError : "",
          followupActionRejected: plan && plan.followupActionRejected ? plan.followupActionRejected : "",
          correctionAttempt: plan && plan.correctionAttempt ? plan.correctionAttempt : 0,
          originalError: plan && plan.originalError ? plan.originalError : "",
          errorCorrectionPrompt: plan && plan.errorCorrectionPrompt ? plan.errorCorrectionPrompt : "",
          errorCorrectionResponse: plan && plan.errorCorrectionResponse ? plan.errorCorrectionResponse : "",
          historyMessagesCount: plan && plan.historyMessagesCount ? plan.historyMessagesCount : 0,
          crossGameMemoryCount: plan && plan.crossGameMemoryCount ? plan.crossGameMemoryCount : 0,
          inGameHistoryCount: plan && plan.inGameHistoryCount ? plan.inGameHistoryCount : 0,
          historyMessagesPreview: plan && plan.historyMessagesPreview ? plan.historyMessagesPreview : "",
          crossGameMemoryText: plan && plan.crossGameMemoryText ? plan.crossGameMemoryText : "",
          cacheHitTokens: plan && plan.cacheHitTokens ? plan.cacheHitTokens : 0,
          cacheMissTokens: plan && plan.cacheMissTokens ? plan.cacheMissTokens : 0,
          cacheHitRate: plan && plan.cacheHitRate ? plan.cacheHitRate : 0,
          usage: plan && plan.usage ? plan.usage : null
        }
      })

      this.lastAiDecisionTelemetry = {
        mode: "llm",
        round: this.round,
        entries
      }
    },

    renderAiLogicPanelForLlm(telemetry: any): void {
      const lines: string[] = []
      lines.push(`回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`)
      lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。\n")
      lines.push("-")

      const rulePayload =
        this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
          ? this.aiEngine.getLastDecisionLog()
          : null
      const ruleEntryById = new Map<string, any>(
        ((rulePayload && rulePayload.entries) || []).map((entry: any) => [entry.playerId, entry])
      )

      const CONTROL_MODE_LABELS: Record<string, string> = {
        llm: "大模型正常决策",
        "llm-corrected": "大模型纠错后决策",
        "rule-fallback-after-llm-tool": "回退原因: LLM工具执行后的二次请求失败",
        "rule-fallback-after-correction": "回退原因: 纠错后执行失败",
        "rule-fallback-correction-skipped": "回退原因: 纠错跳过(已达最大次数或请求失败)",
        "rule-fallback-llm-failed": "回退原因: LLM请求失败",
        "rule-fallback-llm-invalid": "回退原因: LLM返回无效决策(无出价)"
      }

        ; (telemetry.entries || []).forEach((entry: any) => {
          const isLlm = entry.controlMode === "llm" || entry.controlMode === "llm-corrected"
          const isFallback = entry.controlMode && entry.controlMode.startsWith("rule-fallback")
          lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`)
          lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`)

          if (entry.controlMode) {
            const modeLabel = CONTROL_MODE_LABELS[entry.controlMode] || entry.controlMode
            if (isFallback) {
              lines.push(`  ⚠️ ${modeLabel}`)
            } else if (isLlm) {
              lines.push(`  接管模式: ${modeLabel}`)
            }
          }
          if (isLlm) {
            const cacheHit = entry.cacheHitTokens || 0
            const cacheMiss = entry.cacheMissTokens || 0
            const cacheRate = entry.cacheHitRate || 0
            lines.push(`  缓存命中: ${cacheHit} tokens | 未命中: ${cacheMiss} tokens | 命中率: ${cacheRate}%`)
            if (entry.correctionAttempt > 0) {
              lines.push(`  纠错次数: ${entry.correctionAttempt}/2`)
              if (entry.originalError) {
                lines.push(`  原始错误: ${entry.originalError}`)
              }
            }
            if (entry.historyMessagesCount > 0 || entry.crossGameMemoryCount > 0) {
              const gameInfo =
                entry.crossGameMemoryCount > 0
                  ? entry.inGameHistoryCount > 0
                    ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
                    : `${entry.crossGameMemoryCount}局跨局记忆`
                  : `${entry.inGameHistoryCount}条本局历史`
              lines.push(`  跨局记忆注入: ${gameInfo}`)
            }
            if (entry.llmActionName) {
              lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`)
            }
            if (entry.ruleActionName) {
              lines.push(`  规则动作: ${entry.ruleActionName}`)
            }
            if (entry.thought) {
              lines.push(`  思考: ${entry.thought}`)
            }
            if (entry.reasoningContent) {
              lines.push(`  思考过程:`)
              lines.push(indentMultiline(entry.reasoningContent, "    "))
            }
            if (entry.error) {
              lines.push(`  错误: ${entry.error}`)
            }
            if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
              lines.push(`  回退规则出价参考: ${formatBidRevealNumber(entry.fallbackRuleBid)}`)
            }

            if (entry.systemPrompt) {
              lines.push("  [System Prompt]")
              lines.push(indentMultiline(entry.systemPrompt || "", "    "))
            }
            if (entry.crossGameMemoryText) {
              lines.push("  [Cross-game Memory]")
              lines.push(indentMultiline(entry.crossGameMemoryText || "", "    "))
            }
            lines.push("  [User Prompt]")
            lines.push(indentMultiline(entry.userPrompt || "", "    "))
            lines.push("  [Model Response]")
            lines.push(indentMultiline(entry.modelResponse || "", "    "))
            if (entry.toolResultSummary) {
              lines.push("  [Tool Result]")
              lines.push(indentMultiline(entry.toolResultSummary || "", "    "))
            }
            if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
              lines.push("  [Error Correction Prompt]")
              lines.push(indentMultiline(entry.errorCorrectionPrompt || "", "    "))
              lines.push("  [Error Correction Response]")
              lines.push(indentMultiline(entry.errorCorrectionResponse || "", "    "))
            }
            if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
              lines.push("  [Follow-up Prompt]")
              lines.push(indentMultiline(entry.followupPrompt || "", "    "))
              lines.push("  [Follow-up Response]")
              lines.push(indentMultiline(entry.followupResponse || entry.followupError || "", "    "))
              if (entry.followupActionRejected) {
                lines.push("  [Follow-up Action Guard]")
                lines.push(indentMultiline(entry.followupActionRejected || "", "    "))
              }
            }
          } else {
            const ruleEntry = ruleEntryById.get(entry.playerId)
            if (ruleEntry) {
              const parts = ruleEntry.confidenceParts || {}
              const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100)
              const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100)
              lines.push(
                `  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`
              )
              lines.push(
                `  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`
              )
              lines.push(
                `  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`
              )
              lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`)
              lines.push(
                `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
              )
              lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`)
              lines.push(
                `  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`
              )
              lines.push(
                `  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`
              )
            } else {
              lines.push("  （无规则AI决策数据）")
            }
          }
          lines.push("-")
        })

      this.dom.aiLogicContent.textContent = lines.join("\n")

      const hasConversationMessages = this.aiConversationCache && Object.keys(this.aiConversationCache).length > 0
      if (this.dom.aiViewMessagesBtn) {
        if (hasConversationMessages) {
          this.dom.aiViewMessagesBtn.classList.remove("hidden")
        } else {
          this.dom.aiViewMessagesBtn.classList.add("hidden")
        }
      }
    },

    showAiConversationMessages(): void {
      if (!this.aiConversationCache || Object.keys(this.aiConversationCache).length === 0) {
        this.writeLog("当前无Messages数据。")
        return
      }

      const messages = this.aiConversationCache
      const lines: string[] = []
      lines.push("═══ 当前完整 Messages ═══")
      lines.push(`回合: ${this.round}`)
      lines.push("")

      Object.keys(messages)
        .sort()
        .forEach((playerId) => {
          const playerMessages = messages[playerId]
          if (!Array.isArray(playerMessages)) {
            return
          }
          lines.push(`──── ${playerId} ────`)
          lines.push(`消息数: ${playerMessages.length}`)
          lines.push("")
          playerMessages.forEach((msg: any, idx: number) => {
            const role = msg.role || "unknown"
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)
            lines.push(`[${idx + 1}] role: ${role}`)
            lines.push("content:")
            content.split("\n").forEach((line: string) => lines.push(`  ${line}`))
            lines.push("")
          })
          lines.push("")
        })

      this.dom.aiLogicContent.textContent = lines.join("\n")
    }
  }

  return { methods }
}
