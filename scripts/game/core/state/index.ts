import type { AiSlice } from "./ai-slice"
import type { GameSlice } from "./game-slice"
import type { LanSlice } from "./lan-slice"
import type { RecordSlice } from "./record-slice"
import type { SettingsSlice } from "./settings-slice"
import type { UiSlice } from "./ui-slice"
import type { WarehouseSlice } from "./warehouse-slice"
import { createAiSlice, resetForNewRun as resetAiForNewRun, resetForNewRound as resetAiForNewRound } from "./ai-slice"
import { createGameSlice, resetForNewRun as resetGameForNewRun, resetForNewRound as resetGameForNewRound } from "./game-slice"
import { createLanSlice, resetLanState, resetLanGameState as resetLanGameStateFn, disconnectLan as disconnectLanFn } from "./lan-slice"
import { createRecordSlice, reset as resetRecord } from "./record-slice"
import { createSettingsSlice } from "./settings-slice"
import { createUiSlice } from "./ui-slice"
import { createWarehouseSlice, reset as resetWarehouse } from "./warehouse-slice"

export class GameState {
  game: GameSlice
  lan: LanSlice
  ai: AiSlice
  warehouse: WarehouseSlice
  record: RecordSlice
  ui: UiSlice
  settings: SettingsSlice

  constructor() {
    this.game = createGameSlice()
    this.lan = createLanSlice()
    this.ai = createAiSlice()
    this.warehouse = createWarehouseSlice()
    this.record = createRecordSlice()
    this.ui = createUiSlice()
    this.settings = createSettingsSlice()
  }

  resetForNewRun(): void {
    resetGameForNewRun(this.game)
    resetAiForNewRun(this.ai)
    resetWarehouse(this.warehouse)
    resetRecord(this.record)
  }

  resetLanState(): void {
    resetLanState(this.lan)
  }

  resetLanGameState(): void {
    resetLanGameStateFn(this.lan)
  }

  disconnectLan(): void {
    disconnectLanFn(this.lan)
  }

  resetForNewRound(): void {
    resetGameForNewRound(this.game)
    resetAiForNewRound(this.ai)
  }

  resetAll(): void {
    this.resetForNewRun()
    this.resetLanState()
  }
}

export type { AiSlice, GameSlice, LanSlice, RecordSlice, SettingsSlice, UiSlice, WarehouseSlice }
export { createAiSlice, resetForNewRun as resetAiSlice, resetForNewRound as resetAiRoundSlice } from "./ai-slice"
export { createGameSlice, resetForNewRun as resetGameSlice, resetForNewRound as resetGameRoundSlice, finishAuction } from "./game-slice"
export { createLanSlice, resetLanState, resetLanGameState, startLanGame, disconnectLan } from "./lan-slice"
export { createRecordSlice, reset as resetRecordSlice } from "./record-slice"
export { createSettingsSlice, save as saveSettings, reset as resetSettings } from "./settings-slice"
export { createUiSlice, resetHud } from "./ui-slice"
export { createWarehouseSlice, reset as resetWarehouseSlice } from "./warehouse-slice"