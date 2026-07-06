import { describe, it, expect } from "vitest"
import { OpenAIProvider } from "../../../scripts/llm/providers/openai-provider"

const { defaultOpenAISettings, normalizeOpenAISettings, isOpenAIThinkingModel } = OpenAIProvider

describe("openai-provider", () => {
  describe("defaultOpenAISettings", () => {
    it("返回包含所有必需字段的对象", () => {
      const s = defaultOpenAISettings()
      expect(s.provider).toBe("openai")
      expect(s.enabled).toBe(false)
      expect(typeof s.endpoint).toBe("string")
      expect(typeof s.model).toBe("string")
      expect(typeof s.apiKey).toBe("string")
      expect(typeof s.timeoutMs).toBe("number")
      expect(typeof s.temperature).toBe("number")
      expect(typeof s.maxTokens).toBe("number")
    })

    it("每次调用返回独立对象", () => {
      const a = defaultOpenAISettings()
      const b = defaultOpenAISettings()
      a.apiKey = "mutated"
      expect(b.apiKey).toBe("")
    })

    it("默认 model 为 gpt-4o-mini", () => {
      expect(defaultOpenAISettings().model).toBe("gpt-4o-mini")
    })
  })

  describe("normalizeOpenAISettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeOpenAISettings({}, defaultOpenAISettings())
      expect(result.provider).toBe("openai")
      expect(result.enabled).toBe(false)
      expect(result.model).toBe(defaultOpenAISettings().model)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeOpenAISettings({ enabled: 1 }, defaultOpenAISettings())
      expect(result.enabled).toBe(true)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeOpenAISettings({ contextLength: 1 }, defaultOpenAISettings()).contextLength).toBe(2)
      expect(normalizeOpenAISettings({ contextLength: 100 }, defaultOpenAISettings()).contextLength).toBe(20)
    })

    it("timeoutMs 被 clamp 到 3000-120000", () => {
      expect(normalizeOpenAISettings({ timeoutMs: 100 }, defaultOpenAISettings()).timeoutMs).toBe(3000)
      expect(normalizeOpenAISettings({ timeoutMs: 999999 }, defaultOpenAISettings()).timeoutMs).toBe(120000)
    })

    it("temperature 被 clamp 到 0-2", () => {
      expect(normalizeOpenAISettings({ temperature: -1 }, defaultOpenAISettings()).temperature).toBe(0)
      expect(normalizeOpenAISettings({ temperature: 3 }, defaultOpenAISettings()).temperature).toBe(2)
    })

    it("maxTokens 最小 1000", () => {
      expect(normalizeOpenAISettings({ maxTokens: 500 }, defaultOpenAISettings()).maxTokens).toBe(1000)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeOpenAISettings({ reflectionScope: "full" }, defaultOpenAISettings()).reflectionScope).toBe("full")
      expect(normalizeOpenAISettings({ reflectionScope: "other" }, defaultOpenAISettings()).reflectionScope).toBe("current")
    })

    it("空 model 回退到默认", () => {
      expect(normalizeOpenAISettings({ model: "" }, defaultOpenAISettings()).model).toBe(defaultOpenAISettings().model)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeOpenAISettings({})
      expect(result.provider).toBe("openai")
    })

    it("thinkingParams 字符串保留", () => {
      const result = normalizeOpenAISettings({ thinkingParams: '{"x":1}' }, defaultOpenAISettings())
      expect(result.thinkingParams).toBe('{"x":1}')
    })
  })

  describe("isOpenAIThinkingModel", () => {
    it("o1- 前缀匹配", () => {
      expect(isOpenAIThinkingModel("o1-preview")).toBe(true)
      expect(isOpenAIThinkingModel("o1-mini")).toBe(true)
    })

    it("o3- 前缀匹配", () => {
      expect(isOpenAIThinkingModel("o3-mini")).toBe(true)
    })

    it("大小写不敏感", () => {
      expect(isOpenAIThinkingModel("O1-Preview")).toBe(true)
    })

    it("gpt-4o 不匹配", () => {
      expect(isOpenAIThinkingModel("gpt-4o")).toBe(false)
    })

    it("gpt-4o-mini 不匹配", () => {
      expect(isOpenAIThinkingModel("gpt-4o-mini")).toBe(false)
    })
  })

  describe("OpenAIProvider 导出", () => {
    it("id 为 openai", () => {
      expect(OpenAIProvider.id).toBe("openai")
    })

    it("name 为 OpenAI", () => {
      expect(OpenAIProvider.name).toBe("OpenAI")
    })

    it("存储键已定义", () => {
      expect(OpenAIProvider.OPENAI_STORAGE_KEY).toBeTruthy()
      expect(OpenAIProvider.OPENAI_API_KEY_STORAGE_KEY).toBeTruthy()
    })
  })
})
