import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file lobby/index.ts
 * @module lobby/index
 * @description 大厅主页面 Mixin。管理大厅的页面导航、子页面切换、
 *              单机/联机模式入口、玩家初始化、游戏启动、以及大厅与游戏场景的切换。
 *              是大厅的核心入口文件，协调 CarouselMixin、CharacterSelectMixin、LanIndexMixin。
 *
 * 核心职责：
 *   - bindLobbyEvents(): 绑定大厅所有按钮事件（单机/联机/设置/商店/战绩/收藏等）
 *   - 页面导航：showLobbyMain / showLobbySubPage / goToCharacterSelect
 *   - 大厅↔游戏切换：enterLobby / exitLobby / enterLanRoom
 *   - 单机游戏启动：startSoloGame → applyMapProfile → exitLobby → startNewRun
 *   - 地图配置应用：applyMapProfile() 将选中地图参数写入 GAME_SETTINGS
 *   - 玩家初始化：initPlayersUI() 设置4个玩家槽位（p1~p4）、LLM开关、头像
 *   - 玩家头像：updatePlayerAvatar() 支持角色头像和文字回退
 *   - 金额显示：updateLobbyMoneyDisplay() 同步所有页面的金额显示
 *   - 场景清理：cleanupGameScene() 销毁 Phaser 图层和 tween
 *
 * @requires MobaoSettings    - 设置（loadPlayerMoney, GAME_SETTINGS）
 * @requires MobaoAppState    - 全局状态（appMode, gameSource）
 * @requires MobaoMapProfiles - 地图配置
 * @requires MobaoShopBridge  - 商店系统
 * @requires MobaoAnimations  - 动画系统（staggerEnter）
 * @requires CharacterSystem  - 角色系统
 * @requires CharacterData    - 角色数据
 * @requires AudioManager     - 音频管理（BGM切换）
 * @requires LanBridge        - 联机通信桥
 *
 * @exports LobbyIndexMixin - 大厅主页面 Mixin，混入 Phaser Scene
 */
import { Deps } from '../core/deps.js'
import type { Player, ArtifactDef } from '../../../types/game'
import { loadPlayerMoney, GAME_SETTINGS } from "../core/settings"
import { patch as patchAppState } from "../core/app-state"
import { getProfile, getSelectedProfileId } from "../data/map-profiles"
import { MobaoShopBridge } from "../bridge/shop"
import { MobaoAnimations } from "../animations"
import { getActiveCharacter } from "../data/character-system"
import { getCharacterById } from "../data/characters"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../data/artifacts"
import { MobaoShopPage } from "../shop/index"
import { rgbHex } from "../core/utils"
import { MobileHandler } from "../../mobile/mobile-handler"
import { AudioManager } from "../../audio/audio-manager"

interface LobbySceneLike {
  showLobbySubPage(page: string): void
  openSettingsOverlay(): void
  openCollectionOverlay(): void
  openBattleRecordPanel(): void
  openShopOverlay(): void
  showLobbyMain(skipAnimation?: boolean): void
  showGameConfirm(msg: string, onConfirm: () => void): void
  goToCharacterSelect(): void
  carouselScroll(dir: number): void
  renderCarousel(): void
  renderMapDetail(): void
  initLanLobby(): void
  showCharacterSelectPageWithMap(): void
  showCharacterSelectPage(mapProfile: { name?: string; params?: Record<string, unknown> } | null): void
  startSoloGame(): void
  stopRoundTimer(): void
  initPlayersUI(): void
  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement | null): void
  isAiLlmEnabledForPlayer(playerId: string): boolean
  refreshPlayerHistoryUI(): void
  updatePlayerCharNames(): void
  exitSettlementPage(): void
  writeLog(msg: string): void
  syncItemManagerFromShop(): void
  startNewRun(): void
  _stopLive2dLoop(): void
  _carouselOffset: number
  isLanMode: boolean
  lanIsHost: boolean
  lanBridge: { roomCode: string; leaveRoom(): void; disconnect(): void; send(msg: unknown): boolean } | null
  lanPlayers: unknown[]
  lanAiPlayers: unknown[]
  lanHostWallets: Record<string, unknown>
  lanHostBids: Record<string, unknown>
  lanAiLlmEnabled: boolean
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanMySlotId: string | null
  aiLlmPlayerEnabled: Record<string, boolean>
  players: Player[]
  playerMoney: number
  playerHistoryPanels: Record<string, HTMLElement | null>
  aiCharacterAssignments: Record<string, { characterId: string; characterName?: string }> | null
  itemLayer: { destroy(): void } | null
  gridLayer: { destroy(): void } | null
  revealCellLayer: { destroy(): void } | null
  activeSettlementSpinner: { destroy(): void } | null
  items: unknown[]
  itemManager: { items: unknown[] }
  dom: Record<string, HTMLElement | null>
  tweens: { killAll(): void }
  time: { removeAllEvents(): void }
  game: { loop: { sleep(): void; wake(): void } } | null
  _mapQualityWeights: Record<string, number> | null
  _mapCategoryWeights: Record<string, number> | null
}


export { LobbyCarouselMixin as CarouselMixin } from "./carousel"
export { CharacterSelectMixin } from "./character-select"

export const LobbyIndexMixin: ThisType<WarehouseSceneThis> = {
  bindLobbyEvents() {
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
      soloBtn.addEventListener("click", () => this.showLobbySubPage("soloSetup"))
    }
    if (onlineBtn) {
      onlineBtn.addEventListener("click", () => this.showLobbySubPage("onlinePlaceholder"))
    }
    if (lobbySettingsBtn) {
      lobbySettingsBtn.addEventListener("click", () => this.openSettingsOverlay())
    }
    if (lobbyCollectionBtn) {
      lobbyCollectionBtn.addEventListener("click", () => this.openCollectionOverlay())
    }
    if (lobbyBattleRecordBtn) {
      lobbyBattleRecordBtn.addEventListener("click", () => this.openBattleRecordPanel())
    }
    if (lobbyShopBtn) {
      lobbyShopBtn.addEventListener("click", () => this.openShopOverlay())
    }
    if (lobbySoloBackBtn) {
      lobbySoloBackBtn.addEventListener("click", () => this.showLobbyMain())
    }
    if (lobbySoloShopBtn) {
      lobbySoloShopBtn.addEventListener("click", () => this.openShopOverlay())
    }
    if (lobbyOnlineBackBtn) {
      lobbyOnlineBackBtn.addEventListener("click", () => {
        const roomPanel = document.getElementById("lobbyOnlineRoom")
        const isInRoom = roomPanel && !roomPanel.classList.contains("hidden")
        if (isInRoom) {
          ; this.showGameConfirm("确定要离开房间吗？", () => {
            if (this.lanBridge) {
              ; this.lanBridge.leaveRoom()
                ; this.lanBridge.disconnect()
            }
            ; this.showLobbyMain()
          })
        } else {
          ; this.showLobbyMain()
        }
      })
    }
    if (lobbyStartGameBtn) {
      lobbyStartGameBtn.addEventListener("click", () => this.goToCharacterSelect())
    }
    if (carouselLeftBtn) {
      carouselLeftBtn.addEventListener("click", () => this.carouselScroll(-1))
    }
    if (carouselRightBtn) {
      carouselRightBtn.addEventListener("click", () => this.carouselScroll(1))
    }

    ; this._carouselOffset = 0
      ; this.renderCarousel()
      ; this.initLanLobby()
  },

  showLobbyMain(skipAnimation?: boolean) {
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
    ; this.isLanMode = false
      ; this.lanIsHost = false
  },

  showLobbySubPage(page: string) {
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
        ; this.renderCarousel()
        ; this.renderMapDetail()
      this.updateLobbyMoneyDisplay()
    } else if (page === "onlinePlaceholder") {
      animatePageIn(onlinePlaceholder)

      const roomPanel = document.getElementById("lobbyOnlineRoom")
      const connectPanel = document.getElementById("lobbyOnlineConnect")
      const isInRoom =
        this.lanBridge && this.lanBridge.roomCode && roomPanel && !roomPanel.classList.contains("hidden")

      if (!isInRoom) {
        if (roomPanel) roomPanel.classList.add("hidden")
        if (connectPanel) connectPanel.classList.remove("hidden")
      }

      this.updateLobbyMoneyDisplay()
      const onlineMoney = document.getElementById("lobbyOnlineMoney")
      const onlineMoneyOuter = document.getElementById("lobbyOnlineMoneyOuter")
        ;[onlineMoney, onlineMoneyOuter].forEach((el) => {
          if (!el) return
          const textEl = el.querySelector(".hud-icon") ? el.lastChild : el
          if (textEl && textEl.nodeType === 3) textEl.textContent = " " + this.playerMoney.toLocaleString()
          else
            el.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${this.playerMoney.toLocaleString()}`
        })
    } else if (page === "characterSelect") {
      ; this.showCharacterSelectPageWithMap()
    }
  },

  goToCharacterSelect() {
    ; this.showLobbySubPage("characterSelect")
  },

  showCharacterSelectPageWithMap() {
    let mapProfile: { name?: string; params?: Record<string, unknown> } | null = null
    if (getProfile) {
      mapProfile = getProfile(getSelectedProfileId()) as unknown as { name?: string; params?: Record<string, unknown> } | null
    }
    if (this.showCharacterSelectPage) {
      ; this.showCharacterSelectPage(mapProfile)
    } else {
      console.warn("[Lobby] CharacterSelectMixin not loaded, falling back to start game")
        ; this.startSoloGame()
    }
  },

  updateLobbyMoneyDisplay() {
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
  },

  cleanupGameScene() {
    ; this.stopRoundTimer()
    if (this.itemLayer) {
      ; this.itemLayer.destroy()
        ; this.itemLayer = null
    }
    if (this.gridLayer) {
      ; this.gridLayer.destroy()
        ; this.gridLayer = null
    }
    if (this.revealCellLayer) {
      ; this.revealCellLayer.destroy()
        ; this.revealCellLayer = null
    }
    if (this.activeSettlementSpinner) {
      ; this.activeSettlementSpinner.destroy()
        ; this.activeSettlementSpinner = null
    }
    ; (this.tweens as Phaser.Tweens.TweenManager & { killAll(): void }).killAll()
      ; this.items = []
      ; (this.time as Phaser.Time.Clock & { removeAllEvents(): void }).removeAllEvents()
  },

  enterLobby() {
    this.cleanupGameScene()
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
    if (this.game && this.game.loop) {
      ; this.game.loop.sleep()
    }
    ; this.isLanMode = false
      ; this.lanIsHost = false
      ; this.lanPlayers = []
      ; this.lanAiPlayers = []
      ; this.lanHostWallets = {}
      ; this.lanHostBids = {}
      ; this.lanAiLlmEnabled = false
      ; this.lanIdToSlotId = {}
      ; this.slotIdToLanId = {}
      ; this.lanMySlotId = null
      ; this.aiLlmPlayerEnabled = {}
      ; this.players = [
        { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
        { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
        { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
        { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
      ]
    if (Deps.LLM_BRIDGE && Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches) {
      ; this.aiLlmPlayerEnabled = Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(this.players)
    }
    ; this.initPlayersUI()
    this.showLobbyMain(true)
    this.updateLobbyMoneyDisplay()
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
  },

  enterLanRoom() {
    this.cleanupGameScene()
    const lobbyPage = document.getElementById("lobbyPage")
    const gameArea = document.getElementById("gameArea")
    if (lobbyPage) lobbyPage.classList.remove("hidden")
    if (gameArea) gameArea.classList.add("hidden")
    if (this.game && this.game.loop) {
      ; this.game.loop.sleep()
    }
    const connectPanel = document.getElementById("lobbyOnlineConnect")
    const roomPanel = document.getElementById("lobbyOnlineRoom")
    const createPanel = document.getElementById("lobbyOnlineCreatePanel")
    const joinPanel = document.getElementById("lobbyOnlineJoinPanel")
    if (connectPanel) connectPanel.classList.add("hidden")
    if (roomPanel) roomPanel.classList.remove("hidden")
    if (createPanel) createPanel.classList.add("hidden")
    if (joinPanel) joinPanel.classList.add("hidden")
      ; this.exitSettlementPage()
    this.updateLobbyMoneyDisplay()
    patchAppState({ appMode: "lobby", gameSource: null })
    if (typeof AudioManager !== "undefined") {
      AudioManager.stopBgm()
      AudioManager.playBgm("lobby")
    }
    if (this.isLanMode && this.lanIsHost && this.lanBridge) {
      const sent = this.lanBridge.send({ type: "room:return" })
      if (!sent) {
        ; this.writeLog("连接已断开，无法通知客机返回房间")
      }
    }
  },

  exitLobby() {
    ; this._stopLive2dLoop()
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

    if (this.game && this.game.loop) {
      ; this.game.loop.wake()
    }
    if (typeof AudioManager !== "undefined") {
      AudioManager.stopBgm()
      AudioManager.playBgm("game")
    }
  },

  startSoloGame() {
    patchAppState({ appMode: "game", gameSource: "solo" })
    this.applyMapProfile()
    this.exitLobby()
      ; this.startNewRun()
  },

  applyMapProfile() {
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
    ; this._mapQualityWeights = p.qualityWeights || null
      ; this._mapCategoryWeights = p.categoryWeights || null
  },

  initPlayersUI() {
    const activeIds = new Set(this.players.map((p: Player) => p.id))
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
      const playerCount = this.players.length
      const leftSlots = playerCount <= 2 ? ["p1"] : ["p1", "p2"]
      const rightSlots = playerCount <= 1 ? [] : playerCount <= 2 ? ["p2"] : playerCount <= 3 ? ["p3"] : ["p3", "p4"]

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

    ; this.players.forEach((player: Player) => {
      const nameEl = document.getElementById(`name-${player.id}`)
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      const cardEl = document.getElementById(`playerCard-${player.id}`)
      if (nameEl) {
        nameEl.textContent = player.name
      }
      if (avatarEl) {
        ; this.updatePlayerAvatar(player.id, avatarEl)
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
            input.checked = this.isAiLlmEnabledForPlayer(player.id)
            input.addEventListener("change", () => {
              ; this.aiLlmPlayerEnabled[player.id] = Boolean(input.checked)
              if (Deps.LLM_BRIDGE) {
                Deps.LLM_BRIDGE.saveAiLlmPlayerSwitches(this.aiLlmPlayerEnabled)
              }
              ; this.writeLog(
                `${player.name} 的大模型${input.checked ? "已启用" : "已关闭"}（总开关关闭时仍不会调用）。`
              )
            })

            const text = document.createElement("span")
            text.textContent = "LLM"

            label.appendChild(input)
            label.appendChild(text)
            metaEl.appendChild(label)
            switchEl = input
          }

          switchEl.checked = this.isAiLlmEnabledForPlayer(player.id)
          if (this.isLanMode) {
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

      ; this.playerHistoryPanels[player.id] = document.getElementById(`history-${player.id}`)!
    })

      ; this.refreshPlayerHistoryUI()
      ; this.updatePlayerCharNames()
  },

  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement) {
    const player = this.players.find((p: Player) => p.id === playerId)
    if (!player || !avatarEl) return

    if (player.isHuman) {
      const char = getActiveCharacter()
      if (char && (char as { avatar?: string }).avatar) {
        avatarEl.innerHTML = `<img src="${(char as { avatar?: string }).avatar}" alt="${char.name}" class="avatar-img">`
        return
      }
    }

    if (this.aiCharacterAssignments && this.aiCharacterAssignments[playerId]) {
      const assign = this.aiCharacterAssignments[playerId]
      const charData = getCharacterById(assign.characterId)
      if (charData && charData.avatar) {
        avatarEl.innerHTML = `<img src="${charData.avatar}" alt="${charData.name}" class="avatar-img">`
        return
      }
    }

    avatarEl.textContent = player.avatar || player.name.charAt(0)
  },

  isAiLlmEnabledForPlayer(playerId: string): boolean {
    return Boolean(this.aiLlmPlayerEnabled && this.aiLlmPlayerEnabled[playerId])
  },

  initPreviewFilterOptions() {
    const categories = [...new Set(ARTIFACT_LIBRARY.map((item: { category: string }) => item.category))]
    const options = ['<option value="all">全部品类</option>']
      .concat(categories.map((category: string) => `<option value="${category}">${category}</option>`))
      .join("")

      ; (this.dom.previewCategorySelect as HTMLElement).innerHTML = options
      ; (this.dom.bidInput as HTMLInputElement).step = "1"
      ; (this.dom.bidInput as HTMLInputElement).min = "0"
  },

  renderShopContent() {
    if (typeof MobaoShopPage !== "undefined") {
      MobaoShopPage.init({
        onPurchase: (result?: { ok?: boolean; message?: string; newMoney?: number }) => {
          if (result && result.ok) {
            ; this.playerMoney = result.newMoney ?? 0
              ; this.syncItemManagerFromShop()
            this.updateLobbyMoneyDisplay()
          }
        }
      })
      MobaoShopPage.updateMoneyDisplay()
      MobaoShopPage.renderAllItems()
      MobaoShopPage.renderInventory()
    }
  },

  syncItemManagerFromShop() {
    if (!MobaoShopBridge) return
    const bridge = MobaoShopBridge
    const inv = bridge.getFullInventory()

    let carryIds: Set<string> | undefined
    try {
      const raw = window.localStorage.getItem("mobao_carry_items_v1")
      if (raw !== null) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          carryIds = new Set(parsed.filter((i: { id?: string }) => i && i.id).map((i: { id: string }) => i.id))
        }
      }
    } catch (_e) { /* ignore */ }

    ; this.itemManager.items.forEach((item: { id: string; count?: number }) => {
      const storageKey = bridge.getItemStorageKey(item.id)
      const shopCount = inv[storageKey] || 0

      if (carryIds instanceof Set) {
        item.count = carryIds.has(item.id) ? shopCount : 0
      } else {
        item.count = shopCount
      }
    })
  },

  openCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay || !panel) return

    this.initCollectionPanel()

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(overlay, panel)
    } else {
      overlay.classList.remove("hidden")
    }

    const closeBtn = document.getElementById("collectionCloseBtn")
    if (closeBtn && !((closeBtn as unknown as Record<string, unknown>)._boundClose)) {
      ; (closeBtn as unknown as Record<string, unknown>)._boundClose = true
      closeBtn.addEventListener("click", () => this.closeCollectionOverlay())
    }
    if (!((overlay as unknown as Record<string, unknown>)._boundOverlayClose)) {
      ; (overlay as unknown as Record<string, unknown>)._boundOverlayClose = true
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeCollectionOverlay()
      })
    }
  },

  closeCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay) return

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(overlay, panel)
    } else {
      overlay.classList.add("hidden")
    }
  },

  _destroyCustomSelect(originalSelect: HTMLSelectElement) {
    const container = originalSelect.nextElementSibling
    if (container && container.classList.contains("custom-select-container")) {
      container.remove()
    }
    originalSelect.removeAttribute("data-custom-select")
    originalSelect.style.display = ""
  },

  _rebuildCustomSelect(originalSelect: HTMLSelectElement) {
    this._destroyCustomSelect(originalSelect)
    if (MobileHandler && (MobileHandler.isMobile || MobileHandler.isTouch)) {
      MobileHandler.convertToCustomSelect(originalSelect)
    }
  },

  initCollectionPanel() {
    const categorySelect = document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null
    const qualitySelect = document.getElementById("collectionQualityFilter") as HTMLSelectElement | null
    const searchInput = document.getElementById("collectionSearchInput") as HTMLInputElement | null

    if (categorySelect) {
      const categories = this.getCollectionCategories()
      categorySelect.innerHTML =
        '<option value="all">全部品类</option>' + categories.map((c) => `<option value="${c}">${c}</option>`).join("")
      if (!(categorySelect as unknown as Record<string, unknown>)._initialized) {
        ; (categorySelect as unknown as Record<string, unknown>)._initialized = true
        categorySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(categorySelect)
    }

    if (qualitySelect) {
      const qualities = Object.entries(QUALITY_CONFIG)
      qualitySelect.innerHTML =
        '<option value="all">全部品质</option>' +
        qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join("")
      if (!(qualitySelect as unknown as Record<string, unknown>)._initialized) {
        ; (qualitySelect as unknown as Record<string, unknown>)._initialized = true
        qualitySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(qualitySelect)
    }

    if (searchInput && !(searchInput as unknown as Record<string, unknown>)._initialized) {
      ; (searchInput as unknown as Record<string, unknown>)._initialized = true
      searchInput.addEventListener("input", () => this.renderCollectionGrid())
    }

    const sortSelect = document.getElementById("collectionSortFilter") as HTMLSelectElement | null
    if (sortSelect) {
      if (!(sortSelect as unknown as Record<string, unknown>)._initialized) {
        ; (sortSelect as unknown as Record<string, unknown>)._initialized = true
        sortSelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(sortSelect)
    }

    this.renderCollectionGrid()
  },

  getCollectionCategories(): string[] {
    const artifacts: (ArtifactDef & { key: string })[] = (ARTIFACT_LIBRARY || []) as (ArtifactDef & { key: string })[]
    const categories = new Set<string>()
    artifacts.forEach((a) => {
      if (a.category) categories.add(a.category)
    })
    return Array.from(categories).sort()
  },

  renderCollectionGrid() {
    const grid = document.getElementById("collectionGrid")
    const stats = document.getElementById("collectionStats")
    if (!grid) return

    const categoryFilter = (document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null)?.value || "all"
    const qualityFilter = (document.getElementById("collectionQualityFilter") as HTMLSelectElement | null)?.value || "all"
    const searchText = (document.getElementById("collectionSearchInput") as HTMLInputElement | null)?.value?.toLowerCase() || ""
    const sortValue = (document.getElementById("collectionSortFilter") as HTMLSelectElement | null)?.value || "default"

    let artifacts: (ArtifactDef & { key: string })[] = (ARTIFACT_LIBRARY || []) as (ArtifactDef & { key: string })[]

    if (categoryFilter !== "all") {
      artifacts = artifacts.filter((a) => a.category === categoryFilter)
    }
    if (qualityFilter !== "all") {
      artifacts = artifacts.filter((a) => a.qualityKey === qualityFilter)
    }
    if (searchText) {
      artifacts = artifacts.filter(
        (a) => a.name.toLowerCase().includes(searchText) || a.key.toLowerCase().includes(searchText)
      )
    }

    if (sortValue !== "default") {
      artifacts = [...artifacts].sort((a, b) => {
        switch (sortValue) {
          case "price-asc":
            return (a.basePrice || 0) - (b.basePrice || 0)
          case "price-desc":
            return (b.basePrice || 0) - (a.basePrice || 0)
          case "name-asc":
            return (a.name || "").localeCompare(b.name || "", "zh")
          case "size-asc":
            return (a.w || 0) * (a.h || 0) - (b.w || 0) * (b.h || 0)
          case "size-desc":
            return (b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0)
          default:
            return 0
        }
      })
    }

    const total = (ARTIFACT_LIBRARY || []).length
    if (stats) {
      stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`
    }

    const rgbHexFn = rgbHex

    grid.innerHTML = artifacts
      .map((artifact) => {
        const quality = QUALITY_CONFIG[artifact.qualityKey]
        const qualityLabel = quality ? quality.label : "未知"
        const qualityColor = quality ? rgbHex(quality.color) : "#9f9f9f"
        const imgSrc = `assets/images/artifacts/thumbs/${artifact.key}.png`

        return `
          <article class="collection-item" data-key="${artifact.key}">
            <div class="collection-thumb" style="background: ${qualityColor}44;">
              <img src="${imgSrc}" alt="${artifact.name}" onerror="this.style.display='none'"/>
            </div>
            <div class="collection-info">
              <strong class="collection-name">${artifact.name}</strong>
              <div class="collection-meta">
                <span class="collection-quality" style="color: ${qualityColor};">${qualityLabel}</span>
                <span class="collection-category">${artifact.category}</span>
              </div>
              <div class="collection-details">
                <span>基础价: ${artifact.basePrice}</span>
                <span>尺寸: ${artifact.w}x${artifact.h}</span>
              </div>
            </div>
          </article>
        `
      })
      .join("")
  },

  updatePlayerCharNames() {
    ; this.players.forEach((player: Player) => {
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      if (!avatarEl) return
      let charName = ""
      if (player.isHuman) {
        const char = getActiveCharacter()
        if (char && char.name) charName = char.name
      } else {
        const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[player.id]
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
        ; (nameTag as HTMLElement).style.display = charName ? "" : "none"
    })
  }
}
