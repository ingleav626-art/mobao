/**
 * @file scripts/game/ai/intel.ts
 * @module ai/intel
 * @description AI 情报系统薄入口。通过 Object.assign 合并 5 个子 Mixin
 *              （Init/Snapshot/Reveal/Panel/Action），并 re-export 纯函数。
 *              原 1673 行 God Object 已按职责拆分到 intel/ 目录。
 *
 * @exports AiIntelMixin - AI 情报系统 Mixin，混入 Phaser Scene
 * @exports 纯函数 - pickRandomItemCell, calcHighValuePriceThreshold 等
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

import { InitMixin } from "./intel/init"
import { SnapshotMixin } from "./intel/snapshot"
import { RevealMixin } from "./intel/reveal"
import { PanelMixin } from "./intel/panel"
import { ActionMixin } from "./intel/action"

export {
  pickRandomItemCell,
  calcHighValuePriceThreshold,
  checkHighValueArtifact,
  determineRevealLevel,
  truncateCandidateList,
  formatIntelActionPublicLine,
  buildNeighborStateLabel,
  getNeighborOffsets,
  calcUncertainty,
  calcAvailableActionState
} from "./intel/pure"

export const AiIntelMixin: ThisType<WarehouseSceneThis> = Object.assign(
  {},
  InitMixin,
  SnapshotMixin,
  RevealMixin,
  PanelMixin,
  ActionMixin
)
