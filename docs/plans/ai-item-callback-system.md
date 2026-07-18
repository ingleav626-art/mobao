# AI 道具回调系统统一化实施计划

> 目标：对齐"道具回调系统优化 + 虚拟画布状态管理修复 + 揭示类道具新函数 + 统一返回类型"四项需求。
> 范围：仅限 AI 侧 (`scripts/game/ai/intel-manager/`) 与道具定义层 (`scripts/game/data/items.ts`)，不触及玩家视觉揭示流程。
> 原则：保持现有核心逻辑不变（`revealPrivateIntelBatch` / `revealPrivateIntelFully` 的核心 signal 构建流程不动），仅补全缺失的状态维护与统一返回结构。

---

## 一、现状盘点

### 1.1 道具分类与现有回调

`ItemExecContext` ([scripts/game/data/items.ts:16-52](file:///d:/web/demo2-trae/scripts/game/data/items.ts)) 暴露 7 个方法：

| 类型 | 接口方法 | 道具数 | AI 私有上下文实现位置 |
|------|---------|------|----------------------|
| 轮廓类 | `revealOutline` | 6 | `revealPrivateIntelBatch(mode="outline")` |
| 品质类 | `revealQuality` | 5 | `revealPrivateIntelBatch(mode="quality")` |
| 揭示类-批量 | `revealAll` | 5 | `revealPrivateIntelFully` |
| 揭示类-按品质 | `revealByQuality` | 3 | `revealPrivateIntelAllByQuality` |
| 揭示类-按品类 | `revealByCategory` | 1 | `revealPrivateIntelAllByCategory` |
| 均价类 | `computeAveragePrice` | 8 | `computeAveragePrice`（纯函数） |
| 加成类 | `applyBonus` | 4 | `deps.applyBonus`（注入到 warehouse-scene.ts） |

### 1.2 现有返回结构（不统一）

`RevealResult` ([def-manager-helpers.ts:18-23](file:///d:/web/demo2-trae/scripts/game/data/def-manager-helpers.ts))：

```ts
interface RevealResult {
  ok: boolean
  revealed: number
  message: string
}
```

但实际各函数返回的字段不一致：

| 函数 | 实际返回字段 |
|------|------------|
| `revealPrivateIntelBatch` | `ok, revealed, signals, signalStats, trackUpdates, bottomCell(仅outline)` |
| `revealPrivateIntelFully` | `ok, revealed, signals, signalStats, trackUpdates` ← 缺 bottomCell |
| `revealPrivateIntelAllByQuality/Category` | `ok, revealed, message` ← 缺所有结构化字段 |
| `computeAveragePrice` | `ok, revealed:0, message:"瓷器均价：1234"` ← 仅文本 |
| `applyBonus`（warehouse-scene.ts） | `ok, revealed:0, message:"已应用加成..."` ← 仅状态 |

### 1.3 虚拟画布状态（AiPrivateIntelPool）

[types/ai.d.ts:252-265](file:///d:/web/demo2-trae/types/ai.d.ts)：

```ts
interface AiPrivateIntelPool {
  knownOutlineIds: Set<string>          // 已揭示轮廓的藏品 id
  knownQualityIds: Set<string>          // 已揭示品质的藏品 id
  outlineSignals: AiIntelSignal[]      // 轮廓信号历史
  qualitySignals: AiIntelSignal[]      // 品质信号历史
  signalHistory: AiIntelSignal[]       // 全部信号历史（前两者并集，截顶 160）
  latestSignalStats: { ... } | null    // 最近一次信号统计
  aggregateStats: AiSignalStats | null // 累计统计
  knownCellStates: Record<string, string>  // 格子占用状态（occupied/empty）
  itemKnowledge: Record<string, AiItemKnowledge>  // 藏品知识
  highValueTrackByItemId: Record<string, string>   // 高价值藏品 → 追踪 id
  highValueTracks: HighValueTrack[]                // 高价值追踪列表
  nextTrackIndex: number                           // 下一个红N追踪 id
}
```

### 1.4 缺陷清单

#### 缺陷 1：揭示类按品质/品类不更新画布状态（严重）

[intel-manager/reveal-fns.ts:643-688](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/reveal-fns.ts)：

```ts
export function revealPrivateIntelAllByQuality(deps, state, playerId, qualityKey) {
  const targets = deps.items.filter(...)
  targets.forEach((item) => {
    pool.knownOutlineIds.add(item.id)    // ← 只加 id
    pool.knownQualityIds.add(item.id)
  })
  return { ok: true, revealed: targets.length, message: ... }
}
```

**未做的事**（`revealPrivateIntelFully` 都做了）：
- ❌ 不构建 `outlineSignal` / `qualitySignal`，`outlineSignals/qualitySignals/signalHistory` 不更新
- ❌ 不调 `markAllItemCellsAsOccupied` / `scanItemBoundaryNeighbors`，`knownCellStates` 不更新
- ❌ 不调 `updateAiItemKnowledge`，`itemKnowledge` 的 `revealCount/lastSeenRound/category/qualityKey/knownCells` 不更新
- ❌ 不调 `ensureAiHighValueTrack`，**高价值追踪完全失效**（揭示类本应是最强追踪触发器）
- ❌ 不更新 `latestSignalStats` / `aggregateStats`，`getAiIntelSummary` 基于过时数据
- ❌ 不返回 `bottomCell` / `signals` / `trackUpdates`

**影响范围**：4 个揭示类道具（`item-by-quality-poor/normal/fine`、`item-by-cat-porcelain`）在 AI 手里不更新任何画布状态，下游 LLM 决策、高价值追踪、不确定性计算全部基于过时数据。

#### 缺陷 2：`revealPrivateIntelFully` 不返回 `bottomCell`

[intel-manager/reveal-fns.ts:619-642](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/reveal-fns.ts)：构建了完整 signal 但未调 `pickBottomCellFromTargets`。

#### 缺陷 3：品质类不返回 `bottomCell`

[intel-manager/reveal-fns.ts:528-536](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/reveal-fns.ts)：

```ts
const bottomCell = mode === "outline" ? deps.pickBottomCellFromTargets(targets) : null
```

仅 outline 模式返回，品质模式不返回。违反"所有道具类型均需实现最底部藏品坐标返回机制"统一要求。

#### 缺陷 4：`bottomCell?: unknown` 类型不安全

[intel-manager/reveal-fns.ts:25-26](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/reveal-fns.ts)：

```ts
interface RevealBatchResult {
  bottomCell?: unknown   // ← 实际是 { x, y, col, row } | null
}
```

#### 缺陷 5：均价返回纯文本，AI 无法解析数值

[intel-manager/reveal-fns.ts:747-785](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/reveal-fns.ts)：

```ts
return { ok: true, revealed: 0, message: `${label}均价：${avg}` }
```

`buildAiToolResultSummary` 拿到字符串后只能原样塞进 prompt，AI 无法直接做数值推理。

#### 缺陷 6：缺少画布状态一致性校验

无机制保证以下不变量：
- `knownOutlineIds.size ≤ items.length`
- `signalHistory.length === outlineSignals.length + qualitySignals.length`
- `knownQualityIds ⊆ knownOutlineIds`（揭示类道具同时加入两者，但 revealQuality 只加 quality）
- `itemKnowledge[itemId].revealCount === outlineSignals.filter(s=>s.itemId===itemId).length + qualitySignals.filter(...).length`
- `highValueTrackByItemId` 的值与 `highValueTracks[].trackId` 一一对应

---

## 二、统一返回类型设计

### 2.1 新增 `ItemResult` 接口

新增 [scripts/game/ai/intel-manager/item-result.ts](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/item-result.ts)：

```ts
import type { AiIntelSignal, AiSignalStats } from "../../../../types/ai"
import type { TrackUpdate } from "./reveal-fns"  // 提取现有内联类型

/** 统一坐标点（与 warehouse/index.ts pickBottomCellFromTargets 对齐） */
export interface BottomCell {
  x: number
  y: number
  col: number
  row: number
}

/** 揭示类返回的藏品完整信息（单行 JS 对象） */
export interface ArtifactInfo {
  id: string
  name: string
  category: string
  qualityKey: string
  quality: string         // 品质 label（如"精品"）
  sizeTag: string         // 尺寸标签（如"2x2"）
  w: number
  h: number
  basePrice: number
  x: number               // 藏品左上角 x
  y: number               // 藏品左上角 y
}

/** 道具类型标签 */
export type ItemActionType = "outline" | "quality" | "reveal" | "average" | "bonus"

/** 统一返回类型（所有字段除 ok/message 外可选，按 actionType 动态填入） */
export interface ItemResult {
  // 基础字段（兼容 RevealResult）
  ok: boolean
  revealed: number
  message: string

  // 统一返回：道具类型标签
  actionType?: ItemActionType

  // 统一返回：最底部藏品坐标（如适用）
  bottomCell?: BottomCell | null

  // 轮廓类专用
  itemCount?: number              // 探测到的物品总数量（= revealed）
  // 品质类专用
  qualityCellCount?: number       // 本次探查的品质格总数（= revealed）

  // 揭示类专用
  artifacts?: ArtifactInfo[]      // 藏品完整信息数组

  // 均价类专用
  averagePrice?: number           // 均价数值
  scope?: string                  // 范围标签（如 "瓷器" / "精品" / "全场"）

  // 加成类专用
  bonusApplied?: boolean          // 仅状态确认

  // 兼容：signal 相关（轮廓/品质/揭示类共用）
  signals?: AiIntelSignal[]
  signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats }
  trackUpdates?: TrackUpdate[]
}
```

### 2.2 兼容策略

- `ItemResult` 是 `RevealResult` 的超集，旧调用方读 `ok/revealed/message` 不受影响
- `applyUse` ([def-manager-helpers.ts:42-66](file:///d:/web/demo2-trae/scripts/game/data/def-manager-helpers.ts)) 不需改动，仍按 `ok` 判定
- `buildAiToolResultSummary` ([llm-prompt.ts:687-762](file:///d:/web/demo2-trae/scripts/llm/core/llm-prompt.ts)) 增量读取新字段，逐步增强 prompt 信息

---

## 三、实施步骤（分阶段，每阶段独立验证）

### 阶段 0：准备（无逻辑变更）

**0.1** 提取 `TrackUpdate` 类型为独立 export（目前内联在 `reveal-fns.ts` 多处）

**0.2** 新增 `scripts/game/ai/intel-manager/item-result.ts`，定义 `ItemResult` / `ArtifactInfo` / `BottomCell` / `ItemActionType`

**0.3** 把 `RevealBatchResult` / `RevealFullyResult` 中 `bottomCell?: unknown` 改为 `bottomCell?: BottomCell | null`

**验证**：`npx tsc --noEmit`

**影响文件**：
- 新增 `scripts/game/ai/intel-manager/item-result.ts`
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`（仅类型替换，无逻辑变更）

---

### 阶段 1：修复虚拟画布状态维护缺陷（核心 bug 修复）

**1.1 修复 `revealPrivateIntelAllByQuality`**

改造为：先调 `pickPrivateRevealTargets` 取目标，再循环走 `buildAiPrivateSignal("outline") + buildAiPrivateSignal("quality") + ensureAiHighValueTrack + updateAiItemKnowledge`（与 `revealPrivateIntelFully` 完全相同的副作用流），最后批量更新 `pool.latestSignalStats/aggregateStats` 并返回完整 `ItemResult`。

**关键约束**：保留函数名、签名、调用方不变。仅扩展返回字段。

**1.2 修复 `revealPrivateIntelAllByCategory`**：同 1.1。

**1.3 补全 `revealPrivateIntelFully` 的 `bottomCell`**：在函数末尾返回前调 `deps.pickBottomCellFromTargets(targets)`。

**1.4 补全 `revealPrivateIntelBatch` 品质模式的 `bottomCell`**：移除 `mode === "outline"` 条件，所有模式都计算 `bottomCell`。

**1.5 提取私有 helper `applyFullRevealSideEffects(deps, state, playerId, item)`**：把 `revealPrivateIntelFully` 中循环体（构建 outline+quality signal、加入 set、触发 track、更新 knowledge）抽成函数，供 `revealPrivateIntelAllByQuality/Category/Fully` 三处复用，消除重复实现。

**验证**：
- `npx tsc --noEmit`
- 新增单测：使用 73 件真实藏品（`ARTIFACT_LIBRARY`），调 `revealPrivateIntelAllByQuality("fine")` 后断言：
  - `pool.knownOutlineIds` / `knownQualityIds` 包含所有 fine 藏品 id
  - `pool.outlineSignals.length === fine 藏品数`
  - `pool.qualitySignals.length === fine 藏品数`
  - 每个 fine 藏品对应的 `knownCellStates` 全部标记为 "occupied"
  - 每个 fine 藏品的 `itemKnowledge[id].revealCount === 2`（outline+quality 各一次）
  - 高价值 fine 藏品（基价 ≥ 阈值或 legendary）出现在 `highValueTracks` 中
  - 返回值包含 `bottomCell`、`signals`、`signalStats`、`trackUpdates`

**影响文件**：
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`
- 新增 `tests/game/ai/intel-reveal-canvas-state.test.ts`

---

### 阶段 2：揭示类统一入口函数

**2.1 新增 `revealPrivateIntelBySpec`**

新增函数 `revealPrivateIntelBySpec(deps, state, playerId, spec)`：

```ts
interface RevealSpec {
  qualityKey?: string           // 按品质筛选
  category?: string             // 按品类筛选
  count?: number                // 数量上限（不填=全部）
  sortStrategy?: string         // largestFirst/smallestFirst/highestPrice/lowestPrice/random
  allowCategoryFallback?: boolean
}

export function revealPrivateIntelBySpec(
  deps: AiIntelManagerDeps,
  state: AiIntelState,
  playerId: string,
  spec: RevealSpec
): ItemResult
```

**实现策略**（不重写已有逻辑，复用阶段 1 的 `applyFullRevealSideEffects`）：
1. 筛选 targets（与现有 `pickPrivateRevealTargets` 相同逻辑，但 mode 固定为 full reveal）
2. 应用 `sortStrategy` 排序、按 `count` 截断
3. 对每个 target 调 `applyFullRevealSideEffects(deps, state, playerId, item)`
4. 聚合 signals/signalStats/trackUpdates
5. 构建 `artifacts: ArtifactInfo[]` 数组（**新增字段**，从 `deps.items` 取每个藏品的完整信息）
6. 返回完整 `ItemResult`，`actionType: "reveal"`

**2.2 在 `buildAiPrivateRevealContext` 中暴露新方法**

```ts
revealBySpec: (spec: RevealSpec) => revealPrivateIntelBySpec(deps, state, playerId, spec)
```

**2.3 不修改 `ItemExecContext`**

现有 `revealByQuality` / `revealByCategory` / `revealAll` 三个方法保留不动，新方法是补充而非替代。新道具可以选择用 `revealBySpec` 走统一入口。

**验证**：
- `npx tsc --noEmit`
- 新增单测覆盖：按品质、按品类、按数量上限、混合筛选、空筛选（全部）、fallback 逻辑

**影响文件**：
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`（新增函数 + 提取 helper）
- 修改 `scripts/game/ai/intel-manager.ts`（薄协调器转发新方法）
- 新增 `tests/game/ai/intel-reveal-by-spec.test.ts`

---

### 阶段 3：补全各类型结构化返回字段

**3.1 轮廓类**：`revealPrivateIntelBatch` 返回时填入：

```ts
actionType: "outline",
itemCount: targets.length,  // 探测到的物品总数
revealed: targets.length    // 轮廓格子总数（同 itemCount，因每件藏品一个轮廓）
```

**3.2 品质类**：`revealPrivateIntelBatch` 返回时填入：

```ts
actionType: "quality",
qualityCellCount: targets.length,  // 品质格总数
revealed: targets.length
```

**3.3 揭示类**：`revealPrivateIntelBySpec` / `revealPrivateIntelFully` / `revealPrivateIntelAllByQuality` / `revealPrivateIntelAllByCategory` 返回时填入：

```ts
actionType: "reveal",
artifacts: targets.map(item => ({
  id: item.id, name: item.name, category: item.category,
  qualityKey: item.qualityKey, quality: QUALITY_CONFIG[item.qualityKey].label,
  sizeTag: toSizeTag(item.w, item.h), w: item.w, h: item.h,
  basePrice: item.basePrice, x: item.x, y: item.y
}))
```

**3.4 均价类**：`computeAveragePrice` 改造为返回 `ItemResult`：

```ts
return {
  ok: true, revealed: 0,
  message: `${label}均价：${avg}`,
  actionType: "average",
  averagePrice: avg,
  scope: label,
  itemCount: targets.length
}
```

`buildAiPrivateRevealContext.computeAveragePrice` 改为直接返回新结构。`computeAveragePrice` 纯函数签名变化，调用方仅 `buildSkillContext` 和 `buildAiPrivateRevealContext`（已确认）。

**3.5 加成类**：`applyBonus`（warehouse-scene.ts:1212-1224）改造返回：

```ts
return {
  ok: true, revealed: 0,
  message: `已应用加成（${scope} ${dir}${(value * 100).toFixed(0)}%）。`,
  actionType: "bonus",
  bonusApplied: true
}
```

**验证**：
- `npx tsc --noEmit`
- 新增单测验证每个类型返回结构正确
- 现有 `applyUse` 仍按 `ok` 判定，不受影响

**影响文件**：
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`
- 修改 `scripts/game/scene/warehouse-scene.ts`（`applyBonus` 返回值扩展）
- 修改 `tests/game/ai/intel-manager.test.ts`（断言更新）

---

### 阶段 4：画布状态一致性校验

**4.1 新增 `validateAiPrivateIntelConsistency`**

新增 [scripts/game/ai/intel-manager/consistency-fns.ts](file:///d:/web/demo2-trae/scripts/game/ai/intel-manager/consistency-fns.ts)：

```ts
export interface ConsistencyViolation {
  rule: string
  expected: string | number
  actual: string | number
  severity: "error" | "warning"
}

export function validateAiPrivateIntelConsistency(
  items: Artifact[],
  pool: AiPrivateIntelPool
): { ok: boolean; violations: ConsistencyViolation[] }
```

**校验规则**：
1. `knownOutlineIds.size ≤ items.length`
2. `knownQualityIds.size ≤ items.length`
3. `outlineSignals.length + qualitySignals.length === signalHistory.length`（考虑截顶 160 后的不变量）
4. `highValueTracks.length === Object.keys(highValueTrackByItemId).length`
5. 每个 `highValueTracks[].itemId` 在 `highValueTrackByItemId` 中有对应
6. 每个 `itemKnowledge[id].knownCells` 中的 cellKey 都在 `knownCellStates` 中标记为 "occupied"
7. `nextTrackIndex === highValueTracks.length + 1`（假设初始为 1 且单调递增）

**4.2 暴露到 AiIntelManager** 作为薄协调器方法：

```ts
validateAiPrivateIntelConsistency(playerId: string): { ok: boolean; violations: ConsistencyViolation[] }
```

**4.3 dev 模式下自动校验**：在 `revealPrivateIntelBatch` / `revealPrivateIntelFully` / `revealPrivateIntelBySpec` / `revealPrivateIntelAllByQuality` / `revealPrivateIntelAllByCategory` 末尾，若 `import.meta.env?.DEV` 为真则调一次校验，违规时 `createLogger("AI.Intel").warn` 输出（不抛异常，避免影响主流程）。

**验证**：
- 新增单测：人为破坏每个不变量，断言校验函数能检测到
- 73 件真实藏品 + 真实揭示流程，校验函数返回 `ok: true`

**影响文件**：
- 新增 `scripts/game/ai/intel-manager/consistency-fns.ts`
- 修改 `scripts/game/ai/intel-manager.ts`（薄协调器转发）
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`（dev 模式钩子）
- 新增 `tests/game/ai/intel-consistency.test.ts`

---

### 阶段 5：错误处理机制

**5.1 在 `applyFullRevealSideEffects` 中加 try/catch**：

每个 target 的副作用应用包裹在 try/catch 中，失败时记录错误并跳过该 target，不阻断整个批次。返回值中 `partialFailures: string[]` 列出失败的 itemId。

**5.2 在 `revealPrivateIntelBySpec` 中校验 spec**：

- `qualityKey` 和 `category` 至少一个有值，或两者都为空（全部）
- `count` 必须 ≥ 0（0 视为不限制）
- 不合法 spec 返回 `{ ok: false, message: "..." }`

**验证**：
- 单测构造无效 spec，断言返回 `ok: false`
- 单测让 `buildAiPrivateSignal` 抛错（mock deps.isInBoundsCell），断言 `partialFailures` 包含对应 itemId

**影响文件**：
- 修改 `scripts/game/ai/intel-manager/reveal-fns.ts`

---

## 四、文件改动汇总

### 新增文件（5 个）

| 文件 | 用途 |
|------|------|
| `scripts/game/ai/intel-manager/item-result.ts` | `ItemResult` 等类型定义 |
| `scripts/game/ai/intel-manager/consistency-fns.ts` | 画布状态一致性校验 |
| `tests/game/ai/intel-reveal-canvas-state.test.ts` | 阶段 1 测试 |
| `tests/game/ai/intel-reveal-by-spec.test.ts` | 阶段 2 测试 |
| `tests/game/ai/intel-consistency.test.ts` | 阶段 4 测试 |

### 修改文件（4 个）

| 文件 | 改动范围 |
|------|---------|
| `scripts/game/ai/intel-manager/reveal-fns.ts` | 提取 `applyFullRevealSideEffects` helper；修复 `revealPrivateIntelAllByQuality/Category`；补全 `bottomCell`；新增 `revealPrivateIntelBySpec`；各函数返回 `ItemResult` |
| `scripts/game/ai/intel-manager.ts` | 薄协调器转发新方法 `revealPrivateIntelBySpec` / `validateAiPrivateIntelConsistency` |
| `scripts/game/scene/warehouse-scene.ts` | `applyBonus` 返回值扩展（仅 1 行改动） |
| `tests/game/ai/intel-manager.test.ts` | 断言更新（仅受影响的测试） |

### 不修改文件

- `scripts/game/data/items.ts` — `ITEM_DEFS` 不变（用户要求"保持现有函数核心逻辑不变"）
- `scripts/game/data/def-manager-helpers.ts` — `applyUse` 仍按 `ok` 判定，无需改动
- `scripts/game/warehouse/warehouse-manager/reveal-fns.ts` — 玩家侧视觉揭示不动
- `scripts/llm/core/llm-prompt.ts` — `buildAiToolResultSummary` 增量读取新字段，向后兼容（可选优化，留待后续 PR）

---

## 五、验证策略

### 5.1 类型安全

- 每阶段 `npx tsc --noEmit`
- 禁止 `any`，新引入的 `bottomCell?: unknown` 改为 `bottomCell?: BottomCell | null`

### 5.2 单元测试（按 AGENTS.md 测试原则）

- **数据来自真实源**：`ARTIFACT_LIBRARY`（73 件）、`QUALITY_CONFIG`、`ITEM_DEFS`
- **走真实调用链**：`AiIntelManager.revealPrivateIntelAllByQuality("fine")` → 内部函数，禁止直接 set `pool.knownOutlineIds`
- **断言行为而非内部调用**：测"调用后 pool 状态正确"，不测"内部调用了 `buildAiPrivateSignal`"
- **预期写在注释中**：每个 it 用注释写明"应该发生什么、为什么"

### 5.3 集成测试

新增 `tests/game/ai/intel-callback-system.test.ts`：
- 构造 AI 玩家，分配 `item-by-quality-fine` 道具
- 调 `executeAiIntelAction(playerId, { actionType: "item", actionId: "item-by-quality-fine", ... })`
- 断言：
  - 返回值 `actionType === "reveal"`、`artifacts` 数组长度 === fine 藏品数
  - 返回值包含 `bottomCell`、`signals`、`signalStats`、`trackUpdates`
  - `pool.knownOutlineIds` 包含所有 fine 藏品
  - `pool.knownCellStates` 标记所有 fine 藏品的格子为 "occupied"
  - `pool.highValueTracks` 包含高价值 fine 藏品
  - `validateAiPrivateIntelConsistency` 返回 `ok: true`

### 5.4 回归测试

- 现有 `tests/game/ai/intel-manager.test.ts` 必须全过（断言可能需要更新，因为返回字段增加）
- 现有 `tests/game/warehouse/warehouse-manager.test.ts` 必须全过（玩家侧未改动）
- 全量 `npm run test` 必须全过

---

## 六、风险与缓解

| 风险 | 缓解 |
|------|------|
| 修复 `revealPrivateIntelAllByQuality` 改变 AI 行为（更聪明了） | 这是 bug 修复，符合用户预期；不修改 AI 决策引擎，仅修复画布状态 |
| `ItemResult` 字段膨胀，旧调用方读不到新字段 | 字段全可选，旧调用方零改动；`buildAiToolResultSummary` 增量读取 |
| 一致性校验在 dev 模式可能产生噪音 | 只在 `import.meta.env?.DEV` 为真时跑；warning 级别不抛异常 |
| 新 helper `applyFullRevealSideEffects` 与 `revealPrivateIntelFully` 循环体重复 | 重构时把 `revealPrivateIntelFully` 改为调 helper，消除重复（不算重写） |
| `RevealBatchResult` / `RevealFullyResult` 类型变更引发其他文件报错 | 已确认这两个类型仅在 `reveal-fns.ts` 内使用，外部通过 `ItemResult` 暴露 |

---

## 七、提交计划

按阶段独立提交，每阶段 tsc+test 通过后立即 commit：

1. `refactor(ai-intel): 提取 TrackUpdate 类型，新增 ItemResult 接口` — 阶段 0
2. `fix(ai-intel): 修复 revealPrivateIntelAllByQuality/Category 不更新画布状态缺陷` — 阶段 1
3. `feat(ai-intel): 新增揭示类统一入口函数 revealPrivateIntelBySpec` — 阶段 2
4. `feat(ai-intel): 各道具类型返回结构化字段（artifacts/averagePrice/bonusApplied 等）` — 阶段 3
5. `feat(ai-intel): 新增画布状态一致性校验机制` — 阶段 4
6. `feat(ai-intel): 道具执行错误处理与 spec 校验` — 阶段 5

每阶段 commit 信息遵循 "改了什么 + 为什么" 原则。

---

## 八、不实施的事项（明确排除）

以下事项**不在本次范围**，避免过度工程化：

1. **不修改 `ITEM_DEFS` 的 `execute` 函数体** — 现有道具定义不动，仅扩展上下文方法
2. **不重写 `revealPrivateIntelBatch` 的核心 signal 构建逻辑** — 仅补全返回字段
3. **不修改玩家侧视觉揭示流程** — `warehouse/warehouse-manager/reveal-fns.ts` 不动
4. **不优化 `buildAiToolResultSummary`** — 留待后续 PR 增量读取新字段
5. **不删除现有 `revealByQuality` / `revealByCategory` / `revealAll` 三个方法** — 保留向后兼容
6. **不修改 LAN 联机流程** — 联机模式 AI 决策由房主驱动，画布状态在房主侧维护，本次修改天然兼容
7. **不引入新的持久化字段** — 不涉及 localStorage，无生命周期三问要求
