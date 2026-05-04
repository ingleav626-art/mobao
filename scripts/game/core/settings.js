(function setupMobaoSettings(global) {
  const { SETTINGS_STORAGE_KEY, PLAYER_MONEY_STORAGE_KEY, DEFAULT_START_MONEY } = global.MobaoConstants;
  const { clamp } = global.MobaoUtils;

  function defaultGameSettings() {
    return {
      maxRounds: 5,
      actionsPerRound: 2,
      roundSeconds: 40,
      directTakeRatio: 0.2,
      bidRevealIntervalMs: 650,
      postRevealWaitMs: 3000,
      bidStep: 100,
      bidDefaultRaise: 500,
      revealSpeedMultiplier: 1,
      searchSpeedMultiplier: 1,
      musicVolume: 70,
      sfxVolume: 80,
      showQualityText: true
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
      actionsPerRound: clamp(Math.round(input.actionsPerRound || defaults.actionsPerRound), 1, 4),
      roundSeconds: clamp(Math.round(input.roundSeconds || defaults.roundSeconds), 10, 60),
      directTakeRatio: clamp(Number(input.directTakeRatio || defaults.directTakeRatio), 0.05, 0.6),
      bidRevealIntervalMs: clamp(Math.round(input.bidRevealIntervalMs || defaults.bidRevealIntervalMs), 250, 1800),
      postRevealWaitMs: clamp(Math.round(input.postRevealWaitMs || defaults.postRevealWaitMs), 800, 6000),
      bidStep: clamp(Math.round(input.bidStep || defaults.bidStep), 10, 10000),
      bidDefaultRaise: clamp(Math.round(input.bidDefaultRaise || defaults.bidDefaultRaise), 0, 50000),
      revealSpeedMultiplier: clamp(Number(input.revealSpeedMultiplier || defaults.revealSpeedMultiplier), 0.5, 2.2),
      searchSpeedMultiplier: clamp(Number(input.searchSpeedMultiplier || defaults.searchSpeedMultiplier), 0.5, 2.5),
      musicVolume: clamp(Math.round(input.musicVolume || defaults.musicVolume), 0, 100),
      sfxVolume: clamp(Math.round(input.sfxVolume || defaults.sfxVolume), 0, 100),
      showQualityText: input.showQualityText !== undefined ? Boolean(input.showQualityText) : defaults.showQualityText
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

  const GAME_SETTINGS = loadGameSettings();

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
