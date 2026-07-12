/**
 * @file scripts/game/scene/events-overlay.ts
 * @module scene/events-overlay
 * @description 覆盖层/弹窗事件绑定。绑定设置面板、信息弹窗、玩家气泡的
 *              点击/关闭事件监听器，以及全局点击分发。
 *
 * @requires Phaser - 用于事件系统
 * @exports bindOverlayEvents - 覆盖层事件绑定函数
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import Phaser from "phaser"

export function bindOverlayEvents(this: WarehouseSceneThis): void {
  this.dom.settingsOverlay?.addEventListener("click", (event) => {
    if (this.dom.aiMemoryOverlay && !this.dom.aiMemoryOverlay.classList.contains("hidden")) {
      return
    }
    if (this.dom.aiModelConfigOverlay && !this.dom.aiModelConfigOverlay.classList.contains("hidden")) {
      return
    }
    const customProviderModal = document.getElementById("customProviderModal")
    if (customProviderModal && !customProviderModal.classList.contains("hidden")) {
      return
    }
    const gameConfirmOverlay = document.getElementById("gameConfirmOverlay")
    if (gameConfirmOverlay && !gameConfirmOverlay.classList.contains("hidden")) {
      return
    }
    if (event.target === this.dom.settingsOverlay) {
      this.closeSettingsOverlay(false)
    }
  })

  this.dom.gameRoot?.addEventListener(
    "wheel",
    (event) => {
      if (!this.dom.gameRoot) {
        return
      }

      if (this.isSettingsOverlayOpen()) {
        if (this.scrollElementByWheel(this.dom.settingsScroll, event.deltaY)) {
          event.preventDefault()
        } else {
          event.preventDefault()
        }
        return
      }

      if (
        event.target instanceof HTMLElement &&
        this.dom.previewPopover &&
        this.dom.previewPopover.contains(event.target) &&
        !this.dom.previewPopover.classList.contains("hidden")
      ) {
        this.scrollElementByWheel(this.dom.previewPopover, event.deltaY)
        event.preventDefault()
        return
      }

      if (
        this.dom.previewPopover &&
        !this.dom.previewPopover.classList.contains("hidden") &&
        event.target instanceof HTMLElement &&
        this.dom.gameRoot &&
        this.dom.gameRoot.contains(event.target) &&
        !this.dom.previewPopover.contains(event.target)
      ) {
        this.hidePreview()
      }

      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        if (this.dom.gameRoot && this.scrollElementByWheel(this.dom.gameRoot, event.deltaY)) {
          event.preventDefault()
        }
      }
    },
    { passive: false }
  )

  this.dom.gameRoot?.addEventListener(
    "scroll",
    () => {
      this.refreshRevealScrollHints()
    },
    { passive: true }
  )

  let touchStartY = 0
  let touchStartScrollTop = 0
  let touchInPreview = false
  this.dom.gameRoot?.addEventListener(
    "touchstart",
    (e) => {
      touchInPreview =
        e.target instanceof HTMLElement &&
        !!this.dom.previewPopover &&
        this.dom.previewPopover.contains(e.target) &&
        !this.dom.previewPopover.classList.contains("hidden")
      if (touchInPreview) return
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY
        if (this.dom.gameRoot) touchStartScrollTop = this.dom.gameRoot.scrollTop
      }
    },
    { passive: true }
  )

  this.dom.gameRoot?.addEventListener(
    "touchmove",
    (e) => {
      if (touchInPreview) return
      if (e.touches.length !== 1) return
      if (!this.dom.gameRoot) return
      const dy = touchStartY - e.touches[0].clientY
      const maxScroll = this.dom.gameRoot.scrollHeight - this.dom.gameRoot.clientHeight
      if (maxScroll <= 0) return
      this.dom.gameRoot.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
    },
    { passive: true }
  )

  this.dom.gameRoot?.addEventListener("pointerdown", (event) => {
    if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
      return
    }

    const target = event.target
    if (target instanceof HTMLElement && this.dom.previewPopover && this.dom.previewPopover.contains(target)) {
      return
    }

    const point = this.toWorldPointFromRootEvent(event as MouseEvent)
    if (!point) {
      return
    }

    if (this.isPointOnSettlementLockedItem(point.x, point.y)) {
      return
    }

    this.settlementRevealSkipRequested = true
    event.preventDefault()
  })
    ; (this.dom.bidInput as HTMLInputElement).readOnly = true
  this.dom.bidInput?.addEventListener("keydown", (event) => event.preventDefault())
  this.dom.bidInput?.addEventListener("click", () => this.openBidKeypad())
  this.dom.bidInput?.addEventListener("focus", () => this.openBidKeypad())

  this.dom.keypadCloseBtn?.addEventListener("click", () => this.closeBidKeypad())
  this.dom.bidKeypad?.addEventListener("pointerdown", (event) => {
    event.stopPropagation()
  })
  this.dom.bidKeypad?.addEventListener("click", (event) => {
    event.stopPropagation()
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const key = target.dataset.key
    if (!key) {
      return
    }

    this.handleBidKeyInput(key)
  })
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on(
      "keydown-R",
      () => {
        if (this.isLanMode) return
        this.startNewRun()
      }
    )
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on(
      "keydown-N",
      () => {
        if (this.isLanMode && !this.lanIsHost) return
        this.resolveRoundBids("manual")
      }
    )
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on(
      "keydown-B",
      () => this.openBidKeypad()
    )
    ; (this.input as Phaser.Input.InputPlugin & { keyboard: { on: (event: string, cb: () => void) => void } }).keyboard.on(
      "keydown-P",
      () => {
        if (this.isLanMode && !this.lanIsHost) return
        this.toggleRoundPause()
      }
    )

  this.dom.gameConfirmCancelBtn?.addEventListener("click", (event) => {
    event.stopPropagation()
    const cb = this._gameCancelCallback
    this.hideGameConfirm()
    if (cb) {
      cb()
    }
  })
  this.dom.gameConfirmOkBtn?.addEventListener("click", (event) => {
    event.stopPropagation()
    const cb = this._gameConfirmCallback
    this.hideGameConfirm()
    if (cb) {
      cb()
    }
  })

  this.dom.gameConfirmOverlay?.addEventListener("click", (event) => {
    event.stopPropagation()
  })
  const gameConfirmBox = document.querySelector(".game-confirm-box")
  if (gameConfirmBox) {
    gameConfirmBox.addEventListener("click", (event) => {
      event.stopPropagation()
    })
  }

  this.dom.infoPopupCloseBtn?.addEventListener("click", () => this.hideInfoPopup())
  this.dom.infoPopupOverlay?.addEventListener("click", (event) => {
    if (event.target === this.dom.infoPopupOverlay) {
      this.hideInfoPopup()
    }
  })

  const playerInfoPopover = document.getElementById("playerInfoPopover")
  const playerInfoPopoverCloseBtn = document.getElementById("playerInfoPopoverCloseBtn")
  if (playerInfoPopoverCloseBtn) {
    playerInfoPopoverCloseBtn.addEventListener("click", () => this.hidePlayerInfoPopover())
  }

  document.addEventListener("click", (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    if (playerInfoPopover && playerInfoPopover.contains(target)) {
      return
    }

    if (
      target.closest(".llm-player-switch") ||
      target.closest(".llm-error-badge") ||
      target.closest("input") ||
      target.closest("button")
    ) {
      return
    }

    const historyChip = target.closest(".history-chip")
    if (historyChip) {
      event.preventDefault()
      event.stopPropagation()
      const itemId = historyChip.getAttribute("data-item-id")
      if (itemId) {
        const info = this.getItemInfo(itemId)
        this.showItemDetailPopup(itemId, info.label, event.clientX, event.clientY)
      }
      return
    }

    const playerCard = target.closest(".player-card")
    if (playerCard) {
      const playerId = playerCard.id.replace("playerCard-", "")
      if (playerId) {
        this.showCharacterInfoPopup(playerId, event.clientX, event.clientY)
      }
    } else {
      this.hidePlayerInfoPopover()
    }
  })

  const personalPanel = document.getElementById("personalPanel")
  if (personalPanel) {
    personalPanel.style.cursor = "pointer"
    personalPanel.addEventListener("click", () => this.showInfoPopup("个人情报区", this.dom.personalPanelScroll))
  }
  const publicPanel = document.getElementById("publicPanel")
  if (publicPanel) {
    publicPanel.style.cursor = "pointer"
    publicPanel.addEventListener("click", () => this.showInfoPopup("公共信息区", this.dom.publicInfoScroll))
  }

  ; (
    this.input as Phaser.Input.InputPlugin & {
      on: (event: string, cb: (pointer: { x: number; y: number }) => void) => void
    }
  ).on("pointerdown", (pointer: { x: number; y: number }) => {
    if (!this.settlementRevealRunning || !this.isSettlementPageActive()) {
      return
    }

    if (this.isPointOnSettlementLockedItem(pointer.x, pointer.y)) {
      return
    }

    this.settlementRevealSkipRequested = true
  })

  document.addEventListener("pointerdown", (event) => {
    const target = event.target
    const targetEl = target instanceof HTMLElement ? target : null

    if (
      this.settlementRevealRunning &&
      this.isSettlementPageActive() &&
      !(targetEl && this.dom.previewPopover && this.dom.previewPopover.contains(targetEl)) &&
      !(targetEl && this.dom.gameRoot && this.dom.gameRoot.contains(targetEl))
    ) {
      this.settlementRevealSkipRequested = true
    }

    if (
      targetEl &&
      this.isSettingsOverlayOpen() &&
      this.dom.settingsPanel &&
      !this.dom.settingsPanel.contains(targetEl) &&
      targetEl !== this.dom.openSettingsBtn
    ) {
      const isAiMemoryOpen = this.dom.aiMemoryOverlay && !this.dom.aiMemoryOverlay.classList.contains("hidden")
      const isAiModelConfigOpen =
        this.dom.aiModelConfigOverlay && !this.dom.aiModelConfigOverlay.classList.contains("hidden")
      const customProviderModal = document.getElementById("customProviderModal")
      const isCustomProviderOpen = customProviderModal && !customProviderModal.classList.contains("hidden")
      const gameConfirmOverlay = document.getElementById("gameConfirmOverlay")
      const isGameConfirmOpen = gameConfirmOverlay && !gameConfirmOverlay.classList.contains("hidden")
      const fixedInputOverlay = document.getElementById("fixedInputOverlay")
      const isFixedInputOpen = fixedInputOverlay && fixedInputOverlay.classList.contains("show")
      const aiMemoryImportDialog = document.getElementById("aiMemoryImportDialog")
      const isAiMemoryImportOpen = aiMemoryImportDialog && !aiMemoryImportDialog.classList.contains("hidden")
      const aiMemoryExportDialog = document.getElementById("aiMemoryExportDialog")
      const isAiMemoryExportOpen = aiMemoryExportDialog && !aiMemoryExportDialog.classList.contains("hidden")
      const aiMemoryCopyFallback = document.getElementById("aiMemoryCopyFallback")
      const isAiMemoryCopyOpen = aiMemoryCopyFallback && !aiMemoryCopyFallback.classList.contains("hidden")
      if (
        !isAiMemoryOpen &&
        !isAiModelConfigOpen &&
        !isCustomProviderOpen &&
        !isGameConfirmOpen &&
        !isFixedInputOpen &&
        !isAiMemoryImportOpen &&
        !isAiMemoryExportOpen &&
        !isAiMemoryCopyOpen
      ) {
        this.closeSettingsOverlay(false)
      }
    }

    if (
      this.dom.previewPopover &&
      !this.dom.previewPopover.classList.contains("hidden") &&
      Date.now() - this.previewOpenTick >= 140
    ) {
      if (targetEl && this.dom.previewPopover && !this.dom.previewPopover.contains(targetEl)) {
        this.hidePreview()
      }
    }

    if (
      targetEl &&
      this.dom.bidKeypad &&
      !this.dom.bidKeypad.classList.contains("hidden") &&
      !this.dom.bidKeypad.contains(targetEl) &&
      targetEl !== this.dom.bidInput
    ) {
      this.closeBidKeypad()
    }

    if (
      targetEl &&
      this.dom.itemDrawer &&
      !this.dom.itemDrawer.classList.contains("hidden") &&
      !this.dom.itemDrawer.contains(targetEl) &&
      targetEl !== this.dom.itemDrawerToggleBtn
    ) {
      this.closeItemDrawer()
    }
  })

  document.addEventListener("visibilitychange", () => {
    if (!this.isLanMode) return
    if (document.hidden) {
      this.onLanBackground()
    } else {
      this.onLanForeground()
    }
  })
}
