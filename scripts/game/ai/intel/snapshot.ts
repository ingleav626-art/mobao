import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { IntelSummary } from "../../../../types/ai"
import { clamp } from "../../core/utils"
import { SKILL_DEFS } from "../../data/skills"
import { ITEM_DEFS } from "../../data/items"

export const SnapshotMixin: ThisType<WarehouseSceneThis> = {
  getAiIntelSummary(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const total = Math.max(1, this.items.length)
    const outlineCount = pool.outlineSignals.length
    const qualityCount = pool.qualitySignals.length
    const clueCount = outlineCount + qualityCount
    const clueRate = clamp((outlineCount * 0.65 + qualityCount) / total, 0, 1)
    const qualityRate = clamp(qualityCount / total, 0, 1)

    if (!pool.aggregateStats) {
      const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
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

    const edgeBias = Math.max(0, aggregateStats.upperEdge - aggregateStats.lowerEdge)
    const uncertainty = clamp(
      0.88 - clueRate * 0.48 - qualityRate * 0.2 + aggregateStats.spreadRatio * 0.35 - edgeBias * 0.08,
      0.05,
      1
    )

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
  },

  buildAiIntelSnapshot() {
    const map: Record<string, IntelSummary> = {}
    this.players
      .filter((player) => !player.isHuman)
      .forEach((player) => {
        map[player.id] = this.getAiIntelSummary(player.id)
      })
    return map
  },

  getAiResourceSnapshot(playerId: string) {
    const resourceState = this.aiResourceState[playerId]
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
  },

  getAiAvailableActionState(playerId: string) {
    const resource = this.getAiResourceSnapshot(playerId)
    const availableSkillIds = SKILL_DEFS.filter((entry) => Number(resource.skills[entry.id] || 0) > 0).map(
      (entry) => entry.id
    )
    const availableItemIds = ITEM_DEFS.filter((entry) => Number(resource.items[entry.id] || 0) > 0).map(
      (entry) => entry.id
    )

    return {
      availableSkillIds,
      availableItemIds,
      availableSkillNames: SKILL_DEFS.filter((entry) => availableSkillIds.includes(entry.id)).map(
        (entry) => entry.name
      ),
      availableItemNames: ITEM_DEFS.filter((entry) => availableItemIds.includes(entry.id)).map((entry) => entry.name)
    }
  },

  buildAiActionConstraintBlock(playerId: string) {
    const actionState = this.getAiAvailableActionState(playerId)
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
}
