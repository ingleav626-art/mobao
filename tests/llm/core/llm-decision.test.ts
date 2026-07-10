import { describe, it, expect, vi } from "vitest"
import {
  createLlmDecisionModule,
  getAiIndexFromPlayerId,
  canUseLlmDecisionCore,
  isValidAiModelConfig,
  parseCrossGameMemoryText,
  getControlModeLabel,
  buildDecisionSourceLabel,
  resolveControlMode
} from "../../../scripts/llm/core/llm-decision"

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

describe("llm-decision - 纯函数 getAiIndexFromPlayerId", () => {
  it("ai1 -> 0", () => {
    expect(getAiIndexFromPlayerId("ai1")).toBe(0)
  })
  it("ai3 -> 2", () => {
    expect(getAiIndexFromPlayerId("ai3")).toBe(2)
  })
  it("p1 -> 0", () => {
    expect(getAiIndexFromPlayerId("p1")).toBe(0)
  })
  it("p4 -> 2", () => {
    expect(getAiIndexFromPlayerId("p4")).toBe(2)
  })
  it("p2 -> -1（人类玩家）", () => {
    expect(getAiIndexFromPlayerId("p2")).toBe(-1)
  })
  it("非字符串返回 -1", () => {
    expect(getAiIndexFromPlayerId(undefined as unknown as string)).toBe(-1)
  })
  it("AI 大写格式支持", () => {
    expect(getAiIndexFromPlayerId("AI2")).toBe(1)
  })
})

describe("llm-decision - canUseLlmDecisionCore", () => {
  it("settings=null 返回 false", () => {
    expect(canUseLlmDecisionCore(null, { id: "p" }, null)).toBe(false)
  })
  it("settings.enabled=false 返回 false", () => {
    expect(canUseLlmDecisionCore({ enabled: false }, { id: "p" }, null)).toBe(false)
  })
  it("provider=null 返回 false", () => {
    expect(canUseLlmDecisionCore({ enabled: true }, null, null)).toBe(false)
  })
  it("有 apiKey 返回 true", () => {
    expect(canUseLlmDecisionCore({ enabled: true, apiKey: "sk-xxx" }, { id: "p" }, null)).toBe(true)
  })
  it("仅空白 apiKey 返回 false（除非代理端点）", () => {
    expect(canUseLlmDecisionCore({ enabled: true, apiKey: "  " }, { id: "p" }, null)).toBe(false)
  })
  it("代理端点 + 非原生环境 返回 true", () => {
    expect(canUseLlmDecisionCore({ enabled: true, endpoint: "/proxy" }, { id: "p" }, null)).toBe(true)
  })
  it("代理端点 + 原生环境 返回 false", () => {
    const nativeBridge = { getServerUrl: () => "http://native" }
    expect(canUseLlmDecisionCore({ enabled: true, endpoint: "/proxy" }, { id: "p" }, nativeBridge)).toBe(false)
  })
  it("非代理端点 返回 false", () => {
    expect(canUseLlmDecisionCore({ enabled: true, endpoint: "https://api.x.com" }, { id: "p" }, null)).toBe(false)
  })
  it("空端点 返回 false", () => {
    expect(canUseLlmDecisionCore({ enabled: true, endpoint: "" }, { id: "p" }, null)).toBe(false)
  })
})

describe("llm-decision - isValidAiModelConfig", () => {
  it("null 返回 false", () => {
    expect(isValidAiModelConfig(null)).toBe(false)
  })
  it("缺少 apiKey 返回 false", () => {
    expect(isValidAiModelConfig({ apiKey: "", model: "gpt-4" })).toBe(false)
  })
  it("缺少 model 返回 false", () => {
    expect(isValidAiModelConfig({ apiKey: "sk-xxx", model: "" })).toBe(false)
  })
  it("完整配置返回 true", () => {
    expect(isValidAiModelConfig({ apiKey: "sk-xxx", model: "gpt-4" })).toBe(true)
  })
})

describe("llm-decision - parseCrossGameMemoryText", () => {
  it("空字符串返回空对象", () => {
    expect(parseCrossGameMemoryText("")).toEqual({})
  })
  it("解析所有分段", () => {
    const text = "【跨局历史】历史内容\n【上期总结】总结内容\n【经验本】经验内容\n【本局决策】决策内容"
    const result = parseCrossGameMemoryText(text)
    expect(result.history).toBe("历史内容")
    expect(result.summary).toBe("总结内容")
    expect(result.experience).toBe("经验内容")
    expect(result.inGame).toBe("决策内容")
  })
  it("仅包含部分分段", () => {
    const result = parseCrossGameMemoryText("【经验本】只有经验")
    expect(result.experience).toBe("只有经验")
    expect(result.history).toBeUndefined()
  })
  it("未知分段被忽略", () => {
    const result = parseCrossGameMemoryText("【未知标题】内容")
    expect(result.history).toBeUndefined()
    expect(result.summary).toBeUndefined()
  })
})

describe("llm-decision - getControlModeLabel", () => {
  it("undefined 返回空字符串", () => {
    expect(getControlModeLabel(undefined)).toBe("")
  })
  it("llm 返回正常决策标签", () => {
    expect(getControlModeLabel("llm")).toBe("大模型正常决策")
  })
  it("llm-corrected 返回纠错标签", () => {
    expect(getControlModeLabel("llm-corrected")).toBe("大模型纠错后决策")
  })
  it("未知模式返回原值", () => {
    expect(getControlModeLabel("unknown-mode")).toBe("unknown-mode")
  })
  it("rule-fallback-llm-failed 返回回退标签", () => {
    expect(getControlModeLabel("rule-fallback-llm-failed")).toContain("LLM请求失败")
  })
})

describe("llm-decision - buildDecisionSourceLabel", () => {
  it("plan=null 返回规则AI", () => {
    expect(buildDecisionSourceLabel(null, true)).toBe("规则AI")
  })
  it("llmSeatEnabled=false 返回规则AI", () => {
    expect(buildDecisionSourceLabel({ failed: false }, false)).toBe("规则AI")
  })
  it("plan.failed=true 返回规则AI回退", () => {
    expect(buildDecisionSourceLabel({ failed: true }, true)).toBe("规则AI回退")
  })
  it("正常 plan 返回 model", () => {
    expect(buildDecisionSourceLabel({ failed: false, model: "deepseek-chat" }, true)).toBe("deepseek-chat")
  })
  it("无 model 的正常 plan 返回大模型", () => {
    expect(buildDecisionSourceLabel({ failed: false }, true)).toBe("大模型")
  })
})

describe("llm-decision - resolveControlMode", () => {
  it("plan=null 返回 rule", () => {
    expect(resolveControlMode(null, true)).toBe("rule")
  })
  it("有 controlMode 直接返回", () => {
    expect(resolveControlMode({ controlMode: "llm-corrected" }, true)).toBe("llm-corrected")
  })
  it("无 controlMode + 成功 + 有 bid + 启用 返回 llm", () => {
    expect(resolveControlMode({ failed: false, hasBidDecision: true }, true)).toBe("llm")
  })
  it("无 controlMode + 失败 返回 rule", () => {
    expect(resolveControlMode({ failed: true, hasBidDecision: true }, true)).toBe("rule")
  })
  it("无 controlMode + 无 bid 返回 rule", () => {
    expect(resolveControlMode({ failed: false, hasBidDecision: false }, true)).toBe("rule")
  })
  it("无 controlMode + 未启用 返回 rule", () => {
    expect(resolveControlMode({ failed: false, hasBidDecision: true }, false)).toBe("rule")
  })
})
