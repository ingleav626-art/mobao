import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  SettlementManager,
  type SettlementManagerDeps,
  type FinishAuctionContext,
  type SettlementPlayer
} from "../../../scripts/game/core/settlement-manager-class"
import { calculateDividendTicket, getSelfProfitInfo } from "../../../scripts/game/core/settlement-manager"
// 真实数据类型与纯函数（测试原则：用真实数据类型与纯函数替代 mock）
import type { BonusEffect } from "../../../scripts/game/core/bonus"

/** 构建默认玩家列表：1 人类 + 2 AI */
function makePlayers(): SettlementPlayer[] {
  return [
    { id: "p1", isSelf: true, name: "玩家" },
    { id: "p2", isSelf: false, name: "AI甲", isAI: true },
    { id: "p3", isSelf: false, name: "AI乙", isAI: true }
  ]
}

/** 构建联机玩家列表：1 人类 + 1 联机人类 + 1 AI */
function makeLanPlayers(): SettlementPlayer[] {
  return [
    { id: "p1", isSelf: true, name: "主机玩家" },
    { id: "p2", isSelf: false, name: "联机玩家", lanId: "lan-p2" },
    { id: "p3", isSelf: false, name: "AI玩家", isAI: true }
  ]
}

/** 构建完整 mock 依赖 */
function makeDeps(overrides: Partial<SettlementManagerDeps> = {}) {
  let playerMoney = 10000
  const aiWallets: Record<string, number> = { p2: 5000, p3: 3000 }
  const lanHostWallets: Record<string, number> = { "lan-p2": 8000 }
  const players = makePlayers()
  // 真实链路：bonusEffects 数组对应 state.game.bonusEffects（game-slice.ts 初始为 []）
  // getBonusEffects 返回该数组引用，与 warehouse-scene.ts:917 真实实现一致
  // 通过 applyBonusEffect 真实函数写入（测试需要时调用）
  const bonusEffects: BonusEffect[] = []

  const deps: SettlementManagerDeps = {
    getPlayers: () => players,
    getPlayerMoney: () => playerMoney,
    setPlayerMoney: (n: number) => {
      playerMoney = n
    },
    getAiWallets: () => aiWallets,
    getLanHostWallets: () => lanHostWallets,
    getWarehouseTrueValue: () => 100000,
    getIsLanMode: () => false,
    getLanIsHost: () => false,
    getBonusEffects: () => bonusEffects,
    setCurrentBid: vi.fn(),
    setBidLeader: vi.fn(),
    setSettled: vi.fn(),
    stopRoundTimer: vi.fn(),
    enterSettlementPage: vi.fn(),
    updateSettlementPanelMetrics: vi.fn(),
    showSelfProfit: vi.fn(),
    setSettlementProgress: vi.fn(),
    triggerSettlementFinalAnimation: vi.fn(),
    revealAllArtifactsForSettlement: vi.fn().mockResolvedValue(undefined),
    saveBattleRecord: vi.fn(),
    saveAiWalletsToStorage: vi.fn(),
    pushRunSettlementContextToAi: vi.fn(),
    createCrossGameRecord: vi.fn().mockReturnValue({ record: "mock" }),
    triggerAiReflection: vi.fn().mockResolvedValue(undefined),
    hasAppliedMoneyForRun: vi.fn().mockReturnValue(false),
    markMoneyAppliedForRun: vi.fn(),
    writeLog: vi.fn(),
    updateHud: vi.fn(),
    getAiWallet: (id: string) => aiWallets[id] ?? 0,
    ...overrides
  }

  return {
    deps,
    getPlayerMoney: () => playerMoney,
    setPlayerMoney: (n: number) => {
      playerMoney = n
    },
    aiWallets,
    lanHostWallets,
    players,
    bonusEffects,
    setPlayers: (p: SettlementPlayer[]) => {
      players.length = 0
      players.push(...p)
    }
  }
}

/** 构建结算上下文（用于直接测试 helper 方法） */
function makeContext(overrides: Partial<FinishAuctionContext> = {}): FinishAuctionContext {
  const totalValue = 100000
  const winnerBid = 80000
  const { winnerProfit, dividendPerPlayer, ticketPerPlayer, mechanism } = calculateDividendTicket(totalValue, winnerBid)
  const winnerPlayer: SettlementPlayer = { id: "p2", isSelf: false, name: "AI甲", isAI: true }
  const nonWinners = makePlayers().filter((p) => p.id !== winnerPlayer.id)
  const humanNonWinner = nonWinners.find((p) => p.isSelf)
  const selfProfitInfo = getSelfProfitInfo(winnerProfit, dividendPerPlayer, ticketPerPlayer, false)
  return {
    winnerPlayer,
    winnerBid,
    mode: "final",
    reasonText: "最终回合高价胜出",
    totalValue,
    winnerProfit,
    dividendPerPlayer,
    ticketPerPlayer,
    dividendTicketInfo: { dividendPerPlayer, ticketPerPlayer, mechanism },
    nonWinners,
    humanNonWinner,
    selfProfitInfo,
    ...overrides
  }
}

describe("SettlementManager", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null
      },
      setItem(key: string, value: string) {
        this.store[key] = value
      },
      removeItem(key: string) {
        delete this.store[key]
      },
      clear() {
        this.store = {}
      }
    })
  })

  describe("finishAuction 编排", () => {
    it("单机模式调用 finishAuctionSingle", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const singleSpy = vi.spyOn(manager, "finishAuctionSingle")
      const lanSpy = vi.spyOn(manager, "finishAuctionLan")
      await manager.finishAuction({ playerId: "p1", bid: 80000 }, "final")
      expect(singleSpy).toHaveBeenCalledOnce()
      expect(lanSpy).not.toHaveBeenCalled()
    })

    it("联机模式调用 finishAuctionLan", async () => {
      const ctx = makeDeps({ getIsLanMode: () => true })
      const manager = new SettlementManager(ctx.deps)
      const singleSpy = vi.spyOn(manager, "finishAuctionSingle")
      const lanSpy = vi.spyOn(manager, "finishAuctionLan")
      await manager.finishAuction({ playerId: "p1", bid: 80000 }, "final")
      expect(lanSpy).toHaveBeenCalledOnce()
      expect(singleSpy).not.toHaveBeenCalled()
    })

    it("prepareFinishAuction 返回 null 时提前退出", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const singleSpy = vi.spyOn(manager, "finishAuctionSingle")
      const lanSpy = vi.spyOn(manager, "finishAuctionLan")
      await manager.finishAuction({ playerId: "nonexistent", bid: 1000 }, "final")
      expect(singleSpy).not.toHaveBeenCalled()
      expect(lanSpy).not.toHaveBeenCalled()
      expect(ctx.deps.writeLog).toHaveBeenCalledWith("结算失败：找不到赢家玩家 nonexistent")
    })
  })

  describe("prepareFinishAuction", () => {
    it("找不到赢家时返回 null 并写日志", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "unknown", bid: 100 }, "manual")
      expect(result).toBeNull()
      expect(ctx.deps.writeLog).toHaveBeenCalledWith("结算失败：找不到赢家玩家 unknown")
    })

    it("正确设置场景状态：currentBid/bidLeader/settled/stopRoundTimer", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p2", bid: 75000 }, "direct")
      expect(ctx.deps.setCurrentBid).toHaveBeenCalledWith(75000)
      expect(ctx.deps.setBidLeader).toHaveBeenCalledWith("p2")
      expect(ctx.deps.setSettled).toHaveBeenCalledWith(true)
      expect(ctx.deps.stopRoundTimer).toHaveBeenCalledOnce()
    })

    it("进入结算页面传入赢家信息和原因文本", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p2", bid: 75000 }, "direct")
      expect(ctx.deps.enterSettlementPage).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p2", name: "AI甲" }),
        75000,
        "提前拿下"
      )
    })

    it("mode=final 原因为'最终回合高价胜出'", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 75000 }, "final")
      expect(result!.reasonText).toBe("最终回合高价胜出")
    })

    it("mode=manual 原因为'手动结算'", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 75000 }, "manual")
      expect(result!.reasonText).toBe("手动结算")
    })

    it("未知 mode 原因回退为'结算'", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 75000 }, "unknown")
      expect(result!.reasonText).toBe("结算")
    })

    it("盈利时非赢家扣除门票（playerMoney 减少）", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 100000 })
      // bid=80000 -> profit=20000 -> ticket=1000
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(result!.winnerProfit).toBe(20000)
      expect(result!.ticketPerPlayer).toBe(1000)
      expect(result!.dividendPerPlayer).toBe(0)
      // 人类非赢家 playerMoney -= 1000
      expect(ctx.getPlayerMoney()).toBe(10000 - 1000)
    })

    it("盈利时 AI 钱包扣除门票（不低于 0）", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 100000 })
      ctx.aiWallets["p3"] = 500
      // bid=80000 -> profit=20000 -> ticket=1000
      // p3 钱包 500 - 1000 = max(0, -500) = 0
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p1", bid: 80000 }, "final")
      expect(ctx.aiWallets["p3"]).toBe(0)
    })

    it("亏损时非赢家获得分红（playerMoney 增加）", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 50000 })
      // bid=80000 -> profit=-30000 -> dividend=4500
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(result!.winnerProfit).toBe(-30000)
      expect(result!.dividendPerPlayer).toBe(4500)
      expect(result!.ticketPerPlayer).toBe(0)
      // 人类非赢家 playerMoney += 4500
      expect(ctx.getPlayerMoney()).toBe(10000 + 4500)
    })

    it("亏损时 AI 钱包获得分红", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 50000 })
      // bid=80000 -> profit=-30000 -> dividend=4500
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p1", bid: 80000 }, "final")
      expect(ctx.aiWallets["p2"]).toBe(5000 + 4500)
      expect(ctx.aiWallets["p3"]).toBe(3000 + 4500)
    })

    it("平局时无分红无门票", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 80000 })
      // bid=80000 -> profit=0
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(result!.winnerProfit).toBe(0)
      expect(result!.dividendPerPlayer).toBe(0)
      expect(result!.ticketPerPlayer).toBe(0)
      expect(result!.dividendTicketInfo.mechanism).toBe("none")
      // playerMoney 不变
      expect(ctx.getPlayerMoney()).toBe(10000)
    })

    it("赢家是人类时 selfProfitInfo 返回 winnerProfit", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 100000 })
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p1", bid: 80000 }, "final")
      expect(result!.selfProfitInfo.profit).toBe(20000)
      expect(result!.selfProfitInfo.label).toBe("自身利润")
    })

    it("触发 AI 反思（fire and forget）", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(ctx.deps.createCrossGameRecord).toHaveBeenCalledOnce()
      expect(ctx.deps.triggerAiReflection).toHaveBeenCalledOnce()
    })

    it("AI 反思失败时静默不抛错", async () => {
      const ctx = makeDeps({
        triggerAiReflection: vi.fn().mockRejectedValue(new Error("反思失败"))
      })
      const manager = new SettlementManager(ctx.deps)
      await expect(manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")).resolves.toBeDefined()
    })

    it("揭示藏品异常被捕获并写日志", async () => {
      const ctx = makeDeps({
        revealAllArtifactsForSettlement: vi.fn().mockRejectedValue(new Error("揭示爆炸"))
      })
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(result).not.toBeNull()
      expect(ctx.deps.writeLog).toHaveBeenCalledWith("揭示藏品时发生异常：揭示爆炸")
    })

    it("揭示异常无 message 时回退为'未知错误'", async () => {
      const ctx = makeDeps({
        revealAllArtifactsForSettlement: vi.fn().mockRejectedValue("strange error")
      })
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(ctx.deps.writeLog).toHaveBeenCalledWith("揭示藏品时发生异常：未知错误")
    })

    it("返回完整上下文对象", async () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 100000 })
      const manager = new SettlementManager(ctx.deps)
      const result = await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(result).toMatchObject({
        winnerPlayer: { id: "p2", name: "AI甲" },
        winnerBid: 80000,
        mode: "final",
        reasonText: "最终回合高价胜出",
        totalValue: 100000,
        winnerProfit: 20000,
        dividendPerPlayer: 0,
        ticketPerPlayer: 1000
      })
      expect(result!.nonWinners).toHaveLength(2)
      expect(result!.humanNonWinner).toBeDefined()
      expect(result!.humanNonWinner!.id).toBe("p1")
    })
  })

  describe("finishAuctionLan", () => {
    it("主机分红路径：人类非赢家获得分红，联机玩家和 AI 钱包更新", () => {
      const ctx = makeDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => true,
        getPlayers: () => makeLanPlayers()
      })
      // 亏损分红：totalValue=50000, bid=80000 -> profit=-30000 -> dividend=4500
      ctx.deps.getWarehouseTrueValue = () => 50000
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionLan(
        makeContext({
          winnerPlayer: { id: "p3", isSelf: false, name: "AI玩家", isAI: true },
          winnerBid: 80000,
          totalValue: 50000,
          winnerProfit: -30000,
          dividendPerPlayer: 4500,
          ticketPerPlayer: 0,
          nonWinners: makeLanPlayers().filter((p) => p.id !== "p3"),
          humanNonWinner: makeLanPlayers().find((p) => p.isSelf)
        })
      )
      // 主机玩家获得分红
      expect(ctx.getPlayerMoney()).toBe(10000 + 4500)
      // 联机玩家钱包更新
      expect(ctx.lanHostWallets["lan-p2"]).toBe(8000 + 4500)
    })

    it("主机门票路径：人类非赢家扣门票，联机玩家和 AI 钱包扣减", () => {
      const ctx = makeDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => true,
        getPlayers: () => makeLanPlayers()
      })
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionLan(
        makeContext({
          winnerPlayer: { id: "p3", isSelf: false, name: "AI玩家", isAI: true },
          winnerBid: 80000,
          totalValue: 100000,
          winnerProfit: 20000,
          dividendPerPlayer: 0,
          ticketPerPlayer: 1000,
          dividendTicketInfo: { dividendPerPlayer: 0, ticketPerPlayer: 1000, mechanism: "ticket" },
          nonWinners: makeLanPlayers().filter((p) => p.id !== "p3"),
          humanNonWinner: makeLanPlayers().find((p) => p.isSelf)
        })
      )
      // 主机玩家扣门票
      expect(ctx.getPlayerMoney()).toBe(10000 - 1000)
      // 联机玩家钱包扣减
      expect(ctx.lanHostWallets["lan-p2"]).toBe(8000 - 1000)
    })

    it("主机 AI 赢家钱包按盈亏+加成更新并持久化（回归：之前联机 AI 赢家钱包不更新也不保存）", () => {
      const ctx = makeDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => true,
        getPlayers: () => makeLanPlayers()
      })
      ctx.aiWallets.p3 = 3000
      // 群体祝福：全体利润+100%（onGain, group, value 1.0 -> group 乘区 ×2）
      ctx.bonusEffects.push({ id: "group-bless", scope: "group", condition: "onGain", value: 1.0 })
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionLan(
        makeContext({
          winnerPlayer: { id: "p3", isSelf: false, name: "AI玩家", isAI: true },
          winnerBid: 80000,
          totalValue: 100000,
          winnerProfit: 20000,
          dividendPerPlayer: 0,
          ticketPerPlayer: 1000,
          dividendTicketInfo: { dividendPerPlayer: 0, ticketPerPlayer: 1000, mechanism: "ticket" },
          nonWinners: makeLanPlayers().filter((p) => p.id !== "p3"),
          humanNonWinner: makeLanPlayers().find((p) => p.isSelf)
        })
      )
      // adjustedWinnerProfit = 20000 × 2(群体祝福) = 40000；AI 钱包 3000+40000=43000
      // 旧代码：联机 AI 赢家钱包不更新，仍 3000 -> 红
      expect(ctx.aiWallets.p3).toBe(43000)
      // 旧代码：联机不保存 AI 钱包 -> saveAiWalletsToStorage 未调用 -> 红
      expect(ctx.deps.saveAiWalletsToStorage).toHaveBeenCalled()
    })

    it("非主机不更新钱包但仍写日志和 UI", () => {
      const ctx = makeDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => false,
        getPlayers: () => makeLanPlayers()
      })
      const initialMoney = ctx.getPlayerMoney()
      const initialLanWallet = ctx.lanHostWallets["lan-p2"]
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionLan(
        makeContext({
          winnerPlayer: { id: "p3", isSelf: false, name: "AI玩家", isAI: true },
          winnerBid: 80000,
          totalValue: 50000,
          winnerProfit: -30000,
          dividendPerPlayer: 4500,
          ticketPerPlayer: 0,
          nonWinners: makeLanPlayers().filter((p) => p.id !== "p3"),
          humanNonWinner: makeLanPlayers().find((p) => p.isSelf)
        })
      )
      expect(ctx.getPlayerMoney()).toBe(initialMoney)
      expect(ctx.lanHostWallets["lan-p2"]).toBe(initialLanWallet)
      expect(ctx.deps.writeLog).toHaveBeenCalled()
      expect(ctx.deps.updateSettlementPanelMetrics).toHaveBeenCalled()
    })

    it("无人类非赢家时不写分红/门票日志", () => {
      const ctx = makeDeps({
        getIsLanMode: () => true,
        getLanIsHost: () => true
      })
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionLan(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          nonWinners: [
            { id: "p2", isSelf: false, name: "AI甲", isAI: true },
            { id: "p3", isSelf: false, name: "AI乙", isAI: true }
          ],
          humanNonWinner: undefined,
          dividendPerPlayer: 4500,
          winnerProfit: -30000
        })
      )
      // 不应写分红日志（buildDividendTicketLog 仅在有 humanNonWinner 时调用）
      const logCalls = ctx.deps.writeLog.mock.calls.map((c) => c[0] as string)
      expect(logCalls.find((m) => m.includes("分红"))).toBeUndefined()
    })

    it("调用 saveSettlementBattleRecord 传入正确参数", () => {
      const ctx = makeDeps({ getIsLanMode: () => true, getLanIsHost: () => true })
      const manager = new SettlementManager(ctx.deps)
      const ctxObj = makeContext({ winnerProfit: -30000, dividendPerPlayer: 4500 })
      manager.finishAuctionLan(ctxObj)
      expect(ctx.deps.saveBattleRecord).toHaveBeenCalledOnce()
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.reasonText).toBe("联机结算")
    })
  })

  describe("finishAuctionSingle", () => {
    it("赢家是人类且未入账：利润入账并标记", () => {
      const ctx = makeDeps({ getWarehouseTrueValue: () => 100000 })
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          winnerBid: 80000,
          totalValue: 100000,
          winnerProfit: 20000,
          selfProfitInfo: { profit: 20000, label: "自身利润" },
          humanNonWinner: undefined
        })
      )
      expect(ctx.getPlayerMoney()).toBe(10000 + 20000)
      expect(ctx.deps.markMoneyAppliedForRun).toHaveBeenCalledOnce()
    })

    it("赢家是人类但已入账：不重复入账", () => {
      const ctx = makeDeps({
        hasAppliedMoneyForRun: () => true
      })
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          winnerBid: 80000,
          winnerProfit: 20000,
          selfProfitInfo: { profit: 20000, label: "自身利润" },
          humanNonWinner: undefined
        })
      )
      expect(ctx.getPlayerMoney()).toBe(10000)
      expect(ctx.deps.markMoneyAppliedForRun).not.toHaveBeenCalled()
    })

    it("赢家是 AI：savePlayerMoney 调用，不入账利润", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p2", isSelf: false, name: "AI甲", isAI: true },
          winnerProfit: 20000,
          selfProfitInfo: { profit: -1000, label: "自身利润（门票）" }
        })
      )
      // playerMoney 不变（无 winnerProfit 入账）
      expect(ctx.getPlayerMoney()).toBe(10000)
      expect(ctx.deps.markMoneyAppliedForRun).not.toHaveBeenCalled()
    })

    it("保存 AI 钱包到存储", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(makeContext())
      expect(ctx.deps.saveAiWalletsToStorage).toHaveBeenCalledOnce()
    })

    it("推送结算上下文到 AI（push 已移至 prepareFinishAuction，先于反思）", async () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      await manager.prepareFinishAuction({ playerId: "p2", bid: 80000 }, "final")
      expect(ctx.deps.pushRunSettlementContextToAi).toHaveBeenCalledOnce()
      const payload = ctx.deps.pushRunSettlementContextToAi.mock.calls[0][0]
      expect(payload).toMatchObject({
        winnerId: "p2",
        winnerName: "AI甲",
        winnerBid: 80000,
        totalValue: 100000
      })
    })

    it("人类非赢家且有分红日志时写日志", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerProfit: -30000,
          dividendPerPlayer: 4500,
          ticketPerPlayer: 0,
          humanNonWinner: { id: "p1", isSelf: true, name: "玩家" }
        })
      )
      const logCalls = ctx.deps.writeLog.mock.calls.map((c) => c[0] as string)
      expect(logCalls.find((m) => m.includes("分红"))).toBeDefined()
    })

    it("无人类非赢家时不写分红/门票日志", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          humanNonWinner: undefined,
          dividendPerPlayer: 4500
        })
      )
      const logCalls = ctx.deps.writeLog.mock.calls.map((c) => c[0] as string)
      expect(logCalls.find((m) => m.includes("分红："))).toBeUndefined()
    })

    it("recordGameFinished 正确调用", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          winnerProfit: 20000,
          selfProfitInfo: { profit: 20000, label: "自身利润" },
          humanNonWinner: undefined
        })
      )
      // recordGameFinished 写入 localStorage，验证
      const raw = localStorage.getItem("mobao_app_state_v1")
      expect(raw).toBeTruthy()
      const state = JSON.parse(raw!)
      expect(state.totalGamesPlayed).toBe(1)
      expect(state.totalWins).toBe(1)
      // 真实链路：applyPassiveEffect 会读 CHARACTERS[0]（鉴定师）的 passive: profitBonus 0.1
      // 所以 adjustedSelfProfit = winnerProfit + bonus = 20000 + 2000 = 22000
      // 旧断言 20000 是循环论证（忽略真实链路的被动效果），按测试原则修正
      const passiveBonus = Math.round(20000 * 0.1)
      expect(state.totalProfit).toBe(20000 + passiveBonus)
    })

    it("赢家 AI 且玩家亏损时 recordGameFinished playerWon=false", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(
        makeContext({
          winnerPlayer: { id: "p2", isSelf: false, name: "AI甲" },
          winnerProfit: 20000,
          selfProfitInfo: { profit: -1000, label: "自身利润（门票）" }
        })
      )
      const raw = localStorage.getItem("mobao_app_state_v1")
      const state = JSON.parse(raw!)
      expect(state.totalGamesPlayed).toBe(1)
      expect(state.totalWins).toBe(0)
      expect(state.totalProfit).toBe(-1000)
    })

    it("调用 updateHud", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.finishAuctionSingle(makeContext())
      expect(ctx.deps.updateHud).toHaveBeenCalledOnce()
    })
  })

  describe("AI 赢家钱包结算（回归：之前 AI 赢家钱包不更新，加成道具对 AI 无效）", () => {
    it("AI 赢家盈利时钱包按 盈亏+加成 更新（群体祝福+100%）", async () => {
      const ctx = makeDeps()
      ctx.aiWallets.p2 = 5000
      // 群体祝福：全体利润+100%（onGain, group, value 1.0 -> group 乘区 ×2）
      ctx.bonusEffects.push({ id: "group-bless", scope: "group", condition: "onGain", value: 1.0 })
      const manager = new SettlementManager(ctx.deps)
      // getWarehouseTrueValue=100000, bid=80000 -> winnerProfit=20000（盈利）
      await manager.finishAuction({ playerId: "p2", bid: 80000 }, "final")
      // adjustedWinnerProfit = 20000 × 2(群体祝福) = 40000；AI 钱包 5000+40000=45000
      // 旧代码：AI 赢家钱包不更新，仍为 5000 -> 此断言会红
      expect(ctx.aiWallets.p2).toBe(45000)
    })

    it("AI 赢家亏损时钱包扣减并受厄运符咒（亏损减半）影响，兜底 0", async () => {
      const ctx = makeDeps()
      ctx.aiWallets.p2 = 5000
      // 厄运符咒：自身亏损减少50%（onLoss, self, value -0.5 -> self 乘区 ×0.5）
      ctx.bonusEffects.push({ id: "curse", scope: "self", condition: "onLoss", value: -0.5 })
      const manager = new SettlementManager(ctx.deps)
      // bid=120000 > totalValue=100000 -> winnerProfit=-20000（亏损）
      await manager.finishAuction({ playerId: "p2", bid: 120000 }, "final")
      // adjustedWinnerProfit = -20000 × 0.5 = -10000；钱包 max(0, 5000-10000)=0
      // 旧代码：AI 赢家钱包不更新，仍为 5000 -> 此断言会红
      expect(ctx.aiWallets.p2).toBe(0)
    })

    it("AI 赢家无加成时钱包按原始盈亏更新", async () => {
      const ctx = makeDeps()
      ctx.aiWallets.p2 = 5000
      const manager = new SettlementManager(ctx.deps)
      await manager.finishAuction({ playerId: "p2", bid: 80000 }, "final")
      // 无加成：adjustedWinnerProfit = 20000；AI 钱包 5000+20000=25000
      expect(ctx.aiWallets.p2).toBe(25000)
    })
  })

  describe("updateSettlementFinalUI", () => {
    it("更新面板指标和触发动画", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const profitInfo = { profit: 20000, label: "自身利润" }
      manager.updateSettlementFinalUI(makeContext(), profitInfo)
      expect(ctx.deps.updateSettlementPanelMetrics).toHaveBeenCalledWith(100000, 20000)
      expect(ctx.deps.triggerSettlementFinalAnimation).toHaveBeenCalledWith(20000, false)
    })

    it("有人类非赢家时显示自身利润", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const profitInfo = { profit: -1000, label: "自身利润（门票）" }
      manager.updateSettlementFinalUI(makeContext(), profitInfo)
      expect(ctx.deps.showSelfProfit).toHaveBeenCalledWith(-1000, "自身利润（门票）")
    })

    it("无人类非赢家时不显示自身利润", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      const profitInfo = { profit: 20000, label: "自身利润" }
      manager.updateSettlementFinalUI(makeContext({ humanNonWinner: undefined }), profitInfo)
      expect(ctx.deps.showSelfProfit).not.toHaveBeenCalled()
    })

    it("设置结算进度为 100", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.updateSettlementFinalUI(makeContext(), { profit: 0, label: "自身利润" })
      expect(ctx.deps.setSettlementProgress).toHaveBeenCalledWith(expect.stringContaining("揭示完成"), 100)
    })

    it("进度文本包含赢家名和利润", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.updateSettlementFinalUI(
        makeContext({
          winnerPlayer: { id: "p2", isSelf: false, name: "AI甲" },
          winnerProfit: -5000
        }),
        { profit: 0, label: "自身利润" }
      )
      const text = ctx.deps.setSettlementProgress.mock.calls[0][0] as string
      expect(text).toContain("AI甲")
      expect(text).toContain("-5000")
    })
  })

  describe("saveSettlementBattleRecord", () => {
    it("有分红/门票时 dividendTicketInfo 传入", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          dividendPerPlayer: 4500,
          ticketPerPlayer: 0,
          dividendTicketInfo: { dividendPerPlayer: 4500, ticketPerPlayer: 0, mechanism: "dividend" }
        }),
        4500,
        "最终回合高价胜出"
      )
      expect(ctx.deps.saveBattleRecord).toHaveBeenCalledOnce()
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.dividendTicketInfo).toEqual({
        dividendPerPlayer: 4500,
        ticketPerPlayer: 0,
        mechanism: "dividend"
      })
      expect(record.playerProfit).toBe(4500)
      expect(record.reasonText).toBe("最终回合高价胜出")
    })

    it("无分红/门票时 dividendTicketInfo 为 null", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          dividendPerPlayer: 0,
          ticketPerPlayer: 0,
          dividendTicketInfo: { dividendPerPlayer: 0, ticketPerPlayer: 0, mechanism: "none" }
        }),
        0,
        "手动结算"
      )
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.dividendTicketInfo).toBeNull()
    })

    it("赢家是人类且盈利时 playerWon=true", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          winnerProfit: 20000
        }),
        20000,
        "最终回合高价胜出"
      )
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.playerWon).toBe(true)
    })

    it("赢家是人类但亏损时 playerWon=false", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          winnerPlayer: { id: "p1", isSelf: true, name: "玩家" },
          winnerProfit: -5000
        }),
        -5000,
        "手动结算"
      )
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.playerWon).toBe(false)
    })

    it("赢家是 AI 时 playerWon=false", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          winnerPlayer: { id: "p2", isSelf: false, name: "AI甲" },
          winnerProfit: 20000
        }),
        -1000,
        "最终回合高价胜出"
      )
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record.playerWon).toBe(false)
    })

    it("记录包含完整字段", () => {
      const ctx = makeDeps()
      const manager = new SettlementManager(ctx.deps)
      manager.saveSettlementBattleRecord(
        makeContext({
          mode: "final",
          winnerPlayer: { id: "p2", isSelf: false, name: "AI甲" },
          winnerBid: 80000,
          totalValue: 100000,
          winnerProfit: 20000
        }),
        -1000,
        "最终回合高价胜出"
      )
      const record = ctx.deps.saveBattleRecord.mock.calls[0][0]
      expect(record).toMatchObject({
        mode: "final",
        winnerId: "p2",
        winnerName: "AI甲",
        winnerBid: 80000,
        totalValue: 100000,
        winnerProfit: 20000,
        playerProfit: -1000,
        reasonText: "最终回合高价胜出"
      })
    })
  })
})
