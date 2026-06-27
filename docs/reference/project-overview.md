# 项目导览

> 本文档面向开发者，帮助你快速理解项目整体架构和代码组织方式。
> 游戏玩法与功能说明请参阅 [README.md](../README.md)。

---

## 一、项目简介

**摸宝仓库** — 一款基于 Phaser 3 的仓库摸宝竞拍游戏。玩家选择角色，在随机仓库中探查古董藏品，与 AI 或真人博弈出价。

- **技术栈**：Phaser 3 + TypeScript + Vite + WebSocket
- **代码规模**：约 66 个 TS 文件，~27,000 行代码
- **构建方式**：使用 Vite 构建，ES Modules
- **模块系统**：ES Modules + 依赖注入

---

## 二、目录结构

```
d:\web\demo2-trae
├── index.html                  入口页面（3 个 <script> 标签）
├── proxy-server.js             CORS 代理（LLM API 跨域转发）
│
├── lib/
│   └── phaser.min.js           Phaser 3.90 游戏引擎
│
├── scripts/                    所有客户端 TS 代码
│   ├── game/
│   │   ├── main.ts             ★ 游戏入口（Phaser 场景 + 19 个 Mixin 组装）
│   │   ├── animations.ts       前端动效工具
│   │   ├── core/               基础层：常量、工具、设置、状态
│   │   ├── data/               数据层：藏品、角色、道具、技能、地图、事件
│   │   ├── ai/                 AI 层：出价、情报、记忆、反思、钱包、决策日志
│   │   ├── bidding/            竞价流程
│   │   ├── warehouse/          仓库渲染与揭示
│   │   ├── lobby/              大厅：导航、地图轮播、角色选择
│   │   ├── shop/               商店
│   │   ├── ui/                 UI 组件：弹窗、面板、历史
│   │   ├── bridge/             桥接层：商店桥接、结算、战绩
│   │   └── lan/                联机客户端逻辑
│   ├── llm/                    LLM 提供商与管理
│   ├── audio/                  音频系统
│   └── mobile/                 移动端适配
│
├── lan/                        联机服务端
│   ├── server/server.js        WebSocket 服务器
│   ├── client/lan-bridge.ts    客户端通信桥接
│   └── shared/protocol.ts      通信协议常量
│
├── assets/                     静态资源
│   ├── audio/                  音效与 BGM
│   └── images/                 图片（藏品缩略图、背景、角色、图标）
│
├── styles/                     CSS 样式
│   ├── game/                   游戏样式
│   └── lobby/                  大厅样式
│
├── android/                    Android WebView 打包
└── docs/                       项目文档
```

---

## 三、架构模式

### 3.1 ES Modules + 依赖注入

每个模块用 ES Module 导出，通过 import 导入：

```typescript
// utils.ts
export function clamp(val: number, min: number, max: number) { ... }
export function shuffle<T>(arr: T[]): T[] { ... }
```

**依赖关系**由 ES Module `import` 声明，Vite 自动解析依赖图。

### 3.2 Mixin 组装模式

游戏主场景 `WarehouseScene` 通过 `Object.assign` 将 19 个 Mixin 混入原型：

```typescript
// main.ts 末尾
Object.assign(WarehouseScene.prototype,
  WarehouseCoreMixin,       // 仓库核心
  WarehouseRevealMixin,     // 揭示逻辑
  WarehousePreviewMixin,    // 预览逻辑
  AiWalletMixin,            // AI 钱包
  AiIntelMixin,             // AI 情报
  AiMemoryMixin,            // AI 记忆
  AiReflectionMixin,        // AI 反思
  AiDecisionMixin,          // AI 决策日志
  BiddingMixin,             // 竞价系统
  OverlayMixin,             // 弹窗
  PanelsMixin,              // 面板
  HistoryMixin,             // 历史
  LobbyIndexMixin,          // 大厅
  CarouselMixin,            // 地图轮播
  CharacterSelectMixin,     // 角色选择
  LanIndexMixin,            // 联机
  RoundManagerMixin,        // 回合管理
  SkillItemManagerMixin,    // 技能道具管理
  SettlementManagerMixin    // 结算管理
);
```

**特点**：
- 所有 Mixin 共享 `this`（场景实例），可直接访问其他 Mixin 的属性和方法
- Mixin 之间有隐式依赖（如 IntelMixin 引用 WalletMixin 的数据）
- 初始化顺序重要：底层先初始化，上层后初始化

### 3.3 模块依赖关系

```
                    ┌─────────┐
                    │ main.ts │  入口，组装所有 Mixin
                    └────┬────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
     │  lobby  │   │   ui    │   │   lan   │  UI 层
     └────┬────┘   └────┬────┘   └────┬────┘
          │              │              │
     ┌────┴──────────────┴──────────────┴────┐
     │            bridge / bidding            │  桥接层
     └────┬──────────────┬──────────────┬────┘
          │              │              │
     ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
     │   ai    │   │   llm   │   │  shop   │  逻辑层
     └────┬────┘   └────┬────┘   └─────────┘
          │              │
     ┌────┴──────────────┴────┐
     │         core           │  核心层
     └────┬──────────────┬────┘
          │              │
     ┌────┴────┐   ┌────┴────┐
     │  data   │   │  audio  │  基础层
     └─────────┘   └─────────┘
```

**被依赖最多的模块**（核心基础设施）：

| 模块 | 被依赖次数 | 说明 |
|------|-----------|------|
| MobaoUtils | 14 | 工具函数（clamp, shuffle, delay 等） |
| MobaoSettings | 11 | 全局设置 |
| MobaoConstants | 8 | 常量定义 |
| LlmManager | 7 | LLM 调度 |
| MobaoAnimations | 6 | 动效工具 |

---

## 四、游戏状态流转

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│  LOBBY  │────▶│ WAREHOUSE │────▶│ BIDDING  │────▶│SETTLEMENT│
│ 大厅选角 │     │ 仓库探查   │     │ 多轮竞价  │     │  结算揭示  │
└─────────┘     └───────────┘     └────┬─────┘     └──────────┘
                                       │
                                       │ 下一轮
                                       ▼
                                  ┌──────────┐
                                  │ BIDDING  │ ← 循环 N 轮
                                  └──────────┘
```

- **LOBBY**：角色选择 → 地图选择 → 开始游戏
- **WAREHOUSE**：生成仓库网格，展示藏品（信息隐藏状态）
- **BIDDING**：每轮玩家可使用技能/道具 → 提交出价 → 揭示出价 → 判断是否直接拿下
- **SETTLEMENT**：逐一揭示藏品真实信息，计算盈亏，更新战绩

---

## 五、核心模块速览

### 5.1 core/ — 基础层

| 文件 | 全局变量 | 职责 |
|------|---------|------|
| `constants.ts` | `MobaoConstants` | 网格尺寸、品质配置、存储键名等常量 |
| `utils.ts` | `MobaoUtils` | clamp, shuffle, delay, formatBidRevealNumber 等工具函数 |
| `settings.ts` | `MobaoSettings` | 游戏设置加载/保存/归一化（localStorage 持久化） |
| `app-state.ts` | `MobaoAppState` | 应用全局状态（游戏统计、当前模式等） |

### 5.2 data/ — 数据层

| 文件 | 全局变量 | 职责 |
|------|---------|------|
| `artifacts.ts` | `ArtifactData` | 70+ 种藏品定义（2 大类 10 品类，品质/价格/尺寸） |
| `characters.ts` | `CharacterData` | 3 个角色定义（鉴定师、探子、觅踪者） |
| `character-system.ts` | `CharacterSystem` | 角色选择逻辑、被动效果计算、持久化 |
| `skills.ts` | `SkillSystem` | 3 个角色技能定义（SKILL_DEFS） |
| `items.ts` | `ItemSystem` | 11 种道具定义（ITEM_DEFS） |
| `public-events.ts` | `PublicEvents` | 公共事件动态生成 |
| `map-profiles.ts` | `MapProfiles` | 4 种地图预设（废弃仓库/珍宝密室/废品角落/书斋雅集） |

### 5.3 ai/ — AI 层

| 文件 | Mixin | 职责 |
|------|-------|------|
| `bidding.ts` | — | 规则 AI 出价引擎（AuctionAiEngine 类，3 种人格） |
| `wallet.ts` | `WalletMixin` | AI 钱包管理、出价归一化 |
| `intel.ts` | `IntelMixin` | AI 私有情报池、信号统计、高价值追踪 |
| `memory.ts` | `MemoryMixin` | 跨局记忆（对话历史 + 经验本，localStorage 持久化） |
| `reflection.ts` | `ReflectionMixin` | 局后反思（LLM 生成反思总结，更新经验本） |
| `decision.ts` | `DecisionMixin` | 决策日志与调试面板 |

### 5.4 llm/ — LLM 层

| 文件 | 全局变量 | 职责 |
|------|---------|------|
| `llm-manager.ts` | `LlmManager` | LLM 管理器（Provider 注册/切换/流式调用/日志） |
| `scene-llm.ts` | `MobaoSceneLlm` | 场景 LLM 桥接（prompt 构建/决策解析/工具调用） |
| `llm-ui-bridge.ts` | `LlmUiBridge` | LLM 设置 UI（5 家内置提供商 + 自定义） |
| `deepseek-provider.ts` | — | DeepSeek 提供商 |
| `openai-provider.ts` | — | OpenAI 提供商 |
| `qwen-provider.ts` | — | 通义千问提供商 |
| `glm-provider.ts` | — | 智谱 GLM 提供商 |
| `kimi-provider.ts` | — | Kimi 提供商 |
| `deepseek-llm.ts` | `DeepSeekLLM` | DeepSeek LLM 客户端（兼容 OpenAI API 格式） |

### 5.5 bridge/ — 桥接层

| 文件 | 全局变量 | 职责 |
|------|---------|------|
| `shop.ts` | `MobaoShopBridge` | 商店桥接（道具购买/每日限购/库存同步） |
| `settlement.ts` | `MobaoSettlementBridge` | 结算桥接（藏品揭示/特效/利润动画） |
| `battle-record.ts` | `MobaoBattleRecordBridge` | 战绩记录（最近 20 局/详情查看） |

### 5.6 lan/ — 联机层

| 文件 | 全局变量 | 职责 |
|------|---------|------|
| `server.js` | — | Node.js WebSocket 服务器（房间管理/消息路由/断线重连） |
| `lan-bridge.ts` | `LanBridge` | 客户端通信桥接（connect/send/on 事件系统） |
| `protocol.ts` | `MSG` | 通信协议常量（消息类型/房间状态/回合阶段） |

---

## 六、数据流

### 6.1 单机模式

```
玩家操作 → DOM 事件 → main.ts 方法调用 → 更新场景状态 → 渲染
                                              ↓
                                    AI Mixin 自动触发
                                    （出价/情报/记忆/反思）
```

### 6.2 联机模式

```
玩家操作 → DOM 事件 → main.ts 方法调用 → LanBridge.send() → WebSocket
                                                          ↓
                                                    server.js 路由
                                                          ↓
                                              broadcastToRoom() → 所有客户端
                                                          ↓
                                              LanBridge._handleMessage()
                                                          ↓
                                               _emit(event, data) → main.ts handler
```

---

## 七、开发指南

### 7.1 本地运行

使用 `npm run dev` 启动 Vite 开发服务器（端口 3000）。

### 7.2 联机测试

```bash
cd lan/server
npm install
node server.js
```

服务器默认监听 `ws://localhost:3000`。

### 7.3 LLM 配置

游戏内点击设置 → LLM 配置，填入 API Key 即可使用。支持 5 家内置提供商和自定义 OpenAI 兼容 API。

### 7.4 修改代码的注意事项

1. **加载顺序**：ES Module `import` 自动处理依赖，无需手动管理加载顺序
2. **全局变量命名**：新代码使用 ES Module 导入导出，避免 `window.XXX` 全局变量
3. **Mixin 规范**：新增 Mixin 需在 `main.ts` 末尾的 `Object.assign` 中注册
4. **this 上下文**：Mixin 中的 `this` 指向 WarehouseScene 实例，可直接访问其他 Mixin 的属性

### 7.5 分析工具

| 工具 | 命令 | 用途 |
|------|------|------|
| 注释覆盖率分析 | `node tools/analyze-comments.js` | 统计注释率、JSDoc 覆盖等 |
| 头注释提取 | `node tools/get-header.js --all` | 提取所有文件头注释到 `_headers.txt` |
| 头注释分析 | `node tools/analyze-headers.js` | 分析注释质量、依赖关系、一致性问题 |

---

## 八、已知架构问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 全局变量依赖 | 高 | 约 66 个文件通过 `window.XXX` 通信，依赖顺序靠 HTML 保证 |
| Mixin 隐式耦合 | 中 | Mixin 间通过 `this` 互相访问，无显式依赖声明 |

**迁移方向**：详见 [architecture.md](../issues/architecture.md) 和 [ts-migration.md](../archive/ts-migration.md)。
