import { describe, it, expect } from "vitest"
import { QwenProvider } from "../../../scripts/llm/providers/qwen-provider"

const { defaultQwenSettings, normalizeQwenSettings, isQwenThinkingModel } = QwenProvider

describe("qwen-provider", () => {
  describe("defaultQwenSettings", () => {
    it("返回包含所有必需字段的对象", () => {
      const s = defaultQwenSettings()
      expect(s.provider).toBe("qwen")
      expect(s.enabled).toBe(false)
      expect(typeof s.endpoint).toBe("string")
      expect(typeof s.model).toBe("string")
      expect(typeof s.apiKey).toBe("string")
      expect(typeof s.timeoutMs).toBe("number")
      expect(typeof s.temperature).toBe("number")
      expect(typeof s.maxTokens).toBe("number")
    })

    it("每次调用返回独立对象", () => {
      const a = defaultQwenSettings()
      const b = defaultQwenSettings()
      a.apiKey = "mutated"
      expect(b.apiKey).toBe("")
    })

    it("默认 timeoutMs 在合法区间", () => {
      const s = defaultQwenSettings()
      expect(s.timeoutMs).toBeGreaterThanOrEqual(3000)
      expect(s.timeoutMs).toBeLessThanOrEqual(120000)
    })

    it("默认 model 为 qwen-turbo", () => {
      expect(defaultQwenSettings().model).toBe("qwen-turbo")
    })
  })

  describe("normalizeQwenSettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeQwenSettings({}, defaultQwenSettings())
      expect(result.provider).toBe("qwen")
      expect(result.enabled).toBe(false)
      expect(result.model).toBe(defaultQwenSettings().model)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeQwenSettings({ enabled: 1 }, defaultQwenSettings())
      expect(result.enabled).toBe(true)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeQwenSettings({ contextLength: 1 }, defaultQwenSettings()).contextLength).toBe(2)
      expect(normalizeQwenSettings({ contextLength: 100 }, defaultQwenSettings()).contextLength).toBe(20)
      expect(normalizeQwenSettings({ contextLength: 5 }, defaultQwenSettings()).contextLength).toBe(5)
    })

    it("timeoutMs 被 clamp 到 3000-120000", () => {
      expect(normalizeQwenSettings({ timeoutMs: 100 }, defaultQwenSettings()).timeoutMs).toBe(3000)
      expect(normalizeQwenSettings({ timeoutMs: 999999 }, defaultQwenSettings()).timeoutMs).toBe(120000)
    })

    it("temperature 被 clamp 到 0-2", () => {
      expect(normalizeQwenSettings({ temperature: -1 }, defaultQwenSettings()).temperature).toBe(0)
      expect(normalizeQwenSettings({ temperature: 3 }, defaultQwenSettings()).temperature).toBe(2)
    })

    it("maxTokens 最小 1000", () => {
      expect(normalizeQwenSettings({ maxTokens: 500 }, defaultQwenSettings()).maxTokens).toBe(1000)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeQwenSettings({ reflectionScope: "full" }, defaultQwenSettings()).reflectionScope).toBe("full")
      expect(normalizeQwenSettings({ reflectionScope: "other" }, defaultQwenSettings()).reflectionScope).toBe("current")
    })

    it("independentReflectionEnabled 默认为 true", () => {
      expect(normalizeQwenSettings({}, defaultQwenSettings()).independentReflectionEnabled).toBe(true)
    })

    it("independentReflectionEnabled 可设为 false", () => {
      expect(normalizeQwenSettings({ independentReflectionEnabled: false }, defaultQwenSettings()).independentReflectionEnabled).toBe(false)
    })

    it("空 model 回退到默认", () => {
      expect(normalizeQwenSettings({ model: "" }, defaultQwenSettings()).model).toBe(defaultQwenSettings().model)
    })

    it("空 endpoint 回退到默认", () => {
      expect(normalizeQwenSettings({ endpoint: "" }, defaultQwenSettings()).endpoint).toBe(defaultQwenSettings().endpoint)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeQwenSettings({})
      expect(result.provider).toBe("qwen")
    })
  })

  describe("isQwenThinkingModel", () => {
    it("qwen-think 匹配", () => {
      expect(isQwenThinkingModel("qwen-think")).toBe(true)
    })

    it("qwen-reasoning 匹配", () => {
      expect(isQwenThinkingModel("qwen-reasoning")).toBe(true)
    })

    it("Qwen-Think 大小写不敏感", () => {
      expect(isQwenThinkingModel("Qwen-Think-v2")).toBe(true)
    })

    it("qwen-turbo 不匹配", () => {
      expect(isQwenThinkingModel("qwen-turbo")).toBe(false)
    })

    it("qwen-max 不匹配", () => {
      expect(isQwenThinkingModel("qwen-max")).toBe(false)
    })
  })

  describe("QwenProvider 导出", () => {
    it("id 为 qwen", () => {
      expect(QwenProvider.id).toBe("qwen")
    })

    it("name 为 通义千问", () => {
      expect(QwenProvider.name).toBe("通义千问")
    })

    it("存储键已定义", () => {
      expect(QwenProvider.QWEN_STORAGE_KEY).toBeTruthy()
      expect(QwenProvider.QWEN_API_KEY_STORAGE_KEY).toBeTruthy()
    })
  })
})
