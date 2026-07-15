/**
 * @file scripts/game/ai/intel-manager/snapshot-fns.ts
 * @module ai/intel-manager/snapshot-fns
 * @description AiIntelManager 摘要快照相关函数：情报汇总、资源快照、可用动作状态、约束块。
 */
import type { IntelSummary } from "../../../../types/ai"
import type { AiIntelManagerDeps } from "../intel-manager"
import { calcUncertainty, calcAvailableActionState } from "../intel/pure"
import { clamp } from "../../core/utils"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"
import { ensureAiPrivateIntel } from "./init-fns"

/** 获取 AI 情报汇总（线索率、品质率、不确定性、信号统计） */
export function getAiIntelSummary(
  deps: AiIntelManagerDeps,
  playerId: string
): IntelSummary & {
  clueCount: number
  outlineCount: number
  qualityCount: number
  signalCount: number
  meanEstimate: number
  std: number
  iqr: number
} {
  const pool = ensureAiPrivateIntel(deps.state, playerId)
  const total = Math.max(1, deps.items.length)
  const outlineCount = pool.outlineSignals.length
  const qualityCount = pool.qualitySignals.length
  const clueCount = outlineCount + qualityCount
  const clueRate = clamp((outlineCount * 0.65 + qualityCount) / total, 0, 1)
  const qualityRate = clamp(qualityCount / total, 0, 1)

  if (!pool.aggregateStats) {
    const totalStats = deps.artifactManager.getSignalPriceStats(pool.signalHistory)
    pool.aggregateStats = totalStats.aggregate
  }

  const aggregateStats = pool.aggregateStats || {
    mean: 0,
    spreadRatio: 0,
    upperEdge: 0,
    lowerEdge: 0,
    std: 0,
    iqr: 0,
    count: 0
  }

  const uncertainty = calcUncertainty({
    outlineCount,
    qualityCount,
    totalItems: deps.items.length,
    spreadRatio: aggregateStats.spreadRatio,
    upperEdge: aggregateStats.upperEdge,
    lowerEdge: aggregateStats.lowerEdge
  })

  return {
    clueCount,
    outlineCount,
    qualityCount,
    clueRate,
    qualityRate,
    uncertainty,
    signalCount: pool.signalHistory.length,
    meanEstimate: aggregateStats.mean,
    spreadRatio: aggregateStats.spreadRatio,
    upperEdge: aggregateStats.upperEdge,
    lowerEdge: aggregateStats.lowerEdge,
    std: aggregateStats.std,
    iqr: aggregateStats.iqr
  }
}

/** 构建所有 AI 玩家的情报快照 */
export function buildAiIntelSnapshot(deps: AiIntelManagerDeps): Record<string, IntelSummary> {
  const map: Record<string, IntelSummary> = {}
  deps.players
    .filter((player) => !player.isHuman)
    .forEach((player) => {
      map[player.id] = getAiIntelSummary(deps, player.id)
    })
  return map
}

/** 获取 AI 资源快照（技能/道具剩余次数的副本） */
export function getAiResourceSnapshot(
  deps: AiIntelManagerDeps,
  playerId: string
): { skills: Record<string, number>; items: Record<string, number> } {
  const resourceState = deps.state.aiResourceState[playerId]
  if (!resourceState) {
    return {
      skills: {},
      items: {}
    }
  }
  return {
    skills: { ...resourceState.skills },
    items: { ...resourceState.items }
  }
}

/** 获取可用动作状态（可用技能/道具 ID 与名称） */
export function getAiAvailableActionState(
  deps: AiIntelManagerDeps,
  playerId: string
): {
  availableSkillIds: string[]
  availableItemIds: string[]
  availableSkillNames: string[]
  availableItemNames: string[]
} {
  const resource = getAiResourceSnapshot(deps, playerId)
  return calcAvailableActionState(resource, SKILL_DEFS, ITEM_DEFS)
}

/** 构建动作约束块（LLM 决策用） */
export function buildAiActionConstraintBlock(
  deps: AiIntelManagerDeps,
  playerId: string
): {
  canBid: boolean
  canFold: boolean
  availableSkills: string[]
  availableItems: string[]
  notes: string[]
  _internal: {
    availableSkillIds: string[]
    availableItemIds: string[]
    availableSkillNames: string[]
    availableItemNames: string[]
  }
} {
  const actionState = getAiAvailableActionState(deps, playerId)
  return {
    canBid: true,
    canFold: false,
    availableSkills: actionState.availableSkillNames,
    availableItems: actionState.availableItemNames,
    notes: [
      "本轮最多选择一个情报动作（技能或道具二选一）。",
      "当前技能/道具不需要目标参数；若填写目标，只会作为日志记录。"
    ],
    _internal: actionState
  }
}
