/**
 * @file mobile/mobile-handler/input.ts
 * @module mobile/mobile-handler/input
 * @description InputPart - 固定输入浮层子对象。包含浮层创建、显示、隐藏、定位逻辑。
 *              通过 var self = this 在回调中保持 this 绑定，跨子模块调用
 *              this.startPolling/stopPolling/handleKeyboardHeightChange 等。
 *
 * @requires ./types - MobileHandlerType
 * @exports InputPart - 固定输入浮层子对象
 */
import type { MobileHandlerType } from "./types"
import { createLogger } from "../../game/core/logger"
const log = createLogger("Mobile")

export const InputPart: ThisType<MobileHandlerType> = {
  createFixedInputOverlay: function () {
    var overlay = document.createElement("div")
    overlay.id = "fixedInputOverlay"
    overlay.className = "fixed-input-overlay"
    overlay.innerHTML =
      '\
        <div class="fixed-input-container" id="fixedInputContainer">\
          <input type="text" id="fixedInputField" class="fixed-input-field" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">\
          <button type="button" class="fixed-input-close" id="fixedInputClose">完成</button>\
        </div>'
    document.body.appendChild(overlay)

    this.fixedInputOverlay = overlay
    this.fixedInputElement = overlay.querySelector("#fixedInputField") as HTMLInputElement | null
    this.fixedInputContainer = overlay.querySelector("#fixedInputContainer")
    var closeBtn = overlay.querySelector("#fixedInputClose") as HTMLElement | null

    var self = this

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        self.hideFixedInput()
      }
    })

    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation()
        self.hideFixedInput()
      })
    }

    if (this.fixedInputElement) {
      this.fixedInputElement.addEventListener("input", function (e) {
        if (self.originalInput) {
          self.originalInput.value = (e.target as HTMLInputElement).value
          self.originalInput.dispatchEvent(new Event("input", { bubbles: true }))
        }
      })

      this.fixedInputElement.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault()
          self.hideFixedInput()
          return
        }
        if (self.originalInput) {
          self.originalInput.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, code: e.code, bubbles: true }))
        }
      })
    }
  },

  updateInputPosition: function () {
    if (!this.fixedInputContainer || !this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains("show")) {
      return
    }

    var kbHeight = this.currentKeyboardHeight
    var containerHeight = this.fixedInputContainer.offsetHeight || 80

    if (kbHeight > 50) {
      var bottomValue = kbHeight + containerHeight + "px"
      this.fixedInputContainer.style.position = "absolute"
      this.fixedInputContainer.style.bottom = bottomValue
      this.fixedInputContainer.style.left = "0"
      this.fixedInputContainer.style.right = "0"

      var inputTop = this.screenHeight - kbHeight - containerHeight
      log.debug(
        "positioned - bottom:",
        bottomValue,
        "| input visible at",
        inputTop.toFixed(0),
        "-",
        (inputTop + containerHeight).toFixed(0),
        "px"
      )
    } else {
      this.fixedInputContainer.style.position = ""
      this.fixedInputContainer.style.bottom = ""
      this.fixedInputContainer.style.left = ""
      this.fixedInputContainer.style.right = ""
    }
  },

  showFixedInput: function (input: HTMLInputElement | HTMLTextAreaElement) {
    if (this.isHidingFixedInput) {
      return
    }

    this.originalInput = input
    this.screenHeight = window.innerHeight
    this.currentKeyboardHeight = 0

    log.info("show input - value:", input.value.substring(0, 20), "screen:", this.screenHeight)

    if (!this.fixedInputElement) return

    var inputType = (input as HTMLInputElement).type || "text"
    this.fixedInputElement.type = inputType === "number" ? "tel" : inputType
    this.fixedInputElement.value = input.value
    this.fixedInputElement.placeholder = (input as HTMLInputElement).placeholder || ""

    if ((input as HTMLInputElement).maxLength > 0) {
      this.fixedInputElement.maxLength = (input as HTMLInputElement).maxLength
    }

    this.resetInputPosition()
    this.fixedInputOverlay!.classList.add("show")

    var self = this
    requestAnimationFrame(function () {
      if (self.fixedInputElement) {
        self.fixedInputElement.focus()
      }
      self.startPolling()

      setTimeout(function () {
        self.checkAndUpdatePosition()
      }, 150)
      setTimeout(function () {
        self.checkAndUpdatePosition()
      }, 350)
      setTimeout(function () {
        self.checkAndUpdatePosition()
      }, 600)
    })
  },

  checkAndUpdatePosition: function () {
    if (!this.fixedInputOverlay || !this.fixedInputOverlay.classList.contains("show")) {
      return
    }

    if (typeof (window as unknown as Record<string, unknown>).AndroidKeyboard !== "undefined") {
      var rawHeight = (
        (window as unknown as Record<string, unknown>).AndroidKeyboard as { getKeyboardHeight: () => number }
      ).getKeyboardHeight()
      this.handleKeyboardHeightChange(rawHeight)
    } else {
      this.updateInputPosition()
    }
  },

  resetInputPosition: function () {
    if (!this.fixedInputContainer) return
    this.fixedInputContainer.style.position = ""
    this.fixedInputContainer.style.bottom = ""
    this.fixedInputContainer.style.left = ""
    this.fixedInputContainer.style.right = ""
  },

  hideFixedInput: function () {
    var self = this
    this.isHidingFixedInput = true

    log.info("hide input")

    this.stopPolling()
    if (this.fixedInputElement) {
      this.fixedInputElement.blur()
    }
    if (this.fixedInputOverlay) {
      this.fixedInputOverlay.classList.remove("show")
    }
    this.resetInputPosition()

    var origInput = this.originalInput
    this.originalInput = null
    this.currentKeyboardHeight = 0

    if (origInput) {
      origInput.blur()
    }

    setTimeout(function () {
      self.isHidingFixedInput = false
    }, 200)
  }
}
