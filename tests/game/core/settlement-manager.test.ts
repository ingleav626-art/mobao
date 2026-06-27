import { describe, it, expect } from 'vitest'
import {
  calculateDividendTicket,
  getSelfProfitInfo,
  buildDividendTicketLog,
  type DividendTicketResult
} from '../../../scripts/game/core/settlement-manager'

describe('settlement-manager', () => {
  describe('calculateDividendTicket', () => {
    it('盈利时计算门票', () => {
      const result = calculateDividendTicket(100000, 80000)
      expect(result.winnerProfit).toBe(20000)
      expect(result.ticketPerPlayer).toBe(1000) // 20000 * 0.05
      expect(result.dividendPerPlayer).toBe(0)
      expect(result.mechanism).toBe('ticket')
    })

    it('亏损时计算分红', () => {
      const result = calculateDividendTicket(50000, 80000)
      expect(result.winnerProfit).toBe(-30000)
      expect(result.dividendPerPlayer).toBe(4500) // 30000 * 0.15
      expect(result.ticketPerPlayer).toBe(0)
      expect(result.mechanism).toBe('dividend')
    })

    it('平局无分红无门票', () => {
      const result = calculateDividendTicket(80000, 80000)
      expect(result.winnerProfit).toBe(0)
      expect(result.dividendPerPlayer).toBe(0)
      expect(result.ticketPerPlayer).toBe(0)
      expect(result.mechanism).toBe('none')
    })

    it('小额盈利四舍五入', () => {
      // 150 * 0.05 = 7.5 → 8
      const result = calculateDividendTicket(10150, 10000)
      expect(result.winnerProfit).toBe(150)
      expect(result.ticketPerPlayer).toBe(8)
    })

    it('小额亏损四舍五入', () => {
      // 149 * 0.15 = 22.35 → 22
      const result = calculateDividendTicket(10000, 10149)
      expect(result.winnerProfit).toBe(-149)
      expect(result.dividendPerPlayer).toBe(22)
    })

    it('大额盈利', () => {
      const result = calculateDividendTicket(1000000, 500000)
      expect(result.winnerProfit).toBe(500000)
      expect(result.ticketPerPlayer).toBe(25000)
      expect(result.mechanism).toBe('ticket')
    })

    it('大额亏损', () => {
      const result = calculateDividendTicket(100000, 500000)
      expect(result.winnerProfit).toBe(-400000)
      expect(result.dividendPerPlayer).toBe(60000)
      expect(result.mechanism).toBe('dividend')
    })

    it('winnerBid 为 0', () => {
      const result = calculateDividendTicket(50000, 0)
      expect(result.winnerProfit).toBe(50000)
      expect(result.mechanism).toBe('ticket')
    })

    it('totalValue 为 0', () => {
      const result = calculateDividendTicket(0, 50000)
      expect(result.winnerProfit).toBe(-50000)
      expect(result.mechanism).toBe('dividend')
    })
  })

  describe('getSelfProfitInfo', () => {
    it('赢家返回 winnerProfit', () => {
      const result = getSelfProfitInfo(20000, 0, 1000, true)
      expect(result.profit).toBe(20000)
      expect(result.label).toBe('自身利润')
    })

    it('非赢家有分红', () => {
      const result = getSelfProfitInfo(-30000, 4500, 0, false)
      expect(result.profit).toBe(4500)
      expect(result.label).toBe('自身利润（分红）')
    })

    it('非赢家有门票', () => {
      const result = getSelfProfitInfo(20000, 0, 1000, false)
      expect(result.profit).toBe(-1000)
      expect(result.label).toBe('自身利润（门票）')
    })

    it('非赢家平局', () => {
      const result = getSelfProfitInfo(0, 0, 0, false)
      expect(result.profit).toBe(0)
      expect(result.label).toBe('自身利润')
    })

    it('赢家亏损时也返回 winnerProfit', () => {
      const result = getSelfProfitInfo(-50000, 7500, 0, true)
      expect(result.profit).toBe(-50000)
      expect(result.label).toBe('自身利润')
    })
  })

  describe('buildDividendTicketLog', () => {
    it('亏损分红', () => {
      const msg = buildDividendTicketLog(-30000, 4500, 0)
      expect(msg).toContain('分红')
      expect(msg).toContain('4500')
    })

    it('盈利用门票', () => {
      const msg = buildDividendTicketLog(20000, 0, 1000)
      expect(msg).toContain('门票')
      expect(msg).toContain('1000')
    })

    it('平局返回 null', () => {
      expect(buildDividendTicketLog(0, 0, 0)).toBeNull()
    })

    it('亏损但 dividend 为 0 返回 null', () => {
      expect(buildDividendTicketLog(-1, 0, 0)).toBeNull()
    })

    it('盈利但 ticket 为 0 返回 null', () => {
      expect(buildDividendTicketLog(1, 0, 0)).toBeNull()
    })
  })
})
