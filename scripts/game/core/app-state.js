/**
 * @file core/app-state.js
 * @module core/app-state
 * @description 应用全局状态管理。采用 IIFE + 闭包模式，挂载到 window.MobaoAppState。
 *              管理应用的持久化状态（当前模式、大厅标签页、地图选择、游戏统计等），
 *              通过 localStorage 持久化，提供 load/save/patch/get/set/reset 等操作。
 *
 * 核心职责：
 *   - 状态持久化：load / save / patch
 *     从 localStorage（mobao_app_state_v1）读取/写入应用状态
 *   - 键值访问：get(key) / set(key, value)
 *     便捷的单字段读写，自动合并后持久化
 *   - 游戏统计：recordGameFinished(playerWon, profit)
 *     对局结束时更新总局数、胜场、累计利润、最后游玩时间
 *   - 状态重置：reset()
 *     恢复到默认状态
 *
 * 默认状态（DEFAULT_STATE）：
 *   {
 *     appMode: "lobby",           // 当前应用模式
 *     gameSource: null,           // 游戏来源
 *     lobbyTab: "solo",           // 大厅当前标签页
 *     selectedMapProfile: "default", // 选中的地图配置
 *     lastPlayedAt: null,         // 最后游玩时间戳
 *     totalGamesPlayed: 0,        // 总局数
 *     totalWins: 0,               // 胜场数
 *     totalProfit: 0              // 累计利润
 *   }
 *
 * 存储键：mobao_app_state_v1
 *
 * @exports window.MobaoAppState - 应用状态管理单例
 *
 * 使用方式：
 *   MobaoAppState.set("lobbyTab", "lan");
 *   const tab = MobaoAppState.get("lobbyTab");
 *   MobaoAppState.recordGameFinished(true, 150000);
 */
window.MobaoAppState = (function () {
  const APP_STATE_KEY = "mobao_app_state_v1";

  const DEFAULT_STATE = {
    appMode: "lobby",
    gameSource: null,
    lobbyTab: "solo",
    selectedMapProfile: "default",
    lastPlayedAt: null,
    totalGamesPlayed: 0,
    totalWins: 0,
    totalProfit: 0
  };

  function load() {
    try {
      const raw = window.localStorage.getItem(APP_STATE_KEY);
      if (!raw) {
        return { ...DEFAULT_STATE };
      }
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed };
    } catch (_e) {
      return { ...DEFAULT_STATE };
    }
  }

  function save(state) {
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    } catch (_e) {
      // storage full or unavailable
    }
  }

  function patch(partial) {
    const current = load();
    const merged = { ...current, ...partial };
    save(merged);
    return merged;
  }

  function get(key) {
    const state = load();
    return key ? state[key] : state;
  }

  function set(key, value) {
    const current = load();
    current[key] = value;
    save(current);
    return current;
  }

  function reset() {
    save({ ...DEFAULT_STATE });
    return { ...DEFAULT_STATE };
  }

  function recordGameFinished(playerWon, profit) {
    const current = load();
    current.totalGamesPlayed = (current.totalGamesPlayed || 0) + 1;
    if (playerWon) {
      current.totalWins = (current.totalWins || 0) + 1;
    }
    current.totalProfit = (current.totalProfit || 0) + (profit || 0);
    current.lastPlayedAt = Date.now();
    save(current);
    return current;
  }

  return {
    APP_STATE_KEY,
    DEFAULT_STATE,
    load,
    save,
    patch,
    get,
    set,
    reset,
    recordGameFinished
  };
})();
