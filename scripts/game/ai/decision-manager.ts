/**
 * @file decision-manager.ts
 * @module ai/decision-manager
 * @description AiDecisionManager -- AI 决策日志管理器（Phase 2 依赖注入）。
 *              包装 decision.ts 的纯函数，通过构造函数注入依赖（runLogHistory、dom、aiEngine 等），
 *              替代原 Mixin 通过 this. 隐式读取场景属性的方式。
 *              Manager 可独立单测，过渡期 Mixin 保留为薄代理层。
 */
import type { RunLog } from "./decision"
import {
  compactPanelTextForSnapshot,
  buildAiDecisionPanelSnapshot,
  beginRunTracking,
  recordAiThoughtLogs,
  writeLog
} from "./decision"
import { useAiPanelStore } from "../../vue/stores/aiPanelStore"
import type { AiThoughtLogEntry, AiDecisionResult } from "../../vue/stores/aiPanelStore"

/** AiDecisionManager 依赖接口 */
export interface AiDecisionManagerDeps {
  /** 局日志历史数组（可变引用，beginRunTracking 会 push/splice） */
  runLogHistory: RunLog[]
  /** DOM 元素映射（引用，writeLog/recordAiThoughtLogs 读取 actionLog/aiLogicContent） */
  dom: Record<string, HTMLElement | null>
  /** AI 引擎（用于 getLastDecisionLog，可为 null） */
  aiEngine: { getLastDecisionLog(): Record<string, unknown> | null } | null
  /** 获取当前回合号（动态值） */
  getRound: () => number
  /** 获取当前局日志（动态值，beginRunTracking 会重新赋值） */
  getCurrentRunLog: () => RunLog | null
  /** 设置当前局日志（beginRunTracking 创建新日志后回调） */
  setCurrentRunLog: (log: RunLog) => void
  /** 设置局序号（beginRunTracking 创建新日志后回调） */
  setRunSerial: (n: number) => void
  /** 保存 AI 记忆到存储（beginRunTracking 回调） */
  saveAiMemoryToStorage: () => void
  /** 渲染 AI 思考日志面板（beginRunTracking/writeLog/recordAiThoughtLogs 回调） */
  renderAiThoughtLog: () => void
  /** 渲染 LLM 决策面板（recordAiThoughtLogs 回调，可选） */
  renderAiLogicPanelForLlm?: (telemetry: { round: number; entries?: Array<Record<string, unknown>> }) => void
}

/**
 * AI 决策日志管理器。
 *
 * 依赖通过构造函数注入，Manager 内部不访问 this（场景）属性。
 * beginRunTracking 写回 runSerial/currentRunLog 通过 setRunSerial/setCurrentRunLog 回调。
 */
export class AiDecisionManager {
  constructor(private readonly deps: AiDecisionManagerDeps) {}

  /** 压缩面板文本（每行加缩进，JSON 格式化） */
  compactPanelTextForSnapshot(text: string): string {
    return compactPanelTextForSnapshot(text)
  }

  /** 构建 AI 决策面板快照（LLM 模式遥测数据 -> 可读文本） */
  buildAiDecisionPanelSnapshot(telemetry: Record<string, unknown>): string | null {
    const getLastDecisionLog =
      this.deps.aiEngine && typeof this.deps.aiEngine.getLastDecisionLog === "function"
        ? () => this.deps.aiEngine!.getLastDecisionLog()
        : null
    return buildAiDecisionPanelSnapshot(telemetry, getLastDecisionLog)
  }

  /** 开始新局追踪（创建 RunLog，写回 runSerial/currentRunLog） */
  beginRunTracking(): void {
    const newLog = beginRunTracking(
      this.deps.runLogHistory,
      () => this.deps.saveAiMemoryToStorage(),
      () => this.deps.renderAiThoughtLog()
    )
    this.deps.setRunSerial(newLog.runNo)
    this.deps.setCurrentRunLog(newLog)
  }

  /** 记录 AI 思考日志到当前局日志 */
  recordAiThoughtLogs(telemetry: Record<string, unknown>): void {
    recordAiThoughtLogs(
      telemetry,
      this.deps.getCurrentRunLog(),
      this.deps.dom as { aiLogicContent: HTMLElement | null },
      typeof this.deps.renderAiLogicPanelForLlm === "function"
        ? (t: { round: number; entries?: Array<Record<string, unknown>> }) => this.deps.renderAiLogicPanelForLlm!(t)
        : null,
      () => this.deps.renderAiThoughtLog()
    )
  }

  /** 写入操作日志并渲染面板 */
  writeLog(text: string): void {
    writeLog(
      text,
      this.deps.getRound(),
      this.deps.getCurrentRunLog(),
      this.deps.dom as { actionLog: HTMLElement | null },
      () => this.deps.renderAiThoughtLog()
    )
    // 同步到 Vue store
    try {
      const store = useAiPanelStore()
      const currentRunLog = this.deps.getCurrentRunLog()
      if (currentRunLog && Array.isArray(currentRunLog.aiThoughtLogs)) {
        const logs: AiThoughtLogEntry[] = []
        for (const entry of currentRunLog.aiThoughtLogs) {
          logs.push(entry as AiThoughtLogEntry)
        }
        store.syncThoughtLogs(logs)
      }
    } catch {
      // Vue store not available yet, skip sync
    }
  }
}
