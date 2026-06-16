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

const APP_STATE_KEY = "mobao_app_state_v1"

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

export function get(key: string): any
export function get(): AppStateData
export function get(key?: string): any {
  const state = load()
  return key ? (state as any)[key] : state
}

export function set(key: string, value: any): AppStateData {
  const current = load()
  ;(current as any)[key] = value
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