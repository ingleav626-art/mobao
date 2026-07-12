/**
 * @file scripts/llm/core/decision/correction.ts
 * @module llm/core/decision/correction
 * @description LLM 决策纠错方法。请求 AI LLM 错误纠正、管理纠错历史、
 *              重试逻辑、纠错次数限制、降级到规则 AI。
 *
 * @requires ../prompts - LLM_DECISION_SYSTEM_PROMPT
 * @requires ../llm-error - parseLlmError, showAiErrorToast, setPlayerLlmError, clearPlayerLlmErrors
 * @requires ./pure - isValidAiModelConfig
 * @requires ./types - LlmDecisionDeps
 * @exports createLlmCorrectionMethods - 工厂函数，返回纠错相关方法
 */
import { LLM_DECISION_SYSTEM_PROMPT } from "../prompts.js"
import { parseLlmError, showAiErrorToast, setPlayerLlmError, clearPlayerLlmErrors } from "../llm-error.js"
import type { Player } from "../../../../types/game"
import type { LlmPlanResult } from "../../../../types/llm"
import type { IntelActionPlan } from "../../../../types/ai"
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { LlmDecisionDeps } from "./types"

export function createLlmCorrectionMethods(deps: LlmDecisionDeps) {
  const { GAME_SETTINGS, LLM_SETTINGS } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    async requestAiLlmErrorCorrection(player: Player, currentPlan: Record<string, unknown>, errorInfo: string, correctionHistory: Array<Record<string, unknown>>, previousMessages: Array<Record<string, unknown>> = []): Promise<LlmPlanResult | null> {
      const correctionCount = correctionHistory ? correctionHistory.length : 0
      const maxCorrections = 2

      if (correctionCount >= maxCorrections) {
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
            .map((entry: Record<string, unknown>, idx: number) => `第${idx + 1}次纠错: ${entry.error} -> AI回复: ${entry.aiResponse || "无"}`)
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
          directWinRatio: Number((1 + Number(GAME_SETTINGS.directTakeRatio || 0)).toFixed(2)),
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
      const isNativeEnv = !!((window as unknown as Record<string, { llmProxyAsync?: (...args: unknown[]) => Promise<unknown> }>).NativeBridge && (window as unknown as Record<string, { llmProxyAsync?: (...args: unknown[]) => Promise<unknown> }>).NativeBridge.llmProxyAsync)
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
        if (!provider.requestChat) {
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
            bid: 0,
            folded: false,
            hasBidDecision: false,
            target: "",
            thought: "",
            rawSkill: "",
            rawItem: "",
            rawContent: "",
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

        const plan: LlmPlanResult = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: false
        }) as LlmPlanResult
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
          correctionAttempt: correctionCount + 1
        }
      }
    },

    async prepareAiLlmRoundPlans(): Promise<void> {
      this.aiLlmRoundPlans = {}
      if (!this.canUseLlmDecision()) {
        return
      }

      const aiPlayers = this.players.filter((player: Player) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player: Player) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player: Player) => !this.canUseLlmDecisionForPlayer(player.id))
      if (activePlayers.length === 0) {
        this.writeLog("大模型总开关已开，但所有AI位开关均关闭，使用规则AI。")
        return
      }

      const batchStartTime = Date.now()
      const batchId = `batch-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} START, activePlayers: ${activePlayers.length}, players: ${activePlayers.map((p: Player) => p.id).join(",")}`
      )

      const plans = await Promise.all(
        activePlayers.map((player: Player) => this.requestAiLlmPlan(player, { batchId, batchStartTime }))
      )

      const batchEndTime = Date.now()
      const batchElapsed = batchEndTime - batchStartTime
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} END, total elapsed: ${batchElapsed}ms, avg per player: ${Math.round(batchElapsed / activePlayers.length)}ms`
      )

      const summary: string[] = []

      activePlayers.forEach((player: Player, index: number) => {
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

        const actionName = plan.actionId && plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player: Player) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        let actualModel = ""
        activePlayers.forEach((player: Player) => {
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

      const aiPlayers = this.players.filter((player: Player) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player: Player) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player: Player) => !this.canUseLlmDecisionForPlayer(player.id))

      console.log(
        "[processAiDecisions] aiPlayers:",
        aiPlayers.map((p: Player) => p.id)
      )
      console.log(
        "[processAiDecisions] activePlayers:",
        activePlayers.map((p: Player) => p.id)
      )
      console.log(
        "[processAiDecisions] disabledPlayers:",
        disabledPlayers.map((p: Player) => p.id)
      )
      aiPlayers.forEach((p: Player) => {
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
      aiPlayers.forEach((player: Player) => {
        const startTime = Date.now()
        console.log(
          `[processAiDecision] ${player.id}-${startTime} START, delay from batch start: ${startTime - batchStartTime}ms`
        )

        const taskPromise = (async () => {
          try {
            let plan = null
            let llmPlan: LlmPlanResult | null = null

            if (activePlayers.includes(player)) {
              llmPlan = await this.requestAiLlmPlan(player, { batchId, batchStartTime })
              this.aiLlmRoundPlans[player.id] = llmPlan as unknown as import("../../../../types/llm").LlmPlanResult

              if (llmPlan && !llmPlan.failed && llmPlan.hasBidDecision) {
                this.llmEverUsedThisRun = true
                plan = {
                  actionType: llmPlan.actionType as IntelActionPlan["actionType"],
                  actionId: llmPlan.actionId,
                  expectedReveal: 0,
                  score: 1,
                  candidates: [],
                  decisionSource: "llm",
                  lockedByLlm: true
                }
              }
            }

            await this.processSingleAiIntelAction(player, plan as unknown as IntelActionPlan | undefined, llmPlan, roundProgress, batchId, startTime)

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
              const readyAiPlayers = aiPlayers.filter((p: Player) => this.roundBidReadyState[p.id])
              if (readyAiPlayers.length === aiPlayers.length) {
                this.lanBridge.send({
                  type: "lan:ai-bids-ready",
                  aiPlayerIds: (this.lanAiPlayers as Array<{ id: string }>).map((ai) => ai.id)
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
          const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
          this.writeLog(`他人情报行动：${text}`)
        }

        const summary: string[] = []
        let actualModel2 = ""
        activePlayers.forEach((player: Player) => {
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
          const actionName = plan.actionId && plan.actionId && plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
          summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
        })

        disabledPlayers.forEach((player: Player) => {
          summary.push(`${player.name}:规则AI(开关关闭)`)
        })

        if (summary.length > 0) {
          const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
          const modelName = actualModel2 || (settings && settings.model) || "大模型"
          this.writeLog(`${modelName}决策：${summary.join("；")}`)
        }
      })
    },

    _flushAiDecisionSummary(activePlayers: Player[], disabledPlayers: Player[]): void {
      if (!this._aiDecisionSummaryWaiting) return
      this._aiDecisionSummaryWaiting = false

      if (this.lastAiIntelActions.length > 0) {
        const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
        this.writeLog(`他人情报行动：${text}`)
      }

      const summary: string[] = []
      activePlayers.forEach((player: Player) => {
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
        const actionName = plan.actionId && plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player: Player) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        const actualModels = new Set<string>()
        activePlayers.forEach((player: Player) => {
          const plan = this.aiLlmRoundPlans[player.id]
          if (plan && !plan.failed && plan.model) {
            actualModels.add(plan.model)
          }
        })
        const modelName = actualModels.size > 0 ? [...actualModels].join("/") : "大模型"
        this.writeLog(`${modelName}决策：${summary.join("；")}`)
      }
    }
  }

  return methods
}
