(function setupMobaoAiIntel(global) {
  const { createEmptyAiPrivateIntelPool, clamp, formatTrackIndex, shuffle, formatCompactNumber, compactOneLine, toCellKey, fromCellKey, sizeTagToCellCount } = global.MobaoUtils;
  const { SKILL_DEFS } = global.SkillSystem;
  const { ITEM_DEFS } = global.ItemSystem;
  const { GAME_SETTINGS } = global.MobaoSettings;
  const { QUALITY_CONFIG, toSizeTag } = global.ArtifactData;

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
    },

    getAiIntelSummary(playerId) {
      const pool = this.ensureAiPrivateIntel(playerId);
      const total = Math.max(1, this.items.length);
      const outlineCount = pool.outlineSignals.length;
      const qualityCount = pool.qualitySignals.length;
      const clueCount = outlineCount + qualityCount;
      const clueRate = clamp((outlineCount * 0.65 + qualityCount) / total, 0, 1);
      const qualityRate = clamp(qualityCount / total, 0, 1);

      if (!pool.aggregateStats) {
        const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory);
        pool.aggregateStats = totalStats.aggregate;
      }

      const aggregateStats = pool.aggregateStats || {
        mean: 0,
        spreadRatio: 0,
        upperEdge: 0,
        lowerEdge: 0,
        std: 0,
        iqr: 0,
        count: 0
      };

      const edgeBias = Math.max(0, aggregateStats.upperEdge - aggregateStats.lowerEdge);
      const uncertainty = clamp(
        0.88 - clueRate * 0.48 - qualityRate * 0.2 + aggregateStats.spreadRatio * 0.35 - edgeBias * 0.08,
        0.05,
        1
      );

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
      };
    },

    buildAiIntelSnapshot() {
      const map = {};
      this.players
        .filter((player) => !player.isHuman)
        .forEach((player) => {
          map[player.id] = this.getAiIntelSummary(player.id);
        });
      return map;
    },

    getAiResourceSnapshot(playerId) {
      const resourceState = this.aiResourceState[playerId];
      if (!resourceState) {
        return {
          skills: {},
          items: {}
        };
      }

      return {
        skills: { ...resourceState.skills },
        items: { ...resourceState.items }
      };
    },

    buildAiPrivateRevealContext(playerId) {
      return {
        revealOutline: ({ count, category, allowCategoryFallback = false }) =>
          this.revealPrivateIntelBatch(playerId, "outline", count, category, allowCategoryFallback),
        revealQuality: ({ count, category, allowCategoryFallback = false }) =>
          this.revealPrivateIntelBatch(playerId, "quality", count, category, allowCategoryFallback)
      };
    },

    pickRandomItemCell(item) {
      const cells = [];
      for (let y = item.y; y < item.y + item.h; y += 1) {
        for (let x = item.x; x < item.x + item.w; x += 1) {
          cells.push({ x, y });
        }
      }
      return cells.length > 0 ? cells[Math.floor(Math.random() * cells.length)] : null;
    },

    markAiKnownCellState(playerId, x, y, state) {
      const pool = this.ensureAiPrivateIntel(playerId);
      const key = toCellKey(x, y);
      pool.knownCellStates[key] = state || "empty";
    },

    scanNeighborIntelAroundCell(playerId, x, y) {
      const offsets = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
      ];

      offsets.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.isInBoundsCell(nx, ny)) {
          return;
        }
        const state = this.isWarehouseCellOccupied(nx, ny) ? "occupied" : "empty";
        this.markAiKnownCellState(playerId, nx, ny, state);
      });
    },

    buildAiPrivateSignal(playerId, item, mode) {
      const cell = this.pickRandomItemCell(item);
      const baseSignal = {
        itemId: item.id,
        round: this.round,
        mode
      };

      if (mode === "outline") {
        Object.assign(baseSignal, {
          category: item.category,
          sizeTag: toSizeTag(item.w, item.h),
          sampleCell: cell
        });

        if (cell) {
          this.markAiKnownCellState(playerId, cell.x, cell.y, "occupied");
          this.scanNeighborIntelAroundCell(playerId, cell.x, cell.y);
        }
      } else {
        Object.assign(baseSignal, {
          qualityKey: item.qualityKey,
          sampleCell: cell
        });

        if (cell) {
          this.markAiKnownCellState(playerId, cell.x, cell.y, "occupied");
          this.scanNeighborIntelAroundCell(playerId, cell.x, cell.y);
        }
      }

      return baseSignal;
    },

    ensureAiItemKnowledge(playerId, itemId) {
      const pool = this.ensureAiPrivateIntel(playerId);
      if (!pool.itemKnowledge[itemId]) {
        pool.itemKnowledge[itemId] = {
          revealCount: 0,
          lastSeenRound: 0,
          category: null,
          qualityKey: null,
          sizeTag: null,
          knownCells: new Set()
        };
      }
      return pool.itemKnowledge[itemId];
    },

    getHighValuePriceThreshold() {
      if (Number.isFinite(this.highValuePriceThreshold) && this.highValuePriceThreshold > 0) {
        return this.highValuePriceThreshold;
      }

      const prices = ARTIFACT_LIBRARY
        .map((entry) => Number(entry.basePrice) || 0)
        .filter((value) => value > 0)
        .sort((a, b) => a - b);

      if (prices.length === 0) {
        this.highValuePriceThreshold = 6000;
        return this.highValuePriceThreshold;
      }

      const idx = Math.floor((prices.length - 1) * 0.8);
      const p80 = prices[idx] || prices[prices.length - 1];
      this.highValuePriceThreshold = Math.max(5200, Math.round(p80));
      return this.highValuePriceThreshold;
    },

    isHighValueArtifact(item) {
      const threshold = this.getHighValuePriceThreshold();
      return item.qualityKey === "legendary" || (Number(item.basePrice) || 0) >= threshold;
    },

    ensureAiHighValueTrack(playerId, item) {
      if (!this.isHighValueArtifact(item)) {
        return null;
      }

      const pool = this.ensureAiPrivateIntel(playerId);
      let trackId = pool.highValueTrackByItemId[item.id];
      if (!trackId) {
        trackId = `红${formatTrackIndex(pool.nextTrackIndex)}`;
        pool.nextTrackIndex += 1;
        pool.highValueTrackByItemId[item.id] = trackId;
        pool.highValueTracks.push({
          trackId,
          itemId: item.id,
          createdRound: this.round,
          lastSeenRound: this.round
        });
        return { trackId, created: true };
      }

      const track = pool.highValueTracks.find((entry) => entry.itemId === item.id);
      if (track) {
        track.lastSeenRound = this.round;
      }
      return { trackId, created: false };
    },

    updateAiItemKnowledge(playerId, item, signal, mode) {
      const intel = this.ensureAiItemKnowledge(playerId, item.id);
      intel.revealCount += 1;
      intel.lastSeenRound = this.round;

      if (mode === "outline") {
        intel.category = item.category;
        intel.sizeTag = toSizeTag(item.w, item.h);
      } else if (mode === "quality") {
        intel.qualityKey = item.qualityKey;
      }

      if (signal && signal.sampleCell) {
        intel.knownCells.add(toCellKey(signal.sampleCell.x, signal.sampleCell.y));
      }

      const pool = this.ensureAiPrivateIntel(playerId);
      const trackId = pool.highValueTrackByItemId[item.id];
      if (trackId) {
        const track = pool.highValueTracks.find((entry) => entry.itemId === item.id);
        if (track) {
          track.lastSeenRound = this.round;
          const revealState = {
            qualityKey: intel.qualityKey,
            category: intel.category,
            sizeTag: intel.sizeTag
          };
          const candidatePreview = this.buildTrackCandidatePreview(revealState);
          const exactKnown = candidatePreview.total === 1;
          const revealLevel = exactKnown
            ? "已完全确定"
            : (intel.qualityKey && intel.category)
              ? "范围缩小"
              : (intel.qualityKey)
                ? "仅知品质"
                : (intel.category)
                  ? "已知品类"
                  : "仅知轮廓";

          return {
            ...intel,
            trackUpdate: {
              trackId,
              revealLevel,
              confirmed: {
                quality: intel.qualityKey
                  ? (QUALITY_CONFIG[intel.qualityKey] ? QUALITY_CONFIG[intel.qualityKey].label : intel.qualityKey)
                  : "未知",
                category: intel.category ? intel.category : "未知",
                exactArtifact: exactKnown && candidatePreview.list[0]
                  ? candidatePreview.list[0].name
                  : null
              },
              candidates: {
                total: candidatePreview.total,
                truncated: candidatePreview.truncated
              }
            }
          };
        }
      }

      return intel;
    },

    revealPrivateIntelBatch(playerId, mode, count, category, allowCategoryFallback = false) {
      const targets = this.pickPrivateRevealTargets({
        playerId,
        mode,
        count,
        category,
        allowCategoryFallback
      });

      if (targets.length === 0) {
        return { ok: false, revealed: 0, message: "没有可揭示目标。" };
      }

      const pool = this.ensureAiPrivateIntel(playerId);
      const signals = [];
      const trackUpdates = [];

      targets.forEach((item) => {
        const signal = this.buildAiPrivateSignal(playerId, item, mode);
        if (mode === "outline") {
          pool.knownOutlineIds.add(item.id);
          pool.outlineSignals.push(signal);
        } else {
          pool.knownQualityIds.add(item.id);
          pool.qualitySignals.push(signal);
          const trackUpdate = this.ensureAiHighValueTrack(playerId, item);
          if (trackUpdate) {
            trackUpdates.push(trackUpdate);
          }
        }

        const knowledgeUpdate = this.updateAiItemKnowledge(playerId, item, signal, mode);
        if (knowledgeUpdate.trackUpdate) {
          trackUpdates.push(knowledgeUpdate.trackUpdate);
        }

        signals.push(signal);
      });

      pool.signalHistory.push(...signals);
      if (pool.signalHistory.length > 160) {
        pool.signalHistory = pool.signalHistory.slice(-160);
      }

      const signalStats = this.artifactManager.getSignalPriceStats(signals);
      const totalStats = this.artifactManager.getSignalPriceStats(pool.signalHistory);
      pool.latestSignalStats = signalStats;
      pool.aggregateStats = totalStats.aggregate;
      const bottomCell = mode === "outline" ? this.pickBottomCellFromTargets(targets) : null;

      return {
        ok: true,
        revealed: targets.length,
        signals,
        signalStats,
        trackUpdates,
        bottomCell
      };
    },

    pickPrivateRevealTargets({ playerId, mode, count, category, allowCategoryFallback = false }) {
      const pool = this.ensureAiPrivateIntel(playerId);
      const knownSet = mode === "outline" ? pool.knownOutlineIds : pool.knownQualityIds;

      const isUnknown = (item) => {
        return !knownSet.has(item.id);
      };

      const primary = this.items.filter((item) => {
        if (category && item.category !== category) {
          return false;
        }
        return isUnknown(item);
      });

      let selected = shuffle(primary).slice(0, count);
      if (selected.length < count && allowCategoryFallback && category) {
        const existed = new Set(selected.map((item) => item.id));
        const fallback = this.items.filter((item) => !existed.has(item.id) && isUnknown(item));
        selected = selected.concat(shuffle(fallback).slice(0, count - selected.length));
      }

      return selected;
    },

    getPlayerById(playerId) {
      return this.players.find((entry) => entry.id === playerId) || null;
    },

    getAiNeighborStateLabel(playerId, x, y) {
      if (!this.isInBoundsCell(x, y)) {
        return "越界";
      }

      const pool = this.ensureAiPrivateIntel(playerId);
      const key = toCellKey(x, y);
      const raw = pool.knownCellStates[key];
      if (raw === "occupied") {
        return "已被占用";
      }
      if (raw === "empty") {
        return "确认空闲";
      }
      return "尚未探明";
    },

    buildNeighborSnapshot(playerId, cell) {
      if (!cell) {
        return null;
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
      };
    },

    buildAiAggregateIntelBlock(playerId) {
      const pool = this.ensureAiPrivateIntel(playerId);
      const qualityMap = {};
      const categoryMap = {};

      pool.qualitySignals.forEach((signal) => {
        if (!signal || !signal.qualityKey) {
          return;
        }
        const key = signal.qualityKey;
        if (!qualityMap[key]) {
          qualityMap[key] = {
            qualityKey: key,
            qualityLabel: QUALITY_CONFIG[key] ? QUALITY_CONFIG[key].label : key,
            count: 0,
            deepestRow: 0,
            estimatedCellCount: 0,
            estimatedCellSamples: 0
          };
        }
        qualityMap[key].count += 1;
        if (signal.sampleCell && Number.isFinite(signal.sampleCell.y)) {
          qualityMap[key].deepestRow = Math.max(qualityMap[key].deepestRow, signal.sampleCell.y + 1);
        }
        const knowledge = pool.itemKnowledge[signal.itemId];
        const sizeCells = knowledge ? sizeTagToCellCount(knowledge.sizeTag) : null;
        if (Number.isFinite(sizeCells) && sizeCells > 0) {
          qualityMap[key].estimatedCellCount += sizeCells;
          qualityMap[key].estimatedCellSamples += 1;
        }
      });

      pool.outlineSignals.forEach((signal) => {
        if (!signal || !signal.category) {
          return;
        }
        const key = signal.category;
        if (!categoryMap[key]) {
          categoryMap[key] = {
            category: key,
            count: 0,
            highQualityCount: 0,
            knownQualityCount: 0
          };
        }
        categoryMap[key].count += 1;
        const knowledge = pool.itemKnowledge[signal.itemId];
        if (knowledge && knowledge.qualityKey) {
          categoryMap[key].knownQualityCount += 1;
          if (knowledge.qualityKey === "rare" || knowledge.qualityKey === "legendary") {
            categoryMap[key].highQualityCount += 1;
          }
        }
      });

      const byQuality = Object.values(qualityMap)
        .sort((a, b) => b.count - a.count)
        .map((entry) => ({
          quality: entry.qualityLabel,
          count: entry.count,
          deepestRow: entry.deepestRow || null,
          estimatedOccupiedCells: entry.estimatedCellSamples > 0
            ? Math.round(entry.estimatedCellCount / entry.estimatedCellSamples)
            : null
        }));

      const byCategory = Object.values(categoryMap)
        .sort((a, b) => b.count - a.count)
        .map((entry) => ({
          category: entry.category,
          count: entry.count,
          qualityHint: entry.knownQualityCount > 0
            ? `已知品质中高品质 ${entry.highQualityCount}/${entry.knownQualityCount}`
            : "暂无品质细分"
        }));

      return {
        byQuality,
        byCategory,
        signalCount: pool.signalHistory.length
      };
    },

    buildTrackCandidatePreview(revealState) {
      let candidates = this.artifactManager.getCandidatesByRevealState(revealState);
      if (!candidates || candidates.length === 0) {
        const threshold = this.getHighValuePriceThreshold();
        candidates = ARTIFACT_LIBRARY
          .filter((entry) => entry.qualityKey === "legendary" || entry.basePrice >= threshold)
          .map((entry) => ({
            ...entry,
            expectedPrice: entry.basePrice,
            previewSizeTag: toSizeTag(entry.w, entry.h)
          }));
      }

      const sorted = [...candidates].sort((a, b) => (b.expectedPrice || b.basePrice || 0) - (a.expectedPrice || a.basePrice || 0));
      if (sorted.length <= 10) {
        return {
          total: sorted.length,
          truncated: false,
          list: sorted
        };
      }

      const first = sorted.slice(0, 5);
      const tail = sorted.slice(-5);
      return {
        total: sorted.length,
        truncated: true,
        list: first.concat(tail)
      };
    },

    buildAiHighValueTrackBlock(playerId) {
      const pool = this.ensureAiPrivateIntel(playerId);
      const tracks = pool.highValueTracks || [];

      return tracks.map((track) => {
        const item = this.items.find((entry) => entry.id === track.itemId);
        const knowledge = pool.itemKnowledge[track.itemId] || null;
        const knownCells = knowledge && knowledge.knownCells
          ? [...knowledge.knownCells].map((cellKey) => fromCellKey(cellKey)).filter(Boolean)
          : [];
        const anchorCell = knownCells[0] || null;

        const revealState = {
          qualityKey: knowledge && knowledge.qualityKey ? knowledge.qualityKey : null,
          category: knowledge && knowledge.category ? knowledge.category : null,
          sizeTag: knowledge && knowledge.sizeTag ? knowledge.sizeTag : null
        };
        const candidatePreview = this.buildTrackCandidatePreview(revealState);
        const exactKnown = candidatePreview.total === 1;
        const revealLevel = exactKnown
          ? "已完全确定"
          : (knowledge && knowledge.qualityKey && knowledge.category)
            ? "范围缩小"
            : (knowledge && knowledge.qualityKey)
              ? "仅知品质"
              : (knowledge && knowledge.category)
                ? "已知品类"
                : "仅知轮廓";

        return {
          trackId: track.trackId,
          revealLevel,
          confirmed: {
            quality: knowledge && knowledge.qualityKey
              ? (QUALITY_CONFIG[knowledge.qualityKey] ? QUALITY_CONFIG[knowledge.qualityKey].label : knowledge.qualityKey)
              : "未知",
            category: knowledge && knowledge.category ? knowledge.category : "未知",
            exactArtifact: exactKnown && candidatePreview.list[0]
              ? candidatePreview.list[0].name
              : null
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
              sizeCells: (entry.w && entry.h) ? entry.w * entry.h : sizeTagToCellCount(entry.previewSizeTag)
            }))
          },
          spatial: {
            knownCells: knownCells.map((cell) => ({ row: cell.y + 1, col: cell.x + 1 })),
            neighborState: this.buildNeighborSnapshot(playerId, anchorCell)
          },
          internalRef: item ? item.id : track.itemId
        };
      });
    },

    buildAiPrivateIntelBlock(playerId) {
      return {
        aggregate: this.buildAiAggregateIntelBlock(playerId),
        highValueTracks: this.buildAiHighValueTrackBlock(playerId)
      };
    },

    getAiAvailableActionState(playerId) {
      const resource = this.getAiResourceSnapshot(playerId);
      const availableSkillIds = SKILL_DEFS
        .filter((entry) => Number(resource.skills[entry.id] || 0) > 0)
        .map((entry) => entry.id);
      const availableItemIds = ITEM_DEFS
        .filter((entry) => Number(resource.items[entry.id] || 0) > 0)
        .map((entry) => entry.id);

      return {
        availableSkillIds,
        availableItemIds,
        availableSkillNames: SKILL_DEFS
          .filter((entry) => availableSkillIds.includes(entry.id))
          .map((entry) => entry.name),
        availableItemNames: ITEM_DEFS
          .filter((entry) => availableItemIds.includes(entry.id))
          .map((entry) => entry.name)
      };
    },

    buildAiActionConstraintBlock(playerId) {
      const actionState = this.getAiAvailableActionState(playerId);
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
      };
    },

    executeAiIntelAction(playerId, plan) {
      const resourceState = this.aiResourceState[playerId];
      if (!resourceState || !plan || plan.actionType === "none") {
        return { ok: false, revealed: 0, message: "未执行AI情报行动。" };
      }

      const usedThisRound = this.currentRoundUsage[playerId] || [];
      if (usedThisRound.length > 0) {
        return { ok: false, revealed: 0, message: "本回合已使用过技能或道具。" };
      }

      if (plan.actionType === "skill") {
        const remain = Number(resourceState.skills[plan.actionId] || 0);
        if (remain <= 0) {
          return { ok: false, revealed: 0, message: "AI技能次数不足。" };
        }

        const skill = SKILL_DEFS.find((entry) => entry.id === plan.actionId);
        if (!skill) {
          return { ok: false, revealed: 0, message: "AI技能不存在。" };
        }

        const result = skill.execute(this.buildAiPrivateRevealContext(playerId));
        if (!result.ok) {
          return result;
        }

        resourceState.skills[plan.actionId] = remain - 1;
        return result;
      }

      if (plan.actionType === "item") {
        const remain = Number(resourceState.items[plan.actionId] || 0);
        if (remain <= 0) {
          return { ok: false, revealed: 0, message: "AI道具库存不足。" };
        }

        const item = ITEM_DEFS.find((entry) => entry.id === plan.actionId);
        if (!item) {
          return { ok: false, revealed: 0, message: "AI道具不存在。" };
        }

        const result = item.execute(this.buildAiPrivateRevealContext(playerId));
        if (!result.ok) {
          return result;
        }

        resourceState.items[plan.actionId] = remain - 1;
        return result;
      }

      return { ok: false, revealed: 0, message: "未知AI行动类型。" };
    },

    async processAiIntelActions() {
      const aiPlayers = this.players.filter((player) => !player.isHuman);
      const roundProgress = GAME_SETTINGS.maxRounds <= 1
        ? 1
        : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1);

      this.aiRoundEffects = {};
      this.lastAiIntelActions = [];

      if (!this.aiErrorCorrectionHistory) {
        this.aiErrorCorrectionHistory = {};
      }

      for (const player of aiPlayers) {
        if (!this.isLanMode && this.roundPaused) await this.waitUntilResumed();
        const intelSummary = this.getAiIntelSummary(player.id);
        const resources = this.getAiResourceSnapshot(player.id);
        const llmPlan = this.aiLlmRoundPlans[player.id];
        const llmBidReady = Boolean(
          llmPlan
          && !llmPlan.failed
          && llmPlan.hasBidDecision
          && this.canUseLlmDecisionForPlayer(player.id)
        );

        if (llmBidReady) {
          this.llmEverUsedThisRun = true;
        }

        let plan = null;
        if (llmBidReady) {
          plan = {
            actionType: llmPlan.actionType,
            actionId: llmPlan.actionId,
            expectedReveal: 0,
            score: 1,
            candidates: [],
            decisionSource: "llm",
            lockedByLlm: true
          };
        } else {
          plan = this.aiEngine.planIntelAction({
            playerId: player.id,
            round: this.round,
            maxRounds: GAME_SETTINGS.maxRounds,
            intelSummary,
            resources
          });
        }

        const result = this.executeAiIntelAction(player.id, plan);
        const effectiveActionType = result.ok ? plan.actionType : "none";
        const effectiveActionId = result.ok ? plan.actionId : "none";
        const effect = this.aiEngine.buildToolEffect({
          playerId: player.id,
          actionType: effectiveActionType,
          actionId: effectiveActionId,
          roundProgress,
          intelSummary: this.getAiIntelSummary(player.id),
          signalStats: result.ok ? result.signalStats : null,
          planScore: plan.score || 0
        });

        this.aiRoundEffects[player.id] = effect;

        if (!result.ok && plan.actionType !== "none" && llmBidReady && this.canUseLlmDecisionForPlayer(player.id)) {
          const correctionHistory = this.aiErrorCorrectionHistory[player.id] || [];
          const errorDetail = result.message || "未知错误";

          this.writeLog(`[AI纠错] ${player.name} 工具执行失败: ${errorDetail}`);

          if (!this.currentRunLog) {
            this.currentRunLog = { aiThoughtLogs: [], actionLogs: [] };
          }
          const errorLogEntry = {
            round: this.round,
            playerName: player.name,
            thought: `[工具报错] 错误: ${errorDetail}\n原始决策: skill=${plan.actionType === "skill" ? plan.actionId : "无"}, item=${plan.actionType === "item" ? plan.actionId : "无"}`,
            controlMode: "error-correction",
            error: errorDetail,
            at: Date.now()
          };
          this.currentRunLog.aiThoughtLogs.push(errorLogEntry);

          const correctionPlan = await this.requestAiLlmErrorCorrection(
            player,
            llmPlan,
            errorDetail,
            correctionHistory,
            this.getAiConversationMessages ? this.getAiConversationMessages(player.id) : []
          );

          if (!this.aiErrorCorrectionHistory[player.id]) {
            this.aiErrorCorrectionHistory[player.id] = [];
          }
          this.aiErrorCorrectionHistory[player.id].push({
            error: errorDetail,
            aiResponse: correctionPlan && !correctionPlan.failed ? `出价${correctionPlan.bid}` : correctionPlan.error || "失败",
            at: Date.now()
          });

          if (correctionPlan && !correctionPlan.failed && correctionPlan.hasBidDecision) {
            const correctionResult = this.executeAiIntelAction(player.id, {
              actionType: correctionPlan.actionType,
              actionId: correctionPlan.actionId,
              expectedReveal: 0,
              score: 1,
              candidates: [],
              decisionSource: "llm-correction",
              lockedByLlm: true
            });

            if (correctionResult.ok) {
              llmPlan.bid = correctionPlan.bid;
              llmPlan.hasBidDecision = true;
              llmPlan.actionType = correctionPlan.actionType;
              llmPlan.actionId = correctionPlan.actionId;
              llmPlan.thought = correctionPlan.thought || llmPlan.thought;
              llmPlan.controlMode = "llm-corrected";
              llmPlan.correctionAttempt = correctionPlan.correctionAttempt;
              llmPlan.originalError = errorDetail;
              llmPlan.errorCorrectionPrompt = correctionPlan.userPrompt || "";
              llmPlan.errorCorrectionResponse = correctionPlan.modelResponse || "";

              const correctionLogEntry = {
                round: this.round,
                playerName: player.name,
                thought: `[纠错成功] 纠错次数: ${correctionPlan.correctionAttempt}/2\n新出价: ${correctionPlan.bid}\n思考: ${correctionPlan.thought || "无"}`,
                controlMode: "llm-corrected",
                correctionAttempt: correctionPlan.correctionAttempt,
                at: Date.now()
              };
              this.currentRunLog.aiThoughtLogs.push(correctionLogEntry);

              if (correctionPlan.actionType !== "none" && correctionPlan.actionId !== "none") {
                this.recordPlayerUsage(player.id, correctionPlan.actionId);
                const correctionToolSummary = this.buildAiToolResultSummary(correctionResult, correctionPlan.actionType, correctionPlan.actionId);
                llmPlan.toolResultSummary = correctionToolSummary;
                llmPlan.toolActionType = correctionPlan.actionType;
                llmPlan.toolActionId = correctionPlan.actionId;

                const actionDef = this.getActionDefById(correctionPlan.actionId);
                this.addPublicInfoEntry({
                  source: `${player.name}-${actionDef.name}(纠错)`,
                  text: actionDef.description
                });

                if (this.isLanMode && this.lanIsHost) {
                  this.lanBridge.send({
                    type: "lan:ai-item-use",
                    aiPlayerId: player.lanId || player.id,
                    aiPlayerName: player.name,
                    actionId: correctionPlan.actionId,
                    actionType: correctionPlan.actionType,
                    itemName: actionDef.name,
                    itemDesc: actionDef.description,
                  });
                }

                if (this.canUseLlmDecisionForPlayer(player.id)) {
                  const followup = await this.requestAiLlmFollowupBid(player, llmPlan, correctionToolSummary);
                  if (followup && !followup.failed && followup.hasBidDecision) {
                    llmPlan.bid = followup.bid;
                    llmPlan.hasBidDecision = true;
                    llmPlan.thought = followup.thought || llmPlan.thought;
                    llmPlan.followupPrompt = followup.userPrompt || "";
                    llmPlan.followupResponse = followup.modelResponse || "";
                    llmPlan.followupElapsedMs = followup.elapsedMs || 0;
                    llmPlan.followupActionRejected = followup.followupActionRejected || "";
                  } else if (followup && followup.failed) {
                    llmPlan.followupError = followup.error || "二次请求失败";
                    llmPlan.followupPrompt = followup.userPrompt || "";
                    llmPlan.followupResponse = followup.modelResponse || "";
                    llmPlan.controlMode = "rule-fallback-after-llm-tool";
                  }
                }
              } else {
                const followup = await this.requestAiLlmFollowupBid(player, llmPlan, "工具执行失败，直接给出价");
                if (followup && !followup.failed && followup.hasBidDecision) {
                  llmPlan.bid = followup.bid;
                  llmPlan.hasBidDecision = true;
                  llmPlan.thought = followup.thought || llmPlan.thought;
                  llmPlan.followupPrompt = followup.userPrompt || "";
                  llmPlan.followupResponse = followup.modelResponse || "";
                  llmPlan.followupElapsedMs = followup.elapsedMs || 0;
                  llmPlan.followupActionRejected = followup.followupActionRejected || "";
                } else if (followup && followup.failed) {
                  llmPlan.followupError = followup.error || "二次请求失败";
                  llmPlan.followupPrompt = followup.userPrompt || "";
                  llmPlan.followupResponse = followup.modelResponse || "";
                  llmPlan.controlMode = "rule-fallback-after-llm-tool";
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
              };
              this.currentRunLog.aiThoughtLogs.push(failLogEntry);
              llmPlan.controlMode = "rule-fallback-after-correction";
            }
          } else {
            const skipLogEntry = {
              round: this.round,
              playerName: player.name,
              thought: `[纠错跳过] ${correctionPlan ? correctionPlan.error || "已达最大纠错次数" : "纠错请求失败"}`,
              controlMode: "rule-fallback-correction-skipped",
              error: correctionPlan ? correctionPlan.error : "纠错请求失败",
              at: Date.now()
            };
            this.currentRunLog.aiThoughtLogs.push(skipLogEntry);
            llmPlan.controlMode = "rule-fallback-correction-skipped";
          }
          continue;
        }

        if (!result.ok || plan.actionType === "none") {
          continue;
        }

        this.recordPlayerUsage(player.id, plan.actionId);
        const toolSummary = this.buildAiToolResultSummary(result, plan.actionType, plan.actionId);
        this.lastAiIntelActions.push({
          playerId: player.id,
          playerName: player.name,
          actionType: plan.actionType,
          actionId: plan.actionId,
          revealed: result.revealed,
          detail: toolSummary,
          score: plan.score || 0,
          effectTag: effect.tag || "",
          signalStats: result.signalStats ? result.signalStats.aggregate : null
        });

        const actionDef = this.getActionDefById(plan.actionId);
        this.addPublicInfoEntry({
          source: `${player.name}-${actionDef.name}`,
          text: actionDef.description
        });

        if (this.isLanMode && this.lanIsHost) {
          this.lanBridge.send({
            type: "lan:ai-item-use",
            aiPlayerId: player.lanId || player.id,
            aiPlayerName: player.name,
            actionId: plan.actionId,
            actionType: plan.actionType,
            itemName: actionDef.name,
            itemDesc: actionDef.description,
          });
        }

        if (llmBidReady && llmPlan.actionId === plan.actionId) {
          llmPlan.actionExecuted = true;
          llmPlan.toolResultSummary = toolSummary;
          llmPlan.toolActionType = plan.actionType;
          llmPlan.toolActionId = plan.actionId;
          llmPlan.controlMode = "llm";

          if (this.canUseLlmDecisionForPlayer(player.id)) {
            const followup = await this.requestAiLlmFollowupBid(player, llmPlan, toolSummary);
            if (followup && !followup.failed && followup.hasBidDecision) {
              llmPlan.bid = followup.bid;
              llmPlan.hasBidDecision = true;
              llmPlan.thought = followup.thought || llmPlan.thought;
              llmPlan.followupPrompt = followup.userPrompt || "";
              llmPlan.followupResponse = followup.modelResponse || "";
              llmPlan.followupElapsedMs = followup.elapsedMs || 0;
              llmPlan.followupActionRejected = followup.followupActionRejected || "";
            } else if (followup && followup.failed) {
              llmPlan.followupError = followup.error || "二次请求失败";
              llmPlan.followupPrompt = followup.userPrompt || "";
              llmPlan.followupResponse = followup.modelResponse || "";
              llmPlan.controlMode = "rule-fallback-after-llm-tool";
            }
          }
        } else if (!llmBidReady) {
          if (llmPlan && llmPlan.failed) {
            llmPlan.controlMode = "rule-fallback-llm-failed";
          } else if (llmPlan && !llmPlan.hasBidDecision) {
            llmPlan.controlMode = "rule-fallback-llm-invalid";
          }
        }
      }

      if (this.lastAiIntelActions.length > 0) {
        const text = this.lastAiIntelActions
          .map((entry) => this.formatAiIntelActionPublicLine(entry))
          .join("；");
        this.writeLog(`他人情报行动：${text}`);
      }
    },

    formatAiIntelActionPublicLine(entry) {
      const info = this.getItemInfo(entry.actionId);
      const revealText = entry.revealed > 0 ? `私有线索+${entry.revealed}` : "未命中";
      const stats = entry.signalStats;
      const statsText = stats && stats.count > 0
        ? `，候选均值${formatCompactNumber(stats.mean)}，波动${(stats.spreadRatio * 100).toFixed(0)}%`
        : "";
      const tag = entry.effectTag ? `，${entry.effectTag}` : "";
      const detail = entry.detail ? `，结果:${compactOneLine(entry.detail, 100)}` : "";
      return `${entry.playerName} 使用${info.label}（${revealText}${statsText}${tag}${detail}）`;
    },

    canUseIntelActions() {
      if (this.settled || this.roundResolving) {
        return false;
      }

      if (this.roundPaused) {
        this.writeLog("当前处于暂停状态，请先继续回合后再操作。");
        return false;
      }

      if (this.roundTimeLeft <= 0) {
        this.writeLog("本回合已超时，无法再使用技能或道具。");
        return false;
      }

      if (this.playerBidSubmitted) {
        this.writeLog("你已提交本轮出价，无法继续使用技能或道具。");
        return false;
      }

      return true;
    }
  };

  global.MobaoAi = global.MobaoAi || {};
  global.MobaoAi.IntelMixin = AiIntelMixin;
})(window);
