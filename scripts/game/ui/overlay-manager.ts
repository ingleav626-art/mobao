/**
 * @file overlay-manager.ts
 * @module ui/overlay-manager
 * @description UiOverlayManager -- 弹窗与覆盖层管理器（薄协调器）。
 *              方法体委托到 overlay-manager/ 子模块函数文件。
 *              构造函数注入依赖，私有状态由 Manager 内部持有。
 */
import type { RunLog } from "../ai/decision"
import type { CrossGameMemory } from "../../../types/ai"

import { hideSettleOverlay, showSettleOverlay, openAiLogicPanel, closeAiLogicPanel, renderAiThoughtLog, openShopOverlay, closeShopOverlay } from "./overlay-manager/core-fns"
import { showInfoPopup, hideInfoPopup, showPlayerInfoPopover, positionPlayerInfoPopover, hidePlayerInfoPopover } from "./overlay-manager/info-popup-fns"
import { showItemDetailPopup, hideItemDetailPopup, showCharacterInfoPopup, hideCharacterInfoPopup } from "./overlay-manager/detail-popup-fns"
import { showGameConfirm, hideGameConfirm } from "./overlay-manager/confirm-dialog-fns"
import { openSettingsOverlay, closeSettingsOverlay, isSettingsOverlayOpen, settingsInputId, fillSettingsForm, readSettingsForm, setSettingsStatus, saveSettingsFromOverlay } from "./overlay-manager/settings-fns"
import { showLanRestartVoteDialog, removeLanRestartDialog, showLanRestartWaitingDialog, showLanRestartDeclinedDialog, showLanPauseOverlay, hideLanPauseOverlay } from "./overlay-manager/lan-dialog-fns"
import { loadAiModelConfigs, saveAiModelConfigs, openAiModelConfigOverlay, closeAiModelConfigOverlay, renderAiModelConfigContent, saveAiModelConfigFromForm, getAiModelConfig } from "./overlay-manager/ai-config-fns"
import { openAiMemoryPanel, setupAiMemoryTouchScroll, closeAiMemoryPanel } from "./overlay-manager/ai-memory-fns"
import { updateReflectionStatusUI, showReflectionPendingDialog, showReflectionPendingDialogForBack, removeReflectionPendingDialog } from "./overlay-manager/ai-reflection-fns"

/** 联机桥最小接口（仅约束 send 方法） */
export type OverlayLanBridge = { send: (msg: unknown) => void } | null

/** 玩家最小接口 */
export interface OverlayPlayer {
  id: string
  isHuman?: boolean
  name?: string
}

/** LLM Provider 最小接口 */
export interface OverlayLlmProvider {
  id: string
  name: string
  saveSettings?: (settings: Record<string, unknown>) => void
  applySettings?: (settings: Record<string, unknown>) => void
  loadSettings?: () => Record<string, unknown>
}

/** Phaser Tweens 最小接口 */
export interface OverlayTweens {
  add: (config: Record<string, unknown>) => void
}

/** AI 角色分配信息 */
export interface OverlayAiCharacterAssign {
  characterId: string
  skillName: string
  passive: { label?: string } | null
  characterName?: string
}

/** UiOverlayManager 依赖接口 */
export interface UiOverlayManagerDeps {
  dom: Record<string, HTMLElement | null>
  players: OverlayPlayer[]
  getIsLanMode: () => boolean
  getLanIsHost: () => boolean
  getLanBridge: () => OverlayLanBridge
  getSettled: () => boolean
  getRound: () => number
  getRoundTimeLeft: () => number
  getActionsLeft: () => number
  getRunLogHistory: () => RunLog[]
  getAiCharacterAssignments: () => Record<string, OverlayAiCharacterAssign>
  getAiReflectionState: () => string
  getAiReflectionStateDetail: () => string
  getAiReflectionTotal: () => number
  getAiReflectionCompleted: () => number
  getTweens: () => OverlayTweens
  setRound: (v: number) => void
  setRoundTimeLeft: (v: number) => void
  setActionsLeft: (v: number) => void
  renderAiLogicPanel: () => void
  updateLobbyMoneyDisplay: () => void
  updateHud: () => void
  closeBidKeypad: () => void
  closeItemDrawer: () => void
  fillLlmSettingsForm: (settings: Record<string, unknown>) => void
  getLlmSettings: () => Record<string, unknown>
  readLlmSettingsForm: () => Record<string, unknown>
  setLlmSettingsStatus: (text: string, state: string) => void
  getLlmProvider: () => OverlayLlmProvider | null
  writeLog: (msg: string) => void
  pushRunStartContextToAi: () => void
  toggleRoundPause: () => void
  ensureAiCrossGameMemory: (playerId: string) => CrossGameMemory
  shouldShowReflectionUI: () => boolean
  shouldGenerateSummary: () => boolean
  isAiMultiGameMemoryEnabled: () => boolean
  proceedToNewRun: () => void
  proceedToBack: () => void
}

/** UiOverlayManager 私有状态（由 Manager 内部持有，供函数文件读写） */
export interface UiOverlayManagerState {
  gameConfirmCallback: (() => void) | null
  gameCancelCallback: (() => void) | null
  settingsInitialValues: string | null
  aiMemoryTouchBound: boolean
}

/**
 * 弹窗与覆盖层管理器（薄协调器）。
 * 方法体委托到 overlay-manager/ 子模块函数文件。
 */
export class UiOverlayManager {
  private state: UiOverlayManagerState = {
    gameConfirmCallback: null,
    gameCancelCallback: null,
    settingsInitialValues: null,
    aiMemoryTouchBound: false
  }

  constructor(private readonly deps: UiOverlayManagerDeps) {}

  // ==================== CoreOverlayMixin ====================
  hideSettleOverlay(): void { hideSettleOverlay(this.deps) }
  showSettleOverlay(html: string): void { showSettleOverlay(this.deps, html) }
  openAiLogicPanel(): void { openAiLogicPanel(this.deps) }
  closeAiLogicPanel(): void { closeAiLogicPanel(this.deps) }
  renderAiThoughtLog(): void { renderAiThoughtLog(this.deps) }
  openShopOverlay(): void { openShopOverlay(this.deps) }
  closeShopOverlay(): void { closeShopOverlay(this.deps) }

  // ==================== InfoPopupMixin ====================
  showInfoPopup(title: string, sourceScrollEl: HTMLElement | null): void { showInfoPopup(this.deps, title, sourceScrollEl) }
  hideInfoPopup(): void { hideInfoPopup(this.deps) }
  showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number): void { showPlayerInfoPopover(title, htmlContent, x, y) }
  positionPlayerInfoPopover(x: number, y: number): void { positionPlayerInfoPopover(x, y) }
  hidePlayerInfoPopover(): void { hidePlayerInfoPopover() }

  // ==================== DetailPopupMixin ====================
  showItemDetailPopup(itemId: string, itemName: string | null, x: number, y: number): void { showItemDetailPopup(itemId, itemName, x, y) }
  hideItemDetailPopup(): void { hideItemDetailPopup() }
  showCharacterInfoPopup(playerId: string, x: number, y: number): void { showCharacterInfoPopup(this.deps, playerId, x, y) }
  hideCharacterInfoPopup(): void { hideCharacterInfoPopup() }

  // ==================== ConfirmDialogMixin ====================
  showGameConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void { showGameConfirm(this.deps, this.state, message, onConfirm, onCancel) }
  hideGameConfirm(): void { hideGameConfirm(this.deps, this.state) }

  // ==================== SettingsMixin ====================
  openSettingsOverlay(): void { openSettingsOverlay(this.deps, this.state) }
  closeSettingsOverlay(keepStatus: boolean = false, forceClose: boolean = false): void { closeSettingsOverlay(this.deps, this.state, keepStatus, forceClose) }
  isSettingsOverlayOpen(): boolean { return isSettingsOverlayOpen(this.deps) }
  settingsInputId(field: string): string { return settingsInputId(field) }
  fillSettingsForm(values: Record<string, unknown>): void { fillSettingsForm(values) }
  readSettingsForm(): Record<string, unknown> { return readSettingsForm() }
  setSettingsStatus(text: string, saved: boolean): void { setSettingsStatus(this.deps, text, saved) }
  saveSettingsFromOverlay(): void { saveSettingsFromOverlay(this.deps, this.state) }

  // ==================== LanDialogMixin ====================
  showLanRestartVoteDialog(hostName: string): void { showLanRestartVoteDialog(this.deps, hostName) }
  removeLanRestartDialog(): void { removeLanRestartDialog() }
  showLanRestartWaitingDialog(): void { showLanRestartWaitingDialog(this.deps) }
  showLanRestartDeclinedDialog(declinerName: string): void { showLanRestartDeclinedDialog(declinerName) }
  showLanPauseOverlay(): void { showLanPauseOverlay(this.deps) }
  hideLanPauseOverlay(): void { hideLanPauseOverlay() }

  // ==================== AiModelConfigMixin ====================
  loadAiModelConfigs(): Record<string, string | null> { return loadAiModelConfigs() }
  saveAiModelConfigs(configs: Record<string, string | null>): void { saveAiModelConfigs(configs) }
  openAiModelConfigOverlay(): void { openAiModelConfigOverlay(this.deps) }
  closeAiModelConfigOverlay(): void { closeAiModelConfigOverlay() }
  renderAiModelConfigContent(): void { renderAiModelConfigContent(this.deps) }
  saveAiModelConfigFromForm(): void { saveAiModelConfigFromForm(this.deps) }
  getAiModelConfig(aiIndex: number): Record<string, unknown> | null { return getAiModelConfig(aiIndex) }

  // ==================== AiMemoryPanelMixin ====================
  openAiMemoryPanel(): void { openAiMemoryPanel(this.deps, this.state) }
  setupAiMemoryTouchScroll(): void { setupAiMemoryTouchScroll(this.deps) }
  closeAiMemoryPanel(): void { closeAiMemoryPanel(this.deps) }

  // ==================== AiReflectionDialogMixin ====================
  updateReflectionStatusUI(): void { updateReflectionStatusUI(this.deps) }
  showReflectionPendingDialog(): void { showReflectionPendingDialog(this.deps) }
  showReflectionPendingDialogForBack(): void { showReflectionPendingDialogForBack(this.deps) }
  removeReflectionPendingDialog(): void { removeReflectionPendingDialog() }
}