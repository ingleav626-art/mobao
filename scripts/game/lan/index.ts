import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file lan/index.ts
 * @module game/lan
 * @description 联机房间 UI 与事件处理 Mixin。管理联机大厅的完整生命周期，
 *              包括服务器连接、房间创建/加入、玩家槽位管理、角色选择、道具携带、
 *              地图选择、以及游戏过程中的 WebSocket 事件监听。
 *
 * 核心职责：
 *   - initLanLobby: 初始化联机大厅，绑定所有 DOM 元素和事件
 *   - 服务器连接：connectWithRetry / autoConnectAndCreate / autoConnectAndJoin
 *     支持手动输入地址和自动发现（子网扫描、Native WiFi IP）
 *   - 房间管理：创建房间（公开/私密）、加入房间、离开房间（含确认弹窗）
 *   - 玩家槽位：lanSlotConfig[4] + renderSlots + syncSlotsFromPlayers
 *     4个槽位：host/client/ai/empty，支持踢出、加AI、LLM勾选
 *   - 角色选择：renderLanCharacterList + updateLanPortrait
 *     两列式角色卡片，选择后广播 lan:character-select，Live2D 立绘无缝循环
 *   - 道具携带：renderLanCarryItems + lanCarryItems
 *     复用单机道具选择UI，选择后发送 lan:carry-items
 *   - 地图选择：openLanMapSelect，仅房主可操作
 *   - 房间管理弹窗：openLanRoomManage，踢出/加AI/编号
 *
 * WebSocket 事件监听（bridge.on）：
 *   房间生命周期：room:created, room:joined, room:join-failed, room:kicked,
 *     room:player-joined, room:player-left, room:host-left, room:slot-state
 *   角色同步：lan:character-selected
 *   游戏流程：game:init, round:start, round:bid-ack, bid:received, all-bids-in,
 *     round:timeout, round:result, game:settle, game:settle-final
 *   暂停/恢复：pause:state
 *   数据同步：full-sync, full-sync-request, game:warehouse-sync
 *   重开投票：game:restart-vote, game:restart-go, game:restart-cancelled
 *   AI事件：ai-bids-ready, ai-item-use
 *   玩家动作：player-action, public-info
 *   重连：room:player-reconnected, room:player-removed, room:reconnected, room:reconnect-failed
 *
 * @requires LanBridge       - 联机通信桥（scripts/game/lan-bridge.js）
 * @requires MobaoAppState   - 全局状态管理
 * @requires MobaoConstants  - 常量（DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS）
 * @requires MobaoSettings   - 设置（savePlayerMoney, GAME_SETTINGS）
 * @requires CharacterData   - 角色数据（characters.js）
 * @requires MobaoMapProfiles - 地图配置
 * @requires MobaoShopBridge - 商店系统
 *
 * @exports MobaoLan.LanIndexMixin - 联机大厅 Mixin，混入 Phaser Scene
 */

import { DEFAULT_START_MONEY, GRID_ROWS, GRID_COLS } from "../core/constants"
import { savePlayerMoney, GAME_SETTINGS } from "../core/settings"
import { patch as patchAppState } from "../core/app-state"

import { LanGameFlowMixin } from "./game-flow.js"
import { LanSyncMixin } from "./sync.js"
import { LanSettleMixin } from "./settle.js"
import { LanReconnectMixin } from "./reconnect.js"
import { LanLive2dMixin } from "./live2d.js"
import { LanEventsMixin } from "./events.js"
import { initLanLobbyImpl } from "./lobby.js"

export const LanIndexMixin: ThisType<WarehouseSceneThis> = {
  initLanLobby() {
    initLanLobbyImpl.call(this);
  },

};

// Merge sub-mixins into LanIndexMixin
Object.assign(LanIndexMixin, LanGameFlowMixin, LanSyncMixin, LanSettleMixin, LanReconnectMixin, LanLive2dMixin, LanEventsMixin)

