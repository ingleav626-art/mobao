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
import { GAME_SETTINGS as _GAME_SETTINGS } from "../core/settings"
import { getActiveCharacter, resetForNewGame } from "../data/character-system"
import { pickRandomPublicEvent } from "../data/public-events"
import { createLogger } from "../core/logger"

const log = createLogger("LAN")

/**
 * 开始新的一局游戏
 */
export function startNewRun(this: WarehouseSceneThis): void {
  log.debug("[fn-file] startNewRun CALLED")
  this.beginRunTracking()
  this.battleRecordReplayActive = false
  this.battleRecordReplayRecordId = null
  this.cancelSettlementReveal()
  this.stopRoundTimer()
  this.exitSettlementPage()
  this.guardWarehouseCapacity()
  // 重置联机状态，防止联机配置串扰到单机
  this.isLanMode = false
  log.info("startNewRun: isLanMode reset to false")
  this.lanIsHost = false
  this.lanPlayers = []
  this.lanAiPlayers = []
  this.lanIdToSlotId = {}
  this.slotIdToLanId = {}
  this.lanHostWallets = {}
  this.lanHostBids = {}
  this.lanAiLlmEnabled = false
  this.lanMySlotId = "p2"
  this.players = [
    { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
    { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
    { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
    { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
  ]
  log.debug("startNewRun: players reset, count=" + this.players.length)

  if (getActiveCharacter()) {
    resetForNewGame()
    this.applyCharacterToPlayer()
  }

  this.round = 1
  this.actionsLeft = _GAME_SETTINGS.actionsPerRound
  this.roundTimeLeft = _GAME_SETTINGS.roundSeconds
  this.roundResolving = false
  this.playerBidSubmitted = false
  this.playerRoundBid = 0
  this.selectedItem = null
  this.currentBid = 1000
  this.bidLeader = "none"
  this.aiMaxBid = 0
  this.warehouseTrueValue = 0
  this.settled = false
  this.moneySettledRunToken = this.makeRunToken()
  this.resetPlayerHistoryState()

  this.privateIntelEntries.length = 0
  this.publicInfoEntries.length = 0
  this.currentPublicEvent = null

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
  this.initAiWallets()
  this.initAiIntelSystems()
  this.aiEngine.resetForNewRun({
    startingBid: this.currentBid,
    itemCount: this.items.length
  })
  this.lastAiDecisionTelemetry = null
  this.llmEverUsedThisRun = false
  this.aiReflectionState = "idle"
  if (!this.isAiMultiGameMemoryEnabled()) {
    this.resetAiConversations()
  } else {
    this.aiConversationByPlayer = {}
  }
  this.pushRunStartContextToAi()
  this.startRound()
  this.updateHud()
  this.writeLog("新仓库已生成：回合限时开始，可先用道具/技能再提交整仓出价。")
}
