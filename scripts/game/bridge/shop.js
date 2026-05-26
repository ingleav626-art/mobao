window.MobaoShopBridge = (function () {
  const SHOP_STORAGE_KEY = "mobao_shop_inventory_v1";
  const SHOP_REFRESH_DATE_KEY = "mobao_shop_refresh_date_v1";
  const LIMITED_OFFER_KEY = "mobao_shop_limited_offer_v1";

  const DISCOUNT_BADGES = [
    { type: "fire", label: "爆款", color: "#ff4444", minDiscount: 0.1, maxDiscount: 0.3 },
    { type: "super", label: "超值", color: "#ff6b00", minDiscount: 0.3, maxDiscount: 0.5 },
    { type: "hot", label: "热卖", color: "#ff9500", minDiscount: 0.5, maxDiscount: 0.6 },
    { type: "sale", label: "特惠", color: "#ffc107", minDiscount: 0.6, maxDiscount: 0.7 }
  ];

  const SHOP_ITEMS = [
    { id: "item-outline-lamp", name: "探照灯", description: "揭示4件藏品轮廓", price: 0, icon: "🔦", maxDaily: 999 },
    { id: "item-quality-needle", name: "鉴定针", description: "优先对铜器揭示3件品质格", price: 0, icon: "🪡", maxDaily: 999 },
    { id: "item-outline-candle", name: "蜡烛", description: "揭示2件藏品轮廓", price: 0, icon: "🕯️", maxDaily: 999 },
    { id: "item-quality-glass", name: "放大镜", description: "精确揭示1件藏品品质格", price: 0, icon: "🔍", maxDaily: 999 },
    { id: "item-outline-torch", name: "火把", description: "揭示6件藏品轮廓", price: 0, icon: "🔥", maxDaily: 3 },
    { id: "item-cat-porcelain", name: "瓷器图谱", description: "优先对瓷器揭示3件轮廓", price: 0, icon: "🏺", maxDaily: 5 },
    { id: "item-cat-jade", name: "玉器鉴书", description: "优先对玉器揭示2件品质格", price: 0, icon: "💎", maxDaily: 5 },
    { id: "item-cat-bronze", name: "铜器拓片", description: "优先对铜器揭示4件轮廓", price: 0, icon: "🔔", maxDaily: 5 },
    { id: "item-cat-painting", name: "书画残卷", description: "优先对书画揭示3件品质格", price: 0, icon: "📜", maxDaily: 5 },
    { id: "item-cat-wood", name: "木器图录", description: "优先对木器揭示3件轮廓", price: 0, icon: "🪵", maxDaily: 5 },
    { id: "item-cat-stone", name: "金石拓本", description: "优先对金石揭示2件品质格", price: 0, icon: "🪨", maxDaily: 5 }
  ];

  function getItemStorageKey(itemId) {
    const map = {
      "item-outline-lamp": "outlineLamp",
      "item-quality-needle": "qualityNeedle",
      "item-outline-candle": "outlineCandle",
      "item-quality-glass": "qualityGlass",
      "item-outline-torch": "outlineTorch",
      "item-cat-porcelain": "catPorcelain",
      "item-cat-jade": "catJade",
      "item-cat-bronze": "catBronze",
      "item-cat-painting": "catPainting",
      "item-cat-wood": "catWood",
      "item-cat-stone": "catStone"
    };
    return map[itemId] || itemId;
  }

  function getDefaultInventory() {
    return {
      outlineLamp: 99,
      qualityNeedle: 99,
      outlineCandle: 99,
      qualityGlass: 99,
      outlineTorch: 99,
      catPorcelain: 99,
      catJade: 99,
      catBronze: 99,
      catPainting: 99,
      catWood: 99,
      catStone: 99
    };
  }

  function loadInventory() {
    try {
      const raw = window.localStorage.getItem(SHOP_STORAGE_KEY);
      if (!raw) return getDefaultInventory();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return getDefaultInventory();
      const defaults = getDefaultInventory();
      Object.keys(defaults).forEach((key) => {
        if (typeof parsed[key] !== "number") {
          parsed[key] = defaults[key];
        }
      });
      return parsed;
    } catch (_e) {
      return getDefaultInventory();
    }
  }

  function saveInventory(inv) {
    window.localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(inv));
  }

  function getTodayDateStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function loadDailyPurchases() {
    try {
      const raw = window.localStorage.getItem(SHOP_REFRESH_DATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      if (parsed.date !== getTodayDateStr()) return {};
      return parsed.purchases || {};
    } catch (_e) {
      return {};
    }
  }

  function saveDailyPurchases(purchases) {
    window.localStorage.setItem(SHOP_REFRESH_DATE_KEY, JSON.stringify({
      date: getTodayDateStr(),
      purchases
    }));
  }

  function getRemainingDaily(itemId) {
    const daily = loadDailyPurchases();
    const shopItem = SHOP_ITEMS.find((s) => s.id === itemId);
    if (!shopItem) return 0;
    const bought = daily[itemId] || 0;
    return Math.max(0, shopItem.maxDaily - bought);
  }

  function purchaseItem(itemId) {
    const shopItem = SHOP_ITEMS.find((s) => s.id === itemId);
    if (!shopItem) return { ok: false, message: "商品不存在" };

    const daily = loadDailyPurchases();
    const bought = daily[itemId] || 0;
    if (bought >= shopItem.maxDaily) {
      return { ok: false, message: "今日购买次数已达上限" };
    }

    const raw = window.localStorage.getItem("mobao_player_money_v1");
    const money = Math.max(0, Math.round(Number(raw) || 0));
    if (money < shopItem.price) {
      return { ok: false, message: "资金不足" };
    }

    const inv = loadInventory();
    const invKey = getItemStorageKey(itemId);
    inv[invKey] = (inv[invKey] || 0) + 1;
    saveInventory(inv);

    const newMoney = money - shopItem.price;
    window.localStorage.setItem("mobao_player_money_v1", String(newMoney));

    daily[itemId] = bought + 1;
    saveDailyPurchases(daily);

    return { ok: true, message: "购买成功", newMoney, newInventory: inv };
  }

  function consumeItem(itemId) {
    const inv = loadInventory();
    const invKey = getItemStorageKey(itemId);
    if ((inv[invKey] || 0) <= 0) {
      return { ok: false, message: "道具数量不足" };
    }
    inv[invKey] -= 1;
    saveInventory(inv);
    return { ok: true, newInventory: inv };
  }

  function getItemCount(itemId) {
    const inv = loadInventory();
    const invKey = getItemStorageKey(itemId);
    return inv[invKey] || 0;
  }

  function getFullInventory() {
    return loadInventory();
  }

  function getPlayerMoney() {
    const raw = window.localStorage.getItem("mobao_player_money_v1");
    return Math.max(0, Math.round(Number(raw) || 0));
  }

  function getDiscountBadge(discount) {
    for (let i = 0; i < DISCOUNT_BADGES.length; i++) {
      const badge = DISCOUNT_BADGES[i];
      if (discount >= badge.minDiscount && discount <= badge.maxDiscount) {
        return badge;
      }
    }
    return DISCOUNT_BADGES[DISCOUNT_BADGES.length - 1];
  }

  function generateLimitedOffers() {
    const availableItems = SHOP_ITEMS.filter(function (item) {
      return item.maxDaily > 0;
    });
    const shuffled = availableItems.slice().sort(function () {
      return Math.random() - 0.5;
    });
    const selected = shuffled.slice(0, 4);
    return selected.map(function (item) {
      const discount = Math.round((Math.random() * 6 + 1) * 10) / 100;
      const badge = getDiscountBadge(discount);
      return {
        itemId: item.id,
        discount: discount,
        badge: badge,
        discountedPrice: Math.round(item.price * discount),
        originalPrice: item.price,
        purchased: false
      };
    });
  }

  function loadLimitedOffers() {
    try {
      const raw = window.localStorage.getItem(LIMITED_OFFER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.date !== getTodayDateStr()) return null;
      if (!parsed.offers || !Array.isArray(parsed.offers)) return null;
      return parsed.offers;
    } catch (_e) {
      return null;
    }
  }

  function saveLimitedOffers(offers) {
    window.localStorage.setItem(LIMITED_OFFER_KEY, JSON.stringify({
      date: getTodayDateStr(),
      offers: offers
    }));
  }

  function getLimitedOffers() {
    const cached = loadLimitedOffers();
    if (cached) return cached;
    const newOffers = generateLimitedOffers();
    saveLimitedOffers(newOffers);
    return newOffers;
  }

  function purchaseLimitedOffer(offerIndex) {
    const offers = getLimitedOffers();
    if (offerIndex < 0 || offerIndex >= offers.length) {
      return { ok: false, message: "特惠商品不存在" };
    }
    const offer = offers[offerIndex];
    if (offer.purchased) {
      return { ok: false, message: "今日已购买该特惠商品" };
    }
    const shopItem = SHOP_ITEMS.find(function (s) {
      return s.id === offer.itemId;
    });
    if (!shopItem) {
      return { ok: false, message: "商品不存在" };
    }
    const raw = window.localStorage.getItem("mobao_player_money_v1");
    const money = Math.max(0, Math.round(Number(raw) || 0));
    if (money < offer.discountedPrice) {
      return { ok: false, message: "资金不足" };
    }
    const inv = loadInventory();
    const invKey = getItemStorageKey(offer.itemId);
    inv[invKey] = (inv[invKey] || 0) + 1;
    saveInventory(inv);
    const newMoney = money - offer.discountedPrice;
    window.localStorage.setItem("mobao_player_money_v1", String(newMoney));
    offer.purchased = true;
    saveLimitedOffers(offers);
    return { ok: true, message: "购买成功", newMoney: newMoney, newInventory: inv, offer: offer };
  }

  return {
    SHOP_ITEMS,
    DISCOUNT_BADGES,
    loadInventory,
    saveInventory,
    loadDailyPurchases,
    saveDailyPurchases,
    getRemainingDaily,
    purchaseItem,
    consumeItem,
    getItemCount,
    getFullInventory,
    getPlayerMoney,
    getItemStorageKey,
    getDiscountBadge,
    generateLimitedOffers,
    loadLimitedOffers,
    saveLimitedOffers,
    getLimitedOffers,
    purchaseLimitedOffer,
    SHOP_STORAGE_KEY,
    SHOP_REFRESH_DATE_KEY,
    LIMITED_OFFER_KEY
  };
})();
