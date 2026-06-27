import { describe, it, expect } from 'vitest'
import {
  analyzeWarehouse,
  generateEvents,
  pickMultiplePublicEvents,
  getWarehouseAnalysis,
  QUALITY_LABELS,
  QUALITY_ORDER,
  CATEGORY_NAMES
} from '../../../scripts/game/data/public-events'

describe('public-events', () => {
  describe('常量', () => {
    it('QUALITY_LABELS 包含 5 个品质', () => {
      expect(Object.keys(QUALITY_LABELS)).toHaveLength(5)
      expect(QUALITY_LABELS.poor).toBe('粗品')
      expect(QUALITY_LABELS.legendary).toBe('绝品')
    })

    it('QUALITY_ORDER 从低到高', () => {
      expect(QUALITY_ORDER).toEqual(['poor', 'normal', 'fine', 'rare', 'legendary'])
    })

    it('CATEGORY_NAMES 包含 6 个品类', () => {
      expect(Object.keys(CATEGORY_NAMES)).toHaveLength(6)
    })
  })

  describe('analyzeWarehouse', () => {
    it('空列表返回 null', () => {
      expect(analyzeWarehouse([])).toBeNull()
    })

    it('null 返回 null', () => {
      expect(analyzeWarehouse(null as any)).toBeNull()
    })

    it('单个物品', () => {
      const items = [{ trueValue: 5000, w: 2, h: 1, qualityKey: 'fine', category: '瓷器' }]
      const result = analyzeWarehouse(items)!
      expect(result.total).toBe(1)
      expect(result.totalCells).toBe(2)
      expect(result.totalValue).toBe(5000)
      expect(result.avgPrice).toBe(5000)
      expect(result.categories['瓷器']).toBe(1)
      expect(result.qualities.fine).toBe(1)
    })

    it('多个物品统计正确', () => {
      const items = [
        { trueValue: 3000, w: 1, h: 1, qualityKey: 'poor', category: '瓷器' },
        { trueValue: 6000, w: 2, h: 1, qualityKey: 'fine', category: '玉器' },
        { trueValue: 10000, w: 3, h: 1, qualityKey: 'rare', category: '瓷器' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.total).toBe(3)
      expect(result.totalCells).toBe(6)
      expect(result.totalValue).toBe(19000)
      expect(result.avgPrice).toBe(6333)
      expect(result.maxPrice).toBe(10000)
      expect(result.minPrice).toBe(3000)
      expect(result.topCategory).toBe('瓷器')
      expect(result.hasRare).toBe(true)
      expect(result.rareCount).toBe(1)
    })

    it('大件物品计数', () => {
      const items = [
        { w: 1, h: 1, qualityKey: 'normal' },
        { w: 2, h: 1, qualityKey: 'normal' },
        { w: 1, h: 3, qualityKey: 'normal' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.largeItems).toBe(2)
    })

    it('高价值物品计数 (>=6000)', () => {
      const items = [
        { trueValue: 5999, qualityKey: 'normal' },
        { trueValue: 6000, qualityKey: 'normal' },
        { trueValue: 10000, qualityKey: 'normal' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.highValueItems).toBe(2)
    })

    it('低价值物品计数 (<=2500)', () => {
      const items = [
        { trueValue: 2500, qualityKey: 'normal' },
        { trueValue: 2501, qualityKey: 'normal' },
        { trueValue: 1000, qualityKey: 'normal' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.lowValueItems).toBe(2)
    })

    it('绝品检测', () => {
      const items = [
        { qualityKey: 'legendary' },
        { qualityKey: 'legendary' },
        { qualityKey: 'fine' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.hasLegendary).toBe(true)
      expect(result.legendaryCount).toBe(2)
    })

    it('topQuality 取最高品质', () => {
      const items = [
        { qualityKey: 'poor' },
        { qualityKey: 'poor' },
        { qualityKey: 'fine' }
      ]
      const result = analyzeWarehouse(items)!
      expect(result.topQuality).toBe('poor')
    })

    it('缺失字段使用默认值', () => {
      const items = [{}]
      const result = analyzeWarehouse(items)!
      expect(result.total).toBe(1)
      expect(result.totalCells).toBe(1)
      expect(result.totalValue).toBe(0)
    })
  })

  describe('generateEvents', () => {
    it('空列表返回空', () => {
      expect(generateEvents([], 12, 25)).toEqual([])
    })

    it('有绝品生成事件', () => {
      const items = [{ qualityKey: 'legendary', trueValue: 10000 }]
      const events = generateEvents(items, 12, 25)
      expect(events.some(e => e.id === 'evt-legendary-exists')).toBe(true)
    })

    it('多个珍品生成事件', () => {
      const items = [
        { qualityKey: 'rare', trueValue: 5000 },
        { qualityKey: 'rare', trueValue: 6000 }
      ]
      const events = generateEvents(items, 12, 25)
      expect(events.some(e => e.id === 'evt-rare-multiple')).toBe(true)
    })

    it('事件按优先级降序排列', () => {
      const items = [
        { qualityKey: 'legendary', trueValue: 10000, category: '瓷器' },
        { qualityKey: 'rare', trueValue: 5000, category: '玉器' }
      ]
      const events = generateEvents(items, 12, 25)
      for (let i = 1; i < events.length; i++) {
        expect(events[i].priority || 0).toBeLessThanOrEqual(events[i - 1].priority || 0)
      }
    })

    it('总会有仓库统计事件', () => {
      const items = [{ qualityKey: 'normal', trueValue: 3000 }]
      const events = generateEvents(items, 12, 25)
      expect(events.some(e => e.id === 'evt-total-summary')).toBe(true)
    })
  })

  describe('pickMultiplePublicEvents', () => {
    it('空列表返回默认事件', () => {
      const events = pickMultiplePublicEvents([], 12, 25, 3)
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('evt-default')
    })

    it('返回指定数量', () => {
      const items = [
        { qualityKey: 'legendary', trueValue: 10000, category: '瓷器', w: 2, h: 1 },
        { qualityKey: 'rare', trueValue: 5000, category: '玉器', w: 1, h: 1 }
      ]
      const events = pickMultiplePublicEvents(items, 12, 25, 2)
      expect(events.length).toBeLessThanOrEqual(2)
    })

    it('count 超过可用数返回全部', () => {
      const items = [{ qualityKey: 'normal', trueValue: 3000 }]
      const events = pickMultiplePublicEvents(items, 12, 25, 100)
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('getWarehouseAnalysis', () => {
    it('委托 analyzeWarehouse', () => {
      const items = [{ trueValue: 5000, qualityKey: 'fine' }]
      const result = getWarehouseAnalysis(items, 12, 25)
      expect(result).not.toBeNull()
      expect(result!.total).toBe(1)
    })

    it('空列表返回 null', () => {
      expect(getWarehouseAnalysis([], 12, 25)).toBeNull()
    })
  })
})
