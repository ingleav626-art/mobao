/**
 * @file scripts/game/warehouse/core.ts
 * @module warehouse/core
 * @description 仓库核心 Mixin（薄代理层）。方法体委托到 WarehouseManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"

export const WarehouseCoreMixin: ThisType<WarehouseSceneThis> = {
  preloadArtifactImages() {
    return this.warehouseManager.preloadArtifactImages()
  },

  drawUnknownWarehouse() {
    return this.warehouseManager.drawUnknownWarehouse()
  },

  drawGridLines() {
    return this.warehouseManager.drawGridLines()
  },

  guardWarehouseCapacity() {
    return this.warehouseManager.guardWarehouseCapacity()
  },

  spawnRandomItems() {
    return this.warehouseManager.spawnRandomItems()
  },

  setupWarehouseAuction() {
    return this.warehouseManager.setupWarehouseAuction()
  },

  findFirstEmptySlot(occupancy: boolean[][]): { col: number; row: number } | null {
    return this.warehouseManager.findFirstEmptySlot(occupancy)
  },

  placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]) {
    return this.warehouseManager.placeItem(item, slot, occupancy)
  },

  rebuildWarehouseCellIndex() {
    return this.warehouseManager.rebuildWarehouseCellIndex()
  },

  isInBoundsCell(x: number, y: number): boolean {
    return this.warehouseManager.isInBoundsCell(x, y)
  },

  isWarehouseCellOccupied(x: number, y: number): boolean {
    return this.warehouseManager.isWarehouseCellOccupied(x, y)
  },

  renderItem(item: Artifact) {
    return this.warehouseManager.renderItem(item)
  },

  onArtifactClicked(item: Artifact, pointer: { x: number; y: number }) {
    return this.warehouseManager.onArtifactClicked(item, pointer)
  },

  hasAnyInfo(item: Artifact): boolean {
    return this.warehouseManager.hasAnyInfo(item)
  },

  getItemKnownText(item: Artifact): string {
    return this.warehouseManager.getItemKnownText(item)
  }
}
