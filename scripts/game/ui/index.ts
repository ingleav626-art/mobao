/**
 * @file ui/index.ts
 * @module ui/index
 * @description UI 组件模块聚合导出。将覆盖层、信息面板、历史记录三个 Mixin
 *              统一 re-export，供 main.ts 的 Object.assign 混入 WarehouseScene.prototype。
 *
 * @exports OverlayMixin - 覆盖层/弹窗/对话框管理 Mixin
 * @exports PanelsMixin - 左右信息面板（私有情报 + 公共信息）Mixini
 * @exports HistoryMixin - 出价历史、道具使用记录、道具抽屉 Mixin
 */

export { UiOverlayMixin as OverlayMixin } from "./overlay"
export { UiPanelsMixin as PanelsMixin } from "./panels"
export { UiHistoryMixin as HistoryMixin } from "./history"
