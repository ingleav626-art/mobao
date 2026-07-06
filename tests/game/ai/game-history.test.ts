import { describe, it, expect, beforeEach } from "vitest"
import { MobaoGameHistory, type GameRecord } from "../../../scripts/game/ai/game-history"

const STORAGE_KEY = "mobao_ai_game_history_v1"

function makeRecord(run: number, overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    run,
    winnerId: "p1",
    winnerName: "玩家",
    winnerBid: 200000,
    totalValue: 300000,
    winnerProfit: 100000,
    reasonText: "中标",
    dividendTicket: null,
    qualityCounts: { poor: 2, normal: 1, fine: 0, rare: 0, legendary: 0 },
    totalItems: 3,
    totalCells: 12,
    roundBids: [],
    reflection: null,
    aiDecisions: [],
    timestamp: Date.now(),
    ...overrides
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe("game-history - load/getCount", () => {
  it("空存储返回空数组", () => {
    expect(MobaoGameHistory.load("p1")).toEqual([])
    expect(MobaoGameHistory.getCount("p1")).toBe(0)
  })

  it("损坏 JSON 返回空数组", () => {
    window.localStorage.setItem(`${STORAGE_KEY}_p1`, "{invalid")
    expect(MobaoGameHistory.load("p1")).toEqual([])
  })

  it("非对象数据返回空数组", () => {
    window.localStorage.setItem(`${STORAGE_KEY}_p1`, JSON.stringify([1, 2, 3]))
    expect(MobaoGameHistory.load("p1")).toEqual([])
  })

  it("联机模式使用不同 key", () => {
    MobaoGameHistory.append("p1", makeRecord(1), 20, true)
    expect(MobaoGameHistory.getCount("p1", false)).toBe(0)
    expect(MobaoGameHistory.getCount("p1", true)).toBe(1)
  })
})

describe("game-history - append", () => {
  it("追加记录并持久化", () => {
    MobaoGameHistory.append("p1", makeRecord(1))
    expect(MobaoGameHistory.getCount("p1")).toBe(1)
    expect(MobaoGameHistory.load("p1")[0].run).toBe(1)
  })

  it("滑动窗口裁剪超出上限的记录", () => {
    for (let i = 1; i <= 25; i++) {
      MobaoGameHistory.append("p1", makeRecord(i), 20)
    }
    expect(MobaoGameHistory.getCount("p1")).toBe(20)
    const records = MobaoGameHistory.load("p1")
    expect(records[0].run).toBe(6) // 保留 6..25
    expect(records[19].run).toBe(25)
  })

  it("记录数等于上限不裁剪", () => {
    MobaoGameHistory.append("p1", makeRecord(1), 1)
    MobaoGameHistory.append("p1", makeRecord(2), 1)
    expect(MobaoGameHistory.getCount("p1")).toBe(1)
  })
})

describe("game-history - clear/clearAll", () => {
  it("clear 清空指定玩家", () => {
    MobaoGameHistory.append("p1", makeRecord(1))
    MobaoGameHistory.append("p3", makeRecord(1))
    MobaoGameHistory.clear("p1")
    expect(MobaoGameHistory.getCount("p1")).toBe(0)
    expect(MobaoGameHistory.getCount("p3")).toBe(1)
  })

  it("clearAll 清空所有玩家历史", () => {
    MobaoGameHistory.append("p1", makeRecord(1))
    MobaoGameHistory.append("p3", makeRecord(1))
    MobaoGameHistory.clearAll()
    expect(MobaoGameHistory.getCount("p1")).toBe(0)
    expect(MobaoGameHistory.getCount("p3")).toBe(0)
  })
})

describe("game-history - buildContextMessages", () => {
  it("空历史返回空数组", () => {
    expect(MobaoGameHistory.buildContextMessages("p1", 5)).toEqual([])
  })

  it("返回包含跨局历史上下文的消息", () => {
    MobaoGameHistory.append("p1", makeRecord(1, { winnerName: "左上AI", winnerBid: 150000 }))
    const messages = MobaoGameHistory.buildContextMessages("p1", 5)
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe("user")
    expect(messages[0].content).toContain("跨局历史")
    expect(messages[0].content).toContain("左上AI")
    expect(messages[0].content).toContain("150000")
  })

  it("maxGames 限制返回数量", () => {
    for (let i = 1; i <= 5; i++) {
      MobaoGameHistory.append("p1", makeRecord(i, { winnerName: `胜者${i}` }), 20)
    }
    const messages = MobaoGameHistory.buildContextMessages("p1", 2)
    expect(messages[0].content).toContain("胜者4")
    expect(messages[0].content).toContain("胜者5")
    expect(messages[0].content).not.toContain("胜者3")
  })

  it("包含分红/门票信息", () => {
    MobaoGameHistory.append("p1", makeRecord(1, {
      dividendTicket: { mechanism: "dividend", dividendPerPlayer: 5000, ticketPerPlayer: 0 }
    }))
    const content = MobaoGameHistory.buildContextMessages("p1", 5)[0].content
    expect(content).toContain("分红+5000")
  })

  it("包含品质统计", () => {
    MobaoGameHistory.append("p1", makeRecord(1, {
      qualityCounts: { poor: 3, normal: 2, fine: 1, rare: 0, legendary: 0 },
      totalItems: 6,
      totalCells: 24
    }))
    const content = MobaoGameHistory.buildContextMessages("p1", 5)[0].content
    expect(content).toContain("粗3 良2 精1 珍0 绝0")
    expect(content).toContain("6件 24格")
  })

  it("包含 AI 决策记录", () => {
    MobaoGameHistory.append("p1", makeRecord(1, {
      aiDecisions: [{
        round: 1, bid: 200000, skill: "玉脉鉴质", item: "无",
        thought: "测质后出价", result: "中标"
      }]
    }))
    const content = MobaoGameHistory.buildContextMessages("p1", 5)[0].content
    expect(content).toContain("R1")
    expect(content).toContain("200000")
    expect(content).toContain("玉脉鉴质")
  })

  it("包含反思", () => {
    MobaoGameHistory.append("p1", makeRecord(1, { reflection: "应更早出价" }))
    const content = MobaoGameHistory.buildContextMessages("p1", 5)[0].content
    expect(content).toContain("反思:应更早出价")
  })
})

describe("game-history - buildReflectionContext", () => {
  it("scope=current 返回当前记录", () => {
    const record = makeRecord(1, { winnerName: "测试" })
    const result = MobaoGameHistory.buildReflectionContext("p1", "current", record)
    expect(result).toContain("测试")
  })

  it("scope=current 且无记录返回空串", () => {
    expect(MobaoGameHistory.buildReflectionContext("p1", "current", null)).toBe("")
  })

  it("scope=all 返回所有历史合并", () => {
    MobaoGameHistory.append("p1", makeRecord(1, { winnerName: "A" }))
    MobaoGameHistory.append("p1", makeRecord(2, { winnerName: "B" }))
    const result = MobaoGameHistory.buildReflectionContext("p1", "all", null)
    expect(result).toContain("A")
    expect(result).toContain("B")
    expect(result).toContain("---")
  })

  it("scope=all 空历史但有当前记录返回当前记录", () => {
    const record = makeRecord(1, { winnerName: "当前" })
    const result = MobaoGameHistory.buildReflectionContext("p1", "all", record)
    expect(result).toContain("当前")
  })
})

describe("game-history - export/import", () => {
  it("exportToJson 返回 JSON 字符串", () => {
    MobaoGameHistory.append("p1", makeRecord(1))
    const json = MobaoGameHistory.exportToJson("p1")
    const parsed = JSON.parse(json)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.version).toBe("v1")
  })

  it("importFromJson 合法数据导入成功", () => {
    const store = { records: [makeRecord(1), makeRecord(2)], version: "v1" }
    const result = MobaoGameHistory.importFromJson("p1", JSON.stringify(store))
    expect(result.ok).toBe(true)
    expect(MobaoGameHistory.getCount("p1")).toBe(2)
  })

  it("importFromJson 无效 JSON 返回错误", () => {
    const result = MobaoGameHistory.importFromJson("p1", "{invalid")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("JSON解析失败")
  })

  it("importFromJson 非对象数据返回错误", () => {
    const result = MobaoGameHistory.importFromJson("p1", JSON.stringify([1, 2, 3]))
    expect(result.ok).toBe(false)
    expect(result.error).toContain("无效的JSON格式")
  })

  it("importFromJson 过滤无 run 字段的记录", () => {
    const store = { records: [makeRecord(1), { winnerName: "bad" }], version: "v1" }
    const result = MobaoGameHistory.importFromJson("p1", JSON.stringify(store))
    expect(result.ok).toBe(true)
    expect(MobaoGameHistory.getCount("p1")).toBe(1)
  })
})
