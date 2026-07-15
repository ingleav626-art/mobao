import type { Artifact } from "../../../types/game"

/** Mixin this 类型：WarehouseScene 运行时完整接口（属性+方法） */
export interface WarehouseSceneLike {
  // Phaser Scene
  textures: Phaser.Textures.TextureManager
  load: Phaser.Loader.LoaderPlugin
  add: Phaser.Scene["add"]
  time: Phaser.Time.Clock
  tweens: Phaser.Tweens.TweenManager
  input: Phaser.Input.InputPlugin

  // 核心属性
  gridLayer: Phaser.GameObjects.Graphics | null
  revealCellLayer: Phaser.GameObjects.Graphics | null
  itemLayer: Phaser.GameObjects.Container | null
  items: Artifact[]
  revealedCells: boolean[][]
  warehouseCellIndex: Record<string, string>
  round: number
  actionsLeft: number
  roundTimeLeft: number
  currentBid: number
  bidLeader: string
  settled: boolean
  isSettlementRevealMode: boolean
  settlementRevealRunning: boolean
  settlementRevealSkipRequested: boolean
  selectedItem: Artifact | null
  warehouseTrueValue: number
  playerMoney: number
  players: { id: string; name: string; isAI: boolean; isSelf: boolean; characterId?: string | null }[]
  aiPrivateIntel: Record<string, unknown>
  dom: Record<string, HTMLElement | null>
  pendingRevealHintTargets: Artifact[] | null
  pendingRevealHintText: string
  pendingRevealHintSeenIds: Set<string> | null
  artifactManager: {
    getCandidatesByRevealState(state: Record<string, unknown>): Artifact[]
    getLibraryStats(): { total: number }
    createRandomArtifactForSlot(options: Record<string, unknown>): Artifact
  }
  _mapCategoryWeights: Record<string, number> | null
  _mapQualityWeights: Record<string, number> | null
  previewAnchor: { x: number; y: number }
  roundPaused: boolean
  roundResolving: boolean
  playerBidSubmitted: boolean

  // 核心方法（来自其他 Mixin）
  playSfx(key: string): void
  playMusic(key: string): void
  stopMusic(): void
  writeLog(msg: string): void
  updateHud(): void
  updateActionAvailability(): void
  updateSidePanels(
    skillState: Record<string, unknown>,
    itemState: Record<string, unknown>,
    clueCount: number,
    occupiedCells: number,
    capacity: number,
    bidState: string
  ): void
  hidePreview(): void
  hideRevealScrollHints(): void
  hideSettleOverlay(): void
  refreshRevealScrollHints(): void
  hasAnyInfo(item: Artifact): boolean
  renderPreviewCandidates(item: Artifact): void
  setupPreviewTouchScroll(): void
  isPointOnSettlementLockedItem(x: number, y: number): boolean
  showGameConfirm(msg: string, onOk: () => void, onCancel?: () => void): void
  showItemDetailPopup(itemId: string, label: string, x: number, y: number): void
  showInfoPopup(title: string, scrollEl: HTMLElement | null): void
  startNewRun(): void
  startRound(): void
  resolveRoundBids(reason: string): void
  handleBidSubmit(): void
  settleCurrentRun(): void
  openBidKeypad(): void
  closeBidKeypad(): void
  renderItemDrawer(): void
  closeItemDrawer(): void
  isSettlementPageActive(): boolean
  positionPreview(x: number, y: number): void
  repositionPreview(): void
  aiMaxBid: number
  previewOpenTick: number
}
