# UI 层文档

> 本文档详细描述游戏的用户界面系统，包括大厅、角色选择、HUD、弹窗覆盖层、信息面板、历史记录、动画系统和主场景组装。

---

## 一、UI 层总览

### 1.1 文件清单

| 目录 | 文件 | 设计模式 | 职责 |
|------|------|---------|------|
| lobby/ | index.ts | Mixin | 大厅主页导航、模式入口、游戏启动 |
| lobby/ | carousel.ts | Mixin | 地图选择轮播组件 |
| lobby/ | character-select.ts | Mixin | 角色选择页面（Live2D+道具携带） |
| ui/ | overlay.ts | Mixin | 弹窗/覆盖层/设置面板 |
| ui/ | panels.ts | Mixin | 侧边信息面板（私有情报+公共信息） |
| ui/ | history.ts | Mixin | 出价历史+道具抽屉 |
| scripts/game/ | animations.ts | IIFE 单例 | 前端动效工具库 |
| scripts/game/ | main.ts | 类 + Mixin 组装 | 游戏入口与主场景 |

### 1.2 UI 架构

```
┌──────────────────────────────────────────────────────────────┐
│                      WarehouseScene                          │
│                   (Phaser 主场景类)                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   main.ts 核心方法                      │  │
│  │  create() / update() / startNewRun() / startNewRound() │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  19 个 Mixin 混入:                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │Warehouse │ │   AI     │ │ Bidding  │ │   UI     │       │
│  │ 3 Mixin  │ │ 5 Mixin  │ │ 1 Mixin  │ │ 3 Mixin  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐        │
│  │  Lobby   │ │   Lan    │ │       Core           │        │
│  │ 3 Mixin  │ │ 1 Mixin  │ │ 3 Mixin              │        │
│  └──────────┘ └──────────┘ └──────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

---

## 二、大厅系统（lobby/）

### 2.1 大厅主页（index.ts）

#### 页面结构

```
┌─────────────────────────────────────┐
│           大厅主页 (lobbyMain)        │
│                                     │
│   ┌──────────┐  ┌──────────┐       │
│   │  单机模式  │  │  联机模式  │       │
│   └──────────┘  └──────────┘       │
│                                     │
│   [设置] [商店] [战绩] [收藏]        │
└─────────────────────────────────────┘
         │
         ├── 单机 → lobbySoloSetup
         │         ┌───────────────────────┐
         │         │ 地图轮播 ← →          │
         │         │ [地图详情]             │
         │         │ [商店] [开始游戏]      │
         │         └───────────────────────┘
         │                   │
         │                   ▼
         │         lobbyCharacterSelect
         │         ┌───────────────────────┐
         │         │ 角色列表 | 立绘预览     │
         │         │ 技能/被动 | 携带道具    │
         │         │ [返回] [确认]          │
         │         └───────────────────────┘
         │
         └── 联机 → lobbyOnlinePlaceholder
                   ┌───────────────────────┐
                   │ 连接/创建/加入房间      │
                   └───────────────────────┘
```

#### 核心方法

| 方法 | 说明 |
|------|------|
| `bindLobbyEvents()` | 绑定所有大厅按钮事件 |
| `showLobbyMain()` | 返回大厅主页 |
| `showLobbySubPage(name)` | 切换到子页面（带动画） |
| `goToCharacterSelect()` | 进入角色选择页 |
| `startSoloGame()` | 启动单机游戏 |
| `enterLobby()` | 从游戏返回大厅 |
| `exitLobby()` | 从大厅进入游戏 |
| `applyMapProfile()` | 应用选中地图参数到 GAME_SETTINGS |
| `initPlayersUI()` | 初始化4个玩家槽位 |
| `updatePlayerAvatar(playerId)` | 更新玩家头像 |
| `updateLobbyMoneyDisplay()` | 同步所有页面金额 |

#### 大厅↔游戏切换

```
enterLobby()
  ├── 清理游戏场景（cleanupGameScene）
  ├── 重置玩家状态
  ├── 显示大厅 DOM
  ├── 暂停 Phaser 游戏循环
  └── 切换 BGM

exitLobby()
  ├── 隐藏大厅 DOM
  ├── 显示游戏区 DOM
  ├── 唤醒 Phaser 游戏循环
  └── 播放游戏 BGM
```

### 2.2 地图轮播（carousel.ts）

#### 功能

- 横向滚动浏览地图卡片
- 触摸滑动手势（水平滑动 > 30px 触发翻页）
- 左右箭头导航
- 选中地图的参数详情展示

#### 地图详情展示

```
renderMapDetail()
  │
  ├── 将数值参数转换为5级语义标签:
  │     toLevel(value, thresholds)
  │     例: highQ占比 < 0.2 → "低"
  │               < 0.35 → "较低"
  │               < 0.5  → "中"
  │               < 0.65 → "较高"
  │               else   → "高"
  │
  └── 展示项: 回合数、直接拿下比例、高品质占比、低品质占比、各品质权重
```

### 2.3 角色选择（character-select.ts）

#### 页面布局

```
┌──────────────────────────────────────────┐
│  [返回]           角色选择          [确认]  │
├──────────────┬───────────────────────────┤
│              │                           │
│  角色卡片列表  │     Live2D 立绘预览        │
│              │                           │
│  ┌────────┐ │     ┌─────────────────┐   │
│  │ 鉴定师  │ │     │                 │   │
│  │ [选中]  │ │     │   动态立绘       │   │
│  └────────┘ │     │   (无缝循环)     │   │
│  ┌────────┐ │     │                 │   │
│  │ 探子   │ │     └─────────────────┘   │
│  └────────┘ │                           │
│  ┌────────┐ │     技能: 玉脉鉴质         │
│  │ 觅踪者  │ │     被动: 盈利加成+10%     │
│  └────────┘ │                           │
│              │     携带道具:              │
│              │     [槽1] [槽2] [槽3]      │
│              │     [选择道具]             │
└──────────────┴───────────────────────────┘
```

#### Live2D 无缝循环机制

```
_startLive2dLoop(videoA, videoB, src)
  │
  ├── 双视频元素（A/B）交替播放
  ├── _loadingLock 防止并发加载
  │
  ├── 播放流程:
  │     ├── videoA.src = src → videoA.play()
  │     ├── videoA 播放到末尾 → 预加载 videoB
  │     ├── videoB.src = src → videoB.play()
  │     ├── 切换显示: videoA 隐藏, videoB 显示
  │     ├── videoB 播放到末尾 → 预加载 videoA
  │     └── 循环...
  │
  └── 帧回调:
        ├── 优先 requestVideoFrameCallback（精确帧回调）
        └── 降级到 timeupdate 事件
```

#### 携带道具系统

```
携带道具（最多3个）
  │
  ├── _carryItems: 当前携带的道具数组
  ├── openCarryItemPicker(): 打开道具选择弹窗
  │     ├── 网格布局显示所有道具
  │     ├── 库存 > 0 的道具可选
  │     └── 已携带的道具标记
  │
  ├── removeCarryItem(itemId): 移除已携带道具
  │
  ├── _autoReplenish: 道具耗尽时自动补充开关
  │     ├── calcReplenishCost(): 计算补充费用
  │     └── executeReplenish(): 执行补充（扣费+补库存）
  │
  └── 持久化: localStorage（mobao_carry_items_v1）
```

---

## 三、游戏内 UI（ui/）

### 3.1 弹窗与覆盖层（overlay.ts）

#### 弹窗类型

| 弹窗 | 方法 | 说明 |
|------|------|------|
| 信息弹窗 | `showInfoPopup / hideInfoPopup` | 藏品/玩家详情，支持动画 |
| 玩家信息气泡 | `showPlayerInfoPopover / hidePlayerInfoPopover` | 跟随鼠标，自动避免溢出 |
| 道具详情 | `showItemDetailPopup` | 从 ItemSystem 读取定义 |
| 角色信息 | `showCharacterInfoPopup` | 从 CharacterData 读取 |
| 设置覆盖层 | `openSettingsOverlay / closeSettingsOverlay` | 游戏参数 + LLM 设置 |
| 联机重开投票 | `showLanRestartVoteDialog` | 房主发起 → 等待确认 |
| 确认对话框 | `showGameConfirm / hideGameConfirm` | 通用确认/取消 |

#### 设置覆盖层

```
openSettingsOverlay()
  │
  ├── 游戏参数设置:
  │     ├── maxRounds (3~12)
  │     ├── roundSeconds (10~180)
  │     ├── directTakeRatio (0.05~0.6)
  │     ├── bidStep (10~10000)
  │     ├── bidRevealIntervalMs (250~1800)
  │     ├── postRevealWaitMs (800~6000)
  │     ├── settlementSpeedMultiplier (0.5~3)
  │     ├── musicVolume (0~100)
  │     └── sfxVolume (0~100)
  │
  ├── LLM 设置:
  │     ├── DeepSeek API Key
  │     ├── 独立模型配置
  │     ├── multiGameMemoryEnabled（跨局记忆开关）
  │     └── 联机模式下禁用
  │
  ├── 未保存保护: 修改后关闭需确认
  │
  └── 保存时同步更新:
        ├── GAME_SETTINGS
        ├── LLM_SETTINGS
        └── bidInput 等 UI 元素
```

### 3.2 侧边信息面板（panels.ts）

#### 面板布局

```
┌──────────┬──────────────────┬──────────┐
│ 私有情报  │                  │ 公共信息  │
│ 面板     │     仓库画布      │  面板    │
│          │                  │          │
│ 来源：xxx │                  │ 来源：xxx │
│ 文本...  │                  │ 文本...  │
│          │                  │          │
│ 来源：yyy │                  │ 来源：yyy │
│ 文本...  │                  │ 文本...  │
└──────────┴──────────────────┴──────────┘
```

#### 数据结构

```javascript
// 私有情报条目
{ source: "探照灯", text: "揭示了4件藏品轮廓", round: 2 }

// 公共信息条目
{ source: "公共事件", text: "据说这间仓库中藏有绝品", round: 1 }
```

#### 联机同步

```
addPublicInfoEntry(entry)
  │
  ├── 添加到 publicInfoEntries 数组
  │
  └── 联机模式下:
        └── 房主自动通过 lanBridge 广播（lan:public-info）
```

#### 渲染优化

```
renderPrivateIntelPanel()
  │
  ├── 版本缓存: 比较 entries.length + 最后一项 text
  │     └── 版本未变 → 跳过渲染
  │
  └── 自动滚动: 如果之前在底部 → 渲染后自动滚到底部
```

### 3.3 历史记录与道具抽屉（history.ts）

#### 出价历史

```
recordRoundHistory(roundBids)
  │
  ├── 为每个玩家记录:
  │     ├── 出价: { round: 3, bid: 320000 }
  │     └── 道具使用: { round: 3, actions: ["item-outline-lamp"] }
  │
  ├── 保留最近 maxRounds 轮记录
  │
  └── 刷新历史面板 UI
```

#### 历史面板表格

```
┌─────────────────────────────────┐
│  玩家出价历史                     │
├────┬─────┬─────┬─────┬─────┬───┤
│轮次│  1  │  2  │  3  │  4  │ 5 │
├────┼─────┼─────┼─────┼─────┼───┤
│行动│🔦   │     │🪡   │     │   │
│报价│18万 │25万 │32万 │     │   │
└────┴─────┴─────┴─────┴─────┴───┘
```

#### 道具抽屉

```
toggleItemDrawer()
  │
  ├── 锁定检查（不可打开的情况）:
  │     ├── 已结算 (settled)
  │     ├── 出价已提交 (playerBidSubmitted)
  │     ├── 时间耗尽 (roundTimeLeft <= 0)
  │     ├── 设置面板打开
  │     └── 结算页激活
  │
  ├── renderItemDrawer()
  │     ├── 版本缓存避免重复渲染
  │     ├── 空状态区分:
  │     │     ├── "未携带道具"（_carryItems 为空）
  │     │     └── "道具已全部使用"（所有道具 count=0）
  │     └── 可用道具列表（带数量和使用按钮）
  │
  └── 使用道具 → recordPlayerUsage() → 执行揭示
```

---

## 四、动画系统（animations.ts）

### 4.1 动效分类

| 类别 | 方法 | 说明 |
|------|------|------|
| 涟漪效果 | `ripple(event, element, options)` | 按钮点击涟漪，自动清理 |
| 涟漪绑定 | `bindRipple(button, options)` | 为按钮绑定涟漪事件 |
| 数字滚动 | `scrollNumber(el, from, to, opts)` | easeOutCubic 缓出数字动画 |
| 数字滚动便捷 | `scrollToNumber(el, newValue, opts)` | 自动检测当前值 |
| 渐次入场 | `staggerEnter(elements, opts)` | 一组元素渐次入场 |
| 脉冲提示 | `pulse(element, type, opts)` | 4种类型: heart/soft/alert/badge |
| 停止脉冲 | `stopPulse(element)` | 停止脉冲动画 |
| 覆盖层开 | `animateOverlayOpen(overlay, inner)` | 淡入+缩放+面板滑入 |
| 覆盖层关 | `animateOverlayClose(overlay, inner)` | 淡出+缩放+hidden |
| 回合过渡 | `roundTransition(opts)` | 游戏区→结算页过渡 |
| 暂停视觉 | `togglePauseVisual(hud, isPaused)` | HUD 暂停状态切换 |
| 页面过渡 | `transitionToSettlement(game, settle)` | 游戏区淡出+结算页淡入 |
| 按下缩放 | `bindPressScale(button)` | 按下缩放反馈 |
| 批量绑定 | `bindAllButtonEffects(buttons)` | 涟漪+缩放 |

### 4.2 数字滚动动画

```
scrollNumber(element, from, to, options)
  │
  ├── 缓动: easeOutCubic
  ├── 时长: options.duration || 600ms
  ├── 小数位: options.decimals || 0
  ├── 千分位: options.thousandsSep || false
  ├── 前缀: options.prefix || ""
  ├── 后缀: options.suffix || ""
  └── 自定义格式化: options.format || null
```

### 4.3 脉冲类型

| 类型 | 效果 | 用途 |
|------|------|------|
| heart | 心跳缩放 | 重要提示 |
| soft | 柔和脉冲 | 一般提醒 |
| alert | 红色闪烁 | 警告 |
| badge | 角标脉冲 | 未读消息 |

### 4.4 覆盖层动画

```
animateOverlayOpen(overlayEl, innerEl)
  │
  ├── overlay: opacity 0→1, 200ms
  ├── inner: scale(0.9)→scale(1), translateY(20px)→0, 300ms
  └── 结束后移除 hidden 类

animateOverlayClose(overlayEl, innerEl, onDone)
  │
  ├── inner: scale(1)→scale(0.95), translateY(0)→10px, 150ms
  ├── overlay: opacity 1→0, 200ms
  └── 结束后添加 hidden 类, 调用 onDone
```

---

## 五、主场景组装（main.ts）

### 5.1 加载顺序与依赖检查

```
main.ts 启动时严格检查所有全局模块:
  │
  ├── MobaoConstants    → 缺失则抛出 Error
  ├── MobaoUtils        → 缺失则抛出 Error
  ├── MobaoSettings     → 缺失则抛出 Error
  ├── MobaoWarehouse    → 缺失则抛出 Error
  ├── ArtifactData      → 缺失则抛出 Error
  ├── SkillSystem       → 缺失则抛出 Error
  ├── ItemSystem        → 缺失则抛出 Error
  ├── AuctionAI         → 缺失则抛出 Error
  ├── DeepSeekLLM       → 缺失则抛出 Error
  ├── MobaoSceneLlm     → 缺失则抛出 Error
  ├── MobaoBattleRecordBridge → 缺失则抛出 Error
  ├── MobaoSettlementBridge   → 缺失则抛出 Error
  ├── MobaoUi           → 缺失则抛出 Error
  ├── MobaoBidding      → 缺失则抛出 Error
  └── 任何缺失 → 阻止游戏启动
```

### 5.2 桥接层初始化

```javascript
// main.ts create() 中
const LLM_BRIDGE = createSceneLlmBridge({ ... });
const BATTLE_RECORD_BRIDGE = createBattleRecordBridge({ ... });
const SETTLEMENT_BRIDGE = createSettlementBridge({ ... });

Object.assign(this, LLM_BRIDGE);
Object.assign(this, BATTLE_RECORD_BRIDGE);
Object.assign(this, SETTLEMENT_BRIDGE);
```

### 5.3 WarehouseScene 实例属性

#### Phaser 图层

| 属性 | 类型 | 说明 |
|------|------|------|
| gridLayer | Phaser.Graphics | 网格线图层 |
| revealCellLayer | Phaser.Graphics | 揭示单元格图层 |
| itemLayer | Phaser.Container | 藏品容器 |

#### 管理器

| 属性 | 类型 | 说明 |
|------|------|------|
| artifactManager | ArtifactManager | 藏品生成管理 |
| skillManager | SkillManager | 技能使用管理 |
| itemManager | ItemManager | 道具使用管理 |
| aiEngine | AuctionAiEngine | AI 出价引擎 |

#### 回合状态

| 属性 | 类型 | 说明 |
|------|------|------|
| round | number | 当前轮数 |
| actionsLeft | number | 剩余行动次数 |
| roundTimeLeft | number | 回合剩余秒数 |
| roundPaused | boolean | 是否暂停 |
| roundResolving | boolean | 是否正在结算 |

#### 出价状态

| 属性 | 类型 | 说明 |
|------|------|------|
| currentBid | number | 当前最高出价 |
| bidLeader | string | 当前出价领先者 ID |
| playerBidSubmitted | boolean | 玩家是否已出价 |
| playerRoundBid | number | 玩家本轮出价 |
| secondHighestBid | number | 第二高出价 |

#### 联机状态

| 属性 | 类型 | 说明 |
|------|------|------|
| isLanMode | boolean | 是否联机模式 |
| lanBridge | LanBridge | 联机通信桥 |
| lanIsHost | boolean | 是否房主 |
| lanMySlotId | string | 自己的槽位 ID |

### 5.4 Mixin 混入顺序

```javascript
// 19 个 Mixin 按顺序混入 WarehouseScene.prototype
Object.assign(WarehouseScene.prototype, {
  ...WarehouseCoreMixin,
  ...WarehouseRevealMixin,
  ...WarehousePreviewMixin,
  ...AiWalletMixin,
  ...AiIntelMixin,
  ...AiMemoryMixin,
  ...AiReflectionMixin,
  ...AiDecisionMixin,
  ...BiddingMixin,
  ...UiOverlayMixin,
  ...PanelsMixin,
  ...HistoryMixin,
  ...LobbyIndexMixin,
  ...CarouselMixin,
  ...CharacterSelectMixin,
  ...LanIndexMixin,
  ...RoundManagerMixin,
  ...SkillItemManagerMixin,
  ...SettlementManagerMixin
});
```

### 5.5 Phaser 配置

```javascript
const config = {
  type: Phaser.AUTO,
  width: MARGIN * 2 + GRID_COLS * CELL_SIZE,   // 768px
  height: MARGIN * 2 + GRID_ROWS * CELL_SIZE,   // 1600px
  transparent: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  scene: [WarehouseScene]
};
```

---

## 六、DOM 结构概览

### 6.1 游戏 HUD

```
┌──────────────────────────────────────────────────┐
│  第3回合  ⏱45s  💰1,000,000  [暂停] [设置]       │
├──────────┬──────────────────────┬────────────────┤
│          │                      │                │
│ 私有情报  │     仓库画布          │   公共信息      │
│ 面板     │     (Phaser Canvas)  │   面板         │
│          │                      │                │
├──────────┴──────────────────────┴────────────────┤
│  玩家卡片 × 4                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│  │ 稳算师 │ │ 玩家  │ │ 猛冲客 │ │ 机变派 │            │
│  │ AI   │ │ 你   │ │ AI   │ │ AI   │            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
├──────────────────────────────────────────────────┤
│  出价: [____320000____]  [出价]  [道具]  [技能]    │
└──────────────────────────────────────────────────┘
```

### 6.2 大厅页面层级

```
#lobbyPage
  ├── #lobbyMain          ← 大厅主页
  ├── #lobbySoloSetup     ← 单机设置
  ├── #lobbyOnlinePlaceholder  ← 联机入口
  └── #lobbyCharacterSelect    ← 角色选择
```

### 6.3 弹窗/覆盖层

```
#infoPopupOverlay          ← 信息弹窗
#playerInfoPopover         ← 玩家信息气泡
#settingsOverlay           ← 设置覆盖层
#gameConfirmOverlay        ← 确认对话框
#shopOverlay               ← 商店覆盖层
#battleRecordOverlay       ← 战绩覆盖层
#collectionOverlay         ← 收藏覆盖层
#itemDetailPopup           ← 道具详情弹窗
#characterInfoPopup        ← 角色信息弹窗
#carryItemPickerOverlay    ← 携带道具选择弹窗
```
