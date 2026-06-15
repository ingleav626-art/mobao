/**
 * @file context-builder.js
 * @module ai/context-builder
 * @description AI 上下文构建器。从场景状态中提取结构化数据，用于 AI 决策和 LLM 对话。
 *              所有函数均为纯数据转换，不修改场景状态或 DOM。
 *
 * 核心函数：
 *   - buildBidHistorySnapshot: 构建出价历史快照
 *   - buildPublicEventSnapshot: 构建公开事件快照
 *   - buildRoundPublicStateTable: 构建回合公开状态表
 *   - buildQualityPriceRangeTableCompact: 构建品质-价格范围表
 *   - buildCatalogSummary: 构建藏品目录摘要
 *   - buildQualityPriceGuide: 构建品质价格指南
 *   - getActionDefById: 根据动作ID获取动作定义
 *   - buildOtherPlayersPublicInfo: 构建其他玩家公开信息
 *
 * @requires window.ArtifactData - QUALITY_CONFIG, ARTIFACT_LIBRARY
 * @requires window.SkillSystem - SKILL_DEFS
 * @requires window.ItemSystem - ITEM_DEFS
 * @requires window.MobaoConstants - GRID_COLS, GRID_ROWS
 *
 * @exports window.MobaoContextBuilder - 上下文构建器
 */

import type { Player } from "../../../types/game"
import type { Personality } from "../../../types/ai"

type ActionDef = { id: string; type: string; name: string; description: string }
type QualityConfigEntry = { label: string;[key: string]: unknown }
type ArtifactDataWindow = { QUALITY_CONFIG: Record<string, QualityConfigEntry>; ARTIFACT_LIBRARY: Array<{ qualityKey: string; basePrice: number;[key: string]: unknown }> }
type ActionDefSystem = { SKILL_DEFS: ActionDef[]; ITEM_DEFS: ActionDef[] }

import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../data/artifacts"
import { GRID_COLS, GRID_ROWS } from "../core/constants"
import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"

export function buildBidHistorySnapshot(round: number, players: Player[], playerRoundHistory: Record<string, Array<{ round: number; bid: number }>>): Array<{ round: number; bids: Record<string, number> }> {
  const rounds = Array.from({ length: Math.max(0, round - 1) }, (_v, idx) => idx + 1)
  return rounds.map((roundNo) => {
    const bids = {}
    players.forEach((player) => {
      const records = playerRoundHistory[player.id] || []
      const entry = records.find((record) => record.round === roundNo)
      bids[player.id] = entry ? Math.round(Number(entry.bid) || 0) : 0
    })
    return {
      round: roundNo,
      bids
    }
  })
}

export function buildPublicEventSnapshot(players: Player[], playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>, currentRoundUsage: Record<string, string[]>, round: number, getActionDefByIdFn: (id: string) => ActionDef, currentPublicEvent: { category: string; id: string; text: string } | null, options: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  const compact = Boolean(options.compact)
  const viewerId = options.viewerId || ""
  const events = []

  const pushEventsFromUsage = (usageMap, stageLabelBuilder) => {
    players.forEach((player) => {
      if (viewerId && player.id === viewerId) {
        return
      }
      const list = usageMap[player.id] || []
      list.forEach((entry) => {
        const stage = stageLabelBuilder(entry.round)
        const actionIds = Array.isArray(entry.actions) ? entry.actions : []
        actionIds.forEach((actionId) => {
          const def = getActionDefById(actionId)
          events.push({
            stage,
            playerId: player.id,
            playerName: player.name,
            actionType: def.type,
            actionName: def.name,
            actionId,
            ...(compact ? {} : { effectText: def.description }),
            resultPublic: false,
            publicResult: null
          })
        })
      })
    })
  }

  pushEventsFromUsage(playerUsageHistory, (roundNo) => "第 " + roundNo + " 轮出价后")

  players.forEach((player) => {
    if (viewerId && player.id === viewerId) {
      return
    }
    const actionIds = currentRoundUsage[player.id] || []
    actionIds.forEach((actionId) => {
      const def = getActionDefById(actionId)
      events.push({
        stage: "第 " + round + " 轮出价前",
        playerId: player.id,
        playerName: player.name,
        actionType: def.type,
        actionName: def.name,
        actionId,
        ...(compact ? {} : { effectText: def.description }),
        resultPublic: false,
        publicResult: null
      })
    })
  })

  if (currentPublicEvent) {
    events.push({
      stage: "开局",
      playerId: "system",
      playerName: "系统",
      actionType: "public-event",
      actionName: currentPublicEvent.category,
      actionId: currentPublicEvent.id,
      ...(compact ? {} : { effectText: currentPublicEvent.text }),
      resultPublic: true,
      publicResult: currentPublicEvent.text
    })
  }

  return events.slice(-30)
}

export function buildRoundPublicStateTable(round: number, players: Player[], playerRoundHistory: Record<string, Array<{ round: number; bid: number }>>, currentRoundUsage: Record<string, string[]>, playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>, viewerId: string): { columns: string[]; rows: unknown[][] } {
  const bidHistory = buildBidHistorySnapshot(round, players, playerRoundHistory)
  const bidByRound = new Map(bidHistory.map((entry) => [entry.round, entry.bids || {}]))
  const actionPlayers = players.filter((player) => player.id !== viewerId)

  const columns = [
    "round_no",
    "round_stage",
    ...players.map((player) => player.id + "_bid_value"),
    ...actionPlayers.map((player) => player.id + "_public_action_ids")
  ]

  const rows = []
  const maxRound = Math.max(0, round)
  for (var roundNo = 1; roundNo <= maxRound; roundNo += 1) {
    var isCurrentRound = roundNo === round
    var stage = isCurrentRound ? "pre_bid_current_round" : "post_bid"
    var roundBidMap = bidByRound.get(roundNo) || {}

    var bidValues = players.map((player) => {
      if (isCurrentRound) {
        return null
      }
      return Math.round(Number(roundBidMap[player.id]) || 0)
    })

    var actionValues = actionPlayers.map((player) => {
      var actionIds = isCurrentRound
        ? currentRoundUsage[player.id] || []
        : (playerUsageHistory[player.id] || []).find(function (entry) { return entry.round === roundNo })?.actions || []
      if (!Array.isArray(actionIds) || actionIds.length === 0) {
        return "none"
      }
      return actionIds.join("|")
    })

    rows.push([roundNo, stage, ...bidValues, ...actionValues])
  }

  return {
    columns,
    rows
  }
}

export function buildQualityPriceRangeTableCompact(): { columns: string[]; rows: unknown[][] } {
  var columns = ["quality_key", "quality_name", "min_price", "max_price", "avg_price"]
  var rows = Object.keys(QUALITY_CONFIG).map((qualityKey) => {
    var entries = ARTIFACT_LIBRARY.filter((artifact) => artifact.qualityKey === qualityKey)
    var prices = entries.map((artifact) => Number(artifact.basePrice) || 0).filter((value) => value > 0)
    var total = prices.reduce((sum, value) => sum + value, 0)
    var minPrice = prices.length > 0 ? Math.min(...prices) : 0
    var maxPrice = prices.length > 0 ? Math.max(...prices) : 0
    var avgPrice = prices.length > 0 ? Math.round(total / prices.length) : 0
    return [
      qualityKey,
      QUALITY_CONFIG[qualityKey] ? QUALITY_CONFIG[qualityKey].label : qualityKey,
      minPrice,
      maxPrice,
      avgPrice
    ]
  })

  return { columns, rows }
}

export function buildCatalogSummaryInner(options: Record<string, unknown> = {}): Record<string, unknown> {
  var compact = Boolean(options.compact)
  var prices = ARTIFACT_LIBRARY.map((entry) => Number(entry.basePrice) || 0)
    .filter((value) => value > 0)
    .sort((a, b) => a - b)
  var minPrice = prices.length > 0 ? prices[0] : 0
  var maxPrice = prices.length > 0 ? prices[prices.length - 1] : 0
  var qualityLabels = Object.values(QUALITY_CONFIG).map((entry) => entry.label)

  return {
    totalArtifacts: ARTIFACT_LIBRARY.length,
    qualityRangeText: "参考价值大致 " + minPrice + "~" + maxPrice + "，品质档位：" + qualityLabels.join("/"),
    ...(compact
      ? {}
      : {
        warehouseDefinition: "仓库是隐藏在 " + GRID_COLS + "x" + GRID_ROWS + " 网格中的藏品堆栈；每件藏品都有固定的品质、品类、基础价格和占格尺寸，玩家只能通过出价、公开事件和私有探查去推断整座仓库的真实价值。"
      }),
    specialMechanismHint: "绝品或高价藏品可能为单格高价，也可能为多格组合高价。",
    poolRestrictionHint: "当前对局未设置朝代子集限制。",
    ...(compact
      ? { qualityPriceRangeTable: buildQualityPriceRangeTableCompact() }
      : { qualityPriceGuide: buildQualityPriceGuide({ compact }) })
  }
}

export function buildQualityPriceGuide(options: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  var compact = Boolean(options.compact)
  return Object.keys(QUALITY_CONFIG).map((qualityKey) => {
    var entries = ARTIFACT_LIBRARY.filter((artifact) => artifact.qualityKey === qualityKey)
    var prices = entries.map((artifact) => Number(artifact.basePrice) || 0).filter((value) => value > 0)
    var total = prices.reduce((sum, value) => sum + value, 0)
    var minPrice = prices.length > 0 ? Math.min(...prices) : 0
    var maxPrice = prices.length > 0 ? Math.max(...prices) : 0

    return {
      qualityKey,
      qualityName: QUALITY_CONFIG[qualityKey] ? QUALITY_CONFIG[qualityKey].label : qualityKey,
      ...(compact
        ? {}
        : {
          count: entries.length,
          minPrice,
          maxPrice
        }),
      avgPrice: prices.length > 0 ? Math.round(total / prices.length) : 0
    }
  })
}

export function getActionDefById(actionId: string): ActionDef {
  var skill = SKILL_DEFS.find((entry) => entry.id === actionId)
  if (skill) {
    return {
      id: skill.id,
      type: "skill",
      name: skill.name,
      description: skill.description
    }
  }

  var item = ITEM_DEFS.find((entry) => entry.id === actionId)
  if (item) {
    return {
      id: item.id,
      type: "item",
      name: item.name,
      description: item.description
    }
  }

  return {
    id: actionId,
    type: "unknown",
    name: actionId,
    description: "未知动作"
  }
}

export function buildOtherPlayersPublicInfo(players: Player[], aiEngine: { personalityMap: Record<string, Personality> }, playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>, getActionDefById: (id: string) => ActionDef, viewerId: string, options: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  var compact = Boolean(options.compact)
  return players
    .filter((player) => player.id !== viewerId)
    .map((player) => {
      var persona = aiEngine.personalityMap[player.id] || null
      var usageNames = []

        ; (playerUsageHistory[player.id] || []).forEach((entry) => {
          ; (entry.actions || []).forEach((actionId) => {
            usageNames.push(getActionDefById(actionId).name)
          })
        })

      return {
        playerId: player.id,
        playerName: player.name,
        roleName: persona ? persona.archetype : "玩家",
        passiveSkillText: persona
          ? "倾向：激进" + persona.aggression.toFixed(2) + "，纪律" + persona.discipline.toFixed(2) + "，跟风" + persona.followRate.toFixed(2)
          : "未知",
        activeSkillList: compact
          ? SKILL_DEFS.map((entry) => ({ name: entry.name }))
          : SKILL_DEFS.map((entry) => ({
            name: entry.name,
            description: entry.description
          })),
        folded: false,
        publicUsedActions: [...new Set(usageNames)].slice(-10)
      }
    })
}