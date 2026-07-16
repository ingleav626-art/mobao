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

describe("LanSlice migration - getter/setter delegation to state.lan", () => {
  it("completes construction without throwing", () => {
    expect(scene).toBeDefined()
    expect(scene).toBeInstanceOf(WarehouseScene)
  })

  it("has state property with GameState instance", () => {
    expect(scene.state).toBeDefined()
    expect(scene.state.lan).toBeDefined()
  })

  it("initializes isLanMode to false (slice default)", () => {
    expect(scene.isLanMode).toBe(false)
    expect(scene.state.lan.isLanMode).toBe(false)
  })

  it("initializes lanMySlotId to p2 (single-player default)", () => {
    expect(scene.lanMySlotId).toBe("p2")
    expect(scene.state.lan.lanMySlotId).toBe("p2")
  })

  it("delegates setter to state.lan: isLanMode", () => {
    scene.isLanMode = true
    expect(scene.state.lan.isLanMode).toBe(true)
    expect(scene.isLanMode).toBe(true)
    scene.isLanMode = false
  })

  it("delegates setter to state.lan: lanPlayers", () => {
    const testPlayers = [
      { id: "lan1", name: "Test", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]
    scene.state.lan.lanPlayers = testPlayers
    expect(scene.lanPlayers).toBe(testPlayers)
    expect(scene.lanPlayers).toHaveLength(1)
    expect(scene.lanPlayers[0].id).toBe("lan1")
  })

  it("delegates setter to state.lan: lanHostBids", () => {
    scene.state.lan.lanHostBids = { p1: 100 }
    expect(scene.lanHostBids).toEqual({ p1: 100 })
  })

  it("delegates setter to state.lan: lanBridge", () => {
    const bridge = { someMethod: () => "ok" }
    scene.lanBridge = bridge
    expect(scene.state.lan.lanBridge).toBe(bridge)
    scene.lanBridge = null
  })

  it("resetLanState resets all LAN properties on scene", () => {
    scene.isLanMode = true
    scene.state.lan.lanPlayers = [
      { id: "x", name: "X", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]
    scene.lanMySlotId = "p3"

    scene.state.resetLanState()

    expect(scene.isLanMode).toBe(false)
    expect(scene.lanPlayers).toEqual([])
    expect(scene.lanMySlotId).toBe(null)
    expect(scene.lanBridge).toBe(null)
    expect(scene.lanIsHost).toBe(false)
    expect(scene.lanIdToSlotId).toEqual({})
    expect(scene.slotIdToLanId).toEqual({})
    expect(scene.lanHostWallets).toEqual({})
    expect(scene.lanHostBids).toEqual({})
    expect(scene.lanReconnecting).toBe(false)
    expect(scene.lanReconnectAttempts).toBe(0)
    expect(scene.lanMaxReconnectAttempts).toBe(5)
    expect(scene.lanLastServerUrl).toBe(null)
    expect(scene.lanLastRoomCode).toBe(null)
    expect(scene.lanLastPlayerId).toBe(null)
    expect(scene.lanAiPlayers).toEqual([])
    expect(scene.lanAiLlmEnabled).toBe(false)
  })

  it("lanMySlotId accepts string | null", () => {
    scene.lanMySlotId = "p1"
    expect(scene.lanMySlotId).toBe("p1")
    expect(scene.state.lan.lanMySlotId).toBe("p1")

    scene.lanMySlotId = null
    expect(scene.lanMySlotId).toBe(null)
    expect(scene.state.lan.lanMySlotId).toBe(null)

    scene.lanMySlotId = "p2"
  })

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