/**
 * @file lan-index-manager/reconnect-fns.ts
 * @module lan-index-manager/reconnect-fns
 * @description 联机断线重连纯函数。管理自动重连逻辑。
 *              所有 this. 引用替换为 deps/state 参数。
 */
import type { LanIndexManagerDeps, LanIndexState } from "../lan-index-manager"
import { patch as patchAppState } from "../../core/app-state"
import {
  LAN_PLAYER_ID_STORAGE_KEY,
  LAN_ROOM_CODE_STORAGE_KEY,
  LAN_PLAYER_NAME_STORAGE_KEY,
  LAN_IS_HOST_STORAGE_KEY,
  LAN_RECONNECT_FAILED_STORAGE_KEY
} from "../../core/constants"
import { DEFAULT_LAN_SERVER_URL } from "../../../../lan/shared/protocol"
import type { LanPlayer } from "../../../../types/lan"

interface ReconnectResponse {
  roomCode: string
  roomState: string
  isHost: boolean
  players: LanPlayer[]
}

export function tryAutoReconnect(
  deps: LanIndexManagerDeps,
  state: LanIndexState,
  playerId: string,
  roomCode: string,
  _isHost: boolean
): void {
  const bridge = deps.getLanBridge()
  const $ = (id: string): HTMLElement | null => document.getElementById(id)
  const connectPanel = $("lobbyOnlineConnect")
  const roomPanel = $("lobbyOnlineRoom")

  deps.writeLog("尝试自动重连 | room=" + roomCode + " | player=" + playerId)

  if (connectPanel) connectPanel.classList.add("hidden")
  if (roomPanel) roomPanel.classList.remove("hidden")
  deps.setOnlineStatus("正在重连...", "connecting")

  bridge
    ?.reconnect(DEFAULT_LAN_SERVER_URL, roomCode, playerId)
    .then((raw: unknown) => {
      const msg = raw as ReconnectResponse
      deps.writeLog("重连成功 | room=" + msg.roomCode + " | state=" + msg.roomState)
      localStorage.removeItem(LAN_RECONNECT_FAILED_STORAGE_KEY)
      state.isLanMode = true
      state.lanIsHost = msg.isHost
      state.lanPlayers = msg.players || []

      if (msg.roomState === "waiting") {
        deps.enterLanRoom()
        deps.setOnlineStatus("已重连到房间 " + msg.roomCode, "connected")
      } else if (msg.roomState === "playing") {
        deps.writeLog("游戏进行中，准备恢复游戏场景")
        deps.exitLanRoom()
        patchAppState({ appMode: "game", gameSource: "lan" })
        deps.setOnlineStatus("已重连到游戏", "connected")
        bridge.requestFullSync()
      }
    })
    .catch((err: Error) => {
      deps.writeLog("重连失败 | " + err.message)
      localStorage.removeItem(LAN_PLAYER_ID_STORAGE_KEY)
      localStorage.removeItem(LAN_ROOM_CODE_STORAGE_KEY)
      localStorage.removeItem(LAN_PLAYER_NAME_STORAGE_KEY)
      localStorage.removeItem(LAN_IS_HOST_STORAGE_KEY)
      localStorage.setItem(LAN_RECONNECT_FAILED_STORAGE_KEY, "true")

      if (connectPanel) connectPanel.classList.remove("hidden")
      if (roomPanel) roomPanel.classList.add("hidden")
      deps.setOnlineStatus("重连失败: " + err.message, "error")
    })
}
