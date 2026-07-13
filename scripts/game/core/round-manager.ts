import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file round-manager.ts
 * @module core/round-manager
 * @description 回合生命周期管理 Mixin（薄代理层）。
 *              所有方法委托给 this.roundManager（RoundManager 实例）。
 */

export const RoundManagerMixin: Record<string, Function> = {
  startRound(this: WarehouseSceneThis) {
    return this.roundManager.startRound()
  },

  startRoundTimer(this: WarehouseSceneThis) {
    return this.roundManager.startRoundTimer()
  },

  stopRoundTimer(this: WarehouseSceneThis) {
    return this.roundManager.stopRoundTimer()
  },

  toggleRoundPause(this: WarehouseSceneThis) {
    return this.roundManager.toggleRoundPause()
  },

  syncPauseButton(this: WarehouseSceneThis) {
    return this.roundManager.syncPauseButton()
  },

  resetRoundBidDisplay(this: WarehouseSceneThis) {
    return this.roundManager.resetRoundBidDisplay()
  },

  resetRoundBidReadyState(this: WarehouseSceneThis) {
    return this.roundManager.resetRoundBidReadyState()
  }
}