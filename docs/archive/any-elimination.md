# any 类型消除计划

> 目标：将项目 `any` 从 ~1,500 处降至 ~200 处以下，让 TypeScript 真正发挥作用。
> 最后更新：2026-06-17
> 当前状态：✅ **87% 完成（196 处 `:any`+`as any`，lint 已强制 warn）** | 2026-07-12 复核

---

## 一、进度总览

| 阶段 | 目标 | 计划降幅 | 实际降幅 | 状态 |
|------|------|---------|---------|------|
| **I — 已有类型替换** | 把 .d.ts 已定义的类型用上 | 1,494 → 800 | 1,494 → 600 | ✅ 完成 |
| **II — 新类型补充** | 给缺失的边界定义类型 | 800 → 400 | 600 → 350 | ✅ 完成 |
| **III — 深度收敛** | Mixin this、DOM、Phaser | 400 → 200 | 350 → 218 | 🔄 进行中 |
| **IV — 收尾** | 全局 any 审查 + lint rule | 200 → 150 | — | 🔄 进行中（lint warn 已启用，实际降幅 218->196） |

**当前 any 数量：196 处 `:any`+`as any`（87% 完成，2026-07-12 复核；lint 全面计数含 `any[]`/`Record<string,any>`/`<any>`/`Promise<any>` 等形式为 295）**

---

## 二、已完成工作

### 2.1 阶段 I：已有类型替换 ✅

- 导入并使用 `.d.ts` 中已定义的 interface/type
- `Player`、`Artifact`、`GameSettings` 等类型已替换 `: any`
- `BidContext`、`BidDecision`、`LlmBridge` 等类型已替换

### 2.2 阶段 II：新类型补充 ✅

- 创建 `types/bridges.d.ts`（ShopBridge、BattleRecordBridge、SettlementBridge）
- 创建 `types/dom.d.ts`（DOM 元素类型别名）
- 扩展 `types/phaser.d.ts`（补充缺失的 Phaser 类型）
- 创建 `WarehouseSceneThis` 接口（解决 Mixin this 类型问题）

### 2.3 阶段 III：深度收敛 🔄 进行中

- **已完成**：
  - 将部分 `any` 替换为 `unknown`（更安全的类型）
  - 修复 `settings.ts`、`app-state.ts`、`deps.ts` 等核心文件的 `any` 类型
  - 添加类型断言和类型守卫
  
- **进行中**：
  - LLM 模块（llm-decision.ts、llm-manager.ts）
  - main.ts（2548行，需要拆分）
  - UI 模块（overlay.ts、panels.ts）

---

## 三、剩余 any 分布（注：下表为 2026-06-17 快照，其中 llm-decision/llm-manager/main.ts 等已拆分，文件名与数字待复核；当前总量 196）

| 模块 | 文件 | any 数量 | 说明 |
|------|------|---------|------|
| LLM | llm-decision.ts | ~50 | LLM 决策逻辑，参数结构复杂 |
| LLM | llm-manager.ts | ~40 | LLM 管理器，配置项多样 |
| Main | main.ts | ~60 | 游戏入口，16+ Mixin 合并 |
| UI | overlay.ts | ~20 | UI 覆盖层，DOM 操作多 |
| UI | panels.ts | ~15 | UI 面板，动态渲染 |
| Data | artifacts.ts | ~10 | 道具数据定义（70+道具） |
| Other | 其他文件 | ~23 | 散布在各模块 |

---

## 四、下一步计划

### 4.1 继续阶段 III：深度收敛

优先处理：
1. **LLM 模块**（llm-decision.ts、llm-manager.ts）— any 数量最多
2. **main.ts** — 需要拆分后再处理
3. **UI 模块** — DOM 操作多，需要补充 DOM 类型

### 4.2 阶段 IV：收尾

- 全局审查剩余的 `any`
- 添加 ESLint 规则 `@typescript-eslint/no-explicit-any: warn`
- 对无法消除的 `any` 添加注释说明原因

---

## 五、保留清单（合法 `any`）

以下场景的 `any` 可以保留：

| 场景 | 原因 | 数量估计 |
|------|------|---------|
| `JSON.parse()` 返回值 | 运行时才能确定结构 | ~20 |
| 第三方 SDK（Phaser 内部 API） | 非本项目控制 | ~30 |
| 动态 key 的对象 | 过度约束反而不利 | ~30 |
| `setTimeout` / `setInterval` 返回值 | Node/Browser 类型不一致 | ~10 |
| `window.postMessage` / `MessageEvent.data` | 通用消息体 | ~10 |

---

## 六、验收标准

- [ ] any 数量降至 ~150
- [x] ESLint `no-explicit-any` 规则启用（warn 级别）✅ 已完成（2026-07-12）
- [ ] 剩余 `any` 可被注释合理解释
- [ ] `npx tsc --noEmit` 输出 0 错误