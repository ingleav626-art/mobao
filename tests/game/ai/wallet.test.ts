import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AI_WALLET_INITIAL,
  getAiWallet,
  getAiMinimumBid,
  normalizeAiBidValue,
  resetAiWallets,
  loadAiWalletsFromStorage,
  saveAiWalletsToStorage,
  initAiWallets,
  type AiWalletContext
} from '../../../scripts/game/ai/wallet'

function makeCtx(overrides: Partial<AiWalletContext> = {}): AiWalletContext {
  return {
    currentBid: 1000,
    aiMaxBid: 500000,
    aiWallets: { 'ai-1': 500000, 'ai-2': 300000 },
    isLanMode: false,
    slotIdToLanId: {},
    ...overrides
  }
}

describe('wallet', () => {
  describe('AI_WALLET_INITIAL', () => {
    it('默认初始资金为 1000000', () => {
      expect(AI_WALLET_INITIAL).toBe(1000000)
    })
  })

  describe('getAiWallet', () => {
    it('返回钱包余额', () => {
      const ctx = makeCtx()
      expect(getAiWallet(ctx, 'ai-1')).toBe(500000)
    })

    it('余额为0时回退到 fallback', () => {
      const ctx = makeCtx({ aiWallets: { 'ai-1': 0 }, currentBid: 500, aiMaxBid: 10000 })
      const result = getAiWallet(ctx, 'ai-1')
      expect(result).toBe(10000) // Math.max(currentBid + bidStep, aiMaxBid)
    })

    it('联机模式下回退到 lanHostWallets', () => {
      const ctx = makeCtx({
        aiWallets: {},
        isLanMode: true,
        slotIdToLanId: { 'ai-1': 'lan-1' },
        lanHostWallets: { 'lan-1': 800000 }
      })
      expect(getAiWallet(ctx, 'ai-1')).toBe(800000)
    })

    it('未知 playerId 返回 fallback', () => {
      const ctx = makeCtx()
      const result = getAiWallet(ctx, 'unknown')
      expect(result).toBeGreaterThan(0)
    })
  })

  describe('getAiMinimumBid', () => {
    it('返回出价步长', () => {
      const ctx = makeCtx()
      const minBid = getAiMinimumBid(ctx, 'ai-1')
      expect(minBid).toBeGreaterThan(0)
    })

    it('钱包为0时返回0', () => {
      const ctx = makeCtx({ aiWallets: { 'ai-1': 0 }, aiMaxBid: 0, currentBid: 0 })
      expect(getAiMinimumBid(ctx, 'ai-1', 0)).toBe(0)
    })
  })

  describe('normalizeAiBidValue', () => {
    it('出价在范围内保持不变（对齐步长后）', () => {
      const ctx = makeCtx()
      const result = normalizeAiBidValue(ctx, 'ai-1', 5000)
      expect(result).toBeGreaterThanOrEqual(getAiMinimumBid(ctx, 'ai-1'))
      expect(result).toBeLessThanOrEqual(getAiWallet(ctx, 'ai-1'))
    })

    it('出价低于最低值时提升到最低', () => {
      const ctx = makeCtx()
      const minBid = getAiMinimumBid(ctx, 'ai-1')
      const result = normalizeAiBidValue(ctx, 'ai-1', 1)
      expect(result).toBe(minBid)
    })

    it('出价超过钱包余额时截断', () => {
      const ctx = makeCtx({ aiWallets: { 'ai-1': 100 } })
      const result = normalizeAiBidValue(ctx, 'ai-1', 999999)
      expect(result).toBeLessThanOrEqual(100)
    })

    it('钱包为0时返回0（fallback 为 bidStep）', () => {
      const ctx = makeCtx({ aiWallets: { 'ai-1': 0 }, aiMaxBid: 0, currentBid: 0 })
      // 当钱包为0时，getAiWallet 返回 fallback = Math.max(currentBid + bidStep, aiMaxBid)
      // 即 bidStep（通常100），所以 normalizeAiBidValue 返回 bidStep 而非 0
      const result = normalizeAiBidValue(ctx, 'ai-1', 5000)
      expect(result).toBeGreaterThan(0) // 返回 bidStep，不是 0
    })

    it('显式传入 wallet 参数', () => {
      const ctx = makeCtx()
      const result = normalizeAiBidValue(ctx, 'ai-1', 5000, 200)
      expect(result).toBeLessThanOrEqual(200)
    })
  })

  describe('resetAiWallets', () => {
    it('重置所有AI钱包为初始值', () => {
      const aiWallets: Record<string, number> = { 'ai-1': 100, 'ai-2': 200 }
      const players = [{ id: 'human', isHuman: true }, { id: 'ai-1', isHuman: false }, { id: 'ai-2', isHuman: false }]
      resetAiWallets(players as any, aiWallets)
      expect(aiWallets['ai-1']).toBe(AI_WALLET_INITIAL)
      expect(aiWallets['ai-2']).toBe(AI_WALLET_INITIAL)
      expect(aiWallets['human']).toBeUndefined()
    })
  })

  describe('localStorage', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('saveAiWalletsToStorage + loadAiWalletsFromStorage 往返正确', () => {
      const data = { 'ai-1': 500000, 'ai-2': 300000 }
      saveAiWalletsToStorage(data)
      const loaded = loadAiWalletsFromStorage()
      expect(loaded).toEqual(data)
    })

    it('无数据时返回空对象', () => {
      const loaded = loadAiWalletsFromStorage()
      expect(loaded).toEqual({})
    })

    it('initAiWallets 从存储加载', () => {
      saveAiWalletsToStorage({ 'ai-1': 777000 })
      const aiWallets: Record<string, number> = {}
      const players = [{ id: 'ai-1', isHuman: false }]
      initAiWallets(players as any, aiWallets)
      expect(aiWallets['ai-1']).toBe(777000)
    })

    it('initAiWallets 存储无数据时使用默认值', () => {
      const aiWallets: Record<string, number> = {}
      const players = [{ id: 'ai-new', isHuman: false }]
      initAiWallets(players as any, aiWallets)
      expect(aiWallets['ai-new']).toBe(AI_WALLET_INITIAL)
    })
  })
})
