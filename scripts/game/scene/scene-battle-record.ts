/**
 * @file scene/scene-battle-record.ts
 * @module scene/battle-record
 * @description 战绩记录代理方法。所有方法委托给 BATTLE_RECORD_BRIDGE 桥接层，
 *              不包含业务实现逻辑，仅做转发。
 *
 * 拆分说明：
 *   - 本文件仅包含"代理方法"（定义与初始化的转发逻辑）
 *   - 真正的实现逻辑在 bridge/battle-record.ts 中
 *   - 无需二次迁移
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import { Deps } from "../core/deps"

type BattleRecordBridge = {
  methods: {
    openBattleRecordPanel: (this: WarehouseSceneThis) => void
    closeBattleRecordPanel: (this: WarehouseSceneThis) => void
    buildWarehouseSnapshotForRecord: (this: WarehouseSceneThis) => unknown
    saveBattleRecord: (
      this: WarehouseSceneThis,
      result: { won: boolean; profit: number; bidAmount: number; trueValue: number; round: number }
    ) => void
    renderBattleRecordPanel: (this: WarehouseSceneThis) => void
    openBattleRecordReplay: (this: WarehouseSceneThis, recordId: string) => void
    openBattleRecordLogs: (this: WarehouseSceneThis, recordId: string, page: number) => void
    closeBattleRecordLogs: (this: WarehouseSceneThis) => void
    deleteBattleRecord: (this: WarehouseSceneThis, recordId: string) => void
    restoreWarehouseFromBattleRecord: (
      this: WarehouseSceneThis,
      record: { id: string; data: Record<string, unknown> }
    ) => void
    renderBattleRecordLogView: (this: WarehouseSceneThis) => void
    renderBattleRecordSummary: (this: WarehouseSceneThis) => void
  }
}

function getBridge(): BattleRecordBridge {
  return Deps.BATTLE_RECORD_BRIDGE as unknown as BattleRecordBridge
}

export function openBattleRecordPanel(this: WarehouseSceneThis): void {
  return getBridge().methods.openBattleRecordPanel.call(this)
}

export function closeBattleRecordPanel(this: WarehouseSceneThis): void {
  return getBridge().methods.closeBattleRecordPanel.call(this)
}

export function buildWarehouseSnapshotForSync(this: WarehouseSceneThis): unknown {
  return this.buildWarehouseSnapshotForRecord()
}

export function buildWarehouseSnapshotForRecord(this: WarehouseSceneThis): unknown {
  return getBridge().methods.buildWarehouseSnapshotForRecord.call(this)
}

export function saveBattleRecord(
  this: WarehouseSceneThis,
  result: { won: boolean; profit: number; bidAmount: number; trueValue: number; round: number }
): void {
  return getBridge().methods.saveBattleRecord.call(this, result)
}

export function renderBattleRecordPanel(this: WarehouseSceneThis): void {
  return getBridge().methods.renderBattleRecordPanel.call(this)
}

export function openBattleRecordReplay(this: WarehouseSceneThis, recordId: string): void {
  return getBridge().methods.openBattleRecordReplay.call(this, recordId)
}

export function openBattleRecordLogs(this: WarehouseSceneThis, recordId: string, page: number = 1): void {
  return getBridge().methods.openBattleRecordLogs.call(this, recordId, page)
}

export function closeBattleRecordLogs(this: WarehouseSceneThis): void {
  return getBridge().methods.closeBattleRecordLogs.call(this)
}

export function deleteBattleRecord(this: WarehouseSceneThis, recordId: string): void {
  return getBridge().methods.deleteBattleRecord.call(this, recordId)
}

export function restoreWarehouseFromBattleRecord(
  this: WarehouseSceneThis,
  record: { id: string; data: Record<string, unknown> }
): void {
  return getBridge().methods.restoreWarehouseFromBattleRecord.call(this, record)
}

export function renderBattleRecordLogView(this: WarehouseSceneThis): void {
  return getBridge().methods.renderBattleRecordLogView.call(this)
}

export function renderBattleRecordSummary(this: WarehouseSceneThis): void {
  return getBridge().methods.renderBattleRecordSummary.call(this)
}
