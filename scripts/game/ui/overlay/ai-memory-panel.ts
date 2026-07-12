/**
 * @file scripts/game/ui/overlay/ai-memory-panel.ts
 * @module ui/overlay/ai-memory-panel
 * @description AI 跨局记忆面板 Mixin。负责渲染 AI 玩家的跨局经验本（成功经验、
 *              策略建议、经验教训、历史统计）到记忆面板覆盖层，并处理触摸滚动。
 *
 * @requires types/ai - CrossGameStats
 * @exports AiMemoryPanelMixin - AI 记忆面板子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { CrossGameStats } from "../../../../types/ai"

export const AiMemoryPanelMixin: ThisType<WarehouseSceneThis> = {
  openAiMemoryPanel() {
    if (!this.dom.aiMemoryOverlay) return
    const aiPlayers = this.players.filter((p) => !p.isHuman)
    if (aiPlayers.length === 0) {
      if (this.dom.aiMemoryContent) {
        this.dom.aiMemoryContent.innerHTML = '<div class="ai-memory-empty">暂无AI玩家</div>'
      }
      this.dom.aiMemoryOverlay.classList.remove("hidden")
      return
    }
    const sections = aiPlayers
      .map((player, idx) => {
        const memory = this.ensureAiCrossGameMemory(player.id)
        const colors = ["#c49a3c", "#5a9e5a", "#5a7ebd", "#bd5a7e"]
        const color = colors[idx % colors.length]
        let inner = ""

        const stats: CrossGameStats = memory.stats || { totalGames: 0, warehouseValueMax: 0, warehouseValueMin: 0, warehouseValueAvg: 0, winRate: 0, avgProfit: 0, totalCellsMax: 0, totalCellsMin: 0, totalCellsAvg: 0, totalItemsMax: 0, totalItemsMin: 0, totalItemsAvg: 0, legendaryMax: 0, legendaryMin: 0, legendaryAvg: 0, rareMax: 0, rareMin: 0, rareAvg: 0 }
        const praises = memory.praises || []
        const strategies = memory.strategies || []
        const lessons = memory.lessons || []

        if (stats.totalGames === 0 && praises.length === 0 && strategies.length === 0 && lessons.length === 0) {
          inner = '<div class="ai-memory-empty">暂无跨局记忆</div>'
        } else {
          inner = '<div class="ai-memory-entry">'

          if (stats.totalGames > 0) {
            inner += `<div class="ai-memory-entry-title">历史统计</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">总局数</span>${stats.totalGames}局</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">胜率</span>${Math.round((stats.winRate || 0) * 100)}%</div>`
            inner += `<div class="ai-memory-field"><span class="ai-memory-label">平均盈亏</span>${Math.round(stats.avgProfit || 0)}</div>`
            if (stats.warehouseValueMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">仓库价值</span>${stats.warehouseValueMin}~${stats.warehouseValueMax}，平均${Math.round(stats.warehouseValueAvg || 0)}</div>`
            }
            if (stats.totalCellsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">格数范围</span>${stats.totalCellsMin}~${stats.totalCellsMax}，平均${Math.round(stats.totalCellsAvg || 0)}</div>`
            }
            if (stats.totalItemsMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">藏品件数</span>${stats.totalItemsMin}~${stats.totalItemsMax}，平均${Math.round(stats.totalItemsAvg || 0)}</div>`
            }
            if (stats.legendaryMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">绝品件数</span>${stats.legendaryMin}~${stats.legendaryMax}，平均${(stats.legendaryAvg || 0).toFixed(1)}</div>`
            }
            if (stats.rareMax > 0) {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">珍品件数</span>${stats.rareMin}~${stats.rareMax}，平均${(stats.rareAvg || 0).toFixed(1)}</div>`
            }
          }

          if (praises.length > 0) {
            inner += `<div class="ai-memory-entry-title">成功经验 (${praises.length}/10)</div>`
            praises.forEach((p, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${p}</div>`
            })
          }

          if (strategies.length > 0) {
            inner += `<div class="ai-memory-entry-title">策略建议 (${strategies.length}/10)</div>`
            strategies.forEach((s, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${s}</div>`
            })
          }

          if (lessons.length > 0) {
            inner += `<div class="ai-memory-entry-title">经验教训 (${lessons.length}/10)</div>`
            lessons.forEach((l, i) => {
              inner += `<div class="ai-memory-field"><span class="ai-memory-label">${i}</span>${l}</div>`
            })
          }

          inner += "</div>"
        }

        return (
          `<div class="ai-memory-section" style="--section-color:${color}">` +
          `<div class="ai-memory-section-header">${player.name}</div>` +
          `<div class="ai-memory-section-body">${inner}</div>` +
          `</div>`
        )
      })
      .join("")

    if (this.dom.aiMemoryContent) {
      this.dom.aiMemoryContent.innerHTML = sections || '<div class="ai-memory-empty">暂无记忆数据</div>'
    }
    if (!this._aiMemoryTouchBound) {
      this._aiMemoryTouchBound = true
      this.setupAiMemoryTouchScroll()
    }
    this.dom.aiMemoryOverlay.classList.remove("hidden")
  },

  setupAiMemoryTouchScroll() {
    const content = this.dom.aiMemoryContent
    if (!content) return
    let touchStartY = 0
    let touchStartScrollTop = 0
    content.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          touchStartY = e.touches[0].clientY
          touchStartScrollTop = content.scrollTop
        }
      },
      { passive: true }
    )
    content.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return
        const dy = touchStartY - e.touches[0].clientY
        const maxScroll = content.scrollHeight - content.clientHeight
        if (maxScroll <= 0) return
        content.scrollTop = Math.max(0, Math.min(touchStartScrollTop + dy, maxScroll))
      },
      { passive: true }
    )
  },

  closeAiMemoryPanel() {
    if (this.dom.aiMemoryOverlay) {
      this.dom.aiMemoryOverlay.classList.add("hidden")
    }
  }
}
