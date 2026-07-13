/**
 * @file mobile/mobile-handler/core.ts
 * @module mobile/mobile-handler/core
 * @description CorePart - MobileHandler 核心状态属性 + init 编排方法。
 *              init 委托纯函数 detectMobile/detectTouch 进行平台检测，
 *              依次调用各子模块的 setup/create 方法完成初始化。
 *
 * @requires ./types - MobileHandlerType
 * @requires ./pure - detectMobile, detectTouch
 * @exports CorePart - 核心子对象（状态属性 + init）
 */
import type { MobileHandlerType } from "./types"
import { detectMobile, detectTouch } from "./pure"

export const CorePart: ThisType<MobileHandlerType> = {
  isMobile: false,
  isTouch: false,
  portraitOverlay: null,
  fixedInputOverlay: null,
  fixedInputElement: null,
  fixedInputContainer: null,
  originalInput: null,
  isHidingFixedInput: false,
  currentKeyboardHeight: 0,
  screenHeight: 0,
  pollIntervalId: null,

  init: function () {
    this.isMobile = detectMobile(navigator.userAgent)
    this.isTouch = detectTouch("ontouchstart" in window, navigator.maxTouchPoints)
    this.screenHeight = window.innerHeight

    console.log(
      "[MobileHandler] init - isMobile:",
      this.isMobile,
      "isTouch:",
      this.isTouch,
      "hasAndroidKeyboard:",
      typeof (window as any).AndroidKeyboard !== "undefined",
      "screenHeight:",
      this.screenHeight
    )

    this.portraitOverlay = document.getElementById("portraitOverlay")

    this.createFixedInputOverlay()
    this.setupOrientationCheck()
    this.setupKeyboardHandler()
    this.setupVibrationFeedback()
    this.setupCustomSelects()
    this.setupNativeKeyboardListener()
  }
}
