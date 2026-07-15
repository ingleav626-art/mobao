import { defineStore } from "pinia"
import type { GameSettingsData } from "../../game/core/settings"
import { defaultGameSettings, normalizeGameSettings, saveGameSettings } from "../../game/core/settings"

export interface LlmSettings {
  provider: string
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
  maxTokens: number
  timeoutMs: number
  multiGameMemoryEnabled: boolean
  reflectionEnabled: boolean
  thinkingEnabled: boolean
  independentModelEnabled: boolean
  contextLength: number
  autoSummarizeEnabled: boolean
  reflectionScope: string
  independentReflectionEnabled: boolean
  thinkingParams: string
}

export interface AiModelConfig {
  playerId: string
  providerId: string
  model: string
}

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    game: defaultGameSettings() as GameSettingsData,
    llm: {
      provider: "deepseek",
      apiKey: "",
      endpoint: "",
      model: "",
      enabled: false,
      maxTokens: 2048,
      timeoutMs: 40000,
      multiGameMemoryEnabled: false,
      reflectionEnabled: false,
      thinkingEnabled: false,
      independentModelEnabled: false,
      contextLength: 5,
      autoSummarizeEnabled: true,
      reflectionScope: "current",
      independentReflectionEnabled: true,
      thinkingParams: ""
    } as LlmSettings,
    aiModelConfigs: [] as AiModelConfig[],
    dirty: false,
    isSettingsOpen: false
  }),

  actions: {
    openSettings(): void {
      this.isSettingsOpen = true
    },

    closeSettings(): void {
      this.isSettingsOpen = false
    },

    /** 从 game/core/settings 加载游戏设置到 store */
    loadGameSettings(): void {
      const loaded = normalizeGameSettings(
        window.localStorage.getItem("mobao_settings")
          ? JSON.parse(window.localStorage.getItem("mobao_settings")!)
          : null,
        defaultGameSettings()
      )
      this.game = loaded
    },

    /** 保存游戏设置到 localStorage 并更新 store */
    saveGameSettingsToStore(): void {
      saveGameSettings(this.game)
    },

    /** 更新游戏设置单个字段 */
    updateGameField<K extends keyof GameSettingsData>(field: K, value: GameSettingsData[K]): void {
      this.game[field] = value
      this.dirty = true
    },

    /** 更新 LLM 设置单个字段 */
    updateLlmField<K extends keyof LlmSettings>(field: K, value: LlmSettings[K]): void {
      this.llm[field] = value
      this.dirty = true
    },

    /** 从外部对象同步游戏设置（用于桥接） */
    syncGameSettings(settings: GameSettingsData): void {
      this.game = { ...settings }
    },

    /** 从外部对象同步 LLM 设置（用于桥接） */
    syncLlmSettings(settings: Partial<LlmSettings>): void {
      this.llm = { ...this.llm, ...settings }
    },

    /** 重置脏标记 */
    resetDirty(): void {
      this.dirty = false
    }
  }
})
