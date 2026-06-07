/**
 * @file data/map-profiles.js
 * @module data/map-profiles
 * @description 地图配置定义。采用 ES Module 模式，同时挂载到 window.MobaoMapProfiles 保持兼容。
 *              定义不同地图/场景的参数配置，包括回合数、直接拿下比例、品质权重、
 *              品类权重等。每个地图配置影响仓库藏品的生成分布和游戏难度。
 *
 * 地图列表（MAP_PROFILES），4个配置：
 *   - default（废弃仓库）：均衡配置，5回合，directTake 0.2，品质正态分布
 *   - treasure-vault（珍宝密室）：高品质多，6回合，directTake 0.25，rare+legendary 权重高
 *   - junkyard（废品角落）：低品质多，4回合，directTake 0.15，poor 权重42
 *   - scholar-study（书斋雅集）：书画金石为主，5回合，书画权重32
 *
 * 地图参数结构（params）：
 *   - maxRounds: 最大回合数
 *   - directTakeRatio: 直接拿下比例阈值
 *   - qualityWeights: 品质权重 { poor, normal, fine, rare, legendary }
 *   - categoryWeights: 品类权重 { 瓷器, 玉器, 书画, 铜器, 木器, 金石 }
 *
 * @requires MobaoAppState - 读写选中的地图配置ID（selectedMapProfile）
 *
 * @exports window.MobaoMapProfiles - 地图配置单例（兼容）
 * @exports MAP_PROFILES, getProfile, ... - 命名导出
 *   关键方法：getProfile, getAllProfiles, getSelectedProfileId, setSelectedProfileId
 */
export const MAP_PROFILES = [
  {
    id: "default",
    name: "废弃仓库",
    desc: "均衡配置，适合入门",
    icon: "🏚️",
    background: "game-warehouse.png",
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
        瓷器: 22,
        玉器: 18,
        书画: 16,
        铜器: 17,
        木器: 14,
        金石: 13
      }
    }
  },
  {
    id: "treasure-vault",
    name: "珍宝密室",
    desc: "高品质藏品更多，竞争更激烈",
    icon: "💎",
    background: null,
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
        瓷器: 15,
        玉器: 25,
        书画: 20,
        铜器: 18,
        木器: 10,
        金石: 12
      }
    }
  },
  {
    id: "junkyard",
    name: "废品角落",
    desc: "低品质居多，考验捡漏眼光",
    icon: "🗑️",
    background: null,
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
        瓷器: 20,
        玉器: 12,
        书画: 14,
        铜器: 18,
        木器: 22,
        金石: 14
      }
    }
  },
  {
    id: "scholar-study",
    name: "书斋雅集",
    desc: "书画金石为主，文人之选",
    icon: "📜",
    background: null,
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
        瓷器: 10,
        玉器: 12,
        书画: 32,
        铜器: 14,
        木器: 14,
        金石: 18
      }
    }
  }
]

export function getProfile(id) {
  return MAP_PROFILES.find((p) => p.id === id) || MAP_PROFILES[0]
}

export function getAllProfiles() {
  return MAP_PROFILES.slice()
}

export function getSelectedProfileId() {
  if (window.MobaoAppState) {
    return window.MobaoAppState.get("selectedMapProfile") || "default"
  }
  return "default"
}

export function setSelectedProfileId(id) {
  const valid = MAP_PROFILES.find((p) => p.id === id)
  if (window.MobaoAppState) {
    window.MobaoAppState.set("selectedMapProfile", valid ? id : "default")
  }
}

// 兼容层：保持 window.MobaoMapProfiles 全局变量可用
window.MobaoMapProfiles = {
  MAP_PROFILES,
  getProfile,
  getAllProfiles,
  getSelectedProfileId,
  setSelectedProfileId
}