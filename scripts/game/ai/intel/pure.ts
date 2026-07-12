/**
 * @file scripts/game/ai/intel/pure.ts
 * @module ai/intel/pure
 * @description AI 情报系统的可独立测试纯函数。从原 intel.ts 提取，
 *              包含随机选格、高价值阈值计算、揭示级别判定、
 *              候选列表截断、邻居状态标签、不确定性计算等。
 *
 * @requires core/utils - 工具函数（clamp, formatCompactNumber 等）
 * @exports pickRandomItemCell, calcHighValuePriceThreshold, checkHighValueArtifact,
 *          determineRevealLevel, truncateCandidateList, formatIntelActionPublicLine,
 *          buildNeighborStateLabel, getNeighborOffsets, calcUncertainty, calcAvailableActionState
 */
import type { AiSignalStats } from "../../../../types/ai"
import { compactOneLine, formatCompactNumber, formatTrackIndex, clamp } from "../../core/utils"

export function pickRandomItemCell(item: {
  x: number
  y: number
  w: number
  h: number
}): { x: number; y: number } | null {
  const cells: { x: number; y: number }[] = []
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) {
      cells.push({ x, y })
    }
  }
  return cells.length > 0 ? cells[Math.floor(Math.random() * cells.length)] : null
}

export function calcHighValuePriceThreshold(prices: number[], fallback = 6000, minThreshold = 5200): number {
  const sorted = prices.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return fallback
  const idx = Math.floor((sorted.length - 1) * 0.8)
  const p80 = sorted[idx] || sorted[sorted.length - 1]
  return Math.max(minThreshold, Math.round(p80))
}

export function checkHighValueArtifact(item: { qualityKey: string; basePrice: number }, threshold: number): boolean {
  return item.qualityKey === "legendary" || (Number(item.basePrice) || 0) >= threshold
}

export function determineRevealLevel(
  knowledge: { qualityKey: string | null; category: string | null } | null,
  exactKnown: boolean
): string {
  if (exactKnown) return "已完全确定"
  if (knowledge && knowledge.qualityKey && knowledge.category) return "范围缩小"
  if (knowledge && knowledge.qualityKey) return "仅知品质"
  if (knowledge && knowledge.category) return "已知品类"
  return "仅知轮廓"
}

export function truncateCandidateList<T>(sorted: T[], maxItems = 10): { total: number; truncated: boolean; list: T[] } {
  if (sorted.length <= maxItems) {
    return { total: sorted.length, truncated: false, list: sorted }
  }
  const half = Math.floor(maxItems / 2)
  return {
    total: sorted.length,
    truncated: true,
    list: sorted.slice(0, half).concat(sorted.slice(-half))
  }
}

export function formatIntelActionPublicLine(
  entry: { playerName: string; revealed: number; effectTag: string; detail: string; signalStats: AiSignalStats | null },
  itemLabel: string,
  compactFn: (text: string, maxLen?: number) => string = compactOneLine
): string {
  const revealText = entry.revealed > 0 ? `私有线索+${entry.revealed}` : "未命中"
  const stats = entry.signalStats
  const statsText =
    stats && stats.count > 0
      ? `，候选均值${formatCompactNumber(stats.mean)}，波动${(stats.spreadRatio * 100).toFixed(0)}%`
      : ""
  const tag = entry.effectTag ? `，${entry.effectTag}` : ""
  const detail = entry.detail ? `，结果:${compactFn(entry.detail, 100)}` : ""
  return `${entry.playerName} 使用${itemLabel || "未知"}（${revealText}${statsText}${tag}${detail}）`
}

export function buildNeighborStateLabel(isInBounds: boolean, rawState: string | undefined): string {
  if (!isInBounds) return "越界"
  if (rawState === "occupied") return "已被占用"
  if (rawState === "empty") return "确认空闲"
  return "尚未探明"
}

export function getNeighborOffsets(): Array<{ dx: number; dy: number; label: string }> {
  return [
    { dx: 0, dy: -1, label: "上" },
    { dx: 0, dy: 1, label: "下" },
    { dx: -1, dy: 0, label: "左" },
    { dx: 1, dy: 0, label: "右" },
    { dx: -1, dy: -1, label: "左上" },
    { dx: 1, dy: -1, label: "右上" },
    { dx: -1, dy: 1, label: "左下" },
    { dx: 1, dy: 1, label: "右下" }
  ]
}

export function calcUncertainty(params: {
  outlineCount: number
  qualityCount: number
  totalItems: number
  spreadRatio: number
  upperEdge: number
  lowerEdge: number
}): number {
  const total = Math.max(1, params.totalItems)
  const clueRate = clamp((params.outlineCount * 0.65 + params.qualityCount) / total, 0, 1)
  const qualityRate = clamp(params.qualityCount / total, 0, 1)
  const edgeBias = Math.max(0, params.upperEdge - params.lowerEdge)
  return clamp(
    0.88 - clueRate * 0.48 - qualityRate * 0.2 + params.spreadRatio * 0.35 - edgeBias * 0.08,
    0.05,
    1
  )
}

export function calcAvailableActionState(
  resource: { skills: Record<string, number>; items: Record<string, number> },
  skillDefs: Array<{ id: string; name: string }>,
  itemDefs: Array<{ id: string; name: string }>
): {
  availableSkillIds: string[]
  availableItemIds: string[]
  availableSkillNames: string[]
  availableItemNames: string[]
} {
  const availableSkillIds = skillDefs.filter((entry) => Number(resource.skills[entry.id] || 0) > 0).map(
    (entry) => entry.id
  )
  const availableItemIds = itemDefs.filter((entry) => Number(resource.items[entry.id] || 0) > 0).map(
    (entry) => entry.id
  )

  return {
    availableSkillIds,
    availableItemIds,
    availableSkillNames: skillDefs.filter((entry) => availableSkillIds.includes(entry.id)).map((entry) => entry.name),
    availableItemNames: itemDefs.filter((entry) => availableItemIds.includes(entry.id)).map((entry) => entry.name)
  }
}
