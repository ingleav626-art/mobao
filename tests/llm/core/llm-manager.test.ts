import { describe, it, expect, beforeEach, vi } from "vitest"
import { LlmManager } from "../../../scripts/llm/core/llm-manager"
import { normalizeUsage, broadcastToTokenMonitor } from "../../../scripts/llm/core/manager-utils"
import { createBaseProvider } from "../../../scripts/llm/core/provider-factory"

const {
  clamp,
  toFiniteNumber,
  normalizeObject,
  parseJsonSafely,
  compactText,
  maskApiKey,
  isProxyEndpoint,
  extractErrorMessage,
  loadStoredApiKey,
  saveStoredApiKey
} = LlmManager.utils

describe("llm-manager utils", () => {
  describe("clamp", () => {
    it("值在范围内保持不变", () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })
    it("低于下限截断到 min", () => {
      expect(clamp(-1, 0, 10)).toBe(0)
    })
    it("超过上限截断到 max", () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })
  })

  describe("toFiniteNumber", () => {
    it("有效数字直接返回", () => {
      expect(toFiniteNumber(42, 0)).toBe(42)
    })
    it("字符串数字解析", () => {
      expect(toFiniteNumber("3.14", 0)).toBe(3.14)
    })
    it("NaN 返回 fallback", () => {
      expect(toFiniteNumber(NaN, 99)).toBe(99)
    })
    it("Infinity 返回 fallback", () => {
      expect(toFiniteNumber(Infinity, 99)).toBe(99)
    })
    it("null 返回 0（Number(null)===0 is finite）", () => {
      expect(toFiniteNumber(null, 99)).toBe(0)
    })
    it("undefined 返回 fallback", () => {
      expect(toFiniteNumber(undefined, 99)).toBe(99)
    })
    it("非数字字符串返回 fallback", () => {
      expect(toFiniteNumber("abc", 0)).toBe(0)
    })
  })

  describe("normalizeObject", () => {
    it("普通对象返回自身", () => {
      expect(normalizeObject({ a: 1 })).toEqual({ a: 1 })
    })
    it("null 返回空对象", () => {
      expect(normalizeObject(null)).toEqual({})
    })
    it("undefined 返回空对象", () => {
      expect(normalizeObject(undefined)).toEqual({})
    })
    it("数字返回空对象", () => {
      expect(normalizeObject(42)).toEqual({})
    })
    it("字符串返回空对象", () => {
      expect(normalizeObject("hello")).toEqual({})
    })
  })

  describe("parseJsonSafely", () => {
    it("有效 JSON 解析", () => {
      expect(parseJsonSafely('{"a":1}')).toEqual({ a: 1 })
    })
    it("无效 JSON 返回 null", () => {
      expect(parseJsonSafely("{invalid}")).toBeNull()
    })
    it("空字符串返回 null", () => {
      expect(parseJsonSafely("")).toBeNull()
    })
    it("非字符串返回 null", () => {
      expect(parseJsonSafely(42 as any)).toBeNull()
    })
    it("null 返回 null", () => {
      expect(parseJsonSafely(null as any)).toBeNull()
    })
    it("JSON 数组解析", () => {
      expect(parseJsonSafely("[1,2,3]")).toEqual([1, 2, 3])
    })
  })

  describe("compactText", () => {
    it("短文本不变", () => {
      expect(compactText("hello", 100)).toBe("hello")
    })
    it("超长文本截断加省略号", () => {
      const long = "a".repeat(200)
      const result = compactText(long, 100)
      expect(result.length).toBeLessThanOrEqual(103) // 100 + "..."
      expect(result).toContain("...")
    })
    it("空字符串返回空", () => {
      expect(compactText("", 100)).toBe("")
    })
    it("非字符串返回空", () => {
      expect(compactText(123 as any, 100)).toBe("")
    })
  })

  describe("maskApiKey", () => {
    it("空字符串返回 (empty)", () => {
      expect(maskApiKey("")).toBe("(empty)")
    })
    it("短 key 全部遮罩", () => {
      expect(maskApiKey("abcd")).toBe("****")
      expect(maskApiKey("12345678")).toBe("********")
    })
    it("长 key 前4后4", () => {
      expect(maskApiKey("sk-abcdefghij1234567890")).toBe("sk-a...7890")
    })
    it("非字符串返回 (empty)", () => {
      expect(maskApiKey(null as any)).toBe("(empty)")
    })
  })

  describe("isProxyEndpoint", () => {
    it("斜杠开头为代理", () => {
      expect(isProxyEndpoint("/api/chat")).toBe(true)
    })
    it("空字符串非代理", () => {
      expect(isProxyEndpoint("")).toBe(false)
    })
    it("非字符串非代理", () => {
      expect(isProxyEndpoint(123 as any)).toBe(false)
    })
    it("外部 URL 非代理", () => {
      expect(isProxyEndpoint("https://api.openai.com/v1/chat/completions")).toBe(false)
    })
  })

  describe("extractErrorMessage", () => {
    it("从 error.message 提取", () => {
      expect(extractErrorMessage({ error: { message: "bad request" } }, 400)).toBe("bad request")
    })
    it("从 message 提取", () => {
      expect(extractErrorMessage({ message: "rate limited" }, 429)).toBe("rate limited")
    })
    it("无 message 返回默认", () => {
      expect(extractErrorMessage({}, 500)).toBe("请求失败（HTTP 500）")
    })
    it("null payload 返回默认", () => {
      expect(extractErrorMessage(null, 502)).toBe("请求失败（HTTP 502）")
    })
  })

  describe("loadStoredApiKey / saveStoredApiKey", () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it("保存后可加载", () => {
      saveStoredApiKey("test-provider", "sk-12345")
      expect(loadStoredApiKey("test-provider")).toBe("sk-12345")
    })

    it("空值删除键", () => {
      saveStoredApiKey("test-provider", "sk-12345")
      saveStoredApiKey("test-provider", "")
      expect(loadStoredApiKey("test-provider")).toBe("")
    })

    it("无键返回空字符串", () => {
      expect(loadStoredApiKey("nonexistent")).toBe("")
    })

    it("保存会 trim", () => {
      saveStoredApiKey("test-provider", "  sk-abc  ")
      expect(loadStoredApiKey("test-provider")).toBe("sk-abc")
    })
  })
})

describe("LlmManager 核心方法", () => {
  it("listProviders 返回数组", () => {
    const list = LlmManager.listProviders()
    expect(Array.isArray(list)).toBe(true)
  })

  it("registerProvider / getProvider / unregisterProvider", () => {
    const mockProvider = {
      id: "test-mock",
      name: "Mock",
      requestChat: () => Promise.resolve({ ok: true }),
      loadSettings: () => ({}),
      saveSettings: () => ({}),
      getLogs: () => [],
      clearLogs: () => { },
      testConnection: () => Promise.resolve({ ok: true })
    }
    LlmManager.registerProvider(mockProvider)
    const got = LlmManager.getProvider("test-mock")
    expect(got).not.toBeNull()
    expect(got.id).toBe("test-mock")
    LlmManager.unregisterProvider("test-mock")
    expect(LlmManager.getProvider("test-mock")).toBeNull()
  })

  it("getActiveProviderId 初始可能为 null 或已设置", () => {
    const id = LlmManager.getActiveProviderId()
    expect(id === null || typeof id === "string").toBe(true)
  })

  it("setActiveProvider 切换活跃 provider", () => {
    const mockProvider = {
      id: "test-active",
      name: "Active Mock",
      requestChat: () => Promise.resolve({ ok: true }),
      loadSettings: () => ({}),
      saveSettings: () => ({}),
      getLogs: () => [],
      clearLogs: () => { },
      testConnection: () => Promise.resolve({ ok: true })
    }
    LlmManager.registerProvider(mockProvider)
    LlmManager.setActiveProvider("test-active")
    expect(LlmManager.getActiveProviderId()).toBe("test-active")
    LlmManager.unregisterProvider("test-active")
  })
})

describe("normalizeUsage", () => {
  it("null 返回 null", () => {
    expect(normalizeUsage(null)).toBeNull()
  })
  it("undefined 返回 null", () => {
    expect(normalizeUsage(undefined)).toBeNull()
  })
  it("非对象返回 null", () => {
    expect(normalizeUsage("string" as any)).toBeNull()
  })
  it("空对象返回零值", () => {
    const result = normalizeUsage({})
    expect(result).toEqual({
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      reasoning_tokens: 0,
      cached_tokens: 0
    })
  })
  it("直接字段映射", () => {
    const result = normalizeUsage({
      completion_tokens: 100,
      total_tokens: 500,
      prompt_cache_hit_tokens: 200,
      prompt_cache_miss_tokens: 100,
      reasoning_tokens: 50
    })
    expect(result).not.toBeNull()
    expect(result!.completion_tokens).toBe(100)
    expect(result!.total_tokens).toBe(500)
    expect(result!.prompt_cache_hit_tokens).toBe(200)
    expect(result!.prompt_cache_miss_tokens).toBe(100)
    expect(result!.reasoning_tokens).toBe(50)
  })
  it("prompt_tokens + cached_tokens 计算", () => {
    const result = normalizeUsage({
      prompt_tokens: 300,
      cached_tokens: 200
    })
    expect(result).not.toBeNull()
    expect(result!.prompt_cache_hit_tokens).toBe(200)
    expect(result!.prompt_cache_miss_tokens).toBe(100)
  })
  it("prompt_tokens_details 优先于 cached_tokens", () => {
    const result = normalizeUsage({
      prompt_tokens: 300,
      cached_tokens: 50,
      prompt_tokens_details: { cached_tokens: 200 }
    })
    expect(result).not.toBeNull()
    expect(result!.prompt_cache_hit_tokens).toBe(200)
    expect(result!.prompt_cache_miss_tokens).toBe(100)
  })
  it("cached_tokens 回退（prompt_cache_hit 为 0 时）", () => {
    const result = normalizeUsage({
      completion_tokens: 100,
      cached_tokens: 150
    })
    expect(result).not.toBeNull()
    expect(result!.prompt_cache_hit_tokens).toBe(150)
  })
})

describe("broadcastToTokenMonitor", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("成功结果写入 localStorage", () => {
    broadcastToTokenMonitor(
      { ok: true, elapsedMs: 100, model: "test-model", requestId: "r1", usage: null },
      { _playerId: "ai1", _playerName: "AI1" }
    )
    const stored = localStorage.getItem("llm-token-monitor-live")
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.type).toBe("llm-request")
    expect(parsed.payload.ok).toBe(true)
    expect(parsed.payload.playerId).toBe("ai1")
  })

  it("失败结果也写入", () => {
    broadcastToTokenMonitor(
      { ok: false, elapsedMs: 5000, code: "TIMEOUT", requestId: "r2", usage: null },
      {}
    )
    const stored = localStorage.getItem("llm-token-monitor-live")
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.payload.ok).toBe(false)
    expect(parsed.payload.code).toBe("TIMEOUT")
  })

  it("包含 usage 时写入 normalizedUsage", () => {
    broadcastToTokenMonitor(
      {
        ok: true,
        elapsedMs: 200,
        model: "test",
        requestId: "r3",
        usage: { prompt_tokens: 100, cached_tokens: 50, completion_tokens: 80 }
      },
      {}
    )
    const stored = localStorage.getItem("llm-token-monitor-live")
    const parsed = JSON.parse(stored!)
    expect(parsed.payload.usage).not.toBeNull()
    expect(parsed.payload.usage.prompt_cache_hit_tokens).toBe(50)
    expect(parsed.payload.usage.prompt_cache_miss_tokens).toBe(50)
  })
})

describe("createBaseProvider", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      id: "test-base",
      name: "Test Base",
      description: "test provider",
      defaultSettings: () => ({
        enabled: false,
        apiKey: "",
        endpoint: "https://api.test.com",
        model: "test-model",
        timeoutMs: 30000,
        temperature: 0.2,
        maxTokens: 2048
      }),
      normalizeSettings: (source: any, fallback: any) => {
        const defaults = fallback || {
          enabled: false,
          apiKey: "",
          endpoint: "https://api.test.com",
          model: "test-model",
          timeoutMs: 30000,
          temperature: 0.2,
          maxTokens: 2048
        }
        return {
          ...defaults,
          ...source,
          enabled: Boolean(source.enabled),
          timeoutMs: Math.max(3000, Number(source.timeoutMs) || defaults.timeoutMs)
        }
      },
      ...overrides
    }
  }

  it("返回包含基本属性的对象", () => {
    const provider = createBaseProvider(makeConfig())
    expect(provider.id).toBe("test-base")
    expect(provider.name).toBe("Test Base")
    expect(provider.description).toBe("test provider")
  })

  it("loadSettings 返回默认值+apiKey", () => {
    const provider = createBaseProvider(makeConfig())
    const settings = provider.loadSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.apiKey).toBe("")
    expect(settings.model).toBe("test-model")
  })

  it("saveSettings 后 loadSettings 可读回", () => {
    const provider = createBaseProvider(makeConfig())
    provider.saveSettings({ enabled: true, apiKey: "sk-test123", model: "test-model" })
    const settings = provider.loadSettings()
    expect(settings.apiKey).toBe("sk-test123")
  })

  it("apiKey 单独存储不在 JSON settings 中", () => {
    const provider = createBaseProvider(makeConfig())
    provider.saveSettings({ enabled: true, apiKey: "sk-secret", model: "test-model" })
    const raw = localStorage.getItem("mobao_test-base_settings_v1")
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.apiKey).toBe("")
  })

  it("log / getLogs / clearLogs 正常工作", () => {
    const provider = createBaseProvider(makeConfig())
    provider.log("info", "test.event", { key: "value" })
    const logs = provider.getLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].level).toBe("info")
    expect(logs[0].event).toBe("test.event")
    provider.clearLogs()
    expect(provider.getLogs().length).toBe(0)
  })

  it("日志循环覆盖（超过 MAX_LOG_ENTRIES）", () => {
    const provider = createBaseProvider(makeConfig())
    for (let i = 0; i < 125; i++) {
      provider.log("info", `event-${i}`, {})
    }
    const logs = provider.getLogs()
    expect(logs.length).toBe(120)
  })

  it("isThinkingModel 默认返回 false", () => {
    const provider = createBaseProvider(makeConfig())
    expect(provider.isThinkingModel("any-model")).toBe(false)
  })

  it("supportsFeature 默认返回 false", () => {
    const provider = createBaseProvider(makeConfig())
    expect(provider.supportsFeature("thinking")).toBe(false)
  })
})
