import { describe, it, expect, beforeEach } from "vitest"
import { MobaoShopBridge } from "../../../scripts/game/bridge/shop"

const {
  SHOP_ITEMS,
  DISCOUNT_BADGES,
  getItemStorageKey,
  getDiscountBadge,
  generateLimitedOffers,
  loadInventory,
  SHOP_STORAGE_KEY
} = MobaoShopBridge

describe("shop", () => {
  describe("SHOP_ITEMS", () => {
    it("包含 11 个商品", () => {
      expect(SHOP_ITEMS).toHaveLength(11)
    })

    it("每个商品有完整字段", () => {
      for (const item of SHOP_ITEMS) {
        expect(typeof item.id).toBe("string")
        expect(typeof item.name).toBe("string")
        expect(typeof item.description).toBe("string")
        expect(typeof item.price).toBe("number")
        expect(typeof item.icon).toBe("string")
        expect(typeof item.maxDaily).toBe("number")
        expect(item.maxDaily).toBeGreaterThan(0)
      }
    })

    it("id 唯一", () => {
      const ids = SHOP_ITEMS.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe("getItemStorageKey", () => {
    it("已知 id 映射到驼峰键", () => {
      expect(getItemStorageKey("item-outline-lamp")).toBe("outlineLamp")
      expect(getItemStorageKey("item-quality-needle")).toBe("qualityNeedle")
      expect(getItemStorageKey("item-cat-stone")).toBe("catStone")
    })

    it("未知 id 返回原 id", () => {
      expect(getItemStorageKey("unknown-item")).toBe("unknown-item")
    })
  })

  describe("getDiscountBadge", () => {
    it("0.2 → 爆款 fire", () => {
      const badge = getDiscountBadge(0.2)
      expect(badge.type).toBe("fire")
      expect(badge.label).toBe("爆款")
    })

    it("0.4 → 超值 super", () => {
      const badge = getDiscountBadge(0.4)
      expect(badge.type).toBe("super")
      expect(badge.label).toBe("超值")
    })

    it("0.55 → 热卖 hot", () => {
      const badge = getDiscountBadge(0.55)
      expect(badge.type).toBe("hot")
      expect(badge.label).toBe("热卖")
    })

    it("0.65 → 特惠 sale", () => {
      const badge = getDiscountBadge(0.65)
      expect(badge.type).toBe("sale")
      expect(badge.label).toBe("特惠")
    })

    it("超出范围返回最后一个徽章", () => {
      const badge = getDiscountBadge(0.95)
      expect(badge.type).toBe("sale")
    })
  })

  describe("generateLimitedOffers", () => {
    it("返回 4 个特惠商品", () => {
      const offers = generateLimitedOffers()
      expect(offers).toHaveLength(4)
    })

    it("每个特惠结构完整", () => {
      const offers = generateLimitedOffers()
      for (const offer of offers) {
        expect(typeof offer.itemId).toBe("string")
        expect(typeof offer.discount).toBe("number")
        expect(offer.discount).toBeGreaterThan(0)
        expect(offer.discount).toBeLessThanOrEqual(0.7)
        expect(offer.badge).toBeDefined()
        expect(typeof offer.discountedPrice).toBe("number")
        expect(typeof offer.originalPrice).toBe("number")
        expect(offer.purchased).toBe(false)
      }
    })
  })

  describe("loadInventory (默认库存)", () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it("无存储时返回默认库存（每种 99）", () => {
      const inv = loadInventory()
      expect(inv.outlineLamp).toBe(99)
      expect(inv.catStone).toBe(99)
      expect(Object.keys(inv).length).toBeGreaterThanOrEqual(11)
    })

    it("存储损坏时回退到默认库存", () => {
      window.localStorage.setItem(SHOP_STORAGE_KEY, "{invalid json")
      const inv = loadInventory()
      expect(inv.outlineLamp).toBe(99)
    })
  })
})
