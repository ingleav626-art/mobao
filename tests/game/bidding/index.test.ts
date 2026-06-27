import { describe, it, expect } from 'vitest'
import {
  getLastRoundBidMap,
  shouldDirectTake
} from '../../../scripts/game/bidding/index'

describe('bidding', () => {
  describe('getLastRoundBidMap', () => {
    it('返回每个玩家最后一轮出价', () => {
      const history = {
        'ai-1': [{ bid: 1000 }, { bid: 2000 }],
        'ai-2': [{ bid: 1500 }]
      }
      const result = getLastRoundBidMap(history)
      expect(result).toEqual({ 'ai-1': 2000, 'ai-2': 1500 })
    })

    it('空历史不出现在结果中', () => {
      const history = {
        'ai-1': [{ bid: 1000 }],
        'ai-2': []
      }
      const result = getLastRoundBidMap(history)
      expect(result).toEqual({ 'ai-1': 1000 })
      expect(result['ai-2']).toBeUndefined()
    })

    it('完全空历史返回空对象', () => {
      expect(getLastRoundBidMap({})).toEqual({})
    })

    it('单轮历史', () => {
      const history = { 'p1': [{ bid: 500 }] }
      expect(getLastRoundBidMap(history)).toEqual({ 'p1': 500 })
    })

    it('多轮取最后一轮', () => {
      const history = {
        'ai-1': [{ bid: 100 }, { bid: 200 }, { bid: 300 }]
      }
      expect(getLastRoundBidMap(history)).toEqual({ 'ai-1': 300 })
    })
  })

  describe('shouldDirectTake', () => {
    it('出价超过阈值时直接拿下', () => {
      // second=1000, ratio=0.2, threshold=ceil(1000*1.2)=1200
      expect(shouldDirectTake(3, 5, 1200, 1000, 0.2)).toBe(true)
    })

    it('出价等于阈值时直接拿下', () => {
      expect(shouldDirectTake(3, 5, 1200, 1000, 0.2)).toBe(true)
    })

    it('出价低于阈值时不拿下', () => {
      expect(shouldDirectTake(3, 5, 1199, 1000, 0.2)).toBe(false)
    })

    it('最后一回合不触发直接拿下', () => {
      expect(shouldDirectTake(5, 5, 9999, 1000, 0.2)).toBe(false)
    })

    it('出价为 0 不拿下', () => {
      expect(shouldDirectTake(3, 5, 0, 1000, 0.2)).toBe(false)
    })

    it('第二名为 0 时阈值为 0，出价>0 即拿下', () => {
      expect(shouldDirectTake(3, 5, 100, 0, 0.2)).toBe(true)
    })

    it('第一回合可以触发', () => {
      expect(shouldDirectTake(1, 5, 2000, 1000, 0.2)).toBe(true)
    })

    it('ratio=0 时出价>=第二名即拿下', () => {
      expect(shouldDirectTake(3, 5, 1000, 1000, 0)).toBe(true)
    })

    it('ratio=1 时需要两倍', () => {
      expect(shouldDirectTake(3, 5, 1999, 1000, 1)).toBe(false)
      expect(shouldDirectTake(3, 5, 2000, 1000, 1)).toBe(true)
    })
  })
})
