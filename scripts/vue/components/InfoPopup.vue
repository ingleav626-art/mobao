<template>
  <div v-if="store.infoPopupVisible" class="info-popup-overlay" @click.self="handleClose">
    <div class="info-popup-box">
      <div class="info-popup-head">
        <h3>{{ store.infoPopupTitle }}</h3>
        <button type="button" @click="handleClose">
          <img src="../../../assets/images/icons/ui/close.svg" alt="" class="btn-icon-sm" />
        </button>
      </div>
      <div class="info-popup-scroll" v-html="store.infoPopupContent"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { useUiStore } from "../stores/uiStore"

const store = useUiStore()

function handleClose(): void {
  store.hideInfoPopup()
}

onMounted(() => {
  try {
    const el = document.getElementById("infoPopupOverlay")
    if (el) {
      el.style.display = "none"
    }
  } catch (_e) {
    // 旧 DOM 不存在时忽略
  }
})

onUnmounted(() => {
  try {
    const el = document.getElementById("infoPopupOverlay")
    if (el) {
      el.style.display = ""
    }
  } catch (_e) {
    // 旧 DOM 不存在时忽略
  }
})
</script>
