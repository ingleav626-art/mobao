/**
 * @file lan/settle.js
 * @module lan/settle
 * @description 联机结算 Mixin。处理最终结算、普通结算、重开一局。
 *
 * @requires MobaoConstants - 常量（DEFAULT_START_MONEY）
 * @requires MobaoSettings  - 游戏设置（savePlayerMoney）
 *
 * @exports LanSettleMixin
 */
import { DEFAULT_START_MONEY } from "../core/constants"
import { savePlayerMoney } from "../core/player-money"
import { patch as patchAppState } from "../core/app-state"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

interface SettleFinalMsg {
  wallets: Record<string, number>
}

interface SettleMsg {
  winnerId: string
  winnerBid: number
  mode: string
}

interface RestartGoPlayer {
  id: string
  name: string
  isAI: boolean
  isHost: boolean
  isReady?: boolean
  characterId?: string | null
  carryItems?: string[]
  llm?: boolean
}

interface RestartGoMsg {
  players: RestartGoPlayer[]
  hostId: string
  aiPlayers: RestartGoPlayer[]
  aiLlmEnabled: boolean
}

export const LanSettleMixin: ThisType<WarehouseSceneThis> = {
  lanOnSettleFinal(msg: SettleFinalMsg) {
    const myLanId = this.lanBridge?.playerId ?? ""
    if (msg.wallets && msg.wallets[myLanId] !== undefined) {
      this.playerMoney = msg.wallets[myLanId]
      savePlayerMoney(this.playerMoney)
      this.updateHud()
      this.updateLobbyMoneyDisplay()
    }
    if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
      try {
        window.NativeBridge.setGameRunning(false)
      } catch (_) {}
    }
  },

  lanOnSettle(msg: SettleMsg) {
    const slotId = this.lanIdToSlotId[msg.winnerId]
    let winner = this.players.find((p) => p.id === slotId)
    if (!winner) {
      winner = this.players.find((p) => p.lanId === msg.winnerId)
    }
    if (winner) {
      this.finishAuction({ playerId: winner.id, bid: msg.winnerBid }, msg.mode)
    } else {
      this.writeLog("结算：找不到胜者 " + msg.winnerId + "，尝试直接结算")
      this.finishAuction({ playerId: this.players[0]?.id ?? "", bid: msg.winnerBid }, msg.mode)
    }
  },

  lanOnRestartGo(msg: RestartGoMsg) {
    this.isLanMode = true
    this.lanPlayers = (msg.players || []).map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      isReady: p.isReady ?? false,
      characterId: p.characterId ?? null,
      carryItems: p.carryItems ?? [],
      isHost: p.isHost
    }))
    this.lanIsHost = msg.hostId === (this.lanBridge?.playerId ?? "")
    const aiPlayersFromMsg = msg.aiPlayers || []
    this.lanAiLlmEnabled = !!msg.aiLlmEnabled
    if (this.lanIsHost) {
      this.lanHostWallets = {}
      this.lanPlayers.forEach((p) => {
        this.lanHostWallets[p.id] = DEFAULT_START_MONEY
      })
      this.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({
        id: ai.id,
        name: ai.name,
        isAI: true,
        isHost: false,
        isReady: false,
        characterId: null,
        carryItems: [],
        llm: ai.llm
      }))
      this.lanAiPlayers.forEach((ai) => {
        this.lanPlayers.push(ai)
        this.lanHostWallets[ai.id] = DEFAULT_START_MONEY
      })
    } else {
      this.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({
        id: ai.id,
        name: ai.name,
        isAI: true,
        isHost: false,
        isReady: false,
        characterId: null,
        carryItems: [],
        llm: ai.llm
      }))
      this.lanAiPlayers.forEach((ai) => {
        this.lanPlayers.push(ai)
      })
    }
    patchAppState({ appMode: "game", gameSource: "lan" })
    this.exitLobby()
    this.exitSettlementPage()
    this.startLanRun()
    this.writeLog("新一局已开始！")
  }
}
