import { defineStore } from 'pinia'

export interface CarryItem {
  id: string
  name: string
  quantity: number
}

export interface RoundHistory {
  round: number
  bid: number
  action: string
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    characterId: "",
    carryItems: [] as CarryItem[],
    history: [] as RoundHistory[],
  }),

  actions: {
    // Phase 2 填充
  },
})