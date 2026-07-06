import { describe, it, expect } from "vitest"
import { AuctionAiEngine } from "../../../scripts/game/ai/bidding"

describe("ai/bidding - AuctionAiEngine", () => {
  describe("resetForNewRun", () => {
    it("清空 aiState", () => {
      const engine = new AuctionAiEngine()
      engine.aiState.set("p1", { anchorBid: 100, psychExpectedBid: 100, lastBid: 100 })
      engine.resetForNewRun()
      expect(engine.aiState.size).toBe(0)
    })

    it("startingBid 最小 100000", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 1000 })
      expect(engine.runMeta.startingBid).toBe(100000)
    })

    it("itemCount 最小 0", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ itemCount: -5 })
      expect(engine.runMeta.itemCount).toBe(0)
    })

    it("接受合法上下文", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 200000, itemCount: 12 })
      expect(engine.runMeta.startingBid).toBe(200000)
      expect(engine.runMeta.itemCount).toBe(12)
    })

    it("清空 lastDecisionLog", () => {
      const engine = new AuctionAiEngine()
      engine.lastDecisionLog = { round: 1, entries: [] }
      engine.resetForNewRun()
      expect(engine.lastDecisionLog).toBeNull()
    })
  })

  describe("buildToolEffect", () => {
    it("actionType=none 返回无工具效果", () => {
      const engine = new AuctionAiEngine()
      const effect = engine.buildToolEffect({ actionType: "none", actionId: "x" })
      expect(effect.tag).toBe("无工具")
      expect(effect.confidenceBoost).toBe(0)
      expect(effect.capBoost).toBe(0)
      expect(effect.planScore).toBe(0)
    })

    it("actionId=none 返回无工具效果", () => {
      const engine = new AuctionAiEngine()
      const effect = engine.buildToolEffect({ actionType: "skill", actionId: "none" })
      expect(effect.tag).toBe("无工具")
    })

    it("actionId 含 quality → tag 候选鉴质", () => {
      const engine = new AuctionAiEngine()
      const effect = engine.buildToolEffect({ actionType: "skill", actionId: "skill-quality-jade" })
      expect(effect.tag).toBe("候选鉴质")
    })

    it("actionId 含 outline → tag 候选拓影", () => {
      const engine = new AuctionAiEngine()
      const effect = engine.buildToolEffect({ actionType: "item", actionId: "item-outline-lamp" })
      expect(effect.tag).toBe("候选拓影")
    })

    it("各 boost 在合法范围", () => {
      const engine = new AuctionAiEngine()
      const effect = engine.buildToolEffect({
        actionType: "skill",
        actionId: "skill-quality-jade",
        roundProgress: 0.5,
        intelSummary: { qualityRate: 0.6, spreadRatio: 0.3 },
        signalStats: { qualitySignalRate: 0.5, outlineSignalRate: 0.4, signalCount: 3, aggregate: { count: 5, spreadRatio: 0.3, upperEdge: 0.2, lowerEdge: 0.1 } },
        planScore: 0.7
      })
      expect(effect.confidenceBoost).toBeGreaterThanOrEqual(-0.05)
      expect(effect.confidenceBoost).toBeLessThanOrEqual(0.24)
      expect(effect.uncertaintyReduction).toBeGreaterThanOrEqual(0)
      expect(effect.uncertaintyReduction).toBeLessThanOrEqual(0.32)
      expect(effect.strategyScoreBoost).toBeGreaterThanOrEqual(-0.25)
      expect(effect.strategyScoreBoost).toBeLessThanOrEqual(0.9)
    })
  })

  describe("applyCrowdDiversity", () => {
    it("出价相同的两个 AI 被拉开差距", () => {
      const engine = new AuctionAiEngine()
      const aiPlayers = [{ id: "p1" }, { id: "p3" }]
      const bidMap: Record<string, number> = { p1: 200000, p3: 200000 }
      const decisionMap: Record<string, any> = { p1: { playerId: "p1" }, p3: { playerId: "p3" } }
      engine.applyCrowdDiversity({
        aiPlayers,
        decisionMap,
        bidMap,
        currentBid: 100000,
        bidStep: 10000
      })
      // spacing = max(10000*5, 100000*0.015) = 50000
      expect(Math.abs(bidMap.p3 - bidMap.p1)).toBeGreaterThanOrEqual(40000)
      expect(decisionMap.p1.diversifyTag).toBeDefined()
      expect(decisionMap.p3.diversifyTag).toBeDefined()
    })

    it("已拉开差距的 AI 不再调整", () => {
      const engine = new AuctionAiEngine()
      const aiPlayers = [{ id: "p1" }, { id: "p3" }]
      const bidMap: Record<string, number> = { p1: 100000, p3: 300000 }
      const decisionMap: Record<string, any> = { p1: { playerId: "p1" }, p3: { playerId: "p3" } }
      const beforeP1 = bidMap.p1
      const beforeP3 = bidMap.p3
      engine.applyCrowdDiversity({
        aiPlayers,
        decisionMap,
        bidMap,
        currentBid: 100000,
        bidStep: 10000
      })
      // diff=200000 >= spacing=50000，不调整
      expect(bidMap.p1).toBe(beforeP1)
      expect(bidMap.p3).toBe(beforeP3)
      expect(decisionMap.p1.diversifyTag).toBeUndefined()
    })

    it("未设置 bidMap 的玩家按 0 处理", () => {
      const engine = new AuctionAiEngine()
      const aiPlayers = [{ id: "p1" }, { id: "p4" }]
      const bidMap: Record<string, number> = { p1: 200000 }
      const decisionMap: Record<string, any> = { p1: {}, p4: {} }
      engine.applyCrowdDiversity({
        aiPlayers,
        decisionMap,
        bidMap,
        currentBid: 100000,
        bidStep: 10000
      })
      // p4 bid 视为 0，diff=200000 >= spacing，不调整，末尾归一化为 0
      expect(bidMap.p4).toBe(0)
    })
  })
})
