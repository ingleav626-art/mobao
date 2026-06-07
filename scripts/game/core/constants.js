/**
 * @file core/constants.js
 * @module core/constants
 * @description 游戏全局常量定义。采用 IIFE 模式，挂载到 window.MobaoConstants。
 *              定义仓库网格布局、Canvas尺寸、存储键名、品质颜色/排序/标签等
 *              跨模块共享的常量。是整个项目的"配置中心"，其他模块通过
 *              global.MobaoConstants 引用。
 *
 * 常量分类：
 *
 * 仓库网格布局：
 *   - GRID_COLS = 12, GRID_ROWS = 25, CELL_SIZE = 64, MARGIN = 0
 *   - CANVAS_NATIVE_HEIGHT = MARGIN*2 + GRID_ROWS*CELL_SIZE = 1600
 *   - MAX_WAREHOUSE_CELLS = 300
 *   - ARTIFACT_COUNT_RANGE = { min: 50, max: 300 }
 *   - WAREHOUSE_OCCUPANCY_RATIO_RANGE = { min: 0.38, max: 0.88 }
 *
 * 存储键名：
 *   - SETTINGS_STORAGE_KEY = "mobao_settings_v2"
 *   - PLAYER_MONEY_STORAGE_KEY = "mobao_player_money_v1"
 *   - AI_LLM_SWITCH_STORAGE_KEY = "mobao_ai_llm_switch_v1"
 *   - BATTLE_RECORD_STORAGE_KEY = "mobao_battle_records_v1"
 *   - AI_MEMORY_STORAGE_KEY = "mobao_ai_memory_v1"
 *
 * 游戏参数：
 *   - DEFAULT_START_MONEY = 3,000,000
 *
 * 品质系统：
 *   - QUALITY_COLORS: { poor: 0x8b7355, normal: 0x6b8e23, fine: 0x4169e1, rare: 0x9932cc, legendary: 0xffd700 }
 *   - QUALITY_ORDER: ["poor", "normal", "fine", "rare", "legendary"]
 *   - QUALITY_LABELS: { poor: "粗", normal: "良", fine: "精", rare: "珍", legendary: "绝" }
 *
 * @exports window.MobaoConstants - 全局常量对象
 */
export const GRID_COLS = 12
export const GRID_ROWS = 25
export const CELL_SIZE = 64
export const MARGIN = 0
export const CANVAS_NATIVE_HEIGHT = MARGIN * 2 + GRID_ROWS * CELL_SIZE
export const MAX_WAREHOUSE_CELLS = 300
export const ARTIFACT_COUNT_RANGE = { min: 50, max: 300 }
export const WAREHOUSE_OCCUPANCY_RATIO_RANGE = { min: 0.38, max: 0.88 }

export const SETTINGS_STORAGE_KEY = "mobao_settings_v2"
export const PLAYER_MONEY_STORAGE_KEY = "mobao_player_money_v1"
export const AI_LLM_SWITCH_STORAGE_KEY = "mobao_ai_llm_switch_v1"
export const BATTLE_RECORD_STORAGE_KEY = "mobao_battle_records_v1"
export const AI_MEMORY_STORAGE_KEY = "mobao_ai_memory_v1"

export const DEFAULT_START_MONEY = 3000000

export const SETTINGS_FIELDS = ["roundSeconds", "settlementSpeedMultiplier", "musicVolume", "sfxVolume"]

export const QUALITY_COLORS = {
  poor: 0x8b7355,
  normal: 0x6b8e23,
  fine: 0x4169e1,
  rare: 0x9932cc,
  legendary: 0xffd700
}

export const QUALITY_ORDER = ["poor", "normal", "fine", "rare", "legendary"]

export const QUALITY_LABELS = {
  poor: "粗",
  normal: "良",
  fine: "精",
  rare: "珍",
  legendary: "绝"
}

// 兼容层：保持 window.MobaoConstants 全局变量可用
window.MobaoConstants = {
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
}
