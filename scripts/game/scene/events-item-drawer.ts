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
