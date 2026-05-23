(function setupCharacterSystem(global) {
  const STORAGE_KEY = "mobao_selected_character_v1";

  let _activeCharacter = null;
  let _sessionPassiveBonus = 0;

  function getActiveCharacter() {
    if (_activeCharacter) return _activeCharacter;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const id = JSON.parse(raw);
        const pool = (global.CharacterData && global.CharacterData.CHARACTERS) || [];
        const found = pool.find((c) => c.id === id);
        if (found) { _activeCharacter = found; return found; }
      }
    } catch (_e) { }
    const fallback = (global.CharacterData && global.CharacterData.CHARACTERS) || [];
    _activeCharacter = fallback[0] || null;
    return _activeCharacter;
  }

  function getActiveCharacterId() {
    const c = getActiveCharacter();
    return c ? c.id : null;
  }

  function getActiveSkillId() {
    const c = getActiveCharacter();
    return c ? c.skillId : null;
  }

  function getActivePassive() {
    const c = getActiveCharacter();
    return c ? c.passive : null;
  }

  function getDisplayName() {
    const c = getActiveCharacter();
    return c ? c.name : "玩家";
  }

  function getDisplayAvatar() {
    const c = getActiveCharacter();
    if (c && c.avatar) return c.avatar;
    return null;
  }

  function getAvatarLabel() {
    const c = getActiveCharacter();
    if (!c) return "你";
    const nameMap = { appraiser: "鉴", scout: "探", seeker: "觅" };
    return nameMap[c.id] || c.name.charAt(0);
  }

  function selectCharacter(characterId) {
    const pool = (global.CharacterData && global.CharacterData.CHARACTERS) || [];
    const char = pool.find((c) => c.id === characterId);
    if (!char) return false;
    _activeCharacter = char;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(characterId));
    } catch (_e) { }
    return true;
  }

  function resetForNewGame() {
    _sessionPassiveBonus = 0;
  }

  function getOutlineBonus() {
    const passive = getActivePassive();
    if (!passive || passive.type !== "outlineBonus") return 0;
    return passive.value || 0;
  }

  function getQualityBonus() {
    const passive = getActivePassive();
    if (!passive || passive.type !== "qualityBonus") return 0;
    return passive.value || 0;
  }

  function getOutlineSortStrategy() {
    const passive = getActivePassive();
    if (!passive) return null;
    if (passive.type === "outlineSmallestPriority") return "smallestFirst";
    return null;
  }

  function applyPassiveEffect(context) {
    const passive = getActivePassive();
    if (!passive) return { bonus: 0, label: null };

    const profit = context.profit || 0;

    switch (passive.type) {
      case "profitBonus":
        if (profit <= 0) return { bonus: 0, label: null };
        const bonus = Math.round(profit * passive.value);
        _sessionPassiveBonus = bonus;
        return { bonus, label: passive.label };
      case "bidBonus":
        return { bonus: 0, label: passive.label };
      case "outlineBonus":
      case "qualityBonus":
      case "outlineSmallestPriority":
        return { bonus: 0, label: passive.label };
      default:
        return { bonus: 0, label: null };
    }
  }

  function getSessionPassiveBonus() {
    return _sessionPassiveBonus;
  }

  function formatProfitWithBonus(baseProfit) {
    const result = applyPassiveEffect({ profit: baseProfit });
    if (result.bonus > 0) {
      return { total: baseProfit + result.bonus, bonus: result.bonus, label: result.label };
    }
    return { total: baseProfit, bonus: 0, label: null };
  }

  global.CharacterSystem = {
    getActiveCharacter,
    getActiveCharacterId,
    getActiveSkillId,
    getActivePassive,
    getDisplayName,
    getDisplayAvatar,
    getAvatarLabel,
    selectCharacter,
    resetForNewGame,
    getOutlineBonus,
    getQualityBonus,
    getOutlineSortStrategy,
    applyPassiveEffect,
    getSessionPassiveBonus,
    formatProfitWithBonus
  };
})(window);
