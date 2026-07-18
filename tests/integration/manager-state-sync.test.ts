import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  AiMemoryManager,
  type AiMemoryData,
  type AiMemoryManagerDeps,
} from "../../scripts/game/ai/memory-manager"
import { AiWalletManager } from "../../scripts/game/ai/wallet-manager"
import {
  AiDecisionManager,
  type AiDecisionManagerDeps,
} from "../../scripts/game/ai/decision-manager"
import {
  SettlementManager,
  type SettlementManagerDeps,
  type SettlementPlayer,
} from "../../scripts/game/core/settlement-manager-class"
import type { Player } from "../../types/game"
import type { RunLog } from "../../scripts/game/ai/decision"
import { DEFAULT_CROSS_GAME_STATS } from "../../scripts/game/ai/memory"
import { AI_WALLET_INITIAL } from "../../scripts/game/ai/wallet"
// 真实链路：加成系统类型（替代 mock bonusEffects）
import type { BonusEffect } from "../../scripts/game/core/bonus"

const aiPlayers: Player[] = [
  { id: "ai1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
  { id: "ai2", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
]
const humanPlayer: Player = {
  id: "p1",
  name: "玩家",
  avatar: "你",
  isHuman: true,
  isAI: false,
  isSelf: true,
}
const allPlayers: Player[] = [humanPlayer, ...aiPlayers]

function makeSceneBoundAiMemoryData() {
  const scene: AiMemoryData = {
    aiConversationByPlayer: {},
    aiCrossGameMemory: {},
    aiCrossGameMessagesByPlayer: {},
    pendingNextRunAiSummaryByPlayer: {},
    aiReflectionPending: {},
    aiConversationCache: {},
    pendingSettlementSummary: null,
    runSerial: 0,
  }
  const aiMemoryData: AiMemoryData = {
    get aiConversationByPlayer() {
      return scene.aiConversationByPlayer
    },
    set aiConversationByPlayer(v) {
      scene.aiConversationByPlayer = v
    },
    get aiCrossGameMemory() {
      return scene.aiCrossGameMemory
    },
    set aiCrossGameMemory(v) {
      scene.aiCrossGameMemory = v
    },
    get aiCrossGameMessagesByPlayer() {
      return scene.aiCrossGameMessagesByPlayer
    },
    set aiCrossGameMessagesByPlayer(v) {
      scene.aiCrossGameMessagesByPlayer = v
    },
    get pendingNextRunAiSummaryByPlayer() {
      return scene.pendingNextRunAiSummaryByPlayer
    },
    set pendingNextRunAiSummaryByPlayer(v) {
      scene.pendingNextRunAiSummaryByPlayer = v
    },
    get aiReflectionPending() {
      return scene.aiReflectionPending
    },
    set aiReflectionPending(v) {
      scene.aiReflectionPending = v
    },
    get aiConversationCache() {
      return scene.aiConversationCache
    },
    set aiConversationCache(v) {
      scene.aiConversationCache = v
    },
    get pendingSettlementSummary() {
      return scene.pendingSettlementSummary
    },
    set pendingSettlementSummary(v) {
      scene.pendingSettlementSummary = v
    },
    get runSerial() {
      return scene.runSerial
    },
    set runSerial(v) {
      scene.runSerial = v
    },
  }
  return { scene, aiMemoryData }
}

function makeAiMemoryManager(data: AiMemoryData, players: Player[]): AiMemoryManager {
  const deps: AiMemoryManagerDeps = {
    players,
    data,
    dom: {},
    getRound: () => 1,
    getIsLanMode: () => false,
    getItems: () => [],
    getLlmSettings: () => null,
    isAiReflectionEnabled: () => false,
    getCurrentPublicEvent: () => null,
    getPlayerRoundHistory: () => ({}),
  }
  return new AiMemoryManager(deps)
}

describe("Manager 状态同步集成测试（对象生命周期）", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // ─── AiMemoryManager: getter/setter 确保重赋值同步到场景 ───
  describe("AiMemoryManager 重赋值同步", () => {
    it("restoreAiMemoryFromStorage: 重赋值后 data 与 scene 保持同一引用", () => {
      const { scene, aiMemoryData } = makeSceneBoundAiMemoryData()
      const manager = makeAiMemoryManager(aiMemoryData, allPlayers)
      const stored = {
        conversations: {
          ai1: [{ run: 1, round: 1, bid: 500, skill: "s", item: "i", thought: "t", result: "r" }],
        },
        crossGameMemory: {
          ai1: {
            stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 5 },
            lessons: ["lesson1"],
            strategies: ["strat1"],
            praises: ["praise1"],
          },
        },
        crossGameMessages: {
          ai1: [[{ role: "user", content: "msg1" }, { role: "assistant", content: "reply1" }]],
        },
        pendingSummaryByPlayer: { ai1: "summary text" },
        runSerial: 7,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))

      manager.restoreAiMemoryFromStorage()

      expect(aiMemoryData.aiConversationByPlayer).toBe(scene.aiConversationByPlayer)
      expect(aiMemoryData.aiCrossGameMemory).toBe(scene.aiCrossGameMemory)
      expect(aiMemoryData.aiCrossGameMessagesByPlayer).toBe(scene.aiCrossGameMessagesByPlayer)
      expect(aiMemoryData.pendingNextRunAiSummaryByPlayer).toBe(scene.pendingNextRunAiSummaryByPlayer)
      expect(aiMemoryData.runSerial).toBe(scene.runSerial)
    })

    it("restoreAiMemoryFromStorage: 恢复的数据内容正确", () => {
      const { scene, aiMemoryData } = makeSceneBoundAiMemoryData()
      const manager = makeAiMemoryManager(aiMemoryData, allPlayers)
      const stored = {
        conversations: {
          ai1: [{ run: 1, round: 1, bid: 500, skill: "s", item: "i", thought: "t", result: "r" }],
        },
        crossGameMemory: {
          ai1: {
            stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 5 },
            lessons: ["lesson1"],
            strategies: ["strat1"],
            praises: ["praise1"],
          },
        },
        crossGameMessages: {},
        pendingSummaryByPlayer: { ai1: "summary text" },
        runSerial: 7,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))

      manager.restoreAiMemoryFromStorage()

      expect(scene.aiConversationByPlayer.ai1).toHaveLength(1)
      expect(scene.aiCrossGameMemory.ai1.stats.totalGames).toBe(5)
      expect(scene.aiCrossGameMemory.ai1.lessons).toEqual(["lesson1"])
      expect(scene.pendingNextRunAiSummaryByPlayer.ai1).toBe("summary text")
      expect(scene.runSerial).toBe(7)
    })

    it("clearAiMemoryStorage: 重赋值后 data 与 scene 保持同一引用", () => {
      const { scene, aiMemoryData } = makeSceneBoundAiMemoryData()
      const manager = makeAiMemoryManager(aiMemoryData, allPlayers)
      scene.aiConversationByPlayer = { ai1: [] }
      scene.aiCrossGameMemory = {
        ai1: { stats: { ...DEFAULT_CROSS_GAME_STATS }, lessons: [], strategies: [], praises: [] },
      }
      scene.runSerial = 5
      localStorage.setItem(manager.getAiMemoryStorageKey(), '{"test":true}')

      manager.clearAiMemoryStorage()

      expect(aiMemoryData.aiConversationByPlayer).toBe(scene.aiConversationByPlayer)
      expect(aiMemoryData.aiCrossGameMemory).toBe(scene.aiCrossGameMemory)
      expect(aiMemoryData.aiCrossGameMessagesByPlayer).toBe(scene.aiCrossGameMessagesByPlayer)
      expect(aiMemoryData.aiReflectionPending).toBe(scene.aiReflectionPending)
      expect(aiMemoryData.pendingNextRunAiSummaryByPlayer).toBe(scene.pendingNextRunAiSummaryByPlayer)
      expect(aiMemoryData.runSerial).toBe(scene.runSerial)
    })

    it("clearAiMemoryStorage: 清空内存状态和 localStorage", () => {
      const { scene, aiMemoryData } = makeSceneBoundAiMemoryData()
      const manager = makeAiMemoryManager(aiMemoryData, allPlayers)
      scene.aiConversationByPlayer = { ai1: [] }
      scene.runSerial = 5
      localStorage.setItem(manager.getAiMemoryStorageKey(), '{"test":true}')

      manager.clearAiMemoryStorage()

      expect(scene.aiConversationByPlayer).toEqual({})
      expect(scene.aiCrossGameMemory).toEqual({})
      expect(scene.runSerial).toBe(0)
      expect(localStorage.getItem(manager.getAiMemoryStorageKey())).toBeNull()
    })

    it("resetAiConversations: 重赋值后 data 与 scene 保持同一引用", () => {
      const { scene, aiMemoryData } = makeSceneBoundAiMemoryData()
      const manager = makeAiMemoryManager(aiMemoryData, allPlayers)
      scene.aiConversationByPlayer = { ai1: [] }
      scene.aiCrossGameMemory = {
        ai1: { stats: { ...DEFAULT_CROSS_GAME_STATS }, lessons: [], strategies: [], praises: [] },
      }
      scene.aiCrossGameMessagesByPlayer = { ai1: [] }
      scene.aiReflectionPending = { ai1: true }
      scene.pendingNextRunAiSummaryByPlayer = { ai1: "summary" }

      manager.resetAiConversations()

      expect(aiMemoryData.aiConversationByPlayer).toBe(scene.aiConversationByPlayer)
      expect(aiMemoryData.aiCrossGameMemory).toBe(scene.aiCrossGameMemory)
      expect(aiMemoryData.aiCrossGameMessagesByPlayer).toBe(scene.aiCrossGameMessagesByPlayer)
      expect(aiMemoryData.aiReflectionPending).toBe(scene.aiReflectionPending)
      expect(aiMemoryData.pendingNextRunAiSummaryByPlayer).toBe(scene.pendingNextRunAiSummaryByPlayer)
    })

    it("plain object 无 getter/setter 时重赋值导致引用脱节（反证）", () => {
      const scene: AiMemoryData = {
        aiConversationByPlayer: {},
        aiCrossGameMemory: {},
        aiCrossGameMessagesByPlayer: {},
        pendingNextRunAiSummaryByPlayer: {},
        aiReflectionPending: {},
        aiConversationCache: {},
        pendingSettlementSummary: null,
        runSerial: 0,
      }
      const plainData: AiMemoryData = {
        aiConversationByPlayer: scene.aiConversationByPlayer,
        aiCrossGameMemory: scene.aiCrossGameMemory,
        aiCrossGameMessagesByPlayer: scene.aiCrossGameMessagesByPlayer,
        pendingNextRunAiSummaryByPlayer: scene.pendingNextRunAiSummaryByPlayer,
        aiReflectionPending: scene.aiReflectionPending,
        aiConversationCache: scene.aiConversationCache,
        pendingSettlementSummary: scene.pendingSettlementSummary,
        runSerial: scene.runSerial,
      }

      plainData.aiCrossGameMemory = {
        newKey: {
          stats: { ...DEFAULT_CROSS_GAME_STATS },
          lessons: [],
          strategies: [],
          praises: [],
        },
      }

      expect(plainData.aiCrossGameMemory).not.toBe(scene.aiCrossGameMemory)
    })
  })

  // ─── SettlementManager: setter 回调写回场景 ───
  describe("SettlementManager setter 回调同步", () => {
    function makeSettlementScene() {
      return {
        currentBid: 0,
        bidLeader: "",
        settled: false,
        playerMoney: 10000,
        aiWallets: { ai1: 5000, ai2: 3000 } as Record<string, number>,
        // 真实链路：bonusEffects 对应 state.game.bonusEffects（game-slice.ts 初始为 []）
        bonusEffects: [] as BonusEffect[],
      }
    }

    function makeSettlementDeps(
      scene: ReturnType<typeof makeSettlementScene>,
      players: SettlementPlayer[],
    ): SettlementManagerDeps {
      return {
        getPlayers: () => players,
        getPlayerMoney: () => scene.playerMoney,
        setPlayerMoney: (n) => {
          scene.playerMoney = n
        },
        getAiWallets: () => scene.aiWallets,
        getLanHostWallets: () => ({}),
        getWarehouseTrueValue: () => 100000,
        getIsLanMode: () => false,
        getLanIsHost: () => false,
        // 真实链路：返回场景内的 bonusEffects 引用（与 warehouse-scene.ts:917 一致）
        getBonusEffects: () => scene.bonusEffects,
        setCurrentBid: (bid) => {
          scene.currentBid = bid
        },
        setBidLeader: (id) => {
          scene.bidLeader = id
        },
        setSettled: (b) => {
          scene.settled = b
        },
        stopRoundTimer: vi.fn(),
        enterSettlementPage: vi.fn(),
        updateSettlementPanelMetrics: vi.fn(),
        showSelfProfit: vi.fn(),
        setSettlementProgress: vi.fn(),
        triggerSettlementFinalAnimation: vi.fn(),
        revealAllArtifactsForSettlement: vi.fn().mockResolvedValue(undefined),
        saveBattleRecord: vi.fn(),
        saveAiWalletsToStorage: vi.fn(),
        pushRunSettlementContextToAi: vi.fn(),
        createCrossGameRecord: vi.fn().mockReturnValue({}),
        triggerAiReflection: vi.fn().mockResolvedValue(undefined),
        hasAppliedMoneyForRun: () => false,
        markMoneyAppliedForRun: vi.fn(),
        writeLog: vi.fn(),
        updateHud: vi.fn(),
        getAiWallet: (id) => scene.aiWallets[id] ?? 0,
      }
    }

    const settlementPlayers: SettlementPlayer[] = [
      { id: "p1", isSelf: true, name: "玩家" },
      { id: "ai1", isSelf: false, name: "左上AI", isAI: true },
      { id: "ai2", isSelf: false, name: "右上AI", isAI: true },
    ]

    it("prepareFinishAuction: setCurrentBid/setBidLeader/setSettled 回调写回场景", async () => {
      const scene = makeSettlementScene()
      const manager = new SettlementManager(makeSettlementDeps(scene, settlementPlayers))

      await manager.prepareFinishAuction({ playerId: "ai1", bid: 8000 }, "final")

      expect(scene.currentBid).toBe(8000)
      expect(scene.bidLeader).toBe("ai1")
      expect(scene.settled).toBe(true)
    })

    it("prepareFinishAuction: 分红时 setPlayerMoney 回调写回场景且 aiWallets 原地修改", async () => {
      const scene = makeSettlementScene()
      const originalWalletsRef = scene.aiWallets
      const manager = new SettlementManager(makeSettlementDeps(scene, settlementPlayers))

      // winnerBid=120000 > totalValue=100000 => winnerProfit=-20000 => 分红
      // dividendPerPlayer = round(20000 * 0.15) = 3000
      await manager.prepareFinishAuction({ playerId: "ai1", bid: 120000 }, "final")

      expect(scene.playerMoney).toBe(10000 + 3000)
      expect(scene.aiWallets["ai2"]).toBe(3000 + 3000)
      // aiWallets 引用不变（原地修改，非重赋值）
      expect(scene.aiWallets).toBe(originalWalletsRef)
    })

    it("prepareFinishAuction: 门票时 setPlayerMoney 回调写回场景", async () => {
      const scene = makeSettlementScene()
      const manager = new SettlementManager(makeSettlementDeps(scene, settlementPlayers))

      // winnerBid=8000 < totalValue=100000 => winnerProfit=92000 => 门票
      // ticketPerPlayer = round(92000 * 0.05) = 4600
      await manager.prepareFinishAuction({ playerId: "ai1", bid: 8000 }, "final")

      expect(scene.playerMoney).toBe(10000 - 4600)
      expect(scene.aiWallets["ai2"]).toBe(Math.max(0, 3000 - 4600))
    })
  })

  // ─── AiDecisionManager: setter 回调写回场景 ───
  describe("AiDecisionManager setter 回调同步", () => {
    function makeDecisionScene() {
      return {
        runSerial: 0,
        currentRunLog: null as RunLog | null,
      }
    }

    function makeDecisionDeps(scene: ReturnType<typeof makeDecisionScene>): AiDecisionManagerDeps {
      return {
        runLogHistory: [],
        dom: { actionLog: null, aiLogicContent: null },
        aiEngine: null,
        getRound: () => 1,
        getCurrentRunLog: () => scene.currentRunLog,
        setCurrentRunLog: (log) => {
          scene.currentRunLog = log
        },
        setRunSerial: (n) => {
          scene.runSerial = n
        },
        saveAiMemoryToStorage: vi.fn(),
        renderAiThoughtLog: vi.fn(),
      }
    }

    it("beginRunTracking: setRunSerial/setCurrentRunLog 回调写回场景", () => {
      const scene = makeDecisionScene()
      const runLogHistory: RunLog[] = []
      const deps = makeDecisionDeps(scene)
      deps.runLogHistory = runLogHistory
      const manager = new AiDecisionManager(deps)

      manager.beginRunTracking()

      expect(scene.runSerial).toBe(1)
      expect(scene.currentRunLog).not.toBeNull()
      expect(scene.currentRunLog!.runNo).toBe(1)
      // runLogHistory 与 scene.currentRunLog 是同一引用
      expect(runLogHistory[0]).toBe(scene.currentRunLog)
    })

    it("多次 beginRunTracking: runSerial 递增且写回场景", () => {
      const scene = makeDecisionScene()
      const manager = new AiDecisionManager(makeDecisionDeps(scene))

      manager.beginRunTracking()
      expect(scene.runSerial).toBe(1)

      manager.beginRunTracking()
      expect(scene.runSerial).toBe(2)
      expect(scene.currentRunLog!.runNo).toBe(2)
    })
  })

  // ─── AiWalletManager: 原地修改（非重赋值）保持场景引用 ───
  describe("AiWalletManager 原地修改同步", () => {
    function makeWalletCtx(scene: { aiWallets: Record<string, number> }) {
      return {
        currentBid: 0,
        aiMaxBid: 0,
        aiWallets: scene.aiWallets,
        isLanMode: false,
        slotIdToLanId: {},
      }
    }

    it("resetAiWallets: 原地修改 aiWallets，场景引用不变", () => {
      const scene = {
        aiWallets: { ai1: 100, ai2: 200, stale: 999 } as Record<string, number>,
      }
      const players: Player[] = [humanPlayer, ...aiPlayers]
      const manager = new AiWalletManager(() => players, () => scene.aiWallets, () => makeWalletCtx(scene))

      const originalRef = scene.aiWallets
      manager.resetAiWallets()

      expect(scene.aiWallets).toBe(originalRef)
      expect(originalRef["ai1"]).toBe(AI_WALLET_INITIAL)
      expect(originalRef["ai2"]).toBe(AI_WALLET_INITIAL)
      expect(originalRef["stale"]).toBeUndefined()
      expect(originalRef["p1"]).toBeUndefined()
    })

    it("initAiWallets: 原地修改 aiWallets，场景引用不变", () => {
      const scene = {
        aiWallets: { ai1: 100, ai2: 200, stale: 999 } as Record<string, number>,
      }
      const players: Player[] = [humanPlayer, ...aiPlayers]
      const manager = new AiWalletManager(() => players, () => scene.aiWallets, () => makeWalletCtx(scene))

      const originalRef = scene.aiWallets
      manager.initAiWallets()

      expect(scene.aiWallets).toBe(originalRef)
      expect(originalRef["ai1"]).toBe(AI_WALLET_INITIAL)
      expect(originalRef["ai2"]).toBe(AI_WALLET_INITIAL)
      expect(originalRef["stale"]).toBeUndefined()
    })

    it("initAiWallets: 从 localStorage 加载时原地写入存储值", () => {
      const scene = {
        aiWallets: { ai1: 100, ai2: 200 } as Record<string, number>,
      }
      const players: Player[] = [humanPlayer, ...aiPlayers]
      localStorage.setItem("mobao_ai_wallets_v1", JSON.stringify({ ai1: 777000, ai2: 888000 }))
      const manager = new AiWalletManager(() => players, () => scene.aiWallets, () => makeWalletCtx(scene))

      const originalRef = scene.aiWallets
      manager.initAiWallets()

      expect(scene.aiWallets).toBe(originalRef)
      expect(originalRef["ai1"]).toBe(777000)
      expect(originalRef["ai2"]).toBe(888000)
    })
  })
})
