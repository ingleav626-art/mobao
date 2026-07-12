# 项目文档索引

> 摸宝仓库（warehouse-mobao）项目文档，按用途分为四类。

---

## 参考资料（reference/）

稳定的技术参考文档，不常变动。

| 文档 | 内容 |
|------|------|
| [项目导览](reference/project-overview.md) | 技术栈、目录结构、架构模式、开发指南 |
| [模块分析](reference/module-analysis.md) | 7 大模块依赖关系、核心接口、出价算法 |
| [功能-文件映射](reference/feature-file-mapping.md) | 每个功能涉及哪些文件、调用链路、单机/联机差异 |
| [AI 系统](reference/ai-system.md) | 双引擎架构、人格系统、LLM 决策流程、跨局记忆 |
| [游戏逻辑](reference/game-logic.md) | 仓库系统、出价流程、商店、结算、战绩 |
| [数据层](reference/data-layer.md) | 藏品、角色、技能、道具、地图定义 |
| [UI 层](reference/ui-layer.md) | 大厅、面板、弹窗、历史记录 |
| [联机层](reference/lan-layer.md) | WebSocket 通信、房间管理、协议定义 |
| [基础设施层](reference/infrastructure-layer.md) | 音频系统、移动端适配 |

---

## 问题分析（issues/）

当前项目的痛点和待解决的问题。

| 文档 | 内容 | 优先级 |
|------|------|--------|
| [代码质量](issues/code-quality.md) | console.log 滥用、错误处理不一致、测试缺失、API Key 安全、CORS 代理 | P0/P1 |
| [架构问题](issues/architecture.md) | 巨行星文件（main.ts 2748行）、Mixin 隐式耦合、IIFE 滥用、模块化不完整 | P1/P2 |
| [CSS 管理](issues/css-management.md) | 超级文件（styles.css 3711行）、优先级混乱、手机端样式分散 | P2 |

---

## 执行计划（plans/）

待做或进行中的计划。

| 文档 | 内容 | 状态 |
|------|------|------|
| [v1.6-1.7 计划](plans/v1.6-1.7.md) | 角色收尾、体验升级、Bug 修复、AI 优化、代码结构优化 | 进行中 |
| [main.ts 拆分](plans/main-split.md) | 2748 行拆分为 scene/ 目录（8+ 个文件），main.ts 降至 250 行 | ✅ 已完成 |
| [场景拆分方案](plans/warehouse-scene-split.md) | WarehouseScene 从 Mixin 改为组合模式 | 待执行 |
| [联机房间重构](plans/lan-room-refactor.md) | 角色/地图/道具选择同步、房间管理 | 部分完成 |
| [Vue 引入方案](plans/vue-integration.md) | Phaser + Vue 共存分析、Pinia 状态管理 | 评估中 |
| [测试覆盖率提升](plans/test-coverage.md) | 7% -> 13.7%（972 用例），Phase 4 纯函数提取进行中 | 进行中 |

---

## 归档（archive/）

已完成或不再活跃的文档，保留作为历史参考。

| 文档 | 内容 | 状态 |
|------|------|------|
| [TypeScript 迁移](archive/ts-migration.md) | TS 迁移现状：文件已迁移、类型已定义、strict 已开启 | ✅ 已完成 |
| [Strict 模式修复](archive/strict-errors.md) | 从 2000+ 错误到 0 错误的修复过程 | ✅ 已完成 |
| [any 类型消除](archive/any-elimination.md) | any 从 1,494 处降至 218 处（85%） | 🔄 接近完成 |
| [AI 多局上下文](archive/ai-multi-game-context.md) | game-history.ts、summarizer.ts 实现计划 | ✅ 已完成 |
