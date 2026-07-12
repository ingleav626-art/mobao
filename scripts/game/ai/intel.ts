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
  getNeighborOffsets
} from "./intel/pure"

export const AiIntelMixin: ThisType<WarehouseSceneThis> = Object.assign(
  {},
  InitMixin,
  SnapshotMixin,
  RevealMixin,
  PanelMixin,
  ActionMixin
)
