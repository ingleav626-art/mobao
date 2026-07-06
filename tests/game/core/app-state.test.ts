import { describe, it, expect, beforeEach } from "vitest"
import {
  load,
  save,
  patch,
  get,
  set,
  reset,
  recordGameFinished,
  type AppStateData
} from "../../../scripts/game/core/app-state"

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

beforeEach(() => {
  window.localStorage.clear()
})

describe("app-state - load", () => {
  it("空存储返回默认状态", () => {
    expect(load()).toEqual(DEFAULT_STATE)
  })

  it("损坏 JSON 返回默认状态", () => {
    window.localStorage.setItem(APP_STATE_KEY, "{invalid")
    expect(load()).toEqual(DEFAULT_STATE)
  })

  it("合法存储合并默认值", () => {
    const partial = { totalGamesPlayed: 5, totalWins: 3 }
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(partial))
    const state = load()
    expect(state.totalGamesPlayed).toBe(5)
    expect(state.totalWins).toBe(3)
    expect(state.appMode).toBe("lobby") // 默认值
    expect(state.lobbyTab).toBe("solo")
  })
})

describe("app-state - save", () => {
  it("保存状态到 localStorage", () => {
    const state: AppStateData = { ...DEFAULT_STATE, totalGamesPlayed: 10 }
    save(state)
    const raw = window.localStorage.getItem(APP_STATE_KEY)
    expect(JSON.parse(raw as string).totalGamesPlayed).toBe(10)
  })
})

describe("app-state - patch", () => {
  it("部分更新合并到当前状态", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 5 })
    const merged = patch({ totalWins: 2 })
    expect(merged.totalGamesPlayed).toBe(5)
    expect(merged.totalWins).toBe(2)
  })

  it("空 patch 保持原值", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 5 })
    const merged = patch({})
    expect(merged.totalGamesPlayed).toBe(5)
  })
})

describe("app-state - get", () => {
  it("无参数返回完整状态", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 3 })
    const state = get()
    expect(state.totalGamesPlayed).toBe(3)
  })

  it("指定 key 返回对应值", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 3, lobbyTab: "online" })
    expect(get("totalGamesPlayed")).toBe(3)
    expect(get("lobbyTab")).toBe("online")
  })

  it("未知 key 返回 undefined", () => {
    expect(get("nonexistent")).toBeUndefined()
  })
})

describe("app-state - set", () => {
  it("设置单个键值", () => {
    set("totalGamesPlayed", 42)
    expect(get("totalGamesPlayed")).toBe(42)
  })

  it("设置新键", () => {
    set("customKey", "customValue")
    expect(get("customKey")).toBe("customValue")
  })
})

describe("app-state - reset", () => {
  it("重置为默认状态", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 100, totalWins: 50 })
    const state = reset()
    expect(state).toEqual(DEFAULT_STATE)
    expect(load()).toEqual(DEFAULT_STATE)
  })
})

describe("app-state - recordGameFinished", () => {
  it("胜利时增加游戏数和胜利数", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 5, totalWins: 2, totalProfit: 1000 })
    const state = recordGameFinished(true, 500)
    expect(state.totalGamesPlayed).toBe(6)
    expect(state.totalWins).toBe(3)
    expect(state.totalProfit).toBe(1500)
    expect(state.lastPlayedAt).toBeGreaterThan(0)
  })

  it("失败时只增加游戏数", () => {
    save({ ...DEFAULT_STATE, totalGamesPlayed: 5, totalWins: 2, totalProfit: 1000 })
    const state = recordGameFinished(false, -200)
    expect(state.totalGamesPlayed).toBe(6)
    expect(state.totalWins).toBe(2) // 不变
    expect(state.totalProfit).toBe(800)
  })

  it("零利润正常记录", () => {
    const state = recordGameFinished(true, 0)
    expect(state.totalGamesPlayed).toBe(1)
    expect(state.totalProfit).toBe(0)
  })
})
