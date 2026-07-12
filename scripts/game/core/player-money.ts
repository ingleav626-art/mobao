/**
 * @file core/player-money.ts
 * @module core/player-money
 * @description 玩家资金管理。提供玩家资金的读取与持久化存储。
 *
 * @requires core/constants - 存储键名与默认资金常量
 */

import { PLAYER_MONEY_STORAGE_KEY, DEFAULT_START_MONEY, MONEY_SETTLED_RUN_STORAGE_KEY } from "./constants"

export function loadPlayerMoney(): number {
  const raw = window.localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)
  const settledRunToken = window.localStorage.getItem(MONEY_SETTLED_RUN_STORAGE_KEY)
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
