/**
 * @file ai/index.ts
 * @module ai/index
 * @description AI 系统模块聚合导出。将钱包、情报、记忆、反思、决策五个 Mixin
 *              统一 re-export，供 main.ts 的 Object.assign 混入 WarehouseScene.prototype。
 *
 * @exports AiWalletMixin - AI 钱包管理 Mixin
 * @exports AiIntelMixin - AI 情报系统 Mixin
 * @exports AiMemoryMixin - AI 跨局记忆 Mixin
 * @exports AiReflectionMixin - AI 局后反思 Mixin
 * @exports AiDecisionMixin - AI 决策面板 Mixin
 */

export { AiWalletMixin } from "./wallet"
export { AiIntelMixin } from "./intel"
export { AiMemoryMixin } from "./memory"
export { AiReflectionMixin } from "./reflection"
export { AiDecisionMixin } from "./decision"
