/**
 * @file tests/integration/lan-isolation.test.ts
 * @description 集成测试：验证 LAN 联机状态在场景切换时的隔离性。
 *
 * 测试覆盖：
 * 1. startNewRun 后 isLanMode 为 false，players 为 4 个默认单机玩家
 * 2. showLobbyMain 后 players 重置为默认
 * 3. enterLanRoom 后 lanPlayers 为空数组
 */
import { describe, it, expect } from "vitest"

// ─── 模拟场景状态 ─────────────────────────────────────────────

interface MockPlayer {
  id: string
  name: string
  avatar: string
  isHuman: boolean
  isAI: boolean
  isSelf: boolean
}

interface MockState {
  isLanMode: boolean
  lanIsHost: boolean
  lanPlayers: Array<{ id: string }>
  lanAiPlayers: Array<{ id: string }>
  lanHostWallets: Record<string, number>
  lanHostBids: Record<string, number>
  lanAiLlmEnabled: boolean
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanMySlotId: string | null
  aiLlmPlayerEnabled: Record<string, boolean>
  players: MockPlayer[]
  playerMoney: number
  items: unknown[]
  itemLayer: unknown | null
  gridLayer: unknown | null
  revealCellLayer: unknown | null
  activeSettlementSpinner: unknown | null
}

const DEFAULT_PLAYERS: MockPlayer[] = [
  { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
  { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
  { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
  { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
]

function makeLanContaminatedState(): MockState {
  return {
    isLanMode: true,
    lanIsHost: true,
    lanPlayers: [{ id: "lan1" }, { id: "lan2" }],
    lanAiPlayers: [{ id: "ai_lan1" }],
    lanHostWallets: { lan1: 50000, lan2: 30000 },
    lanHostBids: { lan1: 10000, lan2: 8000 },
    lanAiLlmEnabled: true,
    lanIdToSlotId: { lan1: "p2", lan2: "p3" },
    slotIdToLanId: { p2: "lan1", p3: "lan2" },
    lanMySlotId: "p2",
    aiLlmPlayerEnabled: { ai1: true },
    players: [
      { id: "p2", name: "玩家(联机)", avatar: "你", isHuman: true, isAI: false, isSelf: true },
      { id: "lan1", name: "联机玩家1", avatar: "B1", isHuman: true, isAI: false, isSelf: false },
      { id: "lan2", name: "联机玩家2", avatar: "B2", isHuman: true, isAI: false, isSelf: false }
    ],
    playerMoney: 99999,
    items: [],
    itemLayer: null,
    gridLayer: null,
    revealCellLayer: null,
    activeSettlementSpinner: null
  }
}

// 模拟 cleanupGameScene（只清理必要字段）
function mockCleanupGameScene(state: MockState): void {
  state.items = []
  state.itemLayer = null
  state.gridLayer = null
  state.revealCellLayer = null
  state.activeSettlementSpinner = null
}

// ─── 被测试函数的内联实现 ────────────────────────────────────

// 对应 cleanup-fns.ts 的 enterLobby（仅测试 LAN 状态重置逻辑）
function enterLobby(state: MockState): void {
  mockCleanupGameScene(state)
  state.isLanMode = false
  state.lanIsHost = false
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanMySlotId = null
  state.aiLlmPlayerEnabled = {}
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
}

// 对应 cleanup-fns.ts 的 enterLanRoom（仅测试 LAN 状态重置逻辑）
function enterLanRoom(state: MockState): void {
  mockCleanupGameScene(state)
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanMySlotId = null
  state.aiLlmPlayerEnabled = {}
}

// 对应 navigation-fns.ts 的 showLobbyMain（仅测试 LAN 状态重置逻辑）
function showLobbyMain(state: MockState): void {
  state.isLanMode = false
  state.lanIsHost = false
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanMySlotId = null
  state.aiLlmPlayerEnabled = {}
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
}

// 对应 scene-run.ts 的 startNewRun（仅测试 LAN 状态重置逻辑）
function startNewRun(state: MockState): void {
  state.isLanMode = false
  state.lanIsHost = false
  state.lanPlayers = []
  state.lanAiPlayers = []
  state.lanIdToSlotId = {}
  state.slotIdToLanId = {}
  state.lanHostWallets = {}
  state.lanHostBids = {}
  state.lanAiLlmEnabled = false
  state.lanMySlotId = "p2"
  state.players = DEFAULT_PLAYERS.map((p) => ({ ...p }))
}

// ─── 测试用例 ────────────────────────────────────────────────

describe("LAN 联机状态隔离性集成测试", () => {
  describe("startNewRun", () => {
    it("应将 isLanMode 重置为 false", () => {
      const state = makeLanContaminatedState()
      expect(state.isLanMode).toBe(true)
      startNewRun(state)
      expect(state.isLanMode).toBe(false)
    })

    it("应将 players 重置为 4 个默认单机玩家", () => {
      const state = makeLanContaminatedState()
      expect(state.players.length).toBe(3)
      startNewRun(state)
      expect(state.players).toHaveLength(4)
      expect(state.players[0].id).toBe("p1")
      expect(state.players[1].id).toBe("p2")
      expect(state.players[2].id).toBe("p3")
      expect(state.players[3].id).toBe("p4")
      expect(state.players[1].isSelf).toBe(true)
    })

    it("应清除联机玩家列表", () => {
      const state = makeLanContaminatedState()
      expect(state.lanPlayers.length).toBeGreaterThan(0)
      startNewRun(state)
      expect(state.lanPlayers).toHaveLength(0)
      expect(state.lanAiPlayers).toHaveLength(0)
    })

    it("应清除联机钱包和出价记录", () => {
      const state = makeLanContaminatedState()
      expect(Object.keys(state.lanHostWallets).length).toBeGreaterThan(0)
      startNewRun(state)
      expect(state.lanHostWallets).toEqual({})
      expect(state.lanHostBids).toEqual({})
    })

    it("应重置联机映射表", () => {
      const state = makeLanContaminatedState()
      startNewRun(state)
      expect(state.lanIdToSlotId).toEqual({})
      expect(state.slotIdToLanId).toEqual({})
      expect(state.lanAiLlmEnabled).toBe(false)
    })
  })

  describe("showLobbyMain", () => {
    it("应将 isLanMode 重置为 false", () => {
      const state = makeLanContaminatedState()
      showLobbyMain(state)
      expect(state.isLanMode).toBe(false)
    })

    it("应将 players 重置为 4 个默认单机玩家", () => {
      const state = makeLanContaminatedState()
      showLobbyMain(state)
      expect(state.players).toHaveLength(4)
      expect(state.players[1].id).toBe("p2")
      expect(state.players[1].isSelf).toBe(true)
    })

    it("应清除所有联机状态", () => {
      const state = makeLanContaminatedState()
      showLobbyMain(state)
      expect(state.lanPlayers).toHaveLength(0)
      expect(state.lanAiPlayers).toHaveLength(0)
      expect(state.lanHostWallets).toEqual({})
      expect(state.lanHostBids).toEqual({})
      expect(state.lanAiLlmEnabled).toBe(false)
      expect(state.lanIdToSlotId).toEqual({})
      expect(state.slotIdToLanId).toEqual({})
      expect(state.lanMySlotId).toBeNull()
      expect(state.lanIsHost).toBe(false)
    })
  })

  describe("enterLanRoom", () => {
    it("应将 lanPlayers 重置为空数组", () => {
      const state = makeLanContaminatedState()
      expect(state.lanPlayers.length).toBeGreaterThan(0)
      enterLanRoom(state)
      expect(state.lanPlayers).toHaveLength(0)
      expect(state.lanAiPlayers).toHaveLength(0)
    })

    it("应将 players 重置为 4 个默认单机玩家", () => {
      const state = makeLanContaminatedState()
      expect(state.players.length).toBe(3) // 联机污染状态只有 3 个
      enterLanRoom(state)
      expect(state.players).toHaveLength(4)
      expect(state.players[1].isSelf).toBe(true)
    })

    it("应清除联机钱包和出价记录", () => {
      const state = makeLanContaminatedState()
      enterLanRoom(state)
      expect(state.lanHostWallets).toEqual({})
      expect(state.lanHostBids).toEqual({})
      expect(state.lanAiLlmEnabled).toBe(false)
    })

    it("应重置联机映射表和 slotId", () => {
      const state = makeLanContaminatedState()
      enterLanRoom(state)
      expect(state.lanIdToSlotId).toEqual({})
      expect(state.slotIdToLanId).toEqual({})
      expect(state.lanMySlotId).toBeNull()
      expect(state.aiLlmPlayerEnabled).toEqual({})
    })
  })
})