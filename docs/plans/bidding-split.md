# ai/bidding.ts 拆分方案

> 创建时间：2026-07-12
> 状态：计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/game/ai/bidding.ts`（1213 行，`AuctionAiEngine` 类，含出价算法 + 情报动作规划 + 工具效果评估三大职责）按"薄入口类 + 子目录 + re-export 纯函数"结构拆分，参照已落地的 `ai/intel.ts` + `ai/intel/` 模式。
> task-list #2：职责过载：出价算法 + 情报动作规划(planIntelAction) + 工具效果评估(buildToolEffect)

---

## 一、现状分析

### 1.1 文件形态

`bidding.ts` 是一个**类**（`export class AuctionAiEngine`），不是 Mixin 对象字面量，也不是函数集合。这是与已拆分的 `intel.ts`（Mixin 对象）/ `overlay.ts`（对象字面量）最大的区别。类通过 `new AuctionAiEngine()` 实例化，持有可变实例状态（`aiState`、`runMeta`、`lastDecisionLog`）。

文件结构：

| 部分 | 行号 | 内容 |
|------|------|------|
| 文件头注释 | L1-L39 | 模块描述、出价算法流程说明、使用方式 |
| import | L41 | `clamp, roundToStep, randomBetween` from `core/utils` |
| 接口定义 | L43-L215 | 13 个 interface（Personality, ToolEffect, DecisionResult 等） |
| `AuctionAiEngine` 类 | L217-L1166 | 4 属性 + 10 方法 |
| 模块级纯函数 | L1168-L1213 | `defaultPersona`, `normalizeToolEffect`, `marketReference` |

### 1.2 对外接口（拆分后必须保持不变）

| 消费方 | 导入路径 | 使用方式 |
|--------|----------|----------|
| `scene/warehouse-scene.ts` L47 | `from "../ai/bidding"` | `import { AuctionAiEngine }`，L286 `new AuctionAiEngine()`，L165 类型声明 `aiEngine: AuctionAiEngine` |
| `types/warehouse-scene-this.d.ts` L267 | - | `aiEngine: AuctionAiEngine \| null`（类型引用） |
| `types/ai.d.ts` L337 | - | `export interface AuctionAiEngine`（结构化类型声明） |
| `scene/scene-run.ts` L80 | - | `this.aiEngine.resetForNewRun(...)` |
| `scene/scene-ai-panel.ts` L29,38 | - | `this.aiEngine.getLastDecisionLog()` |
| `bidding/index.ts` L307 | - | `this.aiEngine.buildAIBids(...)` |
| `lan/game-flow.ts` L108,320 | - | `this.aiEngine.buildAIBids(...)`, `resetForNewRun(...)` |
| `ai/context-builder.ts` L271 | - | `aiEngine.personalityMap[player.id]`（直接属性访问） |
| `ai/decision.ts` L433-434 | - | `self.aiEngine.getLastDecisionLog()` |
| `ai/intel/action.ts` L189,208 | - | `this.aiEngine.planIntelAction(...)`, `this.aiEngine.buildToolEffect(...)` |
| `tests/game/ai/bidding.test.ts` L2 | `from "../../../scripts/game/ai/bidding"` | `import { AuctionAiEngine }`，测试 `resetForNewRun`/`buildToolEffect`/`applyCrowdDiversity` |

**关键发现：`ai/index.ts` 不 re-export bidding。** bidding 独立于 ai/index.ts 的 Mixin 聚合体系，由 `scene/warehouse-scene.ts` 直接导入并实例化。

外部调用的公共 API：
- `new AuctionAiEngine()` -- 构造
- `engine.resetForNewRun(context)` -- 重置
- `engine.buildAIBids(context)` -> `Record<string, number>` -- 出价
- `engine.planIntelAction(args)` -> 结果对象 -- 情报动作
- `engine.buildToolEffect(args)` -> `ToolEffect` -- 工具效果
- `engine.applyCrowdDiversity(args)` -> void -- 多样性调整
- `engine.getLastDecisionLog()` -> log | null -- 日志
- `engine.personalityMap` -- 属性直接访问（context-builder.ts）

### 1.3 模块解析

采用与 `ai/intel.ts` + `ai/intel/` 一致的**方案 A**：保留 `bidding.ts` 作为类入口，新建 `ai/bidding/` 兄弟目录存放子模块。

- `bidding.ts` 与 `bidding/` 目录共存（同 `intel.ts` + `intel/` 模式）。
- 导入路径 `"../ai/bidding"` 仍解析到 `bidding.ts` 文件（文件优先于目录 index）。
- 所有消费方（warehouse-scene、tests 等）**零改动**。

---

## 二、完整方法清单与归类

### 2.1 类属性

| # | 属性 | 行号 | 类型 | 职责 |
|---|------|------|------|------|
| 1 | `personalityMap` | L218 | `Record<string, Personality>` | 三种 AI 人格参数（p1/p3/p4），被 4 个方法读取 |
| 2 | `aiState` | L219 | `Map<string, AiStateEntry>` | 每个 AI 的锚点/心理预期/上次出价，被 ensureState/buildAIBids 读写 |
| 3 | `runMeta` | L220 | `{ startingBid, itemCount }` | 本局元数据，被 resetForNewRun/ensureState/buildAIBids 读取 |
| 4 | `lastDecisionLog` | L221 | `Record \| null` | 最近决策日志，被 buildAIBids 写入、getLastDecisionLog 读取 |

### 2.2 类方法

| # | 方法 | 行号 | 职责分类 | this 状态依赖 | 纯/DOM/网络 | 行数 | 拆分去向 |
|---|------|------|----------|--------------|-------------|------|----------|
| 1 | `constructor` | L223-L286 | 初始化 | personalityMap, aiState, runMeta, lastDecisionLog | 纯赋值 | ~64 | bidding.ts 保留 |
| 2 | `resetForNewRun` | L289-L296 | 初始化 | aiState, runMeta, lastDecisionLog | 纯赋值 | ~8 | bidding.ts 保留 |
| 3 | `buildAIBids` | L312-L411 | 出价算法 | personalityMap, runMeta, lastDecisionLog + 调用 buildToolEffect/computeSingleDecision/applyCrowdDiversity | 纯 | ~100 | bidding.ts 保留（委托 pure） |
| 4 | `computeSingleDecision` | L420-L786 | 出价算法 | ensureState() + computeConfidenceParts() | 纯 | ~367 | bidding.ts 保留（委托 pure 子计算） |
| 5 | `computeConfidenceParts` | L789-L848 | 出价算法 | **无**（所有输入经 args 传入） | 纯 | ~60 | **提取到 pure.ts** |
| 6 | `planIntelAction` | L860-L987 | 情报动作规划 | **仅 personalityMap（只读）** | 纯 | ~128 | **提取到 intel-action.ts** |
| 7 | `buildToolEffect` | L999-L1071 | 工具效果评估 | **无**（零 this 访问） | 纯 | ~73 | **提取到 pure.ts** |
| 8 | `applyCrowdDiversity` | L1073-L1139 | 出价算法 | **仅 personalityMap（只读）** | 纯 | ~67 | **提取到 pure.ts**（参数化） |
| 9 | `ensureState` | L1142-L1161 | 状态管理 | aiState, runMeta | 纯（读写 Map） | ~20 | bidding.ts 保留 |
| 10 | `getLastDecisionLog` | L1163-L1165 | getter | lastDecisionLog | 纯 | ~3 | bidding.ts 保留 |

### 2.3 模块级纯函数（已独立，无 this）

| # | 函数 | 行号 | 职责 | 行数 | 拆分去向 |
|---|------|------|------|------|----------|
| 1 | `defaultPersona` | L1168-L1186 | 返回默认人格 | ~19 | **迁移到 pure.ts** |
| 2 | `normalizeToolEffect` | L1188-L1199 | 规范化工具效果数值范围 | ~12 | **迁移到 pure.ts** |
| 3 | `marketReference` | L1201-L1213 | 计算市场参考价 | ~13 | **迁移到 pure.ts** |

### 2.4 三大职责行数统计

| 职责 | 方法 | 合计行数 | 占比 |
|------|------|----------|------|
| 出价算法 | constructor + resetForNewRun + buildAIBids + computeSingleDecision + computeConfidenceParts + applyCrowdDiversity + ensureState + getLastDecisionLog | ~689 行 | 57% |
| 情报动作规划 | planIntelAction | ~128 行 | 11% |
| 工具效果评估 | buildToolEffect | ~73 行 | 6% |
| 接口/类型定义 | 13 个 interface | ~173 行 | 14% |
| 模块级纯函数 | defaultPersona + normalizeToolEffect + marketReference | ~44 行 | 4% |
| 注释/import | 文件头 + import | ~106 行 | 9% |
| **合计** | | **~1213 行** | 100% |

---

## 三、耦合度分析

### 3.1 planIntelAction 与出价算法的耦合

`planIntelAction`（L860-L987）对类实例的依赖：
- `this.personalityMap[playerId]` -- **只读**访问人格参数（L863）
- **不访问** `this.aiState`、`this.runMeta`、`this.lastDecisionLog`
- 调用模块级 `defaultPersona()`、`clamp()`、`randomBetween()`

结论：**可干净分离**。将 `personalityMap` 作为参数传入即可变为纯函数。

### 3.2 buildToolEffect 与出价算法的耦合

`buildToolEffect`（L999-L1071）对类实例的依赖：
- **零 this 访问**。整个方法体不引用任何 `this.xxx`
- 调用模块级 `normalizeToolEffect()`、`clamp()`

结论：**已本质是纯函数**，只是语法上是方法。可直接提取为独立函数，类方法变薄委托。

### 3.3 computeConfidenceParts 与出价算法的耦合

`computeConfidenceParts`（L789-L848）对类实例的依赖：
- **零 this 访问**。所有输入经 `args` 参数传入
- 调用 `randomBetween()`、`clamp()`

结论：**已本质是纯函数**。可直接提取。

### 3.4 applyCrowdDiversity 与出价算法的耦合

`applyCrowdDiversity`（L1073-L1139）对类实例的依赖：
- `this.personalityMap[prev.id]`、`this.personalityMap[curr.id]` -- **只读**（L1093-L1094）
- 调用 `defaultPersona()`、`roundToStep()`
- 修改传入的 `bidMap`、`decisionMap`（副作用，但通过参数）

结论：**可参数化分离**。将 `personalityMap` 作为参数传入即可变为纯函数。

### 3.5 computeSingleDecision 与出价算法核心耦合

`computeSingleDecision`（L420-L786，367 行）是核心出价算法，对类实例的依赖：
- `this.ensureState(playerId, persona, bidStep)` -- 获取/初始化 AI 状态（L458）
- `this.computeConfidenceParts(...)` -- 信心计算（L476，可委托 pure）
- `normalizeToolEffect()`、`clamp()`、`roundToStep()`、`randomBetween()` -- 纯工具
- 修改 `state.psychExpectedBid`、`state.anchorBid`、`state.lastBid`（L748-L756）-- **状态写回**

结论：因 `ensureState` 状态初始化和 `state.xxx` 写回，**不能完全提取为纯函数**。但可：
- 委托 `computeConfidenceParts` 到 pure
- 委托 `normalizeToolEffect` 到 pure
- 保持编排逻辑在类方法中（确保状态读写安全）

---

## 四、拆分方案

### 4.1 推荐策略：方案 A（提取纯函数 + 类方法变薄委托）

**选择理由：**

1. **`AuctionAiEngine` 是真正的类**（有可变实例状态 aiState/runMeta/lastDecisionLog），不能 Mixin 化（排除方案 C）。
2. **三大职责耦合度极低**：planIntelAction 仅读 personalityMap，buildToolEffect 零 this 耦合，两者本质是纯函数。但出价算法核心（computeSingleDecision）依赖状态读写，不适合拆成独立类（排除方案 B 的独立类方案，过度工程化）。
3. **最低风险**：类、构造函数、所有方法签名保持不变，消费方零改动，测试零改动。
4. **与项目模式一致**：AGENTS.md "薄入口 + 子目录 + re-export 纯函数" 模式，class 即"薄入口"。
5. **直接服务测试目标**：buildToolEffect、computeConfidenceParts、planIntelAction、applyCrowdDiversity 提取为纯函数后可独立加测。

### 4.2 子模块结构

```
scripts/game/ai/
  bidding.ts          # 薄入口类（~550-600 行，从 1213 行降低）
  bidding/            # 新建子目录
    types.ts          # 接口定义（~180 行）
    pure.ts           # 纯函数（~250 行）
    intel-action.ts   # 情报动作规划纯函数（~150 行）
```

### 4.3 各子模块内容

#### `ai/bidding/types.ts`（~180 行）

从 bidding.ts L43-L215 迁移全部 13 个 interface：

| 接口 | 原行号 |
|------|--------|
| `Personality` | L43-L59 |
| `AiStateEntry` | L61-L65 |
| `ToolEffect` | L67-L76 |
| `ConfidenceParts` | L78-L90 |
| `DecisionResult` | L92-L118 |
| `IntelActionCandidate` | L120-L125 |
| `IntelActionResult` | L127-L129 |
| `ResetContext` | L131-L135 |
| `BuildAIBidsContext` | L137-L148 |
| `IntelSummaryInput` | L150-L158 |
| `ComputeSingleDecisionArgs` | L160-L176 |
| `ComputeConfidencePartsArgs` | L178-L191 |
| `PlanIntelActionArgs` | L193-L206 |
| `ApplyCrowdDiversityArgs` | L208-L215 |

全部 `export interface`，供 bidding.ts 和子模块共同导入。

#### `ai/bidding/pure.ts`（~250 行）

提取/迁移以下纯函数：

| 函数 | 来源 | 签名 | 说明 |
|------|------|------|------|
| `defaultPersona()` | 迁移自 L1168-L1186 | `() => Personality` | 返回默认人格参数 |
| `normalizeToolEffect(effect)` | 迁移自 L1188-L1199 | `(effect: ToolEffect \| object) => ToolEffect` | 规范化工具效果数值 |
| `marketReference(currentBid, lastRoundBids, fallback)` | 迁移自 L1201-L1213 | `(number, Record, number) => number` | 市场参考价 |
| `buildToolEffect(args)` | 提取自方法 L999-L1071 | `(args) => ToolEffect` | 工具效果评估（零 this） |
| `computeConfidenceParts(args)` | 提取自方法 L789-L848 | `(ComputeConfidencePartsArgs) => ConfidenceParts` | 信心计算（零 this） |
| `applyCrowdDiversity(args, personalityMap)` | 提取自方法 L1073-L1139 | `(ApplyCrowdDiversityArgs, Record<string, Personality>) => void` | 群体多样性调整（参数化 personalityMap） |

依赖：`import { clamp, roundToStep, randomBetween } from "../../core/utils"` + `import type { ... } from "./types"`

#### `ai/bidding/intel-action.ts`（~150 行）

提取 `planIntelAction` 为纯函数：

| 函数 | 来源 | 签名 |
|------|------|------|
| `planIntelAction(args, personalityMap)` | 提取自方法 L860-L987 | `(PlanIntelActionArgs, Record<string, Personality>) => IntelActionResult` |

参数化 `personalityMap`（原 `this.personalityMap` -> 参数）。依赖：`clamp`、`randomBetween`、`defaultPersona`（from pure.ts）。

#### `ai/bidding.ts`（~550-600 行，从 1213 行降低）

保留 `AuctionAiEngine` 类，方法变薄委托：

```typescript
import { clamp, roundToStep, randomBetween } from "../core/utils"
import type { Personality, AiStateEntry, ToolEffect, ... } from "./bidding/types"
import {
  defaultPersona,
  normalizeToolEffect,
  marketReference,
  buildToolEffect as _buildToolEffect,
  computeConfidenceParts as _computeConfidenceParts,
  applyCrowdDiversity as _applyCrowdDiversity
} from "./bidding/pure"
import { planIntelAction as _planIntelAction } from "./bidding/intel-action"

// re-export 纯函数保持向后兼容
export { defaultPersona, normalizeToolEffect, marketReference } from "./bidding/pure"
export { planIntelAction } from "./bidding/intel-action"
export { buildToolEffect, computeConfidenceParts, applyCrowdDiversity } from "./bidding/pure"
export type { Personality, ToolEffect, ... } from "./bidding/types"

export class AuctionAiEngine {
  // 属性声明不变
  personalityMap: Record<string, Personality>
  aiState: Map<string, AiStateEntry>
  runMeta: { startingBid: number; itemCount: number }
  lastDecisionLog: Record<string, unknown> | null

  constructor() { /* 不变 */ }

  resetForNewRun(context: ResetContext = {}) { /* 不变 */ }

  buildAIBids(context: BuildAIBidsContext) {
    // 不变，但内部调用改为：
    // - marketReference() 从 pure 导入（已是不变）
    // - this.buildToolEffect(...) 委托 _buildToolEffect（不变）
    // - this.computeSingleDecision(...) 不变
    // - this.applyCrowdDiversity(...) 委托 _applyCrowdDiversity
  }

  computeSingleDecision(args: ComputeSingleDecisionArgs): DecisionResult {
    // 编排逻辑保留（ensureState 状态读写）
    // 内部 this.computeConfidenceParts(...) 委托 _computeConfidenceParts
    // normalizeToolEffect 从 pure 导入
    // 其余数学计算保留
  }

  // 薄委托方法
  computeConfidenceParts(args: ComputeConfidencePartsArgs): ConfidenceParts {
    return _computeConfidenceParts(args)
  }

  planIntelAction(args: PlanIntelActionArgs): IntelActionResult {
    return _planIntelAction(args, this.personalityMap)
  }

  buildToolEffect(args): ToolEffect {
    return _buildToolEffect(args)
  }

  applyCrowdDiversity(args: ApplyCrowdDiversityArgs): void {
    _applyCrowdDiversity(args, this.personalityMap)
  }

  ensureState(playerId, persona, bidStep): AiStateEntry { /* 不变 */ }
  getLastDecisionLog() { /* 不变 */ }
}
```

### 4.4 状态共享处理

| 实例属性 | 处理方式 |
|----------|----------|
| `personalityMap` | 保留在类实例，纯函数通过参数接收（planIntelAction、applyCrowdDiversity） |
| `aiState` | 保留在类实例，仅 ensureState/computeSingleDecision 读写（不可提取） |
| `runMeta` | 保留在类实例，resetForNewRun 写、ensureState/buildAIBids 读 |
| `lastDecisionLog` | 保留在类实例，buildAIBids 写、getLastDecisionLog 读 |

纯函数**不持有状态**，所有数据经参数传入。类方法作为有状态协调器，委托纯函数做计算。

### 4.5 对外接口不变保证

- `export class AuctionAiEngine` -- 类导出不变
- `new AuctionAiEngine()` -- 构造不变
- 所有公共方法签名不变（resetForNewRun, buildAIBids, computeSingleDecision, computeConfidenceParts, planIntelAction, buildToolEffect, applyCrowdDiversity, ensureState, getLastDecisionLog）
- `personalityMap` 属性访问不变
- `ai/index.ts` 不涉及（不 re-export bidding）
- `tests/game/ai/bidding.test.ts` 零改动
- 所有消费方（warehouse-scene, bidding/index, lan/game-flow, intel/action, context-builder, decision）零改动

---

## 五、可测试性提升

### 5.1 当前测试覆盖

`tests/game/ai/bidding.test.ts`（13 个测试）：
- `resetForNewRun`：5 个（清空 aiState、startingBid 最小值、itemCount 最小值、合法上下文、清空 lastDecisionLog）
- `buildToolEffect`：5 个（none、actionId=none、quality tag、outline tag、boost 范围）
- `applyCrowdDiversity`：3 个（拉开差距、已拉开不调整、未设置 bidMap）

所有测试通过 `new AuctionAiEngine()` 实例调用方法。

### 5.2 拆分后新增可独立测试的纯函数

| 纯函数 | 当前测试方式 | 拆分后测试方式 | 新增测试点 |
|--------|------------|--------------|-----------|
| `computeConfidenceParts` | 无（未测） | 直接调用纯函数 | 各 part 边界值（base=0.8、clue/quality/progress 正负、market 上限 0.16、tool 范围 -0.06~0.16、edgeBonus 范围、spreadPenalty、uncertaintyPenalty、mood、total clamp 0~1） |
| `planIntelAction` | 无（未测） | 直接调用，传 personalityMap | none 候选默认分、各技能/道具候选评分、threshold 截断、candidates 排序、资源不足跳过 |
| `marketReference` | 无（未测） | 直接调用纯函数 | 空上轮出价回退、单值、多值加权（avg*0.62+top*0.38）、currentBid 下限 |
| `normalizeToolEffect` | 无（未测） | 直接调用纯函数 | 空输入、各字段 clamp 边界、tag 默认空串 |
| `defaultPersona` | 无（未测） | 直接调用纯函数 | 返回结构完整、字段类型合法 |
| `buildToolEffect`（纯函数版） | 经实例测 5 个 | 直接调用 + 保留实例测试 | 更多 signalStats 组合、planScore 影响、stageFactor 边界 |
| `applyCrowdDiversity`（纯函数版） | 经实例测 3 个 | 直接调用 + 保留实例测试 | 多 AI 排序、bias 方向调整、used 去重、bidMap 归一化 |

### 5.3 新测试文件

新建 `tests/game/ai/bidding/pure.test.ts`（~15-20 个新测试）：
- `computeConfidenceParts`：6-8 个（各 part 独立验证 + total clamp）
- `marketReference`：3 个（空、单值、多值）
- `normalizeToolEffect`：3 个（空、边界、正常）
- `planIntelAction`：5-6 个（none 默认、各候选、threshold、排序）

新建 `tests/game/ai/bidding/intel-action.test.ts`（~5 个新测试）：
- `planIntelAction` 各资源场景

**注意**：`tests/game/ai/bidding.test.ts`（文件）与 `tests/game/ai/bidding/`（目录）可共存（不同名）。

---

## 六、行为保持原则

1. **逐字搬迁**：提取到 pure.ts / intel-action.ts 的函数体**一字不改**，仅去掉 `this.` 前缀，将 `this.personalityMap` 改为参数。
2. **类方法变薄但签名不变**：委托方法保持原参数列表和返回类型。
3. **import 路径不变**：`from "../ai/bidding"` 仍解析到 `bidding.ts`。
4. **类型导出保持**：原文件内定义的 interface 通过 re-export 保持可从 `ai/bidding` 导入。
5. **模块级函数保持可导入**：`defaultPersona`、`normalizeToolEffect`、`marketReference` 原本不导出，拆分后从 pure.ts 导出并在 bidding.ts re-export（向后兼容性增强，不破坏）。

---

## 七、验证步骤

### 7.1 基线（当前）

- `npx tsc --noEmit`：0 error
- `npm run test`：1032 passed
- `npm run lint`：0 error（~305 warning）
- `bidding.ts`：1213 行

### 7.2 拆分后验证

```bash
# 1. 类型检查（0 error）
npx tsc --noEmit

# 2. 全量测试（1032 + 新增 = 目标 1045+）
npm run test

# 3. bidding 专属测试（零改动通过）
npx vitest run tests/game/ai/bidding.test.ts

# 4. 新增纯函数测试
npx vitest run tests/game/ai/bidding/pure.test.ts
npx vitest run tests/game/ai/bidding/intel-action.test.ts

# 5. Lint（不增 error）
npm run lint

# 6. Prettier 格式
npx prettier --check scripts/game/ai/bidding.ts scripts/game/ai/bidding/*.ts

# 7. 行数确认
wc -l scripts/game/ai/bidding.ts scripts/game/ai/bidding/*.ts
```

### 7.3 验证清单

- [ ] `tsc --noEmit` 0 error
- [ ] `tests/game/ai/bidding.test.ts` 零改动全通过（13 个）
- [ ] 全量测试 >= 1032（原有不回归 + 新增纯函数测试）
- [ ] `lint` 0 error（warning 不增）
- [ ] `bidding.ts` 行数从 1213 降至 ~550-600
- [ ] 所有消费方文件零改动
- [ ] `ai/index.ts` 不涉及

---

## 八、风险点

| # | 风险 | 等级 | 缓解 |
|---|------|------|------|
| 1 | `computeConfidenceParts` 提取后 `randomBetween` 导致结果不确定，测试需用范围断言 | 低 | 现有测试已用 `toBeGreaterThanOrEqual`/`toBeLessThanOrEqual`，新测试照此模式 |
| 2 | `applyCrowdDiversity` 参数化 personalityMap 后，类方法委托时传 `this.personalityMap`，需确保引用一致 | 低 | 委托代码 `this.applyCrowdDiversity(args)` -> `_applyCrowdDiversity(args, this.personalityMap)`，简单直传 |
| 3 | interface 从 bidding.ts 迁出到 types.ts 后，消费方如有 `import type { Personality } from "../ai/bidding"` 需 re-export 保持 | 低 | bidding.ts 加 `export type { ... } from "./bidding/types"`。当前无消费方直接导入 interface（都经 ai.d.ts 类型声明），但 re-export 防御 |
| 4 | `bidding.ts` + `bidding/` 目录共存，Vite/TS 模块解析优先级 | 极低 | 已有 `intel.ts` + `intel/` 先例验证可行。`.ts` 文件优先于目录 index |
| 5 | `types/ai.d.ts` L337 有独立的 `export interface AuctionAiEngine`（结构化类型），与实际 class 的兼容性 | 无 | 结构化类型不依赖 import 来源，class 实例自然满足 interface。无需改动 ai.d.ts |
| 6 | `computeSingleDecision`（367 行）保留在类中，文件仍较长 | 中 | 本阶段不拆 computeSingleDecision 内部（状态耦合深）。可作 Phase 2 进一步提取子计算纯函数（见第九节） |

---

## 九、是否分阶段

**建议分两阶段执行：**

### Phase 1（本计划核心，低风险）

- 创建 `ai/bidding/types.ts`（迁移 13 个 interface）
- 创建 `ai/bidding/pure.ts`（迁移 3 个模块级函数 + 提取 buildToolEffect + computeConfidenceParts + applyCrowdDiversity）
- 创建 `ai/bidding/intel-action.ts`（提取 planIntelAction）
- `bidding.ts` 变薄（类保留，方法委托）
- 新增 `tests/game/ai/bidding/pure.test.ts` + `intel-action.test.ts`
- 预期：bidding.ts 1213 -> ~550-600 行，纯函数可独立测试

### Phase 2（可选，后续迭代）

- 从 `computeSingleDecision`（367 行）中提取子计算纯函数：
  - `calcBaseEstimate(anchorBid, confidence, qualityRate, edgeSignal)` -- 基础估值
  - `calcPerceivedValue(...)` -- 感知价值（含噪声）
  - `calcHardCap(perceivedValue, anchorBid, psychExpectedBid, marketRef, persona, ...)` -- 价格上限
  - `calcOverheat(currentBid, psychExpectedBid, confidence, uncertainty, spread, persona, tool)` -- 过热评估
  - `calcBidAction(...)` -- 最终出价决策（过热回撤/恐高减价/低估值观望/正常抬价）
- computeSingleDecision 变为编排器，委托上述纯函数 + 读写 state
- 预期：bidding.ts 进一步降至 ~350-400 行

**Phase 1 足以解决 task-list #2 的职责过载问题**（三大职责已分离到独立子模块），Phase 2 是可选的深度优化。

---

## 十、总结

| 维度 | 现状 | 拆分后 |
|------|------|--------|
| 文件形态 | 单文件 1213 行 class | 薄入口 class（~550-600 行）+ 3 子模块 |
| 三大职责 | 全在同一个类中 | 出价算法（bidding.ts）+ 情报动作（intel-action.ts）+ 工具效果（pure.ts） |
| 可测纯函数 | 0（3 个模块级函数未导出未测） | 6 个（buildToolEffect, computeConfidenceParts, planIntelAction, applyCrowdDiversity, marketReference, normalizeToolEffect） |
| 外部接口 | class + 7 方法 + 1 属性 | **完全不变** |
| 测试改动 | - | bidding.test.ts 零改动 + 新增 pure.test.ts / intel-action.test.ts |
| 风险等级 | - | 低（方案 A，最低风险路径） |
| 分阶段 | - | Phase 1 核心拆分 + Phase 2 可选深度 |
