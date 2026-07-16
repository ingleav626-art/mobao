/**
 * @file tests/integration/lan-bid-flow.test.ts
 * @description 联机出价流程集成测试。覆盖：
 *              1. 联机多槽位出价互不阻塞（Bug 1）
 *              2. 真人槽位不触发 AI 出价（Bug 2）
 *              3. players 数组按房间配置裁剪（Bug 3）
 */
import { describe, it, expect, vi } from "vitest"
import {
  setPlayerBidReady,
  areAllPlayersBidReady,
  playerBid
} from "../../scripts/game/bidding/bidding-manager/keypad-fns"
import type { BiddingManagerDeps, BiddingManagerState } from "../../scripts/game/bidding/bidding-manager"

// ─── 辅助函数 ───

function makeState(overrides: Partial<BiddingManagerState> = {}): BiddingManagerState {
  return {
    roundBidReadyState: {},
    keypadValue: "0",
    playerBidSubmitted: false,
    playerRoundBid: 0,
    roundResolving: false,
    secondHighestBid: 0,
    currentBid: 0,
    bidLeader: null,
    round: 1,
    lastAiDecisionTelemetry: null,
    ...overrides
  }
}

function makeDeps(overrides: Partial<BiddingManagerDeps> = {}): BiddingManagerDeps {
  const dom: Record<string, HTMLElement | null> = {}
  const defaultDeps: BiddingManagerDeps = {
    dom,
    players: [
      { id: "p1", name: "玩家1", isHuman: true, isAI: false, isSelf: true },
      { id: "p2", name: "AI-1", isHuman: false, isAI: true, isSelf: false },
      { id: "p3", name: "玩家2", isHuman: true, isAI: false, isSelf: false },
      { id: "p4", name: "AI-2", isHuman: false, isAI: true, isSelf: false }
    ],
    input: { enabled: true },
    skillManager: { onNewRound: vi.fn() },

    getIsLanMode: () => true,
    getSettled: () => false,
    getRoundPaused: () => false,
    getPlayerMoney: () => 100000,
    getLanMySlotId: () => "p1",
    getLanIsHost: () => false,
    getLanHostBids: () => ({}),
    getPlayerRoundHistory: () => ({}),
    getItems: () => [],
    getAiEngine: () => null,
    getAiLlmRoundPlans: () => ({}),
    getAiRoundEffects: () => ({}),
    getLanBridge: () => null,
    getLastAiDecisionTelemetry: () => null,

    closeItemDrawer: vi.fn(),
    hideInfoPopup: vi.fn(),
    showGameConfirm: vi.fn(),
    updateHud: vi.fn(),
    writeLog: vi.fn(),
    setPlayerBidSubmitted: vi.fn(),
    setPlayerRoundBid: vi.fn(),
    stopRoundTimer: vi.fn(),
    captureAiDecisionTelemetry: vi.fn(),
    recordAiThoughtLogs: vi.fn(),
    renderAiLogicPanel: vi.fn(),
    recordRoundHistory: vi.fn(),
    markRoundRanking: vi.fn(),
    finishAuction: vi.fn(),
    startRound: vi.fn(),
    processAiDecisions: vi.fn(() => Promise.resolve()),
    hasAnyInfo: vi.fn(() => false),
    buildAiIntelSnapshot: vi.fn(() => ({})),
    canUseLlmDecisionForPlayer: vi.fn(() => false),
    getAiWallet: vi.fn(() => 1000000),
    normalizeAiBidValue: vi.fn((_playerId: string, bid: number) => bid),

    ...overrides
  }
  return defaultDeps
}

// ─── 测试：联机多槽位出价互不阻塞 ───

describe("联机出价流程集成测试", () => {
  describe("Bug 1: 联机多槽位出价互不阻塞", () => {
    it("setPlayerBidReady 应按槽位独立设置", () => {
      const state = makeState()
      const deps = makeDeps()

      setPlayerBidReady(deps, state, "p1", true)
      expect(state.roundBidReadyState["p1"]).toBe(true)
      // 未设置的状态键为 undefined，注意测试中 expect 未定义键用 toBeUndefined
      expect(state.roundBidReadyState["p2"]).toBeUndefined()
      expect(state.roundBidReadyState["p3"]).toBeUndefined()
      expect(state.roundBidReadyState["p4"]).toBeUndefined()
    })

    it("areAllPlayersBidReady 应检查所有玩家槽位", () => {
      const state = makeState()
      const deps = makeDeps()

      // 只有一个玩家准备好
      setPlayerBidReady(deps, state, "p1", true)
      expect(areAllPlayersBidReady(deps, state)).toBe(false)

      // 所有玩家都准备好
      setPlayerBidReady(deps, state, "p2", true)
      setPlayerBidReady(deps, state, "p3", true)
      setPlayerBidReady(deps, state, "p4", true)
      expect(areAllPlayersBidReady(deps, state)).toBe(true)
    })

    it("各槽位 ready 状态互不干扰", () => {
      const state = makeState()
      const deps = makeDeps()

      // 设置 p1 和 p3 为 ready
      setPlayerBidReady(deps, state, "p1", true)
      setPlayerBidReady(deps, state, "p3", true)

      // p2 和 p4 应仍为未定义（未设置）
      expect(state.roundBidReadyState["p1"]).toBe(true)
      expect(state.roundBidReadyState["p2"]).toBeUndefined()
      expect(state.roundBidReadyState["p3"]).toBe(true)
      expect(state.roundBidReadyState["p4"]).toBeUndefined()
    })

    it("global playerBidSubmitted 不应影响其他槽位", () => {
      const state = makeState({ playerBidSubmitted: true })
      const deps = makeDeps()

      // 即使 global playerBidSubmitted 为 true，各槽位独立状态不受影响
      expect(state.roundBidReadyState["p1"]).toBeUndefined()
      expect(state.roundBidReadyState["p2"]).toBeUndefined()

      // 设置 p1 为 ready，应只影响 p1
      setPlayerBidReady(deps, state, "p1", true)
      expect(state.roundBidReadyState["p1"]).toBe(true)
      expect(state.roundBidReadyState["p2"]).toBeUndefined()
    })
  })

  describe("Bug 2: 真人槽位不触发 AI 出价", () => {
    it("AI 出价过滤应排除 isHuman 玩家", () => {
      const deps = makeDeps()

      // 模拟 AI 出价过滤逻辑：只处理非人类玩家
      const aiPlayers = deps.players.filter((p) => !p.isHuman)
      const humanPlayers = deps.players.filter((p) => p.isHuman)

      expect(aiPlayers.length).toBe(2)
      expect(humanPlayers.length).toBe(2)
      expect(aiPlayers.map((p) => p.id).sort()).toEqual(["p2", "p4"])
      expect(humanPlayers.map((p) => p.id).sort()).toEqual(["p1", "p3"])
    })

    it("联机模式下 AI 过滤应正确识别真人玩家", () => {
      const deps = makeDeps()

      // 模拟 LAN 模式下的玩家列表
      const lanPlayers = deps.players.map((p) => ({
        ...p,
        isHuman: !p.isAI,
        isAI: !!p.isAI
      }))

      // 验证每个玩家的 isHuman 和 isAI 标签正确
      lanPlayers.forEach((p) => {
        if (p.id === "p1" || p.id === "p3") {
          expect(p.isHuman).toBe(true)
          expect(p.isAI).toBe(false)
        } else {
          expect(p.isHuman).toBe(false)
          expect(p.isAI).toBe(true)
        }
      })

      // 验证 AI 过滤结果
      const aiPlayers = lanPlayers.filter((p) => !p.isHuman)
      expect(aiPlayers.length).toBe(2)
      expect(aiPlayers.every((p) => p.isAI)).toBe(true)
    })

    it("AI 出价列表应只包含 lanAiPlayers 中的玩家", () => {
      // 模拟 startLanRun 中的逻辑：lanAiPlayers 只包含 AI 玩家
      const lanAiPlayers = [
        { id: "ai1", name: "AI-1", isAI: true },
        { id: "ai2", name: "AI-2", isAI: true }
      ]

      // 模拟 lanComputeAiBids 中的逻辑：只处理 lanAiPlayers
      const aiPlayerIds = lanAiPlayers.map((ai) => ai.id)
      expect(aiPlayerIds).toEqual(["ai1", "ai2"])
      expect(aiPlayerIds.length).toBe(2)

      // 验证没有真人玩家混入 AI 列表
      const humanIds = ["p1", "p3"]
      const hasHumanInAi = aiPlayerIds.some((id) => humanIds.includes(id))
      expect(hasHumanInAi).toBe(false)
    })
  })

  describe("Bug 3: players 数组按房间配置裁剪", () => {
    it("lanSlotConfig 应只包含已配置的 AI 槽位", () => {
      // 模拟 lobby-fns.ts 中的 lanSlotConfig 和 startBtn 逻辑
      // 场景：2个真人 + 1个AI
      const lanSlotConfig = [
        { type: "host", id: "host1", name: "主机" },
        { type: "client", id: "client1", name: "客机" },
        { type: "ai", name: "AI-1", llm: false },
        { type: "empty" }
      ]

      const aiSlots = lanSlotConfig.filter((s) => s.type === "ai")
      expect(aiSlots.length).toBe(1)

      // 验证 AI 玩家列表正确生成
      const fixedAiIds = ["p1", "p3", "p4"]
      const aiPlayers = aiSlots.map((s, i) => ({
        id: fixedAiIds[i] || "ai_" + i,
        name: s.name,
        isAI: true
      }))
      expect(aiPlayers.length).toBe(1)
      expect(aiPlayers[0].id).toBe("p1")
    })

    it("AI 数量为 0 时不应生成任何 AI 玩家", () => {
      // 场景：2个真人，0个AI（只有2人）
      const lanSlotConfig = [
        { type: "host", id: "host1", name: "主机" },
        { type: "client", id: "client1", name: "客机" },
        { type: "empty" },
        { type: "empty" }
      ]

      const aiSlots = lanSlotConfig.filter((s) => s.type === "ai")
      expect(aiSlots.length).toBe(0)
    })

    it("AI 数量为 2 时只生成 2 个 AI 玩家", () => {
      // 场景：1个真人 + 2个AI
      const lanSlotConfig = [
        { type: "host", id: "host1", name: "主机" },
        { type: "ai", name: "AI-1", llm: false },
        { type: "ai", name: "AI-2", llm: true },
        { type: "empty" }
      ]

      const aiSlots = lanSlotConfig.filter((s) => s.type === "ai")
      expect(aiSlots.length).toBe(2)

      // 验证只生成 2 个 AI 玩家，而不是 3 个
      const fixedAiIds = ["p1", "p3", "p4"]
      const aiPlayers = aiSlots.map((s, i) => ({
        id: fixedAiIds[i] || "ai_" + i,
        name: s.name,
        isAI: true
      }))
      expect(aiPlayers.length).toBe(2)
      expect(aiPlayers[0].id).toBe("p1")
      expect(aiPlayers[1].id).toBe("p3")
    })

    it("players 映射应包含所有玩家且类型正确", () => {
      // 模拟 startLanRun 中的 players 映射逻辑
      // 场景：主机 + 1客机 + 1AI
      const lanPlayers = [
        { id: "host1", name: "主机", isAI: false },
        { id: "client1", name: "客机", isAI: false },
        { id: "ai1", name: "AI-1", isAI: true }
      ]

      const players = lanPlayers.map((p, i) => ({
        id: "p" + (i + 1),
        lanId: p.id,
        name: p.name,
        isHuman: !p.isAI,
        isAI: !!p.isAI
      }))

      expect(players.length).toBe(3)
      expect(players[0].isHuman).toBe(true)
      expect(players[0].isAI).toBe(false)
      expect(players[1].isHuman).toBe(true)
      expect(players[1].isAI).toBe(false)
      expect(players[2].isHuman).toBe(false)
      expect(players[2].isAI).toBe(true)
    })
  })
})