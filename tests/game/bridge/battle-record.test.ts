import { describe, it, expect, beforeEach } from "vitest"
import { createBattleRecordBridge } from "../../../scripts/game/bridge/battle-record"

const STORAGE_KEY = "mobao_battle_records"

const mockDeps = {
  BATTLE_RECORD_STORAGE_KEY: STORAGE_KEY,
  GRID_COLS: 6,
  GRID_ROWS: 4,
  clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)),
  escapeHtml: (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
  formatBidRevealNumber: (v: number) => String(v)
}

const { loadBattleRecords, saveBattleRecords, formatRecordTime } = createBattleRecordBridge(mockDeps)

describe("battle-record - loadBattleRecords", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("无存储返回空数组", () => {
    expect(loadBattleRecords()).toEqual([])
  })

  it("正常加载记录", () => {
    const records = [{ id: "rec-1", winnerName: "玩家1", winnerBid: 5000 }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    const result = loadBattleRecords()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("rec-1")
  })

  it("非数组 JSON 返回空", () => {
    localStorage.setItem(STORAGE_KEY, '"not-an-array"')
    expect(loadBattleRecords()).toEqual([])
  })

  it("JSON 解析失败返回空", () => {
    localStorage.setItem(STORAGE_KEY, "{invalid}")
    expect(loadBattleRecords()).toEqual([])
  })

  it("过滤 null/非对象元素", () => {
    const records = [{ id: "rec-1" }, null, "invalid", 42, { id: "rec-2" }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    const result = loadBattleRecords()
    expect(result).toHaveLength(2)
  })

  it("无 id 的旧记录自动生成 legacy id", () => {
    const records = [{ winnerName: "玩家1", winnerBid: 3000 }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    const result = loadBattleRecords()
    expect(result[0].id).toBe("legacy-rec-0")
    expect(result[0].winner).toBe("玩家1")
    expect(result[0].winnerBid).toBe(3000)
  })

  it("超过20条只保留前20条", () => {
    const records = Array.from({ length: 25 }, (_, i) => ({ id: `rec-${i}` }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    const result = loadBattleRecords()
    expect(result).toHaveLength(20)
    expect(result[0].id).toBe("rec-0")
    expect(result[19].id).toBe("rec-19")
  })
})

describe("battle-record - saveBattleRecords", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("保存记录到 localStorage", () => {
    const records = [{ id: "rec-1" }, { id: "rec-2" }]
    saveBattleRecords(records as any)
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toHaveLength(2)
  })

  it("超过20条截断", () => {
    const records = Array.from({ length: 30 }, (_, i) => ({ id: `rec-${i}` }))
    saveBattleRecords(records as any)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(20)
  })

  it("非数组参数保存为空数组", () => {
    saveBattleRecords("invalid" as any)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toEqual([])
  })

  it("null 参数保存为空数组", () => {
    saveBattleRecords(null as any)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toEqual([])
  })
})

describe("battle-record - formatRecordTime", () => {
  it("有效 ISO 返回格式化字符串", () => {
    const result = formatRecordTime("2025-01-15T10:30:00Z")
    expect(result).not.toBe("未知时间")
    expect(result.length).toBeGreaterThan(0)
  })

  it("无效日期返回 '未知时间'", () => {
    expect(formatRecordTime("invalid-date")).toBe("未知时间")
  })

  it("空字符串返回 '未知时间'", () => {
    expect(formatRecordTime("")).toBe("未知时间")
  })

  it("undefined 返回 '未知时间'", () => {
    expect(formatRecordTime(undefined as any)).toBe("未知时间")
  })
})
