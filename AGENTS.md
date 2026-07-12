# AGENTS.md

## Project

"摸宝仓库" (warehouse-mobao) v1.7.0 - a Phaser 3 auction/bidding game. Phaser 3.90 + TypeScript 6 + Vite 8. Pure frontend (except LAN server). Chinese codebase. ~1026 tests (Vitest).

## 文档导航 (read these first)

| 文档 | 用途 |
|------|------|
| `FILE_GUIDE.md` | **每个源文件的一句话职责说明**，按目录组织，最详细且最新（2026-07-12）。定位文件先看这里。 |
| `README.md` | 游戏玩法、系统设计、运行方式、路线图（面向用户，部分行数/计数已过时，以代码为准） |
| `docs/README.md` | docs/ 索引：reference（技术参考）/ issues（痛点）/ plans（计划）/ archive（归档） |
| `docs/reference/*.md` | 模块分析、功能-文件映射、AI 系统、数据层等稳定技术参考 |

## Commands

```bash
npm run dev          # Vite dev server on port 5173 (LAN-accessible)
npm run build        # Vite build -> dist/
npm run test         # Vitest run（全量测试）
npm run test:watch   # Vitest watch 模式
npm run lint         # eslint scripts/
npm run format       # prettier --check scripts/
npm run format:fix   # prettier --write scripts/
npm run server       # LAN WebSocket server (lan/server/)
npx tsc --noEmit     # TypeScript type check (run after code changes)
```

测试框架：Vitest（jsdom 环境，v8 coverage）。测试文件在 `tests/` 目录，按源码架构一一对应，覆盖纯函数输入->输出等价性、边界条件、状态变更。

## Architecture

### Module system (ES Modules)

`index.html` has only 3 script tags:

1. `<script src="./lib/phaser.min.js">` - synchronous Phaser load (line 19)
2. `<script type="module" src="./lan/client/lan-bridge.ts">` - module load (line 861)
3. `<script type="module" src="./scripts/game/main.ts">` - module load (line 862)

All other modules use ES Module `import`/`export`. `main.ts` (36 imports) is the application entry point - now a thin assembly file (272 lines), see **场景拆分** below.

### 场景拆分 (main.ts 2748 -> 198 行)

历史上 `main.ts` 是 2748 行的 God Object（含 `WarehouseScene` 类定义 + 所有方法 + Mixin 组装）。已拆分为 `scripts/game/scene/` 目录（16 个文件，~3000 行）：

| 文件 | 职责 |
|------|------|
| `scene/warehouse-scene.ts` | `WarehouseScene` 类定义：属性声明、构造函数、Mixin 方法类型声明（**类型用途，实际方法在 scene/ 各文件**） |
| `scene/scene-init.ts` | `create` / `initAudio` / `cacheDom` / `initAnimations` / `bindDomEvents` |
| `scene/scene-run.ts` | `startNewRun`（新局初始化、仓库生成、AI 初始化） |
| `scene/scene-hud.ts` | `updateHud` / `updateActionAvailability` |
| `scene/scene-utils.ts` | 快照构建、坐标转换、排名标记、运行令牌、LLM 设置获取 |
| `scene/scene-ai-panel.ts` | AI 逻辑面板渲染（`renderAiLogicPanel`）+ LLM 设置方法（`getLlmSettings`/`getLlmProvider`） |
| `scene/scene-character.ts` | 角色场景方法（`applyCharacterToPlayer`/`bindCharacterSkillButton`/`refreshSkillButtonLabel`），从 MainOnlyMethods 迁入 |
| `scene/scene-battle-record.ts` | 仅保留 `buildWarehouseSnapshotForSync` 别名（战绩方法由 `BATTLE_RECORD_BRIDGE.methods` 直接挂原型） |
| `scene/scene-settlement.ts` | 空占位（结算方法由 `SETTLEMENT_BRIDGE.methods` 直接挂原型） |
| `scene/events-*.ts`（7 个） | 从 `bindDomEvents` 拆出的事件绑定：overlay/settings/ai-memory/ai-panel/battle-record/item-drawer/settlement |

`main.ts` 原 `MainOnlyMethods` 的 5 个孤儿方法已迁出：3 个角色方法入 `scene/scene-character.ts`、2 个 LLM 方法入 `scene/scene-ai-panel.ts`，全仓 `this: any` 清零。三个 bridge 的 `.methods`（LLM/战绩/结算）现直接 `Object.assign` 到原型，不再经 scene 代理转发。main.ts 现仅剩桥接层初始化 + Mixin/bridge 合并 + Phaser 启动（198 行）。

### Mixin assembly

`WarehouseScene` (class in `scene/warehouse-scene.ts`) is the single Phaser scene. 19 mixins + scene/ 方法 + 三个 bridge 的 `.methods`（LLM_BRIDGE / BATTLE_RECORD_BRIDGE / SETTLEMENT_BRIDGE）are merged onto its prototype via `Object.assign` in `main.ts`:

- **warehouse/**: WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin
- **ai/**: AiWalletMixin, AiIntelMixin, AiMemoryMixin, AiReflectionMixin, AiDecisionMixin
- **bidding/**: BiddingMixin
- **ui/**: OverlayMixin, PanelsMixin, HistoryMixin
- **lobby/**: LobbyIndexMixin, CarouselMixin, CharacterSelectMixin
- **lan/**: LanIndexMixin (internally merges 6 sub-mixins: events, sync, reconnect, settle, game-flow, live2d)
- **core/**: RoundManagerMixin, SkillItemManagerMixin, SettlementManagerMixin

**不要直接给类加方法** - 新功能写成 Mixin 文件或 scene/ 模块，再在 `main.ts` 的 `Object.assign` 里并入。

### 子模块拆分模式 (God Object 拆解)

大型 Mixin/模块按"**薄入口 + 子模块目录 + re-export 纯函数**"模式拆分。入口文件用 `Object.assign` 合并子 Mixin，并 re-export 子模块的纯函数保持向后兼容。新增大文件应遵循此模式：

| 原文件 | 拆分后 | 入口行数 |
|--------|--------|---------|
| `ai/intel.ts` (1673 行) | `ai/intel/`：`pure` / `init` / `snapshot` / `reveal` / `panel` / `action` | 39 行 |
| `llm/core/llm-decision.ts` (1750 行) | `llm/core/decision/`：`types` / `pure` / `request` / `correction` / `panel` | 45 行 |
| `llm/core/llm-manager.ts` (1267 行) | `llm/core/`：`manager-utils.ts` + `provider-factory.ts`（llm-manager.ts 保留注册表 + LlmManager） | 519 行 |
| `lobby/character-select.ts` | `lobby/character-select/`：`pure` / `live2d` / `carry-items`（核心 Mixin 仍在 character-select.ts） | 459 行 |
| `warehouse/index.ts` | `warehouse/`：`core.ts` / `reveal.ts` / `preview.ts` / `types.ts`（index.ts 薄入口 re-export） | - |
| `ui/overlay.ts` (957 行) | `ui/overlay/`：`pure` / `info-popup` / `detail-popup` / `settings` / `lan-dialog` / `collection` / `ai-model-config` / `core` | 32 行 |

### Phase 2 Mixin 解耦（独立纯函数）

16/19 Mixin 已完成纯函数提取，Mixin 薄包装层委托调用独立导出函数。已解耦的模块：

| 模块 | 提取的独立函数 |
|------|--------------|
| ai/wallet.ts | getAiWallet, getAiMinimumBid, normalizeAiBidValue, resetAiWallets |
| ai/intel.ts | pickRandomItemCell, calcHighValuePriceThreshold, checkHighValueArtifact, determineRevealLevel, truncateCandidateList, formatIntelActionPublicLine, buildNeighborStateLabel, getNeighborOffsets, calcUncertainty, calcAvailableActionState |
| ai/reflection.ts | applyMemoryOperations, updateCrossGameMemory |
| ai/memory.ts | getAiMemoryStorageKey, getQualityCounts, getTotalOccupiedCells, ensureCrossGameMemory |
| ai/decision.ts | compactPanelTextForSnapshot, buildAiDecisionPanelSnapshot |
| ui/panels.ts | addPrivateIntelEntry, addPublicInfoEntry, renderPrivateIntelPanel, renderPublicInfoPanel, updateSidePanels |
| ui/history.ts | resetPlayerHistoryState, clearCurrentRoundUsage, recordPlayerUsage, renderItemUsageCell, recordRoundHistory, refreshPlayerHistoryUI |
| ui/overlay.ts | getCollectionCategories, filterCollectionItems |
| lobby/carousel.ts | getMapProfiles, getSelectedMapIndex, getAdjacentIndexes |
| lobby/character-select/pure.ts | calcReplenishCost |
| lobby/index.ts | isAiLlmEnabledForPlayer, getSlotLayout, sortCollectionItems |
| bidding/index.ts | getLastRoundBidMap, shouldDirectTake |
| warehouse/index.ts | findFirstEmptySlot, isInBoundsCell, hasAnyInfo, getItemKnownText, pickBottomCellFromTargets, pickRevealTargets |
| core/skill-item-manager.ts | getItemInfo, getPlayerActionId, consumeActionState, wrapContextWithCharacterBonus |
| core/settlement-manager.ts | calculateDividendTicket, getSelfProfitInfo, buildDividendTicketLog |
| core/settings.ts | normalizeGameSettings, roundToStep, loadPlayerMoney, savePlayerMoney, clampBid |

未解耦（DOM 重或已是空壳）：RoundManagerMixin, WarehousePreviewMixin, LanIndexMixin

### Dependency injection

`scripts/game/core/deps.ts` provides a `Deps` container（`initDeps({ LLM_BRIDGE, BATTLE_RECORD_BRIDGE, SETTLEMENT_BRIDGE })`，在 main.ts 初始化）。Prefer `import { Deps }` over `window.Xxx` for new code.

### Global variables

`eslint.config.js` (lines 14-51) registers ~36 globals (Phaser, WebSocket, NativeBridge, etc.). Some remain for backward compat despite ES Module migration. New code should use ES Module import/export, not attach to `window`.

## Key files

| File | Role |
|------|------|
| `scripts/game/main.ts` | **装配入口**（198 行）：桥接层初始化、Mixin + bridge.methods 合并、Phaser 启动。类定义在 `scene/warehouse-scene.ts` |
| `scripts/game/scene/*.ts` | `WarehouseScene` 类定义 + 方法实现 + 事件绑定（15 文件，见上"场景拆分"） |
| `scripts/game/core/constants.ts` | All game constants (grid, storage keys, quality) |
| `scripts/game/core/settings.ts` | Settings load/save |
| `scripts/game/core/deps.ts` | Dependency injection container |
| `scripts/game/core/utils.ts` | Shared utility functions |
| `scripts/game/core/round-manager.ts` | Round lifecycle management |
| `scripts/game/core/settlement-manager.ts` | Settlement logic (dividends, tickets, wallets) |
| `scripts/game/core/skill-item-manager.ts` | Skill/item usage management |
| `scripts/game/data/artifacts.ts` | Artifact library (80+ items) + ArtifactManager |
| `scripts/game/data/characters.ts` | Character data definitions |
| `scripts/game/data/character-system.ts` | Character runtime state + passive effects |
| `scripts/game/data/skills.ts` | Skill definitions + SkillManager |
| `scripts/game/data/items.ts` | Item definitions + ItemManager |
| `scripts/game/ai/*.ts` + `ai/intel/` | AI 系统（bidding, intel/, memory, reflection, wallet, decision, context-builder, summarizer, game-history） |
| `scripts/llm/core/*.ts` + `decision/` | LLM 系统（manager + manager-utils + provider-factory, decision/, prompt, error, settings, ui-bridge） |
| `scripts/llm/providers/*.ts` | LLM providers (DeepSeek, OpenAI, Qwen, GLM, Kimi) |
| `scripts/game/bridge/*.ts` | Bridge layer (settlement, battle-record, shop) |
| `scripts/game/warehouse/*.ts` | Warehouse grid rendering, artifact placement, reveal mechanics |
| `scripts/game/bidding/index.ts` | Bidding flow control, bid keypad, round resolution |
| `scripts/game/ui/*.ts` | UI overlays, side panels, history, item drawer |
| `scripts/game/lobby/*.ts` + `character-select/` | Lobby navigation, carousel, character select |
| `scripts/game/lan/*.ts` | LAN multiplayer (events, sync, reconnect, settle, game-flow, live2d) |
| `scripts/audio/*.ts` | Audio manager + UI sound effects |
| `scripts/mobile/mobile-handler.ts` | Mobile/Android adaptation |
| `lan/client/lan-bridge.ts` | WebSocket client bridge |
| `lan/server/server.js` | LAN WebSocket server (separate npm install in lan/server/) |
| `proxy-server.js` | CORS proxy for LLM API calls (port 3000) |
| `types/*.d.ts` | TypeScript type definitions |

## Conventions

- **No comments** unless asked. The existing JSDoc in `main.ts`/`scene/` is documentation, not a style to follow.
- **Prettier**: no semicolons, double quotes, 120 print width, no trailing commas, LF line endings.
- **No unused vars**: ESLint `no-unused-vars` is `warn`. Keep it clean.
- **File naming**: kebab-case for files, PascalCase for classes.
- **Chinese** in all user-facing strings, comments, and documentation.
- **大文件拆分模式**: 新增大模块按"薄入口 + 子目录 + re-export 纯函数"拆分（见上"子模块拆分模式"）。纯函数放 `pure.ts`，可独立测试。

## Gotchas

- **禁止未经同意删除文件**: Never delete any file (including `rm`, `Remove-Item`, `git clean`) unless the user explicitly asks. Even if a file looks orphaned, unused, or AI-created - ask first.
- **TypeScript strict mode**: `tsconfig.json` has `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`. However, `checkJs: false` means `.js` files are not checked.
- **ESLint**: flat config 已配 @typescript-eslint，`npm run lint` 可 lint `.ts`（0 error，~305 warning，主要是 `no-explicit-any` warn 级）。新增代码避免 `any` 与未用变量；`_` 前缀的参数/变量/catch 已配置忽略。
- **LAN server is separate**: `lan/server/` has its own `package.json`. Run `npm install` there before `npm run server`.
- **Android build**: Requires JDK 17 + Gradle + Android SDK at `D:\web\tool\`. See README for exact commands.
- **localStorage keys**: All prefixed with `mobao_`. Changing a key breaks backward compat for existing users.
- **Scene 架构**: 单一 Phaser 场景（`WarehouseScene`），19 个 Mixin + scene/ 方法通过 Object.assign 合并到原型。类定义在 `scene/warehouse-scene.ts`，方法实现分散在 `scene/` 各文件（非 main.ts）。新增方法优先写成 Mixin 或 scene/ 模块。
- **FILE_GUIDE.md 是文件定位首选**: 查找某文件职责时先查 `FILE_GUIDE.md`（2026-07-12 最新），再查 `docs/reference/`。
