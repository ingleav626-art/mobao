/**
 * @file scripts/game/ui/overlay.ts
 * @module ui/overlay
 * @description 弹窗与覆盖层管理薄入口。通过 Object.assign 合并 7 个子 Mixin
 *              （Core/InfoPopup/DetailPopup/Settings/LanDialog/Collection/AiModelConfig），
 *              并 re-export 纯函数。原 957 行 God Object 已按职责拆分到 overlay/ 目录。
 *
 * @exports UiOverlayMixin - 弹窗与覆盖层 Mixin，混入 Phaser Scene
 * @exports 纯函数 - getCollectionCategories, filterCollectionItems
 */
import type { WarehouseSceneThis } from "../../../types/warehouse-scene-this"

import { CoreOverlayMixin } from "./overlay/core"
import { InfoPopupMixin } from "./overlay/info-popup"
import { DetailPopupMixin } from "./overlay/detail-popup"
import { SettingsMixin } from "./overlay/settings"
import { LanDialogMixin } from "./overlay/lan-dialog"
import { CollectionMixin } from "./overlay/collection"
import { AiModelConfigMixin } from "./overlay/ai-model-config"

export { getCollectionCategories, filterCollectionItems } from "./overlay/pure"

export const UiOverlayMixin: ThisType<WarehouseSceneThis> = Object.assign(
  {},
  CoreOverlayMixin,
  InfoPopupMixin,
  DetailPopupMixin,
  SettingsMixin,
  LanDialogMixin,
  CollectionMixin,
  AiModelConfigMixin
)
