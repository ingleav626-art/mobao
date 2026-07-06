import { describe, it, expect, beforeEach } from "vitest"
import { LlmManager } from "../../../scripts/llm/core/llm-manager"

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
