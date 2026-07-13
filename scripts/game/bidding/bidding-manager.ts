/**
 * @file bidding-manager.ts
 * @module bidding/bidding-manager
 * @description BiddingManager -- 出价流程薄协调器。
 *              构造函数注入依赖，方法体委托到子模块函数文件。
 *              可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { Player, Artifact } from "../../../types/game"
import type { IntelSummary } from "../../../types/ai"

import { resolveRoundBids, buildRoundBids, revealRoundBidsSequential, setPlayerBidDisplay, settleCurrentRun, kickoffAiRoundDecisions, waitUntilResumed } from "./bidding-manager/flow-fns"
import { setPlayerBidReady, areAllPlayersBidReady, openBidKeypad, closeBidKeypad, syncBidKeypadScreen, updateKeypadDirectHint, handleBidKeyInput, playerBid } from "./bidding-manager/keypad-fns"

/** AI 出价引擎最小接口（仅约束 buildAIBids 方法） */
export interface BiddingAiEngine {
  buildAIBids(context: Record<string, unknown>): Record<string, number>
}

/** LAN 桥接最小接口 */
export interface BiddingLanBridge {
  submitBid(bid: number): void
}

/** 技能管理器最小接口 */
export interface BiddingSkillManager {
  onNewRound(): void
}

/** BiddingManager 依赖接口 */
export interface BiddingManagerDeps {
  /** DOM 元素映射（引用） */
  dom: Record<string, HTMLElement | null>
  /** 玩家列表（引用） */
  players: Player[]
  /** Phaser 输入插件（引用） */
  input: { enabled: boolean } | null
  /** 技能管理器（引用） */
  skillManager: BiddingSkillManager

  // --- 动态值 getter ---
  getIsLanMode: () => boolean
  getSettled: () => boolean
  getRoundPaused: () => boolean
  getPlayerMoney: () => number
  getLanMySlotId: () => string | null
  getLanIsHost: () => boolean
  getLanHostBids: () => Record<string, number>
  getPlayerRoundHistory: () => Record<string, Array<{ round: number; bid: number }>>
  getItems: () => Artifact[]
  getAiEngine: () => BiddingAiEngine | null
  getAiLlmRoundPlans: () => Record<string, { failed?: boolean; hasBidDecision?: boolean; bid?: number } | null>
  getAiRoundEffects: () => Record<string, unknown>
  getLanBridge: () => BiddingLanBridge | null
  getLastAiDecisionTelemetry: () => { mode: string; round: number; entries?: Array<Record<string, unknown>> } | null

  // --- 跨方法回调（Manager 方法委托） ---
  resolveRoundBids: (reason?: string, forceSettle?: boolean) => Promise<void>

  // --- 回调方法 ---
  closeItemDrawer: () => void
  hideInfoPopup: () => void
  showGameConfirm: (msg: string, onOk: () => void, onCancel?: () => void) => void
  updateHud: () => void
  writeLog: (msg: string) => void
  stopRoundTimer: () => void
  captureAiDecisionTelemetry: (bids: unknown[]) => void
  recordAiThoughtLogs: (telemetry: unknown) => void
  renderAiLogicPanel: () => void
  recordRoundHistory: (roundBids: Array<{ playerId: string; bid: number }>) => void
  markRoundRanking: (sorted: Array<{ playerId: string; bid: number }>) => void
  finishAuction: (winner: { playerId: string; bid: number }, mode: string) => void
  startRound: () => void
  processAiDecisions: () => Promise<void>
  hasAnyInfo: (item: Artifact) => boolean
  buildAiIntelSnapshot: () => Record<string, IntelSummary>
  canUseLlmDecisionForPlayer: (playerId: string) => boolean
  getAiWallet: (id: string) => number
  normalizeAiBidValue: (playerId: string, bid: number, wallet?: number | null) => number
}

/** BiddingManager 私有状态（由 Manager 内部持有，供函数文件读写） */
export interface BiddingManagerState {
  roundBidReadyState: Record<string, boolean>
  keypadValue: string
  playerBidSubmitted: boolean
  playerRoundBid: number
  roundResolving: boolean
  secondHighestBid: number
  currentBid: number
  bidLeader: string | null
  round: number
  lastAiDecisionTelemetry: { mode: string; round: number; entries?: Array<Record<string, unknown>> } | null
}

/** 出价流程管理器（薄协调器） */
export class BiddingManager {
  private state: BiddingManagerState = {
    roundBidReadyState: {},
    keypadValue: "0",
    playerBidSubmitted: false,
    playerRoundBid: 0,
    roundResolving: false,
    secondHighestBid: 0,
    currentBid: 0,
    bidLeader: null,
    round: 1,
    lastAiDecisionTelemetry: null
  }

  constructor(private readonly deps: BiddingManagerDeps) {}

  // ==================== 出价键盘方法 ====================

  setPlayerBidReady(playerId: string, ready: boolean): void {
    setPlayerBidReady(this.deps, this.state, playerId, ready)
  }

  areAllPlayersBidReady(): boolean {
    return areAllPlayersBidReady(this.deps, this.state)
  }

  openBidKeypad(): void {
    openBidKeypad(this.deps, this.state)
  }

  closeBidKeypad(): void {
    closeBidKeypad(this.deps)
  }

  syncBidKeypadScreen(): void {
    syncBidKeypadScreen(this.deps, this.state)
  }

  updateKeypadDirectHint(): void {
    updateKeypadDirectHint(this.deps, this.state)
  }

  handleBidKeyInput(key: string): void {
    handleBidKeyInput(this.deps, this.state, key)
  }

  playerBid(): void {
    playerBid(this.deps, this.state)
  }

  // ==================== 出价流程方法 ====================

  async kickoffAiRoundDecisions(): Promise<void> {
    await kickoffAiRoundDecisions(this.deps, this.state)
  }

  waitUntilResumed(): Promise<void> {
    return waitUntilResumed(this.deps, this.state)
  }

  async resolveRoundBids(reason: string = "manual", forceSettle: boolean = false): Promise<void> {
    await resolveRoundBids(this.deps, this.state, reason, forceSettle)
  }

  buildRoundBids(): Array<{ playerId: string; bid: number }> {
    return buildRoundBids(this.deps, this.state)
  }

  async revealRoundBidsSequential(roundBids: Array<{ playerId: string; bid: number }>): Promise<void> {
    await revealRoundBidsSequential(this.deps, this.state, roundBids)
  }

  setPlayerBidDisplay(playerId: string, bid: number, order: number): void {
    setPlayerBidDisplay(this.deps, playerId, bid, order)
  }

  settleCurrentRun(): void {
    settleCurrentRun(this.deps, this.state)
  }
}