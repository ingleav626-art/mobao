/**
 * @file wallet.js
 * @module ai/wallet
 * @description AI玩家钱包管理 Mixin。负责AI玩家的虚拟资金初始化、持久化存储、
 *              余额查询和出价规范化。每个AI玩家拥有独立钱包，资金跨局累积（localStorage），
 *              联机模式下可从主机同步钱包数据。
 *
 * 核心职责：
 *   - 初始化/重置AI钱包（默认 1,000,000）
 *   - 从 localStorage 加载/保存钱包数据
 *   - 查询AI余额（支持联机回退到主机数据）
 *   - 规范化出价值：clamp 到 [最低出价, 钱包余额] 并对齐到出价步长
 *
 * @exports WalletMixin - AI钱包管理 Mixin，混入 Phaser Scene
 * @exports AI_WALLET_INITIAL - AI初始资金常量
 *
 * 混入方式：Object.assign(scene, MobaoAi.WalletMixin)
 * 混入后 scene 将获得：aiWallets, loadAiWalletsFromStorage, saveAiWalletsToStorage,
 *   resetAiWallets, initAiWallets, getAiWallet, getAiMinimumBid, normalizeAiBidValue
 */
import { GAME_SETTINGS } from "../core/settings"
import { clamp, roundToStep } from "../core/utils"

export const AI_WALLET_INITIAL = 1000000
const AI_WALLET_STORAGE_KEY = "mobao_ai_wallets_v1"

export const AiWalletMixin: Record<string, unknown> = {
  loadAiWalletsFromStorage(): Record<string, number> {
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
  },

  saveAiWalletsToStorage(): void {
    try {
      localStorage.setItem(AI_WALLET_STORAGE_KEY, JSON.stringify(this.aiWallets || {}))
    } catch (e) {
      console.warn("[saveAiWalletsToStorage] failed:", e)
    }
  },

  resetAiWallets(): void {
    this.aiWallets = {}
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    aiPlayers.forEach((player) => {
      this.aiWallets[player.id] = AI_WALLET_INITIAL
    })
    this.saveAiWalletsToStorage()
    console.log("[resetAiWallets] AI wallets reset to", AI_WALLET_INITIAL)
  },

  initAiWallets(): void {
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    const stored = this.loadAiWalletsFromStorage()
    this.aiWallets = {}
    aiPlayers.forEach((player) => {
      if (stored[player.id] && Number.isFinite(Number(stored[player.id])) && Number(stored[player.id]) > 0) {
        this.aiWallets[player.id] = Math.round(Number(stored[player.id]))
      } else {
        this.aiWallets[player.id] = AI_WALLET_INITIAL
      }
    })
    console.log("[initAiWallets] AI wallets loaded:", this.aiWallets)
  },

  getAiWallet(playerId: string): number {
    const fallback = Math.max(this.currentBid + GAME_SETTINGS.bidStep, this.aiMaxBid || 0)
    const direct = Math.max(0, Math.round(Number(this.aiWallets[playerId]) || 0))
    if (direct > 0) return direct
    if (this.isLanMode && this.slotIdToLanId[playerId]) {
      const lanId = this.slotIdToLanId[playerId]
      const lanWallet = Math.max(0, Math.round(Number(this.lanHostWallets[lanId]) || 0))
      if (lanWallet > 0) return lanWallet
    }
    return fallback
  },

  getAiMinimumBid(playerId: string, wallet: number | null = null): number {
    const safeWallet = wallet === null ? this.getAiWallet(playerId) : Math.max(0, Math.round(Number(wallet) || 0))
    const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1))
    if (safeWallet <= 0) {
      return 0
    }
    return roundToStep(step, step)
  },

  normalizeAiBidValue(playerId: string, bid: number, wallet: number | null = null): number {
    const safeWallet = wallet === null ? this.getAiWallet(playerId) : Math.max(0, Math.round(Number(wallet) || 0))
    const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1))
    const minBid = this.getAiMinimumBid(playerId, safeWallet)
    if (safeWallet <= 0) {
      return 0
    }
    const safe = clamp(Math.round(Number(bid) || 0), minBid, safeWallet)
    return Math.max(minBid, roundToStep(safe, step))
  }
}
