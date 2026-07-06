import { describe, it, expect } from "vitest"
import { ITEM_DEFS, ItemManager } from "../../../scripts/game/data/items"

describe("items", () => {
  describe("ITEM_DEFS", () => {
    it("包含 11 个道具定义", () => {
      expect(ITEM_DEFS).toHaveLength(11)
    })

    it("每个道具有完整字段", () => {
      for (const def of ITEM_DEFS) {
        expect(typeof def.id).toBe("string")
        expect(typeof def.name).toBe("string")
        expect(typeof def.description).toBe("string")
        expect(typeof def.initialCount).toBe("number")
        expect(def.initialCount).toBeGreaterThan(0)
        expect(typeof def.execute).toBe("function")
      }
    })

    it("id 唯一", () => {
      const ids = ITEM_DEFS.map((d) => d.id)
      expect(new Set(ids).size).toBe(ids.length)
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
      // 修改快照不影响内部
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

    it("use 成功扣减 count 并返回揭示信息", () => {
      const mgr = new ItemManager()
      const itemId = mgr.items[0].id
      const before = mgr.items[0].count
      mgr.items[0].execute = () => ({ ok: true, revealed: 4 })
      const result = mgr.use(itemId, {})
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(4)
      expect(mgr.items[0].count).toBe(before - 1)
      expect(result.message).toContain("4")
    })
  })
})
