/**
 * @file scripts/game/ai/intel-manager/reveal-fns.ts
 * @module ai/intel-manager/reveal-fns
 * @description AiIntelManager 揭示执行相关函数：私有揭示、信号构建、知识追踪、候选目标选择。
 */
import type { Artifact } from "../../../../types/game"
import type { AiIntelSignal, AiItemKnowledge, HighValueTrack, AiSignalStats } from "../../../../types/ai"
import type { AiIntelManagerDeps, AiIntelState } from "../intel-manager"
import {
  pickRandomItemCell,
  determineRevealLevel,
} from "../intel/pure"
import { toCellKey, shuffle, formatTrackIndex } from "../../core/utils"
import { QUALITY_CONFIG, toSizeTag } from "../../data/artifacts"
import { ensureAiPrivateIntel, isHighValueArtifact } from "./init-fns"
import { buildTrackCandidatePreview } from "./panel-fns"

// ─── 辅助类型 ───

interface RevealBatchResult {
  ok: boolean
  revealed: number
  message?: string
  signals?: AiIntelSignal[]
  signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats }
  trackUpdates?: Array<{
    trackId: string
    created?: boolean
    revealLevel?: string
    confirmed?: { quality: string; category: string; exactArtifact: string | null }
    candidates?: { total: number; truncated: boolean }
  }>
  bottomCell?: unknown
}

interface RevealFullyResult {
  ok: boolean
  revealed: number
  message?: string
  signals?: AiIntelSignal[]
  signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats }
  trackUpdates?: Array<{
    trackId: string
    created?: boolean
    revealLevel?: string
    confirmed?: { quality: string; category: string; exactArtifact: string | null }
    candidates?: { total: number; truncated: boolean }
  }>
}

// ─── 函数 ───

/** 构建技能上下文（供 SkillDef.execute 调用） */
export function buildSkillContext(deps: AiIntelManagerDeps): {
  revealOutline: (opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }) => unknown
  revealQuality: (opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }) => unknown
  revealAll: (opts: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }) => unknown
} {
  return {
    revealOutline: ({
      count,
      category,
      allowCategoryFallback = false,
      sortStrategy,
    }: {
      count: number
      category: string | null
      allowCategoryFallback?: boolean
      sortStrategy: string | null
    }) => deps.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy),
    revealQuality: ({
      count,
      category,
      allowCategoryFallback = false,
      sortStrategy,
    }: {
      count: number
      category: string | null
      allowCategoryFallback?: boolean
      sortStrategy: string | null
    }) => deps.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy),
    revealAll: ({
      count,
      sortStrategy,
      category,
      allowCategoryFallback,
    }: {
      count: number
      sortStrategy: string
      category: string | null
      allowCategoryFallback: boolean
    }) => deps.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback }),
  }
}

/** 构建 AI 私有揭示上下文（供技能/道具 execute 调用） */
export function buildAiPrivateRevealContext(deps: AiIntelManagerDeps, state: AiIntelState, playerId: string): {
  revealOutline: (opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }) => unknown
  revealQuality: (opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string }) => unknown
  revealAll: (opts: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }) => unknown
} {
  return {
    revealOutline: ({
      count,
      category,
      allowCategoryFallback = false,
      sortStrategy,
    }: {
      count: number
      category: string | null
      allowCategoryFallback?: boolean
      sortStrategy: string | null
    }) => revealPrivateIntelBatch(deps, state, playerId, "outline", count, category, allowCategoryFallback, sortStrategy ?? ""),
    revealQuality: ({
      count,
      category,
      allowCategoryFallback = false,
      sortStrategy,
    }: {
      count: number
      category: string | null
      allowCategoryFallback?: boolean
      sortStrategy: string
    }) => revealPrivateIntelBatch(deps, state, playerId, "quality", count, category, allowCategoryFallback, sortStrategy),
    revealAll: ({
      count,
      sortStrategy,
      category,
      allowCategoryFallback,
    }: {
      count: number
      sortStrategy: string
      category: string | null
      allowCategoryFallback: boolean
    }) => revealPrivateIntelFully(deps, state, playerId, { count, sortStrategy, category, allowCategoryFallback }),
  }
}

/** 标记 AI 已知格子状态 */
export function markAiKnownCellState(state: AiIntelState, playerId: string, x: number, y: number, cellState: string): void {
  const pool = ensureAiPrivateIntel(state, playerId)
  const key = toCellKey(x, y)
  pool.knownCellStates[key] = cellState || "empty"
}

/** 扫描指定格子周围的邻居状态 */
export function scanNeighborIntelAroundCell(deps: AiIntelManagerDeps, state: AiIntelState, playerId: string, x: number, y: number): void {
  const offsets = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]

  offsets.forEach(([dx, dy]) => {
    const nx = x + dx
    const ny = y + dy
    if (!deps.isInBoundsCell(nx, ny)) {
      return
    }
    const cellState = deps.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
    markAiKnownCellState(state, playerId, nx, ny, cellState)
  })
}

/** 标记藏品所有格子为已占用 */
export function markAllItemCellsAsOccupied(deps: AiIntelManagerDeps, state: AiIntelState, playerId: string, item: Artifact): void {
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) {
      if (deps.isInBoundsCell(x, y)) {
        markAiKnownCellState(state, playerId, x, y, "occupied")
      }
    }
  }
}

/** 扫描藏品边界邻居状态 */
export function scanItemBoundaryNeighbors(deps: AiIntelManagerDeps, state: AiIntelState, playerId: string, item: Artifact): void {
  const scanned = new Set<string>()
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
        [1, 1],
      ]
      offsets.forEach(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        if (!deps.isInBoundsCell(nx, ny)) {
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
        const cellState = deps.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
        markAiKnownCellState(state, playerId, nx, ny, cellState)
      })
    }
  }
}

/** 构建 AI 私有信号（轮廓或品质） */
export function buildAiPrivateSignal(deps: AiIntelManagerDeps, state: AiIntelState, playerId: string, item: Artifact, mode: string): AiIntelSignal {
  const cell = pickRandomItemCell(item)
  const baseSignal: AiIntelSignal & { round: number; mode: string } = {
    itemId: item.id,
    round: deps.getRound(),
    mode,
  }

  if (mode === "outline") {
    Object.assign(baseSignal, {
      category: item.category,
      sizeTag: toSizeTag(item.w, item.h),
      sampleCell: cell,
    })

    markAllItemCellsAsOccupied(deps, state, playerId, item)
    scanItemBoundaryNeighbors(deps, state, playerId, item)
  } else {
    Object.assign(baseSignal, {
      qualityKey: item.qualityKey,
      sampleCell: cell,
    })

    if (cell) {
      markAiKnownCellState(state, playerId, cell.x, cell.y, "occupied")
      scanNeighborIntelAroundCell(deps, state, playerId, cell.x, cell.y)
    }
  }

  return baseSignal
}

/** 确保藏品知识记录存在 */
export function ensureAiItemKnowledge(state: AiIntelState, playerId: string, itemId: string): AiItemKnowledge {
  const pool = ensureAiPrivateIntel(state, playerId)
  if (!pool.itemKnowledge[itemId]) {
    pool.itemKnowledge[itemId] = {
      revealCount: 0,
      lastSeenRound: 0,
      category: null,
      qualityKey: null,
      sizeTag: null,
      knownCells: new Set(),
    }
  }
  return pool.itemKnowledge[itemId]
}

/** 确保高价值藏品追踪记录存在 */
export function ensureAiHighValueTrack(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact,
): { trackId: string; created: boolean } | null {
  if (!isHighValueArtifact(deps, item)) {
    return null
  }

  const pool = ensureAiPrivateIntel(state, playerId)
  let trackId = pool.highValueTrackByItemId[item.id]
  if (!trackId) {
    trackId = `红${formatTrackIndex(pool.nextTrackIndex)}`
    pool.nextTrackIndex += 1
    pool.highValueTrackByItemId[item.id] = trackId
    pool.highValueTracks.push({
      trackId,
      itemId: item.id,
      createdRound: deps.getRound(),
      lastSeenRound: deps.getRound(),
    })
    return { trackId, created: true }
  }

  const track: HighValueTrack | undefined = pool.highValueTracks.find(
    (entry: HighValueTrack) => entry.itemId === item.id,
  )
  if (track) {
    track.lastSeenRound = deps.getRound()
  }
  return { trackId, created: false }
}

/** 更新藏品知识（揭示后调用） */
export function updateAiItemKnowledge(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact,
  signal: { sampleCell?: { x: number; y: number } } | null,
  mode: string,
): AiItemKnowledge & {
  trackUpdate?: {
    trackId: string
    revealLevel: string
    confirmed: { quality: string; category: string; exactArtifact: string | null }
    candidates: { total: number; truncated: boolean }
  }
} {
  const intel = ensureAiItemKnowledge(state, playerId, item.id)
  intel.revealCount += 1
  intel.lastSeenRound = deps.getRound()

  if (mode === "outline") {
    intel.category = item.category
    intel.sizeTag = toSizeTag(item.w, item.h)
  } else if (mode === "quality") {
    intel.qualityKey = item.qualityKey
  }

  if (signal && signal.sampleCell) {
    intel.knownCells.add(toCellKey(signal.sampleCell.x, signal.sampleCell.y))
  }

  const pool = ensureAiPrivateIntel(state, playerId)
  const trackId = pool.highValueTrackByItemId[item.id]
  if (trackId) {
    const track: HighValueTrack | undefined = pool.highValueTracks.find(
      (entry: HighValueTrack) => entry.itemId === item.id,
    )
    if (track) {
      track.lastSeenRound = deps.getRound()
      const revealState = {
        qualityKey: intel.qualityKey,
        category: intel.category,
        sizeTag: intel.sizeTag,
      }
      const candidatePreview = buildTrackCandidatePreview(deps, revealState)
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
            exactArtifact: exactKnown && candidatePreview.list[0] ? candidatePreview.list[0].name : null,
          },
          candidates: {
            total: candidatePreview.total,
            truncated: candidatePreview.truncated,
          },
        },
      }
    }
  }

  return intel
}

/** 批量私有揭示（轮廓或品质模式） */
export function revealPrivateIntelBatch(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  mode: string,
  count: number,
  category: string | null,
  allowCategoryFallback = false,
  sortStrategy: string | null,
): RevealBatchResult {
  const targets = pickPrivateRevealTargets(deps, state, {
    playerId,
    mode,
    count,
    category,
    allowCategoryFallback,
    sortStrategy,
  })

  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: "没有可揭示目标。" }
  }

  const pool = ensureAiPrivateIntel(state, playerId)
  const signals: AiIntelSignal[] = []
  const trackUpdates: Array<{
    trackId: string
    created?: boolean
    revealLevel?: string
    confirmed?: { quality: string; category: string; exactArtifact: string | null }
    candidates?: { total: number; truncated: boolean }
  }> = []

  targets.forEach((item: Artifact) => {
    const signal = buildAiPrivateSignal(deps, state, playerId, item, mode)
    if (mode === "outline") {
      pool.knownOutlineIds.add(item.id)
      pool.outlineSignals.push(signal)
    } else {
      pool.knownQualityIds.add(item.id)
      pool.qualitySignals.push(signal)
      const trackUpdate = ensureAiHighValueTrack(deps, state, playerId, item)
      if (trackUpdate) {
        trackUpdates.push(trackUpdate)
      }
    }

    const knowledgeUpdate = updateAiItemKnowledge(deps, state, playerId, item, signal, mode)
    if (knowledgeUpdate.trackUpdate) {
      trackUpdates.push(knowledgeUpdate.trackUpdate)
    }

    signals.push(signal)
  })

  pool.signalHistory.push(...signals)
  if (pool.signalHistory.length > 160) {
    pool.signalHistory = pool.signalHistory.slice(-160)
  }

  const signalStats = deps.artifactManager.getSignalPriceStats(signals)
  const totalStats = deps.artifactManager.getSignalPriceStats(pool.signalHistory)
  pool.latestSignalStats = signalStats
  pool.aggregateStats = totalStats.aggregate
  const bottomCell = mode === "outline" ? deps.pickBottomCellFromTargets(targets) : null

  return {
    ok: true,
    revealed: targets.length,
    signals,
    signalStats,
    trackUpdates,
    bottomCell,
  }
}

/** 完全揭示私有情报（轮廓+品质） */
export function revealPrivateIntelFully(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  {
    count,
    sortStrategy,
    category,
    allowCategoryFallback,
  }: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean },
): RevealFullyResult {
  const pool = ensureAiPrivateIntel(state, playerId)
  const unrevealed = deps.items.filter(
    (item: Artifact) => !pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id),
  )

  const sortByArea = (arr: Artifact[], strategy: string | null) => {
    const shuffled = shuffle(arr)
    if (strategy === "smallestFirst") {
      return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
    } else if (strategy === "largestFirst") {
      return shuffled.sort((a, b) => b.w * b.h - a.w * b.h)
    }
    return shuffled
  }

  let targetPool: Artifact[]
  if (category) {
    const primary = unrevealed.filter((item: Artifact) => item.category === category)
    targetPool = sortByArea(primary, sortStrategy)

    if (targetPool.length < count && allowCategoryFallback) {
      const existedIds = new Set(targetPool.map((item) => item.id))
      const fallback = unrevealed.filter((item: Artifact) => !existedIds.has(item.id))
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

  targets.forEach((item: Artifact) => {
    const outlineSignal = buildAiPrivateSignal(deps, state, playerId, item, "outline")
    const qualitySignal = buildAiPrivateSignal(deps, state, playerId, item, "quality")

    pool.knownOutlineIds.add(item.id)
    pool.knownQualityIds.add(item.id)
    pool.outlineSignals.push(outlineSignal)
    pool.qualitySignals.push(qualitySignal)

    const trackUpdate = ensureAiHighValueTrack(deps, state, playerId, item)
    if (trackUpdate) {
      trackUpdates.push(trackUpdate)
    }

    const outlineKnowledge = updateAiItemKnowledge(deps, state, playerId, item, outlineSignal, "outline")
    if (outlineKnowledge.trackUpdate) {
      trackUpdates.push(outlineKnowledge.trackUpdate)
    }

    const qualityKnowledge = updateAiItemKnowledge(deps, state, playerId, item, qualitySignal, "quality")
    if (qualityKnowledge.trackUpdate) {
      trackUpdates.push(qualityKnowledge.trackUpdate)
    }

    signals.push(outlineSignal, qualitySignal)
  })

  pool.signalHistory.push(...signals)
  if (pool.signalHistory.length > 160) {
    pool.signalHistory = pool.signalHistory.slice(-160)
  }

  const signalStats = deps.artifactManager.getSignalPriceStats(signals)
  const totalStats = deps.artifactManager.getSignalPriceStats(pool.signalHistory)
  pool.latestSignalStats = signalStats
  pool.aggregateStats = totalStats.aggregate

  return {
    ok: true,
    revealed: targets.length,
    signals,
    signalStats,
    trackUpdates,
  }
}

/** 选择私有揭示目标 */
export function pickPrivateRevealTargets(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  {
    playerId,
    mode,
    count,
    category,
    allowCategoryFallback = false,
    sortStrategy,
  }: {
    playerId: string
    mode: string
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  },
): Artifact[] {
  const pool = ensureAiPrivateIntel(state, playerId)
  const knownSet = mode === "outline" ? pool.knownOutlineIds : pool.knownQualityIds

  const isUnknown = (item: Artifact) => {
    return !knownSet.has(item.id)
  }

  const primary = deps.items.filter((item: Artifact) => {
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
      return shuffled.sort((a, b) => b.w * b.h - a.w * b.h)
    }
    return shuffled
  }

  let selected = sortByArea(primary, sortStrategy).slice(0, count)
  if (selected.length < count && allowCategoryFallback && category) {
    const existed = new Set(selected.map((item) => item.id))
    const fallback = deps.items.filter((item: Artifact) => !existed.has(item.id) && isUnknown(item))
    selected = selected.concat(sortByArea(fallback, sortStrategy).slice(0, count - selected.length))
  }

  return selected
}