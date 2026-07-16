/**
 * @file keypad-fns.ts
 * @module bidding/bidding-manager/keypad-fns
 * @description 出价键盘与玩家出价提交函数。被 BiddingManager 委托调用。
 */
import type { BiddingManagerDeps, BiddingManagerState } from "../bidding-manager"
import { createLogger } from "../../core/logger"

const log = createLogger("Bidding")

/**
 * 设置玩家出价准备状态并更新对应的 DOM 卡片样式
 */
export function setPlayerBidReady(
  deps: BiddingManagerDeps,
  state: BiddingManagerState,
  playerId: string,
  ready: boolean
): void {
  state.roundBidReadyState[playerId] = Boolean(ready)
  const cardEl = deps.dom[`playerCard-${playerId}`]
  if (cardEl) {
    cardEl.classList.toggle("bid-ready", Boolean(ready))
  }
}

/**
 * 检查所有玩家是否已提交出价
 */
export function areAllPlayersBidReady(deps: BiddingManagerDeps, state: BiddingManagerState): boolean {
  return deps.players.every((player) => Boolean(state.roundBidReadyState[player.id]))
}

/**
 * 打开出价数字键盘
 */
export function openBidKeypad(deps: BiddingManagerDeps, state: BiddingManagerState): void {
  log.info(
    `openBidKeypad: ENTRY, isLan=${deps.getIsLanMode()}, lanMySlotId=${deps.getLanMySlotId()}, ` +
    `roundBidReadyState=${JSON.stringify(state.roundBidReadyState)}, ` +
    `playerBidSubmitted=${state.playerBidSubmitted}, settled=${deps.getSettled()}, ` +
    `roundResolving=${state.roundResolving}, round=${state.round}`
  )
  if (deps.getSettled() || state.roundResolving) {
    log.info(
      `openBidKeypad: BLOCKED by ${deps.getSettled() ? "settled" : "roundResolving"}, ` +
      `settled=${deps.getSettled()}, roundResolving=${state.roundResolving}`
    )
    return
  }
  if (deps.getIsLanMode()) {
    const myId = deps.getLanMySlotId()
    if (myId && state.roundBidReadyState[myId]) {
      log.info(
        `openBidKeypad: BLOCKED by roundBidReadyState[myId], myId=${myId}, ` +
        `roundBidReadyState[${myId}]=${state.roundBidReadyState[myId]}`
      )
      deps.writeLog("你已提交本轮出价，不可再次提交。")
      return
    }
  } else if (state.playerBidSubmitted) {
    log.info(
      `openBidKeypad: BLOCKED by playerBidSubmitted, value=${state.playerBidSubmitted}`
    )
    return
  }

  log.info("openBidKeypad: opened keypad")

  deps.closeItemDrawer()
  deps.hideInfoPopup()
  const bidInput = deps.dom.bidInput as HTMLInputElement | null
  state.keypadValue = String(Math.max(0, Math.round(Number(bidInput?.value) || 0)))
  syncBidKeypadScreen(deps, state)
  updateKeypadDirectHint(deps, state)
  const keypadEl = deps.dom.bidKeypad
  if (keypadEl) {
    keypadEl.classList.remove("hidden")
  }
  if (deps.input) {
    deps.input.enabled = false
  }
}

/**
 * 关闭出价数字键盘
 */
export function closeBidKeypad(deps: BiddingManagerDeps): void {
  const keypadEl = deps.dom.bidKeypad
  if (keypadEl) {
    keypadEl.classList.add("hidden")
  }
  if (deps.input) {
    deps.input.enabled = true
  }
}

/**
 * 同步键盘屏幕显示当前出价值
 */
export function syncBidKeypadScreen(deps: BiddingManagerDeps, state: BiddingManagerState): void {
  if (deps.dom.keypadScreen) {
    deps.dom.keypadScreen.textContent = state.keypadValue
  }
  updateKeypadDirectHint(deps, state)
}

/**
 * 更新键盘上"可直接拿下"提示
 */
export function updateKeypadDirectHint(deps: BiddingManagerDeps, state: BiddingManagerState): void {
  const hintEl = deps.dom.keypadDirectHint
  if (!hintEl) return

  if (state.round >= 5 || deps.getSettled()) {
    hintEl.classList.add("hidden")
    return
  }

  const myBid = Math.max(0, Math.round(Number(state.keypadValue) || 0))
  const secondBid = state.secondHighestBid || 0
  const ratio = 0.2
  const requiredBid = secondBid > 0 ? Math.ceil(secondBid * (1 + ratio)) : 0

  if (myBid > 0 && requiredBid > 0 && myBid >= requiredBid) {
    hintEl.textContent = "可直接拿下"
    hintEl.classList.remove("hidden")
  } else if (requiredBid > 0) {
    const displayRatio = (1 + ratio).toFixed(1)
    hintEl.textContent = `达第2名${displayRatio}倍可拿下`
    hintEl.classList.remove("hidden")
  } else {
    hintEl.classList.add("hidden")
  }
}

/**
 * 处理键盘输入（数字键/清除/删除/确认）
 */
export function handleBidKeyInput(deps: BiddingManagerDeps, state: BiddingManagerState, key: string): void {
  if (key === "clear") {
    state.keypadValue = "0"
    syncBidKeypadScreen(deps, state)
    return
  }

  if (key === "del") {
    state.keypadValue = state.keypadValue.length <= 1 ? "0" : state.keypadValue.slice(0, -1)
    syncBidKeypadScreen(deps, state)
    return
  }

  if (key === "ok") {
    const bid = Math.max(0, Math.round(Number(state.keypadValue) || 0))
    const bidInput = deps.dom.bidInput as HTMLInputElement | null
    if (bidInput) bidInput.value = String(bid)
    closeBidKeypad(deps)
    deps.showGameConfirm(`确认出价 ${bid.toLocaleString()} ？`, () => playerBid(deps, state))
    return
  }

  const next = state.keypadValue === "0" ? key : state.keypadValue + key
  state.keypadValue = String(Math.min(99999999, Number(next) || 0))
  syncBidKeypadScreen(deps, state)
}

/**
 * 玩家提交出价
 */
export function playerBid(deps: BiddingManagerDeps, state: BiddingManagerState): void {
  log.info(
    `playerBid: ENTRY, isLan=${deps.getIsLanMode()}, mySlotId=${deps.getLanMySlotId()}, ` +
    `amount=${Number((deps.dom.bidInput as HTMLInputElement | null)?.value || 0)}, ` +
    `playerBidSubmitted=${state.playerBidSubmitted}, settled=${deps.getSettled()}, ` +
    `roundResolving=${state.roundResolving}, roundBidReadyState=${JSON.stringify(state.roundBidReadyState)}`
  )
  deps.closeItemDrawer()

  if (deps.getSettled()) {
    deps.writeLog("本局已结算，请重新开局。")
    return
  }

  if (state.roundResolving) {
    deps.writeLog("本轮正在结算中，请等待出价揭示。")
    return
  }

  if (deps.getRoundPaused()) {
    deps.writeLog("当前回合已暂停，请先继续回合再提交出价。")
    return
  }

  if (deps.getIsLanMode()) {
    const myId = deps.getLanMySlotId()
    if (myId && state.roundBidReadyState[myId]) {
      deps.writeLog("你已提交本轮出价，不可再次提交。")
      return
    }
  } else if (state.playerBidSubmitted) {
    deps.writeLog("你已提交本轮出价，不可再次提交。")
    return
  }

  const inputValue = Number((deps.dom.bidInput as HTMLInputElement | null)?.value || 0)
  if (!Number.isFinite(inputValue) || inputValue < 0) {
    deps.writeLog("请输入有效出价金额（允许 0）。")
    return
  }

  if (inputValue > deps.getPlayerMoney()) {
    deps.writeLog("资金不足，无法按该金额出价。")
    return
  }

  state.playerRoundBid = Math.round(inputValue)
  deps.setPlayerRoundBid(state.playerRoundBid)
  state.playerBidSubmitted = true
  deps.setPlayerBidSubmitted(true)

  const myId = deps.getIsLanMode() ? deps.getLanMySlotId() : "p2"
  log.info(
    `playerBid: stored playerRoundBid=${state.playerRoundBid}, playerBidSubmitted=true, ` +
    `roundBidReadyState=${JSON.stringify(state.roundBidReadyState)}, myId=${myId}`
  )
  if (myId) setPlayerBidReady(deps, state, myId, true)
  closeBidKeypad(deps)
  deps.writeLog(`玩家已提交本轮密封出价：${state.playerRoundBid}。提交后不可再用道具/技能。`)
  deps.updateHud()

  if (deps.getIsLanMode() && deps.getLanBridge()) {
    log.info(`playerBid: calling lanBridge.submitBid(${state.playerRoundBid})`)
    deps.getLanBridge()!.submitBid(state.playerRoundBid)
    return
  }

  if (!state.roundResolving && areAllPlayersBidReady(deps, state)) {
    log.info("playerBid: all players ready, calling resolveRoundBids(all-ready)")
    deps.resolveRoundBids("all-ready")
  }
}
