/**
 * @file tests/behavioral/state-reset.test.ts
 * @description 行为测试：验证状态管理系统所有 reset 方法的正确性和状态隔离性
 *
 * 测试覆盖：
 * 1. resetLanState 隔离测试 - 全部 17 字段重置，gameSlice 不受影响
 * 2. resetLanGameState 部分重置 - 仅清空 lanHostBids/lanHostWallets，连接信息保留
 * 3. resetForNewRun 隔离测试 - game/ai/warehouse/record 重置，lan/settings 不变
 * 4. resetForNewRound 部分重置 - 回合字段重置，资金/玩家/历史保留
 * 5. resetAll 全量重置 - game/ai/warehouse/record/lan 回默认
 * 6. startLanGame 生命周期 - 联机启动字段正确设置
 * 7. finishAuction 生命周期 - 结算状态正确设置
 */

import { describe, it, expect } from "vitest"
import {
  GameState,
  createGameSlice,
  createLanSlice,
  createAiSlice,
  createWarehouseSlice,
  createRecordSlice,
  startLanGame,
  finishAuction
} from "../../scripts/game/core/state/index"
import { defaultGameSettings } from "../../scripts/game/core/settings"

// ============================================================
// 1. resetLanState 隔离测试
// ============================================================
describe("resetLanState 隔离测试", () => {
  it("应重置全部 17 个 LAN 字段到默认值，不影响 gameSlice", () => {
    const state = new GameState()
    const defaults = createLanSlice()

    // 预设：lanSlice 全部 17 字段设非默认值
    state.lan.isLanMode = true
    state.lan.lanBridge = {} as unknown
    state.lan.lanIsHost = true
    state.lan.lanMySlotId = "p2"
    state.lan.lanIdToSlotId = { lan1: "p2" }
    state.lan.slotIdToLanId = { p2: "lan1" }
    state.lan.lanHostWallets = { lan1: 50000, lan2: 30000 }
    state.lan.lanHostBids = { lan1: 10000, lan2: 8000 }
    state.lan.lanReconnecting = true
    state.lan.lanReconnectAttempts = 3
    state.lan.lanMaxReconnectAttempts = 10
    state.lan.lanLastServerUrl = "ws://localhost:3000"
    state.lan.lanLastRoomCode = "ROOM01"
    state.lan.lanLastPlayerId = "lan1"
    state.lan.lanAiPlayers = [
      { id: "ai1", name: "AI1", isAI: true, isReady: false, characterId: null, carryItems: [] }
    ]
    state.lan.lanAiLlmEnabled = true
    state.lan.lanPlayers = [
      { id: "lan1", name: "LAN1", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]

    // 预设：gameSlice 也设非默认值，用于验证隔离
    state.game.round = 99
    state.game.playerMoney = 5000
    state.game.settled = true

    // 执行
    state.resetLanState()

    // 验证：LAN 游戏状态字段回到默认值
    expect(state.lan.isLanMode).toBe(defaults.isLanMode)
    expect(state.lan.lanIsHost).toBe(defaults.lanIsHost)
    expect(state.lan.lanMySlotId).toBe(defaults.lanMySlotId)
    expect(state.lan.lanIdToSlotId).toEqual(defaults.lanIdToSlotId)
    expect(state.lan.slotIdToLanId).toEqual(defaults.slotIdToLanId)
    expect(state.lan.lanHostWallets).toEqual(defaults.lanHostWallets)
    expect(state.lan.lanHostBids).toEqual(defaults.lanHostBids)
    expect(state.lan.lanAiPlayers).toEqual(defaults.lanAiPlayers)
    expect(state.lan.lanAiLlmEnabled).toBe(defaults.lanAiLlmEnabled)
    expect(state.lan.lanPlayers).toEqual(defaults.lanPlayers)

    // 验证：连接/重连字段保留（resetLanState 不杀连接，原代码行为）
    expect(state.lan.lanBridge).toEqual({} as unknown) // 保留，不被 null
    expect(state.lan.lanReconnecting).toBe(true) // 保留
    expect(state.lan.lanReconnectAttempts).toBe(3) // 保留
    expect(state.lan.lanMaxReconnectAttempts).toBe(10) // 保留
    expect(state.lan.lanLastServerUrl).toBe("ws://localhost:3000") // 保留
    expect(state.lan.lanLastRoomCode).toBe("ROOM01") // 保留
    expect(state.lan.lanLastPlayerId).toBe("lan1") // 保留

    // 验证：gameSlice 不受影响
    expect(state.game.round).toBe(99)
    expect(state.game.playerMoney).toBe(5000)
    expect(state.game.settled).toBe(true)
  })

  it("disconnectLan 应重置全部字段含连接（显式断开）", () => {
    const state = new GameState()
    const defaults = createLanSlice()

    state.lan.isLanMode = true
    state.lan.lanBridge = {} as unknown
    state.lan.lanLastRoomCode = "ROOM01"
    state.lan.lanLastPlayerId = "lan1"
    state.lan.lanReconnecting = true

    state.disconnectLan()

    // 全部重置含连接
    expect(state.lan.isLanMode).toBe(false)
    expect(state.lan.lanBridge).toBeNull()
    expect(state.lan.lanLastRoomCode).toBeNull()
    expect(state.lan.lanLastPlayerId).toBeNull()
    expect(state.lan.lanReconnecting).toBe(false)
    expect(state.lan.lanPlayers).toEqual(defaults.lanPlayers)
  })
})

// ============================================================
// 2. resetLanGameState 部分重置
// ============================================================
describe("resetLanGameState 部分重置", () => {
  it("应仅清空 lanHostBids 和 lanHostWallets，保留连接信息", () => {
    const state = new GameState()

    // 预设：lanSlice 全部 17 字段设非默认值
    state.lan.isLanMode = true
    state.lan.lanBridge = { conn: true } as unknown
    state.lan.lanIsHost = true
    state.lan.lanMySlotId = "p2"
    state.lan.lanIdToSlotId = { lan1: "p2" }
    state.lan.slotIdToLanId = { p2: "lan1" }
    state.lan.lanHostWallets = { lan1: 50000, lan2: 30000 }
    state.lan.lanHostBids = { lan1: 10000, lan2: 8000 }
    state.lan.lanReconnecting = true
    state.lan.lanReconnectAttempts = 3
    state.lan.lanMaxReconnectAttempts = 10
    state.lan.lanLastServerUrl = "ws://localhost:3000"
    state.lan.lanLastRoomCode = "ROOM01"
    state.lan.lanLastPlayerId = "lan1"
    state.lan.lanAiPlayers = [
      { id: "ai1", name: "AI1", isAI: true, isReady: false, characterId: null, carryItems: [] }
    ]
    state.lan.lanAiLlmEnabled = true
    state.lan.lanPlayers = [
      { id: "lan1", name: "LAN1", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]

    // 执行
    state.resetLanGameState()

    // 验证：lanHostBids 和 lanHostWallets 被重置
    expect(state.lan.lanHostBids).toEqual({})
    expect(state.lan.lanHostWallets).toEqual({})

    // 验证：连接信息保留（未被重置的字段）
    expect(state.lan.lanBridge).not.toBeNull()
    expect(state.lan.lanPlayers).toHaveLength(1)
    expect(state.lan.lanLastRoomCode).toBe("ROOM01")
    expect(state.lan.lanLastPlayerId).toBe("lan1")
    expect(state.lan.lanIsHost).toBe(true)
    expect(state.lan.isLanMode).toBe(true)
    expect(state.lan.lanMySlotId).toBe("p2")
    expect(state.lan.lanIdToSlotId).toEqual({ lan1: "p2" })
    expect(state.lan.slotIdToLanId).toEqual({ p2: "lan1" })
    expect(state.lan.lanReconnecting).toBe(true)
    expect(state.lan.lanReconnectAttempts).toBe(3)
    expect(state.lan.lanMaxReconnectAttempts).toBe(10)
    expect(state.lan.lanLastServerUrl).toBe("ws://localhost:3000")
    expect(state.lan.lanAiPlayers).toHaveLength(1)
    expect(state.lan.lanAiLlmEnabled).toBe(true)
  })
})

// ============================================================
// 3. resetForNewRun 隔离测试
// ============================================================
describe("resetForNewRun 隔离测试", () => {
  it("应重置 game/ai/warehouse/record 瞬态字段，保留持久化字段（aiLlmPlayerEnabled/aiConversationByPlayer/aiCrossGameMemory/playerMoney/battleRecords）及 lan/settings", () => {
    const state = new GameState()

    // 预设：全部 slice 设非默认值
    // gameSlice
    state.game.round = 99
    state.game.playerMoney = 5000
    state.game.settled = true
    state.game.currentBid = 1000
    state.game.bidLeader = "p1"
    state.game._activeSkillId = "skill1"
    state.game.players = [
      { id: "custom", name: "自定义", avatar: "C1", isHuman: true, isAI: false, isSelf: true }
    ]
    state.game.runSerial = 5
    state.game.runLogHistory = [{ test: true }]
    state.game.currentRunLog = {
      runNo: 1,
      startedAt: 1000,
      aiThoughtLogs: [],
      actionLogs: [],
      roundLogsByRound: {},
      roundPanelTexts: {}
    }

    // aiSlice
    state.ai.llmEverUsedThisRun = true
    state.ai.aiReflectionState = "running"
    state.ai.aiReflectionTotal = 5
    state.ai.aiReflectionCompleted = 3
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }
    state.ai.aiConversationByPlayer = {
      p1: [{ role: "user", content: "hello", timestamp: 1000 }]
    }
    state.ai.aiCrossGameMemory = { p1: [{ summary: "test", timestamp: 1000 }] }
    state.ai.aiCrossGameMessagesByPlayer = { p1: [[{ role: "assistant", content: "ok" }]] }
    state.ai.aiPrivateIntel = { p1: { summary: "test", lastUpdated: 1000 } }

    // warehouseSlice
    state.warehouse.items = [{ key: "test-item", id: "item-1" } as unknown as never]
    state.warehouse.revealedCells = [{ x: 0, y: 0 }]
    state.warehouse.deepSeekTesting = true

    // recordSlice
    state.record.battleRecords = [{ id: "rec1" }]
    state.record.pendingSettlementSummary = "测试摘要"
    state.record.privateIntelEntries = [{ source: "test", text: "info", round: 1 }]
    state.record.publicInfoEntries = [{ source: "test", text: "public" }]

    // lanSlice（应保持不变）
    state.lan.isLanMode = true
    state.lan.lanIsHost = true
    state.lan.lanPlayers = [
      { id: "lan1", name: "联机玩家", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]
    state.lan.lanLastRoomCode = "ROOM99"

    // settingsSlice（应保持不变）
    state.settings.maxRounds = 10
    state.settings.musicVolume = 50
    state.settings.dirty = true

    // 快照 lanSlice 和 settingsSlice（用于验证不变）
    const lanSnapshot = { ...state.lan, lanPlayers: [...state.lan.lanPlayers], lanAiPlayers: [...state.lan.lanAiPlayers] }
    const settingsSnapshot = { ...state.settings }

    // 执行
    state.resetForNewRun()

    // 验证：gameSlice 重置（瞬态字段），保留持久化字段
    const defaultGame = createGameSlice()
    expect(state.game.round).toBe(defaultGame.round)
    expect(state.game.actionsLeft).toBe(defaultGame.actionsLeft)
    expect(state.game.roundTimeLeft).toBe(defaultGame.roundTimeLeft)
    expect(state.game.playerMoney).toBe(5000) // 保留：持久化，跨局资金
    expect(state.game.selectedItem).toBe(defaultGame.selectedItem)
    expect(state.game.currentBid).toBe(defaultGame.currentBid)
    expect(state.game.bidLeader).toBe(defaultGame.bidLeader)
    expect(state.game.settled).toBe(defaultGame.settled)
    expect(state.game.roundResolving).toBe(defaultGame.roundResolving)
    expect(state.game.playerBidSubmitted).toBe(defaultGame.playerBidSubmitted)
    expect(state.game._activeSkillId).toBe(defaultGame._activeSkillId)
    expect(state.game.players).toEqual(defaultGame.players)
    // runSerial 跨局/跨会话持久化（memory 存储），resetForNewRun 不应清零；beginRunTracking 负责递增。
    // 之前 resetForNewRun 清零导致结算一直显示"第0局"。
    expect(state.game.runSerial).toBe(5)
    expect(state.game.runLogHistory).toEqual(defaultGame.runLogHistory)
    expect(state.game.currentRunLog).toEqual(defaultGame.currentRunLog)
    expect(state.game._pauseSnapshotTimeLeft).toBe(defaultGame._pauseSnapshotTimeLeft)

    // 验证：aiSlice 重置（瞬态字段），保留持久化字段
    const defaultAi = createAiSlice()
    expect(state.ai.llmEverUsedThisRun).toBe(defaultAi.llmEverUsedThisRun)
    expect(state.ai.aiReflectionState).toBe(defaultAi.aiReflectionState)
    expect(state.ai.aiReflectionTotal).toBe(defaultAi.aiReflectionTotal)
    expect(state.ai.aiReflectionCompleted).toBe(defaultAi.aiReflectionCompleted)
    // 保留的持久化字段
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false }) // 保留：localStorage mobao_ai_llm_switch_v1
    expect(state.ai.aiConversationByPlayer).toEqual({
      p1: [{ role: "user", content: "hello", timestamp: 1000 }]
    }) // 保留：AI 记忆系统跨局对话
    expect(state.ai.aiCrossGameMemory).toEqual({ p1: [{ summary: "test", timestamp: 1000 }] }) // 保留：跨局记忆
    expect(state.ai.aiCrossGameMessagesByPlayer).toEqual({ p1: [[{ role: "assistant", content: "ok" }]] }) // 保留：跨局消息
    // 瞬态字段重置
    expect(state.ai.aiPrivateIntel).toEqual(defaultAi.aiPrivateIntel)
    expect(state.ai.aiResourceState).toEqual(defaultAi.aiResourceState)
    expect(state.ai.aiRoundEffects).toEqual(defaultAi.aiRoundEffects)
    expect(state.ai.lastAiIntelActions).toEqual(defaultAi.lastAiIntelActions)
    expect(state.ai.aiLlmRoundPlans).toEqual(defaultAi.aiLlmRoundPlans)
    expect(state.ai.aiFoldState).toEqual(defaultAi.aiFoldState)
    expect(state.ai.lastAiDecisionTelemetry).toBe(defaultAi.lastAiDecisionTelemetry)
    expect(state.ai.aiReflectionStateDetail).toBe(defaultAi.aiReflectionStateDetail)
    expect(state.ai._reflectionBeforeUnload).toBe(defaultAi._reflectionBeforeUnload)
    expect(state.ai.aiReflectionPending).toEqual(defaultAi.aiReflectionPending)
    expect(state.ai.aiConversationCache).toEqual(defaultAi.aiConversationCache)

    // 验证：warehouseSlice 重置
    const defaultWarehouse = createWarehouseSlice()
    expect(state.warehouse.items).toEqual(defaultWarehouse.items)
    expect(state.warehouse.revealedCells).toEqual(defaultWarehouse.revealedCells)
    expect(state.warehouse.deepSeekTesting).toBe(defaultWarehouse.deepSeekTesting)

    // 验证：recordSlice 重置（瞬态字段），保留持久化字段
    const defaultRecord = createRecordSlice()
    expect(state.record.battleRecords).toEqual([{ id: "rec1" }]) // 保留：localStorage mobao_battle_records_v1
    expect(state.record.pendingNextRunAiSummaryByPlayer).toEqual({}) // 保留：未设置预设值，默认空对象
    expect(state.record.pendingSettlementSummary).toBe(defaultRecord.pendingSettlementSummary)
    expect(state.record.privateIntelEntries).toEqual(defaultRecord.privateIntelEntries)
    expect(state.record.publicInfoEntries).toEqual(defaultRecord.publicInfoEntries)
    expect(state.record.highValuePriceThreshold).toBe(defaultRecord.highValuePriceThreshold)
    expect(state.record.battleRecordReplayActive).toBe(defaultRecord.battleRecordReplayActive)
    expect(state.record.battleRecordReplayRecordId).toBe(defaultRecord.battleRecordReplayRecordId)
    expect(state.record.battleRecordLogView).toBe(defaultRecord.battleRecordLogView)

    // 验证：lanSlice 不变（联机状态不因新局重置）
    expect(state.lan.isLanMode).toBe(true)
    expect(state.lan.lanIsHost).toBe(true)
    expect(state.lan.lanPlayers).toHaveLength(1)
    expect(state.lan.lanLastRoomCode).toBe("ROOM99")

    // 验证：settingsSlice 不变
    expect(state.settings.maxRounds).toBe(10)
    expect(state.settings.musicVolume).toBe(50)
    expect(state.settings.dirty).toBe(true)
  })
})

// ============================================================
// 4. resetForNewRound 部分重置
// ============================================================
describe("resetForNewRound 部分重置", () => {
  it("应重置回合字段（currentBid/bidLeader/playerBidSubmitted/roundBidReadyState/roundResolving/_activeSkillId），保留资金/玩家/历史", () => {
    const state = new GameState()

    // 预设：gameSlice 全部涉及字段设非默认值
    // 应被重置的字段
    state.game.currentBid = 5000
    state.game.bidLeader = "p1"
    state.game.secondHighestBid = 3000
    state.game.playerBidSubmitted = true
    state.game.playerRoundBid = 2000
    state.game.roundBidReadyState = { p1: true, p2: false }
    state.game.keypadValue = "5000"
    state.game.roundResolving = true
    state.game._activeSkillId = "skill1"

    // 应保留的字段
    state.game.playerMoney = 1000
    state.game.players = [
      { id: "custom", name: "自定义", avatar: "C1", isHuman: true, isAI: false, isSelf: true }
    ]
    state.game.playerRoundHistory = { p1: { won: true } }
    state.game.currentRoundUsage = { p1: { actions: 2 } }
    state.game.round = 5
    state.game.settled = true

    // 预设：aiSlice 也设非默认值（GameState.resetForNewRound 也会重置 AI 回合状态）
    state.ai.aiRoundEffects = { p1: "effect1" }
    state.ai.aiLlmRoundPlans = { p1: { decision: "bid" } as never }
    state.ai.llmEverUsedThisRun = true
    state.ai.lastAiIntelActions = [{ playerId: "p1", playerName: "P1", actionType: "bid", actionId: "a1", revealed: null, detail: "", score: 0, effectTag: "", signalStats: null }]

    // 执行
    state.resetForNewRound()

    // 验证：回合字段被重置
    expect(state.game.currentBid).toBe(0)
    expect(state.game.bidLeader).toBe("none")
    expect(state.game.secondHighestBid).toBe(0)
    expect(state.game.playerBidSubmitted).toBe(false)
    expect(state.game.playerRoundBid).toBe(0)
    expect(state.game.roundBidReadyState).toEqual({})
    expect(state.game.keypadValue).toBe("0")
    expect(state.game.roundResolving).toBe(false)
    expect(state.game._activeSkillId).toBeNull()

    // 验证：资金/玩家/历史保留
    expect(state.game.playerMoney).toBe(1000)
    expect(state.game.players).toEqual([
      { id: "custom", name: "自定义", avatar: "C1", isHuman: true, isAI: false, isSelf: true }
    ])
    expect(state.game.playerRoundHistory).toEqual({ p1: { won: true } })
    expect(state.game.currentRoundUsage).toEqual({ p1: { actions: 2 } })

    // 验证：非回合流程字段也保留
    expect(state.game.round).toBe(5)
    expect(state.game.settled).toBe(true)

    // 验证：AI 回合状态也被重置
    expect(state.ai.aiRoundEffects).toEqual({})
    expect(state.ai.aiLlmRoundPlans).toEqual({})
    expect(state.ai.llmEverUsedThisRun).toBe(false)
    expect(state.ai.lastAiIntelActions).toEqual([])
  })
})

// ============================================================
// 5. resetAll 全量重置
// ============================================================
describe("resetAll 全量重置", () => {
  it("应重置 game/ai/warehouse/record/lan 瞬态字段，保留持久化字段（playerMoney/battleRecords）及 settings/ui", () => {
    const state = new GameState()

    // 预设：全部 slice 设非默认值
    // gameSlice
    state.game.round = 99
    state.game.playerMoney = 5000
    state.game.currentBid = 1000
    state.game.settled = true
    state.game.players = [
      { id: "custom", name: "自定义", avatar: "C1", isHuman: true, isAI: false, isSelf: true }
    ]

    // aiSlice
    state.ai.llmEverUsedThisRun = true
    state.ai.aiReflectionState = "running"

    // warehouseSlice
    state.warehouse.items = [{ key: "test-item", id: "item-1" } as unknown as never]
    state.warehouse.deepSeekTesting = true

    // recordSlice
    state.record.battleRecords = [{ id: "rec1" }]
    state.record.pendingSettlementSummary = "测试摘要"

    // lanSlice
    state.lan.isLanMode = true
    state.lan.lanIsHost = true
    state.lan.lanPlayers = [
      { id: "lan1", name: "联机玩家", isAI: false, isReady: true, characterId: null, carryItems: [] }
    ]
    state.lan.lanLastRoomCode = "ROOM99"

    // settingsSlice（不应被 resetAll 影响）
    state.settings.maxRounds = 10
    state.settings.musicVolume = 50
    state.settings.dirty = true

    // uiSlice（不应被 resetAll 影响）
    state.ui._hudRoundText = document.createElement("div")
    state.ui.dom = { test: document.createElement("span") }

    // 执行
    state.resetAll()

    // 验证：gameSlice 重置（瞬态），保留持久化字段
    const defaultGame = createGameSlice()
    expect(state.game.round).toBe(defaultGame.round)
    expect(state.game.playerMoney).toBe(5000) // 保留：持久化，跨局资金
    expect(state.game.currentBid).toBe(defaultGame.currentBid)
    expect(state.game.settled).toBe(defaultGame.settled)
    expect(state.game.players).toEqual(defaultGame.players)

    // 验证：aiSlice 重置（瞬态），保留持久化字段
    const defaultAi = createAiSlice()
    expect(state.ai.llmEverUsedThisRun).toBe(defaultAi.llmEverUsedThisRun)
    expect(state.ai.aiReflectionState).toBe(defaultAi.aiReflectionState)

    // 验证：warehouseSlice 重置
    const defaultWarehouse = createWarehouseSlice()
    expect(state.warehouse.items).toEqual(defaultWarehouse.items)
    expect(state.warehouse.deepSeekTesting).toBe(defaultWarehouse.deepSeekTesting)

    // 验证：recordSlice 重置（瞬态），保留持久化字段
    const defaultRecord = createRecordSlice()
    expect(state.record.battleRecords).toEqual([{ id: "rec1" }]) // 保留：localStorage mobao_battle_records_v1
    expect(state.record.pendingSettlementSummary).toBe(defaultRecord.pendingSettlementSummary)

    // 验证：lanSlice 游戏状态重置，连接字段保留（resetLanState 不杀连接）
    const defaultLan = createLanSlice()
    expect(state.lan.isLanMode).toBe(defaultLan.isLanMode)
    expect(state.lan.lanIsHost).toBe(defaultLan.lanIsHost)
    expect(state.lan.lanPlayers).toEqual(defaultLan.lanPlayers)
    expect(state.lan.lanLastRoomCode).toBe("ROOM99") // 连接字段保留

    // 验证：settingsSlice 不受 resetAll 影响
    expect(state.settings.maxRounds).toBe(10)
    expect(state.settings.musicVolume).toBe(50)
    expect(state.settings.dirty).toBe(true)

    // 验证：uiSlice 不受 resetAll 影响
    expect(state.ui._hudRoundText).not.toBeNull()
    expect(state.ui.dom.test).not.toBeNull()
  })
})

// ============================================================
// 6. startLanGame 生命周期
// ============================================================
describe("startLanGame 生命周期", () => {
  it("应正确设置联机启动字段（isLanMode/lanPlayers/lanAiPlayers/lanIsHost/lanMySlotId/lanIdToSlotId/slotIdToLanId）", () => {
    const state = new GameState()

    const players = [
      { id: "lan1", name: "主机", isAI: false, isReady: true, characterId: "char1", carryItems: [] },
      { id: "lan2", name: "客机", isAI: false, isReady: true, characterId: "char2", carryItems: [] }
    ]

    const aiPlayers = [
      { id: "ai1", name: "AI玩家", isAI: true, isReady: true, characterId: "char3", carryItems: [], llm: true }
    ]

    const slotMap = { lan1: "slot1", lan2: "slot2", ai1: "slot3" }

    // 执行
    startLanGame(state.lan, {
      players,
      aiPlayers,
      hostId: "slot1",
      mySlotId: "slot1",
      slotMap
    })

    // 验证
    expect(state.lan.isLanMode).toBe(true)
    expect(state.lan.lanPlayers).toEqual(players)
    expect(state.lan.lanAiPlayers).toEqual(aiPlayers)
    expect(state.lan.lanIsHost).toBe(true) // hostId === mySlotId
    expect(state.lan.lanMySlotId).toBe("slot1")
    expect(state.lan.lanIdToSlotId).toEqual(slotMap)
    expect(state.lan.slotIdToLanId).toEqual({ slot1: "lan1", slot2: "lan2", slot3: "ai1" })
  })

  it("当 mySlotId 与 hostId 不同时，lanIsHost 应为 false", () => {
    const state = new GameState()

    const players = [
      { id: "lan1", name: "主机", isAI: false, isReady: true, characterId: "char1", carryItems: [] },
      { id: "lan2", name: "客机", isAI: false, isReady: true, characterId: "char2", carryItems: [] }
    ]

    const slotMap = { lan1: "slot1", lan2: "slot2" }

    startLanGame(state.lan, {
      players,
      aiPlayers: [],
      hostId: "slot1",
      mySlotId: "slot2",
      slotMap
    })

    expect(state.lan.lanIsHost).toBe(false)
    expect(state.lan.lanMySlotId).toBe("slot2")
  })
})

// ============================================================
// 7. finishAuction 生命周期
// ============================================================
describe("finishAuction 生命周期", () => {
  it("应设置 settled=true 且 roundResolving=false", () => {
    const state = new GameState()

    // 预设：出价未结算、正在解析
    state.game.settled = false
    state.game.roundResolving = true

    // 执行
    finishAuction(state.game)

    // 验证
    expect(state.game.settled).toBe(true)
    expect(state.game.roundResolving).toBe(false)
  })
})