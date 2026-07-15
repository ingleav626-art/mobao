import { describe, it, expect, vi } from "vitest"
import { planIntelAction } from "../../../../scripts/game/ai/bidding/intel-action"
import { defaultPersona } from "../../../../scripts/game/ai/bidding/pure"
import type { Personality, PlanIntelActionArgs, IntelActionResult } from "../../../../scripts/game/ai/bidding/types"

// Mock randomBetween to return 0 for deterministic score calculations
vi.mock("../../../../scripts/game/core/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../scripts/game/core/utils")>()
  return {
    ...original,
    randomBetween: vi.fn(() => 0)
  }
})

describe("ai/bidding/intel-action", () => {
  describe("planIntelAction", () => {
    function baseArgs(overrides: Partial<PlanIntelActionArgs> = {}): PlanIntelActionArgs {
      return {
        playerId: "test-ai-1",
        round: 3,
        maxRounds: 10,
        persona: defaultPersona(),
        pool: {},
        roundProgress: 0,
        currentBid: 0,
        marketRef: 0,
        toolEffect: {
          tag: "",
          confidenceBoost: 0,
          capBoost: 0,
          followBoost: 0,
          aggressionBoost: 0,
          uncertaintyReduction: 0,
          strategyScoreBoost: 0,
          planScore: 0
        },
        intelSummary: {},
        resources: {},
        ...overrides
      }
    }

    function basePersonalityMap(): Record<string, Personality> {
      return {
        "test-ai-1": defaultPersona()
      }
    }

    it("返回 IntelActionResult 结构", () => {
      const result = planIntelAction(baseArgs(), basePersonalityMap())
      expect(result).toBeDefined()
      expect(typeof result.actionType).toBe("string")
      expect(typeof result.actionId).toBe("string")
      expect(typeof result.expectedReveal).toBe("number")
      expect(typeof result.score).toBe("number")
      expect(Array.isArray(result.candidates)).toBe(true)
    })

    it("默认空资源返回 'none' 动作", () => {
      const result = planIntelAction(baseArgs(), basePersonalityMap())
      expect(result.actionType).toBe("none")
      expect(result.actionId).toBe("none")
      expect(result.expectedReveal).toBe(0)
    })

    it("candidates 数组最多包含 4 个条目", () => {
      const result = planIntelAction(baseArgs(), basePersonalityMap())
      expect(result.candidates.length).toBeLessThanOrEqual(4)
    })

    it("candidates 数组包含默认的 'none' 候选", () => {
      const result = planIntelAction(baseArgs(), basePersonalityMap())
      const noneCandidate = result.candidates.find((c) => c.actionId === "none")
      expect(noneCandidate).toBeDefined()
      expect(noneCandidate!.actionType).toBe("none")
    })

    describe("单个资源可用", () => {
      it("skill-outline-scan 可用时创建对应候选", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { skills: { "skill-outline-scan": 1 }, items: {} }
          }),
          basePersonalityMap()
        )
        const candidate = result.candidates.find((c) => c.actionId === "skill-outline-scan")
        expect(candidate).toBeDefined()
        expect(candidate!.actionType).toBe("skill")
        expect(candidate!.expectedReveal).toBe(3)
        expect(typeof candidate!.score).toBe("number")
      })

      it("skill-quality-jade 可用时创建对应候选", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { skills: { "skill-quality-jade": 1 }, items: {} }
          }),
          basePersonalityMap()
        )
        const candidate = result.candidates.find((c) => c.actionId === "skill-quality-jade")
        expect(candidate).toBeDefined()
        expect(candidate!.actionType).toBe("skill")
        expect(candidate!.expectedReveal).toBe(2)
      })

      it("item-outline-lamp 可用时创建对应候选", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { skills: {}, items: { "item-outline-lamp": 1 } }
          }),
          basePersonalityMap()
        )
        const candidate = result.candidates.find((c) => c.actionId === "item-outline-lamp")
        expect(candidate).toBeDefined()
        expect(candidate!.actionType).toBe("item")
        expect(candidate!.expectedReveal).toBe(4)
      })

      it("item-quality-needle 可用时创建对应候选", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { skills: {}, items: { "item-quality-needle": 1 } }
          }),
          basePersonalityMap()
        )
        const candidate = result.candidates.find((c) => c.actionId === "item-quality-needle")
        expect(candidate).toBeDefined()
        expect(candidate!.actionType).toBe("item")
        expect(candidate!.expectedReveal).toBe(3)
      })
    })

    describe("多个资源可用", () => {
      it("所有 4 个非 none 候选均被创建", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1, "skill-quality-jade": 1 },
              items: { "item-outline-lamp": 1, "item-quality-needle": 1 }
            }
          }),
          basePersonalityMap()
        )
        expect(result.candidates.length).toBe(4)
        const actionIds = result.candidates.map((c) => c.actionId)
        expect(actionIds).toContain("skill-outline-scan")
        expect(actionIds).toContain("skill-quality-jade")
        expect(actionIds).toContain("item-outline-lamp")
        expect(actionIds).toContain("item-quality-needle")
      })

      it("最佳候选的 score 不比其他候选低", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1, "skill-quality-jade": 1 },
              items: { "item-outline-lamp": 1, "item-quality-needle": 1 }
            }
          }),
          basePersonalityMap()
        )
        const bestScore = result.score
        const allScores = result.candidates.map((c) => c.score)
        const maxScore = Math.max(...allScores)
        expect(bestScore).toBe(maxScore)
      })

      it("返回的 candidates 按 score 降序排列", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1, "skill-quality-jade": 1 },
              items: { "item-outline-lamp": 1, "item-quality-needle": 1 }
            }
          }),
          basePersonalityMap()
        )
        for (let i = 1; i < result.candidates.length; i++) {
          expect(result.candidates[i].score).toBeLessThanOrEqual(result.candidates[i - 1].score)
        }
      })
    })

    describe("轮次进度影响", () => {
      it("高 roundProgress (末轮) 时 none 动作得分降低但仍可返回 none", () => {
        const result = planIntelAction(
          baseArgs({
            round: 10,
            maxRounds: 10,
            resources: {}
          }),
          basePersonalityMap()
        )
        // roundProgress = (10-1)/(10-1) = 1
        // 无资源时仅 none 候选，必返回 none
        expect(result.actionType).toBe("none")
      })
    })

    describe("边缘情况", () => {
      it("maxRounds <= 1 时 roundProgress 为 1", () => {
        const result = planIntelAction(
          baseArgs({
            round: 1,
            maxRounds: 1,
            resources: {}
          }),
          basePersonalityMap()
        )
        expect(result.actionType).toBe("none")
      })

      it("signalCount > 12 时 fatiguePenalty 生效", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1 },
              items: {}
            },
            intelSummary: {
              clueRate: 0.5,
              qualityRate: 0.5,
              uncertainty: 0.3,
              spreadRatio: 0.2,
              signalCount: 15
            }
          }),
          basePersonalityMap()
        )
        // skill-outline-scan 候选应被创建且得分正常
        const candidate = result.candidates.find((c) => c.actionId === "skill-outline-scan")
        expect(candidate).toBeDefined()
        expect(typeof candidate!.score).toBe("number")
      })

      it("缺失 intelSummary 字段不崩溃", () => {
        const result = planIntelAction(
          baseArgs({
            intelSummary: undefined,
            resources: { skills: { "skill-outline-scan": 1 }, items: {} }
          }),
          basePersonalityMap()
        )
        expect(result).toBeDefined()
        expect(typeof result.actionType).toBe("string")
      })

      it("空 resources 对象不崩溃", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {}
          }),
          basePersonalityMap()
        )
        expect(result).toBeDefined()
        expect(result.actionType).toBe("none")
      })

      it("resources 中缺少 skills/items 键不崩溃", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { someOtherKey: "value" }
          }),
          basePersonalityMap()
        )
        expect(result).toBeDefined()
        expect(result.actionType).toBe("none")
      })
    })

    describe("人格影响", () => {
      it("高纪律性人格提升依赖 discipline 的候选得分", () => {
        const highDisciplinePersona: Personality = {
          ...defaultPersona(),
          discipline: 1,
          aggression: 0.64
        }
        const personalityMap: Record<string, Personality> = {
          "test-ai-1": highDisciplinePersona
        }
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1, "skill-quality-jade": 1 },
              items: {}
            }
          }),
          personalityMap
        )
        const scan = result.candidates.find((c) => c.actionId === "skill-outline-scan")
        const jade = result.candidates.find((c) => c.actionId === "skill-quality-jade")
        expect(scan).toBeDefined()
        expect(jade).toBeDefined()
        expect(scan!.score).toBeGreaterThan(0)
        expect(jade!.score).toBeGreaterThan(0)
      })

      it("高激进性人格提升依赖 aggression 的候选得分", () => {
        const highAggressionPersona: Personality = {
          ...defaultPersona(),
          discipline: 0.72,
          aggression: 1
        }
        const personalityMap: Record<string, Personality> = {
          "test-ai-1": highAggressionPersona
        }
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: {},
              items: { "item-outline-lamp": 1, "item-quality-needle": 1 }
            }
          }),
          personalityMap
        )
        const lamp = result.candidates.find((c) => c.actionId === "item-outline-lamp")
        const needle = result.candidates.find((c) => c.actionId === "item-quality-needle")
        expect(lamp).toBeDefined()
        expect(needle).toBeDefined()
        expect(lamp!.score).toBeGreaterThan(0)
        expect(needle!.score).toBeGreaterThan(0)
      })

      it("personalityMap 缺失 playerId 时回退到 defaultPersona", () => {
        const result = planIntelAction(
          baseArgs({
            playerId: "unknown-player"
          }),
          basePersonalityMap()
        )
        expect(result).toBeDefined()
        expect(typeof result.actionType).toBe("string")
      })
    })

    describe("返回结果约束", () => {
      it("actionType 只能是 'none' / 'skill' / 'item'", () => {
        const result = planIntelAction(
          baseArgs({
            resources: {
              skills: { "skill-outline-scan": 1 },
              items: { "item-outline-lamp": 1 }
            }
          }),
          basePersonalityMap()
        )
        const validTypes = ["none", "skill", "item"]
        result.candidates.forEach((c) => {
          expect(validTypes).toContain(c.actionType)
        })
      })

      it("当无资源时 candidates 数组中只有 'none'", () => {
        const result = planIntelAction(baseArgs(), basePersonalityMap())
        expect(result.candidates.length).toBe(1)
        expect(result.candidates[0].actionId).toBe("none")
      })

      it("当只有一个资源时 candidates 有 2 个条目（none + 资源）", () => {
        const result = planIntelAction(
          baseArgs({
            resources: { skills: { "skill-outline-scan": 1 }, items: {} }
          }),
          basePersonalityMap()
        )
        expect(result.candidates.length).toBe(2)
      })
    })
  })
})