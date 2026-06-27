# WarehouseScene 拆分方案对比

> 创建时间：2026-06-17
> 目标：分析 WarehouseScene 类定义的拆分方案，给出推荐方案

---

## 一、当前架构分析

### 1.1 WarehouseScene 类结构

```typescript
// main.ts 中的类定义（~2400行）
class WarehouseScene extends _PhaserScene {
  // 1. 实例属性（~60个）
  gridLayer: any
  revealCellLayer: any
  itemLayer: any
  items: Artifact[]
  round: number
  playerMoney: number
  // ... 更多属性
  
  // 2. 构造函数（~300行）
  constructor() {
    super({ key: "WarehouseScene" })
    // 初始化 60+ 实例属性
  }
  
  // 3. Phaser 生命周期方法
  create() { ... }
  update() { ... }
  
  // 4. 核心方法（~2100行）
  startNewRun() { ... }
  startNewRound() { ... }
  resolveRound() { ... }
  handleBidSubmit() { ... }
  // ... 更多方法
}

// Mixin 合并（~50行）
Object.assign(WarehouseScene.prototype, WarehouseCoreMixin)
Object.assign(WarehouseScene.prototype, WarehouseRevealMixin)
// ... 16+ 个 Mixin
```

### 1.2 当前问题

| 问题 | 说明 | 影响 |
|------|------|------|
| 类定义过长 | ~2400行在一个文件 | 难以阅读、难以维护 |
| Mixin 隐式依赖 | Mixin 通过 `this` 相互调用 | 依赖关系不显式、难以测试 |
| Phaser.Scene 继承 | 必须继承 Phaser.Scene | 限制了架构选择 |
| `this` 类型复杂 | 需要 `WarehouseSceneThis` 接口（~700行） | 类型推断困难 |

---

## 二、拆分方案对比

### 方案 A：保持 Mixin，只拆分文件位置（保守）

**做法**：
1. 把 WarehouseScene 类定义拆到 `scene/warehouse-scene.ts`
2. main.ts 只保留入口配置和 Mixin 合并

**示例**：
```typescript
// scene/warehouse-scene.ts
export class WarehouseScene extends _PhaserScene {
  constructor() { ... }
  create() { ... }
  update() { ... }
  startNewRun() { ... }
  resolveRound() { ... }
}

// main.ts
import { WarehouseScene } from "./scene/warehouse-scene"
import { WarehouseCoreMixin } from "./warehouse/index"
// ... 导入其他 Mixin

Object.assign(WarehouseScene.prototype, WarehouseCoreMixin)
// ... 合并其他 Mixin

const config = { ... }
new Phaser.Game(config)
```

**优点**：
- 改动最小
- main.ts 行数大幅减少
- 类定义独立文件，更清晰

**缺点**：
- **没有解决根本问题**：Mixin 隐式依赖仍然存在
- **只是"换了个地方放代码"**：架构没有本质改变
- **难以测试**：仍然无法单独测试某个 Mixin

**适用场景**：
- 不想大改架构
- 只想降低 main.ts 行数
- 暂时保持现状

---

### 方案 B：改为组合模式（推荐）

**做法**：
1. WarehouseScene 组合多个管理器对象
2. 每个管理器负责特定功能
3. WarehouseScene 只负责协调和 Phaser 生命周期

**示例**：
```typescript
// scene/warehouse-scene.ts
class WarehouseScene extends _PhaserScene {
  // 组合管理器（替代 Mixin）
  private revealManager: RevealManager
  private uiManager: UIManager
  private bidManager: BidManager
  private aiManager: AiManager
  
  constructor() {
    super({ key: "WarehouseScene" })
    
    // 初始化管理器（依赖注入）
    this.revealManager = new RevealManager(this)
    this.uiManager = new UIManager(this)
    this.bidManager = new BidManager(this, this.uiManager)
    this.aiManager = new AiManager(this, this.bidManager)
  }
  
  create() {
    // 初始化 Phaser 图层
    this.gridLayer = this.add.graphics()
    
    // 调用管理器方法
    this.revealManager.setup()
    this.uiManager.setup()
  }
  
  update() {
    this.uiManager.update()
  }
  
  startNewRun() {
    this.revealManager.generateItems()
    this.bidManager.reset()
    this.aiManager.startThinking()
  }
}

// managers/reveal-manager.ts
class RevealManager {
  constructor(private scene: WarehouseScene) {}
  
  setup() { ... }
  generateItems() { ... }
  revealArtifact(item: Artifact) {
    // 显式调用其他管理器
    this.scene.uiManager.updateHud()
  }
}
```

**优点**：
- **依赖关系显式化**：管理器通过构造函数注入依赖
- **可单独测试**：可以 mock 其他管理器进行测试
- **职责清晰**：每个管理器只负责一件事
- **符合现代架构**：组合优于继承

**缺点**：
- **需要重构大量代码**：Mixin 改为管理器类
- **Phaser.Scene 限制**：管理器需要访问 scene 的属性和方法
- **性能考虑**：管理器之间的调用可能引入开销

**适用场景**：
- 想彻底解决架构问题
- 想提高可测试性
- 想让代码更符合现代实践

---

### 方案 C：改为依赖注入（激进）

**做法**：
1. 把 Mixin 改为独立类
2. 通过依赖注入容器获取其他模块
3. WarehouseScene 不直接持有管理器

**示例**：
```typescript
// core/deps.ts
export const Deps = {
  RevealManager: null,
  UIManager: null,
  BidManager: null,
  AiManager: null,
  
  init(managers: Record<string, any>) {
    Object.assign(this, managers)
  }
}

// managers/reveal-manager.ts
class RevealManager {
  revealArtifact(item: Artifact) {
    // 通过依赖注入获取其他管理器
    Deps.UIManager.updateHud()
  }
}

// scene/warehouse-scene.ts
class WarehouseScene extends _PhaserScene {
  constructor() {
    super({ key: "WarehouseScene" })
    
    // 初始化依赖注入容器
    const revealManager = new RevealManager()
    const uiManager = new UIManager()
    const bidManager = new BidManager()
    
    Deps.init({
      RevealManager: revealManager,
      UIManager: uiManager,
      BidManager: bidManager,
    })
  }
}
```

**优点**：
- **完全解耦**：管理器之间通过容器通信
- **易于替换**：可以替换管理器实现
- **易于测试**：可以注入 mock 对象

**缺点**：
- **全局状态**：Deps 是全局单例，可能引入状态污染
- **难以追踪**：依赖关系通过容器，不如直接注入清晰
- **需要重构大量代码**

**适用场景**：
- 想完全解耦
- 想支持多种实现
- 有复杂依赖关系

---

### 方案 D：保持现状，只优化组织（最保守）

**做法**：
1. 不拆分 WarehouseScene 类定义
2. 只优化代码组织和注释
3. 为 Mixin 文件添加依赖关系文档

**示例**：
```typescript
// main.ts（保持现状）
class WarehouseScene extends _PhaserScene {
  // === 构造函数 ===
  constructor() { ... }
  
  // === Phaser 生命周期 ===
  create() { ... }
  update() { ... }
  
  // === 游戏流程 ===
  startNewRun() { ... }
  resolveRound() { ... }
  
  // === 出价逻辑 ===
  handleBidSubmit() { ... }
  
  // === 联机逻辑 ===
  lanStartGame() { ... }
}

// warehouse/index.ts（添加依赖文档）
/**
 * @file warehouse/index.ts
 * @description 仓库揭示系统
 * @requires ui/index.ts - updateHud()
 * @requires audio/audio-manager.ts - playSound()
 */
export const WarehouseRevealMixin = { ... }
```

**优点**：
- **改动最小**
- **不影响运行时**
- **文档化依赖关系**

**缺点**：
- **问题仍然存在**：类定义过长、隐式依赖
- **没有本质改进**

**适用场景**：
- 暂时不想大改
- 只想改善文档
- 等待更好的时机

---

## 三、方案对比表

| 方案 | 改动量 | 解决根本问题 | 可测试性 | 维护性 | 推荐度 |
|------|--------|-------------|---------|--------|--------|
| A - 保持 Mixin | 小 | ❌ 否 | ❌ 低 | 🟡 中 | ⭐⭐ |
| B - 组合模式 | 大 | ✅ 是 | ✅ 高 | ✅ 高 | ⭐⭐⭐⭐⭐ |
| C - 依赖注入 | 大 | ✅ 是 | ✅ 高 | 🟡 中 | ⭐⭐⭐ |
| D - 保持现状 | 最小 | ❌ 否 | ❌ 低 | 🟡 中 | ⭐ |

---

## 四、推荐方案：方案 B（组合模式）

### 4.1 为什么推荐组合模式？

**理由**：
1. **彻底解决问题**：显式依赖、可测试、职责清晰
2. **符合现代架构**：组合优于继承
3. **Phaser 兼容**：管理器可以访问 scene 的属性和方法
4. **渐进式重构**：可以逐步迁移 Mixin

### 4.2 实施步骤

#### Step 1：创建管理器目录结构

```
scripts/game/
  managers/
    reveal-manager.ts
    ui-manager.ts
    bid-manager.ts
    ai-manager.ts
    lan-manager.ts
    audio-manager.ts（已有）
```

#### Step 2：将高频调用的 Mixin 改为管理器

优先级：
1. **UIManager**（ui/index.ts）- 高频调用（updateHud、音效）
2. **RevealManager**（warehouse/index.ts）- 核心功能
3. **BidManager**（bidding/index.ts）- 核心功能
4. **AiManager**（ai/index.ts）- AI 逻辑

#### Step 3：设计管理器接口

```typescript
// managers/ui-manager.ts
export interface UIManagerInterface {
  updateHud(): void
  playSound(soundId: string): void
  showMessage(msg: string): void
}

export class UIManager implements UIManagerInterface {
  constructor(private scene: WarehouseScene) {}
  
  updateHud() { ... }
  playSound(soundId: string) { ... }
  showMessage(msg: string) { ... }
}
```

#### Step 4：重构 WarehouseScene 类

```typescript
// scene/warehouse-scene.ts
export class WarehouseScene extends _PhaserScene {
  // 组合管理器
  public uiManager: UIManager
  public revealManager: RevealManager
  public bidManager: BidManager
  
  constructor() {
    super({ key: "WarehouseScene" })
    
    // 初始化管理器
    this.uiManager = new UIManager(this)
    this.revealManager = new RevealManager(this, this.uiManager)
    this.bidManager = new BidManager(this, this.uiManager)
  }
  
  create() {
    this.uiManager.setup()
    this.revealManager.setup()
  }
  
  startNewRun() {
    this.revealManager.generateItems()
    this.uiManager.updateHud()
  }
}
```

#### Step 5：逐步迁移 Mixin

- 先迁移高频调用的 Mixin（UI、Reveal）
- 保持其他 Mixin 不变（逐步迁移）
- 每迁移一个，验证功能正常

#### Step 6：删除 Mixin 合并代码

- 当所有 Mixin 都迁移为管理器后
- 删除 `Object.assign(WarehouseScene.prototype, XxxMixin)`
- main.ts 只保留入口配置

---

## 五、渐进式重构策略

### 5.1 阶段 1：拆分文件位置（方案 A）

**目标**：降低 main.ts 行数，不改变架构

**步骤**：
1. 把 WarehouseScene 类定义拆到 `scene/warehouse-scene.ts`
2. main.ts 只保留入口配置和 Mixin 合并
3. 验证功能正常

**时间**：1-2 天

### 5.2 阶段 2：迁移高频 Mixin 为管理器（方案 B）

**目标**：解决高频调用的隐式依赖问题

**步骤**：
1. 创建 UIManager（替代 OverlayMixin、PanelsMixin）
2. 创建 RevealManager（替代 WarehouseRevealMixin）
3. 在 WarehouseScene 中组合这些管理器
4. 验证功能正常

**时间**：3-5 天

### 5.3 阶段 3：迁移所有 Mixin 为管理器

**目标**：彻底解决架构问题

**步骤**：
1. 迁移剩余 Mixin（Bid、AI、Lan 等）
2. 删除 Mixin 合并代码
3. 完善管理器接口
4. 验证功能正常

**时间**：5-7 天

---

## 六、总结

### 推荐路径

**短期（1-2天）**：
- 先用方案 A 拆分文件位置，降低 main.ts 行数

**中期（3-5天）**：
- 迁移高频 Mixin 为管理器（UI、Reveal）

**长期（5-7天）**：
- 迁移所有 Mixin 为管理器，彻底解决架构问题

### 关键决策

| 问题 | 决策 |
|------|------|
| 是否拆分 WarehouseScene 类定义？ | ✅ 是，先拆到独立文件 |
| 是否保持 Mixin 模式？ | ❌ 否，逐步改为组合模式 |
| 是否使用依赖注入容器？ | 🟡 可选，管理器可以直接注入 |
| 是否保持现状？ | ❌ 否，需要解决架构问题 |

### 最终目标

- **WarehouseScene 类定义**：< 500 行
- **管理器文件**：每个 < 300 行
- **依赖关系显式化**：通过构造函数注入
- **可测试性**：可单独测试每个管理器