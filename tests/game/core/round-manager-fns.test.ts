import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  startRoundFn,
  startRoundTimerFn,
  stopRoundTimerFn,
  toggleRoundPauseFn,
  syncPauseButtonFn,
  resetRoundBidDisplayFn,
  resetRoundBidReadyStateFn,
  type RoundManagerDeps,
  type LanBridge,
} from "../../../scripts/game/core/round-manager-fns"
import { GAME_SETTINGS } from "../../../scripts/game/core/settings"

function makeDeps(overrides: Partial<RoundManagerDeps> = {}): RoundManagerDeps {
  const bidInput = document.createElement("input")
  const pauseRoundBtn = document.createElement("button")
  const players = [
    { id: "p1" },
    { id: "p2" },
    { id: "p3" },
  ]
  return {
    roundResolving: false,
    roundPaused: false,
    actionsLeft: 99,
    roundTimeLeft: 60,
    playerBidSubmitted: false,
    playerRoundBid: 0,
    privateIntelEntries: [],
    publicInfoEntries: [],
    aiLlmRoundPlans: {},
    aiRoundDecisionPromise: null,
    roundTimerId: null,
    _pauseSnapshotTimeLeft: null,
    roundBidReadyState: {},
    players,
    dom: { bidInput, pauseRoundBtn },
    getRound: vi.fn(() => 1),
    getIsLanMode: vi.fn(() => false),
    getLanIsHost: vi.fn(() => false),
    getSettled: vi.fn(() => false),
    getLanBridge: vi.fn(() => null),
    getTimerSpan: vi.fn(() => null),
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
}

describe("round-manager-fns", () => {
  describe("stopRoundTimerFn", () => {
    it("clears interval when timerId is set", () => {
      const clearSpy = vi.spyOn(window, "clearInterval")
      const deps = makeDeps({ roundTimerId: 42 })

      stopRoundTimerFn(deps)

      expect(clearSpy).toHaveBeenCalledWith(42)
      expect(deps.roundTimerId).toBeNull()
      clearSpy.mockRestore()
    })

    it("is no-op when timerId is null", () => {
      const clearSpy = vi.spyOn(window, "clearInterval")
      const deps = makeDeps({ roundTimerId: null })

      stopRoundTimerFn(deps)

      expect(clearSpy).not.toHaveBeenCalled()
      expect(deps.roundTimerId).toBeNull()
      clearSpy.mockRestore()
    })
  })

  describe("startRoundTimerFn", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("sets timerId via setInterval", () => {
      const deps = makeDeps()

      startRoundTimerFn(deps)

      expect(deps.roundTimerId).not.toBeNull()
    })

    it("decrements roundTimeLeft each second", () => {
      const deps = makeDeps({ roundTimeLeft: 60 })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.roundTimeLeft).toBe(59)

      vi.advanceTimersByTime(1000)

      expect(deps.roundTimeLeft).toBe(58)
    })

    it("calls updateHud each tick", () => {
      const deps = makeDeps()

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.updateHud).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1000)

      expect(deps.updateHud).toHaveBeenCalledTimes(2)
    })

    it("when roundTimeLeft hits 0, resolves bids with 'timeout'", () => {
      const deps = makeDeps({ roundTimeLeft: 1 })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.resolveRoundBids).toHaveBeenCalledWith("timeout")
    })

    it("continuously calls resolveRoundBids each tick once time reaches 0", () => {
      const deps = makeDeps({ roundTimeLeft: 0 })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(3000)

      expect(deps.resolveRoundBids).toHaveBeenCalledTimes(3)
    })

    it("when roundResolving is true, stops timer without decrementing", () => {
      const deps = makeDeps({ roundResolving: true, roundTimeLeft: 60 })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.roundTimeLeft).toBe(60)
      expect(deps.roundTimerId).toBeNull()
    })

    it("when getSettled is true, stops timer without decrementing", () => {
      const deps = makeDeps({
        getSettled: vi.fn(() => true),
        roundTimeLeft: 60,
      })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.roundTimeLeft).toBe(60)
      expect(deps.roundTimerId).toBeNull()
    })

    it("when roundPaused is true, does not decrement time", () => {
      const deps = makeDeps({ roundPaused: true, roundTimeLeft: 60 })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.roundTimeLeft).toBe(60)
    })

    it("roundPaused does not call updateHud", () => {
      const deps = makeDeps({ roundPaused: true })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.updateHud).not.toHaveBeenCalled()
    })

    it("LAN mode: when time runs out, calls writeLog instead of resolveRoundBids", () => {
      const deps = makeDeps({
        roundTimeLeft: 1,
        getIsLanMode: vi.fn(() => true),
        getLanBridge: vi.fn(() => ({ togglePause: vi.fn() })),
      })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.writeLog).toHaveBeenCalledWith("联机模式：回合时间到，等待主机结算")
      expect(deps.resolveRoundBids).not.toHaveBeenCalled()
    })

    it("LAN mode without bridge falls through to resolveRoundBids", () => {
      const deps = makeDeps({
        roundTimeLeft: 1,
        getIsLanMode: vi.fn(() => true),
        getLanBridge: vi.fn(() => null),
      })

      startRoundTimerFn(deps)
      vi.advanceTimersByTime(1000)

      expect(deps.resolveRoundBids).toHaveBeenCalledWith("timeout")
    })

    it("stops previous timer before starting a new one", () => {
      const clearSpy = vi.spyOn(window, "clearInterval")
      const deps = makeDeps({ roundTimerId: 99 })

      startRoundTimerFn(deps)

      expect(clearSpy).toHaveBeenCalledWith(99)
      clearSpy.mockRestore()
    })
  })

  describe("startRoundFn", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("initializes all state properties", () => {
      const deps = makeDeps({
        roundResolving: true,
        roundPaused: true,
        actionsLeft: 0,
        roundTimeLeft: 0,
        playerBidSubmitted: true,
        playerRoundBid: 500,
        privateIntelEntries: [{ some: "data" }] as unknown[],
        publicInfoEntries: [{ some: "data" }] as unknown[],
        aiLlmRoundPlans: { plan1: "data" },
        aiRoundDecisionPromise: Promise.resolve(),
      })

      startRoundFn(deps)

      expect(deps.roundResolving).toBe(false)
      expect(deps.roundPaused).toBe(false)
      expect(deps.actionsLeft).toBe(GAME_SETTINGS.actionsPerRound)
      expect(deps.roundTimeLeft).toBe(GAME_SETTINGS.roundSeconds)
      expect(deps.playerBidSubmitted).toBe(false)
      expect(deps.playerRoundBid).toBe(0)
      expect(deps.privateIntelEntries.length).toBe(0)
      expect(deps.publicInfoEntries.length).toBe(0)
      expect(deps.aiLlmRoundPlans).toEqual({})
      expect(deps.aiRoundDecisionPromise).toBeNull()
    })

    it("calls clearCurrentRoundUsage and resetAiRoundResources", () => {
      const deps = makeDeps()

      startRoundFn(deps)

      expect(deps.clearCurrentRoundUsage).toHaveBeenCalled()
      expect(deps.resetAiRoundResources).toHaveBeenCalled()
    })

    it("calls closeBidKeypad", () => {
      const deps = makeDeps()

      startRoundFn(deps)

      expect(deps.closeBidKeypad).toHaveBeenCalled()
    })

    it("calls kickoffAiRoundDecisions in non-LAN mode", () => {
      const deps = makeDeps({
        getIsLanMode: vi.fn(() => false),
      })

      startRoundFn(deps)

      expect(deps.kickoffAiRoundDecisions).toHaveBeenCalled()
    })

    it("calls kickoffAiRoundDecisions for LAN host", () => {
      const deps = makeDeps({
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => true),
      })

      startRoundFn(deps)

      expect(deps.kickoffAiRoundDecisions).toHaveBeenCalled()
    })

    it("does not call kickoffAiRoundDecisions for LAN non-host", () => {
      const deps = makeDeps({
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => false),
      })

      startRoundFn(deps)

      expect(deps.kickoffAiRoundDecisions).not.toHaveBeenCalled()
    })

    it("sets bidInput value and placeholder for round 1", () => {
      const deps = makeDeps({
        getRound: vi.fn(() => 1),
      })

      startRoundFn(deps)

      expect(deps.dom.bidInput?.value).toBe("")
      expect(deps.dom.bidInput?.placeholder).toBe("点击出价")
    })

    it("sets bidInput value and placeholder for round 2+", () => {
      const deps = makeDeps({
        getRound: vi.fn(() => 2),
      })

      startRoundFn(deps)

      expect(deps.dom.bidInput?.value).toBe("0")
      expect(deps.dom.bidInput?.placeholder).toBe("")
    })

    it("does not crash when bidInput is null", () => {
      const deps = makeDeps({
        dom: { bidInput: null, pauseRoundBtn: document.createElement("button") },
      })

      expect(() => startRoundFn(deps)).not.toThrow()
    })

    it("resets roundBidReadyState via resetRoundBidReadyStateFn", () => {
      const deps = makeDeps({
        roundBidReadyState: { p1: true, p2: false, p3: true },
      })

      startRoundFn(deps)

      expect(deps.roundBidReadyState).toEqual({
        p1: false,
        p2: false,
        p3: false,
      })
    })

    it("calls setPlayerBidReady for each player", () => {
      const deps = makeDeps()

      startRoundFn(deps)

      expect(deps.setPlayerBidReady).toHaveBeenCalledTimes(3)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p1", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p2", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p3", false)
    })

    it("starts the round timer", () => {
      const deps = makeDeps()

      startRoundFn(deps)

      expect(deps.roundTimerId).not.toBeNull()
    })

    it("syncs pause button to unpaused state", () => {
      const deps = makeDeps({ roundPaused: true })

      startRoundFn(deps)

      expect(deps.dom.pauseRoundBtn?.innerHTML).not.toContain("继续回合")
    })
  })

  describe("toggleRoundPauseFn", () => {
    it("toggles roundPaused from false to true", () => {
      const deps = makeDeps({ roundPaused: false })

      toggleRoundPauseFn(deps)

      expect(deps.roundPaused).toBe(true)
    })

    it("toggles roundPaused from true to false", () => {
      const deps = makeDeps({ roundPaused: true })

      toggleRoundPauseFn(deps)

      expect(deps.roundPaused).toBe(false)
    })

    it("snapshots roundTimeLeft when pausing", () => {
      const deps = makeDeps({ roundPaused: false, roundTimeLeft: 42 })

      toggleRoundPauseFn(deps)

      expect(deps._pauseSnapshotTimeLeft).toBe(42)
    })

    it("restores roundTimeLeft from snapshot when resuming", () => {
      const deps = makeDeps({
        roundPaused: true,
        roundTimeLeft: 10,
        _pauseSnapshotTimeLeft: 42,
      })

      toggleRoundPauseFn(deps)

      expect(deps.roundTimeLeft).toBe(42)
      expect(deps._pauseSnapshotTimeLeft).toBeNull()
    })

    it("calls syncPauseButtonFn, updateHud, and writeLog on pause", () => {
      const deps = makeDeps({ roundPaused: false })

      toggleRoundPauseFn(deps)

      expect(deps.updateHud).toHaveBeenCalled()
      expect(deps.writeLog).toHaveBeenCalledWith(
        "回合已暂停：计时冻结，可查看日志与AI面板。"
      )
    })

    it("calls syncPauseButtonFn, updateHud, and writeLog on resume", () => {
      const deps = makeDeps({ roundPaused: true })

      toggleRoundPauseFn(deps)

      expect(deps.updateHud).toHaveBeenCalled()
      expect(deps.writeLog).toHaveBeenCalledWith("回合已继续：计时恢复。")
    })

    it("LAN non-host returns early without toggling", () => {
      const deps = makeDeps({
        roundPaused: false,
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => false),
      })

      toggleRoundPauseFn(deps)

      expect(deps.roundPaused).toBe(false)
      expect(deps.updateHud).not.toHaveBeenCalled()
      expect(deps.writeLog).not.toHaveBeenCalled()
    })

    it("settled game returns early", () => {
      const deps = makeDeps({
        roundPaused: false,
        getSettled: vi.fn(() => true),
      })

      toggleRoundPauseFn(deps)

      expect(deps.roundPaused).toBe(false)
      expect(deps.updateHud).not.toHaveBeenCalled()
    })

    it("resolving game returns early", () => {
      const deps = makeDeps({
        roundPaused: false,
        roundResolving: true,
      })

      toggleRoundPauseFn(deps)

      expect(deps.roundPaused).toBe(false)
      expect(deps.updateHud).not.toHaveBeenCalled()
    })

    it("LAN mode: shows overlay and notifies bridge when pausing", () => {
      const bridge: LanBridge = { togglePause: vi.fn() }
      const deps = makeDeps({
        roundPaused: false,
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => true),
        getLanBridge: vi.fn(() => bridge),
      })

      toggleRoundPauseFn(deps)

      expect(deps.showLanPauseOverlay).toHaveBeenCalled()
      expect(deps.hideLanPauseOverlay).not.toHaveBeenCalled()
      expect(bridge.togglePause).toHaveBeenCalledWith(true, 60)
    })

    it("LAN mode: hides overlay and notifies bridge when resuming", () => {
      const bridge: LanBridge = { togglePause: vi.fn() }
      const deps = makeDeps({
        roundPaused: true,
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => true),
        getLanBridge: vi.fn(() => bridge),
      })

      toggleRoundPauseFn(deps)

      expect(deps.hideLanPauseOverlay).toHaveBeenCalled()
      expect(deps.showLanPauseOverlay).not.toHaveBeenCalled()
      expect(bridge.togglePause).toHaveBeenCalledWith(false, expect.any(Number))
    })

    it("LAN mode: does not crash when bridge is null", () => {
      const deps = makeDeps({
        roundPaused: false,
        getIsLanMode: vi.fn(() => true),
        getLanIsHost: vi.fn(() => true),
        getLanBridge: vi.fn(() => null),
      })

      expect(() => toggleRoundPauseFn(deps)).not.toThrow()
    })
  })

  describe("syncPauseButtonFn", () => {
    it("updates pauseRoundBtn innerHTML with pause icon when not paused", () => {
      const deps = makeDeps({ roundPaused: false })

      syncPauseButtonFn(deps)

      expect(deps.dom.pauseRoundBtn?.innerHTML).toContain("pause-button.svg")
      expect(deps.dom.pauseRoundBtn?.innerHTML).toContain("暂停回合")
    })

    it("updates pauseRoundBtn innerHTML with play icon when paused", () => {
      const deps = makeDeps({ roundPaused: true })

      syncPauseButtonFn(deps)

      expect(deps.dom.pauseRoundBtn?.innerHTML).toContain("play-button.svg")
      expect(deps.dom.pauseRoundBtn?.innerHTML).toContain("继续回合")
    })

    it("toggles is-paused class based on roundPaused state", () => {
      const deps = makeDeps({ roundPaused: false })

      syncPauseButtonFn(deps)
      expect(deps.dom.pauseRoundBtn?.classList.contains("is-paused")).toBe(false)
    })

    it("adds is-paused class when paused", () => {
      const deps = makeDeps({ roundPaused: true })

      syncPauseButtonFn(deps)
      expect(deps.dom.pauseRoundBtn?.classList.contains("is-paused")).toBe(true)
    })

    it("is no-op when pauseRoundBtn is null", () => {
      const deps = makeDeps({
        dom: { bidInput: document.createElement("input"), pauseRoundBtn: null },
      })

      expect(() => syncPauseButtonFn(deps)).not.toThrow()
    })
  })

  describe("resetRoundBidDisplayFn", () => {
    afterEach(() => {
      document.body.innerHTML = ""
    })

    it("resets textContent for each player's bid element to '待公布'", () => {
      const deps = makeDeps()
      for (const player of deps.players) {
        const el = document.createElement("span")
        el.id = `bid-${player.id}`
        el.textContent = "旧出价"
        document.body.appendChild(el)
      }

      resetRoundBidDisplayFn(deps)

      for (const player of deps.players) {
        const el = document.getElementById(`bid-${player.id}`)
        expect(el?.textContent).toBe("待公布")
      }
    })

    it("removes reveal/winner/runner/bid-pop/bid-ready classes from playerCard elements", () => {
      const deps = makeDeps()
      const classesToRemove = ["revealed", "winner", "runner", "bid-pop", "bid-ready"]
      for (const player of deps.players) {
        const el = document.createElement("div")
        el.id = `playerCard-${player.id}`
        el.classList.add(...classesToRemove)
        el.classList.add("some-other-class")
        document.body.appendChild(el)
      }

      resetRoundBidDisplayFn(deps)

      for (const player of deps.players) {
        const el = document.getElementById(`playerCard-${player.id}`)
        for (const cls of classesToRemove) {
          expect(el?.classList.contains(cls)).toBe(false)
        }
        expect(el?.classList.contains("some-other-class")).toBe(true)
      }
    })

    it("does not crash when bid elements do not exist (jsdom returns null)", () => {
      const deps = makeDeps()
      document.body.innerHTML = ""

      expect(() => resetRoundBidDisplayFn(deps)).not.toThrow()
    })

    it("does not crash when playerCard elements do not exist", () => {
      const deps = makeDeps()
      document.body.innerHTML = ""

      expect(() => resetRoundBidDisplayFn(deps)).not.toThrow()
    })

    it("only modifies elements that exist, skips missing ones", () => {
      const deps = makeDeps()
      const bidEl = document.createElement("span")
      bidEl.id = `bid-${deps.players[0].id}`
      bidEl.textContent = "旧出价"
      document.body.appendChild(bidEl)

      resetRoundBidDisplayFn(deps)

      expect(document.getElementById(`bid-${deps.players[0].id}`)?.textContent).toBe("待公布")
      expect(document.getElementById(`bid-${deps.players[1].id}`)).toBeNull()
      expect(document.getElementById(`playerCard-${deps.players[0].id}`)).toBeNull()
    })
  })

  describe("resetRoundBidReadyStateFn", () => {
    it("resets roundBidReadyState with all players set to false", () => {
      const deps = makeDeps({
        roundBidReadyState: { p1: true, p2: false, p3: true },
      })

      resetRoundBidReadyStateFn(deps)

      expect(deps.roundBidReadyState).toEqual({
        p1: false,
        p2: false,
        p3: false,
      })
    })

    it("calls setPlayerBidReady for each player with false", () => {
      const deps = makeDeps()

      resetRoundBidReadyStateFn(deps)

      expect(deps.setPlayerBidReady).toHaveBeenCalledTimes(3)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p1", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p2", false)
      expect(deps.setPlayerBidReady).toHaveBeenCalledWith("p3", false)
    })

    it("overwrites the entire roundBidReadyState object", () => {
      const deps = makeDeps({
        roundBidReadyState: { extraKey: true },
      })

      resetRoundBidReadyStateFn(deps)

      expect(deps.roundBidReadyState).not.toHaveProperty("extraKey")
    })
  })
})