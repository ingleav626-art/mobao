/**
 * @file scripts/game/ai/intel/action.ts
 * @module ai/intel/action
 * @description AI 情报动作执行 Mixin。执行技能/道具动作、LLM 纠错流程、
 *              动作结果应用到情报池、以及 LAN 通信广播。
 *
 * @requires data/skills, data/items - 数据定义
 * @requires core/settings - GAME_SETTINGS
 * @requires ./pure - formatIntelActionPublicLine
 * @exports ActionMixin - 动作执行子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { Player, RevealResult } from "../../../../types/game"
import type {
  AiSignalStats,
  IntelActionPlan
} from "../../../../types/ai"
import type { LlmPlan, LlmPlanResult } from "../../../../types/llm"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { GAME_SETTINGS } from "../../core/settings"
import { formatIntelActionPublicLine } from "./pure"

export const ActionMixin: ThisType<WarehouseSceneThis> = {
  executeAiIntelAction(
    playerId: string,
    plan: IntelActionPlan
  ): RevealResult & { signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats } } {
    const resourceState = this.aiResourceState[playerId]
    if (!resourceState || !plan || plan.actionType === "none") {
      return { ok: false, revealed: 0, message: "未执行AI情报行动。" }
    }

    const usedThisRound = this.currentRoundUsage[playerId] || []
    if (usedThisRound.length > 0) {
      return { ok: false, revealed: 0, message: "本回合已使用过技能或道具。" }
    }

    if (plan.actionType === "skill") {
      const remain = Number(resourceState.skills[plan.actionId] || 0)
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI技能次数不足。" }
      }

      const skill = SKILL_DEFS.find((entry) => entry.id === plan.actionId)
      if (!skill) {
        return { ok: false, revealed: 0, message: "AI技能不存在。" }
      }

      const result = skill.execute(this.buildAiPrivateRevealContext(playerId))
      if (!result.ok) {
        return result
      }

      resourceState.skills[plan.actionId] = remain - 1
      return result
    }

    if (plan.actionType === "item") {
      const remain = Number(resourceState.items[plan.actionId] || 0)
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI道具库存不足。" }
      }

      const item = ITEM_DEFS.find((entry) => entry.id === plan.actionId)
      if (!item) {
        return { ok: false, revealed: 0, message: "AI道具不存在。" }
      }

      const result = item.execute(this.buildAiPrivateRevealContext(playerId))
      if (!result.ok) {
        return result
      }

      resourceState.items[plan.actionId] = remain - 1
      return result
    }

    return { ok: false, revealed: 0, message: "未知AI行动类型。" }
  },

  async processAiIntelActions() {
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    const roundProgress = GAME_SETTINGS.maxRounds <= 1 ? 1 : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1)

    this.aiRoundEffects = {}
    this.lastAiIntelActions = []

    if (!this.aiErrorCorrectionHistory) {
      this.aiErrorCorrectionHistory = {}
    }

    const batchStartTime = Date.now()
    const batchId = `intel-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
    console.log(
      `[processAiIntelActions] ${batchId} START, aiPlayers: ${aiPlayers.length}, players: ${aiPlayers.map((p) => p.id).join(",")}`
    )

    return Promise.all(
      aiPlayers.map(async (player) => {
        try {
          await this.processSingleAiIntelAction(player, undefined, undefined, roundProgress, batchId, batchStartTime)
        } catch (error) {
          console.error(`[processSingleAiIntelAction] ${player.id} error:`, error)
        } finally {
          this.setPlayerBidReady(player.id, true)
          this.updateHud()

          if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused) {
            if (this.areAllPlayersBidReady()) {
              this.resolveRoundBids("all-ready")
            }
          }

          if (this.isLanMode && this.lanIsHost && this.lanBridge) {
            const readyAiPlayers = aiPlayers.filter((p) => this.roundBidReadyState[p.id])
            if (readyAiPlayers.length === aiPlayers.length) {
              this.lanBridge.send({
                type: "lan:ai-bids-ready",
                aiPlayerIds: this.lanAiPlayers.map((ai) => ai.id)
              })
            }
          }
        }
      })
    )
      .then(() => {
        const batchEndTime = Date.now()
        console.log(`[processAiIntelActions] ${batchId} END, total elapsed: ${batchEndTime - batchStartTime}ms`)

        if (this.lastAiIntelActions.length > 0) {
          const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
          this.writeLog(`他人情报行动：${text}`)
        }
      })
      .catch((error) => {
        console.error(`[processAiIntelActions] ${batchId} error:`, error)
      })
  },

  async processSingleAiIntelAction(
    player: Player,
    plan?: IntelActionPlan,
    llmPlan?: LlmPlanResult | null,
    roundProgress?: number,
    batchId?: string,
    batchStartTime?: number
  ) {
    const startTime = Date.now()
    console.log(
      `[processSingleAiIntelAction] ${player.id}-${startTime} START, delay from batch start: ${startTime - (batchStartTime || 0)}ms`
    )
    console.log(
      `[processSingleAiIntelAction] ${player.id} plan:`,
      plan
        ? {
          actionType: plan.actionType,
          actionId: plan.actionId,
          decisionSource: plan.decisionSource,
          lockedByLlm: plan.lockedByLlm
        }
        : "null"
    )
    console.log(
      `[processSingleAiIntelAction] ${player.id} llmPlan:`,
      llmPlan
        ? {
          failed: llmPlan.failed,
          hasBidDecision: llmPlan.hasBidDecision,
          bid: llmPlan.bid,
          actionId: llmPlan.actionId
        }
        : "null"
    )

    if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed()
    const intelSummary = this.getAiIntelSummary(player.id)
    const resources = this.getAiResourceSnapshot(player.id)
    const llmBidReady = Boolean(
      llmPlan && !llmPlan.failed && llmPlan.hasBidDecision && this.canUseLlmDecisionForPlayer(player.id)
    )
    console.log(`[processSingleAiIntelAction] ${player.id} llmBidReady: ${llmBidReady}`)

    if (llmBidReady) {
      this.llmEverUsedThisRun = true
    }

    if (!plan) {
      plan = this.aiEngine.planIntelAction({
        playerId: player.id,
        round: this.round,
        maxRounds: GAME_SETTINGS.maxRounds,
        intelSummary,
        resources
      }) as IntelActionPlan
    }

    const activePlan = plan as IntelActionPlan
    const result = this.executeAiIntelAction(player.id, activePlan)
    console.log(`[processSingleAiIntelAction] ${player.id} executeAiIntelAction result:`, {
      ok: result.ok,
      actionType: activePlan.actionType,
      actionId: activePlan.actionId,
      message: result.message
    })
    const effectiveActionType = result.ok ? activePlan.actionType : "none"
    const effectiveActionId = result.ok ? activePlan.actionId : "none"
    const effect = this.aiEngine.buildToolEffect({
      playerId: player.id,
      actionType: effectiveActionType,
      actionId: effectiveActionId,
      roundProgress: roundProgress || 0,
      intelSummary: this.getAiIntelSummary(player.id),
      signalStats: result.ok ? result.signalStats : null,
      planScore: activePlan.score || 0
    })

    this.aiRoundEffects[player.id] = effect

    if (!result.ok && activePlan.actionType !== "none" && llmBidReady && this.canUseLlmDecisionForPlayer(player.id)) {
      const activeLlmPlan = llmPlan as LlmPlan
      const correctionHistory = this.aiErrorCorrectionHistory[player.id] || []
      const errorDetail = result.message || "未知错误"

      this.writeLog(`[AI纠错] ${player.name} 工具执行失败: ${errorDetail}`)

      if (!this.currentRunLog) {
        this.currentRunLog = {
          runNo: 0,
          startedAt: Date.now(),
          aiThoughtLogs: [],
          actionLogs: [],
          roundLogsByRound: {},
          roundPanelTexts: {}
        }
      }
      const errorLogEntry = {
        round: this.round,
        playerName: player.name,
        thought: `[工具报错] 错误: ${errorDetail}\n原始决策: skill=${activePlan.actionType === "skill" ? activePlan.actionId : "无"}, item=${activePlan.actionType === "item" ? activePlan.actionId : "无"}`,
        controlMode: "error-correction",
        error: errorDetail,
        at: Date.now()
      }
      this.currentRunLog?.aiThoughtLogs?.push(errorLogEntry)

      const correctionPlan = await this.requestAiLlmErrorCorrection(
        player,
        activeLlmPlan,
        errorDetail,
        correctionHistory,
        this.getAiConversationMessages ? this.getAiConversationMessages(player.id) : []
      )

      if (!this.aiErrorCorrectionHistory[player.id]) {
        this.aiErrorCorrectionHistory[player.id] = []
      }
      this.aiErrorCorrectionHistory[player.id].push({
        error: errorDetail,
        aiResponse:
          correctionPlan && !correctionPlan.failed ? `出价${correctionPlan.bid}` : correctionPlan?.error || "失败",
        at: Date.now()
      })

      if (correctionPlan && !correctionPlan.failed && correctionPlan.hasBidDecision) {
        const correctionResult = this.executeAiIntelAction(player.id, {
          actionType: correctionPlan.actionType,
          actionId: correctionPlan.actionId,
          expectedReveal: 0,
          score: 1,
          candidates: [],
          decisionSource: "llm-correction",
          lockedByLlm: true
        })

        if (correctionResult.ok && llmPlan) {
          llmPlan.bid = correctionPlan.bid
          llmPlan.hasBidDecision = true
          llmPlan.actionType = correctionPlan.actionType
          llmPlan.actionId = correctionPlan.actionId
          llmPlan.thought = correctionPlan.thought || llmPlan.thought
          llmPlan.controlMode = "llm-corrected"
          llmPlan.correctionAttempt = correctionPlan.correctionAttempt
          llmPlan.originalError = errorDetail
          llmPlan.errorCorrectionPrompt = correctionPlan.userPrompt || ""
          llmPlan.errorCorrectionResponse = correctionPlan.modelResponse || ""

          const correctionLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[纠错成功] 纠错次数: ${correctionPlan.correctionAttempt}/2\n新出价: ${correctionPlan.bid}\n思考: ${correctionPlan.thought || "无"}`,
            controlMode: "llm-corrected",
            correctionAttempt: correctionPlan.correctionAttempt,
            at: Date.now()
          }
          this.currentRunLog?.aiThoughtLogs?.push(correctionLogEntry)

          if (correctionPlan.actionType !== "none" && correctionPlan.actionId !== "none") {
            this.recordPlayerUsage(player.id, correctionPlan.actionId)
            const correctionToolSummary = this.buildAiToolResultSummary(
              correctionResult,
              correctionPlan.actionType,
              correctionPlan.actionId
            )
            llmPlan.toolResultSummary = correctionToolSummary
            llmPlan.toolActionType = correctionPlan.actionType
            llmPlan.toolActionId = correctionPlan.actionId

            const actionDef = this.getActionDefById(correctionPlan.actionId)
            this.addPublicInfoEntry({
              source: `${player.name}-${actionDef.name}(纠错)`,
              text: actionDef.description
            })

            if (this.isLanMode && this.lanIsHost && this.lanBridge) {
              this.lanBridge.send({
                type: "lan:ai-item-use",
                aiPlayerId: player.lanId || player.id,
                aiPlayerName: player.name,
                actionId: correctionPlan.actionId,
                actionType: correctionPlan.actionType,
                itemName: actionDef.name,
                itemDesc: actionDef.description
              })
            }

            if (this.canUseLlmDecisionForPlayer(player.id)) {
              console.log(`[processSingleAiIntelAction] ${player.id} calling correction followup LLM (tool executed)`)
              const followup = await this.requestAiLlmFollowupBid(player, llmPlan, correctionToolSummary)
              console.log(
                `[processSingleAiIntelAction] ${player.id} correction followup result:`,
                followup
                  ? {
                    ok: followup.ok,
                    failed: followup.failed,
                    hasBidDecision: followup.hasBidDecision,
                    bid: followup.bid
                  }
                  : "null"
              )
              if (followup && !followup.failed && followup.hasBidDecision) {
                llmPlan.bid = followup.bid
                llmPlan.hasBidDecision = true
                llmPlan.thought = followup.thought || llmPlan.thought
                llmPlan.followupPrompt = followup.userPrompt || ""
                llmPlan.followupResponse = followup.modelResponse || ""
                llmPlan.followupElapsedMs = followup.elapsedMs || 0
                llmPlan.followupActionRejected = followup.followupActionRejected || ""
              } else if (followup && followup.failed) {
                llmPlan.followupError = followup.error || "二次请求失败"
                llmPlan.followupPrompt = followup.userPrompt || ""
                llmPlan.followupResponse = followup.modelResponse || ""
                llmPlan.controlMode = "rule-fallback-after-llm-tool"
                if (!llmPlan.error) {
                  llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
                }
              }
            }
          } else {
            console.log(`[processSingleAiIntelAction] ${player.id} calling correction followup LLM (no tool action)`)
            const followup = await this.requestAiLlmFollowupBid(player, llmPlan, "工具执行失败，直接给出价")
            if (followup && !followup.failed && followup.hasBidDecision) {
              llmPlan.bid = followup.bid
              llmPlan.hasBidDecision = true
              llmPlan.thought = followup.thought || llmPlan.thought
              llmPlan.followupPrompt = followup.userPrompt || ""
              llmPlan.followupResponse = followup.modelResponse || ""
              llmPlan.followupElapsedMs = followup.elapsedMs || 0
              llmPlan.followupActionRejected = followup.followupActionRejected || ""
            } else if (followup && followup.failed) {
              llmPlan.followupError = followup.error || "二次请求失败"
              llmPlan.followupPrompt = followup.userPrompt || ""
              llmPlan.followupResponse = followup.modelResponse || ""
              llmPlan.controlMode = "rule-fallback-after-llm-tool"
              if (!llmPlan.error) {
                llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
              }
            }
          }
        } else {
          const failLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[纠错后执行失败] ${correctionResult.message || "未知错误"}`,
            controlMode: "rule-fallback-after-correction",
            error: correctionResult.message,
            at: Date.now()
          }
          this.currentRunLog?.aiThoughtLogs?.push(failLogEntry)
          if (llmPlan) {
            llmPlan.controlMode = "rule-fallback-after-correction"
            if (!llmPlan.error) {
              llmPlan.error = `纠错后执行失败: ${correctionResult.message || "未知"}`
            }
          }
        }
      } else {
        const skipLogEntry = {
          round: this.round,
          playerName: player.name,
          thought: `[纠错跳过] ${correctionPlan ? correctionPlan.error || "已达最大纠错次数" : "纠错请求失败"}`,
          controlMode: "rule-fallback-correction-skipped",
          error: correctionPlan ? correctionPlan.error : "纠错请求失败",
          at: Date.now()
        }
        this.currentRunLog?.aiThoughtLogs?.push(skipLogEntry)
        if (llmPlan) {
          llmPlan.controlMode = "rule-fallback-correction-skipped"
          if (!llmPlan.error) {
            llmPlan.error = correctionPlan ? `纠错跳过: ${correctionPlan.error || "已达最大纠错次数"}` : "纠错请求失败"
          }
        }
      }
      console.log(
        `[processSingleAiIntelAction] ${player.id}-${startTime} END (error correction path), elapsed: ${Date.now() - startTime}ms`
      )
      return
    }

    if (!result.ok || activePlan.actionType === "none") {
      console.log(
        `[processSingleAiIntelAction] ${player.id}-${startTime} END (no action), elapsed: ${Date.now() - startTime}ms`
      )
      return
    }

    this.recordPlayerUsage(player.id, activePlan.actionId)
    const toolSummary = this.buildAiToolResultSummary(result, activePlan.actionType, activePlan.actionId)
    this.lastAiIntelActions.push({
      playerId: player.id,
      playerName: player.name,
      actionType: activePlan.actionType,
      actionId: activePlan.actionId,
      revealed: result.revealed,
      detail: toolSummary,
      score: activePlan.score || 0,
      effectTag: effect.tag || "",
      signalStats: result.signalStats ? result.signalStats.aggregate : null
    })

    const actionDef = this.getActionDefById(activePlan.actionId)
    this.addPublicInfoEntry({
      source: `${player.name}-${actionDef.name}`,
      text: actionDef.description
    })

    if (this.isLanMode && this.lanIsHost && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:ai-item-use",
        aiPlayerId: player.lanId || player.id,
        aiPlayerName: player.name,
        actionId: activePlan.actionId,
        actionType: activePlan.actionType,
        itemName: actionDef.name,
        itemDesc: actionDef.description
      })
    }

    if (llmBidReady && llmPlan && llmPlan.actionId === activePlan.actionId) {
      llmPlan.actionExecuted = true
      llmPlan.toolResultSummary = toolSummary
      llmPlan.toolActionType = activePlan.actionType
      llmPlan.toolActionId = activePlan.actionId
      llmPlan.controlMode = "llm"

      if (this.canUseLlmDecisionForPlayer(player.id)) {
        console.log(`[processSingleAiIntelAction] ${player.id} calling followup LLM, canUseLlmDecision=true`)
        const followup = await this.requestAiLlmFollowupBid(player, llmPlan, toolSummary)
        console.log(
          `[processSingleAiIntelAction] ${player.id} followup result:`,
          followup
            ? { ok: followup.ok, failed: followup.failed, hasBidDecision: followup.hasBidDecision, bid: followup.bid }
            : "null"
        )
        if (followup && !followup.failed && followup.hasBidDecision) {
          llmPlan.bid = followup.bid
          llmPlan.hasBidDecision = true
          llmPlan.thought = followup.thought || llmPlan.thought
          llmPlan.followupPrompt = followup.userPrompt || ""
          llmPlan.followupResponse = followup.modelResponse || ""
          llmPlan.followupElapsedMs = followup.elapsedMs || 0
          llmPlan.followupActionRejected = followup.followupActionRejected || ""
        } else if (followup && followup.failed) {
          llmPlan.followupError = followup.error || "二次请求失败"
          llmPlan.followupPrompt = followup.userPrompt || ""
          llmPlan.followupResponse = followup.modelResponse || ""
          llmPlan.controlMode = "rule-fallback-after-llm-tool"
          if (!llmPlan.error) {
            llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
          }
        }
      }
    } else if (!llmBidReady) {
      if (llmPlan && llmPlan.failed) {
        llmPlan.controlMode = "rule-fallback-llm-failed"
        if (!llmPlan.error) {
          llmPlan.error = llmPlan.error || "LLM请求失败"
        }
      } else if (llmPlan && !llmPlan.hasBidDecision) {
        llmPlan.controlMode = "rule-fallback-llm-invalid"
        if (!llmPlan.error) {
          llmPlan.error = "LLM返回无效决策(无出价)"
        }
      }
    }

    console.log(`[processSingleAiIntelAction] ${player.id}-${startTime} END, elapsed: ${Date.now() - startTime}ms`)
  },

  formatAiIntelActionPublicLine(entry: {
    playerName: string
    actionId: string
    revealed: number
    signalStats: AiSignalStats | null
    effectTag: string
    detail: string
  }) {
    const info = this.getItemInfo(entry.actionId)
    return formatIntelActionPublicLine(entry, info?.label || "未知")
  },

  canUseIntelActions() {
    if (this.settled || this.roundResolving) {
      return false
    }

    if (this.roundPaused) {
      this.writeLog("当前处于暂停状态，请先继续回合后再操作。")
      return false
    }

    if (this.roundTimeLeft <= 0) {
      this.writeLog("本回合已超时，无法再使用技能或道具。")
      return false
    }

    if (this.playerBidSubmitted) {
      this.writeLog("你已提交本轮出价，无法继续使用技能或道具。")
      return false
    }

    return true
  }
}
