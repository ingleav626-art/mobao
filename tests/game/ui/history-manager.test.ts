import { describe, it, expect, vi } from "vitest"
import { JSDOM } from "jsdom"
import { HistoryManager } from "../../../scripts/game/ui/history-manager"
import type { HistoryData } from "../../../scripts/game/ui/history"
import type { ItemDef } from "../../../types/game"

function makeData(): HistoryData {
  return {
    playerRoundHistory: {},
    playerUsageHistory: {},
    currentRoundUsage: {},
    playerHistoryPanels: {},
  }
}

const players = [{ id: "p1" }, { id: "p2" }]

function getItemInfo(itemId: string): ItemDef {
  const defs: Record<string, ItemDef> = {
    "item-lamp": {
      id: "item-lamp",
      name: "轮廓探灯",
      label: "探灯",
      description: "揭示轮廓",
      type: "reveal",
      execute: (() => ({})) as any,
    },
    "item-scope": {
      id: "item-scope",
      name: "品质鉴定",
      label: "鉴定",
      description: "揭示品质",
      type: "reveal",
      execute: (() => ({})) as any,
    },
  }
  return defs[itemId] || { id: itemId, name: itemId, label: itemId, description: "", type: "", execute: (() => ({})) as any }
}

function makeManager(overrides: { data?: HistoryData; getRound?: () => number; getDrawerState?: () => any } = {}) {
  const data = overrides.data || makeData()
  const dom = new JSDOM('<div id="drawer" class="hidden"></div><div id="list"></div>')
  const drawerEl = dom.window.document.querySelector("#drawer") as HTMLElement
  const listEl = dom.window.document.querySelector("#list") as HTMLElement
  const fullDom: Record<string, HTMLElement | null> = {
    itemDrawer: drawerEl,
    itemDrawerList: listEl,
    itemDrawerToggleBtn: null,
  }
  const itemManager = {
    getItemState: () => [{ id: "item-lamp", count: 2 }],
  }
  const renderFn = vi.fn()
  const closeBidKeypadFn = vi.fn()
  const deps = {
    players,
    data,
    dom: fullDom,
    itemManager,
    getRound: overrides.getRound || (() => 1),
    getDrawerState:
      overrides.getDrawerState ||
      (() => ({
        settled: false,
        roundResolving: false,
        playerBidSubmitted: false,
        roundTimeLeft: 30,
      })),
    closeBidKeypad: closeBidKeypadFn,
    isSettingsOverlayOpen: () => false,
    isSettlementPageActive: () => false,
    getItemInfo,
  }
  const manager = new HistoryManager(deps)
  return { manager, data, dom: fullDom, renderFn, closeBidKeypadFn, itemManager }
}

describe("HistoryManager", () => {
  describe("resetPlayerHistoryState", () => {
    it("初始化所有玩家的历史数据", () => {
      const { manager, data } = makeManager()
      manager.resetPlayerHistoryState()
      expect(data.playerRoundHistory["p1"]).toEqual([])
      expect(data.playerRoundHistory["p2"]).toEqual([])
      expect(data.currentRoundUsage["p1"]).toEqual([])
    })
  })

  describe("clearCurrentRoundUsage", () => {
    it("清空所有玩家当前回合使用记录", () => {
      const { manager, data } = makeManager()
      data.currentRoundUsage["p1"] = ["item-lamp"]
      manager.clearCurrentRoundUsage()
      expect(data.currentRoundUsage["p1"]).toEqual([])
    })
  })

  describe("recordPlayerUsage", () => {
    it("记录道具使用", () => {
      const { manager, data } = makeManager()
      data.currentRoundUsage["p1"] = []
      manager.recordPlayerUsage("p1", "item-lamp")
      expect(data.currentRoundUsage["p1"]).toEqual(["item-lamp"])
    })
  })

  describe("recordRoundHistory", () => {
    it("记录一轮出价和道具使用", () => {
      const { manager, data } = makeManager()
      manager.resetPlayerHistoryState()
      data.currentRoundUsage["p1"] = ["item-lamp"]
      manager.recordRoundHistory([
        { playerId: "p1", bid: 5000 },
        { playerId: "p2", bid: 3000 },
      ])
      expect(data.playerRoundHistory["p1"]).toEqual([{ round: 1, bid: 5000 }])
      expect(data.playerUsageHistory["p1"]).toEqual([{ round: 1, actions: ["item-lamp"] }])
    })

    it("使用注入的 getRound 回调获取回合号", () => {
      const { manager, data } = makeManager({ getRound: () => 5 })
      manager.resetPlayerHistoryState()
      manager.recordRoundHistory([{ playerId: "p1", bid: 100 }])
      expect(data.playerRoundHistory["p1"][0].round).toBe(5)
    })
  })

  describe("renderItemUsageCell", () => {
    it("空 actions 返回空标记", () => {
      const { manager } = makeManager()
      const result = manager.renderItemUsageCell([])
      expect(result).toContain("history-empty")
    })

    it("单个道具渲染为 chip", () => {
      const { manager } = makeManager()
      const result = manager.renderItemUsageCell(["item-lamp"])
      expect(result).toContain("history-chip")
      expect(result).toContain("探灯")
    })
  })

  describe("toggleItemDrawer", () => {
    it("抽屉隐藏时打开", () => {
      const { manager, dom } = makeManager()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(true)
      manager.toggleItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(false)
    })

    it("抽屉显示时关闭", () => {
      const { manager, dom } = makeManager()
      dom.itemDrawer!.classList.remove("hidden")
      manager.toggleItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(true)
    })
  })

  describe("openItemDrawer", () => {
    it("正常状态时打开抽屉并调用 closeBidKeypad", () => {
      const { manager, dom, closeBidKeypadFn } = makeManager()
      manager.openItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(false)
      expect(closeBidKeypadFn).toHaveBeenCalledOnce()
    })

    it("结算状态时锁定不打开", () => {
      const { manager, dom } = makeManager({
        getDrawerState: () => ({
          settled: true,
          roundResolving: false,
          playerBidSubmitted: false,
          roundTimeLeft: 30,
        }),
      })
      manager.openItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(true)
    })

    it("玩家已出价时锁定不打开", () => {
      const { manager, dom } = makeManager({
        getDrawerState: () => ({
          settled: false,
          roundResolving: false,
          playerBidSubmitted: true,
          roundTimeLeft: 30,
        }),
      })
      manager.openItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(true)
    })
  })

  describe("closeItemDrawer", () => {
    it("关闭抽屉", () => {
      const { manager, dom } = makeManager()
      dom.itemDrawer!.classList.remove("hidden")
      manager.closeItemDrawer()
      expect(dom.itemDrawer!.classList.contains("hidden")).toBe(true)
    })
  })

  describe("renderItemDrawer", () => {
    it("渲染道具列表", () => {
      const { manager, dom } = makeManager()
      manager.renderItemDrawer()
      expect(dom.itemDrawerList!.innerHTML).toContain("item-drawer-btn")
      expect(dom.itemDrawerList!.innerHTML).toContain("探灯")
      expect(dom.itemDrawerList!.innerHTML).toContain("x2")
    })

    it("锁定状态时道具按钮禁用", () => {
      const { manager, dom } = makeManager({
        getDrawerState: () => ({
          settled: true,
          roundResolving: false,
          playerBidSubmitted: false,
          roundTimeLeft: 30,
        }),
      })
      manager.renderItemDrawer()
      expect(dom.itemDrawerList!.innerHTML).toContain("is-empty")
      expect(dom.itemDrawerList!.innerHTML).toContain("disabled")
    })
  })
})
