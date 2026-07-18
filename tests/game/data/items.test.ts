import { describe, it, expect } from "vitest"
import { ITEM_DEFS, ItemManager } from "../../../scripts/game/data/items"
import { computeAveragePrice } from "../../../scripts/game/ai/intel-manager/reveal-fns"
import { ARTIFACT_LIBRARY } from "../../../scripts/game/data/artifacts"
import { QUALITY_CONFIG } from "../../../scripts/game/data/artifacts/config"
import type { Artifact } from "../../../types/game"

describe("items", () => {
  describe("ITEM_DEFS", () => {
    it("每个道具有完整字段且 id 唯一", () => {
      const ids: string[] = []
      for (const def of ITEM_DEFS) {
        expect(typeof def.id).toBe("string")
        expect(typeof def.name).toBe("string")
        expect(typeof def.description).toBe("string")
        expect(typeof def.initialCount).toBe("number")
        expect(def.initialCount).toBeGreaterThan(0)
        expect(typeof def.execute).toBe("function")
        ids.push(def.id)
      }
      expect(new Set(ids).size).toBe(ids.length)
    })

    it("均价类道具 initialCount 为 1（本局只能用一次）", () => {
      const avgItems = ITEM_DEFS.filter((d) => d.id.startsWith("item-avg-"))
      expect(avgItems.length).toBeGreaterThan(0)
      for (const def of avgItems) {
        expect(def.initialCount).toBe(1)
      }
    })

    it("加成类道具 initialCount 为 1（本局只能用一次）", () => {
      const bonusItems = ITEM_DEFS.filter((d) => d.id.startsWith("item-bonus-"))
      expect(bonusItems.length).toBeGreaterThan(0)
      for (const def of bonusItems) {
        expect(def.initialCount).toBe(1)
      }
    })
  })

  describe("ItemManager", () => {
    it("constructor 初始化所有道具 count=initialCount", () => {
      const mgr = new ItemManager()
      expect(mgr.items).toHaveLength(ITEM_DEFS.length)
      for (const item of mgr.items) {
        expect(item.count).toBe(item.initialCount)
      }
    })

    it("getItemState 返回完整状态快照且为独立对象", () => {
      const mgr = new ItemManager()
      const state = mgr.getItemState()
      expect(state).toHaveLength(ITEM_DEFS.length)
      expect(state[0]).toHaveProperty("id")
      expect(state[0]).toHaveProperty("name")
      expect(state[0]).toHaveProperty("count")
      expect(state[0]).toHaveProperty("initialCount")
      state[0].count = -1
      expect(mgr.items[0].count).toBe(mgr.items[0].initialCount)
    })

    it("resetForNewRun 重置已消耗道具", () => {
      const mgr = new ItemManager()
      mgr.items[0].count = 0
      mgr.items[1].count = 5
      mgr.resetForNewRun()
      expect(mgr.items[0].count).toBe(mgr.items[0].initialCount)
      expect(mgr.items[1].count).toBe(mgr.items[1].initialCount)
    })

    it("use 道具不存在返回失败", () => {
      const mgr = new ItemManager()
      const result = mgr.use("nonexistent", {})
      expect(result.ok).toBe(false)
      expect(result.revealed).toBe(0)
      expect(result.message).toContain("不存在")
    })

    it("use 数量不足返回失败且不调用 execute", () => {
      const mgr = new ItemManager()
      mgr.items[0].count = 0
      let executeCalled = false
      const originalExecute = mgr.items[0].execute
      mgr.items[0].execute = () => {
        executeCalled = true
        return originalExecute({})
      }
      const result = mgr.use(mgr.items[0].id, {})
      expect(result.ok).toBe(false)
      expect(result.message).toContain("数量不足")
      expect(executeCalled).toBe(false)
    })

    it("use execute 失败时不扣减 count", () => {
      const mgr = new ItemManager()
      const itemId = mgr.items[0].id
      const before = mgr.items[0].count
      mgr.items[0].execute = () => ({ ok: false, revealed: 0, message: "无可用目标" })
      const result = mgr.use(itemId, {})
      expect(result.ok).toBe(false)
      expect(mgr.items[0].count).toBe(before)
    })

    it("use 成功扣减 count", () => {
      const mgr = new ItemManager()
      const itemId = mgr.items[0].id
      const before = mgr.items[0].count
      mgr.items[0].execute = () => ({ ok: true, revealed: 4 })
      const result = mgr.use(itemId, {})
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(4)
      expect(mgr.items[0].count).toBe(before - 1)
    })
  })

  describe("revealAll 类道具调用 context 传参正确", () => {
    function makeContext() {
      const calls: Array<{ method: string; params: Record<string, unknown> }> = []
      return {
        calls,
        ctx: {
          revealOutline: () => ({ ok: false, revealed: 0, message: "" }),
          revealQuality: () => ({ ok: false, revealed: 0, message: "" }),
          revealAll: (opts: { count: number; sortStrategy: string }) => {
            calls.push({ method: "revealAll", params: { count: opts.count, sortStrategy: opts.sortStrategy } })
            return { ok: true, revealed: opts.count, message: "" }
          }
        }
      }
    }

    const cases = [
      { id: "item-reveal-all-1", count: 1, sort: "random" },
      { id: "item-reveal-all-2", count: 2, sort: "random" },
      { id: "item-reveal-all-4", count: 4, sort: "random" },
      { id: "item-reveal-all-10", count: 10, sort: "random" },
      { id: "item-reveal-top", count: 1, sort: "highestPrice" }
    ]

    for (const c of cases) {
      it(`${c.id} 调 context.revealAll({ count: ${c.count}, sortStrategy: "${c.sort}" })`, () => {
        const def = ITEM_DEFS.find((d) => d.id === c.id)
        expect(def).toBeDefined()
        const { calls, ctx } = makeContext()
        const result = def!.execute(ctx)
        expect(result.ok).toBe(true)
        expect(calls).toHaveLength(1)
        expect(calls[0].method).toBe("revealAll")
        expect(calls[0].params).toEqual({ count: c.count, sortStrategy: c.sort })
      })
    }
  })

  describe("revealByQuality / revealByCategory 类道具调 context 传参正确", () => {
    function makeContext() {
      const calls: Array<{ method: string; params: Record<string, unknown> }> = []
      return {
        calls,
        ctx: {
          revealOutline: () => ({ ok: false, revealed: 0, message: "" }),
          revealQuality: () => ({ ok: false, revealed: 0, message: "" }),
          revealAll: () => ({ ok: false, revealed: 0, message: "" }),
          revealByQuality: (opts: { qualityKey: string }) => {
            calls.push({ method: "revealByQuality", params: { qualityKey: opts.qualityKey } })
            return { ok: true, revealed: 0, message: "" }
          },
          revealByCategory: (opts: { category: string }) => {
            calls.push({ method: "revealByCategory", params: { category: opts.category } })
            return { ok: true, revealed: 0, message: "" }
          }
        }
      }
    }

    it("item-by-quality-poor 调 revealByQuality({ qualityKey: 'poor' })", () => {
      const def = ITEM_DEFS.find((d) => d.id === "item-by-quality-poor")
      expect(def).toBeDefined()
      const { calls, ctx } = makeContext()
      const result = def!.execute(ctx)
      expect(result.ok).toBe(true)
      expect(calls[0].method).toBe("revealByQuality")
      expect(calls[0].params).toEqual({ qualityKey: "poor" })
    })

    it("item-by-quality-normal 调 revealByQuality({ qualityKey: 'normal' })", () => {
      const def = ITEM_DEFS.find((d) => d.id === "item-by-quality-normal")
      expect(def).toBeDefined()
      const { calls, ctx } = makeContext()
      def!.execute(ctx)
      expect(calls[0].params).toEqual({ qualityKey: "normal" })
    })

    it("item-by-quality-fine 调 revealByQuality({ qualityKey: 'fine' })", () => {
      const def = ITEM_DEFS.find((d) => d.id === "item-by-quality-fine")
      expect(def).toBeDefined()
      const { calls, ctx } = makeContext()
      def!.execute(ctx)
      expect(calls[0].params).toEqual({ qualityKey: "fine" })
    })

    it("item-by-cat-porcelain 调 revealByCategory({ category: '瓷器' })", () => {
      const def = ITEM_DEFS.find((d) => d.id === "item-by-cat-porcelain")
      expect(def).toBeDefined()
      const { calls, ctx } = makeContext()
      def!.execute(ctx)
      expect(calls[0].method).toBe("revealByCategory")
      expect(calls[0].params).toEqual({ category: "瓷器" })
    })
  })

  describe("均价类道具调 context.computeAveragePrice 传参正确", () => {
    function makeContext() {
      const calls: Array<{ scope: string }> = []
      return {
        calls,
        ctx: {
          revealOutline: () => ({ ok: false, revealed: 0, message: "" }),
          revealQuality: () => ({ ok: false, revealed: 0, message: "" }),
          computeAveragePrice: (opts: { scope: string }) => {
            calls.push({ scope: opts.scope })
            return { ok: true, revealed: 0, message: "" }
          }
        }
      }
    }

    const cases = [
      { id: "item-avg-single", scope: "singleCell" },
      { id: "item-avg-double", scope: "doubleCell" },
      { id: "item-avg-quad", scope: "quadCell" },
      { id: "item-avg-total", scope: "total" },
      { id: "item-avg-poor", scope: "quality:poor" },
      { id: "item-avg-normal", scope: "quality:normal" },
      { id: "item-avg-fine", scope: "quality:fine" },
      { id: "item-avg-porcelain", scope: "category:瓷器" }
    ]

    for (const c of cases) {
      it(`${c.id} → scope="${c.scope}"`, () => {
        const def = ITEM_DEFS.find((d) => d.id === c.id)
        expect(def).toBeDefined()
        const { calls, ctx } = makeContext()
        def!.execute(ctx)
        expect(calls).toHaveLength(1)
        expect(calls[0].scope).toBe(c.scope)
      })
    }
  })

  describe("加成类道具调 context.applyBonus 传参正确", () => {
    function makeContext() {
      const calls: Array<{ id: string; scope: string; condition: string; value: number }> = []
      return {
        calls,
        ctx: {
          revealOutline: () => ({ ok: false, revealed: 0, message: "" }),
          revealQuality: () => ({ ok: false, revealed: 0, message: "" }),
          applyBonus: (opts: { id: string; scope: string; condition: string; value: number }) => {
            calls.push({ id: opts.id, scope: opts.scope, condition: opts.condition, value: opts.value })
            return { ok: true, revealed: 0, message: "" }
          }
        }
      }
    }

    const cases = [
      { id: "item-bonus-self-up", bonusId: "bonus-lucky-charm", scope: "self", condition: "onGain", value: 0.5 },
      { id: "item-bonus-self-down", bonusId: "bonus-unlucky-charm", scope: "self", condition: "onLoss", value: -0.5 },
      { id: "item-bonus-all-up", bonusId: "bonus-group-bless", scope: "group", condition: "onGain", value: 1 },
      { id: "item-bonus-all-down", bonusId: "bonus-group-curse", scope: "group", condition: "onLoss", value: 2 }
    ]

    for (const c of cases) {
      it(`${c.id} → id="${c.bonusId}" scope="${c.scope}" condition="${c.condition}" value=${c.value}`, () => {
        const def = ITEM_DEFS.find((d) => d.id === c.id)
        expect(def).toBeDefined()
        const { calls, ctx } = makeContext()
        def!.execute(ctx)
        expect(calls).toHaveLength(1)
        expect(calls[0].id).toBe(c.bonusId)
        expect(calls[0].scope).toBe(c.scope)
        expect(calls[0].condition).toBe(c.condition)
        expect(calls[0].value).toBe(c.value)
      })
    }
  })

  describe("computeAveragePrice 纯函数（真实藏品数据）", () => {
    const items = ARTIFACT_LIBRARY as Array<{ id: string; name: string; basePrice: number; w: number; h: number; qualityKey: string; category: string }>

    it("全场均价计算正确", () => {
      const result = computeAveragePrice(items, "total")
      expect(result.ok).toBe(true)
      const expectedAvg = Math.round(items.reduce((s, i) => s + i.basePrice, 0) / items.length)
      expect(result.message).toBe(`全场均价：${expectedAvg}`)
    })

    it("单格均价只含 1x1 藏品", () => {
      const singleCell = items.filter((i) => i.w === 1 && i.h === 1)
      const result = computeAveragePrice(items, "singleCell")
      expect(result.ok).toBe(true)
      const expectedAvg = Math.round(singleCell.reduce((s, i) => s + i.basePrice, 0) / singleCell.length)
      expect(result.message).toBe(`单格均价：${expectedAvg}`)
    })

    it("双格均价只含 w*h===2 藏品", () => {
      const doubleCell = items.filter((i) => i.w * i.h === 2)
      const result = computeAveragePrice(items, "doubleCell")
      expect(result.ok).toBe(true)
      const expectedAvg = Math.round(doubleCell.reduce((s, i) => s + i.basePrice, 0) / doubleCell.length)
      expect(result.message).toBe(`双格均价：${expectedAvg}`)
    })

    it("四格均价只含 2x2 藏品", () => {
      const quadCell = items.filter((i) => i.w === 2 && i.h === 2)
      const result = computeAveragePrice(items, "quadCell")
      if (quadCell.length === 0) {
        expect(result.ok).toBe(false)
      } else {
        expect(result.ok).toBe(true)
        const expectedAvg = Math.round(quadCell.reduce((s, i) => s + i.basePrice, 0) / quadCell.length)
        expect(result.message).toBe(`四格均价：${expectedAvg}`)
      }
    })

    it("品质均价筛选正确且数值等于人工计算", () => {
      const qualityKey = "poor"
      const matched = items.filter((i) => i.qualityKey === qualityKey)
      const result = computeAveragePrice(items, `quality:${qualityKey}`)
      if (matched.length === 0) {
        expect(result.ok).toBe(false)
      } else {
        expect(result.ok).toBe(true)
        const expectedAvg = Math.round(matched.reduce((s, i) => s + i.basePrice, 0) / matched.length)
        const label = QUALITY_CONFIG[qualityKey].label
        expect(result.message).toBe(`${label}均价：${expectedAvg}`)
      }
    })

    it("品类均价筛选正确且数值等于人工计算", () => {
      const category = "瓷器"
      const matched = items.filter((i) => i.category === category)
      const result = computeAveragePrice(items, `category:${category}`)
      if (matched.length === 0) {
        expect(result.ok).toBe(false)
      } else {
        expect(result.ok).toBe(true)
        const expectedAvg = Math.round(matched.reduce((s, i) => s + i.basePrice, 0) / matched.length)
        expect(result.message).toBe(`${category}均价：${expectedAvg}`)
      }
    })

    it("无匹配藏品时返回失败", () => {
      const result = computeAveragePrice(items, "quality:nonexistent")
      expect(result.ok).toBe(false)
    })

    it("未知 scope 返回失败", () => {
      const result = computeAveragePrice(items, "invalidScope")
      expect(result.ok).toBe(false)
    })

    it("空数组返回失败", () => {
      const result = computeAveragePrice([], "total")
      expect(result.ok).toBe(false)
    })

    it("所有藏品 basePrice 为有效数字（sortByArea price 策略依赖）", () => {
      for (const item of items) {
        expect(typeof item.basePrice).toBe("number")
        expect(Number.isFinite(item.basePrice)).toBe(true)
      }
    })
  })

  describe("全链路：ItemManager.use() → applyUse → 真 execute → 真 computeAveragePrice", () => {
    const rawItems = ARTIFACT_LIBRARY as Array<{ id: string; basePrice: number; w: number; h: number; qualityKey: string; category: string }>

    function makeFullContext() {
      return {
        revealOutline: () => ({ ok: false, revealed: 0, message: "" }),
        revealQuality: () => ({ ok: false, revealed: 0, message: "" }),
        computeAveragePrice: (opts: { scope: string }) =>
          computeAveragePrice(rawItems as unknown as Artifact[], opts.scope)
      }
    }

    it("item-avg-double → 返回双格均价而非通用文案", () => {
      const mgr = new ItemManager()
      const ctx = makeFullContext()
      const result = mgr.use("item-avg-double", ctx)

      expect(result.ok).toBe(true)
      // 逻辑验证：message 应含"双格"和数字均价，不应含通用文案
      expect(result.message).toContain("双格")
      expect(result.message).toContain("均价")
      expect(result.message).not.toContain("生效，揭示")
      expect(result.message).not.toContain("件目标")
    })

    it("item-avg-total → 返回全场均价而非通用文案", () => {
      const mgr = new ItemManager()
      const ctx = makeFullContext()
      const result = mgr.use("item-avg-total", ctx)

      expect(result.ok).toBe(true)
      expect(result.message).toContain("全场")
      expect(result.message).toContain("均价")
      expect(result.message).not.toContain("生效，揭示")
    })

    it("item-avg-poor → 返回粗品均价而非通用文案", () => {
      const mgr = new ItemManager()
      const ctx = makeFullContext()
      const result = mgr.use("item-avg-poor", ctx)

      expect(result.message).not.toContain("生效，揭示")
      expect(result.message).not.toContain("件目标")
      // 有效结果含均价或无藏品提示
      expect(result.message).toMatch(/均价|无藏品/)
    })

    it("item-bonus-self-up → 返回加成信息而非通用文案", () => {
      const mgr = new ItemManager()
      const ctx = {
        ...makeFullContext(),
        applyBonus: () => ({ ok: true, revealed: 0, message: "已应用加成（self +50%）。" })
      }
      const result = mgr.use("item-bonus-self-up", ctx)

      expect(result.ok).toBe(true)
      expect(result.message).toContain("+50%")
      expect(result.message).not.toContain("生效，揭示")
    })
  })
})
