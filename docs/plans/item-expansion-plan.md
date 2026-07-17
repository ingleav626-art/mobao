# 道具扩充计划

> 基于现有 `ItemExecContext` + `reveal-fns.ts` 基础设施扩展，保持与技能系统的统一性

---

## 现有能力盘点

### 函数层（`reveal-fns.ts` / `warehouse/index.ts`）

| 函数 | 能力 | 暴露给道具？ |
|------|------|:----:|
| `revealOutline({count, category?, allowCategoryFallback?})` | 揭示N件轮廓 | ✅ |
| `revealQuality({count, category?, allowCategoryFallback?})` | 揭示N件品质格 | ✅ |
| `revealAll({count, sortStrategy})` | 揭示全部信息（+价） | ❌ |
| `sortByArea(arr, strategy)` | largestFirst / smallestFirst / random | 内用 |

### 接口层

`ItemExecContext` `items.ts:16-27`：
```ts
revealOutline(options) → { ok, revealed, message }
revealQuality(options) → { ok, revealed, message }
```

`SkillExecContext` `skills.ts:19-31`：
```ts
revealOutline(options) → { ok, revealed, message }
revealQuality(options) → { ok, revealed, message }
revealAll(options) → { ok, revealed, message }    ← 道具缺这个
```

### 玩家侧 vs AI 侧

- 玩家用道具 → `ItemManager.use()` → 调 `ItemExecContext.xxx()` → 触发仓库视觉揭示
- AI 用道具 → `_executeAiIntelActionImpl` → 调 `skill.execute(context)` / `item.execute(context)` → 走 `buildAiPrivateRevealContext`
- AI 回调文字 → `buildAiToolResultSummary` 拼 description → 喂给 LLM

---

## 阶段一：补齐缺失函数

### 1a. `ItemExecContext` 加 `revealAll`

加一行，跟 skill 的签名一样：

```ts
revealAll: (options: { count: number; sortStrategy: string }) => {
  ok: boolean; revealed: number; message: string
}
```

### 1b. `revealAll` 的视觉/数据双实现

玩家侧：`WarehouseManager` 已有 `revealArtifactFullyBatch(opts)` 暴露在 deps 中。
AI 侧：`buildAiPrivateRevealContext` 已有 `revealAll(opts)` 走 `revealPrivateIntelFully`。

道具有了 `revealAll` 后，新道具可以直接用：
```ts
execute(context) { return context.revealAll({ count: 1, sortStrategy: null }) }
```

### 影响文件
| 文件 | 改动 |
|------|------|
| `scripts/game/data/items.ts:15-27` | `ItemExecContext` 加 `revealAll` |
| `scripts/game/data/items.ts` | 新增道具条目 |
| `scripts/llm/core/llm-prompt.ts:687-` | `buildAiToolResultSummary` 处理 `revealAll` 的回调文字 |

---

## 阶段二：新增 sortStrategy

### 当前策略（`reveal-fns.ts:137-144`）

| 策略 | 效果 |
|------|------|
| `null` | 随机 |
| `largestFirst` | 按面积从大到小 |
| `smallestFirst` | 按面积从小到大 |

### 新增策略

```ts
"highestPrice"   → 按 basePrice 从高到低
"lowestPrice"    → 按 basePrice 从低到高
```

`sortByArea` 改名 `sortByStrategy` 或加 price 分支：

```ts
if (strategy === "highestPrice") {
  return shuffled.sort((a, b) => b.basePrice - a.basePrice)
}
if (strategy === "lowestPrice") {
  return shuffled.sort((a, b) => a.basePrice - b.basePrice)
}
```

### 影响文件
| 文件 | 改动 |
|------|------|
| `scripts/game/warehouse/warehouse-manager/reveal-fns.ts:137` | `sortByArea` 加 price 分支 |
| `scripts/game/warehouse/index.ts:103` | 同样加 price 分支 |
| `scripts/game/ai/intel-manager/reveal-fns.ts` | AI 侧同样加 price 分支 |

---

## 阶段三：新增动作类型

### 3a. `revealByQuality`

揭示指定品质等级的所有未知藏品（不限于N件，是所有）。

```ts
revealByQuality: (options: { qualityKey: string }) => {
  ok: boolean; revealed: number; message: string
}
```

实现：遍历仓库格子，筛选 `qualityKey === options.qualityKey` 且未被揭示的，逐一完全揭示。

玩家侧 → `WarehouseManager` 加 `revealArtifactsByQuality(qualityKey)`
AI 侧 → 遍历 `aiPrivateIntel` 做同样操作

### 3b. `revealByCategory`

揭示指定品类的所有未知藏品。

```ts
revealByCategory: (options: { category: string }) => {
  ok: boolean; revealed: number; message: string
}
```

实现同 3a，按 `category` 筛选。

### 3c. 均价类

```ts
computeAveragePrice: (options: { scope: "total" | "singleCell" | "doubleCell" | "quadCell" | "quality:poor" | "quality:normal" | ... | "category:瓷器" | ... }) => {
  ok: boolean; revealed: number; message: string
}
```

不修改仓库状态，只计算并返回文字信息。`message` 直接给 AI 看（"全场均价约12500"）。

### 3d. 加成类

```ts
applyProfitModifier: (options: { target: "self" | "all"; percent: number }) => {
  ok: boolean; revealed: number; message: string
}
```

影响结算时的利润计算。需要在结算流水中加入系数因子。

### 影响文件
| 文件 | 改动 |
|------|------|
| `scripts/game/data/items.ts` | `ItemExecContext` 新增方法签名 |
| `scripts/game/warehouse/warehouse-manager/reveal-fns.ts` | 新函数的视觉实现 |
| `scripts/game/warehouse/index.ts` | 暴露新函数到 deps |
| `scripts/game/ai/intel-manager/reveal-fns.ts` | AI 侧实现 |
| `scripts/game/ai/intel-manager/action-fns.ts` | `_makeVisualRevealContext` 加新函数 |
| `scripts/game/core/settlement.ts`（待确认） | 加成类影响结算 |
| `scripts/llm/core/llm-prompt.ts` | 回调文字 |

---

## 阶段四：道具列表

### 揭示类（12个）

| 道具名 | 动作 | sortStrategy | count |
|--------|------|:---:|:-----:|
| 低阶探照灯 | `revealAll` | `null`(random) | 1 |
| 中阶探照灯 | `revealAll` | `null`(random) | 2 |
| 高阶探照灯 | `revealAll` | `null`(random) | 4 |
| 顶阶探照灯 | `revealAll` | `null`(random) | 10 |
| 窥宝镜 | `revealAll` | `highestPrice` | 1 |
| 藏品入微镜 | `revealByQuality` | `poor` | 全部 |
| 藏品洞察镜 | `revealByQuality` | `normal` | 全部 |
| 藏品精研镜 | `revealByQuality` | `fine` | 全部 |
| 品类专研-瓷器 | `revealByCategory` | `瓷器` | 全部 |

### 均价类（8个，各局只能用1次）

| 道具名 | 动作 | scope |
|--------|------|-------|
| 单格均价仪 | `computeAveragePrice` | `singleCell` |
| 双格均价仪 | `computeAveragePrice` | `doubleCell` |
| 四格均价仪 | `computeAveragePrice` | `quadCell` |
| 全场估价仪 | `computeAveragePrice` | `total` |
| 粗品估价仪 | `computeAveragePrice` | `quality:poor` |
| 良品估价仪 | `computeAveragePrice` | `quality:normal` |
| 精品估价仪 | `computeAveragePrice` | `quality:fine` |
| 瓷器估价仪 | `computeAveragePrice` | `category:瓷器` |

### 加成类（4个）

| 道具名 | 动作 | target | percent |
|--------|------|--------|:------:|
| 幸运护符 | `applyProfitModifier` | `self` | +50% |
| 厄运符咒 | `applyProfitModifier` | `self` | -50% |
| 群体祝福 | `applyProfitModifier` | `all` | +100% |
| 群体诅咒 | `applyProfitModifier` | `all` | -200% |

---

## 执行顺序

```
阶段一（补齐 revealAll）
  ├─ ItemExecContext 加 revealAll
  ├─ 先用 revealAll 实现"随机揭示"和"高价值揭示"道具
  └─ buildAiToolResultSummary 加 revealAll 回调
      ↓
阶段二（新增 sortStrategy: highestPrice / lowestPrice）
  ├─ reveal-fns.ts 加 price 排序
  ├─ warehouse/index.ts 加 price 排序
  └─ AI 侧 reveal-fns.ts 加 price 排序
      ↓
阶段三（新增动作类型：revealByQuality / revealByCategory）
  ├─ ItemExecContext 加新方法签名
  ├─ 玩家侧视觉实现（reveal-fns.ts）
  ├─ AI 侧数据实现（intel-manager/reveal-fns.ts）
  └─ _makeVisualRevealContext 加新函数
      ↓
阶段四（均价类：computeAveragePrice）
  ├─ 纯计算，不修改仓库
  └─ 仅返回 message 文字给 AI
      ↓
阶段五（加成类：applyProfitModifier）
  └─ 结算流程加系数因子
```

每个阶段完成后用户验证，确认 OK 再进下阶段。
