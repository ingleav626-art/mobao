/**
 * @file lan-index-manager/settle-fns.ts
 * @module lan-index-manager/settle-fns
 * @description 联机结算纯函数。处理最终结算、普通结算、重开一局。
 *              所有 this. 引用替换为 deps/state 参数。
 */
import type { LanIndexManagerDeps, LanIndexState } from "../lan-index-manager"
import { DEFAULT_START_MONEY } from "../../core/constants"
import { savePlayerMoney } from "../../core/player-money"
import { patch as patchAppState } from "../../core/app-state"
import { startLanRun } from "./game-flow-fns"
import type { LanPlayer } from "../../../../types/lan"

export function lanOnSettleFinal(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: { wallets: Record<string, number> },
): void {
  const bridge = deps.getLanBridge()
  const myLanId = bridge?.playerId ?? ""
  if (msg.wallets && msg.wallets[myLanId] !== undefined) {
    state.playerMoney = msg.wallets[myLanId]
    savePlayerMoney(state.playerMoney)
    deps.updateHud()
    deps.updateLobbyMoneyDisplay()
  }
  if (window.NativeBridge && window.NativeBridge.isNative && window.NativeBridge.isNative()) {
    try {
      window.NativeBridge.setGameRunning(false)
    } catch (_) { }
  }
}

export function lanOnSettle(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: { winnerId: string; winnerBid: number; mode: string },
): void {
  const slotId = state.lanIdToSlotId[msg.winnerId]
  let winner = state.players.find((p) => p.id === slotId)
  if (!winner) {
    winner = state.players.find((p) => (p as unknown as Record<string, unknown>).lanId === msg.winnerId)
  }
  if (winner) {
    deps.finishAuction({ playerId: winner.id, bid: msg.winnerBid }, msg.mode)
  } else {
    deps.writeLog("结算：找不到胜者 " + msg.winnerId + "，尝试直接结算")
    deps.finishAuction({ playerId: state.players[0]?.id ?? "", bid: msg.winnerBid }, msg.mode)
  }
}

export function lanOnRestartGo(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  msg: {
    players: Array<{ id: string; name: string; isAI: boolean; isHost: boolean; isReady?: boolean; characterId?: string | null; carryItems?: string[]; llm?: boolean }>
    hostId: string
    aiPlayers: Array<{ id: string; name: string; isAI: boolean; isHost: boolean; llm?: boolean }>
    aiLlmEnabled: boolean
  },
): void {
  state.isLanMode = true
  state.lanPlayers = (msg.players || []).map((p) => ({
    id: p.id,
    name: p.name,
    isAI: p.isAI,
    isReady: p.isReady ?? false,
    characterId: p.characterId ?? null,
    carryItems: p.carryItems ?? [],
    isHost: p.isHost,
  }))
  const bridge = deps.getLanBridge()
  state.lanIsHost = msg.hostId === (bridge?.playerId ?? "")
  const aiPlayersFromMsg = msg.aiPlayers || []
  state.lanAiLlmEnabled = !!msg.aiLlmEnabled
  if (state.lanIsHost) {
    state.lanHostWallets = {}
    state.lanPlayers.forEach((p) => {
      state.lanHostWallets[p.id] = DEFAULT_START_MONEY
    })
    state.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({
      id: ai.id,
      name: ai.name,
      isAI: true,
      isHost: false,
      isReady: false,
      characterId: null,
      carryItems: [] as string[],
      llm: ai.llm,
    }))
    state.lanAiPlayers.forEach((ai) => {
      state.lanPlayers.push(ai as LanPlayer)
      state.lanHostWallets[ai.id] = DEFAULT_START_MONEY
    })
  } else {
    state.lanAiPlayers = aiPlayersFromMsg.map((ai) => ({
      id: ai.id,
      name: ai.name,
      isAI: true,
      isHost: false,
      isReady: false,
      characterId: null,
      carryItems: [] as string[],
      llm: ai.llm,
    }))
    state.lanAiPlayers.forEach((ai) => {
      state.lanPlayers.push(ai as LanPlayer)
    })
  }
  patchAppState({ appMode: "game", gameSource: "lan" })
  deps.exitLobby()
  deps.exitSettlementPage()
  startLanRun(deps, state)
  deps.writeLog("新一局已开始！")
}