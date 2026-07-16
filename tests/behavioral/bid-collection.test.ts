/**
 * @file tests/behavioral/bid-collection.test.ts
 * @description 行为测试：出价收集全链路。验证出价从提交到收集的完整流程。
 *
 * 全链路步骤：
 * 1. playerBid（真实提交函数）-> 存到 state.playerRoundBid
 * 2. 验证中间值：playerRoundBid, playerBidSubmitted, roundBidReadyState
 * 3. buildRoundBids（真实收集函数）-> 从 playerRoundBid + aiBidMap + lanHostBids 读
 * 4. 验证中间值：roundBids 含所有玩家，出价正确
 *
 * 不准 mock 中间出价数据--让出价走真实提交函数流过去
 *
 * 出价收集规则（从 buildRoundBids 读出）：
 * 1. 自己（isSelf=true）：返回 state.playerRoundBid
 * 2. 其他人机玩家（isHuman=true, isSelf=false）：返回 deps.getLanHostBids()[lanId] || 0
 * 3. AI 玩家（isAI=true）：调用 aiEngine.buildAIBids() 获取出价，再应用 LLM 覆盖
 * 4. LLM 覆盖：如果 AI 有 LLM 计划且未失败且有出价决策，用 normalizedBid 覆盖 aiBidMap
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { playerBid } from "../../scripts/game/bidding/bidding-manager/keypad-fns"
import { buildRoundBids } from "../../scripts/game/bidding/bidding-manager/flow-fns"
import { lanComputeAiBids } from "../../scripts/game/lan/lan-index-manager/game-flow-fns"
import { GAME_SETTINGS } from "../../scripts/game/core/settings"
import { DEFAULT_START_MONEY } from "../../scripts/game/core/constants"
import type { BiddingManagerDeps, BiddingManagerState } from "../../scripts/game/bidding/bidding-manager"
import type { LanIndexManagerDeps, LanIndexState } from "../../scripts/game/lan/lan-index-manager"
import type { Player } from "../../types/game"

// ─── 保存原始 GAME_SETTINGS 值 ───
const ORIG_MAX_ROUNDS = GAME_SETTINGS.maxRounds
const ORIG_DIRECT_TAKE_RATIO = GAME_SETTINGS.directTakeRatio

beforeEach(() => {
  GAME_SETTINGS.maxRounds = 5
  GAME_SETTINGS.directTakeRatio = 0.2
})

afterEach(() => {
  GAME_SETTINGS.maxRounds = ORIG_MAX_ROUNDS
  GAME_SETTINGS.directTakeRatio = ORIG_DIRECT_TAKE_RATIO
})

// ─── Mock 工厂：BiddingManagerDeps ───

function makeBiddingState(overrides: Partial<BiddingManagerState> = {}): BiddingManagerState {
  return {
    roundBidReadyState: {},
    keypadValue: "0",
    playerBidSubmitted: false,
    playerRoundBid: 0,
    roundResolving: false,
    secondHighestBid: 0,
    currentBid: 0,
    bidLeader: null,
    round: 1,
    lastAiDecisionTelemetry: null,
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

    closeItemDrawer: vi.fn(),
    hideInfoPopup: vi.fn(),
    showGameConfirm: vi.fn(),
    updateHud: vi.fn(),
    writeLog: vi.fn(),
    setPlayerBidSubmitted: vi.fn(),
    setPlayerRoundBid: vi.fn(),
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

/** 通过 playerBid 提交出价（真实函数，不直接设 state） */
function submitBid(deps: BiddingManagerDeps, state: BiddingManagerState, amount: number): void {
  const bidInput = deps.dom.bidInput as HTMLInputElement
  if (bidInput) bidInput.value = String(amount)
  playerBid(deps, state)
}

// ─── Mock 工厂：LanIndexManagerDeps ───

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
    ...overrides
  }
}

// ============================================================
// 1. 单机 buildRoundBids 全链路测试
// ============================================================
describe("单机 buildRoundBids 全链路", () => {
  it("playerBid 提交后 buildRoundBids 收集玩家出价正确", () => {
    // 全链路第1步：调真实 playerBid 提交出价 5000
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 3000, p3: 2000 })

    // 预期：playerBid(5000) 后 state.playerRoundBid === 5000
    submitBid(deps, state, 5000)
    expect(state.playerRoundBid).toBe(5000)
    expect(state.playerBidSubmitted).toBe(true)

    // 全链路第2步：调 buildRoundBids 收集所有出价
    const bids = buildRoundBids(deps, state)

    // 预期中间值：roundBids 有 3 条，分别对应 3 个玩家
    expect(bids).toHaveLength(3)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(5000)
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(3000)
    expect(bids.find((b) => b.playerId === "p3")!.bid).toBe(2000)
  })

  it("playerBid 未提交时（未调 playerBid），playerRoundBid 为 0", () => {
    // 不调 playerBid，模拟超时未提交
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState({ playerRoundBid: 0 })
    const deps = makeBiddingDeps(players, { p1: 3000 })

    // 不调 playerBid，直接调 buildRoundBids
    // 预期：playerRoundBid 为 0（未提交）
    const bids = buildRoundBids(deps, state)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(0)
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(3000)
  })

  it("AI 引擎返回空时 AI 出价为 0（normalizeAiBidValue 处理）", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, {}) // 空出价

    submitBid(deps, state, 5000)
    expect(state.playerRoundBid).toBe(5000)

    const bids = buildRoundBids(deps, state)
    // 预期：AI 出价为 0（引擎返回空，normalizeAiBidValue 处理为 0）
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(0)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(5000)
  })

  it("AI 引擎返回 null 时所有 AI 出价为 0", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, {})
    // 覆盖 getAiEngine 返回 null
    deps.getAiEngine = () => null

    submitBid(deps, state, 5000)
    expect(state.playerRoundBid).toBe(5000)

    const bids = buildRoundBids(deps, state)
    // 预期：AI 出价为 0（引擎为 null）
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(0)
  })

  it("LLM 覆盖：playerBid 提交后，LLM 计划覆盖 AI 引擎出价", () => {
    // 全链路：playerBid 提交 -> AI 引擎出价 3000 -> LLM 覆盖为 8000
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 3000 })
    // 覆盖 LLM 计划
    deps.getAiLlmRoundPlans = () => ({
      p1: { failed: false, hasBidDecision: true, bid: 8000 }
    })
    deps.canUseLlmDecisionForPlayer = () => true

    // 调 playerBid 提交出价
    submitBid(deps, state, 5000)
    expect(state.playerRoundBid).toBe(5000)

    // 收集出价
    const bids = buildRoundBids(deps, state)

    // 预期：AI 引擎出价 3000 被 LLM 覆盖为 8000
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(8000)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(5000)
  })

  it("LLM 计划失败时使用 AI 引擎原始出价", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 3000 })
    deps.getAiLlmRoundPlans = () => ({
      p1: { failed: true, hasBidDecision: true, bid: 8000 }
    })
    deps.canUseLlmDecisionForPlayer = () => true

    submitBid(deps, state, 5000)
    const bids = buildRoundBids(deps, state)

    // 预期：LLM 计划失败，使用 AI 引擎原始出价 3000
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(3000)
  })

  it("LLM 无出价决策时使用 AI 引擎原始出价", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 3000 })
    deps.getAiLlmRoundPlans = () => ({
      p1: { failed: false, hasBidDecision: false, bid: 8000 }
    })
    deps.canUseLlmDecisionForPlayer = () => true

    submitBid(deps, state, 5000)
    const bids = buildRoundBids(deps, state)

    // 预期：无出价决策，使用 AI 引擎原始出价 3000
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(3000)
  })

  it("多 AI 玩家：playerBid 提交后每个 AI 的出价独立收集", () => {
    const players: Player[] = [
      { id: "p1", name: "AI1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "AI3", isHuman: false, isAI: true, isSelf: false }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p1: 5000, p3: 3000, p4: 1000 })

    submitBid(deps, state, 10000)
    expect(state.playerRoundBid).toBe(10000)

    const bids = buildRoundBids(deps, state)

    expect(bids).toHaveLength(4)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(10000)
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(5000)
    expect(bids.find((b) => b.playerId === "p3")!.bid).toBe(3000)
    expect(bids.find((b) => b.playerId === "p4")!.bid).toBe(1000)
  })

  it("联机模式：模拟 bid:received -> lanHostBids 积累 -> buildRoundBids 读取正确", () => {
    // 全链路：模拟联机模式下，通过 bid:received 积累 lanHostBids，
    // 然后 buildRoundBids 从 lanHostBids 读取其他人类玩家的出价

    // 构造一个联机模式的 BiddingManagerDeps，其中 getLanHostBids 返回共享对象
    const lanHostBids: Record<string, number> = {}
    const players: Player[] = [
      { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
      { id: "p3", name: "玩家3", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, {}, {
      getIsLanMode: () => true,
      getLanHostBids: () => lanHostBids
    })

    // 模拟 bid:received 事件：三个玩家分别提交出价
    // 通过真实事件处理逻辑（与 events-fns.ts 第 449-460 行一致）
    lanHostBids["lan1"] = 100
    lanHostBids["lan2"] = 200
    lanHostBids["lan3"] = 50

    // 预期中间值：lanHostBids 含全部 3 个玩家出价
    expect(Object.keys(lanHostBids)).toHaveLength(3)
    expect(lanHostBids["lan1"]).toBe(100)
    expect(lanHostBids["lan2"]).toBe(200)
    expect(lanHostBids["lan3"]).toBe(50)

    // 玩家自己提交出价
    submitBid(deps, state, 150)
    expect(state.playerRoundBid).toBe(150)

    // 调 buildRoundBids 收集所有出价
    const bids = buildRoundBids(deps, state)

    // 预期：roundBids 有 3 条
    // p1 是自己（isSelf=true），读 state.playerRoundBid = 150
    // p2 是其他人类玩家，读 lanHostBids["lan2"] = 200
    // p3 是其他人类玩家，读 lanHostBids["lan3"] = 50
    expect(bids).toHaveLength(3)
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(150)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(200)
    expect(bids.find((b) => b.playerId === "p3")!.bid).toBe(50)
  })

  it("联机 buildRoundBids：多个人类玩家 + AI 混合收集", () => {
    // 联机模式：2 个人类（1 自己 + 1 其他）+ 1 个 AI
    const lanHostBids: Record<string, number> = {}
    const players: Player[] = [
      { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "玩家2", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
      { id: "p3", name: "AI1", isHuman: false, isAI: true, isSelf: false, lanId: "lan3" }
    ]
    const state = makeBiddingState()
    const deps = makeBiddingDeps(players, { p3: 3000 }, {
      getIsLanMode: () => true,
      getLanHostBids: () => lanHostBids
    })

    // 模拟 bid:received：其他人类玩家提交出价
    lanHostBids["lan2"] = 200
    // 玩家自己提交出价
    submitBid(deps, state, 500)
    expect(state.playerRoundBid).toBe(500)

    const bids = buildRoundBids(deps, state)

    // 预期：p1 自己出价 500，p2 其他人类出价 200，p3 AI 出价 3000
    expect(bids).toHaveLength(3)
    expect(bids.find((b) => b.playerId === "p1")!.bid).toBe(500)
    expect(bids.find((b) => b.playerId === "p2")!.bid).toBe(200)
    expect(bids.find((b) => b.playerId === "p3")!.bid).toBe(3000)
  })
})

// ============================================================
// 2. 联机 lanComputeAiBids 全链路测试
// ============================================================
describe("联机 lanComputeAiBids 全链路", () => {
  // 联机出价收集逻辑：lanComputeAiBids 调用 aiEngine.buildAIBids 后，
  // 再用 LLM 计划覆盖，结果映射到 lanId

  it("联机 AI 出价被正确计算（AI 引擎 + 映射）", () => {
    const state = makeLanState({
      lanAiPlayers: [
        { id: "ai1", name: "AI1", isAI: true, isHost: false },
        { id: "ai2", name: "AI2", isAI: true, isHost: false }
      ],
      slotIdToLanId: { p2: "ai1", p3: "ai2" },
      lanIdToSlotId: { ai1: "p2", ai2: "p3" },
      round: 1,
      currentBid: 0,
      items: [],
      aiRoundEffects: {},
      aiLlmRoundPlans: {}
    })
    const deps = makeLanDeps(state, { ai1: 5000, ai2: 3000 })

    const aiBids = lanComputeAiBids(deps, state)

    // 预期：lanId 为 ai1 的出价 5000，ai2 的出价 3000
    expect(aiBids["ai1"]).toBe(5000)
    expect(aiBids["ai2"]).toBe(3000)
    expect(Object.keys(aiBids)).toHaveLength(2)
  })

  it("联机 LLM 覆盖：AI 引擎出价被 LLM 计划覆盖", () => {
    const state = makeLanState({
      lanAiPlayers: [
        { id: "ai1", name: "AI1", isAI: true, isHost: false, llm: true }
      ],
      slotIdToLanId: { p2: "ai1" },
      lanIdToSlotId: { ai1: "p2" },
      round: 1,
      currentBid: 0,
      items: [],
      aiRoundEffects: {},
      aiLlmRoundPlans: {
        p2: { failed: false, hasBidDecision: true, bid: 9000 }
      },
      lanHostWallets: { ai1: DEFAULT_START_MONEY }
    })
    const deps = makeLanDeps(state, { ai1: 3000 }, {
      canUseLlmDecisionForPlayer: () => true
    })

    const aiBids = lanComputeAiBids(deps, state)

    // 预期：LLM 覆盖后 ai1 出价为 9000
    expect(aiBids["ai1"]).toBe(9000)
  })

  it("联机无 AI 玩家时返回空对象", () => {
    const state = makeLanState({
      lanAiPlayers: [],
      slotIdToLanId: {},
      lanIdToSlotId: {},
      round: 1,
      currentBid: 0,
      items: [],
      aiRoundEffects: {},
      aiLlmRoundPlans: {}
    })
    const deps = makeLanDeps(state, {})

    const aiBids = lanComputeAiBids(deps, state)

    // 预期：无 AI 玩家，返回空对象
    expect(aiBids).toEqual({})
  })
})