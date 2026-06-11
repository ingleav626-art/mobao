/**
 * @file types/globals.d.ts
 * @description 全局变量声明。本项目通过 <script> 标签加载 JS 模块，
 *              大量变量挂载在 window 或全局作用域。此文件为 TS 编译器提供类型声明。
 */

// ==================== 全局变量 ====================

declare var GAME_SETTINGS: {
  maxRounds: number
  roundSeconds: number
  actionsPerRound: number
}

declare var SKILL_DEFS: Array<{ id: string; name: string; description: string; maxPerRound: number }>

declare var ITEM_DEFS: Array<{ id: string; name: string; description: string }>

declare var MobaoAnimations: {
  animateOverlayOpen(el: Element): void
  animateOverlayClose(el: Element): void
  staggerEnter(els: Element[], opts?: Record<string, any>): void
  scrollToNumber(el: Element, num: number, opts?: Record<string, any>): void
  togglePauseVisual(el: Element, paused: boolean, timer: Element): void
  animateProfit(el: Element, val: number): void
}

// AudioManager 和 AudioUI 已在 TS 文件中定义，不再需要全局声明

declare var CharacterSystem: {
  getOutlineBonus(): number
  getQualityBonus(): number
  getOutlineSortStrategy(): string
  applyPassiveEffect(params: { profit: number }): { profit: number; bonus?: number; label?: string }
}

declare var Overlay: Record<string, any>

declare var ItemSystem: {
  ITEM_DEFS: Array<{ id: string; name: string; description: string }>
}

declare var SkillSystem: {
  SKILL_DEFS: Array<{ id: string; name: string; description: string; maxPerRound: number }>
}

declare var MobileHandler: Record<string, any>

declare var PublicEventSystem: Record<string, any>

declare var LlmManager: Record<string, any>

declare var ArtifactData: {
  QUALITY_CONFIG: Record<string, { label: string; color: number; glow: number; weight: number }>
}

// ==================== Window 属性 ====================

interface Window {
  MobaoShopBridge: Record<string, any>
  MobaoBattleRecordBridge: Record<string, any>
  MobaoSettlementBridge: Record<string, any>
  MobaoRoundManager: Record<string, any>
  MobaoSettlementManager: Record<string, any>
  MobaoSkillItemManager: Record<string, any>
  MobaoAnimations: typeof MobaoAnimations
  MobaoAppState: {
    load(): Record<string, any>
    recordGameFinished(won: boolean, profit: number): void
  }
  MobaoSettings: {
    savePlayerMoney(money: number): void
  }
  CharacterSystem: typeof CharacterSystem
  ArtifactData: typeof ArtifactData
  AudioUI: Record<string, any>
  AudioManager: Record<string, any>
  Deps: Record<string, any>
  initDeps: (bridges: Record<string, any>) => void
}