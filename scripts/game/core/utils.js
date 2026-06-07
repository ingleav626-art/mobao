/**
 * @file core/utils.js
 * @module core/utils
 * @description 全局工具函数库。采用 ES Module 模式，同时挂载到 window.MobaoUtils 保持兼容。
 *              提供项目各模块共享的通用工具函数，包括数组/数值/字符串处理、
 *              Phaser 动画封装、AI 情报池初始化、品质相关时长计算等。
 *              是整个项目的基础依赖层，几乎所有模块都引用此文件。
 *
 * 函数分类：
 *
 * 通用工具：
 *   - shuffle(list): Fisher-Yates 洗牌，返回新数组
 *   - delay(ms): Promise 化的 setTimeout
 *   - tweenToPromise(scene, targets, config): Promise 化的 Phaser tween
 *   - clamp(value, min, max): 数值截断
 *   - roundToStep(value, step): 按步长取整
 *   - pickFirstDefined(...values): 取第一个非 null/undefined 的值
 *
 * 网格/坐标：
 *   - toCellKey(x, y): 坐标转字符串键 "x,y"
 *   - fromCellKey(key): 字符串键转坐标对象 { x, y }
 *   - sizeTagToCellCount(sizeTag): 尺寸标签 "3x2" 转格子数 6
 *
 * 格式化：
 *   - formatTrackIndex(index): 数字转中文（一~十+）
 *   - rgbHex(numberColor): Phaser 数字颜色转 CSS hex 字符串
 *   - formatCompactNumber(value): 紧凑数字（1.5M, 23k）
 *   - formatBidRevealNumber(value): 出价显示（≥1M 用紧凑格式，否则千分位）
 *   - trimTrailingZero(value): 去掉 ".0" 后缀
 *
 * 字符串/HTML：
 *   - escapeHtml(value): HTML 转义
 *   - compactOneLine(value, maxLength): 单行压缩
 *   - compactPanelText(value, maxLength): 面板文本截断
 *   - indentMultiline(value, indent): 多行缩进
 *
 * AI/LLM 辅助：
 *   - normalizeActionToken(value): 动作名归一化（去空格/标点/小写）
 *   - isNoneActionText(value): 判断是否为"无操作"文本
 *   - safeParseJson(text): 安全 JSON 解析
 *   - tryExtractDecisionJson(rawText): 从 LLM 回复中提取 JSON（直接/代码块/首尾花括号）
 *   - createEmptyAiPrivateIntelPool(): 创建空 AI 私有情报池
 *
 * 品质时长：
 *   - qualityPulseDuration(qualityKey): 品质脉冲动画时长
 *   - settlementRevealDelayByQuality(qualityKey): 结算揭示延迟（受速度倍率影响）
 *   - settlementSearchDurationByQuality(qualityKey): 结算搜索动画时长（受速度倍率影响）
 *
 * @requires MobaoSettings - 品质时长函数中读取 settlementSpeedMultiplier
 *
 * @exports window.MobaoUtils - 工具函数库单例（兼容）
 * @exports shuffle, delay, clamp, ... - 命名导出
 */

export function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function tweenToPromise(scene, targets, config) {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets,
      ...config,
      onComplete: () => resolve()
    })
  })
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function roundToStep(value, step) {
  const safeStep = Math.max(1, Math.round(Number(step) || 1))
  const num = Number(value) || 0
  return Math.round(num / safeStep) * safeStep
}

export function toCellKey(x, y) {
  return `${x},${y}`
}

export function fromCellKey(key) {
  const [xRaw, yRaw] = String(key || "").split(",")
  const x = Number(xRaw)
  const y = Number(yRaw)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x, y }
}

export function sizeTagToCellCount(sizeTag) {
  const text = String(sizeTag || "").trim()
  const match = text.match(/^(\d+)x(\d+)$/i)
  if (!match) {
    return null
  }
  const w = Number(match[1])
  const h = Number(match[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null
  }
  return w * h
}

export function formatTrackIndex(index) {
  const map = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
  const value = Math.max(1, Math.round(Number(index) || 1))
  if (value <= 10) {
    return map[value]
  }
  if (value < 20) {
    return `十${map[value - 10]}`
  }
  return String(value)
}

export function rgbHex(numberColor) {
  return `#${numberColor.toString(16).padStart(6, "0")}`
}

export function trimTrailingZero(value) {
  return String(value).replace(/\.0$/, "")
}

export function formatCompactNumber(value) {
  const num = Number(value) || 0
  const abs = Math.abs(num)

  if (abs >= 1_000_000) {
    const m = num / 1_000_000
    return `${trimTrailingZero(m.toFixed(m >= 10 || m <= -10 ? 0 : 1))}M`
  }

  if (abs >= 1_000) {
    const k = num / 1_000
    return `${trimTrailingZero(k.toFixed(k >= 10 || k <= -10 ? 0 : 1))}k`
  }

  return String(Math.round(num))
}

export function formatBidRevealNumber(value) {
  const num = Math.round(Number(value) || 0)
  const abs = Math.abs(num)
  if (abs >= 1_000_000) {
    return formatCompactNumber(num)
  }
  return num.toLocaleString("zh-CN")
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function compactOneLine(value, maxLength = 120) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...`
}

export function compactPanelText(value, maxLength) {
  const text = String(value || "").trim()
  if (!text) {
    return "(empty)"
  }
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}\n...(truncated)`
}

export function indentMultiline(value, indent) {
  return String(value || "")
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n")
}

export function normalizeActionToken(value) {
  return String(value || "")
    .replace(/[\s\-—_：:（）()]/g, "")
    .toLowerCase()
}

export function isNoneActionText(value) {
  const text = normalizeActionToken(value)
  return ["无", "不使用", "none", "null", "nil", "na"].some((entry) => text === normalizeActionToken(entry))
}

export function safeParseJson(text) {
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

export function tryExtractDecisionJson(rawText) {
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

export function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value
    }
  }
  return null
}

export function createEmptyAiPrivateIntelPool() {
  return {
    knownOutlineIds: new Set(),
    knownQualityIds: new Set(),
    outlineSignals: [],
    qualitySignals: [],
    signalHistory: [],
    latestSignalStats: null,
    aggregateStats: null,
    knownCellStates: {},
    itemKnowledge: {},
    highValueTrackByItemId: {},
    highValueTracks: [],
    nextTrackIndex: 1
  }
}

export function qualityPulseDuration(qualityKey) {
  switch (qualityKey) {
    case "legendary":
      return 380
    case "rare":
      return 520
    case "fine":
      return 660
    case "normal":
      return 760
    default:
      return 880
  }
}

export function settlementRevealDelayByQuality(qualityKey) {
  const multiplier = window.MobaoSettings ? window.MobaoSettings.GAME_SETTINGS.settlementSpeedMultiplier : 1
  switch (qualityKey) {
    case "legendary":
      return Math.round(360 * multiplier)
    case "rare":
      return Math.round(320 * multiplier)
    case "fine":
      return Math.round(280 * multiplier)
    case "normal":
      return Math.round(240 * multiplier)
    case "poor":
      return Math.round(220 * multiplier)
    default:
      return Math.round(260 * multiplier)
  }
}

export function settlementSearchDurationByQuality(qualityKey) {
  const multiplier = window.MobaoSettings ? window.MobaoSettings.GAME_SETTINGS.settlementSpeedMultiplier : 1
  switch (qualityKey) {
    case "legendary":
      return Math.round(1250 * multiplier)
    case "rare":
      return Math.round(920 * multiplier)
    case "fine":
      return Math.round(680 * multiplier)
    case "normal":
      return Math.round(500 * multiplier)
    case "poor":
      return Math.round(360 * multiplier)
    default:
      return Math.round(540 * multiplier)
  }
}

// 兼容层：保持 window.MobaoUtils 全局变量可用
window.MobaoUtils = {
  shuffle,
  delay,
  tweenToPromise,
  clamp,
  roundToStep,
  toCellKey,
  fromCellKey,
  sizeTagToCellCount,
  formatTrackIndex,
  rgbHex,
  trimTrailingZero,
  formatCompactNumber,
  formatBidRevealNumber,
  escapeHtml,
  compactOneLine,
  compactPanelText,
  indentMultiline,
  normalizeActionToken,
  isNoneActionText,
  safeParseJson,
  tryExtractDecisionJson,
  pickFirstDefined,
  createEmptyAiPrivateIntelPool,
  qualityPulseDuration,
  settlementRevealDelayByQuality,
  settlementSearchDurationByQuality
}