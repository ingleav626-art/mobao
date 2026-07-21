/**
 * @file scene/scene-run.ts
 * @module scene/run
 * @description 回合管理方法。包含 startNewRun（新局初始化）。
 *
 * 拆分说明：
 *   - startNewRun 为实现逻辑（新局状态重置、仓库生成、AI 初始化）
 *   - 可考虑二次迁移到 core/round-manager.ts 或保留在 scene 层
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { GRID_COLS as _GRID_COLS, GRID_ROWS as _GRID_ROWS } from "../core/constants"
import { GAME_SETTINGS as _GAME_SETTINGS, loadGameSettings } from "../core/settings"
import { getActiveCharacter, resetForNewGame } from "../data/character-system"
import { pickRandomPublicEvent } from "../data/public-events"
import { createLogger } from "../core/logger"
import { Deps } from "../core/deps"

const log = createLogger("LAN")

/**
 * 开始新的一局游戏
 */
export function startNewRun(this: WarehouseSceneThis): void {
  log.debug("[fn-file] startNewRun CALLED")
  this.aiDecisionManager.beginRunTracking()
  this.cancelSettlementReveal()
  this.roundManager.stopRoundTimer()
  this.exitSettlementPage()
  this.guardWarehouseCapacity()
  this.state.resetForNewRun()
  this.state.resetLanState()
  this.lanReconnecting = false
  this.lanReconnectAttempts = 0
  this._mapQualityWeights = null
  this._mapCategoryWeights = null
  Object.assign(_GAME_SETTINGS, loadGameSettings())
  this.actionsLeft = _GAME_SETTINGS.actionsPerRound
  this.roundTimeLeft = _GAME_SETTINGS.roundSeconds
  this.currentBid = 1000
  this.moneySettledRunToken = this.makeRunToken()
  log.info("startNewRun: state reset via slices, GAME_SETTINGS reloaded from localStorage")
  this.lanMySlotId = "p2"
  this.initPlayersUI()
  log.debug("startNewRun: players reset, count=" + this.players.length)
  this.aiLlmPlayerEnabled = Deps.LLM_BRIDGE ? Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players) : {}
  log.info("startNewRun: reloaded aiLlmPlayerEnabled from localStorage, keys=" + Object.keys(this.aiLlmPlayerEnabled).length)

  if (getActiveCharacter()) {
    resetForNewGame()
    this.applyCharacterToPlayer()
  }

  this.resetPlayerHistoryState()

  this.autoplayManager.resetForNewRun()
  this.skillManager.resetForNewRun()
  this.skillManager.onNewRound()
  this.syncItemManagerFromShop()

  this.hidePreview()
  this.closeBidKeypad()
  this.closeItemDrawer()
  this.hideSettleOverlay()
  this.hideRevealScrollHints()
  this.drawUnknownWarehouse()
  this.spawnRandomItems()

  if (pickRandomPublicEvent && this.items.length > 0) {
    this.currentPublicEvent = pickRandomPublicEvent(this.items, _GRID_COLS, _GRID_ROWS)
    this.publicInfoEntries.push({
      source: this.currentPublicEvent.category,
      text: this.currentPublicEvent.text
    })
  }

  this.setupWarehouseAuction()
  this.rebuildWarehouseCellIndex()
  this.walletManager.initAiWallets()
  this.aiIntelManager.initAiIntelSystems()
  this.aiEngine.resetForNewRun({
    startingBid: this.currentBid,
    itemCount: this.items.length
  })
  this.aiMemoryManager.pushRunStartContextToAi()
  this.roundManager.startRound()
  this.updateHud()
  this.aiDecisionManager.writeLog("新仓库已生成：回合限时开始，可先用道具/技能再提交整仓出价。")
}
