# 测试覆盖率提升计划

> 创建：2026-06-27
> 状态：进行中

---

## 当前状态

| 指标 | 数值 |
|------|------|
| 测试文件 | 22 |
| 测试用例 | 458 |
| 整体语句覆盖率 | **7%**（12061 条语句中覆盖 846 条） |
| 已测试纯函数模块 | 40%~96% |

### 已覆盖的模块

| 模块 | 测试文件 | 覆盖率 |
|------|---------|--------|
| ai/context-builder | context-builder.test.ts | ~80% |
| ai/wallet | wallet.test.ts | ~75% |
| ai/reflection | reflection.test.ts | ~70% |
| ai/memory | memory.test.ts | ~65% |
| ai/summarizer | summarizer.test.ts | ~85% |
| core/settings | settings.test.ts | ~96% |
| core/skill-item-manager | skill-item-manager.test.ts | ~60% |
| core/settlement-manager | settlement-manager.test.ts | ~55% |
| core/round-manager | round-manager.test.ts | ~50% |
| core/utils | utils.test.ts | ~90% |
| data/artifacts | artifacts.test.ts | ~40% |
| data/public-events | public-events.test.ts | ~70% |
| data/characters | characters.test.ts | ~50% |
| lobby/index | lobby-index.test.ts | ~45% |
| lobby/carousel | carousel.test.ts | ~40% |
| lobby/character-select | character-select.test.ts | ~55% |
| ui/overlay | overlay.test.ts | ~50% |
| ui/history | history.test.ts | ~45% |
| bridge/settlement | settlement.test.ts | ~40% |
| bidding/index | bidding-index.test.ts | ~35% |
| warehouse/index | warehouse-index.test.ts | ~30% |
| llm/core/llm-prompt | llm-prompt.test.ts | ~25% |

---

## 目标

| 阶段 | 覆盖率目标 | 测试文件 | 测试用例 |
|------|-----------|---------|---------|
| 当前 | 7% | 22 | 458 |
| Phase 1 | 25% | 29 | 540 |
| Phase 2 | 40% | 33 | 580 |
| Phase 3 | 60% | 38 | 650+ |
| 远期（Vue 重构后） | 80%+ | — | — |

**核心思路**：纯函数层先拉到 90%+，数据层和 Bridge 层到 70%+，Phaser 耦合层暂不测试。

---

## Phase 1：纯函数补充（零 mock，最高 ROI）

当前已测试模块中很多函数只覆盖了主路径，缺少边界条件和异常路径。

### 1.1 扩展 artifacts.test.ts

源文件：`scripts/game/data/artifacts.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `estimatePriceByQuality` | 各品质价格估算、边界值 | +4 |
| `signalToRevealState` | 信号到揭示状态的映射 | +3 |
| `summarizeCandidatePrices` | 候选价格汇总、空数组 | +3 |
| `toSizeTag` | 尺寸标签转换 | +3 |
| `buildArtifactFromDef` | 从定义构建藏品 | +3 |
| `getCandidatesByRevealState` | 按状态筛选候选 | +2 |
| `getLibraryStats` | 图书馆统计 | +2 |

**小计：+20 用例**

### 1.2 新建 llm-error.test.ts

源文件：`scripts/llm/core/llm-error.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `safeParseJson` | 有效 JSON、无效 JSON、嵌套提取 | +5 |
| `tryExtractDecisionJson` | 提取决策 JSON、缺失字段 | +5 |
| `parseLlmError` | 各种错误类型解析 | +5 |

**小计：+15 用例**

### 1.3 新建 deepseek-llm.test.ts

源文件：`scripts/llm/providers/deepseek-llm.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `defaultDeepSeekSettings` | 默认配置值 | +3 |
| `normalizeDeepSeekSettings` | 配置归一化、缺失字段 | +5 |
| `maskApiKey` | API Key 脱敏 | +4 |

**小计：+12 用例**

### 1.4 扩展 items.test.ts

源文件：`scripts/game/data/items.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `ItemManager.getSkillState` | 获取技能状态 | +3 |
| `ItemManager.resetForNewRun` | 重置状态 | +3 |
| 边界条件 | 空列表、无效 ID | +2 |

**小计：+8 用例**

### 1.5 扩展 skills.test.ts

源文件：`scripts/game/data/skills.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `SkillManager.getSkillState` | 获取技能状态 | +3 |
| `SkillManager.resetForNewRun` | 重置状态 | +2 |
| `SkillManager.onNewRound` | 回合更新 | +3 |

**小计：+8 用例**

### 1.6 新建 shop.test.ts

源文件：`scripts/game/bridge/shop.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `getItemStorageKey` | 存储键生成 | +2 |
| `getDiscountBadge` | 折扣徽章 | +3 |
| `getDefaultInventory` | 默认库存 | +3 |

**小计：+8 用例**

### 1.7 扩展 bidding.test.ts

源文件：`scripts/game/ai/bidding.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `AuctionAiEngine.resetForNewRun` | 重置状态 | +2 |
| `applyCrowdDiversity` | 群体多样性 | +4 |
| `buildToolEffect` | 工具效果构建 | +4 |

**小计：+10 用例**

**Phase 1 总计：+81 用例，覆盖率 7% → 25%**

---

## Phase 2：localStorage Mock 测试

需要 `vi.stubGlobal('localStorage', mockStorage)` 模拟浏览器存储。

### 2.1 新建 game-history.test.ts

源文件：`scripts/game/ai/game-history.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `MobaoGameHistory.load` | 加载历史 | +3 |
| `MobaoGameHistory.append` | 追加记录 | +3 |
| `MobaoGameHistory.clear` | 清空历史 | +2 |
| `exportToJson` / `importFromJson` | 导入导出 | +4 |

**小计：+12 用例**

### 2.2 新建 character-system.test.ts

源文件：`scripts/game/data/character-system.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `selectCharacter` | 选择角色 | +2 |
| `getActiveCharacter` | 获取活跃角色 | +2 |
| `getOutlineBonus` | 轮廓加成 | +2 |
| `getQualityBonus` | 品质加成 | +2 |
| `applyPassiveEffect` | 被动效果 | +2 |

**小计：+10 用例**

### 2.3 新建 battle-record.test.ts

源文件：`scripts/game/bridge/battle-record.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `loadBattleRecords` | 加载战绩 | +3 |
| `saveBattleRecords` | 保存战绩 | +3 |
| `exportBattleRecords` | 导出战绩 | +2 |

**小计：+8 用例**

### 2.4 新建 app-state.test.ts

源文件：`scripts/game/core/app-state.ts`

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `load` / `save` | 加载保存 | +3 |
| `patch` | 部分更新 | +2 |
| `get` / `set` | 读写属性 | +3 |

**小计：+8 用例**

**Phase 2 总计：+38 用例，覆盖率 25% → 40%**

---

## Phase 3：扩展已有测试 + 深度覆盖

### 3.1 扩展 context-builder.test.ts

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `buildPublicEventSnapshot` | 公共事件快照 | +4 |
| `buildRoundPublicStateTable` | 回合公共状态表 | +3 |
| `buildOtherPlayersPublicInfo` | 其他玩家信息 | +3 |

**小计：+10 用例**

### 3.2 扩展 wallet.test.ts（localStorage mock）

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `loadAiWalletsFromStorage` | 从存储加载 | +3 |
| `saveAiWalletsToStorage` | 保存到存储 | +3 |

**小计：+6 用例**

### 3.3 扩展 memory.test.ts（localStorage mock）

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `loadAiMemoryFromStorage` | 从存储加载 | +2 |
| `ensureCrossGameMemory` | 确保跨局记忆 | +2 |

**小计：+4 用例**

### 3.4 扩展 overlay.test.ts

| 函数 | 测试内容 | 预计用例 |
|------|---------|---------|
| `filterCollectionItems` | 更多边界条件 | +3 |
| `getCollectionCategories` | 空库、单品类 | +2 |

**小计：+5 用例**

### 3.5 深度覆盖其他模块

| 测试文件 | 扩展内容 | 预计用例 |
|----------|---------|---------|
| settings.test.ts | 边界值、异常输入 | +5 |
| round-manager.test.ts | 回合切换边界 | +5 |
| settlement-manager.test.ts | 结算边界 | +5 |
| characters.test.ts | 角色数据完整性 | +5 |
| llm-prompt.test.ts | Prompt 构建 | +5 |

**小计：+25 用例**

**Phase 3 总计：+50 用例，覆盖率 40% → 60%**

---

## 不测试的文件（HARD — 低 ROI）

以下文件耦合 Phaser/DOM/网络，需要 Vue 重构或大幅架构调整后才能有效测试：

| 文件 | 原因 |
|------|------|
| `lan/*` | WebSocket + Phaser 耦合 |
| `scene/*` | Phaser 场景生命周期 |
| `lobby/carousel.ts` | 纯 DOM 操作 |
| `audio/*` | Web Audio API |
| `mobile/*` | 设备 API |
| `llm/core/llm-manager.ts` | 异步网络 + localStorage |
| `llm/core/llm-ui-bridge.ts` | DOM 重 |
| `shop/index.ts` | DOM 重 |
| `animations.ts` | CSS/DOM 动画 |
| `main.ts` | 入口组装文件 |

**远期目标**：引入 Vue 做 UI 层后，这些文件的 UI 逻辑可以用 Vue Test Utils 测试，覆盖率可冲击 **80%+**。

---

## 执行顺序

1. **Phase 1** — 纯函数补充（零 mock，最高 ROI）
2. **Phase 2** — localStorage mock 测试
3. **Phase 3** — 扩展已有测试 + 深度覆盖

---

## 预期结果

| 指标 | 当前 | Phase 1 | Phase 2 | Phase 3 |
|------|------|---------|---------|---------|
| 测试文件 | 22 | 29 | 33 | 38 |
| 测试用例 | 458 | 540 | 580 | 650+ |
| 语句覆盖率 | 7% | 25% | 40% | **60%** |
| 纯函数覆盖率 | 40%~96% | 70%~100% | 70%~100% | 80%~100% |
