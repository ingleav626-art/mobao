(function setupCharacterData(global) {
  const CHARACTERS = [
    {
      id: "appraiser",
      name: "鉴定师",
      desc: "精准识宝，稳扎稳打",
      avatar: "assets/images/characters/character_design_sketch/character-appraiser-avatar.png",
      live2d: "assets/images/characters/live2D/character-appraiser-live2d.webm",
      skillId: "skill-quality-jade",
      skillName: "玉脉鉴质",
      skillDesc: "优先对玉器揭示2件品质格",
      passive: { type: "profitBonus", value: 0.10, label: "盈利加成+10%" },
      unlockCondition: "default",
      unlocked: true
    },
    {
      id: "scout",
      name: "探子",
      desc: "眼观六路，广撒大网",
      avatar: null,
      skillId: "skill-outline-scan",
      skillName: "拓影侦测",
      skillDesc: "揭示3件藏品的完整轮廓",
      passive: { type: "outlineBonus", value: 1, label: "轮廓揭示+1" },
      unlockCondition: "default",
      unlocked: true
    },
    {
      id: "seeker",
      name: "觅踪者",
      desc: "洞察秋毫，直取要害",
      avatar: "assets/images/characters/character_design_sketch/character-seeker-avatar.png",
      live2d: "assets/images/characters/live2D/character-seeker-live2d.webm",
      skillId: "skill-reveal-largest",
      skillName: "鉴踪直取",
      skillDesc: "直接随机揭示轮廓最大的1件藏品的所有信息",
      passive: { type: "outlineSmallestPriority", label: "轮廓探测优先轮廓最小" },
      unlockCondition: "default",
      unlocked: true
    }
  ];

  function getCharacterById(id) {
    return CHARACTERS.find((c) => c.id === id) || null;
  }

  function getUnlockedCharacters() {
    return CHARACTERS.filter((c) => c.unlocked);
  }

  function getSelectedCharacter() {
    try {
      const raw = window.localStorage.getItem("mobao_selected_character_v1");
      if (raw) return JSON.parse(raw);
    } catch (_e) { }
    return CHARACTERS[0];
  }

  function saveSelectedCharacter(characterId) {
    window.localStorage.setItem("mobao_selected_character_v1", JSON.stringify(characterId));
  }

  global.CharacterData = {
    CHARACTERS,
    getCharacterById,
    getUnlockedCharacters,
    getSelectedCharacter,
    saveSelectedCharacter
  };
})(window);
