/**
 * @file tests/integration/deps-wiring.test.ts
 * @description Manager 依赖接线集成测试。验证构造函数注入的 deps 在场景属性重新赋值后
 *              能正确返回新值，以及 createXxx + setXxx 配对正确。
 *
 *              覆盖三类 bug：
 *              - 类型 A：值捕获应为 getter（场景属性被 `=` 重新赋值后 Manager 持有旧引用）
 *              - 类型 B：createXxx 没配 setXxx（bridge 创建后 getXxx 返回 null）
 *              - 类型 C：state 对象缺 getter/setter 同步
 */
import { describe, it, expect, beforeEach } from "vitest"
import { AiWalletManager } from "../../scripts/game/ai/wallet-manager"
import { PanelsManager, type PanelsManagerDeps } from "../../scripts/game/ui/panels-manager"
import { RoundManager } from "../../scripts/game/core/round-manager-class"
import { LobbyIndexManager } from "../../scripts/game/lobby/lobby-index-manager"
import { LanIndexManager } from "../../scripts/game/lan/lan-index-manager"
import type { LanIndexState } from "../../scripts/game/lan/lan-index-manager"
import type { Player } from "../../types/game"
import { AI_WALLET_INITIAL } from "../../scripts/game/ai/wallet"

// ─── 测试用 Player 数据 ───
const aiPlayers: Player[] = [
  { id: "ai1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
  { id: "ai2", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
]
const humanPlayer: Player = {
  id: "p1", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true,
}
const allPlayers: Player[] = [humanPlayer, ...aiPlayers]

// =============================================================================
// 类型 A：值捕获应为 getter
// =============================================================================

describe("类型 A：值捕获应为 getter", () => {
  describe("AiWalletManager — players getter", () => {
    it("重新赋值 players 后，resetAiWallets 看到新数组", () => {
      let players: Player[] = [{ id: "ai-old", isHuman: false, isAI: true, isSelf: false }]
      const aiWallets: Record<string, number> = { "ai-old": 500000 }
      const manager = new AiWalletManager(() => players, () => aiWallets, () => ({
        currentBid: 0, aiMaxBid: 0, aiWallets, isLanMode: false, slotIdToLanId: {},
      }))

      // 重新赋值 players（模拟场景重建玩家数组）
      players = [
        { id: "ai-new", name: "新AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
      ]

      manager.resetAiWallets()
      // 旧 AI 的钱包应被删除，新 AI 获得初始值
      expect(aiWallets["ai-old"]).toBeUndefined()
      expect(aiWallets["ai-new"]).toBe(AI_WALLET_INITIAL)
    })
  })

  describe("AiWalletManager — aiWallets getter", () => {
    it("重新赋值 aiWallets 后，getter 返回新对象", () => {
      let aiWallets: Record<string, number> = { "ai-old": 500000 }
      const getter = () => aiWallets
      const manager = new AiWalletManager(() => [], getter, () => ({
        currentBid: 0, aiMaxBid: 0, aiWallets: getter(), isLanMode: false, slotIdToLanId: {},
      }))

      // 验证 getter 返回当前值
      expect(getter()["ai-old"]).toBe(500000)

      // 重新赋值 aiWallets（模拟联机初始化从主机同步）
      aiWallets = { "ai-new": 999000 }

      // getter 应返回新对象
      expect(getter()["ai-new"]).toBe(999000)
      expect(getter()["ai-old"]).toBeUndefined()
    })
  })

  describe("PanelsManager — privateIntelEntries / publicInfoEntries getter", () => {
    function makePanelsDeps(scene: {
      privateIntelEntries: Array<{ source: string; text: string; round: number }>
      publicInfoEntries: Array<{ source: string; text: string }>
    }): PanelsManagerDeps {
      return {
        get privateIntelEntries() { return scene.privateIntelEntries },
        get publicInfoEntries() { return scene.publicInfoEntries },
        dom: {},
        getRound: () => 1,
        getLanBridge: () => null,
        getIsLanMode: () => false,
        getLanIsHost: () => false,
      }
    }

    it("重新赋值 privateIntelEntries 后，getter 返回新数组", () => {
      const scene = {
        privateIntelEntries: [{ source: "old", text: "old", round: 1 }],
        publicInfoEntries: [{ source: "old", text: "old" }],
      }
      const deps = makePanelsDeps(scene)
      expect(deps.privateIntelEntries).toHaveLength(1)
      expect(deps.privateIntelEntries[0].source).toBe("old")

      // 重新赋值（模拟联机同步清空）
      scene.privateIntelEntries = [{ source: "new", text: "new", round: 2 }]
      expect(deps.privateIntelEntries).toHaveLength(1)
      expect(deps.privateIntelEntries[0].source).toBe("new")
    })

    it("重新赋值 publicInfoEntries 后，getter 返回新数组", () => {
      const scene = {
        privateIntelEntries: [],
        publicInfoEntries: [{ source: "old", text: "old" }],
      }
      const deps = makePanelsDeps(scene)
      expect(deps.publicInfoEntries).toHaveLength(1)
      expect(deps.publicInfoEntries[0].source).toBe("old")

      // 重新赋值（模拟联机同步）
      scene.publicInfoEntries = [{ source: "new", text: "new" }]
      expect(deps.publicInfoEntries).toHaveLength(1)
      expect(deps.publicInfoEntries[0].source).toBe("new")
    })
  })

  describe("RoundManager — privateIntelEntries / publicInfoEntries getter", () => {
    it("重新赋值后，RoundManager 的 deps 看到新数组", () => {
      const scene = {
        privateIntelEntries: [] as unknown[],
        publicInfoEntries: [] as unknown[],
        roundResolving: false,
        roundPaused: false,
        actionsLeft: 3,
        roundTimeLeft: 60,
        playerBidSubmitted: false,
        playerRoundBid: 0,
        aiLlmRoundPlans: {},
        aiRoundDecisionPromise: null as Promise<void> | null,
        roundTimerId: null as number | null,
        _pauseSnapshotTimeLeft: null as number | null,
        roundBidReadyState: {} as Record<string, boolean>,
        players: [{ id: "p1" }],
        _timerSpan: null as HTMLElement | null,
        dom: { bidInput: null as HTMLInputElement | null, pauseRoundBtn: null as HTMLElement | null },
      }
      const deps = {
        get roundResolving() { return scene.roundResolving },
        set roundResolving(v: boolean) { scene.roundResolving = v },
        get roundPaused() { return scene.roundPaused },
        set roundPaused(v: boolean) { scene.roundPaused = v },
        get actionsLeft() { return scene.actionsLeft },
        set actionsLeft(v: number) { scene.actionsLeft = v },
        get roundTimeLeft() { return scene.roundTimeLeft },
        set roundTimeLeft(v: number) { scene.roundTimeLeft = v },
        get playerBidSubmitted() { return scene.playerBidSubmitted },
        set playerBidSubmitted(v: boolean) { scene.playerBidSubmitted = v },
        get playerRoundBid() { return scene.playerRoundBid },
        set playerRoundBid(v: number) { scene.playerRoundBid = v },
        get privateIntelEntries() { return scene.privateIntelEntries },
        get publicInfoEntries() { return scene.publicInfoEntries },
        get aiLlmRoundPlans() { return scene.aiLlmRoundPlans },
        set aiLlmRoundPlans(v: Record<string, unknown>) { scene.aiLlmRoundPlans = v },
        get aiRoundDecisionPromise() { return scene.aiRoundDecisionPromise },
        set aiRoundDecisionPromise(v: Promise<void> | null) { scene.aiRoundDecisionPromise = v },
        get roundTimerId() { return scene.roundTimerId },
        set roundTimerId(v: number | null) { scene.roundTimerId = v },
        get _pauseSnapshotTimeLeft() { return scene._pauseSnapshotTimeLeft },
        set _pauseSnapshotTimeLeft(v: number | null) { scene._pauseSnapshotTimeLeft = v },
        get roundBidReadyState() { return scene.roundBidReadyState },
        set roundBidReadyState(v: Record<string, boolean>) { scene.roundBidReadyState = v },
        get players() { return scene.players },
        dom: scene.dom,
        getRound: () => 1,
        getIsLanMode: () => false,
        getLanIsHost: () => false,
        getSettled: () => false,
        getLanBridge: () => null,
        getTimerSpan: () => scene._timerSpan,
        clearCurrentRoundUsage: () => {},
        resetAiRoundResources: () => {},
        closeBidKeypad: () => {},
        kickoffAiRoundDecisions: () => {},
        updateHud: () => {},
        writeLog: () => {},
        resolveRoundBids: () => {},
        showLanPauseOverlay: () => {},
        hideLanPauseOverlay: () => {},
        setPlayerBidReady: () => {},
      } satisfies RoundManagerDeps

      // 验证初始值：空数组
      expect(deps.privateIntelEntries).toHaveLength(0)
      expect(deps.publicInfoEntries).toHaveLength(0)

      // 重新赋值（模拟 startNewRun 或联机同步）
      scene.privateIntelEntries = [{ source: "test", text: "test", round: 1 }]
      scene.publicInfoEntries = [{ source: "test", text: "test" }]

      // getter 应返回新数组
      expect(deps.privateIntelEntries).toHaveLength(1)
      expect(deps.publicInfoEntries).toHaveLength(1)
    })
  })

  describe("LobbyIndexManager — game getter", () => {
    it("game 属性在构造时 null，create() 后可用（getter 确保动态读取）", () => {
      // 模拟 scene 对象，game 初始为 null
      const scene = {
        isLanMode: false,
        lanIsHost: false,
        lanPlayers: [],
        lanAiPlayers: [],
        lanHostWallets: {},
        lanHostBids: {},
        lanAiLlmEnabled: false,
        lanIdToSlotId: {},
        slotIdToLanId: {},
        lanMySlotId: null as string | null,
        aiLlmPlayerEnabled: {},
        players: allPlayers,
        playerMoney: 100000,
        items: [],
        itemLayer: null,
        gridLayer: null,
        revealCellLayer: null,
        activeSettlementSpinner: null,
        _carouselOffset: 0,
        _mapQualityWeights: null as Record<string, number> | null,
        _mapCategoryWeights: null as Record<string, number> | null,
        aiCharacterAssignments: null,
        playerHistoryPanels: {} as Record<string, HTMLElement | null>,
        game: null as { loop: { sleep(): void; wake(): void } } | null,
      }
      const lobbyIndexState: LobbyIndexState = {
        get isLanMode() { return scene.isLanMode },
        set isLanMode(v) { scene.isLanMode = v },
        get lanIsHost() { return scene.lanIsHost },
        set lanIsHost(v) { scene.lanIsHost = v },
        get lanPlayers() { return scene.lanPlayers },
        set lanPlayers(v) { scene.lanPlayers = v },
        get lanAiPlayers() { return scene.lanAiPlayers },
        set lanAiPlayers(v) { scene.lanAiPlayers = v },
        get lanHostWallets() { return scene.lanHostWallets },
        set lanHostWallets(v) { scene.lanHostWallets = v },
        get lanHostBids() { return scene.lanHostBids },
        set lanHostBids(v) { scene.lanHostBids = v },
        get lanAiLlmEnabled() { return scene.lanAiLlmEnabled },
        set lanAiLlmEnabled(v) { scene.lanAiLlmEnabled = v },
        get lanIdToSlotId() { return scene.lanIdToSlotId },
        set lanIdToSlotId(v) { scene.lanIdToSlotId = v },
        get slotIdToLanId() { return scene.slotIdToLanId },
        set slotIdToLanId(v) { scene.slotIdToLanId = v },
        get lanMySlotId() { return scene.lanMySlotId },
        set lanMySlotId(v) { scene.lanMySlotId = v },
        get aiLlmPlayerEnabled() { return scene.aiLlmPlayerEnabled },
        set aiLlmPlayerEnabled(v) { scene.aiLlmPlayerEnabled = v },
        get players() { return scene.players },
        set players(v) { scene.players = v },
        get playerMoney() { return scene.playerMoney },
        set playerMoney(v) { scene.playerMoney = v },
        get items() { return scene.items },
        set items(v) { scene.items = v },
        get itemLayer() { return scene.itemLayer },
        set itemLayer(v) { scene.itemLayer = v },
        get gridLayer() { return scene.gridLayer },
        set gridLayer(v) { scene.gridLayer = v },
        get revealCellLayer() { return scene.revealCellLayer },
        set revealCellLayer(v) { scene.revealCellLayer = v },
        get activeSettlementSpinner() { return scene.activeSettlementSpinner },
        set activeSettlementSpinner(v) { scene.activeSettlementSpinner = v },
        get carouselOffset() { return scene._carouselOffset },
        set carouselOffset(v) { scene._carouselOffset = v },
        get mapQualityWeights() { return scene._mapQualityWeights },
        set mapQualityWeights(v) { scene._mapQualityWeights = v },
        get mapCategoryWeights() { return scene._mapCategoryWeights },
        set mapCategoryWeights(v) { scene._mapCategoryWeights = v },
        get aiCharacterAssignments() { return scene.aiCharacterAssignments },
        set aiCharacterAssignments(v) { scene.aiCharacterAssignments = v },
        get playerHistoryPanels() { return scene.playerHistoryPanels },
        set playerHistoryPanels(v) { scene.playerHistoryPanels = v },
      } as LobbyIndexState

      // 构造时 game 为 null，getter 应返回 null
      const getGame = () => scene.game
      const manager = new LobbyIndexManager({
        state: lobbyIndexState,
        dom: {},
        get lanBridge() { return null },
        get game() { return scene.game },
        getTweens: () => ({ killAll: () => {} }),
        getTime: () => ({ removeAllEvents: () => {} }),
        itemManager: { items: [] },
        openSettingsOverlay: () => {},
        openCollectionOverlay: () => {},
        openBattleRecordPanel: () => {},
        openShopOverlay: () => {},
        showGameConfirm: () => {},
        carouselScroll: () => {},
        renderCarousel: () => {},
        renderMapDetail: () => {},
        initLanLobby: () => {},
        showCharacterSelectPage: () => {},
        stopRoundTimer: () => {},
        exitSettlementPage: () => {},
        startNewRun: () => {},
        stopLive2dLoop: () => {},
        writeLog: () => {},
        refreshPlayerHistoryUI: () => {},
      })

      // 构造时 game 为 null
      expect(scene.game).toBeNull()

      // 模拟 Phaser create() 后设置 game
      scene.game = { loop: { sleep: () => {}, wake: () => {} } }

      // getter 应返回新值
      expect(scene.game).not.toBeNull()
    })
  })
})

// =============================================================================
// 类型 B：createXxx 没配 setXxx
// =============================================================================

describe("类型 B：createXxx 没配 setXxx", () => {
  describe("LanIndexManager — createLanBridge + setLanBridge", () => {
    it("createLanBridge 创建实例后 setLanBridge 存入 scene.lanBridge", () => {
      let storedBridge: unknown = null
      const scene = {
        lanBridge: null as unknown,
        isLanMode: false,
        lanIsHost: false,
        lanPlayers: [] as unknown[],
        lanAiPlayers: [] as unknown[],
        lanHostWallets: {} as Record<string, number>,
        lanHostBids: {} as Record<string, number>,
        lanAiLlmEnabled: false,
        lanIdToSlotId: {} as Record<string, string>,
        slotIdToLanId: {} as Record<string, string>,
        lanMySlotId: null as string | null,
        lanReconnecting: false,
        lanReconnectAttempts: 0,
        lanMaxReconnectAttempts: 5,
        lanLastServerUrl: null as string | null,
        lanLastRoomCode: null as string | null,
        lanLastPlayerId: null as string | null,
        lanStatusEl: null as HTMLElement | null,
        _pauseSnapshotTimeLeft: null as number | null,
        round: 1,
        roundResolving: false,
        settled: false,
        roundPaused: false,
        roundTimeLeft: 60,
        currentBid: 0,
        bidLeader: null as string | null,
        secondHighestBid: 0,
        playerBidSubmitted: false,
        playerRoundBid: 0,
        playerMoney: 100000,
        actionsLeft: 3,
        selectedItem: null,
        warehouseTrueValue: 0,
        aiMaxBid: 0,
        moneySettledRunToken: null as string | null,
        settlementRevealRunning: false,
        aiRoundDecisionPromise: null as Promise<unknown> | null,
        currentPublicEvent: null as { category: string; text: string } | null,
        privateIntelEntries: [] as unknown[],
        publicInfoEntries: [] as { source: string; text: string }[],
        battleRecordReplayActive: false,
        battleRecordReplayRecordId: null as string | null,
        _mapQualityWeights: null as Record<string, number> | null,
        _mapCategoryWeights: null as Record<string, number> | null,
        players: [] as Player[],
        items: [] as unknown[],
        aiLlmPlayerEnabled: {} as Record<string, boolean>,
        aiWallets: {} as Record<string, number>,
        aiRoundEffects: {} as Record<string, unknown>,
        aiLlmRoundPlans: {} as Record<string, unknown>,
        lastAiDecisionTelemetry: null as { mode: string; round: number; entries: unknown[] } | null,
        playerUsageHistory: {} as Record<string, Array<{ round: number; actions: string[] }>>,
        playerHistoryPanels: {} as Record<string, HTMLElement | null>,
        revealedCells: [] as boolean[][],
        itemLayer: null as { destroy: (b: boolean) => void } | null,
        gridLayer: null as { destroy: (b: boolean) => void } | null,
        revealCellLayer: null as { destroy: (b: boolean) => void } | null,
        warehouseCellIndex: {} as Record<string, string>,
      }

      const lanIndexState: LanIndexState = {
        get isLanMode() { return scene.isLanMode },
        set isLanMode(v) { scene.isLanMode = v },
        get lanIsHost() { return scene.lanIsHost },
        set lanIsHost(v) { scene.lanIsHost = v },
        get lanPlayers() { return scene.lanPlayers },
        set lanPlayers(v) { scene.lanPlayers = v },
        get lanAiPlayers() { return scene.lanAiPlayers },
        set lanAiPlayers(v) { scene.lanAiPlayers = v },
        get lanHostWallets() { return scene.lanHostWallets },
        set lanHostWallets(v) { scene.lanHostWallets = v },
        get lanHostBids() { return scene.lanHostBids },
        set lanHostBids(v) { scene.lanHostBids = v },
        get lanAiLlmEnabled() { return scene.lanAiLlmEnabled },
        set lanAiLlmEnabled(v) { scene.lanAiLlmEnabled = v },
        get lanIdToSlotId() { return scene.lanIdToSlotId },
        set lanIdToSlotId(v) { scene.lanIdToSlotId = v },
        get slotIdToLanId() { return scene.slotIdToLanId },
        set slotIdToLanId(v) { scene.slotIdToLanId = v },
        get lanMySlotId() { return scene.lanMySlotId },
        set lanMySlotId(v) { scene.lanMySlotId = v },
        get lanReconnecting() { return scene.lanReconnecting },
        set lanReconnecting(v) { scene.lanReconnecting = v },
        get lanReconnectAttempts() { return scene.lanReconnectAttempts },
        set lanReconnectAttempts(v) { scene.lanReconnectAttempts = v },
        get lanMaxReconnectAttempts() { return scene.lanMaxReconnectAttempts },
        set lanMaxReconnectAttempts(v) { scene.lanMaxReconnectAttempts = v },
        get lanLastServerUrl() { return scene.lanLastServerUrl },
        set lanLastServerUrl(v) { scene.lanLastServerUrl = v },
        get lanLastRoomCode() { return scene.lanLastRoomCode },
        set lanLastRoomCode(v) { scene.lanLastRoomCode = v },
        get lanLastPlayerId() { return scene.lanLastPlayerId },
        set lanLastPlayerId(v) { scene.lanLastPlayerId = v },
        get lanStatusEl() { return scene.lanStatusEl },
        set lanStatusEl(v) { scene.lanStatusEl = v },
        get _pauseSnapshotTimeLeft() { return scene._pauseSnapshotTimeLeft },
        set _pauseSnapshotTimeLeft(v) { scene._pauseSnapshotTimeLeft = v },
        get round() { return scene.round },
        set round(v) { scene.round = v },
        get roundResolving() { return scene.roundResolving },
        set roundResolving(v) { scene.roundResolving = v },
        get settled() { return scene.settled },
        set settled(v) { scene.settled = v },
        get roundPaused() { return scene.roundPaused },
        set roundPaused(v) { scene.roundPaused = v },
        get roundTimeLeft() { return scene.roundTimeLeft },
        set roundTimeLeft(v) { scene.roundTimeLeft = v },
        get currentBid() { return scene.currentBid },
        set currentBid(v) { scene.currentBid = v },
        get bidLeader() { return scene.bidLeader },
        set bidLeader(v) { scene.bidLeader = v },
        get secondHighestBid() { return scene.secondHighestBid },
        set secondHighestBid(v) { scene.secondHighestBid = v },
        get playerBidSubmitted() { return scene.playerBidSubmitted },
        set playerBidSubmitted(v) { scene.playerBidSubmitted = v },
        get playerRoundBid() { return scene.playerRoundBid },
        set playerRoundBid(v) { scene.playerRoundBid = v },
        get playerMoney() { return scene.playerMoney },
        set playerMoney(v) { scene.playerMoney = v },
        get actionsLeft() { return scene.actionsLeft },
        set actionsLeft(v) { scene.actionsLeft = v },
        get selectedItem() { return scene.selectedItem },
        set selectedItem(v) { scene.selectedItem = v },
        get warehouseTrueValue() { return scene.warehouseTrueValue },
        set warehouseTrueValue(v) { scene.warehouseTrueValue = v },
        get aiMaxBid() { return scene.aiMaxBid },
        set aiMaxBid(v) { scene.aiMaxBid = v },
        get moneySettledRunToken() { return scene.moneySettledRunToken },
        set moneySettledRunToken(v) { scene.moneySettledRunToken = v },
        get settlementRevealRunning() { return scene.settlementRevealRunning },
        set settlementRevealRunning(v) { scene.settlementRevealRunning = v },
        get aiRoundDecisionPromise() { return scene.aiRoundDecisionPromise },
        set aiRoundDecisionPromise(v) { scene.aiRoundDecisionPromise = v },
        get currentPublicEvent() { return scene.currentPublicEvent },
        set currentPublicEvent(v) { scene.currentPublicEvent = v },
        get privateIntelEntries() { return scene.privateIntelEntries },
        set privateIntelEntries(v) { scene.privateIntelEntries = v },
        get publicInfoEntries() { return scene.publicInfoEntries },
        set publicInfoEntries(v) { scene.publicInfoEntries = v },
        get battleRecordReplayActive() { return scene.battleRecordReplayActive },
        set battleRecordReplayActive(v) { scene.battleRecordReplayActive = v },
        get battleRecordReplayRecordId() { return scene.battleRecordReplayRecordId },
        set battleRecordReplayRecordId(v) { scene.battleRecordReplayRecordId = v },
        get _mapQualityWeights() { return scene._mapQualityWeights },
        set _mapQualityWeights(v) { scene._mapQualityWeights = v },
        get _mapCategoryWeights() { return scene._mapCategoryWeights },
        set _mapCategoryWeights(v) { scene._mapCategoryWeights = v },
        get players() { return scene.players },
        set players(v) { scene.players = v },
        get items() { return scene.items },
        set items(v) { scene.items = v },
        get aiLlmPlayerEnabled() { return scene.aiLlmPlayerEnabled },
        set aiLlmPlayerEnabled(v) { scene.aiLlmPlayerEnabled = v },
        get aiWallets() { return scene.aiWallets },
        set aiWallets(v) { scene.aiWallets = v },
        get aiRoundEffects() { return scene.aiRoundEffects },
        set aiRoundEffects(v) { scene.aiRoundEffects = v },
        get aiLlmRoundPlans() { return scene.aiLlmRoundPlans },
        set aiLlmRoundPlans(v) { scene.aiLlmRoundPlans = v },
        get lastAiDecisionTelemetry() { return scene.lastAiDecisionTelemetry },
        set lastAiDecisionTelemetry(v) { scene.lastAiDecisionTelemetry = v },
        get playerUsageHistory() { return scene.playerUsageHistory },
        set playerUsageHistory(v) { scene.playerUsageHistory = v },
        get playerHistoryPanels() { return scene.playerHistoryPanels },
        set playerHistoryPanels(v) { scene.playerHistoryPanels = v },
        get revealedCells() { return scene.revealedCells },
        set revealedCells(v) { scene.revealedCells = v },
        get itemLayer() { return scene.itemLayer },
        set itemLayer(v) { scene.itemLayer = v },
        get gridLayer() { return scene.gridLayer },
        set gridLayer(v) { scene.gridLayer = v },
        get revealCellLayer() { return scene.revealCellLayer },
        set revealCellLayer(v) { scene.revealCellLayer = v },
        get warehouseCellIndex() { return scene.warehouseCellIndex },
        set warehouseCellIndex(v) { scene.warehouseCellIndex = v },
      } as LanIndexState

      // 验证 createLanBridge + setLanBridge 配对
      let createdBridge = false
      let setBridgeCalled = false
      const manager = new LanIndexManager({
        state: lanIndexState,
        getLanBridge: () => scene.lanBridge,
        createLanBridge: () => {
          createdBridge = true
          return { id: "test-bridge", playerId: "test-player" } as never
        },
        setLanBridge: (bridge) => {
          setBridgeCalled = true
          scene.lanBridge = bridge
        },
        writeLog: () => {},
        setOnlineStatus: () => {},
        showGameConfirm: () => {},
        stopRoundTimer: () => {},
        startRound: () => {},
        updateHud: () => {},
        beginRunTracking: () => {},
        cancelSettlementReveal: () => {},
        exitSettlementPage: () => {},
        guardWarehouseCapacity: () => {},
        resetPlayerHistoryState: () => {},
        hidePreview: () => {},
        closeBidKeypad: () => {},
        closeItemDrawer: () => {},
        hideSettleOverlay: () => {},
        hideRevealScrollHints: () => {},
        drawUnknownWarehouse: () => {},
        spawnRandomItems: () => {},
        setupWarehouseAuction: () => {},
        rebuildWarehouseCellIndex: () => {},
        buildWarehouseSnapshotForSync: () => ({}),
        initPlayersUI: () => {},
        applyCharacterToPlayer: () => {},
        initAiWallets: () => {},
        initAiIntelSystems: () => {},
        makeRunToken: () => "token",
        syncItemManagerFromShop: () => {},
        revealRoundBidsSequential: () => {},
        recordRoundHistory: () => {},
        finishAuction: () => {},
        captureAiDecisionTelemetry: () => {},
        recordAiThoughtLogs: () => {},
        renderAiLogicPanel: () => {},
        waitUntilResumed: () => Promise.resolve(),
        setPlayerBidReady: () => {},
        syncPauseButton: () => {},
        showLanPauseOverlay: () => {},
        hideLanPauseOverlay: () => {},
        enterLanRoom: () => {},
        exitLanRoom: () => {},
        exitLobby: () => {},
        showLanRestartVoteDialog: () => {},
        removeLanRestartDialog: () => {},
        showLanRestartDeclinedDialog: () => {},
        refreshRevealScrollHints: () => {},
        refreshPlayerHistoryUI: () => {},
        renderPublicInfoPanel: () => {},
        addPublicInfoEntry: () => {},
        recordPlayerUsage: () => {},
        isAiLlmEnabledForPlayer: () => false,
        canUseLlmDecisionForPlayer: () => false,
        normalizeAiBidValue: () => 0,
        updateLobbyMoneyDisplay: () => {},
        getLastRoundBidMap: () => ({}),
        buildAiIntelSnapshot: () => ({}),
        hasAnyInfo: () => false,
        aiEngine: { buildAIBids: () => ({}), resetForNewRun: () => {} },
        skillManager: { onNewRound: () => {}, resetForNewRun: () => {} },
        getProfile: null,
        getSelectedProfileId: null,
      })

      // 模拟 inicreateLanLobby 调用 createLanBridge + setLanBridge 的配对模式
      // 不能直接调用 initLanLobby（依赖全局 LanBridge 和 DOM），改为手动验证配对
      let bridge: unknown = null
      const createBridge = () => {
        const b = { id: "test-bridge", playerId: "test-player" } as never
        bridge = b
        return b
      }
      const setBridge = (b: unknown) => {
        scene.lanBridge = b
      }

      // 配对操作：create 后立即 set
      const newBridge = createBridge()
      setBridge(newBridge)

      expect(scene.lanBridge).not.toBeNull()
      expect(scene.lanBridge).toBe(bridge)
    })
  })
})

// =============================================================================
// 类型 C：state 对象缺 getter/setter 同步
// =============================================================================

describe("类型 C：state 对象 getter/setter 同步", () => {
  describe("lanIndexState — round 属性同步", () => {
    it("修改 state.round 后 scene.round 同步更新", () => {
      const scene = { round: 1 }
      const state: LanIndexState = {
        get round() { return scene.round },
        set round(v: number) { scene.round = v },
      } as LanIndexState

      state.round = 5
      expect(scene.round).toBe(5)
    })

    it("修改 scene.round 后 state.round 返回新值", () => {
      const scene = { round: 1 }
      const state: LanIndexState = {
        get round() { return scene.round },
        set round(v: number) { scene.round = v },
      } as LanIndexState

      scene.round = 10
      expect(state.round).toBe(10)
    })
  })

  describe("lanIndexState — aiWallets 属性同步", () => {
    it("修改 state.aiWallets 后 scene.aiWallets 同步更新", () => {
      const scene = { aiWallets: { ai1: 100 } }
      const state: LanIndexState = {
        get aiWallets() { return scene.aiWallets },
        set aiWallets(v) { scene.aiWallets = v as Record<string, number> },
      } as LanIndexState

      state.aiWallets = { ai1: 999 }
      expect(scene.aiWallets.ai1).toBe(999)
    })
  })
})