/**
 * @file scripts/llm/core/decision/pure.ts
 * @module llm/core/decision/pure
 * @description LLM 决策子模块的纯函数。包含 AI 索引解析、模型配置校验、
 *              控制模式标签生成、决策条目详情渲染等，便于独立测试和复用。
 *
 * @requires ./types - TelemetryEntry, RuleDecisionEntry
 * @exports getAiIndexFromPlayerId, canUseLlmDecisionCore, isValidAiModelConfig,
 *          getControlModeLabel, buildDecisionSourceLabel, resolveControlMode,
 *          renderLlmEntryDetails, renderRuleEntryDetails
 */
import type { TelemetryEntry, RuleDecisionEntry } from "./types"

export function getAiIndexFromPlayerId(playerId: string): number {
  if (typeof playerId !== "string") return -1
  const aiMatch = playerId.match(/^ai(\d+)$/i)
  if (aiMatch) {
    return parseInt(aiMatch[1], 10) - 1
  }
  const pMatch = playerId.match(/^p(\d+)$/i)
  if (pMatch) {
    const num = parseInt(pMatch[1], 10)
    if (num === 1) return 0
    if (num === 3) return 1
    if (num === 4) return 2
  }
  return -1
}

export function canUseLlmDecisionCore(
  settings: { enabled?: boolean; apiKey?: string; endpoint?: string } | null,
  provider: { id: string } | null,
  nativeBridge: { getServerUrl?: () => string } | null
): boolean {
  if (!settings || !settings.enabled || !provider) {
    return false
  }
  const hasApiKey = typeof settings.apiKey === "string" && settings.apiKey.trim().length > 0
  if (hasApiKey) {
    return true
  }
  const endpoint = typeof settings.endpoint === "string" ? settings.endpoint.trim() : ""
  const isProxyEndpoint = endpoint.length > 0 && endpoint.startsWith("/")
  const isNative = !!nativeBridge && !!nativeBridge.getServerUrl
  if (isProxyEndpoint && !isNative) {
    return true
  }
  return false
}

export function isValidAiModelConfig(config: { apiKey?: string; model?: string } | null): config is {
  apiKey: string
  model: string
} {
  return Boolean(config && config.apiKey && config.model)
}

export function parseCrossGameMemoryText(text: string): {
  history?: string
  summary?: string
  experience?: string
  inGame?: string
} {
  const result: { history?: string; summary?: string; experience?: string; inGame?: string } = {}
  if (!text) return result

  const sections = text.split(/【(.+?)】/)
  for (let i = 1; i < sections.length; i += 2) {
    const title = sections[i]
    const content = sections[i + 1] || ""
    if (title.includes("跨局历史")) result.history = content.trim()
    else if (title.includes("上期总结")) result.summary = content.trim()
    else if (title.includes("经验本")) result.experience = content.trim()
    else if (title.includes("本局决策")) result.inGame = content.trim()
  }
  return result
}

export const CONTROL_MODE_LABELS: Record<string, string> = {
  llm: "大模型正常决策",
  "llm-corrected": "大模型纠错后决策",
  "rule-fallback-after-llm-tool": "回退原因: LLM工具执行后的二次请求失败",
  "rule-fallback-after-correction": "回退原因: 纠错后执行失败",
  "rule-fallback-correction-skipped": "回退原因: 纠错跳过(已达最大次数或请求失败)",
  "rule-fallback-llm-failed": "回退原因: LLM请求失败",
  "rule-fallback-llm-invalid": "回退原因: LLM返回无效决策(无出价)"
}

export function getControlModeLabel(mode: string | undefined): string {
  if (!mode) return ""
  return CONTROL_MODE_LABELS[mode] || mode
}

export function buildDecisionSourceLabel(
  plan: { failed?: boolean; model?: string } | null,
  llmSeatEnabled: boolean
): string {
  if (!plan || !llmSeatEnabled) return "规则AI"
  if (plan.failed) return "规则AI回退"
  return plan.model || "大模型"
}

export function resolveControlMode(
  plan: { controlMode?: string; failed?: boolean; hasBidDecision?: boolean } | null,
  llmSeatEnabled: boolean
): string {
  if (plan && plan.controlMode) return plan.controlMode
  if (plan && !plan.failed && plan.hasBidDecision && llmSeatEnabled) return "llm"
  return "rule"
}

export function escapeHtml(text: string): string {
  if (!text) return ""
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

export function renderLlmEntryDetails(entry: TelemetryEntry, formatBidRevealNumber: (v: number) => string): string {
  const parts: string[] = []

  if (entry.cacheHitTokens || entry.cacheMissTokens) {
    const cacheRate = entry.cacheHitRate || 0
    parts.push(
      `<div class="ai-cache-info">缓存命中: ${entry.cacheHitTokens || 0} tokens | 未命中: ${entry.cacheMissTokens || 0} tokens | 命中率: ${cacheRate}%</div>`
    )
  }

  if (entry.correctionAttempt && entry.correctionAttempt > 0) {
    parts.push(
      `<div class="ai-error-box">纠错次数: ${entry.correctionAttempt}/2${entry.originalError ? ` | 原始错误: ${entry.originalError}` : ""}</div>`
    )
  }

  if (
    (entry.historyMessagesCount && entry.historyMessagesCount > 0) ||
    (entry.crossGameMemoryCount && entry.crossGameMemoryCount > 0)
  ) {
    const gameInfo =
      entry.crossGameMemoryCount && entry.crossGameMemoryCount > 0
        ? entry.inGameHistoryCount && entry.inGameHistoryCount > 0
          ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
          : `${entry.crossGameMemoryCount}局跨局记忆`
        : `${entry.inGameHistoryCount}条本局历史`
    parts.push(`<div class="ai-memory-inject-info">跨局记忆注入: ${gameInfo}</div>`)
  }

  if (entry.llmActionName) {
    parts.push(
      `<div class="ai-decision-summary"><span class="label">大模型动作</span><span class="value">${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}</span></div>`
    )
  }

  if (entry.ruleActionName) {
    parts.push(
      `<div class="ai-decision-summary"><span class="label">规则动作</span><span class="value">${entry.ruleActionName}</span></div>`
    )
  }

  if (entry.thought) {
    parts.push(`<div class="ai-thought-box"><div class="thought-label">思考</div>${escapeHtml(entry.thought)}</div>`)
  }

  if (entry.reasoningContent) {
    parts.push(
      `<div class="ai-thought-box"><div class="thought-label">思考过程</div><pre style="margin:0;white-space:pre-wrap;font-size:11px;">${escapeHtml(entry.reasoningContent)}</pre></div>`
    )
  }

  if (entry.error) {
    parts.push(`<div class="ai-error-box">错误: ${escapeHtml(entry.error)}</div>`)
  }

  if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
    parts.push(
      `<div class="ai-decision-summary"><span class="label">回退规则出价参考</span><span class="value">${formatBidRevealNumber(entry.fallbackRuleBid)}</span></div>`
    )
  }

  const promptBlocks: string[] = []
  if (entry.systemPrompt) {
    promptBlocks.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">System Prompt</summary><pre>${escapeHtml(entry.systemPrompt)}</pre></details>`
    )
  }
  if (entry.crossGameMemoryText) {
    const sections = parseCrossGameMemoryText(entry.crossGameMemoryText)
    let blockContent = ""
    if (sections.history) {
      blockContent += `<div class="ai-memory-section"><div class="ai-memory-section-title">跨局历史</div><pre>${escapeHtml(sections.history)}</pre></div>`
    }
    if (sections.summary) {
      blockContent += `<div class="ai-memory-section"><div class="ai-memory-section-title">上期总结</div><pre>${escapeHtml(sections.summary)}</pre></div>`
    }
    if (sections.experience) {
      blockContent += `<div class="ai-memory-section"><div class="ai-memory-section-title">经验本</div><pre>${escapeHtml(sections.experience)}</pre></div>`
    }
    if (sections.inGame) {
      blockContent += `<div class="ai-memory-section"><div class="ai-memory-section-title">本局决策</div><pre>${escapeHtml(sections.inGame)}</pre></div>`
    }
    if (!blockContent) {
      blockContent = `<pre>${escapeHtml(entry.crossGameMemoryText)}</pre>`
    }
    promptBlocks.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">跨局记忆</summary><div class="ai-detail-content">${blockContent}</div></details>`
    )
  }
  promptBlocks.push(
    `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">User Prompt</summary><pre>${escapeHtml(entry.userPrompt || "")}</pre></details>`
  )
  promptBlocks.push(
    `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">Model Response</summary><pre>${escapeHtml(entry.modelResponse || "")}</pre></details>`
  )
  if (entry.toolResultSummary) {
    promptBlocks.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">Tool Result</summary><pre>${escapeHtml(entry.toolResultSummary)}</pre></details>`
    )
  }
  if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
    promptBlocks.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">Error Correction</summary><pre>Prompt:\n${escapeHtml(entry.errorCorrectionPrompt || "")}\n\nResponse:\n${escapeHtml(entry.errorCorrectionResponse || "")}</pre></details>`
    )
  }
  if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
    promptBlocks.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">Follow-up</summary><pre>Prompt:\n${escapeHtml(entry.followupPrompt || "")}\n\nResponse:\n${escapeHtml(entry.followupResponse || entry.followupError || "")}${entry.followupActionRejected ? `\n\nAction Guard:\n${escapeHtml(entry.followupActionRejected)}` : ""}</pre></details>`
    )
  }

  if (promptBlocks.length > 0) {
    parts.push(
      `<details class="ai-detail-section"><summary class="ai-detail-toggle">详细提示词与回复（${promptBlocks.length}项）</summary><div class="ai-detail-content">${promptBlocks.join("")}</div></details>`
    )
  }

  return parts.join("")
}

export function renderRuleEntryDetails(
  entry: TelemetryEntry,
  ruleEntryById: Map<string, RuleDecisionEntry>,
  formatBidRevealNumber: (v: number) => string
): string {
  const ruleEntry = ruleEntryById.get(entry.playerId)
  if (!ruleEntry) {
    return '<div style="color:#8a7a68;font-size:12px;">（无规则AI决策数据）</div>'
  }

  const parts = ruleEntry.confidenceParts || {}
  const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100)
  const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100)

  return `
      <div class="ai-decision-summary">
        <span class="label">信心</span>
        <span class="value">${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}</span>
        <span class="label">估值</span>
        <span class="value">${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}</span>
        <span class="label">心理预期</span>
        <span class="value">${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}</span>
        <span class="label">超预期</span>
        <span class="value">${overheat}% | 回撤阈值 ${threshold}%</span>
      </div>
      <details class="ai-detail-section">
        <summary class="ai-detail-toggle">详细数据</summary>
        <div class="ai-detail-content">
          <div class="ai-decision-summary">
            <span class="label">线索率</span>
            <span class="value">${Math.round((ruleEntry.intelClueRate || 0) * 100)}%</span>
            <span class="label">品质率</span>
            <span class="value">${Math.round((ruleEntry.intelQualityRate || 0) * 100)}%</span>
            <span class="label">不确定</span>
            <span class="value">${(ruleEntry.intelUncertainty || 0).toFixed(2)}</span>
            <span class="label">波动</span>
            <span class="value">${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}</span>
          </div>
          <div style="font-size:11px;color:#6b5a48;margin-top:6px;">
            <div>信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}</div>
            <div>工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}</div>
            <div>行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}</div>
          </div>
        </div>
      </details>
    `
}
