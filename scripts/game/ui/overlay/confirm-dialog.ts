/**
 * @file scripts/game/ui/overlay/confirm-dialog.ts
 * @module ui/overlay/confirm-dialog
 * @description 通用确认对话框 Mixin。负责游戏内确认/取消弹窗的显示与隐藏，
 *              回调通过实例属性暂存，供 events-overlay 中的按钮事件触发。
 *
 * @exports ConfirmDialogMixin - 确认对话框子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"

export const ConfirmDialogMixin: ThisType<WarehouseSceneThis> = {
  showGameConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void {
    if (this.dom.gameConfirmMsg) this.dom.gameConfirmMsg.textContent = message
    this._gameConfirmCallback = onConfirm || null
    this._gameCancelCallback = onCancel || null
    this.dom.gameConfirmOverlay?.classList.remove("hidden")
  },

  hideGameConfirm(): void {
    this.dom.gameConfirmOverlay?.classList.add("hidden")
    this._gameConfirmCallback = null
    this._gameCancelCallback = null
  }
}
