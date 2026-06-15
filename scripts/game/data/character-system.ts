/**
 * @file data/character-system.ts
 * @module data/character-system
 * @description 角色系统运行时管理。管理当前选中角色的状态、被动技能效果计算、以及角色选择的持久化。
 *              与 characters.ts（纯数据定义）配合使用，本文件负责运行时逻辑。
 *
 * @exports window.CharacterSystem - 角色系统运行时管理单例（兼容）
 */

import { CHARACTERS } from "./characters"

const STORAGE_KEY = "mobao_selected_character_v1"

let _activeCharacter: any = null
let _sessionPassiveBonus: number = 0

export function getActiveCharacter(): any {
  if (_activeCharacter) return _activeCharacter
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const id = JSON.parse(raw)
      const pool = CHARACTERS || []
      const found = pool.find((c: any) => c.id === id)
      if (found) {
        _activeCharacter = found
        return found
      }
    }
  } catch (_e) { /* ignore */ }
  const fallback = ((window as any).CharacterData && (window as any).CharacterData.CHARACTERS) || []
  _activeCharacter = fallback[0] || null
  return _activeCharacter
}

export function getActiveCharacterId(): string | null {
  const c = getActiveCharacter()
  return c ? c.id : null
}

export function getActiveSkillId(): string | null {
  const c = getActiveCharacter()
  return c ? c.skillId : null
}

export function getActivePassive(): any {
  const c = getActiveCharacter()
  return c ? c.passive : null
}

export function getDisplayName(): string {
  const c = getActiveCharacter()
  return c ? c.name : "玩家"
}

export function getDisplayAvatar(): string | null {
  const c = getActiveCharacter()
  if (c && c.avatar) return c.avatar
  return null
}

export function getAvatarLabel(): string {
  const c = getActiveCharacter()
  if (!c) return "你"
  const nameMap: Record<string, string> = { appraiser: "鉴", scout: "探", seeker: "觅" }
  return nameMap[c.id] || c.name.charAt(0)
}

export function selectCharacter(characterId: string): boolean {
  const pool = ((window as any).CharacterData && (window as any).CharacterData.CHARACTERS) || []
  const char = pool.find((c: any) => c.id === characterId)
  if (!char) return false
  _activeCharacter = char
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(characterId))
  } catch (_e) { /* ignore */ }
  return true
}

export function resetForNewGame(): void {
  _sessionPassiveBonus = 0
}

export function getOutlineBonus(): number {
  const passive = getActivePassive()
  if (!passive || passive.type !== "outlineBonus") return 0
  return passive.value || 0
}

export function getQualityBonus(): number {
  const passive = getActivePassive()
  if (!passive || passive.type !== "qualityBonus") return 0
  return passive.value || 0
}

export function getOutlineSortStrategy(): string | null {
  const passive = getActivePassive()
  if (!passive) return null
  if (passive.type === "outlineSmallestPriority") return "smallestFirst"
  return null
}

export function applyPassiveEffect(context: { profit: number }): { bonus: number; label: string | null } {
  const passive = getActivePassive()
  if (!passive) return { bonus: 0, label: null }

  const profit = context.profit || 0

  switch (passive.type) {
    case "profitBonus":
      if (profit <= 0) return { bonus: 0, label: null }
      const bonus = Math.round(profit * passive.value)
      _sessionPassiveBonus = bonus
      return { bonus, label: passive.label }
    case "bidBonus":
      return { bonus: 0, label: passive.label }
    case "outlineBonus":
    case "qualityBonus":
    case "outlineSmallestPriority":
      return { bonus: 0, label: passive.label }
    default:
      return { bonus: 0, label: null }
  }
}

export function getSessionPassiveBonus(): number {
  return _sessionPassiveBonus
}

export function formatProfitWithBonus(baseProfit: number): { total: number; bonus: number; label: string | null } {
  const result = applyPassiveEffect({ profit: baseProfit })
  if (result.bonus > 0) {
    return { total: baseProfit + result.bonus, bonus: result.bonus, label: result.label }
  }
  return { total: baseProfit, bonus: 0, label: null }
}