/**
 * @file scripts/game/ai/intel-manager/panel-fns.ts
 * @module ai/intel-manager/panel-fns
 * @description AiIntelManager 面板渲染相关函数：邻居状态、聚合情报、候选预览、高价值追踪。
 */
import type { Player } from "../../../../types/game"
import type { AiIntelSignal, HighValueTrack } from "../../../../types/ai"
import type { AiIntelManagerDeps, AiIntelState } from "../intel-manager"
import { buildNeighborStateLabel, getNeighborOffsets, determineRevealLevel, truncateCandidateList } from "../intel/pure"
import { toCellKey, fromCellKey, sizeTagToCellCount } from "../../core/utils"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY, toSizeTag } from "../../data/artifacts"
import { ensureAiPrivateIntel, getHighValuePriceThreshold } from "./init-fns"

/** 按 ID 查找玩家 */
export function getPlayerById(deps: AiIntelManagerDeps, playerId: number | string): Player | null {
  return deps.players.find((entry: Player) => entry.id === playerId) || null
}

/** 获取 AI 邻居状态标签 */
export function getAiNeighborStateLabel(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string | number,
  x: number,
  y: number
): string {
  const inBounds = deps.isInBoundsCell(x, y)
  if (!inBounds) {
    return buildNeighborStateLabel(false, undefined)
  }
  const pool = ensureAiPrivateIntel(state, String(playerId))
  const key = toCellKey(x, y)
  return buildNeighborStateLabel(true, pool.knownCellStates[key])
}

/** 构建邻居快照（8 方向状态） */
export function buildNeighborSnapshot(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  cell: { x: number; y: number } | null
): Record<string, string> | null {
  if (!cell) {
    return null
  }
  const result: Record<string, string> = {}
  for (const offset of getNeighborOffsets()) {
    result[offset.label] = getAiNeighborStateLabel(deps, state, playerId, cell.x + offset.dx, cell.y + offset.dy)
  }
  return result
}

/** 构建聚合情报块（按品质/品类统计） */
export function buildAiAggregateIntelBlock(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string
): {
  byQuality: Array<{ quality: string; count: number; deepestRow: number | null; estimatedOccupiedCells: number | null }>
  byCategory: Array<{ category: string; count: number; qualityHint: string }>
  signalCount: number
} {
  const pool = ensureAiPrivateIntel(state, playerId)
  const qualityMap: Record<
    string,
    {
      count: number
      deepestRow: number
      estimatedCellCount: number
      estimatedCellSamples: number
      knownQualityCount: number
      highQualityCount: number
      qualityLabel: string
      qualityKey: string
    }
  > = {}
  const categoryMap: Record<
    string,
    {
      count: number
      deepestRow: number
      estimatedCellCount: number
      estimatedCellSamples: number
      knownQualityCount: number
      highQualityCount: number
      category: string
    }
  > = {}

  pool.qualitySignals.forEach((signal: AiIntelSignal) => {
    if (!signal || !signal.qualityKey) {
      return
    }
    const key = signal.qualityKey
    if (!qualityMap[key]) {
      qualityMap[key] = {
        qualityKey: key,
        qualityLabel: QUALITY_CONFIG[key] ? QUALITY_CONFIG[key].label : key,
        count: 0,
        deepestRow: 0,
        estimatedCellCount: 0,
        estimatedCellSamples: 0,
        knownQualityCount: 0,
        highQualityCount: 0
      }
    }
    qualityMap[key].count += 1
    if (signal.sampleCell && Number.isFinite(signal.sampleCell.y)) {
      qualityMap[key].deepestRow = Math.max(qualityMap[key].deepestRow, signal.sampleCell.y + 1)
    }
    const knowledge = signal.itemId ? pool.itemKnowledge[signal.itemId] : undefined
    const sizeCells = knowledge && knowledge.sizeTag ? sizeTagToCellCount(knowledge.sizeTag) : null
    if (sizeCells !== null && Number.isFinite(sizeCells) && sizeCells > 0) {
      qualityMap[key].estimatedCellCount += sizeCells
      qualityMap[key].estimatedCellSamples += 1
    }
  })

  pool.outlineSignals.forEach((signal: AiIntelSignal) => {
    if (!signal || !signal.category) {
      return
    }
    const key = signal.category
    if (!categoryMap[key]) {
      categoryMap[key] = {
        category: key,
        count: 0,
        deepestRow: 0,
        estimatedCellCount: 0,
        estimatedCellSamples: 0,
        highQualityCount: 0,
        knownQualityCount: 0
      }
    }
    categoryMap[key].count += 1
    const knowledge = signal.itemId ? pool.itemKnowledge[signal.itemId] : undefined
    if (knowledge && knowledge.qualityKey) {
      categoryMap[key].knownQualityCount += 1
      if (knowledge.qualityKey === "rare" || knowledge.qualityKey === "legendary") {
        categoryMap[key].highQualityCount += 1
      }
    }
  })

  const byQuality = Object.values(qualityMap)
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      quality: entry.qualityLabel,
      count: entry.count,
      deepestRow: entry.deepestRow || null,
      estimatedOccupiedCells:
        entry.estimatedCellSamples > 0 ? Math.round(entry.estimatedCellCount / entry.estimatedCellSamples) : null
    }))

  const byCategory = Object.values(categoryMap)
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      qualityHint:
        entry.knownQualityCount > 0
          ? `已知品质中高品质 ${entry.highQualityCount}/${entry.knownQualityCount}`
          : "暂无品质细分"
    }))

  return {
    byQuality,
    byCategory,
    signalCount: pool.signalHistory.length
  }
}

/** 构建追踪候选预览（根据揭示状态筛选候选藏品） */
export function buildTrackCandidatePreview(
  deps: AiIntelManagerDeps,
  revealState: {
    qualityKey: string | null
    category: string | null
    sizeTag: string | null
  }
): {
  total: number
  truncated: boolean
  list: Array<{
    name: string
    basePrice: number
    w: number
    h: number
    expectedPrice: number
    previewSizeTag: string
    qualityKey: string
  }>
} {
  type CandidateItem = {
    name: string
    basePrice: number
    w: number
    h: number
    expectedPrice: number
    previewSizeTag: string
    qualityKey: string
  }
  let candidates: CandidateItem[] = deps.artifactManager.getCandidatesByRevealState(revealState)
  if (!candidates || candidates.length === 0) {
    const threshold = getHighValuePriceThreshold(deps)
    candidates = ARTIFACT_LIBRARY.filter(
      (entry) => entry.qualityKey === "legendary" || entry.basePrice >= threshold
    ).map((entry) => ({
      ...entry,
      expectedPrice: entry.basePrice,
      previewSizeTag: toSizeTag(entry.w, entry.h)
    }))
  }

  const sorted = [...candidates].sort(
    (a, b) => (b.expectedPrice || b.basePrice || 0) - (a.expectedPrice || a.basePrice || 0)
  )
  return truncateCandidateList(sorted)
}

/** 构建高价值追踪块 */
export function buildAiHighValueTrackBlock(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string
): Array<{
  trackId: string
  revealLevel: string
  confirmed: { quality: string; category: string; exactArtifact: string | null }
  candidates: {
    total: number
    truncated: boolean
    list: Array<{ name: string; refPriceRange: [number, number]; sizeCells: number | null }>
  }
  spatial: {
    knownCells: Array<{ row: number; col: number }>
    neighborState: Record<string, string> | null
  }
  internalRef: string
}> {
  const pool = ensureAiPrivateIntel(state, playerId)
  const tracks = pool.highValueTracks || []

  return tracks.map((track: HighValueTrack) => {
    const item = deps.items.find((entry) => entry.id === track.itemId)
    const knowledge = pool.itemKnowledge[track.itemId] || null
    const knownCells =
      knowledge && knowledge.knownCells
        ? [...knowledge.knownCells]
            .map((cellKey: string) => fromCellKey(cellKey))
            .filter((c: { x: number; y: number } | null): c is { x: number; y: number } => c !== null)
        : []
    const anchorCell = knownCells[0] || null

    const revealState = {
      qualityKey: knowledge && knowledge.qualityKey ? knowledge.qualityKey : null,
      category: knowledge && knowledge.category ? knowledge.category : null,
      sizeTag: knowledge && knowledge.sizeTag ? knowledge.sizeTag : null
    }
    const candidatePreview = buildTrackCandidatePreview(deps, revealState)
    const exactKnown = candidatePreview.total === 1
    const revealLevel = determineRevealLevel(knowledge, exactKnown)

    return {
      trackId: track.trackId,
      revealLevel,
      confirmed: {
        quality:
          knowledge && knowledge.qualityKey
            ? QUALITY_CONFIG[knowledge.qualityKey]
              ? QUALITY_CONFIG[knowledge.qualityKey].label
              : knowledge.qualityKey
            : "未知",
        category: knowledge && knowledge.category ? knowledge.category : "未知",
        exactArtifact: exactKnown && candidatePreview.list[0] ? candidatePreview.list[0].name : null
      },
      candidates: {
        total: candidatePreview.total,
        truncated: candidatePreview.truncated,
        list: candidatePreview.list.map((entry) => ({
          name: entry.name,
          refPriceRange: [
            Math.round((entry.expectedPrice || entry.basePrice || 0) * 0.9),
            Math.round((entry.expectedPrice || entry.basePrice || 0) * 1.1)
          ],
          sizeCells: entry.w && entry.h ? entry.w * entry.h : sizeTagToCellCount(entry.previewSizeTag)
        }))
      },
      spatial: {
        knownCells: knownCells.map((cell: { x: number; y: number }) => ({ row: cell.y + 1, col: cell.x + 1 })),
        neighborState: buildNeighborSnapshot(deps, state, playerId, anchorCell)
      },
      internalRef: item ? item.id : track.itemId
    }
  })
}

/** 构建私有情报块（聚合+高价值追踪） */
export function buildAiPrivateIntelBlock(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string
): {
  aggregate: ReturnType<typeof buildAiAggregateIntelBlock>
  highValueTracks: ReturnType<typeof buildAiHighValueTrackBlock>
} {
  return {
    aggregate: buildAiAggregateIntelBlock(deps, state, playerId),
    highValueTracks: buildAiHighValueTrackBlock(deps, state, playerId)
  }
}
