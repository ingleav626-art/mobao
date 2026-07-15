<template>
  <div v-if="store.isDrawerOpen" class="item-drawer" id="itemDrawer">
    <div class="item-drawer-head">
      <strong>道具栏</strong>
      <button id="itemDrawerCloseBtn" type="button" @click="handleClose">
        <img src="../../../assets/images/icons/ui/close.svg" alt="" class="btn-icon-sm">
      </button>
    </div>
    <div class="item-drawer-list" id="itemDrawerList">
      <button
        v-for="item in store.items"
        :key="item.id"
        type="button"
        class="item-drawer-btn"
        :class="{ 'is-empty': item.count <= 0 }"
        :data-item-id="item.id"
        :disabled="item.count <= 0"
        :title="item.description"
        @click="handleUseItem(item.id)"
      >
        <span class="item-drawer-name">{{ item.name }}</span>
        <span class="item-drawer-count">x{{ item.count }}</span>
      </button>
      <button
        v-for="skill in store.skills"
        :key="skill.id"
        type="button"
        class="item-drawer-btn"
        :class="{ 'is-empty': skill.remainingThisRound <= 0 }"
        :data-item-id="skill.id"
        :disabled="skill.remainingThisRound <= 0"
        :title="skill.description"
        @click="handleUseSkill(skill.id)"
      >
        <span class="item-drawer-name">{{ skill.name }}</span>
        <span class="item-drawer-count">{{ skill.remainingThisRound }}/{{ skill.maxPerRound }}</span>
      </button>
      <div v-if="!store.hasItems" class="item-drawer-empty">未携带道具</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { useInventoryStore } from "../stores/inventoryStore"
import { WarehouseScene } from "../../game/scene/warehouse-scene"

const store = useInventoryStore()

function handleClose(): void {
  store.closeDrawer()
}

function handleUseItem(itemId: string): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.useItem(itemId)
  }
  store.closeDrawer()
}

function handleUseSkill(skillId: string): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.useSkill(skillId)
  }
  store.closeDrawer()
}

onMounted(() => {
  const old = document.getElementById("itemDrawer")
  if (old) {
    old.style.display = "none"
  }
})

onUnmounted(() => {
  const old = document.getElementById("itemDrawer")
  if (old) {
    old.style.display = ""
  }
})
</script>