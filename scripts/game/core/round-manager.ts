/**
 * @file round-manager.js
 * @module core/round-manager
 * @description 回合生命周期管理。负责回合初始化、计时器、暂停/恢复、出价显示重置。
 *              所有方法通过 Mixin 混入 WarehouseScene，操作 this 上的状态和 DOM。
 *
 * 核心方法：
 *   - startRound: 初始化回合状态，启动计时器和 AI 决策
 *   - startRoundTimer: 启动 1 秒倒计时，处理超时结算
 *   - stopRoundTimer: 停止计时器
 *   - toggleRoundPause: 切换暂停/恢复
 *   - syncPauseButton: 同步暂停按钮 UI
 *   - resetRoundBidDisplay: 重置出价显示
 *   - resetRoundBidReadyState: 重置出价就绪状态
 *
 * @requires window.MobaoAnimations - 动效系统（暂停视觉反馈）
 * @requires window.AudioUI - 音效 UI（倒计时提示）
 */

const RoundManagerMixin: Record<string, Function> = {
  startRound() {
    this.roundResolving = false
    this.roundPaused = false
    this.actionsLeft = GAME_SETTINGS.actionsPerRound
    this.roundTimeLeft = GAME_SETTINGS.roundSeconds
    this.playerBidSubmitted = false
    this.playerRoundBid = 0
    this.clearCurrentRoundUsage()
    this.resetAiRoundResources()
    this.aiLlmRoundPlans = {}
    this.aiRoundDecisionPromise = null
    this.resetRoundBidDisplay()
    this.resetRoundBidReadyState()
    this.closeBidKeypad()
    this.dom.bidInput.value = this.round <= 1 ? "" : "0"
    this.dom.bidInput.placeholder = this.round <= 1 ? "点击出价" : ""
    this.syncPauseButton()
    this.startRoundTimer()
    if (!this.isLanMode || this.lanIsHost) {
      console.log("[startRound] calling kickoffAiRoundDecisions, round:", this.round)
      this.kickoffAiRoundDecisions()
    } else {
      console.log(
        "[startRound] SKIPPED kickoffAiRoundDecisions, isLanMode:",
        this.isLanMode,
        "lanIsHost:",
        this.lanIsHost
      )
    }
  },

  startRoundTimer() {
    this.stopRoundTimer()
    this.roundTimerId = window.setInterval(() => {
      if (this.roundResolving || this.settled) {
        this.stopRoundTimer()
        return
      }

      if (this.roundPaused) {
        return
      }

      this.roundTimeLeft -= 1
      this.updateHud()
      if (this.roundTimeLeft === 5 && window.AudioUI) {
        AudioUI.playCountdown()
      }
      if (this.roundTimeLeft <= 0) {
        if (this.isLanMode && this.lanBridge) {
          this.stopRoundTimer()
          this.writeLog("联机模式：回合时间到，等待主机结算")
        } else {
          this.resolveRoundBids("timeout")
        }
      }
    }, 1000)
  },

  stopRoundTimer() {
    if (this.roundTimerId) {
      window.clearInterval(this.roundTimerId)
      this.roundTimerId = null
    }
  },

  toggleRoundPause() {
    if (this.isLanMode && !this.lanIsHost) return
    if (this.settled || this.roundResolving) {
      return
    }

    this.roundPaused = !this.roundPaused
    if (this.roundPaused) {
      this._pauseSnapshotTimeLeft = this.roundTimeLeft
    } else if (this._pauseSnapshotTimeLeft != null) {
      this.roundTimeLeft = this._pauseSnapshotTimeLeft
      this._pauseSnapshotTimeLeft = null
    }
    this.syncPauseButton()

    if (window.MobaoAnimations) {
      const hudEl = document.querySelector(".hud")
      const timerSpan = this._timerSpan || null
      MobaoAnimations.togglePauseVisual(hudEl, this.roundPaused, timerSpan)
    }

    this.updateHud()
    if (this.isLanMode) {
      if (this.roundPaused) {
        this.showLanPauseOverlay()
      } else {
        this.hideLanPauseOverlay()
      }
      if (this.lanBridge) {
        this.lanBridge.togglePause(this.roundPaused, this.roundTimeLeft)
      }
    }
    this.writeLog(this.roundPaused ? "回合已暂停：计时冻结，可查看日志与AI面板。" : "回合已继续：计时恢复。")
  },

  syncPauseButton() {
    if (!this.dom.pauseRoundBtn) {
      return
    }
    const icon = this.roundPaused
      ? '<img src="./assets/images/icons/ui/play-button.svg" alt="" class="btn-icon">'
      : '<img src="./assets/images/icons/ui/pause-button.svg" alt="" class="btn-icon">'
    const text = this.roundPaused ? "继续回合" : "暂停回合"
    this.dom.pauseRoundBtn.innerHTML = `${icon}${text}`
    this.dom.pauseRoundBtn.classList.toggle("is-paused", this.roundPaused)
  },

  resetRoundBidDisplay() {
    this.players.forEach((player) => {
      const bidEl = document.getElementById(`bid-${player.id}`)
      const cardEl = document.getElementById(`playerCard-${player.id}`)
      if (bidEl) {
        bidEl.textContent = "待公布"
      }
      if (cardEl) {
        cardEl.classList.remove("revealed", "winner", "runner", "bid-pop", "bid-ready")
      }
    })
  },

  resetRoundBidReadyState() {
    this.roundBidReadyState = {}
    this.players.forEach((player) => {
      this.roundBidReadyState[player.id] = false
      this.setPlayerBidReady(player.id, false)
    })
  }
}

window.MobaoRoundManager = RoundManagerMixin