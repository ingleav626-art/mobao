# scripts/llm/ 文件夹分析

## 文件清单

### core/ 子目录

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| llm-manager.ts | 1267 | LLM Provider 注册/切换/请求转发、工厂函数、Token监控、自定义Provider持久化 |
| llm-decision.ts | 1685 | LLM 决策全流程：请求规划、追问、纠错、批量决策、遥测、面板DOM渲染 |
| llm-prompt.ts | 719 | Payload 组装、Prompt构建、JSON提取、动作解析、Plan标准化 |
| llm-error.ts | 194 | JSON安全解析、LLM错误分类、Toast通知、Badge DOM |
| llm-settings.ts | 305 | 设置表单读写、连接测试、玩家开关持久化 |
| llm-ui-bridge.ts | 939 | LLM 设置面板 UI 交互：Provider切换、表单绑定、自定义Provider弹窗 |
| scene-llm.ts | 45 | 场景 LLM 桥接器入口，组装 settings/prompt/decision |
| prompts.ts | 65 | LLM 决策 System Prompt 模板 |

### providers/ 子目录

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| deepseek-provider.ts | 185 | DeepSeek Provider 配置 + 注册 |
| openai-provider.ts | 153 | OpenAI Provider 配置 + 注册 |
| qwen-provider.ts | 152 | 通义千问 Provider 配置 + 注册 |
| glm-provider.ts | 149 | 智谱 GLM Provider 配置 + 注册 |
| kimi-provider.ts | 125 | Moonshot Kimi Provider 配置 + 注册 |
| deepseek-llm.ts | 719 | DeepSeek 旧版独立实现（**历史遗留**） |

## 逐文件职责问题

### llm-manager.ts (1267行)
- **职责过重**：同时承担 Provider 注册表、请求代理、工厂函数、Token监控、日志系统、工具函数集、设置持久化 7 项职责

### llm-decision.ts (1685行) — 全目录最大
- **职责过重**：决策逻辑 + 遥测数据结构 + DOM渲染（HTML拼接 ~250行）+ 消息缓存管理

### llm-prompt.ts (719行)
- `buildAiDecisionMessages` 和 `buildAiDecisionUserPrompt` 之间存在逻辑重复（轮次信息计算、最终轮提示拼接在两处各写一遍）

### llm-settings.ts (305行) 与 llm-ui-bridge.ts (939行)
- **职责重叠**：两者都处理设置表单的读写和连接测试
- `llm-settings.ts` 是旧实现，`llm-ui-bridge.ts` 是新实现，并存造成维护负担

### deepseek-llm.ts (719行) — 遗留代码
- 与 `deepseek-provider.ts` + `llm-manager.ts` 功能高度重复
- 独立实现了 requestChat、settings管理、Token监控等
- **建议确认无引用后删除**

### 5个 Provider 的 normalizeSettings 重复
- `normalizeXxxSettings()` 函数结构几乎完全一致，仅 provider名、endpoint、model 默认值不同

### qwen-provider.ts
- **未调用 `LlmManager.registerProvider()`**，可能导致 Provider 不可用

## 整体评价

**优点**：scene-llm.ts 组装层设计合理、createOpenAICompatibleProvider 工厂模式有效、prompts.ts 独立管理 Prompt 模板。

**核心问题**：
| 问题 | 严重度 |
|------|--------|
| deepseek-llm.ts 完全冗余的遗留代码（719行） | **P0** |
| llm-decision.ts 过重（1685行） | **P1** |
| llm-manager.ts 过重（1267行） | **P1** |
| 5个 Provider 的 normalizeSettings 重复 | **P2** |
| llm-settings.ts 与 llm-ui-bridge.ts 职责重叠 | **P2** |
| qwen-provider.ts 未注册 | **P3** |

## 改进建议

1. 确认无引用后删除 `deepseek-llm.ts`
2. 拆分 `llm-decision.ts`：decision-core + telemetry + ui-panel
3. 拆分 `llm-manager.ts`：registry + request + utils + token-monitor
4. 抽取通用 normalize 工厂函数，消除 Provider 间重复
5. 统一设置读写到 `llm-ui-bridge.ts`，废弃 `llm-settings.ts`
6. 补充 `qwen-provider.ts` 的注册调用
