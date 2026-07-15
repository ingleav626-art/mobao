/**
 * @file lan/lan-index-manager.ts
 * @module lan/lan-index-manager
 * @description LanIndexManager -- 薄协调器，方法体委托给 lan-index-manager/ 下
 *              7 个函数模块。替代原 LanIndexMixin（546 个 this. 引用，7 子 Mixin）。
 *              依赖注入、状态容器、类型定义保留在此。
 */
import type { Player, Artifact } from "../../../types/game"
import type { LanPlayer } from "../../../types/lan"
import type { IntelSummary } from "../../../types/ai"

import { initLanLobby } from "./lan-index-manager/lobby-fns"
import {
  lanResolveRound,
  lanComputeAiBids,
  lanOnRoundStart,
  lanBroadcastRoundStart,
  startLanRun,
  lanOnAllBidsIn,
  lanOnRoundTimeout,
  lanOnRoundResult,
  lanDoFinishAuction
} from "./lan-index-manager/game-flow-fns"
import {
  lanBuildFullSyncData,
  lanOnFullSync,
  lanRestoreWarehouseFromSync,
  lanAttemptReconnect,
  toggleLanPause,
  onLanBackground,
  onLanForeground
} from "./lan-index-manager/sync-fns"
import { lanOnSettleFinal, lanOnSettle, lanOnRestartGo } from "./lan-index-manager/settle-fns"
import { tryAutoReconnect } from "./lan-index-manager/reconnect-fns"
import { startLanLive2dLoop, stopLanLive2dLoop } from "./lan-index-manager/live2d-fns"
import { bindLanEvents } from "./lan-index-manager/events-fns"

// ─── LanBridge 子集接口 ───

/** LanBridge 实例方法子集（联机系统所需） */
export interface LanBridgeLike {
  ws: { url: string; readyState: number } | null
  connected: boolean
  playerId: string | null
  playerName: string | null
  roomCode: string | null
  isHost: boolean
  players: unknown[]
  on(event: string, handler: (data: unknown) => void): void
  connect(url: string, playerName: string): Promise<void>
  disconnect(): void
  send(msg: unknown): boolean
  createRoom(options: unknown): void
  joinRoom(code: string, password?: string): void
  reconnect(url: string, roomCode: string, playerId: string): Promise<unknown>
  requestFullSync(): void
  sendFullSync(targetPlayerId: string, syncData: unknown): void
  leaveRoom(): void
  startGame(options: unknown): void
  broadcastRoundStart(round: number, maxRounds: number, currentBid: number, roundSeconds: number): void
  submitBid(bid: number): void
  broadcastRoundResult(round: number, bids: unknown[], reason?: string): void
  broadcastSettle(data: unknown): void
  broadcastSettleFinal(wallets: unknown, profitDetails: unknown): void
  togglePause(paused: boolean, roundTimeLeft?: number): void
}

// ─── 可变状态容器 ───

/** 联机系统可变状态（原场景属性，Manager 可读写） */
export interface LanIndexState {
  // 联机模式标志
  isLanMode: boolean
  lanIsHost: boolean
  lanPlayers: LanPlayer[]
  lanAiPlayers: Array<{
    id: string
    name: string
    isAI: boolean
    isHost: boolean
    isReady?: boolean
    characterId?: string | null
    carryItems?: string[]
    llm?: boolean
  }>
  lanHostWallets: Record<string, number>
  lanHostBids: Record<string, number>
  lanAiLlmEnabled: boolean
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanMySlotId: string | null
  lanReconnecting: boolean
  lanReconnectAttempts: number
  lanMaxReconnectAttempts: number
  lanLastServerUrl: string | null
  lanLastRoomCode: string | null
  lanLastPlayerId: string | null
  lanStatusEl: HTMLElement | null
  _pauseSnapshotTimeLeft: number | null

  // 游戏状态
  round: number
  roundResolving: boolean
  settled: boolean
  roundPaused: boolean
  roundTimeLeft: number
  currentBid: number
  bidLeader: string | null
  secondHighestBid: number
  playerBidSubmitted: boolean
  playerRoundBid: number
  playerMoney: number
  actionsLeft: number
  selectedItem: unknown
  warehouseTrueValue: number
  aiMaxBid: number
  moneySettledRunToken: unknown
  settlementRevealRunning: boolean
  aiRoundDecisionPromise: Promise<void> | null
  currentPublicEvent: { category: string; text: string } | null
  privateIntelEntries: unknown[]
  publicInfoEntries: Array<{ source: string; text: string }>
  battleRecordReplayActive: boolean
  battleRecordReplayRecordId: string | null
  _mapQualityWeights: Record<string, number> | null
  _mapCategoryWeights: Record<string, number> | null

  // 玩家相关
  players: Player[]
  items: Artifact[]
  aiLlmPlayerEnabled: Record<string, boolean>
  aiWallets: Record<string, number>
  aiRoundEffects: Record<string, unknown>
  aiLlmRoundPlans: Record<string, unknown>
  lastAiDecisionTelemetry: unknown
  playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>
  playerHistoryPanels: Record<string, HTMLElement | null>
  revealedCells: boolean[][]

  // 仓库
  itemLayer: { destroy(destroyChildren: boolean): void } | null
  gridLayer: { destroy(destroyChildren: boolean): void } | null
  revealCellLayer: { destroy(destroyChildren: boolean): void } | null
  warehouseCellIndex: Record<string, string>
}

// ─── 依赖接口 ───

/** LanIndexManager 依赖接口 */
export interface LanIndexManagerDeps {
  /** 可变状态容器 */
  state: LanIndexState

  /** LAN 桥接实例 */
  getLanBridge: () => LanBridgeLike | null
  /** 创建新 LanBridge 实例 */
  createLanBridge: () => LanBridgeLike

  // ─── 场景方法回调 ───
  writeLog: (text: string) => void
  setOnlineStatus: (text: string, cls: string) => void
  showGameConfirm: (msg: string, onConfirm: () => void) => void
  stopRoundTimer: () => void
  startRound: () => void
  updateHud: () => void
  beginRunTracking: () => void
  cancelSettlementReveal: () => void
  exitSettlementPage: () => void
  guardWarehouseCapacity: () => void
  resetPlayerHistoryState: () => void
  hidePreview: () => void
  closeBidKeypad: () => void
  closeItemDrawer: () => void
  hideSettleOverlay: () => void
  hideRevealScrollHints: () => void
  drawUnknownWarehouse: () => void
  spawnRandomItems: () => void
  setupWarehouseAuction: () => void
  rebuildWarehouseCellIndex: () => void
  buildWarehouseSnapshotForSync: () => unknown
  initPlayersUI: () => void
  applyCharacterToPlayer: () => void
  initAiWallets: () => void
  initAiIntelSystems: () => void
  makeRunToken: () => unknown
  syncItemManagerFromShop: () => void
  revealRoundBidsSequential: (bids: Array<{ playerId: string; bid: number }>) => Promise<void>
  recordRoundHistory: (bids: Array<{ playerId: string; bid: number }>) => void
  finishAuction: (winner: { playerId: string; bid: number }, mode: string) => void
  captureAiDecisionTelemetry: (slotBids: Array<{ playerId: string; bid: number }>) => void
  recordAiThoughtLogs: (telemetry: unknown) => void
  renderAiLogicPanel: () => void
  waitUntilResumed: () => Promise<void>
  setPlayerBidReady: (playerId: string, ready: boolean) => void
  syncPauseButton: () => void
  showLanPauseOverlay: () => void
  hideLanPauseOverlay: () => void
  enterLanRoom: () => void
  exitLanRoom: () => void
  exitLobby: () => void
  showLanRestartVoteDialog: (hostName: string) => void
  removeLanRestartDialog: () => void
  showLanRestartDeclinedDialog: (decliner: string) => void
  refreshRevealScrollHints: () => void
  refreshPlayerHistoryUI: () => void
  renderPublicInfoPanel: () => void
  addPublicInfoEntry: (entry: { source: string; text: string }) => void
  recordPlayerUsage: (playerId: string, actionId: string) => void
  isAiLlmEnabledForPlayer: (playerId: string) => boolean
  canUseLlmDecisionForPlayer: (playerId: string) => boolean
  normalizeAiBidValue: (playerId: string, bid: number, wallet: number) => number
  updateLobbyMoneyDisplay: () => void
  getLastRoundBidMap: () => Record<string, number>
  buildAiIntelSnapshot: () => Record<string, IntelSummary>
  hasAnyInfo: (item: Artifact) => boolean

  // AI Engine
  aiEngine: {
    buildAIBids: (args: {
      aiPlayers: unknown[]
      clueRate: number
      round: number
      maxRounds: number
      currentBid: number
      lastRoundBids: Record<string, number>
      bidStep: number
      aiIntelMap: Record<string, IntelSummary>
      aiToolEffectMap: Record<string, unknown>
      itemCount: number
    }) => Record<string, number>
    resetForNewRun: (args: { startingBid: number; itemCount: number }) => void
  }

  // 技能管理器
  skillManager: {
    onNewRound: () => void
    resetForNewRun: () => void
  }

  // 地图配置
  getProfile:
    | ((
        profileId: string
      ) => {
        name: string
        params: {
          maxRounds: number
          directTakeRatio: number
          qualityWeights?: Record<string, number>
          categoryWeights?: Record<string, number>
        }
      } | null)
    | null
  getSelectedProfileId: (() => string) | null
}

// ─── Manager 类 ───

/**
 * 联机大厅管理器（薄协调器）。
 *
 * 每个方法一行委托给对应独立函数文件中的导出函数。
 * 依赖通过构造函数注入，Manager 内部不访问场景 this 属性，可独立单测。
 */
export class LanIndexManager {
  private readonly state: LanIndexState

  constructor(private readonly deps: LanIndexManagerDeps) {
    this.state = deps.state
  }

  // ═════════════ 大厅方法（lobby-fns.ts） ═════════════

  initLanLobby(): void {
    return initLanLobby(this.deps, this.state, {
      tryAutoReconnect: (pid, rc, pn, ih) => this.tryAutoReconnect(pid, rc, pn, ih),
      bindLanEvents: (bridge, ctx) => this.bindLanEvents(bridge, ctx),
      startLanLive2dLoop: (src, va, vb) => this.startLanLive2dLoop(src, va, vb),
      stopLanLive2dLoop: () => this.stopLanLive2dLoop()
    })
  }

  // ═════════════ 游戏流程方法（game-flow-fns.ts） ═════════════

  lanResolveRound(reason: string): void {
    return lanResolveRound(this.deps, this.state, reason)
  }

  lanComputeAiBids(): Record<string, number> {
    return lanComputeAiBids(this.deps, this.state)
  }

  lanOnRoundStart(msg: { round: number; currentBid?: number; ts?: number; roundSeconds?: number }): void {
    return lanOnRoundStart(this.deps, this.state, msg)
  }

  lanBroadcastRoundStart(): void {
    return lanBroadcastRoundStart(this.deps, this.state)
  }

  startLanRun(): void {
    return startLanRun(this.deps, this.state)
  }

  lanOnAllBidsIn(_msg: Record<string, unknown>): Promise<void> {
    return lanOnAllBidsIn(this.deps, this.state)
  }

  lanOnRoundTimeout(): Promise<void> {
    return lanOnRoundTimeout(this.deps, this.state)
  }

  lanOnRoundResult(msg: { bids?: Array<{ playerId: string; bid: number }> }): void {
    return lanOnRoundResult(this.deps, this.state, msg)
  }

  lanDoFinishAuction(winner: { playerId: string; bid: number }, mode: string): void {
    return lanDoFinishAuction(this.deps, this.state, winner, mode)
  }

  // ═════════════ 同步方法（sync-fns.ts） ═════════════

  lanBuildFullSyncData(targetPlayerId: string): Record<string, unknown> {
    return lanBuildFullSyncData(this.deps, this.state, targetPlayerId)
  }

  lanOnFullSync(msg: Record<string, unknown>): void {
    return lanOnFullSync(this.deps, this.state, msg)
  }

  lanRestoreWarehouseFromSync(msg: Record<string, unknown>): void {
    return lanRestoreWarehouseFromSync(this.deps, this.state, msg)
  }

  lanAttemptReconnect(): void {
    return lanAttemptReconnect(this.deps, this.state)
  }

  toggleLanPause(pause: boolean): void {
    return toggleLanPause(this.deps, this.state, pause)
  }

  onLanBackground(): void {
    return onLanBackground(this.deps, this.state)
  }

  onLanForeground(): void {
    return onLanForeground(this.deps, this.state)
  }

  // ═════════════ 结算方法（settle-fns.ts） ═════════════

  lanOnSettleFinal(msg: { wallets: Record<string, number> }): void {
    return lanOnSettleFinal(this.deps, this.state, msg)
  }

  lanOnSettle(msg: { winnerId: string; winnerBid: number; mode: string }): void {
    return lanOnSettle(this.deps, this.state, msg)
  }

  lanOnRestartGo(msg: {
    players: Array<{
      id: string
      name: string
      isAI: boolean
      isHost: boolean
      isReady?: boolean
      characterId?: string | null
      carryItems?: string[]
      llm?: boolean
    }>
    hostId: string
    aiPlayers: Array<{ id: string; name: string; isAI: boolean; isHost: boolean; llm?: boolean }>
    aiLlmEnabled: boolean
  }): void {
    return lanOnRestartGo(this.deps, this.state, msg)
  }

  // ═════════════ 重连方法（reconnect-fns.ts） ═════════════

  tryAutoReconnect(playerId: string, roomCode: string, playerName: string, isHost: boolean): void {
    return tryAutoReconnect(this.deps, this.state, playerId, roomCode, isHost)
  }

  // ═════════════ Live2D 方法（live2d-fns.ts） ═════════════

  startLanLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement): void {
    return startLanLive2dLoop(src, videoA, videoB)
  }

  stopLanLive2dLoop(): void {
    return stopLanLive2dLoop()
  }

  // ═════════════ 事件绑定方法（events-fns.ts） ═════════════

  bindLanEvents(bridge: LanBridgeLike, ctx: Record<string, unknown>): void {
    return bindLanEvents(this.deps, this.state, bridge, ctx)
  }
}
