/**
 * @file lobby/lobby-index-manager/init-fns.ts
 * @description 大厅初始化函数（从 LobbyIndexManager 提取）
 */
import type { LobbyIndexManagerDeps, LobbyIndexState } from "../lobby-index-manager"
import type { Player } from "../../../../types/game"
import { Deps } from "../../core/deps"
import { GAME_SETTINGS } from "../../core/settings"
import { getProfile, getSelectedProfileId } from "../../data/map-profiles"
import { MobaoShopBridge } from "../../bridge/shop"
import { getActiveCharacter } from "../../data/character-system"
import { getCharacterById } from "../../data/characters"
import { ARTIFACT_LIBRARY } from "../../data/artifacts"
import { MobaoShopPage } from "../../shop/index"
import { CARRY_ITEMS_STORAGE_KEY } from "../../core/constants"
import { loadPlayerMoney } from "../../core/player-money"
import { isAiLlmEnabledForPlayer as checkAiLlmPlayerEnabled, getSlotLayout } from "../index"
import { showLobbyMain, showLobbySubPage, goToCharacterSelect } from "./navigation-fns"

export function bindLobbyEvents(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  const soloBtn = document.getElementById("lobbySoloBtn")
  const onlineBtn = document.getElementById("lobbyOnlineBtn")
  const lobbySettingsBtn = document.getElementById("lobbySettingsBtn")
  const lobbyCollectionBtn = document.getElementById("lobbyCollectionBtn")
  const lobbyBattleRecordBtn = document.getElementById("lobbyBattleRecordBtn")
  const lobbyShopBtn = document.getElementById("lobbyShopBtn")
  const lobbySoloBackBtn = document.getElementById("lobbySoloBackBtn")
  const lobbySoloShopBtn = document.getElementById("lobbySoloShopBtn")
  const lobbyOnlineBackBtn = document.getElementById("lobbyOnlineBackBtn")
  const lobbyStartGameBtn = document.getElementById("lobbyStartGameBtn")
  const carouselLeftBtn = document.getElementById("carouselLeftBtn")
  const carouselRightBtn = document.getElementById("carouselRightBtn")

  if (soloBtn) {
    soloBtn.addEventListener("click", () => showLobbySubPage(deps, state, "soloSetup"))
  }
  if (onlineBtn) {
    onlineBtn.addEventListener("click", () => showLobbySubPage(deps, state, "onlinePlaceholder"))
  }
  if (lobbySettingsBtn) {
    lobbySettingsBtn.addEventListener("click", () => deps.openSettingsOverlay())
  }
  if (lobbyCollectionBtn) {
    lobbyCollectionBtn.addEventListener("click", () => deps.openCollectionOverlay())
  }
  if (lobbyBattleRecordBtn) {
    lobbyBattleRecordBtn.addEventListener("click", () => deps.openBattleRecordPanel())
  }
  if (lobbyShopBtn) {
    lobbyShopBtn.addEventListener("click", () => deps.openShopOverlay())
  }
  if (lobbySoloBackBtn) {
    lobbySoloBackBtn.addEventListener("click", () => showLobbyMain(state))
  }
  if (lobbySoloShopBtn) {
    lobbySoloShopBtn.addEventListener("click", () => deps.openShopOverlay())
  }
  if (lobbyOnlineBackBtn) {
    lobbyOnlineBackBtn.addEventListener("click", () => {
      const roomPanel = document.getElementById("lobbyOnlineRoom")
      const isInRoom = roomPanel && !roomPanel.classList.contains("hidden")
      if (isInRoom) {
        deps.showGameConfirm("确定要离开房间吗？", () => {
          if (deps.lanBridge) {
            deps.lanBridge.leaveRoom()
            deps.lanBridge.disconnect()
          }
          showLobbyMain(state)
        })
      } else {
        showLobbyMain(state)
      }
    })
  }
  if (lobbyStartGameBtn) {
    lobbyStartGameBtn.addEventListener("click", () => goToCharacterSelect(deps, state))
  }
  if (carouselLeftBtn) {
    carouselLeftBtn.addEventListener("click", () => deps.carouselScroll(-1))
  }
  if (carouselRightBtn) {
    carouselRightBtn.addEventListener("click", () => deps.carouselScroll(1))
  }

  state.carouselOffset = 0
  deps.renderCarousel()
  deps.initLanLobby()
}

export function updateLobbyMoneyDisplay() {
  const money: number = MobaoShopBridge ? MobaoShopBridge.getPlayerMoney() : loadPlayerMoney()
  const mainMoney = document.getElementById("lobbyMainMoney")
  const soloMoney = document.getElementById("lobbySoloMoney")
  if (mainMoney) {
    const textEl = mainMoney.querySelector(".hud-icon") ? mainMoney.lastChild : mainMoney
    if (textEl && textEl.nodeType === 3) textEl.textContent = " " + money.toLocaleString()
    else
      mainMoney.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${money.toLocaleString()}`
  }
  if (soloMoney) {
    const textEl = soloMoney.querySelector(".hud-icon") ? soloMoney.lastChild : soloMoney
    if (textEl && textEl.nodeType === 3) textEl.textContent = " " + money.toLocaleString()
    else
      soloMoney.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${money.toLocaleString()}`
  }
}

export function applyMapProfile(state: LobbyIndexState) {
  if (!getProfile) {
    return
  }
  const profile = getProfile(getSelectedProfileId())
  if (!profile || !profile.params) {
    return
  }
  const p = profile.params
  if (Number.isFinite(p.maxRounds)) {
    GAME_SETTINGS.maxRounds = p.maxRounds
  }
  if (Number.isFinite(p.directTakeRatio)) {
    GAME_SETTINGS.directTakeRatio = p.directTakeRatio
  }
  state.mapQualityWeights = p.qualityWeights || null
  state.mapCategoryWeights = p.categoryWeights || null
}

export function initPlayersUI(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  const activeIds = new Set(state.players.map((p: Player) => p.id))
  ;["p1", "p2", "p3", "p4"].forEach((slotId) => {
    const cardEl = document.getElementById(`playerCard-${slotId}`)
    if (!cardEl) return
    if (activeIds.has(slotId)) {
      cardEl.classList.remove("player-card-hidden")
    } else {
      cardEl.classList.add("player-card-hidden")
    }
  })

  const leftSide = document.getElementById("leftPlayerSide")
  const rightSide = document.getElementById("rightPlayerSide")
  const personalPanel = document.getElementById("personalPanel")
  const publicPanel = document.getElementById("publicPanel")
  if (leftSide && rightSide) {
    const { leftSlots, rightSlots } = getSlotLayout(state.players.length)

    leftSlots.forEach((slotId) => {
      const cardEl = document.getElementById(`playerCard-${slotId}`)
      if (cardEl) leftSide.insertBefore(cardEl, personalPanel)
    })
    rightSlots.forEach((slotId) => {
      const cardEl = document.getElementById(`playerCard-${slotId}`)
      if (cardEl) rightSide.insertBefore(cardEl, publicPanel)
    })

    if (personalPanel) leftSide.appendChild(personalPanel)
    if (publicPanel) rightSide.appendChild(publicPanel)
  }

  state.players.forEach((player: Player) => {
    const nameEl = document.getElementById(`name-${player.id}`)
    const avatarEl = document.getElementById(`avatar-${player.id}`)
    const cardEl = document.getElementById(`playerCard-${player.id}`)
    if (nameEl) {
      nameEl.textContent = player.name
    }
    if (avatarEl) {
      updatePlayerAvatar(state, player.id, avatarEl)
    }

    if (cardEl) {
      const metaEl = cardEl.querySelector(".meta")
      if (metaEl && player.isAI) {
        const toggleId = `llm-switch-${player.id}`
        let switchEl = document.getElementById(toggleId) as HTMLInputElement | null
        if (!switchEl) {
          const label = document.createElement("label")
          label.className = "llm-player-switch"
          label.setAttribute("for", toggleId)
          label.title = "启用该AI位的大模型决策"

          const input = document.createElement("input")
          input.type = "checkbox"
          input.id = toggleId
          input.checked = isAiLlmEnabledForPlayer(state, player.id)
          input.addEventListener("change", () => {
            state.aiLlmPlayerEnabled[player.id] = Boolean(input.checked)
            if (Deps.LLM_BRIDGE) {
              Deps.LLM_BRIDGE.saveAiLlmPlayerSwitches(state.aiLlmPlayerEnabled)
            }
            deps.writeLog(`${player.name} 的大模型${input.checked ? "已启用" : "已关闭"}（总开关关闭时仍不会调用）。`)
          })

          const text = document.createElement("span")
          text.textContent = "LLM"

          label.appendChild(input)
          label.appendChild(text)
          metaEl.appendChild(label)
          switchEl = input
        }

        switchEl.checked = isAiLlmEnabledForPlayer(state, player.id)
        if (state.isLanMode) {
          switchEl.disabled = true
          const labelEl = switchEl.closest(".llm-player-switch")
          if (labelEl) labelEl.classList.add("llm-switch-disabled")
        } else {
          switchEl.disabled = false
          const labelEl = switchEl.closest(".llm-player-switch")
          if (labelEl) labelEl.classList.remove("llm-switch-disabled")
        }
      } else if (metaEl && !player.isAI) {
        const existingLabel = metaEl.querySelector(".llm-player-switch")
        if (existingLabel) existingLabel.remove()
      }

      let historyEl = document.getElementById(`history-${player.id}`)
      if (!historyEl) {
        const history = document.createElement("div")
        history.id = `history-${player.id}`
        history.className = "player-history"
        historyEl = history
      }

      if (historyEl.parentElement !== cardEl) {
        cardEl.appendChild(historyEl)
      }
    }

    state.playerHistoryPanels[player.id] = document.getElementById(`history-${player.id}`)!
  })
  deps.refreshPlayerHistoryUI()
  updatePlayerCharNames(state)
}

export function updatePlayerAvatar(state: LobbyIndexState, playerId: string, avatarEl: HTMLElement) {
  const player = state.players.find((p: Player) => p.id === playerId)
  if (!player || !avatarEl) return

  if (player.isHuman) {
    const char = getActiveCharacter()
    if (char && (char as { avatar?: string }).avatar) {
      avatarEl.innerHTML = `<img src="${(char as { avatar?: string }).avatar}" alt="${char.name}" class="avatar-img">`
      return
    }
  }

  if (state.aiCharacterAssignments && state.aiCharacterAssignments[playerId]) {
    const assign = state.aiCharacterAssignments[playerId]
    const charData = getCharacterById(assign.characterId)
    if (charData && charData.avatar) {
      avatarEl.innerHTML = `<img src="${charData.avatar}" alt="${charData.name}" class="avatar-img">`
      return
    }
  }

  avatarEl.textContent = player.avatar || player.name.charAt(0)
}

export function isAiLlmEnabledForPlayer(state: LobbyIndexState, playerId: string): boolean {
  return checkAiLlmPlayerEnabled(state.aiLlmPlayerEnabled, playerId)
}

export function initPreviewFilterOptions(deps: LobbyIndexManagerDeps) {
  const categories = [...new Set(ARTIFACT_LIBRARY.map((item: { category: string }) => item.category))]
  const options = ['<option value="all">全部品类</option>']
    .concat(categories.map((category: string) => `<option value="${category}">${category}</option>`))
    .join("")

  ;(deps.dom.previewCategorySelect as HTMLElement).innerHTML = options
  ;(deps.dom.bidInput as HTMLInputElement).step = "1"
  ;(deps.dom.bidInput as HTMLInputElement).min = "0"
}

export function renderShopContent(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  if (typeof MobaoShopPage !== "undefined") {
    MobaoShopPage.init({
      onPurchase: (result?: { ok?: boolean; message?: string; newMoney?: number }) => {
        if (result && result.ok) {
          state.playerMoney = result.newMoney ?? 0
          syncItemManagerFromShop(deps)
          updateLobbyMoneyDisplay()
        }
      }
    })
    MobaoShopPage.updateMoneyDisplay()
    MobaoShopPage.renderAllItems()
    MobaoShopPage.renderInventory()
  }
}

export function syncItemManagerFromShop(deps: LobbyIndexManagerDeps) {
  if (!MobaoShopBridge) return
  const bridge = MobaoShopBridge
  const inv = bridge.getFullInventory()

  let carryIds: Set<string> | undefined
  try {
    const raw = window.localStorage.getItem(CARRY_ITEMS_STORAGE_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        carryIds = new Set(parsed.filter((i: { id?: string }) => i && i.id).map((i: { id: string }) => i.id))
      }
    }
  } catch (_e) {
    /* ignore */
  }

  deps.itemManager.items.forEach((item: { id: string; count?: number }) => {
    const storageKey = bridge.getItemStorageKey(item.id)
    const shopCount = inv[storageKey] || 0

    if (carryIds instanceof Set) {
      item.count = carryIds.has(item.id) ? shopCount : 0
    } else {
      item.count = shopCount
    }
  })
}

export function updatePlayerCharNames(state: LobbyIndexState) {
  state.players.forEach((player: Player) => {
    const avatarEl = document.getElementById(`avatar-${player.id}`)
    if (!avatarEl) return
    let charName = ""
    if (player.isHuman) {
      const char = getActiveCharacter()
      if (char && char.name) charName = char.name
    } else {
      const charAssign = state.aiCharacterAssignments && state.aiCharacterAssignments[player.id]
      if (charAssign && charAssign.characterName) charName = charAssign.characterName
    }
    let wrap = avatarEl.parentElement
    if (!wrap || !wrap.classList.contains("avatar-wrap")) {
      wrap = document.createElement("div")
      wrap.className = "avatar-wrap"
      avatarEl.parentElement!.insertBefore(wrap, avatarEl)
      wrap.appendChild(avatarEl)
    }
    let nameTag = wrap.querySelector(".avatar-char-name")
    if (!nameTag) {
      nameTag = document.createElement("div")
      nameTag.className = "avatar-char-name"
      wrap.appendChild(nameTag)
    }
    nameTag.textContent = charName
    ;(nameTag as HTMLElement).style.display = charName ? "" : "none"
  })
}
