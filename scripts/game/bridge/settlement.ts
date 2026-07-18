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
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"
import { playSettlementFinalEffect as playSettlementFinalEffectParticles } from "./settlement-particles"

interface SettlementDeps {
  MARGIN: number
  CELL_SIZE: number
  delay(ms: number): Promise<void>
  tweenToPromise(scene: unknown, targets: unknown, config: unknown): Promise<void>
  settlementRevealDelayByQuality(qualityKey: string): number
  settlementSearchDurationByQuality(qualityKey: string): number
  [key: string]: unknown
}

/**
 * 创建结算桥接器。管理游戏结束后的结算流程，包括藏品揭示、利润计算、庆祝特效等
 * @param {SettlementDeps} deps - 依赖注入对象
 * @returns {{ methods: Record<string, unknown> }} 结算方法集合
 */
export function createSettlementBridge(deps: SettlementDeps) {
  const {
    MARGIN,
    CELL_SIZE,
    delay,
    tweenToPromise,
    settlementRevealDelayByQuality,
    settlementSearchDurationByQuality
  } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    isSettlementPageActive() {
      return document.body.classList.contains("settlement-mode")
    },

    /**
     * 逐个揭示仓库中所有藏品的真实信息（结算阶段）
     * @returns {Promise<void>}
     */
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

      this.updateSettlementPanelMetrics(revealedValue, revealedValue - (this.settlementSession?.winnerBid ?? 0))
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
          this.updateSettlementPanelMetrics(revealedValue, revealedValue - (this.settlementSession?.winnerBid ?? 0))
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
        this.updateSettlementPanelMetrics(revealedValue, revealedValue - (this.settlementSession?.winnerBid ?? 0))
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

    async playSettlementRevealStep(item: Artifact) {
      const duration = settlementRevealDelayByQuality(item.qualityKey)
      if (!item.view) {
        await delay(duration)
        return
      }

      const targets: Phaser.GameObjects.GameObject[] = [item.view.silhouette, item.view.border]

      // Quality-colored glow flash: brief overlay in quality color that fades out
      const qualityColor = item.quality ? item.quality.color : 0x9f9f9f
      let glowOverlay: Phaser.GameObjects.Rectangle | undefined
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
            if (glowOverlay && !glowOverlay.isDestroyed) glowOverlay.destroy()
          }
        })
      }

      const isFullyRevealed = item.revealed.exact === true
      const shouldShowArtifactImage = (isFullyRevealed || this.isSettlementRevealMode) && item.key
      const textureKey = `artifact-${item.key}`
      if (shouldShowArtifactImage && !item.view.artifactImage && this.textures.exists(textureKey)) {
        let markerX: number | undefined
        let markerY: number | undefined
        let markerW: number | undefined
        let markerH: number | undefined
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
        if (markerX != null && markerY != null && markerW != null && markerH != null) {
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
            onComplete: () => {
              if (halo && !halo.isDestroyed) {
                this.tweens.add({
                  targets: halo,
                  alpha: 0,
                  scaleX: 1.5,
                  scaleY: 1.5,
                  duration: duration * 0.4,
                  ease: "Sine.easeIn",
                  onComplete: function (this: WarehouseSceneThis) {
                    if (halo && !halo.isDestroyed) halo.destroy()
                  }
                })
              }
            }
          })
        }
      }

      await tweenToPromise(this, targets, {
        alpha: { from: 0.35, to: 1 },
        duration,
        ease: "Sine.easeInOut"
      })
    },

    async playSettlementSearchEffect(item: Artifact, runToken: number) {
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
        if (spinner && !spinner.isDestroyed) spinner.destroy()
        this.activeSettlementSpinner = null
        return
      }

      spinner.destroy()
      this.activeSettlementSpinner = null
    },

    /**
     * 播放结算最终庆祝特效（粒子爆炸+彩带）
     * @param {number} winnerProfit - 赢家利润（负数则不播放）
     * @returns {void}
     */
    playSettlementFinalEffect(winnerProfit: number) {
      playSettlementFinalEffectParticles(this, winnerProfit)
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
        const settlePage = this.dom.settlementPage
        if (settlePage) {
          settlePage.classList.remove("settle-glow", "settle-glow-enhanced")
          void settlePage.offsetWidth
          settlePage.classList.add("settle-glow-enhanced")
        }
        this.playSettlementFinalEffect(winnerProfit)

        // Screen shake when winner profits
        if (settlePage) {
          settlePage.classList.remove("settle-screen-shake")
          void settlePage.offsetWidth
          settlePage.classList.add("settle-screen-shake")
        }
      } else if (winnerProfit < 0) {
        profitEl.classList.add("profit-animate-shake")
      }
    },

    /**
     * 进入结算页面，显示赢家信息和结算面板
     * @param {Object} winnerPlayer - 赢家玩家对象 { id, name, ... }
     * @param {number} winnerBid - 赢家出价
     * @param {string} reasonText - 获胜原因描述
     * @returns {void}
     */
    enterSettlementPage(
      winnerPlayer: { id?: string; name?: string; [key: string]: unknown },
      winnerBid: number,
      reasonText: string
    ) {
      this.settlementSession = {
        winnerId: winnerPlayer.id,
        winnerName: winnerPlayer.name,
        winnerBid,
        reasonText
      }

      document.body.classList.add("settlement-mode")
      const settlePage = this.dom.settlementPage
      if (settlePage) {
        settlePage.classList.remove("hidden")
        settlePage.classList.add("settle-slide-in")
        settlePage.classList.remove("settle-glow")
      }
      const winnerNameEl = this.dom.settleWinnerName
      if (winnerNameEl) winnerNameEl.textContent = `${winnerPlayer.name}（${reasonText}）`
      const winnerBidEl = this.dom.settleWinnerBid
      if (winnerBidEl) winnerBidEl.textContent = String(winnerBid)
      if (this.dom.settleBackBtn) {
        const label = this.battleRecordReplayActive ? "返回战绩列表" : this.isLanMode ? "返回房间" : "返回大厅"
        this.dom.settleBackBtn.textContent = label
      }
      if (this.dom.settleSelfProfitRow) {
        if (!winnerPlayer.isSelf) {
          this.dom.settleSelfProfitRow.classList.add("hidden")
        }
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
        if (!settlePage) return
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
      const settlePage = this.dom.settlementPage
      if (settlePage) {
        settlePage.classList.add("hidden")
        settlePage.classList.remove("settle-slide-in", "settle-glow", "settle-glow-enhanced", "settle-screen-shake")
      }
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
      const progressTextEl = this.dom.settleProgressText
      if (progressTextEl) progressTextEl.textContent = text
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

    updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number, isSelfWinner?: boolean) {
      // 未显式传参时从 session 自动检测
      if (isSelfWinner === undefined) {
        const self = this.players.find((p) => p.isSelf)
        isSelfWinner = self && this.settlementSession ? self.id === this.settlementSession.winnerId : false
      }
      this._lastRevealedValue = revealedValue
      const revealedValueEl = this.dom.settleRevealedValue
      if (revealedValueEl) revealedValueEl.textContent = String(revealedValue)
      let displayProfit = winnerProfit
      let passiveLabel = ""
      if (winnerProfit > 0) {
        const self = this.players.find((p) => p.isSelf)
        const selfIsWinner = self && this.settlementSession && self.id === this.settlementSession.winnerId
        // 自身是拍下者时被动加成滚动到自身利润行；非拍下者时照常走拍下者利润行
        if (selfIsWinner) {
          const result = applyPassiveEffect({ profit: winnerProfit })
          if (result.bonus > 0 && result.label) {
            passiveLabel = `（+${result.bonus}）`
            displayProfit += result.bonus
          }
        }
      }
      this._lastDisplayProfit = displayProfit

      const winnerProfitEl = this.dom.settleWinnerProfit
      const selfProfitEl = this.dom.settleSelfProfit
      const targetEl = isSelfWinner ? selfProfitEl : winnerProfitEl

      // 自身拍下者时隐藏拍下者利润行，在自身利润行滚动
      if (isSelfWinner && winnerProfitEl) {
        const row = winnerProfitEl.closest(".settle-meta-row")
        if (row) row.classList.add("hidden")
        if (this.dom.settleSelfProfitRow) this.dom.settleSelfProfitRow.classList.remove("hidden")
      }

      if (!targetEl) return
      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.scrollToNumber(targetEl, displayProfit, {
          duration: 250,
          prefix: displayProfit >= 0 ? "+" : "",
          suffix: passiveLabel
        })
      } else {
        targetEl.textContent = `${displayProfit >= 0 ? "+" : ""}${displayProfit}${passiveLabel}`
      }
      targetEl.classList.remove("profit-positive", "profit-negative", "profit-neutral")
      if (displayProfit > 0) {
        targetEl.classList.add("profit-positive")
      } else if (displayProfit < 0) {
        targetEl.classList.add("profit-negative")
      } else {
        targetEl.classList.add("profit-neutral")
      }
    },

    showSelfProfit(selfProfit: number, label: string, adjustedProfit?: number) {
      if (!this.dom.settleSelfProfitRow || !this.dom.settleSelfProfit) {
        return
      }
      this.dom.settleSelfProfitRow.classList.remove("hidden")
      const displayLabel = label || "自身利润"
      const spanEl = this.dom.settleSelfProfitRow.querySelector("span")
      if (spanEl) spanEl.textContent = displayLabel
      const profitEl = this.dom.settleSelfProfit
      const useBonus = adjustedProfit !== undefined && adjustedProfit !== selfProfit
      const finalValue = useBonus ? adjustedProfit : selfProfit
      const bonusAmount = useBonus ? (adjustedProfit as number) - selfProfit : 0

      // 有加成时：划掉原值，旁边显示加成后值+加成额
      let suffix = ""
      if (useBonus) {
        suffix += ` <span class="settle-profit-raw" style="text-decoration:line-through;color:#999;font-size:0.85em;margin-left:8px">${selfProfit >= 0 ? "+" : ""}${selfProfit}</span>`
        suffix += ` <span class="settle-profit-bonus" style="color:#f5c842;font-size:0.85em">（${bonusAmount >= 0 ? "+" : ""}${bonusAmount}）</span>`
      }

      if (typeof MobaoAnimations !== "undefined") {
        MobaoAnimations.scrollToNumber(profitEl, finalValue, {
          duration: 400,
          prefix: finalValue >= 0 ? "+" : ""
        })
      } else {
        profitEl.textContent = `${finalValue >= 0 ? "+" : ""}${finalValue}`
      }
      // 追加划掉值和加成额
      if (useBonus) {
        profitEl.innerHTML = profitEl.innerHTML + suffix
      }
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
