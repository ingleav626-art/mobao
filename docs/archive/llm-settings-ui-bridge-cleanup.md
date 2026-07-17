# llm-settings.ts vs llm-ui-bridge.ts 职责重叠清理方案

> 创建时间：2026-07-12
> 状态：📋 计划中（仅调查 + 计划，未执行代码改动）
> 任务来源：task-list #24
> 目标：消除 `llm-settings.ts` 与 `llm-ui-bridge.ts` 在设置表单读写、连接测试、状态显示、全局设置存储、可见性切换 5 个维度的职责重叠，明确分工边界，删除死代码。

---

## 一、现状分析

### 1.1 文件概览

| 文件 | 行数 | 模式 | 挂载方式 | 生命周期 |
|------|------|------|----------|----------|
| `scripts/llm/core/llm-settings.ts` | 306 | 工厂函数 `createLlmSettingsModule` | 经 `scene-llm.ts` → `LLM_BRIDGE.methods` → `Object.assign` 到 `WarehouseScene.prototype`，方法通过 `this.xxx()` 调用 | 随场景创建 |
| `scripts/llm/core/llm-ui-bridge.ts` | 940 | IIFE 单例 `window.LlmUiBridge`（ES Module export） | `main.ts` 调用 `LlmUiBridge.initialize()`，自行绑定 DOM 事件 | DOMContentLoaded 自动初始化 |

### 1.2 两者职责对比表

#### llm-settings.ts（createLlmSettingsModule）

| 方法/函数 | 职责 | 调用方 | 活跃/死代码 |
|-----------|------|--------|------------|
| `fillLlmSettingsForm(values?)` | 从 `getLlmSettings()` 或传入值填充 DOM 表单（apiKey/model/endpoint/enabled/各 checkbox/reflectionScope/visibility 切换） | `overlay/settings.ts` L37（打开设置面板）、`events-ai-memory.ts` L20（重置按钮） | 活跃 |
| `readLlmSettingsForm()` | 从 DOM 表单读取全部 LLM 设置，返回设置对象 | `overlay/settings.ts` L41/L92（未保存检测）、L234（保存）、`fillLlmSettingsForm` 内部无 | 活跃 |
| `setLlmSettingsStatus(text, state)` | 更新 `settingsLlmStatusText` 元素的文本和样式类 | `overlay/settings.ts` L307（保存后状态）、`fillLlmSettingsForm` 内部（API Key 状态） | 活跃 |
| `testDeepSeekConnectionFromOverlay()` | 通过 `getLlmProvider().testConnection(input)` 测试连接，更新状态文本 | **无调用方** | **死代码** |
| `loadAiLlmPlayerSwitches(players)` | 从 localStorage 读取 AI LLM 开关（纯函数） | `scene-run.ts` 等场景初始化 | 活跃（有 11 个测试） |
| `saveAiLlmPlayerSwitches(value)` | 向 localStorage 写入 AI LLM 开关（纯函数） | 场景保存逻辑 | 活跃（有 5 个测试） |

#### llm-ui-bridge.ts（LlmUiBridge 单例）

| 方法/函数 | 职责 | 调用方 | 活跃/死代码 |
|-----------|------|--------|------------|
| `initialize()` | 初始化：绑定 providerSelect change、testBtn click、addProviderBtn、deleteProviderBtn、customProviderModal、autoSave 事件；刷新下拉；加载设置 | `main.ts` L190/L193 | 活跃 |
| `getCurrentProviderId()` | 读取 providerSelect 下拉值 | 内部多处 | 活跃 |
| `updateUiForProvider(providerId)` | 切换 Provider 时更新描述/占位符/删除按钮可见性/测试按钮文本 | `loadProviderSettings` 内部 | 活跃 |
| `loadProviderSettings(providerId)` | 从 `LlmManager.getProvider(id).loadSettings()` + `loadGlobalSettings()` 读取，写入 DOM 表单 | `initialize`、providerSelect change、`addCustomProvider`、`deleteCurrentProvider` | 活跃 |
| `saveProviderSettings(providerId)` | 从 DOM 表单读取，写入 `provider.saveSettings()` + `saveGlobalSettings()` + `LlmManager.setActiveProvider()` | autoSave change 事件、`testConnection`、providerSelect change（保存旧 provider） | 活跃 |
| `testConnection(providerId)` | 先 `saveProviderSettings`，再 `LlmManager.testConnection(id, settings)`，更新状态文本 | `initialize` 中 testBtn click 事件 | 活跃 |
| `getActiveProviderSettings()` | 返回活跃 Provider 的完整设置 | 外部（如 AI 模型配置面板） | 活跃 |
| `refreshProviderSelect(selectValue?)` | 重建 provider 下拉列表（内置 + 自定义） | `initialize`、`addCustomProvider`、`deleteCurrentProvider` | 活跃 |
| `showAddProviderModal()` / `hideAddProviderModal()` | 自定义 Provider 添加弹窗显示/隐藏 | `initialize` 中按钮事件 | 活跃 |
| `addCustomProvider()` | 通过 `LlmManager.createDynamicProvider` 创建自定义 Provider | `initialize` 中 customProviderConfirm 事件 | 活跃 |
| `deleteCurrentProvider()` | 通过 `LlmManager.deleteDynamicProvider` 删除自定义 Provider | `initialize` 中 deleteProviderBtn 事件 | 活跃 |
| `loadGlobalSettings()` / `saveGlobalSettings()` | 读写 `LLM_GLOBAL_SETTINGS_KEY` localStorage（纯函数） | 内部 `loadProviderSettings` / `saveProviderSettings` | 活跃 |
| `updateThinkingParamsVisibility` / `updateIndependentModelVisibility` / `updateMultiGameVisibility` | 根据 checkbox 状态切换 DOM 可见性 | `loadProviderSettings`、`initialize` 中 change 事件 | 活跃 |
| `BUILTIN_PROVIDERS` | 5 个内置 Provider 配置常量 | `getProviderConfig`、`refreshProviderSelect` | 活跃 |

### 1.3 重叠点清单

| # | 重叠维度 | llm-settings.ts | llm-ui-bridge.ts | 冲突说明 |
|---|----------|-----------------|-------------------|----------|
| 1 | **表单写入 DOM** | `fillLlmSettingsForm`：从 `getLlmSettings()` 读 → 写 DOM（含 apiKey/model/endpoint/enabled/各 checkbox/reflectionScope/autoSummarize/contextLength/independentReflection + visibility 切换） | `loadProviderSettings`：从 `provider.loadSettings()` + `loadGlobalSettings()` 读 → 写 DOM（含 apiKey/model/endpoint/maxTokens/timeoutMs/thinkingParams + 5 个 checkbox + visibility 切换） | **两者写同一组 DOM 元素**。打开设置面板时 `fillLlmSettingsForm` 覆盖 `loadProviderSettings` 的值；字段覆盖范围不同（`fillLlmSettingsForm` 多写 reflectionScope/autoSummarize/contextLength/independentReflection；`loadProviderSettings` 多写 maxTokens/timeoutMs/thinkingParams） |
| 2 | **表单读取 DOM** | `readLlmSettingsForm`：从 DOM 读 → 返回完整设置对象（15 字段） | `saveProviderSettings`：从 DOM 读 → 返回 provider 设置（6 字段）+ 写全局设置（5 字段） | 读取同一组 DOM 元素，但字段范围不同。`readLlmSettingsForm` 多读 reflectionScope/autoSummarize/contextLength/independentReflection/enabled/multiGameMemory/reflection/thinking；`saveProviderSettings` 多读 timeoutMs |
| 3 | **连接测试** | `testDeepSeekConnectionFromOverlay`：通过 `getLlmProvider().testConnection(input)` | `testConnection`：通过 `LlmManager.testConnection(providerId, settings)` | **llm-settings 的是死代码**（无调用方）。实际测试按钮绑定到 `LlmUiBridge.testConnection` |
| 4 | **状态显示** | `setLlmSettingsStatus`：操作 `self.dom.settingsLlmStatusText`（缓存 DOM 引用） | `testConnection` 内联操作 `els.statusText`（`getElementById("settingsLlmStatusText")`） | **同一 DOM 元素**，两种访问方式（缓存引用 vs 实时查询） |
| 5 | **全局设置存储** | 不直接存储（`saveSettingsFromOverlay` 在 `overlay/settings.ts` L253 直接写 `LLM_GLOBAL_SETTINGS_KEY`） | `saveGlobalSettings`：写 `LLM_GLOBAL_SETTINGS_KEY` | **全局设置被写 2 处**：`saveProviderSettings`（autoSave）和 `saveSettingsFromOverlay`（保存按钮）。两者写不同字段子集 |
| 6 | **可见性切换** | `fillLlmSettingsForm` 内联切换 thinkingParams/independentModel/contextLength/summaryConfig/reflectionScope 可见性 | `updateThinkingParamsVisibility` / `updateIndependentModelVisibility` / `updateMultiGameVisibility` 独立函数 | 3 处重复（还有 `events-ai-memory.ts` L394-401 第 4 处 independentModel 切换） |
| 7 | **DOM 引用方式** | `self.dom.*`（`scene-init.ts` cacheDom 缓存）+ `document.getElementById` 回退 | `getElements()` 每次实时 `document.getElementById` | 两套 DOM 访问机制并存 |

### 1.4 关键发现：死代码

`testDeepSeekConnectionFromOverlay()` **从未被任何代码调用**。测试按钮 `settingsTestLlmBtn`（index.html L668）的事件绑定由 `LlmUiBridge.initialize()` 执行，调用 `LlmUiBridge.testConnection()`。`testDeepSeekConnectionFromOverlay` 的 DOM 按钮 `settingsTestDeepSeekBtn` 是一个遗留别名（`scene-init.ts` L151-152: `getElementById("settingsTestDeepSeekBtn") || getElementById("settingsTestLlmBtn")`），但该别名从未绑定到任何 click 事件。

---

## 二、重叠根因

**历史演进导致重复**。

1. **llm-settings.ts 是旧体系**：源自单 Provider 时代（DeepSeek），设置存储在 `LLM_SETTINGS` 对象和 `DeepSeekProvider.getSettings()` 中。方法经 scene bridge 混入 `WarehouseScene.prototype`，通过 `this.fillLlmSettingsForm()` / `this.readLlmSettingsForm()` 调用。设计为"打开设置面板 → 填充表单 → 用户修改 → 保存"的同步流程。

2. **llm-ui-bridge.ts 是新体系**：引入多 Provider 支持（`LlmManager` + `BUILTIN_PROVIDERS` + 自定义 Provider），作为独立单例在 DOMContentLoaded 时自初始化。设计为"Provider 切换 → 自动加载 → 自动保存"的实时流程，绑定 `change` 事件实现 autoSave。

3. **新体系未替换旧体系**：`llm-ui-bridge.ts` 添加了 `loadProviderSettings` / `saveProviderSettings` 来操作同一组 DOM 元素，但未移除 `llm-settings.ts` 的 `fillLlmSettingsForm` / `readLlmSettingsForm`。`overlay/settings.ts` 仍使用旧体系的 `this.fillLlmSettingsForm()` / `this.readLlmSettingsForm()` / `this.setLlmSettingsStatus()`，而 `LlmUiBridge` 在后台通过 autoSave 独立读写同一组 DOM。

4. **结果**：两套表单 I/O 并行运行，字段覆盖范围不一致，全局设置写入分散在 2 处，可见性切换分散在 3+ 处。打开/关闭设置面板时，旧体系填充的值可能被新体系的 autoSave 覆盖（或反之），存在潜在的状态不一致风险。

---

## 三、去重/重新分工方案

### 方案 A：合并为一个模块

将 `llm-settings.ts` 的方法并入 `llm-ui-bridge.ts`，统一为单一 UI 桥接层。

- 优点：彻底消除重叠，单一数据流
- 缺点：**改动面巨大**。`fillLlmSettingsForm` / `readLlmSettingsForm` / `setLlmSettingsStatus` 经 scene bridge 混入原型，被 `overlay/settings.ts`（4 处）、`events-ai-memory.ts`（1 处）通过 `this.xxx()` 调用。合并需改所有调用方 + 类型声明（`warehouse-scene-this.d.ts` 4 处、`llm.d.ts` 4 处）。`llm-ui-bridge.ts` 从单例改为需与 scene 交互的模式，架构不匹配。

### 方案 B：明确分工，删除重叠部分（推荐）

将两模块按"职责层"分工，删除重叠代码，保留各自不可替代的部分。

**分工边界**：

| 职责 | 归属 | 理由 |
|------|------|------|
| 设置面板表单读写（`fillLlmSettingsForm` / `readLlmSettingsForm`） | **llm-settings.ts** | 经 scene bridge 混入原型，被 overlay/settings.ts 通过 `this.xxx()` 调用，与场景生命周期绑定 |
| 状态文本显示（`setLlmSettingsStatus`） | **llm-settings.ts** | 同上，被 `overlay/settings.ts` 调用 |
| AI LLM 开关读写（`loadAiLlmPlayerSwitches` / `saveAiLlmPlayerSwitches`） | **llm-settings.ts** | 纯函数，已有 16 个测试覆盖，与设置表单无关 |
| Provider 切换/选择/CRUD | **llm-ui-bridge.ts** | 依赖 `LlmManager`，需要独立于场景初始化 |
| 连接测试 | **llm-ui-bridge.ts** | `testConnection` 是活跃实现，已绑定到测试按钮 |
| 自动保存（autoSave） | **llm-ui-bridge.ts** | 绑定 `change` 事件，是实时保存机制 |
| 全局设置存储（`loadGlobalSettings` / `saveGlobalSettings`） | **llm-ui-bridge.ts** | 已有纯函数实现，应作为唯一写入入口 |
| 可见性切换 | **统一到 llm-ui-bridge.ts** | `updateThinkingParamsVisibility` 等独立函数更清晰，`fillLlmSettingsForm` 内联切换改为调用这些函数 |

**推荐：方案 B**。理由：

1. 两模块有本质不同的架构模式（scene bridge mixin vs. 独立单例），强行合并破坏架构一致性。
2. `llm-settings.ts` 的 3 个活跃方法（`fillLlmSettingsForm` / `readLlmSettingsForm` / `setLlmSettingsStatus`）深度耦合 scene bridge 调用链，迁移成本远大于保留成本。
3. 重叠部分中唯一真正死代码是 `testDeepSeekConnectionFromOverlay`，可安全删除。其余重叠通过"委托调用"消除即可，无需大范围迁移。
4. 风险最低，改动面最小，可分步执行。

---

## 四、详细改动计划（方案 B）

### 4.1 Phase 1：删除死代码（零风险）

**文件**：`scripts/llm/core/llm-settings.ts`

- 删除 `testDeepSeekConnectionFromOverlay` 方法（L253-L297，45 行）
- 删除 `LlmSettingsModuleThis` 接口中的 `deepSeekTesting`、`getLlmProvider`、`readLlmSettingsForm`（如果仅被死代码使用）字段
  - 注意：`getLlmProvider` 和 `readLlmSettingsForm` 仍被 `fillLlmSettingsForm` 使用，保留
  - `deepSeekTesting` 仅被 `testDeepSeekConnectionFromOverlay` 使用，删除

**文件**：`scripts/game/scene/warehouse-scene.ts`

- 删除 `deepSeekTesting: boolean` 属性声明（L164）
- 删除 `this.deepSeekTesting = false` 初始化（L285）

**文件**：`types/warehouse-scene-this.d.ts`

- 删除 `testDeepSeekConnectionFromOverlay(): Promise<void>` 声明（L919）

**文件**：`types/llm.d.ts`

- 删除 `testDeepSeekConnectionFromOverlay(): Promise<void>` 声明（L349）

**文件**：`scripts/game/scene/scene-init.ts`

- 删除 `settingsTestDeepSeekBtn` DOM 缓存（L151-152），该 DOM 引用仅被死代码使用

**文件**：`scripts/game/scene/warehouse-scene.ts`

- 删除 `settingsTestDeepSeekBtn: null` 属性声明（L461）

### 4.2 Phase 2：消除表单 I/O 重叠（委托模式）

目标：`llm-ui-bridge.ts` 的 `loadProviderSettings` 不再自行写 DOM，改为调用 `fillLlmSettingsForm`（经 scene 实例）；`saveProviderSettings` 不再自行读 DOM，改为调用 `readLlmSettingsForm`。

**问题**：`LlmUiBridge` 是独立单例，不持有 scene 引用。需要通过 `window.WarehouseScene.instance` 获取（已有先例：`addCustomProvider` 中 L641 已使用 `window.WarehouseScene.instance`）。

**文件**：`scripts/llm/core/llm-ui-bridge.ts`

- `loadProviderSettings(providerId)`：
  - 保留 Provider 切换逻辑（`LlmManager.setActiveProvider`、`updateUiForProvider`、`refreshProviderSelect`）
  - DOM 表单填充改为调用 `window.WarehouseScene.instance.fillLlmSettingsForm(getLlmSettings())`（`getLlmSettings` 已读取活跃 Provider 设置 + 全局设置）
  - 删除内联 DOM 写入代码（L354-L384，约 30 行）
  - 保留 `updateThinkingParamsVisibility` / `updateIndependentModelVisibility` / `updateMultiGameVisibility` 调用（`fillLlmSettingsForm` 内联切换改为调用这些函数，见 Phase 3）

- `saveProviderSettings(providerId)`：
  - DOM 表单读取改为调用 `window.WarehouseScene.instance.readLlmSettingsForm()`
  - 从返回值中提取 provider 字段（apiKey/endpoint/model/maxTokens/timeoutMs/thinkingParams）写入 `provider.saveSettings()`
  - 从返回值中提取全局字段写入 `saveGlobalSettings()`
  - 保留 `LlmManager.setActiveProvider(providerId)`
  - 删除内联 DOM 读取代码（L429-L452，约 23 行）

**风险**：`loadProviderSettings` 在 `initialize()` 时调用，此时 `window.WarehouseScene.instance` 可能尚未创建。需要加 guard：若 scene 未就绪，回退到当前的直接 DOM 操作逻辑（或延迟到 scene ready 后再加载）。这是本方案的主要风险点。

**缓解**：`initialize()` 在 `main.ts` L190 中调用，此时 scene 已创建（`new WarehouseScene(...)` 在 L186）。但更安全的做法是在 `initialize` 中检查 `window.WarehouseScene?.instance`，若不存在则回退到当前逻辑。

### 4.3 Phase 3：统一可见性切换

**文件**：`scripts/llm/core/llm-settings.ts`

- `fillLlmSettingsForm` 中的内联可见性切换（thinkingParams L93-L99、contextLengthInline L101-L108、summaryConfig L109-L116、reflectionScopeConfig L125-L132、independentModelConfig L148-L154）改为调用 `LlmUiBridge` 的 `updateThinkingParamsVisibility` / `updateMultiGameVisibility` / `updateIndependentModelVisibility`
- 但这些函数接收 `UiElements` 参数（需 `getElements()`），而 `fillLlmSettingsForm` 使用 `self.dom`。需要将 `LlmUiBridge` 的 visibility 函数改为接收通用的 DOM 查询或导出为独立函数

**备选（更简单）**：`fillLlmSettingsForm` 保留内联切换（它已经工作），仅删除 `events-ai-memory.ts` L394-401 的重复 independentModel 切换（改为调用 `LlmUiBridge.updateIndependentModelVisibility`）。这样改动最小。

### 4.4 Phase 4：统一全局设置写入

**文件**：`scripts/game/ui/overlay/settings.ts`

- `saveSettingsFromOverlay`（L226-L315）中的全局设置写入（L241-L254）改为调用 `LlmUiBridge` 的 `saveGlobalSettings`（需 export）
- 从 `readLlmSettingsForm()` 返回值中提取全局字段，传入 `saveGlobalSettings`
- 删除直接 `localStorage.setItem(LLM_GLOBAL_SETTINGS_KEY, ...)` 代码
- 移除 `import { LLM_GLOBAL_SETTINGS_KEY }` （L22），改为 `import { saveGlobalSettings } from "..."`（需 `llm-ui-bridge.ts` export `saveGlobalSettings`）

**文件**：`scripts/llm/core/llm-ui-bridge.ts`

- export `saveGlobalSettings` 和 `loadGlobalSettings`（供外部调用）

### 4.5 Phase 5（可选）：统一 DOM 引用方式

将 `llm-settings.ts` 中的 `document.getElementById` 直接调用统一为 `self.dom.*`（需在 `scene-init.ts` cacheDom 中补充缓存缺失的元素：`thinkingParams`、`contextLengthInline`、`summaryConfig`、`reflectionScopeConfig`、`autoSummarizeEnabled`、`contextLength`、`llmEndpoint`、`llmModel`、`llmApiKey`、`llmIndependentModelEnabled`、`llmIndependentReflectionEnabled`）。此为代码质量改进，不影响功能，优先级最低。

---

## 五、行为保持

| 行为 | 改动前 | 改动后 | 保证方式 |
|------|--------|--------|----------|
| 打开设置面板时填充表单 | `fillLlmSettingsForm` 读 `getLlmSettings()` 写 DOM | 不变 | Phase 2 不改 `fillLlmSettingsForm` |
| 保存设置时读取表单 | `readLlmSettingsForm` 读 DOM 返回对象 | 不变 | Phase 2 不改 `readLlmSettingsForm` |
| Provider 切换时加载设置 | `loadProviderSettings` 读 Provider 写 DOM | `loadProviderSettings` 委托 `fillLlmSettingsForm` 写 DOM | `getLlmSettings()` 内部也读活跃 Provider，数据源一致 |
| autoSave | `saveProviderSettings` 读 DOM 写 Provider | `saveProviderSettings` 委托 `readLlmSettingsForm` 读 DOM | 读取同一组 DOM 元素，返回值字段超集，提取所需字段 |
| 测试连接 | `LlmUiBridge.testConnection` | 不变 | 不改动 |
| 状态文本 | `setLlmSettingsStatus` + `testConnection` 内联 | 不变 | 两者操作同一 DOM 元素，保留各自调用路径 |
| 全局设置存储 | `saveProviderSettings` + `saveSettingsFromOverlay` 两处写 | 统一通过 `saveGlobalSettings` | 字段合并后写入同一 key |
| 可见性切换 | 4 处重复 | `fillLlmSettingsForm` 内联 + `LlmUiBridge` 独立函数 | 删除 `events-ai-memory.ts` 重复处 |

---

## 六、验证

### 6.1 类型检查

```bash
npx tsc --noEmit
# 预期：0 error（本任务文件）
# 注意：有并行子代理在改 llm/providers + llm-manager + provider-factory，
#       若 tsc 报错来自那些文件，说明是并行流中途状态，非本任务改动
```

### 6.2 测试

```bash
npm run test
# 预期：1089 通过（当前基线，实际以最新为准）
# 重点：
#   - tests/llm/core/llm-settings.test.ts（16 个测试）不受影响
#   - 无 llm-ui-bridge.test.ts（无现有测试，Phase 2 后可考虑新增）
```

### 6.3 Lint

```bash
npm run lint
# 预期：0 error（~305 warning，与基线一致）
```

### 6.4 手动验证（运行时）

无法在 CI 覆盖的场景，需手动验证：

1. 打开设置面板 → 表单填充正确（apiKey/model/endpoint/各 checkbox）
2. 切换 Provider → 表单更新为新 Provider 设置
3. 修改设置 → autoSave 生效（刷新页面后值保持）
4. 点击"测试连接" → 状态文本正确显示（成功/失败/异常）
5. 保存设置 → 全局设置和 Provider 设置均写入 localStorage
6. 添加/删除自定义 Provider → 下拉列表更新、表单切换正常
7. 开关 thinkingEnabled → thinkingParams 区域显示/隐藏
8. 开关 independentModelEnabled → independentModelConfig 区域显示/隐藏
9. 开关 multiGameMemoryEnabled → contextLength/summaryConfig 区域显示/隐藏

---

## 七、风险点

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|----------|
| `initialize()` 时 scene 未就绪 | **中** | Phase 2 中 `loadProviderSettings` 委托 `fillLlmSettingsForm` 需 scene 实例，但 `initialize` 可能先于 scene 创建执行 | 加 guard：`window.WarehouseScene?.instance` 存在时委托，否则回退到直接 DOM 操作；或确认 `main.ts` 中初始化顺序（L186 `new WarehouseScene` → L190 `LlmUiBridge.initialize()`） |
| 字段覆盖范围不一致 | **中** | `fillLlmSettingsForm` 不写 maxTokens/timeoutMs/thinkingParams（`loadProviderSettings` 写），委托后这些字段不填充 | 在 `fillLlmSettingsForm` 中补充 maxTokens/timeoutMs/thinkingParams 字段的填充，或保留 `loadProviderSettings` 对这些字段的直接写入 |
| autoSave 与 saveSettingsFromOverlay 冲突 | **低** | 两者都写全局设置，改为统一 `saveGlobalSettings` 后字段需完全对齐 | 对比两处写入的字段集，确保 `saveGlobalSettings` 接收的 Partial<LlmGlobalSettings> 覆盖所有字段 |
| `events-ai-memory.ts` visibility 重复删除 | **低** | 删除 L394-401 的 independentModel change handler 后，该事件由 `LlmUiBridge.initialize` 中的 handler 处理 | 确认 `LlmUiBridge.initialize` 的 independentModelCheckbox change 事件已绑定 `updateIndependentModelVisibility`（已确认 L806-L810） |
| 并行流冲突 | **低** | 并行子代理在改 `llm/providers/` + `llm-manager.ts` + `provider-factory.ts`，本任务不碰这些文件 | 严格限制改动文件范围；tsc 报错来自那些文件时说明是并行流中途状态 |

---

## 八、执行优先级

| 优先级 | Phase | 改动量 | 风险 | 建议 |
|--------|-------|--------|------|------|
| P0 | Phase 1（删除死代码） | ~60 行删除 | 零 | 立即执行 |
| P1 | Phase 4（统一全局设置写入） | ~20 行改动 | 低 | 可独立执行 |
| P2 | Phase 3（统一可见性切换） | ~10 行改动 | 低 | 可独立执行 |
| P3 | Phase 2（委托表单 I/O） | ~80 行改动 | 中 | 需手动验证，建议单独 PR |
| P4 | Phase 5（统一 DOM 引用） | ~50 行改动 | 低 | 可选，代码质量改进 |

---

## 九、结论

`llm-settings.ts` 与 `llm-ui-bridge.ts` 的职责重叠是**历史演进导致的重复**，非分工不清。旧体系（llm-settings，单 Provider 时代）在新体系（llm-ui-bridge，多 Provider 时代）引入后未被清理。

**推荐方案 B（明确分工 + 删除重叠）**，分 5 个 Phase 执行：
- Phase 1 删除死代码 `testDeepSeekConnectionFromOverlay`（零风险，立即可做）
- Phase 2-4 消除表单 I/O、全局设置、可见性切换的重叠（需手动验证）
- Phase 5 可选代码质量改进

**风险等级：中**（主要风险在 Phase 2 的初始化时序和字段覆盖范围）。

**建议执行**：Phase 1 立即执行，Phase 2-4 作为一个独立 PR 执行（需手动验证 9 项运行时行为）。
