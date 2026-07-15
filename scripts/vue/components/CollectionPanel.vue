<template>
  <div class="collection-overlay" :class="{ hidden: !store.isOpen }" @click.self="handleClose">
    <section class="collection-panel">
      <div class="collection-head">
        <h2>藏品图鉴</h2>
        <button type="button" @click="handleClose">
          <img src="../../../assets/images/icons/ui/close.svg" alt="" class="btn-icon">
        </button>
      </div>
      <div class="collection-filters">
        <select v-model="store.categoryFilter" @change="handleFilterChange">
          <option value="all">全部品类</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <select v-model="store.qualityFilter" @change="handleFilterChange">
          <option value="all">全部品质</option>
          <option v-for="(q, key) in qualityConfig" :key="key" :value="key">{{ q.label }}</option>
        </select>
        <select v-model="store.sortMode" @change="handleFilterChange">
          <option value="default">默认排序</option>
          <option value="price-asc">价格 ↑</option>
          <option value="price-desc">价格 ↓</option>
          <option value="name-asc">名称 A-Z</option>
          <option value="size-asc">尺寸 ↑</option>
          <option value="size-desc">尺寸 ↓</option>
        </select>
        <input type="text" v-model="store.searchText" @input="handleFilterChange" placeholder="搜索藏品名称..." />
      </div>
      <div class="collection-stats">显示 {{ store.artifacts.length }} / {{ store.totalCount }} 件藏品</div>
      <div class="collection-grid">
        <article
          v-for="artifact in store.artifacts"
          :key="artifact.key"
          class="collection-item"
          :data-key="artifact.key"
        >
          <div class="collection-thumb" :style="{ background: getQualityColor(artifact.qualityKey) + '44' }">
            <img
              :src="`assets/images/artifacts/thumbs/${artifact.key}.png`"
              :alt="artifact.name"
              @error="onImgError"
            />
          </div>
          <div class="collection-info">
            <strong class="collection-name">{{ artifact.name }}</strong>
            <div class="collection-meta">
              <span class="collection-quality" :style="{ color: getQualityColor(artifact.qualityKey) }">
                {{ getQualityLabel(artifact.qualityKey) }}
              </span>
              <span class="collection-category">{{ artifact.category }}</span>
            </div>
            <div class="collection-details">
              <span>基础价: {{ artifact.basePrice }}</span>
              <span>尺寸: {{ artifact.w }}x{{ artifact.h }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue"
import { useCollectionStore } from "../stores/collectionStore"
import { QUALITY_CONFIG } from "../../game/data/artifacts"
import { getCollectionCategories, filterCollectionItems } from "../../game/ui/overlay/pure"
import { sortCollectionItems } from "../../game/lobby/collection"
import { rgbHex } from "../../game/core/utils"

const store = useCollectionStore()

const qualityConfig = QUALITY_CONFIG

const categories = computed(() => {
  return getCollectionCategories(store.allArtifacts)
})

function handleFilterChange(): void {
  const filtered = filterCollectionItems(store.allArtifacts, {
    categoryFilter: store.categoryFilter,
    qualityFilter: store.qualityFilter,
    searchText: store.searchText
  })
  const sorted = sortCollectionItems(filtered, store.sortMode)
  store.updateArtifacts(sorted, store.allArtifacts.length, sorted.length)
}

function handleClose(): void {
  store.closeCollection()
}

function getQualityColor(qualityKey: string): string {
  const config = QUALITY_CONFIG[qualityKey]
  return config ? rgbHex(config.color) : "#9f9f9f"
}

function getQualityLabel(qualityKey: string): string {
  const config = QUALITY_CONFIG[qualityKey]
  return config ? config.label : "未知"
}

function onImgError(event: Event): void {
  const img = event.target as HTMLImageElement
  img.style.display = "none"
}

onMounted(() => {
  const origOverlay = document.getElementById("collectionOverlay")
  if (origOverlay) {
    origOverlay.style.display = "none"
  }
})

onUnmounted(() => {
  const origOverlay = document.getElementById("collectionOverlay")
  if (origOverlay) {
    origOverlay.style.display = ""
  }
})
</script>