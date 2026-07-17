/**
 * @file lobby/lobby-index-manager/cleanup-fns.ts
 * @description 大厅清理/入口切换函数（从 LobbyIndexManager 提取）
 */
import type { LobbyIndexManagerDeps, LobbyIndexState } from "../lobby-index-manager"
import { Deps } from "../../core/deps"
import { patch as patchAppState } from "../../core/app-state"
import { AudioManager } from "../../../audio/audio-manager"
import { MobaoAnimations } from "../../animations"
import { initPlayersUI, updateLobbyMoneyDisplay, applyMapProfile } from "./init-fns"
import { showLobbyMain } from "./navigation-fns"
import { createLogger } from "../../core/logger"

const log = createLogger("LAN")

export function cleanupGameScene(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  deps.stopRoundTimer()
  if (state.itemLayer) {
    state.itemLayer.destroy()
    state.itemLayer = null
  }
  if (state.gridLayer) {
    state.gridLayer.destroy()
    state.gridLayer = null
  }
  if (state.revealCellLayer) {
    state.revealCellLayer.destroy()
    state.revealCellLayer = null
  }
  if (state.activeSettlementSpinner) {
    state.activeSettlementSpinner.destroy()
    state.activeSettlementSpinner = null
  }
  deps.getTweens().killAll()
  state.items = []
  deps.getTime().removeAllEvents()
}

export function enterLobby(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  cleanupGameScene(deps, state)
  const lobbyPage = document.getElementById("lobbyPage")
  const gameArea = document.getElementById("gameArea")
  if (gameArea) {
    gameArea.classList.add("hidden")
  }
  if (lobbyPage) {
    lobbyPage.classList.remove("hidden")
    lobbyPage.classList.add("lobby-page-entering")
    lobbyPage.addEventListener(
      "animationend",
      function onLobbyEnter() {
        lobbyPage.classList.remove("lobby-page-entering")
        lobbyPage.removeEventListener("animationend", onLobbyEnter)
      },
      { once: true }
    )
  }
  if (deps.game && deps.game.loop) {
    deps.game.loop.sleep()
  }
  deps.getState().resetLanState()
  log.info("enterLobby: LAN state reset via resetLanState")
  state.players = [
    { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
    { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
    { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
    { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
  ]
  if (Deps.LLM_BRIDGE && Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches) {
    state.aiLlmPlayerEnabled = Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(state.players)
  }
  initPlayersUI(deps, state)
  showLobbyMain(deps, state, true)
  updateLobbyMoneyDisplay()
  patchAppState({ appMode: "lobby", gameSource: null })
  const connectPanel = document.getElementById("lobbyOnlineConnect")
  const roomPanel = document.getElementById("lobbyOnlineRoom")
  const createPanel = document.getElementById("lobbyOnlineCreatePanel")
  const joinPanel = document.getElementById("lobbyOnlineJoinPanel")
  if (connectPanel) connectPanel.classList.remove("hidden")
  if (roomPanel) roomPanel.classList.add("hidden")
  if (createPanel) createPanel.classList.add("hidden")
  if (joinPanel) joinPanel.classList.add("hidden")
  if (typeof AudioManager !== "undefined") {
    AudioManager.stopBgm()
    AudioManager.playBgm("lobby")
  }
}

export function enterLanRoom(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  log.debug("[fn-file] enterLanRoom CALLED, isLanMode={0}, lanIsHost={1}", state.isLanMode, state.lanIsHost)
  cleanupGameScene(deps, state)
  state.players = [
    { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
    { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
    { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
    { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
  ]
  log.debug("enterLanRoom: players reset, count=" + state.players.length)
  log.info("enterLanRoom: isLanMode=" + state.isLanMode + " | lanIsHost=" + state.lanIsHost)
  deps.getState().resetLanGameState()
  log.info("enterLanRoom: LAN game state reset via resetLanGameState (preserved bridge/players/roomCode)")
  const lobbyPage = document.getElementById("lobbyPage")
  const gameArea = document.getElementById("gameArea")
  if (lobbyPage) lobbyPage.classList.remove("hidden")
  if (gameArea) gameArea.classList.add("hidden")
  if (deps.game && deps.game.loop) {
    deps.game.loop.sleep()
  }
  const connectPanel = document.getElementById("lobbyOnlineConnect")
  const roomPanel = document.getElementById("lobbyOnlineRoom")
  const createPanel = document.getElementById("lobbyOnlineCreatePanel")
  const joinPanel = document.getElementById("lobbyOnlineJoinPanel")
  if (connectPanel) connectPanel.classList.add("hidden")
  if (roomPanel) roomPanel.classList.remove("hidden")
  if (createPanel) createPanel.classList.add("hidden")
  if (joinPanel) joinPanel.classList.add("hidden")
  deps.exitSettlementPage()
  updateLobbyMoneyDisplay()
  patchAppState({ appMode: "lobby", gameSource: null })
  if (typeof AudioManager !== "undefined") {
    AudioManager.stopBgm()
    AudioManager.playBgm("lobby")
  }
  if (state.isLanMode && state.lanIsHost && deps.lanBridge) {
    log.debug("[fn-file] enterLanRoom sending room:return to notify clients")
    const sent = deps.lanBridge.send({ type: "room:return" })
    if (!sent) {
      deps.writeLog("连接已断开，无法通知客机返回房间")
    }
  }
}

export function exitLobby(deps: LobbyIndexManagerDeps) {
  deps.stopLive2dLoop()
  const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement | null
  const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement | null
  if (videoA) {
    videoA.pause()
    videoA.src = ""
  }
  if (videoB) {
    videoB.pause()
    videoB.src = ""
  }

  const lobbyPage = document.getElementById("lobbyPage")
  const gameArea = document.getElementById("gameArea")
  if (lobbyPage) {
    lobbyPage.classList.add("hidden")
  }
  if (gameArea) {
    gameArea.classList.remove("hidden")
    gameArea.classList.add("game-area-entering")
    gameArea.addEventListener(
      "animationend",
      function onFadeIn() {
        gameArea.classList.remove("game-area-entering")
        gameArea.removeEventListener("animationend", onFadeIn)
      },
      { once: true }
    )
  }

  if (MobaoAnimations) {
    setTimeout(function () {
      const allCards = ["p1", "p2", "p3", "p4"]
        .map((id) => document.getElementById(`playerCard-${id}`))
        .filter((el): el is HTMLElement => el !== null && !el.classList.contains("player-card-hidden"))
      if (allCards.length > 0) {
        MobaoAnimations.staggerEnter(allCards, {
          staggerDelay: 80,
          initialDelay: 50,
          direction: "up"
        })
      }
    }, 100)
  }

  if (deps.game && deps.game.loop) {
    deps.game.loop.wake()
  }
  if (typeof AudioManager !== "undefined") {
    AudioManager.stopBgm()
    AudioManager.playBgm("game")
  }
}

export function startSoloGame(deps: LobbyIndexManagerDeps, state: LobbyIndexState) {
  patchAppState({ appMode: "game", gameSource: "solo" })
  applyMapProfile(state)
  exitLobby(deps)
  deps.startNewRun()
}
