(function setupArtifactData(global) {
  const QUALITY_CONFIG = {
    poor: { label: "粗品", color: 0x9f9f9f, glow: 0xdcdcdc, weight: 28 },
    normal: { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 34 },
    fine: { label: "精品", color: 0x12b46d, glow: 0x8ae4bf, weight: 22 },
    rare: { label: "珍品", color: 0xf0a300, glow: 0xffd56f, weight: 12 },
    legendary: { label: "绝品", color: 0xf04242, glow: 0xffa0a0, weight: 4 }
  };

  const SIZE_POOL = [
    { w: 1, h: 1, weight: 45 },
    { w: 2, h: 1, weight: 26 },
    { w: 1, h: 2, weight: 18 },
    { w: 2, h: 2, weight: 11 }
  ];

  const SIZE_TAG_BY_DIMENSION = {
    "1x1": "1x1",
    "2x1": "2x1",
    "1x2": "1x2",
    "2x2": "2x2"
  };

  // 品类尺寸偏好，用于“已知占格时”的候选预览筛选。
  const CATEGORY_SIZE_WEIGHTS = {
    瓷器: [
      { w: 1, h: 1, weight: 30 },
      { w: 2, h: 1, weight: 28 },
      { w: 1, h: 2, weight: 20 },
      { w: 2, h: 2, weight: 22 }
    ],
    玉器: [
      { w: 1, h: 1, weight: 55 },
      { w: 2, h: 1, weight: 24 },
      { w: 1, h: 2, weight: 14 },
      { w: 2, h: 2, weight: 7 }
    ],
    书画: [
      { w: 1, h: 1, weight: 14 },
      { w: 2, h: 1, weight: 32 },
      { w: 1, h: 2, weight: 34 },
      { w: 2, h: 2, weight: 20 }
    ],
    铜器: [
      { w: 1, h: 1, weight: 20 },
      { w: 2, h: 1, weight: 28 },
      { w: 1, h: 2, weight: 20 },
      { w: 2, h: 2, weight: 32 }
    ],
    木器: [
      { w: 1, h: 1, weight: 22 },
      { w: 2, h: 1, weight: 30 },
      { w: 1, h: 2, weight: 26 },
      { w: 2, h: 2, weight: 22 }
    ],
    金石: [
      { w: 1, h: 1, weight: 45 },
      { w: 2, h: 1, weight: 28 },
      { w: 1, h: 2, weight: 15 },
      { w: 2, h: 2, weight: 12 }
    ]
  };

  // 藏品总表：每种藏品的品质、价格、轮廓固定唯一。
  const ARTIFACT_LIBRARY = [
    { key: "porcelain-qingyou-zhan", category: "瓷器", name: "青釉盏", basePrice: 3200, qualityKey: "normal", w: 1, h: 1 },
    { key: "porcelain-miaojin-ping", category: "瓷器", name: "描金瓶", basePrice: 4200, qualityKey: "fine", w: 1, h: 2 },
    { key: "porcelain-yudian-guan", category: "瓷器", name: "雨点罐", basePrice: 2800, qualityKey: "normal", w: 1, h: 1 },
    { key: "porcelain-hubai-pan", category: "瓷器", name: "湖白盘", basePrice: 2400, qualityKey: "poor", w: 2, h: 1 },
    { key: "porcelain-fanhong-zun", category: "瓷器", name: "矾红尊", basePrice: 5100, qualityKey: "rare", w: 1, h: 2 },
    { key: "porcelain-binglie-guan", category: "瓷器", name: "冰裂罐", basePrice: 3900, qualityKey: "fine", w: 2, h: 1 },

    { key: "jade-jadepei", category: "玉器", name: "玉佩", basePrice: 3600, qualityKey: "normal", w: 1, h: 1 },
    { key: "jade-guyubi", category: "玉器", name: "古玉璧", basePrice: 5300, qualityKey: "rare", w: 2, h: 2 },
    { key: "jade-yangzhi-zhui", category: "玉器", name: "羊脂坠", basePrice: 4900, qualityKey: "fine", w: 1, h: 1 },
    { key: "jade-yunwen-pei", category: "玉器", name: "云纹珮", basePrice: 4100, qualityKey: "fine", w: 1, h: 1 },
    { key: "jade-longwen-jue", category: "玉器", name: "龙纹玦", basePrice: 6200, qualityKey: "rare", w: 2, h: 1 },
    { key: "jade-heti-zhou", category: "玉器", name: "合体镯", basePrice: 7700, qualityKey: "legendary", w: 2, h: 2 },

    { key: "painting-shanshui-zhou", category: "书画", name: "山水轴", basePrice: 4600, qualityKey: "fine", w: 1, h: 2 },
    { key: "painting-huaniao-ce", category: "书画", name: "花鸟册", basePrice: 3900, qualityKey: "normal", w: 2, h: 1 },
    { key: "painting-xingshu-juan", category: "书画", name: "行书卷", basePrice: 5600, qualityKey: "rare", w: 2, h: 1 },
    { key: "painting-tishi-ye", category: "书画", name: "题诗页", basePrice: 3400, qualityKey: "normal", w: 1, h: 1 },
    { key: "painting-jinbo-fu", category: "书画", name: "金箔赋", basePrice: 8500, qualityKey: "legendary", w: 2, h: 2 },
    { key: "painting-molan-tiao", category: "书画", name: "墨兰条", basePrice: 4300, qualityKey: "fine", w: 1, h: 2 },

    { key: "bronze-tongjing", category: "铜器", name: "铜镜", basePrice: 3000, qualityKey: "normal", w: 1, h: 1 },
    { key: "bronze-ding-er-lei", category: "铜器", name: "鼎耳罍", basePrice: 6800, qualityKey: "rare", w: 2, h: 2 },
    { key: "bronze-kuiwen-hu", category: "铜器", name: "夔纹壶", basePrice: 5200, qualityKey: "fine", w: 2, h: 1 },
    { key: "bronze-shoumian-lu", category: "铜器", name: "兽面炉", basePrice: 4700, qualityKey: "fine", w: 2, h: 2 },
    { key: "bronze-zhongding-pian", category: "铜器", name: "钟鼎片", basePrice: 2600, qualityKey: "poor", w: 1, h: 1 },
    { key: "bronze-qinglong-jian", category: "铜器", name: "青龙鉴", basePrice: 7400, qualityKey: "rare", w: 2, h: 1 },

    { key: "wood-mudiao-xia", category: "木器", name: "木雕匣", basePrice: 2300, qualityKey: "poor", w: 1, h: 1 },
    { key: "wood-xiangzhang-he", category: "木器", name: "香樟盒", basePrice: 2700, qualityKey: "normal", w: 2, h: 1 },
    { key: "wood-sunmao-jia", category: "木器", name: "榫卯架", basePrice: 3500, qualityKey: "normal", w: 1, h: 2 },
    { key: "wood-miaoqi-pan", category: "木器", name: "描漆盘", basePrice: 2600, qualityKey: "poor", w: 2, h: 1 },
    { key: "wood-jinmu-ping", category: "木器", name: "金木屏", basePrice: 5900, qualityKey: "rare", w: 2, h: 2 },
    { key: "wood-zhimu-zhen", category: "木器", name: "栉木枕", basePrice: 3100, qualityKey: "normal", w: 1, h: 1 },

    { key: "stone-yinzhang", category: "金石", name: "印章", basePrice: 3300, qualityKey: "normal", w: 1, h: 1 },
    { key: "stone-shigu-tuo", category: "金石", name: "石鼓拓", basePrice: 4400, qualityKey: "fine", w: 2, h: 1 },
    { key: "stone-canbei-pian", category: "金石", name: "残碑片", basePrice: 2100, qualityKey: "poor", w: 1, h: 1 },
    { key: "stone-zhuanke-niu", category: "金石", name: "篆刻钮", basePrice: 3700, qualityKey: "normal", w: 1, h: 1 },
    { key: "stone-hanwa-duan", category: "金石", name: "汉瓦断", basePrice: 5100, qualityKey: "fine", w: 2, h: 1 },
    { key: "stone-jinshi-lu", category: "金石", name: "金石录", basePrice: 8100, qualityKey: "legendary", w: 2, h: 2 }
  ];

  const CATEGORY_WEIGHTS = [
    { key: "瓷器", weight: 22 },
    { key: "玉器", weight: 18 },
    { key: "书画", weight: 16 },
    { key: "铜器", weight: 17 },
    { key: "木器", weight: 14 },
    { key: "金石", weight: 13 }
  ];

  class ArtifactManager {
    constructor() {
      this.counter = 1;
    }

    createRandomArtifact() {
      const category = weightedPick(CATEGORY_WEIGHTS).key;
      const defs = ARTIFACT_LIBRARY.filter((item) => item.category === category);
      const def = defs[Math.floor(Math.random() * defs.length)];
      return this.buildArtifactFromDef(def);
    }

    createRandomArtifactForSlot({ col, row, gridCols, gridRows, occupancy, categoryWeights, qualityWeights }) {
      const categoryWeightMap = categoryWeights
        ? { ...categoryWeights }
        : CATEGORY_WEIGHTS.reduce((acc, item) => {
          acc[item.key] = item.weight;
          return acc;
        }, {});

      let fitDefs = ARTIFACT_LIBRARY.filter((def) =>
        canPlaceRect(col, row, def.w, def.h, gridCols, gridRows, occupancy)
      );

      if (qualityWeights) {
        const totalQ = Object.values(qualityWeights).reduce((s, v) => s + v, 0) || 1;
        fitDefs = fitDefs.map((def) => ({
          ...def,
          _qw: qualityWeights[def.qualityKey] || 1
        }));
        fitDefs = fitDefs.filter(() => Math.random() < 1);
        const expanded = [];
        fitDefs.forEach((def) => {
          const cw = categoryWeightMap[def.category] || 1;
          const qw = def._qw / totalQ;
          expanded.push({ ...def, weight: cw * qw });
        });
        if (expanded.length === 0) {
          return null;
        }
        const picked = weightedPick(expanded);
        return this.buildArtifactFromDef(picked);
      }

      if (fitDefs.length === 0) {
        return null;
      }

      const weightedDefs = fitDefs.map((def) => ({
        ...def,
        weight: categoryWeightMap[def.category] || 1
      }));

      const picked = weightedPick(weightedDefs);
      return this.buildArtifactFromDef(picked);
    }

    buildArtifactFromDef(def) {
      const quality = QUALITY_CONFIG[def.qualityKey];

      return {
        id: `artifact-${this.counter++}`,
        key: def.key,
        category: def.category,
        name: def.name,
        basePrice: def.basePrice,
        qualityKey: def.qualityKey,
        quality,
        w: def.w,
        h: def.h,
        x: 0,
        y: 0
      };
    }

    pickSizeForCategory(category) {
      const pool = CATEGORY_SIZE_WEIGHTS[category] || SIZE_POOL;
      return weightedPick(pool.map((entry) => ({ ...entry })));
    }

    cloneArtifactForSize(baseArtifact, w, h) {
      return {
        ...baseArtifact,
        w,
        h
      };
    }

    pickSizeThatFits(col, row, gridCols, gridRows, occupancy) {
      const fitSizes = SIZE_POOL.filter((s) =>
        canPlaceRect(col, row, s.w, s.h, gridCols, gridRows, occupancy)
      );

      if (fitSizes.length === 0) {
        return null;
      }

      return weightedPick(fitSizes.map((size) => ({ ...size })));
    }

    getCandidatesByRevealState(state) {
      const { qualityKey = null, sizeTag = null, category = null } = state;
      return ARTIFACT_LIBRARY.filter((artifact) => {
        if (category && artifact.category !== category) {
          return false;
        }

        if (qualityKey && artifact.qualityKey !== qualityKey) {
          return false;
        }

        if (sizeTag) {
          const artifactSizeTag = toSizeTag(artifact.w, artifact.h);
          if (artifactSizeTag !== sizeTag) {
            return false;
          }
        }

        return true;
      }).map((artifact) => ({
        ...artifact,
        qualityKey,
        qualityLabel: qualityKey ? QUALITY_CONFIG[qualityKey].label : "未知",
        expectedPrice: artifact.basePrice,
        previewSizeTag: toSizeTag(artifact.w, artifact.h)
      }));
    }

    getCandidateStatsByRevealState(state) {
      const candidates = this.getCandidatesByRevealState(state);
      return summarizeCandidatePrices(candidates);
    }

    getSignalPriceStats(signals = []) {
      const list = Array.isArray(signals) ? signals.filter(Boolean) : [];
      const detail = list.map((signal) => {
        const revealState = signalToRevealState(signal);
        const candidates = this.getCandidatesByRevealState(revealState);
        return {
          ...signal,
          revealState,
          stats: summarizeCandidatePrices(candidates)
        };
      });

      const qualityCount = detail.filter((entry) => entry.type === "quality").length;
      const outlineCount = detail.filter((entry) => entry.type === "outline").length;

      return {
        signalCount: detail.length,
        qualitySignalRate: detail.length > 0 ? qualityCount / detail.length : 0,
        outlineSignalRate: detail.length > 0 ? outlineCount / detail.length : 0,
        detail,
        aggregate: summarizeStatsCollection(detail.map((entry) => entry.stats))
      };
    }

    getLibraryStats() {
      const byCategory = ARTIFACT_LIBRARY.reduce((acc, artifact) => {
        acc[artifact.category] = (acc[artifact.category] || 0) + 1;
        return acc;
      }, {});

      return {
        total: ARTIFACT_LIBRARY.length,
        byCategory
      };
    }
  }

  function guessPrimarySizeTagByCategory(category) {
    const pool = CATEGORY_SIZE_WEIGHTS[category] || SIZE_POOL;
    const sorted = [...pool].sort((a, b) => b.weight - a.weight);
    return toSizeTag(sorted[0].w, sorted[0].h);
  }

  function estimatePriceByQuality(basePrice, qualityKey) {
    const multiplierMap = {
      poor: 0.72,
      normal: 0.95,
      fine: 1.18,
      rare: 1.45,
      legendary: 1.85
    };

    const ratio = multiplierMap[qualityKey] || 1;
    return Math.round(basePrice * ratio);
  }

  function signalToRevealState(signal) {
    const state = {};
    if (signal.qualityKey) {
      state.qualityKey = signal.qualityKey;
    }
    if (signal.sizeTag) {
      state.sizeTag = signal.sizeTag;
    }
    if (signal.category) {
      state.category = signal.category;
    }
    return state;
  }

  function summarizeCandidatePrices(candidates = []) {
    const prices = candidates
      .map((item) => Number(item.expectedPrice ?? item.basePrice) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return emptyPriceStats();
    }

    const count = prices.length;
    const sum = prices.reduce((acc, value) => acc + value, 0);
    const mean = sum / count;
    const top2 = prices.slice(-2);
    const bottom2 = prices.slice(0, 2);
    const top2Mean = top2.reduce((acc, value) => acc + value, 0) / top2.length;
    const bottom2Mean = bottom2.reduce((acc, value) => acc + value, 0) / bottom2.length;
    const variance = prices.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / count;
    const std = Math.sqrt(variance);
    const p10 = quantileSorted(prices, 0.1);
    const q1 = quantileSorted(prices, 0.25);
    const q3 = quantileSorted(prices, 0.75);
    const p90 = quantileSorted(prices, 0.9);
    const iqr = q3 - q1;
    const spreadRatio = iqr / (mean + 1);
    const upperEdge = (top2Mean - mean) / (mean + 1);
    const lowerEdge = (mean - bottom2Mean) / (mean + 1);

    return {
      count,
      mean,
      top2Mean,
      bottom2Mean,
      std,
      p10,
      q1,
      q3,
      p90,
      iqr,
      spreadRatio,
      upperEdge,
      lowerEdge
    };
  }

  function summarizeStatsCollection(statsList = []) {
    const list = statsList.filter((stats) => stats && Number.isFinite(stats.count) && stats.count > 0);
    if (list.length === 0) {
      return emptyPriceStats();
    }

    const totalWeight = list.reduce((acc, stats) => acc + stats.count, 0);
    const weighted = (field) => list.reduce((acc, stats) => acc + stats[field] * stats.count, 0) / totalWeight;

    return {
      count: Math.round(weighted("count")),
      mean: weighted("mean"),
      top2Mean: weighted("top2Mean"),
      bottom2Mean: weighted("bottom2Mean"),
      std: weighted("std"),
      p10: weighted("p10"),
      q1: weighted("q1"),
      q3: weighted("q3"),
      p90: weighted("p90"),
      iqr: weighted("iqr"),
      spreadRatio: weighted("spreadRatio"),
      upperEdge: weighted("upperEdge"),
      lowerEdge: weighted("lowerEdge")
    };
  }

  function emptyPriceStats() {
    return {
      count: 0,
      mean: 0,
      top2Mean: 0,
      bottom2Mean: 0,
      std: 0,
      p10: 0,
      q1: 0,
      q3: 0,
      p90: 0,
      iqr: 0,
      spreadRatio: 0,
      upperEdge: 0,
      lowerEdge: 0
    };
  }

  function quantileSorted(values, ratio) {
    if (!values || values.length === 0) {
      return 0;
    }

    const q = Math.max(0, Math.min(1, ratio));
    const idx = (values.length - 1) * q;
    const left = Math.floor(idx);
    const right = Math.ceil(idx);
    if (left === right) {
      return values[left];
    }

    const frac = idx - left;
    return values[left] + (values[right] - values[left]) * frac;
  }

  function toSizeTag(w, h) {
    return SIZE_TAG_BY_DIMENSION[`${w}x${h}`] || `${w}x${h}`;
  }

  function canPlaceRect(col, row, w, h, gridCols, gridRows, occupancy) {
    if (col + w > gridCols || row + h > gridRows) {
      return false;
    }

    for (let y = row; y < row + h; y += 1) {
      for (let x = col; x < col + w; x += 1) {
        if (occupancy[y][x]) {
          return false;
        }
      }
    }

    return true;
  }

  function weightedPick(pool) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.random() * total;

    for (const item of pool) {
      cursor -= item.weight;
      if (cursor <= 0) {
        return item;
      }
    }

    return pool[pool.length - 1];
  }

  global.ArtifactData = {
    QUALITY_CONFIG,
    ARTIFACT_LIBRARY,
    SIZE_POOL,
    CATEGORY_SIZE_WEIGHTS,
    CATEGORY_WEIGHTS,
    toSizeTag,
    estimatePriceByQuality,
    ArtifactManager
  };
})(window);
