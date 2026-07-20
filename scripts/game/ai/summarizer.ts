/**
 * @file ai/summarizer.ts
 * @module ai/summarizer
 * @description AI 上期总结生成器（B 提示词）。在上下文清空/总结时机，基于最近 N 局历史
 *              生成"上期总结"文本（胜率、关键教训、出价规律摘要），注入下局决策上下文
 *              的 Layer ④。
 *
 * 设计要点：
 *   - B 只产出上期总结文本，**不更新经验本**（经验本更新是反思 A 的职责）。
 *   - 与反思独立：反思关闭时，总结仍可单独调用 B。
 *   - 反思开启且到总结时机时，B 的请求可 piggyback 进反思 prompt（A+B 合并），
 *     由 reflection-manager 拼接，本模块只负责 B standalone 的 prompt 构造与解析。
 *
 * @exports window.MobaoSummarizer
 *
 * @requires game/ai/memory - AI记忆系统
 */

export interface SummaryResult {
  summary: string
}

export const MobaoSummarizer = {
  shouldSummarize(totalGamesPlayed: number, contextLength: number, autoSummarizeEnabled: boolean): boolean {
    if (!autoSummarizeEnabled || contextLength <= 0) return false
    return totalGamesPlayed > 0 && totalGamesPlayed >= contextLength && totalGamesPlayed % contextLength === 0
  },

  /**
   * 构建 B（上期总结）standalone prompt。只要求返回 {summary:"..."}，不涉及经验本增删改。
   * recentRecords: 最近 N 局记录；currentMemory: 当前经验本（仅作参考，不可修改）。
   */
  buildSummaryPrompt(
    recentRecords: Array<{
      run: number
      result: string
      winnerProfit: number
      qualityCounts: Record<string, number>
      reflection: string | null
    }>,
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
      "请根据最近几局的表现生成一份上期总结，用于下局开局时快速回忆，返回JSON格式：",
      '{ "summary": "..." }',
      "",
      "要求：",
      "- summary 涵盖最近几局的胜率、关键教训、出价规律等摘要",
      "- 提炼跨局的规律性经验，而非重复单局细节",
      "- 不超过500字",
      "- 只返回JSON，不要其他文字",
      "",
      `当前共${totalGames}局历史。`,
      "",
      "【最近对局记录】",
      recordLines.join("\n"),
      "",
      "【当前经验本】（仅供参考，不要修改）",
      `- 成功经验(${currentMemory.praises.length}/10): ${praiseList || "无"}`,
      `- 策略建议(${currentMemory.strategies.length}/10): ${strategyList || "无"}`,
      `- 经验教训(${currentMemory.lessons.length}/10): ${lessonList || "无"}`
    ].join("\n")
  },

  /** 解析 B 的响应，提取 summary 文本。无效返回 null。 */
  parseSummaryResponse(responseText: string): SummaryResult | null {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0])
      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
      if (!summary) return null
      return { summary: summary.slice(0, 500) }
    } catch {
      return null
    }
  }
}
;(window as unknown as Record<string, unknown>).MobaoSummarizer = MobaoSummarizer
