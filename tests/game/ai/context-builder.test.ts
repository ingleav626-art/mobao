import { describe, it, expect } from 'vitest'
import {
  buildBidHistorySnapshot,
  buildQualityPriceRangeTableCompact,
  buildCatalogSummaryInner,
  buildQualityPriceGuide,
  getActionDefById,
  buildPublicEventSnapshot,
  buildRoundPublicStateTable
} from '../../../scripts/game/ai/context-builder'
import { QUALITY_CONFIG } from '../../../scripts/game/data/artifacts'
import { SKILL_DEFS } from '../../../scripts/game/data/skills'
import { ITEM_DEFS } from '../../../scripts/game/data/items'

describe('ai/context-builder', () => {
  describe('buildBidHistorySnapshot', () => {
    it('round=1 返回空数组', () => {
      const result = buildBidHistorySnapshot(1, [], {})
      expect(result).toEqual([])
    })

    it('round=2 返回第 1 轮出价', () => {
      const players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] as any[]
      const history = {
        p1: [{ round: 1, bid: 1000 }],
        p2: [{ round: 1, bid: 2000 }]
      }
      const result = buildBidHistorySnapshot(2, players, history)
      expect(result).toHaveLength(1)
      expect(result[0].round).toBe(1)
      expect(result[0].bids.p1).toBe(1000)
      expect(result[0].bids.p2).toBe(2000)
    })

    it('多轮出价', () => {
      const players = [{ id: 'p1', name: 'A' }] as any[]
      const history = {
        p1: [{ round: 1, bid: 100 }, { round: 2, bid: 200 }]
      }
      const result = buildBidHistorySnapshot(3, players, history)
      expect(result).toHaveLength(2)
      expect(result[0].bids.p1).toBe(100)
      expect(result[1].bids.p1).toBe(200)
    })

    it('无历史记录的玩家出价为 0', () => {
      const players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] as any[]
      const history = { p1: [{ round: 1, bid: 500 }] }
      const result = buildBidHistorySnapshot(2, players, history)
      expect(result[0].bids.p1).toBe(500)
      expect(result[0].bids.p2).toBe(0)
    })
  })

  describe('getActionDefById', () => {
    it('找到技能定义', () => {
      if (SKILL_DEFS.length > 0) {
        const skill = SKILL_DEFS[0]
        const result = getActionDefById(skill.id)
        expect(result.type).toBe('skill')
        expect(result.name).toBe(skill.name)
        expect(result.id).toBe(skill.id)
      }
    })

    it('找到道具定义', () => {
      if (ITEM_DEFS.length > 0) {
        const item = ITEM_DEFS[0]
        const result = getActionDefById(item.id)
        expect(result.type).toBe('item')
        expect(result.name).toBe(item.name)
        expect(result.id).toBe(item.id)
      }
    })

    it('未知动作返回 unknown', () => {
      const result = getActionDefById('non-existent-id')
      expect(result.type).toBe('unknown')
      expect(result.name).toBe('non-existent-id')
      expect(result.description).toBe('未知动作')
    })
  })

  describe('buildQualityPriceRangeTableCompact', () => {
    it('返回正确的列定义', () => {
      const result = buildQualityPriceRangeTableCompact()
      expect(result.columns).toEqual(['quality_key', 'quality_name', 'min_price', 'max_price', 'avg_price'])
    })

    it('每个品质有一行', () => {
      const result = buildQualityPriceRangeTableCompact()
      expect(result.rows).toHaveLength(Object.keys(QUALITY_CONFIG).length)
    })

    it('每行有 5 个字段', () => {
      const result = buildQualityPriceRangeTableCompact()
      result.rows.forEach(row => {
        expect(row).toHaveLength(5)
      })
    })

    it('品质名称正确', () => {
      const result = buildQualityPriceRangeTableCompact()
      const poorRow = result.rows.find(r => r[0] === 'poor')
      expect(poorRow).toBeDefined()
      expect(poorRow![1]).toBe('粗品')
    })
  })

  describe('buildQualityPriceGuide', () => {
    it('返回所有品质', () => {
      const result = buildQualityPriceGuide()
      expect(result).toHaveLength(Object.keys(QUALITY_CONFIG).length)
    })

    it('每个条目有 avgPrice', () => {
      const result = buildQualityPriceGuide()
      result.forEach(entry => {
        expect(entry).toHaveProperty('avgPrice')
        expect(typeof entry.avgPrice).toBe('number')
      })
    })

    it('非 compact 模式包含 count 和价格范围', () => {
      const result = buildQualityPriceGuide({ compact: false })
      result.forEach(entry => {
        expect(entry).toHaveProperty('count')
        expect(entry).toHaveProperty('minPrice')
        expect(entry).toHaveProperty('maxPrice')
      })
    })

    it('compact 模式不含 count', () => {
      const result = buildQualityPriceGuide({ compact: true })
      result.forEach(entry => {
        expect(entry).not.toHaveProperty('count')
      })
    })
  })

  describe('buildCatalogSummaryInner', () => {
    it('包含基本字段', () => {
      const result = buildCatalogSummaryInner()
      expect(result).toHaveProperty('totalArtifacts')
      expect(result).toHaveProperty('qualityRangeText')
      expect(result).toHaveProperty('specialMechanismHint')
      expect(result).toHaveProperty('poolRestrictionHint')
    })

    it('totalArtifacts 是正数', () => {
      const result = buildCatalogSummaryInner()
      expect(result.totalArtifacts as number).toBeGreaterThan(0)
    })

    it('非 compact 包含 warehouseDefinition', () => {
      const result = buildCatalogSummaryInner({ compact: false })
      expect(result).toHaveProperty('warehouseDefinition')
    })

    it('compact 不含 warehouseDefinition', () => {
      const result = buildCatalogSummaryInner({ compact: true })
      expect(result).not.toHaveProperty('warehouseDefinition')
    })

    it('compact 包含 qualityPriceRangeTable', () => {
      const result = buildCatalogSummaryInner({ compact: true })
      expect(result).toHaveProperty('qualityPriceRangeTable')
    })

    it('非 compact 包含 qualityPriceGuide', () => {
      const result = buildCatalogSummaryInner({ compact: false })
      expect(result).toHaveProperty('qualityPriceGuide')
    })
  })

  describe('buildPublicEventSnapshot', () => {
    const players = [
      { id: 'ai-1', name: '左上AI' },
      { id: 'ai-2', name: '右上AI' }
    ]
    const getActionDef = (id: string) => getActionDefById(id)

    it('空使用历史返回空数组', () => {
      const result = buildPublicEventSnapshot(players, {}, {}, 1, getActionDef, null)
      expect(result).toEqual([])
    })

    it('从 playerUsageHistory 生成事件', () => {
      const usageHistory = {
        'ai-1': [{ round: 1, actions: ['skill-tuoying'] }]
      }
      const result = buildPublicEventSnapshot(players, usageHistory, {}, 2, getActionDef, null)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].playerId).toBe('ai-1')
      expect(result[0].actionName).toBeTruthy()
    })

    it('从 currentRoundUsage 生成事件', () => {
      const currentUsage = { 'ai-2': ['skill-jianzhi'] }
      const result = buildPublicEventSnapshot(players, {}, currentUsage, 1, getActionDef, null)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].playerId).toBe('ai-2')
    })

    it('包含 currentPublicEvent', () => {
      const event = { category: '市场', id: 'market-boom', text: '市场繁荣' }
      const result = buildPublicEventSnapshot(players, {}, {}, 1, getActionDef, event)
      const systemEvent = result.find((e: any) => e.playerId === 'system')
      expect(systemEvent).toBeTruthy()
      expect(systemEvent!.actionType).toBe('public-event')
    })

    it('compact 模式不含 effectText', () => {
      const usageHistory = { 'ai-1': [{ round: 1, actions: ['skill-tuoying'] }] }
      const result = buildPublicEventSnapshot(players, usageHistory, {}, 2, getActionDef, null, { compact: true })
      expect(result[0]).not.toHaveProperty('effectText')
    })

    it('非 compact 模式含 effectText', () => {
      const usageHistory = { 'ai-1': [{ round: 1, actions: ['skill-tuoying'] }] }
      const result = buildPublicEventSnapshot(players, usageHistory, {}, 2, getActionDef, null, { compact: false })
      expect(result[0]).toHaveProperty('effectText')
    })

    it('viewerId 过滤自身事件', () => {
      const usageHistory = {
        'ai-1': [{ round: 1, actions: ['skill-tuoying'] }],
        'ai-2': [{ round: 1, actions: ['skill-jianzhi'] }]
      }
      const result = buildPublicEventSnapshot(players, usageHistory, {}, 2, getActionDef, null, { viewerId: 'ai-1' })
      const ids = result.map((e: any) => e.playerId)
      expect(ids).not.toContain('ai-1')
      expect(ids).toContain('ai-2')
    })

    it('最多返回 30 条', () => {
      const usageHistory: Record<string, Array<{ round: number; actions: string[] }>> = {}
      for (let i = 0; i < 40; i++) {
        usageHistory['ai-1'] = usageHistory['ai-1'] || []
        usageHistory['ai-1'].push({ round: i + 1, actions: ['skill-tuoying'] })
      }
      const result = buildPublicEventSnapshot(players, usageHistory, {}, 41, getActionDef, null)
      expect(result.length).toBeLessThanOrEqual(30)
    })
  })

  describe('buildRoundPublicStateTable', () => {
    const players = [
      { id: 'p1', name: '玩家' },
      { id: 'ai-1', name: 'AI' }
    ]

    it('round=0 返回空表', () => {
      const result = buildRoundPublicStateTable(0, players, {}, {}, {}, 'p1')
      expect(result.columns.length).toBeGreaterThan(0)
      expect(result.rows).toEqual([])
    })

    it('round=1 有数据行', () => {
      const bidHistory = { 'p1': [{ round: 1, bid: 5000 }], 'ai-1': [{ round: 1, bid: 3000 }] }
      const result = buildRoundPublicStateTable(1, players, bidHistory, {}, {}, 'p1')
      expect(result.rows.length).toBeGreaterThan(0)
    })

    it('columns 包含 bid_value 列', () => {
      const result = buildRoundPublicStateTable(1, players, {}, {}, {}, 'p1')
      const hasBid = result.columns.some((c) => c.includes('bid_value'))
      expect(hasBid).toBe(true)
    })

    it('columns 包含 public_action_ids 列', () => {
      const result = buildRoundPublicStateTable(1, players, {}, {}, {}, 'p1')
      const hasAction = result.columns.some((c) => c.includes('public_action_ids'))
      expect(hasAction).toBe(true)
    })
  })
})
