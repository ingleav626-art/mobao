# 计划：退役 deepseek-llm.ts，消除 LLM 双轨 Provider 体系

> 创建时间：2026-07-12
> 目标：迁移 3 个消费者到新 Provider 体系，删除 `scripts/llm/providers/deepseek-llm.ts`（719 行），消除 `DeepSeekClient`/`maskApiKey`/settings 函数的重复实现
> 风险：中低（存储键不变、settings 形状只增不减）

---

## 一、背景与关键发现

项目存在两套并存的 DeepSeek LLM 体系：

| 体系 | 文件 | 导出 |
|------|------|------|
| 旧版（"遗留"但仍在用） | `deepseek-llm.ts` (719行) | `defaultDeepSeekSettings` / `normalizeDeepSeekSettings` / `loadDeepSeekSettings` / `saveDeepSeekSettings` / `maskApiKey` / `DeepSeekClient` 类 / `DeepSeekLLM` 聚合 |
| 新版 | `deepseek-provider.ts` + `provider-factory.ts` + `llm-manager.ts` | `DeepSeekProvider.{getSettings,applySettings,defaultDeepSeekSettings,normalizeDeepSeekSettings,requestChat,...}` + `LlmManager.utils.maskApiKey` |

**消费者（实际依赖旧版的只有 3 处 + 1 测试）**：
- `scripts/game/main.ts:40-46` — settings 函数 + `DeepSeekClient`（fallback 用）
- `scripts/game/ui/overlay.ts:31` — `loadDeepSeekSettings` / `saveDeepSeekSettings` / `maskApiKey`
- `scripts/game/scene/events-ai-memory.ts:13` — `defaultDeepSeekSettings`（表单重置 fallback）
- `tests/llm/providers/deepseek-llm.test.ts` — 测上述函数

**关键洞察（改变计划方向）**：旧版 settings 形状有 `contextLength / autoSummarizeEnabled / reflectionScope`（AI memory/reflection/summarizer 依赖），新版 `deepseek-provider.ts` **缺失这三个字段**——而 qwen/openai/kimi/glm 四个 provider 和动态 provider **都有**。所以 `deepseek-provider.ts` 才是残缺的那个（既有 bug：用 DeepSeek 作 active provider 时 AI 记忆/反思/总结功能会因 `undefined` 失效）。迁移前必须先补齐这三个字段，使新版形状成为旧版的**超集**。

**其他发现**：
- `maskApiKey` 在 `manager-utils.ts:134` 已有规范定义，`deepseek-llm.ts:332` 是重复副本；`LlmManager.utils.maskApiKey` 已暴露。
- `DeepSeekClient` 类与 `provider-factory.ts` 的 `requestChat` 是 ~360 行重复逻辑。
- `DeepSeekLLM` 聚合常量（`deepseek-llm.ts:711`）**无任何导入者**（死代码）；`window.DeepSeekLLM` 挂载在文件头注释里声称但实际从未发生（已是 ES Module export）。
- `eslint.config.js:23` 的 `DeepSeekLLM: "readonly"` 与 `types/globals.d.ts:207` 的 `DeepSeekLLM` 声明均为 stale。
- 两套体系**共用相同存储键** `mobao_deepseek_settings_v2` / `mobao_deepseek_api_key_v1` → 无需数据迁移。
- `MobaoLlm`（main.ts:85）仅导出、内部无消费者 → 保留其导出形状，仅换内部来源。

---

## 二、执行步骤

### Step 1：补齐 `deepseek-provider.ts` settings 字段（bug 修复 + 迁移前置）

文件：`scripts/llm/providers/deepseek-provider.ts`

- `defaultDeepSeekSettings()` (L20-37)：新增 `contextLength: 5`、`autoSummarizeEnabled: true`、`reflectionScope: "current"`（对齐 qwen/openai/kimi/glm）。
- `normalizeDeepSeekSettings()` (L64-95)：新增三字段归一化（对齐其他 provider 写法）：
  - `contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5)))`
  - `autoSummarizeEnabled: input.autoSummarizeEnabled !== false`
  - `reflectionScope: input.reflectionScope === "full" ? "full" : "current"`

**测试更新**：`tests/llm/providers/deepseek-provider.test.ts`
- L44-47 现有断言 `"contextLength 不在此 provider"` 需改为断言 contextLength 存在且默认 5。
- 从 `deepseek-llm.test.ts` 迁入未覆盖的用例：contextLength clamp 2-20、reflectionScope 只接受 full/current、autoSummarizeEnabled 仅 false 时为 false、相对路径 endpoint 保留、非 http endpoint 回退默认。

### Step 2：迁移 `main.ts`

文件：`scripts/game/main.ts`

- 删除 `import { ... } from "../llm/providers/deepseek-llm"` (L40-46)。`DeepSeekProvider`（L58）与 `LlmManager`（L57）已导入，可直接用。
- 来源映射：
  | 旧 | 新 |
  |----|----|
  | `defaultDeepSeekSettings` | `DeepSeekProvider.defaultDeepSeekSettings` |
  | `loadDeepSeekSettings` | `DeepSeekProvider.getSettings` |
  | `saveDeepSeekSettings` | `DeepSeekProvider.applySettings` |
  | `normalizeDeepSeekSettings` | `DeepSeekProvider.normalizeDeepSeekSettings` |
  | `maskApiKey` | `LlmManager.utils.maskApiKey` |
  | `DeepSeekClient` | 删除 |
- 保留 `LLM_SETTINGS`（L84）、`MobaoLlm` 导出（L85-91）的形状不变，仅换内部来源。
- `getLlmProvider` (L188-205)：移除 `DeepSeekClient` 守卫；fallback 已用 `DeepSeekProvider.requestChat/applySettings`（静态导入、必然可用），保留作防御性 fallback。顺手删除该函数内 3 处 `console.log`（L192/197/203，属代码质量清理）。
- `createSceneLlmBridge` 的 deps（L99-101 传入 `normalizeDeepSeekSettings / maskApiKey / saveDeepSeekSettings`）改用新来源——签名已核对一致（`normalizeDeepSeekSettings(source, fallback?)`、`saveSettings(settings)` 返回 `{...safe, apiKey}`、`maskApiKey(value)`）。

### Step 3：迁移 `overlay.ts`

文件：`scripts/game/ui/overlay.ts`

- L31 `import { loadDeepSeekSettings, saveDeepSeekSettings, maskApiKey } from "../../llm/providers/deepseek-llm"` 改为从 `deepseek-provider` + `llm-manager` 导入：
  - `loadDeepSeekSettings` → `DeepSeekProvider.getSettings`
  - `saveDeepSeekSettings` → `DeepSeekProvider.applySettings`
  - `maskApiKey` → `LlmManager.utils.maskApiKey`
- 用法点 L433/474/518 drop-in（签名与返回形状一致）。读取的字段 `multiGameMemoryEnabled / contextLength / autoSummarizeEnabled / reflectionScope / apiKey / model / enabled` 在 Step 1 后均存在于 `DeepSeekProvider.getSettings()` 输出。

### Step 4：迁移 `events-ai-memory.ts`

文件：`scripts/game/scene/events-ai-memory.ts`

- L13 `import { defaultDeepSeekSettings } from "../../llm/providers/deepseek-llm"` → `import { DeepSeekProvider } from "../../llm/providers/deepseek-provider"`，L23 用 `DeepSeekProvider.defaultDeepSeekSettings()`。
- 更新 L8 `@requires` JSDoc。

### Step 5：处理测试 `tests/llm/providers/deepseek-llm.test.ts`

- `maskApiKey` 用例：已在 `tests/llm/core/llm-manager.test.ts:113` 覆盖 → 丢弃。
- `defaultDeepSeekSettings` / `normalizeDeepSeekSettings` 用例：未覆盖部分在 Step 1 迁入 `deepseek-provider.test.ts`。
- 删除 `deepseek-llm.test.ts`（见 Step 6 同意范围）。

### Step 6：删除 `deepseek-llm.ts`

文件：`scripts/llm/providers/deepseek-llm.ts`（719 行）

Step 1-5 完成后该文件无任何导入者。**按 AGENTS.md "禁止未经同意删除文件" 规则，本计划的审批即视为同意删除此文件与 `deepseek-llm.test.ts`。**

### Step 7：清理 stale 的 `DeepSeekLLM` 全局声明

- `eslint.config.js:23` 删除 `DeepSeekLLM: "readonly"`。
- `types/globals.d.ts:207` 删除 `DeepSeekLLM: Record<string, any>`。

### Step 8：更新文档

- `FILE_GUIDE.md:193` 删除 deepseek-llm.ts 行（文件已删）。
- `docs/reference/*.md`、`README.md` 中对 deepseek-llm 的引用属已知 stale 文档（issues 文档整体过时），本次不动，保持范围聚焦。

---

## 三、验证

1. `npx tsc --noEmit` → 0 错误
2. `npm run test` → 全量通过（原 1026 用例，deepseek-llm.test.ts 删除、deepseek-provider.test.ts 增补后净变化为正）
3. `npm run lint` → 无新增告警
4. `npm run build` → 成功
5. 手动回归（dev server）：
   - 打开设置面板，DeepSeek 设置能正常加载/保存
   - API Key 掩码显示正常（`sk-a...7890`）
   - 切换 contextLength / autoSummarizeEnabled / reflectionScope 后保存→重开设置仍保留（验证 Step 1 修复）
   - AI 对局中记忆/反思功能正常（验证原 deepseek-provider 缺字段 bug 已修）

---

## 四、风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 存储键变更丢用户数据 | 无 | 键不变（`mobao_deepseek_settings_v2` / `mobao_deepseek_api_key_v1`），两体系本就共用 |
| settings 字段丢失致消费端失效 | 无 | 新版补齐后为旧版超集，只增不减 |
| `DeepSeekClient` 删除致 fallback 失效 | 低 | `DeepSeekProvider` 静态导入、已注册到 `LlmManager`，fallback 路径用其 `requestChat` 即可；主路径 `LlmManager.getProvider()` 正常返回 deepseek |
| `MobaoLlm` 外部消费者断裂 | 低 | 保留导出形状，仅换内部来源 |
| Step 1 改变 deepseek-provider 输出形状 | 低 | 仅新增字段，修的是缺失 bug；已确认无代码做 `Object.keys` 严格数量校验 |

## 五、不在本次范围

- 其他 4 个 provider（qwen/openai/kimi/glm）的 settings 形状已正确，不动。
- `console.log` 全仓清理（323 处）——仅清理本次触及的 main.ts `getLlmProvider` 内 3 处。
- lan/lobby.ts 拆分、scene 代理层精简等其余职责问题。
