import { describe, it, expect } from "vitest"
import { processRoomData, dedupFound, getCharAvatarHtml } from "../../../../scripts/game/lan/lobby/pure"
import type { LanServerInfo, LanRoomInfo } from "../../../../scripts/game/lan/lobby/pure"

describe("lan/lobby/pure", () => {
  describe("processRoomData", () => {
    it("空数据对象不修改 found", () => {
      const found: LanServerInfo[] = []
      processRoomData({}, "192.168.1.1", found)
      expect(found).toHaveLength(0)
    })

    it("data.rooms 非空时添加服务器到 found", () => {
      const found: LanServerInfo[] = []
      const data = {
        rooms: [
          { code: "ABC123", name: "房间1", hostName: "主机长", playerCount: 1, maxPlayers: 4 },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      expect(found).toHaveLength(1)
      expect(found[0].serverIp).toBe("192.168.1.1")
      expect(found[0].serverPort).toBe(9720)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[0].rooms[0].code).toBe("ABC123")
    })

    it("data.rooms 但 serverIp 已存在时不重复添加", () => {
      const found: LanServerInfo[] = [
        { serverIp: "192.168.1.1", serverPort: 9720, rooms: [{ code: "OLD", hostName: "旧主机", playerCount: 2, maxPlayers: 4 }] },
      ]
      const data = {
        rooms: [
          { code: "NEW", name: "新房间", hostName: "新主机", playerCount: 1, maxPlayers: 4 },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      expect(found).toHaveLength(1)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[0].rooms[0].code).toBe("OLD")
    })

    it("data.rooms 为空数组时不添加", () => {
      const found: LanServerInfo[] = []
      processRoomData({ rooms: [] }, "192.168.1.1", found)
      expect(found).toHaveLength(0)
    })

    it("data.remoteRooms 按 serverIp 分组添加", () => {
      const found: LanServerInfo[] = []
      const data = {
        remoteRooms: [
          { code: "R1", name: "远程1", hostName: "主机A", playerCount: 1, maxPlayers: 4, serverIp: "10.0.0.1" },
          { code: "R2", name: "远程2", hostName: "主机B", playerCount: 2, maxPlayers: 4, serverIp: "10.0.0.2" },
          { code: "R3", name: "远程3", hostName: "主机A2", playerCount: 1, maxPlayers: 4, serverIp: "10.0.0.1" },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      // 分组为 2 个服务器：10.0.0.1 (2个房间) 和 10.0.0.2 (1个房间)
      expect(found).toHaveLength(2)
      const server1 = found.find((s) => s.serverIp === "10.0.0.1")
      const server2 = found.find((s) => s.serverIp === "10.0.0.2")
      expect(server1).toBeDefined()
      expect(server1!.rooms).toHaveLength(2)
      expect(server2).toBeDefined()
      expect(server2!.rooms).toHaveLength(1)
    })

    it("data.remoteRooms 但 serverIp 已在 found 中时不重复添加", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [{ code: "EXIST", hostName: "已存在", playerCount: 1, maxPlayers: 4 }] },
      ]
      const data = {
        remoteRooms: [
          { code: "R1", name: "远程1", hostName: "主机A", playerCount: 1, maxPlayers: 4, serverIp: "10.0.0.1" },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      expect(found).toHaveLength(1)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[0].rooms[0].code).toBe("EXIST")
    })

    it("同时有 rooms 和 remoteRooms 时两者都处理", () => {
      const found: LanServerInfo[] = []
      const data = {
        rooms: [
          { code: "LOCAL", name: "本地房", hostName: "本地主机", playerCount: 1, maxPlayers: 4 },
        ],
        remoteRooms: [
          { code: "REMOTE", name: "远程房", hostName: "远程主机", playerCount: 2, maxPlayers: 4, serverIp: "10.0.0.5" },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      // found 包含当前服务器（rooms）和远程服务器（remoteRooms 分组）
      expect(found).toHaveLength(2)
      expect(found.some((s) => s.serverIp === "192.168.1.1")).toBe(true)
      expect(found.some((s) => s.serverIp === "10.0.0.5")).toBe(true)
    })

    it("remoteRooms 中 room 对象的 serverIp 属性被删除", () => {
      const found: LanServerInfo[] = []
      const data = {
        remoteRooms: [
          { code: "R1", name: "远程1", hostName: "主机A", playerCount: 1, maxPlayers: 4, serverIp: "10.0.0.1" },
        ],
      }
      processRoomData(data, "192.168.1.1", found)
      expect(found).toHaveLength(1)
      const room = found[0].rooms[0] as Record<string, unknown>
      expect(room.serverIp).toBeUndefined()
      expect(room.code).toBe("R1")
    })
  })

  describe("dedupFound", () => {
    it("空数组不变", () => {
      const found: LanServerInfo[] = []
      dedupFound(found)
      expect(found).toHaveLength(0)
    })

    it("无重复时保持不变", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [{ code: "A", hostName: "h1", playerCount: 1, maxPlayers: 4 }] },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [{ code: "B", hostName: "h2", playerCount: 2, maxPlayers: 4 }] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(2)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[1].rooms).toHaveLength(1)
    })

    it("相同 serverIp:code 的房间被去重（保留首次出现的）", () => {
      const roomA: LanRoomInfo = { code: "A", hostName: "h1", playerCount: 1, maxPlayers: 4 }
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [roomA, { ...roomA }] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(1)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[0].rooms[0].code).toBe("A")
    })

    it("不同 IP 相同 code 的房间不被去重（key 为 ip:code）", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [{ code: "A", hostName: "h1", playerCount: 1, maxPlayers: 4 }] },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [{ code: "A", hostName: "h2", playerCount: 2, maxPlayers: 4 }] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(2)
      expect(found[0].rooms).toHaveLength(1)
      expect(found[1].rooms).toHaveLength(1)
    })

    it("rooms 为空数组的服务器被移除", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [] },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [{ code: "B", hostName: "h2", playerCount: 2, maxPlayers: 4 }] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(1)
      expect(found[0].serverIp).toBe("10.0.0.2")
    })

    it("所有服务器 rooms 都为空时结果为空数组", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: [] },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(0)
    })

    it("rooms 为 null/undefined 的服务器被移除", () => {
      const found: LanServerInfo[] = [
        { serverIp: "10.0.0.1", serverPort: 9720, rooms: null as unknown as LanRoomInfo[] },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [{ code: "B", hostName: "h2", playerCount: 2, maxPlayers: 4 }] },
      ]
      dedupFound(found)
      expect(found).toHaveLength(1)
      expect(found[0].serverIp).toBe("10.0.0.2")
    })

    it("混合场景：部分重复 + 部分空房间", () => {
      const found: LanServerInfo[] = [
        {
          serverIp: "10.0.0.1",
          serverPort: 9720,
          rooms: [
            { code: "A", hostName: "h1", playerCount: 1, maxPlayers: 4 },
            { code: "A", hostName: "h1dup", playerCount: 1, maxPlayers: 4 },
            { code: "B", hostName: "h2", playerCount: 2, maxPlayers: 4 },
          ],
        },
        { serverIp: "10.0.0.2", serverPort: 9720, rooms: [] },
        {
          serverIp: "10.0.0.3",
          serverPort: 9720,
          rooms: [
            { code: "C", hostName: "h3", playerCount: 1, maxPlayers: 4 },
          ],
        },
      ]
      dedupFound(found)
      // 10.0.0.2 被移除（空 rooms），10.0.0.1 去重后剩 2 个，10.0.0.3 不变
      expect(found).toHaveLength(2)
      expect(found[0].serverIp).toBe("10.0.0.1")
      expect(found[0].rooms).toHaveLength(2)
      expect(found[0].rooms[0].code).toBe("A")
      expect(found[0].rooms[1].code).toBe("B")
      expect(found[1].serverIp).toBe("10.0.0.3")
      expect(found[1].rooms).toHaveLength(1)
    })
  })

  describe("getCharAvatarHtml", () => {
    it("有效角色且有 avatar 返回 img 标签", () => {
      const html = getCharAvatarHtml("appraiser")
      expect(html).toContain("<img")
      expect(html).toContain('src="')
      expect(html).toContain('alt="鉴定师"')
      expect(html).toContain("onerror=")
    })

    it("有效角色但 avatar 为 null 返回 emoji 占位符", () => {
      const html = getCharAvatarHtml("scout")
      expect(html).toBe('<span class="lan-avatar-emoji">👤</span>')
    })

    it("无效角色 ID 返回 emoji 占位符", () => {
      const html = getCharAvatarHtml("nonexistent_id")
      expect(html).toBe('<span class="lan-avatar-emoji">👤</span>')
    })

    it("空字符串 ID 返回 emoji 占位符", () => {
      const html = getCharAvatarHtml("")
      expect(html).toBe('<span class="lan-avatar-emoji">👤</span>')
    })

    it("有 avatar 的角色返回包含 fallback span 的 HTML", () => {
      const html = getCharAvatarHtml("seeker")
      // img 标签后跟着一个 display:none 的 emoji span 作为 onerror 回退
      expect(html).toContain("<img")
      expect(html).toContain('style="display:none;"')
      expect(html).toContain('class="lan-avatar-emoji"')
    })
  })
})
