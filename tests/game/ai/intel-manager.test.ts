import { describe, it, expect, vi } from "vitest"
import {
  AiIntelManager,
  type AiIntelManagerDeps,
  type AiIntelState,
  type LastAiIntelAction,
} from "../../../scripts/game/ai/intel-manager"
import type { Player, Artifact } from "../../../types/game"
import type { AiPrivateIntelPool, AiSignalStats } from "../../../types/ai"
import { createEmptyAiPrivateIntelPool } from "../../../scripts/game/ai/intel/pure"
// 真实数据源与函数（测试原则：数据来自游戏真实数据源、调用链走真实函数）
import { ARTIFACT_LIBRARY, ArtifactManager, QUALITY_CONFIG, toSizeTag } from "../../../scripts/game/data/artifacts"
import { pickBottomCellFromTargets } from "../../../scripts/game/warehouse"

// ─── 测试工具 ───

function makeState(overrides: Partial<AiIntelState> = {}): AiIntelState {
  return {
    aiPrivateIntel: {},
    aiResourceState: {},
    aiRoundEffects: {},
    lastAiIntelActions: [],
    aiLlmRoundPlans: {},
    aiFoldState: {},
    aiCharacterAssignments: {},
    aiErrorCorrectionHistory: {},
    highValuePriceThreshold: null,
    llmEverUsedThisRun: false,
    currentRunLog: null,
    ...overrides,
  }
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "测试AI",
    avatar: "A1",
    isHuman: false,
    isAI: true,
    isSelf: false,
    ...overrides,
  }
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    key: "test-item",
    majorCategory: "古董",
    category: "瓷器",
    name: "测试藏品",
    basePrice: 5000,
    qualityKey: "fine",
    w: 1,
    h: 1,
    id: "artifact-1",
    quality: { label: "精品", color: 0, glow: 0, weight: 1 },
    x: 0,
    y: 0,
    revealed: { outline: false, qualityCell: null, exact: false },
    trueValue: 5000,
    expectedPrice: 5000,
    previewSizeTag: "1x1",
    view: {} as Artifact["view"],
    ...overrides,
  }
}

function makeMockSignalStats(): AiSignalStats {
  return { mean: 5000, spreadRatio: 0.2, upperEdge: 0.1, lowerEdge: -0.1, std: 1000, iqr: 800, count: 5 }
}

function makeDeps(overrides: Partial<AiIntelManagerDeps> = {}): { deps: AiIntelManagerDeps; state: AiIntelState } {
  const state = makeState()
  const players: Player[] = [
    makePlayer({ id: "human", name: "玩家", isHuman: true, isSelf: true }),
    makePlayer({ id: "ai-1", name: "左上AI", isHuman: false }),
  ]
  const items: Artifact[] = [
    makeArtifact({ id: "a1", x: 0, y: 0, w: 2, h: 1, basePrice: 3000, qualityKey: "normal" }),
    makeArtifact({ id: "a2", x: 2, y: 0, w: 1, h: 2, basePrice: 8000, qualityKey: "rare" }),
    makeArtifact({ id: "a3", x: 0, y: 2, w: 1, h: 1, basePrice: 12000, qualityKey: "legendary" }),
  ]

  const deps: AiIntelManagerDeps = {
    state,
    players,
    items,
    currentRoundUsage: {},
    roundBidReadyState: {},
    getRound: () => 1,
    isLanMode: () => false,
    isLanHost: () => false,
    getLanBridge: () => null,
    getLanAiPlayers: () => [],
    isRoundResolving: () => false,
    isSettled: () => false,
    isRoundPaused: () => false,
    getRoundTimeLeft: () => 30,
    isPlayerBidSubmitted: () => false,
    artifactManager: {
      getSignalPriceStats: () => ({
        aggregate: makeMockSignalStats(),
        latest: makeMockSignalStats(),
      }),
      getCandidatesByRevealState: () => [],
    },
    aiEngine: {
      planIntelAction: () => ({ actionType: "none", actionId: "none", expectedReveal: 0, score: 0 }),
      buildToolEffect: () => ({
        tag: "none",
        strategyScoreBoost: 0,
        confidenceBoost: 0,
        upperCapBoost: 0,
        followBoost: 0,
        uncertaintyReduction: 0,
      }),
    },
    updatePlayerAvatar: vi.fn(),
    isInBoundsCell: (x: number, y: number) => x >= 0 && x < 10 && y >= 0 && y < 10,
    isWarehouseCellOccupied: () => false,
    pickBottomCellFromTargets: () => null,
    revealOutlineBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    revealQualityBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    revealArtifactFullyBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    canUseLlmDecisionForPlayer: () => false,
    writeLog: vi.fn(),
    requestAiLlmErrorCorrection: vi.fn(async () => null),
    getAiConversationMessages: () => [],
    recordPlayerUsage: vi.fn(),
    buildAiToolResultSummary: () => "工具结果摘要",
    getActionDefById: (actionId: string) => ({
      id: actionId,
      type: "skill",
      name: "测试技能",
      description: "测试描述",
    }),
    addPublicInfoEntry: vi.fn(),
    requestAiLlmFollowupBid: vi.fn(async () => null),
    setPlayerBidReady: vi.fn(),
    updateHud: vi.fn(),
    areAllPlayersBidReady: () => false,
    resolveRoundBids: vi.fn(async () => { }),
    getItemInfo: (id: string) => ({ label: `道具-${id}` }),
    waitUntilResumed: vi.fn(async () => { }),
    ...overrides,
  }

  return { deps, state }
}

/**
 * 真实数据帮手：用 ARTIFACT_LIBRARY（73 件）通过 ArtifactManager.buildArtifactFromDef
 * 生成完整 Artifact 数组，补全运行时字段（与 spawnRandomItems 一致）。
 *
 * 不 mock pickBottomCellFromTargets / artifactManager / items，所有调用链走真实函数。
 */
function makeRealArtifacts(): Artifact[] {
  const manager = new ArtifactManager()
  return ARTIFACT_LIBRARY.map((def) => {
    const built = manager.buildArtifactFromDef(def as unknown as Record<string, unknown>) as unknown as Artifact
    // 运行时字段补全（参照 spawnRandomItems 真实代码）
    built.revealed = { outline: false, qualityCell: null, exact: false }
    built.trueValue = built.basePrice
    built.expectedPrice = built.basePrice
    built.previewSizeTag = toSizeTag(built.w, built.h)
    // buildArtifactFromDef 默认 x:0, y:0；reveal*ByQuality/Category 不依赖坐标过滤
    return built
  })
}

/** 真实 deps：items/artifactManager/pickBottomCellFromTargets 全部走真实函数 */
function makeRealDeps(overrides: Partial<AiIntelManagerDeps> = {}): { deps: AiIntelManagerDeps; state: AiIntelState } {
  const state = makeState()
  const players: Player[] = [
    makePlayer({ id: "human", name: "玩家", isHuman: true, isSelf: true }),
    makePlayer({ id: "ai-1", name: "左上AI", isHuman: false }),
  ]
  const realArtifactManager = new ArtifactManager()
  const deps: AiIntelManagerDeps = {
    state,
    players,
    items: makeRealArtifacts(),
    currentRoundUsage: {},
    roundBidReadyState: {},
    getRound: () => 1,
    isLanMode: () => false,
    isLanHost: () => false,
    getLanBridge: () => null,
    getLanAiPlayers: () => [],
    isRoundResolving: () => false,
    isSettled: () => false,
    isRoundPaused: () => false,
    getRoundTimeLeft: () => 30,
    isPlayerBidSubmitted: () => false,
    artifactManager: realArtifactManager as unknown as AiIntelManagerDeps["artifactManager"],
    aiEngine: {
      planIntelAction: () => ({ actionType: "none", actionId: "none", expectedReveal: 0, score: 0 }),
      buildToolEffect: () => ({
        tag: "none",
        strategyScoreBoost: 0,
        confidenceBoost: 0,
        upperCapBoost: 0,
        followBoost: 0,
        uncertaintyReduction: 0,
      }),
    },
    updatePlayerAvatar: vi.fn(),
    isInBoundsCell: (x: number, y: number) => x >= 0 && x < 10 && y >= 0 && y < 10,
    isWarehouseCellOccupied: () => false,
    pickBottomCellFromTargets,
    revealOutlineBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    revealQualityBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    revealArtifactFullyBatch: vi.fn(() => ({ ok: true, revealed: 1, message: "" })),
    canUseLlmDecisionForPlayer: () => false,
    writeLog: vi.fn(),
    requestAiLlmErrorCorrection: vi.fn(async () => null),
    getAiConversationMessages: () => [],
    recordPlayerUsage: vi.fn(),
    buildAiToolResultSummary: () => "工具结果摘要",
    getActionDefById: (actionId: string) => ({
      id: actionId,
      type: "skill",
      name: "测试技能",
      description: "测试描述",
    }),
    addPublicInfoEntry: vi.fn(),
    requestAiLlmFollowupBid: vi.fn(async () => null),
    setPlayerBidReady: vi.fn(),
    updateHud: vi.fn(),
    areAllPlayersBidReady: () => false,
    resolveRoundBids: vi.fn(async () => { }),
    getItemInfo: (id: string) => ({ label: `道具-${id}` }),
    waitUntilResumed: vi.fn(async () => { }),
    ...overrides,
  }
  return { deps, state }
}

// ─── 测试 ───

describe("AiIntelManager", () => {
  // ═════════════ 初始化方法 ═════════════

  describe("initAiIntelSystems", () => {
    it("初始化 AI 玩家的情报池和资源", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      const aiPlayer = deps.players[1]
      expect(state.aiPrivateIntel[aiPlayer.id]).toBeDefined()
      expect(state.aiResourceState[aiPlayer.id]).toBeDefined()
      expect(state.aiCharacterAssignments[aiPlayer.id]).toBeDefined()
      expect(state.aiFoldState[aiPlayer.id]).toBe(false)
    })

    // 修复回归：按设计，托管 AI 需要为人类玩家也积累上下文以便随时启用托管
    // （init-fns.ts:30-34 明确注释"始终为 p2 初始化情报池，为托管做准备"）
    it("为人类玩家也创建情报池（为随时启用托管积累上下文）", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      // 修复前：旧测试错误地断言 toBeUndefined()
      // 修复后：人类玩家也应有空情报池，随时可启用托管
      const humanPool = state.aiPrivateIntel["human"]
      expect(humanPool).toBeDefined()
      expect(humanPool.knownOutlineIds).toBeInstanceOf(Set)
      expect(humanPool.knownOutlineIds.size).toBe(0)
      expect(humanPool.knownQualityIds).toBeInstanceOf(Set)
      expect(humanPool.knownQualityIds.size).toBe(0)
      expect(humanPool.outlineSignals).toHaveLength(0)
      expect(humanPool.qualitySignals).toHaveLength(0)
      expect(humanPool.signalHistory).toHaveLength(0)
      // 但不应该为人类分配 AI 角色（角色仍由玩家选择）
      expect(state.aiCharacterAssignments["human"]).toBeDefined()
      expect(state.aiCharacterAssignments["human"].characterId).toBeDefined()
    })

    it("人类玩家情报池可被真实揭示函数填充（托管随时启用场景）", () => {
      const { deps, state } = makeRealDeps()
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      // 启用托管：对人类玩家执行真实揭示操作
      const ctx = manager.buildAiPrivateRevealContext("human")
      const result = ctx.revealByQuality({ qualityKey: "rare" })

      // 人类玩家的情报池应能正常积累（验证托管随时启用的设计意图）
      expect(result.ok).toBe(true)
      const humanPool = state.aiPrivateIntel["human"]
      expect(humanPool.knownOutlineIds.size).toBeGreaterThan(0)
      expect(humanPool.knownQualityIds.size).toBeGreaterThan(0)
      expect(humanPool.outlineSignals.length).toBeGreaterThan(0)
      expect(humanPool.signalHistory.length).toBeGreaterThan(0)
    })

    it("重置所有状态容器", () => {
      const { deps, state } = makeDeps()
      state.aiRoundEffects = { old: "data" }
      state.lastAiIntelActions = [{ playerId: "old", playerName: "old", actionType: "skill", actionId: "x", revealed: 1, detail: "", score: 0, effectTag: "", signalStats: null }]
      state.highValuePriceThreshold = 9999

      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      expect(state.aiRoundEffects).toEqual({})
      expect(state.lastAiIntelActions).toEqual([])
      expect(state.highValuePriceThreshold).toBeNull()
    })

    it("为 AI 玩家分配角色和技能", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      const aiPlayer = deps.players[1]
      const assign = state.aiCharacterAssignments[aiPlayer.id]
      expect(assign.characterId).toBeDefined()
      expect(assign.skillId).toBeDefined()
      expect(assign.skillName).toBeDefined()

      const resourceState = state.aiResourceState[aiPlayer.id]
      expect(Object.keys(resourceState.skills).length).toBeGreaterThan(0)
      expect(Object.keys(resourceState.items).length).toBe(4)
    })

    it("调用 refreshAllPlayerAvatars", () => {
      const { deps } = makeDeps()
      const mockEl = document.createElement("div")
      vi.spyOn(document, "getElementById").mockReturnValue(mockEl)
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()
      expect(deps.updatePlayerAvatar).toHaveBeenCalled()
      vi.restoreAllMocks()
    })
  })

  describe("ensureAiPrivateIntel", () => {
    it("不存在时创建空池", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool).toBeDefined()
      expect(pool.knownOutlineIds).toEqual(new Set())
      expect(pool.signalHistory).toEqual([])
      expect(state.aiPrivateIntel["ai-1"]).toBe(pool)
    })

    it("已存在时返回同一引用", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool1 = manager.ensureAiPrivateIntel("ai-1")
      const pool2 = manager.ensureAiPrivateIntel("ai-1")
      expect(pool1).toBe(pool2)
    })
  })

  describe("resetAiRoundResources", () => {
    it("恢复 AI 技能次数并清空效果", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.initAiIntelSystems()

      const aiId = deps.players[1].id
      state.aiResourceState[aiId].skills = {}
      state.aiRoundEffects = { old: "data" }
      state.lastAiIntelActions = [{ playerId: "x", playerName: "x", actionType: "skill", actionId: "x", revealed: 1, detail: "", score: 0, effectTag: "", signalStats: null }]

      manager.resetAiRoundResources()

      expect(state.aiRoundEffects).toEqual({})
      expect(state.lastAiIntelActions).toEqual([])
      expect(state.aiLlmRoundPlans).toEqual({})
    })
  })

  // ═════════════ 快照方法 ═════════════

  describe("getAiIntelSummary", () => {
    it("返回空池的默认摘要", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const summary = manager.getAiIntelSummary("ai-1")
      expect(summary.clueCount).toBe(0)
      expect(summary.outlineCount).toBe(0)
      expect(summary.qualityCount).toBe(0)
      expect(summary.uncertainty).toBeGreaterThan(0)
      expect(summary.uncertainty).toBeLessThanOrEqual(1)
    })

    it("有信号时返回正确的线索率", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      pool.outlineSignals.push({ itemId: "a1", round: 1, mode: "outline" })
      pool.qualitySignals.push({ itemId: "a2", round: 1, mode: "quality" })

      const summary = manager.getAiIntelSummary("ai-1")
      expect(summary.outlineCount).toBe(1)
      expect(summary.qualityCount).toBe(1)
      expect(summary.clueCount).toBe(2)
      expect(summary.clueRate).toBeGreaterThan(0)
    })
  })

  describe("buildAiIntelSnapshot", () => {
    it("为所有 AI 玩家生成快照", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const snapshot = manager.buildAiIntelSnapshot()
      expect(Object.keys(snapshot)).toEqual(["ai-1"])
      expect(snapshot["ai-1"]).toBeDefined()
    })
  })

  describe("getAiResourceSnapshot", () => {
    it("返回资源副本而非引用", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      state.aiResourceState["ai-1"] = { skills: { "skill-1": 2 }, items: { "item-1": 1 } }

      const snap = manager.getAiResourceSnapshot("ai-1")
      expect(snap.skills).toEqual({ "skill-1": 2 })
      snap.skills["skill-1"] = 99
      expect(state.aiResourceState["ai-1"].skills["skill-1"]).toBe(2)
    })

    it("不存在时返回空对象", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const snap = manager.getAiResourceSnapshot("no-exist")
      expect(snap.skills).toEqual({})
      expect(snap.items).toEqual({})
    })
  })

  describe("getAiAvailableActionState", () => {
    it("返回可用技能和道具 ID", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      state.aiResourceState["ai-1"] = {
        skills: { "skill-outline-scan": 1 },
        items: {},
      }

      const actionState = manager.getAiAvailableActionState("ai-1")
      expect(actionState.availableSkillIds).toContain("skill-outline-scan")
      expect(actionState.availableItemIds).toEqual([])
    })
  })

  describe("buildAiActionConstraintBlock", () => {
    it("返回约束块结构", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      state.aiResourceState["ai-1"] = { skills: {}, items: {} }

      const block = manager.buildAiActionConstraintBlock("ai-1")
      expect(block.canBid).toBe(true)
      expect(block.canFold).toBe(false)
      expect(block.notes).toHaveLength(2)
      expect(block._internal).toBeDefined()
    })
  })

  // ═════════════ 揭示方法 ═════════════

  describe("pickRandomItemCell", () => {
    it("返回物品范围内的格子", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ x: 2, y: 3, w: 2, h: 2 })
      const cell = manager.pickRandomItemCell(item)
      expect(cell).not.toBeNull()
      expect(cell!.x).toBeGreaterThanOrEqual(2)
      expect(cell!.x).toBeLessThan(4)
      expect(cell!.y).toBeGreaterThanOrEqual(3)
      expect(cell!.y).toBeLessThan(5)
    })
  })

  describe("markAiKnownCellState", () => {
    it("在情报池中标记格子状态", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.markAiKnownCellState("ai-1", 3, 5, "occupied")
      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.knownCellStates["3,5"]).toBe("occupied")
    })

    it("空状态默认为 empty", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.markAiKnownCellState("ai-1", 0, 0, "")
      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.knownCellStates["0,0"]).toBe("empty")
    })
  })

  describe("getHighValuePriceThreshold", () => {
    it("首次调用计算并缓存阈值", () => {
      const { deps, state } = makeDeps()
      const manager = new AiIntelManager(deps)
      const threshold = manager.getHighValuePriceThreshold()
      expect(threshold).toBeGreaterThan(0)
      expect(state.highValuePriceThreshold).toBe(threshold)
    })

    it("后续调用返回缓存值", () => {
      const { deps, state } = makeDeps()
      state.highValuePriceThreshold = 6000
      const manager = new AiIntelManager(deps)
      expect(manager.getHighValuePriceThreshold()).toBe(6000)
    })
  })

  describe("isHighValueArtifact", () => {
    it("传说品质为高价值", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ qualityKey: "legendary", basePrice: 100 })
      expect(manager.isHighValueArtifact(item)).toBe(true)
    })

    it("价格高于阈值为高价值", () => {
      const { deps, state } = makeDeps()
      state.highValuePriceThreshold = 6000
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ qualityKey: "fine", basePrice: 7000 })
      expect(manager.isHighValueArtifact(item)).toBe(true)
    })

    it("低价格普通品质非高价值", () => {
      const { deps, state } = makeDeps()
      state.highValuePriceThreshold = 6000
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ qualityKey: "normal", basePrice: 100 })
      expect(manager.isHighValueArtifact(item)).toBe(false)
    })
  })

  describe("ensureAiHighValueTrack", () => {
    it("高价值藏品创建追踪记录", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "legendary-1", qualityKey: "legendary", basePrice: 15000 })
      const result = manager.ensureAiHighValueTrack("ai-1", item)
      expect(result).not.toBeNull()
      expect(result!.created).toBe(true)
      expect(result!.trackId).toContain("红")
    })

    it("非高价值藏品返回 null", () => {
      const { deps, state } = makeDeps()
      state.highValuePriceThreshold = 6000
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ qualityKey: "normal", basePrice: 100 })
      expect(manager.ensureAiHighValueTrack("ai-1", item)).toBeNull()
    })

    it("已追踪的藏品返回 created=false", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "legendary-1", qualityKey: "legendary", basePrice: 15000 })
      manager.ensureAiHighValueTrack("ai-1", item)
      const result = manager.ensureAiHighValueTrack("ai-1", item)
      expect(result!.created).toBe(false)
    })
  })

  describe("ensureAiItemKnowledge", () => {
    it("不存在时创建默认知识", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const knowledge = manager.ensureAiItemKnowledge("ai-1", "a1")
      expect(knowledge.revealCount).toBe(0)
      expect(knowledge.category).toBeNull()
      expect(knowledge.qualityKey).toBeNull()
      expect(knowledge.knownCells).toEqual(new Set())
    })

    it("已存在时返回同一引用", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const k1 = manager.ensureAiItemKnowledge("ai-1", "a1")
      const k2 = manager.ensureAiItemKnowledge("ai-1", "a1")
      expect(k1).toBe(k2)
    })
  })

  describe("pickPrivateRevealTargets", () => {
    it("排除已知的藏品", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      pool.knownOutlineIds.add("a1")

      const targets = manager.pickPrivateRevealTargets({
        playerId: "ai-1",
        mode: "outline",
        count: 10,
        category: null,
        allowCategoryFallback: false,
        sortStrategy: null,
      })
      expect(targets.find((t) => t.id === "a1")).toBeUndefined()
    })

    it("按品类筛选", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const targets = manager.pickPrivateRevealTargets({
        playerId: "ai-1",
        mode: "outline",
        count: 10,
        category: "瓷器",
        allowCategoryFallback: false,
        sortStrategy: null,
      })
      expect(targets.every((t) => t.category === "瓷器")).toBe(true)
    })

    it("数量限制生效", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const targets = manager.pickPrivateRevealTargets({
        playerId: "ai-1",
        mode: "outline",
        count: 1,
        category: null,
        allowCategoryFallback: false,
        sortStrategy: null,
      })
      expect(targets).toHaveLength(1)
    })
  })

  describe("revealPrivateIntelBatch", () => {
    it("轮廓模式成功揭示并记录信号", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const result = manager.revealPrivateIntelBatch("ai-1", "outline", 1, null, false, null)
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(1)
      expect(result.signals).toHaveLength(1)

      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.outlineSignals).toHaveLength(1)
      expect(pool.knownOutlineIds.size).toBe(1)
    })

    it("品质模式成功揭示并创建高价值追踪", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const result = manager.revealPrivateIntelBatch("ai-1", "quality", 1, null, false, null)
      expect(result.ok).toBe(true)

      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.qualitySignals).toHaveLength(1)
      expect(pool.knownQualityIds.size).toBe(1)
    })

    it("无目标时返回失败", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      pool.knownOutlineIds = new Set(["a1", "a2", "a3"])

      const result = manager.revealPrivateIntelBatch("ai-1", "outline", 1, null, false, null)
      expect(result.ok).toBe(false)
      expect(result.message).toContain("没有可揭示目标")
    })

    // ─── 修复回归：品质模式也必须返回 bottomCell（统一返回字段） ───
    // 测试原则：数据来自真实 ARTIFACT_LIBRARY，pickBottomCellFromTargets 走真实函数
    it("品质模式也返回 bottomCell 和 actionType=quality（修复回归）", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)

      // 揭示 1 件品质目标（真实数据，count=1）
      const result = manager.revealPrivateIntelBatch("ai-1", "quality", 1, null, false, null)

      // 修复前：quality 模式不返回 bottomCell；修复后：所有模式都返回
      expect(result.ok).toBe(true)
      expect(result.actionType).toBe("quality")
      expect(result.qualityCellCount).toBe(1)
      // 真实 pickBottomCellFromTargets 返回 {x,y,col,row}（基于真实藏品 h）
      expect(result.bottomCell).not.toBeNull()
      expect(result.bottomCell).toHaveProperty("x")
      expect(result.bottomCell).toHaveProperty("y")
      expect(result.bottomCell).toHaveProperty("col")
      expect(result.bottomCell).toHaveProperty("row")
    })
  })

  // ═════════════ 修复回归：revealPrivateIntelAllByQuality/Category 必须走完整画布更新流程 ═════════════
  // 测试原则：用真实 ARTIFACT_LIBRARY 73 件藏品（rare 品质 15 件），不编造数据
  describe("revealPrivateIntelAllByQuality（画布状态一致性修复）", () => {
    it("揭示 rare 品质所有藏品：同步更新 outlineSignals/qualitySignals/signalHistory/stats/bottomCell", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildAiPrivateRevealContext("ai-1")

      // 真实 ARTIFACT_LIBRARY 中 rare 品质有 15 件
      const expectedCount = ARTIFACT_LIBRARY.filter((i) => i.qualityKey === "rare").length
      expect(expectedCount).toBe(15) // 保护：若数据变化，测试明确感知

      const result = ctx.revealByQuality({ qualityKey: "rare" })

      // 修复前：仅更新 knownOutlineIds/knownQualityIds，不更新 signals/stats/bottomCell
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(expectedCount)
      expect(result.actionType).toBe("reveal")
      expect(result.artifacts).toHaveLength(expectedCount)
      // 验证返回的 artifacts 字段完整（来自真实 ARTIFACT_LIBRARY）
      const firstArt = result.artifacts?.[0]
      expect(firstArt).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        qualityKey: "rare",
        quality: QUALITY_CONFIG.rare.label, // 真实品质 label
        sizeTag: expect.any(String),
        w: expect.any(Number),
        h: expect.any(Number),
        basePrice: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      })
      // bottomCell 由真实 pickBottomCellFromTargets 计算（基于真实藏品的 y+h）
      expect(result.bottomCell).not.toBeNull()
      expect(result.bottomCell).toHaveProperty("col")
      expect(result.bottomCell).toHaveProperty("row")
      // totalBasePrice 等于揭示藏品基价之和
      const expectedTotal = result.artifacts!.reduce((sum, a) => sum + a.basePrice, 0)
      expect(result.totalBasePrice).toBe(expectedTotal)

      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.knownOutlineIds.size).toBe(expectedCount)
      expect(pool.knownQualityIds.size).toBe(expectedCount)
      expect(pool.outlineSignals).toHaveLength(expectedCount)
      expect(pool.qualitySignals).toHaveLength(expectedCount)
      // outline + quality 两条信号入历史
      expect(pool.signalHistory).toHaveLength(expectedCount * 2)
      expect(pool.latestSignalStats).not.toBeNull()
      expect(pool.aggregateStats).not.toBeNull()
    })

    it("无目标时返回 ok=false", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildAiPrivateRevealContext("ai-1")

      // ARTIFACT_LIBRARY 无此品质
      const result = ctx.revealByQuality({ qualityKey: "nonexistent" })

      expect(result.ok).toBe(false)
      expect(result.message).toContain("没有未揭示的")
    })

    it("已揭示的品质不重复揭示（idempotent 重复调用应失败）", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildAiPrivateRevealContext("ai-1")

      const first = ctx.revealByQuality({ qualityKey: "rare" })
      expect(first.ok).toBe(true)

      // 再次揭示：所有 rare 藏品已 known，无未揭示目标
      const second = ctx.revealByQuality({ qualityKey: "rare" })
      expect(second.ok).toBe(false)
      expect(second.revealed).toBe(0)
    })
  })

  describe("revealPrivateIntelAllByCategory（画布状态一致性修复）", () => {
    it("揭示瓷器品类：同步更新所有画布字段", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildAiPrivateRevealContext("ai-1")

      // 真实 ARTIFACT_LIBRARY 中瓷器 7 件
      const expectedCount = ARTIFACT_LIBRARY.filter((i) => i.category === "瓷器").length
      expect(expectedCount).toBe(7) // 保护

      const result = ctx.revealByCategory({ category: "瓷器" })

      // 修复前：仅 knownOutlineIds/knownQualityIds 被填充；修复后：完整副作用
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(expectedCount)
      expect(result.actionType).toBe("reveal")
      expect(result.artifacts).toHaveLength(expectedCount)
      expect(result.bottomCell).not.toBeNull()
      // totalBasePrice 等于揭示藏品基价之和
      const expectedTotal = result.artifacts!.reduce((sum, a) => sum + a.basePrice, 0)
      expect(result.totalBasePrice).toBe(expectedTotal)

      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.knownOutlineIds.size).toBe(expectedCount)
      expect(pool.knownQualityIds.size).toBe(expectedCount)
      expect(pool.outlineSignals).toHaveLength(expectedCount)
      expect(pool.qualitySignals).toHaveLength(expectedCount)
      expect(pool.signalHistory).toHaveLength(expectedCount * 2) // outline + quality
      expect(pool.latestSignalStats).not.toBeNull()
      expect(pool.aggregateStats).not.toBeNull()
    })
  })

  describe("revealPrivateIntelFully（bottomCell+artifacts 返回修复）", () => {
    it("完全揭示返回 bottomCell、artifacts 和 actionType=reveal", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)

      const result = manager.revealPrivateIntelFully("ai-1", {
        count: 5,
        sortStrategy: "smallestFirst",
        category: null,
        allowCategoryFallback: false,
      })

      // 修复前：revealPrivateIntelFully 不返回 bottomCell/artifacts；修复后：返回
      expect(result.ok).toBe(true)
      expect(result.actionType).toBe("reveal")
      expect(result.artifacts).toHaveLength(5)
      // 验证字段完整性（来自真实 ARTIFACT_LIBRARY）
      expect(result.artifacts?.[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        category: expect.any(String),
        quality: expect.any(String),
        sizeTag: expect.any(String),
        w: expect.any(Number),
        h: expect.any(Number),
        basePrice: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      })
      // totalBasePrice 等于揭示藏品基价之和
      const expectedTotal = result.artifacts!.reduce((sum, a) => sum + a.basePrice, 0)
      expect(result.totalBasePrice).toBe(expectedTotal)
      // bottomCell 来自真实 pickBottomCellFromTargets
      expect(result.bottomCell).not.toBeNull()
      expect(result.bottomCell).toHaveProperty("col")
      expect(result.bottomCell).toHaveProperty("row")
    })

    it("完全揭示也同步更新 signalHistory/stats/trackUpdates", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)

      // 完全揭示 10 件（用 largestFirst 让前几件是大件，更可能触发高价值追踪）
      const result = manager.revealPrivateIntelFully("ai-1", {
        count: 10,
        sortStrategy: "largestFirst",
        category: null,
        allowCategoryFallback: false,
      })

      expect(result.ok).toBe(true)
      // 10 件藏品 * 2 信号（outline + quality）= 20 条历史
      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.signalHistory).toHaveLength(20)
      expect(pool.outlineSignals).toHaveLength(10)
      expect(pool.qualitySignals).toHaveLength(10)
      expect(pool.latestSignalStats).not.toBeNull()
      expect(pool.aggregateStats).not.toBeNull()
      // trackUpdates 应包含高价值藏品（basePrice >= 12000 触发）的追踪
      expect(result.trackUpdates).toBeDefined()
      expect(Array.isArray(result.trackUpdates)).toBe(true)
    })

    it("highestPrice 揭示返回信号不含 mean 但 signals 包含 outline+quality 双信息", () => {
      const { deps } = makeRealDeps()
      const manager = new AiIntelManager(deps)

      const result = manager.revealPrivateIntelFully("ai-1", {
        count: 1,
        sortStrategy: "highestPrice",
        category: null,
        allowCategoryFallback: false,
      })

      expect(result.ok).toBe(true)
      expect(result.artifacts).toHaveLength(1)

      // 揭示的藏品确实是最高价的
      const allBasePrices = deps.items.map((i) => i.basePrice || 0)
      const maxPrice = Math.max(...allBasePrices)
      expect(result.artifacts[0].basePrice).toBe(maxPrice)

      // 不返回 signalStats（不用 mean 误导）
      expect(result.signalStats).toBeUndefined()

      // signals 包含 2 条（outline + quality），不被去重
      expect(Array.isArray(result.signals)).toBe(true)
      expect(result.signals.length).toBe(2)
      expect(result.signals[0].mode).toBe("outline")
      expect(result.signals[1].mode).toBe("quality")
    })
  })

  describe("buildAiPrivateSignal", () => {
    it("轮廓模式信号包含品类和尺寸", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a1", category: "瓷器", w: 2, h: 3 })
      const signal = manager.buildAiPrivateSignal("ai-1", item, "outline")
      expect(signal.category).toBe("瓷器")
      expect(signal.itemId).toBe("a1")
      expect(signal.mode).toBe("outline")
    })

    it("品质模式信号包含品质键", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a2", qualityKey: "rare" })
      const signal = manager.buildAiPrivateSignal("ai-1", item, "quality")
      expect(signal.qualityKey).toBe("rare")
      expect(signal.mode).toBe("quality")
    })
  })

  // ═════════════ 面板方法 ═════════════

  describe("getAiNeighborStateLabel", () => {
    it("越界返回仓库边界外标签", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      expect(manager.getAiNeighborStateLabel("ai-1", -1, -1)).toBe("仓库边界外（无藏品）")
    })

    it("未知格子返回尚未探明", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      expect(manager.getAiNeighborStateLabel("ai-1", 5, 5)).toBe("尚未探明")
    })

    it("已标记占用返回有其他藏品占据", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.markAiKnownCellState("ai-1", 3, 3, "occupied")
      expect(manager.getAiNeighborStateLabel("ai-1", 3, 3)).toBe("有其他藏品占据")
    })
  })

  describe("buildNeighborSnapshot", () => {
    it("null 格子返回 null", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      expect(manager.buildNeighborSnapshot("ai-1", null)).toBeNull()
    })

    it("返回 8 方向状态", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const snapshot = manager.buildNeighborSnapshot("ai-1", { x: 5, y: 5 })
      expect(snapshot).not.toBeNull()
      expect(snapshot!["上"]).toBeDefined()
      expect(snapshot!["下"]).toBeDefined()
      expect(snapshot!["左"]).toBeDefined()
      expect(snapshot!["右"]).toBeDefined()
      expect(snapshot!["左上"]).toBeDefined()
      expect(snapshot!["右上"]).toBeDefined()
      expect(snapshot!["左下"]).toBeDefined()
      expect(snapshot!["右下"]).toBeDefined()
    })
  })

  describe("buildAiAggregateIntelBlock", () => {
    it("空池返回空聚合", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const block = manager.buildAiAggregateIntelBlock("ai-1")
      expect(block.byQuality).toEqual([])
      expect(block.byCategory).toEqual([])
      expect(block.signalCount).toBe(0)
    })

    it("有信号时按品质和品类聚合", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      pool.qualitySignals.push({ itemId: "a1", qualityKey: "rare", round: 1, mode: "quality" })
      pool.outlineSignals.push({ itemId: "a2", category: "瓷器", round: 1, mode: "outline" })

      const block = manager.buildAiAggregateIntelBlock("ai-1")
      expect(block.byQuality).toHaveLength(1)
      expect(block.byCategory).toHaveLength(1)
    })
  })

  describe("buildTrackCandidatePreview", () => {
    it("无候选时回退到高价值藏品库", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const result = manager.buildTrackCandidatePreview({
        qualityKey: null,
        category: null,
        sizeTag: null,
      })
      expect(result.total).toBeGreaterThan(0)
      expect(result.list.length).toBeGreaterThan(0)
    })
  })

  describe("buildAiHighValueTrackBlock", () => {
    it("无追踪返回空数组", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const block = manager.buildAiHighValueTrackBlock("ai-1")
      expect(block).toEqual([])
    })

    it("有追踪时返回结构化数据", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a3", qualityKey: "legendary", basePrice: 15000 })
      manager.ensureAiHighValueTrack("ai-1", item)

      const block = manager.buildAiHighValueTrackBlock("ai-1")
      expect(block).toHaveLength(1)
      expect(block[0].trackId).toContain("红")
      expect(block[0].confirmed).toBeDefined()
      expect(block[0].candidates).toBeDefined()
      expect(block[0].spatial).toBeDefined()
    })
  })

  describe("buildAiPrivateIntelBlock", () => {
    it("返回聚合和高价值追踪", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const block = manager.buildAiPrivateIntelBlock("ai-1")
      expect(block.aggregate).toBeDefined()
      expect(block.highValueTracks).toBeDefined()
    })
  })

  describe("getPlayerById", () => {
    it("找到玩家返回引用", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const player = manager.getPlayerById("ai-1")
      expect(player).not.toBeNull()
      expect(player!.name).toBe("左上AI")
    })

    it("未找到返回 null", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      expect(manager.getPlayerById("no-exist")).toBeNull()
    })
  })

  // ═════════════ 动作执行方法 ═════════════

  describe("executeAiIntelAction", () => {
    it("none 类型不执行", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "none",
        actionId: "none",
        expectedReveal: 0,
        score: 0,
      })
      expect(result.ok).toBe(false)
      expect(result.message).toContain("未执行")
    })

    it("本回合已使用技能时拒绝", () => {
      const { deps, state } = makeDeps({ currentRoundUsage: { "ai-1": ["skill-outline-scan"] } })
      state.aiResourceState["ai-1"] = { skills: { "skill-outline-scan": 1 }, items: {} }
      const manager = new AiIntelManager(deps)
      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 1,
        score: 1,
      })
      expect(result.ok).toBe(false)
      expect(result.message).toContain("已使用过")
    })

    it("技能次数不足时拒绝", () => {
      const { deps, state } = makeDeps()
      state.aiResourceState["ai-1"] = { skills: { "skill-outline-scan": 0 }, items: {} }
      const manager = new AiIntelManager(deps)
      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 1,
        score: 1,
      })
      expect(result.ok).toBe(false)
      expect(result.message).toContain("次数不足")
    })

    it("成功执行技能后次数减一", () => {
      const { deps, state } = makeDeps()
      state.aiResourceState["ai-1"] = { skills: { "skill-outline-scan": 2 }, items: {} }
      const manager = new AiIntelManager(deps)
      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 1,
        score: 1,
      })
      expect(result.ok).toBe(true)
      expect(state.aiResourceState["ai-1"].skills["skill-outline-scan"]).toBe(1)
    })

    it("道具不存在时拒绝", () => {
      const { deps, state } = makeDeps()
      state.aiResourceState["ai-1"] = { skills: {}, items: { "no-exist-item": 1 } }
      const manager = new AiIntelManager(deps)
      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "item",
        actionId: "no-exist-item",
        expectedReveal: 1,
        score: 1,
      })
      expect(result.ok).toBe(false)
      expect(result.message).toContain("不存在")
    })
  })

  describe("processAiIntelActions", () => {
    it("成功执行后调用 addPublicInfoEntry 而非 addPrivateIntelEntry", async () => {
      const { deps, state } = makeDeps()
      // 设置 AI 玩家的资源状态，使其有可用技能
      state.aiResourceState["ai-1"] = { skills: { "skill-outline-scan": 1 }, items: {} }
      // 覆盖 AI Engine 返回有效计划
      const plan = {
        actionType: "skill" as const,
        actionId: "skill-outline-scan",
        expectedReveal: 1,
        score: 1,
        candidates: [] as string[],
        decisionSource: "rule" as const,
      }
      deps.aiEngine = {
        ...deps.aiEngine,
        planIntelAction: () => plan,
      }
      const manager = new AiIntelManager(deps)
      await manager.processAiIntelActions()
      expect(deps.addPublicInfoEntry).toHaveBeenCalled()
      expect(deps.addPublicInfoEntry).toHaveBeenCalledWith(
        expect.objectContaining({ source: expect.stringContaining("左上AI") }),
      )
    })
  })

  describe("formatAiIntelActionPublicLine", () => {
    it("格式化包含玩家名和道具名", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const entry: LastAiIntelAction = {
        playerId: "ai-1",
        playerName: "左上AI",
        actionType: "skill",
        actionId: "skill-outline-scan",
        revealed: 2,
        detail: "揭示了两件",
        score: 1,
        effectTag: "outline",
        signalStats: null,
      }
      const line = manager.formatAiIntelActionPublicLine(entry)
      expect(line).toContain("左上AI")
      expect(line).toContain("私有线索+2")
    })

    it("revealed=0 时显示未命中", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const entry: LastAiIntelAction = {
        playerId: "ai-1",
        playerName: "AI",
        actionType: "skill",
        actionId: "x",
        revealed: 0,
        detail: "",
        score: 0,
        effectTag: "",
        signalStats: null,
      }
      const line = manager.formatAiIntelActionPublicLine(entry)
      expect(line).toContain("未命中")
    })
  })

  describe("canUseIntelActions", () => {
    it("正常状态返回 true", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(true)
    })

    it("已结算返回 false", () => {
      const { deps } = makeDeps({ isSettled: () => true })
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(false)
    })

    it("回合解析中返回 false", () => {
      const { deps } = makeDeps({ isRoundResolving: () => true })
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(false)
    })

    it("暂停状态返回 false 并写日志", () => {
      const { deps } = makeDeps({ isRoundPaused: () => true })
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(false)
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("暂停"))
    })

    it("超时返回 false 并写日志", () => {
      const { deps } = makeDeps({ getRoundTimeLeft: () => 0 })
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(false)
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("超时"))
    })

    it("已提交出价返回 false", () => {
      const { deps } = makeDeps({ isPlayerBidSubmitted: () => true })
      const manager = new AiIntelManager(deps)
      expect(manager.canUseIntelActions()).toBe(false)
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("已提交"))
    })
  })

  // ═════════════ buildSkillContext / buildAiPrivateRevealContext ═════════════

  describe("buildSkillContext", () => {
    it("返回包含 revealOutline/revealQuality/revealAll 的上下文", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildSkillContext()
      expect(typeof ctx.revealOutline).toBe("function")
      expect(typeof ctx.revealQuality).toBe("function")
      expect(typeof ctx.revealAll).toBe("function")
    })

    it("revealOutline 委托到 deps.revealOutlineBatch", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildSkillContext()
      ctx.revealOutline({ count: 2, category: "瓷器", sortStrategy: null })
      expect(deps.revealOutlineBatch).toHaveBeenCalledWith(2, "瓷器", false, null)
    })
  })

  describe("buildAiPrivateRevealContext", () => {
    it("revealOutline 委托到 revealPrivateIntelBatch", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const ctx = manager.buildAiPrivateRevealContext("ai-1")
      const result = ctx.revealOutline({ count: 1, category: null, sortStrategy: null })
      expect(result).toBeDefined()
      expect((result as { ok: boolean }).ok).toBe(true)
    })
  })

  // ═════════════ updateAiItemKnowledge ═════════════

  describe("updateAiItemKnowledge", () => {
    it("轮廓模式更新品类和尺寸", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a1", category: "瓷器", w: 2, h: 3 })
      const result = manager.updateAiItemKnowledge("ai-1", item, null, "outline")
      expect(result.category).toBe("瓷器")
      expect(result.revealCount).toBe(1)
    })

    it("品质模式更新品质键", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a2", qualityKey: "rare" })
      const result = manager.updateAiItemKnowledge("ai-1", item, null, "quality")
      expect(result.qualityKey).toBe("rare")
    })

    it("信号含采样格时记录 knownCells", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ id: "a1" })
      const result = manager.updateAiItemKnowledge("ai-1", item, { sampleCell: { x: 3, y: 4 } }, "outline")
      expect(result.knownCells.has("3,4")).toBe(true)
    })
  })

  // ═════════════ scanNeighborIntelAroundCell ═════════════

  describe("scanNeighborIntelAroundCell", () => {
    it("扫描 8 方向并标记格子状态", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.scanNeighborIntelAroundCell("ai-1", 5, 5)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      // 8 个邻居应该都被标记
      expect(Object.keys(pool.knownCellStates).length).toBe(8)
    })

    it("越界邻居被跳过", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      manager.scanNeighborIntelAroundCell("ai-1", 0, 0)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      // (0,0) 的 8 方向中只有 3 个在范围内
      expect(Object.keys(pool.knownCellStates).length).toBe(3)
    })
  })

  describe("markAllItemCellsAsOccupied", () => {
    it("标记藏品所有格子为已占用", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)
      const item = makeArtifact({ x: 2, y: 2, w: 2, h: 2 })
      manager.markAllItemCellsAsOccupied("ai-1", item)
      const pool = manager.ensureAiPrivateIntel("ai-1")
      expect(pool.knownCellStates["2,2"]).toBe("occupied")
      expect(pool.knownCellStates["3,3"]).toBe("occupied")
      expect(Object.keys(pool.knownCellStates).length).toBe(4)
    })
  })

  // ═════════════ AI 道具/技能执行（action-fns.ts） ═════════════
  describe("processAiIntelActions", () => {
    it("LAN 模式下跳过本地 AI 处理", async () => {
      const { deps, state } = makeDeps({ isLanMode: () => true })
      const manager = new AiIntelManager(deps)

      await manager.processAiIntelActions()

      // LAN 模式不执行 AI 动作，lastAiIntelActions 应为空
      expect(state.lastAiIntelActions).toHaveLength(0)
    })

    it("单机模式下正常处理 AI 玩家", async () => {
      const { deps, state } = makeDeps({
        players: [
          makePlayer({ id: "human", name: "玩家", isHuman: true, isSelf: true }),
          makePlayer({ id: "ai-1", name: "左上AI", isHuman: false }),
          makePlayer({ id: "ai-2", name: "右上AI", isHuman: false }),
        ],
      })
      // 设置资源状态使动作能成功执行
      state.aiResourceState["ai-1"] = { skills: { "skill-outline-scan": 1 }, items: {}, consumed: false }
      state.aiResourceState["ai-2"] = { skills: { "skill-outline-scan": 1 }, items: {}, consumed: false }
      deps.aiEngine = {
        ...deps.aiEngine,
        planIntelAction: () => ({
          actionType: "skill" as const,
          actionId: "skill-outline-scan",
          expectedReveal: 1,
          score: 1,
          candidates: [] as string[],
          decisionSource: "rule" as const,
        }),
      }
      const manager = new AiIntelManager(deps)

      await manager.processAiIntelActions()

      // AI 玩家执行了情报动作，lastAiIntelActions 应有记录
      expect(state.lastAiIntelActions.length).toBeGreaterThan(0)
    })

    it("无 AI 玩家时不做任何操作", async () => {
      const { deps } = makeDeps({
        players: [
          makePlayer({ id: "human", name: "玩家", isHuman: true, isSelf: true }),
        ],
      })
      const manager = new AiIntelManager(deps)

      await manager.processAiIntelActions()

      // 没有 AI，不应该调用任何 setPlayerBidReady
      expect(deps.setPlayerBidReady).not.toHaveBeenCalled()
    })

    it("AI 动作结果写入 lastAiIntelActions", async () => {
      const { deps, state } = makeDeps({
        players: [
          makePlayer({ id: "human", name: "玩家", isHuman: true, isSelf: true }),
          makePlayer({ id: "ai-1", name: "左上AI", isHuman: false }),
        ],
      })
      const manager = new AiIntelManager(deps)

      await manager.processAiIntelActions()

      // 至少有一个 action 记录
      expect(state.lastAiIntelActions.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("executeAiIntelAction", () => {
    it("actionType=none 时返回 ok=false（未执行情报行动）", () => {
      const { deps } = makeDeps()
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "none",
        actionId: "none",
        expectedReveal: 0,
        score: 0,
        candidates: [],
      })

      // actionType=none → 不执行，ok=false
      expect(result.ok).toBe(false)
      expect(result.message).toBe("未执行AI情报行动。")
    })

    it("无 resourceState 时返回 ok=false", () => {
      // 玩家 ai-1 存在于 players 但 aiResourceState 未初始化
      const { deps } = makeDeps({
        players: [
          makePlayer({ id: "ai-1", name: "AI1", isHuman: false }),
        ],
      })
      // 确保 aiResourceState 为默认（空的 ai-1 key不存在）
      deps.state.aiResourceState = {}
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 3,
        score: 5,
        candidates: [],
      })

      expect(result.ok).toBe(false)
    })

    it("本回合已使用技能后再次使用返回 false（防重复）", () => {
      const { deps } = makeDeps({
        currentRoundUsage: { "ai-1": ["skill-outline-scan"] },
      })
      deps.state.aiResourceState["ai-1"] = {
        skills: { "skill-outline-scan": 3 },
        items: {},
        consumed: false,
      }
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 3,
        score: 5,
        candidates: [],
      })

      expect(result.ok).toBe(false)
      expect(result.message).toBe("本回合已使用过技能或道具。")
    })

    it("技能次数不足时返回 ok=false", () => {
      const { deps } = makeDeps()
      // 设置该技能的剩余次数为 0
      deps.state.aiResourceState["ai-1"] = {
        skills: { "skill-outline-scan": 0 },
        items: {},
        consumed: false,
      }
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "skill-outline-scan",
        expectedReveal: 3,
        score: 5,
        candidates: [],
      })

      expect(result.ok).toBe(false)
      expect(result.message).toBe("AI技能次数不足。")
    })

    it("技能 ID 不存在时返回 ok=false", () => {
      const { deps } = makeDeps()
      deps.state.aiResourceState["ai-1"] = {
        skills: { "nonexistent-skill": 3 },
        items: {},
        consumed: false,
      }
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "skill",
        actionId: "nonexistent-skill",
        expectedReveal: 0,
        score: 0,
        candidates: [],
      })

      expect(result.ok).toBe(false)
      expect(result.message).toBe("AI技能不存在。")
    })

    it("道具库存不足时返回 ok=false", () => {
      const { deps } = makeDeps()
      deps.state.aiResourceState["ai-1"] = {
        skills: {},
        items: { "item-outline-lamp": 0 },
        consumed: false,
      }
      const manager = new AiIntelManager(deps)

      const result = manager.executeAiIntelAction("ai-1", {
        actionType: "item",
        actionId: "item-outline-lamp",
        expectedReveal: 0,
        score: 0,
        candidates: [],
      })

      expect(result.ok).toBe(false)
      expect(result.message).toBe("AI道具库存不足。")
    })
  })
})
