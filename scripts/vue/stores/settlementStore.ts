import { defineStore } from "pinia"

export interface SettlementWinner {
  id: string
  name: string
}

export interface SettlementState {
  /** 结算页面是否激活 */
  isActive: boolean
  /** 赢家信息 */
  winner: SettlementWinner | null
  /** 赢家出价 */
  winBid: number
  /** 仓库真实总价值 */
  trueValue: number
  /** 赢家利润（正/负） */
  profit: number
  /** 总回合数 */
  rounds: number
  /** 结算进行中 */
  isSettling: boolean
  /** 结算进度 0~1 */
  settlementProgress: number
  /** 玩家个人利润 */
  playerProfit: number
  /** 玩家个人利润标签（分红/门票） */
  playerProfitLabel: string
  /** 分红/门票机制 */
  mechanism: "dividend" | "ticket" | "none"
}

export const useSettlementStore = defineStore("settlement", {
  state: (): SettlementState => ({
    isActive: false,
    winner: null,
    winBid: 0,
    trueValue: 0,
    profit: 0,
    rounds: 0,
    isSettling: false,
    settlementProgress: 0,
    playerProfit: 0,
    playerProfitLabel: "",
    mechanism: "none"
  }),

  actions: {
    showSettlement(
      winner: SettlementWinner,
      winBid: number,
      trueValue: number,
      profit: number,
      rounds: number,
      mechanism: "dividend" | "ticket" | "none"
    ): void {
      this.isActive = true
      this.winner = winner
      this.winBid = winBid
      this.trueValue = trueValue
      this.profit = profit
      this.rounds = rounds
      this.mechanism = mechanism
      this.isSettling = true
      this.settlementProgress = 0
    },

    updateSettlementData(trueValue: number, profit: number): void {
      this.trueValue = trueValue
      this.profit = profit
    },

    updateProgress(progress: number): void {
      this.settlementProgress = progress
    },

    setPlayerProfit(profit: number, label: string): void {
      this.playerProfit = profit
      this.playerProfitLabel = label
    },

    hideSettlement(): void {
      this.isActive = false
      this.winner = null
      this.winBid = 0
      this.trueValue = 0
      this.profit = 0
      this.rounds = 0
      this.isSettling = false
      this.settlementProgress = 0
      this.playerProfit = 0
      this.playerProfitLabel = ""
      this.mechanism = "none"
    }
  }
})
