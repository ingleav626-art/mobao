import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest"
import { JSDOM } from "jsdom"
import { WarehouseManager, type WarehouseManagerDeps, type WarehouseManagerState } from "../../../scripts/game/warehouse/warehouse-manager"
import type { Artifact } from "../../../types/game"
import { GRID_COLS, GRID_ROWS, CELL_SIZE, MARGIN, MAX_WAREHOUSE_CELLS } from "../../../scripts/game/core/constants"

// ─── Phaser 全局 mock ───

beforeAll(() => {
  ;(globalThis as any).Phaser = {
    Math: {
      FloatBetween: vi.fn(() => 0.5),
      Between: vi.fn(() => 10),
    },
    BlendModes: { ADD: "ADD" },
    Textures: { FilterMode: { LINEAR: 1 } },
  }
})

// ─── mock 工厂 ───

function makeMockGraphics() {
  return {
    lineStyle: vi.fn(),
    lineBetween: vi.fn(),
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    setAlpha: vi.fn(),
    setBlendMode: vi.fn(),
    destroy: vi.fn(),
  }
}

function makeMockRect() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setStrokeStyle: vi.fn().mockReturnThis(),
    setFillStyle: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setDisplaySize: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    scaleX: 1,
    scaleY: 1,
    destroy: vi.fn(),
  }
}

function makeMockContainer() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    destroy: vi.fn(),
  }
}

function makeMockZone() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    on: vi.fn(),
  }
}

function makeMockImage() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDisplaySize: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    scaleX: 1,
    scaleY: 1,
  }
}

function makeMockTween() {
  return { stop: vi.fn() }
}

function makeMockDeps(overrides: Partial<WarehouseManagerDeps> = {}): WarehouseManagerDeps {
  const graphicsList: any[] = []
  const graphicsFactory = vi.fn(() => {
    const g = makeMockGraphics()
    graphicsList.push(g)
    return g
  })

  const mockTimeClock = {
    delayedCall: vi.fn(),
  } as any
  const mockTweenManager = {
    add: vi.fn(() => makeMockTween()),
  } as any

  const mockInput = {
    setDefaultCursor: vi.fn(),
  } as any

  const deps: WarehouseManagerDeps = {
    getTextures: () => ({
      exists: vi.fn(() => false),
      get: vi.fn(() => null),
    } as any),
    getLoad: () => ({
      image: vi.fn(),
      on: vi.fn(),
      start: vi.fn(),
    } as any),
    getAdd: () => ({
      graphics: graphicsFactory,
      container: vi.fn(() => makeMockContainer()),
      rectangle: vi.fn(() => makeMockRect()),
      zone: vi.fn(() => makeMockZone()),
      image: vi.fn(() => makeMockImage()),
    } as any),
    getTime: () => mockTimeClock,
    getTweens: () => mockTweenManager,
    getInput: () => mockInput,
    state: makeMockState(),
    dom: makeMockDom(),
    artifactManager: {
      getCandidatesByRevealState: vi.fn(() => []),
      getLibraryStats: vi.fn(() => ({ total: 80 })),
      createRandomArtifactForSlot: vi.fn(() => null),
    },
    getRound: () => 1,
    getSettled: () => false,
    getRoundResolving: () => false,
    getIsSettlementRevealMode: () => false,
    getMapCategoryWeights: () => null,
    getMapQualityWeights: () => null,
    isSettlementPageActive: () => false,
    writeLog: vi.fn(),
    updateHud: vi.fn(),
    ...overrides,
  }
  return deps
}

function makeMockState(): WarehouseManagerState {
  return {
    gridLayer: null,
    revealCellLayer: null,
    itemLayer: null,
    items: [],
    revealedCells: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false)),
    warehouseCellIndex: {},
    selectedItem: null,
    previewAnchor: { x: 0, y: 0 },
    previewOpenTick: 0,
    pendingRevealHintTargets: null,
    pendingRevealHintText: "",
    pendingRevealHintSeenIds: null,
    warehouseTrueValue: 0,
    aiMaxBid: 0,
    currentBid: 0,
  }
}

function makeMockDom(): Record<string, HTMLElement | null> {
  const dom = new JSDOM(
    '<div id="gameRoot"><canvas></canvas></div>' +
      '<div id="previewPopover" class="hidden"></div>' +
      '<div id="previewTitle"></div>' +
      '<div id="previewHint"></div>' +
      '<div id="previewList"></div>' +
      '<div id="previewFilterRow"></div>' +
      '<select id="previewCategorySelect"><option value="all">全部</option></select>' +
      '<input id="bidInput" />' +
      '<div id="bidKeypad" class="hidden"></div>' +
      '<div id="itemDrawer" class="hidden"></div>' +
      '<div id="revealHintUp" class="hidden"></div>' +
      '<div id="revealHintDown" class="hidden"></div>',
  )
  const doc = dom.window.document
  const get = (id: string) => doc.querySelector(`#${id}`) as HTMLElement | null
  return {
    gameRoot: get("gameRoot"),
    previewPopover: get("previewPopover"),
    previewTitle: get("previewTitle"),
    previewHint: get("previewHint"),
    previewList: get("previewList"),
    previewFilterRow: get("previewFilterRow"),
    previewCategorySelect: get("previewCategorySelect"),
    bidInput: get("bidInput") as HTMLInputElement | null,
    bidKeypad: get("bidKeypad"),
    itemDrawer: get("itemDrawer"),
    revealHintUp: get("revealHintUp"),
    revealHintDown: get("revealHintDown"),
  }
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    key: "test-item",
    majorCategory: "古董",
    category: "瓷器",
    name: "测试藏品",
    basePrice: 1000,
    qualityKey: "fine" as any,
    w: 1,
    h: 1,
    id: "artifact-1",
    quality: { label: "良品", color: 0x4caf50, glow: 0x66bb6a, weight: 1 },
    x: 0,
    y: 0,
    revealed: { outline: false, qualityCell: null, exact: false },
    trueValue: 1000,
    expectedPrice: 1200,
    previewSizeTag: "1x1",
    view: {
      silhouette: makeMockRect(),
      border: makeMockRect(),
      qualityMarkers: makeMockContainer(),
      clickZone: makeMockZone(),
      artifactImage: null,
      borderPulseStarted: false,
      qualitySynced: false,
      qualityGlowTween: null,
    },
    ...overrides,
  } as unknown as Artifact
}

// ─── 测试 ───

describe("WarehouseManager", () => {
  describe("guardWarehouseCapacity", () => {
    it("正常容量不抛错", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      expect(() => manager.guardWarehouseCapacity()).not.toThrow()
    })
  })

  describe("findFirstEmptySlot", () => {
    it("返回第一个空格", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const occ = [
        [true, true, false],
        [false, false, false],
      ]
      expect(manager.findFirstEmptySlot(occ as any)).toEqual({ col: 2, row: 0 })
    })

    it("全满返回 null", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const occ = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(true))
      expect(manager.findFirstEmptySlot(occ)).toBeNull()
    })
  })

  describe("isInBoundsCell", () => {
    it("在范围内返回 true", () => {
      const manager = new WarehouseManager(makeMockDeps())
      expect(manager.isInBoundsCell(0, 0)).toBe(true)
      expect(manager.isInBoundsCell(GRID_COLS - 1, GRID_ROWS - 1)).toBe(true)
    })

    it("超出范围返回 false", () => {
      const manager = new WarehouseManager(makeMockDeps())
      expect(manager.isInBoundsCell(-1, 0)).toBe(false)
      expect(manager.isInBoundsCell(GRID_COLS, 0)).toBe(false)
    })
  })

  describe("hasAnyInfo", () => {
    it("有轮廓信息返回 true", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact({ revealed: { outline: true, qualityCell: null, exact: false } })
      expect(manager.hasAnyInfo(item)).toBe(true)
    })

    it("无信息返回 false", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact({ revealed: { outline: false, qualityCell: null, exact: false } })
      expect(manager.hasAnyInfo(item)).toBe(false)
    })
  })

  describe("getItemKnownText", () => {
    it("有品质有轮廓返回完整信息", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
        w: 2,
        h: 3,
      })
      expect(manager.getItemKnownText(item)).toBe("品质=良品 | 占格=2x3")
    })

    it("无信息返回未知藏品", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact()
      expect(manager.getItemKnownText(item)).toBe("未知藏品")
    })
  })

  describe("drawUnknownWarehouse", () => {
    it("创建 gridLayer 和 revealCellLayer", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.drawUnknownWarehouse()

      expect(deps.state.gridLayer).toBeTruthy()
      expect(deps.state.revealCellLayer).toBeTruthy()
      expect(deps.state.revealedCells).toHaveLength(GRID_ROWS)
      expect(deps.state.revealedCells[0]).toHaveLength(GRID_COLS)
      expect(deps.state.revealedCells[0][0]).toBe(false)
    })

    it("调用 delayedCall 延迟加载藏品图片", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.drawUnknownWarehouse()
      expect(deps.getTime().delayedCall).toHaveBeenCalledWith(100, expect.any(Function))
    })

    it("已有 gridLayer 时先销毁", () => {
      const deps = makeMockDeps()
      const oldGraphics = makeMockGraphics()
      deps.state.gridLayer = oldGraphics as any
      const manager = new WarehouseManager(deps)
      manager.drawUnknownWarehouse()
      expect(oldGraphics.destroy).toHaveBeenCalled()
    })
  })

  describe("drawGridLines", () => {
    it("无 gridLayer 时直接返回", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.drawGridLines()
      expect(deps.getAdd().graphics).not.toHaveBeenCalled()
    })

    it("有 gridLayer 时调用 clear 重绘", () => {
      const deps = makeMockDeps()
      const g = makeMockGraphics()
      deps.state.gridLayer = g as any
      const manager = new WarehouseManager(deps)
      manager.drawGridLines()
      expect(g.clear).toHaveBeenCalled()
    })

    it("已揭示轮廓的藏品占据格子时跳过内部格线", () => {
      const deps = makeMockDeps()
      const g = makeMockGraphics()
      deps.state.gridLayer = g as any
      deps.state.items = [
        makeArtifact({
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          revealed: { outline: true, qualityCell: null, exact: false },
        }),
      ]
      const manager = new WarehouseManager(deps)
      manager.drawGridLines()
      expect(g.clear).toHaveBeenCalled()
      expect(g.lineBetween).toHaveBeenCalled()
    })
  })

  describe("spawnRandomItems", () => {
    it("创建 itemLayer 并生成藏品", () => {
      const deps = makeMockDeps()
      const mockArtifact = makeArtifact()
      deps.artifactManager.createRandomArtifactForSlot = vi.fn(() => mockArtifact) as any
      const manager = new WarehouseManager(deps)
      manager.spawnRandomItems()

      expect(deps.state.itemLayer).toBeTruthy()
      expect(deps.state.items.length).toBeGreaterThan(0)
      expect(deps.artifactManager.createRandomArtifactForSlot).toHaveBeenCalled()
    })

    it("已有 itemLayer 时先销毁", () => {
      const deps = makeMockDeps()
      const oldLayer = makeMockContainer()
      deps.state.itemLayer = oldLayer as any
      deps.artifactManager.createRandomArtifactForSlot = vi.fn(() => makeArtifact()) as any
      const manager = new WarehouseManager(deps)
      manager.spawnRandomItems()
      expect(oldLayer.destroy).toHaveBeenCalled()
    })

    it("createRandomArtifactForSlot 返回 null 时跳过", () => {
      const deps = makeMockDeps()
      deps.artifactManager.createRandomArtifactForSlot = vi.fn(() => null) as any
      const manager = new WarehouseManager(deps)
      manager.spawnRandomItems()
      expect(deps.state.items).toHaveLength(0)
    })

    it("注入地图品类权重", () => {
      const deps = makeMockDeps()
      const weights = { 瓷器: 2 }
      deps.getMapCategoryWeights = () => weights
      deps.artifactManager.createRandomArtifactForSlot = vi.fn(() => makeArtifact()) as any
      const manager = new WarehouseManager(deps)
      manager.spawnRandomItems()
      expect(deps.artifactManager.createRandomArtifactForSlot).toHaveBeenCalledWith(
        expect.objectContaining({ categoryWeights: weights }),
      )
    })
  })

  describe("setupWarehouseAuction", () => {
    it("计算仓库真实价值、AI 最高出价、当前出价", () => {
      const deps = makeMockDeps()
      deps.state.items = [
        makeArtifact({ id: "a1", trueValue: 5000 }),
        makeArtifact({ id: "a2", trueValue: 3000 }),
      ]
      const manager = new WarehouseManager(deps)
      manager.setupWarehouseAuction()

      expect(deps.state.warehouseTrueValue).toBe(8000)
      expect(deps.state.aiMaxBid).toBeGreaterThan(0)
      expect(deps.state.currentBid).toBeGreaterThanOrEqual(1000)
    })

    it("第一回合清空出价输入", () => {
      const deps = makeMockDeps()
      deps.getRound = () => 1
      deps.state.items = [makeArtifact({ trueValue: 5000 })]
      const manager = new WarehouseManager(deps)
      manager.setupWarehouseAuction()
      const bidInput = deps.dom.bidInput as HTMLInputElement
      expect(bidInput.value).toBe("")
      expect(bidInput.placeholder).toBe("点击出价")
    })

    it("非第一回合出价输入设为 0", () => {
      const deps = makeMockDeps()
      deps.getRound = () => 3
      deps.state.items = [makeArtifact({ trueValue: 5000 })]
      const manager = new WarehouseManager(deps)
      manager.setupWarehouseAuction()
      const bidInput = deps.dom.bidInput as HTMLInputElement
      expect(bidInput.value).toBe("0")
      expect(bidInput.placeholder).toBe("")
    })
  })

  describe("placeItem", () => {
    it("设置藏品坐标并标记占用", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact({ w: 2, h: 2 })
      const occ = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
      manager.placeItem(item, { col: 3, row: 4 }, occ)
      expect(item.x).toBe(3)
      expect(item.y).toBe(4)
      expect(occ[4][3]).toBe(true)
      expect(occ[5][4]).toBe(true)
    })
  })

  describe("rebuildWarehouseCellIndex", () => {
    it("构建坐标到藏品 ID 的映射", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      deps.state.items = [makeArtifact({ id: "art-1", x: 2, y: 3, w: 1, h: 1 })]
      manager.rebuildWarehouseCellIndex()
      expect(deps.state.warehouseCellIndex["2,3"]).toBe("art-1")
    })

    it("多格藏品标记所有占据格子", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      deps.state.items = [makeArtifact({ id: "art-2", x: 1, y: 1, w: 2, h: 2 })]
      manager.rebuildWarehouseCellIndex()
      expect(deps.state.warehouseCellIndex["1,1"]).toBe("art-2")
      expect(deps.state.warehouseCellIndex["2,2"]).toBe("art-2")
    })
  })

  describe("isWarehouseCellOccupied", () => {
    it("坐标越界返回 false", () => {
      const manager = new WarehouseManager(makeMockDeps())
      expect(manager.isWarehouseCellOccupied(-1, 0)).toBe(false)
    })

    it("格子被占据返回 true", () => {
      const deps = makeMockDeps()
      deps.state.warehouseCellIndex = { "3,4": "art-1" }
      const manager = new WarehouseManager(deps)
      expect(manager.isWarehouseCellOccupied(3, 4)).toBe(true)
    })

    it("格子未占据返回 false", () => {
      const deps = makeMockDeps()
      deps.state.warehouseCellIndex = {}
      const manager = new WarehouseManager(deps)
      expect(manager.isWarehouseCellOccupied(3, 4)).toBe(false)
    })
  })

  describe("renderItem", () => {
    it("创建藏品视图对象并添加到 itemLayer", () => {
      const deps = makeMockDeps()
      deps.state.itemLayer = makeMockContainer() as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact()
      manager.renderItem(item)
      expect(item.view.silhouette).toBeTruthy()
      expect(item.view.border).toBeTruthy()
      expect(item.view.qualityMarkers).toBeTruthy()
      expect(item.view.clickZone).toBeTruthy()
      expect(item.view.artifactImage).toBeNull()
      expect(deps.state.itemLayer!.add).toHaveBeenCalled()
    })
  })

  describe("revealCell", () => {
    it("标记格子已揭示并填充颜色", () => {
      const deps = makeMockDeps()
      const g = makeMockGraphics()
      deps.state.revealCellLayer = g as any
      const manager = new WarehouseManager(deps)
      manager.revealCell(2, 3)
      expect(deps.state.revealedCells[3][2]).toBe(true)
      expect(g.fillStyle).toHaveBeenCalledWith(0xf1e6cc, 0.2)
      expect(g.fillRect).toHaveBeenCalled()
    })

    it("已揭示的格子不重复揭示", () => {
      const deps = makeMockDeps()
      const g = makeMockGraphics()
      deps.state.revealCellLayer = g as any
      deps.state.revealedCells[3][2] = true
      const manager = new WarehouseManager(deps)
      manager.revealCell(2, 3)
      expect(g.fillRect).not.toHaveBeenCalled()
    })
  })

  describe("revealOutline", () => {
    it("已揭示轮廓时直接返回", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({ revealed: { outline: true, qualityCell: null, exact: false } })
      manager.revealOutline(item)
      expect(item.view.silhouette.setFillStyle).not.toHaveBeenCalledWith(0xe5d7bd, 0.26)
    })

    it("揭示轮廓并标记格子", () => {
      const deps = makeMockDeps()
      const g = makeMockGraphics()
      deps.state.revealCellLayer = g as any
      deps.state.gridLayer = makeMockGraphics() as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        x: 0,
        y: 0,
        w: 2,
        h: 1,
        revealed: { outline: false, qualityCell: null, exact: false },
      })
      manager.revealOutline(item, { skipEffects: true })
      expect(item.revealed.outline).toBe(true)
      expect(item.view.silhouette.setFillStyle).toHaveBeenCalledWith(0xe5d7bd, 0.26)
      expect(deps.state.revealedCells[0][0]).toBe(true)
      expect(deps.state.revealedCells[0][1]).toBe(true)
    })
  })

  describe("revealQualityCell", () => {
    it("已有品质格时直接返回", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: false, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.revealQualityCell(item)
      expect(deps.getTweens().add).not.toHaveBeenCalled()
    })

    it("揭示品质格并设置 qualityCell", () => {
      const deps = makeMockDeps()
      deps.state.revealCellLayer = makeMockGraphics() as any
      deps.state.gridLayer = makeMockGraphics() as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        revealed: { outline: false, qualityCell: null, exact: false },
      })
      manager.revealQualityCell(item, { skipEffects: true })
      expect(item.revealed.qualityCell).toBeTruthy()
      expect(item.revealed.qualityCell!.x).toBe(0)
      expect(item.revealed.qualityCell!.y).toBe(0)
    })
  })

  describe("revealArtifactFully", () => {
    it("无效藏品返回失败", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const result = manager.revealArtifactFully(null as any)
      expect(result.ok).toBe(false)
    })

    it("已完全揭示返回失败", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact({ revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: true } })
      const result = manager.revealArtifactFully(item)
      expect(result.ok).toBe(false)
      expect(result.message).toContain("已完全揭示")
    })

    it("完全揭示藏品并标记 exact", () => {
      const deps = makeMockDeps()
      deps.state.revealCellLayer = makeMockGraphics() as any
      deps.state.gridLayer = makeMockGraphics() as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        revealed: { outline: false, qualityCell: null, exact: false },
      })
      const result = manager.revealArtifactFully(item, { skipEffects: true })
      expect(result.ok).toBe(true)
      expect(item.revealed.exact).toBe(true)
      expect(item.revealed.outline).toBe(true)
      expect(item.revealed.qualityCell).toBeTruthy()
    })
  })

  describe("pickRevealTargets", () => {
    it("按 outline 模式筛选未揭示轮廓的藏品", () => {
      const deps = makeMockDeps()
      deps.state.items = [
        makeArtifact({ id: "1", category: "瓷器", revealed: { outline: true, qualityCell: null, exact: false } }),
        makeArtifact({ id: "2", category: "瓷器", revealed: { outline: false, qualityCell: null, exact: false } }),
      ]
      const manager = new WarehouseManager(deps)
      const result = manager.pickRevealTargets({
        mode: "outline",
        count: 10,
        category: null,
        allowCategoryFallback: false,
        sortStrategy: null,
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("2")
    })
  })

  describe("pickBottomCellFromTargets", () => {
    it("空数组返回 null", () => {
      const manager = new WarehouseManager(makeMockDeps())
      expect(manager.pickBottomCellFromTargets([])).toBeNull()
    })

    it("选取最下方的格子", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const targets = [
        makeArtifact({ x: 0, y: 0, w: 1, h: 1 }),
        makeArtifact({ x: 5, y: 3, w: 2, h: 3 }),
      ]
      const result = manager.pickBottomCellFromTargets(targets)
      expect(result!.y).toBe(5)
    })
  })

  describe("revealOutlineBatch", () => {
    it("无目标时返回失败", () => {
      const deps = makeMockDeps()
      deps.state.items = []
      const manager = new WarehouseManager(deps)
      const result = manager.revealOutlineBatch(5, null, false, null) as any
      expect(result.ok).toBe(false)
      expect(result.message).toContain("没有可揭示轮廓的目标")
    })

    it("有目标时揭示并返回 bottomCell", () => {
      const deps = makeMockDeps()
      deps.state.revealCellLayer = makeMockGraphics() as any
      deps.state.gridLayer = makeMockGraphics() as any
      deps.state.items = [
        makeArtifact({ id: "1", x: 0, y: 0, w: 1, h: 1, revealed: { outline: false, qualityCell: null, exact: false } }),
      ]
      const manager = new WarehouseManager(deps)
      const result = manager.revealOutlineBatch(5, null, false, null) as any
      expect(result.ok).toBe(true)
      expect(result.revealed).toBe(1)
      expect(result.bottomCell).toBeTruthy()
    })
  })

  describe("revealQualityBatch", () => {
    it("无目标时返回失败", () => {
      const deps = makeMockDeps()
      deps.state.items = []
      const manager = new WarehouseManager(deps)
      const result = manager.revealQualityBatch(5, null, false, null) as any
      expect(result.ok).toBe(false)
    })
  })

  describe("revealArtifactFullyBatch", () => {
    it("无未揭示藏品时返回失败", () => {
      const deps = makeMockDeps()
      deps.state.items = [
        makeArtifact({ id: "1", revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: true } }),
      ]
      const manager = new WarehouseManager(deps)
      const result = manager.revealArtifactFullyBatch({
        count: 5,
        sortStrategy: null,
        category: null,
        allowCategoryFallback: false,
      }) as any
      expect(result.ok).toBe(false)
      expect(result.message).toContain("没有可完全揭示的藏品")
    })
  })

  describe("hideRevealScrollHints", () => {
    it("隐藏提示元素并清空状态", () => {
      const deps = makeMockDeps()
      deps.state.pendingRevealHintTargets = [makeArtifact()]
      deps.state.pendingRevealHintText = "测试"
      deps.state.pendingRevealHintSeenIds = new Set()
      const manager = new WarehouseManager(deps)
      manager.hideRevealScrollHints()
      expect(deps.dom.revealHintUp!.classList.contains("hidden")).toBe(true)
      expect(deps.dom.revealHintDown!.classList.contains("hidden")).toBe(true)
      expect(deps.state.pendingRevealHintTargets).toBeNull()
      expect(deps.state.pendingRevealHintText).toBe("")
      expect(deps.state.pendingRevealHintSeenIds).toBeNull()
    })
  })

  describe("showRevealScrollHintsForTargets", () => {
    it("空目标不设置提示", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.showRevealScrollHintsForTargets([], "测试")
      expect(deps.state.pendingRevealHintTargets).toBeNull()
    })

    it("设置提示目标并调用 refreshRevealScrollHints", () => {
      const deps = makeMockDeps()
      const targets = [makeArtifact({ id: "a1", x: 0, y: 0, w: 1, h: 1 })]
      const manager = new WarehouseManager(deps)
      manager.showRevealScrollHintsForTargets(targets, "测试消息")
      expect(deps.state.pendingRevealHintTargets).toBe(targets)
      expect(deps.state.pendingRevealHintText).toBe("测试消息")
      expect(deps.state.pendingRevealHintSeenIds).toBeInstanceOf(Set)
    })
  })

  describe("refreshRevealScrollHints", () => {
    it("无 gameRoot 时直接返回", () => {
      const deps = makeMockDeps()
      deps.dom.gameRoot = null
      deps.state.pendingRevealHintTargets = [makeArtifact()]
      const manager = new WarehouseManager(deps)
      manager.refreshRevealScrollHints()
      expect(deps.dom.revealHintUp!.textContent).toBe("")
    })

    it("无提示目标时直接返回", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.refreshRevealScrollHints()
      expect(deps.dom.revealHintUp!.textContent).toBe("")
    })
  })

  describe("clearQualityVisual", () => {
    it("无 view 时直接返回", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const item = makeArtifact()
      ;(item as any).view = undefined
      expect(() => manager.clearQualityVisual(item)).not.toThrow()
    })

    it("停止品质光晕补间并移除标记", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const tween = makeMockTween()
      const item = makeArtifact()
      item.view.qualityGlowTween = tween as any
      manager.clearQualityVisual(item)
      expect(tween.stop).toHaveBeenCalled()
      expect(item.view.qualityGlowTween).toBeNull()
      expect(item.view.qualityMarkers.removeAll).toHaveBeenCalledWith(true)
    })

    it("keepImage=true 时保留图片", () => {
      const manager = new WarehouseManager(makeMockDeps())
      const img = makeMockImage()
      const item = makeArtifact()
      item.view.artifactImage = img as any
      manager.clearQualityVisual(item, true)
      expect(item.view.qualityMarkers.remove).toHaveBeenCalledWith(img, false)
      expect(item.view.qualityMarkers.add).toHaveBeenCalledWith(img)
    })
  })

  describe("positionPreview", () => {
    it("设置预览锚点并显示弹窗", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      manager.positionPreview(100, 200)
      expect(deps.state.previewAnchor).toEqual({ x: 100, y: 200 })
      expect(deps.dom.previewPopover!.classList.contains("hidden")).toBe(false)
      expect(deps.state.previewOpenTick).toBeGreaterThan(0)
    })
  })

  describe("hidePreview", () => {
    it("隐藏弹窗并清空内容", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      deps.dom.previewPopover!.classList.remove("hidden")
      deps.dom.previewList!.innerHTML = "<div>内容</div>"
      deps.dom.previewHint!.textContent = "提示"
      manager.hidePreview()
      expect(deps.dom.previewPopover!.classList.contains("hidden")).toBe(true)
      expect(deps.dom.previewList!.innerHTML).toBe("")
      expect(deps.dom.previewHint!.textContent).toBe("")
      expect(deps.getInput().setDefaultCursor).toHaveBeenCalledWith("default")
    })
  })

  describe("repositionPreview", () => {
    it("弹窗隐藏时不重定位", () => {
      const deps = makeMockDeps()
      const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0)
      const manager = new WarehouseManager(deps)
      manager.repositionPreview()
      expect(rafSpy).not.toHaveBeenCalled()
      rafSpy.mockRestore()
    })
  })

  describe("isPointOnSettlementLockedItem", () => {
    it("无藏品返回 false", () => {
      const manager = new WarehouseManager(makeMockDeps())
      expect(manager.isPointOnSettlementLockedItem(0, 0)).toBe(false)
    })

    it("点在已揭示品质格的藏品上返回 true", () => {
      const deps = makeMockDeps()
      deps.state.items = [
        makeArtifact({
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          revealed: { outline: false, qualityCell: { x: 0, y: 0 }, exact: false },
        }),
      ]
      const manager = new WarehouseManager(deps)
      const px = MARGIN + 1 * CELL_SIZE
      const py = MARGIN + 1 * CELL_SIZE
      expect(manager.isPointOnSettlementLockedItem(px, py)).toBe(true)
    })

    it("点在未揭示藏品上返回 false", () => {
      const deps = makeMockDeps()
      deps.state.items = [
        makeArtifact({
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          revealed: { outline: false, qualityCell: null, exact: false },
        }),
      ]
      const manager = new WarehouseManager(deps)
      expect(manager.isPointOnSettlementLockedItem(0, 0)).toBe(false)
    })
  })

  describe("renderPreviewCandidates", () => {
    it("无候选时显示无符合候选", () => {
      const deps = makeMockDeps()
      deps.artifactManager.getCandidatesByRevealState = vi.fn(() => []) as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.renderPreviewCandidates(item)
      expect(deps.dom.previewList!.innerHTML).toContain("无符合候选")
    })

    it("有候选时按估算价排序渲染", () => {
      const deps = makeMockDeps()
      const c1 = makeArtifact({ id: "c1", name: "候选A", expectedPrice: 500, basePrice: 400 })
      const c2 = makeArtifact({ id: "c2", name: "候选B", expectedPrice: 1000, basePrice: 800 })
      deps.artifactManager.getCandidatesByRevealState = vi.fn(() => [c1, c2]) as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.renderPreviewCandidates(item)
      const html = deps.dom.previewList!.innerHTML
      expect(html).toContain("候选B")
      expect(html).toContain("候选A")
      const idxB = html.indexOf("候选B")
      const idxA = html.indexOf("候选A")
      expect(idxB).toBeLessThan(idxA)
    })

    it("标题显示候选数量和总数", () => {
      const deps = makeMockDeps()
      deps.artifactManager.getCandidatesByRevealState = vi.fn(() => [makeArtifact()]) as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.renderPreviewCandidates(item)
      expect(deps.dom.previewTitle!.textContent).toContain("候选 1/80")
    })

    it("轮廓+品质且唯一候选时标记精确揭示", () => {
      const deps = makeMockDeps()
      deps.artifactManager.getCandidatesByRevealState = vi.fn(() => [makeArtifact()]) as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.renderPreviewCandidates(item)
      expect(item.revealed.exact).toBe(true)
    })
  })

  describe("renderSettlementItemPreview", () => {
    it("渲染结算藏品详情", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        key: "test-art",
        name: "测试古董",
        category: "玉器",
        basePrice: 2000,
        trueValue: 3000,
        quality: { label: "珍品", color: 0xffd700, glow: 0xffe44f, weight: 1 },
      })
      manager.renderSettlementItemPreview(item)
      const html = deps.dom.previewList!.innerHTML
      expect(html).toContain("测试古董")
      expect(html).toContain("玉器")
      expect(html).toContain("珍品")
      expect(html).toContain("2000")
      expect(html).toContain("3000")
      expect(deps.dom.previewFilterRow!.style.display).toBe("none")
      expect(deps.dom.previewTitle!.style.display).toBe("none")
      expect(deps.dom.previewHint!.style.display).toBe("none")
    })
  })

  describe("onArtifactClicked", () => {
    it("出价键盘可见时不响应", () => {
      const deps = makeMockDeps()
      deps.dom.bidKeypad!.classList.remove("hidden")
      const manager = new WarehouseManager(deps)
      const item = makeArtifact()
      manager.onArtifactClicked(item, { x: 0, y: 0 })
      expect(deps.writeLog).not.toHaveBeenCalled()
    })

    it("道具抽屉可见时不响应", () => {
      const deps = makeMockDeps()
      deps.dom.itemDrawer!.classList.remove("hidden")
      const manager = new WarehouseManager(deps)
      const item = makeArtifact()
      manager.onArtifactClicked(item, { x: 0, y: 0 })
      expect(deps.writeLog).not.toHaveBeenCalled()
    })

    it("结算页面 + 已揭示轮廓 -> 打开结算预览", () => {
      const deps = makeMockDeps()
      deps.isSettlementPageActive = () => true
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: null, exact: false },
        trueValue: 5000,
        name: "古玉",
      })
      manager.onArtifactClicked(item, { x: 100, y: 200 })
      expect(deps.state.selectedItem).toBe(item)
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("结算查看"))
      expect(deps.dom.previewPopover!.classList.contains("hidden")).toBe(false)
    })

    it("结算页面 + 未揭示轮廓 -> 不响应", () => {
      const deps = makeMockDeps()
      deps.isSettlementPageActive = () => true
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({ revealed: { outline: false, qualityCell: null, exact: false } })
      manager.onArtifactClicked(item, { x: 100, y: 200 })
      expect(deps.state.selectedItem).toBeNull()
    })

    it("已结算状态 -> 不响应", () => {
      const deps = makeMockDeps()
      deps.getSettled = () => true
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: null, exact: false },
      })
      manager.onArtifactClicked(item, { x: 0, y: 0 })
      expect(deps.writeLog).not.toHaveBeenCalled()
    })

    it("无线索藏品 -> 提示无法预览", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({ revealed: { outline: false, qualityCell: null, exact: false } })
      manager.onArtifactClicked(item, { x: 0, y: 0 })
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("尚无任何线索"))
    })

    it("有线索藏品 -> 打开候选预览", () => {
      const deps = makeMockDeps()
      deps.artifactManager.getCandidatesByRevealState = vi.fn(() => []) as any
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        revealed: { outline: true, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      manager.onArtifactClicked(item, { x: 100, y: 200 })
      expect(deps.state.selectedItem).toBe(item)
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("已打开候选预览"))
      expect(deps.updateHud).toHaveBeenCalled()
      expect(deps.dom.previewPopover!.classList.contains("hidden")).toBe(false)
    })

    it("仅品质格线索 + 点击非品质格 -> 提示只能点击品质格", () => {
      const deps = makeMockDeps()
      const manager = new WarehouseManager(deps)
      const item = makeArtifact({
        x: 0,
        y: 0,
        revealed: { outline: false, qualityCell: { x: 0, y: 0 }, exact: false },
      })
      const clickX = MARGIN + 2 * CELL_SIZE
      const clickY = MARGIN + 0 * CELL_SIZE
      manager.onArtifactClicked(item, { x: clickX, y: clickY })
      expect(deps.writeLog).toHaveBeenCalledWith(expect.stringContaining("只能点击已揭示的品质格"))
    })
  })

  describe("setupPreviewTouchScroll", () => {
    it("无弹窗元素时直接返回", () => {
      const deps = makeMockDeps()
      deps.dom.previewPopover = null
      const manager = new WarehouseManager(deps)
      expect(() => manager.setupPreviewTouchScroll()).not.toThrow()
    })

    it("有弹窗时绑定 touchstart/touchmove 事件", () => {
      const deps = makeMockDeps()
      const pop = deps.dom.previewPopover!
      const addSpy = vi.spyOn(pop, "addEventListener")
      const manager = new WarehouseManager(deps)
      manager.setupPreviewTouchScroll()
      expect(addSpy).toHaveBeenCalledWith("touchstart", expect.any(Function), expect.any(Object))
      expect(addSpy).toHaveBeenCalledWith("touchmove", expect.any(Function), expect.any(Object))
    })
  })
})
