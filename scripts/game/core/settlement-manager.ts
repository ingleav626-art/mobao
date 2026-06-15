/**
 * @file core/settlement-manager.js
 * @module core/settlement-manager
 * @description 结算业务逻辑 Mixin。负责拍卖结束后的分红/门票计算、钱包更新、
 *              联机/单机结算分发、战绩保存、AI 反思触发、以及结算上下文推送。
 *
 * 核心职责：
 *   - finishAuction(winner, mode): 结算主流程
 *     1. 计算赢家利润/亏损，计算分红或门票金额
 *     2. 更新玩家和 AI 钱包
 *     3. 触发 AI 反思（跨局记忆）
 *     4. 揭示所有藏品
 *     5. 联机模式：同步主机钱包，客机等待主机同步
 *     6. 单机模式：保存战绩、AI 钱包、结算上下文
 *     7. 更新 HUD 和全局状态
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
}

export const SettlementManagerMixin = {
  async finishAuction(winner: { playerId: string; bid: number }, mode: string) {
    const self = this as unknown as SettlementManagerThis;
    const winnerPlayer = self.players.find((player: { id: string }) => player.id === winner.playerId);
    if (!winnerPlayer) {
      self.writeLog(`结算失败：找不到赢家玩家 ${winner.playerId}`);
      return;
    }
    const winnerBid = winner.bid;

    self.currentBid = winnerBid;
    self.bidLeader = winner.playerId;
    self.settled = true;
    self.stopRoundTimer();
    const reasonTextMap: Record<string, string> = {
      direct: "提前拿下",
      final: "最终回合高价胜出",
      manual: "手动结算"
    };

    self.enterSettlementPage(winnerPlayer, winnerBid, reasonTextMap[mode] || "结算");

    const totalValue = self.warehouseTrueValue;
    const winnerProfit = totalValue - winnerBid;

    const DIVIDEND_RATIO = 0.15;
    const TICKET_RATIO = 0.05;
    const nonWinners = self.players.filter((p: { id: string }) => p.id !== winnerPlayer.id);
    let dividendPerPlayer = 0;
    let ticketPerPlayer = 0;
    let selfProfit = 0;
    let selfProfitLabel = "自身利润";
    const humanNonWinner = nonWinners.find((p: { isSelf: boolean }) => p.isSelf);

    if (winnerProfit < 0) {
      dividendPerPlayer = Math.round(Math.abs(winnerProfit) * DIVIDEND_RATIO);
      nonWinners.forEach((p: { id: string; isSelf: boolean }) => {
        if (p.isSelf) {
          self.playerMoney += dividendPerPlayer;
        } else {
          const wallet = self.getAiWallet(p.id);
          self.aiWallets[p.id] = wallet + dividendPerPlayer;
        }
      });
      if (humanNonWinner) {
        selfProfit = dividendPerPlayer;
        selfProfitLabel = "自身利润（分红）";
      }
    } else if (winnerProfit > 0) {
      ticketPerPlayer = Math.round(winnerProfit * TICKET_RATIO);
      nonWinners.forEach((p: { id: string; isSelf: boolean }) => {
        if (p.isSelf) {
          self.playerMoney -= ticketPerPlayer;
        } else {
          const wallet = self.getAiWallet(p.id);
          self.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer);
        }
      });
      if (humanNonWinner) {
        selfProfit = -ticketPerPlayer;
        selfProfitLabel = "自身利润（门票）";
      }
    }

    const dividendTicketInfo = {
      dividendPerPlayer,
      ticketPerPlayer,
      mechanism: dividendPerPlayer > 0 ? "dividend" : ticketPerPlayer > 0 ? "ticket" : "none"
    };

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
      await self.revealAllArtifactsForSettlement();
    } catch (revealError) {
      self.writeLog(`揭示藏品时发生异常：${revealError && (revealError as Error).message ? (revealError as Error).message : "未知错误"}`);
      if (typeof console !== "undefined" && console.error) {
        console.error("revealAllArtifactsForSettlement failed", revealError);
      }
    }

    if (self.isLanMode) {
      const lanSelfNonWinner = nonWinners.find((p: { isSelf: boolean }) => p.isSelf);
      let lanSelfProfit = 0;
      let lanSelfProfitLabel = "自身利润";

      if (winnerProfit < 0) {
        if (lanSelfNonWinner) {
          if (self.lanIsHost) {
            self.playerMoney += dividendPerPlayer;
          }
          lanSelfProfit = dividendPerPlayer;
          lanSelfProfitLabel = "自身利润（分红）";
          self.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`);
        }
        if (self.lanIsHost) {
          nonWinners.forEach((p: { id: string; isSelf: boolean; isAI?: boolean; lanId?: string }) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = self.lanHostWallets[p.lanId || ""] || 0;
              self.lanHostWallets[p.lanId || ""] = wallet + dividendPerPlayer;
            } else if (p.isAI) {
              const wallet = self.getAiWallet(p.id);
              self.aiWallets[p.id] = wallet + dividendPerPlayer;
            }
          });
        }
      } else if (winnerProfit > 0) {
        if (lanSelfNonWinner) {
          if (self.lanIsHost) {
            self.playerMoney -= ticketPerPlayer;
          }
          lanSelfProfit = -ticketPerPlayer;
          lanSelfProfitLabel = "自身利润（门票）";
          self.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`);
        }
        if (self.lanIsHost) {
          nonWinners.forEach((p: { id: string; isSelf: boolean; isAI?: boolean; lanId?: string }) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = self.lanHostWallets[p.lanId || ""] || 0;
              self.lanHostWallets[p.lanId || ""] = Math.max(0, wallet - ticketPerPlayer);
            } else if (p.isAI) {
              const wallet = self.getAiWallet(p.id);
              self.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer);
            }
          });
        }
      }

      self.updateSettlementPanelMetrics(totalValue, winnerProfit);
      if (lanSelfNonWinner) {
        self.showSelfProfit(lanSelfProfit, lanSelfProfitLabel);
      }
      self.setSettlementProgress(
        `揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`,
        100
      );
      self.triggerSettlementFinalAnimation(winnerProfit, winnerPlayer.isSelf);
      self.writeLog(
        `联机结算：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
      );

      self.saveBattleRecord({
        mode,
        winnerId: winnerPlayer.id,
        winnerName: winnerPlayer.name,
        winnerBid,
        totalValue,
        winnerProfit,
        playerProfit: winnerPlayer.isSelf ? winnerProfit : lanSelfProfit,
        playerWon: winnerPlayer.isSelf && winnerProfit > 0,
        dividendTicketInfo: dividendPerPlayer > 0 || ticketPerPlayer > 0 ? dividendTicketInfo : null,
        reasonText: "联机结算"
      });
      return;
    }

    if (humanNonWinner) {
      if (dividendPerPlayer > 0) {
        self.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`);
      } else if (ticketPerPlayer > 0) {
        self.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`);
      }
    }

    self.updateSettlementPanelMetrics(totalValue, winnerProfit);
    if (humanNonWinner) {
      self.showSelfProfit(selfProfit, selfProfitLabel);
    }
    self.setSettlementProgress(
      `揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`,
      100
    );
    self.triggerSettlementFinalAnimation(winnerProfit, winnerPlayer.isSelf);
    self.saveBattleRecord({
      mode,
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      playerProfit: winnerPlayer.isSelf ? winnerProfit : selfProfit,
      playerWon: winnerPlayer.isSelf && winnerProfit > 0,
      dividendTicketInfo: dividendPerPlayer > 0 || ticketPerPlayer > 0 ? dividendTicketInfo : null,
      reasonText: reasonTextMap[mode] || "结算"
    });

    self.saveAiWalletsToStorage();

    self.pushRunSettlementContextToAi({
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    });

    if (winnerPlayer.isSelf) {
      if (!self.hasAppliedMoneyForRun()) {
        self.playerMoney += winnerProfit;
        savePlayerMoney(self.playerMoney);
        self.markMoneyAppliedForRun();
      }
      self.writeLog(
        `结算完成：你以 ${winnerBid} 拿下整仓，${winnerProfit >= 0 ? "盈利" : "亏损"} ${Math.abs(winnerProfit)}。`
      );
    } else {
      savePlayerMoney(self.playerMoney);
      self.writeLog(
        `结算完成：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
      );
    }

    const selfPlayer = self.players.find((p: { isSelf: boolean }) => p.isSelf);
    if (selfPlayer && recordGameFinished) {
      const playerIsWinner = winnerPlayer.isSelf;
      const playerProfit = playerIsWinner ? winnerProfit : selfProfit;
      const playerWon = playerIsWinner && winnerProfit > 0;
      recordGameFinished(playerWon, playerProfit);
    }

    self.updateHud();
  }
}