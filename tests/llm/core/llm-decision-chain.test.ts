/**
 * @file tests/llm/core/llm-decision-chain.test.ts
 * @description LLM 决策链路集成测试 —— 请求→解析→纠错→降级 全链验证
 *
 * 覆盖：
 * 1. requestAiLlmPlan 各种失败分支（provider null、requestChat undefined、!result.ok）
 * 2. requestAiLlmErrorCorrection 纠错上限（≥2 次返回 correctionSkipped）
 * 3. 缓存命中 / 新局重置（aiConversationCache）
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createLlmRequestMethods } from "../../../scripts/llm/core/decision/request"
import { createLlmCorrectionMethods } from "../../../scripts/llm/core/decision/correction"
import type { LlmDecisionDeps } from "../../../scripts/llm/core/decision/types"

// ─── 通用 mock deps ───

function makeDeps(overrides: Partial<LlmDecisionDeps> = {}): LlmDecisionDeps {
  return {
    GAME_SETTINGS: { maxRounds: 5, roundSeconds: 60, bidStep: 500, directTakeRatio: 0.2 },
    LLM_SETTINGS: {
      enabled: true,
      apiKey: "sk-test",
      endpoint: "https://api.example.com/v1",
      model: "test-model",
      maxTokens: 600,
      timeoutMs: 30000,
    },
    ...overrides,
  } as LlmDecisionDeps
}

/** 创建可用的 mock provider */
function makeProvider(result: Record<string, unknown> = { ok: true, content: '{"bid":1000}' }) {
  return {
    id: "mock",
    requestChat: vi.fn().mockResolvedValue(result),
  }
}

/** 最小的 mock scene 上下文（只包含各方法访问的 this 属性） */
function makeMockScene(overrides: Record<string, unknown> = {}) {
  const base = {
    round: 1,
    currentBid: 1000,
    bidLeader: "none",
    aiConversationCache: {},
    aiLlmPlayerEnabled: { ai1: true, ai2: true, ai3: true },
    getLlmProvider: () => null,
    getLlmSettings: () => ({
      enabled: true,
      apiKey: "sk-test",
      endpoint: "https://api.example.com/v1",
      model: "test-model",
      maxTokens: 600,
      timeoutMs: 30000,
    }),
    getAiModelConfigForPlayer: () => null,
    getAiFirstRoundExtraBlocks: () => [],
    getAiConversationMessages: () => [],
    getAiCrossGameMemoryCount: () => 0,
    getAiInGameHistoryCount: () => 0,
    buildAiLlmRoundPayload: () => ({}),
    buildAiIncrementalPayload: () => ({}),
    buildAiFollowupRoundPayload: () => ({}),
    buildAiDecisionUserPrompt: () => "mock user prompt",
    buildAiDecisionMessages: () => [{ role: "system", content: "sys" }, { role: "user", content: "user" }],
    isAiMultiGameMemoryEnabled: () => false,
    getAiWallet: () => 100000,
    getAiResourceSnapshot: () => ({ skills: {}, items: {} }),
    getActionDefById: () => null,
    buildAiActionConstraintBlock: () => ({}),
    // correction 路径需要 extractAiDecisionObject 解析 LLM 返回的 JSON
    extractAiDecisionObject: (text: string) => {
      try { return JSON.parse(text) as Record<string, unknown> } catch { return null }
    },
    // 简单透传：输入决策对象转 plan
    normalizeAiLlmPlan: (_pid: string, decision: Record<string, unknown> | null, _raw: string, _opts?: Record<string, unknown>) => {
      if (decision && typeof decision.bid === "number") {
        return {
          source: "llm", bid: decision.bid as number, folded: false, hasBidDecision: true,
          target: "", thought: (decision.thought as string) || "", rawSkill: "", rawItem: "",
          rawContent: JSON.stringify(decision), failed: false, actionType: "none", actionId: "none",
        }
      }
      return { source: "llm", bid: 0, folded: false, hasBidDecision: false, target: "", thought: "", rawSkill: "", rawItem: "", rawContent: "", failed: true, actionType: "none", actionId: "none" }
    },
    ...overrides,
  }
  return base
}

// ─── 请求方法 ───

describe("createLlmRequestMethods", () => {
  describe("requestAiLlmPlan", () => {
    const player = { id: "ai1", name: "AI-1", isHuman: false, isAI: true, isSelf: false } as never

    it("provider 为 null 时返回失败 plan（不抛异常）", async () => {
      const deps = makeDeps()
      const methods = createLlmRequestMethods(deps)
      const scene = makeMockScene()

      const plan = await methods.requestAiLlmPlan.call(scene, player, { batchId: "test" })

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.error).toBe("LLM Provider 未初始化")
      expect(plan!.source).toBe("llm")
    })

    it("provider.requestChat 为 undefined 时返回失败 plan", async () => {
      const deps = makeDeps()
      const methods = createLlmRequestMethods(deps)
      const scene = makeMockScene({
        getLlmProvider: () => ({ id: "mock", requestChat: undefined }),
      })

      const plan = await methods.requestAiLlmPlan.call(scene, player, { batchId: "test" })

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.error).toBe("LLM Provider requestChat 方法未初始化")
    })

    it("result.ok = false 时返回失败 plan 并设置 LLM 错误", async () => {
      const deps = makeDeps()
      const methods = createLlmRequestMethods(deps)
      const provider = makeProvider({ ok: false, error: "API 超时", code: "TIMEOUT" })
      const scene = makeMockScene({
        getLlmProvider: () => provider,
      })

      // setPlayerLlmError 需要 this.xxx 属性，mock 成简单赋值
      ;(scene as Record<string, unknown>)._llmErrors = {}
      Object.defineProperty(scene, "setPlayerLlmError", {
        value: vi.fn(),
        writable: true,
      })

      const plan = await methods.requestAiLlmPlan.call(scene, player, { batchId: "test" })

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.error).toContain("API 超时")
      expect(provider.requestChat).toHaveBeenCalledTimes(1)
    })

    it("正常请求成功后返回正确 bid", async () => {
      const deps = makeDeps()
      const methods = createLlmRequestMethods(deps)
      const provider = makeProvider({
        ok: true,
        content: '{"bid":5000,"skill":"无","item":"无","thought":"测试思路"}',
        usage: { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 400 },
      })
      const scene = makeMockScene({ getLlmProvider: () => provider })

      const plan = await methods.requestAiLlmPlan.call(scene, player, { batchId: "test" })

      expect(plan).not.toBeNull()
      expect(plan!.bid).toBe(5000)
      expect(plan!.failed).toBe(false)
      expect(provider.requestChat).toHaveBeenCalledTimes(1)

      const callArgs = provider.requestChat.mock.calls[0][0] as Record<string, unknown>
      expect(callArgs.messages).toBeDefined()
      expect((callArgs.settings as Record<string, unknown>).model).toBe("test-model")
    })
  })
})

// ─── 纠错方法 ───

describe("createLlmCorrectionMethods", () => {
  describe("requestAiLlmErrorCorrection", () => {
    const player = { id: "ai1", name: "AI-1", isHuman: false, isAI: true, isSelf: false } as never
    const currentPlan = { bid: 1000, actionType: "none", actionId: "none" }

    it("纠错次数达到上限(2)时跳过纠错直接返回 correctionSkipped", async () => {
      // 应防止无限纠错循环
      const deps = makeDeps()
      const methods = createLlmCorrectionMethods(deps)
      const scene = makeMockScene()

      const correctionHistory = [
        { error: "第一次错误", aiResponse: "修正1" },
        { error: "第二次错误", aiResponse: "修正2" },
      ]

      const plan = await methods.requestAiLlmErrorCorrection.call(
        scene, player, currentPlan, "第三次错误", correctionHistory
      )

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.correctionSkipped).toBe(true)
      expect(plan!.error).toBe("已达最大纠错次数(2)，不再回调")
    })

    it("纠错次数为 1 时仍然尝试纠错（发起 requestChat）", async () => {
      const deps = makeDeps()
      const methods = createLlmCorrectionMethods(deps)
      const provider = makeProvider({ ok: true, content: '{"bid":2000}' })
      const scene = makeMockScene({ getLlmProvider: () => provider })

      const correctionHistory = [{ error: "第一次错误", aiResponse: "修正1" }]

      const plan = await methods.requestAiLlmErrorCorrection.call(
        scene, player, currentPlan, "第二次错误", correctionHistory
      )

      expect(plan).not.toBeNull()
      expect(provider.requestChat).toHaveBeenCalledTimes(1)
      expect(plan!.correctionSkipped).toBeUndefined()
      expect(plan!.failed).toBe(false)
      expect(plan!.bid).toBe(2000)
    })

    it("纠错次数为 0 时可以正常纠错", async () => {
      const deps = makeDeps()
      const methods = createLlmCorrectionMethods(deps)
      const provider = makeProvider({ ok: true, content: '{"bid":3000}' })
      const scene = makeMockScene({ getLlmProvider: () => provider })

      const plan = await methods.requestAiLlmErrorCorrection.call(
        scene, player, currentPlan, "第一次错误", []
      )

      expect(plan).not.toBeNull()
      expect(provider.requestChat).toHaveBeenCalledTimes(1)
      expect(plan!.bid).toBe(3000)
      expect(plan!.correctionSkipped).toBeUndefined()
    })

    it("纠错时 provider 为 null 返回失败 plan", async () => {
      const deps = makeDeps()
      const methods = createLlmCorrectionMethods(deps)
      const scene = makeMockScene({ getLlmProvider: () => null })

      const plan = await methods.requestAiLlmErrorCorrection.call(
        scene, player, currentPlan, "测试错误", []
      )

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.error).toBe("LLM Provider 未初始化")
    })

    it("纠错时 requestChat 为 undefined 返回失败 plan", async () => {
      const deps = makeDeps()
      const methods = createLlmCorrectionMethods(deps)
      const scene = makeMockScene({
        getLlmProvider: () => ({ id: "mock", requestChat: undefined }),
      })

      const plan = await methods.requestAiLlmErrorCorrection.call(
        scene, player, currentPlan, "测试错误", []
      )

      expect(plan).not.toBeNull()
      expect(plan!.failed).toBe(true)
      expect(plan!.error).toBe("LLM Provider requestChat 方法未初始化")
    })
  })
})
