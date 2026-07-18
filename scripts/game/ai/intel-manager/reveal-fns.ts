/**
 * @file scripts/game/ai/intel-manager/reveal-fns.ts
 * @module ai/intel-manager/reveal-fns
 * @description AiIntelManager 揭示执行相关函数：私有揭示、信号构建、知识追踪、候选目标选择。
 */
import type { Artifact } from "../../../../types/game"
import type { AiIntelSignal, AiItemKnowledge, HighValueTrack } from "../../../../types/ai"
import type { AiIntelManagerDeps, AiIntelState } from "../intel-manager"
import { pickRandomItemCell, determineRevealLevel } from "../intel/pure"
import { toCellKey, shuffle, formatTrackIndex } from "../../core/utils"
import { QUALITY_CONFIG, toSizeTag } from "../../data/artifacts"
import { ensureAiPrivateIntel, isHighValueArtifact } from "./init-fns"
import { buildTrackCandidatePreview } from "./panel-fns"
import type {
  ItemResult,
  BottomCell,
  TrackUpdate,
  SignalStatsPair,
  ArtifactInfo,
  ItemActionType
} from "./item-result"

// ─── 函数 ───

/** 构建技能上下文（供 SkillDef.execute 调用） */
export function buildSkillContext(deps: AiIntelManagerDeps): {
  revealOutline: (opts: {
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }) => unknown
  revealQuality: (opts: {
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }) => unknown
  revealAll: (opts: {
    count: number
    sortStrategy: string
    category: string | null
    allowCategoryFallback: boolean
  }) => unknown
  revealByQuality: (opts: { qualityKey: string }) => unknown
  revealByCategory: (opts: { category: string }) => unknown
  computeAveragePrice: (opts: { scope: string }) => { ok: boolean; revealed: number; message: string }
  applyBonus: (opts: { id: string; scope: string; condition: string; value: number }) => { ok: boolean; revealed: number; message: string }
} {
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
    }) => deps.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy),
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
    }) => deps.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy),
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
    }) => deps.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback }),
    revealByQuality: ({ qualityKey }: { qualityKey: string }) =>
      deps.revealAllByQuality?.(qualityKey) ?? { ok: false, revealed: 0, message: "函数不可用。" },
    revealByCategory: ({ category }: { category: string }) =>
      deps.revealAllByCategory?.(category) ?? { ok: false, revealed: 0, message: "函数不可用。" },
    computeAveragePrice: ({ scope }: { scope: string }) =>
      computeAveragePrice(deps.items, scope),
    applyBonus: (opts: { id: string; scope: string; condition: string; value: number }) =>
      deps.applyBonus?.(opts.id, opts.scope, opts.condition, opts.value) ?? { ok: false, revealed: 0, message: "函数不可用。" }
  }
}

/** 构建 AI 私有揭示上下文（供技能/道具 execute 调用） */
export function buildAiPrivateRevealContext(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string
): {
  revealOutline: (opts: {
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string | null
  }) => unknown
  revealQuality: (opts: {
    count: number
    category: string | null
    allowCategoryFallback?: boolean
    sortStrategy: string
  }) => unknown
  revealAll: (opts: {
    count: number
    sortStrategy: string
    category: string | null
    allowCategoryFallback: boolean
  }) => unknown
  revealByQuality: (opts: { qualityKey: string }) => unknown
  revealByCategory: (opts: { category: string }) => unknown
  computeAveragePrice: (opts: { scope: string }) => { ok: boolean; revealed: number; message: string }
  applyBonus: (opts: { id: string; scope: string; condition: string; value: number }) => { ok: boolean; revealed: number; message: string }
} {
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
      revealPrivateIntelBatch(deps, state, playerId, "outline", count, category, allowCategoryFallback, sortStrategy ?? ""),
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
    }) =>
      revealPrivateIntelBatch(deps, state, playerId, "quality", count, category, allowCategoryFallback, sortStrategy),
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
    }) => revealPrivateIntelFully(deps, state, playerId, { count, sortStrategy, category, allowCategoryFallback }),
    revealByQuality: ({ qualityKey }: { qualityKey: string }) =>
      revealPrivateIntelAllByQuality(deps, state, playerId, qualityKey),
    revealByCategory: ({ category }: { category: string }) =>
      revealPrivateIntelAllByCategory(deps, state, playerId, category),
    computeAveragePrice: ({ scope }: { scope: string }) =>
      computeAveragePrice(deps.items, scope),
    applyBonus: (opts: { id: string; scope: string; condition: string; value: number }) =>
      deps.applyBonus?.(opts.id, opts.scope, opts.condition, opts.value) ?? { ok: false, revealed: 0, message: "函数不可用。" }
  }
}

/** 标记 AI 已知格子状态 */
export function markAiKnownCellState(
  state: AiIntelState,
  playerId: string,
  x: number,
  y: number,
  cellState: string
): void {
  const pool = ensureAiPrivateIntel(state, playerId)
  const key = toCellKey(x, y)
  pool.knownCellStates[key] = cellState || "empty"
}

/** 扫描指定格子周围的邻居状态 */
export function scanNeighborIntelAroundCell(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  x: number,
  y: number
): void {
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
    if (!deps.isInBoundsCell(nx, ny)) {
      return
    }
    const cellState = deps.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
    markAiKnownCellState(state, playerId, nx, ny, cellState)
  })
}

/** 标记藏品所有格子为已占用 */
export function markAllItemCellsAsOccupied(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact
): void {
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) {
      if (deps.isInBoundsCell(x, y)) {
        markAiKnownCellState(state, playerId, x, y, "occupied")
      }
    }
  }
}

/** 扫描藏品边界邻居状态 */
export function scanItemBoundaryNeighbors(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact
): void {
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
        [1, 1]
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
export function buildAiPrivateSignal(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact,
  mode: string
): AiIntelSignal {
  const cell = pickRandomItemCell(item)
  const baseSignal: AiIntelSignal & { round: number; mode: string } = {
    itemId: item.id,
    round: deps.getRound(),
    mode
  }

  if (mode === "outline") {
    Object.assign(baseSignal, {
      category: item.category,
      sizeTag: toSizeTag(item.w, item.h),
      sampleCell: cell
    })

    markAllItemCellsAsOccupied(deps, state, playerId, item)
    scanItemBoundaryNeighbors(deps, state, playerId, item)
  } else {
    Object.assign(baseSignal, {
      qualityKey: item.qualityKey,
      sampleCell: cell
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
      knownCells: new Set()
    }
  }
  return pool.itemKnowledge[itemId]
}

/** 确保高价值藏品追踪记录存在 */
export function ensureAiHighValueTrack(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact
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
      lastSeenRound: deps.getRound()
    })
    return { trackId, created: true }
  }

  const track: HighValueTrack | undefined = pool.highValueTracks.find(
    (entry: HighValueTrack) => entry.itemId === item.id
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
  mode: string
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
      (entry: HighValueTrack) => entry.itemId === item.id
    )
    if (track) {
      track.lastSeenRound = deps.getRound()
      const revealState = {
        qualityKey: intel.qualityKey,
        category: intel.category,
        sizeTag: intel.sizeTag
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
  sortStrategy: string | null
): ItemResult {
  const targets = pickPrivateRevealTargets(deps, state, {
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

  const pool = ensureAiPrivateIntel(state, playerId)
  const signals: AiIntelSignal[] = []
  const trackUpdates: TrackUpdate[] = []

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
  // 统一返回：所有模式（轮廓/品质）都返回最底部藏品坐标
  const bottomCell: BottomCell | null = deps.pickBottomCellFromTargets(targets)
  const actionType: ItemActionType = mode === "outline" ? "outline" : "quality"

  return {
    ok: true,
    revealed: targets.length,
    message: `揭示了${targets.length}件${mode === "outline" ? "轮廓" : "品质"}目标。`,
    actionType,
    itemCount: mode === "outline" ? targets.length : undefined,
    qualityCellCount: mode === "quality" ? targets.length : undefined,
    signals,
    signalStats,
    trackUpdates,
    bottomCell
  }
}

/**
 * 对单个藏品应用完整揭示副作用（轮廓+品质 signal、加入 set、触发 track、更新 knowledge）。
 *
 * 供 `revealPrivateIntelFully` / `revealPrivateIntelAllByQuality` / `revealPrivateIntelAllByCategory`
 * 三处复用，确保所有揭示类道具走相同的画布状态更新流程。
 *
 * 返回该藏品的 outlineSignal + qualitySignal + 关联的 trackUpdates。
 */
function applyFullRevealSideEffects(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  item: Artifact
): {
  outlineSignal: AiIntelSignal
  qualitySignal: AiIntelSignal
  trackUpdates: TrackUpdate[]
} {
  const pool = ensureAiPrivateIntel(state, playerId)
  const outlineSignal = buildAiPrivateSignal(deps, state, playerId, item, "outline")
  const qualitySignal = buildAiPrivateSignal(deps, state, playerId, item, "quality")

  pool.knownOutlineIds.add(item.id)
  pool.knownQualityIds.add(item.id)
  pool.outlineSignals.push(outlineSignal)
  pool.qualitySignals.push(qualitySignal)

  const trackUpdates: TrackUpdate[] = []
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

  return { outlineSignal, qualitySignal, trackUpdates }
}

/** 把 Artifact 转换为精简的 ArtifactInfo（揭示类返回的藏品完整信息） */
function toArtifactInfo(item: Artifact): ArtifactInfo {
  const qualityLabel = QUALITY_CONFIG[item.qualityKey]?.label ?? item.qualityKey
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    qualityKey: item.qualityKey,
    quality: qualityLabel,
    sizeTag: toSizeTag(item.w, item.h),
    w: item.w,
    h: item.h,
    basePrice: item.basePrice,
    x: item.x,
    y: item.y
  }
}

/** 把信号数组追加到 pool.signalHistory（带 160 截顶） */
function pushSignalHistory(pool: ReturnType<typeof ensureAiPrivateIntel>, signals: AiIntelSignal[]): void {
  pool.signalHistory.push(...signals)
  if (pool.signalHistory.length > 160) {
    pool.signalHistory = pool.signalHistory.slice(-160)
  }
}

/** 计算并刷新最新+累计信号统计 */
function refreshSignalStats(
  deps: AiIntelManagerDeps,
  pool: ReturnType<typeof ensureAiPrivateIntel>,
  signals: AiIntelSignal[]
): SignalStatsPair {
  const signalStats = deps.artifactManager.getSignalPriceStats(signals)
  const totalStats = deps.artifactManager.getSignalPriceStats(pool.signalHistory)
  pool.latestSignalStats = signalStats
  pool.aggregateStats = totalStats.aggregate
  return signalStats
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
    allowCategoryFallback
  }: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }
): ItemResult {
  const pool = ensureAiPrivateIntel(state, playerId)
  const unrevealed = deps.items.filter(
    (item: Artifact) => !pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id)
  )

  const sortByArea = (arr: Artifact[], strategy: string | null) => {
    const shuffled = shuffle(arr)
    if (strategy === "smallestFirst") {
      return shuffled.sort((a, b) => { const aa = a.w * a.h; const bb = b.w * b.h; return aa - bb })
    } else if (strategy === "largestFirst") {
      return shuffled.sort((a, b) => { const aa = a.w * a.h; const bb = b.w * b.h; return bb - aa })
    } else if (strategy === "highestPrice") {
      return shuffled.sort((a, b) => b.basePrice - a.basePrice)
    } else if (strategy === "lowestPrice") {
      return shuffled.sort((a, b) => a.basePrice - b.basePrice)
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
  const trackUpdates: TrackUpdate[] = []

  targets.forEach((item: Artifact) => {
    const sideEffects = applyFullRevealSideEffects(deps, state, playerId, item)
    signals.push(sideEffects.outlineSignal, sideEffects.qualitySignal)
    trackUpdates.push(...sideEffects.trackUpdates)
  })

  pushSignalHistory(pool, signals)
  refreshSignalStats(deps, pool, signals)  // 更新 AI 内存（不走 LLM 回调）
  const bottomCell: BottomCell | null = deps.pickBottomCellFromTargets(targets)

  return {
    ok: true,
    revealed: targets.length,
    message: `完全揭示了${targets.length}件藏品。`,
    actionType: "reveal",
    artifacts: targets.map(toArtifactInfo),
    signals,
    trackUpdates,
    bottomCell
  }
}

/** AI 情报侧：揭示指定品质的所有藏品 */
export function revealPrivateIntelAllByQuality(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  qualityKey: string
): ItemResult {
  const pool = ensureAiPrivateIntel(state, playerId)
  const targets = deps.items.filter(
    (item: Artifact) =>
      item.qualityKey === qualityKey &&
      (!pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id))
  )
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: `没有未揭示的${qualityKey}品质藏品。` }
  }

  const signals: AiIntelSignal[] = []
  const trackUpdates: TrackUpdate[] = []

  targets.forEach((item: Artifact) => {
    const sideEffects = applyFullRevealSideEffects(deps, state, playerId, item)
    signals.push(sideEffects.outlineSignal, sideEffects.qualitySignal)
    trackUpdates.push(...sideEffects.trackUpdates)
  })

  pushSignalHistory(pool, signals)
  refreshSignalStats(deps, pool, signals)
  const bottomCell: BottomCell | null = deps.pickBottomCellFromTargets(targets)

  return {
    ok: true,
    revealed: targets.length,
    message: `揭示了${targets.length}件${qualityKey}品质藏品。`,
    actionType: "reveal",
    artifacts: targets.map(toArtifactInfo),
    signals,
    trackUpdates,
    bottomCell
  }
}

/** AI 情报侧：揭示指定品类的所有藏品 */
export function revealPrivateIntelAllByCategory(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  category: string
): ItemResult {
  const pool = ensureAiPrivateIntel(state, playerId)
  const targets = deps.items.filter(
    (item: Artifact) =>
      item.category === category &&
      (!pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id))
  )
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: `没有未揭示的${category}藏品。` }
  }

  const signals: AiIntelSignal[] = []
  const trackUpdates: TrackUpdate[] = []

  targets.forEach((item: Artifact) => {
    const sideEffects = applyFullRevealSideEffects(deps, state, playerId, item)
    signals.push(sideEffects.outlineSignal, sideEffects.qualitySignal)
    trackUpdates.push(...sideEffects.trackUpdates)
  })

  pushSignalHistory(pool, signals)
  refreshSignalStats(deps, pool, signals)
  const bottomCell: BottomCell | null = deps.pickBottomCellFromTargets(targets)

  return {
    ok: true,
    revealed: targets.length,
    message: `揭示了${targets.length}件${category}藏品。`,
    actionType: "reveal",
    artifacts: targets.map(toArtifactInfo),
    signals,
    trackUpdates,
    bottomCell
  }
}


export function pickPrivateRevealTargets(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  {
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
  }
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
      return shuffled.sort((a, b) => { const aa = a.w * a.h; const bb = b.w * b.h; return aa - bb })
    } else if (strategy === "largestFirst") {
      return shuffled.sort((a, b) => { const aa = a.w * a.h; const bb = b.w * b.h; return bb - aa })
    } else if (strategy === "highestPrice") {
      return shuffled.sort((a, b) => b.basePrice - a.basePrice)
    } else if (strategy === "lowestPrice") {
      return shuffled.sort((a, b) => a.basePrice - b.basePrice)
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

/** 均价计算（纯函数，不修改任何状态） */
export function computeAveragePrice(
  items: Artifact[],
  scope: string
): ItemResult {
  if (!items || items.length === 0) {
    return { ok: false, revealed: 0, message: "无可计算藏品。", actionType: "average", scope }
  }

  let targets: Artifact[]
  let label: string

  if (scope === "total") {
    targets = items
    label = "全场"
  } else if (scope === "singleCell") {
    targets = items.filter((i) => i.w === 1 && i.h === 1)
    label = "单格"
  } else if (scope === "doubleCell") {
    targets = items.filter((i) => i.w * i.h === 2)
    label = "双格"
  } else if (scope === "quadCell") {
    targets = items.filter((i) => i.w === 2 && i.h === 2)
    label = "四格"
  } else if (scope.startsWith("quality:")) {
    const qualityKey = scope.slice("quality:".length)
    targets = items.filter((i) => i.qualityKey === qualityKey)
    const qc = QUALITY_CONFIG[qualityKey]
    label = qc ? qc.label : qualityKey
  } else if (scope.startsWith("category:")) {
    const category = scope.slice("category:".length)
    targets = items.filter((i) => i.category === category)
    label = category
  } else {
    return { ok: false, revealed: 0, message: "未知均价范围。", actionType: "average", scope }
  }

  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: `${label}无藏品。`, actionType: "average", scope: label, itemCount: 0 }
  }
  const sum = targets.reduce((s, i) => s + (i.basePrice || 0), 0)
  const avg = Math.round(sum / targets.length)
  return {
    ok: true,
    revealed: 0,
    message: `${label}均价：${avg}`,
    actionType: "average",
    averagePrice: avg,
    scope: label,
    itemCount: targets.length
  }
}
