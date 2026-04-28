(function setupItemSystem(global) {
  // 道具配置：控制初始库存和一次使用的揭露效果。
  const ITEM_DEFS = [
    {
      id: "item-outline-lamp",
      name: "道具-探照灯",
      description: "揭示4件藏品轮廓。",
      initialCount: 2,
      execute(context) {
        return context.revealOutline({ count: 4 });
      }
    },
    {
      id: "item-quality-needle",
      name: "道具-鉴定针",
      description: "优先对铜器揭示3件品质格，若不足则补其他品类。",
      initialCount: 2,
      execute(context) {
        return context.revealQuality({
          count: 3,
          category: "铜器",
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
      // 道具与技能复用同一套 context 揭露接口，便于统一平衡。
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
