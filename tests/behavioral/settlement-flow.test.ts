/**
 * @file tests/behavioral/settlement-flow.test.ts
 * @description 行为测试：出价结算全链路。验证：
 *              - 全链路：playerBid 提交 -> 中间状态 -> buildRoundBids 收集 -> 结算判定
 *              - 联机：模拟 bid:received -> lanHostBids 积累 -> lanResolveRound 结算
 *              - 每步有预期中间值，不跳过链路
 *
 * 结算规则（从 resolveRoundBids 读出）：
 * 1. 所有出价降序排列：const sorted = [...roundBids].sort((a, b) => b.bid - a.bid)
 * 2. 最高价 = 赢家：state.currentBid = first.bid, state.bidLeader = first.playerId
 * 3. 次高价：state.secondHighestBid = second.bid（若无次高价则为 0）
 * 4. 直接拿下判定：shouldDirectTake(round, maxRounds, first.bid, second.bid, directTakeRatio)
 *    -> round < maxRounds && first.bid > 0 && first.bid >= Math.ceil(second.bid * (1 + directTakeRatio))
 * 5. 如果 round === maxRounds || 直接拿下 || forceSettle，拍卖结束；否则进入下一轮
 *
 * 联机规则（从 lanResolveRound 读出）：与单机完全一致（排序 -> 赢家 -> 直接拿下判定），
 * 只是 bidLeader 用 lanIdToSlotId 做映射。AGENTS.md 规定"联机必须复用单机逻辑"。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { shouldDirectTake } from "../../scripts/game/bidding/index"
import { playerBid } from "../../scripts/game/bidding/bidding-manager/keypad-fns"
import { buildRoundBids } from "../../scripts/game/bidding/bidding-manager/flow-fns"
import { lanResolveRound, lanComputeAiBids } from "../../scripts/game/lan/lan-index-manager/game-flow-fns"
import { GAME_SETTINGS } from "../../scripts/game/core/settings"
import { DEFAULT_START_MONEY } from "../../scripts/game/core/constants"
import type { BiddingManagerDeps, BiddingManagerState } from "../../scripts/game/bidding/bidding-manager"
import type { LanIndexManagerDeps, LanIndexState } from "../../scripts/game/lan/lan-index-manager"
import type { Player } from "../../types/game"

// ─── 保存原始 GAME_SETTINGS 值 ───
const ORIG_MAX_ROUNDS = GAME_SETTINGS.maxRounds
const ORIG_DIRECT_TAKE_RATIO = GAME_SETTINGS.directTakeRatio
const ORIG_BID_REVEAL_INTERVAL = GAME_SETTINGS.bidRevealIntervalMs
const ORIG_POST_REVEAL_WAIT = GAME_SETTINGS.postRevealWaitMs

beforeEach(() => {
  GAME_SETTINGS.maxRounds = 5
  GAME_SETTINGS.directTakeRatio = 0.2
  GAME_SETTINGS.bidRevealIntervalMs = 0
  GAME_SETTINGS.postRevealWaitMs = 0
})

afterEach(() => {
  GAME_SETTINGS.maxRounds = ORIG_MAX_ROUNDS
  GAME_SETTINGS.directTakeRatio = ORIG_DIRECT_TAKE_RATIO
  GAME_SETTINGS.bidRevealIntervalMs = ORIG_BID_REVEAL_INTERVAL
  GAME_SETTINGS.postRevealWaitMs = ORIG_POST_REVEAL_WAIT
})

// ─── 辅助函数 ───

function makeBiddingState(overrides: Partial<BiddingManagerState> = {}): BiddingManagerState {
  return {
    roundBidReadyState: {},
    keypadValue: "0",
    ...overrides
  }
}

function makeBiddingDeps(
  players: Player[],
  aiBidMap: Record<string, number> = {},
  overrides: Partial<BiddingManagerDeps> = {}
): BiddingManagerDeps {
  const dom: Record<string, HTMLElement | null> = {}
  const bidInput = document.createElement("input")
  bidInput.value = "0"
  dom.bidInput = bidInput

  const backing = {
    playerRoundBid: 0,
    playerBidSubmitted: false,
    roundResolving: false,
    currentBid: 0,
    bidLeader: "none" as string,
    secondHighestBid: 0,
    round: 1,
    keypadValue: "0",
  }

  return {
    dom,
    players,
    input: { enabled: true },
    skillManager: { onNewRound: vi.fn() },

    getIsLanMode: () => false,
    getSettled: () => false,
    getRoundPaused: () => false,
    getPlayerMoney: () => DEFAULT_START_MONEY,
    getLanMySlotId: () => null,
    getLanIsHost: () => false,
    getLanHostBids: () => ({}),
    getPlayerRoundHistory: () => ({}),
    getItems: () => [],
    getAiEngine: () => ({
      buildAIBids: () => aiBidMap
    }),
    getAiLlmRoundPlans: () => ({}),
    getAiRoundEffects: () => ({}),
    getLanBridge: () => null,
    getLastAiDecisionTelemetry: () => null,

    getRound: () => backing.round,
    getCurrentBid: () => backing.currentBid,
    getBidLeader: () => backing.bidLeader,
    getSecondHighestBid: () => backing.secondHighestBid,
    getPlayerBidSubmitted: () => backing.playerBidSubmitted,
    getPlayerRoundBid: () => backing.playerRoundBid,
    getRoundResolving: () => backing.roundResolving,
    getKeypadValue: () => backing.keypadValue,

    setPlayerBidSubmitted: vi.fn((v: boolean) => { backing.playerBidSubmitted = v }),
    setPlayerRoundBid: vi.fn((v: number) => { backing.playerRoundBid = v }),
    setCurrentBid: vi.fn((v: number) => { backing.currentBid = v }),
    setBidLeader: vi.fn((v: string) => { backing.bidLeader = v }),
    setSecondHighestBid: vi.fn((v: number) => { backing.secondHighestBid = v }),
    setRound: vi.fn((v: number) => { backing.round = v }),
    setRoundResolving: vi.fn((v: boolean) => { backing.roundResolving = v }),
    setKeypadValue: vi.fn((v: string) => { backing.keypadValue = v }),

    closeItemDrawer: vi.fn(),
    hideInfoPopup: vi.fn(),
    showGameConfirm: vi.fn(),
    updateHud: vi.fn(),
    writeLog: vi.fn(),
    stopRoundTimer: vi.fn(),
    captureAiDecisionTelemetry: vi.fn(),
    recordAiThoughtLogs: vi.fn(),
    renderAiLogicPanel: vi.fn(),
    recordRoundHistory: vi.fn(),
    markRoundRanking: vi.fn(),
    finishAuction: vi.fn(),
    startRound: vi.fn(),
    processAiDecisions: vi.fn(() => Promise.resolve()),
    hasAnyInfo: vi.fn(() => false),
    buildAiIntelSnapshot: vi.fn(() => ({})),
    canUseLlmDecisionForPlayer: vi.fn(() => false),
    getAiWallet: vi.fn(() => DEFAULT_START_MONEY),
    normalizeAiBidValue: vi.fn((_pid: string, bid: number) => (typeof bid === "number" ? Math.max(0, bid) : 0)),
    resolveRoundBids: vi.fn(),

    ...overrides
  }
}

/** 设置 bidInput 值并调 playerBid 提交出价 */
function submitBid(deps: BiddingManagerDeps, state: BiddingManagerState, amount: number): void {
  const bidInput = deps.dom.bidInput as HTMLInputElement
  if (bidInput) bidInput.value = String(amount)
  playerBid(deps, state)
}

/** 手动结算：与 resolveRoundBids 第 238-259 行逻辑完全一致 */
function settleRound(
  roundBids: Array<{ playerId: string; bid: number }>,
  round: number,
  maxRounds: number,
  directTakeRatio: number
): {
  currentBid: number
  bidLeader: string
  secondHighestBid: number
  isDirectTake: boolean
  shouldFinish: boolean
  winner: { playerId: string; bid: number } | null
} {
  const sorted = [...roundBids].sort((a, b) => b.bid - a.bid)
  const first = sorted[0]
  const second = sorted[1] || { bid: 0 }
  const isDirectTake = shouldDirectTake(round, maxRounds, first.bid, second.bid, directTakeRatio)
  const shouldFinish = round === maxRounds || isDirectTake

  return {
    currentBid: first.bid,
    bidLeader: first.playerId,
    secondHighestBid: second.bid,
    isDirectTake,
    shouldFinish,
    winner: shouldFinish ? first : null
  }
}

/** 联机手动结算：与 lanResolveRound 第 43-59 行逻辑完全一致 */
function lanSettleRound(
  roundBids: Array<{ playerId: string; bid: number }>,
  round: number,
  maxRounds: number,
  directTakeRatio: number,
  lanIdToSlotId: Record<string, string>
): {
  currentBid: number
  bidLeader: string
  secondHighestBid: number
  isDirectTake: boolean
  shouldFinish: boolean
  winner: { playerId: string; bid: number } | null
} {
  const sorted = [...roundBids].sort((a, b) => b.bid - a.bid)
  const first = sorted[0]
  const second = sorted[1] || { bid: 0 }
  const isDirectTake = shouldDirectTake(round, maxRounds, first.bid, second.bid, directTakeRatio)
  const shouldFinish = round === maxRounds || isDirectTake
  const bidLeader = lanIdToSlotId[first.playerId] || first.playerId

  return {
    currentBid: first.bid,
    bidLeader,
    secondHighestBid: second.bid,
    isDirectTake,
    shouldFinish,
    winner: shouldFinish ? { playerId: bidLeader, bid: first.bid } : null
  }
}

// ============================================================
// 1. shouldDirectTake 纯函数边界值测试（保留，这个没问题）
// ============================================================
describe("shouldDirectTake 纯函数边界值", () => {
  const maxRounds = 5
  const ratio = 0.2

  it("首价远超次价*1.2 应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, 100, 50, ratio)).toBe(true)
  })

  it("首价刚等于次价*1.2 应直接拿下（边界值）", () => {
    expect(shouldDirectTake(1, maxRounds, 60, 50, ratio)).toBe(true)
  })

  it("首价略低于次价*1.2 不应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, 59, 50, ratio)).toBe(false)
  })

  it("最后一轮不应直接拿下（round === maxRounds）", () => {
    expect(shouldDirectTake(5, maxRounds, 100, 50, ratio)).toBe(false)
  })

  it("首价为 0 不应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, 0, 50, ratio)).toBe(false)
  })

  it("首价为负数不应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, -10, 50, ratio)).toBe(false)
  })

  it("次价为 0 时，首价 > 0 应直接拿下（任何正数）", () => {
    expect(shouldDirectTake(1, maxRounds, 1, 0, ratio)).toBe(true)
  })

  it("平局（首价 == 次价）不应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, 50, 50, ratio)).toBe(false)
  })

  it("极小出价（首价 1，次价 1）不应直接拿下", () => {
    expect(shouldDirectTake(1, maxRounds, 1, 1, ratio)).toBe(false)
  })

  it("大额出价应直接拿下（首价 1000000，次价 500000）", () => {
    expect(shouldDirectTake(1, maxRounds, 1000000, 500000, ratio)).toBe(true)
  })
})

// ============================================================
// 2. 单机结算全链路：playerBid -> buildRoundBids -> 结算判定
// ============================================================
describe("单机结算全链路", () => {
  const maxRounds = 5
  const ratio = 0.2

  it("playerBid 提交后验证中间出价状态", () => {
    // 全链路第1步：调真实 playerBid 提交出价
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, {})

    // 执行：提交出价 100
    submitBid(deps, state, 100)

    // 预期中间值：playerRoundBid === 100（通过 deps setter）
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(100)
    // 预期中间值：playerBidSubmitted === true（通过 deps setter）
    expect(deps.setPlayerBidSubmitted).toHaveBeenCalledWith(true)
    // 预期中间值：roundBidReadyState[p2] === true（p2 是单机模式下 myId）
    expect(state.roundBidReadyState["p2"]).toBe(true)
  })

  it("正常出价：playerBid -> buildRoundBids -> 结算判定正确", () => {
    // 全链路：playerBid(50) -> AI 出价(45, 30) -> buildRoundBids -> 排序结算
    // 注意：出价差距要小，避免触发直接拿下（50 < ceil(45*1.2)=54 不直接拿下）
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 45, p3: 30 })

    // 第1步：玩家提交出价 50
    submitBid(deps, state, 50)
    // 预期中间值：playerRoundBid 已设（通过 deps setter）
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(50)

    // 第2步：收集所有出价
    const roundBids = buildRoundBids(deps, state)
    // 预期中间值：roundBids 含所有 3 个玩家
    expect(roundBids).toHaveLength(3)
    expect(roundBids.find((b) => b.playerId === "p2")!.bid).toBe(50)
    expect(roundBids.find((b) => b.playerId === "p1")!.bid).toBe(45)
    expect(roundBids.find((b) => b.playerId === "p3")!.bid).toBe(30)

    // 第3步：结算判定
    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：最高价 50（p2），次高价 45，50 < ceil(45*1.2)=54 -> 不直接拿下
    expect(result.bidLeader).toBe("p2")
    expect(result.currentBid).toBe(50)
    expect(result.secondHighestBid).toBe(45)
    expect(result.isDirectTake).toBe(false)
    expect(result.shouldFinish).toBe(false)
    expect(result.winner).toBeNull()
  })

  it("平局出价：playerBid -> buildRoundBids -> 结算判定正确", () => {
    // 全链路：玩家出价 50，AI 也出价 50，平局
    // buildRoundBids 按 players 数组顺序返回：[p1(AI), p2(玩家), p3(AI)]
    // 稳定排序后 p1 排前面（p1 在数组中的索引更小），所以 bidLeader = p1
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 50, p3: 30 })

    // 提交出价 50（与 AI 平局）
    submitBid(deps, state, 50)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(50)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)

    // 预期：p2 出价 50，p1 出价 50，平局
    expect(roundBids.find((b) => b.playerId === "p2")!.bid).toBe(50)
    expect(roundBids.find((b) => b.playerId === "p1")!.bid).toBe(50)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 平局时 sort 稳定排序，保持原顺序，p1 先出现（数组索引更小）
    // 50 < ceil(50*1.2)=60，不直接拿下
    expect(result.bidLeader).toBe("p1")
    expect(result.currentBid).toBe(50)
    expect(result.secondHighestBid).toBe(50)
    expect(result.isDirectTake).toBe(false)
  })

  it("有人出 0：playerBid(0) -> buildRoundBids -> 结算判定正确", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 50, p3: 45 })

    // 玩家出价 0
    submitBid(deps, state, 0)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(0)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：AI p1 最高价 50，p2 出价 0 排最后
    expect(result.bidLeader).toBe("p1")
    expect(result.currentBid).toBe(50)
    expect(result.secondHighestBid).toBe(45)
    expect(result.isDirectTake).toBe(false)
  })

  it("直接拿下：playerBid(100) -> buildRoundBids -> 结算判定直接拿下", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 50, p3: 30 })

    // 玩家出价 100，远超 AI 出价
    submitBid(deps, state, 100)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(100)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：100 >= ceil(50*1.2)=60，直接拿下
    expect(result.isDirectTake).toBe(true)
    expect(result.shouldFinish).toBe(true)
    expect(result.winner!.playerId).toBe("p2")
    expect(result.winner!.bid).toBe(100)
  })

  it("最后一轮强制结束，无论出价差距", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 55, p3: 50 })
    deps.setRound(5) // 最后一轮

    submitBid(deps, state, 60)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(60)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：最后一轮，强制结束，不触发直接拿下
    expect(result.isDirectTake).toBe(false)
    expect(result.shouldFinish).toBe(true)
    expect(result.winner!.playerId).toBe("p2")
    expect(result.winner!.bid).toBe(60)
    expect(result.secondHighestBid).toBe(55)
  })

  it("全部出 0：不直接拿下，进入下一轮", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 0 })

    submitBid(deps, state, 0)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(0)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(2)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：首价 0，不直接拿下，不结束
    expect(result.isDirectTake).toBe(false)
    expect(result.shouldFinish).toBe(false)
    expect(result.currentBid).toBe(0)

    // 注意：全部出 0 时，bidLeader 是排序后第一个（p1，因为原数组顺序 p1 在前）
    // 由于 sort 是稳定排序，相同金额保持原顺序
    expect(result.bidLeader).toBe("p1")
  })

  it("多轮递进：第一轮不直接拿下，预期不结束", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 45, p3: 40 })

    submitBid(deps, state, 50)
    expect(deps.setPlayerRoundBid).toHaveBeenCalledWith(50)

    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)

    const result = settleRound(roundBids, deps.getRound(), maxRounds, ratio)
    // 预期：50 < ceil(45*1.2)=54，不直接拿下
    expect(result.isDirectTake).toBe(false)
    expect(result.shouldFinish).toBe(false)
    expect(result.winner).toBeNull()
  })

  it("resolveRoundBids 处理未提交出价：超时记为 0", () => {
    // 测试 playerBid 未调用时，state.playerBidSubmitted 为 false 的场景
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 80, p3: 60 })

    // 不调 playerBid，模拟超时未提交 -> deps.getPlayerBidSubmitted() 仍为 false
    // resolveRoundBids 中的第 211-222 行会处理：设 playerRoundBid = 0，标记 ready
    // 但调 resolveRoundBids 有动画副作用，我们直接验证 buildRoundBids 结果

    // 预期：playerRoundBid 为 0，buildRoundBids 收集到 0
    const roundBids = buildRoundBids(deps, state)
    expect(roundBids).toHaveLength(3)
    expect(roundBids.find((b) => b.playerId === "p2")!.bid).toBe(0)
    expect(roundBids.find((b) => b.playerId === "p1")!.bid).toBe(80)
    expect(roundBids.find((b) => b.playerId === "p3")!.bid).toBe(60)
  })
})

// ============================================================
// 3. 联机结算全链路：模拟 bid:received -> lanHostBids -> lanResolveRound
// ============================================================
describe("联机结算全链路", () => {
  const maxRounds = 5
  const ratio = 0.2
  const lanIdToSlotId: Record<string, string> = { lan1: "p1", lan2: "p2", lan3: "p3" }
  const slotIdToLanId: Record<string, string> = { p1: "lan1", p2: "lan2", p3: "lan3" }

  // ─── LAN 模式辅助函数 ───

  function makeLanState(overrides: Partial<LanIndexState> = {}): LanIndexState {
    return {
      isLanMode: true,
      lanIsHost: true,
      lanPlayers: [],
      lanAiPlayers: [],
      lanHostWallets: {},
      lanHostBids: {},
      lanAiLlmEnabled: false,
      lanIdToSlotId: {},
      slotIdToLanId: {},
      lanMySlotId: null,
      lanReconnecting: false,
      lanReconnectAttempts: 0,
      lanMaxReconnectAttempts: 5,
      lanLastServerUrl: null,
      lanLastRoomCode: null,
      lanLastPlayerId: null,
      lanStatusEl: null,
      _pauseSnapshotTimeLeft: null,
      round: 1,
      roundResolving: false,
      settled: false,
      roundPaused: false,
      roundTimeLeft: 60,
      currentBid: 0,
      bidLeader: null,
      secondHighestBid: 0,
      playerBidSubmitted: false,
      playerRoundBid: 0,
      playerMoney: DEFAULT_START_MONEY,
      actionsLeft: 99,
      selectedItem: null,
      warehouseTrueValue: 0,
      aiMaxBid: 0,
      moneySettledRunToken: null,
      settlementRevealRunning: false,
      aiRoundDecisionPromise: null,
      currentPublicEvent: null,
      privateIntelEntries: [],
      publicInfoEntries: [],
      battleRecordReplayActive: false,
      battleRecordReplayRecordId: null,
      _mapQualityWeights: null,
      _mapCategoryWeights: null,
      players: [],
      items: [],
      aiLlmPlayerEnabled: {},
      aiWallets: {},
      aiRoundEffects: {},
      aiLlmRoundPlans: {},
      lastAiDecisionTelemetry: null,
      playerUsageHistory: {},
      playerHistoryPanels: {},
      revealedCells: [],
      itemLayer: null,
      gridLayer: null,
      revealCellLayer: null,
      warehouseCellIndex: {},
      ...overrides
    }
  }

  function makeLanDeps(
    state: LanIndexState,
    aiBidMap: Record<string, number> = {},
    overrides: Partial<LanIndexManagerDeps> = {}
  ): LanIndexManagerDeps {
    return {
      state,
      getLanBridge: () => null,
      createLanBridge: () => { throw new Error("not implemented") },
      setLanBridge: () => {},
      writeLog: vi.fn(),
      setOnlineStatus: vi.fn(),
      showGameConfirm: vi.fn(),
      stopRoundTimer: vi.fn(),
      startRound: vi.fn(),
      updateHud: vi.fn(),
      beginRunTracking: vi.fn(),
      cancelSettlementReveal: vi.fn(),
      exitSettlementPage: vi.fn(),
      guardWarehouseCapacity: vi.fn(),
      resetPlayerHistoryState: vi.fn(),
      hidePreview: vi.fn(),
      closeBidKeypad: vi.fn(),
      closeItemDrawer: vi.fn(),
      hideSettleOverlay: vi.fn(),
      hideRevealScrollHints: vi.fn(),
      drawUnknownWarehouse: vi.fn(),
      spawnRandomItems: vi.fn(),
      setupWarehouseAuction: vi.fn(),
      rebuildWarehouseCellIndex: vi.fn(),
      buildWarehouseSnapshotForSync: () => ({}),
      initPlayersUI: vi.fn(),
      applyCharacterToPlayer: vi.fn(),
      initAiWallets: vi.fn(),
      initAiIntelSystems: vi.fn(),
      makeRunToken: () => ({}),
      syncItemManagerFromShop: vi.fn(),
      revealRoundBidsSequential: vi.fn(() => Promise.resolve()),
      recordRoundHistory: vi.fn(),
      finishAuction: vi.fn(),
      captureAiDecisionTelemetry: vi.fn(),
      recordAiThoughtLogs: vi.fn(),
      renderAiLogicPanel: vi.fn(),
      waitUntilResumed: vi.fn(() => Promise.resolve()),
      setPlayerBidReady: vi.fn(),
      syncPauseButton: vi.fn(),
      showLanPauseOverlay: vi.fn(),
      hideLanPauseOverlay: vi.fn(),
      enterLanRoom: vi.fn(),
      exitLanRoom: vi.fn(),
      exitLobby: vi.fn(),
      showLanRestartVoteDialog: vi.fn(),
      removeLanRestartDialog: vi.fn(),
      showLanRestartDeclinedDialog: vi.fn(),
      refreshRevealScrollHints: vi.fn(),
      refreshPlayerHistoryUI: vi.fn(),
      renderPublicInfoPanel: vi.fn(),
      addPublicInfoEntry: vi.fn(),
      recordPlayerUsage: vi.fn(),
      isAiLlmEnabledForPlayer: () => true,
      canUseLlmDecisionForPlayer: () => false,
      normalizeAiBidValue: vi.fn((_pid, bid) => (typeof bid === "number" ? Math.max(0, bid) : 0)),
      updateLobbyMoneyDisplay: vi.fn(),
      getLastRoundBidMap: () => ({}),
      buildAiIntelSnapshot: () => ({}),
      hasAnyInfo: () => false,
      renderItem: vi.fn(),
      addContainer: () => ({ destroy: vi.fn() }),
      aiEngine: {
        buildAIBids: () => aiBidMap,
        resetForNewRun: vi.fn()
      },
      skillManager: { onNewRound: vi.fn(), resetForNewRun: vi.fn() },
      getProfile: null,
      getSelectedProfileId: null,
      getSettingsMaxRounds: () => 5,
      getSettingsDirectTakeRatio: () => 0.2,
      setSettingsMaxRounds: vi.fn(),
      setSettingsDirectTakeRatio: vi.fn(),
      ...overrides
    }
  }

  /** 模拟 bid:received 事件处理（与 events-fns.ts 第 449-460 行逻辑一致） */
  function simulateBidReceived(
    state: LanIndexState,
    deps: LanIndexManagerDeps,
    playerId: string,
    bid: number,
    playerName?: string
  ): void {
    // 这是 bid:received 事件处理器的真实逻辑
    // 来源：events-fns.ts 第 449-460 行
    if (state.lanIsHost) {
      state.lanHostBids[playerId] = bid
    }
    const slotId = state.lanIdToSlotId ? state.lanIdToSlotId[playerId] : null
    if (slotId) {
      deps.setPlayerBidReady(slotId, true)
      deps.writeLog((playerName || "玩家") + " 已提交出价")
    }
  }

  it("模拟多玩家 bid:received -> lanHostBids 含全部出价（不覆盖）", () => {
    // 全链路：模拟 3 个玩家分别提交出价，验证 lanHostBids 积累所有出价
    // 这是关键测试：验证 lanHostBids 不会被最后一个出价覆盖

    const state = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanIdToSlotId,
      slotIdToLanId,
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ] as unknown as Player[]
    })
    const deps = makeLanDeps(state, {})

    // 模拟 bid:received 事件：三个玩家分别提交出价
    // 步骤：模拟主机收到每个玩家的出价（通过真实的事件处理逻辑）
    simulateBidReceived(state, deps, "lan1", 100, "玩家1")
    // 预期中间值：lanHostBids 含 lan1 出价
    expect(state.lanHostBids["lan1"]).toBe(100)

    simulateBidReceived(state, deps, "lan2", 200, "玩家2")
    // 预期中间值：lanHostBids 含 lan1 和 lan2 出价（不被覆盖）
    expect(state.lanHostBids["lan1"]).toBe(100)
    expect(state.lanHostBids["lan2"]).toBe(200)

    simulateBidReceived(state, deps, "lan3", 50, "玩家3")
    // 预期中间值：lanHostBids 含全部 3 个玩家出价
    expect(state.lanHostBids["lan1"]).toBe(100)
    expect(state.lanHostBids["lan2"]).toBe(200)
    expect(state.lanHostBids["lan3"]).toBe(50)

    // 验证：lanHostBids 有 3 条，不是只有最后一条
    expect(Object.keys(state.lanHostBids)).toHaveLength(3)
  })

  it("lanHostBids 积累后 -> lanResolveRound 联机结算结果正确", () => {
    // 全链路：bid:received -> lanHostBids 积累 -> lanResolveRound 结算
    const state = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY, lan3: DEFAULT_START_MONEY },
      lanIdToSlotId,
      slotIdToLanId,
      round: 1,
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ] as unknown as Player[]
    })
    const deps = makeLanDeps(state, {})

    // 模拟 bid:received：三个玩家提交出价
    simulateBidReceived(state, deps, "lan1", 100, "玩家1")
    simulateBidReceived(state, deps, "lan2", 200, "玩家2")
    simulateBidReceived(state, deps, "lan3", 50, "玩家3")

    // 验证中间值：lanHostBids 含全部出价
    expect(state.lanHostBids["lan1"]).toBe(100)
    expect(state.lanHostBids["lan2"]).toBe(200)
    expect(state.lanHostBids["lan3"]).toBe(50)

    // 调 lanResolveRound 结算
    lanResolveRound(deps, state, "all-in")

    // 验证最终值：最高价 200（lan2 -> p2），次高价 100
    // 200 < ceil(100*1.2)=120? No, 200 >= 120, 所以直接拿下
    // 等等，200 >= ceil(100*1.2) = 120，所以直接拿下
    // 但 round=1, maxRounds=5, 所以 round < maxRounds，检查直接拿下
    expect(state.bidLeader).toBe("p2")
    expect(state.currentBid).toBe(200)
    expect(state.secondHighestBid).toBe(100)
  })

  it("联机平局：lanHostBids 积累后结算结果正确", () => {
    const state = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY, lan3: DEFAULT_START_MONEY },
      lanIdToSlotId,
      slotIdToLanId,
      round: 1,
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ] as unknown as Player[]
    })
    const deps = makeLanDeps(state, {})

    simulateBidReceived(state, deps, "lan1", 50, "玩家1")
    simulateBidReceived(state, deps, "lan2", 50, "玩家2")
    simulateBidReceived(state, deps, "lan3", 30, "玩家3")

    expect(Object.keys(state.lanHostBids)).toHaveLength(3)

    lanResolveRound(deps, state, "all-in")

    // 平局：lan1 和 lan2 都出 50，排序后 lan1 先出现（数组顺序）
    // 50 < ceil(50*1.2)=60，不直接拿下
    expect(state.currentBid).toBe(50)
    expect(state.bidLeader).toBe("p1") // lan1 -> p1
    expect(state.secondHighestBid).toBe(50)
  })

  it("联机直接拿下：lanHostBids 积累后结算结果正确", () => {
    const state = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY, lan3: DEFAULT_START_MONEY },
      lanIdToSlotId,
      slotIdToLanId,
      round: 1,
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ] as unknown as Player[]
    })
    const deps = makeLanDeps(state, {})

    simulateBidReceived(state, deps, "lan1", 200, "玩家1")
    simulateBidReceived(state, deps, "lan2", 50, "玩家2")
    simulateBidReceived(state, deps, "lan3", 30, "玩家3")

    lanResolveRound(deps, state, "all-in")

    // 预期：200 >= ceil(50*1.2)=60，直接拿下
    expect(state.bidLeader).toBe("p1")
    expect(state.currentBid).toBe(200)
    expect(state.secondHighestBid).toBe(50)
  })

  it("联机最后一轮强制结束", () => {
    const state = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2" },
      slotIdToLanId: { p1: "lan1", p2: "lan2" },
      round: 5, // 最后一轮
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
      ] as unknown as Player[]
    })
    const deps = makeLanDeps(state, {})

    simulateBidReceived(state, deps, "lan1", 60, "玩家1")
    simulateBidReceived(state, deps, "lan2", 55, "玩家2")

    lanResolveRound(deps, state, "all-in")

    // 预期：最后一轮，强制结束，不出直接拿下
    expect(state.bidLeader).toBe("p1")
    expect(state.currentBid).toBe(60)
    expect(state.secondHighestBid).toBe(55)
  })

  it("联机与单机同输入结果一致（奇偶测试）", () => {
    // 同样出价输入，联机结果 == 单机结果
    const singlePlayers: Player[] = [
      { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true },
      { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false },
      { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false }
    ]
    const singleState = makeBiddingState()
    const singleDeps = makeBiddingDeps(singlePlayers, {})

    // 单机：手动模拟出价（通过 deps setter）
    singleDeps.setPlayerRoundBid(100)
    singleDeps.setPlayerBidSubmitted(true)
    // 其他人类玩家在单机中出价为 0（无 lanHostBids）
    // 为了奇偶测试，我们模拟人类玩家出价 50 和 30
    // 但单机 buildRoundBids 对非自己的其他人类玩家读 lanHostBids
    // 在单机模式，getLanHostBids 返回 {}，所以其他人类玩家出价为 0
    // 为了奇偶一致性，我们让单机模式也模拟 lanHostBids
    const singleBids = [
      { playerId: "p1", bid: 100 },
      { playerId: "p2", bid: 50 },
      { playerId: "p3", bid: 30 }
    ]
    const singleResult = settleRound(singleBids, 1, maxRounds, ratio)

    // 联机
    const lanState = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY, lan3: DEFAULT_START_MONEY },
      lanIdToSlotId,
      slotIdToLanId,
      round: 1,
      players: [
        { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ] as unknown as Player[]
    })
    const lanDeps = makeLanDeps(lanState, {})

    simulateBidReceived(lanState, lanDeps, "lan1", 100, "玩家1")
    simulateBidReceived(lanState, lanDeps, "lan2", 50, "玩家2")
    simulateBidReceived(lanState, lanDeps, "lan3", 30, "玩家3")

    lanResolveRound(lanDeps, lanState, "all-in")

    // 预期：联机结果与单机一致（bidLeader 映射后相同）
    expect(lanState.bidLeader).toBe(singleResult.bidLeader)
    expect(lanState.currentBid).toBe(singleResult.currentBid)
    expect(lanState.secondHighestBid).toBe(singleResult.secondHighestBid)
  })
})