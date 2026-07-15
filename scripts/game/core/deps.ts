/**
 * @file core/deps.js
 * @module core/deps
 * @description 依赖注入容器。解决模块拆分后局部变量（如 LLM_BRIDGE）无法
 *              被其他 ES Module 访问的问题。所有共享依赖统一在此注册，模块
 *              通过 `import { Deps }` 获取，避免 `window.XXX` 隐式传递。
 *
 * 使用方式：
 *   1. main.js 初始化时调用 initDeps({ LLM_BRIDGE, ... })
 *   2. 其他模块：import { Deps } from '../core/deps.js'
 *   3. 使用：Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(...)
 *
 * 优点：
 *   - 显式依赖，IDE 可追踪引用
 *   - 单一入口，排查变量不可见问题时只需检查此处
 *   - 不依赖 window 全局作用域
 *
 * @requires core/deps - 依赖注入容器
 *
 * @exports Deps - 依赖注入容器对象
 * @exports initDeps - 初始化依赖注入容器函数
 */

import type { LlmBridge } from "../../../types/llm"

/** 战绩记录桥接器方法接口（createBattleRecordBridge 返回的 methods 对象） */
export interface BattleRecordBridgeMethods {
  openBattleRecordPanel(): void
  closeBattleRecordPanel(): void
  buildWarehouseSnapshotForRecord(): unknown
  saveBattleRecord(result: { won: boolean; profit: number; bidAmount: number; trueValue: number; round: number }): void
  renderBattleRecordPanel(): void
  openBattleRecordReplay(recordId: string): void
  openBattleRecordLogs(recordId: string, page: number): void
  closeBattleRecordLogs(): void
  deleteBattleRecord(recordId: string): void
  restoreWarehouseFromBattleRecord(record: { id: string; data: Record<string, unknown> }): void
  renderBattleRecordLogView(): void
  renderBattleRecordSummary(): void
}

/** 战绩记录桥接器完整接口（createBattleRecordBridge 返回值） */
export interface BattleRecordBridge {
  methods: BattleRecordBridgeMethods
  loadBattleRecords(): unknown[]
  saveBattleRecords(records: unknown[]): void
  formatRecordTime(iso: string): string
}

/** 结算桥接器方法接口（createSettlementBridge 返回的 methods 对象） */
export interface SettlementBridgeMethods {
  revealAllArtifactsForSettlement(): Promise<void>
  isSettlementPageActive(): boolean
  playSettlementRevealStep(item: unknown): Promise<void>
  playSettlementSearchEffect(item: unknown, runToken: unknown): Promise<void>
  enterSettlementPage(winnerPlayer: unknown, winnerBid: number, reasonText: string): void
  exitSettlementPage(): void
  cancelSettlementReveal(): void
  setSettlementProgress(text: string, progress: number): void
  updateSettlementPanelMetrics(revealedValue: number, winnerProfit: number): void
  showSelfProfit(selfProfit: number, label: string): void
  playSettlementFinalEffect(winnerProfit: number): void
  triggerSettlementFinalAnimation(winnerProfit: number, isSelfWinner: boolean): void
}

/** 结算桥接器完整接口（createSettlementBridge 返回值） */
export interface SettlementBridge {
  methods: SettlementBridgeMethods
}

export const Deps: {
  LLM_BRIDGE: LlmBridge | null
  BATTLE_RECORD_BRIDGE: BattleRecordBridge | null
  SETTLEMENT_BRIDGE: SettlementBridge | null
} = {
  LLM_BRIDGE: null,
  BATTLE_RECORD_BRIDGE: null,
  SETTLEMENT_BRIDGE: null
}

/**
 * 初始化所有共享依赖（在 main.js 桥接层创建后调用）
 * @param bridges 桥接器对象集合（结构不确定，使用 unknown 强制类型检查）
 */
export function initDeps(bridges: Record<string, unknown>): void {
  Object.assign(Deps, bridges)
}
