/**
 * @file mobile/mobile-handler.ts
 * @module mobile/mobile-handler
 * @description 移动端适配处理器薄入口。通过 Object.assign 合并 6 个子对象
 *              （Core/Keyboard/Input/Orientation/CustomSelect/Vibration），
 *              并 re-export 纯函数。原 812 行单例已按职责拆分到 mobile-handler/ 目录。
 *
 * @exports MobileHandler - 移动端适配处理器单例
 * @exports 纯函数 - detectMobile, detectTouch, calcSafeKeyboardHeight, isTextInputElement, isPortraitOrientation
 */
import type { MobileHandlerType } from "./mobile-handler/types"
import { CorePart } from "./mobile-handler/core"
import { KeyboardPart } from "./mobile-handler/keyboard"
import { InputPart } from "./mobile-handler/input"
import { OrientationPart } from "./mobile-handler/orientation"
import { CustomSelectPart } from "./mobile-handler/custom-select"
import { VibrationPart } from "./mobile-handler/vibration"
import { addStyles } from "./mobile-handler/styles"

export {
  detectMobile,
  detectTouch,
  calcSafeKeyboardHeight,
  isTextInputElement,
  isPortraitOrientation
} from "./mobile-handler/pure"

export const MobileHandler = Object.assign(
  {},
  CorePart,
  KeyboardPart,
  InputPart,
  OrientationPart,
  CustomSelectPart,
  VibrationPart
) as MobileHandlerType

function initMobileHandler() {
  addStyles()
  MobileHandler.init()

  document.addEventListener("click", function (e) {
    var target = e.target as HTMLElement
    var container = target.closest(".custom-select-container")
    var fixedOverlay = target.closest("#fixedInputOverlay")
    if (!container && !fixedOverlay) {
      MobileHandler.closeAllCustomSelects()
    }
  })
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobileHandler)
} else {
  initMobileHandler()
}
