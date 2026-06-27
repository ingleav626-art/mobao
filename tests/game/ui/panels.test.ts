import { describe, it, expect, vi } from 'vitest'
import {
  addPrivateIntelEntry,
  addPublicInfoEntry,
  updateSidePanels,
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
})
