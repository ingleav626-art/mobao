/**
 * @file scene/scene-settlement.ts
 * @module scene/settlement
 * @description 结算代理方法。所有方法委托给 SETTLEMENT_BRIDGE 桥接层，
 *              不包含业务实现逻辑，仅做转发。
 *
 * 拆分说明：
 *   - 本文件仅包含"代理方法"（定义与初始化的转发逻辑）
 *   - 真正的实现逻辑在 bridge/settlement.ts 中
 *   - 无需二次迁移
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { Deps } from "../core/deps"

type SettlementBridge = {
  methods: {
    revealAllArtifactsForSettlement: (this: WarehouseSceneThis) => Promise<void>
    isSettlementPageActive: (this: WarehouseSceneThis) => boolean
    playSettlementRevealStep: (this: WarehouseSceneThis, item: unknown) => Promise<void>
    playSettlementSearchEffect: (this: WarehouseSceneThis, item: unknown, runToken: unknown) => Promise<void>
    enterSettlementPage: (
      this: WarehouseSceneThis,
      winnerPlayer: unknown,
      winnerBid: number,
      reasonText: string
    ) => void
    exitSettlementPage: (this: WarehouseSceneThis) => void
    cancelSettlementReveal: (this: WarehouseSceneThis) => void
    setSettlementProgress: (this: WarehouseSceneThis, text: string, progress: number) => void
    updateSettlementPanelMetrics: (this: WarehouseSceneThis, revealedValue: number, winnerProfit: number) => void
    showSelfProfit: (this: WarehouseSceneThis, selfProfit: number, label: string) => void
    playSettlementFinalEffect: (this: WarehouseSceneThis, winnerProfit: number) => void
    triggerSettlementFinalAnimation: (this: WarehouseSceneThis, winnerProfit: number, isSelfWinner: boolean) => void
  }
}

function getBridge(): SettlementBridge {
  return Deps.SETTLEMENT_BRIDGE as unknown as SettlementBridge
}

export async function revealAllArtifactsForSettlement(this: WarehouseSceneThis): Promise<void> {
  return getBridge().methods.revealAllArtifactsForSettlement.call(this)
}

export function isSettlementPageActive(this: WarehouseSceneThis): boolean {
  return getBridge().methods.isSettlementPageActive.call(this)
}

export async function playSettlementRevealStep(this: WarehouseSceneThis, item: unknown): Promise<void> {
  return getBridge().methods.playSettlementRevealStep.call(this, item)
}

export async function playSettlementSearchEffect(
  this: WarehouseSceneThis,
  item: unknown,
  runToken: unknown
): Promise<void> {
  return getBridge().methods.playSettlementSearchEffect.call(this, item, runToken)
}

export function enterSettlementPage(
  this: WarehouseSceneThis,
  winnerPlayer: unknown,
  winnerBid: number,
  reasonText: string
): void {
  return getBridge().methods.enterSettlementPage.call(this, winnerPlayer, winnerBid, reasonText)
}

export function exitSettlementPage(this: WarehouseSceneThis): void {
  return getBridge().methods.exitSettlementPage.call(this)
}

export function cancelSettlementReveal(this: WarehouseSceneThis): void {
  return getBridge().methods.cancelSettlementReveal.call(this)
}

export function setSettlementProgress(this: WarehouseSceneThis, text: string, progress: number): void {
  return getBridge().methods.setSettlementProgress.call(this, text, progress)
}

export function updateSettlementPanelMetrics(
  this: WarehouseSceneThis,
  revealedValue: number,
  winnerProfit: number
): void {
  return getBridge().methods.updateSettlementPanelMetrics.call(this, revealedValue, winnerProfit)
}

export function showSelfProfit(this: WarehouseSceneThis, selfProfit: number, label: string): void {
  return getBridge().methods.showSelfProfit.call(this, selfProfit, label)
}

export function playSettlementFinalEffect(this: WarehouseSceneThis, winnerProfit: number): void {
  return getBridge().methods.playSettlementFinalEffect.call(this, winnerProfit)
}

export function triggerSettlementFinalAnimation(
  this: WarehouseSceneThis,
  winnerProfit: number,
  isSelfWinner: boolean
): void {
  return getBridge().methods.triggerSettlementFinalAnimation.call(this, winnerProfit, isSelfWinner)
}
