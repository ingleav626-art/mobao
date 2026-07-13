/**
 * @file scripts/game/ai/intel-manager/init-fns.ts
 * @module ai/intel-manager/init-fns
 * @description AiIntelManager 初始化相关函数：情报池初始化、角色分配、资源重置、头像刷新、高价值阈值。
 */
import type { Player, Artifact } from "../../../../types/game"
import type { AiPrivateIntelPool } from "../../../../types/ai"
import type { AiIntelManagerDeps, AiIntelState } from "../intel-manager"
import { createEmptyAiPrivateIntelPool, calcHighValuePriceThreshold, checkHighValueArtifact } from "../intel/pure"
import { shuffle } from "../../core/utils"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { CHARACTERS } from "../../data/characters"
import { getActiveCharacter } from "../../data/character-system"
import { ARTIFACT_LIBRARY } from "../../data/artifacts"

/** 初始化 AI 情报系统：情报池、资源状态、角色分配、高价值阈值 */
export function initAiIntelSystems(deps: AiIntelManagerDeps): void {
  const state = deps.state
  state.aiPrivateIntel = {}
  state.aiResourceState = {}
  state.aiRoundEffects = {}
  state.lastAiIntelActions = []
  state.aiLlmRoundPlans = {}
  state.aiFoldState = {}
  state.highValuePriceThreshold = null
  state.aiCharacterAssignments = {}

  const aiPlayers = deps.players.filter((player: Player) => !player.isHuman)
  const allCharacters = CHARACTERS || []
  const allItems = [...ITEM_DEFS]

  aiPlayers.forEach((player: Player) => {
    state.aiPrivateIntel[player.id] = createEmptyAiPrivateIntelPool()

    const randomCharIndex = Math.floor(Math.random() * allCharacters.length)
    const assignedChar = allCharacters[randomCharIndex] || allCharacters[0]
    state.aiCharacterAssignments[player.id] = {
      characterId: assignedChar.id,
      characterName: assignedChar.name,
      skillId: assignedChar.skillId,
      skillName: assignedChar.skillName,
      passive: assignedChar.passive || null,
    }

    const skillDef = SKILL_DEFS.find((s) => s.id === assignedChar.skillId)
    const skillEntry = skillDef ? { [skillDef.id]: skillDef.maxPerRound } : {}

    const shuffledItems = shuffle([...allItems])
    const selectedItems = shuffledItems.slice(0, 4)
    const itemEntries: Record<string, number> = {}
    selectedItems.forEach((item) => {
      itemEntries[item.id] = item.initialCount
    })

    state.aiResourceState[player.id] = {
      skills: skillEntry,
      items: itemEntries,
    }
    state.aiFoldState[player.id] = false
  })

  refreshAllPlayerAvatars(deps)
}

/** 刷新所有玩家头像（含角色名标签） */
export function refreshAllPlayerAvatars(deps: AiIntelManagerDeps): void {
  deps.players.forEach((player: Player) => {
    const avatarEl = document.getElementById(`avatar-${player.id}`)
    if (avatarEl) {
      deps.updatePlayerAvatar(player.id, avatarEl)
    }
    const nameEl = document.getElementById(`name-${player.id}`)
    if (nameEl) nameEl.textContent = player.name
    let charName = ""
    if (player.isHuman) {
      const char = getActiveCharacter()
      if (char && char.name) charName = char.name
    } else {
      const charAssign = deps.state.aiCharacterAssignments && deps.state.aiCharacterAssignments[player.id]
      if (charAssign && charAssign.characterName) charName = charAssign.characterName
    }
    if (avatarEl && charName) {
      let wrap = avatarEl.parentElement
      if (wrap && wrap.classList.contains("avatar-wrap")) {
        let nameTag = wrap.querySelector(".avatar-char-name")
        if (!nameTag) {
          nameTag = document.createElement("div")
          nameTag.className = "avatar-char-name"
          wrap.appendChild(nameTag)
        }
        nameTag.textContent = charName
        ;(nameTag as HTMLElement).style.display = ""
      }
    }
  })
}

/** 重置 AI 回合资源（技能次数恢复、效果清空） */
export function resetAiRoundResources(deps: AiIntelManagerDeps): void {
  const state = deps.state
  const aiPlayers = deps.players.filter((player: Player) => !player.isHuman)
  aiPlayers.forEach((player: Player) => {
    let resourceState = state.aiResourceState[player.id]
    if (!resourceState) {
      resourceState = { skills: {}, items: {} }
      state.aiResourceState[player.id] = resourceState
    }

    if (!state.aiCharacterAssignments) {
      state.aiCharacterAssignments = {}
    }

    const charAssign = state.aiCharacterAssignments[player.id]
    if (charAssign && charAssign.skillId) {
      const skillDef = SKILL_DEFS.find((s) => s.id === charAssign.skillId)
      if (skillDef) {
        resourceState.skills[skillDef.id] = skillDef.maxPerRound
      }
    }
  })
  state.aiRoundEffects = {}
  state.lastAiIntelActions = []
  state.aiLlmRoundPlans = {}
}

/** 确保玩家情报池存在，不存在则创建空池 */
export function ensureAiPrivateIntel(state: AiIntelState, playerId: string): AiPrivateIntelPool {
  if (state.aiPrivateIntel[playerId]) {
    return state.aiPrivateIntel[playerId]
  }
  const pool = createEmptyAiPrivateIntelPool()
  state.aiPrivateIntel[playerId] = pool
  return pool
}

/** 获取高价值价格阈值（缓存计算） */
export function getHighValuePriceThreshold(deps: AiIntelManagerDeps): number {
  const state = deps.state
  if (
    state.highValuePriceThreshold !== null &&
    Number.isFinite(state.highValuePriceThreshold) &&
    state.highValuePriceThreshold > 0
  ) {
    return state.highValuePriceThreshold
  }
  const prices = ARTIFACT_LIBRARY.map((entry) => Number(entry.basePrice) || 0)
  state.highValuePriceThreshold = calcHighValuePriceThreshold(prices)
  return state.highValuePriceThreshold
}

/** 判断藏品是否为高价值 */
export function isHighValueArtifact(deps: AiIntelManagerDeps, item: Artifact): boolean {
  const threshold = getHighValuePriceThreshold(deps)
  return checkHighValueArtifact(item, threshold)
}