import { describe, it, expect, vi } from "vitest"
import { JSDOM } from "jsdom"
import { PanelsManager, type PanelsLanBridge } from "../../../scripts/game/ui/panels-manager"
import type { IntelEntry } from "../../../scripts/game/ui/panels"

function makeDoms() {
  const dom = new JSDOM('<div id="private"></div><div id="public"></div>')
  const personalPanelScroll = dom.window.document.querySelector("#private") as HTMLElement
  const publicInfoScroll = dom.window.document.querySelector("#public") as HTMLElement
  return { personalPanelScroll, publicInfoScroll }
}

function makeManager(overrides: {
  privateIntelEntries?: IntelEntry[]
  publicInfoEntries?: IntelEntry[]
  getRound?: () => number
  getLanBridge?: () => PanelsLanBridge
  getIsLanMode?: () => boolean
  getLanIsHost?: () => boolean
} = {}) {
  const { personalPanelScroll, publicInfoScroll } = makeDoms()
  const privateIntelEntries = overrides.privateIntelEntries || []
  const publicInfoEntries = overrides.publicInfoEntries || []
  const sendFn = vi.fn()
  const lanBridge = { send: sendFn }
  const deps = {
    privateIntelEntries,
    publicInfoEntries,
    dom: {
      personalPanelScroll,
      publicInfoScroll,
    } as Record<string, HTMLElement | null>,
    getRound: overrides.getRound || (() => 1),
    getLanBridge: overrides.getLanBridge || (() => lanBridge),
    getIsLanMode: overrides.getIsLanMode || (() => true),
    getLanIsHost: overrides.getLanIsHost || (() => true),
  }
  const manager = new PanelsManager(deps)
  return {
    manager,
    privateIntelEntries,
    publicInfoEntries,
    personalPanelScroll,
    publicInfoScroll,
    sendFn,
    lanBridge,
  }
}

describe("PanelsManager", () => {
  describe("addPrivateIntelEntry", () => {
    it("添加条目到 privateIntelEntries 并使用注入的回合号", () => {
      const { manager, privateIntelEntries } = makeManager({ getRound: () => 3 })
      manager.addPrivateIntelEntry({ source: "技能", text: "发现轮廓" })
      expect(privateIntelEntries).toHaveLength(1)
      expect(privateIntelEntries[0]).toEqual({ source: "技能", text: "发现轮廓", round: 3 })
    })

    it("缺省字段使用默认值", () => {
      const { manager, privateIntelEntries } = makeManager()
      manager.addPrivateIntelEntry({})
      expect(privateIntelEntries[0].source).toBe("未知")
      expect(privateIntelEntries[0].text).toBe("")
    })

    it("多次调用追加条目", () => {
      const { manager, privateIntelEntries } = makeManager({ getRound: () => 1 })
      manager.addPrivateIntelEntry({ text: "a" })
      manager.addPrivateIntelEntry({ text: "b" })
      expect(privateIntelEntries).toHaveLength(2)
    })
  })

  describe("addPublicInfoEntry", () => {
    it("添加条目到 publicInfoEntries", () => {
      const { manager, publicInfoEntries } = makeManager()
      manager.addPublicInfoEntry({ source: "系统", text: "回合开始" })
      expect(publicInfoEntries).toHaveLength(1)
      expect(publicInfoEntries[0].source).toBe("系统")
    })

    it("联机模式且为主机时通过 lanBridge 广播", () => {
      const { manager, sendFn } = makeManager()
      manager.addPublicInfoEntry({ source: "测试", text: "消息" })
      expect(sendFn).toHaveBeenCalledOnce()
      expect(sendFn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lan:public-info",
          source: "测试",
          text: "消息",
        }),
      )
    })

    it("非联机模式不调用 lanBridge.send", () => {
      const { manager, sendFn } = makeManager({ getIsLanMode: () => false })
      manager.addPublicInfoEntry({ text: "msg" })
      expect(sendFn).not.toHaveBeenCalled()
    })

    it("非主机不调用 lanBridge.send", () => {
      const { manager, sendFn } = makeManager({ getLanIsHost: () => false })
      manager.addPublicInfoEntry({ text: "msg" })
      expect(sendFn).not.toHaveBeenCalled()
    })

    it("lanBridge 为 null 时不崩溃", () => {
      const { manager } = makeManager({ getLanBridge: () => null })
      expect(() => manager.addPublicInfoEntry({ text: "msg" })).not.toThrow()
    })
  })

  describe("renderPrivateIntelPanel", () => {
    it("空 entries 显示暂无提示", () => {
      const { manager, personalPanelScroll } = makeManager()
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).toContain("暂无私有情报")
    })

    it("有 entries 时渲染条目内容", () => {
      const { manager, personalPanelScroll, privateIntelEntries } = makeManager()
      privateIntelEntries.push({ source: "技能", text: "发现轮廓", round: 1 })
      privateIntelEntries.push({ source: "道具", text: "揭示品质", round: 2 })
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).toContain("技能")
      expect(personalPanelScroll.innerHTML).toContain("发现轮廓")
      expect(personalPanelScroll.innerHTML).toContain("道具")
      expect(personalPanelScroll.innerHTML).toContain("揭示品质")
    })

    it("相同版本号跳过重复渲染", () => {
      const { manager, personalPanelScroll, privateIntelEntries } = makeManager()
      privateIntelEntries.push({ source: "技能", text: "发现轮廓", round: 1 })
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).toContain("发现轮廓")
      personalPanelScroll.innerHTML = "被清空"
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).toBe("被清空")
    })

    it("新条目改变版本号后重新渲染", () => {
      const { manager, personalPanelScroll, privateIntelEntries } = makeManager()
      privateIntelEntries.push({ source: "技能", text: "a", round: 1 })
      manager.renderPrivateIntelPanel()
      privateIntelEntries.push({ source: "技能", text: "b", round: 2 })
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).toContain(">b<")
    })

    it("HTML 特殊字符被转义", () => {
      const { manager, personalPanelScroll, privateIntelEntries } = makeManager()
      privateIntelEntries.push({ source: "<script>", text: "&test\"", round: 1 })
      manager.renderPrivateIntelPanel()
      expect(personalPanelScroll.innerHTML).not.toContain("<script>")
      expect(personalPanelScroll.innerHTML).toContain("&lt;script&gt;")
    })
  })

  describe("renderPublicInfoPanel", () => {
    it("空 entries 显示暂无提示", () => {
      const { manager, publicInfoScroll } = makeManager()
      manager.renderPublicInfoPanel()
      expect(publicInfoScroll.innerHTML).toContain("暂无公共信息")
    })

    it("有 entries 时渲染条目内容", () => {
      const { manager, publicInfoScroll, publicInfoEntries } = makeManager()
      publicInfoEntries.push({ source: "系统", text: "市场繁荣", round: 1 })
      manager.renderPublicInfoPanel()
      expect(publicInfoScroll.innerHTML).toContain("系统")
      expect(publicInfoScroll.innerHTML).toContain("市场繁荣")
    })

    it("HTML 特殊字符被转义", () => {
      const { manager, publicInfoScroll, publicInfoEntries } = makeManager()
      publicInfoEntries.push({ source: "<img>", text: 'xss"', round: 1 })
      manager.renderPublicInfoPanel()
      expect(publicInfoScroll.innerHTML).not.toContain("<img>")
      expect(publicInfoScroll.innerHTML).toContain("&lt;img&gt;")
    })
  })

  describe("updateSidePanels", () => {
    it("同时渲染两侧面板", () => {
      const { manager, personalPanelScroll, publicInfoScroll, privateIntelEntries, publicInfoEntries } = makeManager()
      privateIntelEntries.push({ source: "技能", text: "私有情报A", round: 1 })
      publicInfoEntries.push({ source: "系统", text: "公共信息B", round: 1 })
      manager.updateSidePanels()
      expect(personalPanelScroll.innerHTML).toContain("私有情报A")
      expect(publicInfoScroll.innerHTML).toContain("公共信息B")
    })

    it("空数据两侧均显示暂无提示", () => {
      const { manager, personalPanelScroll, publicInfoScroll } = makeManager()
      manager.updateSidePanels()
      expect(personalPanelScroll.innerHTML).toContain("暂无私有情报")
      expect(publicInfoScroll.innerHTML).toContain("暂无公共信息")
    })
  })
})
