/**
 * @file scripts/game/scene/events-ai-panel.ts
 * @module scene/events-ai-panel
 * @description AI 逻辑面板事件绑定。绑定面板开关、消息查看、日志渲染等事件监听器。
 *
 * @exports bindAiPanelEvents - AI 逻辑面板事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function bindAiPanelEvents(this: WarehouseSceneThis): void {
  this.dom.aiLogicBtn?.addEventListener("click", () => this.uiOverlayManager.openAiLogicPanel())
  if (this.dom.aiLogicCloseBtn) {
    this.dom.aiLogicCloseBtn?.addEventListener("click", () => this.uiOverlayManager.closeAiLogicPanel())
  }
  if (this.dom.aiLogicOverlay) {
    this.dom.aiLogicOverlay?.addEventListener("click", (event) => {
      if (event.target === this.dom.aiLogicOverlay) {
        this.uiOverlayManager.closeAiLogicPanel()
      }
    })
  }
  if (this.dom.aiViewMessagesBtn) {
    this.dom.aiViewMessagesBtn?.addEventListener("click", () => this.showAiConversationMessages())
  }
}
