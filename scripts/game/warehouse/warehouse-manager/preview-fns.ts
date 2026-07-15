/**
 * @file warehouse-manager/preview-fns.ts
 * @module warehouse/warehouse-manager/preview-fns
 * @description WarehouseManager 的 preview 域方法，抽取为独立函数。
 */
import type { Artifact } from "../../../../types/game"
import type { WarehouseManagerDeps } from "./types"
import { MARGIN, CELL_SIZE } from "../../core/constants"
import { clamp, rgbHex } from "../../core/utils"
import { QUALITY_CONFIG, toSizeTag } from "../../data/artifacts"
import { getItemKnownText } from "../index"

/** 定位预览弹窗到指定画布坐标 */
export function positionPreview(deps: WarehouseManagerDeps, canvasX: number, canvasY: number): void {
  deps.state.previewAnchor = { x: canvasX, y: canvasY }
  const pop = deps.dom.previewPopover!
  pop.classList.remove("hidden")
  deps.state.previewOpenTick = Date.now()

  applyPreviewPosition(deps)
}

/** 应用预览弹窗位置（计算边界并 clamp） */
export function applyPreviewPosition(deps: WarehouseManagerDeps): void {
  const pop = deps.dom.previewPopover!
  if (pop.classList.contains("hidden") || !deps.state.previewAnchor) {
    return
  }

  const isMobile = window.innerWidth <= 600
  if (isMobile) {
    pop.style.left = ""
    pop.style.top = ""
    pop.style.maxHeight = ""
    return
  }

  const canvasX = deps.state.previewAnchor.x
  const canvasY = deps.state.previewAnchor.y

  const root = deps.dom.gameRoot!
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
}

/** 重新定位预览弹窗（rAF 调度） */
export function repositionPreview(deps: WarehouseManagerDeps): void {
  if (deps.dom.previewPopover!.classList.contains("hidden")) {
    return
  }

  window.requestAnimationFrame(() => {
    applyPreviewPosition(deps)
  })
}

/** 隐藏预览弹窗 */
export function hidePreview(deps: WarehouseManagerDeps): void {
  if (deps.dom.previewFilterRow) {
    deps.dom.previewFilterRow!.style.display = "flex"
  }
  deps.dom.previewPopover!.classList.add("hidden")
  deps.dom.previewList!.innerHTML = ""
  deps.dom.previewHint!.textContent = ""
  deps.getInput().setDefaultCursor("default")
}

/** 设置预览弹窗触摸滚动关闭 */
export function setupPreviewTouchScroll(deps: WarehouseManagerDeps): void {
  const pop = deps.dom.previewPopover
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
        hidePreview(deps)
        return
      }
    },
    { passive: true } as EventListenerOptions
  )
}

/** 判断点是否在结算锁定的藏品上 */
export function isPointOnSettlementLockedItem(deps: WarehouseManagerDeps, x: number, y: number): boolean {
  if (!deps.state.items || deps.state.items.length === 0) {
    return false
  }

  return deps.state.items.some((item: Artifact) => {
    if (!item.revealed || (!item.revealed.qualityCell && !item.revealed.exact)) {
      return false
    }

    const left = MARGIN + item.x * CELL_SIZE
    const top = MARGIN + item.y * CELL_SIZE
    const right = left + item.w * CELL_SIZE
    const bottom = top + item.h * CELL_SIZE
    return x >= left && x <= right && y >= top && y <= bottom
  })
}

/** 渲染候选藏品预览列表 */
export function renderPreviewCandidates(deps: WarehouseManagerDeps, item: Artifact): void {
  if (deps.dom.previewFilterRow) {
    deps.dom.previewFilterRow!.style.display = "flex"
  }
  deps.dom.previewTitle!.style.display = ""
  deps.dom.previewHint!.style.display = ""
  const qualityKey = item.revealed.qualityCell ? item.qualityKey : null
  const sizeTag = item.revealed.outline ? toSizeTag(item.w, item.h) : null
  const selectedCategory = (deps.dom.previewCategorySelect as HTMLSelectElement).value
  const category = selectedCategory === "all" ? null : selectedCategory

  const candidates = deps.artifactManager.getCandidatesByRevealState({
    qualityKey,
    sizeTag,
    category
  })

  if (item.revealed.outline && item.revealed.qualityCell && candidates.length === 1) {
    item.revealed.exact = true
  }

  const libStats = deps.artifactManager.getLibraryStats()
  deps.dom.previewTitle!.textContent = `可能藏品预览（候选 ${candidates.length}/${libStats.total}）`
  deps.dom.previewHint!.textContent = `已知线索：${getItemKnownText(item)}；藏品库总数 ${libStats.total} 件；若仅有品质线索，候选会接近全库；默认按估算价从高到低。`

  if (candidates.length === 0) {
    deps.dom.previewList!.innerHTML = '<div class="preview-item">无符合候选</div>'
    return
  }

  const sorted = [...candidates].sort((a: Artifact, b: Artifact) => b.expectedPrice - a.expectedPrice)
  const html = sorted
    .map((candidate: Artifact) => {
      const candidateQuality = QUALITY_CONFIG[candidate.qualityKey]
      const qualityText = candidateQuality ? candidateQuality.label : "未知"
      const imgSrc = `assets/images/artifacts/thumbs/${candidate.key}.png`
      const qualityColor = candidateQuality ? rgbHex(candidateQuality.color) : "#9f9f9f"
      return `<article class="preview-item"><div class="preview-thumb preview-thumb-large" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${candidate.name}" onerror="this.style.display='none'"/></div><strong>${candidate.name}</strong><br/>品类: ${candidate.category} | 品质: ${qualityText}<br/>基础价: ${candidate.basePrice} | 估算价: ${candidate.expectedPrice}</article>`
    })
    .join("")

  deps.dom.previewList!.innerHTML = html
  repositionPreview(deps)
}

/** 渲染结算藏品详情预览 */
export function renderSettlementItemPreview(deps: WarehouseManagerDeps, item: Artifact): void {
  if (deps.dom.previewFilterRow) {
    deps.dom.previewFilterRow!.style.display = "none"
  }
  deps.dom.previewTitle!.style.display = "none"
  deps.dom.previewHint!.style.display = "none"
  const imgSrc = `assets/images/artifacts/thumbs/${item.key}.png`
  const qualityColor = rgbHex(item.quality.color)
  const qualityLabel = item.quality.label || "未知"
  deps.dom.previewList!.innerHTML = [
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
  repositionPreview(deps)
}
