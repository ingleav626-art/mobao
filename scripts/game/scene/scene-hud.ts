/**
 * @file scene/scene-hud.ts
 * @module scene/hud
 * @description HUD 更新方法。包含 updateHud 和 updateActionAvailability。
 *
 * 拆分说明：
 *   - 本文件包含实现逻辑（HUD 渲染、按钮状态管理）
 *   - 可考虑二次迁移到 ui/hud.ts
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { GRID_COLS as _GRID_COLS, GRID_ROWS as _GRID_ROWS } from "../core/constants"
import { GAME_SETTINGS as _GAME_SETTINGS } from "../core/settings"
import { MobaoAnimations } from "../animations"
import { useGameStore } from "../../vue/stores/gameStore"

/**
 * 更新操作可用性（按钮禁用/启用状态）
 */
export function updateActionAvailability(this: WarehouseSceneThis): void {
  const lockedIntel =
    this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted || this.roundTimeLeft <= 0
  if (this.dom.itemOutlineBtn) {
    ;(this.dom.itemOutlineBtn as HTMLButtonElement).disabled = lockedIntel
  }
  if (this.dom.itemQualityBtn) {
    ;(this.dom.itemQualityBtn as HTMLButtonElement).disabled = lockedIntel
  }
  if (this.dom.itemDrawerToggleBtn) {
    ;(this.dom.itemDrawerToggleBtn as HTMLButtonElement).disabled = lockedIntel
    if (lockedIntel) {
      this.closeItemDrawer()
    }
  }

  const lockedBid = this.settled || this.roundResolving || this.roundPaused || this.playerBidSubmitted
  ;(this.dom.skillBtn as HTMLButtonElement).disabled = lockedIntel
  ;(this.dom.bidInput as HTMLInputElement).disabled = lockedBid
  if (lockedBid) {
    this.closeBidKeypad()
  }

  if (this.dom.nextRoundBtn) {
    ;(this.dom.nextRoundBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving || this.roundPaused
  }
  if (this.dom.settleBtn) {
    ;(this.dom.settleBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving || this.roundPaused
  }
  if (this.dom.pauseRoundBtn) {
    ;(this.dom.pauseRoundBtn as HTMLButtonElement).disabled = this.settled || this.roundResolving
    if (this.isLanMode && !this.lanIsHost) {
      this.dom.pauseRoundBtn.style.display = "none"
    } else {
      this.dom.pauseRoundBtn.style.display = ""
    }
  }
  if (this.isLanMode) {
    if (this.dom.nextRoundBtn) this.dom.nextRoundBtn.style.display = "none"
    if (this.dom.settleBtn) this.dom.settleBtn.style.display = "none"
  } else {
    if (this.dom.nextRoundBtn) this.dom.nextRoundBtn.style.display = ""
    if (this.dom.settleBtn) this.dom.settleBtn.style.display = ""
  }
}

/**
 * 更新 HUD（回合、计时器、金钱、侧边面板）
 */
export function updateHud(this: WarehouseSceneThis): void {
  const skillState = this.skillManager.getSkillState()
  const itemState = this.itemManager.getItemState()

  const clueCount = this.items.filter((item) => this.hasAnyInfo(item)).length
  const occupiedCells = this.items.reduce((sum, item) => sum + item.w * item.h, 0)
  const capacity = _GRID_COLS * _GRID_ROWS
  const bidState = this.playerBidSubmitted ? `玩家本轮已出价: ${this.playerRoundBid}` : "玩家本轮未出价"
  const timerText = this.roundPaused ? `已暂停 ${this.roundTimeLeft}s` : `倒计时 ${this.roundTimeLeft}s`

  const hudRoundText = this._hudRoundText
  const hudTimerText = this._hudTimerText
  const hudMoneyText = this._hudMoneyText

  if (hudRoundText) hudRoundText.textContent = `第 ${this.round}/${_GAME_SETTINGS.maxRounds} 回合`
  if (hudTimerText) {
    if (!this._timerSpan) {
      this._timerSpan = document.createElement("span")
      this._timerSpan.className = "round-timer-hot"
      hudTimerText.appendChild(this._timerSpan)
    }
    this._timerSpan.textContent = timerText
    this._timerSpan.classList.toggle("is-danger", !this.roundPaused && this.roundTimeLeft <= 5)
  }

  // 倒计时 <= 5 秒时对计时器元素附加脉冲心跳效果
  if (MobaoAnimations && this._timerSpan) {
    const isDangerState = !this.roundPaused && this.roundTimeLeft <= 5
    if (isDangerState && !this._timerSpan.dataset.pulseActive) {
      this._timerSpan.dataset.pulseActive = "1"
      MobaoAnimations.pulse(this._timerSpan, "heart", { duration: 900 })
    } else if (!isDangerState && this._timerSpan.dataset.pulseActive) {
      delete this._timerSpan.dataset.pulseActive
      MobaoAnimations.stopPulse(this._timerSpan)
    }
  }

  // 倒计时 <= 5 秒且非暂停时，屏幕两侧边缘闪烁
  const isDanger = !this.roundPaused && this.roundTimeLeft <= 5
  const gameAreaEl = document.getElementById("gameArea")
  if (gameAreaEl) {
    if (isDanger && !this._edgeFlashActive) {
      gameAreaEl.classList.add("timer-edges-flash")
      this._edgeFlashActive = true
    } else if (!isDanger && this._edgeFlashActive) {
      gameAreaEl.classList.remove("timer-edges-flash")
      this._edgeFlashActive = false
    }
  }

  // 金钱数字滚动动画（仅在金额真正变化时触发，避免每秒重播）
  if (hudMoneyText && MobaoAnimations) {
    if (this._lastDisplayedMoney !== this.playerMoney) {
      this._lastDisplayedMoney = this.playerMoney
      MobaoAnimations.scrollToNumber(hudMoneyText, this.playerMoney, { duration: 350 })
    }
  } else if (hudMoneyText) {
    hudMoneyText.textContent = this.playerMoney.toLocaleString()
  }

  this.renderItemDrawer()
  this.updateSidePanels(skillState, itemState, clueCount, occupiedCells, capacity, bidState)
  this.updateActionAvailability()

  // AI 托管按钮状态
  const toggleBtn = this.dom.autoPlayToggle
  if (toggleBtn) {
    const llmOn = this.canUseLlmDecision()
    toggleBtn.classList.toggle("is-active", this.autoplayManager.isActive())
    toggleBtn.textContent = this.autoplayManager.isActive() ? "托管中" : "托管"
    ;(toggleBtn as HTMLButtonElement).disabled = !llmOn || this.isLanMode
  }

  // 同步到 Pinia store（Vue HUD 渐进迁移）
  try {
    const gameStore = useGameStore()
    gameStore.updateRound(this.round, _GAME_SETTINGS.maxRounds, this.roundTimeLeft, this.actionsLeft)
    gameStore.updateMoney(this.playerMoney)
    gameStore.updateBid(this.currentBid, this.bidLeader, this.playerRoundBid, this.playerBidSubmitted)
    gameStore.updateTimer(this.roundTimeLeft, this.roundPaused)
    gameStore.updateSettled(this.settled)
    gameStore.updateRoundResolving(this.roundResolving)
  } catch {
    // Pinia 尚未初始化（Vue 应用未挂载），静默忽略
  }
}
