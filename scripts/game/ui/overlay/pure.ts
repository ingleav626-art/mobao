/**
 * @file scripts/game/ui/overlay/pure.ts
 * @module ui/overlay/pure
 * @description 收藏图鉴的可独立测试纯函数。从原 overlay.ts 提取，
 *              包含品类聚合与多条件筛选，零外部依赖。
 *
 * @exports getCollectionCategories, filterCollectionItems
 */

export function getCollectionCategories(library: Array<{ category?: string }>): string[] {
  const categories = new Set<string>()
  library.forEach((a) => {
    if (a.category) categories.add(a.category)
  })
  return Array.from(categories).sort()
}

export function filterCollectionItems<
  T extends { category?: string; qualityKey?: string; name?: string; key?: string }
>(library: T[], opts: { categoryFilter?: string; qualityFilter?: string; searchText?: string }): T[] {
  let result = library
  if (opts.categoryFilter && opts.categoryFilter !== "all") {
    result = result.filter((a) => a.category === opts.categoryFilter)
  }
  if (opts.qualityFilter && opts.qualityFilter !== "all") {
    result = result.filter((a) => a.qualityKey === opts.qualityFilter)
  }
  if (opts.searchText) {
    const q = opts.searchText.toLowerCase()
    result = result.filter((a) => (a.name || "").toLowerCase().includes(q) || (a.key || "").toLowerCase().includes(q))
  }
  return result
}
