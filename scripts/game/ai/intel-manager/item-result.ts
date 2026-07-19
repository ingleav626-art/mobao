/**
 * @file scripts/game/ai/intel-manager/item-result.ts
 * @module ai/intel-manager/item-result
 * @description 道具/技能统一返回类型框架。所有揭示函数返回 ItemResult，
 *              保持与 RevealResult（{ ok, revealed, message }）向后兼容，
 *              按 actionType 动态填入附加字段。
 */
import type { AiIntelSignal, AiSignalStats } from "../../../../types/ai"

/** 最底部藏品坐标（与 warehouse/index.ts pickBottomCellFromTargets 对齐） */
export interface BottomCell {
  x: number
  y: number
  col: number
  row: number
}

/** 高价值追踪更新（与 reveal-fns.ts 内联类型对齐） */
export interface TrackUpdate {
  trackId: string
  created?: boolean
  revealLevel?: string
  confirmed?: { quality: string; category: string; exactArtifact: string | null }
  candidates?: { total: number; truncated: boolean }
}

/** 信号统计对（最新+累计） */
export interface SignalStatsPair {
  aggregate: AiSignalStats
  latest: AiSignalStats
}

/** 道具类型标签 */
export type ItemActionType = "outline" | "quality" | "reveal" | "average" | "bonus"

/** 揭示类返回的藏品完整信息（单行 JS 对象） */
export interface ArtifactInfo {
  id: string
  name: string
  category: string
  qualityKey: string
  quality: string
  sizeTag: string
  w: number
  h: number
  basePrice: number
  x: number
  y: number
}

/**
 * 统一返回类型。除 ok/message 外所有字段可选，按 actionType 动态填入。
 *
 * - outline:  itemCount, bottomCell, signals, signalStats, trackUpdates
 * - quality:   qualityCellCount, bottomCell, signals, signalStats, trackUpdates
 * - reveal:    artifacts, totalBasePrice, bottomCell, signals, signalStats, trackUpdates
 * - average:   averagePrice, scope, itemCount
 * - bonus:     bonusApplied
 */
export interface ItemResult {
  // 基础字段（兼容 RevealResult）
  ok: boolean
  revealed: number
  message: string

  // 道具类型标签
  actionType?: ItemActionType

  // 统一返回：最底部藏品坐标（如适用）
  bottomCell?: BottomCell | null

  // 轮廓类：探测到的物品总数量
  itemCount?: number
  // 品质类：本次探查的品质格总数
  qualityCellCount?: number

  // 揭示类：藏品完整信息数组
  artifacts?: ArtifactInfo[]
  // 揭示类：揭示藏品的基价总和
  totalBasePrice?: number

  // 均价类
  averagePrice?: number
  scope?: string

  // 加成类：仅状态确认
  bonusApplied?: boolean

  // 兼容：signal 相关（轮廓/品质/揭示类共用）
  signals?: AiIntelSignal[]
  signalStats?: SignalStatsPair
  trackUpdates?: TrackUpdate[]

  // 错误处理：部分失败的 itemId 列表
  partialFailures?: string[]
}
