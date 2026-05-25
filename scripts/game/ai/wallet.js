(function setupMobaoAiWallet(global) {
  const { GAME_SETTINGS } = global.MobaoSettings;
  const { clamp, roundToStep } = global.MobaoUtils;

  const AI_WALLET_INITIAL = 1000000;
  const AI_WALLET_STORAGE_KEY = "mobao_ai_wallets_v1";

  const AiWalletMixin = {
    loadAiWalletsFromStorage() {
      try {
        const raw = localStorage.getItem(AI_WALLET_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            return parsed;
          }
        }
      } catch (e) {
        console.warn("[loadAiWalletsFromStorage] failed:", e);
      }
      return {};
    },

    saveAiWalletsToStorage() {
      try {
        localStorage.setItem(AI_WALLET_STORAGE_KEY, JSON.stringify(this.aiWallets || {}));
      } catch (e) {
        console.warn("[saveAiWalletsToStorage] failed:", e);
      }
    },

    resetAiWallets() {
      this.aiWallets = {};
      const aiPlayers = this.players.filter((player) => !player.isHuman);
      aiPlayers.forEach((player) => {
        this.aiWallets[player.id] = AI_WALLET_INITIAL;
      });
      this.saveAiWalletsToStorage();
      console.log("[resetAiWallets] AI wallets reset to", AI_WALLET_INITIAL);
    },

    initAiWallets() {
      const aiPlayers = this.players.filter((player) => !player.isHuman);
      const stored = this.loadAiWalletsFromStorage();
      this.aiWallets = {};
      aiPlayers.forEach((player) => {
        if (stored[player.id] && Number.isFinite(Number(stored[player.id])) && Number(stored[player.id]) > 0) {
          this.aiWallets[player.id] = Math.round(Number(stored[player.id]));
        } else {
          this.aiWallets[player.id] = AI_WALLET_INITIAL;
        }
      });
      console.log("[initAiWallets] AI wallets loaded:", this.aiWallets);
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
  global.MobaoAi.AI_WALLET_INITIAL = AI_WALLET_INITIAL;
})(window);
