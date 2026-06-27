# 项目文档审查报告

> 生成时间：2026-06-18
> 审查范围：25个文档文件（~370KB）
> 目的：评估文档准确性，为文档优化做准备

---

## 一、全局性问题（所有文档共性）

### 1. 文件扩展名全部过时
**所有 25 个文档**使用 `.js` 后缀引用文件路径，但实际代码已全部迁移为 `.ts`。
- `scripts/game/main.js` → 实际 `scripts/game/main.ts`
- `scripts/game/ai/bidding.js` → 实际 `scripts/game/ai/bidding.ts`
- 以此类推，涉及约 200+ 处路径引用

### 2. 架构描述过时
多个文档描述的是旧的 IIFE + `<script>` 标签加载模式，但项目已迁移到 **Vite + ES Modules**：
- `index.html` 仅有 3 个 `<script>` 标签（phaser.min.js、lan-bridge.ts、main.ts）
- 所有模块通过 `import/export` 互相引用
- `main.ts` 有 28 个 `import` 语句

### 3. Mixin 数量不一致
不同文档给出不同数字：16、19、21、25。实际 main.ts 中有 **19 个** `Object.assign` 调用（`LanIndexMixin` 内含 6 个子 Mixin，有效总数 25 个）。

### 4. 文件行数偏差
多个文档引用的行数与实际不符（偏差 5%-18%），因代码持续演进。

---

## 二、逐文档审查结果

### 根目录文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **AGENTS.md** | ★★☆☆☆ | 模块系统描述完全过时（IIFE→ES Module）、`strict: false` 实际为 `true`、Mixin 数量/行号不准 |
| **README.md** | ★★★★☆ | 游戏内容描述准确，Mixin 名称/数量不准，Phaser 版本存在 v3/v4 不一致 |

#### AGENTS.md 关键错误：
- "Every `.ts` file is a `<script type='module'>`" → 错误，仅 3 个 script 标签
- "NO bundler import graph" → 错误，使用 Vite + ES Modules
- "The load order in `index.html:834-883` is critical" → 错误，实际在第 19/861/862 行
- "`strict: false`" → 错误，实际 `strict: true`
- "Files don't `import` each other" → 错误，28 个 import 语句
- "16+ mixins" → 实际 19 个 Object.assign
- main.ts "~2585 lines" → 实际 2748 行

#### README.md 关键错误：
- Mixin 名称不一致（UiOverlayMixin→OverlayMixin 等）
- 品质颜色存在双重定义（constants.ts QUALITY_COLORS vs artifacts.ts QUALITY_CONFIG）未说明
- package.json 声明 phaser ^4.0.0 但实际使用 3.90.0

---

### docs/ 根级文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **project-overview.md** | ★★☆☆☆ | "47个JS文件"→实际66个TS文件、IIFE模式描述过时、`<script>`标签数量错误（42→3） |
| **module-analysis.md** | ★★★☆☆ | 模块文件数统计错误（AI层6→10、LLM层9→14）、Mixin数16→19 |
| **feature-file-mapping.md** | ★★★★☆ | 功能映射基本准确，全局变量名MobaoLlm错误（应为LlmUiBridge） |
| **project-issues-analysis.md** | ★★★☆☆ | 行数偏差10-18%、"~42个TS文件"→实际66个、console.log统计不精确 |
| **plan-v1.6-1.7.md** | ★★★☆☆ | 文件扩展名全错、多个不存在的路径引用（wallet.js/prompts/等） |

---

### docs/detail/ 详细文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **ai-system.md** | ★★★★☆ | 函数/类/接口描述准确，LLM子模块路径缺 `core/` 目录，3个AI文件遗漏 |
| **data-layer.md** | ★★★★★ | 常量/设置/数据结构完全准确，仅缺2个存储键 |
| **game-logic.md** | ★★★☆☆ | **5个核心参数默认值错误**（bidStep/bidRevealIntervalMs/postRevealWaitMs/directTakeRatio/roundTimeLimitMs） |
| **infrastructure-layer.md** | ★★★★☆ | 音频资源/功能描述准确 |
| **lan-layer.md** | ★★★★☆ | 通信协议描述准确，LAN Mixin文件清单不完整（缺7个文件） |
| **ui-layer.md** | ★★★★☆ | UI结构描述准确，Mixin数量错误（16→19），animations路径错误 |

#### game-logic.md 参数错误详情：
| 参数 | 文档值 | 实际值 | 位置 |
|------|--------|--------|------|
| bidStep | 10,000 | **100** | settings.ts:37 |
| bidRevealIntervalMs | 800 | **650** | settings.ts:35 |
| postRevealWaitMs | 1,500 | **3,000** | settings.ts:36 |
| directTakeRatio | 1.2 | **0.2** | settings.ts:33 |
| roundTimeLimitMs | 30,000ms | **roundSeconds: 60** | 参数名不同 |

---

### docs/plan/ 计划文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **deep-refactoring-plan.md** | ★★★☆☆ | 所有 Phase 未执行，scene/目录用途与预期不同 |
| **main-split-plan.md** | ★★☆☆☆ | **全部 8 个 Phase 未执行**，main.ts 未拆分（仍 2748 行） |
| **mixin-handling-plan.md** | ★★★☆☆ | 三套方案均未执行，类型系统有部分重构 |
| **lan-room-refactor-plan.md** | ★★★☆☆ | Phase 1 确认完成，文件扩展名全错 |
| **warehouse-scene-split-analysis.md** | ★★★☆☆ | 方案A部分执行但方式不同，推荐方案B未执行 |
| **plan-v1.6-1.7.md** | ★★★☆☆ | 文件扩展名全错，验收状态需全面重新评估 |

### docs/plan/ 其余文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **css-management-analysis.md** | ★★★★☆ | 行数统计完全准确，重构方案均未实施 |
| **phaser-vue-coexistence-analysis.md** | ★★★★☆ | 纯技术分析仍有效，假设性路径不存在 |
| **vue-integration-analysis.md** | ★★☆☆☆ | Vue/Pinia 未安装，实施计划全部未开始 |
| **any-elimination-plan.md** | ★★★☆☆ | any数量不准（文档218→实际~170），进度约89% |
| **strict-errors-analysis.md** | ★★★★☆ | 历史修复记录仍有效 |
| **ts-migration-status.md** | ★★★☆☆ | window全局变量未完全清除（eslint仍注册27个） |

### docs/compose/ 文档

| 文档 | 准确度 | 核心问题 |
|------|--------|----------|
| **ai-multi-game-context.md** | ★★★☆☆ | 核心逻辑完成约60-70%，HTML UI和script标签缺失 |

---

## 三、按严重程度排序的问题清单

### P0 — 误导性错误（必须修复）

| 问题 | 涉及文档 | 说明 |
|------|----------|------|
| game-logic.md 5个核心参数默认值错误 | detail/ | bidStep等参数值与代码不符，会误导开发者 |
| AGENTS.md 架构描述完全过时 | 根目录 | IIFE→ES Module，strict false→true，影响所有新贡献者理解项目 |
| main-split-plan.md 全部未执行 | plan/ | 8个Phase全部未完成，文档仍像"即将执行" |

### P1 — 广泛性过时（需要批量更新）

| 问题 | 涉及文档数 | 说明 |
|------|-----------|------|
| 文件扩展名 .js → .ts | **20+** | 几乎所有文档 |
| Mixin 数量不一致 | **8** | 16/19/21/25 各种数字 |
| 文件行数偏差 | **10+** | main.ts 2548→2748 等 |
| 架构模式描述过时 | **5** | IIFE/globals→ES Module |

### P2 — 信息缺失（需要补充）

| 问题 | 涉及文档 | 说明 |
|------|----------|------|
| 新增模块未记录 | project-overview, module-analysis | round-manager, skill-item-manager, settlement-manager, summarizer, game-history, context-builder 等 |
| LLM子模块路径缺core/ | ai-system, module-analysis | scripts/llm/core/ 未被识别 |
| 品质颜色双重定义未说明 | README | constants.ts vs artifacts.ts 两套颜色 |
| lan/ 8个文件未完整列出 | lan-layer | 仅列出 index.ts，缺 lobby/events/sync 等 |

### P3 — 数据不精确

| 问题 | 涉及文档 | 说明 |
|------|----------|------|
| console.log/window.等统计数据 | project-issues | 精确数字需重新统计 |
| any消除进度 | any-elimination | 218→~170 |
| eslint全局变量与globals.d.ts不一致 | 根目录 | 两边声明不同步 |

---

## 四、文档优化建议

### 优先级 1：立即更新

1. **AGENTS.md** — 重写"Module system"和"Architecture"部分，准确描述 Vite + ES Module 架构
2. **game-logic.md** — 修正 5 个核心参数默认值
3. **README.md** — 修正 Mixin 名称列表，说明 Phaser v3/v4 版本差异

### 优先级 2：批量更新

4. **全部 25 个文档** — 将 `.js` 后缀替换为 `.ts`
5. **project-overview.md** — 更新文件数量（47→66）、架构描述、Mixin 数量
6. **module-analysis.md** — 更新模块文件数统计

### 优先级 3：补充缺失

7. **所有 detail/ 文档** — 补充新增模块的描述
8. **lan-layer.md** — 补充 LAN Mixin 的 7 个文件清单
9. **plan/ 文档** — 标注各 Phase 的实际执行状态

### 优先级 4：清理废弃

10. **main-split-plan.md** — 标注"未执行"或更新为新方案
11. **vue-integration-analysis.md** — 标注"未开始"状态
12. **deep-refactoring-plan.md** — 标注各 Phase 状态

---

## 五、文档准确性分布

```
★★★★★  data-layer.md                    (1个)
★★★★☆  README, ai-system, feature-file,  (6个)
         infrastructure, lan-layer, ui-layer,
         css-management, phaser-vue,
         strict-errors
★★★☆☆  module-analysis, project-issues,  (10个)
         plan-v1.6-1.7, deep-refactoring,
         mixin-handling, lan-room-refactor,
         warehouse-scene-split, any-elimination,
         ts-migration, ai-multi-game-context
★★☆☆☆  AGENTS.md, project-overview,      (4个)
         main-split-plan, vue-integration
★☆☆☆☆  无
```

**平均准确度**：约 ★★★☆☆（3/5），主要被架构描述过时和文件扩展名问题拖低。
