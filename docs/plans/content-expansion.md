# 内容扩展计划：藏品/道具/角色/技能/被动

> 目标：快速丰富游戏内容，提升策略深度和重玩性

## 现状

| 内容 | 当前数量 | 问题 |
|------|---------|------|
| 角色 | 3 | 每局只有 3 种体验 |
| 技能 | 3 | 1:1 绑定角色，无法组合 |
| 道具 | 11 | 全部是"揭示 N 件 XX"，只有 count/category 差异 |
| 藏品 | 73 | 品类 10 个但分布不均，珠宝首饰 36 件占一半 |
| 被动类型 | 5 | 全是数值加成，缺机制型 |

---

## 阶段 1：藏品图鉴扩容（纯数据，零逻辑改动）

### 1a. 新增品类

在 `config.ts` 的 `ARTIFACT_CATEGORIES` 新增 4 个品类：

| 品类 | majorCategory | weight | 说明 |
|------|--------------|--------|------|
| 钱币 | 古董 | 7 | 铜钱、银锭、花钱等 |
| 织绣 | 古董 | 6 | 刺绣、缂丝、织锦等 |
| 甲骨 | 古董 | 4 | 甲骨、简牍、封泥等 |
| 漆器 | 古董 | 5 | 雕漆、螺钿、金缮等 |

### 1b. 扩充藏品条目

在 `library.ts` 为每个品类补充藏品，目标 150+ 件：

| 品类 | 当前 | 目标 | 新增 |
|------|------|------|------|
| 瓷器 | ~12 | 18 | +6 |
| 玉器 | ~10 | 15 | +5 |
| 书画 | ~8 | 14 | +6 |
| 铜器 | ~10 | 15 | +5 |
| 木器 | ~7 | 12 | +5 |
| 金石 | ~7 | 12 | +5 |
| 宝石 | ~6 | 10 | +4 |
| 有机宝石 | ~4 | 8 | +4 |
| 贵金属 | ~5 | 8 | +3 |
| 镶嵌饰品 | ~6 | 10 | +4 |
| 钱币 | 0 | 10 | +10 |
| 织绣 | 0 | 8 | +8 |
| 甲骨 | 0 | 6 | +6 |
| 漆器 | 0 | 6 | +6 |

**改动文件**：`scripts/game/data/artifacts/config.ts` + `library.ts` + `types/game.d.ts`（品类联合类型）

### 1c. 品类图标补充

在 `shop.ts` 的品类定向道具中，为 4 个新品类添加对应道具：

| 道具 ID | 名称 | 效果 | icon |
|---------|------|------|------|
| item-cat-coin | 钱币谱 | 优先对钱币揭示 3 件轮廓 | 🪙 |
| item-cat-textile | 织绣鉴 | 优先对织绣揭示 2 件品质格 | 🧵 |
| item-cat-oracle | 甲骨经 | 优先对甲骨揭示 2 件轮廓 | 🦴 |
| item-cat-lacquer | 漆器录 | 优先对漆器揭示 3 件轮廓 | 🏺 |

**改动文件**：`scripts/game/bridge/shop.ts`

---

## 阶段 2：道具效果多样化（需要扩展执行上下文）

### 现状

当前道具/技能的 `execute` 只调用 `context.revealOutline/revealQuality/revealAll`，即只支持揭示操作。

### 新增效果类型

| 效果 | 道具名 | 说明 | 需要的 context 扩展 |
|------|--------|------|-------------------|
| 邻居偷看 | 千里眼 | 随机查看 1 个邻居的 1 件已揭示藏品信息 | `peekNeighbor(opts)` |
| 出价保护 | 护身符 | 本轮出价若亏损，亏损减半 | `addBidProtection(opts)` |
| 二次出价 | 回旋镖 | 本轮可重新出价 1 次（覆盖前次） | `allowRebid()` |
| 冻结行动 | 定身符 | 冻结指定 AI 一回合（跳过其出价） | `freezeOpponent(opts)` |
| 双倍揭示 | 灵感药水 | 下一次揭示操作效果翻倍 | `doubleNextReveal()` |
| 保险箱 | 保险箱 | 本局保底收益 +50 | `addInsurance(opts)` |

### 技术方案

1. **扩展 `SkillContext` / `RevealContext`**（`types/game.d.ts`）：
   ```typescript
   export interface SkillContext {
     // 已有
     revealOutline: ...
     revealQuality: ...
     revealAll: ...
     // 新增
     peekNeighbor?: (opts: { count: number }) => { ok: boolean; message: string; info?: string }
     addBidProtection?: (opts: { discount: number }) => { ok: boolean; message: string }
     allowRebid?: () => { ok: boolean; message: string }
     freezeOpponent?: (opts: { targetSlot: number }) => { ok: boolean; message: string }
     doubleNextReveal?: () => { ok: boolean; message: string }
     addInsurance?: (opts: { amount: number }) => { ok: boolean; message: string }
   }
   ```

2. **在 `skill-item-manager.ts` 的 `useAction` 中注入 context**：构造 SkillContext 时填充新方法

3. **在 scene 层实现具体效果**：
   - `peekNeighbor`：读取邻居玩家数据，返回揭示信息
   - `addBidProtection`：在 scene state 设置 `bidProtectionDiscount` 标记
   - `allowRebid`：在 scene state 设置 `canRebid = true`
   - `freezeOpponent`：在 AI 钱包/决策层设置 `frozen = true`
   - `doubleNextReveal`：在 scene state 设置 `nextRevealMultiplier = 2`
   - `addInsurance`：在 scene state 设置 `insuranceAmount += N`

4. **在结算时应用效果**：`settlement-manager.ts` 中检查 `bidProtectionDiscount`、`insuranceAmount` 等

**改动文件**：
- `types/game.d.ts` — 类型扩展
- `scripts/game/core/skill-item-manager.ts` — context 注入
- `scripts/game/data/items.ts` — 新道具定义
- `scripts/game/bridge/shop.ts` — 商店上架
- `scripts/game/scene/warehouse-scene.ts` — state 扩展
- `scripts/game/core/settlement-manager.ts` — 结算效果
- `scripts/game/bidding/bidding-manager/*.ts` — 出价保护/二次出价

---

## 阶段 3：角色+技能+被动扩展

### 3a. 新增角色（6 个）

| ID | 名称 | 描述 | 技能 ID | 被动 |
|----|------|------|---------|------|
| collector | 收藏家 | 博古通今，以藏养藏 | skill-cat-scan | 品类大师：使用品类定向道具时额外+1 |
| speculator | 投机商 | 险中求胜，以小博大 | skill-bid-shield | 冷静出价：直接拿阈值降低 10% |
| antiquedealer | 古董商 | 见多识广，稳赚不赔 | skill-insurance | 保守策略：最低收益保底+100 |
| thief | 盗墓贼 | 鬼手空空，探囊取物 | skill-peek | 鬼手：每局可偷看 1 次邻居信息 |
| restorer | 修复师 | 化腐朽为神奇 | skill-upgrade | 精工：品质格揭示时，小概率提升 1 级 |
| fortune | 风水师 | 运筹帷幄，趋吉避凶 | skill-reroll | 转运：重新随机仓库中未揭示藏品的位置 |

### 3b. 新增技能（6 个）

| 技能 ID | 名称 | 描述 | maxPerRound | execute |
|---------|------|------|-------------|---------|
| skill-cat-scan | 万象归宗 | 优先对当前最稀缺品类揭示 3 件轮廓 | 1 | 动态判断最稀缺品类 |
| skill-bid-shield | 护盘金钟 | 本轮出价保护，亏损减半 | 1 | 调用 addBidProtection |
| skill-insurance | 保值契约 | 本局保底收益+200 | 1 | 调用 addInsurance |
| skill-peek | 隔墙有耳 | 偷看 1 个邻居的 1 件已揭示藏品 | 1 | 调用 peekNeighbor |
| skill-upgrade | 精工巧手 | 揭示 2 件品质格，25% 概率额外提升品质 | 2 | revealQuality + 概率升级 |
| skill-reroll | 风水轮转 | 重排仓库中未揭示藏品的位置 | 1 | 调用 rerollHidden |

### 3c. 新增被动类型

在 `PassiveEffect.type` 联合类型中新增：

| type | 说明 | value 含义 | 应用位置 |
|------|------|-----------|---------|
| categoryItemBonus | 品类道具额外+1 | 0（固定+1） | `skill-item-manager.ts` 使用品类道具时 |
| directTakeDiscount | 直拿阈值降低 | 0.1（降低比例） | `bidding/index.ts` shouldDirectTake |
| minProfitGuarantee | 最低收益保底 | 100（金额） | `settlement-manager.ts` 结算时 |
| peekNeighborFree | 免费偷看邻居 | 1（次数） | `character-system.ts` 每局开始 |
| qualityUpgradeChance | 品质升级概率 | 0.25（概率） | `warehouse/reveal` 揭示品质格时 |
| rerollHidden | 重排未揭示位置 | 1（次数） | `character-system.ts` 每局开始 |

**改动文件**：
- `types/game.d.ts` — PassiveEffect 联合类型扩展
- `scripts/game/data/characters.ts` — 新增 6 个角色
- `scripts/game/data/skills.ts` — 新增 6 个技能
- `scripts/game/data/character-system.ts` — 新增被动效果计算
- `scripts/game/core/skill-item-manager.ts` — 被动 context 注入
- `scripts/game/core/settlement-manager.ts` — 新被动结算逻辑
- `scripts/game/bidding/index.ts` — directTakeDiscount 被动
- `scripts/game/warehouse/warehouse-manager/reveal-fns.ts` — qualityUpgradeChance 被动

### 3d. 角色选择 UI 适配

当前角色选择 UI（`lobby/character-select.ts`）支持滚动卡片，新增角色只需数据填充，UI 应自动适配。但需检查：
- 角色头像资源（部分角色 `avatar: null`，使用默认占位即可）
- Live2D 资源（新角色暂无，设为 `null`）
- 角色选择布局（3→9 角色时滚动体验）

---

## 实施顺序

1. **阶段 1（藏品扩容）** — 纯数据，风险最低，可立即开始
2. **阶段 3（角色/技能/被动）** — 数据 + 被动逻辑，部分与阶段 2 重叠
3. **阶段 2（道具效果多样化）** — 需要扩展 SkillContext 接口和多个系统，改动面最大

阶段 3 和 2 的部分工作可以并行：
- 新角色的"机制型被动"需要扩展 PassiveEffect 类型
- 新技能的 execute 需要扩展 SkillContext
- 这两者正是阶段 2 的核心改动

建议：**先做阶段 1 → 再做阶段 3 的角色数据 + 被动类型扩展 → 最后做阶段 2 的道具效果 + 阶段 3 剩余技能**

---

## 验证标准

| 阶段 | 验证方式 |
|------|---------|
| 1 | `npx tsc --noEmit` 通过 + `npm run test` 通过 + 游戏中可看到新品类藏品 |
| 3 | 角色选择界面显示 9 个角色 + 选择后被动生效 + 技能可使用 |
| 2 | 新道具可在商店购买 + 使用后效果生效 + 结算时正确计算 |
