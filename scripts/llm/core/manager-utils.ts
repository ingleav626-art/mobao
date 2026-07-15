/**
 * @file llm/core/manager-utils.ts
 * @module llm/core/manager-utils
 * @description LLM 管理器的纯工具函数。从 llm-manager.ts 提取而来，便于独立测试和复用。
 */

export const LLM_MANAGER_STORAGE_KEY = "mobao_llm_manager_v1"
export const CUSTOM_PROVIDERS_STORAGE_KEY = "mobao_custom_providers_v1"
export const MAX_LOG_ENTRIES = 120

export interface UsageInput {
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  cached_tokens?: number
  prompt_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

export interface NormalizedUsage {
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens: number
  cached_tokens: number
}

export function normalizeUsage(usage: UsageInput | null | undefined): NormalizedUsage | null {
  if (!usage || typeof usage !== "object") return null
  const result: NormalizedUsage = {
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    reasoning_tokens: 0,
    cached_tokens: 0
  }
  result.completion_tokens = usage.completion_tokens || 0
  result.total_tokens = usage.total_tokens || 0
  if (typeof usage.prompt_cache_hit_tokens === "number") {
    result.prompt_cache_hit_tokens = usage.prompt_cache_hit_tokens
  }
  if (typeof usage.prompt_cache_miss_tokens === "number") {
    result.prompt_cache_miss_tokens = usage.prompt_cache_miss_tokens
  }
  if (typeof usage.prompt_tokens === "number") {
    const cached = usage.prompt_tokens_details?.cached_tokens || usage.cached_tokens || 0
    result.prompt_cache_hit_tokens = cached
    result.prompt_cache_miss_tokens = usage.prompt_tokens - cached
  }
  if (typeof usage.reasoning_tokens === "number") {
    result.reasoning_tokens = usage.reasoning_tokens
  }
  if (typeof usage.cached_tokens === "number" && result.prompt_cache_hit_tokens === 0) {
    result.prompt_cache_hit_tokens = usage.cached_tokens
  }
  return result
}

export function broadcastToTokenMonitor(result: any, options: any): void {
  const callSource = options?._playerId ? `player:${options._playerId}` : "unknown"
  console.log(`[TokenMonitor] broadcast called from ${callSource}, ok:${result.ok}, elapsed:${result.elapsedMs}ms`)
  try {
    const normalizedUsage = normalizeUsage(result.usage)
    const payload = {
      type: "llm-request",
      payload: {
        ok: result.ok,
        model: result.model || "",
        elapsedMs: result.elapsedMs || 0,
        usage: normalizedUsage,
        rawUsage: result.usage,
        code: result.code || null,
        requestId: result.requestId || null,
        promptTokens: normalizedUsage
          ? normalizedUsage.prompt_cache_hit_tokens + normalizedUsage.prompt_cache_miss_tokens
          : 0,
        timestamp: Date.now(),
        playerId: options?._playerId || null,
        playerName: options?._playerName || null,
        source: "llm-manager"
      }
    }
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("llm-token-monitor")
      channel.postMessage(payload)
      channel.close()
    }
    localStorage.setItem("llm-token-monitor-live", JSON.stringify(payload))
    console.log(`[TokenMonitor] data sent, requestId:${result.requestId}`)
  } catch (e) {
    console.error("[TokenMonitor] broadcast error:", e)
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

export function parseJsonSafely(text: string): any {
  if (typeof text !== "string" || text.length === 0) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

export function compactText(value: unknown, maxLength: number): string {
  const input = typeof value === "string" ? value.trim() : ""
  if (input.length <= maxLength) {
    return input
  }
  return `${input.slice(0, maxLength)}...`
}

export function maskApiKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : ""
  if (!key) {
    return "(empty)"
  }
  if (key.length <= 8) {
    return "*".repeat(key.length)
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export function isProxyEndpoint(endpoint: unknown): boolean {
  const value = typeof endpoint === "string" ? endpoint.trim() : ""
  if (!value) {
    return false
  }
  if (value.startsWith("/")) {
    return true
  }
  try {
    const url = new URL(value, window.location.origin)
    return url.origin === window.location.origin
  } catch (_error) {
    return false
  }
}

export function extractErrorMessage(payload: any, fallbackStatus: number): string {
  if (payload && typeof payload === "object") {
    if (payload.error && typeof payload.error.message === "string") {
      return payload.error.message
    }
    if (typeof payload.message === "string") {
      return payload.message
    }
  }
  return `请求失败（HTTP ${fallbackStatus}）`
}

export function loadStoredApiKey(providerId: string): string {
  try {
    const value = window.localStorage.getItem(`mobao_${providerId}_api_key_v1`)
    return typeof value === "string" ? value.trim() : ""
  } catch (_error) {
    return ""
  }
}

export function saveStoredApiKey(providerId: string, value: string): void {
  const normalized = typeof value === "string" ? value.trim() : ""
  try {
    if (normalized) {
      window.localStorage.setItem(`mobao_${providerId}_api_key_v1`, normalized)
    } else {
      window.localStorage.removeItem(`mobao_${providerId}_api_key_v1`)
    }
  } catch (_error) {}
}
