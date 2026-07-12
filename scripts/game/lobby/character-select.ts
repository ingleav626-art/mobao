/**
 * @file scripts/game/lobby/character-select.ts
 * @module lobby/character-select
 * @description 角色选择薄入口。通过 Object.assign 合并 3 个子 Mixin
 *              （Core/Live2D/CarryItems），re-export 纯函数。
 *              原 1194 行已按职责拆分到 character-select/ 目录。
 *              核心逻辑：角色列表渲染、选择确认、Live2D 预览、携带道具管理。
 *
 * @requires data/characters - 角色数据
 * @requires data/character-system - 角色运行时
 * @requires bridge/shop - 商店系统
 * @requires ./character-select/live2d, ./character-select/carry-items - 子 Mixin
 * @exports CharacterSelectMixin - 角色选择 Mixin，混入 Phaser Scene
 * @exports 纯函数 re-export - calcReplenishCost 等
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

import type { Character as SelectedCharacter } from "../../../types/game"
import { getUnlockedCharacters, getCharacterById } from "../data/characters"
import { getActiveCharacter, selectCharacter } from "../data/character-system"
import { MobaoShopBridge } from "../bridge/shop"

import { Live2dMixin } from "./character-select/live2d"
import { CarryItemsMixin } from "./character-select/carry-items"
import { SELECTED_CHARACTER_STORAGE_KEY } from "../core/constants"

export {
  type CarryItem,
  type ReplenishItem,
  type ReplenishCostResult,
  calcReplenishCost
} from "./character-select/pure"

const CoreMixin: ThisType<WarehouseSceneThis> = {
  selectedCharacter: null as SelectedCharacter | null,
  characterPageEl: null as HTMLElement | null,
  _carryItems: [] as Array<{ id: string; name: string; icon: string }>,
  _carryPickerEl: null as HTMLElement | null,
  _autoReplenish: false,
  _MAX_CARRY_ITEMS: 3,
  _live2dVideoState: null as Record<string, unknown> | null,
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
      backBtn.addEventListener("click", () => this.showLobbySubPage("soloSetup"))
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

  selectCharacter(characterId: string) {
    const char = getCharacterById(characterId) as SelectedCharacter | null
    if (!char) return

    this.selectedCharacter = char
    selectCharacter(characterId)
    try {
      window.localStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, JSON.stringify(characterId))
    } catch (_e) { }

    document.querySelectorAll(".character-card").forEach((card) => {
      const isSelected = (card as HTMLElement).dataset.charId === characterId
      card.classList.toggle("selected", isSelected)
      card.setAttribute("aria-pressed", String(isSelected))
    })

    this.renderSelectedCharacterPreview()

    if (this.updatePlayerAvatar && this.players) {
      const humanPlayer = this.players.find((p) => p.isHuman)
      if (humanPlayer) {
        const avatarEl = document.getElementById(`avatar-${humanPlayer.id}`)
        if (avatarEl) {
          this.updatePlayerAvatar(humanPlayer.id, avatarEl)
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
    if (this.startSoloGame) {
      this.startSoloGame()
    }
  },

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

export const CharacterSelectMixin: ThisType<WarehouseSceneThis> = Object.assign(
  {},
  CoreMixin,
  Live2dMixin,
  CarryItemsMixin
)
