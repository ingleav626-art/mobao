import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHARACTERS,
  getCharacterById,
  getUnlockedCharacters,
  getSelectedCharacter,
  saveSelectedCharacter
} from '../../../scripts/game/data/characters'

beforeEach(() => {
  localStorage.clear()
})

describe('characters', () => {
  describe('CHARACTERS', () => {
    it('包含 3 个角色', () => {
      expect(CHARACTERS).toHaveLength(3)
    })

    it('每个角色有完整字段', () => {
      for (const c of CHARACTERS) {
        expect(c).toHaveProperty('id')
        expect(c).toHaveProperty('name')
        expect(c).toHaveProperty('desc')
        expect(c).toHaveProperty('skillId')
        expect(c).toHaveProperty('skillName')
        expect(c).toHaveProperty('skillDesc')
        expect(c).toHaveProperty('passive')
        expect(c).toHaveProperty('unlockCondition')
        expect(c).toHaveProperty('unlocked')
      }
    })

    it('角色 id 唯一', () => {
      const ids = CHARACTERS.map((c) => c.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('所有角色默认解锁', () => {
      for (const c of CHARACTERS) {
        expect(c.unlocked).toBe(true)
      }
    })

    it('包含特定角色', () => {
      const ids = CHARACTERS.map((c) => c.id)
      expect(ids).toContain('appraiser')
      expect(ids).toContain('scout')
      expect(ids).toContain('seeker')
    })
  })

  describe('getCharacterById', () => {
    it('返回匹配的角色', () => {
      const c = getCharacterById('appraiser')
      expect(c).not.toBeNull()
      expect(c!.name).toBe('鉴定师')
    })

    it('未知 id 返回 null', () => {
      expect(getCharacterById('nonexistent')).toBeNull()
    })

    it('空字符串返回 null', () => {
      expect(getCharacterById('')).toBeNull()
    })

    it('返回的是 CHARACTERS 中的引用', () => {
      const c = getCharacterById('scout')
      expect(c).toBe(CHARACTERS[1])
    })
  })

  describe('getUnlockedCharacters', () => {
    it('返回所有已解锁角色', () => {
      const unlocked = getUnlockedCharacters()
      expect(unlocked).toHaveLength(CHARACTERS.length)
    })

    it('每个结果的 unlocked 为 true', () => {
      for (const c of getUnlockedCharacters()) {
        expect(c.unlocked).toBe(true)
      }
    })

    it('返回新数组', () => {
      const result = getUnlockedCharacters()
      expect(result).not.toBe(CHARACTERS)
    })
  })

  describe('getSelectedCharacter', () => {
    it('空存储返回第一个角色', () => {
      const c = getSelectedCharacter()
      expect(c.id).toBe(CHARACTERS[0].id)
    })

    it('损坏 JSON 返回第一个角色', () => {
      localStorage.setItem('mobao_selected_character_v1', '{invalid')
      const c = getSelectedCharacter()
      expect(c.id).toBe(CHARACTERS[0].id)
    })

    it('有存储返回存储的角色 id 字符串', () => {
      saveSelectedCharacter('scout')
      const c = getSelectedCharacter()
      // 注意：getSelectedCharacter 直接 JSON.parse 返回，存储的是 id 字符串
      expect(c).toBe('scout')
    })
  })

  describe('saveSelectedCharacter', () => {
    it('保存角色 id 到 localStorage', () => {
      saveSelectedCharacter('seeker')
      const raw = localStorage.getItem('mobao_selected_character_v1')
      expect(JSON.parse(raw as string)).toBe('seeker')
    })
  })
})
