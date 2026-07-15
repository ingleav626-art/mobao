<template>
  <Teleport to="body">
    <Transition name="settlement-fade">
      <div v-if="store.isActive" class="settlement-overlay" @click.self="handleOverlayClick">
        <div class="settlement-card">
          <!-- 标题 -->
          <h2 class="settlement-title">结算</h2>

          <!-- 赢家信息 -->
          <div class="settlement-section">
            <div class="settlement-section-label">拍下者</div>
            <div class="settlement-winner-name">
              {{ store.winner?.name ?? "—" }}
            </div>
            <div class="settlement-winner-bid">
              出价：<strong>{{ formatNumber(store.winBid) }}</strong>
            </div>
          </div>

          <!-- 仓库真实价值 vs 出价 -->
          <div class="settlement-section">
            <div class="settlement-section-label">价值对比</div>
            <div class="settlement-compare-row">
              <span class="compare-label">仓库价值</span>
              <span class="compare-value">{{ formatNumber(store.trueValue) }}</span>
            </div>
            <div class="settlement-compare-row">
              <span class="compare-label">成交价</span>
              <span class="compare-value">{{ formatNumber(store.winBid) }}</span>
            </div>
            <div class="settlement-compare-row settlement-profit-row">
              <span class="compare-label">利润</span>
              <span class="compare-value" :class="profitClass">
                {{ formatProfit(store.profit) }}
              </span>
            </div>
          </div>

          <!-- 玩家个人利润 -->
          <div v-if="store.playerProfitLabel" class="settlement-section">
            <div class="settlement-section-label">个人利润</div>
            <div class="settlement-player-profit">
              <span class="player-profit-label">{{ store.playerProfitLabel }}</span>
              <span class="player-profit-value" :class="playerProfitClass">
                {{ formatProfit(store.playerProfit) }}
              </span>
            </div>
          </div>

          <!-- 结算进度条 -->
          <div v-if="store.isSettling" class="settlement-section">
            <div class="settlement-section-label">揭示进度</div>
            <div class="settlement-progress-bar">
              <div class="settlement-progress-fill" :style="{ width: progressPercent + '%' }" />
            </div>
            <div class="settlement-progress-text">{{ progressPercent }}%</div>
          </div>

          <!-- 藏品逐个揭示区域 -->
          <div v-if="store.isSettling" class="settlement-section">
            <div class="settlement-section-label">藏品揭示</div>
            <div class="settlement-reveal-area">
              <div class="reveal-status-text">正在揭示藏品...</div>
              <div class="reveal-count">
                {{ revealProgressText }}
              </div>
              <button type="button" class="settlement-skip-btn" @click="handleSkipReveal">跳过揭示</button>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="settlement-actions">
            <button type="button" class="action-btn action-btn-primary" @click="handleBackToLobby">返回大厅</button>
            <button type="button" class="action-btn action-btn-secondary" @click="handleRestart">重开</button>
            <button type="button" class="action-btn action-btn-tertiary" @click="handleViewRecords">查看战绩</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useSettlementStore } from "../stores/settlementStore"
import { useGameStore } from "../stores/gameStore"
import { WarehouseScene } from "../../game/scene/warehouse-scene"

const store = useSettlementStore()
const gameStore = useGameStore()

const progressPercent = computed(() => {
  return Math.round(Math.max(0, Math.min(1, store.settlementProgress)) * 100)
})

const revealProgressText = computed(() => {
  return `${gameStore.round}/${gameStore.maxRounds} 回合`
})

const profitClass = computed(() => {
  if (store.profit > 0) return "profit-positive"
  if (store.profit < 0) return "profit-negative"
  return "profit-neutral"
})

const playerProfitClass = computed(() => {
  if (store.playerProfit > 0) return "profit-positive"
  if (store.playerProfit < 0) return "profit-negative"
  return "profit-neutral"
})

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatProfit(value: number): string {
  const prefix = value >= 0 ? "+" : ""
  return `${prefix}${formatNumber(value)}`
}

function handleOverlayClick(): void {
  // 点击遮罩层不做操作，防止误关
}

function handleSkipReveal(): void {
  const scene = WarehouseScene.instance
  if (scene) {
    scene.settlementRevealSkipRequested = true
  }
}

function handleBackToLobby(): void {
  const scene = WarehouseScene.instance
  if (scene && typeof scene.exitSettlementPage === "function") {
    scene.exitSettlementPage()
    if (typeof scene.enterLobby === "function") {
      scene.enterLobby()
    }
  }
}

function handleRestart(): void {
  const scene = WarehouseScene.instance
  if (scene && typeof scene.exitSettlementPage === "function") {
    scene.exitSettlementPage()
    if (typeof scene.proceedToNewRun === "function") {
      scene.proceedToNewRun()
    }
  }
}

function handleViewRecords(): void {
  const scene = WarehouseScene.instance
  if (scene && typeof scene.exitSettlementPage === "function") {
    scene.exitSettlementPage()
    if (typeof scene.openBattleRecordPanel === "function") {
      scene.openBattleRecordPanel()
    }
  }
}
</script>

<style scoped>
.settlement-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  pointer-events: auto;
}

.settlement-card {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 16px;
  padding: 28px 32px;
  width: 420px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 215, 0, 0.15);
  color: #e0d5c1;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

.settlement-title {
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: 700;
  color: #ffd700;
  text-align: center;
  letter-spacing: 2px;
}

.settlement-section {
  margin-bottom: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 0, 0.1);
}

.settlement-section-label {
  font-size: 11px;
  color: #8a7f6e;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.settlement-winner-name {
  font-size: 20px;
  font-weight: 700;
  color: #ffd700;
  margin-bottom: 4px;
}

.settlement-winner-bid {
  font-size: 14px;
  color: #b8a98c;
}

.settlement-compare-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 14px;
}

.compare-label {
  color: #9a8f7e;
}

.compare-value {
  font-weight: 600;
  color: #e0d5c1;
}

.settlement-profit-row {
  border-top: 1px solid rgba(255, 215, 0, 0.15);
  margin-top: 4px;
  padding-top: 8px;
}

.profit-positive {
  color: #ff6b6b;
}

.profit-negative {
  color: #51cf66;
}

.profit-neutral {
  color: #b8a98c;
}

.settlement-player-profit {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-profit-label {
  font-size: 14px;
  color: #9a8f7e;
}

.player-profit-value {
  font-size: 18px;
  font-weight: 700;
}

.settlement-progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 6px;
}

.settlement-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ffec8b, #ffd700);
  background-size: 200% 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.settlement-progress-text {
  font-size: 12px;
  color: #8a7f6e;
  text-align: right;
}

.settlement-reveal-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reveal-status-text {
  font-size: 13px;
  color: #b8a98c;
}

.reveal-count {
  font-size: 12px;
  color: #8a7f6e;
}

.settlement-skip-btn {
  align-self: flex-start;
  padding: 6px 16px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.08);
  color: #ffd700;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.settlement-skip-btn:hover {
  background: rgba(255, 215, 0, 0.18);
  border-color: rgba(255, 215, 0, 0.5);
}

.settlement-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.action-btn {
  flex: 1;
  padding: 10px 0;
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s,
    border-color 0.2s,
    transform 0.1s;
  text-align: center;
}

.action-btn:active {
  transform: scale(0.97);
}

.action-btn-primary {
  background: rgba(255, 215, 0, 0.15);
  color: #ffd700;
  border-color: rgba(255, 215, 0, 0.3);
}

.action-btn-primary:hover {
  background: rgba(255, 215, 0, 0.25);
  border-color: rgba(255, 215, 0, 0.5);
}

.action-btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: #e0d5c1;
  border-color: rgba(255, 255, 255, 0.12);
}

.action-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.action-btn-tertiary {
  background: rgba(255, 255, 255, 0.06);
  color: #b8a98c;
  border-color: rgba(255, 255, 255, 0.1);
}

.action-btn-tertiary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
}

/* 过渡动画 */
.settlement-fade-enter-active,
.settlement-fade-leave-active {
  transition: opacity 0.3s ease;
}

.settlement-fade-enter-active .settlement-card,
.settlement-fade-leave-active .settlement-card {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.settlement-fade-enter-from,
.settlement-fade-leave-to {
  opacity: 0;
}

.settlement-fade-enter-from .settlement-card,
.settlement-fade-leave-to .settlement-card {
  transform: scale(0.92);
  opacity: 0;
}
</style>
