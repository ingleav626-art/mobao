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
