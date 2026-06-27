# scripts/game/core/ 文件夹分析

## 文件清单

| 文件 | 行数 | 主要职责 |
|------|------|----------|
| constants.ts | 69 | 全局常量定义（网格布局、存储键名、品质数据） |
| settings.ts | 129 | 游戏设置持久化 + 玩家资金读写 |
| app-state.ts | 108 | 应用全局状态管理（模式、统计、大厅标签） |
| deps.ts | 45 | 依赖注入容器 |
| utils.ts | 270 | 全局工具函数库（20+ 函数） |
| round-manager.ts | 164 | 回合生命周期管理 |
| settlement-manager.ts | 302 | 结算业务逻辑（分红/门票/钱包/战绩） |
| skill-item-manager.ts | 186 | 技能与道具使用管理 |

## 逐文件职责问题

### constants.ts
- **混合多类常量**：网格布局、localStorage 键名、品质数据、游戏规则参数混在一起，建议拆分为 `storage-keys.ts`、`grid-layout.ts`、`quality.ts`
- **注释与代码不一致**：JSDoc 中列出的 `AI_WALLET_STORAGE_KEY`、`SELECTED_MAP_STORAGE_KEY` 等键名在代码中未导出

### settings.ts
- **职责越界**：游戏设置（GameSettings）和玩家资金（PlayerMoney）两种不相关业务混在同一文件，应拆分为 `game-settings.ts` 和 `player-money.ts`
- **硬编码魔数**：`GAME_SETTINGS.actionsPerRound = 99`（第129行）无语义注释
- **隐式 localStorage 键**：`"mobao_money_settled_run"` 直接硬编码，未使用 constants 中的常量
- **模块级可变状态**：`export let GAME_SETTINGS` 被立即覆写，初始值具有误导性

### app-state.ts
- **存储键重复定义**：`APP_STATE_KEY = "mobao_app_state_v1"` 与 `constants.ts` 中的 `APP_STATE_STORAGE_KEY` 重复
- **类型安全性差**：`get(key: string): unknown` 完全失去类型保护

### deps.ts
- **设计最佳**：职责单一，结构清晰
- **小瑕疵**：`BATTLE_RECORD_BRIDGE` 和 `SETTLEMENT_BRIDGE` 类型为 `unknown`，需类型断言

### utils.ts
- **职责过多（最大问题）**：270行包含 20+ 导出函数，涵盖 6 类不同用途：纯数据工具、格式化工具、网格/坐标工具、异步工具、AI 专用工具、品质动画时长
- **AI 专用函数错位**：`createEmptyAiPrivateIntelPool`、`tryExtractDecisionJson`、`normalizeActionToken`、`isNoneActionText` 应属 AI 子系统
- **品质时长与品质常量分离**：`qualityPulseDuration` 在 utils 中，`QUALITY_COLORS` 在 constants 中

### round-manager.ts
- **职责基本清晰**，但 `toggleRoundPause` 中混入了 LAN 联机逻辑（119-128行）

### settlement-manager.ts
- **单方法过长**：`finishAuction` 约 230 行，联机/单机两条路径交织
- **魔数硬编码**：`DIVIDEND_RATIO = 0.15`、`TICKET_RATIO = 0.05` 应提升为常量
- **联机/单机分支重复**：钱包更新逻辑大量相似代码（159-232 vs 234-300）

### skill-item-manager.ts
- **大量重复代码**：`useSkill`（30-88行）和 `useItem`（91-157行）逻辑高度相似，差异仅在管理器和 actionType

## 依赖关系

```
constants.ts  ← (底层)
utils.ts      ← (底层)
settings.ts   → constants, utils
app-state.ts  ← (独立)
deps.ts       → types/llm
round-manager.ts → settings
settlement-manager.ts → settings, app-state
skill-item-manager.ts → settings, data/*, bridge/shop
```

无循环依赖，方向清晰。

## 整体评价

**优点**：依赖方向清晰、Deps 容器设计合理、Mixin 模式统一、常量集中管理。

**核心问题**：utils.ts 职责过多、settings.ts 混合两种业务、skill-item-manager 重复代码、settlement-manager 单方法过长。

## 改进建议

1. 拆分 `utils.ts`：grid-utils / format-utils / ai-utils / quality-utils
2. 拆分 `settings.ts`：game-settings + player-money
3. 统一存储键管理到 constants.ts
4. 提取 skill-item-manager 的公共逻辑
5. 拆分 settlement-manager 的 finishAuction 为联机/单机两个方法
6. 将 DIVIDEND_RATIO/TICKET_RATIO 提升为常量
