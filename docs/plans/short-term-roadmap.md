# 短期计划书：重构收尾 → APK → 修复 → 新功能

> 创建时间：2026-07-15
> 性质：短期执行计划（1-2 周）
> 基于：用户 7 点方向性指导

---

## 阶段一：重构收尾 + 价值分析

### 1.1 剩余清理

| 项 | 说明 | 风险 |
|----|------|------|
| 48 个 Mixin 代理文件 | 薄代理层（`return this.xxxManager.method()`），移除后调用方改 `this.xxxManager.method()` | 中（大量调用点） |
| 122 个 lint warning | `as any` 残留，逐步替换为 `unknown` + 类型守卫 | 低 |
| 1 个 lint error | `sync-fns.ts` 的 `item as Artifact` 未使用表达式 | 低 |
| Vue 代码 | 12 个 .vue + 10 个 store + 桥接代码，已禁用，决定删除还是保留 | 低 |
| Manager 桥接代码 | 各 Manager 函数末尾的 try/catch Pinia 同步（Vue 禁用后无害但冗余）| 低 |
| stash@{0} | 事故遗留，已冗余 | 无 |
| lobby Phase 2-4 | 1282 行单函数，需 LAN 冒烟后再拆 | 高（需联机测试）|

### 1.2 价值分析（重构总结）

**消除的问题**：
- 巨行星文件：main.ts(2748行)→198、intel.ts(1673行)→39、llm-decision.ts(1750行)→46、llm-manager.ts(1267行)→519、warehouse/index.ts(1306行)→薄入口、character-select.ts(1360行)→459、overlay.ts(957行)→32、bidding.ts(1213行)→716
- 超级对象隐式耦合：19 Mixin + Object.assign → 22 Manager + 依赖注入（显式 deps 接口）
- 类型不安全：JS 无类型 → TS strict 模式 0 错误
- 测试缺失：0 集成测试 → 30 个（构造冒烟 + 状态同步 + 多函数链）
- 日志混乱：441 个散乱 console.log → 结构化 logger（4 级别 + 分类 + 可配置）
- CSS 巨型文件：styles.css(4324行) → 58 行薄入口 + 8 域文件
- 存储键硬编码 → constants.ts 统一管理
- deepseek-llm 双轨 Provider → 统一到 provider-factory 工厂模式

**带来的架构**：
- 22 个薄 Manager（48-374 行）+ 按域拆分的函数文件
- Deps 依赖注入（显式接口，可独立单测）
- 集成测试安全网（构造顺序 / 状态同步 / 多函数链）
- 结构化日志系统（可按级别/分类过滤）
- CSS 按域拆分（_hud/_settings/_overlays 等）

**未能完成**：
- Vue UI 迁移（框架已搭建 + HUD 组件重做成功，但整体迁移搁置）
- lobby Phase 2-4（1282 行单函数未拆）
- Mixin 代理层未移除（48 个薄代理仍在）

### 1.3 往期重构（git 可查）

| Commit | 内容 |
|--------|------|
| e20dbaa | Vue3+Pinia 框架初始化 |
| 67bcc1f | 弹窗回调管理 + LLM 端点归一化 + 样式拆分 |
| ad3be06 | 拆分核心逻辑为独立管理器与工具函数 |
| 44402ef | 出价逻辑纯函数重构 |
| a764b16 | 出价引擎拆分薄入口+纯函数子模块 |
| a00e661 | 模块化重构与常量统一管理 |
| 0648ccd | 完成 TypeScript 化重构与代码清理 |

---

## 阶段二：重写 AGENTS.md + 更新 FILE_GUIDE.md

### 2.1 AGENTS.md 改版原则

- **不是计划文档**，是指导书 + 规范 + 快速查找
- 保留：项目简述、命令、代码规范
- 新增：重构教训（一开始遵守就不会重构）
- 更新：架构描述（Mixin → Manager）、文件索引
- 精简：移除过时的拆分计划/Phase 描述

### 2.2 重构教训（写入 AGENTS.md）

| 教训 | 后果 | 规则 |
|------|------|------|
| 巨行星文件 | 2748行 main.ts 无法维护 | 新文件不超过 300 行，超了就拆 |
| Mixin 隐式 this 耦合 | 无法独立测试 | 新代码用 Manager + DI，不用 Mixin |
| 无类型 | 运行时错误频发 | 禁止 any，用 unknown + 类型守卫 |
| 无集成测试 | 构造顺序 bug 漏到运行时 | 每次架构改动加集成测试 |
| console.log 满天飞 | 无法排查 | 用 logger.ts，按级别/分类输出 |
| 子代理擅自 git stash | 丢失并行流改动 | 子代理禁止破坏性 git |
| Vue 用独立容器 | CSS 定位全乱 | Vue 原地挂载，不用 #vue-app |
| Phaser API 静态引用 | 构造时 undefined | Phaser API 用 getter |
| UI 重新设计而非抄 | 样式不一致 | 迁移 = 抄 HTML + 复用 CSS |
| 没有日志系统 | 441 个散乱 console.log | 从一开始就用 createLogger() |

### 2.3 FILE_GUIDE.md 更新

- 反映当前文件结构（Manager + 函数文件 + logger + CSS 域文件）
- 移除已删文件（deepseek-llm.ts 等）
- 新增文件（logger.ts、各 *-manager.ts、CSS 域文件）

---

## 阶段三：APK 打包

### 3.1 修复 copyWebAssets

`android/app/build.gradle` 的 `copyWebAssets` 任务改为从 `dist/` 复制（而非源码根目录）。

### 3.2 构建流程

```
npm run build          # Vite 构建 -> dist/
cd android && ./gradlew.bat assembleDebug   # Gradle 打包
# 输出: android/app/build/outputs/apk/debug/mobao-warehouse-*.apk
```

### 3.3 验证

- APK 安装到设备
- 启动游戏，确认不白屏
- 确认 Phaser 画布渲染
- 确认基本交互（出价/设置/AI）

---

## 阶段四：Bug 修复

### 4.1 已知 bug

| Bug | 状态 | 说明 |
|-----|------|------|
| API endpoint 拼接 | ✅ 已修 | defaultNormalizeEndpoint |
| API CORS | ✅ 已修 | Vite 插件中间件 |
| 设置页保护弹窗不关闭 | ✅ 已修 | Manager getter + 事件处理器 |
| 公共信息错放私人区 | ✅ 已修 | deps 接线修正 |
| 私人信息无限叠加 | ✅ 已修 | startRound 清空 |

### 4.2 待发现 bug

- 需要完整游戏流程测试（开局→出价→揭示→结算→重开）
- 需要联机测试（创建/加入/出价/结算/重连）
- 用户报告的"部分功能缺失"需逐一排查

### 4.3 修复原则

- 优先恢复重构前稳定性
- 每个修复加回归测试
- 不引入新架构问题

---

## 阶段五：文件清理

### 5.1 删除候选

| 类别 | 文件 | 说明 |
|------|------|------|
| Vue 代码 | `scripts/vue/**`（12 .vue + 10 store + app.ts）| 搁置，决定删除还是保留 |
| 过时文档 | `docs/issues/*.md` | 架构/code-quality 已过时，保留 roadmap |
| 过时计划 | `docs/plans/*.md`（除本文件）| 大部分已完成或废弃 |
| 分析文档 | `analysis/*.md` | task-list 已完成，analysis 过时 |
| 桥接代码 | Manager 函数末尾 try/catch Pinia 同步 | Vue 禁用后冗余 |
| stash | `git stash drop stash@{0}` | 事故遗留 |

### 5.2 保留

- `AGENTS.md`（重写后）
- `FILE_GUIDE.md`（更新后）
- `docs/plans/short-term-roadmap.md`（本文件）
- `docs/plans/post-task-list-roadmap.md`（长期路线图）
- `docs/plans/mixin-composition-refactor.md`（架构参考）

---

## 阶段六：新功能规划

### 6.1 查找版本规划文档

- 读 `docs/plans/v1.6-1.7.md`（版本规划）
- 读 `README.md` 的路线图部分
- 对比重构后现状，哪些功能还没实现

### 6.2 重新规划

- 基于当前架构（Manager + 函数文件 + 测试）规划新功能
- 每个新功能遵循：先设计 → 加测试 → 实现 → 验证
- 新功能代码遵守 AGENTS.md 规范

---

## 阶段七：长期健康维护

### 7.1 架构利用

- 22 个 Manager：新功能写成 Manager + 函数文件
- 集成测试：架构改动先加集成测试
- Logger：新代码用 `createLogger("Category")`
- CSS 域文件：新 UI 样式加到对应域文件

### 7.2 代码质量红线

- 文件不超过 300 行
- 禁止 any（用 unknown + 类型守卫）
- 新纯函数必须有测试
- 新 Manager 必须有 deps 接口
- 新 UI 必须复用现有 CSS class

### 7.3 子代理使用规范

- 规划 + review 由主代理完成
- 执行用 haiku 子代理
- 禁止破坏性 git
- 文件域不冲突时可并行

---

## 执行顺序

```
阶段一（重构收尾）
  ├─ 1.1 清理 Mixin 代理 + lint
  ├─ 1.2 价值分析（写入文档）
  └─ 1.3 git 历史整理
      ↓
阶段二（重写文档）
  ├─ 2.1 AGENTS.md 改版
  ├─ 2.2 写入重构教训
  └─ 2.3 FILE_GUIDE.md 更新
      ↓
阶段三（APK 打包）
  ├─ 3.1 修复 copyWebAssets
  ├─ 3.2 构建 APK
  └─ 3.3 设备验证
      ↓
阶段四（Bug 修复）
  ├─ 4.2 游戏流程测试
  ├─ 4.3 逐个修复 + 回归测试
  └─ 恢复重构前稳定性
      ↓
阶段五（文件清理）
  ├─ 5.1 删除过时文件
  └─ 5.2 保留核心文档
      ↓
阶段六（新功能规划）
  ├─ 6.1 查找版本规划
  ├─ 6.2 重新规划
  └─ 开始实现
      ↓
阶段七（长期维护）
  └─ 遵守规范，健康开发
```

---

## 注意事项

- 每个阶段完成后用户验证，确认无问题再进入下一阶段
- 子代理执行，主代理规划 + review
- 不跳阶段，不冒进
- 重构教训写入 AGENTS.md，防止重蹈覆辙
- Vue 代码暂不删除（用户备份了，后续决定）
