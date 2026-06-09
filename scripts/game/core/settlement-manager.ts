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
 */

const { savePlayerMoney } = window.MobaoSettings

export const SettlementManagerMixin = {
  async finishAuction(winner, mode) {
    const winnerPlayer = this.players.find((player) => player.id === winner.playerId)
    const winnerBid = winner.bid

    this.currentBid = winnerBid
    this.bidLeader = winner.playerId
    this.settled = true
    this.stopRoundTimer()
    const reasonTextMap = {
      direct: "提前拿下",
      final: "最终回合高价胜出",
      manual: "手动结算"
    }

    this.enterSettlementPage(winnerPlayer, winnerBid, reasonTextMap[mode] || "结算")

    const totalValue = this.warehouseTrueValue
    const winnerProfit = totalValue - winnerBid

    const DIVIDEND_RATIO = 0.15
    const TICKET_RATIO = 0.05
    const nonWinners = this.players.filter((p) => p.id !== winnerPlayer.id)
    let dividendPerPlayer = 0
    let ticketPerPlayer = 0
    let selfProfit = 0
    let selfProfitLabel = "自身利润"
    const humanNonWinner = nonWinners.find((p) => p.isSelf)

    if (winnerProfit < 0) {
      dividendPerPlayer = Math.round(Math.abs(winnerProfit) * DIVIDEND_RATIO)
      nonWinners.forEach((p) => {
        if (p.isSelf) {
          this.playerMoney += dividendPerPlayer
        } else {
          const wallet = this.getAiWallet(p.id)
          this.aiWallets[p.id] = wallet + dividendPerPlayer
        }
      })
      if (humanNonWinner) {
        selfProfit = dividendPerPlayer
        selfProfitLabel = "自身利润（分红）"
      }
    } else if (winnerProfit > 0) {
      ticketPerPlayer = Math.round(winnerProfit * TICKET_RATIO)
      nonWinners.forEach((p) => {
        if (p.isSelf) {
          this.playerMoney -= ticketPerPlayer
        } else {
          const wallet = this.getAiWallet(p.id)
          this.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer)
        }
      })
      if (humanNonWinner) {
        selfProfit = -ticketPerPlayer
        selfProfitLabel = "自身利润（门票）"
      }
    }

    const dividendTicketInfo = {
      dividendPerPlayer,
      ticketPerPlayer,
      mechanism: dividendPerPlayer > 0 ? "dividend" : ticketPerPlayer > 0 ? "ticket" : "none"
    }

    const settlementResult = {
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    }
    const crossGameRecord = this.createCrossGameRecord(settlementResult)
    this.triggerAiReflection(crossGameRecord).catch(() => { })

    try {
      await this.revealAllArtifactsForSettlement()
    } catch (revealError) {
      this.writeLog(`揭示藏品时发生异常：${revealError && revealError.message ? revealError.message : "未知错误"}`)
      if (typeof console !== "undefined" && console.error) {
        console.error("revealAllArtifactsForSettlement failed", revealError)
      }
    }

    if (this.isLanMode) {
      const lanSelfNonWinner = nonWinners.find((p) => p.isSelf)
      let lanSelfProfit = 0
      let lanSelfProfitLabel = "自身利润"

      if (winnerProfit < 0) {
        if (lanSelfNonWinner) {
          if (this.lanIsHost) {
            this.playerMoney += dividendPerPlayer
          }
          lanSelfProfit = dividendPerPlayer
          lanSelfProfitLabel = "自身利润（分红）"
          this.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`)
        }
        if (this.lanIsHost) {
          nonWinners.forEach((p) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = this.lanHostWallets[p.lanId] || 0
              this.lanHostWallets[p.lanId] = wallet + dividendPerPlayer
            } else if (p.isAI) {
              const wallet = this.getAiWallet(p.id)
              this.aiWallets[p.id] = wallet + dividendPerPlayer
            }
          })
        }
      } else if (winnerProfit > 0) {
        if (lanSelfNonWinner) {
          if (this.lanIsHost) {
            this.playerMoney -= ticketPerPlayer
          }
          lanSelfProfit = -ticketPerPlayer
          lanSelfProfitLabel = "自身利润（门票）"
          this.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`)
        }
        if (this.lanIsHost) {
          nonWinners.forEach((p) => {
            if (!p.isSelf && !p.isAI) {
              const wallet = this.lanHostWallets[p.lanId] || 0
              this.lanHostWallets[p.lanId] = Math.max(0, wallet - ticketPerPlayer)
            } else if (p.isAI) {
              const wallet = this.getAiWallet(p.id)
              this.aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer)
            }
          })
        }
      }

      this.updateSettlementPanelMetrics(totalValue, winnerProfit)
      if (lanSelfNonWinner) {
        this.showSelfProfit(lanSelfProfit, lanSelfProfitLabel)
      }
      this.setSettlementProgress(
        `揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`
      )
      this.triggerSettlementFinalAnimation(winnerProfit, winnerPlayer.isSelf)
      this.writeLog(
        `联机结算：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
      )

      this.saveBattleRecord({
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
      })
      return
    }

    if (humanNonWinner) {
      if (dividendPerPlayer > 0) {
        this.writeLog(`分红：拍下者亏损，非拍下者各获得亏损的15%（+${dividendPerPlayer}）。`)
      } else if (ticketPerPlayer > 0) {
        this.writeLog(`门票：拍下者盈利，非拍下者各扣除盈利的5%（-${ticketPerPlayer}）。`)
      }
    }

    this.updateSettlementPanelMetrics(totalValue, winnerProfit)
    if (humanNonWinner) {
      this.showSelfProfit(selfProfit, selfProfitLabel)
    }
    this.setSettlementProgress(
      `揭示完成：${winnerPlayer.name} 的最终利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}`
    )
    this.triggerSettlementFinalAnimation(winnerProfit, winnerPlayer.isSelf)
    this.saveBattleRecord({
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
    })

    this.saveAiWalletsToStorage()

    this.pushRunSettlementContextToAi({
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    })

    if (winnerPlayer.isSelf) {
      if (!this.hasAppliedMoneyForRun()) {
        this.playerMoney += winnerProfit
        savePlayerMoney(this.playerMoney)
        this.markMoneyAppliedForRun()
      }
      this.writeLog(
        `结算完成：你以 ${winnerBid} 拿下整仓，${winnerProfit >= 0 ? "盈利" : "亏损"} ${Math.abs(winnerProfit)}。`
      )
    } else {
      savePlayerMoney(this.playerMoney)
      this.writeLog(
        `结算完成：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
      )
    }

    const selfPlayer = this.players.find((p) => p.isSelf)
    if (selfPlayer && window.MobaoAppState) {
      const playerIsWinner = winnerPlayer.isSelf
      const playerProfit = playerIsWinner ? winnerProfit : selfProfit
      const playerWon = playerIsWinner && winnerProfit > 0
      window.MobaoAppState.recordGameFinished(playerWon, playerProfit)
    }

    this.updateHud()
  }
}

// 兼容层
;(window as any).MobaoSettlementManager = SettlementManagerMixin