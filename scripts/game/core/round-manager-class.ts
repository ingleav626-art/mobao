/**
 * @file round-manager-class.ts
 * @module core/round-manager-class
 * @description RoundManager -- 回合管理器（Phase 2 依赖注入）。
 *              包装 round-manager-fns.ts 的 7 个纯函数，通过构造函数注入依赖
 *              （roundResolving/roundPaused/actionsLeft/roundTimeLeft 等状态与回调），
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测（构造函数注入 mock 依赖），过渡期 Mixin 保留为薄代理层。
 */
import {
  startRoundFn,
  startRoundTimerFn,
  stopRoundTimerFn,
  toggleRoundPauseFn,
  syncPauseButtonFn,
  resetRoundBidDisplayFn,
  resetRoundBidReadyStateFn,
  type RoundManagerDeps
} from "./round-manager-fns"

export type { RoundManagerDeps } from "./round-manager-fns"

/**
 * 回合管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * 7 个方法均一行委托给 round-manager-fns.ts 的纯函数。
 */
export class RoundManager {
  constructor(private readonly deps: RoundManagerDeps) {}

  /** 初始化回合状态，启动计时器和 AI 决策 */
  startRound(): void {
    return startRoundFn(this.deps)
  }

  /** 启动 1 秒倒计时，处理超时结算 */
  startRoundTimer(): void {
    return startRoundTimerFn(this.deps)
  }

  /** 停止计时器 */
  stopRoundTimer(): void {
    return stopRoundTimerFn(this.deps)
  }

  /** 切换暂停/恢复 */
  toggleRoundPause(): void {
    return toggleRoundPauseFn(this.deps)
  }

  /** 同步暂停按钮 UI */
  syncPauseButton(): void {
    return syncPauseButtonFn(this.deps)
  }

  /** 重置出价显示 */
  resetRoundBidDisplay(): void {
    return resetRoundBidDisplayFn(this.deps)
  }

  /** 重置出价就绪状态 */
  resetRoundBidReadyState(): void {
    return resetRoundBidReadyStateFn(this.deps)
  }
}
