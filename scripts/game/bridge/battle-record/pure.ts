/**
 * @file bridge/battle-record/pure
 * @module bridge/battle-record/pure
 * @description 战绩记录系统纯函数。无 this、无闭包依赖，可独立测试。
 *              - formatRecordTime：ISO 时间格式化为本地可读字符串
 *              - parsePanelTextToHtml：AI 决策面板文本转 HTML（escapeHtml 由调用方注入）
 */

/**
 * 格式化 ISO 时间字符串为本地可读格式
 * @param iso - ISO 时间字符串
 * @returns 格式化后的时间字符串，无效输入返回 "未知时间"
 */
export function formatRecordTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return "未知时间"
  }
  return date.toLocaleString("zh-CN", { hour12: false })
}

/**
 * 将 AI 决策面板文本解析为 HTML 片段
 * @param text - 面板原始文本（多行，含 AI 决策卡片 / 规则AI卡片 / prompt 块等）
 * @param escapeHtml - HTML 转义函数（由调用方注入，避免硬依赖）
 * @returns 拼接好的 HTML 字符串
 */
export function parsePanelTextToHtml(text: string, escapeHtml: (s: string) => string): string {
  if (!text) return ""
  const lines = text.split("\n")
  const htmlParts: string[] = []
  let currentEntry: string[] = []
  let inPromptBlock = false
  let promptTitle = ""

  const flushEntry = () => {
    if (currentEntry.length === 0) return
    const entryText = currentEntry.join("\n")
    if (entryText.includes("接管状态: 大模型") || entryText.includes("接管状态: 规则AI")) {
      const isLlm = entryText.includes("接管状态: 大模型")
      const isFallback = entryText.includes("⚠️")
      const nameMatch = entryText.match(/^(.+?)（(.+?)）/)
      const playerName = nameMatch ? nameMatch[1] : "AI"
      const playerId = nameMatch ? nameMatch[2] : ""
      const bidMatch = entryText.match(/最终出价:\s*(.+?)\s*\|/)
      const bid = bidMatch ? bidMatch[1] : "?"
      const sourceMatch = entryText.match(/决策来源:\s*(.+)/)
      const source = sourceMatch ? sourceMatch[1].trim() : "?"
      const thoughtMatch = entryText.match(/思考:\s*(.+)/)
      const thought = thoughtMatch ? thoughtMatch[1] : ""
      const errorMatch = entryText.match(/错误:\s*(.+)/)
      const error = errorMatch ? errorMatch[1] : ""
      const cacheMatch = entryText.match(/缓存命中:\s*(.+)/)
      const cacheInfo = cacheMatch ? cacheMatch[1] : ""
      const memoryMatch = entryText.match(/跨局记忆注入:\s*(.+)/)
      const memoryInfo = memoryMatch ? memoryMatch[1] : ""
      const actionMatch = entryText.match(/大模型动作:\s*(.+)/)
      const actionInfo = actionMatch ? actionMatch[1] : ""
      const fallbackBidMatch = entryText.match(/回退规则出价参考:\s*(.+)/)
      const fallbackBid = fallbackBidMatch ? fallbackBidMatch[1] : ""

      const badgeClass = isFallback ? "badge-fallback" : isLlm ? "badge-llm" : "badge-rule"
      const badgeText = isFallback ? "回退" : isLlm ? "大模型" : "规则AI"

      htmlParts.push(
        `<div class="ai-player-card"><div class="ai-player-card-header"><span class="player-name">${escapeHtml(playerName)}（${escapeHtml(playerId)}）</span><span class="control-badge ${badgeClass}">${badgeText}</span></div><div class="ai-player-card-body">`
      )
      htmlParts.push(
        `<div class="ai-decision-summary"><span class="label">出价</span><span class="value bid-value">${escapeHtml(bid)}</span><span class="label">来源</span><span class="value">${escapeHtml(source)}</span></div>`
      )
      if (isFallback)
        htmlParts.push(`<div class="ai-error-box">⚠️ ${escapeHtml(entryText.match(/⚠️\s*(.+)/)?.[1] || "回退")}</div>`)
      if (cacheInfo) htmlParts.push(`<div class="ai-cache-info">缓存: ${escapeHtml(cacheInfo)}</div>`)
      if (memoryInfo) htmlParts.push(`<div class="ai-memory-inject-info">跨局记忆注入: ${escapeHtml(memoryInfo)}</div>`)
      if (actionInfo)
        htmlParts.push(
          `<div class="ai-decision-summary"><span class="label">动作</span><span class="value">${escapeHtml(actionInfo)}</span></div>`
        )
      if (fallbackBid)
        htmlParts.push(
          `<div class="ai-decision-summary"><span class="label">回退参考</span><span class="value">${escapeHtml(fallbackBid)}</span></div>`
        )
      if (thought)
        htmlParts.push(`<div class="ai-thought-box"><div class="thought-label">思考</div>${escapeHtml(thought)}</div>`)
      if (error) htmlParts.push(`<div class="ai-error-box">错误: ${escapeHtml(error)}</div>`)
      htmlParts.push("</div></div>")
    } else if (entryText.match(/信心\s*\d+%.*人格/)) {
      const ruleMatch = entryText.match(/信心\s*(\d+)%\s*\|\s*人格\s*(.+)/)
      const confidence = ruleMatch ? ruleMatch[1] : "?"
      const archetype = ruleMatch ? ruleMatch[2] : "?"
      const valueMatch = entryText.match(/估值:\s*(.+?)\s*\|\s*上限\s*(.+)/)
      const perceivedValue = valueMatch ? valueMatch[1] : "?"
      const hardCap = valueMatch ? valueMatch[2] : "?"
      const psychMatch = entryText.match(/心理预期:\s*(.+)/)
      const psychExpected = psychMatch ? psychMatch[1] : "?"
      const overheatMatch = entryText.match(/超预期:\s*(.+?)%\s*\|\s*回撤阈值\s*(.+?)%/)
      const overheat = overheatMatch ? overheatMatch[1] : "?"
      const threshold = overheatMatch ? overheatMatch[2] : "?"
      const behaviorMatch = entryText.match(/行为:\s*(.+)/)
      const behavior = behaviorMatch ? behaviorMatch[1] : ""

      htmlParts.push(
        `<div class="ai-player-card"><div class="ai-player-card-header"><span class="player-name">规则AI</span><span class="control-badge badge-rule">规则AI</span></div><div class="ai-player-card-body">`
      )
      htmlParts.push(
        `<div class="ai-decision-summary"><span class="label">信心</span><span class="value">${escapeHtml(confidence)}% | 人格 ${escapeHtml(archetype)}</span><span class="label">估值</span><span class="value">${escapeHtml(perceivedValue)} | 上限 ${escapeHtml(hardCap)}</span><span class="label">心理预期</span><span class="value">${escapeHtml(psychExpected)}</span><span class="label">超预期</span><span class="value">${escapeHtml(overheat)}% | 回撤阈值 ${escapeHtml(threshold)}%</span></div>`
      )
      if (behavior)
        htmlParts.push(
          `<div class="ai-decision-summary"><span class="label">行为</span><span class="value">${escapeHtml(behavior)}</span></div>`
        )
      htmlParts.push("</div></div>")
    } else {
      htmlParts.push(`<div style="font-size:12px;color:#6b5a48;padding:4px 0;">${escapeHtml(entryText)}</div>`)
    }
    currentEntry = []
  }

  for (const line of lines) {
    if (line.match(/^\[.+\]$/)) {
      flushEntry()
      inPromptBlock = true
      promptTitle = line.slice(1, -1)
      continue
    }
    if (inPromptBlock) {
      if (line === "" && currentEntry.length > 0) {
        htmlParts.push(
          `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">${escapeHtml(promptTitle)}</summary><pre>${escapeHtml(currentEntry.join("\n"))}</pre></details>`
        )
        currentEntry = []
        inPromptBlock = false
      } else {
        currentEntry.push(line)
      }
      continue
    }
    if (line === "-") {
      flushEntry()
      continue
    }
    if (line.startsWith("回合 ") || line.startsWith("说明：")) {
      continue
    }
    currentEntry.push(line)
  }
  flushEntry()
  if (inPromptBlock && currentEntry.length > 0) {
    htmlParts.push(
      `<details class="ai-prompt-block"><summary class="ai-prompt-block-header">${escapeHtml(promptTitle)}</summary><pre>${escapeHtml(currentEntry.join("\n"))}</pre></details>`
    )
  }

  return htmlParts.join("")
}
