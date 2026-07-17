/**
 * @file tests/game/lan/lan-index-manager.test.ts
 * @description LanIndexManager 测试。mock deps，测试关键流程。
 */
import { describe, it, expect, vi } from "vitest"
import {
  LanIndexManager,
  type LanIndexManagerDeps,
  type LanIndexState,
  type LanBridgeLike,
} from "../../../scripts/game/lan/lan-index-manager"
import type { Player, Artifact } from "../../../types/game"
import type { LanPlayer } from "../../../types/lan"
import { GAME_SETTINGS } from "../../../scripts/game/core/settings"

// ─── 测试工具 ───

function makeState(overrides: Partial<LanIndexState> = {}): LanIndexState {
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

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "测试玩家",
    avatar: "P1",
    isHuman: true,
    isAI: false,
    isSelf: true,
    ...overrides,
  }
}

function makeLanPlayer(overrides: Partial<LanPlayer> = {}): LanPlayer {
  return {
    id: "lan-1",
    name: "联机玩家",
    isAI: false,
    isReady: false,
    characterId: null,
    carryItems: [],
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
    isHost: true,
    players: [],
    on: vi.fn(),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    send: vi.fn(() => true),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    reconnect: vi.fn(async () => ({})),
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

function makeDeps(overrides: Partial<LanIndexManagerDeps> = {}): { deps: LanIndexManagerDeps; state: LanIndexState } {
  const state = makeState()
  const mockBridge = makeMockBridge()

  const deps: LanIndexManagerDeps = {
    state,
    getLanBridge: () => mockBridge,
    createLanBridge: () => makeMockBridge(),
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
    normalizeAiBidValue: (_pid: string, bid: number, _wallet: number) => bid,
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

  return { deps, state }
}

// ─── 测试 ───

describe("LanIndexManager", () => {
  // ═════════════ 构造 / 状态初始化 ═════════════

  describe("constructor", () => {
    it("接受 deps 并创建实例", () => {
      const { deps } = makeDeps()
      const manager = new LanIndexManager(deps)
      expect(manager).toBeInstanceOf(LanIndexManager)
    })

    it("内部 state 引用与 deps.state 一致", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      expect(manager["state"]).toBe(state)
    })
  })

  // ═════════════ 游戏流程方法 ═════════════

  describe("lanResolveRound", () => {
    it("已结算时跳过", () => {
      const { deps, state } = makeDeps()
      state.settled = true
      const manager = new LanIndexManager(deps)
      manager.lanResolveRound("test")
      expect(deps.stopRoundTimer).not.toHaveBeenCalled()
    })

    it("回合解析中跳过", () => {
      const { deps, state } = makeDeps()
      state.roundResolving = true
      const manager = new LanIndexManager(deps)
      manager.lanResolveRound("test")
      expect(deps.stopRoundTimer).not.toHaveBeenCalled()
    })
  })

  describe("lanComputeAiBids", () => {
    it("无 AI 玩家时返回空对象", () => {
      const { deps, state } = makeDeps()
      state.lanAiPlayers = []
      state.items = []
      state.players = [makePlayer({ id: "p1" })]
      const manager = new LanIndexManager(deps)
      const bids = manager.lanComputeAiBids()
      expect(typeof bids).toBe("object")
    })

    it("有 AI 玩家且无 LLM 覆盖时返回规则出价", () => {
      const { deps, state } = makeDeps()
      state.lanAiPlayers = [{ id: "ai-1", name: "AI-1", isAI: true, isHost: false }]
      state.items = []
      state.players = [makePlayer({ id: "p1" })]
      deps.aiEngine = {
        buildAIBids: () => ({ "ai-1": 500 }),
        resetForNewRun: vi.fn(),
      }
      const manager = new LanIndexManager(deps)
      const bids = manager.lanComputeAiBids()
      expect(bids["ai-1"]).toBe(500)
    })
  })

  describe("lanOnRoundStart", () => {
    it("设置回合状态并开始回合", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      manager.lanOnRoundStart({ round: 3, currentBid: 1500 })
      expect(state.round).toBe(3)
      expect(state.currentBid).toBe(1500)
      expect(state.playerBidSubmitted).toBe(false)
      expect(deps.startRound).toHaveBeenCalled()
      expect(deps.updateHud).toHaveBeenCalled()
    })

    it("时间校正生效", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      manager.lanOnRoundStart({
        round: 2,
        currentBid: 500,
        ts: Date.now() - 2000,
        roundSeconds: 30,
      })
      expect(state.round).toBe(2)
      expect(state.roundTimeLeft).toBeLessThanOrEqual(30)
    })
  })

  describe("lanBroadcastRoundStart", () => {
    it("委托到 bridge.broadcastRoundStart", () => {
      const { deps, state } = makeDeps()
      state.round = 2
      state.currentBid = 1000
      const manager = new LanIndexManager(deps)
      manager.lanBroadcastRoundStart()
      const bridge = deps.getLanBridge()
      expect(bridge?.broadcastRoundStart).toHaveBeenCalledWith(2, expect.any(Number), 1000, expect.any(Number))
    })
  })

  describe("startLanRun", () => {
    it("初始化游戏状态并创建玩家", () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = true
      state.lanPlayers = [makeLanPlayer({ id: "lan-1", name: "Host" })]
      state.lanAiPlayers = []
      const manager = new LanIndexManager(deps)
      manager.startLanRun()
      expect(state.round).toBe(1)
      expect(state.roundResolving).toBe(false)
      expect(state.settled).toBe(false)
      expect(deps.beginRunTracking).toHaveBeenCalled()
      expect(deps.startRound).toHaveBeenCalled()
      expect(deps.updateHud).toHaveBeenCalled()
    })

    it("非主机调用 initAiWallets", () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = false
      state.lanPlayers = [makeLanPlayer({ id: "lan-1", name: "Client" })]
      state.lanAiPlayers = []
      const manager = new LanIndexManager(deps)
      manager.startLanRun()
      expect(deps.initAiWallets).toHaveBeenCalled()
    })
  })

  describe("lanOnAllBidsIn", () => {
    it("收集 AI 和玩家出价后解析回合", async () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = true
      state.players = [makePlayer({ id: "p1", name: "玩家" })]
      state.lanAiPlayers = []
      const manager = new LanIndexManager(deps)
      await manager.lanOnAllBidsIn({})
      expect(deps.writeLog).not.toHaveBeenCalledWith(expect.stringContaining("AI行动异常"))
    })
  })

  describe("lanOnRoundTimeout", () => {
    it("超时时使用已有出价并解析回合", async () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = true
      state.players = [makePlayer({ id: "p1" })]
      state.lanAiPlayers = []
      const manager = new LanIndexManager(deps)
      await manager.lanOnRoundTimeout()
      expect(deps.stopRoundTimer).toHaveBeenCalled()
    })
  })

  describe("lanOnRoundResult", () => {
    it("显示出价结果并记录历史", () => {
      const { deps, state } = makeDeps()
      state.players = [makePlayer({ id: "p1", name: "玩家" })]
      const manager = new LanIndexManager(deps)
      manager.lanOnRoundResult({
        bids: [{ playerId: "lan-1", bid: 500 }],
      })
      expect(deps.revealRoundBidsSequential).toHaveBeenCalled()
    })
  })

  describe("lanDoFinishAuction", () => {
    it("完成拍卖并广播最终钱包", () => {
      const { deps, state } = makeDeps()
      state.players = [makePlayer({ id: "p1", lanId: "lan-1" } as Player)]
      state.lanHostWallets = { "lan-1": 10000 }
      state.lanHostBids = { "lan-1": 2000 }
      state.warehouseTrueValue = 8000
      const manager = new LanIndexManager(deps)
      manager.lanDoFinishAuction({ playerId: "p1", bid: 2000 }, "direct")
      expect(deps.finishAuction).toHaveBeenCalledWith({ playerId: "p1", bid: 2000 }, "direct")
    })
  })

  // ═════════════ 同步方法 ═════════════

  describe("lanBuildFullSyncData", () => {
    it("返回包含完整状态的对象", () => {
      const { deps, state } = makeDeps()
      state.round = 2
      state.currentBid = 1500
      state.players = [makePlayer({ id: "p1" })]
      const manager = new LanIndexManager(deps)
      const data = manager.lanBuildFullSyncData("lan-1")
      expect(data.round).toBe(2)
      expect(data.currentBid).toBe(1500)
      expect(data.playerId).toBe("lan-1")
    })

    it("主机模式包含钱包和出价", () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = true
      state.players = [makePlayer({ id: "p1" })]
      state.slotIdToLanId = { p1: "lan-1" }
      state.lanHostWallets = { "lan-1": 5000 }
      state.lanHostBids = { "lan-1": 1000 }
      const manager = new LanIndexManager(deps)
      const data = manager.lanBuildFullSyncData("lan-1")
      expect(data.wallets).toBeDefined()
      expect(data.bids).toBeDefined()
    })
  })

  describe("lanOnFullSync", () => {
    it("非主机时更新状态", () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = false
      state.players = [makePlayer({ id: "p1" })]
      const manager = new LanIndexManager(deps)
      manager.lanOnFullSync({
        round: 5,
        currentBid: 3000,
        warehouseTrueValue: 50000,
        roundTimeLeft: 20,
        isPaused: false,
        settled: false,
        playerBidSubmitted: true,
        playerRoundBid: 2000,
        wallets: { "lan-1": 15000 },
        bids: { "lan-1": 2000 },
        playerCharacters: {},
        mapProfileId: "default",
        publicInfoEntries: [],
        warehouse: [],
        warehouseTrueValue: 50000,
        currentBid: 3000,
        aiMaxBid: 0,
      })
      expect(state.round).toBe(5)
      expect(state.currentBid).toBe(3000)
      expect(deps.writeLog).toHaveBeenCalledWith("收到全量状态同步")
    })

    it("主机模式跳过", () => {
      const { deps, state } = makeDeps()
      state.lanIsHost = true
      const manager = new LanIndexManager(deps)
      manager.lanOnFullSync({})
      expect(deps.writeLog).not.toHaveBeenCalled()
    })
  })

  describe("toggleLanPause", () => {
    it("非主机时不操作", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.lanIsHost = false
      const manager = new LanIndexManager(deps)
      manager.toggleLanPause(true)
      expect(deps.syncPauseButton).not.toHaveBeenCalled()
    })

    it("主机暂停时设置暂停标记", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.lanIsHost = true
      state.roundTimeLeft = 20
      const manager = new LanIndexManager(deps)
      manager.toggleLanPause(true)
      expect(state.roundPaused).toBe(true)
      expect(state._pauseSnapshotTimeLeft).toBe(20)
      expect(deps.showLanPauseOverlay).toHaveBeenCalled()
    })

    it("主机恢复时恢复时间", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.lanIsHost = true
      state.roundPaused = true
      state._pauseSnapshotTimeLeft = 15
      const manager = new LanIndexManager(deps)
      manager.toggleLanPause(false)
      expect(state.roundPaused).toBe(false)
      expect(state.roundTimeLeft).toBe(15)
      expect(deps.hideLanPauseOverlay).toHaveBeenCalled()
    })
  })

  describe("onLanBackground", () => {
    it("非联机模式跳过", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = false
      const manager = new LanIndexManager(deps)
      manager.onLanBackground()
      expect(deps.writeLog).not.toHaveBeenCalled()
    })

    it("主机自动暂停", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.lanIsHost = true
      state.roundPaused = false
      state.settled = false
      const manager = new LanIndexManager(deps)
      manager.onLanBackground()
      expect(state.roundPaused).toBe(true)
      expect(deps.writeLog).toHaveBeenCalledWith("游戏进入后台，已自动暂停")
    })
  })

  describe("onLanForeground", () => {
    it("已结算时跳过", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.settled = true
      const manager = new LanIndexManager(deps)
      manager.onLanForeground()
      expect(deps.writeLog).not.toHaveBeenCalled()
    })
  })

  // ═════════════ 结算方法 ═════════════

  describe("lanOnSettleFinal", () => {
    it("更新玩家钱包", () => {
      const { deps, state } = makeDeps()
      state.playerMoney = 10000
      const manager = new LanIndexManager(deps)
      manager.lanOnSettleFinal({ wallets: { "lan-1": 25000 } })
      expect(state.playerMoney).toBe(25000)
      expect(deps.updateHud).toHaveBeenCalled()
    })
  })

  describe("lanOnSettle", () => {
    it("找到胜者并结算", () => {
      const { deps, state } = makeDeps()
      state.lanIdToSlotId = { "lan-1": "p1" }
      state.players = [makePlayer({ id: "p1", name: "胜者" })]
      const manager = new LanIndexManager(deps)
      manager.lanOnSettle({ winnerId: "lan-1", winnerBid: 3000, mode: "direct" })
      expect(deps.finishAuction).toHaveBeenCalledWith(
        { playerId: "p1", bid: 3000 },
        "direct",
      )
    })
  })

  describe("lanOnRestartGo", () => {
    it("重新初始化联机状态", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      manager.lanOnRestartGo({
        players: [{ id: "lan-1", name: "Host", isAI: false, isHost: true }],
        hostId: "lan-1",
        aiPlayers: [],
        aiLlmEnabled: false,
      })
      expect(state.isLanMode).toBe(true)
      expect(deps.exitLobby).toHaveBeenCalled()
      expect(deps.exitSettlementPage).toHaveBeenCalled()
    })

    it("主机模式设置钱包", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      manager.lanOnRestartGo({
        players: [{ id: "lan-1", name: "Host", isAI: false, isHost: true }],
        hostId: "lan-1",
        aiPlayers: [],
        aiLlmEnabled: false,
      })
      expect(state.lanIsHost).toBe(true)
      expect(state.lanHostWallets["lan-1"]).toBeGreaterThan(0)
    })
  })

  // ═════════════ 重连方法 ═════════════

  describe("lanAttemptReconnect", () => {
    it("缺少重连信息时跳过", () => {
      const { deps, state } = makeDeps()
      state.isLanMode = true
      state.lanLastServerUrl = null
      const manager = new LanIndexManager(deps)
      manager.lanAttemptReconnect()
      expect(deps.writeLog).toHaveBeenCalledWith("重连信息缺失，请手动重新连接")
    })
  })

  describe("tryAutoReconnect", () => {
    it("尝试重连", () => {
      const { deps, state } = makeDeps()
      const manager = new LanIndexManager(deps)
      manager.tryAutoReconnect("lan-1", "ABCD", "Player", false)
      expect(deps.writeLog).toHaveBeenCalledWith(
        expect.stringContaining("尝试自动重连"),
      )
    })
  })

  // ═════════════ Live2D 方法 ═════════════

  describe("startLanLive2dLoop / stopLanLive2dLoop", () => {
    it("调用无错误", () => {
      const { deps } = makeDeps()
      const manager = new LanIndexManager(deps)
      const videoA = document.createElement("video")
      const videoB = document.createElement("video")
      expect(() => {
        manager.startLanLive2dLoop("test.mp4", videoA, videoB)
      }).not.toThrow()
      expect(() => {
        manager.stopLanLive2dLoop()
      }).not.toThrow()
    })
  })

  // ═════════════ 事件绑定方法 ═════════════

  describe("bindLanEvents", () => {
    it("绑定 bridge.on 到 ws:open 事件", () => {
      const { deps, state } = makeDeps()
      const bridge = makeMockBridge()
      const manager = new LanIndexManager(deps)
      manager.bindLanEvents(bridge, {})
      expect(bridge.on).toHaveBeenCalledWith("ws:open", expect.any(Function))
    })

    it("绑定 bridge.on 到所有关键事件", () => {
      const { deps, state } = makeDeps()
      const bridge = makeMockBridge()
      const manager = new LanIndexManager(deps)
      const events: string[] = []
      bridge.on = vi.fn((event: string) => {
        events.push(event)
      })
      manager.bindLanEvents(bridge, {})
      expect(events).toContain("ws:open")
      expect(events).toContain("ws:close")
      expect(events).toContain("room:created")
      expect(events).toContain("room:joined")
      expect(events).toContain("game:init")
      expect(events).toContain("round:start")
      expect(events).toContain("all-bids-in")
      expect(events).toContain("round:timeout")
      expect(events).toContain("game:settle")
      expect(events).toContain("game:settle-final")
      expect(events).toContain("full-sync")
      expect(events).toContain("full-sync-request")
    })
  })

  // ════════════════ settings 隔离性（防 LAN 泄漏到 GAME_SETTINGS） ════════════════
  describe("settings deps 隔离性", () => {
    it("setSettingsMaxRounds 不影响 GAME_SETTINGS.maxRounds（防联机泄漏单机）", () => {
      const original = GAME_SETTINGS.maxRounds
      let _maxRounds = 5
      const { deps } = makeDeps({
        setSettingsMaxRounds: vi.fn((v: number) => { _maxRounds = v }),
        getSettingsMaxRounds: () => _maxRounds,
      })
      deps.setSettingsMaxRounds(999)
      // 核心断言：GAME_SETTINGS 未被修改
      expect(GAME_SETTINGS.maxRounds).toBe(original)
      expect(GAME_SETTINGS.maxRounds).not.toBe(999)
      expect(deps.getSettingsMaxRounds()).toBe(999)
    })

    it("setSettingsDirectTakeRatio 不影响 GAME_SETTINGS.directTakeRatio", () => {
      const original = GAME_SETTINGS.directTakeRatio
      let _ratio = 0.2
      const { deps } = makeDeps({
        setSettingsDirectTakeRatio: vi.fn((v: number) => { _ratio = v }),
        getSettingsDirectTakeRatio: () => _ratio,
      })
      deps.setSettingsDirectTakeRatio(0.99)
      expect(GAME_SETTINGS.directTakeRatio).toBe(original)
      expect(GAME_SETTINGS.directTakeRatio).not.toBe(0.99)
      expect(deps.getSettingsDirectTakeRatio()).toBe(0.99)
    })

  })
})