import { describe, it, expect, beforeEach } from "vitest"
import { JSDOM } from "jsdom"
import { AiMemoryManager, type AiMemoryData, type AiMemoryManagerDeps } from "../../scripts/game/ai/memory-manager"
import { createLlmPromptModule } from "../../scripts/llm/core/llm-prompt"
import type { LlmSettings } from "../../types/llm"
import type { WarehouseSceneThis } from "../../types/warehouse-scene-this"

/** 真实链路回归：经验本在跨局归档后，第二局只出现一次（不重复拼接）。
 *  旧 bug：归档用 cached.slice(2) 只剥 system+图鉴，经验本/上期总结残留在归档里，
 *  下局重新注入前缀时与新的经验本重复拼接。 */

function makeLlmSettings(overrides: Partial<LlmSettings & { multiGameMemoryEnabled: boolean; contextLength: number }> = {}): LlmSettings {
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
    contextLength: 5,
    ...overrides,
  } as LlmSettings
}

function makeData(): AiMemoryData {
  return {
    aiConversationByPlayer: {},
    aiCrossGameMemory: {},
    aiCrossGameMessagesByPlayer: {},
    pendingNextRunAiSummaryByPlayer: {},
    aiReflectionPending: {},
    aiConversationCache: {},
    pendingSettlementSummary: null,
    runSerial: 1,
    aiFeedbacks: [],
    aiExperienceBookInContext: {},
  }
}

function makeMemoryManager(data: AiMemoryData) {
  const dom = new JSDOM('<div id="o" class="hidden"></div><div id="c"></div>')
  const fullDom: Record<string, HTMLElement | null> = {
    aiMemoryOverlay: dom.window.document.querySelector("#o") as HTMLElement,
    aiMemoryContent: dom.window.document.querySelector("#c") as HTMLElement,
  }
  const deps: AiMemoryManagerDeps = {
    players: [
      { id: "ai1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false } as never,
    ],
    data,
    dom: fullDom,
    getRound: () => 1,
    getIsLanMode: () => false,
    getItems: () => [{ qualityKey: "rare", w: 1, h: 1 }],
    getLlmSettings: () => makeLlmSettings(),
    isAiReflectionEnabled: () => false,
    getCurrentPublicEvent: () => null,
    getPlayerRoundHistory: () => ({}),
  }
  return new AiMemoryManager(deps)
}

function makePromptModule() {
  return createLlmPromptModule({
    GAME_SETTINGS: { maxRounds: 5, bidStep: 100, directTakeRatio: 0.2 },
    SKILL_DEFS: [],
    ITEM_DEFS: [],
    pickFirstDefined: (...args: unknown[]) => args.find((a) => a !== undefined && a !== null),
    normalizeActionToken: (s: string) => s,
    isNoneActionText: (s: string) => s === "无",
    compactOneLine: (s: string) => s,
  })
}

/** 统计 messages 中以某前缀开头的 user 消息数 */
function countPrefix(messages: Array<{ role: string; content: string }>, prefix: string): number {
  return messages.filter((m) => typeof m.content === "string" && m.content.startsWith(prefix)).length
}

describe("经验本跨局归档不重复（回归）", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("第二局决策 prompt 中经验本只出现一次", () => {
    const data = makeData()
    const memMgr = makeMemoryManager(data)
    const prompt = makePromptModule()
    const fakeThis = { round: 1 } as unknown as WarehouseSceneThis

    // 经验本 A 已就绪（首次反思后插入）
    data.aiCrossGameMemory.ai1 = {
      stats: { totalGames: 0 } as never,
      lessons: ["不追高"],
      strategies: [],
      praises: [],
    } as never
    memMgr.refreshAiExperienceBookInContext("ai1")
    expect(memMgr.getAiExperienceBookInContext("ai1")).not.toBeNull()

    // ── 游戏1：用真实 buildAiDecisionMessages 构造首局消息 ──
    const payload1 = {
      catalogSummary: { totalArtifacts: 73 },
      experienceBook: memMgr.getAiExperienceBookInContext("ai1"),
      selfRoleAndTools: { character: { characterName: "探子" } },
    }
    const game1Messages = prompt.methods.buildAiDecisionMessages.call(fakeThis, payload1, {
      systemPrompt: "SYS",
      historyMessages: [],
    }) as Array<{ role: string; content: string }>
    // 游戏1 自身应含 1 个经验本
    expect(countPrefix(game1Messages, "【经验本】")).toBe(1)

    // 模拟 LLM 回复后写入决策缓存（与 request.ts:550 一致）
    data.aiConversationCache.ai1 = [...game1Messages, { role: "assistant", content: '{"bid":500000}' }]

    // ── 游戏1 结算：真实归档 ──
    memMgr.pushRunSettlementContextToAi({
      winnerId: "ai1",
      winnerName: "左上AI",
      winnerBid: 500000,
      totalValue: 554000,
      winnerProfit: 54000,
      reasonText: "提前拿下",
    })
    // 归档已写入跨局消息
    expect(data.aiCrossGameMessagesByPlayer.ai1).toHaveLength(1)

    // ── 游戏2：重新构造决策消息（含跨局历史 + 新前缀）──
    const historyMessages = memMgr.getAiConversationMessages("ai1")
    const payload2 = {
      catalogSummary: { totalArtifacts: 73 },
      experienceBook: memMgr.getAiExperienceBookInContext("ai1"),
      selfRoleAndTools: { character: { characterName: "探子" } },
    }
    const game2Messages = prompt.methods.buildAiDecisionMessages.call(fakeThis, payload2, {
      systemPrompt: "SYS",
      historyMessages,
    }) as Array<{ role: string; content: string }>

    // 核心断言：经验本只出现 1 次（旧 slice(2) 会出现 2 次：新前缀 + 归档残留）
    expect(countPrefix(game2Messages, "【经验本】")).toBe(1)
    // 归档里不应残留经验本
    const archived = data.aiCrossGameMessagesByPlayer.ai1[0] as Array<{ content: string }>
    expect(archived.some((m) => typeof m.content === "string" && m.content.startsWith("【经验本】"))).toBe(false)
  })
})
