/**
 * @file decision.js
 * @module ai/decision
 * @description AI决策日志与调试面板 Mixin。负责记录AI出价的决策过程（规则AI的信心拆解、
 *              LLM的prompt/response/纠错），并以可读格式渲染到调试面板中。
 *
 * 核心职责：
 *   - buildAiDecisionPanelSnapshot: 将一轮AI决策遥测数据格式化为可读文本快照
 *     - 规则AI：显示信心拆解、估值、人格、行为标签
 *     - LLM：显示system/user prompt、模型回复、纠错过程、工具调用结果
 *   - recordAiThoughtLogs: 将遥测数据存入当前局日志（runLog）
 *   - beginRunTracking: 新局开始时初始化日志结构
 *   - writeLog: 写入操作日志并渲染到面板
 *   - renderAiThoughtLog: 将历史局日志渲染到DOM
 *
 * 数据流：
 *   scene-llm.js (LLM决策) → telemetry → recordAiThoughtLogs() → currentRunLog → renderAiThoughtLog()
 *   bidding.js (规则AI决策) → lastDecisionLog → buildAiDecisionPanelSnapshot()
 *
 * @requires MobaoUtils - 工具函数（formatBidRevealNumber）
 *
 * @exports DecisionMixin - AI决策日志 Mixin，混入 Phaser Scene
 *
 * 混入方式：Object.assign(scene, MobaoAi.DecisionMixin)
 * 混入后 scene 将获得：currentRunLog, runLogHistory, runSerial,
 *   buildAiDecisionPanelSnapshot, compactPanelTextForSnapshot,
 *   beginRunTracking, recordAiThoughtLogs, renderAiThoughtLog, writeLog
 */
const { formatBidRevealNumber } = (window as unknown as Record<string, { formatBidRevealNumber(v: number): string }>).MobaoUtils

type RuleDecisionEntry = {
  playerId: string
  confidence?: number
  archetype?: string
  confidenceParts?: Record<string, number>
  overheatRatio?: number
  overheatThreshold?: number
  intelClueRate?: number
  intelQualityRate?: number
  intelUncertainty?: number
  intelSpreadRatio?: number
  perceivedValue?: number
  hardCap?: number
  psychExpectedBid?: number
  toolTag?: string
  toolScoreBoost?: number
  actionTag?: string
  mistakeTag?: string
  diversifyTag?: string
  [key: string]: unknown
}

type DecisionEntry = {
  playerId: string; playerName: string; controlMode: string; finalBid: number; decisionSource: string
  correctionAttempt: number; originalError?: string; historyMessagesCount: number; crossGameMemoryCount: number
  inGameHistoryCount: number; ruleDecision?: { confidence?: number; archetype?: string;[key: string]: unknown }
  [key: string]: unknown
}

export const AiDecisionMixin: Record<string, unknown> = {
  buildAiDecisionPanelSnapshot(telemetry: Record<string, unknown>): string | null {
    if (!telemetry || (telemetry as { mode?: string }).mode !== "llm" || !Array.isArray((telemetry as { entries?: unknown[] }).entries)) {
      return null
    }

    const lines = []
    const t = telemetry as { round: number; entries: DecisionEntry[] }
    lines.push(`回合 ${t.round} | 决策模式：混合（大模型+规则AI）`)
    lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。")
    lines.push("")
    lines.push("-")

    const rulePayload =
      this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
        ? this.aiEngine.getLastDecisionLog()
        : null
    const ruleEntryById = new Map<string, RuleDecisionEntry>(
      ((rulePayload && (rulePayload as { entries?: unknown[] }).entries) || []).map((entry: DecisionEntry) => [entry.playerId, entry])
    )

    const CONTROL_MODE_LABELS = {
      llm: "大模型正常决策",
      "llm-corrected": "大模型纠错后决策",
      "rule-fallback-after-llm-tool": "回退原因: LLM工具执行后的二次请求失败",
      "rule-fallback-after-correction": "回退原因: 纠错后执行失败",
      "rule-fallback-correction-skipped": "回退原因: 纠错跳过(已达最大次数或请求失败)",
      "rule-fallback-llm-failed": "回退原因: LLM请求失败",
      "rule-fallback-llm-invalid": "回退原因: LLM返回无效决策(无出价)"
    }

      ; (t.entries || []).forEach((entry) => {
        const isLlm = entry.controlMode === "llm" || entry.controlMode === "llm-corrected"
        const isFallback = entry.controlMode && entry.controlMode.startsWith("rule-fallback")
        lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`)
        lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`)

        if (entry.controlMode) {
          const modeLabel = CONTROL_MODE_LABELS[entry.controlMode] || entry.controlMode
          if (isFallback) {
            lines.push(`  ⚠️ ${modeLabel}`)
          } else if (isLlm) {
            lines.push(`  接管模式: ${modeLabel}`)
          }
        }
        if (isLlm) {
          if (entry.correctionAttempt > 0) {
            lines.push(`  纠错次数: ${entry.correctionAttempt}/2`)
            if (entry.originalError) {
              lines.push(`  原始错误: ${entry.originalError}`)
            }
          }
          if (entry.historyMessagesCount > 0 || entry.crossGameMemoryCount > 0) {
            const gameInfo =
              entry.crossGameMemoryCount > 0
                ? entry.inGameHistoryCount > 0
                  ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
                  : `${entry.crossGameMemoryCount}局跨局记忆`
                : `${entry.inGameHistoryCount}条本局历史`
            lines.push(`  跨局记忆注入: ${gameInfo}`)
          }
          if (entry.llmActionName) {
            lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`)
          }
          if (entry.ruleActionName) {
            lines.push(`  规则动作: ${entry.ruleActionName}`)
          }
          if (entry.thought) {
            lines.push(`  思考: ${entry.thought}`)
          }
          if (entry.error) {
            lines.push(`  错误: ${entry.error}`)
          }
          if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
            lines.push(`  回退规则出价参考: ${formatBidRevealNumber(Number(entry.fallbackRuleBid) || 0)}`)
          }
          if (entry.systemPrompt) {
            lines.push("  [System Prompt]")
            lines.push(this.compactPanelTextForSnapshot(entry.systemPrompt, 2200))
          }
          if (entry.crossGameMemoryText) {
            lines.push("  [Cross-game Memory]")
            lines.push(this.compactPanelTextForSnapshot(entry.crossGameMemoryText, 5000))
          }
          lines.push("  [User Prompt]")
          lines.push(this.compactPanelTextForSnapshot(entry.userPrompt, 10000))
          lines.push("  [Model Response]")
          lines.push(this.compactPanelTextForSnapshot(entry.modelResponse, 3000))
          if (entry.toolResultSummary) {
            lines.push("  [Tool Result]")
            lines.push(this.compactPanelTextForSnapshot(entry.toolResultSummary, 800))
          }
          if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
            lines.push("  [Error Correction Prompt]")
            lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionPrompt, 4200))
            lines.push("  [Error Correction Response]")
            lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionResponse, 4000))
          }
          if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
            lines.push("  [Follow-up Prompt]")
            lines.push(this.compactPanelTextForSnapshot(entry.followupPrompt, 4200))
            lines.push("  [Follow-up Response]")
            lines.push(this.compactPanelTextForSnapshot(entry.followupResponse || entry.followupError, 4000))
            if (entry.followupActionRejected) {
              lines.push("  [Follow-up Action Guard]")
              lines.push(this.compactPanelTextForSnapshot(entry.followupActionRejected, 500))
            }
          }
        } else {
          const ruleEntry = ruleEntryById.get(entry.playerId)
          if (ruleEntry) {
            const parts = ruleEntry.confidenceParts || {}
            const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100)
            const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100)
            lines.push(
              `  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`
            )
            lines.push(
              `  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`
            )
            lines.push(
              `  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`
            )
            lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`)
            lines.push(
              `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
            )
            lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`)
            lines.push(
              `  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`
            )
            lines.push(
              `  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`
            )
          } else {
            lines.push("  （无规则AI决策数据）")
          }
        }
        lines.push("-")
      })

    return lines.join("\n")
  },

  compactPanelTextForSnapshot(text: string): string {
    const input = typeof text === "string" ? text.trim() : ""
    if (!input) {
      return "    （空）"
    }

    let displayText = input
    try {
      const parsed = JSON.parse(input)
      displayText = JSON.stringify(parsed, null, 2)
    } catch (_e) { }

    return displayText
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n")
  },

  beginRunTracking(): void {
    this.runSerial += 1
    this.saveAiMemoryToStorage()
    const runLog = {
      runNo: this.runSerial,
      startedAt: Date.now(),
      actionLogs: [],
      aiThoughtLogs: [],
      roundLogsByRound: {},
      roundPanelTexts: {}
    }
    this.currentRunLog = runLog
    this.runLogHistory.push(runLog)
    if (this.runLogHistory.length > 12) {
      this.runLogHistory = this.runLogHistory.slice(-12)
    }
    this.renderAiThoughtLog()
  },

  recordAiThoughtLogs(telemetry: Record<string, unknown>): void {
    const t = telemetry as { mode?: string; entries?: DecisionEntry[] }
    if (!t || t.mode !== "llm" || !Array.isArray(t.entries) || !this.currentRunLog) {
      return
    }

    t.entries!.forEach((entry) => {
      const thought = String(entry && entry.thought ? entry.thought : "").trim()
      const reasoningContent = String(entry && entry.reasoningContent ? entry.reasoningContent : "").trim()
      const historyCount = entry && entry.historyMessagesCount ? entry.historyMessagesCount : 0
      const crossGameCount = entry && entry.crossGameMemoryCount ? entry.crossGameMemoryCount : 0
      const correctionAttempt = entry && entry.correctionAttempt ? entry.correctionAttempt : 0
      const originalError = entry && entry.originalError ? entry.originalError : ""
      if (!thought && !reasoningContent && !historyCount && !crossGameCount && !correctionAttempt && !originalError) {
        return
      }

      const parts = []
      const reasoningParts = []
      if (correctionAttempt > 0) {
        parts.push(`[纠错第${correctionAttempt}次]`)
        if (originalError) {
          parts.push(`[原始错误] ${originalError}`)
        }
      }
      if (historyCount > 0 || crossGameCount > 0) {
        const gameInfo =
          crossGameCount > 0
            ? entry.inGameHistoryCount > 0
              ? `${crossGameCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
              : `${crossGameCount}局跨局记忆`
            : `${entry.inGameHistoryCount}条本局历史`
        parts.push(`[注入${gameInfo}]`)
      }
      if (reasoningContent) {
        reasoningParts.push(reasoningContent)
      }
      if (thought) {
        parts.push(`[决策摘要] ${thought}`)
      }

      this.currentRunLog.aiThoughtLogs.push({
        round: telemetry.round,
        playerName: entry.playerName || entry.playerId || "AI",
        thought: parts.join("\n"),
        reasoningContent: reasoningParts.join("\n"),
        crossGameMemoryCount: crossGameCount,
        controlMode: entry.controlMode || "",
        finalBid: entry.finalBid,
        decisionSource: entry.decisionSource || "",
        llmActionName: entry.llmActionName || "",
        ruleActionName: entry.ruleActionName || "",
        actionExecuted: Boolean(entry.actionExecuted),
        error: entry.error || "",
        correctionAttempt: correctionAttempt,
        originalError: originalError,
        cacheHitTokens: entry.cacheHitTokens || 0,
        cacheMissTokens: entry.cacheMissTokens || 0,
        cacheHitRate: entry.cacheHitRate || 0,
        at: Date.now()
      })
    })

    if ((this.currentRunLog as { aiThoughtLogs: unknown[] }).aiThoughtLogs.length > 80) {
      ; (this.currentRunLog as { aiThoughtLogs: unknown[] }).aiThoughtLogs = (this.currentRunLog as { aiThoughtLogs: unknown[] }).aiThoughtLogs.slice(-80)
    }

    const roundNo = Math.max(1, Math.round(Number(telemetry.round) || 1))
    console.log(
      `[recordAiThoughtLogs] roundNo=${roundNo}, telemetry.round=${(telemetry as { round?: number }).round}, entries=${(telemetry as { entries?: unknown[] }).entries?.length}`
    )
    if (!this.currentRunLog.roundPanelTexts) {
      this.currentRunLog.roundPanelTexts = {}
    }
    if (typeof this.buildAiDecisionPanelSnapshot === "function") {
      const panelText = this.buildAiDecisionPanelSnapshot(telemetry)
      console.log(`[recordAiThoughtLogs] panelText length=${panelText?.length || 0}`)
      if (panelText) {
        this.currentRunLog.roundPanelTexts[String(roundNo)] = panelText
        console.log(
          `[recordAiThoughtLogs] saved roundPanelTexts[${roundNo}], keys=${Object.keys(this.currentRunLog.roundPanelTexts)}`
        )
      }
    }

    this.renderAiThoughtLog()
  },

  renderAiThoughtLog(): void {
    if (!this.dom.aiThoughtContent) {
      return
    }

    const lines = []
    const reasoningLines = []
    const runs = this.runLogHistory.slice().reverse()
    runs.forEach((run) => {
      lines.push(`第 ${run.runNo} 局`)

      if (!run.aiThoughtLogs || run.aiThoughtLogs.length === 0) {
        lines.push("  - 暂无AI思考记录")
      } else {
        run.aiThoughtLogs.forEach((entry) => {
          lines.push(`  - R${entry.round} ${entry.playerName}: ${entry.thought}`)
          if (entry.reasoningContent) {
            lines.push(`    [推理过程]`)
            lines.push(`    ${entry.reasoningContent.split("\n").join("\n    ")}`)
          }
        })
      }

      const actionTail = (run.actionLogs || []).slice(-6)
      if (actionTail.length > 0) {
        lines.push("  最近日志:")
        actionTail.forEach((entry) => {
          lines.push(`    ${entry}`)
        })
      }
      lines.push("")
    })

    this.dom.aiThoughtContent.textContent = lines.length > 0 ? lines.join("\n") : "暂无AI思考记录。"
  },

  writeLog(text: string): void {
    const line = `日志: ${text}`
    if (this.dom.actionLog) this.dom.actionLog.textContent = line
    if (this.currentRunLog) {
      this.currentRunLog.actionLogs.push(line)
      if (this.currentRunLog.actionLogs.length > 120) {
        this.currentRunLog.actionLogs = this.currentRunLog.actionLogs.slice(-120)
      }

      const roundNo = Math.max(1, Math.round(Number(this.round) || 1))
      const roundKey = String(roundNo)
      if (!Array.isArray(this.currentRunLog.roundLogsByRound[roundKey])) {
        this.currentRunLog.roundLogsByRound[roundKey] = []
      }
      this.currentRunLog.roundLogsByRound[roundKey].push(line)
      if (this.currentRunLog.roundLogsByRound[roundKey].length > 120) {
        this.currentRunLog.roundLogsByRound[roundKey] = this.currentRunLog.roundLogsByRound[roundKey].slice(-120)
      }
    }
    this.renderAiThoughtLog()
  }
}

  // 兼容层：保持 window.MobaoAi 全局变量可用
  ; (window as unknown as Record<string, unknown>).MobaoAi = (window as unknown as Record<string, unknown>).MobaoAi || {}
  ; ((window as unknown as Record<string, Record<string, unknown>>).MobaoAi).DecisionMixin = AiDecisionMixin
