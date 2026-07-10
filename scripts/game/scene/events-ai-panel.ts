import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function bindAiPanelEvents(this: WarehouseSceneThis): void {
  this.dom.aiLogicBtn?.addEventListener("click", () => this.openAiLogicPanel())
  if (this.dom.aiLogicCloseBtn) {
    this.dom.aiLogicCloseBtn?.addEventListener("click", () => this.closeAiLogicPanel())
  }
  if (this.dom.aiLogicOverlay) {
    this.dom.aiLogicOverlay?.addEventListener("click", (event) => {
      if (event.target === this.dom.aiLogicOverlay) {
        this.closeAiLogicPanel()
      }
    })
  }
  if (this.dom.aiViewMessagesBtn) {
    this.dom.aiViewMessagesBtn?.addEventListener("click", () => this.showAiConversationMessages())
  }
}
