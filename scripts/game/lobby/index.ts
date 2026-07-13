import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

/**
 * @file lobby/index.ts
 * @module lobby/index
 * @description 大厅主页面 Mixin（薄代理层）。_LobbyCoreMixin 方法体委托到 LobbyIndexManager，
 *              签名保持不变，运行时等价。LobbyCollectionMixin 保持原样（未纳入 Manager）。
 *              Phase 2 依赖注入过渡期保留。
 */
import { LobbyCollectionMixin } from "./collection"

export { sortCollectionItems } from "./collection"

// ─── 独立函数（可独立测试，LobbyIndexManager 也引用）───

export function isAiLlmEnabledForPlayer(map: Record<string, boolean> | null | undefined, playerId: string): boolean {
  return Boolean(map && map[playerId])
}

export function getSlotLayout(playerCount: number): { leftSlots: string[]; rightSlots: string[] } {
  const leftSlots = playerCount <= 2 ? ["p1"] : ["p1", "p2"]
  const rightSlots = playerCount <= 1 ? [] : playerCount <= 2 ? ["p2"] : playerCount <= 3 ? ["p3"] : ["p3", "p4"]
  return { leftSlots, rightSlots }
}

export { LobbyCarouselMixin as CarouselMixin } from "./carousel"
export { CharacterSelectMixin } from "./character-select"

const _LobbyCoreMixin: ThisType<WarehouseSceneThis> = {
  bindLobbyEvents() {
    return this.lobbyIndexManager.bindLobbyEvents()
  },
  showLobbyMain(skipAnimation?: boolean) {
    return this.lobbyIndexManager.showLobbyMain(skipAnimation)
  },
  showLobbySubPage(page: string) {
    return this.lobbyIndexManager.showLobbySubPage(page)
  },
  goToCharacterSelect() {
    return this.lobbyIndexManager.goToCharacterSelect()
  },
  showCharacterSelectPageWithMap() {
    return this.lobbyIndexManager.showCharacterSelectPageWithMap()
  },
  updateLobbyMoneyDisplay() {
    return this.lobbyIndexManager.updateLobbyMoneyDisplay()
  },
  cleanupGameScene() {
    return this.lobbyIndexManager.cleanupGameScene()
  },
  enterLobby() {
    return this.lobbyIndexManager.enterLobby()
  },
  enterLanRoom() {
    return this.lobbyIndexManager.enterLanRoom()
  },
  exitLobby() {
    return this.lobbyIndexManager.exitLobby()
  },
  startSoloGame() {
    return this.lobbyIndexManager.startSoloGame()
  },
  applyMapProfile() {
    return this.lobbyIndexManager.applyMapProfile()
  },
  initPlayersUI() {
    return this.lobbyIndexManager.initPlayersUI()
  },
  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement) {
    return this.lobbyIndexManager.updatePlayerAvatar(playerId, avatarEl)
  },
  isAiLlmEnabledForPlayer(playerId: string): boolean {
    return this.lobbyIndexManager.isAiLlmEnabledForPlayer(playerId)
  },
  initPreviewFilterOptions() {
    return this.lobbyIndexManager.initPreviewFilterOptions()
  },
  renderShopContent() {
    return this.lobbyIndexManager.renderShopContent()
  },
  syncItemManagerFromShop() {
    return this.lobbyIndexManager.syncItemManagerFromShop()
  },
  updatePlayerCharNames() {
    return this.lobbyIndexManager.updatePlayerCharNames()
  }
}

export const LobbyIndexMixin: ThisType<WarehouseSceneThis> = Object.assign({}, _LobbyCoreMixin, LobbyCollectionMixin)
