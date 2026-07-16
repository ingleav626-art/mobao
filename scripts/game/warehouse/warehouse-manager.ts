/**
 * @file warehouse-manager.ts
 * @module warehouse/warehouse-manager
 * @description WarehouseManager -- 薄协调器（~150 行）。
 *              所有方法体委托给 warehouse-manager/ 下的独立函数文件。
 *              依赖接口和状态接口定义在 warehouse-manager/types.ts。
 */
import type { Artifact } from "../../../types/game"
import { GRID_COLS, GRID_ROWS } from "../core/constants"
import { createLogger } from "../core/logger"
import {
  findFirstEmptySlot,
  isInBoundsCell,
  hasAnyInfo,
  getItemKnownText,
  pickBottomCellFromTargets,
  pickRevealTargets,
  type RevealMode
} from "./index"
import {
  preloadArtifactImages,
  drawUnknownWarehouse,
  drawGridLines,
  guardWarehouseCapacity,
  spawnRandomItems,
  setupWarehouseAuction,
  placeItem,
  rebuildWarehouseCellIndex,
  isWarehouseCellOccupied,
  renderItem,
  onArtifactClicked
} from "./warehouse-manager/core-fns"
import {
  revealOutlineBatch,
  revealQualityBatch,
  revealArtifactFully,
  revealArtifactFullyBatch,
  playFullRevealEffect,
  hideRevealScrollHints,
  showRevealScrollHintsForTargets,
  refreshRevealScrollHints,
  revealOutline,
  revealQualityCell,
  playOutlineRevealEffect,
  playQualityRevealEffect,
  clearQualityVisual,
  renderQualityVisual,
  syncQualityMarkersForOutlinedItem,
  revealCell
} from "./warehouse-manager/reveal-fns"
import {
  positionPreview,
  applyPreviewPosition,
  repositionPreview,
  hidePreview,
  setupPreviewTouchScroll,
  isPointOnSettlementLockedItem,
  renderPreviewCandidates,
  renderSettlementItemPreview
} from "./warehouse-manager/preview-fns"
import type { WarehouseManagerDeps, WarehouseManagerState } from "./warehouse-manager/types"
export type { WarehouseManagerDeps, WarehouseManagerState }

const log = createLogger("Warehouse")

/**
 * 仓库管理器（薄协调器）。合并原 WarehouseCoreMixin + WarehouseRevealMixin + WarehousePreviewMixin 的逻辑。
 * 方法体委托到独立函数文件，构造函数注入依赖。
 */
export class WarehouseManager {
  constructor(private readonly deps: WarehouseManagerDeps) {}

  // ─── WarehouseCoreMixin 逻辑 ───

  preloadArtifactImages(): void {
    preloadArtifactImages(this.deps)
  }
  drawUnknownWarehouse(): void {
    drawUnknownWarehouse(this.deps)
  }
  drawGridLines(): void {
    drawGridLines(this.deps)
  }
  guardWarehouseCapacity(): void {
    guardWarehouseCapacity(this.deps)
  }
  spawnRandomItems(): void {
    spawnRandomItems(this.deps)
  }
  setupWarehouseAuction(): void {
    setupWarehouseAuction(this.deps)
  }
  findFirstEmptySlot(occupancy: boolean[][]): { col: number; row: number } | null {
    return findFirstEmptySlot(occupancy, GRID_ROWS, GRID_COLS)
  }
  placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]): void {
    placeItem(item, slot, occupancy)
  }
  rebuildWarehouseCellIndex(): void {
    rebuildWarehouseCellIndex(this.deps)
  }
  isInBoundsCell(x: number, y: number): boolean {
    return isInBoundsCell(x, y, GRID_COLS, GRID_ROWS)
  }
  isWarehouseCellOccupied(x: number, y: number): boolean {
    return isWarehouseCellOccupied(this.deps, x, y)
  }
  renderItem(item: Artifact): void {
    renderItem(this.deps, item)
  }
  onArtifactClicked(item: Artifact, pointer: { x: number; y: number }): void {
    onArtifactClicked(this.deps, item, pointer)
  }
  hasAnyInfo(item: Artifact): boolean {
    return hasAnyInfo(item)
  }
  getItemKnownText(item: Artifact): string {
    return getItemKnownText(item)
  }

  // ─── WarehouseRevealMixin 逻辑 ───

  revealOutlineBatch(
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ): ReturnType<typeof revealOutlineBatch> {
    return revealOutlineBatch(this.deps, count, category, allowCategoryFallback, sortStrategy)
  }
  revealQualityBatch(
    count: number,
    category: string | null,
    allowCategoryFallback: boolean,
    sortStrategy: string | null
  ): ReturnType<typeof revealQualityBatch> {
    return revealQualityBatch(this.deps, count, category, allowCategoryFallback, sortStrategy)
  }
  revealArtifactFully(item: Artifact, options: Record<string, unknown> = {}): ReturnType<typeof revealArtifactFully> {
    return revealArtifactFully(this.deps, item, options)
  }
  revealArtifactFullyBatch(options: {
    count: number
    sortStrategy: string | null
    category: string | null
    allowCategoryFallback: boolean
  }): ReturnType<typeof revealArtifactFullyBatch> {
    return revealArtifactFullyBatch(this.deps, options)
  }
  playFullRevealEffect(item: Artifact): void {
    playFullRevealEffect(this.deps, item)
  }
  pickBottomCellFromTargets(targets: Artifact[]): ReturnType<typeof pickBottomCellFromTargets> {
    return pickBottomCellFromTargets(targets)
  }
  hideRevealScrollHints(): void {
    hideRevealScrollHints(this.deps)
  }
  showRevealScrollHintsForTargets(targets: Artifact[], message: string): void {
    showRevealScrollHintsForTargets(this.deps, targets, message)
  }
  refreshRevealScrollHints(): void {
    refreshRevealScrollHints(this.deps)
  }
  pickRevealTargets(opts: {
    mode: string
    count: number
    category: string | null
    allowCategoryFallback: boolean
    sortStrategy: string | null
  }): Artifact[] {
    return pickRevealTargets(this.deps.state.items, {
      mode: opts.mode as RevealMode,
      count: opts.count,
      category: opts.category,
      allowCategoryFallback: opts.allowCategoryFallback,
      sortStrategy: opts.sortStrategy
    })
  }
  revealOutline(item: Artifact, options: Record<string, unknown> = {}): void {
    revealOutline(this.deps, item, options)
  }
  revealQualityCell(item: Artifact, options: Record<string, unknown> = {}): void {
    revealQualityCell(this.deps, item, options)
  }
  playOutlineRevealEffect(item: Artifact): void {
    playOutlineRevealEffect(this.deps, item)
  }
  playQualityRevealEffect(item: Artifact): void {
    playQualityRevealEffect(this.deps, item)
  }
  clearQualityVisual(item: Artifact, keepImage: boolean = false): void {
    clearQualityVisual(this.deps, item, keepImage)
  }
  renderQualityVisual(item: Artifact, options: Record<string, unknown> = {}): void {
    renderQualityVisual(this.deps, item, options)
  }
  syncQualityMarkersForOutlinedItem(item: Artifact, options: Record<string, unknown> = {}): void {
    syncQualityMarkersForOutlinedItem(this.deps, item, options)
  }
  revealCell(col: number, row: number): void {
    revealCell(this.deps, col, row)
  }

  // ─── WarehousePreviewMixin 逻辑 ───

  positionPreview(canvasX: number, canvasY: number): void {
    log.debug("[manager] positionPreview CALLED, canvasX={0}, canvasY={1}", canvasX, canvasY)
    positionPreview(this.deps, canvasX, canvasY)
  }
  applyPreviewPosition(): void {
    applyPreviewPosition(this.deps)
  }
  repositionPreview(): void {
    repositionPreview(this.deps)
  }
  hidePreview(): void {
    log.debug("[manager] hidePreview CALLED")
    hidePreview(this.deps)
  }
  setupPreviewTouchScroll(): void {
    setupPreviewTouchScroll(this.deps)
  }
  isPointOnSettlementLockedItem(x: number, y: number): boolean {
    return isPointOnSettlementLockedItem(this.deps, x, y)
  }
  renderPreviewCandidates(item: Artifact): void {
    renderPreviewCandidates(this.deps, item)
  }
  renderSettlementItemPreview(item: Artifact): void {
    renderSettlementItemPreview(this.deps, item)
  }
}
