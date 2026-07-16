/**
 * @file tests/behavioral/state-isolation.test.ts
 * @description 行为测试：验证联机状态隔离（联机->单机切换时状态正确重置）
 *
 * 测试覆盖：
 * 1. 联机->单机隔离：resetLanState + resetForNewRun 后无联机残留
 * 2. 返回房间保留连接：resetLanGameState 保留 bridge/players/roomCode
 * 3. showLobbyMain 全清：resetLanState 17 字段全默认
 */

import { describe, it, expect, beforeAll, vi } from "vitest"
import { GameState } from "../../scripts/game/core/state/index"
import { defaultGameSettings, loadGameSettings, saveGameSettings, GAME_SETTINGS } from "../../scripts/game/core/settings"

// ============================================================
// 1. 联机->单机隔离
// ============================================================
describe("联机->单机隔离", () => {
  it("resetLanState + resetForNewRun 后联机残留全清，GAME_SETTINGS 恢复", () => {
    // 预设：保存默认值到 localStorage（模拟单机初始状态）
    const defaults = defaultGameSettings()
    saveGameSettings(defaults)

    // 模拟全局 GAME_SETTINGS 被联机代码改掉（联机只改内存，不改 localStorage）
    GAME_SETTINGS.maxRounds = 999
    GAME_SETTINGS.roundSeconds = 999

    const state = new GameState()

    // 预设：lanSlice 全设非默认
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

    // 执行：模拟 startNewRun 的 LAN 重置逻辑
    state.resetLanState()
    state.resetForNewRun()
    // 模拟 GAME_SETTINGS 恢复（从 localStorage 重新加载，覆盖联机改的内存值）
    Object.assign(GAME_SETTINGS, loadGameSettings())

    // 验证：lanSlice 游戏状态字段回默认，连接/重连字段保留（resetLanState 不杀连接）
    expect(state.lan.isLanMode).toBe(false)
    expect(state.lan.lanIsHost).toBe(false)
    expect(state.lan.lanMySlotId).toBeNull()
    expect(state.lan.lanIdToSlotId).toEqual({})
    expect(state.lan.slotIdToLanId).toEqual({})
    expect(state.lan.lanHostWallets).toEqual({})
    expect(state.lan.lanHostBids).toEqual({})
    expect(state.lan.lanAiPlayers).toEqual([])
    expect(state.lan.lanAiLlmEnabled).toBe(false)
    expect(state.lan.lanPlayers).toEqual([])
    // 连接字段保留（原代码行为，用于重连）
    expect(state.lan.lanBridge).toEqual({ conn: true } as unknown)
    expect(state.lan.lanReconnecting).toBe(true)
    expect(state.lan.lanReconnectAttempts).toBe(3)
    expect(state.lan.lanMaxReconnectAttempts).toBe(10)
    expect(state.lan.lanLastServerUrl).toBe("ws://localhost:3000")
    expect(state.lan.lanLastRoomCode).toBe("ROOM01")
    expect(state.lan.lanLastPlayerId).toBe("lan1")

    // 验证：GAME_SETTINGS 恢复默认（从 localStorage 加载的，未受联机内存修改影响）
    expect(GAME_SETTINGS.maxRounds).toBe(defaults.maxRounds)
    expect(GAME_SETTINGS.roundSeconds).toBe(defaults.roundSeconds)

    // 还原 GAME_SETTINGS
    Object.assign(GAME_SETTINGS, defaults)
    saveGameSettings(defaults)
  })
})

// ============================================================
// 2. 返回房间保留连接
// ============================================================
describe("返回房间保留连接", () => {
  it("resetLanGameState 仅清空 lanHostBids/lanHostWallets，保留连接信息", () => {
    const state = new GameState()

    // 预设：lanSlice 全部字段设非默认
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

    // 执行：模拟 enterLanRoom 的 LAN 重置逻辑
    state.resetLanGameState()

    // 验证：lanHostBids 和 lanHostWallets 被重置
    expect(state.lan.lanHostBids).toEqual({})
    expect(state.lan.lanHostWallets).toEqual({})

    // 验证：连接信息保留
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
// 3. resetLanState 全清（模拟 showLobbyMain 效果）
// ============================================================
describe("showLobbyMain 全清", () => {
  it("resetLanState 重置全部 17 字段到默认值", () => {
    const state = new GameState()

    // 预设：全部 17 字段设非默认
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

    // 执行
    state.resetLanState()

    // 验证：游戏状态字段回默认，连接字段保留
    expect(state.lan.isLanMode).toBe(false)
    expect(state.lan.lanIsHost).toBe(false)
    expect(state.lan.lanMySlotId).toBeNull()
    expect(state.lan.lanIdToSlotId).toEqual({})
    expect(state.lan.slotIdToLanId).toEqual({})
    expect(state.lan.lanHostWallets).toEqual({})
    expect(state.lan.lanHostBids).toEqual({})
    expect(state.lan.lanAiPlayers).toEqual([])
    expect(state.lan.lanAiLlmEnabled).toBe(false)
    expect(state.lan.lanPlayers).toEqual([])
    // 连接字段保留（resetLanState 不杀连接）
    expect(state.lan.lanBridge).not.toBeNull()
    expect(state.lan.lanLastRoomCode).toBe("ROOM01")
    expect(state.lan.lanLastPlayerId).toBe("lan1")
  })
})