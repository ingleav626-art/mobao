import { describe, it, expect, vi } from "vitest"
import {
  pickRandomItemCell,
  calcHighValuePriceThreshold,
  checkHighValueArtifact,
  determineRevealLevel,
  truncateCandidateList,
  formatIntelActionPublicLine,
  buildNeighborStateLabel,
  getNeighborOffsets
} from "../../../scripts/game/ai/intel"

describe("intel", () => {
  describe("pickRandomItemCell", () => {
    it("1x1 物品返回唯一格", () => {
      const cell = pickRandomItemCell({ x: 3, y: 5, w: 1, h: 1 })
      expect(cell).toEqual({ x: 3, y: 5 })
    })

    it("2x2 物品返回范围内格", () => {
      const item = { x: 1, y: 1, w: 2, h: 2 }
      const validCells = [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 }
      ]
      for (let i = 0; i < 20; i++) {
        const cell = pickRandomItemCell(item)
        expect(cell).not.toBeNull()
        expect(validCells.some((c) => c.x === cell!.x && c.y === cell!.y)).toBe(true)
      }
    })

    it("3x2 物品返回 6 种可能格之一", () => {
      const item = { x: 0, y: 0, w: 3, h: 2 }
      const seen = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const cell = pickRandomItemCell(item)
        expect(cell).not.toBeNull()
        seen.add(`${cell!.x},${cell!.y}`)
      }
      // 100次随机应该覆盖大部分6个格
      expect(seen.size).toBeGreaterThanOrEqual(3)
    })

    it("0x0 物品返回 null", () => {
      expect(pickRandomItemCell({ x: 0, y: 0, w: 0, h: 0 })).toBeNull()
    })

    it("w=0 或 h=0 返回 null", () => {
      expect(pickRandomItemCell({ x: 0, y: 0, w: 3, h: 0 })).toBeNull()
      expect(pickRandomItemCell({ x: 0, y: 0, w: 0, h: 3 })).toBeNull()
    })
  })

  describe("calcHighValuePriceThreshold", () => {
    it("空数组返回 fallback", () => {
      expect(calcHighValuePriceThreshold([])).toBe(6000)
    })

    it("全为0或负数返回 fallback", () => {
      expect(calcHighValuePriceThreshold([0, -1, -100])).toBe(6000)
    })

    it("单个价格返回 max(minThreshold, price)", () => {
      expect(calcHighValuePriceThreshold([3000])).toBe(5200)
      expect(calcHighValuePriceThreshold([8000])).toBe(8000)
    })

    it("多个价格返回 p80 分位", () => {
      const prices = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]
      const result = calcHighValuePriceThreshold(prices)
      expect(result).toBe(8000)
    })

    it("结果不低于 minThreshold", () => {
      expect(calcHighValuePriceThreshold([100, 200, 300])).toBe(5200)
    })

    it("自定义 fallback 和 minThreshold", () => {
      expect(calcHighValuePriceThreshold([], 9999, 1000)).toBe(9999)
      expect(calcHighValuePriceThreshold([500], 9999, 1000)).toBe(1000)
    })
  })

  describe("checkHighValueArtifact", () => {
    it("legendary 品质始终为 true", () => {
      expect(checkHighValueArtifact({ qualityKey: "legendary", basePrice: 1 }, 99999)).toBe(true)
    })

    it("价格 >= threshold 为 true", () => {
      expect(checkHighValueArtifact({ qualityKey: "rare", basePrice: 6000 }, 6000)).toBe(true)
    })

    it("价格 < threshold 且非 legendary 为 false", () => {
      expect(checkHighValueArtifact({ qualityKey: "rare", basePrice: 5999 }, 6000)).toBe(false)
    })

    it("basePrice 为 0 的非 legendary 为 false", () => {
      expect(checkHighValueArtifact({ qualityKey: "common", basePrice: 0 }, 6000)).toBe(false)
    })
  })

  describe("determineRevealLevel", () => {
    it("exactKnown=true 返回已完全确定", () => {
      expect(determineRevealLevel(null, true)).toBe("已完全确定")
    })

    it("同时有 qualityKey 和 category 返回范围缩小", () => {
      expect(determineRevealLevel({ qualityKey: "rare", category: "武器" }, false)).toBe("范围缩小")
    })

    it("仅有 qualityKey 返回仅知品质", () => {
      expect(determineRevealLevel({ qualityKey: "rare", category: null }, false)).toBe("仅知品质")
    })

    it("仅有 category 返回已知品类", () => {
      expect(determineRevealLevel({ qualityKey: null, category: "武器" }, false)).toBe("已知品类")
    })

    it("都没有返回仅知轮廓", () => {
      expect(determineRevealLevel({ qualityKey: null, category: null }, false)).toBe("仅知轮廓")
    })

    it("null knowledge 返回仅知轮廓", () => {
      expect(determineRevealLevel(null, false)).toBe("仅知轮廓")
    })
  })

  describe("truncateCandidateList", () => {
    it("长度 <= maxItems 不截断", () => {
      const arr = [1, 2, 3]
      const result = truncateCandidateList(arr)
      expect(result.truncated).toBe(false)
      expect(result.total).toBe(3)
      expect(result.list).toEqual([1, 2, 3])
    })

    it("长度 > maxItems 截断", () => {
      const arr = Array.from({ length: 15 }, (_, i) => i)
      const result = truncateCandidateList(arr)
      expect(result.truncated).toBe(true)
      expect(result.total).toBe(15)
      expect(result.list).toHaveLength(10)
      expect(result.list).toEqual([0, 1, 2, 3, 4, 10, 11, 12, 13, 14])
    })

    it("自定义 maxItems", () => {
      const arr = Array.from({ length: 10 }, (_, i) => i)
      const result = truncateCandidateList(arr, 4)
      expect(result.truncated).toBe(true)
      expect(result.list).toHaveLength(4)
      expect(result.list).toEqual([0, 1, 8, 9])
    })

    it("恰好等于 maxItems 不截断", () => {
      const arr = Array.from({ length: 10 }, (_, i) => i)
      const result = truncateCandidateList(arr)
      expect(result.truncated).toBe(false)
    })
  })

  describe("formatIntelActionPublicLine", () => {
    it("基本格式 revealed > 0", () => {
      const entry = { playerName: "玩家1", revealed: 3, effectTag: "", detail: "", signalStats: null }
      expect(formatIntelActionPublicLine(entry, "探测镜")).toBe("玩家1 使用探测镜（私有线索+3）")
    })

    it("revealed = 0 显示未命中", () => {
      const entry = { playerName: "AI1", revealed: 0, effectTag: "", detail: "", signalStats: null }
      expect(formatIntelActionPublicLine(entry, "雷达")).toBe("AI1 使用雷达（未命中）")
    })

    it("itemLabel 为空显示未知", () => {
      const entry = { playerName: "AI1", revealed: 0, effectTag: "", detail: "", signalStats: null }
      expect(formatIntelActionPublicLine(entry, "")).toBe("AI1 使用未知（未命中）")
    })

    it("带 signalStats", () => {
      const entry = {
        playerName: "AI1",
        revealed: 2,
        effectTag: "",
        detail: "",
        signalStats: { count: 5, mean: 3000, spreadRatio: 0.25 }
      }
      const result = formatIntelActionPublicLine(entry, "探测镜")
      expect(result).toContain("候选均值3k")
      expect(result).toContain("波动25%")
    })

    it("带 effectTag 和 detail", () => {
      const entry = { playerName: "AI1", revealed: 1, effectTag: "暴击", detail: "发现稀有物品", signalStats: null }
      const result = formatIntelActionPublicLine(entry, "探测镜")
      expect(result).toContain("，暴击")
      expect(result).toContain("，结果:发现稀有物品")
    })

    it("count=0 的 signalStats 不显示统计", () => {
      const entry = {
        playerName: "AI1",
        revealed: 1,
        effectTag: "",
        detail: "",
        signalStats: { count: 0, mean: 0, spreadRatio: 0 }
      }
      const result = formatIntelActionPublicLine(entry, "探测镜")
      expect(result).not.toContain("候选均值")
    })
  })

  describe("buildNeighborStateLabel", () => {
    it("越界返回越界", () => {
      expect(buildNeighborStateLabel(false, undefined)).toBe("越界")
      expect(buildNeighborStateLabel(false, "occupied")).toBe("越界")
    })

    it("occupied 返回已被占用", () => {
      expect(buildNeighborStateLabel(true, "occupied")).toBe("已被占用")
    })

    it("empty 返回确认空闲", () => {
      expect(buildNeighborStateLabel(true, "empty")).toBe("确认空闲")
    })

    it("undefined 返回尚未探明", () => {
      expect(buildNeighborStateLabel(true, undefined)).toBe("尚未探明")
    })

    it("未知状态返回尚未探明", () => {
      expect(buildNeighborStateLabel(true, "unknown")).toBe("尚未探明")
    })
  })

  describe("getNeighborOffsets", () => {
    it("返回8个方向", () => {
      const offsets = getNeighborOffsets()
      expect(offsets).toHaveLength(8)
    })

    it("包含所有方向标签", () => {
      const offsets = getNeighborOffsets()
      const labels = offsets.map((o) => o.label)
      expect(labels).toEqual(["上", "下", "左", "右", "左上", "右上", "左下", "右下"])
    })

    it("坐标正确", () => {
      const offsets = getNeighborOffsets()
      const up = offsets.find((o) => o.label === "上")
      expect(up).toEqual({ dx: 0, dy: -1, label: "上" })
      const rightDown = offsets.find((o) => o.label === "右下")
      expect(rightDown).toEqual({ dx: 1, dy: 1, label: "右下" })
    })
  })
})
