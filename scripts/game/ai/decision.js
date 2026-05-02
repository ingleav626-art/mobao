(function setupMobaoAiDecision(global) {
  const { formatBidRevealNumber } = global.MobaoUtils;

  const AiDecisionMixin = {
    buildAiDecisionPanelSnapshot(telemetry) {
      if (!telemetry || telemetry.mode !== "llm" || !Array.isArray(telemetry.entries)) {
        return null;
      }

      const lines = [];
      lines.push(`回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`);
      lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。");
      lines.push("");
      lines.push("-");

      const rulePayload = this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
        ? this.aiEngine.getLastDecisionLog()
        : null;
      const ruleEntryById = new Map(
        ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
      );

      (telemetry.entries || []).forEach((entry) => {
        const isLlm = entry.controlMode === "llm";
        lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`);
        lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`);

        if (isLlm) {
          if (entry.correctionAttempt > 0) {
            lines.push(`  纠错次数: ${entry.correctionAttempt}/2`);
            if (entry.originalError) {
              lines.push(`  原始错误: ${entry.originalError}`);
            }
          }
          if (entry.historyMessagesCount > 0 || entry.crossGameMemoryCount > 0) {
            const gameInfo = entry.crossGameMemoryCount > 0 ? (entry.inGameHistoryCount > 0 ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史` : `${entry.crossGameMemoryCount}局跨局记忆`) : `${entry.inGameHistoryCount}条本局历史`;
            lines.push(`  跨局记忆注入: ${gameInfo}`);
          }
          if (entry.llmActionName) {
            lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`);
          }
          if (entry.ruleActionName) {
            lines.push(`  规则动作: ${entry.ruleActionName}`);
          }
          if (entry.thought) {
            lines.push(`  思考: ${entry.thought}`);
          }
          if (entry.error) {
            lines.push(`  错误: ${entry.error}`);
          }
          if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
            lines.push(`  回退规则出价参考: ${formatBidRevealNumber(entry.fallbackRuleBid)}`);
          }
          if (entry.systemPrompt) {
            lines.push("  [System Prompt]");
            lines.push(this.compactPanelTextForSnapshot(entry.systemPrompt, 2200));
          }
          if (entry.crossGameMemoryText) {
            lines.push("  [Cross-game Memory]");
            lines.push(this.compactPanelTextForSnapshot(entry.crossGameMemoryText, 5000));
          }
          lines.push("  [User Prompt]");
          lines.push(this.compactPanelTextForSnapshot(entry.userPrompt, 10000));
          lines.push("  [Model Response]");
          lines.push(this.compactPanelTextForSnapshot(entry.modelResponse, 3000));
          if (entry.toolResultSummary) {
            lines.push("  [Tool Result]");
            lines.push(this.compactPanelTextForSnapshot(entry.toolResultSummary, 800));
          }
          if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
            lines.push("  [Error Correction Prompt]");
            lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionPrompt, 4200));
            lines.push("  [Error Correction Response]");
            lines.push(this.compactPanelTextForSnapshot(entry.errorCorrectionResponse, 4000));
          }
          if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
            lines.push("  [Follow-up Prompt]");
            lines.push(this.compactPanelTextForSnapshot(entry.followupPrompt, 4200));
            lines.push("  [Follow-up Response]");
            lines.push(this.compactPanelTextForSnapshot(entry.followupResponse || entry.followupError, 4000));
            if (entry.followupActionRejected) {
              lines.push("  [Follow-up Action Guard]");
              lines.push(this.compactPanelTextForSnapshot(entry.followupActionRejected, 500));
            }
          }
        } else {
          const ruleEntry = ruleEntryById.get(entry.playerId);
          if (ruleEntry) {
            const parts = ruleEntry.confidenceParts || {};
            const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100);
            const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100);
            lines.push(`  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`);
            lines.push(`  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`);
            lines.push(`  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`);
            lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`);
            lines.push(`  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`);
            lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`);
            lines.push(`  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`);
            lines.push(`  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`);
          } else {
            lines.push("  （无规则AI决策数据）");
          }
        }
        lines.push("-");
      });

      return lines.join("\n");
    },

    compactPanelTextForSnapshot(text, maxLen) {
      const input = typeof text === "string" ? text.trim() : "";
      if (!input) {
        return "    （空）";
      }
      if (input.length <= maxLen) {
        return input.split("\n").map((l) => `    ${l}`).join("\n");
      }
      return `    ${input.slice(0, maxLen)}...`;
    },

    beginRunTracking() {
      this.runSerial += 1;
      this.saveAiMemoryToStorage();
      const runLog = {
        runNo: this.runSerial,
        startedAt: Date.now(),
        actionLogs: [],
        aiThoughtLogs: [],
        roundLogsByRound: {},
        roundPanelTexts: {}
      };
      this.currentRunLog = runLog;
      this.runLogHistory.push(runLog);
      if (this.runLogHistory.length > 12) {
        this.runLogHistory = this.runLogHistory.slice(-12);
      }
      this.renderAiThoughtLog();
    },

    recordAiThoughtLogs(telemetry) {
      if (!telemetry || telemetry.mode !== "llm" || !Array.isArray(telemetry.entries) || !this.currentRunLog) {
        return;
      }

      telemetry.entries.forEach((entry) => {
        const thought = String(entry && entry.thought ? entry.thought : "").trim();
        const reasoningContent = String(entry && entry.reasoningContent ? entry.reasoningContent : "").trim();
        const historyCount = entry && entry.historyMessagesCount ? entry.historyMessagesCount : 0;
        const crossGameCount = entry && entry.crossGameMemoryCount ? entry.crossGameMemoryCount : 0;
        const correctionAttempt = entry && entry.correctionAttempt ? entry.correctionAttempt : 0;
        const originalError = entry && entry.originalError ? entry.originalError : "";
        if (!thought && !reasoningContent && !historyCount && !crossGameCount && !correctionAttempt && !originalError) {
          return;
        }

        const parts = [];
        const reasoningParts = [];
        if (correctionAttempt > 0) {
          parts.push(`[纠错第${correctionAttempt}次]`);
          if (originalError) {
            parts.push(`[原始错误] ${originalError}`);
          }
        }
        if (historyCount > 0 || crossGameCount > 0) {
          const gameInfo = crossGameCount > 0 ? (entry.inGameHistoryCount > 0 ? `${crossGameCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史` : `${crossGameCount}局跨局记忆`) : `${entry.inGameHistoryCount}条本局历史`;
          parts.push(`[注入${gameInfo}]`);
        }
        if (reasoningContent) {
          reasoningParts.push(reasoningContent);
        }
        if (thought) {
          parts.push(`[决策摘要] ${thought}`);
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
          at: Date.now()
        });
      });

      if (this.currentRunLog.aiThoughtLogs.length > 80) {
        this.currentRunLog.aiThoughtLogs = this.currentRunLog.aiThoughtLogs.slice(-80);
      }

      const roundNo = Math.max(1, Math.round(Number(telemetry.round) || 1));
      if (!this.currentRunLog.roundPanelTexts) {
        this.currentRunLog.roundPanelTexts = {};
      }
      if (typeof this.buildAiDecisionPanelSnapshot === "function") {
        const panelText = this.buildAiDecisionPanelSnapshot(telemetry);
        if (panelText) {
          this.currentRunLog.roundPanelTexts[String(roundNo)] = panelText;
        }
      }

      this.renderAiThoughtLog();
    },

    renderAiThoughtLog() {
      if (!this.dom.aiThoughtContent) {
        return;
      }

      const lines = [];
      const reasoningLines = [];
      const runs = this.runLogHistory.slice().reverse();
      runs.forEach((run) => {
        lines.push(`第 ${run.runNo} 局`);

        if (!run.aiThoughtLogs || run.aiThoughtLogs.length === 0) {
          lines.push("  - 暂无AI思考记录");
        } else {
          run.aiThoughtLogs.forEach((entry) => {
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
          actionTail.forEach((entry) => {
            lines.push(`    ${entry}`);
          });
        }
        lines.push("");
      });

      this.dom.aiThoughtContent.textContent = lines.length > 0 ? lines.join("\n") : "暂无AI思考记录。";
    },

    writeLog(text) {
      const line = `日志: ${text}`;
      if (this.dom.actionLog) this.dom.actionLog.textContent = line;
      if (this.currentRunLog) {
        this.currentRunLog.actionLogs.push(line);
        if (this.currentRunLog.actionLogs.length > 120) {
          this.currentRunLog.actionLogs = this.currentRunLog.actionLogs.slice(-120);
        }

        const roundNo = Math.max(1, Math.round(Number(this.round) || 1));
        if (!Array.isArray(this.currentRunLog.roundLogsByRound[roundNo])) {
          this.currentRunLog.roundLogsByRound[roundNo] = [];
        }
        this.currentRunLog.roundLogsByRound[roundNo].push(line);
        if (this.currentRunLog.roundLogsByRound[roundNo].length > 120) {
          this.currentRunLog.roundLogsByRound[roundNo] = this.currentRunLog.roundLogsByRound[roundNo].slice(-120);
        }
      }
      this.renderAiThoughtLog();
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.DecisionMixin = AiDecisionMixin;
})(window);
