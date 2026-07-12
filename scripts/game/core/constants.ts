/**
 * @file core/constants.ts
 * @module core/constants
 * @description 游戏全局常量定义。定义仓库网格布局、Canvas尺寸、存储键名、品质颜色/排序/标签等
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
 *   - AI_MEMORY_STORAGE_KEY = "mobao_ai_memory_v1"
 *   - AI_WALLET_STORAGE_KEY = "mobao_ai_wallets_v1"
 *   - APP_STATE_STORAGE_KEY = "mobao_app_state_v1"
 *   - SELECTED_MAP_STORAGE_KEY = "mobao_selected_map_v1"
 *   - SELECTED_CHARACTER_STORAGE_KEY = "mobao_selected_character_v1"
 *   - SHOP_INVENTORY_STORAGE_KEY = "mobao_shop_inventory_v1"
 *   - SHOP_REFRESH_DATE_STORAGE_KEY = "mobao_shop_refresh_date_v1"
 *   - SHOP_LIMITED_OFFER_STORAGE_KEY = "mobao_shop_limited_offer_v1"
 *   - CARRY_ITEMS_STORAGE_KEY = "mobao_carry_items_v1"
 *
 * @exports MobaoConstants - 全局常量对象
 */

export const GRID_COLS: number = 12
export const GRID_ROWS: number = 25
export const CELL_SIZE: number = 64
export const MARGIN: number = 0
export const CANVAS_NATIVE_HEIGHT: number = MARGIN * 2 + GRID_ROWS * CELL_SIZE
export const MAX_WAREHOUSE_CELLS: number = 300
export const ARTIFACT_COUNT_RANGE: { min: number; max: number } = { min: 50, max: 300 }
export const WAREHOUSE_OCCUPANCY_RATIO_RANGE: { min: number; max: number } = { min: 0.38, max: 0.88 }

export const SETTINGS_STORAGE_KEY: string = "mobao_settings_v2"
export const PLAYER_MONEY_STORAGE_KEY: string = "mobao_player_money_v1"
export const AI_LLM_SWITCH_STORAGE_KEY: string = "mobao_ai_llm_switch_v1"
export const BATTLE_RECORD_STORAGE_KEY: string = "mobao_battle_records_v1"
export const AI_MEMORY_STORAGE_KEY: string = "mobao_ai_memory_v1"
export const APP_STATE_STORAGE_KEY: string = "mobao_app_state_v1"

export const DEFAULT_START_MONEY: number = 3000000

export const SETTINGS_FIELDS: string[] = ["roundSeconds", "settlementSpeedMultiplier", "musicVolume", "sfxVolume"]

export const QUALITY_COLORS: Record<string, number> = {
  poor: 0x8b7355,
  normal: 0x6b8e23,
  fine: 0x4169e1,
  rare: 0x9932cc,
  legendary: 0xffd700
}

export const QUALITY_ORDER: string[] = ["poor", "normal", "fine", "rare", "legendary"]

export const QUALITY_LABELS: Record<string, string> = {
  poor: "粗",
  normal: "良",
  fine: "精",
  rare: "珍",
  legendary: "绝"
}