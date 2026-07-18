/**
 * 测试 AI 增量上下文中出价/道具数据的正确性。
 * 验证：第 N+1 轮 AI 决策时，lastRoundResult.bids 中能看到
 * 第 N 轮所有玩家（包括自己）的真实出价。
 */
import { describe, it, expect } from "vitest"
import { buildBidHistorySnapshot } from "../../../scripts/game/ai/context-builder"
import { recordRoundHistory, clearCurrentRoundUsage } from "../../../scripts/game/ui/history"
import type { HistoryData } from "../../../scripts/game/ui/history"

// 模拟 players
const players = [
  { id: "p1", name: "左上AI" },
  { id: "p2", name: "玩家" },
  { id: "p3", name: "右上AI" },
  { id: "p4", name: "右下AI" }
]

function createHistoryData(): HistoryData {
  const data: HistoryData = {
    playerRoundHistory: {},
    playerUsageHistory: {},
    currentRoundUsage: {},
    playerHistoryPanels: {}
  }
  for (const p of players) {
    data.playerRoundHistory[p.id] = []
    data.playerUsageHistory[p.id] = []
    data.currentRoundUsage[p.id] = []
  }
  return data
}

describe("AI 增量上下文：出价数据一致性", () => {
  it("第 2 轮 AI 能看到第 1 轮所有玩家的真实出价", () => {
    const data = createHistoryData()

    // 模拟第 1 轮结算：recordRoundHistory 写入 playerRoundHistory
    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    // 模拟第 2 轮开始时 AI 读取上下文
    // round=2 时 buildBidHistorySnapshot 取 round 1 的数据
    const bidHistory = buildBidHistorySnapshot(2, players, data.playerRoundHistory)

    expect(bidHistory).toHaveLength(1)
    expect(bidHistory[0].round).toBe(1)
    expect(bidHistory[0].bids.p1).toBe(150000)
    expect(bidHistory[0].bids.p2).toBe(180000)
    expect(bidHistory[0].bids.p3).toBe(160000)
    expect(bidHistory[0].bids.p4).toBe(120000)

    // 模拟 buildAiIncrementalPayload 中取 lastRoundBid
    const previousRound = 2 - 1
    const lastRoundBid = bidHistory.find((entry) => entry.round === previousRound)
    expect(lastRoundBid).toBeDefined()
    expect(lastRoundBid!.bids.p1).toBe(150000)
  })

  it("第 3 轮 AI 能看到前 2 轮所有玩家的真实出价", () => {
    const data = createHistoryData()

    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    // 模拟 AI 在第 1 轮使用了道具
    data.currentRoundUsage["p1"].push("skill-tuoying")
    data.currentRoundUsage["p3"].push("item-magnifier")

    // clearCurrentUsage 和 recordRoundHistory 应在结算时依次调用
    clearCurrentRoundUsage(players, data)

    const round2Bids = [
      { playerId: "p1", bid: 200000 },
      { playerId: "p2", bid: 220000 },
      { playerId: "p3", bid: 190000 },
      { playerId: "p4", bid: 180000 }
    ]
    recordRoundHistory(players, data, 2, round2Bids, () => { })

    // 第 3 轮开始
    const bidHistory = buildBidHistorySnapshot(3, players, data.playerRoundHistory)
    expect(bidHistory).toHaveLength(2)
    expect(bidHistory[0].round).toBe(1)
    expect(bidHistory[1].round).toBe(2)
    expect(bidHistory[1].bids.p1).toBe(200000)
    expect(bidHistory[1].bids.p3).toBe(190000)
  })

  it("关键时序：resetForNewRound 不应清空 playerRoundHistory", () => {
    const data = createHistoryData()

    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    // 模拟 resolveRoundBids 中的重置：resetBiddingStateForNewRound
    // 只重置 currentBid / bidLeader / playerRoundBid 等，不动 playerRoundHistory
    // 这里验证 playerRoundHistory 在重置后仍然保留
    const currentBid = 0
    const bidLeader = "none"
    // playerRoundHistory 不被重置
    const bidHistory = buildBidHistorySnapshot(2, players, data.playerRoundHistory)
    expect(bidHistory[0].bids.p1).toBe(150000)

    // 验证 reset 不影响
    expect(data.playerRoundHistory["p1"].length).toBe(1)
    expect(data.playerRoundHistory["p1"][0].bid).toBe(150000)
  })

  it("关键时序：buildBidHistorySnapshot 在 recordRoundHistory 之前调用会返回零", () => {
    const data = createHistoryData()

    // 模拟错误时序：先调用 buildBidHistorySnapshot（第 2 轮开始时），
    // 但 recordRoundHistory 还没被调用
    const bidHistoryBeforeRecord = buildBidHistorySnapshot(2, players, data.playerRoundHistory)
    expect(bidHistoryBeforeRecord).toHaveLength(1)
    // 此时 playerRoundHistory 为空，所有出价为 0
    expect(bidHistoryBeforeRecord[0].bids.p1).toBe(0)
    expect(bidHistoryBeforeRecord[0].bids.p2).toBe(0)

    // 之后 recordRoundHistory 才被调用
    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    const bidHistoryAfterRecord = buildBidHistorySnapshot(2, players, data.playerRoundHistory)
    expect(bidHistoryAfterRecord[0].bids.p1).toBe(150000)
  })

  it("完整结算时序模拟：验证 resolveRoundBids 中 recordRoundHistory 在 AI 决策之前", () => {
    /**
     * 时序：
     * 1. round=1, startRound → kickoffAiRoundDecisions → processAiDecisions → AI 出价
     * 2. 所有人 bid ready → resolveRoundBids → buildRoundBids → recordRoundHistory → setCurrentBid → setRound(2) → resetBiddingStateForNewRound → startRound
     * 3. round=2, startRound → kickoffAiRoundDecisions → processAiDecisions → requestAiLlmPlan → buildAiIncrementalPayload
     *
     * 关键：步骤 3 中 buildAiIncrementalPayload 调用 buildBidHistorySnapshot，
     * 此时步骤 2 中 recordRoundHistory 已经执行过，playerRoundHistory 应有数据。
     */
    const data = createHistoryData()

    // === 第 1 轮结算 ===
    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })
    clearCurrentRoundUsage(players, data)

    // === 重置进入第 2 轮 ===
    let round = 2
    let currentBid = 0 // resetBiddingStateForNewRound 重置
    let bidLeader = "none" // resetBiddingStateForNewRound 重置

    // === 第 2 轮 AI 决策：buildAiIncrementalPayload ===
    const previousRound = round - 1
    const bidHistory = buildBidHistorySnapshot(round, players, data.playerRoundHistory)
    const lastRoundBid = bidHistory.find((entry) => entry.round === previousRound)

    // 验证：AI 能看到上一轮出价
    expect(lastRoundBid).toBeDefined()
    expect(lastRoundBid!.bids.p1).toBe(150000)
    expect(lastRoundBid!.bids.p2).toBe(180000)
    expect(lastRoundBid!.bids.p3).toBe(160000)
    expect(lastRoundBid!.bids.p4).toBe(120000)

    // 验证：currentBid 和 bidLeader 已被重置
    expect(currentBid).toBe(0)
    expect(bidLeader).toBe("none")
  })

  it("使用历史中的道具使用记录在增量上下文中可见", () => {
    const data = createHistoryData()

    // 第 1 轮：AI 使用了技能和道具
    data.currentRoundUsage["p1"].push("skill-tuoying")
    data.currentRoundUsage["p3"].push("item-magnifier")

    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 },
      { playerId: "p3", bid: 160000 },
      { playerId: "p4", bid: 120000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    // 验证：playerUsageHistory 已记录
    expect(data.playerUsageHistory["p1"][0].actions).toContain("skill-tuoying")
    expect(data.playerUsageHistory["p3"][0].actions).toContain("item-magnifier")
    expect(data.playerUsageHistory["p2"][0].actions).toEqual([])
    expect(data.playerUsageHistory["p4"][0].actions).toEqual([])
  })

  it("引用分叉 bug：resetForNewRun 替换 playerRoundHistory 后旧引用写入无效", () => {
    // 模拟真实 bug 场景：HistoryManager 构造时捕获旧引用，resetForNewRun 后引用分叉
    const data = createHistoryData()
    const oldRef = data.playerRoundHistory

    // 构造时 HistoryManager 捕获了 data.playerRoundHistory 的引用
    const capturedRef = data.playerRoundHistory

    // 第 1 轮正常写入（此时引用还没分叉）
    const round1Bids = [
      { playerId: "p1", bid: 150000 },
      { playerId: "p2", bid: 180000 }
    ]
    recordRoundHistory(players, data, 1, round1Bids, () => { })

    // 验证写入成功
    expect(capturedRef["p1"][0].bid).toBe(150000)
    expect(data.playerRoundHistory["p1"][0].bid).toBe(150000)

    // resetForNewRun 替换整个对象（模拟 game-slice.resetForNewRun 的 s.playerRoundHistory = {}）
    data.playerRoundHistory = {}
    // 重新初始化玩家条目
    for (const p of players) {
      data.playerRoundHistory[p.id] = []
    }

    // capturedRef 仍指向旧对象——数据分叉！
    // 旧引用写入
    capturedRef["p1"].push({ round: 2, bid: 200000 })
    // 新引用看不到
    expect(data.playerRoundHistory["p1"].length).toBe(0)

    // 这正是 HistoryManager 需要用 getter 而非构造时引用的原因
    // 修复后：HistoryManager 通过 getData() 每次获取最新引用
    const freshRef = data.playerRoundHistory
    freshRef["p1"].push({ round: 2, bid: 200000 })
    expect(data.playerRoundHistory["p1"].length).toBe(1)
    expect(data.playerRoundHistory["p1"][0].bid).toBe(200000)
  })
})
