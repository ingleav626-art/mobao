/**
 * @file scripts/game/warehouse/preview.ts
 * @module warehouse/preview
 * @description 仓库预览 Mixin（薄代理层）。方法体委托到 WarehouseManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"

export const WarehousePreviewMixin: ThisType<WarehouseSceneThis> = {
  positionPreview(canvasX: number, canvasY: number) {
    return this.warehouseManager.positionPreview(canvasX, canvasY)
  },

  applyPreviewPosition() {
    return this.warehouseManager.applyPreviewPosition()
  },

  repositionPreview() {
    return this.warehouseManager.repositionPreview()
  },

  hidePreview() {
    return this.warehouseManager.hidePreview()
  },

  setupPreviewTouchScroll() {
    return this.warehouseManager.setupPreviewTouchScroll()
  },

  isPointOnSettlementLockedItem(x: number, y: number): boolean {
    return this.warehouseManager.isPointOnSettlementLockedItem(x, y)
  },

  renderPreviewCandidates(item: Artifact) {
    return this.warehouseManager.renderPreviewCandidates(item)
  },

  renderSettlementItemPreview(item: Artifact) {
    return this.warehouseManager.renderSettlementItemPreview(item)
  }
}
