<template>
  <div v-if="store.isPanelVisible" class="vue-side-panels">
    <section class="side-panel personal-panel" data-vue>
      <h3>个人情报区 <small class="panel-tap-hint">点击查看详情</small></h3>
      <div class="side-panel-scroll">
        <div v-if="store.privateIntelEntries.length === 0" class="side-line intel-empty">暂无私有情报</div>
        <div v-for="(entry, index) in store.privateIntelEntries" :key="'priv-' + index" class="side-line intel-entry">
          <span class="intel-source">{{ entry.source }}：</span>{{ entry.text }}
        </div>
      </div>
    </section>
    <section class="side-panel public-panel" data-vue>
      <h3>公共信息区 <small class="panel-tap-hint">点击查看详情</small></h3>
      <div class="side-panel-scroll">
        <div v-if="store.publicInfoEntries.length === 0" class="public-line intel-empty">暂无公共信息</div>
        <div v-for="(entry, index) in store.publicInfoEntries" :key="'pub-' + index" class="public-line public-event">
          <span class="intel-source">[{{ entry.source }}]</span> {{ entry.text }}
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { usePanelsStore } from "../stores/panelsStore"

const store = usePanelsStore()

onMounted(() => {
  const oldPanels = document.querySelectorAll(".side-panel:not([data-vue])")
  oldPanels.forEach((el) => {
    (el as HTMLElement).style.display = "none"
  })
})

onUnmounted(() => {
  const oldPanels = document.querySelectorAll(".side-panel:not([data-vue])")
  oldPanels.forEach((el) => {
    (el as HTMLElement).style.display = ""
  })
})
</script>