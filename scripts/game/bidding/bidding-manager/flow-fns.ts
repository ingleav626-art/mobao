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
      if (deps.getSettled() || deps.getRoundResolving()) {
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
  const aiPlayers = deps.players.filter((p) => !p.isHuman || (p.isHuman && deps.isP2AutoPlaying?.()))
  log.info(`kickoffAiRoundDecisions: aiPlayers count=${aiPlayers.length}, total players=${deps.players.length}, isLan=${deps.getIsLanMode()}`)

  // 联机模式无 AI 玩家时，不显示 AI 思考提示
  if (aiPlayers.length === 0) {
    log.info("kickoffAiRoundDecisions: no AI players, skipping AI thinking indicator")
    return
  }

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

  const aiPlayers = deps.players.filter((player) => !player.isHuman || (player.isHuman && deps.isP2AutoPlaying?.()))
  const aiEngine = deps.getAiEngine()
  const round = deps.getRound()
  const aiBidMap = aiEngine
    ? aiEngine.buildAIBids({
        aiPlayers,
        clueRate,
        round,
        maxRounds: GAME_SETTINGS.maxRounds,
        currentBid: deps.getCurrentBid(),
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

  log.info(`buildRoundBids: players count=${deps.players.length}, round=${round}`)

  const roundBids = deps.players.map((player) => {
    const isAutoPlaying = deps.isP2AutoPlaying?.() && player.isHuman
    if (player.isSelf && !isAutoPlaying) {
      log.info(
        `buildRoundBids: player ${player.id} (isSelf=true) -> bid=${deps.getPlayerRoundBid()} (source=playerRoundBid)`
      )
      return { playerId: player.id, bid: deps.getPlayerRoundBid() }
    }

    if (player.isHuman && !isAutoPlaying) {
      const lanHostBids = deps.getLanHostBids()
      const existingBid = player.lanId !== undefined ? lanHostBids[player.lanId] : undefined
      log.info(
        `buildRoundBids: player ${player.id} (isHuman=true, lanId=${player.lanId}) -> ` +
        `bid=${existingBid !== undefined ? existingBid : 0} (source=lanHostBids, ` +
        `lanHostBids=${JSON.stringify(lanHostBids)})`
      )
      return { playerId: player.id, bid: existingBid !== undefined ? existingBid : 0 }
    }

    const wallet = deps.getAiWallet(player.id)
    const aiBid = deps.normalizeAiBidValue(player.id, aiBidMap[player.id] ?? 0, wallet)
    log.info(
      `buildRoundBids: player ${player.id} (isAI=true) -> bid=${aiBid} (source=aiBidMap, raw=${aiBidMap[player.id] ?? 0}, wallet=${wallet})`
    )
    return { playerId: player.id, bid: aiBid }
  })

  log.info(`buildRoundBids: roundBids=${JSON.stringify(roundBids)}`)
  return roundBids
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
  const currentRound = deps.getRound()
  log.info(
    `resolveRoundBids: reason=${reason}, forceSettle=${forceSettle}, settled=${deps.getSettled()}, roundResolving=${deps.getRoundResolving()}, round=${currentRound}, isLan=${deps.getIsLanMode()}`
  )
  if (deps.getSettled() || deps.getRoundResolving()) {
    return
  }

  if (deps.getIsLanMode() && deps.getLanBridge()) {
    return
  }

  deps.setRoundResolving(true)
  deps.stopRoundTimer()

  if (AudioUI) {
    AudioUI.stopCountdown()
  }

  try {
    // 托管模式：p2 的 AI 出价直接走 buildRoundBids，不需要 playerBidSubmitted
    if (!deps.getPlayerBidSubmitted() && !deps.isP2AutoPlaying?.()) {
      deps.setPlayerRoundBid(0)
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
    deps.recordAiThoughtLogs(deps.getLastAiDecisionTelemetry())
    deps.renderAiLogicPanel()
    await revealRoundBidsSequential(deps, state, roundBids)
    deps.recordRoundHistory(roundBids)

    const sorted = [...roundBids].sort((a, b) => b.bid - a.bid)
    const first = sorted[0]
    const second = sorted[1] || { bid: 0 }
    deps.markRoundRanking(sorted)

    log.info(
      `resolveRoundBids: sorted=${JSON.stringify(sorted)}, ` +
      `first={playerId: ${first.playerId}, bid: ${first.bid}}, ` +
      `second={playerId: ${second.playerId || "none"}, bid: ${second.bid}}`
    )

    deps.setCurrentBid(first.bid)
    deps.setBidLeader(first.playerId)
    deps.setSecondHighestBid(second.bid)

    log.info(
      `resolveRoundBids: winner=${first.playerId}, currentBid=${deps.getCurrentBid()}, ` +
      `bidLeader=${deps.getBidLeader()}, secondHighestBid=${deps.getSecondHighestBid()}, ` +
      `directTakeRatio=${GAME_SETTINGS.directTakeRatio}`
    )

    const directTakeFlag = shouldDirectTake(
      currentRound,
      GAME_SETTINGS.maxRounds,
      first.bid,
      second.bid,
      GAME_SETTINGS.directTakeRatio
    )

    if (currentRound === GAME_SETTINGS.maxRounds || directTakeFlag || forceSettle) {
      const mode = forceSettle ? "manual" : currentRound === GAME_SETTINGS.maxRounds ? "final" : "direct"
      log.info(`resolveRoundBids: auction ends, mode=${mode}, winner=${first.playerId}, bid=${first.bid}`)
      await deps.finishAuction(first, mode)
      return
    }

    await delay(GAME_SETTINGS.postRevealWaitMs)

    if (MobaoAnimations) {
      await MobaoAnimations.roundTransition({
        text: "第 " + (currentRound + 1) + " 回合"
      })
    }

    deps.setRound(currentRound + 1)
    resetBiddingStateForNewRound(state, deps)
    deps.skillManager.onNewRound()
    deps.startRound()
    deps.updateHud()
    deps.writeLog(`进入第 ${deps.getRound()} 回合。`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知异常"
    deps.setRoundResolving(false)
    deps.writeLog(`回合结算异常：${message}`)
    deps.updateHud()
    log.error("resolveRoundBids failed", error)
  }
}

/**
 * 重置 BiddingManagerState 的回合级字段（换轮时调用）。
 * 对应 gameSlice.resetForNewRound。回合级状态全部通过 deps 直达 gameSlice。
 */
export function resetBiddingStateForNewRound(state: BiddingManagerState, deps: BiddingManagerDeps): void {
  deps.setCurrentBid(0)
  deps.setBidLeader("none")
  deps.setSecondHighestBid(0)
  deps.setPlayerBidSubmitted(false)
  deps.setPlayerRoundBid(0)
  deps.setRoundResolving(false)
  state.roundBidReadyState = {}
  state.keypadValue = "0"
  deps.setKeypadValue("0")
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
