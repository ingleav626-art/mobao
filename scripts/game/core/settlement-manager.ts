import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file core/settlement-manager.js
 * @module core/settlement-manager
 * @description 结算业务逻辑 Mixin。负责拍卖结束后的分红/门票计算、钱包更新、
 *              联机/单机结算分发、战绩保存、AI 反思触发、以及结算上下文推送。
 *
 * 核心职责：
 *   - finishAuction(winner, mode): 结算主流程编排器
 *     1. prepareFinishAuction: 计算赢家利润/亏损、分红或门票金额，更新钱包，
 *        触发 AI 反思（跨局记忆），揭示所有藏品，返回结算上下文
 *     2. 按 isLanMode 分发：
 *        - finishAuctionLan: 联机钱包同步（主机）、面板更新、战绩保存
 *        - finishAuctionSingle: 战绩保存、AI 钱包持久化、结算上下文推送、
 *          赢家利润入账、recordGameFinished、HUD 更新
 *     3. 共享后置 helper：
 *        - updateSettlementFinalUI: 面板指标/自身利润/进度/终局动画
 *        - saveSettlementBattleRecord: 战绩记录构造与保存
 *
 * 依赖（通过 this 访问）：
 *   - 实例属性：players, playerMoney, aiWallets, warehouseTrueValue, isLanMode, lanIsHost, lanHostWallets
 *   - 回合管理：stopRoundTimer()（round-manager Mixin）
 *   - 结算 UI：enterSettlementPage, updateSettlementPanelMetrics, showSelfProfit, setSettlementProgress, triggerSettlementFinalAnimation（SETTLEMENT_BRIDGE）
 *   - 藏品揭示：revealAllArtifactsForSettlement（SETTLEMENT_BRIDGE）
 *   - AI 钱包：getAiWallet, saveAiWalletsToStorage（ai/wallet Mixin）
 *   - AI 记忆：createCrossGameRecord, pushRunSettlementContextToAi（ai/memory Mixin）
 *   - AI 反思：triggerAiReflection（ai/reflection Mixin）
 *   - 战绩：saveBattleRecord（BATTLE_RECORD_BRIDGE）
 *   - 工具：writeLog, updateHud, hasAppliedMoneyForRun, markMoneyAppliedForRun
 *   - 全局：savePlayerMoney（window.MobaoSettings）, window.MobaoAppState
 *
 * @exports SettlementManagerMixin - 结算业务逻辑 Mixin
 *
 * @requires core/settings - 游戏设置（资金管理）
 * @requires core/app-state - 应用状态
 */

// ─── 独立函数（可独立测试）───

const DIVIDEND_RATIO = 0.15
const TICKET_RATIO = 0.05

export interface DividendTicketResult {
  winnerProfit: number
  dividendPerPlayer: number
  ticketPerPlayer: number
  mechanism: "dividend" | "ticket" | "none"
}

export function calculateDividendTicket(
  totalValue: number,
  winnerBid: number
): DividendTicketResult {
  const winnerProfit = totalValue - winnerBid
  let dividendPerPlayer = 0
  let ticketPerPlayer = 0

  if (winnerProfit < 0) {
    dividendPerPlayer = Math.round(Math.abs(winnerProfit) * DIVIDEND_RATIO)
  } else if (winnerProfit > 0) {
    ticketPerPlayer = Math.round(winnerProfit * TICKET_RATIO)
  }

  const mechanism = dividendPerPlayer > 0 ? "dividend" : ticketPerPlayer > 0 ? "ticket" : "none"
  return { winnerProfit, dividendPerPlayer, ticketPerPlayer, mechanism }
}

export interface SelfProfitInfo {
  profit: number
  label: string
}

export function getSelfProfitInfo(
  winnerProfit: number,
  dividendPerPlayer: number,
  ticketPerPlayer: number,
  isWinner: boolean
): SelfProfitInfo {
  if (isWinner) {
    return { profit: winnerProfit, label: "自身利润" }
  }
  if (dividendPerPlayer > 0) {
    return { profit: dividendPerPlayer, label: "自身利润（分红）" }
  }
  if (ticketPerPlayer > 0) {
    return { profit: -ticketPerPlayer, label: "自身利润（门票）" }
  }
  return { profit: 0, label: "自身利润" }
}

export function buildDividendTicketLog(
  winnerProfit: number,
  dividendPerPlayer: number,
  ticketPerPlayer: number
): string | null {
  if (winnerProfit < 0 && dividendPerPlayer > 0) {
    return `分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`
  }
  if (winnerProfit > 0 && ticketPerPlayer > 0) {
    return `门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`
  }
  return null
}

// ─── Mixin 薄代理（Phase 2：代理到 SettlementManager，向后兼容 Object.assign 混入）───

interface FinishAuctionContext {
  winnerPlayer: { id: string; isSelf: boolean; name: string }
  winnerBid: number
  mode: string
  reasonText: string
  totalValue: number
  winnerProfit: number
  dividendPerPlayer: number
  ticketPerPlayer: number
  dividendTicketInfo: { dividendPerPlayer: number; ticketPerPlayer: number; mechanism: "dividend" | "ticket" | "none" }
  nonWinners: Array<{ id: string; isSelf: boolean; name: string; isAI?: boolean; lanId?: string }>
  humanNonWinner: { id: string; isSelf: boolean; name: string; isAI?: boolean; lanId?: string } | undefined
  selfProfitInfo: SelfProfitInfo
}

export const SettlementManagerMixin: ThisType<WarehouseSceneThis> = {
  async finishAuction(winner: { playerId: string; bid: number }, mode: string) {
    return this.settlementManager.finishAuction(winner, mode)
  },

  async prepareFinishAuction(winner: { playerId: string; bid: number }, mode: string) {
    return this.settlementManager.prepareFinishAuction(winner, mode)
  },

  finishAuctionLan(ctx: FinishAuctionContext) {
    return this.settlementManager.finishAuctionLan(ctx)
  },

  finishAuctionSingle(ctx: FinishAuctionContext) {
    return this.settlementManager.finishAuctionSingle(ctx)
  },

  updateSettlementFinalUI(ctx: FinishAuctionContext, profitInfo: SelfProfitInfo) {
    return this.settlementManager.updateSettlementFinalUI(ctx, profitInfo)
  },

  saveSettlementBattleRecord(ctx: FinishAuctionContext, playerProfit: number, reasonText: string) {
    return this.settlementManager.saveSettlementBattleRecord(ctx, playerProfit, reasonText)
  }
}
