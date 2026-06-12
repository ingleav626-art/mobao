/**
 * @file types/globals.d.ts
 * @description 全局变量声明。本项目通过 <script> 标签加载 JS 模块，
 *              大量变量挂载在 window 或全局作用域。此文件为 TS 编译器提供类型声明。
 */

// ==================== 全局变量 ====================

declare var GAME_SETTINGS: {
  maxRounds: number
  roundSeconds: number
  actionsPerRound: number
  bidStep: number
  directTakeRatio: number
  postRevealWaitMs: number
  bidRevealIntervalMs: number
}

declare var SKILL_DEFS: Array<{ id: string; name: string; description: string; maxPerRound: number }>

declare var ITEM_DEFS: Array<{ id: string; name: string; description: string }>

declare var MobaoAnimations: {
  animateOverlayOpen(el: Element): void
  animateOverlayClose(el: Element): void
  staggerEnter(els: Element[], opts?: Record<string, any>): void
  scrollToNumber(el: Element, num: number, opts?: Record<string, any>): void
  togglePauseVisual(el: Element, paused: boolean, timer: Element): void
  animateProfit(el: Element, val: number): void
}

// AudioManager 和 AudioUI 已在 TS 文件中定义，不再需要全局声明

declare var CharacterSystem: {
  getOutlineBonus(): number
  getQualityBonus(): number
  getOutlineSortStrategy(): string
  applyPassiveEffect(params: { profit: number }): { profit: number; bonus?: number; label?: string }
  resetForNewGame(): void
  getActiveCharacter(): { id: string; name: string; skillId: string; skillName: string; passive?: any } | null
}

declare var Overlay: Record<string, any>

declare var SkillSystem: {
  SKILL_DEFS: Array<{ id: string; name: string; description: string; maxPerRound: number; execute?: Function }>
}

declare var ItemSystem: {
  ITEM_DEFS: Array<{ id: string; name: string; description: string; initialCount?: number; execute?: Function }>
}

declare var MobileHandler: Record<string, any>

declare var PublicEventSystem: Record<string, any>

declare var LlmManager: Record<string, any>

declare var ArtifactData: {
  QUALITY_CONFIG: Record<string, { label: string; color: number; glow: number; weight: number }>
  ARTIFACT_LIBRARY: Array<{ basePrice: number; name: string; category: string; qualityKey: string; w: number; h: number; id?: string }>
  toSizeTag(w: number, h: number): string
}

declare var MobaoConstants: {
  DEFAULT_START_MONEY: number
  GRID_ROWS: number
  GRID_COLS: number
}

declare var MobaoUtils: {
  createEmptyAiPrivateIntelPool(): any
  clamp(val: number, min: number, max: number): number
  formatTrackIndex(idx: number): string
  shuffle<T>(arr: T[]): T[]
  formatCompactNumber(val: number): string
  compactOneLine(obj: any, maxLen: number): string
  toCellKey(x: number, y: number): string
  fromCellKey(key: string): { x: number; y: number }
  sizeTagToCellCount(tag: string): number
}

declare var MobaoAi: Record<string, any>

declare var MobaoMapProfiles: {
  getSelectedProfileId(): string
  setSelectedProfileId(id: string): void
  getProfile(id: string): { name: string; params: Record<string, any> } | null
}

declare var CharacterData: {
  CHARACTERS: Array<{ id: string; name: string; avatarLabel?: string }>
}

declare class LanBridge {
  ws: { url: string; readyState: number } | null
  playerId: string
  roomCode: string
  connected: boolean
  static isNative(): boolean
  static startNativeServer(): boolean
  static getLocalServerUrl(): string | null
  static getNativeServerUrl(): string | null
  static getNativeWiFiIP(): string | null
  static discoverRoomsNative(): Array<{ serverIp: string; rooms: any[] }> | null
  connect(url: string, name: string): Promise<void>
  disconnect(): void
  createRoom(options: Record<string, any>): void
  joinRoom(code: string, password?: string): void
  reconnect(url: string, roomCode: string, playerId: string): Promise<any>
  send(data: Record<string, any>): void
  sendFullSync(playerId: string, data: Record<string, any>): void
  requestFullSync(): void
  on(event: string, handler: (data: any) => void): void
  broadcastRoundResult(round: number, bids: any[], reason: string): void
  broadcastRoundStart(round: number, maxRounds: number, currentBid: number, roundSeconds: number): void
  broadcastSettle(data: Record<string, any>): void
  broadcastSettleFinal(wallets: Record<string, number>, profitDetails: any[]): void
  togglePause(paused: boolean, timeLeft: number): void
}

// ==================== Window 属性 ====================

interface Window {
  MobaoShopBridge: Record<string, any>
  MobaoBattleRecordBridge: Record<string, any>
  MobaoSettlementBridge: Record<string, any>
  MobaoRoundManager: Record<string, any>
  MobaoSettlementManager: Record<string, any>
  MobaoSkillItemManager: Record<string, any>
  MobaoAnimations: typeof MobaoAnimations
  MobaoAppState: {
    load(): Record<string, any>
    recordGameFinished(won: boolean, profit: number): void
    patch(data: Record<string, any>): void
  }
  MobaoSettings: {
    savePlayerMoney(money: number): void
    GAME_SETTINGS: typeof GAME_SETTINGS
  }
  MobaoConstants: typeof MobaoConstants
  MobaoMapProfiles: typeof MobaoMapProfiles
  CharacterData: typeof CharacterData
  CharacterSystem: typeof CharacterSystem
  ArtifactData: typeof ArtifactData
  MobaoUtils: typeof MobaoUtils
  MobaoAi: typeof MobaoAi
  AudioUI: Record<string, any>
  AudioManager: Record<string, any>
  LanBridge: typeof LanBridge
  NativeBridge: {
    isNative(): boolean
    setGameRunning(running: boolean): void
  } | undefined
  MobaoLan: Record<string, any>
  onNativeServerError: ((msg: string) => void) | null
  onNativeServerStarted: ((ip: string, port: number) => void) | null
  Deps: Record<string, any>
  initDeps: (bridges: Record<string, any>) => void
}