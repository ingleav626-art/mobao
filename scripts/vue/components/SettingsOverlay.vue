<template>
  <div v-if="store.isSettingsOpen" class="settings-overlay" id="settingsOverlay">
    <section class="settings-panel" id="settingsPanel">
      <div class="settings-head">
        <h2>游戏设置</h2>
        <button id="settingsCloseBtn" type="button" @click="handleClose">
          <img src="../../../assets/images/icons/ui/close.svg" alt="" class="btn-icon">
        </button>
      </div>
      <p class="settings-sub">同页设置，不中断对局；保存后立即生效。</p>
      <div class="settings-scroll" id="settingsScroll">
        <div class="settings-grid" id="settingsFormInline">
          <!-- 音乐音量 -->
          <div class="settings-volume-row">
            <button type="button" class="volume-icon-btn" id="musicVolumeIcon" title="点击切换静音" @click="toggleMusicMute">
              <img
                :src="musicVolumeIconSrc"
                alt="音乐" class="volume-icon" :class="{ muted: store.game.musicVolume === 0 }" id="musicVolumeIconImg">
            </button>
            <span class="volume-label">音乐</span>
            <input type="range" id="setting-musicVolume" min="0" max="100" v-model.number="store.game.musicVolume"
              class="volume-slider" @input="onMusicVolumeChange" />
            <span class="volume-value" id="musicVolumeValue">{{ store.game.musicVolume }}%</span>
          </div>
          <!-- 回合时间 -->
          <div class="settings-stepper-row">
            <span class="stepper-label">回合时间（秒）：</span>
            <button type="button" class="stepper-btn" id="roundSecondsDecrease" :disabled="store.game.roundSeconds <= 10"
              @click="adjustGameField('roundSeconds', -5)">-</button>
            <input type="number" id="setting-roundSeconds" min="10" max="180" step="5"
              v-model.number="store.game.roundSeconds" class="stepper-input" readonly />
            <button type="button" class="stepper-btn" id="roundSecondsIncrease" :disabled="store.game.roundSeconds >= 180"
              @click="adjustGameField('roundSeconds', 5)">+</button>
          </div>
          <!-- 音效音量 -->
          <div class="settings-volume-row">
            <button type="button" class="volume-icon-btn" id="sfxVolumeIcon" title="点击切换静音" @click="toggleSfxMute">
              <img
                :src="sfxVolumeIconSrc"
                alt="音效" class="volume-icon" :class="{ muted: store.game.sfxVolume === 0 }" id="sfxVolumeIconImg">
            </button>
            <span class="volume-label">音效</span>
            <input type="range" id="setting-sfxVolume" min="0" max="100" v-model.number="store.game.sfxVolume"
              class="volume-slider" @input="onSfxVolumeChange" />
            <span class="volume-value" id="sfxVolumeValue">{{ store.game.sfxVolume }}%</span>
          </div>
          <!-- 结算速度 -->
          <div class="settings-stepper-row">
            <span class="stepper-label">结算速度倍率：</span>
            <button type="button" class="stepper-btn" id="settlementSpeedDecrease"
              :disabled="store.game.settlementSpeedMultiplier <= 0.5"
              @click="adjustGameField('settlementSpeedMultiplier', -0.5)">-</button>
            <input type="number" id="setting-settlementSpeedMultiplier" min="0.5" max="3" step="0.5"
              v-model.number="store.game.settlementSpeedMultiplier" class="stepper-input" readonly />
            <button type="button" class="stepper-btn" id="settlementSpeedIncrease"
              :disabled="store.game.settlementSpeedMultiplier >= 3"
              @click="adjustGameField('settlementSpeedMultiplier', 0.5)">+</button>
          </div>
          <!-- LLM 设置 -->
          <div class="settings-group settings-span-2" id="llmSettingsGroup"
            :class="{ 'settings-group-disabled': isLanMode }">
            <h3>AI实验接入</h3>
            <p class="settings-group-sub">支持多种大模型 API。密钥仅保存在本地浏览器。</p>
            <label>模型提供商：
              <select id="setting-llmProvider" v-model="store.llm.provider">
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="qwen">通义千问</option>
                <option value="glm">智谱GLM</option>
                <option value="kimi">Kimi</option>
              </select>
            </label>
            <div class="settings-inline-actions" style="margin-top: 4px;">
              <button id="addCustomProviderBtn" type="button">添加自定义模型</button>
              <button id="deleteProviderBtn" type="button" style="display: none;">
                <img src="../../../assets/images/icons/ui/delete-fill.svg" alt="" class="btn-icon">删除当前模型
              </button>
            </div>
            <p class="settings-group-sub" id="llmProviderDesc">DeepSeek 大模型，支持 V4 和 Reasoner 等思考模型</p>
            <label>启用实验模式
              <input type="checkbox" id="setting-llmEnabled" v-model="store.llm.enabled" />
            </label>
            <p class="settings-group-sub">开启后AI玩家使用大模型决策，否则使用规则AI。</p>
            <label style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">启用多局AI上下文
              <input type="checkbox" id="setting-llmMultiGameMemoryEnabled"
                v-model="store.llm.multiGameMemoryEnabled" />
              <span id="contextLengthInline"
                :class="{ hidden: !store.llm.multiGameMemoryEnabled }"
                style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;">
                最长上下文（局）：
                <button type="button" class="stepper-btn" id="contextLengthDecrease"
                  :disabled="store.llm.contextLength <= 2"
                  @click="adjustLlmField('contextLength', -1)">-</button>
                <input type="number" id="setting-contextLength" min="2" max="20" step="1"
                  v-model.number="store.llm.contextLength" class="stepper-input" readonly />
                <button type="button" class="stepper-btn" id="contextLengthIncrease"
                  :disabled="store.llm.contextLength >= 20"
                  @click="adjustLlmField('contextLength', 1)">+</button>
              </span>
            </label>
            <div class="settings-inline-actions" style="margin: 4px 0;">
              <button id="clearAiContextBtn" type="button" @click="handleClearAiContext">清空AI上下文</button>
            </div>
            <p class="settings-group-sub">开启后AI保留跨局历史记录，越玩越聪明。关闭仅停止发送，不删除记录。</p>
            <div id="summaryConfig" :class="{ hidden: !store.llm.autoSummarizeEnabled }" class="settings-sub-group">
              <label>自动总结
                <input type="checkbox" id="setting-autoSummarizeEnabled" v-model="store.llm.autoSummarizeEnabled"
                  checked />
              </label>
              <p class="settings-group-sub">达到上下文局数后自动触发AI总结，将经验写入跨局记忆。</p>
            </div>
            <label>启用局后AI反思
              <input type="checkbox" id="setting-llmReflectionEnabled" v-model="store.llm.reflectionEnabled" />
            </label>
            <p class="settings-group-sub">每局结算后AI自动反思决策优劣，反思结果写入跨局记忆。</p>
            <div id="reflectionScopeConfig" :class="{ hidden: !store.llm.reflectionEnabled }"
              class="settings-sub-group">
              <label>反思范围：</label>
              <label style="margin-left:12px;">
                <input type="radio" name="reflectionScope" value="current"
                  :checked="store.llm.reflectionScope === 'current'"
                  @change="store.updateLlmField('reflectionScope', 'current')" /> 仅本局
              </label>
              <label style="margin-left:12px;">
                <input type="radio" name="reflectionScope" value="full"
                  :checked="store.llm.reflectionScope === 'full'"
                  @change="store.updateLlmField('reflectionScope', 'full')" /> 全部上下文
              </label>
              <p class="settings-group-sub">仅本局：反思时只看当前对局表现。全部上下文：反思时同时参考历史记录。</p>
            </div>
            <label>启用思考模式
              <input type="checkbox" id="setting-llmThinkingEnabled" v-model="store.llm.thinkingEnabled" />
            </label>
            <p class="settings-group-sub">开启后模型会进行深度推理，适合复杂决策。注意：思考模式需要更长的响应时间（建议超时60秒以上）和更大的Token限制（建议4000以上）。</p>
            <div id="thinkingModeParams" :class="{ hidden: !store.llm.thinkingEnabled }"
              class="settings-sub-group">
              <label>思考模式请求参数（JSON，可选）：
                <input type="text" id="setting-thinkingParams" autocomplete="off"
                  placeholder='{"reasoning_effort":"max"}' v-model="store.llm.thinkingParams" />
              </label>
              <p class="settings-group-sub">
                DeepSeek: <code>{"reasoning_effort":"high"}</code> 或 <code>{"reasoning_effort":"max"}</code>（复杂任务）<br />
                OpenAI o1/o3: <code>{"reasoning_effort":"medium"}</code><br />
                留空使用默认参数。思考模式下 temperature 等参数不生效。
              </p>
            </div>
            <label>独立配置每个AI的模型
              <input type="checkbox" id="setting-llmIndependentModelEnabled"
                v-model="store.llm.independentModelEnabled" />
            </label>
            <p class="settings-group-sub">开启后可为每个AI单独配置不同的模型。</p>
            <div id="independentModelConfig" :class="{ hidden: !store.llm.independentModelEnabled }"
              class="settings-sub-group">
              <label>对反思与总结生效
                <input type="checkbox" id="setting-llmIndependentReflectionEnabled"
                  v-model="store.llm.independentReflectionEnabled" checked />
              </label>
              <p class="settings-group-sub">勾选时，AI反思与总结也使用各自配置的模型；不勾选时，统一使用默认模型进行反思与总结。</p>
              <div class="settings-inline-actions">
                <button id="configIndependentModelBtn" type="button">配置AI模型</button>
              </div>
              <p class="settings-group-sub">为每个AI选择使用哪个已配置的模型提供商，选择"使用默认配置"则使用上方当前选中的提供商。</p>
            </div>
            <div class="settings-inline-actions">
              <button id="clearAiMemoryBtn" type="button">清空AI记忆</button>
              <button id="viewAiMemoryBtn" type="button">查看AI记忆</button>
              <button id="exportAiMemoryBtn" type="button">导出记忆</button>
              <button id="importAiMemoryBtn" type="button">导入记忆</button>
              <button id="resetAiWalletBtn" type="button">重置AI钱包</button>
              <span class="settings-inline-hint" id="aiMemoryStatusText">{{ aiMemoryStatusText }}</span>
            </div>
            <p class="settings-group-sub">清空：删除所有AI的持久化记忆，不可恢复。查看：浏览AI的跨局记忆内容。导出/导入：备份或恢复AI记忆。重置AI钱包：将所有AI钱包恢复到初始100万。
            </p>
            <div id="llmProviderSettings" class="settings-provider-section">
              <label id="llmApiKeyLabel">API Key：
                <input type="text" id="setting-llmApiKey" autocomplete="off" placeholder="sk-..." inputmode="url"
                  v-model="store.llm.apiKey" />
              </label>
              <label id="llmEndpointLabel">API Endpoint：
                <input type="text" id="setting-llmEndpoint" autocomplete="off"
                  placeholder="https://api.example.com/v1/chat/completions" v-model="store.llm.endpoint" />
              </label>
              <label>模型名称：
                <input type="text" id="setting-llmModel" autocomplete="off" placeholder="model-name"
                  v-model="store.llm.model" />
              </label>
              <label>最大输出 Token（含思考链）：
                <input type="number" id="setting-maxTokens" min="100" max="100000" step="50"
                  v-model.number="store.llm.maxTokens" />
              </label>
              <label>请求超时时间（毫秒）：
                <input type="number" id="setting-timeoutMs" min="5000" max="120000" step="1000"
                  v-model.number="store.llm.timeoutMs" />
              </label>
            </div>
            <div class="settings-inline-actions">
              <button id="settingsTestLlmBtn" type="button">测试连接</button>
              <span class="settings-inline-hint" id="settingsLlmStatusText">{{ llmStatusText }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-actions">
        <button id="settingsResetBtn" type="button" @click="handleReset">恢复默认</button>
        <button id="settingsSaveBtn" type="button" @click="handleSave">保存</button>
        <button id="settingsReturnLobbyBtn" type="button" :class="{ hidden: !returnLobbyBtnVisible }"
          @click="handleReturnLobby">{{ returnLobbyBtnText }}</button>
      </div>
      <p class="settings-note" :class="{ 'settings-note-saved': statusSaved }" id="settingsStatusText">
        {{ statusText }}
      </p>
    </section>
    <!-- 未保存确认弹窗 -->
    <div v-if="showConfirm" class="game-confirm-overlay" @click.self="cancelConfirm">
      <div class="game-confirm-box">
        <p class="game-confirm-msg">{{ confirmText }}</p>
        <div class="game-confirm-actions">
          <button type="button" @click="confirmSave">保存</button>
          <button type="button" @click="confirmDiscard">不保存</button>
          <button type="button" @click="cancelConfirm">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useSettingsStore } from "../stores/settingsStore"
import { WarehouseScene } from "../../game/scene/warehouse-scene"
import { AudioManager } from "../../audio/audio-manager"
import type { GameSettingsData } from "../../game/core/settings"
import { defaultGameSettings } from "../../game/core/settings"

const store = useSettingsStore()

const statusText = ref("设置保存在本地浏览器中。")
const statusSaved = ref(false)
const aiMemoryStatusText = ref("")
const llmStatusText = ref("尚未测试连接。")
const showConfirm = ref(false)
const confirmText = ref("设置已修改，是否保存？")
let pendingAction: "close" | "reset" | null = null

/** 获取场景实例 */
function getScene(): WarehouseScene | null {
  return WarehouseScene.instance
}

/** 是否为 LAN 模式 */
const isLanMode = computed(() => {
  const scene = getScene()
  return scene ? scene.isLanMode : false
})

/** 音乐音量图标 */
const musicVolumeIconSrc = computed(() => {
  return store.game.musicVolume === 0
    ? "../../../assets/images/icons/ui/mute-fill.svg"
    : "../../../assets/images/icons/ui/sound-on.svg"
})

/** 音效音量图标 */
const sfxVolumeIconSrc = computed(() => {
  return store.game.sfxVolume === 0
    ? "../../../assets/images/icons/ui/mute-fill.svg"
    : "../../../assets/images/icons/ui/sound-on.svg"
})

/** 返回大厅按钮是否可见 */
const returnLobbyBtnVisible = computed(() => {
  const scene = getScene()
  if (!scene) return false
  const lobbyPage = document.getElementById("lobbyPage")
  const isLobbyVisible = lobbyPage && !lobbyPage.classList.contains("hidden")
  if (isLobbyVisible) return false
  if (scene.isLanMode) {
    return scene.lanIsHost ? true : false
  }
  return true
})

/** 返回大厅按钮文本 */
const returnLobbyBtnText = computed(() => {
  const scene = getScene()
  if (!scene) return "返回大厅"
  if (scene.isLanMode) {
    return scene.lanIsHost ? "返回房间" : "返回大厅"
  }
  return "返回大厅"
})

/** 调整游戏设置数值 */
function adjustGameField<K extends keyof GameSettingsData>(field: K, delta: number): void {
  const current = store.game[field] as number
  const newValue = Math.round((current + delta) * 10) / 10
  let clamped: number
  if (field === "roundSeconds") {
    clamped = Math.min(Math.max(newValue, 10), 180)
  } else if (field === "settlementSpeedMultiplier") {
    clamped = Math.min(Math.max(newValue, 0.5), 3)
  } else {
    clamped = Math.min(Math.max(newValue, 0), 100)
  }
  store.updateGameField(field, clamped as GameSettingsData[K])
}

/** 调整 LLM 设置数值 */
function adjustLlmField<K extends keyof typeof store.llm>(field: K, delta: number): void {
  const current = store.llm[field] as number
  const newValue = Math.round((current + delta) * 10) / 10
  const clamped = Math.min(Math.max(newValue, field === "contextLength" ? 2 : 0), field === "contextLength" ? 20 : 99999)
  store.updateLlmField(field, clamped as typeof store.llm[K])
}

/** 切换音乐静音 */
function toggleMusicMute(): void {
  const current = store.game.musicVolume
  store.updateGameField("musicVolume", (current > 0 ? 0 : 50) as GameSettingsData["musicVolume"])
  AudioManager.setMusicVolume(store.game.musicVolume / 100)
}

/** 切换音效静音 */
function toggleSfxMute(): void {
  const current = store.game.sfxVolume
  store.updateGameField("sfxVolume", (current > 0 ? 0 : 50) as GameSettingsData["sfxVolume"])
  AudioManager.setSfxVolume(store.game.sfxVolume / 100)
}

/** 音乐音量变化 */
function onMusicVolumeChange(): void {
  AudioManager.setMusicVolume(store.game.musicVolume / 100)
}

/** 音效音量变化 */
function onSfxVolumeChange(): void {
  AudioManager.setSfxVolume(store.game.sfxVolume / 100)
}

/** 清空AI上下文 */
function handleClearAiContext(): void {
  const scene = getScene()
  if (!scene) return
  scene.showGameConfirm("确定要清空AI跨局上下文吗？这将清除所有AI的跨局记忆和对话缓存。", () => {
    if (scene.aiCrossGameMessagesByPlayer) {
      Object.keys(scene.aiCrossGameMessagesByPlayer).forEach((pid) => {
        scene.aiCrossGameMessagesByPlayer[pid] = []
      })
    }
    if (scene.pendingNextRunAiSummaryByPlayer) {
      Object.keys(scene.pendingNextRunAiSummaryByPlayer).forEach((pid) => {
        scene.pendingNextRunAiSummaryByPlayer[pid] = ""
      })
    }
    if (scene.aiConversationCache) {
      Object.keys(scene.aiConversationCache).forEach((pid) => {
        scene.aiConversationCache[pid] = null
      })
    }
    scene.pendingSettlementSummary = ""
    scene.saveAiMemoryToStorage()
    scene.writeLog("AI跨局上下文已清空。")
    aiMemoryStatusText.value = "已清空"
  })
}

/** 关闭设置 */
function handleClose(): void {
  if (store.dirty) {
    pendingAction = "close"
    confirmText.value = "设置已修改，是否保存？"
    showConfirm.value = true
    return
  }
  const scene = getScene()
  if (scene) {
    scene.uiOverlayManager.closeSettingsOverlay(false, true)
  }
  store.closeSettings()
}

/** 保存设置 */
function handleSave(): void {
  const scene = getScene()
  if (scene) {
    scene.uiOverlayManager.saveSettingsFromOverlay()
  }
  store.resetDirty()
  statusText.value = "设置已保存并立即生效。"
  statusSaved.value = true
  setTimeout(() => {
    statusText.value = "设置保存在本地浏览器中。"
    statusSaved.value = false
  }, 3000)
}

/** 恢复默认 */
function handleReset(): void {
  if (store.dirty) {
    pendingAction = "reset"
    confirmText.value = "重置将丢弃所有更改，是否继续？"
    showConfirm.value = true
    return
  }
  const defaults = defaultGameSettings()
  store.syncGameSettings(defaults)
  store.resetDirty()
  statusText.value = "设置已重置为默认值。"
  statusSaved.value = false
}

/** 返回大厅/房间 */
function handleReturnLobby(): void {
  const scene = getScene()
  if (!scene) return
  if (scene.isLanMode) {
    scene.showGameConfirm("确定要返回房间吗？当前游戏进度将丢失。", () => {
      scene.uiOverlayManager.closeSettingsOverlay(false, true)
      store.closeSettings()
      scene.enterLanRoom()
    })
  } else {
    scene.showGameConfirm("确定要返回大厅吗？当前游戏进度将丢失。", () => {
      scene.uiOverlayManager.closeSettingsOverlay(false, true)
      store.closeSettings()
      scene.enterLobby()
    })
  }
}

/** 确认弹窗：保存 */
function confirmSave(): void {
  showConfirm.value = false
  const scene = getScene()
  if (scene) {
    scene.uiOverlayManager.saveSettingsFromOverlay()
  }
  store.resetDirty()
  statusText.value = "设置已保存并立即生效。"
  statusSaved.value = true
  if (pendingAction === "close") {
    store.closeSettings()
  }
  pendingAction = null
}

/** 确认弹窗：不保存 */
function confirmDiscard(): void {
  showConfirm.value = false
  store.resetDirty()
  store.loadGameSettings()
  statusText.value = "设置保存在本地浏览器中。"
  statusSaved.value = false
  if (pendingAction === "close") {
    store.closeSettings()
  }
  pendingAction = null
}

/** 取消确认弹窗 */
function cancelConfirm(): void {
  showConfirm.value = false
  pendingAction = null
}

let oldDomDisplay: string | null = null

onMounted(() => {
  // 隐藏旧 DOM 设置面板
  const old = document.getElementById("settingsOverlay")
  if (old) {
    oldDomDisplay = old.style.display || ""
    old.style.display = "none"
  }

  // 从旧 DOM 同步值到 store（如果场景已填充表单）
  syncFromOldDom()
})

onUnmounted(() => {
  // 恢复旧 DOM
  const old = document.getElementById("settingsOverlay")
  if (old) {
    old.style.display = oldDomDisplay
  }
})

/** 从旧 DOM 读取值并同步到 store */
function syncFromOldDom(): void {
  try {
    const roundSecEl = document.getElementById("setting-roundSeconds") as HTMLInputElement | null
    if (!roundSecEl) return

    const roundSec = Number(roundSecEl.value) || 60
    const speedMul = Number((document.getElementById("setting-settlementSpeedMultiplier") as HTMLInputElement | null)?.value || 1)
    const musicVol = Number((document.getElementById("setting-musicVolume") as HTMLInputElement | null)?.value || 70)
    const sfxVol = Number((document.getElementById("setting-sfxVolume") as HTMLInputElement | null)?.value || 80)

    store.syncGameSettings({
      ...store.game,
      roundSeconds: roundSec,
      settlementSpeedMultiplier: speedMul,
      musicVolume: musicVol,
      sfxVolume: sfxVol
    })

    // 同步 LLM 设置
    const llmEnabled = (document.getElementById("setting-llmEnabled") as HTMLInputElement | null)?.checked
    if (llmEnabled !== null) {
      const llmProvider = (document.getElementById("setting-llmProvider") as HTMLSelectElement | null)?.value
      const llmApiKey = (document.getElementById("setting-llmApiKey") as HTMLInputElement | null)?.value
      const llmEndpoint = (document.getElementById("setting-llmEndpoint") as HTMLInputElement | null)?.value
      const llmModel = (document.getElementById("setting-llmModel") as HTMLInputElement | null)?.value
      const maxTokens = Number((document.getElementById("setting-maxTokens") as HTMLInputElement | null)?.value || 2048)
      const timeoutMs = Number((document.getElementById("setting-timeoutMs") as HTMLInputElement | null)?.value || 40000)
      const multiGameMemory = (document.getElementById("setting-llmMultiGameMemoryEnabled") as HTMLInputElement | null)?.checked
      const reflection = (document.getElementById("setting-llmReflectionEnabled") as HTMLInputElement | null)?.checked
      const thinking = (document.getElementById("setting-llmThinkingEnabled") as HTMLInputElement | null)?.checked
      const independentModel = (document.getElementById("setting-llmIndependentModelEnabled") as HTMLInputElement | null)?.checked
      const contextLength = Number((document.getElementById("setting-contextLength") as HTMLInputElement | null)?.value || 5)
      const autoSummarize = (document.getElementById("setting-autoSummarizeEnabled") as HTMLInputElement | null)?.checked
      const independentReflection = (document.getElementById("setting-llmIndependentReflectionEnabled") as HTMLInputElement | null)?.checked
      const thinkingParams = (document.getElementById("setting-thinkingParams") as HTMLInputElement | null)?.value || ""

      const reflectionScopeEl = document.querySelector('input[name="reflectionScope"]:checked') as HTMLInputElement | null
      const reflectionScope = reflectionScopeEl?.value || "current"

      store.syncLlmSettings({
        enabled: llmEnabled,
        provider: llmProvider || "deepseek",
        apiKey: llmApiKey || "",
        endpoint: llmEndpoint || "",
        model: llmModel || "",
        maxTokens,
        timeoutMs,
        multiGameMemoryEnabled: !!multiGameMemory,
        reflectionEnabled: !!reflection,
        thinkingEnabled: !!thinking,
        independentModelEnabled: !!independentModel,
        contextLength,
        autoSummarizeEnabled: !!autoSummarize,
        independentReflectionEnabled: !!independentReflection,
        thinkingParams: thinkingParams || "",
        reflectionScope
      })
    }

    store.resetDirty()
  } catch (_e) {
    // 忽略同步错误
  }
}
</script>