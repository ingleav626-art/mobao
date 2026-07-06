import { describe, it, expect, beforeEach } from "vitest"
import { createLlmSettingsModule } from "../../../scripts/llm/core/llm-settings"
import { AI_LLM_SWITCH_STORAGE_KEY } from "../../../scripts/game/core/constants"

const mockDeps = {
  AI_LLM_SWITCH_STORAGE_KEY,
  LLM_SETTINGS: { enabled: false },
  maskApiKey: (key: string) => key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "(empty)"
}

const { loadAiLlmPlayerSwitches, saveAiLlmPlayerSwitches } = createLlmSettingsModule(mockDeps)

const AI_PLAYERS = [
  { id: "p1", isHuman: false },
  { id: "p3", isHuman: false },
  { id: "p4", isHuman: false },
  { id: "human", isHuman: true }
]

beforeEach(() => {
  localStorage.clear()
})

describe("llm-settings - loadAiLlmPlayerSwitches", () => {
  it("空存储返回默认值（所有 AI 为 true）", () => {
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
    expect(result.p3).toBe(true)
    expect(result.p4).toBe(true)
    expect(result.human).toBeUndefined()
  })

  it("无 players 参数返回空对象", () => {
    const result = loadAiLlmPlayerSwitches([])
    expect(result).toEqual({})
  })

  it("null players 返回空对象", () => {
    const result = loadAiLlmPlayerSwitches(null as unknown as [])
    expect(result).toEqual({})
  })

  it("损坏 JSON 返回默认值", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, "{invalid")
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
  })

  it("非对象 JSON 返回默认值", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify([1, 2, 3]))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
  })

  it("布尔值正确合并", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ p1: false, p3: true }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(false)
    expect(result.p3).toBe(true)
    expect(result.p4).toBe(true) // 默认值
  })

  it("字符串 'true'/'1' 转为 true", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ p1: "true", p3: "1" }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
    expect(result.p3).toBe(true)
  })

  it("字符串 'false'/'0' 转为 false", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ p1: "false", p3: "0" }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(false)
    expect(result.p3).toBe(false)
  })

  it("非零数字转为 true，零转为 false", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ p1: 1, p3: 0 }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
    expect(result.p3).toBe(false)
  })

  it("其他类型字符串保持默认值", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ p1: "maybe" }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true) // 默认值
  })

  it("未知玩家 ID 被忽略", () => {
    localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify({ unknownPlayer: false }))
    const result = loadAiLlmPlayerSwitches(AI_PLAYERS)
    expect(result.p1).toBe(true)
    expect(result.unknownPlayer).toBeUndefined()
  })
})

describe("llm-settings - saveAiLlmPlayerSwitches", () => {
  it("保存对象到 localStorage", () => {
    saveAiLlmPlayerSwitches({ p1: false, p3: true })
    const raw = localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY)
    expect(JSON.parse(raw as string)).toEqual({ p1: false, p3: true })
  })

  it("null 不保存", () => {
    saveAiLlmPlayerSwitches(null)
    expect(localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY)).toBeNull()
  })

  it("非对象不保存", () => {
    saveAiLlmPlayerSwitches("string" as unknown as Record<string, boolean>)
    expect(localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY)).toBeNull()
  })
})
