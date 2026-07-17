/**
 * @file types/game.d.ts
 * @description 游戏核心类型定义。涵盖藏品、品质、玩家、技能、道具、地图、角色等基础数据结构。
 *              供 JavaScript 文件通过 JSDoc @type 注释引用，提供 IDE 智能补全和类型检查。
 */

/// <reference path="./ai.d.ts" />

// ==================== 藏品相关 ====================

/** 品质等级 */
export type QualityLevel = 'poor' | 'normal' | 'fine' | 'rare' | 'legendary'

/** 品质配置 */
export interface QualityConfig {
  label: string       // "粗品" | "良品" | "精品" | "珍品" | "绝品"
  color: number       // 颜色值（hex）
  glow: number        // 发光色
  weight: number      // 生成权重
}

/** 藏品库定义（图鉴中的静态定义） */
export interface ArtifactDef {
  key: string               // 唯一标识 "porcelain-taowan"
  majorCategory: string     // 大类 "古董" | "珠宝首饰"
  category: string          // 品类 "瓷器" | "玉器" | ...
  name: string              // 展示名 "陶碗"
  basePrice: number         // 基础价格
  qualityKey: QualityLevel  // 品质键
  w: number                 // 宽度（格）
  h: number                 // 高度（格）
}

/** 运行时藏品实例（生成后带位置和ID） */
export interface Artifact extends ArtifactDef {
  id: string                // 运行时唯一ID "artifact-1"
  quality: QualityConfig    // 完整品质配置对象
  x: number                 // 列坐标
  y: number                 // 行坐标
  revealed: ArtifactRevealState  // 揭示状态
  trueValue: number         // 揭示价值（运行时计算）
  expectedPrice: number     // 估算价格（运行时计算）
  previewSizeTag: string    // 预览尺寸标签（运行时）
  view: ArtifactView        // 渲染视图对象（运行时）
}

/** 藏品揭示状态 */
export interface ArtifactRevealState {
  outline: boolean                          // 轮廓是否揭示
  qualityCell: { x: number; y: number } | null  // 品质格坐标
  exact: boolean                            // 是否完全揭示
  settlementPreRevealed?: boolean           // 结算前是否已揭示
}

/** 藏品渲染视图 */
export interface ArtifactView {
  silhouette: Phaser.GameObjects.Rectangle
  border: Phaser.GameObjects.Rectangle
  qualityMarkers: Phaser.GameObjects.Container
  clickZone: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Zone
  artifactImage: Phaser.GameObjects.Image | null
  borderPulseStarted: boolean
  qualitySynced: boolean
  qualityGlowTween: Phaser.Tweens.Tween | null
}

/** 候选藏品（用于信号分析时的中间状态） */
export interface CandidateArtifact extends ArtifactDef {
  revealedQualityKey: QualityLevel | null
  revealedQualityLabel: string
  expectedPrice: number
  previewSizeTag: string
}

/** 品类权重 */
export interface CategoryWeight {
  key: string     // 品类名
  weight: number  // 权重值
}

/** 候选价格统计 */
export interface CandidatePriceStats {
  count: number
  mean: number
  top2Mean: number
  bottom2Mean: number
  std: number
  p10: number
  q1: number
  q3: number
  p90: number
  iqr: number
  spreadRatio: number
  upperEdge: number
  lowerEdge: number
}

// ==================== 玩家相关 ====================

/** 玩家对象 */
export interface Player {
  id: string           // "p1" | "p2" | "p3" | "p4"
  name: string         // "左上AI" | "玩家" | "右上AI" | "右下AI"
  avatar: string       // 头像标识 "A1" | "你" | "A2" | "A3"
  isHuman: boolean     // 是否人类玩家（包括自己和联机其他人类）
  isAI: boolean        // 是否AI玩家
  isSelf: boolean      // 是否本地玩家自己
  money?: number       // 玩家当前金钱（联机同步用）
  characterId?: string | null    // 角色ID
  characterName?: string          // 角色名（运行时填充）
  carryItems?: string[]           // 携带道具ID列表
  lanId?: string                  // 联机ID（联机模式）
}

/** AI 玩家钱包 */
export interface AiWallet {
  [playerId: string]: number   // "p1": 1000000
}

// ==================== 技能/道具相关 ====================

/** 技能定义 */
export interface SkillDef {
  id: string              // "skill-outline-scan"
  name: string            // "技能-拓影侦测"
  description: string     // 效果描述
  maxPerRound: number     // 每局最大使用次数
  execute: (context: RevealContext) => RevealResult
}

/** 道具定义 */
export interface ItemDef {
  id: string              // "item-outline-lamp"
  name: string            // "道具-轮廓探灯"
  label: string           // 显示标签
  description: string
  type?: string           // 道具类型
  cost?: number           // 商店价格
  execute: (context: RevealContext) => RevealResult
}

/** 携带道具 */
export interface CarryItem {
  id: string              // 道具ID
  name: string            // 道具名称
  icon: string            // 道具图标
}

/** 揭示操作上下文 */
export interface RevealContext {
  count?: number
  category?: string
  allowCategoryFallback?: boolean
  sortStrategy?: string   // "largestFirst"
  revealOutline?: (opts: { count: number }) => RevealResult
  revealQuality?: (opts: RevealContext) => RevealResult
  revealAll?: (opts: RevealContext) => RevealResult
}

export interface SkillContext {
  revealOutline(opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }): unknown
  revealQuality(opts: { count: number; category: string | null; allowCategoryFallback?: boolean; sortStrategy: string | null }): unknown
  revealAll(opts: { count: number; sortStrategy: string; category: string | null; allowCategoryFallback: boolean }): unknown
  revealByQuality?(opts: { qualityKey: string }): unknown
  revealByCategory?(opts: { category: string }): unknown
  computeAveragePrice?(opts: { scope: string }): unknown
  applyProfitModifier?(opts: { target: string; percent: number }): unknown
}

/** 揭示操作结果 */
export interface RevealResult {
  ok: boolean
  revealed: number
  message: string
  signalStats?: AiSignalStats
}

// ==================== 地图相关 ====================

/** 地图配置 */
export interface MapProfile {
  id: string              // "standard"
  name: string            // "标准仓库"
  desc: string            // 描述
  icon: string            // 图标路径
  background: string | null  // 背景图路径（可能为空）
  params: MapParams
}

/** 地图参数 */
export interface MapParams {
  maxRounds: number            // 最大轮数
  directTakeRatio: number      // 提前获胜系数（如 0.2 表示 +=20%）
  qualityWeights: Record<QualityLevel, number>
  categoryWeights: Record<string, number>
}

// ==================== 角色相关 ====================

/** 角色被动效果 */
export interface PassiveEffect {
  type: 'profitBonus' | 'outlineBonus' | 'qualityBonus' | 'outlineSmallestPriority' | 'bidBonus'
  value: number
  label: string        // 中文描述 "盈利加成+10%"
}

/** 角色定义 */
export interface Character {
  id: string              // "appraiser"
  name: string            // "鉴定师"
  desc: string            // "精准识宝，稳扎稳打"
  avatar: string | null   // 头像路径（可能为空）
  live2d: string | null   // Live2D视频路径（可能为空）
  skillId: string         // 关联技能ID
  skillName: string       // "玉脉鉴质"
  skillDesc: string       // 技能详细描述
  passive: PassiveEffect
  unlockCondition: string // 解锁条件描述
  unlocked: boolean       // 是否已解锁
}

/** 角色分配（AI玩家的角色选择结果） */
export interface CharacterAssignment {
  characterId: string
  characterName: string
  skillName: string
  passive: PassiveEffect
}

// ==================== 设置/状态相关 ====================

/** 游戏设置 */
export interface GameSettings {
  maxRounds: number          // 最大回合数
  directTakeRatio: number    // 提前获胜系数
  bidStep: number            // 出价步长
  aiCount: number            // AI数量
  startingMoney: number      // 初始资金
  artifactCount: number      // 藏品数量
  occupancyMin: number       // 最小占用率
  occupancyMax: number       // 最大占用率
}

/** 应用全局状态 */
export interface AppState {
  gameStarted: boolean
  currentScene: string       // "lobby" | "warehouse"
  isLanMode: boolean
  selectedMap: string
  selectedCharacter: string | null
}

/** 依赖注入容器（所有共享桥接器） */
export interface DepsContainer {
  LLM_BRIDGE: object | null
  BATTLE_RECORD_BRIDGE: object | null
  SETTLEMENT_BRIDGE: object | null
}