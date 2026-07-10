import { describe, it, expect, vi } from "vitest"
import { createLlmDecisionModule } from "../../../scripts/llm/core/llm-decision"

const mockDeps = {
  GAME_SETTINGS: { maxRounds: 3, bidStep: 1000, directTakeRatio: 1.2, roundSeconds: 30 },
  LLM_SETTINGS: {
    enabled: false,
    apiKey: "",
    endpoint: "",
    model: "test-model",
    independentModelEnabled: false,
    multiGameMemoryEnabled: false,
    reflectionEnabled: false,
    thinkingEnabled: false,
    thinkingParams: ""
  },
  isNoneActionText: (text: string) => text === "无" || text === "",
  compactOneLine: (text: string) => text,
  formatBidRevealNumber: (v: number) => String(v),
  indentMultiline: (text: string) => text,
  compactPanelText: (text: string) => text
}

const { methods } = createLlmDecisionModule(mockDeps)

describe("llm-decision - getAiIndexFromPlayerId", () => {
  it("ai1 -> 0", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "ai1")).toBe(0)
  })
  it("ai2 -> 1", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "ai2")).toBe(1)
  })
  it("ai3 -> 2", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "ai3")).toBe(2)
  })
  it("p1 -> 0", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "p1")).toBe(0)
  })
  it("p3 -> 1", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "p3")).toBe(1)
  })
  it("p4 -> 2", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "p4")).toBe(2)
  })
  it("p2 -> -1（无效映射）", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "p2")).toBe(-1)
  })
  it("非法格式 -> -1", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "unknown")).toBe(-1)
  })
  it("空字符串 -> -1", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "")).toBe(-1)
  })
  it("非字符串 -> -1", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, null as any)).toBe(-1)
    expect(methods.getAiIndexFromPlayerId.call({}, undefined as any)).toBe(-1)
    expect(methods.getAiIndexFromPlayerId.call({}, 123 as any)).toBe(-1)
  })
  it("大小写不敏感", () => {
    expect(methods.getAiIndexFromPlayerId.call({}, "AI1")).toBe(0)
    expect(methods.getAiIndexFromPlayerId.call({}, "Ai2")).toBe(1)
    expect(methods.getAiIndexFromPlayerId.call({}, "P1")).toBe(0)
  })
})

describe("llm-decision - isAiLlmEnabledForPlayer", () => {
  it("aiLlmPlayerEnabled 为 null 返回 false", () => {
    const mockThis = { aiLlmPlayerEnabled: null }
    expect(methods.isAiLlmEnabledForPlayer.call(mockThis, "ai1")).toBe(false)
  })
  it("aiLlmPlayerEnabled 为非对象返回 false", () => {
    const mockThis = { aiLlmPlayerEnabled: "invalid" }
    expect(methods.isAiLlmEnabledForPlayer.call(mockThis, "ai1")).toBe(false)
  })
  it("playerId 在 map 中为 true 返回 true", () => {
    const mockThis = { aiLlmPlayerEnabled: { "ai1": true, "ai2": false } }
    expect(methods.isAiLlmEnabledForPlayer.call(mockThis, "ai1")).toBe(true)
  })
  it("playerId 在 map 中为 false 返回 false", () => {
    const mockThis = { aiLlmPlayerEnabled: { "ai1": true, "ai2": false } }
    expect(methods.isAiLlmEnabledForPlayer.call(mockThis, "ai2")).toBe(false)
  })
  it("playerId 不在 map 中返回 false", () => {
    const mockThis = { aiLlmPlayerEnabled: { "ai1": true } }
    expect(methods.isAiLlmEnabledForPlayer.call(mockThis, "ai3")).toBe(false)
  })
})

describe("llm-decision - canUseLlmDecision", () => {
  it("settings.enabled=false 返回 false", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ ...mockDeps.LLM_SETTINGS, enabled: false })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
  })
  it("provider=null 返回 false", () => {
    const mockThis = {
      getLlmProvider: () => null,
      getLlmSettings: () => ({ ...mockDeps.LLM_SETTINGS, enabled: true, apiKey: "sk-test" })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
  })
  it("settings=null 返回 false", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => null
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
  })
  it("有 apiKey 返回 true", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "sk-test123" })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(true)
  })
  it("apiKey 为空白返回 false（无代理端点）", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "   ", endpoint: "https://api.test.com" })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
  })
  it("代理端点（/开头）+ 非原生 返回 true", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "", endpoint: "/api/chat" })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(true)
  })
  it("代理端点 + 原生环境（NativeBridge）返回 false", () => {
    const mockThis = {
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "", endpoint: "/api/chat" })
    }
    const originalNativeBridge = (window as any).NativeBridge
      ; (window as any).NativeBridge = { getServerUrl: () => "http://native" }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
      ; (window as any).NativeBridge = originalNativeBridge
  })
  it("getLlmProvider 不是函数返回 false", () => {
    const mockThis = {
      getLlmProvider: undefined,
      getLlmSettings: () => ({ enabled: true, apiKey: "sk-test" })
    }
    expect(methods.canUseLlmDecision.call(mockThis)).toBe(false)
  })
})

describe("llm-decision - canUseLlmDecisionForPlayer", () => {
  it("两者都为 true 返回 true", () => {
    const mockThis = {
      canUseLlmDecision: methods.canUseLlmDecision,
      isAiLlmEnabledForPlayer: methods.isAiLlmEnabledForPlayer,
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "sk-test" }),
      aiLlmPlayerEnabled: { "ai1": true }
    }
    expect(methods.canUseLlmDecisionForPlayer.call(mockThis, "ai1")).toBe(true)
  })
  it("LLM 可用但玩家未启用返回 false", () => {
    const mockThis = {
      canUseLlmDecision: methods.canUseLlmDecision,
      isAiLlmEnabledForPlayer: methods.isAiLlmEnabledForPlayer,
      getLlmProvider: () => ({ id: "test" }),
      getLlmSettings: () => ({ enabled: true, apiKey: "sk-test" }),
      aiLlmPlayerEnabled: { "ai1": false }
    }
    expect(methods.canUseLlmDecisionForPlayer.call(mockThis, "ai1")).toBe(false)
  })
  it("LLM 不可用但玩家已启用返回 false", () => {
    const mockThis = {
      canUseLlmDecision: methods.canUseLlmDecision,
      isAiLlmEnabledForPlayer: methods.isAiLlmEnabledForPlayer,
      getLlmProvider: () => null,
      getLlmSettings: () => ({ enabled: false }),
      aiLlmPlayerEnabled: { "ai1": true }
    }
    expect(methods.canUseLlmDecisionForPlayer.call(mockThis, "ai1")).toBe(false)
  })
})

describe("llm-decision - getAiModelConfigForPlayer", () => {
  const getAiIndexFromPlayerId = methods.getAiIndexFromPlayerId
  it("independentModelEnabled=false 返回 null", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: false }),
      getAiIndexFromPlayerId
    }
    expect(methods.getAiModelConfigForPlayer.call(mockThis, "ai1")).toBeNull()
  })
  it("无效 aiIndex 返回 null", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: true }),
      getAiIndexFromPlayerId
    }
    expect(methods.getAiModelConfigForPlayer.call(mockThis, "unknown")).toBeNull()
  })
  it("有 getAiModelConfig 且配置完整返回 config", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: true }),
      getAiIndexFromPlayerId,
      getAiModelConfig: () => ({
        apiKey: "sk-test",
        endpoint: "https://api.test.com",
        model: "gpt-4"
      })
    }
    const result = methods.getAiModelConfigForPlayer.call(mockThis, "ai1")
    expect(result).not.toBeNull()
    expect(result.apiKey).toBe("sk-test")
    expect(result.model).toBe("gpt-4")
  })
  it("config 缺少 apiKey 返回 null", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: true }),
      getAiIndexFromPlayerId,
      getAiModelConfig: () => ({ apiKey: "", model: "gpt-4" })
    }
    expect(methods.getAiModelConfigForPlayer.call(mockThis, "ai1")).toBeNull()
  })
  it("config 缺少 model 返回 null", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: true }),
      getAiIndexFromPlayerId,
      getAiModelConfig: () => ({ apiKey: "sk-test", model: "" })
    }
    expect(methods.getAiModelConfigForPlayer.call(mockThis, "ai1")).toBeNull()
  })
  it("无 getAiModelConfig 方法返回 null", () => {
    const mockThis = {
      getLlmSettings: () => ({ independentModelEnabled: true }),
      getAiIndexFromPlayerId
    }
    expect(methods.getAiModelConfigForPlayer.call(mockThis, "ai1")).toBeNull()
  })
})
