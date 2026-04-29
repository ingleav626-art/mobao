(function setupMobaoConstants(global) {
  const GRID_COLS = 12;
  const GRID_ROWS = 25;
  const CELL_SIZE = 64;
  const MARGIN = 16;
  const CANVAS_NATIVE_HEIGHT = MARGIN * 2 + GRID_ROWS * CELL_SIZE;
  const MAX_WAREHOUSE_CELLS = 300;
  const ARTIFACT_COUNT_RANGE = { min: 50, max: 300 };
  const WAREHOUSE_OCCUPANCY_RATIO_RANGE = { min: 0.38, max: 0.88 };

  const SETTINGS_STORAGE_KEY = "mobao_settings_v2";
  const PLAYER_MONEY_STORAGE_KEY = "mobao_player_money_v1";
  const AI_LLM_SWITCH_STORAGE_KEY = "mobao_ai_llm_switch_v1";
  const BATTLE_RECORD_STORAGE_KEY = "mobao_battle_records_v1";
  const AI_MEMORY_STORAGE_KEY = "mobao_ai_memory_v1";

  const DEFAULT_START_MONEY = 3000000;

  const SETTINGS_FIELDS = [
    "revealSpeedMultiplier",
    "searchSpeedMultiplier",
    "musicVolume",
    "sfxVolume"
  ];

  const QUALITY_COLORS = {
    poor: 0x8b7355,
    normal: 0x6b8e23,
    fine: 0x4169e1,
    rare: 0x9932cc,
    legendary: 0xffd700
  };

  const QUALITY_ORDER = ["poor", "normal", "fine", "rare", "legendary"];

  const QUALITY_LABELS = {
    poor: "粗",
    normal: "良",
    fine: "精",
    rare: "珍",
    legendary: "绝"
  };

  global.MobaoConstants = {
    GRID_COLS,
    GRID_ROWS,
    CELL_SIZE,
    MARGIN,
    CANVAS_NATIVE_HEIGHT,
    MAX_WAREHOUSE_CELLS,
    ARTIFACT_COUNT_RANGE,
    WAREHOUSE_OCCUPANCY_RATIO_RANGE,
    SETTINGS_STORAGE_KEY,
    PLAYER_MONEY_STORAGE_KEY,
    AI_LLM_SWITCH_STORAGE_KEY,
    BATTLE_RECORD_STORAGE_KEY,
    AI_MEMORY_STORAGE_KEY,
    DEFAULT_START_MONEY,
    SETTINGS_FIELDS,
    QUALITY_COLORS,
    QUALITY_ORDER,
    QUALITY_LABELS
  };
})(window);
