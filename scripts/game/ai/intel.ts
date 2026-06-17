import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import type { Artifact, RevealResult, Player } from '../../../types/game'
import type { AiItemKnowledge, AiIntelSignal, AiSignalStats, IntelAggregate, IntelSummary, ActionDef, IntelActionPlan, HighValueTrack } from '../../../types/ai'
import type { LlmPlan, LlmPlanResult } from '../../../types/llm'

/**
 * @file game/ai/intel.js
 * @module game/ai/intel
 * @description AI情报系统 Mixin。管理AI玩家的私有情报池，包括线索揭示、品质鉴定、
 *              信号统计、高价值追踪和资源管理。是AI"看到什么"的核心模块。
 *
 * 核心职责：
 *   - initAiIntelSystems: 初始化AI私有情报池、角色分配、资源状态
 *   - getAiIntelSummary: 计算AI的情报摘要（线索率、质量率、不确定性、价格边缘等）
 *   - revealPrivateIntelBatch / revealPrivateIntelFully: 为AI揭示藏品信息（轮廓/品质/完全揭示）
 *   - buildAiPrivateRevealContext: 构建LLM可调用的揭示上下文（revealOutline/revealQuality/revealAll）
 *   - buildSkillContext: 构建规则AI可调用的揭示上下文
 *   - planIntelAction: 委托给 AuctionAiEngine.planIntelAction 选择最优情报动作
 *   - 高价值追踪：自动追踪绝品/高价藏品，维护 trackId 映射
 *   - 资源管理：AI角色技能和道具的初始化、每轮重置、消耗扣减
 *
 * 数据结构：
 *   aiPrivateIntel[playerId] = {
 *     outlineSignals, qualitySignals, signalHistory,
 *     knownOutlineIds, knownQualityIds,
 *     knownCellStates, itemKnowledge,
 *     highValueTracks, highValueTrackByItemId,
 *     aggregateStats, latestSignalStats
 *   }
 *   aiResourceState[playerId] = { skills: {skillId: count}, items: {itemId: count} }
 *   aiCharacterAssignments[playerId] = { characterId, skillId, skillName, passive }
 *
 * @requires MobaoUtils     - 工具函数（createEmptyAiPrivateIntelPool, clamp, formatTrackIndex, shuffle 等）
 * @requires SkillSystem    - 技能定义（SKILL_DEFS）
 * @requires ItemSystem     - 道具定义（ITEM_DEFS）
 * @requires MobaoSettings  - 全局设置（GAME_SETTINGS）
 * @requires ArtifactData   - 藏品数据（QUALITY_CONFIG, toSizeTag）
 *
 * @exports IntelMixin - AI情报系统 Mixin，混入 Phaser Scene
 *
 * 混入方式：Object.assign(scene, MobaoAi.IntelMixin)
 * 混入后 scene 将获得：aiPrivateIntel, aiResourceState, aiRoundEffects,
 *   lastAiIntelActions, aiLlmRoundPlans, aiFoldState, aiCharacterAssignments,
 *   initAiIntelSystems, getAiIntelSummary, buildAiIntelSnapshot, 等一系列方法
 */

import {
  createEmptyAiPrivateIntelPool,
  clamp,
  formatTrackIndex,
  shuffle,
  formatCompactNumber,
  compactOneLine,
  toCellKey,
  fromCellKey,
  sizeTagToCellCount
} from "../core/utils"
import { SKILL_DEFS } from "../data/skills"
import { ITEM_DEFS } from "../data/items"
import { GAME_SETTINGS } from "../core/settings"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY, toSizeTag } from "../data/artifacts"
import { CHARACTERS } from "../data/characters"
import { getActiveCharacter } from "../data/character-system"



export const AiIntelMixin: ThisType<WarehouseSceneThis> = {
  /**
   * 构建规则AI可调用的揭示上下文，委托给场景的批量揭示方法
   * @returns {{ revealOutline: Function, revealQuality: Function, revealAll: Function }}
   */
  buildSkillContext() {
    return {
      revealOutline: ({ count, category, allowCategoryFallback = false, sortStrategy }: {
        count: number;
        category: string | null;
        allowCategoryFallback?: boolean;
        sortStrategy: string | null;
      }) => this.revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy),
      revealQuality: ({ count, category, allowCategoryFallback = false, sortStrategy }: {
        count: number;
        category: string | null;
        allowCategoryFallback?: boolean;
        sortStrategy: string | null;
      }) => this.revealQualityBatch(count, category, allowCategoryFallback, sortStrategy),
      revealAll: ({ count, sortStrategy, category, allowCategoryFallback }: {
        count: number;
        sortStrategy: string;
        category: string | null;
        allowCategoryFallback: boolean;
      }) => this.revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback })
    }
  },

  /**
   * 初始化AI情报系统，为每个AI玩家创建私有情报池、分配角色和初始资源
   *
   * 执行步骤：
   * 1. 初始化全局状态容器（aiPrivateIntel/aiResourceState/aiRoundEffects 等）
   * 2. 为每个AI玩家创建空情报池
   * 3. 随机分配角色，根据角色技能初始化技能资源
   * 4. 随机分配4个道具作为初始道具资源
   * 5. 刷新所有玩家头像显示
   *
   * @returns {void}
   */
  initAiIntelSystems() {
    this.aiPrivateIntel = {}
    this.aiResourceState = {}
    this.aiRoundEffects = {}
    this.lastAiIntelActions = []
    this.aiLlmRoundPlans = {}
    this.aiFoldState = {}
    this.highValuePriceThreshold = null
    this.aiCharacterAssignments = {}

    const aiPlayers = this.players.filter((player) => !player.isHuman)
    const allCharacters = CHARACTERS || []
    const allItems = [...ITEM_DEFS]

    aiPlayers.forEach((player) => {
      this.aiPrivateIntel[player.id] = createEmptyAiPrivateIntelPool()

      const randomCharIndex = Math.floor(Math.random() * allCharacters.length)
      const assignedChar = allCharacters[randomCharIndex] || allCharacters[0]
      this.aiCharacterAssignments[player.id] = {
        characterId: assignedChar.id,
        characterName: assignedChar.name,
        skillId: assignedChar.skillId,
        skillName: assignedChar.skillName,
        passive: assignedChar.passive || null
      }

      const skillDef = SKILL_DEFS.find((s) => s.id === assignedChar.skillId)
      const skillEntry = skillDef ? { [skillDef.id]: skillDef.maxPerRound } : {}

      const shuffledItems = shuffle([...allItems])
      const selectedItems = shuffledItems.slice(0, 4)
      const itemEntries: Record<string, number> = {}
      selectedItems.forEach((item) => {
        itemEntries[item.id] = item.initialCount
      })

      this.aiResourceState[player.id] = {
        skills: skillEntry,
        items: itemEntries
      }
      this.aiFoldState[player.id] = false
    })

    this.refreshAllPlayerAvatars()
  },

  refreshAllPlayerAvatars() {
    this.players.forEach((player) => {
      const avatarEl = document.getElementById(`avatar-${player.id}`)
      if (avatarEl) {
        this.updatePlayerAvatar(player.id, avatarEl)
      }
      // 保持玩家名字为"左上AI"等，不改为角色名
      const nameEl = document.getElementById(`name-${player.id}`)
      if (nameEl) nameEl.textContent = player.name
      // 更新头像下方的角色名标签
      let charName = ""
      if (player.isHuman) {
        const char = getActiveCharacter()
        if (char && char.name) charName = char.name
      } else {
        const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[player.id]
        if (charAssign && charAssign.characterName) charName = charAssign.characterName
      }
      if (avatarEl && charName) {
        let wrap = avatarEl.parentElement
        if (wrap && wrap.classList.contains("avatar-wrap")) {
          let nameTag = wrap.querySelector(".avatar-char-name")
          if (!nameTag) {
            nameTag = document.createElement("div")
            nameTag.className = "avatar-char-name"
            wrap.appendChild(nameTag)
          }
          nameTag.textContent = charName
            ; (nameTag as HTMLElement).style.display = ""
        }
      }
    })
  },

  /**
   * 每轮重置AI技能资源（道具不重置，仅技能恢复满额）
   * 同时清空回合效果、上次动作记录和LLM计划
   * @returns {void}
   */
  resetAiRoundResources() {
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    aiPlayers.forEach((player) => {
      let resourceState = this.aiResourceState[player.id]
      if (!resourceState) {
        resourceState = { skills: {}, items: {} }
        this.aiResourceState[player.id] = resourceState
      }

      if (!this.aiCharacterAssignments) {
        this.aiCharacterAssignments = {}
      }

      const charAssign = this.aiCharacterAssignments[player.id]
      if (charAssign && charAssign.skillId) {
        const skillDef = SKILL_DEFS.find((s) => s.id === charAssign.skillId)
        if (skillDef) {
          resourceState.skills[skillDef.id] = skillDef.maxPerRound
        }
      }
    })
    this.aiRoundEffects = {}
    this.lastAiIntelActions = []
    this.aiLlmRoundPlans = {}
  },

  /**
   * 确保AI玩家拥有私有情报池，不存在则创建空池
   * @param {string|number} playerId - AI玩家ID
   * @returns {Object} 私有情报池对象
   */
  ensureAiPrivateIntel(playerId: string) {
    if (this.aiPrivateIntel[playerId]) {
      return this.aiPrivateIntel[playerId]
    }

    const pool = createEmptyAiPrivateIntelPool()
    this.aiPrivateIntel[playerId] = pool
    return pool
  },

  /**
   * 计算AI玩家的情报摘要，用于出价决策和LLM prompt
   *
   * 核心指标计算：
   * - clueRate: 线索率 = (轮廓数×0.65 + 品质数) / 总藏品数，轮廓权重较低因为信息量少
   * - qualityRate: 品质率 = 品质数 / 总藏品数
   * - uncertainty: 不确定性 = 0.88 - clueRate×0.48 - qualityRate×0.2 + spreadRatio×0.35 - edgeBias×0.08
   *   基准0.88，线索和品质降低不确定性，价格分散度增加不确定性，边缘差降低不确定性
   *
   * @param {string|number} playerId - AI玩家ID
   * @returns {{ clueCount: number, outlineCount: number, qualityCount: number,
   *              clueRate: number, qualityRate: number, uncertainty: number,
   *              signalCount: number, meanEstimate: number, spreadRatio: number,
   *              upperEdge: number, lowerEdge: number, std: number, iqr: number }}
   */
  getAiIntelSummary(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const total = Math.max(1, this.items.length)
    const outlineCount = pool.outlineSignals.length
    const qualityCount = pool.qualitySignals.length
    const clueCount = outlineCount + qualityCount
    const clueRate = clamp((outlineCount * 0.65 + qualityCount) / total, 0, 1)
    const qualityRate = clamp(qualityCount / total, 0, 1)

    if (!pool.aggregateStats) {
      const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
      pool.aggregateStats = totalStats.aggregate
    }

    const aggregateStats = pool.aggregateStats || {
      mean: 0,
      spreadRatio: 0,
      upperEdge: 0,
      lowerEdge: 0,
      std: 0,
      iqr: 0,
      count: 0
    }

    const edgeBias = Math.max(0, aggregateStats.upperEdge - aggregateStats.lowerEdge)
    const uncertainty = clamp(
      0.88 - clueRate * 0.48 - qualityRate * 0.2 + aggregateStats.spreadRatio * 0.35 - edgeBias * 0.08,
      0.05,
      1
    )

    return {
      clueCount,
      outlineCount,
      qualityCount,
      clueRate,
      qualityRate,
      uncertainty,
      signalCount: pool.signalHistory.length,
      meanEstimate: aggregateStats.mean,
      spreadRatio: aggregateStats.spreadRatio,
      upperEdge: aggregateStats.upperEdge,
      lowerEdge: aggregateStats.lowerEdge,
      std: aggregateStats.std,
      iqr: aggregateStats.iqr
    }
  },

  /**
   * 构建所有AI玩家的情报快照（playerId → IntelSummary 映射）
   * @returns {Object<string, IntelSummary>}
   */
  buildAiIntelSnapshot() {
    const map: Record<string, IntelSummary> = {}
    this.players
      .filter((player) => !player.isHuman)
      .forEach((player) => {
        map[player.id] = this.getAiIntelSummary(player.id)
      })
    return map
  },

  /**
   * 获取AI玩家的资源快照（技能和道具的深拷贝）
   * @param {string|number} playerId - AI玩家ID
   * @returns {{ skills: Object<string,number>, items: Object<string,number> }}
   */
  getAiResourceSnapshot(playerId: string) {
    const resourceState = this.aiResourceState[playerId]
    if (!resourceState) {
      return {
        skills: {},
        items: {}
      }
    }

    return {
      skills: { ...resourceState.skills },
      items: { ...resourceState.items }
    }
  },

  /**
   * 构建LLM可调用的揭示上下文，与 buildSkillContext 类似但绑定到指定AI玩家
   * @param {string|number} playerId - AI玩家ID
   * @returns {{ revealOutline: Function, revealQuality: Function, revealAll: Function }}
   */
  buildAiPrivateRevealContext(playerId: string) {
    return {
      revealOutline: ({ count, category, allowCategoryFallback = false, sortStrategy }: {
        count: number;
        category: string | null;
        allowCategoryFallback?: boolean;
        sortStrategy: string | null;
      }) => this.revealPrivateIntelBatch(playerId, "outline", count, category, allowCategoryFallback, sortStrategy ?? ""),
      revealQuality: ({ count, category, allowCategoryFallback = false, sortStrategy }: {
        count: number;
        category: string | null;
        allowCategoryFallback?: boolean;
        sortStrategy: string;
      }) =>
        this.revealPrivateIntelBatch(playerId, "quality", count, category, allowCategoryFallback, sortStrategy),
      revealAll: ({ count, sortStrategy, category, allowCategoryFallback }: {
        count: number;
        sortStrategy: string;
        category: string | null;
        allowCategoryFallback: boolean;
      }) =>
        this.revealPrivateIntelFully(playerId, { count, sortStrategy, category, allowCategoryFallback })
    }
  },

  pickRandomItemCell(item: Artifact) {
    const cells: { x: number; y: number }[] = []
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        cells.push({ x, y })
      }
    }
    return cells.length > 0 ? cells[Math.floor(Math.random() * cells.length)] : null
  },

  markAiKnownCellState(playerId: string, x: number, y: number, state: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const key = toCellKey(x, y)
    pool.knownCellStates[key] = state || "empty"
  },

  scanNeighborIntelAroundCell(playerId: string, x: number, y: number) {
    const offsets = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1]
    ]

    offsets.forEach(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      if (!this.isInBoundsCell(nx, ny)) {
        return
      }
      const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
      this.markAiKnownCellState(playerId, nx, ny, state)
    })
  },

  markAllItemCellsAsOccupied(playerId: string, item: Artifact) {
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        if (this.isInBoundsCell(x, y)) {
          this.markAiKnownCellState(playerId, x, y, "occupied")
        }
      }
    }
  },

  scanItemBoundaryNeighbors(playerId: string, item: Artifact) {
    const scanned = new Set()
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        const offsets = [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1]
        ]
        offsets.forEach(([dx, dy]) => {
          const nx = x + dx
          const ny = y + dy
          if (!this.isInBoundsCell(nx, ny)) {
            return
          }
          const key = `${nx},${ny}`
          if (scanned.has(key)) {
            return
          }
          if (nx >= item.x && nx < item.x + item.w && ny >= item.y && ny < item.y + item.h) {
            return
          }
          scanned.add(key)
          const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty"
          this.markAiKnownCellState(playerId, nx, ny, state)
        })
      }
    }
  },

  /**
   * 为AI玩家构建单条私有信号，包含藏品信息和采样单元格
   * outline模式：记录品类、尺寸标签，标记所有占用格和边界邻居
   * quality模式：记录品质键，标记采样格和8邻居
   * @param {string|number} playerId - AI玩家ID
   * @param {Object} item - 藏品对象
   * @param {"outline"|"quality"} mode - 揭示模式
   * @returns {Object} 信号对象 { itemId, round, mode, category?, sizeTag?, qualityKey?, sampleCell? }
   */
  buildAiPrivateSignal(playerId: string, item: Artifact, mode: string) {
    const cell = this.pickRandomItemCell(item)
    const baseSignal = {
      itemId: item.id,
      round: this.round,
      mode
    }

    if (mode === "outline") {
      Object.assign(baseSignal, {
        category: item.category,
        sizeTag: toSizeTag(item.w, item.h),
        sampleCell: cell
      })

      this.markAllItemCellsAsOccupied(playerId, item)
      this.scanItemBoundaryNeighbors(playerId, item)
    } else {
      Object.assign(baseSignal, {
        qualityKey: item.qualityKey,
        sampleCell: cell
      })

      if (cell) {
        this.markAiKnownCellState(playerId, cell.x, cell.y, "occupied")
        this.scanNeighborIntelAroundCell(playerId, cell.x, cell.y)
      }
    }

    return baseSignal
  },

  ensureAiItemKnowledge(playerId: string, itemId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    if (!pool.itemKnowledge[itemId]) {
      pool.itemKnowledge[itemId] = {
        revealCount: 0,
        lastSeenRound: 0,
        category: null,
        qualityKey: null,
        sizeTag: null,
        knownCells: new Set()
      }
    }
    return pool.itemKnowledge[itemId]
  },

  getHighValuePriceThreshold() {
    if (this.highValuePriceThreshold !== null && Number.isFinite(this.highValuePriceThreshold) && this.highValuePriceThreshold > 0) {
      return this.highValuePriceThreshold
    }

    const prices = ARTIFACT_LIBRARY.map((entry) => Number(entry.basePrice) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b)

    if (prices.length === 0) {
      this.highValuePriceThreshold = 6000
      return this.highValuePriceThreshold
    }

    const idx = Math.floor((prices.length - 1) * 0.8)
    const p80 = prices[idx] || prices[prices.length - 1]
    this.highValuePriceThreshold = Math.max(5200, Math.round(p80))
    return this.highValuePriceThreshold
  },

  isHighValueArtifact(item: Artifact) {
    const threshold = this.getHighValuePriceThreshold()
    return item.qualityKey === "legendary" || (Number(item.basePrice) || 0) >= threshold
  },

  /**
   * 确保高价值藏品被追踪，若未追踪则创建新追踪条目
   * 追踪ID格式为"红一/红二/..."，用于AI决策时引用
   * @param {string|number} playerId - AI玩家ID
   * @param {Object} item - 藏品对象
   * @returns {{ trackId: string, created: boolean }|null} 非高价值返回null
   */
  ensureAiHighValueTrack(playerId: string, item: Artifact) {
    if (!this.isHighValueArtifact(item)) {
      return null
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    let trackId = pool.highValueTrackByItemId[item.id]
    if (!trackId) {
      trackId = `红${formatTrackIndex(pool.nextTrackIndex)}`
      pool.nextTrackIndex += 1
      pool.highValueTrackByItemId[item.id] = trackId
      pool.highValueTracks.push({
        trackId,
        itemId: item.id,
        createdRound: this.round,
        lastSeenRound: this.round
      })
      return { trackId, created: true }
    }

    const track: HighValueTrack | undefined = pool.highValueTracks.find((entry: HighValueTrack) => entry.itemId === item.id)
    if (track) {
      track.lastSeenRound = this.round
    }
    return { trackId, created: false }
  },

  /**
   * 更新AI玩家对某件藏品的知识记录，并在高价值追踪中更新揭示等级
   * @param {string|number} playerId - AI玩家ID
   * @param {Object} item - 藏品对象
   * @param {Object} signal - 本次揭示的信号
   * @param {"outline"|"quality"} mode - 揭示模式
   * @returns {Object} 更新后的知识对象，可能包含 trackUpdate
   */
  updateAiItemKnowledge(playerId: string, item: Artifact, signal: { sampleCell?: { x: number; y: number } } | null, mode: string): AiItemKnowledge & { trackUpdate?: { trackId: string; revealLevel: string; confirmed: { quality: string; category: string; exactArtifact: string | null }; candidates: { total: number; truncated: boolean } } } {
    const intel = this.ensureAiItemKnowledge(playerId, item.id)
    intel.revealCount += 1
    intel.lastSeenRound = this.round

    if (mode === "outline") {
      intel.category = item.category
      intel.sizeTag = toSizeTag(item.w, item.h)
    } else if (mode === "quality") {
      intel.qualityKey = item.qualityKey
    }

    if (signal && signal.sampleCell) {
      intel.knownCells.add(toCellKey(signal.sampleCell.x, signal.sampleCell.y))
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    const trackId = pool.highValueTrackByItemId[item.id]
    if (trackId) {
      const track: HighValueTrack | undefined = pool.highValueTracks.find((entry: HighValueTrack) => entry.itemId === item.id)
      if (track) {
        track.lastSeenRound = this.round
        const revealState = {
          qualityKey: intel.qualityKey,
          category: intel.category,
          sizeTag: intel.sizeTag
        }
        const candidatePreview = this.buildTrackCandidatePreview(revealState)
        const exactKnown = candidatePreview.total === 1
        const revealLevel = exactKnown
          ? "已完全确定"
          : intel.qualityKey && intel.category
            ? "范围缩小"
            : intel.qualityKey
              ? "仅知品质"
              : intel.category
                ? "已知品类"
                : "仅知轮廓"

        return {
          ...intel,
          trackUpdate: {
            trackId,
            revealLevel,
            confirmed: {
              quality: intel.qualityKey
                ? QUALITY_CONFIG[intel.qualityKey]
                  ? QUALITY_CONFIG[intel.qualityKey].label
                  : intel.qualityKey
                : "未知",
              category: intel.category ? intel.category : "未知",
              exactArtifact: exactKnown && candidatePreview.list[0] ? candidatePreview.list[0].name : null
            },
            candidates: {
              total: candidatePreview.total,
              truncated: candidatePreview.truncated
            }
          }
        }
      }
    }

    return intel
  },

  /**
   * 为AI玩家批量揭示私有情报（轮廓或品质）
   *
   * 流程：
   * 1. 调用 pickPrivateRevealTargets 选择揭示目标
   * 2. 为每个目标构建私有信号（buildAiPrivateSignal）
   * 3. 更新情报池（knownOutlineIds/knownQualityIds/signalHistory）
   * 4. 更新物品知识和高价值追踪
   * 5. 计算信号统计（本次 + 累计）
   * 6. 信号历史超过160条时截断保留最近160条
   *
   * @param {string|number} playerId - AI玩家ID
   * @param {"outline"|"quality"} mode - 揭示模式：outline=轮廓线索，quality=品质鉴定
   * @param {number} count - 揭示数量
   * @param {string} [category] - 可选，限定品类
   * @param {boolean} [allowCategoryFallback=false] - 品类不足时是否回退到其他品类
   * @param {string} [sortStrategy] - 排序策略（smallestFirst/largestFirst）
   * @returns {{ ok: boolean, revealed: number, signals: Array, signalStats: Object,
   *              trackUpdates: Array, bottomCell: Object|null, message?: string }}
   */
  revealPrivateIntelBatch(playerId: string, mode: string, count: number, category: string | null, allowCategoryFallback = false, sortStrategy: string | null) {
    const targets = this.pickPrivateRevealTargets({
      playerId,
      mode,
      count,
      category,
      allowCategoryFallback,
      sortStrategy
    })

    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示目标。" }
    }

    const pool = this.ensureAiPrivateIntel(playerId)
    const signals: AiIntelSignal[] = []
    const trackUpdates: Array<{ trackId: string; created?: boolean; revealLevel?: string; confirmed?: { quality: string; category: string; exactArtifact: string | null }; candidates?: { total: number; truncated: boolean } }> = []

    targets.forEach((item) => {
      const signal = this.buildAiPrivateSignal(playerId, item, mode)
      if (mode === "outline") {
        pool.knownOutlineIds.add(item.id)
        pool.outlineSignals.push(signal)
      } else {
        pool.knownQualityIds.add(item.id)
        pool.qualitySignals.push(signal)
        const trackUpdate = this.ensureAiHighValueTrack(playerId, item)
        if (trackUpdate) {
          trackUpdates.push(trackUpdate)
        }
      }

      const knowledgeUpdate = this.updateAiItemKnowledge(playerId, item, signal, mode)
      if (knowledgeUpdate.trackUpdate) {
        trackUpdates.push(knowledgeUpdate.trackUpdate)
      }

      signals.push(signal)
    })

    pool.signalHistory.push(...signals)
    if (pool.signalHistory.length > 160) {
      pool.signalHistory = pool.signalHistory.slice(-160)
    }

    const signalStats = this.artifactManager.getSignalPriceStats(signals)
    const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
    pool.latestSignalStats = signalStats
    pool.aggregateStats = totalStats.aggregate
    const bottomCell = mode === "outline" ? this.pickBottomCellFromTargets(targets) : null

    return {
      ok: true,
      revealed: targets.length,
      signals,
      signalStats,
      trackUpdates,
      bottomCell
    }
  },

  /**
   * 为AI玩家完全揭示藏品（同时获得轮廓+品质信息）
   * @param {string|number} playerId - AI玩家ID
   * @param {Object} options
   * @param {number} options.count - 揭示数量
   * @param {string} [options.sortStrategy] - 排序策略
   * @param {string} [options.category] - 限定品类
   * @param {boolean} [options.allowCategoryFallback] - 品类不足时是否回退
   * @returns {{ ok: boolean, revealed: number, signals: Array, trackUpdates: Array, message?: string }}
   */
  revealPrivateIntelFully(playerId: string, { count, sortStrategy, category, allowCategoryFallback }: { count: number; sortStrategy: string; category: string; allowCategoryFallback: boolean }) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const unrevealed = this.items.filter(
      (item) => !pool.knownOutlineIds.has(item.id) || !pool.knownQualityIds.has(item.id)
    )

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let targetPool
    if (category) {
      const primary = unrevealed.filter((item) => item.category === category)
      targetPool = sortByArea(primary, sortStrategy)

      if (targetPool.length < count && allowCategoryFallback) {
        const existedIds = new Set(targetPool.map((item) => item.id))
        const fallback = unrevealed.filter((item) => !existedIds.has(item.id))
        targetPool = targetPool.concat(sortByArea(fallback, sortStrategy))
      }
    } else {
      targetPool = sortByArea(unrevealed, sortStrategy)
    }

    const targets = targetPool.slice(0, count)
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可完全揭示的藏品。" }
    }

    const signals: AiIntelSignal[] = []
    const trackUpdates: Array<{ trackId: string; created?: boolean; revealLevel?: string; confirmed?: { quality: string; category: string; exactArtifact: string | null }; candidates?: { total: number; truncated: boolean } }> = []

    targets.forEach((item) => {
      const outlineSignal = this.buildAiPrivateSignal(playerId, item, "outline")
      const qualitySignal = this.buildAiPrivateSignal(playerId, item, "quality")

      pool.knownOutlineIds.add(item.id)
      pool.knownQualityIds.add(item.id)
      pool.outlineSignals.push(outlineSignal)
      pool.qualitySignals.push(qualitySignal)

      const trackUpdate = this.ensureAiHighValueTrack(playerId, item)
      if (trackUpdate) {
        trackUpdates.push(trackUpdate)
      }

      const outlineKnowledge = this.updateAiItemKnowledge(playerId, item, outlineSignal, "outline")
      if (outlineKnowledge.trackUpdate) {
        trackUpdates.push(outlineKnowledge.trackUpdate)
      }

      const qualityKnowledge = this.updateAiItemKnowledge(playerId, item, qualitySignal, "quality")
      if (qualityKnowledge.trackUpdate) {
        trackUpdates.push(qualityKnowledge.trackUpdate)
      }

      signals.push(outlineSignal, qualitySignal)
    })

    pool.signalHistory.push(...signals)
    if (pool.signalHistory.length > 160) {
      pool.signalHistory = pool.signalHistory.slice(-160)
    }

    const signalStats = this.artifactManager.getSignalPriceStats(signals)
    const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory)
    pool.latestSignalStats = signalStats
    pool.aggregateStats = totalStats.aggregate

    return {
      ok: true,
      revealed: targets.length,
      signals,
      signalStats,
      trackUpdates
    }
  },

  /**
   * 选择私有揭示目标，根据品类、排序策略和已揭示状态筛选
   *
   * 选择优先级：
   * 1. 未揭示过的藏品优先（完全未知 > 半已知）
   * 2. 品类匹配优先，allowCategoryFallback 时回退
   * 3. sortStrategy 控制大小排序
   *
   * @param {Object} params
   * @param {string|number} params.playerId - AI玩家ID
   * @param {"outline"|"quality"} params.mode - 揭示模式
   * @param {number} params.count - 揭示数量
   * @param {string} [params.category] - 限定品类
   * @param {boolean} [params.allowCategoryFallback=false] - 品类不足时是否回退
   * @param {string} [params.sortStrategy] - 排序策略
   * @returns {Array<Object>} 选中的藏品对象数组
   */
  pickPrivateRevealTargets({ playerId, mode, count, category, allowCategoryFallback = false, sortStrategy }: { playerId: string; mode: string; count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const knownSet = mode === "outline" ? pool.knownOutlineIds : pool.knownQualityIds

    const isUnknown = (item: Artifact) => {
      return !knownSet.has(item.id)
    }

    const primary = this.items.filter((item) => {
      if (category && item.category !== category) {
        return false
      }
      return isUnknown(item)
    })

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let selected = sortByArea(primary, sortStrategy).slice(0, count)
    if (selected.length < count && allowCategoryFallback && category) {
      const existed = new Set(selected.map((item) => item.id))
      const fallback = this.items.filter((item) => !existed.has(item.id) && isUnknown(item))
      selected = selected.concat(sortByArea(fallback, sortStrategy).slice(0, count - selected.length))
    }

    return selected
  },

  getPlayerById(playerId: number | string) {
    return this.players.find((entry) => entry.id === playerId) || null
  },

  getAiNeighborStateLabel(playerId: string | number, x: number, y: number) {
    if (!this.isInBoundsCell(x, y)) {
      return "越界"
    }

    const pool = this.ensureAiPrivateIntel(String(playerId))
    const key = toCellKey(x, y)
    const raw = pool.knownCellStates[key]
    if (raw === "occupied") {
      return "已被占用"
    }
    if (raw === "empty") {
      return "确认空闲"
    }
    return "尚未探明"
  },

  buildNeighborSnapshot(playerId: string, cell: { x: number; y: number } | null) {
    if (!cell) {
      return null
    }

    return {
      上: this.getAiNeighborStateLabel(playerId, cell.x, cell.y - 1),
      下: this.getAiNeighborStateLabel(playerId, cell.x, cell.y + 1),
      左: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y),
      右: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y),
      左上: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y - 1),
      右上: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y - 1),
      左下: this.getAiNeighborStateLabel(playerId, cell.x - 1, cell.y + 1),
      右下: this.getAiNeighborStateLabel(playerId, cell.x + 1, cell.y + 1)
    }
  },

  buildAiAggregateIntelBlock(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const qualityMap: Record<string, { count: number; deepestRow: number; estimatedCellCount: number; estimatedCellSamples: number; knownQualityCount: number; highQualityCount: number; qualityLabel: string; qualityKey: string }> = {}
    const categoryMap: Record<string, { count: number; deepestRow: number; estimatedCellCount: number; estimatedCellSamples: number; knownQualityCount: number; highQualityCount: number; category: string }> = {}

    pool.qualitySignals.forEach((signal: AiIntelSignal) => {
      if (!signal || !signal.qualityKey) {
        return
      }
      const key = signal.qualityKey
      if (!qualityMap[key]) {
        qualityMap[key] = {
          qualityKey: key,
          qualityLabel: QUALITY_CONFIG[key] ? QUALITY_CONFIG[key].label : key,
          count: 0,
          deepestRow: 0,
          estimatedCellCount: 0,
          estimatedCellSamples: 0,
          knownQualityCount: 0,
          highQualityCount: 0
        }
      }
      qualityMap[key].count += 1
      if (signal.sampleCell && Number.isFinite(signal.sampleCell.y)) {
        qualityMap[key].deepestRow = Math.max(qualityMap[key].deepestRow, signal.sampleCell.y + 1)
      }
      const knowledge = signal.itemId ? pool.itemKnowledge[signal.itemId] : undefined
      const sizeCells = knowledge && knowledge.sizeTag ? sizeTagToCellCount(knowledge.sizeTag) : null
      if (sizeCells !== null && Number.isFinite(sizeCells) && sizeCells > 0) {
        qualityMap[key].estimatedCellCount += sizeCells
        qualityMap[key].estimatedCellSamples += 1
      }
    })

    pool.outlineSignals.forEach((signal: AiIntelSignal) => {
      if (!signal || !signal.category) {
        return
      }
      const key = signal.category
      if (!categoryMap[key]) {
        categoryMap[key] = {
          category: key,
          count: 0,
          deepestRow: 0,
          estimatedCellCount: 0,
          estimatedCellSamples: 0,
          highQualityCount: 0,
          knownQualityCount: 0
        }
      }
      categoryMap[key].count += 1
      const knowledge = signal.itemId ? pool.itemKnowledge[signal.itemId] : undefined
      if (knowledge && knowledge.qualityKey) {
        categoryMap[key].knownQualityCount += 1
        if (knowledge.qualityKey === "rare" || knowledge.qualityKey === "legendary") {
          categoryMap[key].highQualityCount += 1
        }
      }
    })

    const byQuality = Object.values(qualityMap)
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        quality: entry.qualityLabel,
        count: entry.count,
        deepestRow: entry.deepestRow || null,
        estimatedOccupiedCells:
          entry.estimatedCellSamples > 0 ? Math.round(entry.estimatedCellCount / entry.estimatedCellSamples) : null
      }))

    const byCategory = Object.values(categoryMap)
      .sort((a, b) => b.count - a.count)
      .map((entry) => ({
        category: entry.category,
        count: entry.count,
        qualityHint:
          entry.knownQualityCount > 0
            ? `已知品质中高品质 ${entry.highQualityCount}/${entry.knownQualityCount}`
            : "暂无品质细分"
      }))

    return {
      byQuality,
      byCategory,
      signalCount: pool.signalHistory.length
    }
  },

  /**
   * 构建高价值追踪的候选预览，根据已揭示信息缩小候选范围
   * @param {Object} revealState - 已知信息 { qualityKey, category, sizeTag }
   * @returns {{ total: number, truncated: boolean, list: Array }}
   */
  buildTrackCandidatePreview(revealState: { qualityKey: string | null; category: string | null; sizeTag: string | null }) {
    type CandidateItem = { name: string; basePrice: number; w: number; h: number; expectedPrice: number; previewSizeTag: string; qualityKey: string }
    let candidates: CandidateItem[] = (this.artifactManager.getCandidatesByRevealState(revealState) as CandidateItem[])
    if (!candidates || candidates.length === 0) {
      const threshold = this.getHighValuePriceThreshold()
      candidates = ARTIFACT_LIBRARY.filter(
        (entry) => entry.qualityKey === "legendary" || entry.basePrice >= threshold
      ).map((entry) => ({
        ...entry,
        expectedPrice: entry.basePrice,
        previewSizeTag: toSizeTag(entry.w, entry.h)
      }))
    }

    const sorted = [...candidates].sort(
      (a, b) => (b.expectedPrice || b.basePrice || 0) - (a.expectedPrice || a.basePrice || 0)
    )
    if (sorted.length <= 10) {
      return {
        total: sorted.length,
        truncated: false,
        list: sorted
      }
    }

    const first = sorted.slice(0, 5)
    const tail = sorted.slice(-5)
    return {
      total: sorted.length,
      truncated: true,
      list: first.concat(tail)
    }
  },

  buildAiHighValueTrackBlock(playerId: string) {
    const pool = this.ensureAiPrivateIntel(playerId)
    const tracks = pool.highValueTracks || []

    return tracks.map((track: HighValueTrack) => {
      const item = this.items.find((entry) => entry.id === track.itemId)
      const knowledge = pool.itemKnowledge[track.itemId] || null
      const knownCells =
        knowledge && knowledge.knownCells
          ? [...knowledge.knownCells].map((cellKey) => fromCellKey(cellKey)).filter((c): c is { x: number; y: number } => c !== null)
          : []
      const anchorCell = knownCells[0] || null

      const revealState = {
        qualityKey: knowledge && knowledge.qualityKey ? knowledge.qualityKey : null,
        category: knowledge && knowledge.category ? knowledge.category : null,
        sizeTag: knowledge && knowledge.sizeTag ? knowledge.sizeTag : null
      }
      const candidatePreview = this.buildTrackCandidatePreview(revealState)
      const exactKnown = candidatePreview.total === 1
      const revealLevel = exactKnown
        ? "已完全确定"
        : knowledge && knowledge.qualityKey && knowledge.category
          ? "范围缩小"
          : knowledge && knowledge.qualityKey
            ? "仅知品质"
            : knowledge && knowledge.category
              ? "已知品类"
              : "仅知轮廓"

      return {
        trackId: track.trackId,
        revealLevel,
        confirmed: {
          quality:
            knowledge && knowledge.qualityKey
              ? QUALITY_CONFIG[knowledge.qualityKey]
                ? QUALITY_CONFIG[knowledge.qualityKey].label
                : knowledge.qualityKey
              : "未知",
          category: knowledge && knowledge.category ? knowledge.category : "未知",
          exactArtifact: exactKnown && candidatePreview.list[0] ? candidatePreview.list[0].name : null
        },
        candidates: {
          total: candidatePreview.total,
          truncated: candidatePreview.truncated,
          list: candidatePreview.list.map((entry) => ({
            name: entry.name,
            refPriceRange: [
              Math.round((entry.expectedPrice || entry.basePrice || 0) * 0.9),
              Math.round((entry.expectedPrice || entry.basePrice || 0) * 1.1)
            ],
            sizeCells: entry.w && entry.h ? entry.w * entry.h : sizeTagToCellCount(entry.previewSizeTag)
          }))
        },
        spatial: {
          knownCells: knownCells.map((cell) => ({ row: cell.y + 1, col: cell.x + 1 })),
          neighborState: this.buildNeighborSnapshot(playerId, anchorCell)
        },
        internalRef: item ? item.id : track.itemId
      }
    })
  },

  buildAiPrivateIntelBlock(playerId: string) {
    return {
      aggregate: this.buildAiAggregateIntelBlock(playerId),
      highValueTracks: this.buildAiHighValueTrackBlock(playerId)
    }
  },

  getAiAvailableActionState(playerId: string) {
    const resource = this.getAiResourceSnapshot(playerId)
    const availableSkillIds = SKILL_DEFS.filter((entry) => Number(resource.skills[entry.id] || 0) > 0).map(
      (entry) => entry.id
    )
    const availableItemIds = ITEM_DEFS.filter((entry) => Number(resource.items[entry.id] || 0) > 0).map(
      (entry) => entry.id
    )

    return {
      availableSkillIds,
      availableItemIds,
      availableSkillNames: SKILL_DEFS.filter((entry) => availableSkillIds.includes(entry.id)).map(
        (entry) => entry.name
      ),
      availableItemNames: ITEM_DEFS.filter((entry) => availableItemIds.includes(entry.id)).map((entry) => entry.name)
    }
  },

  buildAiActionConstraintBlock(playerId: string) {
    const actionState = this.getAiAvailableActionState(playerId)
    return {
      canBid: true,
      canFold: false,
      availableSkills: actionState.availableSkillNames,
      availableItems: actionState.availableItemNames,
      notes: [
        "本轮最多选择一个情报动作（技能或道具二选一）。",
        "当前技能/道具不需要目标参数；若填写目标，只会作为日志记录。"
      ],
      _internal: actionState
    }
  },

  executeAiIntelAction(playerId: string, plan: IntelActionPlan): RevealResult & { signalStats?: { aggregate: AiSignalStats; latest: AiSignalStats } } {
    const resourceState = this.aiResourceState[playerId]
    if (!resourceState || !plan || plan.actionType === "none") {
      return { ok: false, revealed: 0, message: "未执行AI情报行动。" }
    }

    const usedThisRound = this.currentRoundUsage[playerId] || []
    if (usedThisRound.length > 0) {
      return { ok: false, revealed: 0, message: "本回合已使用过技能或道具。" }
    }

    if (plan.actionType === "skill") {
      const remain = Number(resourceState.skills[plan.actionId] || 0)
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI技能次数不足。" }
      }

      const skill = SKILL_DEFS.find((entry) => entry.id === plan.actionId)
      if (!skill) {
        return { ok: false, revealed: 0, message: "AI技能不存在。" }
      }

      const result = skill.execute(this.buildAiPrivateRevealContext(playerId))
      if (!result.ok) {
        return result
      }

      resourceState.skills[plan.actionId] = remain - 1
      return result
    }

    if (plan.actionType === "item") {
      const remain = Number(resourceState.items[plan.actionId] || 0)
      if (remain <= 0) {
        return { ok: false, revealed: 0, message: "AI道具库存不足。" }
      }

      const item = ITEM_DEFS.find((entry) => entry.id === plan.actionId)
      if (!item) {
        return { ok: false, revealed: 0, message: "AI道具不存在。" }
      }

      const result = item.execute(this.buildAiPrivateRevealContext(playerId))
      if (!result.ok) {
        return result
      }

      resourceState.items[plan.actionId] = remain - 1
      return result
    }

    return { ok: false, revealed: 0, message: "未知AI行动类型。" }
  },

  async processAiIntelActions() {
    const aiPlayers = this.players.filter((player) => !player.isHuman)
    const roundProgress = GAME_SETTINGS.maxRounds <= 1 ? 1 : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1)

    this.aiRoundEffects = {}
    this.lastAiIntelActions = []

    if (!this.aiErrorCorrectionHistory) {
      this.aiErrorCorrectionHistory = {}
    }

    const batchStartTime = Date.now()
    const batchId = `intel-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
    console.log(
      `[processAiIntelActions] ${batchId} START, aiPlayers: ${aiPlayers.length}, players: ${aiPlayers.map((p) => p.id).join(",")}`
    )

    return Promise.all(
      aiPlayers.map(async (player) => {
        try {
          await this.processSingleAiIntelAction(player, undefined, undefined, roundProgress, batchId, batchStartTime)
        } catch (error) {
          console.error(`[processSingleAiIntelAction] ${player.id} error:`, error)
        } finally {
          this.setPlayerBidReady(player.id, true)
          this.updateHud()

          if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused) {
            if (this.areAllPlayersBidReady()) {
              this.resolveRoundBids("all-ready")
            }
          }

          if (this.isLanMode && this.lanIsHost && this.lanBridge) {
            const readyAiPlayers = aiPlayers.filter((p) => this.roundBidReadyState[p.id])
            if (readyAiPlayers.length === aiPlayers.length) {
              this.lanBridge.send({
                type: "lan:ai-bids-ready",
                aiPlayerIds: this.lanAiPlayers.map((ai) => ai.id)
              })
            }
          }
        }
      })
    )
      .then(() => {
        const batchEndTime = Date.now()
        console.log(`[processAiIntelActions] ${batchId} END, total elapsed: ${batchEndTime - batchStartTime}ms`)

        if (this.lastAiIntelActions.length > 0) {
          const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
          this.writeLog(`他人情报行动：${text}`)
        }
      })
      .catch((error) => {
        console.error(`[processAiIntelActions] ${batchId} error:`, error)
      })
  },

  async processSingleAiIntelAction(player: Player, plan?: IntelActionPlan, llmPlan?: LlmPlanResult | null, roundProgress?: number, batchId?: string, batchStartTime?: number) {
    const startTime = Date.now()
    console.log(
      `[processSingleAiIntelAction] ${player.id}-${startTime} START, delay from batch start: ${startTime - (batchStartTime || 0)}ms`
    )
    console.log(
      `[processSingleAiIntelAction] ${player.id} plan:`,
      plan
        ? {
          actionType: plan.actionType,
          actionId: plan.actionId,
          decisionSource: plan.decisionSource,
          lockedByLlm: plan.lockedByLlm
        }
        : "null"
    )
    console.log(
      `[processSingleAiIntelAction] ${player.id} llmPlan:`,
      llmPlan
        ? {
          failed: llmPlan.failed,
          hasBidDecision: llmPlan.hasBidDecision,
          bid: llmPlan.bid,
          actionId: llmPlan.actionId
        }
        : "null"
    )

    if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed()
    const intelSummary = this.getAiIntelSummary(player.id)
    const resources = this.getAiResourceSnapshot(player.id)
    const llmBidReady = Boolean(
      llmPlan && !llmPlan.failed && llmPlan.hasBidDecision && this.canUseLlmDecisionForPlayer(player.id)
    )
    console.log(`[processSingleAiIntelAction] ${player.id} llmBidReady: ${llmBidReady}`)

    if (llmBidReady) {
      this.llmEverUsedThisRun = true
    }

    if (!plan) {
      plan = this.aiEngine.planIntelAction({
        playerId: player.id,
        round: this.round,
        maxRounds: GAME_SETTINGS.maxRounds,
        intelSummary,
        resources
      }) as IntelActionPlan
    }

    const activePlan = plan as IntelActionPlan
    const result = this.executeAiIntelAction(player.id, activePlan)
    console.log(`[processSingleAiIntelAction] ${player.id} executeAiIntelAction result:`, {
      ok: result.ok,
      actionType: activePlan.actionType,
      actionId: activePlan.actionId,
      message: result.message
    })
    const effectiveActionType = result.ok ? activePlan.actionType : "none"
    const effectiveActionId = result.ok ? activePlan.actionId : "none"
    const effect = this.aiEngine.buildToolEffect({
      playerId: player.id,
      actionType: effectiveActionType,
      actionId: effectiveActionId,
      roundProgress: roundProgress || 0,
      intelSummary: this.getAiIntelSummary(player.id),
      signalStats: result.ok ? result.signalStats : null,
      planScore: activePlan.score || 0
    })

    this.aiRoundEffects[player.id] = effect

    if (!result.ok && activePlan.actionType !== "none" && llmBidReady && this.canUseLlmDecisionForPlayer(player.id)) {
      const activeLlmPlan = llmPlan as LlmPlan
      const correctionHistory = this.aiErrorCorrectionHistory[player.id] || []
      const errorDetail = result.message || "未知错误"

      this.writeLog(`[AI纠错] ${player.name} 工具执行失败: ${errorDetail}`)

      if (!this.currentRunLog) {
        this.currentRunLog = { runNo: 0, startedAt: Date.now(), aiThoughtLogs: [], actionLogs: [], roundLogsByRound: {}, roundPanelTexts: {} }
      }
      const errorLogEntry = {
        round: this.round,
        playerName: player.name,
        thought: `[工具报错] 错误: ${errorDetail}\n原始决策: skill=${activePlan.actionType === "skill" ? activePlan.actionId : "无"}, item=${activePlan.actionType === "item" ? activePlan.actionId : "无"}`,
        controlMode: "error-correction",
        error: errorDetail,
        at: Date.now()
      }
      this.currentRunLog?.aiThoughtLogs?.push(errorLogEntry)

      const correctionPlan = await this.requestAiLlmErrorCorrection(
        player,
        activeLlmPlan,
        errorDetail,
        correctionHistory,
        this.getAiConversationMessages ? this.getAiConversationMessages(player.id) : []
      )

      if (!this.aiErrorCorrectionHistory[player.id]) {
        this.aiErrorCorrectionHistory[player.id] = []
      }
      this.aiErrorCorrectionHistory[player.id].push({
        error: errorDetail,
        aiResponse:
          correctionPlan && !correctionPlan.failed ? `出价${correctionPlan.bid}` : (correctionPlan?.error || "失败"),
        at: Date.now()
      })

      if (correctionPlan && !correctionPlan.failed && correctionPlan.hasBidDecision) {
        const correctionResult = this.executeAiIntelAction(player.id, {
          actionType: correctionPlan.actionType,
          actionId: correctionPlan.actionId,
          expectedReveal: 0,
          score: 1,
          candidates: [],
          decisionSource: "llm-correction",
          lockedByLlm: true
        })

        if (correctionResult.ok && llmPlan) {
          llmPlan.bid = correctionPlan.bid
          llmPlan.hasBidDecision = true
          llmPlan.actionType = correctionPlan.actionType
          llmPlan.actionId = correctionPlan.actionId
          llmPlan.thought = correctionPlan.thought || llmPlan.thought
          llmPlan.controlMode = "llm-corrected"
          llmPlan.correctionAttempt = correctionPlan.correctionAttempt
          llmPlan.originalError = errorDetail
          llmPlan.errorCorrectionPrompt = correctionPlan.userPrompt || ""
          llmPlan.errorCorrectionResponse = correctionPlan.modelResponse || ""

          const correctionLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[纠错成功] 纠错次数: ${correctionPlan.correctionAttempt}/2\n新出价: ${correctionPlan.bid}\n思考: ${correctionPlan.thought || "无"}`,
            controlMode: "llm-corrected",
            correctionAttempt: correctionPlan.correctionAttempt,
            at: Date.now()
          }
          this.currentRunLog?.aiThoughtLogs?.push(correctionLogEntry)

          if (correctionPlan.actionType !== "none" && correctionPlan.actionId !== "none") {
            this.recordPlayerUsage(player.id, correctionPlan.actionId)
            const correctionToolSummary = this.buildAiToolResultSummary(
              correctionResult,
              correctionPlan.actionType,
              correctionPlan.actionId
            )
            llmPlan.toolResultSummary = correctionToolSummary
            llmPlan.toolActionType = correctionPlan.actionType
            llmPlan.toolActionId = correctionPlan.actionId

            const actionDef = this.getActionDefById(correctionPlan.actionId)
            this.addPublicInfoEntry({
              source: `${player.name}-${actionDef.name}(纠错)`,
              text: actionDef.description
            })

            if (this.isLanMode && this.lanIsHost && this.lanBridge) {
              this.lanBridge.send({
                type: "lan:ai-item-use",
                aiPlayerId: player.lanId || player.id,
                aiPlayerName: player.name,
                actionId: correctionPlan.actionId,
                actionType: correctionPlan.actionType,
                itemName: actionDef.name,
                itemDesc: actionDef.description
              })
            }

            if (this.canUseLlmDecisionForPlayer(player.id)) {
              console.log(`[processSingleAiIntelAction] ${player.id} calling correction followup LLM (tool executed)`)
              const followup = await this.requestAiLlmFollowupBid(player, llmPlan, correctionToolSummary)
              console.log(
                `[processSingleAiIntelAction] ${player.id} correction followup result:`,
                followup
                  ? {
                    ok: followup.ok,
                    failed: followup.failed,
                    hasBidDecision: followup.hasBidDecision,
                    bid: followup.bid
                  }
                  : "null"
              )
              if (followup && !followup.failed && followup.hasBidDecision) {
                llmPlan.bid = followup.bid
                llmPlan.hasBidDecision = true
                llmPlan.thought = followup.thought || llmPlan.thought
                llmPlan.followupPrompt = followup.userPrompt || ""
                llmPlan.followupResponse = followup.modelResponse || ""
                llmPlan.followupElapsedMs = followup.elapsedMs || 0
                llmPlan.followupActionRejected = followup.followupActionRejected || ""
              } else if (followup && followup.failed) {
                llmPlan.followupError = followup.error || "二次请求失败"
                llmPlan.followupPrompt = followup.userPrompt || ""
                llmPlan.followupResponse = followup.modelResponse || ""
                llmPlan.controlMode = "rule-fallback-after-llm-tool"
                if (!llmPlan.error) {
                  llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
                }
              }
            }
          } else {
            console.log(`[processSingleAiIntelAction] ${player.id} calling correction followup LLM (no tool action)`)
            const followup = await this.requestAiLlmFollowupBid(player, llmPlan, "工具执行失败，直接给出价")
            if (followup && !followup.failed && followup.hasBidDecision) {
              llmPlan.bid = followup.bid
              llmPlan.hasBidDecision = true
              llmPlan.thought = followup.thought || llmPlan.thought
              llmPlan.followupPrompt = followup.userPrompt || ""
              llmPlan.followupResponse = followup.modelResponse || ""
              llmPlan.followupElapsedMs = followup.elapsedMs || 0
              llmPlan.followupActionRejected = followup.followupActionRejected || ""
            } else if (followup && followup.failed) {
              llmPlan.followupError = followup.error || "二次请求失败"
              llmPlan.followupPrompt = followup.userPrompt || ""
              llmPlan.followupResponse = followup.modelResponse || ""
              llmPlan.controlMode = "rule-fallback-after-llm-tool"
              if (!llmPlan.error) {
                llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
              }
            }
          }
        } else {
          const failLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[纠错后执行失败] ${correctionResult.message || "未知错误"}`,
            controlMode: "rule-fallback-after-correction",
            error: correctionResult.message,
            at: Date.now()
          }
          this.currentRunLog?.aiThoughtLogs?.push(failLogEntry)
          if (llmPlan) {
            llmPlan.controlMode = "rule-fallback-after-correction"
            if (!llmPlan.error) {
              llmPlan.error = `纠错后执行失败: ${correctionResult.message || "未知"}`
            }
          }
        }
      } else {
        const skipLogEntry = {
          round: this.round,
          playerName: player.name,
          thought: `[纠错跳过] ${correctionPlan ? correctionPlan.error || "已达最大纠错次数" : "纠错请求失败"}`,
          controlMode: "rule-fallback-correction-skipped",
          error: correctionPlan ? correctionPlan.error : "纠错请求失败",
          at: Date.now()
        }
        this.currentRunLog?.aiThoughtLogs?.push(skipLogEntry)
        if (llmPlan) {
          llmPlan.controlMode = "rule-fallback-correction-skipped"
          if (!llmPlan.error) {
            llmPlan.error = correctionPlan ? `纠错跳过: ${correctionPlan.error || "已达最大纠错次数"}` : "纠错请求失败"
          }
        }
      }
      console.log(
        `[processSingleAiIntelAction] ${player.id}-${startTime} END (error correction path), elapsed: ${Date.now() - startTime}ms`
      )
      return
    }

    if (!result.ok || activePlan.actionType === "none") {
      console.log(
        `[processSingleAiIntelAction] ${player.id}-${startTime} END (no action), elapsed: ${Date.now() - startTime}ms`
      )
      return
    }

    this.recordPlayerUsage(player.id, activePlan.actionId)
    const toolSummary = this.buildAiToolResultSummary(result, activePlan.actionType, activePlan.actionId)
    this.lastAiIntelActions.push({
      playerId: player.id,
      playerName: player.name,
      actionType: activePlan.actionType,
      actionId: activePlan.actionId,
      revealed: result.revealed,
      detail: toolSummary,
      score: activePlan.score || 0,
      effectTag: effect.tag || "",
      signalStats: result.signalStats ? result.signalStats.aggregate : null
    })

    const actionDef = this.getActionDefById(activePlan.actionId)
    this.addPublicInfoEntry({
      source: `${player.name}-${actionDef.name}`,
      text: actionDef.description
    })

    if (this.isLanMode && this.lanIsHost && this.lanBridge) {
      this.lanBridge.send({
        type: "lan:ai-item-use",
        aiPlayerId: player.lanId || player.id,
        aiPlayerName: player.name,
        actionId: activePlan.actionId,
        actionType: activePlan.actionType,
        itemName: actionDef.name,
        itemDesc: actionDef.description
      })
    }

    if (llmBidReady && llmPlan && llmPlan.actionId === activePlan.actionId) {
      llmPlan.actionExecuted = true
      llmPlan.toolResultSummary = toolSummary
      llmPlan.toolActionType = activePlan.actionType
      llmPlan.toolActionId = activePlan.actionId
      llmPlan.controlMode = "llm"

      if (this.canUseLlmDecisionForPlayer(player.id)) {
        console.log(`[processSingleAiIntelAction] ${player.id} calling followup LLM, canUseLlmDecision=true`)
        const followup = await this.requestAiLlmFollowupBid(player, llmPlan, toolSummary)
        console.log(
          `[processSingleAiIntelAction] ${player.id} followup result:`,
          followup
            ? { ok: followup.ok, failed: followup.failed, hasBidDecision: followup.hasBidDecision, bid: followup.bid }
            : "null"
        )
        if (followup && !followup.failed && followup.hasBidDecision) {
          llmPlan.bid = followup.bid
          llmPlan.hasBidDecision = true
          llmPlan.thought = followup.thought || llmPlan.thought
          llmPlan.followupPrompt = followup.userPrompt || ""
          llmPlan.followupResponse = followup.modelResponse || ""
          llmPlan.followupElapsedMs = followup.elapsedMs || 0
          llmPlan.followupActionRejected = followup.followupActionRejected || ""
        } else if (followup && followup.failed) {
          llmPlan.followupError = followup.error || "二次请求失败"
          llmPlan.followupPrompt = followup.userPrompt || ""
          llmPlan.followupResponse = followup.modelResponse || ""
          llmPlan.controlMode = "rule-fallback-after-llm-tool"
          if (!llmPlan.error) {
            llmPlan.error = `工具执行后二次请求失败: ${followup.error || "未知"}`
          }
        }
      }
    } else if (!llmBidReady) {
      if (llmPlan && llmPlan.failed) {
        llmPlan.controlMode = "rule-fallback-llm-failed"
        if (!llmPlan.error) {
          llmPlan.error = llmPlan.error || "LLM请求失败"
        }
      } else if (llmPlan && !llmPlan.hasBidDecision) {
        llmPlan.controlMode = "rule-fallback-llm-invalid"
        if (!llmPlan.error) {
          llmPlan.error = "LLM返回无效决策(无出价)"
        }
      }
    }

    console.log(`[processSingleAiIntelAction] ${player.id}-${startTime} END, elapsed: ${Date.now() - startTime}ms`)
  },

  /**
   * 格式化AI情报动作为公开日志行（显示在公共信息面板）
   * @param {Object} entry - 动作记录 { playerName, actionId, actionType, revealed, signalStats, effectTag, detail }
   * @returns {string} 格式化的日志文本
   */
  formatAiIntelActionPublicLine(entry: { playerName: string; actionId: string; revealed: number; signalStats: AiSignalStats | null; effectTag: string; detail: string }) {
    const info = this.getItemInfo(entry.actionId)
    const revealText = entry.revealed > 0 ? `私有线索+${entry.revealed}` : "未命中"
    const stats = entry.signalStats
    const statsText =
      stats && stats.count > 0
        ? `，候选均值${formatCompactNumber(stats.mean)}，波动${(stats.spreadRatio * 100).toFixed(0)}%`
        : ""
    const tag = entry.effectTag ? `，${entry.effectTag}` : ""
    const detail = entry.detail ? `，结果:${compactOneLine(entry.detail, 100)}` : ""
    return `${entry.playerName} 使用${info?.label || "未知"}（${revealText}${statsText}${tag}${detail}）`
  },

  /**
   * 检查当前是否可以使用情报动作（技能/道具）
   * 已结算、回合结算中、暂停、超时、已提交出价时均不可使用
   * @returns {boolean}
   */
  canUseIntelActions() {
    if (this.settled || this.roundResolving) {
      return false
    }

    if (this.roundPaused) {
      this.writeLog("当前处于暂停状态，请先继续回合后再操作。")
      return false
    }

    if (this.roundTimeLeft <= 0) {
      this.writeLog("本回合已超时，无法再使用技能或道具。")
      return false
    }

    if (this.playerBidSubmitted) {
      this.writeLog("你已提交本轮出价，无法继续使用技能或道具。")
      return false
    }

    return true
  }
}
