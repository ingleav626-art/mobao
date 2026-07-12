/**
 * @file bridge/battle-record/restore
 * @module bridge/battle-record/restore
 * @description 仓库恢复 slice。从战绩记录的仓库快照重建 Phaser 仓库场景。
 *              从 battle-record.ts 工厂闭包提取，接收 deps 注入。
 *
 * @exports createRestoreSlice - 仓库恢复 slice 工厂，返回 { methods }
 */
import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"
import type { BattleRecordDeps, BattleRecord, WarehouseSnapshotItem } from "./types"
import { QUALITY_CONFIG } from "../../data/artifacts"
import type { Artifact, QualityLevel, QualityConfig } from "../../../../types/game"

export function createRestoreSlice(deps: BattleRecordDeps): {
  methods: ThisType<WarehouseSceneThis>
} {
  const { GRID_COLS, GRID_ROWS, clamp } = deps

  const methods: ThisType<WarehouseSceneThis> = {
    restoreWarehouseFromBattleRecord(record: BattleRecord) {
      this.drawUnknownWarehouse()

      if (this.itemLayer) {
        this.itemLayer.destroy(true)
      }
      this.itemLayer = this.add.container(0, 0)
      this.items = []
      this.warehouseTrueValue = 0

      const qualityConfig = QUALITY_CONFIG
      const snapshotItems: WarehouseSnapshotItem[] =
        record && record.warehouse && Array.isArray(record.warehouse.items) ? record.warehouse.items : []

      const imagesToLoad: string[] = []
      snapshotItems.forEach((saved: WarehouseSnapshotItem) => {
        if (saved.key) {
          const textureKey = `artifact-${saved.key}`
          if (!this.textures.exists(textureKey)) {
            imagesToLoad.push(saved.key)
          }
        }
      })

      const renderItems = () => {
        snapshotItems.forEach((saved: WarehouseSnapshotItem, idx: number) => {
          const qualityKey = saved.qualityKey && qualityConfig[saved.qualityKey] ? saved.qualityKey : "normal"
          const quality = qualityConfig[qualityKey] || { label: "良品", color: 0x2f78ff, glow: 0x9ec0ff, weight: 1 }
          const safeW = clamp(Math.max(1, Math.round(Number(saved.w) || 1)), 1, GRID_COLS)
          const safeH = clamp(Math.max(1, Math.round(Number(saved.h) || 1)), 1, GRID_ROWS)
          const maxX = Math.max(0, GRID_COLS - safeW)
          const maxY = Math.max(0, GRID_ROWS - safeH)
          const safeX = clamp(Math.max(0, Math.round(Number(saved.x) || 0)), 0, maxX)
          const safeY = clamp(Math.max(0, Math.round(Number(saved.y) || 0)), 0, maxY)
          const trueValue = Math.max(0, Math.round(Number(saved.trueValue) || 0))

          const item: Artifact = {
            id: String(saved.id || `record-item-${idx}`),
            key: saved.key || "record-snapshot",
            majorCategory: saved.category || "未知",
            category: saved.category || "未知",
            name: saved.name || `藏品${idx + 1}`,
            basePrice: trueValue,
            qualityKey: qualityKey as QualityLevel,
            trueValue,
            quality: quality as QualityConfig,
            expectedPrice: trueValue,
            previewSizeTag: "normal",
            w: safeW,
            h: safeH,
            x: safeX,
            y: safeY,
            revealed: {
              outline: false,
              qualityCell: null,
              exact: true,
              settlementPreRevealed: true
            },
            view: {
              silhouette: null as unknown as Phaser.GameObjects.Rectangle,
              border: null as unknown as Phaser.GameObjects.Rectangle,
              qualityMarkers: null as unknown as Phaser.GameObjects.Container,
              clickZone: null as unknown as Phaser.GameObjects.Rectangle,
              artifactImage: null,
              borderPulseStarted: false,
              qualitySynced: false,
              qualityGlowTween: null
            }
          } as Artifact

          this.renderItem(item)
          this.revealOutline(item, { settlementShowName: true, skipEffects: true })
          item.revealed.qualityCell = { x: item.x, y: item.y }
          item.revealed.exact = true
          this.renderQualityVisual(item, { showName: true })
          this.items.push(item)
          this.warehouseTrueValue += item.trueValue
        })

        this.rebuildWarehouseCellIndex()
        this.drawGridLines()
      }

      if (imagesToLoad.length > 0) {
        console.log(`[战绩复现] 需要加载 ${imagesToLoad.length} 张图片:`, imagesToLoad)
        imagesToLoad.forEach((key) => {
          const textureKey = `artifact-${key}`
          this.load.image(textureKey, `assets/images/artifacts/thumbs/${key}.png`)
        })
        const onComplete = () => {
          console.log("[战绩复现] 图片加载完成")
          ;(this.load as unknown as Phaser.Events.EventEmitter).off("complete", onComplete)
          renderItems()
        }
        this.load.on("complete", onComplete)
        this.load.start()
      } else {
        renderItems()
      }
    }
  }

  return { methods }
}
