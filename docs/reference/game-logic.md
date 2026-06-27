# 游戏逻辑层文档

> 本文档详细描述游戏核心玩法的实现，包括仓库系统、出价流程、商店系统、结算系统和战绩记录。

---

## 一、游戏逻辑层总览

### 1.1 文件清单

| 文件 | 设计模式 | 职责 |
|------|---------|------|
| `warehouse/index.js` | 3 个 Mixin | 仓库网格绘制、藏品生成、揭示机制、候选预览 |
| `bidding/index.js` | 1 个 Mixin | 出价交互、回合结算、出价揭示动画、直接拿下判定 |
| `bridge/shop.js` | IIFE 单例 | 道具购买/消耗/库存/限购/特惠 |
| `bridge/settlement.js` | 工厂函数 | 结算页面、藏品揭示动画、庆祝特效 |
| `bridge/battle-record.js` | 工厂函数 | 战绩持久化、面板渲染、AI日志查看、对局复现 |
| `shop/index.js` | IIFE 单例 | 商店页面 UI（浏览/搜索/购买/库存/特惠） |

### 1.2 游戏状态流转

```
┌─────────┐    开始对局    ┌──────────┐    出价阶段    ┌──────────┐
│  大厅    │ ────────────▶ │  仓库    │ ◀──────────▶ │  出价    │
│ (lobby)  │               │(warehouse)│    多轮循环    │ (bidding)│
└─────────┘               └────┬─────┘               └────┬─────┘
                               │                          │
                               │ 所有轮次结束              │ 直接拿下/最终轮
                               │                          │
                               ▼                          ▼
                         ┌──────────┐               ┌──────────┐
                         │  结算    │ ────────────▶ │  战绩    │
                         │(settle)  │    保存记录    │ (record) │
                         └──────────┘               └──────────┘
```

---

## 二、仓库系统

### 2.1 概述

仓库系统由三个 Mixin 组成，管理 12×25 的网格仓库，包含藏品生成、揭示和预览功能。

### 2.2 仓库网格参数

| 参数 | 值 | 来源 |
|------|-----|------|
| GRID_COLS | 12 | MobaoConstants |
| GRID_ROWS | 25 | MobaoConstants |
| CELL_SIZE | 64px | MobaoConstants |
| MARGIN | 0 | MobaoConstants |
| CANVAS_NATIVE_HEIGHT | 1600px | MobaoConstants |
| MAX_WAREHOUSE_CELLS | 300 | MobaoConstants |
| 占用率范围 | 38%~88% | WAREHOUSE_OCCUPANCY_RATIO_RANGE |
| 藏品数量范围 | 50~300 | ARTIFACT_COUNT_RANGE |

### 2.3 WarehouseCoreMixin — 仓库核心

#### 藏品生成流程

```
spawnRandomItems()
  │
  ├── 1. 创建空的 occupancy 二维数组 (25×12)
  ├── 2. 随机目标占用率: capacity × random(0.38, 0.88)
  ├── 3. 随机目标数量: random(50, 300)
  │
  ├── 4. 循环放置藏品（最多 520 次尝试）:
  │     ├── findFirstEmptySlot(occupancy) ← 找到第一个空位
  │     ├── artifactManager.createRandomArtifactForSlot() ← 生成随机藏品
  │     │     ├── 根据 categoryWeights 和 qualityWeights 调整权重
  │     │     ├── 随机选择品类、品质、尺寸
  │     │     └── 检查是否能放入网格
  │     ├── placeItem(item, slot, occupancy) ← 放置并标记占用
  │     ├── renderItem(item) ← 渲染到画布
  │     └── items.push(item)
  │
  └── 5. 生成完成 → setupWarehouseAuction()
```

#### 拍卖参数初始化

```
setupWarehouseAuction()
  │
  ├── warehouseTrueValue = Σ(item.trueValue)  ← 仓库真实总价值
  ├── aiMaxBid = warehouseTrueValue × random(0.9, 1.12)  ← AI 最高出价参考
  └── currentBid = warehouseTrueValue × 0.18 / 100 × 100  ← 起始出价（对齐到百位）
```

#### 藏品数据结构

```javascript
item = {
  id: "artifact-0",           // 唯一 ID
  x: 3, y: 7,                 // 网格坐标（左上角）
  w: 2, h: 3,                 // 占用格数（宽×高）
  category: "瓷器",            // 品类
  qualityKey: "rare",          // 品质键
  basePrice: 28000,            // 基础价格
  trueValue: 28000,            // 真实价值（= basePrice）
  revealed: {                  // 揭示状态
    outline: false,            // 轮廓是否已揭示
    qualityCell: null,         // 品质格坐标 {x, y} 或 null
    exact: false               // 是否完全揭示
  }
}
```

#### 藏品渲染

```
renderItem(item)
  │
  ├── 未揭示: 绘制空白占位（无视觉反馈）
  │
  ├── 轮廓揭示 (outline=true, qualityCell=null):
  │     ├── 绘制藏品边框（虚线）
  │     ├── 标注品类文字
  │     ├── 标注尺寸标签（大/中/小）
  │     └── 设置点击区域
  │
  ├── 品质揭示 (qualityCell != null):
  │     ├── 品质格着色（赝品灰/普品白/良品绿/精品蓝/珍品紫/绝品金）
  │     ├── 品质标签文字
  │     └── 缩略图（如已加载）
  │
  └── 完全揭示 (exact=true):
        ├── 完整边框
        ├── 品质色带
        ├── 缩略图
        └── 藏品名称
```

### 2.4 WarehouseRevealMixin — 揭示系统

#### 揭示类型

| 类型 | 方法 | 效果 | 视觉反馈 |
|------|------|------|----------|
| 轮廓揭示 | `revealOutlineBatch()` | 显示藏品边框、品类、尺寸 | 虚线边框 + 品类文字 |
| 品质揭示 | `revealQualityBatch()` | 显示指定格的品质颜色 | 品质格着色 + 标签 |
| 完全揭示 | `revealArtifactFully()` | 轮廓+品质+精确 | 完整渲染 + 特效动画 |

#### 揭示目标选择

```
pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy })
  │
  ├── 1. 筛选候选藏品
  │     ├── outline 模式: 排除已揭示轮廓的
  │     ├── quality 模式: 排除已揭示品质的
  │     └── 品类筛选: category 参数过滤
  │
  ├── 2. 品类回退（allowCategoryFallback=true 时）
  │     └── 指定品类不足 → 补充其他品类
  │
  ├── 3. 排序策略
  │     ├── smallestFirst: 小件优先（面积升序）
  │     ├── largestFirst: 大件优先（面积降序）
  │     └── random: 随机（默认）
  │
  └── 4. 取前 count 个
```

#### 完全揭示特效

```
playFullRevealEffect(item)
  │
  ├── 1. 外环扩散（金色圆环从中心向外扩散）
  │     └── 半径: CELL_SIZE → CELL_SIZE × 2.5, 时长 400ms
  │
  ├── 2. 内爆效果（白色闪光快速收缩）
  │     └── 半径: CELL_SIZE × 1.5 → 0, 时长 200ms
  │
  ├── 3. 边框淡入（品质色边框渐显）
  │     └── alpha: 0 → 1, 时长 300ms
  │
  └── 4. 图片弹入（缩略图缩放弹入）
        └── scale: 0.3 → 1.1 → 1.0, 时长 350ms
```

### 2.5 WarehousePreviewMixin — 候选预览

当玩家点击已揭示轮廓但未完全揭示的藏品时，弹出候选列表：

```
onArtifactClicked(item)
  │
  ├── 已完全揭示 → 显示藏品详情
  │
  └── 仅轮廓/品质 → renderPreviewCandidates(item)
        ├── 根据 item 的品类+品质+尺寸 筛选 ARTIFACT_LIBRARY 中的候选
        ├── 渲染候选列表（名称、品质、价格）
        ├── positionPreview() ← 自动定位（避免溢出屏幕）
        └── setupPreviewTouchScroll() ← 移动端触摸滚动
```

---

## 三、出价流程

### 3.1 概述

`BiddingMixin`（`bidding/index.js`）管理多轮盲拍出价的完整流程。

### 3.2 出价交互

```
openBidKeypad()
  │
  ├── 隐藏道具抽屉、信息弹窗
  ├── 初始化 keypadValue（从输入框读取或默认 0）
  ├── syncBidKeypadScreen() ← 同步显示到屏幕
  ├── updateKeypadDirectHint() ← 更新"可直接拿下"提示
  │     ├── 计算所需出价 = 第二高出价 × (1 + directTakeRatio)
  │     └── 若当前输入 ≥ 所需出价 → 显示"可直接拿下"
  └── 显示键盘，禁用游戏输入

handleBidKeyInput(key)
  │
  ├── "clear" → 重置为 0
  ├── "del" → 删除末位
  ├── "ok" → 确认出价
  │     ├── 读取 keypadValue
  │     ├── 写入 bidInput
  │     ├── 关闭键盘
  │     └── showGameConfirm() → 确认后调用 playerBid()
  └── 数字键 → 追加数字（最大 99999999）
```

### 3.3 单机出价流程

```
startRound()
  │
  ├── 重置回合状态（playerBidSubmitted=false, roundBidReadyState）
  ├── 更新 HUD
  ├── 启动回合计时器
  └── kickoffAiRoundDecisions() ← 触发 AI 决策（异步并发）
        │
        ├── 规则 AI: aiEngine.buildAIBids(context)
        └── LLM AI: requestLlmDecision()（可选覆盖）

playerBid()
  │
  ├── 读取玩家出价值
  ├── 归一化（clamp 到步长）
  ├── playerBidSubmitted = true
  ├── setPlayerBidReady(myId, true)
  └── areAllPlayersBidReady()?
        └── Yes → resolveRoundBids()

resolveRoundBids()
  │
  ├── 1. 停止计时器、停止倒计时音效
  ├── 2. 若玩家未出价 → 按 0 处理
  ├── 3. buildRoundBids() ← 整合所有出价
  │     ├── 规则 AI 出价: aiEngine.buildAIBids()
  │     ├── LLM 覆盖: aiLlmRoundPlans[playerId].bid
  │     └── 玩家出价: playerRoundBid
  ├── 4. captureAiDecisionTelemetry() ← 记录遥测
  ├── 5. revealRoundBidsSequential(roundBids) ← 逐个揭示
  ├── 6. recordRoundHistory() ← 记录历史
  │
  ├── 7. 排名判定
  │     ├── currentBid = 最高出价
  │     ├── bidLeader = 最高出价者
  │     └── secondHighestBid = 第二高出价
  │
  ├── 8. 直接拿下判定
  │     └── 最高出价 ≥ 第二高出价 × (1 + directTakeRatio)?
  │           ├── Yes → finishAuction(first, "direct")
  │           └── No → 进入下一轮
  │
  └── 9. 最终轮判定
        └── round === maxRounds?
              ├── Yes → finishAuction(first, "final")
              └── No → round++ → startRound()
```

### 3.4 出价揭示动画

```
revealRoundBidsSequential(roundBids)
  │
  ├── 按出价从低到高排序
  │
  ├── 逐个揭示（间隔 bidRevealIntervalMs）:
  │     ├── 显示玩家名和出价值
  │     ├── 出价动画（数字滚动）
  │     ├── 标记当前领先者
  │     └── 播放揭示音效
  │
  └── 全部揭示后:
        ├── 显示排名
        ├── 高亮最高出价者
        └── 更新 HUD
```

### 3.5 联机出价流程

```
联机玩家出价:
  playerBid()
    └── lanBridge.submitBid(bidValue) ← 通过 WebSocket 提交
          │
          └── 服务端广播 → 所有客户端更新出价状态

联机结算（仅主机端）:
  收到所有出价 → resolveRoundBids()
    ├── buildRoundBids()
    ├── revealRoundBidsSequential()
    └── 广播结算结果 → lanBridge.send("round:result", result)

联机客户端:
  lanBridge.on("round:result") → 更新显示
```

### 3.6 直接拿下机制

```
判定条件:
  round < maxRounds  ← 非最终轮
  AND first.bid > 0  ← 最高出价大于 0
  AND first.bid >= ceil(second.bid × (1 + directTakeRatio))

directTakeRatio 默认值: 0.2（即需比第二高出 20%，公式中表现为 ×(1+0.2)=×1.2）

示例:
  第二高出价: 250,000
  所需出价: ceil(250,000 × 2.2) = 550,000
  若最高出价 ≥ 550,000 → 直接拿下
```

### 3.7 暂停/恢复

```javascript
// 暂停
this.roundPaused = true;
// AI 决策会通过 waitUntilResumed() 轮询等待

// 恢复
this.roundPaused = false;
// 轮询检测到后继续执行

waitUntilResumed() {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (this.settled || this.roundResolving) {
        reject(new Error("PAUSE_CANCELLED")); return;
      }
      if (!this.roundPaused) { resolve(); return; }
      setTimeout(check, 200);  // 200ms 轮询
    };
    check();
  });
}
```

---

## 四、商店系统

### 4.1 概述

商店系统分为数据层（`bridge/shop.js`）和 UI 层（`shop/index.js`），独立于 Phaser Scene。

### 4.2 道具列表

| ID | 名称 | 效果 | 每日限购 | 分类 |
|----|------|------|---------|------|
| `item-outline-lamp` | 探照灯 | 揭示4件轮廓 | 999 | 轮廓 |
| `item-outline-candle` | 蜡烛 | 揭示2件轮廓 | 999 | 轮廓 |
| `item-outline-torch` | 火把 | 揭示6件轮廓 | 3 | 轮廓 |
| `item-quality-needle` | 鉴定针 | 优先对铜器揭示3件品质 | 999 | 品质 |
| `item-quality-glass` | 放大镜 | 精确揭示1件品质 | 999 | 品质 |
| `item-cat-porcelain` | 瓷器图谱 | 优先对瓷器揭示3件轮廓 | 5 | 轮廓 |
| `item-cat-jade` | 玉器鉴书 | 优先对玉器揭示2件品质 | 5 | 品质 |
| `item-cat-bronze` | 铜器拓片 | 优先对铜器揭示4件轮廓 | 5 | 轮廓 |
| `item-cat-painting` | 书画残卷 | 优先对书画揭示3件品质 | 5 | 品质 |
| `item-cat-wood` | 木器图录 | 优先对木器揭示3件轮廓 | 5 | 轮廓 |
| `item-cat-stone` | 金石拓本 | 优先对金石揭示2件品质 | 5 | 品质 |

### 4.3 数据层 API

```javascript
// 购买道具
MobaoShopBridge.purchaseItem(itemId)
  → { ok: true, remaining: 98, moneyLeft: 850000 }
  → { ok: false, error: "余额不足" }

// 消耗道具
MobaoShopBridge.consumeItem(itemId)
  → { ok: true, remaining: 97 }
  → { ok: false, error: "库存不足" }

// 查询库存
MobaoShopBridge.getItemCount(itemId) → 98
MobaoShopBridge.getFullInventory() → { outlineLamp: 98, ... }

// 每日限购
MobaoShopBridge.getRemainingDaily(itemId) → { remaining: 2, maxDaily: 3 }

// 限时特惠
MobaoShopBridge.getLimitedOffers() → [
  { itemId: "item-outline-torch", originalPrice: 0, discountPrice: 0,
    badge: { type: "fire", label: "爆款", color: "#ff4444" }, purchased: false }
]

// 玩家资金
MobaoShopBridge.getPlayerMoney() → 3000000
```

### 4.4 限时特惠系统

```
每日零点刷新:
  │
  ├── 1. 从 SHOP_ITEMS 随机选择 4 个商品
  ├── 2. 为每个商品分配随机折扣:
  │     ├── 爆款: 10%~30% 折扣（红色）
  │     ├── 超值: 30%~50% 折扣（橙色）
  │     ├── 热卖: 50%~60% 折扣（黄色）
  │     └── 特惠: 60%~70% 折扣（金色）
  ├── 3. 每个特惠商品每日限购 1 次
  └── 4. 持久化到 localStorage（mobao_shop_limited_offer_v1）
```

### 4.5 商店 UI

```
┌─────────────────────────────────────────┐
│  商店                          金钱: 100万 │
├─────────────────────────────────────────┤
│  [全部] [背包] [特惠]                      │
├─────────────────────────────────────────┤
│  🔍 搜索道具...                           │
│  [全部] [轮廓] [品质] [揭示] ...           │
│  [默认排序 ▼]                             │
├─────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐             │
│  │ 🔦 探照灯  │  │ 🕯️ 蜡烛   │             │
│  │ 揭示4件轮廓 │  │ 揭示2件轮廓 │             │
│  │ 库存: 99   │  │ 库存: 99   │             │
│  │ [购买]    │  │ [购买]    │             │
│  └──────────┘  └──────────┘             │
│  ...                                     │
└─────────────────────────────────────────┘
```

### 4.6 存储键

| 存储键 | 内容 |
|--------|------|
| `mobao_shop_inventory_v1` | 道具库存 `{ outlineLamp: 99, ... }` |
| `mobao_shop_refresh_date_v1` | 每日购买记录 `{ date: "2026-06-05", purchases: {...} }` |
| `mobao_shop_limited_offer_v1` | 限时特惠数据 |
| `mobao_player_money_v1` | 玩家资金 |

---

## 五、结算系统

### 5.1 概述

`createSettlementBridge()`（`bridge/settlement.js`）管理拍卖结束后的结算页面。

### 5.2 结算流程

```
finishAuction(winner, mode)
  │
  ├── mode: "direct"（直接拿下）/ "final"（最终轮）/ "manual"
  │
  ├── 1. 标记 settled = true
  ├── 2. 计算结果:
  │     ├── winnerBid = winner.bid
  │     ├── totalValue = warehouseTrueValue
  │     ├── winnerProfit = totalValue - winnerBid
  │     └── 分红/门票判定:
  │           ├── winnerProfit < 0 → 分红（非拍下者各获亏损额 15%）
  │           └── winnerProfit > 0 → 门票（非拍下者各扣盈利额 5%）
  │
  ├── 3. 更新玩家资金
  ├── 4. 更新 AI 钱包
  ├── 5. 触发 AI 反思（triggerAiReflection）
  ├── 6. 保存战绩（saveBattleRecord）
  │
  └── 7. 进入结算页面 → enterSettlementPage()
```

### 5.3 结算页面

```
enterSettlementPage()
  │
  ├── 切换到 settlement-mode
  ├── 显示结算面板:
  │     ├── 成交信息（拍下者/出价/总值/利润）
  │     ├── 分红/门票信息
  │     └── 操作按钮（查看仓库/重开/返回大厅）
  │
  └── revealAllArtifactsForSettlement() ← 逐个揭示藏品
```

### 5.4 藏品揭示动画

```
revealAllArtifactsForSettlement()
  │
  ├── 1. 先批量揭示所有轮廓（跳过动画）
  │
  ├── 2. 按位置排序（从上到下，从左到右）
  │
  ├── 3. 逐个揭示品质（支持点击跳过）:
  │     ├── playSettlementSearchEffect(item) ← 搜索特效
  │     │     └── 金色旋转弧线，时长按品质:
  │     │           ├── 赝品: 360ms
  │     │           ├── 普品: 500ms
  │     │           ├── 良品: 680ms
  │     │           ├── 珍品: 920ms
  │     │           └── 绝品: 1250ms
  │     │
  │     ├── playSettlementRevealStep(item) ← 揭示步骤
  │     │     ├── 品质光晕闪烁（品质色 → 白色 → 品质色）
  │     │     ├── 藏品图片渐入
  │     │     └── 光环扩散动画
  │     │
  │     └── updateSettlementPanelMetrics() ← 更新面板指标
  │           ├── 已揭示价值
  │           └── 利润（实时更新）
  │
  └── 4. 全部揭示完成 → playSettlementFinalEffect()
```

### 5.5 庆祝特效

```
playSettlementFinalEffect()
  │
  ├── 条件: 赢家利润 > 0
  │
  ├── 金币爆发粒子（从底部向上喷射）
  │     └── 数量: 30~60 个，速度: 200~400px/s
  │
  ├── 星星粒子（从中心扩散）
  │     └── 数量: 15~30 个，旋转 + 缩放
  │
  ├── 上升粒子（缓慢上升的金色光点）
  │     └── 数量: 20~40 个
  │
  ├── 闪烁粒子（随机位置闪烁）
  │     └── 数量: 10~20 个
  │
  └── 绝品加成: 绝品数量 ≥ 3 时额外金色粒子
```

### 5.6 分红/门票机制

```
结算判定:
  │
  ├── 拍下者盈利 (winnerProfit > 0):
  │     └── 门票机制: 非拍下者各被扣除 winnerProfit × 5%
  │           └── ticketPerPlayer = Math.round(winnerProfit × 0.05)
  │
  └── 拍下者亏损 (winnerProfit < 0):
        └── 分红机制: 非拍下者各获得 |winnerProfit| × 15%
              └── dividendPerPlayer = Math.round(|winnerProfit| × 0.15)

示例:
  仓库总值: 412,000
  成交价: 320,000
  利润: +92,000（盈利）
  → 门票: 非拍下者各被扣除 92,000 × 5% = 4,600

  仓库总值: 180,000
  成交价: 320,000
  利润: -140,000（亏损）
  → 分红: 非拍下者各获得 140,000 × 15% = 21,000
```

---

## 六、战绩记录系统

### 6.1 概述

`createBattleRecordBridge()`（`bridge/battle-record.js`）管理对局结果的持久化存储和查看。

### 6.2 战绩数据结构

```javascript
// 单条战绩
{
  id: "rec-1717584000000",
  finishedAt: 1717584000000,       // 完成时间
  round: 5,                         // 总轮数
  mode: "solo",                     // 模式
  winnerId: "p2",                   // 赢家 ID
  winnerName: "玩家",               // 赢家名称
  winnerBid: 320000,                // 成交价
  totalValue: 412000,               // 仓库总值
  winnerProfit: 92000,              // 赢家利润
  playerProfit: -4600,              // 玩家利润（含分红/门票）
  playerWon: false,                 // 玩家是否赢
  dividendTicketInfo: {             // 分红/门票信息
    mechanism: "ticket",            // "dividend" | "ticket" | "none"
    dividendPerPlayer: 0,
    ticketPerPlayer: 4600
  },
  reasonText: "正常结束",           // 结束原因
  warehouse: {                      // 仓库快照
    cols: 12,
    rows: 25,
    itemCount: 15,
    items: [
      { id, x, y, w, h, category, qualityKey, basePrice, trueValue }
    ]
  },
  logs: {                           // AI 决策日志
    aiDecisionPanelText: "...",     // 面板文本快照
    runNo: 3,                       // 局号
    aiThoughtLogs: [...],           // AI 思考日志
    roundLogsByRound: {...},        // 按轮次日志
    roundPanelTexts: {...}          // 按轮次面板快照
  },
  logsRound: 5                      // 日志对应轮数
}
```

### 6.3 核心功能

| 功能 | 方法 | 说明 |
|------|------|------|
| 保存战绩 | `saveBattleRecord()` | 每局结算后自动调用，最多保留 20 条 |
| 加载战绩 | `loadBattleRecords()` | 从 localStorage 读取 |
| 打开面板 | `openBattleRecordPanel()` | 显示战绩摘要 + 详细列表 |
| AI 日志 | `openBattleRecordLogs(record)` | 按轮次查看 AI 决策详情 |
| 对局复现 | `openBattleRecordReplay(record)` | 从快照恢复仓库状态 |

### 6.4 战绩面板

```
┌─────────────────────────────────────┐
│  战绩记录                            │
├─────────────────────────────────────┤
│  总局数: 15  胜率: 33%               │
│  累计利润: +187,500                  │
│  最高单局: +92,000  最低: -45,000    │
├─────────────────────────────────────┤
│  #15  2026-06-05 14:30              │
│  玩家以32万拿下  总值41.2万          │
│  利润: +92,000  门票: -4,600        │
│  [查看日志] [复现]                   │
├─────────────────────────────────────┤
│  #14  2026-06-05 13:45              │
│  左上AI以28万拿下  总值18万          │
│  利润: -100,000  分红: +15,000      │
│  [查看日志] [复现]                   │
│  ...                                │
└─────────────────────────────────────┘
```

### 6.5 对局复现

```
openBattleRecordReplay(record)
  │
  ├── 1. 从 record.warehouse 恢复仓库布局
  │     ├── 创建 items 数组
  │     ├── 放置到网格
  │     └── 渲染到画布
  │
  ├── 2. 显示结算信息
  │     ├── 成交价、总值、利润
  │     └── 分红/门票
  │
  └── 3. 可触发结算揭示动画
        └── revealAllArtifactsForSettlement()
```

---

## 七、游戏设置参数

### 7.1 核心参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `bidStep` | 100 | 出价步长（出价必须是其整数倍） |
| `maxRounds` | 5 | 最大出价轮数 |
| `directTakeRatio` | 0.2 | 直接拿下系数（最高出价 ≥ 第二高 × (1+此值)） |
| `bidRevealIntervalMs` | 650 | 出价揭示间隔（毫秒） |
| `postRevealWaitMs` | 3000 | 揭示后等待时间（毫秒） |
| `roundSeconds` | 60 | 每轮出价时限（秒） |

### 7.2 设置持久化

```javascript
// 加载设置
MobaoSettings.loadGameSettings()
  → { bidStep: 100, maxRounds: 5, directTakeRatio: 0.2, roundSeconds: 60, ... }

// 保存设置
MobaoSettings.saveGameSettings(settings)

// 归一化（确保所有字段合法）
MobaoSettings.normalizeGameSettings(settings)
```

---

## 八、bridge 层设计模式对比

### 8.1 三种实现方式

| 文件 | 模式 | 全局变量 | 依赖注入 | 优缺点 |
|------|------|---------|---------|--------|
| `bridge/shop.js` | IIFE 单例 | `window.MobaoShopBridge` | 无 | 简单直接，但全局污染 |
| `bridge/settlement.js` | 工厂函数 | `window.MobaoSettlement` | 有（deps 参数） | 解耦好，可测试 |
| `bridge/battle-record.js` | 工厂函数 | `window.MobaoBattleRecord` | 有（deps 参数） | 解耦好，可测试 |

### 8.2 main.js 中的桥接器创建

```javascript
// main.js create() 中
const SETTLEMENT_BRIDGE = createSettlementBridge({
  MARGIN, CELL_SIZE, delay, tweenToPromise,
  settlementRevealDelayByQuality, settlementSearchDurationByQuality
});
Object.assign(this, SETTLEMENT_BRIDGE);

const BATTLE_RECORD_BRIDGE = createBattleRecordBridge({
  BATTLE_RECORD_STORAGE_KEY, GRID_COLS, GRID_ROWS,
  clamp, escapeHtml, formatBidRevealNumber
});
Object.assign(this, BATTLE_RECORD_BRIDGE);

// shop.js 直接通过全局变量访问
MobaoShopBridge.purchaseItem(itemId);
```
