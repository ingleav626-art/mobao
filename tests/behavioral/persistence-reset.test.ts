/**
 * @file tests/behavioral/persistence-reset.test.ts
 * @description 行为测试：验证持久化字段在 reset 后不被清空，保留跨局状态
 *
 * 测试覆盖：
 * 1. resetForNewRun 后 aiLlmPlayerEnabled 保留
 * 2. resetForNewRound 后 aiLlmPlayerEnabled 保留
 * 3. resetAll 后持久化字段保留
 * 4. recordSlice.reset 不清 battleRecords
 * 5. 多字段组合保留
 *
 * 预期：持久化字段（aiLlmPlayerEnabled/playerMoney/battleRecords/aiConversationByPlayer/aiCrossGameMemory）
 *       跨 reset 保留。被清了就是 bug。
 */

import { describe, it, expect } from "vitest"
import {
  GameState,
  createAiSlice,
  createGameSlice,
  createRecordSlice
} from "../../scripts/game/core/state/index"

// ============================================================
// 1. resetForNewRun 后持久化字段保留
// ============================================================
describe("resetForNewRun 后持久化字段保留", () => {
  it("应保留 aiLlmPlayerEnabled（持久化设置，localStorage mobao_ai_llm_switch_v1）", () => {
    const state = new GameState()

    // 预设：模拟 LLM 勾选状态
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    // 执行
    state.resetForNewRun()

    // 验证：保留，不被清空
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })

  it("应保留 aiConversationByPlayer 和 aiCrossGameMemory（AI 跨局记忆）", () => {
    const state = new GameState()

    // 预设：模拟跨局记忆
    state.ai.aiConversationByPlayer = {
      p1: [{ role: "user", content: "上一局对话", timestamp: 1000 }]
    }
    state.ai.aiCrossGameMemory = {
      p1: [{ summary: "上一局总结", timestamp: 1000 }]
    }
    state.ai.aiCrossGameMessagesByPlayer = {
      p1: [[{ role: "assistant", content: "上一局回复" }]]
    }

    // 执行
    state.resetForNewRun()

    // 验证：全部保留
    expect(state.ai.aiConversationByPlayer).toEqual({
      p1: [{ role: "user", content: "上一局对话", timestamp: 1000 }]
    })
    expect(state.ai.aiCrossGameMemory).toEqual({
      p1: [{ summary: "上一局总结", timestamp: 1000 }]
    })
    expect(state.ai.aiCrossGameMessagesByPlayer).toEqual({
      p1: [[{ role: "assistant", content: "上一局回复" }]]
    })
  })

  it("应保留 playerMoney（持久化资金，localStorage mobao_player_money_v1）", () => {
    const state = new GameState()

    // 预设：模拟跨局资金
    state.game.playerMoney = 5000000

    // 执行
    state.resetForNewRun()

    // 验证：保留
    expect(state.game.playerMoney).toBe(5000000)
  })

  it("应保留 battleRecords（持久化战绩，localStorage mobao_battle_records_v1）", () => {
    const state = new GameState()

    // 预设：模拟战绩记录
    state.record.battleRecords = [{ id: "rec1", round: 5, won: true }]

    // 执行
    state.resetForNewRun()

    // 验证：保留
    expect(state.record.battleRecords).toEqual([{ id: "rec1", round: 5, won: true }])
  })

  it("应保留 pendingNextRunAiSummaryByPlayer（AI 跨局摘要）", () => {
    const state = new GameState()

    // 预设：模拟待处理摘要
    state.record.pendingNextRunAiSummaryByPlayer = {
      p1: "上一局AI表现总结"
    }

    // 执行
    state.resetForNewRun()

    // 验证：保留
    expect(state.record.pendingNextRunAiSummaryByPlayer).toEqual({
      p1: "上一局AI表现总结"
    })
  })
})

// ============================================================
// 2. resetForNewRound 后持久化字段保留
// ============================================================
describe("resetForNewRound 后持久化字段保留", () => {
  it("resetForNewRound 不应影响 aiLlmPlayerEnabled", () => {
    const state = new GameState()

    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    state.resetForNewRound()

    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })

  it("resetForNewRound 不应影响 playerMoney", () => {
    const state = new GameState()

    state.game.playerMoney = 5000000

    state.resetForNewRound()

    expect(state.game.playerMoney).toBe(5000000)
  })
})

// ============================================================
// 3. resetAll 后持久化字段保留
// ============================================================
describe("resetAll 后持久化字段保留", () => {
  it("resetAll 后 aiLlmPlayerEnabled 保留", () => {
    const state = new GameState()

    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    state.resetAll()

    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })

  it("resetAll 后 playerMoney 保留", () => {
    const state = new GameState()

    state.game.playerMoney = 5000000

    state.resetAll()

    expect(state.game.playerMoney).toBe(5000000)
  })

  it("resetAll 后 battleRecords 保留", () => {
    const state = new GameState()

    state.record.battleRecords = [{ id: "rec1", round: 5, won: true }]

    state.resetAll()

    expect(state.record.battleRecords).toEqual([{ id: "rec1", round: 5, won: true }])
  })

  it("resetAll 后 aiConversationByPlayer/aiCrossGameMemory 保留", () => {
    const state = new GameState()

    state.ai.aiConversationByPlayer = {
      p1: [{ role: "user", content: "跨局对话", timestamp: 1000 }]
    }
    state.ai.aiCrossGameMemory = {
      p1: [{ summary: "跨局总结", timestamp: 1000 }]
    }

    state.resetAll()

    expect(state.ai.aiConversationByPlayer).toEqual({
      p1: [{ role: "user", content: "跨局对话", timestamp: 1000 }]
    })
    expect(state.ai.aiCrossGameMemory).toEqual({
      p1: [{ summary: "跨局总结", timestamp: 1000 }]
    })
  })
})

// ============================================================
// 4. recordSlice.reset 不清 battleRecords
// ============================================================
describe("recordSlice.reset 保留持久化字段", () => {
  it("recordSlice.reset 应保留 battleRecords", () => {
    const state = new GameState()

    state.record.battleRecords = [{ id: "rec1", round: 5, won: true }]

    // 直接调用 recordSlice.reset（GameState 未暴露，但可通过 resetForNewRun 间接验证）
    // 用 resetForNewRun 触发 recordSlice.reset
    state.resetForNewRun()

    // 验证：battleRecords 保留
    expect(state.record.battleRecords).toEqual([{ id: "rec1", round: 5, won: true }])
  })

  it("recordSlice.reset 应保留 pendingNextRunAiSummaryByPlayer", () => {
    const state = new GameState()

    state.record.pendingNextRunAiSummaryByPlayer = {
      p1: "待处理摘要"
    }

    state.resetForNewRun()

    expect(state.record.pendingNextRunAiSummaryByPlayer).toEqual({
      p1: "待处理摘要"
    })
  })
})

// ============================================================
// 5. 多字段组合保留
// ============================================================
describe("resetForNewRun 多字段组合保留", () => {
  it("应同时保留所有持久化字段，清空瞬态字段", () => {
    const state = new GameState()

    // 预设持久化字段
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }
    state.game.playerMoney = 5000000
    state.record.battleRecords = [{ id: "rec1" }]
    state.ai.aiConversationByPlayer = {
      p1: [{ role: "user", content: "对话", timestamp: 1000 }]
    }
    state.ai.aiCrossGameMemory = {
      p1: [{ summary: "总结", timestamp: 1000 }]
    }

    // 预设瞬态字段（应被清空）
    state.ai.aiPrivateIntel = { p1: { summary: "should-clear", lastUpdated: 1000 } }
    state.ai.aiRoundEffects = { p1: "effect" }
    state.game.round = 99
    state.game.currentBid = 5000
    state.record.pendingSettlementSummary = "应该清空"
    state.warehouse.items = [{ key: "test" } as unknown as never]

    // 执行
    state.resetForNewRun()

    // 验证：持久化字段保留
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
    expect(state.game.playerMoney).toBe(5000000)
    expect(state.record.battleRecords).toEqual([{ id: "rec1" }])
    expect(state.ai.aiConversationByPlayer).toEqual({
      p1: [{ role: "user", content: "对话", timestamp: 1000 }]
    })
    expect(state.ai.aiCrossGameMemory).toEqual({
      p1: [{ summary: "总结", timestamp: 1000 }]
    })

    // 验证：瞬态字段被清空
    const defaultAi = createAiSlice()
    const defaultGame = createGameSlice()
    const defaultRecord = createRecordSlice()
    expect(state.ai.aiPrivateIntel).toEqual(defaultAi.aiPrivateIntel)
    expect(state.ai.aiRoundEffects).toEqual(defaultAi.aiRoundEffects)
    expect(state.game.round).toBe(defaultGame.round)
    expect(state.game.currentBid).toBe(defaultGame.currentBid)
    expect(state.record.pendingSettlementSummary).toBe(defaultRecord.pendingSettlementSummary)
    expect(state.warehouse.items).toEqual([])
  })
})

// ============================================================
// 6. resetLanState 保留持久化字段（showLobbyMain 调用 resetLanState 后不应清 aiLlmPlayerEnabled）
// ============================================================
describe("resetLanState 保留持久化字段", () => {
  it("resetLanState 应保留 aiLlmPlayerEnabled（持久化设置，showLobbyMain 调用 resetLanState 后不清）", () => {
    const state = new GameState()

    // 预设：模拟 LLM 勾选状态
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    // 执行 resetLanState（showLobbyMain 在导航前调用）
    state.resetLanState()

    // 验证：保留，不被清空
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })
})

// ============================================================
// 7. resetLanGameState 保留持久化字段（enterLanRoom 调用 resetLanGameState 后不应清 aiLlmPlayerEnabled）
// ============================================================
describe("resetLanGameState 保留持久化字段", () => {
  it("resetLanGameState 应保留 aiLlmPlayerEnabled（持久化设置，enterLanRoom 调用 resetLanGameState 后不清）", () => {
    const state = new GameState()

    // 预设：模拟 LLM 勾选状态
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    // 执行 resetLanGameState（enterLanRoom 在进入房间前调用）
    state.resetLanGameState()

    // 验证：保留，不被清空
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })
})

// ============================================================
// 8. 组合场景：resetForNewRun + resetLanState 后保留（模拟 startNewRun 流程）
// ============================================================
describe("组合场景 resetForNewRun + resetLanState 保留持久化字段", () => {
  it("resetForNewRun 后 resetLanState 应保留 aiLlmPlayerEnabled", () => {
    const state = new GameState()

    // 预设：模拟 LLM 勾选状态（持久化设置）
    state.ai.aiLlmPlayerEnabled = { p1: true, p3: false }

    // 执行 startNewRun 的两个核心步骤（先 resetLanState 再 resetForNewRun）
    state.resetLanState()
    state.resetForNewRun()

    // 验证：持久化设置跨两个 reset 保留
    expect(state.ai.aiLlmPlayerEnabled).toEqual({ p1: true, p3: false })
  })
})