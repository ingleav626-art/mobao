(function setupMobaoUiHistory(global) {
  const { escapeHtml, formatCompactNumber } = global.MobaoUtils;
  const { GAME_SETTINGS } = global.MobaoSettings;

  const UiHistoryMixin = {
    resetPlayerHistoryState() {
      this.players.forEach((player) => {
        this.playerRoundHistory[player.id] = [];
        this.playerUsageHistory[player.id] = [];
        this.currentRoundUsage[player.id] = [];
      });
      this.refreshPlayerHistoryUI();
    },

    clearCurrentRoundUsage() {
      this.players.forEach((player) => {
        this.currentRoundUsage[player.id] = [];
      });
    },

    recordPlayerUsage(playerId, itemId) {
      if (!this.currentRoundUsage[playerId]) {
        this.currentRoundUsage[playerId] = [];
      }
      this.currentRoundUsage[playerId].push(itemId);
      this.refreshPlayerHistoryUI();
    },

    recordRoundHistory(roundBids) {
      const roundNumber = this.round;
      this.players.forEach((player) => {
        const bid = roundBids.find((entry) => entry.playerId === player.id)?.bid ?? 0;
        this.playerRoundHistory[player.id].push({ round: roundNumber, bid });
        if (this.playerRoundHistory[player.id].length > GAME_SETTINGS.maxRounds) {
          this.playerRoundHistory[player.id].shift();
        }

        const actions = [...(this.currentRoundUsage[player.id] || [])];
        this.playerUsageHistory[player.id].push({ round: roundNumber, actions });
        if (this.playerUsageHistory[player.id].length > GAME_SETTINGS.maxRounds) {
          this.playerUsageHistory[player.id].shift();
        }
      });

      this.refreshPlayerHistoryUI();
    },

    refreshPlayerHistoryUI() {
      this.players.forEach((player) => {
        const panel = this.playerHistoryPanels[player.id];
        if (!panel) {
          return;
        }

        const rounds = Array.from({ length: GAME_SETTINGS.maxRounds }, (_v, idx) => idx + 1);
        const bidByRound = new Map((this.playerRoundHistory[player.id] || []).map((entry) => [entry.round, entry.bid]));
        const usageByRound = new Map((this.playerUsageHistory[player.id] || []).map((entry) => [entry.round, entry.actions]));

        const roundHeaders = rounds.map((value) => `<td>${value}</td>`).join("");
        const itemCells = rounds
          .map((round) => `<td>${this.renderItemUsageCell(usageByRound.get(round) || [])}</td>`)
          .join("");
        const bidCells = rounds
          .map((round) => `<td>${bidByRound.has(round) ? formatCompactNumber(bidByRound.get(round)) : "-"}</td>`)
          .join("");

        panel.innerHTML = [
          '<table class="player-history-table">',
          "<tbody>",
          `<tr><th>轮次</th>${roundHeaders}</tr>`,
          `<tr><th>行动</th>${itemCells}</tr>`,
          `<tr><th>报价</th>${bidCells}</tr>`,
          "</tbody>",
          "</table>"
        ].join("");
      });
    },

    renderItemUsageCell(actions) {
      if (!actions || actions.length === 0) {
        return '<span class="history-empty">-</span>';
      }

      return actions
        .map((itemId) => {
          const info = this.getItemInfo(itemId);
          return `<span class="history-chip" data-tip="${escapeHtml(info.tip)}">${escapeHtml(info.label)}</span>`;
        })
        .join(" ");
    },

    toggleItemDrawer() {
      if (!this.dom.itemDrawer) {
        return;
      }

      if (this.dom.itemDrawer.classList.contains("hidden")) {
        this.openItemDrawer();
      } else {
        this.closeItemDrawer();
      }
    },

    openItemDrawer() {
      if (!this.dom.itemDrawer) {
        return;
      }

      const lockedIntel = this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0;
      if (lockedIntel || this.isSettingsOverlayOpen() || this.isSettlementPageActive()) {
        return;
      }

      this.closeBidKeypad();
      this.renderItemDrawer();
      this.dom.itemDrawer.classList.remove("hidden");
      if (this.dom.itemDrawerToggleBtn) {
        this.dom.itemDrawerToggleBtn.classList.add("active");
      }
    },

    closeItemDrawer() {
      if (!this.dom.itemDrawer) {
        return;
      }

      this.dom.itemDrawer.classList.add("hidden");
      if (this.dom.itemDrawerToggleBtn) {
        this.dom.itemDrawerToggleBtn.classList.remove("active");
      }
    },

    renderItemDrawer() {
      if (!this.dom.itemDrawerList) {
        return;
      }

      const canUse = !(this.settled || this.roundResolving || this.playerBidSubmitted || this.roundTimeLeft <= 0);
      const itemState = this.itemManager.getItemState().filter((item) => item.count > 0);

      if (!itemState.length) {
        this.dom.itemDrawerList.innerHTML = '<div class="item-drawer-empty">暂无可用道具</div>';
        return;
      }

      this.dom.itemDrawerList.innerHTML = itemState
        .map((item) => {
          const info = this.getItemInfo(item.id);
          const disabled = !canUse || item.count <= 0;
          return [
            `<button type="button" class="item-drawer-btn${disabled ? " is-empty" : ""}" data-item-id="${item.id}" ${disabled ? "disabled" : ""} title="${escapeHtml(info.tip)}">`,
            `<span class="item-drawer-name">${escapeHtml(info.label)}</span>`,
            `<span class="item-drawer-count">x${item.count}</span>`,
            "</button>"
          ].join("");
        })
        .join("");
    }
  };

  global.MobaoUi = global.MobaoUi || {};
  global.MobaoUi.HistoryMixin = UiHistoryMixin;
})(window);
