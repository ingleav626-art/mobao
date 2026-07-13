/**
 * @file mobile/mobile-handler/pure.ts
 * @module mobile/mobile-handler/pure
 * @description MobileHandler 的纯函数集合。零外部依赖，可独立测试。
 *              从原 mobile-handler.ts 方法体中提取的无副作用逻辑。
 */

/** 检测 UserAgent 是否为移动端设备 */
export function detectMobile(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
}

/** 检测是否支持触摸（ontouchstart 存在或 maxTouchPoints > 0） */
export function detectTouch(ontouchstart: unknown, maxTouchPoints: number): boolean {
  return Boolean(ontouchstart) || maxTouchPoints > 0
}

/**
 * 键盘高度安全裁剪。
 * <=0 或 <100 归零；超屏幕高度取 maxKeyboardHeight 的 85%；超上限截断；否则原值返回。
 */
export function calcSafeKeyboardHeight(rawHeight: number, screenHeight: number, containerHeight: number): number {
  var minSpaceForInput = containerHeight + 30
  var maxKeyboardHeight = screenHeight - minSpaceForInput

  if (rawHeight <= 0 || rawHeight < 100) {
    return 0
  }

  if (rawHeight > screenHeight) {
    return Math.floor(maxKeyboardHeight * 0.85)
  }

  if (rawHeight > maxKeyboardHeight) {
    return maxKeyboardHeight
  }

  return rawHeight
}

/** 判断 INPUT/TEXTAREA 是否为文本输入类型（text/search/tel/url/email/password/number/无 type） */
export function isTextInputElement(tagName: string, type: string | undefined): boolean {
  return (
    (tagName === "INPUT" &&
      (type === "text" ||
        type === "search" ||
        type === "tel" ||
        type === "url" ||
        type === "email" ||
        type === "password" ||
        type === "number" ||
        !type)) ||
    tagName === "TEXTAREA"
  )
}

/** 判断是否为竖屏方向（innerHeight > innerWidth） */
export function isPortraitOrientation(innerHeight: number, innerWidth: number): boolean {
  return innerHeight > innerWidth
}
