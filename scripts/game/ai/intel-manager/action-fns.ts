/**
 * @file scripts/game/ai/intel-manager/action-fns.ts
 * @module ai/intel-manager/action-fns
 * @description AiIntelManager 动作执行相关函数：情报动作执行、批量 AI 处理、LLM 纠错流程、格式化公开行、可用性检查。
 */
import type { Player, RevealResult } from "../../../../types/game"
import type { IntelActionPlan } from "../../../../types/ai"
import type { LlmPlan, LlmPlanResult } from "../../../../types/llm"
import type { AiIntelManagerDeps, LastAiIntelAction } from "../intel-manager"
import type { AiSignalStats } from "../../../../types/ai"
import { formatIntelActionPublicLine } from "../intel/pure"
import { GAME_SETTINGS } from "../../core/settings"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { buildAiPrivateRevealContext } from "./reveal-fns"
import { getAiIntelSummary, getAiResourceSnapshot } from "./snapshot-fns"
import { createLogger } from "../../core/logger"
const log = createLogger("AI.Intel")

/** 执行 AI 情报动作（技能或道具） */
export function executeAiIntelAction(
  deps: AiIntelManagerDeps,
  playerId: string,
  plan: IntelActionPlan
): RevealResult & { signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats } } {
  return _executeAiIntelActionImpl(deps, playerId, plan)
}

/** 处理所有 AI 玩家的情报动作（批量） */
export async function processAiIntelActions(deps: AiIntelManagerDeps): Promise<void> {
  log.debug("[fn-file] processAiIntelActions CALLED, isLanMode={0}", deps.isLanMode())
  const aiPlayers = deps.players.filter((player: Player) => !player.isHuman)
  const roundProgress = GAME_SETTINGS.maxRounds <= 1 ? 1 : (deps.getRound() - 1) / (GAME_SETTINGS.maxRounds - 1)

  const state = deps.state
  state.aiRoundEffects = {}
  state.lastAiIntelActions = []

  if (!state.aiErrorCorrectionHistory) {
    state.aiErrorCorrectionHistory = {}
  }

  const batchStartTime = Date.now()
  const batchId = `intel-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
  log.debug(
    `batch ${batchId} START, aiPlayers: ${aiPlayers.length}, players: ${aiPlayers.map((p: Player) => p.id).join(",")}`
  )

  // In LAN mode, AI decisions are handled centrally by the host
  if (deps.isLanMode()) {
    log.debug(`processAiIntelActions: LAN mode, skipping local AI processing (aiPlayers=${aiPlayers.length})`)
    return
  }

  log.info(`processAiIntelActions: processing ${aiPlayers.length} AI players: ${aiPlayers.map((p) => p.id).join(",")}`)

  return Promise.all(
    aiPlayers.map(async (player: Player) => {
      try {
        await processSingleAiIntelAction(deps, player, undefined, undefined, roundProgress, batchId, batchStartTime)
      } catch (error) {
        log.error(`${player.id} error:`, error)
      } finally {
        deps.setPlayerBidReady(player.id, true)
        deps.updateHud()

        if (!deps.isLanMode() && !deps.isRoundResolving() && !deps.isSettled() && !deps.isRoundPaused()) {
          if (deps.areAllPlayersBidReady()) {
            deps.resolveRoundBids("all-ready")
          }
        }

        if (deps.isLanMode() && deps.isLanHost()) {
          const lanBridge = deps.getLanBridge()
          if (lanBridge) {
            const readyAiPlayers = aiPlayers.filter((p: Player) => deps.roundBidReadyState[p.id])
            if (readyAiPlayers.length === aiPlayers.length) {
              lanBridge.send({
                type: "lan:ai-bids-ready",
                aiPlayerIds: deps.getLanAiPlayers().map((ai) => ai.id)
              })
            }
          }
        }
      }
    })
  )
    .then(() => {
      const batchEndTime = Date.now()
      log.debug(`batch ${batchId} END, total elapsed: ${batchEndTime - batchStartTime}ms`)

      if (state.lastAiIntelActions.length > 0) {
        const text = state.lastAiIntelActions
          .map((entry: LastAiIntelAction) => formatAiIntelActionPublicLine(deps, entry))
          .join("；")
        deps.writeLog(`他人情报行动：${text}`)
      }
    })
    .catch((error) => {
      log.error(`batch ${batchId} error:`, error)
    })
}

/** 处理单个 AI 玩家的情报动作（含 LLM 纠错流程） */
export async function processSingleAiIntelAction(
  deps: AiIntelManagerDeps,
  player: Player,
  plan?: IntelActionPlan,
  llmPlan?: LlmPlanResult | null,
  roundProgress?: number,
  batchId?: string,
  batchStartTime?: number
): Promise<void> {
  const startTime = Date.now()
  log.debug(
    `${player.id}-${startTime} START, delay from batch start: ${startTime - (batchStartTime || 0)}ms`
  )
  log.debug(
    `${player.id} plan:`,
    plan
      ? {
          actionType: plan.actionType,
          actionId: plan.actionId,
          decisionSource: plan.decisionSource,
          lockedByLlm: plan.lockedByLlm
        }
      : "null"
  )
  log.debug(
    `${player.id} llmPlan:`,
    llmPlan
      ? {
          failed: llmPlan.failed,
          hasBidDecision: llmPlan.hasBidDecision,
          bid: llmPlan.bid,
          actionId: llmPlan.actionId
        }
      : "null"
  )

  if (!deps.isLanMode() && deps.isRoundPaused()) await deps.waitUntilResumed()
  const intelSummary = getAiIntelSummary(deps, player.id)
  const resources = getAiResourceSnapshot(deps, player.id)
  const llmBidReady = Boolean(
    llmPlan && !llmPlan.failed && llmPlan.hasBidDecision && deps.canUseLlmDecisionForPlayer(player.id)
  )
  log.debug(`${player.id} llmBidReady: ${llmBidReady}`)

  if (llmBidReady) {
    deps.state.llmEverUsedThisRun = true
  }

  if (!plan) {
    plan = deps.aiEngine.planIntelAction({
      playerId: player.id,
      round: deps.getRound(),
      maxRounds: GAME_SETTINGS.maxRounds,
      intelSummary,
      resources
    })
  }

  const activePlan = plan as IntelActionPlan
  const result = _executeAiIntelActionImpl(deps, player.id, activePlan)
  log.debug(`${player.id} executeAiIntelAction result:`, {
    ok: result.ok,
    actionType: activePlan.actionType,
    actionId: activePlan.actionId,
    message: result.message
  })
  const effectiveActionType = result.ok ? activePlan.actionType : "none"
  const effectiveActionId = result.ok ? activePlan.actionId : "none"
  const effect = deps.aiEngine.buildToolEffect({
    playerId: player.id,
    actionType: effectiveActionType,
    actionId: effectiveActionId,
    roundProgress: roundProgress || 0,
    intelSummary: getAiIntelSummary(deps, player.id),
    signalStats: result.ok ? result.signalStats : null,
    planScore: activePlan.score || 0
  })

  deps.state.aiRoundEffects[player.id] = effect

  if (!result.ok && activePlan.actionType !== "none" && llmBidReady && deps.canUseLlmDecisionForPlayer(player.id)) {
    const activeLlmPlan = llmPlan as LlmPlan
    const correctionHistory = deps.state.aiErrorCorrectionHistory[player.id] || []
    const errorDetail = result.message || "未知错误"

    deps.writeLog(`[AI纠错] ${player.name} 工具执行失败: ${errorDetail}`)

    if (!deps.state.currentRunLog) {
      deps.state.currentRunLog = {
        runNo: 0,
        startedAt: Date.now(),
        aiThoughtLogs: [],
        actionLogs: [],
        roundLogsByRound: {},
        roundPanelTexts: {}
      }
    }
    const errorLogEntry = {
      round: deps.getRound(),
      playerName: player.name,
      thought: `[工具报错] 错误: ${errorDetail}\n原始决策: skill=${activePlan.actionType === "skill" ? activePlan.actionId : "无"}, item=${activePlan.actionType === "item" ? activePlan.actionId : "无"}`,
      controlMode: "error-correction" as const,
      error: errorDetail,
      at: Date.now()
    }
    deps.state.currentRunLog?.aiThoughtLogs?.push(errorLogEntry)

    const correctionPlan = await deps.requestAiLlmErrorCorrection(
      player,
      activeLlmPlan,
      errorDetail,
      correctionHistory,
      deps.getAiConversationMessages(player.id)
    )

    if (!deps.state.aiErrorCorrectionHistory[player.id]) {
      deps.state.aiErrorCorrectionHistory[player.id] = []
    }
    deps.state.aiErrorCorrectionHistory[player.id].push({
      error: errorDetail,
      aiResponse:
        correctionPlan && !correctionPlan.failed ? `出价${correctionPlan.bid}` : correctionPlan?.error || "失败",
      at: Date.now()
    })

    if (correctionPlan && !correctionPlan.failed && correctionPlan.hasBidDecision) {
      const correctionResult = _executeAiIntelActionImpl(deps, player.id, {
        actionType: correctionPlan.actionType as "skill" | "item" | "none",
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
          round: deps.getRound(),
          playerName: player.name,
          thought: `[纠错成功] 纠错次数: ${correctionPlan.correctionAttempt}/2\n新出价: ${correctionPlan.bid}\n思考: ${correctionPlan.thought || "无"}`,
          controlMode: "llm-corrected" as const,
          correctionAttempt: correctionPlan.correctionAttempt,
          at: Date.now()
        }
        deps.state.currentRunLog?.aiThoughtLogs?.push(correctionLogEntry)

        if (correctionPlan.actionType !== "none" && correctionPlan.actionId !== "none") {
          deps.recordPlayerUsage(player.id, correctionPlan.actionId)
          const correctionToolSummary = deps.buildAiToolResultSummary(
            correctionResult,
            correctionPlan.actionType,
            correctionPlan.actionId
          )
          llmPlan.toolResultSummary = correctionToolSummary
          llmPlan.toolActionType = correctionPlan.actionType
          llmPlan.toolActionId = correctionPlan.actionId

          const actionDef = deps.getActionDefById(correctionPlan.actionId)
          deps.addPublicInfoEntry({
            source: `${player.name}-${actionDef.name}(纠错)`,
            text: actionDef.description
          })

          if (deps.isLanMode() && deps.isLanHost()) {
            const lanBridge = deps.getLanBridge()
            if (lanBridge) {
              lanBridge.send({
                type: "lan:ai-item-use",
                aiPlayerId: player.lanId || player.id,
                aiPlayerName: player.name,
                actionId: correctionPlan.actionId,
                actionType: correctionPlan.actionType,
                itemName: actionDef.name,
                itemDesc: actionDef.description
              })
            }
          }

          if (deps.canUseLlmDecisionForPlayer(player.id)) {
            log.debug(`${player.id} calling correction followup LLM (tool executed)`)
            const followup = await deps.requestAiLlmFollowupBid(player, llmPlan, correctionToolSummary)
            log.debug(
              `${player.id} correction followup result:`,
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
          log.debug(`${player.id} calling correction followup LLM (no tool action)`)
          const followup = await deps.requestAiLlmFollowupBid(player, llmPlan, "工具执行失败，直接给出价")
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
          round: deps.getRound(),
          playerName: player.name,
          thought: `[纠错后执行失败] ${correctionResult.message || "未知错误"}`,
          controlMode: "rule-fallback-after-correction" as const,
          error: correctionResult.message,
          at: Date.now()
        }
        deps.state.currentRunLog?.aiThoughtLogs?.push(failLogEntry)
        if (llmPlan) {
          llmPlan.controlMode = "rule-fallback-after-correction"
          if (!llmPlan.error) {
            llmPlan.error = `纠错后执行失败: ${correctionResult.message || "未知"}`
          }
        }
      }
    } else {
      const skipLogEntry = {
        round: deps.getRound(),
        playerName: player.name,
        thought: `[纠错跳过] ${correctionPlan ? correctionPlan.error || "已达最大纠错次数" : "纠错请求失败"}`,
        controlMode: "rule-fallback-correction-skipped" as const,
        error: correctionPlan ? correctionPlan.error : "纠错请求失败",
        at: Date.now()
      }
      deps.state.currentRunLog?.aiThoughtLogs?.push(skipLogEntry)
      if (llmPlan) {
        llmPlan.controlMode = "rule-fallback-correction-skipped"
        if (!llmPlan.error) {
          llmPlan.error = correctionPlan ? `纠错跳过: ${correctionPlan.error || "已达最大纠错次数"}` : "纠错请求失败"
        }
      }
    }
    log.debug(
      `${player.id}-${startTime} END (error correction path), elapsed: ${Date.now() - startTime}ms`
    )
    return
  }

  if (!result.ok || activePlan.actionType === "none") {
    log.debug(
      `${player.id}-${startTime} END (no action), elapsed: ${Date.now() - startTime}ms`
    )
    return
  }

  deps.recordPlayerUsage(player.id, activePlan.actionId)
  const toolSummary = deps.buildAiToolResultSummary(result, activePlan.actionType, activePlan.actionId)
  deps.state.lastAiIntelActions.push({
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

  const actionDef = deps.getActionDefById(activePlan.actionId)
  deps.addPublicInfoEntry({
    source: `${player.name}-${actionDef.name}`,
    text: actionDef.description
  })

  if (deps.isLanMode() && deps.isLanHost()) {
    const lanBridge = deps.getLanBridge()
    if (lanBridge) {
      lanBridge.send({
        type: "lan:ai-item-use",
        aiPlayerId: player.lanId || player.id,
        aiPlayerName: player.name,
        actionId: activePlan.actionId,
        actionType: activePlan.actionType,
        itemName: actionDef.name,
        itemDesc: actionDef.description
      })
    }
  }

  if (llmBidReady && llmPlan && llmPlan.actionId === activePlan.actionId) {
    llmPlan.actionExecuted = true
    llmPlan.toolResultSummary = toolSummary
    llmPlan.toolActionType = activePlan.actionType
    llmPlan.toolActionId = activePlan.actionId
    llmPlan.controlMode = "llm"

    if (deps.canUseLlmDecisionForPlayer(player.id)) {
      log.debug(`${player.id} calling followup LLM, canUseLlmDecision=true`)
      const followup = await deps.requestAiLlmFollowupBid(player, llmPlan, toolSummary)
      log.debug(
        `${player.id} followup result:`,
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

  log.debug(`${player.id}-${startTime} END, elapsed: ${Date.now() - startTime}ms`)
}

/** 格式化情报动作公开行文本 */
export function formatAiIntelActionPublicLine(deps: AiIntelManagerDeps, entry: LastAiIntelAction): string {
  const info = deps.getItemInfo(entry.actionId)
  return formatIntelActionPublicLine(entry, info?.label || "未知")
}

/** 检查是否可以使用情报动作 */
export function canUseIntelActions(deps: AiIntelManagerDeps): boolean {
  if (deps.isSettled() || deps.isRoundResolving()) {
    return false
  }

  if (deps.isRoundPaused()) {
    deps.writeLog("当前处于暂停状态，请先继续回合后再操作。")
    return false
  }

  if (deps.getRoundTimeLeft() <= 0) {
    deps.writeLog("本回合已超时，无法再使用技能或道具。")
    return false
  }

  if (deps.isPlayerBidSubmitted()) {
    deps.writeLog("你已提交本轮出价，无法继续使用技能或道具。")
    return false
  }

  return true
}

// ─── 内部实现 ───

/** 执行 AI 情报动作的内部实现（不含 state 参数） */
function _executeAiIntelActionImpl(
  deps: AiIntelManagerDeps,
  playerId: string,
  plan: IntelActionPlan
): RevealResult & { signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats } } {
  const resourceState = deps.state.aiResourceState[playerId]
  if (!resourceState || !plan || plan.actionType === "none") {
    return { ok: false, revealed: 0, message: "未执行AI情报行动。" }
  }

  const usedThisRound = deps.currentRoundUsage[playerId] || []
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

    const result = skill.execute(buildAiPrivateRevealContext(deps, deps.state, playerId))
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

    const result = item.execute(buildAiPrivateRevealContext(deps, deps.state, playerId))
    if (!result.ok) {
      return result
    }

    resourceState.items[plan.actionId] = remain - 1
    return result
  }

  return { ok: false, revealed: 0, message: "未知AI行动类型。" }
}
