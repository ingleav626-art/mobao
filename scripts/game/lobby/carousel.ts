import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'

/**
 * @file lobby/carousel.js
 * @module lobby/carousel
 * @description 大厅地图选择轮播组件 Mixin。提供地图卡片的横向滚动浏览、
 *              触摸滑动、左右箭头导航，以及选中地图的参数详情展示。
 *
 * 核心职责：
 *   - renderCarousel(): 渲染地图卡片列表，绑定点击选中事件
 *   - bindCarouselTouch(): 绑定触摸滑动手势（水平滑动>30px触发翻页）
 *   - carouselScroll(direction): 左右翻页（-1/1），限制在有效范围内
 *   - updateCarouselPosition(): 更新轮播位置（translateX），控制箭头禁用状态
 *   - renderMapDetail(): 渲染选中地图的参数详情面板
 *     将数值参数转换为语义化等级（低/较低/中/较高/高），包括：
 *     回合数、直接拿下比例、高品质/低品质占比、各品质权重
 *
 * 地图详情展示：
 *   使用 toLevel() 工具函数将数值映射为5级语义标签，
 *   如 highQ<0.2→"低", <0.35→"较低", <0.5→"中", <0.65→"较高", else→"高"
 *   底部有"向下滑动查看更多"提示，滚动到底部自动隐藏
 *
 * @exports CarouselMixin - 轮播组件 Mixin，混入 Phaser Scene
 *
 * @requires data/map-profiles - 地图配置数据
 */
import { getAllProfiles, getSelectedProfileId, setSelectedProfileId, getProfile } from "../data/map-profiles"

export const LobbyCarouselMixin: ThisType<WarehouseSceneThis> = {
  renderCarousel(): void {
    const track = document.getElementById("carouselTrack")
    if (!track) {
      return
    }

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
        card.classList.add("selected");
        (this as unknown as { renderMapDetail(): void }).renderMapDetail()
      })
    });

    (this as unknown as { _carouselOffset: number })._carouselOffset = 0;
    (this as unknown as { updateCarouselPosition(): void }).updateCarouselPosition();
    (this as unknown as { bindCarouselTouch(): void }).bindCarouselTouch()
  },

  bindCarouselTouch(): void {
    const wrap = document.querySelector(".carousel-track-wrap") as HTMLElement | null
    if (!wrap || (wrap as unknown as Record<string, unknown>)._touchBound) return
    (wrap as unknown as Record<string, unknown>)._touchBound = true

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
          (this as unknown as { carouselScroll(direction: number): void }).carouselScroll(dx < 0 ? 1 : -1)
        }
      },
      { passive: true }
    )
  },

  carouselScroll(direction: number): void {
    const track = document.getElementById("carouselTrack")
    if (!track) return
    const cards = track.querySelectorAll(".lobby-map-card")
    const maxOffset = Math.max(0, cards.length - 3);
    (this as unknown as { _carouselOffset: number })._carouselOffset = Math.max(0, Math.min(maxOffset, (this as unknown as { _carouselOffset: number })._carouselOffset + direction));
    (this as unknown as { updateCarouselPosition(): void }).updateCarouselPosition()
  },

  updateCarouselPosition(): void {
    const track = document.getElementById("carouselTrack")
    const leftBtn = document.getElementById("carouselLeftBtn")
    const rightBtn = document.getElementById("carouselRightBtn")
    if (!track) return

    const cardWidth = 174
    track.style.transform = "translateX(" + -(this as unknown as { _carouselOffset: number })._carouselOffset * cardWidth + "px)"

    const cards = track.querySelectorAll(".lobby-map-card")
    const maxOffset = Math.max(0, cards.length - 3)
    if (leftBtn) (leftBtn as HTMLButtonElement).disabled = (this as unknown as { _carouselOffset: number })._carouselOffset <= 0
    if (rightBtn) (rightBtn as HTMLButtonElement).disabled = (this as unknown as { _carouselOffset: number })._carouselOffset >= maxOffset
  },

  renderMapDetail(): void {
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
      detail.removeEventListener("scroll", (detail as unknown as Record<string, unknown>)._mapDetailScrollHandler as EventListener);
      (detail as unknown as Record<string, unknown>)._mapDetailScrollHandler = checkScroll
      detail.addEventListener("scroll", checkScroll)
      requestAnimationFrame(checkScroll)
    }
  }
}
