/**
 * @file wallet.ts
 * @module ai/wallet
 * @description AI玩家钱包管理。负责AI玩家的虚拟资金初始化、持久化存储、
 *              余额查询和出价规范化。每个AI玩家拥有独立钱包，资金跨局累积（localStorage），
 *              联机模式下可从主机同步钱包数据。
 *
 * 核心职责：
 *   - 初始化/重置AI钱包（默认 1,000,000）
 *   - 从 localStorage 加载/保存钱包数据
 *   - 查询AI余额（支持联机回退到主机数据）
 *   - 规范化出价值：clamp 到 [最低出价, 钱包余额] 并对齐到出价步长
 *
 * @exports AI_WALLET_INITIAL - AI初始资金常量
 * @exports AiWalletContext - 钱包查询上下文接口
 * @exports loadAiWalletsFromStorage / saveAiWalletsToStorage / resetAiWallets / initAiWallets
 * @exports getAiWallet / getAiMinimumBid / normalizeAiBidValue
 * @exports AiWalletMixin - 向后兼容的 Mixin 薄包装
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Player } from "../../../types/game"
import { GAME_SETTINGS } from "../core/settings"
import { clamp, roundToStep } from "../core/utils"
import { AI_WALLET_STORAGE_KEY } from "../core/constants"

export const AI_WALLET_INITIAL = 1000000

/** getAiWallet / getAiMinimumBid / normalizeAiBidValue 所需的上下文 */
export interface AiWalletContext {
  currentBid: number
  aiMaxBid: number
  aiWallets: Record<string, number>
  isLanMode: boolean
  slotIdToLanId: Record<string, string>
  lanHostWallets?: Record<string, number>
}

// ─── 独立函数（可独立测试）───

export function loadAiWalletsFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(AI_WALLET_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        return parsed
      }
    }
  } catch (e) {
    console.warn("[loadAiWalletsFromStorage] failed:", e)
  }
  return {}
}

export function saveAiWalletsToStorage(aiWallets: Record<string, number>): void {
  try {
    localStorage.setItem(AI_WALLET_STORAGE_KEY, JSON.stringify(aiWallets || {}))
  } catch (e) {
    console.warn("[saveAiWalletsToStorage] failed:", e)
  }
}

export function resetAiWallets(players: Player[], aiWallets: Record<string, number>): void {
  for (const key of Object.keys(aiWallets)) delete aiWallets[key]
  const aiPlayers = players.filter((p) => !p.isHuman)
  for (const p of aiPlayers) {
    aiWallets[p.id] = AI_WALLET_INITIAL
  }
  saveAiWalletsToStorage(aiWallets)
  console.log("[resetAiWallets] AI wallets reset to", AI_WALLET_INITIAL)
}

export function initAiWallets(players: Player[], aiWallets: Record<string, number>): void {
  const aiPlayers = players.filter((p) => !p.isHuman)
  const stored = loadAiWalletsFromStorage()
  for (const key of Object.keys(aiWallets)) delete aiWallets[key]
  for (const p of aiPlayers) {
    if (stored[p.id] && Number.isFinite(Number(stored[p.id])) && Number(stored[p.id]) > 0) {
      aiWallets[p.id] = Math.round(Number(stored[p.id]))
    } else {
      aiWallets[p.id] = AI_WALLET_INITIAL
    }
  }
  console.log("[initAiWallets] AI wallets loaded:", aiWallets)
}

export function getAiWallet(ctx: AiWalletContext, playerId: string): number {
  const fallback = Math.max(ctx.currentBid + GAME_SETTINGS.bidStep, ctx.aiMaxBid || 0)
  const direct = Math.max(0, Math.round(Number(ctx.aiWallets[playerId]) || 0))
  if (direct > 0) return direct
  if (ctx.isLanMode && ctx.slotIdToLanId[playerId]) {
    const lanId = ctx.slotIdToLanId[playerId]
    const lanWallet = Math.max(0, Math.round(Number((ctx.lanHostWallets || {})[lanId]) || 0))
    if (lanWallet > 0) return lanWallet
  }
  return fallback
}

export function getAiMinimumBid(ctx: AiWalletContext, playerId: string, wallet: number | null = null): number {
  const safeWallet = wallet === null ? getAiWallet(ctx, playerId) : Math.max(0, Math.round(Number(wallet) || 0))
  const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1))
  if (safeWallet <= 0) {
    return 0
  }
  return roundToStep(step, step)
}

export function normalizeAiBidValue(ctx: AiWalletContext, playerId: string, bid: number, wallet: number | null = null): number {
  const safeWallet = wallet === null ? getAiWallet(ctx, playerId) : Math.max(0, Math.round(Number(wallet) || 0))
  const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1))
  const minBid = getAiMinimumBid(ctx, playerId, safeWallet)
  if (safeWallet <= 0) {
    return 0
  }
  const safe = clamp(Math.round(Number(bid) || 0), minBid, safeWallet)
  return Math.max(minBid, roundToStep(safe, step))
}

// ─── Mixin 薄包装（向后兼容，通过 Object.assign 混入原型）───

function walletCtx(scene: WarehouseSceneThis): AiWalletContext {
  return {
    currentBid: scene.currentBid,
    aiMaxBid: scene.aiMaxBid,
    aiWallets: scene.aiWallets,
    isLanMode: scene.isLanMode,
    slotIdToLanId: scene.slotIdToLanId,
    lanHostWallets: scene.lanHostWallets,
  }
}

export const AiWalletMixin: ThisType<WarehouseSceneThis> = {
  loadAiWalletsFromStorage,
  saveAiWalletsToStorage() { saveAiWalletsToStorage(this.aiWallets) },
  resetAiWallets() { resetAiWallets(this.players, this.aiWallets) },
  initAiWallets() { initAiWallets(this.players, this.aiWallets) },
  getAiWallet(playerId: string) { return getAiWallet(walletCtx(this), playerId) },
  getAiMinimumBid(playerId: string, wallet: number | null = null) { return getAiMinimumBid(walletCtx(this), playerId, wallet) },
  normalizeAiBidValue(playerId: string, bid: number, wallet: number | null = null) { return normalizeAiBidValue(walletCtx(this), playerId, bid, wallet) },
}
