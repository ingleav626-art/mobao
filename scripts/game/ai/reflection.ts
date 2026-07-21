import { createLogger } from "../core/logger"
const log = createLogger("AI.Reflection")

/**
 * @file reflection.ts
 * @module ai/reflection
 * @description AI局后反思系统。每局结算后，通过LLM让AI对自己的表现进行反思总结，
 *              更新跨局经验本（成功经验、策略建议、经验教训）。
 *
 * 核心职责：
 *   - triggerAiReflection: 局结算后触发所有AI玩家的反思
 *   - applyMemoryOperations: 对经验本数组执行增删改操作
 *   - updateCrossGameMemory: 更新跨局统计（胜率、盈亏、仓库价值范围等）
 *   - updateReflectionStatusUI: 更新反思状态UI
 *
 * @exports CrossGameMemory - 跨局记忆结构接口
 * @exports applyMemoryOperations / updateCrossGameMemory
 * @exports AiReflectionMixin - 向后兼容的 Mixin 薄包装
 */

// ─── 类型定义 ───

export interface CrossGameMemoryStats {
  totalGames: number
  warehouseValueMax: number
  warehouseValueMin: number
  warehouseValueAvg: number
  winRate: number
  avgProfit: number
  totalCellsMax: number
  totalCellsMin: number
  totalCellsAvg: number
  totalItemsMax: number
  totalItemsMin: number
  totalItemsAvg: number
  legendaryMax: number
  legendaryMin: number
  legendaryAvg: number
  rareMax: number
  rareMin: number
  rareAvg: number
}

export interface CrossGameMemory {
  stats: CrossGameMemoryStats
  lessons: string[]
  strategies: string[]
  praises: string[]
  [key: string]: unknown
}

// ─── 独立函数（可独立测试）───

export function applyMemoryOperations(array: string[], operations: Record<string, unknown>, maxLength: number): void {
  if (!operations || typeof operations !== "object") return

  if (Array.isArray(operations.delete)) {
    const deleteIndices = (operations.delete as number[])
      .filter((idx) => typeof idx === "number" && idx >= 0 && idx < array.length)
      .sort((a, b) => b - a)
    deleteIndices.forEach((idx) => {
      array.splice(idx, 1)
    })
  }

  if (Array.isArray(operations.modify)) {
    ; (operations.modify as unknown[][]).forEach((item) => {
      if (Array.isArray(item) && item.length >= 2) {
        const idx = item[0] as number
        const newContent = item[1] as string
        if (typeof idx === "number" && idx >= 0 && idx < array.length && typeof newContent === "string") {
          array[idx] = newContent.trim()
        }
      }
    })
  }

  if (Array.isArray(operations.add)) {
    ; (operations.add as string[]).forEach((content) => {
      if (typeof content === "string" && content.trim() && !array.includes(content.trim())) {
        array.push(content.trim())
      }
    })
  }

  while (array.length > maxLength) {
    array.shift()
  }
}

export function updateCrossGameMemory(
  memory: CrossGameMemory,
  playerId: string,
  record: Record<string, unknown>,
  parsedReflection: Record<string, unknown>
): void {
  if (!memory) return

  if (!memory.stats) {
    memory.stats = {
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
  }
  if (!memory.lessons) memory.lessons = []
  if (!memory.strategies) memory.strategies = []
  if (!memory.praises) memory.praises = []

  const stats = memory.stats
  const totalGames = stats.totalGames + 1
  const isWinner = record.winnerId === playerId
  const warehouseValue = (record.warehouseValue as number) || 0
  const totalCells = (record.totalCells as number) || 0
  const totalItems = (record.totalItems as number) || 0
  const qualityCounts = (record.qualityCounts as Record<string, number>) || {}
  const legendaryCount = qualityCounts.legendary || 0
  const rareCount = qualityCounts.rare || 0

  let profit = 0
  if (isWinner) {
    profit = (record.winnerProfit as number) || 0
  } else if (record.dividendTicket) {
    const dt = record.dividendTicket as Record<string, unknown>
    if (dt.mechanism === "dividend") {
      profit = (dt.dividendPerPlayer as number) || 0
    } else if (dt.mechanism === "ticket") {
      profit = -((dt.ticketPerPlayer as number) || 0)
    }
  }

  stats.totalGames = totalGames
  stats.winRate = (stats.winRate * (totalGames - 1) + (isWinner ? 1 : 0)) / totalGames
  stats.avgProfit = (stats.avgProfit * (totalGames - 1) + profit) / totalGames

  if (warehouseValue > 0) {
    if (stats.warehouseValueMax === 0 || warehouseValue > stats.warehouseValueMax)
      stats.warehouseValueMax = warehouseValue
    if (stats.warehouseValueMin === 0 || warehouseValue < stats.warehouseValueMin)
      stats.warehouseValueMin = warehouseValue
    stats.warehouseValueAvg = (stats.warehouseValueAvg * (totalGames - 1) + warehouseValue) / totalGames
  }

  if (totalCells > 0) {
    if (stats.totalCellsMax === 0 || totalCells > stats.totalCellsMax) stats.totalCellsMax = totalCells
    if (stats.totalCellsMin === 0 || totalCells < stats.totalCellsMin) stats.totalCellsMin = totalCells
    stats.totalCellsAvg = (stats.totalCellsAvg * (totalGames - 1) + totalCells) / totalGames
  }

  if (totalItems > 0) {
    if (stats.totalItemsMax === 0 || totalItems > stats.totalItemsMax) stats.totalItemsMax = totalItems
    if (stats.totalItemsMin === 0 || totalItems < stats.totalItemsMin) stats.totalItemsMin = totalItems
    stats.totalItemsAvg = (stats.totalItemsAvg * (totalGames - 1) + totalItems) / totalGames
  }

  stats.legendaryAvg = (stats.legendaryAvg * (totalGames - 1) + legendaryCount) / totalGames
  if (stats.legendaryMax === 0 || legendaryCount > stats.legendaryMax) stats.legendaryMax = legendaryCount
  if (stats.legendaryMin === 0 || legendaryCount < stats.legendaryMin) stats.legendaryMin = legendaryCount

  stats.rareAvg = (stats.rareAvg * (totalGames - 1) + rareCount) / totalGames
  if (stats.rareMax === 0 || rareCount > stats.rareMax) stats.rareMax = rareCount
  if (stats.rareMin === 0 || rareCount < stats.rareMin) stats.rareMin = rareCount

  applyMemoryOperations(memory.praises, parsedReflection.praises as Record<string, unknown>, 10)
  applyMemoryOperations(memory.strategies, parsedReflection.strategies as Record<string, unknown>, 10)
  applyMemoryOperations(memory.lessons, parsedReflection.lessons as Record<string, unknown>, 10)

  log.debug(
    `${playerId} updated: games=${totalGames}, winRate=${Math.round(stats.winRate * 100)}%, avgProfit=${Math.round(stats.avgProfit)}, praises=${memory.praises.length}, strategies=${memory.strategies.length}, lessons=${memory.lessons.length}`
  )
}

