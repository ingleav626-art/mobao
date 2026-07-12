/**
 * @file scripts/game/ui/overlay/info-popup.ts
 * @module ui/overlay/info-popup
 * @description 信息弹窗与玩家信息气泡 Mixin。管理通用信息弹窗的显示/隐藏，
 *              以及跟随鼠标的玩家信息气泡（定位、进入动画）。
 *
 * @requires animations - MobaoAnimations
 * @exports InfoPopupMixin - 信息弹窗子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { MobaoAnimations } from "../../animations"

export const InfoPopupMixin: ThisType<WarehouseSceneThis> = {
  showInfoPopup(title: string, sourceScrollEl: HTMLElement | null) {
    this.dom.infoPopupTitle!.textContent = title
    if (sourceScrollEl) {
      this.dom.infoPopupContent!.innerHTML = sourceScrollEl.innerHTML
    } else {
      this.dom.infoPopupContent!.innerHTML = ""
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(
        this.dom.infoPopupOverlay!,
        this.dom.infoPopupOverlay!.querySelector(".info-popup-box")
      )
    } else {
      this.dom.infoPopupOverlay!.classList.remove("hidden")
    }
  },

  hideInfoPopup() {
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(this.dom.infoPopupOverlay!)
    } else {
      this.dom.infoPopupOverlay!.classList.add("hidden")
    }
  },

  showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number) {
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
    this.positionPlayerInfoPopover(x, y)
  },

  positionPlayerInfoPopover(x: number, y: number) {
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
  },

  hidePlayerInfoPopover() {
    const popover = document.getElementById("playerInfoPopover")
    if (popover) {
      popover.classList.add("hidden")
      popover.classList.remove("popup-content-enter")
    }
  }
}
