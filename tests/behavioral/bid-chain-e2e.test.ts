/**
 * @file tests/behavioral/bid-chain-e2e.test.ts
 * @description 端到端出价链测试。验证房主出价从提交到结算不丢失的全链路。
 *
 * 【背景】联机结算 bug：房主出价丢失。日志证据：房主 playerBid(amount=2)
 * 但结算时 playerRoundBid=0。根因：playerBid 设了 BiddingManagerState.playerRoundBid，
 * 但没同步到 scene.playerRoundBid（经 lanIndexState 读取），而 lanOnAllBidsIn
 * 读的是 scene.playerRoundBid，读到 0。
 *
 * 【修复】加 setPlayerRoundBid 回调到 BiddingManagerDeps，在 playerBid 中同步。
 *
 * 全链路步骤：
 * 1. 房主 playerBid(2) -> 验证 scene.playerRoundBid（经 setPlayerRoundBid） === 2
 * 2. 模拟客机 bid:received(amount=1) -> 验证 lanHostBids 有客机出价
 * 3. 调 lanResolveRound -> 验证 allBids 含房主(2)和客机(1)，赢家是房主(2>1)
 * 4. 多场景：房主出高价赢、客机出高价赢、平局
 *
 * 【预期】房主出价 2 必须出现在结算里（修复前丢失，修复后应有）。
 * 本测试修复前会失败（state.playerRoundBid 为 0，lanHostBids 中房主出价被设为 0），
 * 修复后通过（playerRoundBid 为 2，lanHostBids 中房主出价为 2）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { playerBid } from "../../scripts/game/bidding/bidding-manager/keypad-fns"
import { lanResolveRound } from "../../scripts/game/lan/lan-index-manager/game-flow-fns"
import { lanOnFullSync } from "../../scripts/game/lan/lan-index-manager/sync-fns"
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

// ============================================================
// Mock 工厂
// ============================================================

/** 创建 LanIndexState（联机状态容器） */
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
    lanMySlotId: "p1",
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
    playerRoundBid: 0,      // <- 这就是 lanOnAllBidsIn 读取的值，修复前为 0
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

/** 创建 LanIndexManagerDeps */
function makeLanDeps(
  state: LanIndexState,
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
      buildAIBids: () => ({}),
      resetForNewRun: vi.fn()
    },
    skillManager: { onNewRound: vi.fn(), resetForNewRun: vi.fn() },
    getProfile: null,
    getSelectedProfileId: null,
    ...overrides
  }
}

/** 创建 BiddingManagerState */
function makeBidState(overrides: Partial<BiddingManagerState> = {}): BiddingManagerState {
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

/** 创建 BiddingManagerDeps，setPlayerRoundBid 回调同步到 LanIndexState */
function makeBidDeps(
  players: Player[],
  lanState: LanIndexState,
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

    getIsLanMode: () => true,
    getSettled: () => false,
    getRoundPaused: () => false,
    getPlayerMoney: () => DEFAULT_START_MONEY,
    getLanMySlotId: () => "p1",
    getLanIsHost: () => true,
    getLanHostBids: () => lanState.lanHostBids,
    getPlayerRoundHistory: () => ({}),
    getItems: () => [],
    getAiEngine: () => null,
    getAiLlmRoundPlans: () => ({}),
    getAiRoundEffects: () => ({}),
    getLanBridge: () => null,
    getLastAiDecisionTelemetry: () => null,

    closeItemDrawer: vi.fn(),
    hideInfoPopup: vi.fn(),
    showGameConfirm: vi.fn(),
    updateHud: vi.fn(),
    writeLog: vi.fn(),
    setPlayerBidSubmitted: (v: boolean) => { lanState.playerBidSubmitted = v },
    setPlayerRoundBid: (v: number) => { lanState.playerRoundBid = v }, // 修复：同步到 scene
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
    normalizeAiBidValue: vi.fn((_pid, bid) => (typeof bid === "number" ? Math.max(0, bid) : 0)),
    resolveRoundBids: vi.fn(),

    ...overrides
  }
}

/** 模拟 bid:received 事件处理（与 events-fns.ts 第 449-460 行逻辑一致） */
function simulateBidReceived(
  state: LanIndexState,
  _deps: LanIndexManagerDeps,
  playerId: string,
  bid: number
): void {
  if (state.lanIsHost) {
    state.lanHostBids[playerId] = bid
  }
}

/**
 * 通过 playerBid 提交出价（真实函数，模拟房主提交）
 * setPlayerRoundBid 回调会同步到 lanState.playerRoundBid
 */
function hostSubmitBid(
  bidDeps: BiddingManagerDeps,
  bidState: BiddingManagerState,
  amount: number
): void {
  const bidInput = bidDeps.dom.bidInput as HTMLInputElement
  if (bidInput) bidInput.value = String(amount)
  playerBid(bidDeps, bidState)
}

// ============================================================
// 测试：房主出价不丢失全链路
// ============================================================

describe("端到端出价链测试（房主出价不丢失）", () => {
  it("全链路：房主 playerBid(2) -> scene.playerRoundBid=2 -> lanResolveRound -> 赢家是房主", () => {
    // 构造联机场景：房主(p1) + 客机(p2)
    const players: Player[] = [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
    ]

    const lanState = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2" },
      slotIdToLanId: { p1: "lan1", p2: "lan2" },
      players: [
        { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
      ],
      round: 1,
      playerRoundBid: 0  // 初始为 0（修复前就是这个值丢了）
    })
    const lanDeps = makeLanDeps(lanState)
    const bidState = makeBidState()
    const bidDeps = makeBidDeps(players, lanState)

    // ===== 第1步：房主出价 2 =====
    hostSubmitBid(bidDeps, bidState, 2)

    // 验证：BiddingManagerState.playerRoundBid === 2
    expect(bidState.playerRoundBid).toBe(2)

    // 验证：lanState.playerRoundBid === 2（修复后应同步，修复前为 0）
    // 修复前：setPlayerRoundBid 不存在，不更新，lanState.playerRoundBid 仍为 0
    // 修复后：setPlayerRoundBid 回调，lanState.playerRoundBid === 2
    expect(lanState.playerRoundBid).toBe(2)
    // ^^^ 如果这条失败，说明 setPlayerRoundBid 没有正确同步到 scene

    // ===== 第2步：模拟客机出价 =====
    simulateBidReceived(lanState, lanDeps, "lan2", 1)

    // 验证：lanHostBids 有客机出价
    expect(lanState.lanHostBids["lan2"]).toBe(1)
    // 房主出价尚未在 lanHostBids 中（lanOnAllBidsIn 会加）
    expect(lanState.lanHostBids["lan1"]).toBeUndefined()

    // ===== 第3步：模拟 lanOnAllBidsIn 逻辑（手动将房主出价加入 lanHostBids） =====
    // 对应 game-flow-fns.ts 第 413-419 行
    const myPid = "lan1"
    if (lanState.lanHostBids[myPid] === undefined) {
      // 修复前：lanState.playerRoundBid 为 0，房主出价被设为 0
      // 修复后：lanState.playerRoundBid 为 2，房主出价正确
      lanState.lanHostBids[myPid] = lanState.playerRoundBid
    }

    // 验证：lanHostBids 有房主出价 2（修复前为 0，修复后为 2）
    // 修复前断言：expect(lanState.lanHostBids["lan1"]).toBe(0)  // BUG
    // 修复后断言：
    expect(lanState.lanHostBids["lan1"]).toBe(2)
    // ^^^ 如果这条失败，说明房主出价丢失了（修复前 bug）

    // ===== 第4步：调 lanResolveRound 结算 =====
    lanResolveRound(lanDeps, lanState, "all-in")

    // 验证：赢家是房主（2 > 1）
    expect(lanState.bidLeader).toBe("p1")  // lan1 -> p1
    expect(lanState.currentBid).toBe(2)
    expect(lanState.secondHighestBid).toBe(1)
  })

  it("客机出高价赢：房主出价 1, 客机出价 3 -> 赢家是客机", () => {
    const players: Player[] = [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
    ]

    const lanState = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2" },
      slotIdToLanId: { p1: "lan1", p2: "lan2" },
      players: [
        { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
      ],
      round: 5, // 最后一轮，强制结束
      playerRoundBid: 0
    })
    const lanDeps = makeLanDeps(lanState)
    const bidState = makeBidState()
    const bidDeps = makeBidDeps(players, lanState)

    // 第1步：房主出价 1
    hostSubmitBid(bidDeps, bidState, 1)
    expect(lanState.playerRoundBid).toBe(1)

    // 第2步：客机出价 3
    simulateBidReceived(lanState, lanDeps, "lan2", 3)
    expect(lanState.lanHostBids["lan2"]).toBe(3)

    // 第3步：房主出价加入 lanHostBids
    const myPid = "lan1"
    if (lanState.lanHostBids[myPid] === undefined) {
      lanState.lanHostBids[myPid] = lanState.playerRoundBid
    }
    expect(lanState.lanHostBids["lan1"]).toBe(1)

    // 第4步：结算
    lanResolveRound(lanDeps, lanState, "all-in")

    // 验证：赢家是客机（3 > 1）
    expect(lanState.bidLeader).toBe("p2")  // lan2 -> p2
    expect(lanState.currentBid).toBe(3)
    expect(lanState.secondHighestBid).toBe(1)
  })

  it("平局：房主出价 2, 客机出价 2 -> 房主先出现（数组顺序）", () => {
    const players: Player[] = [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
    ]

    const lanState = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2" },
      slotIdToLanId: { p1: "lan1", p2: "lan2" },
      players: [
        { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" }
      ],
      round: 1,
      playerRoundBid: 0
    })
    const lanDeps = makeLanDeps(lanState)
    const bidState = makeBidState()
    const bidDeps = makeBidDeps(players, lanState)

    // 第1步：房主出价 2
    hostSubmitBid(bidDeps, bidState, 2)
    expect(lanState.playerRoundBid).toBe(2)

    // 第2步：客机出价 2
    simulateBidReceived(lanState, lanDeps, "lan2", 2)
    expect(lanState.lanHostBids["lan2"]).toBe(2)

    // 第3步：房主出价加入 lanHostBids
    const myPid = "lan1"
    if (lanState.lanHostBids[myPid] === undefined) {
      lanState.lanHostBids[myPid] = lanState.playerRoundBid
    }
    expect(lanState.lanHostBids["lan1"]).toBe(2)

    // 第4步：结算 - 平局
    lanResolveRound(lanDeps, lanState, "all-in")

    // 平局：lan1 和 lan2 都出 2，排序后 lan1 先出现（数组顺序 p1 在 p2 前）
    expect(lanState.currentBid).toBe(2)
    expect(lanState.bidLeader).toBe("p1")  // p1 先出现
    expect(lanState.secondHighestBid).toBe(2)
  })

  it("多人场景：房主 2, 客机1 出 1, 客机2 出 3 -> 赢家是客机2", () => {
    const players: Player[] = [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
      { id: "p2", name: "客机1", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
      { id: "p3", name: "客机2", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
    ]

    const lanState = makeLanState({
      lanIsHost: true,
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY, lan3: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2", lan3: "p3" },
      slotIdToLanId: { p1: "lan1", p2: "lan2", p3: "lan3" },
      players: [
        { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: true, lanId: "lan1" },
        { id: "p2", name: "客机1", isHuman: true, isAI: false, isSelf: false, lanId: "lan2" },
        { id: "p3", name: "客机2", isHuman: true, isAI: false, isSelf: false, lanId: "lan3" }
      ],
      round: 5,
      playerRoundBid: 0
    })
    const lanDeps = makeLanDeps(lanState)
    const bidState = makeBidState()
    const bidDeps = makeBidDeps(players, lanState)

    // 房主出价 2
    hostSubmitBid(bidDeps, bidState, 2)
    expect(lanState.playerRoundBid).toBe(2)

    // 客机1出价 1, 客机2出价 3
    simulateBidReceived(lanState, lanDeps, "lan2", 1)
    simulateBidReceived(lanState, lanDeps, "lan3", 3)
    expect(lanState.lanHostBids["lan2"]).toBe(1)
    expect(lanState.lanHostBids["lan3"]).toBe(3)

    // 房主出价加入 lanHostBids
    const myPid = "lan1"
    if (lanState.lanHostBids[myPid] === undefined) {
      lanState.lanHostBids[myPid] = lanState.playerRoundBid
    }
    expect(lanState.lanHostBids["lan1"]).toBe(2)

    // 结算
    lanResolveRound(lanDeps, lanState, "all-in")

    // 验证：赢家是客机2（3 > 2 > 1）
    expect(lanState.bidLeader).toBe("p3")  // lan3 -> p3
    expect(lanState.currentBid).toBe(3)
    expect(lanState.secondHighestBid).toBe(2)
  })

  it("主机出价 -> full-sync 给客机 -> 客机出价不受影响（不被 playerBidSubmitted 阻止）", () => {
    /**
     * 模拟真实场景：主机出价后，客机切标签回来触发 full-sync，然后客机出价。
     * 修复前：full-sync 把主机的 playerBidSubmitted=true 同步给客机 -> 客机不能出价
     * 修复后：full-sync 跳过每玩家状态 -> 客机出价正常
     */
    const players: Player[] = [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: false, lanId: "lan1" },
      { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: true, lanId: "lan2" }
    ]

    // 客机状态（lanIsHost=false）：初始没出价
    const clientLanState = makeLanState({
      lanIsHost: false,
      lanMySlotId: "p2",
      lanHostBids: {},
      lanHostWallets: { lan1: DEFAULT_START_MONEY, lan2: DEFAULT_START_MONEY },
      lanIdToSlotId: { lan1: "p1", lan2: "p2" },
      slotIdToLanId: { p1: "lan1", p2: "lan2" },
      players: [
        { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: false, lanId: "lan1" },
        { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: true, lanId: "lan2" }
      ],
      round: 1,
      playerBidSubmitted: false,  // 客机没出价
      playerRoundBid: 0           // 客机没出价
    })

    // 构造 full-sync 消息（主机已出价 250000）
    const fullSyncMsg: Record<string, unknown> = {
      playerId: "p2",
      round: 1,
      maxRounds: 5,
      currentBid: 250000,
      warehouseTrueValue: 500000,
      roundTimeLeft: 45,
      isPaused: false,
      settled: false,
      playerBidSubmitted: true,      // 主机已出价
      playerRoundBid: 250000,        // 主机出价额
      wallets: { lan1: 750000, lan2: DEFAULT_START_MONEY },
      bids: { lan1: 250000 },
      playerCharacters: { lan1: "char1", lan2: "char2" },
      mapProfileId: "profile1",
      warehouse: [],
      publicInfoEntries: []
    }

    const clientLanDeps = makeLanDeps(clientLanState)

    // 第1步：full-sync 到达客机
    lanOnFullSync(clientLanDeps, clientLanState, fullSyncMsg)

    // 第2步：验证客机 playerBidSubmitted 仍是 false（没被主机覆盖）
    // 修复前失败：playerBidSubmitted 被覆盖成 true，客机出价输入框被禁用
    // 修复后通过：playerBidSubmitted 仍为 false，客机可出价
    expect(clientLanState.playerBidSubmitted).toBe(false)
    // ^^^ 如果失败，说明 full-sync 错误覆盖了每玩家状态，updateActionAvailability 会禁用出价

    // 第3步：验证客机 playerRoundBid 仍是 0（没被主机覆盖）
    expect(clientLanState.playerRoundBid).toBe(0)

    // 第4步：验证客机 playerBid 仍可调用（模拟客机出价 150000）
    const bidState = makeBidState()
    const bidDeps = makeBidDeps(players, clientLanState)
    const bidInput = bidDeps.dom.bidInput as HTMLInputElement
    bidInput.value = "150000"
    playerBid(bidDeps, bidState)

    // 验证：客机出价成功
    expect(bidState.playerBidSubmitted).toBe(true)
    expect(bidState.playerRoundBid).toBe(150000)
    // 验证：客机出价同步到联机状态
    expect(clientLanState.playerBidSubmitted).toBe(true)
    expect(clientLanState.playerRoundBid).toBe(150000)

    // 第5步：验证全局状态同步正确
    expect(clientLanState.round).toBe(1)
    expect(clientLanState.currentBid).toBe(250000)
    expect(clientLanState.warehouseTrueValue).toBe(500000)
  })
})