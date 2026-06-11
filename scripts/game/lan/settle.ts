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
const { DEFAULT_START_MONEY } = window.MobaoConstants
const { savePlayerMoney } = window.MobaoSettings

export const LanSettleMixin = {
  lanOnSettleFinal(msg) {
    const myLanId = this.lanBridge.playerId
    if (msg.wallets && msg.wallets[myLanId] !== undefined) {
      this.playerMoney = msg.wallets[myLanId]
      savePlayerMoney(this.playerMoney)
      this.updateHud()
      this.updateLobbyMoneyDisplay()
    }
    if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
      try {
        window.NativeBridge.setGameRunning(false)
      } catch (_) { }
    }
  },

  lanOnSettle(msg) {
    const slotId = this.lanIdToSlotId[msg.winnerId]
    let winner = this.players.find((p) => p.id === slotId)
    if (!winner) {
      winner = this.players.find((p) => p.lanId === msg.winnerId)
    }
    if (winner) {
      this.finishAuction({ playerId: winner.id, bid: msg.winnerBid }, msg.mode)
    } else {
      this.writeLog("结算：找不到胜者 " + msg.winnerId + "，尝试直接结算")
      this.finishAuction({ playerId: this.players[0]?.id, bid: msg.winnerBid }, msg.mode)
    }
  },

  lanOnRestartGo(msg) {
    this.isLanMode = true
    this.lanPlayers = msg.players || []
    this.lanIsHost = msg.hostId === this.lanBridge.playerId
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
        llm: ai.llm
      }))
      this.lanAiPlayers.forEach((ai) => {
        this.lanPlayers.push(ai)
      })
    }
    window.MobaoAppState.patch({ appMode: "game", gameSource: "lan" })
    this.exitLobby()
    this.exitSettlementPage()
    this.startLanRun()
    this.writeLog("新一局已开始！")
  }
}