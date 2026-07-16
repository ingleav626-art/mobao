# AGENTS.md

## Project

"摸宝仓库" (warehouse-mobao) v1.7.0 - Phaser 3 竞拍/暗仓游戏。Phaser 3.90 + TypeScript + Vite + Vue 3 + Pinia。纯前端（除 LAN 服务器）。中文代码库。~1867 测试（Vitest）。

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

## Conventions

- **禁止 any**：用具体类型或 `unknown` + 类型守卫。`unknown` 仅当类型真正无法确定时使用。
- **Prettier**：无分号、双引号、120 print width、无尾逗号、LF。
- **文件命名**：kebab-case 文件，PascalCase 类。
- **中文**：所有用户可见字符串、注释、文档。
- **文件长度**：新文件不超过 300 行。超过按"薄入口 + 函数文件"拆分。
- **日志**：用 `createLogger("Category")`，不用 `console.log`。级别 debug/info/warn/error。
- **新 Manager**：构造函数接收 deps 接口，方法委托函数文件，加集成测试。
- **CSS**：用全局 class（已加载），不写 scoped 样式。新样式加到对应域文件。
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
| UI 重新设计而非抄 | 样式不一致 | 迁移 = 抄 HTML + 复用 CSS |
| endpoint 无校验 | URL 被当相对路径 | 所有 Provider 走 normalizeEndpoint |

## Gotchas

- **禁止未经同意删除文件**：即使文件看起来无用，先问。
- **TypeScript strict**：`strict: true`，`noImplicitAny: true`，`strictNullChecks: true`。`.js` 不检查。
- **LAN server 独立**：`lan/server/` 有自己的 `package.json`。
- **Android 构建**：需 JDK 17 + Gradle + Android SDK at `D:\web\tool\`。`copyWebAssets` 从 `dist/` 复制。
- **localStorage 键**：全部 `mobao_` 前缀。改键破坏向后兼容。
- **日志控制**：`localStorage.setItem("mobao_log_level", "warn")` 只看警告；`"mobao_log_categories", "AI,LLM"` 按分类过滤。
- **FILE_GUIDE.md** 是文件定位首选。
