/**
 * @file lan/reconnect.js
 * @module lan/reconnect
 * @description 联机断线重连 Mixin。管理自动重连逻辑。
 *
 * @requires LanBridge   - 联机通信桥
 * @requires MobaoAppState - 全局状态管理
 *
 * @exports LanReconnectMixin
 */
import { patch as patchAppState } from "../core/app-state"
import {
  LAN_PLAYER_ID_STORAGE_KEY, LAN_ROOM_CODE_STORAGE_KEY, LAN_PLAYER_NAME_STORAGE_KEY,
  LAN_IS_HOST_STORAGE_KEY, LAN_RECONNECT_FAILED_STORAGE_KEY
} from "../core/constants"
import { DEFAULT_LAN_SERVER_URL } from "../../../lan/shared/protocol"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { LanPlayer } from "../../../types/lan"

interface ReconnectResponse {
  roomCode: string
  roomState: string
  isHost: boolean
  players: LanPlayer[]
}

export const LanReconnectMixin: ThisType<WarehouseSceneThis> = {
  tryAutoReconnect(playerId: string, roomCode: string, _playerName: string, _isHost: boolean) {
    const bridge = this.lanBridge;
    const $ = (id: string): HTMLElement | null => document.getElementById(id);
    const connectPanel = $("lobbyOnlineConnect");
    const roomPanel = $("lobbyOnlineRoom");

    this.writeLog(`尝试自动重连 | room=${roomCode} | player=${playerId}`);

    // 显示重连提示
    if (connectPanel) connectPanel.classList.add("hidden");
    if (roomPanel) roomPanel.classList.remove("hidden");
    this.setOnlineStatus("正在重连...", "connecting");

    bridge?.reconnect(DEFAULT_LAN_SERVER_URL, roomCode, playerId)
      .then((raw: unknown) => {
        const msg = raw as ReconnectResponse
        this.writeLog(`重连成功 | room=${msg.roomCode} | state=${msg.roomState}`);
        // 清除重连失败标记
        localStorage.removeItem(LAN_RECONNECT_FAILED_STORAGE_KEY);
        this.isLanMode = true;
        this.lanIsHost = msg.isHost;
        this.lanPlayers = msg.players || [];

        // 根据房间状态恢复界面
        if (msg.roomState === "waiting") {
          // 房间等待状态，恢复房间界面
          this.enterLanRoom();
          this.setOnlineStatus("已重连到房间 " + msg.roomCode, "connected");
        } else if (msg.roomState === "playing") {
          // 游戏进行中，恢复游戏界面
          this.writeLog("游戏进行中，准备恢复游戏场景");
          // 退出房间界面
          this.exitLanRoom();
          // 进入游戏场景
          patchAppState({ appMode: "game", gameSource: "lan" });
          this.startLanRun();
          this.setOnlineStatus("已重连到游戏", "connected");
          // 请求完整同步
          bridge.requestFullSync();
        }
      })
      .catch((err) => {
        this.writeLog(`重连失败 | ${err.message}`);
        // 清除 localStorage
        localStorage.removeItem(LAN_PLAYER_ID_STORAGE_KEY);
        localStorage.removeItem(LAN_ROOM_CODE_STORAGE_KEY);
        localStorage.removeItem(LAN_PLAYER_NAME_STORAGE_KEY);
        localStorage.removeItem(LAN_IS_HOST_STORAGE_KEY);
        // 设置重连失败标记，防止反复重连
        localStorage.setItem(LAN_RECONNECT_FAILED_STORAGE_KEY, "true");

        // 显示正常界面
        if (connectPanel) connectPanel.classList.remove("hidden");
        if (roomPanel) roomPanel.classList.add("hidden");
        this.setOnlineStatus("重连失败: " + err.message, "error");
      });
  },
};