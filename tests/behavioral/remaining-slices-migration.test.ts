/**
 * @file tests/behavioral/remaining-slices-migration.test.ts
 * @description 验证 ai/warehouse/record/ui 4 个 slice 的场景属性已迁移为 getter/setter 委托到 state
 * 参考 game-slice-migration.test.ts 和 lan-slice-migration.test.ts 风格
 */

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

describe("Remaining slices migration - getter/setter delegation to state.ai/state.warehouse/state.record/state.ui", () => {
  // ===== 构造 =====

  it("completes construction without throwing", () => {
    expect(scene).toBeDefined()
    expect(scene).toBeInstanceOf(WarehouseScene)
  })

  it("has state property with all 4 slices defined", () => {
    expect(scene.state).toBeDefined()
    expect(scene.state.ai).toBeDefined()
    expect(scene.state.warehouse).toBeDefined()
    expect(scene.state.record).toBeDefined()
    expect(scene.state.ui).toBeDefined()
  })

  // ===== aiSlice 默认值检查 =====

  it("initializes aiPrivateIntel to {} (slice default)", () => {
    expect(scene.aiPrivateIntel).toEqual({})
    expect(scene.state.ai.aiPrivateIntel).toEqual({})
  })

  it("initializes aiResourceState to {} (slice default)", () => {
    expect(scene.aiResourceState).toEqual({})
    expect(scene.state.ai.aiResourceState).toEqual({})
  })

  it("initializes aiRoundEffects to {} (slice default)", () => {
    expect(scene.aiRoundEffects).toEqual({})
    expect(scene.state.ai.aiRoundEffects).toEqual({})
  })

  it("initializes lastAiIntelActions to [] (slice default)", () => {
    expect(scene.lastAiIntelActions).toEqual([])
    expect(scene.state.ai.lastAiIntelActions).toEqual([])
  })

  it("initializes aiLlmRoundPlans to {} (slice default)", () => {
    expect(scene.aiLlmRoundPlans).toEqual({})
    expect(scene.state.ai.aiLlmRoundPlans).toEqual({})
  })

  it("initializes aiLlmPlayerEnabled to {} (slice default, non-default override via bridge returns {})", () => {
    // aiLlmPlayerEnabled 是非默认初始值（从 bridge 加载），但测试中 bridge 返回 {}
    expect(scene.aiLlmPlayerEnabled).toEqual({})
    expect(scene.state.ai.aiLlmPlayerEnabled).toEqual({})
  })

  it("initializes aiFoldState to {} (slice default)", () => {
    expect(scene.aiFoldState).toEqual({})
    expect(scene.state.ai.aiFoldState).toEqual({})
  })

  it("initializes lastAiDecisionTelemetry to null (slice default)", () => {
    expect(scene.lastAiDecisionTelemetry).toBeNull()
    expect(scene.state.ai.lastAiDecisionTelemetry).toBeNull()
  })

  it("initializes llmEverUsedThisRun to false (slice default)", () => {
    expect(scene.llmEverUsedThisRun).toBe(false)
    expect(scene.state.ai.llmEverUsedThisRun).toBe(false)
  })

  it("initializes aiReflectionState to 'idle' (slice default)", () => {
    expect(scene.aiReflectionState).toBe("idle")
    expect(scene.state.ai.aiReflectionState).toBe("idle")
  })

  it("initializes aiReflectionTotal to 0 (slice default)", () => {
    expect(scene.aiReflectionTotal).toBe(0)
    expect(scene.state.ai.aiReflectionTotal).toBe(0)
  })

  it("initializes aiReflectionCompleted to 0 (slice default)", () => {
    expect(scene.aiReflectionCompleted).toBe(0)
    expect(scene.state.ai.aiReflectionCompleted).toBe(0)
  })

  it("initializes aiReflectionStateDetail to '' (slice default)", () => {
    expect(scene.aiReflectionStateDetail).toBe("")
    expect(scene.state.ai.aiReflectionStateDetail).toBe("")
  })

  it("initializes _reflectionBeforeUnload to null (slice default)", () => {
    expect(scene._reflectionBeforeUnload).toBeNull()
    expect(scene.state.ai._reflectionBeforeUnload).toBeNull()
  })

  it("initializes aiConversationByPlayer to {} (slice default)", () => {
    expect(scene.aiConversationByPlayer).toEqual({})
    expect(scene.state.ai.aiConversationByPlayer).toEqual({})
  })

  it("initializes aiCrossGameMemory to {} (slice default)", () => {
    expect(scene.aiCrossGameMemory).toEqual({})
    expect(scene.state.ai.aiCrossGameMemory).toEqual({})
  })

  it("initializes aiCrossGameMessagesByPlayer to {} (slice default)", () => {
    expect(scene.aiCrossGameMessagesByPlayer).toEqual({})
    expect(scene.state.ai.aiCrossGameMessagesByPlayer).toEqual({})
  })

  it("initializes aiReflectionPending to {} (slice default)", () => {
    expect(scene.aiReflectionPending).toEqual({})
    expect(scene.state.ai.aiReflectionPending).toEqual({})
  })

  it("initializes aiConversationCache to {} (slice default)", () => {
    expect(scene.aiConversationCache).toEqual({})
    expect(scene.state.ai.aiConversationCache).toEqual({})
  })

  // ===== warehouseSlice 默认值检查 =====

  it("initializes items to [] (slice default)", () => {
    expect(scene.items).toEqual([])
    expect(scene.state.warehouse.items).toEqual([])
  })

  it("initializes revealedCells to [] (slice default)", () => {
    expect(scene.revealedCells).toEqual([])
    expect(scene.state.warehouse.revealedCells).toEqual([])
  })

  it("initializes deepSeekTesting to false (slice default)", () => {
    expect(scene.deepSeekTesting).toBe(false)
    expect(scene.state.warehouse.deepSeekTesting).toBe(false)
  })

  // ===== recordSlice 默认值检查 =====

  it("initializes highValuePriceThreshold to null (slice default)", () => {
    expect(scene.highValuePriceThreshold).toBeNull()
    expect(scene.state.record.highValuePriceThreshold).toBeNull()
  })

  it("initializes battleRecords to [] (slice default, non-default override via bridge returns [])", () => {
    // battleRecords 是非默认初始值（从 bridge 加载），但测试中 bridge 返回 []
    expect(scene.battleRecords).toEqual([])
    expect(scene.state.record.battleRecords).toEqual([])
  })

  it("initializes battleRecordReplayActive to false (slice default)", () => {
    expect(scene.battleRecordReplayActive).toBe(false)
    expect(scene.state.record.battleRecordReplayActive).toBe(false)
  })

  it("initializes battleRecordReplayRecordId to null (slice default)", () => {
    expect(scene.battleRecordReplayRecordId).toBeNull()
    expect(scene.state.record.battleRecordReplayRecordId).toBeNull()
  })

  it("initializes battleRecordLogView to null (slice default)", () => {
    expect(scene.battleRecordLogView).toBeNull()
    expect(scene.state.record.battleRecordLogView).toBeNull()
  })

  it("initializes pendingNextRunAiSummaryByPlayer to {} (slice default)", () => {
    expect(scene.pendingNextRunAiSummaryByPlayer).toEqual({})
    expect(scene.state.record.pendingNextRunAiSummaryByPlayer).toEqual({})
  })

  it("initializes pendingSettlementSummary to '' (slice default)", () => {
    expect(scene.pendingSettlementSummary).toBe("")
    expect(scene.state.record.pendingSettlementSummary).toBe("")
  })

  it("initializes privateIntelEntries to [] (slice default)", () => {
    expect(scene.privateIntelEntries).toEqual([])
    expect(scene.state.record.privateIntelEntries).toEqual([])
  })

  it("initializes publicInfoEntries to [] (slice default)", () => {
    expect(scene.publicInfoEntries).toEqual([])
    expect(scene.state.record.publicInfoEntries).toEqual([])
  })

  // ===== uiSlice 默认值检查 =====

  it("initializes dom to a non-empty object (non-default: constructor fills with keys)", () => {
    // dom 的 slice 默认值是 {}，但构造函数覆盖为含所有键的大对象
    expect(scene.dom).toBeDefined()
    expect(typeof scene.dom).toBe("object")
    // getter 返回 state.ui.dom 的同一引用
    expect(scene.dom).toBe(scene.state.ui.dom)
    expect(scene.dom).toHaveProperty("hudRound")
    expect(scene.dom).toHaveProperty("hudTimer")
    expect(scene.dom).toHaveProperty("hudMoney")
    expect(scene.dom).toHaveProperty("gameRoot")
    // 验证通过 getter 返回的是 state.ui.dom 的引用
    expect(scene.dom).toBe(scene.state.ui.dom)
  })

  it("initializes _hudRoundText to null (slice default)", () => {
    expect(scene._hudRoundText).toBeNull()
    expect(scene.state.ui._hudRoundText).toBeNull()
  })

  it("initializes _hudTimerText to null (slice default)", () => {
    expect(scene._hudTimerText).toBeNull()
    expect(scene.state.ui._hudTimerText).toBeNull()
  })

  it("initializes _hudMoneyText to null (slice default)", () => {
    expect(scene._hudMoneyText).toBeNull()
    expect(scene.state.ui._hudMoneyText).toBeNull()
  })

  it("initializes _timerSpan to null (slice default)", () => {
    expect(scene._timerSpan).toBeNull()
    expect(scene.state.ui._timerSpan).toBeNull()
  })

  // ===== setter 委托检查 =====

  it("delegates setter to state.ai: aiPrivateIntel", () => {
    scene.aiPrivateIntel = { p1: { name: "test", tags: [] } }
    expect(scene.state.ai.aiPrivateIntel).toEqual({ p1: { name: "test", tags: [] } })
    expect(scene.aiPrivateIntel).toEqual({ p1: { name: "test", tags: [] } })
    scene.aiPrivateIntel = {}
  })

  it("delegates setter to state.ai: aiLlmRoundPlans", () => {
    scene.aiLlmRoundPlans = { p1: null }
    expect(scene.state.ai.aiLlmRoundPlans).toEqual({ p1: null })
    expect(scene.aiLlmRoundPlans).toEqual({ p1: null })
    scene.aiLlmRoundPlans = {}
  })

  it("delegates setter to state.ai: aiReflectionState", () => {
    scene.aiReflectionState = "completed"
    expect(scene.state.ai.aiReflectionState).toBe("completed")
    expect(scene.aiReflectionState).toBe("completed")
    scene.aiReflectionState = "idle"
  })

  it("delegates setter to state.warehouse: items", () => {
    const testItems: any[] = [{ id: "test1", name: "Test" }]
    scene.items = testItems
    expect(scene.state.warehouse.items).toBe(testItems)
    expect(scene.items).toHaveLength(1)
    scene.items = []
  })

  it("delegates setter to state.warehouse: deepSeekTesting", () => {
    scene.deepSeekTesting = true
    expect(scene.state.warehouse.deepSeekTesting).toBe(true)
    expect(scene.deepSeekTesting).toBe(true)
    scene.deepSeekTesting = false
  })

  it("delegates setter to state.record: highValuePriceThreshold", () => {
    scene.highValuePriceThreshold = 5000
    expect(scene.state.record.highValuePriceThreshold).toBe(5000)
    expect(scene.highValuePriceThreshold).toBe(5000)
    scene.highValuePriceThreshold = null
  })

  it("delegates setter to state.record: battleRecordReplayActive", () => {
    scene.battleRecordReplayActive = true
    expect(scene.state.record.battleRecordReplayActive).toBe(true)
    expect(scene.battleRecordReplayActive).toBe(true)
    scene.battleRecordReplayActive = false
  })

  it("delegates setter to state.record: privateIntelEntries", () => {
    const entries = [{ source: "test", text: "info", round: 1 }]
    scene.privateIntelEntries = entries
    expect(scene.state.record.privateIntelEntries).toBe(entries)
    expect(scene.privateIntelEntries).toHaveLength(1)
    scene.privateIntelEntries = []
  })

  it("delegates setter to state.ui: _hudRoundText", () => {
    const el = document.createElement("div")
    scene._hudRoundText = el
    expect(scene.state.ui._hudRoundText).toBe(el)
    expect(scene._hudRoundText).toBe(el)
    scene._hudRoundText = null
  })

  it("delegates setter to state.ui: _timerSpan", () => {
    const el = document.createElement("span")
    scene._timerSpan = el
    expect(scene.state.ui._timerSpan).toBe(el)
    expect(scene._timerSpan).toBe(el)
    scene._timerSpan = null
  })

  // ===== getter 委托检查 =====

  it("delegates getter from state.ai: state.ai.llmEverUsedThisRun = true -> scene.llmEverUsedThisRun === true", () => {
    scene.state.ai.llmEverUsedThisRun = true
    expect(scene.llmEverUsedThisRun).toBe(true)
    scene.state.ai.llmEverUsedThisRun = false
  })

  it("delegates getter from state.warehouse: state.warehouse.revealedCells = [1] -> scene.revealedCells === [1]", () => {
    scene.state.warehouse.revealedCells = [1]
    expect(scene.revealedCells).toEqual([1])
    scene.state.warehouse.revealedCells = []
  })

  it("delegates getter from state.record: state.record.battleRecordLogView = {recordId:'x', page:1} -> scene.battleRecordLogView matches", () => {
    scene.state.record.battleRecordLogView = { recordId: "x", page: 1 }
    expect(scene.battleRecordLogView).toEqual({ recordId: "x", page: 1 })
    scene.state.record.battleRecordLogView = null
  })

  it("delegates getter from state.ui: state.ui._hudMoneyText = el -> scene._hudMoneyText === el", () => {
    const el = document.createElement("div")
    scene.state.ui._hudMoneyText = el
    expect(scene._hudMoneyText).toBe(el)
    scene.state.ui._hudMoneyText = null
  })

  // ===== reset 后属性重置 =====

  it("resetForNewRun resets aiSlice properties on scene", () => {
    // 修改一些值
    scene.aiReflectionState = "running"
    scene.aiReflectionTotal = 10
    scene.llmEverUsedThisRun = true
    scene.aiLlmRoundPlans = { p1: null }
    scene.aiRoundEffects = { p1: { buff: "test" } }

    scene.state.resetForNewRun()

    // 验证重置
    expect(scene.aiReflectionState).toBe("idle")
    expect(scene.aiReflectionTotal).toBe(0)
    expect(scene.llmEverUsedThisRun).toBe(false)
    expect(scene.aiLlmRoundPlans).toEqual({})
    expect(scene.aiRoundEffects).toEqual({})
    expect(scene.aiPrivateIntel).toEqual({})
    expect(scene.lastAiIntelActions).toEqual([])
    expect(scene.aiResourceState).toEqual({})
    expect(scene.aiFoldState).toEqual({})
    expect(scene.lastAiDecisionTelemetry).toBeNull()
    expect(scene.aiReflectionCompleted).toBe(0)
    expect(scene.aiReflectionStateDetail).toBe("")
    expect(scene._reflectionBeforeUnload).toBeNull()
    expect(scene.aiConversationByPlayer).toEqual({})
    expect(scene.aiCrossGameMemory).toEqual({})
    expect(scene.aiCrossGameMessagesByPlayer).toEqual({})
    expect(scene.aiReflectionPending).toEqual({})
    expect(scene.aiConversationCache).toEqual({})
  })

  it("resetForNewRun resets warehouseSlice properties on scene", () => {
    scene.items = [{ id: "keep", name: "Test" }] as any
    scene.revealedCells = [true] as any
    scene.deepSeekTesting = true

    scene.state.resetForNewRun()

    expect(scene.items).toEqual([])
    expect(scene.revealedCells).toEqual([])
    expect(scene.deepSeekTesting).toBe(false)
  })

  it("resetForNewRun resets recordSlice properties on scene", () => {
    scene.highValuePriceThreshold = 1000
    scene.battleRecords = [{ id: "rec1" }]
    scene.pendingNextRunAiSummaryByPlayer = { p1: "summary" }
    scene.privateIntelEntries = [{ source: "s", text: "t", round: 1 }]

    scene.state.resetForNewRun()

    expect(scene.highValuePriceThreshold).toBeNull()
    expect(scene.battleRecords).toEqual([{ id: "rec1" }]) // 保留：持久化战绩
    expect(scene.pendingNextRunAiSummaryByPlayer).toEqual({ p1: "summary" }) // 保留：跨局摘要
    expect(scene.privateIntelEntries).toEqual([])
    expect(scene.publicInfoEntries).toEqual([])
    expect(scene.pendingSettlementSummary).toBe("")
    expect(scene.battleRecordReplayActive).toBe(false)
    expect(scene.battleRecordReplayRecordId).toBeNull()
    expect(scene.battleRecordLogView).toBeNull()
  })

  // ===== dom getter 委托 + mutate 可用 =====

  it("dom getter returns reference to state.ui.dom, mutation works", () => {
    // 验证 getter 返回的是 state.ui.dom 的同一引用
    expect(scene.dom).toBe(scene.state.ui.dom)

    // 模拟 cacheDom 行为：this.dom.xxx = el
    const el = document.createElement("div")
    scene.dom.hudRound = el
    expect(scene.state.ui.dom.hudRound).toBe(el)
    expect(scene.dom.hudRound).toBe(el)

    // 再验证给整个 dom 赋值
    const newDom = { testKey: document.createElement("span") }
    scene.dom = newDom as any
    expect(scene.state.ui.dom).toBe(newDom)
    // 恢复
    scene.dom = {}
  })

  // ===== 所有 Manager 实例化正常 =====

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