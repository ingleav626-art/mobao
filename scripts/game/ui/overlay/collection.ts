/**
 * @file scripts/game/ui/overlay/collection.ts
 * @module ui/overlay/collection
 * @description 收藏图鉴面板 Mixin。负责图鉴覆盖层开闭、筛选器初始化、
 *              品类聚合（包装纯函数）与藏品网格渲染。
 *
 * @requires core/utils - rgbHex
 * @requires data/artifacts - QUALITY_CONFIG, ARTIFACT_LIBRARY
 * @requires animations - MobaoAnimations
 * @requires ./pure - getCollectionCategories, filterCollectionItems
 * @exports CollectionMixin - 收藏图鉴子 Mixin
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import { rgbHex } from "../../core/utils"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../../data/artifacts"
import { MobaoAnimations } from "../../animations"
import { getCollectionCategories, filterCollectionItems } from "./pure"

export const CollectionMixin: ThisType<WarehouseSceneThis> = {
  openCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    if (!overlay) return
    if (typeof MobaoAnimations !== "undefined") {
      ;(MobaoAnimations as any).animateOverlayOpen(overlay)
    } else {
      overlay.classList.remove("hidden")
    }
    this.initCollectionPanel()

    const closeBtn = document.getElementById("collectionCloseBtn")
    if (closeBtn && !(closeBtn as any)._collectionBound) {
      ;(closeBtn as any)._collectionBound = true
      closeBtn.addEventListener("click", () => this.closeCollectionOverlay())
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) this.closeCollectionOverlay()
    }
  },

  closeCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    if (!overlay) return
    if (typeof MobaoAnimations !== "undefined") {
      ;(MobaoAnimations as any).animateOverlayClose(overlay, null, function () {
        overlay.classList.add("hidden")
        overlay.style.animation = ""
        overlay.style.opacity = ""
      })
    } else {
      overlay.classList.add("hidden")
    }
  },

  initCollectionPanel() {
    const categorySelect = document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null
    const qualitySelect = document.getElementById("collectionQualityFilter") as HTMLSelectElement | null
    const searchInput = document.getElementById("collectionSearchInput") as HTMLInputElement | null

    if (categorySelect && !(categorySelect as any)._initialized) {
      ;(categorySelect as any)._initialized = true
      const categories = this.getCollectionCategories()
      categorySelect.innerHTML =
        '<option value="all">全部品类</option>' +
        categories.map((c: string) => `<option value="${c}">${c}</option>`).join("")
      categorySelect.addEventListener("change", () => this.renderCollectionGrid())
    }

    if (qualitySelect && !(qualitySelect as any)._initialized) {
      ;(qualitySelect as any)._initialized = true
      const qualities = Object.entries(QUALITY_CONFIG)
      qualitySelect.innerHTML =
        '<option value="all">全部品质</option>' +
        qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join("")
      qualitySelect.addEventListener("change", () => this.renderCollectionGrid())
    }

    if (searchInput && !(searchInput as any)._initialized) {
      ;(searchInput as any)._initialized = true
      searchInput.addEventListener("input", () => this.renderCollectionGrid())
    }

    this.renderCollectionGrid()
  },

  getCollectionCategories(): string[] {
    return getCollectionCategories(ARTIFACT_LIBRARY || [])
  },

  renderCollectionGrid() {
    const grid = document.getElementById("collectionGrid")
    const stats = document.getElementById("collectionStats")
    if (!grid) return

    const categoryFilter =
      (document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null)?.value || "all"
    const qualityFilter =
      (document.getElementById("collectionQualityFilter") as HTMLSelectElement | null)?.value || "all"
    const searchText = (document.getElementById("collectionSearchInput") as HTMLInputElement | null)?.value || ""

    const artifacts = filterCollectionItems(ARTIFACT_LIBRARY || [], { categoryFilter, qualityFilter, searchText })

    const total = (ARTIFACT_LIBRARY || []).length
    if (stats) {
      stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`
    }

    grid.innerHTML = artifacts
      .map((artifact: any) => {
        const quality = QUALITY_CONFIG[artifact.qualityKey]
        const qualityLabel = quality ? quality.label : "未知"
        const qualityColor = quality ? rgbHex(quality.color) : "#9f9f9f"
        const imgSrc = `assets/images/artifacts/thumbs/${artifact.key}.png`

        return `
          <article class="collection-item" data-key="${artifact.key}">
            <div class="collection-thumb" style="background: ${qualityColor}44;">
              <img src="${imgSrc}" alt="${artifact.name}" onerror="this.style.display='none'"/>
            </div>
            <div class="collection-info">
              <strong class="collection-name">${artifact.name}</strong>
              <div class="collection-meta">
                <span class="collection-quality" style="color: ${qualityColor};">${qualityLabel}</span>
                <span class="collection-category">${artifact.category}</span>
              </div>
              <div class="collection-details">
                <span>基础价: ${artifact.basePrice}</span>
                <span>尺寸: ${artifact.w}x${artifact.h}</span>
              </div>
            </div>
          </article>
        `
      })
      .join("")
  }
}
