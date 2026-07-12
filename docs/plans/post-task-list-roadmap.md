# task-list 之后的路线图

> 创建时间：2026-07-12
> 背景：task-list（analysis/task-list.md，32 项）是"按文件/按症状"的职责清理清单。本文档评估其完成度对"文件职责问题"的解决情况，并列出 task-list 之外的下一步。

---

## 一、task-list 与文件职责问题的关系

task-list 32 项中 **~22 项是文件职责类**（职责过载 / 混杂 / 错位 / 重复），其余为类型重复(#5)、缺导出(#13)、bug(#23)、死代码(#26)等。

截至 2026-07-12，已解决 **S1-S30**（见 task-list "已解决"表），包括：
- God Object 拆分：main.ts(2748->198)、ai/intel.ts(1673->39)、llm-decision.ts(1750->46)、llm-manager.ts(1267->519)、warehouse/index.ts(1306->薄)、character-select.ts(1360->459)、ui/overlay.ts(957->32)、ai/bidding.ts(1213->716)
- 职责分离：AI UI 混入迁出(S23)、bidding 三职责分离(S24/S25)、通用对话框错位(S28)、useSkill/useItem 去重(S26)、finishAuction 联机/单机分离(S29)
- 架构清理：deepseek 双轨消除(S13)、scene 代理精简(S16)、MainOnlyMethods 归位(S15)、Deps 类型补全(S14)、ESLint 修复(S17)
- 重复/硬编码：lan/events 重复注册(S27)、reconnect 硬编码(S30)、存储键统一(S22)、LlmChatResult 去重(S19)、qwen 注册(S20)、clamp 去重(#1)

**结论**：task-list 完成后，**文件级职责问题基本解决**（职责过载/混杂/错位/重复均覆盖）。

---

## 二、task-list 未覆盖的缺口

task-list 是"按文件/按症状"的清单，**未覆盖 4 类更高层问题**：

| 缺口 | 性质 | 现状 |
|------|------|------|
| **Mixin 架构耦合本身** | 最深结构债 | 19 个 Mixin + `Object.assign` 合并 + 隐式 `this` 互调；`WarehouseSceneThis` 接口 **1022 行**声明全部方法。task-list 只拆文件（治症状），不拆架构（治本）。这是 `docs/issues/architecture.md` 的 Phase 2（依赖注入/组合），最大但最值钱 |
| **console.log 滥用** | 代码质量 | lint 现 305 warning（295 `any` + 部分日志）。非 task-list 项，但 lint 已可见并强制 warn |
| **测试覆盖** | 独立关注点 | 纯函数层覆盖好（1078 测试，本会话 +67），但 DOM/scene/lan/audio 几乎零覆盖。task-list 不涉及，但每次拆分都在改善可测性 |
| **data/ 定义+管理器耦合** | 模式问题 | #29(artifacts)/#31(items+skills) 部分覆盖，但 data/ 整体模式（静态定义 + 运行时管理器同文件）未统一 |

---

## 三、下一步路线图（按收益/风险/时机排序）

### 1. 收尾 task-list（近期）
- **lobby Phase 2-4**（P0 #4，1282 行单函数）：唯一剩的 P0，需 LAN 联机冒烟验证。Phase 1 纯函数已提取+测试。
- 剩余 P1：#9(defaultStats，疑似已done待确认)/#10(core/utils AI 函数错位)/#11(settings 拆分)/#19(lobby 收藏，计划就绪)/#22(llm provider normalize 同构)/#24(llm-settings vs ui-bridge 重叠) + #16(battle-record，计划就绪，Phase 1 进行中)
- 剩余 P2：#25(LanBridge 类型三重)/#26(protocol.ts，#18 后续顺带解决)/#27(mobile-handler)/#28(audio-manager)/#29(artifacts)/#30(public-events)/#31(items+skills 同构)/#32(settlement 粒子)

### 2. 架构 Phase 2：Mixin -> 组合/依赖注入（中期，最深结构债）
- 把 19 个 Mixin 改为独立 Manager 类 + 构造函数注入依赖，消除隐式 `this` 耦合 + 1022 行 WarehouseSceneThis 接口。
- 大幅提升可测性（每个 Manager 可独立单测）。
- 风险高、收益大。`docs/issues/architecture.md` 已规划方案 A（依赖注入，推荐）/B（事件驱动）/C（保守改类型）。
- 渐进式：先高频 Mixin（UiManager/RevealManager/BidManager）改独立类，逐步替换。

### 3. 测试覆盖提升（中期）
- 利用已提取的纯函数（各 pure.ts）继续加测。
- 给 scene/lan 核心逻辑加测（需 mock Phaser/DOM）。
- DOM 层需 Vue Test Utils（依赖 Vue 引入）。

### 4. UI 现代化：Vue 引入（中长期，`docs/plans/vue-integration.md`）
- DOM 手动操作（document.getElementById/innerHTML）-> Vue 响应式。
- 解 UI 层越界（如 saveSettingsFromOverlay 直改游戏状态）+ UI 可测。
- 与架构 Phase 2 互补（Vue 管 UI 状态，Manager 管业务逻辑）。
- 分阶段：先 HUD/面板/弹窗，游戏画布保持 Phaser。

### 5. 质量补强（持续）
- **any 阶段 IV**：196 处 `:any`+`as any`（lint warn 强制中），逐步改 `unknown`/具体类型。归档"保留清单"~100 处合法 any（JSON.parse/Phaser 内部/动态键）。
- **console.log 清理**：lint 可见的调试日志，分级清理。
- **死代码**：#26 protocol.ts（#18 后续顺带）等。

### 6. CI/CD（基建）
- 加 GitHub Actions 跑 `tsc --noEmit` + `npm run test` + `npm run lint`，PR 时自动检测防回归。
- 项目当前无 CI（`docs/issues/code-quality.md` 标为 P2）。

---

## 四、判断

- **task-list 是"文件职责"的治标层**，完成后文件职责基本干净。
- **真正的"治本"是架构 Phase 2（Mixin 解耦）**，那是下一个大坎，也是可测性的根本解锁点。
- **短期建议**：收尾 task-list（含 lobby）+ 补 any/测试 + 清理 console.log。
- **中期决策**：架构 Phase 2（Mixin -> 组合）或 Vue 引入，二选一优先或并行。两者都大工程，建议先出专项计划再动手。

---

## 五、当前量化状态（2026-07-12）

| 指标 | 值 |
|------|-----|
| TS 文件 | 100+ |
| 测试用例 | 1078（本会话 +67） |
| tsc | 0 错误 |
| lint | 0 error / 305 warning（295 any） |
| `:any`+`as any` | 196（低于 218 基线） |
| God Object 残留 | lan/lobby.ts(1282，Phase 2-4 待办) |
| task-list 已解决 | S1-S30（30 项） |
