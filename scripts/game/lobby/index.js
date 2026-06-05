/**
 * @file lobby/index.js
 * @module lobby/index
 * @description 大厅主页面 Mixin。管理大厅的页面导航、子页面切换、
 *              单机/联机模式入口、玩家初始化、游戏启动、以及大厅与游戏场景的切换。
 *              是大厅的核心入口文件，协调 CarouselMixin、CharacterSelectMixin、LanIndexMixin。
 *
 * 核心职责：
 *   - bindLobbyEvents(): 绑定大厅所有按钮事件（单机/联机/设置/商店/战绩/收藏等）
 *   - 页面导航：showLobbyMain / showLobbySubPage / goToCharacterSelect
 *     支持子页面切换动画（lobby-subpage-entering）
 *   - 大厅↔游戏切换：enterLobby / exitLobby / enterLanRoom
 *     enterLobby: 清理游戏场景、重置玩家、显示大厅、暂停 Phaser 游戏循环
 *     exitLobby: 隐藏大厅、显示游戏区、唤醒 Phaser 游戏循环、播放游戏BGM
 *     enterLanRoom: 从结算页返回联机房间
 *   - 单机游戏启动：startSoloGame → applyMapProfile → exitLobby → startNewRun
 *   - 地图配置应用：applyMapProfile() 将选中地图参数写入 GAME_SETTINGS
 *   - 玩家初始化：initPlayersUI() 设置4个玩家槽位（p1~p4）、LLM开关、头像
 *   - 玩家头像：updatePlayerAvatar() 支持角色头像和文字回退
 *   - 金额显示：updateLobbyMoneyDisplay() 同步所有页面的金额显示
 *   - 场景清理：cleanupGameScene() 销毁 Phaser 图层和 tween
 *
 * 子页面结构：
 *   lobbyMain → 大厅主页（单机/联机入口）
 *   lobbySoloSetup → 单机设置（地图轮播+开始游戏）
 *   lobbyOnlinePlaceholder → 联机页面（连接/房间）
 *   lobbyCharacterSelect → 角色选择页
 *
 * 联机状态管理：
 *   isLanMode, lanIsHost, lanPlayers, lanAiPlayers, lanHostWallets,
 *   lanHostBids, lanAiLlmEnabled, lanIdToSlotId, slotIdToLanId, lanMySlotId
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
 * @exports MobaoLobby.LobbyIndexMixin - 大厅主页面 Mixin，混入 Phaser Scene
 */
(function setupMobaoLobbyIndex(global) {
  const { loadPlayerMoney } = global.MobaoSettings;

  const LobbyIndexMixin = {
    bindLobbyEvents() {
      const soloBtn = document.getElementById("lobbySoloBtn");
      const onlineBtn = document.getElementById("lobbyOnlineBtn");
      const lobbySettingsBtn = document.getElementById("lobbySettingsBtn");
      const lobbyCollectionBtn = document.getElementById("lobbyCollectionBtn");
      const lobbyBattleRecordBtn = document.getElementById("lobbyBattleRecordBtn");
      const lobbyShopBtn = document.getElementById("lobbyShopBtn");
      const lobbySoloBackBtn = document.getElementById("lobbySoloBackBtn");
      const lobbySoloShopBtn = document.getElementById("lobbySoloShopBtn");
      const lobbyOnlineBackBtn = document.getElementById("lobbyOnlineBackBtn");
      const lobbyStartGameBtn = document.getElementById("lobbyStartGameBtn");
      const carouselLeftBtn = document.getElementById("carouselLeftBtn");
      const carouselRightBtn = document.getElementById("carouselRightBtn");

      if (soloBtn) {
        soloBtn.addEventListener("click", () => this.showLobbySubPage("soloSetup"));
      }
      if (onlineBtn) {
        onlineBtn.addEventListener("click", () => this.showLobbySubPage("onlinePlaceholder"));
      }
      if (lobbySettingsBtn) {
        lobbySettingsBtn.addEventListener("click", () => this.openSettingsOverlay());
      }
      if (lobbyCollectionBtn) {
        lobbyCollectionBtn.addEventListener("click", () => this.openCollectionOverlay());
      }
      if (lobbyBattleRecordBtn) {
        lobbyBattleRecordBtn.addEventListener("click", () => this.openBattleRecordPanel());
      }
      if (lobbyShopBtn) {
        lobbyShopBtn.addEventListener("click", () => this.openShopOverlay());
      }
      if (lobbySoloBackBtn) {
        lobbySoloBackBtn.addEventListener("click", () => this.showLobbyMain());
      }
      if (lobbySoloShopBtn) {
        lobbySoloShopBtn.addEventListener("click", () => this.openShopOverlay());
      }
      if (lobbyOnlineBackBtn) {
        lobbyOnlineBackBtn.addEventListener("click", () => {
          const roomPanel = document.getElementById("lobbyOnlineRoom");
          const isInRoom = roomPanel && !roomPanel.classList.contains("hidden");
          if (isInRoom) {
            this.showGameConfirm("确定要离开房间吗？", () => {
              if (this.lanBridge) {
                this.lanBridge.leaveRoom();
                this.lanBridge.disconnect();
              }
              this.showLobbyMain();
            });
          } else {
            this.showLobbyMain();
          }
        });
      }
      if (lobbyStartGameBtn) {
        lobbyStartGameBtn.addEventListener("click", () => this.goToCharacterSelect());
      }
      if (carouselLeftBtn) {
        carouselLeftBtn.addEventListener("click", () => this.carouselScroll(-1));
      }
      if (carouselRightBtn) {
        carouselRightBtn.addEventListener("click", () => this.carouselScroll(1));
      }

      this._carouselOffset = 0;
      this.renderCarousel();
      this.initLanLobby();
    },

    showLobbyMain(skipAnimation) {
      const main = document.getElementById("lobbyMain");
      const soloSetup = document.getElementById("lobbySoloSetup");
      const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
      const characterSelect = document.getElementById("lobbyCharacterSelect");
      if (soloSetup) soloSetup.classList.add("hidden");
      if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");
      if (characterSelect) characterSelect.classList.add("hidden");
      if (main) {
        main.classList.remove("hidden");
        if (!skipAnimation) {
          main.classList.add("lobby-subpage-entering");
          main.addEventListener("animationend", function onEnter() {
            main.classList.remove("lobby-subpage-entering");
            main.removeEventListener("animationend", onEnter);
          }, { once: true });
        }
      }
      this.isLanMode = false;
      this.lanIsHost = false;
    },

    showLobbySubPage(page) {
      const main = document.getElementById("lobbyMain");
      const soloSetup = document.getElementById("lobbySoloSetup");
      const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
      const characterSelect = document.getElementById("lobbyCharacterSelect");
      if (main) main.classList.add("hidden");
      if (soloSetup) soloSetup.classList.add("hidden");
      if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");
      if (characterSelect) characterSelect.classList.add("hidden");

      function animatePageIn(el) {
        if (!el) return;
        el.classList.remove("hidden");
        el.classList.add("lobby-subpage-entering");
        el.addEventListener("animationend", function onEnter() {
          el.classList.remove("lobby-subpage-entering");
          el.removeEventListener("animationend", onEnter);
        }, { once: true });
      }

      if (page === "soloSetup") {
        animatePageIn(soloSetup);
        this.renderCarousel();
        this.renderMapDetail();
        this.updateLobbyMoneyDisplay();
      } else if (page === "onlinePlaceholder") {
        animatePageIn(onlinePlaceholder);

        const roomPanel = document.getElementById("lobbyOnlineRoom");
        const connectPanel = document.getElementById("lobbyOnlineConnect");
        const isInRoom = this.lanBridge && this.lanBridge.roomCode && roomPanel && !roomPanel.classList.contains("hidden");

        if (!isInRoom) {
          if (roomPanel) roomPanel.classList.add("hidden");
          if (connectPanel) connectPanel.classList.remove("hidden");
        }

        this.updateLobbyMoneyDisplay();
        const onlineMoney = document.getElementById("lobbyOnlineMoney");
        const onlineMoneyOuter = document.getElementById("lobbyOnlineMoneyOuter");
        [onlineMoney, onlineMoneyOuter].forEach((el) => {
          if (!el) return;
          const textEl = el.querySelector('.hud-icon') ? el.lastChild : el;
          if (textEl && textEl.nodeType === 3) textEl.textContent = ' ' + this.playerMoney.toLocaleString();
          else el.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${this.playerMoney.toLocaleString()}`;
        });
      } else if (page === "characterSelect") {
        this.showCharacterSelectPageWithMap();
      }
    },

    goToCharacterSelect() {
      this.showLobbySubPage("characterSelect");
    },

    showCharacterSelectPageWithMap() {
      let mapProfile = null;
      if (window.MobaoMapProfiles) {
        mapProfile = window.MobaoMapProfiles.getProfile(
          window.MobaoMapProfiles.getSelectedProfileId()
        );
      }
      if (this.showCharacterSelectPage) {
        this.showCharacterSelectPage(mapProfile);
      } else {
        console.warn("[Lobby] CharacterSelectMixin not loaded, falling back to start game");
        this.startSoloGame();
      }
    },

    updateLobbyMoneyDisplay() {
      const money = window.MobaoShopBridge ? window.MobaoShopBridge.getPlayerMoney() : loadPlayerMoney();
      const mainMoney = document.getElementById("lobbyMainMoney");
      const soloMoney = document.getElementById("lobbySoloMoney");
      if (mainMoney) {
        const textEl = mainMoney.querySelector('.hud-icon') ? mainMoney.lastChild : mainMoney;
        if (textEl && textEl.nodeType === 3) textEl.textContent = ' ' + money.toLocaleString();
        else mainMoney.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${money.toLocaleString()}`;
      }
      if (soloMoney) {
        const textEl = soloMoney.querySelector('.hud-icon') ? soloMoney.lastChild : soloMoney;
        if (textEl && textEl.nodeType === 3) textEl.textContent = ' ' + money.toLocaleString();
        else soloMoney.innerHTML = `<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ${money.toLocaleString()}`;
      }
    },

    cleanupGameScene() {
      this.stopRoundTimer();
      if (this.itemLayer) {
        this.itemLayer.destroy(true);
        this.itemLayer = null;
      }
      if (this.gridLayer) {
        this.gridLayer.destroy();
        this.gridLayer = null;
      }
      if (this.revealCellLayer) {
        this.revealCellLayer.destroy();
        this.revealCellLayer = null;
      }
      if (this.activeSettlementSpinner) {
        this.activeSettlementSpinner.destroy();
        this.activeSettlementSpinner = null;
      }
      this.tweens.killAll();
      this.items = [];
      this.time.removeAllEvents();
    },

    enterLobby() {
      this.cleanupGameScene();
      const lobbyPage = document.getElementById("lobbyPage");
      const gameArea = document.getElementById("gameArea");
      if (gameArea) {
        gameArea.classList.add("hidden");
      }
      if (lobbyPage) {
        lobbyPage.classList.remove("hidden");
        lobbyPage.classList.add("lobby-page-entering");
        lobbyPage.addEventListener("animationend", function onLobbyEnter() {
          lobbyPage.classList.remove("lobby-page-entering");
          lobbyPage.removeEventListener("animationend", onLobbyEnter);
        }, { once: true });
      }
      if (this.game && this.game.loop) {
        this.game.loop.sleep();
      }
      this.isLanMode = false;
      this.lanIsHost = false;
      this.lanPlayers = [];
      this.lanAiPlayers = [];
      this.lanHostWallets = {};
      this.lanHostBids = {};
      this.lanAiLlmEnabled = false;
      this.lanIdToSlotId = {};
      this.slotIdToLanId = {};
      this.lanMySlotId = null;
      this.players = [
        { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
        { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
        { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
        { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false }
      ];
      this.initPlayersUI();
      this.showLobbyMain(true);
      this.updateLobbyMoneyDisplay();
      window.MobaoAppState.patch({ appMode: "lobby", gameSource: null });
      const connectPanel = document.getElementById("lobbyOnlineConnect");
      const roomPanel = document.getElementById("lobbyOnlineRoom");
      const createPanel = document.getElementById("lobbyOnlineCreatePanel");
      const joinPanel = document.getElementById("lobbyOnlineJoinPanel");
      if (connectPanel) connectPanel.classList.remove("hidden");
      if (roomPanel) roomPanel.classList.add("hidden");
      if (createPanel) createPanel.classList.add("hidden");
      if (joinPanel) joinPanel.classList.add("hidden");
      if (typeof AudioManager !== "undefined") {
        AudioManager.stopBgm();
        AudioManager.playBgm("lobby");
      }
    },

    enterLanRoom() {
      this.cleanupGameScene();
      const lobbyPage = document.getElementById("lobbyPage");
      const gameArea = document.getElementById("gameArea");
      if (lobbyPage) lobbyPage.classList.remove("hidden");
      if (gameArea) gameArea.classList.add("hidden");
      if (this.game && this.game.loop) {
        this.game.loop.sleep();
      }
      const connectPanel = document.getElementById("lobbyOnlineConnect");
      const roomPanel = document.getElementById("lobbyOnlineRoom");
      const createPanel = document.getElementById("lobbyOnlineCreatePanel");
      const joinPanel = document.getElementById("lobbyOnlineJoinPanel");
      if (connectPanel) connectPanel.classList.add("hidden");
      if (roomPanel) roomPanel.classList.remove("hidden");
      if (createPanel) createPanel.classList.add("hidden");
      if (joinPanel) joinPanel.classList.add("hidden");
      this.exitSettlementPage();
      this.updateLobbyMoneyDisplay();
      window.MobaoAppState.patch({ appMode: "lobby", gameSource: null });
      if (typeof AudioManager !== "undefined") {
        AudioManager.stopBgm();
        AudioManager.playBgm("lobby");
      }
    },

    exitLobby() {
      this._stopLive2dLoop();
      const videoA = document.getElementById("overlayLive2dVideoA");
      const videoB = document.getElementById("overlayLive2dVideoB");
      if (videoA) {
        videoA.pause();
        videoA.src = "";
      }
      if (videoB) {
        videoB.pause();
        videoB.src = "";
      }

      const lobbyPage = document.getElementById("lobbyPage");
      const gameArea = document.getElementById("gameArea");
      if (lobbyPage) {
        lobbyPage.classList.add("hidden");
      }
      if (gameArea) {
        gameArea.classList.remove("hidden");
        gameArea.classList.add("game-area-entering");
        gameArea.addEventListener("animationend", function onFadeIn() {
          gameArea.classList.remove("game-area-entering");
          gameArea.removeEventListener("animationend", onFadeIn);
        }, { once: true });
      }

      if (window.MobaoAnimations) {
        setTimeout(function () {
          const allCards = ['p1', 'p2', 'p3', 'p4']
            .map(id => document.getElementById(`playerCard-${id}`))
            .filter(el => el && !el.classList.contains('player-card-hidden'));
          if (allCards.length > 0) {
            MobaoAnimations.staggerEnter(allCards, {
              staggerDelay: 80,
              initialDelay: 50,
              direction: 'up'
            });
          }
        }, 100);
      }

      if (this.game && this.game.loop) {
        this.game.loop.wake();
      }
      if (typeof AudioManager !== "undefined") {
        AudioManager.stopBgm();
        AudioManager.playBgm("game");
      }
    },

    startSoloGame() {
      window.MobaoAppState.patch({ appMode: "game", gameSource: "solo" });
      this.applyMapProfile();
      this.exitLobby();
      this.startNewRun();
    },

    applyMapProfile() {
      if (!window.MobaoMapProfiles) {
        return;
      }
      const profile = window.MobaoMapProfiles.getProfile(
        window.MobaoMapProfiles.getSelectedProfileId()
      );
      if (!profile || !profile.params) {
        return;
      }
      const p = profile.params;
      if (Number.isFinite(p.maxRounds)) {
        GAME_SETTINGS.maxRounds = p.maxRounds;
      }
      if (Number.isFinite(p.directTakeRatio)) {
        GAME_SETTINGS.directTakeRatio = p.directTakeRatio;
      }
      this._mapQualityWeights = p.qualityWeights || null;
      this._mapCategoryWeights = p.categoryWeights || null;
    },

    initPlayersUI() {
      const activeIds = new Set(this.players.map((p) => p.id));
      ["p1", "p2", "p3", "p4"].forEach((slotId) => {
        const cardEl = document.getElementById(`playerCard-${slotId}`);
        if (!cardEl) return;
        if (activeIds.has(slotId)) {
          cardEl.classList.remove("player-card-hidden");
        } else {
          cardEl.classList.add("player-card-hidden");
        }
      });

      const leftSide = document.getElementById("leftPlayerSide");
      const rightSide = document.getElementById("rightPlayerSide");
      const personalPanel = document.getElementById("personalPanel");
      const publicPanel = document.getElementById("publicPanel");
      if (leftSide && rightSide) {
        const playerCount = this.players.length;
        const leftSlots = playerCount <= 2 ? ["p1"] : ["p1", "p2"];
        const rightSlots = playerCount <= 1 ? [] : playerCount <= 2 ? ["p2"] : playerCount <= 3 ? ["p3"] : ["p3", "p4"];

        leftSlots.forEach((slotId) => {
          const cardEl = document.getElementById(`playerCard-${slotId}`);
          if (cardEl) leftSide.insertBefore(cardEl, personalPanel);
        });
        rightSlots.forEach((slotId) => {
          const cardEl = document.getElementById(`playerCard-${slotId}`);
          if (cardEl) rightSide.insertBefore(cardEl, publicPanel);
        });

        if (personalPanel) leftSide.appendChild(personalPanel);
        if (publicPanel) rightSide.appendChild(publicPanel);
      }

      this.players.forEach((player) => {
        const nameEl = document.getElementById(`name-${player.id}`);
        const avatarEl = document.getElementById(`avatar-${player.id}`);
        const cardEl = document.getElementById(`playerCard-${player.id}`);
        if (nameEl) {
          nameEl.textContent = player.name;
        }
        if (avatarEl) {
          this.updatePlayerAvatar(player.id, avatarEl);
        }

        if (cardEl) {
          const metaEl = cardEl.querySelector(".meta");
          if (metaEl && player.isAI) {
            const toggleId = `llm-switch-${player.id}`;
            let switchEl = document.getElementById(toggleId);
            if (!switchEl) {
              const label = document.createElement("label");
              label.className = "llm-player-switch";
              label.setAttribute("for", toggleId);
              label.title = "启用该AI位的大模型决策";

              const input = document.createElement("input");
              input.type = "checkbox";
              input.id = toggleId;
              input.checked = this.isAiLlmEnabledForPlayer(player.id);
              input.addEventListener("change", () => {
                this.aiLlmPlayerEnabled[player.id] = Boolean(input.checked);
                LLM_BRIDGE.saveAiLlmPlayerSwitches(this.aiLlmPlayerEnabled);
                this.writeLog(`${player.name} 的大模型${input.checked ? "已启用" : "已关闭"}（总开关关闭时仍不会调用）。`);
              });

              const text = document.createElement("span");
              text.textContent = "LLM";

              label.appendChild(input);
              label.appendChild(text);
              metaEl.appendChild(label);
              switchEl = input;
            }

            switchEl.checked = this.isAiLlmEnabledForPlayer(player.id);
            if (this.isLanMode) {
              switchEl.disabled = true;
              const labelEl = switchEl.closest(".llm-player-switch");
              if (labelEl) labelEl.classList.add("llm-switch-disabled");
            } else {
              switchEl.disabled = false;
              const labelEl = switchEl.closest(".llm-player-switch");
              if (labelEl) labelEl.classList.remove("llm-switch-disabled");
            }
          } else if (metaEl && !player.isAI) {
            const existingLabel = metaEl.querySelector(".llm-player-switch");
            if (existingLabel) existingLabel.remove();
          }

          let historyEl = document.getElementById(`history-${player.id}`);
          if (!historyEl) {
            const history = document.createElement("div");
            history.id = `history-${player.id}`;
            history.className = "player-history";
            historyEl = history;
          }

          if (historyEl.parentElement !== cardEl) {
            cardEl.appendChild(historyEl);
          }
        }

        this.playerHistoryPanels[player.id] = document.getElementById(`history-${player.id}`);
      });

      this.refreshPlayerHistoryUI();
      this.updatePlayerCharNames();
    },

    updatePlayerAvatar(playerId, avatarEl) {
      const player = this.players.find((p) => p.id === playerId);
      if (!player || !avatarEl) {
        return;
      }

      let avatarSrc = null;
      let fallbackText = player.avatar || "玩家";

      if (player.isHuman) {
        const char = window.CharacterSystem && window.CharacterSystem.getActiveCharacter();
        if (char && char.avatar) {
          avatarSrc = char.avatar;
          fallbackText = char.name ? char.name.charAt(0) : "你";
        }
      } else {
        const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[playerId];
        if (charAssign) {
          const charDef = window.CharacterData && window.CharacterData.getCharacterById(charAssign.characterId);
          if (charDef && charDef.avatar) {
            avatarSrc = charDef.avatar;
          }
          fallbackText = charAssign.characterName ? charAssign.characterName.charAt(0) : "AI";
        }
      }

      if (avatarSrc) {
        avatarEl.innerHTML = `<img src="${avatarSrc}" alt="${fallbackText}" class="avatar-img" onerror="this.style.display='none';this.parentElement.textContent='${fallbackText}';">`;
      } else {
        avatarEl.textContent = fallbackText;
      }
    },

    initPreviewFilterOptions() {
      const categories = [...new Set(window.ArtifactData.ARTIFACT_LIBRARY.map((item) => item.category))];
      const options = ['<option value="all">全部品类</option>']
        .concat(categories.map((category) => `<option value="${category}">${category}</option>`))
        .join("");

      this.dom.previewCategorySelect.innerHTML = options;
      this.dom.bidInput.step = "1";
      this.dom.bidInput.min = "0";
    },

    renderShopContent() {
      if (typeof window.MobaoShopPage !== "undefined") {
        window.MobaoShopPage.init({
          onPurchase: (result) => {
            if (result && result.ok) {
              this.playerMoney = result.newMoney;
              this.syncItemManagerFromShop();
              this.updateLobbyMoneyDisplay();
            }
          }
        });
        window.MobaoShopPage.updateMoneyDisplay();
        window.MobaoShopPage.renderAllItems();
        window.MobaoShopPage.renderInventory();
      }
    },

    syncItemManagerFromShop() {
      if (!window.MobaoShopBridge) return;
      const bridge = window.MobaoShopBridge;
      const inv = bridge.getFullInventory();

      // 从 localStorage 读取携带道具列表
      // undefined = 从未选择过（兼容旧流程，显示全部）
      // Set = 已选择过（可能为空，表示不携带任何道具）
      let carryIds;
      try {
        const raw = window.localStorage.getItem("mobao_carry_items_v1");
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            carryIds = new Set(parsed.filter((i) => i && i.id).map((i) => i.id));
          }
        }
      } catch (_e) { }

      this.itemManager.items.forEach((item) => {
        const storageKey = bridge.getItemStorageKey(item.id);
        const shopCount = inv[storageKey] || 0;

        if (carryIds instanceof Set) {
          // 已选择过携带道具：未携带的设为0，携带的用库存数
          item.count = carryIds.has(item.id) ? shopCount : 0;
        } else {
          // 从未选择过（兼容旧流程）：同步库存数
          item.count = shopCount;
        }
      });
    },

    openCollectionOverlay() {
      const overlay = document.getElementById("collectionOverlay");
      const panel = document.getElementById("collectionPanel");
      if (!overlay) return;

      this.initCollectionPanel();

      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayOpen(overlay, panel);
      } else {
        overlay.classList.remove("hidden");
      }

      if (!overlay._collectionBound) {
        overlay._collectionBound = true;
        const closeBtn = document.getElementById("collectionCloseBtn");
        if (closeBtn) {
          closeBtn.addEventListener("click", () => this.closeCollectionOverlay());
        }
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) this.closeCollectionOverlay();
        });
      }
    },

    closeCollectionOverlay() {
      const overlay = document.getElementById("collectionOverlay");
      const panel = document.getElementById("collectionPanel");
      if (!overlay) return;

      if (window.MobaoAnimations) {
        window.MobaoAnimations.animateOverlayClose(overlay, panel);
      } else {
        overlay.classList.add("hidden");
      }
    },

    _destroyCustomSelect(originalSelect) {
      const container = originalSelect.nextElementSibling;
      if (container && container.classList.contains('custom-select-container')) {
        container.remove();
      }
      originalSelect.removeAttribute('data-custom-select');
      originalSelect.style.display = '';
    },

    _rebuildCustomSelect(originalSelect) {
      this._destroyCustomSelect(originalSelect);
      if (window.MobileHandler && (window.MobileHandler.isMobile || window.MobileHandler.isTouch)) {
        window.MobileHandler.convertToCustomSelect(originalSelect);
      }
    },

    initCollectionPanel() {
      const categorySelect = document.getElementById("collectionCategoryFilter");
      const qualitySelect = document.getElementById("collectionQualityFilter");
      const searchInput = document.getElementById("collectionSearchInput");

      if (categorySelect) {
        const categories = this.getCollectionCategories();
        categorySelect.innerHTML = '<option value="all">全部品类</option>' +
          categories.map(c => `<option value="${c}">${c}</option>`).join('');
        if (!categorySelect._initialized) {
          categorySelect._initialized = true;
          categorySelect.addEventListener('change', () => this.renderCollectionGrid());
        }
        this._rebuildCustomSelect(categorySelect);
      }

      if (qualitySelect) {
        const qualities = Object.entries(window.ArtifactData.QUALITY_CONFIG);
        qualitySelect.innerHTML = '<option value="all">全部品质</option>' +
          qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join('');
        if (!qualitySelect._initialized) {
          qualitySelect._initialized = true;
          qualitySelect.addEventListener('change', () => this.renderCollectionGrid());
        }
        this._rebuildCustomSelect(qualitySelect);
      }

      if (searchInput && !searchInput._initialized) {
        searchInput._initialized = true;
        searchInput.addEventListener('input', () => this.renderCollectionGrid());
      }

      const sortSelect = document.getElementById("collectionSortFilter");
      if (sortSelect) {
        if (!sortSelect._initialized) {
          sortSelect._initialized = true;
          sortSelect.addEventListener('change', () => this.renderCollectionGrid());
        }
        this._rebuildCustomSelect(sortSelect);
      }

      this.renderCollectionGrid();
    },

    getCollectionCategories() {
      const artifacts = window.ArtifactData.ARTIFACT_LIBRARY || [];
      const categories = new Set();
      artifacts.forEach(a => {
        if (a.category) categories.add(a.category);
      });
      return Array.from(categories).sort();
    },

    renderCollectionGrid() {
      const grid = document.getElementById("collectionGrid");
      const stats = document.getElementById('collectionStats');
      if (!grid) return;

      const categoryFilter = document.getElementById('collectionCategoryFilter')?.value || 'all';
      const qualityFilter = document.getElementById('collectionQualityFilter')?.value || 'all';
      const searchText = document.getElementById('collectionSearchInput')?.value?.toLowerCase() || '';
      const sortValue = document.getElementById('collectionSortFilter')?.value || 'default';

      let artifacts = window.ArtifactData.ARTIFACT_LIBRARY || [];

      if (categoryFilter !== 'all') {
        artifacts = artifacts.filter(a => a.category === categoryFilter);
      }
      if (qualityFilter !== 'all') {
        artifacts = artifacts.filter(a => a.qualityKey === qualityFilter);
      }
      if (searchText) {
        artifacts = artifacts.filter(a =>
          a.name.toLowerCase().includes(searchText) ||
          a.key.toLowerCase().includes(searchText)
        );
      }

      if (sortValue !== 'default') {
        artifacts = [...artifacts].sort((a, b) => {
          switch (sortValue) {
            case 'price-asc': return (a.basePrice || 0) - (b.basePrice || 0);
            case 'price-desc': return (b.basePrice || 0) - (a.basePrice || 0);
            case 'name-asc': return (a.name || '').localeCompare(b.name || '', 'zh');
            case 'size-asc': return ((a.w || 0) * (a.h || 0)) - ((b.w || 0) * (b.h || 0));
            case 'size-desc': return ((b.w || 0) * (b.h || 0)) - ((a.w || 0) * (a.h || 0));
            default: return 0;
          }
        });
      }

      const total = (window.ArtifactData.ARTIFACT_LIBRARY || []).length;
      if (stats) {
        stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`;
      }

      const rgbHex = window.MobaoUtils.rgbHex;

      grid.innerHTML = artifacts.map(artifact => {
        const quality = window.ArtifactData.QUALITY_CONFIG[artifact.qualityKey];
        const qualityLabel = quality ? quality.label : '未知';
        const qualityColor = quality ? rgbHex(quality.color) : '#9f9f9f';
        const imgSrc = `assets/images/artifacts/thumbs/${artifact.key}.png`;

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
        `;
      }).join('');
    },

    updatePlayerCharNames() {
      this.players.forEach((player) => {
        const avatarEl = document.getElementById(`avatar-${player.id}`);
        if (!avatarEl) return;
        let charName = "";
        if (player.isHuman) {
          const char = window.CharacterSystem && window.CharacterSystem.getActiveCharacter();
          if (char && char.name) charName = char.name;
        } else {
          const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[player.id];
          if (charAssign && charAssign.characterName) charName = charAssign.characterName;
        }
        // 确保 avatar 被包在 .avatar-wrap 里
        let wrap = avatarEl.parentElement;
        if (!wrap || !wrap.classList.contains("avatar-wrap")) {
          wrap = document.createElement("div");
          wrap.className = "avatar-wrap";
          avatarEl.parentElement.insertBefore(wrap, avatarEl);
          wrap.appendChild(avatarEl);
        }
        let nameTag = wrap.querySelector(".avatar-char-name");
        if (!nameTag) {
          nameTag = document.createElement("div");
          nameTag.className = "avatar-char-name";
          wrap.appendChild(nameTag);
        }
        nameTag.textContent = charName;
        nameTag.style.display = charName ? "" : "none";
      });
    }
  };

  global.MobaoLobby = global.MobaoLobby || {};
  global.MobaoLobby.IndexMixin = LobbyIndexMixin;
})(window);
