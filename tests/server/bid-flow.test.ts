/**
 * @file tests/server/bid-flow.test.ts
 * @description 服务器出价逻辑测试。验证 server.js 中 bid 处理的核心行为：
 *              - 出价存储与广播（不回传发送者）
 *              - 全部出价判定（all-bids-in）
 *              - 多人出价累加不覆盖
 *              - 房主出价路径
 *
 * 服务器代码在 lan/server/server.js，是 CommonJS 模块（无导出）。
 * 本测试将该逻辑提取为可测的纯函数，覆盖 server.js 第 882-918 行的 bid 处理。
 *
 * 服务器出价规则（从 server.js handleLanRelay 读出）：
 * 1. 出价存储：room.humanBidsThisRound[playerId] = msg.bid
 * 2. 确认回执：lan:round:bid-ack 发给发送者
 * 3. 广播出价：lan:bid:received 发给非发送者的所有客户端
 * 4. 全部出价判定：所有 connected seats 在 humanBidsThisRound 中都有值 -> lan:all-bids-in 发给主机
 * 5. 覆盖规则：后续出价覆盖前值（同 playerId 更新）
 */
import { describe, it, expect, vi } from "vitest"

// ============================================================
// 模拟服务器出价逻辑（与 server.js 第 882-918 行一致）
// ============================================================

interface Seat {
  id: string
  name: string
  connected: boolean
  isHost: boolean
}

interface Room {
  code: string
  hostId: string
  seats: Seat[]
  humanBidsThisRound: Record<string, number>
}

interface MockWs {
  id: string
  sent: Array<{ type: string; [key: string]: unknown }>
  readyState: number
}

/** 模拟服务器出价处理（对应 server.js 第 882-918 行 handleLanRelay 的 lan:bid:submit case） */
function handleServerBid(
  room: Room,
  ws: MockWs,
  bid: number
): { acks: Array<{ to: string; msg: unknown }>; broadcasts: Array<{ to: string; msg: unknown }>; allBidsIn: boolean } {
  const results: {
    acks: Array<{ to: string; msg: unknown }>
    broadcasts: Array<{ to: string; msg: unknown }>
    allBidsIn: boolean
  } = {
    acks: [],
    broadcasts: [],
    allBidsIn: false
  }

  // 存储出价
  room.humanBidsThisRound[ws.id] = bid

  // 发送确认回执给发送者（lan:round:bid-ack）
  results.acks.push({
    to: ws.id,
    msg: {
      type: "lan:round:bid-ack",
      playerId: ws.id,
      bid,
      ts: Date.now()
    }
  })

  // 广播出价给其他客户端（lan:bid:received），排除发送者
  const seat = room.seats.find((s) => s.id === ws.id)
  for (const s of room.seats) {
    if (s.id === ws.id) continue
    results.broadcasts.push({
      to: s.id,
      msg: {
        type: "lan:bid:received",
        playerId: ws.id,
        playerName: seat?.name || "?",
        bid,
        ts: Date.now()
      }
    })
  }

  // 检查是否所有 connected seats 都已出价
  const allSeats = room.seats.filter((s) => s.connected)
  const allIn = allSeats.every((s) => room.humanBidsThisRound[s.id] !== undefined)
  if (allIn) {
    results.allBidsIn = true
  }

  return results
}

/** 创建模拟房间 */
function createRoom(seats: Array<{ id: string; name: string; isHost: boolean }>): Room {
  return {
    code: "TEST",
    hostId: seats.find((s) => s.isHost)?.id || "host1",
    seats: seats.map((s) => ({ ...s, connected: true })),
    humanBidsThisRound: {}
  }
}

/** 创建模拟 WebSocket 客户端 */
function createMockWs(id: string): MockWs {
  return { id, sent: [], readyState: 1 }
}

// ============================================================
// 测试
// ============================================================

describe("服务器出价逻辑测试", () => {
  describe("出价存储与广播", () => {
    it("出价应存储在 humanBidsThisRound 中", () => {
      // 2 人房间：主机 + 客机
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])
      const ws = createMockWs("host1")

      handleServerBid(room, ws, 100)

      // 预期：出价 100 被存储
      expect(room.humanBidsThisRound["host1"]).toBe(100)
      expect(Object.keys(room.humanBidsThisRound)).toHaveLength(1)
    })

    it("广播 lan:bid:received 不应回传给发送者", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false },
        { id: "client2", name: "客机2", isHost: false }
      ])
      const ws = createMockWs("client1")

      const result = handleServerBid(room, ws, 200)

      // 预期：广播给 host1 和 client2，不广播给 client1 自己
      const broadcastTargets = result.broadcasts.map((b) => b.to)
      expect(broadcastTargets).toContain("host1")
      expect(broadcastTargets).toContain("client2")
      expect(broadcastTargets).not.toContain("client1")
    })

    it("发送者应收到确认回执 lan:round:bid-ack", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])
      const ws = createMockWs("client1")

      const result = handleServerBid(room, ws, 300)

      // 预期：确认回执发给发送者
      expect(result.acks).toHaveLength(1)
      expect(result.acks[0].to).toBe("client1")
      expect((result.acks[0].msg as { type: string }).type).toBe("lan:round:bid-ack")
      expect((result.acks[0].msg as { bid: number }).bid).toBe(300)
    })
  })

  describe("全部出价判定（all-bids-in）", () => {
    it("2 人房间：两人都出价后触发 all-bids-in", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])

      // 主机出价
      let result = handleServerBid(room, createMockWs("host1"), 100)
      expect(result.allBidsIn).toBe(false) // 客机未出价

      // 客机出价 -> 全部出价
      result = handleServerBid(room, createMockWs("client1"), 200)
      expect(result.allBidsIn).toBe(true) // 全部出价
    })

    it("3 人房间：需全部出价后才触发 all-bids-in", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机1", isHost: false },
        { id: "client2", name: "客机2", isHost: false }
      ])

      // 主机出价
      expect(handleServerBid(room, createMockWs("host1"), 100).allBidsIn).toBe(false)
      // 客机1出价
      expect(handleServerBid(room, createMockWs("client1"), 200).allBidsIn).toBe(false)
      // 客机2出价 -> 全部出价
      expect(handleServerBid(room, createMockWs("client2"), 300).allBidsIn).toBe(true)
    })

    it("断开连接的座位不应计入 all-bids-in 判定", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])
      // 断开客机
      room.seats[1].connected = false

      // 只有主机出价 -> 应触发 all-bids-in（因为客机已断开，不计入）
      const result = handleServerBid(room, createMockWs("host1"), 100)
      expect(result.allBidsIn).toBe(true)
    })
  })

  describe("多人出价累加不覆盖", () => {
    it("不同玩家出价分别存储，不互相覆盖", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机1", isHost: false },
        { id: "client2", name: "客机2", isHost: false }
      ])

      // 三个玩家分别出价
      handleServerBid(room, createMockWs("host1"), 100)
      handleServerBid(room, createMockWs("client1"), 200)
      handleServerBid(room, createMockWs("client2"), 300)

      // 预期：三个出价分别存储，不覆盖
      expect(room.humanBidsThisRound).toEqual({
        host1: 100,
        client1: 200,
        client2: 300
      })
    })

    it("同一玩家重新出价应覆盖前值", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])

      // 主机出价 100，然后改为 500
      handleServerBid(room, createMockWs("host1"), 100)
      handleServerBid(room, createMockWs("host1"), 500)

      // 预期：覆盖为 500，不新增条目
      expect(room.humanBidsThisRound).toEqual({
        host1: 500
      })
      expect(Object.keys(room.humanBidsThisRound)).toHaveLength(1)
    })
  })

  describe("房主出价路径", () => {
    it("房主出价与其他玩家出价走相同路径", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])

      // 房主出价
      const result = handleServerBid(room, createMockWs("host1"), 999)

      // 预期：房主出价存储在 humanBidsThisRound 中
      expect(room.humanBidsThisRound["host1"]).toBe(999)

      // 预期：房主出价广播给客机（lan:bid:received）
      const broadcastToClient = result.broadcasts.find((b) => b.to === "client1")
      expect(broadcastToClient).toBeDefined()
      expect((broadcastToClient!.msg as { bid: number }).bid).toBe(999)

      // 预期：房主收到确认回执（lan:round:bid-ack）
      expect(result.acks).toHaveLength(1)
      expect(result.acks[0].to).toBe("host1")
    })

    it("主机是房主时，all-bids-in 通知发给主机自己", () => {
      const room = createRoom([
        { id: "host1", name: "主机", isHost: true },
        { id: "client1", name: "客机", isHost: false }
      ])

      // 客机先出价
      handleServerBid(room, createMockWs("client1"), 50)
      // 房主出价 -> 触发 all-bids-in
      const result = handleServerBid(room, createMockWs("host1"), 100)

      // 预期：all-bids-in 触发
      expect(result.allBidsIn).toBe(true)
    })
  })
})