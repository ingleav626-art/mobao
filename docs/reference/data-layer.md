# 数据层文档

> 本文档详细描述游戏的数据定义与核心基础设施，包括常量、设置、工具函数、藏品数据、角色系统、技能/道具、地图配置和公共事件。

---

## 一、数据层总览

### 1.1 文件清单

| 目录 | 文件 | 设计模式 | 职责 |
|------|------|---------|------|
| core/ | constants.ts | IIFE 单例 | 全局常量（网格、存储键、品质） |
| core/ | settings.ts | IIFE 单例 | 游戏设置与玩家资金 |
| core/ | app-state.ts | IIFE 单例 | 应用全局状态 |
| core/ | utils.ts | IIFE 单例 | 工具函数库 |
| data/ | artifacts.ts | IIFE 单例 + 类 | 藏品图鉴与生成管理 |
| data/ | characters.ts | IIFE 单例 | 角色静态数据 |
| data/ | character-system.ts | IIFE 单例 | 角色运行时逻辑 |
| data/ | skills.ts | IIFE 单例 + 类 | 技能定义与使用管理 |
| data/ | items.ts | IIFE 单例 + 类 | 道具定义与使用管理 |
| data/ | map-profiles.ts | IIFE 单例 | 地图配置定义 |
| data/ | public-events.ts | IIFE 单例 | 公共事件生成 |

### 1.2 依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                      所有模块                                │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐      ┌──────────────────────┐
│   MobaoUtils        │      │  MobaoConstants       │
│   (工具函数)         │      │  (全局常量)            │
└──────────┬──────────┘      └──────────┬───────────┘
           │                             │
           ▼                             ▼
┌─────────────────────┐      ┌──────────────────────┐
│   MobaoSettings     │◄─────│  存储键名              │
│   (游戏设置)         │      │  网格参数              │
└──────────┬──────────┘      │  品质定义              │
           │                 └──────────────────────┘
           ▼
┌─────────────────────┐      ┌──────────────────────┐
│   MobaoAppState     │      │  ArtifactData         │
│   (应用状态)         │      │  (藏品数据+管理器)     │
└──────────┬──────────┘      └──────────┬───────────┘
           │                             │
           ▼                             ▼
┌─────────────────────┐      ┌──────────────────────┐
│  MobaoMapProfiles   │      │  CharacterData        │
│  (地图配置)          │      │  (角色静态数据)        │
└─────────────────────┘      └──────────┬───────────┘
                                      │
                             ┌────────▼───────────┐
                             │  CharacterSystem    │
                             │  (角色运行时)        │
                             └────────────────────┘
```

---

## 二、核心层（core/）

### 2.1 常量定义（constants.ts）

#### 仓库网格布局

| 常量 | 值 | 说明 |
|------|-----|------|
| GRID_COLS | 12 | 仓库列数 |
| GRID_ROWS | 25 | 仓库行数 |
| CELL_SIZE | 64 | 单元格像素大小 |
| MARGIN | 0 | 画布边距 |
| CANVAS_NATIVE_HEIGHT | 1600 | 画布原生高度（= MARGIN×2 + ROWS×CELL_SIZE） |
| MAX_WAREHOUSE_CELLS | 300 | 仓库最大格子数（容量上限检查） |
| ARTIFACT_COUNT_RANGE | {min:50, max:300} | 藏品数量范围 |
| WAREHOUSE_OCCUPANCY_RATIO_RANGE | {min:0.38, max:0.88} | 仓库占用率范围 |

#### 存储键名

| 常量 | 值 | 用途 |
|------|-----|------|
| SETTINGS_STORAGE_KEY | `mobao_settings_v2` | 游戏设置 |
| PLAYER_MONEY_STORAGE_KEY | `mobao_player_money_v1` | 玩家资金 |
| AI_LLM_SWITCH_STORAGE_KEY | `mobao_ai_llm_switch_v1` | AI LLM 开关 |
| BATTLE_RECORD_STORAGE_KEY | `mobao_battle_records_v1` | 战绩记录 |
| AI_MEMORY_STORAGE_KEY | `mobao_ai_memory_v1` | AI 记忆 |

#### 品质系统

```javascript
QUALITY_COLORS = {
  poor:      0x8b7355,  // 灰棕
  normal:    0x6b8e23,  // 橄榄绿
  fine:      0x4169e1,  // 皇家蓝
  rare:      0x9932cc,  // 紫色
  legendary: 0xffd700   // 金色
}

QUALITY_ORDER = ["poor", "normal", "fine", "rare", "legendary"]

QUALITY_LABELS = {
  poor: "粗", normal: "良", fine: "精", rare: "珍", legendary: "绝"
}
```

### 2.2 游戏设置（settings.ts）

#### 默认设置

| 参数 | 默认值 | 合法范围 | 说明 |
|------|--------|---------|------|
| maxRounds | 5 | 3~12 | 最大出价轮数 |
| actionsPerRound | 99 | 1~999 | 每回合行动次数 |
| roundSeconds | 60 | 10~180 | 回合秒数 |
| directTakeRatio | 0.2 | 0.05~0.6 | 直接拿下比例 |
| bidRevealIntervalMs | 650 | 250~1800 | 出价揭示间隔(ms) |
| postRevealWaitMs | 3000 | 800~6000 | 揭示后等待(ms) |
| bidStep | 100 | 10~10000 | 出价步长 |
| bidDefaultRaise | 500 | 0~50000 | 默认加价 |
| settlementSpeedMultiplier | 1 | 0.5~3 | 结算速度倍率 |
| musicVolume | 70 | 0~100 | 音乐音量 |
| sfxVolume | 80 | 0~100 | 音效音量 |

#### 设置规范化

```
normalizeGameSettings(source, fallback)
  │
  ├── 对每个字段:
  │     ├── 优先使用 source 中的值
  │     ├── source 缺失则使用 fallback
  │     └── clamp 到合法范围
  │
  └── 返回规范化后的完整设置对象
```

#### 玩家资金

```
loadPlayerMoney()
  ├── localStorage 中无记录 → 返回 DEFAULT_START_MONEY (3,000,000)
  ├── 值为 0 且无结算标记 → 返回 DEFAULT_START_MONEY（首次进入）
  └── 正常值 → 返回 Math.round(parsed)

savePlayerMoney(value)
  └── localStorage 写入 Math.max(0, Math.round(value))
```

### 2.3 应用状态（app-state.ts）

#### 状态结构

```javascript
DEFAULT_STATE = {
  appMode: "lobby",              // 当前模式
  gameSource: null,              // 游戏来源
  lobbyTab: "solo",              // 大厅标签页
  selectedMapProfile: "default", // 地图配置 ID
  lastPlayedAt: null,            // 最后游玩时间
  totalGamesPlayed: 0,           // 总局数
  totalWins: 0,                  // 胜场数
  totalProfit: 0                 // 累计利润
}
```

#### API

| 方法 | 说明 |
|------|------|
| `load()` | 从 localStorage 加载完整状态 |
| `save(state)` | 保存完整状态 |
| `patch(partial)` | 合并部分字段并保存 |
| `get(key)` | 读取单个字段 |
| `set(key, value)` | 写入单个字段 |
| `reset()` | 恢复默认状态 |
| `recordGameFinished(won, profit)` | 更新游戏统计 |

### 2.4 工具函数（utils.ts）

#### 通用工具

| 函数 | 签名 | 说明 |
|------|------|------|
| shuffle | `(list) → []` | Fisher-Yates 洗牌，返回新数组 |
| delay | `(ms) → Promise` | Promise 化 setTimeout |
| tweenToPromise | `(scene, targets, config) → Promise` | Promise 化 Phaser tween |
| clamp | `(value, min, max) → number` | 数值截断 |
| roundToStep | `(value, step) → number` | 按步长取整 |
| pickFirstDefined | `(...values) → any` | 取第一个非 null/undefined |

#### 网格/坐标

| 函数 | 签名 | 说明 |
|------|------|------|
| toCellKey | `(x, y) → "x,y"` | 坐标转字符串键 |
| fromCellKey | `(key) → {x,y}` | 字符串键转坐标 |
| sizeTagToCellCount | `("3x2") → 6` | 尺寸标签转格子数 |

#### 格式化

| 函数 | 签名 | 说明 |
|------|------|------|
| formatTrackIndex | `(1) → "一"` | 数字转中文序号 |
| rgbHex | `(0xffd700) → "#ffd700"` | Phaser 颜色转 CSS hex |
| formatCompactNumber | `(1500000) → "1.5M"` | 紧凑数字格式 |
| formatBidRevealNumber | `(value) → string` | 出价显示（≥1M 紧凑，否则千分位） |
| trimTrailingZero | `("3.0") → "3"` | 去掉 ".0" 后缀 |

#### AI/LLM 辅助

| 函数 | 签名 | 说明 |
|------|------|------|
| normalizeActionToken | `(value) → string` | 动作名归一化（去空格/标点/小写） |
| isNoneActionText | `(value) → boolean` | 判断是否为"无操作"文本 |
| safeParseJson | `(text) → object\|null` | 安全 JSON 解析 |
| tryExtractDecisionJson | `(rawText) → object\|null` | 从 LLM 回复提取 JSON |
| createEmptyAiPrivateIntelPool | `() → object` | 创建空 AI 私有情报池 |

#### tryExtractDecisionJson 提取策略

```
tryExtractDecisionJson(rawText)
  │
  ├── 1. 直接解析: JSON.parse(rawText.trim())
  │
  ├── 2. 代码块提取: 匹配 ```json ... ```
  │
  ├── 3. 首尾花括号: 找到第一个 { 和最后一个 } 之间的内容
  │
  └── 4. 全部失败 → 返回 null
```

#### 品质时长函数

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| qualityPulseDuration | qualityKey | 300~800ms | 品质脉冲动画时长 |
| settlementRevealDelayByQuality | qualityKey | 400~1600ms | 结算揭示延迟（受速度倍率影响） |
| settlementSearchDurationByQuality | qualityKey | 600~2000ms | 结算搜索动画时长（受速度倍率影响） |

---

## 三、藏品数据（artifacts.ts）

### 3.1 品质配置

```javascript
QUALITY_CONFIG = {
  poor:      { label: "粗品", color: 0x9f9f9f, glow: 0xdcdcdc, weight: 28 },
  normal:    { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 34 },
  fine:      { label: "精品", color: 0x12b46d, glow: 0x8ae4bf, weight: 22 },
  rare:      { label: "珍品", color: 0xf0a300, glow: 0xffd56f, weight: 12 },
  legendary: { label: "绝品", color: 0xf04242, glow: 0xffa0a0, weight: 4 }
}
// weight 总和 = 100，作为随机生成的概率权重
```

### 3.2 品类体系

```
藏品品类（10 个，2 大类）
├── 古董（6 个品类）
│   ├── 瓷器（16 件）  ← 最多
│   ├── 玉器（12 件）
│   ├── 书画（11 件）
│   ├── 铜器（12 件）
│   ├── 木器（10 件）
│   └── 金石（9 件）
│
└── 珠宝首饰（4 个品类）
    ├── 宝石（8 件）
    ├── 有机宝石（6 件）
    ├── 贵金属（7 件）
    └── 镶嵌饰品（9 件）

总计: 70+ 件藏品
```

### 3.3 品类权重

```javascript
CATEGORY_WEIGHTS = {
  "瓷器": 22, "玉器": 18, "书画": 16,
  "铜器": 17, "木器": 14, "金石": 13,
  "宝石": 8, "有机宝石": 6, "贵金属": 7, "镶嵌饰品": 9
}
// 古董类权重合计 100，珠宝类权重合计 30
```

### 3.4 藏品图鉴条目结构

```javascript
{
  key: "porcelain-fanhong-zun",  // 唯一键（对应缩略图文件名）
  majorCategory: "古董",          // 大类
  category: "瓷器",               // 品类
  name: "矾红尊",                 // 名称
  basePrice: 5100,                // 基础价格
  qualityKey: "rare",             // 品质
  w: 1, h: 2                     // 尺寸（宽×高，单位格）
}
```

### 3.5 ArtifactManager 类

#### 核心方法

| 方法 | 说明 |
|------|------|
| `createRandomArtifact()` | 按品类权重随机生成藏品 |
| `createRandomArtifactForSlot(opts)` | 在指定槽位生成可放置的藏品 |
| `buildArtifactFromDef(def)` | 从图鉴定义构建藏品实例（含自增 ID） |
| `getCandidatesByRevealState(state)` | 按揭示状态筛选候选藏品 |
| `getCandidateStatsByRevealState(state)` | 候选价格统计 |
| `getSignalPriceStats(signals)` | 信号价格聚合分析 |

#### 藏品生成流程

```
createRandomArtifactForSlot({ col, row, gridCols, gridRows, occupancy,
                               categoryWeights, qualityWeights })
  │
  ├── 1. 按权重随机选择品类
  │     └── categoryWeights || CATEGORY_WEIGHTS
  │
  ├── 2. 按权重随机选择品质
  │     └── qualityWeights || QUALITY_CONFIG[qualityKey].weight
  │
  ├── 3. 从 ARTIFACT_LIBRARY 筛选匹配品类+品质的藏品
  │
  ├── 4. 尝试放置:
  │     ├── canPlaceRect(col, row, w, h, gridCols, gridRows, occupancy)
  │     ├── 放置成功 → buildArtifactFromDef(def)
  │     └── 放置失败 → 尝试下一个候选
  │
  └── 5. 无候选可放 → 返回 null
```

#### 候选价格统计

```
summarizeCandidatePrices(candidates)
  │
  ├── 计算: 均值、中位数、标准差
  ├── 分位数: P25, P50, P75
  ├── 离散度: (P75 - P25) / P50
  └── 边缘比: (最高价 - 最低价) / 均价

返回: {
  count, mean, median, stdDev,
  p25, p50, p75, dispersion, edgeRatio,
  min, max
}
```

### 3.6 品质价格估算

```javascript
estimatePriceByQuality(basePrice, qualityKey)
  // poor:      ×0.72
  // normal:    ×0.88
  // fine:      ×1.15
  // rare:      ×1.45
  // legendary: ×1.85
```

---

## 四、角色系统

### 4.1 数据层（characters.ts）与运行时（character-system.ts）分离

```
characters.ts (纯数据)          character-system.ts (运行时)
┌──────────────────┐            ┌──────────────────────┐
│ CHARACTERS 数组   │◄──────────│ getActiveCharacter()  │
│ getCharacterById │            │ selectCharacter(id)   │
│ getUnlockedChars │            │ applyPassiveEffect()  │
│ saveSelectedChar │            │ getOutlineBonus()     │
└──────────────────┘            │ getQualityBonus()     │
                                │ resetForNewGame()     │
                                └──────────────────────┘
```

### 4.2 角色列表

| ID | 名称 | 技能 | 被动 |
|----|------|------|------|
| appraiser | 鉴定师 | 玉脉鉴质（玉器品质+2） | 盈利加成+10% |
| scout | 探子 | 拓影侦测（轮廓+3） | 轮廓揭示+1 |
| seeker | 觅踪者 | 鉴踪直取（揭示最大1件全部信息） | 轮廓探测优先最小 |

### 4.3 角色数据结构

```javascript
{
  id: "appraiser",
  name: "鉴定师",
  desc: "精准识宝，稳扎稳打",
  avatar: "assets/images/characters/.../character-appraiser-avatar.png",
  live2d: "assets/images/characters/live2D/character-appraiser-live2d.webm",
  skillId: "skill-quality-jade",
  skillName: "玉脉鉴质",
  skillDesc: "优先对玉器揭示2件品质格",
  passive: { type: "profitBonus", value: 0.10, label: "盈利加成+10%" },
  unlockCondition: "default",
  unlocked: true
}
```

### 4.4 被动技能效果

| 被动类型 | 效果 | 应用位置 |
|---------|------|---------|
| `profitBonus` | 利润加成（如 +10%） | 结算时计算利润 |
| `outlineBonus` | 轮廓揭示数量 +1 | 使用轮廓揭示道具/技能时 |
| `qualityBonus` | 品质揭示加成 | 使用品质揭示道具/技能时 |
| `outlineSmallestPriority` | 轮廓探测优先最小 | 揭示目标排序策略 |
| `bidBonus` | 出价加成 | 出价计算 |

### 4.5 运行时 API

```javascript
CharacterSystem.selectCharacter("seeker")     // 选择角色
CharacterSystem.getActiveCharacter()           // 获取当前角色对象
CharacterSystem.getActiveCharacterId()         // 获取当前角色 ID
CharacterSystem.getActiveSkillId()             // 获取当前技能 ID
CharacterSystem.getActivePassive()             // 获取被动技能
CharacterSystem.getDisplayName()               // "觅踪者"
CharacterSystem.getDisplayAvatar()             // 头像 URL
CharacterSystem.getAvatarLabel()               // "觅"
CharacterSystem.getOutlineBonus()              // 轮廓加成数
CharacterSystem.getQualityBonus()              // 品质加成数
CharacterSystem.getOutlineSortStrategy()       // "smallestFirst" | null
CharacterSystem.applyPassiveEffect(context)    // 应用被动效果
CharacterSystem.formatProfitWithBonus(profit)  // 格式化含加成的利润
CharacterSystem.resetForNewGame()              // 重置局内累计
```

---

## 五、技能系统（skills.ts）

### 5.1 技能定义

| ID | 名称 | 效果 | 每回合可用 | 对应角色 |
|----|------|------|-----------|---------|
| skill-outline-scan | 拓影侦测 | 揭示3件轮廓 | 99 | scout |
| skill-quality-jade | 玉脉鉴质 | 玉器品质+2（不足补其他） | 99 | appraiser |
| skill-reveal-largest | 鉴踪直取 | 揭示最大1件全部信息 | 99 | seeker |

### 5.2 SkillManager 类

```javascript
class SkillManager {
  constructor()       // 初始化技能列表（每项含 remainingThisRound）
  resetForNewRun()    // 重置所有技能的回合使用次数
  onNewRound()        // 新回合开始时重置使用次数
  use(skillId, context)  // 使用技能（扣减次数 + 执行揭示）
  getSkillState()     // 获取所有技能的当前状态
}
```

### 5.3 技能执行机制

```
use(skillId, context)
  │
  ├── 1. 查找技能定义
  ├── 2. 检查 remainingThisRound > 0
  ├── 3. 调用 skill.execute(context)
  │     ├── skill-outline-scan: context.revealOutline({ count: 3 })
  │     ├── skill-quality-jade: context.revealQuality({ count: 2, category: "玉器", allowCategoryFallback: true })
  │     └── skill-reveal-largest: context.revealAll({ count: 1, sortStrategy: "largestFirst" })
  │
  ├── 4. 扣减 remainingThisRound
  └── 5. 返回 { ok, revealed, message }
```

---

## 六、道具系统（items.ts）

### 6.1 道具定义

| ID | 名称 | 效果 | 初始数量 | 对应技能参数 |
|----|------|------|---------|------------|
| item-outline-lamp | 探照灯 | 揭示4件轮廓 | 99 | revealOutline({count:4}) |
| item-outline-candle | 蜡烛 | 揭示2件轮廓 | 99 | revealOutline({count:2}) |
| item-outline-torch | 火把 | 揭示6件轮廓 | 99 | revealOutline({count:6}) |
| item-quality-needle | 鉴定针 | 铜器品质+3 | 99 | revealQuality({count:3,category:"铜器"}) |
| item-quality-glass | 放大镜 | 品质1件 | 99 | revealQuality({count:1}) |
| item-cat-porcelain | 瓷器图谱 | 瓷器轮廓+3 | 99 | revealOutline({count:3,category:"瓷器"}) |
| item-cat-jade | 玉器鉴书 | 玉器品质+2 | 99 | revealQuality({count:2,category:"玉器"}) |
| item-cat-bronze | 铜器拓片 | 铜器轮廓+4 | 99 | revealOutline({count:4,category:"铜器"}) |
| item-cat-painting | 书画残卷 | 书画品质+3 | 99 | revealQuality({count:3,category:"书画"}) |
| item-cat-wood | 木器图录 | 木器轮廓+3 | 99 | revealOutline({count:3,category:"木器"}) |
| item-cat-stone | 金石拓本 | 金石品质+2 | 99 | revealQuality({count:2,category:"金石"}) |

### 6.2 ItemManager 类

```javascript
class ItemManager {
  constructor()       // 初始化道具列表（每项含 count）
  resetForNewRun()    // 重置所有道具数量为初始值
  use(itemId, context)  // 使用道具（扣减数量 + 执行揭示）
  getItemState()     // 获取所有道具的当前状态
}
```

### 6.3 技能 vs 道具对比

| 维度 | 技能 | 道具 |
|------|------|------|
| 绑定 | 角色绑定（每个角色1个技能） | 通用（所有角色可用） |
| 数量限制 | 每回合可用次数 | 库存数量 |
| 来源 | 角色自带 | 商店购买 / 初始库存 |
| 管理器 | SkillManager | ItemManager |
| 持久化 | 不持久化（每局重置） | MobaoShopBridge 持久化 |

---

## 七、地图配置（map-profiles.ts）

### 7.1 地图列表

| ID | 名称 | 回合 | 直接拿下 | 品质特点 | 品类特点 |
|----|------|------|---------|---------|---------|
| default | 废弃仓库 | 5 | 0.2 | 均衡正态 | 均衡 |
| treasure-vault | 珍宝密室 | 6 | 0.25 | rare+legendary 高 | 玉器多 |
| junkyard | 废品角落 | 4 | 0.15 | poor 42% | 木器多 |
| scholar-study | 书斋雅集 | 5 | 0.2 | 均衡 | 书画32% |

### 7.2 地图参数结构

```javascript
{
  id: "default",
  name: "废弃仓库",
  desc: "均衡配置，适合入门",
  icon: "🏚️",
  background: "game-warehouse.png",
  params: {
    maxRounds: 5,
    directTakeRatio: 0.2,
    qualityWeights: {
      poor: 28, normal: 34, fine: 22, rare: 12, legendary: 4
    },
    categoryWeights: {
      "瓷器": 22, "玉器": 18, "书画": 16,
      "铜器": 17, "木器": 14, "金石": 13
    }
  }
}
```

### 7.3 地图参数如何影响游戏

```
选择地图 → MobaoMapProfiles.setSelectedProfileId(id)
  │
  ├── main.ts create() 中读取:
  │     ├── params.maxRounds → GAME_SETTINGS.maxRounds
  │     ├── params.directTakeRatio → GAME_SETTINGS.directTakeRatio
  │     ├── params.qualityWeights → this._mapQualityWeights
  │     └── params.categoryWeights → this._mapCategoryWeights
  │
  └── spawnRandomItems() 中使用:
        ├── qualityWeights → 影响藏品品质分布
        └── categoryWeights → 影响藏品品类分布
```

---

## 八、公共事件系统（public-events.ts）

### 8.1 概述

根据仓库藏品分布自动生成公共情报事件，为玩家提供对局背景信息。

### 8.2 仓库分析

```
analyzeWarehouse(items)
  │
  ├── 基础统计: 总数、总值、均价
  ├── 品类分布: { "瓷器": 5, "玉器": 3, ... }
  ├── 品质分布: { poor: 8, normal: 12, ... }
  ├── 尺寸分布: { "1x1": 10, "2x2": 3, ... }
  ├── 高价值数量: price ≥ 6000 的件数
  ├── 低价值数量: price ≤ 2000 的件数
  ├── 最大/最小价格
  └── 是否有绝品/珍品
```

### 8.3 事件类型与优先级

| 优先级 | 事件 | 触发条件 |
|--------|------|---------|
| 100 | 绝品存在 | hasLegendary = true |
| 90 | 珍品≥2 | rareCount ≥ 2 |
| 85 | 高价值≥3 | highValueItems ≥ 3 |
| 75 | 品质较高 | fine+rare+legendary 占比 > 40% |
| 70 | 品类主导 | 某品类占比 > 30% |
| 65 | 超大件 | 存在 3×2 或更大藏品 |
| 60 | 最高估值 | maxPrice ≥ 10000 |
| 55 | 品质偏低 | poor 占比 > 35% |
| 55 | 大件≥3 | largeItems ≥ 3 |
| 50 | 品类≥5 | 品类数 ≥ 5 |
| 45 | 仓库密集/稀疏 | 占用率 > 75% 或 < 45% |
| 40 | 仓库统计 | 总是触发 |
| 35 | 捡漏提示 | lowValueItems ≥ 5 |

### 8.4 事件生成流程

```
generateEvents(items, gridCols, gridRows)
  │
  ├── 1. analyzeWarehouse(items) → 分析数据
  ├── 2. 按分析结果逐条检查触发条件
  ├── 3. 生成事件对象 { id, text, category, priority }
  ├── 4. 按 priority 降序排列
  └── 5. 返回事件列表

pickRandomPublicEvent(items, gridCols, gridRows)
  └── 从前 5 个事件中随机选 1 个

pickMultiplePublicEvents(items, gridCols, gridRows, count)
  └── 取前 count 个事件
```

### 8.5 事件数据结构

```javascript
{
  id: "legendary-exists",
  text: "据说这间仓库中藏有绝品，价值连城。",
  category: "quality",
  priority: 100
}
```

---

## 九、存储键汇总

| 存储键 | 模块 | 内容 |
|--------|------|------|
| `mobao_settings_v2` | settings.ts | 游戏设置 |
| `mobao_player_money_v1` | settings.ts | 玩家资金 |
| `mobao_app_state_v1` | app-state.ts | 应用全局状态 |
| `mobao_carry_items_v1` | constants.ts | 携带道具 |
| `mobao_selected_character_v1` | characters.ts | 选中角色 ID |
| `mobao_battle_records_v1` | battle-record.ts | 战绩记录 |
| `mobao_ai_llm_switch_v1` | constants.ts | AI LLM 开关 |
| `mobao_ai_memory_v1` | constants.ts | AI 记忆 |
| `mobao_shop_inventory_v1` | shop.ts | 商店道具库存 |
| `mobao_shop_refresh_date_v1` | shop.ts | 每日购买记录 |
| `mobao_shop_limited_offer_v1` | shop.ts | 限时特惠数据 |
| `mobao_money_settled_run` | settings.ts | 资金结算标记 |
