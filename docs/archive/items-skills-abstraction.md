# data/items.ts + skills.ts 同构抽象计划

> task-list #31 · 调研 + 抽象计划 · 2026-07-13
> 范围：`scripts/game/data/items.ts`（ItemManager）与 `scripts/game/data/skills.ts`（SkillManager）的 use/execute/resetForNewRun 同构逻辑
> 约束：本计划只调研 + 写计划，不改代码。对外接口（导出名、方法签名、公开字段）零改动，消费方零改动。

## 0. 结论摘要

| 维度 | 结论 |
|------|------|
| 同构度 | **高**。`use`/`resetForNewRun`/`getState` 三组方法结构逐行对应，仅字段名与文案不同 |
| 重复量 | ~31 行近重复逻辑（`use` ~20 行 ×2 + `reset` ~4 行 ×2 + `getState` ~7 行 ×2），另含 SkillManager 内 `onNewRound` 与 `resetForNewRun` **字节级重复** |
| 推荐方案 | **选项 B：提取共享 helper 函数**（非基类、非合并） |
| 风险等级 | **低**（接口零改动 + 现有测试断言原样保留即验证等价性） |
| 是否建议执行 | **建议执行，但优先级中低**。ROI 中低（去重 ~31 行，新增 ~40 行 helper + 配置）；最明确的收益是 SkillManager 内 `onNewRound===resetForNewRun` 的字节级重复消除，以及 use 逻辑单点维护 |
| 与 #14 关系 | #14（已完成）提取的是 **Mixin 层** `useSkill`/`useItem` 的 `useAction` helper（`core/skill-item-manager.ts`），处理"动作状态扣减 + 角色加成 + LAN 广播 + 日志"等场景层副作用。本任务针对 **数据层** Manager 的 `use`/`reset`/`getState` 同构，二者层次不同、互不冲突 |

## 1. 两 Manager 对比表

### 1.1 文件与定义概览

| 项 | ItemManager（items.ts:165-209） | SkillManager（skills.ts:76-129） |
|----|--------------------------------|---------------------------------|
| 定义表常量 | `ITEM_DEFS`（11 条） | `SKILL_DEFS`（3 条） |
| 运行时条目类型 | `ItemRuntime`（id/name/description/initialCount/count/execute） | `SkillRuntime`（id/name/description/maxPerRound/remainingThisRound/execute） |
| 公开字段 | `items: ItemRuntime[]` | `skills: SkillRuntime[]` |
| "剩余次数"字段 | `count` | `remainingThisRound` |
| "上限"字段 | `initialCount` | `maxPerRound` |

### 1.2 方法级对比

| 方法名 | items 实现 | skills 实现 | 是否同构 | 差异点 |
|--------|-----------|------------|---------|--------|
| `constructor` | `ITEM_DEFS.map(d => ({ ...d, count: d.initialCount }))` | `SKILL_DEFS.map(d => ({ ...d, remainingThisRound: d.maxPerRound }))` | 同构 | 仅字段名（count vs remainingThisRound）、定义源 |
| `resetForNewRun` | `items.forEach(i => i.count = i.initialCount)` | `skills.forEach(s => s.remainingThisRound = s.maxPerRound)` | 同构 | 仅字段名 |
| `onNewRound` | **不存在** | `skills.forEach(s => s.remainingThisRound = s.maxPerRound)` | N/A（ItemManager 无此方法） | SkillManager 独有；且其方法体与自身 `resetForNewRun` **字节级相同** |
| `use(id, context)` | find→不存在"道具不存在"→count<=0"数量不足"→execute→!ok"揭示失败"→count-=1→成功"{name} 生效，揭示 {N} 件目标。" | find→不存在"技能不存在"→remaining<=0"本回合已用完"→execute→!ok"揭示失败"→remaining-=1→成功"{name} 生效，揭示 {N} 件目标。" | **同构（逐行对应）** | ① notFound 文案（"道具"vs"技能"）② depleted 文案（"数量不足"vs"本回合已用完"）③ 剩余/上限字段名 |
| `getItemState`/`getSkillState` | map→`{ id, name, count, initialCount }` | map→`{ id, name, remainingThisRound, maxPerRound }` | 同构 | 方法名不同（getItem vs getSkill）；返回字段名不同 |

### 1.3 关键非对称点

1. **`onNewRound` 仅 SkillManager 有**：消费方仅在技能侧调用（`bidding/index.ts:271`、`lan/game-flow.ts:78,222`、`scene/scene-run.ts:57`）。道具侧无对应方法，道具数量重置走 `syncItemManagerFromShop`（从商店桥同步，非按回合重置）。**抽象不得给 ItemManager 加 `onNewRound`**，否则改变接口语义。
2. **`ItemManager.items` 被外部直接 mutate**：`lobby/index.ts:636` 直接 `this.itemManager.items.forEach(item => { item.count = ... })`。抽象后 `items` 必须仍是公开可变数组引用。
3. **`history.ts:179` 结构类型依赖**：`renderItemDrawer` 形参声明为 `{ getItemState(): Array<{ id: string; count: number }> }`，依赖 `getItemState` 方法名与返回字段 `id`/`count`。
4. **`useAction`（#14）结构类型依赖**：`core/skill-item-manager.ts:88` 声明 `ActionManager = { use(id: string, ctx: unknown): { ok: boolean; message: string } }`，依赖 `use` 方法名与返回 `{ ok, message }` 形状。

## 2. 抽象方案

### 2.1 方案选型

| 方案 | 说明 | 评估 |
|------|------|------|
| A. 共享基类 `BaseDefManager<T>` | ItemManager/SkillManager 继承，差异部分 override（abstract getRemaining/setRemaining/notFoundMsg/depletedMsg） | **否决**。① 公开方法名不同（`getItemState` vs `getSkillState`）需子类各自别名，基类 `getState()` 无法统一；② 公开字段名不同（`items` vs `skills`）需 getter 别名，`syncItemManagerFromShop` 直接 mutate `items[].count` 要求 `items` 仍是真实数组引用；③ `onNewRound` 仅 SkillManager 有，基类放或不放都别扭；④ 需 4-5 个 abstract 桥接方法（getRemaining/setRemaining/getMax/notFoundMsg/depletedMsg）仅用于字段名/文案差异，样板代码与重复量相当；⑤ 项目数据层无基类先例（ArtifactManager 亦非继承体系） |
| B. **提取共享 helper 函数（推荐）** | `applyUse`/`resetEntries` 等函数，两 Manager 委托调用，各自保留原方法签名 | **采纳**。① 接口零改动：方法名/字段名/onNewRound 非对称全保留；② 符合项目既有"提取 helper/纯函数"模式（`useAction` in skill-item-manager.ts、Phase 2 Mixin 解耦 16 例）；③ 改动面最小、风险最低；④ helper 可独立单测 |
| C. 合并为单一泛型 Manager（配置驱动） | 一个 `DefManager<T>` 实例化两次 | **否决**。① 无法同时暴露 `items`（含 count）与 `skills`（含 remainingThisRound）两种公开字段名；② `getItemState`/`getSkillState` 方法名不同，泛型类只能有一个 getState；③ `onNewRound` 仅一侧需要；④ 破坏消费方结构类型依赖（history.ts 形参、useAction 形参）；⑤ 类型表达力下降（要么 `any` 泛滥要么泛型嵌套过深） |

### 2.2 推荐方案 B 细节

**新增文件**：`scripts/game/data/def-manager-helpers.ts`

提取以下 helper（非纯函数，有副作用：mutate 条目剩余量）：

```ts
// scripts/game/data/def-manager-helpers.ts

interface DefEntry {
  id: string
  name: string
  execute: (context: any) => { ok: boolean; revealed: number; message?: string }
}

interface RevealResult {
  ok: boolean
  revealed: number
  message: string
}

export interface UseHelperConfig<T extends DefEntry> {
  /** 条目数组（会被原地读取/修改） */
  entries: T[]
  /** 读取剩余次数 */
  getRemaining: (entry: T) => number
  /** 写入剩余次数 */
  setRemaining: (entry: T, value: number) => void
  /** id 未找到时的文案 */
  notFoundMessage: () => string
  /** 剩余耗尽时的文案 */
  depletedMessage: (entry: T) => string
}

export function applyUse<T extends DefEntry>(
  id: string,
  context: any,
  config: UseHelperConfig<T>
): RevealResult {
  const entry = config.entries.find((e) => e.id === id)
  if (!entry) {
    return { ok: false, revealed: 0, message: config.notFoundMessage() }
  }
  if (config.getRemaining(entry) <= 0) {
    return { ok: false, revealed: 0, message: config.depletedMessage(entry) }
  }
  const revealResult = entry.execute(context)
  if (!revealResult.ok) {
    return { ok: false, revealed: 0, message: revealResult.message || "揭示失败" }
  }
  config.setRemaining(entry, config.getRemaining(entry) - 1)
  return {
    ok: true,
    revealed: revealResult.revealed,
    message: `${entry.name} 生效，揭示 ${revealResult.revealed} 件目标。`
  }
}

export function resetEntries<T extends DefEntry>(
  entries: T[],
  getRemaining: (e: T) => number,  // 未使用，仅保持签名对称；实际可省去
  getMax: (e: T) => number,
  setRemaining: (e: T, v: number) => void
): void {
  entries.forEach((e) => setRemaining(e, getMax(e)))
}
```

> `resetEntries` 的 `getRemaining` 参数实际不需要（reset 只读 max 写 remaining），可省去。最终签名建议精简为 `resetEntries(entries, getMax, setRemaining)`。

**改造后 ItemManager**（保持导出 + 方法签名不变）：

```ts
export class ItemManager {
  items: ItemRuntime[]

  constructor() {
    this.items = ITEM_DEFS.map((item) => ({ ...item, count: item.initialCount }))
  }

  resetForNewRun(): void {
    resetEntries(
      this.items,
      (e) => e.initialCount,
      (e, v) => { e.count = v }
    )
  }

  use(itemId: string, context: any): RevealResult {
    return applyUse(itemId, context, {
      entries: this.items,
      getRemaining: (e) => e.count,
      setRemaining: (e, v) => { e.count = v },
      notFoundMessage: () => "道具不存在",
      depletedMessage: (e) => `${e.name} 数量不足`
    })
  }

  getItemState(): ItemState[] {
    return this.items.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      initialCount: item.initialCount
    }))
  }
}
```

**改造后 SkillManager**（保持导出 + 方法签名不变）：

```ts
export class SkillManager {
  skills: SkillRuntime[]

  constructor() {
    this.skills = SKILL_DEFS.map((skill) => ({
      ...skill,
      remainingThisRound: skill.maxPerRound
    }))
  }

  resetForNewRun(): void {
    resetEntries(
      this.skills,
      (e) => e.maxPerRound,
      (e, v) => { e.remainingThisRound = v }
    )
  }

  // onNewRound 与 resetForNewRun 行为一致（测试已断言），委托同一实现
  onNewRound(): void {
    this.resetForNewRun()
  }

  use(skillId: string, context: any): RevealResult {
    return applyUse(skillId, context, {
      entries: this.skills,
      getRemaining: (e) => e.remainingThisRound,
      setRemaining: (e, v) => { e.remainingThisRound = v },
      notFoundMessage: () => "技能不存在",
      depletedMessage: (e) => `${e.name} 本回合已用完`
    })
  }

  getSkillState(): SkillState[] {
    return this.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      remainingThisRound: skill.remainingThisRound,
      maxPerRound: skill.maxPerRound
    }))
  }
}
```

**不动部分**：
- `getItemState`/`getSkillState` 逻辑过于简单（单层 `.map` 映射字段），且返回字段名不同，提取通用 `mapState` 反而增加配置开销，**不提取**。
- `constructor` 仅一行 map，字段名不同，**不提取**。
- `ITEM_DEFS`/`SKILL_DEFS` 数据定义不动。

## 3. 可提取纯函数 / helper 清单

| helper | 类型 | 位置 | 说明 |
|--------|------|------|------|
| `applyUse<T>(id, context, config)` | 非纯（mutate 条目剩余量） | `data/def-manager-helpers.ts` | 统一 use 流程：find→depleted 检查→execute→扣减→成功消息。配置项驱动字段访问与文案 |
| `resetEntries<T>(entries, getMax, setRemaining)` | 非纯（mutate 条目剩余量） | `data/def-manager-helpers.ts` | 统一 reset 流程：forEach setRemaining=getMax |

> 这两个 helper 有副作用（修改条目对象的剩余次数字段），不符合项目 `pure.ts` 纯函数约定，因此放入 `def-manager-helpers.ts` 而非 `pure.ts`。与 `core/skill-item-manager.ts` 中 `useAction`（同样非纯、有副作用）的定位一致。

## 4. 对外接口不变性确认

| 接口要素 | 改造前 | 改造后 | 消费方影响 |
|---------|--------|--------|-----------|
| `export class ItemManager` | 是 | 是（仍命名导出） | 无 |
| `export class SkillManager` | 是 | 是 | 无 |
| `export const ITEM_DEFS` / `SKILL_DEFS` | 是 | 是（不动） | 无 |
| `new ItemManager()` / `new SkillManager()` | 无参构造 | 无参构造（不变） | `scene/warehouse-scene.ts:281-282` 无改动 |
| `ItemManager.items`（公开可变数组） | 是 | 是（仍是公开字段） | `lobby/index.ts:636` 直接 mutate `items[].count` 不受影响 |
| `SkillManager.skills`（公开可变数组） | 是 | 是 | 无外部 mutate |
| `itemManager.use(id, ctx)` 返回 `{ ok, revealed, message }` | 是 | 是（applyUse 返回同形状） | `useAction`（skill-item-manager.ts:132）结构类型 `{ use(id,ctx): { ok, message } }` 满足 |
| `skillManager.use(id, ctx)` 同上 | 是 | 是 | 同上 |
| `itemManager.resetForNewRun()` | 是 | 是（委托 resetEntries） | 无外部调用 ItemManager.resetForNewRun（grep 无命中） |
| `skillManager.resetForNewRun()` | 是 | 是 | `lan/game-flow.ts:221`、`scene/scene-run.ts:56` 无改动 |
| `skillManager.onNewRound()` | 是 | 是（委托 resetForNewRun） | `bidding/index.ts:271`、`lan/game-flow.ts:78,222`、`scene/scene-run.ts:57` 无改动 |
| `itemManager.getItemState()` 返回 `{ id, name, count, initialCount }[]` | 是 | 是（不提取，原样保留） | `history.ts:184`、`scene-hud.ts:70` 无改动 |
| `skillManager.getSkillState()` 返回 `{ id, name, remainingThisRound, maxPerRound }[]` | 是 | 是（不提取） | `scene-hud.ts:69` 无改动 |
| `ItemManager` 无 `onNewRound` | 是 | 是（不加） | 保持非对称语义 |

**结论**：消费方零改动。所有 11 处消费点（见 §1.3 + grep 结果）均不受影响。

## 5. 行为保持

- `use` 逻辑逐字等价：find 失败→notFound 文案；剩余<=0→depleted 文案且 **不调用 execute**（applyUse 在 execute 前短路）；execute 返回 !ok→"揭示失败"且 **不扣减**；成功→扣减 1 + "{name} 生效，揭示 {N} 件目标。"
- `resetForNewRun` 逻辑逐字等价：forEach 置剩余=上限。
- `onNewRound` 改为委托 `resetForNewRun()`，行为与原"独立 forEach"完全一致（原方法体本就与 resetForNewRun 字节相同，测试 `skills.test.ts:55-62` 已断言二者行为一致）。
- `getItemState`/`getSkillState` 不提取，逻辑不变，返回字段名/顺序不变。
- 成功消息模板 `${name} 生效，揭示 ${revealed} 件目标。` 两 Manager 原本就相同，提取后沿用。
- 失败回退文案 `revealResult.message || "揭示失败"` 两 Manager 原本就相同，提取后沿用。

## 6. 测试影响

### 6.1 现有测试（不改动，应全绿）

| 测试文件 | 用例数 | 改造后期望 |
|---------|--------|-----------|
| `tests/game/data/items.test.ts` | 9（ITEM_DEFS 3 + ItemManager 6） | 全绿，断言原样通过 |
| `tests/game/data/skills.test.ts` | 10（SKILL_DEFS 3 + SkillManager 7） | 全绿，断言原样通过 |

关键断言等价性核对：
- `items.test.ts:66-79` "use 数量不足返回失败且不调用 execute"：applyUse 在 `getRemaining(entry) <= 0` 时直接返回，不调用 `entry.execute`，等价。
- `items.test.ts:81-89` "use execute 失败时不扣减 count"：applyUse 在 `!revealResult.ok` 时直接返回，不调用 `setRemaining`，等价。
- `items.test.ts:91-101` "use 成功扣减 count 并返回揭示信息"：applyUse 成功路径 `setRemaining(entry, getRemaining(entry) - 1)` 即 `count -= 1`，等价。
- `skills.test.ts:55-62` "onNewRound 重置已消耗技能（与 resetForNewRun 行为一致）"：委托后 `onNewRound` 调 `resetForNewRun`，行为一致，等价。
- `skills.test.ts:72-85` "use 本回合已用完返回失败且不调用 execute"：同 items 逻辑，等价。

### 6.2 新增测试（可选，推荐）

为 `def-manager-helpers.ts` 的 `applyUse`/`resetEntries` 新增独立单测 `tests/game/data/def-manager-helpers.test.ts`，覆盖：
- `applyUse`：notFound / depleted 短路（不调 execute）/ execute 失败不扣减 / 成功扣减 + 消息模板
- `resetEntries`：全量重置为 max

> 因两 Manager 的现有测试已间接覆盖 helper 的所有路径，新增单测非必需，但符合项目"helper 可独立测试"约定。若新增，用例数 +N（预计 6-8），无覆盖损失。

## 7. 验证

改造完成后执行：

```bash
npx tsc --noEmit          # 期望 0 error（警告忽略；非本任务文件可能有并行流瞬时错误）
npm run test              # 期望：现有 19 用例全绿；若新增 helper 单测则总数 +N
npm run lint              # 期望 0 error
npx prettier --check scripts/game/data/items.ts scripts/game/data/skills.ts scripts/game/data/def-manager-helpers.ts
```

**重点核查**：
- `tests/game/data/items.test.ts` + `tests/game/data/skills.test.ts` 全绿（等价性直接验证）
- `syncItemManagerFromShop`（lobby/index.ts:636）仍能直接 mutate `itemManager.items[].count`（tsc 类型检查通过即可确认）
- `useAction`（core/skill-item-manager.ts:132）调用 `manager.use(actionId, context)` 返回值形状不变

## 8. 风险点

| 风险 | 等级 | 说明与缓解 |
|------|------|-----------|
| `applyUse` 泛型 + 配置对象类型推断失败 | 低 | `T extends DefEntry` 约束 + 显式 config 字段，tsc 可推断；若有推断问题，Manager 调用处显式标注 `applyUse<ItemRuntime>(...)` |
| `onNewRound` 委托 `resetForNewRun` 改变调用栈 | 极低 | 行为等价（原方法体字节相同）；测试 `skills.test.ts:55-62` 直接验证；若有调试需要，栈多一层无功能影响 |
| `ItemManager.items` 被 `syncItemManagerFromShop` 外部 mutate 与 helper 共享数组引用 | 低 | helper 接收 `entries` 引用即 `this.items`，mutate 同一对象，与原行为一致；`resetEntries` 也操作同一数组 |
| 消费方结构类型依赖被破坏 | 低（已规避） | `getItemState`/`getSkillState`/`use` 签名与返回形状全部保留；history.ts / useAction 形参结构类型仍满足 |
| 并行流文件冲突 | 低 | 本任务涉及 `data/items.ts` + `data/skills.ts` + 新建 `data/def-manager-helpers.ts`，均为数据层独立文件，与当前并行重构流（core/llm/scene）无重叠 |
| ROI 偏低 | 中（非风险，但影响执行决策） | 去重 ~31 行，新增 ~40 行 helper + 配置。主要收益是 use 逻辑单点维护 + SkillManager 内字节级重复消除。若团队判断收益不足，**可仅做 SkillManager 内 `onNewRound` 委托 `resetForNewRun` 的最小去重**（1 行改动），跳过跨类 helper 提取 |

## 9. 实施顺序建议

1. 新建 `scripts/game/data/def-manager-helpers.ts`，定义 `DefEntry`/`RevealResult`/`UseHelperConfig` 类型 + `applyUse`/`resetEntries` 函数
2. 改 `data/items.ts`：`ItemManager.use` 委托 `applyUse`，`resetForNewRun` 委托 `resetEntries`；删除 `RevealResult` 接口本地定义改为 import（或保留本地定义，二者结构相同）
3. 改 `data/skills.ts`：`SkillManager.use` 委托 `applyUse`，`resetForNewRun` 委托 `resetEntries`，`onNewRound` 委托 `this.resetForNewRun()`；删除 `RevealResult` 接口本地定义改为 import
4. 跑验证（§7）
5. （可选）新增 `tests/game/data/def-manager-helpers.test.ts`

预计改动：2 生产文件改造 + 1 新建生产文件 + 0-1 新建测试文件，净增 ~40 行（helper）- ~31 行（去重）= 净 +~9 行，但重复逻辑归一。

## 10. 备选：最小化执行方案（若判断 ROI 不足）

若团队评估跨类 helper 提取收益不足以抵消间接开销，可仅执行**最小去重**：

- **仅**改 `data/skills.ts`：`onNewRound()` 方法体改为 `this.resetForNewRun()`（消除字节级重复，1 行改动）
- 不新建 helper 文件，不动 `use`/`resetForNewRun`

此方案零接口风险、零新文件、1 行改动，消除最明确的重复。跨类 `use`/`reset` 同构留待后续若需新增第三类 DefManager 时再提取。
