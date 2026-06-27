/**
 * @file core/settings.ts
 * @module core/settings
 * @description 游戏设置与玩家资金管理。管理游戏规则参数的持久化存储、规范化校验、以及玩家资金的读写。
 *
 * @exports window.MobaoSettings - 设置管理单例（兼容）
 *
 * @requires core/settings - 游戏设置管理
 */

export interface GameSettingsData {
  maxRounds: number
  actionsPerRound: number
  roundSeconds: number
  directTakeRatio: number
  bidRevealIntervalMs: number
  postRevealWaitMs: number
  bidStep: number
  bidDefaultRaise: number
  settlementSpeedMultiplier: number
  musicVolume: number
  sfxVolume: number
}

import { SETTINGS_STORAGE_KEY, PLAYER_MONEY_STORAGE_KEY, DEFAULT_START_MONEY } from "./constants"
import { clamp } from "./utils"

export function defaultGameSettings(): GameSettingsData {
  return {
    maxRounds: 5,
    actionsPerRound: 99,
    roundSeconds: 60,
    directTakeRatio: 0.2,
    bidRevealIntervalMs: 650,
    postRevealWaitMs: 3000,
    bidStep: 100,
    bidDefaultRaise: 500,
    settlementSpeedMultiplier: 1,
    musicVolume: 70,
    sfxVolume: 80
  }
}

/**
 * 规范化设置源对象
 * @param value 输入值（来自 localStorage，结构不确定）
 * @returns 规范化后的对象（强制类型断言后使用）
 */
export function normalizeSettingsSource(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

/**
 * 规范化游戏设置
 * @param source 输入设置对象（来自 localStorage，结构不确定）
 * @param fallback 默认值（结构不确定）
 * @returns 规范化后的游戏设置（强制类型断言后使用）
 */
export function normalizeGameSettings(source: unknown, fallback?: unknown): GameSettingsData {
  const defaults = normalizeSettingsSource(fallback || defaultGameSettings()) as Record<string, unknown>
  const input = normalizeSettingsSource(source) as Record<string, unknown>

  return {
    maxRounds: clamp(Math.round(Number(input.maxRounds || defaults.maxRounds)), 3, 12),
    actionsPerRound: clamp(Math.round(Number(input.actionsPerRound || defaults.actionsPerRound)), 1, 999),
    roundSeconds: clamp(Math.round(Number(input.roundSeconds || defaults.roundSeconds)), 10, 180),
    directTakeRatio: clamp(Number(input.directTakeRatio || defaults.directTakeRatio), 0.05, 0.6),
    bidRevealIntervalMs: clamp(Math.round(Number(input.bidRevealIntervalMs || defaults.bidRevealIntervalMs)), 250, 1800),
    postRevealWaitMs: clamp(Math.round(Number(input.postRevealWaitMs || defaults.postRevealWaitMs)), 800, 6000),
    bidStep: clamp(Math.round(Number(input.bidStep || defaults.bidStep)), 10, 10000),
    bidDefaultRaise: clamp(Math.round(Number(input.bidDefaultRaise || defaults.bidDefaultRaise)), 0, 50000),
    settlementSpeedMultiplier: clamp(
      Number(input.settlementSpeedMultiplier || defaults.settlementSpeedMultiplier),
      0.5,
      3
    ),
    musicVolume: clamp(Math.round(Number(input.musicVolume || defaults.musicVolume)), 0, 100),
    sfxVolume: clamp(Math.round(Number(input.sfxVolume || defaults.sfxVolume)), 0, 100)
  }
}

export function loadGameSettings(): GameSettingsData {
  const defaults = defaultGameSettings()
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  if (!raw) {
    return defaults
  }

  try {
    const parsed = JSON.parse(raw)
    return normalizeGameSettings(parsed, defaults)
  } catch (_error) {
    return defaults
  }
}

/**
 * 保存游戏设置
 * @param value 设置对象（来自外部输入，结构不确定）
 */
export function saveGameSettings(value: unknown): void {
  const normalized = normalizeGameSettings(value, defaultGameSettings())
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
}

export function loadPlayerMoney(): number {
  const raw = window.localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)
  const settledRunToken = window.localStorage.getItem("mobao_money_settled_run")
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_START_MONEY
  }

  if (parsed === 0 && !settledRunToken) {
    return DEFAULT_START_MONEY
  }

  return Math.round(parsed)
}

export function savePlayerMoney(value: number): void {
  window.localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, String(Math.max(0, Math.round(value))))
}

export let GAME_SETTINGS: GameSettingsData = loadGameSettings()
GAME_SETTINGS.actionsPerRound = 99