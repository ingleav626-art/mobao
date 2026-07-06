import { describe, it, expect } from "vitest"
import { safeParseJson, tryExtractDecisionJson, parseLlmError } from "../../../scripts/llm/core/llm-error"

describe("llm-error", () => {
  describe("safeParseJson", () => {
    it("有效 JSON 对象", () => {
      expect(safeParseJson('{"a":1}')).toEqual({ a: 1 })
    })
    it("有效 JSON 数组", () => {
      expect(safeParseJson("[1,2,3]")).toEqual([1, 2, 3])
    })
    it("有效 JSON 数字/字符串", () => {
      expect(safeParseJson("42")).toBe(42)
      expect(safeParseJson('"hi"')).toBe("hi")
    })
    it("无效 JSON 返回 null", () => {
      expect(safeParseJson("{invalid}")).toBeNull()
    })
    it("空字符串返回 null", () => {
      expect(safeParseJson("")).toBeNull()
    })
  })

  describe("tryExtractDecisionJson", () => {
    it("直接是 JSON 对象", () => {
      expect(tryExtractDecisionJson('{"bid":1000}')).toEqual({ bid: 1000 })
    })
    it("前后有空白仍可解析", () => {
      expect(tryExtractDecisionJson('  \n{"bid":1000}\n  ')).toEqual({ bid: 1000 })
    })
    it("```json 代码块包裹", () => {
      const text = '```json\n{"bid":2000}\n```'
      expect(tryExtractDecisionJson(text)).toEqual({ bid: 2000 })
    })
    it("``` 代码块包裹", () => {
      const text = '```\n{"bid":3000}\n```'
      expect(tryExtractDecisionJson(text)).toEqual({ bid: 3000 })
    })
    it("文本中嵌入花括号", () => {
      const text = '思考：根据信号\n{"bid":4000}\n完成'
      expect(tryExtractDecisionJson(text)).toEqual({ bid: 4000 })
    })
    it("空字符串返回 null", () => {
      expect(tryExtractDecisionJson("")).toBeNull()
    })
    it("无 JSON 内容返回 null", () => {
      expect(tryExtractDecisionJson("纯文本没有JSON")).toBeNull()
    })
    it("null/undefined 输入返回 null", () => {
      expect(tryExtractDecisionJson(null as unknown as string)).toBeNull()
      expect(tryExtractDecisionJson(undefined as unknown as string)).toBeNull()
    })
    it("原始值为 JSON 数组也被提取（typeof [] === object）", () => {
      expect(tryExtractDecisionJson("[1,2,3]")).toEqual([1, 2, 3])
    })
  })

  describe("parseLlmError", () => {
    it("EMPTY_RESPONSE 输出被截断", () => {
      const result = parseLlmError("输出被截断 length", "EMPTY_RESPONSE")
      expect(result.brief).toBe("输出被截断")
      expect(result.detail).toContain("截断")
    })
    it("EMPTY_RESPONSE 模型返回为空", () => {
      const result = parseLlmError("模型输出为空", "EMPTY_RESPONSE")
      expect(result.brief).toBe("模型返回为空")
    })
    it("TIMEOUT", () => {
      const result = parseLlmError("timeout", "TIMEOUT")
      expect(result.brief).toBe("请求超时")
      expect(result.detail).toContain("超时")
    })
    it("NETWORK_ERROR", () => {
      const result = parseLlmError("connect failed", "NETWORK_ERROR")
      expect(result.brief).toBe("网络连接失败")
    })
    it("MISSING_API_KEY", () => {
      const result = parseLlmError("api key missing", "MISSING_API_KEY")
      expect(result.brief).toBe("API密钥缺失")
    })
    it("API密钥错误（401）", () => {
      const result = parseLlmError("401 Unauthorized", "HTTP_ERROR")
      expect(result.brief).toBe("API密钥错误")
    })
    it("模型不存在", () => {
      const result = parseLlmError("model not found", "HTTP_ERROR")
      expect(result.brief).toBe("模型不存在")
    })
    it("限流 429", () => {
      const result = parseLlmError("429 rate limit", "HTTP_ERROR")
      expect(result.brief).toBe("请求过于频繁")
    })
    it("服务器错误 500", () => {
      const result = parseLlmError("500 server error", "HTTP_ERROR")
      expect(result.brief).toBe("服务器错误")
    })
    it("额度不足", () => {
      const result = parseLlmError("insufficient balance", "HTTP_ERROR")
      expect(result.brief).toBe("额度不足")
    })
    it("JSON 解析失败", () => {
      const result = parseLlmError("json parse error", "HTTP_ERROR")
      expect(result.brief).toBe("响应解析失败")
    })
    it("未知错误 fallback", () => {
      const result = parseLlmError("some weird error", "UNKNOWN_CODE")
      expect(result.brief).toBe("请求失败")
    })
  })
})
