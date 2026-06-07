/**
 * @file data/character-system.js
 * @module data/character-system
 * @description 角色系统运行时管理。采用 ES Module 模式，同时挂载到 window.CharacterSystem 保持兼容。
 *              管理当前选中角色的状态、被动技能效果计算、以及角色选择的持久化。
 *              与 characters.js（纯数据定义）配合使用，本文件负责运行时逻辑。
 *
 * 核心职责：
 *   - 角色选择：selectCharacter(characterId)
 *     选中角色并持久化到 localStorage（mobao_selected_character_v1）
 *   - 角色查询：getActiveCharacter / getActiveCharacterId / getActiveSkillId / getActivePassive
 *     获取当前选中角色的完整数据、ID、技能ID、被动技能
 *   - 显示信息：getDisplayName / getDisplayAvatar / getAvatarLabel
 *     获取角色名、头像URL、头像标签（鉴/探/觅）
 *   - 被动技能效果：
 *     - getOutlineBonus(): 轮廓揭示加成
 *     - getQualityBonus(): 品质揭示加成
 *     - getOutlineSortStrategy(): 轮廓排序策略（如 smallestFirst）
 *     - applyPassiveEffect(context): 应用被动效果（利润加成等）
 *     - formatProfitWithBonus(baseProfit): 格式化含加成的利润
 *   - 局重置：resetForNewGame() 重置局内被动加成累计
 *
 * 被动技能类型（passive.type）：
 *   - profitBonus: 利润加成（如 +10%）
 *   - outlineBonus: 轮廓揭示数量加成
 *   - qualityBonus: 品质揭示加成
 *   - outlineSmallestPriority: 轮廓探测优先最小
 *   - bidBonus: 出价加成
 *
 * @requires CharacterData - 角色数据定义（characters.js 提供的 CHARACTERS 数组）
 *
 * @exports window.CharacterSystem - 角色系统运行时管理单例（兼容）
 * @exports getActiveCharacter, selectCharacter, ... - 命名导出
 */
const STORAGE_KEY = "mobao_selected_character_v1"

let _activeCharacter = null
let _sessionPassiveBonus = 0

export function getActiveCharacter() {
  if (_activeCharacter) return _activeCharacter
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const id = JSON.parse(raw)
      const pool = (window.CharacterData && window.CharacterData.CHARACTERS) || []
      const found = pool.find((c) => c.id === id)
      if (found) {
        _activeCharacter = found
        return found
      }
    }
  } catch (_e) { }
  const fallback = (window.CharacterData && window.CharacterData.CHARACTERS) || []
  _activeCharacter = fallback[0] || null
  return _activeCharacter
}

export function getActiveCharacterId() {
  const c = getActiveCharacter()
  return c ? c.id : null
}

export function getActiveSkillId() {
  const c = getActiveCharacter()
  return c ? c.skillId : null
}

export function getActivePassive() {
  const c = getActiveCharacter()
  return c ? c.passive : null
}

export function getDisplayName() {
  const c = getActiveCharacter()
  return c ? c.name : "玩家"
}

export function getDisplayAvatar() {
  const c = getActiveCharacter()
  if (c && c.avatar) return c.avatar
  return null
}

export function getAvatarLabel() {
  const c = getActiveCharacter()
  if (!c) return "你"
  const nameMap = { appraiser: "鉴", scout: "探", seeker: "觅" }
  return nameMap[c.id] || c.name.charAt(0)
}

export function selectCharacter(characterId) {
  const pool = (window.CharacterData && window.CharacterData.CHARACTERS) || []
  const char = pool.find((c) => c.id === characterId)
  if (!char) return false
  _activeCharacter = char
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(characterId))
  } catch (_e) { }
  return true
}

export function resetForNewGame() {
  _sessionPassiveBonus = 0
}

export function getOutlineBonus() {
  const passive = getActivePassive()
  if (!passive || passive.type !== "outlineBonus") return 0
  return passive.value || 0
}

export function getQualityBonus() {
  const passive = getActivePassive()
  if (!passive || passive.type !== "qualityBonus") return 0
  return passive.value || 0
}

export function getOutlineSortStrategy() {
  const passive = getActivePassive()
  if (!passive) return null
  if (passive.type === "outlineSmallestPriority") return "smallestFirst"
  return null
}

export function applyPassiveEffect(context) {
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

export function getSessionPassiveBonus() {
  return _sessionPassiveBonus
}

export function formatProfitWithBonus(baseProfit) {
  const result = applyPassiveEffect({ profit: baseProfit })
  if (result.bonus > 0) {
    return { total: baseProfit + result.bonus, bonus: result.bonus, label: result.label }
  }
  return { total: baseProfit, bonus: 0, label: null }
}

// 兼容层：保持 window.CharacterSystem 全局变量可用
window.CharacterSystem = {
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
}