/**
 * @file shop/index.ts
 * @module game/shop
 * @description 商店页面 UI 管理。采用 IIFE + 揭示模块模式，挂载到 window.MobaoShopPage。
 *              管理商店的完整交互流程，包括道具浏览、搜索筛选、购买、库存查看、
 *              限时特惠等。通过 MobaoShopBridge 与后端数据层交互。
 *
 * 核心职责：
 *   - init(options): 初始化商店，绑定事件，支持 onPurchase 回调
 *   - open / close: 打开/关闭商店覆盖层（支持动画）
 *   - switchTab(tab): 切换标签页（all/inventory/limited）
 *   - updateMoneyDisplay(): 更新金额显示
 *
 * 道具分类（ITEM_CATEGORIES）：
 *   - outline: 轮廓类（探照灯/蜡烛/火把/瓷器图谱/铜器拓片/木器图录）
 *   - quality: 品质类（鉴定针/放大镜/玉器鉴书/书画残卷/金石拓本）
 *   - reveal/avg/bonus/online/special: 预留分类（暂无道具）
 *
 * 商品浏览（renderAllItems）：
 *   - 搜索：按名称/描述模糊匹配
 *   - 品类筛选：按 ITEM_CATEGORIES 分组
 *   - 排序：默认/价格高→低/价格低→高
 *   - 购买限制：每日限购（remaining/maxDaily）、余额不足时禁用
 *
 * 库存查看（renderInventory）：
 *   - 显示已持有且数量>0的道具
 *
 * 限时特惠（renderLimitedOffers）：
 *   - 每日零点刷新，每人限购一次
 *   - 折扣标签（4档颜色）、原价/折后价对比
 *   - 已购买标记
 *
 * @exports window.MobaoShopPage - 商店页面单例
 *   { init, open, close, updateMoneyDisplay, renderAllItems, renderInventory, renderLimitedOffers, ITEM_CATEGORIES }
 *
 * @requires bridge/shop - 商店数据 Bridge
 * @requires game/animations - 动效工具
 */
import { MobaoShopBridge } from "../bridge/shop"
import { MobaoAnimations } from "../animations"

type ShopItem = {
  id: string
  name: string
  price: number
  category?: string
  desc?: string
  description: string
  icon: string
  dailyLimit?: number
  maxDaily: number
}

const ITEM_CATEGORIES = {
  outline: {
    name: "轮廓",
    items: [
      "item-outline-lamp",
      "item-outline-candle",
      "item-outline-torch",
      "item-cat-porcelain",
      "item-cat-bronze",
      "item-cat-wood"
    ]
  },
  quality: {
    name: "品质",
    items: ["item-quality-needle", "item-quality-glass", "item-cat-jade", "item-cat-painting", "item-cat-stone"]
  },
  reveal: {
    name: "揭示",
    items: []
  },
  avg: {
    name: "均价",
    items: []
  },
  bonus: {
    name: "加成",
    items: []
  },
  online: {
    name: "联机",
    items: []
  },
  special: {
    name: "特殊",
    items: []
  }
}

let currentTab = "all"
let searchQuery = ""
let categoryFilter = "all"
let sortFilter = "default"

let onPurchaseCallback: ((result?: { ok?: boolean; message?: string; newMoney?: number }) => void) | null = null

function init(options?: {
  onPurchase?: (result?: { ok?: boolean; message?: string; newMoney?: number }) => void
}): void {
  if (options && options.onPurchase) {
    onPurchaseCallback = options.onPurchase
  }
  bindEvents()
}

function bindEvents(): void {
  const sidebar = document.getElementById("shopSidebar")
  if (sidebar) {
    sidebar.querySelectorAll(".shop-nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const tab = btn.getAttribute("data-shop-tab")
        if (tab) {
          switchTab(tab)
        }
      })
    })
  }

  const searchInput = document.getElementById("shopSearchInput") as HTMLInputElement | null
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value.toLowerCase().trim()
      renderAllItems()
    })
  }

  const categoryFilterEl = document.getElementById("shopCategoryFilter") as HTMLSelectElement | null
  if (categoryFilterEl) {
    categoryFilterEl.addEventListener("change", function () {
      categoryFilter = categoryFilterEl.value
      renderAllItems()
    })
  }

  const sortFilterEl = document.getElementById("shopSortFilter") as HTMLSelectElement | null
  if (sortFilterEl) {
    sortFilterEl.addEventListener("change", function () {
      sortFilter = sortFilterEl.value
      renderAllItems()
    })
  }
}

function switchTab(tab: string): void {
  currentTab = tab
  const sidebar = document.getElementById("shopSidebar")
  if (sidebar) {
    sidebar.querySelectorAll(".shop-nav-item").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-shop-tab") === tab)
    })
  }
  document.querySelectorAll(".shop-tab-panel").forEach(function (panel) {
    panel.classList.toggle("active", panel.id === "shopTab" + capitalize(tab))
  })
  if (tab === "inventory") {
    renderInventory()
  } else if (tab === "all") {
    renderAllItems()
  } else if (tab === "limited") {
    renderLimitedOffers()
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function open(): void {
  const overlay = document.getElementById("shopOverlay")
  if (!overlay) return
  if (typeof MobaoAnimations !== "undefined") {
    MobaoAnimations.animateOverlayOpen(overlay)
  } else {
    overlay.classList.remove("hidden")
  }
  updateMoneyDisplay()
  renderAllItems()
  switchTab("all")

  const closeBtn = document.getElementById("shopCloseBtn") as HTMLButtonElement | null
  if (closeBtn && !(closeBtn as unknown as Record<string, unknown>)._shopBound) {
    ;(closeBtn as unknown as Record<string, unknown>)._shopBound = true
    closeBtn.addEventListener("click", close)
  }

  overlay.onclick = function (e) {
    if (e.target === overlay) close()
  }
}

function close(): void {
  const overlay = document.getElementById("shopOverlay")
  if (!overlay) return
  if (typeof MobaoAnimations !== "undefined") {
    ;(
      MobaoAnimations as unknown as {
        animateOverlayClose(overlay: HTMLElement, panel: HTMLElement | null, cb: () => void): void
      }
    ).animateOverlayClose(overlay, null, function () {
      overlay.classList.add("hidden")
      overlay.style.animation = ""
      overlay.style.opacity = ""
    })
  } else {
    overlay.classList.add("hidden")
  }
  if (onPurchaseCallback) {
    onPurchaseCallback()
  }
}

function updateMoneyDisplay(): void {
  const moneyEl = document.getElementById("shopMoneyDisplay")
  if (!moneyEl || !MobaoShopBridge) return
  const money = MobaoShopBridge.getPlayerMoney()
  const textEl = moneyEl.querySelector(".hud-icon") ? moneyEl.lastChild : moneyEl
  if (textEl && textEl.nodeType === 3) {
    textEl.textContent = " " + money.toLocaleString()
  } else {
    moneyEl.innerHTML =
      '<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ' + money.toLocaleString()
  }
}

function getFilteredItems(): ShopItem[] {
  if (!MobaoShopBridge) return []
  const allItems = MobaoShopBridge.SHOP_ITEMS

  let filtered = allItems.filter(function (item) {
    if (
      searchQuery &&
      !item.name.toLowerCase().includes(searchQuery) &&
      !item.description.toLowerCase().includes(searchQuery)
    ) {
      return false
    }
    if (categoryFilter !== "all") {
      const category = (ITEM_CATEGORIES as Record<string, { name: string; items: string[] }>)[categoryFilter]
      if (category && !category.items.includes(item.id)) {
        return false
      }
    }
    return true
  })

  if (sortFilter === "price-high") {
    filtered.sort(function (a, b) {
      return b.price - a.price
    })
  } else if (sortFilter === "price-low") {
    filtered.sort(function (a, b) {
      return a.price - b.price
    })
  }

  return filtered
}

function renderAllItems(): void {
  const gridEl = document.getElementById("shopGrid")
  if (!gridEl || !MobaoShopBridge) return

  const money = MobaoShopBridge.getPlayerMoney()
  const items = getFilteredItems()

  if (items.length === 0) {
    gridEl.innerHTML = '<div class="shop-empty-state">没有找到匹配的道具</div>'
    return
  }

  gridEl.innerHTML = items
    .map(function (item) {
      const remaining = MobaoShopBridge.getRemainingDaily(item.id)
      const owned = MobaoShopBridge.getItemCount(item.id)
      const canBuy = remaining > 0 && money >= item.price

      return [
        '<div class="shop-card">',
        '<div class="shop-card-icon">' + item.icon + "</div>",
        '<div class="shop-card-name">' + item.name + "</div>",
        '<div class="shop-card-desc">' + item.description + "</div>",
        '<div class="shop-card-meta">',
        "<span>今日 " + remaining + "/" + item.maxDaily + "</span>",
        "<span>持有 " + owned + "</span>",
        "</div>",
        '<button class="shop-card-buy" data-shop-item-id="' +
          item.id +
          '"' +
          (canBuy ? "" : " disabled") +
          ' type="button">' +
          item.price.toLocaleString() +
          "</button>",
        "</div>"
      ].join("")
    })
    .join("")

  gridEl.querySelectorAll(".shop-card-buy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const itemId = btn.getAttribute("data-shop-item-id")
      if (itemId) {
        purchaseItem(itemId)
      }
    })
  })
}

function renderInventory(): void {
  const gridEl = document.getElementById("shopInventoryGrid")
  if (!gridEl || !MobaoShopBridge) return

  const inv = MobaoShopBridge.getFullInventory()
  const items = MobaoShopBridge.SHOP_ITEMS

  const inventoryItems = items
    .map(function (item: ShopItem) {
      const storageKey = MobaoShopBridge.getItemStorageKey
        ? MobaoShopBridge.getItemStorageKey(item.id)
        : item.id.replace("item-", "").replace("-", "")
      const count = inv[storageKey] || 0
      return {
        item: item,
        count: count
      }
    })
    .filter(function (entry) {
      return entry.count > 0
    })

  if (inventoryItems.length === 0) {
    gridEl.innerHTML = '<div class="shop-empty-state">暂无道具</div>'
    return
  }

  gridEl.innerHTML = inventoryItems
    .map(function (entry) {
      return [
        '<div class="shop-inventory-card">',
        '<div class="shop-inventory-icon">' + entry.item.icon + "</div>",
        '<div class="shop-inventory-info">',
        '<div class="shop-inventory-name">' + entry.item.name + "</div>",
        '<div class="shop-inventory-desc">' + entry.item.description + "</div>",
        '<div class="shop-inventory-count">x' + entry.count + "</div>",
        "</div>",
        "</div>"
      ].join("")
    })
    .join("")
}

function renderLimitedOffers(): void {
  const panelEl = document.getElementById("shopTabLimited")
  if (!panelEl || !MobaoShopBridge) return

  const offers = MobaoShopBridge.getLimitedOffers()
  const money = MobaoShopBridge.getPlayerMoney()

  if (!offers || offers.length === 0) {
    panelEl.innerHTML = '<div class="shop-limited-placeholder"><p>今日暂无特惠商品</p></div>'
    return
  }

  const html = [
    '<div class="shop-limited-header">',
    '<p class="shop-limited-title">今日限时特惠</p>',
    '<p class="shop-limited-subtitle">每日零点刷新，每人限购一次</p>',
    "</div>",
    '<div class="shop-limited-grid">'
  ]

  offers.forEach(function (offer, index) {
    const item = MobaoShopBridge.SHOP_ITEMS.find(function (s: ShopItem) {
      return s.id === offer.itemId
    })
    if (!item) return

    const canBuy = !offer.purchased && money >= offer.discountedPrice
    const discountPercent = Math.round(offer.discount * 100)
    const badge = offer.badge

    html.push(
      [
        '<div class="shop-limited-card' + (offer.purchased ? " purchased" : "") + '">',
        '<div class="shop-discount-badge" style="background-color: ' + badge.color + ';">',
        '<span class="badge-label">' + badge.label + "</span>",
        '<span class="badge-discount">' + discountPercent + "%</span>",
        "</div>",
        '<div class="shop-limited-icon">' + item.icon + "</div>",
        '<div class="shop-limited-name">' + item.name + "</div>",
        '<div class="shop-limited-desc">' + item.description + "</div>",
        '<div class="shop-limited-price">',
        '<span class="price-original">' + offer.originalPrice.toLocaleString() + "</span>",
        '<span class="price-discounted">' + offer.discountedPrice.toLocaleString() + "</span>",
        "</div>",
        '<button class="shop-limited-buy" data-offer-index="' +
          index +
          '"' +
          (canBuy ? "" : " disabled") +
          ' type="button">',
        offer.purchased ? "已购买" : "立即抢购",
        "</button>",
        "</div>"
      ].join("")
    )
  })

  html.push("</div>")
  panelEl.innerHTML = html.join("")

  panelEl.querySelectorAll(".shop-limited-buy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const offerIndexStr = btn.getAttribute("data-offer-index")
      if (offerIndexStr) {
        const offerIndex = parseInt(offerIndexStr, 10)
        purchaseLimitedOffer(offerIndex)
      }
    })
  })
}

function purchaseLimitedOffer(offerIndex: number): void {
  if (!MobaoShopBridge) return
  const result = MobaoShopBridge.purchaseLimitedOffer(offerIndex)
  if (result.ok) {
    updateMoneyDisplay()
    renderLimitedOffers()
    if (currentTab === "inventory") {
      renderInventory()
    }
    if (onPurchaseCallback) {
      onPurchaseCallback(result)
    }
  } else {
    alert(result.message)
  }
}

function purchaseItem(itemId: string): void {
  if (!MobaoShopBridge) return
  const result = MobaoShopBridge.purchaseItem(itemId)
  if (result.ok) {
    updateMoneyDisplay()
    renderAllItems()
    if (currentTab === "inventory") {
      renderInventory()
    }
    if (onPurchaseCallback) {
      onPurchaseCallback(result)
    }
  } else {
    alert(result.message)
  }
}

export const MobaoShopPage = {
  init: init,
  open: open,
  close: close,
  updateMoneyDisplay: updateMoneyDisplay,
  renderAllItems: renderAllItems,
  renderInventory: renderInventory,
  renderLimitedOffers: renderLimitedOffers,
  ITEM_CATEGORIES: ITEM_CATEGORIES
}
