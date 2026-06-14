/**
 * @file ai/game-history.ts
 * @module ai/game-history
 * @description AI 多局历史存储系统。管理 AI 玩家最近 N 局的完整对局记录，
 *              支持逐局存储、滑动窗口裁剪、以及为 LLM 构建多局上下文。
 *
 * 数据结构：
 *   GameRecord: 单局完整记录（结果、出价、品质、反思等）
 *   GameHistoryStore: { records: GameRecord[], version: string }
 *
 * @exports window.MobaoGameHistory
 */

const GAME_HISTORY_STORAGE_KEY = "mobao_ai_game_history_v1"
const MAX_RECORDS_DEFAULT = 20

export interface GameRecord {
  run: number
  winnerId: string | null
  winnerName: string
  winnerBid: number
  totalValue: number
  winnerProfit: number
  reasonText: string
  dividendTicket: { mechanism: string; dividendPerPlayer: number; ticketPerPlayer: number } | null
  qualityCounts: Record<string, number>
  totalItems: number
  totalCells: number
  roundBids: Array<{ round: number; playerId: string; playerName: string; bid: number }>
  reflection: string | null
  aiDecisions: Array<{
    round: number
    bid: number | null
    skill: string
    item: string
    thought: string
    result: string
  }>
  timestamp: number
}

interface GameHistoryStore {
  records: GameRecord[]
  version: string
}

function loadStore(playerId: string, isLan: boolean): GameHistoryStore {
  const key = isLan ? `${GAME_HISTORY_STORAGE_KEY}_lan_${playerId}` : `${GAME_HISTORY_STORAGE_KEY}_${playerId}`
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return { records: [], version: "v1" }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.records)) {
      return { records: [], version: "v1" }
    }
    return { records: parsed.records, version: parsed.version || "v1" }
  } catch {
    return { records: [], version: "v1" }
  }
}

function saveStore(playerId: string, store: GameHistoryStore, isLan: boolean): void {
  const key = isLan ? `${GAME_HISTORY_STORAGE_KEY}_lan_${playerId}` : `${GAME_HISTORY_STORAGE_KEY}_${playerId}`
  try {
    window.localStorage.setItem(key, JSON.stringify(store))
  } catch { /* quota exceeded, ignore */ }
}

function trimToWindow(records: GameRecord[], maxRecords: number): GameRecord[] {
  if (records.length <= maxRecords) return records
  return records.slice(records.length - maxRecords)
}

function buildContextBlock(record: GameRecord): string {
  const lines: string[] = []
  lines.push(`${record.winnerName}以${record.winnerBid}中标，总值${record.totalValue}，利润${record.winnerProfit >= 0 ? "+" : ""}${record.winnerProfit}`)

  if (record.dividendTicket) {
    const dt = record.dividendTicket
    if (dt.mechanism === "dividend") {
      lines.push(`分红+${dt.dividendPerPlayer}`)
    } else if (dt.mechanism === "ticket") {
      lines.push(`门票-${dt.ticketPerPlayer}`)
    }
  }

  const qc = record.qualityCounts
  lines.push(`粗${qc.poor || 0} 良${qc.normal || 0} 精${qc.fine || 0} 珍${qc.rare || 0} 绝${qc.legendary || 0} | ${record.totalItems}件 ${record.totalCells}格`)

  if (record.aiDecisions && record.aiDecisions.length > 0) {
    record.aiDecisions.forEach((d) => {
      const parts = [`R${d.round}`]
      if (d.bid != null) parts.push(`${d.bid}`)
      if (d.skill !== "无") parts.push(d.skill)
      if (d.item !== "无") parts.push(d.item)
      if (d.thought) parts.push(d.thought.slice(0, 60))
      lines.push(parts.join(" "))
    })
  }

  if (record.reflection) {
    lines.push(`反思:${record.reflection}`)
  }

  return lines.join("\n")
}

export const MobaoGameHistory = {
  load(playerId: string, isLan: boolean = false): GameRecord[] {
    return loadStore(playerId, isLan).records
  },

  append(playerId: string, record: GameRecord, maxRecords: number = MAX_RECORDS_DEFAULT, isLan: boolean = false): void {
    const store = loadStore(playerId, isLan)
    store.records.push(record)
    store.records = trimToWindow(store.records, maxRecords)
    saveStore(playerId, store, isLan)
  },

  clear(playerId: string, isLan: boolean = false): void {
    saveStore(playerId, { records: [], version: "v1" }, isLan)
  },

  clearAll(): void {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(GAME_HISTORY_STORAGE_KEY)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  },

  getCount(playerId: string, isLan: boolean = false): number {
    return loadStore(playerId, isLan).records.length
  },

  buildContextMessages(playerId: string, maxGames: number, isLan: boolean = false): Array<{ role: string; content: string }> {
    const records = loadStore(playerId, isLan).records
    if (records.length === 0) return []

    const recent = records.slice(-maxGames)
    const blocks = recent.map(buildContextBlock)
    const content = `【跨局历史】\n${blocks.join("\n---\n")}`

    return [{ role: "user", content }]
  },

  buildReflectionContext(playerId: string, scope: string, currentRecord: GameRecord | null, isLan: boolean = false): string {
    if (scope === "current") {
      return currentRecord ? buildContextBlock(currentRecord) : ""
    }

    const records = loadStore(playerId, isLan).records
    if (records.length === 0) return currentRecord ? buildContextBlock(currentRecord) : ""

    const blocks = records.map(buildContextBlock)
    return blocks.join("\n---\n")
  },

  exportToJson(playerId: string, isLan: boolean = false): string {
    const store = loadStore(playerId, isLan)
    return JSON.stringify(store, null, 2)
  },

  importFromJson(playerId: string, json: string, isLan: boolean = false): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(json)
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.records)) {
        return { ok: false, error: "无效的JSON格式" }
      }
      const store: GameHistoryStore = {
        records: parsed.records.filter((r: unknown) => r && typeof (r as { run?: unknown }).run === "number"),
        version: "v1"
      }
      saveStore(playerId, store, isLan)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: "JSON解析失败: " + ((e as Error).message || "未知错误") }
    }
  }
}

  ; (window as unknown as Record<string, unknown>).MobaoGameHistory = MobaoGameHistory
