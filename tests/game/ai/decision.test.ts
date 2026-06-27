import { describe, it, expect } from 'vitest'
import {
  compactPanelTextForSnapshot,
  buildAiDecisionPanelSnapshot,
  beginRunTracking,
  writeLog,
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
      const log = beginRunTracking(history, () => {}, () => {})
      expect(log.runNo).toBe(1)
      expect(log.actionLogs).toEqual([])
      expect(log.aiThoughtLogs).toEqual([])
      expect(history).toHaveLength(1)
    })

    it('runNo 递增', () => {
      const history: RunLog[] = []
      beginRunTracking(history, () => {}, () => {})
      const log2 = beginRunTracking(history, () => {}, () => {})
      expect(log2.runNo).toBe(2)
    })

    it('历史超过 12 局时截断', () => {
      const history: RunLog[] = []
      for (let i = 0; i < 15; i++) {
        beginRunTracking(history, () => {}, () => {})
      }
      expect(history).toHaveLength(12)
      expect(history[0].runNo).toBe(4) // 15-12+1
    })

    it('调用 saveAiMemory 回调', () => {
      const history: RunLog[] = []
      const saveFn = vi.fn()
      beginRunTracking(history, saveFn, () => {})
      expect(saveFn).toHaveBeenCalledOnce()
    })

    it('调用 render 回调', () => {
      const history: RunLog[] = []
      const renderFn = vi.fn()
      beginRunTracking(history, () => {}, renderFn)
      expect(renderFn).toHaveBeenCalledOnce()
    })
  })

  describe('writeLog', () => {
    it('写入 currentRunLog 的 actionLogs', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      writeLog('测试消息', 1, log, { actionLog: null }, () => {})
      expect(log.actionLogs).toHaveLength(1)
      expect(log.actionLogs[0]).toContain('测试消息')
    })

    it('写入 roundLogsByRound', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      writeLog('消息1', 3, log, { actionLog: null }, () => {})
      writeLog('消息2', 3, log, { actionLog: null }, () => {})
      expect(log.roundLogsByRound['3']).toHaveLength(2)
    })

    it('currentRunLog 为 null 时不崩溃', () => {
      expect(() => writeLog('msg', 1, null, { actionLog: null }, () => {})).not.toThrow()
    })

    it('actionLogs 超过 120 条时截断', () => {
      const log: RunLog = {
        runNo: 1, startedAt: Date.now(), actionLogs: [], aiThoughtLogs: [],
        roundLogsByRound: {}, roundPanelTexts: {}
      }
      for (let i = 0; i < 130; i++) {
        writeLog(`msg-${i}`, 1, log, { actionLog: null }, () => {})
      }
      expect(log.actionLogs.length).toBeLessThanOrEqual(120)
    })
  })
})
