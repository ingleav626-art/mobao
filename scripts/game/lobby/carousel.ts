/**
 * @file lobby/carousel.ts
 * @module lobby/carousel
 * @description 大厅地图选择轮播组件。提供地图卡片的横向滚动浏览、
 *              触摸滑动、左右箭头导航，以及选中地图的参数详情展示。
 *
 * 核心职责：
 *   - renderCarousel: 渲染地图卡片列表，绑定点击选中事件
 *   - bindCarouselTouch: 绑定触摸滑动手势（水平滑动>30px触发翻页）
 *   - carouselScroll: 左右翻页（-1/1），限制在有效范围内
 *   - updateCarouselPosition: 更新轮播位置（translateX），控制箭头禁用状态
 *   - renderMapDetail: 渲染选中地图的参数详情面板
 *
 * @exports CarouselState - 轮播状态接口
 * @exports renderCarousel / bindCarouselTouch / carouselScroll / updateCarouselPosition / renderMapDetail
 * @exports LobbyCarouselMixin - 向后兼容的 Mixin 薄包装
 *
 * @requires data/map-profiles - 地图配置数据
 */
import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import { getAllProfiles, getSelectedProfileId, setSelectedProfileId, getProfile } from "../data/map-profiles"

export interface CarouselState {
  offset: number
}

// ─── 独立函数（可独立测试）───

export function renderCarousel(state: CarouselState, onCardClick?: () => void): void {
  const track = document.getElementById("carouselTrack")
  if (!track) return

  const profiles = getAllProfiles()
  const selectedId = getSelectedProfileId()

  track.innerHTML = profiles
    .map((p) => {
      const isSelected = p.id === selectedId
      return [
        '<div class="lobby-map-card' + (isSelected ? " selected" : "") + '" data-map-id="' + p.id + '">',
        '<span class="lobby-map-card-icon">' + p.icon + "</span>",
        '<span class="lobby-map-card-name">' + p.name + "</span>",
        '<span class="lobby-map-card-desc">' + p.desc + "</span>",
        "</div>"
      ].join("")
    })
    .join("")

  track.querySelectorAll(".lobby-map-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-map-id")
      setSelectedProfileId(id || "")
      track.querySelectorAll(".lobby-map-card").forEach((c) => c.classList.remove("selected"))
      card.classList.add("selected")
      renderMapDetail()
      if (onCardClick) onCardClick()
    })
  })

  state.offset = 0
  updateCarouselPosition(state.offset)
  bindCarouselTouch(state)
}

export function bindCarouselTouch(state: CarouselState): void {
  const wrap = document.querySelector(".carousel-track-wrap") as HTMLElement | null
  if (!wrap || (wrap as unknown as Record<string, unknown>)._touchBound) return
  ;(wrap as unknown as Record<string, unknown>)._touchBound = true

  let startX = 0
  let startY = 0
  let dragging = false

  wrap.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      dragging = true
    },
    { passive: true }
  )

  wrap.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      if (!dragging) return
      dragging = false
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        carouselScroll(state, dx < 0 ? 1 : -1)
      }
    },
    { passive: true }
  )
}

export function carouselScroll(state: CarouselState, direction: number): void {
  const track = document.getElementById("carouselTrack")
  if (!track) return
  const cards = track.querySelectorAll(".lobby-map-card")
  const maxOffset = Math.max(0, cards.length - 3)
  state.offset = Math.max(0, Math.min(maxOffset, state.offset + direction))
  updateCarouselPosition(state.offset)
}

export function updateCarouselPosition(offset: number): void {
  const track = document.getElementById("carouselTrack")
  const leftBtn = document.getElementById("carouselLeftBtn")
  const rightBtn = document.getElementById("carouselRightBtn")
  if (!track) return

  const cardWidth = 174
  track.style.transform = "translateX(" + -offset * cardWidth + "px)"

  const cards = track.querySelectorAll(".lobby-map-card")
  const maxOffset = Math.max(0, cards.length - 3)
  if (leftBtn) (leftBtn as HTMLButtonElement).disabled = offset <= 0
  if (rightBtn) (rightBtn as HTMLButtonElement).disabled = offset >= maxOffset
}

export function renderMapDetail(): void {
  const detail = document.getElementById("lobbyMapDetail")
  if (!detail) return

  const profile = getProfile(getSelectedProfileId())
  if (!profile) return

  const p = profile.params as unknown as Record<string, unknown> | undefined
  const qualityLabels: Record<string, string> = { poor: "粗品", normal: "良品", fine: "精品", rare: "珍品", legendary: "绝品" }
  const toLevel = (v: number, thresholds: [number, string][]): string => {
    for (let i = 0; i < thresholds.length; i++) {
      if (v < thresholds[i][0]) return thresholds[i][1]
    }
    return thresholds[thresholds.length - 1][1]
  }
  const qw: Record<string, number> = (p?.qualityWeights as Record<string, number>) || {}
  const totalQ = Object.values(qw).reduce((s: number, v: number) => s + v, 0) || 1
  const highQ =
    ((qw.fine || 0) + (qw.rare || 0) + (qw.legendary || 0)) / totalQ
  const lowQ = (qw.poor || 0) / totalQ
  const takeRatio = (p?.directTakeRatio as number) || 0.2
  const rounds = (p?.maxRounds as number) || 5

  const qualityLevel = toLevel(highQ, [
    [0.2, "低"],
    [0.35, "较低"],
    [0.5, "中"],
    [0.65, "较高"],
    [1, "高"]
  ])
  const lowLevel = toLevel(lowQ, [
    [0.15, "低"],
    [0.25, "较低"],
    [0.35, "中"],
    [0.45, "较高"],
    [1, "高"]
  ])
  const takeLevel = toLevel(takeRatio, [
    [0.12, "低"],
    [0.18, "较低"],
    [0.25, "中"],
    [0.35, "较高"],
    [1, "高"]
  ])
  const roundLevel = toLevel(rounds, [
    [4, "少"],
    [5, "中"],
    [7, "多"]
  ])

  const qualityLines = Object.entries(qw)
    .map(([k, v]: [string, number]) => {
      const pct = Math.round((v / totalQ) * 100)
      const lv = toLevel(pct, [
        [8, "低"],
        [16, "较低"],
        [26, "中"],
        [36, "较高"],
        [100, "高"]
      ])
      return (
        '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">' +
        (qualityLabels[k] || k) +
        '</span><span class="lobby-map-detail-value">' +
        lv +
        "</span></div>"
      )
    })
    .join("")

  detail.innerHTML = [
    '<div class="lobby-map-detail-title">' + profile.icon + " " + profile.name + "</div>",
    '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">回合数</span><span class="lobby-map-detail-value">' +
    roundLevel +
    "</span></div>",
    '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">直接拿下</span><span class="lobby-map-detail-value">' +
    takeLevel +
    "</span></div>",
    '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">高品质占比</span><span class="lobby-map-detail-value">' +
    qualityLevel +
    "</span></div>",
    '<div class="lobby-map-detail-row"><span class="lobby-map-detail-label">低品质占比</span><span class="lobby-map-detail-value">' +
    lowLevel +
    "</span></div>",
    qualityLines,
    '<div class="lobby-map-detail-hint" id="mapDetailHint">↓ 向下滑动查看更多</div>'
  ].join("")

  const hint = document.getElementById("mapDetailHint")
  if (hint) {
    const checkScroll = () => {
      const atBottom = detail.scrollHeight - detail.scrollTop <= detail.clientHeight + 4
      hint.style.display = atBottom ? "none" : ""
    }
    detail.removeEventListener("scroll", (detail as unknown as Record<string, unknown>)._mapDetailScrollHandler as EventListener)
    ;(detail as unknown as Record<string, unknown>)._mapDetailScrollHandler = checkScroll
    detail.addEventListener("scroll", checkScroll)
    requestAnimationFrame(checkScroll)
  }
}

// ─── Mixin 薄包装（向后兼容）───

const _carouselState: CarouselState = { offset: 0 }

export const LobbyCarouselMixin: ThisType<WarehouseSceneThis> = {
  renderCarousel(): void {
    renderCarousel(_carouselState)
  },

  bindCarouselTouch(): void {
    bindCarouselTouch(_carouselState)
  },

  carouselScroll(direction: number): void {
    carouselScroll(_carouselState, direction)
  },

  updateCarouselPosition(): void {
    updateCarouselPosition(_carouselState.offset)
  },

  renderMapDetail,
}
