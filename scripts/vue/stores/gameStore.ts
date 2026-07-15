import { defineStore } from "pinia"

export interface Player {
  id: string
  name: string
  money: number
}

export const useGameStore = defineStore("game", {
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
    aiMaxBid: 0
  }),

  actions: {
    updateRound(round: number, maxRounds: number, roundTimeLeft: number, actionsLeft: number): void {
      this.round = round
      this.maxRounds = maxRounds
      this.roundTimeLeft = roundTimeLeft
      this.actionsLeft = actionsLeft
    },

    updateMoney(playerMoney: number): void {
      this.playerMoney = playerMoney
    },

    updateTimer(roundTimeLeft: number, roundPaused: boolean): void {
      this.roundTimeLeft = roundTimeLeft
      this.roundPaused = roundPaused
    },

    updateBid(currentBid: number, bidLeader: string | null, playerBid: number, playerBidSubmitted: boolean): void {
      this.currentBid = currentBid
      this.bidLeader = bidLeader ?? ""
      this.playerBid = playerBid
      this.playerBidSubmitted = playerBidSubmitted
    },

    togglePause(): void {
      this.roundPaused = !this.roundPaused
    },

    updateSettled(settled: boolean): void {
      this.settled = settled
    },

    updateRoundResolving(roundResolving: boolean): void {
      this.roundResolving = roundResolving
    }
  }
})
