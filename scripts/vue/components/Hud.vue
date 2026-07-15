<template>
  <div class="hud" data-vue>
    <div class="hud-left">
      <button id="openSettingsBtn" type="button" @click="handleOpenSettings">
        <img src="../../../assets/images/icons/ui/settings.svg" alt="" class="btn-icon">设置
      </button>
      <button id="aiLogicBtn" type="button" @click="handleOpenAiLogic">查看AI决策</button>
      <button
        id="pauseRoundBtn"
        type="button"
        :disabled="pauseBtnDisabled"
        :class="{ 'is-paused': store.roundPaused }"
        @click="handlePauseToggle"
        v-show="pauseBtnVisible"
      >
        <img src="../../../assets/images/icons/ui/pause-button.svg" alt="" class="btn-icon">
        {{ store.roundPaused ? "恢复回合" : "暂停回合" }}
      </button>
      <span id="aiThinkingIndicator" class="ai-thinking-indicator" :class="{ hidden: !aiThinking }">AI思考中...</span>
    </div>
    <div class="hud-center">
      <span class="hud-round" id="hudRound">
        <img src="../../../assets/images/icons/ui/timer.svg" alt="" class="hud-icon">
        <span class="hud-text">第 {{ store.round }}/{{ store.maxRounds }} 回合</span>
      </span>
      <span class="hud-timer" id="hudTimer">
        <span class="hud-text">
          <span class="round-timer-hot" :class="{ 'is-danger': !store.roundPaused && store.roundTimeLeft <= 5 }">
            {{ timerText }}
          </span>
        </span>
      </span>
    </div>
    <div class="hud-right">
      <button
        id="nextRoundBtn"
        type="button"
        :disabled="nextRoundBtnDisabled"
        @click="handleNextRound"
        v-show="lanButtonsVisible"
      >结束本轮</button>
      <button
        id="settleBtn"
        type="button"
        :disabled="settleBtnDisabled"
        @click="handleSettle"
        v-show="lanButtonsVisible"
      >结算本局</button>
      <button id="rerollBtn" type="button" @click="handleReroll">重新随机</button>
      <span class="hud-money" id="hudMoney">
        <img src="../../../assets/images/icons/ui/money-rmb.svg" alt="" class="hud-icon">
        <span class="hud-text">{{ store.playerMoney.toLocaleString() }}</span>
      </span>
    </div>
  </div>
  <ConfirmDialog />
  <InfoPopup />
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue"
import { useGameStore } from "../stores/gameStore"
import { WarehouseScene } from "../../game/scene/warehouse-scene"
import ConfirmDialog from "./ConfirmDialog.vue"
import InfoPopup from "./InfoPopup.vue"

const store = useGameStore()

const timerText = computed(() => {
  if (store.roundPaused) {
    return `已暂停 ${store.roundTimeLeft}s`
  }
  return `倒计时 ${store.roundTimeLeft}s`
})

const pauseBtnDisabled = computed(() => {
  return store.settled || store.roundResolving
})

const nextRoundBtnDisabled = computed(() => {
  return store.settled || store.roundResolving || store.roundPaused
})

const settleBtnDisabled = computed(() => {
  return store.settled || store.roundResolving || store.roundPaused
})

const pauseBtnVisible = computed(() => {
  const scene = WarehouseScene.instance
  if (!scene) return true
  if (scene.isLanMode && !scene.lanIsHost) return false
  return true
})

const lanButtonsVisible = computed(() => {
  const scene = WarehouseScene.instance
  if (!scene) return true
  return !scene.isLanMode
})

const aiThinking = ref(false)
let aiThinkingPollId: number | null = null

onMounted(() => {
  const old = document.querySelector(".hud:not([data-vue])")
  if (old) {
    (old as HTMLElement).style.display = "none"
  }

  aiThinkingPollId = window.setInterval(() => {
    const scene = WarehouseScene.instance
    if (scene) {
      aiThinking.value = scene.aiRoundDecisionPromise != null
    }
  }, 500)
})

onUnmounted(() => {
  const old = document.querySelector(".hud:not([data-vue])")
  if (old) {
    (old as HTMLElement).style.display = ""
  }

  if (aiThinkingPollId !== null) {
    clearInterval(aiThinkingPollId)
    aiThinkingPollId = null
  }
})

function handleOpenSettings(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.uiOverlayManager.openSettingsOverlay()
  }
}

function handleOpenAiLogic(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.openAiLogicPanel()
  }
}

function handlePauseToggle(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.toggleRoundPause()
  }
}

function handleNextRound(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.resolveRoundBids("manual")
  }
}

function handleSettle(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.settleCurrentRun()
  }
}

function handleReroll(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.startNewRun()
  }
}
</script>