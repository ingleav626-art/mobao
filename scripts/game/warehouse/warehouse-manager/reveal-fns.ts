/**
 * @file warehouse-manager/reveal-fns.ts
 * @module warehouse/warehouse-manager/reveal-fns
 * @description WarehouseManager 的 reveal 域方法，抽取为独立函数。
 */
import type { Artifact } from "../../../../types/game"
import type { WarehouseManagerDeps } from "./types"
import { GRID_COLS as _GRID_COLS, GRID_ROWS as _GRID_ROWS, CELL_SIZE, MARGIN, CANVAS_NATIVE_HEIGHT } from "../../core/constants"
import { shuffle, qualityPulseDuration } from "../../core/utils"
import { pickBottomCellFromTargets, pickRevealTargets, type RevealMode as _RevealMode } from "../index"
import { drawGridLines } from "./core-fns"

/** 批量揭示轮廓 */
export function revealOutlineBatch(
  deps: WarehouseManagerDeps,
  count: number,
  category: string | null,
  allowCategoryFallback: boolean,
  sortStrategy: string | null
): {
  ok: boolean
  revealed: number
  message?: string
  bottomCell?: { x: number; y: number; col: number; row: number } | null
} {
  const targets = pickRevealTargets(deps.state.items, {
    mode: "outline",
    count,
    category,
    allowCategoryFallback,
    sortStrategy
  })
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: "没有可揭示轮廓的目标。" }
  }

  targets.forEach((item: Artifact) => revealOutline(deps, item))
  showRevealScrollHintsForTargets(deps, targets, "轮廓揭示位置不在当前可视区")
  const bottomCell = pickBottomCellFromTargets(targets)
  return {
    ok: true,
    revealed: targets.length,
    bottomCell
  }
}

/** 批量揭示品质格 */
export function revealQualityBatch(
  deps: WarehouseManagerDeps,
  count: number,
  category: string | null,
  allowCategoryFallback: boolean,
  sortStrategy: string | null
): { ok: boolean; revealed: number; message?: string } {
  const targets = pickRevealTargets(deps.state.items, {
    mode: "quality",
    count,
    category,
    allowCategoryFallback,
    sortStrategy
  })
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: "没有可揭示品质格的目标。" }
  }

  targets.forEach((item: Artifact) => revealQualityCell(deps, item))
  showRevealScrollHintsForTargets(deps, targets, "品质揭示位置不在当前可视区")
  return { ok: true, revealed: targets.length }
}

/** 完全揭示单个藏品（轮廓 + 品质 + 精确） */
export function revealArtifactFully(
  deps: WarehouseManagerDeps,
  item: Artifact,
  options: Record<string, unknown> = {}
): { ok: boolean; item?: Artifact; message: string } {
  if (!item || !item.revealed) {
    return { ok: false, message: "无效的藏品目标。" }
  }

  if (item.revealed.exact) {
    return { ok: false, message: "该藏品已完全揭示。" }
  }

  if (!item.revealed.outline) {
    revealOutline(deps, item, { skipEffects: options.skipEffects })
  }

  if (!item.revealed.qualityCell) {
    const cells: { x: number; y: number }[] = []
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        cells.push({ x, y })
      }
    }
    const chosen = cells[Math.floor(Math.random() * cells.length)]
    revealCell(deps, chosen.x, chosen.y)
    item.revealed.qualityCell = chosen
  }

  item.revealed.exact = true

  renderQualityVisual(deps, item, options)

  if (!options.skipEffects) {
    playFullRevealEffect(deps, item)
  }

  drawGridLines(deps)

  return { ok: true, item, message: `完全揭示：${item.name}（${item.quality.label}）` }
}

/** 批量完全揭示藏品 */
export function revealArtifactFullyBatch(
  deps: WarehouseManagerDeps,
  {
    count,
    sortStrategy,
    category,
    allowCategoryFallback
  }: {
    count: number
    sortStrategy: string | null
    category: string | null
    allowCategoryFallback: boolean
  }
): {
  ok: boolean
  revealed: number
  message?: string
  items?: Artifact[]
  bottomCell?: { x: number; y: number; col: number; row: number } | null
} {
  const unrevealed = deps.state.items.filter((item: Artifact) => !item.revealed.exact)

  const sortByArea = (arr: Artifact[], strategy: string | null) => {
    const shuffled = shuffle(arr)
    if (strategy === "smallestFirst") {
      return shuffled.sort((a: Artifact, b: Artifact) => { const aa = a.w * a.h; const bb = b.w * b.h; return aa - bb })
    } else if (strategy === "largestFirst") {
      return shuffled.sort((a: Artifact, b: Artifact) => { const aa = a.w * a.h; const bb = b.w * b.h; return bb - aa })
    } else if (strategy === "highestPrice") {
      return shuffled.sort((a: Artifact, b: Artifact) => b.basePrice - a.basePrice)
    } else if (strategy === "lowestPrice") {
      return shuffled.sort((a: Artifact, b: Artifact) => a.basePrice - b.basePrice)
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
    const result = revealArtifactFully(deps, item)
    if (result.ok && result.item) {
      results.push({ ok: result.ok, item: result.item, message: result.message })
    }
  })

  showRevealScrollHintsForTargets(deps, targets, "完全揭示位置不在当前可视区")
  const bottomCell = pickBottomCellFromTargets(targets)
  return {
    ok: true,
    revealed: results.length,
    items: results.map((r: { ok: boolean; item: Artifact; message: string }) => r.item),
    bottomCell
  }
}

/** 揭示指定品质的所有未揭示藏品 */
export function revealAllByQuality(
  deps: WarehouseManagerDeps,
  qualityKey: string
): { ok: boolean; revealed: number; message: string } {
  const targets = deps.state.items.filter(
    (item: Artifact) => !item.revealed.exact && item.qualityKey === qualityKey
  )
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: `没有未揭示的${qualityKey}品质藏品。` }
  }
  let revealed = 0
  targets.forEach((item: Artifact) => {
    const result = revealArtifactFully(deps, item)
    if (result.ok) revealed++
  })
  return { ok: true, revealed, message: `揭示了${revealed}件${qualityKey}品质藏品。` }
}

/** 揭示指定品类的所有未揭示藏品 */
export function revealAllByCategory(
  deps: WarehouseManagerDeps,
  category: string
): { ok: boolean; revealed: number; message: string } {
  const targets = deps.state.items.filter(
    (item: Artifact) => !item.revealed.exact && item.category === category
  )
  if (targets.length === 0) {
    return { ok: false, revealed: 0, message: `没有未揭示的${category}藏品。` }
  }
  let revealed = 0
  targets.forEach((item: Artifact) => {
    const result = revealArtifactFully(deps, item)
    if (result.ok) revealed++
  })
  return { ok: true, revealed, message: `揭示了${revealed}件${category}藏品。` }
}

/** 播放完全揭示特效（外环 + 内爆 + 边框/图片动画） */
export function playFullRevealEffect(deps: WarehouseManagerDeps, item: Artifact): void {
  const pixelX = MARGIN + item.x * CELL_SIZE
  const pixelY = MARGIN + item.y * CELL_SIZE
  const width = item.w * CELL_SIZE
  const height = item.h * CELL_SIZE
  const cx = pixelX + width / 2
  const cy = pixelY + height / 2

  if (deps.dom && deps.dom.gameRoot) {
    deps.dom.gameRoot!.classList.remove("reveal-flash")
    void deps.dom.gameRoot!.offsetWidth
    deps.dom.gameRoot!.classList.add("reveal-flash")
    setTimeout(() => {
      if (deps.dom && deps.dom.gameRoot) {
        deps.dom.gameRoot!.classList.remove("reveal-flash")
      }
    }, 600)
  }

  const qualityColor = item.quality.color
  const glowColor = item.quality.glow

  const outerRing = deps.getAdd().rectangle(cx, cy, width * 1.6, height * 1.6, glowColor, 0.5)
  outerRing.setOrigin(0.5, 0.5)
  outerRing.setAlpha(0)
  deps.getTweens().add({
    targets: outerRing,
    scaleX: { from: 0.5, to: 1.8 },
    scaleY: { from: 0.5, to: 1.8 },
    alpha: { from: 0.7, to: 0 },
    duration: 700,
    ease: "Quad.easeOut",
    onComplete: () => outerRing.destroy()
  })

  const innerBurst = deps.getAdd().rectangle(cx, cy, width, height, qualityColor, 0.6)
  innerBurst.setOrigin(0.5, 0.5)
  innerBurst.setAlpha(0)
  deps.getTweens().add({
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
    deps.getTweens().add({
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
    deps.getTweens().add({
      targets: img,
      alpha: 1,
      scaleX: baseScale * 1.15,
      scaleY: baseScale * 1.15,
      duration: 350,
      ease: "Back.easeOut",
      onComplete: () => {
        deps.getTweens().add({
          targets: img,
          scaleX: baseScale,
          scaleY: baseScale,
          duration: 200,
          ease: "Sine.easeInOut"
        })
      }
    })
  }
}

/** 隐藏揭示滚动提示 */
export function hideRevealScrollHints(deps: WarehouseManagerDeps): void {
  if (deps.dom.revealHintUp) {
    deps.dom.revealHintUp!.classList.add("hidden")
  }
  if (deps.dom.revealHintDown) {
    deps.dom.revealHintDown!.classList.add("hidden")
  }
  deps.state.pendingRevealHintTargets = null
  deps.state.pendingRevealHintText = ""
  deps.state.pendingRevealHintSeenIds = null
}

/** 为目标藏品显示揭示滚动提示 */
export function showRevealScrollHintsForTargets(
  deps: WarehouseManagerDeps,
  targets: Artifact[],
  message: string
): void {
  if (!targets || targets.length === 0) {
    return
  }

  deps.state.pendingRevealHintTargets = targets
  deps.state.pendingRevealHintText = message
  deps.state.pendingRevealHintSeenIds = new Set()
  refreshRevealScrollHints(deps)
}

/** 刷新揭示滚动提示（根据可视区域计算上下提示） */
export function refreshRevealScrollHints(deps: WarehouseManagerDeps): void {
  const gameRoot = deps.dom.gameRoot
  const hintTargets = deps.state.pendingRevealHintTargets
  if (!gameRoot || !hintTargets || hintTargets.length === 0) {
    return
  }

  const canvasEl = gameRoot.querySelector("canvas")
  const canvasRenderHeight = canvasEl ? canvasEl.getBoundingClientRect().height : gameRoot.scrollHeight
  const scaleRatio = canvasRenderHeight > 0 ? canvasRenderHeight / CANVAS_NATIVE_HEIGHT : 1

  const viewportTop = gameRoot.scrollTop
  const viewportBottom = viewportTop + gameRoot.clientHeight

  hintTargets.forEach((item: Artifact) => {
    const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio
    const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio
    if (top < viewportBottom && bottom > viewportTop) {
      deps.state.pendingRevealHintSeenIds!.add(item.id)
    }
  })

  if (deps.state.pendingRevealHintSeenIds!.size >= hintTargets.length) {
    hideRevealScrollHints(deps)
    return
  }

  let hasAbove = false
  let hasBelow = false

  hintTargets.forEach((item: Artifact) => {
    if (deps.state.pendingRevealHintSeenIds!.has(item.id)) {
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
  if (deps.dom.revealHintUp) {
    deps.dom.revealHintUp!.style.top = `${baseTop}px`
    deps.dom.revealHintUp!.textContent = `${deps.state.pendingRevealHintText}（上方）`
    deps.dom.revealHintUp!.classList.toggle("hidden", !hasAbove)
  }
  if (deps.dom.revealHintDown) {
    deps.dom.revealHintDown!.style.top = `${baseTop + 36}px`
    deps.dom.revealHintDown!.textContent = `${deps.state.pendingRevealHintText}（下方）`
    deps.dom.revealHintDown!.classList.toggle("hidden", !hasBelow)
  }

  if (!hasAbove && !hasBelow) {
    hideRevealScrollHints(deps)
  }
}

/** 揭示藏品轮廓 */
export function revealOutline(deps: WarehouseManagerDeps, item: Artifact, options: Record<string, unknown> = {}): void {
  if (item.revealed.outline) {
    return
  }

  const { silhouette, border } = item.view
  silhouette.setFillStyle(0xe5d7bd, 0.26)
  border.setStrokeStyle(2, 0xc8b08a, 0.92)

  if (item.revealed.qualityCell && !item.view.borderPulseStarted) {
    item.view.borderPulseStarted = true
    border.setStrokeStyle(3, item.quality.color, 1)
    deps.getTweens().add({
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
      revealCell(deps, x, y)
    }
  }

  item.revealed.outline = true
  drawGridLines(deps)

  if (!options.skipEffects) {
    playOutlineRevealEffect(deps, item)
  }

  if (item.revealed.qualityCell) {
    syncQualityMarkersForOutlinedItem(deps, item, options)
  }
}

/** 揭示藏品品质格 */
export function revealQualityCell(
  deps: WarehouseManagerDeps,
  item: Artifact,
  options: Record<string, unknown> = {}
): void {
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
  revealCell(deps, chosen.x, chosen.y)
  item.revealed.qualityCell = chosen
  renderQualityVisual(deps, item, options)

  if (!options.skipEffects) {
    playQualityRevealEffect(deps, item)
  }

  if (item.revealed.outline) {
    syncQualityMarkersForOutlinedItem(deps, item, options)
  }
}

/** 播放轮廓揭示特效（边框渐入 + 脉冲环 + 闪光 + 扫光） */
export function playOutlineRevealEffect(deps: WarehouseManagerDeps, item: Artifact): void {
  const { border } = item.view
  const pixelX = MARGIN + item.x * CELL_SIZE
  const pixelY = MARGIN + item.y * CELL_SIZE
  const width = item.w * CELL_SIZE
  const height = item.h * CELL_SIZE
  const cx = pixelX + width / 2
  const cy = pixelY + height / 2

  if (deps.dom && deps.dom.gameRoot) {
    const root = deps.dom.gameRoot!
    root.classList.remove("reveal-flash")
    void root.offsetWidth
    root.classList.add("reveal-flash")
    setTimeout(() => {
      if (deps.dom && deps.dom.gameRoot) {
        deps.dom.gameRoot!.classList.remove("reveal-flash")
      }
    }, 600)
  }

  border.setAlpha(0)
  deps.getTweens().add({
    targets: border,
    alpha: { from: 0, to: 1 },
    duration: 180,
    ease: "Sine.easeOut"
  })

  const pulseRing = deps.getAdd().rectangle(cx, cy, width, height)
  pulseRing.setOrigin(0.5, 0.5)
  pulseRing.setStrokeStyle(3, 0xc8b08a, 0.8)
  pulseRing.setAlpha(0)
  deps.getTweens().add({
    targets: pulseRing,
    scaleX: { from: 0.85, to: 1.08 },
    scaleY: { from: 0.85, to: 1.08 },
    alpha: { from: 0.8, to: 0 },
    duration: 400,
    ease: "Sine.easeOut",
    onComplete: () => pulseRing.destroy()
  })

  const flashOverlay = deps.getAdd().rectangle(cx, cy, width, height, 0xffffff, 0.5)
  flashOverlay.setOrigin(0.5, 0.5)
  flashOverlay.setAlpha(0)
  deps.getTweens().add({
    targets: flashOverlay,
    scaleX: { from: 0.8, to: 1.05 },
    scaleY: { from: 0.8, to: 1.05 },
    alpha: { from: 0.6, to: 0 },
    duration: 400,
    ease: "Sine.easeOut",
    onComplete: () => flashOverlay.destroy()
  })

  const lightSweep = deps.getAdd().graphics()
  lightSweep.setAlpha(0)
  lightSweep.fillStyle(0xffffff, 0.35)
  lightSweep.fillRect(pixelX, pixelY, width, height)
  lightSweep.setBlendMode(Phaser.BlendModes.ADD)
  deps.getTweens().add({
    targets: lightSweep,
    alpha: { from: 0.7, to: 0 },
    duration: 500,
    ease: "Quad.easeOut",
    onComplete: () => lightSweep.destroy()
  })
}

/** 播放品质揭示特效（爆裂环 + 品质闪光 + 图片缩放） */
export function playQualityRevealEffect(deps: WarehouseManagerDeps, item: Artifact): void {
  const qualityColor = item.quality.color
  const hasOutline = item.revealed.outline
  let pixelX: number, pixelY: number, areaW: number, areaH: number

  if (hasOutline) {
    pixelX = MARGIN + item.x * CELL_SIZE
    pixelY = MARGIN + item.y * CELL_SIZE
    areaW = item.w * CELL_SIZE
    areaH = item.h * CELL_SIZE
  } else {
    pixelX = MARGIN + item.revealed.qualityCell!.x * CELL_SIZE
    pixelY = MARGIN + item.revealed.qualityCell!.y * CELL_SIZE
    areaW = CELL_SIZE
    areaH = CELL_SIZE
  }

  const cx = pixelX + areaW / 2
  const cy = pixelY + areaH / 2

  if (deps.dom && deps.dom.gameRoot) {
    const root = deps.dom.gameRoot!
    root.classList.remove("quality-reveal-flash")
    void root.offsetWidth
    root.classList.add("quality-reveal-flash")
    setTimeout(() => {
      if (deps.dom && deps.dom.gameRoot) {
        deps.dom.gameRoot!.classList.remove("quality-reveal-flash")
      }
    }, 700)
  }

  const burstSize = Math.max(areaW, areaH) * 0.7
  const burstRing = deps.getAdd().rectangle(cx, cy, burstSize, burstSize, qualityColor, 0.7)
  burstRing.setOrigin(0.5, 0.5)
  burstRing.setAlpha(0)
  deps.getTweens().add({
    targets: burstRing,
    scaleX: { from: 0.3, to: 1.3 },
    scaleY: { from: 0.3, to: 1.3 },
    alpha: { from: 0.6, to: 0 },
    duration: 500,
    ease: "Quad.easeOut",
    onComplete: () => burstRing.destroy()
  })

  const qualityFlash = deps.getAdd().rectangle(cx, cy, areaW, areaH, qualityColor, 0.5)
  qualityFlash.setOrigin(0.5, 0.5)
  qualityFlash.setAlpha(0)
  deps.getTweens().add({
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

    deps.getTweens().add({
      targets: img,
      alpha: 1,
      duration: 300,
      ease: "Sine.easeIn"
    })

    deps.getTweens().add({
      targets: img,
      scaleX: baseScale * 1.1,
      scaleY: baseScale * 1.1,
      duration: 200,
      ease: "Sine.easeOut",
      onComplete: () => {
        deps.getTweens().add({
          targets: img,
          scaleX: baseScale,
          scaleY: baseScale,
          duration: 150,
          ease: "Sine.easeInOut"
        })
      }
    })
  }
}

/** 清除品质视觉效果（光晕停止 + 标记移除） */
export function clearQualityVisual(deps: WarehouseManagerDeps, item: Artifact, keepImage: boolean = false): void {
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
}

/** 渲染品质视觉（品质格标记 + 藏品图片 + 光晕脉冲） */
export function renderQualityVisual(
  deps: WarehouseManagerDeps,
  item: Artifact,
  options: Record<string, unknown> = {}
): void {
  if (!item.revealed.qualityCell) {
    return
  }

  const hasExistingImage = !!item.view.artifactImage
  const existingScale = hasExistingImage
    ? { x: item.view.artifactImage!.scaleX, y: item.view.artifactImage!.scaleY }
    : null

  clearQualityVisual(deps, item, hasExistingImage)

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
  const shouldShowArtifactImage = (isFullyRevealed || deps.getIsSettlementRevealMode()) && item.key
  const textureKey = `artifact-${item.key}`
  const hasArtifactImage = shouldShowArtifactImage && deps.getTextures().exists(textureKey)
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
      const artifactImage = deps.getAdd().image(markerX + markerW / 2, markerY + markerH / 2, textureKey)
      artifactImage.setOrigin(0.5, 0.5)
      artifactImage.setDisplaySize(markerW, markerH)
      item.view.qualityMarkers.add(artifactImage)
      item.view.artifactImage = artifactImage
    }
  }

  const marker = deps
    .getAdd()
    .rectangle(
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

  deps.getTweens().add({
    targets: marker,
    scaleX: { from: 0, to: 1.15 },
    scaleY: { from: 0, to: 1.15 },
    duration: 250,
    ease: "Back.easeOut",
    onComplete: () => {
      deps.getTweens().add({
        targets: marker,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: "Sine.easeOut"
      })
    }
  })

  item.view.qualityGlowTween = deps.getTweens().add({
    targets: marker,
    alpha: { from: hasArtifactImage ? 0.35 : 0.45, to: hasArtifactImage ? 0.55 : 0.7 },
    duration: qualityPulseDuration(item.qualityKey),
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut"
  }) as Phaser.Tweens.Tween

  if (item.revealed.outline && !item.view.borderPulseStarted) {
    item.view.border.setStrokeStyle(3, item.quality.color, 1)
    item.view.borderPulseStarted = true
    deps.getTweens().add({
      targets: item.view.border,
      alpha: { from: 1, to: 0.35 },
      duration: qualityPulseDuration(item.qualityKey),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    })
  }
}

/** 同步已揭示轮廓藏品的品质标记 */
export function syncQualityMarkersForOutlinedItem(
  deps: WarehouseManagerDeps,
  item: Artifact,
  options: Record<string, unknown> = {}
): void {
  if (!item.revealed.outline || !item.revealed.qualityCell || item.view.qualitySynced) {
    return
  }

  item.view.qualitySynced = true
  const showName = options.settlementShowName === true ? true : options.settlementShowName === false ? false : undefined
  renderQualityVisual(deps, item, {
    showName,
    settlementSkipImage: options.settlementSkipImage
  })
}

/** 揭示单个格子（标记已揭示并填充颜色） */
export function revealCell(deps: WarehouseManagerDeps, col: number, row: number): void {
  if (deps.state.revealedCells[row][col]) {
    return
  }

  deps.state.revealedCells[row][col] = true
  const x = MARGIN + col * CELL_SIZE
  const y = MARGIN + row * CELL_SIZE

  deps.state.revealCellLayer!.fillStyle(0xf1e6cc, 0.2)
  deps.state.revealCellLayer!.fillRect(x, y, CELL_SIZE, CELL_SIZE)
}
