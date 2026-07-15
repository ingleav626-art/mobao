<template>
  <div v-if="store.confirmVisible" class="game-confirm-overlay" @click.self="handleOverlayClick">
    <div class="game-confirm-box">
      <p class="game-confirm-msg">{{ store.confirmMessage }}</p>
      <div class="game-confirm-actions">
        <button type="button" @click="handleCancel">取消</button>
        <button type="button" @click="handleConfirm">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { useUiStore } from "../stores/uiStore"

const store = useUiStore()

const props = withDefaults(
  defineProps<{
    closeOnOverlay?: boolean
  }>(),
  {
    closeOnOverlay: true
  }
)

function handleConfirm(): void {
  const cb = store.confirmCallback
  store.hideConfirm()
  if (cb) {
    cb()
  }
}

function handleCancel(): void {
  const cb = store.cancelCallback
  store.hideConfirm()
  if (cb) {
    cb()
  }
}

function handleOverlayClick(): void {
  if (props.closeOnOverlay) {
    handleCancel()
  }
}

onMounted(() => {
  try {
    const el = document.getElementById("gameConfirmOverlay")
    if (el) {
      el.style.display = "none"
    }
  } catch (_e) {
    // 旧 DOM 不存在时忽略
  }
})

onUnmounted(() => {
  try {
    const el = document.getElementById("gameConfirmOverlay")
    if (el) {
      el.style.display = ""
    }
  } catch (_e) {
    // 旧 DOM 不存在时忽略
  }
})
</script>
