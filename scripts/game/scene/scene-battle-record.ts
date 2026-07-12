/**
 * @file scene/scene-battle-record.ts
 * @module scene/battle-record
 * @description 战绩记录代理方法。
 *              大部分方法已通过 main.ts 的 Object.assign(WarehouseScene.prototype,
 *              BATTLE_RECORD_BRIDGE.methods) 直接摊到原型上，无需手写代理函数。
 *
 *              本文件仅保留别名 wrapper：
 *                - buildWarehouseSnapshotForSync: 调用 this.buildWarehouseSnapshotForRecord()
 *                  供 lan/sync、lan/game-flow 以"同步快照"语义调用，与 bridge 方法名不同。
 */

import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

export function buildWarehouseSnapshotForSync(this: WarehouseSceneThis): unknown {
  return this.buildWarehouseSnapshotForRecord()
}
