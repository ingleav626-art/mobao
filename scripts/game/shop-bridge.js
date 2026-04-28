window.MobaoShopBridge = (function () {
  const SHOP_STORAGE_KEY = "mobao_shop_inventory_v1";
  const SHOP_REFRESH_DATE_KEY = "mobao_shop_refresh_date_v1";

  const SHOP_ITEMS = [
    {
      id: "item-outline-lamp",
      name: "探照灯",
      description: "揭示4件藏品轮廓",
      price: 80000,
      icon: "🔦",
      maxDaily: 3
    },
    {
      id: "item-quality-needle",
      name: "鉴定针",
      description: "优先对铜器揭示3件品质格",
      price: 120000,
      icon: "🪡",
      maxDaily: 3
    }
  ];

  function loadInventory() {
    try {
      const raw = window.localStorage.getItem(SHOP_STORAGE_KEY);
      if (!raw) return getDefaultInventory();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return getDefaultInventory();
      return {
        outlineLamp: Math.max(0, Math.round(Number(parsed.outlineLamp) || 0)),
        qualityNeedle: Math.max(0, Math.round(Number(parsed.qualityNeedle) || 0))
      };
    } catch (_e) {
      return getDefaultInventory();
    }
  }

  function getDefaultInventory() {
    return { outlineLamp: 2, qualityNeedle: 2 };
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
    const invKey = itemId === "item-outline-lamp" ? "outlineLamp" : "qualityNeedle";
    inv[invKey] += 1;
    saveInventory(inv);

    const newMoney = money - shopItem.price;
    window.localStorage.setItem("mobao_player_money_v1", String(newMoney));

    daily[itemId] = bought + 1;
    saveDailyPurchases(daily);

    return { ok: true, message: "购买成功", newMoney, newInventory: inv };
  }

  function consumeItem(itemId) {
    const inv = loadInventory();
    const invKey = itemId === "item-outline-lamp" ? "outlineLamp" : "qualityNeedle";
    if (inv[invKey] <= 0) {
      return { ok: false, message: "道具数量不足" };
    }
    inv[invKey] -= 1;
    saveInventory(inv);
    return { ok: true, newInventory: inv };
  }

  function getItemCount(itemId) {
    const inv = loadInventory();
    const invKey = itemId === "item-outline-lamp" ? "outlineLamp" : "qualityNeedle";
    return inv[invKey] || 0;
  }

  function getFullInventory() {
    return loadInventory();
  }

  function getPlayerMoney() {
    const raw = window.localStorage.getItem("mobao_player_money_v1");
    return Math.max(0, Math.round(Number(raw) || 0));
  }

  return {
    SHOP_ITEMS,
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
    SHOP_STORAGE_KEY,
    SHOP_REFRESH_DATE_KEY
  };
})();
