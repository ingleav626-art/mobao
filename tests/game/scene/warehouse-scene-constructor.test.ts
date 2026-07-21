import { describe, it, expect, beforeAll, vi } from "vitest"
import { initDeps, Deps } from "../../../scripts/game/core/deps"
import { AiMemoryManager } from "../../../scripts/game/ai/memory-manager"

let WarehouseScene: any
let scene: any

const restoreCallSnapshots: Array<{ aiMemoryManager: unknown }> = []
const resetHistoryCallSnapshots: Array<{ historyManager: unknown }> = []

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

  const mod = await import("../../../scripts/game/scene/warehouse-scene")
  WarehouseScene = mod.WarehouseScene

  const syncItemSpy = vi.fn()
  const restoreSpy = vi.fn(function (this: any) {
    restoreCallSnapshots.push({ aiMemoryManager: this })
  })
  const resetHistorySpy = vi.fn(function (this: any) {
    resetHistoryCallSnapshots.push({ historyManager: this.historyManager })
  })
  WarehouseScene.prototype.syncItemManagerFromShop = syncItemSpy
  vi.spyOn(AiMemoryManager.prototype, "restoreAiMemoryFromStorage").mockImplementation(restoreSpy)
  WarehouseScene.prototype.resetPlayerHistoryState = resetHistorySpy

  scene = new WarehouseScene()
})

describe("WarehouseScene constructor (smoke integration test)", () => {
  it("completes construction without throwing TypeError", () => {
    expect(scene).toBeDefined()
    expect(scene).toBeInstanceOf(WarehouseScene)
  })

  it("instantiates all 10 Phase 2 Managers", () => {
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
  })

  it("calls restoreAiMemoryFromStorage after aiMemoryManager is created (regression: L449 bug)", () => {
    expect(restoreCallSnapshots).toHaveLength(1)
    expect(restoreCallSnapshots[0].aiMemoryManager).toBeTruthy()
  })

  it("calls resetPlayerHistoryState after historyManager is created", () => {
    expect(resetHistoryCallSnapshots).toHaveLength(1)
    expect(resetHistoryCallSnapshots[0].historyManager).toBeTruthy()
  })

  it("has Deps bridges initialized before construction", () => {
    expect(Deps.LLM_BRIDGE).toBeTruthy()
    expect(Deps.BATTLE_RECORD_BRIDGE).toBeTruthy()
    expect(Deps.SETTLEMENT_BRIDGE).toBeTruthy()
  })

  it("uses LLM_BRIDGE and BATTLE_RECORD_BRIDGE during construction", () => {
    expect(scene.aiLlmPlayerEnabled).toEqual({})
    expect(Array.isArray(scene.battleRecords)).toBe(true)
    expect(scene.battleRecords).toEqual([])
  })

  it("initializes basic scene state from constructor", () => {
    expect(scene.players).toHaveLength(4)
    expect(scene.round).toBe(1)
    expect(scene.items).toEqual([])
    expect(scene.dom).toBeDefined()
    expect(scene.keypadValue).toBe("0")
    expect(scene.isLanMode).toBe(false)
  })

  it("does not call Phaser lifecycle methods during construction", () => {
    expect(scene.sys.events.on).not.toHaveBeenCalled()
  })
})
