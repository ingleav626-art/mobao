/**
 * @file mobile/mobile-handler/keyboard.ts
 * @module mobile/mobile-handler/keyboard
 * @description KeyboardPart - 键盘适配子对象。包含原生键盘高度监听、轮询、
 *              安全高度计算（委托纯函数 calcSafeKeyboardHeight）、focusin 拦截
 *              （委托纯函数 isTextInputElement 判断文本输入类型）。
 *
 * @requires ./types - MobileHandlerType
 * @requires ./pure - calcSafeKeyboardHeight, isTextInputElement
 * @exports KeyboardPart - 键盘适配子对象
 */
import type { MobileHandlerType } from "./types"
import { calcSafeKeyboardHeight, isTextInputElement } from "./pure"

export const KeyboardPart: ThisType<MobileHandlerType> = {
  setupNativeKeyboardListener: function () {
    var self = this

    ;(window as unknown as Record<string, unknown>).__onKeyboardChange = function (height: number) {
      self.handleKeyboardHeightChange(parseInt(String(height)) || 0)
    }

    document.addEventListener("keyboardchange", function (e) {
      var detail = (e as CustomEvent).detail
      var height = detail && detail.height ? parseInt(detail.height) : 0
      self.handleKeyboardHeightChange(height)
    })
  },

  handleKeyboardHeightChange: function (rawHeight: number) {
    if (!this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains("show")) {
      return
    }

    var safeHeight = this.calculateSafeKeyboardHeight(rawHeight)

    if (safeHeight !== this.currentKeyboardHeight && Math.abs(safeHeight - this.currentKeyboardHeight) > 10) {
      this.currentKeyboardHeight = safeHeight
      this.updateInputPosition()
      console.log(
        "[MobileHandler] keyboard updated - raw:",
        rawHeight,
        "-> safe:",
        safeHeight,
        "bottom:",
        safeHeight + (this.fixedInputContainer ? this.fixedInputContainer.offsetHeight || 80 : 80) + "px"
      )
    }
  },

  calculateSafeKeyboardHeight: function (rawHeight: number) {
    var containerHeight = this.fixedInputContainer ? this.fixedInputContainer.offsetHeight || 80 : 80
    return calcSafeKeyboardHeight(rawHeight, this.screenHeight, containerHeight)
  },

  startPolling: function () {
    var self = this

    this.stopPolling()

    if (
      typeof (window as unknown as Record<string, unknown>).AndroidKeyboard !== "undefined" &&
      ((window as unknown as Record<string, unknown>).AndroidKeyboard as { getKeyboardHeight: () => number })
        .getKeyboardHeight
    ) {
      this.pollIntervalId = setInterval(function () {
        if (!self.fixedInputOverlay || !self.fixedInputOverlay.classList.contains("show")) {
          self.stopPolling()
          return
        }

        var rawHeight = (
          (window as unknown as Record<string, unknown>).AndroidKeyboard as { getKeyboardHeight: () => number }
        ).getKeyboardHeight()
        self.handleKeyboardHeightChange(rawHeight)
      }, 200)
    }
  },

  stopPolling: function () {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  },

  setupKeyboardHandler: function () {
    var self = this

    document.addEventListener(
      "focusin",
      function (e) {
        var target = e.target as HTMLElement
        var isTextInput = isTextInputElement(target.tagName, (target as HTMLInputElement).type)

        if (isTextInput && !target.hasAttribute("data-no-fixed-input")) {
          if (self.isMobile || self.isTouch) {
            if (target.id === "fixedInputField") return
            if (self.isHidingFixedInput) return

            e.preventDefault()
            e.stopPropagation()

            setTimeout(function () {
              ;(target as HTMLInputElement).blur()
              self.showFixedInput(target as HTMLInputElement)
            }, 10)
          }
        }
      },
      true
    )
  }
}
