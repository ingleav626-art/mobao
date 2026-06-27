# 摸宝仓库 — 项目职责分析总览

> 生成时间：2026-06-18
> 目的：梳理每个文件/文件夹的职责边界，识别职责不清的问题，为迁移做准备

## 分析文档索引

| 文档 | 覆盖范围 |
|------|----------|
| [core.md](core.md) | `scripts/game/core/` — 8个文件 |
| [ai.md](ai.md) | `scripts/game/ai/` — 10个文件 |
| [ui.md](ui.md) | `scripts/game/ui/` — 4个文件 |
| [lan-game.md](lan-game.md) | `scripts/game/lan/` — 8个文件 |
| [data.md](data.md) | `scripts/game/data/` — 7个文件 |
| [lobby.md](lobby.md) | `scripts/game/lobby/` — 3个文件 |
| [bidding.md](bidding.md) | `scripts/game/bidding/` — 1个文件 |
| [bridge.md](bridge.md) | `scripts/game/bridge/` — 3个文件 |
| [warehouse-scene-animations.md](warehouse-scene-animations.md) | `warehouse/` + `scene/` + `animations.ts` + `main.ts` |
| [llm.md](llm.md) | `scripts/llm/` — 14个文件 |
| [mobile-audio-types-lan.md](mobile-audio-types-lan.md) | `scripts/mobile/` + `scripts/audio/` + `types/` + `lan/` |
| [root.md](root.md) | `index.html` + 配置文件 |

## 全局性问题汇总

### P0 — 必须立即处理

| 问题 | 涉及文件 | 说明 |
|------|----------|------|
| `deepseek-llm.ts` 完全冗余 | scripts/llm/providers/ | 719行遗留代码，与 deepseek-provider.ts + llm-manager.ts 功能重复 |
| `scene/warehouse-scene.ts` 未被使用 | scripts/game/scene/ | 与 main.ts 重复定义 WarehouseScene 类 |
| `lan/shared/protocol.ts` 未被使用 | lan/shared/ | 定义了协议常量但无人引用 |

### P1 — 高优先级

| 问题 | 涉及文件 | 说明 |
|------|----------|------|
| intel.ts 职责过载 | scripts/game/ai/ | 1643行，8个不相关职责 |
| llm-decision.ts 过重 | scripts/llm/core/ | 1685行，决策+遥测+DOM渲染 |
| llm-manager.ts 过重 | scripts/llm/core/ | 1267行，7项职责 |
| lobby.ts 严重臃肿 | scripts/game/lan/ | 1293行，UI+网络扫描+房间管理 |
| overlay.ts God Object | scripts/game/ui/ | 941行，40+方法 |
| characters.ts 与 character-system.ts 双写 | scripts/game/data/ | 两套角色选择持久化路径 |
| 文档与代码严重脱节 | AGENTS.md | 描述旧的IIFE模式，实际已是Vite module |

### P2 — 中优先级

| 问题 | 涉及文件 | 说明 |
|------|----------|------|
| utils.ts 职责过多 | scripts/game/core/ | 270行20+函数，6类不同用途 |
| settings.ts 混合两种业务 | scripts/game/core/ | 游戏设置 + 玩家资金 |
| artifacts.ts 过大 | scripts/game/data/ | 1148行，数据+逻辑混杂 |
| battle-record.ts 过载 | scripts/game/bridge/ | 908行，持久化+UI+Phaser重建 |
| character-select.ts 过大 | scripts/game/lobby/ | 1360行，Live2D+道具携带 |
| server.js 过大 | lan/server/ | 1382行，混入LLM代理 |
| mobile-handler.ts 过大 | scripts/mobile/ | 812行，5个功能域 |
| 5个Provider normalizeSettings重复 | scripts/llm/providers/ | 结构几乎完全一致 |
| llm-settings.ts 与 llm-ui-bridge.ts 重叠 | scripts/llm/core/ | 两套设置读写逻辑并存 |

### P3 — 低优先级

| 问题 | 涉及文件 | 说明 |
|------|----------|------|
| warehouse-scene-this.d.ts 维护噩梦 | types/ | 919行扁平类型，重复声明多处 |
| LanBridge 类型三处重复定义 | types/ + lan/ | globals.d.ts + lan.d.ts + lan-bridge.d.ts |
| localStorage键重复定义 | core/ | app-state.ts 与 constants.ts |
| AI专用函数放在通用utils中 | core/utils.ts | createEmptyAiPrivateIntelPool等 |
| UI逻辑散落在非UI文件中 | ai/ + llm/ | memory, reflection, intel, llm-decision |
| 模块系统混乱 | 全局 | 部分export部分window全局挂载 |
| 端口冲突 | proxy-server.js + vite.config.js | 都用3000端口 |
| eslint全局变量与globals.d.ts不一致 | 配置文件 | 两边声明不同步 |

## 跨文件夹职责交叉

```
characters.ts ←→ character-system.ts     (角色选择，双写localStorage)
artifacts.ts  ←→ public-events.ts        (QUALITY_LABELS 重复)
items.ts      ←→ skills.ts               (同构未抽象)
warehouse/ 揭示特效 ←→ bridge/settlement.ts 揭示特效  (逻辑重复)
proxy-server.js ←→ server.js /api/deepseek  (LLM代理重复)
llm-settings.ts ←→ llm-ui-bridge.ts     (设置读写重叠)
```

## 改进路线图建议

### 阶段一：清理死代码和重复（1-2天）
- 删除 `scene/warehouse-scene.ts`
- 删除 `deepseek-llm.ts`（确认无引用后）
- 删除 `sync.ts` 中重复的 `tryAutoReconnect`
- 合并 `characters.ts` 与 `character-system.ts`
- 删除 `warehouse-scene-this.d.ts` 中的重复导入和属性

### 阶段二：拆分大文件（3-5天）
- 拆分 `intel.ts` → intel-pool / intel-actions / intel-tracker
- 拆分 `llm-decision.ts` → decision-core / telemetry / ui-panel
- 拆分 `llm-manager.ts` → registry / request / utils / token-monitor
- 拆分 `lobby.ts` → lobby-ui / lobby-scan / lobby-room
- 拆分 `overlay.ts` → 各面板独立文件
- 拆分 `artifacts.ts` → ArtifactManager 独立

### 阶段三：统一架构（5-7天）
- 统一模块系统：全部迁移到 ES module export
- 统一存储键管理到 constants.ts
- 使用 protocol.ts 替代硬编码消息类型
- 同步 eslint 全局变量与 globals.d.ts
- 更新 AGENTS.md 文档
- 消除 LLM 代理重复
