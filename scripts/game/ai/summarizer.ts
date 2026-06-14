/**
 * @file ai/summarizer.ts
 * @module ai/summarizer
 * @description AI 定期总结系统。当对局数达到设定间隔时，触发 LLM 生成跨局总结，
 *              替代或补充原有的反思条目（praises/strategies/lessons）。
 *
 * 触发条件：multiGameMemoryEnabled + 总结间隔到达
 * 总结内容：基于最近 N 局的历史记录，生成精炼的经验总结
 *
 * @exports window.MobaoSummarizer
 */

export interface SummaryResult {
  praises: string[]
  strategies: string[]
  lessons: string[]
  summaryText: string
}

export const MobaoSummarizer = {
  shouldSummarize(totalGamesPlayed: number, contextLength: number, autoSummarizeEnabled: boolean): boolean {
    if (!autoSummarizeEnabled || contextLength <= 0) return false
    return totalGamesPlayed > 0 && totalGamesPlayed >= contextLength && totalGamesPlayed % contextLength === 0
  },

  buildSummaryPrompt(
    recentRecords: Array<{ run: number; result: string; winnerProfit: number; qualityCounts: Record<string, number>; reflection: string | null }>,
    currentMemory: { praises: string[]; strategies: string[]; lessons: string[] },
    totalGames: number
  ): string {
    const recordLines = recentRecords.map((r) => {
      const parts = [`第${r.run}局: ${r.result}`]
      if (r.reflection) parts.push(`反思: ${r.reflection}`)
      return parts.join(" | ")
    })

    const praiseList = currentMemory.praises.map((p, i) => `${i}. ${p}`).join("; ")
    const strategyList = currentMemory.strategies.map((s, i) => `${i}. ${s}`).join("; ")
    const lessonList = currentMemory.lessons.map((l, i) => `${i}. ${l}`).join("; ")

    return [
      "请根据最近几局的表现生成一份精炼的跨局经验总结，返回JSON格式：",
      "{",
      '  "praises": { "add": ["新内容"], "delete": [索引号], "modify": [[索引号, "新内容"]] },',
      '  "strategies": { "add": [...], "delete": [...], "modify": [...] },',
      '  "lessons": { "add": [...], "delete": [...], "modify": [...] }',
      "}",
      "",
      "要求：",
      "- 总结应提炼出跨局的规律性经验，而非重复单局细节",
      "- 每个条目不超过50字",
      "- 如果条数已满，优先合并或优化现有条目",
      "- 只返回JSON",
      "",
      `当前共${totalGames}局历史。`,
      "",
      "【最近对局记录】",
      recordLines.join("\n"),
      "",
      "【当前经验本】",
      `- 成功经验(${currentMemory.praises.length}/10): ${praiseList || "无"}`,
      `- 策略建议(${currentMemory.strategies.length}/10): ${strategyList || "无"}`,
      `- 经验教训(${currentMemory.lessons.length}/10): ${lessonList || "无"}`
    ].join("\n")
  },

  parseSummaryResponse(responseText: string): SummaryResult | null {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0])
      return {
        praises: Array.isArray(parsed.praises) ? parsed.praises : [],
        strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        summaryText: responseText.slice(0, 500)
      }
    } catch {
      return null
    }
  }
}

;(window as unknown as Record<string, unknown>).MobaoSummarizer = MobaoSummarizer
