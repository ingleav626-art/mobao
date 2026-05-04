(function setupMobaoBidding(global) {
  const { delay } = global.MobaoUtils;
  const { GAME_SETTINGS } = global.MobaoSettings;
  const { formatBidRevealNumber } = global.MobaoUtils;

  const BiddingMixin = {
    setPlayerBidReady(playerId, ready) {
      this.roundBidReadyState[playerId] = Boolean(ready);
      const cardEl = document.getElementById(`playerCard-${playerId}`);
      if (cardEl) {
        cardEl.classList.toggle("bid-ready", Boolean(ready));
      }
    },

    areAllPlayersBidReady() {
      return this.players.every((player) => Boolean(this.roundBidReadyState[player.id]));
    },

    async kickoffAiRoundDecisions() {
      try {
        await this.prepareAiLlmRoundPlans();
        if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed();
        await this.processAiIntelActions();
        if (this.roundPaused) {
          await this.waitUntilResumed();
        }
        this.players
          .filter((player) => !player.isHuman)
          .forEach((player) => this.setPlayerBidReady(player.id, true));
        this.updateHud();
        if (this.isLanMode && this.lanIsHost && this.lanBridge) {
          this.lanBridge.send({
            type: "lan:ai-bids-ready",
            aiPlayerIds: this.lanAiPlayers.map((ai) => ai.id),
          });
        }
      } catch (error) {
        if (error && error.message === "PAUSE_CANCELLED") return;
        const message = error && error.message ? error.message : "AI回合初始化失败";
        this.writeLog(`AI回合初始化异常：${message}`);
      } finally {
        this.aiRoundDecisionPromise = null;
      }

      if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused && this.areAllPlayersBidReady()) {
        this.resolveRoundBids("all-ready");
      }
    },

    waitUntilResumed() {
      return new Promise((resolve, reject) => {
        if (!this.roundPaused) { resolve(); return; }
        const check = () => {
          if (this.settled || this.roundResolving) { reject(new Error("PAUSE_CANCELLED")); return; }
          if (!this.roundPaused) { resolve(); return; }
          setTimeout(check, 200);
        };
        check();
      });
    },

    openBidKeypad() {
      if (this.settled || this.roundResolving || this.playerBidSubmitted) {
        return;
      }

      this.closeItemDrawer();
      this.hideInfoPopup();
      this.keypadValue = String(Math.max(0, Math.round(Number(this.dom.bidInput.value) || 0)));
      this.syncBidKeypadScreen();
      this.updateKeypadDirectHint();
      this.dom.bidKeypad.classList.remove("hidden");
      if (this.input) {
        this.input.enabled = false;
      }
    },

    closeBidKeypad() {
      this.dom.bidKeypad.classList.add("hidden");
      if (this.input) {
        this.input.enabled = true;
      }
    },

    syncBidKeypadScreen() {
      this.dom.keypadScreen.textContent = this.keypadValue;
      this.updateKeypadDirectHint();
    },

    updateKeypadDirectHint() {
      if (!this.dom.keypadDirectHint) return;
      if (this.round >= GAME_SETTINGS.maxRounds || this.settled) {
        this.dom.keypadDirectHint.classList.add("hidden");
        return;
      }
      const myBid = Math.max(0, Math.round(Number(this.keypadValue) || 0));
      const secondBid = this.secondHighestBid || 0;
      const ratio = GAME_SETTINGS.directTakeRatio;
      const requiredBid = secondBid > 0 ? Math.ceil(secondBid * (1 + ratio)) : 0;
      if (myBid > 0 && requiredBid > 0 && myBid >= requiredBid) {
        this.dom.keypadDirectHint.textContent = "可直接拿下";
        this.dom.keypadDirectHint.classList.remove("hidden");
      } else if (requiredBid > 0) {
        const displayRatio = (1 + ratio).toFixed(1);
        this.dom.keypadDirectHint.textContent = `达第2名${displayRatio}倍可拿下`;
        this.dom.keypadDirectHint.classList.remove("hidden");
      } else {
        this.dom.keypadDirectHint.classList.add("hidden");
      }
    },

    handleBidKeyInput(key) {
      if (key === "clear") {
        this.keypadValue = "0";
        this.syncBidKeypadScreen();
        return;
      }

      if (key === "del") {
        this.keypadValue = this.keypadValue.length <= 1 ? "0" : this.keypadValue.slice(0, -1);
        this.syncBidKeypadScreen();
        return;
      }

      if (key === "ok") {
        const bid = Math.max(0, Math.round(Number(this.keypadValue) || 0));
        this.dom.bidInput.value = String(bid);
        this.closeBidKeypad();
        this.showGameConfirm(`确认出价 ${bid.toLocaleString()} ？`, () => this.playerBid());
        return;
      }

      const next = this.keypadValue === "0" ? key : this.keypadValue + key;
      this.keypadValue = String(Math.min(99999999, Number(next) || 0));
      this.syncBidKeypadScreen();
    },

    showGameConfirm(message, onConfirm) {
      this.dom.gameConfirmMsg.textContent = message;
      this._gameConfirmCallback = onConfirm || null;
      this.dom.gameConfirmOverlay.classList.remove("hidden");
    },

    hideGameConfirm() {
      this.dom.gameConfirmOverlay.classList.add("hidden");
      this._gameConfirmCallback = null;
    },

    async resolveRoundBids(reason = "manual", forceSettle = false) {
      if (this.settled || this.roundResolving) {
        return;
      }

      if (this.isLanMode && this.lanBridge) {
        return;
      }

      this.roundResolving = true;
      this.stopRoundTimer();

      if (window.AudioUI) {
        AudioUI.stopCountdown();
      }

      try {
        if (!this.playerBidSubmitted) {
          this.playerRoundBid = 0;
          this.writeLog(reason === "timeout" ? "回合超时：玩家本轮出价记为 0。" : "玩家未提交出价，本轮按 0 处理。");
          const myId = this.isLanMode ? this.lanMySlotId : "p2";
          this.setPlayerBidReady(myId, true);
        }

        if (this.aiRoundDecisionPromise) {
          await this.aiRoundDecisionPromise;
        }
        this.updateHud();

        const roundBids = this.buildRoundBids();
        this.captureAiDecisionTelemetry(roundBids);
        this.recordAiThoughtLogs(this.lastAiDecisionTelemetry);
        this.renderAiLogicPanel();
        await this.revealRoundBidsSequential(roundBids);
        this.recordRoundHistory(roundBids);

        const sorted = [...roundBids].sort((a, b) => b.bid - a.bid);
        const first = sorted[0];
        const second = sorted[1] || { bid: 0 };
        this.markRoundRanking(sorted);

        this.currentBid = first.bid;
        this.bidLeader = first.playerId;
        this.secondHighestBid = second.bid;

        const shouldDirectTake =
          this.round < GAME_SETTINGS.maxRounds &&
          first.bid > 0 &&
          first.bid >= Math.ceil(second.bid * (1 + GAME_SETTINGS.directTakeRatio));

        if (this.round === GAME_SETTINGS.maxRounds || shouldDirectTake || forceSettle) {
          const mode = forceSettle ? "manual" : (this.round === GAME_SETTINGS.maxRounds ? "final" : "direct");
          await this.finishAuction(first, mode);
          return;
        }

        await delay(GAME_SETTINGS.postRevealWaitMs);
        this.round += 1;
        this.skillManager.onNewRound();
        this.startRound();
        this.updateHud();
        this.writeLog(`进入第 ${this.round} 回合。`);
      } catch (error) {
        const message = error && error.message ? error.message : "未知异常";
        this.roundResolving = false;
        this.writeLog(`回合结算异常：${message}`);
        this.updateHud();
        if (typeof console !== "undefined" && console.error) {
          console.error("resolveRoundBids failed", error);
        }
      }
    },

    buildRoundBids() {
      const clueRate = this.items.length === 0
        ? 0
        : this.items.filter((item) => this.hasAnyInfo(item)).length / this.items.length;
      const lastRoundBids = this.getLastRoundBidMap();
      const aiIntelMap = this.buildAiIntelSnapshot();

      const aiPlayers = this.players.filter((player) => !player.isHuman);
      const aiBidMap = this.aiEngine.buildAIBids({
        aiPlayers,
        clueRate,
        round: this.round,
        maxRounds: GAME_SETTINGS.maxRounds,
        currentBid: this.currentBid,
        lastRoundBids,
        bidStep: GAME_SETTINGS.bidStep,
        aiIntelMap,
        aiToolEffectMap: this.aiRoundEffects,
        itemCount: this.items.length
      });

      aiPlayers.forEach((player) => {
        const plan = this.aiLlmRoundPlans[player.id];
        if (!plan || plan.failed || !plan.hasBidDecision || !this.canUseLlmDecisionForPlayer(player.id)) {
          return;
        }

        const wallet = this.getAiWallet(player.id);
        aiBidMap[player.id] = this.normalizeAiBidValue(player.id, plan.bid, wallet);
      });

      return this.players.map((player) => {
        if (player.isSelf) {
          return { playerId: player.id, bid: this.playerRoundBid };
        }

        if (player.isHuman) {
          const existingBid = this.lanHostBids[player.lanId];
          return { playerId: player.id, bid: existingBid !== undefined ? existingBid : 0 };
        }

        const wallet = this.getAiWallet(player.id);
        const aiBid = this.normalizeAiBidValue(player.id, aiBidMap[player.id] ?? 0, wallet);
        return { playerId: player.id, bid: aiBid };
      });
    },

    getLastRoundBidMap() {
      const map = {};
      this.players.forEach((player) => {
        const history = this.playerRoundHistory[player.id] || [];
        const last = history.length > 0 ? history[history.length - 1] : null;
        if (last) {
          map[player.id] = last.bid;
        }
      });
      return map;
    },

    async revealRoundBidsSequential(roundBids) {
      for (let i = 0; i < this.players.length; i += 1) {
        const player = this.players[i];
        const bidInfo = roundBids.find((entry) => entry.playerId === player.id);
        this.setPlayerBidDisplay(player.id, bidInfo.bid, i + 1);
        this.writeLog(`${player.name} 本轮出价：${bidInfo.bid}`);
        if (window.AudioUI) {
          AudioUI.playReveal();
        }
        await delay(GAME_SETTINGS.bidRevealIntervalMs);
      }
    },

    setPlayerBidDisplay(playerId, bid, order) {
      const bidEl = document.getElementById(`bid-${playerId}`);
      const cardEl = document.getElementById(`playerCard-${playerId}`);
      if (bidEl) {
        bidEl.textContent = `${formatBidRevealNumber(bid)} #${order}`;
        bidEl.classList.remove("bid-reveal");
        void bidEl.offsetWidth;
        bidEl.classList.add("bid-reveal");
        window.setTimeout(() => bidEl.classList.remove("bid-reveal"), 480);
      }
      if (cardEl) {
        cardEl.classList.add("revealed");
        cardEl.classList.remove("bid-pop");
        void cardEl.offsetWidth;
        cardEl.classList.add("bid-pop");
        window.setTimeout(() => cardEl.classList.remove("bid-pop"), 520);
      }
    },

    playerBid() {
      this.closeItemDrawer();

      if (this.settled) {
        this.writeLog("本局已结算，请重新开局。");
        return;
      }

      if (this.roundResolving) {
        this.writeLog("本轮正在结算中，请等待出价揭示。");
        return;
      }

      if (this.roundPaused) {
        this.writeLog("当前回合已暂停，请先继续回合再提交出价。");
        return;
      }

      if (this.playerBidSubmitted) {
        this.writeLog("你已提交本轮出价，不可再次提交。");
        return;
      }

      const inputValue = Number(this.dom.bidInput.value);
      if (!Number.isFinite(inputValue) || inputValue < 0) {
        this.writeLog("请输入有效出价金额（允许 0）。");
        return;
      }

      if (inputValue > this.playerMoney) {
        this.writeLog("资金不足，无法按该金额出价。");
        return;
      }

      this.playerRoundBid = Math.round(inputValue);
      this.playerBidSubmitted = true;
      const myId = this.isLanMode ? this.lanMySlotId : "p2";
      this.setPlayerBidReady(myId, true);
      this.closeBidKeypad();
      this.writeLog(`玩家已提交本轮密封出价：${this.playerRoundBid}。提交后不可再用道具/技能。`);
      this.updateHud();

      if (this.isLanMode && this.lanBridge) {
        this.lanBridge.submitBid(this.playerRoundBid);
        return;
      }

      if (!this.roundResolving && this.areAllPlayersBidReady()) {
        this.resolveRoundBids("all-ready");
      }
    },

    settleCurrentRun() {
      if (this.isLanMode && !this.lanIsHost) return;
      if (this.settled) {
        this.writeLog("本局已结算，请重新开局。");
        return;
      }

      this.resolveRoundBids("manual", true);
    },

    showSettleOverlay(html) {
      this.dom.settleCard.innerHTML = html;
      this.dom.settleOverlay.classList.remove("hidden");

      this.tweens.add({
        targets: this.dom.settleCard,
        scaleX: { from: 0.94, to: 1 },
        scaleY: { from: 0.94, to: 1 },
        alpha: { from: 0.5, to: 1 },
        duration: 260,
        ease: "Back.Out"
      });
    }
  };

  global.MobaoBidding = global.MobaoBidding || {};
  global.MobaoBidding.BiddingMixin = BiddingMixin;
})(window);
