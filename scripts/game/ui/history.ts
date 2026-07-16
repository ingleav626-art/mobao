/**
 * @file ui/history.ts
 * @module ui/history
 * @description 玩家历史记录与道具抽屉。管理游戏过程中每个玩家的
 *              出价历史和道具使用记录，以及道具抽屉的开关和渲染。
 *
 * 核心职责：
 *   - resetPlayerHistoryState: 重置所有玩家的回合历史和使用记录
 *   - recordRoundHistory: 记录一轮结束后各玩家的出价和道具使用
 *   - recordPlayerUsage: 记录玩家使用道具
 *   - refreshPlayerHistoryUI: 刷新所有玩家的历史面板
 *   - 道具抽屉：toggleItemDrawer / openItemDrawer / closeItemDrawer / renderItemDrawer
 *
 * @exports UiHistoryMixin - 向后兼容的 Mixin 薄包装
 */
import type { ItemDef } from "../../../types/game"
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { escapeHtml, formatCompactNumber } from "../core/utils"
import { GAME_SETTINGS } from "../core/settings"
import { CARRY_ITEMS_STORAGE_KEY } from "../core/constants"
import { createLogger } from "../core/logger"
const log = createLogger("UI")

// ─── 类型定义 ───

export interface HistoryData {
  playerRoundHistory: Record<string, Array<{ round: number; bid: number }>>
  playerUsageHistory: Record<string, Array<{ round: number; actions: string[] }>>
  currentRoundUsage: Record<string, string[]>
  playerHistoryPanels: Record<string, HTMLElement | null>
}

export interface ItemDrawerState {
  settled: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean
  roundTimeLeft: number
  itemManager: { getItemState(): Array<{ id: string; count: number }> }
  dom: Record<string, HTMLElement | null>
}

// ─── 独立函数（可独立测试）───

export function resetPlayerHistoryState(
  players: Array<{ id: string }>,
  data: HistoryData,
  refreshUI: () => void
): void {
  // 清理不在当前玩家列表中的残留条目（防止 solo 切换联机时数据残留）
  const activeIds = new Set(players.map((p) => p.id))
  for (const key of Object.keys(data.playerRoundHistory)) {
    if (!activeIds.has(key)) delete data.playerRoundHistory[key]
  }
  for (const key of Object.keys(data.playerUsageHistory)) {
    if (!activeIds.has(key)) delete data.playerUsageHistory[key]
  }
  for (const key of Object.keys(data.currentRoundUsage)) {
    if (!activeIds.has(key)) delete data.currentRoundUsage[key]
  }
  for (const key of Object.keys(data.playerHistoryPanels)) {
    if (!activeIds.has(key)) delete data.playerHistoryPanels[key]
  }

  for (const player of players) {
    data.playerRoundHistory[player.id] = []
    data.playerUsageHistory[player.id] = []
    data.currentRoundUsage[player.id] = []
  }
  refreshUI()
}

export function clearCurrentRoundUsage(players: Array<{ id: string }>, data: HistoryData): void {
  log.debug(
    "clearCurrentRoundUsage: players count=" +
      players.length +
      ", playerIds=" +
      JSON.stringify(players.map((p) => p.id)) +
      ", before keys=" +
      JSON.stringify(Object.keys(data.currentRoundUsage))
  )
  for (const player of players) {
    data.currentRoundUsage[player.id] = []
  }
  // 清理不在当前玩家列表中的残留条目（防止 solo 切换联机时数据残留）
  const activeIds = new Set(players.map((p) => p.id))
  for (const key of Object.keys(data.currentRoundUsage)) {
    if (!activeIds.has(key)) {
      delete data.currentRoundUsage[key]
    }
  }
}

export function recordPlayerUsage(data: HistoryData, playerId: string, itemId: string, refreshUI: () => void): void {
  if (!data.currentRoundUsage[playerId]) {
    data.currentRoundUsage[playerId] = []
  }
  data.currentRoundUsage[playerId].push(itemId)
  refreshUI()
}

export function recordRoundHistory(
  players: Array<{ id: string }>,
  data: HistoryData,
  round: number,
  roundBids: Array<{ playerId: string; bid: number }>,
  refreshUI: () => void
): void {
  for (const player of players) {
    const bid = roundBids.find((entry) => entry.playerId === player.id)?.bid ?? 0
    data.playerRoundHistory[player.id].push({ round, bid })
    if (data.playerRoundHistory[player.id].length > GAME_SETTINGS.maxRounds) {
      data.playerRoundHistory[player.id].shift()
    }

    const actions = [...(data.currentRoundUsage[player.id] || [])]
    data.playerUsageHistory[player.id].push({ round, actions })
    if (data.playerUsageHistory[player.id].length > GAME_SETTINGS.maxRounds) {
      data.playerUsageHistory[player.id].shift()
    }
  }
  refreshUI()
}

export function refreshPlayerHistoryUI(
  players: Array<{ id: string }>,
  data: HistoryData,
  renderItemUsageCell: (actions: string[]) => string
): void {
  log.debug(
    "refreshPlayerHistoryUI: players count=" +
      players.length +
      ", playerIds=" +
      JSON.stringify(players.map((p) => p.id)) +
      ", currentRoundUsage keys=" +
      JSON.stringify(Object.keys(data.currentRoundUsage))
  )
  for (const player of players) {
    const panel = data.playerHistoryPanels[player.id]
    if (!panel) continue

    const rounds = Array.from({ length: GAME_SETTINGS.maxRounds }, (_, idx) => idx + 1)
    const bidByRoundArray = (data.playerRoundHistory[player.id] || []).map((e) => [e.round, e.bid] as [number, number])
    const bidByRound = new Map<number, number>(bidByRoundArray)
    const usageByRoundArray = (data.playerUsageHistory[player.id] || []).map(
      (e) => [e.round, e.actions] as [number, string[]]
    )
    const usageByRound = new Map<number, string[]>(usageByRoundArray)

    const roundHeaders = rounds.map((v) => `<td>${v}</td>`).join("")
    const itemCells = rounds.map((r) => `<td>${renderItemUsageCell(usageByRound.get(r) || [])}</td>`).join("")
    const bidCells = rounds
      .map((r) => `<td>${bidByRound.has(r) ? formatCompactNumber(bidByRound.get(r) as number) : "-"}</td>`)
      .join("")

    panel.innerHTML = [
      '<table class="player-history-table">',
      "<tbody>",
      `<tr><th>轮次</th>${roundHeaders}</tr>`,
      `<tr><th>行动</th>${itemCells}</tr>`,
      `<tr><th>报价</th>${bidCells}</tr>`,
      "</tbody>",
      "</table>"
    ].join("")
  }
}

export function renderItemUsageCell(actions: string[], getItemInfo: (itemId: string) => ItemDef): string {
  if (!actions || actions.length === 0) {
    return '<span class="history-empty">-</span>'
  }
  return actions
    .map((itemId) => {
      const info = getItemInfo(itemId)
      return `<span class="history-chip" data-item-id="${escapeHtml(itemId)}" data-tip="${escapeHtml(info.description)}">${escapeHtml(info.label)}</span>`
    })
    .join(" ")
}

export function toggleItemDrawer(
  dom: Record<string, HTMLElement | null>,
  openFn: () => void,
  closeFn: () => void
): void {
  if (!dom.itemDrawer) return
  if (dom.itemDrawer.classList.contains("hidden")) {
    openFn()
  } else {
    closeFn()
  }
}

export function openItemDrawer(
  state: ItemDrawerState,
  closeBidKeypad: () => void,
  isSettingsOverlayOpen: () => boolean,
  isSettlementPageActive: () => boolean,
  renderDrawer: () => void
): void {
  if (!state.dom.itemDrawer) return
  const locked = state.settled || state.roundResolving || state.playerBidSubmitted || state.roundTimeLeft <= 0
  if (locked || isSettingsOverlayOpen() || isSettlementPageActive()) return
  closeBidKeypad()
  renderDrawer()
  state.dom.itemDrawer.classList.remove("hidden")
  if (state.dom.itemDrawerToggleBtn) state.dom.itemDrawerToggleBtn.classList.add("active")
}

export function closeItemDrawer(dom: Record<string, HTMLElement | null>): void {
  if (!dom.itemDrawer) return
  dom.itemDrawer.classList.add("hidden")
  if (dom.itemDrawerToggleBtn) dom.itemDrawerToggleBtn.classList.remove("active")
}

export function renderItemDrawer(
  dom: Record<string, HTMLElement | null>,
  canUse: boolean,
  itemManager: { getItemState(): Array<{ id: string; count: number }> },
  drawerVersion: { current: string },
  getItemInfo: (itemId: string) => ItemDef
): void {
  if (!dom.itemDrawerList) return
  const itemState = itemManager.getItemState().filter((item) => item.count > 0)
  const version = JSON.stringify(itemState) + "|" + canUse
  if (drawerVersion.current === version) return
  drawerVersion.current = version

  if (!itemState.length) {
    let hasCarryItems = false
    try {
      const raw = window.localStorage.getItem(CARRY_ITEMS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        hasCarryItems = Array.isArray(parsed) && parsed.length > 0
      }
    } catch (_e) {}
    const msg = hasCarryItems ? "道具已全部使用" : "未携带道具"
    dom.itemDrawerList.innerHTML = `<div class="item-drawer-empty">${msg}</div>`
    return
  }

  dom.itemDrawerList.innerHTML = itemState
    .map((item) => {
      const info = getItemInfo(item.id)
      const disabled = !canUse || item.count <= 0
      return [
        `<button type="button" class="item-drawer-btn${disabled ? " is-empty" : ""}" data-item-id="${item.id}" ${disabled ? "disabled" : ""} title="${escapeHtml(info.description)}">`,
        `<span class="item-drawer-name">${escapeHtml(info.label)}</span>`,
        `<span class="item-drawer-count">x${item.count}</span>`,
        "</button>"
      ].join("")
    })
    .join("")
}

// ─── Mixin 薄代理（Phase 2：代理到 HistoryManager，向后兼容 Object.assign 混入）───

export const UiHistoryMixin: ThisType<WarehouseSceneThis> = {
  resetPlayerHistoryState(): void {
    this.historyManager.resetPlayerHistoryState()
  },

  clearCurrentRoundUsage(): void {
    this.historyManager.clearCurrentRoundUsage()
  },

  recordPlayerUsage(playerId: string, itemId: string): void {
    this.historyManager.recordPlayerUsage(playerId, itemId)
  },

  recordRoundHistory(roundBids: Array<{ playerId: string; bid: number }>): void {
    this.historyManager.recordRoundHistory(roundBids)
  },

  refreshPlayerHistoryUI(): void {
    this.historyManager.refreshPlayerHistoryUI()
  },

  renderItemUsageCell(actions: string[]): string {
    return this.historyManager.renderItemUsageCell(actions)
  },

  toggleItemDrawer(): void {
    this.historyManager.toggleItemDrawer()
  },

  openItemDrawer(): void {
    this.historyManager.openItemDrawer()
  },

  closeItemDrawer(): void {
    this.historyManager.closeItemDrawer()
  },

  renderItemDrawer(): void {
    this.historyManager.renderItemDrawer()
  }
}
