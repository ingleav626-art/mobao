import { describe, it, expect, beforeEach } from "vitest"
import { CarouselManager } from "../../../scripts/game/lobby/carousel-manager"
import { reset as resetAppState } from "../../../scripts/game/core/app-state"
import { setSelectedProfileId } from "../../../scripts/game/data/map-profiles"

describe("CarouselManager", () => {
  beforeEach(() => {
    localStorage.clear()
    resetAppState()
    document.body.innerHTML = ""
  })

  describe("构造函数", () => {
    it("默认状态 offset 为 0", () => {
      const manager = new CarouselManager()
      expect(manager.getOffset()).toBe(0)
    })

    it("可注入自定义初始状态", () => {
      const manager = new CarouselManager({ offset: 2 })
      expect(manager.getOffset()).toBe(2)
    })

    it("多个 Manager 实例状态独立", () => {
      const m1 = new CarouselManager()
      const m2 = new CarouselManager({ offset: 3 })
      expect(m1.getOffset()).toBe(0)
      expect(m2.getOffset()).toBe(3)
    })

    it("注入的 state 引用可被外部观察", () => {
      const state = { offset: 1 }
      const manager = new CarouselManager(state)
      expect(manager.getState()).toBe(state)
    })
  })

  describe("renderCarousel", () => {
    it("渲染地图卡片到 #carouselTrack", () => {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)

      const manager = new CarouselManager()
      manager.renderCarousel()

      const cards = track.querySelectorAll(".lobby-map-card")
      expect(cards.length).toBeGreaterThan(0)
    })

    it("渲染后 offset 重置为 0", () => {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)

      const manager = new CarouselManager({ offset: 5 })
      manager.renderCarousel()

      expect(manager.getOffset()).toBe(0)
    })

    it("选中地图卡片有 selected 类", () => {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)

      const manager = new CarouselManager()
      manager.renderCarousel()

      const selectedCards = track.querySelectorAll(".lobby-map-card.selected")
      expect(selectedCards.length).toBe(1)
    })

    it("点击卡片触发 onCardClick 回调", () => {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)

      let clicked = false
      const manager = new CarouselManager()
      manager.renderCarousel(() => {
        clicked = true
      })

      const firstCard = track.querySelector(".lobby-map-card") as HTMLElement
      firstCard.click()

      expect(clicked).toBe(true)
    })

    it("无 #carouselTrack 时不报错", () => {
      const manager = new CarouselManager()
      expect(() => manager.renderCarousel()).not.toThrow()
    })
  })

  describe("carouselScroll", () => {
    function setupTrackWithCards(cardCount: number): HTMLElement {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)
      for (let i = 0; i < cardCount; i++) {
        const card = document.createElement("div")
        card.className = "lobby-map-card"
        track.appendChild(card)
      }
      return track
    }

    it("向右翻页 offset 增加", () => {
      setupTrackWithCards(5)
      const manager = new CarouselManager()
      manager.carouselScroll(1)
      expect(manager.getOffset()).toBe(1)
    })

    it("向左翻页 offset 减少", () => {
      setupTrackWithCards(5)
      const manager = new CarouselManager()
      manager.carouselScroll(1)
      manager.carouselScroll(1)
      manager.carouselScroll(-1)
      expect(manager.getOffset()).toBe(1)
    })

    it("offset 不超过 maxOffset（cards.length - 3）", () => {
      setupTrackWithCards(5)
      const manager = new CarouselManager()
      // maxOffset = 5 - 3 = 2
      manager.carouselScroll(1)
      manager.carouselScroll(1)
      manager.carouselScroll(1)
      expect(manager.getOffset()).toBe(2)
    })

    it("offset 不小于 0", () => {
      setupTrackWithCards(5)
      const manager = new CarouselManager()
      manager.carouselScroll(-1)
      expect(manager.getOffset()).toBe(0)
    })

    it("卡片数 <= 3 时 maxOffset 为 0，无法翻页", () => {
      setupTrackWithCards(3)
      const manager = new CarouselManager()
      manager.carouselScroll(1)
      expect(manager.getOffset()).toBe(0)
    })

    it("无 #carouselTrack 时不报错", () => {
      const manager = new CarouselManager()
      expect(() => manager.carouselScroll(1)).not.toThrow()
      expect(manager.getOffset()).toBe(0)
    })
  })

  describe("updateCarouselPosition", () => {
    function setupCarouselDom(cardCount: number): { track: HTMLElement; leftBtn: HTMLButtonElement; rightBtn: HTMLButtonElement } {
      const track = document.createElement("div")
      track.id = "carouselTrack"
      document.body.appendChild(track)
      for (let i = 0; i < cardCount; i++) {
        const card = document.createElement("div")
        card.className = "lobby-map-card"
        track.appendChild(card)
      }
      const leftBtn = document.createElement("button")
      leftBtn.id = "carouselLeftBtn"
      const rightBtn = document.createElement("button")
      rightBtn.id = "carouselRightBtn"
      document.body.appendChild(leftBtn)
      document.body.appendChild(rightBtn)
      return { track, leftBtn, rightBtn }
    }

    it("设置 track 的 transform 为 translateX", () => {
      const { track } = setupCarouselDom(5)

      const manager = new CarouselManager()
      manager.carouselScroll(1)
      manager.updateCarouselPosition()

      expect(track.style.transform).toContain("translateX")
      expect(track.style.transform).toContain("-174px")
    })

    it("offset 为 0 时禁用左箭头", () => {
      const { leftBtn, rightBtn } = setupCarouselDom(5)

      const manager = new CarouselManager()
      manager.updateCarouselPosition()

      expect(leftBtn.disabled).toBe(true)
      expect(rightBtn.disabled).toBe(false)
    })

    it("offset 达到 maxOffset 时禁用右箭头", () => {
      const { leftBtn, rightBtn } = setupCarouselDom(5)

      const manager = new CarouselManager()
      manager.carouselScroll(1)
      manager.carouselScroll(1)
      manager.updateCarouselPosition()

      expect(rightBtn.disabled).toBe(true)
      expect(leftBtn.disabled).toBe(false)
    })

    it("中间位置时两个箭头都可用", () => {
      const { leftBtn, rightBtn } = setupCarouselDom(5)

      const manager = new CarouselManager()
      manager.carouselScroll(1)
      manager.updateCarouselPosition()

      expect(leftBtn.disabled).toBe(false)
      expect(rightBtn.disabled).toBe(false)
    })
  })

  describe("renderMapDetail", () => {
    it("渲染选中地图详情到 #lobbyMapDetail", () => {
      const detail = document.createElement("div")
      detail.id = "lobbyMapDetail"
      document.body.appendChild(detail)

      const manager = new CarouselManager()
      manager.renderMapDetail()

      expect(detail.innerHTML).not.toBe("")
      expect(detail.querySelector(".lobby-map-detail-title")).not.toBeNull()
    })

    it("无 #lobbyMapDetail 时不报错", () => {
      const manager = new CarouselManager()
      expect(() => manager.renderMapDetail()).not.toThrow()
    })

    it("渲染不同地图有不同标题", () => {
      const detail = document.createElement("div")
      detail.id = "lobbyMapDetail"
      document.body.appendChild(detail)

      const manager = new CarouselManager()
      manager.renderMapDetail()
      const defaultTitle = detail.querySelector(".lobby-map-detail-title")?.textContent

      setSelectedProfileId("treasure-vault")
      manager.renderMapDetail()
      const vaultTitle = detail.querySelector(".lobby-map-detail-title")?.textContent

      expect(defaultTitle).not.toBe(vaultTitle)
    })
  })

  describe("bindCarouselTouch", () => {
    it("无 .carousel-track-wrap 时不报错", () => {
      const manager = new CarouselManager()
      expect(() => manager.bindCarouselTouch()).not.toThrow()
    })

    it("有 .carousel-track-wrap 时不报错", () => {
      const wrap = document.createElement("div")
      wrap.className = "carousel-track-wrap"
      document.body.appendChild(wrap)

      const manager = new CarouselManager()
      expect(() => manager.bindCarouselTouch()).not.toThrow()
    })
  })
})
