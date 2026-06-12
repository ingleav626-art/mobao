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

const { loadPlayerMoney } = window.MobaoSettings

export const LobbyIndexMixin = {
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
      soloBtn.addEventListener("click", () => (this as any).showLobbySubPage("soloSetup"))
    }
    if (onlineBtn) {
      onlineBtn.addEventListener("click", () => (this as any).showLobbySubPage("onlinePlaceholder"))
    }
    if (lobbySettingsBtn) {
      lobbySettingsBtn.addEventListener("click", () => (this as any).openSettingsOverlay())
    }
    if (lobbyCollectionBtn) {
      lobbyCollectionBtn.addEventListener("click", () => (this as any).openCollectionOverlay())
    }
    if (lobbyBattleRecordBtn) {
      lobbyBattleRecordBtn.addEventListener("click", () => (this as any).openBattleRecordPanel())
    }
    if (lobbyShopBtn) {
      lobbyShopBtn.addEventListener("click", () => (this as any).openShopOverlay())
    }
    if (lobbySoloBackBtn) {
      lobbySoloBackBtn.addEventListener("click", () => (this as any).showLobbyMain())
    }
    if (lobbySoloShopBtn) {
      lobbySoloShopBtn.addEventListener("click", () => (this as any).openShopOverlay())
    }
    if (lobbyOnlineBackBtn) {
      lobbyOnlineBackBtn.addEventListener("click", () => {
        const roomPanel = document.getElementById("lobbyOnlineRoom")
        const isInRoom = roomPanel && !roomPanel.classList.contains("hidden")
        if (isInRoom) {
          ; (this as any).showGameConfirm("确定要离开房间吗？", () => {
            if ((this as any).lanBridge) {
              ; (this as any).lanBridge.leaveRoom()
                ; (this as any).lanBridge.disconnect()
            }
            ; (this as any).showLobbyMain()
          })
        } else {
          ; (this as any).showLobbyMain()
        }
      })
    }
    if (lobbyStartGameBtn) {
      lobbyStartGameBtn.addEventListener("click", () => (this as any).goToCharacterSelect())
    }
    if (carouselLeftBtn) {
      carouselLeftBtn.addEventListener("click", () => (this as any).carouselScroll(-1))
    }
    if (carouselRightBtn) {
      carouselRightBtn.addEventListener("click", () => (this as any).carouselScroll(1))
    }

    ; (this as any)._carouselOffset = 0
      ; (this as any).renderCarousel()
      ; (this as any).initLanLobby()
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
    ; (this as any).isLanMode = false
      ; (this as any).lanIsHost = false
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
        ; (this as any).renderCarousel()
        ; (this as any).renderMapDetail()
      this.updateLobbyMoneyDisplay()
    } else if (page === "onlinePlaceholder") {
      animatePageIn(onlinePlaceholder)

      const roomPanel = document.getElementById("lobbyOnlineRoom")
      const connectPanel = document.getElementById("lobbyOnlineConnect")
      const isInRoom =
        (this as any).lanBridge && (this as any).lanBridge.roomCode && roomPanel && !roomPanel.classList.contains("hidden")

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
          if (textEl && textEl.nodeType === 3) textEl.textContent = " " + (this as any).playerMoney.toLocaleString()
          else
            el.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${(this as any).playerMoney.toLocaleString()}`
        })
    } else if (page === "characterSelect") {
      ; (this as any).showCharacterSelectPageWithMap()
    }
  },

  goToCharacterSelect() {
    ; (this as any).showLobbySubPage("characterSelect")
  },

  showCharacterSelectPageWithMap() {
    let mapProfile: { name?: string; params?: Record<string, any> } | null = null
    if (window.MobaoMapProfiles) {
      mapProfile = window.MobaoMapProfiles.getProfile(window.MobaoMapProfiles.getSelectedProfileId())
    }
    if ((this as any).showCharacterSelectPage) {
      ; (this as any).showCharacterSelectPage(mapProfile)
    } else {
      console.warn("[Lobby] CharacterSelectMixin not loaded, falling back to start game")
        ; (this as any).startSoloGame()
    }
  },

  updateLobbyMoneyDisplay() {
    const money: number = window.MobaoShopBridge ? window.MobaoShopBridge.getPlayerMoney() : loadPlayerMoney()
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
    ; (this as any).stopRoundTimer()
    if ((this as any).itemLayer) {
      ; (this as any).itemLayer.destroy(true)
        ; (this as any).itemLayer = null
    }
    if ((this as any).gridLayer) {
      ; (this as any).gridLayer.destroy()
        ; (this as any).gridLayer = null
    }
    if ((this as any).revealCellLayer) {
      ; (this as any).revealCellLayer.destroy()
        ; (this as any).revealCellLayer = null
    }
    if ((this as any).activeSettlementSpinner) {
      ; (this as any).activeSettlementSpinner.destroy()
        ; (this as any).activeSettlementSpinner = null
    }
    ; (this as any).tweens.killAll()
      ; (this as any).items = []
      ; (this as any).time.removeAllEvents()
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
    if ((this as any).game && (this as any).game.loop) {
      ; (this as any).game.loop.sleep()
    }
    ; (this as any).isLanMode = false
      ; (this as any).lanIsHost = false
      ; (this as any).lanPlayers = []
      ; (this as any).lanAiPlayers = []
      ; (this as any).lanHostWallets = {}
      ; (this as any).lanHostBids = {}
      ; (this as any).lanAiLlmEnabled = false
      ; (this as any).lanIdToSlotId = {}
      ; (this as any).slotIdToLanId = {}
      ; (this as any).lanMySlotId = null
      ; (this as any).aiLlmPlayerEnabled = {}
      ; (this as any).players = [
        { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
        { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
        { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
        { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
      ]
    if (Deps.LLM_BRIDGE && Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches) {
      ; (this as any).aiLlmPlayerEnabled = Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches((this as any).players)
    }
    ; (this as any).initPlayersUI()
    this.showLobbyMain(true)
    this.updateLobbyMoneyDisplay()
    window.MobaoAppState.patch({ appMode: "lobby", gameSource: null })
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
    if ((this as any).game && (this as any).game.loop) {
      ; (this as any).game.loop.sleep()
    }
    const connectPanel = document.getElementById("lobbyOnlineConnect")
    const roomPanel = document.getElementById("lobbyOnlineRoom")
    const createPanel = document.getElementById("lobbyOnlineCreatePanel")
    const joinPanel = document.getElementById("lobbyOnlineJoinPanel")
    if (connectPanel) connectPanel.classList.add("hidden")
    if (roomPanel) roomPanel.classList.remove("hidden")
    if (createPanel) createPanel.classList.add("hidden")
    if (joinPanel) joinPanel.classList.add("hidden")
      ; (this as any).exitSettlementPage()
    this.updateLobbyMoneyDisplay()
    window.MobaoAppState.patch({ appMode: "lobby", gameSource: null })
    if (typeof AudioManager !== "undefined") {
      AudioManager.stopBgm()
      AudioManager.playBgm("lobby")
    }
    if ((this as any).isLanMode && (this as any).lanIsHost && (this as any).lanBridge) {
      const sent = (this as any).lanBridge.send({ type: "room:return" })
      if (!sent) {
        ; (this as any).writeLog("连接已断开，无法通知客机返回房间")
      }
    }
  },

  exitLobby() {
    ; (this as any)._stopLive2dLoop()
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

    if (window.MobaoAnimations) {
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

    if ((this as any).game && (this as any).game.loop) {
      ; (this as any).game.loop.wake()
    }
    if (typeof AudioManager !== "undefined") {
      AudioManager.stopBgm()
      AudioManager.playBgm("game")
    }
  },

  startSoloGame() {
    window.MobaoAppState.patch({ appMode: "game", gameSource: "solo" })
    this.applyMapProfile()
    this.exitLobby()
      ; (this as any).startNewRun()
  },

  applyMapProfile() {
    if (!window.MobaoMapProfiles) {
      return
    }
    const profile = window.MobaoMapProfiles.getProfile(window.MobaoMapProfiles.getSelectedProfileId())
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
    ; (this as any)._mapQualityWeights = p.qualityWeights || null
      ; (this as any)._mapCategoryWeights = p.categoryWeights || null
  },

  initPlayersUI() {
    const activeIds = new Set((this as any).players.map((p: any) => p.id))
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
      const playerCount = (this as any).players.length
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

    ; (this as any).players.forEach((player: any) => {
      const nameEl = document.getElementById(`name-${player.id}`)
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      const cardEl = document.getElementById(`playerCard-${player.id}`)
      if (nameEl) {
        nameEl.textContent = player.name
      }
      if (avatarEl) {
        ; (this as any).updatePlayerAvatar(player.id, avatarEl)
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
            input.checked = (this as any).isAiLlmEnabledForPlayer(player.id)
            input.addEventListener("change", () => {
              ; (this as any).aiLlmPlayerEnabled[player.id] = Boolean(input.checked)
              Deps.LLM_BRIDGE.saveAiLlmPlayerSwitches((this as any).aiLlmPlayerEnabled)
                ; (this as any).writeLog(
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

          switchEl.checked = (this as any).isAiLlmEnabledForPlayer(player.id)
          if ((this as any).isLanMode) {
            switchEl.disabled = true
            const labelEl = switchEl.closest(".llm-player-switch")
            if (labelEl) labelEl.classList.add("llm-switch-disabled")
          } else {
            switchEl.disabled = false
            const labelEl = switchEl.closest(".llm-player-switch")
            if (labelEl) labelEl.classList.remove("llm-switch-disabled")
          }
        }
      }
    })
  },

  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement) {
    const player = (this as any).players.find((p: any) => p.id === playerId)
    if (!player) return

    if (player.isHuman) {
      const char = window.CharacterSystem && window.CharacterSystem.getActiveCharacter()
      if (char && (char as any).avatar) {
        avatarEl.innerHTML = `<img src="${(char as any).avatar}" alt="${char.name}" class="avatar-img">`
        return
      }
    }

    if ((this as any).aiCharacterAssignments && (this as any).aiCharacterAssignments[playerId]) {
      const assign = (this as any).aiCharacterAssignments[playerId]
      const charData = (window as any).CharacterData.getCharacterById(assign.characterId)
      if (charData && charData.avatar) {
        avatarEl.innerHTML = `<img src="${charData.avatar}" alt="${charData.name}" class="avatar-img">`
        return
      }
    }

    avatarEl.textContent = player.avatar || player.name.charAt(0)
  },

  isAiLlmEnabledForPlayer(playerId: string): boolean {
    return Boolean((this as any).aiLlmPlayerEnabled && (this as any).aiLlmPlayerEnabled[playerId])
  },

  openCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay || !panel) return

    overlay.classList.remove("hidden")
    this.initCollectionPanel()

    const closeBtn = document.getElementById("collectionCloseBtn")
    if (closeBtn && !(closeBtn as any)._boundClose) {
      ; (closeBtn as any)._boundClose = true
      closeBtn.addEventListener("click", () => this.closeCollectionOverlay())
    }
    if (!(overlay as any)._boundOverlayClose) {
      ; (overlay as any)._boundOverlayClose = true
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeCollectionOverlay()
      })
    }
  },

  closeCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay) return

    if (window.MobaoAnimations) {
      ; (window.MobaoAnimations as any).animateOverlayClose(overlay, panel)
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
    if (window.MobileHandler && (window.MobileHandler.isMobile || window.MobileHandler.isTouch)) {
      window.MobileHandler.convertToCustomSelect(originalSelect)
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
      if (!(categorySelect as any)._initialized) {
        ; (categorySelect as any)._initialized = true
        categorySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(categorySelect)
    }

    if (qualitySelect) {
      const qualities = Object.entries(window.ArtifactData.QUALITY_CONFIG)
      qualitySelect.innerHTML =
        '<option value="all">全部品质</option>' +
        qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join("")
      if (!(qualitySelect as any)._initialized) {
        ; (qualitySelect as any)._initialized = true
        qualitySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(qualitySelect)
    }

    if (searchInput && !(searchInput as any)._initialized) {
      ; (searchInput as any)._initialized = true
      searchInput.addEventListener("input", () => this.renderCollectionGrid())
    }

    const sortSelect = document.getElementById("collectionSortFilter") as HTMLSelectElement | null
    if (sortSelect) {
      if (!(sortSelect as any)._initialized) {
        ; (sortSelect as any)._initialized = true
        sortSelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(sortSelect)
    }

    this.renderCollectionGrid()
  },

  getCollectionCategories(): string[] {
    const artifacts = window.ArtifactData.ARTIFACT_LIBRARY || []
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

    let artifacts = window.ArtifactData.ARTIFACT_LIBRARY || []

    if (categoryFilter !== "all") {
      artifacts = artifacts.filter((a) => a.category === categoryFilter)
    }
    if (qualityFilter !== "all") {
      artifacts = artifacts.filter((a) => a.qualityKey === qualityFilter)
    }
    if (searchText) {
      artifacts = artifacts.filter(
        (a) => a.name.toLowerCase().includes(searchText) || (a as any).key.toLowerCase().includes(searchText)
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

    const total = (window.ArtifactData.ARTIFACT_LIBRARY || []).length
    if (stats) {
      stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`
    }

    const rgbHex = (window.MobaoUtils as any).rgbHex

    grid.innerHTML = artifacts
      .map((artifact) => {
        const quality = window.ArtifactData.QUALITY_CONFIG[artifact.qualityKey]
        const qualityLabel = quality ? quality.label : "未知"
        const qualityColor = quality ? rgbHex(quality.color) : "#9f9f9f"
        const imgSrc = `assets/images/artifacts/thumbs/${(artifact as any).key}.png`

        return `
          <article class="collection-item" data-key="${(artifact as any).key}">
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
    ; (this as any).players.forEach((player: any) => {
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      if (!avatarEl) return
      let charName = ""
      if (player.isHuman) {
        const char = window.CharacterSystem && window.CharacterSystem.getActiveCharacter()
        if (char && char.name) charName = char.name
      } else {
        const charAssign = (this as any).aiCharacterAssignments && (this as any).aiCharacterAssignments[player.id]
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
