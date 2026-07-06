import { describe, it, expect } from "vitest"
import {
  defaultDeepSeekSettings,
  normalizeDeepSeekSettings,
  maskApiKey
} from "../../../scripts/llm/providers/deepseek-llm"

describe("deepseek-llm", () => {
  describe("defaultDeepSeekSettings", () => {
    it("返回包含所有必需字段的对象", () => {
      const s = defaultDeepSeekSettings()
      expect(s.provider).toBe("deepseek")
      expect(s.enabled).toBe(false)
      expect(typeof s.endpoint).toBe("string")
      expect(typeof s.model).toBe("string")
      expect(typeof s.apiKey).toBe("string")
      expect(typeof s.timeoutMs).toBe("number")
      expect(typeof s.temperature).toBe("number")
      expect(typeof s.maxTokens).toBe("number")
    })

    it("每次调用返回独立对象", () => {
      const a = defaultDeepSeekSettings()
      const b = defaultDeepSeekSettings()
      a.apiKey = "mutated"
      expect(b.apiKey).toBe("")
    })

    it("默认 timeoutMs 在合法区间", () => {
      const s = defaultDeepSeekSettings()
      expect(s.timeoutMs).toBeGreaterThanOrEqual(3000)
      expect(s.timeoutMs).toBeLessThanOrEqual(120000)
    })
  })

  describe("normalizeDeepSeekSettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeDeepSeekSettings({}, defaultDeepSeekSettings())
      expect(result.provider).toBe("deepseek")
      expect(result.enabled).toBe(false)
      expect(result.model).toBe(defaultDeepSeekSettings().model)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeDeepSeekSettings({ enabled: 1 }, defaultDeepSeekSettings())
      expect(result.enabled).toBe(true)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeDeepSeekSettings({ contextLength: 1 }, defaultDeepSeekSettings()).contextLength).toBe(2)
      expect(normalizeDeepSeekSettings({ contextLength: 100 }, defaultDeepSeekSettings()).contextLength).toBe(20)
      expect(normalizeDeepSeekSettings({ contextLength: 5 }, defaultDeepSeekSettings()).contextLength).toBe(5)
    })

    it("timeoutMs 被 clamp 到 3000-120000", () => {
      expect(normalizeDeepSeekSettings({ timeoutMs: 100 }, defaultDeepSeekSettings()).timeoutMs).toBe(3000)
      expect(normalizeDeepSeekSettings({ timeoutMs: 999999 }, defaultDeepSeekSettings()).timeoutMs).toBe(120000)
    })

    it("temperature 被 clamp 到 0-1.5", () => {
      expect(normalizeDeepSeekSettings({ temperature: -1 }, defaultDeepSeekSettings()).temperature).toBe(0)
      expect(normalizeDeepSeekSettings({ temperature: 2 }, defaultDeepSeekSettings()).temperature).toBe(1.5)
    })

    it("maxTokens 最小 1000", () => {
      expect(normalizeDeepSeekSettings({ maxTokens: 500 }, defaultDeepSeekSettings()).maxTokens).toBe(1000)
    })

    it("相对路径 endpoint 保留", () => {
      const result = normalizeDeepSeekSettings({ endpoint: "/api/test" }, defaultDeepSeekSettings())
      expect(result.endpoint).toBe("/api/test")
    })

    it("非 http 且非斜杠开头 endpoint 回退到默认", () => {
      const result = normalizeDeepSeekSettings({ endpoint: "invalid" }, defaultDeepSeekSettings())
      expect(result.endpoint).toBe(defaultDeepSeekSettings().endpoint)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeDeepSeekSettings({ reflectionScope: "full" }, defaultDeepSeekSettings()).reflectionScope).toBe("full")
      expect(normalizeDeepSeekSettings({ reflectionScope: "other" }, defaultDeepSeekSettings()).reflectionScope).toBe("current")
    })

    it("autoSummarizeEnabled 仅 false 时为 false", () => {
      expect(normalizeDeepSeekSettings({ autoSummarizeEnabled: false }, defaultDeepSeekSettings()).autoSummarizeEnabled).toBe(false)
      expect(normalizeDeepSeekSettings({ autoSummarizeEnabled: true }, defaultDeepSeekSettings()).autoSummarizeEnabled).toBe(true)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeDeepSeekSettings({})
      expect(result.provider).toBe("deepseek")
      expect(result.model).toBe(defaultDeepSeekSettings().model)
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
    it("非字符串输入返回 (empty)", () => {
      expect(maskApiKey(null as unknown as string)).toBe("(empty)")
      expect(maskApiKey(undefined as unknown as string)).toBe("(empty)")
    })
  })
})
