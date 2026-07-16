import type { LanPlayer } from "../../../../types/lan"

export interface LanSlice {
  isLanMode: boolean
  lanBridge: unknown
  lanIsHost: boolean
  lanMySlotId: string | null
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanHostWallets: Record<string, number>
  lanHostBids: Record<string, number>
  lanReconnecting: boolean
  lanReconnectAttempts: number
  lanMaxReconnectAttempts: number
  lanLastServerUrl: string | null
  lanLastRoomCode: string | null
  lanLastPlayerId: string | null
  lanAiPlayers: (LanPlayer & { llm?: boolean })[]
  lanAiLlmEnabled: boolean
  lanPlayers: LanPlayer[]
}

export function createLanSlice(): LanSlice {
  return {
    isLanMode: false,
    lanBridge: null,
    lanIsHost: false,
    lanMySlotId: null,
    lanIdToSlotId: {},
    slotIdToLanId: {},
    lanHostWallets: {},
    lanHostBids: {},
    lanReconnecting: false,
    lanReconnectAttempts: 0,
    lanMaxReconnectAttempts: 5,
    lanLastServerUrl: null,
    lanLastRoomCode: null,
    lanLastPlayerId: null,
    lanAiPlayers: [],
    lanAiLlmEnabled: false,
    lanPlayers: []
  }
}

export function resetLanState(s: LanSlice): void {
  // 只重置 LAN 游戏状态字段，保留连接/重连数据（lanBridge/lanLast*/lanReconnect*）
  // 原代码散落重置从不碰 lanBridge，连接保留用于重连。kill 连接会导致 LAN 完全不可用。
  s.isLanMode = false
  s.lanIsHost = false
  s.lanMySlotId = null
  s.lanIdToSlotId = {}
  s.slotIdToLanId = {}
  s.lanHostWallets = {}
  s.lanHostBids = {}
  s.lanAiPlayers = []
  s.lanAiLlmEnabled = false
  s.lanPlayers = []
}

/** 完全断开 LAN（包括连接），仅在显式断开时调用，不在大厅导航/退出时调用 */
export function disconnectLan(s: LanSlice): void {
  resetLanState(s)
  s.lanBridge = null
  s.lanLastServerUrl = null
  s.lanLastRoomCode = null
  s.lanLastPlayerId = null
  s.lanReconnecting = false
  s.lanReconnectAttempts = 0
}

export function resetLanGameState(s: LanSlice): void {
  s.lanHostBids = {}
  s.lanHostWallets = {}
}

export function startLanGame(
  s: LanSlice,
  opts: {
    players: LanPlayer[]
    aiPlayers: (LanPlayer & { llm?: boolean })[]
    hostId: string
    mySlotId: string
    slotMap: Record<string, string>
  }
): void {
  s.isLanMode = true
  s.lanPlayers = opts.players
  s.lanAiPlayers = opts.aiPlayers
  s.lanIsHost = opts.hostId === opts.mySlotId
  s.lanMySlotId = opts.mySlotId
  s.lanIdToSlotId = opts.slotMap
  s.slotIdToLanId = {}
  for (const [lanId, slotId] of Object.entries(opts.slotMap)) {
    s.slotIdToLanId[slotId] = lanId
  }
}