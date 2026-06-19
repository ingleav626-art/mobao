/**
 * @file scene/scene-utils.ts
 * @module scene/utils
 * @description 场景工具方法。包含快照构建、坐标转换、排名标记、运行令牌等。
 *
 * 拆分说明：
 *   - 大部分方法为对 ai/context-builder.ts 的转发，无需二次迁移
 *   - scrollElementByWheel / toWorldPointFromRootEvent / markRoundRanking
 *     为实现逻辑，可考虑二次迁移到 ui/ 或 core/utils.ts
 *   - makeRunToken / hasAppliedMoneyForRun / markMoneyAppliedForRun
 *     为实现逻辑，可考虑二次迁移到 core/
 *   - getLlmSettings / getLlmProvider 为实现逻辑，可考虑二次迁移到 llm/
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Player } from "../../../types/game"
import type { BidsPerPlayer } from "../../../types/lan"
import type { Personality } from "../../../types/ai"
import { clamp } from "../core/utils"
import {
  buildBidHistorySnapshot as buildBidHistorySnapshotImpl,
  buildPublicEventSnapshot as buildPublicEventSnapshotImpl,
  buildRoundPublicStateTable as buildRoundPublicStateTableImpl,
  buildQualityPriceRangeTableCompact as buildQualityPriceRangeTableCompactImpl,
  buildCatalogSummaryInner as buildCatalogSummaryImpl,
  buildQualityPriceGuide as buildQualityPriceGuideImpl,
  getActionDefById as getActionDefByIdImpl,
  buildOtherPlayersPublicInfo as buildOtherPlayersPublicInfoImpl,
} from "../ai/context-builder"

/**
 * 滚轮滚动元素
 */
export function scrollElementByWheel(
  this: WarehouseSceneThis,
  element: HTMLElement | null,
  deltaY: number
): boolean {
  if (!element) {
    return false
  }

  const maxScroll = element.scrollHeight - element.clientHeight
  if (maxScroll <= 0) {
    return false
  }

  const before = element.scrollTop
  element.scrollTop = clamp(element.scrollTop + deltaY, 0, maxScroll)
  return before !== element.scrollTop
}

export function buildBidHistorySnapshot(this: WarehouseSceneThis): unknown {
  return buildBidHistorySnapshotImpl(this.round, this.players, this.playerRoundHistory)
}

export function buildPublicEventSnapshot(
  this: WarehouseSceneThis,
  options: Record<string, unknown> = {}
): unknown {
  return buildPublicEventSnapshotImpl(
    this.players,
    this.playerUsageHistory,
    this.currentRoundUsage,
    this.round,
    this.getActionDefById.bind(this) as (id: string) => ReturnType<typeof getActionDefByIdImpl>,
    this.currentPublicEvent,
    options
  )
}

export function buildRoundPublicStateTable(this: WarehouseSceneThis, viewerId: string): unknown {
  return buildRoundPublicStateTableImpl(
    this.round,
    this.players,
    this.playerRoundHistory,
    this.currentRoundUsage,
    this.playerUsageHistory,
    viewerId
  )
}

export function buildQualityPriceRangeTableCompact(this: WarehouseSceneThis): unknown {
  return buildQualityPriceRangeTableCompactImpl()
}

export function buildCatalogSummary(
  this: WarehouseSceneThis,
  options: Record<string, unknown> = {}
): unknown {
  return buildCatalogSummaryImpl(options)
}

export function buildQualityPriceGuide(
  this: WarehouseSceneThis,
  options: Record<string, unknown> = {}
): unknown {
  return buildQualityPriceGuideImpl(options)
}

export function getActionDefById(this: WarehouseSceneThis, actionId: string): unknown {
  return getActionDefByIdImpl(actionId)
}

export function buildOtherPlayersPublicInfo(
  this: WarehouseSceneThis,
  viewerId: string,
  options: Record<string, unknown> = {}
): unknown {
  return buildOtherPlayersPublicInfoImpl(
    this.players,
    this.aiEngine as { personalityMap: Record<string, Personality> },
    this.playerUsageHistory,
    this.getActionDefById.bind(this) as (id: string) => ReturnType<typeof getActionDefByIdImpl>,
    viewerId,
    options
  )
}

/**
 * 将鼠标事件坐标转换为游戏世界坐标
 */
export function toWorldPointFromRootEvent(
  this: WarehouseSceneThis,
  event: MouseEvent
): { x: number; y: number } | null {
  if (!this.dom.gameRoot) {
    return null
  }

  const rect = this.dom.gameRoot.getBoundingClientRect()
  const x = this.dom.gameRoot.scrollLeft + (event.clientX - rect.left)
  const y = this.dom.gameRoot.scrollTop + (event.clientY - rect.top)
  return { x, y }
}

/**
 * 标记回合排名（第一名 winner，第二名 runner）
 */
export function markRoundRanking(this: WarehouseSceneThis, sorted: BidsPerPlayer[]): void {
  const firstId = sorted[0]?.playerId
  const secondId = sorted[1]?.playerId

  this.players.forEach((player: Player) => {
    const cardEl = document.getElementById(`playerCard-${player.id}`)
    if (!cardEl) {
      return
    }

    cardEl.classList.remove("winner", "runner")
    if (player.id === firstId) {
      cardEl.classList.add("winner")
    } else if (player.id === secondId) {
      cardEl.classList.add("runner")
    }
  })
}

/**
 * 生成运行令牌（用于标识一次游戏运行）
 */
export function makeRunToken(this: WarehouseSceneThis): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`
}

/**
 * 检查当前运行是否已应用金钱结算
 */
export function hasAppliedMoneyForRun(this: WarehouseSceneThis): boolean {
  if (!this.moneySettledRunToken) {
    return false
  }
  const raw = window.localStorage.getItem("mobao_money_settled_run")
  return raw === this.moneySettledRunToken
}

/**
 * 标记当前运行已应用金钱结算
 */
export function markMoneyAppliedForRun(this: WarehouseSceneThis): void {
  if (!this.moneySettledRunToken) {
    return
  }
  window.localStorage.setItem("mobao_money_settled_run", this.moneySettledRunToken)
}
