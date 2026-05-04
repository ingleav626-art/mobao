(function setupPublicEvents(global) {
  const QUALITY_LABELS = {
    poor: "粗品",
    normal: "良品",
    fine: "精品",
    rare: "珍品",
    legendary: "绝品"
  };

  const QUALITY_ORDER = ["poor", "normal", "fine", "rare", "legendary"];

  const CATEGORY_NAMES = {
    "瓷器": "瓷器",
    "玉器": "玉器",
    "书画": "书画",
    "铜器": "铜器",
    "木器": "木器",
    "金石": "金石"
  };

  function analyzeWarehouse(items) {
    if (!items || items.length === 0) {
      return null;
    }

    const analysis = {
      total: items.length,
      totalCells: 0,
      totalValue: 0,
      avgPrice: 0,
      categories: {},
      qualities: {},
      sizes: { "1x1": 0, "2x1": 0, "1x2": 0, "2x2": 0 },
      largeItems: 0,
      highValueItems: 0,
      lowValueItems: 0,
      maxPrice: 0,
      minPrice: Infinity,
      topCategory: null,
      topQuality: null,
      hasLegendary: false,
      hasRare: false,
      legendaryCount: 0,
      rareCount: 0
    };

    items.forEach(item => {
      const price = item.trueValue || item.basePrice || 0;
      const w = item.w || 1;
      const h = item.h || 1;
      const cells = w * h;
      const qualityKey = item.qualityKey || "normal";
      const category = item.category || "未知";

      analysis.totalCells += cells;
      analysis.totalValue += price;
      analysis.maxPrice = Math.max(analysis.maxPrice, price);
      analysis.minPrice = Math.min(analysis.minPrice, price);

      analysis.categories[category] = (analysis.categories[category] || 0) + 1;
      analysis.qualities[qualityKey] = (analysis.qualities[qualityKey] || 0) + 1;

      const sizeKey = `${w}x${h}`;
      if (analysis.sizes[sizeKey] !== undefined) {
        analysis.sizes[sizeKey]++;
      }

      if (cells >= 2) {
        analysis.largeItems++;
      }
      if (price >= 6000) {
        analysis.highValueItems++;
      }
      if (price <= 2500) {
        analysis.lowValueItems++;
      }

      if (qualityKey === "legendary") {
        analysis.hasLegendary = true;
        analysis.legendaryCount++;
      }
      if (qualityKey === "rare") {
        analysis.hasRare = true;
        analysis.rareCount++;
      }
    });

    analysis.avgPrice = Math.round(analysis.totalValue / analysis.total);

    let maxCatCount = 0;
    for (const [cat, count] of Object.entries(analysis.categories)) {
      if (count > maxCatCount) {
        maxCatCount = count;
        analysis.topCategory = cat;
      }
    }

    let maxQualityCount = 0;
    for (const q of QUALITY_ORDER) {
      const count = analysis.qualities[q] || 0;
      if (count > maxQualityCount) {
        maxQualityCount = count;
        analysis.topQuality = q;
      }
    }

    return analysis;
  }

  function generateEvents(items, gridCols, gridRows) {
    const analysis = analyzeWarehouse(items);
    if (!analysis) return [];

    const events = [];
    const totalGridCells = (gridCols || 12) * (gridRows || 25);
    const occupancyRate = analysis.totalCells / totalGridCells;

    if (analysis.hasLegendary) {
      events.push({
        id: "evt-legendary-exists",
        text: `鉴定师密报：本局仓库中藏有${analysis.legendaryCount}件绝品级藏品，价值连城！`,
        category: "鉴定师密报",
        priority: 100
      });
    }

    if (analysis.hasRare && analysis.rareCount >= 2) {
      events.push({
        id: "evt-rare-multiple",
        text: `拍卖行消息：本局仓库中至少有${analysis.rareCount}件珍品级藏品，值得关注。`,
        category: "拍卖行消息",
        priority: 90
      });
    }

    if (analysis.highValueItems >= 3) {
      events.push({
        id: "evt-high-value-multiple",
        text: `收藏家情报：本局仓库中有${analysis.highValueItems}件高价值藏品（估值6000以上），竞争可能激烈。`,
        category: "收藏家情报",
        priority: 85
      });
    }

    if (analysis.topCategory) {
      const count = analysis.categories[analysis.topCategory];
      const percentage = Math.round(count / analysis.total * 100);
      events.push({
        id: "evt-category-dominant",
        text: `市场传闻：本局仓库以${analysis.topCategory}为主，共${count}件，占比${percentage}%，该品类行情值得关注。`,
        category: "市场传闻",
        priority: 70
      });
    }

    for (const [category, count] of Object.entries(analysis.categories)) {
      if (count >= 5 && category !== analysis.topCategory) {
        events.push({
          id: `evt-category-present-${category}`,
          text: `仓库盘点：本局仓库中${category}类藏品有${count}件。`,
          category: "仓库盘点",
          priority: 50
        });
      }
    }

    if (analysis.qualities.legendary && analysis.qualities.rare) {
      const highCount = (analysis.qualities.legendary || 0) + (analysis.qualities.rare || 0);
      events.push({
        id: "evt-quality-high",
        text: `专家点评：本局仓库整体品质较高，珍品以上藏品共${highCount}件`,
        category: "专家点评",
        priority: 75
      });
    }

    if (analysis.topQuality === "poor" && (analysis.qualities.poor || 0) / analysis.total > 0.4) {
      events.push({
        id: "evt-quality-low",
        text: `行家提醒：本局仓库粗品占比高。`,
        category: "行家提醒",
        priority: 60
      });
    }

    if (analysis.largeItems >= 3) {
      events.push({
        id: "evt-large-items",
        text: `仓库检查员：本局仓库有${analysis.largeItems}件大件藏品（占2格以上），空间布局需留意。`,
        category: "仓库检查员",
        priority: 55
      });
    }

    if (analysis.sizes["2x2"] >= 2) {
      events.push({
        id: "evt-quad-items",
        text: `仓库情报：本局仓库中有${analysis.sizes["2x2"]}件超大件藏品（占4格），可能是镇仓之宝。`,
        category: "仓库情报",
        priority: 65
      });
    }

    if (occupancyRate > 0.7) {
      events.push({
        id: "evt-warehouse-full",
        text: `仓库状态：本局仓库藏品密集，共${analysis.total}件藏品占据${Math.round(occupancyRate * 100)}%空间，竞争激烈。`,
        category: "仓库状态",
        priority: 45
      });
    } else if (occupancyRate < 0.5) {
      events.push({
        id: "evt-warehouse-sparse",
        text: `仓库状态：本局仓库藏品较为分散，共${analysis.total}件藏品，有充足探索空间。`,
        category: "仓库状态",
        priority: 45
      });
    }

    events.push({
      id: "evt-total-summary",
      text: `仓库统计：本局共${analysis.total}件藏品，总估值约${Math.round(analysis.totalValue / 10000)}万，均价${Math.round(analysis.avgPrice / 1000)}千。`,
      category: "仓库统计",
      priority: 40
    });

    if (analysis.avgPrice > 4500) {
      events.push({
        id: "evt-avg-price-high",
        text: `价值评估：本局藏品均价${Math.round(analysis.avgPrice)}，整体价值偏高，值得投入。`,
        category: "价值评估",
        priority: 55
      });
    } else if (analysis.avgPrice < 3000) {
      events.push({
        id: "evt-avg-price-low",
        text: `价值评估：本局藏品均价${Math.round(analysis.avgPrice)}，可能存在捡漏机会。`,
        category: "价值评估",
        priority: 55
      });
    }

    if (analysis.lowValueItems >= 5) {
      events.push({
        id: "evt-low-value-tip",
        text: `捡漏提示：本局有${analysis.lowValueItems}件低价藏品（估值2500以下），其中或有被低估者。`,
        category: "捡漏提示",
        priority: 35
      });
    }

    if (analysis.maxPrice > 8000) {
      events.push({
        id: "evt-max-price",
        text: `最高估值：本局最贵藏品估值${analysis.maxPrice}，可能是全场焦点。`,
        category: "最高估值",
        priority: 60
      });
    }

    events.sort((a, b) => b.priority - a.priority);

    return events;
  }

  function pickRandomPublicEvent(items, gridCols, gridRows) {
    const events = generateEvents(items, gridCols, gridRows);
    if (events.length === 0) {
      return {
        id: "evt-default",
        text: "仓库已开启，请开始探索藏品。",
        category: "系统提示"
      };
    }

    const topEvents = events.slice(0, Math.min(5, events.length));
    const randomIndex = Math.floor(Math.random() * topEvents.length);
    return { ...topEvents[randomIndex] };
  }

  function pickMultiplePublicEvents(items, gridCols, gridRows, count) {
    const events = generateEvents(items, gridCols, gridRows);
    if (events.length === 0) {
      return [{
        id: "evt-default",
        text: "仓库已开启，请开始探索藏品。",
        category: "系统提示"
      }];
    }

    const selectedCount = Math.min(count || 3, events.length);
    return events.slice(0, selectedCount).map(e => ({ ...e }));
  }

  function getWarehouseAnalysis(items, gridCols, gridRows) {
    return analyzeWarehouse(items);
  }

  global.PublicEventSystem = {
    generateEvents,
    pickRandomPublicEvent,
    pickMultiplePublicEvents,
    getWarehouseAnalysis,
    QUALITY_LABELS,
    CATEGORY_NAMES
  };
})(window);
