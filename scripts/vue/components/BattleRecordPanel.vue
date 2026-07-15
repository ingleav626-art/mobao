<template>
  <div v-if="store.isOpen" class="battle-record-overlay" @click.self="handleClose">
    <section class="battle-record-panel">
      <!-- 日志视图 -->
      <template v-if="store.logViewRecordId">
        <LogView
          :record="currentLogRecord"
          :page="store.logViewPage"
          :max-round="maxLogRound"
          @close="handleCloseLogs"
          @prev="handlePrevPage"
          @next="handleNextPage"
        />
      </template>
      <!-- 战绩列表 -->
      <template v-else>
        <div class="battle-record-head">
          <h2>战绩</h2>
          <button type="button" @click="handleClose"><img src="../../../assets/images/icons/ui/close.svg" alt="" class="btn-icon"></button>
        </div>
        <div class="battle-record-summary">
          <div class="summary-grid">
            <div class="summary-item">
              <span class="summary-value">{{ totalGames }}</span>
              <span class="summary-label">总局数</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ totalWins }}</span>
              <span class="summary-label">胜场</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ winRate }}%</span>
              <span class="summary-label">胜率</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ totalProfit >= 0 ? "+" : "" }}{{ formatBid(totalProfit) }}</span>
              <span class="summary-label">累计利润</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ bestProfit > 0 ? "+" : "" }}{{ formatBid(bestProfit) }}</span>
              <span class="summary-label">最高单局</span>
            </div>
            <div class="summary-item">
              <span class="summary-value">{{ formatBid(worstProfit) }}</span>
              <span class="summary-label">最低单局</span>
            </div>
          </div>
        </div>
        <div class="battle-record-content">
          <template v-if="store.records.length === 0">
            <p class="battle-record-meta">暂无战绩，完成一局后会自动记录。</p>
          </template>
          <template v-else>
            <article v-for="(record, idx) in store.records" :key="record.id || idx" class="battle-record-entry">
              <h4>第 {{ store.records.length - idx }} 条 | {{ formatTime(record.finishedAt) }}</h4>
              <p class="battle-record-meta">拍下者：{{ record.winnerName || "-" }}（{{ record.reasonText || "结算" }}）</p>
              <p class="battle-record-meta">成交价：{{ formatBid(record.winnerBid) }} | 仓库总值：{{ formatBid(record.totalValue) }} | 拍下者利润：{{ (record.winnerProfit ?? 0) >= 0 ? "+" : "" }}{{ formatBid(record.winnerProfit ?? 0) }}</p>
              <p class="battle-record-meta">自身利润：{{ (getPlayerProfit(record) ?? 0) >= 0 ? "+" : "" }}{{ formatBid(getPlayerProfit(record)) }}{{ getDtText(record) }}</p>
              <p class="battle-record-meta">回合：{{ record.round }} | 藏品数：{{ record.warehouse?.itemCount || 0 }}</p>
              <div class="battle-record-actions">
                <button type="button" class="battle-record-replay-btn" @click="handleReplay(record.id)">复现该局结算页</button>
                <button v-if="hasLogs(record)" type="button" class="battle-record-log-btn" @click="handleViewLogs(record.id)">查看AI决策日志</button>
                <button type="button" class="battle-record-delete-btn" @click="handleDelete(record.id)">删除</button>
              </div>
              <details>
                <summary>查看该局真实仓库（揭晓后）</summary>
                <pre class="battle-record-warehouse">{{ warehouseText(record) }}</pre>
              </details>
            </article>
          </template>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue"
import { useBattleRecordStore } from "../stores/battleRecordStore"
import type { BattleRecord, WarehouseSnapshotItem } from "../../game/bridge/battle-record/types"
import { formatBidRevealNumber } from "../../game/core/utils"
import { formatRecordTime } from "../../game/bridge/battle-record/pure"
import { load as loadAppState } from "../../game/core/app-state"
import LogView from "./BattleRecordLogView.vue"
import { WarehouseScene } from "../../game/scene/warehouse-scene"

const OLD_DOM_IDS = [
  "battleRecordOverlay",
  "battleRecordPanel",
  "battleRecordSummary",
  "battleRecordContent",
  "battleRecordCloseBtn"
] as const

// 保存旧 DOM 的原始 display 值，用于 onUnmounted 恢复
const originalDisplays = new Map<string, string>()

function hideOldDom(): void {
  for (const id of OLD_DOM_IDS) {
    const el = document.getElementById(id)
    if (el) {
      originalDisplays.set(id, el.style.display)
      el.style.display = "none"
    }
  }
}

function restoreOldDom(): void {
  for (const id of OLD_DOM_IDS) {
    const el = document.getElementById(id)
    if (el) {
      const original = originalDisplays.get(id)
      el.style.display = original ?? ""
    }
  }
  originalDisplays.clear()
}

onMounted(() => {
  hideOldDom()
})

onUnmounted(() => {
  restoreOldDom()
})

const store = useBattleRecordStore()

const appState = computed(() => {
  try {
    return loadAppState()
  } catch {
    return { totalGamesPlayed: 0, totalWins: 0, totalProfit: 0 }
  }
})

const totalGames = computed(() => appState.value.totalGamesPlayed || 0)
const totalWins = computed(() => appState.value.totalWins || 0)
const totalProfit = computed(() => appState.value.totalProfit || 0)
const winRate = computed(() => (totalGames.value > 0 ? Math.round((totalWins.value / totalGames.value) * 100) : 0))

const bestProfit = computed(() => {
  let best = 0
  for (const r of store.records) {
    const p = Math.round(Number(r.playerProfit != null ? r.playerProfit : r.winnerProfit) || 0)
    if (p > best) best = p
  }
  return best
})

const worstProfit = computed(() => {
  let worst = 0
  for (const r of store.records) {
    const p = Math.round(Number(r.playerProfit != null ? r.playerProfit : r.winnerProfit) || 0)
    if (p < worst) worst = p
  }
  return worst
})

const currentLogRecord = computed<BattleRecord | null>(() => {
  if (!store.logViewRecordId) return null
  return store.records.find((r) => r.id === store.logViewRecordId) || null
})

const maxLogRound = computed(() => {
  const record = currentLogRecord.value
  if (!record || !record.logs) return 0
  const { roundPanelTexts, roundLogsByRound, aiThoughtLogs } = record.logs
  const roundSet = new Set<number>()
  if (roundPanelTexts) {
    Object.keys(roundPanelTexts).forEach((k) => {
      const n = Number(k)
      if (Number.isFinite(n) && n > 0) roundSet.add(n)
    })
  }
  if (roundLogsByRound) {
    Object.keys(roundLogsByRound).forEach((k) => {
      const n = Number(k)
      if (Number.isFinite(n) && n > 0) roundSet.add(n)
    })
  }
  if (aiThoughtLogs) {
    aiThoughtLogs.forEach((e) => {
      if (e.round) roundSet.add(e.round)
    })
  }
  const sorted = Array.from(roundSet).sort((a, b) => a - b)
  return sorted.length > 0 ? sorted[sorted.length - 1] : 0
})

function formatTime(finishedAt: string | number | undefined): string {
  return formatRecordTime(String(finishedAt || ""))
}

function formatBid(value: number | undefined): string {
  return formatBidRevealNumber(value ?? 0)
}

function getPlayerProfit(record: BattleRecord): number {
  return record.playerProfit != null ? record.playerProfit : (record.winnerProfit ?? 0)
}

function getDtText(record: BattleRecord): string {
  const dt = record.dividendTicketInfo
  if (!dt) return ""
  if (dt.mechanism === "dividend") {
    return ` | 分红+${dt.dividendPerPlayer || 0}`
  }
  if (dt.mechanism === "ticket") {
    return ` | 门票-${dt.ticketPerPlayer || 0}`
  }
  return ""
}

function hasLogs(record: BattleRecord): boolean {
  return !!(
    record.logs &&
    typeof record.logs.aiDecisionPanelText === "string" &&
    record.logs.aiDecisionPanelText.length > 0
  )
}

function warehouseText(record: BattleRecord): string {
  if (!record.warehouse || !Array.isArray(record.warehouse.items)) return "无数据"
  return record.warehouse.items
    .map((item: WarehouseSnapshotItem) => {
      return `${item.name || "未知"} | 品类:${item.category || "未知"} | 品质:${item.qualityKey || "未知"} | 位置(${Number(item.x || 0) + 1},${Number(item.y || 0) + 1}) | 尺寸${item.w || 0}x${item.h || 0} | 价值${item.trueValue || 0}`
    })
    .join("\n")
}

function handleClose(): void {
  const scene = WarehouseScene.instance
  if (scene && typeof scene.closeBattleRecordPanel === "function") {
    scene.closeBattleRecordPanel()
  } else {
    store.closePanel()
  }
}

function handleReplay(recordId: string | undefined): void {
  if (!recordId) return
  const scene = WarehouseScene.instance
  if (scene && typeof scene.openBattleRecordReplay === "function") {
    scene.openBattleRecordReplay(recordId)
  }
}

function handleViewLogs(recordId: string | undefined): void {
  if (!recordId) return
  const scene = WarehouseScene.instance
  if (scene && typeof scene.openBattleRecordLogs === "function") {
    scene.openBattleRecordLogs(recordId)
  } else {
    store.openLogs(recordId, 1)
  }
}

function handleDelete(recordId: string | undefined): void {
  if (!recordId) return
  const scene = WarehouseScene.instance
  if (scene && typeof scene.deleteBattleRecord === "function") {
    scene.deleteBattleRecord(recordId)
  } else {
    store.deleteRecord(recordId)
  }
}

function handleCloseLogs(): void {
  const scene = WarehouseScene.instance
  if (scene && typeof scene.closeBattleRecordLogs === "function") {
    scene.closeBattleRecordLogs()
  } else {
    store.closeLogs()
  }
}

function handlePrevPage(): void {
  if (store.logViewPage > 1) {
    store.logViewPage--
  }
}

function handleNextPage(): void {
  if (store.logViewPage < maxLogRound.value) {
    store.logViewPage++
  }
}
</script>