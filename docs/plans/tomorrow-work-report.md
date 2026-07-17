# 状态管理进度报告

> 创建：2026-07-16
> 更新：2026-07-17
> 基于：3 个只读调研子代理 + 6 轮直接修复 + 17 Manager 全量审计

---

## 一、已完成

### 1.1 startNewRun 走 slice reset ✅

**问题**：`startNewRun`（旧 scene-run.ts:109-113，修复后精简为 88 行）不调 `GameState.resetForNewRun()`，自己手动清。

**修复**（scene-run.ts）：
- 新增 `this.state.resetForNewRun()` 调用（line 31）
- 删除 ~28 行手动赋值（game/ai/warehouse/record 字段）
- 删除 AI 记忆清空逻辑（`resetAiConversations()` 和 `aiConversationByPlayer = {}`）
- 持久化字段现由 `resetAiForNewRun` 保护，跨局保留
- 保留 4 个需非默认值的字段：`actionsLeft`/`roundTimeLeft`/`currentBid=1000`/`moneySettledRunToken`

**测试**（scene-assembly.test.ts）：+3 测试（AI 持久化跨局保留、瞬态重置、resetAiConversations 不再被调）

---

### 1.2 BiddingManagerState 双重同步 ✅

**问题 1**：`resolveRoundBids` 写 `BiddingManagerState.currentBid/bidLeader/secondHighestBid` 但不写 gameSlice，HUD 显示过时。

**修复**（flow-fns.ts + bidding-manager.ts + warehouse-scene.ts）：
- Deps 接口新增 4 个回调：`setCurrentBid`/`setBidLeader`/`setSecondHighestBid`/`setRound`
- 场景接线：4 个回调 → `scene.xxx = v` → `state.game.xxx = v`
- `resolveRoundBids` 写完 BiddingManagerState 后立即 `deps.setXxx()` 同步

**问题 2**：Manager 重构遗留 bug——**第二轮无法出价**。

根因：BiddingManager 有私有 `state`（BiddingManagerState），含 `playerBidSubmitted`。换轮时 `startRoundFn` 只重置 gameSlice（`deps.playerBidSubmitted = false` → scene getter → gameSlice），不触达 BiddingManagerState。第二轮 `playerBid()` 检查 `state.playerBidSubmitted`（BiddingManagerState）发现还是 `true`，拒绝出价。

**修复**（flow-fns.ts）：新增 `resetBiddingStateForNewRound` 函数，换轮时重置 BiddingManagerState 的 8 个回合级字段 + 通过 deps 同步到 gameSlice。

**测试**（bidding-manager.test.ts + scene-assembly.test.ts）：+2 测试

---

### 1.3 17 Manager 全量审计 ✅

对全部 Manager 做了状态独立性审查。结论分为 3 类：

| 类别 | 模式 | Manager | 问题 |
|------|------|---------|------|
| **A** | 纯 deps（无私有 state）| RoundManager, SettlementManager, AiWalletManager, AiDecisionManager, SkillItemManager | ✅ |
| **B** | getter/setter 代理（state 通过 get/set 绑定 scene）| LanIndexManager, AiIntelManager, WarehouseManager, LobbyIndexManager, AiMemoryManager, HistoryManager, PanelsManager | ✅ 架构正确 |
| **C** | 真正独立私有 state（有断裂风险）| **BiddingManager, UiOverlayManager, AiReflectionManager** | ⚠️ |

**关键结论**：架构本身没问题。B 类 7 个 Manager 用 getter/setter 属性描述符代理到 scene，实际上不是独立副本——和 A 类一样是单数据源。问题只在 C 类的 3 个 Manager，它们把状态"抄"了一份独立维护然后手动同步。

**BiddingManager 是主要问题**：10 个字段全量复制 gameSlice，目前的"双写模式"（`state.xxx = v` + `deps.setXxx(v)`）是补丁，不是架构。应删除 BiddingManagerState 中 8 个重复字段，改为纯 deps 读写（A 类模式）。

---

## 二、待办

### P0：BiddingManagerState 归并到 deps

- 当前：BiddingManagerState 10 字段独立维护
- 目标：只保留 `keypadValue`（UI 输入瞬态）+ `roundBidReadyState`（出价就绪标记），其余 8 字段删掉，全部走 deps getter/setter → scene → gameSlice
- 改后：BiddingManager 变成 A 类，不再有双状态管理

### P0：settingsSlice 接入场景

- `GAME_SETTINGS` 是模块级 `export let`，23 文件 ~124 处直接引用
- settingsSlice 已建但场景没配 getter 委托
- 联机改 GAME_SETTINGS 泄漏单机

### P1：UiOverlayManager gameConfirmCallback 双写

- 写 `this.state.gameConfirmCallback` 但不写 `gameSlice._gameConfirmCallback`
- 旧 Mixin 路径可能读到 null

### P1：AiReflectionManager reflectionStatus 独立对象

- `triggerAiReflection` 直接写 status 对象，靠 `updateReflectionStatusUI()` 回调同步到 scene
- 改：直接写 scene → aiSlice，去掉中间对象

### P1：行为测试补全

- 6 个全流程只实现 2 个
- 缺：单机完整流程、联机完整流程、设置流程、道具流程

### P1：补 LAN/场景/LLM 测试（分支覆盖率 ~30% 短板）

---

## 三、测试变化

| 指标 | 原值 | 现值 |
|------|------|------|
| 测试数 | 2000 | **2219** |
| 测试文件 | — | **83** |

---

## 四、架构结论

**不是架构复杂了，是 BiddingManager 一个人把架构搞坏了。**

正确模式是 RoundManager（A 类）：deps 上层是 getter/setter 代理，flow 函数 `deps.xxx = v` 直达 gameSlice。不需要 BiddingManagerState 作为中转站，不需要双写。

17 个 Manager 里 12 个是对的（A+B 类），C 类 3 个需要归并。先把 BiddingManager 归到 A 类，其他两个风险较低可以后续处理。
