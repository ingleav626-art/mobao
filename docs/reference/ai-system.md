# AI 系统文档

> 本文档详细描述游戏中 AI 系统的完整架构，包括规则 AI 出价引擎、LLM AI 决策系统、
> 情报系统、记忆系统、反思系统、决策日志，以及 LLM Provider 调度层。

---

## 一、AI 系统总览

### 1.1 双引擎架构

游戏 AI 采用**规则引擎 + LLM 引擎**的双引擎架构：

```
                    ┌──────────────────────┐
                    │  kickoffAiRound      │
                    │  Decisions()         │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  buildAIBids()       │ ← 规则 AI 先计算所有 AI 出价
                    │  (ai/bidding.ts)     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
              No    │  LLM 开关启用？      │
           ┌────────┤                      ├────────┐ Yes
           │        └──────────────────────┘        │
           │                                         │
     使用规则 AI 出价                      ┌──────────▼───────────┐
                                          │  requestLlmDecision()│ ← LLM 覆盖出价
                                          │  (llm/core/scene-llm.ts)  │
                                          └──────────┬───────────┘
                                                     │
                                          ┌──────────▼───────────┐
                                          │  LLM 返回有效出价？   │
                                          └──┬──────────────┬────┘
                                        Yes  │              │ No
                                             │              │
                                       覆盖规则 AI 出价    保留规则 AI 出价
```

**核心原则**：规则 AI 是保底，LLM AI 是增强。LLM 失败时自动回退到规则 AI 结果。

### 1.2 文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `ai/bidding.ts` | 类 (AuctionAiEngine) | 规则 AI 出价引擎 |
| `ai/wallet.ts` | Mixin | AI 钱包管理 |
| `ai/intel.ts` | Mixin | AI 情报系统 |
| `ai/memory.ts` | Mixin | AI 跨局记忆 |
| `ai/reflection.ts` | Mixin | AI 局后反思 |
| `ai/decision.ts` | Mixin | 决策日志与调试面板 |
| `llm/core/scene-llm.ts` | IIFE/工厂函数 | LLM 场景桥接器 |
| `llm/core/llm-manager.ts` | IIFE/单例 | LLM Provider 管理器 |
| `llm/core/llm-ui-bridge.ts` | IIFE | LLM 设置 UI |
| `llm/providers/deepseek-provider.ts` | IIFE | DeepSeek Provider |
| `llm/providers/openai-provider.ts` | IIFE | OpenAI Provider |
| `llm/providers/qwen-provider.ts` | IIFE | 通义千问 Provider |
| `llm/providers/glm-provider.ts` | IIFE | 智谱 GLM Provider |
| `llm/providers/kimi-provider.ts` | IIFE | Kimi Provider |
| `llm/providers/deepseek-llm.ts` | IIFE | DeepSeek 旧版客户端（兼容） |

---

## 二、规则 AI 出价引擎

### 2.1 概述

`AuctionAiEngine`（`ai/bidding.ts`）是规则 AI 的核心，不依赖 LLM，纯数学模型出价。

### 2.2 人格系统

每个 AI 玩家拥有固定人格，决定其出价风格：

| 人格 | 代号 | 激进 | 纪律 | 跟风 | 虚张声势 | 失误率 | 锚点范围 | 特点 |
|------|------|------|------|------|----------|--------|----------|------|
| 稳算师 | p1 | 0.58 | 0.86 | 0.32 | 0.18 | 0.04 | 1.24~1.72 | 保守理性，锚点低 |
| 猛冲客 | p3 | 0.84 | 0.62 | 0.56 | 0.30 | 0.08 | 1.42~1.98 | 激进跟风，锚点高 |
| 机变派 | p4 | 0.54 | 0.88 | 0.26 | 0.24 | 0.05 | 1.20~1.78 | 灵活适应，中庸 |

**人格参数详解**：

| 参数 | 含义 | 影响范围 |
|------|------|----------|
| `aggression` | 激进程度 | 压力调整、过热评估、价格上限 |
| `discipline` | 纪律性 | 噪声干扰、心理预期、价格上限 |
| `followRate` | 跟风倾向 | 趋势调整、心理预期 |
| `bluffRate` | 虚张声势 | 前期藏价概率 |
| `errorRate` | 失误率 | 噪声干扰幅度 |
| `anchorMin/Max` | 锚点范围 | 初始锚点出价（相对于市场参考价的倍数） |
| `openRaiseRatio` | 开局抬价率 | 首轮出价加成 |
| `crowdBias` | 群体偏差 | 多样性调整方向 |
| `expectationElasticity` | 预期弹性 | 心理预期适应速度 |
| `retreatFactor` | 退却因素 | 过热回撤程度 |
| `noInfoAdjustMin/Max` | 无信息调整 | 线索率低时的随机调整范围 |

### 2.3 出价算法（8 步流程）

```
输入：playerId, clueRate, qualityRate, uncertainty, spreadRatio,
      upperEdge, lowerEdge, roundProgress, currentBid, marketRef,
      persona, bidStep, toolEffect

Step 1: 市场参考价 marketRef
  └── marketReference(currentBid, lastRoundBids, startingBid)
      = 当前出价 × 0.55 + 上轮最高出价 × 0.35 + 起拍价 × 0.1

Step 2: 信心 confidence（10 个分项加权）
  ├── base: 0.32（基础信心）
  ├── clue: clueRate × 0.28（线索贡献）
  ├── quality: qualityRate × 0.18（品质贡献）
  ├── progress: roundProgress × 0.12（轮次进度）
  ├── market: marketDeviation × 0.08（市场偏差）
  ├── tool: toolEffect.confidenceBoost × 0.22（工具效果）
  ├── edgeBonus: (upperEdge - lowerEdge) × 0.06（边缘信号奖励）
  ├── spreadPenalty: -spreadRatio × 0.10（波动惩罚）
  ├── uncertaintyPenalty: -uncertainty × 0.14（不确定性惩罚）
  └── mood: 随机情绪波动 [-0.03, +0.03]
  → 总信心 = Σ 各项，clamp 到 [0.08, 0.92]

Step 3: 感知价值 perceivedValue
  ├── baseEstimate = anchorBid × (0.82 + confidence×0.52 + qualityRate×0.18 + edgeSignal×0.12)
  ├── trendAdjust = marketRef × (0.08 + followRate×0.2 + toolFollowBoost×0.25)
  ├── pressureAdjust = currentBid × roundProgress × (0.015 + aggression×0.06 + toolAggression×0.12)
  ├── perceivedValue = baseEstimate + trendAdjust + pressureAdjust
  └── 噪声干扰: perceivedValue × randomBetween(1-noiseBand, 1+noiseBand)
      noiseBand = ((1-discipline)×0.18 + errorRate×0.72) × (1+uncertainty×0.28) × (1-spread×0.22)

Step 4: 心理预期 psychExpectedBid
  ├── targetPsychExpected = anchorBid×(0.64+discipline×0.22) + marketRef×(0.2+followRate×0.17) + currentBid×(...)
  ├── adaptRate = 0.12 + confidence×0.24 + elasticity×0.18 + toolConfidence×0.25 - spread×0.08
  └── psychExpectedBid += (target - current) × adaptRate（逐步适应）

Step 5: 过热评估
  ├── overheatThreshold = 0.04 + (1-confidence)×0.1 + uncertainty×0.1 + spread×0.06
  │                      - aggression×0.03 + discipline×0.02 - toolUncertaintyReduction×0.09
  ├── overheatRatio = (currentBid - psychExpectedBid) / psychExpectedBid
  └── isOverheated = overheatRatio > overheatThreshold

Step 6: 价格上限 hardCap
  ├── perceivedCap = perceivedValue × (0.82 + discipline×0.1 + qualityRate×0.08)
  ├── anchorCap = anchorBid × (0.92 + confidence×0.18 + edgeSignal×0.1)
  ├── psychCap = psychExpectedBid × (1.05 + discipline×0.08)
  └── hardCap = min(perceivedCap, anchorCap, psychCap, marketCap)

Step 7: 最终出价
  ├── rawBid = max(currentBid, perceivedValue × adjustment)
  ├── 若过热: rawBid = min(rawBid, psychExpectedBid × retreatFactor)
  ├── rawBid = min(rawBid, hardCap)
  └── finalBid = roundToStep(rawBid, bidStep)

Step 8: 群体多样性调整
  └── applyCrowdDiversity(): 根据 crowdBias 和人格参数微调，避免 AI 出价扎堆
```

### 2.4 情报动作规划

`planIntelAction(context)` 为 AI 选择最优情报动作（技能/道具/不操作）：

```
1. 构建候选动作列表（可用技能 + 可用道具 + 不操作）
2. 为每个候选计算评分：
   ├── 信息缺口评分: (1 - clueRate) × 0.4 + (1 - qualityRate) × 0.3
   ├── 信心需求评分: (1 - confidence) × 0.5
   ├── 资源存量评分: 剩余次数/总次数 × 0.2
   ├── 轮次紧迫评分: roundProgress × 0.3
   └── 工具效果评分: toolEffect.strategyScoreBoost × 0.25
3. 选择评分最高的动作
4. 若最高分 < 不操作评分，则选择不操作
```

### 2.5 工具效果转换

`buildToolEffect(actionType, actionId)` 将技能/道具效果转换为对出价算法的数值影响：

| 效果字段 | 含义 | 影响的算法步骤 |
|----------|------|---------------|
| `confidenceBoost` | 信心提升 | Step 2 信心计算 |
| `strategyScoreBoost` | 策略加成 | Step 4 心理预期 |
| `followBoost` | 跟风加成 | Step 3 趋势调整 |
| `aggressionBoost` | 激进加成 | Step 3 压力调整 |
| `uncertaintyReduction` | 不确定性降低 | Step 5 过热评估 |
| `capBoost` | 上限加成 | Step 6 价格上限 |

---

## 三、AI 情报系统

### 3.1 概述

`AiIntelMixin`（`ai/intel.ts`）管理 AI 玩家的私有情报池，是 AI "看到什么"的核心模块。

### 3.2 数据结构

```javascript
// AI 私有情报池
aiPrivateIntel[playerId] = {
  outlineSignals: [],        // 轮廓信号列表
  qualitySignals: [],        // 品质信号列表
  signalHistory: [],         // 信号历史（最多 160 条）
  knownOutlineIds: Set,      // 已知轮廓的藏品 ID
  knownQualityIds: Set,      // 已知品质的藏品 ID
  knownCellStates: {},       // 已知格子状态 "x,y" → "occupied"/"empty"
  itemKnowledge: {},         // 藏品知识库 itemId → { revealCount, category, qualityKey, ... }
  highValueTracks: [],       // 高价值追踪列表
  highValueTrackByItemId: {},// 藏品 ID → 追踪 ID 映射
  nextTrackIndex: 0,         // 追踪编号计数器
  aggregateStats: {},        // 聚合统计（mean, spreadRatio, upperEdge, lowerEdge, std, iqr）
  latestSignalStats: {}      // 最近一次信号统计
}

// AI 资源状态
aiResourceState[playerId] = {
  skills: { skillId: 剩余次数 },  // 技能使用次数（每轮重置）
  items: { itemId: 剩余数量 }     // 道具库存
}

// AI 角色分配
aiCharacterAssignments[playerId] = {
  characterId,   // 角色 ID
  skillId,       // 技能 ID
  skillName,     // 技能名称
  passive        // 被动效果
}
```

### 3.3 核心方法

| 方法 | 功能 | 返回值 |
|------|------|--------|
| `initAiIntelSystems()` | 初始化所有 AI 的情报池、角色、资源 | — |
| `resetAiRoundResources()` | 每轮重置技能次数 | — |
| `getAiIntelSummary(playerId)` | 计算 AI 情报摘要 | `{ clueRate, qualityRate, uncertainty, spreadRatio, upperEdge, lowerEdge, ... }` |
| `buildAiIntelSnapshot()` | 所有 AI 的情报摘要快照 | `{ [playerId]: summary }` |
| `revealPrivateIntelBatch(playerId, mode, count, ...)` | 为 AI 批量揭示藏品信息 | `{ ok, revealed, signals, signalStats, trackUpdates }` |
| `revealPrivateIntelFully(playerId, opts)` | 为 AI 完全揭示藏品 | 同上 |
| `buildAiPrivateRevealContext(playerId)` | 构建 LLM 可调用的揭示上下文 | `{ revealOutline, revealQuality, revealAll }` |
| `buildSkillContext()` | 构建规则 AI 可调用的揭示上下文 | 同上 |

### 3.4 情报揭示流程

```
revealPrivateIntelBatch(playerId, mode, count, category, allowCategoryFallback, sortStrategy)
  │
  ├── 1. pickPrivateRevealTargets()  ← 选择揭示目标
  │     ├── 筛选未揭示的藏品
  │     ├── 按品类过滤（可选）
  │     ├── 按排序策略排序（smallestFirst/largestFirst/random）
  │     └── 取前 count 个
  │
  ├── 2. 对每个目标：
  │     ├── buildAiPrivateSignal()   ← 构建信号
  │     │     ├── outline 模式: 记录品类、尺寸、采样格子
  │     │     └── quality 模式: 记录品质键、采样格子
  │     ├── markAllItemCellsAsOccupied()  ← 标记已知格子
  │     ├── scanItemBoundaryNeighbors()   ← 扫描边界邻居
  │     └── updateAiItemKnowledge()       ← 更新知识库
  │
  ├── 3. 更新信号历史（最多 160 条）
  │
  ├── 4. 计算信号统计
  │     ├── getSignalPriceStats()  ← 价格统计
  │     └── 更新 aggregateStats / latestSignalStats
  │
  └── 5. 高价值追踪
        └── ensureAiHighValueTrack()  ← 绝品/高价藏品自动追踪
```

### 3.5 高价值追踪系统

AI 对绝品（legendary）或高价藏品自动建立追踪：

```
追踪 ID 格式: "红一", "红二", "红三", ...

追踪记录:
{
  trackId: "红一",
  itemId: "artifact-42",
  createdRound: 3,
  lastSeenRound: 5
}

追踪更新（updateAiItemKnowledge 返回）:
{
  trackUpdate: {
    trackId: "红一",
    revealLevel: "已知品类" | "仅知品质" | "范围缩小" | "已完全确定",
    confirmed: { quality: "珍品", category: "瓷器", exactArtifact: null },
    candidates: { total: 12, truncated: false }
  }
}
```

---

## 四、AI 钱包系统

### 4.1 概述

`AiWalletMixin`（`ai/wallet.ts`）管理 AI 玩家的虚拟资金。

### 4.2 核心规则

| 规则 | 说明 |
|------|------|
| 初始资金 | 1,000,000 |
| 跨局累积 | 钱包余额跨局继承，每局结算后根据分红/门票更新 |
| 持久化 | localStorage（键: `mobao_ai_wallets_v1`） |
| 联机独立 | 联机使用 `_lan` 后缀的存储键 |
| 出价归一化 | `normalizeAiBidValue()` 将出价 clamp 到 [最低出价, 钱包余额] 并对齐步长 |

### 4.3 联机回退机制

```javascript
getAiWallet(playerId) {
  // 1. 直接读取本地钱包
  const direct = this.aiWallets[playerId];
  if (direct > 0) return direct;

  // 2. 联机模式：从主机同步的钱包数据回退
  if (this.isLanMode && this.slotIdToLanId[playerId]) {
    const lanWallet = this.lanHostWallets[lanId];
    if (lanWallet > 0) return lanWallet;
  }

  // 3. 最终回退：当前出价 + 步长
  return this.currentBid + bidStep;
}
```

---

## 五、AI 记忆系统

### 5.1 概述

`AiMemoryMixin`（`ai/memory.ts`）管理 AI 的对局内对话历史和跨局经验本，支持 LLM 上下文构建。

### 5.2 数据结构

```javascript
// 对局内对话历史（每轮决策记录，最多 30 条）
aiConversationByPlayer[playerId] = [
  { run: 3, round: 2, bid: 250000, skill: "outline-scan",
    item: "无", thought: "轮廓较多，出价保守", result: "未中标" }
]

// 跨局经验本
aiCrossGameMemory[playerId] = {
  stats: {
    totalGames: 15,           // 总局数
    winRate: 0.33,            // 胜率
    avgProfit: 12500,         // 平均盈亏
    warehouseValueMax: 679100,// 仓库价值范围
    warehouseValueMin: 170400,
    warehouseValueAvg: 412000,
    totalCellsMax: 180,       // 格数范围
    totalCellsMin: 45,
    totalCellsAvg: 112,
    totalItemsMax: 28,        // 藏品件数范围
    totalItemsMin: 8,
    totalItemsAvg: 16,
    legendaryMax: 3,          // 绝品件数范围
    legendaryMin: 0,
    legendaryAvg: 0.8,
    rareMax: 6,               // 珍品件数范围
    rareMin: 1,
    rareAvg: 3.2
  },
  praises: [                  // 成功经验，最多 10 条
    "首轮大胆出价拿下低价仓库获利丰厚"
  ],
  strategies: [               // 策略建议，最多 10 条
    "品质率超60%时可以激进出价"
  ],
  lessons: [                  // 经验教训，最多 10 条
    "线索不足时不要盲目追高"
  ]
}
```

### 5.3 LLM 上下文构建

`getAiConversationMessages(playerId)` 为 LLM 构建记忆上下文：

```
消息 1 (user): 【跨局经验总结】
  历史统计: 共15局, 胜率33%, 平均盈亏12500
  仓库价值范围: 170400~679100, 平均412000
  ...
  成功经验:
    1. 首轮大胆出价拿下低价仓库获利丰厚
  策略建议:
    1. 品质率超60%时可以激进出价
  经验教训:
    1. 线索不足时不要盲目追高

消息 2 (user): 【本局内历史决策记录】
  轮1 | 出价200000 | 技能:outline-scan | 想法:先探查轮廓 | 结果:未中标
  轮2 | 出价250000 | 道具:蜡烛 | 想法:轮廓较多，出价保守 | 结果:未中标
```

### 5.4 结算推送

`pushRunSettlementContextToAi(result)` 在每局结算后推送结果到记忆：

```
推送内容:
  【系统事件】第 3 局已结算：右上AI 以 320000 拿下整仓（正常结束）。
  本局揭示总值 412000，拍下者利润 +92000。
  分红触发：拍下者亏损，非拍下者各获得亏损额的15%（+15000）。
  请记录本局经验并等待下一局开始。
```

### 5.5 导入导出

```javascript
// 导出为 JSON
const json = exportAiMemoryToJson();

// 从 JSON 导入
const result = importAiMemoryFromJson(json);
// → { ok: true } 或 { ok: false, error: "..." }
```

---

## 六、AI 反思系统

### 6.1 概述

`AiReflectionMixin`（`ai/reflection.ts`）在每局结算后，通过 LLM 让 AI 对自己的表现进行反思总结，更新跨局经验本。

### 6.2 触发条件

三个条件必须同时满足：

1. `isAiReflectionEnabled()` — 反思开关开启
2. `canUseLlmDecision()` — LLM 可用
3. `llmEverUsedThisRun` — 本局使用过 LLM（至少一次 LLM 决策成功）

### 6.3 反思流程

```
triggerAiReflection(record)
  │
  ├── 1. 检查触发条件
  │     └── 不满足则直接返回
  │
  ├── 2. 更新反思状态 UI → "pending"
  │
  ├── 3. 并行为每个 AI 玩家构建反思 prompt
  │     ├── 本局结果（胜/负、盈亏、品质分布）
  │     ├── 分红/门票信息
  │     ├── 当前经验本内容
  │     └── 历史统计
  │
  ├── 4. 调用 LLM（支持独立模型配置）
  │     ├── 获取 getLlmProvider()
  │     ├── 检查独立模型配置 (independentReflectionEnabled)
  │     ├── 合并 AI 专属模型设置
  │     └── requestChat({ temperature: 0.3, maxTokens, messages })
  │
  ├── 5. 解析 LLM 返回的 JSON 操作指令
  │     {
  │       "praises": { "add": [...], "delete": [索引], "modify": [[索引, "新内容"]] },
  │       "strategies": { "add": [...], "delete": [...], "modify": [...] },
  │       "lessons": { "add": [...], "delete": [...], "modify": [...] }
  │     }
  │
  ├── 6. 应用操作到经验本
  │     └── applyMemoryOperations(array, operations, maxLength=10)
  │         ├── delete: 按索引倒序删除
  │         ├── modify: 按索引修改
  │         └── add: 追加（去重）
  │
  ├── 7. 更新跨局统计
  │     └── updateCrossGameMemory(playerId, record, parsedReflection)
  │         ├── totalGames += 1
  │         ├── winRate = (winRate × (n-1) + isWin) / n
  │         ├── avgProfit = (avgProfit × (n-1) + profit) / n
  │         └── 更新仓库价值/格数/藏品/绝品/珍品范围
  │
  └── 8. 更新反思状态 UI → "done" / "timeout" / "error"
```

### 6.4 反思 Prompt 模板

```
请根据本局表现更新经验本，返回JSON格式：
{
  "praises": { "add": ["新内容"], "delete": [索引号], "modify": [[索引号, "新内容"]] },
  "strategies": { "add": [...], "delete": [...], "modify": [...] },
  "lessons": { "add": [...], "delete": [...], "modify": [...] }
}

要求：
- 尽量用最少的字给自己留下最有用的内容
- 如果条数已满，但又必须增加条目时思考如何优化现有经验书
- 不要写本局，本次等一些很限定的词
- 每一个条目的字数限制在50字

【本局结束，请总结经验】
结果：右上AI以320000中标,总值412000,利润+92000
分红触发：拍下者亏损，你获得+15000分红。
品质分布：粗2 良5 精4 珍3 绝1 | 总藏品15格数112

当前经验书（每类最多10条）：
- 成功经验(2/10): 0. 首轮大胆出价; 1. 品质率高时激进
- 策略建议(1/10): 0. 线索不足时保守
- 经验教训(1/10): 0. 不要盲目追高
```

---

## 七、LLM 决策系统

### 7.1 概述

`scene-llm.ts` 是 AI 决策系统与 LLM 后端之间的核心桥梁，负责完整的 LLM 决策流程。

### 7.2 System Prompt

LLM 决策的 System Prompt 包含以下部分：

| 部分 | 内容 |
|------|------|
| 身份与目标 | 竞拍 AI 玩家，以低于真实价值的成交价盈利 |
| 游戏机制 | 盲拍规则、提前获胜、分红/门票 |
| 字段参考 | warehouseDefinition, qualityPriceGuide, privateIntel, wallet 等 |
| 硬约束 | 禁止弃标、两段式流程、禁止臆造、出价不超钱包 |
| 策略建议 | 大胆出价、跨局记忆、欺诈策略 |
| 输出格式 | JSON `{ bid, skill, item, thought }` |

### 7.3 决策流程（两段式）

```
requestLlmDecision(playerId, context)
  │
  ├── ═══ Initial 阶段 ═══
  │
  ├── 1. 构建 prompt
  │     ├── system: LLM_DECISION_SYSTEM_PROMPT
  │     ├── 跨局记忆: getAiConversationMessages(playerId)
  │     ├── 游戏状态: 轮次/出价/钱包/直接拿下系数
  │     ├── 仓库定义: warehouseDefinition
  │     ├── 品质价格指南: qualityPriceGuide / qualityPriceRangeTable
  │     ├── 私有情报: privateIntel（aggregate + highValueTracks）
  │     ├── 公开信息: otherPlayersPublic / bidHistory
  │     └── 可用工具: availableSkills / availableItems
  │
  ├── 2. 调用 LLM
  │     └── LlmManager.requestChat({ messages, temperature, maxTokens })
  │
  ├── 3. 解析响应 JSON
  │     ├── tryExtractDecisionJson(): 直接解析 → 代码块提取 → 首尾花括号提取
  │     └── 纠错机制（最多 2 次）:
  │           ├── 解析失败 → 构建纠错 prompt → 重新请求
  │           └── 仍失败 → 回退到规则 AI 出价
  │
  ├── 4. 验证决策合法性
  │     ├── bid: 正整数，不超过钱包，对齐步长
  │     ├── skill: 来自可用列表或 "无"
  │     ├── item: 来自可用列表或 "无"
  │     └── thought: 字符串，最长 200 字
  │
  ├── 5. 执行工具（若 skill/item 非 "无"）
  │     ├── 调用 revealOutline / revealQuality / revealAll
  │     └── 获取工具执行结果
  │
  ├── ═══ Follow-up 阶段（仅当执行了工具时） ═══
  │
  ├── 6. 构建追问 prompt
  │     ├── 包含工具执行结果
  │     └── 要求 LLM 根据新信息更新出价
  │
  ├── 7. 再次调用 LLM
  │     └── 此时 skill/item 必须为 "无"，仅允许更新 bid/thought
  │
  ├── 8. 解析追问响应
  │     └── 同样的纠错机制
  │
  └── 9. 记录遥测数据
        └── recordAiThoughtLogs(telemetry)
            ├── controlMode: "llm" / "llm-corrected" / "rule-fallback-*"
            ├── systemPrompt, userPrompt, modelResponse
            ├── toolResultSummary
            ├── errorCorrectionPrompt/Response（如有纠错）
            ├── followupPrompt/Response（如有追问）
            └── cacheHitTokens, cacheMissTokens, cacheHitRate
```

### 7.4 纠错机制

```
LLM 返回文本 → tryExtractDecisionJson()
  │
  ├── 成功解析 → 验证字段合法性
  │     ├── 合法 → 使用 LLM 决策
  │     └── 非法 → 进入纠错
  │
  └── 解析失败 → 进入纠错
        │
        ├── 纠错 Prompt:
        │   "你的上一次回复格式有误，请严格按照JSON格式返回：
        │    { bid: 正整数, skill: 技能ID或"无", item: 道具ID或"无", thought: 简短想法 }"
        │
        ├── 纠错请求（最多 2 次）
        │     ├── 成功 → 使用纠错后决策（controlMode: "llm-corrected"）
        │     └── 失败 → 回退到规则 AI（controlMode: "rule-fallback-*"）
        │
        └── 回退原因分类:
              ├── rule-fallback-after-llm-tool: 工具执行后二次请求失败
              ├── rule-fallback-after-correction: 纠错后执行失败
              ├── rule-fallback-correction-skipped: 纠错跳过
              ├── rule-fallback-llm-failed: LLM 请求失败
              └── rule-fallback-llm-invalid: LLM 返回无效决策
```

### 7.5 工具系统

LLM 可以通过 `skill` 和 `item` 字段调用游戏内的揭示工具：

| 工具类型 | 可用值 | 效果 |
|----------|--------|------|
| 技能 | `outline-scan` | 揭示 N 个藏品轮廓 |
| 技能 | `quality-probe` | 揭示 N 个藏品品质 |
| 技能 | `value-sense` | 标记高价值藏品 |
| 道具 | `flashlight` / `candle` / ... | 各种揭示道具 |
| 无 | `"无"` | 不使用工具 |

**工具执行后的 Follow-up 流程**：

```
LLM 返回 { bid: 280000, skill: "outline-scan", item: "无", thought: "先探查轮廓" }
  │
  ├── 执行 outline-scan → 获得 3 个轮廓信号
  │
  ├── 构建 Follow-up Prompt:
  │   "你使用了技能 outline-scan，揭示了以下信息：
  │    [轮廓信号详情]
  │    请根据新信息更新你的出价决策。只返回 JSON { bid, thought }。"
  │
  └── LLM 返回 { bid: 320000, thought: "轮廓显示大件较多，提高出价" }
      → 最终出价: 320000
```

### 7.6 独立模型配置

每个 AI 玩家可以使用不同的 LLM 模型：

```javascript
// 设置中启用独立模型
settings.independentModelEnabled = true;

// 为每个 AI 配置独立模型
getAiModelConfigForPlayer(playerId) → {
  apiKey: "sk-xxx",
  endpoint: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-reasoner",
  maxTokens: 4096,
  timeoutMs: 60000,
  thinkingEnabled: true
}
```

### 7.7 思考模式（Thinking/Reasoning）

部分模型支持思考模式（如 DeepSeek Reasoner），启用后：

- `thinkingEnabled = true`
- `maxTokens` 自动增大（思考 token + 输出 token）
- `timeoutMs` 自动延长（最少 90 秒）
- 返回结果包含 `reasoningContent`（思考过程）和 `content`（最终输出）

---

## 八、LLM Provider 调度层

### 8.1 LlmManager 架构

```
┌─────────────────────────────────────────────────────┐
│                   LlmManager (单例)                  │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ DeepSeek    │  │ OpenAI      │  │ Qwen        │ │
│  │ Provider    │  │ Provider    │  │ Provider    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ GLM         │  │ Kimi        │  │ Custom      │ │
│  │ Provider    │  │ Provider    │  │ Provider    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                      │
│  activeProviderId → 当前活跃 Provider                 │
│  requestChat() → 转发到活跃 Provider                  │
│  testConnection() → 测试连通性                        │
└─────────────────────────────────────────────────────┘
```

### 8.2 Provider 接口

所有 Provider 实现统一接口：

```javascript
{
  id: string,                    // 唯一标识
  name: string,                  // 显示名称
  description: string,           // 描述
  defaultSettings(),             // 默认设置
  normalizeSettings(source, fb), // 设置归一化
  loadSettings(),                // 加载设置（从 localStorage）
  saveSettings(settings),        // 保存设置
  requestChat(options),          // 核心：发送聊天请求
  testConnection(override?),     // 测试连接
  getLogs(),                     // 获取日志
  clearLogs(),                   // 清除日志
  isThinkingModel(model),        // 是否为思考模型
  supportsFeature(feature)       // 功能支持查询
}
```

### 8.3 requestChat 请求参数

```javascript
await provider.requestChat({
  settings: { apiKey, endpoint, model, ... },  // Provider 设置
  messages: [                                    // 消息列表
    { role: "system", content: "..." },
    { role: "user", content: "..." }
  ],
  temperature: 0.2,     // 温度
  maxTokens: 2048,      // 最大输出 token
  timeoutMs: 40000,     // 超时时间
  isThinking: false     // 是否启用思考模式
})
```

### 8.4 requestChat 返回值

```javascript
// 成功
{
  ok: true,
  content: "JSON字符串",           // 模型输出
  reasoningContent: "思考过程",     // 思考模式下的推理过程
  usage: {
    prompt_cache_hit_tokens: 1200,  // 缓存命中 token
    prompt_cache_miss_tokens: 800,  // 缓存未命中 token
    completion_tokens: 256,         // 输出 token
    total_tokens: 2256,             // 总 token
    reasoning_tokens: 512           // 推理 token（思考模式）
  },
  elapsedMs: 3200,                  // 耗时
  model: "deepseek-v4-flash"        // 实际使用的模型
}

// 失败
{
  ok: false,
  error: "错误描述",
  code: "TIMEOUT" | "NETWORK_ERROR" | "MISSING_API_KEY" |
        "HTTP_ERROR" | "EMPTY_RESPONSE" | "EXCEPTION" | ...,
  status: 401                        // HTTP 状态码（如有）
}
```

### 8.5 内置 Provider 配置

| Provider | 默认端点 | 默认模型 | 特性 |
|----------|---------|---------|------|
| DeepSeek | `/api/deepseek/chat/completions`（代理） | `deepseek-v4-flash` | 思考模型支持、缓存 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` | 标准接口 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-turbo` | 兼容 OpenAI 格式 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4-flash` | 思考模型 glm-z1 |
| Kimi | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` | 标准接口 |

### 8.6 自定义 Provider

用户可通过 UI 添加自定义 Provider：

```javascript
// 添加自定义 Provider
LlmManager.createDynamicProvider({
  id: "my-provider",
  name: "我的模型",
  endpoint: "https://my-api.example.com/v1/chat/completions",
  model: "my-model-v1"
});

// 持久化到 localStorage
LlmManager.saveCustomProviders();
// 键: mobao_custom_providers_v1
```

### 8.7 Token 监控

LlmManager 通过 BroadcastChannel 广播 Token 使用数据：

```javascript
// 广播格式
{
  type: 'llm-request',
  payload: {
    ok: true,
    model: 'deepseek-v4-flash',
    elapsedMs: 3200,
    usage: { prompt_cache_hit_tokens, prompt_cache_miss_tokens, completion_tokens, ... },
    playerId: 'p1',
    playerName: '左上AI',
    timestamp: 1717584000000
  }
}

// 监听方式
const channel = new BroadcastChannel('llm-token-monitor');
channel.onmessage = (e) => { console.log(e.data); };
```

---

## 九、决策日志与调试

### 9.1 概述

`AiDecisionMixin`（`ai/decision.ts`）记录 AI 出价的决策过程，供调试和分析。

### 9.2 日志数据结构

```javascript
// 当前局日志
currentRunLog = {
  runNo: 3,
  startedAt: 1717584000000,
  actionLogs: [],           // 操作日志（最多 120 条）
  aiThoughtLogs: [],        // AI 思考日志（最多 80 条）
  roundLogsByRound: {},     // 按轮次分组的日志
  roundPanelTexts: {}       // 按轮次分组的面板快照
}

// 历史局日志（最多 12 局）
runLogHistory = [currentRunLog, ...]
```

### 9.3 AI 思考日志条目

```javascript
{
  round: 3,
  playerName: "左上AI",
  thought: "[注入2局跨局记忆+5条本局历史] [决策摘要] 轮廓较多，提高出价",
  reasoningContent: "思考过程全文...",
  controlMode: "llm",           // "llm" | "llm-corrected" | "rule-fallback-*"
  finalBid: 280000,
  decisionSource: "llm",        // "llm" | "rule"
  llmActionName: "轮廓扫描",    // LLM 选择的动作
  ruleActionName: "品质探测",   // 规则 AI 选择的动作
  actionExecuted: true,
  error: "",
  correctionAttempt: 0,
  originalError: "",
  cacheHitTokens: 1200,
  cacheMissTokens: 800,
  cacheHitRate: 60,
  at: 1717584032000
}
```

### 9.4 调试面板快照

`buildAiDecisionPanelSnapshot(telemetry)` 将一轮决策遥测格式化为可读文本：

```
回合 3 | 决策模式：混合（大模型+规则AI）
说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。

-
左上AI（p1）| 接管状态: 大模型
  最终出价: 28.0万 | 决策来源: llm
  接管模式: 大模型正常决策
  缓存命中: 1200 tokens | 未命中: 800 tokens | 命中率: 60%
  跨局记忆注入: 2局跨局记忆+5条本局历史
  大模型动作: 轮廓扫描（已执行）
  思考: 轮廓较多，提高出价
  [System Prompt]
    你是仓库摸宝中的竞拍AI玩家...
  [User Prompt]
    本轮出价信息...
  [Model Response]
    { "bid": 280000, "skill": "outline-scan", ... }
  [Tool Result]
    揭示了3个轮廓信号...
  [Follow-up Response]
    { "bid": 320000, "thought": "大件较多，提高出价" }
-
右上AI（p3）| 接管状态: 规则AI
  最终出价: 25.0万 | 决策来源: rule
  信心 62% | 人格 猛冲客
  私有线索: 线索率 35% | 品质率 12% | 不确定 0.65 | 波动 0.28
  估值: 26.8万 | 上限 32.5万
  心理预期: 24.2万
  信心拆解: 基础 0.32 + 线索 0.10 + 品质 0.02 + 回合 0.06 + 盘口 0.03 + 工具 0.00 + 边缘奖励 0.01 - 波动惩罚 0.03 - 不确定惩罚 0.09 + 情绪 0.01
  超预期: 3% | 回撤阈值 12%
  工具影响: 无 | 决策加分 0.00
  行为: 常规
-
```

---

## 十、LLM 设置 UI

### 10.1 概述

`LlmUiBridge`（`llm/core/llm-ui-bridge.ts`）连接 LlmManager 后端与设置面板 DOM。

### 10.2 设置项

| 设置项 | DOM ID | 说明 |
|--------|--------|------|
| Provider 选择 | `setting-llmProvider` | 下拉选择当前 Provider |
| API Key | `setting-llmApiKey` | 密钥输入（密码框） |
| 端点 | `setting-llmEndpoint` | API 端点 URL |
| 模型 | `setting-llmModel` | 模型 ID |
| 超时 | `setting-llmTimeout` | 请求超时（ms） |
| 温度 | `setting-llmTemperature` | 生成温度 |
| 最大 Token | `setting-llmMaxTokens` | 最大输出 token |
| 思考模式 | `setting-llmThinking` | 启用思考/推理模式 |
| 跨局记忆 | `setting-llmMultiGameMemory` | 启用跨局记忆 |
| 反思 | `setting-llmReflection` | 启用局后反思 |
| 独立模型 | `setting-llmIndependentModel` | 每个 AI 使用不同模型 |
| 独立反思 | `setting-llmIndependentReflection` | 反思使用独立模型 |

### 10.3 连接测试

```
用户点击"测试连接"按钮
  │
  ├── 禁用按钮 + 显示"测试中..."
  ├── LlmManager.testConnection()
  │     └── 发送简单 prompt: "请仅回复：连接成功"
  ├── 成功 → 显示"连接成功" + 模型回复
  └── 失败 → 显示错误类型 + 修复建议
```

---

## 十一、AI 系统配置开关

### 11.1 开关层级

```
全局开关
  └── LLM Provider 可用（有 API Key + 端点可达）
        │
        ├── AI LLM 总开关（localStorage: mobao_ai_llm_switch_v1）
        │     └── 每个 AI 玩家独立开关
        │           ├── p1: true/false
        │           ├── p3: true/false
        │           └── p4: true/false
        │
        ├── 跨局记忆开关（settings.multiGameMemoryEnabled）
        │     └── 启用后 AI 才会使用跨局经验本
        │
        └── 反思开关（settings.reflectionEnabled）
              └── 启用后局结算才触发反思
                    └── 独立反思模型（settings.independentReflectionEnabled）
```

### 11.2 开关交互

| 场景 | 行为 |
|------|------|
| LLM 不可用 | 所有 AI 使用规则引擎 |
| LLM 可用 + 开关开 | AI 使用 LLM 决策，失败回退规则引擎 |
| LLM 可用 + 开关关 | AI 使用规则引擎 |
| 跨局记忆关 | LLM prompt 不注入跨局经验 |
| 反思关 | 局结算不触发反思 |
| 独立模型开 | 每个 AI 可配置不同模型/端点/Key |

---

## 十二、联机模式下的 AI

### 12.1 差异点

| 方面 | 单机 | 联机 |
|------|------|------|
| AI 执行位置 | 本地 | 仅主机端执行 |
| 钱包存储 | `mobao_ai_wallets_v1` | `mobao_ai_wallets_v1_lan` |
| 记忆存储 | `mobao_ai_memory_v1` | `mobao_ai_memory_v1_lan` |
| LLM 设置 | 可自由配置 | 联机中禁用 LLM 设置修改 |
| AI 出价 | 本地 buildAIBids | 主机 buildAIBids → 广播结果 |
| LLM 出价 | 本地 requestLlmDecision | 主机 requestLlmDecision → 广播结果 |

### 12.2 联机 AI 数据流

```
主机端:
  kickoffAiRoundDecisions()
    ├── buildAIBids()          ← 规则 AI
    ├── requestLlmDecision()   ← LLM AI（可选）
    └── 广播出价结果 → lanBridge.send("round:ai-bids", bidMap)

客户端:
  lanBridge.on("round:ai-bids") → 更新 AI 出价显示
```
