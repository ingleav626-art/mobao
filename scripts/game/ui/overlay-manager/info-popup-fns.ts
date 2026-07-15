/**
 * @file info-popup-fns.ts
 * @module ui/overlay-manager/info-popup-fns
 * @description 信息弹窗与玩家信息气泡操作函数
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import { MobaoAnimations } from "../../animations"

export function showInfoPopup(deps: UiOverlayManagerDeps, title: string, sourceScrollEl: HTMLElement | null): void {
  deps.dom.infoPopupTitle!.textContent = title
  if (sourceScrollEl) {
    deps.dom.infoPopupContent!.innerHTML = sourceScrollEl.innerHTML
  } else {
    deps.dom.infoPopupContent!.innerHTML = ""
  }
  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayOpen(
      deps.dom.infoPopupOverlay!,
      deps.dom.infoPopupOverlay!.querySelector(".info-popup-box")
    )
  } else {
    deps.dom.infoPopupOverlay!.classList.remove("hidden")
  }
  // 同步到 Vue uiStore
  import("../../../vue/stores/uiStore")
    .then(({ useUiStore }) => {
      useUiStore().showInfoPopup(title, deps.dom.infoPopupContent?.innerHTML ?? "")
    })
    .catch(() => {
      // Vue 未初始化时跳过
    })
}

export function hideInfoPopup(deps: UiOverlayManagerDeps): void {
  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayClose(deps.dom.infoPopupOverlay!)
  } else {
    deps.dom.infoPopupOverlay!.classList.add("hidden")
  }
  // 同步到 Vue uiStore
  import("../../../vue/stores/uiStore")
    .then(({ useUiStore }) => {
      useUiStore().hideInfoPopup()
    })
    .catch(() => {
      // Vue 未初始化时跳过
    })
}

export function showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number): void {
  const popover = document.getElementById("playerInfoPopover")
  const titleEl = document.getElementById("playerInfoPopoverTitle")
  const htmlContentEl = document.getElementById("playerInfoPopoverContent")
  if (!popover || !titleEl || !htmlContentEl) {
    return
  }
  titleEl.textContent = title
  htmlContentEl.innerHTML = htmlContent
  popover.classList.remove("hidden")
  popover.classList.add("popup-content-enter")
  popover.addEventListener(
    "animationend",
    function onEnter() {
      popover.classList.remove("popup-content-enter")
      popover.removeEventListener("animationend", onEnter)
    },
    { once: true }
  )
  positionPlayerInfoPopover(x, y)
}

export function positionPlayerInfoPopover(x: number, y: number): void {
  const popover = document.getElementById("playerInfoPopover")
  if (!popover) {
    return
  }
  const rect = popover.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let left = x + 10
  let top = y + 10
  if (left + rect.width > viewportWidth - 10) {
    left = x - rect.width - 10
  }
  if (top + rect.height > viewportHeight - 10) {
    top = y - rect.height - 10
  }
  left = Math.max(10, Math.min(left, viewportWidth - rect.width - 10))
  top = Math.max(10, Math.min(top, viewportHeight - rect.height - 10))
  popover.style.left = `${left}px`
  popover.style.top = `${top}px`
}

export function hidePlayerInfoPopover(): void {
  const popover = document.getElementById("playerInfoPopover")
  if (popover) {
    popover.classList.add("hidden")
    popover.classList.remove("popup-content-enter")
  }
}
