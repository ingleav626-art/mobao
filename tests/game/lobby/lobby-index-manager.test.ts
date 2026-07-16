import { describe, it, expect, beforeEach, vi } from "vitest"
import { LobbyIndexManager, type LobbyIndexManagerDeps, type LobbyIndexState } from "../../../scripts/game/lobby/lobby-index-manager"
import { Deps } from "../../../scripts/game/core/deps"
import { reset as resetAppState } from "../../../scripts/game/core/app-state"
import { GAME_SETTINGS } from "../../../scripts/game/core/settings"

// Mock 带副作用的模块
vi.mock("../../../scripts/audio/audio-manager", () => ({
  AudioManager: {
    stopBgm: vi.fn(),
    playBgm: vi.fn(),
  },
}))

vi.mock("../../../scripts/game/animations", () => ({
  MobaoAnimations: {
    staggerEnter: vi.fn(),
  },
}))

vi.mock("../../../scripts/game/bridge/shop", () => ({
  MobaoShopBridge: {
    getPlayerMoney: vi.fn(() => 10000),
    getFullInventory: vi.fn(() => ({})),
    getItemStorageKey: vi.fn((id: string) => id),
  },
}))

vi.mock("../../../scripts/game/shop/index", () => ({
  MobaoShopPage: {
    init: vi.fn(),
    updateMoneyDisplay: vi.fn(),
    renderAllItems: vi.fn(),
    renderInventory: vi.fn(),
  },
}))

/** 创建默认可变状态 */
function makeState(overrides: Partial<LobbyIndexState> = {}): LobbyIndexState {
  return {
    isLanMode: false,
    lanIsHost: false,
    lanPlayers: [],
    lanAiPlayers: [],
    lanHostWallets: {},
    lanHostBids: {},
    lanAiLlmEnabled: false,
    lanIdToSlotId: {},
    slotIdToLanId: {},
    lanMySlotId: null,
    aiLlmPlayerEnabled: {},
    players: [],
    playerMoney: 10000,
    items: [],
    itemLayer: null,
    gridLayer: null,
    revealCellLayer: null,
    activeSettlementSpinner: null,
    carouselOffset: 0,
    mapQualityWeights: null,
    mapCategoryWeights: null,
    aiCharacterAssignments: null,
    playerHistoryPanels: {},
    ...overrides,
  }
}

/** 创建 mock 依赖 */
function makeDeps(overrides: Partial<LobbyIndexManagerDeps> = {}): LobbyIndexManagerDeps {
  const state = overrides.state || makeState()
  const tweensMock = { killAll: vi.fn() }
  const timeMock = { removeAllEvents: vi.fn() }
  const stateRef = state
  return {
    state,
    dom: {},
    lanBridge: null,
    game: null,
    getTweens: () => tweensMock,
    getTime: () => timeMock,
    itemManager: { items: [] },
    openSettingsOverlay: vi.fn(),
    openCollectionOverlay: vi.fn(),
    openBattleRecordPanel: vi.fn(),
    openShopOverlay: vi.fn(),
    showGameConfirm: vi.fn(),
    carouselScroll: vi.fn(),
    renderCarousel: vi.fn(),
    renderMapDetail: vi.fn(),
    initLanLobby: vi.fn(),
    stopRoundTimer: vi.fn(),
    exitSettlementPage: vi.fn(),
    startNewRun: vi.fn(),
    stopLive2dLoop: vi.fn(),
    writeLog: vi.fn(),
    refreshPlayerHistoryUI: vi.fn(),
    getState: () => ({
      resetLanState: () => {
        stateRef.isLanMode = false
        stateRef.lanIsHost = false
        stateRef.lanPlayers = []
        stateRef.lanAiPlayers = []
        stateRef.lanHostWallets = {}
        stateRef.lanHostBids = {}
        stateRef.lanAiLlmEnabled = false
        stateRef.lanIdToSlotId = {}
        stateRef.slotIdToLanId = {}
        stateRef.lanMySlotId = null
      },
      resetLanGameState: () => {
        stateRef.lanHostWallets = {}
        stateRef.lanHostBids = {}
      }
    }),
    ...overrides,
    state,
  }
}

/** 设置大厅主要页面 DOM */
function setupLobbyDom() {
  document.body.innerHTML = `
    <div id="lobbyMain"></div>
    <div id="lobbySoloSetup" class="hidden"></div>
    <div id="lobbyOnlinePlaceholder" class="hidden"></div>
    <div id="lobbyCharacterSelect" class="hidden"></div>
    <div id="lobbyPage" class="hidden"></div>
    <div id="gameArea" class="hidden"></div>
    <div id="lobbyOnlineConnect"></div>
    <div id="lobbyOnlineRoom" class="hidden"></div>
    <div id="lobbyOnlineCreatePanel" class="hidden"></div>
    <div id="lobbyOnlineJoinPanel" class="hidden"></div>
    <div id="lobbyMainMoney"></div>
    <div id="lobbySoloMoney"></div>
    <div id="lobbyOnlineMoney"></div>
    <div id="lobbyOnlineMoneyOuter"></div>
    <video id="overlayLive2dVideoA"></video>
    <video id="overlayLive2dVideoB"></video>
  `
}

/** 设置玩家卡片 DOM */
function setupPlayerCardDom() {
  const ids = ["p1", "p2", "p3", "p4"]
  ids.forEach((id) => {
    const card = document.createElement("div")
    card.id = `playerCard-${id}`
    card.classList.add("player-card-hidden")
    const meta = document.createElement("div")
    meta.className = "meta"
    card.appendChild(meta)
    document.body.appendChild(card)

    const name = document.createElement("div")
    name.id = `name-${id}`
    document.body.appendChild(name)

    const avatar = document.createElement("div")
    avatar.id = `avatar-${id}`
    document.body.appendChild(avatar)
  })

  const leftSide = document.createElement("div")
  leftSide.id = "leftPlayerSide"
  document.body.appendChild(leftSide)

  const rightSide = document.createElement("div")
  rightSide.id = "rightPlayerSide"
  document.body.appendChild(rightSide)

  const personalPanel = document.createElement("div")
  personalPanel.id = "personalPanel"
  leftSide.appendChild(personalPanel)

  const publicPanel = document.createElement("div")
  publicPanel.id = "publicPanel"
  rightSide.appendChild(publicPanel)
}

/** 设置大厅按钮 DOM */
function setupLobbyButtons() {
  const btnIds = [
    "lobbySoloBtn",
    "lobbyOnlineBtn",
    "lobbySettingsBtn",
    "lobbyCollectionBtn",
    "lobbyBattleRecordBtn",
    "lobbyShopBtn",
    "lobbySoloBackBtn",
    "lobbySoloShopBtn",
    "lobbyOnlineBackBtn",
    "lobbyStartGameBtn",
    "carouselLeftBtn",
    "carouselRightBtn",
  ]
  btnIds.forEach((id) => {
    const btn = document.createElement("button")
    btn.id = id
    document.body.appendChild(btn)
  })
}

function makePlayers(): Player[] {
  return [
    { id: "p1", name: "左上AI", avatar: "A1", isHuman: false, isAI: true, isSelf: false },
    { id: "p2", name: "玩家", avatar: "你", isHuman: true, isAI: false, isSelf: true },
    { id: "p3", name: "右上AI", avatar: "A2", isHuman: false, isAI: true, isSelf: false },
    { id: "p4", name: "右下AI", avatar: "A3", isHuman: false, isAI: true, isSelf: false },
  ]
}

type Player = import("../../../types/game").Player

describe("LobbyIndexManager", () => {
  let originalLlmBridge: unknown

  beforeEach(() => {
    localStorage.clear()
    resetAppState()
    document.body.innerHTML = ""
    originalLlmBridge = Deps.LLM_BRIDGE
    Deps.LLM_BRIDGE = null
  })

  afterEach(() => {
    Deps.LLM_BRIDGE = originalLlmBridge as never
  })

  // ==================== 页面导航 ====================
  describe("页面导航", () => {
    describe("showLobbyMain", () => {
      it("隐藏子页面并显示主页", () => {
        setupLobbyDom()
        const deps = makeDeps({ state: makeState({ isLanMode: true, lanIsHost: true }) })
        const manager = new LobbyIndexManager(deps)

        manager.showLobbyMain()

        expect(document.getElementById("lobbySoloSetup")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyOnlinePlaceholder")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyCharacterSelect")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyMain")!.classList.contains("hidden")).toBe(false)
      })

      it("重置 isLanMode 和 lanIsHost", () => {
        setupLobbyDom()
        const deps = makeDeps({ state: makeState({ isLanMode: true, lanIsHost: true }) })
        const manager = new LobbyIndexManager(deps)

        manager.showLobbyMain()

        expect(deps.state.isLanMode).toBe(false)
        expect(deps.state.lanIsHost).toBe(false)
      })

      it("skipAnimation=true 时不添加动画类", () => {
        setupLobbyDom()
        const manager = new LobbyIndexManager(makeDeps())

        manager.showLobbyMain(true)

        expect(document.getElementById("lobbyMain")!.classList.contains("lobby-subpage-entering")).toBe(false)
      })

      it("skipAnimation=false 时添加动画类", () => {
        setupLobbyDom()
        const manager = new LobbyIndexManager(makeDeps())

        manager.showLobbyMain(false)

        expect(document.getElementById("lobbyMain")!.classList.contains("lobby-subpage-entering")).toBe(true)
      })
    })

    describe("showLobbySubPage", () => {
      it("soloSetup 页面隐藏主页并显示单机设置", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.showLobbySubPage("soloSetup")

        expect(document.getElementById("lobbyMain")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbySoloSetup")!.classList.contains("hidden")).toBe(false)
        expect(deps.renderCarousel).toHaveBeenCalledOnce()
        expect(deps.renderMapDetail).toHaveBeenCalledOnce()
      })

      it("onlinePlaceholder 页面隐藏主页并显示联机占位", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.showLobbySubPage("onlinePlaceholder")

        expect(document.getElementById("lobbyMain")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyOnlinePlaceholder")!.classList.contains("hidden")).toBe(false)
      })

      it("onlinePlaceholder 页面显示玩家金额", () => {
        setupLobbyDom()
        const deps = makeDeps({ state: makeState({ playerMoney: 99999 }) })
        const manager = new LobbyIndexManager(deps)

        manager.showLobbySubPage("onlinePlaceholder")

        const onlineMoney = document.getElementById("lobbyOnlineMoney")!
        expect(onlineMoney.innerHTML).toContain("99,999")
      })

      it("characterSelect 页面调用 showCharacterSelectPageWithMap", () => {
        setupLobbyDom()
        const showCharacterSelectPage = vi.fn()
        const deps = makeDeps({ showCharacterSelectPage })
        const manager = new LobbyIndexManager(deps)

        manager.showLobbySubPage("characterSelect")

        expect(showCharacterSelectPage).toHaveBeenCalledOnce()
      })

      it("lanBridge 有 roomCode 且房间面板可见时保持房间面板", () => {
        setupLobbyDom()
        const roomPanel = document.getElementById("lobbyOnlineRoom")!
        roomPanel.classList.remove("hidden")
        const deps = makeDeps({
          lanBridge: { leaveRoom: vi.fn(), disconnect: vi.fn(), roomCode: "ABC123", send: vi.fn() },
        })
        const manager = new LobbyIndexManager(deps)

        manager.showLobbySubPage("onlinePlaceholder")

        expect(roomPanel.classList.contains("hidden")).toBe(false)
      })
    })

    describe("goToCharacterSelect", () => {
      it("调用 showLobbySubPage('characterSelect')", () => {
        setupLobbyDom()
        const showCharacterSelectPage = vi.fn()
        const deps = makeDeps({ showCharacterSelectPage })
        const manager = new LobbyIndexManager(deps)

        manager.goToCharacterSelect()

        expect(showCharacterSelectPage).toHaveBeenCalledOnce()
      })
    })
  })

  // ==================== 入口切换 ====================
  describe("入口切换", () => {
    describe("enterLobby", () => {
      it("重置所有 LAN 状态", () => {
        setupLobbyDom()
        const deps = makeDeps({
          state: makeState({
            isLanMode: true,
            lanIsHost: true,
            lanPlayers: ["a"],
            lanAiPlayers: ["b"],
            lanHostWallets: { x: 1 },
            lanHostBids: { y: 2 },
            lanAiLlmEnabled: true,
            lanIdToSlotId: { a: "p1" },
            slotIdToLanId: { p1: "a" },
            lanMySlotId: "p1",
          }),
        })
        const manager = new LobbyIndexManager(deps)

        manager.enterLobby()

        expect(deps.state.isLanMode).toBe(false)
        expect(deps.state.lanIsHost).toBe(false)
        expect(deps.state.lanPlayers).toEqual([])
        expect(deps.state.lanAiPlayers).toEqual([])
        expect(deps.state.lanHostWallets).toEqual({})
        expect(deps.state.lanHostBids).toEqual({})
        expect(deps.state.lanAiLlmEnabled).toBe(false)
        expect(deps.state.lanIdToSlotId).toEqual({})
        expect(deps.state.slotIdToLanId).toEqual({})
        expect(deps.state.lanMySlotId).toBeNull()
      })

      it("初始化 4 个默认玩家", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLobby()

        expect(deps.state.players).toHaveLength(4)
        expect(deps.state.players[0].id).toBe("p1")
        expect(deps.state.players[1].id).toBe("p2")
        expect(deps.state.players[1].isHuman).toBe(true)
        expect(deps.state.players[1].isSelf).toBe(true)
      })

      it("调用 initPlayersUI 和 showLobbyMain(true)", () => {
        setupLobbyDom()
        setupPlayerCardDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLobby()

        // initPlayersUI 效果：调用了 refreshPlayerHistoryUI
        expect(deps.refreshPlayerHistoryUI).toHaveBeenCalledOnce()
        // showLobbyMain(true) 效果：重置状态，不添加动画类
        expect(deps.state.isLanMode).toBe(false)
        expect(deps.state.lanIsHost).toBe(false)
        expect(document.getElementById("lobbyMain")!.classList.contains("lobby-subpage-entering")).toBe(false)
      })

      it("显示大厅页面并隐藏游戏区域", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLobby()

        expect(document.getElementById("lobbyPage")!.classList.contains("hidden")).toBe(false)
        expect(document.getElementById("gameArea")!.classList.contains("hidden")).toBe(true)
      })

      it("显示联机连接面板并隐藏房间面板", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLobby()

        expect(document.getElementById("lobbyOnlineConnect")!.classList.contains("hidden")).toBe(false)
        expect(document.getElementById("lobbyOnlineRoom")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyOnlineCreatePanel")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("lobbyOnlineJoinPanel")!.classList.contains("hidden")).toBe(true)
      })
    })

    describe("enterLanRoom", () => {
      it("调用 cleanupGameScene 和 exitSettlementPage", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLanRoom()

        // cleanupGameScene 效果：调用了 stopRoundTimer
        expect(deps.stopRoundTimer).toHaveBeenCalledOnce()
        expect(deps.exitSettlementPage).toHaveBeenCalledOnce()
      })

      it("显示房间面板并隐藏连接面板", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.enterLanRoom()

        expect(document.getElementById("lobbyOnlineRoom")!.classList.contains("hidden")).toBe(false)
        expect(document.getElementById("lobbyOnlineConnect")!.classList.contains("hidden")).toBe(true)
      })

      it("isLanMode 且 lanIsHost 且 lanBridge 存在时发送 room:return", () => {
        setupLobbyDom()
        const sendFn = vi.fn(() => true)
        const deps = makeDeps({
          state: makeState({ isLanMode: true, lanIsHost: true }),
          lanBridge: { leaveRoom: vi.fn(), disconnect: vi.fn(), send: sendFn },
        })
        const manager = new LobbyIndexManager(deps)

        manager.enterLanRoom()

        expect(sendFn).toHaveBeenCalledWith({ type: "room:return" })
      })

      it("发送失败时调用 writeLog", () => {
        setupLobbyDom()
        const sendFn = vi.fn(() => false)
        const deps = makeDeps({
          state: makeState({ isLanMode: true, lanIsHost: true }),
          lanBridge: { leaveRoom: vi.fn(), disconnect: vi.fn(), send: sendFn },
        })
        const manager = new LobbyIndexManager(deps)

        manager.enterLanRoom()

        expect(deps.writeLog).toHaveBeenCalledWith("连接已断开，无法通知客机返回房间")
      })
    })

    describe("exitLobby", () => {
      it("调用 stopLive2dLoop", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.exitLobby()

        expect(deps.stopLive2dLoop).toHaveBeenCalledOnce()
      })

      it("隐藏大厅页面并显示游戏区域", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.exitLobby()

        expect(document.getElementById("lobbyPage")!.classList.contains("hidden")).toBe(true)
        expect(document.getElementById("gameArea")!.classList.contains("hidden")).toBe(false)
      })

      it("调用 game.loop.wake", () => {
        setupLobbyDom()
        const wakeFn = vi.fn()
        const deps = makeDeps({
          game: { loop: { sleep: vi.fn(), wake: wakeFn } },
        })
        const manager = new LobbyIndexManager(deps)

        manager.exitLobby()

        expect(wakeFn).toHaveBeenCalledOnce()
      })
    })
  })

  // ==================== 初始化关键流程 ====================
  describe("初始化关键流程", () => {
    describe("initPlayersUI", () => {
      it("活跃玩家卡片移除 hidden 类，非活跃玩家保留", () => {
        setupPlayerCardDom()
        const players = makePlayers().slice(0, 2) // 只有 p1, p2
        const deps = makeDeps({ state: makeState({ players }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        expect(document.getElementById("playerCard-p1")!.classList.contains("player-card-hidden")).toBe(false)
        expect(document.getElementById("playerCard-p2")!.classList.contains("player-card-hidden")).toBe(false)
        expect(document.getElementById("playerCard-p3")!.classList.contains("player-card-hidden")).toBe(true)
        expect(document.getElementById("playerCard-p4")!.classList.contains("player-card-hidden")).toBe(true)
      })

      it("设置玩家名称", () => {
        setupPlayerCardDom()
        const players = makePlayers()
        const deps = makeDeps({ state: makeState({ players }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        expect(document.getElementById("name-p1")!.textContent).toBe("左上AI")
        expect(document.getElementById("name-p2")!.textContent).toBe("玩家")
      })

      it("为 AI 玩家创建 LLM 开关", () => {
        setupPlayerCardDom()
        const players = makePlayers()
        const deps = makeDeps({ state: makeState({ players }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        const switchEl = document.getElementById("llm-switch-p1") as HTMLInputElement
        expect(switchEl).not.toBeNull()
        expect(switchEl.type).toBe("checkbox")
      })

      it("LLM 开关 change 事件更新 aiLlmPlayerEnabled", () => {
        setupPlayerCardDom()
        const players = makePlayers()
        const deps = makeDeps({ state: makeState({ players }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        const switchEl = document.getElementById("llm-switch-p1") as HTMLInputElement
        switchEl.checked = true
        switchEl.dispatchEvent(new Event("change"))

        expect(deps.state.aiLlmPlayerEnabled["p1"]).toBe(true)
        expect(deps.writeLog).toHaveBeenCalledOnce()
      })

      it("调用 refreshPlayerHistoryUI 和 updatePlayerCharNames", () => {
        setupPlayerCardDom()
        const players = makePlayers()
        const deps = makeDeps({ state: makeState({ players }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        expect(deps.refreshPlayerHistoryUI).toHaveBeenCalledOnce()
        // updatePlayerCharNames 效果：创建了角色名标签
        const p1Avatar = document.getElementById("avatar-p1")
        const p1Wrap = p1Avatar?.parentElement
        expect(p1Wrap?.classList.contains("avatar-wrap")).toBe(true)
        expect(p1Wrap?.querySelector(".avatar-char-name")).not.toBeNull()
      })

      it("isLanMode=true 时 LLM 开关禁用", () => {
        setupPlayerCardDom()
        const players = makePlayers()
        const deps = makeDeps({ state: makeState({ players, isLanMode: true }) })
        const manager = new LobbyIndexManager(deps)

        manager.initPlayersUI()

        const switchEl = document.getElementById("llm-switch-p1") as HTMLInputElement
        expect(switchEl.disabled).toBe(true)
      })
    })

    describe("bindLobbyEvents", () => {
      it("设置 carouselOffset 为 0 并调用 renderCarousel/initLanLobby", () => {
        setupLobbyButtons()
        const deps = makeDeps({ state: makeState({ carouselOffset: 5 }) })
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()

        expect(deps.state.carouselOffset).toBe(0)
        expect(deps.renderCarousel).toHaveBeenCalledOnce()
        expect(deps.initLanLobby).toHaveBeenCalledOnce()
      })

      it("点击单机按钮调用 showLobbySubPage('soloSetup')", () => {
        setupLobbyDom()
        setupLobbyButtons()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()
        document.getElementById("lobbySoloBtn")!.click()

        // showLobbySubPage("soloSetup") 效果：渲染地图详情（renderCarousel 在 bindLobbyEvents 中也调用过）
        expect(deps.renderMapDetail).toHaveBeenCalledOnce()
      })

      it("点击联机按钮调用 showLobbySubPage('onlinePlaceholder')", () => {
        setupLobbyDom()
        setupLobbyButtons()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()
        document.getElementById("lobbyOnlineBtn")!.click()

        // showLobbySubPage("onlinePlaceholder") 效果：显示联机占位页面
        expect(document.getElementById("lobbyOnlinePlaceholder")!.classList.contains("hidden")).toBe(false)
      })

      it("点击设置按钮调用 openSettingsOverlay", () => {
        setupLobbyButtons()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()
        document.getElementById("lobbySettingsBtn")!.click()

        expect(deps.openSettingsOverlay).toHaveBeenCalledOnce()
      })

      it("点击开始游戏按钮调用 goToCharacterSelect", () => {
        setupLobbyButtons()
        const showCharacterSelectPage = vi.fn()
        const deps = makeDeps({ showCharacterSelectPage })
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()
        document.getElementById("lobbyStartGameBtn")!.click()

        // goToCharacterSelect -> showLobbySubPage("characterSelect") -> showCharacterSelectPageWithMap -> deps.showCharacterSelectPage
        expect(showCharacterSelectPage).toHaveBeenCalledOnce()
      })

      it("点击轮播左右按钮调用 carouselScroll", () => {
        setupLobbyButtons()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.bindLobbyEvents()
        document.getElementById("carouselLeftBtn")!.click()
        document.getElementById("carouselRightBtn")!.click()

        expect(deps.carouselScroll).toHaveBeenCalledWith(-1)
        expect(deps.carouselScroll).toHaveBeenCalledWith(1)
      })
    })

    describe("cleanupGameScene", () => {
      it("调用 stopRoundTimer", () => {
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.cleanupGameScene()

        expect(deps.stopRoundTimer).toHaveBeenCalledOnce()
      })

      it("销毁 itemLayer 并置 null", () => {
        const destroyFn = vi.fn()
        const deps = makeDeps({
          state: makeState({ itemLayer: { destroy: destroyFn } }),
        })
        const manager = new LobbyIndexManager(deps)

        manager.cleanupGameScene()

        expect(destroyFn).toHaveBeenCalledOnce()
        expect(deps.state.itemLayer).toBeNull()
      })

      it("调用 tweens.killAll 和 time.removeAllEvents", () => {
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.cleanupGameScene()

        expect(deps.getTweens().killAll).toHaveBeenCalledOnce()
        expect(deps.getTime().removeAllEvents).toHaveBeenCalledOnce()
      })

      it("清空 items 数组", () => {
        const deps = makeDeps({ state: makeState({ items: ["a", "b"] }) })
        const manager = new LobbyIndexManager(deps)

        manager.cleanupGameScene()

        expect(deps.state.items).toEqual([])
      })
    })

    describe("startSoloGame", () => {
      it("调用 applyMapProfile, exitLobby, startNewRun", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.startSoloGame()

        // exitLobby 效果：调用了 stopLive2dLoop
        expect(deps.stopLive2dLoop).toHaveBeenCalledOnce()
        // startNewRun 被调用
        expect(deps.startNewRun).toHaveBeenCalledOnce()
        // applyMapProfile 效果：设置了地图参数
        expect(deps.state.mapQualityWeights).not.toBeNull()
        expect(deps.state.mapCategoryWeights).not.toBeNull()
      })
    })

    describe("isAiLlmEnabledForPlayer", () => {
      it("aiLlmPlayerEnabled 中为 true 时返回 true", () => {
        const deps = makeDeps({ state: makeState({ aiLlmPlayerEnabled: { p1: true, p2: false } }) })
        const manager = new LobbyIndexManager(deps)

        expect(manager.isAiLlmEnabledForPlayer("p1")).toBe(true)
        expect(manager.isAiLlmEnabledForPlayer("p2")).toBe(false)
      })

      it("未知玩家返回 false", () => {
        const deps = makeDeps({ state: makeState({ aiLlmPlayerEnabled: { p1: true } }) })
        const manager = new LobbyIndexManager(deps)

        expect(manager.isAiLlmEnabledForPlayer("p9")).toBe(false)
      })
    })

    describe("updateLobbyMoneyDisplay", () => {
      it("更新主页和单机页金额显示", () => {
        setupLobbyDom()
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)

        manager.updateLobbyMoneyDisplay()

        expect(document.getElementById("lobbyMainMoney")!.innerHTML).toContain("10,000")
        expect(document.getElementById("lobbySoloMoney")!.innerHTML).toContain("10,000")
      })
    })

    describe("applyMapProfile", () => {
      it("将地图参数写入 GAME_SETTINGS", () => {
        const deps = makeDeps()
        const manager = new LobbyIndexManager(deps)
        const originalMaxRounds = GAME_SETTINGS.maxRounds

        manager.applyMapProfile()

        // 默认地图有 maxRounds 和 directTakeRatio
        expect(GAME_SETTINGS.maxRounds).toBeGreaterThan(0)
        expect(deps.state.mapQualityWeights).not.toBeNull()
        expect(deps.state.mapCategoryWeights).not.toBeNull()

        // 恢复
        GAME_SETTINGS.maxRounds = originalMaxRounds
      })
    })
  })
})
