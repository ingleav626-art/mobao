/**
 * @file tests/llm/providers/response-parse.test.ts
 * @description 验证 requestChat 从 API 返回的 JSON 中正确提取 content 和 reasoningContent。
 *              覆盖 OpenAI 标准格式和兼容格式。
 *              Bug: choices[0].content → choices[0].message.content 字段路径错误导致"模型返回为空"
 */
import { describe, it, expect, vi } from "vitest"
import { DeepSeekProvider } from "../../../scripts/llm/providers/deepseek-provider"
import { QwenProvider } from "../../../scripts/llm/providers/qwen-provider"

// OpenAI-compatible API 标准返回格式
function makeOkResponse(content: string, reasoning?: string, finishReason = "stop") {
  const choice: Record<string, unknown> = {
    index: 0,
    message: { role: "assistant", content },
    finish_reason: finishReason,
  }
  if (reasoning) {
    ;(choice.message as Record<string, unknown>).reasoning_content = reasoning
  }
  return {
    id: "chatcmpl-001",
    object: "chat.completion",
    created: Date.now(),
    model: "test-model",
    choices: [choice],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }
}

// 非标准 API（部分代理/自定义把 content 放在 choice 顶层）
function makeFlatChoiceResponse(content: string) {
  return {
    id: "chatcmpl-002",
    object: "chat.completion",
    choices: [{ index: 0, content, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

function mockFetch(body: Record<string, unknown>, status = 200) {
  const originalFetch = window.fetch
  window.fetch = vi.fn(async () => {
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return () => {
    window.fetch = originalFetch
  }
}

describe("requestChat 响应解析", () => {
  describe("OpenAI 标准格式 choices[0].message.content", () => {
    it("DeepSeek provider: 正确提取 content", async () => {
      const provider = DeepSeekProvider
      const body = makeOkResponse("标准出价 5000，不竞争")
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "出价测试" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://api.deepseek.com/v1",
            model: "deepseek-v4-flash",
          },
        })

        // 核心断言：content 不为空 = 不是"模型返回为空"
        expect(result.content).toBeTruthy()
        expect(result.content).toBe("标准出价 5000，不竞争")
        expect(result.ok).toBe(true)
        expect(result.reasoningContent).toBe("")
      } finally {
        restore()
      }
    })

    it("DeepSeek provider: 正确提取 reasoningContent（思维链）", async () => {
      const provider = DeepSeekProvider
      const body = makeOkResponse(
        "出价 8000",
        "分析：当前仓库可能存在高价值藏品，建议出价8000以压倒对手..."
      )
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "决策" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://api.deepseek.com/v1",
            model: "deepseek-reasoner",
            thinkingEnabled: true,
          },
        })

        expect(result.content).toBe("出价 8000")
        expect(result.reasoningContent).toContain("建议出价8000")
        expect(result.ok).toBe(true)
      } finally {
        restore()
      }
    })

    it("Qwen provider: 正确提取 content", async () => {
      const provider = QwenProvider
      const body = makeOkResponse("通义千问决策：出价 3000")
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "测试" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            model: "qwen-plus",
          },
        })

        expect(result.content).toBe("通义千问决策：出价 3000")
        expect(result.ok).toBe(true)
      } finally {
        restore()
      }
    })
  })

  describe("非标准格式 choices[0].content（兼容性）", () => {
    it("flat choice 格式：正确提取 content", async () => {
      const provider = DeepSeekProvider
      const body = makeFlatChoiceResponse("代理格式内容")
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "test" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://api.example.com/v1",
            model: "custom-model",
          },
        })

        // 兼容：flat choice 格式也应正确提取
        expect(result.content).toBe("代理格式内容")
        expect(result.ok).toBe(true)
      } finally {
        restore()
      }
    })
  })

  describe("空返回检测", () => {
    it("API 返回无 content 时 content 为空字符串（非 null/undefined）", async () => {
      const provider = DeepSeekProvider
      const body = {
        // 标准格式但 message.content 不存在
        choices: [{ index: 0, message: { role: "assistant" }, finish_reason: "stop" }],
      }
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "test" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://api.deepseek.com/v1",
            model: "deepseek-v4-flash",
          },
        })

        // 无 content → 空字符串（由决策链的 EMPTY_RESPONSE 逻辑处理）
        // 不是说 content 属性不存在，而是值为 ""
        expect(result.content).toBe("")
        expect(result.ok).toBe(true)
      } finally {
        restore()
      }
    })

    it("API 返回空 choices 时不崩溃", async () => {
      const provider = DeepSeekProvider
      const body = { choices: [] }
      const restore = mockFetch(body)

      try {
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: 600,
          timeoutMs: 3000,
          messages: [{ role: "user", content: "test" }],
          settings: {
            apiKey: "sk-test",
            endpoint: "https://api.deepseek.com/v1",
            model: "deepseek-v4-flash",
          },
        })

        expect(result.content).toBe("")
        expect(result.ok).toBe(true)
        // 不应该抛异常
      } finally {
        restore()
      }
    })
  })
})
