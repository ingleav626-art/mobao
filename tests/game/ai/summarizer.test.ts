import { describe, it, expect } from 'vitest'
import { MobaoSummarizer } from '../../../scripts/game/ai/summarizer'

describe('ai/summarizer', () => {
  describe('shouldSummarize', () => {
    it('未启用返回 false', () => {
      expect(MobaoSummarizer.shouldSummarize(5, 5, false)).toBe(false)
    })

    it('contextLength <= 0 返回 false', () => {
      expect(MobaoSummarizer.shouldSummarize(5, 0, true)).toBe(false)
      expect(MobaoSummarizer.shouldSummarize(5, -1, true)).toBe(false)
    })

    it('totalGamesPlayed = 0 返回 false', () => {
      expect(MobaoSummarizer.shouldSummarize(0, 5, true)).toBe(false)
    })

    it('达到间隔倍数返回 true', () => {
      expect(MobaoSummarizer.shouldSummarize(5, 5, true)).toBe(true)
      expect(MobaoSummarizer.shouldSummarize(10, 5, true)).toBe(true)
      expect(MobaoSummarizer.shouldSummarize(15, 5, true)).toBe(true)
    })

    it('未达到间隔返回 false', () => {
      expect(MobaoSummarizer.shouldSummarize(3, 5, true)).toBe(false)
      expect(MobaoSummarizer.shouldSummarize(7, 5, true)).toBe(false)
    })

    it('contextLength = 1 时每局都触发', () => {
      expect(MobaoSummarizer.shouldSummarize(1, 1, true)).toBe(true)
      expect(MobaoSummarizer.shouldSummarize(2, 1, true)).toBe(true)
    })
  })

  describe('buildSummaryPrompt (B: 纯上期总结文本)', () => {
    it('包含对局记录', () => {
      const records = [
        { run: 1, result: 'AI-1 以 5000 中标', winnerProfit: 2000, qualityCounts: { poor: 1 }, reflection: null },
        { run: 2, result: 'AI-2 以 3000 中标', winnerProfit: -1000, qualityCounts: { fine: 2 }, reflection: '反思内容' }
      ]
      const memory = { praises: ['经验1'], strategies: ['策略1'], lessons: [] }
      const prompt = MobaoSummarizer.buildSummaryPrompt(records, memory, 2)
      expect(prompt).toContain('第1局')
      expect(prompt).toContain('第2局')
      expect(prompt).toContain('反思内容')
    })

    it('包含当前经验本（仅供参考）', () => {
      const records = [{ run: 1, result: 'test', winnerProfit: 0, qualityCounts: {}, reflection: null }]
      const memory = { praises: ['经验A'], strategies: ['策略B', '策略C'], lessons: ['教训D'] }
      const prompt = MobaoSummarizer.buildSummaryPrompt(records, memory, 1)
      expect(prompt).toContain('经验A')
      expect(prompt).toContain('策略B')
      expect(prompt).toContain('教训D')
      expect(prompt).toContain('成功经验(1/10)')
      expect(prompt).toContain('策略建议(2/10)')
      expect(prompt).toContain('经验教训(1/10)')
    })

    it('包含总局数', () => {
      const records = [{ run: 1, result: 'test', winnerProfit: 0, qualityCounts: {}, reflection: null }]
      const memory = { praises: [], strategies: [], lessons: [] }
      const prompt = MobaoSummarizer.buildSummaryPrompt(records, memory, 5)
      expect(prompt).toContain('共5局历史')
    })

    it('空经验本显示"无"', () => {
      const records = [{ run: 1, result: 'test', winnerProfit: 0, qualityCounts: {}, reflection: null }]
      const memory = { praises: [], strategies: [], lessons: [] }
      const prompt = MobaoSummarizer.buildSummaryPrompt(records, memory, 1)
      expect(prompt).toContain('无')
    })

    it('只要求返回 summary 字段，不要求经验本增删改', () => {
      const records = [{ run: 1, result: 'test', winnerProfit: 0, qualityCounts: {}, reflection: null }]
      const memory = { praises: [], strategies: [], lessons: [] }
      const prompt = MobaoSummarizer.buildSummaryPrompt(records, memory, 1)
      // 要求 JSON schema 只含 summary
      expect(prompt).toContain('"summary"')
      // 不应包含经验本 ops 的 add/delete/modify 指令
      expect(prompt).not.toContain('praises": { "add"')
      expect(prompt).not.toContain('"modify"')
    })
  })

  describe('parseSummaryResponse', () => {
    it('解析有效 summary JSON', () => {
      const text = '{"summary": "最近胜率60%，高价值藏品宜果断出价"}'
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('最近胜率60%，高价值藏品宜果断出价')
    })

    it('从文本中提取 summary JSON', () => {
      const text = '这是我的总结：\n{"summary": "出价规律：首轮大胆"}\n结束'
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result).not.toBeNull()
      expect(result!.summary).toBe('出价规律：首轮大胆')
    })

    it('无效 JSON 返回 null', () => {
      expect(MobaoSummarizer.parseSummaryResponse('不是json')).toBeNull()
    })

    it('无 JSON 块返回 null', () => {
      expect(MobaoSummarizer.parseSummaryResponse('完全没有大括号')).toBeNull()
    })

    it('缺失 summary 字段返回 null', () => {
      const text = '{"praises": ["A"]}'
      expect(MobaoSummarizer.parseSummaryResponse(text)).toBeNull()
    })

    it('空 summary 返回 null', () => {
      const text = '{"summary": ""}'
      expect(MobaoSummarizer.parseSummaryResponse(text)).toBeNull()
    })

    it('summary 截取前 500 字', () => {
      const longSummary = 'x'.repeat(600)
      const text = `{"summary": "${longSummary}"}`
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result!.summary.length).toBe(500)
    })
  })
})
