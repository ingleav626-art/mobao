import { describe, it, expect, vi } from "vitest"
import {
  AiReflectionManager,
  type AiReflectionManagerDeps,
  type ReflectionStatus,
  type ReflectionLlmProvider,
  type ReflectionChatResult,
  type ReflectionRecord,
} from "../../../scripts/game/ai/reflection-manager"
import type { CrossGameMemory } from "../../../scripts/game/ai/reflection"
import type { RunLog } from "../../../scripts/game/ai/decision"

function makeReflectionStatus(): ReflectionStatus {
  return {
    state: "",
    detail: "",
    completed: 0,
    total: 0,
    beforeUnloadHandler: null,
  }
}

function makeCrossGameMemory(): CrossGameMemory {
  return {
    stats: {
      totalGames: 0,
      warehouseValueMax: 0,
      warehouseValueMin: 0,
      warehouseValueAvg: 0,
      winRate: 0,
      avgProfit: 0,
      totalCellsMax: 0,
      totalCellsMin: 0,
      totalCellsAvg: 0,
      totalItemsMax: 0,
      totalItemsMin: 0,
      totalItemsAvg: 0,
      legendaryMax: 0,
      legendaryMin: 0,
      legendaryAvg: 0,
      rareMax: 0,
      rareMin: 0,
      rareAvg: 0,
    },
    lessons: [],
    strategies: [],
    praises: [],
  }
}

function makeRunLog(): RunLog {
  return {
    runNo: 1,
    startedAt: Date.now(),
    actionLogs: [],
    aiThoughtLogs: [],
    roundLogsByRound: {},
    roundPanelTexts: {},
  }
}

function makeRecord(overrides: Partial<ReflectionRecord> = {}): ReflectionRecord {
  return {
    winnerId: "ai-1",
    result: "ai-1 拍下",
    warehouseValue: 500000,
    totalCells: 20,
    totalItems: 10,
    qualityCounts: { poor: 2, normal: 3, fine: 2, rare: 2, legendary: 1 },
    winnerProfit: 50000,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<AiReflectionManagerDeps> = {}): AiReflectionManagerDeps {
  const crossGameMemory: Record<string, CrossGameMemory> = {}
  const pendingNextRunAiSummaryByPlayer: Record<string, string> = {}
  let pendingSettlementSummary = ""
  let battleRecordReplayActive = false
  let battleRecordReplayRecordId: string | null = null
  let currentRunLog: RunLog | null = null
  const aiCrossGameMessagesByPlayer: Record<string, unknown[][]> = {}

  return {
    getLlmSettings: () => ({ reflectionEnabled: true }),
    canUseLlmDecision: () => true,
    canUseLlmDecisionForPlayer: (_p: string) => true,
    getLlmProvider: () => null,
    llmEverUsedThisRun: () => true,
    isLanMode: () => false,
    getCurrentRunLog: () => currentRunLog,
    getAiCrossGameMemory: () => crossGameMemory,
    getAiCrossGameMessagesByPlayer: () => aiCrossGameMessagesByPlayer,
    getAiConversationCache: () => null,
    getPendingNextRunAiSummaryByPlayer: () => pendingNextRunAiSummaryByPlayer,
    getPendingSettlementSummary: () => pendingSettlementSummary,
    getBattleRecordReplayActive: () => battleRecordReplayActive,
    getBattleRecordReplayRecordId: () => battleRecordReplayRecordId,
    setPendingSettlementSummary: (v: string) => {
      pendingSettlementSummary = v
    },
    setBattleRecordReplayActive: (v: boolean) => {
      battleRecordReplayActive = v
    },
    setBattleRecordReplayRecordId: (v: string | null) => {
      battleRecordReplayRecordId = v
    },
    players: [
      { id: "human", name: "玩家", isHuman: true, isAI: false, avatar: "你" } as never,
      { id: "ai-1", name: "左上AI", isHuman: false, isAI: true, avatar: "A1" } as never,
    ],
    reflectionStatus: makeReflectionStatus(),
    ensureAiCrossGameMemory: (pid: string) => {
      if (!crossGameMemory[pid]) {
        crossGameMemory[pid] = makeCrossGameMemory()
      }
      return crossGameMemory[pid]
    },
    saveAiMemoryToStorage: () => {},
    updateReflectionStatusUI: () => {},
    renderAiThoughtLog: () => {},
    isAiMultiGameMemoryEnabled: () => true,
    exitSettlementPage: () => {},
    startNewRun: () => {},
    enterLobby: () => {},
    enterLanRoom: () => {},
    openBattleRecordPanel: () => {},
    writeLog: (_text: string) => {},
    ...overrides,
  }
}

/** 创建 mock LLM Provider */
function makeMockProvider(
  response: ReflectionChatResult,
): ReflectionLlmProvider & { requestChat: ReturnType<typeof vi.fn> } {
  return {
    id: "mock",
    requestChat: vi.fn().mockResolvedValue(response),
  }
}

describe("AiReflectionManager", () => {
  describe("isAiReflectionEnabled", () => {
    it("reflectionEnabled 为 true 时返回 true", () => {
      const deps = makeDeps({ getLlmSettings: () => ({ reflectionEnabled: true }) })
      const manager = new AiReflectionManager(deps)
      expect(manager.isAiReflectionEnabled()).toBe(true)
    })

    it("reflectionEnabled 为 false 时返回 false", () => {
      const deps = makeDeps({ getLlmSettings: () => ({ reflectionEnabled: false }) })
      const manager = new AiReflectionManager(deps)
      expect(manager.isAiReflectionEnabled()).toBe(false)
    })

    it("settings 为 null 时返回 false", () => {
      const deps = makeDeps({ getLlmSettings: () => null })
      const manager = new AiReflectionManager(deps)
      expect(manager.isAiReflectionEnabled()).toBe(false)
    })
  })

  describe("shouldShowReflectionUI", () => {
    it("所有条件满足时返回 true", () => {
      const deps = makeDeps()
      const manager = new AiReflectionManager(deps)
      expect(manager.shouldShowReflectionUI()).toBe(true)
    })

    it("canUseLlmDecision 为 false 时返回 false", () => {
      const deps = makeDeps({ canUseLlmDecision: () => false })
      const manager = new AiReflectionManager(deps)
      expect(manager.shouldShowReflectionUI()).toBe(false)
    })

    it("llmEverUsedThisRun 为 false 时返回 false", () => {
      const deps = makeDeps({ llmEverUsedThisRun: () => false })
      const manager = new AiReflectionManager(deps)
      expect(manager.shouldShowReflectionUI()).toBe(false)
    })
  })

  describe("applyMemoryOperations", () => {
    it("add 操作添加新条目", () => {
      const deps = makeDeps()
      const manager = new AiReflectionManager(deps)
      const arr = ["a", "b"]
      manager.applyMemoryOperations(arr, { add: ["c"] }, 10)
      expect(arr).toEqual(["a", "b", "c"])
    })

    it("delete 操作删除指定索引", () => {
      const deps = makeDeps()
      const manager = new AiReflectionManager(deps)
      const arr = ["a", "b", "c"]
      manager.applyMemoryOperations(arr, { delete: [1] }, 10)
      expect(arr).toEqual(["a", "c"])
    })

    it("modify 操作修改指定索引", () => {
      const deps = makeDeps()
      const manager = new AiReflectionManager(deps)
      const arr = ["a", "b"]
      manager.applyMemoryOperations(arr, { modify: [[0, "X"]] }, 10)
      expect(arr).toEqual(["X", "b"])
    })
  })

  describe("updateCrossGameMemory", () => {
    it("调用 ensureAiCrossGameMemory 获取记忆并更新统计", () => {
      const ensureFn = vi.fn((_pid: string) => {
        const m = makeCrossGameMemory()
        m.stats.totalGames = 0
        return m
      })
      const saveFn = vi.fn()
      const deps = makeDeps({
        ensureAiCrossGameMemory: ensureFn,
        saveAiMemoryToStorage: saveFn,
      })
      const manager = new AiReflectionManager(deps)
      const memory = ensureFn("ai-1")
      expect(memory.stats.totalGames).toBe(0)

      manager.updateCrossGameMemory("ai-1", makeRecord(), {
        praises: { add: ["出价果断"] },
        strategies: { add: ["前期观察"] },
        lessons: { add: ["不追高"] },
      })

      // ensureAiCrossGameMemory 被调用两次（一次手动，一次 manager 内部）
      expect(ensureFn).toHaveBeenCalledWith("ai-1")
      expect(saveFn).toHaveBeenCalledOnce()
    })

    it("memory 为 null 时不崩溃（ensureAiCrossGameMemory 返回空对象时仍正常）", () => {
      const deps = makeDeps()
      const manager = new AiReflectionManager(deps)
      expect(() =>
        manager.updateCrossGameMemory("ai-1", makeRecord(), {}),
      ).not.toThrow()
    })
  })

  describe("proceedToBack", () => {
    it("非战绩回放、非联机时调用 enterLobby", () => {
      const exitFn = vi.fn()
      const enterLobbyFn = vi.fn()
      const deps = makeDeps({
        exitSettlementPage: exitFn,
        enterLobby: enterLobbyFn,
      })
      const manager = new AiReflectionManager(deps)
      manager.proceedToBack()
      expect(exitFn).toHaveBeenCalledOnce()
      expect(enterLobbyFn).toHaveBeenCalledOnce()
    })

    it("联机模式调用 enterLanRoom", () => {
      const enterLanRoomFn = vi.fn()
      const enterLobbyFn = vi.fn()
      const deps = makeDeps({
        isLanMode: () => true,
        enterLanRoom: enterLanRoomFn,
        enterLobby: enterLobbyFn,
      })
      const manager = new AiReflectionManager(deps)
      manager.proceedToBack()
      expect(enterLanRoomFn).toHaveBeenCalledOnce()
      expect(enterLobbyFn).not.toHaveBeenCalled()
    })

    it("战绩回放模式清除标记并返回大厅后打开面板", () => {
      vi.useFakeTimers()
      const exitFn = vi.fn()
      const enterLobbyFn = vi.fn()
      const openPanelFn = vi.fn()
      const writeLogFn = vi.fn()
      let active = true
      let recordId: string | null = "rec-1"
      const deps = makeDeps({
        exitSettlementPage: exitFn,
        enterLobby: enterLobbyFn,
        openBattleRecordPanel: openPanelFn,
        writeLog: writeLogFn,
        getBattleRecordReplayActive: () => active,
        setBattleRecordReplayActive: (v: boolean) => {
          active = v
        },
        getBattleRecordReplayRecordId: () => recordId,
        setBattleRecordReplayRecordId: (v: string | null) => {
          recordId = v
        },
      })
      const manager = new AiReflectionManager(deps)
      manager.proceedToBack()
      expect(exitFn).toHaveBeenCalledOnce()
      expect(active).toBe(false)
      expect(recordId).toBeNull()
      expect(enterLobbyFn).toHaveBeenCalledOnce()
      expect(openPanelFn).not.toHaveBeenCalled()
      vi.advanceTimersByTime(100)
      expect(openPanelFn).toHaveBeenCalledOnce()
      expect(writeLogFn).toHaveBeenCalledOnce()
      vi.useRealTimers()
    })
  })

  describe("proceedToNewRun", () => {
    it("调用 exitSettlementPage 和 startNewRun", () => {
      const exitFn = vi.fn()
      const startNewRunFn = vi.fn()
      const deps = makeDeps({
        exitSettlementPage: exitFn,
        startNewRun: startNewRunFn,
      })
      const manager = new AiReflectionManager(deps)
      manager.proceedToNewRun()
      expect(exitFn).toHaveBeenCalledOnce()
      expect(startNewRunFn).toHaveBeenCalledOnce()
    })
  })

  describe("triggerAiReflection", () => {
    it("反思未启用时提前返回", async () => {
      const deps = makeDeps({ getLlmSettings: () => ({ reflectionEnabled: false }) })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())
      expect(deps.reflectionStatus.state).toBe("")
    })

    it("canUseLlmDecision 为 false 时提前返回", async () => {
      const deps = makeDeps({ canUseLlmDecision: () => false })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())
      expect(deps.reflectionStatus.state).toBe("")
    })

    it("llmEverUsedThisRun 为 false 时提前返回", async () => {
      const deps = makeDeps({ llmEverUsedThisRun: () => false })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())
      expect(deps.reflectionStatus.state).toBe("")
    })

    it("无 AI 玩家时状态为 done", async () => {
      const deps = makeDeps({
        players: [{ id: "human", name: "玩家", isHuman: true, isAI: false, avatar: "你" } as never],
      })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())
      expect(deps.reflectionStatus.state).toBe("done")
      expect(deps.reflectionStatus.total).toBe(0)
    })

    it("LLM Provider 为 null 时状态为 error", async () => {
      const deps = makeDeps({ getLlmProvider: () => null })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())
      expect(deps.reflectionStatus.state).toBe("error")
      expect(deps.reflectionStatus.detail).toContain("左上AI")
      expect(deps.reflectionStatus.detail).toContain("无LLM Provider")
    })

    it("LLM 返回成功时更新记忆并记录到 currentRunLog", async () => {
      const runLog = makeRunLog()
      const saveFn = vi.fn()
      const renderFn = vi.fn()
      const mockProvider = makeMockProvider({
        ok: true,
        content: JSON.stringify({
          praises: { add: ["果断出价"] },
          strategies: { add: ["前期观察"] },
          lessons: { add: ["不追高"] },
        }),
        usage: { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 50 },
      })
      const deps = makeDeps({
        getLlmProvider: () => mockProvider,
        saveAiMemoryToStorage: saveFn,
        renderAiThoughtLog: renderFn,
        getCurrentRunLog: () => runLog,
      })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.state).toBe("done")
      expect(mockProvider.requestChat).toHaveBeenCalledOnce()
      expect(saveFn).toHaveBeenCalled()
      expect(renderFn).toHaveBeenCalled()
      expect(runLog.aiThoughtLogs).toHaveLength(1)
      const logEntry = runLog.aiThoughtLogs[0] as Record<string, unknown>
      expect(logEntry.decisionSource).toBe("reflection")
      expect(logEntry.playerName).toBe("左上AI")
    })

    it("LLM 返回超时时状态为 timeout", async () => {
      const mockProvider = makeMockProvider({
        ok: false,
        code: "TIMEOUT",
        error: "请求超时",
      })
      const deps = makeDeps({ getLlmProvider: () => mockProvider })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.state).toBe("timeout")
      expect(deps.reflectionStatus.detail).toContain("左上AI")
      expect(deps.reflectionStatus.detail).toContain("超时")
    })

    it("LLM 返回失败时状态为 error", async () => {
      const mockProvider = makeMockProvider({
        ok: false,
        code: "API_ERROR",
        error: "API 调用失败",
      })
      const deps = makeDeps({ getLlmProvider: () => mockProvider })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.state).toBe("error")
      expect(deps.reflectionStatus.detail).toContain("左上AI")
      expect(deps.reflectionStatus.detail).toContain("API 调用失败")
    })

    it("LLM 请求抛异常时状态为 error", async () => {
      const mockProvider = makeMockProvider({ ok: true, content: "" })
      mockProvider.requestChat = vi.fn().mockRejectedValue(new Error("网络异常"))
      const deps = makeDeps({ getLlmProvider: () => mockProvider })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.state).toBe("error")
      expect(deps.reflectionStatus.detail).toContain("网络异常")
    })

    it("pendingSettlementSummary 非空时追加到跨局消息", async () => {
      const mockProvider = makeMockProvider({ ok: true, content: '{"lessons":[]}' })
      const aiCrossGameMessagesByPlayer: Record<string, unknown[][]> = {
        "ai-1": [[{ role: "system", content: "msg" }]],
      }
      let pendingSummary = "结算总结内容"
      const saveFn = vi.fn()
      const deps = makeDeps({
        getLlmProvider: () => mockProvider,
        getAiCrossGameMessagesByPlayer: () => aiCrossGameMessagesByPlayer,
        getPendingSettlementSummary: () => pendingSummary,
        setPendingSettlementSummary: (v: string) => {
          pendingSummary = v
        },
        saveAiMemoryToStorage: saveFn,
      })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(pendingSummary).toBe("")
      const lastGame = aiCrossGameMessagesByPlayer["ai-1"][0]
      expect(lastGame).toHaveLength(2)
      const lastMsg = lastGame[1] as { role: string; content: string }
      expect(lastMsg.content).toBe("结算总结内容")
    })

    it("beforeUnloadHandler 在流程结束后被清除", async () => {
      const mockProvider = makeMockProvider({ ok: true, content: '{"lessons":[]}' })
      const deps = makeDeps({ getLlmProvider: () => mockProvider })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.beforeUnloadHandler).toBeNull()
    })

    it("多 AI 玩家时全部完成后状态为 done", async () => {
      const mockProvider = makeMockProvider({ ok: true, content: '{"lessons":[]}' })
      const deps = makeDeps({
        getLlmProvider: () => mockProvider,
        players: [
          { id: "human", name: "玩家", isHuman: true, isAI: false, avatar: "你" } as never,
          { id: "ai-1", name: "左上AI", isHuman: false, isAI: true, avatar: "A1" } as never,
          { id: "ai-2", name: "右上AI", isHuman: false, isAI: true, avatar: "A2" } as never,
        ],
      })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(deps.reflectionStatus.state).toBe("done")
      expect(deps.reflectionStatus.total).toBe(2)
      expect(mockProvider.requestChat).toHaveBeenCalledTimes(2)
    })

    it("isAiMultiGameMemoryEnabled 为 false 时将反思追加到 summary", async () => {
      const mockProvider = makeMockProvider({ ok: true, content: "反思内容" })
      const pendingNextRunAiSummaryByPlayer: Record<string, string> = {}
      const deps = makeDeps({
        getLlmProvider: () => mockProvider,
        isAiMultiGameMemoryEnabled: () => false,
        getPendingNextRunAiSummaryByPlayer: () => pendingNextRunAiSummaryByPlayer,
      })
      const manager = new AiReflectionManager(deps)
      await manager.triggerAiReflection(makeRecord())

      expect(pendingNextRunAiSummaryByPlayer["ai-1"]).toContain("反思内容")
      expect(pendingNextRunAiSummaryByPlayer["ai-1"]).toContain("左上AI")
    })
  })
})
