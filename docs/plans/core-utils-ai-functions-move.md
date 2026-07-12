# core/utils.ts AI 专用函数迁移计划

> task-list #10 · 调研 + 迁移计划 · 2026-07-12
> 范围：`scripts/game/core/utils.ts` 中 4 个 AI 专用函数错位问题
> 约束：本计划只调研 + 写计划，不改代码

## 0. 结论摘要

| 函数 | core/utils.ts 现状 | 生产调用方 | 是否真 AI 专用 | 推荐归处 |
|------|-------------------|-----------|---------------|---------|
| `normalizeActionToken` | 活跃 | main.ts（注入 LLM 桥） | 是（仅 LLM 用） | `scripts/llm/core/llm-error.ts` |
| `isNoneActionText` | 活跃 | main.ts（注入 LLM 桥） | 是（仅 LLM 用） | `scripts/llm/core/llm-error.ts` |
| `tryExtractDecisionJson` | **死代码（重复定义）** | 无（生产无人从 core/utils 导入） | 是 | **删除**（活版本已在 `llm-error.ts`） |
| `createEmptyAiPrivateIntelPool` | 活跃 | `ai/intel/init.ts` | 是（仅 AI 情报用） | `scripts/game/ai/intel/pure.ts` |
| `safeParseJson`（附带发现） | **死代码（重复定义）** | 无（仅被 core/utils 内部死代码引用） | 是 | **删除**（活版本已在 `llm-error.ts`） |

**核心结论**：
1. 4 个函数确为 AI 专用，无通用模块消费。
2. `tryExtractDecisionJson` 在 `core/utils.ts` 是 **已失效的重复定义**——活版本 `scripts/llm/core/llm-error.ts:27` 已被 `llm-prompt.ts` 实际导入。`safeParseJson` 同理（core/utils 内的副本仅服务于死代码 `tryExtractDecisionJson` + 自身测试）。
3. **推荐"按消费方分散归位"，不建聚合文件**：建 `ai/common.ts` 会让 llm/ 反向依赖 ai/（llm 当前是 ai 的下层），引入跨子系统循环风险。按实际消费方归位可零跨子系统依赖。
4. `normalizeActionToken`/`isNoneActionText` 经依赖注入（DI）流向 LLM 子系统——生产侧唯一需改的 import 在 `main.ts`；`llm-prompt.ts`/`decision/request.ts` 经 `deps` 接收，不感知来源。

## 1. 4 函数调用方清单

### 1.1 `normalizeActionToken(value: string): string`
- 定义：`scripts/game/core/utils.ts:165`
- 内部依赖：被 `isNoneActionText`（同文件）调用
- 生产导入方：

| 文件 | 用途 |
|------|------|
| `scripts/game/main.ts:28` | 从 core/utils 导入，作为 `createSceneLlmBridge(deps)` 的依赖项注入（main.ts:103） |

- DI 下游消费（不直接 import，经 deps 接收）：
  - `scripts/llm/core/llm-prompt.ts`：`LlmPromptDeps.normalizeActionToken`（接口声明 L23），用于动作名归一化匹配（L553、L558）
- 测试导入方：`tests/game/core/utils.test.ts:17`（3 个用例：L247-257）
- 文档引用：`docs/reference/data-layer.md:216`
- **判定：AI 专用**（唯一生产消费者是 LLM 桥）

### 1.2 `isNoneActionText(value: string): boolean`
- 定义：`scripts/game/core/utils.ts:171`
- 内部依赖：调用 `normalizeActionToken`（必须与之间处）
- 生产导入方：

| 文件 | 用途 |
|------|------|
| `scripts/game/main.ts:29` | 从 core/utils 导入，注入 `createSceneLlmBridge(deps)`（main.ts:104） |

- DI 下游消费：
  - `scripts/llm/core/llm-prompt.ts`：`LlmPromptDeps.isNoneActionText`（L24），用于动作名空值判定（L549）
  - `scripts/llm/core/decision/types.ts:95`：`LlmDecisionDeps.isNoneActionText`（接口声明）
  - `scripts/llm/core/decision/request.ts:567`：经 `deps` 解构，用于 followup 动作合法性检查（L599-600）
- 测试导入方：`tests/game/core/utils.test.ts:18`（参数化用例 L259-272，共 12 条数据）
- 测试 mock：`tests/llm/core/llm-decision.test.ts:29`（mock 实现，不从 core/utils 导入）
- **判定：AI 专用**（唯一生产消费者是 LLM 桥 + LLM 决策子系统）

### 1.3 `tryExtractDecisionJson(rawText: string): any`
- 定义：`scripts/game/core/utils.ts:184`（返回类型 `any`）
- 内部依赖：调用 `safeParseJson`（同文件 L176）
- **生产导入方：无**
  - `llm-prompt.ts:12` 导入的是 `scripts/llm/core/llm-error.ts` 的同名函数（`import { tryExtractDecisionJson } from './llm-error.js'`），**不是** core/utils 的版本
  - `main.ts` 的 import 列表（L21-35）不含本函数
- 测试导入方：`tests/game/core/utils.test.ts:20`（6 个用例 L286-308）
- **重复定义**：`scripts/llm/core/llm-error.ts:27` 已有同名函数（返回类型 `Record<string, any> | null`，更精确），且被 `llm-error.test.ts` 覆盖（11 个用例 L24-54，更全面）
- **判定：AI 专用，但 core/utils 副本是死代码**——活版本已在 `llm-error.ts`

### 1.4 `createEmptyAiPrivateIntelPool(): AiPrivateIntelPool`
- 定义：`scripts/game/core/utils.ts:225`
- 生产导入方：

| 文件 | 用途 |
|------|------|
| `scripts/game/ai/intel/init.ts:16` | 从 `../../core/utils` 导入，用于初始化 AI 私有情报池（L40 `initAiIntelSystems`、L135 `ensureAiPrivateIntel`） |

- 测试导入方：`tests/game/core/utils.test.ts:22`（2 个用例 L325-345）
- 全局类型声明：`types/globals.d.ts:88`（`MobaoUtils.createEmptyAiPrivateIntelPool`——但 `window.MobaoUtils` 全项目无实际赋值，属遗留死声明，见 §5）
- **判定：AI 专用**（唯一生产消费者是 AI 情报子系统）

### 1.5 附带发现：`safeParseJson(text: string): any`
- 定义：`scripts/game/core/utils.ts:176`
- 生产导入方：无（仅被同文件死代码 `tryExtractDecisionJson` 内部调用）
- 重复定义：`scripts/llm/core/llm-error.ts:19`（返回类型 `unknown`，更安全），已被 `llm-error.test.ts` 覆盖
- 测试导入方：`tests/game/core/utils.test.ts:19`（3 个用例 L274-283）
- **判定：死代码副本**，随 `tryExtractDecisionJson` 一并清理

## 2. 迁移方案

### 2.1 方案选型：分散归位 vs 聚合文件

| 方案 | 说明 | 评估 |
|------|------|------|
| A. 新建 `scripts/game/ai/common.ts` 聚合 4 函数 | 任务简报提议 | **否决**：`normalizeActionToken`/`isNoneActionText` 仅被 llm/ 消费，放入 ai/common 会让 llm/ 反向 import ai/，造成 llm→ai 跨子系统依赖（llm 是 ai 的下层）。`tryExtractDecisionJson` 是死代码无需聚合。 |
| B. 新建 `scripts/llm/core/llm-text.ts` 聚合 LLM 文本解析 | 收纳 normalize/isNone + safeParse/tryExtract | 可行但多建一文件，且需把 safeParse/tryExtract 从 llm-error.ts 搬出，改动面大 |
| C. **分散归位（推荐）** | 按消费方子系统就近放置 | **采纳**：零跨子系统依赖，改动最小，符合既有 `pure.ts` 模式 |

### 2.2 各函数去向（方案 C）

#### `createEmptyAiPrivateIntelPool` → `scripts/game/ai/intel/pure.ts`
- **理由**：唯一消费方是 `ai/intel/init.ts`；`intel/pure.ts` 已是情报子系统纯函数集（pickRandomItemCell、calcUncertainty 等），情报池工厂是情报数据构造纯函数，语义一致。
- **类型依赖**：需新增 `import type { AiPrivateIntelPool } from "../../../../types/ai"`（pure.ts 已从该模块导入 `AiSignalStats`，路径已存在）。
- **无循环风险**：pure.ts 不 import init.ts；init.ts 改为从 `./pure` 导入。

#### `normalizeActionToken` + `isNoneActionText` → `scripts/llm/core/llm-error.ts`
- **理由**：
  1. 唯一生产消费方是 LLM 子系统（main.ts 注入 LLM 桥 → llm-prompt / decision 经 deps 消费）。
  2. `llm-error.ts` 已是 LLM 输出解析工具集（`safeParseJson` + `tryExtractDecisionJson` 已在此），动作令牌归一化属同类"LLM 响应文本解析"职责，归一处便于维护。
  3. `llm-prompt.ts` 已 `import ... from './llm-error.js'`，新增同源导入自然。
  4. `isNoneActionText` 依赖 `normalizeActionToken`，二者必须同处——一并放入 llm-error.ts。
- **无循环风险**：llm-error.ts 仅 import 类型（`types/warehouse-scene-this`、`types/game`），不 import core/utils 或 ai/。main.ts 改为从 `../llm/core/llm-error` 导入这两个函数。
- **DI 不变**：`LlmPromptDeps`（llm-prompt.ts L23-24）、`LlmDecisionDeps`（decision/types.ts L95）接口声明不变；llm-prompt/decision/request 仍经 `deps` 接收，**无需改动**。仅 main.ts 的导入来源换。

#### `tryExtractDecisionJson` + `safeParseJson`（core/utils 副本）→ **删除**
- **理由**：core/utils.ts 的两个副本是死代码——生产无导入（活版本在 llm-error.ts 已被 llm-prompt.ts 实际使用）。迁移无意义，应直接删除。
- `llm-error.ts` 版本保留（`safeParseJson` 返回 `unknown`、`tryExtractDecisionJson` 返回 `Record<string, any> | null`，类型更精确，以 llm-error 版为准）。
- **测试去重**：`tests/game/core/utils.test.ts` 的 `safeParseJson`（L274-283，3 用例）和 `tryExtractDecisionJson`（L286-308，6 用例）是 `tests/llm/core/llm-error.test.ts`（safeParseJson 6 用例 + tryExtractDecisionJson 11 用例）的子集重复——删除 core/utils.test.ts 中的重复块，**零覆盖损失**。

### 2.3 为什么不放入 `llm/core/decision/pure.ts`
- `decision/pure.ts` 是决策模块纯函数（索引解析、模型校验、标签渲染）。`normalizeActionToken` 被 `llm-prompt.ts`（decision 的兄弟模块）用，放入 decision/pure 会让 llm-prompt 反向 import decision/，虽无硬性分层禁止，但不如放 llm-error.ts（llm-prompt 已依赖）自然。
- `isNoneActionText` 虽被 decision/request 用，但经 deps 接收不直接 import，归处不影响 decision 侧。

## 3. 消费方 import 更新清单

### 生产代码
| 文件 | 改动 |
|------|------|
| `scripts/game/core/utils.ts` | 删除 `normalizeActionToken`、`isNoneActionText`、`tryExtractDecisionJson`、`safeParseJson`、`createEmptyAiPrivateIntelPool` 五个函数定义；删除 `import type { AiPrivateIntelPool }` （若无其他引用）；更新文件头 `@description` 去除"AI 情报池初始化"等表述 |
| `scripts/game/main.ts` | L28-29：`normalizeActionToken, isNoneActionText` 的导入源从 `"./core/utils"` 改为 `"../llm/core/llm-error"`（合并到现有 llm/core 导入或新增一行） |
| `scripts/game/ai/intel/init.ts` | L16：`createEmptyAiPrivateIntelPool` 导入源从 `"../../core/utils"` 改为 `"./pure"`；`shuffle` 仍从 `../../core/utils` 导入（保留） |
| `scripts/llm/core/llm-error.ts` | 新增 `normalizeActionToken`、`isNoneActionText` 两个函数定义；更新文件头 `@description` 增加"动作令牌归一化"职责；`@exports` 补两函数 |
| `scripts/game/ai/intel/pure.ts` | 新增 `createEmptyAiPrivateIntelPool` 函数定义 + `import type { AiPrivateIntelPool }`；更新 `@exports` |

### 无需改动（DI 隔离）
- `scripts/llm/core/llm-prompt.ts`：经 `deps` 接收，不改 import（仍从 `./llm-error.js` 导入 `tryExtractDecisionJson`，不变）
- `scripts/llm/core/decision/types.ts`、`decision/request.ts`：经 `deps` 接收，不改
- `scripts/llm/core/scene-llm.ts`：透传 deps，不改

### 测试代码
| 文件 | 改动 |
|------|------|
| `tests/game/core/utils.test.ts` | 移除 `normalizeActionToken`、`isNoneActionText`、`createEmptyAiPrivateIntelPool` 的 import（L17-18、L22）与对应 describe 块（L247-272、L325-345）；移除 `safeParseJson`、`tryExtractDecisionJson` 的 import（L19-20）与重复 describe 块（L274-308） |
| `tests/llm/core/llm-error.test.ts` | 新增 `normalizeActionToken`、`isNoneActionText` 的 import + describe 块（从 utils.test.ts 迁入用例，保持断言不变） |
| 新建或扩展 `tests/game/ai/intel/pure.test.ts`（若已存在则扩展） | 新增 `createEmptyAiPrivateIntelPool` 的 import + describe 块（从 utils.test.ts 迁入 L325-345 用例，保持断言不变） |

> 注：`tests/llm/core/llm-decision.test.ts:29` 的 `isNoneActionText` 是 mock 实现，不从任何源导入，无需改动。

## 4. 行为保持

- 函数逻辑 **逐字不变**，只换定义文件 + import 路径。
- `normalizeActionToken`/`isNoneActionText` 经 DI 流向下游，下游模块零改动。
- `tryExtractDecisionJson`/`safeParseJson` 的 core/utils 副本删除后，活版本（llm-error.ts）行为与副本一致（算法相同：直接解析 → 代码块 → 首尾花括号），仅返回类型更精确（`Record<string,any>|null` / `unknown`），不影响调用方（调用方已按 llm-error 版类型使用）。
- 测试断言原样迁移，等价性不变。

## 5. 附带清理（可选，低风险）

- `types/globals.d.ts:87-99` 的 `declare var MobaoUtils` 全项目无实际赋值（grep `MobaoUtils =` / `window.MobaoUtils` 仅命中 utils.ts 头注释），属遗留死声明。其中 `createEmptyAiPrivateIntelPool`（L88）随本迁移可一并从该声明移除。完整移除 `MobaoUtils` 全局声明需单独评估（其他字段如 clamp/shuffle 的全局声明是否仍有运行时引用），**本任务不强制处理**，仅记录。
- `scripts/game/core/utils.ts` 文件头注释 `@exports window.MobaoUtils` 已过时，建议更正为命名导出说明。
- `scripts/game/ai/bidding.ts:30`、`bidding/index.ts:30` 等处 `@requires MobaoUtils` 注释亦过时（实际经 ES module 导入），可顺手更正，非必须。

## 6. 验证

迁移完成后执行：

```bash
npx tsc --noEmit          # 期望 0 error（警告忽略，非本任务文件的可能有并行流瞬时错误）
npm run test              # 期望：活函数迁移不增不减用例；死代码去重使总数 -9（3 safeParseJson + 6 tryExtractDecisionJson 重复用例），零覆盖损失
npm run lint              # 期望 0 error
npx prettier --check scripts/game/core/utils.ts scripts/llm/core/llm-error.ts scripts/game/ai/intel/pure.ts scripts/game/ai/intel/init.ts scripts/game/main.ts
```

**测试基线说明**：最近提交（179b44b）记 1026 用例；任务简报引 1089。执行前先 `npm run test` 确认当前基线 N，迁移后期望：
- 若执行死代码去重：N - 9
- 若仅迁活函数（保留 utils.test.ts 重复块指向新来源）：N 不变
- 推荐执行去重（llm-error.test.ts 已有更全面覆盖）

**重点核查**：
- `tests/llm/core/llm-error.test.ts` 的 `tryExtractDecisionJson` 用例覆盖 ≥ core/utils 旧用例（已确认：11 > 6）
- `tests/llm/core/llm-error.test.ts` 的 `safeParseJson` 用例覆盖 ≥ core/utils 旧用例（已确认：6 > 3）

## 7. 风险点

| 风险 | 等级 | 说明与缓解 |
|------|------|-----------|
| llm→ai 跨子系统循环依赖 | 高（已规避） | 不建 ai/common.ts；normalize/isNone 放 llm/，createPool 放 ai/，各子系统自给自足，零跨向 import |
| `isNoneActionText` 与 `normalizeActionToken` 分离 | 中（已规避） | 二者必须同处（isNone 调用 normalize），方案中明确一并放入 llm-error.ts |
| DI 契约漂移 | 低 | 接口声明（LlmPromptDeps/LlmDecisionDeps）不变，仅 main.ts 导入源换；llm-prompt/decision 零改动 |
| 死代码去重导致测试数下降 | 低 | -9 用例均为 llm-error.test.ts 已覆盖的子集；若需严格保数可暂留 utils.test.ts 重复块改指向 llm-error |
| globals.d.ts `MobaoUtils` 死声明 | 低 | 不影响编译（仅类型声明）；本任务仅移除其中 `createEmptyAiPrivateIntelPool` 项，其余字段保留待单独评估 |
| 并行流文件冲突 | 中 | 本任务涉及 5 个生产文件 + 3 个测试文件；intel/init.ts、main.ts、utils.ts 在 git status 中已是 M 状态（并行流），实施时需基于最新工作区 |
| `tryExtractDecisionJson` 返回类型差异 | 低 | core/utils 版返回 `any`，llm-error 版返回 `Record<string,any>\|null`；删除 core/utils 版后无调用方受影响（本就无人导入） |

## 8. 实施顺序建议

1. 在 `llm-error.ts` 末尾新增 `normalizeActionToken` + `isNoneActionText`（从 utils.ts 逐字复制）
2. 在 `ai/intel/pure.ts` 新增 `createEmptyAiPrivateIntelPool`（从 utils.ts 逐字复制 + 类型 import）
3. 改 `main.ts`：normalize/isNone 导入源切到 `../llm/core/llm-error`
4. 改 `ai/intel/init.ts`：createPool 导入源切到 `./pure`
5. 从 `core/utils.ts` 删除 5 个函数定义 + 过时类型 import
6. 迁移测试：utils.test.ts 三个活函数 describe 块 → llm-error.test.ts（normalize/isNone）+ intel/pure.test.ts（createPool）；删除 utils.test.ts 中 safeParseJson/tryExtractDecisionJson 重复块
7. 跑验证（§6）

预计改动：5 生产文件 + 3 测试文件，净删 ~90 行（utils.ts 减 5 函数 + 死测试去重），净增 ~75 行（llm-error.ts + intel/pure.ts + 迁入测试）。
