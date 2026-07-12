/**
 * @file scripts/game/lobby/character-select/carry-items.ts
 * @module lobby/character-select/carry-items
 * @description 携带道具系统 Mixin。管理道具槽位渲染、选择器、增删、
 *              自动补充、持久化（localStorage）。包含补充成本计算和执行补充。
 *
 * @requires bridge/shop - MobaoShopBridge（库存查询、道具定义）
 * @requires ./pure - calcReplenishCost, ReplenishCostResult
 * @exports CarryItemsMixin - 携带道具子 Mixin
 * @exports ReplenishResult - 补充结果接口
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { MobaoShopBridge } from "../../bridge/shop"
import {
  calcReplenishCost,
  type ReplenishCostResult
} from "./pure"

interface ReplenishResult {
  ok: boolean
  message: string
  newMoney?: number
  need?: number
  have?: number
}

export { type ReplenishResult }

export const CarryItemsMixin: ThisType<WarehouseSceneThis> = {
  renderCarryItems() {
    const row = document.getElementById("carryItemsRow")
    if (!row) return

    row.innerHTML = ""

    const bridge = MobaoShopBridge
    const inventory: Record<string, number> = bridge ? bridge.getFullInventory() : {}

    this._carryItems.forEach((item) => {
      const slot = document.createElement("div")
      slot.className = "carry-item-slot"
      slot.textContent = item.icon

      if (bridge) {
        const storageKey = bridge.getItemStorageKey(item.id) as string
        const count = inventory[storageKey] || 0
        if (count <= 0) {
          slot.classList.add("depleted")
          const badge = document.createElement("span")
          badge.className = "carry-item-depleted-badge"
          badge.textContent = "0"
          slot.appendChild(badge)
        }
      }

      const removeBtn = document.createElement("button")
      removeBtn.className = "carry-item-remove"
      removeBtn.textContent = "×"
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.removeCarryItem(item.id)
      })
      slot.appendChild(removeBtn)
      row.appendChild(slot)
    })

    if (this._carryItems.length < this._MAX_CARRY_ITEMS) {
      const addBtn = document.createElement("div")
      addBtn.className = "carry-item-add"
      addBtn.textContent = "+"
      addBtn.addEventListener("click", () => this.openCarryItemPicker())
      row.appendChild(addBtn)
    }
  },

  openCarryItemPicker() {
    if (this._carryPickerEl) {
      this._carryPickerEl.remove()
      this._carryPickerEl = null
    }

    const existingIds = new Set(this._carryItems.map((i) => i.id))
    const bridge = MobaoShopBridge
    const inventory: Record<string, number> = bridge ? bridge.getFullInventory() : {}
    const shopItems: Array<{ id: string; name: string; icon: string; price?: number }> = bridge ? bridge.SHOP_ITEMS : []
    const available = shopItems
      .map((def) => {
        const storageKey = bridge.getItemStorageKey(def.id) as string
        return { id: def.id, name: def.name, icon: def.icon, count: inventory[storageKey] || 0 }
      })
      .filter((item) => item.count > 0)

    const overlay = document.createElement("div")
    overlay.className = "carry-picker-overlay"
    this._carryPickerEl = overlay

    const panel = document.createElement("div")
    panel.className = "carry-picker-panel"
    overlay.appendChild(panel)

    const pickerSelected = new Set<string>([...existingIds] as string[])

    const renderPicker = () => {
      const totalSelected = pickerSelected.size
      const headCount = `${totalSelected} / ${this._MAX_CARRY_ITEMS}`

      panel.innerHTML = `
          <div class="carry-picker-head">
            <h3>选择携带道具<span class="carry-picker-count">${headCount}</span></h3>
            <button class="carry-picker-close" type="button">✕</button>
          </div>
          <p class="carry-picker-sub">最多可携带 ${this._MAX_CARRY_ITEMS} 个道具进入游戏</p>
          <div class="carry-picker-body">
            <div class="carry-picker-grid">
              ${available
          .map((item) => {
            const isLocked = existingIds.has(item.id)
            const isChecked = pickerSelected.has(item.id)
            const isFull = !isChecked && totalSelected >= this._MAX_CARRY_ITEMS
            let cls = "carry-picker-item"
            if (isChecked) cls += isLocked ? " locked" : " checked"
            else if (isFull) cls += " full"
            return `<div class="${cls}" data-item-id="${item.id}">
                  <span class="carry-picker-item-icon">${item.icon}</span>
                  <div class="carry-picker-item-info">
                    <div class="carry-picker-item-name">${item.name}</div>
                    <div class="carry-picker-item-count">库存: ${item.count}</div>
                  </div>
                </div>`
          })
          .join("")}
            </div>
          </div>
          <div class="carry-picker-foot">
            <button class="carry-picker-confirm" type="button">确认携带</button>
          </div>
        `

      const closeBtn = panel.querySelector(".carry-picker-close")
      if (closeBtn) closeBtn.addEventListener("click", () => this.closeCarryItemPicker())

      const confirmBtn = panel.querySelector(".carry-picker-confirm")
      if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
          this._carryItems = available
            .filter((item) => pickerSelected.has(item.id))
            .map((item) => ({ id: item.id, name: item.name, icon: item.icon }))
          this._saveCarryItems()
          this.closeCarryItemPicker()
          this.renderCarryItems()
        })
      }

      panel.querySelectorAll(".carry-picker-item").forEach((el) => {
        el.addEventListener("click", () => {
          const itemId = (el as HTMLElement).dataset.itemId!
          if (existingIds.has(itemId)) return
          if (pickerSelected.has(itemId)) {
            pickerSelected.delete(itemId)
          } else {
            if (pickerSelected.size >= this._MAX_CARRY_ITEMS) return
            pickerSelected.add(itemId)
          }
          renderPicker()
        })
      })
    }

    renderPicker()
    document.body.appendChild(overlay)

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        this.closeCarryItemPicker()
      }
    })

    requestAnimationFrame(() => overlay.classList.add("open"))
  },

  closeCarryItemPicker() {
    if (this._carryPickerEl) {
      this._carryPickerEl.classList.remove("open")
      const el = this._carryPickerEl
      setTimeout(() => el.remove(), 300)
      this._carryPickerEl = null
    }
  },

  removeCarryItem(itemId: string) {
    this._carryItems = this._carryItems.filter((i) => i.id !== itemId)
    this._saveCarryItems()
    this.renderCarryItems()
  },

  _saveCarryItems() {
    try {
      window.localStorage.setItem("mobao_carry_items_v1", JSON.stringify(this._carryItems))
    } catch (_e) { }
  },

  _loadCarryItems() {
    try {
      const raw = window.localStorage.getItem("mobao_carry_items_v1")
      if (!raw) {
        this._carryItems = []
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        this._carryItems = []
        return
      }
      this._carryItems = parsed.filter((i: { id?: string }) => i && typeof i.id === "string").slice(0, this._MAX_CARRY_ITEMS)
    } catch (_e) {
      this._carryItems = []
    }
  },

  _bindAutoReplenishToggle() {
    const checkbox = document.getElementById("carryAutoReplenish") as HTMLInputElement | null
    if (!checkbox) return
    checkbox.checked = this._autoReplenish
    checkbox.addEventListener("change", () => {
      this._autoReplenish = checkbox.checked
      this._saveAutoReplenish()
    })
  },

  _saveAutoReplenish() {
    try {
      window.localStorage.setItem("mobao_carry_auto_replenish_v1", this._autoReplenish ? "1" : "0")
    } catch (_e) { }
  },

  _loadAutoReplenish() {
    try {
      this._autoReplenish = window.localStorage.getItem("mobao_carry_auto_replenish_v1") === "1"
    } catch (_e) {
      this._autoReplenish = false
    }
  },

  calcReplenishCost(): ReplenishCostResult {
    const bridge = MobaoShopBridge
    if (!bridge) return { totalCost: 0, items: [] }
    return calcReplenishCost(
      this._carryItems,
      bridge.SHOP_ITEMS as Array<{ id: string; price?: number }>,
      bridge.getFullInventory(),
      (id) => bridge.getItemStorageKey(id) as string
    )
  },

  executeReplenish(): ReplenishResult {
    const bridge = MobaoShopBridge
    if (!bridge) return { ok: false, message: "商店系统不可用" }

    const { totalCost, items } = this.calcReplenishCost()
    if (items.length === 0) return { ok: true, message: "无需补充", newMoney: bridge.getPlayerMoney() }

    const money: number = bridge.getPlayerMoney()
    if (money < totalCost) {
      return { ok: false, message: `资金不足，需要 ${totalCost}，当前 ${money}`, need: totalCost, have: money }
    }

    try {
      const raw = window.localStorage.getItem("mobao_player_money_v1")
      const current = Math.max(0, Math.round(Number(raw) || 0))
      window.localStorage.setItem("mobao_player_money_v1", String(current - totalCost))
    } catch (_e) { }

    const inv: Record<string, number> = bridge.getFullInventory()
    items.forEach((item: { id: string }) => {
      const key = bridge.getItemStorageKey(item.id) as string
      inv[key] = (inv[key] || 0) + 1
    })
    try {
      window.localStorage.setItem(bridge.SHOP_STORAGE_KEY as string, JSON.stringify(inv))
    } catch (_e) { }

    return {
      ok: true,
      message: `已补充 ${items.length} 个道具，花费 ${totalCost}`,
      newMoney: bridge.getPlayerMoney()
    }
  }
}
