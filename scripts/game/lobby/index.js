(function setupMobaoLobbyIndex(global) {
  const { loadPlayerMoney } = global.MobaoSettings;

  const LobbyIndexMixin = {
    bindLobbyEvents() {
      const soloBtn = document.getElementById("lobbySoloBtn");
      const onlineBtn = document.getElementById("lobbyOnlineBtn");
      const lobbySettingsBtn = document.getElementById("lobbySettingsBtn");
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
        lobbyOnlineBackBtn.addEventListener("click", () => this.showLobbyMain());
      }
      if (lobbyStartGameBtn) {
        lobbyStartGameBtn.addEventListener("click", () => this.startSoloGame());
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

    showLobbyMain() {
      const main = document.getElementById("lobbyMain");
      const soloSetup = document.getElementById("lobbySoloSetup");
      const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
      if (main) main.classList.remove("hidden");
      if (soloSetup) soloSetup.classList.add("hidden");
      if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");
      this.isLanMode = false;
      this.lanIsHost = false;
    },

    showLobbySubPage(page) {
      const main = document.getElementById("lobbyMain");
      const soloSetup = document.getElementById("lobbySoloSetup");
      const onlinePlaceholder = document.getElementById("lobbyOnlinePlaceholder");
      if (main) main.classList.add("hidden");
      if (soloSetup) soloSetup.classList.add("hidden");
      if (onlinePlaceholder) onlinePlaceholder.classList.add("hidden");

      if (page === "soloSetup") {
        if (soloSetup) soloSetup.classList.remove("hidden");
        this.renderCarousel();
        this.renderMapDetail();
        this.updateLobbyMoneyDisplay();
      } else if (page === "onlinePlaceholder") {
        if (onlinePlaceholder) onlinePlaceholder.classList.remove("hidden");
        this.updateLobbyMoneyDisplay();
        const onlineMoney = document.getElementById("lobbyOnlineMoney");
        if (onlineMoney) onlineMoney.textContent = "资金：" + this.playerMoney.toLocaleString();
      }
    },

    updateLobbyMoneyDisplay() {
      const money = window.MobaoShopBridge ? window.MobaoShopBridge.getPlayerMoney() : loadPlayerMoney();
      const mainMoney = document.getElementById("lobbyMainMoney");
      const soloMoney = document.getElementById("lobbySoloMoney");
      const text = "资金：" + money.toLocaleString();
      if (mainMoney) mainMoney.textContent = text;
      if (soloMoney) soloMoney.textContent = text;
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
      if (this.areaTitleText) {
        this.areaTitleText.destroy();
        this.areaTitleText = null;
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
      if (lobbyPage) {
        lobbyPage.classList.remove("hidden");
      }
      if (gameArea) {
        gameArea.classList.add("hidden");
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
      this.showLobbyMain();
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
    },

    exitLobby() {
      const lobbyPage = document.getElementById("lobbyPage");
      const gameArea = document.getElementById("gameArea");
      if (lobbyPage) {
        lobbyPage.classList.add("hidden");
      }
      if (gameArea) {
        gameArea.classList.remove("hidden");
      }
      if (this.game && this.game.loop) {
        this.game.loop.wake();
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
          avatarEl.textContent = player.avatar;
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
      const listEl = document.getElementById("shopList");
      const invEl = document.getElementById("shopInventory");
      const moneyEl = document.getElementById("shopMoneyDisplay");
      if (!listEl || !window.MobaoShopBridge) return;

      const money = window.MobaoShopBridge.getPlayerMoney();
      if (moneyEl) moneyEl.textContent = "资金：" + money.toLocaleString();

      const items = window.MobaoShopBridge.SHOP_ITEMS;
      listEl.innerHTML = items.map((si) => {
        const remaining = window.MobaoShopBridge.getRemainingDaily(si.id);
        const owned = window.MobaoShopBridge.getItemCount(si.id);
        const canBuy = remaining > 0 && money >= si.price;
        return [
          '<div class="shop-item">',
          '<span class="shop-item-icon">' + si.icon + '</span>',
          '<div class="shop-item-info">',
          '<span class="shop-item-name">' + si.name + '</span>',
          '<span class="shop-item-desc">' + si.description + '</span>',
          '<span class="shop-item-daily">今日剩余 ' + remaining + '/' + si.maxDaily + ' | 持有 ' + owned + '</span>',
          '</div>',
          '<button class="shop-item-buy" data-shop-item-id="' + si.id + '"' + (canBuy ? '' : ' disabled') + ' type="button">' + si.price.toLocaleString() + '</button>',
          '</div>'
        ].join("");
      }).join("");

      listEl.querySelectorAll(".shop-item-buy").forEach((btn) => {
        btn.addEventListener("click", () => {
          const itemId = btn.getAttribute("data-shop-item-id");
          const result = window.MobaoShopBridge.purchaseItem(itemId);
          if (result.ok) {
            this.playerMoney = result.newMoney;
            this.syncItemManagerFromShop();
            this.renderShopContent();
            this.updateLobbyMoneyDisplay();
          } else {
            alert(result.message);
          }
        });
      });

      if (invEl) {
        const inv = window.MobaoShopBridge.getFullInventory();
        invEl.innerHTML = [
          '<div class="shop-inventory-title">当前库存</div>',
          '<div class="shop-inventory-row"><span>探照灯</span><span>x' + inv.outlineLamp + '</span></div>',
          '<div class="shop-inventory-row"><span>鉴定针</span><span>x' + inv.qualityNeedle + '</span></div>'
        ].join("");
      }
    },

    syncItemManagerFromShop() {
      if (!window.MobaoShopBridge) return;
      const inv = window.MobaoShopBridge.getFullInventory();
      this.itemManager.items.forEach((item) => {
        if (item.id === "item-outline-lamp") {
          item.count = inv.outlineLamp;
        } else if (item.id === "item-quality-needle") {
          item.count = inv.qualityNeedle;
        }
      });
    }
  };

  global.MobaoLobby = global.MobaoLobby || {};
  global.MobaoLobby.IndexMixin = LobbyIndexMixin;
})(window);
