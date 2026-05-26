window.MobaoShopPage = (function () {
  const ITEM_CATEGORIES = {
    outline: {
      name: "轮廓",
      items: ["item-outline-lamp", "item-outline-candle", "item-outline-torch", "item-cat-porcelain", "item-cat-bronze", "item-cat-wood"]
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
  };

  let currentTab = "all";
  let searchQuery = "";
  let categoryFilter = "all";
  let sortFilter = "default";
  let onPurchaseCallback = null;

  function init(options) {
    if (options && options.onPurchase) {
      onPurchaseCallback = options.onPurchase;
    }
    bindEvents();
  }

  function bindEvents() {
    const sidebar = document.getElementById("shopSidebar");
    if (sidebar) {
      sidebar.querySelectorAll(".shop-nav-item").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const tab = btn.getAttribute("data-shop-tab");
          switchTab(tab);
        });
      });
    }

    const searchInput = document.getElementById("shopSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        searchQuery = searchInput.value.toLowerCase().trim();
        renderAllItems();
      });
    }

    const categoryFilterEl = document.getElementById("shopCategoryFilter");
    if (categoryFilterEl) {
      categoryFilterEl.addEventListener("change", function () {
        categoryFilter = categoryFilterEl.value;
        renderAllItems();
      });
    }

    const sortFilterEl = document.getElementById("shopSortFilter");
    if (sortFilterEl) {
      sortFilterEl.addEventListener("change", function () {
        sortFilter = sortFilterEl.value;
        renderAllItems();
      });
    }
  }

  function switchTab(tab) {
    currentTab = tab;
    const sidebar = document.getElementById("shopSidebar");
    if (sidebar) {
      sidebar.querySelectorAll(".shop-nav-item").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-shop-tab") === tab);
      });
    }
    document.querySelectorAll(".shop-tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "shopTab" + capitalize(tab));
    });
    if (tab === "inventory") {
      renderInventory();
    } else if (tab === "all") {
      renderAllItems();
    } else if (tab === "limited") {
      renderLimitedOffers();
    }
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function open() {
    const overlay = document.getElementById("shopOverlay");
    if (!overlay) return;
    if (typeof MobaoAnimations !== "undefined") {
      MobaoAnimations.animateOverlayOpen(overlay);
    } else {
      overlay.classList.remove("hidden");
    }
    updateMoneyDisplay();
    renderAllItems();
    switchTab("all");

    const closeBtn = document.getElementById("shopCloseBtn");
    if (closeBtn && !closeBtn._shopBound) {
      closeBtn._shopBound = true;
      closeBtn.addEventListener("click", close);
    }

    overlay.onclick = function (e) {
      if (e.target === overlay) close();
    };
  }

  function close() {
    const overlay = document.getElementById("shopOverlay");
    if (!overlay) return;
    if (typeof MobaoAnimations !== "undefined") {
      MobaoAnimations.animateOverlayClose(overlay, null, function () {
        overlay.classList.add("hidden");
        overlay.style.animation = "";
        overlay.style.opacity = "";
      });
    } else {
      overlay.classList.add("hidden");
    }
    if (onPurchaseCallback) {
      onPurchaseCallback();
    }
  }

  function updateMoneyDisplay() {
    const moneyEl = document.getElementById("shopMoneyDisplay");
    if (!moneyEl || !window.MobaoShopBridge) return;
    const money = window.MobaoShopBridge.getPlayerMoney();
    const textEl = moneyEl.querySelector(".hud-icon") ? moneyEl.lastChild : moneyEl;
    if (textEl && textEl.nodeType === 3) {
      textEl.textContent = " " + money.toLocaleString();
    } else {
      moneyEl.innerHTML = '<img src="./assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon"> ' + money.toLocaleString();
    }
  }

  function getFilteredItems() {
    if (!window.MobaoShopBridge) return [];
    const allItems = window.MobaoShopBridge.SHOP_ITEMS;

    let filtered = allItems.filter(function (item) {
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery) && !item.description.toLowerCase().includes(searchQuery)) {
        return false;
      }
      if (categoryFilter !== "all") {
        const category = ITEM_CATEGORIES[categoryFilter];
        if (category && !category.items.includes(item.id)) {
          return false;
        }
      }
      return true;
    });

    if (sortFilter === "price-high") {
      filtered.sort(function (a, b) {
        return b.price - a.price;
      });
    } else if (sortFilter === "price-low") {
      filtered.sort(function (a, b) {
        return a.price - b.price;
      });
    }

    return filtered;
  }

  function renderAllItems() {
    const gridEl = document.getElementById("shopGrid");
    if (!gridEl || !window.MobaoShopBridge) return;

    const money = window.MobaoShopBridge.getPlayerMoney();
    const items = getFilteredItems();

    if (items.length === 0) {
      gridEl.innerHTML = '<div class="shop-empty-state">没有找到匹配的道具</div>';
      return;
    }

    gridEl.innerHTML = items.map(function (item) {
      const remaining = window.MobaoShopBridge.getRemainingDaily(item.id);
      const owned = window.MobaoShopBridge.getItemCount(item.id);
      const canBuy = remaining > 0 && money >= item.price;

      return [
        '<div class="shop-card">',
        '<div class="shop-card-icon">' + item.icon + '</div>',
        '<div class="shop-card-name">' + item.name + '</div>',
        '<div class="shop-card-desc">' + item.description + '</div>',
        '<div class="shop-card-meta">',
        '<span>今日 ' + remaining + '/' + item.maxDaily + '</span>',
        '<span>持有 ' + owned + '</span>',
        '</div>',
        '<button class="shop-card-buy" data-shop-item-id="' + item.id + '"' + (canBuy ? "" : " disabled") + ' type="button">' + item.price.toLocaleString() + '</button>',
        '</div>'
      ].join("");
    }).join("");

    gridEl.querySelectorAll(".shop-card-buy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const itemId = btn.getAttribute("data-shop-item-id");
        purchaseItem(itemId);
      });
    });
  }

  function renderInventory() {
    const gridEl = document.getElementById("shopInventoryGrid");
    if (!gridEl || !window.MobaoShopBridge) return;

    const inv = window.MobaoShopBridge.getFullInventory();
    const items = window.MobaoShopBridge.SHOP_ITEMS;

    const inventoryItems = items.map(function (item) {
      const storageKey = window.MobaoShopBridge.getItemStorageKey ? window.MobaoShopBridge.getItemStorageKey(item.id) : item.id.replace("item-", "").replace("-", "");
      const count = inv[storageKey] || 0;
      return {
        item: item,
        count: count
      };
    }).filter(function (entry) {
      return entry.count > 0;
    });

    if (inventoryItems.length === 0) {
      gridEl.innerHTML = '<div class="shop-empty-state">暂无道具</div>';
      return;
    }

    gridEl.innerHTML = inventoryItems.map(function (entry) {
      return [
        '<div class="shop-inventory-card">',
        '<div class="shop-inventory-icon">' + entry.item.icon + '</div>',
        '<div class="shop-inventory-info">',
        '<div class="shop-inventory-name">' + entry.item.name + '</div>',
        '<div class="shop-inventory-desc">' + entry.item.description + '</div>',
        '<div class="shop-inventory-count">x' + entry.count + '</div>',
        '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderLimitedOffers() {
    const panelEl = document.getElementById("shopTabLimited");
    if (!panelEl || !window.MobaoShopBridge) return;

    const offers = window.MobaoShopBridge.getLimitedOffers();
    const money = window.MobaoShopBridge.getPlayerMoney();

    if (!offers || offers.length === 0) {
      panelEl.innerHTML = '<div class="shop-limited-placeholder"><p>今日暂无特惠商品</p></div>';
      return;
    }

    const html = [
      '<div class="shop-limited-header">',
      '<p class="shop-limited-title">今日限时特惠</p>',
      '<p class="shop-limited-subtitle">每日零点刷新，每人限购一次</p>',
      '</div>',
      '<div class="shop-limited-grid">'
    ];

    offers.forEach(function (offer, index) {
      const item = window.MobaoShopBridge.SHOP_ITEMS.find(function (s) {
        return s.id === offer.itemId;
      });
      if (!item) return;

      const canBuy = !offer.purchased && money >= offer.discountedPrice;
      const discountPercent = Math.round(offer.discount * 100);
      const badge = offer.badge;

      html.push([
        '<div class="shop-limited-card' + (offer.purchased ? ' purchased' : '') + '">',
        '<div class="shop-discount-badge" style="background-color: ' + badge.color + ';">',
        '<span class="badge-label">' + badge.label + '</span>',
        '<span class="badge-discount">' + discountPercent + '%</span>',
        '</div>',
        '<div class="shop-limited-icon">' + item.icon + '</div>',
        '<div class="shop-limited-name">' + item.name + '</div>',
        '<div class="shop-limited-desc">' + item.description + '</div>',
        '<div class="shop-limited-price">',
        '<span class="price-original">' + offer.originalPrice.toLocaleString() + '</span>',
        '<span class="price-discounted">' + offer.discountedPrice.toLocaleString() + '</span>',
        '</div>',
        '<button class="shop-limited-buy" data-offer-index="' + index + '"' + (canBuy ? '' : ' disabled') + ' type="button">',
        offer.purchased ? '已购买' : '立即抢购',
        '</button>',
        '</div>'
      ].join(""));
    });

    html.push('</div>');
    panelEl.innerHTML = html.join("");

    panelEl.querySelectorAll(".shop-limited-buy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const offerIndex = parseInt(btn.getAttribute("data-offer-index"), 10);
        purchaseLimitedOffer(offerIndex);
      });
    });
  }

  function purchaseLimitedOffer(offerIndex) {
    if (!window.MobaoShopBridge) return;
    const result = window.MobaoShopBridge.purchaseLimitedOffer(offerIndex);
    if (result.ok) {
      updateMoneyDisplay();
      renderLimitedOffers();
      if (currentTab === "inventory") {
        renderInventory();
      }
      if (onPurchaseCallback) {
        onPurchaseCallback(result);
      }
    } else {
      alert(result.message);
    }
  }

  function purchaseItem(itemId) {
    if (!window.MobaoShopBridge) return;
    const result = window.MobaoShopBridge.purchaseItem(itemId);
    if (result.ok) {
      updateMoneyDisplay();
      renderAllItems();
      if (currentTab === "inventory") {
        renderInventory();
      }
      if (onPurchaseCallback) {
        onPurchaseCallback(result);
      }
    } else {
      alert(result.message);
    }
  }

  return {
    init: init,
    open: open,
    close: close,
    updateMoneyDisplay: updateMoneyDisplay,
    renderAllItems: renderAllItems,
    renderInventory: renderInventory,
    renderLimitedOffers: renderLimitedOffers,
    ITEM_CATEGORIES: ITEM_CATEGORIES
  };
})();