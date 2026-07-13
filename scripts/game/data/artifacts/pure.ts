/**
 * @file data/artifacts/pure
 * @description 藏品统计/工具纯函数。从 data/artifacts.ts 拆分而来（纯代码搬迁，无逻辑变更）。
 *              公共导出：estimatePriceByQuality, signalToRevealState, summarizeCandidatePrices,
 *              summarizeStatsCollection, toSizeTag。
 *              内部导出（供 manager.ts 用，不经薄入口 re-export）：canPlaceRect, weightedPick。
 *              文件内私有：emptyPriceStats, quantileSorted。
 */

import { SIZE_TAG_BY_DIMENSION } from "./config"

export function estimatePriceByQuality(basePrice: number, qualityKey: string): number {
  const multiplierMap: Record<string, number> = {
    poor: 0.72,
    normal: 0.95,
    fine: 1.18,
    rare: 1.45,
    legendary: 1.85
  }

  const ratio = multiplierMap[qualityKey] || 1
  return Math.round(basePrice * ratio)
}

export function signalToRevealState(signal: Record<string, any>): Record<string, any> {
  const state: Record<string, any> = {}
  if (signal.qualityKey) {
    state.qualityKey = signal.qualityKey
  }
  if (signal.sizeTag) {
    state.sizeTag = signal.sizeTag
  }
  if (signal.category) {
    state.category = signal.category
  }
  return state
}

export function summarizeCandidatePrices(candidates: any[] = []): Record<string, any> {
  const prices = candidates
    .map((item) => Number(item.expectedPrice ?? item.basePrice) || 0)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)

  if (prices.length === 0) {
    return emptyPriceStats()
  }

  const count = prices.length
  const sum = prices.reduce((acc, value) => acc + value, 0)
  const mean = sum / count
  const top2 = prices.slice(-2)
  const bottom2 = prices.slice(0, 2)
  const top2Mean = top2.reduce((acc, value) => acc + value, 0) / top2.length
  const bottom2Mean = bottom2.reduce((acc, value) => acc + value, 0) / bottom2.length
  const variance = prices.reduce((acc, value) => acc + (value - mean) ** 2, 0) / count
  const std = Math.sqrt(variance)
  const p10 = quantileSorted(prices, 0.1)
  const q1 = quantileSorted(prices, 0.25)
  const q3 = quantileSorted(prices, 0.75)
  const p90 = quantileSorted(prices, 0.9)
  const iqr = q3 - q1
  const spreadRatio = iqr / (mean + 1)
  const upperEdge = (top2Mean - mean) / (mean + 1)
  const lowerEdge = (mean - bottom2Mean) / (mean + 1)

  return {
    count,
    mean,
    top2Mean,
    bottom2Mean,
    std,
    p10,
    q1,
    q3,
    p90,
    iqr,
    spreadRatio,
    upperEdge,
    lowerEdge
  }
}

export function summarizeStatsCollection(statsList: any[] = []): Record<string, any> {
  const list = statsList.filter((stats) => stats && Number.isFinite(stats.count) && stats.count > 0)
  if (list.length === 0) {
    return emptyPriceStats()
  }

  const totalWeight = list.reduce((acc, stats) => acc + stats.count, 0)
  const weighted = (field: string) =>
    list.reduce((acc, stats) => acc + (stats as Record<string, number>)[field] * stats.count, 0) / totalWeight

  return {
    count: Math.round(weighted("count")),
    mean: weighted("mean"),
    top2Mean: weighted("top2Mean"),
    bottom2Mean: weighted("bottom2Mean"),
    std: weighted("std"),
    p10: weighted("p10"),
    q1: weighted("q1"),
    q3: weighted("q3"),
    p90: weighted("p90"),
    iqr: weighted("iqr"),
    spreadRatio: weighted("spreadRatio"),
    upperEdge: weighted("upperEdge"),
    lowerEdge: weighted("lowerEdge")
  }
}

function emptyPriceStats(): Record<string, number> {
  return {
    count: 0,
    mean: 0,
    top2Mean: 0,
    bottom2Mean: 0,
    std: 0,
    p10: 0,
    q1: 0,
    q3: 0,
    p90: 0,
    iqr: 0,
    spreadRatio: 0,
    upperEdge: 0,
    lowerEdge: 0
  }
}

function quantileSorted(values: number[], ratio: number): number {
  if (!values || values.length === 0) {
    return 0
  }

  const q = Math.max(0, Math.min(1, ratio))
  const idx = (values.length - 1) * q
  const left = Math.floor(idx)
  const right = Math.ceil(idx)
  if (left === right) {
    return values[left]
  }

  const frac = idx - left
  return values[left] + (values[right] - values[left]) * frac
}

export function toSizeTag(w: number, h: number): string {
  return SIZE_TAG_BY_DIMENSION[`${w}x${h}`] || `${w}x${h}`
}

export function canPlaceRect(
  col: number,
  row: number,
  w: number,
  h: number,
  gridCols: number,
  gridRows: number,
  occupancy: number[][]
): boolean {
  if (col + w > gridCols || row + h > gridRows) {
    return false
  }

  for (let y = row; y < row + h; y += 1) {
    for (let x = col; x < col + w; x += 1) {
      if (occupancy[y][x]) {
        return false
      }
    }
  }

  return true
}

export function weightedPick(pool: Array<{ weight: number; [key: string]: any }>): Record<string, any> {
  const total = pool.reduce((sum, item) => sum + item.weight, 0)
  let cursor = Math.random() * total

  for (const item of pool) {
    cursor -= item.weight
    if (cursor <= 0) {
      return item
    }
  }

  return pool[pool.length - 1]
}
