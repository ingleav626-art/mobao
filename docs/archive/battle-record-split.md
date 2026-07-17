# bridge/battle-record.ts 拆分方案

> 创建时间：2026-07-12
> 状态：📋 计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/game/bridge/battle-record.ts`（908 行，工厂函数 `createBattleRecordBridge`，含 4 个闭包级函数 + 12 个 methods 方法）按职责拆分为"薄入口工厂 + 子目录 + re-export 纯函数"结构，参照已落地的 `ai/intel/`、`ui/overlay/` 拆分模式。
> task-list #16

---

## 一、现状分析

### 1.1 文件结构

`battle-record.ts` 是 **bridge 工厂函数**（非 Mixin 对象字面量），与 `overlay.ts`（直接导出 `UiOverlayMixin` 对象）形态不同：

```
createBattleRecordBridge(deps) {        // L151 工厂入口
  const { ...deps } = deps              // L152 解构依赖

  // ── 闭包级函数（可被 methods 调用，部分作为返回值导出）──
  parsePanelTextToHtml(text)            // L154-258  面板文本 -> HTML（内部辅助，用 escapeHtml）
  loadBattleRecords()                   // L260-289  localStorage 读取（导出）
  saveBattleRecords(records)            // L291-294  localStorage 写入（导出）
  formatRecordTime(iso)                 // L296-302  时间格式化（导出，纯函数）

  const methods: ThisType<...> = {      // L304-900  12 个实例方法
    openBattleRecordPanel               // L309-320
    closeBattleRecordPanel              // L322-332
    buildWarehouseSnapshotForRecord     // L334-357
    saveBattleRecord                    // L364-414
    renderBattleRecordSummary           // L416-451
    renderBattleRecordPanel             // L457-522
    openBattleRecordLogs                // L524-537
    closeBattleRecordLogs               // L539-542
    renderBattleRecordLogView           // L544-700  ← 三大块之一（157 行）
    openBattleRecordReplay              // L702-768
    deleteBattleRecord                  // L770-798
    restoreWarehouseFromBattleRecord    // L800-899  ← 三大块之一（100 行）
  }

  return { methods, loadBattleRecords, saveBattleRecords, formatRecordTime }  // L902-907
}
```

文件顶部 L42-144 为 7 个共享 interface + 2 个 import。

### 1.2 三大块行数与耦合度

| 块 | 行号 | 行数 | 耦合度 | 说明 |
|----|------|------|--------|------|
| `parsePanelTextToHtml` | L154-258 | 105 | **低** | 闭包级函数，仅依赖 `escapeHtml`（deps）。被 `renderBattleRecordLogView` 调用（L621, L664）。无 DOM / localStorage / this。可提纯为 `parsePanelTextToHtml(text, escapeHtml)` |
| `renderBattleRecordLogView` | L544-700 | 157 | **中** | methods 方法，依赖 `parsePanelTextToHtml` + `escapeHtml` + `formatRecordTime` + `formatBidRevealNumber`（deps/纯函数）+ `this.dom` + `this.battleRecords` + `this.battleRecordLogView` + `this.renderBattleRecordPanel`（跨模块 this. 调用）。无 localStorage |
| `restoreWarehouseFromBattleRecord` | L800-899 | 100 | **中** | methods 方法，依赖 `GRID_COLS`/`GRID_ROWS`/`clamp`（deps）+ `QUALITY_CONFIG`（import）+ 大量 `this.*`（Phaser 渲染：drawUnknownWarehouse / itemLayer / add.container / renderItem / revealOutline / renderQualityVisual / rebuildWarehouseCellIndex / drawGridLines / load / textures）。无 localStorage / DOM。被 `openBattleRecordReplay`（L732）调用 |

### 1.3 对外接口（拆分后必须保持不变）

| 消费方 | 访问方式 | 接口 |
|--------|----------|------|
| `scripts/game/main.ts` L45, L111-118 | `import { createBattleRecordBridge }` | 工厂函数，传入 deps |
| `scripts/game/main.ts` L129 | `initDeps({ BATTLE_RECORD_BRIDGE })` | 注册到 Deps 容器 |
| `scripts/game/main.ts` L142 | `BATTLE_RECORD_BRIDGE.methods` | `Object.assign` 到 `WarehouseScene.prototype` |
| `scripts/game/scene/warehouse-scene.ts` L370-371 | `Deps.BATTLE_RECORD_BRIDGE.loadBattleRecords()` | 顶层函数，经 Deps 调用 |
| `scripts/game/scene/scene-battle-record.ts` L16 | `this.buildWarehouseSnapshotForRecord()` | 别名 `buildWarehouseSnapshotForSync` 转发 |
| `scripts/game/scene/events-battle-record.ts` | `this.openBattleRecordReplay` / `openBattleRecordLogs` / `closeBattleRecordLogs` / `deleteBattleRecord` / `closeBattleRecordPanel` | methods 经原型合并后通过 this. 调用 |
| `scripts/game/core/deps.ts` L43-48 | `BattleRecordBridge` 接口 | `{ methods, loadBattleRecords(), saveBattleRecords(), formatRecordTime() }` |
| `tests/game/bridge/battle-record.test.ts` L2, L20 | `import { createBattleRecordBridge }` + 解构 `loadBattleRecords, saveBattleRecords, formatRecordTime` | 工厂返回值解构 |

**拆分后 `createBattleRecordBridge` 返回结构不变**（`{ methods, loadBattleRecords, saveBattleRecords, formatRecordTime }`），`methods` 含同样 12 个方法，消费方零改动。

### 1.4 与 Mixin 拆分的形态差异（关键点）

`ai/intel/`、`ui/overlay/` 拆分的是 **Mixin 对象字面量**（`export const XxxMixin = { ... }`），子模块直接导出对象，入口用 `Object.assign({}, A, B, C)` 合并。

`battle-record.ts` 拆分的是 **工厂函数**，methods 内方法依赖闭包变量（`GRID_COLS`/`escapeHtml`/`formatBidRevealNumber` 等 deps）。因此子模块采用 **slice 工厂模式**：每个子模块导出 `createXxxSlice(deps)` 返回 `{ methods }`（persist 额外返回 `loadBattleRecords`/`saveBattleRecords`），入口工厂调用各 slice 工厂并组装。

这是本项目首个 bridge 工厂拆分，将为 `bridge/settlement.ts`（773 行，同类形态）后续拆分建立模式。

---

## 二、完整方法清单与归类

### 2.1 闭包级函数（4 个）

| 函数 | 行号 | 行数 | deps 依赖 | 职责 | 拆分去向 |
|------|------|------|-----------|------|----------|
| `parsePanelTextToHtml` | L154-258 | 105 | `escapeHtml` | 面板文本转 HTML（AI 决策卡片渲染） | `pure.ts`（参数注入 escapeHtml） |
| `loadBattleRecords` | L260-289 | 30 | `BATTLE_RECORD_STORAGE_KEY` + localStorage | 战绩读取 | `persist.ts` |
| `saveBattleRecords` | L291-294 | 4 | `BATTLE_RECORD_STORAGE_KEY` + localStorage | 战绩写入 | `persist.ts` |
| `formatRecordTime` | L296-302 | 7 | 无（纯函数） | ISO 时间格式化 | `pure.ts` |

### 2.2 methods 方法（12 个）

| # | 方法 | 行号 | 行数 | deps 依赖 | this. 跨模块调用 | 职责 | 拆分去向 |
|---|------|------|------|-----------|------------------|------|----------|
| 1 | `openBattleRecordPanel` | L309-320 | 12 | 无 | `this.renderBattleRecordPanel`（panel） | 面板开关 | `panel.ts` |
| 2 | `closeBattleRecordPanel` | L322-332 | 11 | 无 | 无 | 面板开关 | `panel.ts` |
| 3 | `buildWarehouseSnapshotForRecord` | L334-357 | 24 | 无 | `this.items` | 仓库快照序列化 | `persist.ts` |
| 4 | `saveBattleRecord` | L364-414 | 51 | `GRID_COLS`, `GRID_ROWS` | `this.buildWarehouseSnapshotForRecord`（同 slice）+ `saveBattleRecords`（同 slice 闭包） | 战绩保存 | `persist.ts` |
| 5 | `renderBattleRecordSummary` | L416-451 | 36 | `formatBidRevealNumber` | `this.battleRecords` | 摘要渲染 | `panel.ts` |
| 6 | `renderBattleRecordPanel` | L457-522 | 66 | `escapeHtml`, `formatBidRevealNumber` | `this.renderBattleRecordSummary`（同 slice）+ `this.renderBattleRecordLogView`（log-view） | 列表渲染 | `panel.ts` |
| 7 | `openBattleRecordLogs` | L524-537 | 14 | 无 | `this.renderBattleRecordLogView`（同 slice）+ `this.writeLog`（外部） | 日志视图开关 | `log-view.ts` |
| 8 | `closeBattleRecordLogs` | L539-542 | 4 | 无 | `this.renderBattleRecordPanel`（panel） | 日志视图开关 | `log-view.ts` |
| 9 | `renderBattleRecordLogView` | L544-700 | 157 | `escapeHtml`, `formatBidRevealNumber` | `this.renderBattleRecordPanel`（panel） | 日志视图渲染（**三大块之一**） | `log-view.ts` |
| 10 | `openBattleRecordReplay` | L702-768 | 67 | 无 | `this.restoreWarehouseFromBattleRecord`（restore）+ `this.closeBattleRecordPanel`（panel）+ `this.enterSettlementPage` 等（settlement bridge / 外部） | 回放流程控制 | `replay.ts` |
| 11 | `deleteBattleRecord` | L770-798 | 29 | `formatBidRevealNumber` | `saveBattleRecords`（同 slice 闭包）+ `this.renderBattleRecordPanel`（panel）+ `this.exitSettlementPage`（外部） | 战绩删除 | `persist.ts` |
| 12 | `restoreWarehouseFromBattleRecord` | L800-899 | 100 | `GRID_COLS`, `GRID_ROWS`, `clamp` | 大量 Phaser `this.*`（drawUnknownWarehouse / renderItem / revealOutline / renderQualityVisual / rebuildWarehouseCellIndex / drawGridLines / load / textures） | 仓库恢复（**三大块之一**） | `restore.ts` |

### 2.3 归类汇总

| 归类 | methods 数 | 闭包函数 | 目标子模块 | 预估行数 |
|------|-----------|----------|-----------|----------|
| 纯函数 | - | `formatRecordTime`, `parsePanelTextToHtml` | `pure.ts` | ~125 |
| 战绩持久化 | 3（buildSnapshot / save / delete） | `loadBattleRecords`, `saveBattleRecords` | `persist.ts` | ~135 |
| 面板渲染 | 4（open / close / summary / list） | - | `panel.ts` | ~140 |
| 日志视图 | 3（open / close / render） | - | `log-view.ts` | ~190 |
| 回放流程 | 1（openReplay） | - | `replay.ts` | ~85 |
| 仓库恢复 | 1（restore） | - | `restore.ts` | ~115 |
| 共享类型 | - | - | `types.ts` | ~105 |
| **合计** | **12** | **4** | **7 子模块 + 薄入口** | 薄入口 ~55 |

---

## 三、拆分方案

### 3.1 推荐方案 A：slice 工厂 + 子目录

推荐**方案 A**（slice 工厂模式拆分），而非方案 B（仅提取 pure.ts、工厂内 methods 变薄）。

**理由**：
- 方案 B 无法满足 task-list #16 的核心诉求——"三大块应独立"。`renderBattleRecordLogView`（157 行）和 `restoreWarehouseFromBattleRecord`（100 行）仍在工厂闭包内，battle-record.ts 仍超 750 行。
- 方案 A 将三大块分别落入 `pure.ts` / `log-view.ts` / `restore.ts`，每个文件 < 200 行，与 `ai/intel/`、`ui/overlay/` 落地模式一致。
- slice 工厂模式是 bridge 工厂拆分的自然适配（见 1.4），为 settlement.ts 后续拆分建立先例。

### 3.2 目录结构

```
scripts/game/bridge/
  ├── battle-record.ts                   # 薄入口工厂（~55 行）：调用各 slice 工厂 + 组装 + re-export 纯函数
  └── battle-record/                     # 新建子目录
      ├── types.ts                       # 共享 interface（BattleRecordDeps / BattleRecord / BattleRecordLogs 等）
      ├── pure.ts                        # 纯函数：formatRecordTime, parsePanelTextToHtml
      ├── persist.ts                     # 持久化 slice：loadBattleRecords, saveBattleRecords + 3 methods
      ├── panel.ts                       # 面板 slice：4 methods
      ├── log-view.ts                    # 日志视图 slice：3 methods
      ├── replay.ts                      # 回放 slice：1 method
      └── restore.ts                     # 仓库恢复 slice：1 method
```

> `battle-record.ts`（文件）与 `battle-record/`（目录）共存，TS 模块解析中 `"./battle-record"` 优先匹配 `.ts` 文件（与 `ai/intel.ts` + `ai/intel/`、`ui/overlay.ts` + `ui/overlay/` 完全一致）。

### 3.3 各子模块详情

#### `battle-record/types.ts`（~105 行）

从原文件 L47-144 搬移全部 7 个 interface，供所有子模块 import。

| 成员 | 原行号 |
|------|--------|
| `BattleRecordDeps` | L47-55 |
| `BattleRecordSaveResult` | L57-72 |
| `WarehouseSnapshotItem` | L74-85 |
| `AiThoughtLogEntry` | L87-102 |
| `BattleRecordLogs` | L104-111 |
| `BattleRecord` | L113-144 |

无 import（纯类型声明）。

#### `battle-record/pure.ts`（~125 行）

独立可测纯函数，不引用 `this`、不引用闭包 deps。

| 函数 | 原行号 | 改动 |
|------|--------|------|
| `formatRecordTime(iso: string): string` | L296-302 | 零改动（已是纯函数） |
| `parsePanelTextToHtml(text: string, escapeHtml: (s: string) => string): string` | L154-258 | 签名增加 `escapeHtml` 参数（原从闭包取，改为参数注入） |

import：无运行时依赖（`escapeHtml` 由调用方注入）。

#### `battle-record/persist.ts`（~135 行）- createPersistSlice

战绩持久化：localStorage 读写 + 保存/删除/快照方法。

| 成员 | 原行号 | deps 依赖 |
|------|--------|-----------|
| `loadBattleRecords`（闭包函数，导出） | L260-289 | `BATTLE_RECORD_STORAGE_KEY` |
| `saveBattleRecords`（闭包函数，导出） | L291-294 | `BATTLE_RECORD_STORAGE_KEY` |
| `buildWarehouseSnapshotForRecord`（method） | L334-357 | 无 |
| `saveBattleRecord`（method） | L364-414 | `GRID_COLS`, `GRID_ROWS` |
| `deleteBattleRecord`（method） | L770-798 | `formatBidRevealNumber` |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import type { BattleRecordDeps, BattleRecord, BattleRecordSaveResult, WarehouseSnapshotItem } from "./types"`
- `import { formatRecordTime } from "./pure"`（deleteBattleRecord L778 使用）

slice 工厂签名：
```ts
export function createPersistSlice(deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
  loadBattleRecords: () => BattleRecord[]
  saveBattleRecords: (records: BattleRecord[]) => void
}
```

跨模块 `this.` 调用：`saveBattleRecord` 调 `this.buildWarehouseSnapshotForRecord`（同 slice）、`saveBattleRecords`（同 slice 闭包）；`deleteBattleRecord` 调 `this.renderBattleRecordPanel`（panel slice）、`this.exitSettlementPage`（settlement bridge）。

#### `battle-record/panel.ts`（~140 行）- createPanelSlice

战绩面板开关 + 摘要 + 列表渲染。

| 方法 | 原行号 | deps 依赖 |
|------|--------|-----------|
| `openBattleRecordPanel` | L309-320 | 无 |
| `closeBattleRecordPanel` | L322-332 | 无 |
| `renderBattleRecordSummary` | L416-451 | `formatBidRevealNumber` |
| `renderBattleRecordPanel` | L457-522 | `escapeHtml`, `formatBidRevealNumber` |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import type { BattleRecordDeps, WarehouseSnapshotItem } from "./types"`
- `import { loadAppState } from "../../core/app-state"`
- `import { formatRecordTime } from "./pure"`（renderBattleRecordPanel L477 使用）

跨模块 `this.` 调用：`openBattleRecordPanel` 调 `this.renderBattleRecordPanel`（同 slice）；`renderBattleRecordPanel` 调 `this.renderBattleRecordSummary`（同 slice）、`this.renderBattleRecordLogView`（log-view slice）。

#### `battle-record/log-view.ts`（~190 行）- createLogViewSlice

AI 决策日志视图（**三大块之一** `renderBattleRecordLogView`）。

| 方法 | 原行号 | deps 依赖 |
|------|--------|-----------|
| `openBattleRecordLogs` | L524-537 | 无 |
| `closeBattleRecordLogs` | L539-542 | 无 |
| `renderBattleRecordLogView` | L544-700 | `escapeHtml`, `formatBidRevealNumber` |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import type { BattleRecordDeps, AiThoughtLogEntry } from "./types"`
- `import { parsePanelTextToHtml, formatRecordTime } from "./pure"`

跨模块 `this.` 调用：`renderBattleRecordLogView` 调 `this.renderBattleRecordPanel`（panel slice）；`openBattleRecordLogs` / `closeBattleRecordLogs` 调 `this.renderBattleRecordLogView`（同 slice）、`this.renderBattleRecordPanel`（panel slice）、`this.writeLog`（外部）。

> `renderBattleRecordLogView` 内调用 `parsePanelTextToHtml(panelText)`（L621, L664）改为 `parsePanelTextToHtml(panelText, escapeHtml)`，注入 deps.escapeHtml。

#### `battle-record/replay.ts`（~85 行）- createReplaySlice

回放流程控制。

| 方法 | 原行号 | deps 依赖 |
|------|--------|-----------|
| `openBattleRecordReplay` | L702-768 | 无 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import type { BattleRecordDeps, BattleRecord } from "./types"`
- `import type { Player } from "../../../../types/game"`（L734 内联 import 可提前到顶部）

跨模块 `this.` 调用：`this.restoreWarehouseFromBattleRecord`（restore slice）、`this.closeBattleRecordPanel`（panel slice）、`this.exitLobby` / `this.stopRoundTimer` / `this.enterSettlementPage` / `this.updateSettlementPanelMetrics` / `this.showSelfProfit` / `this.setSettlementProgress` / `this.writeLog` / `this.updateHud`（外部 Mixin / settlement bridge）。

> 原 L734 的内联 `import("../../../types/game").Player` 提前为顶部 `import type { Player }`。

#### `battle-record/restore.ts`（~115 行）- createRestoreSlice

仓库恢复（**三大块之一** `restoreWarehouseFromBattleRecord`）。

| 方法 | 原行号 | deps 依赖 |
|------|--------|-----------|
| `restoreWarehouseFromBattleRecord` | L800-899 | `GRID_COLS`, `GRID_ROWS`, `clamp` |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import type { BattleRecordDeps, BattleRecord, WarehouseSnapshotItem } from "./types"`
- `import { QUALITY_CONFIG } from "../../data/artifacts"`
- `import type { Artifact, QualityLevel, QualityConfig } from "../../../../types/game"`

跨模块 `this.` 调用：全部为 Phaser 渲染方法（`this.drawUnknownWarehouse` / `this.itemLayer` / `this.add.container` / `this.renderItem` / `this.revealOutline` / `this.renderQualityVisual` / `this.rebuildWarehouseCellIndex` / `this.drawGridLines` / `this.load` / `this.textures`），无 battle-record 内部跨 slice 调用。

### 3.4 薄入口 `battle-record.ts`（~55 行）

```ts
/**
 * @file bridge/battle-record.ts
 * @module bridge/battle-record
 * @description 战绩记录系统 Bridge 薄入口工厂。通过 slice 工厂模式组装 5 个子模块
 *              （persist/panel/log-view/replay/restore），并 re-export 纯函数。
 *              原 908 行工厂已按职责拆分到 battle-record/ 目录。
 *
 * @exports createBattleRecordBridge - 工厂函数，返回 { methods, loadBattleRecords, saveBattleRecords, formatRecordTime }
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { BattleRecordDeps } from "./battle-record/types"

import { createPersistSlice } from "./battle-record/persist"
import { createPanelSlice } from "./battle-record/panel"
import { createLogViewSlice } from "./battle-record/log-view"
import { createReplaySlice } from "./battle-record/replay"
import { createRestoreSlice } from "./battle-record/restore"
import { formatRecordTime } from "./battle-record/pure"

export function createBattleRecordBridge(deps: BattleRecordDeps) {
  const persist = createPersistSlice(deps)
  const panel = createPanelSlice(deps)
  const logView = createLogViewSlice(deps)
  const replay = createReplaySlice(deps)
  const restore = createRestoreSlice(deps)

  const methods: ThisType<WarehouseSceneThis> = Object.assign(
    {},
    persist.methods,
    panel.methods,
    logView.methods,
    replay.methods,
    restore.methods
  )

  return {
    methods,
    loadBattleRecords: persist.loadBattleRecords,
    saveBattleRecords: persist.saveBattleRecords,
    formatRecordTime
  }
}
```

> 返回结构 `{ methods, loadBattleRecords, saveBattleRecords, formatRecordTime }` 与原版完全一致。`formatRecordTime` 从 pure.ts re-export，保持引用透明。`loadBattleRecords`/`saveBattleRecords` 从 persist slice 提取。

---

## 四、行为保持原则

### 4.1 只搬移，不改逻辑

- **逐字搬移**每个方法体，包括 `console.log` 调试语句（L404-406, L598-600, L884, L890）、空格、注释，均原样保留。
- **不改方法签名**（参数名、类型、返回值）。
- **不改 `ThisType<WarehouseSceneThis>`** 声明，各 slice methods 均标注此类型。
- **不调整 Object.assign 合并顺序**导致的方法覆盖：12 个方法名唯一（已核对），合并顺序不影响结果。
- **保留 `console.log`**：L404-406（saveBattleRecord）、L598-600（renderBattleRecordLogView）、L884/L890（restore）均为调试输出，原样保留，清理应作独立后续任务。

### 4.2 唯一签名变更：parsePanelTextToHtml

`parsePanelTextToHtml` 从闭包函数（隐式取 `escapeHtml`）改为纯函数（显式参数 `escapeHtml`）：

```ts
// 原（闭包）：function parsePanelTextToHtml(text: string): string { ... escapeHtml(...) ... }
// 新（纯函数）：export function parsePanelTextToHtml(text: string, escapeHtml: (s: string) => string): string { ... }
```

调用方 `renderBattleRecordLogView`（log-view.ts）改为 `parsePanelTextToHtml(panelText, escapeHtml)`。此变更使函数可独立测试，行为等价。

### 4.3 对外接口不变

- `createBattleRecordBridge(deps)` 返回 `{ methods, loadBattleRecords, saveBattleRecords, formatRecordTime }`，结构不变。
- `methods` 含同样 12 个方法，签名不变。
- `main.ts` L111-118 的 `createBattleRecordBridge({...})` 调用零改动。
- `main.ts` L142 的 `BATTLE_RECORD_BRIDGE.methods` 零改动。
- `core/deps.ts` 的 `BattleRecordBridge` 接口零改动。
- `scene/warehouse-scene.ts` L371 的 `Deps.BATTLE_RECORD_BRIDGE.loadBattleRecords()` 零改动。
- `tests/game/bridge/battle-record.test.ts` L2 的 `import { createBattleRecordBridge } from "../../../scripts/game/bridge/battle-record"` 路径不变（解析到薄入口 `.ts` 文件）。
- `WarehouseSceneThis` 类型声明不变。

---

## 五、import / deps 分配表

### 5.1 原文件 import（L42-45）

| import | 原行号 | 使用方 | 分配到 |
|--------|--------|--------|--------|
| `loadAppState`（`core/app-state`）| L42 | `renderBattleRecordSummary` | `panel.ts` |
| `QUALITY_CONFIG`（`data/artifacts`）| L43 | `restoreWarehouseFromBattleRecord` | `restore.ts` |
| `WarehouseSceneThis`（type）| L44 | 全部子模块 | 各子模块各自 import type |
| `Artifact`（type）| L45 | `restoreWarehouseFromBattleRecord` | `restore.ts` |

### 5.2 deps 解构分配

原 L152 解构 `{ BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS, clamp, escapeHtml, formatBidRevealNumber }`，各 slice 工厂按需解构：

| dep | 使用方 | 分配到 slice |
|-----|--------|-------------|
| `BATTLE_RECORD_STORAGE_KEY` | loadBattleRecords, saveBattleRecords | persist |
| `GRID_COLS` | saveBattleRecord, restoreWarehouseFromBattleRecord | persist + restore |
| `GRID_ROWS` | saveBattleRecord, restoreWarehouseFromBattleRecord | persist + restore |
| `clamp` | restoreWarehouseFromBattleRecord | restore |
| `escapeHtml` | parsePanelTextToHtml（pure，参数注入）, renderBattleRecordPanel, renderBattleRecordLogView | pure（参数）+ panel + log-view |
| `formatBidRevealNumber` | renderBattleRecordSummary, renderBattleRecordPanel, renderBattleRecordLogView, deleteBattleRecord | panel + log-view + persist |

> 每个 slice 工厂接收完整 `deps: BattleRecordDeps`，内部按需解构。无需拆分 deps 对象。

### 5.3 子模块相对路径基准

子模块路径：`scripts/game/bridge/battle-record/<sub>.ts`
- 类型：`../../../../types/warehouse-scene-this`、`../../../../types/game`
- core/data：`../../core/app-state`、`../../data/artifacts`
- 同目录：`./types`、`./pure`

---

## 六、可测试性提升

### 6.1 现有测试（15 用例，零改动）

`tests/game/bridge/battle-record.test.ts` 已覆盖：
- `loadBattleRecords`：7 用例（空存储 / 正常 / 非数组 / 解析失败 / 过滤 null / legacy id / 截断 20 条）
- `saveBattleRecords`：4 用例（保存 / 截断 / 非数组 / null）
- `formatRecordTime`：4 用例（有效 ISO / 无效 / 空串 / undefined）

拆分后这些测试 import 路径不变，应零改动通过。

### 6.2 新增可测纯函数

拆分后以下纯函数可独立加测（当前 0 用例）：

| 纯函数 | 所在 | 可测场景 | 建议用例数 |
|--------|------|----------|-----------|
| `parsePanelTextToHtml(text, escapeHtml)` | `pure.ts` | LLM 决策卡片 / 规则AI卡片 / prompt 块 / 空文本 / 旧版回退 / 错误框 / 思考框 / 缓存信息 / 跨局记忆 / 动作信息 | 8-10 |
| `formatRecordTime(iso)` | `pure.ts` | 已有 4 用例（保持） | 0（已有） |

建议新增 `tests/game/bridge/battle-record-pure.test.ts`，从 `../../../scripts/game/bridge/battle-record/pure` 导入 `parsePanelTextToHtml`，覆盖各类面板文本输入 -> HTML 输出等价性。

> `parsePanelTextToHtml` 当前完全无测试（埋在闭包内不可达），拆分后参数注入 `escapeHtml` 使其可独立调用，是本次拆分最大的可测试性收益。

---

## 七、验证步骤

拆分完成后依次执行：

1. **TypeScript 类型检查**：`npx tsc --noEmit` -> 期望 0 错误。
   - 重点核对：各 slice 的 `ThisType<WarehouseSceneThis>` 下 `this.X()` 调用均类型可见；薄入口 `Object.assign` 合并结果类型正确；`parsePanelTextToHtml` 新签名调用方传参正确。
2. **单元测试**：`npm run test` -> 期望 1078 通过（当前基线 1078，含 `tests/game/bridge/battle-record.test.ts` 的 15 用例）。
   - 测试 import 路径不变，应零改动通过。
3. **Lint**：`npm run lint` -> 期望 0 error（warning 数不增加）。
   - 重点核对：各子模块无未用 import、无新增 `any`。
4. **格式**：`npm run format` -> 期望通过（无分号、双引号、120 print width、无尾逗号、LF）。
5. **冒烟（手动）**：`npm run dev` 启动，逐一验证：
   - 战绩面板打开/关闭
   - 完成一局后战绩自动保存、列表渲染
   - 战绩摘要（总局数/胜率/利润/最高最低）正确
   - 点击"查看AI决策日志"-> 分页浏览各轮 -> 关闭返回列表
   - 点击"复现该局结算页"-> 仓库恢复 -> 结算页展示 -> 返回
   - 删除战绩（确认弹窗）
   - LAN 同步快照（buildWarehouseSnapshotForSync 别名）正常

---

## 八、风险点

### 8.1 slice 工厂模式首次引入（中风险）

本项目此前拆分的 `ai/intel/`、`ui/overlay/` 均为 Mixin 对象字面量合并。本次是首个 **bridge 工厂拆分**，采用 slice 工厂模式（`createXxxSlice(deps) -> { methods }`）。

**应对**：slice 工厂本质是"把工厂内的闭包按职责分组"，每个 slice 接收同一 `deps` 对象，内部解构所需依赖。薄入口调用各 slice 工厂后 `Object.assign` 合并 methods，与原工厂在单一闭包内定义 methods 的运行时语义等价。`this.` 跨 slice 调用经合并到同一原型后全部生效（与 intel/overlay 跨子模块 `this.` 调用同理）。

### 8.2 子模块间 `this.` 相互调用（低风险）

| 调用方 slice | 被调方法 | 定义位置 |
|-------------|----------|----------|
| panel | `this.renderBattleRecordLogView` | log-view |
| log-view | `this.renderBattleRecordPanel` | panel |
| replay | `this.restoreWarehouseFromBattleRecord` | restore |
| replay | `this.closeBattleRecordPanel` | panel |
| persist | `this.renderBattleRecordPanel` | panel |
| persist | `this.exitSettlementPage` | settlement bridge（外部） |

**应对**：子模块**不得**直接 import 兄弟子模块的方法，一律走 `this.`。`ThisType<WarehouseSceneThis>` 已声明全部场景方法，类型层安全；运行时 `Object.assign` 合并到同一原型后 `this.X` 全部解析。此模式已被 `ai/intel/action.ts`（调 `this.buildAiPrivateRevealContext` 等）验证可行。

### 8.3 `parsePanelTextToHtml` 签名变更（低风险）

唯一签名变更：增加 `escapeHtml` 参数。仅 2 处调用（均在 `renderBattleRecordLogView` 内：L621, L664），均在 log-view.ts 内同步改。

**应对**：`parsePanelTextToHtml` 是闭包级内部函数，不导出、不在 deps.ts 接口中、无外部消费方。签名变更影响面限于 log-view.ts 内部。

### 8.4 `loadBattleRecords` / `saveBattleRecords` 闭包函数位置变更（低风险）

这两个函数从工厂闭包移入 persist slice 工厂内部，但仍由薄入口从 persist slice 提取并返回。

**应对**：返回值结构 `{ loadBattleRecords: persist.loadBattleRecords, saveBattleRecords: persist.saveBattleRecords }` 与原版一致。消费方（`warehouse-scene.ts` L371 经 Deps、测试 L20 解构）零改动。

### 8.5 模块解析：`battle-record.ts` 与 `battle-record/` 共存（低风险）

方案 A 下 `battle-record.ts`（文件）与 `battle-record/`（目录）共存。TS/Node 模块解析中 `"./battle-record"` 优先匹配 `.ts` 文件，不会误入 `battle-record/index.ts`（本方案不建 index.ts）。此模式与 `ai/intel.ts` + `ai/intel/`、`ui/overlay.ts` + `ui/overlay/` 完全一致，已验证可行。

### 8.6 `console.log` 调试语句（低风险，非阻塞）

`saveBattleRecord`（L404-406）、`renderBattleRecordLogView`（L598-600）、`restoreWarehouseFromBattleRecord`（L884, L890）含 `console.log` 调试输出。按"只搬移不改逻辑"原则原样保留。

---

## 九、执行顺序建议（分阶段）

建议分 **2 个阶段**执行，每阶段独立可验证：

### 阶段 1：提取纯函数 + types（低风险，先落地可测收益）

1. 新建 `scripts/game/bridge/battle-record/` 目录。
2. 创建 `battle-record/types.ts`（搬 L47-144 全部 interface）。
3. 创建 `battle-record/pure.ts`（搬 `formatRecordTime` L296-302 零改动 + `parsePanelTextToHtml` L154-258 改签名加 `escapeHtml` 参数）。
4. 改 `battle-record.ts`：删除已搬移的 interface / 纯函数，改为从 `./battle-record/types` 和 `./battle-record/pure` import；`parsePanelTextToHtml` 调用处改为 `parsePanelTextToHtml(text, escapeHtml)`。
5. 验证：`npx tsc --noEmit` + `npm run test`（15 用例通过）。
6. 可选：新增 `tests/game/bridge/battle-record-pure.test.ts` 覆盖 `parsePanelTextToHtml`。

### 阶段 2：slice 工厂拆分 methods

7. 创建 `battle-record/persist.ts`（搬 `loadBattleRecords` / `saveBattleRecords` + 3 methods）。
8. 创建 `battle-record/panel.ts`（搬 4 methods）。
9. 创建 `battle-record/log-view.ts`（搬 3 methods，调 `parsePanelTextToHtml(text, escapeHtml)`）。
10. 创建 `battle-record/replay.ts`（搬 1 method，内联 import 提前）。
11. 创建 `battle-record/restore.ts`（搬 1 method）。
12. 改写 `battle-record.ts` 为薄入口工厂（见 3.4，~55 行）。
13. 验证：`npx tsc --noEmit` -> `npm run test`（1078 通过）-> `npm run lint` -> `npm run format`。
14. 手动冒烟（见第七节 5）。

每步搬完即可单独 `npx tsc --noEmit` 校验该子模块类型，逐步推进降低风险。

---

## 十、难归类 / 跨职责方法说明

| 方法 | 归类决策 | 理由 |
|------|----------|------|
| `buildWarehouseSnapshotForRecord` | `persist.ts` | 序列化当前仓库为记录快照，被 `saveBattleRecord`（同 slice）调用；也是 LAN 同步别名 `buildWarehouseSnapshotForSync` 的底层方法，属"记录构建"职责 |
| `deleteBattleRecord` | `persist.ts` | 删除记录 + 调 `saveBattleRecords`（同 slice 闭包）持久化，属持久化职责 |
| `openBattleRecordReplay` | `replay.ts`（独立于 restore） | 回放流程控制（进入结算页、设置标志位），与 `restoreWarehouseFromBattleRecord`（Phaser 仓库重建）技术关注点不同；二者经 `this.` 耦合（replay 调 restore），但分文件后职责清晰 |
| `openBattleRecordLogs` / `closeBattleRecordLogs` | `log-view.ts`（与 render 同文件） | 仅 14 + 4 行，但都是日志视图的开关，与 `renderBattleRecordLogView` 强内聚，单独建文件过度拆分 |

> `replay.ts`（1 方法，85 行）和 `restore.ts`（1 方法，115 行）均为单方法文件，但各自承载一大块独立逻辑（回放流程 / 仓库重建），体量足够，且 task-list 明确要求 `restoreWarehouseFromBattleRecord` 独立。若后续需合并，可将 restore 并入 replay，但当前推荐分文件。
