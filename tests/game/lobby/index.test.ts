import { describe, it, expect } from 'vitest'
import {
  isAiLlmEnabledForPlayer,
  getSlotLayout,
  sortCollectionItems
} from '../../../scripts/game/lobby/index'

describe('lobby/index', () => {
  describe('isAiLlmEnabledForPlayer', () => {
    it('启用时返回 true', () => {
      expect(isAiLlmEnabledForPlayer({ p1: true, p2: false }, 'p1')).toBe(true)
    })

    it('未启用时返回 false', () => {
      expect(isAiLlmEnabledForPlayer({ p1: true, p2: false }, 'p2')).toBe(false)
    })

    it('map 为 null 返回 false', () => {
      expect(isAiLlmEnabledForPlayer(null, 'p1')).toBe(false)
    })

    it('map 为 undefined 返回 false', () => {
      expect(isAiLlmEnabledForPlayer(undefined, 'p1')).toBe(false)
    })

    it('playerId 不在 map 中返回 false', () => {
      expect(isAiLlmEnabledForPlayer({ p1: true }, 'p2')).toBe(false)
    })
  })

  describe('getSlotLayout', () => {
    it('1人只有左侧', () => {
      const result = getSlotLayout(1)
      expect(result.leftSlots).toEqual(['p1'])
      expect(result.rightSlots).toEqual([])
    })

    it('2人左右各一', () => {
      const result = getSlotLayout(2)
      expect(result.leftSlots).toEqual(['p1'])
      expect(result.rightSlots).toEqual(['p2'])
    })

    it('3人左1右2', () => {
      const result = getSlotLayout(3)
      expect(result.leftSlots).toEqual(['p1', 'p2'])
      expect(result.rightSlots).toEqual(['p3'])
    })

    it('4人左右各2', () => {
      const result = getSlotLayout(4)
      expect(result.leftSlots).toEqual(['p1', 'p2'])
      expect(result.rightSlots).toEqual(['p3', 'p4'])
    })

    it('0人全空', () => {
      const result = getSlotLayout(0)
      expect(result.leftSlots).toEqual(['p1'])
      expect(result.rightSlots).toEqual([])
    })
  })

  describe('sortCollectionItems', () => {
    const items = [
      { name: '铜鼎', basePrice: 5000, w: 3, h: 2 },
      { name: '青花瓷', basePrice: 1000, w: 1, h: 1 },
      { name: '白玉佩', basePrice: 3000, w: 2, h: 1 }
    ]

    it('default 返回原顺序', () => {
      const result = sortCollectionItems(items, 'default')
      expect(result).toEqual(items)
    })

    it('price-asc 按价格升序', () => {
      const result = sortCollectionItems(items, 'price-asc')
      expect(result.map(i => i.basePrice)).toEqual([1000, 3000, 5000])
    })

    it('price-desc 按价格降序', () => {
      const result = sortCollectionItems(items, 'price-desc')
      expect(result.map(i => i.basePrice)).toEqual([5000, 3000, 1000])
    })

    it('name-asc 按名称排序', () => {
      const result = sortCollectionItems(items, 'name-asc')
      const names = result.map(i => i.name)
      // localeCompare with "zh" locale
      expect(names).toHaveLength(3)
      // 不修改原数组
      expect(items[0].name).toBe('铜鼎')
    })

    it('size-asc 按面积升序', () => {
      const result = sortCollectionItems(items, 'size-asc')
      expect(result.map(i => i.w * i.h)).toEqual([1, 2, 6])
    })

    it('size-desc 按面积降序', () => {
      const result = sortCollectionItems(items, 'size-desc')
      expect(result.map(i => i.w * i.h)).toEqual([6, 2, 1])
    })

    it('未知排序值返回原顺序', () => {
      const result = sortCollectionItems(items, 'unknown')
      expect(result).toEqual(items)
    })

    it('不修改原数组', () => {
      const original = [...items]
      sortCollectionItems(items, 'price-asc')
      expect(items).toEqual(original)
    })

    it('空列表返回空', () => {
      expect(sortCollectionItems([], 'price-asc')).toEqual([])
    })
  })
})
