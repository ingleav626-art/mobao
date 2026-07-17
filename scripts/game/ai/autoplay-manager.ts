/**
 * @file autoplay-manager.ts
 * @module ai/autoplay-manager
 * @description AutoPlayManager — AI 托管薄协调器。
 *             玩家 p2 可在手动/AI 托管间切换。
 *             管理者只持有 isEnabled 状态，行为委托给子模块。
 */
import { createLogger } from "../core/logger"
const log = createLogger("AutoPlay")

const STORAGE_KEY = "mobao_autoplay_enabled"

function loadPersisted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function savePersisted(v: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
  } catch {
    // 无痕模式等不可写 localStorage
  }
}

export interface AutoPlayManagerDeps {
  isLanMode: () => boolean
  updateHud: () => void
  getRound: () => number
  canUseLlmDecision: () => boolean
  /** p2 的对话记忆（仅写入，不读取） */
  getP2Conversation: () => { round: number; bid: number; skill: string; item: string; thought: string; result: string }[]
  setP2Conversation: (v: { round: number; bid: number; skill: string; item: string; thought: string; result: string }[]) => void
}

export class AutoPlayManager {
  private enabled: boolean

  constructor(private readonly deps: AutoPlayManagerDeps) {
    this.enabled = loadPersisted()
  }

  isActive(): boolean {
    return this.enabled && !this.deps.isLanMode()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** 翻转状态，返回新值。联机模式或 LLM 未启用时不可开启。 */
  toggle(): boolean {
    if (this.deps.isLanMode()) {
      log.info("toggle blocked: LAN mode")
      return false
    }
    if (!this.enabled && !this.deps.canUseLlmDecision()) {
      log.info("toggle blocked: LLM disabled")
      return false
    }
    this.enabled = !this.enabled
    savePersisted(this.enabled)
    this.deps.updateHud()
    log.info(`toggle: enabled=${this.enabled}`)
    return this.enabled
  }

  /** resetForNewRun 时从持久化恢复（不重置用户选择） */
  resetForNewRun(): void {
    this.enabled = loadPersisted()
  }

  /** 静默记录：玩家手动出价时写入 p2 对话记忆（非托管模式） */
  recordPlayerBid(amount: number): void {
    if (this.isActive()) return
    const conv = this.deps.getP2Conversation()
    const round = this.deps.getRound()
    const last = conv[conv.length - 1]
    if (last && last.round === round) {
      last.bid = Math.round(amount)
    } else {
      conv.push({ round, bid: Math.round(amount), skill: "无", item: "无", thought: "玩家手动操作", result: "" })
    }
    this.deps.setP2Conversation(conv)
    log.debug("recordPlayerBid:", amount)
  }

  /** 静默记录：玩家使用技能/道具时写入 p2 对话记忆（非托管模式） */
  recordPlayerSkill(actionId: string, isItem: boolean): void {
    if (this.isActive()) return
    const conv = this.deps.getP2Conversation()
    const round = this.deps.getRound()
    const last = conv[conv.length - 1]
    const field = isItem ? "item" : "skill"
    if (last && last.round === round) {
      ;(last as Record<string, unknown>)[field] = actionId
    } else {
      const entry = { round, bid: 0, skill: "无", item: "无", thought: "玩家手动操作", result: "" }
      ;(entry as Record<string, unknown>)[field] = actionId
      conv.push(entry)
    }
    this.deps.setP2Conversation(conv)
    log.debug("recordPlayerSkill:", actionId, isItem)
  }
}
