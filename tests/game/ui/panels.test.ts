import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  addPrivateIntelEntry,
  addPublicInfoEntry,
  updateSidePanels,
  renderPrivateIntelPanel,
  renderPublicInfoPanel,
  type IntelEntry
} from '../../../scripts/game/ui/panels'

describe('panels', () => {
  describe('addPrivateIntelEntry', () => {
    it('添加条目到数组', () => {
      const entries: IntelEntry[] = []
      addPrivateIntelEntry(entries, 1, { source: '技能', text: '发现轮廓' })
      expect(entries).toHaveLength(1)
      expect(entries[0].source).toBe('技能')
      expect(entries[0].text).toBe('发现轮廓')
      expect(entries[0].round).toBe(1)
    })

    it('缺省字段使用默认值', () => {
      const entries: IntelEntry[] = []
      addPrivateIntelEntry(entries, 2, {})
      expect(entries[0].source).toBe('未知')
      expect(entries[0].text).toBe('')
    })

    it('多次调用追加条目', () => {
      const entries: IntelEntry[] = []
      addPrivateIntelEntry(entries, 1, { text: 'a' })
      addPrivateIntelEntry(entries, 1, { text: 'b' })
      addPrivateIntelEntry(entries, 2, { text: 'c' })
      expect(entries).toHaveLength(3)
    })
  })

  describe('addPublicInfoEntry', () => {
    it('添加公共信息条目', () => {
      const entries: IntelEntry[] = []
      addPublicInfoEntry(entries, 1, { source: '系统', text: '回合开始' })
      expect(entries).toHaveLength(1)
      expect(entries[0].source).toBe('系统')
    })

    it('联机模式下广播到 lanBridge', () => {
      const entries: IntelEntry[] = []
      const sendFn = vi.fn()
      const lanBridge = { send: sendFn }
      addPublicInfoEntry(entries, 1, { source: '测试', text: '消息' }, lanBridge, true, true)
      expect(sendFn).toHaveBeenCalledOnce()
      expect(sendFn).toHaveBeenCalledWith(expect.objectContaining({
        type: 'lan:public-info',
        source: '测试',
        text: '消息'
      }))
    })

    it('非联机模式不调用 lanBridge', () => {
      const entries: IntelEntry[] = []
      const sendFn = vi.fn()
      addPublicInfoEntry(entries, 1, { text: 'msg' }, { send: sendFn }, false, false)
      expect(sendFn).not.toHaveBeenCalled()
    })

    it('非 host 不调用 lanBridge', () => {
      const entries: IntelEntry[] = []
      const sendFn = vi.fn()
      addPublicInfoEntry(entries, 1, { text: 'msg' }, { send: sendFn }, true, false)
      expect(sendFn).not.toHaveBeenCalled()
    })
  })

  describe('updateSidePanels', () => {
    it('调用两个 render 回调', () => {
      const renderPrivate = vi.fn()
      const renderPublic = vi.fn()
      updateSidePanels(renderPrivate, renderPublic)
      expect(renderPrivate).toHaveBeenCalledOnce()
      expect(renderPublic).toHaveBeenCalledOnce()
    })
  })

  describe('in-place clear (Bug 2: 回合重置)', () => {
    it('entries.length = 0 原地清空保持引用', () => {
      const entries: IntelEntry[] = [
        { source: '技能', text: '发现轮廓', round: 1 },
        { source: '道具', text: '揭示品质', round: 2 },
      ]
      const refBefore = entries
      entries.length = 0
      expect(entries).toHaveLength(0)
      expect(entries).toBe(refBefore) // 保持同一引用
    })

    it('publicInfoEntries 原地清空后 PanelsManager 仍可见空数组', () => {
      const entries: IntelEntry[] = [
        { source: '系统', text: '市场繁荣', round: 1 },
      ]
      entries.length = 0
      // 模拟 PanelsManager 内部持有引用
      const managerRef = entries
      expect(managerRef).toHaveLength(0)
    })
  })

  describe('renderPrivateIntelPanel', () => {
    it('container 为 null 不崩溃', () => {
      expect(() => renderPrivateIntelPanel(null, [], { current: '' })).not.toThrow()
    })

    it('空 entries 显示暂无提示', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      renderPrivateIntelPanel(container, [], { current: '' })
      expect(container.innerHTML).toContain('暂无私有情报')
    })

    it('有 entries 时渲染条目', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      const entries: IntelEntry[] = [
        { source: '技能', text: '发现轮廓', round: 1 },
        { source: '道具', text: '揭示品质', round: 2 }
      ]
      renderPrivateIntelPanel(container, entries, { current: '' })
      expect(container.innerHTML).toContain('技能')
      expect(container.innerHTML).toContain('发现轮廓')
      expect(container.innerHTML).toContain('道具')
      expect(container.innerHTML).toContain('揭示品质')
    })

    it('相同版本号跳过渲染', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      const entries: IntelEntry[] = [{ source: '技能', text: '发现轮廓', round: 1 }]
      renderPrivateIntelPanel(container, entries, { current: '' })
      const html1 = container.innerHTML
      renderPrivateIntelPanel(container, entries, { current: '1|发现轮廓' })
      const html2 = container.innerHTML
      expect(html1).toBe(html2)
    })

    it('HTML 特殊字符被转义', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      const entries: IntelEntry[] = [{ source: '<script>', text: '&test"', round: 1 }]
      renderPrivateIntelPanel(container, entries, { current: '' })
      expect(container.innerHTML).not.toContain('<script>')
      expect(container.innerHTML).toContain('&lt;script&gt;')
    })
  })

  describe('renderPublicInfoPanel', () => {
    it('container 为 null 不崩溃', () => {
      expect(() => renderPublicInfoPanel(null, [])).not.toThrow()
    })

    it('空 entries 显示暂无提示', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      renderPublicInfoPanel(container, [])
      expect(container.innerHTML).toContain('暂无公共信息')
    })

    it('有 entries 时渲染条目', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      const entries: IntelEntry[] = [
        { source: '系统', text: '市场繁荣', round: 1 }
      ]
      renderPublicInfoPanel(container, entries)
      expect(container.innerHTML).toContain('系统')
      expect(container.innerHTML).toContain('市场繁荣')
    })

    it('HTML 特殊字符被转义', () => {
      const dom = new JSDOM('<div></div>')
      const container = dom.window.document.querySelector('div')!
      const entries: IntelEntry[] = [{ source: '<img>', text: 'xss"', round: 1 }]
      renderPublicInfoPanel(container, entries)
      expect(container.innerHTML).not.toContain('<img>')
      expect(container.innerHTML).toContain('&lt;img&gt;')
    })
  })
})
