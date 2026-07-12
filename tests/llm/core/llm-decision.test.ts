import { describe, it, expect, vi } from "vitest"
import {
  createLlmDecisionModule,
  getAiIndexFromPlayerId,
  canUseLlmDecisionCore,
  isValidAiModelConfig,
  parseCrossGameMemoryText,
  getControlModeLabel,
  buildDecisionSourceLabel,
  resolveControlMode,
  escapeHtml,
  renderLlmEntryDetails,
  renderRuleEntryDetails
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

const fmtBid = (v: number) => String(v)

describe("llm-decision - escapeHtml", () => {
  it("空字符串返回空", () => {
    expect(escapeHtml("")).toBe("")
  })
  it("纯文本不变", () => {
    expect(escapeHtml("hello world")).toBe("hello world")
  })
  it("转义 < > &", () => {
    const result = escapeHtml("<div>&nbsp;</div>")
    expect(result).not.toContain("<")
    expect(result).not.toContain(">")
    expect(result).toContain("&amp;")
  })
  it("转义引号", () => {
    const result = escapeHtml('"hello"')
    expect(result).toContain("hello")
  })
})

describe("llm-decision - renderLlmEntryDetails", () => {
  const baseEntry = {
    playerId: "ai1",
    playerName: "AI1",
    finalBid: 5000,
    folded: false,
    decisionSource: "deepseek-chat",
    controlMode: "llm" as const,
    llmActionName: "",
    ruleActionName: "",
    actionExecuted: false,
    thought: "",
    reasoningContent: "",
    error: "",
    fallbackRuleBid: null as number | null,
    systemPrompt: "",
    userPrompt: "",
    modelResponse: "",
    toolResultSummary: "",
    followupPrompt: "",
    followupResponse: "",
    followupError: "",
    followupActionRejected: "",
    correctionAttempt: 0,
    originalError: "",
    errorCorrectionPrompt: "",
    errorCorrectionResponse: "",
    historyMessagesCount: 0,
    crossGameMemoryCount: 0,
    inGameHistoryCount: 0,
    historyMessagesPreview: "",
    crossGameMemoryText: "",
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    cacheHitRate: 0,
    usage: undefined as any
  }

  it("空 entry 仍包含 User Prompt 和 Model Response 详情块", () => {
    const result = renderLlmEntryDetails(baseEntry, fmtBid)
    expect(result).toContain("User Prompt")
    expect(result).toContain("Model Response")
  })

  it("包含缓存信息", () => {
    const entry = { ...baseEntry, cacheHitTokens: 100, cacheMissTokens: 50, cacheHitRate: 66 }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("缓存命中")
    expect(result).toContain("100")
    expect(result).toContain("66%")
  })

  it("包含纠错次数", () => {
    const entry = { ...baseEntry, correctionAttempt: 1, originalError: "parse error" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("纠错次数: 1/2")
    expect(result).toContain("parse error")
  })

  it("包含跨局记忆信息", () => {
    const entry = { ...baseEntry, crossGameMemoryCount: 3, inGameHistoryCount: 5 }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("3局跨局记忆")
    expect(result).toContain("5条本局历史")
  })

  it("仅跨局记忆无本局历史", () => {
    const entry = { ...baseEntry, crossGameMemoryCount: 2, inGameHistoryCount: 0 }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("2局跨局记忆")
    expect(result).not.toContain("本局历史")
  })

  it("包含动作信息", () => {
    const entry = { ...baseEntry, llmActionName: "侦查术", actionExecuted: true }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("侦查术")
    expect(result).toContain("已执行")
  })

  it("规则动作", () => {
    const entry = { ...baseEntry, ruleActionName: "鉴定术" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("规则动作")
    expect(result).toContain("鉴定术")
  })

  it("包含思考内容", () => {
    const entry = { ...baseEntry, thought: "我决定出价5000" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("思考")
    expect(result).toContain("我决定出价5000")
  })

  it("包含错误信息", () => {
    const entry = { ...baseEntry, error: "JSON解析失败" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("错误")
    expect(result).toContain("JSON解析失败")
  })

  it("包含回退规则出价", () => {
    const entry = { ...baseEntry, fallbackRuleBid: 3000 }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("回退规则出价参考")
    expect(result).toContain("3000")
  })

  it("包含提示词详情", () => {
    const entry = { ...baseEntry, systemPrompt: "你是AI", userPrompt: "请出价", modelResponse: "出5000" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("System Prompt")
    expect(result).toContain("User Prompt")
    expect(result).toContain("Model Response")
    expect(result).toContain("3项")
  })

  it("包含工具结果", () => {
    const entry = { ...baseEntry, toolResultSummary: "鉴定结果：稀有" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("Tool Result")
  })

  it("包含纠错详情", () => {
    const entry = { ...baseEntry, errorCorrectionPrompt: "纠错prompt", errorCorrectionResponse: "纠错response" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("Error Correction")
  })

  it("包含追问详情", () => {
    const entry = { ...baseEntry, followupPrompt: "追问prompt", followupResponse: "追问response" }
    const result = renderLlmEntryDetails(entry, fmtBid)
    expect(result).toContain("Follow-up")
  })
})

describe("llm-decision - renderRuleEntryDetails", () => {
  const baseEntry = {
    playerId: "ai1",
    playerName: "AI1",
    finalBid: 5000,
    folded: false,
    decisionSource: "规则AI",
    controlMode: "rule" as const
  }

  it("无规则数据时显示提示", () => {
    const ruleMap = new Map()
    const result = renderRuleEntryDetails(baseEntry as any, ruleMap, fmtBid)
    expect(result).toContain("无规则AI决策数据")
  })

  it("包含信心和人格", () => {
    const ruleMap = new Map([
      ["ai1", { playerId: "ai1", finalBid: 5000, confidence: 0.72, archetype: "激进型" }]
    ])
    const result = renderRuleEntryDetails(baseEntry as any, ruleMap, fmtBid)
    expect(result).toContain("72%")
    expect(result).toContain("激进型")
  })

  it("包含估值和上限", () => {
    const ruleMap = new Map([
      ["ai1", { playerId: "ai1", finalBid: 5000, perceivedValue: 8000, hardCap: 10000, confidence: 0.5 }]
    ])
    const result = renderRuleEntryDetails(baseEntry as any, ruleMap, fmtBid)
    expect(result).toContain("8000")
    expect(result).toContain("10000")
  })

  it("包含超预期信息", () => {
    const ruleMap = new Map([
      ["ai1", { playerId: "ai1", finalBid: 5000, overheatRatio: 0.3, overheatThreshold: 0.5, confidence: 0.5 }]
    ])
    const result = renderRuleEntryDetails(baseEntry as any, ruleMap, fmtBid)
    expect(result).toContain("30%")
    expect(result).toContain("50%")
  })

  it("包含信心组成部分", () => {
    const ruleMap = new Map([
      [
        "ai1",
        {
          playerId: "ai1",
          finalBid: 5000,
          confidence: 0.8,
          confidenceParts: { base: 0.3, clue: 0.2, quality: 0.3 }
        }
      ]
    ])
    const result = renderRuleEntryDetails(baseEntry as any, ruleMap, fmtBid)
    expect(result).toContain("信心拆解")
    expect(result).toContain("基础")
    expect(result).toContain("线索")
    expect(result).toContain("品质")
  })
})
