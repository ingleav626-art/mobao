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
  bindAllButtonEffects(selector: string): void
  bindRipple(el: Element): void
  bindPressScale(el: Element): void
  pulse(el: Element, style?: string, opts?: Record<string, any>): void
  stopPulse(el: Element): void
}

// AudioManager 和 AudioUI 已在 TS 文件中定义，不再需要全局声明

declare var CharacterSystem: {
  getOutlineBonus(): number
  getQualityBonus(): number
  getOutlineSortStrategy(): string
  applyPassiveEffect(params: { profit: number }): { profit: number; bonus?: number; label?: string }
  resetForNewGame(): void
  getActiveCharacter(): { id: string; name: string; skillId: string; skillName: string; passive?: Record<string, unknown> } | null
  selectCharacter(id: string): void
  getDisplayName(playerId?: string): string
  getAvatarLabel(playerId?: string): string
  getActiveSkillId(): string | null
}

declare var Overlay: Record<string, any>

declare var SkillSystem: {
  SKILL_DEFS: Array<{ id: string; name: string; description: string; maxPerRound: number; execute?: (context: Record<string, unknown>) => Record<string, unknown> }>
}

declare var ItemSystem: {
  ITEM_DEFS: Array<{ id: string; name: string; description: string; initialCount?: number; maxPerRound?: number; execute?: (context: Record<string, unknown>) => Record<string, unknown> }>
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
  CELL_SIZE: number
  MARGIN: number
  CANVAS_NATIVE_HEIGHT: number
  MAX_WAREHOUSE_CELLS: number
  ARTIFACT_COUNT_RANGE: { min: number; max: number }
  WAREHOUSE_OCCUPANCY_RATIO_RANGE: { min: number; max: number }
  SETTINGS_FIELDS: string[]
}

declare var MobaoUtils: {
  createEmptyAiPrivateIntelPool(): Record<string, unknown>
  clamp(val: number, min: number, max: number): number
  formatTrackIndex(idx: number): string
  shuffle<T>(arr: T[]): T[]
  formatCompactNumber(val: number): string
  compactOneLine(obj: string, maxLen: number): string
  toCellKey(x: number, y: number): string
  fromCellKey(key: string): { x: number; y: number }
  sizeTagToCellCount(tag: string): number
  rgbHex(color: number): string
  qualityPulseDuration(qualityKey: string): number
}

declare var MobaoAi: Record<string, any>

declare var MobaoMapProfiles: {
  getSelectedProfileId(): string
  setSelectedProfileId(id: string): void
  getProfile(id: string): { name: string; params: Record<string, any> } | null
  getAllProfiles(): Array<{ id: string; name: string; icon?: string; desc?: string; params: Record<string, any> }>
}

declare var CharacterData: {
  CHARACTERS: Array<{ id: string; name: string; avatarLabel?: string; skillId?: string; skillName?: string }>
  getCharacterById(id: string): { id: string; name: string; skillId?: string; skillName?: string } | null
  getUnlockedCharacters(): Array<{ id: string; name: string }>
  getSelectedCharacter(): { id: string; name: string } | null
}

declare class LanBridge {
  ws: { url: string; readyState: number } | null
  playerId: string | null
  playerName: string | null
  roomCode: string | null
  connected: boolean
  isHost: boolean
  players: unknown[]
  _listeners: Record<string, Function[]>
  static isNative(): boolean
  static startNativeServer(): boolean
  static getLocalServerUrl(): string | null
  static getNativeServerUrl(): string | null
  static getNativeWiFiIP(): string | null
  static discoverRoomsNative(): Array<{ serverIp: string; rooms: Record<string, unknown>[] }> | null
  connect(url: string, name: string): Promise<void>
  disconnect(): void
  createRoom(options: Record<string, any>): void
  joinRoom(code: string, password?: string): void
  leaveRoom(): void
  startGame(options: Record<string, any>): void
  listRooms(): void
  reconnect(url: string, roomCode: string, playerId: string): Promise<Record<string, unknown>>
  send(data: Record<string, any>): void
  sendFullSync(playerId: string, data: Record<string, any>): void
  requestFullSync(): void
  on(event: string, handler: (data: any) => void): void
  broadcastRoundResult(round: number, bids: Array<Record<string, unknown>>, reason: string): void
  broadcastRoundStart(round: number, maxRounds: number, currentBid: number, roundSeconds: number): void
  broadcastSettle(data: Record<string, any>): void
  broadcastSettleFinal(wallets: Record<string, number>, profitDetails: Array<Record<string, unknown>>): void
  togglePause(paused: boolean, timeLeft: number): void
  submitBid(bid: number): void
  sendChat(text: string): void
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
    loadPlayerMoney(): number
    savePlayerMoney(money: number): void
    saveGameSettings(settings: Record<string, any>): void
    normalizeGameSettings(draft: Record<string, any>, base: Record<string, any>): Record<string, number>
    defaultGameSettings: Record<string, any>
    GAME_SETTINGS: typeof GAME_SETTINGS
  }
  MobaoConstants: typeof MobaoConstants
  MobaoMapProfiles: typeof MobaoMapProfiles
  CharacterData: typeof CharacterData
  CharacterSystem: typeof CharacterSystem
  ArtifactData: typeof ArtifactData
  MobaoUtils: typeof MobaoUtils
  MobaoAi: typeof MobaoAi
  MobaoLlm: Record<string, any>
  AudioUI: Record<string, any>
  AudioManager: Record<string, any>
  LanBridge: typeof LanBridge
  NativeBridge: {
    isNative(): boolean
    setGameRunning(running: boolean): void
    shareFile?(data: string, fileName?: string, title?: string): boolean | void
    openFileImport?(options?: Record<string, any>): void
  } | undefined
  MobaoLan: Record<string, any>
  MobaoShopPage: Record<string, any> | undefined
  onNativeServerError: ((msg: string) => void) | null
  onNativeServerStarted: ((ip: string, port: number) => void) | null
  Deps: Record<string, any>
  initDeps: (bridges: Record<string, any>) => void
  MobaoContextBuilder: Record<string, any>
  MobaoSceneLlm: Record<string, any>
  MobaoWarehouse: Record<string, any>
  MobaoLobby: Record<string, any>
  MobaoBidding: Record<string, any>
  WarehouseScene: any
  __onFileImportResult: ((data: string) => void) | null
  __onFileImportError: ((msg: string) => void) | null
  AuctionAI: Record<string, any>
  DeepSeekLLM: Record<string, any>
  DeepSeekProvider: Record<string, any>
  MobaoUi: Record<string, any>
  LLM_BRIDGE: Record<string, any>
}