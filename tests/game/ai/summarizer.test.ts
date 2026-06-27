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

  describe('buildSummaryPrompt', () => {
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

    it('包含当前经验本', () => {
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
  })

  describe('parseSummaryResponse', () => {
    it('解析有效 JSON', () => {
      const text = '{"praises": ["经验1"], "strategies": ["策略1"], "lessons": ["教训1"]}'
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result).not.toBeNull()
      expect(result!.praises).toEqual(['经验1'])
      expect(result!.strategies).toEqual(['策略1'])
      expect(result!.lessons).toEqual(['教训1'])
    })

    it('从文本中提取 JSON', () => {
      const text = '这是我的总结：\n{"praises": ["A"], "strategies": [], "lessons": []}\n结束'
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result).not.toBeNull()
      expect(result!.praises).toEqual(['A'])
    })

    it('无效 JSON 返回 null', () => {
      expect(MobaoSummarizer.parseSummaryResponse('不是json')).toBeNull()
    })

    it('无 JSON 块返回 null', () => {
      expect(MobaoSummarizer.parseSummaryResponse('完全没有大括号')).toBeNull()
    })

    it('缺失字段用空数组填充', () => {
      const text = '{"praises": ["A"]}'
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result!.strategies).toEqual([])
      expect(result!.lessons).toEqual([])
    })

    it('summaryText 截取前 500 字', () => {
      const longText = 'x'.repeat(600)
      const text = `{"praises":[]}\n${longText}`
      const result = MobaoSummarizer.parseSummaryResponse(text)
      expect(result!.summaryText.length).toBeLessThanOrEqual(500)
    })
  })
})
