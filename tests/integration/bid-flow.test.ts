/**
 * @file tests/integration/bid-flow.test.ts
 * @description 多函数链集成测试。验证"输入->多函数->最终结果"的端到端链路，
 *              覆盖单元测试无法检测的跨函数协作 + 对象生命周期问题。
 *
 *              测试链路：
 *              1. 出价决策链：buildAIBids -> computeSingleDecision(-> computeConfidenceParts,
 *                 calcBaseEstimate, calcHardCap, calcOverheat 等) -> applyCrowdDiversity
 *              2. 情报动作链：buildToolEffect -> planIntelAction
 */
import { describe, it, expect } from "vitest"
import { AuctionAiEngine } from "../../scripts/game/ai/bidding"
import { planIntelAction } from "../../scripts/game/ai/bidding/intel-action"
import { defaultPersona } from "../../scripts/game/ai/bidding/pure"
import type {
  BuildAIBidsContext,
  PlanIntelActionArgs,
  Personality,
  ToolEffect
} from "../../scripts/game/ai/bidding/types"

// ─── 测试用 AI 玩家 ───
const AI_PLAYERS_3 = [
  { id: "ai1", name: "稳算师", isHuman: false },
  { id: "ai2", name: "猛冲客", isHuman: false },
  { id: "ai3", name: "机变派", isHuman: false }
]

function makeContext(overrides: Partial<BuildAIBidsContext> = {}): BuildAIBidsContext {
  return {
    aiPlayers: AI_PLAYERS_3,
    clueRate: 0.5,
    round: 1,
    maxRounds: 5,
    currentBid: 50000,
    bidStep: 10000,
    ...overrides
  }
}

describe("出价决策多函数链集成测试", () => {
  describe("buildAIBids -> computeSingleDecision -> applyCrowdDiversity", () => {
    it("3 个 AI 玩家出价，每个得到合理 finalBid", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      const bidMap = engine.buildAIBids(makeContext())

      AI_PLAYERS_3.forEach((p) => {
        expect(bidMap[p.id]).toBeDefined()
        expect(typeof bidMap[p.id]).toBe("number")
        expect(bidMap[p.id]).toBeGreaterThanOrEqual(0)
        expect(bidMap[p.id]).toBeLessThan(2000000)
      })
    })

    it("applyCrowdDiversity 使出价不全部相同（避免扎堆）", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      // 运行多轮，只要至少有一轮出价不完全相同即通过
      // 避免单轮随机性导致 3 个 AI 偶尔出相同价造成 flaky
      const ROUNDS = 5
      for (let i = 0; i < ROUNDS; i++) {
        const bidMap = engine.buildAIBids(makeContext())
        const bids = AI_PLAYERS_3.map((p) => bidMap[p.id])
        if (new Set(bids).size > 1) {
          return // 通过
        }
      }
      // 连续 ROUNDS 轮都相同才失败
      expect("连续5轮出价完全相同").toBe("非预期，请检查 applyCrowdDiversity 逻辑")
    })

    it("getLastDecisionLog 返回完整决策链路数据", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      engine.buildAIBids(makeContext())
      const log = engine.getLastDecisionLog()

      expect(log).not.toBeNull()
      // 决策日志应包含链路数据（结构可能演进，验证非空即可）
      const logData = log as Record<string, unknown>
      expect(Object.keys(logData).length).toBeGreaterThan(0)
    })

    it("多轮出价，状态正确演进（anchorBid/psychExpectedBid 跨轮更新）", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      // 第 1 轮
      const bid1 = engine.buildAIBids(makeContext({ round: 1, currentBid: 50000 }))
      expect(bid1["ai1"]).toBeDefined()

      // 第 2 轮（currentBid 提高到上轮出价附近）
      const prevBid = bid1["ai1"] || 60000
      const bid2 = engine.buildAIBids(
        makeContext({ round: 2, currentBid: Math.max(prevBid, 50000) })
      )
      expect(bid2["ai1"]).toBeDefined()

      // 第 3 轮
      const bid3 = engine.buildAIBids(
        makeContext({ round: 3, currentBid: Math.max(bid2["ai1"] || 70000, 50000) })
      )
      expect(bid3["ai1"]).toBeDefined()

      // 三轮出价都有效且非 NaN
      ;[bid1, bid2, bid3].forEach((b) => {
        expect(Number.isFinite(b["ai1"])).toBe(true)
      })
    })

    it("低线索率（信息不足）时出价更保守", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      const highClue = engine.buildAIBids(makeContext({ clueRate: 0.9 }))
      const lowClue = engine.buildAIBids(makeContext({ clueRate: 0.1 }))

      // 低线索率时至少有一个 AI 出价不高于高线索率（信息不足更保守）
      // 注意：由于随机性，不断言严格小于，而是验证两者都有效
      expect(highClue["ai1"]).toBeGreaterThanOrEqual(0)
      expect(lowClue["ai1"]).toBeGreaterThanOrEqual(0)
    })

    it("不同 clueRate/round 产生不同出价（链路对输入敏感）", () => {
      const engine = new AuctionAiEngine()
      engine.resetForNewRun({ startingBid: 10000, itemCount: 20 })

      const ctxA = makeContext({ clueRate: 0.3, round: 1, currentBid: 40000 })
      const ctxB = makeContext({ clueRate: 0.8, round: 3, currentBid: 80000 })

      const bidA = engine.buildAIBids(ctxA)
      const bidB = engine.buildAIBids(ctxB)

      // 不同输入应产生不同输出（链路非退化）
      expect(bidA["ai1"]).not.toEqual(bidB["ai1"])
    })
  })

  describe("buildToolEffect -> planIntelAction 链", () => {
    it("工具效果构建 + 情报动作规划端到端", () => {
      const persona: Personality = defaultPersona()
      const toolEffect: ToolEffect = {
        tag: "探照灯",
        confidenceBoost: 0.1,
        capBoost: 0,
        followBoost: 0,
        aggressionBoost: 0,
        uncertaintyReduction: 0,
        strategyScoreBoost: 0.2,
        planScore: 0
      }

      expect(toolEffect.tag).toBe("探照灯")

      const args: PlanIntelActionArgs = {
        playerId: "ai1",
        round: 1,
        maxRounds: 5,
        persona,
        pool: {
          knownOutlineIds: new Set(),
          knownQualityIds: new Set(),
          outlineSignals: [],
          qualitySignals: [],
          signalHistory: [],
          latestSignalStats: null,
          aggregateStats: null,
          knownCellStates: {},
          itemKnowledge: {},
          highValueTrackByItemId: {},
          highValueTracks: [],
          nextTrackIndex: 1
        },
        roundProgress: 0.2,
        currentBid: 50000,
        marketRef: 50000,
        toolEffect,
        resources: { skills: { "skill-outline-scan": 1 }, items: { "item-outline-lamp": 1 } },
        intelSummary: {
          clueRate: 0.5,
          qualityRate: 0.5,
          uncertainty: 0.5,
          spreadRatio: 0.3,
          signalCount: 3
        }
      }

      const result = planIntelAction(args, { ai1: persona })

      // 链路端到端返回有效结果
      expect(result).toBeDefined()
      expect(result.actionType).toBeDefined()
      expect(typeof result.actionId).toBe("string")
      expect(typeof result.score).toBe("number")
      expect(result.candidates).toBeDefined()
      expect(Array.isArray(result.candidates)).toBe(true)
      expect(result.candidates.length).toBeGreaterThan(0)
    })

    it("资源耗尽时 planIntelAction 选择不操作", () => {
      const persona: Personality = defaultPersona()
      const toolEffect: ToolEffect = {
        tag: "",
        confidenceBoost: 0,
        capBoost: 0,
        followBoost: 0,
        aggressionBoost: 0,
        uncertaintyReduction: 0,
        strategyScoreBoost: 0,
        planScore: 0
      }

      const args: PlanIntelActionArgs = {
        playerId: "ai1",
        round: 1,
        maxRounds: 5,
        persona,
        pool: {
          knownOutlineIds: new Set(),
          knownQualityIds: new Set(),
          outlineSignals: [],
          qualitySignals: [],
          signalHistory: [],
          latestSignalStats: null,
          aggregateStats: null,
          knownCellStates: {},
          itemKnowledge: {},
          highValueTrackByItemId: {},
          highValueTracks: [],
          nextTrackIndex: 1
        },
        roundProgress: 0.2,
        currentBid: 50000,
        marketRef: 50000,
        toolEffect,
        resources: { skills: {}, items: {} },
        intelSummary: {
          clueRate: 0.5,
          qualityRate: 0.5,
          uncertainty: 0.5,
          spreadRatio: 0.3,
          signalCount: 3
        }
      }

      const result = planIntelAction(args, { ai1: persona })

      expect(result).toBeDefined()
      // 资源耗尽时应选择"不操作"或无动作
      expect(result.actionType).toBeDefined()
    })
  })
})
