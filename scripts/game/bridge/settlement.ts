/**
 * @file bridge/settlement.js
 * @module bridge/settlement
 * @description 结算系统 Bridge。采用工厂函数模式（createSettlementBridge），
 *              通过依赖注入获取布局常量和动画工具，返回 Mixin 对象。
 *              负责拍卖结束后的结算页面管理，包括藏品逐个揭示动画、品质特效、
 *              最终庆祝粒子效果、以及结算页面的进入/退出。
 *
 * 核心职责：
 *   - 结算页面管理：enterSettlementPage / exitSettlementPage
 *     切换到结算模式，显示成交信息、利润、操作按钮
 *   - 藏品揭示动画：revealAllArtifactsForSettlement
 *     逐个揭示藏品品质：搜索旋转动画 → 品质揭示 → 光晕特效 → 进度更新
 *     支持点击跳过（settlementRevealSkipRequested），快速揭示剩余藏品
 *   - 搜索特效：playSettlementSearchEffect
 *     金色旋转弧线动画，时长按品质等级区分
 *   - 揭示步骤：playSettlementRevealStep
 *     品质光晕闪烁 + 藏品图片渐入 + 光环扩散动画
 *   - 最终庆祝：playSettlementFinalEffect / triggerSettlementFinalAnimation
 *     赢家利润 > 0 时触发：金币爆发粒子 + 星星粒子 + 上升粒子 + 闪烁粒子
 *     绝品多的对局有更华丽的金色粒子效果
 *   - 利润动画：正利润弹跳+光效，负利润抖动
 *   - 结算面板指标：updateSettlementPanelMetrics（揭示价值、利润实时更新）
 *
 * 依赖注入参数（deps）：
 *   - MARGIN, CELL_SIZE: 仓库网格布局常量
 *   - delay, tweenToPromise: 动画工具函数
 *   - settlementRevealDelayByQuality, settlementSearchDurationByQuality:
 *     按品质等级返回动画时长的函数
 *
 * @requires Phaser       - 游戏引擎（this.tweens, this.add.rectangle/circle/star/image）
 * @requires AudioUI      - 音频系统（startSearch, stopSearch, playSettlementReveal, play）
 * @requires MobaoAnimations - 动画系统（staggerEnter 结算页元素渐次入场）
 *
 * @exports MobaoSettlement.createSettlementBridge - 工厂函数，返回结算 Mixin
 *
 * 使用方式：
 *   const bridge = createSettlementBridge({ MARGIN, CELL_SIZE, delay, tweenToPromise, ... });
 *   Object.assign(scene, bridge);
 */
import { AudioUI } from "../../audio/audio-ui"
import { AudioManager } from "../../audio/audio-manager"
import { applyPassiveEffect } from "../data/character-system"

interface SettlementDeps {
  MARGIN: number
  CELL_SIZE: number
  delay(ms: number): Promise<void>
  tweenToPromise(scene: unknown, targets: unknown, config: unknown): Promise<void>
  settlementRevealDelayByQuality(qualityKey: string): number
  settlementSearchDurationByQuality(qualityKey: string): number
  [key: string]: unknown
}

export function createSettlementBridge(deps: SettlementDeps): { methods: Record<string, unknown> } {
  const {
    MARGIN,
    CELL_SIZE,
    delay,
    tweenToPromise,
    settlementRevealDelayByQuality,
    settlementSearchDurationByQuality
  } = deps

  const methods = {
    isSettlementPageActive() {
      return document.body.classList.contains("settlement-mode")
    },

    async revealAllArtifactsForSettlement() {
      const runToken = Date.now() + Math.random()
      this.settlementRunToken = runToken
      this.settlementRevealRunning = true
      this.settlementRevealSkipRequested = false
      this.isSettlementRevealMode = true
      this.hideRevealScrollHints()

      this.items.forEach((item) => {
        item.revealed.settlementPreRevealed = Boolean(item.revealed.exact)
      })

      const totalCount = this.items.length
      let revealedCount = this.items.filter((item) => item.revealed.settlementPreRevealed).length
      let revealedValue = this.items
        .filter((item) => item.revealed.settlementPreRevealed)
        .reduce((sum, item) => sum + item.trueValue, 0)

      this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid)
      this.setSettlementProgress(
        `正在揭示藏品 ${revealedCount}/${totalCount}，点击游戏区可跳过。`,
        revealedCount / totalCount
      )

      this.items.forEach((item) => {
        if (!item.revealed.outline) {
          this.revealOutline(item, { settlementShowName: false, settlementSkipImage: true, skipEffects: true })
        }
      })

      const orderedItems = [...this.items].sort((a, b) => {
        if (a.y !== b.y) {
          return a.y - b.y
        }
        if (a.x !== b.x) {
          return a.x - b.x
        }
        return a.id.localeCompare(b.id)
      })

      const revealQueue = orderedItems.filter((item) => !item.revealed.settlementPreRevealed)

      for (let i = 0; i < revealQueue.length; i += 1) {
        if (runToken !== this.settlementRunToken) {
          return
        }

        const item = revealQueue[i]

        if (this.settlementRevealSkipRequested) {
          for (let j = i; j < revealQueue.length; j += 1) {
            const rest = revealQueue[j]
            if (!rest.revealed.qualityCell) {
              this.revealQualityCell(rest, { showName: true })
            } else {
              this.renderQualityVisual(rest, { showName: true })
            }
          }
          revealedValue = this.warehouseTrueValue
          this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid)
          this.setSettlementProgress(`已快速揭示全部藏品 ${totalCount}/${totalCount}`, 1)
          break
        }

        if (AudioUI) {
          AudioUI.startSearch()
        }

        await this.playSettlementSearchEffect(item, runToken)

        if (runToken !== this.settlementRunToken) {
          if (AudioUI) {
            AudioUI.stopSearch()
          }
          return
        }

        if (!item.revealed.qualityCell) {
          this.revealQualityCell(item, { showName: true })
        } else {
          this.renderQualityVisual(item, { showName: true })
          this.playQualityRevealEffect(item)
        }

        if (AudioUI) {
          AudioUI.stopSearch()
          AudioUI.playSettlementReveal(item.qualityKey)
        }

        revealedValue += item.trueValue
        revealedCount += 1
        this.updateSettlementPanelMetrics(revealedValue, revealedValue - this.settlementSession.winnerBid)
        this.setSettlementProgress(
          `正在揭示藏品 ${revealedCount}/${totalCount}：${item.name}`,
          revealedCount / totalCount
        )
        await this.playSettlementRevealStep(item)
      }

      if (runToken !== this.settlementRunToken) {
        return
      }

      if (AudioUI) {
        AudioUI.play("coinsReveal")
      }

      this.settlementRevealRunning = false
      this.settlementRevealSkipRequested = false
      this.isSettlementRevealMode = false
    },

    async playSettlementRevealStep(item) {
      const duration = settlementRevealDelayByQuality(item.qualityKey)
      if (!item.view) {
        await delay(duration)
        return
      }

      const targets = [item.view.silhouette, item.view.border]

      // Quality-colored glow flash: brief overlay in quality color that fades out
      const qualityColor = item.quality ? item.quality.color : 0x9f9f9f
      let glowOverlay
      if (item.revealed.outline && item.w * item.h > 0) {
        const gx = MARGIN + item.x * CELL_SIZE
        const gy = MARGIN + item.y * CELL_SIZE
        const gw = item.w * CELL_SIZE
        const gh = item.h * CELL_SIZE
        glowOverlay = this.add.rectangle(gx, gy, gw, gh, qualityColor, 0)
        glowOverlay.setOrigin(0, 0)
        glowOverlay.setDepth(item.view.border ? item.view.border.depth - 1 : 39)
        this.tweens.add({
          targets: glowOverlay,
          alpha: { from: 0, to: 0.35 },
          duration: duration * 0.3,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: function () {
            if (glowOverlay && !glowOverlay.destroyed) glowOverlay.destroy()
          }
        })
      }

      const isFullyRevealed = item.revealed.exact === true
      const shouldShowArtifactImage = (isFullyRevealed || this.isSettlementRevealMode) && item.key
      const textureKey = `artifact-${item.key}`
      if (shouldShowArtifactImage && !item.view.artifactImage && this.textures.exists(textureKey)) {
        let markerX
        let markerY
        let markerW
        let markerH
        if (item.revealed.outline && item.w * item.h > 1) {
          markerX = MARGIN + item.x * CELL_SIZE
          markerY = MARGIN + item.y * CELL_SIZE
          markerW = item.w * CELL_SIZE
          markerH = item.h * CELL_SIZE
        } else if (item.revealed.qualityCell) {
          markerX = MARGIN + item.revealed.qualityCell.x * CELL_SIZE
          markerY = MARGIN + item.revealed.qualityCell.y * CELL_SIZE
          markerW = CELL_SIZE
          markerH = CELL_SIZE
        }
        if (markerW != null) {
          const artifactImage = this.add.image(markerX + markerW / 2, markerY + markerH / 2, textureKey)
          artifactImage.setOrigin(0.5, 0.5)
          artifactImage.setDisplaySize(markerW, markerH)
          artifactImage.setAlpha(0)
          item.view.qualityMarkers.add(artifactImage)
          item.view.artifactImage = artifactImage
          targets.push(artifactImage)

          // Brief halo circle behind artifact image
          const haloSize = Math.max(markerW, markerH) * 0.8
          const halo = this.add.circle(markerX + markerW / 2, markerY + markerH / 2, haloSize, qualityColor, 0)
          halo.setStrokeStyle(3, qualityColor, 0.5)
          halo.setDepth(artifactImage.depth - 1)
          this.tweens.add({
            targets: halo,
            alpha: { from: 0, to: 0.6 },
            scaleX: { from: 0.3, to: 1.2 },
            scaleY: { from: 0.3, to: 1.2 },
            duration: duration * 0.4,
            ease: "Quad.easeOut",
            onComplete: function () {
              if (halo && !halo.destroyed) {
                this.tweens.add({
                  targets: halo,
                  alpha: 0,
                  scaleX: 1.5,
                  scaleY: 1.5,
                  duration: duration * 0.4,
                  ease: "Sine.easeIn",
                  onComplete: function () {
                    if (halo && !halo.destroyed) halo.destroy()
                  }
                })
              }
            }.bind(this)
          })
        }
      }

      await tweenToPromise(this, targets, {
        alpha: { from: 0.35, to: 1 },
        duration,
        ease: "Sine.easeInOut"
      })
    },

    async playSettlementSearchEffect(item, runToken) {
      if (!item.view) {
        return
      }

      const duration = settlementSearchDurationByQuality(item.qualityKey)
      const centerX = MARGIN + item.x * CELL_SIZE + (item.w * CELL_SIZE) / 2
      const centerY = MARGIN + item.y * CELL_SIZE + (item.h * CELL_SIZE) / 2

      // Uniform spinner arc
      const spinner = this.add.arc(centerX, centerY, 20, 0, 280, false, 0xffd700, 0)
      spinner.setStrokeStyle(3, 0xffd700, 0.9)
      spinner.setDepth(40)
      this.activeSettlementSpinner = spinner

      await tweenToPromise(this, spinner, {
        angle: { from: 0, to: 360 },
        duration,
        ease: "Linear"
      })

      if (runToken !== this.settlementRunToken) {
        if (spinner && !spinner.destroyed) spinner.destroy()
        this.activeSettlementSpinner = null
        return
      }

      spinner.destroy()
      this.activeSettlementSpinner = null
    },

    playSettlementFinalEffect(winnerProfit: number) {
      if (winnerProfit <= 0) {
        return
      }

      const gameWidth = this.scale.width
      const gameHeight = this.scale.height
      const colors = [0xffd700, 0xffec8b, 0xffc125, 0xffdf00, 0xffb90f, 0xfce6a0, 0xffe135]

      // Determine if this is a legendary-rich game (high profit or many legendary items)
      const hasLegendaryItems =
        this.items &&
        this.items.some(function (it) {
          return it.qualityKey === "legendary"
        })
      const isLegendaryHeavy = hasLegendaryItems || winnerProfit > 500000
      // Legendary-heavy: weighted toward gold; normal: colorful mix
      const starColors = isLegendaryHeavy
        ? [0xffd700, 0xffd700, 0xffd700, 0xffec8b, 0xffec8b, 0xffc125, 0xffdf00]
        : [0xffd700, 0xffec8b, 0xffc125, 0xffdf00, 0xffb90f, 0xfce6a0, 0xffe135, 0xff6b6b, 0x69b4ff, 0x90ee90]

      const burstCount = 5
      for (let burst = 0; burst < burstCount; burst += 1) {
        const burstDelay = burst * 150
        const cx = gameWidth * (0.2 + Math.random() * 0.6)
        const cy = gameHeight * (0.3 + Math.random() * 0.4)

        // Existing coin circles
        for (let i = 0; i < 20; i += 1) {
          const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3
          const speed = 80 + Math.random() * 120
          const radius = 3 + Math.random() * 4
          const color = colors[Math.floor(Math.random() * colors.length)]

          const particle = this.add.circle(cx, cy, radius, color, 0.95)
          particle.setDepth(100)

          const targetX = cx + Math.cos(angle) * speed
          const targetY = cy + Math.sin(angle) * speed

          this.tweens.add({
            targets: particle,
            x: targetX,
            y: targetY,
            alpha: { from: 0.95, to: 0 },
            scaleX: { from: 1, to: 0.1 },
            scaleY: { from: 1, to: 0.1 },
            duration: 600 + Math.random() * 400,
            delay: burstDelay,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (particle && !particle.destroyed) {
                particle.destroy()
              }
            }
          })
        }

        // Added: star particles in each burst (4-point golden stars)
        const starCount = isLegendaryHeavy ? 8 : 5
        for (let i = 0; i < starCount; i += 1) {
          const angle = Math.random() * Math.PI * 2
          const speed = 60 + Math.random() * 100
          const starSize = 6 + Math.random() * 8
          const starColor = starColors[Math.floor(Math.random() * starColors.length)]

          const star = this.add.star(cx, cy, 4, starSize * 0.3, starSize, starColor, 0.9)
          star.setDepth(101)

          const targetX = cx + Math.cos(angle) * speed
          const targetY = cy + Math.sin(angle) * speed

          this.tweens.add({
            targets: star,
            x: targetX,
            y: targetY,
            alpha: { from: 0.9, to: 0 },
            scaleX: { from: 1, to: 0.2 },
            scaleY: { from: 1, to: 0.2 },
            angle: { from: 0, to: 180 + Math.random() * 180 },
            duration: 500 + Math.random() * 400,
            delay: burstDelay + Math.random() * 60,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (star && !star.destroyed) {
                star.destroy()
              }
            }
          })
        }
      }

      const riseCount = 40
      for (let i = 0; i < riseCount; i += 1) {
        const x = Math.random() * gameWidth
        const y = gameHeight + 20 + Math.random() * 60
        const radius = 2 + Math.random() * 3
        const color = colors[Math.floor(Math.random() * colors.length)]

        const particle = this.add.circle(x, y, radius, color, 0.85)
        particle.setDepth(100)

        const targetX = x + (Math.random() - 0.5) * 100
        const targetY = -30 - Math.random() * 80
        const duration = 1200 + Math.random() * 800
        const delay = Math.random() * 600

        this.tweens.add({
          targets: particle,
          x: targetX,
          y: targetY,
          alpha: { from: 0.85, to: 0 },
          scaleX: { from: 1, to: 0.3 },
          scaleY: { from: 1, to: 0.3 },
          angle: { from: 0, to: (Math.random() - 0.5) * 360 },
          duration,
          delay,
          ease: "Sine.easeOut",
          onComplete: () => {
            if (particle && !particle.destroyed) {
              particle.destroy()
            }
          }
        })
      }

      // Added: rising star particles alongside existing circles
      const riseStarCount = isLegendaryHeavy ? 15 : 8
      for (let i = 0; i < riseStarCount; i += 1) {
        const x = Math.random() * gameWidth
        const y = gameHeight + 10 + Math.random() * 50
        const starSize = 5 + Math.random() * 7
        const starColor = starColors[Math.floor(Math.random() * starColors.length)]

        const star = this.add.star(x, y, 4, starSize * 0.3, starSize, starColor, 0.8)
        star.setDepth(101)

        const targetX = x + (Math.random() - 0.5) * 80
        const targetY = -20 - Math.random() * 60
        const duration = 1000 + Math.random() * 600
        const delay = Math.random() * 500 + burstCount * 150 + 200

        this.tweens.add({
          targets: star,
          x: targetX,
          y: targetY,
          alpha: { from: 0.8, to: 0 },
          scaleX: { from: 1, to: 0.3 },
          scaleY: { from: 1, to: 0.3 },
          angle: { from: 0, to: (Math.random() - 0.5) * 360 },
          duration,
          delay,
          ease: "Sine.easeOut",
          onComplete: () => {
            if (star && !star.destroyed) {
              star.destroy()
            }
          }
        })
      }

      const sparkleCount = 15
      for (let i = 0; i < sparkleCount; i += 1) {
        const x = Math.random() * gameWidth
        const y = Math.random() * gameHeight * 0.7
        const size = 4 + Math.random() * 6

        const sparkle = this.add.star(x, y, 4, size * 0.4, size, 0xffffff, 0)
        sparkle.setDepth(101)

        this.tweens.add({
          targets: sparkle,
          alpha: { from: 0, to: 1 },
          scaleX: { from: 0.5, to: 1.2 },
          scaleY: { from: 0.5, to: 1.2 },
          duration: 200,
          delay: Math.random() * 800,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (sparkle && !sparkle.destroyed) {
              sparkle.destroy()
            }
          }
        })
      }
    },

    triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean) {
      if (!isSelfWinner) {
        return
      }

      const profitEl = this.dom.settleWinnerProfit
      if (!profitEl) {
        return
      }

      profitEl.classList.remove("profit-animate-bounce", "profit-animate-shake", "profit-animate-spark")

      // Winner name entry animation
      const winnerNameEl = this.dom.settleWinnerName
      if (winnerNameEl) {
        winnerNameEl.classList.remove("settle-winner-name-animate")
        // Force reflow to restart animation
        void winnerNameEl.offsetWidth
        winnerNameEl.classList.add("settle-winner-name-animate")
      }

      if (winnerProfit > 0) {
        profitEl.classList.add("profit-animate-bounce")
        profitEl.classList.add("profit-animate-spark")
        this.dom.settlementPage.classList.remove("settle-glow", "settle-glow-enhanced")
        void this.dom.settlementPage.offsetWidth
        this.dom.settlementPage.classList.add("settle-glow-enhanced")
        this.playSettlementFinalEffect(winnerProfit)

        // Screen shake when winner profits
        this.dom.settlementPage.classList.remove("settle-screen-shake")
        void this.dom.settlementPage.offsetWidth
        this.dom.settlementPage.classList.add("settle-screen-shake")
      } else if (winnerProfit < 0) {
        profitEl.classList.add("profit-animate-shake")
      }
    },

    enterSettlementPage(winnerPlayer: { id?: string; name?: string;[key: string]: unknown }, winnerBid: number, reasonText: string) {
      this.settlementSession = {
        winnerId: winnerPlayer.id,
        winnerName: winnerPlayer.name,
        winnerBid,
        reasonText
      }

      document.body.classList.add("settlement-mode")
      this.dom.settlementPage.classList.remove("hidden")
      this.dom.settlementPage.classList.add("settle-slide-in")
      this.dom.settlementPage.classList.remove("settle-glow")
      this.dom.settleWinnerName.textContent = `${winnerPlayer.name}（${reasonText}）`
      this.dom.settleWinnerBid.textContent = String(winnerBid)
      if (this.dom.settleBackBtn) {
        const label = this.battleRecordReplayActive ? "返回战绩列表" : this.isLanMode ? "返回房间" : "返回大厅"
        this.dom.settleBackBtn.textContent = label
      }
      if (this.dom.settleSelfProfitRow) {
        this.dom.settleSelfProfitRow.classList.add("hidden")
      }
      if (this.dom.settleReplayBtn) {
        if (this.battleRecordReplayActive) {
          this.dom.settleReplayBtn.classList.add("hidden")
        } else {
          this.dom.settleReplayBtn.classList.remove("hidden")
        }
      }
      this.updateSettlementPanelMetrics(0, -winnerBid)
      this.setSettlementProgress("准备揭示藏品...", 0)
      this.hidePreview()
      this.closeBidKeypad()
      this.closeItemDrawer()
      if (typeof this.updateReflectionStatusUI === "function") {
        this.updateReflectionStatusUI()
      }
      if (typeof AudioManager !== "undefined") {
        AudioManager.pauseBgm()
      }

      // 结算页面卡片渐次入场
      if (typeof MobaoAnimations !== "undefined") {
        const settlePage = this.dom.settlementPage
        const metaElements = settlePage.querySelectorAll(".settle-meta")
        const actionButtons = settlePage.querySelectorAll(".settle-actions button")
        const staggerTargets = []

        // 标题 h2
        const titleEl = settlePage.querySelector("h2")
        if (titleEl) staggerTargets.push(titleEl)

        // 各个 meta 行
        metaElements.forEach(function (el) {
          staggerTargets.push(el)
        })

        // 进度文本
        const progressEl = this.dom.settleProgressText
        if (progressEl) staggerTargets.push(progressEl.closest(".settle-progress") || progressEl)

        // 按钮
        actionButtons.forEach(function (el) {
          staggerTargets.push(el)
        })

        MobaoAnimations.staggerEnter(staggerTargets, {
          staggerDelay: 60,
          initialDelay: 100,
          direction: "up"
        })
      }
    },

    exitSettlementPage() {
      this.cancelSettlementReveal()
      document.body.classList.remove("settlement-mode")
      this.dom.settlementPage.classList.add("hidden")
      this.dom.settlementPage.classList.remove(
        "settle-slide-in",
        "settle-glow",
        "settle-glow-enhanced",
        "settle-screen-shake"
      )
      const profitEl = this.dom.settleWinnerProfit
      if (profitEl) {
        profitEl.classList.remove("profit-animate-bounce", "profit-animate-shake", "profit-animate-spark")
      }
      const winnerNameEl = this.dom.settleWinnerName
      if (winnerNameEl) {
        winnerNameEl.classList.remove("settle-winner-name-animate")
      }
      this.settlementSession = null
      this.hidePreview()
    },

    cancelSettlementReveal() {
      this.settlementRunToken = 0
      this.isSettlementRevealMode = false
      this.settlementRevealRunning = false
      this.settlementRevealSkipRequested = false
      if (this.activeSettlementSpinner) {
        this.activeSettlementSpinner.destroy()
        this.activeSettlementSpinner = null
      }
    },

    setSettlementProgress(text: string, progress: number) {
      this.dom.settleProgressText.textContent = text
      const fillEl = this.dom.settleProgressFill
      if (fillEl) {
        const pct = typeof progress === "number" ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : null
        if (pct !== null) {
          fillEl.style.width = pct + "%"
          if (pct >= 100) {
            fillEl.style.background = "linear-gradient(90deg, #ffd700, #ffec8b, #ffd700)"
            fillEl.style.backgroundSize = "200% 100%"
          }
        }
      }
    },

    updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number) {
      this._lastRevealedValue = revealedValue
      this.dom.settleRevealedValue.textContent = String(revealedValue)
      let displayProfit = winnerProfit
      let passiveLabel = ""
      if (winnerProfit > 0) {
        const self = this.players.find((p) => p.isSelf)
        const isSelfWinner = self && this.settlementSession && self.id === this.settlementSession.winnerId
        if (isSelfWinner) {
          const result = applyPassiveEffect({ profit: winnerProfit })
          if (result.bonus > 0 && result.label) {
            passiveLabel = `（+${result.bonus}）`
            displayProfit += result.bonus
          }
        }
      }
      this._lastDisplayProfit = displayProfit
      const profitEl = this.dom.settleWinnerProfit
      if (profitEl && typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.scrollToNumber(profitEl, displayProfit, {
          duration: 250,
          prefix: displayProfit >= 0 ? "+" : "",
          suffix: passiveLabel
        })
      } else {
        profitEl.textContent = `${displayProfit >= 0 ? "+" : ""}${displayProfit}${passiveLabel}`
      }
      profitEl.classList.remove("profit-positive", "profit-negative", "profit-neutral")
      if (displayProfit > 0) {
        profitEl.classList.add("profit-positive")
      } else if (displayProfit < 0) {
        profitEl.classList.add("profit-negative")
      } else {
        profitEl.classList.add("profit-neutral")
      }
    },

    showSelfProfit(selfProfit: number, label: string) {
      if (!this.dom.settleSelfProfitRow || !this.dom.settleSelfProfit) {
        return
      }
      this.dom.settleSelfProfitRow.classList.remove("hidden")
      const displayLabel = label || "自身利润"
      this.dom.settleSelfProfitRow.querySelector("span").textContent = displayLabel
      const profitEl = this.dom.settleSelfProfit
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.scrollToNumber(profitEl, selfProfit, {
          duration: 400,
          prefix: selfProfit >= 0 ? "+" : ""
        })
      } else {
        profitEl.textContent = `${selfProfit >= 0 ? "+" : ""}${selfProfit}`
      }
      profitEl.classList.remove("profit-positive", "profit-negative", "profit-neutral")
      if (selfProfit > 0) {
        profitEl.classList.add("profit-positive")
      } else if (selfProfit < 0) {
        profitEl.classList.add("profit-negative")
      } else {
        profitEl.classList.add("profit-neutral")
      }
    }
  }

  return { methods }
}
