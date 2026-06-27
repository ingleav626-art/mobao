# AI 多局上下文记忆 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real multi-game context to AI players — store recent N game records, inject into LLM prompts, add summarization, and decouple reflection from memory toggle.

**Architecture:** New `game-history.ts` stores per-game records (result, bids, reflection). `summarizer.ts` triggers periodic summaries. `memory.ts` delegates cross-game storage to `game-history.ts`. Settings UI adds context length stepper, reflection scope, and summary interval.

**Tech Stack:** TypeScript (strict-ish, matching project migration), IIFE + global namespace pattern, localStorage persistence.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/game/ai/game-history.ts` | **Create** | Multi-game history CRUD, localStorage persistence, N-game window |
| `scripts/game/ai/summarizer.ts` | **Create** | Periodic summary trigger, summary prompt, writeback |
| `scripts/game/ai/memory.ts` | Modify | Remove cross-game memory code, delegate to game-history |
| `scripts/game/ai/reflection.ts` | Modify | Decouple from multiGameMemoryEnabled, add scope option |
| `scripts/llm/core/llm-decision.ts` | Modify | Inject multi-game context into LLM requests |
| `scripts/llm/core/llm-prompt.ts` | Modify | Build multi-game context block in prompt |
| `scripts/llm/core/llm-settings.ts` | Modify | Read/write new settings fields |
| `scripts/llm/core/llm-ui-bridge.ts` | Modify | DOM refs + form read/write for new fields |
| `scripts/llm/providers/deepseek-llm.ts` | Modify | Add new settings defaults |
| All other providers | Modify | Add new settings defaults |
| `index.html` | Modify | Add stepper UI, reflection scope, summary interval |
| `scripts/game/ui/overlay.ts` | Modify | Wire stepper events, save new fields |
| `scripts/game/main.ts` | Modify | Add script tag for new files |
| `eslint.config.js` | Modify | Register new globals if needed |

---

### Task 1: Create `game-history.ts`

**Files:** Create `scripts/game/ai/game-history.ts`

- [ ] Step 1: Create the game-history module with types and CRUD operations
- [ ] Step 2: Register global in eslint.config.js
- [ ] Step 3: Add `<script>` tag in index.html

### Task 2: Create `summarizer.ts`

**Files:** Create `scripts/game/ai/summarizer.ts`

- [ ] Step 1: Create summarizer with trigger logic and prompt
- [ ] Step 2: Register global, add script tag

### Task 3: Settings UI + Storage

**Files:** Modify `index.html`, `llm-settings.ts`, `llm-ui-bridge.ts`, provider defaults

- [ ] Step 1: Add HTML for context length stepper, reflection scope, summary interval
- [ ] Step 2: Add DOM refs in llm-ui-bridge.ts
- [ ] Step 3: Add read/write in llm-settings.ts
- [ ] Step 4: Add defaults to all providers
- [ ] Step 5: Wire stepper events in overlay.ts

### Task 4: Modify `memory.ts`

**Files:** Modify `scripts/game/ai/memory.ts`

- [ ] Step 1: Replace cross-game memory storage with game-history calls
- [ ] Step 2: Update getAiConversationMessages to use game-history

### Task 5: Modify `reflection.ts`

**Files:** Modify `scripts/game/ai/reflection.ts`

- [ ] Step 1: Remove multiGameMemoryEnabled dependency
- [ ] Step 2: Add reflection scope (current game vs full context)

### Task 6: Modify LLM decision/prompt

**Files:** Modify `llm-decision.ts`, `llm-prompt.ts`

- [ ] Step 1: Inject multi-game history block into LLM messages
- [ ] Step 2: Update prompt building for new context format

### Task 7: Verification

- [ ] Step 1: Run lint
- [ ] Step 2: Manual smoke test flow
