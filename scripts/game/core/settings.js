/**
 * @file core/settings.js
 * @module core/settings
 * @description 游戏设置与玩家资金管理。采用 IIFE 模式，挂载到 window.MobaoSettings。
 *              管理游戏规则参数（回合数、出价步长、直接拿下比例等）的持久化存储、
 *              规范化校验、以及玩家资金的读写。
 *
 * 核心职责：
 *   - 游戏设置：loadGameSettings / saveGameSettings / normalizeGameSettings
 *     从 localStorage（mobao_settings_v2）读取设置，所有字段经过 clamp 规范化
 *   - 设置规范化：normalizeGameSettings
 *     每个字段都有合法范围，超出范围自动修正：
 *     - maxRounds: 3-12, roundSeconds: 10-180, directTakeRatio: 0.05-0.6
 *     - bidRevealIntervalMs: 250-1800, postRevealWaitMs: 800-6000
 *     - bidStep: 10-10000, settlementSpeedMultiplier: 0.5-3
 *     - musicVolume/sfxVolume: 0-100
 *   - 玩家资金：loadPlayerMoney / savePlayerMoney
 *     从 localStorage（mobao_player_money_v1）读取，0且无结算标记时回退到默认值
 *   - 全局设置对象：GAME_SETTINGS（模块加载时从 localStorage 恢复）
 *
 * 默认设置（defaultGameSettings）：
 *   maxRounds=5, roundSeconds=60, directTakeRatio=0.2,
 *   bidRevealIntervalMs=650, postRevealWaitMs=3000, bidStep=100,
 *   bidDefaultRaise=500, settlementSpeedMultiplier=1
 *
 * @requires MobaoConstants - 常量（SETTINGS_STORAGE_KEY, PLAYER_MONEY_STORAGE_KEY, DEFAULT_START_MONEY）
 * @requires MobaoUtils     - 工具函数（clamp）
 *
 * @exports window.MobaoSettings - 设置管理单例
 *   关键属性：GAME_SETTINGS（当前生效的游戏设置对象）
 */
(function setupMobaoSettings(global) {
  const { SETTINGS_STORAGE_KEY, PLAYER_MONEY_STORAGE_KEY, DEFAULT_START_MONEY } = global.MobaoConstants;
  const { clamp } = global.MobaoUtils;

  function defaultGameSettings() {
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
    };
  }

  function normalizeSettingsSource(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    return value;
  }

  function normalizeGameSettings(source, fallback) {
    const defaults = normalizeSettingsSource(fallback || defaultGameSettings());
    const input = normalizeSettingsSource(source);

    return {
      maxRounds: clamp(Math.round(input.maxRounds || defaults.maxRounds), 3, 12),
      actionsPerRound: clamp(Math.round(input.actionsPerRound || defaults.actionsPerRound), 1, 999),
      roundSeconds: clamp(Math.round(input.roundSeconds || defaults.roundSeconds), 10, 180),
      directTakeRatio: clamp(Number(input.directTakeRatio || defaults.directTakeRatio), 0.05, 0.6),
      bidRevealIntervalMs: clamp(Math.round(input.bidRevealIntervalMs || defaults.bidRevealIntervalMs), 250, 1800),
      postRevealWaitMs: clamp(Math.round(input.postRevealWaitMs || defaults.postRevealWaitMs), 800, 6000),
      bidStep: clamp(Math.round(input.bidStep || defaults.bidStep), 10, 10000),
      bidDefaultRaise: clamp(Math.round(input.bidDefaultRaise || defaults.bidDefaultRaise), 0, 50000),
      settlementSpeedMultiplier: clamp(Number(input.settlementSpeedMultiplier || defaults.settlementSpeedMultiplier), 0.5, 3),
      musicVolume: clamp(Math.round(input.musicVolume || defaults.musicVolume), 0, 100),
      sfxVolume: clamp(Math.round(input.sfxVolume || defaults.sfxVolume), 0, 100)
    };
  }

  function loadGameSettings() {
    const defaults = defaultGameSettings();
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(raw);
      return normalizeGameSettings(parsed, defaults);
    } catch (_error) {
      return defaults;
    }
  }

  function saveGameSettings(value) {
    const normalized = normalizeGameSettings(value, defaultGameSettings());
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  }

  function loadPlayerMoney() {
    const raw = window.localStorage.getItem(PLAYER_MONEY_STORAGE_KEY);
    const settledRunToken = window.localStorage.getItem("mobao_money_settled_run");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return DEFAULT_START_MONEY;
    }

    if (parsed === 0 && !settledRunToken) {
      return DEFAULT_START_MONEY;
    }

    return Math.round(parsed);
  }

  function savePlayerMoney(value) {
    window.localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, String(Math.max(0, Math.round(value))));
  }

  let GAME_SETTINGS = loadGameSettings();
  GAME_SETTINGS.actionsPerRound = 99;

  global.MobaoSettings = {
    defaultGameSettings,
    normalizeSettingsSource,
    normalizeGameSettings,
    loadGameSettings,
    saveGameSettings,
    loadPlayerMoney,
    savePlayerMoney,
    GAME_SETTINGS
  };
})(window);
