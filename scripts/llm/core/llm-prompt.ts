/**
 * @file llm/core/llm-prompt.js
 * @module llm/core/llm-prompt
 * @description LLM Prompt 构建与决策解析模块。负责 payload 组装、prompt/messages 构建、
 *              JSON 提取、动作解析、plan 标准化、工具结果摘要。
 *              从 scene-llm.js 拆分而来。
 */
import { tryExtractDecisionJson } from './llm-error.js'

export function createLlmPromptModule(deps: any) {
  const {
    GAME_SETTINGS,
    SKILL_DEFS,
    ITEM_DEFS,
    pickFirstDefined,
    normalizeActionToken,
    isNoneActionText,
    compactOneLine
  } = deps

  const methods = {
    buildAiLlmRoundPayload(player: any) {
      const playerId = player.id
      const isInitialRound = this.round <= 1
      const compact = !isInitialRound
      const persona = this.aiEngine.personalityMap[playerId] || null
      const actionConstraint = this.buildAiActionConstraintBlock(playerId)
      const resource = this.getAiResourceSnapshot(playerId)

      const bidHistory = this.buildBidHistorySnapshot()
      const publicEvents = this.buildPublicEventSnapshot({ compact, viewerId: playerId })

      const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[playerId]
      const characterInfo = charAssign
        ? {
          characterId: charAssign.characterId,
          characterName: charAssign.characterName,
          skillName: charAssign.skillName,
          passive: charAssign.passive ? charAssign.passive.label : null
        }
        : null

      const availableSkills = SKILL_DEFS.filter((entry: any) => Number(resource.skills[entry.id] || 0) > 0).map(
        (entry: any) => ({
          name: entry.name,
          description: entry.description,
          remaining: Number(resource.skills[entry.id] || 0),
          timing: "出价前",
          resultPublic: false
        })
      )

      const availableItems = ITEM_DEFS.filter((entry: any) => Number(resource.items[entry.id] || 0) > 0).map((entry: any) => ({
        name: entry.name,
        description: entry.description,
        remaining: Number(resource.items[entry.id] || 0),
        timing: "出价前",
        resultPublic: false
      }))

      return {
        gameState: {
          round: {
            current: this.round,
            total: GAME_SETTINGS.maxRounds
          },
          selfId: playerId,
          selfName: player.name,
          wallet: this.getAiWallet(playerId),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          folded: false,
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        selfRoleAndTools: {
          character: characterInfo,
          roleName: persona ? persona.archetype : "规则型",
          passive: persona
            ? `激进${persona.aggression.toFixed(2)} / 纪律${persona.discipline.toFixed(2)} / 跟风${persona.followRate.toFixed(2)}`
            : "默认规则人格",
          activeSkills: availableSkills,
          items: availableItems
        },
        otherPlayersPublic: this.buildOtherPlayersPublicInfo(playerId, { compact }),
        catalogSummary: this.buildCatalogSummary({ compact }),
        ...(compact
          ? { roundPublicStateTable: this.buildRoundPublicStateTable(playerId) }
          : { bidHistory, publicEvents }),
        privateIntel: this.buildAiPrivateIntelBlock(playerId),
        actionConstraints: {
          canBid: actionConstraint.canBid,
          canFold: actionConstraint.canFold,
          availableSkills: actionConstraint.availableSkills,
          availableItems: actionConstraint.availableItems,
          notes: actionConstraint.notes
        }
      }
    },

    buildAiIncrementalPayload(player: any) {
      const playerId = player.id
      const previousRound = this.round - 1
      const actionConstraint = this.buildAiActionConstraintBlock(playerId)
      const resource = this.getAiResourceSnapshot(playerId)

      const bidHistory = this.buildBidHistorySnapshot()
      const lastRoundBid = bidHistory.find((entry: any) => entry.round === previousRound)

      const availableSkills = SKILL_DEFS.filter((entry: any) => Number(resource.skills[entry.id] || 0) > 0).map(
        (entry: any) => ({
          name: entry.name,
          remaining: Number(resource.skills[entry.id] || 0)
        })
      )

      const availableItems = ITEM_DEFS.filter((entry: any) => Number(resource.items[entry.id] || 0) > 0).map((entry: any) => ({
        name: entry.name,
        remaining: Number(resource.items[entry.id] || 0)
      }))

      const lastRoundActions: Record<string, any> = {}
      this.players.forEach((p: any) => {
        if (p.id === playerId) return
        const usage = (this.playerUsageHistory[p.id] || []).find((entry: any) => entry.round === previousRound)
        if (usage && usage.actions && usage.actions.length > 0) {
          lastRoundActions[p.id] = {
            playerName: p.name,
            actions: usage.actions.map((actionId: string) => {
              const def = this.getActionDefById(actionId)
              return { type: def.type, name: def.name, description: def.description || "" }
            })
          }
        }
      })

      return {
        round: {
          current: this.round,
          previous: previousRound
        },
        lastRoundResult: {
          bids: lastRoundBid ? lastRoundBid.bids : {},
          winner: lastRoundBid ? lastRoundBid.winner : null,
          actions: lastRoundActions
        },
        currentWallet: this.getAiWallet(playerId),
        currentLeader: this.bidLeader,
        currentBid: this.currentBid,
        selfAvailableTools: {
          skills: availableSkills,
          items: availableItems
        },
        actionConstraints: {
          canBid: actionConstraint.canBid,
          canFold: actionConstraint.canFold,
          availableSkills: actionConstraint.availableSkills,
          availableItems: actionConstraint.availableItems
        },
        privateIntel: this.buildAiPrivateIntelBlock(playerId)
      }
    },

    buildAiFollowupRoundPayload(player: any, currentPlan: any, toolSummary?: string) {
      const resolvedToolSummary = toolSummary || (currentPlan && currentPlan.toolResultSummary) || ""
      return {
        requestStage: "followup-after-tool",
        round: this.round,
        gameState: {
          selfId: player.id,
          selfName: player.name,
          wallet: this.getAiWallet(player.id),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        followupContext: {
          toolResultSummary: resolvedToolSummary,
          toolActionType: currentPlan && currentPlan.toolActionType ? currentPlan.toolActionType : "none",
          toolActionId: currentPlan && currentPlan.toolActionId ? currentPlan.toolActionId : "none",
          initialDecision: {
            bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
            actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
            actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none"
          }
        }
      }
    },

    buildAiDecisionUserPrompt(payload: any, extraBlocks: string[] = [], options: any = {}) {
      const requestStage = options.requestStage || "initial"
      const isFollowup = requestStage === "followup-after-tool"
      const isFirstRound = options.isFirstRound === true
      const roundNoRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.current,
        payload && payload.round,
        this.round
      )
      const totalRoundRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total,
        GAME_SETTINGS.maxRounds
      )
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, this.round)
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
      const isFinalRound = roundNo >= totalRounds
      const roundStateText = isFinalRound ? "最终轮" : "后续轮"
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"

      let base: string[]
      if (isFollowup) {
        base = [
          "【任务】第 " + roundNo + "/" + totalRounds + " 轮 follow-up。根据工具结果修正最终出价。",
          finalRoundHint,
          "【硬约束】skill=无, item=无，只允许更新 bid/thought。"
        ]
      } else if (isFirstRound) {
        base = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint,
          "【当前状态数据】",
          JSON.stringify(payload)
        ]
      } else {
        base = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint,
          "【上一轮结算信息】",
          JSON.stringify(payload)
        ]
      }

      if (Array.isArray(extraBlocks) && extraBlocks.length > 0) {
        base.push("")
        base.push("补充信息（优先参考）：")
        extraBlocks.forEach((block, index) => {
          base.push("- 补充" + (index + 1) + ": " + String(block || ""))
        })
      }

      return base.join("\n")
    },

    buildAiDecisionMessages(payload: any, options: any = {}) {
      const requestStage = options.requestStage || "initial"
      const isFollowup = requestStage === "followup-after-tool"
      const isFirstRound = options.isFirstRound === true
      const systemPrompt = options.systemPrompt || ""
      const historyMessages = options.historyMessages || []
      const extraBlocks = options.extraBlocks || []

      const messages: Array<{ role: string; content: string }> = [{ role: "system", content: systemPrompt }]

      if (payload && payload.catalogSummary) {
        messages.push({
          role: "user",
          content: "【图鉴摘要】\n" + JSON.stringify(payload.catalogSummary, null, 2)
        })
      }

      if (payload && payload.selfRoleAndTools) {
        messages.push({
          role: "user",
          content: "【角色与工具】\n" + JSON.stringify(payload.selfRoleAndTools, null, 2)
        })
      }

      if (payload && payload.otherPlayersPublic) {
        messages.push({
          role: "user",
          content: "【其他玩家公开信息】\n" + JSON.stringify(payload.otherPlayersPublic, null, 2)
        })
      }

      if (Array.isArray(historyMessages) && historyMessages.length > 0) {
        historyMessages.forEach((m: any) => {
          messages.push({ role: m.role || "user", content: m.content || "" })
        })
      }

      if (payload && payload.gameState) {
        messages.push({
          role: "user",
          content: "【游戏状态】\n" + JSON.stringify(payload.gameState, null, 2)
        })
      }

      if (payload && payload.privateIntel) {
        messages.push({
          role: "user",
          content: "【私人情报】\n" + JSON.stringify(payload.privateIntel, null, 2)
        })
      }

      if (payload && payload.actionConstraints) {
        messages.push({
          role: "user",
          content: "【行动约束】\n" + JSON.stringify(payload.actionConstraints, null, 2)
        })
      }

      if (payload && payload.bidHistory) {
        messages.push({
          role: "user",
          content: "【出价历史】\n" + JSON.stringify(payload.bidHistory, null, 2)
        })
      }

      if (payload && payload.publicEvents && payload.publicEvents.length > 0) {
        const compactEvents = payload.publicEvents.map((evt: any) => {
          if (evt.actionType === "public-event") {
            return `${evt.stage}: ${evt.publicResult || evt.effectText || ""}`
          }
          return `${evt.stage}: ${evt.playerName}使用${evt.actionName}`
        })
        messages.push({
          role: "user",
          content: "【公共事件】\n" + compactEvents.join("")
        })
      }

      if (payload && payload.roundPublicStateTable) {
        messages.push({
          role: "user",
          content: "【轮次公开状态】\n" + JSON.stringify(payload.roundPublicStateTable, null, 2)
        })
      }

      if (payload && payload.lastRoundResult) {
        messages.push({
          role: "user",
          content: "【上一轮结算】\n" + JSON.stringify(payload.lastRoundResult, null, 2)
        })
      }

      if (payload && payload.round) {
        messages.push({
          role: "user",
          content: "【轮次信息】\n" + JSON.stringify(payload.round, null, 2)
        })
      }

      if (payload && payload.selfAvailableTools) {
        messages.push({
          role: "user",
          content: "【可用工具】\n" + JSON.stringify(payload.selfAvailableTools, null, 2)
        })
      }

      const roundNoRaw =
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.current
          ? payload.gameState.round.current
          : payload && payload.round && payload.round.current
            ? payload.round.current
            : this.round
      const totalRoundRaw =
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total
          ? payload.gameState.round.total
          : GAME_SETTINGS.maxRounds
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, this.round)
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
      const isFinalRound = roundNo >= totalRounds
      const roundStateText = isFinalRound ? "最终轮" : "后续轮"
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"

      let taskContent: string
      if (isFollowup) {
        taskContent = [
          "【任务】第 " + roundNo + "/" + totalRounds + " 轮 follow-up。根据工具结果修正最终出价。",
          finalRoundHint,
          "【硬约束】skill=无, item=无，只允许更新 bid/thought。"
        ].join("\n")
      } else {
        taskContent = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint
        ].join("\n")
      }
      messages.push({ role: "user", content: taskContent })

      if (payload && payload.followupContext) {
        messages.push({
          role: "user",
          content: "【工具调用上下文】\n" + JSON.stringify(payload.followupContext, null, 2)
        })
      }

      if (Array.isArray(extraBlocks) && extraBlocks.length > 0) {
        extraBlocks.forEach((block: any) => {
          messages.push({
            role: "user",
            content: String(block || "")
          })
        })
      }

      return messages
    },

    extractAiDecisionObject(content: string) {
      const jsonObj = tryExtractDecisionJson(content)
      if (jsonObj) {
        return jsonObj
      }

      const text = String(content || "")
      const bidMatch = text.match(/(?:bid|出价|报价)\s*[:：]\s*(-?\d+)/i)
      const skillMatch = text.match(/(?:skill|使用技能)\s*[:：]\s*([^\n\r]+)/i)
      const itemMatch = text.match(/(?:item|使用道具)\s*[:：]\s*([^\n\r]+)/i)
      const thoughtMatch = text.match(/(?:thought|思考过程)\s*[:：]\s*([\s\S]{1,200})/i)

      return {
        bid: bidMatch ? Number(bidMatch[1]) : 0,
        skill: skillMatch ? skillMatch[1].trim() : "无",
        item: itemMatch ? itemMatch[1].trim() : "无",
        thought: thoughtMatch ? thoughtMatch[1].trim() : ""
      }
    },

    resolveActionPick(rawText: string, type: string, availableIds: string[]) {
      const text = String(rawText || "").trim()
      if (!text) {
        return { actionId: null as string | null, target: "" }
      }

      const [namePartRaw, targetRaw] = text.split(/[:：]/, 2)
      const namePart = String(namePartRaw || "").trim()
      const target = String(targetRaw || "").trim()

      if (isNoneActionText(namePart)) {
        return { actionId: null as string | null, target }
      }

      const normalized = normalizeActionToken(namePart)
      for (const actionId of availableIds) {
        const def = this.getActionDefById(actionId)
        const aliases = [actionId, def.name, this.getItemInfo(actionId).label]
          .filter(Boolean)
          .map((entry: string) => normalizeActionToken(entry))

        const matched = aliases.some((alias: string) => {
          return alias === normalized || alias.includes(normalized) || normalized.includes(alias)
        })

        if (matched) {
          return { actionId, target }
        }
      }

      return { actionId: null as string | null, target }
    },

    normalizeAiLlmPlan(playerId: string, decision: any, rawContent: string, options: any = {}) {
      const bidRaw = pickFirstDefined(decision && decision.bid, decision && decision.出价, decision && decision.报价)
      const skillRaw = pickFirstDefined(
        decision && decision.skill,
        decision && decision.使用技能,
        decision && decision.skillName
      )
      const itemRaw = pickFirstDefined(
        decision && decision.item,
        decision && decision.使用道具,
        decision && decision.itemName
      )
      const thoughtRaw = pickFirstDefined(
        decision && decision.thought,
        decision && decision.思考过程,
        decision && decision.reason
      )

      const actionState = this.getAiAvailableActionState(playerId)
      const allowAction = options.allowAction !== false
      const bidParsed = Number(bidRaw)
      const hasBidDecision = Number.isFinite(bidParsed)
      let bid = hasBidDecision ? Math.round(bidParsed) : 0
      if (hasBidDecision) {
        const wallet = this.getAiWallet(playerId)
        bid = this.normalizeAiBidValue(playerId, bid, wallet)
      }

      const skillPick = allowAction
        ? this.resolveActionPick(skillRaw, "skill", actionState.availableSkillIds)
        : { actionId: null as string | null, target: "" }
      const itemPick = allowAction
        ? this.resolveActionPick(itemRaw, "item", actionState.availableItemIds)
        : { actionId: null as string | null, target: "" }

      let actionType = "none"
      let actionId = "none"
      let target = ""
      if (skillPick.actionId) {
        actionType = "skill"
        actionId = skillPick.actionId
        target = skillPick.target || ""
      } else if (itemPick.actionId) {
        actionType = "item"
        actionId = itemPick.actionId
        target = itemPick.target || ""
      }

      console.log(
        `[normalizeAiLlmPlan] ${playerId} decision:`,
        decision
          ? { bid: bidRaw, skill: skillRaw, item: itemRaw, hasBidDecision, normalizedBid: bid, actionType, actionId }
          : "null/empty"
      )

      return {
        source: "llm",
        bid,
        folded: false,
        hasBidDecision,
        actionType,
        actionId,
        target,
        thought: String(thoughtRaw || "").trim(),
        rawSkill: String(skillRaw || ""),
        rawItem: String(itemRaw || ""),
        rawContent: String(rawContent || "")
      }
    },

    buildAiToolResultSummary(result: any, actionType: string, actionId: string) {
      const info = this.getItemInfo(actionId)
      const stats = result && result.signalStats && result.signalStats.aggregate ? result.signalStats.aggregate : null
      const parts: string[] = []
      parts.push(`action=${actionType}:${actionId}`)
      parts.push(`name=${info.label}`)
      parts.push(`ok=${Boolean(result && result.ok)}`)
      parts.push(`revealed=${Number(result && result.revealed) || 0}`)

      if (result && Array.isArray(result.signals) && result.signals.length > 0) {
        const revealDetails: string[] = []
        const itemIdSet = new Set<string>()
        result.signals.forEach((signal: any) => {
          if (!signal || !signal.itemId) return
          if (itemIdSet.has(signal.itemId)) return
          itemIdSet.add(signal.itemId)

          const item = this.items.find((i: any) => i.id === signal.itemId)
          if (!item) return

          const detailParts: string[] = []
          if (signal.mode === "outline") {
            detailParts.push(`轮廓:${signal.sizeTag || "?"}格`)
            detailParts.push(`品类:${signal.category || "?"}`)
          }
          if (signal.mode === "quality") {
            const qualityConfig = ((window as any).ArtifactData && (window as any).ArtifactData.QUALITY_CONFIG) || {}
            const qualityLabel = qualityConfig[signal.qualityKey]?.label || signal.qualityKey || "?"
            detailParts.push(`品质:${qualityLabel}`)
            detailParts.push(`基价:${item.basePrice || "?"}`)
          }
          if (signal.sampleCell) {
            detailParts.push(`位置:(${signal.sampleCell.x},${signal.sampleCell.y})`)
          }
          if (detailParts.length > 0) {
            revealDetails.push(detailParts.join(","))
          }
        })
        if (revealDetails.length > 0) {
          parts.push(`details=[${revealDetails.join("; ")}]`)
        }
      }

      if (stats && Number(stats.count) > 0) {
        parts.push(`mean=${Number(stats.mean).toFixed(2)}`)
      }
      if (result && result.message) {
        parts.push(`message=${compactOneLine(result.message, 120)}`)
      }
      if (result && Array.isArray(result.trackUpdates)) {
        const ids = result.trackUpdates.map((entry: any) => entry && entry.trackId).filter(Boolean)
        if (ids.length > 0) {
          parts.push(`tracks=${ids.join(",")}`)
        } else {
          parts.push("tracks=none")
        }
      }
      if (
        result &&
        result.bottomCell &&
        Number.isFinite(result.bottomCell.row) &&
        Number.isFinite(result.bottomCell.col)
      ) {
        parts.push(`bottomCell=r${result.bottomCell.row}c${result.bottomCell.col}`)
      }
      return parts.join(" | ")
    }
  }

  return { methods }
}
