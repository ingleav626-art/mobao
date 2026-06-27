import { describe, it, expect } from 'vitest'
import {
  getCollectionCategories,
  filterCollectionItems
} from '../../../scripts/game/ui/overlay'

describe('overlay', () => {
  describe('getCollectionCategories', () => {
    it('返回去重排序的品类列表', () => {
      const library = [
        { category: '玉器' },
        { category: '瓷器' },
        { category: '玉器' },
        { category: '铜器' }
      ]
      const result = getCollectionCategories(library)
      expect(result).toHaveLength(3)
      expect(result).toContain('瓷器')
      expect(result).toContain('玉器')
      expect(result).toContain('铜器')
    })

    it('空数组返回空', () => {
      expect(getCollectionCategories([])).toEqual([])
    })

    it('无 category 属性的条目被跳过', () => {
      const library = [
        { category: '瓷器' },
        {},
        { category: '玉器' }
      ]
      const result = getCollectionCategories(library)
      expect(result).toHaveLength(2)
      expect(result).toContain('瓷器')
      expect(result).toContain('玉器')
    })

    it('单个品类', () => {
      expect(getCollectionCategories([{ category: '瓷器' }])).toEqual(['瓷器'])
    })

    it('category 为空字符串被跳过', () => {
      const library = [
        { category: '' },
        { category: '瓷器' }
      ]
      expect(getCollectionCategories(library)).toEqual(['瓷器'])
    })
  })

  describe('filterCollectionItems', () => {
    const items = [
      { category: '瓷器', qualityKey: 'fine', name: '青花瓷', key: 'qhua' },
      { category: '玉器', qualityKey: 'rare', name: '白玉佩', key: 'baiyu' },
      { category: '瓷器', qualityKey: 'poor', name: '粗陶碗', key: 'cutao' },
      { category: '铜器', qualityKey: 'fine', name: '铜鼎', key: 'tongding' }
    ]

    it('无筛选返回全部', () => {
      expect(filterCollectionItems(items, {})).toHaveLength(4)
    })

    it('按品类筛选', () => {
      const result = filterCollectionItems(items, { categoryFilter: '瓷器' })
      expect(result).toHaveLength(2)
      expect(result.every(i => i.category === '瓷器')).toBe(true)
    })

    it('按品质筛选', () => {
      const result = filterCollectionItems(items, { qualityFilter: 'fine' })
      expect(result).toHaveLength(2)
      expect(result.every(i => i.qualityKey === 'fine')).toBe(true)
    })

    it('按名称搜索', () => {
      const result = filterCollectionItems(items, { searchText: '瓷' })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('青花瓷')
    })

    it('按键名搜索', () => {
      const result = filterCollectionItems(items, { searchText: 'baiyu' })
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('baiyu')
    })

    it('搜索不区分大小写', () => {
      const result = filterCollectionItems(items, { searchText: 'QHUA' })
      expect(result).toHaveLength(1)
      expect(result[0].key).toBe('qhua')
    })

    it('组合筛选', () => {
      const result = filterCollectionItems(items, { categoryFilter: '瓷器', qualityFilter: 'fine' })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('青花瓷')
    })

    it('categoryFilter=all 不筛选', () => {
      const result = filterCollectionItems(items, { categoryFilter: 'all' })
      expect(result).toHaveLength(4)
    })

    it('qualityFilter=all 不筛选', () => {
      const result = filterCollectionItems(items, { qualityFilter: 'all' })
      expect(result).toHaveLength(4)
    })

    it('空搜索文本不筛选', () => {
      const result = filterCollectionItems(items, { searchText: '' })
      expect(result).toHaveLength(4)
    })

    it('无匹配返回空', () => {
      const result = filterCollectionItems(items, { searchText: '不存在的物品' })
      expect(result).toHaveLength(0)
    })

    it('空列表返回空', () => {
      expect(filterCollectionItems([], { categoryFilter: '瓷器' })).toHaveLength(0)
    })
  })
})
