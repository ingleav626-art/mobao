import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultGameSettings,
  normalizeSettingsSource,
  normalizeGameSettings,
  loadGameSettings,
  saveGameSettings,
  loadPlayerMoney,
  savePlayerMoney,
  type GameSettingsData
} from '../../../scripts/game/core/settings'

const SETTINGS_STORAGE_KEY = 'mobao_settings_v2'
const PLAYER_MONEY_STORAGE_KEY = 'mobao_player_money_v1'
const DEFAULT_START_MONEY = 3000000

beforeEach(() => {
  localStorage.clear()
})

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

  describe('loadGameSettings', () => {
    it('空存储返回默认值', () => {
      expect(loadGameSettings()).toEqual(defaultGameSettings())
    })

    it('损坏 JSON 返回默认值', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, '{invalid')
      expect(loadGameSettings()).toEqual(defaultGameSettings())
    })

    it('合法存储返回合并后的设置', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ maxRounds: 8, musicVolume: 50 }))
      const s = loadGameSettings()
      expect(s.maxRounds).toBe(8)
      expect(s.musicVolume).toBe(50)
      expect(s.bidStep).toBe(100)
    })
  })

  describe('saveGameSettings', () => {
    it('保存规范化后的设置到 localStorage', () => {
      saveGameSettings({ maxRounds: 100, musicVolume: 30 })
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      const parsed = JSON.parse(raw as string)
      expect(parsed.maxRounds).toBe(12) // 上限截断
      expect(parsed.musicVolume).toBe(30)
    })
  })

  describe('loadPlayerMoney', () => {
    it('空存储返回默认资金', () => {
      expect(loadPlayerMoney()).toBe(DEFAULT_START_MONEY)
    })

    it('合法数值返回该值', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, '500000')
      expect(loadPlayerMoney()).toBe(500000)
    })

    it('非数字返回默认资金', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, 'abc')
      expect(loadPlayerMoney()).toBe(DEFAULT_START_MONEY)
    })

    it('负数返回默认资金', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, '-100')
      expect(loadPlayerMoney()).toBe(DEFAULT_START_MONEY)
    })

    it('0 且无 settledRunToken 返回默认资金', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, '0')
      expect(loadPlayerMoney()).toBe(DEFAULT_START_MONEY)
    })

    it('0 且有 settledRunToken 返回 0', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, '0')
      localStorage.setItem('mobao_money_settled_run', '1')
      expect(loadPlayerMoney()).toBe(0)
    })

    it('小数被取整', () => {
      localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, '1234.56')
      expect(loadPlayerMoney()).toBe(1235)
    })
  })

  describe('savePlayerMoney', () => {
    it('保存正数到 localStorage', () => {
      savePlayerMoney(750000)
      expect(localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)).toBe('750000')
    })

    it('负数被截断为 0', () => {
      savePlayerMoney(-500)
      expect(localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)).toBe('0')
    })

    it('小数被取整', () => {
      savePlayerMoney(1234.6)
      expect(localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)).toBe('1235')
    })
  })
})
