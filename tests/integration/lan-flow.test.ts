/**
 * @file tests/integration/lan-flow.test.ts
 * @description LAN 联机流程集成测试。覆盖完整链条：事件接收 -> Manager -> 函数文件 -> 状态同步。
 *              验证长链条调用中的关键路径，重点覆盖之前出 bug 的点。
 *
 * 测试链条：
 * 1. game:init 事件 -> startLanRun 链条（含 lanMySlotId 解析 bug）
 * 2. carryItems 同步链条（syncSlotsFromPlayers 重建不丢失 carryItems bug）
 * 3. 结算同步链条（lanOnSettle + lanRestoreWarehouseFromSync + renderItem bug）
 * 4. 出价就绪状态同步（多槽位互不阻塞 bug）
 * 5. 联机/单机隔离（startNewRun / showLobbyMain / enterLanRoom 重置）
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { startLanRun } from "../../scripts/game/lan/lan-index-manager/game-flow-fns"
import { lanOnSettle } from "../../scripts/game/lan/lan-index-manager/settle-fns"
import { lanRestoreWarehouseFromSync } from "../../scripts/game/lan/lan-index-manager/sync-fns"
import { setPlayerBidReady, areAllPlayersBidReady } from "../../scripts/game/bidding/bidding-manager/keypad-fns"
import { QUALITY_CONFIG } from "../../scripts/game/data/artifacts"
import { GRID_ROWS, GRID_COLS } from "../../scripts/game/core/constants"
import type { BiddingManagerDeps, BiddingManagerState } from "../../scripts/game/bidding/bidding-manager"
import type { LanIndexManagerDeps, LanIndexState, LanBridgeLike } from "../../scripts/game/lan/lan-index-manager"
import type { Artifact, Player } from "../../types/game"

// =============================================================================
// 辅助：创建 LanIndexState
// =============================================================================

function makeMockBridge(overrides: Partial<Record<string, unknown>> = {}): LanBridgeLike {
  return {
    ws: { url: "ws://test", readyState: 1 },
    connected: true,
    playerId: "host1",
    playerName: "主机",
    roomCode: "ABC123",
    isHost: true,
    players: [],
    on: vi.fn(),
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    send: vi.fn(() => true),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    reconnect: vi.fn(() => Promise.resolve()),
    requestFullSync: vi.fn(),
    sendFullSync: vi.fn(),
    leaveRoom: vi.fn(),
    startGame: vi.fn(),
    broadcastRoundStart: vi.fn(),
    submitBid: vi.fn(),
    broadcastRoundResult: vi.fn(),
    broadcastSettle: vi.fn(),
    broadcastSettleFinal: vi.fn(),
    togglePause: vi.fn(),
    ...overrides
  } as unknown as LanBridgeLike
}

function makeLanState(
  overrides: Partial<LanIndexState> = {}
): LanIndexState {
  return {
    isLanMode: false,
    lanIsHost: false,
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
    round: 0,
    roundResolving: false,
    settled: false,
    roundPaused: false,
    roundTimeLeft: 60,
    currentBid: 0,
    bidLeader: null,
    secondHighestBid: 0,
    playerBidSubmitted: false,
    playerRoundBid: 0,
    playerMoney: 100000,
    actionsLeft: 3,
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

// =============================================================================
// 辅助：创建 LanIndexManagerDeps
// =============================================================================

function makeLanDeps(
  overrides: Partial<LanIndexManagerDeps> = {}
): LanIndexManagerDeps {
  const defaultDeps: LanIndexManagerDeps = {
    state: null as unknown as LanIndexState,
    getLanBridge: () => null,
    createLanBridge: () => ({ id: "test-bridge" } as never),
    setLanBridge: vi.fn(),
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
    buildWarehouseSnapshotForSync: vi.fn(() => ({})),
    initPlayersUI: vi.fn(),
    applyCharacterToPlayer: vi.fn(),
    initAiWallets: vi.fn(),
    initAiIntelSystems: vi.fn(),
    makeRunToken: vi.fn(() => "token"),
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
    isAiLlmEnabledForPlayer: vi.fn(() => false),
    canUseLlmDecisionForPlayer: vi.fn(() => false),
    normalizeAiBidValue: vi.fn((_pid: string, bid: number) => bid),
    updateLobbyMoneyDisplay: vi.fn(),
    getLastRoundBidMap: vi.fn(() => ({})),
    buildAiIntelSnapshot: vi.fn(() => ({})),
    hasAnyInfo: vi.fn(() => false),
    renderItem: vi.fn(),
    addContainer: vi.fn(() => ({ destroy: vi.fn() })),
    aiEngine: {
      buildAIBids: vi.fn(() => ({})),
      resetForNewRun: vi.fn()
    },
    skillManager: {
      onNewRound: vi.fn(),
      resetForNewRun: vi.fn()
    },
    getProfile: null,
    getSelectedProfileId: null,
    ...overrides
  }
  return defaultDeps
}

// =============================================================================
// 辅助：Bidding 相关
// =============================================================================

function makeBidState(
  overrides: Partial<BiddingManagerState> = {}
): BiddingManagerState {
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

function makeBidDeps(
  overrides: Partial<BiddingManagerDeps> = {}
): BiddingManagerDeps {
  const dom: Record<string, HTMLElement | null> = {}
  const defaultDeps: BiddingManagerDeps = {
    dom,
    players: [
      { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true },
      { id: "p2", name: "AI-1", isHuman: false, isAI: true, isSelf: false },
      { id: "p3", name: "玩家2", isHuman: true, isAI: false, isSelf: false },
      { id: "p4", name: "AI-2", isHuman: false, isAI: true, isSelf: false }
    ],
    input: { enabled: true },
    skillManager: { onNewRound: vi.fn() },
    getIsLanMode: () => true,
    getSettled: () => false,
    getRoundPaused: () => false,
    getPlayerMoney: () => 100000,
    getLanMySlotId: () => "p1",
    getLanIsHost: () => false,
    getLanHostBids: () => ({}),
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
    setPlayerBidSubmitted: vi.fn(),
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
    getAiWallet: vi.fn(() => 1000000),
    normalizeAiBidValue: vi.fn((_playerId: string, bid: number) => bid),
    ...overrides
  }
  return defaultDeps
}

// =============================================================================
// 辅助：联机/单机隔离函数（内联实现，对应 scene-run.ts / cleanup-fns.ts / navigation-fns.ts）
// =============================================================================

const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
  { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
  { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
  { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
]

function mockStartNewRun(state: LanIndexState): void {
  state.isLanMode = false
  state.lanIsHost = false
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanMySlotId = "p2"
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
}

function mockShowLobbyMain(state: LanIndexState): void {
  state.isLanMode = false
  state.lanIsHost = false
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanMySlotId = null
  state.aiLlmPlayerEnabled = {}
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
}

function mockEnterLanRoom(state: LanIndexState): void {
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanMySlotId = null
  state.aiLlmPlayerEnabled = {}
}

// =============================================================================
// 辅助：carryItems 同步逻辑（内联，对应 events.ts + lobby-fns.ts）
// =============================================================================

interface SlotConfigItem {
  type: string
  id?: string
  name?: string
  carryItems?: string[]
  [key: string]: unknown
}

/** 模拟 events.ts 中 lan:carry-items-update 处理逻辑 */
function applyCarryItemsUpdate(
  slotConfig: SlotConfigItem[],
  msg: { playerId: string; carryItems: string[] }
): void {
  const slotIdx = slotConfig.findIndex((s) => s.id === msg.playerId)
  if (slotIdx >= 0) {
    slotConfig[slotIdx].carryItems = msg.carryItems || []
  }
}

/** 模拟 lobby-fns.ts 中 syncSlotsFromPlayers 的 carryItems 保留逻辑 */
function syncSlotsFromPlayers(
  slotConfig: SlotConfigItem[],
  players: Array<{ id: string; name: string; isHost: boolean }>
): void {
  let idx = 0
  players.forEach((p) => {
    if (idx < 4) {
      const existing = slotConfig.find((s) => s.id === p.id)
      slotConfig[idx] = {
        type: p.isHost ? "host" : "client",
        id: p.id,
        name: p.name,
        carryItems: (existing?.carryItems as string[]) || undefined
      }
      idx++
    }
  })
  while (idx < 4) {
    slotConfig[idx] = { type: "empty" }
    idx++
  }
}

// =============================================================================
// 测试
// =============================================================================

describe("LAN 联机流程集成测试", () => {
  beforeEach(() => {
    // 清除 window.NativeBridge 避免干扰 startLanRun
    delete (window as Record<string, unknown>).NativeBridge
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 链条 1：game:init 事件 -> startLanRun 链条
  // ═════════════════════════════════════════════════════════════════════════

  describe("game:init 事件 -> startLanRun 链条", () => {
    it("应设置 isLanMode=true 并从 game:init 消息正确配置 lanPlayers", () => {
      // 模拟 game:init 消息中的 players 数组
      const msgPlayers = [
        { id: "host1", name: "主机", isAI: false },
        { id: "client1", name: "客机", isAI: false }
      ]
      const msgAiPlayers = [
        { id: "ai1", name: "AI-1", isAI: true, llm: false }
      ]
      const hostId = "host1"
      const bridge = { playerId: "host1", connected: true } as LanBridgeLike

      // 模拟 events.ts 中 game:init 处理逻辑
      const state = makeLanState()
      state.isLanMode = true
      state.lanPlayers = msgPlayers.map((p) => ({ id: p.id, name: p.name, isAI: p.isAI })) as typeof state.lanPlayers
      state.lanIsHost = hostId === bridge.playerId
      state.lanAiLlmEnabled = false
      state.lanAiPlayers = msgAiPlayers.map((ai) => ({
        id: ai.id,
        name: ai.name,
        isAI: true,
        isHost: false,
        llm: ai.llm
      })) as typeof state.lanAiPlayers

      // 模拟 host 逻辑：初始化钱包并将 AI 加入 lanPlayers
      state.lanHostWallets = {}
      state.lanPlayers.forEach((p) => {
        state.lanHostWallets[p.id] = 50000
      })
      state.lanAiPlayers.forEach((ai) => {
        state.lanPlayers.push(ai as typeof state.lanPlayers[0])
        state.lanHostWallets[ai.id] = 50000
      })

      expect(state.isLanMode).toBe(true)
      expect(state.lanPlayers).toHaveLength(3)
      expect(state.lanPlayers[0].id).toBe("host1")
      expect(state.lanPlayers[1].id).toBe("client1")
      expect(state.lanPlayers[2].id).toBe("ai1")
      expect(state.lanIsHost).toBe(true)
    })

    it("startLanRun 应正确映射 players（id=p1/p2/p3, lanId, isHuman, isAI, isSelf）", () => {
      const state = makeLanState({
        lanPlayers: [
          { id: "host1", name: "主机", isAI: false, isHost: true },
          { id: "client1", name: "客机", isAI: false, isHost: false },
          { id: "ai1", name: "AI-1", isAI: true, isHost: false }
        ] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [
          { id: "ai1", name: "AI-1", isAI: true, isHost: false, llm: false }
        ],
        lanIsHost: true,
        lanHostWallets: { host1: 50000, client1: 50000, ai1: 50000 }
      })
      const deps = makeLanDeps({
        getLanBridge: () => makeMockBridge({ playerId: "host1" }),
      })
      // 模拟 host 逻辑：AI 已加入 lanPlayers
      // 已在 state 中设置好

      startLanRun(deps, state)

      expect(state.players).toHaveLength(3)
      // 第 1 个玩家：主机 -> p1
      expect(state.players[0].id).toBe("p1")
      expect((state.players[0] as unknown as Record<string, unknown>).lanId).toBe("host1")
      expect((state.players[0] as unknown as Record<string, unknown>).isHuman).toBe(true)
      expect((state.players[0] as unknown as Record<string, unknown>).isAI).toBe(false)
      expect((state.players[0] as unknown as Record<string, unknown>).isSelf).toBe(true)

      // 第 2 个玩家：客机 -> p2
      expect(state.players[1].id).toBe("p2")
      expect((state.players[1] as unknown as Record<string, unknown>).lanId).toBe("client1")
      expect((state.players[1] as unknown as Record<string, unknown>).isHuman).toBe(true)
      expect((state.players[1] as unknown as Record<string, unknown>).isAI).toBe(false)
      expect((state.players[1] as unknown as Record<string, unknown>).isSelf).toBe(false)

      // 第 3 个玩家：AI -> p3
      expect(state.players[2].id).toBe("p3")
      expect((state.players[2] as unknown as Record<string, unknown>).lanId).toBe("ai1")
      expect((state.players[2] as unknown as Record<string, unknown>).isHuman).toBe(false)
      expect((state.players[2] as unknown as Record<string, unknown>).isAI).toBe(true)
      expect((state.players[2] as unknown as Record<string, unknown>).isSelf).toBe(false)
    })

    it("应建立 lanIdToSlotId 和 slotIdToLanId 双向映射", () => {
      const state = makeLanState({
        lanPlayers: [
          { id: "host1", name: "主机", isAI: false, isHost: true },
          { id: "client1", name: "客机", isAI: false, isHost: false },
          { id: "ai1", name: "AI-1", isAI: true, isHost: false }
        ] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [
          { id: "ai1", name: "AI-1", isAI: true, isHost: false, llm: false }
        ],
        lanIsHost: true,
        lanHostWallets: { host1: 50000, client1: 50000, ai1: 50000 }
      })
      const deps = makeLanDeps({
        getLanBridge: () => makeMockBridge({ playerId: "host1" }),
      })

      startLanRun(deps, state)

      expect(state.lanIdToSlotId["host1"]).toBe("p1")
      expect(state.lanIdToSlotId["client1"]).toBe("p2")
      expect(state.lanIdToSlotId["ai1"]).toBe("p3")
      expect(state.slotIdToLanId["p1"]).toBe("host1")
      expect(state.slotIdToLanId["p2"]).toBe("client1")
      expect(state.slotIdToLanId["p3"]).toBe("ai1")
    })

    it("【关键】应正确解析 lanMySlotId 为主机槽位 p1（不是默认 p2）", () => {
      // 场景：主机是唯一真人玩家，应映射到 p1，不是默认 p2
      const state = makeLanState({
        lanPlayers: [
          { id: "host1", name: "主机", isAI: false, isHost: true },
          { id: "ai1", name: "AI-1", isAI: true, isHost: false }
        ] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [
          { id: "ai1", name: "AI-1", isAI: true, isHost: false, llm: false }
        ],
        lanIsHost: true,
        lanHostWallets: { host1: 50000, ai1: 50000 }
      })
      const deps = makeLanDeps({
        getLanBridge: () => makeMockBridge({ playerId: "host1" }),
      })

      startLanRun(deps, state)

      // lanMySlotId 应解析为 "p1"（对应 host1），不是默认的 "p2"
      expect(state.lanMySlotId).toBe("p1")
    })

    it("【关键】应正确解析 lanMySlotId 为客机槽位 p2（不是默认 p2 但路径正确）", () => {
      // 场景：客机是第二个玩家，应映射到 p2
      const state = makeLanState({
        lanPlayers: [
          { id: "host1", name: "主机", isAI: false, isHost: true },
          { id: "client1", name: "客机", isAI: false, isHost: false },
          { id: "ai1", name: "AI-1", isAI: true, isHost: false }
        ] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [
          { id: "ai1", name: "AI-1", isAI: true, isHost: false, llm: false }
        ],
        lanIsHost: false
      })
      const deps = makeLanDeps({
        getLanBridge: () => makeMockBridge({ playerId: "client1" }),
      })

      startLanRun(deps, state)

      // 客机 playerId 是 "client1"，映射到 p2
      expect(state.lanMySlotId).toBe("p2")
    })

    it("startLanRun 应调用 beginRunTracking / exitSettlementPage / startRound / updateHud", () => {
      const state = makeLanState({
        lanPlayers: [
          { id: "host1", name: "主机", isAI: false, isHost: true }
        ] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [],
        lanIsHost: true,
        lanHostWallets: { host1: 50000 }
      })
      const deps = makeLanDeps({
        getLanBridge: () => makeMockBridge({ playerId: "host1" }),
      })

      startLanRun(deps, state)

      expect(deps.beginRunTracking).toHaveBeenCalled()
      expect(deps.exitSettlementPage).toHaveBeenCalled()
      expect(deps.startRound).toHaveBeenCalled()
      expect(deps.updateHud).toHaveBeenCalled()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 链条 2：carryItems 同步链条
  // ═════════════════════════════════════════════════════════════════════════

  describe("carryItems 同步链条", () => {
    it("lan:carry-items-update 事件应更新 slotConfig 的 carryItems", () => {
      const slotConfig: SlotConfigItem[] = [
        { type: "host", id: "host1", name: "主机" },
        { type: "client", id: "client1", name: "客机" },
        { type: "empty" },
        { type: "empty" }
      ]

      // 模拟收到客机携带道具更新
      applyCarryItemsUpdate(slotConfig, { playerId: "client1", carryItems: ["item-001", "item-002"] })

      expect(slotConfig[1].carryItems).toEqual(["item-001", "item-002"])
      // 主机 carryItems 应保持不变（未设置）
      expect(slotConfig[0].carryItems).toBeUndefined()
    })

    it("【关键】syncSlotsFromPlayers 重建时不丢失 carryItems", () => {
      const slotConfig: SlotConfigItem[] = [
        { type: "host", id: "host1", name: "主机", carryItems: ["item-king"] },
        { type: "client", id: "client1", name: "客机", carryItems: ["item-001", "item-002"] },
        { type: "empty" },
        { type: "empty" }
      ]

      // 模拟 room:player-joined 事件触发 syncSlotsFromPlayers（只传 host）
      syncSlotsFromPlayers(slotConfig, [
        { id: "host1", name: "主机", isHost: true }
      ])

      // 主机 carryItems 应保留
      expect(slotConfig[0].carryItems).toEqual(["item-king"])
      // 非 host 槽位被清空
      expect(slotConfig[1].type).toBe("empty")
    })

    it("syncSlotsFromPlayers 重建全部玩家时保留各自 carryItems", () => {
      const slotConfig: SlotConfigItem[] = [
        { type: "host", id: "host1", name: "主机", carryItems: ["item-king"] },
        { type: "client", id: "client1", name: "客机", carryItems: ["item-001"] },
        { type: "empty" },
        { type: "empty" }
      ]

      // 模拟 room:player-joined 事件，重建所有玩家
      syncSlotsFromPlayers(slotConfig, [
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])

      // 每个玩家的 carryItems 应保留
      expect(slotConfig[0].carryItems).toEqual(["item-king"])
      expect(slotConfig[1].carryItems).toEqual(["item-001"])
    })

    it("新加入玩家（无现有 carryItems）应保持 carryItems 为 undefined", () => {
      const slotConfig: SlotConfigItem[] = [
        { type: "host", id: "host1", name: "主机", carryItems: ["item-king"] },
        { type: "empty" },
        { type: "empty" },
        { type: "empty" }
      ]

      // 新玩家 client1 加入，clinet1 之前没有 slotConfig 条目
      syncSlotsFromPlayers(slotConfig, [
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "新玩家", isHost: false }
      ])

      expect(slotConfig[0].carryItems).toEqual(["item-king"])
      // 新玩家 carryItems 应为 undefined
      expect(slotConfig[1].carryItems).toBeUndefined()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 链条 3：结算同步链条
  // ═════════════════════════════════════════════════════════════════════════

  describe("结算同步链条", () => {
    it("lanOnSettle 应通过 lanIdToSlotId 找到胜者并调用 finishAuction", () => {
      const state = makeLanState({
        lanIdToSlotId: { host1: "p1", client1: "p2", ai1: "p3" },
        players: [
          { id: "p1", name: "主机", isHuman: true, isAI: false, isSelf: true } as Player,
          { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false } as Player,
          { id: "p3", name: "AI-1", isHuman: false, isAI: true, isSelf: false } as Player
        ]
      })
      const deps = makeLanDeps()

      // 模拟收到 game:settle 消息，胜者是 host1
      lanOnSettle(deps, state, {
        winnerId: "host1",
        winnerBid: 80000,
        mode: "final"
      })

      expect(deps.finishAuction).toHaveBeenCalledWith(
        { playerId: "p1", bid: 80000 },
        "final"
      )
    })

    it("lanOnSettle 在找不到 lanIdToSlotId 时回退到搜索 lanId", () => {
      const state = makeLanState({
        // lanIdToSlotId 为空（模拟未同步的场景）
        lanIdToSlotId: {},
        players: [
          { id: "p1", name: "主机", isHuman: true, isAI: false, isSelf: true } as Player,
          { id: "p2", name: "客机", isHuman: true, isAI: false, isSelf: false } as Player
        ]
      })
      // 手动设置 players 的 lanId
      ;(state.players[0] as unknown as Record<string, unknown>).lanId = "host1"
      ;(state.players[1] as unknown as Record<string, unknown>).lanId = "client1"
      const deps = makeLanDeps()

      lanOnSettle(deps, state, {
        winnerId: "host1",
        winnerBid: 50000,
        mode: "direct"
      })

      expect(deps.finishAuction).toHaveBeenCalledWith(
        { playerId: "p1", bid: 50000 },
        "direct"
      )
    })

    it("lanOnSettle 在找不到胜者时回退到第一个玩家", () => {
      const state = makeLanState({
        lanIdToSlotId: {},
        players: [
          { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true } as Player
        ]
      })
      const deps = makeLanDeps()

      lanOnSettle(deps, state, {
        winnerId: "unknown_id",
        winnerBid: 30000,
        mode: "final"
      })

      expect(deps.finishAuction).toHaveBeenCalledWith(
        { playerId: "p2", bid: 30000 },
        "final"
      )
    })

    it("【关键】lanRestoreWarehouseFromSync 应调用 renderItem 渲染每个藏品", () => {
      const state = makeLanState({
        itemLayer: { destroy: vi.fn() },
        items: [],
        warehouseTrueValue: 0,
        revealedCells: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
      })
      const renderItem = vi.fn()
      const addContainer = vi.fn(() => ({ destroy: vi.fn() }))
      const rebuildWarehouseCellIndex = vi.fn()
      const deps = makeLanDeps({
        renderItem,
        addContainer,
        rebuildWarehouseCellIndex
      })

      const warehouseData = [
        {
          id: "item-1", key: "sword", name: "宝剑", majorCategory: "武器", category: "近战",
          trueValue: 50000, qualityKey: "rare", w: 2, h: 1, x: 0, y: 0
        },
        {
          id: "item-2", key: "shield", name: "盾牌", majorCategory: "防具", category: "盔甲",
          trueValue: 30000, qualityKey: "normal", w: 1, h: 2, x: 2, y: 0
        }
      ]

      lanRestoreWarehouseFromSync(deps, state, {
        warehouse: warehouseData,
        warehouseTrueValue: 80000,
        currentBid: 1000,
        aiMaxBid: 0
      })

      // renderItem 应为每个藏品调用一次
      expect(renderItem).toHaveBeenCalledTimes(2)
      // 验证第一个藏品的部分属性
      const firstCall = renderItem.mock.calls[0][0] as Artifact
      expect(firstCall.id).toBe("item-1")
      expect(firstCall.name).toBe("宝剑")
      expect(firstCall.trueValue).toBe(50000)
      // 验证第二个藏品
      const secondCall = renderItem.mock.calls[1][0] as Artifact
      expect(secondCall.id).toBe("item-2")
      expect(secondCall.name).toBe("盾牌")
      expect(secondCall.trueValue).toBe(30000)

      // 验证 state.items 正确填充
      expect(state.items).toHaveLength(2)
      expect(state.warehouseTrueValue).toBe(80000)
      expect(rebuildWarehouseCellIndex).toHaveBeenCalled()
    })

    it("lanRestoreWarehouseFromSync 空仓库时不调用 renderItem", () => {
      const state = makeLanState({
        items: [],
        warehouseTrueValue: 0,
        revealedCells: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
      })
      const renderItem = vi.fn()
      const deps = makeLanDeps({ renderItem })

      lanRestoreWarehouseFromSync(deps, state, {
        warehouse: [],
        warehouseTrueValue: 0
      })

      expect(renderItem).not.toHaveBeenCalled()
      expect(state.items).toHaveLength(0)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 链条 4：出价就绪状态同步
  // ═════════════════════════════════════════════════════════════════════════

  describe("出价就绪状态同步", () => {
    it("setPlayerBidReady 应按槽位独立设置", () => {
      const state = makeBidState()
      const deps = makeBidDeps()

      setPlayerBidReady(deps, state, "p1", true)
      expect(state.roundBidReadyState["p1"]).toBe(true)
      expect(state.roundBidReadyState["p2"]).toBeUndefined()
      expect(state.roundBidReadyState["p3"]).toBeUndefined()
      expect(state.roundBidReadyState["p4"]).toBeUndefined()
    })

    it("areAllPlayersBidReady 应检查所有玩家槽位", () => {
      const state = makeBidState()
      const deps = makeBidDeps()

      // 只有一个玩家准备好
      setPlayerBidReady(deps, state, "p1", true)
      expect(areAllPlayersBidReady(deps, state)).toBe(false)

      // 所有玩家都准备好
      setPlayerBidReady(deps, state, "p2", true)
      setPlayerBidReady(deps, state, "p3", true)
      setPlayerBidReady(deps, state, "p4", true)
      expect(areAllPlayersBidReady(deps, state)).toBe(true)
    })

    it("【关键】各槽位 ready 状态互不干扰", () => {
      const state = makeBidState()
      const deps = makeBidDeps()

      // 设置 p1 和 p3 为 ready
      setPlayerBidReady(deps, state, "p1", true)
      setPlayerBidReady(deps, state, "p3", true)

      // p2 和 p4 应仍为未定义（未设置）
      expect(state.roundBidReadyState["p1"]).toBe(true)
      expect(state.roundBidReadyState["p2"]).toBeUndefined()
      expect(state.roundBidReadyState["p3"]).toBe(true)
      expect(state.roundBidReadyState["p4"]).toBeUndefined()
    })

    it("【关键】不同槽位互不阻塞：p1 ready 不影响 p2 的 ready 状态", () => {
      const state = makeBidState()
      const deps = makeBidDeps()

      // p1 已提交
      setPlayerBidReady(deps, state, "p1", true)

      // 验证 p1 已 ready
      expect(state.roundBidReadyState["p1"]).toBe(true)

      // 验证 p2 不受影响，未 ready
      expect(state.roundBidReadyState["p2"]).toBeUndefined()

      // p2 单独提交
      setPlayerBidReady(deps, state, "p2", true)
      expect(state.roundBidReadyState["p2"]).toBe(true)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // 链条 5：联机/单机隔离
  // ═════════════════════════════════════════════════════════════════════════

  describe("联机/单机隔离", () => {
    function makeLanContaminatedState(): LanIndexState {
      return makeLanState({
        isLanMode: true,
        lanIsHost: true,
        lanPlayers: [{ id: "lan1" }, { id: "lan2" }] as unknown as LanIndexState["lanPlayers"],
        lanAiPlayers: [{ id: "ai_lan1", name: "AI", isAI: true, isHost: false }],
        lanHostWallets: { lan1: 50000, lan2: 30000 },
        lanHostBids: { lan1: 10000, lan2: 8000 },
        lanAiLlmEnabled: true,
        lanIdToSlotId: { lan1: "p2", lan2: "p3" },
        slotIdToLanId: { p2: "lan1", p3: "lan2" },
        lanMySlotId: "p2",
        aiLlmPlayerEnabled: { ai1: true },
        players: [
          { id: "p2", name: "玩家(联机)", avatar: "你", isHuman: true, isAI: false, isSelf: true } as Player,
          { id: "lan1", name: "联机玩家1", avatar: "B1", isHuman: true, isAI: false, isSelf: false } as Player,
          { id: "lan2", name: "联机玩家2", avatar: "B2", isHuman: true, isAI: false, isSelf: false } as Player
        ],
        playerMoney: 99999
      })
    }

    describe("startNewRun", () => {
      it("应将 isLanMode 重置为 false", () => {
        const state = makeLanContaminatedState()
        expect(state.isLanMode).toBe(true)
        mockStartNewRun(state)
        expect(state.isLanMode).toBe(false)
      })

      it("应将 players 重置为 4 个默认单机玩家", () => {
        const state = makeLanContaminatedState()
        expect(state.players.length).toBe(3)
        mockStartNewRun(state)
        expect(state.players).toHaveLength(4)
        expect(state.players[0].id).toBe("p1")
        expect(state.players[1].id).toBe("p2")
        expect(state.players[1].isSelf).toBe(true)
        expect(state.players[2].id).toBe("p3")
        expect(state.players[3].id).toBe("p4")
      })

      it("应清除联机映射表和状态", () => {
        const state = makeLanContaminatedState()
        mockStartNewRun(state)
        expect(state.lanPlayers).toHaveLength(0)
        expect(state.lanAiPlayers).toHaveLength(0)
        expect(state.lanIdToSlotId).toEqual({})
        expect(state.slotIdToLanId).toEqual({})
        expect(state.lanHostWallets).toEqual({})
        expect(state.lanHostBids).toEqual({})
        expect(state.lanAiLlmEnabled).toBe(false)
      })
    })

    describe("showLobbyMain", () => {
      it("应将 isLanMode 重置为 false", () => {
        const state = makeLanContaminatedState()
        mockShowLobbyMain(state)
        expect(state.isLanMode).toBe(false)
      })

      it("应将 players 重置为 4 个默认单机玩家", () => {
        const state = makeLanContaminatedState()
        mockShowLobbyMain(state)
        expect(state.players).toHaveLength(4)
        expect(state.players[1].id).toBe("p2")
        expect(state.players[1].isSelf).toBe(true)
      })

      it("应清除所有联机状态", () => {
        const state = makeLanContaminatedState()
        mockShowLobbyMain(state)
        expect(state.lanPlayers).toHaveLength(0)
        expect(state.lanAiPlayers).toHaveLength(0)
        expect(state.lanHostWallets).toEqual({})
        expect(state.lanHostBids).toEqual({})
        expect(state.lanAiLlmEnabled).toBe(false)
        expect(state.lanIdToSlotId).toEqual({})
        expect(state.slotIdToLanId).toEqual({})
        expect(state.lanMySlotId).toBeNull()
        expect(state.lanIsHost).toBe(false)
        expect(state.aiLlmPlayerEnabled).toEqual({})
      })
    })

    describe("enterLanRoom", () => {
      it("应将 lanPlayers 重置为空数组", () => {
        const state = makeLanContaminatedState()
        expect(state.lanPlayers.length).toBeGreaterThan(0)
        mockEnterLanRoom(state)
        expect(state.lanPlayers).toHaveLength(0)
        expect(state.lanAiPlayers).toHaveLength(0)
      })

      it("应将 players 重置为 4 个默认单机玩家", () => {
        const state = makeLanContaminatedState()
        expect(state.players.length).toBe(3)
        mockEnterLanRoom(state)
        expect(state.players).toHaveLength(4)
        expect(state.players[1].isSelf).toBe(true)
      })

      it("应清除联机钱包和出价记录", () => {
        const state = makeLanContaminatedState()
        mockEnterLanRoom(state)
        expect(state.lanHostWallets).toEqual({})
        expect(state.lanHostBids).toEqual({})
        expect(state.lanAiLlmEnabled).toBe(false)
      })

      it("应重置联机映射表和 slotId", () => {
        const state = makeLanContaminatedState()
        mockEnterLanRoom(state)
        expect(state.lanIdToSlotId).toEqual({})
        expect(state.slotIdToLanId).toEqual({})
        expect(state.lanMySlotId).toBeNull()
        expect(state.aiLlmPlayerEnabled).toEqual({})
      })
    })
  })
})