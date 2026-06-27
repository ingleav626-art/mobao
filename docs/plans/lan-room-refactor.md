# 联机房间重构计划

## 〇、UI 复盘（2025-05-31）

### Phase 1: UI 骨架 — ✅ 已完成

| 项目 | 状态 | 说明 |
|------|------|------|
| 三栏布局 | ✅ 完成 | `.lan-room-left` / `.lan-room-center` / `.lan-room-right` |
| 顶部导航栏 | ✅ 完成 | 返回 / 联机房间+房间号(居中) / 房间管理+商店+金钱 |
| 角色立绘区 | ✅ 完成 | 默认➕ / 已选Live2D无缝循环 / 溢出可见 |
| 模式+地图卡片 | ✅ 完成 | 经典模式占位 / 地图卡片(仅房主可点) |
| 道具选择区域 | ✅ 完成 | 复用单机 `carry-items-row` + 自动补充开关 |
| 开始游戏按钮 | ✅ 完成 | 道具选择下方，与立绘区底部齐平 |
| 2×2 玩家网格 | ✅ 完成 | 主机/客机/AI/空位四种状态，踢出/加AI/LLM勾选 |
| 角色选择弹窗 | ✅ 完成 | 两列布局，头像+技能介绍，选择后广播 |
| 房间管理弹窗 | 🔲 占位 | 弹窗框架已有，内容为"开发中"占位 |
| 地图选择弹窗 | 🔲 占位 | 弹窗框架已有，内容为"开发中"占位 |
| 返回按钮保护 | ✅ 完成 | 确认弹窗 `showGameConfirm` |
| 旧代码清理 | ✅ 完成 | 移除 `slotsContainer` / `renderLegacySlot` / 旧CSS |

### Phase 2: 角色系统 — 🔄 部分完成

| 项目 | 状态 | 说明 |
|------|------|------|
| 角色选择弹窗 UI | ✅ 完成 | 两列卡片，头像+技能+被动 |
| 角色立绘显示 | ✅ 完成 | Live2D无缝循环（学习单机逻辑重写） |
| 角色选择广播 | ⚠️ 半完成 | 客户端发送 `lan:character-select`，但服务端未处理 |
| 角色选择接收 | ❌ 未做 | 缺少 `lan:character-selected` 监听 |
| 角色应用到游戏 | ❌ 未做 | `startLanRun()` 未调用 `applyCharacterToPlayer()` |
| 玩家列表显示角色头像 | ❌ 未做 | `lanSlotConfig` 缺少 `characterId` 字段 |

### Phase 3~8 — ❌ 未开始

所有数据同步、地图系统、道具同步、商店同步、房间管理、游戏启动扩展均未实现。

---

## 一、UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│  [←返回]  联机房间  [房间管理]  [商店]  💰 12,000          │
├──────────────┬──────────────────────┬─────────────────────────┤
│              │                      │                         │
│   角色立绘     │   [经典模式] [地图图]  │   ┌────┐  ┌────┐        │
│   区域        │                      │   │ 👑 │  │ ➕ │       │
│              │   ─────────────────  │   │主机│  │空位│         │
│   (默认➕)    │   道具选择区域        │   └────┘  └────┘         │
│   点击选角色  │   (复用单机)          │   ┌────┐  ┌────┐         │
│              │                      │   │ 🤖 │  │ ➕ │       │
│              │                      │   │AI │  │空位│         │
│              │  [ 开始游戏 ]         │   └────┘  └────┘        │  
├──────────────┴──────────────────────┴─────────────────────────┤
```

## 二、各模块详细设计

### 2.1 顶部导航栏

| 元素 | 说明 |
|------|------|
| 返回 | 复用现有 `lobbyOnlineBackBtn`，离开房间 |
| 联机房间 | 标题文本 |
| 房间管理 | 弹出管理面板（见 2.6） |
| 商店 | 复用单机商店 `MobaoShopBridge`，购买需同步 |
| 金钱 | 显示当前金钱，实时更新 |

### 2.2 左侧 — 角色立绘区

- 默认状态：白色圆形 ➕，提示"点击选择角色"
- 已选状态：显示角色动态立绘（复用 `character-select.js` 的 Live2D 逻辑）
- 点击交互：弹出角色选择面板（见 2.5）
- 数据同步：选择后广播 `lan:character-select`，其他玩家的玩家列表显示对应角色头像

### 2.3 中间 — 模式/地图/道具

- 模式图片：占位"经典模式"，仅房主可点击（待定设计）
- 地图图片：显示当前选中地图缩略图，仅房主可点击，弹出地图选择窗口
- 地图选择窗口：复用单机 `MobaoMapProfiles` 的地图列表 UI
- 道具选择：复用单机 `character-select.js` 的 `_carryItems` / 携带道具栏
- 数据同步：
  - 地图选择 → 房主广播 `lan:map-select` → 客机更新 `GAME_SETTINGS`
  - 道具选择 → 各自本地，开局时同步 `lan:carry-items` 给主机

### 2.4 右侧 — 玩家列表（2×2 网格）

```
┌──────────┐  ┌──────────┐
│  [✕]     │  │  [✕]     │
│  👑头像   │  │  ➕      │
│  主机名   │  │  待加入   │
└──────────┘  └──────────┘
┌──────────┐  ┌──────────┐
│  [✕]     │  │  [✕]     │
│  🤖AI    │  │  ➕      │
│  ☑LLM    │  │  待加入   │
└──────────┘  └──────────┘
```

- 有人位：显示角色头像 + 玩家名 + 👑主机标识
- 空位：白色 ➕，点击弹出"添加AI"选项
- AI位：无头像，显示 🤖 + 名字 + LLM勾选框
- 踢出按钮：头像右上角红色 ✕，仅房主可见/可操作
- 数据同步：复用现有 `room:slot-state`，扩展字段增加 `characterId`

### 2.5 角色选择面板（弹窗）

- 布局：两列，一行两个角色
- 每个角色卡片：左头像 + 右技能介绍
- 选择后：关闭面板，更新立绘区 + 广播角色选择
- 复用：`CharacterData.CHARACTERS` 数据，UI 新写（单机是全屏页，联机用弹窗）

### 2.6 房间管理面板（弹窗）

- 竖直排列 4 名玩家状态
- 每行：玩家名 / 角色名 / 状态 / 踢出按钮 / 编号
- 房间设置区域（待定：回合数、出价规则等自定义）
- 复用现有 `lanSlotConfig` 逻辑，扩展字段

### 2.7 开始游戏按钮

- 仅房主可见/可点击
- 点击后收集所有玩家选择数据，发送 `game:start`

## 三、数据同步协议设计

### 3.1 新增协议消息

```javascript
// 客户端 → 服务器
{
  type: "lan:character-select",
  characterId: "appraiser",
  ts: Date.now()
}

{
  type: "lan:map-select",       // 仅房主可发
  mapProfileId: "treasure-vault",
  ts: Date.now()
}

{
  type: "lan:carry-items",      // 开局时发送携带道具
  carryItems: ["item-outline-lamp", "item-quality-needle"],
  ts: Date.now()
}

{
  type: "lan:shop-purchase",    // 商店购买同步
  itemId: "item-outline-lamp",
  ts: Date.now()
}

// 服务器 → 客户端（广播）
{
  type: "lan:character-selected",
  playerId: "p1a2b3c",
  characterId: "scout",
  ts: Date.now()
}

{
  type: "lan:map-selected",
  mapProfileId: "default",
  mapParams: { maxRounds: 5, directTakeRatio: 0.2, ... },
  ts: Date.now()
}

{
  type: "lan:shop-updated",
  playerId: "p1a2b3c",
  itemId: "item-outline-lamp",
  action: "purchase",
  ts: Date.now()
}
```

### 3.2 扩展现有消息

```javascript
// room:slot-state 扩展
{
  type: "room:slot-state",
  slots: [
    { type: "host", id: "xxx", name: "玩家1", characterId: "appraiser" },
    { type: "client", id: "yyy", name: "玩家2", characterId: "scout" },
    { type: "ai", name: "AI-1", llm: true, characterId: null },
    { type: "empty" }
  ]
}

// game:start 扩展
{
  type: "game:start",
  aiCount: 1,
  aiLlmEnabled: true,
  aiPlayers: [...],
  mapProfileId: "default",        // 新增
  mapParams: {...},                // 新增
  playerCharacters: {             // 新增
    "p1a2b3c": "appraiser",
    "p2c4d5e": "scout"
  },
  playerCarryItems: {             // 新增
    "p1a2b3c": ["item-outline-lamp"],
    "p2c4d5e": []
  }
}
```

### 3.3 full-sync 扩展

```javascript
// 断线重连时需同步角色/地图/道具状态
{
  type: "lan:full-sync",
  // ... 现有字段 ...
  characterId: "appraiser",       // 新增
  mapProfileId: "default",        // 新增
  mapParams: {...},               // 新增
  carryItems: [...],              // 新增
  playerCharacters: {...},        // 新增
}
```

## 四、实现步骤（按依赖顺序）

### Phase 1: UI 骨架

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 1.1 重写联机房间 HTML | `index.html` | 新布局替换现有 `lobbyOnlineRoom` |
| 1.2 重写联机房间 CSS | `styles.css` | 新样式：三栏布局、玩家网格、立绘区 |

### Phase 2: 角色系统

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 2.1 角色选择弹窗 | `lan/index.js` 新增方法 | 两列弹窗，复用 `CharacterData` |
| 2.2 角色立绘区 | `lan/index.js` | 默认➕/已选立绘切换 |
| 2.3 角色选择同步 | `server.js` + `lan/index.js` | 新增 `lan:character-select` / `lan:character-selected` |
| 2.4 角色应用到游戏 | `lan/index.js` `startLanRun()` | 调用 `applyCharacterToPlayer()` |

### Phase 3: 地图系统

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 3.1 地图选择弹窗 | `lan/index.js` | 复用 `MobaoMapProfiles`，仅房主可操作 |
| 3.2 地图选择同步 | `server.js` + `lan/index.js` | 新增 `lan:map-select` / `lan:map-selected` |
| 3.3 地图应用到游戏 | `lan/index.js` `startLanRun()` | 调用 `applyMapProfile()` |

### Phase 4: 道具系统

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 4.1 道具选择 UI | `lan/index.js` | 复用单机携带道具栏 |
| 4.2 道具同步 | `server.js` + `lan/index.js` | `game:start` 扩展 `playerCarryItems` |
| 4.3 道具消耗同步 | `server.js` | 扩展 `lan:player-action` 增加库存扣减 |

### Phase 5: 玩家列表

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 5.1 2×2 玩家网格 | `lan/index.js` | 替换现有 `lobbyOnlineSlots` |
| 5.2 头像/角色显示 | `lan/index.js` | 根据 `characterId` 显示对应头像 |
| 5.3 AI 添加/踢出 | `lan/index.js` | 复用并扩展现有逻辑 |

### Phase 6: 商店同步

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 6.1 商店入口 | `lan/index.js` | 复用 `openShopOverlay()` |
| 6.2 购买同步 | `server.js` + `lan/index.js` | 新增 `lan:shop-purchase` / `lan:shop-updated` |

### Phase 7: 房间管理

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 7.1 管理面板弹窗 | `lan/index.js` | 玩家列表 + 房间设置 |
| 7.2 房间设置 | 待定 | 自定义游戏参数 |

### Phase 8: 游戏启动

| 步骤 | 涉及文件 | 说明 |
|------|---------|------|
| 8.1 扩展 `game:start` | `server.js` + `lan/index.js` | 包含角色/地图/道具数据 |
| 8.2 扩展 `startLanRun()` | `lan/index.js` | 应用角色/地图/道具/分红等 |

## 五、关键同步问题分析

| 场景 | 问题 | 解决方案 |
|------|------|---------|
| 角色选择 | 两人选了同一角色 | 允许重复选择（不互斥），各自独立 |
| 地图切换 | 房主切换地图时客机需实时更新 | 广播 `lan:map-selected` 含完整 `mapParams`，客机立即更新 UI |
| 商店购买 | 客机购买后主机库存不一致 | 购买操作经服务器广播，各端本地扣库存 |
| 道具消耗 | 游戏中使用道具扣库存 | `lan:player-action` 扩展，各端同步调用 `consumeItem()` |
| 断线重连 | 重连后角色/地图/道具状态丢失 | `full-sync` 扩展，包含 `characterId` / `mapProfileId` / `carryItems` |
| AI 角色 | AI 没有角色选择 | AI 不选角色，使用默认参数，LLM AI 可由房主在管理面板配置 |

## 六、风险与注意事项

1. 向后兼容：旧版客户端无法解析新协议字段，需版本号检查
2. 商店同步延迟：网络延迟可能导致购买冲突，需乐观锁或服务端校验
3. 立绘资源：Live2D 视频资源较大，联机页面需确保资源预加载
4. 模式选择待定：目前只有"经典模式"，UI 先做占位，逻辑后续扩展
5. 房间管理自定义：高度自定义游戏玩法（回合数、出价规则等）需单独设计配置面板

## 七、联机缺失功能补充（游戏内逻辑）

以下功能不在房间 UI 范围内，但在游戏进行中需要补齐：

| 功能 | 当前状态 | 需要做的 |
|------|---------|---------|
| 分红/门票机制 | ❌ 缺失 | `lanDoFinishAuction()` 中添加计算逻辑 |
| 战绩保存 | ❌ 缺失 | 联机结算时调用 `saveBattleRecord()` |
| AI 反思系统 | ❌ 缺失 | 结算后调用 `triggerAiReflection()` |
| 跨局记忆注入 | ❌ 缺失 | `startLanRun()` 中调用 `pushRunStartContextToAi()` |
| AI 对话管理 | ❌ 缺失 | 添加 `resetAiConversations()` / `aiConversationByPlayer` |
| 揭示状态同步 | ❌ 缺失 | 主机揭示格子后广播给客机 |
| LLM 独立模型 | ❌ 缺失 | AI 可配不同模型 |

---

## 八、后续步骤细化（按优先级排序）

### Step 1: 角色选择数据同步（最核心，影响游戏能否正确开始）

**目标**：选角色后，所有玩家能看到其他人的角色选择，开局时角色正确应用

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 1.1 服务端处理角色选择 | `server.js` | 收到 `lan:character-select`，存储到 `room.playerCharacters[playerId]`，广播 `lan:character-selected` 给其他玩家 |
| 1.2 客户端监听角色选择 | `lan/index.js` | `bridge.on("lan:character-selected")` 更新 `lanSlotConfig[i].characterId`，重新 `renderSlots()` |
| 1.3 玩家列表显示角色头像 | `lan/index.js` | `renderLanPlayerSlot` 已有 `getCharAvatarHtml`，只需确保 `characterId` 正确传入 |
| 1.4 full-sync 扩展 | `server.js` | 断线重连时返回 `playerCharacters` 字段 |
| 1.5 角色应用到游戏 | `lan/index.js` | `startLanRun()` 中调用 `applyCharacterToPlayer()` 给每个玩家设置角色技能和被动 |

### Step 2: 地图选择功能（房主操作，影响游戏参数）

**目标**：房主选择地图后，所有玩家看到地图更新，开局时地图参数正确应用

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 2.1 地图选择弹窗内容 | `lan/index.js` | 替换占位，复用 `MobaoMapProfiles` 的地图列表渲染逻辑 |
| 2.2 服务端处理地图选择 | `server.js` | 收到 `lan:map-select`，存储到 `room.mapProfileId` / `room.mapParams`，广播 `lan:map-selected` |
| 2.3 客户端监听地图选择 | `lan/index.js` | `bridge.on("lan:map-selected")` 更新地图卡片显示（缩略图+名称） |
| 2.4 地图应用到游戏 | `lan/index.js` | `startLanRun()` 中调用 `applyMapProfile()` 设置仓库参数 |

### Step 3: 道具选择同步（开局时同步）

**目标**：各玩家携带的道具在开局时同步给主机，主机汇总后广播

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 3.1 game:start 扩展 | `server.js` | 收集所有玩家的 `carryItems`，放入 `game:start` 消息 |
| 3.2 客户端发送道具 | `lan/index.js` | 进入房间时发送 `lan:carry-items`，道具变更时重新发送 |
| 3.3 道具应用到游戏 | `lan/index.js` | `startLanRun()` 中根据 `playerCarryItems` 给每个玩家设置初始道具 |

### Step 4: 商店购买同步（游戏中同步）

**目标**：玩家在商店购买道具后，其他端库存一致

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 4.1 服务端转发购买 | `server.js` | 收到 `lan:shop-purchase`，广播 `lan:shop-updated` |
| 4.2 客户端监听购买 | `lan/index.js` | `bridge.on("lan:shop-updated")` 本地扣库存 + 更新金钱显示 |

### Step 5: 房间管理面板（完善占位）

**目标**：房间管理面板可查看/操作玩家、配置房间参数

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 5.1 玩家列表渲染 | `lan/index.js` | 竖直排列4名玩家，显示角色/状态/踢出按钮 |
| 5.2 房间设置区域 | `lan/index.js` | 回合数、出价规则等自定义参数（待定具体字段） |
| 5.3 编号/组队 | `lan/index.js` | 给玩家编号，支持2v2组队（待定） |

### Step 6: 游戏启动扩展（汇总所有数据）

**目标**：点击"开始游戏"时，所有角色/地图/道具数据正确传递

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 6.1 扩展 game:start 消息 | `server.js` | 包含 `mapProfileId` / `mapParams` / `playerCharacters` / `playerCarryItems` |
| 6.2 扩展 startLanRun() | `lan/index.js` | 应用角色技能/被动 + 地图参数 + 携带道具 + 分红设置 |
| 6.3 客机正确初始化 | `lan/index.js` | 客机收到 `game:init` 后正确初始化所有玩家数据 |

### Step 7: 游戏内逻辑补齐（长期）

| 子步骤 | 涉及文件 | 详细说明 |
|--------|---------|---------|
| 7.1 分红/门票 | `lan/index.js` | `lanDoFinishAuction()` 中添加计算逻辑 |
| 7.2 战绩保存 | `lan/index.js` | 联机结算时调用 `saveBattleRecord()` |
| 7.3 AI反思+记忆 | `lan/index.js` | 结算后调用 `triggerAiReflection()` + `pushRunStartContextToAi()` |
| 7.4 揭示状态同步 | `server.js` | 主机揭示格子后广播给客机 |
| 7.5 LLM独立模型 | `lan/index.js` | AI可配不同模型 |
