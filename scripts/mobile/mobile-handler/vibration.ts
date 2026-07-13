/**
 * @file mobile/mobile-handler/vibration.ts
 * @module mobile/mobile-handler/vibration
 * @description VibrationPart - 振动反馈子对象。监听 input 事件，
 *              在删除操作时触发 navigator.vibrate 短振动（仅触屏设备）。
 *
 * @requires ./types - MobileHandlerType
 * @exports VibrationPart - 振动反馈子对象
 */
import type { MobileHandlerType } from "./types"

export const VibrationPart: ThisType<MobileHandlerType> = {
  setupVibrationFeedback: function () {
    if (!this.isMobile && !this.isTouch) return
    if (!navigator.vibrate) return

    document.addEventListener("input", function (e) {
      var target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        var inputType = (e as InputEvent).inputType
        if (
          inputType === "deleteContentBackward" ||
          inputType === "deleteContentForward" ||
          inputType === "deleteByCut"
        ) {
          navigator.vibrate!(10)
        }
      }
    })
  }
}
