(function setupMobaoAiIntel(global) {
  const { createEmptyAiPrivateIntelPool } = global.MobaoUtils;
  const { SKILL_DEFS } = global.SkillSystem;
  const { ITEM_DEFS } = global.ItemSystem;

  const AiIntelMixin = {
    buildSkillContext() {
      return {
        revealOutline: ({ count, category, allowCategoryFallback = false }) =>
          this.revealOutlineBatch(count, category, allowCategoryFallback),
        revealQuality: ({ count, category, allowCategoryFallback = false }) =>
          this.revealQualityBatch(count, category, allowCategoryFallback)
      };
    },

    initAiIntelSystems() {
      this.aiPrivateIntel = {};
      this.aiResourceState = {};
      this.aiRoundEffects = {};
      this.lastAiIntelActions = [];
      this.aiLlmRoundPlans = {};
      this.aiFoldState = {};
      this.highValuePriceThreshold = null;

      const aiPlayers = this.players.filter((player) => !player.isHuman);
      aiPlayers.forEach((player) => {
        this.aiPrivateIntel[player.id] = createEmptyAiPrivateIntelPool();
        this.aiResourceState[player.id] = {
          skills: Object.fromEntries(SKILL_DEFS.map((skill) => [skill.id, skill.maxPerRound])),
          items: Object.fromEntries(ITEM_DEFS.map((item) => [item.id, item.initialCount]))
        };
        this.aiFoldState[player.id] = false;
      });
    },

    resetAiRoundResources() {
      const aiPlayers = this.players.filter((player) => !player.isHuman);
      aiPlayers.forEach((player) => {
        const resourceState = this.aiResourceState[player.id];
        if (!resourceState) {
          return;
        }
        SKILL_DEFS.forEach((skill) => {
          resourceState.skills[skill.id] = skill.maxPerRound;
        });
      });
      this.aiRoundEffects = {};
      this.lastAiIntelActions = [];
      this.aiLlmRoundPlans = {};
    },

    ensureAiPrivateIntel(playerId) {
      if (this.aiPrivateIntel[playerId]) {
        return this.aiPrivateIntel[playerId];
      }

      const pool = createEmptyAiPrivateIntelPool();
      this.aiPrivateIntel[playerId] = pool;
      return pool;
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.IntelMixin = AiIntelMixin;
})(window);
