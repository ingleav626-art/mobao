# AI 反馈功能计划

> 在 AI 反思时收集 LLM 玩家对游戏的反馈意见

---

## 功能概述

开启后，每局 AI 反思时 LLM 会额外输出一个 `feedback` 字段，表达对游戏中的疑惑/不满/建议。收集到的反馈持久化存储，玩家可在设置页查看/删除/清空。

---

## 前置条件

- LLM 总开关开启
- 对应模型的 LLM 决策开关开启
- 反思（reflection）开启
- 反馈功能自身开关开启（默认关闭）

---

## 数据结构

```ts
interface AiFeedbackEntry {
  id: string            // 唯一 ID，格式：`{playerId}-{timestamp}`
  playerId: string
  playerName: string
  runSerial: number     // 第几局
  timestamp: number
  content: string       // 反馈原文（≤ 500 字截断）
}

// 存储在 aiSlice 中：
aiFeedbacks: AiFeedbackEntry[]
```

**存储键：** `mobao_ai_feedbacks_v1`（localStorage，与 AI 记忆 `mobao_ai_memory_v1` 同级独立存储）

---

## 开关

| 位置 | 变量名 | 默认值 | 持久化 |
|------|--------|:--:|:--:|
| 设置 → 反思子栏 | `feedbackEnabled` | false | localStorage `mobao_ai_feedback_enabled` |

设置页反思栏新增一行：复选框 + "AI 反馈收集"

---

## LLM 集成

**时机：** `AiReflectionManager.triggerAiReflection()` 中

**条件判断：**
```ts
const feedbackEnabled = settings.feedbackEnabled && reflectionEnabled && canUseLlmDecision()
```

**Prompt 追加（与 summary 并列，条件插入）：**
```json
{
  "praises": { "add": [...], "delete": [...], "modify": [...] },
  "strategies": { ... },
  "lessons": { ... },
  "summary": "...（总结字段，已有）",
  "feedback": "你对本次游戏体验的反馈或建议。（如果没觉得有什么问题，返回空）"
}
```

Prompt 文本：
> 亲爱的测试 AI 玩家，开发者想知道你作为 AI 玩家在游玩过程中的疑惑或对游戏的不满甚至是批评。比如：你对提示词中哪个字段不理解，哪句话比较模糊，或者对工具返回值觉得不好。请具体指出：哪一条规则描述让你困惑？哪个字段的含义你不确定？哪个道具的效果你理解不了？哪个数值你觉得不合理？请引用原文或描述具体场景。总之一切你觉得不好的地方可以向开发者反馈，开发者会收到你的反馈并进一步优化提示词游戏的数值或者其他。请你告诉开发者你想要什么。一切合理的反馈都会让你的游戏体验更好，让你更好的游玩。（不要无理取闹也不要泛泛而谈）
> 
> 请返回 JSON，其中 feedback 字段为你的反馈内容（≤ 500 字）。如果觉得没有问题就返回空字符串。

**反馈保存：** 解析 `parsedReflection.feedback`，如果有值则 push 到 `aiFeedbacks[]` + 持久化。

---

## UI

### 入口

设置 → AI 设置 → 反思子栏 → 新增：

| 元素 | 说明 |
|------|------|
| ☑ AI 反馈收集 | 复选框，`feedbackEnabled` |
| 📋 查看反馈 | 按钮，打开反馈列表面板 |

### 反馈列表面板

类似 AI 记忆面板，独立覆盖层：

```
┌─────────────────────────────────┐
│  AI 反馈列表          [✕ 关闭]  │
│  [清空全部]                      │
├─────────────────────────────────┤
│  [P1] 左上AI 第3局               │
│  "提示词中的品质概率字段不是很..."│
│  2026-07-17 15:30              │
│  [删除此条]                     │
├─────────────────────────────────┤
│  [P1] 右上AI 第5局               │
│  "竞拍工具返回结果的均值和高价值" │
│  "关系有点矛盾，建议合并为一个.."  │
│  2026-07-17 16:20              │
│  [删除此条]                     │
├─────────────────────────────────┤
│  [P1] 玩家(托管) 第2局          │
│  "道具选择池太小，想用均价仪但"  │
│  "随机分发没拿到..."            │
│  2026-07-17 14:50              │
│  [删除此条]                     │
└─────────────────────────────────┘
```

**操作：**
- 点击 `[删除此条]` → 确认弹窗 → 删除该条目 → localStorage 同步
- 点击 `[清空全部]` → 确认弹窗 → 清空全部 → localStorage 同步

---

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `types/ai.d.ts` | 新增 `AiFeedbackEntry` 接口 |
| `scripts/game/core/state/ai-slice.ts` | 新增 `aiFeedbacks: AiFeedbackEntry[]` |
| `scripts/game/ai/reflection-manager.ts` | `triggerAiReflection` 中追加 feedback prompt + 解析 + 存储 |
| `scripts/game/scene/warehouse-scene.ts` | deps 接线 + 状态管理 |
| `scripts/game/scene/events-ai-memory.ts` | 反馈列表按钮事件绑定 |
| `scripts/game/ai/memory-manager.ts` | 新增 `loadAiFeedbacks` / `saveAiFeedbacks` / `deleteAiFeedback` / `clearAiFeedbacks` 方法 |
| `scripts/game/core/constants.ts` | 新增 `AI_FEEDBACK_STORAGE_KEY` 常量 |
| `index.html` | 反思子栏加反馈开关 + 按钮 + 反馈列表面板 DOM |
| `styles/game/_ai-panel.css` | 反馈面板样式 |

---

## 实现顺序

```
1. 数据结构（AiFeedbackEntry + aiSlice 字段）
2. storage（memory-manager 增删改查 + localStorage 读写）
3. 开关（settings UI + localStorage 持久化）
4. LLM 集成（prompt 追加 + 解析 + 存储）
5. 面板 UI（反馈列表 + 删除/清空）
6. 测试
```

---

## 边界

- `feedback` 为空字符串 / 解析失败 / LLM 返回无 → 不存储
- 同 playerId + 同 runSerial 去重（同一局只留最新）
- 总条数上限：100 条（超出删最旧）
- 清空/删除操作不可恢复 → 弹确认窗口
- 反馈面板独立于 AI 记忆面板（反思本），两者互不影响
