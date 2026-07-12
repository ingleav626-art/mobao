import type { Player } from "../../../../types/game"
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { LlmDecisionDeps, RuleDecisionEntry, RoundBidEntry, TelemetryEntry } from "./types"
import { getControlModeLabel, buildDecisionSourceLabel, resolveControlMode, renderLlmEntryDetails, renderRuleEntryDetails } from "./pure"

export function createLlmPanelMethods(deps: LlmDecisionDeps) {
  const { LLM_SETTINGS, formatBidRevealNumber } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    captureAiDecisionTelemetry(roundBids: Array<Record<string, unknown>>): void {
      const aiPlayers = this.players.filter((player: Player) => !player.isHuman)
      const hasLlm = aiPlayers.some((player: Player) => Boolean(this.aiLlmRoundPlans[player.id]))

      if (!hasLlm) {
        this.lastAiDecisionTelemetry = {
          mode: "rule",
          round: this.round
        }
        return
      }

      const rulePayload = this.aiEngine.getLastDecisionLog()
      const ruleEntryById = new Map<string, RuleDecisionEntry>(
        ((rulePayload && rulePayload.entries) || []).map((entry: RuleDecisionEntry) => [entry.playerId, entry])
      )

      const bidByPlayerId = new Map<string, number>((roundBids || []).map((entry) => [String((entry as RoundBidEntry).playerId), Number((entry as RoundBidEntry).bid) || 0]))
      const entries = aiPlayers.map((player: Player) => {
        const plan = this.aiLlmRoundPlans[player.id] || null
        const llmSeatEnabled = this.canUseLlmDecisionForPlayer(player.id)
        const ruleEntry = ruleEntryById.get(player.id)
        const finalBid = bidByPlayerId.has(player.id)
          ? (bidByPlayerId.get(player.id) ?? 0)
          : ruleEntry
            ? (ruleEntry.finalBid ?? 0)
            : 0
        const executedActions = this.currentRoundUsage[player.id] || []
        const llmExecutedActionId = plan && plan.actionExecuted ? plan.toolActionId || plan.actionId || "" : ""
        const hasLlmExecutedAction = Boolean(llmExecutedActionId) && executedActions.includes(llmExecutedActionId)
        const llmActionName = hasLlmExecutedAction ? this.getActionDefById(llmExecutedActionId).name : ""
        const ruleActionIds = executedActions.filter((actionId: string) => actionId !== llmExecutedActionId)
        const ruleActionName =
          ruleActionIds.length > 0
            ? ruleActionIds.map((actionId: string) => this.getActionDefById(actionId).name).join("、")
            : ""
        const decisionSource = buildDecisionSourceLabel(plan, llmSeatEnabled)

        return {
          playerId: player.id,
          playerName: player.name,
          finalBid,
          folded: Boolean(plan && plan.folded),
          decisionSource,
          llmActionName,
          ruleActionName,
          actionExecuted: hasLlmExecutedAction,
          controlMode: resolveControlMode(plan, llmSeatEnabled),
          thought: plan && plan.thought ? plan.thought : "",
          reasoningContent: plan && plan.reasoningContent ? plan.reasoningContent : "",
          error: plan && plan.failed ? plan.error || "未知错误" : "",
          fallbackRuleBid: plan && !plan.failed && plan.hasBidDecision ? null : ruleEntry ? ruleEntry.finalBid : null,
          systemPrompt: plan && plan.systemPrompt ? plan.systemPrompt : "",
          userPrompt: plan && plan.userPrompt ? plan.userPrompt : "",
          modelResponse: plan && plan.modelResponse ? plan.modelResponse : "",
          toolResultSummary: plan && plan.actionExecuted && plan.toolResultSummary ? plan.toolResultSummary : "",
          followupPrompt: plan && plan.followupPrompt ? plan.followupPrompt : "",
          followupResponse: plan && plan.followupResponse ? plan.followupResponse : "",
          followupError: plan && plan.followupError ? plan.followupError : "",
          followupActionRejected: plan && plan.followupActionRejected ? plan.followupActionRejected : "",
          correctionAttempt: plan && plan.correctionAttempt ? plan.correctionAttempt : 0,
          originalError: plan && plan.originalError ? plan.originalError : "",
          errorCorrectionPrompt: plan && plan.errorCorrectionPrompt ? plan.errorCorrectionPrompt : "",
          errorCorrectionResponse: plan && plan.errorCorrectionResponse ? plan.errorCorrectionResponse : "",
          historyMessagesCount: plan && plan.historyMessagesCount ? plan.historyMessagesCount : 0,
          crossGameMemoryCount: plan && plan.crossGameMemoryCount ? plan.crossGameMemoryCount : 0,
          inGameHistoryCount: plan && plan.inGameHistoryCount ? plan.inGameHistoryCount : 0,
          historyMessagesPreview: plan && plan.historyMessagesPreview ? plan.historyMessagesPreview : "",
          crossGameMemoryText: plan && plan.crossGameMemoryText ? plan.crossGameMemoryText : "",
          cacheHitTokens: plan && plan.cacheHitTokens ? plan.cacheHitTokens : 0,
          cacheMissTokens: plan && plan.cacheMissTokens ? plan.cacheMissTokens : 0,
          cacheHitRate: plan && plan.cacheHitRate ? plan.cacheHitRate : 0,
          usage: plan && plan.usage ? plan.usage : undefined
        }
      })

      this.lastAiDecisionTelemetry = {
        mode: "llm",
        round: this.round,
        entries: entries as Array<Record<string, unknown>>
      }
    },

    renderAiLogicPanelForLlm(telemetry: { round: number; entries?: TelemetryEntry[] }): void {
      const rulePayload =
        this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
          ? this.aiEngine.getLastDecisionLog()
          : null
      const ruleEntryById = new Map<string, RuleDecisionEntry>(
        ((rulePayload && rulePayload.entries) || []).map((entry: RuleDecisionEntry) => [entry.playerId, entry])
      )

      const fragment = document.createDocumentFragment()

      const headerDiv = document.createElement("div")
      headerDiv.style.cssText = "padding: 8px 12px; font-size: 12px; color: #6b5a48; border-bottom: 1px solid #e8d8b8;"
      headerDiv.textContent = `回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`
      fragment.appendChild(headerDiv)

        ; (telemetry.entries || []).forEach((entry: TelemetryEntry) => {
          const isLlm = entry.controlMode === "llm" || entry.controlMode === "llm-corrected"
          const isFallback = entry.controlMode && entry.controlMode.startsWith("rule-fallback")

          const card = document.createElement("div")
          card.className = "ai-player-card"

          const badgeClass = isFallback ? "badge-fallback" : isLlm ? "badge-llm" : "badge-rule"
          const badgeText = isFallback ? "回退" : isLlm ? "大模型" : "规则AI"
          const modeLabel = getControlModeLabel(entry.controlMode)

          card.innerHTML = `
          <div class="ai-player-card-header">
            <span class="player-name">${entry.playerName}（${entry.playerId}）</span>
            <span class="control-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="ai-player-card-body">
            <div class="ai-decision-summary">
              <span class="label">最终出价</span>
              <span class="value bid-value">${formatBidRevealNumber(entry.finalBid)}</span>
              <span class="label">决策来源</span>
              <span class="value">${entry.decisionSource || "-"}</span>
              ${modeLabel ? `<span class="label">接管模式</span><span class="value">${modeLabel}</span>` : ""}
            </div>
            ${isFallback ? `<div class="ai-error-box">⚠️ ${modeLabel}</div>` : ""}
            ${isLlm ? renderLlmEntryDetails(entry, formatBidRevealNumber) : renderRuleEntryDetails(entry, ruleEntryById, formatBidRevealNumber)}
          </div>
        `
          fragment.appendChild(card)
        })

      const aiLogicContent = this.dom.aiLogicContent
      if (aiLogicContent) {
        aiLogicContent.innerHTML = ""
        aiLogicContent.appendChild(fragment)
      }

      const hasConversationMessages = this.aiConversationCache && Object.keys(this.aiConversationCache).length > 0
      if (this.dom.aiViewMessagesBtn) {
        if (hasConversationMessages) {
          this.dom.aiViewMessagesBtn.classList.remove("hidden")
        } else {
          this.dom.aiViewMessagesBtn.classList.add("hidden")
        }
      }
    },

    showAiConversationMessages(): void {
      if (!this.aiConversationCache || Object.keys(this.aiConversationCache).length === 0) {
        this.writeLog("当前无Messages数据。")
        return
      }

      const messages = this.aiConversationCache
      const lines: string[] = []
      lines.push("═══ 当前完整 Messages ═══")
      lines.push(`回合: ${this.round}`)
      lines.push("")

      Object.keys(messages)
        .sort()
        .forEach((playerId) => {
          const playerMessages = messages[playerId]
          if (!Array.isArray(playerMessages)) {
            return
          }
          lines.push(`──── ${playerId} ────`)
          lines.push(`消息数: ${playerMessages.length}`)
          lines.push("")
          playerMessages.forEach((msg: Record<string, unknown>, idx: number) => {
            const role = msg.role || "unknown"
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)
            lines.push(`[${idx + 1}] role: ${role}`)
            lines.push("content:")
            content.split("\n").forEach((line: string) => lines.push(`  ${line}`))
            lines.push("")
          })
          lines.push("")
        })

      const contentEl = this.dom.aiLogicContent
      if (contentEl) contentEl.textContent = lines.join("\n")
    }
  }

  return methods
}
