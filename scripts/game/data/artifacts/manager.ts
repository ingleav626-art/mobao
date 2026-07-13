/**
 * @file data/artifacts/manager
 * @description ArtifactManager 类：藏品的随机生成、候选匹配、价格统计和信号分析。
 *              从 data/artifacts.ts 拆分而来（纯代码搬迁，无逻辑变更）。
 *              依赖：config.ts（品质/品类配置）、library.ts（藏品图鉴）、pure.ts（统计/工具函数）。
 */

import { QUALITY_CONFIG, CATEGORY_WEIGHTS } from "./config"
import { ARTIFACT_LIBRARY } from "./library"
import {
  toSizeTag,
  summarizeCandidatePrices,
  signalToRevealState,
  summarizeStatsCollection,
  canPlaceRect,
  weightedPick
} from "./pure"

export class ArtifactManager {
  counter: number

  constructor() {
    this.counter = 1
  }

  createRandomArtifact(): Record<string, any> {
    const category = weightedPick(CATEGORY_WEIGHTS).key
    const defs = ARTIFACT_LIBRARY.filter((item) => item.category === category)
    const def = defs[Math.floor(Math.random() * defs.length)]
    return this.buildArtifactFromDef(def)
  }

  createRandomArtifactForSlot({
    col,
    row,
    gridCols,
    gridRows,
    occupancy,
    categoryWeights,
    qualityWeights
  }: {
    col: number
    row: number
    gridCols: number
    gridRows: number
    occupancy: number[][]
    categoryWeights?: Record<string, number>
    qualityWeights?: Record<string, number>
  }): Record<string, any> | null {
    const categoryWeightMap = categoryWeights
      ? { ...categoryWeights }
      : CATEGORY_WEIGHTS.reduce((acc: Record<string, number>, item) => {
          acc[item.key] = item.weight
          return acc
        }, {})

    let fitDefs: any[] = ARTIFACT_LIBRARY.filter((def) =>
      canPlaceRect(col, row, def.w, def.h, gridCols, gridRows, occupancy)
    )

    if (qualityWeights) {
      const totalQ = (Object.values(qualityWeights) as number[]).reduce((s, v) => s + v, 0) || 1
      fitDefs = fitDefs.map((def) => ({
        ...def,
        _qw: qualityWeights[def.qualityKey] || 1
      }))
      fitDefs = fitDefs.filter(() => Math.random() < 1)
      const expanded: any[] = []
      fitDefs.forEach((def) => {
        const cw = (categoryWeightMap as Record<string, number>)[def.category] || 1
        const qw = def._qw / totalQ
        expanded.push({ ...def, weight: cw * qw })
      })
      if (expanded.length === 0) {
        return null
      }
      const picked = weightedPick(expanded)
      return this.buildArtifactFromDef(picked)
    }

    if (fitDefs.length === 0) {
      return null
    }

    const weightedDefs = fitDefs.map((def) => ({
      ...def,
      weight: (categoryWeightMap as Record<string, number>)[def.category] || 1
    }))

    const picked = weightedPick(weightedDefs)
    return this.buildArtifactFromDef(picked)
  }

  buildArtifactFromDef(def: Record<string, any>): Record<string, any> {
    const quality = QUALITY_CONFIG[def.qualityKey]

    return {
      id: `artifact-${this.counter++}`,
      key: def.key,
      majorCategory: def.majorCategory || "古董",
      category: def.category,
      name: def.name,
      basePrice: def.basePrice,
      qualityKey: def.qualityKey,
      quality,
      w: def.w,
      h: def.h,
      x: 0,
      y: 0
    }
  }

  getCandidatesByRevealState(state: Record<string, any>): Array<Record<string, any>> {
    const { qualityKey = null, sizeTag = null, category = null } = state
    return ARTIFACT_LIBRARY.filter((artifact) => {
      if (category && artifact.category !== category) {
        return false
      }

      if (qualityKey && artifact.qualityKey !== qualityKey) {
        return false
      }

      if (sizeTag) {
        const artifactSizeTag = toSizeTag(artifact.w, artifact.h)
        if (artifactSizeTag !== sizeTag) {
          return false
        }
      }

      return true
    }).map((artifact) => ({
      ...artifact,
      revealedQualityKey: qualityKey,
      revealedQualityLabel: qualityKey ? QUALITY_CONFIG[qualityKey].label : "未知",
      expectedPrice: artifact.basePrice,
      previewSizeTag: toSizeTag(artifact.w, artifact.h)
    }))
  }

  getCandidateStatsByRevealState(state: Record<string, any>): Record<string, any> {
    const candidates = this.getCandidatesByRevealState(state)
    return summarizeCandidatePrices(candidates)
  }

  getSignalPriceStats(signals: any[] = []): Record<string, any> {
    const list = Array.isArray(signals) ? signals.filter(Boolean) : []
    const detail = list.map((signal) => {
      const revealState = signalToRevealState(signal)
      const candidates = this.getCandidatesByRevealState(revealState)
      return {
        ...signal,
        revealState,
        stats: summarizeCandidatePrices(candidates)
      }
    })

    const qualityCount = detail.filter((entry) => entry.type === "quality").length
    const outlineCount = detail.filter((entry) => entry.type === "outline").length

    return {
      signalCount: detail.length,
      qualitySignalRate: detail.length > 0 ? qualityCount / detail.length : 0,
      outlineSignalRate: detail.length > 0 ? outlineCount / detail.length : 0,
      detail,
      aggregate: summarizeStatsCollection(detail.map((entry) => entry.stats))
    }
  }

  getLibraryStats() {
    const byCategory = ARTIFACT_LIBRARY.reduce((acc: Record<string, number>, artifact) => {
      acc[artifact.category] = (acc[artifact.category] || 0) + 1
      return acc
    }, {})

    return {
      total: ARTIFACT_LIBRARY.length,
      byCategory
    }
  }
}
