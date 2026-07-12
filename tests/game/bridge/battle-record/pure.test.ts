import { describe, it, expect } from "vitest"
import { parsePanelTextToHtml, formatRecordTime } from "../../../../scripts/game/bridge/battle-record/pure"

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

describe("parsePanelTextToHtml", () => {
  it("空文本返回空字符串", () => {
    expect(parsePanelTextToHtml("", escapeHtml)).toBe("")
    expect(parsePanelTextToHtml(null as unknown as string, escapeHtml)).toBe("")
  })

  it("LLM 决策卡片渲染 badge-llm", () => {
    const text = [
      "玩家1（p1）",
      "接管状态: 大模型",
      "最终出价: 5000 |",
      "决策来源: llm",
      "思考: 这是一个思考"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("ai-player-card")
    expect(html).toContain("badge-llm")
    expect(html).toContain("大模型")
    expect(html).toContain("玩家1")
    expect(html).toContain("5000")
    expect(html).toContain("ai-thought-box")
    expect(html).toContain("这是一个思考")
  })

  it("规则AI 决策卡片渲染 badge-rule", () => {
    const text = [
      "玩家2（p2）",
      "接管状态: 规则AI",
      "最终出价: 3000 |",
      "决策来源: rule"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("ai-player-card")
    expect(html).toContain("badge-rule")
    expect(html).toContain("规则AI")
    expect(html).toContain("3000")
  })

  it("信心/人格 规则AI卡片渲染信心拆解", () => {
    const text = [
      "信心 80% | 人格 激进",
      "估值: 4000 | 上限 5000",
      "心理预期: 3500",
      "超预期: 120% | 回撤阈值 80%",
      "行为: 加价"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("ai-player-card")
    expect(html).toContain("badge-rule")
    expect(html).toContain("80%")
    expect(html).toContain("激进")
    expect(html).toContain("4000")
    expect(html).toContain("5000")
    expect(html).toContain("行为")
  })

  it("prompt 块渲染 details/summary/pre", () => {
    const text = ["[系统提示词]", "这是提示词内容", "第二行", ""].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("ai-prompt-block")
    expect(html).toContain("系统提示词")
    expect(html).toContain("<pre>")
    expect(html).toContain("这是提示词内容")
    expect(html).toContain("第二行")
  })

  it("回退卡片（⚠️）渲染 badge-fallback 和错误框", () => {
    const text = [
      "玩家3（p3）",
      "接管状态: 大模型",
      "⚠️ LLM调用失败",
      "最终出价: 2000 |",
      "决策来源: rule"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("badge-fallback")
    expect(html).toContain("回退")
    expect(html).toContain("ai-error-box")
    expect(html).toContain("LLM调用失败")
  })

  it("LLM 卡片含缓存/跨局记忆/动作信息", () => {
    const text = [
      "玩家1（p1）",
      "接管状态: 大模型",
      "最终出价: 5000 |",
      "决策来源: llm",
      "缓存命中: 100/200 tokens",
      "跨局记忆注入: 上局高价记忆",
      "大模型动作: 加价"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("ai-cache-info")
    expect(html).toContain("100/200 tokens")
    expect(html).toContain("ai-memory-inject-info")
    expect(html).toContain("上局高价记忆")
    expect(html).toContain("动作")
    expect(html).toContain("加价")
  })

  it("HTML 特殊字符被转义", () => {
    const text = '<script>alert(1)</script>'
    const html = parsePanelTextToHtml(text, escapeHtml)
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })

  it("多条目以 - 分隔生成多个卡片", () => {
    const text = [
      "玩家1（p1）",
      "接管状态: 大模型",
      "最终出价: 5000 |",
      "决策来源: llm",
      "-",
      "玩家2（p2）",
      "接管状态: 规则AI",
      "最终出价: 3000 |",
      "决策来源: rule"
    ].join("\n")
    const html = parsePanelTextToHtml(text, escapeHtml)
    const cardCount = (html.match(/class="ai-player-card"/g) || []).length
    expect(cardCount).toBe(2)
    expect(html).toContain("玩家1")
    expect(html).toContain("玩家2")
  })
})

describe("formatRecordTime (pure)", () => {
  it("有效 ISO 返回格式化字符串", () => {
    const result = formatRecordTime("2025-01-15T10:30:00Z")
    expect(result).not.toBe("未知时间")
    expect(result.length).toBeGreaterThan(0)
  })

  it("无效输入返回 '未知时间'", () => {
    expect(formatRecordTime("invalid-date")).toBe("未知时间")
    expect(formatRecordTime("")).toBe("未知时间")
  })
})
