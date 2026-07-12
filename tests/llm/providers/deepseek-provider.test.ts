import { describe, it, expect } from "vitest"
import { DeepSeekProvider } from "../../../scripts/llm/providers/deepseek-provider"

const { defaultDeepSeekSettings, normalizeDeepSeekSettings, isDeepSeekThinkingModel, isThinkingModel } = DeepSeekProvider

describe("deepseek-provider", () => {
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

    it("默认 model 为 deepseek-v4-flash", () => {
      expect(defaultDeepSeekSettings().model).toBe("deepseek-v4-flash")
    })
  })

  describe("normalizeDeepSeekSettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeDeepSeekSettings({}, defaultDeepSeekSettings())
      expect(result.provider).toBe("deepseek")
      expect(result.enabled).toBe(false)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeDeepSeekSettings({ enabled: 1 }, defaultDeepSeekSettings())
      expect(result.enabled).toBe(true)
    })

    it("通用字段 thinkingEnabled 默认 false", () => {
      const result = normalizeDeepSeekSettings({}, defaultDeepSeekSettings())
      expect(result.thinkingEnabled).toBe(false)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeDeepSeekSettings({ contextLength: 1 }, defaultDeepSeekSettings()).contextLength).toBe(2)
      expect(normalizeDeepSeekSettings({ contextLength: 100 }, defaultDeepSeekSettings()).contextLength).toBe(20)
      expect(normalizeDeepSeekSettings({ contextLength: 5 }, defaultDeepSeekSettings()).contextLength).toBe(5)
    })

    it("contextLength 非法值回退到 5", () => {
      expect(normalizeDeepSeekSettings({ contextLength: "abc" }, defaultDeepSeekSettings()).contextLength).toBe(5)
      expect(normalizeDeepSeekSettings({ contextLength: null }, defaultDeepSeekSettings()).contextLength).toBe(5)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeDeepSeekSettings({ reflectionScope: "full" }, defaultDeepSeekSettings()).reflectionScope).toBe("full")
      expect(normalizeDeepSeekSettings({ reflectionScope: "other" }, defaultDeepSeekSettings()).reflectionScope).toBe("current")
    })

    it("autoSummarizeEnabled 仅 false 时为 false", () => {
      expect(normalizeDeepSeekSettings({ autoSummarizeEnabled: false }, defaultDeepSeekSettings()).autoSummarizeEnabled).toBe(false)
      expect(normalizeDeepSeekSettings({ autoSummarizeEnabled: true }, defaultDeepSeekSettings()).autoSummarizeEnabled).toBe(true)
      expect(normalizeDeepSeekSettings({}, defaultDeepSeekSettings()).autoSummarizeEnabled).toBe(true)
    })

    it("相对路径 endpoint 保留", () => {
      const result = normalizeDeepSeekSettings({ endpoint: "/api/test" }, defaultDeepSeekSettings())
      expect(result.endpoint).toBe("/api/test")
    })

    it("非 http 且非斜杠开头 endpoint 回退到默认", () => {
      const result = normalizeDeepSeekSettings({ endpoint: "invalid" }, defaultDeepSeekSettings())
      expect(result.endpoint).toBe(defaultDeepSeekSettings().endpoint)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeDeepSeekSettings({})
      expect(result.provider).toBe("deepseek")
      expect(result.model).toBe(defaultDeepSeekSettings().model)
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

    it("空 model 回退到默认", () => {
      expect(normalizeDeepSeekSettings({ model: "" }, defaultDeepSeekSettings()).model).toBe(defaultDeepSeekSettings().model)
    })

    it("independentReflectionEnabled 默认为 true", () => {
      expect(normalizeDeepSeekSettings({}, defaultDeepSeekSettings()).independentReflectionEnabled).toBe(true)
    })

    it("independentReflectionEnabled 可设为 false", () => {
      expect(normalizeDeepSeekSettings({ independentReflectionEnabled: false }, defaultDeepSeekSettings()).independentReflectionEnabled).toBe(false)
    })
  })

  describe("isDeepSeekThinkingModel", () => {
    it("deepseek-v4 匹配", () => {
      expect(isDeepSeekThinkingModel("deepseek-v4")).toBe(true)
    })

    it("deepseek-reasoner 匹配", () => {
      expect(isDeepSeekThinkingModel("deepseek-reasoner")).toBe(true)
    })

    it("大小写不敏感", () => {
      expect(isDeepSeekThinkingModel("DeepSeek-V4-Flash")).toBe(true)
    })

    it("deepseek-chat 不匹配", () => {
      expect(isDeepSeekThinkingModel("deepseek-chat")).toBe(false)
    })

    it("deepseek-v4-flash 匹配", () => {
      expect(isDeepSeekThinkingModel("deepseek-v4-flash")).toBe(true)
    })
  })

  describe("isThinkingModel（全局判断）", () => {
    it("deepseek-v4 匹配", () => {
      expect(isThinkingModel("deepseek-v4")).toBe(true)
    })

    it("o1-preview 匹配", () => {
      expect(isThinkingModel("o1-preview")).toBe(true)
    })

    it("qwen-think 匹配", () => {
      expect(isThinkingModel("qwen-think")).toBe(true)
    })

    it("glm-z1 匹配", () => {
      expect(isThinkingModel("glm-z1")).toBe(true)
    })

    it("普通模型不匹配", () => {
      expect(isThinkingModel("gpt-4o")).toBe(false)
      expect(isThinkingModel("qwen-turbo")).toBe(false)
    })
  })

  describe("DeepSeekProvider 导出", () => {
    it("id 为 deepseek", () => {
      expect(DeepSeekProvider.id).toBe("deepseek")
    })

    it("name 为 DeepSeek", () => {
      expect(DeepSeekProvider.name).toBe("DeepSeek")
    })

    it("存储键已定义", () => {
      expect(DeepSeekProvider.DEEPSEEK_STORAGE_KEY).toBeTruthy()
      expect(DeepSeekProvider.DEEPSEEK_API_KEY_STORAGE_KEY).toBeTruthy()
    })
  })
})
