# 联机层文档

> 本文档详细描述游戏的联机系统，包括通信桥客户端、联机房间 UI、以及 Node.js 服务器。

---

## 一、联机层总览

### 1.1 文件清单

| 路径 | 设计模式 | 职责 |
|------|---------|------|
| `lan/client/lan-bridge.ts` | IIFE + 构造函数 | WebSocket 通信桥客户端 |
| `scripts/game/lan/index.ts` | Mixin | 联机主入口，合并 7 个子 Mixin |
| `scripts/game/lan/lobby.ts` | Mixin | 联机大厅 UI |
| `scripts/game/lan/events.ts` | Mixin | WebSocket 事件绑定与分发 |
| `scripts/game/lan/sync.ts` | Mixin | 全量状态同步、仓库恢复 |
| `scripts/game/lan/reconnect.ts` | Mixin | 断线重连 |
| `scripts/game/lan/settle.ts` | Mixin | 联机结算、重开一局 |
| `scripts/game/lan/game-flow.ts` | Mixin | 联机游戏核心流程 |
| `scripts/game/lan/live2d.ts` | Mixin | Live2D 立绘双视频切换 |
| `lan/server/server.ts` | 独立进程 | Node.js 联机服务器 |

### 1.2 联机架构

```
┌──────────────────────────────────────────────────────────┐
│                    客户端 A（房主）                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ LanIndexMixin│  │ LanBridge    │  │ WarehouseScene│   │
│  │ (房间UI)     │──│ (通信桥)     │──│ (游戏场景)     │   │
│  └─────────────┘  └──────┬───────┘  └───────────────┘   │
└──────────────────────────┼───────────────────────────────┘
                           │ WebSocket
                           ▼
              ┌────────────────────────┐
              │   联机服务器 (9720)     │
              │   ┌──────────────────┐ │
              │   │ HTTP 静态文件服务  │ │
              │   │ WebSocket 消息路由 │ │
              │   │ UDP 设备发现       │ │
              │   └──────────────────┘ │
              └───────────┬────────────┘
                           │ WebSocket
                           ▼
┌──────────────────────────┼───────────────────────────────┐
│                    客户端 B（客机）                         │
│  ┌─────────────┐  ┌──────┴───────┐  ┌───────────────┐   │
│  │ LanIndexMixin│  │ LanBridge    │  │ WarehouseScene│   │
│  │ (房间UI)     │──│ (通信桥)     │──│ (游戏场景)     │   │
│  └─────────────┘  └──────────────┘  └───────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 二、通信桥客户端（lan-bridge.ts）

### 2.1 概述

`LanBridge` 是前端与联机服务器之间的唯一通信通道，封装 WebSocket 连接管理、消息收发和事件系统。

### 2.2 核心属性

| 属性 | 类型 | 说明 |
|------|------|------|
| ws | WebSocket | WebSocket 连接实例 |
| connected | boolean | 是否已连接 |
| playerId | string | 玩家 ID（服务器分配） |
| playerName | string | 玩家名称（最长12字） |
| roomCode | string | 房间码 |
| isHost | boolean | 是否房主 |
| players | Array | 房间内玩家列表 |
| _listeners | Object | 事件监听器映射 |

### 2.3 连接管理

```
connect(url, playerName)
  │
  ├── 创建 WebSocket 连接
  ├── onopen → connected = true, emit("ws:open")
  ├── onclose → connected = false, emit("ws:close")
  ├── onerror → emit("ws:error")
  └── onmessage → _handleMessage(parsed)

disconnect()
  ├── ws.close()
  └── 清理状态
```

### 2.4 事件系统

```javascript
// 订阅事件
bridge.on("room:created", (data) => { ... });

// 内部发布
bridge._emit("room:created", data);

// 取消订阅（on 返回取消函数）
const unsub = bridge.on("room:created", handler);
unsub();  // 取消
```

### 2.5 房间操作

| 方法 | 参数 | 说明 |
|------|------|------|
| `createRoom(options)` | {roomName, visibility, password} | 创建房间 |
| `joinRoom(code, password)` | 房间码, 密码 | 加入房间 |
| `leaveRoom()` | - | 离开房间 |
| `listRooms()` | - | 获取房间列表 |
| `reconnect(url, code, playerId)` | 地址, 房间码, 玩家ID | 断线重连 |

### 2.6 游戏操作

| 方法 | 参数 | 说明 |
|------|------|------|
| `startGame(options)` | {mapProfile, settings} | 开始游戏（仅房主） |
| `submitBid(bid)` | 出价值 | 提交出价 |
| `broadcastRoundStart(data)` | 回合数据 | 房主广播回合开始 |
| `broadcastRoundResult(data)` | 回合结果 | 房主广播回合结果 |
| `broadcastSettle(data)` | 结算数据 | 房主广播结算 |
| `togglePause(paused, timeLeft)` | 暂停状态, 剩余时间 | 暂停/恢复 |
| `sendChat(text)` | 聊天文本 | 聊天消息 |
| `ping()` | - | 心跳检测 |

### 2.7 消息路由

```
_handleMessage(msg)
  │
  ├── room:* → 房间事件
  │     ├── room:created       ← 房间创建成功
  │     ├── room:joined        ← 加入房间成功
  │     ├── room:join-failed   ← 加入失败
  │     ├── room:kicked        ← 被踢出
  │     ├── room:player-joined ← 其他玩家加入
  │     ├── room:player-left   ← 其他玩家离开
  │     ├── room:host-left     ← 房主离开
  │     ├── room:slot-state    ← 槽位状态更新
  │     └── room:reconnect*    ← 重连结果
  │
  ├── lan:game:* → 游戏事件
  │     ├── lan:game:init          ← 游戏初始化
  │     ├── lan:game:restart-vote  ← 重开投票
  │     ├── lan:game:restart-go    ← 重开执行
  │     ├── lan:game:restart-cancelled ← 重开取消
  │     ├── lan:game:settle        ← 结算
  │     └── lan:game:settle-final  ← 最终结算
  │
  ├── lan:round:* → 回合事件
  │     ├── lan:round:start   ← 回合开始
  │     ├── lan:round:bid-ack ← 出价确认
  │     ├── lan:round:timeout ← 回合超时
  │     └── lan:round:result  ← 回合结果
  │
  ├── lan:bid:* → 出价事件
  │     ├── lan:bid:received    ← 收到出价
  │     └── lan:bid:all-bids-in ← 所有出价已收齐
  │
  ├── lan:* → 其他
  │     ├── lan:warehouse-sync  ← 仓库同步
  │     ├── lan:ai-bids-ready   ← AI 出价就绪
  │     ├── lan:ai-item-use     ← AI 道具使用
  │     ├── lan:player-action   ← 玩家动作
  │     ├── lan:pause:state     ← 暂停状态
  │     ├── lan:full-sync       ← 完整同步
  │     └── lan:public-info     ← 公共信息
  │
  ├── chat → 聊天消息
  ├── error → 错误
  └── unknown → 未知消息类型
```

### 2.8 原生桥接（NativeBridge）

```
Android WebView 环境下的原生桥接:

isNative()
  └── 检测是否在 Android WebView 中

getNativeServerUrl() / getLocalServerUrl()
  └── 获取服务器地址

startNativeServer() / stopNativeServer()
  └── 启停本地服务器（Android 端运行）

getNativeWiFiIP()
  └── 获取 WiFi IP 地址

discoverRoomsNative() / discoverRoomsHTTP()
  └── 房间发现（原生/HTTP 两种方式）

_getLocalSubnetIPs()
  └── 获取本机子网 IP 列表（用于子网扫描）
```

---

## 三、联机房间 UI（lan/index.ts）

### 3.1 房间页面布局

```
┌──────────────────────────────────────────────┐
│  [返回]  联机房间  [房间管理] [商店]  💰100万  │
├──────────┬──────────────────┬────────────────┤
│          │                  │                │
│ 角色立绘  │  模式图片         │  玩家列表       │
│ (Live2D) │  地图图片         │  ┌────┬────┐  │
│          │                  │  │ P1 │ P2 │  │
│  [选择]   │  道具选择         │  ├────┼────┤  │
│          │  [道具1][道具2]    │  │ P3 │ P4 │  │
│          │                  │  └────┴────┘  │
│          │  [开始游戏]       │                │
└──────────┴──────────────────┴────────────────┘
```

### 3.2 服务器连接

```
connectWithRetry(url, playerName, maxRetries)
  │
  ├── 第1次尝试: bridge.connect(url, playerName)
  ├── 失败 → 等待 1s → 第2次尝试
  ├── ...
  └── 超过 maxRetries → 报错

autoConnectAndCreate(url, playerName, roomOptions)
  ├── connectWithRetry(url, playerName)
  └── bridge.createRoom(roomOptions)

autoConnectAndJoin(url, playerName, roomCode, password)
  ├── connectWithRetry(url, playerName)
  └── bridge.joinRoom(roomCode, password)
```

### 3.3 玩家槽位系统

```
lanSlotConfig[4] = [
  { type: "host", player: {...} },   // 槽位0: 房主
  { type: "client", player: {...} },  // 槽位1: 客机
  { type: "ai", aiConfig: {...} },    // 槽位2: AI
  { type: "empty" }                   // 槽位3: 空位
]

槽位操作:
  ├── 踢出: 点击红色小叉 → bridge.send({type:"room:kick", playerId})
  ├── 加AI: 点击加号 → 添加 AI 玩家
  ├── LLM 勾选: AI 头像框内勾选框 → 启用 LLM 决策
  └── 同步: syncSlotsFromPlayers() ← 监听 room:slot-state
```

### 3.4 角色选择（联机版）

```
点击立绘/加号 → 打开角色选择弹窗
  │
  ├── 两列式布局，一行两个角色
  ├── 左边头像 + 右边技能介绍
  ├── 选中后:
  │     ├── 更新立绘（Live2D 无缝循环）
  │     └── 广播: bridge.send({type:"lan:character-select", characterId})
  │
  └── 其他玩家选择 → 监听 lan:character-selected 更新槽位
```

### 3.5 地图选择（联机版）

```
openLanMapSelect()
  │
  ├── 仅房主可操作（player.id === this.hostId）
  ├── 点击地图图片 → 打开地图选择弹窗
  ├── 复用单机地图选择 UI
  └── 选择后同步到房间
```

### 3.6 道具携带（联机版）

```
renderLanCarryItems()
  │
  ├── 复用单机道具选择 UI
  ├── lanCarryItems: 携带的道具数组
  ├── 选择后发送: bridge.send({type:"lan:carry-items", items})
  └── lanCarryAutoReplenish: 自动补充开关
```

### 3.7 WebSocket 事件监听

```javascript
// 房间生命周期
bridge.on("room:created", (data) => { ... });
bridge.on("room:joined", (data) => { ... });
bridge.on("room:join-failed", (data) => { ... });
bridge.on("room:kicked", (data) => { ... });
bridge.on("room:player-joined", (data) => { ... });
bridge.on("room:player-left", (data) => { ... });
bridge.on("room:host-left", (data) => { ... });
bridge.on("room:slot-state", (data) => { ... });

// 游戏流程
bridge.on("lan:game:init", (data) => { ... });
bridge.on("lan:round:start", (data) => { ... });
bridge.on("lan:round:bid-ack", (data) => { ... });
bridge.on("lan:bid:received", (data) => { ... });
bridge.on("lan:bid:all-bids-in", (data) => { ... });
bridge.on("lan:round:timeout", (data) => { ... });
bridge.on("lan:round:result", (data) => { ... });
bridge.on("lan:game:settle", (data) => { ... });
bridge.on("lan:game:settle-final", (data) => { ... });

// 暂停/恢复
bridge.on("lan:pause:state", (data) => { ... });

// 数据同步
bridge.on("lan:full-sync", (data) => { ... });
bridge.on("lan:full-sync-request", (data) => { ... });
bridge.on("lan:warehouse-sync", (data) => { ... });

// 重开投票
bridge.on("lan:game:restart-vote", (data) => { ... });
bridge.on("lan:game:restart-go", (data) => { ... });
bridge.on("lan:game:restart-cancelled", (data) => { ... });

// AI 事件
bridge.on("lan:ai-bids-ready", (data) => { ... });
bridge.on("lan:ai-item-use", (data) => { ... });

// 玩家动作
bridge.on("lan:player-action", (data) => { ... });
bridge.on("lan:public-info", (data) => { ... });

// 重连
bridge.on("room:player-reconnected", (data) => { ... });
bridge.on("room:player-removed", (data) => { ... });
bridge.on("room:reconnected", (data) => { ... });
bridge.on("room:reconnect-failed", (data) => { ... });
```

---

## 四、联机服务器（server.ts）

### 4.1 服务器架构

```
服务器 (Node.js)
├── HTTP 静态文件服务 (CLIENT_DIR → lan/client/)
├── WebSocket 游戏服务器 (端口 9720)
└── UDP 设备发现服务 (端口 9721)
```

### 4.2 核心数据结构

#### Room 对象

```javascript
{
  code: "A3K7",              // 4位房间码
  hostId: "p1a2b3c4",        // 房主 ID
  hostName: "玩家A",          // 房主名称
  roomName: "玩家A的房间",    // 房间名
  visibility: "public",       // public | private
  password: "",               // 私密房间密码
  seats: [Seat],              // 座位数组（最多4个）
  state: "waiting",           // waiting | playing
  maxPlayers: 4,              // 最大玩家数
  roundTimer: null,           // 回合计时器
  roundStartTime: 0,          // 回合开始时间
  roundSeconds: 30,           // 回合秒数
  isPaused: false,            // 是否暂停
  pauseRemainingMs: null,     // 暂停剩余时间
  humanBidsThisRound: {},     // 本轮人类出价
  restartVotes: {}            // 重开投票
}
```

#### Seat 对象

```javascript
{
  id: "p1a2b3c4",             // 玩家 ID
  name: "玩家A",               // 玩家名称
  isHost: true,                // 是否房主
  connected: true,             // 是否在线
  characterId: "appraiser",    // 选中角色 ID
  carryItems: ["item-outline-lamp"], // 携带道具
  disconnectedAt: null         // 断线时间戳
}
```

### 4.3 房间码生成

```
genRoomCode()
  │
  ├── 字符集: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  │     └── 排除易混淆字符: I, O, 0, 1
  │
  ├── 长度: 4 位
  │
  └── 碰撞检测: rooms.has(code) → 重新生成
```

### 4.4 消息路由

```
handleMessage(ws, msg)
  │
  ├── room:* / game:* / ping / chat
  │     └── handleRoomMessage(ws, msg)
  │
  ├── lan:*
  │     └── handleLanRelay(ws, msg)
  │
  └── 其他
        └── sendJson(ws, {type:"error", reason:"Unknown message type"})
```

### 4.5 房间消息处理

```
handleRoomMessage(ws, msg)
  │
  ├── room:create → 创建房间
  │     ├── genRoomCode() + genPlayerId()
  │     ├── 创建 Room 对象
  │     ├── 房主自动入座
  │     └── 返回 room:created
  │
  ├── room:join → 加入房间
  │     ├── 检查: 房间存在/未满/未开始/密码正确
  │     ├── genPlayerId() + 入座
  │     ├── 广播 room:player-joined
  │     └── 返回 room:joined
  │
  ├── room:leave → 离开房间
  │     ├── 游戏中: 标记断线 + 30秒宽限
  │     └── 等待中: 立即移除
  │
  ├── room:list → 获取房间列表
  │     └── 返回所有公开房间信息
  │
  ├── room:reconnect → 断线重连
  │     ├── 检查: 房间存在/玩家存在/宽限期内
  │     └── 恢复连接 + 广播 room:player-reconnected
  │
  ├── room:kick → 踢出玩家
  │     ├── 仅房主可操作
  │     └── 广播 room:kicked
  │
  ├── game:start → 开始游戏
  │     ├── 仅房主可操作
  │     ├── room.state = "playing"
  │     └── 广播 lan:game:init
  │
  └── game:restart-* → 重开投票
        ├── restart-request: 房主发起
        ├── restart-accept: 客机同意
        ├── restart-decline: 客机拒绝 → 取消
        └── 全部同意 → 广播 lan:game:restart-go
```

### 4.6 LAN 消息中继

```
handleLanRelay(ws, msg)
  │
  ├── 验证: 玩家在房间内 + 房间存在
  │
  ├── 权限检查:
  │     ├── lan:round:start/timeout/pause/resume → 仅房主
  │     ├── lan:bid:submit → 任何玩家
  │     └── lan:character-select/carry-items → 任何玩家
  │
  ├── 特殊处理:
  │     ├── lan:bid:submit → 记录出价 + 检查是否全部收到
  │     │     └── 全部收到 → 广播 lan:bid:all-bids-in
  │     ├── lan:round:start → 启动服务端计时器
  │     └── lan:round:pause/resume → 暂停/恢复计时器
  │
  └── 广播到房间内其他玩家
```

### 4.7 断线重连机制

```
玩家断线:
  │
  ├── 游戏中 (state=playing):
  │     ├── seat.connected = false
  │     ├── seat.disconnectedAt = Date.now()
  │     ├── 广播 room:player-left (canReconnect=true, graceMs=30000)
  │     └── scheduleGraceCleanup(room, playerId)
  │           └── 30秒后: 若未重连 → 移除玩家 + 广播 room:player-removed
  │
  ├── 等待中 (state=waiting):
  │     ├── 房主离开 → 解散房间
  │     └── 客机离开 → 立即移除
  │
  └── 重连:
        ├── room:reconnect → 检查宽限期
        ├── 成功 → 恢复连接 + 广播 room:player-reconnected
        └── 失败 → 返回 room:reconnect-failed
```

### 4.8 回合计时

```
服务端计时器:
  │
  ├── lan:round:start → 启动 setTimeout(roundSeconds × 1000)
  │     └── 超时 → 广播 lan:round:timeout
  │
  ├── lan:round:pause → clearTimeout + 记录 pauseRemainingMs
  │
  └── lan:round:resume → 重新 setTimeout(pauseRemainingMs)
```

### 4.9 UDP 设备发现

```
UDP 服务 (端口 9721):
  │
  ├── 客户端广播: "MOBAO_DISCOVER"
  │
  └── 服务器响应: {
        type: "MOBAO_ANNOUNCE",
        port: 9720,
        rooms: [{code, name, playerCount, maxPlayers, visibility}]
      }
```

---

## 五、联机游戏流程

### 5.1 单局完整流程

```
1. 房主创建房间 → room:created
2. 客机加入房间 → room:joined / room:player-joined
3. 选择角色 → lan:character-select（广播）
4. 选择地图 → 仅房主操作
5. 携带道具 → lan:carry-items（广播）
6. 房主开始游戏 → game:start → lan:game:init
7. 仓库同步 → lan:warehouse-sync / lan:full-sync
8. 回合循环:
   ├── 房主广播回合开始 → lan:round:start
   ├── 玩家出价 → lan:bid:submit
   ├── 服务端中继 → lan:bid:received
   ├── 全部收到 → lan:bid:all-bids-in
   ├── 房主结算 → lan:round:result
   └── 下一轮或结束
9. 结算 → lan:game:settle / lan:game:settle-final
10. 重开投票 → lan:game:restart-vote → lan:game:restart-go/cancelled
```

### 5.2 单机 vs 联机差异

| 维度 | 单机 | 联机 |
|------|------|------|
| 出价提交 | 直接写入 playerRoundBid | bridge.submitBid → 服务端中继 |
| 回合结算 | 本地 resolveRoundBids | 房主结算 → 广播结果 |
| AI 决策 | 本地计算 | 房主计算 → 广播 |
| 道具使用 | 本地执行 | 本地执行 + 广播 lan:player-action |
| 暂停 | 本地 roundPaused | 房主控制 → 服务端广播 |
| 公共信息 | 本地 addPublicInfoEntry | 房主广播 lan:public-info |
| 仓库数据 | 本地生成 | 房主生成 → lan:warehouse-sync |
| LLM 设置 | 可配置 | 联机模式下禁用设置 |
| 断线处理 | 无 | 30秒宽限期 + 重连 |

### 5.3 数据同步机制

```
完整同步 (lan:full-sync):
  │
  ├── 触发: 新玩家加入 / 重连后
  ├── 内容: 仓库状态 + 所有玩家出价 + 回合信息
  └── 房主发送 → 客机接收并恢复

仓库同步 (lan:warehouse-sync):
  │
  ├── 触发: 游戏开始时
  ├── 内容: 仓库布局 + 藏品数据
  └── 房主发送 → 客机重建仓库

公共信息同步 (lan:public-info):
  │
  ├── 触发: 每次添加公共信息时
  ├── 仅房主广播
  └── 客机接收并添加到 publicInfoEntries
```
