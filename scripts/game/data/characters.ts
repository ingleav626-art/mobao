/**
 * @file data/characters.ts
 * @module data/characters
 * @description 角色数据定义。定义所有可玩角色的静态数据（ID、名称、技能、被动、头像、立绘路径），
 *              以及角色查询和选择持久化的便捷方法。
 *              与 character-system.ts（运行时逻辑）配合使用，本文件只负责数据。
 *
 * 角色列表（CHARACTERS）：
 *   - appraiser（鉴定师）：技能-玉脉鉴质（玉器品质+2），被动-盈利加成+10%
 *   - scout（探子）：技能-拓影侦测（轮廓+3），被动-轮廓揭示+1
 *   - seeker（觅踪者）：技能-鉴踪直取（揭示最大1件全部信息），被动-轮廓探测优先最小
 *
 * 角色数据结构：
 *   { id, name, desc, avatar, live2d, skillId, skillName, skillDesc, passive, unlockCondition, unlocked }
 *
 * @exports window.CharacterData - 角色数据单例（兼容）
 * @exports CHARACTERS, getCharacterById, ... - 命名导出
 */



import type { Character, PassiveEffect } from '../../../types/game'

export const CHARACTERS: Character[] = [
  {
    id: "appraiser",
    name: "鉴定师",
    desc: "精准识宝，稳扎稳打",
    avatar: "assets/images/characters/character_design_sketch/character-appraiser-avatar.png",
    live2d: "assets/images/characters/live2D/character-appraiser-live2d.webm",
    skillId: "skill-quality-jade",
    skillName: "玉脉鉴质",
    skillDesc: "优先对玉器揭示2件品质格",
    passive: { type: "profitBonus", value: 0.1, label: "盈利加成+10%" } as PassiveEffect,
    unlockCondition: "default",
    unlocked: true
  },
  {
    id: "scout",
    name: "探子",
    desc: "眼观六路，广撒大网",
    avatar: null,
    live2d: null,
    skillId: "skill-outline-scan",
    skillName: "拓影侦测",
    skillDesc: "揭示3件藏品的完整轮廓",
    passive: { type: "outlineBonus", value: 1, label: "轮廓揭示+1" } as PassiveEffect,
    unlockCondition: "default",
    unlocked: true
  },
  {
    id: "seeker",
    name: "觅踪者",
    desc: "洞察秋毫，直取要害",
    avatar: "assets/images/characters/character_design_sketch/character-seeker-avatar.png",
    live2d: "assets/images/characters/live2D/character-seeker-live2d.webm",
    skillId: "skill-reveal-largest",
    skillName: "鉴踪直取",
    skillDesc: "直接随机揭示轮廓最大的1件藏品的所有信息",
    passive: { type: "outlineSmallestPriority", value: 0, label: "轮廓探测优先轮廓最小" } as PassiveEffect,
    unlockCondition: "default",
    unlocked: true
  }
]

export function getCharacterById(id: string): Character | null {
  return CHARACTERS.find((c) => c.id === id) || null
}

export function getUnlockedCharacters(): Character[] {
  return CHARACTERS.filter((c) => c.unlocked)
}

export function getSelectedCharacter(): Character {
  try {
    const raw = window.localStorage.getItem("mobao_selected_character_v1")
    if (raw) return JSON.parse(raw) as Character
  } catch (_e) { /* ignore */ }
  return CHARACTERS[0]
}

export function saveSelectedCharacter(characterId: string): void {
  window.localStorage.setItem("mobao_selected_character_v1", JSON.stringify(characterId))
}