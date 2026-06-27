# TypeScript 迁移现状报告

> 创建时间：2026-06-15
> 最后更新：2026-06-17
> 目的：澄清项目当前 TypeScript 迁移的真实进度

---

## 一、结论：这是一个 **"完整 TypeScript 项目"**

| 维度 | 状态 | 完成度 |
|------|------|--------|
| 文件后缀 | ✅ 全部 `.ts` | 100% |
| 类型定义 | ✅ 6 个 `.d.ts`，~150 接口 | 95% |
| any 类型 | ✅ 从 1,494 → 218 | 85% |
| ES Module | ✅ 170 import / 432 export | 100% |
| strict 模式 | ✅ `strict: true`，0 错误 | 100% |
| window 模块通信 | ✅ 已清除 | 100% |

---

## 二、迁移成果

### 2.1 ES Module 迁移 ✅ 已完成

- 所有模块间通信已从 `window.XXX` 改为 `import/export`
- `window.MobaoXxx = Xxx` → `export`
- `const { xxx } = window.MobaoXxx` → `import`

### 2.2 strict 模式 ✅ 已完成

- `tsconfig.json` 已开启 `strict: true`
- `npx tsc --noEmit` 输出 **0 个错误**
- 所有类型错误已修复（TS2339、TS2531、TS7006等）

### 2.3 any 类型消除 🔄 进行中

- 从 1,494 → 218（85% 完成）
- 已将部分 `any` 替换为 `unknown`（更安全的类型）
- 主要分布在 LLM 模块、main.ts、UI 模块

---

## 三、window.XXX 说明

**总搜索结果：173 处 `window.`**

### 3.1 合法调用（浏览器原生 API）—— 不需要清除

| 类型 | 数量 | 说明 |
|------|------|------|
| `window.localStorage` | ~80 | 存储读写，浏览器标准 API |
| `window.innerWidth/Height` | ~10 | 视口尺寸检测 |
| `window.setTimeout/setInterval` | ~15 | 定时器 |
| `window.NativeBridge` | ~10 | Android 原生桥接（外部接口） |
| 其他浏览器 API | ~25 | fetch、alert、addEventListener 等 |

**合计：~130 处，全部合法**

### 3.2 注释中的 window.XXX —— 文档说明

| 类型 | 数量 | 说明 |
|------|------|------|
| `@exports window.XXX` | ~25 | JSDoc 注释，说明导出位置 |
| `@requires window.XXX` | ~10 | JSDoc 注释，说明依赖 |

**合计：~35 处，是文档注释**

### 3.3 模块间通信 —— 已清除

| 类型 | 数量 | 说明 |
|------|------|------|
| `window.MobaoXxx = Xxx` | **0** | 已全部改为 `export` |
| `const { xxx } = window.MobaoXxx` | **0** | 已全部改为 `import` |

---

## 四、下一步建议

### 4.1 继续消除 any 类型（当前 218 处）

优先处理：
- LLM 模块（llm-decision.ts、llm-manager.ts）
- main.ts（2548行，需要拆分）
- UI 模块（overlay.ts、panels.ts）

### 4.2 删除注释中的 window.XXX 说明

把 `@exports window.XXX` 改为 `@exports Xxx`，因为现在是 ES Module 导出。

### 4.3 大文件拆分

根据文件行数统计，以下文件需要拆分：
- `main.ts` (2548行) → 拆分为初始化、事件处理、渲染逻辑
- `llm-decision.ts` (1569行) → 拆分为决策引擎、策略评估
- `warehouse/index.ts` (1288行) → 拆分为渲染、交互、状态管理

---

## 五、总结

| 问题 | 状态 |
|------|------|
| "还有 window 全局调用？" | ❌ 误解。173 处中 130 处是浏览器原生 API，35 处是注释 |
| "这都第几轮了还没清空？" | ❌ 误解。模块间通信的 window.XXX 已清空 |
| "算不算 TS 项目？" | ✅ 是"完整 TS 项目"：文件已迁移，类型已定义，strict 已开启 |

**当前状态**：TypeScript 迁移已完成，strict 模式已开启（0 错误），any 消除进度 85%。