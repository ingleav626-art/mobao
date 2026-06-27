/**
 * @file data/map-profiles.ts
 * @module data/map-profiles
 * @description 地图配置定义。定义不同地图/场景的参数配置，包括回合数、直接拿下比例、品质权重、品类权重等。
 *
 * 地图列表（MAP_PROFILES），4个配置：
 *   - default（废弃仓库）：均衡配置，5回合
 *   - treasure-vault（珍宝密室）：高品质多，6回合
 *   - junkyard（废品角落）：低品质多，4回合
 *   - scholar-study（书斋雅集）：书画金石为主，5回合
 *
 * @exports window.MobaoMapProfiles - 地图配置单例（兼容）
 * @exports MAP_PROFILES, getProfile, ... - 命名导出
 *
 * @requires core/app-state - 应用状态
 */

import type { MapProfile } from '../../../types/game'
import { set as setAppState, get as getAppState } from "../core/app-state"

export const MAP_PROFILES: MapProfile[] = [
  {
    id: "default",
    name: "废弃仓库",
    desc: "均衡配置，适合入门",
    icon: "\u{1F3DA}\uFE0F",  // 🏚️
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
    icon: "\u{1F48E}",  // 💎
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
    icon: "\u{1F5D1}\uFE0F",  // 🗑️
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
    icon: "\u{1F4DC}",  // 📜
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

export function getProfile(id: string): MapProfile {
  return MAP_PROFILES.find((p) => p.id === id) || MAP_PROFILES[0]
}

export function getAllProfiles(): MapProfile[] {
  return MAP_PROFILES.slice()
}

export function getSelectedProfileId(): string {
  return (getAppState("selectedMapProfile") as string) || "default"
}

export function setSelectedProfileId(id: string): void {
  const valid = MAP_PROFILES.find((p) => p.id === id)
  setAppState("selectedMapProfile", valid ? id : "default")
}