/**
 * @file types/lan.d.ts
 * @description 联机通信类型定义。涵盖 WebSocket 消息、房间管理、座位槽位、协议数据交换等。
 *              这些类型是 lan-bridge.js 和服务端之间的数据契约。
 */

import type { Player, MapProfile, Character, CharacterAssignment } from './game'

// ==================== 房间相关 ====================

/** 房间状态 */
export type RoomState = 'waiting' | 'playing' | 'settling' | 'ended'

/** 房间座位 */
export interface Seat {
  id: string                  // 座位ID（客户端 slotId）
  playerId: string | null     // 玩家ID（联机ID）
  playerName: string | null   // 玩家名称
  isReady: boolean
  isHost: boolean
  joinedAt: number | null     // 加入时间戳
}

/** 房间信息 */
export interface Room {
  code: string                // 房间码 "JGDV"
  name: string
  hostId: string
  hostName: string
  visibility: 'public' | 'private'
  password?: string
  state: RoomState
  maxPlayers: number
  seats: Seat[]
  mapId: string | null
  maxRounds: number | null
  currentRound: number
  createdAt: number
}

/** 创建房间选项 */
export interface RoomCreateOptions {
  roomName?: string
  visibility?: 'public' | 'private'
  password?: string
}

/** 房间摘要（大厅列表展示用） */
export interface RoomSummary {
  code: string
  name: string
  hostName: string
  playerCount: number
  maxPlayers: number
  state: RoomState
  createdAt: number
}

// ==================== 联机玩家 ====================

/** 联机玩家（服务端视角） */
export interface LanPlayer {
  id: string                  // 联机唯一ID
  name: string
  isAI: boolean
  isReady: boolean
  characterId: string | null
  carryItems: string[]
  avatar?: string
  llm?: boolean
}

/** 联机槽位映射 */
export interface SlotMapping {
  [slotId: string]: string    // slotId → lanId
}

// ==================== WebSocket 消息 ====================

/** 消息类型字面量 */
export type MessageType =
  // 房间管理
  | 'room:create'
  | 'room:join'
  | 'room:leave'
  | 'room:created'
  | 'room:joined'
  | 'room:player-joined'
  | 'room:player-left'
  | 'room:player-kicked'
  | 'room:destroyed'
  // 游戏
  | 'game:start'
  | 'game:end'
  | 'game:restart'
  | 'game:restart-vote'
  // 回合
  | 'round:start'
  | 'round:timer'
  | 'round:end'
  | 'round:timeout'
  // 出价
  | 'bid:submit'
  | 'bid:result'
  | 'bid:settle'
  // 技能/道具
  | 'skill:use'
  | 'item:use'
  // 同步
  | 'game:sync'
  | 'game:state'
  | 'reconnect:sync'
  // 通知
  | 'system:notice'
  | 'system:error'
  | 'chat:message'
  // 扩展
  | string

/** WebSocket 消息信封 */
export interface RoomMessage {
  type: MessageType
  roomCode?: string
  playerId?: string
  playerName?: string
  isHost?: boolean
  data?: any
  timestamp?: number
  [key: string]: any          // 允许各消息类型自行扩展
}

// ==================== 具体消息类型 ====================

/** 房间创建消息 */
export interface RoomCreatedMessage {
  type: 'room:created'
  roomCode: string
  playerId: string
  playerName: string
  isHost: boolean
}

/** 加入房间消息 */
export interface RoomJoinedMessage {
  type: 'room:joined'
  roomCode: string
  room: Room
  playerId: string
  playerName: string
}

/** 游戏开始消息 */
export interface GameStartMessage {
  type: 'game:start'
  roomCode: string
  mapId: string
  maxRounds: number
  seeds: number[] | null      // 随机种子（用于确定性生成）
  players: LanPlayer[]
  characters?: CharacterAssignment[]
  settings?: object
}

/** 回合开始消息 */
export interface RoundStartMessage {
  type: 'round:start'
  round: number
  totalRounds: number
  timeLimit: number           // 秒
}

/** 出价提交消息 */
export interface BidSubmitMessage {
  type: 'bid:submit'
  playerId: string
  bid: number
  skill?: string | null
  item?: string | null
}

/** 出价结果消息 */
export interface BidResultMessage {
  type: 'bid:result'
  round: number
  bids: BidsPerPlayer[]       // 所有玩家的出价（含AI）
  winner?: BidWinner | null    // 本回合最高者
  triggeredSettlement?: boolean
}

/** 单玩家出价 */
export interface BidsPerPlayer {
  playerId: string
  playerName: string
  bid: number
  skill?: string
  item?: string
  thought?: string
}

/** 出价赢家 */
export interface BidWinner {
  playerId: string
  playerName: string
  bid: number
  type: 'highest' | 'direct_take'  // 胜出方式
}

/** 技能使用消息 */
export interface SkillUseMessage {
  type: 'skill:use'
  playerId: string
  playerName: string
  skillId: string
  targetId?: string
  result?: object
}

/** 道具使用消息 */
export interface ItemUseMessage {
  type: 'item:use'
  playerId: string
  playerName: string
  itemId: string
  result?: object
}

// ==================== LanBridge API ====================

// LanBridge 实例类型已统一至 types/globals.d.ts 的 declare class LanBridge（单一权威源），
// 此处不再重复定义 export interface LanBridge。

/** LanBridge 构造选项 */
export interface LanBridgeOptions {
  url?: string
  roomCode?: string
  playerName?: string
  debug?: boolean
}

/** 重连状态 */
export interface ReconnectState {
  retryCount: number
  maxRetries: number
  retryDelay: number         // 毫秒
  isReconnecting: boolean
  lastRoomCode: string | null
  pendingMessages: RoomMessage[]
}