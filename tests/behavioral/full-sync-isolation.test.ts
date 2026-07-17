/**
 * @file tests/behavioral/full-sync-isolation.test.ts
 * @description 全量同步隔离测试。验证 full-sync 不会把每玩家状态从主机同步给客机。
 *
 * 【背景】联机 bug：主机出价后触发 full-sync，把主机的 playerBidSubmitted=true 和
 * playerRoundBid=250000 同步给客机。客机 playerBidSubmitted 被覆盖成 true，
 * 导致 updateActionAvailability 禁用客机出价输入框，客机不能出价。
 *
 * 【修复】删掉 lanOnFullSync 中同步 playerBidSubmitted/playerRoundBid 的代码。
 * 这两个是每玩家状态，不应用主机覆盖客机。
 *
 * 【预期】修复前测试失败（playerBidSubmitted 被覆盖成 true），修复后通过。
 * 如果修复前测试也通过，说明测试没抓到 bug，必须重写。
 */
import { describe, it, expect, vi } from "vitest"
import { lanOnFullSync } from "../../scripts/game/lan/lan-index-manager/sync-fns"
import type { LanIndexManagerDeps, LanIndexState } from "../../scripts/game/lan/lan-index-manager"
import { GAME_SETTINGS } from "../../scripts/game/core/settings"
import { DEFAULT_START_MONEY } from "../../scripts/game/core/constants"

// ─── 保存原始 GAME_SETTINGS 值 ───
const ORIG_MAX_ROUNDS = GAME_SETTINGS.maxRounds

beforeEach(() => {
  GAME_SETTINGS.maxRounds = 5
})

afterEach(() => {
  GAME_SETTINGS.maxRounds = ORIG_MAX_ROUNDS
})

// ============================================================
// Mock 工厂
// ============================================================

/** 创建客机 LanIndexState（lanIsHost=false） */
function makeClientState(overrides: Partial<LanIndexState> = {}): LanIndexState {
  return {
    isLanMode: true,
    lanIsHost: false, // 客机
    lanPlayers: [],
    lanAiPlayers: [],
    lanHostWallets: {},
    lanHostBids: {},
    lanAiLlmEnabled: false,
    lanIdToSlotId: { lan1: "p1", lan2: "p2" },
    slotIdToLanId: { p1: "lan1", p2: "lan2" },
    lanMySlotId: "p2",
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
    // 客机没出价：初始状态
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
    players: [
      { id: "p1", name: "房主", isHuman: true, isAI: false, isSelf: false, lanId: "lan1" },
      { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: true, lanId: "lan2" }
    ],
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

/** 创建 LanIndexManagerDeps（客机用） */
function makeClientDeps(
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
    getSettingsMaxRounds: () => 5,
    getSettingsDirectTakeRatio: () => 0.2,
    setSettingsMaxRounds: vi.fn(),
    setSettingsDirectTakeRatio: vi.fn(),
    ...overrides
  }
}

// ============================================================
// 测试：full-sync 不覆盖每玩家状态
// ============================================================

describe("全量同步隔离测试（每玩家状态不被主机覆盖）", () => {
  it("修复前失败：full-sync 后客机 playerBidSubmitted 仍是 false（每玩家状态不被主机覆盖）", () => {
    // 1. 设客机状态：playerBidSubmitted=false, playerRoundBid=0（客机没出价）
    const state = makeClientState({
      playerBidSubmitted: false, // 客机没出价
      playerRoundBid: 0,        // 客机没出价
      round: 2,
      currentBid: 100000,
      warehouseTrueValue: 500000
    })

    // 2. 设主机状态：playerBidSubmitted=true, playerRoundBid=250000（主机已出价）
    // 构造 full-sync 消息（含主机的 playerBidSubmitted=true, playerRoundBid=250000）
    const msg: Record<string, unknown> = {
      playerId: "p2",
      round: 2,
      maxRounds: 5,
      currentBid: 100000,
      warehouseTrueValue: 500000,
      roundTimeLeft: 30,
      isPaused: false,
      settled: false,
      playerBidSubmitted: true,      // 主机已出价 -> 之前错误地同步给客机
      playerRoundBid: 250000,        // 主机出价额 -> 之前错误地同步给客机
      wallets: { lan1: 500000, lan2: 500000 },
      bids: { lan1: 250000 },
      playerCharacters: { lan1: "char1", lan2: "char2" },
      mapProfileId: "profile1",
      warehouse: [],
      publicInfoEntries: []
    }

    const deps = makeClientDeps(state)

    // 3. 调 lanOnFullSync(deps, state, msg) -- 走真实 handler
    lanOnFullSync(deps, state, msg)

    // 4. 验证：客机的 playerBidSubmitted 仍然是 false（没被主机覆盖）
    // 预期：full-sync 后客机 playerBidSubmitted 仍是 false（每玩家状态不被主机覆盖）
    // 如果 playerBidSubmitted 变 true，说明 full-sync 错误同步了每玩家状态，bug 复现
    expect(state.playerBidSubmitted).toBe(false)
    // ^^^ 修复前失败：playerBidSubmitted 被覆盖成 true
    // ^^^ 修复后通过：playerBidSubmitted 仍为 false

    // 5. 验证：客机的 playerRoundBid 仍然是 0（没被主机覆盖）
    // 预期：full-sync 后客机 playerRoundBid 仍是 0（每玩家状态不被主机覆盖）
    // 如果 playerRoundBid 变 250000，说明 full-sync 错误同步了每玩家状态，bug 复现
    expect(state.playerRoundBid).toBe(0)
    // ^^^ 修复前失败：playerRoundBid 被覆盖成 250000
    // ^^^ 修复后通过：playerRoundBid 仍为 0

    // 6. 验证：全局状态（round, currentBid, wallets）正确同步了
    expect(state.round).toBe(2)               // 全局状态应同步
    expect(state.currentBid).toBe(100000)     // 全局状态应同步
    expect(state.warehouseTrueValue).toBe(500000) // 全局状态应同步

    // 验证 wallets 正确同步（客机钱包更新）
    expect(state.players[0].money).toBe(500000) // p1 钱包从主机同步
    expect(state.players[1].money).toBe(500000) // p2 钱包从主机同步
    // 验证 bids 被正确应用（setPlayerBidReady 被调用）
    expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p1", true)
  })

  it("客机 playerBidSubmitted=true 时 full-sync 不覆盖（已出价状态保留）", () => {
    // 场景：客机已出价（playerBidSubmitted=true, playerRoundBid=150000），
    // 主机也出了价，full-sync 不应覆盖客机自己的出价状态
    const state = makeClientState({
      playerBidSubmitted: true,  // 客机已出价
      playerRoundBid: 150000,   // 客机出价 150000
      round: 2,
      currentBid: 100000,
      warehouseTrueValue: 500000
    })

    const msg: Record<string, unknown> = {
      playerId: "p2",
      round: 2,
      maxRounds: 5,
      currentBid: 100000,
      warehouseTrueValue: 500000,
      roundTimeLeft: 30,
      isPaused: false,
      settled: false,
      playerBidSubmitted: true,      // 主机已出价
      playerRoundBid: 250000,        // 主机出价额
      wallets: { lan1: 500000, lan2: 500000 },
      bids: { lan1: 250000 },
      playerCharacters: { lan1: "char1", lan2: "char2" },
      mapProfileId: "profile1",
      warehouse: [],
      publicInfoEntries: []
    }

    const deps = makeClientDeps(state)

    lanOnFullSync(deps, state, msg)

    // 客机自己的出价状态应保留
    expect(state.playerBidSubmitted).toBe(true)   // 客机已出价，保留
    expect(state.playerRoundBid).toBe(150000)       // 客机出价额，保留

    // 全局状态应同步
    expect(state.round).toBe(2)
    expect(state.currentBid).toBe(100000)
  })
})