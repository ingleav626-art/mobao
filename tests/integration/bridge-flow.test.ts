/**
 * @file tests/integration/bridge-flow.test.ts
 * @description Bridge 层集成测试。覆盖结算(bridge/settlement)、战绩(bridge/battle-record)、
 *              商店(bridge/shop) 三个 Bridge 工厂函数的链条执行。
 *
 *              测试链条：
 *              1. 结算 bridge 链条：createSettlementBridge -> methods 挂载 ->
 *                 enterSettlementPage -> updateSettlementPanelMetrics -> showSelfProfit
 *              2. 战绩 bridge 链条：createBattleRecordBridge -> 快照构建 -> 记录写入
 *              3. 商店 bridge 链条：purchaseItem -> consumeItem -> 库存/限购校验
 *              4. 结算纯函数集成：calculateDividendTicket 边界值 + getSelfProfitInfo 多场景
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createSettlementBridge } from "../../scripts/game/bridge/settlement"
import { createBattleRecordBridge } from "../../scripts/game/bridge/battle-record"
import { MobaoShopBridge } from "../../scripts/game/bridge/shop"
import {
  calculateDividendTicket,
  getSelfProfitInfo,
  buildDividendTicketLog
} from "../../scripts/game/core/settlement-manager"

// ─── Mock 全局依赖 ───

const mockScrollToNumber = vi.fn()
const mockStaggerEnter = vi.fn()

// MobaoAnimations 全局 mock
const mockMobaoAnimations = {
  scrollToNumber: mockScrollToNumber,
  staggerEnter: mockStaggerEnter
}

// applyPassiveEffect mock (模块级导入，需 vi.mock)
vi.mock("../../scripts/game/data/character-system", () => ({
  applyPassiveEffect: vi.fn(() => ({ bonus: 0, label: "" }))
}))

// ─── DOM mock 辅助 ───

interface MockDomElement {
  classList: {
    add: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    contains: ReturnType<typeof vi.fn>
  }
  textContent: string | null
  offsetWidth: number
  style: Record<string, string | number>
  closest: ReturnType<typeof vi.fn>
  querySelector: ReturnType<typeof vi.fn>
  querySelectorAll: ReturnType<typeof vi.fn>
}

function makeDomEl(overrides: Partial<MockDomElement> = {}): MockDomElement {
  return {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(() => false)
    },
    textContent: null,
    offsetWidth: 100,
    style: {},
    closest: vi.fn(() => null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    ...overrides
  }
}

// =============================================================================
// 1. 结算 bridge 链条
// =============================================================================

describe("结算 bridge 链条", () => {
  let mockScene: Record<string, unknown>
  let settlementBridge: ReturnType<typeof createSettlementBridge>

  beforeEach(() => {
    // 重置全局 mock
    mockScrollToNumber.mockReset()
    mockStaggerEnter.mockReset()
    vi.stubGlobal("MobaoAnimations", mockMobaoAnimations)

    // 构建 mock 场景
    const dom = {
      settlementPage: makeDomEl(),
      settleWinnerName: makeDomEl(),
      settleWinnerBid: makeDomEl(),
      settleBackBtn: makeDomEl(),
      settleSelfProfitRow: makeDomEl(),
      settleSelfProfit: makeDomEl(),
      settleReplayBtn: makeDomEl(),
      settleRevealedValue: makeDomEl(),
      settleWinnerProfit: makeDomEl(),
      settleProgressText: makeDomEl(),
      settleProgressFill: makeDomEl({ style: { width: "0%" } })
    }

    mockScene = {
      // DOM
      dom,
      // 玩家
      players: [
        { id: "p1", isSelf: true, name: "玩家" },
        { id: "p2", isSelf: false, name: "AI甲", isAI: true },
        { id: "p3", isSelf: false, name: "AI乙", isAI: true }
      ],
      // 状态
      settlementSession: null,
      battleRecordReplayActive: false,
      isLanMode: false,
      _lastRevealedValue: 0,
      _lastDisplayProfit: 0,
      // 方法
      hidePreview: vi.fn(),
      closeBidKeypad: vi.fn(),
      closeItemDrawer: vi.fn(),
      uiOverlayManager: { updateReflectionStatusUI: vi.fn() },
      cancelSettlementReveal: vi.fn(),
      // 动画
      tweens: { add: vi.fn() },
      add: {
        rectangle: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn(), destroy: vi.fn() })),
        container: vi.fn(() => ({ add: vi.fn() })),
        circle: vi.fn(() => ({
          setStrokeStyle: vi.fn(),
          setDepth: vi.fn(),
          destroy: vi.fn()
        })),
        arc: vi.fn(() => ({
          setStrokeStyle: vi.fn(),
          setDepth: vi.fn(),
          destroy: vi.fn()
        })),
        image: vi.fn(() => ({
          setOrigin: vi.fn(),
          setDisplaySize: vi.fn(),
          setAlpha: vi.fn()
        }))
      },
      textures: { exists: vi.fn(() => false) },
      load: {
        image: vi.fn(),
        on: vi.fn(),
        start: vi.fn()
      },
      items: [],
      warehouseTrueValue: 0,
      settlementRevealRunning: false,
      settlementRevealSkipRequested: false,
      isSettlementRevealMode: false,
      settlementRunToken: 0
    }

    // 创建 bridge
    settlementBridge = createSettlementBridge({
      MARGIN: 10,
      CELL_SIZE: 64,
      delay: vi.fn().mockResolvedValue(undefined),
      tweenToPromise: vi.fn().mockResolvedValue(undefined),
      settlementRevealDelayByQuality: vi.fn(() => 200),
      settlementSearchDurationByQuality: vi.fn(() => 500)
    })
  })

  describe("createSettlementBridge(deps) 返回结构", () => {
    it("返回 { methods }", () => {
      expect(settlementBridge).toHaveProperty("methods")
      expect(typeof settlementBridge.methods).toBe("object")
    })

    it("methods 包含全部结算方法", () => {
      const expectedMethods = [
        "isSettlementPageActive",
        "revealAllArtifactsForSettlement",
        "playSettlementRevealStep",
        "playSettlementSearchEffect",
        "playSettlementFinalEffect",
        "triggerSettlementFinalAnimation",
        "enterSettlementPage",
        "exitSettlementPage",
        "cancelSettlementReveal",
        "setSettlementProgress",
        "updateSettlementPanelMetrics",
        "showSelfProfit"
      ]
      expectedMethods.forEach((name) => {
        expect(settlementBridge.methods).toHaveProperty(name)
        expect(typeof settlementBridge.methods[name]).toBe("function")
      })
    })
  })

  describe("methods 挂载到场景后 enterSettlementPage", () => {
    it("设置 settlementSession", () => {
      // 挂载
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { enterSettlementPage: Function; settlementSession: unknown }

      scene.enterSettlementPage(
        { id: "p1", name: "玩家", isSelf: true, isHuman: true, isAI: false },
        80000,
        "最终回合高价胜出"
      )

      expect(scene.settlementSession).toEqual({
        winnerId: "p1",
        winnerName: "玩家",
        winnerBid: 80000,
        reasonText: "最终回合高价胜出"
      })
    })

    it("更新 DOM 元素内容", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { enterSettlementPage: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.enterSettlementPage(
        { id: "p1", name: "玩家", isSelf: true, isHuman: true, isAI: false },
        80000,
        "最终回合高价胜出"
      )

      expect(dom.settleWinnerName.textContent).toBe("玩家（最终回合高价胜出）")
      expect(dom.settleWinnerBid.textContent).toBe("80000")
    })

    it("调用 hidePreview/closeBidKeypad/closeItemDrawer", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { enterSettlementPage: Function }

      scene.enterSettlementPage(
        { id: "p1", name: "玩家", isSelf: true, isHuman: true, isAI: false },
        80000,
        "最终回合高价胜出"
      )

      expect(mockScene.hidePreview).toHaveBeenCalledOnce()
      expect(mockScene.closeBidKeypad).toHaveBeenCalledOnce()
      expect(mockScene.closeItemDrawer).toHaveBeenCalledOnce()
    })
  })

  describe("updateSettlementPanelMetrics", () => {
    it("正利润显示 + 前缀", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { updateSettlementPanelMetrics: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.updateSettlementPanelMetrics(100000, 20000)

      expect(mockScrollToNumber).toHaveBeenCalledWith(
        dom.settleWinnerProfit,
        20000,
        expect.objectContaining({ prefix: "+" })
      )
    })

    it("负利润显示 - 前缀", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { updateSettlementPanelMetrics: Function }

      scene.updateSettlementPanelMetrics(50000, -30000)

      expect(mockScrollToNumber).toHaveBeenCalledWith(
        expect.any(Object),
        -30000,
        expect.objectContaining({ prefix: "" })
      )
    })

    it("零利润显示 neutral class", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { updateSettlementPanelMetrics: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.updateSettlementPanelMetrics(80000, 0)

      expect(dom.settleWinnerProfit.classList.add).toHaveBeenCalledWith("profit-neutral")
    })

    it("更新 revealedValue DOM", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { updateSettlementPanelMetrics: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.updateSettlementPanelMetrics(123456, 50000)

      expect(dom.settleRevealedValue.textContent).toBe("123456")
    })

    it("记录 _lastRevealedValue 和 _lastDisplayProfit", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as {
        updateSettlementPanelMetrics: Function
        _lastRevealedValue: number
        _lastDisplayProfit: number
      }

      scene.updateSettlementPanelMetrics(99999, 33333)

      expect(scene._lastRevealedValue).toBe(99999)
      expect(scene._lastDisplayProfit).toBe(33333)
    })
  })

  describe("setSettlementProgress", () => {
    it("更新进度文本和进度条宽度", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { setSettlementProgress: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.setSettlementProgress("揭示中...", 0.5)

      expect(dom.settleProgressText.textContent).toBe("揭示中...")
      expect(dom.settleProgressFill.style.width).toBe("50%")
    })

    it("progress=1 时显示 100% 并设置金色渐变", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { setSettlementProgress: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.setSettlementProgress("完成", 1)

      expect(dom.settleProgressFill.style.width).toBe("100%")
      expect(dom.settleProgressFill.style.background).toContain("#ffd700")
    })

    it("progress 超出范围时 clamp", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { setSettlementProgress: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.setSettlementProgress("溢出", 1.5)

      expect(dom.settleProgressFill.style.width).toBe("100%")
    })
  })

  describe("showSelfProfit", () => {
    it("正利润显示 + 前缀", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { showSelfProfit: Function }
      const dom = mockScene.dom as Record<string, MockDomElement>

      scene.showSelfProfit(5000, "自身利润（分红）")

      expect(dom.settleSelfProfitRow.classList.remove).toHaveBeenCalledWith("hidden")
      expect(mockScrollToNumber).toHaveBeenCalledWith(
        dom.settleSelfProfit,
        5000,
        expect.objectContaining({ prefix: "+" })
      )
    })

    it("负利润显示 - 前缀", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as { showSelfProfit: Function }

      scene.showSelfProfit(-1000, "自身利润（门票）")

      expect(mockScrollToNumber).toHaveBeenCalledWith(
        expect.any(Object),
        -1000,
        expect.objectContaining({ prefix: "" })
      )
    })
  })

  describe("exitSettlementPage", () => {
    it("清理 settlementSession 和 DOM 状态", () => {
      Object.assign(mockScene, settlementBridge.methods)
      const scene = mockScene as unknown as {
        enterSettlementPage: Function
        exitSettlementPage: Function
        settlementSession: unknown
        cancelSettlementReveal: Function
      }
      const dom = mockScene.dom as Record<string, MockDomElement>

      // 先进入
      scene.enterSettlementPage(
        { id: "p1", name: "玩家", isSelf: true, isHuman: true, isAI: false },
        80000,
        "最终回合高价胜出"
      )
      expect(scene.settlementSession).not.toBeNull()

      // 退出
      scene.exitSettlementPage()

      expect(scene.settlementSession).toBeNull()
      expect(dom.settlementPage.classList.add).toHaveBeenCalledWith("hidden")
      // exitSettlementPage 调用 bridge 的 cancelSettlementReveal，清理状态
      expect(dom.settlementPage.classList.remove).toHaveBeenCalled()
    })
  })
})

// =============================================================================
// 2. 战绩 bridge 链条
// =============================================================================

describe("战绩 bridge 链条", () => {
  const STORAGE_KEY = "mobao_battle_records_v2_test"

  const mockDeps = {
    BATTLE_RECORD_STORAGE_KEY: STORAGE_KEY,
    GRID_COLS: 6,
    GRID_ROWS: 4,
    clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
    escapeHtml: (text: string) =>
      text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    formatBidRevealNumber: (v: number) => String(v)
  }

  beforeEach(() => {
    localStorage.clear()
  })

  describe("createBattleRecordBridge(deps) 返回结构", () => {
    it("返回 { methods, loadBattleRecords, saveBattleRecords, formatRecordTime }", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      expect(bridge).toHaveProperty("methods")
      expect(bridge).toHaveProperty("loadBattleRecords")
      expect(bridge).toHaveProperty("saveBattleRecords")
      expect(bridge).toHaveProperty("formatRecordTime")
      expect(typeof bridge.methods).toBe("object")
      expect(typeof bridge.loadBattleRecords).toBe("function")
      expect(typeof bridge.saveBattleRecords).toBe("function")
      expect(typeof bridge.formatRecordTime).toBe("function")
    })

    it("methods 包含战绩相关方法", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      const expectedMethods = [
        "buildWarehouseSnapshotForRecord",
        "saveBattleRecord",
        "deleteBattleRecord"
      ]
      expectedMethods.forEach((name) => {
        expect(bridge.methods).toHaveProperty(name)
        expect(typeof bridge.methods[name]).toBe("function")
      })
    })
  })

  describe("buildWarehouseSnapshotForRecord 构建快照", () => {
    it("从 items 构建正确格式的快照", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      // 挂载到 mock 场景
      const mockItems = [
        {
          id: "item-1",
          key: "artifact-001",
          name: "青花瓷瓶",
          category: "瓷器",
          qualityKey: "legendary",
          w: 2,
          h: 2,
          x: 0,
          y: 0,
          trueValue: 50000
        },
        {
          id: "item-2",
          key: "artifact-002",
          name: "玉璧",
          category: "玉器",
          qualityKey: "epic",
          w: 1,
          h: 1,
          x: 3,
          y: 0,
          trueValue: 30000
        }
      ]
      const mockScene = {
        items: mockItems,
        battleRecords: []
      }
      Object.assign(mockScene, bridge.methods)
      const scene = mockScene as unknown as { buildWarehouseSnapshotForRecord: Function }

      const snapshot = scene.buildWarehouseSnapshotForRecord()

      expect(snapshot).toHaveLength(2)
      expect(snapshot[0]).toEqual({
        id: "item-1",
        key: "artifact-001",
        name: "青花瓷瓶",
        category: "瓷器",
        qualityKey: "legendary",
        w: 2,
        h: 2,
        x: 0,
        y: 0,
        trueValue: 50000
      })
      expect(snapshot[1]).toEqual({
        id: "item-2",
        key: "artifact-002",
        name: "玉璧",
        category: "玉器",
        qualityKey: "epic",
        w: 1,
        h: 1,
        x: 3,
        y: 0,
        trueValue: 30000
      })
    })

    it("快照按 y/x 排序", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      const mockItems = [
        { id: "b", y: 1, x: 0, w: 1, h: 1, trueValue: 1000 },
        { id: "a", y: 0, x: 1, w: 1, h: 1, trueValue: 2000 },
        { id: "c", y: 0, x: 0, w: 1, h: 1, trueValue: 3000 }
      ]
      // 补齐缺失字段
      const fullItems = mockItems.map((item) => ({
        ...item,
        key: `key-${item.id}`,
        name: `Item ${item.id}`,
        category: "测试",
        qualityKey: "normal"
      }))
      const mockScene = { items: fullItems, battleRecords: [] }
      Object.assign(mockScene, bridge.methods)
      const scene = mockScene as unknown as { buildWarehouseSnapshotForRecord: Function }

      const snapshot = scene.buildWarehouseSnapshotForRecord()
      expect(snapshot).toHaveLength(3)
      // 按 y 升序，y 相同按 x 升序
      expect(snapshot[0].id).toBe("c") // y=0, x=0
      expect(snapshot[1].id).toBe("a") // y=0, x=1
      expect(snapshot[2].id).toBe("b") // y=1, x=0
    })

    it("空 items 返回空数组", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      const mockScene = { items: [], battleRecords: [] }
      Object.assign(mockScene, bridge.methods)
      const scene = mockScene as unknown as { buildWarehouseSnapshotForRecord: Function }

      const snapshot = scene.buildWarehouseSnapshotForRecord()
      expect(snapshot).toEqual([])
    })
  })

  describe("saveBattleRecord 写入记录", () => {
    it("写入后可通过 loadBattleRecords 读取", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      const mockScene = {
        items: [
          {
            id: "item-1",
            key: "art-1",
            name: "藏品",
            category: "瓷",
            qualityKey: "rare",
            w: 1,
            h: 1,
            x: 0,
            y: 0,
            trueValue: 5000
          }
        ],
        battleRecords: [],
        round: 5,
        currentRunLog: null,
        lastAiDecisionTelemetry: null,
        canUseLlmDecision: vi.fn(() => false),
        battleRecords: [],
        dom: {
          battleRecordOverlay: { classList: { contains: vi.fn(() => false) } }
        },
        writeLog: vi.fn(),
        buildWarehouseSnapshotForRecord: vi.fn(() => [
          { id: "item-1", key: "art-1", name: "藏品", category: "瓷", qualityKey: "rare", w: 1, h: 1, x: 0, y: 0, trueValue: 5000 }
        ]),
        renderBattleRecordPanel: vi.fn()
      }
      Object.assign(mockScene, bridge.methods)
      const scene = mockScene as unknown as { saveBattleRecord: Function }

      scene.saveBattleRecord({
        mode: "final",
        winnerId: "p1",
        winnerName: "玩家",
        winnerBid: 80000,
        totalValue: 100000,
        winnerProfit: 20000,
        playerProfit: 20000,
        playerWon: true,
        dividendTicketInfo: null,
        reasonText: "最终回合高价胜出"
      })

      // 验证记录写入 localStorage
      const records = bridge.loadBattleRecords()
      expect(records).toHaveLength(1)
      expect(records[0].winnerBid).toBe(80000)
      expect(records[0].totalValue).toBe(100000)
      expect(records[0].winnerProfit).toBe(20000)
      expect(records[0].playerProfit).toBe(20000)
      expect(records[0].playerWon).toBe(true)
      expect(records[0].mode).toBe("final")
    })

    it("多条记录只保留最近 20 条", () => {
      const bridge = createBattleRecordBridge(mockDeps)
      const mockScene = {
        items: [],
        battleRecords: [],
        round: 1,
        currentRunLog: null,
        lastAiDecisionTelemetry: null,
        canUseLlmDecision: vi.fn(() => false),
        battleRecords: [],
        dom: {
          battleRecordOverlay: { classList: { contains: vi.fn(() => false) } }
        },
        writeLog: vi.fn(),
        buildWarehouseSnapshotForRecord: vi.fn(() => []),
        renderBattleRecordPanel: vi.fn()
      }
      Object.assign(mockScene, bridge.methods)
      const scene = mockScene as unknown as { saveBattleRecord: Function }

      // 写入 25 条
      for (let i = 0; i < 25; i++) {
        scene.saveBattleRecord({
          mode: "final",
          winnerId: "p1",
          winnerName: `玩家${i}`,
          winnerBid: 1000 + i,
          totalValue: 2000 + i,
          winnerProfit: 1000,
          playerProfit: 1000,
          playerWon: true,
          dividendTicketInfo: null,
          reasonText: "结算"
        })
      }

      const records = bridge.loadBattleRecords()
      // 只保留最近 20 条
      expect(records).toHaveLength(20)
      // 最新的在前面
      expect(records[0].winnerName).toBe("玩家24")
      expect(records[19].winnerName).toBe("玩家5")
    })
  })
})

// =============================================================================
// 3. 商店 bridge 链条
// =============================================================================

describe("商店 bridge 链条", () => {
  const MONEY_KEY = "mobao_player_money_v1"

  beforeEach(() => {
    localStorage.clear()
  })

  describe("purchaseItem 购买流程", () => {
    it("购买成功：扣减资金、增加库存", () => {
      // 设置初始资金
      localStorage.setItem(MONEY_KEY, "100000")
      localStorage.setItem("mobao_shop_inventory_v1", JSON.stringify({
        outlineLamp: 5,
        qualityNeedle: 3
      }))

      const result = MobaoShopBridge.purchaseItem("item-outline-lamp")

      expect(result.ok).toBe(true)
      expect(result.message).toBe("购买成功")
      expect(result.newMoney).toBe(100000) // 探照灯 price=0
      // 库存 +1
      expect(result.newInventory?.outlineLamp).toBe(6)
    })

    it("购买不存在的商品返回错误", () => {
      localStorage.setItem(MONEY_KEY, "100000")
      const result = MobaoShopBridge.purchaseItem("non-existent-item")
      expect(result.ok).toBe(false)
      expect(result.message).toBe("商品不存在")
    })

    it("资金为 0 时免费道具购买成功", () => {
      // 所有道具 price=0，资金为 0 也能购买
      localStorage.setItem(MONEY_KEY, "0")
      const result = MobaoShopBridge.purchaseItem("item-outline-lamp")
      expect(result.ok).toBe(true)
      expect(result.message).toBe("购买成功")
    })
  })

  describe("consumeItem 消耗流程", () => {
    it("消耗成功：库存减 1", () => {
      localStorage.setItem("mobao_shop_inventory_v1", JSON.stringify({
        outlineLamp: 5
      }))

      const result = MobaoShopBridge.consumeItem("item-outline-lamp")

      expect(result.ok).toBe(true)
      expect(result.newInventory?.outlineLamp).toBe(4)
    })

    it("库存不足时返回错误", () => {
      localStorage.setItem("mobao_shop_inventory_v1", JSON.stringify({
        outlineLamp: 0
      }))

      const result = MobaoShopBridge.consumeItem("item-outline-lamp")

      expect(result.ok).toBe(false)
      expect(result.message).toBe("道具数量不足")
    })
  })

  describe("getRemainingDaily 每日限购", () => {
    it("未购买时返回 maxDaily", () => {
      const remaining = MobaoShopBridge.getRemainingDaily("item-outline-torch") // maxDaily=3
      expect(remaining).toBe(3)
    })

    it("已购买部分时返回剩余次数", () => {
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
      localStorage.setItem(
        "mobao_shop_refresh_date_v1",
        JSON.stringify({ date: dateStr, purchases: { "item-outline-torch": 2 } })
      )

      const remaining = MobaoShopBridge.getRemainingDaily("item-outline-torch")
      expect(remaining).toBe(1) // 3 - 2
    })

    it("已买完返回 0", () => {
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
      localStorage.setItem(
        "mobao_shop_refresh_date_v1",
        JSON.stringify({ date: dateStr, purchases: { "item-outline-torch": 3 } })
      )

      const remaining = MobaoShopBridge.getRemainingDaily("item-outline-torch")
      expect(remaining).toBe(0)
    })
  })

  describe("getItemCount / getFullInventory", () => {
    it("getItemCount 返回指定道具数量", () => {
      localStorage.setItem("mobao_shop_inventory_v1", JSON.stringify({
        outlineLamp: 10,
        qualityNeedle: 7
      }))

      expect(MobaoShopBridge.getItemCount("item-outline-lamp")).toBe(10)
      expect(MobaoShopBridge.getItemCount("item-quality-needle")).toBe(7)
      expect(MobaoShopBridge.getItemCount("non-existent")).toBe(0)
    })

    it("getFullInventory 返回完整库存", () => {
      localStorage.setItem("mobao_shop_inventory_v1", JSON.stringify({
        outlineLamp: 3,
        catStone: 5
      }))

      const inv = MobaoShopBridge.getFullInventory()
      expect(inv.outlineLamp).toBe(3)
      expect(inv.catStone).toBe(5)
    })

    it("无存储时 getFullInventory 返回默认库存", () => {
      const inv = MobaoShopBridge.getFullInventory()
      expect(inv.outlineLamp).toBe(99)
      expect(inv.catStone).toBe(99)
    })
  })
})

// =============================================================================
// 4. 结算纯函数集成（边界值 + 多场景）
// =============================================================================

describe("结算纯函数集成", () => {
  describe("calculateDividendTicket 边界值", () => {
    it("totalValue = winnerBid 时平局", () => {
      const r = calculateDividendTicket(50000, 50000)
      expect(r.winnerProfit).toBe(0)
      expect(r.mechanism).toBe("none")
    })

    it("totalValue 远大于 winnerBid 时大额门票", () => {
      // 1000000 * 0.05 = 50000
      const r = calculateDividendTicket(1000000, 10000)
      expect(r.winnerProfit).toBe(990000)
      expect(r.ticketPerPlayer).toBe(49500)
      expect(r.mechanism).toBe("ticket")
    })

    it("totalValue 远小于 winnerBid 时大额分红", () => {
      // 990000 * 0.15 = 148500
      const r = calculateDividendTicket(10000, 1000000)
      expect(r.winnerProfit).toBe(-990000)
      expect(r.dividendPerPlayer).toBe(148500)
      expect(r.mechanism).toBe("dividend")
    })

    it("1 元利润四舍五入", () => {
      // 1 * 0.05 = 0.05 → 0
      const r = calculateDividendTicket(10001, 10000)
      expect(r.winnerProfit).toBe(1)
      expect(r.ticketPerPlayer).toBe(0)
      expect(r.mechanism).toBe("none")
    })

    it("1 元亏损四舍五入", () => {
      // 1 * 0.15 = 0.15 → 0
      const r = calculateDividendTicket(10000, 10001)
      expect(r.winnerProfit).toBe(-1)
      expect(r.dividendPerPlayer).toBe(0)
      expect(r.mechanism).toBe("none")
    })

    it("totalValue=0 时全部亏损", () => {
      const r = calculateDividendTicket(0, 50000)
      expect(r.winnerProfit).toBe(-50000)
      expect(r.dividendPerPlayer).toBe(7500)
      expect(r.mechanism).toBe("dividend")
    })

    it("winnerBid=0 时全部盈利", () => {
      const r = calculateDividendTicket(50000, 0)
      expect(r.winnerProfit).toBe(50000)
      expect(r.ticketPerPlayer).toBe(2500)
      expect(r.mechanism).toBe("ticket")
    })

    it("负数金额回退为 0", () => {
      const r = calculateDividendTicket(-100, -200)
      expect(r.winnerProfit).toBe(100)
      expect(r.mechanism).toBe("ticket")
    })
  })

  describe("getSelfProfitInfo 多玩家场景", () => {
    it("赢家且盈利：返回自身利润", () => {
      const r = getSelfProfitInfo(50000, 0, 2500, true)
      expect(r.profit).toBe(50000)
      expect(r.label).toBe("自身利润")
    })

    it("赢家且亏损：返回自身亏损", () => {
      const r = getSelfProfitInfo(-30000, 4500, 0, true)
      expect(r.profit).toBe(-30000)
      expect(r.label).toBe("自身利润")
    })

    it("非赢家且分红：返回正利润（分红）", () => {
      const r = getSelfProfitInfo(-30000, 4500, 0, false)
      expect(r.profit).toBe(4500)
      expect(r.label).toBe("自身利润（分红）")
    })

    it("非赢家且门票：返回负利润（门票）", () => {
      const r = getSelfProfitInfo(50000, 0, 2500, false)
      expect(r.profit).toBe(-2500)
      expect(r.label).toBe("自身利润（门票）")
    })

    it("非赢家且平局：返回 0", () => {
      const r = getSelfProfitInfo(0, 0, 0, false)
      expect(r.profit).toBe(0)
      expect(r.label).toBe("自身利润")
    })
  })

  describe("buildDividendTicketLog 格式", () => {
    it("分红日志包含金额", () => {
      const msg = buildDividendTicketLog(-30000, 4500, 0)
      expect(msg).toBe("分红：拍下者亏损，非拍下者各获得亏损的15%（+4500）。")
    })

    it("门票日志包含金额", () => {
      const msg = buildDividendTicketLog(20000, 0, 1000)
      expect(msg).toBe("门票：拍下者盈利，非拍下者各扣除盈利的5%（-1000）。")
    })

    it("无分红无门票返回 null", () => {
      expect(buildDividendTicketLog(0, 0, 0)).toBeNull()
    })

    it("亏损但 dividend=0 返回 null", () => {
      expect(buildDividendTicketLog(-1, 0, 0)).toBeNull()
    })

    it("盈利但 ticket=0 返回 null", () => {
      expect(buildDividendTicketLog(1, 0, 0)).toBeNull()
    })
  })
})