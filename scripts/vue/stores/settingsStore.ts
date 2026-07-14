import { defineStore } from 'pinia'

export interface GameSettings {
  roundSeconds: number
  musicVolume: number
  sfxVolume: number
  settlementSpeedMultiplier: number
}

export interface LlmSettings {
  provider: string
  apiKey: string
  endpoint: string
  model: string
  enabled: boolean
}

export interface AiModelConfig {
  playerId: string
  providerId: string
  model: string
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    game: {} as GameSettings,
    llm: {} as LlmSettings,
    aiModelConfigs: [] as AiModelConfig[],
    dirty: false, // 是否有未保存的更改
  }),

  actions: {
    // Phase 3 填充
  },
})