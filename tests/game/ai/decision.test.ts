import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  compactPanelTextForSnapshot,
  buildAiDecisionPanelSnapshot,
  beginRunTracking,
  writeLog,
  renderAiThoughtLog,
  recordAiThoughtLogs,
  type RunLog
} from '../../../scripts/game/ai/decision'

describe('decision', () => {
  describe('compactPanelTextForSnapshot', () => {
    it('空字符串返回空提示', () => {
      expect(compactPanelTextForSnapshot('')).toContain('空')
    })

    it('纯文本每行加缩进', () => {
      const result = compactPanelTextForSnapshot('hello\nworld')
      expect(result).toContain('    hello')
      expect(result).toContain('    world')
    })

    it('JSON 字符串格式化后加缩进', () => {
      const result = compactPanelTextForSnapshot('{"a":1,"b":2}')
      expect(result).toContain('"a"')
      expect(result).toContain('"b"')
      expect(result).toContain('    ')
    })

    it('无效 JSON 当纯文本处理', () => {
      const result = compactPanelTextForSnapshot('not json {broken')
      expect(result).toContain('not json {broken')
    })

    it('空白字符串返回空提示', () => {
      expect(compactPanelTextForSnapshot('   ')).toContain('空')
    })
  })

  describe('buildAiDecisionPanelSnapshot', () => {
    it('非 llm 模式返回 null', () => {
      const result = buildAiDecisionPanelSnapshot({ mode: 'rule', entries: [] }, null)
      expect(result).toBeNull()
    })

    it('无 entries 返回 null', () => {
      const result = buildAiDecisionPanelSnapshot({ mode: 'llm' }, null)
      expect(result).toBeNull()
    })

    it('null telemetry 返回 null', () => {
      expect(buildAiDecisionPanelSnapshot(null as any, null)).toBeNull()
    })

    it('LLM 模式生成快照包含玩家信息', () => {
      const telemetry = {
        mode: 'llm',
        round: 3,
        entries: [{
          playerId: 'ai-1',
          playerName: '左上AI',
          controlMode: 'llm',
          finalBid: 5000,
          decisionSource: 'llm',
          correctionAttempt: 0,
          historyMessagesCount: 0,
          crossGameMemoryCount: 0,
          inGameHistoryCount: 0,
          thought: '我觉得值这个价',
          userPrompt: '请出价',
          modelResponse: '{"bid": 5000}'
        }]
      }
      const result = buildAiDecisionPanelSnapshot(telemetry, null)
      expect(result).not.toBeNull()
      expect(result!).toContain('回合 3')
      expect(result!).toContain('左上AI')
      expect(result!).toContain('大模型')
      expect(result!).toContain('我觉得值这个价')
    })

    it('规则 AI 模式显示信心拆解', () => {
      const telemetry = {
        mode: 'llm',
        round: 1,
        entries: [{
          playerId: 'ai-2',
          playerName: '右上AI',
          controlMode: 'rule-fallback-llm-failed',
          finalBid: 3000,
          decisionSource: 'rule',
          correctionAttempt: 0,
          historyMessagesCount: 0,
          crossGameMemoryCount: 0,
          inGameHistoryCount: 0
        }]
      }
      const getLastDecisionLog = () => ({
        entries: [{
          playerId: 'ai-2',
          confidence: 0.75,
          archetype: '激进型',
          confidenceParts: { base: 0.5, clue: 0.1, quality: 0.05, progress: 0.05, market: 0.03, tool: 0.02, edgeBonus: 0, spreadPenalty: 0, uncertaintyPenalty: 0, mood: 0 },
          perceivedValue: 4000,
          hardCap: 6000
        }]
      })
      const result = buildAiDecisionPanelSnapshot(telemetry, getLastDecisionLog)
      expect(result).not.toBeNull()
      expect(result!).toContain('规则AI')
      expect(result!).toContain('信心')
      expect(result!).toContain('激进型')
    })

    it('纠错模式显示纠错信息', () => {
      const telemetry = {
        mode: 'llm',
        round: 1,
        entries: [{
          playerId: 'ai-1',
          playerName: 'AI',
          controlMode: 'llm-corrected',
          finalBid: 4000,
          decisionSource: 'llm',
          correctionAttempt: 2,
          originalError: '参数错误',
          historyMessagesCount: 0,
          crossGameMemoryCount: 0,
          inGameHistoryCount: 0,
          userPrompt: '',
          modelResponse: ''
        }]
      }
      const result = buildAiDecisionPanelSnapshot(telemetry, null)
      expect(result).toContain('纠错次数: 2/2')
      expect(result).toContain('参数错误')
    })
  })

  describe('beginRunTracking', () => {
    it('创建新的 RunLog', () => {
      const history: RunLog[] = []
      const log = beginRunTracking(history, () => { }, () => { })
      expect(log.runNo).toBe(1)
      expect(log.actionLogs).toEqual([])
      expect(log.aiThoughtLogs).toEqual([])
      expect(history).toHaveLength(1)
    })

    it('runNo 递增', () => {
      const history: RunLog[] = []
      beginRunTracking(history, () => { }, () => { })
      const log2 = beginRunTracking(history, () => { }, () => { })
      expect(log2.runNo).toBe(2)
    })

    it('历史超过 12 局时截断', () => {
      const history: RunLog[] = []
      for (let i = 0; i < 15; i++) {
        beginRunTracking(history, () => { }, () => { })
      }
      expect(history).toHaveLength(12)
      expect(history[0].runNo).toBe(4) // 15-12+1
    })

    it('调用 saveAiMemory 回调', () => {
      const history: RunLog[] = []
      const saveFn = vi.fn()
      beginRunTracking(history, saveFn, () => { })
      expect(saveFn).toHaveBeenCalledOnce()
    })

    it('调用 render 回调', () => {
      const history: RunLog[] = []
      const renderFn = vi.fn()
      beginRunTracking(history, () => { }, renderFn)
      expect(renderFn).toHaveBeenCalledOnce()
    })
  })

  describe('writeLog', () => {
    it('写入 currentRunLog 的 actionLogs', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      writeLog('测试消息', 1, log, { actionLog: null }, () => { })
      expect(log.actionLogs).toHaveLength(1)
      expect(log.actionLogs[0]).toContain('测试消息')
    })

    it('写入 roundLogsByRound', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      writeLog('消息1', 3, log, { actionLog: null }, () => { })
      writeLog('消息2', 3, log, { actionLog: null }, () => { })
      expect(log.roundLogsByRound['3']).toHaveLength(2)
    })

    it('currentRunLog 为 null 时不崩溃', () => {
      expect(() => writeLog('msg', 1, null, { actionLog: null }, () => { })).not.toThrow()
    })

    it('actionLogs 超过 120 条时截断', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      for (let i = 0; i < 130; i++) {
        writeLog(`msg-${i}`, 1, log, { actionLog: null }, () => { })
      }
      expect(log.actionLogs.length).toBeLessThanOrEqual(120)
    })
  })

  describe('renderAiThoughtLog', () => {
    it('container 为 null 不崩溃', () => {
      expect(() => renderAiThoughtLog(null, [])).not.toThrow()
    })

    it('空日志显示暂无提示', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      renderAiThoughtLog(el, [])
      expect(el.textContent).toContain('暂无AI思考记录')
    })

    it('无 aiThoughtLogs 的 run 显示暂无记录', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      const logs: RunLog[] = [{
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }]
      renderAiThoughtLog(el, logs)
      expect(el.textContent).toContain('第 1 局')
      expect(el.textContent).toContain('暂无AI思考记录')
    })

    it('渲染 AI 思考条目', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      const logs: RunLog[] = [{
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [
          { round: 1, playerName: '左上AI', thought: '出价策略' }
        ] as any, roundLogsByRound: {}, roundPanelTexts: {}
      }]
      renderAiThoughtLog(el, logs)
      expect(el.textContent).toContain('R1')
      expect(el.textContent).toContain('左上AI')
      expect(el.textContent).toContain('出价策略')
    })

    it('渲染推理过程', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      const logs: RunLog[] = [{
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [
          { round: 1, playerName: 'AI', thought: '决策', reasoningContent: '推理步骤1\n推理步骤2' }
        ] as any, roundLogsByRound: {}, roundPanelTexts: {}
      }]
      renderAiThoughtLog(el, logs)
      expect(el.textContent).toContain('推理过程')
    })

    it('渲染最近日志', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      const logs: RunLog[] = [{
        runNo: 1, startedAt: Date.now(), actionLogs: ['日志1', '日志2'], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }]
      renderAiThoughtLog(el, logs)
      expect(el.textContent).toContain('最近日志')
      expect(el.textContent).toContain('日志1')
    })

    it('按局号倒序渲染', () => {
      const dom = new JSDOM('<div></div>')
      const el = dom.window.document.querySelector('div')!
      const logs: RunLog[] = [
        { runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [], roundLogsByRound: {}, roundPanelTexts: {} },
        { runNo: 2, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [], roundLogsByRound: {}, roundPanelTexts: {} }
      ]
      renderAiThoughtLog(el, logs)
      const text = el.textContent!
      const idx1 = text.indexOf('第 1 局')
      const idx2 = text.indexOf('第 2 局')
      expect(idx2).toBeLessThan(idx1)
    })
  })

  describe('recordAiThoughtLogs', () => {
    it('非 llm 模式不记录', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      recordAiThoughtLogs({ mode: 'rule' }, log, { aiLogicContent: null }, null, () => { })
      expect(log.aiThoughtLogs).toHaveLength(0)
    })

    it('currentRunLog 为 null 不崩溃', () => {
      expect(() =>
        recordAiThoughtLogs({ mode: 'llm', entries: [] }, null, { aiLogicContent: null }, null, () => { })
      ).not.toThrow()
    })

    it('llm 模式有 entries 时记录到 aiThoughtLogs', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      recordAiThoughtLogs(
        { mode: 'llm', round: 1, entries: [{ playerName: '左上AI', thought: '思考中', controlMode: 'llm' }] },
        log, { aiLogicContent: null }, null, () => { }
      )
      expect(log.aiThoughtLogs).toHaveLength(1)
      expect(log.aiThoughtLogs[0].playerName).toBe('左上AI')
      expect(log.aiThoughtLogs[0].thought).toContain('思考中')
    })

    it('空 thought 且无其他信息时跳过', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      recordAiThoughtLogs(
        { mode: 'llm', round: 1, entries: [{ playerName: 'AI', thought: '', controlMode: 'llm' }] },
        log, { aiLogicContent: null }, null, () => { }
      )
      expect(log.aiThoughtLogs).toHaveLength(0)
    })

    it('纠错信息包含在 thought 中', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      recordAiThoughtLogs(
        { mode: 'llm', round: 1, entries: [{ playerName: 'AI', thought: '重试', correctionAttempt: 2, originalError: 'JSON错误', controlMode: 'llm' }] },
        log, { aiLogicContent: null }, null, () => { }
      )
      expect(log.aiThoughtLogs[0].thought).toContain('纠错第2次')
      expect(log.aiThoughtLogs[0].thought).toContain('JSON错误')
    })

    it('历史和跨局记忆信息包含在 thought 中', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      recordAiThoughtLogs(
        { mode: 'llm', round: 1, entries: [{ playerName: 'AI', thought: '决策', historyMessagesCount: 5, crossGameMemoryCount: 3, inGameHistoryCount: 2, controlMode: 'llm' }] },
        log, { aiLogicContent: null }, null, () => { }
      )
      expect(log.aiThoughtLogs[0].thought).toContain('3局跨局记忆+2条本局历史')
    })
  })
})
