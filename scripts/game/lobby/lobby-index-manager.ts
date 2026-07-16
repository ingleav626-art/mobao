/**
 * @file lobby/lobby-index-manager.ts
 * @module lobby/lobby-index-manager
 * @description LobbyIndexManager -- 薄协调器，方法体委托给独立函数文件。
 *              构造函数注入可变状态容器（state）+ 只读依赖 + 跨 Mixin 回调。
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { Player } from "../../../types/game"
import { createLogger } from "../core/logger"
import {
  bindLobbyEvents,
  updateLobbyMoneyDisplay,
  applyMapProfile,
  initPlayersUI,
  updatePlayerAvatar,
  isAiLlmEnabledForPlayer,
  initPreviewFilterOptions,
  renderShopContent,
  syncItemManagerFromShop,
  updatePlayerCharNames
} from "./lobby-index-manager/init-fns"
import {
  showLobbyMain,
  showLobbySubPage,
  goToCharacterSelect,
  showCharacterSelectPageWithMap
} from "./lobby-index-manager/navigation-fns"
import { cleanupGameScene, enterLobby, enterLanRoom, exitLobby, startSoloGame } from "./lobby-index-manager/cleanup-fns"

const log = createLogger("LAN")

/** AI 角色分配信息 */
export interface AiCharacterAssignment {
  characterId: string
  characterName: string
}

/** LAN 桥接接口（lobby 方法所需子集） */
export interface LanBridgeLike {
  leaveRoom(): void
  disconnect(): void
  roomCode?: string
  send(msg: unknown): boolean
}

/** Phaser 游戏对象接口（lobby 方法所需子集） */
export interface PhaserGameLike {
  loop: {
    sleep(): void
    wake(): void
  }
}

/** 可变状态容器（原场景属性，Manager 可读写） */
export interface LobbyIndexState {
  isLanMode: boolean
  lanIsHost: boolean
  lanPlayers: unknown[]
  lanAiPlayers: unknown[]
  lanHostWallets: Record<string, unknown>
  lanHostBids: Record<string, unknown>
  lanAiLlmEnabled: boolean
  lanIdToSlotId: Record<string, string>
  slotIdToLanId: Record<string, string>
  lanMySlotId: string | null
  aiLlmPlayerEnabled: Record<string, boolean>
  players: Player[]
  playerMoney: number
  items: unknown[]
  itemLayer: { destroy(): void } | null
  gridLayer: { destroy(): void } | null
  revealCellLayer: { destroy(): void } | null
  activeSettlementSpinner: { destroy(): void } | null
  carouselOffset: number
  mapQualityWeights: Record<string, number> | null
  mapCategoryWeights: Record<string, number> | null
  aiCharacterAssignments: Record<string, AiCharacterAssignment> | null
  playerHistoryPanels: Record<string, HTMLElement | null>
}

/** LobbyIndexManager 依赖接口 */
export interface LobbyIndexManagerDeps {
  /** 可变状态容器（原场景属性） */
  state: LobbyIndexState
  /** DOM 元素映射（initPreviewFilterOptions 读取） */
  dom: Record<string, HTMLElement | null>
  /** LAN 通信桥（可 null） */
  lanBridge: LanBridgeLike | null
  /** Phaser 游戏对象（可 null） */
  game: PhaserGameLike | null
  /** Phaser tween 管理器 */
  getTweens: () => { killAll(): void }
  /** Phaser time clock */
  getTime: () => { removeAllEvents(): void }
  /** 道具管理器（syncItemManagerFromShop 读取） */
  itemManager: { items: Array<{ id: string; count?: number }> }
  // ─── 跨 Mixin 回调 ───
  openSettingsOverlay: () => void
  openCollectionOverlay: () => void
  openBattleRecordPanel: () => void
  openShopOverlay: () => void
  showGameConfirm: (msg: string, onConfirm: () => void) => void
  carouselScroll: (dir: number) => void
  renderCarousel: () => void
  renderMapDetail: () => void
  initLanLobby: () => void
  showCharacterSelectPage?: (mapProfile: { name?: string; params?: Record<string, unknown> } | null) => void
  stopRoundTimer: () => void
  exitSettlementPage: () => void
  startNewRun: () => void
  stopLive2dLoop: () => void
  writeLog: (msg: string) => void
  refreshPlayerHistoryUI: () => void
}

/**
 * 大厅主页面管理器（薄协调器）。
 *
 * 每个方法一行委托给对应独立函数文件中的导出函数。
 * 依赖通过构造函数注入：state 持有可变场景属性引用，deps 提供只读对象与跨 Mixin 回调。
 * Manager 内部不访问场景 this 属性，可独立单测。
 */
export class LobbyIndexManager {
  private readonly state: LobbyIndexState

  constructor(private readonly deps: LobbyIndexManagerDeps) {
    this.state = deps.state
  }

  bindLobbyEvents() {
    return bindLobbyEvents(this.deps, this.state)
  }

  showLobbyMain(skipAnimation?: boolean) {
    log.debug("[manager] showLobbyMain CALLED, skipAnimation={0}", skipAnimation)
    return showLobbyMain(this.state, skipAnimation)
  }

  showLobbySubPage(page: string) {
    return showLobbySubPage(this.deps, this.state, page)
  }

  goToCharacterSelect() {
    return goToCharacterSelect(this.deps, this.state)
  }

  showCharacterSelectPageWithMap() {
    return showCharacterSelectPageWithMap(this.deps, this.state)
  }

  updateLobbyMoneyDisplay() {
    return updateLobbyMoneyDisplay()
  }

  cleanupGameScene() {
    return cleanupGameScene(this.deps, this.state)
  }

  enterLobby() {
    return enterLobby(this.deps, this.state)
  }

  enterLanRoom() {
    log.debug("[manager] enterLanRoom CALLED")
    return enterLanRoom(this.deps, this.state)
  }

  exitLobby() {
    return exitLobby(this.deps)
  }

  startSoloGame() {
    return startSoloGame(this.deps, this.state)
  }

  applyMapProfile() {
    return applyMapProfile(this.state)
  }

  initPlayersUI() {
    return initPlayersUI(this.deps, this.state)
  }

  updatePlayerAvatar(playerId: string, avatarEl: HTMLElement) {
    return updatePlayerAvatar(this.state, playerId, avatarEl)
  }

  isAiLlmEnabledForPlayer(playerId: string): boolean {
    return isAiLlmEnabledForPlayer(this.state, playerId)
  }

  initPreviewFilterOptions() {
    return initPreviewFilterOptions(this.deps)
  }

  renderShopContent() {
    return renderShopContent(this.deps, this.state)
  }

  syncItemManagerFromShop() {
    return syncItemManagerFromShop(this.deps)
  }

  updatePlayerCharNames() {
    return updatePlayerCharNames(this.state)
  }
}
