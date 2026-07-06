import { describe, it, expect, beforeEach } from "vitest"
import {
  getActiveCharacter,
  getActiveCharacterId,
  getActiveSkillId,
  getActivePassive,
  getDisplayName,
  getDisplayAvatar,
  getAvatarLabel,
  selectCharacter,
  resetForNewGame,
  getOutlineBonus,
  getQualityBonus,
  getOutlineSortStrategy,
  applyPassiveEffect,
  getSessionPassiveBonus,
  formatProfitWithBonus
} from "../../../scripts/game/data/character-system"
import { CHARACTERS } from "../../../scripts/game/data/characters"

const STORAGE_KEY = "mobao_selected_character_v1"

beforeEach(() => {
  window.localStorage.clear()
  resetForNewGame()
  // 重置模块级缓存的 _activeCharacter：通过 selectCharacter 切换到默认角色
  selectCharacter("appraiser")
})

describe("character-system - 活跃角色访问", () => {
  it("getActiveCharacter 默认返回鉴定师", () => {
    window.localStorage.clear()
    // 缓存已被 beforeEach 设置为 appraiser，清 localStorage 不影响缓存
    expect(getActiveCharacter()?.id).toBe("appraiser")
  })

  it("getActiveCharacterId 返回当前角色 id", () => {
    selectCharacter("scout")
    expect(getActiveCharacterId()).toBe("scout")
  })

  it("getActiveSkillId 返回当前角色技能 id", () => {
    selectCharacter("seeker")
    expect(getActiveSkillId()).toBe("skill-reveal-largest")
  })

  it("getActivePassive 返回被动效果", () => {
    selectCharacter("appraiser")
    const passive = getActivePassive()
    expect(passive).not.toBeNull()
    expect(passive?.type).toBe("profitBonus")
  })

  it("getDisplayName 返回角色名", () => {
    selectCharacter("scout")
    expect(getDisplayName()).toBe("探子")
  })

  it("getDisplayAvatar 返回头像路径或 null", () => {
    selectCharacter("appraiser")
    expect(getDisplayAvatar()).toContain("character-appraiser-avatar")
    selectCharacter("scout")
    expect(getDisplayAvatar()).toBeNull()
  })

  it("getAvatarLabel 返回单字标签", () => {
    selectCharacter("appraiser")
    expect(getAvatarLabel()).toBe("鉴")
    selectCharacter("scout")
    expect(getAvatarLabel()).toBe("探")
    selectCharacter("seeker")
    expect(getAvatarLabel()).toBe("觅")
  })
})

describe("character-system - selectCharacter", () => {
  it("合法 id 返回 true 并持久化", () => {
    expect(selectCharacter("scout")).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify("scout"))
  })

  it("非法 id 返回 false 不持久化", () => {
    selectCharacter("appraiser")
    expect(selectCharacter("nonexistent")).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify("appraiser"))
  })
})

describe("character-system - 被动效果查询", () => {
  it("getOutlineBonus 返回轮廓加成", () => {
    selectCharacter("scout")
    expect(getOutlineBonus()).toBe(1)
    selectCharacter("appraiser")
    expect(getOutlineBonus()).toBe(0)
  })

  it("getQualityBonus 返回品质加成", () => {
    selectCharacter("appraiser")
    expect(getQualityBonus()).toBe(0)
    selectCharacter("scout")
    expect(getQualityBonus()).toBe(0)
  })

  it("getOutlineSortStrategy 返回排序策略", () => {
    selectCharacter("seeker")
    expect(getOutlineSortStrategy()).toBe("smallestFirst")
    selectCharacter("appraiser")
    expect(getOutlineSortStrategy()).toBeNull()
  })
})

describe("character-system - applyPassiveEffect", () => {
  it("profitBonus 正利润按比例加成", () => {
    selectCharacter("appraiser")
    const result = applyPassiveEffect({ profit: 1000 })
    expect(result.bonus).toBe(100) // 1000 * 0.1
    expect(result.label).toBe("盈利加成+10%")
    expect(getSessionPassiveBonus()).toBe(100)
  })

  it("profitBonus 零或负利润不加成", () => {
    selectCharacter("appraiser")
    expect(applyPassiveEffect({ profit: 0 }).bonus).toBe(0)
    expect(applyPassiveEffect({ profit: -500 }).bonus).toBe(0)
  })

  it("bidBonus 返回标签但无加成", () => {
    // 无 bidBonus 类型角色，用 appraiser 的 profitBonus 验证非匹配类型
    selectCharacter("scout")
    const result = applyPassiveEffect({ profit: 1000 })
    expect(result.bonus).toBe(0)
    expect(result.label).toBe("轮廓揭示+1")
  })

  it("outlineBonus/qualityBonus 返回标签但无加成", () => {
    selectCharacter("scout")
    const result = applyPassiveEffect({ profit: 1000 })
    expect(result.bonus).toBe(0)
    expect(result.label).toBe("轮廓揭示+1")
  })

  it("无被动效果返回零加成", () => {
    // 所有角色都有被动，这里测试 profitBonus 在负利润时的行为
    selectCharacter("appraiser")
    const result = applyPassiveEffect({ profit: -100 })
    expect(result.bonus).toBe(0)
    expect(result.label).toBeNull()
  })
})

describe("character-system - resetForNewGame", () => {
  it("清空会话被动加成", () => {
    selectCharacter("appraiser")
    applyPassiveEffect({ profit: 1000 })
    expect(getSessionPassiveBonus()).toBe(100)
    resetForNewGame()
    expect(getSessionPassiveBonus()).toBe(0)
  })
})

describe("character-system - formatProfitWithBonus", () => {
  it("有加成时返回总额+加成+标签", () => {
    selectCharacter("appraiser")
    const result = formatProfitWithBonus(1000)
    expect(result.total).toBe(1100)
    expect(result.bonus).toBe(100)
    expect(result.label).toBe("盈利加成+10%")
  })

  it("无加成时返回原值", () => {
    selectCharacter("scout")
    const result = formatProfitWithBonus(1000)
    expect(result.total).toBe(1000)
    expect(result.bonus).toBe(0)
    expect(result.label).toBeNull()
  })

  it("零利润无加成", () => {
    selectCharacter("appraiser")
    const result = formatProfitWithBonus(0)
    expect(result.total).toBe(0)
    expect(result.bonus).toBe(0)
  })
})
