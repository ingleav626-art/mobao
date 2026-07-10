import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { Artifact } from "../../../types/game"
import type { WarehouseSceneLike } from "./types"
import {
  GRID_COLS,
  GRID_ROWS,
  CELL_SIZE,
  MARGIN,
  CANVAS_NATIVE_HEIGHT
} from "../core/constants"
import { shuffle, qualityPulseDuration } from "../core/utils"
import { QUALITY_CONFIG } from "../data/artifacts"
import { pickBottomCellFromTargets, pickRevealTargets, type RevealMode } from "./index"

export const WarehouseRevealMixin: ThisType<WarehouseSceneThis> = {
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
        return shuffled.sort((a: Artifact, b: Artifact) => b.w * b.h - a.w * b.h)
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
      if (result.ok && result.item) {
        results.push({ ok: result.ok, item: result.item, message: result.message })
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
      ; (this as WarehouseSceneLike).dom.gameRoot!.classList.remove("reveal-flash")
      void (this as WarehouseSceneLike).dom.gameRoot!.offsetWidth
        ; (this as WarehouseSceneLike).dom.gameRoot!.classList.add("reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot!.classList.remove("reveal-flash")
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
    return pickBottomCellFromTargets(targets)
  },

  hideRevealScrollHints() {
    if ((this as WarehouseSceneLike).dom.revealHintUp) {
      ; (this as WarehouseSceneLike).dom.revealHintUp!.classList.add("hidden")
    }
    if ((this as WarehouseSceneLike).dom.revealHintDown) {
      ; (this as WarehouseSceneLike).dom.revealHintDown!.classList.add("hidden")
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
    const gameRoot = (this as WarehouseSceneLike).dom.gameRoot
    const hintTargets = (this as WarehouseSceneLike).pendingRevealHintTargets
    if (!gameRoot || !hintTargets || hintTargets.length === 0) {
      return
    }

    const canvasEl = gameRoot.querySelector("canvas")
    const canvasRenderHeight = canvasEl ? canvasEl.getBoundingClientRect().height : gameRoot.scrollHeight
    const scaleRatio = canvasRenderHeight > 0 ? canvasRenderHeight / CANVAS_NATIVE_HEIGHT : 1

    const viewportTop = gameRoot.scrollTop
    const viewportBottom = viewportTop + gameRoot.clientHeight

      ; hintTargets.forEach((item: Artifact) => {
        const top = (MARGIN + item.y * CELL_SIZE) * scaleRatio
        const bottom = (MARGIN + (item.y + item.h) * CELL_SIZE) * scaleRatio
        if (top < viewportBottom && bottom > viewportTop) {
          ; (this as WarehouseSceneLike).pendingRevealHintSeenIds!.add(item.id)
        }
      })

    if ((this as WarehouseSceneLike).pendingRevealHintSeenIds!.size >= hintTargets.length) {
      this.hideRevealScrollHints()
      return
    }

    let hasAbove = false
    let hasBelow = false

      ; hintTargets.forEach((item: Artifact) => {
        if ((this as WarehouseSceneLike).pendingRevealHintSeenIds!.has(item.id)) {
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
      ; (this as WarehouseSceneLike).dom.revealHintUp!.style.top = `${baseTop}px`
        ; (this as WarehouseSceneLike).dom.revealHintUp!.textContent = `${(this as WarehouseSceneLike).pendingRevealHintText}（上方）`
        ; (this as WarehouseSceneLike).dom.revealHintUp!.classList.toggle("hidden", !hasAbove)
    }
    if ((this as WarehouseSceneLike).dom.revealHintDown) {
      ; (this as WarehouseSceneLike).dom.revealHintDown!.style.top = `${baseTop + 36}px`
        ; (this as WarehouseSceneLike).dom.revealHintDown!.textContent = `${(this as WarehouseSceneLike).pendingRevealHintText}（下方）`
        ; (this as WarehouseSceneLike).dom.revealHintDown!.classList.toggle("hidden", !hasBelow)
    }

    if (!hasAbove && !hasBelow) {
      this.hideRevealScrollHints()
    }
  },

  pickRevealTargets({ mode, count, category, allowCategoryFallback, sortStrategy }: { mode: string; count: number; category: string | null; allowCategoryFallback: boolean; sortStrategy: string | null }): Artifact[] {
    return pickRevealTargets((this as WarehouseSceneLike).items, { mode: mode as RevealMode, count, category, allowCategoryFallback, sortStrategy })
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
      const root = (this as WarehouseSceneLike).dom.gameRoot!
        ; root.classList.remove("reveal-flash")
      void root.offsetWidth
        ; root.classList.add("reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot!.classList.remove("reveal-flash")
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
      pixelX = MARGIN + item.revealed.qualityCell!.x * CELL_SIZE
      pixelY = MARGIN + item.revealed.qualityCell!.y * CELL_SIZE
      areaW = CELL_SIZE
      areaH = CELL_SIZE
    }

    const cx = pixelX + areaW / 2
    const cy = pixelY + areaH / 2

    if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
      const root = (this as WarehouseSceneLike).dom.gameRoot!
        ; root.classList.remove("quality-reveal-flash")
      void root.offsetWidth
        ; root.classList.add("quality-reveal-flash")
      setTimeout(() => {
        if ((this as WarehouseSceneLike).dom && (this as WarehouseSceneLike).dom.gameRoot) {
          ; (this as WarehouseSceneLike).dom.gameRoot!.classList.remove("quality-reveal-flash")
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
      ? { x: item.view.artifactImage!.scaleX, y: item.view.artifactImage!.scaleY }
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

      ; (this as WarehouseSceneLike).revealCellLayer!.fillStyle(0xf1e6cc, 0.2)
      ; (this as WarehouseSceneLike).revealCellLayer!.fillRect(x, y, CELL_SIZE, CELL_SIZE)
  }
}
