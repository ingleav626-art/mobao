import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file lobby/character-select.ts
 * @module lobby/character-select
 * @description 单机角色选择页面 Mixin。管理角色选择流程的完整生命周期，
 *              包括角色列表渲染、Live2D 立绘无缝循环、携带道具选择、
 *              自动补充机制、以及确认/返回操作。
 *
 * 核心职责：
 *   - initCharacterSelect(): 初始化角色选择页面，绑定事件
 *   - showCharacterSelectPage(mapProfile): 显示角色选择页面（含入场动画）
 *   - renderCharacterList(): 渲染角色卡片列表（头像+名称+选中状态）
 *   - renderSelectedCharacterPreview(): 渲染选中角色的预览区域
 *     - Live2D 立绘无缝循环（双视频元素交替播放）
 *     - 主动技能/被动能力展示
 *     - 携带道具槽位（最多3个）
 *   - confirmCharacterSelection(): 确认选择并进入游戏
 *
 * Live2D 无缝循环机制（_startLive2dLoop）：
 *   使用双 video 元素（A/B）交替播放，当当前视频播放到末尾时，
 *   预加载另一视频并在下一帧切换，实现无缝循环。
 *   支持 requestVideoFrameCallback 精确帧回调，降级到 timeupdate。
 *   _loadingLock 防止并发加载，_live2dVideoState 跟踪播放状态。
 *
 * 携带道具系统：
 *   - _carryItems: 当前携带的道具数组（最多3个）
 *   - openCarryItemPicker(): 打开道具选择弹窗（网格布局，库存>0可选）
 *   - removeCarryItem(itemId): 移除已携带道具
 *   - _saveCarryItems / _loadCarryItems: localStorage 持久化（mobao_carry_items_v1）
 *   - _autoReplenish: 道具耗尽时自动用金币补充开关
 *   - calcReplenishCost(): 计算补充费用
 *   - executeReplenish(): 执行补充（扣费+补库存）
 *
 * @requires CharacterData   - 角色数据（getUnlockedCharacters）
 * @requires CharacterSystem - 角色系统（getActiveCharacter, selectCharacter）
 * @requires MobaoShopBridge - 商店系统（getFullInventory, SHOP_ITEMS, getPlayerMoney）
 * @requires MobaoSettings   - 设置（savePlayerMoney）
 *
 * @exports CharacterSelectMixin - 角色选择 Mixin，混入 Phaser Scene
 */

interface CarryItem {
  id: string
  name: string
  icon: string
}

interface ReplenishItem {
  id: string
  name: string
  icon: string
  price: number
  shortage: number
}

interface ReplenishCostResult {
  totalCost: number
  items: ReplenishItem[]
}

interface ReplenishResult {
  ok: boolean
  message: string
  newMoney?: number
  need?: number
  have?: number
}

interface Live2dVideoState {
  current: "A" | "B"
  src: string
  running: boolean
  duration: number
  startTime: number
  prewarmed: boolean
  nextFrameReady: boolean
  switchPending: boolean
  rafId: number | null
  loadRetries: number
  maxRetries: number
  loadTimeout: ReturnType<typeof setTimeout> | null
  PREWARM_TIME: number
  SWITCH_TIME: number
}

import type { Character as SelectedCharacter } from '../../../types/game'
import { getUnlockedCharacters, getCharacterById } from "../data/characters"
import { getActiveCharacter, selectCharacter } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"

export const CharacterSelectMixin: ThisType<WarehouseSceneThis> = {
  selectedCharacter: null as SelectedCharacter | null,
  characterPageEl: null as HTMLElement | null,
  _carryItems: [] as CarryItem[],
  _carryPickerEl: null as HTMLElement | null,
  _autoReplenish: false,
  _MAX_CARRY_ITEMS: 3,
  _live2dVideoState: null as Live2dVideoState | null,
  _loadingLock: false,
  _cardGlowHandler: null as ((e: MouseEvent) => void) | null,
  _handleCardKeydown: null as ((e: KeyboardEvent) => void) | null,
  _carryConfirmCleanup: null as (() => void) | null,

  initCharacterSelect() {
    this.characterPageEl = document.getElementById("lobbyCharacterSelect")
    this.selectedCharacter = getActiveCharacter() as SelectedCharacter | null
    this.bindCharacterSelectEvents()
    this.bindCardGlowEffect()
  },

  bindCharacterSelectEvents() {
    const backBtn = document.getElementById("characterSelectBackBtn")
    const confirmBtn = document.getElementById("characterSelectConfirmBtn")

    if (backBtn) {
      backBtn.addEventListener("click", () => (this as unknown as { showLobbySubPage(page: string): void }).showLobbySubPage("soloSetup"))
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => this.confirmCharacterSelection())
    }
  },

  bindCardGlowEffect() {
    this._cardGlowHandler = (e: MouseEvent) => {
      if (!this.characterPageEl || this.characterPageEl.classList.contains("hidden")) {
        return
      }
      const cards = document.querySelectorAll(".character-card")
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
          ; (card as HTMLElement).style.setProperty("--mouse-x", x + "%")
          ; (card as HTMLElement).style.setProperty("--mouse-y", y + "%")
      })
    }
    document.addEventListener("mousemove", this._cardGlowHandler)
  },

  showCharacterSelectPage(mapProfile: { name?: string } | null) {
    if (!this.characterPageEl) {
      this.initCharacterSelect()
    }

    this.selectedCharacter = getActiveCharacter() as SelectedCharacter | null

    const mapNameEl = document.getElementById("characterSelectMapName")
    if (mapNameEl && mapProfile) {
      mapNameEl.textContent = mapProfile.name || "未知仓库"
    }

    this.hideAllLobbySubPages()
    this.characterPageEl!.classList.remove("hidden")
    this.characterPageEl!.classList.add("lobby-subpage-entering")
    this.characterPageEl!.addEventListener(
      "animationend",
      () => {
        this.characterPageEl!.classList.remove("lobby-subpage-entering")
      },
      { once: true }
    )
    this._loadCarryItems()
    this._loadAutoReplenish()
    this.renderCharacterList()
    this.renderSelectedCharacterPreview()
    this.updateCharacterMoneyDisplay()
  },

  hideAllLobbySubPages() {
    this._stopLive2dLoop()

    const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement | null
    const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement | null

    if (videoA) {
      videoA.pause()
      videoA.src = ""
      videoA.classList.remove("active")
      videoA.style.opacity = "0"
    }
    if (videoB) {
      videoB.pause()
      videoB.src = ""
      videoB.classList.remove("active")
      videoB.style.opacity = "0"
    }

    const overlayEl = document.getElementById("characterSelectLive2dOverlay")
    if (overlayEl) {
      overlayEl.classList.remove("active")
    }

    const pages = ["lobbyMain", "lobbySoloSetup", "lobbyOnlinePlaceholder", "lobbyCharacterSelect"]
    pages.forEach((id) => {
      const el = document.getElementById(id)
      if (el) el.classList.add("hidden")
    })
  },

  renderCharacterList() {
    const listEl = document.getElementById("characterSelectList")
    if (!listEl) return

    const characters = getUnlockedCharacters()

    listEl.innerHTML = characters
      .map(
        (char: SelectedCharacter) => `
        <div class="character-card ${char.id === this.selectedCharacter?.id ? "selected" : ""}"
             data-char-id="${char.id}" tabindex="0" role="button" aria-pressed="${char.id === this.selectedCharacter?.id}">
          ${char.avatar ? `<img class="character-avatar-img" src="${char.avatar}" alt="${char.name}">` : '<div class="avatar-placeholder">👤</div>'}
          <div class="card-check">
            <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 class="character-name">${char.name}</h3>
        </div>
      `
      )
      .join("")

    const handleSelect = (e: Event) => {
      const card = (e.target as Element).closest(".character-card")
      if (card) {
        this.selectCharacter((card as HTMLElement).dataset.charId!)
      }
    }

    listEl.removeEventListener("click", handleSelect)
    listEl.addEventListener("click", handleSelect)

    listEl.removeEventListener("keydown", this._handleCardKeydown as EventListener)
    this._handleCardKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        const card = (e.target as Element).closest(".character-card")
        if (card) {
          e.preventDefault()
          this.selectCharacter((card as HTMLElement).dataset.charId!)
        }
      }
    }
    listEl.addEventListener("keydown", this._handleCardKeydown)
  },

  renderSelectedCharacterPreview() {
    const abilitiesEl = document.getElementById("characterSelectAbilities")
    const overlayEl = document.getElementById("characterSelectLive2dOverlay")
    const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement | null
    const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement | null

    if (!this.selectedCharacter) {
      if (overlayEl) {
        overlayEl.classList.remove("active")
      }
      this._stopLive2dLoop()
      if (videoA) {
        videoA.pause()
        videoA.src = ""
        videoA.classList.remove("active")
        videoA.style.opacity = "0"
      }
      if (videoB) {
        videoB.pause()
        videoB.src = ""
        videoB.classList.remove("active")
        videoB.style.opacity = "0"
      }
      if (abilitiesEl) {
        abilitiesEl.innerHTML = `
            <div class="ability-block preview-skill empty">
              <span class="ability-icon">⚔</span>
              <div class="ability-content">
                <span class="ability-label">主动技能</span>
                <p class="ability-value">—</p>
              </div>
            </div>
            <div class="ability-block preview-passive empty">
              <span class="ability-icon">✦</span>
              <div class="ability-content">
                <span class="ability-label">被动能力</span>
                <p class="ability-value">—</p>
              </div>
            </div>
            <div class="ability-block preview-items">
              <span class="ability-icon">🎒</span>
              <div class="ability-content">
                <div class="carry-label-row">
                  <span class="ability-label">携带道具</span>
                  <label class="carry-auto-toggle">
                    <input type="checkbox" id="carryAutoReplenish" ${this._autoReplenish ? "checked" : ""}>
                    <span class="carry-auto-slider"></span>
                    <span class="carry-auto-label">道具耗尽时自动用金币补充</span>
                  </label>
                </div>
                <div class="carry-items-row" id="carryItemsRow"></div>
              </div>
            </div>`
      }
      this._bindAutoReplenishToggle()
      this.renderCarryItems()
      return
    }

    const char = this.selectedCharacter

    if (overlayEl && videoA && videoB && char.live2d) {
      this._startLive2dLoop(char.live2d, videoA, videoB)
      overlayEl.classList.add("active")
    } else {
      this._stopLive2dLoop()
      if (videoA) {
        videoA.pause()
        videoA.src = ""
        videoA.classList.remove("active")
        videoA.style.opacity = "0"
      }
      if (videoB) {
        videoB.pause()
        videoB.src = ""
        videoB.classList.remove("active")
        videoB.style.opacity = "0"
      }
      if (overlayEl) {
        overlayEl.classList.remove("active")
      }
    }

    if (abilitiesEl) {
      abilitiesEl.innerHTML = `
          <div class="ability-block preview-skill">
            <span class="ability-icon">⚔</span>
            <div class="ability-content">
              <span class="ability-label">主动技能</span>
              <p class="ability-value"><strong>${char.skillName || ""}</strong> — ${char.skillDesc || ""}</p>
            </div>
          </div>
          ${char.passive
          ? `
          <div class="ability-block preview-passive">
            <span class="ability-icon">✦</span>
            <div class="ability-content">
              <span class="ability-label">被动能力</span>
              <p class="ability-value">${char.passive.label}</p>
            </div>
          </div>
          `
          : `
          <div class="ability-block preview-passive empty">
            <span class="ability-icon">✦</span>
            <div class="ability-content">
              <span class="ability-label">被动能力</span>
              <p class="ability-value">无</p>
            </div>
          </div>
          `
        }
          <div class="ability-block preview-items">
            <span class="ability-icon">🎒</span>
            <div class="ability-content">
              <div class="carry-label-row">
                <span class="ability-label">携带道具</span>
                <label class="carry-auto-toggle">
                  <input type="checkbox" id="carryAutoReplenish" ${this._autoReplenish ? "checked" : ""}>
                  <span class="carry-auto-slider"></span>
                  <span class="carry-auto-label">道具耗尽时自动用金币补充</span>
                </label>
              </div>
              <div class="carry-items-row" id="carryItemsRow"></div>
            </div>
          </div>
        `
    }

    this._bindAutoReplenishToggle()
    this.renderCarryItems()
  },

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

  /**
   * 计算自动补充携带道具所需的费用
   */
  calcReplenishCost(): ReplenishCostResult {
    const bridge = MobaoShopBridge
    if (!bridge) return { totalCost: 0, items: [] }
    const inv: Record<string, number> = bridge.getFullInventory()
    const result: ReplenishItem[] = []
    let totalCost = 0

    this._carryItems.forEach((item) => {
      const shopDef = (bridge.SHOP_ITEMS as Array<{ id: string; price?: number }>).find((s) => s.id === item.id)
      if (!shopDef) return
      const storageKey = bridge.getItemStorageKey(item.id) as string
      const count = inv[storageKey] || 0
      if (count <= 0) {
        const price = shopDef.price || 0
        result.push({ id: item.id, name: item.name, icon: item.icon, price, shortage: 1 })
        totalCost += price
      }
    })

    return { totalCost, items: result }
  },

  /**
   * 执行自动补充（扣费 + 补库存）
   */
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
  },

  _startLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement) {
    if (this._loadingLock) {
      console.log("[Live2D] 加载锁定中，跳过本次请求")
      return
    }

    this._stopLive2dLoop()
    this._loadingLock = true

    console.log("[Live2D] ========== 开始无缝循环 v2 ==========")
    console.log("[Live2D] 视频源:", src)

    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype
    console.log("[Live2D] requestVideoFrameCallback 支持:", hasRVFC)

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth <= 768

    const PREWARM_TIME = isMobile ? 5.0 : 2
    const SWITCH_TIME = isMobile ? 4.0 : 0.033

    console.log("[Live2D] 设备类型:", isMobile ? "移动端" : "桌面端")
    console.log("[Live2D] 预热时间:", PREWARM_TIME, "s")
    console.log("[Live2D] 切换时间:", SWITCH_TIME, "s")

    const state: Live2dVideoState = {
      current: "A",
      src,
      running: true,
      duration: 0,
      startTime: Date.now(),
      prewarmed: false,
      nextFrameReady: false,
      switchPending: false,
      rafId: null,
      loadRetries: 0,
      maxRetries: 3,
      loadTimeout: null,
      PREWARM_TIME,
      SWITCH_TIME
    }
    this._live2dVideoState = state

    const getCurrent = (): HTMLVideoElement => (state.current === "A" ? videoA : videoB)
    const getNext = (): HTMLVideoElement => (state.current === "A" ? videoB : videoA)
    const log = (msg: string) => console.log(`[Live2D] ${Date.now() - state.startTime}ms: ${msg}`)

    const clearLoadTimeout = () => {
      if (state.loadTimeout) {
        clearTimeout(state.loadTimeout)
        state.loadTimeout = null
      }
    }

    const retryLoad = () => {
      if (state.loadRetries >= state.maxRetries) {
        console.error("[Live2D] 视频加载失败，已达到最大重试次数")
        return
      }

      state.loadRetries++
      log(`重试加载视频 (第 ${state.loadRetries} 次)`)

      videoA.src = ""
      videoB.src = ""

      setTimeout(() => {
        videoA.src = src
        videoB.src = src
        videoA.load()
        videoB.load()
        setupLoadTimeout()
      }, 100)
    }

    const setupLoadTimeout = () => {
      clearLoadTimeout()
      state.loadTimeout = setTimeout(() => {
        if (!state.duration && state.running) {
          log("视频加载超时 (5秒)")
          retryLoad()
        }
      }, 5000)
    }

    videoA.classList.remove("active")
    videoB.classList.remove("active")
    videoA.style.opacity = "0"
    videoB.style.opacity = "0"

    const loadingPlaceholder = document.getElementById("live2dLoadingPlaceholder")
    if (loadingPlaceholder) {
      loadingPlaceholder.classList.add("visible")
    }

    const getReadyStateText = (video: HTMLVideoElement) => {
      const states = ["HAVE_NOTHING", "HAVE_METADATA", "HAVE_CURRENT_DATA", "HAVE_FUTURE_DATA", "HAVE_ENOUGH_DATA"]
      return states[video.readyState] || "UNKNOWN"
    }

    const getNetworkStateText = (video: HTMLVideoElement) => {
      const states = ["NETWORK_EMPTY", "NETWORK_IDLE", "NETWORK_LOADING", "NETWORK_NO_SOURCE"]
      return states[video.networkState] || "UNKNOWN"
    }

    const diagnoseVideo = (label: string, video: HTMLVideoElement) => {
      console.log(`[Live2D-DIAG] ${label}:`)
      console.log(`[Live2D-DIAG]   src: ${video.src}`)
      console.log(`[Live2D-DIAG]   readyState: ${video.readyState} (${getReadyStateText(video)})`)
      console.log(`[Live2D-DIAG]   networkState: ${video.networkState} (${getNetworkStateText(video)})`)
      console.log(`[Live2D-DIAG]   currentTime: ${video.currentTime.toFixed(3)}s`)
      console.log(`[Live2D-DIAG]   duration: ${video.duration.toFixed(3)}s`)
      console.log(`[Live2D-DIAG]   paused: ${video.paused}`)
      console.log(`[Live2D-DIAG]   buffered: ${video.buffered.length} ranges`)
      if (video.buffered.length > 0) {
        console.log(
          `[Live2D-DIAG]   buffered 0: ${video.buffered.start(0).toFixed(3)} - ${video.buffered.end(0).toFixed(3)}`
        )
      }
    }

    console.log("[Live2D-DIAG] ========== 开始加载视频 ==========")
    console.log(`[Live2D-DIAG] 视频路径: ${src}`)
    console.log(`[Live2D-DIAG] 开始时间: ${Date.now()}`)

    const previousSrcA = videoA.src
    console.log(`[Live2D-DIAG] videoA之前的src: ${previousSrcA}`)
    console.log(`[Live2D-DIAG] videoB之前的src: ${videoB.src}`)
    console.log(
      `[Live2D-DIAG] 是否切换到相同视频: ${previousSrcA === src || previousSrcA.includes(src.substring(src.lastIndexOf("/")))}`
    )

    diagnoseVideo("videoA 初始状态", videoA)

    videoA.classList.add("active")
    videoA.src = src
    videoB.src = src

    console.log(`[Live2D-DIAG] 设置src后: ${Date.now()}`)
    diagnoseVideo("videoA 设置src后", videoA)

    videoA.load()
    videoB.load()

    console.log(`[Live2D-DIAG] 调用load()后: ${Date.now()}`)
    diagnoseVideo("videoA load()后", videoA)

    setupLoadTimeout()

    const loadStartTime = Date.now()
    const getElapsed = () => `${Date.now() - loadStartTime}ms`

    console.log(`[Live2D-PERF] ========== 性能计时开始 ==========`)
    console.log(`[Live2D-PERF] 开始时间: ${loadStartTime}`)

    const stopPolling = () => {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }
    }

    const startPolling = () => {
      stopPolling()
      state.rafId = requestAnimationFrame(pollProgress)
    }

    const prewarmNext = () => {
      if (state.prewarmed) return
      state.prewarmed = true

      const next = getNext()

      console.log(`[Live2D-DIAG] 预热备用视频:`)
      diagnoseVideo(`next before prewarm`, next)

      const markFrameReady = () => {
        if (!state.running || state.nextFrameReady) return
        state.nextFrameReady = true
        log(`备用视频首帧已渲染 @ ${next.currentTime.toFixed(3)}s`)
        console.log(`[Live2D-DIAG] 备用视频首帧就绪:`)
        diagnoseVideo(`next frame ready`, next)
        if (state.switchPending) {
          performSwitch()
        }
      }

      next.style.opacity = "0"

      if (next.readyState >= 3) {
        log(`[快速路径] seek到0, 等待readyState恢复`)
        next.currentTime = 0
        const waitSeek = () => {
          if (!state.running) return
          if (next.readyState >= 3) {
            log(`[快速路径] seek完成, 预热解码器`)
            next.play().catch(() => { })
            if (hasRVFC) {
              next.requestVideoFrameCallback(() => {
                next.pause()
                log(`[快速路径] 解码器已预热, 就绪`)
                markFrameReady()
              })
            } else {
              const checkDecode = () => {
                if (next.currentTime > 0 || next.readyState >= 4) {
                  next.pause()
                  markFrameReady()
                } else {
                  requestAnimationFrame(checkDecode)
                }
              }
              requestAnimationFrame(checkDecode)
            }
          } else {
            log(`[快速路径] 等待解码恢复 readyState=${next.readyState}`)
            requestAnimationFrame(waitSeek)
          }
        }
        requestAnimationFrame(waitSeek)
        return
      }

      log(`[慢速路径] readyState=${next.readyState}, 需要解码首帧, 调用 play()`)
      next.play().catch(() => { })

      if (hasRVFC) {
        next.requestVideoFrameCallback(() => {
          log(`[RVFC回调] 首帧已解码 @ ${next.currentTime.toFixed(3)}s, pause()`)
          next.pause()
          markFrameReady()
        })
      } else {
        const checkFrame = () => {
          if (!state.running) return
          if (next.readyState >= 3 || next.currentTime > 0) {
            log(`[轮询就绪] readyState=${next.readyState}, currentTime=${next.currentTime.toFixed(3)}, pause()`)
            next.pause()
            markFrameReady()
          } else {
            requestAnimationFrame(checkFrame)
          }
        }
        requestAnimationFrame(checkFrame)
      }
    }

    const performSwitch = () => {
      if (!state.running) return
      state.switchPending = false

      const current = getCurrent()
      const next = getNext()
      const nextKey: "A" | "B" = state.current === "A" ? "B" : "A"
      const oldKey = state.current

      const t0 = Date.now()
      log(`========== 执行切换 ${oldKey} -> ${nextKey} ==========`)

      console.log(`[Live2D-DIAG] 切换前状态:`)
      diagnoseVideo(`current (${oldKey})`, current)
      diagnoseVideo(`next (${nextKey})`, next)

      next.style.opacity = "1"
      next.classList.add("active")
      const playT0 = Date.now()
      next.play().catch(() => { })
      const playT1 = Date.now()
      if (playT1 - playT0 > 1) {
        log(`[性能] next.play() 阻塞了 ${playT1 - playT0}ms`)
      }

      setTimeout(() => {
        current.pause()
        current.style.opacity = "0"
        current.classList.remove("active")
      }, 0)

      state.current = nextKey
      state.prewarmed = false
      state.nextFrameReady = false

      log(`切换完成，耗时 ${Date.now() - t0}ms`)

      setTimeout(() => {
        console.log(`[Live2D-DIAG] 重置旧视频(=${oldKey})到第一帧:`)
        diagnoseVideo(`current before reset`, current)

        const resetStartTime = Date.now()

        current.pause()

        current.removeAttribute("src")
        current.load()

        console.log(`[Live2D-DIAG] 清空src后:`)
        diagnoseVideo(`current after clear`, current)

        setTimeout(() => {
          current.src = state.src
          current.load()

          const resetElapsed = Date.now() - resetStartTime
          console.log(`[Live2D-PERF] 重置视频耗时: ${resetElapsed}ms`)
          console.log(`[Live2D-DIAG] 重置后 readyState=${current.readyState}:`)
          diagnoseVideo(`current after reset`, current)
          log(`旧视频${oldKey}已重置到第一帧 (缓存${resetElapsed}ms)`)
        }, 50)
      }, 200)

      startPolling()
    }

    const requestSwitch = () => {
      if (state.switchPending) return

      if (state.nextFrameReady) {
        performSwitch()
      } else {
        state.switchPending = true
        log(`切换等待备用视频首帧就绪...`)
        if (!state.prewarmed) {
          prewarmNext()
        }
      }
    }

    const pollProgress = () => {
      if (!state.running) return

      const current = getCurrent()
      const currentKey = state.current

      if (state.duration > 0 && !current.paused) {
        const remaining = state.duration - current.currentTime
        if (remaining <= state.PREWARM_TIME && !state.prewarmed) {
          log(`[轮询] 视频${currentKey} 剩余 ${remaining.toFixed(3)}s, 触发预热`)
          prewarmNext()
        }

        if (remaining <= state.SWITCH_TIME && !state.switchPending) {
          log(`[轮询] 视频${currentKey} 剩余 ${remaining.toFixed(3)}s, 触发切换`)
          requestSwitch()
          return
        }
      }

      if (state.running) {
        state.rafId = requestAnimationFrame(pollProgress)
      }
    }

    videoA.onloadedmetadata = () => {
      console.log(`[Live2D-PERF] videoA loadedmetadata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onloadedmetadata: ${Date.now()}`)
      diagnoseVideo("videoA loadedmetadata", videoA)
    }

    videoB.onloadedmetadata = () => {
      console.log(`[Live2D-PERF] videoB loadedmetadata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onloadedmetadata: ${Date.now()}`)
      diagnoseVideo("videoB loadedmetadata", videoB)
    }

    videoA.onloadeddata = () => {
      if (!state.running) return

      if (!videoA.classList.contains("active")) {
        console.log(`[Live2D-DIAG] videoA loadeddata 忽略（非活动状态）`)
        return
      }

      console.log(`[Live2D-PERF] videoA loadeddata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onloadeddata: ${Date.now()}`)
      diagnoseVideo("videoA loadeddata", videoA)
      clearLoadTimeout()
      this._loadingLock = false
      state.duration = videoA.duration
      log(`videoA 加载完成, duration: ${videoA.duration}s`)

      if (loadingPlaceholder) {
        loadingPlaceholder.classList.remove("visible")
      }

      videoA.style.opacity = "1"
      videoA.play().catch((e) => console.error("[Live2D] videoA play 失败:", e))
      startPolling()

      setTimeout(() => {
        if (!state.running) return
        videoB.play().catch(() => { })
        if (hasRVFC) {
          videoB.requestVideoFrameCallback(() => {
            videoB.pause()
            console.log(`[Live2D-PERF] videoB 初始预解码完成: ${getElapsed()}`)
          })
        }
      }, 100)
    }

    videoB.onloadeddata = () => {
      if (!state.running) return

      if (!videoB.classList.contains("active")) {
        console.log(`[Live2D-DIAG] videoB loadeddata 忽略（非活动状态）`)
        return
      }

      console.log(`[Live2D-PERF] videoB loadeddata: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onloadeddata: ${Date.now()}`)
      diagnoseVideo("videoB loadeddata", videoB)
      log(`videoB 加载完成`)
      videoB.currentTime = 0
      videoB.pause()
    }

    videoA.oncanplay = () => {
      console.log(`[Live2D-PERF] videoA canplay: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA oncanplay: ${Date.now()}`)
      diagnoseVideo("videoA canplay", videoA)
    }

    videoB.oncanplay = () => {
      console.log(`[Live2D-PERF] videoB canplay: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB oncanplay: ${Date.now()}`)
    }

    videoA.oncanplaythrough = () => {
      console.log(`[Live2D-PERF] videoA canplaythrough: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA oncanplaythrough: ${Date.now()}`)
    }

    videoB.oncanplaythrough = () => {
      console.log(`[Live2D-PERF] videoB canplaythrough: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB oncanplaythrough: ${Date.now()}`)
    }

    videoA.onprogress = () => {
      if (videoA.buffered.length > 0) {
        const end = videoA.buffered.end(videoA.buffered.length - 1)
        const percent = videoA.duration > 0 ? ((end / videoA.duration) * 100).toFixed(1) : "0"
        console.log(`[Live2D-DIAG] videoA progress: ${percent}% buffered`)
      }
    }

    videoA.onwaiting = () => {
      console.log(`[Live2D-PERF] videoA waiting: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onwaiting: ${Date.now()}`)
    }

    videoA.onplaying = () => {
      if (!videoA.classList.contains("active")) return
      console.log(`[Live2D-PERF] videoA playing: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoA onplaying: ${Date.now()}`)
    }

    videoB.onplaying = () => {
      if (!videoB.classList.contains("active")) return
      console.log(`[Live2D-PERF] videoB playing: ${getElapsed()}`)
      console.log(`[Live2D-DIAG] videoB onplaying: ${Date.now()}`)
    }

    videoA.onended = () => {
      if (!state.running || state.current !== "A") return
      log(`videoA ended 事件兜底触发`)
      requestSwitch()
    }

    videoB.onended = () => {
      if (!state.running || state.current !== "B") return
      log(`videoB ended 事件兜底触发`)
      requestSwitch()
    }

    videoA.onerror = (e) => {
      console.error("[Live2D-DIAG] ========== videoA ERROR ==========")
      console.error("[Live2D-DIAG] 时间:", Date.now())
      console.error("[Live2D-DIAG] 事件:", e)
      if (videoA.error) {
        console.error("[Live2D-DIAG] error code:", videoA.error.code)
        console.error("[Live2D-DIAG] error message:", videoA.error.message)
      }
      console.error("[Live2D-DIAG] src:", videoA.src)
      console.error("[Live2D-DIAG] networkState:", videoA.networkState)
      console.error("[Live2D-DIAG] readyState:", videoA.readyState)
      diagnoseVideo("videoA error state", videoA)
      if (state.running && state.loadRetries < state.maxRetries) {
        retryLoad()
      } else {
        this._loadingLock = false
      }
    }
    videoB.onerror = (e) => {
      console.error("[Live2D-DIAG] ========== videoB ERROR ==========")
      console.error("[Live2D-DIAG] 时间:", Date.now())
      console.error("[Live2D-DIAG] 事件:", e)
      if (videoB.error) {
        console.error("[Live2D-DIAG] error code:", videoB.error.code)
        console.error("[Live2D-DIAG] error message:", videoB.error.message)
      }
      console.error("[Live2D-DIAG] src:", videoB.src)
      console.error("[Live2D-DIAG] networkState:", videoB.networkState)
      console.error("[Live2D-DIAG] readyState:", videoB.readyState)
      diagnoseVideo("videoB error state", videoB)
      if (state.running && state.loadRetries < state.maxRetries) {
        retryLoad()
      } else {
        this._loadingLock = false
      }
    }
  },

  _stopLive2dLoop() {
    this._loadingLock = false

    const loadingPlaceholder = document.getElementById("live2dLoadingPlaceholder")
    if (loadingPlaceholder) {
      loadingPlaceholder.classList.remove("visible")
    }

    if (this._live2dVideoState) {
      this._live2dVideoState.running = false
      if (this._live2dVideoState.rafId) {
        cancelAnimationFrame(this._live2dVideoState.rafId)
      }
      if (this._live2dVideoState.loadTimeout) {
        clearTimeout(this._live2dVideoState.loadTimeout)
      }
      this._live2dVideoState = null
    }

    const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement | null
    const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement | null

    if (videoA) {
      videoA.pause()
      videoA.onloadedmetadata = null
      videoA.onloadeddata = null
      videoA.ontimeupdate = null
      videoA.onended = null
      videoA.onerror = null
      videoA.oncanplay = null
      videoA.oncanplaythrough = null
      videoA.onprogress = null
      videoA.onwaiting = null
      videoA.onplaying = null
      videoA.removeAttribute("src")
      videoA.srcObject = null
      videoA.load()
    }

    if (videoB) {
      videoB.pause()
      videoB.onloadedmetadata = null
      videoB.onloadeddata = null
      videoB.ontimeupdate = null
      videoB.onended = null
      videoB.onerror = null
      videoB.oncanplay = null
      videoB.oncanplaythrough = null
      videoB.onplaying = null
      videoB.removeAttribute("src")
      videoB.srcObject = null
      videoB.load()
    }

    console.log("[Live2D-DIAG] 已停止循环并清理视频资源")
  },

  selectCharacter(characterId: string) {
    const char = getCharacterById(characterId) as SelectedCharacter | null
    if (!char) return

    this.selectedCharacter = char
    selectCharacter(characterId)
    try {
      window.localStorage.setItem("mobao_selected_character_v1", JSON.stringify(characterId))
    } catch (_e) { }

    document.querySelectorAll(".character-card").forEach((card) => {
      const isSelected = (card as HTMLElement).dataset.charId === characterId
      card.classList.toggle("selected", isSelected)
      card.setAttribute("aria-pressed", String(isSelected))
    })

    this.renderSelectedCharacterPreview()

    if (typeof (this as unknown as { updatePlayerAvatar?: Function }).updatePlayerAvatar === "function" && (this as unknown as { players?: unknown[] }).players) {
      const humanPlayer = (this as unknown as { players: { isHuman: boolean; id: string }[] }).players.find((p: { isHuman: boolean }) => p.isHuman)
      if (humanPlayer) {
        const avatarEl = document.getElementById(`avatar-${humanPlayer.id}`)
        if (avatarEl) {
          ; (this as unknown as { updatePlayerAvatar(id: string, el: HTMLElement): void }).updatePlayerAvatar(humanPlayer.id, avatarEl)
        }
      }
    }
  },

  confirmCharacterSelection() {
    if (!this.selectedCharacter) return

    if (this._carryItems.length > 0) {
      if (this._autoReplenish) {
        const result = this.executeReplenish()
        if (!result.ok) {
          this._showCarryConfirm(
            `资金不足！\n补充道具需要 ${result.need}，当前仅有 ${result.have}。\n\n请取消部分道具或关闭自动补充后再试。`,
            null,
            "知道了"
          )
          return
        }
        this.renderCarryItems()
        this.updateCharacterMoneyDisplay()
      } else {
        const bridge = MobaoShopBridge
        if (bridge) {
          const inventory: Record<string, number> = bridge.getFullInventory()
          const depleted = this._carryItems.filter((item) => {
            const storageKey = bridge.getItemStorageKey(item.id) as string
            return (inventory[storageKey] || 0) <= 0
          })
          if (depleted.length > 0) {
            const names = depleted.map((i) => i.name).join("、")
            this._showCarryConfirm(
              `以下携带道具库存已耗尽：${names}\n\n进入游戏后将无法使用这些道具，是否继续？`,
              () => this._doStartSoloGame()
            )
            return
          }
        }
      }
    }

    this._doStartSoloGame()
  },

  _doStartSoloGame() {
    if (typeof (this as unknown as { startSoloGame?: Function }).startSoloGame === "function") {
      ; (this as unknown as { startSoloGame(): void }).startSoloGame()
    }
  },

  /**
   * 游戏内风格的确认弹窗
   */
  _showCarryConfirm(message: string, onConfirm: (() => void) | null, confirmText?: string) {
    const overlay = document.getElementById("gameConfirmOverlay")
    const msgEl = document.getElementById("gameConfirmMsg")
    const okBtn = document.getElementById("gameConfirmOkBtn") as HTMLButtonElement | null
    const cancelBtn = document.getElementById("gameConfirmCancelBtn") as HTMLButtonElement | null
    if (!overlay || !msgEl || !okBtn || !cancelBtn) {
      if (onConfirm) {
        if (window.confirm(message)) onConfirm()
      } else {
        window.alert(message)
      }
      return
    }

    if (this._carryConfirmCleanup) {
      this._carryConfirmCleanup()
    }

    const hasConfirm = typeof onConfirm === "function"
    msgEl.textContent = message
    okBtn.textContent = confirmText || "确认"
    cancelBtn.style.display = hasConfirm ? "" : "none"
    overlay.classList.remove("hidden")

    const handleOk = (e: Event) => {
      e.stopPropagation()
      cleanup()
      if (hasConfirm) onConfirm!()
    }
    const handleCancel = (e: Event) => {
      e.stopPropagation()
      cleanup()
    }
    const cleanup = () => {
      overlay.classList.add("hidden")
      okBtn.removeEventListener("click", handleOk)
      cancelBtn.removeEventListener("click", handleCancel)
      this._carryConfirmCleanup = null
      okBtn.textContent = "确认"
      cancelBtn.style.display = ""
    }

    this._carryConfirmCleanup = cleanup
    okBtn.addEventListener("click", handleOk)
    cancelBtn.addEventListener("click", handleCancel)
  },

  updateCharacterMoneyDisplay() {
    const moneyEl = document.getElementById("characterSelectMoney")
    if (!moneyEl) return

    const money: number = MobaoShopBridge ? MobaoShopBridge.getPlayerMoney() : 0
    moneyEl.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${money.toLocaleString()}`
  },

  getSelectedCharacterForGame(): SelectedCharacter | null {
    return this.selectedCharacter || (getActiveCharacter() as SelectedCharacter | null)
  }
}
