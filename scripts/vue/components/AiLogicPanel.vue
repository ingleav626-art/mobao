<template>
  <Teleport to="body">
    <Transition name="ai-panel-fade">
      <div v-if="store.isOpen" class="ai-logic-overlay" @click.self="handleClose">
        <div class="ai-logic-panel">
          <!-- 头部 -->
          <div class="ai-logic-head">
            <h2>AI 决策回放</h2>
            <button type="button" class="ai-logic-close-btn" @click="handleClose">&times;</button>
          </div>

          <div class="ai-logic-body">
            <!-- 当前回合决策卡片 -->
            <section v-if="store.currentRoundEntries.length > 0" class="ai-section">
              <h3 class="ai-section-title">当前回合决策</h3>
              <div v-for="(entry, idx) in store.currentRoundEntries" :key="'decision-' + idx" class="ai-player-card">
                <div class="ai-player-card-header">
                  <span class="player-name">{{ entry.playerName }}</span>
                  <span class="control-badge" :class="badgeClass(entry.controlMode)">
                    {{ badgeText(entry.controlMode) }}
                  </span>
                </div>
                <div class="ai-player-card-body">
                  <div class="ai-decision-summary">
                    <span class="label">最终出价</span>
                    <span class="value bid-value">{{ formatBid(entry.finalBid) }}</span>
                    <span class="label">决策来源</span>
                    <span class="value">{{ entry.decisionSource || "-" }}</span>
                  </div>

                  <!-- LLM 模式详情 -->
                  <template v-if="isLlmMode(entry.controlMode)">
                    <div v-if="entry.correctionAttempt > 0" class="ai-error-box">
                      纠错次数: {{ entry.correctionAttempt }}/2
                      <span v-if="entry.originalError"> | 原始错误: {{ entry.originalError }}</span>
                    </div>
                    <div v-if="entry.llmActionName" class="ai-decision-summary">
                      <span class="label">大模型动作</span>
                      <span class="value"
                        >{{ entry.llmActionName }}{{ entry.actionExecuted ? "（已执行）" : "（未执行）" }}</span
                      >
                    </div>
                    <div v-if="entry.ruleActionName" class="ai-decision-summary">
                      <span class="label">规则动作</span>
                      <span class="value">{{ entry.ruleActionName }}</span>
                    </div>
                    <div v-if="entry.thought" class="ai-thought-box">
                      <div class="thought-label">思考</div>
                      <pre class="thought-text">{{ entry.thought }}</pre>
                    </div>
                    <div v-if="entry.reasoningContent" class="ai-thought-box">
                      <div class="thought-label">思考过程</div>
                      <pre class="thought-text">{{ entry.reasoningContent }}</pre>
                    </div>
                    <div v-if="entry.error" class="ai-error-box">错误: {{ entry.error }}</div>
                    <div v-if="entry.cacheHitTokens || entry.cacheMissTokens" class="ai-cache-info">
                      缓存命中: {{ entry.cacheHitTokens || 0 }} tokens | 未命中: {{ entry.cacheMissTokens || 0 }} tokens
                      | 命中率: {{ entry.cacheHitRate || 0 }}%
                    </div>
                    <!-- Prompt 块 -->
                    <details v-if="entry.systemPrompt" class="ai-prompt-block">
                      <summary class="ai-prompt-block-header">System Prompt</summary>
                      <pre class="prompt-pre">{{ entry.systemPrompt }}</pre>
                    </details>
                    <details class="ai-prompt-block">
                      <summary class="ai-prompt-block-header">User Prompt</summary>
                      <pre class="prompt-pre">{{ entry.userPrompt || "" }}</pre>
                    </details>
                    <details class="ai-prompt-block">
                      <summary class="ai-prompt-block-header">Model Response</summary>
                      <pre class="prompt-pre">{{ entry.modelResponse || "" }}</pre>
                    </details>
                    <details v-if="entry.toolResultSummary" class="ai-prompt-block">
                      <summary class="ai-prompt-block-header">Tool Result</summary>
                      <pre class="prompt-pre">{{ entry.toolResultSummary }}</pre>
                    </details>
                    <details
                      v-if="entry.errorCorrectionPrompt || entry.errorCorrectionResponse"
                      class="ai-prompt-block"
                    >
                      <summary class="ai-prompt-block-header">Error Correction</summary>
                      <pre class="prompt-pre">
Prompt:
{{ entry.errorCorrectionPrompt || "" }}

Response:
{{ entry.errorCorrectionResponse || "" }}</pre
                      >
                    </details>
                    <details
                      v-if="entry.followupPrompt || entry.followupResponse || entry.followupError"
                      class="ai-prompt-block"
                    >
                      <summary class="ai-prompt-block-header">Follow-up</summary>
                      <pre class="prompt-pre">
Prompt:
{{ entry.followupPrompt || "" }}

Response:
{{ entry.followupResponse || entry.followupError || ""
                        }}{{
                          entry.followupActionRejected ? "\n\nAction Guard:\n" + entry.followupActionRejected : ""
                        }}</pre
                      >
                    </details>
                  </template>

                  <!-- 规则 AI 模式详情 -->
                  <template v-else>
                    <div class="ai-decision-summary">
                      <span class="label">信心</span>
                      <span class="value"
                        >{{ formatPercent(entry.confidence) }} | 人格 {{ entry.archetype || "规则型" }}</span
                      >
                    </div>
                    <div class="ai-decision-summary">
                      <span class="label">估值</span>
                      <span class="value"
                        >{{ formatBid(entry.perceivedValue) }} | 上限 {{ formatBid(entry.hardCap) }}</span
                      >
                      <span class="label">心理预期</span>
                      <span class="value">{{ formatBid(entry.psychExpectedBid) }}</span>
                    </div>
                    <details class="ai-detail-section">
                      <summary class="ai-detail-toggle">详细数据</summary>
                      <div class="ai-detail-content">
                        <div class="ai-decision-summary">
                          <span class="label">线索率</span>
                          <span class="value">{{ formatPercent(entry.intelClueRate) }}</span>
                          <span class="label">品质率</span>
                          <span class="value">{{ formatPercent(entry.intelQualityRate) }}</span>
                          <span class="label">不确定</span>
                          <span class="value">{{ formatFixed(entry.intelUncertainty) }}</span>
                          <span class="label">波动</span>
                          <span class="value">{{ formatFixed(entry.intelSpreadRatio) }}</span>
                        </div>
                        <div class="ai-confidence-detail">
                          信心拆解: 基础 {{ partsBase(entry.confidenceParts) }} + 线索
                          {{ partsClue(entry.confidenceParts) }} + 品质 {{ partsQuality(entry.confidenceParts) }} + 回合
                          {{ partsProgress(entry.confidenceParts) }} + 盘口 {{ partsMarket(entry.confidenceParts) }} +
                          工具 {{ partsTool(entry.confidenceParts) }} + 边缘奖励
                          {{ partsEdge(entry.confidenceParts) }} - 波动惩罚 {{ partsSpread(entry.confidenceParts) }} -
                          不确定惩罚 {{ partsUncertainty(entry.confidenceParts) }} + 情绪
                          {{ partsMood(entry.confidenceParts) }}
                        </div>
                        <div class="ai-confidence-detail">
                          工具影响: {{ entry.toolTag || "无" }} | 决策加分 {{ formatFixed(entry.toolScoreBoost) }}
                        </div>
                        <div class="ai-confidence-detail">
                          行为: {{ entry.actionTag || "常规" }}{{ entry.mistakeTag ? " | 失误:" + entry.mistakeTag : ""
                          }}{{ entry.diversifyTag ? " | 去同质:" + entry.diversifyTag : "" }}
                        </div>
                        <div class="ai-decision-summary">
                          <span class="label">超预期</span>
                          <span class="value"
                            >{{ formatPercent(entry.overheatRatio) }} | 回撤阈值
                            {{ formatPercent(entry.overheatThreshold) }}</span
                          >
                        </div>
                      </div>
                    </details>
                  </template>
                </div>
              </div>
            </section>

            <!-- 思考日志 -->
            <section class="ai-section">
              <h3 class="ai-section-title">AI 思考日志</h3>
              <template v-if="store.thoughtLogs.length === 0">
                <div class="ai-empty">暂无 AI 思考记录</div>
              </template>
              <details
                v-for="(run, runIdx) in groupedThoughtLogs"
                :key="'run-' + runIdx"
                class="ai-thought-run"
                :open="runIdx === 0"
              >
                <summary class="ai-thought-run-header">第 {{ run.runNo }} 局</summary>
                <div v-if="run.logs.length === 0" class="ai-empty">暂无 AI 思考记录</div>
                <div v-for="(log, logIdx) in run.logs" :key="'log-' + runIdx + '-' + logIdx" class="ai-thought-entry">
                  <div class="ai-thought-meta">
                    <span class="thought-round">R{{ log.round }}</span>
                    <span class="thought-player">{{ log.playerName }}</span>
                  </div>
                  <div class="ai-thought-text">{{ log.thought }}</div>
                  <div v-if="log.reasoningContent" class="ai-thought-reasoning">
                    <details>
                      <summary>[推理过程]</summary>
                      <pre class="reasoning-pre">{{ log.reasoningContent }}</pre>
                    </details>
                  </div>
                </div>
              </details>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useAiPanelStore } from "../stores/aiPanelStore"
import type { AiThoughtLogEntry, ConfidenceParts } from "../stores/aiPanelStore"
import { formatBidRevealNumber } from "../../game/core/utils"

const store = useAiPanelStore()

// ─── 分组思考日志 ───

interface ThoughtLogRun {
  runNo: number
  logs: AiThoughtLogEntry[]
}

const groupedThoughtLogs = computed<ThoughtLogRun[]>(() => {
  const logs = store.thoughtLogs
  if (logs.length === 0) return []
  const runs: ThoughtLogRun[] = []
  const runMap = new Map<number, AiThoughtLogEntry[]>()
  for (const log of logs) {
    const runNo = log.at ? 1 : 1
    const list = runMap.get(runNo) || []
    list.push(log)
    runMap.set(runNo, list)
  }
  runMap.forEach((logList, runNo) => {
    runs.push({ runNo, logs: logList })
  })
  runs.sort((a, b) => b.runNo - a.runNo)
  return runs
})

// ─── 辅助函数 ───

function formatBid(value: number | undefined | null): string {
  return formatBidRevealNumber(value ?? 0)
}

function formatPercent(value: number | undefined | null): string {
  if (value == null) return "0%"
  return Math.round(value * 100) + "%"
}

function formatFixed(value: number | undefined | null): string {
  if (value == null) return "0.00"
  return value.toFixed(2)
}

function isLlmMode(mode: string | undefined): boolean {
  return mode === "llm" || mode === "llm-corrected"
}

function isFallbackMode(mode: string | undefined): boolean {
  return !!mode && mode.startsWith("rule-fallback")
}

function badgeClass(mode: string | undefined): string {
  if (isFallbackMode(mode)) return "badge-fallback"
  if (isLlmMode(mode)) return "badge-llm"
  return "badge-rule"
}

function badgeText(mode: string | undefined): string {
  if (isFallbackMode(mode)) return "回退"
  if (isLlmMode(mode)) return "大模型"
  return "规则AI"
}

function partsBase(parts: ConfidenceParts | undefined): string {
  return (parts?.base ?? 0).toFixed(2)
}

function partsClue(parts: ConfidenceParts | undefined): string {
  return (parts?.clue ?? 0).toFixed(2)
}

function partsQuality(parts: ConfidenceParts | undefined): string {
  return (parts?.quality ?? 0).toFixed(2)
}

function partsProgress(parts: ConfidenceParts | undefined): string {
  return (parts?.progress ?? 0).toFixed(2)
}

function partsMarket(parts: ConfidenceParts | undefined): string {
  return (parts?.market ?? 0).toFixed(2)
}

function partsTool(parts: ConfidenceParts | undefined): string {
  return (parts?.tool ?? 0).toFixed(2)
}

function partsEdge(parts: ConfidenceParts | undefined): string {
  return (parts?.edgeBonus ?? 0).toFixed(2)
}

function partsSpread(parts: ConfidenceParts | undefined): string {
  return (parts?.spreadPenalty ?? 0).toFixed(2)
}

function partsUncertainty(parts: ConfidenceParts | undefined): string {
  return (parts?.uncertaintyPenalty ?? 0).toFixed(2)
}

function partsMood(parts: ConfidenceParts | undefined): string {
  return (parts?.mood ?? 0).toFixed(2)
}

function handleClose(): void {
  store.closePanel()
  // 尝试同步关闭游戏端面板
  try {
    const scene = (window as unknown as Record<string, unknown>).WarehouseSceneInstance as
      | { closeAiLogicPanel?: () => void }
      | undefined
    if (scene && typeof scene.closeAiLogicPanel === "function") {
      scene.closeAiLogicPanel()
    }
  } catch {
    // 场景未初始化，忽略
  }
}
</script>

<style scoped>
/* 覆盖层 */
.ai-logic-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ai-logic-panel {
  background: #fff;
  border-radius: 12px;
  width: 680px;
  max-width: 92vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

/* 头部 */
.ai-logic-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.ai-logic-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.ai-logic-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  padding: 0 4px;
  line-height: 1;
}

.ai-logic-close-btn:hover {
  color: #333;
}

/* 主体滚动区 */
.ai-logic-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

/* 分区 */
.ai-section {
  margin-bottom: 20px;
}

.ai-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #444;
  margin: 0 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e8e0d0;
}

.ai-empty {
  text-align: center;
  padding: 24px;
  color: #999;
  font-size: 13px;
}

/* 玩家卡片 */
.ai-player-card {
  border: 1px solid #e8d8b8;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.ai-player-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #faf5eb;
  border-bottom: 1px solid #e8d8b8;
}

.player-name {
  font-size: 14px;
  font-weight: 600;
  color: #3c2d1c;
}

.control-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.badge-llm {
  background: #e3f2fd;
  color: #1565c0;
}

.badge-rule {
  background: #f3e5f5;
  color: #7b1fa2;
}

.badge-fallback {
  background: #fff3e0;
  color: #e65100;
}

.ai-player-card-body {
  padding: 10px 12px;
}

/* 决策摘要 */
.ai-decision-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #5a4a3a;
  margin-bottom: 4px;
}

.ai-decision-summary .label {
  color: #8a7a68;
  font-size: 11px;
}

.ai-decision-summary .value {
  color: #3c2d1c;
  font-weight: 500;
}

.bid-value {
  color: #c62828;
  font-weight: 700;
}

/* 思考框 */
.ai-thought-box {
  margin: 6px 0;
  padding: 8px;
  background: #f8f4ec;
  border-radius: 6px;
  border-left: 3px solid #d4a574;
}

.thought-label {
  font-size: 11px;
  font-weight: 600;
  color: #8a7a68;
  margin-bottom: 4px;
}

.thought-text {
  margin: 0;
  font-size: 12px;
  color: #3c2d1c;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 错误框 */
.ai-error-box {
  margin: 6px 0;
  padding: 6px 8px;
  background: #fef0f0;
  border-radius: 4px;
  font-size: 12px;
  color: #c62828;
  border-left: 3px solid #c62828;
}

/* 缓存信息 */
.ai-cache-info {
  margin: 6px 0;
  padding: 4px 8px;
  background: #f0f4f8;
  border-radius: 4px;
  font-size: 11px;
  color: #5a7a9a;
}

/* Prompt 块 */
.ai-prompt-block {
  margin: 6px 0;
  border: 1px solid #e0d8c8;
  border-radius: 6px;
  overflow: hidden;
}

.ai-prompt-block-header {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6b5a48;
  background: #f5f0e8;
  cursor: pointer;
  user-select: none;
}

.ai-prompt-block-header:hover {
  background: #ede5d8;
}

.prompt-pre {
  margin: 0;
  padding: 10px;
  font-size: 11px;
  line-height: 1.5;
  color: #3c2d1c;
  background: #fafafa;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

/* 详细数据区 */
.ai-detail-section {
  margin: 6px 0;
  border: 1px solid #e8e0d0;
  border-radius: 6px;
  overflow: hidden;
}

.ai-detail-toggle {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #8a7a68;
  background: #f8f4ec;
  cursor: pointer;
  user-select: none;
}

.ai-detail-toggle:hover {
  background: #f0e8dc;
}

.ai-detail-content {
  padding: 8px 10px;
}

.ai-confidence-detail {
  font-size: 11px;
  color: #6b5a48;
  margin: 4px 0;
  line-height: 1.6;
}

/* 思考日志 */
.ai-thought-run {
  margin-bottom: 12px;
  border: 1px solid #e8e0d0;
  border-radius: 8px;
  overflow: hidden;
}

.ai-thought-run-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #3c2d1c;
  background: #f5f0e8;
  cursor: pointer;
  user-select: none;
}

.ai-thought-run-header:hover {
  background: #ede5d8;
}

.ai-thought-entry {
  padding: 8px 12px;
  border-bottom: 1px solid #f0ece4;
}

.ai-thought-entry:last-child {
  border-bottom: none;
}

.ai-thought-meta {
  font-size: 11px;
  color: #8a7a68;
  margin-bottom: 4px;
}

.thought-round {
  font-weight: 600;
  color: #5a4a3a;
  margin-right: 8px;
}

.thought-player {
  color: #6b5a48;
}

.ai-thought-text {
  font-size: 12px;
  color: #3c2d1c;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.ai-thought-reasoning {
  margin-top: 4px;
  font-size: 11px;
  color: #6b5a48;
}

.reasoning-pre {
  margin: 4px 0 0;
  padding: 6px;
  background: #f8f4ec;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 过渡动画 */
.ai-panel-fade-enter-active,
.ai-panel-fade-leave-active {
  transition: opacity 0.25s ease;
}

.ai-panel-fade-enter-from,
.ai-panel-fade-leave-to {
  opacity: 0;
}
</style>
