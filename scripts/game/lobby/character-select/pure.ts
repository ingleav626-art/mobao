/**
 * @file scripts/game/lobby/character-select/pure.ts
 * @module lobby/character-select/pure
 * @description 角色选择子系统的纯函数和共享类型。
 *              包含携带道具接口定义和补充成本计算。
 *
 * @exports CarryItem, ReplenishItem, ReplenishCostResult - 类型
 * @exports calcReplenishCost - 计算携带道具的补充成本
 */
export interface CarryItem {
  id: string
  name: string
  icon: string
}

export interface ReplenishItem {
  id: string
  name: string
  icon: string
  price: number
  shortage: number
}

export interface ReplenishCostResult {
  totalCost: number
  items: ReplenishItem[]
}

export function calcReplenishCost(
  carryItems: Array<{ id: string; name: string; icon: string }>,
  shopDefs: Array<{ id: string; price?: number }>,
  inventory: Record<string, number>,
  storageKeyFn: (id: string) => string
): ReplenishCostResult {
  const result: ReplenishItem[] = []
  let totalCost = 0

  carryItems.forEach((item) => {
    const shopDef = shopDefs.find((s) => s.id === item.id)
    if (!shopDef) return
    const key = storageKeyFn(item.id)
    const count = inventory[key] || 0
    if (count <= 0) {
      const price = shopDef.price || 0
      result.push({ id: item.id, name: item.name, icon: item.icon, price, shortage: 1 })
      totalCost += price
    }
  })

  return { totalCost, items: result }
}
