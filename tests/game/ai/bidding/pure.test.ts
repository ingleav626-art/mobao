import { describe, it, expect } from "vitest"
import {
  defaultPersona,
  normalizeToolEffect,
  marketReference,
  buildToolEffect,
  computeConfidenceParts,
  applyCrowdDiversity
} from "../../../../scripts/game/ai/bidding/pure"
import type { Personality } from "../../../../scripts/game/ai/bidding/types"

describe("ai/bidding/pure", () => {
  describe("defaultPersona", () => {
    it("返回结构完整、字段类型合法的默认人格", () => {
      const persona = defaultPersona()
      expect(persona).toBeDefined()
      expect(typeof persona.name).toBe("string")
      expect(typeof persona.archetype).toBe("string")
      expect(typeof persona.aggression).toBe("number")
      expect(typeof persona.discipline).toBe("number")
      expect(typeof persona.followRate).toBe("number")
      expect(typeof persona.bluffRate).toBe("number")
      expect(typeof persona.errorRate).toBe("number")
      expect(typeof persona.anchorMin).toBe("number")
      expect(typeof persona.anchorMax).toBe("number")
      expect(typeof persona.openRaiseRatio).toBe("number")
      expect(typeof persona.crowdBias).toBe("number")
      expect(typeof persona.expectationElasticity).toBe("number")
      expect(typeof persona.retreatFactor).toBe("number")
      expect(typeof persona.noInfoAdjustMin).toBe("number")
      expect(typeof persona.noInfoAdjustMax).toBe("number")
    })

    it("anchorMin <= anchorMax", () => {
      const persona = defaultPersona()
      expect(persona.anchorMin).toBeLessThanOrEqual(persona.anchorMax)
    })

    it("每次调用返回新对象（不共享引用）", () => {
      const a = defaultPersona()
      const b = defaultPersona()
      a.aggression = 999
      expect(b.aggression).not.toBe(999)
    })
  })

  describe("normalizeToolEffect", () => {
    it("空输入返回全零默认值", () => {
      const result = normalizeToolEffect()
      expect(result.tag).toBe("")
      expect(result.confidenceBoost).toBe(0)
      expect(result.capBoost).toBe(0)
      expect(result.followBoost).toBe(0)
      expect(result.aggressionBoost).toBe(0)
      expect(result.uncertaintyReduction).toBe(0)
      expect(result.strategyScoreBoost).toBe(0)
      expect(result.planScore).toBe(0)
    })

    it("超出上界的值被 clamp 到合法范围", () => {
      const result = normalizeToolEffect({
        tag: "test",
        confidenceBoost: 999,
        capBoost: 999,
        followBoost: 999,
        aggressionBoost: 999,
        uncertaintyReduction: 999,
        strategyScoreBoost: 999,
        planScore: 999
      })
      expect(result.confidenceBoost).toBe(0.45)
      expect(result.capBoost).toBe(0.25)
      expect(result.followBoost).toBe(0.3)
      expect(result.aggressionBoost).toBe(0.3)
      expect(result.uncertaintyReduction).toBe(0.45)
      expect(result.strategyScoreBoost).toBe(1.6)
    })

    it("低于下界的值被 clamp 到合法范围", () => {
      const result = normalizeToolEffect({
        tag: "test",
        confidenceBoost: -999,
        capBoost: -999,
        followBoost: -999,
        aggressionBoost: -999,
        uncertaintyReduction: -999,
        strategyScoreBoost: -999,
        planScore: -999
      })
      expect(result.confidenceBoost).toBe(-0.2)
      expect(result.capBoost).toBe(-0.2)
      expect(result.followBoost).toBe(-0.2)
      expect(result.aggressionBoost).toBe(-0.2)
      expect(result.uncertaintyReduction).toBe(0)
      expect(result.strategyScoreBoost).toBe(-0.4)
      // planScore 仅做 Number || 0（捕获 NaN/null/undefined），不做 clamp，负值原样保留
      expect(result.planScore).toBe(-999)
    })

    it("tag 缺失时默认空串", () => {
      const result = normalizeToolEffect({ tag: null })
      expect(result.tag).toBe("")
    })
  })

  describe("marketReference", () => {
    it("无上轮出价时回退到 max(currentBid, fallback)", () => {
      const result = marketReference(100000, {}, 120000)
      expect(result).toBe(120000)
    })

    it("无上轮出价且 fallback 为 0 时返回 currentBid", () => {
      const result = marketReference(100000, {}, 0)
      expect(result).toBe(100000)
    })

    it("单个上轮出价时取 max(currentBid, avg*0.62+top*0.38)", () => {
      // avg=200000, top=200000 => 200000*0.62+200000*0.38=200000
      const result = marketReference(100000, { p1: 200000 }, 0)
      expect(result).toBe(200000)
    })

    it("多个上轮出价时加权计算且不低于 currentBid", () => {
      // avg=(100000+300000)/2=200000, top=300000 => 200000*0.62+300000*0.38=124000+114000=238000
      const result = marketReference(100000, { p1: 100000, p2: 300000 }, 0)
      expect(result).toBe(238000)
    })

    it("currentBid 高于加权值时返回 currentBid", () => {
      const result = marketReference(500000, { p1: 100000, p2: 200000 }, 0)
      // avg=150000, top=200000 => 150000*0.62+200000*0.38=93000+76000=169000 < 500000
      expect(result).toBe(500000)
    })
  })

  describe("buildToolEffect", () => {
    it("actionType=none 返回无工具效果", () => {
      const effect = buildToolEffect({ actionType: "none", actionId: "x" })
      expect(effect.tag).toBe("无工具")
      expect(effect.confidenceBoost).toBe(0)
      expect(effect.capBoost).toBe(0)
      expect(effect.planScore).toBe(0)
    })

    it("actionId=none 返回无工具效果", () => {
      const effect = buildToolEffect({ actionType: "skill", actionId: "none" })
      expect(effect.tag).toBe("无工具")
    })

    it("actionId 含 quality -> tag 候选鉴质", () => {
      const effect = buildToolEffect({ actionType: "skill", actionId: "skill-quality-jade" })
      expect(effect.tag).toBe("候选鉴质")
    })

    it("actionId 含 outline -> tag 候选拓影", () => {
      const effect = buildToolEffect({ actionType: "item", actionId: "item-outline-lamp" })
      expect(effect.tag).toBe("候选拓影")
    })

    it("各 boost 在合法范围", () => {
      const effect = buildToolEffect({
        actionType: "skill",
        actionId: "skill-quality-jade",
        roundProgress: 0.5,
        intelSummary: { qualityRate: 0.6, spreadRatio: 0.3 },
        signalStats: {
          qualitySignalRate: 0.5,
          outlineSignalRate: 0.4,
          signalCount: 3,
          aggregate: { count: 5, spreadRatio: 0.3, upperEdge: 0.2, lowerEdge: 0.1 }
        },
        planScore: 0.7
      })
      expect(effect.confidenceBoost).toBeGreaterThanOrEqual(-0.05)
      expect(effect.confidenceBoost).toBeLessThanOrEqual(0.24)
      expect(effect.uncertaintyReduction).toBeGreaterThanOrEqual(0)
      expect(effect.uncertaintyReduction).toBeLessThanOrEqual(0.32)
      expect(effect.strategyScoreBoost).toBeGreaterThanOrEqual(-0.25)
      expect(effect.strategyScoreBoost).toBeLessThanOrEqual(0.9)
    })

    it("默认参数（空对象）返回无工具效果", () => {
      const effect = buildToolEffect()
      expect(effect.tag).toBe("无工具")
    })
  })

  describe("computeConfidenceParts", () => {
    const baseArgs = {
      clueRate: 0.5,
      qualityRate: 0.5,
      uncertainty: 0.3,
      spreadRatio: 0.2,
      upperEdge: 0.1,
      lowerEdge: 0,
      roundProgress: 0.5,
      currentBid: 100000,
      marketRef: 120000,
      persona: {
        name: "test",
        archetype: "test",
        aggression: 0.6,
        discipline: 0.7,
        followRate: 0.4,
        bluffRate: 0.2,
        errorRate: 0.05,
        anchorMin: 1.3,
        anchorMax: 1.9,
        openRaiseRatio: 0.06,
        crowdBias: 0,
        expectationElasticity: 0.5,
        retreatFactor: 0.5,
        noInfoAdjustMin: -0.04,
        noInfoAdjustMax: 0.05
      } as Personality,
      toolEffect: {
        tag: "",
        confidenceBoost: 0.1,
        capBoost: 0,
        followBoost: 0,
        aggressionBoost: 0,
        uncertaintyReduction: 0,
        strategyScoreBoost: 0.1,
        planScore: 0
      }
    }

    it("base 固定为 0.8", () => {
      const parts = computeConfidenceParts(baseArgs)
      expect(parts.base).toBe(0.8)
    })

    it("total 在 0~1 范围内", () => {
      const parts = computeConfidenceParts(baseArgs)
      expect(parts.total).toBeGreaterThanOrEqual(0)
      expect(parts.total).toBeLessThanOrEqual(1)
    })

    it("market 部分不超过 0.16 上限", () => {
      // 极大的 marketRef 差距
      const parts = computeConfidenceParts({ ...baseArgs, marketRef: 99999999, currentBid: 1 })
      expect(parts.market).toBeLessThanOrEqual(0.16)
      expect(parts.market).toBeGreaterThanOrEqual(0)
    })

    it("tool 部分在 -0.06~0.16 范围内", () => {
      const parts = computeConfidenceParts(baseArgs)
      expect(parts.tool).toBeGreaterThanOrEqual(-0.06)
      expect(parts.tool).toBeLessThanOrEqual(0.16)
    })

    it("edgeBonus 在 -0.08~0.14 范围内", () => {
      const parts = computeConfidenceParts(baseArgs)
      expect(parts.edgeBonus).toBeGreaterThanOrEqual(-0.08)
      expect(parts.edgeBonus).toBeLessThanOrEqual(0.14)
    })

    it("mood 在合理范围（受纪律性抑制）", () => {
      const parts = computeConfidenceParts(baseArgs)
      // mood = randomBetween(-0.08, 0.08) * (1 - 0.7*0.6) = random * 0.58
      expect(parts.mood).toBeGreaterThanOrEqual(-0.08)
      expect(parts.mood).toBeLessThanOrEqual(0.08)
    })

    it("零不确定性、高线索率时 total 偏高", () => {
      const highParts = computeConfidenceParts({
        ...baseArgs,
        clueRate: 1,
        qualityRate: 1,
        uncertainty: 0,
        spreadRatio: 0,
        upperEdge: 0.3,
        lowerEdge: 0,
        persona: { ...baseArgs.persona, discipline: 1, aggression: 1 },
        toolEffect: {
          tag: "",
          confidenceBoost: 0.45,
          capBoost: 0,
          followBoost: 0,
          aggressionBoost: 0,
          uncertaintyReduction: 0.45,
          strategyScoreBoost: 1.6,
          planScore: 0
        }
      })
      expect(highParts.total).toBeGreaterThan(0.8)
    })
  })

  describe("applyCrowdDiversity", () => {
    const personalityMap: Record<string, Personality> = {
      p1: { ...defaultPersona(), crowdBias: -0.35 },
      p3: { ...defaultPersona(), crowdBias: 0.48 }
    }

    it("出价相同的两个 AI 被拉开差距", () => {
      const aiPlayers = [{ id: "p1" }, { id: "p3" }]
      const bidMap: Record<string, number> = { p1: 200000, p3: 200000 }
      const decisionMap: Record<string, any> = { p1: { playerId: "p1" }, p3: { playerId: "p3" } }
      applyCrowdDiversity(
        {
          aiPlayers,
          decisionMap,
          bidMap,
          currentBid: 100000,
          bidStep: 10000
        },
        personalityMap
      )
      // spacing = max(10000*5, 100000*0.015) = 50000
      expect(Math.abs(bidMap.p3 - bidMap.p1)).toBeGreaterThanOrEqual(40000)
      expect(decisionMap.p1.diversifyTag).toBeDefined()
      expect(decisionMap.p3.diversifyTag).toBeDefined()
    })

    it("已拉开差距的 AI 不再调整", () => {
      const aiPlayers = [{ id: "p1" }, { id: "p3" }]
      const bidMap: Record<string, number> = { p1: 100000, p3: 300000 }
      const decisionMap: Record<string, any> = { p1: { playerId: "p1" }, p3: { playerId: "p3" } }
      const beforeP1 = bidMap.p1
      const beforeP3 = bidMap.p3
      applyCrowdDiversity(
        {
          aiPlayers,
          decisionMap,
          bidMap,
          currentBid: 100000,
          bidStep: 10000
        },
        personalityMap
      )
      // diff=200000 >= spacing=50000，不调整
      expect(bidMap.p1).toBe(beforeP1)
      expect(bidMap.p3).toBe(beforeP3)
      expect(decisionMap.p1.diversifyTag).toBeUndefined()
    })

    it("未设置 bidMap 的玩家按 0 处理", () => {
      const aiPlayers = [{ id: "p1" }, { id: "p3" }]
      const bidMap: Record<string, number> = { p1: 200000 }
      const decisionMap: Record<string, any> = { p1: {}, p3: {} }
      applyCrowdDiversity(
        {
          aiPlayers,
          decisionMap,
          bidMap,
          currentBid: 100000,
          bidStep: 10000
        },
        personalityMap
      )
      // p3 bid 视为 0，diff=200000 >= spacing，末尾归一化为 0
      expect(bidMap.p3).toBe(0)
    })
  })
})
