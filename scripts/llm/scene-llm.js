/**
 * @file llm/scene-llm.js
 * @module llm/scene-llm
 * @description 场景 LLM 桥接器。采用 IIFE 模式，挂载到 window.MobaoSceneLlm。
 *              是 AI 决策系统与 LLM 后端之间的核心桥梁，负责构建 prompt、调用 LLM、
 *              解析响应、执行工具、纠错重试、记录遥测数据等完整流程。
 *
 * 核心导出：
 *   - createSceneLlmBridge(deps): 工厂函数，创建 LLM 桥接器实例
 *     参数为依赖注入对象，包含常量、设置、工具函数等
 *   返回对象的方法：
 *     - loadAiLlmPlayerSwitches(players): 加载每个玩家的 LLM 开关
 *     - requestLlmDecision(playerId, context): 请求 LLM 出价决策
 *       完整流程：构建 prompt → 调用 LLM → 解析 JSON → 纠错 → 工具执行 → 追问
 *     - requestLlmReflection(playerId, context): 请求 LLM 局后反思
 *     - pushAiContext(playerId, context): 推送 AI 上下文（跨局记忆）
 *     - stopAiContext(playerId): 停止推送
 *     - saveAiLlmPlayerSwitches(switches): 保存 LLM 开关
 *
 * Prompt 系统（LLM_DECISION_SYSTEM_PROMPT）：
 *   完整的 AI 竞拍决策指令，包含：
 *   - 身份与目标：竞拍AI玩家，低于真实价值盈利
 *   - 游戏机制：盲拍/提前获胜/分红/门票
 *   - 字段参考：warehouseDefinition/qualityPriceGuide/privateIntel/等
 *   - 硬约束：禁止弃标/两段式流程/禁止臆造
 *   - 策略建议：大胆出价/跨局记忆/欺诈策略
 *   - 输出格式：JSON{ bid, skill, item, thought }
 *
 * 决策流程：
 *   1. initial 阶段：构建 prompt → 调用 LLM → 解析响应
 *   2. 若使用了工具（skill/item），进入 follow-up-after-tool 阶段
 *   3. 追问 LLM 根据工具结果更新出价
 *   4. 纠错机制：JSON 解析失败时尝试提取/修复
 *   5. 遥测记录：prompt/response/纠错过程/工具结果
 *
 * 工具系统：
 *   - LLM 可调用技能和道具（通过 skill/item 字段）
 *   - 工具结果作为 follow-up 上下文反馈给 LLM
 *
 * @requires LlmManager       - LLM 多 Provider 管理器
 * @requires MobaoConstants   - 常量（AI_LLM_SWITCH_STORAGE_KEY）
 * @requires MobaoSettings    - 游戏设置（GAME_SETTINGS）
 * @requires MobaoUtils       - 工具函数（多个）
 *
 * @exports window.MobaoSceneLlm
 * @exports createSceneLlmBridge, loadAiLlmPlayerSwitches, saveAiLlmPlayerSwitches
 */
const LLM_DECISION_SYSTEM_PROMPT = [
  "【身份与目标】",
  "你是仓库摸宝中的竞拍AI玩家。目标是在有限轮次内，以低于仓库真实总价值的成交价来盈利。",
  "",
  "【游戏机制】",
  "- 多轮盲拍：每轮所有玩家【独立提交出价】，不需要高于上一轮最高价！每轮结束后同时公开所有出价，最高者成为本轮领先者。",
  "- 出价规则：你可以出任意正整数（不超过钱包上限），无需考虑上一轮的最高价。这是盲拍，不是加价拍卖！",
  "- 提前获胜（非最终轮）：公布出价时，若 第一名出价 > 第二名出价 × directWinRatio，则第一名直接获得仓库。",
  "  例如：directWinRatio=1.2，第二名出价250000，则第一名需要出价 > 250000×1.2=300000 才能提前获胜。",
  "- 正常结束：最终轮出价最高者获得仓库。",
  "- 分红机制：若拍下者亏损，非拍下者各获得亏损额的15%作为分红（鼓励欺诈对手高价拍下）。",
  "- 门票机制：若拍下者盈利，非拍下者各被扣除盈利额的5%作为门票（鼓励积极竞拍）。",
  "- 策略权衡：分红机制意味你可以通过抬价让对手亏损来获利；门票机制意味不拍下而对手以低价格拍下盈利时你会被扣钱。",
  "",
  "【字段参考】",
  "- warehouseDefinition：藏品网格定义。藏品有品质、品类、尺寸和基础价格。",
  "- qualityPriceGuide（首轮）/ qualityPriceRangeTable（后续轮）：每个品质的价格区间与均值，估价优先参考均值再结合线索修正。",
  "- specialMechanismHint：高价值藏品可能单格高价或多格组合高价。",
  "- privateIntel：你的私有探查结果，结构为 aggregate + highValueTracks，用于估值和判断高价值目标。",
  "- otherPlayersPublic / bidHistory / publicEvents：公开信息，可用于判断对手行为。",
  "- roundPublicStateTable（后续轮）：多轮趋势表，列名已标注语义，请优先读取。",
  "- Previousbid：上一轮全场最高成交出价，用于判断本轮报价区间和提前获胜可能。首轮为 null。",
  "- currentLeader：上轮领先者，帮助判断本轮报价区间。",
  "- wallet：你的本局资金上限。钱包余额跨局继承，初始100万，每局结算后根据分红/门票机制更新。请合理规划资金，避免破产。",
  "- directWinRatio：提前获胜系数（固定常量，如1.2表示需要比第二名高出20%）。公式：你的出价 > 预估第二名出价 × directWinRatio。判定发生在本轮出价公开后，你需要预估本轮其他玩家的出价来判断是否可能触发。",
  "- catalogSummary：【图鉴 = 藏品库定义】列出所有【可能】出现在本局的藏品类型及其基础价格。这是【全局配置】，不是本局仓库的实际布局！本局仓库实际有哪些藏品、各有多少件，是未知的，需要通过探查来推断。",
  "- totalArtifacts：图鉴收录的藏品总种类数（全部可能出现的藏品有多少种），并非本局仓库实际拥有的藏品数量，实际数量每局未知可通过bottomCell来大致估计。",
  "- bottomCell：探查轮廓道具的结果——被探查藏品在仓库中纵坐标最大的单元格坐标（单个藏品即其最底部格）。",
  "",
  "【硬约束】",
  "- 禁止弃标",
  "- 同一轮最多选择一个技能或道具。",
  "- 两段式流程：initial 阶段可出价+选技能/道具；若执行了工具才进入 follow-up-after-tool 阶段，此时 skill=无、item=无，仅允许更新 bid/thought。",
  "- 禁止臆造：只基于输入数据推理，不得臆造未出现的藏品信息、他人私有情报或额外规则。",
  "- privateIntel 仅代表你个人可见，不可推断他人也知晓。",
  "- 每局仓库随机生成，上一局的仓库布局与线索不可直接当作本局事实。",
  "- 每局技能次数与道具库存已重置，仅策略经验可跨局复用，不可复用次数。",
  "- 出价不可超出钱包最大值",
  "- 若输出不合法或动作非法，系统可能忽略该部分决策并回退到规则AI结果。",
  "",
  "【策略建议】",
  "- 建议首轮更大胆出价，防止被对手低价拍下。",
  "- 私有线索不足时，优先参考跨局记忆中的历史结果与反思来判断出价策略。",
  "- 注意跨局记忆中的经验可复用，但每局仓库随机生成且技能/道具重置，不可机械套用上次出价。",
  "- 建议在每次出价后，根据对手出价和行动以及自身信息和公有信息加上历史结果综合判断，动态调整出价策略。",
  "- 无论如何，你要做一个有主见的玩家，永远有自己的底线和预期（当然你可以根据场上的信息变化调整自己的底线和预期）。",
  "- 有时并不是拍下来才是赢，也不是不拍就赢不了钱，目光长远，合理利用分红和注意门票",
  "- 欺诈是一种策略",
  "- 尝试提前获胜时，必须预估本轮第二名的出价，然后计算你需要出多少才能满足：你的出价 > 预估第二名出价 × directWinRatio。",
  "",
  "【输出格式】",
  "- 只返回 JSON 对象，仅包含 bid、skill、item、thought 四个字段。",
  "- 不要输出 markdown 代码块或额外解释文本。",
  "- bid 为正整数，会被系统做钱包/步长归一化校验。",
  '- skill/item 必须来自可用列表，否则填"无"。',
  "- thought 仅用于日志复盘，最长 200 字。"
].join("\n")

function safeParseJson(text) {
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

function tryExtractDecisionJson(rawText) {
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

export function createSceneLlmBridge(deps) {
  const {
    AI_LLM_SWITCH_STORAGE_KEY,
    LLM_SETTINGS,
    GAME_SETTINGS,
    SKILL_DEFS,
    ITEM_DEFS,
    maskApiKey,
    pickFirstDefined,
    compactOneLine,
    normalizeActionToken,
    isNoneActionText,
    compactPanelText,
    indentMultiline,
    formatBidRevealNumber
  } = deps

  function loadAiLlmPlayerSwitches(players) {
    const defaults = {}
      ; (players || []).forEach((player) => {
        if (!player.isHuman) {
          defaults[player.id] = true
        }
      })

    const raw = window.localStorage.getItem(AI_LLM_SWITCH_STORAGE_KEY)
    if (!raw) {
      return defaults
    }

    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object") {
        return defaults
      }

      const merged = { ...defaults }
      Object.keys(defaults).forEach((playerId) => {
        if (Object.prototype.hasOwnProperty.call(parsed, playerId)) {
          const rawValue = parsed[playerId]
          if (typeof rawValue === "boolean") {
            merged[playerId] = rawValue
          } else if (typeof rawValue === "string") {
            const normalized = rawValue.trim().toLowerCase()
            if (normalized === "true" || normalized === "1") {
              merged[playerId] = true
            } else if (normalized === "false" || normalized === "0") {
              merged[playerId] = false
            }
          } else if (typeof rawValue === "number") {
            merged[playerId] = rawValue !== 0
          }
        }
      })
      return merged
    } catch (_error) {
      return defaults
    }
  }

  function saveAiLlmPlayerSwitches(value) {
    if (!value || typeof value !== "object") {
      return
    }
    window.localStorage.setItem(AI_LLM_SWITCH_STORAGE_KEY, JSON.stringify(value))
  }

  function showAiErrorToast(playerName, errorSummary) {
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

  function parseLlmError(raw, code) {
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

  function setPlayerLlmError(scene, playerId, errorMessage, code, level) {
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

    let badge = row.querySelector(".llm-error-badge")
    if (!badge) {
      badge = document.createElement("span")
      badge.className = "llm-error-badge"
      row.appendChild(badge)
    }
    badge.textContent = parsed.brief
    badge.classList.toggle("warning", level === "warning")

    badge.onclick = (e) => {
      e.stopPropagation()
      const player = scene.players.find((p) => p.id === playerId)
      const pName = player ? player.name : playerId
      const errData = scene._aiLlmErrors[playerId]
      const time = errData ? new Date(errData.timestamp).toLocaleTimeString() : ""
      const content = `<p><strong>玩家：</strong>${pName}</p><p><strong>时间：</strong>${time}</p><p><strong>错误类型：</strong>${errData.brief}</p><p><strong>说明：</strong>${errData.detail}</p>`
      if (typeof scene.showPlayerInfoPopover === "function") {
        scene.showPlayerInfoPopover("AI报错信息", content, e.clientX, e.clientY)
      }
    }
  }

  function clearPlayerLlmErrors(scene) {
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

  const methods = {
    renderAiLogicPanelForLlm(telemetry) {
      const lines = []
      lines.push(`回合 ${telemetry.round} | 决策模式：混合（大模型+规则AI）`)
      lines.push("说明：大模型接管显示完整提示词与回复；规则AI显示信心拆解与估值。\n")
      lines.push("-")

      const rulePayload =
        this.aiEngine && typeof this.aiEngine.getLastDecisionLog === "function"
          ? this.aiEngine.getLastDecisionLog()
          : null
      const ruleEntryById = new Map(
        ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
      )

      const CONTROL_MODE_LABELS = {
        llm: "大模型正常决策",
        "llm-corrected": "大模型纠错后决策",
        "rule-fallback-after-llm-tool": "回退原因: LLM工具执行后的二次请求失败",
        "rule-fallback-after-correction": "回退原因: 纠错后执行失败",
        "rule-fallback-correction-skipped": "回退原因: 纠错跳过(已达最大次数或请求失败)",
        "rule-fallback-llm-failed": "回退原因: LLM请求失败",
        "rule-fallback-llm-invalid": "回退原因: LLM返回无效决策(无出价)"
      }

        ; (telemetry.entries || []).forEach((entry) => {
          const isLlm = entry.controlMode === "llm" || entry.controlMode === "llm-corrected"
          const isFallback = entry.controlMode && entry.controlMode.startsWith("rule-fallback")
          lines.push(`${entry.playerName}（${entry.playerId}）| 接管状态: ${isLlm ? "大模型" : "规则AI"}`)
          lines.push(`  最终出价: ${formatBidRevealNumber(entry.finalBid)} | 决策来源: ${entry.decisionSource}`)

          if (entry.controlMode) {
            const modeLabel = CONTROL_MODE_LABELS[entry.controlMode] || entry.controlMode
            if (isFallback) {
              lines.push(`  ⚠️ ${modeLabel}`)
            } else if (isLlm) {
              lines.push(`  接管模式: ${modeLabel}`)
            }
          }
          if (isLlm) {
            const cacheHit = entry.cacheHitTokens || 0
            const cacheMiss = entry.cacheMissTokens || 0
            const cacheRate = entry.cacheHitRate || 0
            lines.push(`  缓存命中: ${cacheHit} tokens | 未命中: ${cacheMiss} tokens | 命中率: ${cacheRate}%`)
            if (entry.correctionAttempt > 0) {
              lines.push(`  纠错次数: ${entry.correctionAttempt}/2`)
              if (entry.originalError) {
                lines.push(`  原始错误: ${entry.originalError}`)
              }
            }
            if (entry.historyMessagesCount > 0 || entry.crossGameMemoryCount > 0) {
              const gameInfo =
                entry.crossGameMemoryCount > 0
                  ? entry.inGameHistoryCount > 0
                    ? `${entry.crossGameMemoryCount}局跨局记忆+${entry.inGameHistoryCount}条本局历史`
                    : `${entry.crossGameMemoryCount}局跨局记忆`
                  : `${entry.inGameHistoryCount}条本局历史`
              lines.push(`  跨局记忆注入: ${gameInfo}`)
            }
            if (entry.llmActionName) {
              lines.push(`  大模型动作: ${entry.llmActionName}${entry.actionExecuted ? "（已执行）" : "（未执行）"}`)
            }
            if (entry.ruleActionName) {
              lines.push(`  规则动作: ${entry.ruleActionName}`)
            }
            if (entry.thought) {
              lines.push(`  思考: ${entry.thought}`)
            }
            if (entry.reasoningContent) {
              lines.push(`  思考过程:`)
              lines.push(indentMultiline(entry.reasoningContent, "    "))
            }
            if (entry.error) {
              lines.push(`  错误: ${entry.error}`)
            }
            if (entry.fallbackRuleBid !== null && entry.fallbackRuleBid !== undefined) {
              lines.push(`  回退规则出价参考: ${formatBidRevealNumber(entry.fallbackRuleBid)}`)
            }

            if (entry.systemPrompt) {
              lines.push("  [System Prompt]")
              lines.push(indentMultiline(entry.systemPrompt || "", "    "))
            }
            if (entry.crossGameMemoryText) {
              lines.push("  [Cross-game Memory]")
              lines.push(indentMultiline(entry.crossGameMemoryText || "", "    "))
            }
            lines.push("  [User Prompt]")
            lines.push(indentMultiline(entry.userPrompt || "", "    "))
            lines.push("  [Model Response]")
            lines.push(indentMultiline(entry.modelResponse || "", "    "))
            if (entry.toolResultSummary) {
              lines.push("  [Tool Result]")
              lines.push(indentMultiline(entry.toolResultSummary || "", "    "))
            }
            if (entry.errorCorrectionPrompt || entry.errorCorrectionResponse) {
              lines.push("  [Error Correction Prompt]")
              lines.push(indentMultiline(entry.errorCorrectionPrompt || "", "    "))
              lines.push("  [Error Correction Response]")
              lines.push(indentMultiline(entry.errorCorrectionResponse || "", "    "))
            }
            if (entry.followupPrompt || entry.followupResponse || entry.followupError) {
              lines.push("  [Follow-up Prompt]")
              lines.push(indentMultiline(entry.followupPrompt || "", "    "))
              lines.push("  [Follow-up Response]")
              lines.push(indentMultiline(entry.followupResponse || entry.followupError || "", "    "))
              if (entry.followupActionRejected) {
                lines.push("  [Follow-up Action Guard]")
                lines.push(indentMultiline(entry.followupActionRejected || "", "    "))
              }
            }
          } else {
            const ruleEntry = ruleEntryById.get(entry.playerId)
            if (ruleEntry) {
              const parts = ruleEntry.confidenceParts || {}
              const overheat = Math.round((ruleEntry.overheatRatio || 0) * 100)
              const threshold = Math.round((ruleEntry.overheatThreshold || 0) * 100)
              lines.push(
                `  信心 ${Math.round((ruleEntry.confidence || 0) * 100)}% | 人格 ${ruleEntry.archetype || "规则型"}`
              )
              lines.push(
                `  私有线索: 线索率 ${Math.round((ruleEntry.intelClueRate || 0) * 100)}% | 品质率 ${Math.round((ruleEntry.intelQualityRate || 0) * 100)}% | 不确定 ${(ruleEntry.intelUncertainty || 0).toFixed(2)} | 波动 ${(ruleEntry.intelSpreadRatio || 0).toFixed(2)}`
              )
              lines.push(
                `  估值: ${formatBidRevealNumber(ruleEntry.perceivedValue || 0)} | 上限 ${formatBidRevealNumber(ruleEntry.hardCap || 0)}`
              )
              lines.push(`  心理预期: ${formatBidRevealNumber(ruleEntry.psychExpectedBid || 0)}`)
              lines.push(
                `  信心拆解: 基础 ${(parts.base || 0).toFixed(2)} + 线索 ${(parts.clue || 0).toFixed(2)} + 品质 ${(parts.quality || 0).toFixed(2)} + 回合 ${(parts.progress || 0).toFixed(2)} + 盘口 ${(parts.market || 0).toFixed(2)} + 工具 ${(parts.tool || 0).toFixed(2)} + 边缘奖励 ${(parts.edgeBonus || 0).toFixed(2)} - 波动惩罚 ${(parts.spreadPenalty || 0).toFixed(2)} - 不确定惩罚 ${(parts.uncertaintyPenalty || 0).toFixed(2)} + 情绪 ${(parts.mood || 0).toFixed(2)}`
              )
              lines.push(`  超预期: ${overheat}% | 回撤阈值 ${threshold}%`)
              lines.push(
                `  工具影响: ${ruleEntry.toolTag || "无"} | 决策加分 ${(ruleEntry.toolScoreBoost || 0).toFixed(2)}`
              )
              lines.push(
                `  行为: ${ruleEntry.actionTag || "常规"}${ruleEntry.mistakeTag ? ` | 失误:${ruleEntry.mistakeTag}` : ""}${ruleEntry.diversifyTag ? ` | 去同质:${ruleEntry.diversifyTag}` : ""}`
              )
            } else {
              lines.push("  （无规则AI决策数据）")
            }
          }
          lines.push("-")
        })

      this.dom.aiLogicContent.textContent = lines.join("\n")

      const hasConversationMessages = this.aiConversationCache && Object.keys(this.aiConversationCache).length > 0
      if (this.dom.aiViewMessagesBtn) {
        if (hasConversationMessages) {
          this.dom.aiViewMessagesBtn.classList.remove("hidden")
        } else {
          this.dom.aiViewMessagesBtn.classList.add("hidden")
        }
      }
    },

    showAiConversationMessages() {
      if (!this.aiConversationCache || Object.keys(this.aiConversationCache).length === 0) {
        this.writeLog("当前无Messages数据。")
        return
      }

      const messages = this.aiConversationCache
      const lines = []
      lines.push("═══ 当前完整 Messages ═══")
      lines.push(`回合: ${this.round}`)
      lines.push("")

      Object.keys(messages)
        .sort()
        .forEach((playerId) => {
          const playerMessages = messages[playerId]
          if (!Array.isArray(playerMessages)) {
            return
          }
          lines.push(`──── ${playerId} ────`)
          lines.push(`消息数: ${playerMessages.length}`)
          lines.push("")
          playerMessages.forEach((msg, idx) => {
            const role = msg.role || "unknown"
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2)
            lines.push(`[${idx + 1}] role: ${role}`)
            lines.push("content:")
            content.split("\n").forEach((line) => lines.push(`  ${line}`))
            lines.push("")
          })
          lines.push("")
        })

      this.dom.aiLogicContent.textContent = lines.join("\n")
    },

    fillLlmSettingsForm(values) {
      const source = values || {}
      console.log("[fillLlmSettingsForm] source.independentModelEnabled:", source.independentModelEnabled)
      if (this.dom.settingLlmEnabled) {
        this.dom.settingLlmEnabled.checked = Boolean(source.enabled)
      }
      if (this.dom.settingLlmMultiGameMemoryEnabled) {
        this.dom.settingLlmMultiGameMemoryEnabled.checked = Boolean(source.multiGameMemoryEnabled)
      }
      if (this.dom.settingLlmReflectionEnabled) {
        this.dom.settingLlmReflectionEnabled.checked = Boolean(source.reflectionEnabled)
      }
      if (this.dom.settingLlmThinkingEnabled) {
        this.dom.settingLlmThinkingEnabled.checked = Boolean(source.thinkingEnabled)
      }
      const thinkingParamsInput = document.getElementById("setting-thinkingParams")
      if (thinkingParamsInput) {
        thinkingParamsInput.value = source.thinkingParams || ""
      }
      const thinkingModeParams = document.getElementById("thinkingModeParams")
      if (thinkingModeParams && this.dom.settingLlmThinkingEnabled) {
        if (this.dom.settingLlmThinkingEnabled.checked) {
          thinkingModeParams.classList.remove("hidden")
        } else {
          thinkingModeParams.classList.add("hidden")
        }
      }
      const independentModelCheckbox =
        this.dom.settingLlmIndependentModelEnabled || document.getElementById("setting-llmIndependentModelEnabled")
      console.log("[fillLlmSettingsForm] independentModelCheckbox:", independentModelCheckbox ? "found" : "not found")
      if (independentModelCheckbox) {
        independentModelCheckbox.checked = Boolean(source.independentModelEnabled)
        console.log(
          "[fillLlmSettingsForm] set independentModelCheckbox.checked to:",
          independentModelCheckbox.checked
        )
      }
      if (this.dom.independentModelConfig) {
        if (source.independentModelEnabled) {
          this.dom.independentModelConfig.classList.remove("hidden")
        } else {
          this.dom.independentModelConfig.classList.add("hidden")
        }
      }
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled")
      if (independentReflectionCheckbox) {
        independentReflectionCheckbox.checked =
          source.independentReflectionEnabled !== undefined ? Boolean(source.independentReflectionEnabled) : true
      }
      const apiKeyInput = this.dom.settingDeepseekApiKey || document.getElementById("setting-llmApiKey")
      if (apiKeyInput) {
        apiKeyInput.value = source.apiKey || ""
      }
      const modelInput = this.dom.settingDeepseekModel || document.getElementById("setting-llmModel")
      if (modelInput) {
        modelInput.value = source.model || ""
      }
      const endpointInput = document.getElementById("setting-llmEndpoint")
      if (endpointInput) {
        endpointInput.value = source.endpoint || ""
      }
      if (this.dom.settingMaxTokens) {
        this.dom.settingMaxTokens.value = Number(source.maxTokens) || 2048
      }

      if (!source.apiKey) {
        this.setLlmSettingsStatus("尚未填写 API Key。", "normal")
        return
      }
      this.setLlmSettingsStatus(`已读取本地密钥：${maskApiKey(source.apiKey)}`, "normal")
    },

    readLlmSettingsForm() {
      const currentSettings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      const apiKeyInput = this.dom.settingDeepseekApiKey || document.getElementById("setting-llmApiKey")
      const modelInput = this.dom.settingDeepseekModel || document.getElementById("setting-llmModel")
      const endpointInput = document.getElementById("setting-llmEndpoint")
      const independentModelCheckbox =
        this.dom.settingLlmIndependentModelEnabled || document.getElementById("setting-llmIndependentModelEnabled")
      console.log(
        "[readLlmSettingsForm] independentModelCheckbox:",
        independentModelCheckbox ? "found" : "not found",
        "checked:",
        independentModelCheckbox ? independentModelCheckbox.checked : "N/A"
      )
      const independentReflectionCheckbox = document.getElementById("setting-llmIndependentReflectionEnabled")

      return {
        enabled: this.dom.settingLlmEnabled ? this.dom.settingLlmEnabled.checked : currentSettings.enabled,
        multiGameMemoryEnabled: this.dom.settingLlmMultiGameMemoryEnabled
          ? this.dom.settingLlmMultiGameMemoryEnabled.checked
          : currentSettings.multiGameMemoryEnabled,
        reflectionEnabled: this.dom.settingLlmReflectionEnabled
          ? this.dom.settingLlmReflectionEnabled.checked
          : currentSettings.reflectionEnabled,
        thinkingEnabled: this.dom.settingLlmThinkingEnabled
          ? this.dom.settingLlmThinkingEnabled.checked
          : currentSettings.thinkingEnabled || false,
        thinkingParams: (function () {
          const el = document.getElementById("setting-thinkingParams")
          return el ? el.value.trim() : currentSettings.thinkingParams || ""
        })(),
        apiKey: apiKeyInput ? apiKeyInput.value : currentSettings.apiKey,
        model: modelInput ? modelInput.value : currentSettings.model,
        endpoint: endpointInput ? endpointInput.value || currentSettings.endpoint : currentSettings.endpoint,
        timeoutMs: currentSettings.timeoutMs,
        temperature: currentSettings.temperature,
        maxTokens: this.dom.settingMaxTokens
          ? Math.max(100, Number(this.dom.settingMaxTokens.value) || 2048)
          : currentSettings.maxTokens,
        independentModelEnabled: independentModelCheckbox
          ? independentModelCheckbox.checked
          : currentSettings.independentModelEnabled || false,
        independentReflectionEnabled: independentReflectionCheckbox
          ? independentReflectionCheckbox.checked
          : currentSettings.independentReflectionEnabled !== undefined
            ? currentSettings.independentReflectionEnabled
            : true
      }
    },

    setLlmSettingsStatus(text, state) {
      if (!this.dom.settingsLlmStatusText) {
        return
      }
      this.dom.settingsLlmStatusText.textContent = text
      this.dom.settingsLlmStatusText.classList.remove("is-success", "is-error", "is-pending")
      if (state === "success") {
        this.dom.settingsLlmStatusText.classList.add("is-success")
      } else if (state === "error") {
        this.dom.settingsLlmStatusText.classList.add("is-error")
      } else if (state === "pending") {
        this.dom.settingsLlmStatusText.classList.add("is-pending")
      }
    },

    async testDeepSeekConnectionFromOverlay() {
      if (this.deepSeekTesting) {
        return
      }

      const input = this.readLlmSettingsForm()
      const modelName = (input && input.model) || "大模型"
      if (!input.apiKey) {
        this.setLlmSettingsStatus("请先填写 API Key，再进行连接测试。", "error")
        this.writeLog(`${modelName}连接测试取消：未填写 API Key。`)
        return
      }

      this.deepSeekTesting = true
      if (this.dom.settingsTestDeepSeekBtn) {
        this.dom.settingsTestDeepSeekBtn.disabled = true
      }
      this.setLlmSettingsStatus(`正在连接 ${modelName}，请稍候...`, "pending")

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        if (!provider) {
          this.setLlmSettingsStatus("LLM Provider 未初始化", "error")
          return
        }
        const result = await provider.testConnection(input)
        if (result.ok) {
          this.setLlmSettingsStatus(`${modelName}连接成功${result.message ? `：${result.message}` : ""}`, "success")
          this.writeLog(`${modelName}连接成功，耗时 ${result.elapsedMs}ms。`)
        } else {
          this.setLlmSettingsStatus(`${modelName}连接失败：${result.error || "未知错误"}`, "error")
          this.writeLog(`${modelName}连接失败：${result.error || "未知错误"}`)
        }
      } catch (error) {
        const message = error && error.message ? error.message : "未知异常"
        this.setLlmSettingsStatus(`${modelName}连接异常：${message}`, "error")
        this.writeLog(`${modelName}连接异常：${message}`)
      } finally {
        this.deepSeekTesting = false
        if (this.dom.settingsTestDeepSeekBtn) {
          this.dom.settingsTestDeepSeekBtn.disabled = false
        }
      }
    },

    buildAiLlmRoundPayload(player) {
      const playerId = player.id
      const isInitialRound = this.round <= 1
      const compact = !isInitialRound
      const persona = this.aiEngine.personalityMap[playerId] || null
      const actionConstraint = this.buildAiActionConstraintBlock(playerId)
      const resource = this.getAiResourceSnapshot(playerId)

      const bidHistory = this.buildBidHistorySnapshot()
      const publicEvents = this.buildPublicEventSnapshot({ compact, viewerId: playerId })

      const charAssign = this.aiCharacterAssignments && this.aiCharacterAssignments[playerId]
      const characterInfo = charAssign
        ? {
          characterId: charAssign.characterId,
          characterName: charAssign.characterName,
          skillName: charAssign.skillName,
          passive: charAssign.passive ? charAssign.passive.label : null
        }
        : null

      const availableSkills = SKILL_DEFS.filter((entry) => Number(resource.skills[entry.id] || 0) > 0).map(
        (entry) => ({
          name: entry.name,
          description: entry.description,
          remaining: Number(resource.skills[entry.id] || 0),
          timing: "出价前",
          resultPublic: false
        })
      )

      const availableItems = ITEM_DEFS.filter((entry) => Number(resource.items[entry.id] || 0) > 0).map((entry) => ({
        name: entry.name,
        description: entry.description,
        remaining: Number(resource.items[entry.id] || 0),
        timing: "出价前",
        resultPublic: false
      }))

      return {
        gameState: {
          round: {
            current: this.round,
            total: GAME_SETTINGS.maxRounds
          },
          selfId: playerId,
          selfName: player.name,
          wallet: this.getAiWallet(playerId),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          folded: false,
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        selfRoleAndTools: {
          character: characterInfo,
          roleName: persona ? persona.archetype : "规则型",
          passive: persona
            ? `激进${persona.aggression.toFixed(2)} / 纪律${persona.discipline.toFixed(2)} / 跟风${persona.followRate.toFixed(2)}`
            : "默认规则人格",
          activeSkills: availableSkills,
          items: availableItems
        },
        otherPlayersPublic: this.buildOtherPlayersPublicInfo(playerId, { compact }),
        catalogSummary: this.buildCatalogSummary({ compact }),
        ...(compact
          ? { roundPublicStateTable: this.buildRoundPublicStateTable(playerId) }
          : { bidHistory, publicEvents }),
        privateIntel: this.buildAiPrivateIntelBlock(playerId),
        actionConstraints: {
          canBid: actionConstraint.canBid,
          canFold: actionConstraint.canFold,
          availableSkills: actionConstraint.availableSkills,
          availableItems: actionConstraint.availableItems,
          notes: actionConstraint.notes
        }
      }
    },

    buildAiIncrementalPayload(player) {
      const playerId = player.id
      const previousRound = this.round - 1
      const actionConstraint = this.buildAiActionConstraintBlock(playerId)
      const resource = this.getAiResourceSnapshot(playerId)

      const bidHistory = this.buildBidHistorySnapshot()
      const lastRoundBid = bidHistory.find((entry) => entry.round === previousRound)

      const availableSkills = SKILL_DEFS.filter((entry) => Number(resource.skills[entry.id] || 0) > 0).map(
        (entry) => ({
          name: entry.name,
          remaining: Number(resource.skills[entry.id] || 0)
        })
      )

      const availableItems = ITEM_DEFS.filter((entry) => Number(resource.items[entry.id] || 0) > 0).map((entry) => ({
        name: entry.name,
        remaining: Number(resource.items[entry.id] || 0)
      }))

      const lastRoundActions = {}
      this.players.forEach((p) => {
        if (p.id === playerId) return
        const usage = (this.playerUsageHistory[p.id] || []).find((entry) => entry.round === previousRound)
        if (usage && usage.actions && usage.actions.length > 0) {
          lastRoundActions[p.id] = {
            playerName: p.name,
            actions: usage.actions.map((actionId) => {
              const def = this.getActionDefById(actionId)
              return { type: def.type, name: def.name, description: def.description || "" }
            })
          }
        }
      })

      return {
        round: {
          current: this.round,
          previous: previousRound
        },
        lastRoundResult: {
          bids: lastRoundBid ? lastRoundBid.bids : {},
          winner: lastRoundBid ? lastRoundBid.winner : null,
          actions: lastRoundActions
        },
        currentWallet: this.getAiWallet(playerId),
        currentLeader: this.bidLeader,
        currentBid: this.currentBid,
        selfAvailableTools: {
          skills: availableSkills,
          items: availableItems
        },
        actionConstraints: {
          canBid: actionConstraint.canBid,
          canFold: actionConstraint.canFold,
          availableSkills: actionConstraint.availableSkills,
          availableItems: actionConstraint.availableItems
        },
        privateIntel: this.buildAiPrivateIntelBlock(playerId)
      }
    },

    buildAiFollowupRoundPayload(player, currentPlan, toolSummary) {
      const resolvedToolSummary = toolSummary || (currentPlan && currentPlan.toolResultSummary) || ""
      return {
        requestStage: "followup-after-tool",
        round: this.round,
        gameState: {
          selfId: player.id,
          selfName: player.name,
          wallet: this.getAiWallet(player.id),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        followupContext: {
          toolResultSummary: resolvedToolSummary,
          toolActionType: currentPlan && currentPlan.toolActionType ? currentPlan.toolActionType : "none",
          toolActionId: currentPlan && currentPlan.toolActionId ? currentPlan.toolActionId : "none",
          initialDecision: {
            bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
            actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
            actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none"
          }
        }
      }
    },

    canUseLlmDecision() {
      const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      if (!settings || !settings.enabled || !provider) {
        console.log(
          "[canUseLlmDecision] false: settings=",
          settings ? { enabled: settings.enabled } : "null",
          "provider=",
          provider ? provider.id : "null"
        )
        return false
      }
      const hasApiKey = typeof settings.apiKey === "string" && settings.apiKey.trim().length > 0
      if (hasApiKey) {
        return true
      }
      const endpoint = typeof settings.endpoint === "string" ? settings.endpoint.trim() : ""
      const isProxyEndpoint = endpoint.length > 0 && endpoint.startsWith("/")
      const isNative = !!(window.NativeBridge && window.NativeBridge.getServerUrl)
      if (isProxyEndpoint && !isNative) {
        return true
      }
      console.log(
        "[canUseLlmDecision] false: no apiKey and not proxy endpoint on desktop, endpoint:",
        endpoint,
        "isNative:",
        isNative
      )
      return false
    },

    isAiLlmEnabledForPlayer(playerId) {
      if (!this.aiLlmPlayerEnabled || typeof this.aiLlmPlayerEnabled !== "object") {
        console.log(`[isAiLlmEnabledForPlayer] ${playerId} false: aiLlmPlayerEnabled is null or not object`)
        return false
      }
      const enabled = Boolean(this.aiLlmPlayerEnabled[playerId])
      console.log(`[isAiLlmEnabledForPlayer] ${playerId} = ${enabled}, allEnabled:`, this.aiLlmPlayerEnabled)
      return enabled
    },

    canUseLlmDecisionForPlayer(playerId) {
      return this.canUseLlmDecision() && this.isAiLlmEnabledForPlayer(playerId)
    },

    getAiModelConfigForPlayer(playerId) {
      const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      console.log(
        "[getAiModelConfigForPlayer] playerId:",
        playerId,
        "settings.independentModelEnabled:",
        settings ? settings.independentModelEnabled : "no settings"
      )
      if (!settings || !settings.independentModelEnabled) {
        console.log("[getAiModelConfigForPlayer] independentModelEnabled is false, returning null")
        return null
      }
      const aiIndex = this.getAiIndexFromPlayerId(playerId)
      if (aiIndex < 0 || aiIndex > 2) {
        console.log("[getAiModelConfigForPlayer] invalid aiIndex:", aiIndex, "returning null")
        return null
      }
      if (typeof this.getAiModelConfig === "function") {
        const config = this.getAiModelConfig(aiIndex)
        console.log(
          "[getAiModelConfigForPlayer] got config for aiIndex",
          aiIndex,
          ":",
          config
            ? { apiKey: config.apiKey ? "(已设置)" : "(空)", endpoint: config.endpoint, model: config.model }
            : null
        )
        if (!config || !config.apiKey || !config.model) {
          console.log("[getAiModelConfigForPlayer] config is invalid (missing apiKey or model), returning null")
          return null
        }
        return config
      }
      console.log("[getAiModelConfigForPlayer] getAiModelConfig not available, returning null")
      return null
    },

    getAiIndexFromPlayerId(playerId) {
      if (typeof playerId !== "string") return -1
      const match = playerId.match(/^ai(\d+)$/i)
      if (match) {
        return parseInt(match[1], 10) - 1
      }
      return -1
    },

    buildAiDecisionUserPrompt(payload, extraBlocks = [], options = {}) {
      const requestStage = options.requestStage || "initial"
      const isFollowup = requestStage === "followup-after-tool"
      const isFirstRound = options.isFirstRound === true
      const roundNoRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.current,
        payload && payload.round,
        this.round
      )
      const totalRoundRaw = pickFirstDefined(
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total,
        GAME_SETTINGS.maxRounds
      )
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, this.round)
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
      const isFinalRound = roundNo >= totalRounds
      const roundStateText = isFinalRound ? "最终轮" : "后续轮"
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"

      let base
      if (isFollowup) {
        base = [
          "【任务】第 " + roundNo + "/" + totalRounds + " 轮 follow-up。根据工具结果修正最终出价。",
          finalRoundHint,
          "【硬约束】skill=无, item=无，只允许更新 bid/thought。"
        ]
      } else if (isFirstRound) {
        base = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint,
          "【当前状态数据】",
          JSON.stringify(payload)
        ]
      } else {
        base = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint,
          "【上一轮结算信息】",
          JSON.stringify(payload)
        ]
      }

      if (Array.isArray(extraBlocks) && extraBlocks.length > 0) {
        base.push("")
        base.push("补充信息（优先参考）：")
        extraBlocks.forEach((block, index) => {
          base.push("- 补充" + (index + 1) + ": " + String(block || ""))
        })
      }

      return base.join("\n")
    },

    buildAiDecisionMessages(payload, options = {}) {
      const requestStage = options.requestStage || "initial"
      const isFollowup = requestStage === "followup-after-tool"
      const isFirstRound = options.isFirstRound === true
      const systemPrompt = options.systemPrompt || ""
      const historyMessages = options.historyMessages || []
      const extraBlocks = options.extraBlocks || []

      const messages = [{ role: "system", content: systemPrompt }]

      if (payload && payload.catalogSummary) {
        messages.push({
          role: "user",
          content: "【图鉴摘要】\n" + JSON.stringify(payload.catalogSummary, null, 2)
        })
      }

      if (payload && payload.selfRoleAndTools) {
        messages.push({
          role: "user",
          content: "【角色与工具】\n" + JSON.stringify(payload.selfRoleAndTools, null, 2)
        })
      }

      if (payload && payload.otherPlayersPublic) {
        messages.push({
          role: "user",
          content: "【其他玩家公开信息】\n" + JSON.stringify(payload.otherPlayersPublic, null, 2)
        })
      }

      if (Array.isArray(historyMessages) && historyMessages.length > 0) {
        historyMessages.forEach((m) => {
          messages.push({ role: m.role || "user", content: m.content || "" })
        })
      }

      if (payload && payload.gameState) {
        messages.push({
          role: "user",
          content: "【游戏状态】\n" + JSON.stringify(payload.gameState, null, 2)
        })
      }

      if (payload && payload.privateIntel) {
        messages.push({
          role: "user",
          content: "【私人情报】\n" + JSON.stringify(payload.privateIntel, null, 2)
        })
      }

      if (payload && payload.actionConstraints) {
        messages.push({
          role: "user",
          content: "【行动约束】\n" + JSON.stringify(payload.actionConstraints, null, 2)
        })
      }

      if (payload && payload.bidHistory) {
        messages.push({
          role: "user",
          content: "【出价历史】\n" + JSON.stringify(payload.bidHistory, null, 2)
        })
      }

      if (payload && payload.publicEvents && payload.publicEvents.length > 0) {
        const compactEvents = payload.publicEvents.map((evt) => {
          if (evt.actionType === "public-event") {
            return `${evt.stage}: ${evt.publicResult || evt.effectText || ""}`
          }
          return `${evt.stage}: ${evt.playerName}使用${evt.actionName}`
        })
        messages.push({
          role: "user",
          content: "【公共事件】\n" + compactEvents.join("")
        })
      }

      if (payload && payload.roundPublicStateTable) {
        messages.push({
          role: "user",
          content: "【轮次公开状态】\n" + JSON.stringify(payload.roundPublicStateTable, null, 2)
        })
      }

      if (payload && payload.lastRoundResult) {
        messages.push({
          role: "user",
          content: "【上一轮结算】\n" + JSON.stringify(payload.lastRoundResult, null, 2)
        })
      }

      if (payload && payload.round) {
        messages.push({
          role: "user",
          content: "【轮次信息】\n" + JSON.stringify(payload.round, null, 2)
        })
      }

      if (payload && payload.selfAvailableTools) {
        messages.push({
          role: "user",
          content: "【可用工具】\n" + JSON.stringify(payload.selfAvailableTools, null, 2)
        })
      }

      const roundNoRaw =
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.current
          ? payload.gameState.round.current
          : payload && payload.round && payload.round.current
            ? payload.round.current
            : this.round
      const totalRoundRaw =
        payload && payload.gameState && payload.gameState.round && payload.gameState.round.total
          ? payload.gameState.round.total
          : GAME_SETTINGS.maxRounds
      const roundNo = Number.isFinite(Number(roundNoRaw))
        ? Math.max(1, Math.round(Number(roundNoRaw)))
        : Math.max(1, this.round)
      const totalRounds = Number.isFinite(Number(totalRoundRaw))
        ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
        : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
      const isFinalRound = roundNo >= totalRounds
      const roundStateText = isFinalRound ? "最终轮" : "后续轮"
      const finalRoundHint = isFinalRound
        ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
        : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"

      let taskContent
      if (isFollowup) {
        taskContent = [
          "【任务】第 " + roundNo + "/" + totalRounds + " 轮 follow-up。根据工具结果修正最终出价。",
          finalRoundHint,
          "【硬约束】skill=无, item=无，只允许更新 bid/thought。"
        ].join("\n")
      } else {
        taskContent = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint
        ].join("\n")
      }
      messages.push({ role: "user", content: taskContent })

      if (payload && payload.followupContext) {
        messages.push({
          role: "user",
          content: "【工具调用上下文】\n" + JSON.stringify(payload.followupContext, null, 2)
        })
      }

      if (Array.isArray(extraBlocks) && extraBlocks.length > 0) {
        extraBlocks.forEach((block) => {
          messages.push({
            role: "user",
            content: String(block || "")
          })
        })
      }

      return messages
    },

    extractAiDecisionObject(content) {
      const jsonObj = tryExtractDecisionJson(content)
      if (jsonObj) {
        return jsonObj
      }

      const text = String(content || "")
      const bidMatch = text.match(/(?:bid|出价|报价)\s*[:：]\s*(-?\d+)/i)
      const skillMatch = text.match(/(?:skill|使用技能)\s*[:：]\s*([^\n\r]+)/i)
      const itemMatch = text.match(/(?:item|使用道具)\s*[:：]\s*([^\n\r]+)/i)
      const thoughtMatch = text.match(/(?:thought|思考过程)\s*[:：]\s*([\s\S]{1,200})/i)

      return {
        bid: bidMatch ? Number(bidMatch[1]) : 0,
        skill: skillMatch ? skillMatch[1].trim() : "无",
        item: itemMatch ? itemMatch[1].trim() : "无",
        thought: thoughtMatch ? thoughtMatch[1].trim() : ""
      }
    },

    resolveActionPick(rawText, type, availableIds) {
      const text = String(rawText || "").trim()
      if (!text) {
        return { actionId: null, target: "" }
      }

      const [namePartRaw, targetRaw] = text.split(/[:：]/, 2)
      const namePart = String(namePartRaw || "").trim()
      const target = String(targetRaw || "").trim()

      if (isNoneActionText(namePart)) {
        return { actionId: null, target }
      }

      const normalized = normalizeActionToken(namePart)
      for (const actionId of availableIds) {
        const def = this.getActionDefById(actionId)
        const aliases = [actionId, def.name, this.getItemInfo(actionId).label]
          .filter(Boolean)
          .map((entry) => normalizeActionToken(entry))

        const matched = aliases.some((alias) => {
          return alias === normalized || alias.includes(normalized) || normalized.includes(alias)
        })

        if (matched) {
          return { actionId, target }
        }
      }

      return { actionId: null, target }
    },

    normalizeAiLlmPlan(playerId, decision, rawContent, options = {}) {
      const bidRaw = pickFirstDefined(decision && decision.bid, decision && decision.出价, decision && decision.报价)
      const skillRaw = pickFirstDefined(
        decision && decision.skill,
        decision && decision.使用技能,
        decision && decision.skillName
      )
      const itemRaw = pickFirstDefined(
        decision && decision.item,
        decision && decision.使用道具,
        decision && decision.itemName
      )
      const thoughtRaw = pickFirstDefined(
        decision && decision.thought,
        decision && decision.思考过程,
        decision && decision.reason
      )

      const actionState = this.getAiAvailableActionState(playerId)
      const allowAction = options.allowAction !== false
      const bidParsed = Number(bidRaw)
      const hasBidDecision = Number.isFinite(bidParsed)
      let bid = hasBidDecision ? Math.round(bidParsed) : 0
      if (hasBidDecision) {
        const wallet = this.getAiWallet(playerId)
        bid = this.normalizeAiBidValue(playerId, bid, wallet)
      }

      const skillPick = allowAction
        ? this.resolveActionPick(skillRaw, "skill", actionState.availableSkillIds)
        : { actionId: null, target: "" }
      const itemPick = allowAction
        ? this.resolveActionPick(itemRaw, "item", actionState.availableItemIds)
        : { actionId: null, target: "" }

      let actionType = "none"
      let actionId = "none"
      let target = ""
      if (skillPick.actionId) {
        actionType = "skill"
        actionId = skillPick.actionId
        target = skillPick.target || ""
      } else if (itemPick.actionId) {
        actionType = "item"
        actionId = itemPick.actionId
        target = itemPick.target || ""
      }

      console.log(
        `[normalizeAiLlmPlan] ${playerId} decision:`,
        decision
          ? { bid: bidRaw, skill: skillRaw, item: itemRaw, hasBidDecision, normalizedBid: bid, actionType, actionId }
          : "null/empty"
      )

      return {
        source: "llm",
        bid,
        folded: false,
        hasBidDecision,
        actionType,
        actionId,
        target,
        thought: String(thoughtRaw || "").trim(),
        rawSkill: String(skillRaw || ""),
        rawItem: String(itemRaw || ""),
        rawContent: String(rawContent || "")
      }
    },

    async requestAiLlmPlan(player, options = {}) {
      const requestStartTime = Date.now()
      const batchId = options.batchId || "solo"
      const batchStartTime = options.batchStartTime || requestStartTime
      const requestId = `${player.id}-${requestStartTime}`
      console.log(
        `[requestAiLlmPlan] ${requestId} START, player: ${player.id}, batchId: ${batchId}, delay from batch start: ${requestStartTime - batchStartTime}ms`
      )

      const requestStage = options.requestStage || "initial"
      const isFirstRound = requestStage === "initial" && Number(this.round) === 1

      let payload
      if (options.requestStage === "followup-after-tool") {
        payload = this.buildAiFollowupRoundPayload(
          player,
          options.followupContext || {},
          options.followupToolSummary || ""
        )
      } else if (isFirstRound) {
        payload = this.buildAiLlmRoundPayload(player)
      } else {
        payload = this.buildAiIncrementalPayload(player)
      }

      const firstRoundBlocks =
        isFirstRound && typeof this.getAiFirstRoundExtraBlocks === "function" ? this.getAiFirstRoundExtraBlocks() : []
      const mergedExtraBlocks = [
        ...(Array.isArray(firstRoundBlocks) ? firstRoundBlocks : []),
        ...(options.extraBlocks || [])
      ]

      const userPrompt = this.buildAiDecisionUserPrompt(payload, mergedExtraBlocks, {
        requestStage,
        isFirstRound
      })
      const systemPrompt = LLM_DECISION_SYSTEM_PROMPT
      const useMultiGameMemory =
        typeof this.isAiMultiGameMemoryEnabled === "function" ? this.isAiMultiGameMemoryEnabled() : false
      const historyMessages =
        useMultiGameMemory && typeof this.getAiConversationMessages === "function"
          ? this.getAiConversationMessages(player.id)
          : []
      let crossGameMemoryCount = 0
      let inGameHistoryCount = 0
      if (useMultiGameMemory) {
        if (typeof this.getAiCrossGameMemoryCount === "function") {
          crossGameMemoryCount = this.getAiCrossGameMemoryCount(player.id)
        }
        if (typeof this.getAiInGameHistoryCount === "function") {
          inGameHistoryCount = this.getAiInGameHistoryCount(player.id)
        }
      }
      // 对话缓存：首轮发 system+history，后续轮只追加 user
      if (!this.aiConversationCache) {
        this.aiConversationCache = {}
      }
      const isNewGame = requestStage === "initial" && Number(this.round) === 1
      if (isNewGame) {
        this.aiConversationCache[player.id] = null
      }
      const playerCache = this.aiConversationCache[player.id]
      let messages
      if (playerCache) {
        const incrementalMessages = []
        if (payload && payload.lastRoundResult) {
          incrementalMessages.push({
            role: "user",
            content: "【上一轮结算】\n" + JSON.stringify(payload.lastRoundResult, null, 2)
          })
        }
        if (payload && payload.round) {
          incrementalMessages.push({
            role: "user",
            content: "【轮次信息】\n" + JSON.stringify(payload.round, null, 2)
          })
        }
        const gameState =
          payload && payload.gameState
            ? payload.gameState
            : {
              currentWallet: payload && payload.currentWallet,
              currentLeader: payload && payload.currentLeader,
              currentBid: payload && payload.currentBid
            }
        if (
          gameState &&
          (gameState.currentWallet !== undefined ||
            gameState.currentLeader !== undefined ||
            gameState.currentBid !== undefined)
        ) {
          incrementalMessages.push({
            role: "user",
            content: "【游戏状态】\n" + JSON.stringify(gameState, null, 2)
          })
        }
        if (payload && payload.selfAvailableTools) {
          incrementalMessages.push({
            role: "user",
            content: "【可用工具】\n" + JSON.stringify(payload.selfAvailableTools, null, 2)
          })
        }
        if (payload && payload.privateIntel) {
          incrementalMessages.push({
            role: "user",
            content: "【私人情报】\n" + JSON.stringify(payload.privateIntel, null, 2)
          })
        }
        if (payload && payload.actionConstraints) {
          incrementalMessages.push({
            role: "user",
            content: "【行动约束】\n" + JSON.stringify(payload.actionConstraints, null, 2)
          })
        }
        const roundNoRaw =
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.current
            ? payload.gameState.round.current
            : payload && payload.round && payload.round.current
              ? payload.round.current
              : this.round
        const totalRoundRaw =
          payload && payload.gameState && payload.gameState.round && payload.gameState.round.total
            ? payload.gameState.round.total
            : GAME_SETTINGS.maxRounds
        const roundNo = Number.isFinite(Number(roundNoRaw))
          ? Math.max(1, Math.round(Number(roundNoRaw)))
          : Math.max(1, this.round)
        const totalRounds = Number.isFinite(Number(totalRoundRaw))
          ? Math.max(roundNo, Math.round(Number(totalRoundRaw)))
          : Math.max(roundNo, Number(GAME_SETTINGS.maxRounds) || roundNo)
        const isFinalRound = roundNo >= totalRounds
        const roundStateText = isFinalRound ? "最终轮" : "后续轮"
        const finalRoundHint = isFinalRound
          ? "【最终轮提醒】本轮直接按最高出价者获胜，不再看相对第二名高出比例。"
          : "【非最终轮提醒】本轮仍可能触发提前获胜（由 directWinRatio 判定）。"
        const taskContent = [
          "【任务】第 " +
          roundNo +
          "/" +
          totalRounds +
          " 轮（" +
          roundStateText +
          "）。给出合法竞拍决策（bid/skill/item/thought）。",
          finalRoundHint
        ].join("\n")
        incrementalMessages.push({ role: "user", content: taskContent })
        if (Array.isArray(options.extraBlocks) && options.extraBlocks.length > 0) {
          options.extraBlocks.forEach((block) => {
            incrementalMessages.push({
              role: "user",
              content: String(block || "")
            })
          })
        }
        messages = [...playerCache, ...incrementalMessages]
      } else {
        messages = this.buildAiDecisionMessages(payload, {
          requestStage,
          isFirstRound,
          systemPrompt,
          historyMessages,
          extraBlocks: options.extraBlocks || []
        })
      }

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        console.log("[requestAiLlmPlan] provider:", provider ? provider.id : null)
        if (!provider) {
          console.log("[requestAiLlmPlan] ERROR: provider is null")
          return {
            source: "llm",
            failed: true,
            error: "LLM Provider 未初始化",
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: ""
          }
        }
        let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
        console.log("[requestAiLlmPlan] base settings:", {
          enabled: settings.enabled,
          apiKey: settings.apiKey ? "(已设置)" : "(空)",
          endpoint: settings.endpoint,
          model: settings.model
        })
        console.log("[requestAiLlmPlan] about to call getAiModelConfigForPlayer, player.id:", player.id)
        try {
          const aiModelConfig = this.getAiModelConfigForPlayer(player.id)
          console.log(
            "[requestAiLlmPlan] aiModelConfig:",
            aiModelConfig
              ? {
                apiKey: aiModelConfig.apiKey ? "(已设置)" : "(空)",
                endpoint: aiModelConfig.endpoint,
                model: aiModelConfig.model
              }
              : null
          )
          if (aiModelConfig) {
            settings = {
              ...settings,
              apiKey: aiModelConfig.apiKey || settings.apiKey,
              endpoint: aiModelConfig.endpoint || settings.endpoint,
              model: aiModelConfig.model || settings.model,
              maxTokens: aiModelConfig.maxTokens || settings.maxTokens,
              timeoutMs: aiModelConfig.timeoutMs || settings.timeoutMs,
              thinkingEnabled:
                aiModelConfig.thinkingEnabled !== undefined ? aiModelConfig.thinkingEnabled : settings.thinkingEnabled
            }
            console.log("[requestAiLlmPlan] merged settings:", {
              apiKey: settings.apiKey ? "(已设置)" : "(空)",
              endpoint: settings.endpoint,
              model: settings.model
            })
          }
        } catch (e) {
          console.error("[requestAiLlmPlan] getAiModelConfigForPlayer error:", e)
        }
        const requestTimeoutMs = Math.max(3000, Math.round((Number(GAME_SETTINGS.roundSeconds) || 40) * 1000))
        const isNativeEnv = !!(window.NativeBridge && window.NativeBridge.llmProxyAsync)
        const isFlashModel = /deepseek.*flash|qwen.*turbo|glm.*flash|gpt-3\.5|gpt-4o-mini/i.test(settings.model || "")
        let baseTokens = Number(settings.maxTokens) || 600
        if (isNativeEnv && isFlashModel && baseTokens < 1500) {
          baseTokens = 1500
        }
        const requestMaxTokens = Math.max(300, baseTokens)
        const chatStartTime = Date.now()
        console.log(
          `[requestAiLlmPlan] ${requestId} CALLING requestChat, model: ${settings.model}, elapsed so far: ${chatStartTime - requestStartTime}ms`
        )
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: requestMaxTokens,
          timeoutMs: requestTimeoutMs,
          messages,
          settings,
          isThinking: settings.thinkingEnabled || false,
          _playerId: player.id,
          _playerName: player.name
        })
        const chatEndTime = Date.now()
        const chatElapsed = chatEndTime - chatStartTime
        console.log(
          `[requestAiLlmPlan] ${requestId} requestChat DONE, ok: ${result.ok}, elapsed: ${chatElapsed}ms, total: ${chatEndTime - requestStartTime}ms`
        )

        const usage = result && result.usage ? result.usage : null
        const cacheHitTokens = usage && usage.prompt_cache_hit_tokens ? usage.prompt_cache_hit_tokens : 0
        const cacheMissTokens = usage && usage.prompt_cache_miss_tokens ? usage.prompt_cache_miss_tokens : 0
        const totalPromptTokens = cacheHitTokens + cacheMissTokens
        const cacheHitRate = totalPromptTokens > 0 ? Math.round((cacheHitTokens / totalPromptTokens) * 100) : 0
        if (cacheHitTokens > 0 || cacheMissTokens > 0) {
          console.log(
            `[requestAiLlmPlan] ${requestId} cache: hit=${cacheHitTokens}, miss=${cacheMissTokens}, rate=${cacheHitRate}%`
          )
        }

        if (!result.ok) {
          const detail = result && result.meta ? result.meta : {}
          const errorPieces = [
            result.error || "请求失败",
            result.code ? `code=${result.code}` : "",
            result.stage ? `stage=${result.stage}` : "",
            detail.endpoint ? `endpoint=${detail.endpoint}` : "",
            detail.model ? `model=${detail.model}` : "",
            detail.timeoutMs ? `timeout=${detail.timeoutMs}ms` : "",
            result.requestId ? `req=${result.requestId}` : "",
            detail.hint ? `hint=${detail.hint}` : ""
          ].filter(Boolean)
          const errorMessage = errorPieces.join(" | ")
          if (requestStage === "initial") {
            this.aiConversationCache[player.id] = [
              ...messages,
              { role: "assistant", content: `[LLM请求失败] ${errorMessage}` }
            ]
          }
          setPlayerLlmError(this, player.id, errorMessage, result.code)
          showAiErrorToast(player.name, parseLlmError(errorMessage, result.code).brief)
          return {
            source: "llm",
            failed: true,
            error: errorMessage,
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: String(result.error || ""),
            cacheHitTokens: 0,
            cacheMissTokens: 0,
            cacheHitRate: 0,
            usage: null
          }
        }

        const responseText = String(result.content || "")
        const reasoningContent = String(result.reasoningContent || "")
        const rawFinish =
          result.raw && result.raw.choices && result.raw.choices[0] ? result.raw.choices[0].finish_reason : ""
        if (!responseText.trim() && !reasoningContent.trim()) {
          const isEmpty =
            rawFinish === "length"
              ? "模型输出被截断，未生成有效内容。请增大最大输出Token数。"
              : "模型返回为空，未生成有效内容。请检查模型配置和Token限制。"
          setPlayerLlmError(this, player.id, isEmpty, "EMPTY_RESPONSE")
          showAiErrorToast(player.name, parseLlmError(isEmpty, "EMPTY_RESPONSE").brief)
          return {
            source: "llm",
            failed: true,
            error: isEmpty,
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: "",
            cacheHitTokens: 0,
            cacheMissTokens: 0,
            cacheHitRate: 0,
            usage: null
          }
        }
        if (!responseText.trim() && reasoningContent.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出Token不足，请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出Token不足，已尝试从思维链提取决策。`)
        }
        let decision = this.extractAiDecisionObject(responseText)
        const hasValidBid = decision && Number.isFinite(Number(decision.bid)) && Number(decision.bid) > 0
        const hasValidAction =
          (decision &&
            decision.skill &&
            String(decision.skill).trim() !== "无" &&
            String(decision.skill).trim() !== "") ||
          (decision && decision.item && String(decision.item).trim() !== "无" && String(decision.item).trim() !== "")
        if (!hasValidBid && !hasValidAction && reasoningContent) {
          const fallbackDecision = this.extractAiDecisionObject(reasoningContent)
          if (fallbackDecision && Number.isFinite(Number(fallbackDecision.bid)) && Number(fallbackDecision.bid) > 0) {
            decision = fallbackDecision
            if (typeof this.writeLog === "function") {
              this.writeLog(`${player.name}：从思维链中提取到决策，出价${fallbackDecision.bid}`)
            }
          }
        }
        const plan = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: options.allowAction !== false
        })
        if (rawFinish === "length" && responseText.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出被截断，请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出被截断，决策可能不完整。`)
        }
        if (useMultiGameMemory && requestStage === "initial" && typeof this.pushAiRoundSummary === "function") {
          this.pushAiRoundSummary(player.id, plan)
        }
        plan.elapsedMs = result.elapsedMs
        plan.model = result.model || ""
        plan.configuredModel = settings.model || ""
        plan.systemPrompt = playerCache ? "" : systemPrompt
        plan.userPrompt = userPrompt
        plan.modelResponse = responseText
        plan.reasoningContent = reasoningContent
        plan.requestStage = requestStage
        plan.historyMessagesCount = historyMessages.length
        plan.crossGameMemoryCount = crossGameMemoryCount
        plan.inGameHistoryCount = inGameHistoryCount
        plan.historyMessagesPreview = historyMessages.map((m) => String(m.content || "").slice(0, 80)).join(" | ")
        plan.crossGameMemoryText =
          !playerCache && useMultiGameMemory && crossGameMemoryCount > 0
            ? String(historyMessages[0]?.content || "")
            : ""
        plan.cacheHitTokens = cacheHitTokens
        plan.cacheMissTokens = cacheMissTokens
        plan.cacheHitRate = cacheHitRate
        plan.usage = usage

        // 模型名不一致警告
        if (
          plan.model &&
          plan.configuredModel &&
          plan.configuredModel.toLowerCase() !== "auto" &&
          plan.model !== plan.configuredModel
        ) {
          setPlayerLlmError(
            this,
            player.id,
            `模型不一致：请求"${plan.configuredModel}"，实际"${plan.model}"。服务端可能已替换模型。`,
            "MODEL_MISMATCH",
            "warning"
          )
          this.writeLog(`${player.name}：模型不一致，请求=${plan.configuredModel} 实际=${plan.model}`)
        }

        // 缓存本轮对话（仅 initial 阶段），跨局记忆仅首轮注入，不进入缓存
        if (requestStage === "initial") {
          this.aiConversationCache[player.id] = [...messages, { role: "assistant", content: responseText }]
        }
        return plan
      } catch (error) {
        const message = error && error.message ? error.message : "LLM请求异常"
        if (requestStage === "initial") {
          this.aiConversationCache[player.id] = [
            ...messages,
            { role: "assistant", content: `[LLM请求异常] ${message}` }
          ]
        }
        setPlayerLlmError(this, player.id, message, "EXCEPTION")
        showAiErrorToast(player.name, parseLlmError(message, "EXCEPTION").brief)
        return {
          source: "llm",
          failed: true,
          error: message,
          actionType: "none",
          actionId: "none",
          systemPrompt,
          userPrompt,
          modelResponse: "",
          cacheHitTokens: 0,
          cacheMissTokens: 0,
          cacheHitRate: 0,
          usage: null
        }
      }
    },

    buildAiToolResultSummary(result, actionType, actionId) {
      const info = this.getItemInfo(actionId)
      const stats = result && result.signalStats && result.signalStats.aggregate ? result.signalStats.aggregate : null
      const parts = []
      parts.push(`action=${actionType}:${actionId}`)
      parts.push(`name=${info.label}`)
      parts.push(`ok=${Boolean(result && result.ok)}`)
      parts.push(`revealed=${Number(result && result.revealed) || 0}`)

      if (result && Array.isArray(result.signals) && result.signals.length > 0) {
        const revealDetails = []
        const itemIdSet = new Set()
        result.signals.forEach((signal) => {
          if (!signal || !signal.itemId) return
          if (itemIdSet.has(signal.itemId)) return
          itemIdSet.add(signal.itemId)

          const item = this.items.find((i) => i.id === signal.itemId)
          if (!item) return

          const detailParts = []
          if (signal.mode === "outline") {
            detailParts.push(`轮廓:${signal.sizeTag || "?"}格`)
            detailParts.push(`品类:${signal.category || "?"}`)
          }
          if (signal.mode === "quality") {
            const qualityConfig = (window.ArtifactData && window.ArtifactData.QUALITY_CONFIG) || {}
            const qualityLabel = qualityConfig[signal.qualityKey]?.label || signal.qualityKey || "?"
            detailParts.push(`品质:${qualityLabel}`)
            detailParts.push(`基价:${item.basePrice || "?"}`)
          }
          if (signal.sampleCell) {
            detailParts.push(`位置:(${signal.sampleCell.x},${signal.sampleCell.y})`)
          }
          if (detailParts.length > 0) {
            revealDetails.push(detailParts.join(","))
          }
        })
        if (revealDetails.length > 0) {
          parts.push(`details=[${revealDetails.join("; ")}]`)
        }
      }

      if (stats && Number(stats.count) > 0) {
        parts.push(`mean=${Number(stats.mean).toFixed(2)}`)
      }
      if (result && result.message) {
        parts.push(`message=${compactOneLine(result.message, 120)}`)
      }
      if (result && Array.isArray(result.trackUpdates)) {
        const ids = result.trackUpdates.map((entry) => entry && entry.trackId).filter(Boolean)
        if (ids.length > 0) {
          parts.push(`tracks=${ids.join(",")}`)
        } else {
          parts.push("tracks=none")
        }
      }
      if (
        result &&
        result.bottomCell &&
        Number.isFinite(result.bottomCell.row) &&
        Number.isFinite(result.bottomCell.col)
      ) {
        parts.push(`bottomCell=r${result.bottomCell.row}c${result.bottomCell.col}`)
      }
      return parts.join(" | ")
    },

    async requestAiLlmFollowupBid(player, currentPlan, toolSummary) {
      const trackHint = String(toolSummary || "").includes("tracks=")
        ? "若 tracks=none，代表本次探查未直接命中高价值追踪目标，不要把它写成已确认。"
        : ""
      const followupBlock = `你刚执行的探查结果如下，请在保留合法动作约束下重新给出最终出价：${toolSummary}${trackHint ? ` | ${trackHint}` : ""}`
      const followupPlan = await this.requestAiLlmPlan(player, {
        requestStage: "followup-after-tool",
        allowAction: false,
        followupToolSummary: toolSummary,
        followupContext: {
          toolActionType:
            currentPlan && currentPlan.toolActionType
              ? currentPlan.toolActionType
              : currentPlan && currentPlan.actionType
                ? currentPlan.actionType
                : "none",
          toolActionId:
            currentPlan && currentPlan.toolActionId
              ? currentPlan.toolActionId
              : currentPlan && currentPlan.actionId
                ? currentPlan.actionId
                : "none",
          bid: currentPlan && Number.isFinite(Number(currentPlan.bid)) ? Number(currentPlan.bid) : 0,
          actionType: currentPlan && currentPlan.actionType ? currentPlan.actionType : "none",
          actionId: currentPlan && currentPlan.actionId ? currentPlan.actionId : "none",
          thought: currentPlan && currentPlan.thought ? currentPlan.thought : "",
          modelResponse: currentPlan && currentPlan.modelResponse ? currentPlan.modelResponse : ""
        },
        extraBlocks: [followupBlock]
      })

      if (followupPlan && (followupPlan.rawSkill || followupPlan.rawItem)) {
        const illegalSkill = !isNoneActionText(followupPlan.rawSkill || "") && followupPlan.rawSkill
        const illegalItem = !isNoneActionText(followupPlan.rawItem || "") && followupPlan.rawItem
        if (illegalSkill || illegalItem) {
          followupPlan.followupActionRejected = compactOneLine(
            `二次调用声明了额外动作，已按规则忽略：skill=${illegalSkill || "无"}, item=${illegalItem || "无"}`,
            160
          )
        }
      }

      return followupPlan
    },

    async requestAiLlmErrorCorrection(player, currentPlan, errorInfo, correctionHistory, previousMessages = []) {
      const correctionCount = correctionHistory ? correctionHistory.length : 0
      const maxCorrections = 2

      if (correctionCount >= maxCorrections) {
        return {
          source: "llm",
          failed: true,
          error: `已达最大纠错次数(${maxCorrections})，不再回调`,
          correctionSkipped: true,
          actionType: "none",
          actionId: "none"
        }
      }

      const errorDetail = errorInfo || "未知错误"
      const previousCorrections =
        correctionHistory && correctionHistory.length > 0
          ? correctionHistory
            .map((entry, idx) => `第${idx + 1}次纠错: ${entry.error} -> AI回复: ${entry.aiResponse || "无"}`)
            .join("\n")
          : ""

      const errorCorrectionBlock = [
        "【工具执行报错回调】",
        `你的上次决策执行失败，错误原因：${errorDetail}`,
        `当前纠错次数：${correctionCount + 1}/${maxCorrections}`,
        "",
        "【原始决策】",
        JSON.stringify(
          {
            bid: currentPlan && currentPlan.bid ? currentPlan.bid : 0,
            skill:
              currentPlan && currentPlan.actionType === "skill"
                ? currentPlan.rawSkill || currentPlan.actionId || "无"
                : "无",
            item:
              currentPlan && currentPlan.actionType === "item"
                ? currentPlan.rawItem || currentPlan.actionId || "无"
                : "无",
            thought: currentPlan && currentPlan.thought ? currentPlan.thought : ""
          },
          null,
          2
        ),
        "",
        "【硬约束】",
        "- skill/item 必须来自 availableSkills/availableItems 列表",
        '- 如果不确定可用选项，使用"无"',
        "- 只返回 JSON 对象，包含 bid、skill、item、thought 四个字段",
        "- thought 中说明你对错误的理解和修正策略"
      ]

      if (previousCorrections) {
        errorCorrectionBlock.push("", "【过往纠错记录】", previousCorrections)
      }

      const payload = {
        gameState: {
          round: {
            current: this.round,
            total: GAME_SETTINGS.maxRounds
          },
          selfId: player.id,
          selfName: player.name,
          wallet: this.getAiWallet(player.id),
          directWinRatio: Number((1 + GAME_SETTINGS.directTakeRatio).toFixed(2)),
          folded: false,
          Previousbid: this.round === 1 ? null : this.currentBid,
          currentLeader: this.bidLeader
        },
        selfRoleAndTools: {
          roleName: currentPlan && currentPlan.roleName ? currentPlan.roleName : "规则型",
          passive: currentPlan && currentPlan.passive ? currentPlan.passive : "默认规则人格",
          activeSkills: this.getAiResourceSnapshot(player.id).skills
            ? Object.entries(this.getAiResourceSnapshot(player.id).skills).map(([id, remain]) => {
              const def = this.getActionDefById(id)
              return {
                name: def ? def.name : id,
                description: def ? def.description : "",
                remaining: Number(remain) || 0
              }
            })
            : [],
          items: this.getAiResourceSnapshot(player.id).items
            ? Object.entries(this.getAiResourceSnapshot(player.id).items).map(([id, remain]) => {
              const def = this.getActionDefById(id)
              return {
                name: def ? def.name : id,
                description: def ? def.description : "",
                remaining: Number(remain) || 0
              }
            })
            : []
        },
        actionConstraints: this.buildAiActionConstraintBlock(player.id)
      }

      const userPrompt = this.buildAiDecisionUserPrompt(payload, errorCorrectionBlock)
      const systemPrompt = LLM_DECISION_SYSTEM_PROMPT

      const requestTimeoutMs = Math.max(3000, Math.round((Number(GAME_SETTINGS.roundSeconds) || 40) * 1000))
      const isNativeEnv = !!(window.NativeBridge && window.NativeBridge.llmProxyAsync)
      let settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
      const aiModelConfig = this.getAiModelConfigForPlayer(player.id)
      if (aiModelConfig) {
        settings = {
          ...settings,
          apiKey: aiModelConfig.apiKey || settings.apiKey,
          endpoint: aiModelConfig.endpoint || settings.endpoint,
          model: aiModelConfig.model || settings.model,
          maxTokens: aiModelConfig.maxTokens || settings.maxTokens,
          timeoutMs: aiModelConfig.timeoutMs || settings.timeoutMs,
          thinkingEnabled:
            aiModelConfig.thinkingEnabled !== undefined ? aiModelConfig.thinkingEnabled : settings.thinkingEnabled
        }
      }
      const isFlashModel = /deepseek.*flash|qwen.*turbo|glm.*flash|gpt-3\.5|gpt-4o-mini/i.test(settings.model || "")
      let baseTokens = Number(settings.maxTokens) || 600
      if (isNativeEnv && isFlashModel && baseTokens < 1500) {
        baseTokens = 1500
      }
      const requestMaxTokens = Math.max(300, baseTokens)

      const messages = [
        { role: "system", content: systemPrompt },
        ...(Array.isArray(previousMessages) ? previousMessages : []),
        { role: "user", content: userPrompt }
      ]

      try {
        const provider = typeof this.getLlmProvider === "function" ? this.getLlmProvider() : null
        if (!provider) {
          return {
            source: "llm",
            failed: true,
            error: "LLM Provider 未初始化",
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: ""
          }
        }
        const result = await provider.requestChat({
          temperature: 0.1,
          maxTokens: requestMaxTokens,
          timeoutMs: requestTimeoutMs,
          messages,
          settings,
          isThinking: settings.thinkingEnabled || false
        })

        if (!result.ok) {
          const detail = result && result.meta ? result.meta : {}
          const errorPieces = [
            result.error || "请求失败",
            result.code ? `code=${result.code}` : "",
            result.stage ? `stage=${result.stage}` : "",
            detail.endpoint ? `endpoint=${detail.endpoint}` : "",
            detail.model ? `model=${detail.model}` : "",
            detail.timeoutMs ? `timeout=${detail.timeoutMs}ms` : "",
            result.requestId ? `req=${result.requestId}` : "",
            detail.hint ? `hint=${detail.hint}` : ""
          ].filter(Boolean)
          return {
            source: "llm",
            failed: true,
            error: errorPieces.join(" | "),
            actionType: "none",
            actionId: "none",
            systemPrompt,
            userPrompt,
            modelResponse: String(result.error || ""),
            correctionAttempt: correctionCount + 1
          }
        }

        const responseText = String(result.content || "")
        const reasoningContent = String(result.reasoningContent || "")
        const rawFinish2 =
          result.raw && result.raw.choices && result.raw.choices[0] ? result.raw.choices[0].finish_reason : ""
        if (!responseText.trim() && !reasoningContent.trim()) {
          const isEmpty =
            rawFinish2 === "length"
              ? "模型输出被截断（纠错），未生成有效内容。请增大最大输出Token数。"
              : "模型返回为空（纠错），未生成有效内容。请检查模型配置和Token限制。"
          setPlayerLlmError(this, player.id, isEmpty, "EMPTY_RESPONSE")
          showAiErrorToast(player.name, parseLlmError(isEmpty, "EMPTY_RESPONSE").brief)
          return {
            source: "llm",
            failed: true,
            error: isEmpty,
            actionType: "none",
            actionId: "none",
            correctionSkipped: true,
            correctionAttempt: correctionCount + 1
          }
        }
        if (!responseText.trim() && reasoningContent.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出Token不足（纠错），请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出Token不足（纠错），已尝试从思维链提取。`)
        }
        let decision = this.extractAiDecisionObject(responseText)
        const hasValidBid = decision && Number.isFinite(Number(decision.bid)) && Number(decision.bid) > 0

        if (!hasValidBid && reasoningContent) {
          const fallbackDecision = this.extractAiDecisionObject(reasoningContent)
          if (fallbackDecision && Number.isFinite(Number(fallbackDecision.bid)) && Number(fallbackDecision.bid) > 0) {
            decision = fallbackDecision
            if (typeof this.writeLog === "function") {
              this.writeLog(`${player.name}：从思维链中提取到纠错决策，出价${fallbackDecision.bid}`)
            }
          }
        }

        const plan = this.normalizeAiLlmPlan(player.id, decision, responseText, {
          allowAction: true
        })
        if (rawFinish2 === "length" && responseText.trim()) {
          setPlayerLlmError(
            this,
            player.id,
            "输出被截断（纠错），请在设置中提高最大输出Token限制。",
            "EMPTY_RESPONSE",
            "warning"
          )
          this.writeLog(`${player.name}：输出被截断（纠错），决策可能不完整。`)
        }

        plan.elapsedMs = result.elapsedMs
        plan.systemPrompt = systemPrompt
        plan.userPrompt = userPrompt
        plan.modelResponse = responseText
        plan.reasoningContent = reasoningContent
        plan.requestStage = "error-correction"
        plan.correctionAttempt = correctionCount + 1
        plan.originalError = errorDetail

        return plan
      } catch (error) {
        const message = error && error.message ? error.message : "LLM请求异常"
        return {
          source: "llm",
          failed: true,
          error: message,
          actionType: "none",
          actionId: "none",
          systemPrompt,
          userPrompt,
          modelResponse: "",
          correctionAttempt: correctionCount + 1
        }
      }
    },

    async prepareAiLlmRoundPlans() {
      this.aiLlmRoundPlans = {}
      if (!this.canUseLlmDecision()) {
        return
      }

      const aiPlayers = this.players.filter((player) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player) => !this.canUseLlmDecisionForPlayer(player.id))
      if (activePlayers.length === 0) {
        this.writeLog("大模型总开关已开，但所有AI位开关均关闭，使用规则AI。")
        return
      }

      const batchStartTime = Date.now()
      const batchId = `batch-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} START, activePlayers: ${activePlayers.length}, players: ${activePlayers.map((p) => p.id).join(",")}`
      )

      const plans = await Promise.all(
        activePlayers.map((player) => this.requestAiLlmPlan(player, { batchId, batchStartTime }))
      )

      const batchEndTime = Date.now()
      const batchElapsed = batchEndTime - batchStartTime
      console.log(
        `[prepareAiLlmRoundPlans] ${batchId} END, total elapsed: ${batchElapsed}ms, avg per player: ${Math.round(batchElapsed / activePlayers.length)}ms`
      )

      const summary = []

      activePlayers.forEach((player, index) => {
        const plan = plans[index]
        if (!plan) {
          return
        }
        this.aiLlmRoundPlans[player.id] = plan

        if (plan.failed) {
          summary.push(`${player.name}:失败(${plan.error || "未知"})`)
          return
        }

        if (!plan.hasBidDecision) {
          summary.push(
            `${player.name}:出价无效(hasBidDecision=false), 模型回复预览:${(plan.modelResponse || "").slice(0, 120)}`
          )
          return
        }

        const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        let actualModel = ""
        activePlayers.forEach((player) => {
          const p = this.aiLlmRoundPlans[player.id]
          if (p && p.model && !actualModel) actualModel = p.model
        })
        const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
        const modelName = actualModel || (settings && settings.model) || "大模型"
        this.writeLog(`${modelName}决策：${summary.join("；")}`)
      }
    },

    async processAiDecisions() {
      console.log("[processAiDecisions] >>> ENTERED function")
      this.aiLlmRoundPlans = {}
      this.aiRoundEffects = {}
      this.lastAiIntelActions = []
      clearPlayerLlmErrors(this)

      if (!this.aiErrorCorrectionHistory) {
        this.aiErrorCorrectionHistory = {}
      }

      const aiPlayers = this.players.filter((player) => !player.isHuman)
      const activePlayers = aiPlayers.filter((player) => this.canUseLlmDecisionForPlayer(player.id))
      const disabledPlayers = aiPlayers.filter((player) => !this.canUseLlmDecisionForPlayer(player.id))

      console.log(
        "[processAiDecisions] aiPlayers:",
        aiPlayers.map((p) => p.id)
      )
      console.log(
        "[processAiDecisions] activePlayers:",
        activePlayers.map((p) => p.id)
      )
      console.log(
        "[processAiDecisions] disabledPlayers:",
        disabledPlayers.map((p) => p.id)
      )
      aiPlayers.forEach((p) => {
        const canUse = this.canUseLlmDecisionForPlayer(p.id)
        const isEnabled = this.isAiLlmEnabledForPlayer(p.id)
        const globalEnabled = this.canUseLlmDecision()
        console.log(
          `[processAiDecisions] ${p.id} canUseLlmDecisionForPlayer=${canUse}, isAiLlmEnabledForPlayer=${isEnabled}, globalEnabled=${globalEnabled}`
        )
      })

      if (activePlayers.length === 0 && disabledPlayers.length === 0) {
        console.log("[processAiDecisions] NO ai players, returning early")
        return
      }

      const batchStartTime = Date.now()
      const batchId = `decision-${batchStartTime}-${Math.random().toString(16).slice(2, 6)}`
      console.log(
        `[processAiDecisions] ${batchId} START, activePlayers: ${activePlayers.length}, disabledPlayers: ${disabledPlayers.length}`
      )

      const roundProgress = GAME_SETTINGS.maxRounds <= 1 ? 1 : (this.round - 1) / (GAME_SETTINGS.maxRounds - 1)

      // 每个AI独立启动，不等待其他AI完成
      const independentPromises = []
      aiPlayers.forEach((player) => {
        const startTime = Date.now()
        console.log(
          `[processAiDecision] ${player.id}-${startTime} START, delay from batch start: ${startTime - batchStartTime}ms`
        )

        // 独立异步任务：完成后立即标记 ready，不用等其他 AI
        const taskPromise = (async () => {
          try {
            let plan = null
            let llmPlan = null

            if (activePlayers.includes(player)) {
              llmPlan = await this.requestAiLlmPlan(player, { batchId, batchStartTime })
              this.aiLlmRoundPlans[player.id] = llmPlan

              if (llmPlan && !llmPlan.failed && llmPlan.hasBidDecision) {
                this.llmEverUsedThisRun = true
                plan = {
                  actionType: llmPlan.actionType,
                  actionId: llmPlan.actionId,
                  expectedReveal: 0,
                  score: 1,
                  candidates: [],
                  decisionSource: "llm",
                  lockedByLlm: true
                }
              }
            }

            await this.processSingleAiIntelAction(player, plan, llmPlan, roundProgress, batchId, startTime)

            const endTime = Date.now()
            console.log(`[processAiDecision] ${player.id}-${startTime} END, elapsed: ${endTime - startTime}ms`)
          } catch (error) {
            console.error(`[processAiDecision] ${player.id}-${startTime} error:`, error)
            const errorMsg = error && error.message ? error.message : "未知异常"
            setPlayerLlmError(this, player.id, errorMsg, "EXCEPTION")
            showAiErrorToast(player.name, parseLlmError(errorMsg, "EXCEPTION").brief)
          } finally {
            this.setPlayerBidReady(player.id, true)
            this.updateHud()

            if (!this.isLanMode && !this.roundResolving && !this.settled && !this.roundPaused) {
              const allReady = this.areAllPlayersBidReady()
              console.log(
                `[processAiDecision] ${player.id} finally: areAllPlayersBidReady=${allReady}, roundResolving=${this.roundResolving}, settled=${this.settled}`
              )
              if (allReady) {
                console.log("[processAiDecision] ALL PLAYERS READY, calling resolveRoundBids")
                this.resolveRoundBids("all-ready")
              }
            }

            if (this.isLanMode && this.lanIsHost && this.lanBridge) {
              const readyAiPlayers = aiPlayers.filter((p) => this.roundBidReadyState[p.id])
              if (readyAiPlayers.length === aiPlayers.length) {
                this.lanBridge.send({
                  type: "lan:ai-bids-ready",
                  aiPlayerIds: this.lanAiPlayers.map((ai) => ai.id)
                })
              }
            }
          }
        })()
        independentPromises.push(taskPromise)
      })

      // 存储所有 AI 任务的 Promise.all，供 LAN 模式等待
      this.aiRoundDecisionPromise = Promise.all(independentPromises).then(() => {
        // 所有 AI 任务完成，隐藏思考指示器
        const indicator = this.dom && this.dom.aiThinkingIndicator
        if (indicator) {
          indicator.classList.add("hidden")
          delete indicator.dataset.aiThinking
        }

        // 输出 summary 日志
        if (this.lastAiIntelActions.length > 0) {
          const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
          this.writeLog(`他人情报行动：${text}`)
        }

        const summary = []
        let actualModel2 = ""
        activePlayers.forEach((player) => {
          const plan = this.aiLlmRoundPlans[player.id]
          if (!plan) {
            summary.push(`${player.name}:失败(无计划)`)
            return
          }
          if (plan.model && !actualModel2) actualModel2 = plan.model
          if (plan.failed) {
            summary.push(`${player.name}:失败(${plan.error || "未知"})`)
            return
          }
          if (!plan.hasBidDecision) {
            summary.push(`${player.name}:出价无效(hasBidDecision=false)`)
            return
          }
          const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
          summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
        })

        disabledPlayers.forEach((player) => {
          summary.push(`${player.name}:规则AI(开关关闭)`)
        })

        if (summary.length > 0) {
          const settings = typeof this.getLlmSettings === "function" ? this.getLlmSettings() : LLM_SETTINGS
          const modelName = actualModel2 || (settings && settings.model) || "大模型"
          this.writeLog(`${modelName}决策：${summary.join("；")}`)
        }
      })
    },

    _flushAiDecisionSummary(activePlayers, disabledPlayers) {
      if (!this._aiDecisionSummaryWaiting) return
      this._aiDecisionSummaryWaiting = false

      if (this.lastAiIntelActions.length > 0) {
        const text = this.lastAiIntelActions.map((entry) => this.formatAiIntelActionPublicLine(entry)).join("；")
        this.writeLog(`他人情报行动：${text}`)
      }

      const summary = []
      activePlayers.forEach((player) => {
        const plan = this.aiLlmRoundPlans[player.id]
        if (!plan) {
          summary.push(`${player.name}:失败(无计划)`)
          return
        }
        if (plan.failed) {
          summary.push(`${player.name}:失败(${plan.error || "未知"})`)
          return
        }
        if (!plan.hasBidDecision) {
          summary.push(`${player.name}:出价无效(hasBidDecision=false)`)
          return
        }
        const actionName = plan.actionId !== "none" ? this.getActionDefById(plan.actionId).name : "无"
        summary.push(`${player.name}:出价${plan.bid} 计划动作${actionName}`)
      })

      disabledPlayers.forEach((player) => {
        summary.push(`${player.name}:规则AI(开关关闭)`)
      })

      if (summary.length > 0) {
        const actualModels = new Set()
        activePlayers.forEach((player) => {
          const plan = this.aiLlmRoundPlans[player.id]
          if (plan && !plan.failed && plan.model) {
            actualModels.add(plan.model)
          }
        })
        const modelName = actualModels.size > 0 ? [...actualModels].join("/") : "大模型"
        this.writeLog(`${modelName}决策：${summary.join("；")}`)
      }
    },

    captureAiDecisionTelemetry(roundBids) {
      const aiPlayers = this.players.filter((player) => !player.isHuman)
      const hasLlm = aiPlayers.some((player) => Boolean(this.aiLlmRoundPlans[player.id]))

      if (!hasLlm) {
        this.lastAiDecisionTelemetry = {
          mode: "rule",
          round: this.round
        }
        return
      }

      const rulePayload = this.aiEngine.getLastDecisionLog()
      const ruleEntryById = new Map(
        ((rulePayload && rulePayload.entries) || []).map((entry) => [entry.playerId, entry])
      )

      const bidByPlayerId = new Map((roundBids || []).map((entry) => [entry.playerId, Number(entry.bid) || 0]))
      const entries = aiPlayers.map((player) => {
        const plan = this.aiLlmRoundPlans[player.id] || null
        const llmSeatEnabled = this.canUseLlmDecisionForPlayer(player.id)
        const ruleEntry = ruleEntryById.get(player.id)
        const finalBid = bidByPlayerId.has(player.id)
          ? bidByPlayerId.get(player.id)
          : ruleEntry
            ? ruleEntry.finalBid
            : 0
        const executedActions = this.currentRoundUsage[player.id] || []
        const llmExecutedActionId = plan && plan.actionExecuted ? plan.toolActionId || plan.actionId || "" : ""
        const hasLlmExecutedAction = Boolean(llmExecutedActionId) && executedActions.includes(llmExecutedActionId)
        const llmActionName = hasLlmExecutedAction ? this.getActionDefById(llmExecutedActionId).name : ""
        const ruleActionIds = executedActions.filter((actionId) => actionId !== llmExecutedActionId)
        const ruleActionName =
          ruleActionIds.length > 0
            ? ruleActionIds.map((actionId) => this.getActionDefById(actionId).name).join("、")
            : ""
        const actualModel = plan && plan.model ? plan.model : ""
        const decisionSource =
          !plan || !llmSeatEnabled ? "规则AI" : plan.failed ? "规则AI回退" : actualModel || "大模型"

        return {
          playerId: player.id,
          playerName: player.name,
          finalBid,
          folded: Boolean(plan && plan.folded),
          decisionSource,
          llmActionName,
          ruleActionName,
          actionExecuted: hasLlmExecutedAction,
          controlMode:
            plan && plan.controlMode
              ? plan.controlMode
              : plan && !plan.failed && plan.hasBidDecision && llmSeatEnabled
                ? "llm"
                : "rule",
          thought: plan && plan.thought ? plan.thought : "",
          reasoningContent: plan && plan.reasoningContent ? plan.reasoningContent : "",
          error: plan && plan.failed ? plan.error || "未知错误" : "",
          fallbackRuleBid: plan && !plan.failed && plan.hasBidDecision ? null : ruleEntry ? ruleEntry.finalBid : null,
          systemPrompt: plan && plan.systemPrompt ? plan.systemPrompt : "",
          userPrompt: plan && plan.userPrompt ? plan.userPrompt : "",
          modelResponse: plan && plan.modelResponse ? plan.modelResponse : "",
          toolResultSummary: plan && plan.actionExecuted && plan.toolResultSummary ? plan.toolResultSummary : "",
          followupPrompt: plan && plan.followupPrompt ? plan.followupPrompt : "",
          followupResponse: plan && plan.followupResponse ? plan.followupResponse : "",
          followupError: plan && plan.followupError ? plan.followupError : "",
          followupActionRejected: plan && plan.followupActionRejected ? plan.followupActionRejected : "",
          correctionAttempt: plan && plan.correctionAttempt ? plan.correctionAttempt : 0,
          originalError: plan && plan.originalError ? plan.originalError : "",
          errorCorrectionPrompt: plan && plan.errorCorrectionPrompt ? plan.errorCorrectionPrompt : "",
          errorCorrectionResponse: plan && plan.errorCorrectionResponse ? plan.errorCorrectionResponse : "",
          historyMessagesCount: plan && plan.historyMessagesCount ? plan.historyMessagesCount : 0,
          crossGameMemoryCount: plan && plan.crossGameMemoryCount ? plan.crossGameMemoryCount : 0,
          inGameHistoryCount: plan && plan.inGameHistoryCount ? plan.inGameHistoryCount : 0,
          historyMessagesPreview: plan && plan.historyMessagesPreview ? plan.historyMessagesPreview : "",
          crossGameMemoryText: plan && plan.crossGameMemoryText ? plan.crossGameMemoryText : "",
          cacheHitTokens: plan && plan.cacheHitTokens ? plan.cacheHitTokens : 0,
          cacheMissTokens: plan && plan.cacheMissTokens ? plan.cacheMissTokens : 0,
          cacheHitRate: plan && plan.cacheHitRate ? plan.cacheHitRate : 0,
          usage: plan && plan.usage ? plan.usage : null
        }
      })

      this.lastAiDecisionTelemetry = {
        mode: "llm",
        round: this.round,
        entries
      }
    }
  }

  return {
    methods,
    loadAiLlmPlayerSwitches,
    saveAiLlmPlayerSwitches
  }
}

// 兼容层：保持 window.MobaoSceneLlm 全局变量可用
window.MobaoSceneLlm = {
  createSceneLlmBridge
}
