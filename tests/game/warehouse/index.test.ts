import { describe, it, expect } from 'vitest'
import {
  findFirstEmptySlot,
  isInBoundsCell,
  hasAnyInfo,
  getItemKnownText,
  pickBottomCellFromTargets,
  pickRevealTargets
} from '../../../scripts/game/warehouse/index'

describe('warehouse', () => {
  describe('findFirstEmptySlot', () => {
    it('返回第一个空格', () => {
      const occ = [
        [true, true, false],
        [false, false, false]
      ]
      expect(findFirstEmptySlot(occ, 2, 3)).toEqual({ col: 2, row: 0 })
    })

    it('全满返回 null', () => {
      const occ = [
        [true, true],
        [true, true]
      ]
      expect(findFirstEmptySlot(occ, 2, 2)).toBeNull()
    })

    it('全空返回 {0,0}', () => {
      const occ = [
        [false, false],
        [false, false]
      ]
      expect(findFirstEmptySlot(occ, 2, 2)).toEqual({ col: 0, row: 0 })
    })

    it('第一行满时跳到第二行', () => {
      const occ = [
        [true, true],
        [true, false]
      ]
      expect(findFirstEmptySlot(occ, 2, 2)).toEqual({ col: 1, row: 1 })
    })
  })

  describe('isInBoundsCell', () => {
    it('在范围内', () => {
      expect(isInBoundsCell(0, 0, 12, 25)).toBe(true)
      expect(isInBoundsCell(11, 24, 12, 25)).toBe(true)
    })

    it('超出范围', () => {
      expect(isInBoundsCell(-1, 0, 12, 25)).toBe(false)
      expect(isInBoundsCell(12, 0, 12, 25)).toBe(false)
      expect(isInBoundsCell(0, 25, 12, 25)).toBe(false)
      expect(isInBoundsCell(0, -1, 12, 25)).toBe(false)
    })

    it('边界值', () => {
      expect(isInBoundsCell(0, 0, 1, 1)).toBe(true)
      expect(isInBoundsCell(1, 0, 1, 1)).toBe(false)
    })
  })

  describe('hasAnyInfo', () => {
    it('有轮廓信息', () => {
      expect(hasAnyInfo({ revealed: { outline: true, qualityCell: null } })).toBe(true)
    })

    it('有品质信息', () => {
      expect(hasAnyInfo({ revealed: { outline: false, qualityCell: { x: 0, y: 0 } } })).toBe(true)
    })

    it('都有', () => {
      expect(hasAnyInfo({ revealed: { outline: true, qualityCell: { x: 0, y: 0 } } })).toBe(true)
    })

    it('都没有', () => {
      expect(hasAnyInfo({ revealed: { outline: false, qualityCell: null } })).toBe(false)
    })
  })

  describe('getItemKnownText', () => {
    it('有品质有轮廓', () => {
      const item = { revealed: { outline: true, qualityCell: { x: 0, y: 0 } }, quality: { label: '珍品' }, w: 2, h: 3 }
      expect(getItemKnownText(item)).toBe('品质=珍品 | 占格=2x3')
    })

    it('只有品质', () => {
      const item = { revealed: { outline: false, qualityCell: { x: 0, y: 0 } }, quality: { label: '良品' }, w: 1, h: 1 }
      expect(getItemKnownText(item)).toBe('品质=良品')
    })

    it('只有轮廓', () => {
      const item = { revealed: { outline: true, qualityCell: null }, quality: { label: '精品' }, w: 2, h: 1 }
      expect(getItemKnownText(item)).toBe('占格=2x1')
    })

    it('都没有返回未知', () => {
      const item = { revealed: { outline: false, qualityCell: null }, quality: { label: '粗品' }, w: 1, h: 1 }
      expect(getItemKnownText(item)).toBe('未知藏品')
    })
  })

  describe('pickBottomCellFromTargets', () => {
    it('空数组返回 null', () => {
      expect(pickBottomCellFromTargets([])).toBeNull()
    })

    it('单个目标', () => {
      const result = pickBottomCellFromTargets([{ x: 2, y: 3, w: 1, h: 2 }])
      expect(result).toEqual({ x: 2, y: 4, col: 3, row: 5 })
    })

    it('多个目标选最下方', () => {
      const targets = [
        { x: 0, y: 0, w: 1, h: 1 },  // bottom = 0
        { x: 5, y: 3, w: 2, h: 3 },  // bottom = 5
        { x: 2, y: 1, w: 1, h: 2 }   // bottom = 2
      ]
      const result = pickBottomCellFromTargets(targets)
      expect(result!.y).toBe(5)
      expect(result!.x).toBe(5)
    })

    it('相同底部选先出现的', () => {
      const targets = [
        { x: 0, y: 0, w: 1, h: 3 },  // bottom = 2
        { x: 5, y: 1, w: 1, h: 2 }   // bottom = 2
      ]
      const result = pickBottomCellFromTargets(targets)
      expect(result!.y).toBe(2)
      expect(result!.x).toBe(0)
    })
  })

  describe('pickRevealTargets', () => {
    function makeItem(id: string, category: string, opts: { outline?: boolean; qualityCell?: unknown; w?: number; h?: number } = {}) {
      return {
        id,
        category,
        revealed: {
          outline: opts.outline ?? false,
          qualityCell: opts.qualityCell ?? null
        },
        w: opts.w ?? 1,
        h: opts.h ?? 1
      }
    }

    it('按品类筛选', () => {
      const items = [
        makeItem('1', '瓷器'),
        makeItem('2', '玉器'),
        makeItem('3', '瓷器')
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 10, category: '瓷器', allowCategoryFallback: false, sortStrategy: null })
      expect(result).toHaveLength(2)
      expect(result.every(i => i.category === '瓷器')).toBe(true)
    })

    it('outline 模式排除已揭示轮廓', () => {
      const items = [
        makeItem('1', '瓷器', { outline: true }),
        makeItem('2', '瓷器', { outline: false }),
        makeItem('3', '瓷器', { outline: false })
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 10, category: null, allowCategoryFallback: false, sortStrategy: null })
      expect(result).toHaveLength(2)
      expect(result.map(i => i.id)).toEqual(expect.arrayContaining(['2', '3']))
    })

    it('quality 模式排除已有品质', () => {
      const items = [
        makeItem('1', '瓷器', { qualityCell: { x: 0, y: 0 } }),
        makeItem('2', '瓷器'),
        makeItem('3', '瓷器')
      ]
      const result = pickRevealTargets(items, { mode: 'quality', count: 10, category: null, allowCategoryFallback: false, sortStrategy: null })
      expect(result).toHaveLength(2)
    })

    it('数量限制', () => {
      const items = [
        makeItem('1', '瓷器'),
        makeItem('2', '瓷器'),
        makeItem('3', '瓷器')
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 2, category: null, allowCategoryFallback: false, sortStrategy: null })
      expect(result).toHaveLength(2)
    })

    it('品类不足时回退', () => {
      const items = [
        makeItem('1', '瓷器'),
        makeItem('2', '玉器'),
        makeItem('3', '铜器')
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 3, category: '瓷器', allowCategoryFallback: true, sortStrategy: null })
      expect(result).toHaveLength(3)
    })

    it('品类不足不回退', () => {
      const items = [
        makeItem('1', '瓷器'),
        makeItem('2', '玉器')
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 3, category: '瓷器', allowCategoryFallback: false, sortStrategy: null })
      expect(result).toHaveLength(1)
    })

    it('smallestFirst 排序', () => {
      const items = [
        makeItem('1', '瓷器', { w: 3, h: 2 }),
        makeItem('2', '瓷器', { w: 1, h: 1 }),
        makeItem('3', '瓷器', { w: 2, h: 2 })
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 3, category: null, allowCategoryFallback: false, sortStrategy: 'smallestFirst' })
      expect(result[0].w * result[0].h).toBeLessThanOrEqual(result[1].w * result[1].h)
    })

    it('largestFirst 排序', () => {
      const items = [
        makeItem('1', '瓷器', { w: 1, h: 1 }),
        makeItem('3', '瓷器', { w: 3, h: 2 }),
        makeItem('2', '瓷器', { w: 2, h: 2 })
      ]
      const result = pickRevealTargets(items, { mode: 'outline', count: 3, category: null, allowCategoryFallback: false, sortStrategy: 'largestFirst' })
      expect(result[0].w * result[0].h).toBeGreaterThanOrEqual(result[1].w * result[1].h)
    })

    it('空列表返回空', () => {
      expect(pickRevealTargets([], { mode: 'outline', count: 5, category: null, allowCategoryFallback: false, sortStrategy: null })).toEqual([])
    })

    it('全部已揭示返回空', () => {
      const items = [
        makeItem('1', '瓷器', { outline: true }),
        makeItem('2', '瓷器', { outline: true })
      ]
      expect(pickRevealTargets(items, { mode: 'outline', count: 5, category: null, allowCategoryFallback: false, sortStrategy: null })).toEqual([])
    })
  })
})
