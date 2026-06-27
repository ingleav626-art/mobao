# AGENTS.md

## Project

"摸宝仓库" (warehouse-mobao) v1.7.0 — a Phaser 3 auction/bidding game. Phaser 3.90.0 + TypeScript 6 + Vite 8. Pure frontend (except LAN server). Chinese codebase.

## Commands

```bash
npm run dev          # Vite dev server on port 3000 (LAN-accessible)
npm run build        # Vite build → dist/
npm run lint         # eslint scripts/
npm run format       # prettier --check scripts/
npm run format:fix   # prettier --write scripts/
npm run server       # LAN WebSocket server (lan/server/)
npx tsc --noEmit     # TypeScript type check (run after code changes)
```

No test suite. No `typecheck` script — TypeScript is transpiled by Vite, not tsc.

## Architecture

### Module system (ES Modules)

`index.html` has only 3 script tags:

1. `<script src="./lib/phaser.min.js">` — synchronous Phaser load (line 19)
2. `<script type="module" src="./lan/client/lan-bridge.ts">` — module load (line 861)
3. `<script type="module" src="./scripts/game/main.ts">` — module load (line 862)

All other modules use ES Module `import`/`export`. `main.ts` has 41 import statements and is the application entry point.

### Mixin assembly

`WarehouseScene` (in `scripts/game/main.ts`) is the single Phaser scene. 19 mixins are merged onto its prototype via `Object.assign` at lines 2699-2717:

- **warehouse/**: WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin
- **ai/**: AiWalletMixin, AiIntelMixin, AiMemoryMixin, AiReflectionMixin, AiDecisionMixin
- **bidding/**: BiddingMixin
- **ui/**: OverlayMixin, PanelsMixin, HistoryMixin
- **lobby/**: LobbyIndexMixin, CarouselMixin, CharacterSelectMixin
- **lan/**: LanIndexMixin (internally merges 6 sub-mixins: events, sync, reconnect, settle, game-flow, live2d)
- **core/**: RoundManagerMixin, SkillItemManagerMixin, SettlementManagerMixin

### Dependency injection

`scripts/game/core/deps.ts` provides a `Deps` container (LLM_BRIDGE, BATTLE_RECORD_BRIDGE, SETTLEMENT_BRIDGE). Prefer `import { Deps }` over `window.Xxx` for new code.

### Global variables

`eslint.config.js` (lines 14-51) registers ~36 globals (Phaser, WebSocket, NativeBridge, etc.). Some remain for backward compat despite ES Module migration. New code should use ES Module import/export, not attach to `window`.

## Key files

| File | Role |
|------|------|
| `scripts/game/main.ts` | Entry point — Phaser config, WarehouseScene class (2748 lines) |
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
| `scripts/game/ai/*.ts` | AI system (bidding, intel, memory, reflection, wallet, decision, context-builder, summarizer, game-history) |
| `scripts/llm/core/*.ts` | LLM system (manager, decision, prompt, error, settings, ui-bridge) |
| `scripts/llm/providers/*.ts` | LLM providers (DeepSeek, OpenAI, Qwen, GLM, Kimi) |
| `scripts/game/bridge/*.ts` | Bridge layer (settlement, battle-record, shop) |
| `scripts/game/warehouse/index.ts` | Warehouse grid rendering, artifact placement, reveal mechanics |
| `scripts/game/bidding/index.ts` | Bidding flow control, bid keypad, round resolution |
| `scripts/game/ui/*.ts` | UI overlays, side panels, history, item drawer |
| `scripts/game/lobby/*.ts` | Lobby navigation, carousel, character select |
| `scripts/game/lan/*.ts` | LAN multiplayer (events, sync, reconnect, settle, game-flow, live2d) |
| `scripts/audio/*.ts` | Audio manager + UI sound effects |
| `scripts/mobile/mobile-handler.ts` | Mobile/Android adaptation |
| `lan/client/lan-bridge.ts` | WebSocket client bridge |
| `lan/server/server.js` | LAN WebSocket server (separate npm install in lan/server/) |
| `proxy-server.js` | CORS proxy for LLM API calls (port 3000) |
| `types/*.d.ts` | TypeScript type definitions |

## Conventions

- **No comments** unless asked. The existing JSDoc in `main.ts` is documentation, not a style to follow.
- **Prettier**: no semicolons, double quotes, 120 print width, no trailing commas, LF line endings.
- **No unused vars**: ESLint `no-unused-vars` is `warn`. Keep it clean.
- **File naming**: kebab-case for files, PascalCase for classes.
- **Chinese** in all user-facing strings, comments, and documentation.

## Gotchas

- **禁止未经同意删除文件**: Never delete any file (including `rm`, `Remove-Item`, `git clean`) unless the user explicitly asks. Even if a file looks orphaned, unused, or AI-created — ask first.
- **TypeScript strict mode**: `tsconfig.json` has `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`. However, `checkJs: false` means `.js` files are not checked.
- **LAN server is separate**: `lan/server/` has its own `package.json`. Run `npm install` there before `npm run server`.
- **Android build**: Requires JDK 17 + Gradle + Android SDK at `D:\web\tool\`. See README for exact commands.
- **localStorage keys**: All prefixed with `mobao_`. Changing a key breaks backward compat for existing users.
- **Scene architecture**: Single Phaser scene (`WarehouseScene`) with 19 Mixins merged via Object.assign. Avoid adding methods directly to the class — prefer creating new Mixin files.
