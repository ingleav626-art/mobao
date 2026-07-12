/**
 * @file bridge/battle-record.ts
 * @module bridge/battle-record
 * @description 战绩记录系统 Bridge 薄入口工厂。通过 slice 工厂模式组装 5 个子模块
 *              （persist/panel/log-view/replay/restore），并 re-export 纯函数。
 *              原 908 行工厂已按职责拆分到 battle-record/ 目录。
 *
 * 核心职责：
 *   - 战绩持久化：saveBattleRecord / loadBattleRecords（persist slice）
 *   - 战绩面板：openBattleRecordPanel / renderBattleRecordPanel（panel slice）
 *   - AI决策日志：openBattleRecordLogs / renderBattleRecordLogView（log-view slice）
 *   - 对局复现：openBattleRecordReplay（replay slice）
 *   - 仓库恢复：restoreWarehouseFromBattleRecord（restore slice）
 *
 * @exports createBattleRecordBridge - 工厂函数，返回 { methods, loadBattleRecords, saveBattleRecords, formatRecordTime }
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"
import type { BattleRecordDeps } from "./battle-record/types"

import { createPersistSlice } from "./battle-record/persist"
import { createPanelSlice } from "./battle-record/panel"
import { createLogViewSlice } from "./battle-record/log-view"
import { createReplaySlice } from "./battle-record/replay"
import { createRestoreSlice } from "./battle-record/restore"
import { formatRecordTime } from "./battle-record/pure"

/**
 * 创建战绩记录桥接器。管理最近20局的战绩记录，支持详情查看和日志渲染
 * @param {BattleRecordDeps} deps - 依赖注入对象
 * @returns {Record<string, unknown>} 战绩记录方法集合
 */
export function createBattleRecordBridge(deps: BattleRecordDeps) {
  const persist = createPersistSlice(deps)
  const panel = createPanelSlice(deps)
  const logView = createLogViewSlice(deps)
  const replay = createReplaySlice(deps)
  const restore = createRestoreSlice(deps)

  const methods: ThisType<WarehouseSceneThis> = Object.assign(
    {},
    persist.methods,
    panel.methods,
    logView.methods,
    replay.methods,
    restore.methods
  )

  return {
    methods,
    loadBattleRecords: persist.loadBattleRecords,
    saveBattleRecords: persist.saveBattleRecords,
    formatRecordTime
  }
}
