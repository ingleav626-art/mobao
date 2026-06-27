---
name: llm-provider-sync
description: "Synchronize a code change across all LLM provider files (deepseek, openai, qwen, glm, kimi) and llm-manager.ts. Use when editing maxTokens, clamp logic, request formatting, or any shared provider pattern."
---

# LLM Provider Sync

This project has 5 LLM provider files that share identical patterns. When you change one, you must change all of them consistently.

## Provider Files

```
scripts/llm/providers/deepseek-provider.ts
scripts/llm/providers/openai-provider.ts
scripts/llm/providers/qwen-provider.ts
scripts/llm/providers/glm-provider.ts
scripts/llm/providers/kimi-provider.ts
scripts/llm/providers/deepseek-llm.ts      # legacy deepseek wrapper
scripts/llm/core/llm-manager.ts             # orchestrator, may also need the change
scripts/llm/core/scene-llm.ts               # AI decision processing
```

## Procedure

1. **Read one provider file** to understand the current pattern (e.g., the `maxTokens` clamp line, the `requestChat` call, error handling).
2. **Verify the same pattern exists** in all 5 provider files + llm-manager.ts. Use `Grep` to confirm.
3. **Edit all 6 files** with the same change. Use `Edit` with the exact same `old_string`/`new_string` where the code is identical.
4. **Verify consistency** — Grep again to confirm no provider was missed.

## Common Sync Points

| Pattern | What to grep |
|---------|-------------|
| maxTokens clamp | `clamp(Math.round(toFiniteNumber` |
| request body assembly | `messages:.*systemPrompt` |
| Thinking mode / extended thinking | `thinking.*enabled\|enable_thinking` |
| Error retry logic | `retry.*count\|RETRY` |
| Token usage extraction | `usage.*prompt_tokens` |
| Provider registration | `new.*Provider\|registerProvider` |

## Gotchas

- `llm-manager.ts` is the orchestrator — it has its own `requestChat` that delegates to providers. Changes to the request/response shape often need updates there too.
- Provider files are **not** ES modules — they attach to `window.MobaoXxx` globals. No import graph.
- TypeScript is loose: `strict: false`, `checkJs: false`. Types are hints, not guarantees.
- The codebase uses Prettier: no semicolons, double quotes, 120 print width.
