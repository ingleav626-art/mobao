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

import { savePlayerMoney } from "./settings";
import { recordGameFinished } from "./app-state";

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

// ─── Mixin（向后兼容）───

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

interface SettlementManagerThis {
  players: Array<{ id: string; isSelf: boolean; name: string }>;
  playerMoney: number;
  aiWallets: Record<string, number>;
  warehouseTrueValue: number;
  isLanMode: boolean;
  lanIsHost: boolean;
  lanHostWallets: Record<string, number>;
  currentBid: number;
  bidLeader: string | null;
  settled: boolean;
  stopRoundTimer(): void;
  enterSettlementPage(player: { isSelf: boolean; name: string }, bid: number, reason: string): void;
  updateSettlementPanelMetrics(totalValue: number, winnerProfit: number): void;
  showSelfProfit(profit: number, label: string): void;
  setSettlementProgress(step: string, progress: number): void;
  triggerSettlementFinalAnimation(profit: number, isSelf: boolean): void;
  saveBattleRecord(record: any): void;
  saveAiWalletsToStorage(): void;
  pushRunSettlementContextToAi(context: any): void;
  hasAppliedMoneyForRun(): boolean;
  markMoneyAppliedForRun(): void;
  writeLog(message: string): void;
  updateHud(): void;
  getAiWallet(id: string): number;
  revealAllArtifactsForSettlement(): void;
  prepareFinishAuction(winner: { playerId: string; bid: number }, mode: string): Promise<FinishAuctionContext | null>;
  finishAuctionLan(ctx: FinishAuctionContext): void;
  finishAuctionSingle(ctx: FinishAuctionContext): void;
  updateSettlementFinalUI(ctx: FinishAuctionContext, profitInfo: SelfProfitInfo): void;
  saveSettlementBattleRecord(ctx: FinishAuctionContext, playerProfit: number, reasonText: string): void;
}

export const SettlementManagerMixin: ThisType<WarehouseSceneThis> = {
  async finishAuction(winner: { playerId: string; bid: number }, mode: string) {
    const self = this as unknown as SettlementManagerThis;
    const ctx = await self.prepareFinishAuction(winner, mode);
    if (!ctx) return;
    if (this.isLanMode) {
      self.finishAuctionLan(ctx);
    } else {
      self.finishAuctionSingle(ctx);
    }
  },

  async prepareFinishAuction(
    winner: { playerId: string; bid: number },
    mode: string
  ): Promise<FinishAuctionContext | null> {
    const self = this as unknown as SettlementManagerThis;
    const winnerPlayer = this.players.find((player: { id: string }) => player.id === winner.playerId);
    if (!winnerPlayer) {
      this.writeLog(`结算失败：找不到赢家玩家 ${winner.playerId}`);
      return null;
    }
    const winnerBid = winner.bid;

    this.currentBid = winnerBid;
    this.bidLeader = winner.playerId;
    this.settled = true;
    this.stopRoundTimer();
    const reasonTextMap: Record<string, string> = {
      direct: "提前拿下",
      final: "最终回合高价胜出",
      manual: "手动结算"
    };

    this.enterSettlementPage(winnerPlayer, winnerBid, reasonTextMap[mode] || "结算");

    const totalValue = this.warehouseTrueValue;
    const { winnerProfit, dividendPerPlayer, ticketPerPlayer, mechanism } = calculateDividendTicket(totalValue, winnerBid);

    const nonWinners = this.players.filter((p: { id: string }) => p.id !== winnerPlayer.id);
    const humanNonWinner = nonWinners.find((p: { isSelf: boolean }) => p.isSelf);
    const isWinner = winnerPlayer.isSelf;
    const selfProfitInfo = getSelfProfitInfo(winnerProfit, dividendPerPlayer, ticketPerPlayer, isWinner);

    if (dividendPerPlayer > 0) {
      nonWinners.forEach((p: { id: string; isSelf: boolean }) => {
        if (p.isSelf) {
          this.playerMoney += dividendPerPlayer;
        } else {
          const wallet = this.getAiWallet(p.id);
          this.aiWallets[p.id] = wallet + dividendPerPlayer;
        }
      });
    } else if (ticketPerPlayer > 0) {
      nonWinners.forEach((p: { id: string; isSelf: boolean }) => {
        if (p.isSelf) {
          this.playerMoney -= ticketPerPlayer;
        } else {
          const wallet = this.getAiWallet(p.id);
          this.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer);
        }
      });
    }

    const dividendTicketInfo = { dividendPerPlayer, ticketPerPlayer, mechanism };

    const settlementResult = {
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    };
    const crossGameRecord = (self as unknown as { createCrossGameRecord(result: any): any }).createCrossGameRecord(settlementResult);
    (self as unknown as { triggerAiReflection(record: any): Promise<void> }).triggerAiReflection(crossGameRecord).catch(() => { });

    try {
      await this.revealAllArtifactsForSettlement();
    } catch (revealError) {
      this.writeLog(`揭示藏品时发生异常：${revealError && (revealError as Error).message ? (revealError as Error).message : "未知错误"}`);
      if (typeof console !== "undefined" && console.error) {
        console.error("revealAllArtifactsForSettlement failed", revealError);
      }
    }

    return {
      winnerPlayer,
      winnerBid,
      mode,
      reasonText: reasonTextMap[mode] || "结算",
      totalValue,
      winnerProfit,
      dividendPerPlayer,
      ticketPerPlayer,
      dividendTicketInfo,
      nonWinners,
      humanNonWinner,
      selfProfitInfo
    };
  },

  finishAuctionLan(ctx: FinishAuctionContext): void {
    const self = this as unknown as SettlementManagerThis;
    const { winnerPlayer, winnerBid, winnerProfit, dividendPerPlayer, ticketPerPlayer, nonWinners } = ctx;
    const lanSelfNonWinner = ctx.humanNonWinner;
    const lanSelfProfitInfo = getSelfProfitInfo(winnerProfit, dividendPerPlayer, ticketPerPlayer, false);

    if (dividendPerPlayer > 0) {
      if (lanSelfNonWinner) {
        if (this.lanIsHost) {
          this.playerMoney += dividendPerPlayer;
        }
        this.writeLog(buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)!);
      }
      if (this.lanIsHost) {
        nonWinners.forEach((p: { id: string; isSelf: boolean; isAI?: boolean; lanId?: string }) => {
          if (!p.isSelf && !p.isAI) {
            const wallet = this.lanHostWallets[p.lanId || ""] || 0;
            this.lanHostWallets[p.lanId || ""] = wallet + dividendPerPlayer;
          } else if (p.isAI) {
            const wallet = this.getAiWallet(p.id);
            this.aiWallets[p.id] = wallet + dividendPerPlayer;
          }
        });
      }
    } else if (ticketPerPlayer > 0) {
      if (lanSelfNonWinner) {
        if (this.lanIsHost) {
          this.playerMoney -= ticketPerPlayer;
        }
        this.writeLog(buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)!);
      }
      if (this.lanIsHost) {
        nonWinners.forEach((p: { id: string; isSelf: boolean; isAI?: boolean; lanId?: string }) => {
          if (!p.isSelf && !p.isAI) {
            const wallet = this.lanHostWallets[p.lanId || ""] || 0;
            this.lanHostWallets[p.lanId || ""] = Math.max(0, wallet - ticketPerPlayer);
          } else if (p.isAI) {
            const wallet = this.getAiWallet(p.id);
            this.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer);
          }
        });
      }
    }

    self.updateSettlementFinalUI(ctx, lanSelfProfitInfo);
    this.writeLog(
      `联机结算：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
    );

    self.saveSettlementBattleRecord(ctx, winnerPlayer.isSelf ? winnerProfit : lanSelfProfitInfo.profit, "联机结算");
  },

  finishAuctionSingle(ctx: FinishAuctionContext): void {
    const self = this as unknown as SettlementManagerThis;
    const { winnerPlayer, winnerBid, totalValue, winnerProfit, dividendPerPlayer, ticketPerPlayer, reasonText, selfProfitInfo, dividendTicketInfo } = ctx;

    const logMsg = buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)
    if (ctx.humanNonWinner && logMsg) {
      this.writeLog(logMsg);
    }

    self.updateSettlementFinalUI(ctx, selfProfitInfo);

    self.saveSettlementBattleRecord(ctx, winnerPlayer.isSelf ? winnerProfit : selfProfitInfo.profit, reasonText);

    this.saveAiWalletsToStorage();

    this.pushRunSettlementContextToAi({
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText,
      dividendTicketInfo
    });

    if (winnerPlayer.isSelf) {
      if (!this.hasAppliedMoneyForRun()) {
        this.playerMoney += winnerProfit;
        savePlayerMoney(this.playerMoney);
        this.markMoneyAppliedForRun();
      }
      this.writeLog(
        `结算完成：你以 ${winnerBid} 拿下整仓，${winnerProfit >= 0 ? "盈利" : "亏损"} ${Math.abs(winnerProfit)}。`
      );
    } else {
      savePlayerMoney(this.playerMoney);
      this.writeLog(
        `结算完成：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
      );
    }

    const selfPlayer = this.players.find((p: { isSelf: boolean }) => p.isSelf);
    if (selfPlayer && recordGameFinished) {
      const playerIsWinner = winnerPlayer.isSelf;
      const playerProfit = playerIsWinner ? winnerProfit : selfProfitInfo.profit;
      const playerWon = playerIsWinner && winnerProfit > 0;
      recordGameFinished(playerWon, playerProfit);
    }

    this.updateHud();
  },

  updateSettlementFinalUI(ctx: FinishAuctionContext, profitInfo: SelfProfitInfo): void {
    this.updateSettlementPanelMetrics(ctx.totalValue, ctx.winnerProfit);
    if (ctx.humanNonWinner) {
      this.showSelfProfit(profitInfo.profit, profitInfo.label);
    }
    this.setSettlementProgress(
      `揭示完成：${ctx.winnerPlayer.name} 的最终利润 ${ctx.winnerProfit >= 0 ? "+" : ""}${ctx.winnerProfit}`,
      100
    );
    this.triggerSettlementFinalAnimation(ctx.winnerProfit, ctx.winnerPlayer.isSelf);
  },

  saveSettlementBattleRecord(ctx: FinishAuctionContext, playerProfit: number, reasonText: string): void {
    const { winnerPlayer, winnerBid, totalValue, winnerProfit, dividendPerPlayer, ticketPerPlayer, mode, dividendTicketInfo } = ctx;
    this.saveBattleRecord({
      mode,
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      playerProfit,
      playerWon: winnerPlayer.isSelf && winnerProfit > 0,
      dividendTicketInfo: dividendPerPlayer > 0 || ticketPerPlayer > 0 ? dividendTicketInfo : null,
      reasonText
    });
  }
}
