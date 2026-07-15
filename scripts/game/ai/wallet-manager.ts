/**
 * @file wallet-manager.ts
 * @module ai/wallet-manager
 * @description AiWalletManager -- AI 钱包管理器（Phase 2 依赖注入）。
 *              包装 wallet.ts 的纯函数，通过构造函数注入依赖（players、aiWallets、context provider），
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测（构造函数注入 mock 依赖），过渡期 Mixin 保留为薄代理层。
 */
import type { Player } from "../../../types/game"
import type { AiWalletContext } from "./wallet"
import {
  loadAiWalletsFromStorage,
  saveAiWalletsToStorage,
  resetAiWallets,
  initAiWallets,
  getAiWallet,
  getAiMinimumBid,
  normalizeAiBidValue
} from "./wallet"

/**
 * AI 钱包管理器。
 *
 * 依赖注入：
 *   - players: 玩家列表（引用，用于 reset/init 识别 AI 玩家）
 *   - aiWallets: AI 钱包余额映射（可变引用，reset/init/save 直接修改）
 *   - ctxProvider: 构建 AiWalletContext 的函数（读取 currentBid/aiMaxBid/isLanMode 等动态属性）
 */
export class AiWalletManager {
  /**
   * @param players 玩家列表（引用，用于识别 AI 玩家）
   * @param aiWallets AI 钱包余额映射（可变引用，reset/init/save 直接修改此对象）
   * @param ctxProvider 构建 AiWalletContext 的闭包，读取场景上的动态属性（currentBid 等）
   */
  constructor(
    private readonly players: Player[],
    private readonly aiWallets: Record<string, number>,
    private readonly ctxProvider: () => AiWalletContext
  ) {}

  /** 从 localStorage 加载钱包数据（纯静态，无实例依赖） */
  loadAiWalletsFromStorage(): Record<string, number> {
    return loadAiWalletsFromStorage()
  }

  /** 保存当前 aiWallets 到 localStorage */
  saveAiWalletsToStorage(): void {
    saveAiWalletsToStorage(this.aiWallets)
  }

  /** 重置所有 AI 钱包为初始值（AI_WALLET_INITIAL） */
  resetAiWallets(): void {
    resetAiWallets(this.players, this.aiWallets)
  }

  /** 从存储加载或使用默认值初始化 AI 钱包 */
  initAiWallets(): void {
    initAiWallets(this.players, this.aiWallets)
  }

  /** 查询 AI 玩家余额（支持联机回退到主机数据） */
  getAiWallet(playerId: string): number {
    return getAiWallet(this.ctxProvider(), playerId)
  }

  /** 获取 AI 最低出价值（出价步长） */
  getAiMinimumBid(playerId: string, wallet: number | null = null): number {
    return getAiMinimumBid(this.ctxProvider(), playerId, wallet)
  }

  /** 规范化出价值：clamp 到 [最低出价, 钱包余额] 并对齐步长 */
  normalizeAiBidValue(playerId: string, bid: number, wallet: number | null = null): number {
    return normalizeAiBidValue(this.ctxProvider(), playerId, bid, wallet)
  }
}
