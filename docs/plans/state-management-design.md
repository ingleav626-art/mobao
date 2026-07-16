# 状态管理系统设计

> 创建：2026-07-16
> 基于：完整状态盘点（场景类 96 可变属性 + Manager state 195 字段 + localStorage 30 键）

## 一、根因分析

### 1.1 双重/三重存储

40 个场景属性被 2-3 个 getter/setter 同步对象同时读写：

| 同步对象 | 字段数 | 重叠方 |
|---------|--------|--------|
| `lanIndexState` | 55 | 与 lobbyIndexState/warehouseManagerState/aiIntelState 大量重叠 |
| `lobbyIndexState` | 23 | 与 lanIndexState 重叠 17 个 LAN 字段 |
| `warehouseManagerState` | 15 | 与 lanIndexState 重叠 items/itemLayer/gridLayer 等 |
| `aiIntelState` | 11 | 与 lanIndexState 重叠 aiRoundEffects/aiLlmRoundPlans |
| `aiMemoryData` | 8 | 独立 |

**后果**：写状态走路径 A，读状态走路径 B，重置只重路径 C。任一 setter 遗漏 = 状态不一致。
- 联机/单机隔离修 5 次还漏：lanIndexState 和 lobbyIndexState 各重置不同 LAN 子集
- 设置值不对：GAME_SETTINGS 内存改了不存 localStorage
- 12 个 deps 接线 bug：值捕获/缺 setXxx 都是同步路径遗漏

### 1.2 状态分散在 5 层

| 层 | 位置 | 问题 |
|----|------|------|
| 场景属性 | `this.xxx` | 96 个，无集中管理 |
| Manager state | 各 Manager 的 state 对象 | 125 个同步到场景，重复 |
| localStorage | 30 个 mobao_ 键 | 部分与内存重复（mobao_settings vs mobao_settings_v2）|
| 模块级变量 | GAME_SETTINGS / _activeCharacter 等 | 改了不持久化 |
| Pinia stores | 10 个已定义 | 未启用（Vue 没挂载）|

## 二、设计：8 个 State Slice

每个 slice 是独立类型化对象，< 60 行，单一数据源。场景属性变 getter 委托到 slice。

### 2.1 Slice 划分

| Slice | 字段数 | 内容 | 对应场景属性 |
|-------|--------|------|-------------|
| `gameSlice` | 43 | 回合/出价/玩家/资金/结算流程 | round, currentBid, players, playerMoney, settled, playerBidSubmitted... |
| `lanSlice` | 17 | 联机状态 | isLanMode, lanPlayers, lanHostWallets, lanMySlotId, lanIdToSlotId... |
| `aiSlice` | 19 | AI 系统 | aiWallets, aiPrivateIntel, aiLlmRoundPlans, aiConversationByPlayer... |
| `warehouseSlice` | 3 | 仓库藏品 | items, revealedCells, deepSeekTesting |
| `recordSlice` | 9 | 战绩/情报/摘要 | battleRecords, privateIntelEntries, publicInfoEntries, pendingSettlementSummary... |
| `uiSlice` | 5 | UI/DOM | dom, _hudRoundText, _hudTimerText, _hudMoneyText, _timerSpan |
| `settingsSlice` | 11 | 游戏设置 | GameSettingsData（替代 GAME_SETTINGS 模块变量）|
| `appSlice` | 8 | 应用状态 | AppStateData（已存在于 app-state.ts）|

**总计 115 个字段**（覆盖 96 场景属性 + 19 设置/应用字段）。

### 2.2 文件结构

```
scripts/game/core/state/
  index.ts            # GameState 根（组合 8 slice，不存状态）
  game-slice.ts       # GameSlice 接口 + 默认值 + resetForNewRun()
  lan-slice.ts        # LanSlice 接口 + 默认值 + resetLanState()
  ai-slice.ts         # AiSlice 接口 + 默认值 + resetForNewRun()
  warehouse-slice.ts  # WarehouseSlice 接口 + 默认值 + reset()
  record-slice.ts     # RecordSlice 接口 + 默认值 + reset()
  ui-slice.ts         # UiSlice 接口 + 默认值 + reset()
  settings-slice.ts   # SettingsSlice（封装 localStorage 读写）
  app-slice.ts        # 复用现有 app-state.ts
  types.ts            # 所有 slice 接口 re-export
```

每个 slice 文件结构（~50 行）：
```typescript
export interface LanSlice {
  isLanMode: boolean
  lanIsHost: boolean
  lanPlayers: LanPlayer[]
  // ... 17 字段
}

export function createLanSlice(): LanSlice {
  return { isLanMode: false, lanIsHost: false, lanPlayers: [], ... }
}

export function resetLanState(s: LanSlice): void {
  s.isLanMode = false
  s.lanIsHost = false
  s.lanPlayers = []
  // ... 重置全部 17 字段（一个不漏）
}
```

### 2.3 GameState 根

```typescript
export class GameState {
  game: GameSlice
  lan: LanSlice
  ai: AiSlice
  warehouse: WarehouseSlice
  record: RecordSlice
  ui: UiSlice
  settings: SettingsSlice
  app: AppStateData

  constructor() {
    this.game = createGameSlice()
    this.lan = createLanSlice()
    // ...
  }

  resetForNewRun(): void {
    resetGameSlice(this.game)
    resetAiSlice(this.ai)
    resetWarehouseSlice(this.warehouse)
    resetRecordSlice(this.record)
    // 不重置 lan/settings/app
  }

  resetLanState(): void {
    resetLanState(this.lan)
  }

  resetAll(): void {
    this.resetForNewRun()
    this.resetLanState()
  }
}
```

## 三、消灭双重存储

### 3.1 移除 5 个 getter/setter 同步对象

| 移除的对象 | 字段去向 |
|-----------|---------|
| `lanIndexState` (55) | LAN 字段 -> lanSlice，游戏字段 -> gameSlice |
| `lobbyIndexState` (23) | LAN 字段 -> lanSlice，大厅字段 -> gameSlice/uiSlice |
| `warehouseManagerState` (15) | -> warehouseSlice + gameSlice（currentBid 等）|
| `aiIntelState` (11) | -> aiSlice |
| `aiMemoryData` (8) | -> aiSlice |

**40 个双重存储属性变单份**：每个属性只在对应 slice 里存一次。

### 3.2 场景属性变 getter

```typescript
class WarehouseScene extends _PhaserScene {
  private state: GameState

  get isLanMode() { return this.state.lan.isLanMode }
  set isLanMode(v) { this.state.lan.isLanMode = v }
  get players() { return this.state.game.players }
  set players(v) { this.state.game.players = v }
  // ... 96 个 getter/setter 委托到 slice
}
```

场景属性仍可访问（`this.isLanMode`），但数据源是 slice。Manager 注入 slice 引用（`deps.lan` / `deps.game`），不再需要 125 个 getter/setter 同步对象。

### 3.3 Manager 直接用 slice

```typescript
// 之前：LanIndexManager 通过 55 字段 getter/setter 对象同步
// 之后：LanIndexManager 直接操作 lanSlice
class LanIndexManager {
  constructor(private lan: LanSlice, private game: GameSlice, ...) {}
  // 读：this.lan.isLanMode
  // 写：this.lan.isLanMode = true
  // 重置：resetLanState(this.lan)
}
```

## 四、集中 Reset

### 4.1 Reset 方法表

| 方法 | 重置字段 | 调用点 |
|------|---------|--------|
| `resetLanState()` | 17 个 LAN 字段 | showLobbyMain / enterLobby / startNewRun / enterLanRoom |
| `resetForNewRun()` | game + ai + warehouse + record | startNewRun / startLanRun |
| `resetAll()` | 全部 | 场景销毁 |
| `resetSettings()` | 11 个设置字段 | 设置恢复默认 |

### 4.2 解决联机/单机隔离

所有切换点调 `state.resetLanState()`，**一个函数重置 17 个字段**，不再分散在 5 个函数各重一部分。5 次隔离 bug 的根因消除。

## 五、防漏验证机制

### 5.1 盘点清单是 checklist

96 场景属性 + 125 同步字段 = 完整清单。每个字段必须归入某个 slice。迁移时对照清单打勾。

### 5.2 Grep 验证

迁移后，grep 场景类的非 getter 属性：
```bash
grep -E "^\s+\w+:\s" warehouse-scene.ts | grep -v "get \|set \|private state"
```
剩余的非 getter 属性 = 漏迁移的（应为 0，除引用类属性）。

### 5.3 行为测试

`tests/behavioral/state-isolation.test.ts`：
```
1. 设预设：lanSlice.isLanMode=true, lanPlayers=[2人]
2. 调 resetLanState()
3. 验证：lanSlice 全部 17 字段回到默认
4. 验证：gameSlice 不受影响
```

`tests/behavioral/full-flow.test.ts`：
```
1. 开单机 -> 出价 -> 结算 -> 重开（resetForNewRun）
2. 验证 game/ai/warehouse/record 重置，lan/settings/app 不变
3. 开联机 -> 退出（resetLanState）
4. 验证 lan 重置，其他不变
5. 开单机 -> 验证完全干净
```

行测**验证状态值**，不验证 UI 呈现（呈现你来测）。

## 六、迁移计划（分阶段）

| 阶段 | 内容 | 风险 | 验证 |
|------|------|------|------|
| 1 | 建 8 slice 文件 + GameState 根 + reset 方法 | 低（新增文件）| tsc + 现有测试 |
| 2 | 场景类加 `private state`，属性逐步改 getter 委托 | 中 | tsc + 集测 |
| 3 | 移除 lanIndexState，LanIndexManager 直接用 lanSlice | 高（联机）| lan-flow 行测 |
| 4 | 移除 lobbyIndexState | 中 | lobby 行测 |
| 5 | 移除 warehouseManagerState/aiIntelState/aiMemoryData | 中 | 集测 |
| 6 | 移除 Manager state 重复字段（BiddingManager 9 字段等）| 中 | bid-flow 行测 |
| 7 | settingsSlice 替代 GAME_SETTINGS 模块变量 | 中 | settings 行测 |
| 8 | 行为测试全覆盖 | 低 | 行测 |

每阶段后：tsc 0 + 全测试通过 + 你手动验证对应功能。

## 七、不迁移的部分

- **Manager 私有 state**（BiddingManagerState 等 70 字段）：Manager 内部用，不同步场景，保留
- **Pinia stores**：Vue 迁移搁置，stores 保留但不用（未来 Vue 迁移可复用 slice 结构）
- **localStorage**：settingsSlice/appSlice 封装读写，其他键保持现状
- **模块级变量**（GAME_SETTINGS 等）：迁移到 settingsSlice 后删除

## 八、预期效果

- 40 个双重存储 -> 0（单数据源）
- 5 个 getter/setter 同步对象 -> 0（slice 直接用）
- 联机/单机隔离 bug -> 消除（resetLanState 集中）
- 设置值不同步 -> 消除（settingsSlice 封装 localStorage）
- 12 类 deps 接线 bug -> 消除（Manager 直接用 slice，无 getter/setter 中间层）
