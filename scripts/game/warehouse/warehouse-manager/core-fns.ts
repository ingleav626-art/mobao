/**
 * @file warehouse-manager/core-fns.ts
 * @module warehouse/warehouse-manager/core-fns
 * @description WarehouseManager 的 core 域方法，抽取为独立函数。
 *             每个函数第一个参数为 deps: WarehouseManagerDeps，后续为原方法参数。
 */
import type { Artifact } from "../../../../types/game"
import type { WarehouseManagerDeps } from "./types"
import {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE
} from "../../core/constants"
import { toCellKey } from "../../core/utils"
import { ARTIFACT_LIBRARY } from "../../data/artifacts"
import { findFirstEmptySlot, isInBoundsCell, hasAnyInfo, getItemKnownText } from "../index"
import { positionPreview, renderSettlementItemPreview, renderPreviewCandidates } from "./preview-fns"

const ARTIFACT_IMAGE_BASE_PATH = "assets/images/artifacts/thumbs/"

/** 预加载藏品缩略图 */
export function preloadArtifactImages(deps: WarehouseManagerDeps): void {
  if (!ARTIFACT_LIBRARY || !Array.isArray(ARTIFACT_LIBRARY)) {
    return
  }
  const toLoad: string[] = []
  ARTIFACT_LIBRARY.forEach((artifact: { key: string }) => {
    const textureKey = `artifact-${artifact.key}`
    if (!deps.getTextures().exists(textureKey)) {
      deps.getLoad().image(textureKey, ARTIFACT_IMAGE_BASE_PATH + artifact.key + ".png")
      toLoad.push(artifact.key)
    }
  })

  if (toLoad.length === 0) {
    console.log("[藏品图片] 所有图片已缓存，无需加载")
    return
  }

  console.log(`[藏品图片] 开始加载 ${toLoad.length} 张图片:`, toLoad)

  deps.getLoad().on("progress", (value: number) => {
    console.log(`[藏品图片] 加载进度: ${Math.round(value * 100)}%`)
  })

  deps.getLoad().on("complete", () => {
    console.log("[藏品图片] 全部加载完成")
    ARTIFACT_LIBRARY.forEach((artifact: { key: string }) => {
      const textureKey = `artifact-${artifact.key}`
      const texture = deps.getTextures().get(textureKey)
      if (texture && texture.frames) {
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
      }
    })
  })

  deps.getLoad().on("load", (file: { key: string }) => {
    console.log(`[藏品图片] 已加载: ${file.key}`)
  })

  deps.getLoad().on("loaderror", (file: { key: string; src?: string }) => {
    console.warn(`[藏品图片] 加载失败: ${file.key}`, file.src)
  })

  deps.getLoad().start()
}

/** 绘制未知仓库网格（初始状态，所有格子未揭示） */
export function drawUnknownWarehouse(deps: WarehouseManagerDeps): void {
  if (deps.state.gridLayer) {
    deps.state.gridLayer?.destroy()
  }
  if (deps.state.revealCellLayer) {
    deps.state.revealCellLayer?.destroy()
  }

  deps.state.gridLayer = deps.getAdd().graphics()

  for (let col = 1; col < GRID_COLS; col++) {
    const x = MARGIN + col * CELL_SIZE
    deps.state.gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
    deps.state.gridLayer!.lineBetween(x, MARGIN, x, MARGIN + GRID_ROWS * CELL_SIZE)
  }
  for (let row = 1; row < GRID_ROWS; row++) {
    const y = MARGIN + row * CELL_SIZE
    deps.state.gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
    deps.state.gridLayer!.lineBetween(MARGIN, y, MARGIN + GRID_COLS * CELL_SIZE, y)
  }

  deps.state.revealCellLayer = deps.getAdd().graphics()
  deps.state.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

  deps.getTime().delayedCall(100, () => {
    preloadArtifactImages(deps)
  })
}

/** 重绘网格线（跳过已揭示藏品占据的格线） */
export function drawGridLines(deps: WarehouseManagerDeps): void {
  if (!deps.state.gridLayer) return
  deps.state.gridLayer!.clear()

  const occupied = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
  for (const item of deps.state.items) {
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
        deps.state.gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
        deps.state.gridLayer!.lineBetween(x, y1, x, y2)
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
        deps.state.gridLayer!.lineStyle(1, 0x9f8a6a, 0.4)
        deps.state.gridLayer!.lineBetween(x1, y, x2, y)
      }
    }
  }
}

/** 校验仓库容量不超上限 */
export function guardWarehouseCapacity(_deps: WarehouseManagerDeps): void {
  const capacity = GRID_COLS * GRID_ROWS
  if (capacity > MAX_WAREHOUSE_CELLS) {
    throw new Error(`仓库容量超上限：${capacity} > ${MAX_WAREHOUSE_CELLS}，请调整 GRID_COLS / GRID_ROWS / CELL_SIZE。`)
  }
}

/** 随机生成藏品并放置到仓库网格 */
export function spawnRandomItems(deps: WarehouseManagerDeps): void {
  if (deps.state.itemLayer) {
    deps.state.itemLayer?.destroy()
  }

  deps.state.itemLayer = deps.getAdd().container(0, 0)
  deps.state.items = []

  const occupancy = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
  const capacity = GRID_COLS * GRID_ROWS
  const targetOccupiedCells = Math.round(
    capacity * Phaser.Math.FloatBetween(WAREHOUSE_OCCUPANCY_RATIO_RANGE.min, WAREHOUSE_OCCUPANCY_RATIO_RANGE.max)
  )
  let occupiedCellsCount = 0
  const desiredCount = Phaser.Math.Between(ARTIFACT_COUNT_RANGE.min, ARTIFACT_COUNT_RANGE.max)

  let attempts = 0
  while (deps.state.items.length < desiredCount && attempts < 520 && occupiedCellsCount < targetOccupiedCells) {
    attempts += 1
    const slot = findFirstEmptySlot(occupancy, GRID_ROWS, GRID_COLS)
    if (!slot) {
      break
    }

    const item = deps.artifactManager.createRandomArtifactForSlot({
      col: slot.col,
      row: slot.row,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      occupancy,
      categoryWeights: deps.getMapCategoryWeights() || undefined,
      qualityWeights: deps.getMapQualityWeights() || undefined
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

    placeItem(item, slot, occupancy)
    renderItem(deps, item)
    deps.state.items.push(item)
    occupiedCellsCount += item.w * item.h
  }
}

/** 设置仓库拍卖参数（真实价值、AI 最高出价、当前出价） */
export function setupWarehouseAuction(deps: WarehouseManagerDeps): void {
  deps.state.warehouseTrueValue = deps.state.items.reduce((sum: number, item: Artifact) => sum + item.trueValue, 0)
  const aiRatio = Phaser.Math.FloatBetween(0.9, 1.12)
  deps.state.aiMaxBid = Math.round(deps.state.warehouseTrueValue * aiRatio)
  deps.state.currentBid = Math.max(1000, Math.round((deps.state.warehouseTrueValue * 0.18) / 100) * 100)
  const bidInput = deps.dom.bidInput as HTMLInputElement
  bidInput.value = deps.getRound() <= 1 ? "" : "0"
  bidInput.placeholder = deps.getRound() <= 1 ? "点击出价" : ""
}

/** 放置藏品到指定槽位并标记占用 */
export function placeItem(item: Artifact, slot: { col: number; row: number }, occupancy: boolean[][]): void {
  item.x = slot.col
  item.y = slot.row

  for (let y = slot.row; y < slot.row + item.h; y += 1) {
    for (let x = slot.col; x < slot.col + item.w; x += 1) {
      occupancy[y][x] = true
    }
  }
}

/** 重建仓库格子索引（坐标 -> 藏品 ID 映射） */
export function rebuildWarehouseCellIndex(deps: WarehouseManagerDeps): void {
  deps.state.warehouseCellIndex = {}
  deps.state.items.forEach((item: Artifact) => {
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        deps.state.warehouseCellIndex[toCellKey(x, y)] = item.id
      }
    }
  })
}

/** 判断仓库格子是否被藏品占据 */
export function isWarehouseCellOccupied(deps: WarehouseManagerDeps, x: number, y: number): boolean {
  if (!isInBoundsCell(x, y, GRID_COLS, GRID_ROWS)) {
    return false
  }
  return Boolean(deps.state.warehouseCellIndex[toCellKey(x, y)])
}

/** 渲染单个藏品（创建剪影、边框、品质标记容器、点击区域） */
export function renderItem(deps: WarehouseManagerDeps, item: Artifact): void {
  const pixelX = Math.round(MARGIN + item.x * CELL_SIZE)
  const pixelY = Math.round(MARGIN + item.y * CELL_SIZE)
  const width = item.w * CELL_SIZE
  const height = item.h * CELL_SIZE

  const silhouette = deps.getAdd().rectangle(pixelX, pixelY, width, height, 0xe5d7bd, 0)
  silhouette.setOrigin(0, 0)

  const border = deps.getAdd().rectangle(pixelX, pixelY, width, height)
  border.setOrigin(0, 0)
  border.setStrokeStyle(3, item.quality.color, 0)

  const qualityMarkers = deps.getAdd().container(0, 0)
  const clickZone = deps.getAdd().zone(pixelX, pixelY, width, height).setOrigin(0, 0)
  clickZone.setInteractive({ useHandCursor: false })

  clickZone.on("pointerover", () => {
    if (hasAnyInfo(item)) {
      deps.getInput().setDefaultCursor("pointer")
    } else {
      deps.getInput().setDefaultCursor("default")
    }
  })

  clickZone.on("pointerout", () => {
    deps.getInput().setDefaultCursor("default")
  })

  const TAP_THRESHOLD = 15
  const TAP_TIME_THRESHOLD = 250

  clickZone.on(
    "pointerup",
    (pointer: { x: number; y: number; downX: number; downY: number; upTime: number; downTime: number }) => {
      const dx = Math.abs(pointer.x - pointer.downX)
      const dy = Math.abs(pointer.y - pointer.downY)
      const dt = pointer.upTime - pointer.downTime

      if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD && dt < TAP_TIME_THRESHOLD) {
        onArtifactClicked(deps, item, pointer)
      }
    }
  )

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

  deps.state.itemLayer!.add([silhouette, border, qualityMarkers, clickZone])
}

/** 藏品点击处理（结算查看 / 候选预览） */
export function onArtifactClicked(deps: WarehouseManagerDeps, item: Artifact, pointer: { x: number; y: number }): void {
  if (
    !deps.dom.bidKeypad?.classList.contains("hidden") ||
    (deps.dom.itemDrawer && !deps.dom.itemDrawer?.classList.contains("hidden"))
  ) {
    return
  }

  if (deps.isSettlementPageActive()) {
    if (!item.revealed.outline) {
      return
    }
    deps.state.selectedItem = item
    positionPreview(deps, pointer.x, pointer.y)
    renderSettlementItemPreview(deps, item)
    deps.writeLog(`结算查看：${item.name}（价值 ${item.trueValue}）`)
    return
  }

  if (deps.getSettled() || deps.getRoundResolving()) {
    return
  }

  if (!hasAnyInfo(item)) {
    deps.writeLog("该藏品尚无任何线索，无法进行候选预览。")
    return
  }

  if (!item.revealed.outline && item.revealed.qualityCell) {
    const clickCellX = Math.floor((pointer.x - MARGIN) / CELL_SIZE)
    const clickCellY = Math.floor((pointer.y - MARGIN) / CELL_SIZE)
    const qc = item.revealed.qualityCell
    if (clickCellX !== qc.x || clickCellY !== qc.y) {
      deps.writeLog("只能点击已揭示的品质格来预览候选。")
      return
    }
  }

  deps.state.selectedItem = item
  ;(deps.dom.previewCategorySelect as HTMLSelectElement).value = "all"
  positionPreview(deps, pointer.x, pointer.y)
  renderPreviewCandidates(deps, item)

  const info = getItemKnownText(item)
  deps.writeLog(`已打开候选预览：${info}。当前出价作用于整仓，不是单件。`)
  deps.updateHud()
}
