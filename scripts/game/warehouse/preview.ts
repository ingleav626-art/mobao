import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"
import type { WarehouseSceneLike } from "./types"
import { CELL_SIZE, MARGIN } from "../core/constants"
import { clamp, rgbHex } from "../core/utils"
import { toSizeTag, QUALITY_CONFIG } from "../data/artifacts"

export const WarehousePreviewMixin: ThisType<WarehouseSceneThis> = {
  positionPreview(canvasX: number, canvasY: number) {
    ; (this as WarehouseSceneLike).previewAnchor = { x: canvasX, y: canvasY }
    const pop = (this as WarehouseSceneLike).dom.previewPopover!
    pop.classList.remove("hidden")
      ; (this as WarehouseSceneLike).previewOpenTick = Date.now()

    this.applyPreviewPosition()
  },

  applyPreviewPosition() {
    const pop = (this as WarehouseSceneLike).dom.previewPopover!
    if (pop.classList.contains("hidden") || !(this as WarehouseSceneLike).previewAnchor) {
      return
    }

    const isMobile = window.innerWidth <= 600
    if (isMobile) {
      pop.style.left = ""
      pop.style.top = ""
      pop.style.maxHeight = ""
      return
    }

    const canvasX = (this as WarehouseSceneLike).previewAnchor.x
    const canvasY = (this as WarehouseSceneLike).previewAnchor.y

    const root = (this as WarehouseSceneLike).dom.gameRoot!
    const pad = 10
    const maxPopoverHeight = Math.min(320, Math.max(180, root.clientHeight - pad * 2))
    pop.style.maxHeight = `${Math.round(maxPopoverHeight)}px`

    const popWidth = pop.offsetWidth || 460
    const popHeight = pop.offsetHeight || 360
    const viewLeft = root.scrollLeft
    const viewTop = root.scrollTop
    const viewRight = viewLeft + root.clientWidth
    const viewBottom = viewTop + root.clientHeight

    const rightSpace = viewRight - canvasX - pad
    const leftSpace = canvasX - viewLeft - pad
    const downSpace = viewBottom - canvasY - pad
    const upSpace = canvasY - viewTop - pad

    let left = rightSpace >= popWidth || rightSpace >= leftSpace ? canvasX + 18 : canvasX - popWidth - 18
    let top = downSpace >= popHeight || downSpace >= upSpace ? canvasY + 18 : canvasY - popHeight - 18

    left = clamp(left, viewLeft + pad, Math.max(viewLeft + pad, viewRight - popWidth - pad))
    top = clamp(top, viewTop + pad, Math.max(viewTop + pad, viewBottom - popHeight - pad))

    pop.style.left = `${Math.round(left)}px`
    pop.style.top = `${Math.round(top)}px`
  },

  repositionPreview() {
    if ((this as WarehouseSceneLike).dom.previewPopover!.classList.contains("hidden")) {
      return
    }

    window.requestAnimationFrame(() => {
      this.applyPreviewPosition()
    })
  },

  hidePreview() {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow!.style.display = "flex"
    }
    ; (this as WarehouseSceneLike).dom.previewPopover!.classList.add("hidden")
      ; (this as WarehouseSceneLike).dom.previewList!.innerHTML = ""
      ; (this as WarehouseSceneLike).dom.previewHint!.textContent = ""
      ; (this as WarehouseSceneLike).input.setDefaultCursor("default")
  },

  setupPreviewTouchScroll() {
    const pop = (this as WarehouseSceneLike).dom.previewPopover
    if (!pop) return
    let isDraggingToClose = false
    let dragStartY = 0

    pop.addEventListener(
      "touchstart",
      (e: TouchEvent) => {
        if (e.touches.length === 1) {
          dragStartY = e.touches[0].clientY
          isDraggingToClose = pop.scrollTop <= 0
        }
      },
      { passive: true } as EventListenerOptions
    )

    pop.addEventListener(
      "touchmove",
      (e: TouchEvent) => {
        if (e.touches.length !== 1) return
        const currentY = e.touches[0].clientY
        if (isDraggingToClose && currentY - dragStartY > 60) {
          this.hidePreview()
          return
        }
      },
      { passive: true } as EventListenerOptions
    )
  },

  isPointOnSettlementLockedItem(x: number, y: number): boolean {
    if (!(this as WarehouseSceneLike).items || (this as WarehouseSceneLike).items.length === 0) {
      return false
    }

    return (this as WarehouseSceneLike).items.some((item: Artifact) => {
      if (!item.revealed || (!item.revealed.qualityCell && !item.revealed.exact)) {
        return false
      }

      const left = MARGIN + item.x * CELL_SIZE
      const top = MARGIN + item.y * CELL_SIZE
      const right = left + item.w * CELL_SIZE
      const bottom = top + item.h * CELL_SIZE
      return x >= left && x <= right && y >= top && y <= bottom
    })
  },

  renderPreviewCandidates(item: Artifact) {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow!.style.display = "flex"
    }
    ; (this as WarehouseSceneLike).dom.previewTitle!.style.display = ""
      ; (this as WarehouseSceneLike).dom.previewHint!.style.display = ""
    const qualityKey = item.revealed.qualityCell ? item.qualityKey : null
    const sizeTag = item.revealed.outline ? toSizeTag(item.w, item.h) : null
    const selectedCategory = ((this as WarehouseSceneLike).dom.previewCategorySelect as HTMLSelectElement).value
    const category = selectedCategory === "all" ? null : selectedCategory

    const candidates = (this as WarehouseSceneLike).artifactManager.getCandidatesByRevealState({
      qualityKey,
      sizeTag,
      category
    })

    if (item.revealed.outline && item.revealed.qualityCell && candidates.length === 1) {
      item.revealed.exact = true
    }

    const libStats = (this as WarehouseSceneLike).artifactManager.getLibraryStats()
      ; (this as WarehouseSceneLike).dom.previewTitle!.textContent = `可能藏品预览（候选 ${candidates.length}/${libStats.total}）`
      ; (this as WarehouseSceneLike).dom.previewHint!.textContent = `已知线索：${this.getItemKnownText(item)}；藏品库总数 ${libStats.total} 件；若仅有品质线索，候选会接近全库；默认按估算价从高到低。`

    if (candidates.length === 0) {
      ; (this as WarehouseSceneLike).dom.previewList!.innerHTML = '<div class="preview-item">无符合候选</div>'
      return
    }

    const sorted = [...candidates].sort((a: Artifact, b: Artifact) => b.expectedPrice - a.expectedPrice)
    const html = sorted
      .map((candidate: Artifact) => {
        const candidateQuality = QUALITY_CONFIG[candidate.qualityKey]
        const qualityText = candidateQuality ? candidateQuality.label : "未知"
        const sizeText = candidate.previewSizeTag || "未知"
        const imgSrc = `assets/images/artifacts/thumbs/${candidate.key}.png`
        const qualityColor = candidateQuality ? rgbHex(candidateQuality.color) : "#9f9f9f"
        return `<article class="preview-item"><div class="preview-thumb preview-thumb-large" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${candidate.name}" onerror="this.style.display='none'"/></div><strong>${candidate.name}</strong><br/>品类: ${candidate.category} | 品质: ${qualityText}<br/>基础价: ${candidate.basePrice} | 估算价: ${candidate.expectedPrice}</article>`
      })
      .join("")

      ; (this as WarehouseSceneLike).dom.previewList!.innerHTML = html
    this.repositionPreview()
  },

  renderSettlementItemPreview(item: Artifact) {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow!.style.display = "none"
    }
    ; (this as WarehouseSceneLike).dom.previewTitle!.style.display = "none"
      ; (this as WarehouseSceneLike).dom.previewHint!.style.display = "none"
    const imgSrc = `assets/images/artifacts/thumbs/${item.key}.png`
    const qualityColor = rgbHex(item.quality.color)
    const qualityLabel = item.quality.label || "未知"
      ; (this as WarehouseSceneLike).dom.previewList!.innerHTML = [
        '<article class="preview-item settlement-detail">',
        `<div class="preview-thumb" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none'"/></div>`,
        '<div class="settlement-detail-content">',
        `<strong>${item.name}</strong>`,
        `<div class="detail-row"><span class="detail-label">品类</span><span class="detail-value">${item.category}</span></div>`,
        `<div class="detail-row"><span class="detail-label">品质</span><span class="detail-value" style="color: ${qualityColor}">${qualityLabel}</span></div>`,
        `<div class="detail-row"><span class="detail-label">基础价</span><span class="detail-value">${item.basePrice}</span></div>`,
        `<div class="detail-row"><span class="detail-label">揭示价值</span><span class="detail-value highlight">${item.trueValue}</span></div>`,
        "</div>",
        "</article>"
      ].join("")
    this.repositionPreview()
  }
}
