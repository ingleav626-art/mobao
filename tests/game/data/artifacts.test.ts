import { describe, it, expect } from 'vitest'
import {
  QUALITY_CONFIG,
  SIZE_TAG_BY_DIMENSION,
  ARTIFACT_LIBRARY,
  CATEGORY_WEIGHTS,
  estimatePriceByQuality,
  signalToRevealState,
  summarizeCandidatePrices,
  summarizeStatsCollection,
  toSizeTag
} from '../../../scripts/game/data/artifacts'

describe('artifacts', () => {
  describe('QUALITY_CONFIG', () => {
    it('包含 5 个品质等级', () => {
      expect(Object.keys(QUALITY_CONFIG)).toEqual(
        expect.arrayContaining(['poor', 'normal', 'fine', 'rare', 'legendary'])
      )
      expect(Object.keys(QUALITY_CONFIG)).toHaveLength(5)
    })

    it('每个品质有 label/color/glow/weight', () => {
      for (const [key, config] of Object.entries(QUALITY_CONFIG)) {
        expect(config).toHaveProperty('label')
        expect(config).toHaveProperty('color')
        expect(config).toHaveProperty('glow')
        expect(config).toHaveProperty('weight')
        expect(typeof config.label).toBe('string')
        expect(typeof config.color).toBe('number')
        expect(typeof config.weight).toBe('number')
      }
    })

    it('权重之和为 100', () => {
      const total = Object.values(QUALITY_CONFIG).reduce((sum, c) => sum + c.weight, 0)
      expect(total).toBe(100)
    })
  })

  describe('SIZE_TAG_BY_DIMENSION', () => {
    it('包含常见尺寸', () => {
      expect(SIZE_TAG_BY_DIMENSION['1x1']).toBe('1x1')
      expect(SIZE_TAG_BY_DIMENSION['2x2']).toBe('2x2')
      expect(SIZE_TAG_BY_DIMENSION['3x2']).toBe('3x2')
      expect(SIZE_TAG_BY_DIMENSION['4x1']).toBe('4x1')
    })
  })

  describe('ARTIFACT_LIBRARY', () => {
    it('至少有 60 件藏品', () => {
      expect(ARTIFACT_LIBRARY.length).toBeGreaterThanOrEqual(60)
    })

    it('每件藏品有完整字段', () => {
      for (const item of ARTIFACT_LIBRARY) {
        expect(item).toHaveProperty('key')
        expect(item).toHaveProperty('majorCategory')
        expect(item).toHaveProperty('category')
        expect(item).toHaveProperty('name')
        expect(item).toHaveProperty('basePrice')
        expect(item).toHaveProperty('qualityKey')
        expect(item).toHaveProperty('w')
        expect(item).toHaveProperty('h')
        expect(item.basePrice).toBeGreaterThan(0)
        expect(item.w).toBeGreaterThan(0)
        expect(item.h).toBeGreaterThan(0)
      }
    })

    it('qualityKey 都在 QUALITY_CONFIG 中', () => {
      for (const item of ARTIFACT_LIBRARY) {
        expect(QUALITY_CONFIG).toHaveProperty(item.qualityKey)
      }
    })

    it('key 唯一', () => {
      const keys = ARTIFACT_LIBRARY.map((a) => a.key)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('majorCategory 只有古董和珠宝首饰', () => {
      const cats = new Set(ARTIFACT_LIBRARY.map((a) => a.majorCategory))
      expect(cats).toEqual(new Set(['古董', '珠宝首饰']))
    })
  })

  describe('CATEGORY_WEIGHTS', () => {
    it('包含 10 个品类', () => {
      expect(CATEGORY_WEIGHTS).toHaveLength(10)
    })

    it('权重之和为 100', () => {
      const total = CATEGORY_WEIGHTS.reduce((sum, c) => sum + c.weight, 0)
      expect(total).toBe(100)
    })

    it('所有 key 在 ARTIFACT_LIBRARY 中有对应品类', () => {
      const categories = new Set(ARTIFACT_LIBRARY.map((a) => a.category))
      for (const cw of CATEGORY_WEIGHTS) {
        expect(categories).toContain(cw.key)
      }
    })
  })

  describe('estimatePriceByQuality', () => {
    it('poor × 0.72', () => {
      expect(estimatePriceByQuality(1000, 'poor')).toBe(720)
    })
    it('normal × 0.95', () => {
      expect(estimatePriceByQuality(1000, 'normal')).toBe(950)
    })
    it('fine × 1.18', () => {
      expect(estimatePriceByQuality(1000, 'fine')).toBe(1180)
    })
    it('rare × 1.45', () => {
      expect(estimatePriceByQuality(1000, 'rare')).toBe(1450)
    })
    it('legendary × 1.85', () => {
      expect(estimatePriceByQuality(1000, 'legendary')).toBe(1850)
    })
    it('未知品质 × 1', () => {
      expect(estimatePriceByQuality(1000, 'unknown')).toBe(1000)
    })
  })

  describe('signalToRevealState', () => {
    it('提取 qualityKey', () => {
      expect(signalToRevealState({ qualityKey: 'rare' })).toEqual({ qualityKey: 'rare' })
    })
    it('提取 sizeTag', () => {
      expect(signalToRevealState({ sizeTag: '2x2' })).toEqual({ sizeTag: '2x2' })
    })
    it('提取 category', () => {
      expect(signalToRevealState({ category: '瓷器' })).toEqual({ category: '瓷器' })
    })
    it('组合字段', () => {
      const result = signalToRevealState({ qualityKey: 'fine', sizeTag: '1x1', category: '玉器' })
      expect(result).toEqual({ qualityKey: 'fine', sizeTag: '1x1', category: '玉器' })
    })
    it('无字段返回空对象', () => {
      expect(signalToRevealState({})).toEqual({})
    })
    it('额外字段被忽略', () => {
      const result = signalToRevealState({ qualityKey: 'rare', extra: 'ignored' })
      expect(result).toEqual({ qualityKey: 'rare' })
    })
  })

  describe('toSizeTag', () => {
    it('已知尺寸返回标签', () => {
      expect(toSizeTag(1, 1)).toBe('1x1')
      expect(toSizeTag(2, 3)).toBe('2x3')
      expect(toSizeTag(4, 1)).toBe('4x1')
    })
    it('未知尺寸返回原始格式', () => {
      expect(toSizeTag(5, 5)).toBe('5x5')
    })
  })

  describe('summarizeCandidatePrices', () => {
    it('空数组返回零值统计', () => {
      const result = summarizeCandidatePrices([])
      expect(result.count).toBe(0)
      expect(result.mean).toBe(0)
    })

    it('单个候选', () => {
      const result = summarizeCandidatePrices([{ basePrice: 1000 }])
      expect(result.count).toBe(1)
      expect(result.mean).toBe(1000)
      expect(result.std).toBe(0)
    })

    it('多个候选计算正确', () => {
      const candidates = [
        { basePrice: 1000 },
        { basePrice: 2000 },
        { basePrice: 3000 },
        { basePrice: 4000 }
      ]
      const result = summarizeCandidatePrices(candidates)
      expect(result.count).toBe(4)
      expect(result.mean).toBe(2500)
      expect(result.p10).toBeGreaterThanOrEqual(1000)
      expect(result.p90).toBeLessThanOrEqual(4000)
    })

    it('使用 expectedPrice 优先于 basePrice', () => {
      const result = summarizeCandidatePrices([{ basePrice: 1000, expectedPrice: 2000 }])
      expect(result.mean).toBe(2000)
    })

    it('过滤零价和负价', () => {
      const result = summarizeCandidatePrices([
        { basePrice: 0 },
        { basePrice: -100 },
        { basePrice: 1000 }
      ])
      expect(result.count).toBe(1)
      expect(result.mean).toBe(1000)
    })
  })

  describe('summarizeStatsCollection', () => {
    it('空数组返回零值', () => {
      const result = summarizeStatsCollection([])
      expect(result.count).toBe(0)
      expect(result.mean).toBe(0)
    })

    it('单组统计直接返回', () => {
      const stats = {
        count: 5, mean: 1000, top2Mean: 1500, bottom2Mean: 500,
        std: 200, p10: 300, q1: 700, q3: 1300, p90: 1700,
        iqr: 600, spreadRatio: 0.6, upperEdge: 0.5, lowerEdge: 0.5
      }
      const result = summarizeStatsCollection([stats])
      expect(result.count).toBe(5)
      expect(result.mean).toBe(1000)
    })

    it('多组加权平均', () => {
      const s1 = {
        count: 2, mean: 1000, top2Mean: 1000, bottom2Mean: 1000,
        std: 0, p10: 1000, q1: 1000, q3: 1000, p90: 1000,
        iqr: 0, spreadRatio: 0, upperEdge: 0, lowerEdge: 0
      }
      const s2 = {
        count: 3, mean: 2000, top2Mean: 2000, bottom2Mean: 2000,
        std: 0, p10: 2000, q1: 2000, q3: 2000, p90: 2000,
        iqr: 0, spreadRatio: 0, upperEdge: 0, lowerEdge: 0
      }
      const result = summarizeStatsCollection([s1, s2])
      // 加权平均: (1000*2 + 2000*3) / 5 = 1600
      expect(result.mean).toBe(1600)
      expect(result.count).toBe(3) // round((2+3)/2) 不对，是 weighted count
    })

    it('过滤 count=0 的统计', () => {
      const valid = {
        count: 3, mean: 1000, top2Mean: 1000, bottom2Mean: 1000,
        std: 0, p10: 1000, q1: 1000, q3: 1000, p90: 1000,
        iqr: 0, spreadRatio: 0, upperEdge: 0, lowerEdge: 0
      }
      const empty = {
        count: 0, mean: 0, top2Mean: 0, bottom2Mean: 0,
        std: 0, p10: 0, q1: 0, q3: 0, p90: 0,
        iqr: 0, spreadRatio: 0, upperEdge: 0, lowerEdge: 0
      }
      const result = summarizeStatsCollection([empty, valid])
      expect(result.count).toBe(3)
      expect(result.mean).toBe(1000)
    })
  })
})
