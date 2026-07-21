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

