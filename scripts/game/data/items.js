(function setupItemSystem(global) {
  const ITEM_DEFS = [
    {
      id: "item-outline-lamp",
      name: "探照灯",
      description: "揭示4件藏品轮廓。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({ count: 4 });
      }
    },
    {
      id: "item-quality-needle",
      name: "鉴定针",
      description: "优先对铜器揭示3件品质格，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealQuality({
          count: 3,
          category: "铜器",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-outline-candle",
      name: "蜡烛",
      description: "揭示2件藏品轮廓。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({ count: 2 });
      }
    },
    {
      id: "item-quality-glass",
      name: "放大镜",
      description: "精确揭示1件藏品品质格。",
      initialCount: 99,
      execute(context) {
        return context.revealQuality({ count: 1 });
      }
    },
    {
      id: "item-outline-torch",
      name: "火把",
      description: "揭示6件藏品轮廓。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({ count: 6 });
      }
    },
    {
      id: "item-cat-porcelain",
      name: "瓷器图谱",
      description: "优先对瓷器揭示3件轮廓，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({
          count: 3,
          category: "瓷器",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-cat-jade",
      name: "玉器鉴书",
      description: "优先对玉器揭示2件品质格，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealQuality({
          count: 2,
          category: "玉器",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-cat-bronze",
      name: "铜器拓片",
      description: "优先对铜器揭示4件轮廓，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({
          count: 4,
          category: "铜器",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-cat-painting",
      name: "书画残卷",
      description: "优先对书画揭示3件品质格，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealQuality({
          count: 3,
          category: "书画",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-cat-wood",
      name: "木器图录",
      description: "优先对木器揭示3件轮廓，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealOutline({
          count: 3,
          category: "木器",
          allowCategoryFallback: true
        });
      }
    },
    {
      id: "item-cat-stone",
      name: "金石拓本",
      description: "优先对金石揭示2件品质格，若不足则补其他品类。",
      initialCount: 99,
      execute(context) {
        return context.revealQuality({
          count: 2,
          category: "金石",
          allowCategoryFallback: true
        });
      }
    }
  ];

  class ItemManager {
    constructor() {
      this.items = ITEM_DEFS.map((item) => ({ ...item, count: item.initialCount }));
    }

    resetForNewRun() {
      this.items.forEach((item) => {
        item.count = item.initialCount;
      });
    }

    use(itemId, context) {
      const item = this.items.find((entry) => entry.id === itemId);
      if (!item) {
        return { ok: false, message: "道具不存在" };
      }

      if (item.count <= 0) {
        return { ok: false, message: `${item.name} 数量不足` };
      }

      const revealResult = item.execute(context);
      if (!revealResult.ok) {
        return revealResult;
      }

      item.count -= 1;
      return {
        ...revealResult,
        ok: true,
        message: `${item.name} 生效，揭示 ${revealResult.revealed} 件目标。`,
        revealed: revealResult.revealed
      };
    }

    getItemState() {
      return this.items.map((item) => ({
        id: item.id,
        name: item.name,
        count: item.count,
        initialCount: item.initialCount
      }));
    }
  }

  global.ItemSystem = {
    ITEM_DEFS,
    ItemManager
  };
})(window);
