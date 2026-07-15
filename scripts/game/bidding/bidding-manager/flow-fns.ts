/**
 * @file flow-fns.ts
 * @module bidding/bidding-manager/flow-fns
 * @description 出价流程控制函数（回合结算、出价构建、揭示动画、AI 决策调度）。
 *             被 BiddingManager 委托调用。
 */
import type { BiddingManagerDeps, BiddingManagerState } from "../bidding-manager"
import { delay, formatBidRevealNumber } from "../../core/utils"
import { GAME_SETTINGS } from "../../core/settings"
import { AudioUI } from "../../../audio/audio-ui"
import { MobaoAnimations } from "../../animations"
import { getLastRoundBidMap, shouldDirectTake } from "../index"
import { createLogger } from "../../core/logger"
const log = createLogger("Bidding")

// ─── 工具 ───

/**
 * 等待回合恢复（暂停状态轮询）
 */
export function waitUntilResumed(deps: BiddingManagerDeps, state: BiddingManagerState): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!deps.getRoundPaused()) {
      resolve()
      return
    }
    const check = () => {
      if (deps.getSettled() || state.roundResolving) {
        reject(new Error("PAUSE_CANCELLED"))
        return
      }
      if (!deps.getRoundPaused()) {
        resolve()
        return
      }
      setTimeout(check, 200)
    }
    check()
  })
}

/**
 * 触发 AI 出价决策（异步，独立并发）
 */
export async function kickoffAiRoundDecisions(deps: BiddingManagerDeps, state: BiddingManagerState): Promise<void> {
  log.debug(">>> ENTERED")
  const indicator = deps.dom.aiThinkingIndicator
  if (indicator && !indicator.dataset.aiThinking) {
    indicator.dataset.aiThinking = "1"
    indicator.classList.remove("hidden")
  }
  try {
    if (!deps.getIsLanMode() && deps.getRoundPaused()) await waitUntilResumed(deps, state)
    await deps.processAiDecisions()
  } catch (error: unknown) {
    log.error("ERROR:", error)
    const errMsg = error instanceof Error ? error.message : String(error)
    if (errMsg === "PAUSE_CANCELLED") return
    deps.writeLog(`AI回合初始化异常：${errMsg}`)
  }
}

// ─── 出价揭示 ───

/**
 * 设置玩家出价显示（DOM 动画）
 */
export function setPlayerBidDisplay(deps: BiddingManagerDeps, playerId: string, bid: number, order: number): void {
  const bidEl = document.getElementById(`bid-${playerId}`)
  const cardEl = document.getElementById(`playerCard-${playerId}`)
  if (bidEl) {
    bidEl.textContent = `${formatBidRevealNumber(bid)} #${order}`
    bidEl.classList.remove("bid-reveal")
    void bidEl.offsetWidth
    bidEl.classList.add("bid-reveal")
    window.setTimeout(() => bidEl.classList.remove("bid-reveal"), 480)
  }
  if (cardEl) {
    cardEl.classList.add("revealed")
    cardEl.classList.remove("bid-pop")
    void cardEl.offsetWidth
    cardEl.classList.add("bid-pop")
    window.setTimeout(() => cardEl.classList.remove("bid-pop"), 520)
  }
}

/**
 * 逐个揭示所有玩家出价（带动画间隔）
 */
export async function revealRoundBidsSequential(
  deps: BiddingManagerDeps,
  _state: BiddingManagerState,
  roundBids: Array<{ playerId: string; bid: number }>
): Promise<void> {
  for (let i = 0; i < deps.players.length; i += 1) {
    const player = deps.players[i]
    const bidInfo = roundBids.find((entry) => entry.playerId === player.id)
    if (!bidInfo) continue
    setPlayerBidDisplay(deps, player.id, bidInfo.bid, i + 1)
    deps.writeLog(`${player.name} 本轮出价：${bidInfo.bid}`)
    if (AudioUI) {
      AudioUI.playReveal()
    }
    await delay(GAME_SETTINGS.bidRevealIntervalMs)
  }
}

// ─── 出价构建 ───

/**
 * 构建本轮所有玩家的出价列表
 */
export function buildRoundBids(
  deps: BiddingManagerDeps,
  state: BiddingManagerState
): Array<{ playerId: string; bid: number }> {
  const items = deps.getItems()
  const clueRate = items.length === 0 ? 0 : items.filter((item) => deps.hasAnyInfo(item)).length / items.length
  const lastRoundBids = getLastRoundBidMap(deps.getPlayerRoundHistory())
  const aiIntelMap = deps.buildAiIntelSnapshot()

  const aiPlayers = deps.players.filter((player) => !player.isHuman)
  const aiEngine = deps.getAiEngine()
  const aiBidMap = aiEngine
    ? aiEngine.buildAIBids({
        aiPlayers,
        clueRate,
        round: state.round,
        maxRounds: GAME_SETTINGS.maxRounds,
        currentBid: state.currentBid,
        lastRoundBids,
        bidStep: GAME_SETTINGS.bidStep,
        aiIntelMap,
        aiToolEffectMap: deps.getAiRoundEffects(),
        itemCount: items.length
      })
    : {}

  aiPlayers.forEach((player) => {
    const plan = deps.getAiLlmRoundPlans()[player.id]
    log.debug(
      `${player.id} aiLlmPlan:`,
      plan
        ? {
            failed: plan.failed,
            hasBidDecision: plan.hasBidDecision,
            bid: plan.bid,
            canUseLlm: deps.canUseLlmDecisionForPlayer(player.id)
          }
        : "null"
    )
    if (!plan || plan.failed || !plan.hasBidDecision || !deps.canUseLlmDecisionForPlayer(player.id)) {
      return
    }

    const wallet = deps.getAiWallet(player.id)
    const normalizedBid = deps.normalizeAiBidValue(player.id, plan.bid!, wallet)
    log.debug(
      `${player.id} LLM bid override: ${aiBidMap[player.id]} -> ${normalizedBid} (wallet=${wallet})`
    )
    aiBidMap[player.id] = normalizedBid
  })

  return deps.players.map((player) => {
    if (player.isSelf) {
      return { playerId: player.id, bid: state.playerRoundBid }
    }

    if (player.isHuman) {
      const lanHostBids = deps.getLanHostBids()
      const existingBid = player.lanId !== undefined ? lanHostBids[player.lanId] : undefined
      return { playerId: player.id, bid: existingBid !== undefined ? existingBid : 0 }
    }

    const wallet = deps.getAiWallet(player.id)
    const aiBid = deps.normalizeAiBidValue(player.id, aiBidMap[player.id] ?? 0, wallet)
    return { playerId: player.id, bid: aiBid }
  })
}

// ─── 回合结算 ───

/**
 * 结算当前回合：收集出价、揭示、排名、判定直接拿下或进入下一轮
 */
export async function resolveRoundBids(
  deps: BiddingManagerDeps,
  state: BiddingManagerState,
  reason: string = "manual",
  forceSettle: boolean = false
): Promise<void> {
  log.info(
    `reason=${reason}, forceSettle=${forceSettle}, settled=${deps.getSettled()}, roundResolving=${state.roundResolving}, round=${state.round}, isLanMode=${deps.getIsLanMode()}`
  )
  if (deps.getSettled() || state.roundResolving) {
    return
  }

  if (deps.getIsLanMode() && deps.getLanBridge()) {
    return
  }

  state.roundResolving = true
  deps.stopRoundTimer()

  if (AudioUI) {
    AudioUI.stopCountdown()
  }

  try {
    if (!state.playerBidSubmitted) {
      state.playerRoundBid = 0
      deps.writeLog(reason === "timeout" ? "回合超时：玩家本轮出价记为 0。" : "玩家未提交出价，本轮按 0 处理。")
      const myId = deps.getIsLanMode() ? deps.getLanMySlotId() : "p2"
      if (myId) {
        state.roundBidReadyState[myId] = true
        const cardEl = deps.dom[`playerCard-${myId}`]
        if (cardEl) {
          cardEl.classList.toggle("bid-ready", true)
        }
      }
    }

    deps.updateHud()

    const roundBids = buildRoundBids(deps, state)
    log.debug(
      "final roundBids:",
      roundBids.map((b) => ({ playerId: b.playerId, bid: b.bid }))
    )
    deps.captureAiDecisionTelemetry(roundBids)
    state.lastAiDecisionTelemetry = deps.getLastAiDecisionTelemetry()
    deps.recordAiThoughtLogs(state.lastAiDecisionTelemetry)
    deps.renderAiLogicPanel()
    await revealRoundBidsSequential(deps, state, roundBids)
    deps.recordRoundHistory(roundBids)

    const sorted = [...roundBids].sort((a, b) => b.bid - a.bid)
    const first = sorted[0]
    const second = sorted[1] || { bid: 0 }
    deps.markRoundRanking(sorted)

    state.currentBid = first.bid
    state.bidLeader = first.playerId
    state.secondHighestBid = second.bid

    const directTakeFlag = shouldDirectTake(
      state.round,
      GAME_SETTINGS.maxRounds,
      first.bid,
      second.bid,
      GAME_SETTINGS.directTakeRatio
    )

    if (state.round === GAME_SETTINGS.maxRounds || directTakeFlag || forceSettle) {
      const mode = forceSettle ? "manual" : state.round === GAME_SETTINGS.maxRounds ? "final" : "direct"
      await deps.finishAuction(first, mode)
      return
    }

    await delay(GAME_SETTINGS.postRevealWaitMs)

    if (MobaoAnimations) {
      await MobaoAnimations.roundTransition({
        text: "第 " + (state.round + 1) + " 回合"
      })
    }

    state.round += 1
    deps.skillManager.onNewRound()
    deps.startRound()
    deps.updateHud()
    deps.writeLog(`进入第 ${state.round} 回合。`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知异常"
    state.roundResolving = false
    deps.writeLog(`回合结算异常：${message}`)
    deps.updateHud()
    log.error("resolveRoundBids failed", error)
  }
}

/**
 * 结算当前对局（手动触发）
 */
export function settleCurrentRun(deps: BiddingManagerDeps, state: BiddingManagerState): void {
  if (deps.getIsLanMode() && !deps.getLanIsHost()) return
  if (deps.getSettled()) {
    deps.writeLog("本局已结算，请重新开局。")
    return
  }

  resolveRoundBids(deps, state, "manual", true)
}
