/**
 * @file warehouse-manager/types.ts
 * @module warehouse/warehouse-manager/types
 * @description WarehouseManager 依赖接口和状态接口
 */
import type { Artifact } from "../../../../types/game"

/** 仓库管理器可变状态（Manager 直接读写此对象） */
export interface WarehouseManagerState {
  gridLayer: Phaser.GameObjects.Graphics | null
  revealCellLayer: Phaser.GameObjects.Graphics | null
  itemLayer: Phaser.GameObjects.Container | null
  items: Artifact[]
  revealedCells: boolean[][]
  warehouseCellIndex: Record<string, string>
  selectedItem: Artifact | null
  previewAnchor: { x: number; y: number }
  previewOpenTick: number
  pendingRevealHintTargets: Artifact[] | null
  pendingRevealHintText: string
  pendingRevealHintSeenIds: Set<string> | null
  warehouseTrueValue: number
  aiMaxBid: number
  currentBid: number
}

/** WarehouseManager 依赖接口 */
export interface WarehouseManagerDeps {
  /** Phaser Textures 管理器（预加载藏品图片、检测纹理存在），getter 防止静态引用 bug */
  getTextures: () => Phaser.Textures.TextureManager
  /** Phaser Loader 插件（异步加载藏品缩略图），getter 防止静态引用 bug */
  getLoad: () => Phaser.Loader.LoaderPlugin
  /** Phaser GameObjects 工厂（创建 graphics/container/rectangle/zone/image），getter 防止静态引用 bug */
  getAdd: () => Phaser.Scene["add"]
  /** Phaser Time 时钟（延迟调用），getter 防止静态引用 bug */
  getTime: () => Phaser.Time.Clock
  /** Phaser Tweens 补间动画管理器，getter 防止静态引用 bug */
  getTweens: () => Phaser.Tweens.TweenManager
  /** Phaser Input 输入插件（光标设置），getter 防止静态引用 bug */
  getInput: () => Phaser.Input.InputPlugin

  /** 可变状态（引用，Manager 直接修改此对象属性） */
  state: WarehouseManagerState

  /** DOM 元素映射（引用，预览弹窗/提示/出价输入等） */
  dom: Record<string, HTMLElement | null>

  /** 藏品管理器（候选查询、库统计、随机生成） */
  artifactManager: {
    getCandidatesByRevealState(state: Record<string, unknown>): Artifact[]
    getLibraryStats(): { total: number }
    createRandomArtifactForSlot(options: Record<string, unknown>): Artifact
  }

  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 获取是否已结算（动态值） */
  getSettled: () => boolean
  /** 获取回合是否正在结算中（动态值） */
  getRoundResolving: () => boolean
  /** 获取是否为结算揭示模式（动态值） */
  getIsSettlementRevealMode: () => boolean
  /** 获取地图品类权重（动态值，spawnRandomItems 用） */
  getMapCategoryWeights: () => Record<string, number> | null
  /** 获取地图品质权重（动态值，spawnRandomItems 用） */
  getMapQualityWeights: () => Record<string, number> | null

  /** 结算页面是否激活（跨 Mixin 回调） */
  isSettlementPageActive: () => boolean
  /** 写入日志（跨 Mixin 回调） */
  writeLog: (msg: string) => void
  /** 刷新 HUD（跨 Mixin 回调） */
  updateHud: () => void
}