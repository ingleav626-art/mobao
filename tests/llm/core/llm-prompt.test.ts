import { describe, it, expect } from "vitest"
import { createLlmPromptModule } from "../../../scripts/llm/core/llm-prompt"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

function makeModule() {
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

describe("llm-prompt 经验本 A 注入（Layer ③）", () => {
  it("经验本注入在图鉴摘要之后、上期总结之前", () => {
    const { methods } = makeModule()
    const payload = {
      catalogSummary: { totalArtifacts: 73 },
      experienceBook: { lessons: ["不追高"], strategies: [], praises: [] },
    }
    const historyMessages = [{ role: "user" as const, content: "【上期总结】最近胜率60%" }]
    const fakeThis = { round: 1 } as unknown as WarehouseSceneThis
    const messages = methods.buildAiDecisionMessages.call(fakeThis, payload, {
      systemPrompt: "SYS",
      historyMessages,
    }) as Array<{ role: string; content: string }>

    const idxCatalog = messages.findIndex((m) => m.content.startsWith("【图鉴摘要】"))
    const idxExp = messages.findIndex((m) => m.content.startsWith("【经验本】"))
    const idxSummary = messages.findIndex((m) => m.content.startsWith("【上期总结】"))
    expect(idxCatalog).toBeGreaterThanOrEqual(0)
    expect(idxExp).toBeGreaterThan(idxCatalog)
    expect(idxSummary).toBeGreaterThan(idxExp)
    // 经验本内容含 lessons
    expect(messages[idxExp].content).toContain("不追高")
  })

  it("无经验本时不注入【经验本】", () => {
    const { methods } = makeModule()
    const payload = { catalogSummary: { totalArtifacts: 73 } }
    const fakeThis = { round: 1 } as unknown as WarehouseSceneThis
    const messages = methods.buildAiDecisionMessages.call(fakeThis, payload, {
      systemPrompt: "SYS",
      historyMessages: [],
    }) as Array<{ role: string; content: string }>
    expect(messages.some((m) => m.content.startsWith("【经验本】"))).toBe(false)
  })

  it("有图鉴摘要但无经验本时，图鉴摘要仍注入", () => {
    const { methods } = makeModule()
    const payload = { catalogSummary: { totalArtifacts: 73 } }
    const fakeThis = { round: 1 } as unknown as WarehouseSceneThis
    const messages = methods.buildAiDecisionMessages.call(fakeThis, payload, {
      systemPrompt: "SYS",
      historyMessages: [],
    }) as Array<{ role: string; content: string }>
    expect(messages.some((m) => m.content.startsWith("【图鉴摘要】"))).toBe(true)
  })
})
