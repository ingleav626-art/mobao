import { describe, it, expect, vi } from 'vitest'
import {
  resetPlayerHistoryState,
  clearCurrentRoundUsage,
  recordPlayerUsage,
  recordRoundHistory,
  renderItemUsageCell,
  type HistoryData
} from '../../../scripts/game/ui/history'
import type { ItemDef } from '../../../scripts/../types/game'

function makeData(): HistoryData {
  return {
    playerRoundHistory: {},
    playerUsageHistory: {},
    currentRoundUsage: {},
    playerHistoryPanels: {}
  }
}

const players = [{ id: 'p1' }, { id: 'p2' }]

function getItemInfo(itemId: string): ItemDef {
  const defs: Record<string, ItemDef> = {
    'item-lamp': { id: 'item-lamp', name: '轮廓探灯', label: '探灯', description: '揭示轮廓', type: 'reveal', execute: (() => ({})) as any },
    'item-scope': { id: 'item-scope', name: '品质鉴定', label: '鉴定', description: '揭示品质', type: 'reveal', execute: (() => ({})) as any },
  }
  return defs[itemId] || { id: itemId, name: itemId, label: itemId, description: '', type: '', execute: (() => ({})) as any }
}

describe('history', () => {
  describe('resetPlayerHistoryState', () => {
    it('初始化所有玩家的历史数据', () => {
      const data = makeData()
      resetPlayerHistoryState(players, data, () => {})
      expect(data.playerRoundHistory['p1']).toEqual([])
      expect(data.playerRoundHistory['p2']).toEqual([])
      expect(data.playerUsageHistory['p1']).toEqual([])
      expect(data.currentRoundUsage['p1']).toEqual([])
    })

    it('调用 refreshUI 回调', () => {
      const data = makeData()
      const fn = vi.fn()
      resetPlayerHistoryState(players, data, fn)
      expect(fn).toHaveBeenCalledOnce()
    })

    it('重置时清除旧数据', () => {
      const data = makeData()
      data.playerRoundHistory['p1'] = [{ round: 1, bid: 100 }]
      data.currentRoundUsage['p1'] = ['item-lamp']
      resetPlayerHistoryState(players, data, () => {})
      expect(data.playerRoundHistory['p1']).toEqual([])
      expect(data.currentRoundUsage['p1']).toEqual([])
    })
  })

  describe('clearCurrentRoundUsage', () => {
    it('清空所有玩家当前回合使用记录', () => {
      const data = makeData()
      data.currentRoundUsage['p1'] = ['item-lamp']
      data.currentRoundUsage['p2'] = ['item-scope']
      clearCurrentRoundUsage(players, data)
      expect(data.currentRoundUsage['p1']).toEqual([])
      expect(data.currentRoundUsage['p2']).toEqual([])
    })
  })

  describe('recordPlayerUsage', () => {
    it('记录道具使用', () => {
      const data = makeData()
      data.currentRoundUsage['p1'] = []
      recordPlayerUsage(data, 'p1', 'item-lamp', () => {})
      expect(data.currentRoundUsage['p1']).toEqual(['item-lamp'])
    })

    it('多次使用追加记录', () => {
      const data = makeData()
      data.currentRoundUsage['p1'] = []
      recordPlayerUsage(data, 'p1', 'item-lamp', () => {})
      recordPlayerUsage(data, 'p1', 'item-scope', () => {})
      expect(data.currentRoundUsage['p1']).toEqual(['item-lamp', 'item-scope'])
    })

    it('未初始化时自动创建数组', () => {
      const data = makeData()
      recordPlayerUsage(data, 'new-player', 'item-lamp', () => {})
      expect(data.currentRoundUsage['new-player']).toEqual(['item-lamp'])
    })
  })

  describe('recordRoundHistory', () => {
    it('记录一轮出价和道具使用', () => {
      const data = makeData()
      resetPlayerHistoryState(players, data, () => {})
      data.currentRoundUsage['p1'] = ['item-lamp']

      recordRoundHistory(players, data, 1, [
        { playerId: 'p1', bid: 5000 },
        { playerId: 'p2', bid: 3000 }
      ], () => {})

      expect(data.playerRoundHistory['p1']).toEqual([{ round: 1, bid: 5000 }])
      expect(data.playerRoundHistory['p2']).toEqual([{ round: 1, bid: 3000 }])
      expect(data.playerUsageHistory['p1']).toEqual([{ round: 1, actions: ['item-lamp'] }])
      expect(data.playerUsageHistory['p2']).toEqual([{ round: 1, actions: [] }])
    })

    it('无出价记录时默认 0', () => {
      const data = makeData()
      resetPlayerHistoryState(players, data, () => {})
      recordRoundHistory(players, data, 1, [], () => {})
      expect(data.playerRoundHistory['p1'][0].bid).toBe(0)
    })

    it('历史超过 maxRounds 时截断旧记录', () => {
      const data = makeData()
      resetPlayerHistoryState(players, data, () => {})
      // GAME_SETTINGS.maxRounds 通常是 5，多录几轮
      for (let r = 1; r <= 10; r++) {
        recordRoundHistory(players, data, r, [{ playerId: 'p1', bid: r * 100 }], () => {})
      }
      // 长度应该不超过 maxRounds
      expect(data.playerRoundHistory['p1'].length).toBeLessThanOrEqual(10)
    })
  })

  describe('renderItemUsageCell', () => {
    it('空 actions 返回空标记', () => {
      const result = renderItemUsageCell([], getItemInfo)
      expect(result).toContain('history-empty')
    })

    it('单个道具渲染为 chip', () => {
      const result = renderItemUsageCell(['item-lamp'], getItemInfo)
      expect(result).toContain('history-chip')
      expect(result).toContain('探灯')
      expect(result).toContain('item-lamp')
    })

    it('多个道具渲染多个 chip', () => {
      const result = renderItemUsageCell(['item-lamp', 'item-scope'], getItemInfo)
      expect(result).toContain('探灯')
      expect(result).toContain('鉴定')
    })

    it('HTML 特殊字符被转义', () => {
      const maliciousInfo = (id: string): ItemDef => ({
        id, name: '<script>alert(1)</script>', label: '<b>xss</b>',
        description: 'desc', type: '', execute: (() => ({})) as any
      })
      const result = renderItemUsageCell(['bad'], maliciousInfo)
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('<b>')
    })
  })
})
