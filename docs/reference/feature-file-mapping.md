# 游戏功能与文件关系

> 本文档从**功能视角**出发，分析每个游戏功能涉及哪些文件、文件之间的调用链路、
> 以及同一功能在单机/联机模式下的差异。

---

## 一、功能-文件矩阵

| 功能 | 核心文件 | 辅助文件 | 入口函数 |
|------|---------|----------|----------|
| 大厅导航 | `lobby/index.ts` | `lobby/carousel.ts`, `animations.ts` | `bindLobbyEvents()` |
| 地图选择 | `lobby/carousel.ts` | `data/map-profiles.ts` | `renderCarousel()` |
| 角色选择 | `lobby/character-select.ts` | `data/characters.ts`, `data/character-system.ts`, `data/skills.ts` | `initCharacterSelect()` |
| 商店 | `bridge/shop.ts`, `shop/index.ts` | `core/settings.ts` | `MobaoShopBridge.purchaseItem()` |
| 仓库生成 | `warehouse/index.ts` | `data/artifacts.ts`, `core/constants.ts` | `spawnRandomItems()` |
| 仓库揭示 | `warehouse/index.ts` | `animations.ts`, `audio/audio-ui.ts` | `revealOutlineBatch()` |
| 出价交互 | `bidding/index.ts` | `core/settings.ts`, `ui/panels.ts` | `openBidKeypad()` |
| AI 出价 | `ai/bidding.ts`, `ai/wallet.ts` | `ai/intel.ts` | `AuctionAiEngine.buildAIBids()` |
| AI 情报 | `ai/intel.ts` | `data/skills.ts`, `data/items.ts` | `initAiIntelSystems()` |
| AI 记忆 | `ai/memory.ts` | `core/constants.ts` | `loadAiMemoryFromStorage()` |
| AI 反思 | `ai/reflection.ts` | `ai/memory.ts`, `llm/scene-llm.ts` | `triggerAiReflection()` |
| LLM 决策 | `llm/scene-llm.ts` | `llm/llm-manager.ts`, `ai/intel.ts`, `ai/memory.ts` | `requestLlmDecision()` |
| LLM 设置 | `llm/llm-ui-bridge.ts` | `llm/*-provider.ts` (5个) | `LlmUiBridge.init()` |
| 结算 | `bridge/settlement.ts` | `animations.ts`, `audio/audio-ui.ts` | `enterSettlementPage()` |
| 战绩 | `bridge/battle-record.ts` | `core/app-state.ts` | `openBattleRecordPanel()` |
| 弹窗/设置 | `ui/overlay.ts` | `animations.ts` | `showInfoPopup()` |
| 信息面板 | `ui/panels.ts` | — | `addPrivateIntelEntry()` |
| 出价历史 | `ui/history.ts` | `core/settings.ts` | `recordRoundHistory()` |
| 联机房间 | `lan/index.ts` | `lan/client/lan-bridge.ts`, `lan/shared/protocol.ts` | `initLanLobby()` |
| 联机服务端 | `lan/server/server.js` | `lan/shared/protocol.ts` | `new GameServer()` |
| 音频 | `audio/audio-manager.ts`, `audio/audio-ui.ts` | — | `AudioManager.init()` |
| 移动端 | `mobile/mobile-handler.ts` | — | 自动初始化 |

---

## 二、核心功能调用链

### 2.1 单机游戏完整流程

```
用户点击"单机模式"
  │
  ▼
lobby/index.ts :: showLobbySubPage("lobbySoloSetup")
  │
  ▼
lobby/carousel.ts :: renderCarousel()          ← 地图轮播
  │  用户选择地图
  ▼
lobby/carousel.ts :: setSelectedProfileId(id)
  │  用户点击"开始对局"
  ▼
lobby/index.ts :: goToCharacterSelect()
  │
  ▼
lobby/character-select.ts :: showCharacterSelectPage()
  │  用户选择角色 + 携带道具
  ▼
lobby/character-select.ts :: confirmCharacterSelection()
  │
  ▼
lobby/index.ts :: startSoloGame()
  ├── applyMapProfile()                         ← 地图参数写入设置
  ├── exitLobby()                               ← 切换到游戏场景
  └── startNewRun()                             ← 开始新对局
        │
        ▼
warehouse/index.ts :: WarehouseCoreMixin
  ├── spawnRandomItems()                        ← 生成仓库藏品
  ├── setupWarehouseAuction()                   ← 初始化拍卖参数
  └── drawUnknownWarehouse()                    ← 绘制空白网格
        │
        ▼
bidding/index.ts :: BiddingMixin
  ├── startRound()                              ← 开始出价轮
  │     ├── kickoffAiRoundDecisions()           ← 触发 AI 决策
  │     │     ├── ai/bidding.ts :: buildAIBids()          ← 规则 AI 出价
  │     │     └── llm/scene-llm.ts :: requestLlmDecision() ← LLM AI 覆盖（可选）
  │     └── openBidKeypad()                     ← 玩家出价界面
  │
  ├── playerBid()                               ← 玩家提交出价
  ├── resolveRoundBids()                        ← 回合结算
  │     ├── buildRoundBids()                    ← 整合所有出价
  │     └── revealRoundBidsSequential()         ← 逐个揭示出价
  │
  └── 判定：直接拿下 or 进入下一轮
        │
        ▼  （N 轮后）
bridge/settlement.ts :: SettlementMixin
  ├── enterSettlementPage()                     ← 进入结算页
  ├── revealAllArtifactsForSettlement()         ← 逐个揭示藏品
  └── playSettlementFinalEffect()               ← 庆祝特效
        │
        ▼
ai/reflection.ts :: ReflectionMixin
  └── triggerAiReflection()                     ← AI 反思（可选）
        │
        ▼
bridge/battle-record.ts :: BattleRecordMixin
  └── saveBattleRecord()                        ← 保存战绩
```

---

### 2.2 联机游戏完整流程

```
用户点击"联机模式"
  │
  ▼
lan/index.ts :: initLanLobby()
  │
  ▼
lan/index.ts :: connectWithRetry()
  └── lan/client/lan-bridge.ts :: connect()     ← WebSocket 连接
        │
        ▼
lan/index.ts :: 创建/加入房间
  └── lan-bridge.ts :: send("room:create/join")
        │
        ▼
lan/server/server.js :: handleRoomMessage()     ← 服务端处理
  └── broadcastToRoom()                         ← 广播房间状态
        │
        ▼
lan/index.ts :: 角色选择（所有玩家）
  └── lan-bridge.ts :: send("lan:character-select")
        │
        ▼
server.js :: handleLanRelay()                   ← 中继角色选择
  └── broadcastToRoom("lan:character-selected")
        │
        ▼
lan/index.ts :: 房主点击"开始游戏"
  └── lan-bridge.ts :: send("game:init")
        │
        ▼
server.js :: handleGameMessage()                ← 广播游戏初始化
  └── 所有客户端收到 warehouse-sync
        │
        ▼
bidding/index.ts :: 出价流程（与单机相同，但出价提交走 WebSocket）
  ├── 玩家出价 → lan-bridge.ts :: send("round:bid")
  ├── 服务端收集所有出价 → broadcastToRoom("all-bids-in")
  └── 主机 resolveRoundBids() → broadcastToRoom("round:result")
        │
        ▼
bridge/settlement.ts :: 结算（与单机相同）
```

---

### 2.3 AI 决策调用链

```
bidding/index.ts :: kickoffAiRoundDecisions()
  │
  ├── 1. 规则 AI 出价
  │     └── ai/bidding.ts :: AuctionAiEngine.buildAIBids(context)
  │           │
  │           ├── ai/intel.ts :: getAiIntelSummary()     ← 获取情报摘要
  │           │     └── 读取 aiPrivateIntel[playerId]
  │           │
  │           ├── ai/wallet.ts :: getAiWallet()           ← 获取钱包余额
  │           │     └── normalizeAiBidValue()             ← 出价归一化
  │           │
  │           └── computeSingleDecision()                 ← 8步出价算法
  │
  ├── 2. LLM AI 覆盖（如果启用）
  │     └── llm/scene-llm.ts :: requestLlmDecision(playerId, context)
  │           │
  │           ├── 构建 prompt
  │           │     ├── ai/intel.ts :: buildAiPrivateRevealContext()  ← 情报上下文
  │           │     ├── ai/memory.ts :: getAiConversationMessages()   ← 记忆上下文
  │           │     └── LLM_DECISION_SYSTEM_PROMPT                    ← 系统指令
  │           │
  │           ├── llm/llm-manager.ts :: chatCompletion()  ← 调用 LLM
  │           │     └── 选择 Provider（DeepSeek/OpenAI/Qwen/GLM/Kimi）
  │           │
  │           ├── 解析响应 JSON { bid, skill, item, thought }
  │           │
  │           ├── 若使用了工具（skill/item）
  │           │     ├── 执行工具 → 更新情报/道具
  │           │     └── follow-up prompt → 追问 LLM 更新出价
  │           │
  │           └── 纠错机制：JSON 解析失败时尝试修复
  │
  └── 3. AI 情报动作
        └── ai/bidding.ts :: planIntelAction(context)
              └── 评分选择最优动作（技能/道具/不操作）
```

---

### 2.4 商店系统调用链

```
用户点击"商店"按钮
  │
  ▼
shop/index.ts :: MobaoShopPage.show()
  ├── renderShopGrid()                          ← 渲染商品列表
  │     └── bridge/shop.ts :: SHOP_ITEMS        ← 读取商品定义
  │     └── bridge/shop.ts :: getRemainingDaily() ← 每日限购
  │
  ├── renderInventoryTab()                      ← 渲染背包
  │     └── bridge/shop.ts :: getFullInventory()
  │
  └── renderLimitedOffers()                     ← 渲染限时特惠
        └── bridge/shop.ts :: getLimitedOffers()

用户点击"购买"
  │
  ▼
shop/index.ts :: handlePurchase(itemId)
  └── bridge/shop.ts :: purchaseItem(itemId)
        ├── 扣减资金（savePlayerMoney）
        ├── 增加库存
        ├── 记录每日购买次数
        └── 持久化到 localStorage

游戏中使用道具
  │
  ▼
main.ts :: consumeItem(itemId)
  └── bridge/shop.ts :: consumeItem(itemId)
        └── 扣减库存 → 持久化
```

---

## 三、单机 vs 联机功能差异

### 3.1 功能对比表

| 功能 | 单机 | 联机 | 差异说明 |
|------|------|------|----------|
| 地图选择 | 任意玩家选择 | 仅房主可选 | 联机中 `openLanMapSelect` 检查 `lanIsHost` |
| 角色选择 | 本地直接生效 | 选择后广播同步 | 联机发送 `lan:character-select`，远端更新 |
| 携带道具 | 本地直接生效 | 选择后发送同步 | 联机发送 `lan:carry-items` |
| 出价提交 | 本地直接参与结算 | 提交到服务端 | 联机通过 `lanBridge.submitBid()` |
| 出价结算 | 本地 `resolveRoundBids()` | 主机端结算 | 主机收集所有出价后广播结果 |
| AI 出价 | 本地 `buildAIBids()` | 主机端执行 | 非主机玩家不运行 AI 逻辑 |
| LLM 设置 | 可自由配置 | 联机中禁用 | `openSettingsOverlay` 中 LLM 组 disabled |
| AI 记忆 | `AI_MEMORY_STORAGE_KEY` | `_lan` 后缀 | 联机使用独立存储键 |
| 商店 | 本地购买 | 本地购买（不同步） | 商店数据不跨客户端同步 |
| 结算 | 本地渲染 | 本地渲染（数据来自主机） | 结算动画各客户端独立播放 |
| 暂停/恢复 | 本地状态 | 广播同步 | `pause:state` 消息同步暂停状态 |
| 重开 | 直接重开 | 投票机制 | `game:restart-vote/go/cancelled` |
| 断线重连 | 不适用 | 30秒 grace period | 房主迁移 + 重连恢复 |

### 3.2 联机独有文件

| 文件 | 职责 |
|------|------|
| `lan/server/server.js` | WebSocket 服务器（仅 Node.js 环境） |
| `lan/client/lan-bridge.ts` | 客户端通信桥接 |
| `lan/shared/protocol.ts` | 消息类型常量 |
| `game/lan/index.ts` | 联机房间 UI + 同步逻辑 |

### 3.3 联机扩展点

以下文件通过 `if (this.isLanMode)` 条件分支支持联机：

| 文件 | 联机分支 | 说明 |
|------|---------|------|
| `lobby/index.ts` | `enterLanRoom()` | 联机房间入口 |
| `bidding/index.ts` | `lanBridge.submitBid()` | 出价走 WebSocket |
| `bidding/index.ts` | 主机端 `resolveRoundBids()` | 主机统一结算 |
| `ui/panels.ts` | `lanBridge.send("lan:public-info")` | 公共信息广播 |
| `ai/memory.ts` | `AI_MEMORY_STORAGE_KEY + "_lan"` | 联机独立记忆存储 |
| `ai/wallet.ts` | `lanHostWallets` 回退 | 联机钱包从主机同步 |

---

## 四、数据持久化关系

### 4.1 localStorage 键值表

| 存储键 | 写入文件 | 读取文件 | 数据内容 |
|--------|---------|---------|----------|
| `mobao_player_money_v1` | `bridge/shop.ts`, `core/settings.ts` | `core/settings.ts`, `lobby/index.ts` | 玩家资金 |
| `mobao_shop_inventory_v1` | `bridge/shop.ts` | `bridge/shop.ts`, `shop/index.ts` | 道具库存 |
| `mobao_shop_refresh_date_v1` | `bridge/shop.ts` | `bridge/shop.ts` | 每日购买记录 |
| `mobao_shop_limited_offer_v1` | `bridge/shop.ts` | `bridge/shop.ts` | 限时特惠数据 |
| `mobao_game_settings_v1` | `core/settings.ts` | `core/settings.ts`, `ui/overlay.ts` | 游戏设置 |
| `mobao_battle_record_v1` | `bridge/battle-record.ts` | `bridge/battle-record.ts` | 战绩记录（最多20条） |
| `mobao_ai_wallets_v1` | `ai/wallet.ts` | `ai/wallet.ts` | AI 钱包数据 |
| `mobao_ai_wallets_v1_lan` | `ai/wallet.ts` | `ai/wallet.ts` | 联机 AI 钱包 |
| `mobao_ai_memory_v1` | `ai/memory.ts` | `ai/memory.ts` | AI 跨局记忆 |
| `mobao_ai_memory_v1_lan` | `ai/memory.ts` | `ai/memory.ts` | 联机 AI 记忆 |
| `mobao_ai_llm_switch_v1` | `llm/scene-llm.ts` | `llm/scene-llm.ts` | AI LLM 开关 |
| `mobao_carry_items_v1` | `lobby/character-select.ts` | `lobby/character-select.ts` | 携带道具 |
| `mobao_selected_map_v1` | `lobby/carousel.ts` | `lobby/carousel.ts` | 选中的地图 |
| `mobao_selected_character_v1` | `data/character-system.ts` | `data/character-system.ts` | 选中的角色 |

### 4.2 数据流向图

```
┌──────────────┐     购买/消耗     ┌──────────────┐
│  shop/       │ ───────────────▶ │  localStorage │
│  index.ts    │ ◀─────────────── │              │
└──────────────┘     读取库存     └──────┬───────┘
       ▲                                  │
       │ 调用                             │ 读取
       ▼                                  ▼
┌──────────────┐                    ┌──────────────┐
│ bridge/      │ ◀──────────────── │ core/        │
│ shop.ts      │    读取资金/设置   │ settings.ts  │
└──────────────┘                    └──────────────┘

┌──────────────┐     保存记忆     ┌──────────────┐
│ ai/          │ ───────────────▶ │  localStorage │
│ memory.ts    │ ◀─────────────── │              │
└──────────────┘     加载记忆     └──────────────┘
       ▲
       │ 反思更新
       ▼
┌──────────────┐
│ ai/          │
│ reflection.ts│
└──────────────┘

┌──────────────┐     保存战绩     ┌──────────────┐
│ bridge/      │ ───────────────▶ │  localStorage │
│ battle-      │ ◀─────────────── │              │
│ record.ts    │     读取战绩     └──────────────┘
└──────────────┘
```

---

## 五、跨文件功能耦合点

### 5.1 高耦合功能（3+ 文件协作）

| 功能 | 涉及文件 | 耦合方式 |
|------|---------|----------|
| 出价流程 | `bidding/index.ts`, `ai/bidding.ts`, `ai/wallet.ts`, `ai/intel.ts`, `llm/scene-llm.ts` | Mixin 共享 `this` |
| AI 决策 | `ai/bidding.ts`, `ai/intel.ts`, `ai/memory.ts`, `llm/scene-llm.ts`, `llm/llm-manager.ts` | Mixin 共享 `this` + 全局变量 |
| 角色选择 | `lobby/character-select.ts`, `data/characters.ts`, `data/character-system.ts`, `data/skills.ts`, `bridge/shop.ts` | 全局变量调用 |
| 联机出价 | `bidding/index.ts`, `lan/index.ts`, `lan/client/lan-bridge.ts`, `lan/server/server.js` | 事件系统 + WebSocket |
| 结算 | `bridge/settlement.ts`, `warehouse/index.ts`, `ai/reflection.ts`, `bridge/battle-record.ts` | Mixin 共享 `this` |

### 5.2 main.ts 的胶水角色

`main.ts` 是所有功能的交汇点，它：

1. **解构所有全局变量**（~60 个 import）
2. **创建桥接器实例**（LLM_BRIDGE, BATTLE_RECORD_BRIDGE, SETTLEMENT_BRIDGE）
3. **组装 19 个 Mixin** 到 WarehouseScene.prototype
4. **定义 `create()` 初始化流程**（调用各 Mixin 的 init 方法）
5. **处理跨 Mixin 的交互逻辑**（如出价后更新面板、结算后触发反思）

这意味着 `main.ts` 承担了本应由依赖注入或事件总线完成的协调工作。

### 5.3 隐式依赖（无显式声明）

| 调用方 | 被调用方 | 依赖方式 |
|--------|---------|----------|
| `bidding/index.ts` | `ai/wallet.ts` | `this.getAiWallet()` — Mixin 共享 this |
| `bidding/index.ts` | `ai/intel.ts` | `this.getAiIntelSummary()` — Mixin 共享 this |
| `bidding/index.ts` | `llm/scene-llm.ts` | `LLM_BRIDGE.requestLlmDecision()` — 全局变量 |
| `ai/reflection.ts` | `ai/memory.ts` | `this.aiCrossGameMemory` — Mixin 共享 this |
| `ui/panels.ts` | `lan/index.ts` | `this.isLanMode` + `this.lanBridge` — Mixin 共享 this |
| `lobby/character-select.ts` | `bridge/shop.ts` | `MobaoShopBridge.getFullInventory()` — 全局变量 |
| `warehouse/index.ts` | `data/artifacts.ts` | `ArtifactData.ARTIFACT_LIBRARY` — 全局变量 |

---

## 六、功能缺失与待完善

| 功能 | 状态 | 说明 |
|------|------|------|
| 联机道具同步 | 未实现 | 商店购买/消耗不同步到其他客户端 |
| 联机地图选择 | 部分实现 | UI 有占位，但选择后同步逻辑未完善 |
| 联机模式选择 | 未实现 | 当前只有"经典模式"，无选择 UI |
| 联机房间设置 | 未实现 | `openLanRoomManage` 弹窗内容待填充 |
| 联机好友邀请 | 未实现 | 玩家列表的加号仅支持加 AI |
| 联机断线重连 | 部分实现 | 服务端有 grace period，客户端重连 UI 未完善 |
| 图鉴系统 | 未实现 | 大厅有按钮但功能未开发 |
| 公共事件 | 数据已定义 | `public-events.ts` 有数据但未集成到游戏流程 |
