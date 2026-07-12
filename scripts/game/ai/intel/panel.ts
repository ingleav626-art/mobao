/**
 * @file scripts/game/ai/intel/panel.ts
 * @module ai/intel/panel
 * @description AI 情报面板渲染 Mixin。渲染私有情报面板（线索列表、候选藏品、
 *              高价值追踪、邻居状态标签），以及玩家查询辅助方法。
 *
 * @requires core/utils - toCellKey, fromCellKey, sizeTagToCellCount
 * @requires data/artifacts - QUALITY_CONFIG, ARTIFACT_LIBRARY, toSizeTag
 * @requires ./pure - determineRevealLevel, truncateCandidateList, buildNeighborStateLabel, getNeighborOffsets
 * @exports PanelMixin - 面板渲染子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { AiIntelSignal, HighValueTrack } from "../../../../types/ai"
import { toCellKey, fromCellKey } from "../../core/utils"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY, toSizeTag } from "../../data/artifacts"
import { sizeTagToCellCount } from "../../core/utils"
import {
  determineRevealLevel,
  truncateCandidateList,
  buildNeighborStateLabel,
  getNeighborOffsets
} from "./pure"

export const PanelMixin: ThisType<WarehouseSceneThis> = {
  getPlayerById(playerId: number | string) {
    return this.players.find((entry) => entry.id === playerId) || null
  },

  getAiNeighborStateLabel(playerId: string | number, x: number, y: number) {
    const inBounds = this.isInBoundsCell(x, y)
    if (!inBounds) {
      return buildNeighborStateLabel(false, undefined)
    }
    const pool = this.ensureAiPrivateIntel(String(playerId))
    const key = toCellKey(x, y)
    return buildNeighborStateLabel(true, pool.knownCellStates[key])
  },

  buildNeighborSnapshot(playerId: string, cell: { x: number; y: number } | null) {
    if (!cell) {
      return null
    }
    const result: Record<string, string> = {}
    for (const offset of getNeighborOffsets()) {
      result[offset.label] = this.getAiNeighborStateLabel(playerId, cell.x + offset.dx, cell.y + offset.dy)
    }
    return result
  },

  buildAiAggregateIntelBlock(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
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
  },

  buildTrackCandidatePreview(revealState: {
    qualityKey: string | null
    category: string | null
    sizeTag: string | null
  }) {
    type CandidateItem = {
      name: string
      basePrice: number
      w: number
      h: number
      expectedPrice: number
      previewSizeTag: string
      qualityKey: string
    }
    let candidates: CandidateItem[] = this.artifactManager.getCandidatesByRevealState(revealState) as CandidateItem[]
    if (!candidates || candidates.length === 0) {
      const threshold = this.getHighValuePriceThreshold()
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
  },

  buildAiHighValueTrackBlock(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const tracks = pool.highValueTracks || []

    return tracks.map((track: HighValueTrack) => {
      const item = this.items.find((entry) => entry.id === track.itemId)
      const knowledge = pool.itemKnowledge[track.itemId] || null
      const knownCells =
        knowledge && knowledge.knownCells
          ? [...knowledge.knownCells]
            .map((cellKey) => fromCellKey(cellKey))
            .filter((c): c is { x: number; y: number } => c !== null)
          : []
      const anchorCell = knownCells[0] || null

      const revealState = {
        qualityKey: knowledge && knowledge.qualityKey ? knowledge.qualityKey : null,
        category: knowledge && knowledge.category ? knowledge.category : null,
        sizeTag: knowledge && knowledge.sizeTag ? knowledge.sizeTag : null
      }
      const candidatePreview = this.buildTrackCandidatePreview(revealState)
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
          knownCells: knownCells.map((cell) => ({ row: cell.y + 1, col: cell.x + 1 })),
          neighborState: this.buildNeighborSnapshot(playerId, anchorCell)
        },
        internalRef: item ? item.id : track.itemId
      }
    })
  },

  buildAiPrivateIntelBlock(playerId: string) {
    return {
      aggregate: this.buildAiAggregateIntelBlock(playerId),
      highValueTracks: this.buildAiHighValueTrackBlock(playerId)
    }
  }
}
