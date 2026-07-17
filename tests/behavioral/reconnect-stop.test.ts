/**
 * @file tests/behavioral/reconnect-stop.test.ts
 * @description 重连停止行为测试。
 *   - Room not found 时重连必须立即停止，不能无限循环
 *   - 单机模式（isLanMode=false）时重连不触发任何 UI 更新
 *   - 预期：Room not found 后重连必须停，不能无限循环
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { lanAttemptReconnect, onLanForeground } from "../../scripts/game/lan/lan-index-manager/sync-fns"
import type { LanIndexManagerDeps, LanIndexState, LanBridgeLike } from "../../scripts/game/lan/lan-index-manager"
import type { Player } from "../../types/game"

// ─── 测试工具 ───

function makeState(overrides: Partial<LanIndexState> = {}): LanIndexState {
  return {
    isLanMode: true,
    lanIsHost: false,
    lanPlayers: [],
    lanAiPlayers: [],
    lanHostWallets: {},
    lanHostBids: {},
    lanAiLlmEnabled: false,
    lanIdToSlotId: {},
    slotIdToLanId: {},
    lanMySlotId: null,
    lanReconnecting: true,
    lanReconnectAttempts: 0,
    lanMaxReconnectAttempts: 5,
    lanLastServerUrl: "ws://localhost:9720",
    lanLastRoomCode: "ABCD",
    lanLastPlayerId: "lan-1",
    lanStatusEl: null,
    _pauseSnapshotTimeLeft: null,
    round: 1,
    roundResolving: false,
    settled: false,
    roundPaused: false,
    roundTimeLeft: 30,
    currentBid: 1000,
    bidLeader: null,
    secondHighestBid: 0,
    playerBidSubmitted: false,
    playerRoundBid: 0,
    playerMoney: 20000,
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
    ...overrides,
  }
}

function makeMockBridge(overrides: Partial<LanBridgeLike> = {}): LanBridgeLike {
  return {
    ws: { url: "ws://localhost:9720", readyState: WebSocket.OPEN },
    connected: true,
    playerId: "lan-1",
    playerName: "测试玩家",
    roomCode: "ABCD",
    isHost: false,
    players: [],
    on: vi.fn(),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    send: vi.fn(() => true),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    reconnect: vi.fn(),
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
    ...overrides,
  }
}

function makeDeps(overrides: Partial<LanIndexManagerDeps> = {}): {
  deps: LanIndexManagerDeps
  state: LanIndexState
  mockBridge: LanBridgeLike
} {
  const state = makeState()
  const mockBridge = makeMockBridge()

  const deps: LanIndexManagerDeps = {
    state,
    getLanBridge: () => mockBridge,
    createLanBridge: () => makeMockBridge(),
    setLanBridge: vi.fn(),
    writeLog: vi.fn(),
    setOnlineStatus: vi.fn() as unknown as (text: string, cls: string) => void,
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
    revealRoundBidsSequential: vi.fn(async () => {}),
    recordRoundHistory: vi.fn(),
    finishAuction: vi.fn(),
    captureAiDecisionTelemetry: vi.fn(),
    recordAiThoughtLogs: vi.fn(),
    renderAiLogicPanel: vi.fn(),
    waitUntilResumed: vi.fn(async () => {}),
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
    isAiLlmEnabledForPlayer: () => false,
    canUseLlmDecisionForPlayer: () => false,
    normalizeAiBidValue: (_pid: string, bid: number, _wallet: number | null) => bid,
    updateLobbyMoneyDisplay: vi.fn(),
    getLastRoundBidMap: () => ({}),
    buildAiIntelSnapshot: () => ({}),
    hasAnyInfo: () => false,
    aiEngine: {
      buildAIBids: () => ({}),
      resetForNewRun: vi.fn(),
    },
    skillManager: {
      onNewRound: vi.fn(),
      resetForNewRun: vi.fn(),
    },
    getProfile: null,
    getSelectedProfileId: null,
    getSettingsMaxRounds: () => 5,
    getSettingsDirectTakeRatio: () => 0.2,
    setSettingsMaxRounds: vi.fn(),
    setSettingsDirectTakeRatio: vi.fn(),
    ...overrides,
  }

  return { deps, state, mockBridge }
}

// ─── 测试 ───

describe("重连停止行为", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ═════════════ 场景 1：Room not found 停止重连 ═════════════

  describe("Room not found 时停止重连", () => {
    it("reconnect 失败返回 'Room not found' 后停止重连循环", async () => {
      const { deps, state, mockBridge } = makeDeps()
      state.lanReconnecting = true
      state.lanReconnectAttempts = 0
      state.lanLastServerUrl = "ws://localhost:9720"
      state.lanLastRoomCode = "ABCD"
      state.lanLastPlayerId = "lan-1"

      // reconnect 返回拒绝，错误为 "Room not found"
      const reconnectError = new Error("Room not found")
      mockBridge.reconnect = vi.fn(async () => {
        throw reconnectError
      })

      lanAttemptReconnect(deps, state)

      // 等待 setTimeout 触发
      await vi.advanceTimersByTimeAsync(2000)

      // 预期：重连停止，不再递归调用
      expect(state.lanReconnecting).toBe(false)
      expect(state.lanReconnectAttempts).toBe(0)
      expect(state.lanLastServerUrl).toBeNull()
      expect(state.lanLastRoomCode).toBeNull()
      expect(state.lanLastPlayerId).toBeNull()
      // bridge.disconnect 被调用
      expect(mockBridge.disconnect).toHaveBeenCalled()
      expect(deps.writeLog).toHaveBeenCalledWith("重连失败：房间已解散，停止重连")
    })

    it("Room not found 后不再继续重连（不递归）", async () => {
      const { deps, state, mockBridge } = makeDeps()
      state.lanReconnecting = true
      state.lanReconnectAttempts = 0
      state.lanLastServerUrl = "ws://localhost:9720"
      state.lanLastRoomCode = "ABCD"
      state.lanLastPlayerId = "lan-1"

      // 记录 reconnect 调用次数
      let reconnectCount = 0
      const reconnectError = new Error("Room not found")
      mockBridge.reconnect = vi.fn(async () => {
        reconnectCount++
        throw reconnectError
      })

      lanAttemptReconnect(deps, state)

      // 等待 setTimeout 触发
      await vi.advanceTimersByTimeAsync(2000)

      // 预期：只调了一次 reconnect（第一次尝试），Room not found 后不递归
      expect(reconnectCount).toBe(1)
      expect(state.lanReconnecting).toBe(false)
    })

    it("其他错误（连接超时）继续重连", async () => {
      const { deps, state, mockBridge } = makeDeps()
      state.lanReconnecting = true
      state.lanReconnectAttempts = 0
      state.lanLastServerUrl = "ws://localhost:9720"
      state.lanLastRoomCode = "ABCD"
      state.lanLastPlayerId = "lan-1"

      // 前两次返回连接超时，第三次成功
      let callCount = 0
      mockBridge.reconnect = vi.fn(async () => {
        callCount++
        if (callCount <= 2) {
          throw new Error("Connection timeout")
        }
        return { roomCode: "ABCD", roomState: "playing", isHost: false, players: [] }
      })

      lanAttemptReconnect(deps, state)

      // 第一次重连（连接超时）
      await vi.advanceTimersByTimeAsync(2000)
      // 第二次重连（指数退避 2s）
      await vi.advanceTimersByTimeAsync(4000)
      // 第三次重连（成功）
      await vi.advanceTimersByTimeAsync(8000)

      // 预期：最终重连成功（reconnecting=false, attempts=0）
      expect(state.lanReconnecting).toBe(false)
      expect(state.lanReconnectAttempts).toBe(0)
      expect(mockBridge.requestFullSync).toHaveBeenCalled()
    })
  })

  // ═════════════ 场景 2：单机模式不触发重连 UI 更新 ═════════════

  describe("单机模式时重连不触发 UI 更新", () => {
    it("isLanMode=false 时 lanAttemptReconnect 直接退出", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = false
      state.lanReconnecting = true
      state.lanReconnectAttempts = 2

      lanAttemptReconnect(deps, state)

      // 预期：重连停止，重置状态
      expect(state.lanReconnecting).toBe(false)
      expect(state.lanReconnectAttempts).toBe(0)
      // 不触发任何 UI 更新
      expect(deps.updateHud).not.toHaveBeenCalled()
      expect(deps.initPlayersUI).not.toHaveBeenCalled()
    })

    it("isLanMode=false 时 onLanForeground 直接退出", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = false
      state.lanReconnecting = true

      onLanForeground(deps, state)

      // 预期：不启动重连
      expect(state.lanReconnecting).toBe(true) // 未修改
      expect(deps.writeLog).not.toHaveBeenCalledWith("连接断开，正在尝试重连...")
    })

    it("setTimeout 回调时 isLanMode 变为 false 则停止重连", async () => {
      const { deps, state, mockBridge } = makeDeps()
      state.lanReconnecting = true
      state.lanReconnectAttempts = 0
      state.lanLastServerUrl = "ws://localhost:9720"
      state.lanLastRoomCode = "ABCD"
      state.lanLastPlayerId = "lan-1"

      // reconnect 模拟长时间未返回（网络延迟）
      let resolveReconnect: (v: unknown) => void
      const reconnectPromise = new Promise((resolve) => {
        resolveReconnect = resolve
      })
      mockBridge.reconnect = vi.fn(async () => {
        return reconnectPromise
      })

      lanAttemptReconnect(deps, state)

      // setTimeout 触发（reconnect 被调用，但 promise 未 resolve）
      await vi.advanceTimersByTimeAsync(2000)

      // 模拟 startNewRun 被调用，isLanMode 变为 false
      state.isLanMode = false
      state.lanReconnecting = false

      // 现在 resolve reconnect（理论上不应触发任何 UI 更新）
      resolveReconnect!({ roomCode: "ABCD", roomState: "playing", isHost: false, players: [] })
      await vi.advanceTimersByTimeAsync(100)

      // 预期：不触发 requestFullSync（因为 isLanMode=false 且 lanReconnecting=false）
      expect(mockBridge.requestFullSync).not.toHaveBeenCalled()
      expect(deps.updateHud).not.toHaveBeenCalled()
      expect(deps.initPlayersUI).not.toHaveBeenCalled()
    })
  })

  // ═════════════ 场景 3：重连信息缺失时跳过 ═════════════

  describe("重连信息缺失时跳过", () => {
    it("lanLastServerUrl 为空时跳过重连", () => {
      const { deps, state } = makeDeps()
      state.lanLastServerUrl = null

      lanAttemptReconnect(deps, state)

      expect(state.lanReconnecting).toBe(false)
      expect(deps.writeLog).toHaveBeenCalledWith("重连信息缺失，请手动重新连接")
    })

    it("lanLastRoomCode 为空时跳过重连", () => {
      const { deps, state } = makeDeps()
      state.lanLastRoomCode = null

      lanAttemptReconnect(deps, state)

      expect(state.lanReconnecting).toBe(false)
    })

    it("lanLastPlayerId 为空时跳过重连", () => {
      const { deps, state } = makeDeps()
      state.lanLastPlayerId = null

      lanAttemptReconnect(deps, state)

      expect(state.lanReconnecting).toBe(false)
    })
  })

  // ═════════════ 场景 4：超过最大重连次数时停止 ═════════════

  describe("超过最大重连次数时停止", () => {
    it("达到最大重连尝试次数后停止", () => {
      const { deps, state } = makeDeps()
      state.lanReconnectAttempts = 5
      state.lanMaxReconnectAttempts = 5

      lanAttemptReconnect(deps, state)

      expect(state.lanReconnecting).toBe(false)
      expect(deps.writeLog).toHaveBeenCalledWith("重连失败次数过多，请手动重新连接")
    })
  })
})