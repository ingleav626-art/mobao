/**
 * @file scripts/game/ai/intel.ts
 * @module ai/intel
 * @description AI 情报系统薄入口（代理层）。AiIntelMixin 方法体委托到 AiIntelManager，
 *              签名保持不变，运行时等价。Phase 2 依赖注入过渡期保留。
 *              原 5 个子 Mixin（Init/Snapshot/Reveal/Panel/Action）已合并到 Manager。
 *
 * @exports AiIntelMixin - AI 情报系统 Mixin（薄代理），混入 Phaser Scene
 * @exports 纯函数 - pickRandomItemCell, calcHighValuePriceThreshold 等
 */
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

