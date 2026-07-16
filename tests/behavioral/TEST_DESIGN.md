# 行为测试设计（阶段 2 后实现）

> 本文档设计全流程行为测试框架，覆盖用户完整操作流程的状态验证。
> 阶段 1 已完成 `tests/behavioral/state-reset.test.ts`（reset 方法正确性 + 状态隔离）。
> 以下用例在阶段 2（Manager 迁移 slice 后）实现。

---

## 一、单机完整流程

### 1.1 进大厅 -> 选角色 -> 选道具 -> 开局

| 项目 | 内容 |
|------|------|
| **预设条件** | `resetAll()` 后状态干净。settingsSlice 为默认值。 |
| **模拟操作** | 1. `gameState.resetForNewRun()` <br>2. 调用角色选择（设置 `characterId`）<br>3. 调用道具选择（设置 `selectedItem`）<br>4. 调用局启动（设置 `runSerial++`, `players`） |
| **验证点** | `gameSlice.round === 1` <br>`gameSlice.playerMoney === 3000000` <br>`gameSlice.settled === false` <br>`gameSlice.selectedItem` 为选中道具 <br>`gameSlice.players` 包含 4 名玩家 <br> `lanSlice.isLanMode === false` |

### 1.2 出价 -> 揭示 -> 结算

| 项目 | 内容 |
|------|------|
| **预设条件** | 单机已开局，`round=1`，`settled=false`，`playerMoney=3000000` |
| **模拟操作** | 1. 玩家出价（`submitBid(game, playerId, amount)`）<br>2. 设置 `playerBidSubmitted=true`，`currentBid=amount`，`bidLeader=playerId`<br>3. 触发揭示流程（`revealBids(...)`）<br>4. 结算（`finishAuction(game)`） |
| **验证点** | `gameSlice.settled === true` <br>`gameSlice.roundResolving === false` <br>`gameSlice.playerMoney` 已扣除出价 <br>`gameSlice.currentBid === 0`（回合结束已重置？注意：`finishAuction` 不重置，`resetForNewRound` 才重置） |

### 1.3 重开 -> 验证状态干净

| 项目 | 内容 |
|------|------|
| **预设条件** | 多轮出价结算后，`runSerial>0`，`playerMoney` 已变化，`warehouse.items` 有藏品 |
| **模拟操作** | 1. `gameState.resetForNewRun()` |
| **验证点** | **gameSlice**: `round===1`, `playerMoney===3000000`, `settled===false`, `currentBid===0`, `bidLeader==="none"`, `players` 为默认 4 人 <br>**aiSlice**: `llmEverUsedThisRun===false`, `aiReflectionState==="idle"` <br>**warehouseSlice**: `items===[]` <br>**recordSlice**: `battleRecords===[]` <br>**lanSlice**: 不变（仍为 `isLanMode=false`）<br>**settingsSlice**: 不变 |

---

## 二、联机完整流程

### 2.1 创建房间 -> 加入 -> 开局

| 项目 | 内容 |
|------|------|
| **预设条件** | `resetAll()` 后，`lanSlice` 全部默认 |
| **模拟操作** | 1. 创建房间（设置 `lanLastRoomCode`，`lanIsHost=true`，`lanBridge` 初始化）<br>2. 玩家加入（`lanPlayers.push(lanPlayer)`）<br>3. 开局（`startLanGame(lan, opts)`） |
| **验证点** | `lanSlice.isLanMode === true` <br>`lanSlice.lanIsHost === true` <br>`lanSlice.lanPlayers` 包含所有联机玩家 <br>`lanSlice.lanIdToSlotId` 映射正确 <br>`lanSlice.slotIdToLanId` 映射正确 <br>`gameSlice.players` 包含联机玩家 + AI（由 Manager 同步） |

### 2.2 出价 -> 结算

| 项目 | 内容 |
|------|------|
| **预设条件** | 联机开局后，`isLanMode=true`，`lanHostBids` 为空 |
| **模拟操作** | 1. 主机/客机出价（`lanHostBids[slotId]=amount`）<br>2. 同步到 `gameSlice.currentBid/gameSlice.bidLeader`<br>3. 结算（`finishAuction(game)`） |
| **验证点** | `gameSlice.settled === true` <br>`lanHostBids` 在结算后通过 `resetLanGameState` 清空 <br>`lanHostWallets` 在结算后更新 |

### 2.3 返回房间 -> 离开 -> 验证状态干净

| 项目 | 内容 |
|------|------|
| **预设条件** | 联机结算后，`lanSlice` 有完整的连接信息 |
| **模拟操作** | 1. 返回房间（保留 `lanLastRoomCode`/`lanLastPlayerId`/`lanBridge`）<br>2. 离开（`resetLanState(lan)`） |
| **验证点** | 离开后：`lanSlice.isLanMode===false` <br>`lanSlice.lanBridge===null` <br>`lanSlice.lanIsHost===false` <br>`lanSlice.lanPlayers===[]` <br>`lanSlice.lanMySlotId===null` <br>**gameSlice/aiSlice/warehouseSlice/recordSlice 不变** |

---

## 三、设置流程

### 3.1 改设置 -> 保存 -> 开局 -> 验证设置生效

| 项目 | 内容 |
|------|------|
| **预设条件** | settingsSlice 为默认值（`maxRounds=5`, `roundSeconds=60`） |
| **模拟操作** | 1. 修改设置：`settings.maxRounds=10`, `settings.roundSeconds=30`<br>2. 保存：`saveSettings(settings)`（写 localStorage）<br>3. 新 `GameState` 构造（验证从 localStorage 读取）<br>4. 开局（`resetForNewRun`） |
| **验证点** | 新 `GameState.settings.maxRounds === 10` <br> 新 `GameState.settings.roundSeconds === 30` <br> `resetForNewRun` 后 settings 不变 <br> localStorage 中值正确 |

### 3.2 改设置 -> 恢复默认 -> 开局

| 项目 | 内容 |
|------|------|
| **预设条件** | settingsSlice 已修改为非默认值 |
| **模拟操作** | 1. 恢复默认：`resetSettings(settings)` <br>2. 保存：`saveSettings(settings)` <br>3. 开局（`resetForNewRun`） |
| **验证点** | `settings.maxRounds === 5`（默认）<br>`settings.dirty === true`（reset 后 dirty）<br>写入 localStorage 后新 `GameState` 读取正确 |

---

## 四、状态隔离

### 4.1 联机 -> 单机（重点：无泄漏）

| 项目 | 内容 |
|------|------|
| **预设条件** | 联机状态：`isLanMode=true`，`lanPlayers` 有值，`lanHostBids` 非空，`gameSlice` 在联机模式 |
| **模拟操作** | 1. `resetLanState(lan)`（退出联机）<br>2. `resetForNewRun(gameState)`（开新单机局） |
| **验证点** | 步骤 1 后：`lanSlice` 全部默认 <br>步骤 2 后：`gameSlice` 全部默认 <br>**复合验证**：`lanSlice.isLanMode===false && gameSlice.players` 为默认 4 人（单机玩家）<br>**关键**：`lanSlice.lanLastRoomCode` 和 `lanSlice.lanLastPlayerId` 在 `resetLanState` 后为 `null`（之前 bug 是这些字段遗留） |

### 4.2 设置改动 -> 游戏 -> 验证设置不变

| 项目 | 内容 |
|------|------|
| **预设条件** | settingsSlice 已修改为非默认值 |
| **模拟操作** | 1. `resetForNewRun()`（开新局）<br>2. 多轮出价结算<br>3. 再次 `resetForNewRun()`（重开） |
| **验证点** | 全程 `settingsSlice` 值不变 <br> 多轮游戏后 settings 未被游戏逻辑修改 |

---

## 五、道具流程

### 5.1 选道具 -> 同步 -> 带入游戏

| 项目 | 内容 |
|------|------|
| **预设条件** | 大厅状态，`selectedItem=null` |
| **模拟操作** | 1. 选择道具：`game.selectedItem = artifact`<br>2. 开局：`resetForNewRun()`（保留 `selectedItem`？需要确认：`resetForNewRun` 重置 `selectedItem` 为 `null`）<br>3. 道具在开局后注入 `warehouse.items` |
| **验证点** | 开局后 `warehouse.items` 包含选中道具 <br>（注：`resetForNewRun` 重置 `selectedItem`，所以道具选择必须在开局前完成，开局后 `selectedItem` 被重置） |

### 5.2 消耗道具 -> 重开 -> 验证道具重置

| 项目 | 内容 |
|------|------|
| **预设条件** | 已开局，`warehouse.items` 有藏品，AI 已消耗部分道具 |
| **模拟操作** | 1. 消耗道具：`warehouse.items.pop()`<br>2. 重开：`resetForNewRun()` |
| **验证点** | `warehouseSlice.items === []`（重置）<br>`gameSlice.selectedItem === null`（重置）<br>（道具选择在开局前重新进行） |

---

## 六、实现清单

| # | 测试文件 | 覆盖流程 | 优先级 | 实现阶段 |
|---|---------|---------|--------|---------|
| 1 | `state-reset.test.ts` | 7 组 reset/lifecycle 方法 | P0 | 阶段 1 |
| 2 | `single-player-flow.test.ts` | 单机完整流程（1.1-1.3） | P1 | 阶段 2 |
| 3 | `lan-flow.test.ts` | 联机完整流程（2.1-2.3） | P1 | 阶段 2 |
| 4 | `settings-flow.test.ts` | 设置流程（3.1-3.2） | P2 | 阶段 2 |
| 5 | `state-isolation.test.ts` | 状态隔离（4.1-4.2） | P1 | 阶段 2 |
| 6 | `artifact-flow.test.ts` | 道具流程（5.1-5.2） | P2 | 阶段 2 |

---

## 七、验证原则

1. **只验证状态值**，不验证 UI 呈现（UI 呈现由集成测试覆盖）
2. **每个流程独立可运行**，不依赖其他测试的副作用
3. **预设条件显式写出**，不依赖 `beforeEach` 之外的隐式状态
4. **验证点列出具体字段+期望值**，不写模糊的"状态正确"
5. **联机/单机隔离是重点**，每个流程都要检查另一个模式的状态不受影响