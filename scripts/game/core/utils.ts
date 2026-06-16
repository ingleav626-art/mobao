/**
 * @file core/utils.ts
 * @module core/utils
 * @description 全局工具函数库。提供项目各模块共享的通用工具函数（数组/数值/字符串处理、
 *              Phaser 动画封装、AI 情报池初始化、品质相关时长计算等）。
 *
 * @exports window.MobaoUtils - 工具函数库单例（兼容）
 * @exports shuffle, delay, clamp, ... - 命名导出
 *
 * @requires core/utils - 工具函数库
 */

import type { AiPrivateIntelPool } from "../../types/ai"

export function shuffle<T>(list: T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function tweenToPromise(scene: any, targets: any, config: any): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.add({
      targets,
      ...config,
      onComplete: () => resolve()
    })
  })
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function roundToStep(value: number, step: number): number {
  const safeStep = Math.max(1, Math.round(Number(step) || 1))
  const num = Number(value) || 0
  return Math.round(num / safeStep) * safeStep
}

export function toCellKey(x: number, y: number): string {
  return `${x},${y}`
}

export function fromCellKey(key: string): { x: number; y: number } | null {
  const [xRaw, yRaw] = String(key || "").split(",")
  const x = Number(xRaw)
  const y = Number(yRaw)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x, y }
}

export function sizeTagToCellCount(sizeTag: string): number | null {
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

export function formatTrackIndex(index: number): string {
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

export function rgbHex(numberColor: number): string {
  return `#${numberColor.toString(16).padStart(6, "0")}`
}

export function trimTrailingZero(value: string | number): string {
  return String(value).replace(/\.0$/, "")
}

export function formatCompactNumber(value: number): string {
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

export function formatBidRevealNumber(value: number): string {
  const num = Math.round(Number(value) || 0)
  const abs = Math.abs(num)
  if (abs >= 1_000_000) {
    return formatCompactNumber(num)
  }
  return num.toLocaleString("zh-CN")
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function compactOneLine(value: string, maxLength: number = 120): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...`
}

export function compactPanelText(value: string, maxLength: number): string {
  const text = String(value || "").trim()
  if (!text) {
    return "(empty)"
  }
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}\n...(truncated)`
}

export function indentMultiline(value: string, indent: string): string {
  return String(value || "")
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n")
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

export function safeParseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch (_error) {
    return null
  }
}

export function tryExtractDecisionJson(rawText: string): any {
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

export function pickFirstDefined(...values: any[]): any {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value
    }
  }
  return null
}

export function createEmptyAiPrivateIntelPool(): AiPrivateIntelPool {
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

export function qualityPulseDuration(qualityKey: string): number {
  switch (qualityKey) {
    case "legendary": return 380
    case "rare": return 520
    case "fine": return 660
    case "normal": return 760
    default: return 880
  }
}

export function settlementRevealDelayByQuality(qualityKey: string): number {
  const multiplier = 1
  switch (qualityKey) {
    case "legendary": return Math.round(360 * multiplier)
    case "rare": return Math.round(320 * multiplier)
    case "fine": return Math.round(280 * multiplier)
    case "normal": return Math.round(240 * multiplier)
    case "poor": return Math.round(220 * multiplier)
    default: return Math.round(260 * multiplier)
  }
}

export function settlementSearchDurationByQuality(qualityKey: string): number {
  const multiplier = 1
  switch (qualityKey) {
    case "legendary": return Math.round(1250 * multiplier)
    case "rare": return Math.round(920 * multiplier)
    case "fine": return Math.round(680 * multiplier)
    case "normal": return Math.round(500 * multiplier)
    case "poor": return Math.round(360 * multiplier)
    default: return Math.round(540 * multiplier)
  }
}