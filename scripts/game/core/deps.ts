/**
 * @file core/deps.js
 * @module core/deps
 * @description 依赖注入容器。解决模块拆分后局部变量（如 LLM_BRIDGE）无法
 *              被其他 ES Module 访问的问题。所有共享依赖统一在此注册，模块
 *              通过 `import { Deps }` 获取，避免 `window.XXX` 隐式传递。
 *
 * 使用方式：
 *   1. main.js 初始化时调用 initDeps({ LLM_BRIDGE, ... })
 *   2. 其他模块：import { Deps } from '../core/deps.js'
 *   3. 使用：Deps.LLM_BRIDGE.loadAiLlmPlayerSwitches(...)
 *
 * 优点：
 *   - 显式依赖，IDE 可追踪引用
 *   - 单一入口，排查变量不可见问题时只需检查此处
 *   - 不依赖 window 全局作用域
 *
 * @requires core/deps - 依赖注入容器
 *
 * @exports Deps - 依赖注入容器对象
 * @exports initDeps - 初始化依赖注入容器函数
 */

/** @type {{ LLM_BRIDGE?: object, BATTLE_RECORD_BRIDGE?: object, SETTLEMENT_BRIDGE?: object }} */
export const Deps: {
  LLM_BRIDGE: any
  BATTLE_RECORD_BRIDGE: any
  SETTLEMENT_BRIDGE: any
} = {
  LLM_BRIDGE: null,
  BATTLE_RECORD_BRIDGE: null,
  SETTLEMENT_BRIDGE: null
}

/**
 * 初始化所有共享依赖（在 main.js 桥接层创建后调用）
 */
export function initDeps(bridges: Record<string, any>): void {
  Object.assign(Deps, bridges)
}