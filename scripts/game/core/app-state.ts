/**
 * @file core/app-state.ts
 * @module core/app-state
 * @description 应用全局状态管理。管理应用的持久化状态（当前模式、大厅标签页、地图选择、游戏统计等），
 *              通过 localStorage 持久化，提供 load/save/patch/get/set/reset 等操作。
 *
 * 存储键：mobao_app_state_v1
 *
 * @exports window.MobaoAppState - 应用状态管理单例（兼容）
 * @exports load, save, patch, get, set, reset, recordGameFinished - 命名导出
 *
 * @requires core/app-state - 应用全局状态管理
 */

import { APP_STATE_STORAGE_KEY } from "./constants"

export interface AppStateData {
  appMode: string
  gameSource: string | null
  lobbyTab: string
  selectedMapProfile: string
  lastPlayedAt: number | null
  totalGamesPlayed: number
  totalWins: number
  totalProfit: number
}

const APP_STATE_KEY = APP_STATE_STORAGE_KEY

const DEFAULT_STATE: AppStateData = {
  appMode: "lobby",
  gameSource: null,
  lobbyTab: "solo",
  selectedMapProfile: "default",
  lastPlayedAt: null,
  totalGamesPlayed: 0,
  totalWins: 0,
  totalProfit: 0
}

export function load(): AppStateData {
  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY)
    if (!raw) {
      return { ...DEFAULT_STATE }
    }
    const parsed = JSON.parse(raw) as Partial<AppStateData>
    return { ...DEFAULT_STATE, ...parsed }
  } catch (_e) {
    return { ...DEFAULT_STATE }
  }
}

export function save(state: AppStateData): void {
  try {
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state))
  } catch (_e) {
    // storage full or unavailable
  }
}

export function patch(partial: Partial<AppStateData>): AppStateData {
  const current = load()
  const merged = { ...current, ...partial }
  save(merged)
  return merged
}

/**
 * 获取应用状态值
 * @param key 状态键名（可选）
 * @returns 状态值（结构不确定，来自 localStorage）或完整状态对象
 *          使用 unknown 强制调用者做类型检查后再使用
 */
export function get(key: string): unknown
export function get(): AppStateData
export function get(key?: string): unknown | AppStateData {
  const state = load()
  return key ? (state as unknown as Record<string, unknown>)[key] : state
}

/**
 * 设置应用状态值
 * @param key 状态键名
 * @param value 状态值（结构不确定，来自外部输入）
 * @returns 更新后的状态对象
 */
export function set(key: string, value: unknown): AppStateData {
  const current = load()
    ; (current as unknown as Record<string, unknown>)[key] = value
  save(current)
  return current
}

export function reset(): AppStateData {
  save({ ...DEFAULT_STATE })
  return { ...DEFAULT_STATE }
}

export function recordGameFinished(playerWon: boolean, profit: number): AppStateData {
  const current = load()
  current.totalGamesPlayed = (current.totalGamesPlayed || 0) + 1
  if (playerWon) {
    current.totalWins = (current.totalWins || 0) + 1
  }
  current.totalProfit = (current.totalProfit || 0) + (profit || 0)
  current.lastPlayedAt = Date.now()
  save(current)
  return current
}