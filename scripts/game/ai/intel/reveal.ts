import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { Artifact, RevealResult } from "../../../../types/game"
import type {
  AiIntelSignal,
  AiItemKnowledge,
  AiSignalStats,
  IntelActionPlan,
  HighValueTrack
} from "../../../../types/ai"
import {
  toCellKey,
  shuffle,
  formatTrackIndex
} from "../../core/utils"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { GAME_SETTINGS } from "../../core/settings"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY, toSizeTag } from "../../data/artifacts"
import {
  pickRandomItemCell,
  calcHighValuePriceThreshold,
  checkHighValueArtifact,
  determineRevealLevel,
  truncateCandidateList,
  buildNeighborStateLabel,
  getNeighborOffsets,
  formatIntelActionPublicLine
} from "./pure"

export {
  pickRandomItemCell,
  calcHighValuePriceThreshold,
  checkHighValueArtifact,
  determineRevealLevel,
  truncateCandidateList,
  buildNeighborStateLabel,
  getNeighborOffsets,
  formatIntelActionPublicLine
}

export const RevealMixin: ThisType<WarehouseSceneThis> = {
  buildSkillContext() {
    return {
      revealOutline: ({
        count,
        category,
        allowCategoryFallback = false,
        sortStrategy
      }: {
        count: number
        category: string | null
        allowCategoryFallback?: boolean
        sortStrategy: string | null
      }) => this.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy),
      revealQuality: ({
        count,
        category,
        allowCategoryFallback = false,
        sortStrategy
      }: {
        count: number
        category: string | null
        allowCategoryFallback?: boolean
        sortStrategy: string | null
      }) => this.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy),
      revealAll: ({
        count,
        sortStrategy,
        category,
        allowCategoryFallback
      }: {
        count: number
        sortStrategy: string
        category: string | null
        allowCategoryFallback: boolean
      }) => this.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback })
    }
  },

  buildAiPrivateRevealContext(playerId: string) {
    return {
      revealOutline: ({
        count,
        category,
        allowCategoryFallback = false,
        sortStrategy
      }: {
        count: number
        category: string | null
        allowCategoryFallback?: boolean
        sortStrategy: string | null
      }) =>
        this.revealPrivateIntelBatch(playerId, "outline", count, category, allowCategoryFallback, sortStrategy ?? ""),
      revealQuality: ({
        count,
        category,
        allowCategoryFallback = false,
        sortStrategy
      }: {
        count: number
        category: string | null
        allowCategoryFallback?: boolean
        sortStrategy: string
      }) => this.revealPrivateIntelBatch(playerId, "quality", count, category, allowCategoryFallback, sortStrategy),
      revealAll: ({
        count,
        sortStrategy,
        category,
        allowCategoryFallback
      }: {
        count: number
        sortStrategy: string
        category: string | null
        allowCategoryFallback: boolean
      }) => this.revealPrivateIntelFully(playerId, { count, sortStrategy, category, allowCategoryFallback })
    }
  },

  pickRandomItemCell(item: Artifact) {
    return pickRandomItemCell(item)
  },

  markAiKnownCellState(playerId: string, x: number, y: number, state: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const key = toCellKey(x, y)
    pool.knownCellStates[key] = state || "empty"
  },

  scanNeighborIntelAroundCell(playerId: string, x: number, y: number) {
    const offsets = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1]
    ]

    offsets.forEach(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      if (!this.isInBoundsCell(nx, ny)) {
        return
      }
      const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
      this.markAiKnownCellState(playerId, nx, ny, state)
    })
  },

  markAllItemCellsAsOccupied(playerId: string, item: Artifact) {
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        if (this.isInBoundsCell(x, y)) {
          this.markAiKnownCellState(playerId, x, y, "occupied")
        }
      }
    }
  },

  scanItemBoundaryNeighbors(playerId: string, item: Artifact) {
    const scanned = new Set()
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        const offsets = [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1]
        ]
        offsets.forEach(([dx, dy]) => {
          const nx = x + dx
          const ny = y + dy
          if (!this.isInBoundsCell(nx, ny)) {
            return
          }
          const key = `${nx},${ny}`
          if (scanned.has(key)) {
            return
          }
          if (nx >= item.x && nx < item.x + item.w && ny >= item.y && ny < item.y + item.h) {
            return
          }
          scanned.add(key)
          const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
          this.markAiKnownCellState(playerId, nx, ny, state)
        })
      }
    }
  },

  buildAiPrivateSignal(playerId: string, item: Artifact, mode: string) {
    const cell = this.pickRandomItemCell(item)
    const baseSignal = {
      itemId: item.id,
      round: this.round,
      mode
    }

    if (mode === "outline") {
      Object.assign(baseSignal, {
        category: item.category,
        sizeTag: toSizeTag(item.w, item.h),
        sampleCell: cell
      })

      this.markAllItemCellsAsOccupied(playerId, item)
      this.scanItemBoundaryNeighbors(playerId, item)
    } else {
      Object.assign(baseSignal, {
        qualityKey: item.qualityKey,
        sampleCell: cell
      })

      if (cell) {
        this.markAiKnownCellState(playerId, cell.x, cell.y, "occupied")
        this.scanNeighborIntelAroundCell(playerId, cell.x, cell.y)
      }
    }

    return baseSignal
  },

  ensureAiItemKnowledge(playerId: string, itemId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    if (!pool.itemKnowledge[itemId]) {
      pool.itemKnowledge[itemId] = {
        revealCount: 0,
        lastSeenRound: 0,
        category: null,
        qualityKey: null,
        sizeTag: null,
        knownCells: new Set()
      }
    }
    return pool.itemKnowledge[itemId]
  },

  getHighValuePriceThreshold() {
    if (
      this.highValuePriceThreshold !== null &&
      Number.isFinite(this.highValuePriceThreshold) &&
      this.highValuePriceThreshold > 0
    ) {
      return this.highValuePriceThreshold
    }
    const prices = ARTIFACT_LIBRARY.map((entry) => Number(entry.basePrice) || 0)
    this.highValuePriceThreshold = calcHighValuePriceThreshold(prices)
    return this.highValuePriceThreshold
  },

  isHighValueArtifact(item: Artifact) {
    const threshold = this.getHighValuePriceThreshold()
    return checkHighValueArtifact(item, threshold)
  },

  ensureAiHighValueTrack(playerId: string, item: Artifact) {
    if (!this.isHighValueArtifact(item)) {
      return null
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    let trackId = pool.highValueTrackByItemId[item.id]
    if (!trackId) {
      trackId = `红${formatTrackIndex(pool.nextTrackIndex)}`
      pool.nextTrackIndex += 1
      pool.highValueTrackByItemId[item.id] = trackId
      pool.highValueTracks.push({
        trackId,
        itemId: item.id,
        createdRound: this.round,
        lastSeenRound: this.round
      })
      return { trackId, created: true }
    }

    const track: HighValueTrack | undefined = pool.highValueTracks.find(
      (entry: HighValueTrack) => entry.itemId === item.id
    )
    if (track) {
      track.lastSeenRound = this.round
    }
    return { trackId, created: false }
  },

  updateAiItemKnowledge(
    playerId: string,
    item: Artifact,
    signal: { sampleCell?: { x: number; y: number } } | null,
    mode: string
  ): AiItemKnowledge & {
    trackUpdate?: {
      trackId: string
      revealLevel: string
      confirmed: { quality: string; category: string; exactArtifact: string | null }
      candidates: { total: number; truncated: boolean }
    }
  } {
    const intel = this.ensureAiItemKnowledge(playerId, item.id)
    intel.revealCount += 1
    intel.lastSeenRound = this.round

    if (mode === "outline") {
      intel.category = item.category
      intel.sizeTag = toSizeTag(item.w, item.h)
    } else if (mode === "quality") {
      intel.qualityKey = item.qualityKey
    }

    if (signal && signal.sampleCell) {
      intel.knownCells.add(toCellKey(signal.sampleCell.x, signal.sampleCell.y))
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    const trackId = pool.highValueTrackByItemId[item.id]
    if (trackId) {
      const track: HighValueTrack | undefined = pool.highValueTracks.find(
        (entry: HighValueTrack) => entry.itemId === item.id
      )
      if (track) {
        track.lastSeenRound = this.round
        const revealState = {
          qualityKey: intel.qualityKey,
          category: intel.category,
          sizeTag: intel.sizeTag
        }
        const candidatePreview = this.buildTrackCandidatePreview(revealState)
        const exactKnown = candidatePreview.total === 1
        const revealLevel = determineRevealLevel(intel, exactKnown)

        return {
          ...intel,
          trackUpdate: {
            trackId,
            revealLevel,
            confirmed: {
              quality: intel.qualityKey
                ? QUALITY_CONFIG[intel.qualityKey]
                  ? QUALITY_CONFIG[intel.qualityKey].label
                  : intel.qualityKey
                : "未知",
              category: intel.category ? intel.category : "未知",
              exactArtifact: exactKnown && candidatePreview.list[0] ? candidatePreview.list[0].name : null
            },
            candidates: {
              total: candidatePreview.total,
              truncated: candidatePreview.truncated
            }
          }
        }
      }
    }

    return intel
  },

  revealPrivateIntelBatch(
    playerId: string,
    mode: string,
    count: number,
    category: string | null,
    allowCategoryFallback = false,
    sortStrategy: string | null
  ) {
    const targets = this.pickPrivateRevealTargets({
      playerId,
      mode,
      count,
      category,
      allowCategoryFallback,
      sortStrategy
    })

    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示目标。" }
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    const signals: AiIntelSignal[] = []
    const trackUpdates: Array<{
      trackId: string
      created?: boolean
      revealLevel?: string
      confirmed?: { quality: string; category: string; exactArtifact: string | null }
      candidates?: { total: number; truncated: boolean }
    }> = []

    targets.forEach((item) => {
      const signal = this.buildAiPrivateSignal(playerId, item, mode)
      if (mode === "outline") {
        pool.knownOutlineIds.add(item.id)
        pool.outlineSignals.push(signal)
      } else {
        pool.knownQualityIds.add(item.id)
        pool.qualitySignals.push(signal)
        const trackUpdate = this.ensureAiHighValueTrack(playerId, item)
        if (trackUpdate) {
          trackUpdates.push(trackUpdate)
        }
      }

      const knowledgeUpdate = this.updateAiItemKnowledge(playerId, item, signal, mode)
      if (knowledgeUpdate.trackUpdate) {
        trackUpdates.push(knowledgeUpdate.trackUpdate)
      }

      signals.push(signal)
    })

    pool.signalHistory.push(...signals)
    if (pool.signalHistory.length > 160) {
      pool.signalHistory = pool.signalHistory.slice(-160)
    }

    const signalStats = this.artifactManager.getSignalPriceStats(signals)
    const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
    pool.latestSignalStats = signalStats
    pool.aggregateStats = totalStats.aggregate
    const bottomCell = mode === "outline" ? this.pickBottomCellFromTargets(targets) : null

    return {
      ok: true,
      revealed: targets.length,
      signals,
      signalStats,
      trackUpdates,
      bottomCell
    }
  },

  revealPrivateIntelFully(
    playerId: string,
    {
      count,
      sortStrategy,
      category,
      allowCategoryFallback
    }: { count: number; sortStrategy: string; category: string; allowCategoryFallback: boolean }
  ) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const unrevealed = this.items.filter(
      (item) => !pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id)
    )

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let targetPool
    if (category) {
      const primary = unrevealed.filter((item) => item.category === category)
      targetPool = sortByArea(primary, sortStrategy)

      if (targetPool.length < count && allowCategoryFallback) {
        const existedIds = new Set(targetPool.map((item) => item.id))
        const fallback = unrevealed.filter((item) => !existedIds.has(item.id))
        targetPool = targetPool.concat(sortByArea(fallback, sortStrategy))
      }
    } else {
      targetPool = sortByArea(unrevealed, sortStrategy)
    }

    const targets = targetPool.slice(0, count)
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可完全揭示的藏品。" }
    }

    const signals: AiIntelSignal[] = []
    const trackUpdates: Array<{
      trackId: string
      created?: boolean
      revealLevel?: string
      confirmed?: { quality: string; category: string; exactArtifact: string | null }
      candidates?: { total: number; truncated: boolean }
    }> = []

    targets.forEach((item) => {
      const outlineSignal = this.buildAiPrivateSignal(playerId, item, "outline")
      const qualitySignal = this.buildAiPrivateSignal(playerId, item, "quality")

      pool.knownOutlineIds.add(item.id)
      pool.knownQualityIds.add(item.id)
      pool.outlineSignals.push(outlineSignal)
      pool.qualitySignals.push(qualitySignal)

      const trackUpdate = this.ensureAiHighValueTrack(playerId, item)
      if (trackUpdate) {
        trackUpdates.push(trackUpdate)
      }

      const outlineKnowledge = this.updateAiItemKnowledge(playerId, item, outlineSignal, "outline")
      if (outlineKnowledge.trackUpdate) {
        trackUpdates.push(outlineKnowledge.trackUpdate)
      }

      const qualityKnowledge = this.updateAiItemKnowledge(playerId, item, qualitySignal, "quality")
      if (qualityKnowledge.trackUpdate) {
        trackUpdates.push(qualityKnowledge.trackUpdate)
      }

      signals.push(outlineSignal, qualitySignal)
    })

    pool.signalHistory.push(...signals)
    if (pool.signalHistory.length > 160) {
      pool.signalHistory = pool.signalHistory.slice(-160)
    }

    const signalStats = this.artifactManager.getSignalPriceStats(signals)
    const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
    pool.latestSignalStats = signalStats
    pool.aggregateStats = totalStats.aggregate

    return {
      ok: true,
      revealed: targets.length,
      signals,
      signalStats,
      trackUpdates
    }
  },

  pickPrivateRevealTargets({
    playerId,
    mode,
    count,
    category,
    allowCategoryFallback = false,
    sortStrategy
  }: {
    playerId: string
    mode: string
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const knownSet = mode === "outline" ? pool.knownOutlineIds : pool.knownQualityIds

    const isUnknown = (item: Artifact) => {
      return !knownSet.has(item.id)
    }

    const primary = this.items.filter((item) => {
      if (category && item.category !== category) {
        return false
      }
      return isUnknown(item)
    })

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let selected = sortByArea(primary, sortStrategy).slice(0, count)
    if (selected.length < count && allowCategoryFallback && category) {
      const existed = new Set(selected.map((item) => item.id))
      const fallback = this.items.filter((item) => !existed.has(item.id) && isUnknown(item))
      selected = selected.concat(sortByArea(fallback, sortStrategy).slice(0, count - selected.length))
    }

    return selected
  }
}
