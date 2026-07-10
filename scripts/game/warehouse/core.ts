import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"
import type { WarehouseSceneLike } from "./types"
import {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE
} from "../core/constants"
import { toCellKey } from "../core/utils"
import { ARTIFACT_LIBRARY } from "../data/artifacts"
import { findFirstEmptySlot, isInBoundsCell, hasAnyInfo, getItemKnownText } from "./index"

const ARTIFACT_IMAGE_BASE_PATH = "assets/images/artifacts/thumbs/"

export const WarehouseCoreMixin: ThisType<WarehouseSceneThis> = {
  preloadArtifactImages() {
    if (!ARTIFACT_LIBRARY || !Array.isArray(ARTIFACT_LIBRARY)) {
      return
    }
    const toLoad: string[] = []
    ARTIFACT_LIBRARY.forEach((artifact) => {
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

    console.log(`[藏品图片] 开始加载 ${toLoad.length} 张图片:`, toLoad);

    (this as WarehouseSceneLike).load.on("progress", (value: number) => {
      console.log(`[藏品图片] 加载进度: ${Math.round(value * 100)}%`)
    });

    (this as WarehouseSceneLike).load.on("complete", () => {
      console.log("[藏品图片] 全部加载完成")
      ARTIFACT_LIBRARY.forEach((artifact) => {
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

  drawUnknownWarehouse() {
    if ((this as WarehouseSceneLike).gridLayer) {
      ; (this as WarehouseSceneLike).gridLayer?.destroy()
    }
    if ((this as WarehouseSceneLike).revealCellLayer) {
      ; (this as WarehouseSceneLike).revealCellLayer?.destroy()
    }

    ; (this as WarehouseSceneLike).gridLayer = (this as WarehouseSceneLike).add.graphics()

    for (let col = 1; col < GRID_COLS; col++) {
      const x = MARGIN + col * CELL_SIZE
        ; (this as WarehouseSceneLike).gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
        ; (this as WarehouseSceneLike).gridLayer!.lineBetween(x, MARGIN, x, MARGIN + GRID_ROWS * CELL_SIZE)
    }
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = MARGIN + row * CELL_SIZE
        ; (this as WarehouseSceneLike).gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
        ; (this as WarehouseSceneLike).gridLayer!.lineBetween(MARGIN, y, MARGIN + GRID_COLS * CELL_SIZE, y)
    }

    ; (this as WarehouseSceneLike).revealCellLayer = (this as WarehouseSceneLike).add.graphics()
      ; (this as WarehouseSceneLike).revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

      ; (this as WarehouseSceneLike).time.delayedCall(100, () => {
        this.preloadArtifactImages()
      })
  },

  drawGridLines() {
    if (!(this as WarehouseSceneLike).gridLayer) return
      ; (this as WarehouseSceneLike).gridLayer!.clear()

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
            ; (this as WarehouseSceneLike).gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
            ; (this as WarehouseSceneLike).gridLayer!.lineBetween(x, y1, x, y2)
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
            ; (this as WarehouseSceneLike).gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
            ; (this as WarehouseSceneLike).gridLayer!.lineBetween(x1, y, x2, y)
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

  spawnRandomItems() {
    if ((this as WarehouseSceneLike).itemLayer) {
      ; (this as WarehouseSceneLike).itemLayer?.destroy()
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
    return findFirstEmptySlot(occupancy, GRID_ROWS, GRID_COLS)
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
    return isInBoundsCell(x, y, GRID_COLS, GRID_ROWS)
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

      ; (this as WarehouseSceneLike).itemLayer!.add([silhouette, border, qualityMarkers, clickZone])
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
    return hasAnyInfo(item)
  },

  getItemKnownText(item: Artifact): string {
    return getItemKnownText(item)
  }
}
