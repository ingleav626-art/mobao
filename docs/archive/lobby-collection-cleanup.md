# lobby/index.ts 收藏图鉴逻辑清理计划（task-list #19）

> 2026-07-12 调查。目标：清理 `scripts/game/lobby/index.ts`（908 行）混入的收藏图鉴逻辑，
> 解决与 `scripts/game/ui/overlay/collection.ts` 的重复，消除死代码，使 lobby/index.ts 变薄。
> **本任务只调查 + 写计划，不改代码。**

## 一、背景

task-list #19：`lobby/index.ts`（908 行）混入收藏图鉴逻辑 `initCollectionPanel` / `renderCollectionGrid`。

S21 overlay 拆分（已落地）把一组收藏方法迁到 `ui/overlay/collection.ts`（`CollectionMixin`），
但 `lobby/index.ts` 原有的一组收藏方法**未删除**，导致两组并存。需查清是重复还是不同场景。

## 二、现状调查

### 2.1 两组方法清单

| 方法 | lobby/index.ts | ui/overlay/collection.ts |
|------|----------------|--------------------------|
| `openCollectionOverlay` | L669-L693 | L20-L39 |
| `closeCollectionOverlay` | L695-L705 | L41-L53 |
| `initCollectionPanel` | L723-L766 | L55-L84 |
| `getCollectionCategories`（实例方法，包装纯函数）| L768-L770 | L86-L88 |
| `renderCollectionGrid` | L772-L817 | L90-L135 |
| `_destroyCustomSelect` | L707-L714 | 无 |
| `_rebuildCustomSelect` | L716-L721 | 无 |
| `sortCollectionItems`（独立纯函数）| L62-L83 | 无 |

### 2.2 两组方法差异（逐方法对比）

| 维度 | lobby/index.ts 版 | overlay/collection.ts 版 |
|------|-------------------|--------------------------|
| **开闭动画** | `animateOverlayOpen(overlay, panel)` / `animateOverlayClose(overlay, panel)`（传 panel） | `animateOverlayOpen(overlay)` / `animateOverlayClose(overlay, null, cb)`（不传 panel，关闭后清 style） |
| **防重复绑定标志** | `_boundClose` / `_boundOverlayClose`（两个标志） | `_collectionBound`（一个标志），且 `overlay.onclick =` 直接赋值（会覆盖既有 handler） |
| **排序** | 有 `collectionSortFilter` 下拉 + `sortCollectionItems` 排序 | 无排序 |
| **移动端适配** | 有 `_rebuildCustomSelect`（每次打开重建 `MobileHandler.convertToCustomSelect`） | 无 |
| **筛选器初始化** | categorySelect/qualitySelect 每次打开都重设 `innerHTML`（刷新品类），事件用 `_initialized` 防重复 | categorySelect/qualitySelect/searchInput 全部用 `_initialized` 包裹，只初始化一次 |
| **数据源** | `ARTIFACT_LIBRARY` + `QUALITY_CONFIG` | `ARTIFACT_LIBRARY` + `QUALITY_CONFIG` |
| **DOM 元素** | `collectionOverlay` / `collectionPanel` / `collectionGrid` / `collectionCategoryFilter` / `collectionQualityFilter` / `collectionSearchInput` / `collectionSortFilter` / `collectionCloseBtn` / `collectionStats` | 同上（但无 `collectionSortFilter`） |

结论：**lobby 版是功能更全的新版**（排序 + 移动端 custom-select + 每次刷新品类），overlay 版是较旧简版。

### 2.3 调用方与 DOM 唯一性

- **调用入口**：唯一按钮 `lobbyCollectionBtn`（`index.html` L106），仅 `lobby/index.ts` L113 绑定
  `() => this.openCollectionOverlay()`。全仓无其他调用方（`events-overlay.ts` 无收藏相关绑定）。
- **DOM**：`index.html` 只有一组 `collectionOverlay`（L682）/ `collectionGrid`（L707）。无"游戏内查看"场景。
- **数据源**：两组都用 `ARTIFACT_LIBRARY`。

### 2.4 Object.assign 合并顺序（关键）

`main.ts` L133-L165 的 `Object.assign(WarehouseScene.prototype, ...)` 顺序：

```
...
OverlayMixin,        // L155（= UiOverlayMixin，内含 CollectionMixin）
PanelsMixin,         // L156
HistoryMixin,        // L157
LobbyIndexMixin,     // L158（含 lobby 版收藏方法）
...
```

`Object.assign` 后者覆盖前者同名属性。**`LobbyIndexMixin`（L158）的 5 个收藏方法覆盖
`OverlayMixin`（L155）内 `CollectionMixin` 的 5 个同名方法**。运行时 `this.openCollectionOverlay()`
等全部解析到 lobby 版。

### 2.5 纯函数与测试覆盖

- `overlay/pure.ts` 的 `getCollectionCategories` / `filterCollectionItems`：**非死代码**，
  被 `lobby/index.ts` L48 import 使用，且 `tests/game/ui/overlay.test.ts` 覆盖。
- `lobby/index.ts` L62 的 `sortCollectionItems`：纯函数，被 `tests/game/lobby/index.test.ts` L5 import 测试。
- 无 Mixin 方法（`openCollectionOverlay` 等）的单元测试（DOM 重，未测）。

## 三、判定

**结论：重复逻辑；`ui/overlay/collection.ts` 的 5 个 Mixin 方法是死代码。**

证据：
1. **同一 DOM**：两组操作同一组元素（`index.html` 仅一组 `collectionOverlay`/`collectionGrid`）。
2. **同一数据源**：都基于 `ARTIFACT_LIBRARY` + `QUALITY_CONFIG`。
3. **同一调用方**：唯一入口 `lobbyCollectionBtn`，无游戏内查看场景。
4. **Object.assign 顺序**：`LobbyIndexMixin`（L158）后于 `OverlayMixin`（L155），lobby 版覆盖 overlay 版。
   overlay/collection.ts 的 5 个方法运行时从不被调用。
5. **功能差**：lobby 版更全（排序 + 移动端），overlay 版是旧简版。S21 拆分时从原 `overlay.ts`
   搬运了收藏方法到 `collection.ts`，但未删除 `lobby/index.ts` 已有的更新版，造成遗留重复。

**非死代码部分**：`overlay/pure.ts` 的两个纯函数（被 lobby import + 测试覆盖），保留。

## 四、方案

两个子问题分别处理：

### 4.1 删除 overlay/collection.ts 死代码

`CollectionMixin` 的 5 个方法已被覆盖，从不被调用。处理：

- 从 `scripts/game/ui/overlay.ts` 移除 `import { CollectionMixin } from "./overlay/collection"`
  与 `Object.assign` 中的 `CollectionMixin` 合并项。
- 删除 `scripts/game/ui/overlay/collection.ts` 整个文件（**需用户同意**，遵循"禁止未经同意删除文件"约束）。
- `scripts/game/ui/overlay/pure.ts` **保留**（纯函数仍被使用 + 测试覆盖）。
- `scripts/game/ui/overlay.ts` 的 `export { getCollectionCategories, filterCollectionItems } from "./overlay/pure"`
  **保留**（lobby 侧仍从 `"../ui/overlay"` import 纯函数，路径不变）。

### 4.2 把 lobby/index.ts 的收藏逻辑提取到 `scripts/game/lobby/collection.ts`

**新建** `scripts/game/lobby/collection.ts`，迁入：

| 迁入项 | 原位置 | 类型 |
|--------|--------|------|
| `openCollectionOverlay` | lobby/index.ts L669-L693 | Mixin 方法 |
| `closeCollectionOverlay` | L695-L705 | Mixin 方法 |
| `_destroyCustomSelect` | L707-L714 | Mixin 方法 |
| `_rebuildCustomSelect` | L716-L721 | Mixin 方法 |
| `initCollectionPanel` | L723-L766 | Mixin 方法 |
| `getCollectionCategories`（实例方法） | L768-L770 | Mixin 方法 |
| `renderCollectionGrid` | L772-L817 | Mixin 方法 |
| `sortCollectionItems` | L62-L83 | 独立纯函数（export） |

导出 `LobbyCollectionMixin`（`ThisType<WarehouseSceneThis>`）+ 纯函数 `sortCollectionItems`。

**lobby/collection.ts 依赖（import）**：

| import | 来源 | 相对路径（从 `scripts/game/lobby/collection.ts`） |
|--------|------|------------------------------------------------|
| `WarehouseSceneThis`（type） | types | `../../../types/warehouse-scene-this` |
| `rgbHex` | core/utils | `../core/utils` |
| `QUALITY_CONFIG`, `ARTIFACT_LIBRARY` | data/artifacts | `../data/artifacts` |
| `MobaoAnimations` | animations | `../animations` |
| `MobileHandler` | mobile | `../../mobile/mobile-handler` |
| `getCollectionCategories as _getCollectionCategories`, `filterCollectionItems` | ui/overlay（re-export） | `../ui/overlay` |

> 相对路径与 `lobby/index.ts` 同目录，直接照搬。

**lobby/index.ts 改动**：

1. 删除上述 7 个 Mixin 方法 + `sortCollectionItems` 纯函数定义。
2. import `LobbyCollectionMixin` from `"./collection"`，合并到 `LobbyIndexMixin`：
   ```ts
   export const LobbyIndexMixin: ThisType<WarehouseSceneThis> = Object.assign(
     {
       bindLobbyEvents() { ... },
       showLobbyMain(...) { ... },
       // ... 其余原方法
     },
     LobbyCollectionMixin
   )
   ```
3. **re-export `sortCollectionItems`**：`export { sortCollectionItems } from "./collection"`
   （保持 `tests/game/lobby/index.test.ts` 的 `from '../../../scripts/game/lobby/index'` 路径不变）。
4. 清理不再使用的 import：
   - `QUALITY_CONFIG`：仅收藏方法用 → 删除（确认 `initPreviewFilterOptions` L614 用的是 `ARTIFACT_LIBRARY`，不用 `QUALITY_CONFIG`）。
   - `rgbHex`：仅 `renderCollectionGrid` 用 → 删除。
   - `MobileHandler`：仅 `_rebuildCustomSelect` 用 → 删除。
   - `_getCollectionCategories`, `filterCollectionItems`：仅收藏方法用 → 删除。
   - `ARTIFACT_LIBRARY`：**保留**（`initPreviewFilterOptions` L614 仍用）。

### 4.3 类型声明

`types/warehouse-scene-this.d.ts` 中以下声明**保持不变**（方法仍挂原型，仅换 Mixin 载体）：

- L662 `renderCollectionGrid(): void`
- L675 `_rebuildCustomSelect(el: HTMLSelectElement): void`
- L775 `openCollectionOverlay(): void`
- L796 `closeCollectionOverlay(): void`
- L797 `initCollectionPanel(): void`
- L798 `getCollectionCategories(): string[]`
- L821 `_destroyCustomSelect(el: HTMLSelectElement): void`

### 4.4 测试影响

- `tests/game/lobby/index.test.ts`：import `sortCollectionItems` from `'../../../scripts/game/lobby/index'`。
  因 lobby/index.ts re-export，**路径不变，无需改测试**。
- `tests/game/ui/overlay.test.ts`：测 `overlay/pure.ts` 纯函数，纯函数保留且仍 re-export，**无需改测试**。

## 五、行为保持原则

1. **运行时行为零变化**：lobby 版收藏方法本就生效（覆盖 overlay 版），提取到 `lobby/collection.ts`
   后仍通过 `LobbyIndexMixin` 合并到原型，`this.openCollectionOverlay()` 解析不变。
2. **不删功能**：排序、移动端 custom-select、每次刷新品类等 lobby 版特有逻辑全部保留。
3. **纯函数 import 路径不变**：`lobby/collection.ts` 仍从 `"../ui/overlay"` import 纯函数
   （`overlay.ts` re-export 保留）。
4. **类型声明不变**：`WarehouseSceneThis` 的方法签名不动。
5. **测试路径不变**：通过 re-export 保持 `tests/game/lobby/index.test.ts` import 路径。

## 六、行数变化（预估）

| 文件 | 变化 |
|------|------|
| `scripts/game/lobby/index.ts` | 908 行 → ~760 行（删 ~150 行：7 方法 + sortCollectionItems + import 清理） |
| `scripts/game/lobby/collection.ts`（新建） | 0 → ~160 行 |
| `scripts/game/ui/overlay/collection.ts`（删除） | 137 行 → 0 |
| `scripts/game/ui/overlay.ts` | 39 行 → ~36 行（移除 1 import + 1 合并项） |

净效果：lobby/index.ts 变薄，消除 137 行死代码，收藏逻辑独立成模块。

## 七、验证步骤

1. `npx tsc --noEmit` → 0 错误（注意：项目级 tsc 可能含其他并行流瞬时错误，只确认本任务文件 0 错误）。
2. `npm run test` → 全通过，数量不减少（当前 ~1026，task-list 描述为 1078，以实际为准，要求不低于现状）。
3. `npm run lint` → 0 error（warning 不增加）。
4. `npm run format`（prettier --check）→ 通过（无分号、双引号、120 宽、LF）。
5. 手动验证（dev server）：
   - 大厅点"图鉴"按钮 → 覆盖层打开，品类/品质/搜索/排序筛选正常，藏品网格渲染正确。
   - 点关闭按钮 / 点遮罩 → 覆盖层关闭。
   - 移动端（或模拟）→ custom-select 下拉正常重建。
   - 多次开闭 → 事件不重复绑定（`_initialized` / `_boundClose` 标志生效）。

## 八、风险点

| 风险 | 等级 | 说明 / 缓解 |
|------|------|-------------|
| Object.assign 合并顺序 | 低 | `LobbyCollectionMixin` 在 `LobbyIndexMixin` 内部 `Object.assign` 合并，最终仍由 main.ts L158 挂原型。需确保 `LobbyCollectionMixin` 方法名不与 `LobbyIndexMixin` 其他方法重名（当前不重名）。 |
| `this` 上下文 | 低 | `LobbyCollectionMixin` 用 `ThisType<WarehouseSceneThis>`，`this.getCollectionCategories()` / `this.renderCollectionGrid()` / `this.closeCollectionOverlay()` / `this._rebuildCustomSelect()` 在合并后解析到同 Mixin 方法，正常。 |
| 相对 import 路径 | 低 | `lobby/collection.ts` 与 `lobby/index.ts` 同目录，依赖相对路径一致，照搬即可。 |
| 删除 `overlay/collection.ts` 需用户同意 | 低 | 遵循"禁止未经同意删除文件"约束，执行阶段需用户确认；或保守保留为空 Mixin（但那等同于死代码，建议直接删）。 |
| `sortCollectionItems` re-export 遗漏 | 低 | 若忘记 re-export，`tests/game/lobby/index.test.ts` 会 import 失败。验证步骤 2 会立即暴露。 |
| 并行流 tsc 噪声 | 低 | 项目常有多条并行重构流，项目级 tsc 可能有其他文件瞬时错误。按子代理规则，只确认本任务文件 0 错误，不据此回退。 |

## 九、风险等级与执行建议

- **风险等级**：低。改动是纯结构搬迁 + 删死代码，无逻辑变更，行为保持，测试路径不变。
- **是否建议执行**：是。收益明确（消除 137 行死代码 + lobby/index.ts 变薄 ~150 行 + 收藏逻辑独立成模块
  职责清晰），风险低，验证手段充分。
- **执行前置条件**：确认用户同意删除 `scripts/game/ui/overlay/collection.ts`（否则保留为空壳）。

## 十、执行顺序建议

1. 新建 `scripts/game/lobby/collection.ts`（迁入 7 方法 + `sortCollectionItems`，export `LobbyCollectionMixin`）。
2. 改 `scripts/game/lobby/index.ts`：删迁移项、清理 import、合并 `LobbyCollectionMixin`、re-export `sortCollectionItems`。
3. 改 `scripts/game/ui/overlay.ts`：移除 `CollectionMixin` import + 合并项。
4. 删 `scripts/game/ui/overlay/collection.ts`（需用户同意）。
5. 跑验证（tsc / test / lint / format）。
6. 更新 `AGENTS.md` L106（`lobby/index.ts | sortCollectionItems` → 改为 `lobby/collection.ts`）与
   `FILE_GUIDE.md`（若记录了收藏方法归属）。
