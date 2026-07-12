/**
 * @file scripts/game/scene/events-item-drawer.ts
 * @module scene/events-item-drawer
 * @description 道具抽屉事件绑定。绑定道具使用按钮、抽屉开关/关闭等事件监听器。
 *
 * @exports bindItemDrawerEvents - 道具抽屉事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function bindItemDrawerEvents(this: WarehouseSceneThis): void {
  if (this.dom.itemOutlineBtn) {
    this.dom.itemOutlineBtn?.addEventListener("click", () => this.useItem("item-outline-lamp"))
  }
  if (this.dom.itemQualityBtn) {
    this.dom.itemQualityBtn?.addEventListener("click", () => this.useItem("item-quality-needle"))
  }
  if (this.dom.itemDrawerToggleBtn) {
    this.dom.itemDrawerToggleBtn?.addEventListener("click", () => this.toggleItemDrawer())
  }
  if (this.dom.itemDrawerCloseBtn) {
    this.dom.itemDrawerCloseBtn?.addEventListener("click", () => this.closeItemDrawer())
  }
  if (this.dom.itemDrawerList) {
    this.dom.itemDrawerList?.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      const button = target.closest("button[data-item-id]")
      if (!(button instanceof HTMLElement)) {
        return
      }
      const itemId = button.dataset.itemId
      if (!itemId) {
        return
      }
      this.useItem(itemId)
      this.closeItemDrawer()
    })
  }
}
