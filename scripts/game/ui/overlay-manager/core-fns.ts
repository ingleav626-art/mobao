/**
 * @file core-fns.ts
 * @module ui/overlay-manager/core-fns
 * @description 核心覆盖层操作函数（结算/商店/AI 逻辑面板）
 */
import type { UiOverlayManagerDeps } from "../overlay-manager"
import { MobaoAnimations } from "../../animations"
import { MobaoShopPage } from "../../shop/index"
import { renderAiThoughtLog as renderAiThoughtLogFn } from "../../ai/decision"

export function hideSettleOverlay(deps: UiOverlayManagerDeps): void {
  const overlayEl = deps.dom.settleOverlay
  if (!overlayEl) return
  if (typeof MobaoAnimations !== "undefined") {
    MobaoAnimations.animateOverlayClose(overlayEl, null, function () {
      overlayEl.classList.add("hidden")
      overlayEl.style.animation = ""
      overlayEl.style.opacity = ""
    })
  } else {
    overlayEl.classList.add("hidden")
  }
}

export function showSettleOverlay(deps: UiOverlayManagerDeps, html: string): void {
  if (deps.dom.settleCard) deps.dom.settleCard.innerHTML = html
  deps.dom.settleOverlay?.classList.remove("hidden")

  deps.getTweens().add({
    targets: deps.dom.settleCard,
    scaleX: { from: 0.94, to: 1 },
    scaleY: { from: 0.94, to: 1 },
    alpha: { from: 0.5, to: 1 },
    duration: 260,
    ease: "Back.Out"
  })
}

export function openAiLogicPanel(deps: UiOverlayManagerDeps): void {
  if (!deps.dom.aiLogicOverlay) {
    return
  }
  deps.renderAiLogicPanel()
  renderAiThoughtLog(deps)
  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayOpen(deps.dom.aiLogicOverlay, deps.dom.aiLogicPanel)
  } else {
    deps.dom.aiLogicOverlay.classList.remove("hidden")
  }
}

export function closeAiLogicPanel(deps: UiOverlayManagerDeps): void {
  if (!deps.dom.aiLogicOverlay) {
    return
  }
  if (MobaoAnimations) {
    MobaoAnimations.animateOverlayClose(deps.dom.aiLogicOverlay, deps.dom.aiLogicPanel)
  } else {
    deps.dom.aiLogicOverlay.classList.add("hidden")
  }
}

export function renderAiThoughtLog(deps: UiOverlayManagerDeps): void {
  renderAiThoughtLogFn(deps.dom.aiThoughtContent, deps.getRunLogHistory())
}

export function openShopOverlay(deps: UiOverlayManagerDeps): void {
  if (typeof MobaoShopPage !== "undefined") {
    MobaoShopPage.init({
      onPurchase: () => {
        deps.updateLobbyMoneyDisplay()
        if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
          deps.updateHud()
        }
      }
    })
    MobaoShopPage.open()
  }
}

export function closeShopOverlay(deps: UiOverlayManagerDeps): void {
  if (typeof MobaoShopPage !== "undefined") {
    MobaoShopPage.close()
  }
  deps.updateLobbyMoneyDisplay()
  if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
    deps.updateHud()
  }
}