/**
 * @file data/items.js
 * @module data/items
 * @description 道具数据定义与使用管理。采用 ES Module 模式，同时挂载到 window.ItemSystem 保持兼容。
 *              定义所有可用道具的静态配置（名称、描述、效果、初始数量），
 *              以及 ItemManager 类负责道具的使用、扣减和状态查询。
 *
 * 道具列表（ITEM_DEFS），11种道具：
 *   基础揭示：
 *     - item-outline-lamp（探照灯）：揭示4件轮廓
 *     - item-outline-candle（蜡烛）：揭示2件轮廓
 *     - item-outline-torch（火把）：揭示6件轮廓
 *     - item-quality-needle（鉴定针）：铜器品质+3（不足补其他）
 *     - item-quality-glass（放大镜）：品质1件
 *   品类专用：
 *     - item-cat-porcelain（瓷器图谱）：瓷器轮廓+3
 *     - item-cat-jade（玉器鉴书）：玉器品质+2
 *     - item-cat-bronze（铜器拓片）：铜器轮廓+4
 *     - item-cat-painting（书画残卷）：书画品质+3
 *     - item-cat-wood（木器图录）：木器轮廓+3
 *     - item-cat-stone（金石拓本）：金石品质+2
 *
 * ItemManager 类：
 *   - constructor(): 初始化道具列表（每项含 count）
 *   - resetForNewRun(): 重置所有道具数量为初始值
 *   - use(itemId, context): 使用道具（扣减数量 + 执行揭示）
 *   - getItemState(): 获取所有道具的当前状态
 *
 * 道具执行机制：
 *   每个道具的 execute(context) 接受揭示上下文对象，调用 context.revealOutline
 *   或 context.revealQuality，返回 { ok, revealed } 结果
 *
 * @exports window.ItemSystem - 道具系统单例（兼容）
 * @exports ITEM_DEFS, ItemManager - 命名导出
 *   关键属性：ITEM_DEFS（道具定义数组）
 *   关键类：ItemManager
 */
export const ITEM_DEFS = [
  {
    id: "item-outline-lamp",
    name: "探照灯",
    description: "揭示4件藏品轮廓。",
    initialCount: 99,
    execute(context) {
      return context.revealOutline({ count: 4 })
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
      })
    }
  },
  {
    id: "item-outline-candle",
    name: "蜡烛",
    description: "揭示2件藏品轮廓。",
    initialCount: 99,
    execute(context) {
      return context.revealOutline({ count: 2 })
    }
  },
  {
    id: "item-quality-glass",
    name: "放大镜",
    description: "精确揭示1件藏品品质格。",
    initialCount: 99,
    execute(context) {
      return context.revealQuality({ count: 1 })
    }
  },
  {
    id: "item-outline-torch",
    name: "火把",
    description: "揭示6件藏品轮廓。",
    initialCount: 99,
    execute(context) {
      return context.revealOutline({ count: 6 })
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
      })
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
      })
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
      })
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
      })
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
      })
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
      })
    }
  }
]

export class ItemManager {
  constructor() {
    this.items = ITEM_DEFS.map((item) => ({ ...item, count: item.initialCount }))
  }

  resetForNewRun() {
    this.items.forEach((item) => {
      item.count = item.initialCount
    })
  }

  use(itemId, context) {
    const item = this.items.find((entry) => entry.id === itemId)
    if (!item) {
      return { ok: false, message: "道具不存在" }
    }

    if (item.count <= 0) {
      return { ok: false, message: `${item.name} 数量不足` }
    }

    const revealResult = item.execute(context)
    if (!revealResult.ok) {
      return revealResult
    }

    item.count -= 1
    return {
      ...revealResult,
      ok: true,
      message: `${item.name} 生效，揭示 ${revealResult.revealed} 件目标。`,
      revealed: revealResult.revealed
    }
  }

  getItemState() {
    return this.items.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      initialCount: item.initialCount
    }))
  }
}

// 兼容层：保持 window.ItemSystem 全局变量可用
window.ItemSystem = {
  ITEM_DEFS,
  ItemManager
}