# scripts/game/lan/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.ts | 69 | 模块入口，聚合 6 个子 Mixin |
| events.ts | 515 | WebSocket 事件绑定与分发 |
| sync.ts | 395 | 全量状态同步、仓库恢复、暂停/前后台处理 |
| reconnect.ts | 80 | 断线重连 |
| lobby.ts | 1293 | 联机大厅全部 UI 逻辑 |
| settle.ts | 128 | 结算处理、重开一局 |
| game-flow.ts | 413 | 游戏核心流程（回合解析、AI出价、超时、拍卖结束） |
| live2d.ts | 298 | Live2D 立绘双视频 A/B 切换 |

## 逐文件职责问题

### events.ts (515行)
- **重复事件处理器**：`ws:close` 和 `ws:error` 各注册了两次，功能重叠
- **事件路由与业务逻辑混合**：`game:init` 处理器直接设置 `isLanMode`、`lanPlayers` 等核心状态并调用 `startLanRun`
- **LanEventsCtx 接口过大**：20+ 字段，说明 events 和 lobby 耦合过深

### sync.ts (395行)
- **死代码**：`tryAutoReconnect` 方法（336-394行）与 `reconnect.ts` 中同名方法完全相同，因 index.ts 中 Mixin 合并顺序被覆盖，为死代码
- **网络数据恢复与Phaser渲染混合**：`lanRestoreWarehouseFromSync` 包含完整 Phaser 渲染逻辑

### reconnect.ts (80行)
- 职责相对单一清晰
- 硬编码 `ws://localhost:9720`

### lobby.ts (1293行) — 最严重
- **体量过大**：1293行，至少 5 个独立子职责
- **网络扫描逻辑与UI混合**：`scanSubnet`、`scanRoomsNativeFull`、`detectLocalIP` 是纯网络层代码
- **HTTP API调用与UI混合**：`processRoomData` 直接处理 HTTP 响应
- **initLanLobbyImpl 超过1200行**，包含大量闭包变量和嵌套函数
- 所有渲染函数通过闭包共享状态

### settle.ts (128行)
- 职责清晰
- `lanOnRestartGo` 与 `game-flow.ts: startLanRun` 部分重复

### game-flow.ts (413行)
- `startLanRun`（176-333行）超过150行，包含大量一次性逻辑
- `lanComputeAiBids` 混合 AI 决策逻辑和 ID 映射转换
- 与 sync.ts 存在交叉：仓库同步逻辑重叠

### live2d.ts (298行)
- **设计最佳**：职责单一清晰，无明显问题

## 依赖关系

```
index.ts → 聚合 game-flow, sync, settle, reconnect, live2d, events
lobby.ts → events, live2d, reconnect
events.ts → 委托 game-flow, sync, settle, reconnect
game-flow.ts → sync (隐式)
```

## 整体评价

**优点**：模块拆分方向正确、Mixin 模式与项目架构一致、live2d.ts 和 settle.ts 职责单一。

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| lobby.ts 严重臃肿（1293行） | **高** |
| sync.ts 与 reconnect.ts 死代码重复 | **中** |
| events.ts 重复事件处理器 | **中** |
| 网络通信与游戏逻辑多处混合 | **中** |
| startLanRun 过长（157行） | **中** |

## 改进建议

1. 拆分 lobby.ts：lobby-ui.ts / lobby-scan.ts / lobby-room.ts
2. 删除 sync.ts 中重复的 tryAutoReconnect
3. 合并 events.ts 中重复的 WebSocket 事件处理器
4. 建立联机/单机切换的明确生命周期接口（enterLanMode/exitLanMode）
5. 拆分 startLanRun 为多个小函数
