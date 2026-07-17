/**
 * @file confirm-dialog-fns.ts
 * @module ui/overlay-manager/confirm-dialog-fns
 * @description 通用确认对话框操作函数
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import type { UiOverlayManagerState } from "../overlay-manager"

export function showGameConfirm(
  deps: UiOverlayManagerDeps,
  state: UiOverlayManagerState,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
): void {
  if (deps.dom.gameConfirmMsg) deps.dom.gameConfirmMsg.textContent = message
  state.gameConfirmCallback = onConfirm || null
  state.gameCancelCallback = onCancel || null
  deps.setGameConfirmCallback(onConfirm || null)
  deps.setGameCancelCallback(onCancel || null)
  deps.dom.gameConfirmOverlay?.classList.remove("hidden")
  // 同步到 Vue uiStore
  import("../../../vue/stores/uiStore")
    .then(({ useUiStore }) => {
      useUiStore().showConfirm(message, onConfirm, onCancel)
    })
    .catch(() => {
      // Vue 未初始化时跳过
    })
}

export function hideGameConfirm(deps: UiOverlayManagerDeps, state: UiOverlayManagerState): void {
  deps.dom.gameConfirmOverlay?.classList.add("hidden")
  state.gameConfirmCallback = null
  state.gameCancelCallback = null
  deps.setGameConfirmCallback(null)
  deps.setGameCancelCallback(null)
  // 同步到 Vue uiStore
  import("../../../vue/stores/uiStore")
    .then(({ useUiStore }) => {
      useUiStore().hideConfirm()
    })
    .catch(() => {
      // Vue 未初始化时跳过
    })
}
