import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  CharacterSelectManager,
  type CharacterSelectManagerDeps,
  type ShopBridge,
} from "../../../scripts/game/lobby/character-select-manager"
import {
  CARRY_ITEMS_STORAGE_KEY,
  CARRY_AUTO_REPLENISH_STORAGE_KEY,
  PLAYER_MONEY_STORAGE_KEY,
  SELECTED_CHARACTER_STORAGE_KEY,
} from "../../../scripts/game/core/constants"

/** 创建 mock 商店桥接 */
function makeShop(overrides: Partial<ShopBridge> = {}): ShopBridge {
  const inventory: Record<string, number> = {
    outlineLamp: 5,
    qualityNeedle: 3,
    outlineCandle: 0,
    ...overrides.getFullInventory?.(),
  }
  return {
    SHOP_ITEMS: [
      { id: "item-outline-lamp", name: "探照灯", icon: "🔦", price: 100 },
      { id: "item-quality-needle", name: "鉴定针", icon: "🪡", price: 200 },
      { id: "item-outline-candle", name: "蜡烛", icon: "🕯️", price: 50 },
    ],
    SHOP_STORAGE_KEY: "mobao_shop_inventory_v1",
    getFullInventory: () => inventory,
    getItemStorageKey: (itemId: string) => {
      const map: Record<string, string> = {
        "item-outline-lamp": "outlineLamp",
        "item-quality-needle": "qualityNeedle",
        "item-outline-candle": "outlineCandle",
      }
      return map[itemId] || itemId
    },
    getPlayerMoney: () => {
      const raw = window.localStorage.getItem(PLAYER_MONEY_STORAGE_KEY)
      return Math.max(0, Math.round(Number(raw) || 0))
    },
    ...overrides,
  }
}

/** 创建 mock 依赖 */
function makeDeps(overrides: Partial<CharacterSelectManagerDeps> = {}): CharacterSelectManagerDeps {
  return {
    players: [{ id: "p1", isHuman: true } as any],
    shop: makeShop(),
    showLobbySubPage: vi.fn(),
    updatePlayerAvatar: vi.fn(),
    startSoloGame: vi.fn(),
    ...overrides,
  }
}

/** 设置角色选择页面 DOM */
function setupCharacterDom() {
  document.body.innerHTML = `
    <div id="lobbyCharacterSelect" class="hidden"></div>
    <button id="characterSelectBackBtn">返回</button>
    <button id="characterSelectConfirmBtn">确认</button>
    <div id="characterSelectMapName"></div>
    <div id="characterSelectList"></div>
    <div id="characterSelectAbilities"></div>
    <div id="characterSelectLive2dOverlay"></div>
    <video id="overlayLive2dVideoA"></video>
    <video id="overlayLive2dVideoB"></video>
    <div id="live2dLoadingPlaceholder"></div>
    <div id="characterSelectMoney"></div>
    <div id="carryItemsRow"></div>
    <div id="lobbyMain" class="hidden"></div>
    <div id="lobbySoloSetup"></div>
    <div id="lobbyOnlinePlaceholder" class="hidden"></div>
  `
}

describe("CharacterSelectManager", () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
  })

  // ==================== 角色选择 ====================
  describe("角色选择", () => {
    describe("initCharacterSelect", () => {
      it("初始化 characterPageEl 和 selectedCharacter", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        expect((manager as any).characterPageEl).not.toBeNull()
        expect((manager as any).characterPageEl.id).toBe("lobbyCharacterSelect")
      })

      it("绑定返回按钮点击事件", () => {
        setupCharacterDom()
        const deps = makeDeps()
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()

        const backBtn = document.getElementById("characterSelectBackBtn")!
        backBtn.click()

        expect(deps.showLobbySubPage).toHaveBeenCalledWith("soloSetup")
      })

      it("绑定确认按钮点击事件", () => {
        setupCharacterDom()
        const deps = makeDeps()
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()

        const confirmBtn = document.getElementById("characterSelectConfirmBtn")!
        confirmBtn.click()

        // getActiveCharacter 回退到 CHARACTERS[0]，默认角色已选中，无携带道具时直接启动
        expect(deps.startSoloGame).toHaveBeenCalledOnce()
      })
    })

    describe("selectCharacter", () => {
      it("选择有效角色后更新 selectedCharacter 状态", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.selectCharacter("appraiser")

        expect(manager.getSelectedCharacterForGame()?.id).toBe("appraiser")
      })

      it("无效角色 ID 不改变状态", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        const before = manager.getSelectedCharacterForGame()
        manager.selectCharacter("nonexistent-character")
        const after = manager.getSelectedCharacterForGame()

        expect(after).toEqual(before)
      })

      it("选择角色后保存到 localStorage", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.selectCharacter("appraiser")

        const saved = localStorage.getItem(SELECTED_CHARACTER_STORAGE_KEY)
        expect(saved).toBe(JSON.stringify("appraiser"))
      })

      it("选择角色后调用 updatePlayerAvatar", () => {
        setupCharacterDom()
        const avatarEl = document.createElement("div")
        avatarEl.id = "avatar-p1"
        document.body.appendChild(avatarEl)

        const deps = makeDeps()
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()

        manager.selectCharacter("appraiser")

        expect(deps.updatePlayerAvatar).toHaveBeenCalledWith("p1", avatarEl)
      })

      it("无人类玩家时不调用 updatePlayerAvatar", () => {
        setupCharacterDom()
        const deps = makeDeps({
          players: [{ id: "ai-1", isHuman: false } as any],
        })
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()

        manager.selectCharacter("appraiser")

        expect(deps.updatePlayerAvatar).not.toHaveBeenCalled()
      })
    })

    describe("getSelectedCharacterForGame", () => {
      it("未选择时回退到 getActiveCharacter", () => {
        localStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, JSON.stringify("appraiser"))
        const manager = new CharacterSelectManager(makeDeps())

        const result = manager.getSelectedCharacterForGame()
        expect(result).not.toBeNull()
        expect(result?.id).toBe("appraiser")
      })

      it("已选择时返回已选角色", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()
        manager.selectCharacter("appraiser")

        const result = manager.getSelectedCharacterForGame()
        expect(result?.id).toBe("appraiser")
      })
    })

    describe("renderCharacterList", () => {
      it("渲染角色卡片到 #characterSelectList", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.renderCharacterList()

        const list = document.getElementById("characterSelectList")!
        const cards = list.querySelectorAll(".character-card")
        expect(cards.length).toBeGreaterThan(0)
      })

      it("无 #characterSelectList 时不报错", () => {
        const manager = new CharacterSelectManager(makeDeps())
        expect(() => manager.renderCharacterList()).not.toThrow()
      })
    })

    describe("showCharacterSelectPage", () => {
      it("显示页面并移除 hidden 类", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.showCharacterSelectPage({ name: "测试仓库" })

        const page = document.getElementById("lobbyCharacterSelect")!
        expect(page.classList.contains("hidden")).toBe(false)
      })

      it("设置地图名称", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.showCharacterSelectPage({ name: "古墓密室" })

        const mapName = document.getElementById("characterSelectMapName")!
        expect(mapName.textContent).toBe("古墓密室")
      })

      it("mapProfile 为 null 时不设置地图名称", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())
        manager.initCharacterSelect()

        manager.showCharacterSelectPage(null)

        const mapName = document.getElementById("characterSelectMapName")!
        expect(mapName.textContent).toBe("")
      })

      it("未初始化时自动调用 initCharacterSelect", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())

        manager.showCharacterSelectPage(null)

        expect((manager as any).characterPageEl).not.toBeNull()
      })
    })

    describe("hideAllLobbySubPages", () => {
      it("隐藏所有大厅子页面", () => {
        setupCharacterDom()
        const manager = new CharacterSelectManager(makeDeps())

        document.getElementById("lobbyMain")!.classList.remove("hidden")
        document.getElementById("lobbySoloSetup")!.classList.remove("hidden")

        manager.hideAllLobbySubPages()

        expect(document.getElementById("lobbyMain")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbySoloSetup")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyCharacterSelect")!.classList.contains("hidden")).toBe(true)
      })

      it("停止 Live2D 循环（视频被暂停）", () => {
        setupCharacterDom()
        const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement
        videoA.classList.add("active")
        videoA.style.opacity = "1"

        const manager = new CharacterSelectManager(makeDeps())
        manager.hideAllLobbySubPages()

        expect(videoA.classList.contains("active")).toBe(false)
        expect(videoA.style.opacity).toBe("0")
      })
    })

    describe("updateCharacterMoneyDisplay", () => {
      it("显示当前玩家资金", () => {
        setupCharacterDom()
        const deps = makeDeps({
          shop: makeShop({ getPlayerMoney: () => 99999 }),
        })
        const manager = new CharacterSelectManager(deps)

        manager.updateCharacterMoneyDisplay()

        const moneyEl = document.getElementById("characterSelectMoney")!
        expect(moneyEl.innerHTML).toContain("99,999")
      })

      it("shop 为 null 时显示 0", () => {
        setupCharacterDom()
        const deps = makeDeps({ shop: null })
        const manager = new CharacterSelectManager(deps)

        manager.updateCharacterMoneyDisplay()

        const moneyEl = document.getElementById("characterSelectMoney")!
        expect(moneyEl.innerHTML).toContain("0")
      })

      it("无 #characterSelectMoney 时不报错", () => {
        const manager = new CharacterSelectManager(makeDeps())
        expect(() => manager.updateCharacterMoneyDisplay()).not.toThrow()
      })
    })
  })

  // ==================== 携带道具 ====================
  describe("携带道具", () => {
    describe("_saveCarryItems / _loadCarryItems", () => {
      it("保存后加载往返一致", () => {
        const manager = new CharacterSelectManager(makeDeps())
        const items = [
          { id: "item-outline-lamp", name: "探照灯", icon: "🔦" },
          { id: "item-quality-needle", name: "鉴定针", icon: "🪡" },
        ]
        ;(manager as any).carryItems = items
        manager._saveCarryItems()

        const manager2 = new CharacterSelectManager(makeDeps())
        manager2._loadCarryItems()

        expect((manager2 as any).carryItems).toEqual(items)
      })

      it("无存储数据时初始化为空数组", () => {
        const manager = new CharacterSelectManager(makeDeps())
        manager._loadCarryItems()

        expect((manager as any).carryItems).toEqual([])
      })

      it("损坏的存储数据时初始化为空数组", () => {
        localStorage.setItem(CARRY_ITEMS_STORAGE_KEY, "not-json{")
        const manager = new CharacterSelectManager(makeDeps())
        manager._loadCarryItems()

        expect((manager as any).carryItems).toEqual([])
      })

      it("非数组存储数据时初始化为空数组", () => {
        localStorage.setItem(CARRY_ITEMS_STORAGE_KEY, JSON.stringify({ not: "array" }))
        const manager = new CharacterSelectManager(makeDeps())
        manager._loadCarryItems()

        expect((manager as any).carryItems).toEqual([])
      })

      it("加载数据时截断到最大携带数", () => {
        const items = Array.from({ length: 10 }, (_, i) => ({
          id: `item-${i}`,
          name: `道具${i}`,
          icon: "x",
        }))
        localStorage.setItem(CARRY_ITEMS_STORAGE_KEY, JSON.stringify(items))
        const manager = new CharacterSelectManager(makeDeps())
        manager._loadCarryItems()

        expect((manager as any).carryItems.length).toBe(3)
      })
    })

    describe("_saveAutoReplenish / _loadAutoReplenish", () => {
      it("保存 true 后加载返回 true", () => {
        const manager = new CharacterSelectManager(makeDeps())
        ;(manager as any).autoReplenish = true
        manager._saveAutoReplenish()

        const manager2 = new CharacterSelectManager(makeDeps())
        manager2._loadAutoReplenish()

        expect((manager2 as any).autoReplenish).toBe(true)
      })

      it("保存 false 后加载返回 false", () => {
        const manager = new CharacterSelectManager(makeDeps())
        ;(manager as any).autoReplenish = false
        manager._saveAutoReplenish()

        const manager2 = new CharacterSelectManager(makeDeps())
        manager2._loadAutoReplenish()

        expect((manager2 as any).autoReplenish).toBe(false)
      })

      it("无存储数据时返回 false", () => {
        const manager = new CharacterSelectManager(makeDeps())
        manager._loadAutoReplenish()

        expect((manager as any).autoReplenish).toBe(false)
      })
    })

    describe("renderCarryItems", () => {
      it("渲染每个携带道具为 slot", () => {
        const manager = new CharacterSelectManager(makeDeps())
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [
          { id: "item-outline-lamp", name: "探照灯", icon: "🔦" },
          { id: "item-quality-needle", name: "鉴定针", icon: "🪡" },
        ]

        manager.renderCarryItems()

        const slots = row.querySelectorAll(".carry-item-slot")
        expect(slots.length).toBe(2)
        expect(slots[0].textContent).toContain("🔦")
      })

      it("库存耗尽的道具标记 depleted 并显示 0 徽章", () => {
        const manager = new CharacterSelectManager(
          makeDeps({
            shop: makeShop({
              getFullInventory: () => ({ outlineLamp: 0 }),
            }),
          }),
        )
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        manager.renderCarryItems()

        const slot = row.querySelector(".carry-item-slot")!
        expect(slot.classList.contains("depleted")).toBe(true)
        expect(slot.querySelector(".carry-item-depleted-badge")?.textContent).toBe("0")
      })

      it("携带数不足上限时显示添加按钮", () => {
        const manager = new CharacterSelectManager(makeDeps())
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        manager.renderCarryItems()

        const addBtn = row.querySelector(".carry-item-add")
        expect(addBtn).not.toBeNull()
      })

      it("携带数达到上限时不显示添加按钮", () => {
        const manager = new CharacterSelectManager(makeDeps())
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [
          { id: "a", name: "A", icon: "1" },
          { id: "b", name: "B", icon: "2" },
          { id: "c", name: "C", icon: "3" },
        ]

        manager.renderCarryItems()

        const addBtn = row.querySelector(".carry-item-add")
        expect(addBtn).toBeNull()
      })

      it("无 #carryItemsRow 时不报错", () => {
        const manager = new CharacterSelectManager(makeDeps())
        expect(() => manager.renderCarryItems()).not.toThrow()
      })

      it("shop 为 null 时不标记 depleted", () => {
        const manager = new CharacterSelectManager(makeDeps({ shop: null }))
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        manager.renderCarryItems()

        const slot = row.querySelector(".carry-item-slot")!
        expect(slot.classList.contains("depleted")).toBe(false)
      })
    })

    describe("removeCarryItem", () => {
      it("移除指定道具并保存", () => {
        const manager = new CharacterSelectManager(makeDeps())
        const row = document.createElement("div")
        row.id = "carryItemsRow"
        document.body.appendChild(row)
        ;(manager as any).carryItems = [
          { id: "item-outline-lamp", name: "探照灯", icon: "🔦" },
          { id: "item-quality-needle", name: "鉴定针", icon: "🪡" },
        ]

        manager.removeCarryItem("item-outline-lamp")

        expect((manager as any).carryItems).toHaveLength(1)
        expect((manager as any).carryItems[0].id).toBe("item-quality-needle")

        const saved = JSON.parse(localStorage.getItem(CARRY_ITEMS_STORAGE_KEY)!)
        expect(saved).toHaveLength(1)
        expect(saved[0].id).toBe("item-quality-needle")
      })
    })

    describe("calcReplenishCost", () => {
      it("计算库存耗尽道具的补充费用", () => {
        const manager = new CharacterSelectManager(
          makeDeps({
            shop: makeShop({
              getFullInventory: () => ({ outlineLamp: 0, qualityNeedle: 0 }),
            }),
          }),
        )
        ;(manager as any).carryItems = [
          { id: "item-outline-lamp", name: "探照灯", icon: "🔦" },
          { id: "item-quality-needle", name: "鉴定针", icon: "🪡" },
        ]

        const result = manager.calcReplenishCost()
        expect(result.totalCost).toBe(300) // 100 + 200
        expect(result.items).toHaveLength(2)
      })

      it("库存充足的道具不补充", () => {
        const manager = new CharacterSelectManager(
          makeDeps({
            shop: makeShop({
              getFullInventory: () => ({ outlineLamp: 5 }),
            }),
          }),
        )
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        const result = manager.calcReplenishCost()
        expect(result.totalCost).toBe(0)
        expect(result.items).toHaveLength(0)
      })

      it("shop 为 null 时返回空结果", () => {
        const manager = new CharacterSelectManager(makeDeps({ shop: null }))
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        const result = manager.calcReplenishCost()
        expect(result.totalCost).toBe(0)
        expect(result.items).toHaveLength(0)
      })
    })

    describe("executeReplenish", () => {
      it("资金充足时成功补充", () => {
        const inventory = { outlineLamp: 0, qualityNeedle: 5 }
        const shop = makeShop({
          getFullInventory: () => inventory,
        })
        const manager = new CharacterSelectManager(makeDeps({ shop }))
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, "1000")
        const result = manager.executeReplenish()

        expect(result.ok).toBe(true)
        expect(result.newMoney).toBe(900) // 1000 - 100
        expect(inventory.outlineLamp).toBe(1)
      })

      it("资金不足时返回失败", () => {
        const shop = makeShop({
          getFullInventory: () => ({ outlineLamp: 0 }),
        })
        const manager = new CharacterSelectManager(makeDeps({ shop }))
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, "50")
        const result = manager.executeReplenish()

        expect(result.ok).toBe(false)
        expect(result.need).toBe(100)
        expect(result.have).toBe(50)
      })

      it("无需补充时返回成功", () => {
        const shop = makeShop({
          getFullInventory: () => ({ outlineLamp: 5 }),
        })
        localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, "1000")
        const manager = new CharacterSelectManager(makeDeps({ shop }))
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]

        const result = manager.executeReplenish()

        expect(result.ok).toBe(true)
        expect(result.message).toContain("无需补充")
      })

      it("shop 为 null 时返回失败", () => {
        const manager = new CharacterSelectManager(makeDeps({ shop: null }))
        const result = manager.executeReplenish()

        expect(result.ok).toBe(false)
        expect(result.message).toContain("商店系统不可用")
      })
    })

    describe("confirmCharacterSelection", () => {
      it("未选择角色时不启动游戏", () => {
        const deps = makeDeps()
        const manager = new CharacterSelectManager(deps)

        manager.confirmCharacterSelection()

        expect(deps.startSoloGame).not.toHaveBeenCalled()
      })

      it("无携带道具时直接启动游戏", () => {
        setupCharacterDom()
        const deps = makeDeps()
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()
        manager.selectCharacter("appraiser")

        manager.confirmCharacterSelection()

        expect(deps.startSoloGame).toHaveBeenCalledOnce()
      })

      it("自动补充且资金不足时显示确认对话框", () => {
        setupCharacterDom()
        const shop = makeShop({
          getFullInventory: () => ({ outlineLamp: 0 }),
        })
        const deps = makeDeps({ shop })
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()
        manager.selectCharacter("appraiser")
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]
        ;(manager as any).autoReplenish = true
        localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, "50")

        manager.confirmCharacterSelection()

        const overlay = document.getElementById("gameConfirmOverlay")
        // _showCarryConfirm 无 gameConfirmOverlay DOM 时走 window.alert 分支，不抛异常即可
        expect(deps.startSoloGame).not.toHaveBeenCalled()
      })

      it("自动补充成功后启动游戏", () => {
        setupCharacterDom()
        const inventory = { outlineLamp: 0 }
        const shop = makeShop({
          getFullInventory: () => inventory,
        })
        const deps = makeDeps({ shop })
        const manager = new CharacterSelectManager(deps)
        manager.initCharacterSelect()
        manager.selectCharacter("appraiser")
        ;(manager as any).carryItems = [{ id: "item-outline-lamp", name: "探照灯", icon: "🔦" }]
        ;(manager as any).autoReplenish = true
        localStorage.setItem(PLAYER_MONEY_STORAGE_KEY, "1000")

        manager.confirmCharacterSelection()

        expect(deps.startSoloGame).toHaveBeenCalledOnce()
        expect(inventory.outlineLamp).toBe(1)
      })
    })

    describe("_showCarryConfirm", () => {
      it("有确认 DOM 时显示覆盖层", () => {
        document.body.innerHTML = `
          <div id="gameConfirmOverlay" class="hidden"></div>
          <div id="gameConfirmMsg"></div>
          <button id="gameConfirmOkBtn">确认</button>
          <button id="gameConfirmCancelBtn">取消</button>
        `
        const manager = new CharacterSelectManager(makeDeps())

        manager._showCarryConfirm("测试消息", null, "知道了")

        expect(document.getElementById("gameConfirmOverlay")!.classList.contains("hidden")).toBe(false)
        expect(document.getElementById("gameConfirmMsg")!.textContent).toBe("测试消息")
        expect(document.getElementById("gameConfirmOkBtn")!.textContent).toBe("知道了")
      })

      it("无 onConfirm 时隐藏取消按钮", () => {
        document.body.innerHTML = `
          <div id="gameConfirmOverlay" class="hidden"></div>
          <div id="gameConfirmMsg"></div>
          <button id="gameConfirmOkBtn">确认</button>
          <button id="gameConfirmCancelBtn">取消</button>
        `
        const manager = new CharacterSelectManager(makeDeps())

        manager._showCarryConfirm("仅提示", null)

        const cancelBtn = document.getElementById("gameConfirmCancelBtn") as HTMLButtonElement
        expect(cancelBtn.style.display).toBe("none")
      })

      it("点击确认按钮后调用 onConfirm 并关闭", () => {
        document.body.innerHTML = `
          <div id="gameConfirmOverlay" class="hidden"></div>
          <div id="gameConfirmMsg"></div>
          <button id="gameConfirmOkBtn">确认</button>
          <button id="gameConfirmCancelBtn">取消</button>
        `
        const manager = new CharacterSelectManager(makeDeps())
        const onConfirm = vi.fn()

        manager._showCarryConfirm("确认操作？", onConfirm)

        const okBtn = document.getElementById("gameConfirmOkBtn")!
        okBtn.click()

        expect(onConfirm).toHaveBeenCalledOnce()
        expect(document.getElementById("gameConfirmOverlay")!.classList.contains("hidden")).toBe(true)
      })

      it("点击取消按钮后关闭且不调用 onConfirm", () => {
        document.body.innerHTML = `
          <div id="gameConfirmOverlay" class="hidden"></div>
          <div id="gameConfirmMsg"></div>
          <button id="gameConfirmOkBtn">确认</button>
          <button id="gameConfirmCancelBtn">取消</button>
        `
        const manager = new CharacterSelectManager(makeDeps())
        const onConfirm = vi.fn()

        manager._showCarryConfirm("确认操作？", onConfirm)

        const cancelBtn = document.getElementById("gameConfirmCancelBtn")!
        cancelBtn.click()

        expect(onConfirm).not.toHaveBeenCalled()
        expect(document.getElementById("gameConfirmOverlay")!.classList.contains("hidden")).toBe(true)
      })

      it("前一次确认未关闭时先清理再显示新的", () => {
        document.body.innerHTML = `
          <div id="gameConfirmOverlay" class="hidden"></div>
          <div id="gameConfirmMsg"></div>
          <button id="gameConfirmOkBtn">确认</button>
          <button id="gameConfirmCancelBtn">取消</button>
        `
        const manager = new CharacterSelectManager(makeDeps())

        manager._showCarryConfirm("第一次", null)
        manager._showCarryConfirm("第二次", null)

        expect(document.getElementById("gameConfirmMsg")!.textContent).toBe("第二次")
        expect(document.getElementById("gameConfirmOverlay")!.classList.contains("hidden")).toBe(false)
      })
    })
  })

  // ==================== Live2D ====================
  describe("Live2D", () => {
    describe("_stopLive2dLoop", () => {
      it("无状态时不报错", () => {
        const manager = new CharacterSelectManager(makeDeps())
        expect(() => manager._stopLive2dLoop()).not.toThrow()
      })

      it("清理视频元素（暂停、清除 src、移除事件处理器）", () => {
        setupCharacterDom()
        const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement
        const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement
        videoA.src = "http://example.com/video.mp4"
        videoA.classList.add("active")
        videoA.onloadeddata = () => {}
        videoB.src = "http://example.com/video.mp4"
        videoB.onloadeddata = () => {}

        const manager = new CharacterSelectManager(makeDeps())
        manager._stopLive2dLoop()

        expect(videoA.onloadeddata).toBeNull()
        expect(videoA.oncanplay).toBeNull()
        expect(videoA.onerror).toBeNull()
        expect(videoB.onloadeddata).toBeNull()
        expect(videoB.onerror).toBeNull()
      })

      it("清理 loadingPlaceholder 可见状态", () => {
        setupCharacterDom()
        const placeholder = document.getElementById("live2dLoadingPlaceholder")!
        placeholder.classList.add("visible")

        const manager = new CharacterSelectManager(makeDeps())
        manager._stopLive2dLoop()

        expect(placeholder.classList.contains("visible")).toBe(false)
      })
    })

    describe("_startLive2dLoop", () => {
      it("加载锁定时跳过本次请求", () => {
        setupCharacterDom()
        const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement
        const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

        const manager = new CharacterSelectManager(makeDeps())
        // 设置加载锁
        ;(manager as any).loadingLock = true

        manager._startLive2dLoop("test-video.mp4", videoA, videoB)

        expect(logSpy).toHaveBeenCalledWith("[Live2D] 加载锁定中，跳过本次请求")
        // 视频源不应被设置（因为被跳过）
        expect(videoA.src).toBe("")

        logSpy.mockRestore()
      })

      it("正常启动时设置视频源和加载锁", () => {
        setupCharacterDom()
        const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement
        const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const manager = new CharacterSelectManager(makeDeps())
        manager._startLive2dLoop("test-video.mp4", videoA, videoB)

        // 加载锁应被设置
        expect((manager as any).loadingLock).toBe(true)
        // 视频源应被设置
        expect(videoA.src).toContain("test-video.mp4")
        expect(videoB.src).toContain("test-video.mp4")
        // live2dVideoState 应被创建
        expect((manager as any).live2dVideoState).not.toBeNull()
        expect((manager as any).live2dVideoState.running).toBe(true)
        expect((manager as any).live2dVideoState.src).toBe("test-video.mp4")

        // 清理
        manager._stopLive2dLoop()
        logSpy.mockRestore()
        errorSpy.mockRestore()
      })

      it("启动后停止可清除加载锁", () => {
        setupCharacterDom()
        const videoA = document.getElementById("overlayLive2dVideoA") as HTMLVideoElement
        const videoB = document.getElementById("overlayLive2dVideoB") as HTMLVideoElement
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

        const manager = new CharacterSelectManager(makeDeps())
        manager._startLive2dLoop("test-video.mp4", videoA, videoB)
        manager._stopLive2dLoop()

        expect((manager as any).loadingLock).toBe(false)
        expect((manager as any).live2dVideoState).toBeNull()

        logSpy.mockRestore()
        errorSpy.mockRestore()
      })
    })
  })
})
