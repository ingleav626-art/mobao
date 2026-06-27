# 项目深度重构计划

> 创建时间：2026-06-17
> 目标：解决"巨行星文件"、"超级对象"、IIFE滥用、模块化不完整等问题
> 前置条件：TypeScript 迁移已完成（strict 模式 0 错误，any 85% 消除）

---

## 一、现状分析

### 1.1 巨行星文件（行数 > 1000）

| 文件 | 行数 | 问题 | 影响 |
|------|------|------|------|
| `main.ts` | 2548 | 游戏入口，定义 WarehouseScene 类 + 核心方法 | 类定义过长，但已拆分 Mixin |
| `llm-decision.ts` | 1569 | LLM 决策逻辑，参数结构复杂 | 难以调试、难以扩展 |
| `warehouse/index.ts` | 1288 | 仓库场景逻辑，包含3个 Mixin | 职责混杂（Core+Reveal+Preview） |
| `llm-manager.ts` | 1186 | LLM 管理器，配置项多样 | 难以配置、难以测试 |
| `character-select.ts` | 1181 | 角色选择，UI+逻辑混杂 | 难以复用 |
| `lan/lobby.ts` | 1178 | 联机大厅，UI+网络+逻辑混杂 | 难以测试网络逻辑 |

### 1.2 超级对象（WarehouseScene）

**现状**：`WarehouseScene` 类的 Mixin **已经拆分到各个模块**，main.ts 只是组装文件。

**当前 Mixin 分布**：

| 模块 | 文件 | Mixin 数量 | 行数 | 说明 |
|------|------|-----------|------|------|
| warehouse | `warehouse/index.ts` | 3 | 1288 | WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin |
| ai | `ai/index.ts`（导出） | 5 | - | AiWalletMixin, AiIntelMixin, AiMemoryMixin, AiReflectionMixin, AiDecisionMixin（实际在各自文件） |
| ui | `ui/index.ts`（导出） | 3 | - | OverlayMixin, PanelsMixin, HistoryMixin（实际在各自文件） |
| lobby | `lobby/index.ts` | 1 | 832 | LobbyIndexMixin |
| lan | `lan/index.ts` | 1 | 1178 | LanIndexMixin（还导入了 LanGameFlowMixin, LanSyncMixin 等） |
| bidding | `bidding/index.ts` | 1 | - | BiddingMixin |
| core | `core/round-manager.ts` | 1 | - | RoundManagerMixin |
| core | `core/skill-item-manager.ts` | 1 | - | SkillItemManagerMixin |
| core | `core/settlement-manager.ts` | 1 | - | SettlementManagerMixin |

**main.ts 的角色**：
- 导入所有 Mixin（通过 `import { XxxMixin } from "./xxx/index"`）
- 定义 `WarehouseScene` 类（构造函数、核心方法）
- 通过 `Object.assign` 合并所有 Mixin 到 `WarehouseScene.prototype`

**真正的问题**：
1. **隐式依赖**：Mixin 之间通过 `this` 相互调用（依赖关系不显式）
2. **难以单元测试**：无法单独测试某个 Mixin（因为依赖其他 Mixin）
3. **`this` 类型复杂**：需要 `WarehouseSceneThis` 接口（~700行）才能推断类型

### 1.3 IIFE 使用情况

**当前使用**：
- `lan-bridge.ts`：使用 IIFE 挂载到 `window.LanBridge`（合理，需要保持）
- `llm-decision.ts`、`battle-record.ts`、`llm-settings.ts`：使用 IIFE 创建局部作用域（可改为 ES Module）

**问题**：
- IIFE 不利于 TypeScript 类型推断
- IIFE 创建的局部作用域可以用 ES Module 替代
- IIFE 挂载到 `window` 的方式已过时（应该用 ES Module 导出）

### 1.4 Vue 使用情况

**当前状态**：项目中没有使用 Vue。

**用户意图**：可能想引入 Vue 来管理 UI 状态，替代当前的 DOM 操作。

**潜在收益**：
- 响应式 UI 更新（替代手动 DOM 操作）
- 组件化 UI（替代当前的 HTML 模板字符串）
- 更好的状态管理（替代当前的 `this.xxx` 属性）

**潜在风险**：
- Phaser 游戏引擎与 Vue 的集成需要谨慎
- 大量现有代码需要重写
- 可能引入新的复杂性

### 1.5 模块化现状

**已完成**：
- ES Module 导入导出（170 import / 432 export）
- `window.XXX` 模块间通信已清除

**未完成**：
- `Deps` 依赖注入容器使用不充分（部分模块仍直接访问全局变量）
- Mixin 模式不是真正的模块化（只是代码组织方式）
- 缺少统一的模块边界定义

---

## 二、重构目标

### 2.1 总体目标

| 目标 | 当前状态 | 目标状态 | 收益 |
|------|---------|---------|------|
| 巨行星文件拆分 | 6 个文件 > 1000 行 | 所有文件 < 500 行 | 可维护性提升 |
| 超级对象解耦 | 16+ Mixin 合并 | 按职责拆分为独立模块 | 可测试性提升 |
| IIFE 消除 | 5 处 IIFE | 仅保留必要的 IIFE | 类型推断改善 |
| Vue 引入 | 无 Vue | 可选引入（需评估） | UI 状态管理改善 |
| 模块化完善 | ES Module 已完成 | 统一模块边界 | 依赖关系清晰 |

### 2.2 分级目标

| 阶段 | 目标 | 预计耗时 | 风险 |
|------|------|---------|------|
| **Phase 1 — 巨行星文件拆分** | main.ts、llm-decision.ts、warehouse/index.ts 拆分 | 3-5 天 | 中（需要理解现有逻辑） |
| **Phase 2 — 超级对象解耦** | WarehouseScene 拆分为独立模块 | 5-7 天 | 高（涉及核心架构） |
| **Phase 3 — IIFE 消除** | 将不必要的 IIFE 改为 ES Module | 1-2 天 | 低 |
| **Phase 4 — Vue 引入评估** | 评估 Vue 引入的可行性和收益 | 1-2 天 | 中（需要技术决策） |
| **Phase 5 — 模块化完善** | 统一模块边界，完善依赖注入 | 2-3 天 | 低 |

---

## 三、Phase 1：巨行星文件拆分

### 3.1 main.ts 分析（2548 行）

**当前结构**：
- 文件头导入（~50 行）
- 桥接器初始化（LLM_BRIDGE、BATTLE_RECORD_BRIDGE、SETTLEMENT_BRIDGE）（~100 行）
- WarehouseScene 类定义（~2400 行）
  - 构造函数（~300 行）
  - 核心方法（create、update、startNewRun、resolveRound 等）（~2100 行）
- Mixin 合并（~50 行）

**现状**：Mixin 已拆分，main.ts 主要问题是 **WarehouseScene 类定义过长**。

**拆分策略**：

#### 3.1.1 拆分 WarehouseScene 类定义

| 新文件 | 职责 | 预计行数 | 提取内容 |
|--------|------|---------|---------|
| `scene/warehouse-scene.ts` | WarehouseScene 类定义 | ~400 | 类声明、构造函数、init/update |
| `scene/core-methods.ts` | 核心方法 | ~500 | startNewRun、startNewRound、resolveRound |
| `scene/lan-methods.ts` | 联机方法 | ~300 | bindLanEvents、lanStartGame、lanBroadcastBid |
| `scene/ai-methods.ts` | AI 方法 | ~300 | AI 相关方法（已有部分在 ai/index.ts） |
| `scene/ui-methods.ts` | UI 方法 | ~400 | updateHud、音效、动画（已有部分在 ui/index.ts） |
| `main.ts` | 游戏入口 | ~100 | Phaser.Game 配置、场景注册、Mixin 合并 |

**注意**：部分方法已经在各自的 Mixin 中，main.ts 中剩余的主要是：
- 构造函数（初始化 60+ 实例属性）
- create()（场景创建）
- update()（每帧更新）
- startNewRun() / startNewRound()（新局/新回合）
- resolveRound()（回合结算）
- handleBidSubmit()（玩家出价提交）
- 联机相关方法（部分在 lan/index.ts）
- 音效方法（部分在 audio/）

#### 3.1.2 拆分步骤

1. **Step 1**：创建 `scene/` 目录结构
2. **Step 2**：提取构造函数和 init/update 到 `scene/warehouse-scene.ts`
3. **Step 3**：提取核心方法（startNewRun、resolveRound）到 `scene/core-methods.ts`
4. **Step 4**：提取联机方法到 `scene/lan-methods.ts`
5. **Step 5**：提取 UI 方法到 `scene/ui-methods.ts`
6. **Step 6**：简化 `main.ts` 为入口文件
7. **Step 7**：验证 `npx tsc --noEmit` 0 错误
8. **Step 8**：验证游戏功能正常

### 3.2 llm-decision.ts 拆分计划（1569 行 → < 500 行）

**当前结构**：
- LLM 决策逻辑（参数解析、策略评估、行动选择）
- 大量嵌套函数和 IIFE

**拆分策略**：

| 新文件 | 职责 | 预计行数 |
|--------|------|---------|
| `llm/decision/parser.ts` | 参数解析 | ~200 |
| `llm/decision/evaluator.ts` | 策略评估 | ~300 |
| `llm/decision/selector.ts` | 行动选择 | ~200 |
| `llm/decision/index.ts` | 决策入口 | ~100 |

### 3.3 warehouse/index.ts 拆分计划（1288 行 → < 500 行）

**当前结构**：
- 仓库渲染逻辑
- 交互处理
- 状态管理

**拆分策略**：

| 新文件 | 职责 | 预计行数 |
|--------|------|---------|
| `warehouse/renderer.ts` | 渲染逻辑 | ~300 |
| `warehouse/interaction.ts` | 交互处理 | ~200 |
| `warehouse/state.ts` | 状态管理 | ~200 |
| `warehouse/index.ts` | 入口文件 | ~100 |

---

## 四、Phase 2：超级对象解耦

### 4.1 WarehouseScene 解耦策略

**当前现状**：
- Mixin 已拆分到各个模块（warehouse、ai、ui、lobby、lan 等）
- main.ts 通过 `Object.assign` 合并所有 Mixin 到 `WarehouseScene.prototype`
- Mixin 之间通过 `this` 相互调用（隐式依赖）
- `this` 类型需要 `WarehouseSceneThis` 接口（~700行）

**真正的问题**：
1. **隐式依赖**：Mixin A 调用 Mixin B 的方法，但依赖关系不显式
2. **难以测试**：无法单独测试某个 Mixin（因为依赖其他 Mixin）
3. **类型复杂**：`WarehouseSceneThis` 接口需要列出所有 Mixin 的方法

**解耦方案**：

#### 4.1.1 方案 A：依赖注入（推荐）

**原理**：将 Mixin 改为独立类，通过依赖注入获取其他模块。

**示例**：
```typescript
// Before: Mixin 通过 this 调用其他方法（隐式依赖）
const WarehouseRevealMixin = {
  revealArtifact(this: WarehouseSceneThis, item: Artifact) {
    this.updateHud() // 隐式依赖 UiMixin
    this.playSound("reveal") // 隐式依赖 AudioManager
  }
}

// After: 独立类通过依赖注入（显式依赖）
class RevealManager {
  constructor(
    private uiManager: UIManager,
    private audioManager: AudioManager
  ) {}

  revealArtifact(item: Artifact) {
    this.uiManager.updateHud()
    this.audioManager.playSound("reveal")
  }
}
```

**优点**：
- 依赖关系显式化
- 可单独测试每个模块
- 类型推断自然

**缺点**：
- 需要重构大量代码
- 需要设计依赖注入容器

**实施步骤**：
1. 设计依赖注入容器（扩展 `Deps.ts`）
2. 将高频调用的 Mixin 改为独立类（如 UiMixin → UIManager）
3. 通过构造函数注入依赖
4. 逐步替换所有 Mixin

#### 4.1.2 方案 B：事件驱动（备选）

**原理**：Mixin 之间通过事件通信，不直接调用。

**示例**：
```typescript
// Before: Mixin 直接调用（隐式依赖）
const WarehouseRevealMixin = {
  revealArtifact(this: WarehouseSceneThis, item: Artifact) {
    this.updateHud()
  }
}

// After: Mixin 发送事件（解耦）
class RevealManager {
  constructor(private eventBus: EventBus) {}

  revealArtifact(item: Artifact) {
    this.eventBus.emit("artifact:revealed", { item })
  }
}

// UiMixin 监听事件
class UIManager {
  constructor(private eventBus: EventBus) {
    eventBus.on("artifact:revealed", () => this.updateHud())
  }
}
```

**优点**：
- 模块完全解耦
- 易于扩展（新增监听器）

**缺点**：
- 事件流难以追踪
- 可能引入性能问题

**实施步骤**：
1. 设计事件总线（EventBus）
2. 定义事件类型和事件处理器
3. 将 Mixin 改为事件监听器
4. 逐步替换所有 Mixin

#### 4.1.3 方案 C：保持 Mixin 但改进类型（保守）

**原理**：保持 Mixin 模式，但改进 `this` 类型推断和依赖关系文档化。

**示例**：
```typescript
// 使用 ThisType 声明 this 类型
const WarehouseRevealMixin = {
  revealArtifact(this: WarehouseSceneThis, item: Artifact) {
    this.updateHud() // 类型安全
  }
} satisfies ThisType<WarehouseSceneThis>

// 在文件头注释中声明依赖
/**
 * @file warehouse/index.ts
 * @description 仓库揭示系统
 * @requires ui/index.ts - updateHud()
 * @requires audio/audio-manager.ts - playSound()
 */
```

**优点**：
- 改动最小
- 保持现有架构
- 不影响运行时性能

**缺点**：
- 隐式依赖仍然存在
- 难以单独测试
- `WarehouseSceneThis` 接口仍然复杂

**实施步骤**：
1. 为每个 Mixin 文件添加依赖关系注释
2. 使用 `ThisType` 声明 this 类型
3. 完善 `WarehouseSceneThis` 接口定义

### 4.2 推荐路径：渐进式重构

> 来源：原 mixin-handling-plan.md（已合并到本文档）

**核心思路**：不一步到位，分三阶段逐步解耦。

#### 阶段 1：保持 Mixin，只拆分文件位置（短期，1-2天）

将 WarehouseScene 类定义拆到 `scene/warehouse-scene.ts`，main.ts 只保留入口和 Mixin 合并。不改变架构，仅降低文件行数。

```typescript
// main.ts（简化后）
import { WarehouseScene } from "./scene/warehouse-scene"
import { WarehouseCoreMixin } from "./warehouse/index"
Object.assign(WarehouseScene.prototype, WarehouseCoreMixin)
```

#### 阶段 2：高频 Mixin 改为独立函数（中期，3-5天）

将高频调用的 Mixin 方法改为独立函数，参数显式传入依赖：

```typescript
// Before: Mixin 通过 this 调用（隐式依赖）
export const WarehouseRevealMixin = {
  revealArtifact(this: WarehouseSceneThis, item: Artifact) {
    this.updateHud()  // 不知道依赖谁
  }
}

// After: 独立函数，显式传入依赖
export function revealArtifact(scene: WarehouseScene, item: Artifact) {
  updateHud(scene)  // 显式调用
}
```

优先处理：WarehouseRevealMixin、UiMixin、BiddingMixin。

#### 阶段 3：所有 Mixin 改为独立类（长期，5-7天）

将 Mixin 改为独立类，通过构造函数注入依赖，WarehouseScene 通过组合管理器替代 Mixin：

```typescript
class WarehouseScene extends _PhaserScene {
  private revealManager: RevealManager
  private uiManager: UIManager

  constructor() {
    super("warehouse")
    this.uiManager = new UIManager(this)
    this.revealManager = new RevealManager(this, this.uiManager)
  }
}
```

#### 收益对比

| 方案 | 收益 | 风险 |
|------|------|------|
| 阶段 1 | main.ts 行数减少 | 低 |
| 阶段 2 | 解决隐式依赖、提高可测试性 | 中 |
| 阶段 3 | 彻底解决架构、符合现代实践 | 高 |

---

## 五、Phase 3：IIFE 消除

### 5.1 当前 IIFE 使用

| 文件 | IIFE 用途 | 是否必要 | 处理方式 |
|------|---------|---------|---------|
| `lan-bridge.ts` | 挂载到 `window.LanBridge` | ✅ 必要（原生桥接） | 保持不变 |
| `llm-decision.ts` | 创建局部作用域 | ❌ 不必要 | 改为 ES Module |
| `battle-record.ts` | 创建局部作用域 | ❌ 不必要 | 改为 ES Module |
| `llm-settings.ts` | 创建局部作用域 | ❌ 不必要 | 改为 ES Module |

### 5.2 消除策略

**不必要的 IIFE**：
```typescript
// Before: IIFE 创建局部作用域
const result = (function() {
  const localVar = ...
  return ...
})()

// After: ES Module 自然提供局部作用域
const localVar = ...
const result = ...
export { result }
```

**必要的 IIFE（lan-bridge.ts）**：
- 保持不变，因为需要挂载到 `window.LanBridge`
- 添加注释说明原因

---

## 六、Phase 4：Vue 引入评估

### 6.1 当前 UI 状态管理

**现状**：
- 手动 DOM 操作（`document.getElementById`、`innerHTML`）
- 状态存储在 `this.xxx` 属性
- UI 更新通过 `updateHud()`、`renderXxx()` 方法

**问题**：
- DOM 操作分散在多个文件
- 状态变化时需要手动调用更新方法
- UI 逻辑与业务逻辑混杂

### 6.2 Vue 引入收益评估

| 收益 | 说明 | 适用场景 |
|------|------|---------|
| 响应式 UI | 状态变化自动更新 UI | HUD、面板、弹窗 |
| 组件化 | UI 模块可复用 | 角色选择、商店、结算 |
| 状态管理 | Vuex/Pinia 统一状态 | 游戏全局状态 |
| 模板语法 | 替代 HTML 字符串 | UI 模板定义 |

### 6.3 Vue 引入风险评估

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| Phaser 集成 | Phaser 游戏引擎与 Vue 的集成需要谨慎 | 仅在 UI 层使用 Vue，游戏逻辑保持 Phaser |
| 大量重写 | 现有 DOM 操作代码需要重写 | 分阶段迁移，优先迁移简单 UI |
| 性能影响 | Vue 响应式可能引入性能开销 | 评估关键路径性能 |
| 学习成本 | 团队需要学习 Vue | 提供培训和文档 |

### 6.4 Vue 引入方案（可选）

#### 6.4.1 方案 A：仅 UI 层使用 Vue（推荐）

**适用范围**：
- HUD（回合、倒计时、金钱）
- 面板（私有情报、历史记录）
- 弹窗（角色选择、商店、结算）

**不适用范围**：
- Phaser 游戏画布（仓库网格、藏品渲染）
- 游戏核心逻辑（出价、揭示、结算）

**实施步骤**：
1. 创建 Vue 应用实例（挂载到 `#ui-layer`）
2. 定义 UI 组件（HUD、面板、弹窗）
3. 通过事件或 props 与 Phaser 通信
4. 逐步迁移现有 UI

#### 6.4.2 方案 B：不引入 Vue（保守）

**理由**：
- 当前 UI 已能满足需求
- 避免引入新的复杂性
- 保持项目简洁

**替代方案**：
- 使用更轻量的响应式库（如 Svelte）
- 或保持现有 DOM 操作，但优化组织方式

### 6.5 推荐决策

**建议**：先完成 Phase 1-3，再评估 Vue 引入。

**理由**：
- Vue 引入需要大量重写，应先解决架构问题
- Vue 引入是可选的，不是必须的
- 可以先尝试轻量级方案

---

## 七、Phase 5：模块化完善

### 7.1 统一模块边界

**当前问题**：
- 模块职责不清晰（如 `warehouse/index.ts` 包含渲染+交互+状态）
- 模块依赖关系不显式（Mixin 通过 `this` 相互调用）

**解决方案**：
- 定义模块职责边界（每个模块只负责一件事）
- 使用依赖注入显式化依赖关系
- 创建模块接口文档

### 7.2 完善依赖注入

**当前 `Deps.ts`**：
```typescript
export const Deps = {
  LLM_BRIDGE: null,
  BATTLE_RECORD_BRIDGE: null,
  SETTLEMENT_BRIDGE: null,
}
```

**扩展方案**：
```typescript
export const Deps = {
  // 桥接器
  LLM_BRIDGE: null,
  BATTLE_RECORD_BRIDGE: null,
  SETTLEMENT_BRIDGE: null,
  
  // 管理器（新增）
  UIManager: null,
  AudioManager: null,
  RevealManager: null,
  BidManager: null,
  
  // 初始化方法
  init(managers: Record<string, any>) {
    Object.assign(this, managers)
  }
}
```

---

## 八、实施优先级

| 优先级 | 任务 | 预计耗时 | 风险 | 收益 |
|--------|------|---------|------|------|
| **P0** | main.ts 拆分 | 3-5 天 | 中 | 可维护性大幅提升 |
| **P1** | llm-decision.ts 拆分 | 2-3 天 | 低 | 可调试性提升 |
| **P1** | warehouse/index.ts 拆分 | 2-3 天 | 低 | 关注点分离 |
| **P2** | IIFE 消除 | 1-2 天 | 低 | 类型推断改善 |
| **P3** | 超级对象解耦（依赖注入） | 5-7 天 | 高 | 可测试性大幅提升 |
| **P4** | Vue 引入评估 | 1-2 天 | 中 | 技术决策 |
| **P5** | 模块化完善 | 2-3 天 | 低 | 依赖关系清晰 |

---

## 九、验收标准

### 9.1 Phase 1 验收

- [ ] main.ts 行数 < 500
- [ ] llm-decision.ts 行数 < 500
- [ ] warehouse/index.ts 行数 < 500
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 游戏功能正常

### 9.2 Phase 2 验收

- [ ] WarehouseScene 不再使用 Mixin 合并
- [ ] 所有模块通过依赖注入获取依赖
- [ ] 可单独测试每个模块

### 9.3 Phase 3 验收

- [ ] 仅保留必要的 IIFE（lan-bridge.ts）
- [ ] 其他 IIFE 改为 ES Module

### 9.4 Phase 4 验收

- [ ] 完成 Vue 引入可行性评估
- [ ] 制定 Vue 引入方案（或决定不引入）

### 9.5 Phase 5 验收

- [ ] 所有模块职责清晰
- [ ] 依赖关系显式化
- [ ] `Deps` 依赖注入容器完善

---

## 十、总结

**当前状态**：TypeScript 迁移已完成，Mixin 已拆分，但仍有架构问题。

**核心问题**：
1. **巨行星文件**：
   - main.ts（2548行）- WarehouseScene 类定义过长（但 Mixin 已拆分）
   - llm-decision.ts（1569行）- LLM 决策逻辑复杂
   - warehouse/index.ts（1288行）- 包含3个 Mixin（Core+Reveal+Preview）
   - llm-manager.ts（1186行）- LLM 管理器配置多样
   
2. **超级对象隐式依赖**：
   - Mixin 已拆分到各个模块，但通过 `this` 相互调用
   - 依赖关系不显式，难以单独测试
   
3. **IIFE 滥用**：
   - lan-bridge.ts 使用 IIFE（必要）
   - llm-decision.ts、battle-record.ts、llm-settings.ts 使用 IIFE（不必要）
   
4. **Vue 引入需求**：
   - 当前无 Vue，需要评估引入可行性
   
5. **模块化不完整**：
   - 依赖注入容器使用不充分

**推荐路径**：
1. **P0**：拆分 main.ts 的 WarehouseScene 类定义（构造函数、核心方法）
2. **P1**：拆分 llm-decision.ts、warehouse/index.ts
3. **P2**：消除不必要的 IIFE
4. **P3**：解耦超级对象（依赖注入或事件驱动）
5. **P4**：评估 Vue 引入
6. **P5**：完善模块化

**预期收益**：
- 可维护性大幅提升（文件行数 < 500）
- 可测试性大幅提升（依赖关系显式化）
- 代码质量提升（消除不必要的 IIFE）
- 依赖关系清晰（依赖注入或事件驱动）