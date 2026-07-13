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
  deps.dom.gameConfirmOverlay?.classList.remove("hidden")
}

export function hideGameConfirm(deps: UiOverlayManagerDeps, state: UiOverlayManagerState): void {
  deps.dom.gameConfirmOverlay?.classList.add("hidden")
  state.gameConfirmCallback = null
  state.gameCancelCallback = null
}