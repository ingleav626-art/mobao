import { defineStore } from "pinia"
import type { ArtifactDef } from "../../../types/game"

export const useCollectionStore = defineStore("collection", {
  state: () => ({
    /** 是否打开 */
    isOpen: false,
    /** 完整藏品库（用于筛选） */
    allArtifacts: [] as ArtifactDef[],
    /** 当前显示的藏品列表（筛选+排序后） */
    artifacts: [] as ArtifactDef[],
    /** 品类筛选 */
    categoryFilter: "all" as string,
    /** 品质筛选 */
    qualityFilter: "all" as string,
    /** 搜索文本 */
    searchText: "" as string,
    /** 排序模式 */
    sortMode: "default" as string,
    /** 已发现的藏品 key 列表 */
    discoveredKeys: [] as string[],
    /** 总藏品数 */
    totalCount: 0,
    /** 筛选后藏品数 */
    filteredCount: 0
  }),

  actions: {
    openCollection(artifacts: ArtifactDef[], discoveredKeys?: string[]): void {
      this.isOpen = true
      this.allArtifacts = artifacts
      this.artifacts = artifacts
      this.totalCount = artifacts.length
      this.filteredCount = artifacts.length
      this.categoryFilter = "all"
      this.qualityFilter = "all"
      this.searchText = ""
      this.sortMode = "default"
      if (discoveredKeys) {
        this.discoveredKeys = discoveredKeys
      }
    },

    closeCollection(): void {
      this.isOpen = false
    },

    setCategoryFilter(filter: string): void {
      this.categoryFilter = filter
    },

    setQualityFilter(filter: string): void {
      this.qualityFilter = filter
    },

    setSearchText(text: string): void {
      this.searchText = text
    },

    setSortMode(mode: string): void {
      this.sortMode = mode
    },

    updateArtifacts(artifacts: ArtifactDef[], totalCount: number, filteredCount: number): void {
      this.artifacts = artifacts
      this.totalCount = totalCount
      this.filteredCount = filteredCount
    },

    isDiscovered(key: string): boolean {
      return this.discoveredKeys.includes(key)
    }
  }
})
