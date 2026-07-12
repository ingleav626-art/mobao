/**
 * @file scripts/game/ui/overlay/core.ts
 * @module ui/overlay/core
 * @description 通用覆盖层开关 Mixin。负责结算覆盖层关闭、AI 逻辑面板开闭、
 *              商店覆盖层开闭（转发 MobaoShopPage），方法体量小且模式一致。
 *
 * @requires animations - MobaoAnimations
 * @requires shop/index - MobaoShopPage
 * @exports CoreOverlayMixin - 通用覆盖层子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { MobaoAnimations } from "../../animations"
import { MobaoShopPage } from "../../shop/index"
import { renderAiThoughtLog } from "../../ai/decision"

export const CoreOverlayMixin: ThisType<WarehouseSceneThis> = {
  hideSettleOverlay() {
    const overlayEl = this.dom.settleOverlay
    if (!overlayEl) return
    if (typeof MobaoAnimations !== "undefined") {
      ;(MobaoAnimations as any).animateOverlayClose(overlayEl, null, function () {
        overlayEl.classList.add("hidden")
        overlayEl.style.animation = ""
        overlayEl.style.opacity = ""
      })
    } else {
      overlayEl.classList.add("hidden")
    }
  },

  openAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return
    }
    this.renderAiLogicPanel()
    if (typeof this.renderAiThoughtLog === "function") {
      this.renderAiThoughtLog()
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(this.dom.aiLogicOverlay, this.dom.aiLogicPanel)
    } else {
      this.dom.aiLogicOverlay.classList.remove("hidden")
    }
  },

  closeAiLogicPanel() {
    if (!this.dom.aiLogicOverlay) {
      return
    }
    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(this.dom.aiLogicOverlay, this.dom.aiLogicPanel)
    } else {
      this.dom.aiLogicOverlay.classList.add("hidden")
    }
  },

  renderAiThoughtLog(): void {
    const self = this as any
    renderAiThoughtLog(self.dom.aiThoughtContent, self.runLogHistory)
  },

  openShopOverlay() {
    if (typeof MobaoShopPage !== "undefined") {
      MobaoShopPage.init({
        onPurchase: () => {
          this.updateLobbyMoneyDisplay()
          if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
            this.updateHud()
          }
        }
      })
      MobaoShopPage.open()
    }
  },

  closeShopOverlay() {
    if (typeof MobaoShopPage !== "undefined") {
      MobaoShopPage.close()
    }
    this.updateLobbyMoneyDisplay()
    if (!document.getElementById("gameArea")!.classList.contains("hidden")) {
      this.updateHud()
    }
  }
}
