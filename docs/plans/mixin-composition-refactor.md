# Mixin -> 组合/依赖注入 架构重构计划

> 创建时间：2026-07-13
> 性质：架构 Phase 2（治本层），task-list（治标，文件职责）的后续
> 前置：task-list S1-S46 已完成（文件级职责清理）；Phase 1 纯函数提取已完成 16/19 Mixin
> 关联文档：`docs/issues/architecture.md`（方案 A/B/C）、`docs/plans/post-task-list-roadmap.md`、`docs/plans/vue-integration.md`
> 约束：不改代码，只调研 + 写计划。本计划遵循渐进式、可回退、不破坏运行时原则

---

## 一、现状概览

### 1.1 装配方式

`main.ts`（198 行）通过单次 `Object.assign(WarehouseScene.prototype, ...)` 合并：

- **19 个 Mixin**（warehouse 3 + ai 5 + bidding 1 + ui 3 + lobby 3 + lan 1 + core 3）
- **scene/ 提取的方法**（5 个模块导出 + 7 个具名方法）
- **3 个 bridge.methods**（LLM_BRIDGE / BATTLE_RECORD_BRIDGE / SETTLEMENT_BRIDGE）

所有方法通过 `this: WarehouseSceneThis`（`ThisType`）声明类型，运行时 `this` 即场景实例。

### 1.2 核心痛点

| 痛点 | 说明 | 量化 |
|------|------|------|
| 隐式 `this` 互调 | Mixin A 调用 `this.xxx()` 时不知道依赖 Mixin B | 全仓 ~1200+ 处 `this.` 跨 Mixin 调用 |
| WarehouseSceneThis 接口膨胀 | 单一接口声明所有属性 + 所有方法 | **1022 行**（`types/warehouse-scene-this.d.ts`） |
| 无法独立单测 | 测试某 Mixin 需 mock 整个场景的 `this` | DOM/scene/lan 几乎零覆盖（1078 测试均为纯函数） |
| 属性声明重复 | 同一属性在接口、类定义、Mixin 中多处声明 | `dom` 对象在接口 + 类各定义一次（~90 字段） |

### 1.3 已有的解耦基础

Phase 1（纯函数提取）已完成 16/19 Mixin，各 Mixin 已有 `pure.ts` 或独立导出函数。Mixin 主体已是薄包装层，委托调用独立函数。**这大幅降低了 Phase 2 的工作量**：不需要重新提取逻辑，只需把"薄包装层从 `this` 取参数"改为"Manager 构造函数注入参数"。

未完成纯函数提取的 3 个：RoundManagerMixin（DOM/计时器重）、WarehousePreviewMixin（DOM 重）、LanIndexMixin（DOM/网络重）。

---

## 二、19 Mixin 清单

> 方法数：含 Mixin 对象上的方法 + 已提取的独立函数
> this. 密度：`this.` 引用数 / 行数，衡量耦合强度
> 耦合等级：低（<0.15）/ 中（0.15-0.40）/ 高（>0.40）

| # | Mixin | 文件 | 方法数 | 行数 | this. | 密度 | 耦合 | 主要职责 | 依赖的其他 Mixin 方法 |
|---|-------|------|--------|------|-------|------|------|---------|---------------------|
| 1 | WarehouseCoreMixin | warehouse/core.ts | 15 | 373 | 13 | 0.03 | 低 | 仓库网格绘制/藏品生成放置/坐标管理 | revealOutline, renderQualityVisual, updateHud |
| 2 | WarehouseRevealMixin | warehouse/reveal.ts | 18 | 697 | 28 | 0.04 | 低 | 揭示机制（轮廓/品质/全揭示/动画） | pickRevealTargets, showRevealScrollHints, updateAiItemKnowledge |
| 3 | WarehousePreviewMixin | warehouse/preview.ts | 8 | 211 | 8 | 0.04 | 低 | 候选预览弹窗/触摸滚动 | hasAnyInfo, hidePreview |
| 4 | AiWalletMixin | ai/wallet.ts | 15 | 140 | 5 | 0.04 | 低 | AI 虚拟钱包/持久化/出价规范化 | （已用 context 模式，几乎无跨 Mixin 依赖） |
| 5 | AiIntelMixin | ai/intel/（5 子模块） | 35 | 1568 | 204 | 0.13 | 中 | AI 情报系统（初始化/快照/揭示/面板/动作） | pickRevealTargets, revealOutline, updateAiItemKnowledge, getAiWallet, writeLog, updateHud |
| 6 | AiMemoryMixin | ai/memory.ts | 28 | 701 | 130 | 0.19 | 中 | AI 跨局记忆/对话桶/存储 | ensureAiPrivateIntel, triggerAiReflection, updateReflectionStatusUI, writeLog |
| 7 | AiReflectionMixin | ai/reflection.ts | 27 | 647 | 98 | 0.15 | 中 | AI 局后反思/跨局记录 | createCrossGameRecord, pushRunSettlementContextToAi, proceedToNewRun, showReflectionPendingDialog |
| 8 | AiDecisionMixin | ai/decision.ts | 22 | 467 | 0 | 0.00 | 极低 | AI 决策面板快照 | （已纯函数化，零 this. 调用） |
| 9 | BiddingMixin | bidding/index.ts | 14 | 446 | 165 | 0.37 | 高 | 出价流程/键盘/回合结算/直接拿下 | startRound, stopRoundTimer, updateHud, buildRoundBids, getAiWallet, normalizeAiBidValue, canUseLlmDecisionForPlayer, revealRoundBidsSequential, finishAuction, markRoundRanking, writeLog |
| 10 | UiOverlayMixin | ui/overlay/（9 子模块） | 49 | 1109 | 168 | 0.15 | 中 | 弹窗/覆盖层/设置/AI 配置/AI 记忆面板 | updateHud, updateLobbyMoneyDisplay, renderAiLogicPanel, renderAiThoughtLog, writeLog |
| 11 | PanelsMixin | ui/panels.ts | 15 | 144 | 15 | 0.10 | 低 | 左右信息面板（私有情报/公共信息） | （已纯函数化，薄包装） |
| 12 | HistoryMixin | ui/history.ts | 39 | 294 | 0 | 0.00 | 极低 | 出价历史/道具使用记录 | （已纯函数化，零 this. 调用） |
| 13 | LobbyIndexMixin | lobby/index.ts + collection.ts | 27 | 886 | 134 | 0.15 | 中 | 大厅导航/页面切换/玩家初始化/场景清理 | initLanLobby, showLobbySubPage, startNewRun, cleanupGameScene, updateLobbyMoneyDisplay, openSettingsOverlay, openShopOverlay, renderCarousel |
| 14 | CarouselMixin | lobby/carousel.ts | 16 | 246 | 0 | 0.00 | 极低 | 地图轮播 | （已纯函数化，零 this. 调用） |
| 15 | CharacterSelectMixin | lobby/character-select.ts | 13 | 460 | 66 | 0.14 | 中 | 角色选择/Live2D/道具携带 | _saveCarryItems, _loadCarryItems, openCarryItemPicker, syncItemManagerFromShop, startSoloGame |
| 16 | LanIndexMixin | lan/（7 子模块） | 53 | 3046 | 546 | 0.18 | 中 | 联机系统（大厅/事件/同步/重连/结算/流程/Live2D） | resolveRoundBids, startRound, writeLog, updateHud, setPlayerBidReady, buildRoundBids, finishAuction, enterLobby |
| 17 | RoundManagerMixin | core/round-manager.ts | 7 | 164 | 81 | 0.49 | 高 | 回合生命周期/计时器/暂停 | clearCurrentRoundUsage, resetAiRoundResources, resetRoundBidDisplay, resetRoundBidReadyState, closeBidKeypad, syncPauseButton, startRoundTimer, updateHud, kickoffAiRoundDecisions, resolveRoundBids, writeLog, showLanPauseOverlay |
| 18 | SkillItemManagerMixin | core/skill-item-manager.ts | 8 | 212 | 6 | 0.03 | 低 | 技能/道具使用 | （已部分解耦，useAction helper 接 self 参数） |
| 19 | SettlementManagerMixin | core/settlement-manager.ts | 30 | 393 | 52 | 0.13 | 中 | 结算业务逻辑/分红门票/战绩保存 | stopRoundTimer, enterSettlementPage, getAiWallet, saveAiWalletsToStorage, revealAllArtifactsForSettlement, createCrossGameRecord, triggerAiReflection, saveBattleRecord, pushRunSettlementContextToAi, updateHud, writeLog |

**汇总**：19 Mixin，~390 方法，~11600 行，~1200 处 `this.` 跨 Mixin 调用。

---

## 三、耦合度分析

### 3.1 独立/耦合分布

| 耦合等级 | Mixin 数 | Mixin 列表 | 转换难度 |
|---------|---------|-----------|---------|
| **极低**（已纯函数化，0 this.） | 3 | AiDecisionMixin, HistoryMixin, CarouselMixin | 极易：Mixin 主体已是薄包装，直接包成 Manager 即可 |
| **低**（<15 this.，已有 context/helper 模式） | 5 | AiWalletMixin, SkillItemManagerMixin, WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin, PanelsMixin | 易：参数显式传入，依赖少 |
| **中**（15-200 this.，跨域调用） | 8 | AiIntelMixin, AiMemoryMixin, AiReflectionMixin, UiOverlayMixin, LobbyIndexMixin, CharacterSelectMixin, LanIndexMixin, SettlementManagerMixin | 中：需注入 3-6 个依赖 |
| **高**（>0.37 密度，流程编排层） | 2 | BiddingMixin, RoundManagerMixin | 难：是流程编排中心，依赖几乎所有其他模块 |

### 3.2 依赖方向分析

```
                    ┌─────────────┐
                    │ BiddingMixin │ ← 流程编排中心，依赖最多
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌───────────────┐ ┌───────────┐ ┌──────────────┐
   │RoundManagerMixin│ │AiWalletMixin│ │SettlementManager│
   └───────┬───────┘ └─────┬─────┘ └───────┬──────┘
           │               │               │
    ┌──────┴──────┐  ┌─────┴─────┐  ┌──────┴──────┐
    │             │  │AiIntelMixin│  │AiMemoryMixin │
    │             │  └─────┬─────┘  └──────┬──────┘
    │             │        │               │
    │             │  ┌─────┴─────┐  ┌──────┴──────┐
    │             │  │WarehouseReveal│  │AiReflectionMixin│
    │             │  └───────────┘  └─────────────┘
    │             │
┌───┴───┐    ┌───┴────────┐
│UiOverlay│   │LobbyIndexMixin│ ← 大厅编排，依赖 Lan+Character+Carousel
└───┬───┘    └───┬────────┘
    │            │
    ▼            ▼
┌──────────────────┐
│  LanIndexMixin   │ ← 子模块间互调为主，对外依赖少
└──────────────────┘
```

**关键发现**：

1. **BiddingMixin + RoundManagerMixin 是流程编排双核心**，互相调用且依赖几乎所有其他模块。这两个应**最后转换**，或转换时保留 Mixin 代理层最久。
2. **AiWalletMixin 已是标杆**：用 `AiWalletContext` 接口 + `walletCtx(scene)` 适配器，纯函数接收 context 参数。Mixin 薄包装只做 `getAiWallet(walletCtx(this), playerId)`。**这是所有 Mixin 的目标形态**。
3. **LanIndexMixin 虽 546 this.，但大部分是 7 个子模块间的互调**（lobby/events/sync/reconnect/settle/game-flow/live2d），对外依赖相对集中。可整体转为 `LanManager`，内部子模块转内部类。
4. **3 个零 this. Mixin**（AiDecision/History/Carousel）实际已是纯函数模块，Mixin 只是一层 `Object.assign` 壳，转换成本极低。

### 3.3 属性归属问题

当前 `WarehouseScene` 构造函数初始化 **~100 个实例属性**，分属不同 Mixin 的状态：

| 属性域 | 属性数 | 归属 Mixin | 示例 |
|--------|--------|-----------|------|
| 仓库状态 | ~12 | WarehouseCore/Reveal/Preview | items, revealedCells, warehouseCellIndex, warehouseTrueValue |
| AI 状态 | ~25 | AiWallet/Intel/Memory/Reflection/Decision | aiWallets, aiPrivateIntel, aiCrossGameMemory, aiReflectionState |
| 回合状态 | ~8 | RoundManager/Bidding | round, actionsLeft, roundTimeLeft, playerBidSubmitted |
| 联机状态 | ~15 | LanIndex | isLanMode, lanBridge, lanIsHost, lanPlayers |
| 结算状态 | ~8 | SettlementManager | settlementSession, settlementRunToken, isSettlementRevealMode |
| UI/DOM | ~50+ | UiOverlay/Panels/History/Lobby | dom（90 字段）, keypadValue, privateIntelEntries |
| 玩家 | ~5 | Lobby/Bidding | players, playerMoney, playerRoundHistory |

**问题**：所有属性挂在 `this` 上，任何 Mixin 可读写任何属性，无封装边界。

---

## 四、WarehouseSceneThis 接口分析

### 4.1 规模

`types/warehouse-scene-this.d.ts`：**1022 行**，单一 `WarehouseSceneThis` 接口声明：

- ~100 个属性（含 `dom` 对象的 ~90 个子字段）
- ~300+ 个方法签名（按 Mixin 分组注释，但全在一个 interface 内）

### 4.2 可分拆性

接口已按 Mixin 分组注释（`// 核心属性`、`// AI 属性`、`// 联机属性` 等），但物理上是一个 interface。可按域拆分为：

| 子接口 | 行数估算 | 内容 |
|--------|---------|------|
| `WarehouseSceneCore` | ~80 | Phaser Scene 属性 + 仓库核心属性 + 方法 |
| `WarehouseSceneAi` | ~200 | AI 钱包/情报/记忆/反思/决策属性 + 方法 |
| `WarehouseSceneBidding` | ~60 | 出价/回合属性 + 方法 |
| `WarehouseSceneUi` | ~150 | UI/DOM 属性 + 弹窗/面板方法 |
| `WarehouseSceneLobby` | ~100 | 大厅/角色选择属性 + 方法 |
| `WarehouseSceneLan` | ~120 | 联机属性 + 方法 |
| `WarehouseSceneSettlement` | ~80 | 结算属性 + 方法 |
| `WarehouseSceneBridge` | ~100 | LLM/战绩/结算 bridge 方法 |

最终 `WarehouseSceneThis` 可变为交叉类型：`WarehouseSceneCore & WarehouseSceneAi & ...`，或直接被各 Manager 的接口替代。

### 4.3 拆分时机

**不宜在 Phase 2 早期拆分**。接口是 `ThisType` 的类型基础，拆分需与 Manager 转换同步。建议在 Manager 转换过程中逐步收缩：每转一个 Mixin，其方法从 `WarehouseSceneThis` 移到 Manager 的接口，接口逐行缩减。

---

## 五、迁移方案

### 5.1 方案对比

| 方案 | 原理 | 优点 | 缺点 | 适配度 |
|------|------|------|------|--------|
| **A 依赖注入** | Mixin -> Manager 类，构造函数注入依赖 | 依赖显式、可独立单测、类型自然 | 重构量大、需设计 DI | ★★★★★ |
| **B 事件驱动** | Mixin 间通过 EventBus 通信 | 完全解耦、易扩展 | 事件流难追踪、性能风险、过度设计 | ★★☆☆☆ |
| **C 保守改类型** | 保持 Mixin，改进类型 + 文档化依赖 | 改动最小、零运行时风险 | 隐式依赖仍在、不可独立测试 | ★★★☆☆ |

### 5.2 推荐方案：A 依赖注入（渐进式，过渡期 C 兼容）

**理由**：

1. **Phase 1 已铺路**：16/19 Mixin 已提取纯函数 + context 参数模式（如 `AiWalletContext`），向 Manager 类过渡是自然延伸，非推翻重来。
2. **已有 DI 容器**：`core/deps.ts` 的 `Deps` 容器已在运行，只需扩展注册 Manager 实例。
3. **B 不适合**：项目是单场景回合制游戏，非事件流密集型。Mixin 间是同步直接调用（`this.updateHud()`），改事件驱动会引入不必要的异步复杂度 + 调试困难。
4. **C 不够**：task-list 已完成文件级清理，`WarehouseSceneThis` 1022 行的根问题无法靠改类型解决，必须拆架构。

**但采用 A 的渐进式变体**：过渡期 Mixin + Manager 共存（C 式兼容层），不一步到位。

### 5.3 目标架构

```typescript
// 目标：WarehouseScene 通过组合持有 Manager 实例，不再 Object.assign Mixin
class WarehouseScene extends _PhaserScene {
  // Manager 实例（组合替代 Mixin）
  private walletManager: AiWalletManager
  private intelManager: AiIntelManager
  private roundManager: RoundManager
  private bidManager: BidManager
  private revealManager: WarehouseRevealManager
  private settlementManager: SettlementManager
  private uiManager: UIManager
  private lobbyManager: LobbyManager
  private lanManager: LanManager
  // ... 其他 Manager

  constructor() {
    super("warehouse")
    // 基础状态初始化
    this.items = []
    this.players = [...]

    // Manager 实例化（依赖注入）
    this.walletManager = new AiWalletManager(this.players, this.aiWallets)
    this.revealManager = new WarehouseRevealManager(this)
    this.intelManager = new AiIntelManager(this, this.walletManager)
    this.roundManager = new RoundManager(this, this.intelManager)
    this.bidManager = new BidManager(this, this.roundManager, this.walletManager, this.intelManager)
    this.settlementManager = new SettlementManager(this, this.walletManager)
    // ...
  }
}
```

### 5.4 Manager 类的形态（以 AiWalletMixin 为标杆）

```typescript
// 当前（Mixin + this 隐式依赖）
export const AiWalletMixin: ThisType<WarehouseSceneThis> = {
  getAiWallet(playerId: string) {
    return getAiWallet(walletCtx(this), playerId)  // walletCtx 从 this 取 6 个属性
  }
}

// 目标（Manager + 显式依赖）
export class AiWalletManager {
  constructor(
    private players: Player[],
    private aiWallets: Record<string, number>,
    private ctx: () => AiWalletContext  // 或直接存依赖属性
  ) {}

  getAiWallet(playerId: string): number {
    return getAiWallet(this.ctx(), playerId)  // 纯函数已存在，无需改
  }
}
```

---

## 六、渐进式迁移路径

### 6.1 总体策略

**核心原则**：每个 Mixin 转换为 Manager 类后，**保留原 Mixin 作为薄代理层**（过渡期共存），使其他未转换的 Mixin 仍可通过 `this.xxx()` 调用。全部转换完成后，再一次性移除 Mixin 层 + 收缩 `WarehouseSceneThis`。

```
阶段 0（已完成）: 纯函数提取 ──→ 阶段 1: 独立 Mixin 转 Manager ──→ 阶段 2: 中耦合 Mixin 转 Manager
                                                                    │
                              阶段 3: 高耦合流程编排 Mixin 转 Manager ←┘
                                                                    │
                              阶段 4: 清理 Mixin 代理层 + 收缩接口 ←─┘
```

### 6.2 阶段 1：极低耦合 Mixin 转 Manager（低风险，验证模式）

**目标**：把 3 个已纯函数化的 Mixin + 2 个低耦合 Mixin 转为 Manager，验证 DI 模式可行。

| 顺序 | Mixin | 转换方式 | 依赖注入 | 兼容策略 | 复杂度 |
|------|-------|---------|---------|---------|--------|
| 1.1 | AiWalletMixin | Manager 类持有 players + aiWallets + ctx | 无外部 Manager 依赖 | Mixin 方法改为 `this.walletManager.xxx()` 代理 | 极低 |
| 1.2 | HistoryMixin | HistoryManager 持有 playerRoundHistory 等状态 | 无 | 同上 | 极低 |
| 1.3 | CarouselMixin | CarouselManager 持有 carouselOffset | 无 | 同上 | 极低 |
| 1.4 | AiDecisionMixin | AiDecisionManager 持有 telemetry 状态 | 无 | 同上 | 极低 |
| 1.5 | SkillItemManagerMixin | SkillItemManager 持有 skillManager + itemManager | 注入 round/actionsLeft（只读） | 同上 | 低 |

**兼容策略**：在 `WarehouseScene` 构造函数中创建 Manager 实例，原 Mixin 保留但方法体改为代理：

```typescript
// 过渡期 Mixin 代理层
export const AiWalletMixin = {
  getAiWallet(this: WarehouseSceneThis, playerId: string) {
    return this.walletManager.getAiWallet(playerId)  // 代理到 Manager
  }
}
```

**验证点**：`npx tsc --noEmit` 0 错误 + 游戏运行正常（钱包/历史/轮播/技能道具功能）。

### 6.3 阶段 2：中耦合 Mixin 转 Manager（中风险，AI 系列优先）

**目标**：转换 AI 系统和 UI 系列的中耦合 Mixin。AI 系列内部耦合紧密但对外相对独立。

| 顺序 | Mixin | 转换方式 | 依赖注入 | 兼容策略 | 复杂度 |
|------|-------|---------|---------|---------|--------|
| 2.1 | PanelsMixin | UIManager 子模块 | 注入 dom + entries 状态 | Mixin 代理 | 低 |
| 2.2 | WarehouseCoreMixin | WarehouseManager | 注入 Phaser add/time/tweens | Mixin 代理 | 中 |
| 2.3 | WarehouseRevealMixin | WarehouseRevealManager（合并到 WarehouseManager） | 注入 items + cellIndex + AiIntelManager | Mixin 代理 | 中 |
| 2.4 | WarehousePreviewMixin | WarehousePreviewManager（合并到 WarehouseManager） | 注入 dom | Mixin 代理 | 低 |
| 2.5 | AiIntelMixin | AiIntelManager（5 子模块转内部方法） | 注入 walletManager + warehouseManager | Mixin 代理 | 高 |
| 2.6 | AiMemoryMixin | AiMemoryManager | 注入 intelManager | Mixin 代理 | 中 |
| 2.7 | AiReflectionMixin | AiReflectionManager | 注入 memoryManager + settlementManager | Mixin 代理 | 中 |
| 2.8 | SettlementManagerMixin | SettlementManager | 注入 walletManager + memoryManager + reflectionManager + bridges | Mixin 代理 | 中 |
| 2.9 | UiOverlayMixin | UIManager（9 子模块转内部方法） | 注入 dom + scene 引用 | Mixin 代理 | 中 |

**关键策略**：AI 系列按依赖顺序转换（Wallet → Intel → Memory → Reflection → Settlement），每转一个，后续的依赖注入从 Mixin 代理改为直接注入 Manager。

### 6.4 阶段 3：高耦合流程编排 Mixin 转 Manager（高风险）

**目标**：转换流程编排双核心。此时大部分被依赖的模块已是 Manager，可注入。

| 顺序 | Mixin | 转换方式 | 依赖注入 | 兼容策略 | 复杂度 |
|------|-------|---------|---------|---------|--------|
| 3.1 | RoundManagerMixin | RoundManager 类 | 注入 bidManager + intelManager + uiManager + lanManager | Mixin 代理 | 高 |
| 3.2 | LobbyIndexMixin | LobbyManager | 注入 lanManager + warehouseManager + uiManager | Mixin 代理 | 中 |
| 3.3 | CharacterSelectMixin | CharacterSelectManager（合并到 LobbyManager） | 注入 shop + itemManager | Mixin 代理 | 中 |
| 3.4 | LanIndexMixin | LanManager（7 子模块转内部类/方法） | 注入 roundManager + bidManager + settlementManager | Mixin 代理 | 高 |
| 3.5 | BiddingMixin | BidManager | 注入 roundManager + walletManager + intelManager + uiManager + settlementManager | Mixin 代理 | 高 |

**BidManager 最后转**：它是流程编排中心，依赖最多。等所有被依赖模块都是 Manager 后，BidManager 可一次性注入所有依赖，消除所有 `this.` 隐式调用。

### 6.5 阶段 4：清理 Mixin 代理层 + 收缩接口

**目标**：所有 Mixin 已转为 Manager，移除 Mixin 代理层 + `Object.assign` + `WarehouseSceneThis` 接口。

| 步骤 | 内容 | 风险 |
|------|------|------|
| 4.1 | 移除 `main.ts` 的 `Object.assign(WarehouseScene.prototype, ...)` | 中（需确认所有调用已改为 `this.xxxManager.`） |
| 4.2 | 移除 `warehouse-scene.ts` 的 `!` 声明属性（80+ 行） | 低 |
| 4.3 | 拆分 `WarehouseSceneThis` 为域子接口或直接删除（被 Manager 接口替代） | 中 |
| 4.4 | 移除 `WarehouseMixinMethods` interface | 低 |
| 4.5 | 清理 `this: WarehouseSceneThis` 类型标注（全部改为 Manager 类型） | 中 |

---

## 七、风险与缓解

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| **运行时行为变化** | 高 | Manager 的 `this` 上下文与 Mixin 不同，异步回调/事件处理器中的 `this` 绑定可能断裂 | Manager 方法内不依赖 `this` 绑定（用闭包变量）；过渡期 Mixin 代理层保证 `this` 一致；每阶段手动验证游戏核心流程 |
| **类型断裂** | 中 | `WarehouseSceneThis` 1022 行接口在过渡期需同时存在 Manager 类型 + Mixin 类型 | 过渡期保留 `WarehouseSceneThis` 不动，Manager 用独立接口；阶段 4 统一清理 |
| **测试覆盖不足** | 高 | DOM/scene/lan 几乎零测试（1078 测试均为纯函数），转换无法靠测试兜底 | 每阶段转换后手动验证：大厅导航 → 单机开局 → 出价 → 揭示 → 结算 → 重开；优先给转换的 Manager 补单测（依赖注入后可 mock） |
| **并行流冲突** | 中 | 项目常有多条重构流并行，`WarehouseSceneThis` 和 `main.ts` 是共享文件 | 过渡期不改 `main.ts` 的 `Object.assign`（只在阶段 4 一次性改）；`WarehouseSceneThis` 只增不减直到阶段 4 |
| **LanIndexMixin 复杂度** | 高 | 7 子模块 + 546 this.，是最大的单一转换 | 阶段 3.4 单独处理，可进一步拆为 LanLobby/LanEvents/LanSync/LanReconnect 等子 Manager |
| **Phaser 生命周期** | 中 | Manager 需访问 Phaser 的 add/time/tweens/input，这些在 `create()` 后才可用 | Manager 构造函数接收 scene 引用（`this`），延迟到 `create()` 中实例化或用 `init()` 方法 |
| **回退能力** | 中 | 若某阶段转换出问题，需能回退 | Mixin 代理层保证可回退：移除 Manager 实例 + 恢复 Mixin 方法体即可 |

---

## 八、工作量估算

### 8.1 子任务分解

| 阶段 | 子任务数 | 可并行 | 复杂度 | 估算 |
|------|---------|--------|--------|------|
| 阶段 1（极低耦合） | 5 | 是（文件域不冲突） | 极低-低 | 0.5-1 天 |
| 阶段 2（中耦合，AI+UI） | 9 | 部分（AI 系列有依赖顺序） | 中-高 | 3-5 天 |
| 阶段 3（高耦合流程） | 5 | 否（BidManager 依赖前面全部） | 高 | 3-5 天 |
| 阶段 4（清理） | 5 | 部分 | 中 | 1-2 天 |
| **合计** | **24** | - | - | **8-13 天** |

### 8.2 与 task-list 对比

task-list（治标）解决了 32 项文件职责问题，涉及 ~30 个文件的拆分/清理，耗时约多周（S1-S46）。

本计划（治本）的工作量**约为 task-list 的 2-3 倍**，因为：

1. 每个 Mixin 转换需理解其全部 `this.` 依赖并设计注入接口（task-list 只拆文件位置不改架构）
2. 过渡期需维护 Mixin + Manager 双层（额外维护成本）
3. 无测试兜底，需大量手动验证
4. `WarehouseSceneThis` 1022 行接口的收缩是全局影响

### 8.3 可并行性

| 可并行的子任务 | 条件 |
|--------------|------|
| 阶段 1 的 5 个极低耦合 Mixin | 文件域不冲突，可 2-3 个并行 |
| 阶段 2 的 UI 系列（Panels/Overlay）与 AI 系列（Wallet/Intel/Memory） | 域不冲突，可并行 |
| 阶段 2 的 Warehouse 系列与 AI 系列 | 域不冲突，可并行 |
| 阶段 3 的 LanIndex 与 Lobby/Character | 域不冲突，可并行 |

**不可并行**：阶段 3 的 RoundManager 和 BidManager（依赖链末端）；阶段 4 的清理（全局影响）。

### 8.4 是否建议分多个会话

**强烈建议分多个会话**。理由：

1. **总量 8-13 天工作量**，单会话无法完成
2. **每阶段需手动验证**，验证间隙适合分会话
3. **阶段间有依赖**，前一阶段验证通过后才能开始下一阶段
4. **并行流风险**，分会话可避免与其他重构流冲突

建议会话划分：

| 会话 | 内容 | 预估 |
|------|------|------|
| 会话 1 | 阶段 1 全部（5 个极低耦合 Mixin） + 验证 | 1 天 |
| 会话 2 | 阶段 2 AI 系列（Wallet→Intel→Memory→Reflection→Settlement） + 验证 | 2-3 天 |
| 会话 3 | 阶段 2 UI + Warehouse 系列 + 验证 | 2-3 天 |
| 会话 4 | 阶段 3 高耦合（Round/Lobby/Character/Lan） + 验证 | 2-3 天 |
| 会话 5 | 阶段 3 BidManager + 阶段 4 清理 + 全量验证 | 2-3 天 |

---

## 九、与 Vue 的协同

### 9.1 Vue 可替代的 Mixin

若引入 Vue（`docs/plans/vue-integration.md` 方案 A：Vue 3 + Vite + Pinia），以下 UI 重 Mixin 可被 Vue 组件替代，**降低 Phase 2 转换工作量**：

| Mixin | Vue 替代 | 转换工作量降低 | 理由 |
|-------|---------|--------------|------|
| UiOverlayMixin（9 子模块） | Settings.vue / ShopOverlay.vue / AiModelConfig.vue / AiMemoryPanel.vue 等 | 高（1109 行 + 168 this. 免转 Manager） | 纯 UI 弹窗，Vue 响应式 + 组件化更合适 |
| PanelsMixin | PrivateIntelPanel.vue / PublicInfoPanel.vue | 中（144 行免转） | 面板渲染适合 Vue 模板 |
| HistoryMixin | PlayerHistory.vue | 中（294 行免转） | 历史列表适合 Vue v-for |
| LobbyIndexMixin | Lobby.vue / SoloLobby.vue / LanLobby.vue | 高（886 行 + 134 this. 免转） | 大厅导航/页面切换适合 Vue 路由 |
| CarouselMixin | MapSelect.vue | 低（246 行，已纯函数化） | 轮播适合 Vue 组件 |
| CharacterSelectMixin | CharacterSelect.vue / CarryItems.vue | 中（460 行免转） | 角色选择 UI 适合 Vue |

**不可被 Vue 替代的 Mixin**（业务逻辑层，必须转 Manager）：

| Mixin | 理由 |
|-------|------|
| WarehouseCore/Reveal/Preview | Phaser Canvas 渲染，非 DOM |
| AiWallet/Intel/Memory/Reflection/Decision | AI 业务逻辑，非 UI |
| Bidding/RoundManager/SettlementManager | 游戏流程逻辑，非 UI |
| LanIndexMixin（部分） | 网络逻辑非 UI，但联机大厅 UI 可被 Vue 替代 |

### 9.2 协同策略

**推荐顺序**：先 Phase 2（Mixin -> Manager）再 Vue 引入。

| 策略 | 优点 | 缺点 |
|------|------|------|
| **先 Phase 2 后 Vue** | Manager 管业务逻辑，Vue 管 UI 状态，职责清晰；Manager 可独立单测 | Phase 2 工作量大（需转 UI Mixin） |
| **先 Vue 后 Phase 2** | Vue 替代 UI Mixin 后，Phase 2 只需转业务逻辑 Mixin（~10 个） | Vue 引入需先理解现有 UI Mixin 的 `this.` 依赖，难度不降 |
| **并行** | UI Mixin 转 Vue + 业务 Mixin 转 Manager 同步进行 | 协调复杂，UI 与业务边界未定时易冲突 |

**推荐**：先 Phase 2 阶段 1-2（转业务逻辑 Manager），再评估 Vue 引入替代 UI Mixin。若决定引入 Vue，则 Phase 2 阶段 3 的 UI Mixin（UiOverlay/Panels/History/Lobby/CharacterSelect/Carousel）跳过 Manager 转换，直接转 Vue 组件。

### 9.3 量化影响

| 场景 | 需转 Manager 的 Mixin 数 | 需转 Vue 的 Mixin 数 | 总工作量 |
|------|------------------------|---------------------|---------|
| 不引入 Vue | 19 | 0 | 8-13 天 |
| 引入 Vue（先 Manager 后 Vue） | 13（业务逻辑） | 6（UI） | 6-9 天 Manager + 5-7 天 Vue = 11-16 天 |
| 引入 Vue（Vue 优先，业务 Manager） | 13 | 6 | 5-7 天 Vue + 6-9 天 Manager = 11-16 天 |

引入 Vue 不减少总工作量，但**提升 UI 可维护性**（响应式、组件化、可测试）。建议作为 Phase 2 之后的独立阶段。

---

## 十、验收标准

### 10.1 各阶段验收

| 阶段 | 验收项 |
|------|--------|
| 阶段 1 | 5 个 Manager 类创建 + Mixin 代理层工作 + `npx tsc --noEmit` 0 错误 + 钱包/历史/轮播/技能道具功能正常 |
| 阶段 2 | 9 个 Manager 类创建 + AI 系统/UI/Warehouse 功能正常 + 已转 Mixin 的 `this.` 调用归零 |
| 阶段 3 | 5 个 Manager 类创建 + 全流程（开局→出价→揭示→结算→联机）正常 + `main.ts` 的 `Object.assign` 可移除 |
| 阶段 4 | `Object.assign` 移除 + `WarehouseSceneThis` < 200 行（或拆分/删除）+ `WarehouseMixinMethods` 删除 + 全量功能正常 |

### 10.2 最终验收

- [ ] `WarehouseScene` 不再使用 `Object.assign` 合并 Mixin
- [ ] 所有模块通过构造函数注入获取依赖
- [ ] 可单独测试每个 Manager（mock 注入的依赖）
- [ ] `WarehouseSceneThis` 接口 < 200 行或已拆分/删除
- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npm run lint` 0 error
- [ ] 全量游戏功能正常（单机 + 联机）

---

## 十一、首批建议转换的 Mixin（3-5 个）

基于"高独立 + 高价值 + 低风险"原则，建议首批转换：

| 优先级 | Mixin | 理由 |
|--------|-------|------|
| 1 | **AiWalletMixin** | 已是 context 模式标杆，5 this.，转换最简单，验证 DI 模式可行 |
| 2 | **HistoryMixin** | 0 this.，已纯函数化，转 Manager 零风险 |
| 3 | **AiDecisionMixin** | 0 this.，已纯函数化，转 Manager 零风险 |
| 4 | **SkillItemManagerMixin** | 6 this.，已有 useAction helper 模式，转换可复用现有 helper |
| 5 | **PanelsMixin** | 15 this.，小文件（144 行），UI 面板逻辑清晰 |

这 5 个 Mixin 转换后可验证：
- Manager 类的构造函数注入模式是否可行
- Mixin 代理层的兼容性是否可靠
- `WarehouseSceneThis` 接口的渐进收缩是否顺畅
- 手动验证流程是否充分

---

## 十二、总结

| 维度 | 结论 |
|------|------|
| **推荐方案** | A 依赖注入（渐进式，过渡期 C 式 Mixin 代理兼容） |
| **工作量等级** | 相当于 task-list 的 2-3 倍（8-13 天，24 个子任务） |
| **是否分多会话** | 是，建议 5 个会话 |
| **首批转换** | AiWallet / History / AiDecision / SkillItemManager / Panels（5 个） |
| **最后转换** | BiddingMixin（流程编排中心，依赖最多） |
| **Vue 协同** | 先 Phase 2 转业务逻辑 Manager，再评估 Vue 替代 UI Mixin |
| **最大风险** | 测试覆盖不足（DOM/scene 零测试），靠手动验证兜底 |
| **最大收益** | 可独立单测每个 Manager + `WarehouseSceneThis` 从 1022 行缩减到 < 200 |
