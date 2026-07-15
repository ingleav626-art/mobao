import { defineStore } from "pinia"
import { CARRY_ITEMS_STORAGE_KEY } from "../../game/core/constants"
import { ITEM_DEFS } from "../../game/data/items"
import { SKILL_DEFS } from "../../game/data/skills"
import type { CarryItem } from "../../../types/game"

/** 道具槽位类型 */
export interface InventoryItem {
  id: string
  name: string
  description: string
  count: number
  initialCount: number
}

/** 技能槽位类型 */
export interface InventorySkill {
  id: string
  name: string
  description: string
  remainingThisRound: number
  maxPerRound: number
}

export const useInventoryStore = defineStore("inventory", {
  state: () => ({
    isDrawerOpen: false,
    items: [] as InventoryItem[],
    skills: [] as InventorySkill[],
    carryItems: [] as CarryItem[],
    selectedSlot: null as string | null
  }),

  getters: {
    hasItems: (state) => state.items.length > 0 || state.skills.length > 0
  },

  actions: {
    openDrawer(): void {
      this.isDrawerOpen = true
    },

    closeDrawer(): void {
      this.isDrawerOpen = false
      this.selectedSlot = null
    },

    toggleDrawer(): void {
      this.isDrawerOpen = !this.isDrawerOpen
      if (!this.isDrawerOpen) {
        this.selectedSlot = null
      }
    },

    updateItems(
      rawItems: Array<{ id: string; name: string; count: number; initialCount: number }>,
      rawSkills: Array<{ id: string; name: string; remainingThisRound: number; maxPerRound: number }>
    ): void {
      this.items = rawItems.map((item) => {
        const def = ITEM_DEFS.find((d) => d.id === item.id)
        return {
          id: item.id,
          name: item.name,
          count: item.count,
          initialCount: item.initialCount,
          description: def ? def.description : ""
        }
      })
      this.skills = rawSkills.map((skill) => {
        const def = SKILL_DEFS.find((d) => d.id === skill.id)
        return {
          id: skill.id,
          name: skill.name,
          remainingThisRound: skill.remainingThisRound,
          maxPerRound: skill.maxPerRound,
          description: def ? def.description : ""
        }
      })
    },

    loadCarryItems(): void {
      try {
        const raw = window.localStorage.getItem(CARRY_ITEMS_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          this.carryItems = Array.isArray(parsed) ? parsed : []
        } else {
          this.carryItems = []
        }
      } catch {
        this.carryItems = []
      }
    }
  }
})
