# scripts/game/ai/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| index.ts | 5 | barrel 导出，re-export 5个 Mixin |
| bidding.ts | 1223 | AI 出价引擎（人格、信心、8步出价算法、情报动作规划、工具效果评估） |
| intel.ts | 1643 | AI 情报系统（情报池、揭示、信号统计、高价值追踪、资源管理、LLM纠错） |
| memory.ts | 753 | AI 跨局记忆（对话历史、经验本、持久化、导入导出、记忆面板UI） |
| reflection.ts | 764 | AI 局后反思（LLM反思、prompt构建、结果解析、经验本更新、UI状态） |
| wallet.ts | 109 | AI 钱包管理（初始化/加载/保存/余额查询/出价规范化） |
| game-history.ts | 187 | AI 多局历史持久化（CRUD、上下文构建、导入导出） |
| context-builder.ts | 301 | AI 上下文构建器（纯数据转换，供 LLM 使用） |
| summarizer.ts | 86 | AI 定期总结（判断/构建prompt/解析结果） |
| decision.ts | — | AI 决策面板渲染 |

## 逐文件职责问题

### bidding.ts (1223行)
- **职责过于集中**：出价算法 + 情报动作规划（`planIntelAction`）+ 工具效果评估（`buildToolEffect`）三个不同领域混在一起
- **工具函数重复定义**：底部重新定义了 `clamp`、`roundToStep`、`randomBetween`（1213-1223行），`core/utils.ts` 已有这些函数
- **类型定义内联**：12个 interface 定义在文件顶部，部分与 `types/ai.ts` 重复

### intel.ts (1643行) — 最严重
- **职责严重过载（God Object）**：至少 8 个不相关职责：情报池管理、藏品揭示执行、空间推理、高价值追踪、资源管理、UI头像刷新、LLM纠错流程、动作执行与LAN通信
- **混入UI逻辑**：`refreshAllPlayerAvatars` 是DOM操作
- **混入LAN通信**：`processSingleAiIntelAction` 直接调用 `this.lanBridge.send()`
- **混入游戏流程控制**：`processAiIntelActions` 的 finally 块包含 `resolveRoundBids("all-ready")`

### memory.ts (753行)
- **混入UI逻辑**：`openAiMemoryPanel()` 和 `setupAiMemoryTouchScroll()` 是纯DOM操作
- **默认统计值重复4次**：`defaultStats` 对象在 3 个方法中重复定义
- **与 reflection.ts 职责交叉**：反思系统直接操作记忆存储层

### reflection.ts (764行)
- **混入UI逻辑**：`updateReflectionStatusUI`、`showReflectionPendingDialog`/`ForBack` 是DOM操作（两个Dialog方法几乎完全重复）
- **混入游戏流程控制**：`proceedToNewRun` 和 `proceedToBack` 控制游戏流转
- **triggerAiReflection 过长（~420行）**

### wallet.ts (109行)
- **设计最佳**：职责单一，边界明确
- 小问题：轻微耦合 LAN 状态

### game-history.ts (187行)
- **设计良好**：纯数据层，无UI/无DOM/无场景依赖
- 小问题：混用全局挂载和模块导入两种模式

### context-builder.ts (301行)
- **设计良好**：纯函数设计，不修改场景状态
- 小问题：隐式依赖 `bidding.ts` 的 `personalityMap`

### summarizer.ts (86行)
- **设计良好**：纯逻辑无副作用

## 依赖关系

```
bidding.ts (独立，但本地重复 utils)
intel.ts → bidding.ts (planIntelAction/buildToolEffect)
memory.ts → core/constants, core/utils, game-history.ts
reflection.ts → memory.ts, game-history.ts, audio
decision.ts → bidding.ts, core/utils
context-builder.ts → data/*, bidding.ts (personalityMap)
wallet.ts → core/settings, core/utils
summarizer.ts (独立)
```

## 整体评价

**优点**：Mixin 模式统一、职责分层有意识（bidding/intel/memory/reflection/wallet）、wallet/game-history/context-builder/summarizer 设计精良。

**核心问题**：
| 问题 | 严重度 | 文件 |
|------|--------|------|
| intel.ts 职责过载（1643行，8个职责） | **高** | intel.ts |
| bidding.ts 职责过载（1223行） | **中高** | bidding.ts |
| UI逻辑散落在非UI文件中 | **中** | memory, reflection, intel |
| 游戏流程控制嵌入AI模块 | **中** | intel, reflection |
| LAN通信耦合 | **中** | intel.ts |
| 默认统计值重复4次 | **中** | memory.ts |

## 改进建议

1. 拆分 `intel.ts`：intel-pool / intel-actions / intel-tracker / llm-correction.ts
2. 拆分 `bidding.ts`：将 planIntelAction 和 buildToolEffect 移到独立的 `tool-planner.ts`
3. 统一存储默认值：提取 `createDefaultStats()` 消除4处重复
4. UI逻辑集中化：DOM操作抽取到 `*-ui.ts` 文件
5. 统一导出方式：全部通过 export 导出，由 index.ts barrel export
