/**
 * @file data/artifacts.ts
 * @module data/artifacts
 * @description 藏品数据薄入口。re-export 品质配置、藏品图鉴、ArtifactManager、统计纯函数。
 *              原 1148 行已按职责拆分到 artifacts/ 目录（config/library/pure/manager）。
 *              对外接口不变：13 个消费方零改动。
 */

export { QUALITY_CONFIG, SIZE_TAG_BY_DIMENSION, CATEGORY_WEIGHTS } from "./artifacts/config"
export { ARTIFACT_LIBRARY } from "./artifacts/library"
export {
  estimatePriceByQuality,
  signalToRevealState,
  summarizeCandidatePrices,
  summarizeStatsCollection,
  toSizeTag
} from "./artifacts/pure"
export { ArtifactManager } from "./artifacts/manager"
