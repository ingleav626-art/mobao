import { describe, it, expect } from 'vitest'
import {
  applyMemoryOperations,
  updateCrossGameMemory,
  type CrossGameMemory
} from '../../../scripts/game/ai/reflection'

describe('reflection', () => {
  describe('applyMemoryOperations', () => {
    it('add 操作添加新条目', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, { add: ['c', 'd'] }, 10)
      expect(arr).toEqual(['a', 'b', 'c', 'd'])
    })

    it('add 不添加重复条目', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, { add: ['b', 'c'] }, 10)
      expect(arr).toEqual(['a', 'b', 'c'])
    })

    it('delete 操作删除指定索引', () => {
      const arr = ['a', 'b', 'c', 'd']
      applyMemoryOperations(arr, { delete: [1, 3] }, 10)
      expect(arr).toEqual(['a', 'c'])
    })

    it('modify 操作修改指定索引', () => {
      const arr = ['a', 'b', 'c']
      applyMemoryOperations(arr, { modify: [[1, 'B']] }, 10)
      expect(arr).toEqual(['a', 'B', 'c'])
    })

    it('组合操作：delete → modify → add', () => {
      const arr = ['a', 'b', 'c']
      // 执行顺序：delete [0] → ['b','c']，modify [1,'B'] → ['b','B']，add ['d'] → ['b','B','d']
      applyMemoryOperations(arr, {
        add: ['d'],
        delete: [0],
        modify: [[1, 'B']]
      }, 10)
      expect(arr).toEqual(['b', 'B', 'd'])
    })

    it('超过 maxLength 时截断旧条目', () => {
      const arr = ['a', 'b', 'c']
      // add ['d','e'] → ['a','b','c','d','e']，5>4 截断 → ['b','c','d','e']
      applyMemoryOperations(arr, { add: ['d', 'e'] }, 4)
      expect(arr).toEqual(['b', 'c', 'd', 'e'])
      // 再加一个 → ['b','c','d','e','f']，5>4 截断 → ['c','d','e','f']
      applyMemoryOperations(arr, { add: ['f'] }, 4)
      expect(arr).toEqual(['c', 'd', 'e', 'f'])
    })

    it('空操作不改变数组', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, {}, 10)
      expect(arr).toEqual(['a', 'b'])
    })

    it('null 操作不改变数组', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, null as any, 10)
      expect(arr).toEqual(['a', 'b'])
    })

    it('delete 越界索引被忽略', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, { delete: [-1, 99] }, 10)
      expect(arr).toEqual(['a', 'b'])
    })

    it('modify 越界索引被忽略', () => {
      const arr = ['a', 'b']
      applyMemoryOperations(arr, { modify: [[-1, 'X'], [99, 'Y']] }, 10)
      expect(arr).toEqual(['a', 'b'])
    })

    it('add 空字符串不添加', () => {
      const arr = ['a']
      applyMemoryOperations(arr, { add: ['', '  ', 'b'] }, 10)
      expect(arr).toEqual(['a', 'b'])
    })
  })

  describe('updateCrossGameMemory', () => {
    function makeMemory(): CrossGameMemory {
      return {
        stats: {
          totalGames: 0, warehouseValueMax: 0, warehouseValueMin: 0, warehouseValueAvg: 0,
          winRate: 0, avgProfit: 0, totalCellsMax: 0, totalCellsMin: 0, totalCellsAvg: 0,
          totalItemsMax: 0, totalItemsMin: 0, totalItemsAvg: 0,
          legendaryMax: 0, legendaryMin: 0, legendaryAvg: 0,
          rareMax: 0, rareMin: 0, rareAvg: 0
        },
        lessons: [],
        strategies: [],
        praises: []
      }
    }

    it('首次游戏统计初始化正确', () => {
      const memory = makeMemory()
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'ai-1',
        warehouseValue: 500000,
        totalCells: 20,
        totalItems: 10,
        qualityCounts: { legendary: 1, rare: 2, fine: 3, normal: 2, poor: 2 },
        winnerProfit: 50000
      }, {})

      expect(memory.stats.totalGames).toBe(1)
      expect(memory.stats.winRate).toBe(1) // 胜率100%
      expect(memory.stats.avgProfit).toBe(50000)
      expect(memory.stats.warehouseValueMax).toBe(500000)
      expect(memory.stats.legendaryMax).toBe(1)
      expect(memory.stats.rareMax).toBe(2)
    })

    it('多局累积统计正确', () => {
      const memory = makeMemory()
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'ai-1', warehouseValue: 400000, totalCells: 15, totalItems: 8,
        qualityCounts: { legendary: 0, rare: 1, fine: 2, normal: 3, poor: 2 }, winnerProfit: 30000
      }, {})
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'other', warehouseValue: 600000, totalCells: 25, totalItems: 12,
        qualityCounts: { legendary: 2, rare: 3, fine: 2, normal: 3, poor: 2 }, dividendTicket: { mechanism: 'dividend', dividendPerPlayer: 5000 }
      }, {})

      expect(memory.stats.totalGames).toBe(2)
      expect(memory.stats.winRate).toBe(0.5) // 1/2
      expect(memory.stats.warehouseValueMax).toBe(600000)
      expect(memory.stats.warehouseValueMin).toBe(400000)
    })

    it('reflection 操作应用到经验本', () => {
      const memory = makeMemory()
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'ai-1', warehouseValue: 500000, totalCells: 20, totalItems: 10,
        qualityCounts: { legendary: 1, rare: 1, fine: 2, normal: 3, poor: 3 }, winnerProfit: 0
      }, {
        praises: { add: ['出价要果断'] },
        strategies: { add: ['前两轮观察'] },
        lessons: { add: ['不要追高'] }
      })

      expect(memory.praises).toContain('出价要果断')
      expect(memory.strategies).toContain('前两轮观察')
      expect(memory.lessons).toContain('不要追高')
    })

    it('分红机制计算正确', () => {
      const memory = makeMemory()
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'other', warehouseValue: 500000, totalCells: 20, totalItems: 10,
        qualityCounts: { legendary: 0, rare: 0, fine: 0, normal: 0, poor: 0 },
        dividendTicket: { mechanism: 'dividend', dividendPerPlayer: 8000 }
      }, {})
      expect(memory.stats.avgProfit).toBe(8000)
    })

    it('门票机制计算正确（负利润）', () => {
      const memory = makeMemory()
      updateCrossGameMemory(memory, 'ai-1', {
        winnerId: 'other', warehouseValue: 500000, totalCells: 20, totalItems: 10,
        qualityCounts: { legendary: 0, rare: 0, fine: 0, normal: 0, poor: 0 },
        dividendTicket: { mechanism: 'ticket', ticketPerPlayer: 3000 }
      }, {})
      expect(memory.stats.avgProfit).toBe(-3000)
    })
  })
})
