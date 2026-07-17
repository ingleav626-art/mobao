import { describe, it, expect } from 'vitest'
import type { SkillContext } from '../../../types/game'
import {
  getItemInfo,
  getPlayerActionId,
  consumeActionState,
  wrapContextWithCharacterBonus
} from '../../../scripts/game/core/skill-item-manager'

describe('skill-item-manager', () => {
  describe('getItemInfo', () => {
    const items = [
      { id: 'item-1', name: '探针', description: '揭示1件轮廓' },
      { id: 'item-2', name: '放大镜', description: '揭示1件品质' }
    ]
    const skills = [
      { id: 'skill-1', name: '拓影', description: '揭示3件轮廓' },
      { id: 'skill-2', name: '鉴质', description: '揭示2件品质' }
    ]

    it('在道具列表中找到', () => {
      const result = getItemInfo('item-1', items, skills)
      expect(result).toEqual({ label: '探针', tip: '揭示1件轮廓' })
    })

    it('在技能列表中找到', () => {
      const result = getItemInfo('skill-2', items, skills)
      expect(result).toEqual({ label: '鉴质', tip: '揭示2件品质' })
    })

    it('道具优先于技能', () => {
      const overlapping = [...items, { id: 'skill-1', name: '冲突道具', description: '道具描述' }]
      const result = getItemInfo('skill-1', overlapping, skills)
      expect(result.label).toBe('冲突道具')
    })

    it('未找到返回默认值', () => {
      const result = getItemInfo('unknown', items, skills)
      expect(result.label).toBe('未知道具')
      expect(result.tip).toContain('暂无说明')
    })

    it('空列表返回默认值', () => {
      const result = getItemInfo('any', [], [])
      expect(result.label).toBe('未知道具')
    })
  })

  describe('getPlayerActionId', () => {
    it('非联机模式返回 p2', () => {
      expect(getPlayerActionId(false, null)).toBe('p2')
    })

    it('联机模式返回 lanMySlotId', () => {
      expect(getPlayerActionId(true, 'slot-3')).toBe('slot-3')
    })

    it('联机模式但 slotId 为空回退到 p2', () => {
      expect(getPlayerActionId(true, null)).toBe('p2')
      expect(getPlayerActionId(true, '')).toBe('p2')
    })
  })

  describe('consumeActionState', () => {
    it('正常情况允许消耗', () => {
      const result = consumeActionState(3, 5, '技能', 10)
      expect(result.allowed).toBe(true)
      expect(result.message).toBeUndefined()
    })

    it('回合超限不允许', () => {
      const result = consumeActionState(11, 5, '技能', 10)
      expect(result.allowed).toBe(false)
      expect(result.message).toContain('所有回合已结束')
    })

    it('行动次数为0不允许', () => {
      const result = consumeActionState(3, 0, '道具', 10)
      expect(result.allowed).toBe(false)
      expect(result.message).toContain('行动次数已耗尽')
      expect(result.message).toContain('道具')
    })

    it('行动次数为负不允许', () => {
      const result = consumeActionState(3, -1, '技能', 10)
      expect(result.allowed).toBe(false)
    })

    it('回合等于 maxRounds 仍允许', () => {
      const result = consumeActionState(5, 1, '技能', 5)
      expect(result.allowed).toBe(true)
    })

    it('回合等于 maxRounds+1 不允许', () => {
      const result = consumeActionState(6, 1, '技能', 5)
      expect(result.allowed).toBe(false)
    })
  })

  describe('wrapContextWithCharacterBonus', () => {
    function makeContext(): SkillContext {
      return {
        revealOutline: (opts: any) => ({ ...opts, method: 'outline' }),
        revealQuality: (opts: any) => ({ ...opts, method: 'quality' }),
        revealAll: (opts: any) => ({ ...opts, method: 'all' })
      }
    }

    it('无加成时返回原 context', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 0, null)
      expect(result).toBe(ctx)
    })

    it('outlineBonus > 0 时增加 count', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 2, 0, null)
      const output = result.revealOutline({ count: 3, category: null, sortStrategy: null }) as any
      expect(output.count).toBe(5)
    })

    it('qualityBonus > 0 时增加 count', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 1, null)
      const output = result.revealQuality({ count: 2, category: null, sortStrategy: null }) as any
      expect(output.count).toBe(3)
    })

    it('sortStrategy 被注入', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 0, 'smallestFirst')
      const output = result.revealOutline({ count: 1, category: null, sortStrategy: null }) as any
      expect(output.sortStrategy).toBe('smallestFirst')
    })

    it('sortStrategy 不覆盖已有的', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 0, 'smallestFirst')
      const output = result.revealOutline({ count: 1, category: null, sortStrategy: 'largestFirst' }) as any
      expect(output.sortStrategy).toBe('largestFirst')
    })

    it('count 为 undefined 时当作 0', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 3, 0, null)
      const output = result.revealOutline({ count: 0, category: null, sortStrategy: null }) as any
      expect(output.count).toBe(3)
    })

    it('revealAll 注入 sortStrategy', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 0, 'largestFirst')
      const output = result.revealAll({ count: 0, sortStrategy: '', category: null, allowCategoryFallback: false }) as any
      expect(output.sortStrategy).toBe('largestFirst')
    })

    it('revealAll 无 sortStrategy 时回退空字符串', () => {
      const ctx = makeContext()
      const result = wrapContextWithCharacterBonus(ctx, 0, 0, null)
      const output = result.revealAll({ count: 0, sortStrategy: '', category: null, allowCategoryFallback: false }) as any
      expect(output.sortStrategy).toBe('')
    })

    it('有加成时保留 context 上的全部方法（不丢失 computeAveragePrice 等新增方法）', () => {
      // bug: wrapContextWithCharacterBonus 有加成时新建对象，只抄了 revealOutline/revealQuality/revealAll
      // 预期：新增方法如 computeAveragePrice 应该透传
      const ctx = makeContext()
      ;(ctx as any).computeAveragePrice = (opts: any) => ({ ok: true, revealed: 0, message: `${opts.scope}均价` })
      const result = wrapContextWithCharacterBonus(ctx, 1, 0, null)
      // 有 outlineBonus，会走新建对象路径
      expect(result).not.toBe(ctx)
      // 新增方法应保留
      expect(typeof (result as any).computeAveragePrice).toBe('function')
      const output = (result as any).computeAveragePrice({ scope: 'total' })
      expect(output.ok).toBe(true)
      expect(output.message).toContain('均价')
    })
  })
})
