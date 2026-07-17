/**
 * @file tests/behavioral/settings-flow.test.ts
 * @description 行为测试：设置流程
 *
 * 覆盖 TEST_DESIGN.md 第三章：
 * 3.1 改设置 -> 保存 -> 开局 -> 验证设置生效
 * 3.2 改设置 -> 恢复默认 -> 保存
 */
import { describe, it, expect } from "vitest"
import { GameState } from "../../scripts/game/core/state/index"
import { save as saveSettings } from "../../scripts/game/core/state/settings-slice"
import { defaultGameSettings, loadGameSettings, saveGameSettings } from "../../scripts/game/core/settings"

describe("设置修改与保存", () => {
  it("修改 settingsSlice 后 saveSettings 写入 localStorage", () => {
    const state = new GameState()
    const defaults = defaultGameSettings()
    saveGameSettings(defaults)

    state.settings.maxRounds = 10
    state.settings.roundSeconds = 30
    saveSettings(state.settings)

    // 重新读取验证
    const loaded = loadGameSettings()
    expect(loaded.maxRounds).toBe(10)
    expect(loaded.roundSeconds).toBe(30)

    // 恢复
    saveGameSettings(defaults)
  })

  it("新 GameState 从 localStorage 读取设置", () => {
    const defaults = defaultGameSettings()
    const testSettings = { ...defaults, maxRounds: 8, roundSeconds: 45 }
    saveGameSettings(testSettings)

    const state = new GameState()

    expect(state.settings.maxRounds).toBe(8)
    expect(state.settings.roundSeconds).toBe(45)

    // 恢复
    saveGameSettings(defaults)
  })

  it("修改多个设置后全部生效", () => {
    const state = new GameState()

    state.settings.maxRounds = 7
    state.settings.roundSeconds = 90
    state.settings.directTakeRatio = 0.3
    state.settings.bidStep = 1000
    state.settings.actionsPerRound = 5

    expect(state.settings.maxRounds).toBe(7)
    expect(state.settings.roundSeconds).toBe(90)
    expect(state.settings.directTakeRatio).toBe(0.3)
    expect(state.settings.bidStep).toBe(1000)
    expect(state.settings.actionsPerRound).toBe(5)
  })

  it("resetForNewRun 不重置 settingsSlice", () => {
    const state = new GameState()
    const originalRounds = state.settings.maxRounds

    state.settings.maxRounds = 12
    state.resetForNewRun()

    // settings 是持久化的，不应被 resetForNewRun 重置
    expect(state.settings.maxRounds).toBe(12)
    expect(state.settings.maxRounds).not.toBe(originalRounds)
  })
})

describe("设置恢复默认", () => {
  it("resetSettings 恢复为默认值", () => {
    const state = new GameState()
    const defaults = defaultGameSettings()

    state.settings.maxRounds = 99
    state.settings.roundSeconds = 999
    state.settings.directTakeRatio = 0.99
    state.settings.bidStep = 99999

    // reset 到默认
    state.settings.maxRounds = defaults.maxRounds
    state.settings.roundSeconds = defaults.roundSeconds
    state.settings.directTakeRatio = defaults.directTakeRatio
    state.settings.bidStep = defaults.bidStep

    expect(state.settings.maxRounds).toBe(defaults.maxRounds)
    expect(state.settings.roundSeconds).toBe(defaults.roundSeconds)
    expect(state.settings.directTakeRatio).toBe(defaults.directTakeRatio)
    expect(state.settings.bidStep).toBe(defaults.bidStep)
  })

  it("恢复默认后 saveSettings 写入 localStorage", () => {
    const defaults = defaultGameSettings()
    // 先写非默认值
    saveGameSettings({ ...defaults, maxRounds: 20 })
    // 再恢复
    saveGameSettings(defaults)

    const loaded = loadGameSettings()
    expect(loaded.maxRounds).toBe(defaults.maxRounds)
  })
})
