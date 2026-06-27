import { describe, it, expect } from 'vitest'
import {
  defaultGameSettings,
  normalizeSettingsSource,
  normalizeGameSettings,
  type GameSettingsData
} from '../../../scripts/game/core/settings'

describe('settings', () => {
  describe('defaultGameSettings', () => {
    it('返回完整默认配置', () => {
      const s = defaultGameSettings()
      expect(s.maxRounds).toBe(5)
      expect(s.actionsPerRound).toBe(99)
      expect(s.roundSeconds).toBe(60)
      expect(s.directTakeRatio).toBe(0.2)
      expect(s.bidRevealIntervalMs).toBe(650)
      expect(s.postRevealWaitMs).toBe(3000)
      expect(s.bidStep).toBe(100)
      expect(s.bidDefaultRaise).toBe(500)
      expect(s.settlementSpeedMultiplier).toBe(1)
      expect(s.musicVolume).toBe(70)
      expect(s.sfxVolume).toBe(80)
    })

    it('每次返回新对象', () => {
      const a = defaultGameSettings()
      const b = defaultGameSettings()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('normalizeSettingsSource', () => {
    it('对象原样返回', () => {
      const obj = { a: 1 }
      expect(normalizeSettingsSource(obj)).toBe(obj)
    })
    it('null 返回空对象', () => {
      expect(normalizeSettingsSource(null)).toEqual({})
    })
    it('undefined 返回空对象', () => {
      expect(normalizeSettingsSource(undefined)).toEqual({})
    })
    it('字符串返回空对象', () => {
      expect(normalizeSettingsSource('abc')).toEqual({})
    })
    it('数字返回空对象', () => {
      expect(normalizeSettingsSource(0)).toEqual({})
    })
  })

  describe('normalizeGameSettings', () => {
    it('空输入返回默认值', () => {
      const result = normalizeGameSettings({})
      expect(result).toEqual(defaultGameSettings())
    })

    it('null 输入返回默认值', () => {
      const result = normalizeGameSettings(null)
      expect(result).toEqual(defaultGameSettings())
    })

    it('部分字段覆盖，其余用默认值', () => {
      const result = normalizeGameSettings({ maxRounds: 8, musicVolume: 50 })
      expect(result.maxRounds).toBe(8)
      expect(result.musicVolume).toBe(50)
      expect(result.bidStep).toBe(100) // 默认值
    })

    it('数值超限被截断', () => {
      const result = normalizeGameSettings({
        maxRounds: 100,   // 上限 12
        roundSeconds: 1,  // 下限 10
        musicVolume: -10, // 下限 0
        sfxVolume: 200    // 上限 100
      })
      expect(result.maxRounds).toBe(12)
      expect(result.roundSeconds).toBe(10)
      expect(result.musicVolume).toBe(0)
      expect(result.sfxVolume).toBe(100)
    })

    it('自定义 fallback 覆盖默认值', () => {
      const fallback: Partial<GameSettingsData> = { maxRounds: 10, bidStep: 200 }
      const result = normalizeGameSettings({}, fallback)
      expect(result.maxRounds).toBe(10)
      expect(result.bidStep).toBe(200)
    })

    it('directTakeRatio 范围限制', () => {
      // 0 是 falsy，|| 回退到默认值 0.2，所以用 -1 测试下限
      expect(normalizeGameSettings({ directTakeRatio: -1 }).directTakeRatio).toBe(0.05)
      expect(normalizeGameSettings({ directTakeRatio: 1 }).directTakeRatio).toBe(0.6)
    })

    it('settlementSpeedMultiplier 范围限制', () => {
      // 0 是 falsy，|| 回退到默认值 1，所以用 -1 测试下限
      expect(normalizeGameSettings({ settlementSpeedMultiplier: -1 }).settlementSpeedMultiplier).toBe(0.5)
      expect(normalizeGameSettings({ settlementSpeedMultiplier: 10 }).settlementSpeedMultiplier).toBe(3)
    })
  })
})
