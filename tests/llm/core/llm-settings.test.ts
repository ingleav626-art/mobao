import { describe, it, expect, beforeEach } from "vitest"
import { createLlmSettingsModule } from "../../../scripts/llm/core/llm-settings"

const STORAGE_KEY = "mobao_ai_llm_switches"
const mockDeps = {
  AI_LLM_SWITCH_STORAGE_KEY: STORAGE_KEY,
  LLM_SETTINGS: {
    enabled: false,
    apiKey: "",
    endpoint: "",
    model: "test-model"
  },
  maskApiKey: (key: string) => (key ? key.slice(0, 3) + "***" : "")
}

const { loadAiLlmPlayerSwitches, saveAiLlmPlayerSwitches } = createLlmSettingsModule(mockDeps)

describe("llm-settings - loadAiLlmPlayerSwitches", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("无存储时返回默认值", () => {
    const players = [{ id: "ai1", isHuman: false }, { id: "ai2", isHuman: false }]
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": true, "ai2": true })
  })

  it("人类玩家不出现在默认值中", () => {
    const players = [
      { id: "p1", isHuman: true },
      { id: "ai1", isHuman: false }
    ]
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": true })
  })

  it("空玩家列表返回空对象", () => {
    const result = loadAiLlmPlayerSwitches([])
    expect(result).toEqual({})
  })

  it("null 玩家列表返回空对象", () => {
    const result = loadAiLlmPlayerSwitches(null as any)
    expect(result).toEqual({})
  })

  it("覆盖默认值（boolean）", () => {
    const players = [{ id: "ai1", isHuman: false }, { id: "ai2", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "ai1": false }))
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": false, "ai2": true })
  })

  it("字符串 'true'/'1' 解析为 true", () => {
    const players = [{ id: "ai1", isHuman: false }, { id: "ai2", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "ai1": "true", "ai2": "1" }))
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": true, "ai2": true })
  })

  it("字符串 'false'/'0' 解析为 false", () => {
    const players = [{ id: "ai1", isHuman: false }, { id: "ai2", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "ai1": "false", "ai2": "0" }))
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": false, "ai2": false })
  })

  it("数字 0 解析为 false，非0解析为 true", () => {
    const players = [{ id: "ai1", isHuman: false }, { id: "ai2", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "ai1": 0, "ai2": 42 }))
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": false, "ai2": true })
  })

  it("非对象 JSON 返回默认值", () => {
    const players = [{ id: "ai1", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, '"string"')
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": true })
  })

  it("JSON 解析失败返回默认值", () => {
    const players = [{ id: "ai1", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, "{invalid json}")
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": true })
  })

  it("存储中有额外键被忽略", () => {
    const players = [{ id: "ai1", isHuman: false }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "ai1": false, "unknown": true }))
    const result = loadAiLlmPlayerSwitches(players)
    expect(result).toEqual({ "ai1": false })
  })
})

describe("llm-settings - saveAiLlmPlayerSwitches", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("保存对象到 localStorage", () => {
    saveAiLlmPlayerSwitches({ "ai1": true, "ai2": false })
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!)).toEqual({ "ai1": true, "ai2": false })
  })

  it("null 值不保存", () => {
    saveAiLlmPlayerSwitches(null)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("非对象不保存", () => {
    saveAiLlmPlayerSwitches("string")
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("数字不保存", () => {
    saveAiLlmPlayerSwitches(123)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("空对象正常保存", () => {
    saveAiLlmPlayerSwitches({})
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).toBe("{}")
  })
})
