/**
 * @file llm/core/llm-error.js
 * @module llm/core/llm-error
 * @description LLM 错误处理模块。提供 JSON 解析、错误分类、Toast 通知、Badge 显示、
 *              动作令牌归一化等能力。从 scene-llm.js 拆分而来，不依赖 deps 注入。
 *
 * @exports safeParseJson, tryExtractDecisionJson, parseLlmError, showAiErrorToast - 错误处理工具
 * @exports normalizeActionToken, isNoneActionText - 动作令牌归一化（LLM 响应文本解析）
 */

import type { WarehouseSceneThis } from '../../../types/warehouse-scene-this'
import type { Player } from '../../../types/game'

/**
 * 安全解析 JSON
 * @param text JSON 字符串
 * @returns 解析结果（结构不确定，来自 LLM 响应或外部输入）或 null
 *          调用者需做类型检查后再使用
 */
export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

export function tryExtractDecisionJson(rawText: string): Record<string, any> | null {
  const text = String(rawText || "").trim()
  if (!text) {
    return null
  }

  const direct = safeParseJson(text)
  if (direct && typeof direct === "object") {
    return direct
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const parsed = safeParseJson(fenced[1].trim())
    if (parsed && typeof parsed === "object") {
      return parsed
    }
  }

  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = text.slice(firstBrace, lastBrace + 1)
    const parsed = safeParseJson(slice)
    if (parsed && typeof parsed === "object") {
      return parsed
    }
  }

  return null
}

export function normalizeActionToken(value: string): string {
  return String(value || "")
    .replace(/[\s\-—_：:（）()]/g, "")
    .toLowerCase()
}

export function isNoneActionText(value: string): boolean {
  const text = normalizeActionToken(value)
  return ["无", "不使用", "none", "null", "nil", "na"].some((entry) => text === normalizeActionToken(entry))
}

interface LlmErrorInfo {
  brief: string
  detail: string
}

export function parseLlmError(raw: string | undefined, code: string): LlmErrorInfo {
  const s = String(raw || "")
  const firstPart = s.split("|")[0].trim()
  if (code === "EMPTY_RESPONSE" || /模型.*为空|输出.*截断|未生成/i.test(s)) {
    const isTrunc = /截断|length/i.test(s)
    return {
      brief: isTrunc ? "输出被截断" : "模型返回为空",
      detail: s || "模型未生成有效内容，请增大最大输出Token数。"
    }
  }
  if (code === "TIMEOUT" || code === "NETWORK_ERROR") {
    return code === "TIMEOUT"
      ? {
        brief: "请求超时",
        detail: "AI响应超时，可能是模型推理耗时过长或网络延迟。可尝试增大超时时间或切换更快的模型。"
      }
      : { brief: "网络连接失败", detail: "无法连接到API服务器，请检查网络状态或API地址是否正确。" }
  }
  if (code === "MISSING_API_KEY" || /api[_-]?key.*(空|缺|missing|填写)/i.test(s))
    return { brief: "API密钥缺失", detail: "未填写API Key，请在设置中填入有效的密钥。" }
  if (
    /invalid.*key|incorrect.*api|api.*key.*invalid|authentication.*(fail|错误)|unauthorized|鉴权|认证失败/i.test(s)
  )
    return { brief: "API密钥错误", detail: "API Key无效或已过期，请在设置中检查并更新密钥。" }
  if (/401|403/i.test(firstPart))
    return { brief: "API密钥错误", detail: "API Key无效或权限不足，请在设置中检查并更新密钥。" }
  if (/model.*not.*found|model.*not.*exist|invalid.*model|不存在.*模型/i.test(s))
    return { brief: "模型不存在", detail: "所选模型ID不存在或已下线，请在设置中更换模型。" }
  if (/rate.?limit|429|too many|限流|频率/i.test(s))
    return { brief: "请求过于频繁", detail: "API调用频率超限，请稍后再试或降低并发。" }
  if (/500|502|503|server.*error/i.test(s))
    return { brief: "服务器错误", detail: "API服务端返回错误，请稍后再试。" }
  if (/quota|balance|insufficient|余额|额度不足/i.test(s))
    return { brief: "额度不足", detail: "API账户余额或配额不足，请充值或更换账户。" }
  if (/json|parse|格式|syntax/i.test(s))
    return { brief: "响应解析失败", detail: "AI返回的内容格式异常，无法解析为有效决策。" }
  if (code === "HTTP_ERROR" || /HTTP\s*\d/i.test(s))
    return {
      brief: "请求被拒绝",
      detail: `服务端返回错误${firstPart ? "：" + firstPart : ""}。请检查API地址、密钥和模型配置。`
    }
  if (code === "EXCEPTION")
    return { brief: "请求异常", detail: firstPart || "请求过程中发生异常，请检查网络和设置。" }
  if (code === "PROXY_ERROR")
    return { brief: "代理错误", detail: firstPart || "代理服务返回异常，请检查代理配置。" }
  if (code === "MODEL_MISMATCH")
    return { brief: "模型不一致", detail: firstPart || "服务端返回的模型与配置不一致。" }
  return { brief: "请求失败", detail: firstPart || "未知错误，请查看控制台日志了解详情。" }
}

export function showAiErrorToast(playerName: string, errorSummary: string): void {
  const toast = document.createElement("div")
  toast.className = "ai-error-toast"
  toast.textContent = `${playerName} AI请求失败：${errorSummary}`
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.classList.add("toast-out")
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast)
    }, 450)
  }, 3600)
}

export function setPlayerLlmError(scene: WarehouseSceneThis, playerId: string, errorMessage: string, code: string, level?: string): void {
  if (!scene._aiLlmErrors) scene._aiLlmErrors = {}
  const parsed = parseLlmError(errorMessage, code)
  scene._aiLlmErrors[playerId] = {
    message: errorMessage,
    brief: parsed.brief,
    detail: parsed.detail,
    level: level || "error",
    timestamp: Date.now()
  }

  const metaEl = document.querySelector(`#playerCard-${playerId} .meta`)
  if (!metaEl) return

  let row = metaEl.querySelector(".llm-row")
  if (!row) {
    row = document.createElement("div")
    row.className = "llm-row"
    const llmSwitch = metaEl.querySelector(".llm-player-switch")
    if (llmSwitch) {
      metaEl.insertBefore(row, llmSwitch)
      row.appendChild(llmSwitch)
    } else {
      metaEl.appendChild(row)
    }
  }

  let badge = row.querySelector(".llm-error-badge") as HTMLElement | null
  if (!badge) {
    badge = document.createElement("span")
    badge.className = "llm-error-badge"
    row.appendChild(badge)
  }
  badge.textContent = parsed.brief
  badge.classList.toggle("warning", level === "warning")

  badge.onclick = (e: MouseEvent) => {
    e.stopPropagation()
    const player = scene.players.find((p: Player) => p.id === playerId)
    const pName = player ? player.name : playerId
    const errData = scene._aiLlmErrors[playerId]
    const time = errData ? new Date(errData.timestamp).toLocaleTimeString() : ""
    const content = `<p><strong>玩家：</strong>${pName}</p><p><strong>时间：</strong>${time}</p><p><strong>错误类型：</strong>${errData.brief}</p><p><strong>说明：</strong>${errData.detail}</p>`
    if (typeof scene.showPlayerInfoPopover === "function") {
      scene.showPlayerInfoPopover("AI报错信息", content, e.clientX, e.clientY)
    }
  }
}

export function clearPlayerLlmErrors(scene: WarehouseSceneThis): void {
  if (!scene._aiLlmErrors) {
    scene._aiLlmErrors = {}
    return
  }
  Object.keys(scene._aiLlmErrors).forEach((pid) => {
    const badge = document.querySelector(`#playerCard-${pid} .llm-error-badge`)
    if (badge) badge.remove()
  })
  scene._aiLlmErrors = {}
}
