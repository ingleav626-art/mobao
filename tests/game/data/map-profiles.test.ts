import { describe, it, expect } from 'vitest'
import {
  MAP_PROFILES,
  getProfile,
  getAllProfiles
} from '../../../scripts/game/data/map-profiles'

describe('map-profiles', () => {
  describe('MAP_PROFILES', () => {
    it('包含 4 个地图配置', () => {
      expect(MAP_PROFILES).toHaveLength(4)
    })

    it('每个配置有完整字段', () => {
      for (const p of MAP_PROFILES) {
        expect(p).toHaveProperty('id')
        expect(p).toHaveProperty('name')
        expect(p).toHaveProperty('desc')
        expect(p).toHaveProperty('icon')
        expect(p).toHaveProperty('params')
        expect(p.params).toHaveProperty('maxRounds')
        expect(p.params).toHaveProperty('directTakeRatio')
        expect(p.params).toHaveProperty('qualityWeights')
        expect(p.params).toHaveProperty('categoryWeights')
      }
    })

    it('id 唯一', () => {
      const ids = MAP_PROFILES.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('包含特定地图', () => {
      const ids = MAP_PROFILES.map((p) => p.id)
      expect(ids).toContain('default')
      expect(ids).toContain('treasure-vault')
      expect(ids).toContain('junkyard')
      expect(ids).toContain('scholar-study')
    })

    it('品质权重之和为 100', () => {
      for (const p of MAP_PROFILES) {
        const total = Object.values(p.params.qualityWeights).reduce((s, v) => s + v, 0)
        expect(total).toBe(100)
      }
    })

    it('回合数合理', () => {
      for (const p of MAP_PROFILES) {
        expect(p.params.maxRounds).toBeGreaterThanOrEqual(3)
        expect(p.params.maxRounds).toBeLessThanOrEqual(12)
      }
    })
  })

  describe('getProfile', () => {
    it('返回匹配的地图', () => {
      const p = getProfile('treasure-vault')
      expect(p.id).toBe('treasure-vault')
      expect(p.name).toBe('珍宝密室')
    })

    it('未知 id 回退到 default', () => {
      const p = getProfile('nonexistent')
      expect(p.id).toBe('default')
    })

    it('空字符串回退到 default', () => {
      const p = getProfile('')
      expect(p.id).toBe('default')
    })

    it('返回的是 MAP_PROFILES 中的引用', () => {
      const p = getProfile('junkyard')
      expect(p).toBe(MAP_PROFILES[2])
    })
  })

  describe('getAllProfiles', () => {
    it('返回所有配置', () => {
      expect(getAllProfiles()).toHaveLength(MAP_PROFILES.length)
    })

    it('返回新数组（浅拷贝）', () => {
      const result = getAllProfiles()
      expect(result).not.toBe(MAP_PROFILES)
      expect(result).toEqual(MAP_PROFILES)
    })

    it('修改返回数组不影响原数据', () => {
      const result = getAllProfiles()
      result.pop()
      expect(MAP_PROFILES).toHaveLength(4)
    })
  })
})
