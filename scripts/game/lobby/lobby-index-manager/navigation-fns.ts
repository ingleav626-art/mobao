/**
 * @file lobby/lobby-index-manager/navigation-fns.ts
 * @description 大厅页面导航函数（从 LobbyIndexManager 提取）
 */
import type { LobbyIndexManagerDeps, LobbyIndexState } from "../lobby-index-manager"
import { getProfile, getSelectedProfileId } from "../../data/map-profiles"
import { updateLobbyMoneyDisplay } from "./init-fns"
import { startSoloGame } from "./cleanup-fns"

export function showLobbyMain(state: LobbyIndexState, skipAnimation?: boolean) {
  const main = document.getElementById("lobbyMain")
  const soloSetup = document.getElementById("lobbySoloSetup")
  const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder")
  const characterSelect = document.getElementById("lobbyCharacterSelect")
  if (soloSetup) soloSetup.classList.add("hidden")
  if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden")
  if (characterSelect) characterSelect.classList.add("hidden")
  if (main) {
    main.classList.remove("hidden")
    if (!skipAnimation) {
      main.classList.add("lobby-subpage-entering")
      main.addEventListener(
        "animationend",
        function onEnter() {
          main.classList.remove("lobby-subpage-entering")
          main.removeEventListener("animationend", onEnter)
        },
        { once: true }
      )
    }
  }
  state.isLanMode = false
  state.lanIsHost = false
}

export function showLobbySubPage(deps: LobbyIndexManagerDeps, state: LobbyIndexState, page: string) {
  const main = document.getElementById("lobbyMain")
  const soloSetup = document.getElementById("lobbySoloSetup")
  const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder")
  const characterSelect = document.getElementById("lobbyCharacterSelect")
  if (main) main.classList.add("hidden")
  if (soloSetup) soloSetup.classList.add("hidden")
  if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden")
  if (characterSelect) characterSelect.classList.add("hidden")

  function animatePageIn(el: HTMLElement | null) {
    if (!el) return
    el.classList.remove("hidden")
    el.classList.add("lobby-subpage-entering")
    el.addEventListener(
      "animationend",
      function onEnter() {
        el.classList.remove("lobby-subpage-entering")
        el.removeEventListener("animationend", onEnter)
      },
      { once: true }
    )
  }

  if (page === "soloSetup") {
    animatePageIn(soloSetup)
    deps.renderCarousel()
    deps.renderMapDetail()
    updateLobbyMoneyDisplay()
  } else if (page === "onlinePlaceholder") {
    animatePageIn(onlinePlaceholder)

    const roomPanel = document.getElementById("lobbyOnlineRoom")
    const connectPanel = document.getElementById("lobbyOnlineConnect")
    const isInRoom = deps.lanBridge && deps.lanBridge.roomCode && roomPanel && !roomPanel.classList.contains("hidden")

    if (!isInRoom) {
      if (roomPanel) roomPanel.classList.add("hidden")
      if (connectPanel) connectPanel.classList.remove("hidden")
    }

    updateLobbyMoneyDisplay()
    const onlineMoney = document.getElementById("lobbyOnlineMoney")
    const onlineMoneyOuter = document.getElementById("lobbyOnlineMoneyOuter")
    ;[onlineMoney, onlineMoneyOuter].forEach((el) => {
      if (!el) return
      const textEl = el.querySelector(".hud-icon") ? el.lastChild : el
      if (textEl && textEl.nodeType === 3) textEl.textContent = " " + state.playerMoney.toLocaleString()
      else
        el.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${state.playerMoney.toLocaleString()}`
    })
  } else if (page === "characterSelect") {
    showCharacterSelectPageWithMap(deps, state)
  }
}

export function goToCharacterSelect(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  showLobbySubPage(deps, state, "characterSelect")
}

export function showCharacterSelectPageWithMap(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  let mapProfile: { name?: string; params?: Record<string, unknown> } | null = null
  if (getProfile) {
    mapProfile = getProfile(getSelectedProfileId()) as unknown as {
      name?: string
      params?: Record<string, unknown>
    } | null
  }
  if (deps.showCharacterSelectPage) {
    deps.showCharacterSelectPage(mapProfile)
  } else {
    console.warn("[Lobby] CharacterSelectMixin not loaded, falling back to start game")
    startSoloGame(deps, state)
  }
}
