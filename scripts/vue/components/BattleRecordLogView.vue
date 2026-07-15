<template>
  <article class="battle-record-log-view">
    <div class="battle-record-log-head">
      <h4>{{ record?.winnerName || "未知玩家" }} | {{ formatTime(record?.finishedAt) }}</h4>
      <button type="button" class="battle-record-log-close-btn" aria-label="关闭日志页" @click="emit('close')">×</button>
    </div>
    <p class="battle-record-meta">成交价：{{ formatBid(record?.winnerBid) }} | 仓库总值：{{ formatBid(record?.totalValue) }} | 拍下者利润：{{ (record?.winnerProfit ?? 0) >= 0 ? "+" : "" }}{{ formatBid(record?.winnerProfit ?? 0) }}</p>
    <p class="battle-record-meta">自身利润：{{ (playerProfit ?? 0) >= 0 ? "+" : "" }}{{ formatBid(playerProfit) }}{{ dtText }}</p>

    <div v-if="maxRound > 1" class="battle-record-log-pagination">
      <button type="button" class="battle-record-log-page-btn" :disabled="page <= 1" @click="emit('prev')">◀ 上一轮</button>
      <span class="battle-record-log-page-info">第 {{ page }} 轮 / 共 {{ maxRound }} 轮</span>
      <button type="button" class="battle-record-log-page-btn" :disabled="page >= maxRound" @click="emit('next')">下一轮 ▶</button>
    </div>

    <div class="battle-record-log-body">
      <template v-if="hasPanelText">
        <div class="ai-round-header">第 {{ page }} 轮 / 共 {{ maxRound }} 轮</div>
        <div v-if="roundPanelText" v-html="roundPanelText"></div>
        <div v-else-if="hasLegacyPanelText" class="log-view-legacy-note">
          <div class="ai-round-section-header">完整AI决策详情（旧版）</div>
          <div v-html="legacyPanelHtml"></div>
        </div>
        <div v-if="roundThoughts.length > 0" class="log-view-thoughts">
          <div class="ai-round-section-header">AI决策摘要</div>
          <div v-for="(thought, tidx) in roundThoughts" :key="tidx" class="ai-player-card" style="margin:6px 0;">
            <div class="ai-player-card-header">
              <span class="player-name">{{ thought.playerName || "AI" }}</span>
              <span :class="['control-badge', thought.controlMode === 'llm' ? 'badge-llm' : 'badge-rule']">{{ thought.controlMode === "llm" ? "大模型" : "规则AI" }}</span>
            </div>
            <div class="ai-player-card-body">
              <div class="ai-decision-summary">
                <span class="label">出价</span>
                <span class="value bid-value">{{ formatBid(thought.finalBid) }}</span>
                <span class="label">来源</span>
                <span class="value">{{ thought.decisionSource || "?" }}</span>
              </div>
              <div v-if="thought.thought" class="ai-thought-box">
                <div class="thought-label">思考</div>
                {{ thought.thought }}
              </div>
              <div v-if="thought.error" class="ai-error-box">错误: {{ thought.error }}</div>
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <p class="battle-record-meta">该局无AI决策日志（未使用大模型AI）。</p>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { BattleRecord, AiThoughtLogEntry } from "../../game/bridge/battle-record/types"
import { formatBidRevealNumber } from "../../game/core/utils"
import { formatRecordTime, parsePanelTextToHtml } from "../../game/bridge/battle-record/pure"

const props = defineProps<{
  record: BattleRecord | null
  page: number
  maxRound: number
}>()

const emit = defineEmits<{
  close: []
  prev: []
  next: []
}>()

const playerProfit = computed(() => {
  const r = props.record
  if (!r) return 0
  return r.playerProfit != null ? r.playerProfit : (r.winnerProfit ?? 0)
})

const dtText = computed(() => {
  const dt = props.record?.dividendTicketInfo
  if (!dt) return ""
  if (dt.mechanism === "dividend") {
    return ` | 分红+${dt.dividendPerPlayer || 0}`
  }
  if (dt.mechanism === "ticket") {
    return ` | 门票-${dt.ticketPerPlayer || 0}`
  }
  return ""
})

const panelText = computed(() => {
  if (!props.record?.logs || typeof props.record.logs.aiDecisionPanelText !== "string") return ""
  return props.record.logs.aiDecisionPanelText
})

const roundPanelTexts = computed(() => {
  return props.record?.logs?.roundPanelTexts || {}
})

const aiThoughtLogs = computed(() => {
  return (props.record?.logs?.aiThoughtLogs || []) as AiThoughtLogEntry[]
})

const hasPanelText = computed(() => {
  return panelText.value.length > 0
})

const hasLegacyPanelText = computed(() => {
  return panelText.value.length > 0 && Object.keys(roundPanelTexts.value).length === 0
})

const roundPanelText = computed(() => {
  return roundPanelTexts.value[String(props.page)] || null
})

const roundThoughts = computed(() => {
  return aiThoughtLogs.value.filter((e) => e.round === props.page)
})

const legacyPanelHtml = computed(() => {
  return parsePanelTextToHtml(panelText.value, escapeHtml)
})

function formatTime(finishedAt: string | number | undefined): string {
  return formatRecordTime(String(finishedAt || ""))
}

function formatBid(value: number | undefined): string {
  return formatBidRevealNumber(value ?? 0)
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
</script>