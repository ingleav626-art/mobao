import { describe, it, expect, beforeAll, vi } from "vitest"
import { initDeps, Deps } from "../../scripts/game/core/deps"

let WarehouseScene: any
let scene: any

class MockPhaserScene {
  sys = { events: { on: vi.fn(), once: vi.fn(), emit: vi.fn() } }
  add = { graphics: vi.fn(() => ({})), container: vi.fn(() => ({})), text: vi.fn(() => ({})) }
  tweens = { add: vi.fn() }
  time = { addEvent: vi.fn(), delayedCall: vi.fn(), now: 0 }
  scale = { width: 800, height: 600, refresh: vi.fn() }
  cameras = { main: { setScroll: vi.fn(), setBackgroundColor: vi.fn() } }
  input = { on: vi.fn(), keyboard: { on: vi.fn(), addKey: vi.fn() } }
  load = { image: vi.fn(), audio: vi.fn() }
  cache = { audio: { get: vi.fn() } }
  sound = { play: vi.fn(), add: vi.fn() }
  constructor(_config: unknown) {}
}

beforeAll(async () => {
  ;(globalThis as any).Phaser = {
    Scene: MockPhaserScene,
    GameObjects: {
      Graphics: class {},
      Container: class {},
      Arc: class {},
      Text: class {},
      Rectangle: class {},
    },
    AUTO: "AUTO",
  }

  initDeps({
    LLM_BRIDGE: {
      loadAiLlmPlayerSwitches: () => ({}),
      saveAiLlmPlayerSwitches: () => {},
      methods: {},
    },
    BATTLE_RECORD_BRIDGE: {
      loadBattleRecords: () => [],
      saveBattleRecords: () => [],
      formatRecordTime: () => "",
      methods: {},
    },
    SETTLEMENT_BRIDGE: { methods: {} },
  })

  const mod = await import("../../scripts/game/scene/warehouse-scene")
  WarehouseScene = mod.WarehouseScene

  WarehouseScene.prototype.syncItemManagerFromShop = vi.fn()
  WarehouseScene.prototype.restoreAiMemoryFromStorage = vi.fn()
  WarehouseScene.prototype.resetPlayerHistoryState = vi.fn()

  scene = new WarehouseScene()
})

describe("GameSlice migration - getter/setter delegation to state.game", () => {
  it("completes construction without throwing", () => {
    expect(scene).toBeDefined()
    expect(scene).toBeInstanceOf(WarehouseScene)
  })

  it("has state property with GameState instance and game slice", () => {
    expect(scene.state).toBeDefined()
    expect(scene.state.game).toBeDefined()
  })

  // --- 默认值检查 ---

  it("initializes round to 1 (slice default)", () => {
    expect(scene.round).toBe(1)
    expect(scene.state.game.round).toBe(1)
  })

  it("initializes actionsLeft to _GAME_SETTINGS.actionsPerRound (non-default override)", () => {
    // game-slice 默认是 99，但构造函数覆盖为 _GAME_SETTINGS.actionsPerRound
    expect(scene.actionsLeft).toBe(99)
    expect(scene.state.game.actionsLeft).toBe(99)
  })

  it("initializes roundTimeLeft to _GAME_SETTINGS.roundSeconds (non-default override)", () => {
    expect(scene.roundTimeLeft).toBe(60)
    expect(scene.state.game.roundTimeLeft).toBe(60)
  })

  it("initializes playerMoney to loadPlayerMoney() (non-default override)", () => {
    expect(scene.playerMoney).toBe(3000000)
    expect(scene.state.game.playerMoney).toBe(3000000)
  })

  it("initializes selectedItem to null", () => {
    expect(scene.selectedItem).toBeNull()
    expect(scene.state.game.selectedItem).toBeNull()
  })

  it("initializes currentBid to 0", () => {
    expect(scene.currentBid).toBe(0)
    expect(scene.state.game.currentBid).toBe(0)
  })

  it("initializes bidLeader to 'none'", () => {
    expect(scene.bidLeader).toBe("none")
    expect(scene.state.game.bidLeader).toBe("none")
  })

  it("initializes secondHighestBid to 0", () => {
    expect(scene.secondHighestBid).toBe(0)
    expect(scene.state.game.secondHighestBid).toBe(0)
  })

  it("initializes aiMaxBid to 0", () => {
    expect(scene.aiMaxBid).toBe(0)
    expect(scene.state.game.aiMaxBid).toBe(0)
  })

  it("initializes aiWallets to {}", () => {
    expect(scene.aiWallets).toEqual({})
    expect(scene.state.game.aiWallets).toEqual({})
  })

  it("initializes warehouseTrueValue to 0", () => {
    expect(scene.warehouseTrueValue).toBe(0)
    expect(scene.state.game.warehouseTrueValue).toBe(0)
  })

  it("initializes warehouseCellIndex to {}", () => {
    expect(scene.warehouseCellIndex).toEqual({})
    expect(scene.state.game.warehouseCellIndex).toEqual({})
  })

  it("initializes settled to false", () => {
    expect(scene.settled).toBe(false)
    expect(scene.state.game.settled).toBe(false)
  })

  it("initializes previewOpenTick to 0", () => {
    expect(scene.previewOpenTick).toBe(0)
    expect(scene.state.game.previewOpenTick).toBe(0)
  })

  it("initializes roundTimerId to null", () => {
    expect(scene.roundTimerId).toBeNull()
    expect(scene.state.game.roundTimerId).toBeNull()
  })

  it("initializes roundPaused to false", () => {
    expect(scene.roundPaused).toBe(false)
    expect(scene.state.game.roundPaused).toBe(false)
  })

  it("initializes roundResolving to false", () => {
    expect(scene.roundResolving).toBe(false)
    expect(scene.state.game.roundResolving).toBe(false)
  })

  it("initializes playerBidSubmitted to false", () => {
    expect(scene.playerBidSubmitted).toBe(false)
    expect(scene.state.game.playerBidSubmitted).toBe(false)
  })

  it("initializes playerRoundBid to 0", () => {
    expect(scene.playerRoundBid).toBe(0)
    expect(scene.state.game.playerRoundBid).toBe(0)
  })

  it("initializes isSettlementRevealMode to false", () => {
    expect(scene.isSettlementRevealMode).toBe(false)
    expect(scene.state.game.isSettlementRevealMode).toBe(false)
  })

  it("initializes settlementRevealRunning to false", () => {
    expect(scene.settlementRevealRunning).toBe(false)
    expect(scene.state.game.settlementRevealRunning).toBe(false)
  })

  it("initializes settlementRevealSkipRequested to false", () => {
    expect(scene.settlementRevealSkipRequested).toBe(false)
    expect(scene.state.game.settlementRevealSkipRequested).toBe(false)
  })

  it("initializes settlementSession to null", () => {
    expect(scene.settlementSession).toBeNull()
    expect(scene.state.game.settlementSession).toBeNull()
  })

  it("initializes settlementRunToken to 0", () => {
    expect(scene.settlementRunToken).toBe(0)
    expect(scene.state.game.settlementRunToken).toBe(0)
  })

  it("initializes moneySettledRunToken to null", () => {
    expect(scene.moneySettledRunToken).toBeNull()
    expect(scene.state.game.moneySettledRunToken).toBeNull()
  })

  it("initializes _edgeFlashActive to false", () => {
    expect(scene._edgeFlashActive).toBe(false)
    expect(scene.state.game._edgeFlashActive).toBe(false)
  })

  it("initializes _lastDisplayedMoney to null", () => {
    expect(scene._lastDisplayedMoney).toBeNull()
    expect(scene.state.game._lastDisplayedMoney).toBeNull()
  })

  it("initializes players with 4 default players", () => {
    expect(scene.players).toHaveLength(4)
    expect(scene.state.game.players).toHaveLength(4)
    expect(scene.players[0].id).toBe("p1")
    expect(scene.players[1].id).toBe("p2")
    expect(scene.players[2].id).toBe("p3")
    expect(scene.players[3].id).toBe("p4")
  })

  it("initializes playerRoundHistory to {}", () => {
    expect(scene.playerRoundHistory).toEqual({})
    expect(scene.state.game.playerRoundHistory).toEqual({})
  })

  it("initializes playerUsageHistory to {}", () => {
    expect(scene.playerUsageHistory).toEqual({})
    expect(scene.state.game.playerUsageHistory).toEqual({})
  })

  it("initializes currentRoundUsage to {}", () => {
    expect(scene.currentRoundUsage).toEqual({})
    expect(scene.state.game.currentRoundUsage).toEqual({})
  })

  it("initializes playerHistoryPanels to {}", () => {
    expect(scene.playerHistoryPanels).toEqual({})
    expect(scene.state.game.playerHistoryPanels).toEqual({})
  })

  it("initializes roundBidReadyState to {}", () => {
    expect(scene.roundBidReadyState).toEqual({})
    expect(scene.state.game.roundBidReadyState).toEqual({})
  })

  it("initializes aiRoundDecisionPromise to null", () => {
    expect(scene.aiRoundDecisionPromise).toBeNull()
    expect(scene.state.game.aiRoundDecisionPromise).toBeNull()
  })

  it("initializes currentPublicEvent to null", () => {
    expect(scene.currentPublicEvent).toBeNull()
    expect(scene.state.game.currentPublicEvent).toBeNull()
  })

  it("initializes keypadValue to '0'", () => {
    expect(scene.keypadValue).toBe("0")
    expect(scene.state.game.keypadValue).toBe("0")
  })

  it("initializes _activeSkillId to null", () => {
    expect(scene._activeSkillId).toBeNull()
    expect(scene.state.game._activeSkillId).toBeNull()
  })

  it("initializes _gameConfirmCallback to null", () => {
    expect(scene._gameConfirmCallback).toBeNull()
    expect(scene.state.game._gameConfirmCallback).toBeNull()
  })

  it("initializes _gameCancelCallback to null", () => {
    expect(scene._gameCancelCallback).toBeNull()
    expect(scene.state.game._gameCancelCallback).toBeNull()
  })

  it("initializes runSerial to 0", () => {
    expect(scene.runSerial).toBe(0)
    expect(scene.state.game.runSerial).toBe(0)
  })

  it("initializes runLogHistory to []", () => {
    expect(scene.runLogHistory).toEqual([])
    expect(scene.state.game.runLogHistory).toEqual([])
  })

  it("initializes currentRunLog to null", () => {
    expect(scene.currentRunLog).toBeNull()
    expect(scene.state.game.currentRunLog).toBeNull()
  })

  it("initializes _pauseSnapshotTimeLeft to null", () => {
    expect(scene._pauseSnapshotTimeLeft).toBeNull()
    expect(scene.state.game._pauseSnapshotTimeLeft).toBeNull()
  })

  // --- Setter 委托检查 ---

  it("delegates setter to state.game: scene.round = 5 -> state.game.round === 5", () => {
    scene.round = 5
    expect(scene.state.game.round).toBe(5)
    expect(scene.round).toBe(5)
    scene.round = 1 // restore
  })

  it("delegates setter to state.game: scene.currentBid = 500 -> state.game.currentBid === 500", () => {
    scene.currentBid = 500
    expect(scene.state.game.currentBid).toBe(500)
    expect(scene.currentBid).toBe(500)
    scene.currentBid = 0
  })

  it("delegates setter to state.game: scene.settled = true -> state.game.settled === true", () => {
    scene.settled = true
    expect(scene.state.game.settled).toBe(true)
    expect(scene.settled).toBe(true)
    scene.settled = false
  })

  it("delegates setter to state.game: scene.players = [...]", () => {
    const testPlayers = [
      { id: "t1", name: "Test", avatar: "T", isHuman: true, isAI: false, isSelf: false }
    ]
    scene.players = testPlayers
    expect(scene.state.game.players).toBe(testPlayers)
    expect(scene.players).toHaveLength(1)
    // restore
    scene.players = [
      { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
    ]
  })

  it("delegates setter to state.game: scene.keypadValue = '123' -> state.game.keypadValue === '123'", () => {
    scene.keypadValue = "123"
    expect(scene.state.game.keypadValue).toBe("123")
    expect(scene.keypadValue).toBe("123")
    scene.keypadValue = "0"
  })

  // --- Getter 委托检查 ---

  it("delegates getter from state.game: state.game.round = 3 -> scene.round === 3", () => {
    scene.state.game.round = 3
    expect(scene.round).toBe(3)
    scene.state.game.round = 1
  })

  it("delegates getter from state.game: state.game.bidLeader = 'p1' -> scene.bidLeader === 'p1'", () => {
    scene.state.game.bidLeader = "p1"
    expect(scene.bidLeader).toBe("p1")
    scene.state.game.bidLeader = "none"
  })

  it("delegates getter from state.game: state.game.playerMoney = 5000000 -> scene.playerMoney === 5000000", () => {
    scene.state.game.playerMoney = 5000000
    expect(scene.playerMoney).toBe(5000000)
    scene.state.game.playerMoney = 3000000
  })

  it("delegates getter from state.game: state.game.actionsLeft = 42 -> scene.actionsLeft === 42", () => {
    scene.state.game.actionsLeft = 42
    expect(scene.actionsLeft).toBe(42)
    scene.state.game.actionsLeft = 99
  })

  // --- resetForNewRun 后 game 属性重置 ---

  it("resetForNewRun resets all game properties on scene", () => {
    // 修改一些值
    scene.round = 5
    scene.currentBid = 999
    scene.bidLeader = "p1"
    scene.settled = true
    scene.playerMoney = 500000
    scene.actionsLeft = 10
    scene.keypadValue = "999"
    scene.runSerial = 42

    scene.state.resetForNewRun()

    // 验证重置
    expect(scene.round).toBe(1)
    expect(scene.currentBid).toBe(0)
    expect(scene.bidLeader).toBe("none")
    expect(scene.settled).toBe(false)
    expect(scene.playerMoney).toBe(500000) // 保留：持久化跨局资金
    expect(scene.actionsLeft).toBe(99)
    expect(scene.keypadValue).toBe("0")
    expect(scene.runSerial).toBe(0)
    expect(scene.selectedItem).toBeNull()
    expect(scene.warehouseTrueValue).toBe(0)
    expect(scene.aiWallets).toEqual({})
    expect(scene.players).toHaveLength(4)
  })

  // --- resetForNewRound 后只重回合字段，playerMoney/players 不变 ---

  it("resetForNewRound resets round-specific fields but preserves playerMoney and players", () => {
    // 设置一些值
    scene.playerMoney = 2500000
    scene.currentBid = 500
    scene.bidLeader = "p2"
    scene.secondHighestBid = 300
    scene.playerBidSubmitted = true
    scene.playerRoundBid = 500
    scene.keypadValue = "500"
    scene.roundResolving = true

    scene.state.resetForNewRound()

    // 回合字段应重置
    expect(scene.currentBid).toBe(0)
    expect(scene.bidLeader).toBe("none")
    expect(scene.secondHighestBid).toBe(0)
    expect(scene.playerBidSubmitted).toBe(false)
    expect(scene.playerRoundBid).toBe(0)
    expect(scene.keypadValue).toBe("0")
    expect(scene.roundResolving).toBe(false)

    // 持久字段应保留
    expect(scene.playerMoney).toBe(2500000)
    expect(scene.players).toHaveLength(4)
    expect(scene.players[1].id).toBe("p2")
  })

  // --- 所有 Manager 实例化正常 ---

  it("instantiates all Phase 2 Managers (regression: constructor works)", () => {
    expect(scene.walletManager).toBeTruthy()
    expect(scene.historyManager).toBeTruthy()
    expect(scene.aiDecisionManager).toBeTruthy()
    expect(scene.skillItemManager).toBeTruthy()
    expect(scene.panelsManager).toBeTruthy()
    expect(scene.carouselManager).toBeTruthy()
    expect(scene.aiMemoryManager).toBeTruthy()
    expect(scene.aiReflectionManager).toBeTruthy()
    expect(scene.settlementManager).toBeTruthy()
    expect(scene.characterSelectManager).toBeTruthy()
    expect(scene.warehouseManager).toBeTruthy()
    expect(scene.aiIntelManager).toBeTruthy()
    expect(scene.uiOverlayManager).toBeTruthy()
    expect(scene.lobbyIndexManager).toBeTruthy()
    expect(scene.roundManager).toBeTruthy()
    expect(scene.biddingManager).toBeTruthy()
    expect(scene.lanIndexManager).toBeTruthy()
  })
})