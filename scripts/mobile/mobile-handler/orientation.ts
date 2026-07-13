/**
 * @file mobile/mobile-handler/orientation.ts
 * @module mobile/mobile-handler/orientation
 * @description OrientationPart - 横竖屏切换子对象。监听 resize/orientationchange，
 *              竖屏时显示 portraitOverlay 并隐藏滚动，委托纯函数 isPortraitOrientation 判断方向。
 *
 * @requires ./types - MobileHandlerType
 * @requires ./pure - isPortraitOrientation
 * @exports OrientationPart - 横竖屏切换子对象
 */
import type { MobileHandlerType } from "./types"
import { isPortraitOrientation } from "./pure"

export const OrientationPart: ThisType<MobileHandlerType> = {
  setupOrientationCheck: function () {
    var self = this

    function checkOrientation() {
      self.screenHeight = window.innerHeight

      if (!self.isMobile && !self.isTouch) return
      var isPortrait = isPortraitOrientation(window.innerHeight, window.innerWidth)
      if (isPortrait) {
        if (self.portraitOverlay) {
          self.portraitOverlay.classList.add("show")
        }
        document.body.style.overflow = "hidden"
      } else {
        if (self.portraitOverlay) {
          self.portraitOverlay.classList.remove("show")
        }
        document.body.style.overflow = ""
      }
    }

    checkOrientation()
    window.addEventListener("resize", checkOrientation)
    window.addEventListener("orientationchange", function () {
      setTimeout(checkOrientation, 100)
    })
  }
}
