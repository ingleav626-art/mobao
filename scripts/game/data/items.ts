/**
 * @file data/items.ts
 * @module data/items
 * @description 道具数据定义与使用管理。定义所有可用道具的静态配置（名称、描述、效果、初始数量），
 *              以及 ItemManager 类负责道具的使用、扣减和状态查询。
 *
 * 道具列表（ITEM_DEFS），11种道具
 *
 * @exports window.ItemSystem - 道具系统单例（兼容）
 * @exports ITEM_DEFS, ItemManager - 命名导出
 */

import { applyUse, resetEntries, type RevealResult } from "./def-manager-helpers"

/** 道具执行上下文接口 */
interface ItemExecContext {
  revealOutline: (options: { count: number; category?: string; allowCategoryFallback?: boolean }) => {
    ok: boolean
    revealed: number
    message: string
  }
  revealQuality: (options: { count: number; category?: string; allowCategoryFallback?: boolean }) => {
    ok: boolean
    revealed: number
    message: string
  }
  revealAll: (options: { count: number; sortStrategy: string }) => {
    ok: boolean
    revealed: number
    message: string
  }
  revealByQuality: (options: { qualityKey: string }) => {
    ok: boolean
    revealed: number
    message: string
  }
  revealByCategory: (options: { category: string }) => {
    ok: boolean
    revealed: number
    message: string
  }
  computeAveragePrice: (options: { scope: string }) => {
    ok: boolean
    revealed: number
    message: string
  }
  applyProfitModifier: (options: { target: string; percent: number }) => {
    ok: boolean
    revealed: number
    message: string
  }
}

export const ITEM_DEFS = [
  {
    id: "item-outline-lamp",
    name: "探照灯",
    description: "揭示4件藏品轮廓。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({ count: 4 })
    }
  },
  {
    id: "item-quality-needle",
    name: "鉴定针",
    description: "优先对铜器揭示3件品质格，若不足则补其他品类。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealQuality({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({ count: 2 })
    }
  },
  {
    id: "item-quality-glass",
    name: "放大镜",
    description: "精确揭示1件藏品品质格。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealQuality({ count: 1 })
    }
  },
  {
    id: "item-outline-torch",
    name: "火把",
    description: "揭示6件藏品轮廓。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({ count: 6 })
    }
  },
  {
    id: "item-cat-porcelain",
    name: "瓷器图谱",
    description: "优先对瓷器揭示3件轮廓，若不足则补其他品类。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealQuality({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealQuality({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealOutline({
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
    execute(context: unknown) {
      return (context as ItemExecContext).revealQuality({
        count: 2,
        category: "金石",
        allowCategoryFallback: true
      })
    }
  },
  {
    id: "item-reveal-all-1",
    name: "低阶探照灯",
    description: "直接随机揭示1件毫无信息的藏品。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealAll({ count: 1, sortStrategy: "random" })
    }
  },
  {
    id: "item-reveal-all-2",
    name: "中阶探照灯",
    description: "直接随机揭示2件毫无信息的藏品。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealAll({ count: 2, sortStrategy: "random" })
    }
  },
  {
    id: "item-reveal-all-4",
    name: "高阶探照灯",
    description: "直接随机揭示4件毫无信息的藏品。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealAll({ count: 4, sortStrategy: "random" })
    }
  },
  {
    id: "item-reveal-all-10",
    name: "顶阶探照灯",
    description: "直接随机揭示10件毫无信息的藏品。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealAll({ count: 10, sortStrategy: "random" })
    }
  },
  {
    id: "item-reveal-top",
    name: "窥宝镜",
    description: "直接揭示本局价格最高的1件藏品全部信息。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealAll({ count: 1, sortStrategy: "highestPrice" })
    }
  },
  {
    id: "item-by-quality-poor",
    name: "藏品入微镜",
    description: "揭示所有粗品藏品的全部信息。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealByQuality({ qualityKey: "poor" })
    }
  },
  {
    id: "item-by-quality-normal",
    name: "藏品洞察镜",
    description: "揭示所有良品藏品的全部信息。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealByQuality({ qualityKey: "normal" })
    }
  },
  {
    id: "item-by-quality-fine",
    name: "藏品精研镜",
    description: "揭示所有精品藏品的全部信息。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealByQuality({ qualityKey: "fine" })
    }
  },
  {
    id: "item-by-cat-porcelain",
    name: "品类专研-瓷器",
    description: "揭示所有瓷器藏品的全部信息。",
    initialCount: 99,
    execute(context: unknown) {
      return (context as ItemExecContext).revealByCategory({ category: "瓷器" })
    }
  },
  {
    id: "item-avg-single",
    name: "单格均价仪",
    description: "计算本局所有单格藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "singleCell" })
    }
  },
  {
    id: "item-avg-double",
    name: "双格均价仪",
    description: "计算本局所有双格藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "doubleCell" })
    }
  },
  {
    id: "item-avg-quad",
    name: "四格均价仪",
    description: "计算本局所有四格藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "quadCell" })
    }
  },
  {
    id: "item-avg-total",
    name: "全场估价仪",
    description: "计算本局全仓藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "total" })
    }
  },
  {
    id: "item-avg-poor",
    name: "粗品估价仪",
    description: "计算本局所有粗品藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "quality:poor" })
    }
  },
  {
    id: "item-avg-normal",
    name: "良品估价仪",
    description: "计算本局所有良品藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "quality:normal" })
    }
  },
  {
    id: "item-avg-fine",
    name: "精品估价仪",
    description: "计算本局所有精品藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "quality:fine" })
    }
  },
  {
    id: "item-avg-porcelain",
    name: "瓷器估价仪",
    description: "计算本局瓷器藏品的均价。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).computeAveragePrice({ scope: "category:瓷器" })
    }
  },
  {
    id: "item-bonus-self-up",
    name: "幸运护符",
    description: "本局结算时自身获利加成50%。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).applyProfitModifier({ target: "self", percent: 50 })
    }
  },
  {
    id: "item-bonus-self-down",
    name: "厄运符咒",
    description: "本局结算时自身获利减少50%。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).applyProfitModifier({ target: "self", percent: -50 })
    }
  },
  {
    id: "item-bonus-all-up",
    name: "群体祝福",
    description: "本局结算时全体获利加成100%。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).applyProfitModifier({ target: "all", percent: 100 })
    }
  },
  {
    id: "item-bonus-all-down",
    name: "群体诅咒",
    description: "本局结算时全体获利减少200%。",
    initialCount: 1,
    execute(context: unknown) {
      return (context as ItemExecContext).applyProfitModifier({ target: "all", percent: -200 })
    }
  }
]

interface ItemRuntime {
  id: string
  name: string
  description: string
  initialCount: number
  count: number
  execute: (context: unknown) => { ok: boolean; revealed: number; message: string }
}

interface ItemState {
  id: string
  name: string
  count: number
  initialCount: number
}

export class ItemManager {
  items: ItemRuntime[]

  constructor() {
    this.items = ITEM_DEFS.map((item) => ({ ...item, count: item.initialCount }))
  }

  resetForNewRun(): void {
    resetEntries(
      this.items,
      (e) => e.initialCount,
      (e, v) => {
        e.count = v
      }
    )
  }

  use(itemId: string, context: unknown): RevealResult {
    return applyUse(itemId, context, {
      entries: this.items,
      getRemaining: (e) => e.count,
      setRemaining: (e, v) => {
        e.count = v
      },
      notFoundMessage: () => "道具不存在",
      depletedMessage: (e) => `${e.name} 数量不足`
    })
  }

  getItemState(): ItemState[] {
    return this.items.map((item) => ({
      id: item.id,
      name: item.name,
      count: item.count,
      initialCount: item.initialCount
    }))
  }
}
