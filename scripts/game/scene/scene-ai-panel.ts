/**
 * @file scene/scene-ai-panel.ts
 * @module scene/ai-panel
 * @description AI 逻辑面板渲染与 LLM 设置方法。
 *
 *              LLM 代理方法（26 个）已通过 main.ts 的
 *              Object.assign(WarehouseScene.prototype, LLM_BRIDGE.methods)
 *              直接摊到原型上，无需手写代理函数。
 *
 *              本文件保留 3 个非代理方法（含实现逻辑）：
 *                - renderAiLogicPanel: 渲染规则 AI 决策日志（需二次迁移到 ui/panels.ts）
 *                - getLlmSettings: 获取 LLM 设置（bridge 方法内部通过 this.getLlmSettings() 调用）
 *                - getLlmProvider: 获取 LLM Provider（同上）
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { LlmSettings } from "../../../types/llm"
import { formatBidRevealNumber } from "../core/utils"
import { LlmManager } from "../../llm/core/llm-manager"
import { DeepSeekProvider } from "../../llm/providers/deepseek-provider"
import { LLM_GLOBAL_SETTINGS_KEY } from "../../llm/core/llm-ui-bridge"

/**
 * 渲染 AI 逻辑面板（非 LLM 模式）
 *
 * 注意：此方法包含实现逻辑（渲染决策日志文本），需二次迁移到 ui/panels.ts
 */
export function renderAiLogicPanel(this: WarehouseSceneThis): void {
  if (!this.dom.aiLogicContent || !this.aiEngine || typeof this.aiEngine.getLastDecisionLog !== "function") {
    return
  }

  if (this.lastAiDecisionTelemetry && this.lastAiDecisionTelemetry.mode === "llm") {
    this.renderAiLogicPanelForLlm(this.lastAiDecisionTelemetry)
    return
  }

  const payload = this.aiEngine.getLastDecisionLog() as {
    round?: number
    currentBid?: number
    marketReference?: number
    clueRate?: number
    entries: Array<Record<string, unknown>>
  } | null

  if (!payload || !payload.entries || payload.entries.length === 0) {
    this.dom.aiLogicContent.textContent = "暂无AI出价决策。\n请至少完成一轮出价揭示后查看。"
    return
  }

  const lines: string[] = []
  const roundText = Number.isFinite(payload.round as number) ? payload.round : this.round
  lines.push(`回合 ${roundText} | 当前价 ${formatBidRevealNumber((payload.currentBid as number) || this.currentBid)}`)
  lines.push(
    `参考盘 ${formatBidRevealNumber((payload.marketReference as number) || this.currentBid)} | 线索率 ${Math.round(((payload.clueRate as number) || 0) * 100)}%`
  )
  lines.push("信心影响：信心越高，AI越愿意贴近心理预期和上限；信心越低，AI越可能观望或回撤。\n")
  lines.push("-")

  payload.entries.forEach((entry: Record<string, unknown>) => {
    const parts = (entry.confidenceParts as Record<string, number>) || {}
    const overheat = Math.round(((entry.overheatRatio as number) || 0) * 100)
    const threshold = Math.round(((entry.overheatThreshold as number) || 0) * 100)
    lines.push(`${entry.name || entry.playerId}（${entry.archetype || "未知人格"}）`)
    lines.push(
      `  最终出价: ${formatBidRevealNumber((entry.finalBid as number) || 0)} | 信心 ${Math.round(((entry.confidence as number) || 0) * 100)}%`
    )
    lines.push(
      `  私有线索: 线索率 ${Math.round(((entry.intelClueRate as number) || 0) * 100)}% | 品质率 ${Math.round(((entry.intelQualityRate as number) || 0) * 100)}% | 不确定 ${((entry.intelUncertainty as number) || 0).toFixed(2)} | 波动 ${((entry.intelSpreadRatio as number) || 0).toFixed(2)}`
    )
    lines.push(
      `  分布边缘: 上沿 ${((entry.intelUpperEdge as number) || 0).toFixed(2)} | 下沿 ${((entry.intelLowerEdge as number) || 0).toFixed(2)}`
    )
    lines.push(
      `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
    )
    lines.push(
      `  估值: ${formatBidRevealNumber((entry.perceivedValue as number) || 0)} | 上限 ${formatBidRevealNumber((entry.hardCap as number) || 0)}`
    )
    lines.push(
      `  心理预期: ${formatBidRevealNumber((entry.psychExpectedBid as number) || 0)}（目标 ${formatBidRevealNumber((entry.targetPsychExpected as number) || 0)}）`
    )
    lines.push(
      `  超预期: ${overheat}% | 回撤阈值 ${threshold}% | 低信息调整 ${formatBidRevealNumber((entry.floorAdjustAmount as number) || 0)}`
    )
    lines.push(`  工具影响: ${entry.toolTag || "无"} | 决策加分 ${((entry.toolScoreBoost as number) || 0).toFixed(2)}`)
    lines.push(
      `  行为: ${entry.actionTag || "常规"}${entry.mistakeTag ? ` | 失误:${entry.mistakeTag}` : ""}${entry.diversifyTag ? ` | 去同质:${entry.diversifyTag}` : ""}`
    )
    lines.push("-")
  })

  this.dom.aiLogicContent.textContent = lines.join("\n")
}

// === LLM 设置与 Provider 方法（bridge 方法内部通过 this.X() 调用，须保留在原型上）===

/** 获取 LLM 设置：优先从当前 Provider 读取，回退到 DeepSeekProvider 默认设置，再合并全局覆盖项 */
export function getLlmSettings(this: WarehouseSceneThis): LlmSettings {
  let globalSettings: Record<string, unknown> = {}
  try {
    const raw = window.localStorage.getItem(LLM_GLOBAL_SETTINGS_KEY)
    if (raw) {
      globalSettings = JSON.parse(raw)
    }
  } catch {
    // 忽略 JSON 解析错误
  }

  // 从 globalSettings 排除 provider 级字段，防止旧数据（如 endpoint）覆盖 provider 正确值
  const providerLevelFields = new Set([
    "endpoint",
    "apiKey",
    "model",
    "maxTokens",
    "timeoutMs",
    "temperature",
    "thinkingParams"
  ])
  const safeGlobal: Record<string, unknown> = {}
  for (const key of Object.keys(globalSettings)) {
    if (!providerLevelFields.has(key)) {
      safeGlobal[key] = globalSettings[key]
    }
  }

  if (LlmManager) {
    const provider = LlmManager.getProvider()
    if (provider) {
      const providerSettings = provider.loadSettings()
      return { ...providerSettings, ...safeGlobal } as LlmSettings
    }
  }
  return { ...DeepSeekProvider.getSettings(), ...safeGlobal } as LlmSettings
}

/** 获取 LLM Provider：优先返回已注册 Provider，回退到 DeepSeekProvider 兼容对象 */
export function getLlmProvider(this: WarehouseSceneThis) {
  const provider = LlmManager.getProvider()
  if (provider) {
    return provider
  }
  return {
    requestChat: (options: unknown) => DeepSeekProvider.requestChat(options as Record<string, unknown>),
    applySettings: (settings: Record<string, unknown>) => DeepSeekProvider.applySettings(settings)
  }
}
