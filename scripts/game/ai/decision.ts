/**
 * @file decision.ts
 * @module ai/decision
 * @description AI决策日志与调试面板。负责记录AI出价的决策过程（规则AI的信心拆解、
 *              LLM的prompt/response/纠错），并以可读格式渲染到调试面板中。
 *
 * 核心职责：
 *   - buildAiDecisionPanelSnapshot: 将一轮AI决策遥测数据格式化为可读文本快照
 *   - recordAiThoughtLogs: 将遥测数据存入当前局日志（runLog）
 *   - beginRunTracking: 新局开始时初始化日志结构
 *   - writeLog: 写入操作日志并渲染到面板
 *   - renderAiThoughtLog: 将历史局日志渲染到DOM
 *
 * @exports RunLog - 局日志接口
 * @exports buildAiDecisionPanelSnapshot / compactPanelTextForSnapshot / beginRunTracking / recordAiThoughtLogs / renderAiThoughtLog / writeLog
 * @exports AiDecisionMixin - 向后兼容的 Mixin 薄包装
 */
import { formatBidRevealNumber } from "../core/utils"

// ─── 类型定义 ───

export interface RunLog {
  runNo: number
  startedAt: number
  actionLogs: string[]
  aiThoughtLogs: unknown[]
  roundLogsByRound: Record<string, string[]>
  roundPanelTexts: Record<string, string>
}

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

// ─── 独立函数（可独立测试）───

export function compactPanelTextForSnapshot(text: string): string {
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
}

const CONTROL_MODE_LABELS: Record<string, string> = {
  llm: "大模型正常决策",
  "llm-corrected": "大模型纠错后决策",
  "rule-fallback-after-llm-tool": "回退原因: LLM工具执行后的二次请求失败",
  "rule-fallback-after-correction": "回退原因: 纠错后执行失败",
  "rule-fallback-correction-skipped": "回退原因: 纠错跳过(已达最大次数或请求失败)",
  "rule-fallback-llm-failed": "回退原因: LLM请求失败",
  "rule-fallback-llm-invalid": "回退原因: LLM返回无效决策(无出价)"
}

export function buildAiDecisionPanelSnapshot(
  telemetry: Record<string, unknown>,
  getLastDecisionLog: (() => Record<string, unknown> | null) | null
): string | null {
  if (!telemetry || (telemetry as { mode?: string }).mode !== "llm" || !Array.isArray((telemetry as { entries?: unknown[] }).entries)) {
    return null
  }

  const lines: string[] = [];
  const t = telemetry as { round: number; entries: DecisionEntry[] };
  lines.push(`回合 ${t.round} | 决策模式：混合（大模型+规则AI）`);
  lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。");
  lines.push("");
  lines.push("-");

  const rulePayload = getLastDecisionLog ? getLastDecisionLog() : null;
  const ruleEntries: unknown[] = rulePayload ? ((rulePayload as { entries?: unknown[] }).entries || []) : [];
  const ruleEntryById = new Map<string, RuleDecisionEntry>(
    ruleEntries.map((entry: unknown) => [(entry as DecisionEntry).playerId, entry as RuleDecisionEntry])
  );

  (t.entries || []).forEach((entry: DecisionEntry) => {
    const isLlm = entry.controlMode === "llm" || entry.controlMode === "llm-corrected";
    const isFallback = entry.controlMode && entry.controlMode.startsWith("rule-fallback");
    lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`);
    lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`);

    if (entry.controlMode) {
      const modeLabel = CONTROL_MODE_LABELS[entry.controlMode] || entry.controlMode;
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
        lines.push("  [System Prompt]");
        lines.push(compactPanelTextForSnapshot(String(entry.systemPrompt)));
      }
      if (entry.crossGameMemoryText) {
        lines.push("  [Cross-game Memory]");
        lines.push(compactPanelTextForSnapshot(String(entry.crossGameMemoryText)));
      }
      lines.push("  [User Prompt]");
      lines.push(compactPanelTextForSnapshot(String(entry.userPrompt)));
      lines.push("  [Model Response]");
      lines.push(compactPanelTextForSnapshot(String(entry.modelResponse)));
      if (entry.toolResultSummary) {
        lines.push("  [Tool Result]");
        lines.push(compactPanelTextForSnapshot(String(entry.toolResultSummary)));
      }
      if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
        lines.push("  [Error Correction Prompt]");
        lines.push(compactPanelTextForSnapshot(String(entry.errorCorrectionPrompt)));
        lines.push("  [Error Correction Response]");
        lines.push(compactPanelTextForSnapshot(String(entry.errorCorrectionResponse)));
      }
      if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
        lines.push("  [Follow-up Prompt]");
        lines.push(compactPanelTextForSnapshot(String(entry.followupPrompt)));
        lines.push("  [Follow-up Response]");
        lines.push(compactPanelTextForSnapshot(String(entry.followupResponse || entry.followupError)));
        if (entry.followupActionRejected) {
          lines.push("  [Follow-up Action Guard]");
          lines.push(compactPanelTextForSnapshot(String(entry.followupActionRejected)));
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
}

export function renderAiThoughtLog(
  aiThoughtContent: HTMLElement | null,
  runLogHistory: RunLog[]
): void {
  if (!aiThoughtContent) {
    return
  }

  const lines: string[] = [];
  const runs = runLogHistory.slice().reverse();
  runs.forEach((run) => {
    lines.push(`第 ${run.runNo} 局`);

    if (!run.aiThoughtLogs || run.aiThoughtLogs.length === 0) {
      lines.push("  - 暂无AI思考记录");
    } else {
      (run.aiThoughtLogs as Array<{ round?: number; playerName?: string; thought?: string; reasoningContent?: string }>).forEach((entry) => {
        lines.push(`  - R${entry.round} ${entry.playerName}: ${entry.thought}`);
        if (entry.reasoningContent) {
          lines.push(`    [推理过程]`);
          lines.push(`    ${entry.reasoningContent.split("\n").join("\n    ")}`);
        }
      });
    }

    const actionTail = (run.actionLogs || []).slice(-6);
    if (actionTail.length > 0) {
      lines.push("  最近日志:");
      actionTail.forEach((entry: string) => {
        lines.push(`    ${entry}`);
      });
    }
    lines.push("");
  });

  aiThoughtContent.textContent = lines.length > 0 ? lines.join("\n") : "暂无AI思考记录。";
}

export function beginRunTracking(
  runLogHistory: RunLog[],
  saveAiMemory: () => void,
  render: () => void
): RunLog {
  const runNo = (runLogHistory.length > 0 ? runLogHistory[runLogHistory.length - 1].runNo : 0) + 1;
  saveAiMemory();
  const runLog: RunLog = {
    runNo,
    startedAt: Date.now(),
    actionLogs: [],
    aiThoughtLogs: [],
    roundLogsByRound: {},
    roundPanelTexts: {}
  };
  runLogHistory.push(runLog);
  if (runLogHistory.length > 12) {
    runLogHistory.splice(0, runLogHistory.length - 12);
  }
  render();
  return runLog;
}

export function recordAiThoughtLogs(
  telemetry: Record<string, unknown>,
  currentRunLog: RunLog | null,
  dom: { aiLogicContent: HTMLElement | null },
  renderAiLogicPanelForLlm: ((telemetry: { round: number; entries?: Array<Record<string, unknown>> }) => void) | null,
  render: () => void
): void {
  const t = telemetry as { mode?: string; entries?: DecisionEntry[] };
  if (!t || t.mode !== "llm" || !Array.isArray(t.entries) || !currentRunLog) {
    return
  }

  t.entries.forEach((entry: DecisionEntry) => {
    const thought = String(entry && entry.thought ? entry.thought : "").trim();
    const reasoningContent = String(entry && entry.reasoningContent ? entry.reasoningContent : "").trim();
    const historyCount = entry && entry.historyMessagesCount ? entry.historyMessagesCount : 0;
    const crossGameCount = entry && entry.crossGameMemoryCount ? entry.crossGameMemoryCount : 0;
    const correctionAttempt = entry && entry.correctionAttempt ? entry.correctionAttempt : 0;
    const originalError = entry && entry.originalError ? entry.originalError : "";
    if (!thought && !reasoningContent && !historyCount && !crossGameCount && !correctionAttempt && !originalError) {
      return
    }

    const parts: string[] = [];
    const reasoningParts: string[] = [];
    if (correctionAttempt > 0) {
      parts.push(`[纠错第${correctionAttempt}次]`);
      if (originalError) {
        parts.push(`[原始错误] ${originalError}`);
      }
    }
    if (historyCount > 0 || crossGameCount > 0) {
      const gameInfo =
        crossGameCount > 0
          ? entry.inGameHistoryCount > 0
            ? `${crossGameCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
            : `${crossGameCount}局跨局记忆`
          : `${entry.inGameHistoryCount}条本局历史`;
      parts.push(`[注入${gameInfo}]`);
    }
    if (reasoningContent) {
      reasoningParts.push(reasoningContent);
    }
    if (thought) {
      parts.push(`[决策摘要] ${thought}`);
    }

    currentRunLog.aiThoughtLogs.push({
      round: (telemetry as { round: number }).round,
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
    });
  });

  if (currentRunLog.aiThoughtLogs.length > 80) {
    currentRunLog.aiThoughtLogs = currentRunLog.aiThoughtLogs.slice(-80);
  }

  const roundNo = Math.max(1, Math.round(Number((telemetry as { round?: number }).round) || 1));
  console.log(
    `[recordAiThoughtLogs] roundNo=${roundNo}, telemetry.round=${(telemetry as { round?: number }).round}, entries=${(telemetry as { entries?: unknown[] }).entries?.length}`
  );
  if (!currentRunLog.roundPanelTexts) {
    currentRunLog.roundPanelTexts = {};
  }
  if (renderAiLogicPanelForLlm && dom.aiLogicContent) {
    const tempDiv = document.createElement("div");
    const origContent = dom.aiLogicContent;
    dom.aiLogicContent = tempDiv;
    renderAiLogicPanelForLlm(telemetry as { round: number; entries?: Array<Record<string, unknown>> });
    const htmlContent = tempDiv.innerHTML;
    dom.aiLogicContent = origContent;
    if (htmlContent) {
      currentRunLog.roundPanelTexts[String(roundNo)] = htmlContent;
      console.log(
        `[recordAiThoughtLogs] saved roundPanelTexts[${roundNo}] as HTML, length=${htmlContent.length}`
      );
    }
  }

  render();
}

export function writeLog(
  text: string,
  round: number,
  currentRunLog: RunLog | null,
  dom: { actionLog: HTMLElement | null },
  render: () => void
): void {
  const line = `日志: ${text}`;
  if (dom.actionLog) {
    dom.actionLog.textContent = line;
  }
  if (currentRunLog) {
    currentRunLog.actionLogs.push(line);
    if (currentRunLog.actionLogs.length > 120) {
      currentRunLog.actionLogs = currentRunLog.actionLogs.slice(-120);
    }

    const roundNo = Math.max(1, Math.round(Number(round) || 1));
    const roundKey = String(roundNo);
    if (!Array.isArray(currentRunLog.roundLogsByRound[roundKey])) {
      currentRunLog.roundLogsByRound[roundKey] = [];
    }
    currentRunLog.roundLogsByRound[roundKey].push(line);
    if (currentRunLog.roundLogsByRound[roundKey].length > 120) {
      currentRunLog.roundLogsByRound[roundKey] = currentRunLog.roundLogsByRound[roundKey].slice(-120);
    }
  }
  render();
}

// ─── Mixin 薄包装（向后兼容）───

export const AiDecisionMixin: ThisType<{
  runSerial: number
  currentRunLog: RunLog | null
  runLogHistory: RunLog[]
  round: number
  dom: Record<string, HTMLElement | null>
  aiEngine?: { getLastDecisionLog(): Record<string, unknown> | null }
  saveAiMemoryToStorage(): void
  renderAiThoughtLog(): void
  renderAiLogicPanelForLlm?(telemetry: { round: number; entries?: Array<Record<string, unknown>> }): void
  compactPanelTextForSnapshot(text: string): string
}> = {
  compactPanelTextForSnapshot(text: string): string {
    return compactPanelTextForSnapshot(text)
  },

  buildAiDecisionPanelSnapshot(telemetry: Record<string, unknown>): string | null {
    const self = this as any
    const getLastDecisionLog = self.aiEngine && typeof self.aiEngine.getLastDecisionLog === "function"
      ? () => self.aiEngine.getLastDecisionLog()
      : null
    return buildAiDecisionPanelSnapshot(telemetry, getLastDecisionLog)
  },

  beginRunTracking(): void {
    const self = this as any
    const newLog = beginRunTracking(
      self.runLogHistory,
      () => self.saveAiMemoryToStorage(),
      () => self.renderAiThoughtLog()
    )
    self.runSerial = newLog.runNo
    self.currentRunLog = newLog
  },

  recordAiThoughtLogs(telemetry: Record<string, unknown>): void {
    const self = this as any
    recordAiThoughtLogs(
      telemetry,
      self.currentRunLog,
      self.dom,
      typeof self.renderAiLogicPanelForLlm === "function"
        ? (t: { round: number; entries?: Array<Record<string, unknown>> }) => self.renderAiLogicPanelForLlm(t)
        : null,
      () => self.renderAiThoughtLog()
    )
  },

  renderAiThoughtLog(): void {
    const self = this as any
    renderAiThoughtLog(self.dom.aiThoughtContent, self.runLogHistory)
  },

  writeLog(text: string): void {
    const self = this as any
    writeLog(text, self.round, self.currentRunLog, self.dom, () => self.renderAiThoughtLog())
  }
}
