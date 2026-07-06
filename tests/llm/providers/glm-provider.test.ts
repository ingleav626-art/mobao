import { describe, it, expect } from "vitest"
import { GlmProvider } from "../../../scripts/llm/providers/glm-provider"

const { defaultGlmSettings, normalizeGlmSettings, isGlmThinkingModel } = GlmProvider

describe("glm-provider", () => {
  describe("defaultGlmSettings", () => {
    it("返回包含所有必需字段的对象", () => {
      const s = defaultGlmSettings()
      expect(s.provider).toBe("glm")
      expect(s.enabled).toBe(false)
      expect(typeof s.endpoint).toBe("string")
      expect(typeof s.model).toBe("string")
      expect(typeof s.apiKey).toBe("string")
      expect(typeof s.timeoutMs).toBe("number")
      expect(typeof s.temperature).toBe("number")
      expect(typeof s.maxTokens).toBe("number")
    })

    it("每次调用返回独立对象", () => {
      const a = defaultGlmSettings()
      const b = defaultGlmSettings()
      a.apiKey = "mutated"
      expect(b.apiKey).toBe("")
    })

    it("默认 model 为 glm-4-flash", () => {
      expect(defaultGlmSettings().model).toBe("glm-4-flash")
    })
  })

  describe("normalizeGlmSettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeGlmSettings({}, defaultGlmSettings())
      expect(result.provider).toBe("glm")
      expect(result.enabled).toBe(false)
      expect(result.model).toBe(defaultGlmSettings().model)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeGlmSettings({ enabled: 1 }, defaultGlmSettings())
      expect(result.enabled).toBe(true)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeGlmSettings({ contextLength: 1 }, defaultGlmSettings()).contextLength).toBe(2)
      expect(normalizeGlmSettings({ contextLength: 100 }, defaultGlmSettings()).contextLength).toBe(20)
    })

    it("timeoutMs 被 clamp 到 3000-120000", () => {
      expect(normalizeGlmSettings({ timeoutMs: 100 }, defaultGlmSettings()).timeoutMs).toBe(3000)
      expect(normalizeGlmSettings({ timeoutMs: 999999 }, defaultGlmSettings()).timeoutMs).toBe(120000)
    })

    it("temperature 被 clamp 到 0-1（GLM 上限为1）", () => {
      expect(normalizeGlmSettings({ temperature: -1 }, defaultGlmSettings()).temperature).toBe(0)
      expect(normalizeGlmSettings({ temperature: 2 }, defaultGlmSettings()).temperature).toBe(1)
    })

    it("maxTokens 最小 1000", () => {
      expect(normalizeGlmSettings({ maxTokens: 500 }, defaultGlmSettings()).maxTokens).toBe(1000)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeGlmSettings({ reflectionScope: "full" }, defaultGlmSettings()).reflectionScope).toBe("full")
      expect(normalizeGlmSettings({ reflectionScope: "other" }, defaultGlmSettings()).reflectionScope).toBe("current")
    })

    it("空 model 回退到默认", () => {
      expect(normalizeGlmSettings({ model: "" }, defaultGlmSettings()).model).toBe(defaultGlmSettings().model)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeGlmSettings({})
      expect(result.provider).toBe("glm")
    })

    it("thinkingEnabled 转为 boolean", () => {
      expect(normalizeGlmSettings({ thinkingEnabled: 1 }, defaultGlmSettings()).thinkingEnabled).toBe(true)
    })
  })

  describe("isGlmThinkingModel", () => {
    it("glm-z1 匹配", () => {
      expect(isGlmThinkingModel("glm-z1")).toBe(true)
    })

    it("glm-think 匹配", () => {
      expect(isGlmThinkingModel("glm-think")).toBe(true)
    })

    it("大小写不敏感", () => {
      expect(isGlmThinkingModel("GLM-Z1-Flash")).toBe(true)
    })

    it("glm-4-flash 不匹配", () => {
      expect(isGlmThinkingModel("glm-4-flash")).toBe(false)
    })

    it("glm-4 不匹配", () => {
      expect(isGlmThinkingModel("glm-4")).toBe(false)
    })
  })

  describe("GlmProvider 导出", () => {
    it("id 为 glm", () => {
      expect(GlmProvider.id).toBe("glm")
    })

    it("name 为 智谱GLM", () => {
      expect(GlmProvider.name).toBe("智谱GLM")
    })

    it("存储键已定义", () => {
      expect(GlmProvider.GLM_STORAGE_KEY).toBeTruthy()
      expect(GlmProvider.GLM_API_KEY_STORAGE_KEY).toBeTruthy()
    })
  })
})
