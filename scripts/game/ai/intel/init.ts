/**
 * @file scripts/game/ai/intel/init.ts
 * @module ai/intel/init
 * @description AI 情报系统初始化 Mixin。负责情报池、资源状态、角色分配、
 *              LLM 开关、高价值阈值的初始化，以及每局开始时的重置逻辑。
 *
 * @requires core/utils - createEmptyAiPrivateIntelPool, clamp, shuffle
 * @requires data/skills - SKILL_DEFS
 * @requires data/items - ITEM_DEFS
 * @requires data/characters - CHARACTERS
 * @requires data/character-system - getActiveCharacter
 * @exports InitMixin - 初始化子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import {
  createEmptyAiPrivateIntelPool,
  clamp,
  shuffle
} from "../../core/utils"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { CHARACTERS } from "../../data/characters"
import { getActiveCharacter } from "../../data/character-system"

export const InitMixin: ThisType<WarehouseSceneThis> = {
  initAiIntelSystems() {
    this.aiPrivateIntel = {}
    this.aiResourceState = {}
    this.aiRoundEffects = {}
    this.lastAiIntelActions = []
    this.aiLlmRoundPlans = {}
    this.aiFoldState = {}
    this.highValuePriceThreshold = null
    this.aiCharacterAssignments = {}

    const aiPlayers = this.players.filter((player) => !player.isHuman)
    const allCharacters = CHARACTERS || []
    const allItems = [...ITEM_DEFS]

    aiPlayers.forEach((player) => {
      this.aiPrivateIntel[player.id] = createEmptyAiPrivateIntelPool()

      const randomCharIndex = Math.floor(Math.random() * allCharacters.length)
      const assignedChar = allCharacters[randomCharIndex] || allCharacters[0]
      this.aiCharacterAssignments[player.id] = {
        characterId: assignedChar.id,
        characterName: assignedChar.name,
        skillId: assignedChar.skillId,
        skillName: assignedChar.skillName,
        passive: assignedChar.passive || null
      }

      const skillDef = SKILL_DEFS.find((s) => s.id === assignedChar.skillId)
      const skillEntry = skillDef ? { [skillDef.id]: skillDef.maxPerRound } : {}

      const shuffledItems = shuffle([...allItems])
      const selectedItems = shuffledItems.slice(0, 4)
      const itemEntries: Record<string, number> = {}
      selectedItems.forEach((item) => {
        itemEntries[item.id] = item.initialCount
      })

      this.aiResourceState[player.id] = {
        skills: skillEntry,
        items: itemEntries
      }
      this.aiFoldState[player.id] = false
    })

    this.refreshAllPlayerAvatars()
  },

  refreshAllPlayerAvatars() {
    this.players.forEach((player) => {
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      if (avatarEl) {
        this.updatePlayerAvatar(player.id, avatarEl)
      }
      const nameEl = document.getElementById(`name-${player.id}`)
      if (nameEl) nameEl.textContent = player.name
      let charName = ""
      if (player.isHuman) {
        const char = getActiveCharacter()
        if (char && char.name) charName = char.name
      } else {
        const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[player.id]
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
            ; (nameTag as HTMLElement).style.display = ""
        }
      }
    })
  },

  resetAiRoundResources() {
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    aiPlayers.forEach((player) => {
      let resourceState = this.aiResourceState[player.id]
      if (!resourceState) {
        resourceState = { skills: {}, items: {} }
        this.aiResourceState[player.id] = resourceState
      }

      if (!this.aiCharacterAssignments) {
        this.aiCharacterAssignments = {}
      }

      const charAssign = this.aiCharacterAssignments[player.id]
      if (charAssign && charAssign.skillId) {
        const skillDef = SKILL_DEFS.find((s) => s.id === charAssign.skillId)
        if (skillDef) {
          resourceState.skills[skillDef.id] = skillDef.maxPerRound
        }
      }
    })
    this.aiRoundEffects = {}
    this.lastAiIntelActions = []
    this.aiLlmRoundPlans = {}
  },

  ensureAiPrivateIntel(playerId: string) {
    if (this.aiPrivateIntel[playerId]) {
      return this.aiPrivateIntel[playerId]
    }

    const pool = createEmptyAiPrivateIntelPool()
    this.aiPrivateIntel[playerId] = pool
    return pool
  }
}
