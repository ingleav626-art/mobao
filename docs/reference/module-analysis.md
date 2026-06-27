# 模块划分分析

> 基于代码实际结构、全局变量依赖和 Mixin 组装关系，将游戏划分为 7 大模块。

---

## 一、模块总览

| 模块 | 文件数 | 平均依赖 | 核心职责 |
|------|--------|----------|----------|
| 基础设施层 | 8 | 0.6 | 常量、工具、设置、音频、动效 |
| 数据层 | 7 | 0.3 | 藏品、角色、技能、道具、地图定义 |
| AI 决策层 | 10 | 1.8 | 规则 AI 出价 + LLM AI 覆盖 |
| LLM 调度层 | 14 | 1.4 | Provider 抽象、prompt 构建、决策解析 |
| 游戏逻辑层 | 6 | 2.8 | 仓库、出价、商店、结算、战绩 |
| UI 层 | 6 | 4.7 | 大厅、角色选择、弹窗、面板、历史 |
| 联机层 | 4 | 3.3 | WebSocket 通信、房间管理、协议 |

---

## 二、模块依赖关系图

```
┌──────────────────────────────────────────────────┐
│                   UI 层 (6 文件)                  │
│  lobby/index · carousel · character-select        │
│  ui/overlay · panels · history                    │
└──────────┬───────────────────────┬───────────────┘
           │                       │
┌──────────▼──────────┐  ┌────────▼────────────────┐
│  游戏逻辑层 (6 文件) │  │     联机层 (4 文件)      │
│  warehouse · bidding │  │  server · bridge · proto │
│  bridge/* · shop     │  │  game/lan               │
└──────────┬──────────┘  └────────┬────────────────┘
           │                       │
     ┌─────┴──────┐         ┌─────┴──────┐
     │            │         │            │
┌────▼────┐ ┌────▼─────┐   │            │
│ AI 层   │ │ LLM 层   │   │            │
│(10 文件)│ │(14 文件) │◄──┘            │
└────┬────┘ └────┬─────┘                │
     │            │                      │
     └─────┬──────┘                      │
           │                             │
┌──────────▼─────────────────────────────▼──────────┐
│              数据层 (7 文件)                        │
│  artifacts · characters · skills · items · maps    │
└──────────┬────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────┐
│           基础设施层 (8 文件)                       │
│  constants · utils · settings · app-state          │
│  animations · audio · mobile                       │
└────────────────────────────────────────────────────┘
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

## 三、各模块详解

### 3.1 基础设施层 (Infrastructure)

零业务逻辑，纯工具/配置，被所有其他模块依赖。

| 文件 | 全局变量 | 职责 | 设计模式 |
|------|---------|------|----------|
| `core/constants.ts` | `MobaoConstants` | 网格尺寸、品质配置、存储键名、游戏参数 | IIFE |
| `core/utils.ts` | `MobaoUtils` | clamp, shuffle, delay, formatBidRevealNumber 等纯函数 | IIFE |
| `core/settings.ts` | `MobaoSettings` | 设置加载/保存/归一化（localStorage 持久化） | IIFE |
| `core/app-state.ts` | `MobaoAppState` | 应用全局状态（游戏统计、当前模式） | IIFE |
| `animations.ts` | `MobaoAnimations` | 前端动效（pulse/scrollToNumber/staggerEnter/animateOverlayOpen） | IIFE |
| `audio/audio-manager.ts` | `AudioManager` | 音频管理（BGM/音效预加载与播放控制） | 类 |
| `audio/audio-ui.ts` | `AudioUI` | 音效触发接口（playReveal/startSearch/stopCountdown 等） | 类 |
| `mobile/mobile-handler.ts` | — | 移动端键盘适配（Android WebView） | IIFE |

**关键接口**：

```javascript
// MobaoUtils — 最常用的工具函数
MobaoUtils.clamp(val, min, max)           // 数值裁剪
MobaoUtils.shuffle(arr)                   // Fisher-Yates 洗牌
MobaoUtils.delay(ms)                      // Promise 延时
MobaoUtils.roundToStep(val, step)         // 对齐到步长
MobaoUtils.formatBidRevealNumber(num)     // 出价格式化（如 12.5万）

// MobaoSettings — 设置系统
MobaoSettings.GAME_SETTINGS              // 当前游戏设置对象
MobaoSettings.loadGameSettings()          // 从 localStorage 加载
MobaoSettings.saveGameSettings(obj)       // 保存到 localStorage
MobaoSettings.normalizeGameSettings(obj)  // 归一化（确保所有字段合法）

// MobaoConstants — 关键常量
MobaoConstants.GRID_COLS = 12             // 仓库网格列数
MobaoConstants.GRID_ROWS = 25            // 仓库网格行数
MobaoConstants.CELL_SIZE = 64            // 格子像素尺寸
MobaoConstants.DEFAULT_START_MONEY        // 初始金钱
```

---

### 3.2 数据层 (Data)

纯数据定义 + 轻量管理器，几乎不依赖其他模块。是游戏内容的"数据库"。

| 文件 | 全局变量 | 职责 | 设计模式 |
|------|---------|------|----------|
| `data/artifacts.ts` | `ArtifactData` | 70+ 种藏品（2 大类 10 品类，品质/价格/尺寸） | IIFE |
| `data/characters.ts` | `CharacterData` | 3 个角色（鉴定师/探子/觅踪者） | IIFE |
| `data/character-system.ts` | `CharacterSystem` | 角色选择逻辑、被动效果计算、持久化 | IIFE |
| `data/skills.ts` | `SkillSystem` | 3 个技能定义 + SkillManager | IIFE |
| `data/items.ts` | `ItemSystem` | 11 种道具定义 + ItemManager | IIFE |
| `data/map-profiles.ts` | `MobaoMapProfiles` | 4 种地图预设 | IIFE |
| `data/public-events.ts` | `PublicEvents` | 公共事件动态生成 | IIFE |

**数据规模**：

```
藏品 (ArtifactData)
├── 大类: 古董 (antique), 工艺品 (craft)
├── 品类: 瓷器/玉器/铜器/书画/木器/金石/珠宝/织绣/杂项/现代
├── 品质: 赝品/普品/良品/精品/珍品/绝品 (6 级)
└── 总计: 70+ 种藏品定义

角色 (CharacterData)
├── 鉴定师 — 被动: 品质鉴定率+15%
├── 探子   — 被动: 轮廓揭示+2
└── 觅踪者 — 被动: 高价值追踪

技能 (SkillSystem)
├── outline-scan  — 轮廓扫描（揭示 N 个轮廓）
├── quality-probe — 品质探测（揭示 N 个品质）
└── value-sense   — 价值感知（标记高价值藏品）

道具 (ItemSystem)
├── 基础揭示: 探照灯/蜡烛/鉴定针/放大镜
├── 高级揭示: 火把（每日限3）
└── 品类专用: 瓷器图谱/玉器鉴书/铜器拓片/书画残卷/木器图录/金石拓本

地图 (MapProfiles)
├── 废弃仓库 — 标准，占用率 38%~88%
├── 珍宝密室 — 高价值，占用率 50%~90%
├── 废品角落 — 低价值，占用率 30%~70%
└── 书斋雅集 — 书画类，占用率 45%~85%
```

---

### 3.3 AI 决策层 (AI)

双引擎架构：规则 AI（bidding.ts）负责基础出价，LLM AI（scene-llm.ts）可覆盖出价决策。

| 文件 | Mixin | 职责 | 设计模式 |
|------|-------|------|----------|
| `ai/bidding.ts` | — | 规则 AI 出价引擎（AuctionAiEngine 类） | 类 |
| `ai/wallet.ts` | `WalletMixin` | AI 钱包（出价归一化/资金管理） | Mixin |
| `ai/intel.ts` | `IntelMixin` | AI 私有情报池（信号统计/高价值追踪） | Mixin |
| `ai/memory.ts` | `MemoryMixin` | 跨局记忆（对话历史+经验本） | Mixin |
| `ai/reflection.ts` | `ReflectionMixin` | 局后反思（LLM 生成反思总结） | Mixin |
| `ai/decision.ts` | `DecisionMixin` | 决策日志与调试面板 | Mixin |

**出价算法流程**（AuctionAiEngine.computeSingleDecision）：

```
1. 市场参考价 marketRef ← 当前出价 + 上轮出价的加权均值
2. 信心 confidence ← 线索率 + 质量率 + 不确定性 + 轮次进度 + 工具效果
3. 感知价值 perceivedValue ← 锚点出价 × 系数 + 趋势 + 压力 + 噪声
4. 心理预期 psychExpectedBid ← 向目标预期逐步适应
5. 过热评估 ← 当前出价超过心理预期时触发回撤
6. 价格上限 hardCap ← min(感知上限, 锚点上限, 心理上限, 市场上限)
7. 最终出价 ← max(当前出价, 感知价值 × 调整) 对齐到步长
8. 群体多样性调整 ← 确保 AI 出价不扎堆
```

**人格系统**：

| 人格 | 代号 | 激进 | 纪律 | 跟风 | 特点 |
|------|------|------|------|------|------|
| 稳算师 | p1 | 0.58 | 0.86 | 0.32 | 保守理性，锚点低 |
| 猛冲客 | p3 | 0.85 | 0.45 | 0.72 | 激进跟风，锚点高 |
| 机变派 | p4 | 0.65 | 0.78 | 0.50 | 灵活适应，中庸 |

**双引擎协作**：

```
                    ┌─────────────────┐
                    │  kickoffAiRound │
                    │   Decisions()   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ buildAIBids()   │ ← 规则 AI 计算所有 AI 出价
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
              No    │ LLM 开关启用？  │
           ┌────────┤                 ├────────┐ Yes
           │        └─────────────────┘        │
           │                                     │
    使用规则 AI 出价                    ┌────────▼────────┐
                                      │ requestLlm      │
                                      │ Decision()      │ ← LLM 覆盖出价
                                      └────────┬────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │ LLM 返回有效出价？   │
                                    └──┬──────────────┬───┘
                                  Yes  │              │ No
                                       │              │
                                 覆盖规则 AI 出价    保留规则 AI 出价
```

---

### 3.4 LLM 调度层 (LLM)

Provider 抽象模式，5 家提供商统一接口。scene-llm.ts 是 AI 层与 LLM 层的桥梁。

| 文件 | 全局变量 | 职责 | 设计模式 |
|------|---------|------|----------|
| `llm/llm-manager.ts` | `LlmManager` | Provider 注册/切换/流式调用/日志 | 单例 |
| `llm/scene-llm.ts` | `MobaoSceneLlm` | 场景桥接（prompt 构建/决策解析/工具调用） | 工厂函数 |
| `llm/llm-ui-bridge.ts` | `LlmUiBridge` | LLM 设置 UI | IIFE |
| `llm/deepseek-llm.ts` | `DeepSeekLLM` | DeepSeek 客户端（旧版） | IIFE |
| `llm/deepseek-provider.ts` | `DeepSeekProvider` | DeepSeek Provider | IIFE |
| `llm/openai-provider.ts` | `OpenAIProvider` | OpenAI Provider | IIFE |
| `llm/qwen-provider.ts` | `QwenProvider` | 通义千问 Provider | IIFE |
| `llm/glm-provider.ts` | `GlmProvider` | 智谱 GLM Provider | IIFE |
| `llm/kimi-provider.ts` | `KimiProvider` | Kimi Provider | IIFE |

**Provider 接口**：

```javascript
// 所有 Provider 实现统一接口
{
  name: "DeepSeek",
  async chatCompletion({ model, messages, temperature, max_tokens, stream }) {
    // 返回 { content, usage } 或流式回调
  }
}
```

**LLM 决策流程**（scene-llm.ts）：

```
1. 构建 prompt（系统指令 + 游戏状态 + 情报 + 历史记忆）
2. 调用 LlmManager.chatCompletion()
3. 解析响应 JSON { bid, skill, item, thought }
4. 若使用了工具（skill/item），执行工具并构建 follow-up prompt
5. 追问 LLM 根据工具结果更新出价
6. 纠错机制：JSON 解析失败时尝试提取/修复
7. 遥测记录：prompt/response/纠错过程/工具结果
```

---

### 3.5 游戏逻辑层 (Game Logic)

核心玩法实现。warehouse 和 bidding 是最大的两个 Mixin 集合。

| 文件 | Mixin/全局变量 | 职责 | 设计模式 |
|------|---------------|------|----------|
| `warehouse/index.ts` | `MobaoWarehouse` | 仓库核心（3 个 Mixin） | Mixin |
| `bidding/index.ts` | `MobaoBidding` | 出价流程（1 个 Mixin） | Mixin |
| `bridge/shop.ts` | `MobaoShopBridge` | 商店系统（购买/消耗/限购/特惠） | IIFE |
| `bridge/settlement.ts` | `MobaoSettlementBridge` | 结算系统（揭示动画/庆祝特效） | 工厂函数 |
| `bridge/battle-record.ts` | `MobaoBattleRecordBridge` | 战绩记录 | 工厂函数 |
| `shop/index.ts` | `MobaoShopPage` | 商店页面 UI | IIFE |

**仓库系统**（MobaoWarehouse — 3 个 Mixin）：

```
WarehouseCoreMixin — 仓库核心
├── drawUnknownWarehouse()     绘制空白网格
├── spawnRandomItems()         随机生成藏品
├── setupWarehouseAuction()    初始化拍卖参数
├── renderItem(item)           渲染单个藏品
└── onArtifactClicked()        藏品点击处理

WarehouseRevealMixin — 揭示系统
├── revealOutlineBatch()       批量轮廓揭示
├── revealQualityBatch()       批量品质揭示
├── revealArtifactFully()      完全揭示单件
├── playFullRevealEffect()     揭示特效（外环扩散+内爆+边框淡入）
└── pickRevealTargets()        揭示目标选择（品类筛选/排序策略）

WarehousePreviewMixin — 候选预览
├── renderPreviewCandidates()  渲染候选列表
├── positionPreview()          预览弹窗定位（自动避免溢出）
└── setupPreviewTouchScroll()  触摸滚动
```

**出价流程**（MobaoBidding）：

```
单机流程:
  startRound → 玩家输入出价 → playerBid → areAllPlayersBidReady →
  resolveRoundBids → buildRoundBids → revealRoundBidsSequential →
  排名判定 → finishAuction 或进入下一轮

联机流程:
  玩家出价 → lanBridge.submitBid → 服务端广播 → 主机 resolveRoundBids

直接拿下判定:
  最高出价 ≥ 第二高出价 × (1 + directTakeRatio) → 提前结束
```

**bridge 层的解耦设计**：

```
                    ┌─────────────────┐
                    │    main.ts      │
                    │  (依赖注入调用)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼─────┐ ┌─────▼──────┐ ┌─────▼──────────┐
    │ createShop    │ │ createSett- │ │ createBattle   │
    │ Bridge()      │ │ lementBridge│ │ RecordBridge() │
    │ (IIFE 单例)   │ │ (工厂函数)  │ │ (工厂函数)     │
    └───────────────┘ └────────────┘ └────────────────┘
```

shop.ts 用 IIFE 直接挂载全局变量，settlement.ts 和 battle-record.ts 用工厂函数+依赖注入，后者更干净。

---

### 3.6 UI 层 (UI)

全部是 Mixin，混入 WarehouseScene 原型。是用户交互的入口，依赖最多。

| 文件 | Mixin | 职责 | 设计模式 |
|------|-------|------|----------|
| `lobby/index.ts` | `LobbyIndexMixin` | 大厅导航/页面切换/游戏启动 | Mixin |
| `lobby/carousel.ts` | `CarouselMixin` | 地图轮播选择 | Mixin |
| `lobby/character-select.ts` | `CharacterSelectMixin` | 角色选择（Live2D 立绘） | Mixin |
| `ui/overlay.ts` | `OverlayMixin` | 弹窗/设置/确认对话框 | Mixin |
| `ui/panels.ts` | `PanelsMixin` | 游戏面板（出价/信息/倒计时） | Mixin |
| `ui/history.ts` | `HistoryMixin` | 出价历史记录 | Mixin |

**大厅页面结构**：

```
lobbyMain           → 大厅主页（单机/联机入口）
lobbySoloSetup      → 单机设置（地图轮播 + 开始游戏）
lobbyOnlinePage     → 联机页面（连接/房间）
lobbyCharacterSelect → 角色选择页（Live2D 立绘 + 技能展示）
```

**Live2D 无缝循环机制**（character-select.ts）：

```
双视频交替播放：
  videoA 播放 → 预热 videoB → videoB 就绪 →
  在 requestVideoFrameCallback 回调中切换 → videoB 播放 → 预热 videoA → 循环

桌面端: 预热 2s, 切换延迟 0.033s (1帧@30fps)
移动端: 预热 5s, 切换延迟 4s (移动端解码慢)
```

---

### 3.7 联机层 (LAN)

独立于 Phaser 的通信层。server.js 是唯一运行在 Node.js 上的文件。

| 文件 | 全局变量 | 职责 | 设计模式 |
|------|---------|------|----------|
| `lan/server/server.js` | — | WebSocket 服务器 | 类 |
| `lan/client/lan-bridge.ts` | `LanBridge` | 客户端通信桥接 | 类 |
| `lan/shared/protocol.ts` | `MSG` | 协议常量 | IIFE |
| `game/lan/index.ts` | `MobaoLan` | 联机房间 UI + 同步逻辑 | Mixin |

**消息路由**（server.js）：

```
客户端消息 → handleMessage(ws, msg)
                │
    ┌───────────┼───────────┐
    │           │           │
room:xxx    game:xxx    lan:xxx
    │           │           │
房间管理     游戏逻辑     联机中继
(创建/加入   (出价/技能   (角色选择/
/离开/配置)  /结算)       地图/数据同步)
```

**客户端事件系统**（lan-bridge.ts）：

```javascript
// 注册事件
lanBridge.on("room:joined", (data) => { ... });
lanBridge.on("lan:character-select", (data) => { ... });

// 发送消息
lanBridge.send("room:create", { playerName: "Alice" });
lanBridge.send("lan:character-select", { characterId: "char-appraiser" });

// 内部流程
ws.onmessage → _handleMessage(raw) → 解析 type → _emit(type, data) → 业务 handler
```

**房间生命周期**：

```
创建 → WAITING (等待玩家加入) → PLAYING (游戏中) → SETTLED (结算) → 销毁
                                    │
                              断线重连 grace period (30s)
                                    │
                              房主迁移 (host migration)
```

---

## 四、关键发现

| 发现 | 说明 |
|------|------|
| main.ts 是超级胶水 | 17 个依赖，组装 19 个 Mixin，是整个项目的连接点 |
| AI 层有双引擎 | 规则 AI（bidding.ts）+ LLM AI（scene-llm.ts），通过 llmEnabled 开关切换 |
| bridge 层是解耦尝试 | shop/settlement/battle-record 用工厂函数+依赖注入，比 Mixin 更干净 |
| 联机层最独立 | server.js 完全不依赖客户端代码，只依赖 protocol.ts |
| 数据层最纯粹 | 平均 0.3 个依赖，几乎无外部引用 |
| Mixin 隐式耦合 | 19 个 Mixin 通过 `this` 互相访问，无显式依赖声明 |
| 全局变量通信 | 约 66 个文件通过 `window.XXX` 通信，依赖顺序靠 HTML 保证 |
