/**
 * @file llm/core/llm-prompt.js
 * @module llm/core/llm-prompt
 * @description LLM Prompt 构建与决策解析模块。负责 payload 组装、prompt/messages 构建、
 *              JSON 提取、动作解析、plan 标准化、工具结果摘要。
 *              从 scene-llm.js 拆分而来。
 *
 * @requires llm/core/llm-error - JSON 解析工具
 * @requires data/artifacts - 品质配置
 * @exports createLlmPromptModule - Prompt 构建模块工厂函数
 */
import { tryExtractDecisionJson } from './llm-error.js'
import { QUALITY_CONFIG } from '../../game/data/artifacts'
import type { Player, SkillDef, ItemDef } from "../../../types/game"

interface LlmPromptDeps {
  GAME_SETTINGS: { maxRounds: number; bidStep: number; directTakeRatio: number;[key: string]: unknown }
  SKILL_DEFS: SkillDef[]
  ITEM_DEFS: ItemDef[]
  pickFirstDefined: (...args: unknown[]) => unknown
  normalizeActionToken: (text: string) => string
  isNoneActionText: (text: string) => boolean
  compactOneLine: (text: string, maxLen?: number) => string
  [key: string]: unknown
}

interface LlmMessage {
  role: string
  content: string
}

interface LlmPayload {
  gameState?: { round?: { current?: number; total?: number }; selfId?: string; selfName?: string; wallet?: number; directWinRatio?: number; folded?: boolean; Previousbid?: number | null; currentLeader?: string;[key: string]: unknown }
  selfRoleAndTools?: Record<string, unknown>
  otherPlayersPublic?: unknown
  catalogSummary?: unknown
  bidHistory?: unknown[]
  publicEvents?: Array<Record<string, unknown>>
  roundPublicStateTable?: unknown
  privateIntel?: unknown
  actionConstraints?: Record<string, unknown>
  lastRoundResult?: Record<string, unknown>
  round?: { current?: number; total?: number;[key: string]: unknown }
  currentWallet?: number
  currentLeader?: string
  currentBid?: number
  selfAvailableTools?: Record<string, unknown>
  followupContext?: Record<string, unknown>
  [key: string]: unknown
}

interface LlmDecision {
  bid?: number | string
  skill?: string
  item?: string
  thought?: string
  [key: string]: unknown
}

interface ActionState {
  availableSkillIds: string[]
  availableItemIds: string[]
}

interface SignalData {
  itemId?: string
  mode?: string
  sizeTag?: string
  category?: string
  qualityKey?: string
  sampleCell?: { x: number; y: number }
  [key: string]: unknown
}

interface ToolResult {
  ok?: boolean
  revealed?: number
  message?: string
  signals?: SignalData[]
  signalStats?: { aggregate?: Record<string, unknown>; qualitySignalRate?: number; outlineSignalRate?: number }
  trackUpdates?: Array<{ trackId?: string }>
  bottomCell?: { row?: number; col?: number }
}

export function createLlmPromptModule(deps: LlmPromptDeps) {
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
    buildAiLlmRoundPayload(player: Player) {
      const playerId = player.id;
      const isInitialRound = (this as unknown as { round: number }).round <= 1;
      const compact = !isInitialRound;
      const persona = (this as unknown as { aiEngine: { personalityMap: Record<string, unknown> } }).aiEngine.personalityMap[playerId] || null;
      const actionConstraint = (this as unknown as { buildAiActionConstraintBlock(id: string): Record<string, unknown> }).buildAiActionConstraintBlock(playerId);
      const resource = (this as unknown as { getAiResourceSnapshot(id: string): Record<string, unknown> }).getAiResourceSnapshot(playerId);

      const bidHistory = (this as unknown as { buildBidHistorySnapshot(): unknown[] }).buildBidHistorySnapshot();
      const publicEvents = (this as unknown as { buildPublicEventSnapshot(opts: { compact: boolean; viewerId: string }): unknown[] }).buildPublicEventSnapshot({ compact, viewerId: playerId });

      const charAssign = (this as unknown as { aiCharacterAssignments: Record<string, unknown> }).aiCharacterAssignments && (this as unknown as { aiCharacterAssignments: Record<string, unknown> }).aiCharacterAssignments[playerId];
      const characterInfo = charAssign
        ? {
          characterId: (charAssign as { characterId: string }).characterId,
          characterName: (charAssign as { characterName: string }).characterName,
          skillName: (charAssign as { skillName: string }).skillName,
          passive: (charAssign as { passive?: { label: string } }).passive ? (charAssign as { passive: { label: string } }).passive.label : null
        }
        : null

      const availableSkills = SKILL_DEFS.filter((entry: SkillDef) => Number((resource as { skills: Record<string, number> }).skills[entry.id] || 0) > 0).map(
        (entry: SkillDef) => ({
          name: entry.name,
          description: entry.description,
          remaining: Number((resource as { skills: Record<string, number> }).skills[entry.id] || 0),
          timing: "出价前",
          resultPublic: false
        })
      )

      const availableItems = ITEM_DEFS.filter((entry: ItemDef) => Number((resource as { items: Record<string, number> }).items[entry.id] || 0) > 0).map((entry: ItemDef) => ({
        name: entry.name,
        description: entry.description,
        remaining: Number((resource as { items: Record<string, number> }).items[entry.id] || 0),
        timing: "出价前",
        resultPublic: false
      }))

      return {
        gameState: {
          round: {
            current: (this as unknown as { round: number }).round,
            total: GAME_SETTINGS.maxRounds
          },
          selfId: playerId,
          selfName: player.name,
          wallet: (this as unknown as { getAiWallet(id: string): number }).getAiWallet(playerId),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          folded: false,
          Previousbid: (this as unknown as { round: number }).round === 1 ? null : (this as unknown as { currentBid: number }).currentBid,
          currentLeader: (this as unknown as { bidLeader: string | null }).bidLeader
        },
        selfRoleAndTools: {
          character: characterInfo,
          roleName: persona ? (persona as { archetype: string }).archetype : "规则型",
          passive: persona
            ? `激进${(persona as { aggression: number }).aggression.toFixed(2)} / 纪律${(persona as { discipline: number }).discipline.toFixed(2)} / 跟风${(persona as { followRate: number }).followRate.toFixed(2)}`
            : "默认规则人格",
          activeSkills: availableSkills,
          items: availableItems
        },
        otherPlayersPublic: (this as unknown as { buildOtherPlayersPublicInfo(id: string, opts: { compact: boolean }): unknown }).buildOtherPlayersPublicInfo(playerId, { compact }),
        catalogSummary: (this as unknown as { buildCatalogSummary(opts: { compact: boolean }): unknown }).buildCatalogSummary({ compact }),
        ...(compact
          ? { roundPublicStateTable: (this as unknown as { buildRoundPublicStateTable(id: string): unknown }).buildRoundPublicStateTable(playerId) }
          : { bidHistory, publicEvents }),
        privateIntel: (this as unknown as { buildAiPrivateIntelBlock(id: string): unknown }).buildAiPrivateIntelBlock(playerId),
        actionConstraints: {
          canBid: (actionConstraint as { canBid: boolean }).canBid,
          canFold: (actionConstraint as { canFold: boolean }).canFold,
          availableSkills: (actionConstraint as { availableSkills: string[] }).availableSkills,
          availableItems: (actionConstraint as { availableItems: string[] }).availableItems,
          notes: (actionConstraint as { notes: string }).notes
        }
      }
    },

    buildAiIncrementalPayload(player: Player) {
      const playerId = player.id;
      const previousRound = (this as unknown as { round: number }).round - 1;
      const actionConstraint = (this as unknown as { buildAiActionConstraintBlock(id: string): Record<string, unknown> }).buildAiActionConstraintBlock(playerId);
      const resource = (this as unknown as { getAiResourceSnapshot(id: string): Record<string, unknown> }).getAiResourceSnapshot(playerId);

      const bidHistory = (this as unknown as { buildBidHistorySnapshot(): unknown[] }).buildBidHistorySnapshot();
      const lastRoundBid = (bidHistory as Array<{ round: number }>).find((entry: { round: number }) => entry.round === previousRound);

      const availableSkills = SKILL_DEFS.filter((entry: SkillDef) => Number((resource as { skills: Record<string, number> }).skills[entry.id] || 0) > 0).map(
        (entry: SkillDef) => ({
          name: entry.name,
          remaining: Number((resource as { skills: Record<string, number> }).skills[entry.id] || 0)
        })
      )

      const availableItems = ITEM_DEFS.filter((entry: ItemDef) => Number((resource as { items: Record<string, number> }).items[entry.id] || 0) > 0).map((entry: ItemDef) => ({
        name: entry.name,
        remaining: Number((resource as { items: Record<string, number> }).items[entry.id] || 0)
      }))

      const lastRoundActions: Record<string, { playerName: string; actions: Array<{ type: string; name: string; description: string }> }> = {};
      (this as unknown as { players: Player[] }).players.forEach((p: Player) => {
        if (p.id === playerId) return;
        const usage = ((this as unknown as { playerUsageHistory: Record<string, unknown[]> }).playerUsageHistory[p.id] || [] as unknown[]).find((entry: unknown) => (entry as { round: number }).round === previousRound);
        if (usage && (usage as { actions?: string[] }).actions && (usage as { actions: string[] }).actions.length > 0) {
          lastRoundActions[p.id] = {
            playerName: p.name,
            actions: (usage as { actions: string[] }).actions.map((actionId: string) => {
              const def = (this as unknown as { getActionDefById(id: string): { type: string; name: string; description?: string } }).getActionDefById(actionId);
              return { type: def.type, name: def.name, description: def.description || "" }
            })
          }
        }
      })

      return {
        round: {
          current: (this as unknown as { round: number }).round,
          previous: previousRound
        },
        lastRoundResult: {
          bids: lastRoundBid ? (lastRoundBid as unknown as { bids: Record<string, unknown> }).bids : {},
          winner: lastRoundBid ? (lastRoundBid as unknown as { winner: string | null }).winner : null,
          actions: lastRoundActions
        },
        currentWallet: (this as unknown as { getAiWallet(id: string): number }).getAiWallet(playerId),
        currentLeader: (this as unknown as { bidLeader: string | null }).bidLeader,
        currentBid: (this as unknown as { currentBid: number }).currentBid,
        selfAvailableTools: {
          skills: availableSkills,
          items: availableItems
        },
        actionConstraints: {
          canBid: (actionConstraint as { canBid: boolean }).canBid,
          canFold: (actionConstraint as { canFold: boolean }).canFold,
          availableSkills: (actionConstraint as { availableSkills: string[] }).availableSkills,
          availableItems: (actionConstraint as { availableItems: string[] }).availableItems
        },
        privateIntel: (this as unknown as { buildAiPrivateIntelBlock(id: string): unknown }).buildAiPrivateIntelBlock(playerId)
      }
    },

    buildAiFollowupRoundPayload(player: Player, currentPlan: LlmDecision & { toolResultSummary?: string; toolActionType?: string; toolActionId?: string }, toolSummary?: string) {
      const resolvedToolSummary = toolSummary || (currentPlan && currentPlan.toolResultSummary) || "";
      return {
        requestStage: "followup-after-tool",
        round: (this as unknown as { round: number }).round,
        gameState: {
          selfId: player.id,
          selfName: player.name,
          wallet: (this as unknown as { getAiWallet(id: string): number }).getAiWallet(player.id),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          Previousbid: (this as unknown as { round: number }).round === 1 ? null : (this as unknown as { currentBid: number }).currentBid,
          currentLeader: (this as unknown as { bidLeader: string | null }).bidLeader
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

    buildAiDecisionUserPrompt(payload: LlmPayload, extraBlocks: string[] = [], options: { requestStage?: string; isFirstRound?: boolean } = {}) {
      const requestStage = options.requestStage || "initial";
      const isFollowup = requestStage === "followup-after-tool";
      const isFirstRound = options.isFirstRound === true;
      const roundNoRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.current,
        payload && payload.round,
        (this as unknown as { round: number }).round
      );
      const totalRoundRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total,
        GAME_SETTINGS.maxRounds
      );
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, (this as unknown as { round: number }).round);
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo);
      const isFinalRound = roundNo >= totalRounds;
      const roundStateText = isFinalRound ? "最终轮" : "后续轮";
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。";

      let base: string[];
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

    buildAiDecisionMessages(payload: LlmPayload, options: { requestStage?: string; isFirstRound?: boolean; systemPrompt?: string; historyMessages?: LlmMessage[]; extraBlocks?: string[] } = {}) {
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

      if (Array.isArray(historyMessages) && historyMessages.length > 0) {
        historyMessages.forEach((m: LlmMessage) => {
          messages.push({ role: m.role || "user", content: m.content || "" })
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
        const compactEvents = payload.publicEvents.map((evt: Record<string, unknown>) => {
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
            : (this as unknown as { round: number }).round;
      const totalRoundRaw =
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total
          ? payload.gameState.round.total
          : GAME_SETTINGS.maxRounds;
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, (this as unknown as { round: number }).round);
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo);
      const isFinalRound = roundNo >= totalRounds;
      const roundStateText = isFinalRound ? "最终轮" : "后续轮";
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。";

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
        extraBlocks.forEach((block: string) => {
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

      const normalized = normalizeActionToken(namePart);
      for (const actionId of availableIds) {
        const def = (this as unknown as { getActionDefById(id: string): { type: string; name: string } }).getActionDefById(actionId);
        const aliases = [actionId, def.name, (this as unknown as { getItemInfo(id: string): { label: string } }).getItemInfo(actionId).label]
          .filter(Boolean)
          .map((entry: string) => normalizeActionToken(entry));

        const matched = aliases.some((alias: string) => {
          return alias === normalized || alias.includes(normalized) || normalized.includes(alias)
        });

        if (matched) {
          return { actionId, target }
        }
      }

      return { actionId: null as string | null, target }
    },

    normalizeAiLlmPlan(playerId: string, decision: LlmDecision | null, rawContent: string, options: { allowAction?: boolean } = {}) {
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

      const actionState = (this as unknown as { getAiAvailableActionState(id: string): ActionState }).getAiAvailableActionState(playerId);
      const allowAction = options.allowAction !== false;
      const bidParsed = Number(bidRaw);
      const hasBidDecision = Number.isFinite(bidParsed);
      let bid = hasBidDecision ? Math.round(bidParsed) : 0;
      if (hasBidDecision) {
        const wallet = (this as unknown as { getAiWallet(id: string): number }).getAiWallet(playerId);
        bid = (this as unknown as { normalizeAiBidValue(id: string, bid: number, wallet: number): number }).normalizeAiBidValue(playerId, bid, wallet);
      }

      const skillPick = allowAction
        ? (this as unknown as { resolveActionPick(text: string, type: string, ids: string[]): { actionId: string | null; target: string } }).resolveActionPick(String(skillRaw), "skill", actionState.availableSkillIds)
        : { actionId: null as string | null, target: "" };
      const itemPick = allowAction
        ? (this as unknown as { resolveActionPick(text: string, type: string, ids: string[]): { actionId: string | null; target: string } }).resolveActionPick(String(itemRaw), "item", actionState.availableItemIds)
        : { actionId: null as string | null, target: "" };

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

    buildAiToolResultSummary(result: ToolResult | null, actionType: string, actionId: string) {
      const info = (this as unknown as { getItemInfo(id: string): { label: string } }).getItemInfo(actionId);
      const stats = result && result.signalStats && result.signalStats.aggregate ? result.signalStats.aggregate : null;
      const parts: string[] = [];
      parts.push(`action=${actionType}:${actionId}`);
      parts.push(`name=${info.label}`);
      parts.push(`ok=${Boolean(result && result.ok)}`);
      parts.push(`revealed=${Number(result && result.revealed) || 0}`);

      if (result && Array.isArray(result.signals) && result.signals.length > 0) {
        const revealDetails: string[] = [];
        const itemIdSet = new Set<string>();
        result.signals.forEach((signal: SignalData) => {
          if (!signal || !signal.itemId) return;
          if (itemIdSet.has(signal.itemId as string)) return;
          itemIdSet.add(signal.itemId as string);

          const item = (this as unknown as { items: Array<{ id: string; basePrice?: number }> }).items.find((i: { id: string }) => i.id === (signal.itemId as string));
          if (!item) return;

          const detailParts: string[] = [];
          if (signal.mode === "outline") {
            detailParts.push(`轮廓:${signal.sizeTag || "?"}格`);
            detailParts.push(`品类:${signal.category || "?"}`);
          }
          if (signal.mode === "quality") {
            const qualityConfig = QUALITY_CONFIG || {};
            const qualityKey = signal.qualityKey as string;
            const qualityLabel = qualityConfig[qualityKey]?.label || qualityKey || "?";
            detailParts.push(`品质:${qualityLabel}`);
            detailParts.push(`基价:${item.basePrice || "?"}`);
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
        const ids = result.trackUpdates.map((entry: Record<string, unknown>) => entry && entry.trackId).filter(Boolean)
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
