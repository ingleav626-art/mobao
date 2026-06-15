/**
 * @file ui/history.js
 * @module ui/history
 * @description 玩家历史记录与道具抽屉 Mixin。管理游戏过程中每个玩家的
 *              出价历史和道具使用记录，以及道具抽屉的开关和渲染。
 *
 * 核心职责：
 *   - resetPlayerHistoryState(): 重置所有玩家的回合历史和使用记录
 *   - recordRoundHistory(roundBids): 记录一轮结束后各玩家的出价和道具使用
 *     出价历史和道具使用均按 maxRounds 保留最近N轮
 *   - recordPlayerUsage(playerId, itemId): 记录玩家使用道具
 *   - refreshPlayerHistoryUI(): 刷新所有玩家的历史面板（表格形式）
 *     表格结构：轮次行 / 行动行（道具标签）/ 报价行（紧凑数字）
 *
 * 道具抽屉：
 *   - toggleItemDrawer / openItemDrawer / closeItemDrawer
 *     抽屉在锁定状态（已结算/出价已提交/时间耗尽/设置打开/结算页激活）下不可打开
 *   - renderItemDrawer(): 渲染可用道具列表（带版本缓存避免重复渲染）
 *     空状态区分"未携带道具"和"道具已全部使用"
 *
 * @requires MobaoUtils     - 工具函数（escapeHtml, formatCompactNumber）
 * @requires MobaoSettings  - 设置（GAME_SETTINGS.maxRounds）
 *
 * @exports HistoryMixin - 历史记录与道具抽屉 Mixin，混入 Phaser Scene
 */
import { escapeHtml, formatCompactNumber } from "../core/utils"
import { GAME_SETTINGS } from "../core/settings"

export const UiHistoryMixin: Record<string, any> = {
  resetPlayerHistoryState(): void {
    this.players.forEach((player) => {
      this.playerRoundHistory[player.id] = []
      this.playerUsageHistory[player.id] = []
      this.currentRoundUsage[player.id] = []
    })
    this.refreshPlayerHistoryUI()
  },

  clearCurrentRoundUsage(): void {
    this.players.forEach((player) => {
      this.currentRoundUsage[player.id] = []
    })
  },

  recordPlayerUsage(playerId: string, itemId: string): void {
    if (!this.currentRoundUsage[playerId]) {
      this.currentRoundUsage[playerId] = []
    }
    this.currentRoundUsage[playerId].push(itemId)
    this.refreshPlayerHistoryUI()
  },

  recordRoundHistory(roundBids: Array<{ playerId: string; bid: number }>): void {
    const roundNumber = this.round
    this.players.forEach((player) => {
      const bid = roundBids.find((entry) => entry.playerId === player.id)?.bid ?? 0
      this.playerRoundHistory[player.id].push({ round: roundNumber, bid })
      if (this.playerRoundHistory[player.id].length > GAME_SETTINGS.maxRounds) {
        this.playerRoundHistory[player.id].shift()
      }

      const actions = [...(this.currentRoundUsage[player.id] || [])]
      this.playerUsageHistory[player.id].push({ round: roundNumber, actions })
      if (this.playerUsageHistory[player.id].length > GAME_SETTINGS.maxRounds) {
        this.playerUsageHistory[player.id].shift()
      }
    })

    this.refreshPlayerHistoryUI()
  },

  refreshPlayerHistoryUI(): void {
    this.players.forEach((player) => {
      const panel = this.playerHistoryPanels[player.id]
      if (!panel) {
        return
      }

      const rounds = Array.from({ length: GAME_SETTINGS.maxRounds }, (_v, idx) => idx + 1)
      const bidByRound = new Map((this.playerRoundHistory[player.id] || []).map((entry) => [entry.round, entry.bid]))
      const usageByRound = new Map(
        (this.playerUsageHistory[player.id] || []).map((entry) => [entry.round, entry.actions])
      )

      const roundHeaders = rounds.map((value) => `<td>${value}</td>`).join("")
      const itemCells = rounds
        .map((round) => `<td>${this.renderItemUsageCell(usageByRound.get(round) || [])}</td>`)
        .join("")
      const bidCells = rounds
        .map((round) => `<td>${bidByRound.has(round) ? formatCompactNumber(bidByRound.get(round) as number) : "-"}</td>`)
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
    })
  },

  renderItemUsageCell(actions: string[]): string {
    if (!actions || actions.length === 0) {
      return '<span class="history-empty">-</span>'
    }

    return actions
      .map((itemId) => {
        const info = this.getItemInfo(itemId)
        return `<span class="history-chip" data-item-id="${escapeHtml(itemId)}" data-tip="${escapeHtml(info.tip)}">${escapeHtml(info.label)}</span>`
      })
      .join(" ")
  },

  toggleItemDrawer(): void {
    if (!this.dom.itemDrawer) {
      return
    }

    if (this.dom.itemDrawer.classList.contains("hidden")) {
      this.openItemDrawer()
    } else {
      this.closeItemDrawer()
    }
  },

  openItemDrawer(): void {
    if (!this.dom.itemDrawer) {
      return
    }

    const lockedIntel = this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0
    if (lockedIntel || this.isSettingsOverlayOpen() || this.isSettlementPageActive()) {
      return
    }

    this.closeBidKeypad()
    this.renderItemDrawer()
    this.dom.itemDrawer.classList.remove("hidden")
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.classList.add("active")
    }
  },

  closeItemDrawer(): void {
    if (!this.dom.itemDrawer) {
      return
    }

    this.dom.itemDrawer.classList.add("hidden")
    if (this.dom.itemDrawerToggleBtn) {
      this.dom.itemDrawerToggleBtn.classList.remove("active")
    }
  },

  renderItemDrawer(): void {
    if (!this.dom.itemDrawerList) {
      return
    }

    const canUse = !(this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0)
    const itemState = this.itemManager.getItemState().filter((item) => item.count > 0)

    const version = JSON.stringify(itemState) + "|" + canUse
    if (this._drawerVersion === version) return
    this._drawerVersion = version

    if (!itemState.length) {
      // 检查是否是因为没有携带道具
      let hasCarryItems = false
      try {
        const raw = window.localStorage.getItem("mobao_carry_items_v1")
        if (raw) {
          const parsed = JSON.parse(raw)
          hasCarryItems = Array.isArray(parsed) && parsed.length > 0
        }
      } catch (_e) { }

      const msg = hasCarryItems ? "道具已全部使用" : "未携带道具"
      this.dom.itemDrawerList.innerHTML = `<div class="item-drawer-empty">${msg}</div>`
      return
    }

    this.dom.itemDrawerList.innerHTML = itemState
      .map((item) => {
        const info = this.getItemInfo(item.id)
        const disabled = !canUse || item.count <= 0
        return [
          `<button type="button" class="item-drawer-btn${disabled ? " is-empty" : ""}" data-item-id="${item.id}" ${disabled ? "disabled" : ""} title="${escapeHtml(info.tip)}">`,
          `<span class="item-drawer-name">${escapeHtml(info.label)}</span>`,
          `<span class="item-drawer-count">x${item.count}</span>`,
          "</button>"
        ].join("")
      })
      .join("")
  }
}
