import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_CROSS_GAME_STATS,
  getAiMemoryStorageKey,
  loadAiMemoryFromStorage,
  getQualityCounts,
  getTotalOccupiedCells,
  ensureCrossGameMemory,
  type CrossGameMemory
} from '../../../scripts/game/ai/memory'

describe('memory', () => {
  describe('DEFAULT_CROSS_GAME_STATS', () => {
    it('所有数值字段初始化为 0', () => {
      expect(DEFAULT_CROSS_GAME_STATS.totalGames).toBe(0)
      expect(DEFAULT_CROSS_GAME_STATS.winRate).toBe(0)
      expect(DEFAULT_CROSS_GAME_STATS.avgProfit).toBe(0)
      expect(DEFAULT_CROSS_GAME_STATS.warehouseValueMax).toBe(0)
      expect(DEFAULT_CROSS_GAME_STATS.rareAvg).toBe(0)
    })
  })

  describe('getAiMemoryStorageKey', () => {
    it('非联机模式返回基础 key', () => {
      const key = getAiMemoryStorageKey(false)
      expect(key).not.toContain('lan')
    })

    it('联机模式返回带 _lan 后缀', () => {
      const key = getAiMemoryStorageKey(true)
      expect(key).toContain('lan')
    })

    it('两种模式 key 不同', () => {
      expect(getAiMemoryStorageKey(false)).not.toBe(getAiMemoryStorageKey(true))
    })
  })

  describe('loadAiMemoryFromStorage', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('无数据时返回 null', () => {
      expect(loadAiMemoryFromStorage('test_key')).toBeNull()
    })

    it('存储了数据能正确读回', () => {
      const data = { conversations: {}, crossGameMemory: {} }
      localStorage.setItem('test_key', JSON.stringify(data))
      const result = loadAiMemoryFromStorage('test_key')
      expect(result).toEqual(data)
    })

    it('存储无效 JSON 时返回 null', () => {
      localStorage.setItem('test_key', '{invalid json')
      expect(loadAiMemoryFromStorage('test_key')).toBeNull()
    })

    it('存储非对象时返回 null', () => {
      localStorage.setItem('test_key', '"just a string"')
      expect(loadAiMemoryFromStorage('test_key')).toBeNull()
    })
  })

  describe('getQualityCounts', () => {
    it('空数组返回全 0', () => {
      const counts = getQualityCounts([])
      expect(counts).toEqual({ poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 })
    })

    it('正确统计各品质数量', () => {
      const items = [
        { qualityKey: 'poor' },
        { qualityKey: 'poor' },
        { qualityKey: 'fine' },
        { qualityKey: 'legendary' },
        { qualityKey: 'normal' },
      ]
      const counts = getQualityCounts(items)
      expect(counts.poor).toBe(2)
      expect(counts.normal).toBe(1)
      expect(counts.fine).toBe(1)
      expect(counts.legendary).toBe(1)
      expect(counts.rare).toBe(0)
    })
  })

  describe('getTotalOccupiedCells', () => {
    it('空数组返回 0', () => {
      expect(getTotalOccupiedCells([])).toBe(0)
    })

    it('正确计算总格数', () => {
      const items = [
        { w: 2, h: 3 }, // 6
        { w: 1, h: 1 }, // 1
        { w: 4, h: 2 }, // 8
      ]
      expect(getTotalOccupiedCells(items)).toBe(15)
    })
  })

  describe('ensureCrossGameMemory', () => {
    it('首次调用创建默认记忆', () => {
      const store: Record<string, CrossGameMemory> = {}
      const memory = ensureCrossGameMemory(store, 'ai-1')
      expect(memory.stats).toBeDefined()
      expect(memory.lessons).toEqual([])
      expect(memory.strategies).toEqual([])
      expect(memory.praises).toEqual([])
    })

    it('已有记忆时返回现有对象', () => {
      const existing: CrossGameMemory = {
        stats: { ...DEFAULT_CROSS_GAME_STATS, totalGames: 5 },
        lessons: ['lesson1'],
        strategies: [],
        praises: []
      }
      const store: Record<string, CrossGameMemory> = { 'ai-1': existing }
      const memory = ensureCrossGameMemory(store, 'ai-1')
      expect(memory).toBe(existing)
      expect(memory.stats.totalGames).toBe(5)
    })

    it('不同 playerId 独立', () => {
      const store: Record<string, CrossGameMemory> = {}
      ensureCrossGameMemory(store, 'ai-1')
      ensureCrossGameMemory(store, 'ai-2')
      expect(store['ai-1']).not.toBe(store['ai-2'])
    })
  })
})
