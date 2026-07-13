import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import type { LanBridgeLike } from './lan-index-manager'

/**
 * @file lan/index.ts
 * @module game/lan
 * @description 联机大厅 Mixin（薄代理层）。
 *              所有方法委托给 this.lanIndexManager（LanIndexManager 实例）。
 *              原 6 个子 Mixin（game-flow/sync/settle/reconnect/live2d/events）的方法
 *              全部通过 LanIndexManager 代理。
 */

export const LanIndexMixin: ThisType<WarehouseSceneThis> = {
  // ═════════════ 大厅方法 ═════════════

  initLanLobby() {
    return this.lanIndexManager.initLanLobby()
  },

  // ═════════════ 游戏流程方法 ═════════════

  lanResolveRound(reason: string) {
    return this.lanIndexManager.lanResolveRound(reason)
  },

  lanComputeAiBids(): Record<string, number> {
    return this.lanIndexManager.lanComputeAiBids()
  },

  lanOnRoundStart(msg: { round: number; currentBid?: number; ts?: number; roundSeconds?: number }) {
    return this.lanIndexManager.lanOnRoundStart(msg)
  },

  lanBroadcastRoundStart() {
    return this.lanIndexManager.lanBroadcastRoundStart()
  },

  startLanRun() {
    return this.lanIndexManager.startLanRun()
  },

  async lanOnAllBidsIn(_msg: Record<string, unknown>) {
    return this.lanIndexManager.lanOnAllBidsIn(_msg)
  },

  async lanOnRoundTimeout() {
    return this.lanIndexManager.lanOnRoundTimeout()
  },

  lanOnRoundResult(msg: { bids?: Array<{ playerId: string; bid: number }> }) {
    return this.lanIndexManager.lanOnRoundResult(msg)
  },

  lanDoFinishAuction(winner: { playerId: string; bid: number }, mode: string) {
    return this.lanIndexManager.lanDoFinishAuction(winner, mode)
  },

  // ═════════════ 同步方法 ═════════════

  lanBuildFullSyncData(targetPlayerId: string) {
    return this.lanIndexManager.lanBuildFullSyncData(targetPlayerId)
  },

  lanOnFullSync(msg: Record<string, unknown>) {
    return this.lanIndexManager.lanOnFullSync(msg)
  },

  lanRestoreWarehouseFromSync(msg: Record<string, unknown>) {
    return this.lanIndexManager.lanRestoreWarehouseFromSync(msg)
  },

  lanAttemptReconnect() {
    return this.lanIndexManager.lanAttemptReconnect()
  },

  toggleLanPause(pause: boolean) {
    return this.lanIndexManager.toggleLanPause(pause)
  },

  onLanBackground() {
    return this.lanIndexManager.onLanBackground()
  },

  onLanForeground() {
    return this.lanIndexManager.onLanForeground()
  },

  // ═════════════ 结算方法 ═════════════

  lanOnSettleFinal(msg: { wallets: Record<string, number> }) {
    return this.lanIndexManager.lanOnSettleFinal(msg)
  },

  lanOnSettle(msg: { winnerId: string; winnerBid: number; mode: string }) {
    return this.lanIndexManager.lanOnSettle(msg)
  },

  lanOnRestartGo(msg: {
    players: Array<{ id: string; name: string; isAI: boolean; isHost: boolean; isReady?: boolean; characterId?: string | null; carryItems?: string[]; llm?: boolean }>
    hostId: string
    aiPlayers: Array<{ id: string; name: string; isAI: boolean; isHost: boolean; llm?: boolean }>
    aiLlmEnabled: boolean
  }) {
    return this.lanIndexManager.lanOnRestartGo(msg)
  },

  // ═════════════ 重连方法 ═════════════

  tryAutoReconnect(playerId: string, roomCode: string, playerName: string, isHost: boolean) {
    return this.lanIndexManager.tryAutoReconnect(playerId, roomCode, playerName, isHost)
  },

  // ═════════════ Live2D 方法 ═════════════

  startLanLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement) {
    return this.lanIndexManager.startLanLive2dLoop(src, videoA, videoB)
  },

  stopLanLive2dLoop() {
    return this.lanIndexManager.stopLanLive2dLoop()
  },

  // ═════════════ 事件绑定方法 ═════════════

  bindLanEvents(bridge: LanBridgeLike, ctx: Record<string, unknown>) {
    return this.lanIndexManager.bindLanEvents(bridge, ctx)
  }
}