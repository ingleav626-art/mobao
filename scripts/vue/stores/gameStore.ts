import { defineStore } from 'pinia'

export interface Player {
  id: string
  name: string
  money: number
}

export const useGameStore = defineStore('game', {
  state: () => ({
    // 回合状态
    round: 1,
    maxRounds: 5,
    roundTimeLeft: 60,
    actionsLeft: 3,
    roundPaused: false,
    roundResolving: false,
    settled: false,

    // 出价状态
    currentBid: 0,
    bidLeader: "",
    playerBid: 0,
    playerBidSubmitted: false,

    // 玩家状态
    playerMoney: 0,
    players: [] as Player[],

    // 仓库状态
    warehouseTrueValue: 0,
    aiMaxBid: 0,
  }),

  actions: {
    // Phase 2 填充
  },
})