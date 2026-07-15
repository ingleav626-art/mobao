/**
 * @file round-manager-fns.ts
 * @module core/round-manager-fns
 * @description RoundManager 纯函数。提取自 RoundManagerMixin（round-manager.ts）的 7 个方法体，
 *              通过 deps: RoundManagerDeps 接口替代 this. 隐式依赖，支持独立单元测试。
 *
 * 7 函数：
 *   - startRoundFn: 初始化回合状态，启动计时器和 AI 决策
 *   - startRoundTimerFn: 启动 1 秒倒计时，处理超时结算
 *   - stopRoundTimerFn: 停止计时器
 *   - toggleRoundPauseFn: 切换暂停/恢复
 *   - syncPauseButtonFn: 同步暂停按钮 UI
 *   - resetRoundBidDisplayFn: 重置出价显示
 *   - resetRoundBidReadyStateFn: 重置出价就绪状态
 */
import { GAME_SETTINGS } from "./settings"

/**
 * LAN 桥接接口（最小声明，用于 togglePause 调用）
 */
export interface LanBridge {
  togglePause: (paused: boolean, timeLeft: number) => void
}

/**
 * RoundManager 依赖接口。
 * 替代原 Mixin 中 this.xxx 的隐式场景属性访问，所有依赖通过构造函数注入。
 *
 * 分类：
 *   - 可变状态属性（直接读写）：roundResolving, roundPaused, actionsLeft 等
 *   - 只读 getter：getRound, getIsLanMode, getLanIsHost, getSettled, getLanBridge, getTimerSpan
 *   - 外部回调：clearCurrentRoundUsage, resetAiRoundResources, closeBidKeypad 等
 */
export interface RoundManagerDeps {
  /** 结算进行中标志 */
  roundResolving: boolean
  /** 回合暂停标志 */
  roundPaused: boolean
  /** 剩余行动次数 */
  actionsLeft: number
  /** 回合剩余秒数 */
  roundTimeLeft: number
  /** 玩家是否已提交出价 */
  playerBidSubmitted: boolean
  /** 玩家本轮回合出价 */
  playerRoundBid: number
  /** 私有情报条目列表（清空用 .length = 0） */
  privateIntelEntries: Array<unknown>
  /** 公共信息条目列表（清空用 .length = 0） */
  publicInfoEntries: Array<unknown>
  /** AI LLM 回合计划映射 */
  aiLlmRoundPlans: Record<string, unknown>
  /** AI 回合决策 Promise */
  aiRoundDecisionPromise: Promise<void> | null
  /** 回合计时器 ID */
  roundTimerId: number | null
  /** 暂停时快照的剩余时间（_pauseSnapshotTimeLeft） */
  _pauseSnapshotTimeLeft: number | null
  /** 各玩家出价就绪状态 */
  roundBidReadyState: Record<string, boolean>
  /** 玩家列表 */
  players: Array<{ id: string }>
  /** DOM 引用 */
  dom: {
    bidInput: HTMLInputElement | null
    pauseRoundBtn: HTMLElement | null
  }

  /** 当前回合数 */
  getRound: () => number
  /** 是否联机模式 */
  getIsLanMode: () => boolean
  /** 是否联机主机 */
  getLanIsHost: () => boolean
  /** 游戏是否已结算 */
  getSettled: () => boolean
  /** 获取 LAN 桥接实例 */
  getLanBridge: () => LanBridge | null
  /** 获取计时器 span 元素 */
  getTimerSpan: () => HTMLElement | null

  /** 清空当前回合使用记录 */
  clearCurrentRoundUsage: () => void
  /** 重置 AI 回合资源（技能/道具次数） */
  resetAiRoundResources: () => void
  /** 关闭出价键盘 */
  closeBidKeypad: () => void
  /** 启动 AI 回合决策 */
  kickoffAiRoundDecisions: () => void
  /** 更新 HUD */
  updateHud: () => void
  /** 写入操作日志 */
  writeLog: (msg: string) => void
  /** 结算回合出价 */
  resolveRoundBids: (reason: string) => void
  /** 显示联机暂停遮罩 */
  showLanPauseOverlay: () => void
  /** 隐藏联机暂停遮罩 */
  hideLanPauseOverlay: () => void
  /** 设置玩家出价就绪状态 */
  setPlayerBidReady: (slotId: string, ready: boolean) => void
}

/**
 * 初始化回合状态，启动计时器和 AI 决策。
 * 对应原 Mixin 的 startRound 方法。
 */
export function startRoundFn(deps: RoundManagerDeps): void {
  deps.roundResolving = false
  deps.roundPaused = false
  deps.actionsLeft = GAME_SETTINGS.actionsPerRound
  deps.roundTimeLeft = GAME_SETTINGS.roundSeconds
  deps.playerBidSubmitted = false
  deps.playerRoundBid = 0
  deps.privateIntelEntries.length = 0
  deps.publicInfoEntries.length = 0
  deps.clearCurrentRoundUsage()
  deps.resetAiRoundResources()
  deps.aiLlmRoundPlans = {}
  deps.aiRoundDecisionPromise = null
  resetRoundBidDisplayFn(deps)
  resetRoundBidReadyStateFn(deps)
  deps.closeBidKeypad()
  if (deps.dom.bidInput) {
    deps.dom.bidInput.value = deps.getRound() <= 1 ? "" : "0"
    deps.dom.bidInput.placeholder = deps.getRound() <= 1 ? "点击出价" : ""
  }
  syncPauseButtonFn(deps)
  startRoundTimerFn(deps)
  if (!deps.getIsLanMode() || deps.getLanIsHost()) {
    deps.kickoffAiRoundDecisions()
  }
}

/**
 * 启动 1 秒倒计时，处理超时结算。
 * 对应原 Mixin 的 startRoundTimer 方法。
 */
export function startRoundTimerFn(deps: RoundManagerDeps): void {
  stopRoundTimerFn(deps)
  deps.roundTimerId = window.setInterval(() => {
    if (deps.roundResolving || deps.getSettled()) {
      stopRoundTimerFn(deps)
      return
    }
    if (deps.roundPaused) return
    deps.roundTimeLeft -= 1
    deps.updateHud()
    if (deps.roundTimeLeft <= 0) {
      if (deps.getIsLanMode() && deps.getLanBridge()) {
        stopRoundTimerFn(deps)
        deps.writeLog("联机模式：回合时间到，等待主机结算")
      } else {
        deps.resolveRoundBids("timeout")
      }
    }
  }, 1000)
}

/**
 * 停止计时器。
 * 对应原 Mixin 的 stopRoundTimer 方法。
 */
export function stopRoundTimerFn(deps: RoundManagerDeps): void {
  if (deps.roundTimerId) {
    window.clearInterval(deps.roundTimerId)
    deps.roundTimerId = null
  }
}

/**
 * 切换暂停/恢复。
 * 对应原 Mixin 的 toggleRoundPause 方法。
 */
export function toggleRoundPauseFn(deps: RoundManagerDeps): void {
  if (deps.getIsLanMode() && !deps.getLanIsHost()) return
  if (deps.getSettled() || deps.roundResolving) return
  deps.roundPaused = !deps.roundPaused
  if (deps.roundPaused) {
    deps._pauseSnapshotTimeLeft = deps.roundTimeLeft
  } else if (deps._pauseSnapshotTimeLeft != null) {
    deps.roundTimeLeft = deps._pauseSnapshotTimeLeft
    deps._pauseSnapshotTimeLeft = null
  }
  syncPauseButtonFn(deps)
  deps.updateHud()
  if (deps.getIsLanMode()) {
    if (deps.roundPaused) {
      deps.showLanPauseOverlay()
    } else {
      deps.hideLanPauseOverlay()
    }
    const lb = deps.getLanBridge()
    if (lb) lb.togglePause(deps.roundPaused, deps.roundTimeLeft)
  }
  deps.writeLog(deps.roundPaused ? "回合已暂停：计时冻结，可查看日志与AI面板。" : "回合已继续：计时恢复。")
}

/**
 * 同步暂停按钮 UI。
 * 对应原 Mixin 的 syncPauseButton 方法。
 */
export function syncPauseButtonFn(deps: RoundManagerDeps): void {
  if (!deps.dom.pauseRoundBtn) return
  const icon = deps.roundPaused
    ? '<img src="./assets/images/icons/ui/play-button.svg" alt="" class="btn-icon">'
    : '<img src="./assets/images/icons/ui/pause-button.svg" alt="" class="btn-icon">'
  const text = deps.roundPaused ? "继续回合" : "暂停回合"
  deps.dom.pauseRoundBtn.innerHTML = `${icon}${text}`
  deps.dom.pauseRoundBtn.classList.toggle("is-paused", deps.roundPaused)
}

/**
 * 重置出价显示。
 * 对应原 Mixin 的 resetRoundBidDisplay 方法。
 */
export function resetRoundBidDisplayFn(deps: RoundManagerDeps): void {
  deps.players.forEach((player: { id: string }) => {
    const bidEl = document.getElementById(`bid-${player.id}`)
    const cardEl = document.getElementById(`playerCard-${player.id}`)
    if (bidEl) bidEl.textContent = "待公布"
    if (cardEl) cardEl.classList.remove("revealed", "winner", "runner", "bid-pop", "bid-ready")
  })
}

/**
 * 重置出价就绪状态。
 * 对应原 Mixin 的 resetRoundBidReadyState 方法。
 */
export function resetRoundBidReadyStateFn(deps: RoundManagerDeps): void {
  deps.roundBidReadyState = {}
  deps.players.forEach((player: { id: string }) => {
    deps.roundBidReadyState[player.id] = false
    deps.setPlayerBidReady(player.id, false)
  })
}
