/**
 * @file scripts/game/warehouse/reveal.ts
 * @module warehouse/reveal
 * @description 仓库揭示 Mixin（薄代理层）。方法体委托到 WarehouseManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"

export const WarehouseRevealMixin: ThisType<WarehouseSceneThis> = {
  revealOutlineBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) {
    return this.warehouseManager.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy)
  },

  revealQualityBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) {
    return this.warehouseManager.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy)
  },

  revealArtifactFully(item: Artifact, options: Record<string, unknown> = {}) {
    return this.warehouseManager.revealArtifactFully(item, options)
  },

  revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback }: { count: number; sortStrategy: string | null; category: string | null; allowCategoryFallback: boolean }) {
    return this.warehouseManager.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback })
  },

  playFullRevealEffect(item: Artifact) {
    return this.warehouseManager.playFullRevealEffect(item)
  },

  pickBottomCellFromTargets(targets: Artifact[]): { x: number; y: number; col: number; row: number } | null {
    return this.warehouseManager.pickBottomCellFromTargets(targets)
  },

  hideRevealScrollHints() {
    return this.warehouseManager.hideRevealScrollHints()
  },

  showRevealScrollHintsForTargets(targets: Artifact[], message: string) {
    return this.warehouseManager.showRevealScrollHintsForTargets(targets, message)
  },

  refreshRevealScrollHints() {
    return this.warehouseManager.refreshRevealScrollHints()
  },

  pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy }: { mode: string; count: number; category: string | null; allowCategoryFallback: boolean; sortStrategy: string | null }): Artifact[] {
    return this.warehouseManager.pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy })
  },

  revealOutline(item: Artifact, options: Record<string, unknown> = {}) {
    return this.warehouseManager.revealOutline(item, options)
  },

  revealQualityCell(item: Artifact, options: Record<string, unknown> = {}) {
    return this.warehouseManager.revealQualityCell(item, options)
  },

  playOutlineRevealEffect(item: Artifact) {
    return this.warehouseManager.playOutlineRevealEffect(item)
  },

  playQualityRevealEffect(item: Artifact) {
    return this.warehouseManager.playQualityRevealEffect(item)
  },

  clearQualityVisual(item: Artifact, keepImage: boolean = false) {
    return this.warehouseManager.clearQualityVisual(item, keepImage)
  },

  renderQualityVisual(item: Artifact, options: Record<string, unknown> = {}) {
    return this.warehouseManager.renderQualityVisual(item, options)
  },

  syncQualityMarkersForOutlinedItem(item: Artifact, options: Record<string, unknown> = {}) {
    return this.warehouseManager.syncQualityMarkersForOutlinedItem(item, options)
  },

  revealCell(col: number, row: number) {
    return this.warehouseManager.revealCell(col, row)
  }
}
