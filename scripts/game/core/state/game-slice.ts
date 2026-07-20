import type { Artifact, Player } from "../../../../types/game"
import type { BonusEffect } from "../bonus"

export interface GameSlice {
  round: number
  actionsLeft: number
  roundTimeLeft: number
  playerMoney: number
  selectedItem: Artifact | null
  currentBid: number
  bidLeader: string
  secondHighestBid: number
  aiMaxBid: number
  aiWallets: Record<string, number>
  warehouseTrueValue: number
  warehouseCellIndex: Record<string, Artifact | null>
  settled: boolean
  previewOpenTick: number
  roundTimerId: ReturnType<typeof setInterval> | null
  roundPaused: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  playerRoundBid: number
  isSettlementRevealMode: boolean
  settlementRevealRunning: boolean
  settlementRevealSkipRequested: boolean
  settlementSession: { runToken: number | string; phase: string } | null
  settlementRunToken: number | string
  moneySettledRunToken: string | null
  _edgeFlashActive: boolean
  _lastDisplayedMoney: number | null
  players: Player[]
  playerRoundHistory: Record<string, unknown>
  playerUsageHistory: Record<string, unknown>
  currentRoundUsage: Record<string, unknown>
  playerHistoryPanels: Record<string, unknown>
  roundBidReadyState: Record<string, unknown>
  aiRoundDecisionPromise: Promise<unknown> | null
  currentPublicEvent: { id: string; text: string; category: string; priority?: number } | null
  keypadValue: string
  _activeSkillId: string | null
  _gameConfirmCallback: (() => void) | null
  _gameCancelCallback: (() => void) | null
  runSerial: number
  runLogHistory: unknown[]
  bonusEffects: BonusEffect[]
  currentRunLog: {
    runNo: number
    startedAt: number
    aiThoughtLogs: unknown[]
    actionLogs: string[]
    roundLogsByRound: Record<string, string[]>
    roundPanelTexts: Record<string, string>
  } | null
  _pauseSnapshotTimeLeft: number | null
}

export function createGameSlice(): GameSlice {
  return {
    round: 1,
    actionsLeft: 99,
    roundTimeLeft: 60,
    playerMoney: 3000000,
    selectedItem: null,
    currentBid: 0,
    bidLeader: "none",
    secondHighestBid: 0,
    aiMaxBid: 0,
    aiWallets: {},
    warehouseTrueValue: 0,
    warehouseCellIndex: {},
    settled: false,
    previewOpenTick: 0,
    roundTimerId: null,
    roundPaused: false,
    roundResolving: false,
    playerBidSubmitted: false,
    playerRoundBid: 0,
    isSettlementRevealMode: false,
    settlementRevealRunning: false,
    settlementRevealSkipRequested: false,
    settlementSession: null,
    settlementRunToken: 0,
    moneySettledRunToken: null,
    _edgeFlashActive: false,
    _lastDisplayedMoney: null,
    players: [
      { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
      { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
    ],
    playerRoundHistory: {},
    playerUsageHistory: {},
    currentRoundUsage: {},
    playerHistoryPanels: {},
    roundBidReadyState: {},
    aiRoundDecisionPromise: null,
    currentPublicEvent: null,
    keypadValue: "0",
    _activeSkillId: null,
    _gameConfirmCallback: null,
    _gameCancelCallback: null,
    runSerial: 0,
    runLogHistory: [],
    bonusEffects: [],
    currentRunLog: null,
    _pauseSnapshotTimeLeft: null
  }
}

export function resetForNewRun(s: GameSlice): void {
  // 重置瞬态（本局游戏状态），保留持久化字段：
  // - playerMoney（localStorage mobao_player_money_v1，跨局保留的资金，构造时 loadPlayerMoney 加载）
  s.round = 1
  s.actionsLeft = 99
  s.roundTimeLeft = 60
  s.selectedItem = null
  s.currentBid = 0
  s.bidLeader = "none"
  s.secondHighestBid = 0
  s.aiMaxBid = 0
  s.aiWallets = {}
  s.warehouseTrueValue = 0
  s.warehouseCellIndex = {}
  s.settled = false
  s.previewOpenTick = 0
  s.roundTimerId = null
  s.roundPaused = false
  s.roundResolving = false
  s.playerBidSubmitted = false
  s.playerRoundBid = 0
  s.isSettlementRevealMode = false
  s.settlementRevealRunning = false
  s.settlementRevealSkipRequested = false
  s.settlementSession = null
  s.settlementRunToken = 0
  s.moneySettledRunToken = null
  s._edgeFlashActive = false
  s._lastDisplayedMoney = null
  s.players = [
    { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
    { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
    { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
    { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
  ]
  s.playerRoundHistory = {}
  s.playerUsageHistory = {}
  s.currentRoundUsage = {}
  s.playerHistoryPanels = {}
  s.roundBidReadyState = {}
  s.aiRoundDecisionPromise = null
  s.currentPublicEvent = null
  s.keypadValue = "0"
  s._activeSkillId = null
  s._gameConfirmCallback = null
  s._gameCancelCallback = null
  // runSerial 跨局/跨会话持久化（memory 存储），不由新局重置清零；beginRunTracking 负责递增。
  s.runLogHistory = []
  s.bonusEffects = []
  s.currentRunLog = null
  s._pauseSnapshotTimeLeft = null
}

export function resetForNewRound(s: GameSlice): void {
  s.currentBid = 0
  s.bidLeader = "none"
  s.secondHighestBid = 0
  s.playerBidSubmitted = false
  s.playerRoundBid = 0
  s.roundBidReadyState = {}
  s.keypadValue = "0"
  s.roundResolving = false
  s._activeSkillId = null
}

export function finishAuction(s: GameSlice): void {
  s.settled = true
  s.roundResolving = false
}