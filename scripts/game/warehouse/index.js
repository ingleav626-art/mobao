/**
 * @file warehouse/index.js
 * @module warehouse
 * @description 仓库核心系统。管理仓库网格的绘制、藏品生成与放置、揭示机制、
 *              候选预览等完整仓库逻辑。由三个 Mixin 组成，混入 Phaser Scene。
 *
 * 三个 Mixin：
 *
 * WarehouseCoreMixin（L19-L371）- 仓库核心：
 *   - preloadArtifactImages(): 预加载藏品缩略图（assets/images/artifacts/thumbs/）
 *   - drawUnknownWarehouse(): 绘制空白仓库网格（12×25×64px）
 *   - drawGridLines(): 智能网格线（已揭示区域不画内部分割线）
 *   - guardWarehouseCapacity(): 容量上限检查
 *   - spawnRandomItems(): 随机生成藏品（按占用率38%~88%，数量50~300）
 *   - setupWarehouseAuction(): 初始化拍卖参数（真实价值/AI最高出价/起始出价）
 *   - renderItem(item): 渲染单个藏品（轮廓/边框/品质标记/点击区域）
 *   - onArtifactClicked(item, pointer): 藏品点击处理（候选预览/结算查看）
 *   - rebuildWarehouseCellIndex(): 重建格子→藏品索引
 *   - placeItem / findFirstEmptySlot / isInBoundsCell / isWarehouseCellOccupied
 *
 * WarehouseRevealMixin（L373-L1095）- 揭示系统：
 *   - revealOutlineBatch(count, category, ...): 批量轮廓揭示
 *   - revealQualityBatch(count, category, ...): 批量品质揭示
 *   - revealArtifactFully(item): 完全揭示单件藏品（轮廓+品质+精确）
 *   - revealArtifactFullyBatch({ count, sortStrategy, ... }): 批量完全揭示
 *   - playFullRevealEffect(item): 完全揭示特效（外环扩散+内爆+边框淡入+图片弹入）
 *   - revealOutline / revealQualityCell / revealCell: 单件揭示基础方法
 *   - pickRevealTargets({ mode, count, category, ... }): 揭示目标选择（支持品类筛选/排序策略/回退）
 *   - renderQualityVisual(item): 品质视觉渲染（颜色边框+品质格+缩略图）
 *   - showRevealScrollHintsForTargets / refreshRevealScrollHints: 揭示位置滚动提示
 *
 * WarehousePreviewMixin（L1096-L1303）- 候选预览：
 *   - positionPreview / applyPreviewPosition: 预览弹窗定位（自动避免溢出）
 *   - renderPreviewCandidates(item): 渲染候选藏品列表（支持品类筛选/排序）
 *   - hidePreview / repositionPreview: 关闭和重新定位
 *   - setupPreviewTouchScroll: 触摸滚动支持
 *
 * 仓库网格参数（来自 MobaoConstants）：
 *   GRID_COLS=12, GRID_ROWS=25, CELL_SIZE=64, MARGIN=0
 *   CANVAS_NATIVE_HEIGHT=1600, MAX_WAREHOUSE_CELLS=300
 *
 * 藏品揭示状态（item.revealed）：
 *   { outline: boolean, qualityCell: {x,y}|null, exact: boolean }
 *
 * @requires MobaoConstants  - 常量（网格参数、容量范围）
 * @requires MobaoUtils      - 工具函数（shuffle, clamp, toCellKey, rgbHex, qualityPulseDuration）
 * @requires ArtifactData    - 藏品数据（ARTIFACT_LIBRARY, toSizeTag）
 * @requires Phaser          - 游戏引擎
 *
 * @exports window.MobaoWarehouse - 仓库 Mixin 集合
 *   { WarehouseCoreMixin, WarehouseRevealMixin, WarehousePreviewMixin }
 */
const {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  CANVAS_NATIVE_HEIGHT,
  MAX_WAREHOUSE_CELLS,
  ARTIFACT_COUNT_RANGE,
  WAREHOUSE_OCCUPANCY_RATIO_RANGE
} = window.MobaoConstants
const { shuffle, clamp, toCellKey, rgbHex, qualityPulseDuration } = window.MobaoUtils
const { toSizeTag, ARTIFACT_LIBRARY } = window.ArtifactData

const ARTIFACT_IMAGE_BASE_PATH = "assets/images/artifacts/thumbs/"

export const WarehouseCoreMixin = {
  preloadArtifactImages() {
    if (!ARTIFACT_LIBRARY || !Array.isArray(ARTIFACT_LIBRARY)) {
      return
    }
    const toLoad = []
    ARTIFACT_LIBRARY.forEach((artifact) => {
      const textureKey = `artifact-${artifact.key}`
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, ARTIFACT_IMAGE_BASE_PATH + artifact.key + ".png")
        toLoad.push(artifact.key)
      }
    })

    if (toLoad.length === 0) {
      console.log("[藏品图片] 所有图片已缓存，无需加载")
      return
    }

    console.log(`[藏品图片] 开始加载 ${toLoad.length} 张图片:`, toLoad)

    this.load.on("progress", (value) => {
      console.log(`[藏品图片] 加载进度: ${Math.round(value * 100)}%`)
    })

    this.load.on("complete", () => {
      console.log("[藏品图片] 全部加载完成")
      ARTIFACT_LIBRARY.forEach((artifact) => {
        const textureKey = `artifact-${artifact.key}`
        const texture = this.textures.get(textureKey)
        if (texture && texture.frames) {
          texture.setFilter(Phaser.Textures.FilterMode.LINEAR)
        }
      })
    })

    this.load.on("load", (file) => {
      console.log(`[藏品图片] 已加载: ${file.key}`)
    })

    this.load.on("loaderror", (file) => {
      console.warn(`[藏品图片] 加载失败: ${file.key}`, file.src)
    })

    this.load.start()
  },

  drawUnknownWarehouse() {
    if (this.gridLayer) {
      this.gridLayer.destroy()
    }
    if (this.revealCellLayer) {
      this.revealCellLayer.destroy()
    }

    this.gridLayer = this.add.graphics()

    for (let col = 1; col < GRID_COLS; col++) {
      const x = MARGIN + col * CELL_SIZE
      this.gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
      this.gridLayer.lineBetween(x, MARGIN, x, MARGIN + GRID_ROWS * CELL_SIZE)
    }
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = MARGIN + row * CELL_SIZE
      this.gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
      this.gridLayer.lineBetween(MARGIN, y, MARGIN + GRID_COLS * CELL_SIZE, y)
    }

    this.revealCellLayer = this.add.graphics()
    this.revealedCells = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))

    this.time.delayedCall(100, () => {
      this.preloadArtifactImages()
    })
  },

  drawGridLines() {
    if (!this.gridLayer) return
    this.gridLayer.clear()

    const occupied = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
    for (const item of this.items) {
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
          this.gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
          this.gridLayer.lineBetween(x, y1, x, y2)
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
          this.gridLayer.lineStyle(1, 0x9f8a6a, 0.4)
          this.gridLayer.lineBetween(x1, y, x2, y)
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
    if (this.itemLayer) {
      this.itemLayer.destroy(true)
    }

    this.itemLayer = this.add.container(0, 0)
    this.items = []

    const occupancy = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false))
    const capacity = GRID_COLS * GRID_ROWS
    const targetOccupiedCells = Math.round(
      capacity * Phaser.Math.FloatBetween(WAREHOUSE_OCCUPANCY_RATIO_RANGE.min, WAREHOUSE_OCCUPANCY_RATIO_RANGE.max)
    )
    let occupiedCellsCount = 0
    const desiredCount = Phaser.Math.Between(ARTIFACT_COUNT_RANGE.min, ARTIFACT_COUNT_RANGE.max)

    let attempts = 0
    while (this.items.length < desiredCount && attempts < 520 && occupiedCellsCount < targetOccupiedCells) {
      attempts += 1
      const slot = this.findFirstEmptySlot(occupancy)
      if (!slot) {
        break
      }

      const item = this.artifactManager.createRandomArtifactForSlot({
        col: slot.col,
        row: slot.row,
        gridCols: GRID_COLS,
        gridRows: GRID_ROWS,
        occupancy,
        categoryWeights: this._mapCategoryWeights || undefined,
        qualityWeights: this._mapQualityWeights || undefined
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
      this.items.push(item)
      occupiedCellsCount += item.w * item.h
    }
  },

  setupWarehouseAuction() {
    this.warehouseTrueValue = this.items.reduce((sum, item) => sum + item.trueValue, 0)
    const aiRatio = Phaser.Math.FloatBetween(0.9, 1.12)
    this.aiMaxBid = Math.round(this.warehouseTrueValue * aiRatio)
    this.currentBid = Math.max(1000, Math.round((this.warehouseTrueValue * 0.18) / 100) * 100)
    this.dom.bidInput.value = this.round <= 1 ? "" : "0"
    this.dom.bidInput.placeholder = this.round <= 1 ? "点击出价" : ""
  },

  findFirstEmptySlot(occupancy) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let col = 0; col < GRID_COLS; col += 1) {
        if (!occupancy[row][col]) {
          return { col, row }
        }
      }
    }
    return null
  },

  placeItem(item, slot, occupancy) {
    item.x = slot.col
    item.y = slot.row

    for (let y = slot.row; y < slot.row + item.h; y += 1) {
      for (let x = slot.col; x < slot.col + item.w; x += 1) {
        occupancy[y][x] = true
      }
    }
  },

  rebuildWarehouseCellIndex() {
    this.warehouseCellIndex = {}
    this.items.forEach((item) => {
      for (let y = item.y; y < item.y + item.h; y += 1) {
        for (let x = item.x; x < item.x + item.w; x += 1) {
          this.warehouseCellIndex[toCellKey(x, y)] = item.id
        }
      }
    })
  },

  isInBoundsCell(x, y) {
    return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS
  },

  isWarehouseCellOccupied(x, y) {
    if (!this.isInBoundsCell(x, y)) {
      return false
    }
    return Boolean(this.warehouseCellIndex[toCellKey(x, y)])
  },

  renderItem(item) {
    const pixelX = Math.round(MARGIN + item.x * CELL_SIZE)
    const pixelY = Math.round(MARGIN + item.y * CELL_SIZE)
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE

    const silhouette = this.add.rectangle(pixelX, pixelY, width, height, 0xe5d7bd, 0)
    silhouette.setOrigin(0, 0)

    const border = this.add.rectangle(pixelX, pixelY, width, height)
    border.setOrigin(0, 0)
    border.setStrokeStyle(3, item.quality.color, 0)

    const qualityMarkers = this.add.container(0, 0)
    const clickZone = this.add.zone(pixelX, pixelY, width, height).setOrigin(0, 0)
    clickZone.setInteractive({ useHandCursor: false })

    clickZone.on("pointerover", () => {
      if (this.hasAnyInfo(item)) {
        this.input.setDefaultCursor("pointer")
      } else {
        this.input.setDefaultCursor("default")
      }
    })

    clickZone.on("pointerout", () => {
      this.input.setDefaultCursor("default")
    })

    const TAP_THRESHOLD = 15
    const TAP_TIME_THRESHOLD = 250

    clickZone.on("pointerup", (pointer) => {
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
      borderPulseStarted: false,
      qualitySynced: false,
      qualityGlowTween: null
    }

    this.itemLayer.add([silhouette, border, qualityMarkers, clickZone])
  },

  onArtifactClicked(item, pointer) {
    if (
      !this.dom.bidKeypad.classList.contains("hidden") ||
      (this.dom.itemDrawer && !this.dom.itemDrawer.classList.contains("hidden"))
    ) {
      return
    }

    if (this.isSettlementPageActive()) {
      if (!item.revealed.outline) {
        return
      }
      this.selectedItem = item
      this.positionPreview(pointer.x, pointer.y)
      this.renderSettlementItemPreview(item)
      this.writeLog(`结算查看：${item.name}（价值 ${item.trueValue}）`)
      return
    }

    if (this.settled || this.roundResolving) {
      return
    }

    if (!this.hasAnyInfo(item)) {
      this.writeLog("该藏品尚无任何线索，无法进行候选预览。")
      return
    }

    if (!item.revealed.outline && item.revealed.qualityCell) {
      const clickCellX = Math.floor((pointer.x - MARGIN) / CELL_SIZE)
      const clickCellY = Math.floor((pointer.y - MARGIN) / CELL_SIZE)
      const qc = item.revealed.qualityCell
      if (clickCellX !== qc.x || clickCellY !== qc.y) {
        this.writeLog("只能点击已揭示的品质格来预览候选。")
        return
      }
    }

    this.selectedItem = item

    this.dom.previewCategorySelect.value = "all"
    this.positionPreview(pointer.x, pointer.y)
    this.renderPreviewCandidates(item)

    const info = this.getItemKnownText(item)
    this.writeLog(`已打开候选预览：${info}。当前出价作用于整仓，不是单件。`)
    this.updateHud()
  },

  hasAnyInfo(item) {
    return item.revealed.outline || Boolean(item.revealed.qualityCell)
  },

  getItemKnownText(item) {
    const segments = []
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
  revealOutlineBatch(count, category, allowCategoryFallback, sortStrategy) {
    const targets = this.pickRevealTargets({ mode: "outline", count, category, allowCategoryFallback, sortStrategy })
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示轮廓的目标。" }
    }

    targets.forEach((item) => this.revealOutline(item))
    this.showRevealScrollHintsForTargets(targets, "轮廓揭示位置不在当前可视区")
    const bottomCell = this.pickBottomCellFromTargets(targets)
    return {
      ok: true,
      revealed: targets.length,
      bottomCell
    }
  },

  revealQualityBatch(count, category, allowCategoryFallback, sortStrategy) {
    const targets = this.pickRevealTargets({ mode: "quality", count, category, allowCategoryFallback, sortStrategy })
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可揭示品质格的目标。" }
    }

    targets.forEach((item) => this.revealQualityCell(item))
    this.showRevealScrollHintsForTargets(targets, "品质揭示位置不在当前可视区")
    return { ok: true, revealed: targets.length }
  },

  revealArtifactFully(item, options = {}) {
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
      const cells = []
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

  revealArtifactFullyBatch({ count, sortStrategy, category, allowCategoryFallback }) {
    const unrevealed = this.items.filter((item) => !item.revealed.exact)

    const sortByArea = (arr, strategy) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let pool
    if (category) {
      const primary = unrevealed.filter((item) => item.category === category)
      pool = sortByArea(primary, sortStrategy)

      if (pool.length < count && allowCategoryFallback) {
        const existedIds = new Set(pool.map((item) => item.id))
        const fallback = unrevealed.filter((item) => !existedIds.has(item.id))
        pool = pool.concat(sortByArea(fallback, sortStrategy))
      }
    } else {
      pool = sortByArea(unrevealed, sortStrategy)
    }

    const targets = pool.slice(0, count)
    if (targets.length === 0) {
      return { ok: false, revealed: 0, message: "没有可完全揭示的藏品。" }
    }

    const results = []
    targets.forEach((item) => {
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
      items: results.map((r) => r.item),
      bottomCell
    }
  },

  playFullRevealEffect(item) {
    const pixelX = MARGIN + item.x * CELL_SIZE
    const pixelY = MARGIN + item.y * CELL_SIZE
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE
    const cx = pixelX + width / 2
    const cy = pixelY + height / 2

    if (this.dom && this.dom.gameRoot) {
      this.dom.gameRoot.classList.remove("reveal-flash")
      void this.dom.gameRoot.offsetWidth
      this.dom.gameRoot.classList.add("reveal-flash")
      setTimeout(() => {
        if (this.dom && this.dom.gameRoot) {
          this.dom.gameRoot.classList.remove("reveal-flash")
        }
      }, 600)
    }

    const qualityColor = item.quality.color
    const glowColor = item.quality.glow

    const outerRing = this.add.rectangle(cx, cy, width * 1.6, height * 1.6, glowColor, 0.5)
    outerRing.setOrigin(0.5, 0.5)
    outerRing.setAlpha(0)
    this.tweens.add({
      targets: outerRing,
      scaleX: { from: 0.5, to: 1.8 },
      scaleY: { from: 0.5, to: 1.8 },
      alpha: { from: 0.7, to: 0 },
      duration: 700,
      ease: "Quad.easeOut",
      onComplete: () => outerRing.destroy()
    })

    const innerBurst = this.add.rectangle(cx, cy, width, height, qualityColor, 0.6)
    innerBurst.setOrigin(0.5, 0.5)
    innerBurst.setAlpha(0)
    this.tweens.add({
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
      this.tweens.add({
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
      this.tweens.add({
        targets: img,
        alpha: 1,
        scaleX: baseScale * 1.15,
        scaleY: baseScale * 1.15,
        duration: 350,
        ease: "Back.easeOut",
        onComplete: () => {
          this.tweens.add({
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

  pickBottomCellFromTargets(targets) {
    const list = Array.isArray(targets) ? targets : []
    if (list.length === 0) {
      return null
    }

    let selected = list[0]
    let maxBottomY = selected.y + selected.h - 1

    list.forEach((item) => {
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
    if (this.dom.revealHintUp) {
      this.dom.revealHintUp.classList.add("hidden")
    }
    if (this.dom.revealHintDown) {
      this.dom.revealHintDown.classList.add("hidden")
    }
    this.pendingRevealHintTargets = null
    this.pendingRevealHintText = ""
    this.pendingRevealHintSeenIds = null
  },

  showRevealScrollHintsForTargets(targets, message) {
    if (!targets || targets.length === 0) {
      return
    }

    this.pendingRevealHintTargets = targets
    this.pendingRevealHintText = message
    this.pendingRevealHintSeenIds = new Set()
    this.refreshRevealScrollHints()
  },

  refreshRevealScrollHints() {
    if (!this.dom.gameRoot || !this.pendingRevealHintTargets || this.pendingRevealHintTargets.length === 0) {
      return
    }

    const canvasEl = this.dom.gameRoot.querySelector("canvas")
    const canvasRenderHeight = canvasEl ? canvasEl.getBoundingClientRect().height : this.dom.gameRoot.scrollHeight
    const scaleRatio = canvasRenderHeight > 0 ? canvasRenderHeight / CANVAS_NATIVE_HEIGHT : 1

    const viewportTop = this.dom.gameRoot.scrollTop
    const viewportBottom = viewportTop + this.dom.gameRoot.clientHeight

    this.pendingRevealHintTargets.forEach((item) => {
      const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio
      const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio
      if (top < viewportBottom && bottom > viewportTop) {
        this.pendingRevealHintSeenIds.add(item.id)
      }
    })

    if (this.pendingRevealHintSeenIds.size >= this.pendingRevealHintTargets.length) {
      this.hideRevealScrollHints()
      return
    }

    let hasAbove = false
    let hasBelow = false

    this.pendingRevealHintTargets.forEach((item) => {
      if (this.pendingRevealHintSeenIds.has(item.id)) {
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
    if (this.dom.revealHintUp) {
      this.dom.revealHintUp.style.top = `${baseTop}px`
      this.dom.revealHintUp.textContent = `${this.pendingRevealHintText}（上方）`
      this.dom.revealHintUp.classList.toggle("hidden", !hasAbove)
    }
    if (this.dom.revealHintDown) {
      this.dom.revealHintDown.style.top = `${baseTop + 36}px`
      this.dom.revealHintDown.textContent = `${this.pendingRevealHintText}（下方）`
      this.dom.revealHintDown.classList.toggle("hidden", !hasBelow)
    }

    if (!hasAbove && !hasBelow) {
      this.hideRevealScrollHints()
    }
  },

  pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy }) {
    const primary = this.items.filter((item) => {
      if (category && item.category !== category) {
        return false
      }
      if (mode === "outline") {
        return !item.revealed.outline
      }
      return !item.revealed.qualityCell
    })

    const sortByArea = (arr, strategy) => {
      const shuffled = shuffle(arr)
      if (strategy === "smallestFirst") {
        return shuffled.sort((a, b) => a.w * a.h - b.w * b.h)
      } else if (strategy === "largestFirst") {
        return shuffled.sort((a, b) => b.w * b.h - a.w * a.h)
      }
      return shuffled
    }

    let pool = sortByArea(primary, sortStrategy)

    let selected = pool.slice(0, count)
    if (selected.length < count && allowCategoryFallback && category) {
      const existedIds = new Set(selected.map((item) => item.id))
      const fallback = this.items.filter((item) => {
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

  revealOutline(item, options = {}) {
    if (item.revealed.outline) {
      return
    }

    const { silhouette, border } = item.view
    silhouette.setFillStyle(0xe5d7bd, 0.26)
    border.setStrokeStyle(2, 0xc8b08a, 0.92)

    if (item.revealed.qualityCell && !item.view.borderPulseStarted) {
      item.view.borderPulseStarted = true
      border.setStrokeStyle(3, item.quality.color, 1)
      this.tweens.add({
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

  revealQualityCell(item, options = {}) {
    if (item.revealed.qualityCell) {
      return
    }

    const cells = []
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

  playOutlineRevealEffect(item) {
    const { border } = item.view
    const pixelX = MARGIN + item.x * CELL_SIZE
    const pixelY = MARGIN + item.y * CELL_SIZE
    const width = item.w * CELL_SIZE
    const height = item.h * CELL_SIZE
    const cx = pixelX + width / 2
    const cy = pixelY + height / 2

    if (this.dom && this.dom.gameRoot) {
      this.dom.gameRoot.classList.remove("reveal-flash")
      void this.dom.gameRoot.offsetWidth
      this.dom.gameRoot.classList.add("reveal-flash")
      setTimeout(() => {
        if (this.dom && this.dom.gameRoot) {
          this.dom.gameRoot.classList.remove("reveal-flash")
        }
      }, 600)
    }

    border.setAlpha(0)
    this.tweens.add({
      targets: border,
      alpha: { from: 0, to: 1 },
      duration: 180,
      ease: "Sine.easeOut"
    })

    const pulseRing = this.add.rectangle(cx, cy, width, height)
    pulseRing.setOrigin(0.5, 0.5)
    pulseRing.setStrokeStyle(3, 0xc8b08a, 0.8)
    pulseRing.setAlpha(0)
    this.tweens.add({
      targets: pulseRing,
      scaleX: { from: 0.85, to: 1.08 },
      scaleY: { from: 0.85, to: 1.08 },
      alpha: { from: 0.8, to: 0 },
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => pulseRing.destroy()
    })

    const flashOverlay = this.add.rectangle(cx, cy, width, height, 0xffffff, 0.5)
    flashOverlay.setOrigin(0.5, 0.5)
    flashOverlay.setAlpha(0)
    this.tweens.add({
      targets: flashOverlay,
      scaleX: { from: 0.8, to: 1.05 },
      scaleY: { from: 0.8, to: 1.05 },
      alpha: { from: 0.6, to: 0 },
      duration: 400,
      ease: "Sine.easeOut",
      onComplete: () => flashOverlay.destroy()
    })

    const lightSweep = this.add.graphics()
    lightSweep.setAlpha(0)
    lightSweep.fillStyle(0xffffff, 0.35)
    lightSweep.fillRect(pixelX, pixelY, width, height)
    lightSweep.setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: lightSweep,
      alpha: { from: 0.7, to: 0 },
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => lightSweep.destroy()
    })
  },

  playQualityRevealEffect(item) {
    const qualityColor = item.quality.color
    const hasOutline = item.revealed.outline
    let pixelX, pixelY, areaW, areaH

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

    if (this.dom && this.dom.gameRoot) {
      this.dom.gameRoot.classList.remove("quality-reveal-flash")
      void this.dom.gameRoot.offsetWidth
      this.dom.gameRoot.classList.add("quality-reveal-flash")
      setTimeout(() => {
        if (this.dom && this.dom.gameRoot) {
          this.dom.gameRoot.classList.remove("quality-reveal-flash")
        }
      }, 700)
    }

    const burstSize = Math.max(areaW, areaH) * 0.7
    const burstRing = this.add.rectangle(cx, cy, burstSize, burstSize, qualityColor, 0.7)
    burstRing.setOrigin(0.5, 0.5)
    burstRing.setAlpha(0)
    this.tweens.add({
      targets: burstRing,
      scaleX: { from: 0.3, to: 1.3 },
      scaleY: { from: 0.3, to: 1.3 },
      alpha: { from: 0.6, to: 0 },
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => burstRing.destroy()
    })

    const qualityFlash = this.add.rectangle(cx, cy, areaW, areaH, qualityColor, 0.5)
    qualityFlash.setOrigin(0.5, 0.5)
    qualityFlash.setAlpha(0)
    this.tweens.add({
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

      this.tweens.add({
        targets: img,
        alpha: 1,
        duration: 300,
        ease: "Sine.easeIn"
      })

      this.tweens.add({
        targets: img,
        scaleX: baseScale * 1.1,
        scaleY: baseScale * 1.1,
        duration: 200,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
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

  clearQualityVisual(item, keepImage = false) {
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

  renderQualityVisual(item, options = {}) {
    if (!item.revealed.qualityCell) {
      return
    }

    const hasExistingImage = !!item.view.artifactImage
    const existingScale = hasExistingImage
      ? { x: item.view.artifactImage.scaleX, y: item.view.artifactImage.scaleY }
      : null

    this.clearQualityVisual(item, hasExistingImage)

    let markerX
    let markerY
    let markerW
    let markerH

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
    const shouldShowArtifactImage = (isFullyRevealed || this.isSettlementRevealMode) && item.key
    const textureKey = `artifact-${item.key}`
    const hasArtifactImage = shouldShowArtifactImage && this.textures.exists(textureKey)
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
        const artifactImage = this.add.image(markerX + markerW / 2, markerY + markerH / 2, textureKey)
        artifactImage.setOrigin(0.5, 0.5)
        artifactImage.setDisplaySize(markerW, markerH)
        item.view.qualityMarkers.add(artifactImage)
        item.view.artifactImage = artifactImage
      }
    }

    const marker = this.add.rectangle(
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

    this.tweens.add({
      targets: marker,
      scaleX: { from: 0, to: 1.15 },
      scaleY: { from: 0, to: 1.15 },
      duration: 250,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: marker,
          scaleX: 1,
          scaleY: 1,
          duration: 120,
          ease: "Sine.easeOut"
        })
      }
    })

    item.view.qualityGlowTween = this.tweens.add({
      targets: marker,
      alpha: { from: hasArtifactImage ? 0.35 : 0.45, to: hasArtifactImage ? 0.55 : 0.7 },
      duration: qualityPulseDuration(item.qualityKey),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    })

    if (item.revealed.outline && !item.view.borderPulseStarted) {
      item.view.border.setStrokeStyle(3, item.quality.color, 1)
      item.view.borderPulseStarted = true
      this.tweens.add({
        targets: item.view.border,
        alpha: { from: 1, to: 0.35 },
        duration: qualityPulseDuration(item.qualityKey),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      })
    }
  },

  syncQualityMarkersForOutlinedItem(item, options = {}) {
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

  revealCell(col, row) {
    if (this.revealedCells[row][col]) {
      return
    }

    this.revealedCells[row][col] = true
    const x = MARGIN + col * CELL_SIZE
    const y = MARGIN + row * CELL_SIZE

    this.revealCellLayer.fillStyle(0xf1e6cc, 0.2)
    this.revealCellLayer.fillRect(x, y, CELL_SIZE, CELL_SIZE)
  }
}

export const WarehousePreviewMixin = {
  positionPreview(canvasX, canvasY) {
    this.previewAnchor = { x: canvasX, y: canvasY }
    const pop = this.dom.previewPopover
    pop.classList.remove("hidden")
    this.previewOpenTick = Date.now()

    this.applyPreviewPosition()
  },

  applyPreviewPosition() {
    const pop = this.dom.previewPopover
    if (pop.classList.contains("hidden") || !this.previewAnchor) {
      return
    }

    const isMobile = window.innerWidth <= 600
    if (isMobile) {
      pop.style.left = ""
      pop.style.top = ""
      pop.style.maxHeight = ""
      return
    }

    const canvasX = this.previewAnchor.x
    const canvasY = this.previewAnchor.y

    const root = this.dom.gameRoot
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
    if (this.dom.previewPopover.classList.contains("hidden")) {
      return
    }

    window.requestAnimationFrame(() => {
      this.applyPreviewPosition()
    })
  },

  hidePreview() {
    if (this.dom.previewFilterRow) {
      this.dom.previewFilterRow.style.display = "flex"
    }
    this.dom.previewPopover.classList.add("hidden")
    this.dom.previewList.innerHTML = ""
    this.dom.previewHint.textContent = ""
    this.input.setDefaultCursor("default")
  },

  setupPreviewTouchScroll() {
    const pop = this.dom.previewPopover
    if (!pop) return
    let isDraggingToClose = false
    let dragStartY = 0

    pop.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          dragStartY = e.touches[0].clientY
          isDraggingToClose = pop.scrollTop <= 0
        }
      },
      { passive: true }
    )

    pop.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return
        const currentY = e.touches[0].clientY
        if (isDraggingToClose && currentY - dragStartY > 60) {
          this.hidePreview()
          return
        }
        // 不使用 e.preventDefault() 和手动 scrollTop，
        // 让 CSS overflow-y: auto + -webkit-overflow-scrolling: touch 原生滚动
      },
      { passive: true }
    )
  },

  isPointOnSettlementLockedItem(x, y) {
    if (!this.items || this.items.length === 0) {
      return false
    }

    return this.items.some((item) => {
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

  renderPreviewCandidates(item) {
    if (this.dom.previewFilterRow) {
      this.dom.previewFilterRow.style.display = "flex"
    }
    this.dom.previewTitle.style.display = ""
    this.dom.previewHint.style.display = ""
    const qualityKey = item.revealed.qualityCell ? item.qualityKey : null
    const sizeTag = item.revealed.outline ? toSizeTag(item.w, item.h) : null
    const selectedCategory = this.dom.previewCategorySelect.value
    const category = selectedCategory === "all" ? null : selectedCategory

    const candidates = this.artifactManager.getCandidatesByRevealState({
      qualityKey,
      sizeTag,
      category
    })

    if (item.revealed.outline && item.revealed.qualityCell && candidates.length === 1) {
      item.revealed.exact = true
    }

    const libStats = this.artifactManager.getLibraryStats()
    this.dom.previewTitle.textContent = `可能藏品预览（候选 ${candidates.length}/${libStats.total}）`
    this.dom.previewHint.textContent = `已知线索：${this.getItemKnownText(item)}；藏品库总数 ${libStats.total} 件；若仅有品质线索，候选会接近全库；默认按估算价从高到低。`

    if (candidates.length === 0) {
      this.dom.previewList.innerHTML = '<div class="preview-item">无符合候选</div>'
      return
    }

    const sorted = [...candidates].sort((a, b) => b.expectedPrice - a.expectedPrice)
    const html = sorted
      .map((candidate) => {
        const candidateQuality = window.ArtifactData.QUALITY_CONFIG[candidate.qualityKey]
        const qualityText = candidateQuality ? candidateQuality.label : "未知"
        const sizeText = candidate.previewSizeTag || "未知"
        const imgSrc = `assets/images/artifacts/thumbs/${candidate.key}.png`
        const qualityColor = candidateQuality ? rgbHex(candidateQuality.color) : "#9f9f9f"
        return `<article class="preview-item"><div class="preview-thumb preview-thumb-large" style="background: ${qualityColor}44;"><img src="${imgSrc}" alt="${candidate.name}" onerror="this.style.display='none'"/></div><strong>${candidate.name}</strong><br/>品类: ${candidate.category} | 品质: ${qualityText}<br/>基础价: ${candidate.basePrice} | 估算价: ${candidate.expectedPrice}</article>`
      })
      .join("")

    this.dom.previewList.innerHTML = html
    this.repositionPreview()
  },

  renderSettlementItemPreview(item) {
    if (this.dom.previewFilterRow) {
      this.dom.previewFilterRow.style.display = "none"
    }
    this.dom.previewTitle.style.display = "none"
    this.dom.previewHint.style.display = "none"
    const imgSrc = `assets/images/artifacts/thumbs/${item.key}.png`
    const qualityColor = rgbHex(item.quality.color)
    const qualityLabel = item.quality.label || "未知"
    this.dom.previewList.innerHTML = [
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

// 兼容层：保持 window.MobaoWarehouse 全局变量可用
window.MobaoWarehouse = {
  WarehouseCoreMixin,
  WarehouseRevealMixin,
  WarehousePreviewMixin
}
