# AGENTS.md
写在最前：对于所有不确定的问题应该先咨询，尤其是对于游戏规则和设计的问题，不能自己假设。非常重要。非常重要。非常重要。
## Project

"摸宝仓库" (warehouse-mobao) v1.7.0 - Phaser 3 竞拍/暗仓游戏。Phaser 3.90 + TypeScript + Vite + Vue 3 + Pinia。纯前端（除 LAN 服务器）。中文代码库。测试（Vitest）。

## 文档导航

| 文档 | 用途 |
|------|------|
| `FILE_GUIDE.md` | **每个源文件的一句话职责**，按目录组织。定位文件先看这里。 |
| `docs/plans/short-term-roadmap.md` | 短期计划书（重构收尾 -> APK -> 修复 -> 新功能） |
| `README.md` | 游戏玩法、系统设计、运行方式（面向用户） |

## Commands

```bash
npm run dev          # Vite dev server (port 5173, LAN-accessible)
npm run build        # Vite build -> dist/
npm run test         # Vitest 全量测试
npm run lint         # eslint scripts/
npm run format       # prettier --check scripts/
npm run server       # LAN WebSocket server (lan/server/)
npx tsc --noEmit     # TypeScript type check
cd android && ./gradlew.bat assembleDebug  # Android APK 构建
```

## Architecture

### Manager 架构（替代 Mixin）

项目已从 19 Mixin + Object.assign 迁移到 **22 Manager 类 + 依赖注入**：

- 每个 Manager 是薄协调器（48-374 行），方法一行委托到按域拆分的函数文件
- Manager 构造函数接收 `Deps` 接口（显式依赖，可独立单测）
- `WarehouseScene` 构造函数创建所有 Manager 实例并注入依赖
- 48 个旧 Mixin 代理文件仍存在（薄转发层），待清理

**新功能写成 Manager + 函数文件**，不要用 Mixin 或直接给类加方法。

### Bridge 层

LLM / 战绩 / 结算三个重子系统是工厂函数（`createXxxBridge(deps)`），返回 `{ methods, ... }`，`.methods` 直接 `Object.assign` 到原型。

### 依赖注入

`scripts/game/core/deps.ts` 提供 `Deps` 容器。`scripts/game/core/logger.ts` 提供结构化日志（`createLogger("Category")`，4 级别，localStorage 可配置）。

### CSS 按域拆分

`styles/game/styles.css` 是薄入口（58 行），`@import` 8 个域文件（`_hud` / `_settings` / `_overlays` / `_ai-panel` / `_battle-record` / `_collection` / `_settlement` / `_player`）。

### Vite 开发代理

`vite.config.js` 内置 LLM CORS 代理插件：dev 环境自动把外部 API URL 改写为 `/llm-cors-proxy/https://...`，通过 Vite 中间件转发，避免浏览器 CORS 拦截。生产环境（Android WebView）走直连。

## Key files

| File | Role |
|------|------|
| `scripts/game/main.ts` | 装配入口（198 行）：桥接层初始化 + Manager/Mixin/bridge 合并 + Phaser 启动 |
| `scripts/game/scene/warehouse-scene.ts` | WarehouseScene 类定义 + 构造函数（Manager 实例化） |
| `scripts/game/scene/scene-*.ts` | 场景方法（init/run/hud/utils/ai-panel/character）+ 事件绑定（events-*.ts） |
| `scripts/game/core/logger.ts` | 结构化日志工具（createLogger） |
| `scripts/game/core/constants.ts` | 游戏常量（网格、存储键、品质） |
| `scripts/game/core/deps.ts` | 依赖注入容器 |
| `scripts/game/core/settings.ts` | 游戏设置 + 玩家资金管理 |
| `scripts/game/data/*.ts` | 藏品/角色/技能/道具/地图数据 + Manager |
| `scripts/game/ai/*.ts` | AI 系统（bidding/intel/memory/reflection/wallet/decision） |
| `scripts/llm/core/*.ts` | LLM 系统（manager/provider-factory/decision/error/settings） |
| `scripts/llm/providers/*.ts` | LLM Provider（DeepSeek/OpenAI/Qwen/GLM/Kimi） |
| `scripts/game/bridge/*.ts` | Bridge 层（settlement/battle-record/shop） |
| `scripts/game/warehouse/*.ts` | 仓库网格 + 藏品揭示 + 预览 |
| `scripts/game/bidding/*.ts` | 出价流程 + 键盘 + 回合结算 |
| `scripts/game/ui/*.ts` | UI 覆盖层 + 侧边面板 + 历史 |
| `scripts/game/lan/*.ts` | LAN 联机（events/sync/reconnect/settle/game-flow/live2d） |
| `scripts/audio/*.ts` | 音频管理 |
| `scripts/mobile/*.ts` | 移动端适配 |
| `types/*.d.ts` | TypeScript 类型定义 |

## 测试原则（必须遵守，违反视为未完成，实在测不了就反馈给开发者）

### 一、测试的唯一目的是抓 bug

- **测试是用来抓真实 bug 的，不是用来通过的。** 如果测试通过但实际游戏里 bug 存在，说明测试是错的，必须重写。
- **写测试前必须自问：这个测试能不能抓到 XXX bug？答不上来就不准写。** 例：能不能抓到"联机结算和单机不一致"？能不能抓到"第二轮无法出价"？不能抓到具体 bug 的测试就是废测试，不准合入。
- **如果某个 bug 是用户手动测出来的、不是自动化测试提前抓住的，对应的自动化测试就是失职的。** 用户反馈bug后，必须先看测试有没有测到这个 bug，如果测试通过，说明测试是错的，必须重写，如果没测到，说明测试是遗落的，必须写测试，并反思相关测试是否完整。
- **测试通过不等于代码正确。** 循环论证的测试（用迎合代码逻辑的数据写测试，测出代码逻辑正确）一律作废。
### 二、测试数据必须来自游戏真实数据源

- **优先使用游戏自己的数据生成函数和常量**：`ARTIFACT_LIBRARY`、`SKILL_DEFS`、`ITEM_DEFS`、`GAME_SETTINGS`、`CHARACTERS`、`MAP_PROFILES`、`QUALITY_CONFIG` 等。禁止自己编造等价数据来"方便测试"。
- **只有当值本身就是用户输入或不可预测的随机值时，才允许使用编造数据。** 例：出价金额（用户输入）、时间戳、随机种子。但即使这类数据，也必须通过游戏的真实接口传入，不能直接 set 到内部字段。
- **数据量必须足够大才能触发边界条件。** 例：73 件藏品比 3 件藏品更容易暴露排序 bug。

### 三、调用链必须走真实函数

- **禁止 mock 被测试链路上的函数。** 只 mock 外部边界（Phaser 渲染、DOM、网络请求、`window.fetch`、`localStorage`）。
- **禁止直接 set 内部字段来"模拟"操作。** 例：要测试"玩家出价后结算"，必须调 `playerBid()` → `buildRoundBids()` → `resolveRoundBids()`，不能 `state.game.playerRoundBid = 5000; state.game.settled = true`。
- **行为测试测用户可见结果，不测内部函数调用。** 测"联机和单机结算结果一致"（用户关心），不测"`resolveRoundBids` 被调用了"（用户不关心）。禁止 `expect(vi.fn()).toHaveBeenCalled()` 式的断言。
- **depps 的 getter/setter 必须通过真实 Manager 方法触发，禁止在测试里直接调 `deps.setPlayerRoundBid(5000)` 然后断言 `deps.getPlayerRoundBid() === 5000`。**

### 四、每个测试必须写预期

- 用注释写明"应该发生什么、为什么"。预期写错了，测试等于没写。
- **禁止自己瞎猜游戏规则。** 游戏有独立的胜负判断体系（直接拿下判定、分红/门票机制、最后一轮强制结束），不能假设"最高价赢"。不确定规则就问，不准自己编规则然后写测试。
- **联机与单机的奇偶测试**：如果单机正常联机出错，预期是"联机结果与单机一致（复用同一逻辑）"，即同样输入下联机输出==单机输出。
- **联机必须复用单机逻辑，不重复实现。** 单机正常的逻辑，联机应直接调用，不该另写一套。如果联机有单机没有的 bug，说明没复用，先查是否重复实现。

### 五、覆盖要求

- **所有新函数/新功能必须配套测试。** 纯函数加单测，长链路加集测，用户流程进行测。没有测试的代码不准合入。
- **大功能加集成测试。** 涉及多 Manager/多函数的功能，必须写集成测试覆盖完整链路（提交 → 存储 → 收集 → 结算 → 验证），不只测单函数。
- **新功能的行为测试补进 `tests/behavioral/`**，覆盖用户可见流程。行为测试要有完整框架（见 `tests/behavioral/TEST_DESIGN.md`），禁止写成临时补丁。
- **持久化设置禁止被 reset 清空。** 持久化字段（localStorage 保存的）跨 reset/新局保留，只有用户主动操作（如"恢复默认"）才能清。每个 reset 方法注释必须写明"重置什么、保留什么持久化字段、为什么"。

### 六、生命周期三问（每个持久化字段/缓存必须答）

每新增或修改一个持久化字段（含 `aiConversationByPlayer`、`aiCrossGameMessagesByPlayer`、`aiConversationCache` 等缓存），必须有三条测试覆盖：

1. **谁产生** — 什么操作往这个字段写数据？（测"写进去了"）
2. **谁消费** — 什么操作读取这个字段做决策？（测"用到了"）
3. **谁清理** — 什么操作/时机清空这个字段？（测"清掉了"）

缺失任何一条视为测试遗漏，不准合入。

### 七、禁止的模式

- **禁止** `expect(mgr["state"].xxx).toBe(...)` — 直接访问私有字段。
- **禁止** `expect(vi.fn()).toHaveBeenCalled()` — 测内部函数调用而非行为。
- **禁止** `state.game.round = 3; expect(state.game.round).toBe(3)` — 测 JavaScript 赋值。
- **禁止** 做自己编的数据 → 传入自己 mock 的函数 → 断言自己编的预期。这等于什么都没测。
- **禁止一刀切**：重置/赋值方法必须区分语义（`resetLanState` 保留连接 vs `disconnectLan` 断开），不能图省事全重置。
- **禁止任何 `any` 类型。** 用具体类型或 `unknown` + 类型守卫。`unknown` 仅当类型真正无法确定时使用。

## Conventions

- **禁止 any**：用具体类型或 `unknown` + 类型守卫。`unknown` 仅当类型真正无法确定时使用。
- **Prettier**：无分号、双引号、120 print width、无尾逗号、LF。
- **文件命名**：kebab-case 文件，PascalCase 类。
- **中文**：所有用户可见字符串、注释、文档。
- **文件长度**：新文件不超过 300 行。超过按"薄入口 + 函数文件"拆分。
- **日志**：用 `createLogger("Category")`，不用 `console.log`。级别 debug/info/warn/error。
- **新 Manager**：构造函数接收 deps 接口，方法委托函数文件，加集成测试。
- **CSS**：用全局 class（已加载），不写 scoped 样式。新样式加到对应域文件。
- **禁止直接赋值成员属性**：状态修改必须通过对象的方法（语义 reset/赋值函数），不直接 `this.xxx = value` 散落各处。重置用统一 reset 函数（`resetLanState`/`resetForNewRun`/`resetForNewRound`）。例外：极简对象/临时变量/构造函数初始化，或写赋值方法的成本大于直接赋值时。**不写逐属性 setter**（`setXxx`），只写语义方法（业务动作/重置范围，如 `startLanGame`/`submitBid`/`resetForNewRound`），逐属性 setter 仅在有校验或副作用时才加。
- **无注释**除非要求。现有 JSDoc 是文档不是风格。

## 子代理规则

派发子代理时**必须在指令里明确以下约束**：

- **何时派**：2+ 独立任务且文件域不冲突时并行；单任务自己做。**规划与 review 由主代理完成，子代理执行**。
- **模型**：`model: "haiku"`。
- **禁止 any**：能用具体类型就用，仅真正无法确定时用 `unknown` + 类型守卫。
- **只做三类操作**：读文件 / 编辑指派范围文件 / 跑验证命令。
- **禁止破坏性 git**：`stash`/`reset --hard`/`checkout --`/`clean`/`stash drop`/`restore`。需干净基线用按文件 tsc。
- **禁止 commit/push**，除非明确要求。
- **不越界编辑**：只改指派文件。
- **验证被阻塞时报告**，不 stash/reset 隔离。

## 重构教训（一开始遵守就不会重构）

| 教训 | 后果 | 规则 |
|------|------|------|
| 巨行星文件 | 2748 行 main.ts 无法维护 | 文件不超过 300 行 |
| Mixin 隐式 this 耦合 | 无法独立测试 | 用 Manager + DI，不用 Mixin |
| 无类型 | 运行时错误频发 | 禁止 any，strict 模式 |
| 无集成测试 | 构造顺序 bug 漏到运行时 | 架构改动加集成测试 |
| console.log 满天飞 | 无法排查 | 从一开始用 createLogger() |
| 子代理擅自 git stash | 丢失并行流改动 | 子代理禁止破坏性 git |
| Vue 用独立容器 | CSS 定位全乱 | Vue 原地挂载，不用独立容器 |
| Phaser API 静态引用 | 构造时 undefined | Phaser API 用 getter |
| deps 值捕获 null | 联机房主返回消息发不出 | deps 里引用 `this.xxx` 必须用 getter（构造时可能为 null） |
| createXxx 没配 setXxx | bridge 创建后 scene.lanBridge 仍 null，playerId 全 undefined | Manager 用 createLanBridge 创建实例后必须 setLanBridge 存储，否则 getXxx 返回 null |
| endpoint 无校验 | URL 被当相对路径 | 所有 Provider 走 normalizeEndpoint |

## Gotchas

- **禁止未经同意删除文件**：即使文件看起来无用，先问。
- **TypeScript strict**：`strict: true`，`noImplicitAny: true`，`strictNullChecks: true`。`.js` 不检查。
- **LAN server 独立**：`lan/server/` 有自己的 `package.json`。
- **Android 构建**：需 JDK 17 + Gradle + Android SDK at `D:\web\tool\`。`copyWebAssets` 从 `dist/` 复制。
- **localStorage 键**：全部 `mobao_` 前缀。改键破坏向后兼容。
- **日志控制**：`localStorage.setItem("mobao_log_level", "warn")` 只看警告；`"mobao_log_categories", "AI,LLM"` 按分类过滤。
- **FILE_GUIDE.md** 是文件定位首选。
