/**
 * @file llm/core/scene-llm.js
 * @module llm/core/scene-llm
 * @description 场景 LLM 桥接器入口。将 4 个子模块合并为统一的 methods 对象，
 *              保持与原版完全相同的外部接口（createSceneLlmBridge / window.MobaoSceneLlm）。
 *
 * 子模块职责：
 *   - llm-error.js    : JSON 解析、错误分类、Toast/Badge UI
 *   - llm-settings.js : 设置表单读写、连接测试、开关管理
 *   - llm-prompt.js   : payload 构建、prompt/messages 组装、决策提取、plan 标准化
 *   - llm-decision.js : LLM 请求、追问、纠错、批量决策、遥测、面板渲染
 *
 * @exports window.MobaoSceneLlm
 * @exports createSceneLlmBridge
 *
 * @requires llm/core/llm-settings - 设置模块
 * @requires llm/core/llm-prompt - Prompt 构建模块
 * @requires llm/core/llm-decision - 决策模块
 */
import { createLlmSettingsModule } from './llm-settings.js'
import { createLlmPromptModule } from './llm-prompt.js'
import { createLlmDecisionModule } from './llm-decision.js'

/**
 * 创建场景 LLM 桥接器
 * @param deps 依赖注入对象（聚合多个模块的常量和函数，结构复杂且仅内部使用）
 *             使用 unknown 强制内部模块做类型检查后再使用
 */
export function createSceneLlmBridge(deps: unknown) {
  const settingsModule = createLlmSettingsModule(deps as any)
  const promptModule = createLlmPromptModule(deps as any)
  const decisionModule = createLlmDecisionModule(deps as any)

  const methods = {
    ...settingsModule.methods,
    ...promptModule.methods,
    ...decisionModule.methods
  }

  return {
    methods,
    loadAiLlmPlayerSwitches: settingsModule.loadAiLlmPlayerSwitches,
    saveAiLlmPlayerSwitches: settingsModule.saveAiLlmPlayerSwitches
  }
}
