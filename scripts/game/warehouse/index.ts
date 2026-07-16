/**
 * @file warehouse/index.ts
 * @module game/warehouse
 * @description 仓库核心系统。管理仓库网格的绘制、藏品生成与放置、揭示机制、
 *              候选预览等完整仓库逻辑。方法已迁移到 WarehouseScene 类。
 *
 * 共享类型 WarehouseSceneLike → ./types.ts
 *
 * 本文件保留可独立测试的纯函数。
 */
import { shuffle } from "../core/utils"

// ─── 独立函数（可独立测试）───

export function findFirstEmptySlot(
  occupancy: boolean[][],
  gridRows: number,
  gridCols: number
): { col: number; row: number } | null {
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridCols; col += 1) {
      if (!occupancy[row][col]) {
        return { col, row }
      }
    }
  }
  return null
}

export function isInBoundsCell(x: number, y: number, gridCols: number, gridRows: number): boolean {
  return x >= 0 && x < gridCols && y >= 0 && y < gridRows
}

export function hasAnyInfo(item: { revealed: { outline: boolean; qualityCell: unknown } }): boolean {
  return item.revealed.outline || Boolean(item.revealed.qualityCell)
}

export function getItemKnownText(item: {
  revealed: { outline: boolean; qualityCell: unknown }
  quality: { label: string }
  w: number
  h: number
}): string {
  const segments: string[] = []
  if (item.revealed.qualityCell) {
    segments.push(`品质=${item.quality.label}`)
  }
  if (item.revealed.outline) {
    segments.push(`占格=${item.w}x${item.h}`)
  }
  if (segments.length === 0) {
    return "未知藏品"
  }
  return segments.join(" | ")
}

export function pickBottomCellFromTargets(
  targets: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; col: number; row: number } | null {
  const list = Array.isArray(targets) ? targets : []
  if (list.length === 0) {
    return null
  }

  let selected = list[0]
  let maxBottomY = selected.y + selected.h - 1

  for (const item of list) {
    const bottomY = item.y + item.h - 1
    if (bottomY > maxBottomY) {
      selected = item
      maxBottomY = bottomY
    }
  }

  const x = Math.max(0, Math.round(selected.x))
  const y = Math.max(0, Math.round(maxBottomY))
  return { x, y, col: x + 1, row: y + 1 }
}

export type RevealMode = "outline" | "quality"

export function pickRevealTargets<
  T extends { id: string; category: string; revealed: { outline: boolean; qualityCell: unknown }; w: number; h: number }
>(
  items: T[],
  opts: {
    mode: RevealMode
    count: number
    category: string | null
    allowCategoryFallback: boolean
    sortStrategy: string | null
  }
): T[] {
  const { mode, count, category, allowCategoryFallback, sortStrategy } = opts

  const primary = items.filter((item) => {
    if (category && item.category !== category) return false
    if (mode === "outline") return !item.revealed.outline
    return !item.revealed.qualityCell
  })

  const sortByArea = (arr: T[], strategy: string | null): T[] => {
    const shuffled = shuffle(arr)
    if (strategy === "smallestFirst") {
      return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
    } else if (strategy === "largestFirst") {
      return shuffled.sort((a, b) => b.w * b.h - a.w * b.h)
    }
    return shuffled
  }

  let pool = sortByArea(primary, sortStrategy)
  let selected = pool.slice(0, count)

  if (selected.length < count && allowCategoryFallback && category) {
    const existedIds = new Set(selected.map((item) => item.id))
    const fallback = items.filter((item) => {
      if (existedIds.has(item.id)) return false
      if (mode === "outline") return !item.revealed.outline
      return !item.revealed.qualityCell
    })
    selected = selected.concat(sortByArea(fallback, sortStrategy).slice(0, count - selected.length))
  }

  return selected
}

// ─── Mixin re-export（向后兼容）───

export type { WarehouseSceneLike } from "./types"
