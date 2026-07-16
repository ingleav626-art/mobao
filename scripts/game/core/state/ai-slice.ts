import type { AiPrivateIntel, ConversationMessage, CrossGameMemory } from "../../../../types/ai"
import type { LlmPlan, LlmTelemetry } from "../../../../types/llm"

export interface AiSlice {
  aiPrivateIntel: Record<string, AiPrivateIntel>
  aiResourceState: Record<string, unknown>
  aiRoundEffects: Record<string, unknown>
  lastAiIntelActions: Array<{
    playerId: string
    playerName: string
    actionType: string
    actionId: string
    revealed: unknown
    detail: string
    score: number
    effectTag: string
    signalStats: unknown
  }>
  aiLlmRoundPlans: Record<string, LlmPlan | null>
  aiLlmPlayerEnabled: Record<string, boolean>
  aiFoldState: Record<string, unknown>
  lastAiDecisionTelemetry: { mode: string; round: number; entries: LlmTelemetry[] } | null
  llmEverUsedThisRun: boolean
  aiReflectionState: string
  aiReflectionTotal: number
  aiReflectionCompleted: number
  aiReflectionStateDetail: string
  _reflectionBeforeUnload: ((e: BeforeUnloadEvent) => void) | null
  aiConversationByPlayer: Record<string, ConversationMessage[]>
  aiCrossGameMemory: Record<string, CrossGameMemory[]>
  aiCrossGameMessagesByPlayer: Record<string, Array<Array<Record<string, string>>>>
  aiReflectionPending: Record<string, unknown>
  aiConversationCache: Record<string, unknown>
}

export function createAiSlice(): AiSlice {
  return {
    aiPrivateIntel: {},
    aiResourceState: {},
    aiRoundEffects: {},
    lastAiIntelActions: [],
    aiLlmRoundPlans: {},
    aiLlmPlayerEnabled: {},
    aiFoldState: {},
    lastAiDecisionTelemetry: null,
    llmEverUsedThisRun: false,
    aiReflectionState: "idle",
    aiReflectionTotal: 0,
    aiReflectionCompleted: 0,
    aiReflectionStateDetail: "",
    _reflectionBeforeUnload: null,
    aiConversationByPlayer: {},
    aiCrossGameMemory: {},
    aiCrossGameMessagesByPlayer: {},
    aiReflectionPending: {},
    aiConversationCache: {}
  }
}

export function resetForNewRun(s: AiSlice): void {
  // 重置瞬态（本局 AI 状态），保留持久化字段：
  // - aiLlmPlayerEnabled（localStorage mobao_ai_llm_switch_v1，跨局保留的 LLM 勾选设置）
  // - aiConversationByPlayer（AI 记忆系统跨局对话，saveAiMemoryToStorage 持久化）
  // - aiCrossGameMemory（AI 跨局记忆，mobao_ai_memory_v1 持久化）
  // - aiCrossGameMessagesByPlayer（AI 跨局消息，随记忆系统持久化）
  s.aiPrivateIntel = {}
  s.aiResourceState = {}
  s.aiRoundEffects = {}
  s.lastAiIntelActions = []
  s.aiLlmRoundPlans = {}
  s.aiFoldState = {}
  s.lastAiDecisionTelemetry = null
  s.llmEverUsedThisRun = false
  s.aiReflectionState = "idle"
  s.aiReflectionTotal = 0
  s.aiReflectionCompleted = 0
  s.aiReflectionStateDetail = ""
  s._reflectionBeforeUnload = null
  s.aiReflectionPending = {}
  s.aiConversationCache = {}
}

export function resetForNewRound(s: AiSlice): void {
  s.aiRoundEffects = {}
  s.aiLlmRoundPlans = {}
  s.llmEverUsedThisRun = false
  s.lastAiIntelActions = []
}