/**
 * @file warehouse/index.ts
 * @module game/warehouse
 * @description 仓库核心系统。管理仓库网格的绘制、藏品生成与放置、揭示机制、
 *              候选预览等完整仓库逻辑。由三个 Mixin 组成，混入 Phaser Scene。
 *
 * 三个 Mixin：
 *
 * WarehouseCoreMixin - 仓库核心：
 *   - preloadArtifactImages(): 预加载藏品缩略图
 *   - drawUnknownWarehouse(): 绘制空白仓库网格
 *   - drawGridLines(): 智能网格线
 *   - guardWarehouseCapacity(): 容量上限检查
 *   - spawnRandomItems(): 随机生成藏品
 *   - setupWarehouseAuction(): 初始化拍卖参数
 *   - renderItem(item): 渲染单个藏品
 *   - onArtifactClicked(item, pointer): 藏品点击处理
 *   - rebuildWarehouseCellIndex(): 重建格子→藏品索引
 *   - placeItem / findFirstEmptySlot / isInBoundsCell / isWarehouseCellOccupied
 *
 * WarehouseRevealMixin - 揭示系统：
 *   - revealOutlineBatch / revealQualityBatch / revealArtifactFully / revealArtifactFullyBatch
 *   - playFullRevealEffect / playOutlineRevealEffect / playQualityRevealEffect
 *   - pickRevealTargets / renderQualityVisual / revealOutline / revealQualityCell / revealCell
 *   - showRevealScrollHintsForTargets / refreshRevealScrollHints / hideRevealScrollHints
 *   - pickBottomCellFromTargets / clearQualityVisual / syncQualityMarkersForOutlinedItem
 *
 * WarehousePreviewMixin - 候选预览：
 *   - positionPreview / applyPreviewPosition / repositionPreview / hidePreview
 *   - setupPreviewTouchScroll / isPointOnSettlementLockedItem
 *   - renderPreviewCandidates / renderSettlementItemPreview
 *
 * @exports window.MobaoWarehouse - 仓库 Mixin 集合
 *
 * @requires data/artifacts - 藏品数据
 * @requires core/constants - 常量定义
 * @requires core/utils - 工具函数
 */
import type { Artifact, ArtifactRevealState, QualityLevel, QualityConfig, RevealResult } from "../../../types/game"

/** Mixin this 类型：WarehouseScene 运行时完整接口（属性+方法） */
interface WarehouseSceneLike {
  // Phaser Scene
  textures: Phaser.TextureManager
  load: Phaser.LoaderPlugin
  add: Phaser.Scene["add"]
  time: Phaser.TimePlugin
  tweens: Phaser.TweenManager
  input: Phaser.InputPlugin

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
  updateSidePanels(skillState: Record<string, unknown>, itemState: Record<string, unknown>, clueCount: number, occupiedCells: number, capacity: number, bidState: string): void
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
import {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  CANVAS_NATIVE_HEIGHT,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE
} from "../core/constants"
import { shuffle, clamp, toCellKey, rgbHex, qualityPulseDuration } from "../core/utils"
import { toSizeTag, ARTIFACT_LIBRARY, QUALITY_CONFIG } from "../data/artifacts"

const ARTIFACT_IMAGE_BASE_PATH = "assets/images/artifacts/thumbs/"

export const WarehouseCoreMixin = {
  preloadArtifactImages() {
    if (!ARTIFACT_LIBRARY || !Array.isArray(ARTIFACT_LIBRARY)) {
      return
    }
    const toLoad: string[] = []
    ARTIFACT_LIBRARY.forEach((artifact: Artifact) => {
      const textureKey = `artifact-${artifact.key}`
      if (!(this as WarehouseSceneLike).textures.exists(textureKey)) {
        ; (this as WarehouseSceneLike).load.image(textureKey, ARTIFACT_IMAGE_BASE_PATH + artifact.key + ".png")
        toLoad.push(artifact.key)
      }
    })

    if (toLoad.length === 0) {
      console.log("[藏品图片] 所有图片已缓存，无需加载")
      return
    }

    console.log(`[藏品图片] 开始加载 ${toLoad.length} 张图片:`, toLoad)

      ; (this as WarehouseSceneLike).load.on("progress", (value: number) => {
        console.log(`[藏品图片] 加载进度: ${Math.round(value * 100)}%`)
      })

      ; (this as WarehouseSceneLike).load.on("complete", () => {
        console.log("[藏品图片] 全部加载完成")
        ARTIFACT_LIBRARY.forEach((artifact: Artifact) => {
          const textureKey = `artifact-${artifact.key}`
          const texture = (this as WarehouseSceneLike).textures.get(textureKey)
          if (texture && texture.frames) {
            texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
          }
        })
      })

      ; (this as WarehouseSceneLike).load.on("load", (file: { key: string }) => {
        console.log(`[藏品图片] 已加载: ${file.key}`)
      })

      ; (this as WarehouseSceneLike).load.on("loaderror", (file: { key: string; src?: string }) => {
        console.warn(`[藏品图片] 加载失败: ${file.key}`, file.src)
      })

      ; (this as WarehouseSceneLike).load.start()
  },

  /**
   * 绘制空白仓库网格。创建gridLayer和revealCellLayer两个Phaser Graphics图层，
   * 绘制12列×25行的网格线
   * @returns {void}
   */
  drawUnknownWarehouse() {
    if ((this as WarehouseSceneLike).gridLayer) {
      ; (this as WarehouseSceneLike).gridLayer.destroy()
    }
    if ((this as WarehouseSceneLike).revealCellLayer) {
      ; (this as WarehouseSceneLike).revealCellLayer.destroy()
    }

    ; (this as WarehouseSceneLike).gridLayer = (this as WarehouseSceneLike).add.graphics()

    for (let col = 1; col < GRID_COLS; col++) {
      const x = MARGIN + col * CELL_SIZE
        ; (this as WarehouseSceneLike).gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
        ; (this as WarehouseSceneLike).gridLayer.lineBetween(x, MARGIN, x, MARGIN + GRID_ROWS * CELL_SIZE)
    }
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = MARGIN + row * CELL_SIZE
        ; (this as WarehouseSceneLike).gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
        ; (this as WarehouseSceneLike).gridLayer.lineBetween(MARGIN, y, MARGIN + GRID_COLS * CELL_SIZE, y)
    }

    ; (this as WarehouseSceneLike).revealCellLayer = (this as WarehouseSceneLike).add.graphics()
      ; (this as WarehouseSceneLike).revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

      ; (this as WarehouseSceneLike).time.delayedCall(100, () => {
        this.preloadArtifactImages()
      })
  },

  drawGridLines() {
    if (!(this as WarehouseSceneLike).gridLayer) return
      ; (this as WarehouseSceneLike).gridLayer.clear()

    const occupied = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
    for (const item of (this as WarehouseSceneLike).items) {
      if (!item.revealed || !item.revealed.outline) continue
      for (let r = item.y; r < item.y + item.h; r++) {
        for (let c = item.x; c < item.x + item.w; c++) {
          if (r < GRID_ROWS && c < GRID_COLS) {
            occupied[r][c] = true
          }
        }
      }
    }

    for (let col = 1; col < GRID_COLS; col++) {
      const x = MARGIN + col * CELL_SIZE
      for (let row = 0; row < GRID_ROWS; row++) {
        const leftOccupied = occupied[row][col - 1]
        const rightOccupied = occupied[row][col]
        if (!leftOccupied || !rightOccupied) {
          const y1 = MARGIN + row * CELL_SIZE
          const y2 = MARGIN + (row + 1) * CELL_SIZE
            ; (this as WarehouseSceneLike).gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
            ; (this as WarehouseSceneLike).gridLayer.lineBetween(x, y1, x, y2)
        }
      }
    }

    for (let row = 1; row < GRID_ROWS; row++) {
      const y = MARGIN + row * CELL_SIZE
      for (let col = 0; col < GRID_COLS; col++) {
        const topOccupied = occupied[row - 1][col]
        const bottomOccupied = occupied[row][col]
        if (!topOccupied || !bottomOccupied) {
          const x1 = MARGIN + col * CELL_SIZE
          const x2 = MARGIN + (col + 1) * CELL_SIZE
            ; (this as WarehouseSceneLike).gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
            ; (this as WarehouseSceneLike).gridLayer.lineBetween(x1, y, x2, y)
        }
      }
    }
  },

  guardWarehouseCapacity() {
    const capacity = GRID_COLS * GRID_ROWS
    if (capacity > MAX_WAREHOUSE_CELLS) {
      throw new Error(
        `仓库容量超上限：${capacity} > ${MAX_WAREHOUSE_CELLS}，请调整 GRID_COLS / GRID_ROWS / CELL_SIZE。`
      )
    }
  },

  /**
   * 随机生成藏品并放置到仓库网格中
   * 根据ARTIFACT_COUNT_RANGE和WAREHOUSE_OCCUPANCY_RATIO_RANGE确定目标数量，
   * 使用ArtifactManager按品类权重随机生成藏品，尝试放置到网格中
   * @returns {void}
   */
  spawnRandomItems() {
    // ─── 仓库生成算法 ───
    //
    // 步骤1: 初始化空网格 occupancy[ROWS][COLS] = false
    // 步骤2: 计算目标占用格数 = capacity × random(0.38, 0.88)
    // 步骤3: 循环生成藏品直到满足条件:
    //   a. 查找第一个空槽位 findFirstEmptySlot()
    //   b. 按品类权重随机生成藏品 createRandomArtifactForSlot()
    //   c. 尝试放置到网格 placeArtifact()
    //   d. 更新占用计数
    // 步骤4: 渲染所有藏品到itemLayer
    //
    // 关键变量:
    //   occupancy - 网格占用状态二维数组
    //   targetOccupiedCells - 目标占用格数
    //   occupiedCellsCount - 当前已占用格数
    //
    // 注意事项:
    //   - 最多尝试520次防止无限循环
    //   - 藏品尺寸从1×1到3×2不等，需要矩形放置检测

    if ((this as WarehouseSceneLike).itemLayer) {
      ; (this as WarehouseSceneLike).itemLayer.destroy()
    }

    ; (this as WarehouseSceneLike).itemLayer = (this as WarehouseSceneLike).add.container(0, 0)
      ; (this as WarehouseSceneLike).items = []

    const occupancy = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
    const capacity = GRID_COLS * GRID_ROWS
    const targetOccupiedCells = Math.round(
      capacity * Phaser.Math.FloatBetween(WAREHOUSE_OCCUPANCY_RATIO_RANGE.min, WAREHOUSE_OCCUPANCY_RATIO_RANGE.max)
    )
    let occupiedCellsCount = 0
    const desiredCount = Phaser.Math.Between(ARTIFACT_COUNT_RANGE.min, ARTIFACT_COUNT_RANGE.max)

    let attempts = 0
    while ((this as WarehouseSceneLike).items.length < desiredCount && attempts < 520 && occupiedCellsCount < targetOccupiedCells) {
      attempts += 1
      const slot = this.findFirstEmptySlot(occupancy)
      if (!slot) {
        break
      }

      const item = (this as WarehouseSceneLike).artifactManager.createRandomArtifactForSlot({
        col: slot.col,
        row: slot.row,
        gridCols: GRID_COLS,
        gridRows: GRID_ROWS,
        occupancy,
        categoryWeights: (this as WarehouseSceneLike)._mapCategoryWeights || undefined,
        qualityWeights: (this as WarehouseSceneLike)._mapQualityWeights || undefined
      })

      if (!item) {
        occupancy[slot.row][slot.col] = true
        continue
      }

      item.revealed = {
        outline: false,
        qualityCell: null,
        exact: false
      }
      item.trueValue = item.basePrice

      this.placeItem(item, slot, occupancy)
      this.renderItem(item)
        ; (this as WarehouseSceneLike).items.push(item)
      occupiedCellsCount += item.w * item.h
    }
  },

  setupWarehouseAuction() {
    ; (this as WarehouseSceneLike).warehouseTrueValue = (this as WarehouseSceneLike).items.reduce((sum: number, item: Artifact) => sum + item.trueValue, 0)
    const aiRatio = Phaser.Math.FloatBetween(0.9, 1.12)
      ; (this as WarehouseSceneLike).aiMaxBid = Math.round((this as WarehouseSceneLike).warehouseTrueValue * aiRatio)
      ; (this as WarehouseSceneLike).currentBid = Math.max(1000, Math.round(((this as WarehouseSceneLike).warehouseTrueValue * 0.18) / 100) * 100)
      ; ((this as WarehouseSceneLike).dom.bidInput as HTMLInputElement).value = (this as WarehouseSceneLike).round <= 1 ? "" : "0"
      ; ((this as WarehouseSceneLike).dom.bidInput as HTMLInputElement).placeholder = (this as WarehouseSceneLike).round <= 1 ? "点击出价" : ""
  },

  findFirstEmptySlot(occupancy: boolean[][]): { col: number; row: number } | null {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        if (!occupancy[row][col]) {
          return { col, row }
        }
      }
    }
    return null
  },

  placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]) {
    item.x = slot.col
    item.y = slot.row

    for (let y = slot.row; y < slot.row + item.h; y += 1) {
      for (let x = slot.col; x < slot.col + item.w; x += 1) {
        occupancy[y][x] = true
      }
    }
  },

  rebuildWarehouseCellIndex() {
    ; (this as WarehouseSceneLike).warehouseCellIndex = {}
      ; (this as WarehouseSceneLike).items.forEach((item: Artifact) => {
        for (let y = item.y; y < item.y + item.h; y += 1) {
          for (let x = item.x; x < item.x + item.w; x += 1) {
            ; (this as WarehouseSceneLike).warehouseCellIndex[toCellKey(x, y)] = item.id
          }
        }
      })
  },

  isInBoundsCell(x: number, y: number): boolean {
    return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS
  },

  isWarehouseCellOccupied(x: number, y: number): boolean {
    if (!this.isInBoundsCell(x, y)) {
      return false
    }
    return Boolean((this as WarehouseSceneLike).warehouseCellIndex[toCellKey(x, y)])
  },

  renderItem(item: Artifact) {
    const pixelX = Math.round(MARGIN + item.x * CELL_SIZE)
    const pixelY = Math.round(MARGIN + item.y * CELL_SIZE)
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE

    const silhouette = (this as WarehouseSceneLike).add.rectangle(pixelX, pixelY, width, height, 0xe5d7bd, 0)
    silhouette.setOrigin(0, 0)

    const border = (this as WarehouseSceneLike).add.rectangle(pixelX, pixelY, width, height)
    border.setOrigin(0, 0)
    border.setStrokeStyle(3, item.quality.color, 0)

    const qualityMarkers = (this as WarehouseSceneLike).add.container(0, 0)
    const clickZone = (this as WarehouseSceneLike).add.zone(pixelX, pixelY, width, height).setOrigin(0, 0)
    clickZone.setInteractive({ useHandCursor: false })

    clickZone.on("pointerover", () => {
      if (this.hasAnyInfo(item)) {
        ; (this as WarehouseSceneLike).input.setDefaultCursor("pointer")
      } else {
        ; (this as WarehouseSceneLike).input.setDefaultCursor("default")
      }
    })

    clickZone.on("pointerout", () => {
      ; (this as WarehouseSceneLike).input.setDefaultCursor("default")
    })

    const TAP_THRESHOLD = 15
    const TAP_TIME_THRESHOLD = 250

    clickZone.on("pointerup", (pointer: { x: number; y: number; downX: number; downY: number; upTime: number; downTime: number }) => {
      const dx = Math.abs(pointer.x - pointer.downX)
      const dy = Math.abs(pointer.y - pointer.downY)
      const dt = pointer.upTime - pointer.downTime

      if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD && dt < TAP_TIME_THRESHOLD) {
        this.onArtifactClicked(item, pointer)
      }
    })

    item.view = {
      silhouette,
      border,
      qualityMarkers,
      clickZone,
      artifactImage: null,
      borderPulseStarted: false,
      qualitySynced: false,
      qualityGlowTween: null
    }

      ; (this as WarehouseSceneLike).itemLayer.add([silhouette, border, qualityMarkers, clickZone])
  },

  onArtifactClicked(item: Artifact, pointer: { x: number; y: number }) {
    if (
      !(this as WarehouseSceneLike).dom.bidKeypad?.classList.contains("hidden") ||
      ((this as WarehouseSceneLike).dom.itemDrawer && !(this as WarehouseSceneLike).dom.itemDrawer?.classList.contains("hidden"))
    ) {
      return
    }

    if ((this as WarehouseSceneLike).isSettlementPageActive()) {
      if (!item.revealed.outline) {
        return
      }
      ; (this as WarehouseSceneLike).selectedItem = item
      this.positionPreview(pointer.x, pointer.y)
      this.renderSettlementItemPreview(item)
        ; (this as WarehouseSceneLike).writeLog(`结算查看：${item.name}（价值 ${item.trueValue}）`)
      return
    }

    if ((this as WarehouseSceneLike).settled || (this as WarehouseSceneLike).roundResolving) {
      return
    }

    if (!this.hasAnyInfo(item)) {
      ; (this as WarehouseSceneLike).writeLog("该藏品尚无任何线索，无法进行候选预览。")
      return
    }

    if (!item.revealed.outline && item.revealed.qualityCell) {
      const clickCellX = Math.floor((pointer.x - MARGIN) / CELL_SIZE)
      const clickCellY = Math.floor((pointer.y - MARGIN) / CELL_SIZE)
      const qc = item.revealed.qualityCell
      if (clickCellX !== qc.x || clickCellY !== qc.y) {
        ; (this as WarehouseSceneLike).writeLog("只能点击已揭示的品质格来预览候选。")
        return
      }
    }

    ; (this as WarehouseSceneLike).selectedItem = item

      ; ((this as WarehouseSceneLike).dom.previewCategorySelect as HTMLSelectElement).value = "all"
    this.positionPreview(pointer.x, pointer.y)
    this.renderPreviewCandidates(item)

    const info = this.getItemKnownText(item)
      ; (this as WarehouseSceneLike).writeLog(`已打开候选预览：${info}。当前出价作用于整仓，不是单件。`)
      ; (this as WarehouseSceneLike).updateHud()
  },

  hasAnyInfo(item: Artifact): boolean {
    return item.revealed.outline || Boolean(item.revealed.qualityCell)
  },

  getItemKnownText(item: Artifact): string {
    const segments: string[] = []
    if (item.revealed.qualityCell) {
      segments.push(`品质=${item.quality.label}`)
    }
    if (item.revealed.outline) {
      segments.push(`占格=${item.w}x${item.h}`)
    }
    if (segments.length === 0) {
      return "未知藏品"
    }
    return segments.join(" | ")
  }
}

export const WarehouseRevealMixin = {
  /**
   * 批量揭示藏品轮廓
   * @param {number} count - 要揭示的数量
   * @param {string|null} category - 按品类筛选（null表示不限）
   * @param {boolean} allowCategoryFallback - 品类不足时是否允许跨品类
   * @param {string|null} sortStrategy - 排序策略（smallestFirst/largestFirst）
   * @returns {{ ok: boolean, revealed: number, bottomCell?: Object, message?: string }}
   */
  revealOutlineBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) {
    const targets = this.pickRevealTargets({ mode: "outline", count, category, allowCategoryFallback, sortStrategy })
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示轮廓的目标。" }
    }

    targets.forEach((item: Artifact) => this.revealOutline(item))
    this.showRevealScrollHintsForTargets(targets, "轮廓揭示位置不在当前可视区")
    const bottomCell = this.pickBottomCellFromTargets(targets)
    return {
      ok: true,
      revealed: targets.length,
      bottomCell
    }
  },

  /**
   * 批量揭示藏品品质格
   * @param {number} count - 要揭示的数量
   * @param {string|null} category - 按品类筛选（null表示不限）
   * @param {boolean} allowCategoryFallback - 品类不足时是否允许跨品类
   * @param {string|null} sortStrategy - 排序策略（smallestFirst/largestFirst）
   * @returns {{ ok: boolean, revealed: number, bottomCell?: Object, message?: string }}
   */
  revealQualityBatch(count: number, category: string | null, allowCategoryFallback: boolean, sortStrategy: string | null) {
    const targets = this.pickRevealTargets({ mode: "quality", count, category, allowCategoryFallback, sortStrategy })
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示品质格的目标。" }
    }

    targets.forEach((item: Artifact) => this.revealQualityCell(item))
    this.showRevealScrollHintsForTargets(targets, "品质揭示位置不在当前可视区")
    return { ok: true, revealed: targets.length }
  },

  revealArtifactFully(item: Artifact, options: Record<string, unknown> = {}) {
    if (!item || !item.revealed) {
      return { ok: false, message: "无效的藏品目标。" }
    }

    if (item.revealed.exact) {
      return { ok: false, message: "该藏品已完全揭示。" }
    }

    if (!item.revealed.outline) {
      this.revealOutline(item, { skipEffects: options.skipEffects })
    }

    if (!item.revealed.qualityCell) {
      const cells: { x: number; y: number }[] = []
      for (let y = item.y; y < item.y + item.h; y += 1) {
        for (let x = item.x; x < item.x + item.w; x += 1) {
          cells.push({ x, y })
        }
      }
      const chosen = cells[Math.floor(Math.random() * cells.length)]
      this.revealCell(chosen.x, chosen.y)
      item.revealed.qualityCell = chosen
    }

    item.revealed.exact = true

    this.renderQualityVisual(item, options)

    if (!options.skipEffects) {
      this.playFullRevealEffect(item)
    }

    this.drawGridLines()

    return { ok: true, item, message: `完全揭示：${item.name}（${item.quality.label}）` }
  },

  revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback }: { count: number; sortStrategy: string | null; category: string | null; allowCategoryFallback: boolean }) {
    const unrevealed = (this as WarehouseSceneLike).items.filter((item: Artifact) => !item.revealed.exact)

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a: Artifact, b: Artifact) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a: Artifact, b: Artifact) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let pool: Artifact[]
    if (category) {
      const primary = unrevealed.filter((item: Artifact) => item.category === category)
      pool = sortByArea(primary, sortStrategy)

      if (pool.length < count && allowCategoryFallback) {
        const existedIds = new Set(pool.map((item: Artifact) => item.id))
        const fallback = unrevealed.filter((item: Artifact) => !existedIds.has(item.id))
        pool = pool.concat(sortByArea(fallback, sortStrategy))
      }
    } else {
      pool = sortByArea(unrevealed, sortStrategy)
    }

    const targets = pool.slice(0, count)
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可完全揭示的藏品。" }
    }

    const results: { ok: boolean; item: Artifact; message: string }[] = []
    targets.forEach((item: Artifact) => {
      const result = this.revealArtifactFully(item)
      if (result.ok) {
        results.push(result)
      }
    })

    this.showRevealScrollHintsForTargets(targets, "完全揭示位置不在当前可视区")
    const bottomCell = this.pickBottomCellFromTargets(targets)
    return {
      ok: true,
      revealed: results.length,
      items: results.map((r: { ok: boolean; item: Artifact; message: string }) => r.item),
      bottomCell
    }
  },

  playFullRevealEffect(item: Artifact) {
    const pixelX = MARGIN + item.x * CELL_SIZE
    const pixelY = MARGIN + item.y * CELL_SIZE
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE
    const cx = pixelX + width / 2
    const cy = pixelY + height / 2

    if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
      ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("reveal-flash")
      void (this as WarehouseSceneLike).dom.gameRoot.offsetWidth
        ; (this as WarehouseSceneLike).dom.gameRoot.classList.add("reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("reveal-flash")
        }
      }, 600)
    }

    const qualityColor = item.quality.color
    const glowColor = item.quality.glow

    const outerRing = (this as WarehouseSceneLike).add.rectangle(cx, cy, width * 1.6, height * 1.6, glowColor, 0.5)
    outerRing.setOrigin(0.5, 0.5)
    outerRing.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: outerRing,
        scaleX: { from: 0.5, to: 1.8 },
        scaleY: { from: 0.5, to: 1.8 },
        alpha: { from: 0.7, to: 0 },
        duration: 700,
        ease: "Quad.easeOut",
        onComplete: () => outerRing.destroy()
      })

    const innerBurst = (this as WarehouseSceneLike).add.rectangle(cx, cy, width, height, qualityColor, 0.6)
    innerBurst.setOrigin(0.5, 0.5)
    innerBurst.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: innerBurst,
        scaleX: { from: 0.6, to: 1.2 },
        scaleY: { from: 0.6, to: 1.2 },
        alpha: { from: 0.8, to: 0 },
        duration: 500,
        ease: "Sine.easeOut",
        onComplete: () => innerBurst.destroy()
      })

    if (item.view && item.view.border) {
      const border = item.view.border
      border.setAlpha(0)
        ; (this as WarehouseSceneLike).tweens.add({
          targets: border,
          alpha: { from: 0, to: 1 },
          duration: 250,
          ease: "Sine.easeOut"
        })
    }

    if (item.view && item.view.artifactImage) {
      const img = item.view.artifactImage
      const baseScale = img.scaleX
      img.setAlpha(0)
      img.setScale(baseScale * 0.7)
        ; (this as WarehouseSceneLike).tweens.add({
          targets: img,
          alpha: 1,
          scaleX: baseScale * 1.15,
          scaleY: baseScale * 1.15,
          duration: 350,
          ease: "Back.easeOut",
          onComplete: () => {
            ; (this as WarehouseSceneLike).tweens.add({
              targets: img,
              scaleX: baseScale,
              scaleY: baseScale,
              duration: 200,
              ease: "Sine.easeInOut"
            })
          }
        })
    }
  },

  pickBottomCellFromTargets(targets: Artifact[]): { x: number; y: number; col: number; row: number } | null {
    const list = Array.isArray(targets) ? targets : []
    if (list.length === 0) {
      return null
    }

    let selected = list[0]
    let maxBottomY = selected.y + selected.h - 1

    list.forEach((item: Artifact) => {
      const bottomY = item.y + item.h - 1
      if (bottomY > maxBottomY) {
        selected = item
        maxBottomY = bottomY
      }
    })

    const x = Math.max(0, Math.round(selected.x))
    const y = Math.max(0, Math.round(maxBottomY))
    return {
      x,
      y,
      col: x + 1,
      row: y + 1
    }
  },

  hideRevealScrollHints() {
    if ((this as WarehouseSceneLike).dom.revealHintUp) {
      ; (this as WarehouseSceneLike).dom.revealHintUp.classList.add("hidden")
    }
    if ((this as WarehouseSceneLike).dom.revealHintDown) {
      ; (this as WarehouseSceneLike).dom.revealHintDown.classList.add("hidden")
    }
    ; (this as WarehouseSceneLike).pendingRevealHintTargets = null
      ; (this as WarehouseSceneLike).pendingRevealHintText = ""
      ; (this as WarehouseSceneLike).pendingRevealHintSeenIds = null
  },

  showRevealScrollHintsForTargets(targets: Artifact[], message: string) {
    if (!targets || targets.length === 0) {
      return
    }

    ; (this as WarehouseSceneLike).pendingRevealHintTargets = targets
      ; (this as WarehouseSceneLike).pendingRevealHintText = message
      ; (this as WarehouseSceneLike).pendingRevealHintSeenIds = new Set()
    this.refreshRevealScrollHints()
  },

  refreshRevealScrollHints() {
    if (!(this as WarehouseSceneLike).dom.gameRoot || !(this as WarehouseSceneLike).pendingRevealHintTargets || (this as WarehouseSceneLike).pendingRevealHintTargets.length === 0) {
      return
    }

    const canvasEl = (this as WarehouseSceneLike).dom.gameRoot.querySelector("canvas")
    const canvasRenderHeight = canvasEl ? canvasEl.getBoundingClientRect().height : (this as WarehouseSceneLike).dom.gameRoot.scrollHeight
    const scaleRatio = canvasRenderHeight > 0 ? canvasRenderHeight / CANVAS_NATIVE_HEIGHT : 1

    const viewportTop = (this as WarehouseSceneLike).dom.gameRoot.scrollTop
    const viewportBottom = viewportTop + (this as WarehouseSceneLike).dom.gameRoot.clientHeight

      ; (this as WarehouseSceneLike).pendingRevealHintTargets.forEach((item: Artifact) => {
        const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio
        const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio
        if (top < viewportBottom && bottom > viewportTop) {
          ; (this as WarehouseSceneLike).pendingRevealHintSeenIds.add(item.id)
        }
      })

    if ((this as WarehouseSceneLike).pendingRevealHintSeenIds.size >= (this as WarehouseSceneLike).pendingRevealHintTargets.length) {
      this.hideRevealScrollHints()
      return
    }

    let hasAbove = false
    let hasBelow = false

      ; (this as WarehouseSceneLike).pendingRevealHintTargets.forEach((item: Artifact) => {
        if ((this as WarehouseSceneLike).pendingRevealHintSeenIds.has(item.id)) {
          return
        }
        const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio
        const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio
        if (bottom <= viewportTop) {
          hasAbove = true
        } else if (top >= viewportBottom) {
          hasBelow = true
        }
      })

    const baseTop = viewportTop + 8
    if ((this as WarehouseSceneLike).dom.revealHintUp) {
      ; (this as WarehouseSceneLike).dom.revealHintUp.style.top = `${baseTop}px`
        ; (this as WarehouseSceneLike).dom.revealHintUp.textContent = `${(this as WarehouseSceneLike).pendingRevealHintText}（上方）`
        ; (this as WarehouseSceneLike).dom.revealHintUp.classList.toggle("hidden", !hasAbove)
    }
    if ((this as WarehouseSceneLike).dom.revealHintDown) {
      ; (this as WarehouseSceneLike).dom.revealHintDown.style.top = `${baseTop + 36}px`
        ; (this as WarehouseSceneLike).dom.revealHintDown.textContent = `${(this as WarehouseSceneLike).pendingRevealHintText}（下方）`
        ; (this as WarehouseSceneLike).dom.revealHintDown.classList.toggle("hidden", !hasBelow)
    }

    if (!hasAbove && !hasBelow) {
      this.hideRevealScrollHints()
    }
  },

  pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy }: { mode: string; count: number; category: string | null; allowCategoryFallback: boolean; sortStrategy: string | null }): Artifact[] {
    const primary = (this as WarehouseSceneLike).items.filter((item: Artifact) => {
      if (category && item.category !== category) {
        return false
      }
      if (mode === "outline") {
        return !item.revealed.outline
      }
      return !item.revealed.qualityCell
    })

    const sortByArea = (arr: Artifact[], strategy: string | null) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a: Artifact, b: Artifact) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a: Artifact, b: Artifact) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let pool = sortByArea(primary, sortStrategy)

    let selected = pool.slice(0, count)
    if (selected.length < count && allowCategoryFallback && category) {
      const existedIds = new Set(selected.map((item: Artifact) => item.id))
      const fallback = (this as WarehouseSceneLike).items.filter((item: Artifact) => {
        if (existedIds.has(item.id)) {
          return false
        }
        if (mode === "outline") {
          return !item.revealed.outline
        }
        return !item.revealed.qualityCell
      })

      selected = selected.concat(sortByArea(fallback, sortStrategy).slice(0, count - selected.length))
    }

    return selected
  },

  revealOutline(item: Artifact, options: Record<string, unknown> = {}) {
    if (item.revealed.outline) {
      return
    }

    const { silhouette, border } = item.view
    silhouette.setFillStyle(0xe5d7bd, 0.26)
    border.setStrokeStyle(2, 0xc8b08a, 0.92)

    if (item.revealed.qualityCell && !item.view.borderPulseStarted) {
      item.view.borderPulseStarted = true
      border.setStrokeStyle(3, item.quality.color, 1)
        ; (this as WarehouseSceneLike).tweens.add({
          targets: border,
          alpha: { from: 1, to: 0.35 },
          duration: qualityPulseDuration(item.qualityKey),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        })
    }

    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        this.revealCell(x, y)
      }
    }

    item.revealed.outline = true
    this.drawGridLines()

    if (!options.skipEffects) {
      this.playOutlineRevealEffect(item)
    }

    if (item.revealed.qualityCell) {
      this.syncQualityMarkersForOutlinedItem(item, options)
    }
  },

  revealQualityCell(item: Artifact, options: Record<string, unknown> = {}) {
    if (item.revealed.qualityCell) {
      return
    }

    const cells: { x: number; y: number }[] = []
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        cells.push({ x, y })
      }
    }

    const chosen = cells[Math.floor(Math.random() * cells.length)]
    this.revealCell(chosen.x, chosen.y)
    item.revealed.qualityCell = chosen
    this.renderQualityVisual(item, options)

    if (!options.skipEffects) {
      this.playQualityRevealEffect(item)
    }

    if (item.revealed.outline) {
      this.syncQualityMarkersForOutlinedItem(item, options)
    }
  },

  playOutlineRevealEffect(item: Artifact) {
    const { border } = item.view
    const pixelX = MARGIN + item.x * CELL_SIZE
    const pixelY = MARGIN + item.y * CELL_SIZE
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE
    const cx = pixelX + width / 2
    const cy = pixelY + height / 2

    if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
      ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("reveal-flash")
      void (this as WarehouseSceneLike).dom.gameRoot.offsetWidth
        ; (this as WarehouseSceneLike).dom.gameRoot.classList.add("reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("reveal-flash")
        }
      }, 600)
    }

    border.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: border,
        alpha: { from: 0, to: 1 },
        duration: 180,
        ease: "Sine.easeOut"
      })

    const pulseRing = (this as WarehouseSceneLike).add.rectangle(cx, cy, width, height)
    pulseRing.setOrigin(0.5, 0.5)
    pulseRing.setStrokeStyle(3, 0xc8b08a, 0.8)
    pulseRing.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: pulseRing,
        scaleX: { from: 0.85, to: 1.08 },
        scaleY: { from: 0.85, to: 1.08 },
        alpha: { from: 0.8, to: 0 },
        duration: 400,
        ease: "Sine.easeOut",
        onComplete: () => pulseRing.destroy()
      })

    const flashOverlay = (this as WarehouseSceneLike).add.rectangle(cx, cy, width, height, 0xffffff, 0.5)
    flashOverlay.setOrigin(0.5, 0.5)
    flashOverlay.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: flashOverlay,
        scaleX: { from: 0.8, to: 1.05 },
        scaleY: { from: 0.8, to: 1.05 },
        alpha: { from: 0.6, to: 0 },
        duration: 400,
        ease: "Sine.easeOut",
        onComplete: () => flashOverlay.destroy()
      })

    const lightSweep = (this as WarehouseSceneLike).add.graphics()
    lightSweep.setAlpha(0)
    lightSweep.fillStyle(0xffffff, 0.35)
    lightSweep.fillRect(pixelX, pixelY, width, height)
    lightSweep.setBlendMode(Phaser.BlendModes.ADD)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: lightSweep,
        alpha: { from: 0.7, to: 0 },
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => lightSweep.destroy()
      })
  },

  playQualityRevealEffect(item: Artifact) {
    const qualityColor = item.quality.color
    const hasOutline = item.revealed.outline
    let pixelX: number, pixelY: number, areaW: number, areaH: number

    if (hasOutline) {
      pixelX = MARGIN + item.x * CELL_SIZE
      pixelY = MARGIN + item.y * CELL_SIZE
      areaW = item.w * CELL_SIZE
      areaH = item.h * CELL_SIZE
    } else {
      pixelX = MARGIN + item.revealed.qualityCell.x * CELL_SIZE
      pixelY = MARGIN + item.revealed.qualityCell.y * CELL_SIZE
      areaW = CELL_SIZE
      areaH = CELL_SIZE
    }

    const cx = pixelX + areaW / 2
    const cy = pixelY + areaH / 2

    if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
      ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("quality-reveal-flash")
      void (this as WarehouseSceneLike).dom.gameRoot.offsetWidth
        ; (this as WarehouseSceneLike).dom.gameRoot.classList.add("quality-reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot.classList.remove("quality-reveal-flash")
        }
      }, 700)
    }

    const burstSize = Math.max(areaW, areaH) * 0.7
    const burstRing = (this as WarehouseSceneLike).add.rectangle(cx, cy, burstSize, burstSize, qualityColor, 0.7)
    burstRing.setOrigin(0.5, 0.5)
    burstRing.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: burstRing,
        scaleX: { from: 0.3, to: 1.3 },
        scaleY: { from: 0.3, to: 1.3 },
        alpha: { from: 0.6, to: 0 },
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => burstRing.destroy()
      })

    const qualityFlash = (this as WarehouseSceneLike).add.rectangle(cx, cy, areaW, areaH, qualityColor, 0.5)
    qualityFlash.setOrigin(0.5, 0.5)
    qualityFlash.setAlpha(0)
      ; (this as WarehouseSceneLike).tweens.add({
        targets: qualityFlash,
        scaleX: { from: 0.8, to: 1.08 },
        scaleY: { from: 0.8, to: 1.08 },
        alpha: { from: 0.55, to: 0 },
        duration: 500,
        ease: "Sine.easeOut",
        onComplete: () => qualityFlash.destroy()
      })

    if (item.view.artifactImage) {
      const img = item.view.artifactImage
      const baseScale = img.scaleX

      img.setAlpha(0)
      img.setScale(baseScale * 0.85)

        ; (this as WarehouseSceneLike).tweens.add({
          targets: img,
          alpha: 1,
          duration: 300,
          ease: "Sine.easeIn"
        })

        ; (this as WarehouseSceneLike).tweens.add({
          targets: img,
          scaleX: baseScale * 1.1,
          scaleY: baseScale * 1.1,
          duration: 200,
          ease: "Sine.easeOut",
          onComplete: () => {
            ; (this as WarehouseSceneLike).tweens.add({
              targets: img,
              scaleX: baseScale,
              scaleY: baseScale,
              duration: 150,
              ease: "Sine.easeInOut"
            })
          }
        })
    }
  },

  clearQualityVisual(item: Artifact, keepImage: boolean = false) {
    if (!item.view) {
      return
    }

    if (item.view.qualityGlowTween) {
      item.view.qualityGlowTween.stop()
      item.view.qualityGlowTween = null
    }

    if (keepImage && item.view.artifactImage) {
      const img = item.view.artifactImage
      item.view.qualityMarkers.remove(img, false)
      item.view.qualityMarkers.removeAll(true)
      item.view.qualityMarkers.add(img)
    } else {
      item.view.qualityMarkers.removeAll(true)
      item.view.artifactImage = null
    }
  },

  renderQualityVisual(item: Artifact, options: Record<string, unknown> = {}) {
    if (!item.revealed.qualityCell) {
      return
    }

    const hasExistingImage = !!item.view.artifactImage
    const existingScale = hasExistingImage
      ? { x: item.view.artifactImage.scaleX, y: item.view.artifactImage.scaleY }
      : null

    this.clearQualityVisual(item, hasExistingImage)

    let markerX: number
    let markerY: number
    let markerW: number
    let markerH: number

    if (item.revealed.outline && item.w * item.h > 1) {
      markerX = MARGIN + item.x * CELL_SIZE
      markerY = MARGIN + item.y * CELL_SIZE
      markerW = item.w * CELL_SIZE
      markerH = item.h * CELL_SIZE
    } else {
      markerX = MARGIN + item.revealed.qualityCell.x * CELL_SIZE
      markerY = MARGIN + item.revealed.qualityCell.y * CELL_SIZE
      markerW = CELL_SIZE
      markerH = CELL_SIZE
    }

    const isFullyRevealed = item.revealed.exact === true
    const shouldShowArtifactImage = (isFullyRevealed || (this as WarehouseSceneLike).isSettlementRevealMode) && item.key
    const textureKey = `artifact-${item.key}`
    const hasArtifactImage = shouldShowArtifactImage && (this as WarehouseSceneLike).textures.exists(textureKey)
    const skipImage = options.settlementSkipImage === true

    if (hasArtifactImage && !skipImage) {
      if (hasExistingImage && item.view.artifactImage) {
        const artifactImage = item.view.artifactImage
        artifactImage.setPosition(markerX + markerW / 2, markerY + markerH / 2)
        artifactImage.setDisplaySize(markerW, markerH)
        if (existingScale) {
          artifactImage.setScale(existingScale.x, existingScale.y)
        }
      } else {
        const artifactImage = (this as WarehouseSceneLike).add.image(markerX + markerW / 2, markerY + markerH / 2, textureKey)
        artifactImage.setOrigin(0.5, 0.5)
        artifactImage.setDisplaySize(markerW, markerH)
        item.view.qualityMarkers.add(artifactImage)
        item.view.artifactImage = artifactImage
      }
    }

    const marker = (this as WarehouseSceneLike).add.rectangle(
      markerX + markerW / 2,
      markerY + markerH / 2,
      markerW,
      markerH,
      item.quality.color,
      hasArtifactImage ? 0.35 : 0.45
    )
    marker.setOrigin(0.5, 0.5)
    marker.setStrokeStyle(2, item.quality.color, 1)
    marker.setScale(0)

    item.view.qualityMarkers.add(marker)

      ; (this as WarehouseSceneLike).tweens.add({
        targets: marker,
        scaleX: { from: 0, to: 1.15 },
        scaleY: { from: 0, to: 1.15 },
        duration: 250,
        ease: "Back.easeOut",
        onComplete: () => {
          ; (this as WarehouseSceneLike).tweens.add({
            targets: marker,
            scaleX: 1,
            scaleY: 1,
            duration: 120,
            ease: "Sine.easeOut"
          })
        }
      })

    item.view.qualityGlowTween = (this as WarehouseSceneLike).tweens.add({
      targets: marker,
      alpha: { from: hasArtifactImage ? 0.35 : 0.45, to: hasArtifactImage ? 0.55 : 0.7 },
      duration: qualityPulseDuration(item.qualityKey),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    }) as Phaser.Tweens.Tween;

    if (item.revealed.outline && !item.view.borderPulseStarted) {
      item.view.border.setStrokeStyle(3, item.quality.color, 1)
      item.view.borderPulseStarted = true
        ; (this as WarehouseSceneLike).tweens.add({
          targets: item.view.border,
          alpha: { from: 1, to: 0.35 },
          duration: qualityPulseDuration(item.qualityKey),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        })
    }
  },

  syncQualityMarkersForOutlinedItem(item: Artifact, options: Record<string, unknown> = {}) {
    if (!item.revealed.outline || !item.revealed.qualityCell || item.view.qualitySynced) {
      return
    }

    item.view.qualitySynced = true
    const showName =
      options.settlementShowName === true ? true : options.settlementShowName === false ? false : undefined
    this.renderQualityVisual(item, {
      showName,
      settlementSkipImage: options.settlementSkipImage
    })
  },

  revealCell(col: number, row: number) {
    if ((this as WarehouseSceneLike).revealedCells[row][col]) {
      return
    }

    ; (this as WarehouseSceneLike).revealedCells[row][col] = true
    const x = MARGIN + col * CELL_SIZE
    const y = MARGIN + row * CELL_SIZE

      ; (this as WarehouseSceneLike).revealCellLayer.fillStyle(0xf1e6cc, 0.2)
      ; (this as WarehouseSceneLike).revealCellLayer.fillRect(x, y, CELL_SIZE, CELL_SIZE)
  }
}

export const WarehousePreviewMixin = {
  positionPreview(canvasX: number, canvasY: number) {
    ; (this as WarehouseSceneLike).previewAnchor = { x: canvasX, y: canvasY }
    const pop = (this as WarehouseSceneLike).dom.previewPopover
    pop.classList.remove("hidden")
      ; (this as WarehouseSceneLike).previewOpenTick = Date.now()

    this.applyPreviewPosition()
  },

  applyPreviewPosition() {
    const pop = (this as WarehouseSceneLike).dom.previewPopover
    if (pop.classList.contains("hidden") || !(this as WarehouseSceneLike).previewAnchor) {
      return
    }

    const isMobile = window.innerWidth <= 600
    if (isMobile) {
      pop.style.left = ""
      pop.style.top = ""
      pop.style.maxHeight = ""
      return
    }

    const canvasX = (this as WarehouseSceneLike).previewAnchor.x
    const canvasY = (this as WarehouseSceneLike).previewAnchor.y

    const root = (this as WarehouseSceneLike).dom.gameRoot
    const pad = 10
    const maxPopoverHeight = Math.min(320, Math.max(180, root.clientHeight - pad * 2))
    pop.style.maxHeight = `${Math.round(maxPopoverHeight)}px`

    const popWidth = pop.offsetWidth || 460
    const popHeight = pop.offsetHeight || 360
    const viewLeft = root.scrollLeft
    const viewTop = root.scrollTop
    const viewRight = viewLeft + root.clientWidth
    const viewBottom = viewTop + root.clientHeight

    const rightSpace = viewRight - canvasX - pad
    const leftSpace = canvasX - viewLeft - pad
    const downSpace = viewBottom - canvasY - pad
    const upSpace = canvasY - viewTop - pad

    let left = rightSpace >= popWidth || rightSpace >= leftSpace ? canvasX + 18 : canvasX - popWidth - 18
    let top = downSpace >= popHeight || downSpace >= upSpace ? canvasY + 18 : canvasY - popHeight - 18

    left = clamp(left, viewLeft + pad, Math.max(viewLeft + pad, viewRight - popWidth - pad))
    top = clamp(top, viewTop + pad, Math.max(viewTop + pad, viewBottom - popHeight - pad))

    pop.style.left = `${Math.round(left)}px`
    pop.style.top = `${Math.round(top)}px`
  },

  repositionPreview() {
    if ((this as WarehouseSceneLike).dom.previewPopover.classList.contains("hidden")) {
      return
    }

    window.requestAnimationFrame(() => {
      this.applyPreviewPosition()
    })
  },

  hidePreview() {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow.style.display = "flex"
    }
    ; (this as WarehouseSceneLike).dom.previewPopover.classList.add("hidden")
      ; (this as WarehouseSceneLike).dom.previewList.innerHTML = ""
      ; (this as WarehouseSceneLike).dom.previewHint.textContent = ""
      ; (this as WarehouseSceneLike).input.setDefaultCursor("default")
  },

  setupPreviewTouchScroll() {
    const pop = (this as WarehouseSceneLike).dom.previewPopover
    if (!pop) return
    let isDraggingToClose = false
    let dragStartY = 0

    pop.addEventListener(
      "touchstart",
      (e: TouchEvent) => {
        if (e.touches.length === 1) {
          dragStartY = e.touches[0].clientY
          isDraggingToClose = pop.scrollTop <= 0
        }
      },
      { passive: true } as EventListenerOptions
    )

    pop.addEventListener(
      "touchmove",
      (e: TouchEvent) => {
        if (e.touches.length !== 1) return
        const currentY = e.touches[0].clientY
        if (isDraggingToClose && currentY - dragStartY > 60) {
          this.hidePreview()
          return
        }
      },
      { passive: true } as EventListenerOptions
    )
  },

  isPointOnSettlementLockedItem(x: number, y: number): boolean {
    if (!(this as WarehouseSceneLike).items || (this as WarehouseSceneLike).items.length === 0) {
      return false
    }

    return (this as WarehouseSceneLike).items.some((item: Artifact) => {
      if (!item.revealed || (!item.revealed.qualityCell && !item.revealed.exact)) {
        return false
      }

      const left = MARGIN + item.x * CELL_SIZE
      const top = MARGIN + item.y * CELL_SIZE
      const right = left + item.w * CELL_SIZE
      const bottom = top + item.h * CELL_SIZE
      return x >= left && x <= right && y >= top && y <= bottom
    })
  },

  renderPreviewCandidates(item: Artifact) {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow.style.display = "flex"
    }
    ; (this as WarehouseSceneLike).dom.previewTitle.style.display = ""
      ; (this as WarehouseSceneLike).dom.previewHint.style.display = ""
    const qualityKey = item.revealed.qualityCell ? item.qualityKey : null
    const sizeTag = item.revealed.outline ? toSizeTag(item.w, item.h) : null
    const selectedCategory = ((this as WarehouseSceneLike).dom.previewCategorySelect as HTMLSelectElement).value
    const category = selectedCategory === "all" ? null : selectedCategory

    const candidates = (this as WarehouseSceneLike).artifactManager.getCandidatesByRevealState({
      qualityKey,
      sizeTag,
      category
    })

    if (item.revealed.outline && item.revealed.qualityCell && candidates.length === 1) {
      item.revealed.exact = true
    }

    const libStats = (this as WarehouseSceneLike).artifactManager.getLibraryStats()
      ; (this as WarehouseSceneLike).dom.previewTitle.textContent = `可能藏品预览（候选 ${candidates.length}/${libStats.total}）`
      ; (this as WarehouseSceneLike).dom.previewHint.textContent = `已知线索：${this.getItemKnownText(item)}；藏品库总数 ${libStats.total} 件；若仅有品质线索，候选会接近全库；默认按估算价从高到低。`

    if (candidates.length === 0) {
      ; (this as WarehouseSceneLike).dom.previewList.innerHTML = '<div class="preview-item">无符合候选</div>'
      return
    }

    const sorted = [...candidates].sort((a: Artifact, b: Artifact) => b.expectedPrice - a.expectedPrice)
    const html = sorted
      .map((candidate: Artifact) => {
        const candidateQuality = QUALITY_CONFIG[candidate.qualityKey]
        const qualityText = candidateQuality ? candidateQuality.label : "未知"
        const sizeText = candidate.previewSizeTag || "未知"
        const imgSrc = `assets/images/artifacts/thumbs/${candidate.key}.png`
        const qualityColor = candidateQuality ? rgbHex(candidateQuality.color) : "#9f9f9f"
        return `<article class="preview-item"><div class="preview-thumb preview-thumb-large" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${candidate.name}" onerror="this.style.display='none'"/></div><strong>${candidate.name}</strong><br/>品类: ${candidate.category} | 品质: ${qualityText}<br/>基础价: ${candidate.basePrice} | 估算价: ${candidate.expectedPrice}</article>`
      })
      .join("")

      ; (this as WarehouseSceneLike).dom.previewList.innerHTML = html
    this.repositionPreview()
  },

  renderSettlementItemPreview(item: Artifact) {
    if ((this as WarehouseSceneLike).dom.previewFilterRow) {
      ; (this as WarehouseSceneLike).dom.previewFilterRow.style.display = "none"
    }
    ; (this as WarehouseSceneLike).dom.previewTitle.style.display = "none"
      ; (this as WarehouseSceneLike).dom.previewHint.style.display = "none"
    const imgSrc = `assets/images/artifacts/thumbs/${item.key}.png`
    const qualityColor = rgbHex(item.quality.color)
    const qualityLabel = item.quality.label || "未知"
      ; (this as WarehouseSceneLike).dom.previewList.innerHTML = [
        '<article class="preview-item settlement-detail">',
        `<div class="preview-thumb" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none'"/></div>`,
        '<div class="settlement-detail-content">',
        `<strong>${item.name}</strong>`,
        `<div class="detail-row"><span class="detail-label">品类</span><span class="detail-value">${item.category}</span></div>`,
        `<div class="detail-row"><span class="detail-label">品质</span><span class="detail-value" style="color: ${qualityColor}">${qualityLabel}</span></div>`,
        `<div class="detail-row"><span class="detail-label">基础价</span><span class="detail-value">${item.basePrice}</span></div>`,
        `<div class="detail-row"><span class="detail-label">揭示价值</span><span class="detail-value highlight">${item.trueValue}</span></div>`,
        "</div>",
        "</article>"
      ].join("")
    this.repositionPreview()
  }
}
