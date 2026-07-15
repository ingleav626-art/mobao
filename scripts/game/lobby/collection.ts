/**
 * @file lobby/collection.ts
 * @module lobby/collection
 * @description 大厅收藏图鉴面板 Mixin。负责图鉴覆盖层开闭、筛选器初始化、
 *              排序、移动端 custom-select 重建、品类聚合（包装纯函数）与藏品网格渲染。
 *
 * 核心职责：
 *   - openCollectionOverlay / closeCollectionOverlay: 图鉴覆盖层开闭（带动画 + 防重复绑定）
 *   - initCollectionPanel: 筛选器（品类/品质/搜索/排序）初始化，每次打开刷新品类
 *   - renderCollectionGrid: 按筛选+排序渲染藏品网格
 *   - getCollectionCategories: 实例方法，包装纯函数
 *   - _destroyCustomSelect / _rebuildCustomSelect: 移动端 custom-select 销毁与重建
 *
 * @exports sortCollectionItems - 独立纯函数（可独立测试）
 * @exports LobbyCollectionMixin - 收藏图鉴子 Mixin，混入 LobbyIndexMixin
 *
 * @requires core/utils - rgbHex
 * @requires data/artifacts - QUALITY_CONFIG, ARTIFACT_LIBRARY
 * @requires animations - MobaoAnimations
 * @requires mobile/mobile-handler - MobileHandler
 * @requires ui/overlay - getCollectionCategories, filterCollectionItems（re-export 纯函数）
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { ArtifactDef } from "../../../types/game"
import { MobaoAnimations } from "../animations"
import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../data/artifacts"
import { rgbHex } from "../core/utils"
import { MobileHandler } from "../../mobile/mobile-handler"
import { getCollectionCategories as _getCollectionCategories, filterCollectionItems } from "../ui/overlay"
import { getActivePinia } from "pinia"
import { useCollectionStore } from "../../vue/stores/collectionStore"

// ─── 独立函数（可独立测试）───

export function sortCollectionItems<T extends { basePrice?: number; name?: string; w?: number; h?: number }>(
  items: T[],
  sortValue: string
): T[] {
  if (sortValue === "default") return items
  return [...items].sort((a, b) => {
    switch (sortValue) {
      case "price-asc":
        return (a.basePrice || 0) - (b.basePrice || 0)
      case "price-desc":
        return (b.basePrice || 0) - (a.basePrice || 0)
      case "name-asc":
        return (a.name || "").localeCompare(b.name || "", "zh")
      case "size-asc":
        return (a.w || 0) * (a.h || 0) - (b.w || 0) * (b.h || 0)
      case "size-desc":
        return (b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0)
      default:
        return 0
    }
  })
}

export const LobbyCollectionMixin: ThisType<WarehouseSceneThis> = {
  openCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay || !panel) return

    this.initCollectionPanel()

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayOpen(overlay, panel)
    } else {
      overlay.classList.remove("hidden")
    }

    const closeBtn = document.getElementById("collectionCloseBtn")
    if (closeBtn && !(closeBtn as unknown as Record<string, unknown>)._boundClose) {
      ;(closeBtn as unknown as Record<string, unknown>)._boundClose = true
      closeBtn.addEventListener("click", () => this.closeCollectionOverlay())
    }
    if (!(overlay as unknown as Record<string, unknown>)._boundOverlayClose) {
      ;(overlay as unknown as Record<string, unknown>)._boundOverlayClose = true
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeCollectionOverlay()
      })
    }

    // ─── Vue bridge ───
    try {
      const pinia = getActivePinia()
      if (pinia) {
        const store = useCollectionStore(pinia)
        store.openCollection(ARTIFACT_LIBRARY as ArtifactDef[])
      }
    } catch {
      // Vue 未初始化，静默跳过
    }
  },

  closeCollectionOverlay() {
    const overlay = document.getElementById("collectionOverlay")
    const panel = document.getElementById("collectionPanel")
    if (!overlay) return

    if (MobaoAnimations) {
      MobaoAnimations.animateOverlayClose(overlay, panel)
    } else {
      overlay.classList.add("hidden")
    }

    // ─── Vue bridge ───
    try {
      const pinia = getActivePinia()
      if (pinia) {
        const store = useCollectionStore(pinia)
        store.closeCollection()
      }
    } catch {
      // Vue 未初始化，静默跳过
    }
  },

  _destroyCustomSelect(originalSelect: HTMLSelectElement) {
    const container = originalSelect.nextElementSibling
    if (container && container.classList.contains("custom-select-container")) {
      container.remove()
    }
    originalSelect.removeAttribute("data-custom-select")
    originalSelect.style.display = ""
  },

  _rebuildCustomSelect(originalSelect: HTMLSelectElement) {
    this._destroyCustomSelect(originalSelect)
    if (MobileHandler && (MobileHandler.isMobile || MobileHandler.isTouch)) {
      MobileHandler.convertToCustomSelect(originalSelect)
    }
  },

  initCollectionPanel() {
    const categorySelect = document.getElementById("collectionCategoryFilter") as HTMLSelectElement | null
    const qualitySelect = document.getElementById("collectionQualityFilter") as HTMLSelectElement | null
    const searchInput = document.getElementById("collectionSearchInput") as HTMLInputElement | null

    if (categorySelect) {
      const categories = this.getCollectionCategories()
      categorySelect.innerHTML =
        '<option value="all">全部品类</option>' + categories.map((c) => `<option value="${c}">${c}</option>`).join("")
      if (!(categorySelect as unknown as Record<string, unknown>)._initialized) {
        ;(categorySelect as unknown as Record<string, unknown>)._initialized = true
        categorySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(categorySelect)
    }

    if (qualitySelect) {
      const qualities = Object.entries(QUALITY_CONFIG)
      qualitySelect.innerHTML =
        '<option value="all">全部品质</option>' +
        qualities.map(([key, val]) => `<option value="${key}">${val.label}</option>`).join("")
      if (!(qualitySelect as unknown as Record<string, unknown>)._initialized) {
        ;(qualitySelect as unknown as Record<string, unknown>)._initialized = true
        qualitySelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(qualitySelect)
    }

    if (searchInput && !(searchInput as unknown as Record<string, unknown>)._initialized) {
      ;(searchInput as unknown as Record<string, unknown>)._initialized = true
      searchInput.addEventListener("input", () => this.renderCollectionGrid())
    }

    const sortSelect = document.getElementById("collectionSortFilter") as HTMLSelectElement | null
    if (sortSelect) {
      if (!(sortSelect as unknown as Record<string, unknown>)._initialized) {
        ;(sortSelect as unknown as Record<string, unknown>)._initialized = true
        sortSelect.addEventListener("change", () => this.renderCollectionGrid())
      }
      this._rebuildCustomSelect(sortSelect)
    }

    this.renderCollectionGrid()
  },

  getCollectionCategories(): string[] {
    return _getCollectionCategories(ARTIFACT_LIBRARY || [])
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
    const sortValue = (document.getElementById("collectionSortFilter") as HTMLSelectElement | null)?.value || "default"

    const filtered = filterCollectionItems(ARTIFACT_LIBRARY || [], { categoryFilter, qualityFilter, searchText })
    const artifacts = sortCollectionItems(filtered, sortValue)

    const total = (ARTIFACT_LIBRARY || []).length
    if (stats) {
      stats.textContent = `显示 ${artifacts.length} / ${total} 件藏品`
    }

    grid.innerHTML = artifacts
      .map((artifact) => {
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

    // ─── Vue bridge ───
    try {
      const pinia = getActivePinia()
      if (pinia) {
        const store = useCollectionStore(pinia)
        store.updateArtifacts(artifacts as ArtifactDef[], total, artifacts.length)
      }
    } catch {
      // Vue 未初始化，静默跳过
    }
  }
}
