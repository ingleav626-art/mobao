/**
 * @file tests/game/bidding/bidding-manager.test.ts
 * @description BiddingManager 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  BiddingManager,
  type BiddingManagerDeps
} from "../../../scripts/game/bidding/bidding-manager"
import {
  getLastRoundBidMap,
  shouldDirectTake
} from "../../../scripts/game/bidding/index"

// 抑制 console 日志
vi.spyOn(console, "log").mockImplementation(() => {})

// Mock 外部模块（避免动画/音频延迟）
vi.mock("../../../scripts/game/animations", () => ({
  MobaoAnimations: {
    roundTransition: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock("../../../scripts/audio/audio-ui", () => ({
  AudioUI: {
    stopCountdown: vi.fn(),
    playReveal: vi.fn(),
  },
}))

// ─── 辅助函数 ───

function createMockDeps(overrides: Partial<BiddingManagerDeps> = {}): BiddingManagerDeps {
  const dom: Record<string, HTMLElement | null> = {}
  const defaultDeps: BiddingManagerDeps = {
    dom,
    players: [
      { id: "p1", name: "AI-1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "AI-2", isHuman: false, isAI: true, isSelf: false }
    ],
    input: { enabled: true },
    skillManager: { onNewRound: vi.fn() },

    getIsLanMode: () => false,
    getSettled: () => false,
    getRoundPaused: () => false,
    getPlayerMoney: () => 100000,
    getLanMySlotId: () => null,
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
    resolveRoundBids: vi.fn(() => Promise.resolve()),

    ...overrides
  }
  return defaultDeps
}

function createManager(deps: BiddingManagerDeps = createMockDeps()): BiddingManager {
  return new BiddingManager(deps)
}

// ─── 测试 ───

describe("BiddingManager", () => {
  describe("构造函数", () => {
    it("创建 Manager 实例", () => {
      const mgr = createManager()
      expect(mgr).toBeInstanceOf(BiddingManager)
    })
  })

  describe("areAllPlayersBidReady", () => {
    it("所有人未准备时返回 false", () => {
      const mgr = createManager()
      expect(mgr.areAllPlayersBidReady()).toBe(false)
    })

    it("部分玩家准备时返回 false", () => {
      const mgr = createManager()
      mgr.setPlayerBidReady("p1", true)
      expect(mgr.areAllPlayersBidReady()).toBe(false)
    })

    it("所有玩家准备时返回 true", () => {
      const mgr = createManager()
      mgr.setPlayerBidReady("p1", true)
      mgr.setPlayerBidReady("p2", true)
      mgr.setPlayerBidReady("p3", true)
      expect(mgr.areAllPlayersBidReady()).toBe(true)
    })
  })

  describe("setPlayerBidReady", () => {
    it("设置玩家准备状态并更新 DOM 卡片样式", () => {
      const dom: Record<string, HTMLElement | null> = {}
      const cardEl = document.createElement("div")
      cardEl.id = "playerCard-p1"
      document.body.appendChild(cardEl)
      dom["playerCard-p1"] = cardEl

      const mgr = createManager(createMockDeps({ dom }))
      mgr.setPlayerBidReady("p1", true)
      expect(cardEl.classList.contains("bid-ready")).toBe(true)

      mgr.setPlayerBidReady("p1", false)
      expect(cardEl.classList.contains("bid-ready")).toBe(false)

      document.body.removeChild(cardEl)
    })
  })

  describe("openBidKeypad / closeBidKeypad", () => {
    it("打开键盘时禁用 Phaser 输入并显示键盘", () => {
      const dom: Record<string, HTMLElement | null> = {}
      const keypadEl = document.createElement("div")
      keypadEl.id = "bidKeypad"
      dom.bidKeypad = keypadEl
      dom.bidInput = document.createElement("input")
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")

      const input = { enabled: true }
      const mgr = createManager(createMockDeps({ dom, input }))

      mgr.openBidKeypad()
      expect(keypadEl.classList.contains("hidden")).toBe(false)
      expect(input.enabled).toBe(false)
    })

    it("关闭键盘时启用 Phaser 输入并隐藏键盘", () => {
      const dom: Record<string, HTMLElement | null> = {}
      const keypadEl = document.createElement("div")
      dom.bidKeypad = keypadEl

      const input = { enabled: false }
      const mgr = createManager(createMockDeps({ dom, input }))

      mgr.closeBidKeypad()
      expect(keypadEl.classList.contains("hidden")).toBe(true)
      expect(input.enabled).toBe(true)
    })

    it("已结算时 openBidKeypad 无操作", () => {
      const closeItemDrawer = vi.fn()
      const mgr = createManager(createMockDeps({ getSettled: () => true, closeItemDrawer }))
      mgr.openBidKeypad()
      expect(closeItemDrawer).not.toHaveBeenCalled()
    })
  })

  describe("handleBidKeyInput", () => {
    it("clear 键重置为 0", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")
      dom.bidInput = document.createElement("input")

      const mgr = createManager(createMockDeps({ dom }))
      mgr.handleBidKeyInput("clear")
      expect(mgr["state"].keypadValue).toBe("0")
    })

    it("del 键删除最后一位", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")
      dom.bidInput = document.createElement("input")

      const mgr = createManager(createMockDeps({ dom }))
      mgr["state"].keypadValue = "123"
      mgr.handleBidKeyInput("del")
      expect(mgr["state"].keypadValue).toBe("12")
    })

    it("del 键在只有一位时重置为 0", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")
      dom.bidInput = document.createElement("input")

      const mgr = createManager(createMockDeps({ dom }))
      mgr["state"].keypadValue = "5"
      mgr.handleBidKeyInput("del")
      expect(mgr["state"].keypadValue).toBe("0")
    })

    it("ok 键显示确认对话框", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")
      dom.bidInput = document.createElement("input")
      dom.bidKeypad = document.createElement("div")

      const showGameConfirm = vi.fn()
      const mgr = createManager(createMockDeps({ dom, showGameConfirm }))
      mgr["state"].keypadValue = "5000"
      mgr.handleBidKeyInput("ok")

      expect(showGameConfirm).toHaveBeenCalledWith(
        "确认出价 5,000 ？",
        expect.any(Function)
      )
    })

    it("数字键输入拼接", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.keypadScreen = document.createElement("span")
      dom.keypadDirectHint = document.createElement("span")
      dom.bidInput = document.createElement("input")

      const mgr = createManager(createMockDeps({ dom }))
      mgr.handleBidKeyInput("5")
      expect(mgr["state"].keypadValue).toBe("5")
      mgr.handleBidKeyInput("0")
      expect(mgr["state"].keypadValue).toBe("50")
    })
  })

  describe("playerBid", () => {
    it("已结算时拒绝出价", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ getSettled: () => true, writeLog }))
      mgr.playerBid()
      expect(writeLog).toHaveBeenCalledWith("本局已结算，请重新开局。")
    })

    it("正在结算时拒绝出价", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ writeLog }))
      mgr["state"].roundResolving = true
      mgr.playerBid()
      expect(writeLog).toHaveBeenCalledWith("本轮正在结算中，请等待出价揭示。")
    })

    it("回合暂停时拒绝出价", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ getRoundPaused: () => true, writeLog }))
      mgr.playerBid()
      expect(writeLog).toHaveBeenCalledWith("当前回合已暂停，请先继续回合再提交出价。")
    })

    it("已提交后拒绝重复出价", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ writeLog }))
      mgr["state"].playerBidSubmitted = true
      mgr.playerBid()
      expect(writeLog).toHaveBeenCalledWith("你已提交本轮出价，不可再次提交。")
    })

    it("资金不足时拒绝出价", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.bidInput = document.createElement("input")
      dom.bidInput.value = "200000"

      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ dom, getPlayerMoney: () => 100000, writeLog }))
      mgr.playerBid()
      expect(writeLog).toHaveBeenCalledWith("资金不足，无法按该金额出价。")
    })

    it("有效出价提交成功", () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom.bidInput = document.createElement("input")
      dom.bidInput.value = "5000"
      dom.bidKeypad = document.createElement("div")
      dom["playerCard-p2"] = document.createElement("div")

      const writeLog = vi.fn()
      const updateHud = vi.fn()
      const mgr = createManager(createMockDeps({ dom, writeLog, updateHud }))

      mgr.playerBid()
      expect(mgr["state"].playerRoundBid).toBe(5000)
      expect(mgr["state"].playerBidSubmitted).toBe(true)
      expect(writeLog).toHaveBeenCalled()
      expect(updateHud).toHaveBeenCalled()
    })
  })

  describe("getLastRoundBidMap (纯函数)", () => {
    it("返回每个玩家最后一轮出价", () => {
      const history = {
        "ai-1": [{ bid: 1000 }, { bid: 2000 }],
        "ai-2": [{ bid: 1500 }]
      }
      expect(getLastRoundBidMap(history)).toEqual({ "ai-1": 2000, "ai-2": 1500 })
    })
  })

  describe("shouldDirectTake (纯函数)", () => {
    it("出价超过阈值时直接拿下", () => {
      expect(shouldDirectTake(3, 5, 1200, 1000, 0.2)).toBe(true)
    })

    it("出价低于阈值时不拿下", () => {
      expect(shouldDirectTake(3, 5, 1199, 1000, 0.2)).toBe(false)
    })

    it("最后一回合不触发直接拿下", () => {
      expect(shouldDirectTake(5, 5, 9999, 1000, 0.2)).toBe(false)
    })
  })

  describe("resolveRoundBids", () => {
    it("已结算时直接返回", async () => {
      const getSettled = vi.fn(() => true)
      const mgr = createManager(createMockDeps({ getSettled }))
      await mgr.resolveRoundBids()
      expect(getSettled).toHaveBeenCalled()
    })

    it("联机模式直接返回", async () => {
      const getIsLanMode = vi.fn(() => true)
      const getLanBridge = vi.fn(() => ({ submitBid: vi.fn() }))
      const mgr = createManager(createMockDeps({ getIsLanMode, getLanBridge }))
      await mgr.resolveRoundBids()
      // 联机模式下不应该继续执行结算逻辑
      expect(mgr["state"].roundResolving).toBe(false)
    })

    it("玩家未提交出价时记为 0", { timeout: 30000 }, async () => {
      const dom: Record<string, HTMLElement | null> = {}
      dom["playerCard-p2"] = document.createElement("div")

      const writeLog = vi.fn()
      const updateHud = vi.fn()
      const getAiEngine = vi.fn(() => null)
      const getItems = vi.fn(() => [])

      const mgr = createManager(createMockDeps({
        dom,
        writeLog,
        updateHud,
        getAiEngine,
        getItems
      }))

      // 模拟 resolveRoundBids 执行
      mgr["state"].round = 1
      await mgr.resolveRoundBids("timeout")

      // 玩家未提交出价，记为 0
      expect(mgr["state"].playerRoundBid).toBe(0)
      expect(writeLog).toHaveBeenCalledWith("回合超时：玩家本轮出价记为 0。")
    })
  })

  describe("buildRoundBids", () => {
    it("AI 引擎为空时仍然构建出价", () => {
      const players = [
        { id: "p1", name: "AI-1", isHuman: false, isAI: true, isSelf: false },
        { id: "p2", name: "玩家", isHuman: true, isAI: false, isSelf: true }
      ]
      const getAiEngine = vi.fn(() => null)
      const getItems = vi.fn(() => [])
      const getPlayerRoundHistory = vi.fn(() => ({}))

      const mgr = createManager(createMockDeps({
        players,
        getAiEngine,
        getItems,
        getPlayerRoundHistory
      }))

      const bids = mgr.buildRoundBids()
      expect(Array.isArray(bids)).toBe(true)
      expect(bids.length).toBe(2)
    })
  })

  describe("settleCurrentRun", () => {
    it("联机非主机时直接返回", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => false,
        writeLog
      }))
      mgr.settleCurrentRun()
      expect(writeLog).not.toHaveBeenCalled()
    })

    it("已结算时提示", () => {
      const writeLog = vi.fn()
      const mgr = createManager(createMockDeps({ getSettled: () => true, writeLog }))
      mgr.settleCurrentRun()
      expect(writeLog).toHaveBeenCalledWith("本局已结算，请重新开局。")
    })
  })
})