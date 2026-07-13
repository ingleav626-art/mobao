import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  RoundManager,
  type RoundManagerDeps,
} from "../../../scripts/game/core/round-manager-class"
import { GAME_SETTINGS } from "../../../scripts/game/core/settings"

/** 构建完整 mock 依赖 */
function makeDeps(overrides: Partial<RoundManagerDeps> = {}): RoundManagerDeps {
  const state = {
    roundResolving: false,
    roundPaused: false,
    actionsLeft: 99,
    roundTimeLeft: 60,
    playerBidSubmitted: false,
    playerRoundBid: 0,
    privateIntelEntries: [] as Array<unknown>,
    publicInfoEntries: [] as Array<unknown>,
    aiLlmRoundPlans: {} as Record<string, unknown>,
    aiRoundDecisionPromise: null as Promise<void> | null,
    roundTimerId: null as number | null,
    _pauseSnapshotTimeLeft: null as number | null,
    roundBidReadyState: {} as Record<string, boolean>,
    players: [] as Array<{ id: string }>,
    dom: {
      bidInput: null as HTMLInputElement | null,
      pauseRoundBtn: null as HTMLElement | null,
    },
  }

  const deps: RoundManagerDeps = {
    // 可变状态
    get roundResolving() { return state.roundResolving },
    set roundResolving(v: boolean) { state.roundResolving = v },
    get roundPaused() { return state.roundPaused },
    set roundPaused(v: boolean) { state.roundPaused = v },
    get actionsLeft() { return state.actionsLeft },
    set actionsLeft(v: number) { state.actionsLeft = v },
    get roundTimeLeft() { return state.roundTimeLeft },
    set roundTimeLeft(v: number) { state.roundTimeLeft = v },
    get playerBidSubmitted() { return state.playerBidSubmitted },
    set playerBidSubmitted(v: boolean) { state.playerBidSubmitted = v },
    get playerRoundBid() { return state.playerRoundBid },
    set playerRoundBid(v: number) { state.playerRoundBid = v },
    get privateIntelEntries() { return state.privateIntelEntries },
    set privateIntelEntries(v: Array<unknown>) { state.privateIntelEntries = v },
    get publicInfoEntries() { return state.publicInfoEntries },
    set publicInfoEntries(v: Array<unknown>) { state.publicInfoEntries = v },
    get aiLlmRoundPlans() { return state.aiLlmRoundPlans },
    set aiLlmRoundPlans(v: Record<string, unknown>) { state.aiLlmRoundPlans = v },
    get aiRoundDecisionPromise() { return state.aiRoundDecisionPromise },
    set aiRoundDecisionPromise(v: Promise<void> | null) { state.aiRoundDecisionPromise = v },
    get roundTimerId() { return state.roundTimerId },
    set roundTimerId(v: number | null) { state.roundTimerId = v },
    get _pauseSnapshotTimeLeft() { return state._pauseSnapshotTimeLeft },
    set _pauseSnapshotTimeLeft(v: number | null) { state._pauseSnapshotTimeLeft = v },
    get roundBidReadyState() { return state.roundBidReadyState },
    set roundBidReadyState(v: Record<string, boolean>) { state.roundBidReadyState = v },
    get players() { return state.players },
    set players(v: Array<{ id: string }>) { state.players = v },
    get dom() { return state.dom },
    set dom(v: { bidInput: HTMLInputElement | null; pauseRoundBtn: HTMLElement | null }) { state.dom = v },

    // 只读 getter
    getRound: () => 1,
    getIsLanMode: () => false,
    getLanIsHost: () => false,
    getSettled: () => false,
    getLanBridge: () => null,
    getTimerSpan: () => null,

    // 外部回调（mock）
    clearCurrentRoundUsage: vi.fn(),
    resetAiRoundResources: vi.fn(),
    closeBidKeypad: vi.fn(),
    kickoffAiRoundDecisions: vi.fn(),
    updateHud: vi.fn(),
    writeLog: vi.fn(),
    resolveRoundBids: vi.fn(),
    showLanPauseOverlay: vi.fn(),
    hideLanPauseOverlay: vi.fn(),
    setPlayerBidReady: vi.fn(),

    ...overrides,
  }

  return deps
}

describe("RoundManager", () => {
  let manager: RoundManager
  let deps: RoundManagerDeps

  beforeEach(() => {
    deps = makeDeps()
    manager = new RoundManager(deps)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("startRound", () => {
    it("重置所有回合状态", () => {
      deps.roundResolving = true
      deps.roundPaused = true
      deps.actionsLeft = 0
      deps.roundTimeLeft = 10
      deps.playerBidSubmitted = true
      deps.playerRoundBid = 500
      deps.privateIntelEntries = [{ source: "test", text: "old" }]
      deps.publicInfoEntries = [{ source: "test", text: "old" }]
      deps.aiLlmRoundPlans = { p1: {} }
      deps.aiRoundDecisionPromise = Promise.resolve()

      manager.startRound()

      expect(deps.roundResolving).toBe(false)
      expect(deps.roundPaused).toBe(false)
      expect(deps.actionsLeft).toBe(GAME_SETTINGS.actionsPerRound)
      expect(deps.roundTimeLeft).toBe(GAME_SETTINGS.roundSeconds)
      expect(deps.playerBidSubmitted).toBe(false)
      expect(deps.playerRoundBid).toBe(0)
      expect(deps.privateIntelEntries).toHaveLength(0)
      expect(deps.publicInfoEntries).toHaveLength(0)
      expect(deps.aiLlmRoundPlans).toEqual({})
      expect(deps.aiRoundDecisionPromise).toBeNull()
    })

    it("清空面板并重置资源", () => {
      manager.startRound()
      expect(deps.clearCurrentRoundUsage).toHaveBeenCalledOnce()
      expect(deps.resetAiRoundResources).toHaveBeenCalledOnce()
      expect(deps.closeBidKeypad).toHaveBeenCalledOnce()
    })

    it("第一回合时 bidInput 置空占位符", () => {
      deps.dom.bidInput = document.createElement("input")
      manager.startRound()
      expect(deps.dom.bidInput.value).toBe("")
      expect(deps.dom.bidInput.placeholder).toBe("点击出价")
    })

    it("非第一回合时 bidInput 显示 0", () => {
      deps.getRound = () => 2
      deps.dom.bidInput = document.createElement("input")
      manager.startRound()
      expect(deps.dom.bidInput.value).toBe("0")
      expect(deps.dom.bidInput.placeholder).toBe("")
    })

    it("同步暂停按钮并启动计时器", () => {
      deps.dom.pauseRoundBtn = document.createElement("div")
      manager.startRound()
      expect(deps.roundTimerId).not.toBeNull()
    })

    it("单机模式调用 kickoffAiRoundDecisions", () => {
      manager.startRound()
      expect(deps.kickoffAiRoundDecisions).toHaveBeenCalledOnce()
    })

    it("联机主机模式调用 kickoffAiRoundDecisions", () => {
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => true
      manager.startRound()
      expect(deps.kickoffAiRoundDecisions).toHaveBeenCalledOnce()
    })

    it("联机非主机模式跳过 kickoffAiRoundDecisions", () => {
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => false
      manager.startRound()
      expect(deps.kickoffAiRoundDecisions).not.toHaveBeenCalled()
    })
  })

  describe("startRoundTimer", () => {
    it("每秒递减 roundTimeLeft", () => {
      deps.roundTimeLeft = 10
      manager.startRoundTimer()
      expect(deps.roundTimeLeft).toBe(10)
      vi.advanceTimersByTime(1000)
      expect(deps.roundTimeLeft).toBe(9)
      vi.advanceTimersByTime(1000)
      expect(deps.roundTimeLeft).toBe(8)
    })

    it("递减到触发 updateHud", () => {
      manager.startRoundTimer()
      vi.advanceTimersByTime(1000)
      expect(deps.updateHud).toHaveBeenCalledOnce()
    })

    it("回合计满时调用 resolveRoundBids(timeout)", () => {
      deps.roundTimeLeft = 1
      manager.startRoundTimer()
      vi.advanceTimersByTime(1000)
      expect(deps.resolveRoundBids).toHaveBeenCalledWith("timeout")
    })

    it("roundResolving 时停止计时器", () => {
      manager.startRoundTimer()
      deps.roundResolving = true
      vi.advanceTimersByTime(1000)
      expect(deps.roundTimerId).toBeNull()
    })

    it("settled 时停止计时器", () => {
      deps.getSettled = () => true
      manager.startRoundTimer()
      vi.advanceTimersByTime(1000)
      expect(deps.roundTimerId).toBeNull()
    })

    it("roundPaused 时不递减", () => {
      deps.roundTimeLeft = 10
      deps.roundPaused = true
      manager.startRoundTimer()
      vi.advanceTimersByTime(5000)
      expect(deps.roundTimeLeft).toBe(10)
    })

    it("联机模式超时时写日志不结算", () => {
      deps.getIsLanMode = () => true
      deps.getLanBridge = () => ({ togglePause: vi.fn() })
      deps.roundTimeLeft = 1
      manager.startRoundTimer()
      vi.advanceTimersByTime(1000)
      expect(deps.resolveRoundBids).not.toHaveBeenCalled()
      expect(deps.writeLog).toHaveBeenCalledWith("联机模式：回合时间到，等待主机结算")
    })

    it("先停止已有计时器再启动新的", () => {
      deps.roundTimerId = 12345 as unknown as number
      const clearSpy = vi.spyOn(window, "clearInterval")
      manager.startRoundTimer()
      expect(clearSpy).toHaveBeenCalledWith(12345)
    })
  })

  describe("stopRoundTimer", () => {
    it("清除计时器 ID 并置 null", () => {
      deps.roundTimerId = 42
      const clearSpy = vi.spyOn(window, "clearInterval")
      manager.stopRoundTimer()
      expect(clearSpy).toHaveBeenCalledWith(42)
      expect(deps.roundTimerId).toBeNull()
    })

    it("roundTimerId 为 null 时不做任何事", () => {
      deps.roundTimerId = null
      const clearSpy = vi.spyOn(window, "clearInterval")
      manager.stopRoundTimer()
      expect(clearSpy).not.toHaveBeenCalled()
    })
  })

  describe("toggleRoundPause", () => {
    it("切换 roundPaused 状态", () => {
      expect(deps.roundPaused).toBe(false)
      manager.toggleRoundPause()
      expect(deps.roundPaused).toBe(true)
      manager.toggleRoundPause()
      expect(deps.roundPaused).toBe(false)
    })

    it("暂停时快照 roundTimeLeft", () => {
      deps.roundTimeLeft = 35
      manager.toggleRoundPause()
      expect(deps._pauseSnapshotTimeLeft).toBe(35)
    })

    it("恢复时从快照恢复 roundTimeLeft", () => {
      deps.roundTimeLeft = 35
      deps._pauseSnapshotTimeLeft = 35
      deps.roundPaused = true
      manager.toggleRoundPause()
      expect(deps.roundTimeLeft).toBe(35)
      expect(deps._pauseSnapshotTimeLeft).toBeNull()
    })

    it("联机非主机模式忽略", () => {
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => false
      manager.toggleRoundPause()
      expect(deps.roundPaused).toBe(false)
    })

    it("settled 时忽略", () => {
      deps.getSettled = () => true
      manager.toggleRoundPause()
      expect(deps.roundPaused).toBe(false)
    })

    it("roundResolving 时忽略", () => {
      deps.roundResolving = true
      manager.toggleRoundPause()
      expect(deps.roundPaused).toBe(false)
    })

    it("同步暂停按钮 UI", () => {
      deps.dom.pauseRoundBtn = document.createElement("div")
      manager.toggleRoundPause()
      expect(deps.dom.pauseRoundBtn.innerHTML).toContain("play-button")
      expect(deps.dom.pauseRoundBtn.classList.contains("is-paused")).toBe(true)
    })

    it("调用 updateHud", () => {
      manager.toggleRoundPause()
      expect(deps.updateHud).toHaveBeenCalledOnce()
    })

    it("写暂停/恢复日志", () => {
      manager.toggleRoundPause()
      expect(deps.writeLog).toHaveBeenCalledWith("回合已暂停：计时冻结，可查看日志与AI面板。")
      manager.toggleRoundPause()
      expect(deps.writeLog).toHaveBeenCalledWith("回合已继续：计时恢复。")
    })

    it("联机暂停时调用 showLanPauseOverlay", () => {
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => true
      manager.toggleRoundPause()
      expect(deps.showLanPauseOverlay).toHaveBeenCalledOnce()
    })

    it("联机恢复时调用 hideLanPauseOverlay", () => {
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => true
      deps.roundPaused = true
      manager.toggleRoundPause()
      expect(deps.hideLanPauseOverlay).toHaveBeenCalledOnce()
    })

    it("联机时通过 lanBridge 同步暂停状态", () => {
      const togglePause = vi.fn()
      deps.getLanBridge = () => ({ togglePause })
      deps.getIsLanMode = () => true
      deps.getLanIsHost = () => true
      manager.toggleRoundPause()
      expect(togglePause).toHaveBeenCalledWith(true, deps.roundTimeLeft)
    })
  })

  describe("syncPauseButton", () => {
    it("pauseRoundBtn 为 null 时提前返回", () => {
      deps.dom.pauseRoundBtn = null
      expect(() => manager.syncPauseButton()).not.toThrow()
    })

    it("roundPaused 时显示播放图标", () => {
      deps.roundPaused = true
      deps.dom.pauseRoundBtn = document.createElement("div")
      manager.syncPauseButton()
      expect(deps.dom.pauseRoundBtn.innerHTML).toContain("play-button")
      expect(deps.dom.pauseRoundBtn.classList.contains("is-paused")).toBe(true)
    })

    it("非暂停时显示暂停图标", () => {
      deps.roundPaused = false
      deps.dom.pauseRoundBtn = document.createElement("div")
      manager.syncPauseButton()
      expect(deps.dom.pauseRoundBtn.innerHTML).toContain("pause-button")
      expect(deps.dom.pauseRoundBtn.classList.contains("is-paused")).toBe(false)
    })
  })

  describe("resetRoundBidDisplay", () => {
    it("重置所有玩家的出价显示和卡片状态", () => {
      deps.players = [{ id: "p1" }, { id: "p2" }]
      document.body.innerHTML = `
        <div id="bid-p1">100</div>
        <div id="playerCard-p1" class="revealed winner"></div>
        <div id="bid-p2">200</div>
        <div id="playerCard-p2" class="bid-ready"></div>
      `
      manager.resetRoundBidDisplay()
      expect(document.getElementById("bid-p1")!.textContent).toBe("待公布")
      expect(document.getElementById("bid-p2")!.textContent).toBe("待公布")
      expect(document.getElementById("playerCard-p1")!.classList.contains("revealed")).toBe(false)
      expect(document.getElementById("playerCard-p1")!.classList.contains("winner")).toBe(false)
      expect(document.getElementById("playerCard-p2")!.classList.contains("bid-ready")).toBe(false)
    })
  })

  describe("resetRoundBidReadyState", () => {
    it("重置 roundBidReadyState 并调用 setPlayerBidReady", () => {
      deps.players = [{ id: "p1" }, { id: "p2" }]
      deps.roundBidReadyState = { p1: true, p2: false }
      manager.resetRoundBidReadyState()
      expect(deps.roundBidReadyState).toEqual({ p1: false, p2: false })
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p1", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p2", false)
    })
  })

  describe("跨方法集成", () => {
    it("startRound 重置 roundBidReadyState 并调用 setPlayerBidReady", () => {
      deps.players = [{ id: "p1" }, { id: "p2" }]
      deps.roundBidReadyState = { p1: true, p2: true }
      manager.startRound()
      expect(deps.roundBidReadyState).toEqual({ p1: false, p2: false })
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p1", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p2", false)
    })

    it("startRound 启动计时器，超时后调用 resolveRoundBids", () => {
      manager.startRound()
      // startRound 重置 roundTimeLeft 为 GAME_SETTINGS.roundSeconds，需拨动足够时间
      vi.advanceTimersByTime(GAME_SETTINGS.roundSeconds * 1000)
      expect(deps.resolveRoundBids).toHaveBeenCalledWith("timeout")
    })

    it("toggleRoundPause 暂停后计时器不递减", () => {
      deps.roundTimeLeft = 10
      manager.startRound()
      // startRound 重置 roundTimeLeft 为 GAME_SETTINGS.roundSeconds
      const initialTime = deps.roundTimeLeft
      manager.toggleRoundPause()
      vi.advanceTimersByTime(5000)
      expect(deps.roundTimeLeft).toBe(initialTime)
    })

    it("toggleRoundPause 恢复后计时器继续递减", () => {
      deps.roundTimeLeft = 10
      manager.startRound()
      // startRound 重置 roundTimeLeft 为 GAME_SETTINGS.roundSeconds
      const initialTime = deps.roundTimeLeft
      manager.toggleRoundPause() // pause
      vi.advanceTimersByTime(3000)
      expect(deps.roundTimeLeft).toBe(initialTime)
      manager.toggleRoundPause() // resume
      vi.advanceTimersByTime(2000)
      expect(deps.roundTimeLeft).toBe(initialTime - 2)
    })
  })
})