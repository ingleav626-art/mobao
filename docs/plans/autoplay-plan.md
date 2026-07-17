# AI 托管功能计划（v2，适配新架构）

> 更新：2026-07-17
> 基于：原 `1781403784859-lucky-wizard.md`，适配 Manager + DI 架构

## 设计不变

**核心逻辑**：p2 始终作为第四个 AI 存在，区别只是决策来源：
- **未唤醒**：玩家操作自动录入 p2 记忆（静默积累上下文）
- **唤醒**：p2 完全自主决策，走与 p1/p3/p4 相同的代码路径

## 架构适配

### 新增

| 文件 | 职责 |
|------|------|
| `scripts/game/ai/autoplay-manager.ts` | AutoPlayManager（薄协调器）：`isEnabled` 状态、`toggle()`、`ensureP2Intel()` |
| `scripts/game/ai/autoplay-manager/silent-fns.ts` | 静默积累函数：`recordPlayerSkillToP2()`、`recordPlayerBidToP2()` |
| `scripts/game/ai/autoplay-manager/wake-fns.ts` | 唤醒执行函数：`includeP2InAiProcessing()`、`handleP2Settlement()` |
| `tests/game/ai/autoplay-manager.test.ts` | 单测 |

### 改动（按域）

#### UI 层
| 文件 | 改动 |
|------|------|
| `index.html` | 添加 `#autoPlayToggle` 按钮 |
| `styles/game/_hud.css` | 托管按钮样式（唤醒态高亮） |
| `scripts/game/scene/events-hud.ts` | 绑定 `#autoPlayToggle` click → `autoplayManager.toggle()` |
| `scripts/game/scene/scene-hud.ts` | `updateHud()` 同步托管按钮视觉态 |

#### 静默积累
| 文件 | 改动 |
|------|------|
| `scripts/game/bidding/bidding-manager/keypad-fns.ts` | `playerBid()` 末尾 → 如果 `!isEnabled`，调用 `recordPlayerBidToP2(deps, bid)` |
| `scripts/game/core/skill-item-manager-class.ts` | `useAction()` 末尾 → 如果 `!isEnabled`，调用 `recordPlayerSkillToP2(deps, actionId, actionType)` |

其中 `recordPlayerBidToP2` 写入 p2 的 `aiConversationByPlayer`：
```
{ round, bid, skill: "无", item: "无", thought: "玩家手动操作", result: "" }
```
`recordPlayerSkillToP2` 更新 p2 最近一条的 skill/item 字段。

#### 唤醒执行
| 文件 | 改动 |
|------|------|
| `scripts/game/bidding/bidding-manager/flow-fns.ts` | `kickoffAiRoundDecisions()` → 如果 `isEnabled`，把 p2 加入 `aiPlayers` 列表 |
| `scripts/game/ai/intel-manager/action-fns.ts` | `processAiIntelActions()` → 如果 `isEnabled`，把 p2 加入 `aiPlayers` 列表 |
| `scripts/game/ai/intel-manager/init-fns.ts` | `initAiIntelSystems()` → 无论是否唤醒，为 p2 初始化情报池和资源 |
| `scripts/game/ai/wallet-manager.ts` | `getAiWallet("p2")` → 唤醒时返回 `playerMoney`（玩家资金） |

#### 结算与记忆
| 文件 | 改动 |
|------|------|
| `scripts/game/ai/memory-manager.ts` | `pushRunSettlementContextToAi()` → 始终写入 p2 的游戏数据（stats）；如果 `isEnabled`，也写入 p2 的总结 |
| `scripts/game/ai/memory-manager.ts` | 新增 `pruneP2Messages()` → 滑动窗口：p2 跨局消息超 contextLength 时丢弃最旧 |
| `scripts/game/ai/reflection-manager.ts` | `triggerAiReflection()` → `aiPlayers` 过滤包含 p2（仅唤醒时） |
| `scripts/game/ai/llm-settings.ts` | `isAiLlmEnabledForPlayer("p2")` → 唤醒时返回 true |

#### 联机
| 文件 | 改动 |
|------|------|
| `scripts/game/lan/lan-index-manager/` | `isLanMode` 时托管按钮禁用（联机不适用） |

### AutoPlayManager 接口

```typescript
export interface AutoPlayManagerDeps {
  isEnabled: boolean
  toggle: () => boolean  // 返回新状态
  isActive: () => boolean
  ensureP2Intel: () => void
  recordSkillUsage: (skillId: string) => void
  recordBid: (amount: number) => void
}
```

## 边界问题清单

| # | 场景 | 处理 |
|---|------|------|
| 1 | 第 3 轮才开托管 | p2 有前 2 轮静默记录，`getAiConversationMessages("p2")` 返回完整上下文 |
| 2 | 托管中取消 | 当前轮决策继续执行完毕；下轮恢复手动；后续操作继续静默写入 |
| 3 | 已用过道具/技能后开托管 | `executeAiIntelAction` 检查 `currentRoundUsage`，自然跳过工具只出价 |
| 4 | 开托管但玩家仍操作了（竞态） | 托管状态下 `playerBid()` / `useSkill()` 应拒绝（`isEnabled` 时跳过静默记录） |
| 5 | 托管出价超时 | 出价记为 0，与普通 AI 一致 |
| 6 | 从未开托管 | p2 记忆持续积累但不用，滑动窗口自动清理 |
| 7 | 结算时未托管 | 游戏数据仍写入 p2 经验本（stats），不触发反思/总结 |
| 8 | 结算时已托管 | 游戏数据 + 反思 + 总结都写入 |
| 9 | 跨局记忆满 + 未托管 + **无 LLM** | 无法总结 → 滑动窗口丢弃最旧一局 → `shift()` 后仍满 → 继续丢 |
| 10 | 跨局记忆满 + 已托管 | LLM→总结→清空→下次轮空 |
| 11 | LAN 联机模式 | 托管按钮禁用（`<button disabled>`），`isEnabled` 始终返回 false |
| 12 | 重置/重开 | `resetForNewRun` 不重置托管状态（持久化到 localStorage？还是每局手动开？→ 先每局手动开，后续加持久化） |

## 级联影响

| 改动点 | 影响的其他系统 | 是否需要联动改动 |
|--------|---------------|-----------------|
| p2 加入 `aiPlayers` | `kickoffAiRoundDecisions` 的 `aiPlayers` 数量 +1 | `setPlayerBidReady` 需包含 p2（已有逻辑，p2 本来在 players 里） |
| p2 使用 LLM | `aiLlmPlayerEnabled["p2"]` 必须在 `isEnabled` 时设为 true | `llm-decision.ts` 的 `isAiLlmEnabledForPlayer` |
| p2 使用独立模型配置 | 独立模型配置面板需显示 p2 | `overlay-manager/ai-config-fns.ts` |
| p2 参与反思 | `triggerAiReflection` 过滤条件 | 已用 `!p.isHuman` 过滤，需改 |
| p2 钱包 | `getAiWallet("p2")` | 当前只处理 `aiWallets`，p2 需特殊处理 |
| p2 托管按钮位置 | HUD 布局 | 放在玩家卡片旁边，不占用现有空间 |

## 实施顺序

```
Phase 1: AutoPlayManager + 按钮 UI
  └─ 新文件 + index.html + scene 接线

Phase 2: 静默积累
  └─ bidding 出价记录 + skill/item 使用记录

Phase 3: 唤醒执行
  └─ p2 加入 AI 列表 + 情报初始化 + 钱包处理

Phase 4: 结算与记忆
  └─ 经验本写入 + 滑动窗口 + 反思

Phase 5: 边界 + 联机
  └─ 竞态保护 + LAN 禁用 + 测试
```

## 验证方法

1. 玩 2 局手动 → 第 3 局开托管 → 查 p2 记忆是否有前 2 局上下文
2. 托管中玩 2 局 → 查经验本、反思
3. 取消托管 → 手动 → 查记忆继续积累
4. AI 决策面板 → 确认 p2 决策显示
5. 连续 5 局不开托管 → 查跨局消息滑动窗口
6. 第 6 局开托管 → 是否触发总结
7. 联机模式 → 托管按钮 disabled
