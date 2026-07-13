/**
 * @file scripts/game/ui/overlay.ts
 * @module ui/overlay
 * @description 弹窗与覆盖层管理薄入口（代理层）。UiOverlayMixin 方法体委托到 UiOverlayManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 *              原 9 个子 Mixin 已合并到 Manager。
 *
 * @exports UiOverlayMixin - 弹窗与覆盖层 Mixin（薄代理），混入 Phaser Scene
 * @exports 纯函数 - getCollectionCategories, filterCollectionItems
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export { getCollectionCategories, filterCollectionItems } from "./overlay/pure"

export const UiOverlayMixin: ThisType<WarehouseSceneThis> = {
  // ─── CoreOverlayMixin ───
  hideSettleOverlay() {
    return this.uiOverlayManager.hideSettleOverlay()
  },
  showSettleOverlay(html: string) {
    return this.uiOverlayManager.showSettleOverlay(html)
  },
  openAiLogicPanel() {
    return this.uiOverlayManager.openAiLogicPanel()
  },
  closeAiLogicPanel() {
    return this.uiOverlayManager.closeAiLogicPanel()
  },
  renderAiThoughtLog() {
    return this.uiOverlayManager.renderAiThoughtLog()
  },
  openShopOverlay() {
    return this.uiOverlayManager.openShopOverlay()
  },
  closeShopOverlay() {
    return this.uiOverlayManager.closeShopOverlay()
  },

  // ─── InfoPopupMixin ───
  showInfoPopup(title: string, sourceScrollEl: HTMLElement | null) {
    return this.uiOverlayManager.showInfoPopup(title, sourceScrollEl)
  },
  hideInfoPopup() {
    return this.uiOverlayManager.hideInfoPopup()
  },
  showPlayerInfoPopover(title: string, htmlContent: string, x: number, y: number) {
    return this.uiOverlayManager.showPlayerInfoPopover(title, htmlContent, x, y)
  },
  positionPlayerInfoPopover(x: number, y: number) {
    return this.uiOverlayManager.positionPlayerInfoPopover(x, y)
  },
  hidePlayerInfoPopover() {
    return this.uiOverlayManager.hidePlayerInfoPopover()
  },

  // ─── DetailPopupMixin ───
  showItemDetailPopup(itemId: string, itemName: string | null, x: number, y: number) {
    return this.uiOverlayManager.showItemDetailPopup(itemId, itemName, x, y)
  },
  hideItemDetailPopup() {
    return this.uiOverlayManager.hideItemDetailPopup()
  },
  showCharacterInfoPopup(playerId: string, x: number, y: number) {
    return this.uiOverlayManager.showCharacterInfoPopup(playerId, x, y)
  },
  hideCharacterInfoPopup() {
    return this.uiOverlayManager.hideCharacterInfoPopup()
  },

  // ─── ConfirmDialogMixin（_gameConfirmCallback/_gameCancelCallback 同步到场景，供 events-overlay 读取）───
  showGameConfirm(msg: string, onOk: () => void, onCancel?: () => void) {
    this._gameConfirmCallback = onOk || null
    this._gameCancelCallback = onCancel || null
    return this.uiOverlayManager.showGameConfirm(msg, onOk, onCancel)
  },
  hideGameConfirm() {
    this._gameConfirmCallback = null
    this._gameCancelCallback = null
    return this.uiOverlayManager.hideGameConfirm()
  },

  // ─── SettingsMixin ───
  openSettingsOverlay() {
    return this.uiOverlayManager.openSettingsOverlay()
  },
  closeSettingsOverlay(keepStatus: boolean = false, forceClose: boolean = false) {
    return this.uiOverlayManager.closeSettingsOverlay(keepStatus, forceClose)
  },
  isSettingsOverlayOpen(): boolean {
    return this.uiOverlayManager.isSettingsOverlayOpen()
  },
  settingsInputId(field: string): string {
    return this.uiOverlayManager.settingsInputId(field)
  },
  fillSettingsForm(values: Record<string, unknown>) {
    return this.uiOverlayManager.fillSettingsForm(values)
  },
  readSettingsForm(): Record<string, unknown> {
    return this.uiOverlayManager.readSettingsForm()
  },
  setSettingsStatus(text: string, saved: boolean) {
    return this.uiOverlayManager.setSettingsStatus(text, saved)
  },
  saveSettingsFromOverlay() {
    return this.uiOverlayManager.saveSettingsFromOverlay()
  },

  // ─── LanDialogMixin ───
  showLanRestartVoteDialog(hostName: string) {
    return this.uiOverlayManager.showLanRestartVoteDialog(hostName)
  },
  removeLanRestartDialog() {
    return this.uiOverlayManager.removeLanRestartDialog()
  },
  showLanRestartWaitingDialog() {
    return this.uiOverlayManager.showLanRestartWaitingDialog()
  },
  showLanRestartDeclinedDialog(declinerName: string) {
    return this.uiOverlayManager.showLanRestartDeclinedDialog(declinerName)
  },
  showLanPauseOverlay() {
    return this.uiOverlayManager.showLanPauseOverlay()
  },
  hideLanPauseOverlay() {
    return this.uiOverlayManager.hideLanPauseOverlay()
  },

  // ─── AiModelConfigMixin ───
  loadAiModelConfigs(): Record<string, string | null> {
    return this.uiOverlayManager.loadAiModelConfigs()
  },
  saveAiModelConfigs(configs: Record<string, string | null>) {
    return this.uiOverlayManager.saveAiModelConfigs(configs)
  },
  openAiModelConfigOverlay() {
    return this.uiOverlayManager.openAiModelConfigOverlay()
  },
  closeAiModelConfigOverlay() {
    return this.uiOverlayManager.closeAiModelConfigOverlay()
  },
  renderAiModelConfigContent() {
    return this.uiOverlayManager.renderAiModelConfigContent()
  },
  saveAiModelConfigFromForm() {
    return this.uiOverlayManager.saveAiModelConfigFromForm()
  },
  getAiModelConfig(aiIndex: number) {
    return this.uiOverlayManager.getAiModelConfig(aiIndex)
  },

  // ─── AiMemoryPanelMixin ───
  openAiMemoryPanel() {
    return this.uiOverlayManager.openAiMemoryPanel()
  },
  setupAiMemoryTouchScroll() {
    return this.uiOverlayManager.setupAiMemoryTouchScroll()
  },
  closeAiMemoryPanel() {
    return this.uiOverlayManager.closeAiMemoryPanel()
  },

  // ─── AiReflectionDialogMixin ───
  updateReflectionStatusUI() {
    return this.uiOverlayManager.updateReflectionStatusUI()
  },
  showReflectionPendingDialog() {
    return this.uiOverlayManager.showReflectionPendingDialog()
  },
  showReflectionPendingDialogForBack() {
    return this.uiOverlayManager.showReflectionPendingDialogForBack()
  },
  removeReflectionPendingDialog() {
    return this.uiOverlayManager.removeReflectionPendingDialog()
  }
}
