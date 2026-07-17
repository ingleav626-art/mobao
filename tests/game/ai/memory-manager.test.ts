import { describe, it, expect, beforeEach, vi } from "vitest"
import { JSDOM } from "jsdom"
import { AiMemoryManager, type AiMemoryData, type AiMemoryManagerDeps } from "../../../scripts/game/ai/memory-manager"
import type { LlmSettings } from "../../../types/llm"
import type { CrossGameMemory } from "../../../types/ai"
import type { Player } from "../../../types/game"
import { DEFAULT_CROSS_GAME_STATS } from "../../../scripts/game/ai/memory"

function makeData(): AiMemoryData {
  return {
    aiConversationByPlayer: {},
    aiCrossGameMemory: {},
    aiCrossGameMessagesByPlayer: {},
    pendingNextRunAiSummaryByPlayer: {},
    aiReflectionPending: {},
    aiConversationCache: {},
    pendingSettlementSummary: null,
    runSerial: 0,
  }
}

const aiPlayers = [
  { id: "ai1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
  { id: "ai2", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
]
const humanPlayer = { id: "p1", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true }
const allPlayers = [humanPlayer, ...aiPlayers]

const sampleItems = [
  { qualityKey: "poor", w: 2, h: 3 },
  { qualityKey: "legendary", w: 1, h: 1 },
  { qualityKey: "rare", w: 3, h: 2 },
]

function makeLlmSettings(overrides: Partial<LlmSettings & { multiGameMemoryEnabled: boolean; autoSummarizeEnabled: boolean; contextLength: number }> = {}): LlmSettings {
  return {
    enabled: true,
    provider: "deepseek",
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: 0,
    maxTokens: 0,
    timeout: 0,
    aiLlmEnabled: true,
    multiGameMemoryEnabled: true,
    autoSummarizeEnabled: false,
    contextLength: 5,
    ...overrides,
  } as LlmSettings
}

function makeManager(overrides: {
  data?: AiMemoryData
  players?: typeof allPlayers
  getRound?: () => number
  getIsLanMode?: () => boolean
  getItems?: () => Array<{ qualityKey: string; w: number; h: number }>
  getLlmSettings?: () => LlmSettings | null
  isAiReflectionEnabled?: () => boolean
  getCurrentPublicEvent?: () => { category: string; text: string } | null
  getPlayerRoundHistory?: () => Record<string, Array<{ round: number; bid: number }>>
  isP2AutoPlaying?: () => boolean
} = {}): { manager: AiMemoryManager; data: AiMemoryData; deps: AiMemoryManagerDeps } {
  const data = overrides.data || makeData()
  const dom = new JSDOM('<div id="overlay" class="hidden"></div><div id="content"></div>')
  const fullDom: Record<string, HTMLElement | null> = {
    aiMemoryOverlay: dom.window.document.querySelector("#overlay") as HTMLElement,
    aiMemoryContent: dom.window.document.querySelector("#content") as HTMLElement,
  }
  const deps: AiMemoryManagerDeps = {
    players: overrides.players || allPlayers,
    data,
    dom: fullDom,
    getRound: overrides.getRound || (() => 1),
    getIsLanMode: overrides.getIsLanMode || (() => false),
    getItems: overrides.getItems || (() => sampleItems),
    getLlmSettings: overrides.getLlmSettings || (() => makeLlmSettings()),
    isAiReflectionEnabled: overrides.isAiReflectionEnabled || (() => false),
    getCurrentPublicEvent: overrides.getCurrentPublicEvent || (() => null),
    getPlayerRoundHistory:
      overrides.getPlayerRoundHistory || (() => ({ p1: [{ round: 1, bid: 5000 }], ai1: [{ round: 1, bid: 3000 }] })),
    isP2AutoPlaying: overrides.isP2AutoPlaying,
  }
  const manager = new AiMemoryManager(deps)
  return { manager, data, deps }
}

describe("AiMemoryManager", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe("getAiMemoryStorageKey", () => {
    it("非联机模式返回基础 key", () => {
      const { manager } = makeManager({ getIsLanMode: () => false })
      const key = manager.getAiMemoryStorageKey()
      expect(key).not.toContain("lan")
    })

    it("联机模式返回带 _lan 后缀", () => {
      const { manager } = makeManager({ getIsLanMode: () => true })
      expect(manager.getAiMemoryStorageKey()).toContain("lan")
    })

    it("两种模式 key 不同", () => {
      const { manager: m1 } = makeManager({ getIsLanMode: () => false })
      const { manager: m2 } = makeManager({ getIsLanMode: () => true })
      expect(m1.getAiMemoryStorageKey()).not.toBe(m2.getAiMemoryStorageKey())
    })
  })

  describe("isAiMultiGameMemoryEnabled", () => {
    it("multiGameMemoryEnabled=true 时返回 true", () => {
      const { manager } = makeManager({ getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: true }) })
      expect(manager.isAiMultiGameMemoryEnabled()).toBe(true)
    })

    it("multiGameMemoryEnabled=false 时返回 false", () => {
      const { manager } = makeManager({ getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: false }) })
      expect(manager.isAiMultiGameMemoryEnabled()).toBe(false)
    })

    it("settings 为 null 时返回 false", () => {
      const { manager } = makeManager({ getLlmSettings: () => null })
      expect(manager.isAiMultiGameMemoryEnabled()).toBe(false)
    })
  })

  describe("shouldGenerateSummary", () => {
    it("未启用 autoSummarize 时返回 false", () => {
      const { manager } = makeManager({
        getLlmSettings: () => makeLlmSettings({ autoSummarizeEnabled: false, multiGameMemoryEnabled: true }),
      })
      expect(manager.shouldGenerateSummary()).toBe(false)
    })

    it("未启用 multiGameMemory 时返回 false", () => {
      const { manager } = makeManager({
        getLlmSettings: () => makeLlmSettings({ autoSummarizeEnabled: true, multiGameMemoryEnabled: false }),
      })
      expect(manager.shouldGenerateSummary()).toBe(false)
    })

    it("无 AI 玩家时返回 false", () => {
      const { manager } = makeManager({
        players: [humanPlayer],
        getLlmSettings: () => makeLlmSettings({ autoSummarizeEnabled: true, multiGameMemoryEnabled: true }),
      })
      expect(manager.shouldGenerateSummary()).toBe(false)
    })
  })

  describe("saveAiMemoryToStorage / loadAiMemoryFromStorage", () => {
    it("保存后能读回", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer = { ai1: [{ run: 1, round: 1, bid: 500, skill: "无", item: "无", thought: "test", result: "" }] }
      data.runSerial = 3
      manager.saveAiMemoryToStorage()
      const loaded = manager.loadAiMemoryFromStorage()
      expect(loaded).not.toBeNull()
      expect(loaded!.runSerial).toBe(3)
      expect(loaded!.conversations.ai1).toHaveLength(1)
    })

    it("无数据时 load 返回 null", () => {
      const { manager } = makeManager()
      expect(manager.loadAiMemoryFromStorage()).toBeNull()
    })
  })

  describe("restoreAiMemoryFromStorage", () => {
    it("从存储恢复对话历史", () => {
      const { manager, data } = makeManager()
      const stored = {
        conversations: {
          ai1: [
            { run: 1, round: 1, bid: 100, skill: "s", item: "i", thought: "t", result: "r" },
          ],
        },
        crossGameMemory: {},
        crossGameMessages: {},
        pendingSummaryByPlayer: {},
        runSerial: 5,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))
      manager.restoreAiMemoryFromStorage()
      expect(data.aiConversationByPlayer.ai1).toHaveLength(1)
      expect(data.runSerial).toBe(5)
    })

    it("恢复跨局记忆（含 stats）", () => {
      const { manager, data } = makeManager()
      const stored = {
        conversations: {},
        crossGameMemory: {
          ai1: {
            stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 10 },
            lessons: ["lesson1", "lesson2"],
            strategies: ["strat1"],
            praises: ["praise1"],
          },
        },
        crossGameMessages: {},
        pendingSummaryByPlayer: {},
        runSerial: 0,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))
      manager.restoreAiMemoryFromStorage()
      expect(data.aiCrossGameMemory.ai1.stats.totalGames).toBe(10)
      expect(data.aiCrossGameMemory.ai1.lessons).toEqual(["lesson1", "lesson2"])
      expect(data.aiCrossGameMemory.ai1.strategies).toEqual(["strat1"])
      expect(data.aiCrossGameMemory.ai1.praises).toEqual(["praise1"])
    })

    it("恢复旧格式 pendingSummary（字符串）分发到 AI 玩家", () => {
      const { manager, data } = makeManager()
      const stored = {
        conversations: {},
        crossGameMemory: {},
        crossGameMessages: {},
        pendingSummary: "上期总结内容",
        runSerial: 0,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))
      manager.restoreAiMemoryFromStorage()
      expect(data.pendingNextRunAiSummaryByPlayer.ai1).toBe("上期总结内容")
      expect(data.pendingNextRunAiSummaryByPlayer.ai2).toBe("上期总结内容")
      expect(data.pendingNextRunAiSummaryByPlayer.p1).toBeUndefined()
    })

    it("无存储时不变更数据", () => {
      const { manager, data } = makeManager()
      data.runSerial = 7
      manager.restoreAiMemoryFromStorage()
      expect(data.runSerial).toBe(7)
    })

    it("对话历史超过 30 条只保留最后 30 条", () => {
      const { manager, data } = makeManager()
      const entries = Array.from({ length: 40 }, (_, i) => ({
        run: 1,
        round: i + 1,
        bid: i * 100,
        skill: "无",
        item: "无",
        thought: "",
        result: "",
      }))
      const stored = {
        conversations: { ai1: entries },
        crossGameMemory: {},
        crossGameMessages: {},
        pendingSummaryByPlayer: {},
        runSerial: 0,
        savedAt: Date.now(),
      }
      localStorage.setItem(manager.getAiMemoryStorageKey(), JSON.stringify(stored))
      manager.restoreAiMemoryFromStorage()
      expect(data.aiConversationByPlayer.ai1).toHaveLength(30)
      expect(data.aiConversationByPlayer.ai1[0].round).toBe(11)
    })
  })

  describe("ensureAiConversationBucket", () => {
    it("首次调用创建空桶", () => {
      const { manager, data } = makeManager()
      const bucket = manager.ensureAiConversationBucket("ai1")
      expect(bucket).toEqual([])
      expect(data.aiConversationByPlayer.ai1).toBe(bucket)
    })

    it("已存在时返回同一引用", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer.ai1 = [{ run: 1, round: 1, bid: null, skill: "", item: "", thought: "", result: "" }]
      const bucket = manager.ensureAiConversationBucket("ai1")
      expect(bucket).toHaveLength(1)
      expect(bucket).toBe(data.aiConversationByPlayer.ai1)
    })
  })

  describe("ensureAiCrossGameMemory", () => {
    it("首次调用创建默认记忆", () => {
      const { manager, data } = makeManager()
      const mem = manager.ensureAiCrossGameMemory("ai1")
      expect(mem.stats).toBeDefined()
      expect(mem.lessons).toEqual([])
      expect(data.aiCrossGameMemory.ai1).toBe(mem)
    })

    it("已有记忆时返回现有对象", () => {
      const { manager, data } = makeManager()
      const existing: CrossGameMemory = {
        stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 5 },
        lessons: ["l1"],
        strategies: [],
        praises: [],
      }
      data.aiCrossGameMemory.ai1 = existing
      const mem = manager.ensureAiCrossGameMemory("ai1")
      expect(mem).toBe(existing)
      expect(mem.stats.totalGames).toBe(5)
    })
  })

  describe("getAiInGameHistoryCount", () => {
    it("无桶时返回 0", () => {
      const { manager } = makeManager()
      expect(manager.getAiInGameHistoryCount("ai1")).toBe(0)
    })

    it("有桶时返回条数", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer.ai1 = [
        { run: 1, round: 1, bid: null, skill: "", item: "", thought: "", result: "" },
        { run: 1, round: 2, bid: null, skill: "", item: "", thought: "", result: "" },
      ]
      expect(manager.getAiInGameHistoryCount("ai1")).toBe(2)
    })
  })

  describe("getQualityCounts / getTotalOccupiedCells", () => {
    it("正确统计品质数量", () => {
      const { manager } = makeManager()
      const counts = manager.getQualityCounts()
      expect(counts.poor).toBe(1)
      expect(counts.legendary).toBe(1)
      expect(counts.rare).toBe(1)
      expect(counts.normal).toBe(0)
    })

    it("正确计算总格数", () => {
      const { manager } = makeManager()
      expect(manager.getTotalOccupiedCells()).toBe(6 + 1 + 6)
    })

    it("空仓库返回 0", () => {
      const { manager } = makeManager({ getItems: () => [] })
      expect(manager.getTotalOccupiedCells()).toBe(0)
    })
  })

  describe("getAiConversationMessages", () => {
    it("未启用跨局记忆时返回空数组", () => {
      const { manager } = makeManager({
        getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: false }),
      })
      expect(manager.getAiConversationMessages("ai1")).toEqual([])
    })

    it("包含上期总结", () => {
      const { manager, data } = makeManager()
      data.pendingNextRunAiSummaryByPlayer.ai1 = "总结内容"
      const msgs = manager.getAiConversationMessages("ai1")
      expect(msgs).toHaveLength(1)
      expect(msgs[0].content).toContain("总结内容")
      expect(msgs[0].content).toContain("【上期总结】")
    })

    it("包含跨局消息", () => {
      const { manager, data } = makeManager()
      data.aiCrossGameMessagesByPlayer.ai1 = [
        [
          { role: "user", content: "msg1" },
          { role: "assistant", content: "reply1" },
        ],
      ]
      const msgs = manager.getAiConversationMessages("ai1")
      expect(msgs).toHaveLength(2)
      expect(msgs[0].content).toBe("msg1")
      expect(msgs[1].content).toBe("reply1")
    })

    it("跳过无效消息", () => {
      const { manager, data } = makeManager()
      data.aiCrossGameMessagesByPlayer.ai1 = [
        [
          { role: "user", content: "valid" },
          { role: "", content: "invalid" },
          { content: "no role" },
        ],
      ]
      const msgs = manager.getAiConversationMessages("ai1")
      expect(msgs).toHaveLength(1)
    })
  })

  describe("pushAiRoundSummary", () => {
    it("未启用跨局记忆时不推送", () => {
      const { manager, data } = makeManager({
        getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: false }),
      })
      manager.pushAiRoundSummary("ai1", { bid: 500, thought: "test" })
      expect(data.aiConversationByPlayer.ai1).toBeUndefined()
    })

    it("推送回合总结到桶", () => {
      const { manager, data } = makeManager({ getRound: () => 3 })
      data.runSerial = 2
      manager.pushAiRoundSummary("ai1", {
        bid: 500,
        actionType: "skill",
        actionId: "skill-scan",
        thought: "thinking",
      })
      const bucket = data.aiConversationByPlayer.ai1
      expect(bucket).toHaveLength(1)
      expect(bucket[0].run).toBe(2)
      expect(bucket[0].round).toBe(3)
      expect(bucket[0].bid).toBe(500)
      expect(bucket[0].skill).toBe("skill-scan")
      expect(bucket[0].thought).toBe("thinking")
    })

    it("超过 30 条时裁剪到 30", () => {
      const { manager, data } = makeManager()
      const existing = Array.from({ length: 30 }, (_, i) => ({
        run: 1,
        round: i + 1,
        bid: null,
        skill: "",
        item: "",
        thought: "",
        result: "",
      }))
      data.aiConversationByPlayer.ai1 = existing
      manager.pushAiRoundSummary("ai1", { bid: 100 })
      expect(data.aiConversationByPlayer.ai1).toHaveLength(30)
      expect(data.aiConversationByPlayer.ai1[29].bid).toBe(100)
    })
  })

  describe("updateLastAiRoundResult", () => {
    it("未启用时不更新", () => {
      const { manager, data } = makeManager({
        getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: false }),
      })
      data.aiConversationByPlayer.ai1 = [{ run: 1, round: 1, bid: null, skill: "", item: "", thought: "", result: "" }]
      manager.updateLastAiRoundResult("ai1", "result")
      expect(data.aiConversationByPlayer.ai1[0].result).toBe("")
    })

    it("更新最后一条结果", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer.ai1 = [
        { run: 1, round: 1, bid: null, skill: "", item: "", thought: "", result: "" },
        { run: 1, round: 2, bid: null, skill: "", item: "", thought: "", result: "" },
      ]
      manager.updateLastAiRoundResult("ai1", "胜利")
      expect(data.aiConversationByPlayer.ai1[1].result).toBe("胜利")
      expect(data.aiConversationByPlayer.ai1[0].result).toBe("")
    })

    it("空桶时不操作", () => {
      const { manager, data } = makeManager()
      manager.updateLastAiRoundResult("ai1", "result")
      expect(data.aiConversationByPlayer.ai1).toEqual([])
    })
  })

  describe("resetAiConversations", () => {
    it("重置所有记忆状态", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer = { ai1: [] }
      data.aiCrossGameMemory = { ai1: { stats: { ...DEFAULT_CROSS_GAME_STATS }, lessons: [], strategies: [], praises: [] } }
      data.aiCrossGameMessagesByPlayer = { ai1: [] }
      data.aiReflectionPending = { ai1: true }
      data.pendingNextRunAiSummaryByPlayer = { ai1: "summary" }
      manager.resetAiConversations()
      expect(data.aiConversationByPlayer).toEqual({})
      expect(data.aiCrossGameMemory).toEqual({})
      expect(data.aiCrossGameMessagesByPlayer).toEqual({})
      expect(data.aiReflectionPending).toEqual({})
      expect(data.pendingNextRunAiSummaryByPlayer).toEqual({})
    })
  })

  describe("clearAiMemoryStorage", () => {
    it("清空内存状态和 localStorage", () => {
      const { manager, data } = makeManager()
      data.aiConversationByPlayer = { ai1: [] }
      data.runSerial = 5
      localStorage.setItem("mobao_ai_memory_v1", '{"test":true}')
      manager.clearAiMemoryStorage()
      expect(data.aiConversationByPlayer).toEqual({})
      expect(data.runSerial).toBe(0)
      expect(localStorage.getItem("mobao_ai_memory_v1")).toBeNull()
    })
  })

  describe("exportAiMemoryToJson / importAiMemoryFromJson", () => {
    it("导出后导入能还原数据", () => {
      const { manager: exportMgr, data: exportData } = makeManager()
      exportData.runSerial = 4
      exportData.aiConversationByPlayer = {
        ai1: [{ run: 1, round: 1, bid: 200, skill: "s", item: "i", thought: "t", result: "r" }],
      }
      exportData.aiCrossGameMemory = {
        ai1: { stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 3 }, lessons: ["l1"], strategies: [], praises: [] },
      }
      const json = exportMgr.exportAiMemoryToJson()
      const parsed = JSON.parse(json)
      expect(parsed.version).toBe("v1")
      expect(parsed.runSerial).toBe(4)

      const { manager: importMgr, data: importData } = makeManager()
      const result = importMgr.importAiMemoryFromJson(json)
      expect(result.ok).toBe(true)
      expect(importData.runSerial).toBe(4)
      expect(importData.aiConversationByPlayer.ai1).toHaveLength(1)
      expect(importData.aiCrossGameMemory.ai1.stats.totalGames).toBe(3)
    })

    it("无效 JSON 返回错误", () => {
      const { manager } = makeManager()
      const result = manager.importAiMemoryFromJson("{invalid")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("JSON解析失败")
    })

    it("非对象 JSON 返回错误", () => {
      const { manager } = makeManager()
      const result = manager.importAiMemoryFromJson('"just a string"')
      expect(result.ok).toBe(false)
      expect(result.error).toContain("无效的JSON格式")
    })

    it("不支持的版本返回错误", () => {
      const { manager } = makeManager()
      const result = manager.importAiMemoryFromJson(JSON.stringify({ version: "v2" }))
      expect(result.ok).toBe(false)
      expect(result.error).toContain("不支持的版本格式")
    })

    it("导入旧格式 pendingSummary 分发到 AI 玩家", () => {
      const { manager, data } = makeManager()
      const json = JSON.stringify({
        conversations: {},
        crossGameMemory: {},
        pendingSummary: "旧总结",
        runSerial: 0,
        version: "v1",
      })
      manager.importAiMemoryFromJson(json)
      expect(data.pendingNextRunAiSummaryByPlayer.ai1).toBe("旧总结")
      expect(data.pendingNextRunAiSummaryByPlayer.ai2).toBe("旧总结")
    })

    it("跨局记忆 lessons 超 10 条裁剪", () => {
      const { manager, data } = makeManager()
      const json = JSON.stringify({
        conversations: {},
        crossGameMemory: {
          ai1: {
            stats: { ...DEFAULT_CROSS_GAME_STATS },
            lessons: Array.from({ length: 15 }, (_, i) => `lesson${i}`),
            strategies: [],
            praises: [],
          },
        },
        pendingSummaryByPlayer: {},
        runSerial: 0,
        version: "v1",
      })
      manager.importAiMemoryFromJson(json)
      expect(data.aiCrossGameMemory.ai1.lessons).toHaveLength(10)
      expect(data.aiCrossGameMemory.ai1.lessons[0]).toBe("lesson5")
    })
  })

  describe("pushRunSettlementContextToAi", () => {
    it("为每个 AI 玩家设置 pendingNextRunAiSummary", () => {
      const { manager, data } = makeManager()
      data.runSerial = 3
      manager.pushRunSettlementContextToAi({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: 2000,
        reasonText: "最高价",
      })
      expect(data.pendingNextRunAiSummaryByPlayer.ai1).toContain("第 3 局已结算")
      expect(data.pendingNextRunAiSummaryByPlayer.ai2).toContain("第 3 局已结算")
      expect(data.pendingSettlementSummary).toContain("第 3 局已结算")
    })

    it("分红机制生成正确文本", () => {
      const { manager, data } = makeManager()
      manager.pushRunSettlementContextToAi({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: -1000,
        reasonText: "最高价",
        dividendTicketInfo: { mechanism: "dividend", dividendPerPlayer: 150, ticketPerPlayer: 0 },
      })
      expect(data.pendingSettlementSummary).toContain("分红触发")
      expect(data.pendingNextRunAiSummaryByPlayer.ai2).toContain("分红触发")
    })

    it("门票机制生成正确文本", () => {
      const { manager, data } = makeManager()
      manager.pushRunSettlementContextToAi({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: 1000,
        reasonText: "最高价",
        dividendTicketInfo: { mechanism: "ticket", dividendPerPlayer: 0, ticketPerPlayer: 50 },
      })
      expect(data.pendingSettlementSummary).toContain("门票触发")
      expect(data.pendingNextRunAiSummaryByPlayer.ai2).toContain("门票触发")
    })

    it("缓存对话超 2 条时存入跨局消息", () => {
      const { manager, data } = makeManager()
      data.aiConversationCache = {
        ai1: [
          { role: "system", content: "sys" },
          { role: "user", content: "u1" },
          { role: "assistant", content: "a1" },
          { role: "user", content: "u2" },
        ],
      }
      manager.pushRunSettlementContextToAi({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: 2000,
        reasonText: "最高价",
      })
      expect(data.aiCrossGameMessagesByPlayer.ai1).toHaveLength(1)
      expect(data.aiCrossGameMessagesByPlayer.ai1[0]).toHaveLength(2)
    })
  })

  describe("createCrossGameRecord", () => {
    it("创建包含正确字段的记录", () => {
      const { manager } = makeManager({ getRound: () => 3 })
      const record = manager.createCrossGameRecord({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: 2000,
        reasonText: "最高价",
      })
      expect(record.winnerId).toBe("ai1")
      expect(record.warehouseValue).toBe(10000)
      expect(record.winnerProfit).toBe(2000)
      expect(record.qualityCounts).toBeDefined()
      expect(record.totalItems).toBe(3)
      expect(record.totalCells).toBe(13)
      expect(Array.isArray(record.roundBids)).toBe(true)
      expect(record.roundBids).toHaveLength(2)
      expect(record.reflectionEnabled).toBe(false)
    })

    it("包含分红门票信息", () => {
      const { manager } = makeManager()
      const record = manager.createCrossGameRecord({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: -1000,
        reasonText: "最高价",
        dividendTicketInfo: { mechanism: "dividend", dividendPerPlayer: 150, ticketPerPlayer: 0 },
      })
      expect(record.dividendTicket).toEqual({ mechanism: "dividend", dividendPerPlayer: 150, ticketPerPlayer: 0 })
    })

    it("无分红门票时 dividendTicket 为 null", () => {
      const { manager } = makeManager()
      const record = manager.createCrossGameRecord({
        winnerId: "ai1",
        winnerName: "左上AI",
        winnerBid: 5000,
        totalValue: 10000,
        winnerProfit: 2000,
        reasonText: "最高价",
      })
      expect(record.dividendTicket).toBeNull()
    })
  })

  describe("getAiFirstRoundExtraBlocks", () => {
    it("未启用跨局记忆时返回空", () => {
      const { manager } = makeManager({
        getLlmSettings: () => makeLlmSettings({ multiGameMemoryEnabled: false }),
      })
      expect(manager.getAiFirstRoundExtraBlocks()).toEqual([])
    })

    it("非第一回合返回空", () => {
      const { manager } = makeManager({ getRound: () => 2 })
      expect(manager.getAiFirstRoundExtraBlocks()).toEqual([])
    })

    it("第一回合且启用时返回系统事件块", () => {
      const { manager, data } = makeManager({ getRound: () => 1 })
      data.runSerial = 5
      const blocks = manager.getAiFirstRoundExtraBlocks()
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toContain("第 5 局开始")
    })

    it("有上期总结时包含总结块", () => {
      const { manager, data } = makeManager({ getRound: () => 1 })
      data.pendingNextRunAiSummaryByPlayer.ai1 = "上期总结内容"
      const blocks = manager.getAiFirstRoundExtraBlocks("ai1")
      expect(blocks).toHaveLength(2)
      expect(blocks[1]).toBe("上期总结内容")
    })

    it("有公共事件时包含事件块", () => {
      const { manager, data } = makeManager({
        getRound: () => 1,
        getCurrentPublicEvent: () => ({ category: "市场", text: "物价波动" }),
      })
      data.pendingNextRunAiSummaryByPlayer.ai1 = "总结"
      const blocks = manager.getAiFirstRoundExtraBlocks("ai1")
      expect(blocks).toHaveLength(3)
      expect(blocks[2]).toContain("公共事件")
      expect(blocks[2]).toContain("物价波动")
    })
  })

  describe("openAiMemoryPanel / closeAiMemoryPanel", () => {
    it("无 AI 玩家时显示暂无提示", () => {
      const { manager, deps } = makeManager({ players: [humanPlayer] })
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("暂无AI玩家")
      expect(deps.dom.aiMemoryOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("有 AI 玩家时渲染记忆面板", () => {
      const { manager, deps } = makeManager()
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("ai-memory-section")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("左上AI")
      expect(deps.dom.aiMemoryOverlay!.classList.contains("hidden")).toBe(false)
    })

    it("AI 玩家有记忆数据时渲染统计", () => {
      const { manager, data, deps } = makeManager()
      data.aiCrossGameMemory.ai1 = {
        stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 5, winRate: 0.6 },
        lessons: ["lesson1"],
        strategies: ["strat1"],
        praises: ["praise1"],
      }
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("历史统计")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("5局")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("60%")
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("lesson1")
    })

    it("无记忆数据时显示暂无跨局记忆", () => {
      const { manager, deps } = makeManager()
      manager.openAiMemoryPanel()
      expect(deps.dom.aiMemoryContent!.innerHTML).toContain("暂无跨局记忆")
    })

    it("closeAiMemoryPanel 添加 hidden 类", () => {
      const { manager, deps } = makeManager()
      deps.dom.aiMemoryOverlay!.classList.remove("hidden")
      manager.closeAiMemoryPanel()
      expect(deps.dom.aiMemoryOverlay!.classList.contains("hidden")).toBe(true)
    })

    it("overlay 不存在时 open 不报错", () => {
      const { manager, deps } = makeManager()
      deps.dom.aiMemoryOverlay = null
      expect(() => manager.openAiMemoryPanel()).not.toThrow()
    })
  })

  describe("clearGameHistoryForPlayer", () => {
    it("不报错（委托 MobaoGameHistory.clear）", () => {
      const { manager } = makeManager()
      expect(() => manager.clearGameHistoryForPlayer("ai1")).not.toThrow()
    })
  })

  describe("pushRunStartContextToAi", () => {
    it("空方法不报错", () => {
      const { manager } = makeManager()
      expect(() => manager.pushRunStartContextToAi()).not.toThrow()
    })
  })

  // ════════════ AI托管：p2 结算写入 ════════════
  describe("pushRunSettlementContextToAi with p2 autoplay", () => {
    it("isP2AutoPlaying=true 时 p2 得到结算总结", () => {
      const { manager, deps } = makeManager()
      manager.pushRunSettlementContextToAi({ winnerId: "p1", winnerName: "AI1", winnerBid: 5000, totalValue: 20000, winnerProfit: 15000, reasonText: "直接拿下" })

      // 默认 p2 不在总结列表中（isHuman=true 被过滤）
      const p2summary = deps.data.pendingNextRunAiSummaryByPlayer["p2"]
      expect(p2summary).toBeUndefined()
    })

    it("isP2AutoPlaying=true 时 p2 得到结算总结", () => {
      const players = [
        { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
        { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      ] as Player[]
      const { manager, deps } = makeManager({ players, isP2AutoPlaying: () => true })
      manager.pushRunSettlementContextToAi({ winnerId: "p1", winnerName: "AI1", winnerBid: 5000, totalValue: 20000, winnerProfit: 15000, reasonText: "直接拿下" })

      // p2 应该得到总结（托管中）
      const allKeys = Object.keys(deps.data.pendingNextRunAiSummaryByPlayer)
      // p1 (AI) 和 p2 (托管中的玩家) 都应该有总结
      expect(allKeys).toContain("p2")
      expect(deps.data.pendingNextRunAiSummaryByPlayer["p2"]).toContain("AI1")
    })
})
