# 计划：LLM Provider normalizeXxxSettings 去重

> 创建时间：2026-07-12
> 对应 task-list #22：llm 5 个 Provider 的 `normalizeXxxSettings()` 结构几乎一致，仅 provider名/endpoint/model 不同
> 风险：低（纯重构，字段值不变，有充分测试覆盖）
> 基线：tsc 0 错误 / test 1089 通过 / lint 0 error

---

## 一、背景与现状

5 个 Provider 文件各有一个 `normalizeXxxSettings(source, fallback)` 函数，结构高度相似但存在字段集差异。此外 `llm-manager.ts` 内有 2 份动态 Provider 的 normalize 副本（`createDynamicProvider` 和 `initializeCustomProviders`），彼此也不一致。合计 7 份近似副本约 260 行重复代码。

### 涉及文件

| 文件 | normalize 函数 | 行数 |
|------|---------------|------|
| `scripts/llm/providers/deepseek-provider.ts` | `normalizeDeepSeekSettings` (L67-101) | 35 |
| `scripts/llm/providers/openai-provider.ts` | `normalizeOpenAISettings` (L42-74) | 33 |
| `scripts/llm/providers/qwen-provider.ts` | `normalizeQwenSettings` (L42-74) | 33 |
| `scripts/llm/providers/glm-provider.ts` | `normalizeGlmSettings` (L40-70) | 31 |
| `scripts/llm/providers/kimi-provider.ts` | `normalizeKimiSettings` (L40-70) | 31 |
| `scripts/llm/core/llm-manager.ts` | `createDynamicProvider` 内联 normalize (L303-352) | 50 |
| `scripts/llm/core/llm-manager.ts` | `initializeCustomProviders` 内联 normalize (L432-479) | 48 |

---

## 二、5 个 normalize 函数对比表

### 2.1 结构骨架（完全一致的部分）

所有 5 个函数的代码骨架相同：

```typescript
function normalizeXxxSettings(source: any, fallback?: any): any {
  const defaults = { ...defaultXxxSettings(), ...normalizeObject(fallback) }
  const input = normalizeObject(source)
  const endpointRaw = typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
  const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
  const apiKeyRaw =
    typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : String(defaults.apiKey || "")
  return { /* ~17 个字段 */ }
}
```

### 2.2 字段对比

| # | 字段 | 归一化逻辑 | deepseek | openai | qwen | glm | kimi |
|---|------|-----------|----------|--------|------|-----|------|
| 1 | `provider` | 字符串字面量 | "deepseek" | "openai" | "qwen" | "glm" | "kimi" |
| 2 | `enabled` | `Boolean(input.enabled)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | `multiGameMemoryEnabled` | `Boolean(...)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | `reflectionEnabled` | `Boolean(...)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | `contextLength` | `Math.max(2, Math.min(20, Math.round(Number(x) \|\| 5)))` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | `autoSummarizeEnabled` | `x !== false` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | `reflectionScope` | `x === "full" ? "full" : "current"` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | `thinkingEnabled` | `Boolean(...)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | `independentModelEnabled` | `Boolean(...)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 | `independentReflectionEnabled` | `x !== undefined ? Boolean(x) : true` | **✓** | **✓** | **✓** | ✗ | ✗ |
| 11 | `thinkingParams` | `typeof x === "string" ? x.trim() : defaults.thinkingParams` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | `endpoint` | 见下文 endpoint 差异 | **特殊** | 简单 | 简单 | 简单 | 简单 |
| 13 | `model` | `modelRaw.length > 0 ? modelRaw : defaults.model` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 | `apiKey` | `apiKeyRaw`（trim 或 defaults 回退） | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | `timeoutMs` | `clamp(Math.round(toFiniteNumber(...)), 3000, 120000)` | ✓ | ✓ | ✓ | ✓ | ✓ |
| 16 | `temperature` | `clamp(toFiniteNumber(...), 0, max)` | max=**1.5** | max=**2** | max=**2** | max=**1** | max=**1** |
| 17 | `maxTokens` | `Math.max(1000, Math.round(toFiniteNumber(...)))` | ✓ | ✓ | ✓ | ✓ | ✓ |

### 2.3 三处实质差异

**差异 1：`temperature` clamp 上限不同**

| Provider | temperature 上限 | 原因 |
|----------|-----------------|------|
| deepseek | 1.5 | DeepSeek API 约束 |
| openai | 2 | OpenAI API 允许 0-2 |
| qwen | 2 | 通义千问 API 允许 0-2 |
| glm | 1 | 智谱 GLM API 约束 |
| kimi | 1 | Moonshot API 约束 |

这是各 Provider API 的硬约束，不可统一。

**差异 2：`independentReflectionEnabled` 字段有无**

- deepseek / openai / qwen：normalize 输出包含此字段（默认 true）
- glm / kimi：normalize 输出**不包含**此字段

注意：`defaultXxxSettings()` 中也对应--deepseek/openai/qwen 有此字段，glm/kimi 无。但 `independentModelEnabled` 在 5 个 normalize 输出中**都有**（glm/kimi 的 defaults 中没有但 normalize 中有 `Boolean(input.independentModelEnabled)` 输出）。

**差异 3：`endpoint` 归一化方式不同**

- deepseek：通过自定义 `normalizeEndpoint(raw, fallback)` 函数处理（L42-65），包含 URL 重写逻辑（`api.deepseek.com` + `/chat/completions` -> `/v1/chat/completions`）、相对路径保留、非 http 回退等
- openai / qwen / glm / kimi：简单 `endpointRaw || defaults.endpoint`（空字符串回退到默认值）

### 2.4 defaultXxxSettings 字段差异

| 字段 | deepseek | openai | qwen | glm | kimi |
|------|----------|--------|------|-----|------|
| `independentModelEnabled` | ✓ (false) | ✓ (false) | ✓ (false) | ✗ | ✗ |
| `independentReflectionEnabled` | ✓ (true) | ✓ (true) | ✓ (true) | ✗ | ✗ |
| `endpoint` | "/api/deepseek/chat/completions" | "https://api.openai.com/v1/chat/completions" | dashscope URL | bigmodel.cn URL | moonshot URL |
| `model` | "deepseek-v4-flash" | "gpt-4o-mini" | "qwen-turbo" | "glm-4-flash" | "moonshot-v1-8k" |

### 2.5 llm-manager.ts 动态 Provider 的 2 份副本

`createDynamicProvider` (L303-352) 和 `initializeCustomProviders` (L432-479) 各有一份内联 normalize，两者之间存在不一致：

| 差异点 | createDynamicProvider | initializeCustomProviders |
|--------|----------------------|--------------------------|
| `independentModelEnabled` | ✓ 有 | ✗ **无**（遗漏） |
| `independentReflectionEnabled` | ✗ 无 | ✗ 无 |
| `temperature` clamp | 0-2 | 0-2 |
| `defaults` 构造 | `fallback \|\| { 内联 }` | `fallback \|\| { 内联 }` |
| `endpoint` 空串处理 | 返回空串（`input.endpoint.trim()`） | 返回空串 |

与 5 个 Provider 的差异：
- `defaults` 构造方式不同：Provider 用 `{ ...defaultXxxSettings(), ...normalizeObject(fallback) }`（合并），动态 Provider 用 `fallback || { 内联 }`（替换，不合并）--fallback 为部分对象时会丢失默认字段
- `endpoint` / `model` 空串处理不同：Provider 用 `endpointRaw || defaults.endpoint`（空串回退），动态 Provider 用 `input.endpoint.trim()`（空串保留）
- 动态 Provider 缺少 `independentReflectionEnabled`（与 glm/kimi 一致，但 createDynamicProvider 多了 `independentModelEnabled` 而 initializeCustomProviders 遗漏了）

---

## 三、去重方案评估

### 选项 A：在 provider-factory.ts 加 `createNormalizeSettings(config)` 工厂

config 声明字段集 + clamp 规则，各 provider 调用配置生成自己的 normalize。

```typescript
interface NormalizeSettingsConfig {
  providerId: string
  defaultSettings: () => Record<string, unknown>
  temperatureMax: number
  includeIndependentReflection?: boolean
  normalizeEndpoint?: (raw: string, fallback: string) => string
}

function createNormalizeSettings(config: NormalizeSettingsConfig) {
  return function (source: any, fallback?: any): any {
    const defaults = { ...config.defaultSettings(), ...normalizeObject(fallback) }
    const input = normalizeObject(source)
    // ... 通用逻辑，用 config.temperatureMax / config.normalizeEndpoint 驱动差异
  }
}
```

各 Provider 调用：
```typescript
const normalizeDeepSeekSettings = createNormalizeSettings({
  providerId: "deepseek",
  defaultSettings: defaultDeepSeekSettings,
  temperatureMax: 1.5,
  includeIndependentReflection: true,
  normalizeEndpoint: normalizeEndpoint  // deepseek 专属
})
```

| 优点 | 缺点 |
|------|------|
| 单一真相源，14 个通用字段逻辑只写一次 | 引入一层抽象（但与 createOpenAICompatibleProvider 模式一致） |
| 差异声明式配置，新增 Provider 只需 5 行 config | deepseek 的 normalizeEndpoint 仍需保留为独立函数（合理，它确实是 provider 专属逻辑） |
| 与 createOpenAICompatibleProvider 的 config 驱动模式天然契合 | - |
| 可同时消除 llm-manager.ts 的 2 份动态副本 | - |
| 工厂本身是纯函数，可独立测试 | - |

### 选项 B：提取通用字段归一化到共享函数，各 provider 调用 + 补特有字段

```typescript
function normalizeCommonFields(input, defaults, temperatureMax) { /* 返回 14 个通用字段 */ }
// 各 provider:
function normalizeGlmSettings(source, fallback) {
  const { ...common } = normalizeCommonFields(...)
  return { ...common, endpoint: ..., temperature: ... }
}
```

| 优点 | 缺点 |
|------|------|
| 抽象层更薄 | 各 provider 仍需手写 wrapper，重复 ~10 行模板 |
| 渐进迁移友好 | 差异字段（independentReflectionEnabled、endpoint）散在各 wrapper 中，不如 config 集中 |
| - | llm-manager.ts 的 2 份副本仍需单独处理 |

### 选项 C：统一字段集（所有 provider 都支持全部字段），用一份 normalize

| 优点 | 缺点 |
|------|------|
| 最大化 DRY | glm/kimi 被迫输出 `independentReflectionEnabled`，改变 settings 形状 |
| - | temperature clamp 上限是 API 硬约束，无法统一（glm=1, deepseek=1.5, openai=2） |
| - | 违反"字段值不变"原则，风险最高 |

### 推荐：选项 A

理由：
1. **与现有架构契合**：`createOpenAICompatibleProvider` 已采用 config 驱动模式（接收 `normalizeSettings` 等配置字段）。`createNormalizeSettings` 是同模式的自然延伸--Provider 声明 config，工厂生成函数。
2. **差异表达能力强**：temperatureMax / includeIndependentReflection / normalizeEndpoint 三个 config 字段精确覆盖全部实质差异，声明式且可测试。
3. **消除全部 7 份副本**：5 个 Provider + 2 份动态 Provider 统一使用工厂，净减约 175 行。
4. **行为保持**：工厂生成的函数与原函数输出字段集和值完全一致（见第五节验证）。
5. **选项 B 的渐进优势在本场景不突出**：差异点只有 3 处，config 声明比 wrapper 拼装更清晰。选项 C 改变行为形状，风险不可接受。

---

## 四、实施步骤

### Step 1：在 provider-factory.ts 新增 `createNormalizeSettings` 工厂

文件：`scripts/llm/core/provider-factory.ts`

新增导出函数 `createNormalizeSettings(config)`：

```typescript
export interface NormalizeSettingsConfig {
  providerId: string
  defaultSettings: () => Record<string, unknown>
  temperatureMax: number
  includeIndependentReflection?: boolean
  normalizeEndpoint?: (raw: string, fallback: string) => string
}

export function createNormalizeSettings(config: NormalizeSettingsConfig) {
  return function normalizeSettings(source: any, fallback?: any): any {
    const defaults = { ...config.defaultSettings(), ...normalizeObject(fallback) }
    const input = normalizeObject(source)

    const endpointRaw =
      typeof input.endpoint === "string" ? input.endpoint.trim() : String(defaults.endpoint)
    const modelRaw = typeof input.model === "string" ? input.model.trim() : String(defaults.model)
    const apiKeyRaw =
      typeof input.apiKey === "string" && input.apiKey.trim()
        ? input.apiKey.trim()
        : String(defaults.apiKey || "")

    const endpoint = config.normalizeEndpoint
      ? config.normalizeEndpoint(endpointRaw, defaults.endpoint)
      : endpointRaw || defaults.endpoint

    const result: any = {
      provider: config.providerId,
      enabled: Boolean(input.enabled),
      multiGameMemoryEnabled: Boolean(input.multiGameMemoryEnabled),
      reflectionEnabled: Boolean(input.reflectionEnabled),
      contextLength: Math.max(2, Math.min(20, Math.round(Number(input.contextLength) || 5))),
      autoSummarizeEnabled: input.autoSummarizeEnabled !== false,
      reflectionScope: input.reflectionScope === "full" ? "full" : "current",
      thinkingEnabled: Boolean(input.thinkingEnabled),
      independentModelEnabled: Boolean(input.independentModelEnabled),
      ...(config.includeIndependentReflection
        ? {
            independentReflectionEnabled:
              input.independentReflectionEnabled !== undefined
                ? Boolean(input.independentReflectionEnabled)
                : true
          }
        : {}),
      thinkingParams:
        typeof input.thinkingParams === "string" ? input.thinkingParams.trim() : defaults.thinkingParams,
      endpoint,
      model: modelRaw.length > 0 ? modelRaw : defaults.model,
      apiKey: apiKeyRaw,
      timeoutMs: clamp(Math.round(toFiniteNumber(input.timeoutMs, defaults.timeoutMs)), 3000, 120000),
      temperature: clamp(toFiniteNumber(input.temperature, defaults.temperature), 0, config.temperatureMax),
      maxTokens: Math.max(1000, Math.round(toFiniteNumber(input.maxTokens, defaults.maxTokens)))
    }

    return result
  }
}
```

要点：
- `clamp` / `toFiniteNumber` / `normalizeObject` 已在 provider-factory.ts 顶部导入（L7-17），无需新增 import
- `...(config.includeIndependentReflection ? {...} : {})` 展开方式保持字段顺序（independentReflectionEnabled 在 independentModelEnabled 之后、thinkingParams 之前，与原代码一致）
- 不传 `normalizeEndpoint` 时走默认 `endpointRaw || defaults.endpoint`（openai/qwen/glm/kimi 路径）
- 传 `normalizeEndpoint` 时走自定义函数（deepseek 路径）

### Step 2：改造 5 个 Provider

每个 Provider 的改动模式相同：

1. 导入 `createNormalizeSettings`（从 `../core/llm-manager` re-export 或直接从 `../core/provider-factory`）
2. 删除手写的 `normalizeXxxSettings` 函数体
3. 用工厂生成替换：

**deepseek-provider.ts**：
```typescript
import { createNormalizeSettings } from "../core/provider-factory"
// normalizeEndpoint 函数保留（deepseek 专属逻辑）
const normalizeDeepSeekSettings = createNormalizeSettings({
  providerId: "deepseek",
  defaultSettings: defaultDeepSeekSettings,
  temperatureMax: 1.5,
  includeIndependentReflection: true,
  normalizeEndpoint: normalizeEndpoint
})
```

**openai-provider.ts**：
```typescript
const normalizeOpenAISettings = createNormalizeSettings({
  providerId: "openai",
  defaultSettings: defaultOpenAISettings,
  temperatureMax: 2,
  includeIndependentReflection: true
})
```

**qwen-provider.ts**：
```typescript
const normalizeQwenSettings = createNormalizeSettings({
  providerId: "qwen",
  defaultSettings: defaultQwenSettings,
  temperatureMax: 2,
  includeIndependentReflection: true
})
```

**glm-provider.ts**：
```typescript
const normalizeGlmSettings = createNormalizeSettings({
  providerId: "glm",
  defaultSettings: defaultGlmSettings,
  temperatureMax: 1
  // 无 includeIndependentReflection -> 不输出该字段（与现状一致）
})
```

**kimi-provider.ts**：
```typescript
const normalizeKimiSettings = createNormalizeSettings({
  providerId: "kimi",
  defaultSettings: defaultKimiSettings,
  temperatureMax: 1
})
```

各 Provider 的导出对象不变：`normalizeXxxSettings` 仍作为命名导出（现在是工厂生成的函数），测试中 `const { normalizeXxxSettings } = XxxProvider` 解构调用不受影响。

`defaultXxxSettings` 函数保持不变（不在本次去重范围，见第七节）。

### Step 3：改造 llm-manager.ts 的 2 份动态 Provider 副本

文件：`scripts/llm/core/llm-manager.ts`

将 `createDynamicProvider` (L303-352) 和 `initializeCustomProviders` (L432-479) 的内联 normalize 替换为工厂调用：

```typescript
normalizeSettings: createNormalizeSettings({
  providerId: providerId,  // 或 cfg.id
  defaultSettings: function () { return { /* 原内联 defaults 不变 */ } },
  temperatureMax: 2
  // 无 includeIndependentReflection -> 与现状一致（两份副本都不输出此字段）
})
```

**行为变化说明**（需在 PR 中注明）：

| 变化点 | 旧 | 新 | 影响 |
|--------|----|----|------|
| `defaults` 构造 | `fallback \|\| { 内联 }`（替换） | `{ ...defaultSettings(), ...normalizeObject(fallback) }`（合并） | fallback 为部分对象时，缺失字段从 defaults 补全而非 undefined。更安全，无回归风险 |
| `endpoint` 空串 | 返回空串 | 回退到 defaults.endpoint | 与 5 个 Provider 行为对齐。实际场景 fallback 来自 loadSettings() 返回完整对象，空串不出现 |
| `model` 空串 | 返回空串 | 回退到 defaults.model | 同上 |
| `initializeCustomProviders` 的 `independentModelEnabled` | 缺失 | 输出 `Boolean(input.independentModelEnabled)` | **行为修正**：与 createDynamicProvider 和 5 个 Provider 对齐。provider-factory.ts loadSettings/saveSettings 的 force-set 逻辑（L98-111/L138-151）已为此字段做兜底，实际运行时行为不变 |

### Step 4：补充工厂单元测试

文件：`tests/llm/core/llm-manager.test.ts`（或新建 `tests/llm/core/provider-factory.test.ts`）

测试 `createNormalizeSettings` 工厂本身：
- 通用字段归一化（enabled 转 boolean、contextLength clamp 2-20、reflectionScope 枚举、autoSummarizeEnabled 仅 false 时 false）
- `temperatureMax` 配置生效（传入 1.5/2/1 分别 clamp 到对应上限）
- `includeIndependentReflection: true` 时字段存在且默认 true
- `includeIndependentReflection: false`（或不传）时字段不存在
- `normalizeEndpoint` 回调被调用（传入 mock 函数验证）
- 不传 `normalizeEndpoint` 时走默认 `endpointRaw || defaults.endpoint` 逻辑
- 空 model 回退到 defaults
- 空 source + 空 fallback 时返回完整默认值

现有 5 个 Provider 的测试（`tests/llm/providers/*.test.ts`）不需修改--它们测试的是各 Provider 导出的 `normalizeXxxSettings`，工厂生成的函数行为一致，断言应全部通过。

### Step 5：更新 llm-manager.ts re-export

在 `llm-manager.ts` 的 re-export 区（L45-46 附近）新增：
```typescript
export { createNormalizeSettings } from "./provider-factory"
export type { NormalizeSettingsConfig } from "./provider-factory"
```

使各 Provider 可从 `../core/llm-manager` 导入（与现有 `createOpenAICompatibleProvider` 导入路径一致）。

---

## 五、行为保持原则（字段值不变）

### 5.1 验证矩阵

对每个 Provider，以下输入对应的输出必须与重构前**完全一致**：

| 输入场景 | 验证字段 |
|----------|---------|
| 空对象 `{}` + 默认 fallback | 全部 16/17 字段值 = defaults |
| `{ enabled: 1 }` | `enabled === true` |
| `{ contextLength: 1 }` / `{ contextLength: 100 }` / `{ contextLength: "abc" }` | clamp 到 2 / 20 / 回退 5 |
| `{ reflectionScope: "full" }` / `{ reflectionScope: "other" }` | "full" / "current" |
| `{ autoSummarizeEnabled: false }` | false |
| `{ temperature: -1 }` / `{ temperature: 99 }` | clamp 到 0 / temperatureMax |
| `{ timeoutMs: 100 }` / `{ timeoutMs: 999999 }` | 3000 / 120000 |
| `{ maxTokens: 500 }` | 1000 |
| `{ model: "" }` | defaults.model |
| `{ endpoint: "" }` | defaults.endpoint（deepseek 走 normalizeEndpoint） |
| 无 fallback | 使用内置 defaultSettings() |
| `{ independentReflectionEnabled: false }` | false（仅 deepseek/openai/qwen） |

### 5.2 现有测试覆盖

5 个 Provider 测试文件已有覆盖（共 ~60 个 normalize 相关断言）：

| 测试文件 | normalize 用例数 | 关键覆盖 |
|----------|-----------------|---------|
| `deepseek-provider.test.ts` | 13 | 空输入、enabled、contextLength clamp、reflectionScope、autoSummarizeEnabled、endpoint 相对路径/非法回退、temperature 0-1.5、timeoutMs、maxTokens、model 空回退、independentReflectionEnabled 默认 true/可设 false |
| `openai-provider.test.ts` | 10 | 空输入、enabled、contextLength、timeoutMs、temperature 0-2、maxTokens、reflectionScope、model 空回退、thinkingParams 保留 |
| `qwen-provider.test.ts` | 12 | 空输入、enabled、contextLength、timeoutMs、temperature 0-2、maxTokens、reflectionScope、independentReflectionEnabled 默认 true/可设 false、model 空回退、endpoint 空回退 |
| `glm-provider.test.ts` | 10 | 空输入、enabled、contextLength、timeoutMs、temperature 0-1、maxTokens、reflectionScope、model 空回退、thinkingEnabled 转 boolean |
| `kimi-provider.test.ts` | 10 | 空输入、enabled、contextLength、timeoutMs、temperature 0-1、maxTokens、reflectionScope、model 空回退、independentModelEnabled 转 boolean |

这些测试在重构后应**零修改全通过**，是行为保持的主要保障。

---

## 六、验证

1. `npx tsc --noEmit` -> 0 错误
2. `npm run test` -> 1089 通过（现有 5 个 Provider 测试零修改 + 新增工厂测试）
3. `npm run lint` -> 0 error，无新增 warning
4. `npm run build` -> 成功
5. 手动回归（可选，dev server）：
   - 各 Provider 设置面板加载/保存正常
   - 切换 active provider 后设置字段完整
   - AI 对局中 LLM 请求正常发出

---

## 七、不在本次范围

- **`defaultXxxSettings` 去重**：5 个 defaults 函数也高度重复（仅 provider/endpoint/model/independentReflectionEnabled 不同），可用 `createDefaultSettings(config)` 工厂去重。但 defaults 体量小（~20 行 x 5 = 100 行）且改动风险更高（影响 localStorage 序列化形状），建议作为后续独立任务。
- **`buildRequestBody` 去重**：各 Provider 的 `buildRequestBody` 也有相似结构（thinking 模型判断 + temperature/thinkingParams 处理），但差异更大（各 Provider 的 thinking API 参数名不同：deepseek 用 `thinking`/`reasoning_effort`，qwen/glm 用 `enable_thinking`，openai 用 `reasoning_effort`），不适合简单工厂。建议保持现状。
- **`isXxxThinkingModel` 去重**：各 Provider 正则不同，是 provider 专属逻辑，不应去重。
- **`console.log` 清理**：provider-factory.ts 和 llm-manager.ts 中有大量 `console.log`（loadSettings/saveSettings 内），属已知问题，不在本次范围。

---

## 八、风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 工厂输出字段集与原函数不一致 | 低 | 5 个 Provider 现有 ~55 个 normalize 断言全覆盖；工厂新增独立测试 |
| `independentReflectionEnabled` 误加到 glm/kimi | 低 | config `includeIndependentReflection` 默认 false，glm/kimi 不传此配置；测试断言 glm/kimi 不输出该字段 |
| temperature clamp 上限配错 | 低 | config 声明式，每个 Provider 显式传值；现有 temperature clamp 测试覆盖全部 3 档（1/1.5/2） |
| deepseek endpoint 归一化逻辑遗漏 | 低 | `normalizeEndpoint` 函数体不改，仅作为 config 回调传入；现有 deepseek endpoint 测试覆盖相对路径/非法回退/URL 重写 |
| 动态 Provider defaults 构造方式变化 | 低 | 从"替换"改为"合并"是更安全的方向（缺失字段补默认值而非 undefined）；provider-factory 的 force-set 逻辑已兜底 |
| JSON 序列化字段顺序变化 | 极低 | 工厂用展开运算符保持 `independentReflectionEnabled` 插入位置；JSON.parse 不关心 key 顺序，localStorage 反序列化不受影响 |
| `normalizeXxxSettings` 导出签名变化 | 无 | 工厂生成的函数签名仍为 `(source: any, fallback?: any) => any`，与原函数完全一致 |

**总体风险等级：低**。纯重构，不改字段值，有 5 个 Provider 测试文件 ~55 个 normalize 断言 + 工厂新增测试双重保障。最坏情况是某个 Provider 的 normalize 输出字段遗漏或 clamp 配错，会被现有测试立即捕获。

---

## 九、建议

**建议执行**。理由：
1. 消除 7 份近似副本（~260 行 -> ~85 行），净减 ~175 行重复代码
2. 统一动态 Provider 与静态 Provider 的 normalize 行为（修正 initializeCustomProviders 的 independentModelEnabled 遗漏 bug）
3. 新增 Provider 时只需声明 config（5 行），无需复制粘贴 30 行模板
4. 风险低、测试覆盖充分、与现有 createOpenAICompatibleProvider 架构模式一致
5. 为后续 defaultXxxSettings 去重（可选）铺路
