import { describe, it, expect } from "vitest"
import { KimiProvider } from "../../../scripts/llm/providers/kimi-provider"

const { defaultKimiSettings, normalizeKimiSettings } = KimiProvider

describe("kimi-provider", () => {
  describe("defaultKimiSettings", () => {
    it("返回包含所有必需字段的对象", () => {
      const s = defaultKimiSettings()
      expect(s.provider).toBe("kimi")
      expect(s.enabled).toBe(false)
      expect(typeof s.endpoint).toBe("string")
      expect(typeof s.model).toBe("string")
      expect(typeof s.apiKey).toBe("string")
      expect(typeof s.timeoutMs).toBe("number")
      expect(typeof s.temperature).toBe("number")
      expect(typeof s.maxTokens).toBe("number")
    })

    it("每次调用返回独立对象", () => {
      const a = defaultKimiSettings()
      const b = defaultKimiSettings()
      a.apiKey = "mutated"
      expect(b.apiKey).toBe("")
    })

    it("默认 model 为 moonshot-v1-8k", () => {
      expect(defaultKimiSettings().model).toBe("moonshot-v1-8k")
    })
  })

  describe("normalizeKimiSettings", () => {
    it("空输入返回默认值", () => {
      const result = normalizeKimiSettings({}, defaultKimiSettings())
      expect(result.provider).toBe("kimi")
      expect(result.enabled).toBe(false)
      expect(result.model).toBe(defaultKimiSettings().model)
    })

    it("enabled 被转为 boolean", () => {
      const result = normalizeKimiSettings({ enabled: 1 }, defaultKimiSettings())
      expect(result.enabled).toBe(true)
    })

    it("contextLength 被 clamp 到 2-20", () => {
      expect(normalizeKimiSettings({ contextLength: 1 }, defaultKimiSettings()).contextLength).toBe(2)
      expect(normalizeKimiSettings({ contextLength: 100 }, defaultKimiSettings()).contextLength).toBe(20)
    })

    it("timeoutMs 被 clamp 到 3000-120000", () => {
      expect(normalizeKimiSettings({ timeoutMs: 100 }, defaultKimiSettings()).timeoutMs).toBe(3000)
      expect(normalizeKimiSettings({ timeoutMs: 999999 }, defaultKimiSettings()).timeoutMs).toBe(120000)
    })

    it("temperature 被 clamp 到 0-1（Kimi 上限为1）", () => {
      expect(normalizeKimiSettings({ temperature: -1 }, defaultKimiSettings()).temperature).toBe(0)
      expect(normalizeKimiSettings({ temperature: 2 }, defaultKimiSettings()).temperature).toBe(1)
    })

    it("maxTokens 最小 1000", () => {
      expect(normalizeKimiSettings({ maxTokens: 500 }, defaultKimiSettings()).maxTokens).toBe(1000)
    })

    it("reflectionScope 只接受 full 或 current", () => {
      expect(normalizeKimiSettings({ reflectionScope: "full" }, defaultKimiSettings()).reflectionScope).toBe("full")
      expect(normalizeKimiSettings({ reflectionScope: "other" }, defaultKimiSettings()).reflectionScope).toBe("current")
    })

    it("空 model 回退到默认", () => {
      expect(normalizeKimiSettings({ model: "" }, defaultKimiSettings()).model).toBe(defaultKimiSettings().model)
    })

    it("未提供 fallback 时使用内置默认", () => {
      const result = normalizeKimiSettings({})
      expect(result.provider).toBe("kimi")
    })

    it("independentModelEnabled 转为 boolean", () => {
      expect(normalizeKimiSettings({ independentModelEnabled: 1 }, defaultKimiSettings()).independentModelEnabled).toBe(true)
    })
  })

  describe("KimiProvider 导出", () => {
    it("id 为 kimi", () => {
      expect(KimiProvider.id).toBe("kimi")
    })

    it("name 为 Kimi", () => {
      expect(KimiProvider.name).toBe("Kimi")
    })

    it("存储键已定义", () => {
      expect(KimiProvider.KIMI_STORAGE_KEY).toBeTruthy()
      expect(KimiProvider.KIMI_API_KEY_STORAGE_KEY).toBeTruthy()
    })
  })
})
