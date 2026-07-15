/**
 * @file scripts/game/lan/lobby/pure.ts
 * @module lan/lobby/pure
 * @description 联机大厅的可独立测试纯函数。从原 lobby.ts 的 initLanLobbyImpl 闭包中提取，
 *              包含房间数据处理、去重、角色头像 HTML 生成等无副作用逻辑。
 *
 * 纯度说明：
 *   - processRoomData: 仅根据参数计算并追加到传入的 found 数组，无 DOM/网络/this 依赖
 *   - dedupFound: 仅根据参数（found 数组）进行去重和过滤，无 DOM/网络/this 依赖
 *   - getCharAvatarHtml: 仅根据 characterId 参数和角色数据计算返回 HTML 字符串，无副作用
 *
 * @requires data/characters - 角色数据查询（getCharacterById）
 * @exports processRoomData, dedupFound, getCharAvatarHtml, LanRoomInfo, LanServerInfo
 */

import { getCharacterById } from "../../data/characters"

export interface LanRoomInfo {
  code: string
  name?: string
  roomName?: string
  hostName: string
  visibility?: string
  playerCount: number
  maxPlayers: number
  aiCount?: number
  [key: string]: unknown
}

export interface LanServerInfo {
  serverIp: string
  serverPort: number
  rooms: LanRoomInfo[]
}

/**
 * 解析 HTTP 响应数据，将房间按 serverIp 分组追加到 found 数组。
 * @param data - HTTP 响应（含 rooms 和/或 remoteRooms）
 * @param serverIp - 当前服务器 IP
 * @param found - 追加目标的已发现服务器数组（会被原地修改）
 */
export function processRoomData(
  data: {
    rooms?: Array<{ code: string; name: string; hostName: string; playerCount: number; maxPlayers: number }>
    remoteRooms?: Array<{
      code: string
      name: string
      hostName: string
      playerCount: number
      maxPlayers: number
      serverIp: string
    }>
  },
  serverIp: string,
  found: LanServerInfo[]
): void {
  if (data && data.rooms && data.rooms.length > 0) {
    const exists = found.some(function (f) {
      return f.serverIp === serverIp
    })
    if (!exists) found.push({ serverIp: serverIp, serverPort: 9720, rooms: data.rooms })
  }
  if (data && data.remoteRooms && data.remoteRooms.length > 0) {
    const grouped: Record<string, LanServerInfo> = {}
    data.remoteRooms.forEach(function (room) {
      const ip = room.serverIp
      if (!grouped[ip]) grouped[ip] = { serverIp: ip, serverPort: 9720, rooms: [] }
      const r = Object.assign({}, room) as Omit<typeof room, "serverIp"> & { serverIp?: string }
      delete r.serverIp
      grouped[ip].rooms.push(r)
    })
    Object.keys(grouped).forEach(function (ip) {
      const exists = found.some(function (f) {
        return f.serverIp === ip
      })
      if (!exists) found.push(grouped[ip])
    })
  }
}

/**
 * 按 serverIp:code 去重已发现的服务器列表，并移除空房间的服务器。
 * @param found - 已发现的服务器数组（会被原地修改）
 */
export function dedupFound(found: LanServerInfo[]): void {
  const seen: Record<string, boolean> = {}
  for (let i = found.length - 1; i >= 0; i--) {
    const server = found[i]
    const dedupRooms: LanRoomInfo[] = []
    ;(server.rooms || []).forEach(function (room) {
      const key = server.serverIp + ":" + room.code
      if (!seen[key]) {
        seen[key] = true
        dedupRooms.push(room)
      }
    })
    server.rooms = dedupRooms
  }
  for (let i = found.length - 1; i >= 0; i--) {
    if (!found[i].rooms || found[i].rooms.length === 0) {
      found.splice(i, 1)
    }
  }
}

/**
 * 获取角色头像 HTML 字符串。
 * @param characterId - 角色 ID
 * @returns 头像 HTML（img 标签或 emoji 占位符）
 */
export function getCharAvatarHtml(characterId: string): string {
  if (!getCharacterById) return '<span class="lan-avatar-emoji">👤</span>'
  const char = getCharacterById(characterId)
  if (char && char.avatar) {
    return (
      '<img src="' +
      char.avatar +
      '" alt="' +
      char.name +
      '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\';"><span class="lan-avatar-emoji" style="display:none;">👤</span>'
    )
  }
  return '<span class="lan-avatar-emoji">👤</span>'
}
