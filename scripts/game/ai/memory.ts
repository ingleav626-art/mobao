import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type {
  AiMemoryStorage,
  CrossGameMemory,
  CrossGameStats,
  ConversationMessage,
  ConversationBucketEntry
} from "../../../types/ai"

/**
 * @file memory.ts
 * @module ai/memory
 * @description AI跨局记忆系统。管理AI玩家的对局内对话历史和跨局经验本，
 *              支持持久化存储（localStorage）、导入导出、以及为LLM构建记忆上下文。
 *
 * @exports DEFAULT_CROSS_GAME_STATS - 默认跨局统计数据
 * @exports getAiMemoryStorageKey / loadAiMemoryFromStorage / saveAiMemoryToStorage
 * @exports getQualityCounts / getTotalOccupiedCells / ensureCrossGameMemory
 * @exports AiMemoryMixin - 向后兼容的 Mixin 薄包装
 */
import { AI_MEMORY_STORAGE_KEY } from "../core/constants"

// ─── 独立函数 / 常量（可独立测试）───

export const DEFAULT_CROSS_GAME_STATS: CrossGameStats = {
  totalGames: 0,
  warehouseValueMax: 0,
  warehouseValueMin: 0,
  warehouseValueAvg: 0,
  winRate: 0,
  avgProfit: 0,
  totalCellsMax: 0,
  totalCellsMin: 0,
  totalCellsAvg: 0,
  totalItemsMax: 0,
  totalItemsMin: 0,
  totalItemsAvg: 0,
  legendaryMax: 0,
  legendaryMin: 0,
  legendaryAvg: 0,
  rareMax: 0,
  rareMin: 0,
  rareAvg: 0
}

export function getAiMemoryStorageKey(isLanMode: boolean): string {
  return isLanMode ? AI_MEMORY_STORAGE_KEY + "_lan" : AI_MEMORY_STORAGE_KEY
}

export function loadAiMemoryFromStorage(storageKey: string): AiMemoryStorage | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as AiMemoryStorage
  } catch (_error) {
    return null
  }
}

export function getQualityCounts(items: Array<{ qualityKey: string }>): Record<string, number> {
  const counts: Record<string, number> = { poor: 0, normal: 0, fine: 0, rare: 0, legendary: 0 }
  items.forEach((item) => {
    const qk = item.qualityKey
    if (typeof counts[qk] === "number") {
      counts[qk] += 1
    }
  })
  return counts
}

export function getTotalOccupiedCells(items: Array<{ w: number; h: number }>): number {
  return items.reduce((sum, item) => sum + item.w * item.h, 0)
}

export function ensureCrossGameMemory(
  crossGameMemory: Record<string, CrossGameMemory>,
  playerId: string
): CrossGameMemory {
  if (!crossGameMemory[playerId]) {
    crossGameMemory[playerId] = {
      stats: {
        ...DEFAULT_CROSS_GAME_STATS,
        warehouseValueMax: 679100,
        warehouseValueMin: 170400,
        warehouseValueAvg: 412000
      },
      lessons: [],
      strategies: [],
      praises: []
    }
  }
  return crossGameMemory[playerId]
}

// ─── Mixin 薄代理（Phase 2：代理到 AiMemoryManager，向后兼容 Object.assign 混入）───

export const AiMemoryMixin: ThisType<WarehouseSceneThis> = {
  getAiMemoryStorageKey(): string {
    return this.aiMemoryManager.getAiMemoryStorageKey()
  },

  isAiMultiGameMemoryEnabled(): boolean {
    return this.aiMemoryManager.isAiMultiGameMemoryEnabled()
  },

  shouldGenerateSummary(): boolean {
    return this.aiMemoryManager.shouldGenerateSummary()
  },

  clearGameHistoryForPlayer(playerId: string): void {
    return this.aiMemoryManager.clearGameHistoryForPlayer(playerId)
  },

  loadAiMemoryFromStorage(): AiMemoryStorage | null {
    return this.aiMemoryManager.loadAiMemoryFromStorage()
  },

  saveAiMemoryToStorage(): void {
    return this.aiMemoryManager.saveAiMemoryToStorage()
  },

  restoreAiMemoryFromStorage(): void {
    return this.aiMemoryManager.restoreAiMemoryFromStorage()
  },

  ensureAiConversationBucket(playerId: string): ConversationBucketEntry[] {
    return this.aiMemoryManager.ensureAiConversationBucket(playerId)
  },

  ensureAiCrossGameMemory(playerId: string): CrossGameMemory {
    return this.aiMemoryManager.ensureAiCrossGameMemory(playerId)
  },

  getAiCrossGameMemoryCount(playerId: string): number {
    return this.aiMemoryManager.getAiCrossGameMemoryCount(playerId)
  },

  getAiInGameHistoryCount(playerId: string): number {
    return this.aiMemoryManager.getAiInGameHistoryCount(playerId)
  },

  getQualityCounts(): Record<string, number> {
    return this.aiMemoryManager.getQualityCounts()
  },

  getTotalOccupiedCells(): number {
    return this.aiMemoryManager.getTotalOccupiedCells()
  },

  getAiConversationMessages(playerId: string): ConversationMessage[] {
    return this.aiMemoryManager.getAiConversationMessages(playerId)
  },

  pushAiRoundSummary(playerId: string, plan: Record<string, unknown>): void {
    return this.aiMemoryManager.pushAiRoundSummary(playerId, plan)
  },

  updateLastAiRoundResult(playerId: string, resultText: string): void {
    return this.aiMemoryManager.updateLastAiRoundResult(playerId, resultText)
  },

  resetAiConversations(): void {
    return this.aiMemoryManager.resetAiConversations()
  },

  clearAiMemoryStorage(): void {
    return this.aiMemoryManager.clearAiMemoryStorage()
  },

  exportAiMemoryToJson(): string {
    return this.aiMemoryManager.exportAiMemoryToJson()
  },

  importAiMemoryFromJson(jsonString: string): { ok: boolean; error?: string } {
    return this.aiMemoryManager.importAiMemoryFromJson(jsonString)
  },

  pushRunStartContextToAi(): void {
    return this.aiMemoryManager.pushRunStartContextToAi()
  },

  pushRunSettlementContextToAi(result: Record<string, unknown>): void {
    return this.aiMemoryManager.pushRunSettlementContextToAi(result)
  },

  createCrossGameRecord(result: Record<string, unknown>): Record<string, unknown> {
    return this.aiMemoryManager.createCrossGameRecord(result)
  },

  getAiFirstRoundExtraBlocks(playerId?: string): string[] {
    return this.aiMemoryManager.getAiFirstRoundExtraBlocks(playerId)
  },

  openAiMemoryPanel() {
    return this.aiMemoryManager.openAiMemoryPanel()
  },

  setupAiMemoryTouchScroll() {
    return this.aiMemoryManager.setupAiMemoryTouchScroll()
  },

  closeAiMemoryPanel() {
    return this.aiMemoryManager.closeAiMemoryPanel()
  }
}
