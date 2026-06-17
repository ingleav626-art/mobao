# AGENTS.md

## Project

"摸宝仓库" — a Phaser 3 auction/bidding game. Vanilla JS/TS, no framework, no backend (except LAN server). Chinese codebase.

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

No test suite exists. No `typecheck` script — TypeScript is transpiled by Vite, not tsc (`checkJs: false`).

**IMPORTANT**: Always run `npx tsc --noEmit` after making code changes to catch type errors before the user sees them.

## Architecture

**Module system**: Every `.ts` file is a `<script type="module">` in `index.html`. There is NO bundler import graph — modules communicate via `window.MobaoXxx` globals (IIFE pattern). The load order in `index.html:834-883` is critical and must not be reordered.

**Mixin assembly**: `WarehouseScene` (in `scripts/game/main.ts`) is the single Phaser scene. 16+ mixins are merged onto its prototype via `Object.assign` at the bottom of the file (~line 2544). Each mixin lives in its own file under `scripts/game/{warehouse,ai,bidding,ui,lobby,lan}/`.

**Dependency injection**: `scripts/game/core/deps.ts` provides a `Deps` container for shared references (LLM_BRIDGE, etc.). Prefer `import { Deps }` over `window.Xxx` for new code.

**Namespace globals**: All modules attach to `window.MobaoXxx` or `window.XxxData`. The full list of globals is in `eslint.config.js:17-49`. If you add a new global, register it there.

## Key files

| File | Role |
|------|------|
| `scripts/game/main.ts` | Entry point — Phaser config, WarehouseScene class (~2585 lines) |
| `scripts/game/core/constants.ts` | All game constants (grid, storage keys, quality) |
| `scripts/game/core/settings.ts` | Settings load/save |
| `scripts/game/data/artifacts.ts` | Artifact library (70+ items) |
| `scripts/game/ai/*.ts` | AI system (bidding, decision, memory, reflection) |
| `scripts/llm/**/*.ts` | LLM providers (DeepSeek, OpenAI, Qwen, GLM, Kimi) |
| `lan/server/server.js` | LAN WebSocket server (separate `npm install` in `lan/server/`) |
| `proxy-server.js` | CORS proxy for LLM API calls (port 3000) |

## Conventions

- **No comments** unless asked. The existing JSDoc in `main.ts` is documentation, not a style to follow.
- **Prettier**: no semicolons, double quotes, 120 print width, no trailing commas, LF line endings.
- **No unused vars**: ESLint `no-unused-vars` is `warn`. Keep it clean.
- **File naming**: kebab-case for files, PascalCase for classes.
- **Chinese** in all user-facing strings, comments, and documentation.

## Gotchas

- **Script order**: Changing the order of `<script>` tags in `index.html` will break the app. Dependencies load before dependents.
- **No module imports between files**: Files don't `import` each other at runtime (except `deps.ts`). They rely on globals being set by earlier scripts.
- **TypeScript is loose**: `strict: false`, `checkJs: false`. Types are hints, not guarantees.
- **LAN server is separate**: `lan/server/` has its own `package.json`. Run `npm install` there before `npm run server`.
- **Android build**: Requires JDK 17 + Gradle + Android SDK at `D:\web\tool\`. See README for exact commands.
- **localStorage keys**: All prefixed with `mobao_`. Changing a key breaks backward compat for existing users.
