/**
 * @file mobile/mobile-handler/types.ts
 * @module mobile/mobile-handler/types
 * @description MobileHandler 单例的完整类型接口，供所有子模块 ThisType 使用。
 *              从原 mobile-handler.ts 内联类型注解提取为命名接口。
 */
export interface MobileHandlerType {
  isMobile: boolean
  isTouch: boolean
  portraitOverlay: HTMLElement | null
  fixedInputOverlay: HTMLElement | null
  fixedInputElement: HTMLInputElement | null
  fixedInputContainer: HTMLElement | null
  originalInput: HTMLInputElement | HTMLTextAreaElement | null
  isHidingFixedInput: boolean
  currentKeyboardHeight: number
  screenHeight: number
  pollIntervalId: ReturnType<typeof setInterval> | null
  init: () => void
  createFixedInputOverlay: () => void
  setupNativeKeyboardListener: () => void
  handleKeyboardHeightChange: (rawHeight: number) => void
  calculateSafeKeyboardHeight: (rawHeight: number) => number
  startPolling: () => void
  stopPolling: () => void
  updateInputPosition: () => void
  showFixedInput: (input: HTMLInputElement | HTMLTextAreaElement) => void
  checkAndUpdatePosition: () => void
  resetInputPosition: () => void
  hideFixedInput: () => void
  setupOrientationCheck: () => void
  setupKeyboardHandler: () => void
  setupVibrationFeedback: () => void
  setupCustomSelects: () => void
  convertToCustomSelect: (originalSelect: HTMLSelectElement) => void
  closeAllCustomSelects: () => void
}
