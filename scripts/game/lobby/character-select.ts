/**
 * @file scripts/game/lobby/character-select.ts
 * @module lobby/character-select
 * @description 角色选择薄入口。Phase 2 代理到 CharacterSelectManager，
 *              re-export 纯函数。原 Core/Live2D/CarryItems 子 Mixin 逻辑已迁入 Manager。
 *              核心逻辑：角色列表渲染、选择确认、Live2D 预览、携带道具管理。
 *
 * @exports CharacterSelectMixin - 角色选择 Mixin 薄代理，混入 Phaser Scene
 * @exports 纯函数 re-export - calcReplenishCost 等
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export {
  type CarryItem,
  type ReplenishItem,
  type ReplenishCostResult,
  calcReplenishCost
} from "./character-select/pure"

// ─── Mixin 薄代理（Phase 2：代理到 CharacterSelectManager，向后兼容 Object.assign 混入）───

export const CharacterSelectMixin: ThisType<WarehouseSceneThis> = {
  initCharacterSelect() {
    return this.characterSelectManager.initCharacterSelect()
  },

  bindCharacterSelectEvents() {
    return this.characterSelectManager.bindCharacterSelectEvents()
  },

  bindCardGlowEffect() {
    return this.characterSelectManager.bindCardGlowEffect()
  },

  showCharacterSelectPage(mapProfile: { name?: string } | null) {
    return this.characterSelectManager.showCharacterSelectPage(mapProfile)
  },

  hideAllLobbySubPages() {
    return this.characterSelectManager.hideAllLobbySubPages()
  },

  renderCharacterList() {
    return this.characterSelectManager.renderCharacterList()
  },

  renderSelectedCharacterPreview() {
    return this.characterSelectManager.renderSelectedCharacterPreview()
  },

  selectCharacter(characterId: string) {
    return this.characterSelectManager.selectCharacter(characterId)
  },

  confirmCharacterSelection() {
    return this.characterSelectManager.confirmCharacterSelection()
  },

  _doStartSoloGame() {
    return this.characterSelectManager._doStartSoloGame()
  },

  _showCarryConfirm(message: string, onConfirm: (() => void) | null, confirmText?: string) {
    return this.characterSelectManager._showCarryConfirm(message, onConfirm, confirmText)
  },

  updateCharacterMoneyDisplay() {
    return this.characterSelectManager.updateCharacterMoneyDisplay()
  },

  getSelectedCharacterForGame() {
    return this.characterSelectManager.getSelectedCharacterForGame()
  },

  _startLive2dLoop(src: string, videoA: HTMLVideoElement, videoB: HTMLVideoElement) {
    return this.characterSelectManager._startLive2dLoop(src, videoA, videoB)
  },

  _stopLive2dLoop() {
    return this.characterSelectManager._stopLive2dLoop()
  },

  renderCarryItems() {
    return this.characterSelectManager.renderCarryItems()
  },

  openCarryItemPicker() {
    return this.characterSelectManager.openCarryItemPicker()
  },

  closeCarryItemPicker() {
    return this.characterSelectManager.closeCarryItemPicker()
  },

  removeCarryItem(itemId: string) {
    return this.characterSelectManager.removeCarryItem(itemId)
  },

  _saveCarryItems() {
    return this.characterSelectManager._saveCarryItems()
  },

  _loadCarryItems() {
    return this.characterSelectManager._loadCarryItems()
  },

  _bindAutoReplenishToggle() {
    return this.characterSelectManager._bindAutoReplenishToggle()
  },

  _saveAutoReplenish() {
    return this.characterSelectManager._saveAutoReplenish()
  },

  _loadAutoReplenish() {
    return this.characterSelectManager._loadAutoReplenish()
  },

  calcReplenishCost() {
    return this.characterSelectManager.calcReplenishCost()
  },

  executeReplenish() {
    return this.characterSelectManager.executeReplenish()
  }
}
