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
 *
 * @exports RoundManagerMixin - 回合生命周期管理 Mixin
 */

import { MobaoAnimations } from "../animations"
import { AudioUI } from "../../audio/audio-ui"
import { GAME_SETTINGS } from "./settings"

export const RoundManagerMixin: Record<string, Function> = {
  startRound() {
    (this as unknown as { roundResolving: boolean }).roundResolving = false;
    (this as unknown as { roundPaused: boolean }).roundPaused = false;
    (this as unknown as { actionsLeft: number }).actionsLeft = GAME_SETTINGS.actionsPerRound;
    (this as unknown as { roundTimeLeft: number }).roundTimeLeft = GAME_SETTINGS.roundSeconds;
      (this as unknown as { playerBidSubmitted: boolean }).playerBidSubmitted = false;
        (this as unknown as { playerRoundBid: number }).playerRoundBid = 0;
          (this as unknown as { clearCurrentRoundUsage(): void }).clearCurrentRoundUsage();
          (this as unknown as { resetAiRoundResources(): void }).resetAiRoundResources();
          (this as unknown as { aiLlmRoundPlans: Record<string, unknown> }).aiLlmRoundPlans = {};
            (this as unknown as { aiRoundDecisionPromise: Promise<unknown> | null }).aiRoundDecisionPromise = null;
              (this as unknown as { resetRoundBidDisplay(): void }).resetRoundBidDisplay();
              (this as unknown as { resetRoundBidReadyState(): void }).resetRoundBidReadyState();
              (this as unknown as { closeBidKeypad(): void }).closeBidKeypad();
              (this as unknown as { dom: { bidInput: HTMLInputElement } }).dom.bidInput.value = (this as unknown as { round: number }).round <= 1 ? "" : "0";
                (this as unknown as { dom: { bidInput: HTMLInputElement } }).dom.bidInput.placeholder = (this as unknown as { round: number }).round <= 1 ? "点击出价" : "";
                  (this as unknown as { syncPauseButton(): void }).syncPauseButton();
                  (this as unknown as { startRoundTimer(): void }).startRoundTimer();
    if (!(this as unknown as { isLanMode: boolean }).isLanMode || (this as unknown as { lanIsHost: boolean }).lanIsHost) {
      console.log("[startRound] calling kickoffAiRoundDecisions, round:", (this as unknown as { round: number }).round);
        (this as unknown as { kickoffAiRoundDecisions(): void }).kickoffAiRoundDecisions()
    } else {
      console.log(
        "[startRound] SKIPPED kickoffAiRoundDecisions, isLanMode:",
        (this as unknown as { isLanMode: boolean }).isLanMode,
        "lanIsHost:",
        (this as unknown as { lanIsHost: boolean }).lanIsHost
      )
    }
  },

  startRoundTimer() {
    (this as unknown as { stopRoundTimer(): void }).stopRoundTimer();
      (this as unknown as { roundTimerId: number | null }).roundTimerId = window.setInterval(() => {
        if ((this as unknown as { roundResolving: boolean }).roundResolving || (this as unknown as { settled: boolean }).settled) {
          (this as unknown as { stopRoundTimer(): void }).stopRoundTimer()
          return
        }

        if ((this as unknown as { roundPaused: boolean }).roundPaused) {
          return
        }

        (this as unknown as { roundTimeLeft: number }).roundTimeLeft -= 1;
          (this as unknown as { updateHud(): void }).updateHud();
        if ((this as unknown as { roundTimeLeft: number }).roundTimeLeft === 5 && AudioUI) {
          AudioUI.playCountdown()
        }
        if ((this as unknown as { roundTimeLeft: number }).roundTimeLeft <= 0) {
          if ((this as unknown as { isLanMode: boolean }).isLanMode && (this as unknown as { lanBridge: unknown }).lanBridge) {
            (this as unknown as { stopRoundTimer(): void }).stopRoundTimer();
              (this as unknown as { writeLog(msg: string): void }).writeLog("联机模式：回合时间到，等待主机结算")
          } else {
            (this as unknown as { resolveRoundBids(reason: string): void }).resolveRoundBids("timeout")
          }
        }
      }, 1000)
  },

  stopRoundTimer() {
    if ((this as unknown as { roundTimerId: number | null }).roundTimerId) {
      window.clearInterval((this as unknown as { roundTimerId: number | null }).roundTimerId!);
        (this as unknown as { roundTimerId: number | null }).roundTimerId = null
    }
  },

  toggleRoundPause() {
    if ((this as unknown as { isLanMode: boolean }).isLanMode && !(this as unknown as { lanIsHost: boolean }).lanIsHost) return
    if ((this as unknown as { settled: boolean }).settled || (this as unknown as { roundResolving: boolean }).roundResolving) {
      return
    }

    (this as unknown as { roundPaused: boolean }).roundPaused = !(this as unknown as { roundPaused: boolean }).roundPaused
    if ((this as unknown as { roundPaused: boolean }).roundPaused) {
      (this as unknown as { _pauseSnapshotTimeLeft: number | null })._pauseSnapshotTimeLeft = (this as unknown as { roundTimeLeft: number }).roundTimeLeft;
    } else if ((this as unknown as { _pauseSnapshotTimeLeft: number | null })._pauseSnapshotTimeLeft != null) {
      (this as unknown as { roundTimeLeft: number }).roundTimeLeft = (this as unknown as { _pauseSnapshotTimeLeft: number | null })._pauseSnapshotTimeLeft!;
      (this as unknown as { _pauseSnapshotTimeLeft: number | null })._pauseSnapshotTimeLeft = null
    }
    (this as unknown as { syncPauseButton(): void }).syncPauseButton()

    if (MobaoAnimations) {
      const hudEl = document.querySelector(".hud") as HTMLElement | null
      const timerSpan = (this as unknown as { _timerSpan: HTMLElement | null })._timerSpan || null
      if (hudEl) {
        MobaoAnimations.togglePauseVisual(hudEl, (this as unknown as { roundPaused: boolean }).roundPaused, timerSpan)
      }
    }

    (this as unknown as { updateHud(): void }).updateHud()
    if ((this as unknown as { isLanMode: boolean }).isLanMode) {
      if ((this as unknown as { roundPaused: boolean }).roundPaused) {
        (this as unknown as { showLanPauseOverlay(): void }).showLanPauseOverlay()
      } else {
        (this as unknown as { hideLanPauseOverlay(): void }).hideLanPauseOverlay()
      }
      if ((this as unknown as { lanBridge: { togglePause(paused: boolean, timeLeft: number): void } }).lanBridge) {
        (this as unknown as { lanBridge: { togglePause(paused: boolean, timeLeft: number): void } }).lanBridge.togglePause((this as unknown as { roundPaused: boolean }).roundPaused, (this as unknown as { roundTimeLeft: number }).roundTimeLeft)
      }
    }
    (this as unknown as { writeLog(msg: string): void }).writeLog((this as unknown as { roundPaused: boolean }).roundPaused ? "回合已暂停：计时冻结，可查看日志与AI面板。" : "回合已继续：计时恢复。")
  },

  syncPauseButton() {
    if (!(this as unknown as { dom: { pauseRoundBtn: HTMLElement | null } }).dom.pauseRoundBtn) {
      return
    }
    const icon = (this as unknown as { roundPaused: boolean }).roundPaused
      ? '<img src="./assets/images/icons/ui/play-button.svg" alt="" class="btn-icon">'
      : '<img src="./assets/images/icons/ui/pause-button.svg" alt="" class="btn-icon">';
    const text: string = (this as unknown as { roundPaused: boolean }).roundPaused ? "继续回合" : "暂停回合";
    (this as unknown as { dom: { pauseRoundBtn: HTMLElement } }).dom.pauseRoundBtn.innerHTML = `${icon}${text}`;
    (this as unknown as { dom: { pauseRoundBtn: HTMLElement } }).dom.pauseRoundBtn.classList.toggle("is-paused", (this as unknown as { roundPaused: boolean }).roundPaused)
  },

  resetRoundBidDisplay() {
    (this as unknown as { players: Array<{ id: string }> }).players.forEach((player: { id: string }) => {
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
    (this as unknown as { roundBidReadyState: Record<string, boolean> }).roundBidReadyState = {};
    (this as unknown as { players: Array<{ id: string }> }).players.forEach((player: { id: string }) => {
      (this as unknown as { roundBidReadyState: Record<string, boolean> }).roundBidReadyState[player.id] = false;
      (this as unknown as { setPlayerBidReady(id: string, ready: boolean): void }).setPlayerBidReady(player.id, false)
    })
  }
}