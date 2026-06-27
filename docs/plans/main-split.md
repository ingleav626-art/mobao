# main.ts 文件拆分方案

> 创建时间：2026-06-17
> 目标：将 main.ts（2548行）拆分为多个职责单一的文件

---

## 一、main.ts 文件内容分析

### 1.1 文件结构

| 部分 | 行数 | 内容 |
|------|------|------|
| **导入和类型声明** | L1-L177 | 177行 | 导入类型、全局模块检查、桥接层初始化 |
| **WarehouseScene 类定义** | L178-L2883 | 2705行 | 构造函数、核心方法、辅助方法 |
| **Mixin 混入** | L2884-L2901 | 17行 | 16个 Mixin 通过 Object.assign 混入 |

### 1.2 WarehouseScene 类方法统计

| 方法 | 行数 | 职责 |
|------|------|------|
| **constructor()** | L470-L689 | 220行 | 初始化 60+ 实例属性 |
| **create()** | L690-L1072 | 382行 | 场景创建、DOM 初始化、事件绑定 |
| **initAudio()** | L724-L740 | 16行 | 音效初始化 |
| **cacheDom()** | L741-L857 | 116行 | DOM 引用缓存 |
| **initAnimations()** | L858-L889 | 31行 | 动画初始化 |
| **bindDomEvents()** | L890-L1072 | 182行 | DOM 事件绑定 |
| **startNewRun()** | L2096-L2170 | 74行 | 新局初始化 |
| **战绩记录方法** | L2171-L2222 | 51行 | 战绩记录相关（调用 BATTLE_RECORD_BRIDGE） |
| **AI逻辑面板方法** | L2223-L2404 | 181行 | AI 逻辑面板渲染 |
| **其他方法** | - | ~1000行 | updateHud、resolveRound、handleBidSubmit 等 |

---

## 二、拆分方案

### 2.1 拆分原则

1. **职责单一**：每个文件只负责一个功能
2. **依赖显式**：通过导入导出，不依赖全局变量
3. **渐进式拆分**：先拆大块，再拆细节
4. **保持功能**：拆分后功能不变，只是文件位置变化

---

### 2.2 拆分目录结构

```
scripts/game/
  ├── main.ts                    # 入口文件（~200行）
  │   - 导入所有模块
  │   - 创建 Phaser.Game 实例
  │   - Mixin 混入
  │
  ├── scene/                     # 场景核心（新目录）
  │   ├── warehouse-scene.ts     # WarehouseScene 类定义（~300行）
  │   │   - class WarehouseScene extends _PhaserScene
  │   │   - constructor()
  │   │   - create()
  │   │   - update()
  │   │
  │   ├── scene-init.ts          # 场景初始化（~500行）
  │   │   - initAudio()
  │   │   - cacheDom()
  │   │   - initAnimations()
  │   │   - bindDomEvents()
  │   │
  │   ├── scene-run.ts           # 回合管理（~300行）
  │   │   - startNewRun()
  │   │   - startNewRound()
  │   │   - resolveRound()
  │   │   - resolveRoundBids()
  │   │
  │   ├── scene-hud.ts           # HUD 更新（~200行）
  │   │   - updateHud()
  │   │   - updateHudMoney()
  │   │   - updateHudRound()
  │   │   - updateHudTimer()
  │   │
  │   ├── scene-battle-record.ts # 战绩记录（~100行）
  │   │   - openBattleRecordPanel()
  │   │   - closeBattleRecordPanel()
  │   │   - saveBattleRecord()
  │   │   - renderBattleRecordPanel()
  │   │
  │   ├── scene-ai-panel.ts      # AI 逻辑面板（~200行）
  │   │   - renderAiLogicPanel()
  │   │   - renderAiLogicPanelForLlm()
  │   │   - showAiConversationMessages()
  │   │
  │   └── scene-utils.ts         # 场景工具方法（~100行）
  │   │   - buildWarehouseSnapshotForSync()
  │   │   - buildWarehouseSnapshotForRecord()
  │   │   - buildBidHistorySnapshot()
  │   │
  │
  ├── core/                      # 核心模块（已有）
  │   ├── constants.ts           # 常量（已有）
  │   ├── deps.ts                # 依赖注入（已有）
  │   ├── settings.ts            # 设置（已有）
  │   └── round-manager.ts       # 回合管理器（已有）
  │
  ├── warehouse/                 # 仓库模块（已有）
  │   ├── index.ts               # 仓库 Mixin（已有）
  │   ├── core.ts                # 核心逻辑（已有）
  │   ├── reveal.ts              # 揭示逻辑（已有）
  │   └── preview.ts             # 预览逻辑（已有）
  │
  ├── ai/                        # AI 模块（已有）
  │   ├── index.ts               # AI Mixin（已有）
  │   ├── wallet.ts              # AI 钱包（已有）
  │   ├── intel.ts               # AI 情报（已有）
  │   ├── memory.ts              # AI 记忆（已有）
  │   ├── reflection.ts          # AI 反思（已有）
  │   └── decision.ts            # AI 决策（已有）
  │
  ├── ui/                        # UI 模块（已有）
  │   ├── index.ts               # UI Mixin（已有）
  │   ├── overlay.ts             # 覆盖层（已有）
  │   ├── panels.ts              # 面板（已有）
  │   └── history.ts             # 历史（已有）
  │
  ├── bidding/                   # 出价模块（已有）
  │   ├── index.ts               # 出价 Mixin（已有）
  │
  ├── lobby/                     # 大厅模块（已有）
  │   ├── index.ts               # 大厅 Mixin（已有）
  │   ├── character-select.ts    # 角色选择（已有）
  │   ├── carousel.ts            # 轮播（已有）
  │   └── map-select.ts          # 地图选择（已有）
  │
  └── lan/                       # 联机模块（已有）
  │   ├── index.ts               # 联机 Mixin（已有）
  │   ├── events.ts              # 联机事件（已有）
  │   ├── reconnect.ts           # 重连（已有）
  │   └── lobby.ts               # 联机大厅（已有）
```

---

## 三、具体拆分步骤

### 3.1 Phase 1：创建 scene 目录（1小时）

**目标**：创建 `scripts/game/scene/` 目录结构

**步骤**：
1. 创建目录：`scene/`
2. 创建文件：`warehouse-scene.ts`、`scene-init.ts`、`scene-run.ts`、`scene-hud.ts`、`scene-battle-record.ts`、`scene-ai-panel.ts`、`scene-utils.ts`

---

### 3.2 Phase 2：拆分 WarehouseScene 类定义（2小时）

**目标**：将 WarehouseScene 类定义拆到 `scene/warehouse-scene.ts`

**步骤**：
1. 从 `main.ts` 提取 WarehouseScene 类定义（L178-L2883）
2. 创建 `scene/warehouse-scene.ts`，包含：
   - class WarehouseScene extends _PhaserScene
   - constructor()
   - create()
   - update()
3. 在 `main.ts` 中导入 WarehouseScene 类

**示例**：
```typescript
// scene/warehouse-scene.ts
import type { WarehouseSceneThis } from "../../types/warehouse-scene-this"

export class WarehouseScene extends _PhaserScene {
  constructor() {
    super("warehouse")
    // ...初始化属性
  }

  create() {
    this.initAudio()
    this.cacheDom()
    this.initAnimations()
    this.bindDomEvents()
  }

  update(time: number, delta: number) {
    // ...每帧更新
  }
}
```

---

### 3.3 Phase 3：拆分场景初始化方法（2小时）

**目标**：将场景初始化方法拆到 `scene/scene-init.ts`

**步骤**：
1. 从 `main.ts` 提取初始化方法：
   - initAudio()（L724-L740）
   - cacheDom()（L741-L857）
   - initAnimations()（L858-L889）
   - bindDomEvents()（L890-L1072）
2. 创建 `scene/scene-init.ts`，导出这些方法
3. 在 `warehouse-scene.ts` 中导入并调用

**示例**：
```typescript
// scene/scene-init.ts
import type { WarehouseSceneThis } from "../../types/warehouse-scene-this"

export function initAudio(this: WarehouseSceneThis) {
  // ...音效初始化
}

export function cacheDom(this: WarehouseSceneThis) {
  // ...DOM 引用缓存
}

export function initAnimations(this: WarehouseSceneThis) {
  // ...动画初始化
}

export function bindDomEvents(this: WarehouseSceneThis) {
  // ...DOM 事件绑定
}

// warehouse-scene.ts
import { initAudio, cacheDom, initAnimations, bindDomEvents } from "./scene-init"

export class WarehouseScene extends _PhaserScene {
  create() {
    initAudio.call(this)
    cacheDom.call(this)
    initAnimations.call(this)
    bindDomEvents.call(this)
  }
}
```

---

### 3.4 Phase 4：拆分回合管理方法（2小时）

**目标**：将回合管理方法拆到 `scene/scene-run.ts`

**步骤**：
1. 从 `main.ts` 提取回合管理方法：
   - startNewRun()（L2096-L2170）
   - startNewRound()
   - resolveRound()
   - resolveRoundBids()
2. 创建 `scene/scene-run.ts`，导出这些方法
3. 在 `warehouse-scene.ts` 中导入并调用

**示例**：
```typescript
// scene/scene-run.ts
import type { WarehouseSceneThis } from "../../types/warehouse-scene-this"

export function startNewRun(this: WarehouseSceneThis) {
  // ...新局初始化
}

export function startNewRound(this: WarehouseSceneThis) {
  // ...新回合初始化
}

export function resolveRound(this: WarehouseSceneThis) {
  // ...回合结算
}

export function resolveRoundBids(this: WarehouseSceneThis, reason: string) {
  // ...出价结算
}
```

---

### 3.5 Phase 5：拆分 HUD 更新方法（1小时）

**目标**：将 HUD 更新方法拆到 `scene/scene-hud.ts`

**步骤**：
1. 从 `main.ts` 提取 HUD 更新方法：
   - updateHud()（L2500-L2600）
   - updateHudMoney()
   - updateHudRound()
   - updateHudTimer()
2. 创建 `scene/scene-hud.ts`，导出这些方法
3. 在 `warehouse-scene.ts` 中导入并调用

---

### 3.6 Phase 6：拆分战绩记录方法（1小时）

**目标**：将战绩记录方法拆到 `scene/scene-battle-record.ts`

**步骤**：
1. 从 `main.ts` 提取战绩记录方法（L2171-L2222）
2. 创建 `scene/scene-battle-record.ts`，导出这些方法
3. 在 `warehouse-scene.ts` 中导入并调用

---

### 3.7 Phase 7：拆分 AI 逻辑面板方法（1小时）

**目标**：将 AI 逻辑面板方法拆到 `scene/scene-ai-panel.ts`

**步骤**：
1. 从 `main.ts` 提取 AI 逻辑面板方法（L2223-L2404）
2. 创建 `scene/scene-ai-panel.ts`，导出这些方法
3. 在 `warehouse-scene.ts` 中导入并调用

---

### 3.8 Phase 8：简化 main.ts（1小时）

**目标**：简化 main.ts 为入口文件（~200行）

**步骤**：
1. 删除已拆分的方法
2. 保留：
   - 导入所有模块
   - 创建 Phaser.Game 实例
   - Mixin 混入
   - 全局模块检查

**示例**：
```typescript
// main.ts（简化后）
import { WarehouseScene } from "./scene/warehouse-scene"
import { WarehouseCoreMixin } from "./warehouse/index"
import { AiWalletMixin } from "./ai/index"
// ...导入其他 Mixin

// 全局模块检查
if (!window.MobaoConstants) throw new Error("MobaoConstants 未加载")

// 创建 Phaser.Game 实例
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: [WarehouseScene]
})

// Mixin 混入
Object.assign(WarehouseScene.prototype, WarehouseCoreMixin)
Object.assign(WarehouseScene.prototype, AiWalletMixin)
// ...其他 Mixin
```

---

## 四、拆分后的文件行数预估

| 文件 | 预估行数 | 说明 |
|------|---------|------|
| `main.ts` | ~200 | 入口文件（导入、创建游戏、Mixin 混入） |
| `scene/warehouse-scene.ts` | ~300 | WarehouseScene 类定义（constructor、create、update） |
| `scene/scene-init.ts` | ~500 | 场景初始化（initAudio、cacheDom、bindDomEvents） |
| `scene/scene-run.ts` | ~300 | 回合管理（startNewRun、resolveRound） |
| `scene/scene-hud.ts` | ~200 | HUD 更新（updateHud） |
| `scene/scene-battle-record.ts` | ~100 | 战绩记录 |
| `scene/scene-ai-panel.ts` | ~200 | AI 逻辑面板 |
| `scene/scene-utils.ts` | ~100 | 场景工具方法 |

**总计**：**~1900 行**（减少 **648 行**）

---

## 五、拆分后的优势

### 5.1 职责清晰

| 文件 | 职责 |
|------|------|
| `main.ts` | 入口文件，组装所有模块 |
| `warehouse-scene.ts` | WarehouseScene 类定义 |
| `scene-init.ts` | 场景初始化 |
| `scene-run.ts` | 回合管理 |
| `scene-hud.ts` | HUD 更新 |
| `scene-battle-record.ts` | 战绩记录 |
| `scene-ai-panel.ts` | AI 逻辑面板 |

### 5.2 易于维护

- ✅ 每个文件职责单一，易于查找
- ✅ Git diff 易于阅读（一次修改只影响一个文件）
- ✅ 代码审查容易（可以快速定位问题）

### 5.3 为模块化提供基础

- ✅ 拆分后文件职责清晰，更容易追踪依赖关系
- ✅ 为后续模块化（消除 window 全局对象、依赖注入）提供基础

---

## 六、注意事项

### 6.1 保持功能不变

- 拆分只是文件位置变化，不改变功能
- 所有方法仍然通过 `this` 调用（Mixin 模式不变）
- 拆分后需要测试确保功能正常

### 6.2 导入路径

- 使用相对路径导入（`import { Xxx } from "./scene/scene-init"`）
- 注意 TypeScript 的导入路径要求（`.ts` 后缀）

### 6.3 类型定义

- 所有方法仍然使用 `WarehouseSceneThis` 类型
- 类型定义文件不需要修改

---

## 七、总结

### 拆分目标

将 main.ts（2548行）拆分为 8 个文件，每个文件职责单一，易于维护。

### 拆分路径

**Phase 1**：创建 scene 目录（1小时）
**Phase 2-7**：拆分各个部分（每部分 1-2小时）
**Phase 8**：简化 main.ts（1小时）

**总计**：**8-10 小时**

### 拆分后的收益

- ✅ main.ts 行数从 2548 行减少到 ~200 行
- ✅ 每个文件职责单一，易于查找和维护
- ✅ 为后续模块化提供基础