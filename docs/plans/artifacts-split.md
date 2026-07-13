# data/artifacts.ts 拆分方案

> 创建时间：2026-07-13
> 状态：计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/game/data/artifacts.ts`（1148 行，藏品图鉴数据 + 品质配置 + ArtifactManager 类 + 统计纯函数混杂）按"薄入口 + 子目录 + re-export 纯函数"结构拆分，参照已落地的 `ai/intel.ts` + `ai/intel/` 模式。
> task-list #29：数据定义与 ArtifactManager/统计函数混杂

---

## 一、现状分析

### 1.1 文件形态

`artifacts.ts` 是 `data/` 目录中最大的文件（1148 行），远超同目录的 `items.ts`（208 行）和 `skills.ts`（128 行）。文件混合了四类职责：品质配置常量、藏品图鉴数据（73 件）、ArtifactManager 类（有状态实例管理）、统计/工具纯函数。与 `items.ts`/`skills.ts` 的"数据 + 管理器同文件"小文件模式不同，artifacts.ts 的规模（5-9 倍于同类文件）已达到 God Object 级别，需要完整拆分。

文件结构：

| 部分 | 行号 | 行数 | 内容 |
|------|------|------|------|
| 文件头 JSDoc | L1-L42 | 42 | 模块描述、数据结构说明、品类分布（注：头部提到"挂载到 window.ArtifactData"为历史遗留，实际已是纯 ES Module export，无 window 赋值） |
| `QUALITY_CONFIG` | L43-L49 | 7 | 品质配置（5 等级：label/color/glow/weight） |
| `SIZE_TAG_BY_DIMENSION` | L51-L61 | 11 | 尺寸标签映射（9 种尺寸） |
| `ARTIFACT_LIBRARY` | L63-L815 | 753 | 藏品图鉴数据数组（73 件藏品定义） |
| `CATEGORY_WEIGHTS` | L817-L830 | 14 | 品类权重（10 品类，权重和 100） |
| `ArtifactManager` 类 | L832-L981 | 150 | 1 属性（counter）+ 6 方法 |
| `estimatePriceByQuality` | L983-L994 | 12 | 品质价格估算（poor×0.72 ~ legendary×1.85） |
| `signalToRevealState` | L996-L1008 | 13 | 信号转揭示状态 |
| `summarizeCandidatePrices` | L1010-L1053 | 44 | 候选价格统计（均值/分位数/离散度/边缘比） |
| `summarizeStatsCollection` | L1055-L1079 | 25 | 多组统计的加权聚合 |
| `emptyPriceStats`（私有） | L1081-L1097 | 17 | 零值统计对象工厂 |
| `quantileSorted`（私有） | L1099-L1114 | 16 | 已排序数组分位数计算 |
| `toSizeTag` | L1116-L1118 | 3 | 尺寸转标签 |
| `canPlaceRect`（私有） | L1120-L1134 | 15 | 矩形放置检测 |
| `weightedPick`（私有） | L1136-L1148 | 13 | 按权重随机选择 |

按职责分组汇总：

| 职责分类 | 行号范围 | 行数 | 包含的导出 |
|----------|----------|------|-----------|
| 配置常量 | L43-L61, L817-L830 | 32 | `QUALITY_CONFIG`, `SIZE_TAG_BY_DIMENSION`, `CATEGORY_WEIGHTS` |
| 藏品图鉴数据 | L63-L815 | 753 | `ARTIFACT_LIBRARY`（73 件） |
| ArtifactManager 类 | L832-L981 | 150 | `ArtifactManager` |
| 统计/工具纯函数（导出） | L983-L1079, L1116-L1118 | 97 | `estimatePriceByQuality`, `signalToRevealState`, `summarizeCandidatePrices`, `summarizeStatsCollection`, `toSizeTag` |
| 私有辅助函数 | L1081-L1114, L1120-L1148 | 61 | `emptyPriceStats`, `quantileSorted`, `canPlaceRect`, `weightedPick` |

### 1.2 藏品图鉴分布（73 件）

| 大类 | 品类 | 数量 |
|------|------|------|
| 古董 | 瓷器 | 7 |
| 古董 | 玉器 | 6 |
| 古董 | 书画 | 6 |
| 古董 | 铜器 | 6 |
| 古董 | 木器 | 6 |
| 古董 | 金石 | 6 |
| 珠宝首饰 | 宝石 | 8 |
| 珠宝首饰 | 有机宝石 | 6 |
| 珠宝首饰 | 贵金属 | 8 |
| 珠宝首饰 | 镶嵌饰品 | 14 |
| **合计** | | **73** |

### 1.3 对外接口（拆分后必须保持不变）

| 消费方 | 导入路径 | 导入内容 |
|--------|----------|----------|
| `scripts/game/scene/warehouse-scene.ts` L42 | `from "../data/artifacts"` | `ArtifactManager` |
| `scripts/game/warehouse/core.ts` L27 | `from "../data/artifacts"` | `ARTIFACT_LIBRARY` |
| `scripts/game/warehouse/preview.ts` L18 | `from "../data/artifacts"` | `toSizeTag`, `QUALITY_CONFIG` |
| `scripts/game/ai/context-builder.ts` L29 | `from "../data/artifacts"` | `QUALITY_CONFIG`, `ARTIFACT_LIBRARY` |
| `scripts/game/ai/intel/reveal.ts` L26 | `from "../../data/artifacts"` | `QUALITY_CONFIG`, `ARTIFACT_LIBRARY`, `toSizeTag` |
| `scripts/game/ai/intel/panel.ts` L15 | `from "../../data/artifacts"` | `QUALITY_CONFIG`, `ARTIFACT_LIBRARY`, `toSizeTag` |
| `scripts/game/bridge/battle-record/restore.ts` L11 | `from "../../data/artifacts"` | `QUALITY_CONFIG` |
| `scripts/game/lobby/index.ts` L43 | `from "../data/artifacts"` | `ARTIFACT_LIBRARY` |
| `scripts/game/lobby/collection.ts` L25 | `from "../data/artifacts"` | `QUALITY_CONFIG`, `ARTIFACT_LIBRARY` |
| `scripts/game/lan/sync.ts` L16 | `from "../data/artifacts"` | `QUALITY_CONFIG` |
| `scripts/llm/core/llm-prompt.ts` L13 | `from '../../game/data/artifacts'` | `QUALITY_CONFIG` |
| `tests/game/data/artifacts.test.ts` L2-L13 | `from '../../../scripts/game/data/artifacts'` | `QUALITY_CONFIG`, `SIZE_TAG_BY_DIMENSION`, `ARTIFACT_LIBRARY`, `CATEGORY_WEIGHTS`, `ArtifactManager`, `estimatePriceByQuality`, `signalToRevealState`, `summarizeCandidatePrices`, `summarizeStatsCollection`, `toSizeTag`（10 个符号） |
| `tests/game/ai/context-builder.test.ts` L11 | `from '../../../scripts/game/data/artifacts'` | `QUALITY_CONFIG` |

**纯函数外部使用情况**：`estimatePriceByQuality`、`signalToRevealState`、`summarizeCandidatePrices`、`summarizeStatsCollection` 这 4 个导出函数在源码中仅被 `ArtifactManager` 类方法内部调用（`getCandidateStatsByRevealState`、`getSignalPriceStats`），无其他源码消费方直接导入。它们在测试中被独立测试。拆分后这些函数从 `pure.ts` 导出，经 `artifacts.ts` 薄入口 re-export，测试文件零改动。

### 1.4 模块解析关键点

采用与 `ai/intel.ts` + `ai/intel/` 完全一致的**方案 A**：保留 `artifacts.ts` 作为薄入口（~40 行），新建 `artifacts/` 兄弟目录存放子模块。

- `artifacts.ts` 与 `artifacts/` 目录共存（同 `intel.ts` + `intel/` 模式）。
- 导入路径 `"../data/artifacts"` 仍解析到 `artifacts.ts` 文件（文件优先于目录 index）。
- 因此所有消费方（warehouse-scene、tests 等）**均无需改动**。

---

## 二、ArtifactManager 方法清单与依赖分析

### 2.1 类属性

| # | 属性 | 行号 | 类型 | 职责 |
|---|------|------|------|------|
| 1 | `counter` | L833 | `number` | 自增 ID 计数器，`buildArtifactFromDef` 每次调用递增 |

### 2.2 类方法

| # | 方法 | 行号 | 行数 | this 状态 | 依赖的模块级符号 | 纯/DOM | 拆分去向 |
|---|------|------|------|-----------|------------------|--------|----------|
| 1 | `constructor` | L835-L837 | 3 | counter | 无 | 纯赋值 | manager.ts |
| 2 | `createRandomArtifact` | L839-L844 | 6 | 无 | `CATEGORY_WEIGHTS`, `ARTIFACT_LIBRARY`, `weightedPick` | 纯 | manager.ts |
| 3 | `createRandomArtifactForSlot` | L846-L892 | 47 | 无 | `ARTIFACT_LIBRARY`, `CATEGORY_WEIGHTS`, `canPlaceRect`, `weightedPick` | 纯 | manager.ts |
| 4 | `buildArtifactFromDef` | L894-L911 | 18 | counter | `QUALITY_CONFIG` | 纯 | manager.ts |
| 5 | `getCandidatesByRevealState` | L913-L939 | 27 | 无 | `ARTIFACT_LIBRARY`, `QUALITY_CONFIG`, `toSizeTag` | 纯 | manager.ts |
| 6 | `getCandidateStatsByRevealState` | L941-L944 | 4 | 无（委托 #5） | `summarizeCandidatePrices` | 纯 | manager.ts |
| 7 | `getSignalPriceStats` | L946-L968 | 23 | 无（委托 #5） | `signalToRevealState`, `summarizeCandidatePrices`, `summarizeStatsCollection` | 纯 | manager.ts |
| 8 | `getLibraryStats` | L970-L980 | 11 | 无 | `ARTIFACT_LIBRARY` | 纯 | manager.ts |

**关键发现**：ArtifactManager 所有方法均为纯函数（无 DOM、无网络、无 Phaser 依赖）。唯一的有状态操作是 `counter` 自增（`buildArtifactFromDef`）。方法间仅通过 `this.getCandidatesByRevealState` / `this.getCandidateStatsByRevealState` 互相委托。

---

## 三、可提取纯函数

### 3.1 已导出的纯函数（5 个）

| 函数 | 行号 | 行数 | 参数 | 依赖 | 说明 |
|------|------|------|------|------|------|
| `estimatePriceByQuality` | L983-L994 | 12 | `(basePrice: number, qualityKey: string)` | 无（内含 multiplierMap） | 品质价格估算，完全自包含 |
| `signalToRevealState` | L996-L1008 | 13 | `(signal: Record)` | 无 | 信号字段提取，完全自包含 |
| `summarizeCandidatePrices` | L1010-L1053 | 44 | `(candidates: any[])` | `emptyPriceStats`, `quantileSorted` | 价格统计，依赖 2 个私有辅助 |
| `summarizeStatsCollection` | L1055-L1079 | 25 | `(statsList: any[])` | `emptyPriceStats` | 加权聚合，依赖 1 个私有辅助 |
| `toSizeTag` | L1116-L1118 | 3 | `(w: number, h: number)` | `SIZE_TAG_BY_DIMENSION` | 尺寸转标签，依赖配置常量 |

### 3.2 当前私有函数（4 个，拆分后需在 pure.ts 内导出或保持私有）

| 函数 | 行号 | 行数 | 当前可见性 | 拆分后可见性 | 被谁使用 |
|------|------|------|-----------|-------------|----------|
| `emptyPriceStats` | L1081-L1097 | 17 | 模块私有 | pure.ts 内私有 | `summarizeCandidatePrices`, `summarizeStatsCollection`（均在 pure.ts） |
| `quantileSorted` | L1099-L1114 | 16 | 模块私有 | pure.ts 内私有 | `summarizeCandidatePrices`（在 pure.ts） |
| `canPlaceRect` | L1120-L1134 | 15 | 模块私有 | pure.ts 导出（内部） | `ArtifactManager.createRandomArtifactForSlot`（在 manager.ts） |
| `weightedPick` | L1136-L1148 | 13 | 模块私有 | pure.ts 导出（内部） | `ArtifactManager.createRandomArtifact`, `createRandomArtifactForSlot`（在 manager.ts） |

**说明**：`canPlaceRect` 和 `weightedPick` 需要从 `pure.ts` 导出供 `manager.ts` 导入，但**不**经 `artifacts.ts` 薄入口 re-export，以保持公共 API 不变。`emptyPriceStats` 和 `quantileSorted` 仅被 pure.ts 内部函数使用，保持文件内私有即可。

---

## 四、拆分方案

### 推荐：方案 A -- 完整拆分为 `data/artifacts/` 子目录

#### 目标文件结构

```
scripts/game/data/
├── artifacts.ts              # 薄入口（~40 行），re-export 全部公共 API
├── artifacts/
│   ├── config.ts             # 品质配置常量（QUALITY_CONFIG, SIZE_TAG_BY_DIMENSION, CATEGORY_WEIGHTS）
│   ├── library.ts            # 藏品图鉴数据（ARTIFACT_LIBRARY，73 件）
│   ├── pure.ts               # 统计/工具纯函数（9 个函数，5 导出 + 2 内部导出 + 2 私有）
│   └── manager.ts            # ArtifactManager 类（1 属性 + 8 方法）
├── items.ts                  # 不变
├── skills.ts                 # 不变
├── characters.ts             # 不变
└── character-system.ts       # 不变
```

#### 各子模块内容与行数预估

| 子模块 | 来源行号 | 预估行数 | 内容 | 导出 |
|--------|----------|----------|------|------|
| `config.ts` | L43-L61, L817-L830 | ~35 | `QUALITY_CONFIG`, `SIZE_TAG_BY_DIMENSION`, `CATEGORY_WEIGHTS` + 文件头注释 | 3 个常量 |
| `library.ts` | L63-L815 | ~760 | `ARTIFACT_LIBRARY`（73 件藏品定义）+ 文件头注释 | 1 个数组 |
| `pure.ts` | L983-L1114, L1116-L1148 | ~155 | `estimatePriceByQuality`, `signalToRevealState`, `summarizeCandidatePrices`, `summarizeStatsCollection`, `toSizeTag`, `canPlaceRect`, `weightedPick`（导出）+ `emptyPriceStats`, `quantileSorted`（私有）+ import `SIZE_TAG_BY_DIMENSION` | 7 个函数（5 公共 + 2 内部） |
| `manager.ts` | L832-L981 | ~170 | `ArtifactManager` 类 + import from config/library/pure | 1 个类 |
| `artifacts.ts` | 新建 | ~40 | 薄入口：re-export 全部 10 个公共符号 | re-export |

#### 依赖关系图（无循环依赖）

```
config.ts ─── QUALITY_CONFIG, SIZE_TAG_BY_DIMENSION, CATEGORY_WEIGHTS
               │
               ├──> pure.ts      （toSizeTag 依赖 SIZE_TAG_BY_DIMENSION）
               └──> manager.ts   （QUALITY_CONFIG, CATEGORY_WEIGHTS）

library.ts ─── ARTIFACT_LIBRARY
               │
               └──> manager.ts   （筛选、统计、getLibraryStats）

pure.ts ─────── estimatePriceByQuality     （独立）
                signalToRevealState         （独立）
                summarizeCandidatePrices    → emptyPriceStats, quantileSorted（内部私有）
                summarizeStatsCollection    → emptyPriceStats（内部私有）
                toSizeTag                   → SIZE_TAG_BY_DIMENSION（config.ts）
                canPlaceRect                （独立，导出供 manager 用）
                weightedPick                （独立，导出供 manager 用）
               │
               └──> manager.ts              （weightedPick, canPlaceRect, toSizeTag,
                                              summarizeCandidatePrices, signalToRevealState,
                                              summarizeStatsCollection）

manager.ts ─── ArtifactManager
                imports: config.ts, library.ts, pure.ts

artifacts.ts ── 薄入口 re-export（不含逻辑，仅 re-export 公共 API）
                re-export from: config.ts, library.ts, pure.ts, manager.ts
```

#### 薄入口 artifacts.ts 示意

```typescript
/**
 * @file data/artifacts.ts
 * @module data/artifacts
 * @description 藏品数据薄入口。re-export 品质配置、藏品图鉴、ArtifactManager、统计纯函数。
 *              原 1148 行已按职责拆分到 artifacts/ 目录（config/library/pure/manager）。
 */
export { QUALITY_CONFIG, SIZE_TAG_BY_DIMENSION, CATEGORY_WEIGHTS } from "./artifacts/config"
export { ARTIFACT_LIBRARY } from "./artifacts/library"
export {
  estimatePriceByQuality,
  signalToRevealState,
  summarizeCandidatePrices,
  summarizeStatsCollection,
  toSizeTag
} from "./artifacts/pure"
export { ArtifactManager } from "./artifacts/manager"
```

### 备选：方案 B -- 仅提取纯函数到 pure.ts

仅将 5 个导出纯函数 + 4 个私有辅助函数提取到 `artifacts/pure.ts`，`ARTIFACT_LIBRARY` + 配置常量 + `ArtifactManager` 保留在 `artifacts.ts`。

- 优点：改动最小，风险最低
- 缺点：`artifacts.ts` 仍有 ~990 行（配置 + 数据 + 管理器混杂），未根本解决 God Object 问题；与项目已落地的拆分模式（intel/、bidding/、overlay/ 均为完整拆分）不一致

### 推荐理由（方案 A）

1. **规模达标**：1148 行远超 items.ts（208 行）/ skills.ts（128 行），是 data/ 目录最大的文件，值得完整拆分
2. **模式一致**：与已落地的 `ai/intel.ts` + `ai/intel/`（1673 行 -> 39 行薄入口）、`ai/bidding/`（1213 行 -> 类入口 + 子目录）模式完全一致
3. **职责清晰**：四类职责（配置 / 数据 / 纯函数 / 管理器）物理分离，各自可独立维护
4. **数据文件独立**：ARTIFACT_LIBRARY 占 753 行（66%），是纯数据，独立为 `library.ts` 后可快速定位和编辑藏品定义
5. **零消费方改动**：薄入口 re-export 保持所有 13 个导入点的路径和符号不变

---

## 五、行为保持

拆分严格遵循"纯代码移动，零逻辑变更"原则：

1. **ARTIFACT_LIBRARY**：数组内容、顺序、对象字段完全不变（73 件藏品定义原样搬迁）
2. **QUALITY_CONFIG / SIZE_TAG_BY_DIMENSION / CATEGORY_WEIGHTS**：常量值不变
3. **ArtifactManager**：类名、属性（counter）、方法签名、方法体、this 语义完全不变
4. **纯函数**：函数签名、实现、返回值完全不变
5. **私有函数**：`emptyPriceStats`、`quantileSorted` 保持 pure.ts 内私有；`canPlaceRect`、`weightedPick` 从模块私有变为 pure.ts 导出（但不经薄入口 re-export，公共 API 不变）
6. **无 window 赋值**：文件头注释提到的 `window.ArtifactData` 为历史遗留，实际代码已是纯 ES Module export，拆分不影响任何全局变量

---

## 六、测试影响

### 6.1 测试文件零改动

| 测试文件 | 导入路径 | 影响 |
|----------|----------|------|
| `tests/game/data/artifacts.test.ts` | `from '../../../scripts/game/data/artifacts'` | **无改动**。10 个导入符号（QUALITY_CONFIG, SIZE_TAG_BY_DIMENSION, ARTIFACT_LIBRARY, CATEGORY_WEIGHTS, ArtifactManager, estimatePriceByQuality, signalToRevealState, summarizeCandidatePrices, summarizeStatsCollection, toSizeTag）全部经薄入口 re-export |
| `tests/game/ai/context-builder.test.ts` | `from '../../../scripts/game/data/artifacts'` | **无改动**。导入 `QUALITY_CONFIG` 经薄入口 re-export |

### 6.2 测试覆盖情况（现有测试已充分覆盖拆分后的各子模块）

| 子模块 | 对应测试 | 覆盖用例 |
|--------|----------|----------|
| `config.ts` | artifacts.test.ts `QUALITY_CONFIG` / `SIZE_TAG_BY_DIMENSION` / `CATEGORY_WEIGHTS` describe 块 | 5 等级完整性、字段完整性、权重和 100、尺寸映射、品类映射 |
| `library.ts` | artifacts.test.ts `ARTIFACT_LIBRARY` describe 块 | 数量 >= 60、字段完整性、qualityKey 合法性、key 唯一性、majorCategory 范围 |
| `pure.ts` | artifacts.test.ts `estimatePriceByQuality` / `signalToRevealState` / `toSizeTag` / `summarizeCandidatePrices` / `summarizeStatsCollection` describe 块 | 品质倍率、信号提取、尺寸转换、空数组/单元素/多元素统计、加权聚合、过滤 |
| `manager.ts` | artifacts.test.ts `ArtifactManager` describe 块 | buildArtifactFromDef 自增 ID、默认值、getCandidatesByRevealState 筛选、getCandidateStatsByRevealState 统计、getLibraryStats |

---

## 七、验证

拆分完成后依次执行：

```bash
# 1. 类型检查（确认 import/export 解析正确，无类型错误）
npx tsc --noEmit

# 2. 全量测试（确认行为不变，特别关注 artifacts.test.ts 的 30+ 用例）
npm run test

# 3. ESLint（确认无新 warning）
npm run lint

# 4. Prettier 格式检查（确认新文件符合代码风格）
npx prettier --check scripts/game/data/artifacts.ts scripts/game/data/artifacts/config.ts scripts/game/data/artifacts/library.ts scripts/game/data/artifacts/pure.ts scripts/game/data/artifacts/manager.ts
```

验证通过标准：
- `tsc --noEmit`：artifacts 相关文件 0 错误（其他并行流的瞬时错误不回退本任务改动）
- `npm run test`：artifacts.test.ts 全部用例通过，全量测试无新增失败
- `npm run lint`：新增文件 0 error
- `prettier --check`：新增文件全部通过

---

## 八、风险点

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|----------|
| 模块解析冲突 | 低 | `artifacts.ts` 文件与 `artifacts/` 目录共存时，`import "./artifacts"` 优先解析到文件 | 与 `intel.ts` + `intel/` 模式完全一致，已有 6+ 个先例（intel/bidding/overlay/character-select/warehouse 等），TypeScript 文件优先于目录 index 是稳定行为 |
| 循环依赖 | 低 | manager.ts 依赖 config.ts + library.ts + pure.ts；pure.ts 依赖 config.ts；无反向依赖 | 依赖关系为单向 DAG（见四.依赖图），无循环 |
| 公共 API 泄漏 | 低 | `canPlaceRect`、`weightedPick` 从模块私有变为 pure.ts 导出 | 不经薄入口 artifacts.ts re-export，外部消费方无法从 `data/artifacts` 导入这两个函数，公共 API 不变 |
| 藏品数据搬迁错误 | 低 | 73 件藏品定义手工搬迁可能遗漏或修改 | 原样 cut/paste，不做格式调整；测试用例覆盖数量、key 唯一性、字段完整性 |
| 并行流冲突 | 低 | 其他重构流可能同时修改消费方文件 | 本任务只新建 `artifacts/` 目录 + 改写 `artifacts.ts`，不碰消费方文件；若 tsc 报其他文件错误，属并行流瞬时状态 |

---

## 九、是否分阶段

**建议单阶段执行**，原因：

1. **纯代码移动**：无逻辑变更，无行为变更，无接口变更
2. **单文件域**：只涉及 `data/artifacts.ts` 一个文件拆分 + 新建 4 个子文件，文件域隔离
3. **测试即验证**：现有 30+ 测试用例覆盖全部子模块，拆分后一次性验证即可
4. **风险可控**：依赖关系简单（单向 DAG），无复杂重构

如需分阶段，可按以下顺序：
- **阶段 1**：提取 `pure.ts`（9 个函数），artifacts.ts import pure.ts 并 re-export -- 最有价值的部分（纯函数独立可测）
- **阶段 2**：提取 `config.ts` + `library.ts` + `manager.ts`，artifacts.ts 改为薄入口 -- 完成拆分

但分阶段无额外收益（中间状态 artifacts.ts 仍是混合文件），建议一步到位。

---

## 十、附录：各部分行数汇总

| 部分 | 行号 | 行数 | 占比 | 拆分去向 |
|------|------|------|------|----------|
| 文件头注释 | L1-L42 | 42 | 3.7% | 删除（各子模块各写自己的简短头注释） |
| QUALITY_CONFIG | L43-L49 | 7 | 0.6% | config.ts |
| SIZE_TAG_BY_DIMENSION | L51-L61 | 11 | 1.0% | config.ts |
| ARTIFACT_LIBRARY | L63-L815 | 753 | 65.6% | library.ts |
| CATEGORY_WEIGHTS | L817-L830 | 14 | 1.2% | config.ts |
| ArtifactManager 类 | L832-L981 | 150 | 13.1% | manager.ts |
| estimatePriceByQuality | L983-L994 | 12 | 1.0% | pure.ts |
| signalToRevealState | L996-L1008 | 13 | 1.1% | pure.ts |
| summarizeCandidatePrices | L1010-L1053 | 44 | 3.8% | pure.ts |
| summarizeStatsCollection | L1055-L1079 | 25 | 2.2% | pure.ts |
| emptyPriceStats（私有） | L1081-L1097 | 17 | 1.5% | pure.ts（保持私有） |
| quantileSorted（私有） | L1099-L1114 | 16 | 1.4% | pure.ts（保持私有） |
| toSizeTag | L1116-L1118 | 3 | 0.3% | pure.ts |
| canPlaceRect（私有） | L1120-L1134 | 15 | 1.3% | pure.ts（导出，内部用） |
| weightedPick（私有） | L1136-L1148 | 13 | 1.1% | pure.ts（导出，内部用） |
| 空行/间隔 | - | ~3 | 0.3% | - |
| **合计** | L1-L1148 | **1148** | **100%** | - |
