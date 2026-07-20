import { describe, it, expect, vi } from "vitest"
import { AiDecisionManager } from "../../../scripts/game/ai/decision-manager"
import type { RunLog } from "../../../scripts/game/ai/decision"
import { createGameSlice, resetForNewRun } from "../../../scripts/game/core/state/game-slice"

function makeDeps(overrides: Partial<ConstructorParameters<typeof AiDecisionManager>[0]> = {}) {
  let currentRunLog: RunLog | null = null
  let runSerial = 0
  const runLogHistory: RunLog[] = []
  const renderFn = vi.fn()
  const saveFn = vi.fn()
  return {
    deps: {
      runLogHistory,
      dom: { actionLog: null, aiLogicContent: null },
      aiEngine: null,
      getRound: () => 1,
      getCurrentRunLog: () => currentRunLog,
      setCurrentRunLog: (log: RunLog) => {
        currentRunLog = log
      },
      setRunSerial: (n: number) => {
        runSerial = n
      },
      getRunSerial: () => runSerial,
      saveAiMemoryToStorage: saveFn,
      renderAiThoughtLog: renderFn,
      ...overrides,
    },
    getRunSerial: () => runSerial,
    getCurrentRunLog: () => currentRunLog,
    getRunLogHistory: () => runLogHistory,
    renderFn,
    saveFn,
  }
}

describe("AiDecisionManager", () => {
  describe("compactPanelTextForSnapshot", () => {
    it("空字符串返回空提示", () => {
      const { deps } = makeDeps()
      const manager = new AiDecisionManager(deps)
      expect(manager.compactPanelTextForSnapshot("")).toContain("空")
    })

    it("纯文本每行加缩进", () => {
      const { deps } = makeDeps()
      const manager = new AiDecisionManager(deps)
      const result = manager.compactPanelTextForSnapshot("hello\nworld")
      expect(result).toContain("    hello")
      expect(result).toContain("    world")
    })
  })

  describe("buildAiDecisionPanelSnapshot", () => {
    it("非 llm 模式返回 null", () => {
      const { deps } = makeDeps()
      const manager = new AiDecisionManager(deps)
      expect(manager.buildAiDecisionPanelSnapshot({ mode: "rule" })).toBeNull()
    })

    it("LLM 模式生成快照包含玩家信息", () => {
      const { deps } = makeDeps()
      const manager = new AiDecisionManager(deps)
      const telemetry = {
        mode: "llm",
        round: 3,
        entries: [
          {
            playerId: "ai-1",
            playerName: "左上AI",
            controlMode: "llm",
            finalBid: 5000,
            decisionSource: "llm",
            correctionAttempt: 0,
            historyMessagesCount: 0,
            crossGameMemoryCount: 0,
            inGameHistoryCount: 0,
            thought: "值这个价",
            userPrompt: "请出价",
            modelResponse: '{"bid": 5000}',
          },
        ],
      }
      const result = manager.buildAiDecisionPanelSnapshot(telemetry)
      expect(result).not.toBeNull()
      expect(result!).toContain("回合 3")
      expect(result!).toContain("左上AI")
    })

    it("注入的 aiEngine.getLastDecisionLog 被调用", () => {
      const getLastDecisionLog = vi.fn(() => ({
        entries: [
          {
            playerId: "ai-1",
            confidence: 0.8,
            archetype: "激进型",
            confidenceParts: { base: 0.5 },
            perceivedValue: 4000,
            hardCap: 6000,
          },
        ],
      }))
      const { deps } = makeDeps({ aiEngine: { getLastDecisionLog } })
      const manager = new AiDecisionManager(deps)
      const telemetry = {
        mode: "llm",
        round: 1,
        entries: [
          {
            playerId: "ai-1",
            playerName: "AI",
            controlMode: "rule-fallback-llm-failed",
            finalBid: 3000,
            decisionSource: "rule",
            correctionAttempt: 0,
            historyMessagesCount: 0,
            crossGameMemoryCount: 0,
            inGameHistoryCount: 0,
          },
        ],
      }
      const result = manager.buildAiDecisionPanelSnapshot(telemetry)
      expect(getLastDecisionLog).toHaveBeenCalled()
      expect(result).toContain("规则AI")
      expect(result).toContain("激进型")
    })
  })

  describe("beginRunTracking", () => {
    it("创建新 RunLog 并通过回调写回 runSerial/currentRunLog", () => {
      const { deps, getRunSerial, getCurrentRunLog, getRunLogHistory, saveFn, renderFn } = makeDeps()
      const manager = new AiDecisionManager(deps)
      manager.beginRunTracking()
      expect(getRunSerial()).toBe(1)
      expect(getCurrentRunLog()).not.toBeNull()
      expect(getCurrentRunLog()!.runNo).toBe(1)
      expect(getRunLogHistory()).toHaveLength(1)
      expect(saveFn).toHaveBeenCalledOnce()
      expect(renderFn).toHaveBeenCalledOnce()
    })

    it("多次调用 runNo 递增", () => {
      const { deps, getRunSerial } = makeDeps()
      const manager = new AiDecisionManager(deps)
      manager.beginRunTracking()
      manager.beginRunTracking()
      expect(getRunSerial()).toBe(2)
    })

    it("resetForNewRun 不清零 runSerial（回归：之前每局清零导致结算一直显示第0局）", () => {
      // 真实 game-slice：runSerial 跨局持久化，resetForNewRun 不应清零
      const state = createGameSlice()
      state.runSerial = 5
      resetForNewRun(state)
      // 旧代码：resetForNewRun 里 s.runSerial = 0 -> 此断言会红
      expect(state.runSerial).toBe(5)
    })

    it("startNewRun 顺序（beginRunTracking + resetForNewRun）跨局 runSerial 持续递增", () => {
      // 模拟真实 startNewRun 顺序：先 beginRunTracking 再 resetForNewRun
      const state = createGameSlice()
      const deps = {
        runLogHistory: state.runLogHistory,
        dom: { actionLog: null, aiLogicContent: null },
        aiEngine: null,
        getRound: () => 1,
        getCurrentRunLog: () => state.currentRunLog as RunLog | null,
        setCurrentRunLog: (log: RunLog) => {
          state.currentRunLog = log as never
        },
        setRunSerial: (n: number) => {
          state.runSerial = n
        },
        getRunSerial: () => state.runSerial,
        saveAiMemoryToStorage: () => {},
        renderAiThoughtLog: () => {},
      }
      const manager = new AiDecisionManager(deps)
      // 局1
      manager.beginRunTracking()
      resetForNewRun(state)
      expect(state.runSerial).toBe(1) // 旧代码：resetForNewRun 清零 -> 0 -> 红
      // 局2
      manager.beginRunTracking()
      resetForNewRun(state)
      expect(state.runSerial).toBe(2) // 旧代码：0 -> 红
    })
  })

  describe("writeLog", () => {
    it("写入 currentRunLog 的 actionLogs", () => {
      const log: RunLog = {
        runNo: 1,
        startedAt: Date.now(),
        actionLogs: [],
        aiThoughtLogs: [],
        roundLogsByRound: {},
        roundPanelTexts: {},
      }
      const { deps, renderFn } = makeDeps({
        getCurrentRunLog: () => log,
      })
      const manager = new AiDecisionManager(deps)
      manager.writeLog("测试消息")
      expect(log.actionLogs).toHaveLength(1)
      expect(log.actionLogs[0]).toContain("测试消息")
      expect(renderFn).toHaveBeenCalledOnce()
    })

    it("currentRunLog 为 null 时不崩溃", () => {
      const { deps } = makeDeps({ getCurrentRunLog: () => null })
      const manager = new AiDecisionManager(deps)
      expect(() => manager.writeLog("msg")).not.toThrow()
    })
  })

  describe("recordAiThoughtLogs", () => {
    it("非 llm 模式不记录", () => {
      const log: RunLog = {
        runNo: 1,
        startedAt: Date.now(),
        actionLogs: [],
        aiThoughtLogs: [],
        roundLogsByRound: {},
        roundPanelTexts: {},
      }
      const { deps } = makeDeps({ getCurrentRunLog: () => log })
      const manager = new AiDecisionManager(deps)
      manager.recordAiThoughtLogs({ mode: "rule" })
      expect(log.aiThoughtLogs).toHaveLength(0)
    })

    it("llm 模式有 entries 时记录到 aiThoughtLogs", () => {
      const log: RunLog = {
        runNo: 1,
        startedAt: Date.now(),
        actionLogs: [],
        aiThoughtLogs: [],
        roundLogsByRound: {},
        roundPanelTexts: {},
      }
      const { deps } = makeDeps({ getCurrentRunLog: () => log })
      const manager = new AiDecisionManager(deps)
      manager.recordAiThoughtLogs({
        mode: "llm",
        round: 1,
        entries: [{ playerName: "左上AI", thought: "思考中", controlMode: "llm" }],
      })
      expect(log.aiThoughtLogs).toHaveLength(1)
      expect((log.aiThoughtLogs[0] as any).playerName).toBe("左上AI")
    })
  })
})
