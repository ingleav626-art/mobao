import { describe, it, expect, vi } from 'vitest'
import { pickRandomItemCell } from '../../../scripts/game/ai/intel'

describe('intel', () => {
  describe('pickRandomItemCell', () => {
    it('1x1 物品返回唯一格', () => {
      const cell = pickRandomItemCell({ x: 3, y: 5, w: 1, h: 1 })
      expect(cell).toEqual({ x: 3, y: 5 })
    })

    it('2x2 物品返回范围内格', () => {
      const item = { x: 1, y: 1, w: 2, h: 2 }
      const validCells = [
        { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 1, y: 2 }, { x: 2, y: 2 }
      ]
      for (let i = 0; i < 20; i++) {
        const cell = pickRandomItemCell(item)
        expect(cell).not.toBeNull()
        expect(validCells.some(c => c.x === cell!.x && c.y === cell!.y)).toBe(true)
      }
    })

    it('3x2 物品返回 6 种可能格之一', () => {
      const item = { x: 0, y: 0, w: 3, h: 2 }
      const seen = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const cell = pickRandomItemCell(item)
        expect(cell).not.toBeNull()
        seen.add(`${cell!.x},${cell!.y}`)
      }
      // 100次随机应该覆盖大部分6个格
      expect(seen.size).toBeGreaterThanOrEqual(3)
    })

    it('0x0 物品返回 null', () => {
      expect(pickRandomItemCell({ x: 0, y: 0, w: 0, h: 0 })).toBeNull()
    })

    it('w=0 或 h=0 返回 null', () => {
      expect(pickRandomItemCell({ x: 0, y: 0, w: 3, h: 0 })).toBeNull()
      expect(pickRandomItemCell({ x: 0, y: 0, w: 0, h: 3 })).toBeNull()
    })
  })
})
