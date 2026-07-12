/**
 * @file main.ts
 * @module game/main
 * @description 游戏入口与组装文件。初始化桥接层、合并 Mixin、启动 Phaser。
 *
 * 职责：
 *   1. 创建并注册 LLM / 战绩 / 结算三个桥接器
 *   2. 将 scene/ 目录下提取的方法 + 原有 Mixin 合并到 WarehouseScene.prototype
 *   3. 配置并启动 Phaser.Game
 *
 * WarehouseScene 类定义在 scene/warehouse-scene.ts，方法实现在 scene/ 各文件。
 */
import {
  GRID_COLS as _GRID_COLS,
  GRID_ROWS as _GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  AI_LLM_SWITCH_STORAGE_KEY,
  BATTLE_RECORD_STORAGE_KEY,
} from "./core/constants"
import {
  clamp,
  formatBidRevealNumber,
  escapeHtml,
  compactOneLine,
  compactPanelText,
  indentMultiline,
  normalizeActionToken,
  isNoneActionText,
  pickFirstDefined,
  delay,
  tweenToPromise,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality,
} from "./core/utils"
import { GAME_SETTINGS as _GAME_SETTINGS } from "./core/settings"
import { SKILL_DEFS as _SKILL_DEFS } from "./data/skills"
import { ITEM_DEFS as _ITEM_DEFS } from "./data/items"
import "../llm/providers/deepseek-provider"
import "../llm/providers/openai-provider"
import "../llm/providers/qwen-provider"
import "../llm/providers/glm-provider"
import "../llm/providers/kimi-provider"
import { createSceneLlmBridge } from "../llm/core/scene-llm"
import { createBattleRecordBridge } from "./bridge/battle-record"
import { createSettlementBridge } from "./bridge/settlement"
import { initDeps } from "./core/deps"
import { LlmUiBridge } from "../llm/core/llm-ui-bridge"
import { LlmManager } from "../llm/core/llm-manager"
import { DeepSeekProvider } from "../llm/providers/deepseek-provider"
import { getActiveCharacter, getActiveSkillId, getDisplayName, getAvatarLabel } from "./data/character-system"

// DeepSeek settings 函数从旧版 deepseek-llm.ts 迁移到新 Provider 体系
// （deepseek-provider + LlmManager），保留原名以减少下游改动
const defaultDeepSeekSettings = DeepSeekProvider.defaultDeepSeekSettings
const loadDeepSeekSettings = DeepSeekProvider.getSettings
const saveDeepSeekSettings = DeepSeekProvider.applySettings
const normalizeDeepSeekSettings = DeepSeekProvider.normalizeDeepSeekSettings
const maskApiKey = LlmManager.utils.maskApiKey

// scene/ 提取的方法
import { WarehouseScene } from "./scene/warehouse-scene"
import { create, initAudio, cacheDom, initAnimations, bindDomEvents } from "./scene/scene-init"
import { startNewRun } from "./scene/scene-run"
import { updateHud, updateActionAvailability } from "./scene/scene-hud"
import * as SceneAiPanel from "./scene/scene-ai-panel"
import * as SceneUtils from "./scene/scene-utils"
import * as SceneSettlement from "./scene/scene-settlement"
import * as SceneBattleRecord from "./scene/scene-battle-record"

// 原有 Mixin
import { WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin } from "./warehouse/index"
import { AiWalletMixin, AiIntelMixin, AiMemoryMixin, AiReflectionMixin, AiDecisionMixin } from "./ai/index"
import { BiddingMixin } from "./bidding/index"
import { OverlayMixin, PanelsMixin, HistoryMixin } from "./ui/index"
import { LanIndexMixin } from "./lan/index"
import { LobbyIndexMixin, CarouselMixin, CharacterSelectMixin } from "./lobby/index"
import { RoundManagerMixin } from "./core/round-manager"
import { SkillItemManagerMixin } from "./core/skill-item-manager"
import { SettlementManagerMixin } from "./core/settlement-manager"

// ─── 桥接层初始化 ───

const LLM_SETTINGS = loadDeepSeekSettings ? loadDeepSeekSettings() : {}
export const MobaoLlm = {
  LLM_SETTINGS,
  saveDeepSeekSettings,
  maskApiKey,
  defaultDeepSeekSettings,
  loadDeepSeekSettings
}

const LLM_BRIDGE = createSceneLlmBridge({
  AI_LLM_SWITCH_STORAGE_KEY,
  LLM_SETTINGS,
  GAME_SETTINGS: _GAME_SETTINGS,
  SKILL_DEFS: _SKILL_DEFS,
  ITEM_DEFS: _ITEM_DEFS,
  normalizeDeepSeekSettings,
  maskApiKey,
  saveDeepSeekSettings,
  pickFirstDefined,
  compactOneLine,
  normalizeActionToken,
  isNoneActionText,
  compactPanelText,
  indentMultiline,
  formatBidRevealNumber
}) as any
export { LLM_BRIDGE }

const BATTLE_RECORD_BRIDGE: any = createBattleRecordBridge({
  BATTLE_RECORD_STORAGE_KEY,
  GRID_COLS: _GRID_COLS,
  GRID_ROWS: _GRID_ROWS,
  clamp,
  escapeHtml,
  formatBidRevealNumber
})

const SETTLEMENT_BRIDGE: any = createSettlementBridge({
  MARGIN,
  CELL_SIZE,
  delay,
  tweenToPromise,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
})

initDeps({ LLM_BRIDGE, BATTLE_RECORD_BRIDGE, SETTLEMENT_BRIDGE })

// ─── main.ts 独有方法（未提取到 scene/ 的 5 个方法）───

const MainOnlyMethods = {
  applyCharacterToPlayer(this: any) {
    if (!getActiveCharacter) return
    const char = getActiveCharacter()
    if (!char) return
    const self = this.players.find((p: any) => p.isSelf)
    if (!self) return
    self.characterId = char.id
    self.characterName = char.name
    self.name = getDisplayName()
    self.avatar = getAvatarLabel()
    const nameEl = document.getElementById(`name-${self.id}`)
    if (nameEl) nameEl.textContent = char.name
    this._activeSkillId = getActiveSkillId()
    this.refreshSkillButtonLabel()
  },

  bindCharacterSkillButton(this: any) {
    if (!this.dom.skillBtn) return
    this.dom.skillBtn.onclick = () => {
      const skillId =
        this._activeSkillId || getActiveSkillId() || "skill-outline-scan"
      this.useSkill(skillId)
    }
    this.refreshSkillButtonLabel()
  },

  refreshSkillButtonLabel(this: any) {
    if (!this.dom.skillBtn || !getActiveCharacter) return
    const char = getActiveCharacter()
    if (!char || !char.skillName) return
    this.dom.skillBtn.textContent = char.skillName
  },

  getLlmSettings(this: any) {
    const LLM_GLOBAL_SETTINGS_KEY = "mobao_llm_global_settings_v1"
    let globalSettings: Record<string, unknown> = {}
    try {
      const raw = window.localStorage.getItem(LLM_GLOBAL_SETTINGS_KEY)
      if (raw) {
        globalSettings = JSON.parse(raw)
      }
    } catch (_e) { }

    if (LlmManager) {
      const provider = LlmManager.getProvider()
      if (provider) {
        const providerSettings = provider.loadSettings()
        return { ...providerSettings, ...globalSettings }
      }
    }
    return { ...LLM_SETTINGS, ...globalSettings }
  },

  getLlmProvider(this: any) {
    const provider = LlmManager.getProvider()
    if (provider) {
      return provider
    }
    return {
      requestChat: (options: any) => DeepSeekProvider.requestChat(options),
      applySettings: (settings: any) => DeepSeekProvider.applySettings(settings)
    }
  }
}

// ─── Mixin 合并 ───

Object.assign(WarehouseScene.prototype,
  // scene/ 提取的方法
  SceneAiPanel,
  SceneUtils,
  SceneSettlement,
  SceneBattleRecord,
  { create, initAudio, cacheDom, initAnimations, bindDomEvents, startNewRun, updateHud, updateActionAvailability },
  // main.ts 独有方法
  MainOnlyMethods,
  // 原有 Mixin
  WarehouseCoreMixin,
  WarehouseRevealMixin,
  WarehousePreviewMixin,
  AiWalletMixin,
  AiIntelMixin,
  AiMemoryMixin,
  AiReflectionMixin,
  AiDecisionMixin,
  BiddingMixin,
  OverlayMixin,
  PanelsMixin,
  HistoryMixin,
  LobbyIndexMixin,
  CarouselMixin,
  CharacterSelectMixin,
  LanIndexMixin,
  RoundManagerMixin,
  SkillItemManagerMixin,
  SettlementManagerMixin
)

// ─── Phaser 启动 ───

const config = {
  type: (Phaser as any).AUTO,
  parent: "game-root",
  width: MARGIN * 2 + _GRID_COLS * CELL_SIZE,
  height: MARGIN * 2 + _GRID_ROWS * CELL_SIZE,
  backgroundColor: "transparent",
  transparent: true,
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  input: {
    touch: {
      capture: false
    }
  },
  scene: [WarehouseScene]
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    LlmUiBridge.initialize()
  })
} else {
  LlmUiBridge.initialize()
}

new (Phaser as any).Game(config)

export { WarehouseScene }
