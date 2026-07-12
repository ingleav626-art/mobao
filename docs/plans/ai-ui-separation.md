# AI 逻辑文件 UI 混入分离计划

> 任务来源：`analysis/ai.md` task-list #6 / #7 / #8
> 目标：将 UI/DOM 渲染方法从 `ai/memory.ts`、`ai/reflection.ts`、`ai/decision.ts` 剥离到 `ui/` 层，让 AI 逻辑文件只含可测试的逻辑/纯函数。
> 约束：只搬移不改逻辑；对外接口不变（`ai/index.ts` 导出不变、`main.ts` Object.assign 不变）。

---

## 1. 逐文件方法清单

### 1.1 ai/memory.ts (701 行)

| 方法/属性 | 行号 | 分类 | 去向 |
|-----------|------|------|------|
| `DEFAULT_CROSS_GAME_STATS` (const) | 20-28 | 纯函数/常量 | 留 |
| `getAiMemoryStorageKey(isLanMode)` | 30-32 | 纯函数 | 留 |
| `loadAiMemoryFromStorage(storageKey)` | 34-44 | 纯函数 | 留 |
| `getQualityCounts(items)` | 46-55 | 纯函数 | 留 |
| `getTotalOccupiedCells(items)` | 57-59 | 纯函数 | 留 |
| `ensureCrossGameMemory(store, playerId)` | 61-74 | 纯函数 | 留 |
| `getAiMemoryStorageKey()` | 79-81 | AI逻辑(薄包装) | 留 |
| `isAiMultiGameMemoryEnabled()` | 83-86 | AI逻辑 | 留 |
| `shouldGenerateSummary()` | 88-97 | AI逻辑 | 留 |
| `clearGameHistoryForPlayer(playerId)` | 99-103 | AI逻辑 | 留 |
| `loadAiMemoryFromStorage()` | 105-107 | AI逻辑(薄包装) | 留 |
| `saveAiMemoryToStorage()` | 109-122 | AI逻辑 | 留 |
| `restoreAiMemoryFromStorage()` | 124-198 | AI逻辑 | 留 |
| `ensureAiConversationBucket(playerId)` | 200-205 | AI逻辑 | 留 |
| `ensureAiCrossGameMemory(playerId)` | 207-209 | AI逻辑(薄包装) | 留 |
| `getAiCrossGameMemoryCount(playerId)` | 211-214 | AI逻辑 | 留 |
| `getAiInGameHistoryCount(playerId)` | 216-219 | AI逻辑 | 留 |
| `getQualityCounts()` | 221-223 | AI逻辑(薄包装) | 留 |
| `getTotalOccupiedCells()` | 225-227 | AI逻辑(薄包装) | 留 |
| `getAiConversationMessages(playerId)` | 229-254 | AI逻辑 | 留 |
| `pushAiRoundSummary(playerId, plan)` | 256-275 | AI逻辑 | 留 |
| `updateLastAiRoundResult(playerId, resultText)` | 277-286 | AI逻辑 | 留 |
| `resetAiConversations()` | 288-294 | AI逻辑 | 留 |
| `clearAiMemoryStorage()` | 296-306 | AI逻辑 | 留 |
| `exportAiMemoryToJson()` | 308-318 | AI逻辑 | 留 |
| `importAiMemoryFromJson(jsonString)` | 320-410 | AI逻辑 | 留 |
| `pushRunStartContextToAi()` | 412 | AI逻辑(空) | 留 |
| `pushRunSettlementContextToAi(result)` | 414-509 | AI逻辑 | 留 |
| `createCrossGameRecord(result)` | 511-554 | AI逻辑 | 留 |
| `getAiFirstRoundExtraBlocks(playerId)` | 556-574 | AI逻辑 | 留 |
| **`openAiMemoryPanel()`** | **576-666** | **UI-DOM渲染** | **迁UI** |
| **`setupAiMemoryTouchScroll()`** | **668-694** | **UI-DOM渲染** | **迁UI** |
| **`closeAiMemoryPanel()`** | **696-700** | **UI-DOM渲染** | **迁UI** |

UI 混入方法数：3 个（约 123 行）

### 1.2 ai/reflection.ts (762 行)

| 方法/属性 | 行号 | 分类 | 去向 |
|-----------|------|------|------|
| `applyMemoryOperations(array, ops, max)` | 56-91 | 纯函数 | 留 |
| `updateCrossGameMemory(memory, pid, record, reflection)` | 93-175 | 纯函数 | 留 |
| `isAiReflectionEnabled()` | 180-183 | AI逻辑 | 留 |
| `triggerAiReflection(record)` | 185-604 | AI逻辑/流程控制 | 留 |
| `applyMemoryOperations(...)` | 606-608 | AI逻辑(薄包装) | 留 |
| `updateCrossGameMemory(...)` | 610-615 | AI逻辑 | 留 |
| `shouldShowReflectionUI()` | 617-619 | AI逻辑(条件查询) | 留 |
| **`updateReflectionStatusUI()`** | **621-657** | **UI-DOM渲染** | **迁UI** |
| **`showReflectionPendingDialog()`** | **659-693** | **UI-DOM渲染** | **迁UI** |
| **`showReflectionPendingDialogForBack()`** | **695-729** | **UI-DOM渲染** | **迁UI** |
| `proceedToBack()` | 731-748 | 流程控制 | 留(见 1.4) |
| **`removeReflectionPendingDialog()`** | **750-753** | **UI-DOM渲染** | **迁UI** |
| `proceedToNewRun()` | 755-761 | 流程控制 | 留(见 1.4) |

UI 混入方法数：4 个（约 111 行）

### 1.3 ai/decision.ts (472 行)

| 方法/属性 | 行号 | 分类 | 去向 |
|-----------|------|------|------|
| `compactPanelTextForSnapshot(text)` | 62-78 | 纯函数 | 留 |
| `buildAiDecisionPanelSnapshot(telemetry, fn)` | 90-222 | 纯函数 | 留 |
| `renderAiThoughtLog(el, runLogHistory)` | 224-260 | 纯函数(DOM) | 留(已提取) |
| `beginRunTracking(history, save, render)` | 262-283 | 纯函数(带回调) | 留 |
| `recordAiThoughtLogs(telemetry, log, dom, fn, render)` | 285-381 | 纯函数(带回调) | 留 |
| `writeLog(text, round, log, dom, render)` | 383-411 | 纯函数(带回调) | 留 |
| `compactPanelTextForSnapshot(text)` | 427-429 | AI逻辑(薄包装) | 留 |
| `buildAiDecisionPanelSnapshot(telemetry)` | 431-437 | AI逻辑(薄包装) | 留 |
| `beginRunTracking()` | 439-448 | AI逻辑(薄包装) | 留 |
| `recordAiThoughtLogs(telemetry)` | 450-461 | AI逻辑(薄包装) | 留 |
| **`renderAiThoughtLog()`** | **463-466** | **UI-DOM渲染(薄包装)** | **迁UI** |
| `writeLog(text)` | 468-471 | AI逻辑(薄包装) | 留 |

UI 混入方法数：1 个（约 4 行，已是对纯函数的 3 行薄包装）

### 1.4 难归类方法分析：proceedToNewRun / proceedToBack

这两个方法**不是 UI，也不是 AI 逻辑**，属于**游戏流程控制**：

```typescript
// proceedToNewRun (reflection.ts:755-761)
proceedToNewRun(): void {
  this.exitSettlementPage()  // 结算桥接方法
  this.startNewRun()         // scene/scene-run.ts
  AudioManager.resumeBgm()   // 音频
}

// proceedToBack (reflection.ts:731-748)
proceedToBack() {
  this.exitSettlementPage()
  if (this.battleRecordReplayActive) { ... this.enterLobby() ... }
  if (this.isLanMode) { this.enterLanRoom() } else { this.enterLobby() }
}
```

- 不含 DOM 操作，不碰 `this.dom`
- 不含 AI 决策/记忆/反思逻辑
- 调用方：`showReflectionPendingDialog()` / `showReflectionPendingDialogForBack()`（UI 方法，迁走后经 `this.` 调用）；`events-settlement.ts` settleReplayBtn 处理器直接调 `this.proceedToNewRun()`

**处理方案**：本轮保留在 `reflection.ts` 不动。UI 方法迁走后经 `this.proceedToNewRun()` / `this.proceedToBack()` 跨 Mixin 调用，不受影响。未来可考虑迁到 `scene/scene-settlement.ts`，但属独立重构议题，不在本计划范围。

---

## 2. 剥离方案

### 2.1 目标 UI 模块结构（推荐方案）

推荐在 `ui/overlay/` 下新建子模块，与已有的 `ai-model-config.ts` 模式一致：

```
scripts/game/ui/overlay/
├── core.ts              (已有，openAiLogicPanel 已调 this.renderAiThoughtLog)
├── info-popup.ts        (已有)
├── detail-popup.ts      (已有)
├── settings.ts          (已有)
├── lan-dialog.ts        (已有)
├── collection.ts        (已有)
├── ai-model-config.ts   (已有，AI 模型配置弹窗)
├── ai-memory-panel.ts   (新建) ← memory.ts 的 3 个方法
├── ai-reflection-dialog.ts (新建) ← reflection.ts 的 4 个方法
└── pure.ts              (已有)
```

`renderAiThoughtLog` 薄包装（3 行）放入 `ui/overlay/core.ts`，因为 `core.ts` 的 `openAiLogicPanel` 已经直接调用 `this.renderAiThoughtLog()`，天然属于同一 UI 域。

**选择 `ui/overlay/` 而非新建 `ui/ai-panels.ts` 的理由**：
1. 先例已存在：`ui/overlay/ai-model-config.ts` 就是 AI 相关的覆盖层子模块
2. 这些方法操作的都是 overlay/弹窗类 DOM（`aiMemoryOverlay`、`settleReflectionStatus`、动态创建 `reflectionPendingDialog`），与 overlay 职责一致
3. `ui/overlay.ts` 薄入口已用 `Object.assign` 合并 7 个子 Mixin，再加 2 个不影响模式
4. 避免新增顶层 `ui/ai-panels.ts` 带来的 index.ts 导出变更——`ui/index.ts` 已 re-export `OverlayMixin`，main.ts 无需改动

### 2.2 各 UI 方法的依赖与剥离后处理

所有 UI 方法迁入新 Mixin 后，经 `ThisType<WarehouseSceneThis>` + `Object.assign` 合并到原型，`this.` 可见所有其他 Mixin 方法。参照 `intel/action.ts` 调用 `this.writeLog()`（decision.ts 定义）的跨 Mixin 模式。

#### memory.ts → ui/overlay/ai-memory-panel.ts

| 迁入方法 | this. 逻辑方法依赖 | DOM 元素 | import 依赖 |
|---------|-------------------|----------|------------|
| `openAiMemoryPanel()` | `this.players`, `this.ensureAiCrossGameMemory(playerId)`, `this.setupAiMemoryTouchScroll()`, `this._aiMemoryTouchBound` | `this.dom.aiMemoryOverlay`, `this.dom.aiMemoryContent` | `CrossGameStats` 类型(从 types/ai) |
| `setupAiMemoryTouchScroll()` | 无 | `this.dom.aiMemoryContent` | 无 |
| `closeAiMemoryPanel()` | 无 | `this.dom.aiMemoryOverlay` | 无 |

剥离后 `memory.ts` 保留全部 AI 逻辑方法（6 个纯函数 + 24 个 Mixin 方法），移除 3 个 UI 方法。行数 701 -> ~578。

#### reflection.ts → ui/overlay/ai-reflection-dialog.ts

| 迁入方法 | this. 逻辑方法依赖 | DOM 元素 | import 依赖 |
|---------|-------------------|----------|------------|
| `updateReflectionStatusUI()` | `this.shouldShowReflectionUI()`, `this.isAiMultiGameMemoryEnabled()`, `this.shouldGenerateSummary()`, `this.aiReflectionState/StateDetail/Total/Completed` | `this.dom.settleReflectionStatus` | 无 |
| `showReflectionPendingDialog()` | `this.removeReflectionPendingDialog()`, `this.isAiMultiGameMemoryEnabled()`, `this.shouldGenerateSummary()`, `this.proceedToNewRun()` | `document.createElement`/`getElementById`/`body.appendChild` | 无 |
| `showReflectionPendingDialogForBack()` | 同上 + `this.proceedToBack()` | 同上 | 无 |
| `removeReflectionPendingDialog()` | 无 | `document.getElementById` | 无 |

剥离后 `reflection.ts` 保留 AI 逻辑（2 个纯函数 + 5 个 Mixin 方法）+ 2 个流程控制方法（`proceedToNewRun` / `proceedToBack`）。行数 762 -> ~651。

#### decision.ts → ui/overlay/core.ts（追加）

| 迁入方法 | this. 逻辑方法依赖 | DOM 元素 | import 依赖 |
|---------|-------------------|----------|------------|
| `renderAiThoughtLog()` | `this.runLogHistory` | `this.dom.aiThoughtContent` | 纯函数 `renderAiThoughtLog`（从 ai/decision 导入） |

`core.ts` 的 `openAiLogicPanel` 已有 `if (typeof this.renderAiThoughtLog === "function") { this.renderAiThoughtLog() }` 调用。将 3 行薄包装移入后，`core.ts` 自身即提供该方法。

剥离后 `decision.ts` 保留全部纯函数 + 5 个 Mixin 薄包装。行数 472 -> ~468。

### 2.3 入口文件变更

**`ui/overlay.ts`**（薄入口，追加 2 个 import + Object.assign 合并）：

```typescript
import { AiMemoryPanelMixin } from "./overlay/ai-memory-panel"
import { AiReflectionDialogMixin } from "./overlay/ai-reflection-dialog"

export const UiOverlayMixin: ThisType<WarehouseSceneThis> = Object.assign(
  {},
  CoreOverlayMixin,
  InfoPopupMixin,
  DetailPopupMixin,
  SettingsMixin,
  LanDialogMixin,
  CollectionMixin,
  AiModelConfigMixin,
  AiMemoryPanelMixin,       // 新增
  AiReflectionDialogMixin    // 新增
)
```

**`ai/memory.ts`**：从 `AiMemoryMixin` 对象中删除 `openAiMemoryPanel` / `setupAiMemoryTouchScroll` / `closeAiMemoryPanel`。

**`ai/reflection.ts`**：从 `AiReflectionMixin` 对象中删除 `updateReflectionStatusUI` / `showReflectionPendingDialog` / `showReflectionPendingDialogForBack` / `removeReflectionPendingDialog`。保留 `proceedToNewRun` / `proceedToBack`。

**`ai/decision.ts`**：从 `AiDecisionMixin` 对象中删除 `renderAiThoughtLog` 薄包装。纯函数 `renderAiThoughtLog` 仍由 `decision.ts` 导出，`core.ts` import 调用。

**不变的文件**：
- `ai/index.ts`：仍 re-export AiMemoryMixin / AiReflectionMixin / AiDecisionMixin
- `main.ts`：Object.assign 顺序不变（UiOverlayMixin 在 AiMemoryMixin 之后，自然覆盖，但因 AI 侧已删除同名方法，无冲突）
- `types/warehouse-scene-this.d.ts`：方法签名不变，只是提供者从 AI Mixin 变为 UI Mixin
- `scene/warehouse-scene.ts`：类型声明不变

---

## 3. 行为保持原则

- **只搬移不改逻辑**：方法体逐字搬移，不重构内部逻辑、不改参数签名、不改返回值
- **`showReflectionPendingDialog` / `showReflectionPendingDialogForBack` 的重复代码不在本轮消除**（analysis/ai.md 已标记为重复，但去重是逻辑变更，不在本搬移计划范围）
- **不改变调用顺序**：main.ts Object.assign 中 UiOverlayMixin 仍在 AiMemoryMixin 等之后，因 AI 侧已删同名方法，无覆盖问题
- **DOM 操作方式不变**：不把 `document.createElement` 改为模板字符串或其他方式

---

## 4. 测试影响

### 4.1 现有测试（零改动通过）

| 测试文件 | 测试内容 | 影响 |
|---------|---------|------|
| `tests/game/ai/memory.test.ts` | 6 个纯函数（DEFAULT_CROSS_GAME_STATS, getAiMemoryStorageKey, loadAiMemoryFromStorage, getQualityCounts, getTotalOccupiedCells, ensureCrossGameMemory） | 零影响：纯函数不搬移 |
| `tests/game/ai/reflection.test.ts` | 2 个纯函数（applyMemoryOperations, updateCrossGameMemory） | 零影响：纯函数不搬移 |
| `tests/game/ai/decision.test.ts` | 6 个纯函数（compactPanelTextForSnapshot, buildAiDecisionPanelSnapshot, beginRunTracking, writeLog, renderAiThoughtLog, recordAiThoughtLogs） | 零影响：纯函数不搬移，`renderAiThoughtLog` 纯函数仍由 decision.ts 导出 |

基线：40 个测试文件，1032 个测试全部通过。剥离后应保持 1032 通过。

### 4.2 剥离后可新增的纯函数测试点

以下纯逻辑目前内联在 UI 方法中，未来可提取为纯函数并测试（**不在本轮搬移范围**，仅记录机会）：

| 可提取纯函数 | 来源方法 | 可测内容 |
|-------------|---------|---------|
| `buildAiMemoryPanelHtml(players, getCrossGameMemory)` | `openAiMemoryPanel` | 给定玩家列表+记忆数据，返回 HTML 字符串。可验证空数据、统计数据格式、条目截断 |
| `buildReflectionStatusText(state, detail, total, completed, needsSummary)` | `updateReflectionStatusUI` | 给定状态枚举+进度，返回应显示的文本和 className。可验证 pending/done/timeout/error 四态 |
| `buildReflectionDialogHtml(actionLabel)` | `showReflectionPendingDialog` / `ForBack` | 两个方法 90% 重复，提取后可去重+测试 HTML 结构 |

---

## 5. 验证步骤

```bash
# 1. TypeScript 类型检查（0 错误）
npx tsc --noEmit

# 2. 全量测试通过（基线 1032）
npm run test

# 3. ESLint 不增 error
npm run lint

# 4. Prettier 格式检查
npm run format

# 5. 构建通过
npm run build
```

验证要点：
- tsc：`warehouse-scene-this.d.ts` 方法签名不变，新 Mixin 文件的 `ThisType<WarehouseSceneThis>` 类型推导正确
- test：3 个 AI 测试文件零改动通过；无其他测试因 Mixin 方法归属变更而失败
- lint：新增 `ui/overlay/ai-memory-panel.ts` / `ai-reflection-dialog.ts` 不引入 `any`（注意 reflection.ts 原代码用 `Record<string, any>` 类型，搬移时保持原样不算新增）

---

## 6. 风险点

### 6.1 UI 方法间 this. 互调（低风险）

`showReflectionPendingDialog` 调用 `this.removeReflectionPendingDialog()`，两者同迁入 `AiReflectionDialogMixin`，同一 Mixin 内 `this.` 可见。`openAiMemoryPanel` 调用 `this.setupAiMemoryTouchScroll()`，同理。无风险。

### 6.2 UI 调 AI 逻辑方法的边界（低风险）

迁入 UI Mixin 的方法经 `this.` 调用留在 AI Mixin 的逻辑方法：
- `openAiMemoryPanel` -> `this.ensureAiCrossGameMemory()`（memory.ts）
- `updateReflectionStatusUI` -> `this.shouldShowReflectionUI()` / `this.isAiMultiGameMemoryEnabled()` / `this.shouldGenerateSummary()`（reflection.ts / memory.ts）
- `showReflectionPendingDialog` -> `this.proceedToNewRun()`（reflection.ts）

所有调用经 `this.` 在运行时从原型链解析，不受 Mixin 文件归属影响。参照 `intel/action.ts` 已有 `this.writeLog()`（decision.ts 定义）的跨 Mixin 调用先例。无风险。

### 6.3 proceedToNewRun / proceedToBack 归属（中风险 - 需决策）

这两个流程控制方法留在 reflection.ts，但它们不是反思逻辑。如果后续有人困惑"为什么反思文件里有开始新局的方法"，可能误改。**建议**：在方法上方加注释标注 `// 流程控制方法，非反思逻辑，暂置于此`，或作为后续独立议题迁到 `scene/scene-settlement.ts`。

### 6.4 main.ts Object.assign 顺序（低风险）

`OverlayMixin` 在 `AiMemoryMixin` 等之后合并。如果 AI 侧漏删某个方法，`OverlayMixin` 的同名方法会静默覆盖。**缓解**：tsc 不会报错（重复 key 合法），但 lint 可配 `no-dupe-keys` 规则。实际操作时确保逐方法删除即可。

### 6.5 bridge/settlement.ts 的 updateReflectionStatusUI 调用（低风险）

`bridge/settlement.ts:612` 有 `if (typeof this.updateReflectionStatusUI === "function") { this.updateReflectionStatusUI() }`。方法迁到 UI Mixin 后仍在原型上，`typeof` 检查仍为 `"function"`。无影响。

### 6.6 decision.ts renderAiThoughtLog 的 import 方向（低风险）

`ui/overlay/core.ts` 需 import `renderAiThoughtLog` 纯函数 from `ai/decision`。这创建了 `ui/ -> ai/` 的依赖方向。但该纯函数不依赖任何 AI 状态，只是格式化 `RunLog[]` 为文本。可接受。若需消除依赖，可将纯函数移到 `ui/` 下的独立文件，但属过度优化，不推荐。

---

## 7. 分批执行建议

推荐按风险从低到高分三批，每批独立可验证：

### 批次 1：decision.ts（最小变更，验证模式）

- 迁出：`renderAiThoughtLog()` 薄包装（3 行）-> `ui/overlay/core.ts`
- `decision.ts` 纯函数 `renderAiThoughtLog` 保留导出，`core.ts` import 调用
- 验证：tsc 0 错误 + 1032 测试通过
- 目的：验证"UI Mixin 调 AI 纯函数"的跨层依赖模式可行

### 批次 2：memory.ts（中等变更）

- 新建 `ui/overlay/ai-memory-panel.ts`，迁入 `openAiMemoryPanel` / `setupAiMemoryTouchScroll` / `closeAiMemoryPanel`
- `ui/overlay.ts` 追加 import + Object.assign
- `memory.ts` 删除 3 个方法
- 验证：tsc 0 错误 + 1032 测试通过

### 批次 3：reflection.ts（最大变更）

- 新建 `ui/overlay/ai-reflection-dialog.ts`，迁入 `updateReflectionStatusUI` / `showReflectionPendingDialog` / `showReflectionPendingDialogForBack` / `removeReflectionPendingDialog`
- `ui/overlay.ts` 追加 import + Object.assign
- `reflection.ts` 删除 4 个方法，保留 `proceedToNewRun` / `proceedToBack`
- 验证：tsc 0 错误 + 1032 测试通过

每批次完成后跑一次全量验证，确认无回归再进入下一批。

---

## 附：涉及文件清单

| 文件 | 操作 |
|------|------|
| `scripts/game/ai/memory.ts` | 编辑：删除 3 个 UI 方法 |
| `scripts/game/ai/reflection.ts` | 编辑：删除 4 个 UI 方法 |
| `scripts/game/ai/decision.ts` | 编辑：删除 1 个 UI 薄包装方法 |
| `scripts/game/ui/overlay/ai-memory-panel.ts` | 新建 |
| `scripts/game/ui/overlay/ai-reflection-dialog.ts` | 新建 |
| `scripts/game/ui/overlay/core.ts` | 编辑：追加 `renderAiThoughtLog` 薄包装 + import |
| `scripts/game/ui/overlay.ts` | 编辑：追加 2 个 import + Object.assign |
| `scripts/game/ai/index.ts` | 不变 |
| `scripts/game/main.ts` | 不变 |
| `types/warehouse-scene-this.d.ts` | 不变 |
| `scripts/game/scene/warehouse-scene.ts` | 不变 |
