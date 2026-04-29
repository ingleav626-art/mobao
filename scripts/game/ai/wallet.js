(function setupMobaoAiWallet(global) {
  const { GAME_SETTINGS } = global.MobaoSettings;
  const { clamp, roundToStep } = global.MobaoUtils;

  const AiWalletMixin = {
    initAiWallets() {
      const aiPlayers = this.players.filter((player) => !player.isHuman);
      this.aiWallets = {};
      aiPlayers.forEach((player) => {
        const budget = Math.max(
          this.currentBid + GAME_SETTINGS.bidStep,
          Math.round(this.warehouseTrueValue * Phaser.Math.FloatBetween(0.82, 1.08))
        );
        this.aiWallets[player.id] = budget;
      });
    },

    getAiWallet(playerId) {
      const fallback = Math.max(this.currentBid + GAME_SETTINGS.bidStep, this.aiMaxBid || 0);
      const direct = Math.max(0, Math.round(Number(this.aiWallets[playerId]) || 0));
      if (direct > 0) return direct;
      if (this.isLanMode && this.slotIdToLanId[playerId]) {
        const lanId = this.slotIdToLanId[playerId];
        const lanWallet = Math.max(0, Math.round(Number(this.lanHostWallets[lanId]) || 0));
        if (lanWallet > 0) return lanWallet;
      }
      return fallback;
    },

    getAiMinimumBid(playerId, wallet = null) {
      const safeWallet = wallet === null
        ? this.getAiWallet(playerId)
        : Math.max(0, Math.round(Number(wallet) || 0));
      const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1));
      if (safeWallet <= 0) {
        return 0;
      }
      return roundToStep(step, step);
    },

    normalizeAiBidValue(playerId, bid, wallet = null) {
      const safeWallet = wallet === null ? this.getAiWallet(playerId) : Math.max(0, Math.round(Number(wallet) || 0));
      const step = Math.max(1, Math.round(Number(GAME_SETTINGS.bidStep) || 1));
      const minBid = this.getAiMinimumBid(playerId, safeWallet);
      if (safeWallet <= 0) {
        return 0;
      }
      const safe = clamp(Math.round(Number(bid) || 0), minBid, safeWallet);
      return Math.max(minBid, roundToStep(safe, step));
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.WalletMixin = AiWalletMixin;
})(window);
