/**
 * @file llm/core/llm-decision.ts
 * @module llm/core/llm-decision
 * @description LLM 决策流程模块（薄入口）。负责组合拆分后的子模块，并 re-export 纯函数。
 *              子模块：decision/pure.ts, decision/request.ts, decision/correction.ts, decision/panel.ts
 */
import type { LlmDecisionDeps } from "./decision/types"
import { createLlmRequestMethods } from "./decision/request"
import { createLlmCorrectionMethods } from "./decision/correction"
import { createLlmPanelMethods } from "./decision/panel"

// re-export 纯函数（保持向后兼容）
export {
  getAiIndexFromPlayerId,
  canUseLlmDecisionCore,
  isValidAiModelConfig,
  parseCrossGameMemoryText,
  CONTROL_MODE_LABELS,
  getControlModeLabel,
  buildDecisionSourceLabel,
  resolveControlMode,
  escapeHtml,
  renderLlmEntryDetails,
  renderRuleEntryDetails
} from "./decision/pure"

// re-export 类型（保持向后兼容）
export type { RuleDecisionEntry, RoundBidEntry, TelemetryEntry, LlmDecisionDeps } from "./decision/types"

/**
 * 创建 LLM 决策模块。将三个子模块的 methods 合并为一个对象。
 */
export function createLlmDecisionModule(deps: LlmDecisionDeps) {
  const requestMethods = createLlmRequestMethods(deps)
  const correctionMethods = createLlmCorrectionMethods(deps)
  const panelMethods = createLlmPanelMethods(deps)

  const methods = {
    ...requestMethods,
    ...correctionMethods,
    ...panelMethods
  }

  return { methods }
}
