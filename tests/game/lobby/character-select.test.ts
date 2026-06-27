import { describe, it, expect } from 'vitest'
import {
  calcReplenishCost
} from '../../../scripts/game/lobby/character-select'

describe('character-select', () => {
  describe('calcReplenishCost', () => {
    const shopDefs = [
      { id: 'item-a', price: 100 },
      { id: 'item-b', price: 200 },
      { id: 'item-c' }
    ]
    const keyFn = (id: string) => `inv_${id}`

    it('库存不足时计算补充费用', () => {
      const carry = [
        { id: 'item-a', name: '道具A', icon: 'a.png' },
        { id: 'item-b', name: '道具B', icon: 'b.png' }
      ]
      const inv = { 'inv_item-a': 0, 'inv_item-b': 0 }
      const result = calcReplenishCost(carry, shopDefs, inv, keyFn)
      expect(result.totalCost).toBe(300)
      expect(result.items).toHaveLength(2)
    })

    it('库存充足不补充', () => {
      const carry = [
        { id: 'item-a', name: '道具A', icon: 'a.png' }
      ]
      const inv = { 'inv_item-a': 5 }
      const result = calcReplenishCost(carry, shopDefs, inv, keyFn)
      expect(result.totalCost).toBe(0)
      expect(result.items).toHaveLength(0)
    })

    it('混合库存', () => {
      const carry = [
        { id: 'item-a', name: '道具A', icon: 'a.png' },
        { id: 'item-b', name: '道具B', icon: 'b.png' }
      ]
      const inv = { 'inv_item-a': 3, 'inv_item-b': 0 }
      const result = calcReplenishCost(carry, shopDefs, inv, keyFn)
      expect(result.totalCost).toBe(200)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('item-b')
    })

    it('商店无定义的道具被跳过', () => {
      const carry = [
        { id: 'unknown-item', name: '未知', icon: 'x.png' }
      ]
      const result = calcReplenishCost(carry, shopDefs, {}, keyFn)
      expect(result.totalCost).toBe(0)
      expect(result.items).toHaveLength(0)
    })

    it('price 缺失时按 0 处理', () => {
      const carry = [
        { id: 'item-c', name: '道具C', icon: 'c.png' }
      ]
      const inv = { 'inv_item-c': 0 }
      const result = calcReplenishCost(carry, shopDefs, inv, keyFn)
      expect(result.totalCost).toBe(0)
      expect(result.items).toHaveLength(1)
      expect(result.items[0].price).toBe(0)
    })

    it('空携带列表返回空', () => {
      const result = calcReplenishCost([], shopDefs, {}, keyFn)
      expect(result.totalCost).toBe(0)
      expect(result.items).toHaveLength(0)
    })

    it('inventory 中无对应 key 视为 0', () => {
      const carry = [
        { id: 'item-a', name: '道具A', icon: 'a.png' }
      ]
      const result = calcReplenishCost(carry, shopDefs, {}, keyFn)
      expect(result.totalCost).toBe(100)
      expect(result.items).toHaveLength(1)
    })

    it('结果项包含完整信息', () => {
      const carry = [
        { id: 'item-a', name: '道具A', icon: 'a.png' }
      ]
      const result = calcReplenishCost(carry, shopDefs, { 'inv_item-a': 0 }, keyFn)
      expect(result.items[0]).toEqual({
        id: 'item-a',
        name: '道具A',
        icon: 'a.png',
        price: 100,
        shortage: 1
      })
    })
  })
})
