window.MobaoMapProfiles = (function () {
  const MAP_PROFILES = [
    {
      id: "default",
      name: "标准仓库",
      desc: "均衡配置，适合入门",
      icon: "🏚️",
      params: {
        maxRounds: 5,
        directTakeRatio: 0.2,
        qualityWeights: {
          poor: 28,
          normal: 34,
          fine: 22,
          rare: 12,
          legendary: 4
        },
        categoryWeights: {
          "瓷器": 22,
          "玉器": 18,
          "书画": 16,
          "铜器": 17,
          "木器": 14,
          "金石": 13
        }
      }
    },
    {
      id: "treasure-vault",
      name: "珍宝密室",
      desc: "高品质藏品更多，竞争更激烈",
      icon: "💎",
      params: {
        maxRounds: 6,
        directTakeRatio: 0.25,
        qualityWeights: {
          poor: 12,
          normal: 22,
          fine: 30,
          rare: 24,
          legendary: 12
        },
        categoryWeights: {
          "瓷器": 15,
          "玉器": 25,
          "书画": 20,
          "铜器": 18,
          "木器": 10,
          "金石": 12
        }
      }
    },
    {
      id: "junkyard",
      name: "废品角落",
      desc: "低品质居多，考验捡漏眼光",
      icon: "🗑️",
      params: {
        maxRounds: 4,
        directTakeRatio: 0.15,
        qualityWeights: {
          poor: 42,
          normal: 32,
          fine: 16,
          rare: 8,
          legendary: 2
        },
        categoryWeights: {
          "瓷器": 20,
          "玉器": 12,
          "书画": 14,
          "铜器": 18,
          "木器": 22,
          "金石": 14
        }
      }
    },
    {
      id: "scholar-study",
      name: "书斋雅集",
      desc: "书画金石为主，文人之选",
      icon: "📜",
      params: {
        maxRounds: 5,
        directTakeRatio: 0.2,
        qualityWeights: {
          poor: 20,
          normal: 30,
          fine: 28,
          rare: 16,
          legendary: 6
        },
        categoryWeights: {
          "瓷器": 10,
          "玉器": 12,
          "书画": 32,
          "铜器": 14,
          "木器": 14,
          "金石": 18
        }
      }
    }
  ];

  function getProfile(id) {
    return MAP_PROFILES.find((p) => p.id === id) || MAP_PROFILES[0];
  }

  function getAllProfiles() {
    return MAP_PROFILES.slice();
  }

  function getSelectedProfileId() {
    if (window.MobaoAppState) {
      return window.MobaoAppState.get("selectedMapProfile") || "default";
    }
    return "default";
  }

  function setSelectedProfileId(id) {
    const valid = MAP_PROFILES.find((p) => p.id === id);
    if (window.MobaoAppState) {
      window.MobaoAppState.set("selectedMapProfile", valid ? id : "default");
    }
  }

  return {
    MAP_PROFILES,
    getProfile,
    getAllProfiles,
    getSelectedProfileId,
    setSelectedProfileId
  };
})();
