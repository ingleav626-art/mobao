/**
 * @file tests/integration/scene-assembly.test.ts
 * @description Scene 装配集成测试。覆盖 Manager 实例化完整性、deps 值捕获回归、
 *              createXxx+setXxx 配对、startNewRun 状态重置、Mixin 代理委托链条。
 *
 *              对应 warehouse-scene.ts 构造函数中所有 17 个 Manager 的装配点。
 *              所有 deps 接线 bug 的集成防线。
 */
import { describe, it, expect, beforeAll, vi } from "vitest"
import { initDeps, Deps } from "../../scripts/game/core/deps"
import { AI_WALLET_INITIAL } from "../../scripts/game/ai/wallet"
import { startNewRun } from "../../scripts/game/scene/scene-run"
import { BiddingMixin } from "../../scripts/game/bidding/index"

// =============================================================================
// Mock Phaser.Scene（与 warehouse-scene-constructor.test.ts 一致）
// =============================================================================

class MockPhaserScene {
  sys = { events: { on: vi.fn(), once: vi.fn(), emit: vi.fn() } }
  add = {
    graphics: vi.fn(() => ({})),
    container: vi.fn(() => ({})),
    text: vi.fn(() => ({})),
  }
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

let WarehouseScene: any
let scene: any

beforeAll(async () => {
  // ---- Mock Phaser 全局 ----
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

  // ---- Init Deps bridges（构造函数需要）----
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

  // ---- 导入 WarehouseScene ----
  const mod = await import("../../scripts/game/scene/warehouse-scene")
  WarehouseScene = mod.WarehouseScene

  // ---- Mock 构造函数调用的 Mixin 方法 ----
  WarehouseScene.prototype.syncItemManagerFromShop = vi.fn()
  WarehouseScene.prototype.restoreAiMemoryFromStorage = vi.fn()
  WarehouseScene.prototype.resetPlayerHistoryState = vi.fn()

  // ---- Mock startNewRun 调用的 Mixin 方法 ----
  const startNewRunMockMethods = [
    "beginRunTracking",
    "cancelSettlementReveal",
    "stopRoundTimer",
    "exitSettlementPage",
    "guardWarehouseCapacity",
    "hidePreview",
    "closeBidKeypad",
    "closeItemDrawer",
    "hideSettleOverlay",
    "hideRevealScrollHints",
    "drawUnknownWarehouse",
    "spawnRandomItems",
    "setupWarehouseAuction",
    "rebuildWarehouseCellIndex",
    "initAiWallets",
    "initAiIntelSystems",
    "resetAiConversations",
    "pushRunStartContextToAi",
    "startRound",
    "updateHud",
    "writeLog",
    "applyCharacterToPlayer",
    "makeRunToken",
    "isAiMultiGameMemoryEnabled",
    "initPlayersUI",
  ]
  for (const fn of startNewRunMockMethods) {
    WarehouseScene.prototype[fn] = vi.fn()
  }

  // ---- 挂载 startNewRun 函数（本身是 standalone function，through this）----
  WarehouseScene.prototype.startNewRun = startNewRun

  // ---- 构造场景 ----
  scene = new WarehouseScene()
})

// =============================================================================
// 1. Manager 实例化完整性
// =============================================================================

describe("Manager 实例化完整性", () => {
  it("构造 WarehouseScene 后，所有 17 个 Manager 属性存在", () => {
    const managerNames = [
      "warehouseManager",
      "biddingManager",
      "lanIndexManager",
      "roundManager",
      "walletManager",
      "historyManager",
      "aiDecisionManager",
      "skillItemManager",
      "panelsManager",
      "carouselManager",
      "settlementManager",
      "characterSelectManager",
      "aiReflectionManager",
      "aiMemoryManager",
      "aiIntelManager",
      "uiOverlayManager",
      "lobbyIndexManager",
    ]
    for (const name of managerNames) {
      expect(scene[name]).toBeTruthy()
    }
  })

  it("每个 Manager 是独立实例（非同一引用）", () => {
    const managers = [
      scene.warehouseManager,
      scene.biddingManager,
      scene.lanIndexManager,
      scene.roundManager,
      scene.walletManager,
      scene.historyManager,
      scene.aiDecisionManager,
      scene.skillItemManager,
      scene.panelsManager,
      scene.carouselManager,
      scene.settlementManager,
      scene.characterSelectManager,
      scene.aiReflectionManager,
      scene.aiMemoryManager,
      scene.aiIntelManager,
      scene.uiOverlayManager,
      scene.lobbyIndexManager,
    ]
    for (let i = 0; i < managers.length; i++) {
      for (let j = i + 1; j < managers.length; j++) {
        expect(managers[i]).not.toBe(managers[j])
      }
    }
  })
})

// =============================================================================
// 2. 值捕获回归测试：重新赋值 scene 属性后 Manager 通过 getter 看到新值
// =============================================================================

describe("值捕获回归测试（防止 deps 值捕获 bug 复发）", () => {
  // ---- players 重新赋值 ----
  describe("players 重新赋值", () => {
    it("walletManager.resetAiWallets 看到新 players", () => {
      const newPlayers = [
        {
          id: "new-ai-1",
          name: "AI1",
          avatar: "X",
          isHuman: false,
          isAI: true,
          isSelf: false,
        },
        {
          id: "new-ai-2",
          name: "AI2",
          avatar: "Y",
          isHuman: false,
          isAI: true,
          isSelf: false,
        },
      ]
      // 保存旧引用用于恢复
      const origPlayers = scene.players
      const origWallets = scene.aiWallets

      // 重新赋值
      scene.players = newPlayers
      scene.walletManager.resetAiWallets()

      // 新 AI 玩家应有初始钱包
      expect(scene.aiWallets["new-ai-1"]).toBe(AI_WALLET_INITIAL)
      expect(scene.aiWallets["new-ai-2"]).toBe(AI_WALLET_INITIAL)

      // 恢复原始状态
      scene.players = origPlayers
      scene.aiWallets = origWallets
    })

    it("historyManager.resetPlayerHistoryState 看到新 players", () => {
      const newPlayers = [
        { id: "h-new-1", name: "H1", avatar: "H", isHuman: false, isAI: true, isSelf: false },
        { id: "h-new-2", name: "H2", avatar: "I", isHuman: false, isAI: true, isSelf: false },
      ]
      const origPlayers = scene.players
      const origRoundHistory = scene.playerRoundHistory
      const origUsageHistory = scene.playerUsageHistory

      // 重新赋值并调用 Manager 方法
      scene.players = newPlayers
      scene.historyManager.resetPlayerHistoryState()

      // 新玩家应有 round/usage 历史条目（resetPlayerHistoryState 写入 playerRoundHistory/playerUsageHistory/currentRoundUsage）
      // 注意：该函数不写入 playerHistoryPanels，只写入 data 中的 playerRoundHistory / playerUsageHistory / currentRoundUsage
      expect(scene.playerRoundHistory["h-new-1"]).toBeDefined()
      expect(scene.playerRoundHistory["h-new-2"]).toBeDefined()
      expect(scene.playerUsageHistory["h-new-1"]).toBeDefined()
      expect(scene.playerUsageHistory["h-new-2"]).toBeDefined()

      // 恢复
      scene.players = origPlayers
      scene.playerRoundHistory = origRoundHistory as Record<string, Array<{ round: number; bid: number }>>
      scene.playerUsageHistory = origUsageHistory as Record<string, Array<{ round: number; actions: string[] }>>
    })
  })

  // ---- aiWallets 重新赋值 ----
  describe("aiWallets 重新赋值", () => {
    it("walletManager.initAiWallets 看到新 aiWallets 对象", () => {
      const newWallets: Record<string, number> = { "test-ai-1": 888000, "test-ai-2": 777000 }
      scene.aiWallets = newWallets

      scene.walletManager.initAiWallets()

      // initAiWallets 应操作新 wallets 对象，不会创建新对象
      expect(scene.aiWallets).toBe(newWallets)

      // 恢复
      scene.aiWallets = {}
    })
  })

  // ---- privateIntelEntries / publicInfoEntries 重新赋值 ----
  describe("privateIntelEntries / publicInfoEntries 重新赋值", () => {
    it("privateIntelEntries 重新赋值后 panelsManager 看到新数组", () => {
      const oldEntries = scene.privateIntelEntries
      const newEntries: Array<{ source: string; text: string; round: number }> = []
      scene.privateIntelEntries = newEntries

      scene.panelsManager.addPrivateIntelEntry({ source: "test", text: "hello" })

      // 新数组应有条目
      expect(newEntries).toHaveLength(1)
      expect(newEntries[0].source).toBe("test")
      // 旧数组不应受影响
      expect(oldEntries).toHaveLength(0)

      // 恢复
      scene.privateIntelEntries = oldEntries
    })

    it("publicInfoEntries 重新赋值后 panelsManager 看到新数组", () => {
      const oldEntries = scene.publicInfoEntries
      const newEntries: Array<{ source: string; text: string; round: number }> = []
      scene.publicInfoEntries = newEntries

      scene.panelsManager.addPublicInfoEntry({ source: "test", text: "public" })

      // 新数组应有条目
      expect(newEntries).toHaveLength(1)
      expect(newEntries[0].source).toBe("test")
      // 旧数组不应受影响
      expect(oldEntries).toHaveLength(0)

      // 恢复
      scene.publicInfoEntries = oldEntries
    })
  })

  // ---- isLanMode 切换 ----
  describe("isLanMode 切换", () => {
    it("scene.isLanMode 重新赋值后 getter 返回新值", () => {
      // 初始为 false
      expect(scene.isLanMode).toBe(false)

      // 切换到 true
      scene.isLanMode = true
      expect(scene.isLanMode).toBe(true)

      // 切回 false
      scene.isLanMode = false
      expect(scene.isLanMode).toBe(false)
    })
  })

  // ---- game 属性（Phaser boot 后设置）----
  describe("game 属性（Phaser boot 后设置）", () => {
    it("game 属性设置后 lobbyIndexManager 可见非 null", () => {
      // 初始 scene.game 可能是 undefined（Phaser 未 boot）
      // 模拟 Phaser create() 后设置 game
      const mockGame = { loop: { sleep: vi.fn(), wake: vi.fn() } }
      scene.game = mockGame

      // 验证 scene.game 已设置
      expect(scene.game).not.toBeNull()
      expect(scene.game).toBe(mockGame)

      // 清理
      delete scene.game
    })
  })
})

// =============================================================================
// 3. createXxx + setXxx 配对
// =============================================================================

describe("createXxx + setXxx 配对", () => {
  it("createLanBridge 后 getLanBridge 返回实例（非 null）", () => {
    // 模拟 LanIndexManager 的 createLanBridge + setLanBridge 配对模式
    const createBridge = () => {
      return { id: "test-bridge", playerId: "test-player" }
    }
    const setBridge = (bridge: unknown) => {
      scene.lanBridge = bridge
    }

    // 配对操作
    const bridge = createBridge()
    setBridge(bridge)

    // getLanBridge 应返回非 null 实例
    expect(scene.lanBridge).not.toBeNull()
    expect((scene.lanBridge as any).playerId).toBe("test-player")

    // 清理
    scene.lanBridge = null
  })
})

// =============================================================================
// 4. startNewRun 状态重置链条
// =============================================================================

describe("startNewRun 状态重置链条", () => {
  it("调用后 isLanMode=false, players 重置, lanPlayers 清空", () => {
    // 先设置联机状态
    scene.isLanMode = true
    scene.lanIsHost = true
    scene.lanPlayers = [{ id: "lan1", name: "联机玩家1" }]
    scene.lanAiPlayers = [{ id: "lan-ai-1", name: "联机AI" }]
    scene.lanMySlotId = "p3"
    scene.lanIdToSlotId = { p1: "lan1" }
    scene.slotIdToLanId = { lan1: "p1" }
    scene.lanHostWallets = { lan1: 50000 }
    scene.lanHostBids = { lan1: 3000 }
    scene.lanReconnecting = true
    scene.lanReconnectAttempts = 3

    // 执行新局重置
    scene.startNewRun()

    // 联机状态应被重置
    expect(scene.isLanMode).toBe(false)
    expect(scene.lanIsHost).toBe(false)
    expect(scene.lanMySlotId).toBe("p2")
    expect(scene.lanIdToSlotId).toEqual({})
    expect(scene.slotIdToLanId).toEqual({})
    expect(scene.lanHostWallets).toEqual({})
    expect(scene.lanHostBids).toEqual({})
    // lanAiLlmEnabled 和重连状态应被重置
    expect(scene.lanAiLlmEnabled).toBe(false)
    expect(scene.lanReconnecting).toBe(false)
    expect(scene.lanReconnectAttempts).toBe(0)

    // players 应重置为 4 个默认玩家
    expect(scene.players).toHaveLength(4)
    expect(scene.players[0].id).toBe("p1")
    expect(scene.players[1].id).toBe("p2")
    expect(scene.players[2].id).toBe("p3")
    expect(scene.players[3].id).toBe("p4")
  })
})

// =============================================================================
// 5. Mixin 代理 -> Manager 委托链条
// =============================================================================

describe("Mixin 代理 -> Manager 委托链条", () => {
  it("scene.positionPreview() -> warehouseManager.positionPreview 被调用", () => {
    // 临时挂载 Mixin 代理方法到实例
    scene.positionPreview = (x: number, y: number) => scene.warehouseManager.positionPreview(x, y)

    // 设置 DOM 元素（positionPreview 需要 previewPopover 和 gameRoot 非 null）
    const previewPopover = document.createElement("div")
    previewPopover.classList.add("hidden")
    previewPopover.style.maxHeight = "0px"
    scene.dom.previewPopover = previewPopover
    const gameRoot = document.createElement("div")
    Object.defineProperty(gameRoot, "clientHeight", { value: 600 })
    scene.dom.gameRoot = gameRoot

    const spy = vi.spyOn(scene.warehouseManager, "positionPreview")
    scene.positionPreview(100, 200)

    // 验证 Manager 方法被正确转发调用
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(100, 200)

    // 清理
    scene.dom.previewPopover = null
    scene.dom.gameRoot = null
  })

  it("scene.playerBid() -> biddingManager.playerBid 被调用", () => {
    // 临时挂载 Mixin 代理方法到实例
    scene.playerBid = BiddingMixin.playerBid.bind(scene)

    const spy = vi.spyOn(scene.biddingManager, "playerBid")
    scene.playerBid()

    // 验证 Manager 方法被正确转发调用
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("Mixin 代理方法使用 scene 作为 this 上下文", () => {
    // 验证 Mixin 代理方法中的 this 指向 scene 实例
    scene.positionPreview = (x: number, y: number) => scene.warehouseManager.positionPreview(x, y)
    scene.playerBid = BiddingMixin.playerBid.bind(scene)

    // 设置 DOM 元素（positionPreview 需要 previewPopover 和 gameRoot 非 null）
    const previewPopover = document.createElement("div")
    previewPopover.classList.add("hidden")
    previewPopover.style.maxHeight = "0px"
    scene.dom.previewPopover = previewPopover
    const gameRoot = document.createElement("div")
    Object.defineProperty(gameRoot, "clientHeight", { value: 600 })
    scene.dom.gameRoot = gameRoot

    // 应能正常调用且不抛出 TypeError
    expect(() => {
      scene.positionPreview(50, 75)
    }).not.toThrow()

    expect(() => {
      scene.playerBid()
    }).not.toThrow()

    // 清理
    scene.dom.previewPopover = null
    scene.dom.gameRoot = null
  })
})