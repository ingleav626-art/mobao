import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file bidding/index.ts
 * @module bidding
 * @description 出价流程控制 Mixin（薄代理层）。
 *              所有方法委托给 this.biddingManager（BiddingManager 实例）。
 *              纯函数 getLastRoundBidMap / shouldDirectTake 保持独立导出。
 */

// ─── 独立函数（可独立测试）───

export function getLastRoundBidMap(
  playerRoundHistory: Record<string, Array<{ bid: number }>>
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [playerId, history] of Object.entries(playerRoundHistory)) {
    if (history.length > 0) {
      map[playerId] = history[history.length - 1].bid
    }
  }
  return map
}

export function shouldDirectTake(
  round: number,
  maxRounds: number,
  firstBid: number,
  secondBid: number,
  directTakeRatio: number
): boolean {
  return round < maxRounds && firstBid > 0 && firstBid >= Math.ceil(secondBid * (1 + directTakeRatio))
}

// ─── Mixin（薄代理层）───

export const BiddingMixin: ThisType<WarehouseSceneThis> = {
  setPlayerBidReady(playerId: string, ready: boolean): void {
    return this.biddingManager.setPlayerBidReady(playerId, ready)
  },

  areAllPlayersBidReady(): boolean {
    return this.biddingManager.areAllPlayersBidReady()
  },

  async kickoffAiRoundDecisions() {
    return this.biddingManager.kickoffAiRoundDecisions()
  },

  waitUntilResumed(): Promise<void> {
    return this.biddingManager.waitUntilResumed()
  },

  openBidKeypad(): void {
    return this.biddingManager.openBidKeypad()
  },

  closeBidKeypad(): void {
    return this.biddingManager.closeBidKeypad()
  },

  syncBidKeypadScreen(): void {
    return this.biddingManager.syncBidKeypadScreen()
  },

  updateKeypadDirectHint(): void {
    return this.biddingManager.updateKeypadDirectHint()
  },

  handleBidKeyInput(key: string): void {
    return this.biddingManager.handleBidKeyInput(key)
  },

  async resolveRoundBids(reason: string = "manual", forceSettle: boolean = false): Promise<void> {
    return this.biddingManager.resolveRoundBids(reason, forceSettle)
  },

  buildRoundBids(): Array<{ playerId: string; bid: number }> {
    return this.biddingManager.buildRoundBids()
  },

  getLastRoundBidMap(): Record<string, number> {
    return getLastRoundBidMap(this.playerRoundHistory)
  },

  async revealRoundBidsSequential(roundBids: Array<{ playerId: string; bid: number }>): Promise<void> {
    return this.biddingManager.revealRoundBidsSequential(roundBids)
  },

  setPlayerBidDisplay(playerId: string, bid: number, order: number): void {
    return this.biddingManager.setPlayerBidDisplay(playerId, bid, order)
  },

  playerBid(): void {
    return this.biddingManager.playerBid()
  },

  settleCurrentRun(): void {
    return this.biddingManager.settleCurrentRun()
  }
}