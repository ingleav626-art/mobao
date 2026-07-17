# ui/overlay.ts 拆分方案

> 创建时间：2026-07-12
> 状态：📋 计划中（仅调查 + 计划，未执行代码改动）
> 目标：将 `scripts/game/ui/overlay.ts`（957 行，`UiOverlayMixin` 含 40 方法 + 1 属性 + 2 纯函数）按职责拆分为"薄入口 + 子目录 + re-export 纯函数"结构，参照已落地的 `ai/intel/`（39 行薄入口 + 6 子模块）。

---

## 一、现状分析

### 1.1 文件结构

| 部分 | 行号 | 内容 |
|------|------|------|
| 导入与别名 | L1-L39 | 13 个 import + 3 个迁移别名（loadDeepSeekSettings / saveDeepSeekSettings / maskApiKey）|
| 独立纯函数 | L41-L69 | getCollectionCategories、filterCollectionItems（已提取，可独立测试）|
| `UiOverlayMixin` 对象字面量 | L71-L957 | 40 方法 + 1 属性，混杂 7 类不相关职责 |

### 1.2 对外接口（拆分后必须保持不变）

| 消费方 | 导入路径 | 导入内容 |
|--------|----------|----------|
| `scripts/game/ui/index.ts` L12 | `from "./overlay"` | `UiOverlayMixin as OverlayMixin` |
| `scripts/game/lobby/index.ts` L47 | `from "../ui/overlay"` | `getCollectionCategories as _getCollectionCategories, filterCollectionItems` |
| `tests/game/ui/overlay.test.ts` L2-5 | `from "../../../scripts/game/ui/overlay"` | `getCollectionCategories, filterCollectionItems` |
| `scripts/game/main.ts` L74,155 | `from "./ui/index"` | `OverlayMixin`（经 ui/index.ts 间接消费）|

`main.ts` 通过 `Object.assign(WarehouseScene.prototype, { ...OverlayMixin, ... })` 混入，`WarehouseSceneThis` 类型（`types/warehouse-scene-this.d.ts` L798 等处）声明了所有方法签名。**拆分后 `UiOverlayMixin` 仍由 `ui/index.ts` 以同名导出，方法签名、属性、纯函数全部保留，消费方零改动。**

### 1.3 模块解析关键点

采用与 `ai/intel.ts` + `ai/intel/` 完全一致的**方案 A**：保留 `overlay.ts` 作为薄入口（~40 行），新建 `overlay/` 兄弟目录存放子模块。

- `overlay.ts` 与 `overlay/` 目录共存（同 `intel.ts` + `intel/`）。
- 导入路径 `"./overlay"` / `"../ui/overlay"` 仍解析到 `overlay.ts` 文件（文件优先于目录 index）。
- 因此 `ui/index.ts`、`lobby/index.ts`、测试文件**均无需改动**。
- 备选**方案 B**（删除 `overlay.ts`，用 `overlay/index.ts` 作薄入口）同样可行（`"./overlay"` 解析到目录 index），但为与 intel 落地模式严格对齐，本计划推荐方案 A。

---

## 二、完整方法清单与归类

### 2.1 纯函数（文件顶部，已独立可测）

| 函数 | 行号 | 归类 | 目标子模块 |
|------|------|------|-----------|
| `getCollectionCategories` | L43-L49 | 纯函数 | `overlay/pure.ts` |
| `filterCollectionItems` | L51-L69 | 纯函数 | `overlay/pure.ts` |

### 2.2 Mixin 方法 / 属性

| # | 方法/属性 | 行号 | 归类 | 目标子模块 |
|---|----------|------|------|-----------|
| 1 | `showInfoPopup` | L72-L87 | 信息弹窗/气泡 | `info-popup.ts` |
| 2 | `hideInfoPopup` | L89-L95 | 信息弹窗/气泡 | `info-popup.ts` |
| 3 | `showPlayerInfoPopover` | L97-L117 | 信息弹窗/气泡 | `info-popup.ts` |
| 4 | `positionPlayerInfoPopover` | L119-L139 | 信息弹窗/气泡 | `info-popup.ts` |
| 5 | `hidePlayerInfoPopover` | L141-L147 | 信息弹窗/气泡 | `info-popup.ts` |
| 6 | `showItemDetailPopup` | L149-L177 | 道具/角色详情弹窗 | `detail-popup.ts` |
| 7 | `hideItemDetailPopup` | L179-L181 | 道具/角色详情弹窗 | `detail-popup.ts` |
| 8 | `showCharacterInfoPopup` | L183-L232 | 道具/角色详情弹窗 | `detail-popup.ts` |
| 9 | `hideCharacterInfoPopup` | L234-L236 | 道具/角色详情弹窗 | `detail-popup.ts` |
| 10 | `openSettingsOverlay` | L238-L293 | 设置面板 | `settings.ts` |
| 11 | `closeSettingsOverlay` | L295-L353 | 设置面板 | `settings.ts` |
| 12 | `isSettingsOverlayOpen` | L355-L357 | 设置面板 | `settings.ts` |
| 13 | `settingsInputId` | L359-L361 | 设置面板 | `settings.ts` |
| 14 | `fillSettingsForm` | L363-L421 | 设置面板 | `settings.ts` |
| 15 | `readSettingsForm` | L423-L430 | 设置面板 | `settings.ts` |
| 16 | `setSettingsStatus` | L432-L435 | 设置面板 | `settings.ts` |
| 17 | `saveSettingsFromOverlay` ⚠️越界 | L437-L529 | 设置面板 | `settings.ts` |
| 18 | `showLanRestartVoteDialog` ⚠️越界 | L531-L562 | LAN 弹窗 | `lan-dialog.ts` |
| 19 | `removeLanRestartDialog` | L564-L571 | LAN 弹窗 | `lan-dialog.ts` |
| 20 | `showLanRestartWaitingDialog` | L573-L589 | LAN 弹窗 | `lan-dialog.ts` |
| 21 | `showLanRestartDeclinedDialog` | L591-L611 | LAN 弹窗 | `lan-dialog.ts` |
| 22 | `showLanPauseOverlay` ⚠️越界 | L613-L645 | LAN 弹窗 | `lan-dialog.ts` |
| 23 | `hideLanPauseOverlay` | L647-L650 | LAN 弹窗 | `lan-dialog.ts` |
| 24 | `hideSettleOverlay` | L652-L664 | 通用覆盖层开关 | `core.ts` |
| 25 | `openAiLogicPanel` | L666-L679 | 通用覆盖层开关 | `core.ts` |
| 26 | `closeAiLogicPanel` | L681-L690 | 通用覆盖层开关 | `core.ts` |
| 27 | `openShopOverlay` | L692-L704 | 通用覆盖层开关（商店转发）| `core.ts` |
| 28 | `closeShopOverlay` | L706-L714 | 通用覆盖层开关（商店转发）| `core.ts` |
| 29 | `openCollectionOverlay` | L716-L735 | 收藏图鉴 | `collection.ts` |
| 30 | `closeCollectionOverlay` | L737-L749 | 收藏图鉴 | `collection.ts` |
| 31 | `initCollectionPanel` | L751-L779 | 收藏图鉴 | `collection.ts` |
| 32 | `getCollectionCategories`（方法，包装纯函数）| L781-L783 | 收藏图鉴 | `collection.ts` |
| 33 | `renderCollectionGrid` | L785-L828 | 收藏图鉴 | `collection.ts` |
| 34 | `AI_MODEL_CONFIGS_STORAGE_KEY`（属性）| L830 | AI 模型配置 | `ai-model-config.ts` |
| 35 | `loadAiModelConfigs` | L832-L842 | AI 模型配置 | `ai-model-config.ts` |
| 36 | `saveAiModelConfigs` | L844-L850 | AI 模型配置 | `ai-model-config.ts` |
| 37 | `openAiModelConfigOverlay` | L852-L857 | AI 模型配置 | `ai-model-config.ts` |
| 38 | `closeAiModelConfigOverlay` | L859-L862 | AI 模型配置 | `ai-model-config.ts` |
| 39 | `renderAiModelConfigContent` | L864-L910 | AI 模型配置 | `ai-model-config.ts` |
| 40 | `saveAiModelConfigFromForm` | L912-L923 | AI 模型配置 | `ai-model-config.ts` |
| 41 | `getAiModelConfig` | L925-L956 | AI 模型配置 | `ai-model-config.ts` |

**统计**：40 方法 + 1 属性 + 2 纯函数 = 43 个成员。归类分布见下表。

### 2.3 归类汇总

| 归类 | 方法数 | 含属性 | 目标子模块 |
|------|--------|--------|-----------|
| 信息弹窗/气泡 | 5 | - | `info-popup.ts` |
| 道具/角色详情弹窗 | 4 | - | `detail-popup.ts` |
| 设置面板 | 8 | - | `settings.ts` |
| LAN 弹窗 | 6 | - | `lan-dialog.ts` |
| 通用覆盖层开关（含商店转发）| 5 | - | `core.ts` |
| 收藏图鉴 | 5 | - | `collection.ts` |
| AI 模型配置 | 7 | 1（AI_MODEL_CONFIGS_STORAGE_KEY）| `ai-model-config.ts` |
| 纯函数 | 2 | - | `pure.ts` |
| **合计** | **40** | **1** | **8 子模块 + 薄入口** |

---

## 三、拆分结构

### 3.1 目录结构

```
scripts/game/ui/
  ├── overlay.ts                      # 薄入口（~40 行）：Object.assign 合并 7 子 Mixin + re-export 纯函数
  ├── overlay/                        # 新建子目录
  │   ├── pure.ts                     # 纯函数（getCollectionCategories, filterCollectionItems）
  │   ├── info-popup.ts               # InfoPopupMixin（信息弹窗 + 玩家气泡）
  │   ├── detail-popup.ts             # DetailPopupMixin（道具/角色详情弹窗）
  │   ├── settings.ts                 # SettingsMixin（设置面板，含越界 saveSettingsFromOverlay）
  │   ├── lan-dialog.ts               # LanDialogMixin（LAN 重开投票/暂停弹窗）
  │   ├── collection.ts               # CollectionMixin（收藏图鉴面板）
  │   ├── ai-model-config.ts          # AiModelConfigMixin（AI 模型配置面板）
  │   └── core.ts                     # CoreOverlayMixin（通用覆盖层开关：结算/AI面板/商店）
  ├── index.ts                        # 不变：export { UiOverlayMixin as OverlayMixin } from "./overlay"
  ├── panels.ts                       # 不变
  └── history.ts                      # 不变
```

### 3.2 各子模块详情

#### `overlay/pure.ts`（~45 行）

纯函数，零外部依赖（不引用 `this`，不引用其他模块）。

| 成员 | 来源行号 |
|------|----------|
| `getCollectionCategories` | L43-L49 |
| `filterCollectionItems` | L51-L69 |

无 import（函数体仅用 Set/Array 原生方法）。

#### `overlay/info-popup.ts`（~95 行）— InfoPopupMixin

信息弹窗与玩家信息气泡。

| 方法 | 来源行号 |
|------|----------|
| `showInfoPopup` | L72-L87 |
| `hideInfoPopup` | L89-L95 |
| `showPlayerInfoPopover` | L97-L117 |
| `positionPlayerInfoPopover` | L119-L139 |
| `hidePlayerInfoPopover` | L141-L147 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { MobaoAnimations } from "../../animations"`

跨子模块 `this.` 调用：`showPlayerInfoPopover` 调 `this.positionPlayerInfoPopover`（同模块）。

#### `overlay/detail-popup.ts`（~115 行）— DetailPopupMixin

道具/角色详情弹窗，复用 info-popup 的 popover 显示。

| 方法 | 来源行号 |
|------|----------|
| `showItemDetailPopup` | L149-L177 |
| `hideItemDetailPopup` | L179-L181 |
| `showCharacterInfoPopup` | L183-L232 |
| `hideCharacterInfoPopup` | L234-L236 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { ITEM_DEFS } from "../../data/items"`
- `import { SKILL_DEFS } from "../../data/skills"`
- `import { getActiveCharacter } from "../../data/character-system"`
- `import { getCharacterById } from "../../data/characters"`

跨子模块 `this.` 调用：`this.showPlayerInfoPopover` / `this.hidePlayerInfoPopover`（来自 info-popup，经合并后 `this` 可见）。

#### `overlay/settings.ts`（~320 行）— SettingsMixin ⚠️ 含越界方法

设置面板（游戏参数 + LLM 配置）。本模块最大，但职责内聚。

| 方法 | 来源行号 | 备注 |
|------|----------|------|
| `openSettingsOverlay` | L238-L293 | |
| `closeSettingsOverlay` | L295-L353 | 调 `this.showGameConfirm`（BiddingMixin 提供）|
| `isSettingsOverlayOpen` | L355-L357 | |
| `settingsInputId` | L359-L361 | |
| `fillSettingsForm` | L363-L421 | |
| `readSettingsForm` | L423-L430 | |
| `setSettingsStatus` | L432-L435 | |
| `saveSettingsFromOverlay` ⚠️ | L437-L529 | 越界改 `this.round/roundTimeLeft/actionsLeft` + LLM 配置 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { clamp } from "../../core/utils"`
- `import { GAME_SETTINGS, saveGameSettings, normalizeGameSettings } from "../../core/settings"`
- `import { SETTINGS_FIELDS } from "../../core/constants"`
- `import { DeepSeekProvider } from "../../../llm/providers/deepseek-provider"`
- `import { LlmManager } from "../../../llm/core/llm-manager"`
- `import { MobaoAnimations } from "../../animations"`

迁移别名（L35-L37，仅本模块使用，搬入此文件顶部）：
```ts
const loadDeepSeekSettings = DeepSeekProvider.getSettings
const saveDeepSeekSettings = DeepSeekProvider.applySettings
const maskApiKey = LlmManager.utils.maskApiKey
```

跨子模块 `this.` 调用：`this.hideInfoPopup`（info-popup）、`this.showGameConfirm`（bidding）、`this.fillLlmSettingsForm` / `this.readLlmSettingsForm` / `this.getLlmSettings` / `this.getLlmProvider` / `this.setLlmSettingsStatus`（scene/llm 层）、`this.updateHud` / `this.writeLog` / `this.pushRunStartContextToAi` / `this.closeBidKeypad` / `this.closeItemDrawer`（其他 Mixin）。全部经 `ThisType<WarehouseSceneThis>` 类型可见，运行时经合并原型可见。

#### `overlay/lan-dialog.ts`（~140 行）— LanDialogMixin ⚠️ 含越界方法

LAN 重开投票、暂停弹窗。动态创建 DOM（document.createElement），无静态 HTML 依赖。

| 方法 | 来源行号 | 备注 |
|------|----------|------|
| `showLanRestartVoteDialog` ⚠️ | L531-L562 | 越界 `this.lanBridge!.send()` |
| `removeLanRestartDialog` | L564-L571 | |
| `showLanRestartWaitingDialog` | L573-L589 | |
| `showLanRestartDeclinedDialog` | L591-L611 | |
| `showLanPauseOverlay` ⚠️ | L613-L645 | 越界 `this.toggleRoundPause()` |
| `hideLanPauseOverlay` | L647-L650 | |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`

无其他 import（仅用 `document` 全局 + `this.` 调用）。

跨子模块 `this.` 调用：`this.lanBridge!.send()`、`this.toggleRoundPause()`、`this.writeLog`、`this.isLanMode`、`this.lanIsHost`、`this.settled`、`this.dom.hud`。

#### `overlay/collection.ts`（~140 行）— CollectionMixin

收藏图鉴面板（~130 行数据过滤 + HTML 拼装）。

| 方法 | 来源行号 |
|------|----------|
| `openCollectionOverlay` | L716-L735 |
| `closeCollectionOverlay` | L737-L749 |
| `initCollectionPanel` | L751-L779 |
| `getCollectionCategories`（方法，包装纯函数）| L781-L783 |
| `renderCollectionGrid` | L785-L828 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { rgbHex } from "../../core/utils"`
- `import { QUALITY_CONFIG, ARTIFACT_LIBRARY } from "../../data/artifacts"`
- `import { MobaoAnimations } from "../../animations"`
- `import { getCollectionCategories, filterCollectionItems } from "./pure"`

跨子模块 `this.` 调用：`this.getCollectionCategories()`（自身方法，包装纯函数）、`this.renderCollectionGrid()`、`this.closeCollectionOverlay()`（同模块）。

#### `overlay/ai-model-config.ts`（~150 行）— AiModelConfigMixin

AI 模型配置面板（localStorage 读写 + HTML 拼装）。

| 成员 | 来源行号 |
|------|----------|
| `AI_MODEL_CONFIGS_STORAGE_KEY`（属性）| L830 |
| `loadAiModelConfigs` | L832-L842 |
| `saveAiModelConfigs` | L844-L850 |
| `openAiModelConfigOverlay` | L852-L857 |
| `closeAiModelConfigOverlay` | L859-L862 |
| `renderAiModelConfigContent` | L864-L910 |
| `saveAiModelConfigFromForm` | L912-L923 |
| `getAiModelConfig` | L925-L956 |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { LlmManager } from "../../../llm/core/llm-manager"`

跨子模块 `this.` 调用：`this.getLlmSettings()`（scene/llm 层）、`this.writeLog`、`this.loadAiModelConfigs` / `this.saveAiModelConfigs` / `this.closeAiModelConfigOverlay` / `this.renderAiModelConfigContent`（同模块）。

#### `overlay/core.ts`（~85 行）— CoreOverlayMixin

通用覆盖层开关：结算覆盖层、AI 逻辑面板、商店覆盖层。这些方法都只做"动画开/关 + 转发"，体量小且模式一致，合并为一个 `core.ts` 避免过度拆分。

| 方法 | 来源行号 | 备注 |
|------|----------|------|
| `hideSettleOverlay` | L652-L664 | 结算覆盖层关闭 |
| `openAiLogicPanel` | L666-L679 | 转发 `this.renderAiLogicPanel` / `this.renderAiThoughtLog` |
| `closeAiLogicPanel` | L681-L690 | |
| `openShopOverlay` | L692-L704 | 转发 `MobaoShopPage` |
| `closeShopOverlay` | L706-L714 | 转发 `MobaoShopPage` |

import：
- `import type { WarehouseSceneThis } from "../../../../types/warehouse-scene-this"`
- `import { MobaoAnimations } from "../../animations"`
- `import { MobaoShopPage } from "../../shop/index"`

跨子模块 `this.` 调用：`this.renderAiLogicPanel` / `this.renderAiThoughtLog`（scene 层）、`this.updateLobbyMoneyDisplay` / `this.updateHud`（其他 Mixin）。

### 3.3 薄入口 `overlay.ts`（~40 行）

```ts
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
```

> 与 `ai/intel.ts`（L32-L39）完全同构。Object.assign 合并后，子模块间 `this.X()` 调用全部生效（运行时合并到同一原型，类型层 `ThisType<WarehouseSceneThis>` 声明全部方法）。

---

## 四、行为保持原则

### 4.1 只搬移，不改逻辑

- **逐字搬移**每个方法体，包括现有分号前缀（`; this.X()`）、空格、`console.log` 调试语句，均原样保留。
- **不改方法签名**（参数名、类型、返回值）、**不改属性值**（`AI_MODEL_CONFIGS_STORAGE_KEY: "mobao_ai_model_configs_v1"`）。
- **不改导入别名**语义：`loadDeepSeekSettings` / `saveDeepSeekSettings` / `maskApiKey` 三个别名原样搬到 `settings.ts` 顶部，仍指向 `DeepSeekProvider.getSettings` / `DeepSeekProvider.applySettings` / `LlmManager.utils.maskApiKey`。
- **不调整 Object.assign 合并顺序**导致的方法覆盖：原文件是单一对象字面量无覆盖；合并后各子模块方法名无冲突（已核对 40 方法名唯一），Object.assign 顺序不影响结果。

### 4.2 UI 层越界方法（本次保留原行为，列为遗留项）

以下方法存在跨层越界，**本次拆分仅搬移、不修复**，越界行为原样保留：

| 方法 | 子模块 | 越界点 | 行号 | 遗留修复方向（不在本次范围）|
|------|--------|--------|------|------|
| `saveSettingsFromOverlay` | `settings.ts` | 修改 `this.round` / `this.roundTimeLeft` / `this.actionsLeft`（游戏状态）| L514-L516 | 应通过事件/RoundManager 接口下发，不应直接改场景状态 |
| `saveSettingsFromOverlay` | `settings.ts` | 写 LLM 全局配置 localStorage + 调 `this.getLlmProvider().saveSettings()` + `pushRunStartContextToAi()` | L443-L503 | LLM 配置应经 LLM_BRIDGE，不应在 UI 层直写 |
| `showLanRestartVoteDialog` | `lan-dialog.ts` | `this.lanBridge!.send({ type: "game:restart-accept" / "restart-decline" })` | L554, L559 | 应经 LanIndexMixin 方法封装，不应 UI 直发协议消息 |
| `showLanPauseOverlay` | `lan-dialog.ts` | `this.toggleRoundPause()` | L639 | 应经 RoundManager 接口 |

> 拆分后这些越界调用仍经 `this.` 解析（`ThisType<WarehouseSceneThis>` 声明了 `lanBridge`、`toggleRoundPause`、`round` 等），类型与运行时行为不变。

### 4.3 对外接口不变

- `UiOverlayMixin` 仍由 `ui/index.ts` L12 以 `export { UiOverlayMixin as OverlayMixin } from "./overlay"` 导出。
- `overlay.ts` 仍 re-export `getCollectionCategories` / `filterCollectionItems`（从 `./overlay/pure`）。
- `lobby/index.ts` L47 的 `import { getCollectionCategories as _getCollectionCategories, filterCollectionItems } from "../ui/overlay"` 路径不变。
- `tests/game/ui/overlay.test.ts` 的 `from "../../../scripts/game/ui/overlay"` 路径不变。
- `main.ts` 的 `import { OverlayMixin } from "./ui/index"` 与 `Object.assign` 不变。
- `WarehouseSceneThis` 类型声明不变。

---

## 五、import / 别名分配表

原 overlay.ts L23-L39 的 13 个 import + 3 个别名，按实际使用方分配到子模块：

| import / 别名 | 原行号 | 使用方 | 分配到 |
|--------------|--------|--------|--------|
| `WarehouseSceneThis`（type）| L1 | 全部子模块 | 各子模块各自 import type |
| `clamp` | L23 | `saveSettingsFromOverlay` | `settings.ts` |
| `rgbHex` | L23 | `renderCollectionGrid` | `collection.ts` |
| `GAME_SETTINGS` | L24 | `readSettingsForm`, `saveSettingsFromOverlay` | `settings.ts` |
| `saveGameSettings` | L24 | `saveSettingsFromOverlay` | `settings.ts` |
| `normalizeGameSettings` | L24 | `readSettingsForm` | `settings.ts` |
| `SETTINGS_FIELDS` | L25 | `fillSettingsForm`, `readSettingsForm` | `settings.ts` |
| `QUALITY_CONFIG` | L26 | `initCollectionPanel`, `renderCollectionGrid` | `collection.ts` |
| `ARTIFACT_LIBRARY` | L26 | `getCollectionCategories`, `renderCollectionGrid` | `collection.ts` |
| `ITEM_DEFS` | L27 | `showItemDetailPopup` | `detail-popup.ts` |
| `SKILL_DEFS` | L28 | `showItemDetailPopup` | `detail-popup.ts` |
| `getActiveCharacter` | L29 | `showCharacterInfoPopup` | `detail-popup.ts` |
| `getCharacterById` | L30 | `showCharacterInfoPopup` | `detail-popup.ts` |
| `DeepSeekProvider` | L31 | 别名 loadDeepSeekSettings / saveDeepSeekSettings | `settings.ts` |
| `LlmManager` | L32 | 别名 maskApiKey + `renderAiModelConfigContent` / `getAiModelConfig` | `settings.ts` + `ai-model-config.ts`（各自 import）|
| `loadDeepSeekSettings`（别名）| L35 | `saveSettingsFromOverlay` | `settings.ts` 顶部 |
| `saveDeepSeekSettings`（别名）| L36 | `saveSettingsFromOverlay` | `settings.ts` 顶部 |
| `maskApiKey`（别名）| L37 | `saveSettingsFromOverlay` | `settings.ts` 顶部 |
| `MobaoAnimations` | L38 | `info-popup` / `settings` / `core` / `collection` | 四个子模块各自 import |
| `MobaoShopPage` | L39 | `openShopOverlay` / `closeShopOverlay` | `core.ts` |

> 子模块相对路径基准：`scripts/game/ui/overlay/<sub>.ts`
> - 类型：`../../../../types/warehouse-scene-this`
> - core/data：`../../core/...`、`../../data/...`、`../../animations`、`../../shop/index`
> - llm：`../../../llm/...`
> - 同目录纯函数：`./pure`
> （与 `ai/intel/init.ts` 的 `../../../../types/...` + `../../core/utils` 完全同构）

---

## 六、验证步骤

拆分完成后依次执行：

1. **TypeScript 类型检查**：`npx tsc --noEmit` → 期望 0 错误。
   - 重点核对：各子模块 `ThisType<WarehouseSceneThis>` 下 `this.X()` 调用均类型可见；`overlay.ts` 的 `Object.assign` 合并结果类型正确。
2. **单元测试**：`npm run test` → 期望 1026 通过（当前基线 1026，含 `tests/game/ui/overlay.test.ts` 的 16 个纯函数用例）。
   - 测试 import 路径不变，应零改动通过。
3. **Lint**：`npm run lint` → 期望 0 error（warning 数不增加）。
   - 重点核对：各子模块无未用 import（`no-unused-vars` warn）、无新增 `any`。
4. **格式**：`npm run format` → 期望通过（无分号、双引号、120 print width、无尾逗号）。
5. **冒烟（手动）**：`npm run dev` 启动，逐一验证：
   - 设置面板打开/关闭/保存（含未保存保护确认弹窗）
   - 收藏图鉴筛选/搜索
   - AI 模型配置面板打开/保存
   - 道具/角色详情气泡
   - 信息弹窗
   - LAN 模式重开投票/暂停弹窗（若可联机测试）
   - 商店/AI 逻辑面板开闭

---

## 七、风险点

### 7.1 子模块间 `this.` 相互调用（中风险）

多个子模块的方法通过 `this.` 调用其他子模块的方法或外部 Mixin 方法：

| 调用方 | 被调方法 | 定义位置 |
|--------|----------|----------|
| `detail-popup` | `this.showPlayerInfoPopover` / `this.hidePlayerInfoPopover` | `info-popup`（同 Mixin 合并后可见）|
| `settings` | `this.hideInfoPopup` | `info-popup` |
| `settings` | `this.showGameConfirm` | `bidding/index.ts`（BiddingMixin，外部 Mixin）|
| `settings` | `this.fillLlmSettingsForm` / `this.readLlmSettingsForm` / `this.getLlmSettings` / `this.getLlmProvider` / `this.setLlmSettingsStatus` | scene/llm 层（外部）|
| `settings` | `this.updateHud` / `this.writeLog` / `this.pushRunStartContextToAi` / `this.closeBidKeypad` / `this.closeItemDrawer` | 其他 Mixin（外部）|
| `lan-dialog` | `this.lanBridge!.send` / `this.toggleRoundPause` | lan 层 / RoundManager（外部）|
| `core` | `this.renderAiLogicPanel` / `this.renderAiThoughtLog` / `this.updateLobbyMoneyDisplay` / `this.updateHud` | scene 层 / 其他 Mixin（外部）|

**应对**：子模块**不得**直接 import 兄弟子模块的方法，一律走 `this.`。`ThisType<WarehouseSceneThis>` 已声明全部场景方法/属性，类型层安全；运行时 `Object.assign` 合并到同一原型后 `this.X` 全部解析成功。此模式已被 `ai/intel/action.ts`（调 `this.buildAiPrivateRevealContext` 等）验证可行。

### 7.2 跨子模块共享 import（低风险）

`LlmManager` 和 `MobaoAnimations` 被多个子模块使用。**各自独立 import**，不抽公共（避免引入多余耦合）。ES 模块单例语义保证重复 import 同一实例。

### 7.3 `Object.assign` 合并顺序（低风险）

40 方法名 + 1 属性名已核对唯一，无覆盖。Object.assign 顺序（Core → InfoPopup → DetailPopup → Settings → LanDialog → Collection → AiModelConfig）不影响结果。即使顺序错乱也不会丢方法。

### 7.4 迁移别名作用域（低风险）

`loadDeepSeekSettings` / `saveDeepSeekSettings` / `maskApiKey` 三个别名仅 `settings.ts` 使用，搬入该文件顶部即可，作用域不变。若未来 `ai-model-config.ts` 也需要 `maskApiKey`，再独立定义或抽 `pure.ts`。

### 7.5 模块解析：`overlay.ts` 与 `overlay/` 共存（低风险）

方案 A 下 `overlay.ts`（文件）与 `overlay/`（目录）共存。TS/Node 模块解析中，`"./overlay"` 优先匹配 `overlay.ts` 文件，不会误入 `overlay/index.ts`。此模式与 `ai/intel.ts` + `ai/intel/` 完全一致，已验证可行。
- 若选方案 B（删除 `overlay.ts`，用 `overlay/index.ts`），则 `"./overlay"` 解析到目录 index，同样可行，但需确保 `overlay.ts` 已删除避免歧义。本计划推荐方案 A。

### 7.6 测试 import 路径（低风险）

`tests/game/ui/overlay.test.ts` 从 `../../../scripts/game/ui/overlay` 导入纯函数。方案 A 下解析到 `overlay.ts`，其 `export { ... } from "./overlay/pure"` re-export 纯函数，测试零改动。需在拆分后立即跑该测试确认。

### 7.7 `console.log` 调试语句（低风险，非阻塞）

`saveSettingsFromOverlay`（L446-L450, L469, L493-L496, L527）、`getAiModelConfig`（L929, L931, L936, L939, L954）含多处 `console.log` 调试输出。按"只搬移不改逻辑"原则原样保留；如需清理应作为独立后续任务。

---

## 八、难归类 / 跨职责方法说明

| 方法 | 归类决策 | 理由 |
|------|----------|------|
| `hideSettleOverlay` | `core.ts` | 仅 13 行，关闭结算覆盖层（MobaoAnimations 动画），与设置/LAN/收藏等均无关，属通用覆盖层开关 |
| `openAiLogicPanel` / `closeAiLogicPanel` | `core.ts` | 各 ~15 行，仅动画开关 + 转发 `renderAiLogicPanel`，无独立业务逻辑，归通用 |
| `openShopOverlay` / `closeShopOverlay` | `core.ts` | 各 ~10 行，纯转发 `MobaoShopPage`，单独建 `shop.ts` 仅 2 方法过度拆分，并入 `core.ts` |
| `getCollectionCategories`（Mixin 方法 L781-L783）| `collection.ts` | 这是包装纯函数的实例方法（`return getCollectionCategories(ARTIFACT_LIBRARY)`），与纯函数同名但不同实体，留在 `collection.ts`；纯函数进 `pure.ts`。注意 `WarehouseSceneThis` L798 声明的是此实例方法 |
| `saveSettingsFromOverlay` | `settings.ts`（含越界）| 93 行，主体是设置保存逻辑，归设置面板；越界改游戏状态部分保留原行为，列遗留 |
| `showLanPauseOverlay` | `lan-dialog.ts`（含越界）| LAN 暂停弹窗，归 LAN；`toggleRoundPause` 越界保留 |

> `core.ts` 是"兜底"模块，收纳 5 个体量小、模式一致（动画开/关 + 转发）、且不属于其他 6 类的方法。若后续这些方法膨胀可再独立拆分。

---

## 九、执行顺序建议

1. 新建 `scripts/game/ui/overlay/` 目录。
2. 创建 `overlay/pure.ts`（搬 L43-L69，零依赖，最先可测）。
3. 创建 `overlay/info-popup.ts`（搬 L72-L147）。
4. 创建 `overlay/detail-popup.ts`（搬 L149-L236）。
5. 创建 `overlay/core.ts`（搬 L652-L714）。
6. 创建 `overlay/collection.ts`（搬 L716-L828，import `./pure`）。
7. 创建 `overlay/ai-model-config.ts`（搬 L830-L956）。
8. 创建 `overlay/lan-dialog.ts`（搬 L531-L650）。
9. 创建 `overlay/settings.ts`（搬 L238-L529 + 别名 L35-L37，最大最复杂，最后做）。
10. 改写 `overlay.ts` 为薄入口（替换 957 行为 ~40 行，见 3.3）。
11. 跑 `npx tsc --noEmit` → `npm run test` → `npm run lint` → `npm run format`。
12. 手动冒烟（见第六节 5）。

每步搬完即可单独 `tsc --noEmit` 校验该子模块类型，逐步推进降低风险。
