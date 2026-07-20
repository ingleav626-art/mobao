/**
 * @file settlement-manager-class.ts
 * @module core/settlement-manager-class
 * @description SettlementManager -- 结算管理器（Phase 2 依赖注入）。
 *              包装 settlement-manager.ts 的纯函数与结算编排逻辑，通过构造函数注入依赖
 *              （players/playerMoney/aiWallets/lanHostWallets 等），替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测（构造函数注入 mock 依赖），过渡期 Mixin 保留为薄代理层。
 */
import {
  calculateDividendTicket,
  getSelfProfitInfo,
  buildDividendTicketLog,
  type SelfProfitInfo
} from "./settlement-manager"
import { savePlayerMoney } from "./player-money"
import { recordGameFinished } from "./app-state"
import { calcIdentityFinal, type BonusEffect } from "./bonus"
import { applyPassiveEffect } from "../data/character-system"
import { useSettlementStore } from "../../vue/stores/settlementStore"
import { createLogger } from "./logger"
const log = createLogger("Settlement")

/** 结算玩家（含联机字段） */
export interface SettlementPlayer {
  id: string
  isSelf: boolean
  name: string
  isAI?: boolean
  lanId?: string
}

/** 分红/门票信息 */
export interface DividendTicketInfo {
  dividendPerPlayer: number
  ticketPerPlayer: number
  mechanism: "dividend" | "ticket" | "none"
}

/** 结算结果（传入 createCrossGameRecord） */
export interface SettlementResult {
  winnerId: string
  winnerName: string
  winnerBid: number
  totalValue: number
  winnerProfit: number
  reasonText: string
  dividendTicketInfo: DividendTicketInfo
}

/** 结算上下文（prepareFinishAuction 生成，各 helper 消费） */
export interface FinishAuctionContext {
  winnerPlayer: SettlementPlayer
  winnerBid: number
  mode: string
  reasonText: string
  totalValue: number
  winnerProfit: number
  dividendPerPlayer: number
  ticketPerPlayer: number
  dividendTicketInfo: DividendTicketInfo
  nonWinners: SettlementPlayer[]
  humanNonWinner: SettlementPlayer | undefined
  selfProfitInfo: SelfProfitInfo
}

/** 战绩记录载荷 */
export interface BattleRecordPayload {
  mode: string
  winnerId: string
  winnerName: string
  winnerBid: number
  totalValue: number
  winnerProfit: number
  playerProfit: number
  playerWon: boolean
  dividendTicketInfo: DividendTicketInfo | null
  reasonText: string
}

/** 推送给 AI 的结算上下文 */
export interface SettlementAiContext {
  winnerId: string
  winnerName: string
  winnerBid: number
  totalValue: number
  winnerProfit: number
  reasonText: string
  dividendTicketInfo: DividendTicketInfo
}

/** SettlementManager 依赖接口 */
export interface SettlementManagerDeps {
  /** 获取玩家列表（可能被场景重新赋值，用 getter） */
  getPlayers: () => SettlementPlayer[]
  /** 玩家资金（读+写，prepareFinishAuction/finishAuctionLan/finishAuctionSingle 都会修改） */
  getPlayerMoney: () => number
  setPlayerMoney: (n: number) => void
  /** 获取 AI 钱包映射（可变引用，直接 mutate 写入） */
  getAiWallets: () => Record<string, number>
  /** 获取联机主机钱包映射（可变引用，直接 mutate 写入） */
  getLanHostWallets: () => Record<string, number>
  /** 获取仓库真实价值 */
  getWarehouseTrueValue: () => number
  /** 是否联机模式 */
  getIsLanMode: () => boolean
  /** 是否联机主机 */
  getLanIsHost: () => boolean
  /** 设置 currentBid（prepareFinishAuction 写回场景） */
  setCurrentBid: (bid: number) => void
  /** 设置 bidLeader（prepareFinishAuction 写回场景） */
  setBidLeader: (id: string) => void
  /** 设置 settled 标志（prepareFinishAuction 写回场景） */
  setSettled: (b: boolean) => void

  /** 停止回合计时器 */
  stopRoundTimer: () => void
  /** 进入结算页面 */
  enterSettlementPage: (player: { isSelf: boolean; name: string }, bid: number, reason: string) => void
  /** 更新结算面板指标 */
  updateSettlementPanelMetrics: (totalValue: number, winnerProfit: number, isSelfWinner?: boolean) => void
  /** 显示自身利润 */
  showSelfProfit: (profit: number, label: string, adjustedProfit?: number) => void
  /** 设置结算进度 */
  setSettlementProgress: (step: string, progress: number) => void
  /** 触发结算终局动画 */
  triggerSettlementFinalAnimation: (profit: number, isSelf: boolean) => void
  /** 揭示所有藏品（异步） */
  revealAllArtifactsForSettlement: () => Promise<void>
  /** 保存战绩 */
  saveBattleRecord: (record: BattleRecordPayload) => void
  /** 保存 AI 钱包到存储 */
  saveAiWalletsToStorage: () => void
  /** 推送结算上下文到 AI */
  pushRunSettlementContextToAi: (context: SettlementAiContext) => void
  /** 创建跨局记忆记录 */
  createCrossGameRecord: (result: SettlementResult) => unknown
  /** 触发 AI 反思（异步，失败静默） */
  triggerAiReflection: (record: unknown) => Promise<void>
  /** 检查本局是否已入账 */
  hasAppliedMoneyForRun: () => boolean
  /** 标记本局已入账 */
  markMoneyAppliedForRun: () => void
  /** 写入操作日志 */
  writeLog: (msg: string) => void
  /** 刷新 HUD */
  updateHud: () => void
  /** 获取 AI 钱包余额 */
  getAiWallet: (id: string) => number
  /** 获取加成效果列表 */
  getBonusEffects: () => BonusEffect[]
}

/**
 * 结算管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * finishAuction 编排 prepareFinishAuction -> finishAuctionLan/finishAuctionSingle，
 * 共享 updateSettlementFinalUI/saveSettlementBattleRecord helper。
 * 纯函数 calculateDividendTicket/getSelfProfitInfo/buildDividendTicketLog 委托 settlement-manager.ts。
 */
export class SettlementManager {
  constructor(private readonly deps: SettlementManagerDeps) {}

  /** 结算主流程编排器：prepare -> LAN/单机分发 */
  async finishAuction(winner: { playerId: string; bid: number }, mode: string): Promise<void> {
    const ctx = await this.prepareFinishAuction(winner, mode)
    if (!ctx) return
    if (this.deps.getIsLanMode()) {
      this.finishAuctionLan(ctx)
    } else {
      this.finishAuctionSingle(ctx)
    }
  }

  /** 准备结算上下文：计算利润/分红/门票，更新钱包，触发 AI 反思，揭示藏品 */
  async prepareFinishAuction(
    winner: { playerId: string; bid: number },
    mode: string
  ): Promise<FinishAuctionContext | null> {
    const players = this.deps.getPlayers()
    const winnerPlayer = players.find((p) => p.id === winner.playerId)
    if (!winnerPlayer) {
      this.deps.writeLog(`结算失败：找不到赢家玩家 ${winner.playerId}`)
      return null
    }
    const winnerBid = winner.bid

    this.deps.setCurrentBid(winnerBid)
    this.deps.setBidLeader(winner.playerId)
    this.deps.setSettled(true)
    this.deps.stopRoundTimer()
    const reasonTextMap: Record<string, string> = {
      direct: "提前拿下",
      final: "最终回合高价胜出",
      manual: "手动结算"
    }

    this.deps.enterSettlementPage(winnerPlayer, winnerBid, reasonTextMap[mode] || "结算")

    const totalValue = this.deps.getWarehouseTrueValue()
    const { winnerProfit, dividendPerPlayer, ticketPerPlayer, mechanism } = calculateDividendTicket(
      totalValue,
      winnerBid
    )

    const bonusEffects = this.deps.getBonusEffects()

    const nonWinners = players.filter((p) => p.id !== winnerPlayer.id)
    const humanNonWinner = nonWinners.find((p) => p.isSelf)
    const isWinner = winnerPlayer.isSelf
    const selfProfitInfo = getSelfProfitInfo(winnerProfit, dividendPerPlayer, ticketPerPlayer, isWinner)

    if (dividendPerPlayer > 0) {
      const aiWallets = this.deps.getAiWallets()
      nonWinners.forEach((p) => {
        const adjusted = calcIdentityFinal("nonwinner/dividend", winnerProfit, bonusEffects)
        if (p.isSelf) {
          this.deps.setPlayerMoney(this.deps.getPlayerMoney() + adjusted)
        } else {
          const wallet = this.deps.getAiWallet(p.id)
          aiWallets[p.id] = wallet + adjusted
        }
      })
    } else if (ticketPerPlayer > 0) {
      const aiWallets = this.deps.getAiWallets()
      nonWinners.forEach((p) => {
        const adjusted = calcIdentityFinal("nonwinner/ticket", winnerProfit, bonusEffects)
        if (p.isSelf) {
          this.deps.setPlayerMoney(this.deps.getPlayerMoney() + adjusted)
        } else {
          const wallet = this.deps.getAiWallet(p.id)
          aiWallets[p.id] = Math.max(0, wallet + adjusted)
        }
      })
    }

    const dividendTicketInfo: DividendTicketInfo = { dividendPerPlayer, ticketPerPlayer, mechanism }

    const settlementResult: SettlementResult = {
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    }
    // 先推送结算上下文（含 Layer⑪ 追加、跨局消息归档），再触发反思/总结。
    // 顺序很重要：反思/总结的清空与 Layer⑪ 追加依赖 push 已写入的 crossGameMessages/pendingSummary。
    this.deps.pushRunSettlementContextToAi({
      winnerId: winnerPlayer.id,
      winnerName: winnerPlayer.name,
      winnerBid,
      totalValue,
      winnerProfit,
      reasonText: reasonTextMap[mode] || "结算",
      dividendTicketInfo
    })
    const crossGameRecord = this.deps.createCrossGameRecord(settlementResult)
    this.deps.triggerAiReflection(crossGameRecord).catch(() => {})

    try {
      await this.deps.revealAllArtifactsForSettlement()
    } catch (revealError) {
      this.deps.writeLog(
        `揭示藏品时发生异常：${revealError && (revealError as Error).message ? (revealError as Error).message : "未知错误"}`
      )
      log.error("revealAllArtifactsForSettlement failed", revealError)
    }

    // 桥接：同步结算数据到 Vue settlementStore
    try {
      const settlementStore = useSettlementStore()
      settlementStore.showSettlement(
        { id: winnerPlayer.id, name: winnerPlayer.name },
        winnerBid,
        totalValue,
        winnerProfit,
        0,
        dividendTicketInfo.mechanism
      )
      log.info(
        "prepareFinishAuction: Vue settlementStore 已同步, winner=" +
        winnerPlayer.name + ", bid=" + winnerBid +
        ", totalValue=" + totalValue + ", profit=" + winnerProfit +
        ", mechanism=" + dividendTicketInfo.mechanism
      )
    } catch (_bridgeErr) {
      // Vue store 未就绪时静默失败
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
    }
  }

  /** 联机结算：主机同步钱包，面板更新，战绩保存 */
  finishAuctionLan(ctx: FinishAuctionContext): void {
    const { winnerPlayer, winnerBid, winnerProfit, dividendPerPlayer, ticketPerPlayer, nonWinners } = ctx
    const lanSelfNonWinner = ctx.humanNonWinner
    const lanSelfProfitInfo = getSelfProfitInfo(winnerProfit, dividendPerPlayer, ticketPerPlayer, false)

    // 联机 AI 赢家钱包：主机应用盈亏（含加成道具），与单机一致。之前联机 AI 赢家钱包不更新。
    if (this.deps.getLanIsHost() && !winnerPlayer.isSelf && winnerPlayer.isAI) {
      const bonusEffects = this.deps.getBonusEffects()
      const identity: "winner/profit" | "winner/loss" = winnerProfit > 0 ? "winner/profit" : "winner/loss"
      const adjustedWinnerProfit = calcIdentityFinal(identity, winnerProfit, bonusEffects)
      const aiWallets = this.deps.getAiWallets()
      const winnerWallet = this.deps.getAiWallet(winnerPlayer.id)
      aiWallets[winnerPlayer.id] = Math.max(0, winnerWallet + adjustedWinnerProfit)
    }

    if (dividendPerPlayer > 0) {
      if (lanSelfNonWinner) {
        if (this.deps.getLanIsHost()) {
          this.deps.setPlayerMoney(this.deps.getPlayerMoney() + dividendPerPlayer)
        }
        this.deps.writeLog(buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)!)
      }
      if (this.deps.getLanIsHost()) {
        const lanHostWallets = this.deps.getLanHostWallets()
        const aiWallets = this.deps.getAiWallets()
        nonWinners.forEach((p) => {
          if (!p.isSelf && !p.isAI) {
            const wallet = lanHostWallets[p.lanId || ""] || 0
            lanHostWallets[p.lanId || ""] = wallet + dividendPerPlayer
          } else if (p.isAI) {
            const wallet = this.deps.getAiWallet(p.id)
            aiWallets[p.id] = wallet + dividendPerPlayer
          }
        })
      }
    } else if (ticketPerPlayer > 0) {
      if (lanSelfNonWinner) {
        if (this.deps.getLanIsHost()) {
          this.deps.setPlayerMoney(this.deps.getPlayerMoney() - ticketPerPlayer)
        }
        this.deps.writeLog(buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)!)
      }
      if (this.deps.getLanIsHost()) {
        const lanHostWallets = this.deps.getLanHostWallets()
        const aiWallets = this.deps.getAiWallets()
        nonWinners.forEach((p) => {
          if (!p.isSelf && !p.isAI) {
            const wallet = lanHostWallets[p.lanId || ""] || 0
            lanHostWallets[p.lanId || ""] = Math.max(0, wallet - ticketPerPlayer)
          } else if (p.isAI) {
            const wallet = this.deps.getAiWallet(p.id)
            aiWallets[p.id] = Math.max(0, wallet - ticketPerPlayer)
          }
        })
      }
    }

    this.updateSettlementFinalUI(ctx, lanSelfProfitInfo)
    this.deps.writeLog(
      `联机结算：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${winnerProfit >= 0 ? "+" : ""}${winnerProfit}。`
    )

    this.saveSettlementBattleRecord(ctx, winnerPlayer.isSelf ? winnerProfit : lanSelfProfitInfo.profit, "联机结算")

    // 主机持久化 AI 钱包（含赢家盈亏加成与非赢家分红/门票）。之前联机结算未保存 AI 钱包。
    if (this.deps.getLanIsHost()) {
      this.deps.saveAiWalletsToStorage()
    }
  }

  /** 单机结算：战绩保存，AI 钱包持久化，结算上下文推送，赢家利润入账，recordGameFinished */
  finishAuctionSingle(ctx: FinishAuctionContext): void {
    const {
      winnerPlayer,
      winnerBid,
      totalValue,
      winnerProfit,
      dividendPerPlayer,
      ticketPerPlayer,
      reasonText,
      selfProfitInfo,
      dividendTicketInfo
    } = ctx

    const bonusEffects = this.deps.getBonusEffects()
    const isSelfWinner = winnerPlayer.isSelf
    const identity: "winner/profit" | "winner/loss" = winnerProfit > 0 ? "winner/profit" : "winner/loss"
    const adjustedWinnerProfit = calcIdentityFinal(identity, winnerProfit, bonusEffects)

    // AI 赢家钱包：应用盈亏（含加成道具效果，如厄运符咒/群体祝福）。人类赢家在下方 isSelfWinner 分支更新。
    // 之前 AI 赢家钱包不更新，导致 AI 盈亏与加成道具对 AI 赢家无效。
    if (!isSelfWinner && winnerPlayer.isAI) {
      const aiWallets = this.deps.getAiWallets()
      const winnerWallet = this.deps.getAiWallet(winnerPlayer.id)
      aiWallets[winnerPlayer.id] = Math.max(0, winnerWallet + adjustedWinnerProfit)
    }

    let adjustedSelfProfit: number
    let selfLabel: string
    let rawSelfProfit: number
    if (isSelfWinner) {
      const passive = winnerProfit > 0 ? applyPassiveEffect({ profit: winnerProfit }) : { bonus: 0, label: "" }
      adjustedSelfProfit = adjustedWinnerProfit + passive.bonus
      rawSelfProfit = winnerProfit
      selfLabel = "自身利润"
    } else {
      const nonWinnerIdentity: "nonwinner/ticket" | "nonwinner/dividend" =
        winnerProfit > 0 ? "nonwinner/ticket" : "nonwinner/dividend"
      adjustedSelfProfit = calcIdentityFinal(nonWinnerIdentity, winnerProfit, bonusEffects)
      rawSelfProfit = winnerProfit > 0 ? -(winnerProfit * 0.05) : Math.abs(winnerProfit) * 0.15
      selfLabel = winnerProfit > 0 ? "自身利润（门票）" : "自身利润（分红）"
    }

    const logMsg = buildDividendTicketLog(winnerProfit, dividendPerPlayer, ticketPerPlayer)
    if (ctx.humanNonWinner && logMsg) {
      this.deps.writeLog(logMsg)
    }

    this.deps.updateSettlementPanelMetrics(ctx.totalValue, adjustedWinnerProfit, isSelfWinner)
    this.deps.showSelfProfit(adjustedSelfProfit, selfLabel, adjustedSelfProfit !== rawSelfProfit ? adjustedSelfProfit : undefined)

    this.saveSettlementBattleRecord(ctx, adjustedSelfProfit, reasonText)

    this.deps.saveAiWalletsToStorage()

    if (isSelfWinner) {
      if (!this.deps.hasAppliedMoneyForRun()) {
        this.deps.setPlayerMoney(this.deps.getPlayerMoney() + adjustedWinnerProfit)
        savePlayerMoney(this.deps.getPlayerMoney())
        this.deps.markMoneyAppliedForRun()
      }
      this.deps.writeLog(
        `结算完成：你以 ${winnerBid} 拿下整仓，${winnerProfit >= 0 ? "盈利" : "亏损"} ${Math.abs(adjustedWinnerProfit)}。`
      )
    } else {
      savePlayerMoney(this.deps.getPlayerMoney())
      this.deps.writeLog(
        `结算完成：${winnerPlayer.name} 以 ${winnerBid} 拿下整仓，利润 ${adjustedWinnerProfit >= 0 ? "+" : ""}${adjustedWinnerProfit}。`
      )
    }

    const selfPlayer = this.deps.getPlayers().find((p) => p.isSelf)
    if (selfPlayer && recordGameFinished) {
      const playerWon = isSelfWinner && winnerProfit > 0
      recordGameFinished(playerWon, adjustedSelfProfit)
    }

    this.deps.updateHud()
  }

  /** 更新结算终局 UI：面板指标/自身利润/进度/终局动画 */
  updateSettlementFinalUI(ctx: FinishAuctionContext, profitInfo: SelfProfitInfo): void {
    this.deps.updateSettlementPanelMetrics(ctx.totalValue, ctx.winnerProfit)
    if (ctx.humanNonWinner) {
      this.deps.showSelfProfit(profitInfo.profit, profitInfo.label)
    }
    this.deps.setSettlementProgress(
      `揭示完成：${ctx.winnerPlayer.name} 的最终利润 ${ctx.winnerProfit >= 0 ? "+" : ""}${ctx.winnerProfit}`,
      100
    )
    this.deps.triggerSettlementFinalAnimation(ctx.winnerProfit, ctx.winnerPlayer.isSelf)

    // 桥接：同步最终结算数据到 Vue settlementStore
    try {
      const settlementStore = useSettlementStore()
      settlementStore.updateSettlementData(ctx.totalValue, ctx.winnerProfit)
      settlementStore.updateProgress(1)
      if (ctx.humanNonWinner || profitInfo.profit !== 0) {
        settlementStore.setPlayerProfit(profitInfo.profit, profitInfo.label)
      }
      log.info(
        "updateSettlementFinalUI: profit=" + ctx.winnerProfit +
        ", playerProfit=" + profitInfo.profit +
        ", label=" + profitInfo.label
      )
    } catch (_bridgeErr) {
      // Vue store 未就绪时静默失败
    }
  }

  /** 保存结算战绩记录 */
  saveSettlementBattleRecord(ctx: FinishAuctionContext, playerProfit: number, reasonText: string): void {
    const {
      winnerPlayer,
      winnerBid,
      totalValue,
      winnerProfit,
      dividendPerPlayer,
      ticketPerPlayer,
      mode,
      dividendTicketInfo
    } = ctx
    this.deps.saveBattleRecord({
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
    })
  }
}
