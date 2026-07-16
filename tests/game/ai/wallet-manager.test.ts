import { describe, it, expect, beforeEach, vi } from "vitest"
import { AiWalletManager } from "../../../scripts/game/ai/wallet-manager"
import {
  AI_WALLET_INITIAL,
  loadAiWalletsFromStorage,
  saveAiWalletsToStorage,
  type AiWalletContext,
} from "../../../scripts/game/ai/wallet"

function makeCtx(overrides: Partial<AiWalletContext> = {}): AiWalletContext {
  return {
    currentBid: 1000,
    aiMaxBid: 500000,
    aiWallets: { "ai-1": 500000, "ai-2": 300000 },
    isLanMode: false,
    slotIdToLanId: {},
    ...overrides,
  }
}

/** 包装 AiWalletManager 构造参数：直接值转为 getter 函数 */
function makeGetter<T>(val: T): () => T {
  return () => val
}

describe("AiWalletManager", () => {
  describe("getAiWallet", () => {
    it("返回注入的 aiWallets 中的余额", () => {
      const players = [{ id: "ai-1", isHuman: false }] as any
      const aiWallets = { "ai-1": 500000 }
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () => makeCtx({ aiWallets }))
      expect(manager.getAiWallet("ai-1")).toBe(500000)
    })

    it("余额为 0 时回退到 fallback", () => {
      const players = [{ id: "ai-1", isHuman: false }] as any
      const aiWallets = { "ai-1": 0 }
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () =>
        makeCtx({ aiWallets, currentBid: 500, aiMaxBid: 10000 }),
      )
      expect(manager.getAiWallet("ai-1")).toBe(10000)
    })

    it("联机模式下回退到 lanHostWallets", () => {
      const players = [{ id: "ai-1", isHuman: false }] as any
      const aiWallets: Record<string, number> = {}
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () =>
        makeCtx({
          aiWallets,
          isLanMode: true,
          slotIdToLanId: { "ai-1": "lan-1" },
          lanHostWallets: { "lan-1": 800000 },
        }),
      )
      expect(manager.getAiWallet("ai-1")).toBe(800000)
    })
  })

  describe("resetAiWallets", () => {
    it("重置所有 AI 钱包为初始值", () => {
      const players = [
        { id: "human", isHuman: true },
        { id: "ai-1", isHuman: false },
      ] as any
      const aiWallets: Record<string, number> = { "ai-1": 100 }
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () => makeCtx())
      manager.resetAiWallets()
      expect(aiWallets["ai-1"]).toBe(AI_WALLET_INITIAL)
      expect(aiWallets["human"]).toBeUndefined()
    })
  })

  describe("initAiWallets", () => {
    beforeEach(() => localStorage.clear())

    it("从存储加载钱包", () => {
      saveAiWalletsToStorage({ "ai-1": 777000 })
      const players = [{ id: "ai-1", isHuman: false }] as any
      const aiWallets: Record<string, number> = {}
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () => makeCtx())
      manager.initAiWallets()
      expect(aiWallets["ai-1"]).toBe(777000)
    })

    it("存储无数据时使用默认值", () => {
      const players = [{ id: "ai-new", isHuman: false }] as any
      const aiWallets: Record<string, number> = {}
      const manager = new AiWalletManager(makeGetter(players), makeGetter(aiWallets), () => makeCtx())
      manager.initAiWallets()
      expect(aiWallets["ai-new"]).toBe(AI_WALLET_INITIAL)
    })
  })

  describe("saveAiWalletsToStorage", () => {
    beforeEach(() => localStorage.clear())

    it("保存当前 aiWallets 到 localStorage", () => {
      const aiWallets = { "ai-1": 500000 }
      const manager = new AiWalletManager(() => [], makeGetter(aiWallets), () => makeCtx())
      manager.saveAiWalletsToStorage()
      const loaded = loadAiWalletsFromStorage()
      expect(loaded).toEqual(aiWallets)
    })
  })

  describe("normalizeAiBidValue", () => {
    it("出价超过钱包余额时截断", () => {
      const aiWallets = { "ai-1": 100 }
      const manager = new AiWalletManager(() => [], makeGetter(aiWallets), () => makeCtx({ aiWallets }))
      const result = manager.normalizeAiBidValue("ai-1", 999999)
      expect(result).toBeLessThanOrEqual(100)
    })

    it("出价低于最低值时提升到最低", () => {
      const aiWallets = { "ai-1": 500000 }
      const manager = new AiWalletManager(() => [], makeGetter(aiWallets), () => makeCtx({ aiWallets }))
      const minBid = manager.getAiMinimumBid("ai-1")
      const result = manager.normalizeAiBidValue("ai-1", 1)
      expect(result).toBe(minBid)
    })
  })

  describe("ctxProvider 动态读取", () => {
    it("ctxProvider 返回的动态值被正确使用", () => {
      const aiWallets = { "ai-1": 500000 }
      let currentBid = 1000
      const manager = new AiWalletManager(() => [], makeGetter(aiWallets), () => ({
        ...makeCtx({ aiWallets }),
        currentBid,
      }))
      // 改变 currentBid，Manager 应读取最新值
      currentBid = 5000
      const wallet = manager.getAiWallet("ai-1")
      expect(wallet).toBe(500000) // 钱包有余额，不受 currentBid 影响
    })
  })
})
